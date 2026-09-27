import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  CrashRecoveryEvidenceSchema,
  ImportRejectionEvidenceSchema,
  LocalRunnerParityEvidenceSchema,
  MeteringEvidenceSchema,
  ReplayDeterminismEvidenceSchema,
  SandboxReviewCostEvidenceSchema,
  WarmStartEvidenceSchema,
} from "./server-authority-evidence.js";

// Verifies the seven gates plan section 6 ("Gates before creators can
// select it") requires before `authority: "server"` may be enabled in
// production (see LOKI_SERVER_AUTHORITY_ENABLED in
// infra/nakama/modules/loki.js and infra/nakama/Dockerfile). This is a
// separate, independent evidence system from
// scripts/verify-release-gates.ts: server authority is an opt-in runtime
// mode a creator selects per game, not part of every platform release, so
// enabling it does not require re-running or blocking on the platform's own
// release gates, and vice versa.

export const requiredServerAuthorityGateIds = [
  "warm-start",
  "metering",
  "import-rejection",
  "crash-recovery",
  "replay-determinism",
  "local-runner-parity",
  "sandbox-review-and-cost",
] as const;

const Evidence = z.object({
  gate: z.enum(requiredServerAuthorityGateIds),
  status: z.literal("pass"),
  observedAt: z.string().datetime({ offset: true }),
  environment: z.string().min(1),
  evidenceFile: z.string().min(1),
  evidenceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  notes: z.string().min(1).optional(),
});

const Manifest = z.object({
  schemaVersion: z.literal(1),
  // A creator-scoped identifier, e.g. "game:<projectId>" or "platform-wide",
  // distinct from scripts/verify-release-gates.ts's platform `release`
  // string: server authority is enabled per game, not per platform release.
  scope: z.string().min(1),
  generatedAt: z.string().datetime({ offset: true }),
  evidence: z.array(Evidence),
});

export type ServerAuthorityGateManifest = z.infer<typeof Manifest>;

function validateTypedEvidence(gate: string, bytes: Buffer): void {
  const value = JSON.parse(bytes.toString("utf8")) as Record<string, unknown>;
  if (gate === "warm-start") WarmStartEvidenceSchema.parse(value);
  if (gate === "metering") MeteringEvidenceSchema.parse(value);
  if (gate === "import-rejection") ImportRejectionEvidenceSchema.parse(value);
  if (gate === "crash-recovery") CrashRecoveryEvidenceSchema.parse(value);
  if (gate === "replay-determinism") ReplayDeterminismEvidenceSchema.parse(value);
  if (gate === "local-runner-parity") LocalRunnerParityEvidenceSchema.parse(value);
  // SandboxReviewCostEvidenceSchema itself enforces operator ===
  // MASTER_OPERATOR_EMAIL and rejects the reviewer self-approving; a schema
  // failure here surfaces as the generic "evidence file unavailable or
  // invalid" failure below, same as any other gate's malformed evidence.
  if (gate === "sandbox-review-and-cost") SandboxReviewCostEvidenceSchema.parse(value);
}

export async function verifyServerAuthorityGates(
  manifestPath: string,
  options: { now?: Date; maxAgeDays?: number } = {},
): Promise<{ scope: string; verified: number }> {
  const absoluteManifest = resolve(manifestPath);
  const manifest = Manifest.parse(
    JSON.parse(await readFile(absoluteManifest, "utf8")),
  );
  const now = options.now ?? new Date();
  const maxAgeMs = (options.maxAgeDays ?? 30) * 24 * 60 * 60 * 1_000;
  const failures: string[] = [];
  const byGate = new Map(manifest.evidence.map((entry) => [entry.gate, entry]));

  for (const gate of requiredServerAuthorityGateIds) {
    const entry = byGate.get(gate);
    if (!entry) {
      failures.push(`${gate}: missing passing evidence`);
      continue;
    }
    const observedAt = new Date(entry.observedAt);
    if (
      observedAt.getTime() > now.getTime() + 5 * 60_000 ||
      now.getTime() - observedAt.getTime() > maxAgeMs
    ) {
      failures.push(`${gate}: evidence is future-dated or older than ${options.maxAgeDays ?? 30} days`);
    }
    try {
      const evidencePath = resolve(absoluteManifest, "..", entry.evidenceFile);
      const evidenceBytes = await readFile(evidencePath);
      const digest = createHash("sha256").update(evidenceBytes).digest("hex");
      if (digest !== entry.evidenceSha256) {
        failures.push(`${gate}: evidence digest mismatch`);
      } else {
        validateTypedEvidence(gate, evidenceBytes);
      }
    } catch (error) {
      failures.push(`${gate}: evidence file unavailable or invalid (${String(error)})`);
    }
  }

  if (byGate.size !== manifest.evidence.length) {
    failures.push("manifest contains duplicate gate entries");
  }
  if (failures.length > 0) {
    throw new Error(`server authority gates failed:\n- ${failures.join("\n- ")}`);
  }
  return { scope: manifest.scope, verified: requiredServerAuthorityGateIds.length };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const manifestPath =
    process.argv[2] ?? process.env.LOKI_SERVER_AUTHORITY_GATE_MANIFEST;
  if (!manifestPath) {
    throw new Error(
      "usage: tsx scripts/verify-server-authority-gates.ts <manifest.json>",
    );
  }
  console.log(
    JSON.stringify(await verifyServerAuthorityGates(manifestPath), null, 2),
  );
}
