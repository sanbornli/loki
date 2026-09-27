import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_STUN_SERVERS,
  mergeIceServers,
  parseTurnCredentials,
  turnCredentialsStale,
  type IceServerConfig,
} from "../packages/sdk-js/src/index.js";

test("mergeIceServers appends TURN entries after the base STUN set", () => {
  const turn: IceServerConfig[] = [
    { urls: ["turn:turn.lokiplay.cc:3478"], username: "1700000300", credential: "abc123==" },
  ];
  assert.deepEqual(mergeIceServers(undefined, turn), [...DEFAULT_STUN_SERVERS, ...turn]);
  const custom: IceServerConfig[] = [{ urls: ["stun:custom.example:3478"] }];
  assert.deepEqual(mergeIceServers(custom, turn), [...custom, ...turn]);
});

test("mergeIceServers returns exactly the base set when there are no TURN entries", () => {
  assert.deepEqual(mergeIceServers(undefined, []), DEFAULT_STUN_SERVERS);
  const custom: IceServerConfig[] = [{ urls: ["stun:custom.example:3478"] }];
  assert.equal(mergeIceServers(custom, []), custom);
});

test("parseTurnCredentials turns a full RPC result into one ICE server and a refresh time before actual TTL expiry", () => {
  const now = 1_700_000_000_000;
  const parsed = parseTurnCredentials(
    {
      urls: ["turn:turn.lokiplay.cc:3478", "turns:turn.lokiplay.cc:5349"],
      username: "1700000300",
      credential: "base64-hmac-credential",
      ttlSeconds: 300,
    },
    now,
  );
  assert.deepEqual(parsed.servers, [
    {
      urls: ["turn:turn.lokiplay.cc:3478", "turns:turn.lokiplay.cc:5349"],
      username: "1700000300",
      credential: "base64-hmac-credential",
    },
  ]);
  // Refreshes 30s before the credential's own TTL, never exactly at expiry.
  assert.equal(parsed.expiresAtMs, now + (300 - 30) * 1_000);
});

test("parseTurnCredentials returns no servers for an empty (STUN-only) result", () => {
  const now = 1_700_000_000_000;
  assert.deepEqual(parseTurnCredentials({ urls: [], username: "", credential: "", ttlSeconds: 0 }, now), {
    servers: [],
    expiresAtMs: now,
  });
});

test("parseTurnCredentials treats a partial result (old Nakama module, missing fields) as STUN-only", () => {
  const now = 1_700_000_000_000;
  assert.deepEqual(parseTurnCredentials({}, now), { servers: [], expiresAtMs: now });
  assert.deepEqual(parseTurnCredentials({ urls: ["turn:x:3478"] }, now).servers, []);
  assert.deepEqual(parseTurnCredentials({ username: "1", credential: "c" }, now).servers, []);
});

test("parseTurnCredentials never produces a refresh time before now, even with a tiny ttlSeconds", () => {
  const now = 1_700_000_000_000;
  const parsed = parseTurnCredentials(
    { urls: ["turn:x:3478"], username: "1", credential: "c", ttlSeconds: 5 },
    now,
  );
  assert.equal(parsed.expiresAtMs, now);
});

test("turnCredentialsStale is true once now reaches the recorded expiry, and false before it", () => {
  assert.equal(turnCredentialsStale(1_000, 999), false);
  assert.equal(turnCredentialsStale(1_000, 1_000), true);
  assert.equal(turnCredentialsStale(1_000, 1_001), true);
  // The initial, never-fetched state (#turnExpiresAtMs = 0) is always stale.
  assert.equal(turnCredentialsStale(0, Date.now()), true);
});
