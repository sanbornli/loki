import assert from "node:assert/strict";
import test from "node:test";
import {
  LokiClient,
  SynchronizedRoomError,
  SYNCHRONIZED_ROOM_COMMIT_TIMEOUT_MS,
  type LokiTransport,
  type JoinedRoom,
} from "../packages/sdk-js/src/index.js";
import { callLokiTool } from "../packages/mcp/src/index.js";
import {
  DEFAULT_RUNTIME_CAPABILITIES,
  actionIdentityKey,
  type ClientEnvelope,
  type ServerEnvelope,
} from "../packages/protocol/src/index.js";

type OpaqueState = { n: number };
type OpaqueAction = { d: number };

type RoomRecord = {
  roomId: string;
  projectId: string;
  inviteCode: string;
  hostId: string;
  version: number;
  sequence: number;
  state: unknown;
  members: Map<string, { sessionId: string; joinedAt: number }>;
  recent: Map<
    string,
    {
      status: "delivered" | "committed" | "rejected";
      hostId: string;
      senderId: string;
      actionId: string;
      outcome?: "rejected" | "invalid";
      message?: string;
    }
  >;
  transports: Set<MemoryTransport>;
  messageCount: number;
  messageWindowStartedAt: number;
  messageLimit: number;
  suspended: boolean;
};

const rooms = new Map<string, RoomRecord>();
const roomsByInvite = new Map<string, RoomRecord>();

const nextSequence = (room: RoomRecord): number => {
  const sequence = room.sequence;
  room.sequence += 1;
  return sequence;
};

const envelope = (
  room: RoomRecord,
  fields: { type: ServerEnvelope["type"] } & Record<string, unknown>,
): ServerEnvelope =>
  ({
    protocolVersion: 1,
    roomId: room.roomId,
    sequence: nextSequence(room),
    ...fields,
  }) as ServerEnvelope;

class MemoryTransport implements LokiTransport {
  #playerId?: string;
  #projectId?: string;
  #room?: RoomRecord;
  #listeners = new Set<(message: unknown) => void>();
  #connection = new Set<(event: "disconnected" | "connected" | "reconnect_failed") => void>();
  #closed = false;
  #paused = false;
  #held: ServerEnvelope[] = [];
  #staleOnce = false;
  #suppressStateEcho = false;
  #failSnapshot = false;
  #failRejection = false;
  #failCreate = false;
  #failLeave = false;
  #failJoinSnapshot = false;
  #omitCapabilities = false;
  #failReconnect = false;
  #staleSnapshotOnce = false;
  #enterHold?: Promise<void>;
  #releaseEnter?: () => void;
  receivedActions = 0;
  snapshotRequests = 0;
  leaveCount = 0;
  lastActionId?: string;

  async authenticate(): Promise<{ playerId: string }> {
    this.#playerId = crypto.randomUUID();
    return { playerId: this.#playerId };
  }

  async createRoom(input: { projectId: string }): Promise<JoinedRoom> {
    if (this.#enterHold) await this.#enterHold;
    if (this.#failCreate) {
      this.#failCreate = false;
      throw new Error("create room failed");
    }
    this.#projectId = input.projectId;
    const room: RoomRecord = {
      roomId: crypto.randomUUID(),
      projectId: input.projectId,
      inviteCode: crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase(),
      hostId: this.#requirePlayer(),
      version: 0,
      sequence: 0,
      state: {},
      members: new Map(),
      recent: new Map(),
      transports: new Set(),
      messageCount: 0,
      messageWindowStartedAt: Date.now(),
      messageLimit: 20,
      suspended: false,
    };
    rooms.set(room.roomId, room);
    roomsByInvite.set(room.inviteCode, room);
    return this.#enter(room);
  }

  async joinRoom(input: { projectId: string; inviteCode: string }): Promise<JoinedRoom> {
    if (this.#enterHold) await this.#enterHold;
    this.#projectId = input.projectId;
    const room = roomsByInvite.get(input.inviteCode);
    if (!room) throw new Error("INVITE_INVALID: invite not found");
    if (room.projectId !== input.projectId) {
      throw new Error("TENANT_MISMATCH: tenant mismatch");
    }
    if (room.suspended) throw new Error("ROOM_NOT_FOUND: project suspended");
    return this.#enter(room);
  }

  async send(message: ClientEnvelope): Promise<void> {
    const room = this.#room;
    const playerId = this.#requirePlayer();
    if (!room) throw new Error("join a room before sending messages");
    if (room.suspended) {
      this.#deliver(
        this,
        envelope(room, { type: "room_closed", reason: "suspended" }),
      );
      return;
    }
    const retryAfterMs = this.#rateLimit(room);
    if (retryAfterMs) {
      this.#deliver(
        this,
        envelope(room, {
          type: "error",
          code: "RATE_LIMITED",
          message: "message rate exceeded",
          retryAfterMs,
          actionId: "actionId" in message ? message.actionId : undefined,
        }),
      );
      return;
    }
    if (message.type === "action") {
      const key =
        message.actionId && playerId
          ? actionIdentityKey(playerId, message.actionId)
          : "";
      const seen = key ? room.recent.get(key) : undefined;
      if (seen?.status === "committed") {
        this.#deliver(
          this,
          envelope(room, {
            type: "state",
            hostId: room.hostId,
            state: room.state,
            stateVersion: room.version,
            actionId: message.actionId,
            senderId: playerId,
          }),
        );
        return;
      }
      if (seen?.status === "rejected") {
        this.#deliver(
          this,
          envelope(room, {
            type: "error",
            code: "INVALID_MESSAGE",
            message: seen.message ?? "action rejected",
            actionId: message.actionId,
            senderId: playerId,
            actionOutcome: seen.outcome ?? "rejected",
          }),
        );
        return;
      }
      if (seen?.status === "delivered" && seen.hostId === room.hostId) {
        this.#deliver(
          this,
          envelope(room, {
            type: "error",
            code: "INVALID_MESSAGE",
            message: "duplicate action",
            actionId: message.actionId,
            senderId: playerId,
          }),
        );
        return;
      }
      this.lastActionId = message.actionId;
      if (message.actionId) {
        room.recent.set(actionIdentityKey(playerId, message.actionId), {
          status: "delivered",
          hostId: room.hostId,
          senderId: playerId,
          actionId: message.actionId,
        });
      }
      this.#deliverToHost(
        room,
        envelope(room, {
          type: "action",
          senderId: playerId,
          payload: message.payload,
          actionId: message.actionId,
        }),
      );
      return;
    }
    if (message.type === "host_state") {
      if (playerId !== room.hostId) {
        this.#deliver(
          this,
          envelope(room, {
            type: "error",
            code: "HOST_REQUIRED",
            message: "host required",
            actionId: message.actionId,
          }),
        );
        return;
      }
      const hostSender =
        message.senderId ||
        (message.actionId
          ? [...room.recent.values()].filter((entry) => entry.actionId === message.actionId)
          : []);
      const resolvedSender =
        typeof hostSender === "string"
          ? hostSender
          : hostSender.length === 1
            ? hostSender[0]!.senderId
            : hostSender.length > 1
              ? ""
              : playerId;
      if (message.actionId && !message.senderId && Array.isArray(hostSender) && hostSender.length > 1) {
        this.#deliver(
          this,
          envelope(room, {
            type: "error",
            code: "INVALID_MESSAGE",
            message: "ambiguous action identity",
            actionId: message.actionId,
          }),
        );
        return;
      }
      const commitKey =
        message.actionId && resolvedSender
          ? actionIdentityKey(resolvedSender, message.actionId)
          : "";
      if (commitKey && room.recent.get(commitKey)?.status === "committed") {
        this.#deliver(
          this,
          envelope(room, {
            type: "state",
            hostId: room.hostId,
            state: room.state,
            stateVersion: room.version,
            actionId: message.actionId,
            senderId: resolvedSender,
          }),
        );
        return;
      }
      if (this.#staleOnce) {
        this.#staleOnce = false;
        this.#deliver(
          this,
          envelope(room, {
            type: "error",
            code: "STALE_VERSION",
            message: "stale version",
            actionId: message.actionId,
          }),
        );
        return;
      }
      if (
        message.expectedStateVersion !== undefined &&
        message.expectedStateVersion !== room.version
      ) {
        this.#deliver(
          this,
          envelope(room, {
            type: "error",
            code: "STALE_VERSION",
            message: "stale version",
            actionId: message.actionId,
          }),
        );
        return;
      }
      room.state = message.state;
      room.version += 1;
      if (message.actionId && resolvedSender) {
        const delivered = room.recent.get(actionIdentityKey(resolvedSender, message.actionId));
        room.recent.set(actionIdentityKey(resolvedSender, message.actionId), {
          status: "committed",
          hostId: room.hostId,
          senderId: resolvedSender,
          actionId: message.actionId,
        });
        void delivered;
      }
      this.#broadcast(
        room,
        envelope(room, {
          type: "state",
          hostId: room.hostId,
          state: room.state,
          stateVersion: room.version,
          actionId: message.actionId,
          senderId: resolvedSender || undefined,
        }),
        this.#suppressStateEcho ? this : undefined,
      );
      return;
    }
    if (message.type === "action_reject") {
      if (this.#failRejection) {
        this.#failRejection = false;
        throw new Error("rejection send failed");
      }
      if (
        typeof message.actionId !== "string" ||
        !/^[A-Za-z0-9_-]{8,128}$/.test(message.actionId) ||
        (message.outcome !== "rejected" && message.outcome !== "invalid") ||
        typeof message.message !== "string" ||
        message.message.length < 1 ||
        message.message.length > 200
      ) {
        this.#deliver(
          this,
          envelope(room, {
            type: "error",
            code: "INVALID_MESSAGE",
            message: "invalid action rejection",
            actionId: /^[A-Za-z0-9_-]{8,128}$/.test(String(message.actionId))
              ? message.actionId
              : undefined,
          }),
        );
        return;
      }
      if (playerId !== room.hostId) {
        this.#deliver(
          this,
          envelope(room, {
            type: "error",
            code: "HOST_REQUIRED",
            message: "host required",
            actionId: message.actionId,
          }),
        );
        return;
      }
      const rejectMatches = [...room.recent.values()].filter(
        (entry) => entry.actionId === message.actionId,
      );
      const delivered = message.senderId
        ? room.recent.get(actionIdentityKey(message.senderId, message.actionId))
        : rejectMatches.length === 1
          ? rejectMatches[0]
          : undefined;
      if (!message.senderId && rejectMatches.length > 1) {
        this.#deliver(
          this,
          envelope(room, {
            type: "error",
            code: "INVALID_MESSAGE",
            message: "ambiguous action identity",
            actionId: message.actionId,
          }),
        );
        return;
      }
      if (!delivered || delivered.status !== "delivered") return;
      room.recent.set(actionIdentityKey(delivered.senderId, message.actionId), {
        ...delivered,
        status: "rejected",
        outcome: message.outcome,
        message: message.message,
      });
      for (const transport of room.transports) {
        if (transport.#playerId !== delivered.senderId) continue;
        this.#deliver(
          transport,
          envelope(room, {
            type: "error",
            code: "INVALID_MESSAGE",
            message: message.message,
            actionId: message.actionId,
            senderId: delivered.senderId,
            actionOutcome: message.outcome,
          }),
        );
      }
      return;
    }
    if (message.type === "snapshot_request") {
      this.snapshotRequests += 1;
      if (this.#failSnapshot) {
        this.#failSnapshot = false;
        throw new Error("snapshot failed");
      }
      this.#deliver(this, this.#snapshot(room));
    }
  }

  subscribe(listener: (message: unknown) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  subscribeConnection(listener: (event: "disconnected" | "connected" | "reconnect_failed") => void): () => void {
    this.#connection.add(listener);
    return () => this.#connection.delete(listener);
  }

  async leaveRoom(roomId: string): Promise<void> {
    const shouldFail = this.#failLeave;
    this.#failLeave = false;
    this.leaveCount += 1;
    const room = this.#room;
    if (!room || room.roomId !== roomId) {
      if (shouldFail) throw new Error("leave failed");
      return;
    }
    const playerId = this.#requirePlayer();
    room.members.delete(playerId);
    room.transports.delete(this);
    const leaves = [
      {
        playerId,
        sessionId: playerId,
        joinedAt: 0,
        host: playerId === room.hostId,
      },
    ];
    if (room.hostId === playerId) {
      room.hostId = [...room.members.keys()][0] ?? "";
      this.#broadcast(
        room,
        envelope(room, {
          type: "host_changed",
          previousHostId: playerId,
          hostId: room.hostId,
          stateVersion: room.version,
        }),
      );
    }
    this.#broadcast(
      room,
      envelope(room, {
        type: "presence",
        joins: [],
        leaves,
        members: this.#members(room),
      }),
    );
    this.#room = undefined;
    if (shouldFail) throw new Error("leave failed");
  }

  async reconnect(): Promise<void> {
    if (this.#failReconnect) {
      this.#failReconnect = false;
      for (const listener of this.#connection) listener("reconnect_failed");
      throw new Error("reconnect failed");
    }
    for (const listener of this.#connection) listener("disconnected");
    const room = this.#room;
    const playerId = this.#playerId;
    if (room && playerId) {
      room.transports.delete(this);
      const wasHost = room.hostId === playerId;
      const left = room.members.get(playerId);
      room.members.delete(playerId);
      if (wasHost) {
        room.hostId = [...room.members.keys()][0] ?? "";
        this.#broadcast(
          room,
          envelope(room, {
            type: "host_changed",
            previousHostId: playerId,
            hostId: room.hostId,
            stateVersion: room.version,
          }),
        );
      }
      this.#broadcast(
        room,
        envelope(room, {
          type: "presence",
          joins: [],
          leaves: left
            ? [
                {
                  playerId,
                  sessionId: left.sessionId,
                  joinedAt: left.joinedAt,
                  host: wasHost,
                },
              ]
            : [],
          members: this.#members(room),
        }),
      );
      room.members.set(playerId, { sessionId: crypto.randomUUID(), joinedAt: Date.now() });
      room.transports.add(this);
      this.#room = room;
      this.#broadcast(
        room,
        envelope(room, {
          type: "presence",
          joins: [
            {
              playerId,
              sessionId: room.members.get(playerId)!.sessionId,
              joinedAt: room.members.get(playerId)!.joinedAt,
              host: playerId === room.hostId,
            },
          ],
          leaves: [],
          members: this.#members(room),
        }),
      );
    }
    for (const listener of this.#connection) listener("connected");
  }

  async close(): Promise<void> {
    this.#closed = true;
    this.#listeners.clear();
    this.#connection.clear();
  }

  disconnectPeer(): void {
    for (const listener of this.#connection) listener("disconnected");
  }

  pauseInbound(): void {
    this.#paused = true;
  }

  resumeInbound(): void {
    this.#paused = false;
    for (const message of this.#held.splice(0)) this.#deliver(this, message);
  }

  staleNextHostState(): void {
    this.#staleOnce = true;
  }

  suppressStateEcho(enabled = true): void {
    this.#suppressStateEcho = enabled;
  }

  failNextSnapshot(): void {
    this.#failSnapshot = true;
  }

  failNextActionRejection(): void {
    this.#failRejection = true;
  }

  failNextCreate(): void {
    this.#failCreate = true;
  }

  failNextLeave(): void {
    this.#failLeave = true;
  }

  failNextJoinSnapshot(): void {
    this.#failJoinSnapshot = true;
  }

  omitCapabilities(): void {
    this.#omitCapabilities = true;
  }

  failNextReconnect(): void {
    this.#failReconnect = true;
  }

  emitReconnectFailed(): void {
    for (const listener of this.#connection) listener("reconnect_failed");
  }

  holdNextEnter(): void {
    this.#enterHold = new Promise((resolve) => {
      this.#releaseEnter = resolve;
    });
  }

  releaseEnter(): void {
    this.#releaseEnter?.();
    this.#enterHold = undefined;
    this.#releaseEnter = undefined;
  }

  injectStaleSnapshot(): void {
    const room = this.#room;
    if (!room) return;
    this.#deliver(
      this,
      envelope(room, {
        type: "snapshot",
        hostId: room.hostId,
        state: { n: -1 },
        stateVersion: Math.max(0, room.version - 1),
        members: this.#members(room),
        capabilities: DEFAULT_RUNTIME_CAPABILITIES,
      }),
    );
  }

  reconnectInPlace(): void {
    for (const listener of this.#connection) listener("disconnected");
    for (const listener of this.#connection) listener("connected");
  }

  setMessageRateLimit(limit: number): void {
    const room = this.#room;
    if (!room) return;
    room.messageLimit = limit;
    room.messageCount = 0;
    room.messageWindowStartedAt = Date.now();
  }

  suspend(): void {
    const room = this.#room;
    if (!room) return;
    room.suspended = true;
    this.#broadcast(room, envelope(room, { type: "room_closed", reason: "suspended" }));
  }

  #enter(room: RoomRecord): JoinedRoom {
    const playerId = this.#requirePlayer();
    room.members.set(playerId, { sessionId: playerId, joinedAt: Date.now() });
    room.transports.add(this);
    this.#room = room;
    if (this.#failJoinSnapshot) {
      this.#failJoinSnapshot = false;
      return {
        roomId: room.roomId,
        inviteCode: room.inviteCode,
        snapshot: envelope(room, {
          type: "state",
          hostId: room.hostId,
          state: room.state,
        }) as ServerEnvelope,
      };
    }
    const snapshot = this.#snapshot(room);
    this.#broadcast(
      room,
      envelope(room, {
        type: "presence",
        joins: [
          {
            playerId,
            sessionId: playerId,
            joinedAt: room.members.get(playerId)!.joinedAt,
            host: playerId === room.hostId,
          },
        ],
        leaves: [],
        members: this.#members(room),
      }),
    );
    return { roomId: room.roomId, inviteCode: room.inviteCode, snapshot };
  }

  injectError(code: string, message: string, actionId?: string): void {
    const room = this.#room;
    if (!room) return;
    this.#deliver(
      this,
      envelope(room, {
        type: "error",
        code,
        message,
        actionId,
      }),
    );
  }

  injectRoomClosed(): void {
    const room = this.#room;
    if (!room) return;
    this.#broadcast(
      room,
      envelope(room, {
        type: "room_closed",
        reason: "empty",
      }),
    );
  }

  #snapshot(room: RoomRecord): ServerEnvelope {
    return envelope(room, {
      type: "snapshot",
      hostId: room.hostId,
      state: this.#staleSnapshotOnce ? { n: -1 } : room.state,
      stateVersion: this.#staleSnapshotOnce
        ? Math.max(0, room.version - 1)
        : room.version,
      members: this.#members(room),
      ...(this.#omitCapabilities
        ? {}
        : { capabilities: DEFAULT_RUNTIME_CAPABILITIES }),
    });
  }

  #members(room: RoomRecord) {
    return [...room.members.entries()].map(([playerId, member]) => ({
      playerId,
      sessionId: member.sessionId,
      joinedAt: member.joinedAt,
      host: playerId === room.hostId,
    }));
  }

  #broadcast(
    room: RoomRecord,
    message: ServerEnvelope,
    exclude?: MemoryTransport,
  ): void {
    for (const transport of room.transports) {
      if (transport === exclude) continue;
      transport.#deliver(transport, message);
    }
  }

  #deliverToHost(room: RoomRecord, message: ServerEnvelope): void {
    for (const transport of room.transports) {
      if (transport.#playerId === room.hostId) transport.#deliver(transport, message);
    }
  }

  #deliver(transport: MemoryTransport, message: ServerEnvelope): void {
    if (transport.#closed) return;
    if (transport.#paused) {
      transport.#held.push(message);
      return;
    }
    if (message.type === "action") transport.receivedActions += 1;
    for (const listener of transport.#listeners) listener(message);
  }

  #rateLimit(room: RoomRecord): number {
    const now = Date.now();
    if (now - room.messageWindowStartedAt >= 1000) {
      room.messageWindowStartedAt = now;
      room.messageCount = 0;
    }
    room.messageCount += 1;
    if (room.messageCount > room.messageLimit) {
      return Math.max(1, 1000 - (now - room.messageWindowStartedAt));
    }
    return 0;
  }

  #requirePlayer(): string {
    if (!this.#playerId) throw new Error("authenticate first");
    return this.#playerId;
  }
}

const pair = async () => {
  const projectId = crypto.randomUUID();
  const hostTransport = new MemoryTransport();
  const memberTransport = new MemoryTransport();
  const host = new LokiClient({ projectId, transport: hostTransport });
  const member = new LokiClient({ projectId, transport: memberTransport });
  await host.authenticate("token");
  await member.authenticate("token");
  const counts = { host: 0, member: 0 };
  const hostRoom = host.createSynchronizedRoom<OpaqueState, OpaqueAction>({
    initialState: { n: 0 },
    reduce: (state, action) => {
      counts.host += 1;
      return { n: state.n + action.d };
    },
  });
  const memberRoom = member.createSynchronizedRoom<OpaqueState, OpaqueAction>({
    initialState: { n: 0 },
    reduce: (state, action) => {
      counts.member += 1;
      return { n: state.n + action.d };
    },
  });
  const created = await hostRoom.create();
  const joined = await memberRoom.join({ inviteCode: created.inviteCode });
  return {
    host,
    member,
    hostRoom,
    memberRoom,
    created,
    joined,
    hostTransport,
    memberTransport,
    counts,
    projectId,
  };
};

test("two synchronized clients converge on identical opaque state", async () => {
  const { hostRoom, memberRoom } = await pair();
  await hostRoom.dispatch({ d: 2 });
  assert.deepEqual(hostRoom.getSnapshot().state, { n: 2 });
  assert.deepEqual(memberRoom.getSnapshot().state, { n: 2 });
  assert.equal(hostRoom.getSnapshot().stateVersion, 2);
  assert.equal(memberRoom.getSnapshot().stateVersion, 2);
});

test("only the assigned authority commits synchronized state", async () => {
  const { hostRoom, memberRoom } = await pair();
  await memberRoom.dispatch({ d: 3 });
  assert.equal(hostRoom.isHost, true);
  assert.equal(memberRoom.isHost, false);
  assert.deepEqual(hostRoom.getSnapshot().state, { n: 3 });
  assert.deepEqual(memberRoom.getSnapshot().state, { n: 3 });
});

test("concurrent actions are serialized on the authority", async () => {
  const { hostRoom, memberRoom } = await pair();
  await Promise.all([hostRoom.dispatch({ d: 1 }), memberRoom.dispatch({ d: 4 })]);
  assert.deepEqual(hostRoom.getSnapshot().state, { n: 5 });
  assert.deepEqual(memberRoom.getSnapshot().state, { n: 5 });
  assert.equal(hostRoom.getSnapshot().stateVersion, 3);
});

test("invalid actions are rejected and do not close the room", async () => {
  const transport = new MemoryTransport();
  const client = new LokiClient({ projectId: crypto.randomUUID(), transport });
  await client.authenticate("token");
  const room = client.createSynchronizedRoom<OpaqueState, OpaqueAction>({
    initialState: { n: 0 },
    actionSchema: {
      parse(value) {
        const action = value as OpaqueAction;
        if (!action || action.d === 0) throw new Error("invalid delta");
        return action;
      },
    },
    reduce: (state, action) => ({ n: state.n + action.d }),
  });
  await room.create();
  await assert.rejects(room.dispatch({ d: 0 }), /invalid delta/);
  assert.equal(room.getSnapshot().connection, "connected");
  await room.dispatch({ d: 1 });
  assert.deepEqual(room.getSnapshot().state, { n: 1 });
});

test("reducer failure rejects the action without closing the room", async () => {
  const transport = new MemoryTransport();
  const client = new LokiClient({ projectId: crypto.randomUUID(), transport });
  await client.authenticate("token");
  const room = client.createSynchronizedRoom<OpaqueState, OpaqueAction>({
    initialState: { n: 0 },
    reduce: (state, action) => {
      if (action.d < 0) throw new Error("rejected transition");
      return { n: state.n + action.d };
    },
  });
  await room.create();
  await assert.rejects(room.dispatch({ d: -1 }), SynchronizedRoomError);
  assert.equal(room.getSnapshot().connection, "connected");
  await room.dispatch({ d: 2 });
  assert.deepEqual(room.getSnapshot().state, { n: 2 });
});

test("remote reducer failure rejects the sender without closing the room", async () => {
  const projectId = crypto.randomUUID();
  const host = new LokiClient({
    projectId,
    transport: new MemoryTransport(),
  });
  const member = new LokiClient({
    projectId,
    transport: new MemoryTransport(),
  });
  await host.authenticate("token");
  await member.authenticate("token");
  const hostRoom = host.createSynchronizedRoom<OpaqueState, OpaqueAction>({
    initialState: { n: 0 },
    reduce: (state, action) => {
      if (action.d < 0) throw new Error("rejected transition");
      return { n: state.n + action.d };
    },
  });
  const memberRoom = member.createSynchronizedRoom<OpaqueState, OpaqueAction>({
    initialState: { n: 0 },
    reduce: (state, action) => ({ n: state.n + action.d }),
  });
  const created = await hostRoom.create();
  await memberRoom.join({ inviteCode: created.inviteCode });
  await assert.rejects(memberRoom.dispatch({ d: -1 }), /rejected transition/);
  assert.equal(memberRoom.getSnapshot().connection, "connected");
  await memberRoom.dispatch({ d: 2 });
  assert.deepEqual(hostRoom.getSnapshot().state, { n: 2 });
});

test("reducers must be synchronous and stay within the execution budget", async () => {
  const transport = new MemoryTransport();
  const client = new LokiClient({ projectId: crypto.randomUUID(), transport });
  await client.authenticate("token");
  const asynchronous = client.createSynchronizedRoom<OpaqueState, OpaqueAction>({
    initialState: { n: 0 },
    reduce: (() => Promise.resolve({ n: 1 })) as unknown as (
      state: OpaqueState,
      action: OpaqueAction,
    ) => OpaqueState,
  });
  await asynchronous.create();
  await assert.rejects(asynchronous.dispatch({ d: 1 }), /synchronous/);
  await asynchronous.leave();

  const bounded = client.createSynchronizedRoom<OpaqueState, OpaqueAction>({
    initialState: { n: 0 },
    reduce: () => {
      const until = performance.now() + 60;
      while (performance.now() < until) {
        // Exercise the post-return budget check for finite reducers.
      }
      return { n: 1 };
    },
  });
  await bounded.create();
  await assert.rejects(bounded.dispatch({ d: 1 }), /execution budget/);
});

test("duplicate action identifiers apply once", async () => {
  const { host, hostRoom } = await pair();
  await host.sendAction({ d: 1 }, { actionId: "duplicate1" });
  await host.sendAction({ d: 1 }, { actionId: "duplicate1" });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(hostRoom.getSnapshot().state, { n: 1 });
  await hostRoom.dispatch({ d: 1 });
  assert.deepEqual(hostRoom.getSnapshot().state, { n: 2 });
});

test("state conflicts keep the last confirmed version", async () => {
  const { hostRoom, hostTransport } = await pair();
  hostTransport.staleNextHostState();
  const committed = await hostRoom.dispatch({ d: 1 });
  assert.deepEqual(committed.state, { n: 1 });
  assert.equal(hostRoom.getSnapshot().stateVersion, 2);
  assert.deepEqual(hostRoom.getSnapshot().state, { n: 1 });
});

test("remote action survives a host state conflict", async () => {
  const { hostRoom, memberRoom, hostTransport } = await pair();
  hostTransport.staleNextHostState();
  const committed = await memberRoom.dispatch({ d: 3 });
  assert.deepEqual(committed.state, { n: 3 });
  assert.deepEqual(hostRoom.getSnapshot().state, { n: 3 });
  assert.equal(hostRoom.getSnapshot().stateVersion, 2);
});

test("membership remains after a second participant joins", async () => {
  const { hostRoom, memberRoom } = await pair();
  assert.equal(hostRoom.members.length, 2);
  assert.equal(memberRoom.members.length, 2);
  assert.equal(hostRoom.members.filter((member) => member.host).length, 1);
});

test("authority migration resumes without rolling state back", async () => {
  const { hostRoom, memberRoom } = await pair();
  await hostRoom.dispatch({ d: 5 });
  await hostRoom.leave();
  await memberRoom.dispatch({ d: 1 });
  assert.deepEqual(memberRoom.getSnapshot().state, { n: 6 });
  assert.equal(memberRoom.isHost, true);
});

test("oversized state is rejected before transmission", async () => {
  const transport = new MemoryTransport();
  const client = new LokiClient({ projectId: crypto.randomUUID(), transport });
  await client.authenticate("token");
  const room = client.createSynchronizedRoom<{ blob: string }, { d: number }>({
    initialState: { blob: "" },
    reduce: () => ({ blob: "x".repeat(20_000) }),
  });
  await room.create();
  await assert.rejects(room.dispatch({ d: 1 }), /maximum size/);
  assert.equal(room.getSnapshot().connection, "connected");
});

test("presence does not advance synchronized state version", async () => {
  const { hostRoom, created, projectId } = await pair();
  const version = hostRoom.getSnapshot().stateVersion;
  const extra = new LokiClient({
    projectId,
    transport: new MemoryTransport(),
  });
  await extra.authenticate("token");
  const extraRoom = extra.createSynchronizedRoom<OpaqueState, OpaqueAction>({
    initialState: { n: 0 },
    reduce: (state, action) => ({ n: state.n + action.d }),
  });
  await extraRoom.join({ inviteCode: created.inviteCode });
  assert.equal(hostRoom.getSnapshot().stateVersion, version);
});

test("existing low-level action and host state methods remain available", async () => {
  const transport = new MemoryTransport();
  const client = new LokiClient({ projectId: crypto.randomUUID(), transport });
  await client.authenticate("token");
  const joined = await client.createRoom();
  await client.sendAction({ n: 1 });
  await client.sendHostState(0, { n: 1 }, { expectedStateVersion: 0, actionId: "legacyact" });
  assert.equal(joined.snapshot.type, "snapshot");
});

test("reconnect restores authoritative state and membership", async () => {
  const { hostRoom, memberRoom, created } = await pair();
  await hostRoom.dispatch({ d: 4 });
  await hostRoom.reconnect();
  assert.deepEqual(hostRoom.getSnapshot().state, { n: 4 });
  assert.deepEqual(memberRoom.getSnapshot().state, { n: 4 });
  assert.equal(hostRoom.getSnapshot().stateVersion, 2);
  assert.equal(hostRoom.getSnapshot().connection, "connected");
  assert.equal(hostRoom.members.length, 2);
  assert.equal(memberRoom.members.length, 2);
  assert.equal(created.inviteCode.length, 16);
});

test("late join receives the current authoritative state", async () => {
  const { hostRoom, created, projectId } = await pair();
  await hostRoom.dispatch({ d: 7 });
  const extra = new LokiClient({
    projectId,
    transport: new MemoryTransport(),
  });
  await extra.authenticate("token");
  const extraRoom = extra.createSynchronizedRoom<OpaqueState, OpaqueAction>({
    initialState: { n: 0 },
    reduce: (state, action) => ({ n: state.n + action.d }),
  });
  await extraRoom.join({ inviteCode: created.inviteCode });
  assert.deepEqual(extraRoom.getSnapshot().state, { n: 7 });
  assert.equal(extraRoom.getSnapshot().stateVersion, 2);
});

test("rate limiting does not disconnect clients", async () => {
  const { hostRoom, hostTransport } = await pair();
  hostTransport.setMessageRateLimit(0);
  await assert.rejects(hostRoom.dispatch({ d: 1 }), /rate|RATE_LIMITED/i);
  assert.equal(hostRoom.getSnapshot().connection, "connected");
  assert.equal(hostRoom.getSnapshot().lastError?.outcome, "rate_limited");
  hostTransport.setMessageRateLimit(20);
  await hostRoom.dispatch({ d: 1 });
  assert.deepEqual(hostRoom.getSnapshot().state, { n: 1 });
  assert.equal(hostRoom.getSnapshot().connection, "connected");
});

test("room closure stops synchronized dispatch", async () => {
  const { hostRoom, hostTransport } = await pair();
  hostTransport.injectRoomClosed();
  assert.equal(hostRoom.getSnapshot().connection, "closed");
  await assert.rejects(hostRoom.dispatch({ d: 1 }), SynchronizedRoomError);
});

test("create commits initial state instead of the empty snapshot", async () => {
  const transport = new MemoryTransport();
  const client = new LokiClient({ projectId: crypto.randomUUID(), transport });
  await client.authenticate("token");
  const room = client.createSynchronizedRoom<OpaqueState, OpaqueAction>({
    initialState: { n: 3 },
    reduce: (state, action) => ({ n: state.n + action.d }),
  });
  const created = await room.create();
  assert.deepEqual(created.state, { n: 3 });
  assert.equal(created.stateVersion, 1);
  await room.dispatch({ d: 1 });
  assert.deepEqual(room.getSnapshot().state, { n: 4 });
  assert.equal(room.getSnapshot().stateVersion, 2);
});

test("non-host clients do not run the reducer", async () => {
  const { hostRoom, memberRoom, memberTransport, counts } = await pair();
  const committed: Array<{ senderId: string; state: OpaqueState }> = [];
  hostRoom.onCommitted((result) => {
    committed.push({ senderId: result.senderId, state: result.state });
  });
  await memberRoom.dispatch({ d: 2 });
  assert.equal(counts.host, 1);
  assert.equal(counts.member, 0);
  assert.equal(memberTransport.receivedActions, 0);
  assert.equal(committed.length, 1);
  assert.deepEqual(committed[0]!.state, { n: 2 });
  assert.deepEqual(hostRoom.getSnapshot().state, { n: 2 });
  assert.deepEqual(memberRoom.getSnapshot().state, { n: 2 });
});

test("authority migration commits a pending action after snapshot", async () => {
  const { hostRoom, memberRoom, hostTransport } = await pair();
  hostTransport.pauseInbound();
  const pending = memberRoom.dispatch({ d: 4 });
  await hostRoom.leave();
  assert.deepEqual(await pending, memberRoom.getSnapshot());
  assert.deepEqual(memberRoom.getSnapshot().state, { n: 4 });
  assert.equal(memberRoom.isHost, true);
});

test("rooms isolate state across projects", async () => {
  const left = await pair();
  const right = await pair();
  await left.hostRoom.dispatch({ d: 5 });
  assert.deepEqual(right.hostRoom.getSnapshot().state, { n: 0 });
  const outsider = new LokiClient({
    projectId: crypto.randomUUID(),
    transport: new MemoryTransport(),
  });
  await outsider.authenticate("token");
  const outsiderRoom = outsider.createSynchronizedRoom<OpaqueState, OpaqueAction>({
    initialState: { n: 0 },
    reduce: (state, action) => ({ n: state.n + action.d }),
  });
  await assert.rejects(
    outsiderRoom.join({ inviteCode: left.created.inviteCode }),
    /TENANT_MISMATCH/,
  );
});

test("suspension closes the synchronized room", async () => {
  const { hostRoom, hostTransport } = await pair();
  hostTransport.suspend();
  assert.equal(hostRoom.getSnapshot().connection, "closed");
  await assert.rejects(hostRoom.dispatch({ d: 1 }), SynchronizedRoomError);
});

test("reconnect with an in-flight host commit does not deadlock", { timeout: 2000 }, async () => {
  const { hostRoom, hostTransport } = await pair();
  hostTransport.suppressStateEcho();
  const pending = hostRoom.dispatch({ d: 1 });
  await new Promise((resolve) => setTimeout(resolve, 20));
  hostTransport.suppressStateEcho(false);
  hostTransport.reconnectInPlace();
  assert.deepEqual(await pending, hostRoom.getSnapshot());
  assert.deepEqual(hostRoom.getSnapshot().state, { n: 1 });
  assert.equal(hostRoom.getSnapshot().connection, "connected");
  assert.equal(hostRoom.isHost, true);
});

test("failed snapshot recovery rejects pending dispatch", async () => {
  const { hostRoom, hostTransport } = await pair();
  hostTransport.failNextSnapshot();
  hostTransport.staleNextHostState();
  await assert.rejects(hostRoom.dispatch({ d: 1 }), SynchronizedRoomError);
  assert.equal(hostRoom.getSnapshot().connection, "failed");
  assert.equal(hostRoom.getSnapshot().lastError?.outcome, "state_conflict");
});

test("create and join failures leave the room failed and detached", async () => {
  const transport = new MemoryTransport();
  const client = new LokiClient({ projectId: crypto.randomUUID(), transport });
  await client.authenticate("token");
  const room = client.createSynchronizedRoom<OpaqueState, OpaqueAction>({
    initialState: { n: 0 },
    reduce: (state, action) => ({ n: state.n + action.d }),
  });
  transport.failNextCreate();
  await assert.rejects(room.create(), /create room failed/);
  assert.equal(room.getSnapshot().connection, "failed");
  await assert.rejects(room.join({ inviteCode: "FFFFFFFFFFFFFFFF" }), /invite/i);
  assert.equal(room.getSnapshot().connection, "failed");
  const created = await room.create();
  assert.equal(created.connection, "connected");
  await room.dispatch({ d: 2 });
  assert.deepEqual(room.getSnapshot().state, { n: 2 });
});

test("dispatch times out without authoritative confirmation", async (t) => {
  const { hostRoom, memberRoom, hostTransport } = await pair();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  hostTransport.suppressStateEcho();
  const hostPending = hostRoom.dispatch({ d: 1 });
  t.mock.timers.tick(SYNCHRONIZED_ROOM_COMMIT_TIMEOUT_MS);
  await assert.rejects(hostPending, /confirmation timed out/);
  assert.equal(hostRoom.getSnapshot().lastError?.outcome, "indeterminate");

  hostTransport.pauseInbound();
  const memberPending = memberRoom.dispatch({ d: 3 });
  t.mock.timers.tick(SYNCHRONIZED_ROOM_COMMIT_TIMEOUT_MS);
  await assert.rejects(memberPending, /confirmation timed out/);
  assert.equal(memberRoom.getSnapshot().lastError?.outcome, "indeterminate");
});

test("remote rejection send failure keeps the host queue running", async () => {
  const projectId = crypto.randomUUID();
  const hostTransport = new MemoryTransport();
  const host = new LokiClient({ projectId, transport: hostTransport });
  const member = new LokiClient({
    projectId,
    transport: new MemoryTransport(),
  });
  await host.authenticate("token");
  await member.authenticate("token");
  const hostRoom = host.createSynchronizedRoom<OpaqueState, OpaqueAction>({
    initialState: { n: 0 },
    reduce: (state, action) => {
      if (action.d < 0) throw new Error("rejected transition");
      return { n: state.n + action.d };
    },
  });
  const memberRoom = member.createSynchronizedRoom<OpaqueState, OpaqueAction>({
    initialState: { n: 0 },
    reduce: (state, action) => ({ n: state.n + action.d }),
  });
  const created = await hostRoom.create();
  await memberRoom.join({ inviteCode: created.inviteCode });
  hostTransport.failNextActionRejection();
  const memberDispatch = assert.rejects(memberRoom.dispatch({ d: -1 }), SynchronizedRoomError);
  await hostRoom.dispatch({ d: 2 });
  assert.deepEqual(hostRoom.getSnapshot().state, { n: 2 });
  assert.equal(hostRoom.getSnapshot().connection, "connected");
  await memberRoom.leave();
  await memberDispatch;
});

test("explicit reconnect requests one snapshot", async () => {
  const { hostRoom, hostTransport } = await pair();
  const before = hostTransport.snapshotRequests;
  await hostRoom.reconnect();
  assert.equal(hostTransport.snapshotRequests, before + 1);
  assert.equal(hostRoom.getSnapshot().connection, "connected");
});

test("failed bootstrap leaves the created room", async () => {
  const transport = new MemoryTransport();
  const client = new LokiClient({ projectId: crypto.randomUUID(), transport });
  await client.authenticate("token");
  const room = client.createSynchronizedRoom<{ blob: string }, OpaqueAction>({
    initialState: { blob: "x".repeat(20_000) },
    reduce: (state) => state,
  });
  await assert.rejects(room.create(), /maximum size/);
  assert.equal(room.getSnapshot().connection, "failed");
  assert.equal(transport.leaveCount, 1);
  assert.equal(client.roomId, undefined);
});

test("LokiClient listener exceptions do not block synchronized delivery", async () => {
  const projectId = crypto.randomUUID();
  const transport = new MemoryTransport();
  const client = new LokiClient({ projectId, transport });
  await client.authenticate("token");
  client.onMessage(() => {
    throw new Error("client listener failed");
  });
  client.onConnection(() => {
    throw new Error("connection listener failed");
  });
  const room = client.createSynchronizedRoom<OpaqueState, OpaqueAction>({
    initialState: { n: 0 },
    reduce: (state, action) => ({ n: state.n + action.d }),
  });
  await room.create();
  await room.dispatch({ d: 4 });
  assert.deepEqual(room.getSnapshot().state, { n: 4 });
});

test("leave failure retains a retryable room identity", async () => {
  const { host, hostRoom, hostTransport } = await pair();
  hostTransport.failNextLeave();
  await assert.rejects(hostRoom.leave(), /leave failed/);
  assert.equal(hostRoom.getSnapshot().connection, "leave_failed");
  assert.ok(host.roomId);
  await assert.rejects(hostRoom.create(), /failed leave/);
  await hostRoom.leave();
  assert.equal(hostRoom.getSnapshot().connection, "closed");
  assert.equal(host.roomId, undefined);
});

test("long reducer rejection messages still reject the sender", async () => {
  const projectId = crypto.randomUUID();
  const host = new LokiClient({
    projectId,
    transport: new MemoryTransport(),
  });
  const member = new LokiClient({
    projectId,
    transport: new MemoryTransport(),
  });
  await host.authenticate("token");
  await member.authenticate("token");
  const hostRoom = host.createSynchronizedRoom<OpaqueState, OpaqueAction>({
    initialState: { n: 0 },
    reduce: () => {
      throw new Error("x".repeat(500));
    },
  });
  const memberRoom = member.createSynchronizedRoom<OpaqueState, OpaqueAction>({
    initialState: { n: 0 },
    reduce: (state, action) => ({ n: state.n + action.d }),
  });
  const created = await hostRoom.create();
  await memberRoom.join({ inviteCode: created.inviteCode });
  await assert.rejects(memberRoom.dispatch({ d: 1 }), /x{200}/);
  assert.equal(memberRoom.getSnapshot().lastError?.outcome, "rejected");
  assert.equal(hostRoom.getSnapshot().connection, "connected");
});

test("unseen duplicate action responses stay pending until commit", async () => {
  const { memberRoom, memberTransport, hostTransport } = await pair();
  hostTransport.pauseInbound();
  const pending = memberRoom.dispatch({ d: 1 });
  await new Promise((resolve) => setTimeout(resolve, 10));
  memberTransport.injectError(
    "INVALID_MESSAGE",
    "duplicate action",
    memberTransport.lastActionId,
  );
  let settled = false;
  void pending.then(() => {
    settled = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(settled, false);
  hostTransport.resumeInbound();
  assert.deepEqual((await pending).state, { n: 1 });
});

test("onCommitted listener exceptions do not hang dispatch", async () => {
  const { hostRoom } = await pair();
  hostRoom.onCommitted(() => {
    throw new Error("listener failed");
  });
  const committed = await hostRoom.dispatch({ d: 1 });
  assert.deepEqual(committed.state, { n: 1 });
  assert.equal(hostRoom.getSnapshot().connection, "connected");
});

test("MCP advertises synchronized rooms and flags manual synchronization", async () => {
  const api = {
    createProject: async () => ({}),
    createDeploymentCredential: async () => ({}),
    deploymentStatus: async () => ({}),
  };
  const requirements = (await callLokiTool(api, "integration_requirements", {})) as {
    synchronizedRooms: boolean;
  };
  assert.equal(requirements.synchronizedRooms, true);
  const diagnosis = (await callLokiTool(api, "diagnose_multiplayer", {
    sources: ["client.sendHostState(0, { n: 1 })"],
  })) as { findings: Array<{ code: string }> };
  assert.equal(
    diagnosis.findings.some((finding) => finding.code === "MANUAL_SYNCHRONIZATION"),
    true,
  );
});

test("concurrent reconnects coalesce to one snapshot", async () => {
  const { hostRoom, hostTransport } = await pair();
  const before = hostTransport.snapshotRequests;
  await Promise.all([hostRoom.reconnect(), hostRoom.reconnect()]);
  assert.equal(hostTransport.snapshotRequests, before + 1);
  assert.equal(hostRoom.getSnapshot().connection, "connected");
});

test("leave wins over an in-flight join", async () => {
  const transport = new MemoryTransport();
  const client = new LokiClient({ projectId: crypto.randomUUID(), transport });
  await client.authenticate("token");
  const room = client.createSynchronizedRoom<OpaqueState, OpaqueAction>({
    initialState: { n: 0 },
    reduce: (state, action) => ({ n: state.n + action.d }),
  });
  transport.holdNextEnter();
  const joining = room.create();
  await Promise.resolve();
  const leaving = room.leave();
  transport.releaseEnter();
  await leaving;
  await assert.rejects(joining);
  assert.ok(["closed", "leave_failed", "failed"].includes(room.getSnapshot().connection));
  assert.equal(client.roomId, undefined);
});

test("invalid join snapshot leaves the joined match", async () => {
  const transport = new MemoryTransport();
  const client = new LokiClient({ projectId: crypto.randomUUID(), transport });
  await client.authenticate("token");
  const room = client.createSynchronizedRoom<OpaqueState, OpaqueAction>({
    initialState: { n: 0 },
    reduce: (state, action) => ({ n: state.n + action.d }),
  });
  transport.failNextJoinSnapshot();
  await assert.rejects(room.create(), /invalid join snapshot/);
  assert.equal(room.getSnapshot().connection, "failed");
  assert.ok(transport.leaveCount >= 1);
  assert.equal(client.roomId, undefined);
});

test("stale recovery snapshots cannot roll state backward", async () => {
  const { hostRoom, hostTransport } = await pair();
  await hostRoom.dispatch({ d: 4 });
  assert.equal(hostRoom.getSnapshot().stateVersion, 2);
  hostTransport.injectStaleSnapshot();
  assert.deepEqual(hostRoom.getSnapshot().state, { n: 4 });
  assert.equal(hostRoom.getSnapshot().stateVersion, 2);
  await hostRoom.dispatch({ d: 1 });
  assert.deepEqual(hostRoom.getSnapshot().state, { n: 5 });
});

test("automatic reconnect failure leaves reconnecting", async () => {
  const { hostRoom, hostTransport } = await pair();
  hostTransport.emitReconnectFailed();
  assert.equal(hostRoom.getSnapshot().connection, "failed");
  await assert.rejects(hostRoom.reconnect(), /terminal/);
});

test("host reducer does not run twice for a prepared reconnect commit", async () => {
  const { hostRoom, hostTransport, counts } = await pair();
  hostTransport.suppressStateEcho();
  const pending = hostRoom.dispatch({ d: 2 });
  await new Promise((resolve) => setTimeout(resolve, 20));
  const reductions = counts.host;
  hostTransport.suppressStateEcho(false);
  hostTransport.reconnectInPlace();
  assert.deepEqual((await pending).state, { n: 2 });
  assert.equal(counts.host, reductions);
});

test("close abandons a failed leave handle", async () => {
  const { host, hostRoom, hostTransport } = await pair();
  hostTransport.failNextLeave();
  await assert.rejects(hostRoom.leave(), /leave failed/);
  assert.equal(hostRoom.getSnapshot().connection, "leave_failed");
  await hostRoom.close();
  assert.equal(hostRoom.getSnapshot().connection, "closed");
  assert.equal(host.roomId, undefined);
});

test("old runtimes without synchronized_rooms capabilities fail fast", async () => {
  const transport = new MemoryTransport();
  const client = new LokiClient({ projectId: crypto.randomUUID(), transport });
  await client.authenticate("token");
  transport.omitCapabilities();
  const room = client.createSynchronizedRoom<OpaqueState, OpaqueAction>({
    initialState: { n: 0 },
    reduce: (state, action) => ({ n: state.n + action.d }),
  });
  await assert.rejects(room.create(), /synchronized_rooms/);
  assert.equal(room.getSnapshot().connection, "failed");
});
