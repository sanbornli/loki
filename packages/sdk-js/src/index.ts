import {
  ClientEnvelopeSchema,
  ServerEnvelopeSchema,
  PROTOCOL_VERSION,
  type ClientEnvelope,
  type ServerEnvelope,
} from "../../protocol/src/index.js";
import { Client, Session, type Socket } from "@heroiclabs/nakama-js";
import {
  SynchronizedRoom,
  type ConnectionEvent,
  type SynchronizedRoomOptions,
} from "./synchronized-room.js";

export {
  SYNCHRONIZED_ROOM_ACTION_TTL_MS,
  SYNCHRONIZED_ROOM_COMMIT_TIMEOUT_MS,
  SYNCHRONIZED_ROOM_MAX_MESSAGE_BYTES,
  SYNCHRONIZED_ROOM_MAX_PENDING,
  SYNCHRONIZED_ROOM_MAX_RECENT_ACTIONS,
  SYNCHRONIZED_ROOM_MAX_REDUCER_MS,
  SynchronizedRoom,
  SynchronizedRoomError,
} from "./synchronized-room.js";
export type {
  ActionContext,
  CommittedTransition,
  ConnectionEvent,
  ConnectionState,
  RoomMember,
  Schema,
  SynchronizedRoomOutcome,
  SynchronizedRoomSnapshot,
} from "./synchronized-room.js";

export const LOKI_API_ORIGIN = "https://api.lokiplay.cc";

const textDecoder = new TextDecoder();

const payload = <T>(response: { payload?: object }): T => response.payload as T;

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
  createRoom(input: { projectId: string }): Promise<JoinedRoom>;
  joinRoom(input: {
    projectId: string;
    inviteCode: string;
  }): Promise<JoinedRoom>;
  send(message: ClientEnvelope): Promise<void>;
  subscribe(listener: (message: unknown) => void): () => void;
  resolveInvite?(inviteCode: string): Promise<{ roomId: string; inviteCode: string }>;
  matchmake?(input: { minPlayers: number; maxPlayers: number; teamSize?: number }): Promise<JoinedRoom>;
  leaveRoom?(roomId: string): Promise<void>;
  reconnect?(): Promise<void>;
  refresh?(): Promise<void>;
  close(): Promise<void>;
  subscribeConnection?(listener: (event: ConnectionEvent) => void): () => void;
}

export interface LokiClientOptions {
  projectId: string;
  transport: LokiTransport;
}

export class LokiClient {
  readonly #transport: LokiTransport;
  readonly #projectId: string;
  readonly #listeners = new Set<(message: ServerEnvelope) => void>();
  #unsubscribe?: () => void;
  #playerId?: string;
  #roomId?: string;
  #joining = false;
  #joinBuffer: ServerEnvelope[] = [];
  #sendSequence = 0;
  #receiveSequence = 0;
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
        createRoom: () => this.createRoom(),
        joinRoom: (input) => this.joinRoom(input),
        leaveRoom: (roomId) => this.leaveRoom(roomId),
        reconnect: () => this.reconnect(),
        onMessage: (listener) => this.onMessage(listener),
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

  async createRoom(): Promise<JoinedRoom> {
    if (!this.#playerId) throw new Error("authenticate before creating a room");
    return this.#serialize(() =>
      this.#enterRoom(() =>
        this.#transport.createRoom({ projectId: this.#projectId }),
      ),
    );
  }

  async joinRoom(input: { inviteCode: string }): Promise<JoinedRoom> {
    if (!this.#playerId) throw new Error("authenticate before joining a room");
    return this.#serialize(() =>
      this.#enterRoom(() =>
        this.#transport.joinRoom({
          projectId: this.#projectId,
          inviteCode: requireInviteCode(input.inviteCode),
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
      const buffered = this.#joinBuffer;
      this.#joinBuffer = [];
      this.#joining = false;
      for (const message of buffered) this.#dispatch(message);
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

  async submitScore(
    leaderboardId: string,
    score: number,
    subscore = 0,
  ): Promise<void> {
    await this.#sendRoomMessage({
      type: "score_submit",
      leaderboardId,
      score,
      subscore,
    });
  }

  async resolveInvite(inviteCode: string): Promise<{ roomId: string; inviteCode: string }> {
    if (!this.#transport.resolveInvite) throw new Error("invites are unsupported");
    return this.#transport.resolveInvite(requireInviteCode(inviteCode));
  }

  async matchmake(input: {
    minPlayers: number;
    maxPlayers: number;
    teamSize?: number;
  }): Promise<JoinedRoom> {
    if (!this.#playerId) throw new Error("authenticate before matchmaking");
    if (!this.#transport.matchmake) throw new Error("matchmaking is unsupported");
    return this.#serialize(() => this.#enterRoom(() => this.#transport.matchmake!(input)));
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
      if (!this.#roomId) throw new Error("join a room before reconnecting");
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

  async #sendRoomMessage(
    body:
      | { type: "snapshot_request" }
      | { type: "chat"; channel: "lobby" | "match"; text: string }
      | {
          type: "score_submit";
          leaderboardId: string;
          score: number;
          subscore: number;
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
    this.#connectionListeners.clear();
    await this.#transport.close();
  }
}

export interface FirstPartyTransportOptions {
  apiOrigin?: string;
  nakamaHost?: string;
  nakamaPort?: string;
  nakamaServerKey?: string;
  secure?: boolean;
  fetch?: typeof globalThis.fetch;
  sessionProvider?(token: string): Promise<{
    token: string;
    refreshToken?: string;
    playerId: string;
  }>;
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

  constructor(options: FirstPartyTransportOptions = {}) {
    this.#apiOrigin = (options.apiOrigin ?? LOKI_API_ORIGIN).replace(/\/+$/, "");
    this.#secure = options.secure ?? true;
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.#sessionProvider = options.sessionProvider;
    this.#client = new Client(
      options.nakamaServerKey ?? "lokiplay",
      options.nakamaHost ?? "multiplayer.lokiplay.cc",
      options.nakamaPort ?? (this.#secure ? "443" : "7350"),
      this.#secure,
      10_000,
      false,
    );
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
    await this.#connectSocket();
    return { playerId: checked.playerId };
  }

  async createRoom(_input: { projectId: string }): Promise<JoinedRoom> {
    const session = this.#requireSession();
    const socket = await this.#connectSocket();
    const created = payload<{
      matchId: string;
      inviteCode: string;
      roomKey: string;
    }>(
      await wrapLokiCall(() => this.#client.rpc(session, "loki_create_room", {})),
    );
    if (!created.matchId || !created.inviteCode) {
      throw new Error("Loki did not return a room invite");
    }
    await socket.joinMatch(created.matchId);
    try {
      const snapshot = await this.#snapshot(created.matchId);
      this.#roomId = created.matchId;
      this.#roomKey = created.roomKey;
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
      }
      throw error;
    }
  }

  async joinRoom(input: {
    projectId: string;
    inviteCode: string;
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
    if (!joined.matchId) throw new Error("Loki did not return a room");
    await socket.joinMatch(joined.matchId);
    try {
      const snapshot = await this.#snapshot(joined.matchId);
      this.#roomId = joined.matchId;
      return {
        roomId: joined.matchId,
        inviteCode: joined.inviteCode ?? inviteCode,
        snapshot,
      };
    } catch (error) {
      await socket.leaveMatch(joined.matchId).catch(() => undefined);
      if (this.#roomId === joined.matchId) this.#roomId = undefined;
      throw error;
    }
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

  async matchmake(input: {
    minPlayers: number;
    maxPlayers: number;
    teamSize?: number;
  }): Promise<JoinedRoom> {
    const socket = await this.#connectSocket();
    const matched = new Promise<{ match_id?: string; token?: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("matchmaking timed out")), 30_000);
      socket.onmatchmakermatched = (value) => {
        clearTimeout(timer);
        resolve(value);
      };
    });
    await socket.addMatchmaker("*", input.minPlayers, input.maxPlayers, undefined, {
      teamSize: input.teamSize ?? 0,
    });
    const result = await matched;
    const joined = await socket.joinMatch(result.match_id, result.token);
    try {
      const snapshot = await this.#snapshot(joined.match_id);
      this.#roomId = joined.match_id;
      this.#roomKey = `match-${joined.match_id.slice(0, 12).toLowerCase()}`;
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
      }
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
    await socket.sendMatchState(message.roomId, opCode, JSON.stringify(message));
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
    try {
      await this.#socket?.leaveMatch(roomId);
    } finally {
      if (this.#roomId === roomId) {
        this.#roomId = undefined;
        this.#roomKey = undefined;
      }
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
        notifyListeners(this.#connectionListeners, "connected");
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
      const socket = await this.#connectSocket();
      if (this.#roomId) await socket.joinMatch(this.#roomId);
    } finally {
      this.#ignoreDisconnect = false;
    }
  }

  async close(): Promise<void> {
    this.#closed = true;
    this.#socket?.disconnect(false);
    this.#socket = undefined;
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
      if (this.#closed || this.#reconnectPromise) return;
      void this.reconnect().catch(() => {
        notifyListeners(this.#connectionListeners, "reconnect_failed");
      });
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
