import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { strToU8, zipSync } from "fflate";
import {
  DeploymentService,
  MemoryArtifactStore,
  MemoryDeploymentRepository,
} from "../apps/api/src/deployments.js";
import { PlatformService } from "../apps/api/src/platform.js";
import { startApiServer } from "../apps/api/src/server.js";
import {
  FileStepModuleStore,
  MemoryStepModuleStore,
  parseStepModule,
  sha256Hex,
  validateStepModuleBytes,
} from "../apps/api/src/step-module.js";

// --- Minimal, hand-encoded WebAssembly binaries -----------------------------
// These exercise only the import/export section shapes the validator reads;
// they are never instantiated, so no type/function/code sections are
// required to make them realistic wasm.

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
  const bytes = [...strToU8(name)];
  return [...uleb(bytes.length), ...bytes];
}

function encodeSection(id: number, payload: number[]): number[] {
  return [id, ...uleb(payload.length), ...payload];
}

function memoryImport(): number[] {
  return [
    ...encodeName("env"),
    ...encodeName("memory"),
    2, // import kind: memory
    0, // limits flags: no maximum
    ...uleb(0), // minimum pages
  ];
}

function functionExport(name: string, functionIndex = 0): number[] {
  return [...encodeName(name), 0 /* export kind: function */, ...uleb(functionIndex)];
}

function buildWasm(options: {
  importCount?: number;
  exportNames?: string[];
}): Uint8Array {
  const sections: number[] = [];
  if (options.importCount) {
    const entries: number[] = [];
    for (let index = 0; index < options.importCount; index += 1) entries.push(...memoryImport());
    sections.push(...encodeSection(2, [...uleb(options.importCount), ...entries]));
  }
  const exportNames = options.exportNames ?? ["step"];
  const exportEntries = exportNames.flatMap((name) => functionExport(name));
  sections.push(...encodeSection(7, [...uleb(exportNames.length), ...exportEntries]));
  return Uint8Array.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, ...sections]);
}

test("FileStepModuleStore survives a new instance reading the same directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loki-step-modules-"));
  const wasm = buildWasm({ exportNames: ["step"] });
  const digest = sha256Hex(wasm);
  const first = new FileStepModuleStore(directory);
  await first.putIfAbsent(digest, wasm);
  await first.putIfAbsent(digest, wasm);
  const second = new FileStepModuleStore(directory);
  const stored = await second.get(digest);
  assert.ok(stored);
  assert.deepEqual([...stored!], [...wasm]);
  assert.equal(await second.get("ab".repeat(32)), undefined);
});

test("parseStepModule counts imports and collects function export names", () => {
  const noImports = buildWasm({ exportNames: ["step"] });
  assert.deepEqual(parseStepModule(noImports), {
    importCount: 0,
    functionExportNames: ["step"],
  });
  const withImport = buildWasm({ importCount: 1, exportNames: ["step"] });
  assert.equal(parseStepModule(withImport).importCount, 1);
  assert.throws(() => parseStepModule(Uint8Array.from([1, 2, 3])), /WebAssembly module/);
});

test("validateStepModuleBytes accepts a single step export with no imports and rejects everything else", () => {
  assert.doesNotThrow(() => validateStepModuleBytes(buildWasm({ exportNames: ["step"] })));
  assert.throws(
    () => validateStepModuleBytes(buildWasm({ importCount: 1, exportNames: ["step"] })),
    /imports/,
  );
  assert.throws(
    () => validateStepModuleBytes(buildWasm({ exportNames: ["main"] })),
    /export exactly one function, "step"/,
  );
  assert.throws(
    () => validateStepModuleBytes(buildWasm({ exportNames: ["step", "extra"] })),
    /export exactly one function, "step"/,
  );
  assert.throws(() => validateStepModuleBytes(Uint8Array.from([])), /empty/);
  assert.throws(
    () => validateStepModuleBytes(new Uint8Array(6 * 1024 * 1024)),
    /prototype limit/,
  );
});

function serverManifest(step: { modulePath: string; sha256: string }) {
  return {
    schemaVersion: 1 as const,
    name: "Counter Party",
    entrypoint: "index.html",
    multiplayer: {
      enabled: true,
      authority: "server" as const,
      maxPlayers: 8,
      tickRate: 10,
      step: { abiVersion: 1 as const, ...step },
    },
    networkAllowlist: [],
  };
}

function buildZip(files: Record<string, Uint8Array | string>): Uint8Array {
  return zipSync(
    Object.fromEntries(
      Object.entries(files).map(([name, value]) => [
        name,
        typeof value === "string" ? strToU8(value) : value,
      ]),
    ),
  );
}

function setupProject() {
  const platform = new PlatformService();
  const creator = platform.registerCreator("creator@example.test", "Studio");
  platform.assignPlan(creator.account.id, "loki");
  const project = platform.createProject(
    creator.account.id,
    creator.organization.id,
    { name: "Counter Party", slug: "counter-party" },
  );
  platform.transitionProject(creator.account.id, project.id, "private");
  return { platform, creator, project };
}

test("deployZip accepts a valid server-authority module and stores it by hash", async () => {
  const { platform, creator, project } = setupProject();
  const stepModules = new MemoryStepModuleStore();
  const deployments = new DeploymentService(
    platform,
    new MemoryArtifactStore(),
    new MemoryDeploymentRepository(),
    undefined,
    stepModules,
  );
  const wasm = buildWasm({ exportNames: ["step"] });
  const digest = sha256Hex(wasm);
  const archive = buildZip({
    "game.json": JSON.stringify(serverManifest({ modulePath: "server/step.wasm", sha256: digest })),
    "index.html": "<!doctype html><main>ok</main>",
    "server/step.wasm": wasm,
  });
  const credential = platform.issueDeploymentCredential(creator.account.id, project.id);
  const deployment = await deployments.deployZip({
    credentialId: credential.credentialId,
    secret: credential.secret,
    archive,
  });
  assert.equal(deployment.status, "ready");
  const stored = await stepModules.get(digest);
  assert.ok(stored);
  assert.deepEqual([...stored!], [...wasm]);
});

test("deployZip rejects a missing module, an import, and a hash mismatch", async () => {
  const { platform, creator, project } = setupProject();
  const deployments = new DeploymentService(platform);
  const issue = () => platform.issueDeploymentCredential(creator.account.id, project.id);

  const missing = buildZip({
    "game.json": JSON.stringify(
      serverManifest({ modulePath: "server/step.wasm", sha256: "a".repeat(64) }),
    ),
    "index.html": "<!doctype html><main>ok</main>",
  });
  const missingCredential = issue();
  await assert.rejects(
    () =>
      deployments.deployZip({
        credentialId: missingCredential.credentialId,
        secret: missingCredential.secret,
        archive: missing,
      }),
    /step module server\/step\.wasm is missing/,
  );

  const withImport = buildWasm({ importCount: 1, exportNames: ["step"] });
  const importDigest = sha256Hex(withImport);
  const importArchive = buildZip({
    "game.json": JSON.stringify(
      serverManifest({ modulePath: "server/step.wasm", sha256: importDigest }),
    ),
    "index.html": "<!doctype html><main>ok</main>",
    "server/step.wasm": withImport,
  });
  const importCredential = issue();
  await assert.rejects(
    () =>
      deployments.deployZip({
        credentialId: importCredential.credentialId,
        secret: importCredential.secret,
        archive: importArchive,
      }),
    /imports/,
  );

  const valid = buildWasm({ exportNames: ["step"] });
  const mismatchedArchive = buildZip({
    "game.json": JSON.stringify(
      serverManifest({ modulePath: "server/step.wasm", sha256: "b".repeat(64) }),
    ),
    "index.html": "<!doctype html><main>ok</main>",
    "server/step.wasm": valid,
  });
  const mismatchCredential = issue();
  await assert.rejects(
    () =>
      deployments.deployZip({
        credentialId: mismatchCredential.credentialId,
        secret: mismatchCredential.secret,
        archive: mismatchedArchive,
      }),
    /sha256 does not match/,
  );
});

test("GET /v1/step-modules/:sha256 serves accepted module bytes to the worker fleet, unauthenticated, and 404s an unknown hash", async (t) => {
  const { platform, creator, project } = setupProject();
  const stepModules = new MemoryStepModuleStore();
  const deployments = new DeploymentService(
    platform,
    new MemoryArtifactStore(),
    new MemoryDeploymentRepository(),
    undefined,
    stepModules,
  );
  const wasm = buildWasm({ exportNames: ["step"] });
  const digest = sha256Hex(wasm);
  const archive = buildZip({
    "game.json": JSON.stringify(serverManifest({ modulePath: "server/step.wasm", sha256: digest })),
    "index.html": "<!doctype html><main>ok</main>",
    "server/step.wasm": wasm,
  });
  const credential = platform.issueDeploymentCredential(creator.account.id, project.id);
  await deployments.deployZip({
    credentialId: credential.credentialId,
    secret: credential.secret,
    archive,
  });

  const server = startApiServer(
    {
      platform,
      deployments,
      async authenticateCreator() {
        return creator.account.id;
      },
    },
    0,
  );
  t.after(() => server.close());
  await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  // No Authorization header at all: the worker fleet fetches by hash alone.
  const found = await fetch(`${origin}/v1/step-modules/${digest}`);
  assert.equal(found.status, 200);
  assert.equal(found.headers.get("content-type"), "application/wasm");
  const bytes = new Uint8Array(await found.arrayBuffer());
  assert.deepEqual([...bytes], [...wasm]);

  const missing = await fetch(`${origin}/v1/step-modules/${"0".repeat(64)}`);
  assert.equal(missing.status, 404);

  const malformed = await fetch(`${origin}/v1/step-modules/not-a-hash`);
  assert.equal(malformed.status, 404);
});
