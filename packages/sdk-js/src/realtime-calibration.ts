import {
  REALTIME_ROOM_DEFAULT_INITIAL_SNAPSHOT_HZ,
  REALTIME_ROOM_DEFAULT_MIN_SNAPSHOT_HZ,
  REALTIME_ROOM_MAX_INPUT_HZ,
  REALTIME_ROOM_SUSTAINED_BACKPRESSURE_MS,
  type RealtimeRoom,
  type RealtimeRoomDiagnostics,
} from "./realtime-room.js";

/**
 * A single snapshot/input rate combination to try. Loki measures
 * transport health and authoritative hold/freeze frames; it never
 * inspects game State. Optional `evaluate()` can only veto a rate.
 */
export type RealtimeCalibrationCandidate = {
  snapshotHz: number;
  inputHz?: number;
};

/** Transport-health-plus-optional-veto evidence for one candidate. */
export type RealtimeCalibrationSample = {
  candidate: RealtimeCalibrationCandidate;
  hostDiagnostics: RealtimeRoomDiagnostics;
  guestDiagnostics: RealtimeRoomDiagnostics;
  acceptable: boolean;
  /** Lower is better. Reporting only; the picker does not use this. */
  score: number;
  rejectionReasons: string[];
};

/**
 * A committed rate/tuning profile a game writes into `createRealtimeRoom()`
 * after calibration. `tickRate` (a deployment-time `game.json` field, not a
 * `RealtimeRoom` option) is intentionally not part of this profile.
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

export const REALTIME_CALIBRATION_MIN_ACCEPTANCE_RATIO = 0.95;
export const REALTIME_CALIBRATION_MIN_DELIVERY_RATIO = 0.9;
export const REALTIME_CALIBRATION_MAX_EXTRAPOLATION_RATIO = 0.1;
export const REALTIME_CALIBRATION_MAX_HOLD_RATIO = 0.1;
export const REALTIME_CALIBRATION_MAX_ACK_P95_MS = 200;
export const REALTIME_CALIBRATION_ACK_CLIFF_FACTOR = 2;
/** Relative ack cliffs ignore sub-delta noise on an otherwise clean path. */
export const REALTIME_CALIBRATION_ACK_CLIFF_MIN_DELTA_MS = 50;
export const REALTIME_CALIBRATION_MAX_REJECTION_RATIO = 0.05;
export const REALTIME_CALIBRATION_MAX_SEQUENCE_GAP_RATIO = 0.05;

export type RealtimeCalibrationOptions<State, Input> = {
  /**
   * Candidate maximum snapshot rates to try. Order does not affect the
   * recommendation. Each candidate room must run at that fixed
   * `snapshotHz` with `adaptiveRate: false`.
   */
  snapshotHzCandidates: number[];
  /** Applied to every candidate; defaults to REALTIME_ROOM_MAX_INPUT_HZ. */
  inputHz?: number;
  simulationHz: number;
  /** How long to exercise each candidate (real time) before measuring it. */
  durationMsPerCandidate: number;
  /** Builds a fresh host RealtimeRoom for one candidate. The game wires its own predict/interpolate/state generation; pass `diagnostics: true` and `adaptiveRate: false`. */
  createHostRoom(candidate: RealtimeCalibrationCandidate): Promise<RealtimeRoom<State, Input>> | RealtimeRoom<State, Input>;
  /** Builds a fresh guest RealtimeRoom for the same candidate, to join the host's room. Pass `diagnostics: true`. */
  createGuestRoom(candidate: RealtimeCalibrationCandidate): Promise<RealtimeRoom<State, Input>> | RealtimeRoom<State, Input>;
  /** Drives one host simulation+publish step for this candidate. Called on a fixed interval derived from `simulationHz`. */
  driveHost(host: RealtimeRoom<State, Input>, tick: number, now: number): void;
  /** Drives one guest input/render step for this candidate. Called on the same fixed interval. */
  driveGuest?(guest: RealtimeRoom<State, Input>, tick: number, now: number): void;
  /**
   * Optional game-supplied veto for a candidate (e.g. a measured
   * ball/paddle/heading error). Cannot withhold a recommendation: if
   * every candidate is vetoed, calibration still returns the Loki floor.
   */
  evaluate?(sample: {
    candidate: RealtimeCalibrationCandidate;
    host: RealtimeRoomDiagnostics;
    guest: RealtimeRoomDiagnostics;
  }): { acceptable: boolean; score?: number } | undefined;
  minAcceptanceRatio?: number;
  minDeliveryRatio?: number;
  maxExtrapolationRatio?: number;
  maxHoldRatio?: number;
  maxAckP95Ms?: number;
  ackCliffFactor?: number;
  maxRejectionRatio?: number;
  maxSequenceGapRatio?: number;
  correctionMs?: number;
  interpolationDelayMs?: number;
};

export type RealtimeCalibrationResult = {
  recommended: RealtimeProfile;
  samples: RealtimeCalibrationSample[];
  /** True when no candidate passed the gates and the Loki floor profile was used. */
  usedFallback: boolean;
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const ratioAgainstRequest = (measured: number | undefined, requested: number): number | undefined => {
  if (measured === undefined || !Number.isFinite(measured) || requested <= 0) return undefined;
  return measured / requested;
};

export type RealtimeCalibrationGateOptions = {
  minAcceptanceRatio?: number;
  minDeliveryRatio?: number;
  maxExtrapolationRatio?: number;
  maxHoldRatio?: number;
  maxRejectionRatio?: number;
  maxSequenceGapRatio?: number;
};

/**
 * Loki-owned per-candidate gates (acceptance, delivery, extrapolation,
 * hold/freeze, backpressure). Ack-latency cliffs are applied after all
 * samples exist via `applyAckLatencyCliffs`.
 */
export function qualifyRealtimeCalibrationSample(
  candidate: RealtimeCalibrationCandidate,
  host: RealtimeRoomDiagnostics,
  guest: RealtimeRoomDiagnostics,
  options: RealtimeCalibrationGateOptions = {},
): { rejectionReasons: string[]; score: number } {
  const minAcceptanceRatio = options.minAcceptanceRatio ?? REALTIME_CALIBRATION_MIN_ACCEPTANCE_RATIO;
  const minDeliveryRatio = options.minDeliveryRatio ?? REALTIME_CALIBRATION_MIN_DELIVERY_RATIO;
  const maxExtrapolationRatio = options.maxExtrapolationRatio ?? REALTIME_CALIBRATION_MAX_EXTRAPOLATION_RATIO;
  const maxHoldRatio = options.maxHoldRatio ?? REALTIME_CALIBRATION_MAX_HOLD_RATIO;
  const maxRejectionRatio = options.maxRejectionRatio ?? REALTIME_CALIBRATION_MAX_REJECTION_RATIO;
  const maxSequenceGapRatio = options.maxSequenceGapRatio ?? REALTIME_CALIBRATION_MAX_SEQUENCE_GAP_RATIO;
  const requested = candidate.snapshotHz;
  const rejectionReasons: string[] = [];

  const acceptanceRatio = host.snapshotAcceptanceRatio ?? 0;
  if (acceptanceRatio < minAcceptanceRatio) rejectionReasons.push("acceptance");

  const guestDelivery = ratioAgainstRequest(guest.guestEffectiveSnapshotHz, requested);
  const hostDelivery = ratioAgainstRequest(host.effectiveAcceptedSnapshotHz, requested);
  const guestDelivered = guestDelivery !== undefined && guestDelivery >= minDeliveryRatio;
  const hostDelivered = hostDelivery !== undefined && hostDelivery >= minDeliveryRatio;
  // Guest arrival is required: host accepted-echo can look healthy while
  // the guest is starving. If both rates exist, both must pass.
  if (
    !guestDelivered ||
    (hostDelivery !== undefined && !hostDelivered) ||
    (hostDelivery === undefined && host.snapshotsAccepted === 0)
  ) {
    rejectionReasons.push("delivery");
  }

  const framesRendered = guest.framesRendered;
  const extrapolationRatio = framesRendered > 0 ? guest.extrapolatedFrames / framesRendered : 0;
  if (extrapolationRatio > maxExtrapolationRatio) rejectionReasons.push("extrapolation");

  const holdRatio = framesRendered > 0 ? guest.heldAuthoritativeFrames / framesRendered : 0;
  if (holdRatio > maxHoldRatio) rejectionReasons.push("hold");

  const attempted = host.snapshotsAttempted;
  const rejectionRatio = attempted > 0 ? host.snapshotsRejected / attempted : 0;
  if (rejectionRatio > maxRejectionRatio) rejectionReasons.push("rejected");
  if (host.snapshotAckTimeouts > 0) rejectionReasons.push("ack_timeout");
  if (host.snapshotBackpressureDurationMs > REALTIME_ROOM_SUSTAINED_BACKPRESSURE_MS) {
    rejectionReasons.push("backpressure");
  }
  const gapDenom = Math.max(guest.snapshotsAcked, host.snapshotsAccepted, 1);
  if (guest.snapshotSequenceGaps / gapDenom > maxSequenceGapRatio) rejectionReasons.push("sequence_gaps");

  const transportPenalty = (1 - acceptanceRatio) * 100 + extrapolationRatio * 50 + holdRatio * 50;
  const score = transportPenalty + requested * 0.01;
  return { rejectionReasons, score };
}

/**
 * Rejects a still-qualified candidate whose ack p95 exceeds the Loki cap
 * or is a cliff versus the best lower qualified rate.
 */
export function applyAckLatencyCliffs(
  samples: RealtimeCalibrationSample[],
  options: { maxAckP95Ms?: number; ackCliffFactor?: number; ackCliffMinDeltaMs?: number } = {},
): void {
  const maxAckP95Ms = options.maxAckP95Ms ?? REALTIME_CALIBRATION_MAX_ACK_P95_MS;
  const ackCliffFactor = options.ackCliffFactor ?? REALTIME_CALIBRATION_ACK_CLIFF_FACTOR;
  const ackCliffMinDeltaMs = options.ackCliffMinDeltaMs ?? REALTIME_CALIBRATION_ACK_CLIFF_MIN_DELTA_MS;
  const locallyQualified = samples.filter((sample) => sample.acceptable);

  for (const sample of locallyQualified) {
    const ack = sample.hostDiagnostics.snapshotAckP95Ms;
    if (ack === undefined) {
      if (sample.hostDiagnostics.snapshotsAccepted > 0) {
        sample.acceptable = false;
        sample.rejectionReasons.push("ack_missing");
      }
      continue;
    }
    if (ack > maxAckP95Ms) {
      sample.acceptable = false;
      sample.rejectionReasons.push("ack_cap");
      continue;
    }
    const lowerAcks = locallyQualified
      .filter(
        (other) =>
          other.candidate.snapshotHz < sample.candidate.snapshotHz &&
          other.hostDiagnostics.snapshotAckP95Ms !== undefined,
      )
      .map((other) => other.hostDiagnostics.snapshotAckP95Ms as number);
    if (lowerAcks.length === 0) continue;
    const minLower = Math.min(...lowerAcks);
    const cliffAt = Math.max(minLower * ackCliffFactor, minLower + ackCliffMinDeltaMs);
    if (ack >= cliffAt) {
      sample.acceptable = false;
      sample.rejectionReasons.push("ack_cliff");
    }
  }
}

export function buildRecommendedRealtimeProfile(
  samples: RealtimeCalibrationSample[],
  options: {
    simulationHz: number;
    inputHz?: number;
    interpolationDelayMs?: number;
    correctionMs?: number;
  },
): { recommended: RealtimeProfile; usedFallback: boolean } {
  const qualified = samples.filter((sample) => sample.acceptable);
  const usedFallback = qualified.length === 0;
  const snapshotHz = usedFallback
    ? REALTIME_ROOM_DEFAULT_MIN_SNAPSHOT_HZ
    : Math.max(...qualified.map((sample) => sample.candidate.snapshotHz));
  const inputHz =
    qualified[0]?.candidate.inputHz ?? options.inputHz ?? REALTIME_ROOM_MAX_INPUT_HZ;
  const recommended: RealtimeProfile = {
    schemaVersion: 1,
    simulationHz: options.simulationHz,
    snapshotHz,
    inputHz,
    interpolationDelayMs: options.interpolationDelayMs,
    correctionMs: options.correctionMs,
    adaptiveRate: true,
    minSnapshotHz: REALTIME_ROOM_DEFAULT_MIN_SNAPSHOT_HZ,
    initialSnapshotHz: usedFallback
      ? REALTIME_ROOM_DEFAULT_MIN_SNAPSHOT_HZ
      : Math.min(REALTIME_ROOM_DEFAULT_INITIAL_SNAPSHOT_HZ, snapshotHz),
  };
  return { recommended, usedFallback };
}

/**
 * Exercises each candidate snapshot rate against a real two-client
 * RealtimeRoom pair and recommends the highest rate that is actually
 * delivered without a Loki-owned cliff. If every completed candidate
 * fails the gates, returns the Loki floor profile (8 Hz, adaptive)
 * instead of throwing. Throws only when the harness is broken
 * (empty list, incomplete candidate, no diagnostics, no guest frames,
 * or a candidate run with adaptiveRate enabled).
 */
export async function calibrateRealtimeRoom<State, Input>(
  options: RealtimeCalibrationOptions<State, Input>,
): Promise<RealtimeCalibrationResult> {
  if (options.snapshotHzCandidates.length === 0) {
    throw new Error("calibrateRealtimeRoom: no candidates were provided");
  }

  const gateOptions: RealtimeCalibrationGateOptions = {
    minAcceptanceRatio: options.minAcceptanceRatio,
    minDeliveryRatio: options.minDeliveryRatio,
    maxExtrapolationRatio: options.maxExtrapolationRatio,
    maxHoldRatio: options.maxHoldRatio,
    maxRejectionRatio: options.maxRejectionRatio,
    maxSequenceGapRatio: options.maxSequenceGapRatio,
  };
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
      if (
        hostDiagnostics.configuredMaxSnapshotHz !== snapshotHz ||
        hostDiagnostics.currentTargetSnapshotHz !== snapshotHz
      ) {
        throw new Error(
          "calibrateRealtimeRoom requires each candidate to run at a fixed snapshotHz (adaptiveRate: false)",
        );
      }
      if (guestDiagnostics.framesRendered === 0) {
        throw new Error(
          "calibrateRealtimeRoom: guest rendered no frames; increase durationMsPerCandidate",
        );
      }

      const judged = options.evaluate?.({ candidate, host: hostDiagnostics, guest: guestDiagnostics });
      const { rejectionReasons, score } = qualifyRealtimeCalibrationSample(
        candidate,
        hostDiagnostics,
        guestDiagnostics,
        gateOptions,
      );
      if (judged?.acceptable === false) rejectionReasons.push("evaluate");

      samples.push({
        candidate,
        hostDiagnostics,
        guestDiagnostics,
        acceptable: rejectionReasons.length === 0,
        score: score + (judged?.score ?? 0),
        rejectionReasons,
      });
    } finally {
      await host.leave().catch(() => undefined);
      await guest.leave().catch(() => undefined);
    }
  }

  applyAckLatencyCliffs(samples, {
    maxAckP95Ms: options.maxAckP95Ms,
    ackCliffFactor: options.ackCliffFactor,
  });

  const { recommended, usedFallback } = buildRecommendedRealtimeProfile(samples, {
    simulationHz: options.simulationHz,
    inputHz: options.inputHz,
    interpolationDelayMs: options.interpolationDelayMs,
    correctionMs: options.correctionMs,
  });
  return { recommended, samples, usedFallback };
}
