import type { RealtimeRoom, RealtimeRoomDiagnostics } from "./realtime-room.js";

/**
 * A single snapshot/input rate combination to try. Loki only ever measures
 * transport health for a candidate (acceptance ratio, extrapolation ratio,
 * ack latency, jitter); it has no visibility into whether the resulting
 * motion actually looks acceptable for a particular game — that's what the
 * optional `evaluate()` callback in RealtimeCalibrationOptions is for.
 */
export type RealtimeCalibrationCandidate = {
  snapshotHz: number;
  inputHz?: number;
};

/** Transport-health-plus-optional-game-quality evidence for one candidate. */
export type RealtimeCalibrationSample = {
  candidate: RealtimeCalibrationCandidate;
  hostDiagnostics: RealtimeRoomDiagnostics;
  guestDiagnostics: RealtimeRoomDiagnostics;
  acceptable: boolean;
  /** Lower is better. Built from transport-health signals, optionally overridden/combined with evaluate()'s score. */
  score: number;
};

/**
 * A committed rate/tuning profile a game writes into `createRealtimeRoom()`
 * after calibration. `tickRate` (a deployment-time `game.json` field, not a
 * `RealtimeRoom` option) is intentionally not part of this profile —
 * calibration can inform what to set it to, but it is applied separately.
 */
export type RealtimeProfile = {
  schemaVersion: 1;
  simulationHz: number;
  snapshotHz: number;
  inputHz: number;
  interpolationDelayMs?: number;
  correctionMs?: number;
  adaptiveRate: boolean;
  minSnapshotHz?: number;
  initialSnapshotHz?: number;
};

export type RealtimeCalibrationOptions<State, Input> = {
  /**
   * Candidate maximum snapshot rates to try, in the order given. List them
   * lowest-to-highest to bias the recommendation toward the lowest rate
   * that stays acceptable (matching "start conservative, only raise the
   * rate with evidence"), rather than the highest rate that merely
   * survives.
   */
  snapshotHzCandidates: number[];
  /** Applied to every candidate; defaults to REALTIME_ROOM_MAX_INPUT_HZ. */
  inputHz?: number;
  simulationHz: number;
  /** How long to exercise each candidate (real time) before measuring it. */
  durationMsPerCandidate: number;
  /** Builds a fresh host RealtimeRoom for one candidate. The game wires its own predict/interpolate/state generation; pass `diagnostics: true`. */
  createHostRoom(candidate: RealtimeCalibrationCandidate): Promise<RealtimeRoom<State, Input>> | RealtimeRoom<State, Input>;
  /** Builds a fresh guest RealtimeRoom for the same candidate, to join the host's room. Pass `diagnostics: true`. */
  createGuestRoom(candidate: RealtimeCalibrationCandidate): Promise<RealtimeRoom<State, Input>> | RealtimeRoom<State, Input>;
  /** Drives one host simulation+publish step for this candidate. Called on a fixed interval derived from `simulationHz`. */
  driveHost(host: RealtimeRoom<State, Input>, tick: number, now: number): void;
  /** Drives one guest input/render step for this candidate. Called on the same fixed interval. */
  driveGuest?(guest: RealtimeRoom<State, Input>, tick: number, now: number): void;
  /**
   * Optional game-supplied quality judgment for a candidate (e.g. a
   * measured ball/paddle/heading error). Loki cannot judge this itself;
   * without it, only transport-health thresholds decide acceptability.
   */
  evaluate?(sample: {
    candidate: RealtimeCalibrationCandidate;
    host: RealtimeRoomDiagnostics;
    guest: RealtimeRoomDiagnostics;
  }): { acceptable: boolean; score?: number } | undefined;
  /** Minimum host snapshotsAccepted/snapshotsAttempted to consider a candidate transport-healthy. Defaults to 0.95. */
  minAcceptanceRatio?: number;
  /** Maximum guest extrapolatedFrames/framesRendered to consider a candidate transport-healthy. Defaults to 0.3. */
  maxExtrapolationRatio?: number;
  correctionMs?: number;
  interpolationDelayMs?: number;
  adaptiveRate?: boolean;
  minSnapshotHz?: number;
  initialSnapshotHz?: number;
};

export type RealtimeCalibrationResult = {
  recommended: RealtimeProfile;
  samples: RealtimeCalibrationSample[];
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Exercises each candidate snapshot rate against a real two-client
 * RealtimeRoom pair (built by the caller via `createHostRoom`/
 * `createGuestRoom`, so this works against a hosted match, a local test
 * transport, or anything else RealtimeRoom already supports) and
 * recommends the lowest-resource rate that stays transport-healthy (and,
 * if `evaluate()` is supplied, judged acceptable by the game). Loki never
 * inspects game state; every judgment beyond transport counters comes from
 * the caller's own `driveHost`/`driveGuest`/`evaluate` callbacks.
 */
export async function calibrateRealtimeRoom<State, Input>(
  options: RealtimeCalibrationOptions<State, Input>,
): Promise<RealtimeCalibrationResult> {
  const minAcceptanceRatio = options.minAcceptanceRatio ?? 0.95;
  const maxExtrapolationRatio = options.maxExtrapolationRatio ?? 0.3;
  const fixedStepMs = 1000 / options.simulationHz;
  const samples: RealtimeCalibrationSample[] = [];

  for (const snapshotHz of options.snapshotHzCandidates) {
    const candidate: RealtimeCalibrationCandidate = { snapshotHz, inputHz: options.inputHz };
    const host = await options.createHostRoom(candidate);
    const guest = await options.createGuestRoom(candidate);
    try {
      const created = await host.create();
      await guest.join({ inviteCode: created.inviteCode });

      const steps = Math.max(1, Math.round(options.durationMsPerCandidate / fixedStepMs));
      for (let tick = 0; tick < steps; tick += 1) {
        const now = tick * fixedStepMs;
        options.driveHost(host, tick, now);
        host.advanceFrame(now);
        guest.advanceFrame(now);
        options.driveGuest?.(guest, tick, now);
        guest.getRenderState(now);
        await sleep(fixedStepMs);
      }

      const hostDiagnostics = host.getSnapshot().diagnostics;
      const guestDiagnostics = guest.getSnapshot().diagnostics;
      if (!hostDiagnostics || !guestDiagnostics) {
        throw new Error(
          "calibrateRealtimeRoom requires createHostRoom/createGuestRoom to pass { diagnostics: true }",
        );
      }

      const acceptanceRatio = hostDiagnostics.snapshotAcceptanceRatio ?? 0;
      const extrapolationRatio =
        guestDiagnostics.framesRendered > 0
          ? guestDiagnostics.extrapolatedFrames / guestDiagnostics.framesRendered
          : 0;
      const transportHealthy = acceptanceRatio >= minAcceptanceRatio && extrapolationRatio <= maxExtrapolationRatio;
      const judged = options.evaluate?.({ candidate, host: hostDiagnostics, guest: guestDiagnostics });

      const acceptable = transportHealthy && (judged?.acceptable ?? true);
      // Lower is better: transport-health penalty plus the game's own
      // score (if any). Rewards a low snapshotHz slightly so ties prefer
      // the cheaper candidate even if evaluate() doesn't discriminate.
      const transportPenalty = (1 - acceptanceRatio) * 100 + extrapolationRatio * 50;
      const score = transportPenalty + (judged?.score ?? 0) + snapshotHz * 0.01;

      samples.push({ candidate, hostDiagnostics, guestDiagnostics, acceptable, score });
    } finally {
      await host.leave().catch(() => undefined);
      await guest.leave().catch(() => undefined);
    }
  }

  const firstAcceptable = samples.find((sample) => sample.acceptable);
  const best =
    firstAcceptable ?? samples.slice().sort((a, b) => a.score - b.score)[0];
  if (!best) throw new Error("calibrateRealtimeRoom: no candidates were provided");

  const recommended: RealtimeProfile = {
    schemaVersion: 1,
    simulationHz: options.simulationHz,
    snapshotHz: best.candidate.snapshotHz,
    inputHz: best.candidate.inputHz ?? options.inputHz ?? 20,
    interpolationDelayMs: options.interpolationDelayMs,
    correctionMs: options.correctionMs,
    adaptiveRate: options.adaptiveRate ?? false,
    minSnapshotHz: options.minSnapshotHz,
    initialSnapshotHz: options.initialSnapshotHz,
  };
  return { recommended, samples };
}
