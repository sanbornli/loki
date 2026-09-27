import {
  ClientEnvelopeSchema,
  CreateRoomOptionsSchema,
  JoinPublicRoomInputSchema,
  LeaderboardListInputSchema,
  LeaderboardListResultSchema,
  LeaderboardSubmitInputSchema,
  LeaderboardSubmitResultSchema,
  ListPublicRoomsInputSchema,
  ListPublicRoomsResultSchema,
  RealtimeClientEnvelopeSchema,
  RealtimeServerEnvelopeSchema,
  RealtimeSignalServerEnvelopeSchema,
  ServerEnvelopeSchema,
  PROTOCOL_VERSION,
  REALTIME_PROTOCOL_VERSION,
  REALTIME_OPCODES,
  REALTIME_SIGNAL_OPCODES,
  dequantize,
  quantize,
  type ClientEnvelope,
  type CreateRoomOptions,
  type JoinPublicRoomInput,
  type LeaderboardListInput,
  type LeaderboardListResult,
  type LeaderboardRecord,
  type LeaderboardSubmitResult,
  type ListPublicRoomsInput,
  type ListPublicRoomsResult,
  type RealtimeClientEnvelope,
  type RealtimeDelivery,
  type RealtimeServerEnvelope,
  type RealtimeSignalClientEnvelope,
  type RealtimeSignalServerEnvelope,
  type ServerEnvelope,
} from "../../protocol/src/index.js";
import {
  WebrtcStar,
  defaultPeerConnectionFactory,
  DEFAULT_STUN_SERVERS,
  type IceServerConfig,
  type PeerConnectionFactory,
  type WebrtcSignalInbound,
  type WebrtcSignalOutbound,
} from "./webrtc-star.js";
import { Client, Session, type Socket } from "@heroiclabs/nakama-js";
import {
  createBrowserPageLifecycle,
  ForegroundController,
  ReconnectScheduler,
  type PageLifecycle,
} from "./reconnect.js";
import {
  SynchronizedRoom,
  type ConnectionEvent,
  type SynchronizedRoomOptions,
} from "./synchronized-room.js";
import { RealtimeRoom, type RealtimeRoomOptions } from "./realtime-room.js";
import { createEntityCompositor, createLocalPrediction } from "./realtime-entities.js";
import { calibrateRealtimeRoom } from "./realtime-calibration.js";

export {
  SYNCHRONIZED_ROOM_ACTION_TTL_MS,
  SYNCHRONIZED_ROOM_MAX_COMMIT_TIMEOUT_MS,
  SYNCHRONIZED_ROOM_MAX_MESSAGE_BYTES,
  SYNCHRONIZED_ROOM_MAX_PENDING,
  SYNCHRONIZED_ROOM_MAX_RECENT_ACTIONS,
  SYNCHRONIZED_ROOM_COMMIT_TIMEOUT_MS,
  SYNCHRONIZED_ROOM_MAX_RECOVERY_DEADLINE_MS,
  SYNCHRONIZED_ROOM_MAX_REDUCER_MS,
  SYNCHRONIZED_ROOM_MIN_COMMIT_TIMEOUT_MS,
  SYNCHRONIZED_ROOM_MIN_RECOVERY_DEADLINE_MS,
  SYNCHRONIZED_ROOM_RECOVERY_DEADLINE_MS,
  SynchronizedRoom,
  SynchronizedRoomError,
} from "./synchronized-room.js";
export type {
  ActionContext,
  CommittedTransition,
  ConnectionEvent,
  ConnectionState,
  MembershipStatus,
  RoomMember,
  Schema,
  SynchronizedRoomOutcome,
  SynchronizedRoomSnapshot,
} from "./synchronized-room.js";

export {
  REALTIME_ROOM_BACK_TO_BACK_PUBLISH_FACTOR,
  REALTIME_ROOM_DEFAULT_IN_FLIGHT_SNAPSHOTS,
  REALTIME_ROOM_DEFAULT_SNAPSHOT_HZ,
  REALTIME_ROOM_HOST_STALL_FACTOR,
  REALTIME_ROOM_HOST_STALL_FLOOR_MS,
  REALTIME_ROOM_IN_FLIGHT_BUDGET_MS,
  REALTIME_ROOM_LOW_EFFECTIVE_RATE_FACTOR,
  REALTIME_ROOM_MAX_CATCHUP_STEPS,
  REALTIME_ROOM_MAX_CLOCK_NUDGE,
  REALTIME_ROOM_MAX_EXTRAPOLATION_INTERVALS,
  REALTIME_ROOM_MAX_IN_FLIGHT_SNAPSHOTS,
  REALTIME_ROOM_MAX_INPUT_HZ,
  REALTIME_ROOM_MAX_MESSAGE_BYTES,
  REALTIME_ROOM_MAX_ORDERED_INPUTS,
  REALTIME_ROOM_MAX_SEEN_EFFECT_IDS,
  REALTIME_ROOM_MAX_SNAPSHOT_HZ,
  REALTIME_ROOM_MIN_INTERPOLATION_DELAY_MS,
  REALTIME_ROOM_DEFAULT_CORRECTION_MS,
  RealtimeRoom,
  RealtimeRoomError,
} from "./realtime-room.js";
export type {
  InputsForTick,
  RealtimeRoomConfirmedEffect,
  RealtimeRoomDiagnostics,
  RealtimeRoomDiagnosticWarning,
  RealtimeRoomHost,
  RealtimeRoomOptions,
  RealtimeRoomOutcome,
  RealtimeRoomRenderStates,
  RealtimeRoomSnapshot,
} from "./realtime-room.js";

export { createEntityCompositor, createLocalPrediction };
export type { EntitySelectors, LocalPredictionSelectors } from "./realtime-entities.js";

export { calibrateRealtimeRoom };
export type {
  RealtimeCalibrationCandidate,
  RealtimeCalibrationOptions,
  RealtimeCalibrationResult,
  RealtimeCalibrationSample,
  RealtimeProfile,
} from "./realtime-calibration.js";

export { dequantize, quantize };
export {
  ForegroundController,
  createBrowserPageLifecycle,
  ReconnectScheduler,
  reconnectDelayMs,
  RECONNECT_MAX_DELAY_MS,
} from "./reconnect.js";
export type { LifecycleCause, LifecycleState, PageLifecycle } from "./reconnect.js";
export type {
  ClientEnvelope,
  CreateRoomOptions,
  JoinPublicRoomInput,
  LeaderboardListInput,
  LeaderboardListResult,
  LeaderboardRecord,
  LeaderboardSubmitResult,
  ListPublicRoomsInput,
  ListPublicRoomsResult,
  PublicRoomSummary,
  ServerEnvelope,
} from "../../protocol/src/index.js";

export {
  WebrtcStar,
  defaultPeerConnectionFactory,
  DEFAULT_STUN_SERVERS,
} from "./webrtc-star.js";
export type {
  IceServerConfig,
  PeerConnectionFactory,
  PeerConnectionLike,
  DataChannelLike,
  WebrtcPeerState,
  WebrtcStarOptions,
} from "./webrtc-star.js";

export const LOKI_API_ORIGIN = "https://api.lokiplay.cc";

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

export const encodeMatchStateBytes = (message: unknown): Uint8Array =>
  textEncoder.encode(JSON.stringify(message));

const payload = <T>(response: { payload?: object }): T => response.payload as T;
export const requireLeaveRoomSuccess = (result: unknown): void => {
  const parsed =
    typeof result === "string"
      ? (JSON.parse(result) as unknown)
      : result &&
          typeof result === "object" &&
          "data" in result &&
          typeof (result as { data?: unknown }).data === "string"
        ? (JSON.parse((result as { data: string }).data) as unknown)
        : result;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("leave failed");
  }
  const body = parsed as { ok?: unknown; error?: unknown };
  if (body.ok !== true) {
    throw new Error(typeof body.error === "string" && body.error ? body.error : "leave failed");
  }
};


export type JoinedRoom = {
  roomId: string;
  inviteCode: string;
  snapshot: ServerEnvelope;
};

export async function lokiErrorFromUnknown(error: unknown): Promise<Error> {
  if (typeof Response !== "undefined" && error instanceof Response) {
    const status = error.status;
    let detail = "";
    try {
      const text = await error.clone().text();
      if (text) {
        try {
          const parsed = JSON.parse(text) as { message?: string; error?: string };
          detail = parsed.message || parsed.error || text;
        } catch {
          detail = text;
        }
      }
    } catch {
      // The body may already have been consumed by the transport.
    }
    return new Error(
      detail
        ? `Loki request failed (${status}): ${detail}`
        : `Loki request failed (${status})`,
    );
  }
  if (error instanceof Error) {
    if (error.message === "[object Response]") {
      return new Error("Loki request failed");
    }
    return error;
  }
  if (error && typeof error === "object" && "status" in error) {
    const status = Number((error as { status: unknown }).status);
    return new Error(
      Number.isFinite(status) ? `Loki request failed (${status})` : "Loki request failed",
    );
  }
  return new Error("Loki request failed");
}

const notifyListeners = <T>(
  listeners: Iterable<(value: T) => void>,
  value: T,
): void => {
  for (const listener of listeners) {
    try {
      listener(value);
    } catch {
      // Listener exceptions must not prevent remaining subscribers from running.
    }
  }
};

const protocolRejectionMessage = (message: string): string => {
  const text = message.trim() || "action rejected";
  return text.length > 200 ? text.slice(0, 200) : text;
};

const wrapLokiCall = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    throw await lokiErrorFromUnknown(error);
  }
};

const normalizeInviteCode = (value: string): string => value.trim().toUpperCase();

const validInviteCode = (value: string): boolean =>
  /^[0-9]{6}$/.test(value) || /^[A-F0-9]{16}$/.test(value);

const requireInviteCode = (value: string): string => {
  const inviteCode = normalizeInviteCode(value);
  if (!validInviteCode(inviteCode)) {
    throw new Error("INVITE_INVALID: invite codes are 6 digits issued by Loki");
  }
  return inviteCode;
};

export interface LokiTransport {
  authenticate(token: string): Promise<{ playerId: string }>;
  createRoom(input: {
    projectId: string;
    realtimeCapable?: boolean;
    visibility?: CreateRoomOptions["visibility"];
    modeLabel?: string;
  }): Promise<JoinedRoom>;
  joinRoom(input: {
    projectId: string;
    inviteCode: string;
    realtimeCapable?: boolean;
  }): Promise<JoinedRoom>;
  listPublicRooms?(
    input?: ListPublicRoomsInput & { projectId: string },
  ): Promise<ListPublicRoomsResult>;
  joinPublicRoom?(input: {
    projectId: string;
    roomId: string;
    realtimeCapable?: boolean;
  }): Promise<JoinedRoom>;
  send(message: ClientEnvelope): Promise<void>;
  /** Optional protocol-v2 realtime data plane; only the upgraded JS SDK requires it. */
  sendRealtime?(message: RealtimeClientEnvelope): Promise<void>;
  subscribe(listener: (message: unknown) => void): () => void;
  resolveInvite?(inviteCode: string): Promise<{ roomId: string; inviteCode: string }>;
  matchmake?(
    input: { minPlayers: number; maxPlayers: number; teamSize?: number; realtimeCapable?: boolean },
    options?: { signal?: AbortSignal },
  ): Promise<JoinedRoom>;
  /** Room-independent leaderboard read; usable without an active room. */
  listLeaderboard?(input: LeaderboardListInput): Promise<LeaderboardListResult>;
  /** Room-independent leaderboard write; usable without an active room. */
  submitLeaderboardScore?(input: {
    leaderboardId: string;
    score: number;
    subscore?: number;
    displayName?: string;
  }): Promise<LeaderboardRecord>;
  leaveRoom?(roomId: string): Promise<void>;
  reconnect?(): Promise<void>;
  refresh?(): Promise<void>;
  close(): Promise<void>;
  subscribeConnection?(listener: (event: ConnectionEvent) => void): () => void;
  /** Optional, read-only, additive: current room's transport mix. Does not change any existing callback contract. */
  getTransportDiagnostics?(): TransportDiagnostics;
}

export type TransportDiagnostics = {
  /** "websocket" when no data channel is connected, "webrtc" when every peer that matters is on a data channel, "mixed" otherwise. */
  mode: "websocket" | "webrtc" | "mixed";
  connectedPeers: number;
  webrtcSupported: boolean;
};

export interface LokiClientOptions {
  projectId: string;
  transport: LokiTransport;
}

export class LokiClient {
  readonly #transport: LokiTransport;
  readonly #projectId: string;
  readonly #listeners = new Set<(message: ServerEnvelope) => void>();
  readonly #realtimeListeners = new Set<(message: RealtimeServerEnvelope) => void>();
  #unsubscribe?: () => void;
  #playerId?: string;
  #roomId?: string;
  #joining = false;
  #joinBuffer: ServerEnvelope[] = [];
  #realtimeJoinBuffer: RealtimeServerEnvelope[] = [];
  #sendSequence = 0;
  #receiveSequence = 0;
  #realtimeSendSequence = 0;
  #realtimeReceiveSequence = 0;
  // See #dispatchRealtime: a bounded, content-keyed dedupe window so a
  // realtime message that legitimately arrives twice (once over the
  // Nakama WebSocket, once over a WebRTC data channel) is only delivered
  // once, without dropping a data-channel frame that happens to carry a
  // lower transport `sequence` than an already-delivered WebSocket frame.
  #realtimeSeenKeys = new Set<string>();
  #realtimeSeenKeyOrder: string[] = [];
  #inviteCode = "";
  #connectionListeners = new Set<(event: ConnectionEvent) => void>();
  #unsubscribeConnection?: () => void;
  #lifecycle = Promise.resolve();
  #lifecycleGeneration = 0;
  #reconnectPromise?: Promise<void>;
  #leaveFailed = false;

  constructor(options: LokiClientOptions) {
    if (!/^[0-9a-f-]{36}$/i.test(options.projectId)) {
      throw new Error("invalid project id");
    }
    this.#projectId = options.projectId;
    this.#transport = options.transport;
  }

  get playerId(): string | undefined {
    return this.#playerId;
  }

  get roomId(): string | undefined {
    return this.#roomId;
  }

  get inviteCode(): string {
    return this.#inviteCode;
  }

  initialize(): void {
    if (this.#unsubscribe) return;
    this.#unsubscribe = this.#transport.subscribe((raw) => {
      const record = raw as { protocolVersion?: number };
      if (record && record.protocolVersion === REALTIME_PROTOCOL_VERSION) {
        const message = RealtimeServerEnvelopeSchema.parse(raw);
        if (this.#joining) {
          this.#realtimeJoinBuffer.push(message);
          return;
        }
        this.#dispatchRealtime(message);
        return;
      }
      const message = ServerEnvelopeSchema.parse(raw);
      if (this.#joining) {
        this.#joinBuffer.push(message);
        return;
      }
      this.#dispatch(message);
    });
    this.#unsubscribeConnection = this.#transport.subscribeConnection?.((event) => {
      notifyListeners(this.#connectionListeners, event);
    });
  }

  createSynchronizedRoom<State, Action>(
    options: SynchronizedRoomOptions<State, Action>,
  ): SynchronizedRoom<State, Action> {
    if (!this.#unsubscribe) this.initialize();
    return new SynchronizedRoom(
      {
        playerId: () => this.#playerId,
        sendAction: (payload, extras) => this.sendAction(payload, extras),
        sendHostState: (expectedVersion, state, extras) =>
          this.sendHostState(expectedVersion, state, extras),
        sendActionRejection: (actionId, outcome, message, extras) =>
          this.sendActionRejection(actionId, outcome, message, extras),
        requestSnapshot: () => this.requestSnapshot(),
        createRoom: (input) => this.createRoom(input),
        joinRoom: (input) => this.joinRoom(input),
        joinPublicRoom: (input) => this.joinPublicRoom(input),
        matchmake: (input, matchOptions) => this.matchmake(input, matchOptions),
        leaveRoom: (roomId) => this.leaveRoom(roomId),
        reconnect: () => this.reconnect(),
        onMessage: (listener) => this.onMessage(listener),
        onConnection: (listener) => this.onConnection(listener),
      },
      options,
    );
  }

  createRealtimeRoom<State, Input, Effect = unknown>(
    options: RealtimeRoomOptions<State, Input> = {},
  ): RealtimeRoom<State, Input, Effect> {
    if (!this.#unsubscribe) this.initialize();
    return new RealtimeRoom(
      {
        playerId: () => this.#playerId,
        createRoom: (input) => this.createRoom({ ...input, realtimeCapable: true }),
        joinRoom: (input) => this.joinRoom(input, { realtimeCapable: true }),
        joinPublicRoom: (input) => this.joinPublicRoom(input, { realtimeCapable: true }),
        matchmake: (input, matchOptions) =>
          this.matchmake({ ...input, realtimeCapable: true }, matchOptions),
        leaveRoom: (roomId) => this.leaveRoom(roomId),
        reconnect: () => this.reconnect(),
        sendRealtimeInput: (payload, extras) => this.sendRealtimeInput(payload, extras),
        sendRealtimeSnapshot: (state, extras) => this.sendRealtimeSnapshot(state, extras),
        sendRealtimeEffect: (payload, extras) => this.sendRealtimeEffect(payload, extras),
        sendRealtimeGuestReport: (report) => this.sendRealtimeGuestReport(report),
        requestRealtimeSync: () => this.requestRealtimeSync(),
        onMessage: (listener) => this.onMessage(listener),
        onRealtimeMessage: (listener) => this.onRealtimeMessage(listener),
        onConnection: (listener) => this.onConnection(listener),
      },
      options,
    );
  }

  onConnection(listener: (event: ConnectionEvent) => void): () => void {
    this.#connectionListeners.add(listener);
    return () => this.#connectionListeners.delete(listener);
  }

  async authenticate(token: string): Promise<{ playerId: string }> {
    if (!this.#unsubscribe) this.initialize();
    const session = await this.#transport.authenticate(token);
    this.#playerId = session.playerId;
    return session;
  }

  async createRoom(
    options?: { realtimeCapable?: boolean } & CreateRoomOptions,
  ): Promise<JoinedRoom> {
    if (!this.#playerId) throw new Error("authenticate before creating a room");
    const created = CreateRoomOptionsSchema.parse({
      visibility: options?.visibility,
      modeLabel: options?.modeLabel,
    });
    return this.#serialize(() =>
      this.#enterRoom(() =>
        this.#transport.createRoom({
          projectId: this.#projectId,
          realtimeCapable: options?.realtimeCapable,
          visibility: created.visibility,
          modeLabel: created.modeLabel,
        }),
      ),
    );
  }

  async listPublicRooms(input: { limit?: number } = {}): Promise<ListPublicRoomsResult> {
    if (!this.#playerId) throw new Error("authenticate before listing public rooms");
    if (!this.#transport.listPublicRooms) {
      throw new Error("runtime does not advertise public_room_browser");
    }
    const parsed = ListPublicRoomsInputSchema.parse({
      limit: input.limit ?? 50,
    });
    return ListPublicRoomsResultSchema.parse(
      await this.#transport.listPublicRooms({
        ...parsed,
        projectId: this.#projectId,
      }),
    );
  }

  async joinPublicRoom(
    input: JoinPublicRoomInput,
    options?: { realtimeCapable?: boolean },
  ): Promise<JoinedRoom> {
    if (!this.#playerId) throw new Error("authenticate before joining a room");
    if (!this.#transport.joinPublicRoom) {
      throw new Error("runtime does not advertise public_room_browser");
    }
    const parsed = JoinPublicRoomInputSchema.parse(input);
    return this.#serialize(() =>
      this.#enterRoom(() =>
        this.#transport.joinPublicRoom!({
          projectId: this.#projectId,
          roomId: parsed.roomId,
          realtimeCapable: options?.realtimeCapable,
        }),
      ),
    );
  }

  async joinRoom(
    input: { inviteCode: string },
    options?: { realtimeCapable?: boolean },
  ): Promise<JoinedRoom> {
    if (!this.#playerId) throw new Error("authenticate before joining a room");
    return this.#serialize(() =>
      this.#enterRoom(() =>
        this.#transport.joinRoom({
          projectId: this.#projectId,
          inviteCode: requireInviteCode(input.inviteCode),
          realtimeCapable: options?.realtimeCapable,
        }),
      ),
    );
  }

  async #serialize<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.#lifecycle.then(operation, operation);
    this.#lifecycle = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async #enterRoom(join: () => Promise<JoinedRoom>): Promise<JoinedRoom> {
    if (this.#leaveFailed) {
      throw new Error("resolve the failed leave before joining another room");
    }
    const generation = ++this.#lifecycleGeneration;
    this.#joining = true;
    this.#joinBuffer = [];
    this.#realtimeJoinBuffer = [];
    let joinedRoomId = "";
    try {
      const joined = await join();
      joinedRoomId = joined.roomId;
      const snapshot = ServerEnvelopeSchema.parse(joined.snapshot);
      if (snapshot.roomId !== joined.roomId || snapshot.type !== "snapshot") {
        throw new Error("invalid join snapshot");
      }
      if (generation !== this.#lifecycleGeneration) {
        await this.#transport.leaveRoom?.(joined.roomId).catch(() => undefined);
        throw new Error("stale room join abandoned");
      }
      this.#roomId = joined.roomId;
      this.#inviteCode = joined.inviteCode;
      this.#sendSequence = 0;
      this.#receiveSequence = snapshot.sequence;
      this.#realtimeSendSequence = 0;
      this.#realtimeReceiveSequence = 0;
      const buffered = this.#joinBuffer;
      this.#joinBuffer = [];
      const realtimeBuffered = this.#realtimeJoinBuffer;
      this.#realtimeJoinBuffer = [];
      this.#joining = false;
      for (const message of buffered) this.#dispatch(message);
      for (const message of realtimeBuffered) this.#dispatchRealtime(message);
      return {
        roomId: joined.roomId,
        inviteCode: joined.inviteCode,
        snapshot,
      };
    } catch (error) {
      if (joinedRoomId) {
        await this.#transport.leaveRoom?.(joinedRoomId).catch(() => undefined);
        if (this.#roomId === joinedRoomId) {
          this.#roomId = undefined;
          this.#inviteCode = "";
        }
      }
      throw error;
    } finally {
      this.#joining = false;
      this.#joinBuffer = [];
      this.#realtimeJoinBuffer = [];
    }
  }

  #dispatch(message: ServerEnvelope): void {
    if (
      message.roomId !== this.#roomId ||
      message.sequence < this.#receiveSequence
    ) return;
    this.#receiveSequence = message.sequence;
    notifyListeners(this.#listeners, message);
  }

  #dispatchRealtime(message: RealtimeServerEnvelope): void {
    if (message.roomId !== this.#roomId) return;
    const key = this.#realtimeDedupeKey(message);
    if (key) {
      if (this.#realtimeSeenKeys.has(key)) return;
      this.#rememberRealtimeKey(key);
    } else if (message.sequence < this.#realtimeReceiveSequence) {
      // Types without a content-based dedupe key (sync responses, errors)
      // are never dual-delivered over both the WebSocket and a data
      // channel, so the original monotonic-sequence guard still applies.
      return;
    }
    if (message.sequence > this.#realtimeReceiveSequence) {
      this.#realtimeReceiveSequence = message.sequence;
    }
    notifyListeners(this.#realtimeListeners, message);
  }

  // realtime_snapshot, realtime_input, realtime_effect, and
  // realtime_guest_report can legitimately arrive twice for the same
  // logical event (once over the Nakama WebSocket, once over a WebRTC data
  // channel); this content-derived key -- not the transport-assigned
  // `sequence` -- is what identifies a duplicate, so a data-channel frame
  // is never dropped just because a higher-numbered WebSocket frame
  // already arrived.
  #realtimeDedupeKey(message: RealtimeServerEnvelope): string | undefined {
    switch (message.type) {
      case "realtime_snapshot":
        return `snapshot:${message.authorityEpoch}:${message.runtimeSnapshotSequence}`;
      case "realtime_input":
        return `input:${message.senderId}:${message.inputSequence}:${message.delivery}`;
      case "realtime_effect":
        return `effect:${message.effectId}`;
      case "realtime_guest_report":
        return `report:${message.senderId}:${message.roundSequence}`;
      default:
        return undefined;
    }
  }

  #rememberRealtimeKey(key: string): void {
    this.#realtimeSeenKeys.add(key);
    this.#realtimeSeenKeyOrder.push(key);
    if (this.#realtimeSeenKeyOrder.length > 256) {
      const oldest = this.#realtimeSeenKeyOrder.shift();
      if (oldest !== undefined) this.#realtimeSeenKeys.delete(oldest);
    }
  }

  async sendAction(
    payload: unknown,
    options?: { actionId?: string },
  ): Promise<void> {
    if (!this.#roomId) throw new Error("join a room before sending actions");
    const message = ClientEnvelopeSchema.parse({
      protocolVersion: 1,
      roomId: this.#roomId,
      sequence: ++this.#sendSequence,
      type: "action",
      payload,
      actionId: options?.actionId,
    });
    await this.#transport.send(message);
  }

  async sendEvent(payload: unknown, reliable = true): Promise<void> {
    if (!this.#roomId) throw new Error("join a room before sending events");
    const message = ClientEnvelopeSchema.parse({
      protocolVersion: 1,
      roomId: this.#roomId,
      sequence: ++this.#sendSequence,
      type: "event",
      reliable,
      payload,
    });
    await this.#transport.send(message);
  }

  async sendHostState(
    expectedVersion: number,
    state: unknown,
    options?: { actionId?: string; expectedStateVersion?: number; senderId?: string },
  ): Promise<void> {
    if (!this.#roomId) throw new Error("join a room before sending state");
    const message = ClientEnvelopeSchema.parse({
      protocolVersion: 1,
      roomId: this.#roomId,
      sequence: ++this.#sendSequence,
      type: "host_state",
      expectedVersion,
      expectedStateVersion: options?.expectedStateVersion,
      actionId: options?.actionId,
      senderId: options?.senderId,
      state,
    });
    await this.#transport.send(message);
  }

  async sendActionRejection(
    actionId: string,
    outcome: "rejected" | "invalid",
    message: string,
    options?: { senderId?: string },
  ): Promise<void> {
    if (!this.#roomId) throw new Error("join a room before rejecting actions");
    const envelope = ClientEnvelopeSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      roomId: this.#roomId,
      sequence: ++this.#sendSequence,
      type: "action_reject",
      actionId,
      senderId: options?.senderId,
      outcome,
      message: protocolRejectionMessage(message),
    });
    await this.#transport.send(envelope);
  }

  async requestSnapshot(): Promise<void> {
    await this.#sendRoomMessage({ type: "snapshot_request" });
  }

  async sendChat(text: string, channel: "lobby" | "match" = "match"): Promise<void> {
    await this.#sendRoomMessage({ type: "chat", channel, text });
  }

  /** In-room score message. Kept for backward compatibility; prefer `submitLeaderboardScore` when no room is joined (e.g. a title-screen or post-game board). */
  async submitScore(
    leaderboardId: string,
    score: number,
    subscore = 0,
    options?: { displayName?: string },
  ): Promise<void> {
    await this.#sendRoomMessage({
      type: "score_submit",
      leaderboardId,
      score,
      subscore,
      displayName: options?.displayName,
    });
  }

  /** Room-independent leaderboard read (works before, during, or without joining a room). Loki does not ship a leaderboard screen; the game renders these records. */
  async listLeaderboard(
    leaderboardId: string,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<LeaderboardListResult> {
    if (!this.#playerId) throw new Error("authenticate before listing a leaderboard");
    if (!this.#transport.listLeaderboard) throw new Error("leaderboards are unsupported");
    const parsed = LeaderboardListInputSchema.parse({
      leaderboardId,
      limit: options.limit,
      cursor: options.cursor,
    });
    return LeaderboardListResultSchema.parse(await this.#transport.listLeaderboard(parsed));
  }

  /** Room-independent leaderboard write (works without joining a room). `displayName` is a game-owned label; Loki never infers one from the player's identity. */
  async submitLeaderboardScore(
    leaderboardId: string,
    score: number,
    options: { subscore?: number; displayName?: string } = {},
  ): Promise<LeaderboardRecord> {
    if (!this.#playerId) throw new Error("authenticate before submitting a score");
    if (!this.#transport.submitLeaderboardScore) throw new Error("leaderboards are unsupported");
    const parsed = LeaderboardSubmitInputSchema.parse({
      leaderboardId,
      score,
      subscore: options.subscore,
      displayName: options.displayName,
    });
    return LeaderboardSubmitResultSchema.parse({
      record: await this.#transport.submitLeaderboardScore(parsed),
    }).record;
  }

  async resolveInvite(inviteCode: string): Promise<{ roomId: string; inviteCode: string }> {
    if (!this.#transport.resolveInvite) throw new Error("invites are unsupported");
    return this.#transport.resolveInvite(requireInviteCode(inviteCode));
  }

  /** Optional, read-only transport diagnostics for the current room; undefined when the transport does not report them. Never affects delivery. */
  getTransportDiagnostics(): TransportDiagnostics | undefined {
    return this.#transport.getTransportDiagnostics?.();
  }

  async matchmake(
    input: { minPlayers: number; maxPlayers: number; teamSize?: number; realtimeCapable?: boolean },
    options?: { signal?: AbortSignal },
  ): Promise<JoinedRoom> {
    if (!this.#playerId) throw new Error("authenticate before matchmaking");
    if (!this.#transport.matchmake) throw new Error("matchmaking is unsupported");
    return this.#serialize(() =>
      this.#enterRoom(() => this.#transport.matchmake!(input, options)),
    );
  }

  async leaveRoom(roomId?: string): Promise<void> {
    this.#lifecycleGeneration += 1;
    return this.#serialize(async () => {
      const target = roomId || this.#roomId;
      if (!target) return;
      try {
        await this.#transport.leaveRoom?.(target);
        if (this.#roomId === target) {
          this.#roomId = undefined;
          this.#inviteCode = "";
          this.#sendSequence = 0;
          this.#receiveSequence = 0;
          this.#realtimeSendSequence = 0;
          this.#realtimeReceiveSequence = 0;
          this.#leaveFailed = false;
        }
      } catch (error) {
        if (this.#roomId === target || !this.#roomId) {
          this.#roomId = target;
          this.#leaveFailed = true;
        }
        throw error;
      }
    });
  }

  async reconnect(): Promise<void> {
    if (this.#reconnectPromise) return this.#reconnectPromise;
    this.#reconnectPromise = this.#serialize(async () => {
      if (!this.#transport.reconnect) throw new Error("reconnect is unsupported");
      if (this.#leaveFailed) throw new Error("resolve the failed leave before reconnecting");
      await this.#transport.reconnect();
      await this.requestSnapshot();
    }).finally(() => {
      this.#reconnectPromise = undefined;
    });
    return this.#reconnectPromise;
  }

  async refresh(): Promise<void> {
    if (!this.#transport.refresh) throw new Error("refresh is unsupported");
    await this.#transport.refresh();
  }

  onMessage(listener: (message: ServerEnvelope) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  onRealtimeMessage(listener: (message: RealtimeServerEnvelope) => void): () => void {
    this.#realtimeListeners.add(listener);
    return () => this.#realtimeListeners.delete(listener);
  }

  async sendRealtimeInput(
    payload: unknown,
    options: {
      roundSequence: number;
      inputSequence: number;
      targetTick: number;
      delivery: RealtimeDelivery;
      clientSendTime: number;
    },
  ): Promise<void> {
    if (!this.#roomId) throw new Error("join a room before sending realtime input");
    if (!this.#transport.sendRealtime) throw new Error("realtime rooms are unsupported by this transport");
    const message = RealtimeClientEnvelopeSchema.parse({
      protocolVersion: REALTIME_PROTOCOL_VERSION,
      roomId: this.#roomId,
      sequence: ++this.#realtimeSendSequence,
      type: "realtime_input",
      roundSequence: options.roundSequence,
      inputSequence: options.inputSequence,
      targetTick: options.targetTick,
      delivery: options.delivery,
      clientSendTime: options.clientSendTime,
      payload,
    });
    await this.#transport.sendRealtime(message);
  }

  async sendRealtimeSnapshot(
    state: unknown,
    options: {
      authorityEpoch: number;
      roundSequence: number;
      simulationTick: number;
      hostSnapshotSequence: number;
      hostSendTime: number;
      processedInputCursors: Record<string, number>;
    },
  ): Promise<void> {
    if (!this.#roomId) throw new Error("join a room before publishing a realtime snapshot");
    if (!this.#transport.sendRealtime) throw new Error("realtime rooms are unsupported by this transport");
    const message = RealtimeClientEnvelopeSchema.parse({
      protocolVersion: REALTIME_PROTOCOL_VERSION,
      roomId: this.#roomId,
      sequence: ++this.#realtimeSendSequence,
      type: "realtime_snapshot",
      authorityEpoch: options.authorityEpoch,
      roundSequence: options.roundSequence,
      simulationTick: options.simulationTick,
      hostSnapshotSequence: options.hostSnapshotSequence,
      hostSendTime: options.hostSendTime,
      processedInputCursors: options.processedInputCursors,
      state,
    });
    await this.#transport.sendRealtime(message);
  }

  async sendRealtimeEffect(
    payload: unknown,
    options: {
      authorityEpoch: number;
      roundSequence: number;
      simulationTick: number;
    },
  ): Promise<void> {
    if (!this.#roomId) throw new Error("join a room before sending a realtime effect");
    if (!this.#transport.sendRealtime) throw new Error("realtime rooms are unsupported by this transport");
    const message = RealtimeClientEnvelopeSchema.parse({
      protocolVersion: REALTIME_PROTOCOL_VERSION,
      roomId: this.#roomId,
      sequence: ++this.#realtimeSendSequence,
      type: "realtime_effect",
      authorityEpoch: options.authorityEpoch,
      roundSequence: options.roundSequence,
      simulationTick: options.simulationTick,
      payload,
    });
    await this.#transport.sendRealtime(message);
  }

  async sendRealtimeGuestReport(
    report: {
      roundSequence: number;
      effectiveSnapshotHz?: number;
      arrivalJitterMs?: number;
      sequenceGaps: number;
      extrapolatedFrameRatio: number;
      latestAuthoritativeTick?: number;
    },
  ): Promise<void> {
    if (!this.#roomId) throw new Error("join a room before sending a realtime guest report");
    if (!this.#transport.sendRealtime) throw new Error("realtime rooms are unsupported by this transport");
    const message = RealtimeClientEnvelopeSchema.parse({
      protocolVersion: REALTIME_PROTOCOL_VERSION,
      roomId: this.#roomId,
      sequence: ++this.#realtimeSendSequence,
      type: "realtime_guest_report",
      roundSequence: report.roundSequence,
      effectiveSnapshotHz: report.effectiveSnapshotHz,
      arrivalJitterMs: report.arrivalJitterMs,
      sequenceGaps: report.sequenceGaps,
      extrapolatedFrameRatio: report.extrapolatedFrameRatio,
      latestAuthoritativeTick: report.latestAuthoritativeTick,
    });
    await this.#transport.sendRealtime(message);
  }

  async requestRealtimeSync(): Promise<void> {
    if (!this.#roomId) throw new Error("join a room before requesting realtime sync");
    if (!this.#transport.sendRealtime) throw new Error("realtime rooms are unsupported by this transport");
    const message = RealtimeClientEnvelopeSchema.parse({
      protocolVersion: REALTIME_PROTOCOL_VERSION,
      roomId: this.#roomId,
      sequence: ++this.#realtimeSendSequence,
      type: "realtime_sync_request",
    });
    await this.#transport.sendRealtime(message);
  }

  async #sendRoomMessage(
    body:
      | { type: "snapshot_request" }
      | { type: "chat"; channel: "lobby" | "match"; text: string }
      | {
          type: "score_submit";
          leaderboardId: string;
          score: number;
          subscore: number;
          displayName?: string;
        },
  ): Promise<void> {
    if (!this.#roomId) throw new Error("join a room before sending messages");
    const message = ClientEnvelopeSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      roomId: this.#roomId,
      sequence: ++this.#sendSequence,
      ...body,
    });
    await this.#transport.send(message);
  }

  async close(): Promise<void> {
    this.#lifecycleGeneration += 1;
    this.#leaveFailed = false;
    this.#roomId = undefined;
    this.#inviteCode = "";
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    this.#unsubscribeConnection?.();
    this.#unsubscribeConnection = undefined;
    this.#listeners.clear();
    this.#realtimeListeners.clear();
    this.#connectionListeners.clear();
    await this.#transport.close();
  }
}

/** Shape of the `loki_turn_credentials` RPC result. An old Nakama module without this RPC, or a deployment with no TURN secret configured, both resolve to no `urls`/`username`/`credential`. */
export interface TurnCredentialsResult {
  urls?: string[];
  username?: string;
  credential?: string;
  ttlSeconds?: number;
}

/**
 * Pure, exported for testing: merges the base ICE servers (caller-supplied,
 * or Loki's default STUN set when omitted) with any short-lived TURN
 * entries. TURN is additive ICE candidate configuration, never a separate
 * transport; the caller still falls back to the WebSocket whenever every
 * ICE path fails.
 */
export function mergeIceServers(
  base: IceServerConfig[] | undefined,
  turnServers: IceServerConfig[],
): IceServerConfig[] {
  const resolvedBase = base ?? DEFAULT_STUN_SERVERS;
  return turnServers.length ? [...resolvedBase, ...turnServers] : resolvedBase;
}

/**
 * Pure, exported for testing: turns a `loki_turn_credentials` RPC result
 * into zero or one ICE server entries, plus the wall-clock time after which
 * the caller should refetch. Refreshing a little before the credential's
 * actual TTL (rather than exactly at it) means a credential fetched near
 * the end of one reconnect window is never presented as still valid for
 * the next one.
 */
export function parseTurnCredentials(
  result: TurnCredentialsResult,
  nowMs: number = Date.now(),
): { servers: IceServerConfig[]; expiresAtMs: number } {
  const servers: IceServerConfig[] =
    result.urls?.length && result.username && result.credential
      ? [{ urls: result.urls, username: result.username, credential: result.credential }]
      : [];
  const ttlSeconds = typeof result.ttlSeconds === "number" ? result.ttlSeconds : 0;
  return { servers, expiresAtMs: nowMs + Math.max(0, ttlSeconds - 30) * 1_000 };
}

/** Pure, exported for testing: whether a previously fetched TURN credential is old enough that FirstPartyTransport should refetch before the next reconnect. */
export function turnCredentialsStale(expiresAtMs: number, nowMs: number = Date.now()): boolean {
  return nowMs >= expiresAtMs;
}

/**
 * Pure, exported for testing: whether a room's runtime allows the SDK to
 * attempt WebRTC host-star negotiation at all, based on the snapshot's
 * `capabilities.realtime_webrtc`. Missing/older-runtime snapshots (no
 * capabilities block, or the flag simply absent) default to true so
 * nothing changes for existing host-authority deployments; only an
 * explicit `false` (as loki.js now sends for `authority: "server"` rooms,
 * which have no player host to negotiate a star with) disables it.
 */
export function webrtcAllowedFrom(snapshot: ServerEnvelope): boolean {
  if (snapshot.type !== "snapshot") return true;
  return snapshot.capabilities?.realtime_webrtc !== false;
}

export interface FirstPartyTransportOptions {
  apiOrigin?: string;
  nakamaHost?: string;
  nakamaPort?: string;
  nakamaServerKey?: string;
  secure?: boolean;
  fetch?: typeof globalThis.fetch;
  lifecycle?: PageLifecycle;
  sessionProvider?(token: string): Promise<{
    token: string;
    refreshToken?: string;
    playerId: string;
  }>;
  /** Overrides WebRTC peer-connection creation; defaults to the browser global when available. Pass a fake factory in tests, or `undefined`/omit in Node to keep WebRTC disabled (all realtime traffic then always uses the WebSocket). */
  createPeerConnection?: PeerConnectionFactory;
  /** Base ICE servers for the host-star data channel, merged with any short-lived TURN credentials fetched from `loki_turn_credentials`. Defaults to Loki's public STUN configuration. */
  iceServers?: IceServerConfig[];
}

export class FirstPartyTransport implements LokiTransport {
  readonly #apiOrigin: string;
  readonly #client: Client;
  readonly #secure: boolean;
  readonly #fetch: typeof globalThis.fetch;
  readonly #sessionProvider?: FirstPartyTransportOptions["sessionProvider"];
  readonly #listeners = new Set<(message: unknown) => void>();
  #session?: Session;
  #socket?: Socket;
  #playerId?: string;
  #roomId?: string;
  #roomKey?: string;
  #closed = false;
  #connectionListeners = new Set<(event: ConnectionEvent) => void>();
  #ignoreDisconnect = false;
  #reconnectPromise?: Promise<void>;
  #scheduler: ReconnectScheduler;
  #foreground: ForegroundController;
  #unsubscribeLifecycle?: () => void;
  // The metadata used on the most recent successful joinMatch, remembered
  // so a bare reconnect (which passes no metadata of its own) can rejoin
  // with the same realtime/webrtc capability instead of silently losing it.
  #lastJoinMetadata?: Record<string, string>;
  // Whether the current room's runtime advertised realtime_webrtc on its
  // last snapshot. Host-authority rooms advertise this normally; a
  // server-authority room has no player host to negotiate a star with, so
  // its runtime omits/falsifies this capability and the SDK must never
  // attempt WebRTC there even if webrtcCapable metadata was sent. Also
  // remembered across a bare reconnect, same as #lastJoinMetadata.
  #webrtcAllowed = true;
  #star?: WebrtcStar;
  #createPeerConnection?: PeerConnectionFactory;
  #iceServers?: IceServerConfig[];
  #signalSendSequence = 0;
  // Short-lived TURN credentials from `loki_turn_credentials`, merged with
  // #iceServers (or DEFAULT_STUN_SERVERS) for every peer connection. Empty
  // whenever the server has no TURN secret configured or the RPC fails, so
  // WebRTC stays STUN-only exactly like before this existed.
  #turnServers: IceServerConfig[] = [];
  #turnExpiresAtMs = 0;

  constructor(options: FirstPartyTransportOptions = {}) {
    this.#apiOrigin = (options.apiOrigin ?? LOKI_API_ORIGIN).replace(/\/+$/, "");
    this.#secure = options.secure ?? true;
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.#sessionProvider = options.sessionProvider;
    const lifecycle = options.lifecycle ?? createBrowserPageLifecycle();
    this.#scheduler = new ReconnectScheduler({
      canRun: () => {
        if (this.#closed || !this.#session) return false;
        const state = lifecycle?.getState();
        return !state || (state.visible && state.online);
      },
      reconnect: () => this.reconnect(),
    });
    this.#foreground = new ForegroundController({
      isActive: () => Boolean(this.#roomId) && !this.#closed,
      environment: () => lifecycle?.getState(),
      onEvent: (event) => notifyListeners(this.#connectionListeners, event),
      replaceConnection: () => this.reconnect(),
      scheduleRetry: () => this.#scheduler.request(),
    });
    this.#unsubscribeLifecycle = lifecycle?.subscribe((cause) => {
      this.#foreground.notify(cause);
      this.#scheduler.notifyEnvironmentChanged();
    });
    this.#client = new Client(
      options.nakamaServerKey ?? "lokiplay",
      options.nakamaHost ?? "multiplayer.lokiplay.cc",
      options.nakamaPort ?? (this.#secure ? "443" : "7350"),
      this.#secure,
      10_000,
      false,
    );
    this.#createPeerConnection =
      options.createPeerConnection ?? defaultPeerConnectionFactory();
    this.#iceServers = options.iceServers;
  }

  // Builds the joinMatch metadata for a fresh join. webrtcCapable is only
  // ever true when the caller also asked for realtimeCapable and this
  // environment can actually construct a peer connection; a client that
  // cannot attempt WebRTC never advertises the capability, so Nakama's
  // relay/rate limiting simply never targets it.
  #joinMetadata(realtimeCapable?: boolean): Record<string, string> | undefined {
    if (!realtimeCapable) return undefined;
    const metadata: Record<string, string> = { realtimeCapable: "true" };
    if (this.#createPeerConnection) metadata.webrtcCapable = "true";
    return metadata;
  }

  // webrtcAllowed reflects the room's own runtime.capabilities.realtime_webrtc
  // (defaulting to true for callers, e.g. #close, that are just tearing
  // down and never intend to arm a star anyway); a server-authority room's
  // false here means the star is never created regardless of metadata.
  #armWebrtc(metadata: Record<string, string> | undefined, webrtcAllowed = true): void {
    this.#lastJoinMetadata = metadata;
    this.#webrtcAllowed = webrtcAllowed;
    this.#star?.closeAll();
    this.#star = undefined;
    if (!webrtcAllowed || !metadata?.webrtcCapable || !this.#playerId) return;
    this.#star = new WebrtcStar({
      playerId: this.#playerId,
      createPeerConnection: this.#createPeerConnection,
      iceServers: this.#effectiveIceServers(),
      sendSignal: (signal) => this.#sendSignal(signal),
      onMessage: (fromId, data) => this.#handleStarMessage(fromId, data),
    });
  }

  // The base STUN configuration (caller-supplied or Loki's default) plus
  // any short-lived TURN entry fetched from loki_turn_credentials. TURN is
  // just another ICE candidate source here, never a separate transport
  // mode; a peer still falls back to the WebSocket if every ICE path fails.
  #effectiveIceServers(): IceServerConfig[] {
    return mergeIceServers(this.#iceServers, this.#turnServers);
  }

  // Fetches short-lived TURN credentials for this session. Missing secret
  // (STUN-only deployment), an RPC error, or an old Nakama module without
  // this RPC all resolve to "no TURN servers" rather than throwing, since
  // TURN is additive and WebRTC must keep working without it.
  async #refreshTurnCredentials(): Promise<void> {
    if (!this.#session) return;
    try {
      const result = payload<TurnCredentialsResult>(
        await wrapLokiCall(() =>
          this.#client.rpc(this.#session!, "loki_turn_credentials", {}),
        ),
      );
      const parsed = parseTurnCredentials(result);
      this.#turnServers = parsed.servers;
      this.#turnExpiresAtMs = parsed.expiresAtMs;
    } catch {
      this.#turnServers = [];
      this.#turnExpiresAtMs = 0;
    }
  }

  #sendSignal(message: WebrtcSignalOutbound): void {
    if (!this.#socket || !this.#roomId) return;
    const opCode =
      message.type === "webrtc_offer"
        ? REALTIME_SIGNAL_OPCODES.offer
        : message.type === "webrtc_answer"
          ? REALTIME_SIGNAL_OPCODES.answer
          : REALTIME_SIGNAL_OPCODES.ice;
    const envelope = {
      protocolVersion: REALTIME_PROTOCOL_VERSION,
      roomId: this.#roomId,
      sequence: ++this.#signalSendSequence,
      // Signaling delivery does not depend on the current authority epoch;
      // stale peers are torn down directly via WebrtcStar#setHostId
      // whenever LokiClient learns of a new host.
      authorityEpoch: 0,
      ...message,
    };
    const roomId = this.#roomId;
    void this.#socket.sendMatchState(roomId, opCode, encodeMatchStateBytes(envelope));
  }

  // A data-channel frame is handed to the same generic listener pipeline
  // as a WebSocket message so LokiClient's existing parse/dedupe/dispatch
  // logic treats both delivery paths identically.
  #handleStarMessage(_fromId: string, data: unknown): void {
    notifyListeners(this.#listeners, data);
  }

  // Additive diagnostics only; never used to decide routing (see
  // #trySendOverStar), so a caller polling this cannot affect delivery.
  // This transport does not track total room membership, so "webrtc" (every
  // peer on a data channel) is never reported; "mixed" covers any partial
  // coverage, which is the conservative, always-accurate choice here.
  getTransportDiagnostics(): TransportDiagnostics {
    const connectedPeers = this.#star?.connectedPeerCount ?? 0;
    return {
      mode: connectedPeers > 0 ? "mixed" : "websocket",
      connectedPeers,
      webrtcSupported: Boolean(this.#createPeerConnection),
    };
  }

  async authenticate(token: string): Promise<{ playerId: string }> {
    const value = this.#sessionProvider
      ? await this.#sessionProvider(token)
      : await wrapLokiCall(async () => {
          const response = await this.#fetch(`${this.#apiOrigin}/v1/nakama-session`, {
            method: "POST",
            headers: { authorization: `Bearer ${token}` },
          });
          if (!response.ok) {
            throw await lokiErrorFromUnknown(response);
          }
          return (await response.json()) as {
            token: string;
            refreshToken?: string;
            playerId: string;
          };
        });
    const checked = value as {
      token?: string;
      refreshToken?: string;
      playerId?: string;
    };
    if (!checked.token || !checked.playerId) throw new Error("invalid Loki session response");
    this.#session = Session.restore(checked.token, checked.refreshToken ?? "");
    this.#playerId = checked.playerId;
    // Only worth fetching when this environment can attempt WebRTC at all;
    // #refreshTurnCredentials never throws, so a stale/missing RPC cannot
    // fail authentication.
    if (this.#createPeerConnection) await this.#refreshTurnCredentials();
    await this.#connectSocket();
    return { playerId: checked.playerId };
  }

  async createRoom(input: {
    projectId: string;
    realtimeCapable?: boolean;
    visibility?: CreateRoomOptions["visibility"];
    modeLabel?: string;
  }): Promise<JoinedRoom> {
    const session = this.#requireSession();
    const socket = await this.#connectSocket();
    const created = payload<{
      matchId: string;
      inviteCode: string;
      roomKey: string;
    }>(
      await wrapLokiCall(() =>
        this.#client.rpc(session, "loki_create_room", {
          visibility: input.visibility,
          modeLabel: input.modeLabel,
        }),
      ),
    );
    if (!created.matchId || !created.inviteCode) {
      throw new Error("Loki did not return a room invite");
    }
    const metadata = this.#joinMetadata(input.realtimeCapable);
    try {
      const snapshot = await this.#snapshot(created.matchId);
      if (input.visibility === "public") this.#requirePublicRoomBrowser(snapshot);
      this.#roomId = created.matchId;
      this.#foreground.notify();
      this.#roomKey = created.roomKey;
      this.#armWebrtc(metadata, webrtcAllowedFrom(snapshot));
      if (snapshot.type === "snapshot") this.#star?.setHostId(snapshot.hostId);
      return {
        roomId: created.matchId,
        inviteCode: created.inviteCode,
        snapshot,
      };
    } catch (error) {
      await socket.leaveMatch(created.matchId).catch(() => undefined);
      if (this.#roomId === created.matchId) {
        this.#roomId = undefined;
        this.#roomKey = undefined;
        this.#armWebrtc(undefined);
      }
      throw error;
    }
  }

  async joinRoom(input: {
    projectId: string;
    inviteCode: string;
    realtimeCapable?: boolean;
  }): Promise<JoinedRoom> {
    const session = this.#requireSession();
    const socket = await this.#connectSocket();
    const inviteCode = requireInviteCode(input.inviteCode);
    const joined = payload<{
      matchId: string;
      inviteCode?: string;
    }>(
      await wrapLokiCall(() =>
        this.#client.rpc(session, "loki_join_room", { inviteCode }),
      ),
    );
    const metadata = this.#joinMetadata(input.realtimeCapable);
    await socket.joinMatch(joined.matchId, undefined, metadata);
    try {
      const snapshot = await this.#snapshot(joined.matchId);
      this.#foreground.notify();
      this.#roomId = joined.matchId;
      this.#armWebrtc(metadata, webrtcAllowedFrom(snapshot));
      if (snapshot.type === "snapshot") this.#star?.setHostId(snapshot.hostId);
      return {
        roomId: joined.matchId,
        inviteCode: joined.inviteCode ?? inviteCode,
        snapshot,
      };
    } catch (error) {
      await socket.leaveMatch(joined.matchId).catch(() => undefined);
      if (this.#roomId === joined.matchId) {
        this.#roomId = undefined;
        this.#armWebrtc(undefined);
      }
      throw error;
    }
  }

  async listPublicRooms(input: { limit?: number } = {}): Promise<ListPublicRoomsResult> {
    const parsed = ListPublicRoomsInputSchema.parse({
      limit: input.limit ?? 50,
    });
    return ListPublicRoomsResultSchema.parse(
      payload<ListPublicRoomsResult>(
        await wrapLokiCall(() =>
          this.#client.rpc(this.#requireSession(), "loki_list_public_rooms", parsed),
        ),
      ),
    );
  }

  async joinPublicRoom(input: {
    projectId: string;
    roomId: string;
    realtimeCapable?: boolean;
  }): Promise<JoinedRoom> {
    const session = this.#requireSession();
    const socket = await this.#connectSocket();
    const parsed = JoinPublicRoomInputSchema.parse({ roomId: input.roomId });
    const joined = payload<{ matchId: string }>(
      await wrapLokiCall(() =>
        this.#client.rpc(session, "loki_join_public_room", parsed),
      ),
    );
    if (!joined.matchId) throw new Error("Loki did not return a room");
    const metadata = this.#joinMetadata(input.realtimeCapable);
    await socket.joinMatch(joined.matchId, undefined, metadata);
    try {
      const snapshot = await this.#snapshot(joined.matchId);
      this.#requirePublicRoomBrowser(snapshot);
      this.#foreground.notify();
      this.#roomId = joined.matchId;
      this.#armWebrtc(metadata, webrtcAllowedFrom(snapshot));
      if (snapshot.type === "snapshot") this.#star?.setHostId(snapshot.hostId);
      return {
        roomId: joined.matchId,
        inviteCode: "",
        snapshot,
      };
    } catch (error) {
      await socket.leaveMatch(joined.matchId).catch(() => undefined);
      if (this.#roomId === joined.matchId) {
        this.#roomId = undefined;
        this.#armWebrtc(undefined);
      }
      throw error;
    }
  }

  #requirePublicRoomBrowser(snapshot: ServerEnvelope): void {
    if (snapshot.type !== "snapshot" || snapshot.capabilities?.public_room_browser !== true) {
      throw new Error("runtime does not advertise public_room_browser");
    }
  }

  async listLeaderboard(input: LeaderboardListInput): Promise<LeaderboardListResult> {
    return LeaderboardListResultSchema.parse(
      payload<LeaderboardListResult>(
        await wrapLokiCall(() =>
          this.#client.rpc(this.#requireSession(), "loki_leaderboard_list", input),
        ),
      ),
    );
  }

  async submitLeaderboardScore(input: {
    leaderboardId: string;
    score: number;
    subscore?: number;
    displayName?: string;
  }): Promise<LeaderboardRecord> {
    const result = payload<{ leaderboardId: string; record: LeaderboardRecord }>(
      await wrapLokiCall(() =>
        this.#client.rpc(this.#requireSession(), "loki_leaderboard_submit", input),
      ),
    );
    return LeaderboardSubmitResultSchema.parse({ record: result.record }).record;
  }

  async resolveInvite(inviteCode: string): Promise<{ roomId: string; inviteCode: string }> {
    const normalized = requireInviteCode(inviteCode);
    const resolved = payload<{ matchId: string; inviteCode?: string }>(
      await wrapLokiCall(() =>
        this.#client.rpc(this.#requireSession(), "loki_resolve_invite", {
          inviteCode: normalized,
        }),
      ),
    );
    if (!resolved.matchId) throw new Error("Loki did not return a room");
    return {
      roomId: resolved.matchId,
      inviteCode: resolved.inviteCode ?? normalized,
    };
  }

  async matchmake(
    input: { minPlayers: number; maxPlayers: number; teamSize?: number; realtimeCapable?: boolean },
    options?: { signal?: AbortSignal },
  ): Promise<JoinedRoom> {
    options?.signal?.throwIfAborted();
    const socket = await this.#connectSocket();
    const added = await socket.addMatchmaker("*", input.minPlayers, input.maxPlayers, undefined, {
      teamSize: input.teamSize ?? 0,
    });
    let ticket: string | undefined = added.ticket;
    // Removes the ticket from Nakama's matchmaker on any exit path other
    // than a completed match, so an abandoned search (timeout, cancel, or
    // leaving before a match forms) never leaves a stale ticket behind.
    // Once a match has actually formed, the ticket is already consumed
    // server-side and this becomes a harmless no-op.
    const removeTicket = async (): Promise<void> => {
      if (!ticket) return;
      const value = ticket;
      ticket = undefined;
      await socket.removeMatchmaker(value).catch(() => undefined);
    };
    let onAbort: (() => void) | undefined;
    try {
      const matched = await new Promise<{ match_id?: string; token?: string }>(
        (resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("matchmaking timed out")), 30_000);
          const settle = (fn: () => void) => {
            clearTimeout(timer);
            if (onAbort) options?.signal?.removeEventListener("abort", onAbort);
            fn();
          };
          socket.onmatchmakermatched = (value) => settle(() => resolve(value));
          onAbort = () =>
            settle(() => reject(new DOMException("matchmaking cancelled", "AbortError")));
          if (options?.signal) options.signal.addEventListener("abort", onAbort);
        },
      );
      ticket = undefined;
      const metadata = this.#joinMetadata(input.realtimeCapable);
      const joined = await socket.joinMatch(matched.match_id, matched.token, metadata);
      try {
        const snapshot = await this.#snapshot(joined.match_id);
        this.#roomId = joined.match_id;
        this.#foreground.notify();
        this.#roomKey = `match-${joined.match_id.slice(0, 12).toLowerCase()}`;
        this.#armWebrtc(metadata, webrtcAllowedFrom(snapshot));
        if (snapshot.type === "snapshot") this.#star?.setHostId(snapshot.hostId);
        return {
          roomId: joined.match_id,
          inviteCode: "",
          snapshot,
        };
      } catch (error) {
        await socket.leaveMatch(joined.match_id).catch(() => undefined);
        if (this.#roomId === joined.match_id) {
          this.#roomId = undefined;
          this.#roomKey = undefined;
          this.#armWebrtc(undefined);
        }
        throw error;
      }
    } catch (error) {
      await removeTicket();
      throw error;
    }
  }

  async send(message: ClientEnvelope): Promise<void> {
    const socket = await this.#connectSocket();
    const opCode =
      message.type === "action"
        ? 10
        : message.type === "event"
          ? 11
          : message.type === "host_state"
            ? 12
            : message.type === "action_reject"
              ? 16
            : message.type === "snapshot_request"
              ? 13
              : message.type === "chat"
                ? 14
                : 15;
    await socket.sendMatchState(
      message.roomId,
      opCode,
      encodeMatchStateBytes(message),
    );
  }

  async sendRealtime(message: RealtimeClientEnvelope): Promise<void> {
    // Snapshots are always dual-delivered (WebSocket for persistence/host
    // ACK, data channel as a faster additive copy); a guest's latest-wins
    // input and its periodic guest report may go over the data channel
    // exclusively when connected. Ordered inputs, sync/recovery requests,
    // and effects always stay on the WebSocket, matching the star's own
    // routing contract (see #trySendOverStar).
    if (message.type === "realtime_snapshot") this.#star?.broadcastAsHost(message);
    if (this.#trySendOverStar(message)) return;
    const socket = await this.#connectSocket();
    const opCode =
      message.type === "realtime_input"
        ? REALTIME_OPCODES.input
        : message.type === "realtime_snapshot"
          ? REALTIME_OPCODES.snapshot
          : message.type === "realtime_effect"
            ? REALTIME_OPCODES.effect
            : message.type === "realtime_guest_report"
              ? REALTIME_OPCODES.guestReport
              : REALTIME_OPCODES.sync;
    await socket.sendMatchState(
      message.roomId,
      opCode,
      encodeMatchStateBytes(message),
    );
  }

  // Latest-wins inputs and guest reports may be delivered exclusively over
  // the data channel when the star has an open connection to the host;
  // returning false here always falls back to the (always-available)
  // WebSocket path, which is also the only path for ordered inputs,
  // sync/recovery, and effects.
  #trySendOverStar(message: RealtimeClientEnvelope): boolean {
    if (!this.#star) return false;
    if (message.type === "realtime_input" && message.delivery === "latest") {
      return this.#star.sendToHost(message);
    }
    if (message.type === "realtime_guest_report") {
      return this.#star.sendToHost(message);
    }
    return false;
  }

  subscribe(listener: (message: unknown) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  subscribeConnection(listener: (event: ConnectionEvent) => void): () => void {
    this.#connectionListeners.add(listener);
    return () => this.#connectionListeners.delete(listener);
  }

  async leaveRoom(roomId: string): Promise<void> {
    if (!this.#session) throw new Error("authenticate first");
    const result = payload<unknown>(
      await wrapLokiCall(() =>
        this.#client.rpc(this.#session!, "loki_leave_room", { matchId: roomId }),
      ),
    );
    requireLeaveRoomSuccess(result);
    try {
      await this.#socket?.leaveMatch(roomId);
    } catch {
      // Server already confirmed leave; local socket cleanup must not reverse it.
    }
    if (this.#roomId === roomId) {
      this.#roomId = undefined;
      this.#roomKey = undefined;
      this.#armWebrtc(undefined);
    }
  }

  async refresh(): Promise<void> {
    this.#session = await this.#client.sessionRefresh(this.#requireSession());
  }

  async reconnect(): Promise<void> {
    if (this.#closed) throw new Error("transport is closed");
    if (this.#reconnectPromise) return this.#reconnectPromise;
    this.#reconnectPromise = this.#reconnectOnce()
      .then(() => {
        this.#scheduler.reset();
        notifyListeners(this.#connectionListeners, "connected");
      })
      .catch((error) => {
        notifyListeners(this.#connectionListeners, "reconnect_failed");
        throw error;
      })
      .finally(() => {
        this.#reconnectPromise = undefined;
      });
    return this.#reconnectPromise;
  }

  async #reconnectOnce(): Promise<void> {
    this.#ignoreDisconnect = true;
    const previous = this.#socket;
    this.#socket = undefined;
    try {
      previous?.disconnect(false);
      if (this.#session?.isexpired(Math.floor(Date.now() / 1_000))) await this.refresh();
      if (this.#createPeerConnection && turnCredentialsStale(this.#turnExpiresAtMs)) {
        await this.#refreshTurnCredentials();
      }
      const socket = await this.#connectSocket();
      this.#armWebrtc(this.#lastJoinMetadata, this.#webrtcAllowed);
      // Reuse the realtime/webrtc capability metadata from the original
      // join. Nakama's own join handler also tolerates missing metadata
      // by preserving the session's prior capability, but passing it
      // here keeps the two systems in agreement and avoids relying on
      // that fallback for the common case.
      if (this.#roomId) await socket.joinMatch(this.#roomId, undefined, this.#lastJoinMetadata);
    } finally {
      this.#ignoreDisconnect = false;
    }
  }

  async close(): Promise<void> {
    this.#closed = true;
    this.#scheduler.dispose();
    this.#unsubscribeLifecycle?.();
    this.#unsubscribeLifecycle = undefined;
    this.#socket?.disconnect(false);
    this.#socket = undefined;
    this.#armWebrtc(undefined);
    this.#listeners.clear();
    this.#connectionListeners.clear();
  }

  async #connectSocket(): Promise<Socket> {
    if (this.#closed) throw new Error("transport is closed");
    if (this.#socket) return this.#socket;
    const socket = this.#client.createSocket(this.#secure, false);
    socket.onmatchdata = (message) => {
      if (message.match_id !== this.#roomId) return;
      try {
        const decoded = JSON.parse(textDecoder.decode(message.data)) as unknown;
        const record = decoded as { hostId?: unknown };
        if (typeof record?.hostId === "string") this.#star?.setHostId(record.hostId);
        if (
          message.op_code === REALTIME_SIGNAL_OPCODES.offer ||
          message.op_code === REALTIME_SIGNAL_OPCODES.answer ||
          message.op_code === REALTIME_SIGNAL_OPCODES.ice
        ) {
          this.#star?.handleSignal(decoded as WebrtcSignalInbound);
          return;
        }
        notifyListeners(this.#listeners, decoded);
      } catch {
        // Invalid server data is ignored and cannot reach game listeners.
      }
    };
    socket.ondisconnect = () => {
      if (this.#socket !== socket) return;
      this.#socket = undefined;
      if (this.#ignoreDisconnect) return;
      notifyListeners(this.#connectionListeners, "disconnected");
      if (this.#closed) return;
      this.#scheduler.request();
    };
    await socket.connect(this.#requireSession(), true);
    this.#socket = socket;
    return socket;
  }

  async #snapshot(roomId: string): Promise<ServerEnvelope> {
    const state = payload<{
      ok: boolean;
      hostId: string;
      version: number;
      stateVersion?: number;
      state: unknown;
      capabilities?: unknown;
    }>(
      await wrapLokiCall(() =>
        this.#client.rpc(this.#requireSession(), "loki_room_snapshot", {
          matchId: roomId,
        }),
      ),
    );
    if (!state.ok) throw new Error("room snapshot failed");
    return ServerEnvelopeSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      roomId,
      sequence: state.version,
      type: "snapshot",
      hostId: state.hostId,
      state: state.state,
      stateVersion: state.stateVersion ?? state.version,
      capabilities: state.capabilities,
    });
  }

  #requireSession(): Session {
    if (!this.#session || !this.#playerId) throw new Error("authenticate first");
    return this.#session;
  }
}

export function hostedGameSessionProvider(
  port: MessagePort,
  nonce: string,
  timeoutMs = 10_000,
): FirstPartyTransportOptions["sessionProvider"] {
  return async () => {
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        port.removeEventListener("message", onMessage);
        reject(new Error("hosted-game session bridge timed out"));
      }, timeoutMs);
      const onMessage = (event: MessageEvent): void => {
        const value = event.data as {
          type?: string;
          nonce?: string;
          requestId?: string;
          session?: {
            token?: string;
            refreshToken?: string;
            playerId?: string;
          };
          message?: string;
        };
        if (value.nonce !== nonce || value.requestId !== requestId) return;
        clearTimeout(timer);
        port.removeEventListener("message", onMessage);
        if (
          value.type !== "loki:session" ||
          !value.session?.token ||
          !value.session.playerId
        ) {
          reject(new Error(value.message ?? "hosted-game session bridge failed"));
          return;
        }
        resolve({
          token: value.session.token,
          refreshToken: value.session.refreshToken,
          playerId: value.session.playerId,
        });
      };
      port.addEventListener("message", onMessage);
      port.start();
      port.postMessage({ type: "loki:session", nonce, requestId });
    });
  };
}

export type CreateHostedLokiClientOptions = {
  projectId: string;
  /**
   * How long to wait for the hosted shell's `loki:init` handshake before
   * giving up (or falling back to `fallbackTransport`). The shell's own
   * "Connecting…" timeout is ~15s from iframe load; this defaults well
   * under that so a fallback (or a clear error) can still resolve in time.
   */
  timeoutMs?: number;
  /**
   * Used only if no `loki:init` handshake arrives within `timeoutMs` (e.g.
   * running the game directly outside the Loki hosted shell, such as a
   * local dev server). Without this, a missing handshake throws instead
   * of silently hanging.
   */
  fallbackTransport?: LokiTransport;
  /** For tests or non-DOM environments; defaults to the global `window`. */
  windowRef?: Pick<Window, "addEventListener" | "removeEventListener">;
  /** Overrides how the hosted-path transport is constructed once a `loki:init` handshake is received; mainly for tests. Defaults to `new FirstPartyTransport({ sessionProvider })`. */
  createTransport?: (sessionProvider: FirstPartyTransportOptions["sessionProvider"]) => LokiTransport;
};

/**
 * Owns the entire hosted-shell session handshake so a game does not have
 * to hand-write timing-sensitive `loki:init`/`loki:ready`/`loki:session`
 * bridge code, or accidentally defer authentication until a Create/Join
 * button click (which is what let the shell's own ~15s handshake timeout
 * elapse before the game ever requested a session). Call this once at
 * page boot; the listener for `loki:init` is installed before any other
 * work runs, and the session is requested as soon as the handshake
 * arrives — not deferred to the first `createRoom()`/`joinRoom()` call.
 * Reuse the returned, already-authenticated `LokiClient` for every
 * subsequent Create/Join.
 */
export async function createHostedLokiClient(
  options: CreateHostedLokiClientOptions,
): Promise<LokiClient> {
  const target = options.windowRef ?? (typeof window !== "undefined" ? window : undefined);
  const init = target ? await waitForHostedInit(target, options.timeoutMs ?? 10_000) : undefined;
  if (!init) {
    if (!options.fallbackTransport) {
      throw new Error(
        target
          ? "createHostedLokiClient: no loki:init handshake was received within timeoutMs, and no fallbackTransport was configured for non-hosted environments"
          : "createHostedLokiClient: no browser window is available, and no fallbackTransport was configured for non-hosted environments",
      );
    }
    const client = new LokiClient({ projectId: options.projectId, transport: options.fallbackTransport });
    await client.authenticate("local");
    return client;
  }
  const { port, nonce } = init;
  try {
    // A cosmetic readiness signal the hosted shell's own status UI reacts
    // to; the actual authentication handshake below happens over the same
    // port via hostedGameSessionProvider and does not wait for this.
    port.postMessage({ type: "loki:ready", nonce });
  } catch {
    // Non-fatal.
  }
  const sessionProvider = hostedGameSessionProvider(port, nonce);
  const transport = options.createTransport
    ? options.createTransport(sessionProvider)
    : new FirstPartyTransport({ sessionProvider });
  const client = new LokiClient({ projectId: options.projectId, transport });
  await client.authenticate("hosted");
  return client;
}

function waitForHostedInit(
  target: Pick<Window, "addEventListener" | "removeEventListener">,
  timeoutMs: number,
): Promise<{ port: MessagePort; nonce: string } | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: { port: MessagePort; nonce: string } | undefined): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      target.removeEventListener("message", onMessage as EventListener);
      resolve(result);
    };
    const timer = setTimeout(() => finish(undefined), timeoutMs);
    const onMessage = (event: MessageEvent): void => {
      const data = event.data as { type?: string; nonce?: string } | undefined;
      if (!data || data.type !== "loki:init" || typeof data.nonce !== "string") return;
      const port = (event as MessageEvent & { ports?: MessagePort[] }).ports?.[0];
      // The hosted shell retries loki:init every ~500ms with a fresh port
      // until it sees any reply on one of them; only the first one this
      // client observes is ever used, so later retries are naturally
      // ignored once we've already resolved.
      if (!port) return;
      finish({ port, nonce: data.nonce });
    };
    target.addEventListener("message", onMessage as EventListener);
  });
}
