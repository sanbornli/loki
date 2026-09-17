import {
  REALTIME_PROTOCOL_VERSION,
  canonicalJson,
  snapshotMembersAreComplete,
  type MembershipStatus,
  type Presence,
  type RealtimeDelivery,
  type RealtimeServerEnvelope,
  type ServerEnvelope,
} from "../../protocol/src/index.js";
import type { ConnectionEvent, ConnectionState, RoomMember } from "./synchronized-room.js";

type JoinedRoom = {
  roomId: string;
  inviteCode: string;
  snapshot: ServerEnvelope;
};

export const REALTIME_ROOM_MAX_MESSAGE_BYTES = 16_384;
export const REALTIME_ROOM_DEFAULT_SNAPSHOT_HZ = 30;
export const REALTIME_ROOM_MAX_SNAPSHOT_HZ = 30;
export const REALTIME_ROOM_MAX_INPUT_HZ = 20;
export const REALTIME_ROOM_DEFAULT_IN_FLIGHT_SNAPSHOTS = 3;
export const REALTIME_ROOM_MAX_IN_FLIGHT_SNAPSHOTS = 8;
export const REALTIME_ROOM_IN_FLIGHT_BUDGET_MS = 250;
export const REALTIME_ROOM_MAX_ORDERED_INPUTS = 32;
export const REALTIME_ROOM_MIN_INTERPOLATION_DELAY_MS = 70;
export const REALTIME_ROOM_DEFAULT_CORRECTION_MS = 280;
export const REALTIME_ROOM_MAX_CATCHUP_STEPS = 2;
export const REALTIME_ROOM_MAX_EXTRAPOLATION_INTERVALS = 2;
export const REALTIME_ROOM_MAX_CLOCK_NUDGE = 0.05;
// A gap between publishSnapshot() calls smaller than this fraction of the
// configured cadence window is flagged as a back-to-back publish (the game
// is calling publishSnapshot faster than its own configured rate needs).
export const REALTIME_ROOM_BACK_TO_BACK_PUBLISH_FACTOR = 0.25;
// A gap between publishSnapshot() calls larger than this multiple of the
// configured cadence window (or this absolute floor, whichever is larger)
// is treated as a host frame stall rather than ordinary jitter.
export const REALTIME_ROOM_HOST_STALL_FACTOR = 3;
export const REALTIME_ROOM_HOST_STALL_FLOOR_MS = 150;
// Effective send rate below this fraction of the configured snapshotHz
// triggers a low-effective-rate warning.
export const REALTIME_ROOM_LOW_EFFECTIVE_RATE_FACTOR = 0.7;
// How many recent confirmed-effect ids a guest keeps to dedupe redelivered
// or resynced effects. Bounded so long sessions cannot leak memory.
export const REALTIME_ROOM_MAX_SEEN_EFFECT_IDS = 256;

// --- Adaptive snapshot rate (opt-in via `adaptiveRate: true`) --------------
// `snapshotHz` is the ceiling, never exceeded. Without `adaptiveRate`, the
// room publishes at exactly that rate (unchanged prior behavior). With it,
// the room starts conservatively and only climbs toward the ceiling after a
// sustained run of clean acknowledgements, but backs off immediately (and
// further) on rejection, timeout, or sustained backpressure.
export const REALTIME_ROOM_DEFAULT_MIN_SNAPSHOT_HZ = 8;
export const REALTIME_ROOM_DEFAULT_INITIAL_SNAPSHOT_HZ = 12;
// Multiplicative decrease applied to the current target on rejection/timeout.
export const REALTIME_ROOM_RATE_DECREASE_FACTOR = 0.5;
// Additive increase (in Hz) applied after a sustained clean run.
export const REALTIME_ROOM_RATE_INCREASE_STEP_HZ = 2;
// Consecutive accepted sends required (with no rejection/timeout) before the
// controller is willing to raise the target rate again.
export const REALTIME_ROOM_RATE_INCREASE_STREAK = 20;
// Minimum time between rate increases, so raising the rate can never itself
// look like a back-to-back stall right after a reduction.
export const REALTIME_ROOM_RATE_INCREASE_COOLDOWN_MS = 2_000;

// A submitted snapshot that has not been acknowledged (accepted-echo or
// explicit error) within this many multiples of the current send interval
// (or this absolute floor, whichever is larger) is treated as timed out and
// its in-flight capacity is released. This is what prevents a silently
// dropped/superseded submission (the runtime ignores late/duplicate echoes
// without ever responding) from permanently saturating the in-flight budget.
export const REALTIME_ROOM_SNAPSHOT_ACK_TIMEOUT_FACTOR = 4;
export const REALTIME_ROOM_SNAPSHOT_ACK_TIMEOUT_FLOOR_MS = 1_000;

// A guest sends a bounded transport-health report to the host at roughly
// this interval so a host-side adaptive controller can react to the
// worst-placed guest, not only its own send/ack cadence.
export const REALTIME_ROOM_GUEST_REPORT_INTERVAL_MS = 1_000;
// A guest's extrapolated-frame ratio (over its own rolling window) above
// this threshold is reported as a diagnostic warning and factored into the
// host's rate controller as a backoff signal.
export const REALTIME_ROOM_HIGH_EXTRAPOLATION_RATIO = 0.3;
// How many recent getRenderStates() samples the extrapolation ratio is
// computed over.
export const REALTIME_ROOM_EXTRAPOLATION_WINDOW = 60;
// How many recent snapshot round-trip samples snapshotAckP95Ms is computed
// over.
export const REALTIME_ROOM_MAX_ACK_LATENCY_SAMPLES = 50;
// How long the in-flight budget must stay fully saturated before it is
// reported as sustained backpressure (a warning, and a rate-controller
// backoff signal) rather than an ordinary brief burst.
export const REALTIME_ROOM_SUSTAINED_BACKPRESSURE_MS = 500;
// Buffer applied to the *measured* accepted snapshot interval (not the
// configured one) when deriving the default interpolation delay, so
// presentation adapts to reality instead of assuming the configured rate is
// actually being delivered.
export const REALTIME_ROOM_INTERPOLATION_BUFFER_INTERVALS = 1.25;

export type RealtimeRoomOutcome =
  | "rejected"
  | "invalid"
  | "rate_limited"
  | "stale"
  | "no_host"
  | "unsupported"
  | "room_closed"
  | "indeterminate";

export class RealtimeRoomError extends Error {
  constructor(
    readonly outcome: RealtimeRoomOutcome,
    message: string,
  ) {
    super(message);
    this.name = "RealtimeRoomError";
  }
}

export type Schema<T> = {
  parse(value: unknown): T;
};

export type { ConnectionState, MembershipStatus, RoomMember };

export type RealtimeRoomSnapshot<State> = {
  roomId: string;
  inviteCode: string;
  playerId: string;
  hostId: string;
  isHost: boolean;
  members: RoomMember[];
  membership: MembershipStatus;
  membershipRevision: number;
  connection: ConnectionState;
  authorityEpoch: number;
  roundSequence: number;
  authoritativeTick: number;
  state?: State;
  rttMs: number;
  jitterMs: number;
  interpolationDelayMs: number;
  pendingInputCount: number;
  pendingSnapshotCount: number;
  lastAcknowledgedInputSequence: number;
  lastError?: RealtimeRoomError;
  diagnostics?: RealtimeRoomDiagnostics;
};

export type RealtimeRoomDiagnostics = {
  inputsSent: number;
  inputsCoalesced: number;
  inputsDropped: number;
  snapshotsSent: number;
  snapshotsCoalesced: number;
  snapshotsAcked: number;
  extrapolatedFrames: number;
  framesRendered: number;
  /** Times #reconcile() recomputed a predicted state against a prior one, whether or not it produced a visible correction. */
  reconciliations: number;
  /** Corrections actually started (shouldCorrect returned true, or no shouldCorrect was configured). */
  correctionsStarted: number;
  correctionsCompleted: number;
  /** Reconciliations where shouldCorrect determined the drift was imperceptible, so no correction was started. */
  correctionsSuppressed: number;
  reconnectCount: number;
  lastReconnectDurationMs?: number;
  hostMigrationCount: number;
  lastHostMigrationDurationMs?: number;
  /** Current render-clock playback rate multiplier (nudged within ±REALTIME_ROOM_MAX_CLOCK_NUDGE). */
  renderClockRate: number;
  /** Ticks the render clock was ahead (positive) or behind (negative) of the latest snapshot at the last nudge. */
  renderClockDriftTicks: number;
  /** Wall-clock time (this client's clock) between the two most recently accepted snapshots. */
  lastSnapshotIntervalMs?: number;
  /** Interval between the host's send timestamps of the two most recently accepted snapshots (host's clock; isolates host pacing). */
  lastSnapshotHostIntervalMs?: number;
  /** Interval between the runtime's accept/broadcast timestamps of the two most recently accepted snapshots (runtime's clock; isolates relay/backpressure). */
  lastSnapshotRelayIntervalMs?: number;
  /** Smoothed deviation of this client's observed snapshot arrival interval from its running average; feeds adaptive interpolation delay. */
  snapshotArrivalJitterMs: number;
  /** Cumulative count of missing runtimeSnapshotSequence numbers observed between consecutive accepted snapshots. */
  snapshotSequenceGaps: number;
  /** Snapshots accepted before the previous one was ever sampled by getRenderState(), i.e. coalesced without ever being rendered. */
  snapshotsCoalescedOnReceive: number;
  /** Host-only: total publishSnapshot() calls, including ones coalesced away without ever being sent. */
  snapshotPublishCalls: number;
  /** Host-only: wall-clock time (this host's clock) between the two most recent publishSnapshot() calls. */
  lastSnapshotPublishIntervalMs?: number;
  /** Host-only: smoothed actual sends-per-second observed on the wire, vs. the configured snapshotHz target. */
  effectiveSnapshotHz?: number;
  /** Host-only: cumulative count of pacing windows where the host frame stalled for long enough that one or more cadence windows produced no publishSnapshot() call. */
  missedSnapshotWindows: number;
  /** Host-only: cumulative count of gaps between publishSnapshot() calls large enough to be considered a host frame stall (see REALTIME_ROOM_HOST_STALL_FACTOR). */
  hostFrameStallCount: number;
  /** Host-only: duration of the most recently observed host frame stall. */
  lastHostFrameStallMs?: number;
  /** Host-only: total snapshot submissions actually transmitted (equivalent to `snapshotsSent`, kept for clarity: this counts attempts, not runtime acceptance). */
  snapshotsAttempted: number;
  /** Host-only: submissions the runtime accepted and echoed back. */
  snapshotsAccepted: number;
  /** Host-only: submissions the runtime explicitly rejected (stale version/round, rate limited, etc). */
  snapshotsRejected: number;
  /** Host-only: submissions that never received an accepted-echo or an explicit error within the ack timeout, so their in-flight capacity was released speculatively (usually a silently-superseded/late echo the runtime drops without responding). */
  snapshotAckTimeouts: number;
  /** Host-only: cumulative time spent with the in-flight budget fully saturated (unable to send a newer state even though one was pending). */
  snapshotBackpressureDurationMs: number;
  /** Host-only: the highest number of concurrently in-flight (unacknowledged) snapshot submissions observed. */
  maxInFlightObserved: number;
  /** Host-only: smoothed rate of *accepted* echoes (vs. `effectiveSnapshotHz`, which measures attempted sends). Falls behind `effectiveSnapshotHz` when the runtime is dropping/rejecting submissions. */
  effectiveAcceptedSnapshotHz?: number;
  /** Host-only: the configured ceiling (`snapshotHz`), never exceeded regardless of adaptive-rate behavior. */
  configuredMaxSnapshotHz: number;
  /** Host-only: the rate the adaptive controller is currently targeting (equals `configuredMaxSnapshotHz` unless `adaptiveRate: true`). */
  currentTargetSnapshotHz: number;
  /** Host-only: `snapshotsAccepted / snapshotsAttempted` since the last round began. */
  snapshotAcceptanceRatio?: number;
  /** Host-only: p95 latency between a snapshot submission and its accepted-echo, over the most recent `REALTIME_ROOM_MAX_ACK_LATENCY_SAMPLES` samples. */
  snapshotAckP95Ms?: number;
  /** Host-only: how many times the adaptive rate controller reduced the target rate (rejection, timeout, or sustained backpressure). */
  adaptiveRateReductions: number;
  /** Host-only: how many times the adaptive rate controller raised the target rate after a sustained clean run. */
  adaptiveRateIncreases: number;
  /** Total setInput() calls, whether or not they resulted in a network send this turn. */
  inputCalls: number;
  /** Latest-wins input actually transmitted over the network (paced by `inputHz`); always <= `inputCalls`. */
  inputsTransmitted: number;
  /** Times the runtime rejected a realtime_input submission with RATE_LIMITED. */
  inputRateLimited: number;
  /** Guest-only: smoothed accepted-snapshot arrival rate this client actually observed, independent of what the host is configured/targeting to send. */
  guestEffectiveSnapshotHz?: number;
};

/** Host-only diagnostic warnings for publish cadence problems Loki cannot fix itself (the game controls its own frame loop). Purely informational; RealtimeRoom keeps functioning regardless. */
export type RealtimeRoomDiagnosticWarning =
  | { type: "back_to_back_publish"; intervalMs: number }
  | { type: "host_frame_stall"; stallMs: number }
  | { type: "missed_snapshot_window"; windows: number }
  | { type: "low_effective_snapshot_rate"; effectiveHz: number; targetHz: number }
  | { type: "snapshot_ack_timeout"; hostSnapshotSequence: number; timeoutMs: number }
  | { type: "snapshot_backpressure"; durationMs: number }
  | { type: "runtime_rate_limited"; operation: "realtime_snapshot" | "realtime_input"; retryAfterMs?: number }
  | { type: "high_extrapolation_ratio"; ratio: number };

export type InputsForTick<Input> = {
  latest: Record<string, Input>;
  orderedCommands: Array<{ playerId: string; inputSequence: number; input: Input }>;
};

/**
 * The independent render streams sampled on a single getRenderState() call,
 * before they are composed into one displayed State. Exposed so a game can
 * render different entities from different streams (e.g. the local entity
 * from `correctedPredicted`, remote entities from `interpolated`, and use
 * `latestAuthoritative` as a collision proxy for remotes) instead of one
 * predicted-or-authoritative value applying to the whole state at once.
 * Loki keeps `interpolated`/`latestAuthoritative` sampling independent of
 * local reconciliation: nothing here is reset, replaced, or snapped by a
 * correction, since corrections only ever affect the predicted streams.
 */
export type RealtimeRoomRenderStates<State> = {
  /** The delayed/interpolated (or extrapolated) sample of the authoritative timeline, per interpolationDelayMs. Undefined until a snapshot has been accepted. */
  interpolated?: State;
  /** The most recently accepted authoritative snapshot, with no delay/interpolation/extrapolation applied. Undefined until a snapshot has been accepted. */
  latestAuthoritative?: State;
  /** The live, continuously-advancing local prediction (held setInput() plus unacked sendInput()), with no correction blend applied. Undefined when there is nothing to predict. */
  predicted?: State;
  /** `predicted` after blendCorrection has been applied (if configured); equals `predicted` unchanged when no blendCorrection is configured or none is in flight. */
  correctedPredicted?: State;
  /** The simulation tick `interpolated` targeted (may be fractional-between two ticks, or ahead of authoritativeTick during extrapolation). */
  interpolatedTick?: number;
  /** The simulation tick of `latestAuthoritative`. */
  authoritativeTick?: number;
  /** The simulation tick `predicted`/`correctedPredicted` represent. */
  predictedTick?: number;
};

/**
 * A host-confirmed, authoritative event (e.g. a collision) delivered with a
 * stable effectId assigned by the runtime, so every member (including the
 * host) can dedupe it against their own speculative local effects
 * (particles, audio, etc.) instead of guessing from state deltas alone.
 * Loki never interprets `payload`; it is opaque game-defined JSON, exactly
 * like State and Input.
 */
export type RealtimeRoomConfirmedEffect<Effect> = {
  effectId: string;
  simulationTick: number;
  serverTime: number;
  payload: Effect;
};

export type RealtimeRoomOptions<State, Input> = {
  stateSchema?: Schema<State>;
  inputSchema?: Schema<Input>;
  predict?(state: State, input: Input, dtSeconds: number): State;
  interpolate?(from: State, to: State, t: number): State;
  extrapolate?(state: State, dtSeconds: number): State;
  /**
   * Smooths a misprediction back toward the room's live predicted state.
   * `from` is frozen at the moment the correction started (the stale,
   * pre-reconcile pose); `target` is the current #predictedState, which
   * keeps advancing every advanceFrame() while the correction is in flight.
   * `t` rises from 0 to 1 over `correctionMs`.
   */
  blendCorrection?(from: State, target: State, t: number): State;
  /**
   * Called on every reconciliation (when blendCorrection is configured) to
   * decide whether the difference between what's currently displayed and
   * the freshly reconciled prediction is large enough to warrant a visible
   * correction. Loki's state is opaque JSON, so it cannot judge position
   * units or heading radians itself; games that care about correction
   * thresholds should supply this. Returning false suppresses starting a
   * new correction (an already in-flight correction is left to finish).
   * Defaults to always correcting when omitted, matching prior behavior.
   */
  shouldCorrect?(displayed: State, reconciled: State): boolean;
  /**
   * Composes the independent render streams (see RealtimeRoomRenderStates)
   * into the single State returned by getRenderState(). Use this to render
   * different entities from different streams instead of one value applying
   * to the whole state — e.g. the local entity from `correctedPredicted`,
   * remote entities from `interpolated`, with `latestAuthoritative` used as
   * a collision proxy for remotes. Loki is state-agnostic and has no
   * concept of "entities"; the game composes its own opaque State shape.
   * Defaults to `correctedPredicted ?? interpolated` when omitted, matching
   * prior behavior (the whole state is either fully predicted or fully
   * authoritative-interpolated, never composed).
   */
  composeRenderState?(states: RealtimeRoomRenderStates<State>): State | undefined;
  /**
   * Host-only: called when Loki observes a publish-cadence problem it
   * cannot fix itself (the game owns its own frame loop). Purely
   * informational diagnostics; RealtimeRoom keeps functioning regardless
   * of whether this is provided.
   */
  onDiagnosticWarning?(event: RealtimeRoomDiagnosticWarning): void;
  simulationHz?: number;
  /** The maximum snapshot publish rate — a ceiling, never a promise of delivery. With `adaptiveRate: true`, the room starts below this and climbs toward it only after sustained clean acknowledgements. */
  snapshotHz?: number;
  /**
   * Host-only: enables the AIMD rate controller (start conservative, climb
   * slowly on sustained success, back off immediately on rejection/timeout/
   * backpressure) instead of publishing at a fixed `snapshotHz`. Defaults to
   * false, matching prior fixed-rate behavior.
   */
  adaptiveRate?: boolean;
  /** Host-only, requires `adaptiveRate`: the floor the controller will not reduce below. Defaults to `REALTIME_ROOM_DEFAULT_MIN_SNAPSHOT_HZ`. */
  minSnapshotHz?: number;
  /** Host-only, requires `adaptiveRate`: the starting target rate. Defaults to `REALTIME_ROOM_DEFAULT_INITIAL_SNAPSHOT_HZ`. */
  initialSnapshotHz?: number;
  inputHz?: number;
  interpolationDelayMs?: number;
  correctionMs?: number;
  diagnostics?: boolean;
};

export interface RealtimeRoomHost {
  playerId(): string | undefined;
  createRoom(): Promise<JoinedRoom>;
  joinRoom(input: { inviteCode: string }): Promise<JoinedRoom>;
  leaveRoom(roomId?: string): Promise<void>;
  reconnect(): Promise<void>;
  sendRealtimeInput(
    payload: unknown,
    options: {
      roundSequence: number;
      inputSequence: number;
      targetTick: number;
      delivery: RealtimeDelivery;
      clientSendTime: number;
    },
  ): Promise<void>;
  sendRealtimeSnapshot(
    state: unknown,
    options: {
      authorityEpoch: number;
      roundSequence: number;
      simulationTick: number;
      hostSnapshotSequence: number;
      hostSendTime: number;
      processedInputCursors: Record<string, number>;
    },
  ): Promise<void>;
  sendRealtimeEffect(
    payload: unknown,
    options: {
      authorityEpoch: number;
      roundSequence: number;
      simulationTick: number;
    },
  ): Promise<void>;
  sendRealtimeGuestReport(report: {
    roundSequence: number;
    effectiveSnapshotHz?: number;
    arrivalJitterMs?: number;
    sequenceGaps: number;
    extrapolatedFrameRatio: number;
    latestAuthoritativeTick?: number;
  }): Promise<void>;
  requestRealtimeSync(): Promise<void>;
  onMessage(listener: (message: ServerEnvelope) => void): () => void;
  onRealtimeMessage(listener: (message: RealtimeServerEnvelope) => void): () => void;
  onConnection?(listener: (event: ConnectionEvent) => void): () => void;
}

const monotonicNow = (): number =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

const createId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `rt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};

const cloneJson = <T>(value: T): T => {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
};

const assertJsonCompatible = (value: unknown): void => {
  canonicalJson(value);
};

const serializedBytes = (value: unknown): number =>
  new TextEncoder().encode(JSON.stringify(value)).length;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const asMembers = (list: Presence[], hostId: string): RoomMember[] =>
  list.map((member) => ({
    playerId: member.playerId,
    sessionId: member.sessionId,
    joinedAt: member.joinedAt,
    team: member.team,
    host: member.playerId === hostId || member.host,
  }));

const mergeMembers = (
  current: RoomMember[],
  message: Extract<ServerEnvelope, { type: "presence" }>,
  hostId: string,
): RoomMember[] => {
  const byId = new Map(current.map((member) => [member.playerId, member]));
  for (const leave of message.leaves) byId.delete(leave.playerId);
  for (const join of message.joins) {
    byId.set(join.playerId, {
      playerId: join.playerId,
      sessionId: join.sessionId,
      joinedAt: join.joinedAt,
      team: join.team,
      host: join.playerId === hostId || join.host,
    });
  }
  if (snapshotMembersAreComplete(message)) {
    return asMembers(message.members ?? [], hostId);
  }
  return [...byId.values()].map((member) => ({
    ...member,
    host: member.playerId === hostId,
  }));
};

type OrderedPendingEntry<Input> = {
  inputSequence: number;
  input: Input;
  targetTick: number;
  sentAt: number;
  resolve: () => void;
  reject: (error: RealtimeRoomError) => void;
};

type HostInputRecord<Input> = {
  latest?: { inputSequence: number; targetTick: number; input: Input };
  ordered: Array<{ inputSequence: number; targetTick: number; input: Input }>;
  dedupe: Set<number>;
};

// A submitted-but-not-yet-resolved publishSnapshot() call. Tracked by
// hostSnapshotSequence (rather than a flat counter) so an accepted echo,
// explicit runtime error, or ack timeout can each release the *specific*
// entry they refer to.
type PendingSnapshotSubmission = {
  simulationTick: number;
  sentAt: number;
  timeoutTimer: ReturnType<typeof setTimeout>;
};

/**
 * RealtimeRoom is Loki's continuous, host-authoritative networking layer.
 * It owns input sequencing, snapshot pacing/backpressure, stale-frame
 * rejection, prediction/interpolation orchestration, round resets, and
 * reconnect/host-migration sync. The game owns physics, rules, and
 * rendering via the predict/interpolate/extrapolate/blendCorrection
 * callbacks; RealtimeRoom never runs simulation on its own. Held setInput()
 * controls are predicted on each advanceFrame() step; sendInput() commands
 * apply one prediction step immediately. On each new snapshot, reconciliation
 * restores the authoritative state and replays unacknowledged ordered inputs
 * plus the held control for however many ticks prediction had advanced ahead
 * of the previous snapshot (bounded to REALTIME_ROOM_MAX_EXTRAPOLATION_INTERVALS
 * snapshot intervals). blendCorrection always targets the live predicted
 * state, not the delayed authoritative interpolation, so a correction
 * converges on zero-latency local prediction. The render clock re-anchors on
 * every accepted snapshot and nudges its playback rate by at most
 * REALTIME_ROOM_MAX_CLOCK_NUDGE so persistent drift between the host's tick
 * clock and the guest's is corrected gradually instead of causing runaway
 * extrapolation or stalls.
 */
export class RealtimeRoom<State, Input, Effect = unknown> {
  readonly #host: RealtimeRoomHost;
  readonly #options: RealtimeRoomOptions<State, Input>;
  readonly #listeners = new Set<(snapshot: RealtimeRoomSnapshot<State>) => void>();
  readonly #simulationHz: number;
  // Mutable when adaptiveRate is enabled: the interval derived from
  // #currentSnapshotHz, which the AIMD controller adjusts between
  // #snapshotHzFloor and #snapshotHzCeiling. Fixed at the ceiling's
  // interval (matching prior behavior) when adaptiveRate is off.
  #snapshotIntervalMs: number;
  readonly #inputIntervalMs: number;
  readonly #maxInFlightSnapshots: number;
  readonly #correctionMs: number;
  readonly #diagnosticsEnabled: boolean;
  readonly #adaptiveRateEnabled: boolean;
  readonly #snapshotHzCeiling: number;
  readonly #snapshotHzFloor: number;
  readonly #initialSnapshotHz: number;
  #currentSnapshotHz: number;

  #unsubscribe?: () => void;
  #unsubscribeRealtime?: () => void;
  #unsubscribeConnection?: () => void;
  #playerId = "";
  #roomId = "";
  #inviteCode = "";
  #hostId = "";
  #members: RoomMember[] = [];
  #membersComplete = false;
  #membershipRevision = 0;
  #connection: ConnectionState = "idle";
  #lastError?: RealtimeRoomError;
  #generation = 0;
  #explicitReconnect = false;
  #reconnectStartedAt?: number;
  #migrationStartedAt?: number;

  // Fencing.
  #authorityEpoch = 0;
  #roundSequence = 0;

  // Self input state (used whether or not this client is host).
  #inputSequence = 0;
  #latestInput?: Input;
  #latestInputTimer?: ReturnType<typeof setInterval>;
  #orderedPending = new Map<number, OrderedPendingEntry<Input>>();
  #lastAcknowledgedInputSequence = -1;

  // Host-only aggregation of inbound realtime input.
  readonly #hostInputs = new Map<string, HostInputRecord<Input>>();
  readonly #hostProcessedCursors = new Map<string, number>();
  #hostSnapshotSequence = 0;
  #pendingSnapshot?: { state: State; simulationTick: number };
  readonly #pendingSnapshotSubmissions = new Map<number, PendingSnapshotSubmission>();
  #lastSnapshotSentAt = 0;
  #snapshotFlushTimer?: ReturnType<typeof setTimeout>;
  #flushMicrotaskScheduled = false;
  #lastSentSimulationTick = -1;
  // Set when the runtime responds RATE_LIMITED to a snapshot submission;
  // the next flush attempt waits at least until this time before retrying.
  #snapshotRateLimitedUntil?: number;
  // How long the in-flight budget has been continuously fully saturated
  // (see REALTIME_ROOM_SUSTAINED_BACKPRESSURE_MS), for
  // snapshotBackpressureDurationMs and the sustained-backpressure warning.
  #backpressureStartedAt?: number;
  // Consecutive accepted sends with no rejection/timeout since the last
  // rate change; the adaptive controller only raises the target once this
  // reaches REALTIME_ROOM_RATE_INCREASE_STREAK.
  #cleanSendStreak = 0;
  #lastRateIncreaseAt?: number;
  #lastAcceptedSnapshotAt?: number;
  #smoothedAcceptedSnapshotHz?: number;
  // Bounded rolling window of publishSnapshot()->accepted-echo latencies,
  // for snapshotAckP95Ms.
  #ackLatencySamples: number[] = [];

  // Host-only publish cadence diagnostics: measured from publishSnapshot()
  // call times (the host's own clock) and from actual send times, so a
  // stalled host frame loop can be told apart from Loki's own pacing.
  #lastPublishCallAt?: number;
  #smoothedEffectiveHz?: number;

  // Paced, latest-wins network transmission of setInput() controls,
  // independent from the immediate local-prediction update: setInput()
  // always updates #latestInput synchronously, but the network send is
  // throttled to at most once per #inputIntervalMs.
  #lastInputSentAt = 0;
  #inputSendTimer?: ReturnType<typeof setTimeout>;

  // Bounded rolling window used to detect *sustained* high extrapolation
  // (vs. the lifetime extrapolatedFrames/framesRendered average), and a
  // guest-only periodic report of the same signal to the host.
  #extrapolationWindowCount = 0;
  #extrapolationWindowExtrapolated = 0;
  #lastExtrapolationWarningAt?: number;
  #guestReportTimer?: ReturnType<typeof setInterval>;
  // Host-only: the worst (highest) extrapolatedFrameRatio any guest has
  // reported this round, used as an additional backoff signal for the
  // adaptive rate controller beyond the host's own send/ack cadence.
  #worstGuestExtrapolationRatio = 0;

  // Authoritative timeline (both host and guest observe broadcasts).
  #previousSnapshot?: { state: State; simulationTick: number };
  #latestSnapshot?: { state: State; simulationTick: number };

  // Presentation-only local prediction: held setInput() plus unacked sendInput().
  #predictedState?: State;
  // Simulation tick the current #predictedState represents, so reconciliation
  // knows how many ticks of held input to replay. -1 means no prediction.
  #predictedTick = -1;
  #pendingCorrection?: { from: State };
  #correctionStartedAt?: number;
  // The last state actually returned by getRenderState(), i.e. what the game
  // displayed. Corrections rebase from this (not a frozen prediction) so a
  // new snapshot arriving mid-correction continues smoothly from what's on
  // screen instead of snapping back to a stale pose.
  #lastDisplayedState?: State;

  // RTT/jitter estimate derived from ordered-input ack round trips.
  #smoothedRttMs = 0;
  #jitterMs = 0;

  // Snapshot cadence measured at three independent clock domains: the host's
  // send clock, the runtime's accept/broadcast clock, and this client's own
  // arrival clock (#lastSnapshotReceivedAt below), so unevenness can be
  // attributed to host pacing, relay/backpressure, or the network.
  #lastSnapshotHostSendTime?: number;
  #lastSnapshotServerTime?: number;
  #smoothedSnapshotIntervalMs?: number;
  #snapshotJitterMs = 0;
  #lastRuntimeSnapshotSequence?: number;
  // Whether getRenderState() has sampled the authoritative timeline since the
  // last accepted snapshot; if a new snapshot arrives while this is still
  // false, the previous one was never rendered (coalesced).
  #sampledSinceLastSnapshot = true;

  // Confirmed-effects: bounded dedupe of effectIds already delivered to
  // listeners (covers redelivery and retained-effect replay on sync), plus
  // the listeners themselves. Loki never interprets effect payloads.
  readonly #effectListeners = new Set<(effect: RealtimeRoomConfirmedEffect<Effect>) => void>();
  readonly #seenEffectIds = new Set<string>();
  #seenEffectOrder: string[] = [];

  readonly #diagnostics: RealtimeRoomDiagnostics = {
    inputsSent: 0,
    inputsCoalesced: 0,
    inputsDropped: 0,
    snapshotsSent: 0,
    snapshotsCoalesced: 0,
    snapshotsAcked: 0,
    extrapolatedFrames: 0,
    framesRendered: 0,
    reconciliations: 0,
    correctionsStarted: 0,
    correctionsCompleted: 0,
    correctionsSuppressed: 0,
    reconnectCount: 0,
    hostMigrationCount: 0,
    renderClockRate: 1,
    renderClockDriftTicks: 0,
    snapshotArrivalJitterMs: 0,
    snapshotSequenceGaps: 0,
    snapshotsCoalescedOnReceive: 0,
    snapshotPublishCalls: 0,
    missedSnapshotWindows: 0,
    hostFrameStallCount: 0,
    snapshotsAttempted: 0,
    snapshotsAccepted: 0,
    snapshotsRejected: 0,
    snapshotAckTimeouts: 0,
    snapshotBackpressureDurationMs: 0,
    maxInFlightObserved: 0,
    configuredMaxSnapshotHz: 0,
    currentTargetSnapshotHz: 0,
    adaptiveRateReductions: 0,
    adaptiveRateIncreases: 0,
    inputCalls: 0,
    inputsTransmitted: 0,
    inputRateLimited: 0,
  };

  constructor(host: RealtimeRoomHost, options: RealtimeRoomOptions<State, Input> = {}) {
    this.#host = host;
    this.#options = options;
    this.#simulationHz = clamp(options.simulationHz ?? 60, 1, 240);
    this.#snapshotHzCeiling = clamp(
      options.snapshotHz ?? REALTIME_ROOM_DEFAULT_SNAPSHOT_HZ,
      1,
      REALTIME_ROOM_MAX_SNAPSHOT_HZ,
    );
    this.#adaptiveRateEnabled = options.adaptiveRate ?? false;
    // Without adaptiveRate, the floor and initial rate both equal the
    // ceiling: the room publishes at exactly the configured snapshotHz,
    // matching prior fixed-rate behavior exactly.
    this.#snapshotHzFloor = this.#adaptiveRateEnabled
      ? clamp(options.minSnapshotHz ?? REALTIME_ROOM_DEFAULT_MIN_SNAPSHOT_HZ, 1, this.#snapshotHzCeiling)
      : this.#snapshotHzCeiling;
    this.#initialSnapshotHz = this.#adaptiveRateEnabled
      ? clamp(
          options.initialSnapshotHz ?? REALTIME_ROOM_DEFAULT_INITIAL_SNAPSHOT_HZ,
          this.#snapshotHzFloor,
          this.#snapshotHzCeiling,
        )
      : this.#snapshotHzCeiling;
    this.#currentSnapshotHz = this.#initialSnapshotHz;
    const inputHz = clamp(options.inputHz ?? REALTIME_ROOM_MAX_INPUT_HZ, 1, REALTIME_ROOM_MAX_INPUT_HZ);
    this.#snapshotIntervalMs = 1000 / this.#currentSnapshotHz;
    this.#inputIntervalMs = 1000 / inputHz;
    // In-flight budget scales with the ceiling (the highest rate the
    // adaptive controller might ramp up to), not the current target, so
    // headroom is already available before any rate increase.
    this.#maxInFlightSnapshots = clamp(
      Math.ceil((REALTIME_ROOM_IN_FLIGHT_BUDGET_MS / 1000) * this.#snapshotHzCeiling),
      REALTIME_ROOM_DEFAULT_IN_FLIGHT_SNAPSHOTS,
      REALTIME_ROOM_MAX_IN_FLIGHT_SNAPSHOTS,
    );
    this.#correctionMs = Math.max(0, options.correctionMs ?? REALTIME_ROOM_DEFAULT_CORRECTION_MS);
    this.#diagnosticsEnabled = options.diagnostics ?? false;
    this.#diagnostics.configuredMaxSnapshotHz = this.#snapshotHzCeiling;
    this.#diagnostics.currentTargetSnapshotHz = this.#currentSnapshotHz;
  }

  get isHost(): boolean {
    return Boolean(this.#playerId) && this.#playerId === this.#hostId;
  }

  get members(): RoomMember[] {
    return this.#members.map((member) => ({ ...member }));
  }

  getSnapshot(): RealtimeRoomSnapshot<State> {
    return {
      roomId: this.#roomId,
      inviteCode: this.#inviteCode,
      playerId: this.#playerId,
      hostId: this.#hostId,
      isHost: this.isHost,
      members: this.members,
      membership: this.#membershipStatus(),
      membershipRevision: this.#membershipRevision,
      connection: this.#connection,
      authorityEpoch: this.#authorityEpoch,
      roundSequence: this.#roundSequence,
      authoritativeTick: this.#latestSnapshot?.simulationTick ?? -1,
      state: this.#latestSnapshot ? cloneJson(this.#latestSnapshot.state) : undefined,
      rttMs: this.#smoothedRttMs,
      jitterMs: this.#jitterMs,
      interpolationDelayMs: this.#interpolationDelayMs(),
      pendingInputCount: this.#orderedPending.size,
      pendingSnapshotCount: this.#pendingSnapshotSubmissions.size + (this.#pendingSnapshot ? 1 : 0),
      lastAcknowledgedInputSequence: this.#lastAcknowledgedInputSequence,
      lastError: this.#lastError,
      diagnostics: this.#diagnosticsEnabled ? this.#computeDiagnostics() : undefined,
    };
  }

  #computeDiagnostics(): RealtimeRoomDiagnostics {
    return {
      ...this.#diagnostics,
      snapshotAcceptanceRatio:
        this.#diagnostics.snapshotsAttempted > 0
          ? this.#diagnostics.snapshotsAccepted / this.#diagnostics.snapshotsAttempted
          : undefined,
      snapshotAckP95Ms: this.#computeAckLatencyP95(),
      guestEffectiveSnapshotHz:
        this.#smoothedSnapshotIntervalMs !== undefined ? 1000 / this.#smoothedSnapshotIntervalMs : undefined,
    };
  }

  #computeAckLatencyP95(): number | undefined {
    if (this.#ackLatencySamples.length === 0) return undefined;
    const sorted = [...this.#ackLatencySamples].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
    return sorted[index];
  }

  subscribe(listener: (snapshot: RealtimeRoomSnapshot<State>) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async create(): Promise<RealtimeRoomSnapshot<State>> {
    return this.#enter(() => this.#host.createRoom());
  }

  async join(input: { inviteCode: string }): Promise<RealtimeRoomSnapshot<State>> {
    return this.#enter(() => this.#host.joinRoom(input));
  }

  async leave(): Promise<void> {
    this.#generation += 1;
    this.#setConnection("leaving");
    this.#rejectAllPending("room_closed", "room left");
    this.#clearTimers();
    const roomId = this.#roomId;
    try {
      await this.#host.leaveRoom(roomId || undefined);
      this.#clearIdentity();
      this.#unbind();
      this.#setConnection("closed");
    } catch (error) {
      this.#setConnection("leave_failed");
      throw error;
    }
  }

  async close(): Promise<void> {
    this.#generation += 1;
    this.#rejectAllPending("room_closed", "room closed");
    this.#clearTimers();
    const roomId = this.#roomId;
    this.#clearIdentity();
    this.#unbind();
    this.#setConnection("closed");
    try {
      await this.#host.leaveRoom(roomId || undefined);
    } catch {
      // close() may abandon an unresolved leave.
    }
  }

  async reconnect(): Promise<void> {
    if (this.#isTerminal()) {
      throw new RealtimeRoomError("rejected", "cannot reconnect from a terminal state");
    }
    this.#explicitReconnect = true;
    this.#reconnectStartedAt = monotonicNow();
    this.#bind();
    this.#setConnection("reconnecting");
    try {
      await this.#host.reconnect();
      this.#setConnection("resynchronizing");
      await this.#host.requestRealtimeSync();
    } catch (error) {
      this.#setConnection("reconnecting");
      throw error;
    } finally {
      this.#explicitReconnect = false;
    }
  }

  /**
   * Latest-wins continuous control input. Updates local prediction
   * immediately (safe to call every render frame), but network
   * transmission is paced to at most once per `inputHz` interval: calls
   * made faster than that only replace the pending value (coalesced) and
   * the most recent one is sent when the interval elapses. Held controls
   * are also periodically refreshed at the same cadence.
   */
  setInput(input: Input): void {
    if (this.#connection === "closed" || this.#connection === "failed") {
      throw new RealtimeRoomError("rejected", "room is not connected");
    }
    const parsed = this.#parseInput(input);
    assertJsonCompatible(parsed);
    this.#latestInput = parsed;
    this.#diagnostics.inputCalls += 1;
    this.#armInputResendTimer();
    this.#scheduleInputSend();
  }

  /**
   * Sends #latestInput now if at least #inputIntervalMs has elapsed since
   * the last network send; otherwise coalesces this call away and arms a
   * single timer (if one isn't already pending) to flush whatever the
   * latest value is once the interval elapses.
   */
  #scheduleInputSend(): void {
    const elapsed = monotonicNow() - this.#lastInputSentAt;
    if (elapsed >= this.#inputIntervalMs) {
      void this.#sendLatestInput();
      return;
    }
    this.#diagnostics.inputsCoalesced += 1;
    if (this.#inputSendTimer) return;
    const wait = this.#inputIntervalMs - elapsed;
    this.#inputSendTimer = setTimeout(() => {
      this.#inputSendTimer = undefined;
      if (this.#latestInput === undefined) return;
      if (this.#connection === "closed" || this.#connection === "failed") return;
      void this.#sendLatestInput();
    }, wait);
    this.#inputSendTimer.unref?.();
  }

  /** Bounded one-shot command retained until acknowledged by the host. */
  async sendInput(input: Input, options: { delivery: "ordered" } = { delivery: "ordered" }): Promise<void> {
    void options;
    if (this.#connection === "closed" || this.#connection === "failed") {
      throw new RealtimeRoomError("rejected", "room is not connected");
    }
    if (this.#orderedPending.size >= REALTIME_ROOM_MAX_ORDERED_INPUTS) {
      throw new RealtimeRoomError("rejected", "ordered input queue is full");
    }
    const parsed = this.#parseInput(input);
    assertJsonCompatible(parsed);
    if (serializedBytes(parsed) > REALTIME_ROOM_MAX_MESSAGE_BYTES) {
      throw new RealtimeRoomError("invalid", "input exceeds maximum size");
    }
    const inputSequence = ++this.#inputSequence;
    const targetTick = Math.max(0, (this.#latestSnapshot?.simulationTick ?? 0) + 1);
    const promise = new Promise<void>((resolve, reject) => {
      this.#orderedPending.set(inputSequence, {
        inputSequence,
        input: parsed,
        targetTick,
        sentAt: monotonicNow(),
        resolve,
        reject,
      });
    });
    this.#stepPrediction(parsed);
    await this.#sendOrderedInput(inputSequence, parsed, targetTick);
    return promise;
  }

  /** Host-only: server-ordered inputs eligible for a given fixed simulation step. */
  inputsForTick(simulationTick: number): InputsForTick<Input> {
    if (!this.isHost) {
      throw new RealtimeRoomError("rejected", "inputsForTick is host-only");
    }
    const latest: Record<string, Input> = {};
    const orderedCommands: Array<{ playerId: string; inputSequence: number; input: Input }> = [];
    for (const [playerId, record] of this.#hostInputs) {
      let cursor = this.#hostProcessedCursors.get(playerId) ?? -1;
      if (record.latest) {
        latest[playerId] = record.latest.input;
        cursor = Math.max(cursor, record.latest.inputSequence);
      }
      const remaining: typeof record.ordered = [];
      for (const command of record.ordered) {
        if (command.targetTick <= simulationTick) {
          orderedCommands.push({ playerId, inputSequence: command.inputSequence, input: command.input });
          cursor = Math.max(cursor, command.inputSequence);
        } else {
          remaining.push(command);
        }
      }
      record.ordered = remaining;
      if (cursor >= 0) this.#hostProcessedCursors.set(playerId, cursor);
    }
    orderedCommands.sort((left, right) =>
      left.inputSequence === right.inputSequence
        ? left.playerId.localeCompare(right.playerId)
        : left.inputSequence - right.inputSequence,
    );
    return { latest, orderedCommands };
  }

  /** Host-only, non-blocking: publish the latest simulated state. Loki paces/coalesces sends. */
  publishSnapshot(state: State, options: { simulationTick: number }): void {
    if (!this.isHost) {
      throw new RealtimeRoomError("rejected", "publishSnapshot is host-only");
    }
    if (options.simulationTick <= this.#lastSentSimulationTick) return;
    const parsed = this.#parseState(state);
    assertJsonCompatible(parsed);
    if (this.#pendingSnapshot) this.#diagnostics.snapshotsCoalesced += 1;
    this.#pendingSnapshot = { state: parsed, simulationTick: options.simulationTick };
    this.#recordPublishCadence();
    // Defer the actual flush attempt to a microtask so that if the game
    // calls publishSnapshot() more than once within the same synchronous
    // turn (e.g. a catch-up frame simulating several steps at once), every
    // call after the first only overwrites #pendingSnapshot; the flush that
    // finally runs always sees the newest state and Loki transmits once.
    this.#scheduleFlush();
  }

  #scheduleFlush(): void {
    if (this.#flushMicrotaskScheduled) return;
    this.#flushMicrotaskScheduled = true;
    queueMicrotask(() => {
      this.#flushMicrotaskScheduled = false;
      this.#attemptFlush();
    });
  }

  /**
   * Tracks publishSnapshot() call cadence on the host's own clock (distinct
   * from the send-pacing diagnostics measured in #attemptFlush) and raises
   * onDiagnosticWarning for problems Loki cannot fix itself: the game is
   * calling publishSnapshot back-to-back faster than its own configured
   * rate needs, or the gap between calls is large enough that the host's
   * own frame loop appears to have stalled (long GC pause, backgrounded
   * tab, etc.), which will also show up as one or more missed cadence
   * windows.
   */
  #recordPublishCadence(): void {
    const now = monotonicNow();
    this.#diagnostics.snapshotPublishCalls += 1;
    if (this.#lastPublishCallAt !== undefined) {
      const interval = now - this.#lastPublishCallAt;
      this.#diagnostics.lastSnapshotPublishIntervalMs = interval;
      if (interval < this.#snapshotIntervalMs * REALTIME_ROOM_BACK_TO_BACK_PUBLISH_FACTOR) {
        this.#warn({ type: "back_to_back_publish", intervalMs: interval });
      }
      const stallThresholdMs = Math.max(
        this.#snapshotIntervalMs * REALTIME_ROOM_HOST_STALL_FACTOR,
        REALTIME_ROOM_HOST_STALL_FLOOR_MS,
      );
      if (interval > stallThresholdMs) {
        this.#diagnostics.hostFrameStallCount += 1;
        this.#diagnostics.lastHostFrameStallMs = interval;
        this.#warn({ type: "host_frame_stall", stallMs: interval });
        const missedWindows = Math.max(0, Math.floor(interval / this.#snapshotIntervalMs) - 1);
        if (missedWindows > 0) {
          this.#diagnostics.missedSnapshotWindows += missedWindows;
          this.#warn({ type: "missed_snapshot_window", windows: missedWindows });
        }
      }
    }
    this.#lastPublishCallAt = now;
  }

  #warn(event: RealtimeRoomDiagnosticWarning): void {
    try {
      this.#options.onDiagnosticWarning?.(event);
    } catch {
      // Diagnostic warnings must not break the host's send path.
    }
  }

  /**
   * Host-only, fire-and-forget: confirms an authoritative event (e.g. a
   * collision) with a stable, runtime-assigned effectId, reliably broadcast
   * to every member (including this host, via the same onConfirmedEffect
   * path everyone else uses) so games can dedupe speculative local effects
   * against the confirmed outcome instead of guessing from state deltas.
   * Loki never interprets `payload`.
   */
  sendEffect(payload: Effect, options: { simulationTick: number }): void {
    if (!this.isHost) {
      throw new RealtimeRoomError("rejected", "sendEffect is host-only");
    }
    assertJsonCompatible(payload);
    void this.#host
      .sendRealtimeEffect(payload, {
        authorityEpoch: this.#authorityEpoch,
        roundSequence: this.#roundSequence,
        simulationTick: options.simulationTick,
      })
      .catch(() => undefined);
  }

  /**
   * Subscribes to host-confirmed effects (see sendEffect). Delivers each
   * distinct effectId at most once per subscriber, covering both live
   * broadcast and retained-effect replay after reconnect/host-migration
   * sync (bounded to the most recent REALTIME_ROOM_MAX_SEEN_EFFECT_IDS).
   */
  onConfirmedEffect(listener: (effect: RealtimeRoomConfirmedEffect<Effect>) => void): () => void {
    this.#effectListeners.add(listener);
    return () => this.#effectListeners.delete(listener);
  }

  #recordEffect(effect: RealtimeRoomConfirmedEffect<Effect>): boolean {
    if (this.#seenEffectIds.has(effect.effectId)) return false;
    this.#seenEffectIds.add(effect.effectId);
    this.#seenEffectOrder.push(effect.effectId);
    if (this.#seenEffectOrder.length > REALTIME_ROOM_MAX_SEEN_EFFECT_IDS) {
      const evicted = this.#seenEffectOrder.shift();
      if (evicted !== undefined) this.#seenEffectIds.delete(evicted);
    }
    return true;
  }

  #emitEffect(effect: RealtimeRoomConfirmedEffect<Effect>): void {
    for (const listener of this.#effectListeners) {
      try {
        listener(effect);
      } catch {
        // Effect listeners must not break message handling.
      }
    }
  }

  /** Host-only: increments roundSequence, resets input/prediction state, publishes tick zero. */
  beginRound(initialState: State): void {
    if (!this.isHost) {
      throw new RealtimeRoomError("rejected", "beginRound is host-only");
    }
    this.#roundSequence += 1;
    this.#hostInputs.clear();
    this.#hostProcessedCursors.clear();
    this.#hostSnapshotSequence = 0;
    this.#lastSentSimulationTick = -1;
    this.#pendingSnapshot = undefined;
    this.#resetSnapshotPacingState();
    this.#previousSnapshot = undefined;
    this.#latestSnapshot = undefined;
    this.#predictedState = undefined;
    this.#predictedTick = -1;
    this.#pendingCorrection = undefined;
    this.#correctionStartedAt = undefined;
    this.#lastDisplayedState = undefined;
    this.#renderClockAnchor = undefined;
    this.#renderClockRate = 1;
    this.#lastSnapshotReceivedAt = undefined;
    this.#lastInterpolatedTick = undefined;
    this.#lastSnapshotHostSendTime = undefined;
    this.#lastSnapshotServerTime = undefined;
    this.#smoothedSnapshotIntervalMs = undefined;
    this.#snapshotJitterMs = 0;
    this.#lastRuntimeSnapshotSequence = undefined;
    this.#sampledSinceLastSnapshot = true;
    this.#lastPublishCallAt = undefined;
    this.#smoothedEffectiveHz = undefined;
    this.#seenEffectIds.clear();
    this.#seenEffectOrder = [];
    this.#extrapolationWindowCount = 0;
    this.#extrapolationWindowExtrapolated = 0;
    for (const pending of this.#orderedPending.values()) {
      pending.reject(new RealtimeRoomError("stale", "round restarted"));
    }
    this.#orderedPending.clear();
    const parsed = this.#parseState(initialState);
    assertJsonCompatible(parsed);
    this.#hostSnapshotSequence += 1;
    const hostSnapshotSequence = this.#hostSnapshotSequence;
    const sentAt = monotonicNow();
    const timeoutMs = Math.max(
      REALTIME_ROOM_SNAPSHOT_ACK_TIMEOUT_FLOOR_MS,
      this.#snapshotIntervalMs * REALTIME_ROOM_SNAPSHOT_ACK_TIMEOUT_FACTOR,
    );
    const timeoutTimer = setTimeout(() => this.#onSnapshotAckTimeout(hostSnapshotSequence), timeoutMs);
    timeoutTimer.unref?.();
    this.#pendingSnapshotSubmissions.set(hostSnapshotSequence, { simulationTick: 0, sentAt, timeoutTimer });
    void this.#host
      .sendRealtimeSnapshot(parsed, {
        authorityEpoch: this.#authorityEpoch,
        roundSequence: this.#roundSequence,
        simulationTick: 0,
        hostSnapshotSequence,
        hostSendTime: Date.now(),
        processedInputCursors: {},
      })
      .catch(() => {
        this.#releasePendingSnapshot(hostSnapshotSequence);
        this.#diagnostics.snapshotsRejected += 1;
      });
    this.#lastSentSimulationTick = 0;
    this.#lastSnapshotSentAt = sentAt;
    this.#diagnostics.snapshotsSent += 1;
    this.#diagnostics.snapshotsAttempted += 1;
    if (this.#latestInput !== undefined) void this.#sendLatestInput();
    this.#emit();
  }

  /** Advances Loki's fixed-step presentation accumulator; call from the game's rAF loop. */
  advanceFrame(now: number): void {
    const fixedStepMs = 1000 / this.#simulationHz;
    if (this.#lastFrameAt === undefined) {
      this.#lastFrameAt = now;
      return;
    }
    let dt = now - this.#lastFrameAt;
    this.#lastFrameAt = now;
    const maxDt = fixedStepMs * (REALTIME_ROOM_MAX_CATCHUP_STEPS + 1);
    dt = clamp(dt, 0, maxDt);
    this.#accumulatorMs += dt;
    let steps = 0;
    while (this.#accumulatorMs >= fixedStepMs && steps < REALTIME_ROOM_MAX_CATCHUP_STEPS) {
      this.#accumulatorMs -= fixedStepMs;
      steps += 1;
      if (this.#latestInput !== undefined) this.#stepPrediction(this.#latestInput);
    }
    if (steps === REALTIME_ROOM_MAX_CATCHUP_STEPS) {
      this.#accumulatorMs = Math.min(this.#accumulatorMs, fixedStepMs);
    }
  }

  #lastFrameAt?: number;
  #accumulatorMs = 0;

  /**
   * Samples every independent render stream (delayed/interpolated
   * authoritative, latest authoritative, raw predicted, correction-blended
   * predicted) plus their timeline ticks, without composing them into one
   * displayed State. This is the same sampling getRenderState() performs
   * internally; call it directly when a compositor needs to render
   * different entities from different streams (see RealtimeRoomRenderStates).
   * Authoritative sampling here is independent of reconciliation: nothing
   * a local correction does can reset, replace, or snap this stream.
   * Call this (or `getRenderState()`, which calls it internally) at most
   * once per rendered frame with that frame's `now`: each call advances
   * frame-scoped diagnostics counters (`framesRendered`,
   * `extrapolatedFrames`) and can complete an in-flight correction, so
   * calling it more than once per frame double-counts that bookkeeping
   * and can end a correction a frame early.
   */
  getRenderStates(now: number): RealtimeRoomRenderStates<State> {
    const interpolated = this.#sampleAuthoritative(now);
    const predicted = this.#predictedState;
    const correctedPredicted = this.#applyCorrection(now, predicted);
    return {
      interpolated,
      latestAuthoritative: this.#latestSnapshot?.state,
      predicted,
      correctedPredicted,
      interpolatedTick: this.#lastInterpolatedTick,
      authoritativeTick: this.#latestSnapshot?.simulationTick,
      predictedTick: this.#predictedTick >= 0 ? this.#predictedTick : undefined,
    };
  }

  /** Samples the authoritative timeline for rendering: prediction, interpolation, and correction. */
  getRenderState(now: number): State | undefined {
    const states = this.getRenderStates(now);
    const result = this.#options.composeRenderState
      ? this.#options.composeRenderState(states)
      : (states.correctedPredicted ?? states.interpolated);
    this.#lastDisplayedState = result;
    return result;
  }

  /** Blends a raw predicted state toward itself via blendCorrection while a correction is in flight; a no-op passthrough otherwise. Never touches the authoritative streams. */
  #applyCorrection(now: number, predicted: State | undefined): State | undefined {
    if (predicted === undefined || !this.#options.blendCorrection) return predicted;
    const from = this.#pendingCorrection?.from ?? predicted;
    if (this.#pendingCorrection && this.#correctionStartedAt === undefined) {
      this.#correctionStartedAt = now;
    }
    const t = !this.#pendingCorrection
      ? 0
      : this.#correctionMs <= 0
        ? 1
        : clamp((now - (this.#correctionStartedAt ?? now)) / this.#correctionMs, 0, 1);
    // Blend toward the live, continuously-advancing predicted state, not the
    // delayed authoritative interpolation. #predictedState keeps stepping
    // forward every advanceFrame() while a correction is in flight, so the
    // target here is never latency-behind; the correction converges on
    // zero-latency local prediction instead of snapping back to state that
    // is interpolationDelayMs old.
    const blended = this.#options.blendCorrection(from, predicted, t);
    if (this.#pendingCorrection && t >= 1) {
      this.#pendingCorrection = undefined;
      this.#correctionStartedAt = undefined;
      this.#diagnostics.correctionsCompleted += 1;
    }
    return blended;
  }

  #sampleAuthoritative(now: number): State | undefined {
    const latest = this.#latestSnapshot;
    if (!latest) {
      this.#lastInterpolatedTick = undefined;
      return undefined;
    }
    this.#sampledSinceLastSnapshot = true;
    this.#diagnostics.framesRendered += 1;
    const fixedStepMs = 1000 / this.#simulationHz;
    const delayTicks = Math.max(0, Math.round(this.#interpolationDelayMs() / fixedStepMs));
    const renderClockTick = this.#renderClockTick(now, fixedStepMs);
    const targetTick = renderClockTick - delayTicks;
    this.#lastInterpolatedTick = targetTick;
    const previous = this.#previousSnapshot;
    if (targetTick <= latest.simulationTick && previous && previous.simulationTick < latest.simulationTick) {
      const span = latest.simulationTick - previous.simulationTick;
      const t = span <= 0 ? 1 : clamp((targetTick - previous.simulationTick) / span, 0, 1);
      if (this.#options.interpolate) {
        return this.#options.interpolate(previous.state, latest.state, t);
      }
      return latest.state;
    }
    if (targetTick > latest.simulationTick) {
      const extraTicks = Math.min(
        targetTick - latest.simulationTick,
        REALTIME_ROOM_MAX_EXTRAPOLATION_INTERVALS * Math.round(this.#effectiveSnapshotIntervalMs() / fixedStepMs),
      );
      if (this.#options.extrapolate && extraTicks > 0) {
        this.#diagnostics.extrapolatedFrames += 1;
        this.#recordExtrapolationSample(true);
        return this.#options.extrapolate(latest.state, (extraTicks * fixedStepMs) / 1000);
      }
    }
    this.#recordExtrapolationSample(false);
    return latest.state;
  }

  /** The measured accepted-snapshot interval when available, falling back to the configured/current target interval before enough samples exist. Extrapolation bounds and render-clock nudging use this instead of the configured interval so presentation adapts to reality (e.g. a configured 30 Hz room actually delivering at 8 Hz) rather than assuming the request is being honored. */
  #effectiveSnapshotIntervalMs(): number {
    return this.#smoothedSnapshotIntervalMs ?? this.#snapshotIntervalMs;
  }

  /**
   * Tracks a bounded rolling window of whether recent samples had to
   * extrapolate, to detect *sustained* high extrapolation (vs. the
   * lifetime extrapolatedFrames/framesRendered average) and warn once per
   * window when it crosses REALTIME_ROOM_HIGH_EXTRAPOLATION_RATIO.
   */
  #recordExtrapolationSample(extrapolated: boolean): void {
    this.#extrapolationWindowCount += 1;
    if (extrapolated) this.#extrapolationWindowExtrapolated += 1;
    if (this.#extrapolationWindowCount < REALTIME_ROOM_EXTRAPOLATION_WINDOW) return;
    const ratio = this.#extrapolationWindowExtrapolated / this.#extrapolationWindowCount;
    this.#extrapolationWindowCount = 0;
    this.#extrapolationWindowExtrapolated = 0;
    if (ratio <= REALTIME_ROOM_HIGH_EXTRAPOLATION_RATIO) return;
    const now = monotonicNow();
    if (this.#lastExtrapolationWarningAt !== undefined && now - this.#lastExtrapolationWarningAt < 5_000) return;
    this.#lastExtrapolationWarningAt = now;
    this.#warn({ type: "high_extrapolation_ratio", ratio });
  }

  #renderClockAnchor?: { now: number; tick: number };
  #renderClockRate = 1;
  #lastSnapshotReceivedAt?: number;
  // The simulation tick the authoritative interpolation last targeted;
  // exposed via getRenderStates().interpolatedTick.
  #lastInterpolatedTick?: number;

  #renderClockTick(now: number, fixedStepMs: number): number {
    const latestTick = this.#latestSnapshot?.simulationTick ?? 0;
    if (!this.#renderClockAnchor) {
      this.#renderClockAnchor = { now, tick: latestTick };
      this.#renderClockRate = 1;
    }
    const elapsedTicks = ((now - this.#renderClockAnchor.now) / fixedStepMs) * this.#renderClockRate;
    return Math.round(this.#renderClockAnchor.tick + elapsedTicks);
  }

  /**
   * Re-anchors the render clock to every accepted snapshot without letting the
   * visible render tick jump, then nudges the playback rate by at most
   * REALTIME_ROOM_MAX_CLOCK_NUDGE toward the host's actual tick cadence. This
   * corrects persistent drift gradually instead of letting the render clock
   * race permanently ahead (runaway extrapolation) or fall permanently behind
   * (stalled interpolation).
   */
  #nudgeRenderClock(now: number): void {
    const latest = this.#latestSnapshot;
    if (!latest) return;
    const fixedStepMs = 1000 / this.#simulationHz;
    if (!this.#renderClockAnchor) {
      this.#renderClockAnchor = { now, tick: latest.simulationTick };
      this.#renderClockRate = 1;
      this.#diagnostics.renderClockRate = 1;
      this.#diagnostics.renderClockDriftTicks = 0;
      return;
    }
    const estimatedTick = this.#renderClockTick(now, fixedStepMs);
    const error = latest.simulationTick - estimatedTick;
    this.#renderClockAnchor = { now, tick: estimatedTick };
    const snapshotIntervalTicks = Math.max(1, Math.round(this.#effectiveSnapshotIntervalMs() / fixedStepMs));
    const correctionPerTick = clamp(
      error / snapshotIntervalTicks,
      -REALTIME_ROOM_MAX_CLOCK_NUDGE,
      REALTIME_ROOM_MAX_CLOCK_NUDGE,
    );
    this.#renderClockRate = clamp(
      1 + correctionPerTick,
      1 - REALTIME_ROOM_MAX_CLOCK_NUDGE,
      1 + REALTIME_ROOM_MAX_CLOCK_NUDGE,
    );
    this.#diagnostics.renderClockRate = this.#renderClockRate;
    this.#diagnostics.renderClockDriftTicks = error;
  }

  #interpolationDelayMs(): number {
    if (this.#options.interpolationDelayMs !== undefined) {
      return Math.max(0, this.#options.interpolationDelayMs);
    }
    // Adapt to whichever signal implies the largest buffer is needed:
    // ordered-input RTT jitter (useful before any snapshot has arrived),
    // observed snapshot-arrival jitter (how uneven the feed is), or a
    // buffer over the *measured* accepted-snapshot interval (not the
    // configured target) so a room configured for e.g. 30 Hz but actually
    // only delivering ~8 Hz buffers for the ~125ms reality instead of
    // assuming the configured ~33ms is what's arriving.
    return Math.max(
      REALTIME_ROOM_MIN_INTERPOLATION_DELAY_MS,
      this.#effectiveSnapshotIntervalMs() * REALTIME_ROOM_INTERPOLATION_BUFFER_INTERVALS,
      this.#smoothedRttMs / 2 + Math.max(this.#jitterMs, this.#snapshotJitterMs),
    );
  }

  onConnection(listener: (event: ConnectionEvent) => void): () => void {
    return this.#host.onConnection?.(listener) ?? (() => undefined);
  }

  // --- internals -----------------------------------------------------

  async #enter(join: () => Promise<JoinedRoom>): Promise<RealtimeRoomSnapshot<State>> {
    const generation = ++this.#generation;
    this.#setConnection("joining");
    let joinedRoomId = "";
    try {
      this.#bind();
      this.#playerId = this.#requirePlayerId();
      const joined = await join();
      joinedRoomId = joined.roomId;
      if (generation !== this.#generation) {
        await this.#host.leaveRoom(joined.roomId).catch(() => undefined);
        throw new RealtimeRoomError("rejected", "join superseded");
      }
      this.#requireCapabilities(joined.snapshot);
      this.#roomId = joined.roomId;
      this.#inviteCode = joined.inviteCode;
      this.#applyV1Snapshot(joined.snapshot);
      this.#setConnection("connected");
      await this.#host.requestRealtimeSync();
      return this.getSnapshot();
    } catch (error) {
      this.#unbind();
      if (joinedRoomId) {
        await this.#host.leaveRoom(joinedRoomId).catch(() => undefined);
      }
      if (generation === this.#generation) {
        this.#clearIdentity();
        this.#setConnection("failed");
        this.#lastError =
          error instanceof RealtimeRoomError
            ? error
            : new RealtimeRoomError("rejected", error instanceof Error ? error.message : "failed to enter room");
      }
      throw error;
    }
  }

  #requirePlayerId(): string {
    const playerId = this.#playerId || this.#host.playerId();
    if (!playerId) throw new RealtimeRoomError("rejected", "authenticate before entering a room");
    return playerId;
  }

  #bind(): void {
    if (this.#unsubscribe) return;
    this.#unsubscribe = this.#host.onMessage((message) => this.#onV1Message(message));
    this.#unsubscribeRealtime = this.#host.onRealtimeMessage((message) => this.#onV2Message(message));
    this.#unsubscribeConnection = this.#host.onConnection?.((event) => this.#onConnectionEvent(event));
    this.#armGuestReportTimer();
  }

  /**
   * While connected as a guest, periodically sends a bounded transport-
   * health report to the host (see RealtimeRoomHost.sendRealtimeGuestReport)
   * so a host-side adaptive rate controller can react to the worst-placed
   * guest, not only its own send/ack cadence. A no-op whenever this client
   * is currently the host.
   */
  #armGuestReportTimer(): void {
    if (this.#guestReportTimer) return;
    this.#guestReportTimer = setInterval(() => {
      if (this.isHost) return;
      if (this.#connection !== "connected") return;
      if (!this.#roomId) return;
      const effectiveIntervalMs = this.#smoothedSnapshotIntervalMs;
      void this.#host
        .sendRealtimeGuestReport({
          roundSequence: this.#roundSequence,
          effectiveSnapshotHz: effectiveIntervalMs ? 1000 / effectiveIntervalMs : undefined,
          arrivalJitterMs: this.#snapshotJitterMs || undefined,
          sequenceGaps: this.#diagnostics.snapshotSequenceGaps,
          extrapolatedFrameRatio:
            this.#diagnostics.framesRendered > 0
              ? this.#diagnostics.extrapolatedFrames / this.#diagnostics.framesRendered
              : 0,
          latestAuthoritativeTick: this.#latestSnapshot?.simulationTick,
        })
        .catch(() => undefined);
    }, REALTIME_ROOM_GUEST_REPORT_INTERVAL_MS);
    this.#guestReportTimer.unref?.();
  }

  #unbind(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    this.#unsubscribeRealtime?.();
    this.#unsubscribeRealtime = undefined;
    this.#unsubscribeConnection?.();
    this.#unsubscribeConnection = undefined;
    this.#clearTimers();
  }

  #onConnectionEvent(event: ConnectionEvent): void {
    if (this.#isInactive()) return;
    if (event === "suspended") {
      this.#setConnection("suspended");
      return;
    }
    if (event === "resumed") {
      this.#setConnection("reconnecting");
      return;
    }
    if (event === "disconnected") {
      if (this.#connection === "suspended") return;
      this.#setConnection("reconnecting");
      return;
    }
    if (event === "reconnect_failed") {
      if (this.#connection === "suspended") return;
      this.#setConnection("reconnecting");
      return;
    }
    if (this.#connection === "suspended") return;
    if (this.#connection === "reconnecting" || this.#connection === "resynchronizing") {
      this.#setConnection("resynchronizing");
      if (this.#explicitReconnect) return;
      void this.#host.requestRealtimeSync().catch(() => undefined);
    }
  }

  #onV1Message(message: ServerEnvelope): void {
    if (this.#isInactive() && message.type !== "room_closed") return;
    if (this.#roomId && message.roomId !== this.#roomId) return;
    if (message.type === "presence") {
      this.#hostId = message.members.find((member) => member.host)?.playerId || this.#hostId;
      this.#members = mergeMembers(this.#members, message, this.#hostId);
      this.#applyMembershipMeta(message);
      this.#emit();
      return;
    }
    if (message.type === "host_changed") {
      const previousHostId = this.#hostId;
      this.#hostId = message.hostId;
      this.#members = this.#members.map((member) => ({
        ...member,
        host: member.playerId === message.hostId,
      }));
      if (previousHostId !== message.hostId) {
        this.#migrationStartedAt = monotonicNow();
        this.#diagnostics.hostMigrationCount += 1;
        this.#setConnection("resynchronizing");
        void this.#host
          .requestRealtimeSync()
          .then(() => {
            if (this.#migrationStartedAt !== undefined) {
              this.#diagnostics.lastHostMigrationDurationMs = monotonicNow() - this.#migrationStartedAt;
              this.#migrationStartedAt = undefined;
            }
          })
          .catch(() => undefined);
      }
      this.#emit();
      return;
    }
    if (message.type === "room_closed") {
      this.#generation += 1;
      this.#rejectAllPending("room_closed", "room closed");
      this.#clearIdentity();
      this.#unbind();
      this.#setConnection("closed");
      return;
    }
    if (message.type === "error") {
      this.#lastError = new RealtimeRoomError("rejected", message.message);
      this.#emit();
    }
  }

  #onV2Message(message: RealtimeServerEnvelope): void {
    if (this.#isInactive()) return;
    if (this.#roomId && message.roomId !== this.#roomId) return;
    if (message.type === "error") {
      this.#lastError = new RealtimeRoomError(
        message.code === "RATE_LIMITED" ? "rate_limited" : message.code === "STALE_VERSION" ? "stale" : "rejected",
        message.message,
      );
      if (message.operation === "realtime_snapshot") {
        this.#diagnostics.snapshotsRejected += 1;
        if (message.hostSnapshotSequence !== undefined) this.#releasePendingSnapshot(message.hostSnapshotSequence);
        this.#reduceSnapshotHz();
        if (message.code === "RATE_LIMITED") {
          this.#warn({ type: "runtime_rate_limited", operation: "realtime_snapshot", retryAfterMs: message.retryAfterMs });
          if (message.retryAfterMs) this.#snapshotRateLimitedUntil = monotonicNow() + message.retryAfterMs;
        }
        this.#attemptFlush();
      } else if (message.operation === "realtime_input" && message.code === "RATE_LIMITED") {
        this.#diagnostics.inputRateLimited += 1;
        this.#warn({ type: "runtime_rate_limited", operation: "realtime_input", retryAfterMs: message.retryAfterMs });
      }
      this.#emit();
      return;
    }
    if (message.type === "realtime_snapshot") {
      if (message.authorityEpoch < this.#authorityEpoch) return;
      if (message.authorityEpoch > this.#authorityEpoch) {
        this.#authorityEpoch = message.authorityEpoch;
      }
      if (message.roundSequence < this.#roundSequence) return;
      if (message.roundSequence > this.#roundSequence) {
        this.#roundSequence = message.roundSequence;
        this.#previousSnapshot = undefined;
        this.#latestSnapshot = undefined;
        this.#predictedState = undefined;
        this.#predictedTick = -1;
        this.#pendingCorrection = undefined;
        this.#correctionStartedAt = undefined;
        this.#lastDisplayedState = undefined;
        this.#renderClockAnchor = undefined;
        this.#renderClockRate = 1;
        this.#lastSnapshotReceivedAt = undefined;
        this.#lastInterpolatedTick = undefined;
        this.#lastSnapshotHostSendTime = undefined;
        this.#lastSnapshotServerTime = undefined;
        this.#smoothedSnapshotIntervalMs = undefined;
        this.#snapshotJitterMs = 0;
        this.#lastRuntimeSnapshotSequence = undefined;
        this.#sampledSinceLastSnapshot = true;
        this.#seenEffectIds.clear();
        this.#seenEffectOrder = [];
        this.#extrapolationWindowCount = 0;
        this.#extrapolationWindowExtrapolated = 0;
        // Harmless for a guest (its own pending-submission map is always
        // empty); clears any leftover host-side pacing state from a stale
        // prior round (e.g. this client was the host before a migration).
        this.#resetSnapshotPacingState();
      }
      if (this.#latestSnapshot && message.simulationTick <= this.#latestSnapshot.simulationTick) return;
      if (this.#latestSnapshot && !this.#sampledSinceLastSnapshot) {
        this.#diagnostics.snapshotsCoalescedOnReceive += 1;
      }
      this.#sampledSinceLastSnapshot = false;
      if (
        this.#lastRuntimeSnapshotSequence !== undefined &&
        message.runtimeSnapshotSequence > this.#lastRuntimeSnapshotSequence + 1
      ) {
        this.#diagnostics.snapshotSequenceGaps +=
          message.runtimeSnapshotSequence - this.#lastRuntimeSnapshotSequence - 1;
      }
      this.#lastRuntimeSnapshotSequence = message.runtimeSnapshotSequence;
      const receivedAt = monotonicNow();
      if (this.#lastSnapshotReceivedAt !== undefined) {
        const interval = receivedAt - this.#lastSnapshotReceivedAt;
        this.#diagnostics.lastSnapshotIntervalMs = interval;
        const expected = this.#smoothedSnapshotIntervalMs ?? this.#snapshotIntervalMs;
        this.#smoothedSnapshotIntervalMs = expected === 0 ? interval : expected * 0.8 + interval * 0.2;
        const deviation = Math.abs(interval - this.#smoothedSnapshotIntervalMs);
        this.#snapshotJitterMs = this.#snapshotJitterMs === 0 ? deviation : this.#snapshotJitterMs * 0.8 + deviation * 0.2;
        this.#diagnostics.snapshotArrivalJitterMs = this.#snapshotJitterMs;
      }
      this.#lastSnapshotReceivedAt = receivedAt;
      if (this.#lastSnapshotHostSendTime !== undefined) {
        this.#diagnostics.lastSnapshotHostIntervalMs = message.hostSendTime - this.#lastSnapshotHostSendTime;
      }
      this.#lastSnapshotHostSendTime = message.hostSendTime;
      if (this.#lastSnapshotServerTime !== undefined) {
        this.#diagnostics.lastSnapshotRelayIntervalMs = message.serverTime - this.#lastSnapshotServerTime;
      }
      this.#lastSnapshotServerTime = message.serverTime;
      this.#previousSnapshot = this.#latestSnapshot;
      this.#latestSnapshot = { state: message.state as State, simulationTick: message.simulationTick };
      this.#nudgeRenderClock(receivedAt);
      this.#hostId = message.hostId || this.#hostId;
      if (this.#playerId === message.hostId) {
        this.#diagnostics.snapshotsAcked += 1;
        this.#onSnapshotAccepted(message.hostSnapshotSequence, receivedAt);
      }
      const acked = message.processedInputCursors?.[this.#playerId];
      if (acked !== undefined) this.#applyAck(acked);
      this.#reconcile();
      if (this.#connection === "resynchronizing" && this.#authorityEpoch >= 0) {
        this.#setConnection("connected");
      }
      this.#emit();
      return;
    }
    if (message.type === "realtime_effect") {
      if (message.authorityEpoch !== this.#authorityEpoch) return;
      if (message.roundSequence !== this.#roundSequence) return;
      this.#hostId = message.hostId || this.#hostId;
      const effect: RealtimeRoomConfirmedEffect<Effect> = {
        effectId: message.effectId,
        simulationTick: message.simulationTick,
        serverTime: message.serverTime,
        payload: message.payload as Effect,
      };
      if (this.#recordEffect(effect)) this.#emitEffect(effect);
      return;
    }
    if (message.type === "realtime_sync_response") {
      this.#authorityEpoch = message.authorityEpoch;
      this.#roundSequence = message.roundSequence;
      this.#hostId = message.hostId ?? this.#hostId;
      if (snapshotMembersAreComplete(message)) {
        this.#members = asMembers(message.members ?? [], this.#hostId);
        this.#membersComplete = true;
      }
      if (message.membershipRevision !== undefined) {
        this.#membershipRevision = Math.max(this.#membershipRevision, message.membershipRevision);
      }
      if (message.state !== undefined && message.simulationTick !== undefined) {
        this.#previousSnapshot = undefined;
        this.#latestSnapshot = { state: message.state as State, simulationTick: message.simulationTick };
        this.#renderClockAnchor = undefined;
        this.#renderClockRate = 1;
        this.#lastSnapshotReceivedAt = undefined;
        this.#lastInterpolatedTick = undefined;
        this.#lastSnapshotHostSendTime = undefined;
        this.#lastSnapshotServerTime = undefined;
        this.#smoothedSnapshotIntervalMs = undefined;
        this.#snapshotJitterMs = 0;
        this.#lastRuntimeSnapshotSequence = message.runtimeSnapshotSequence;
        this.#sampledSinceLastSnapshot = true;
        this.#reconcile();
      }
      if (this.#reconnectStartedAt !== undefined) {
        this.#diagnostics.reconnectCount += 1;
        this.#diagnostics.lastReconnectDurationMs = monotonicNow() - this.#reconnectStartedAt;
        this.#reconnectStartedAt = undefined;
      }
      // Replay any confirmed effects this member hasn't seen yet (e.g. one
      // that landed while it was disconnected or mid host-migration), so a
      // reconnecting guest still gets to dedupe against them.
      for (const retained of message.retainedEffects ?? []) {
        const effect: RealtimeRoomConfirmedEffect<Effect> = {
          effectId: retained.effectId,
          simulationTick: retained.simulationTick,
          serverTime: retained.serverTime,
          payload: retained.payload as Effect,
        };
        if (this.#recordEffect(effect)) this.#emitEffect(effect);
      }
      if (this.#latestInput !== undefined) void this.#sendLatestInput();
      for (const pending of this.#orderedPending.values()) {
        void this.#sendOrderedInput(pending.inputSequence, pending.input, pending.targetTick);
      }
      if (this.#connection !== "suspended" && this.#connection !== "leaving" && this.#connection !== "closed") {
        this.#setConnection("connected");
      }
      this.#emit();
      return;
    }
    if (message.type === "realtime_guest_report") {
      if (!this.isHost) return;
      if (message.roundSequence !== this.#roundSequence) return;
      if (message.extrapolatedFrameRatio > this.#worstGuestExtrapolationRatio) {
        this.#worstGuestExtrapolationRatio = message.extrapolatedFrameRatio;
      }
      if (message.extrapolatedFrameRatio > REALTIME_ROOM_HIGH_EXTRAPOLATION_RATIO) {
        this.#warn({ type: "high_extrapolation_ratio", ratio: message.extrapolatedFrameRatio });
        this.#reduceSnapshotHz();
        this.#attemptFlush();
      }
      return;
    }
    if (message.type === "realtime_input") {
      if (!this.isHost) return;
      if (message.roundSequence !== this.#roundSequence) return;
      let record = this.#hostInputs.get(message.senderId);
      if (!record) {
        record = { ordered: [], dedupe: new Set() };
        this.#hostInputs.set(message.senderId, record);
      }
      if (message.delivery === "latest") {
        if (!record.latest || message.inputSequence > record.latest.inputSequence) {
          record.latest = {
            inputSequence: message.inputSequence,
            targetTick: message.targetTick,
            input: message.payload as Input,
          };
        }
        return;
      }
      if (record.dedupe.has(message.inputSequence)) return;
      record.dedupe.add(message.inputSequence);
      record.ordered.push({
        inputSequence: message.inputSequence,
        targetTick: message.targetTick,
        input: message.payload as Input,
      });
      while (record.ordered.length > REALTIME_ROOM_MAX_ORDERED_INPUTS) {
        const dropped = record.ordered.shift();
        if (dropped) record.dedupe.delete(dropped.inputSequence);
      }
    }
  }

  #applyAck(inputSequence: number): void {
    if (inputSequence <= this.#lastAcknowledgedInputSequence) return;
    this.#lastAcknowledgedInputSequence = inputSequence;
    for (const [sequence, pending] of [...this.#orderedPending]) {
      if (sequence > inputSequence) continue;
      this.#orderedPending.delete(sequence);
      const rtt = monotonicNow() - pending.sentAt;
      this.#updateRttEstimate(rtt);
      pending.resolve();
    }
  }

  #updateRttEstimate(sampleMs: number): void {
    const previous = this.#smoothedRttMs;
    this.#smoothedRttMs = previous === 0 ? sampleMs : previous * 0.8 + sampleMs * 0.2;
    const deviation = Math.abs(sampleMs - this.#smoothedRttMs);
    this.#jitterMs = this.#jitterMs === 0 ? deviation : this.#jitterMs * 0.8 + deviation * 0.2;
  }

  #stepPrediction(input: Input): void {
    if (!this.#options.predict) return;
    const base = this.#predictedState ?? this.#latestSnapshot?.state;
    if (base === undefined) return;
    const baseTick = this.#predictedTick >= 0 ? this.#predictedTick : this.#latestSnapshot?.simulationTick ?? 0;
    this.#predictedState = this.#options.predict(cloneJson(base), input, 1 / this.#simulationHz);
    this.#predictedTick = baseTick + 1;
  }

  #reconcile(): void {
    if (!this.#options.predict || !this.#latestSnapshot) return;
    const oldPredicted = this.#predictedState;
    const previousPredictedTick = this.#predictedTick;
    const dtSeconds = 1 / this.#simulationHz;
    const snapshotTick = this.#latestSnapshot.simulationTick;
    const hasHeld = this.#latestInput !== undefined;
    const ordered = [...this.#orderedPending.values()].sort((a, b) => a.inputSequence - b.inputSequence);
    if (!hasHeld && ordered.length === 0) {
      this.#predictedState = undefined;
      this.#predictedTick = -1;
    } else {
      let next = cloneJson(this.#latestSnapshot.state);
      let tick = snapshotTick;
      for (const pending of ordered) {
        next = this.#options.predict(cloneJson(next), pending.input, dtSeconds);
        tick += 1;
      }
      const heldInput = this.#latestInput;
      if (heldInput !== undefined) {
        // Replay the held control for however many ticks prediction had
        // advanced ahead of the previous authoritative tick, so continuous
        // steering does not collapse back to a single predicted step every
        // time a new snapshot lands. Bounded to the same catch-up window as
        // extrapolation so a large gap (e.g. after a reconnect) cannot cause
        // an unbounded replay.
        const fixedStepMs = 1000 / this.#simulationHz;
        const snapshotIntervalTicks = Math.max(1, Math.round(this.#effectiveSnapshotIntervalMs() / fixedStepMs));
        const maxReplaySteps = REALTIME_ROOM_MAX_EXTRAPOLATION_INTERVALS * snapshotIntervalTicks;
        const heldSteps = clamp(
          previousPredictedTick >= 0 ? previousPredictedTick - snapshotTick : 1,
          1,
          maxReplaySteps,
        );
        for (let step = 0; step < heldSteps; step += 1) {
          next = this.#options.predict(cloneJson(next), heldInput, dtSeconds);
          tick += 1;
        }
      }
      this.#predictedState = next;
      this.#predictedTick = tick;
    }
    if (this.#options.blendCorrection && oldPredicted !== undefined && this.#predictedState !== undefined) {
      this.#diagnostics.reconciliations += 1;
      // Rebase from what the game actually has on screen right now, not the
      // stale prediction frozen at the moment the previous correction (if
      // any) started; falls back to oldPredicted before anything has ever
      // been rendered.
      const displayed = this.#lastDisplayedState ?? oldPredicted;
      const shouldCorrect = this.#options.shouldCorrect
        ? this.#options.shouldCorrect(displayed, this.#predictedState)
        : true;
      if (shouldCorrect) {
        if (!this.#pendingCorrection) {
          this.#correctionStartedAt = undefined;
          this.#diagnostics.correctionsStarted += 1;
        }
        // Whether starting fresh or already correcting, always rebase `from`
        // to the currently displayed pose. When a correction is already in
        // flight, #correctionStartedAt is left untouched so a new snapshot
        // arriving mid-correction (e.g. every ~33ms) cannot keep resetting
        // the deadline and prevent it from ever completing.
        this.#pendingCorrection = { from: displayed };
      } else {
        this.#diagnostics.correctionsSuppressed += 1;
      }
    }
  }

  async #sendLatestInput(): Promise<void> {
    if (!this.#latestInput || !this.#roomId) return;
    this.#lastInputSentAt = monotonicNow();
    const inputSequence = ++this.#inputSequence;
    const targetTick = Math.max(0, (this.#latestSnapshot?.simulationTick ?? 0) + 1);
    try {
      await this.#host.sendRealtimeInput(this.#latestInput, {
        roundSequence: this.#roundSequence,
        inputSequence,
        targetTick,
        delivery: "latest",
        clientSendTime: Date.now(),
      });
      this.#diagnostics.inputsSent += 1;
      this.#diagnostics.inputsTransmitted += 1;
    } catch {
      this.#diagnostics.inputsDropped += 1;
    }
  }

  async #sendOrderedInput(inputSequence: number, input: Input, targetTick: number): Promise<void> {
    try {
      await this.#host.sendRealtimeInput(input, {
        roundSequence: this.#roundSequence,
        inputSequence,
        targetTick,
        delivery: "ordered",
        clientSendTime: Date.now(),
      });
      this.#diagnostics.inputsSent += 1;
    } catch {
      this.#diagnostics.inputsDropped += 1;
    }
  }

  #armInputResendTimer(): void {
    if (this.#latestInputTimer) return;
    this.#latestInputTimer = setInterval(() => {
      if (this.#latestInput === undefined) return;
      if (this.#connection !== "connected") return;
      void this.#sendLatestInput();
    }, this.#inputIntervalMs);
    this.#latestInputTimer.unref?.();
  }

  #attemptFlush(): void {
    if (this.#snapshotFlushTimer) {
      clearTimeout(this.#snapshotFlushTimer);
      this.#snapshotFlushTimer = undefined;
    }
    if (!this.#pendingSnapshot) return;
    if (this.#snapshotRateLimitedUntil !== undefined) {
      const remaining = this.#snapshotRateLimitedUntil - monotonicNow();
      if (remaining > 0) {
        this.#snapshotFlushTimer = setTimeout(() => this.#attemptFlush(), remaining);
        this.#snapshotFlushTimer.unref?.();
        return;
      }
      this.#snapshotRateLimitedUntil = undefined;
    }
    if (this.#pendingSnapshotSubmissions.size >= this.#maxInFlightSnapshots) {
      // Backpressure: capacity is fully saturated. No retry timer is armed
      // here — whichever submission resolves next (accepted echo, error,
      // or ack timeout) calls #attemptFlush() again once it frees a slot.
      if (this.#backpressureStartedAt === undefined) this.#backpressureStartedAt = monotonicNow();
      return;
    }
    this.#endBackpressureWindow();
    const elapsed = monotonicNow() - this.#lastSnapshotSentAt;
    if (elapsed < this.#snapshotIntervalMs) {
      this.#snapshotFlushTimer = setTimeout(() => this.#attemptFlush(), this.#snapshotIntervalMs - elapsed);
      this.#snapshotFlushTimer.unref?.();
      return;
    }
    const next = this.#pendingSnapshot;
    this.#pendingSnapshot = undefined;
    this.#hostSnapshotSequence += 1;
    const hostSnapshotSequence = this.#hostSnapshotSequence;
    this.#lastSentSimulationTick = next.simulationTick;
    const sentAt = monotonicNow();
    const priorSentAt = this.#lastSnapshotSentAt;
    this.#lastSnapshotSentAt = sentAt;
    this.#diagnostics.snapshotsSent += 1;
    this.#diagnostics.snapshotsAttempted += 1;
    if (priorSentAt > 0) {
      const sendIntervalMs = sentAt - priorSentAt;
      if (sendIntervalMs > 0) {
        const instantHz = 1000 / sendIntervalMs;
        this.#smoothedEffectiveHz =
          this.#smoothedEffectiveHz === undefined ? instantHz : this.#smoothedEffectiveHz * 0.8 + instantHz * 0.2;
        this.#diagnostics.effectiveSnapshotHz = this.#smoothedEffectiveHz;
        const targetHz = 1000 / this.#snapshotIntervalMs;
        if (this.#smoothedEffectiveHz < targetHz * REALTIME_ROOM_LOW_EFFECTIVE_RATE_FACTOR) {
          this.#warn({ type: "low_effective_snapshot_rate", effectiveHz: this.#smoothedEffectiveHz, targetHz });
        }
      }
    }
    const timeoutMs = Math.max(
      REALTIME_ROOM_SNAPSHOT_ACK_TIMEOUT_FLOOR_MS,
      this.#snapshotIntervalMs * REALTIME_ROOM_SNAPSHOT_ACK_TIMEOUT_FACTOR,
    );
    const timeoutTimer = setTimeout(() => this.#onSnapshotAckTimeout(hostSnapshotSequence), timeoutMs);
    timeoutTimer.unref?.();
    this.#pendingSnapshotSubmissions.set(hostSnapshotSequence, { simulationTick: next.simulationTick, sentAt, timeoutTimer });
    this.#diagnostics.maxInFlightObserved = Math.max(
      this.#diagnostics.maxInFlightObserved,
      this.#pendingSnapshotSubmissions.size,
    );
    const processedInputCursors: Record<string, number> = {};
    for (const [playerId, cursor] of this.#hostProcessedCursors) {
      if (cursor >= 0) processedInputCursors[playerId] = cursor;
    }
    void this.#host
      .sendRealtimeSnapshot(next.state, {
        authorityEpoch: this.#authorityEpoch,
        roundSequence: this.#roundSequence,
        simulationTick: next.simulationTick,
        hostSnapshotSequence,
        hostSendTime: Date.now(),
        processedInputCursors,
      })
      .catch(() => {
        // Never reached the runtime (transport-level failure): release
        // this specific submission immediately rather than leaving it to
        // time out, and try the newest pending state right away.
        this.#releasePendingSnapshot(hostSnapshotSequence);
        this.#diagnostics.snapshotsRejected += 1;
        this.#cleanSendStreak = 0;
        this.#attemptFlush();
      });
  }

  #endBackpressureWindow(): void {
    if (this.#backpressureStartedAt === undefined) return;
    const durationMs = monotonicNow() - this.#backpressureStartedAt;
    this.#backpressureStartedAt = undefined;
    this.#diagnostics.snapshotBackpressureDurationMs += durationMs;
    if (durationMs >= REALTIME_ROOM_SUSTAINED_BACKPRESSURE_MS) {
      this.#warn({ type: "snapshot_backpressure", durationMs });
      this.#reduceSnapshotHz();
    }
  }

  /** Removes and returns a tracked submission (clearing its timeout timer), or undefined if it was already resolved. */
  #releasePendingSnapshot(hostSnapshotSequence: number): PendingSnapshotSubmission | undefined {
    const entry = this.#pendingSnapshotSubmissions.get(hostSnapshotSequence);
    if (!entry) return undefined;
    clearTimeout(entry.timeoutTimer);
    this.#pendingSnapshotSubmissions.delete(hostSnapshotSequence);
    return entry;
  }

  /**
   * A submission received neither an accepted echo nor an explicit error
   * within its ack timeout. This is the case the runtime's own "late or
   * duplicate echo; ignore without rewinding stored state" behavior
   * produces: a submission that arrives out of order relative to another
   * in-flight one is silently dropped rather than rejected, so without
   * this timeout its in-flight slot would never be released.
   */
  #onSnapshotAckTimeout(hostSnapshotSequence: number): void {
    const entry = this.#releasePendingSnapshot(hostSnapshotSequence);
    if (!entry) return;
    this.#diagnostics.snapshotAckTimeouts += 1;
    this.#cleanSendStreak = 0;
    this.#warn({ type: "snapshot_ack_timeout", hostSnapshotSequence, timeoutMs: monotonicNow() - entry.sentAt });
    this.#reduceSnapshotHz();
    this.#attemptFlush();
  }

  #onSnapshotAccepted(hostSnapshotSequence: number | undefined, receivedAt: number): void {
    let key = hostSnapshotSequence;
    if (key === undefined) {
      // Defensive fallback for a runtime that hasn't started echoing
      // hostSnapshotSequence yet: release the oldest tracked entry so
      // accounting still recovers instead of leaking a slot forever.
      const oldest = this.#pendingSnapshotSubmissions.keys().next();
      key = oldest.done ? undefined : oldest.value;
    }
    const entry = key !== undefined ? this.#releasePendingSnapshot(key) : undefined;
    this.#diagnostics.snapshotsAccepted += 1;
    if (entry) this.#recordAckLatency(receivedAt - entry.sentAt);
    if (this.#lastAcceptedSnapshotAt !== undefined) {
      const interval = receivedAt - this.#lastAcceptedSnapshotAt;
      if (interval > 0) {
        const instantHz = 1000 / interval;
        this.#smoothedAcceptedSnapshotHz =
          this.#smoothedAcceptedSnapshotHz === undefined
            ? instantHz
            : this.#smoothedAcceptedSnapshotHz * 0.8 + instantHz * 0.2;
        this.#diagnostics.effectiveAcceptedSnapshotHz = this.#smoothedAcceptedSnapshotHz;
      }
    }
    this.#lastAcceptedSnapshotAt = receivedAt;
    this.#registerCleanSnapshotSend();
    this.#attemptFlush();
  }

  #recordAckLatency(latencyMs: number): void {
    if (latencyMs < 0) return;
    this.#ackLatencySamples.push(latencyMs);
    if (this.#ackLatencySamples.length > REALTIME_ROOM_MAX_ACK_LATENCY_SAMPLES) this.#ackLatencySamples.shift();
  }

  #setSnapshotHz(hz: number): void {
    this.#currentSnapshotHz = clamp(hz, this.#snapshotHzFloor, this.#snapshotHzCeiling);
    this.#snapshotIntervalMs = 1000 / this.#currentSnapshotHz;
    this.#diagnostics.currentTargetSnapshotHz = this.#currentSnapshotHz;
  }

  /** AIMD decrease: applied immediately and fully on rejection, timeout, or sustained backpressure. No-op unless adaptiveRate is enabled. */
  #reduceSnapshotHz(): void {
    if (!this.#adaptiveRateEnabled) return;
    this.#cleanSendStreak = 0;
    const next = Math.max(this.#snapshotHzFloor, this.#currentSnapshotHz * REALTIME_ROOM_RATE_DECREASE_FACTOR);
    if (next >= this.#currentSnapshotHz) return;
    this.#setSnapshotHz(next);
    this.#diagnostics.adaptiveRateReductions += 1;
  }

  /** AIMD increase: only after a sustained clean run, with a cooldown so an increase can never itself look like a stall right after a decrease. No-op unless adaptiveRate is enabled. */
  #registerCleanSnapshotSend(): void {
    if (!this.#adaptiveRateEnabled) return;
    this.#cleanSendStreak += 1;
    if (this.#cleanSendStreak < REALTIME_ROOM_RATE_INCREASE_STREAK) return;
    if (this.#currentSnapshotHz >= this.#snapshotHzCeiling) return;
    const now = monotonicNow();
    if (
      this.#lastRateIncreaseAt !== undefined &&
      now - this.#lastRateIncreaseAt < REALTIME_ROOM_RATE_INCREASE_COOLDOWN_MS
    ) {
      return;
    }
    // A guest struggling with the current rate is a reason not to climb
    // further, even though the host's own send/ack cadence looks clean.
    if (this.#worstGuestExtrapolationRatio > REALTIME_ROOM_HIGH_EXTRAPOLATION_RATIO) return;
    this.#cleanSendStreak = 0;
    this.#lastRateIncreaseAt = now;
    this.#setSnapshotHz(Math.min(this.#snapshotHzCeiling, this.#currentSnapshotHz + REALTIME_ROOM_RATE_INCREASE_STEP_HZ));
    this.#diagnostics.adaptiveRateIncreases += 1;
  }

  /** Clears every pending snapshot submission's timeout timer and resets pacing/adaptive-rate state for a new round or identity. */
  #resetSnapshotPacingState(): void {
    for (const entry of this.#pendingSnapshotSubmissions.values()) clearTimeout(entry.timeoutTimer);
    this.#pendingSnapshotSubmissions.clear();
    this.#snapshotRateLimitedUntil = undefined;
    this.#backpressureStartedAt = undefined;
    this.#cleanSendStreak = 0;
    this.#lastRateIncreaseAt = undefined;
    this.#lastAcceptedSnapshotAt = undefined;
    this.#smoothedAcceptedSnapshotHz = undefined;
    this.#ackLatencySamples = [];
    this.#worstGuestExtrapolationRatio = 0;
    this.#setSnapshotHz(this.#initialSnapshotHz);
  }

  #applyV1Snapshot(message: ServerEnvelope): void {
    if (message.type !== "snapshot") return;
    if (message.hostId) this.#hostId = message.hostId;
    if (snapshotMembersAreComplete(message)) {
      this.#members = asMembers(message.members ?? [], this.#hostId);
    }
    this.#applyMembershipMeta(message);
  }

  #applyMembershipMeta(message: {
    members?: unknown;
    membersComplete?: boolean;
    membershipRevision?: number;
  }): void {
    if (snapshotMembersAreComplete(message)) this.#membersComplete = true;
    if (message.membershipRevision !== undefined && message.membershipRevision >= this.#membershipRevision) {
      this.#membershipRevision = message.membershipRevision;
    }
  }

  #membershipStatus(): MembershipStatus {
    const haveSelf = Boolean(this.#playerId) && this.#members.some((member) => member.playerId === this.#playerId);
    return this.#membersComplete && haveSelf ? "ready" : "synchronizing";
  }

  #rejectAllPending(outcome: RealtimeRoomOutcome, message: string): void {
    const error = new RealtimeRoomError(outcome, message);
    this.#lastError = error;
    for (const pending of this.#orderedPending.values()) pending.reject(error);
    this.#orderedPending.clear();
  }

  #clearTimers(): void {
    if (this.#latestInputTimer) {
      clearInterval(this.#latestInputTimer);
      this.#latestInputTimer = undefined;
    }
    if (this.#inputSendTimer) {
      clearTimeout(this.#inputSendTimer);
      this.#inputSendTimer = undefined;
    }
    if (this.#snapshotFlushTimer) {
      clearTimeout(this.#snapshotFlushTimer);
      this.#snapshotFlushTimer = undefined;
    }
    if (this.#guestReportTimer) {
      clearInterval(this.#guestReportTimer);
      this.#guestReportTimer = undefined;
    }
  }

  #clearIdentity(): void {
    this.#roomId = "";
    this.#inviteCode = "";
    this.#hostId = "";
    this.#members = [];
    this.#membersComplete = false;
    this.#membershipRevision = 0;
    this.#authorityEpoch = 0;
    this.#roundSequence = 0;
    this.#hostInputs.clear();
    this.#hostProcessedCursors.clear();
    this.#previousSnapshot = undefined;
    this.#latestSnapshot = undefined;
    this.#predictedState = undefined;
    this.#predictedTick = -1;
    this.#pendingCorrection = undefined;
    this.#correctionStartedAt = undefined;
    this.#lastDisplayedState = undefined;
    this.#renderClockAnchor = undefined;
    this.#renderClockRate = 1;
    this.#lastSnapshotReceivedAt = undefined;
    this.#lastInterpolatedTick = undefined;
    this.#lastSnapshotHostSendTime = undefined;
    this.#lastSnapshotServerTime = undefined;
    this.#smoothedSnapshotIntervalMs = undefined;
    this.#snapshotJitterMs = 0;
    this.#lastRuntimeSnapshotSequence = undefined;
    this.#sampledSinceLastSnapshot = true;
    this.#pendingSnapshot = undefined;
    this.#resetSnapshotPacingState();
    this.#lastSentSimulationTick = -1;
    this.#hostSnapshotSequence = 0;
    this.#lastPublishCallAt = undefined;
    this.#smoothedEffectiveHz = undefined;
    this.#seenEffectIds.clear();
    this.#seenEffectOrder = [];
    this.#extrapolationWindowCount = 0;
    this.#extrapolationWindowExtrapolated = 0;
    this.#lastExtrapolationWarningAt = undefined;
    this.#lastInputSentAt = 0;
  }

  #isInactive(): boolean {
    return (
      this.#connection === "leaving" ||
      this.#connection === "leave_failed" ||
      this.#connection === "closed" ||
      this.#connection === "failed"
    );
  }

  #isTerminal(): boolean {
    return (
      this.#connection === "closed" ||
      this.#connection === "failed" ||
      this.#connection === "leave_failed" ||
      this.#connection === "idle"
    );
  }

  #requireCapabilities(message: ServerEnvelope): void {
    if (message.type !== "snapshot") return;
    const capabilities = message.capabilities;
    if (!capabilities || capabilities.realtime_rooms !== true) {
      throw new RealtimeRoomError("unsupported", "runtime does not advertise realtime_rooms");
    }
    if (
      capabilities.realtimeProtocolVersion !== undefined &&
      capabilities.realtimeProtocolVersion > REALTIME_PROTOCOL_VERSION
    ) {
      throw new RealtimeRoomError(
        "unsupported",
        `runtime requires realtime protocol ${capabilities.realtimeProtocolVersion}`,
      );
    }
  }

  #parseState(value: unknown): State {
    return this.#options.stateSchema ? this.#options.stateSchema.parse(value) : (value as State);
  }

  #parseInput(value: unknown): Input {
    return this.#options.inputSchema ? this.#options.inputSchema.parse(value) : (value as Input);
  }

  #setConnection(connection: ConnectionState): void {
    const previous = this.#connection;
    this.#connection = connection;
    if (connection === "connected" && previous !== "connected" && this.#latestSnapshot) {
      this.#reconcile();
    }
    this.#emit();
  }

  #emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.#listeners) {
      try {
        listener(snapshot);
      } catch {
        // Snapshot listeners must not break connection or input handling.
      }
    }
  }
}

export const createRealtimeInputId = createId;
