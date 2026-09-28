import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateStepModuleBytes } from "../apps/api/src/step-module.js";
import {
  CrashRecoveryEvidenceSchema,
  ImportRejectionEvidenceSchema,
  LocalRunnerParityEvidenceSchema,
  MeteringEvidenceSchema,
  ReplayDeterminismEvidenceSchema,
  WarmStartEvidenceSchema,
} from "./server-authority-evidence.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = path.join(root, "artifacts", "server-authority");

function uleb(value: number): number[] {
  const bytes: number[] = [];
  let remaining = value;
  do {
    let byte = remaining & 0x7f;
    remaining >>>= 7;
    if (remaining !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (remaining !== 0);
  return bytes;
}

function encodeName(name: string): number[] {
  const bytes = [...Buffer.from(name)];
  return [...uleb(bytes.length), ...bytes];
}

function moduleWithImport(moduleName: string, fieldName: string): Uint8Array {
  const entry = [
    ...encodeName(moduleName),
    ...encodeName(fieldName),
    0, // function import
    ...uleb(0), // type index
  ];
  const exportEntry = [...encodeName("step"), 0, ...uleb(0)];
  const importSection = [2, ...uleb(1 + entry.length), ...uleb(1), ...entry];
  const exportSection = [7, ...uleb(1 + exportEntry.length), ...uleb(1), ...exportEntry];
  return Uint8Array.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, ...importSection, ...exportSection]);
}

const generatedAt = new Date().toISOString();
await mkdir(evidenceDir, { recursive: true });

execFileSync("go", ["test", "-count=1", "-run", "TestWriteServerAuthorityEvidence", "-timeout", "60s"], {
  cwd: path.join(root, "infra", "worker"),
  env: { ...process.env, LOKI_GATE_EVIDENCE_DIR: evidenceDir },
  stdio: "inherit",
});

const categories = [
  ["wasi", "wasi_snapshot_preview1", "fd_write"],
  ["socket", "wasi_snapshot_preview1", "sock_accept"],
  ["environment", "wasi_snapshot_preview1", "environ_get"],
] as const;
const rejections = categories.map(([category, moduleName, field]) => {
  let rejectionReason = "";
  try {
    validateStepModuleBytes(moduleWithImport(moduleName, field));
  } catch (error) {
    rejectionReason = error instanceof Error ? error.message : String(error);
  }
  if (!rejectionReason.includes("import")) {
    throw new Error(`${category} was not rejected before scheduling`);
  }
  return { category, rejectedBeforeScheduling: true as const, rejectionReason };
});
await writeFile(
  path.join(evidenceDir, "import-rejection.json"),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      generatedAt,
      environment: "local-darwin-arm64",
      rejections,
      sourceReferences: ["apps/api/src/step-module.ts", "infra/worker/validate.go"],
    },
    null,
    2,
  )}\n`,
);

const demonstratedKills: string[] = [];
for (const kind of ["fuel", "memory"]) {
  const output = execFileSync("go", ["run", ".", "kill-demo", kind], {
    cwd: path.join(root, "infra", "worker"),
    encoding: "utf8",
  });
  if (!output.includes(`killed kind=${kind}`)) {
    throw new Error(`local runner did not show a ${kind} kill: ${output}`);
  }
  demonstratedKills.push(kind);
}
await writeFile(
  path.join(evidenceDir, "local-runner.json"),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      generatedAt,
      environment: "local-darwin-arm64",
      localRunnerVersion: "infra/worker kill-demo",
      demonstratedKills,
      sourceReferences: ["infra/worker/main.go"],
    },
    null,
    2,
  )}\n`,
);

const evidenceFiles = [
  ["warm-start", "warm-start.json"],
  ["metering", "metering.json"],
  ["import-rejection", "import-rejection.json"],
  ["crash-recovery", "crash-recovery.json"],
  ["replay-determinism", "replay-determinism.json"],
  ["local-runner-parity", "local-runner.json"],
] as const;

const evidence = [];
for (const [gate, file] of evidenceFiles) {
  const bytes = await readFile(path.join(evidenceDir, file));
  evidence.push({
    gate,
    status: "pass",
    observedAt: generatedAt,
    environment: "local-darwin-arm64",
    evidenceFile: file,
    evidenceSha256: createHash("sha256").update(bytes).digest("hex"),
  });
}

await writeFile(
  path.join(evidenceDir, "manifest.json"),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      scope: "platform-wide",
      generatedAt,
      evidence,
    },
    null,
    2,
  )}\n`,
);

const schemas = {
  "warm-start.json": WarmStartEvidenceSchema,
  "metering.json": MeteringEvidenceSchema,
  "import-rejection.json": ImportRejectionEvidenceSchema,
  "crash-recovery.json": CrashRecoveryEvidenceSchema,
  "replay-determinism.json": ReplayDeterminismEvidenceSchema,
  "local-runner.json": LocalRunnerParityEvidenceSchema,
} as const;
for (const [file, schema] of Object.entries(schemas)) {
  schema.parse(JSON.parse(await readFile(path.join(evidenceDir, file), "utf8")));
}

console.log("Wrote 6 gate evidence files.");
