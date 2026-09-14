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
export const REALTIME_ROOM_MAX_SNAPSHOT_HZ = 10;
export const REALTIME_ROOM_MAX_INPUT_HZ = 20;
export const REALTIME_ROOM_MAX_IN_FLIGHT_SNAPSHOTS = 3;
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
  correctionCount: number;
  reconnectCount: number;
  lastReconnectDurationMs?: number;
  hostMigrationCount: number;
  lastHostMigrationDurationMs?: number;
};

export type InputsForTick<Input> = {
  latest: Record<string, Input>;
  orderedCommands: Array<{ playerId: string; inputSequence: number; input: Input }>;
};

export type RealtimeRoomOptions<State, Input> = {
  stateSchema?: Schema<State>;
  inputSchema?: Schema<Input>;
  predict?(state: State, input: Input, dtSeconds: number): State;
  interpolate?(from: State, to: State, t: number): State;
  extrapolate?(state: State, dtSeconds: number): State;
  blendCorrection?(predicted: State, authoritative: State, t: number): State;
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
 * apply one prediction step immediately. Reconciliation restores the latest
 * snapshot and replays the held control plus unacknowledged ordered inputs.
 */
export class RealtimeRoom<State, Input> {
  readonly #host: RealtimeRoomHost;
  readonly #options: RealtimeRoomOptions<State, Input>;
  readonly #listeners = new Set<(snapshot: RealtimeRoomSnapshot<State>) => void>();
  readonly #simulationHz: number;
  readonly #snapshotIntervalMs: number;
  readonly #inputIntervalMs: number;
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
  #pendingCorrection?: { from: State };
  #correctionStartedAt?: number;

  // RTT/jitter estimate derived from ordered-input ack round trips.
  #smoothedRttMs = 0;
  #jitterMs = 0;

  readonly #diagnostics: RealtimeRoomDiagnostics = {
    inputsSent: 0,
    inputsCoalesced: 0,
    inputsDropped: 0,
    snapshotsSent: 0,
    snapshotsCoalesced: 0,
    snapshotsAcked: 0,
    extrapolatedFrames: 0,
    correctionCount: 0,
    reconnectCount: 0,
    hostMigrationCount: 0,
  };

  constructor(host: RealtimeRoomHost, options: RealtimeRoomOptions<State, Input> = {}) {
    this.#host = host;
    this.#options = options;
    this.#simulationHz = clamp(options.simulationHz ?? 60, 1, 240);
    const snapshotHz = clamp(options.snapshotHz ?? REALTIME_ROOM_MAX_SNAPSHOT_HZ, 1, REALTIME_ROOM_MAX_SNAPSHOT_HZ);
    const inputHz = clamp(options.inputHz ?? REALTIME_ROOM_MAX_INPUT_HZ, 1, REALTIME_ROOM_MAX_INPUT_HZ);
    this.#snapshotIntervalMs = 1000 / snapshotHz;
    this.#inputIntervalMs = 1000 / inputHz;
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
    this.#pendingCorrection = undefined;
    this.#correctionStartedAt = undefined;
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

  /** Samples the authoritative timeline for rendering: prediction, interpolation, and correction. */
  getRenderState(now: number): State | undefined {
    const authoritative = this.#sampleAuthoritative(now);
    const predicted = this.#predictedState;
    if (authoritative === undefined && predicted === undefined) return undefined;
    if (predicted !== undefined && this.#options.blendCorrection) {
      const from = this.#pendingCorrection?.from ?? predicted;
      if (this.#pendingCorrection && this.#correctionStartedAt === undefined) {
        this.#correctionStartedAt = now;
      }
      const t = !this.#pendingCorrection
        ? 0
        : this.#correctionMs <= 0
          ? 1
          : clamp((now - (this.#correctionStartedAt ?? now)) / this.#correctionMs, 0, 1);
      const blended = this.#options.blendCorrection(from, authoritative ?? predicted, t);
      if (this.#pendingCorrection && t >= 1) {
        this.#pendingCorrection = undefined;
        this.#correctionStartedAt = undefined;
      }
      return blended;
    }
    if (predicted !== undefined) return predicted;
    return authoritative;
  }

  #sampleAuthoritative(now: number): State | undefined {
    const latest = this.#latestSnapshot;
    if (!latest) return undefined;
    const fixedStepMs = 1000 / this.#simulationHz;
    const delayTicks = Math.max(0, Math.round(this.#interpolationDelayMs() / fixedStepMs));
    const renderClockTick = this.#renderClockTick(now, fixedStepMs);
    const targetTick = renderClockTick - delayTicks;
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

  #renderClockTick(now: number, fixedStepMs: number): number {
    const latestTick = this.#latestSnapshot?.simulationTick ?? 0;
    if (!this.#renderClockAnchor) {
      this.#renderClockAnchor = { now, tick: latestTick };
    }
    const elapsedTicks = Math.round((now - this.#renderClockAnchor.now) / fixedStepMs);
    return this.#renderClockAnchor.tick + elapsedTicks;
  }

  #interpolationDelayMs(): number {
    if (this.#options.interpolationDelayMs !== undefined) {
      return Math.max(0, this.#options.interpolationDelayMs);
    }
    return Math.max(REALTIME_ROOM_MIN_INTERPOLATION_DELAY_MS, this.#smoothedRttMs / 2 + this.#jitterMs);
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
        this.#pendingCorrection = undefined;
        this.#correctionStartedAt = undefined;
        this.#renderClockAnchor = undefined;
      }
      if (this.#latestSnapshot && message.simulationTick <= this.#latestSnapshot.simulationTick) return;
      this.#previousSnapshot = this.#latestSnapshot;
      this.#latestSnapshot = { state: message.state as State, simulationTick: message.simulationTick };
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
    this.#predictedState = this.#options.predict(cloneJson(base), input, 1 / this.#simulationHz);
  }

  #reconcile(): void {
    if (!this.#options.predict || !this.#latestSnapshot) return;
    const oldPredicted = this.#predictedState;
    const dtSeconds = 1 / this.#simulationHz;
    const hasHeld = this.#latestInput !== undefined;
    const ordered = [...this.#orderedPending.values()].sort((a, b) => a.inputSequence - b.inputSequence);
    if (!hasHeld && ordered.length === 0) {
      this.#predictedState = undefined;
    } else {
      let next = cloneJson(this.#latestSnapshot.state);
      for (const pending of ordered) {
        next = this.#options.predict(cloneJson(next), pending.input, dtSeconds);
      }
      if (this.#latestInput !== undefined) {
        next = this.#options.predict(cloneJson(next), this.#latestInput, dtSeconds);
      }
      this.#predictedState = next;
    }
    if (this.#options.blendCorrection && oldPredicted !== undefined) {
      this.#pendingCorrection = { from: oldPredicted };
      this.#correctionStartedAt = undefined;
      this.#diagnostics.correctionCount += 1;
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
    if (this.#inFlightSnapshots >= REALTIME_ROOM_MAX_IN_FLIGHT_SNAPSHOTS) return;
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
    this.#pendingCorrection = undefined;
    this.#correctionStartedAt = undefined;
    this.#renderClockAnchor = undefined;
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
