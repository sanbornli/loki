import {
  ClientEnvelopeSchema,
  ServerEnvelopeSchema,
  PROTOCOL_VERSION,
  type ClientEnvelope,
  type ServerEnvelope,
} from "../../protocol/src/index.js";
import { Client, Session, type Socket } from "@heroiclabs/nakama-js";

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

const wrapLokiCall = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    throw await lokiErrorFromUnknown(error);
  }
};

const normalizeInviteCode = (value: string): string => value.trim().toUpperCase();

const requireInviteCode = (value: string): string => {
  const inviteCode = normalizeInviteCode(value);
  if (!/^[A-F0-9]{16}$/.test(inviteCode)) {
    throw new Error("INVITE_INVALID: invite codes are 16 letters or digits issued by Loki");
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

  constructor(options: LokiClientOptions) {
    if (!/^[0-9a-f-]{36}$/i.test(options.projectId)) {
      throw new Error("invalid project id");
    }
    this.#projectId = options.projectId;
    this.#transport = options.transport;
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
  }

  async authenticate(token: string): Promise<{ playerId: string }> {
    if (!this.#unsubscribe) this.initialize();
    const session = await this.#transport.authenticate(token);
    this.#playerId = session.playerId;
    return session;
  }

  async createRoom(): Promise<JoinedRoom> {
    if (!this.#playerId) throw new Error("authenticate before creating a room");
    return this.#enterRoom(() =>
      this.#transport.createRoom({ projectId: this.#projectId }),
    );
  }

  async joinRoom(input: { inviteCode: string }): Promise<JoinedRoom> {
    if (!this.#playerId) throw new Error("authenticate before joining a room");
    return this.#enterRoom(() =>
      this.#transport.joinRoom({
        projectId: this.#projectId,
        inviteCode: requireInviteCode(input.inviteCode),
      }),
    );
  }

  async #enterRoom(join: () => Promise<JoinedRoom>): Promise<JoinedRoom> {
    this.#joining = true;
    this.#joinBuffer = [];
    try {
      const joined = await join();
      const snapshot = ServerEnvelopeSchema.parse(joined.snapshot);
      if (snapshot.roomId !== joined.roomId || snapshot.type !== "snapshot") {
        throw new Error("invalid join snapshot");
      }
      this.#roomId = joined.roomId;
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
    for (const listener of this.#listeners) listener(message);
  }

  async sendAction(payload: unknown): Promise<void> {
    if (!this.#roomId) throw new Error("join a room before sending actions");
    const message = ClientEnvelopeSchema.parse({
      protocolVersion: 1,
      roomId: this.#roomId,
      sequence: ++this.#sendSequence,
      type: "action",
      payload,
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

  async sendHostState(expectedVersion: number, state: unknown): Promise<void> {
    if (!this.#roomId) throw new Error("join a room before sending state");
    const message = ClientEnvelopeSchema.parse({
      protocolVersion: 1,
      roomId: this.#roomId,
      sequence: ++this.#sendSequence,
      type: "host_state",
      expectedVersion,
      state,
    });
    await this.#transport.send(message);
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
    return this.#enterRoom(() => this.#transport.matchmake!(input));
  }

  async leaveRoom(): Promise<void> {
    if (!this.#roomId) return;
    await this.#transport.leaveRoom?.(this.#roomId);
    this.#roomId = undefined;
    this.#sendSequence = 0;
    this.#receiveSequence = 0;
  }

  async reconnect(): Promise<void> {
    if (!this.#transport.reconnect) throw new Error("reconnect is unsupported");
    await this.#transport.reconnect();
    await this.requestSnapshot();
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
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    this.#listeners.clear();
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
    this.#roomId = created.matchId;
    this.#roomKey = created.roomKey;
    return {
      roomId: created.matchId,
      inviteCode: created.inviteCode,
      snapshot: await this.#snapshot(created.matchId),
    };
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
    this.#roomId = joined.matchId;
    return {
      roomId: joined.matchId,
      inviteCode: joined.inviteCode ?? inviteCode,
      snapshot: await this.#snapshot(joined.matchId),
    };
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
    this.#roomId = joined.match_id;
    this.#roomKey = `match-${joined.match_id.slice(0, 12).toLowerCase()}`;
    return {
      roomId: joined.match_id,
      inviteCode: "",
      snapshot: await this.#snapshot(joined.match_id),
    };
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

  async leaveRoom(roomId: string): Promise<void> {
    await this.#socket?.leaveMatch(roomId);
    if (this.#roomId === roomId) {
      this.#roomId = undefined;
      this.#roomKey = undefined;
    }
  }

  async refresh(): Promise<void> {
    this.#session = await this.#client.sessionRefresh(this.#requireSession());
  }

  async reconnect(): Promise<void> {
    if (this.#closed) throw new Error("transport is closed");
    this.#socket?.disconnect(false);
    this.#socket = undefined;
    if (this.#session?.isexpired(Math.floor(Date.now() / 1_000))) await this.refresh();
    const socket = await this.#connectSocket();
    if (this.#roomId) await socket.joinMatch(this.#roomId);
  }

  async close(): Promise<void> {
    this.#closed = true;
    this.#socket?.disconnect(false);
    this.#socket = undefined;
    this.#listeners.clear();
  }

  async #connectSocket(): Promise<Socket> {
    if (this.#closed) throw new Error("transport is closed");
    if (this.#socket) return this.#socket;
    const socket = this.#client.createSocket(this.#secure, false);
    socket.onmatchdata = (message) => {
      if (message.match_id !== this.#roomId) return;
      try {
        const decoded = JSON.parse(textDecoder.decode(message.data)) as unknown;
        for (const listener of this.#listeners) listener(decoded);
      } catch {
        // Invalid server data is ignored and cannot reach game listeners.
      }
    };
    socket.ondisconnect = () => {
      if (!this.#closed) void this.reconnect().catch(() => undefined);
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
      state: unknown;
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
