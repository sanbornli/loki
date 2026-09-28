import { z } from "zod";
import { MASTER_TEST_ACCOUNT_EMAIL } from "../apps/api/src/master-account.js";

// Evidence schemas for the server-authority gates ("Gates before
// creators can select it") of
// .cursor/plans/turn_then_server_auth_344defe4.plan.md. This mirrors the
// pattern in scripts/release-evidence.ts / scripts/verify-release-gates.ts
// but is intentionally a separate, independent gate system: server
// authority is an opt-in runtime mode a creator selects per game, not part
// of every release, and PHASE_ZERO_DECISIONS.md's earlier NO-GO for a
// creator-authored authoritative rules runner stays the record until this
// evidence replaces it for the WASM-isolate path specifically.

export const MASTER_OPERATOR_EMAIL = MASTER_TEST_ACCOUNT_EMAIL;

// Gate 1: "Isolate warm start stays under 10 ms at p95 while neighboring
// matches are stepping." Samples are individual placements measured while
// concurrentMatches other isolates were live and stepping in the same
// worker process.
export const WarmStartEvidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string().datetime({ offset: true }),
    environment: z.string().min(1),
    concurrentMatches: z.number().int().positive(),
    samples: z.number().int().positive(),
    warmStartMsP95: z.number().positive(),
    sourceReferences: z.array(z.string().min(1)).min(1),
  })
  .refine((value) => value.warmStartMsP95 < 10, {
    message: "warm-start p95 must be under 10ms",
  })
  .refine((value) => value.samples >= value.concurrentMatches, {
    message: "samples must cover at least one measurement per concurrent match",
  });

// Gate 2: "Fuel, time, and memory limits kill a loop or a large allocation
// without disturbing the neighbor match." Each fault must be independently
// injected and each must leave the neighbor's own tick sequence unbroken.
export const FaultInjectionKindSchema = z.enum(["fuel", "time", "memory"]);
export const MeteringEvidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string().datetime({ offset: true }),
    environment: z.string().min(1),
    faultInjections: z
      .array(
        z.object({
          kind: FaultInjectionKindSchema,
          killed: z.literal(true),
          killedWithinMs: z.number().positive(),
          neighborMatchId: z.string().min(1),
          neighborTicksBefore: z.number().int().nonnegative(),
          neighborTicksAfter: z.number().int().nonnegative(),
        }),
      )
      .min(1),
    sourceReferences: z.array(z.string().min(1)).min(1),
  })
  .refine(
    (value) => new Set(value.faultInjections.map((entry) => entry.kind)).size === 3,
    { message: "must exercise all three fault kinds: fuel, time, memory" },
  )
  .refine(
    (value) =>
      value.faultInjections.every((entry) => entry.neighborTicksAfter > entry.neighborTicksBefore),
    { message: "neighbor match must keep advancing through every fault injection" },
  );

// Gate 3: "A module that imports WASI, opens a socket, or reads the
// environment is rejected before scheduling." Each category below must be
// represented and rejected prior to ever reaching a worker.
export const RejectedImportCategorySchema = z.enum(["wasi", "socket", "environment", "clock", "random"]);
export const ImportRejectionEvidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string().datetime({ offset: true }),
    environment: z.string().min(1),
    rejections: z
      .array(
        z.object({
          category: RejectedImportCategorySchema,
          rejectedBeforeScheduling: z.literal(true),
          rejectionReason: z.string().min(1),
        }),
      )
      .min(1),
    sourceReferences: z.array(z.string().min(1)).min(1),
  })
  .refine(
    (value) =>
      ["wasi", "socket", "environment"].every((category) =>
        value.rejections.some((entry) => entry.category === category),
      ),
    { message: "must cover wasi, socket, and environment import rejection" },
  );

// Gate 4: "A dead worker restores the last snapshot, or the room ends
// cleanly, and never falls back to a player host."
export const CrashRecoveryEvidenceSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime({ offset: true }),
  environment: z.string().min(1),
  workerKilledMidMatch: z.literal(true),
  outcome: z.enum(["restored-last-snapshot", "room-ended-cleanly"]),
  fellBackToPlayerHost: z.literal(false),
  sourceReferences: z.array(z.string().min(1)).min(1),
});

// Gate 5: "Replaying the same inputs yields the same state." Two
// independent isolate runs of the same recorded input log must reach byte-
// identical final state.
export const ReplayDeterminismEvidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string().datetime({ offset: true }),
    environment: z.string().min(1),
    inputLogSha256: z.string().regex(/^[a-f0-9]{64}$/),
    runs: z
      .array(
        z.object({
          runId: z.string().min(1),
          finalStateSha256: z.string().regex(/^[a-f0-9]{64}$/),
          ticksExecuted: z.number().int().positive(),
        }),
      )
      .min(2),
    sourceReferences: z.array(z.string().min(1)).min(1),
  })
  .refine(
    (value) => new Set(value.runs.map((run) => run.finalStateSha256)).size === 1,
    { message: "every replay run must reach the same final state" },
  );

// Gate 6: "A local runner executes the same ABI so a creator can see a fuel
// or memory kill." A creator-facing local tool, not the production worker,
// must reproduce at least one metering kill outside the hosted fleet.
export const LocalRunnerParityEvidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string().datetime({ offset: true }),
    environment: z.string().min(1),
    localRunnerVersion: z.string().min(1),
    demonstratedKills: z.array(FaultInjectionKindSchema).min(1),
    sourceReferences: z.array(z.string().min(1)).min(1),
  })
  .refine((value) => new Set(value.demonstratedKills).size === value.demonstratedKills.length, {
    message: "demonstratedKills must not repeat a kind",
  });

// Kept for a recorded outside review and per-match-second cost figure.
// Not a required gate: production server authority does not wait on it.
// Reuses the operator-attestation shape from scripts/release-evidence.ts
// (a named, non-self-approving reviewer).
export const SandboxReviewCostEvidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string().datetime({ offset: true }),
    reviewer: z.object({
      name: z.string().min(1),
      organization: z.string().min(1),
    }),
    operator: z.literal(MASTER_OPERATOR_EMAIL),
    approvedAt: z.string().datetime({ offset: true }),
    sandboxAccepted: z.literal(true),
    costPerMatchSecond: z.number().nonnegative(),
    costCurrency: z.string().length(3),
    evidenceReferences: z.array(z.string().min(1)).min(1),
  })
  .refine(
    (value) => value.reviewer.name.toLowerCase() !== value.operator.toLowerCase(),
    { message: "sandbox review agent must not self-approve" },
  );
