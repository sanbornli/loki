import {
  LokiClient,
  type ConnectionEvent,
  type LokiTransport,
  type JoinedRoom,
} from "../../packages/sdk-js/src/index.js";
import {
  DEFAULT_RUNTIME_CAPABILITIES,
  type ClientEnvelope,
  type RealtimeClientEnvelope,
  type RealtimeServerEnvelope,
  type ServerEnvelope,
} from "../../packages/protocol/src/index.js";

// A purpose-built in-memory bus that approximates just enough of the Nakama
// realtime runtime contract (capability gating, authority/round fencing,
// host-only routing, sync response) to exercise RealtimeRoom's client-side
// contract deterministically, without reimplementing the full runtime.
// Shared by test/realtime-room.test.ts and test/realtime-adapters.test.ts.
export class RealtimeBus {
  roomId = crypto.randomUUID();
  hostId = "";
  authorityEpoch = 0;
  roundSequence = 0;
  runtimeSnapshotSequence = 0;
  active = false;
  latestSnapshot?: { state: unknown; simulationTick: number; hostSnapshotSequence: number };
  members = new Map<string, { transport: FakeRealtimeTransport; capable: boolean; sessionId: string }>();
  v1Sequence = 0;
  v2Sequence = 0;

  join(transport: FakeRealtimeTransport, playerId: string, capable: boolean): JoinedRoom {
    const sessionId = crypto.randomUUID();
    const wasEmpty = this.members.size === 0;
    if (this.active && !capable) {
      throw new Error("INVALID_MESSAGE: room requires realtime support");
    }
    this.members.set(playerId, { transport, capable, sessionId });
    if (wasEmpty) this.hostId = playerId;
    const snapshot = this.#v1Envelope({
      type: "snapshot",
      hostId: this.hostId,
      state: {},
      stateVersion: 0,
      members: this.#presenceList(),
      membersComplete: true,
      membershipRevision: this.members.size,
      capabilities: { ...DEFAULT_RUNTIME_CAPABILITIES },
    });
    this.#broadcastV1(
      this.#v1Envelope({
        type: "presence",
        joins: [{ playerId, sessionId, joinedAt: Date.now(), host: playerId === this.hostId }],
        leaves: [],
        members: this.#presenceList(),
        membersComplete: true,
        membershipRevision: this.members.size,
      }),
      [playerId],
    );
    return { roomId: this.roomId, inviteCode: "000000", snapshot };
  }

  leave(playerId: string): void {
    const wasHost = this.hostId === playerId;
    const leaving = this.members.get(playerId);
    this.members.delete(playerId);
    if (!this.members.size) {
      this.hostId = "";
      return;
    }
    if (wasHost) {
      this.hostId = [...this.members.keys()][0]!;
      this.authorityEpoch += 1;
      // The new host's tick/hostSnapshotSequence counters restart
      // independently of the departed host's, so stored fencing state must
      // be cleared or the new host's first publish would be silently
      // dropped as a stale echo.
      this.latestSnapshot = undefined;
      this.#broadcastV1(
        this.#v1Envelope({ type: "host_changed", hostId: this.hostId, stateVersion: 0 }),
      );
    }
    this.#broadcastV1(
      this.#v1Envelope({
        type: "presence",
        joins: [],
        leaves: [{ playerId, sessionId: leaving?.sessionId ?? crypto.randomUUID(), joinedAt: 0, host: false }],
        members: this.#presenceList(),
        membersComplete: true,
        membershipRevision: this.members.size,
      }),
    );
  }

  sendRealtime(senderId: string, message: RealtimeClientEnvelope): void {
    if (message.type === "realtime_input") {
      const host = this.members.get(this.hostId);
      if (!host) return;
      this.#deliverV2(host.transport, {
        protocolVersion: 2,
        roomId: this.roomId,
        sequence: this.v2Sequence++,
        type: "realtime_input",
        senderId,
        roundSequence: message.roundSequence,
        inputSequence: message.inputSequence,
        targetTick: message.targetTick,
        delivery: message.delivery,
        clientSendTime: message.clientSendTime,
        serverReceiveTime: Date.now(),
        payload: message.payload,
      });
      return;
    }
    if (message.type === "realtime_snapshot") {
      if (senderId !== this.hostId) {
        this.#sendV2Error(senderId, "HOST_REQUIRED", "realtime host required");
        return;
      }
      if (message.authorityEpoch !== this.authorityEpoch) {
        this.#sendV2Error(senderId, "STALE_VERSION", "stale authority epoch");
        return;
      }
      if (message.roundSequence < this.roundSequence) {
        this.#sendV2Error(senderId, "STALE_VERSION", "stale round");
        return;
      }
      if (!this.active) {
        const allCapable = [...this.members.values()].every((member) => member.capable);
        if (!allCapable) {
          this.#sendV2Error(senderId, "INVALID_MESSAGE", "room has non-realtime members");
          return;
        }
        this.active = true;
      }
      if (message.roundSequence > this.roundSequence) {
        this.roundSequence = message.roundSequence;
        this.latestSnapshot = undefined;
      }
      const previous = this.latestSnapshot;
      if (
        previous &&
        (message.simulationTick <= previous.simulationTick ||
          message.hostSnapshotSequence <= previous.hostSnapshotSequence)
      ) {
        return;
      }
      this.runtimeSnapshotSequence += 1;
      this.latestSnapshot = {
        state: message.state,
        simulationTick: message.simulationTick,
        hostSnapshotSequence: message.hostSnapshotSequence,
      };
      const targets = [...this.members.values()].filter((member) => member.capable);
      for (const member of targets) {
        this.#deliverV2(member.transport, {
          protocolVersion: 2,
          roomId: this.roomId,
          sequence: this.v2Sequence++,
          type: "realtime_snapshot",
          hostId: this.hostId,
          authorityEpoch: this.authorityEpoch,
          roundSequence: this.roundSequence,
          simulationTick: message.simulationTick,
          runtimeSnapshotSequence: this.runtimeSnapshotSequence,
          processedInputCursors: message.processedInputCursors,
          hostSendTime: message.hostSendTime,
          serverTime: Date.now(),
          state: message.state,
        });
      }
      return;
    }
    if (message.type === "realtime_sync_request") {
      const member = this.members.get(senderId);
      if (!member) return;
      this.#deliverV2(member.transport, {
        protocolVersion: 2,
        roomId: this.roomId,
        sequence: this.v2Sequence++,
        type: "realtime_sync_response",
        hostId: this.hostId || undefined,
        authorityEpoch: this.authorityEpoch,
        roundSequence: this.roundSequence,
        simulationTick: this.latestSnapshot?.simulationTick,
        runtimeSnapshotSequence: this.runtimeSnapshotSequence,
        state: this.latestSnapshot?.state,
        retainedInputs: [],
        members: this.#presenceList(),
        membersComplete: true,
        membershipRevision: this.members.size,
        serverTime: Date.now(),
      });
    }
  }

  #sendV2Error(playerId: string, code: string, message: string): void {
    const member = this.members.get(playerId);
    if (!member) return;
    this.#deliverV2(member.transport, {
      protocolVersion: 2,
      roomId: this.roomId,
      sequence: this.v2Sequence++,
      type: "error",
      code: code as never,
      message,
    });
  }

  #presenceList() {
    return [...this.members.entries()].map(([playerId, member]) => ({
      playerId,
      sessionId: member.sessionId,
      joinedAt: Date.now(),
      host: playerId === this.hostId,
    }));
  }

  #v1Envelope(fields: { type: ServerEnvelope["type"] } & Record<string, unknown>): ServerEnvelope {
    return {
      protocolVersion: 1,
      roomId: this.roomId,
      sequence: this.v1Sequence++,
      ...fields,
    } as ServerEnvelope;
  }

  #broadcastV1(message: ServerEnvelope, skip: string[] = []): void {
    for (const [playerId, member] of this.members) {
      if (skip.includes(playerId)) continue;
      member.transport.deliver(message);
    }
  }

  #deliverV2(transport: FakeRealtimeTransport, message: RealtimeServerEnvelope): void {
    transport.deliver(message);
  }
}

export class FakeRealtimeTransport implements LokiTransport {
  #playerId = "";
  #bus?: RealtimeBus;
  #listeners = new Set<(message: unknown) => void>();
  #connectionListeners = new Set<(event: ConnectionEvent) => void>();
  #failReconnect = false;

  async authenticate(): Promise<{ playerId: string }> {
    this.#playerId = crypto.randomUUID();
    return { playerId: this.#playerId };
  }

  attachBus(bus: RealtimeBus): void {
    this.#bus = bus;
  }

  async createRoom(input: { realtimeCapable?: boolean }): Promise<JoinedRoom> {
    return this.#bus!.join(this, this.#playerId, input.realtimeCapable ?? false);
  }

  async joinRoom(input: { realtimeCapable?: boolean }): Promise<JoinedRoom> {
    return this.#bus!.join(this, this.#playerId, input.realtimeCapable ?? false);
  }

  async leaveRoom(): Promise<void> {
    this.#bus?.leave(this.#playerId);
  }

  async send(_message: ClientEnvelope): Promise<void> {
    // Only realtime traffic is exercised in this suite.
  }

  async sendRealtime(message: RealtimeClientEnvelope): Promise<void> {
    this.#bus!.sendRealtime(this.#playerId, message);
  }

  subscribe(listener: (message: unknown) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  subscribeConnection(listener: (event: ConnectionEvent) => void): () => void {
    this.#connectionListeners.add(listener);
    return () => this.#connectionListeners.delete(listener);
  }

  async reconnect(): Promise<void> {
    if (this.#failReconnect) {
      this.#failReconnect = false;
      throw new Error("reconnect failed");
    }
  }

  async close(): Promise<void> {
    this.#listeners.clear();
    this.#connectionListeners.clear();
  }

  deliver(message: unknown): void {
    for (const listener of this.#listeners) listener(message);
  }

  simulateDisconnect(): void {
    for (const listener of this.#connectionListeners) listener("disconnected");
  }

  simulateSuspend(): void {
    for (const listener of this.#connectionListeners) listener("suspended");
  }

  simulateResume(): void {
    for (const listener of this.#connectionListeners) listener("resumed");
  }

  failNextReconnect(): void {
    this.#failReconnect = true;
  }
}

export async function connectedClient(
  bus: RealtimeBus,
): Promise<{ client: LokiClient; transport: FakeRealtimeTransport }> {
  const transport = new FakeRealtimeTransport();
  transport.attachBus(bus);
  const client = new LokiClient({ projectId: crypto.randomUUID(), transport });
  await client.authenticate("token");
  return { client, transport };
}
