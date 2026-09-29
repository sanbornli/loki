import assert from "node:assert/strict";
import test from "node:test";
import { RealtimeServerEnvelopeSchema } from "../packages/protocol/src/index.js";
import {
  WebrtcStar,
  stampDirectLinkEnvelope,
  type DataChannelLike,
  type IceCandidateLike,
  type PeerConnectionLike,
  type SessionDescriptionLike,
  type WebrtcPeerState,
  type WebrtcSignalOutbound,
} from "../packages/sdk-js/src/webrtc-star.js";

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

class FakeChannel implements DataChannelLike {
  readyState = "connecting";
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  sent: string[] = [];

  send(data: string): void {
    if (this.readyState !== "open") throw new Error("channel not open");
    this.sent.push(data);
  }

  close(): void {
    if (this.readyState === "closed") return;
    this.readyState = "closed";
    this.onclose?.();
  }

  open(): void {
    this.readyState = "open";
    this.onopen?.();
  }

  deliver(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

class FakePeerConnection implements PeerConnectionLike {
  connectionState = "new";
  ondatachannel: ((event: { channel: DataChannelLike }) => void) | null = null;
  onicecandidate: ((event: { candidate: IceCandidateLike | null }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  createdChannel?: FakeChannel;
  closed = false;
  failNegotiation = false;

  createDataChannel(_label: string): DataChannelLike {
    const channel = new FakeChannel();
    this.createdChannel = channel;
    return channel;
  }

  async createOffer(): Promise<SessionDescriptionLike> {
    if (this.failNegotiation) throw new Error("offer failed");
    return { type: "offer", sdp: "offer-sdp" };
  }

  async createAnswer(): Promise<SessionDescriptionLike> {
    if (this.failNegotiation) throw new Error("answer failed");
    return { type: "answer", sdp: "answer-sdp" };
  }

  async setLocalDescription(): Promise<void> {}
  async setRemoteDescription(): Promise<void> {}
  async addIceCandidate(): Promise<void> {}

  close(): void {
    this.closed = true;
    this.connectionState = "closed";
  }

  // Simulates the remote side receiving a data channel once negotiation
  // completes -- a real browser fires this automatically for the answerer.
  deliverIncomingChannel(channel: DataChannelLike): void {
    this.ondatachannel?.({ channel });
  }
}

function createStar(overrides: {
  playerId: string;
  createPeerConnection?: () => PeerConnectionLike;
  onMessage?: (fromId: string, data: unknown) => void;
  onPeerStateChange?: (peerId: string, state: WebrtcPeerState) => void;
  negotiationTimeoutMs?: number;
}): { star: WebrtcStar; sent: WebrtcSignalOutbound[]; peers: FakePeerConnection[] } {
  const sent: WebrtcSignalOutbound[] = [];
  const peers: FakePeerConnection[] = [];
  const star = new WebrtcStar({
    playerId: overrides.playerId,
    createPeerConnection:
      overrides.createPeerConnection ??
      (() => {
        const pc = new FakePeerConnection();
        peers.push(pc);
        return pc;
      }),
    sendSignal: (message) => sent.push(message),
    onMessage: overrides.onMessage ?? (() => {}),
    onPeerStateChange: overrides.onPeerStateChange,
    negotiationTimeoutMs: overrides.negotiationTimeoutMs,
  });
  return { star, sent, peers };
}

test("guest offers the host, completes negotiation on answer+ice, and sends over the open channel", async () => {
  const { star, sent, peers } = createStar({ playerId: "guest" });
  star.setHostId("host");
  await flush();
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.type, "webrtc_offer");
  assert.equal(sent[0]!.toId, "host");
  assert.equal(peers.length, 1);
  const pc = peers[0]!;

  star.handleSignal({ type: "webrtc_answer", fromId: "host", sdp: "answer-sdp" });
  await flush();
  star.handleSignal({ type: "webrtc_ice", fromId: "host", candidate: "candidate-1" });
  await flush();

  assert.equal(star.isPeerConnected("host"), false, "not connected until the channel opens");
  pc.createdChannel!.open();
  assert.equal(star.isPeerConnected("host"), true);

  const delivered = star.sendToHost({ kind: "input", value: 1 });
  assert.equal(delivered, true);
  assert.deepEqual(JSON.parse(pc.createdChannel!.sent[0]!), { kind: "input", value: 1 });
});

test("host answers an incoming offer and exposes the resulting channel via ondatachannel", async () => {
  const { star, sent, peers } = createStar({ playerId: "host" });
  star.setHostId("host");
  assert.equal(sent.length, 0, "the host never offers first");

  star.handleSignal({ type: "webrtc_offer", fromId: "guest", sdp: "offer-sdp" });
  await flush();
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.type, "webrtc_answer");
  assert.equal(sent[0]!.toId, "guest");
  assert.equal(peers.length, 1);

  const incoming = new FakeChannel();
  peers[0]!.deliverIncomingChannel(incoming);
  incoming.open();
  assert.equal(star.isPeerConnected("guest"), true);
});

test("a direct-link input is stamped with the peer id, not an id the guest wrote", () => {
  const guestId = "guest-player";
  const clientEnvelope = {
    protocolVersion: 2,
    roomId: "room-1",
    sequence: 4,
    type: "realtime_input",
    roundSequence: 1,
    inputSequence: 3,
    targetTick: 10,
    delivery: "latest",
    clientSendTime: 50,
    payload: { throttle: 1 },
    senderId: "someone-else",
  };
  const stamped = stampDirectLinkEnvelope(guestId, clientEnvelope, 1_700_000_000_000);
  const parsed = RealtimeServerEnvelopeSchema.parse(stamped);
  assert.equal(parsed.type, "realtime_input");
  if (parsed.type !== "realtime_input") return;
  assert.equal(parsed.senderId, guestId);
  assert.equal(parsed.serverReceiveTime, 1_700_000_000_000);
  assert.equal(parsed.payload && (parsed.payload as { throttle: number }).throttle, 1);
});

test("a direct-link guest report is stamped with the peer id", () => {
  const stamped = stampDirectLinkEnvelope("guest-player", {
    protocolVersion: 2,
    roomId: "room-1",
    sequence: 1,
    type: "realtime_guest_report",
    roundSequence: 1,
    sequenceGaps: 0,
    extrapolatedFrameRatio: 0,
    senderId: "someone-else",
  });
  const parsed = RealtimeServerEnvelopeSchema.parse(stamped);
  assert.equal(parsed.type, "realtime_guest_report");
  if (parsed.type !== "realtime_guest_report") return;
  assert.equal(parsed.senderId, "guest-player");
});

test("a direct-link picture is stamped with the host id and the host's own picture number", () => {
  const stamped = stampDirectLinkEnvelope(
    "host-player",
    {
      protocolVersion: 2,
      roomId: "room-1",
      sequence: 4,
      type: "realtime_snapshot",
      authorityEpoch: 0,
      roundSequence: 1,
      simulationTick: 10,
      hostSnapshotSequence: 7,
      hostSendTime: 50,
      processedInputCursors: {},
      state: { ball: 1 },
      hostId: "someone-else",
      runtimeSnapshotSequence: 99,
    },
    1_700_000_000_000,
  );
  const parsed = RealtimeServerEnvelopeSchema.parse(stamped);
  assert.equal(parsed.type, "realtime_snapshot");
  if (parsed.type !== "realtime_snapshot") return;
  assert.equal(parsed.hostId, "host-player");
  assert.equal(parsed.runtimeSnapshotSequence, 7);
  assert.equal(parsed.hostSnapshotSequence, 7);
  assert.equal(parsed.serverTime, 1_700_000_000_000);
});

test("a direct-link picture without a host picture number is left unchanged", () => {
  const snapshot = { type: "realtime_snapshot", state: { ball: 1 } };
  assert.equal(stampDirectLinkEnvelope("host-player", snapshot), snapshot);
});

test("delivered data-channel frames reach onMessage keyed by sender", async () => {
  const received: Array<{ fromId: string; data: unknown }> = [];
  const { star, peers } = createStar({
    playerId: "host",
    onMessage: (fromId, data) => received.push({ fromId, data }),
  });
  star.setHostId("host");
  star.handleSignal({ type: "webrtc_offer", fromId: "guest", sdp: "offer-sdp" });
  await flush();
  const incoming = new FakeChannel();
  peers[0]!.deliverIncomingChannel(incoming);
  incoming.open();
  incoming.deliver({ hello: "guest" });
  assert.deepEqual(received, [{ fromId: "guest", data: { hello: "guest" } }]);
});

test("webrtc_unavailable closes the pending peer so sendToHost falls back to false", async () => {
  const { star } = createStar({ playerId: "guest" });
  star.setHostId("host");
  await flush();
  star.handleSignal({ type: "webrtc_unavailable", toId: "host" });
  assert.equal(star.isPeerConnected("host"), false);
  assert.equal(star.sendToHost({ a: 1 }), false);
});

test("a peer that never opens within the negotiation timeout is marked failed", async () => {
  const stateChanges: Array<[string, WebrtcPeerState]> = [];
  const { star } = createStar({
    playerId: "guest",
    negotiationTimeoutMs: 5,
    onPeerStateChange: (peerId, state) => stateChanges.push([peerId, state]),
  });
  star.setHostId("host");
  await flush();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(star.isPeerConnected("host"), false);
  assert.ok(stateChanges.some(([peerId, state]) => peerId === "host" && state === "failed"));
});

test("host migration tears down the stale peer and opens a fresh one to the new host", async () => {
  const { star, peers } = createStar({ playerId: "guest" });
  star.setHostId("host-a");
  await flush();
  const first = peers[0]!;
  first.createdChannel!.open();
  assert.equal(star.isPeerConnected("host-a"), true);

  star.setHostId("host-b");
  await flush();
  assert.equal(first.closed, true, "the stale peer to the old host must be closed");
  assert.equal(star.isPeerConnected("host-a"), false);
  assert.equal(peers.length, 2, "a fresh offer opens a new peer connection to the new host");
  peers[1]!.createdChannel!.open();
  assert.equal(star.isPeerConnected("host-b"), true);
});

test("becoming host closes any prior guest peer without opening a new one", async () => {
  const { star, peers } = createStar({ playerId: "guest" });
  star.setHostId("host-a");
  await flush();
  peers[0]!.createdChannel!.open();
  assert.equal(star.isPeerConnected("host-a"), true);

  star.setHostId("guest"); // this client just became the host
  assert.equal(peers[0]!.closed, true);
  assert.equal(peers.length, 1, "the newly promoted host does not offer to itself");
});

test("broadcastAsHost fans out only to peers with an open channel", async () => {
  const { star, peers } = createStar({ playerId: "host" });
  star.setHostId("host");
  star.handleSignal({ type: "webrtc_offer", fromId: "guest-a", sdp: "offer-a" });
  star.handleSignal({ type: "webrtc_offer", fromId: "guest-b", sdp: "offer-b" });
  await flush();
  assert.equal(peers.length, 2);

  const channelA = new FakeChannel();
  const channelB = new FakeChannel();
  peers[0]!.deliverIncomingChannel(channelA);
  peers[1]!.deliverIncomingChannel(channelB);
  channelA.open();
  // channelB is deliberately left unopened, simulating a guest whose
  // negotiation stalled; it must not receive the broadcast.
  assert.equal(star.isPeerConnected("guest-a"), true);
  assert.equal(star.isPeerConnected("guest-b"), false);

  star.broadcastAsHost({ tick: 1 });
  assert.deepEqual(channelA.sent.map((raw) => JSON.parse(raw)), [{ tick: 1 }]);
  assert.deepEqual(channelB.sent, []);
});

test("setHostId is idempotent for repeated calls with the same host", async () => {
  const { star, peers, sent } = createStar({ playerId: "guest" });
  star.setHostId("host");
  await flush();
  assert.equal(peers.length, 1);
  star.setHostId("host");
  await flush();
  assert.equal(peers.length, 1, "a repeated identical host id must not reopen negotiation");
  assert.equal(sent.length, 1);
});

test("an environment without WebRTC support never negotiates and every send falls back", async () => {
  const received: unknown[] = [];
  const star = new WebrtcStar({
    playerId: "guest",
    createPeerConnection: undefined,
    sendSignal: () => received.push("signal-should-not-be-sent"),
    onMessage: () => {},
  });
  assert.equal(star.supported, false);
  star.setHostId("host");
  await flush();
  star.handleSignal({ type: "webrtc_offer", fromId: "host", sdp: "x" });
  assert.equal(star.sendToHost({ a: 1 }), false);
  assert.equal(received.length, 0);
});

test("closeAll tears down every peer and clears the known host", async () => {
  const { star, peers } = createStar({ playerId: "guest" });
  star.setHostId("host");
  await flush();
  peers[0]!.createdChannel!.open();
  assert.equal(star.isPeerConnected("host"), true);
  star.closeAll();
  assert.equal(peers[0]!.closed, true);
  assert.equal(star.hostId, "");
  assert.equal(star.isPeerConnected("host"), false);
});

test("a TURN entry with username/credential is passed through to RTCPeerConnection unchanged", async () => {
  const seenConfigs: { iceServers: { urls: string | string[]; username?: string; credential?: string }[] }[] = [];
  const star = new WebrtcStar({
    playerId: "guest",
    iceServers: [
      { urls: ["stun:stun.cloudflare.com:3478"] },
      {
        urls: ["turn:turn.lokiplay.cc:3478", "turns:turn.lokiplay.cc:5349"],
        username: "1700000300",
        credential: "base64-hmac-credential",
      },
    ],
    createPeerConnection: (config) => {
      seenConfigs.push(config);
      return new FakePeerConnection();
    },
    sendSignal: () => {},
    onMessage: () => {},
  });
  star.setHostId("host");
  await flush();
  assert.equal(seenConfigs.length, 1);
  assert.deepEqual(seenConfigs[0]!.iceServers, [
    { urls: ["stun:stun.cloudflare.com:3478"] },
    {
      urls: ["turn:turn.lokiplay.cc:3478", "turns:turn.lokiplay.cc:5349"],
      username: "1700000300",
      credential: "base64-hmac-credential",
    },
  ]);
});
