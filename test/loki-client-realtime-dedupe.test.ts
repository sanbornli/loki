import assert from "node:assert/strict";
import test from "node:test";
import {
  LokiClient,
  type ConnectionEvent,
  type JoinedRoom,
  type LokiTransport,
} from "../packages/sdk-js/src/index.js";
import {
  PROTOCOL_VERSION,
  REALTIME_PROTOCOL_VERSION,
  type RealtimeServerEnvelope,
} from "../packages/protocol/src/index.js";

// A minimal fake transport: just enough to authenticate, create one room,
// and let the test push raw server/realtime envelopes straight at
// LokiClient's subscribe callback, exactly like FirstPartyTransport does
// after decoding either a WebSocket frame or a WebRTC data-channel frame.
class FakeTransport implements LokiTransport {
  #listener?: (message: unknown) => void;
  #roomId = "";

  async authenticate(): Promise<{ playerId: string }> {
    return { playerId: crypto.randomUUID() };
  }

  async createRoom(): Promise<JoinedRoom> {
    this.#roomId = crypto.randomUUID();
    return {
      roomId: this.#roomId,
      inviteCode: "000000",
      snapshot: {
        protocolVersion: PROTOCOL_VERSION,
        roomId: this.#roomId,
        sequence: 0,
        type: "snapshot",
        hostId: crypto.randomUUID(),
        state: {},
        stateVersion: 0,
      },
    };
  }

  async joinRoom(): Promise<JoinedRoom> {
    throw new Error("unused in this test");
  }

  async send(): Promise<void> {}
  async sendRealtime(): Promise<void> {}

  subscribe(listener: (message: unknown) => void): () => void {
    this.#listener = listener;
    return () => {
      this.#listener = undefined;
    };
  }

  subscribeConnection(_listener: (event: ConnectionEvent) => void): () => void {
    return () => {};
  }

  async close(): Promise<void> {}

  // Test-only helper standing in for what FirstPartyTransport's
  // onmatchdata/star callbacks do: hand a decoded envelope to the same
  // generic listener regardless of which physical channel it arrived on.
  deliver(message: unknown): void {
    this.#listener?.(message);
  }

  get roomId(): string {
    return this.#roomId;
  }
}

const base = (transport: FakeTransport, sequence: number) => ({
  protocolVersion: REALTIME_PROTOCOL_VERSION,
  roomId: transport.roomId,
  sequence,
});

test("a data-channel snapshot with a lower transport sequence is still delivered, and dual delivery is deduped", async () => {
  const transport = new FakeTransport();
  const client = new LokiClient({ projectId: crypto.randomUUID(), transport });
  await client.authenticate("token");
  await client.createRoom();

  const delivered: RealtimeServerEnvelope[] = [];
  client.onRealtimeMessage((message) => delivered.push(message));

  const hostId = crypto.randomUUID();
  const snapshotFields = {
    type: "realtime_snapshot" as const,
    hostId,
    authorityEpoch: 0,
    roundSequence: 1,
    simulationTick: 1,
    hostSendTime: 1,
    serverTime: 1,
    state: { tick: 1 },
  };

  // A WebSocket frame arrives first with transport sequence 5.
  transport.deliver({
    ...base(transport, 5),
    ...snapshotFields,
    runtimeSnapshotSequence: 10,
  });
  assert.equal(delivered.length, 1);

  // A legitimately newer snapshot (runtimeSnapshotSequence 11) arrives over
  // the data channel with a *lower* transport-assigned sequence (3) than
  // the WebSocket frame already processed. The old monotonic-sequence
  // watermark would have dropped this; the content-keyed dedupe must not.
  transport.deliver({
    ...base(transport, 3),
    ...snapshotFields,
    runtimeSnapshotSequence: 11,
  });
  assert.equal(delivered.length, 2, "a lower-sequence but newer snapshot must still be delivered");

  // The exact same snapshot (runtimeSnapshotSequence 11) is now dual-
  // delivered a second time (e.g. the WebSocket copy Loki always also
  // sends). It must be delivered exactly once, not twice.
  transport.deliver({
    ...base(transport, 6),
    ...snapshotFields,
    runtimeSnapshotSequence: 11,
  });
  assert.equal(delivered.length, 2, "a dual-delivered duplicate snapshot must not be redelivered");

  // A message type with no content-derived dedupe key (error) still uses
  // the plain monotonic-sequence guard: a lower sequence than the highest
  // sequence already seen is dropped.
  transport.deliver({
    ...base(transport, 4),
    type: "error",
    code: "RATE_LIMITED",
    message: "stale error",
  });
  assert.equal(delivered.length, 2, "a stale error without a dedupe key stays dropped");

  transport.deliver({
    ...base(transport, 7),
    type: "error",
    code: "RATE_LIMITED",
    message: "fresh error",
  });
  assert.equal(delivered.length, 3, "a fresh error above the watermark is still delivered");
});
