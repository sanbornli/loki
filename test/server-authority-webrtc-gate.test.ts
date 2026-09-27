import assert from "node:assert/strict";
import test from "node:test";
import { webrtcAllowedFrom, type ServerEnvelope } from "../packages/sdk-js/src/index.js";

// Server-authority rooms have no player host to negotiate a WebRTC star
// with (loki.js sends capabilities.realtime_webrtc: false for them; see
// runtimeCapabilities in infra/nakama/modules/loki.js). FirstPartyTransport
// must never attempt to arm a star for such a room even if the join
// metadata itself advertised webrtcCapable.

const baseSnapshot = {
  protocolVersion: 1 as const,
  roomId: "room-1",
  sequence: 1,
  type: "snapshot" as const,
  hostId: "00000000-0000-0000-0000-000000000000",
  state: {},
};

test("webrtcAllowedFrom is true when a snapshot has no capabilities block (older/host-authority runtime)", () => {
  const snapshot = { ...baseSnapshot } as ServerEnvelope;
  assert.equal(webrtcAllowedFrom(snapshot), true);
});

test("webrtcAllowedFrom is true when capabilities omits realtime_webrtc entirely", () => {
  const snapshot = { ...baseSnapshot, capabilities: { realtime_rooms: true } } as ServerEnvelope;
  assert.equal(webrtcAllowedFrom(snapshot), true);
});

test("webrtcAllowedFrom is true when capabilities explicitly advertises realtime_webrtc", () => {
  const snapshot = {
    ...baseSnapshot,
    capabilities: { realtime_rooms: true, realtime_webrtc: true },
  } as ServerEnvelope;
  assert.equal(webrtcAllowedFrom(snapshot), true);
});

test("webrtcAllowedFrom is false for a server-authority room (realtime_webrtc: false)", () => {
  const snapshot = {
    ...baseSnapshot,
    hostId: "",
    capabilities: { realtime_rooms: true, realtime_webrtc: false },
  } as ServerEnvelope;
  assert.equal(webrtcAllowedFrom(snapshot), false);
});

test("webrtcAllowedFrom defaults to true for non-snapshot envelope types", () => {
  const state = {
    protocolVersion: 1 as const,
    roomId: "room-1",
    sequence: 2,
    type: "state" as const,
    hostId: "00000000-0000-0000-0000-000000000000",
    state: {},
  } as ServerEnvelope;
  assert.equal(webrtcAllowedFrom(state), true);
});
