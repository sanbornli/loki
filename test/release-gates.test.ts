import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  requiredGateIds,
  verifyReleaseGates,
} from "../scripts/verify-release-gates.js";
import {
  CostMeasurementSchema,
  PilotMatrixSchema,
  conservativeCaps,
} from "../scripts/release-evidence.js";

test("release verifier requires every dated gate and external attestations", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loki-gates-"));
  const observedAt = "2026-09-07T00:00:00.000Z";
  const typedEvidence = (gate: string): Record<string, unknown> => {
    if (["tenant-isolation", "private-play-denial", "kill-switch", "quotas"].includes(gate)) {
      return {
        checks: {
          crossProjectCreatorDenied: true,
          privateAnonymousPlayDenied: true,
          deploymentCredentialQuotaDenied: true,
          killSwitchDeniedNewPlayerSession: true,
          killSwitchDeniedNewDeploymentCredential: true,
        },
      };
    }
    if (gate === "load" || gate === "recovery") {
      return {
        passed: true,
        measurements: {
          recovery:
            gate === "recovery"
              ? { attempted: true, ratio: 0.96, durationMs: 30_000 }
              : { attempted: false },
        },
      };
    }
    if (gate === "postgres-backup-restore") return { scratchWriteVerified: true };
    if (gate === "r2-immutable-restore") {
      return { source: { sha256: "same" }, restore: { sha256: "same" } };
    }
    if (gate === "cost") {
      return {
        schemaVersion: 1,
        generatedAt: observedAt,
        currency: "USD",
        windowHours: 1,
        activePlayerHours: 1,
        activeMatchHours: 1,
        costs: {
          compute: 1,
          database: 0,
          objectStorage: 0,
          bandwidth: 0,
          monitoring: 0,
          other: 0,
        },
        sourceReferences: ["invoice"],
      };
    }
    if (gate === "package-registry-install") return { mode: "registry", passed: true };
    if (gate === "representative-game-pilot") {
      return {
        schemaVersion: 1,
        generatedAt: observedAt,
        release: "v1",
        environment: "production",
        pilots: [
          "browser",
          "swift",
          "android",
          "unity-native",
          "unity-webgl",
          "casual-realtime",
          "team",
        ].map((category) => ({
          category,
          game: "pilot",
          platform: "test",
          startedAt: observedAt,
          completedAt: observedAt,
          players: 1,
          rooms: 1,
          result: "pass",
          tester: "team",
          evidenceReferences: ["record"],
          observations: "passed",
        })),
      };
    }
    return { ok: true };
  };
  const evidenceByGate = new Map<string, { file: string; digest: string }>();
  for (const gate of requiredGateIds) {
    const bytes = Buffer.from(`${JSON.stringify(typedEvidence(gate))}\n`);
    const file = `${gate}.json`;
    await writeFile(join(directory, file), bytes);
    evidenceByGate.set(gate, {
      file,
      digest: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  const manifest = {
    schemaVersion: 1,
    release: "v1.0.0",
    generatedAt: observedAt,
    evidence: requiredGateIds.map((gate) => {
      const evidence = evidenceByGate.get(gate)!;
      return {
        gate,
        status: "pass",
        observedAt,
        environment: "production",
        evidenceFile: evidence.file,
        evidenceSha256: evidence.digest,
        ...(gate.startsWith("external-")
          ? {
              external: {
                organization: "Independent Reviewer",
                reviewer: "Named Person",
                reportReference: "controlled-report-1",
                approvedAt: observedAt,
              },
            }
          : {}),
      };
    }),
  };
  const path = join(directory, "manifest.json");
  await writeFile(path, JSON.stringify(manifest));
  assert.deepEqual(
    await verifyReleaseGates(path, {
      now: new Date("2026-09-08T00:00:00.000Z"),
    }),
    { release: "v1.0.0", verified: requiredGateIds.length },
  );
  manifest.evidence = manifest.evidence.filter(
    (entry) => entry.gate !== "external-legal-review",
  );
  await writeFile(path, JSON.stringify(manifest));
  await assert.rejects(() => verifyReleaseGates(path), /external-legal-review/);
});

test("cost caps reserve budget and schemas reject unsupported evidence", () => {
  const measurement = CostMeasurementSchema.parse({
    schemaVersion: 1,
    generatedAt: "2026-09-07T00:00:00.000Z",
    currency: "USD",
    windowHours: 24,
    activePlayerHours: 100,
    activeMatchHours: 10,
    costs: {
      compute: 10,
      database: 5,
      objectStorage: 1,
      bandwidth: 2,
      monitoring: 1,
      other: 1,
    },
    sourceReferences: ["provider-export.csv"],
  });
  const caps = conservativeCaps(measurement, { monthlyBudget: 100 });
  assert.equal(caps.assumptions.usableBudget, 50);
  assert.equal(caps.recommendedPublicFreeAccounts, 8);
  assert.throws(() =>
    PilotMatrixSchema.parse({
      schemaVersion: 1,
      generatedAt: measurement.generatedAt,
      release: "v1",
      environment: "production",
      pilots: [{ category: "desktop-unknown" }],
    }),
  );
});
