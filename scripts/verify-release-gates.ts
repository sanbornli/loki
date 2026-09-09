import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  CostMeasurementSchema,
  MASTER_OPERATOR_EMAIL,
  OperatorSecurityReviewSchema,
  PilotMatrixSchema,
} from "./release-evidence.js";

export const requiredGateIds = [
  "tenant-isolation",
  "private-play-denial",
  "kill-switch",
  "quotas",
  "load",
  "recovery",
  "postgres-backup-restore",
  "r2-immutable-restore",
  "cost",
  "package-registry-install",
  "representative-game-pilot",
  "railway-alerts",
  "external-security-review",
  "external-legal-review",
] as const;

const Evidence = z.object({
  gate: z.enum(requiredGateIds),
  status: z.literal("pass"),
  observedAt: z.string().datetime({ offset: true }),
  environment: z.string().min(1),
  evidenceFile: z.string().min(1),
  evidenceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  notes: z.string().min(1).optional(),
  operator: z
    .object({
      email: z.literal(MASTER_OPERATOR_EMAIL),
      approvedAt: z.string().datetime({ offset: true }),
    })
    .optional(),
  external: z
    .object({
      organization: z.string().min(1),
      reviewer: z.string().min(1),
      reportReference: z.string().min(1),
      approvedAt: z.string().datetime({ offset: true }),
    })
    .optional(),
});

const Manifest = z.object({
  schemaVersion: z.literal(1),
  release: z.string().min(1),
  generatedAt: z.string().datetime({ offset: true }),
  evidence: z.array(Evidence),
});

export type ReleaseGateManifest = z.infer<typeof Manifest>;

function validateTypedEvidence(gate: string, bytes: Buffer): void {
  const value = JSON.parse(bytes.toString("utf8")) as Record<string, unknown>;
  if (
    [
      "tenant-isolation",
      "private-play-denial",
      "kill-switch",
      "quotas",
    ].includes(gate)
  ) {
    const checks = z
      .object({
        crossProjectCreatorDenied: z.literal(true),
        privateAnonymousPlayDenied: z.literal(true),
        deploymentCredentialQuotaDenied: z.literal(true),
        killSwitchDeniedNewPlayerSession: z.literal(true),
        killSwitchDeniedNewDeploymentCredential: z.literal(true),
      })
      .parse(value.checks);
    void checks;
  }
  if (gate === "load" || gate === "recovery") {
    const load = z
      .object({
        passed: z.literal(true),
        target: z.object({
          playersPerRoom: z.literal(8),
          rooms: z.number().int().min(20),
          updatesPerSecond: z.number().min(5).max(10),
          durationSeconds: z.number().min(600),
        }),
        measurements: z.object({
          recovery: z.union([
            z.object({
              attempted: z.literal(true),
              mode: z.literal("fail-closed"),
              oldRoomsDead: z.literal(true),
              newRoomUpdatesOk: z.literal(true),
              durationMs: z.number().max(60_000),
            }),
            z.object({ attempted: z.literal(false) }),
          ]),
        }),
      })
      .parse(value);
    if (gate === "recovery" && !load.measurements.recovery.attempted) {
      throw new Error("recovery action was not exercised");
    }
  }
  if (gate === "postgres-backup-restore") {
    z.object({ scratchWriteVerified: z.literal(true) }).parse(value);
  }
  if (gate === "r2-immutable-restore") {
    const restored = z
      .object({
        source: z.object({ sha256: z.string() }),
        restore: z.object({ sha256: z.string() }),
      })
      .parse(value);
    if (restored.source.sha256 !== restored.restore.sha256) {
      throw new Error("source and restore digests differ");
    }
  }
  if (gate === "cost") CostMeasurementSchema.parse(value);
  if (gate === "external-security-review") {
    OperatorSecurityReviewSchema.parse(value);
  }
  if (gate === "package-registry-install") {
    z.object({ mode: z.literal("registry"), passed: z.literal(true) }).parse(
      value,
    );
  }
  if (gate === "representative-game-pilot") {
    const matrix = PilotMatrixSchema.parse(value);
    const required = [
      "browser",
      "swift",
      "android",
      "unity-native",
      "unity-webgl",
      "casual-realtime",
      "team",
    ];
    for (const category of required) {
      if (
        !matrix.pilots.some(
          (pilot) => pilot.category === category && pilot.result === "pass",
        )
      ) {
        throw new Error(`missing passing ${category} pilot`);
      }
    }
  }
}

export async function verifyReleaseGates(
  manifestPath: string,
  options: { now?: Date; maxAgeDays?: number } = {},
): Promise<{ release: string; verified: number }> {
  const absoluteManifest = resolve(manifestPath);
  const manifest = Manifest.parse(
    JSON.parse(await readFile(absoluteManifest, "utf8")),
  );
  const now = options.now ?? new Date();
  const maxAgeMs = (options.maxAgeDays ?? 30) * 24 * 60 * 60 * 1_000;
  const failures: string[] = [];
  const byGate = new Map(manifest.evidence.map((entry) => [entry.gate, entry]));

  for (const gate of requiredGateIds) {
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
    if (gate === "external-security-review") {
      if (
        !entry.operator ||
        entry.operator.email !== MASTER_OPERATOR_EMAIL
      ) {
        failures.push(
          `${gate}: operator attestation from ${MASTER_OPERATOR_EMAIL} is required`,
        );
      }
    }
    if (gate === "external-legal-review" && !entry.external) {
      failures.push(`${gate}: independent reviewer evidence is required`);
    }
    try {
      const evidencePath = resolve(
        absoluteManifest,
        "..",
        entry.evidenceFile,
      );
      const evidenceBytes = await readFile(evidencePath);
      const digest = createHash("sha256").update(evidenceBytes).digest("hex");
      if (digest !== entry.evidenceSha256) {
        failures.push(`${gate}: evidence digest mismatch`);
      } else {
        validateTypedEvidence(gate, evidenceBytes);
      }
    } catch (error) {
      failures.push(`${gate}: evidence file unavailable (${String(error)})`);
    }
  }

  if (byGate.size !== manifest.evidence.length) {
    failures.push("manifest contains duplicate gate entries");
  }
  if (failures.length > 0) {
    throw new Error(`release gates failed:\n- ${failures.join("\n- ")}`);
  }
  return { release: manifest.release, verified: requiredGateIds.length };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const manifestPath =
    process.argv[2] ?? process.env.LOKI_RELEASE_GATE_MANIFEST;
  if (!manifestPath) {
    throw new Error(
      "usage: tsx scripts/verify-release-gates.ts <manifest.json>",
    );
  }
  console.log(
    JSON.stringify(await verifyReleaseGates(manifestPath), null, 2),
  );
}
