// A minimal host-star WebRTC data-channel manager for RealtimeRoom's
// replaceable (latest-wins) updates. Guests each hold one peer connection to
// the current host; the host holds one per connected guest. Ordered inputs,
// sync/recovery, effects, errors, and snapshot persistence/host-ACK always
// stay on the Nakama WebSocket (see FirstPartyTransport); this module only
// ever carries realtime_input (delivery "latest"), realtime_snapshot
// (host -> guests, in addition to the WebSocket copy), and
// realtime_guest_report.
//
// This module never touches the DOM lib directly: RTCPeerConnection and its
// related types are accessed through small structural interfaces so the
// sdk-js package (built under Node's tsconfig, no "dom" lib) and its
// Node-based unit tests keep compiling and passing without a real browser.
// In a browser, defaultPeerConnectionFactory() wraps the real global.

export interface IceCandidateLike {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
}

export interface SessionDescriptionLike {
  type: string;
  sdp?: string;
}

export interface DataChannelLike {
  readyState: string;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  send(data: string): void;
  close(): void;
}

export interface PeerConnectionLike {
  connectionState: string;
  ondatachannel: ((event: { channel: DataChannelLike }) => void) | null;
  onicecandidate: ((event: { candidate: IceCandidateLike | null }) => void) | null;
  onconnectionstatechange: (() => void) | null;
  createDataChannel(label: string): DataChannelLike;
  createOffer(): Promise<SessionDescriptionLike>;
  createAnswer(): Promise<SessionDescriptionLike>;
  setLocalDescription(description: SessionDescriptionLike): Promise<void>;
  setRemoteDescription(description: SessionDescriptionLike): Promise<void>;
  addIceCandidate(candidate: IceCandidateLike): Promise<void>;
  close(): void;
}

/** A STUN entry has only `urls`; a TURN entry additionally carries the short-lived `username`/`credential` minted by `loki_turn_credentials`. */
export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export type PeerConnectionFactory = (config: {
  iceServers: IceServerConfig[];
}) => PeerConnectionLike;

/** A Loki-owned, public STUN configuration. TURN entries, when available, are merged in by FirstPartyTransport from `loki_turn_credentials`; a peer that still cannot open a direct or relayed path stays on the Nakama WebSocket. */
export const DEFAULT_STUN_SERVERS: IceServerConfig[] = [
  { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] },
];

/** Feature-detects the browser global; returns undefined in Node, tests, and browsers without WebRTC support. */
export function defaultPeerConnectionFactory(): PeerConnectionFactory | undefined {
  const ctor = (globalThis as { RTCPeerConnection?: new (config: unknown) => unknown })
    .RTCPeerConnection;
  if (typeof ctor !== "function") return undefined;
  return (config) => new ctor(config) as unknown as PeerConnectionLike;
}

export type WebrtcPeerState = "connecting" | "connected" | "failed" | "closed";

export type WebrtcSignalOutbound =
  | { type: "webrtc_offer"; toId: string; sdp: string }
  | { type: "webrtc_answer"; toId: string; sdp: string }
  | {
      type: "webrtc_ice";
      toId: string;
      candidate: string;
      sdpMid?: string;
      sdpMLineIndex?: number;
    };

export type WebrtcSignalInbound = {
  type: "webrtc_offer" | "webrtc_answer" | "webrtc_ice" | "webrtc_unavailable";
  fromId?: string;
  toId?: string;
  sdp?: string;
  candidate?: string;
  sdpMid?: string;
  sdpMLineIndex?: number;
};

export interface WebrtcStarOptions {
  /** This client's own player id, used to decide host-vs-guest role. */
  playerId: string;
  /** Defaults to the browser's RTCPeerConnection when available; passing undefined disables negotiation entirely (every send falls back to the caller's WebSocket path). */
  createPeerConnection?: PeerConnectionFactory;
  iceServers?: IceServerConfig[];
  /** Sends a signaling message toward the given peer, relayed by the Nakama match; delivery is fire-and-forget. */
  sendSignal(message: WebrtcSignalOutbound): void;
  /** A JSON-decoded envelope arrived from `fromId` over an open data channel. */
  onMessage(fromId: string, data: unknown): void;
  onPeerStateChange?(peerId: string, state: WebrtcPeerState): void;
  /** How long to wait for a channel to open before giving up on that peer. Default 4000ms. */
  negotiationTimeoutMs?: number;
}

interface PeerEntry {
  pc: PeerConnectionLike;
  channel?: DataChannelLike;
  state: WebrtcPeerState;
  role: "offerer" | "answerer";
  pendingCandidates: IceCandidateLike[];
  remoteDescriptionSet: boolean;
  timeoutTimer?: ReturnType<typeof setTimeout>;
}

const DATA_CHANNEL_LABEL = "loki-rt";

/**
 * A data-channel frame is the sender's own client envelope. Nakama never
 * sees it, so it never stamps a player id, a receive time, or the labels on
 * a picture. The open channel's peer id is that player. Always overwrite
 * senderId and hostId so a peer cannot claim someone else's id. A picture's
 * number is the host's own hostSnapshotSequence, which the socket copy also
 * carries, so the guest treats the two copies as one picture.
 */
export function stampDirectLinkEnvelope(fromId: string, data: unknown, receivedAt = Date.now()): unknown {
  if (!fromId || data === null || typeof data !== "object") return data;
  const record = data as Record<string, unknown>;
  if (record.type === "realtime_input") {
    return { ...record, senderId: fromId, serverReceiveTime: receivedAt };
  }
  if (record.type === "realtime_guest_report") {
    return { ...record, senderId: fromId };
  }
  if (record.type === "realtime_snapshot") {
    const hostSnapshotSequence = record.hostSnapshotSequence;
    if (typeof hostSnapshotSequence !== "number" || !Number.isInteger(hostSnapshotSequence) || hostSnapshotSequence < 0) {
      return data;
    }
    return {
      ...record,
      hostId: fromId,
      runtimeSnapshotSequence: hostSnapshotSequence,
      serverTime: receivedAt,
    };
  }
  return data;
}

/** Host-star WebRTC data-channel manager. One instance per joined realtime room; discard and recreate on leave/rejoin. */
export class WebrtcStar {
  readonly #playerId: string;
  readonly #createPeerConnection?: PeerConnectionFactory;
  readonly #iceServers: IceServerConfig[];
  readonly #sendSignal: WebrtcStarOptions["sendSignal"];
  readonly #onMessage: WebrtcStarOptions["onMessage"];
  readonly #onPeerStateChange?: WebrtcStarOptions["onPeerStateChange"];
  readonly #negotiationTimeoutMs: number;
  readonly #peers = new Map<string, PeerEntry>();
  #hostId = "";
  #closed = false;

  constructor(options: WebrtcStarOptions) {
    this.#playerId = options.playerId;
    this.#createPeerConnection = options.createPeerConnection;
    this.#iceServers = options.iceServers ?? DEFAULT_STUN_SERVERS;
    this.#sendSignal = options.sendSignal;
    this.#onMessage = options.onMessage;
    this.#onPeerStateChange = options.onPeerStateChange;
    this.#negotiationTimeoutMs = options.negotiationTimeoutMs ?? 4_000;
  }

  /** Whether this environment can attempt WebRTC at all (browser support only; server capability is checked separately by the caller). */
  get supported(): boolean {
    return Boolean(this.#createPeerConnection);
  }

  get hostId(): string {
    return this.#hostId;
  }

  isPeerConnected(peerId: string): boolean {
    const entry = this.#peers.get(peerId);
    return Boolean(entry && entry.state === "connected" && entry.channel?.readyState === "open");
  }

  /** Number of peers with an open data channel right now (diagnostics only; never used for routing decisions). */
  get connectedPeerCount(): number {
    let count = 0;
    for (const peerId of this.#peers.keys()) {
      if (this.isPeerConnected(peerId)) count += 1;
    }
    return count;
  }

  /** Called whenever the room's known host changes (initial join, migration, reconnect). Idempotent for repeated calls with the same host. */
  setHostId(hostId: string): void {
    if (this.#closed || this.#hostId === hostId) {
      this.#hostId = hostId;
      return;
    }
    const previousHostId = this.#hostId;
    this.#hostId = hostId;
    if (!this.supported) return;
    if (this.#playerId === hostId) {
      // We just became host: any peer we held as a guest (to the old host)
      // is meaningless now; remaining guests will open fresh offers to us.
      if (previousHostId) this.#closePeer(previousHostId, "closed");
      return;
    }
    // We are a guest of a (possibly new) host: drop any stale connection to
    // the previous host and open a fresh one to the new host.
    if (previousHostId) this.#closePeer(previousHostId, "closed");
    this.#openAsGuest(hostId);
  }

  /** Sends a payload to the current host's data channel if it is open. Returns false when the caller should fall back to the socket instead. */
  sendToHost(data: unknown): boolean {
    if (!this.#hostId || this.#playerId === this.#hostId) return false;
    return this.#sendOverChannel(this.#hostId, data);
  }

  /** Host-only: best-effort fan-out to every connected guest. Does not report per-peer failures; the caller is expected to also send the same payload over the WebSocket for persistence/ACK and for guests without an open channel. */
  broadcastAsHost(data: unknown): void {
    for (const peerId of this.#peers.keys()) this.#sendOverChannel(peerId, data);
  }

  #sendOverChannel(peerId: string, data: unknown): boolean {
    const entry = this.#peers.get(peerId);
    if (!entry || !entry.channel || entry.channel.readyState !== "open") return false;
    try {
      entry.channel.send(JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  /** Routes an inbound signaling envelope relayed by Loki. */
  handleSignal(message: WebrtcSignalInbound): void {
    if (this.#closed || !this.supported) return;
    if (message.type === "webrtc_unavailable") {
      if (message.toId) this.#closePeer(message.toId, "failed");
      return;
    }
    const peerId = message.fromId;
    if (!peerId) return;
    if (message.type === "webrtc_offer") {
      void this.#handleOffer(peerId, message.sdp ?? "");
      return;
    }
    if (message.type === "webrtc_answer") {
      void this.#handleAnswer(peerId, message.sdp ?? "");
      return;
    }
    if (message.type === "webrtc_ice") {
      void this.#handleIce(peerId, {
        candidate: message.candidate ?? "",
        sdpMid: message.sdpMid,
        sdpMLineIndex: message.sdpMLineIndex,
      });
    }
  }

  #openAsGuest(hostId: string): void {
    if (!this.#createPeerConnection) return;
    const pc = this.#createPeerConnection({ iceServers: this.#iceServers });
    const entry: PeerEntry = {
      pc,
      state: "connecting",
      role: "offerer",
      pendingCandidates: [],
      remoteDescriptionSet: false,
    };
    this.#peers.set(hostId, entry);
    this.#wirePeer(hostId, entry);
    const channel = pc.createDataChannel(DATA_CHANNEL_LABEL);
    this.#wireChannel(hostId, entry, channel);
    void (async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        this.#sendSignal({ type: "webrtc_offer", toId: hostId, sdp: offer.sdp ?? "" });
      } catch {
        this.#failPeer(hostId);
      }
    })();
  }

  async #handleOffer(peerId: string, sdp: string): Promise<void> {
    if (!this.#createPeerConnection) return;
    // Only the host answers offers; a guest never receives one.
    if (this.#playerId !== this.#hostId) return;
    this.#closePeer(peerId, "closed");
    const pc = this.#createPeerConnection({ iceServers: this.#iceServers });
    const entry: PeerEntry = {
      pc,
      state: "connecting",
      role: "answerer",
      pendingCandidates: [],
      remoteDescriptionSet: false,
    };
    this.#peers.set(peerId, entry);
    this.#wirePeer(peerId, entry);
    try {
      await pc.setRemoteDescription({ type: "offer", sdp });
      entry.remoteDescriptionSet = true;
      await this.#drainPendingCandidates(entry);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.#sendSignal({ type: "webrtc_answer", toId: peerId, sdp: answer.sdp ?? "" });
    } catch {
      this.#failPeer(peerId);
    }
  }

  async #handleAnswer(peerId: string, sdp: string): Promise<void> {
    const entry = this.#peers.get(peerId);
    if (!entry || entry.role !== "offerer") return;
    try {
      await entry.pc.setRemoteDescription({ type: "answer", sdp });
      entry.remoteDescriptionSet = true;
      await this.#drainPendingCandidates(entry);
    } catch {
      this.#failPeer(peerId);
    }
  }

  async #handleIce(peerId: string, candidate: IceCandidateLike): Promise<void> {
    const entry = this.#peers.get(peerId);
    if (!entry) return;
    if (!entry.remoteDescriptionSet) {
      entry.pendingCandidates.push(candidate);
      return;
    }
    try {
      await entry.pc.addIceCandidate(candidate);
    } catch {
      // A stray/late candidate is not fatal; ICE can still succeed without it.
    }
  }

  async #drainPendingCandidates(entry: PeerEntry): Promise<void> {
    const pending = entry.pendingCandidates;
    entry.pendingCandidates = [];
    for (const candidate of pending) {
      try {
        await entry.pc.addIceCandidate(candidate);
      } catch {
        // Ignore; see #handleIce.
      }
    }
  }

  #wirePeer(peerId: string, entry: PeerEntry): void {
    entry.pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      this.#sendSignal({
        type: "webrtc_ice",
        toId: peerId,
        candidate: event.candidate.candidate,
        sdpMid: event.candidate.sdpMid ?? undefined,
        sdpMLineIndex: event.candidate.sdpMLineIndex ?? undefined,
      });
    };
    entry.pc.onconnectionstatechange = () => {
      const state = entry.pc.connectionState;
      if (state === "failed" || state === "closed" || state === "disconnected") {
        this.#failPeer(peerId);
      }
    };
    entry.pc.ondatachannel = (event) => {
      this.#wireChannel(peerId, entry, event.channel);
    };
    entry.timeoutTimer = setTimeout(() => {
      if (entry.state !== "connected") this.#failPeer(peerId);
    }, this.#negotiationTimeoutMs);
  }

  #wireChannel(peerId: string, entry: PeerEntry, channel: DataChannelLike): void {
    entry.channel = channel;
    channel.onopen = () => {
      if (this.#peers.get(peerId) !== entry) return;
      entry.state = "connected";
      if (entry.timeoutTimer) clearTimeout(entry.timeoutTimer);
      this.#onPeerStateChange?.(peerId, "connected");
    };
    channel.onclose = () => this.#failPeer(peerId);
    channel.onerror = () => this.#failPeer(peerId);
    channel.onmessage = (event) => {
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        this.#onMessage(peerId, data);
      } catch {
        // Malformed data-channel payload; drop it rather than throw inside
        // the caller's message-dispatch path.
      }
    };
  }

  #failPeer(peerId: string): void {
    this.#closePeer(peerId, "failed");
  }

  #closePeer(peerId: string, state: WebrtcPeerState): void {
    const entry = this.#peers.get(peerId);
    if (!entry) return;
    this.#peers.delete(peerId);
    if (entry.timeoutTimer) clearTimeout(entry.timeoutTimer);
    try {
      entry.channel?.close();
    } catch {
      // Ignore.
    }
    try {
      entry.pc.close();
    } catch {
      // Ignore.
    }
    if (entry.state !== state) this.#onPeerStateChange?.(peerId, state);
  }

  /** Closes every peer. Call on room leave or transport close; create a new WebrtcStar for the next room. */
  closeAll(): void {
    this.#closed = true;
    for (const peerId of [...this.#peers.keys()]) this.#closePeer(peerId, "closed");
    this.#hostId = "";
  }
}
