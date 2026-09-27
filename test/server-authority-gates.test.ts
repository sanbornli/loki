import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MASTER_OPERATOR_EMAIL } from "../scripts/server-authority-evidence.js";
import {
  requiredServerAuthorityGateIds,
  verifyServerAuthorityGates,
} from "../scripts/verify-server-authority-gates.js";

// Mirrors test/release-gates.test.ts's harness, but for the seven
// server-authority gates in plan section 6 rather than the platform-wide
// release gates: every gate must be present, dated, digest-matched, and
// pass its own typed schema before authority: "server" may be enabled in
// production for any game.

test("server authority verifier requires all seven dated, digest-matched, schema-valid gates", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loki-server-authority-gates-"));
  const observedAt = "2026-09-07T00:00:00.000Z";

  const typedEvidence = (gate: string): Record<string, unknown> => {
    if (gate === "warm-start") {
      return {
        schemaVersion: 1,
        generatedAt: observedAt,
        environment: "staging-sg",
        concurrentMatches: 50,
        samples: 500,
        warmStartMsP95: 6.4,
        sourceReferences: ["loadtest-2026-09-07.json"],
      };
    }
    if (gate === "metering") {
      return {
        schemaVersion: 1,
        generatedAt: observedAt,
        environment: "staging-sg",
        faultInjections: [
          {
            kind: "fuel",
            killed: true,
            killedWithinMs: 25,
            neighborMatchId: "match-neighbor-1",
            neighborTicksBefore: 100,
            neighborTicksAfter: 130,
          },
          {
            kind: "time",
            killed: true,
            killedWithinMs: 22,
            neighborMatchId: "match-neighbor-1",
            neighborTicksBefore: 130,
            neighborTicksAfter: 160,
          },
          {
            kind: "memory",
            killed: true,
            killedWithinMs: 18,
            neighborMatchId: "match-neighbor-1",
            neighborTicksBefore: 160,
            neighborTicksAfter: 190,
          },
        ],
        sourceReferences: ["fault-injection-2026-09-07.json"],
      };
    }
    if (gate === "import-rejection") {
      return {
        schemaVersion: 1,
        generatedAt: observedAt,
        environment: "staging-sg",
        rejections: [
          { category: "wasi", rejectedBeforeScheduling: true, rejectionReason: "wasi_snapshot_preview1 import" },
          { category: "socket", rejectedBeforeScheduling: true, rejectionReason: "sock_open import" },
          { category: "environment", rejectedBeforeScheduling: true, rejectionReason: "environ_get import" },
        ],
        sourceReferences: ["import-rejection-2026-09-07.json"],
      };
    }
    if (gate === "crash-recovery") {
      return {
        schemaVersion: 1,
        generatedAt: observedAt,
        environment: "staging-sg",
        workerKilledMidMatch: true,
        outcome: "restored-last-snapshot",
        fellBackToPlayerHost: false,
        sourceReferences: ["crash-recovery-2026-09-07.json"],
      };
    }
    if (gate === "replay-determinism") {
      return {
        schemaVersion: 1,
        generatedAt: observedAt,
        environment: "staging-sg",
        inputLogSha256: "a".repeat(64),
        runs: [
          { runId: "run-1", finalStateSha256: "b".repeat(64), ticksExecuted: 900 },
          { runId: "run-2", finalStateSha256: "b".repeat(64), ticksExecuted: 900 },
        ],
        sourceReferences: ["replay-2026-09-07.json"],
      };
    }
    if (gate === "local-runner-parity") {
      return {
        schemaVersion: 1,
        generatedAt: observedAt,
        environment: "local",
        localRunnerVersion: "0.1.0",
        demonstratedKills: ["fuel", "memory"],
        sourceReferences: ["local-runner-2026-09-07.json"],
      };
    }
    if (gate === "sandbox-review-and-cost") {
      return {
        schemaVersion: 1,
        generatedAt: observedAt,
        reviewer: { name: "second-agent", organization: "Independent Reviewer" },
        operator: MASTER_OPERATOR_EMAIL,
        approvedAt: observedAt,
        sandboxAccepted: true,
        costPerMatchSecond: 0.0004,
        costCurrency: "USD",
        evidenceReferences: ["sandbox-review-2026-09-07.pdf"],
      };
    }
    throw new Error(`no fixture for gate ${gate}`);
  };

  const evidenceByGate = new Map<string, { file: string; digest: string }>();
  for (const gate of requiredServerAuthorityGateIds) {
    const bytes = Buffer.from(`${JSON.stringify(typedEvidence(gate))}\n`);
    const file = `${gate}.json`;
    await writeFile(join(directory, file), bytes);
    evidenceByGate.set(gate, { file, digest: createHash("sha256").update(bytes).digest("hex") });
  }

  const buildManifest = () => ({
    schemaVersion: 1,
    scope: "game:demo-project",
    generatedAt: observedAt,
    evidence: requiredServerAuthorityGateIds.map((gate) => {
      const evidence = evidenceByGate.get(gate)!;
      return {
        gate,
        status: "pass" as const,
        observedAt,
        environment: "staging-sg",
        evidenceFile: evidence.file,
        evidenceSha256: evidence.digest,
      };
    }),
  });

  const manifestPath = join(directory, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(buildManifest()));
  assert.deepEqual(
    await verifyServerAuthorityGates(manifestPath, { now: new Date("2026-09-08T00:00:00.000Z") }),
    { scope: "game:demo-project", verified: requiredServerAuthorityGateIds.length },
  );

  // Missing a gate fails closed.
  const missingOne = buildManifest();
  missingOne.evidence = missingOne.evidence.filter((entry) => entry.gate !== "crash-recovery");
  await writeFile(manifestPath, JSON.stringify(missingOne));
  await assert.rejects(
    () => verifyServerAuthorityGates(manifestPath, { now: new Date("2026-09-08T00:00:00.000Z") }),
    /crash-recovery/,
  );

  // Evidence whose bytes were altered after being hashed fails closed.
  const tampered = buildManifest();
  await writeFile(manifestPath, JSON.stringify(tampered));
  await writeFile(join(directory, "warm-start.json"), `${JSON.stringify({ tampered: true })}\n`);
  await assert.rejects(
    () => verifyServerAuthorityGates(manifestPath, { now: new Date("2026-09-08T00:00:00.000Z") }),
    /digest mismatch/,
  );
});

test("warm-start evidence rejects a p95 at or above 10ms", async () => {
  const { WarmStartEvidenceSchema } = await import("../scripts/server-authority-evidence.js");
  const base = {
    schemaVersion: 1 as const,
    generatedAt: "2026-09-07T00:00:00.000Z",
    environment: "staging-sg",
    concurrentMatches: 10,
    samples: 100,
    sourceReferences: ["x"],
  };
  assert.throws(() => WarmStartEvidenceSchema.parse({ ...base, warmStartMsP95: 10 }));
  assert.throws(() => WarmStartEvidenceSchema.parse({ ...base, warmStartMsP95: 15 }));
  assert.equal(WarmStartEvidenceSchema.parse({ ...base, warmStartMsP95: 9.9 }).warmStartMsP95, 9.9);
});

test("metering evidence requires all three fault kinds and neighbor progress through every fault", async () => {
  const { MeteringEvidenceSchema } = await import("../scripts/server-authority-evidence.js");
  const base = {
    schemaVersion: 1 as const,
    generatedAt: "2026-09-07T00:00:00.000Z",
    environment: "staging-sg",
    sourceReferences: ["x"],
  };
  assert.throws(() =>
    MeteringEvidenceSchema.parse({
      ...base,
      faultInjections: [
        { kind: "fuel", killed: true, killedWithinMs: 1, neighborMatchId: "m", neighborTicksBefore: 1, neighborTicksAfter: 2 },
      ],
    }),
  );
  assert.throws(() =>
    MeteringEvidenceSchema.parse({
      ...base,
      faultInjections: [
        { kind: "fuel", killed: true, killedWithinMs: 1, neighborMatchId: "m", neighborTicksBefore: 5, neighborTicksAfter: 5 },
        { kind: "time", killed: true, killedWithinMs: 1, neighborMatchId: "m", neighborTicksBefore: 5, neighborTicksAfter: 6 },
        { kind: "memory", killed: true, killedWithinMs: 1, neighborMatchId: "m", neighborTicksBefore: 6, neighborTicksAfter: 7 },
      ],
    }),
  );
});

test("sandbox review and cost evidence rejects self-approval", async () => {
  const { SandboxReviewCostEvidenceSchema } = await import("../scripts/server-authority-evidence.js");
  const base = {
    schemaVersion: 1 as const,
    generatedAt: "2026-09-07T00:00:00.000Z",
    operator: MASTER_OPERATOR_EMAIL,
    approvedAt: "2026-09-07T00:00:00.000Z",
    sandboxAccepted: true as const,
    costPerMatchSecond: 0.001,
    costCurrency: "USD",
    evidenceReferences: ["x"],
  };
  assert.throws(() =>
    SandboxReviewCostEvidenceSchema.parse({
      ...base,
      reviewer: { name: MASTER_OPERATOR_EMAIL, organization: "Self" },
    }),
  );
  assert.equal(
    SandboxReviewCostEvidenceSchema.parse({
      ...base,
      reviewer: { name: "second-agent", organization: "Independent Reviewer" },
    }).operator,
    MASTER_OPERATOR_EMAIL,
  );
});
