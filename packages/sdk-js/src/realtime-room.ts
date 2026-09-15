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
export const REALTIME_ROOM_DEFAULT_SNAPSHOT_HZ = 10;
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
};

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
  simulationHz?: number;
  snapshotHz?: number;
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
export class RealtimeRoom<State, Input> {
  readonly #host: RealtimeRoomHost;
  readonly #options: RealtimeRoomOptions<State, Input>;
  readonly #listeners = new Set<(snapshot: RealtimeRoomSnapshot<State>) => void>();
  readonly #simulationHz: number;
  readonly #snapshotIntervalMs: number;
  readonly #inputIntervalMs: number;
  readonly #maxInFlightSnapshots: number;
  readonly #correctionMs: number;
  readonly #diagnosticsEnabled: boolean;

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
  #inFlightSnapshots = 0;
  #lastSnapshotSentAt = 0;
  #snapshotFlushTimer?: ReturnType<typeof setTimeout>;
  #lastSentSimulationTick = -1;

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
  };

  constructor(host: RealtimeRoomHost, options: RealtimeRoomOptions<State, Input> = {}) {
    this.#host = host;
    this.#options = options;
    this.#simulationHz = clamp(options.simulationHz ?? 60, 1, 240);
    const snapshotHz = clamp(
      options.snapshotHz ?? REALTIME_ROOM_DEFAULT_SNAPSHOT_HZ,
      1,
      REALTIME_ROOM_MAX_SNAPSHOT_HZ,
    );
    const inputHz = clamp(options.inputHz ?? REALTIME_ROOM_MAX_INPUT_HZ, 1, REALTIME_ROOM_MAX_INPUT_HZ);
    this.#snapshotIntervalMs = 1000 / snapshotHz;
    this.#inputIntervalMs = 1000 / inputHz;
    this.#maxInFlightSnapshots = clamp(
      Math.ceil((REALTIME_ROOM_IN_FLIGHT_BUDGET_MS / 1000) * snapshotHz),
      REALTIME_ROOM_DEFAULT_IN_FLIGHT_SNAPSHOTS,
      REALTIME_ROOM_MAX_IN_FLIGHT_SNAPSHOTS,
    );
    this.#correctionMs = Math.max(0, options.correctionMs ?? REALTIME_ROOM_DEFAULT_CORRECTION_MS);
    this.#diagnosticsEnabled = options.diagnostics ?? false;
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
      pendingSnapshotCount: this.#inFlightSnapshots + (this.#pendingSnapshot ? 1 : 0),
      lastAcknowledgedInputSequence: this.#lastAcknowledgedInputSequence,
      lastError: this.#lastError,
      diagnostics: this.#diagnosticsEnabled ? { ...this.#diagnostics } : undefined,
    };
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

  /** Latest-wins continuous control input; coalesced and periodically refreshed. */
  setInput(input: Input): void {
    if (this.#connection === "closed" || this.#connection === "failed") {
      throw new RealtimeRoomError("rejected", "room is not connected");
    }
    const parsed = this.#parseInput(input);
    assertJsonCompatible(parsed);
    this.#latestInput = parsed;
    this.#armInputResendTimer();
    void this.#sendLatestInput();
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
    this.#attemptFlush();
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
    this.#inFlightSnapshots = 0;
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
    for (const pending of this.#orderedPending.values()) {
      pending.reject(new RealtimeRoomError("stale", "round restarted"));
    }
    this.#orderedPending.clear();
    const parsed = this.#parseState(initialState);
    assertJsonCompatible(parsed);
    this.#hostSnapshotSequence += 1;
    void this.#host
      .sendRealtimeSnapshot(parsed, {
        authorityEpoch: this.#authorityEpoch,
        roundSequence: this.#roundSequence,
        simulationTick: 0,
        hostSnapshotSequence: this.#hostSnapshotSequence,
        hostSendTime: Date.now(),
        processedInputCursors: {},
      })
      .catch(() => undefined);
    this.#inFlightSnapshots += 1;
    this.#lastSentSimulationTick = 0;
    this.#lastSnapshotSentAt = monotonicNow();
    this.#diagnostics.snapshotsSent += 1;
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
        REALTIME_ROOM_MAX_EXTRAPOLATION_INTERVALS * Math.round(this.#snapshotIntervalMs / fixedStepMs),
      );
      if (this.#options.extrapolate && extraTicks > 0) {
        this.#diagnostics.extrapolatedFrames += 1;
        return this.#options.extrapolate(latest.state, (extraTicks * fixedStepMs) / 1000);
      }
    }
    return latest.state;
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
    const snapshotIntervalTicks = Math.max(1, Math.round(this.#snapshotIntervalMs / fixedStepMs));
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
    // Adapt to whichever jitter signal is currently worse: ordered-input RTT
    // jitter (useful before any snapshot has arrived) or observed
    // snapshot-arrival jitter (a direct measurement of how uneven the actual
    // presentation feed is). This lowers delay when arrival is stable and
    // temporarily raises it when snapshots become uneven.
    return Math.max(
      REALTIME_ROOM_MIN_INTERPOLATION_DELAY_MS,
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
        this.#inFlightSnapshots = Math.max(0, this.#inFlightSnapshots - 1);
        this.#attemptFlush();
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
        const snapshotIntervalTicks = Math.max(1, Math.round(this.#snapshotIntervalMs / fixedStepMs));
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
    if (this.#inFlightSnapshots >= this.#maxInFlightSnapshots) return;
    const elapsed = monotonicNow() - this.#lastSnapshotSentAt;
    if (elapsed < this.#snapshotIntervalMs) {
      this.#snapshotFlushTimer = setTimeout(() => this.#attemptFlush(), this.#snapshotIntervalMs - elapsed);
      this.#snapshotFlushTimer.unref?.();
      return;
    }
    const next = this.#pendingSnapshot;
    this.#pendingSnapshot = undefined;
    this.#hostSnapshotSequence += 1;
    this.#lastSentSimulationTick = next.simulationTick;
    this.#lastSnapshotSentAt = monotonicNow();
    this.#inFlightSnapshots += 1;
    this.#diagnostics.snapshotsSent += 1;
    const processedInputCursors: Record<string, number> = {};
    for (const [playerId, cursor] of this.#hostProcessedCursors) {
      if (cursor >= 0) processedInputCursors[playerId] = cursor;
    }
    void this.#host
      .sendRealtimeSnapshot(next.state, {
        authorityEpoch: this.#authorityEpoch,
        roundSequence: this.#roundSequence,
        simulationTick: next.simulationTick,
        hostSnapshotSequence: this.#hostSnapshotSequence,
        hostSendTime: Date.now(),
        processedInputCursors,
      })
      .catch(() => {
        this.#inFlightSnapshots = Math.max(0, this.#inFlightSnapshots - 1);
      });
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
    if (this.#snapshotFlushTimer) {
      clearTimeout(this.#snapshotFlushTimer);
      this.#snapshotFlushTimer = undefined;
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
    this.#inFlightSnapshots = 0;
    this.#lastSentSimulationTick = -1;
    this.#hostSnapshotSequence = 0;
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
