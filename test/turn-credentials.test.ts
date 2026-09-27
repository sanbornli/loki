import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

// loki.js is a standalone Nakama runtime script (no module.exports); it is
// evaluated here in an isolated vm context so its pure, dependency-free
// helpers (hmacSha1Base64, rpcTurnCredentials, ...) can be exercised
// directly against Node's own crypto module as ground truth, without
// needing a live Nakama server. This never invokes InitModule and never
// touches `nk`/`ctx`/`dispatcher` globals the file assumes Nakama provides.
async function loadLokiRuntime(): Promise<vm.Context> {
  const source = await readFile(
    new URL("../infra/nakama/modules/loki.js", import.meta.url),
    "utf8",
  );
  const context = vm.createContext({ Date, Math, JSON, console });
  vm.runInContext(source, context, { filename: "loki.js" });
  return context;
}

test("hmacSha1Base64 matches Node's crypto HMAC-SHA1 for short, long, and multi-byte inputs", async () => {
  const context = await loadLokiRuntime();
  const cases: Array<[string, string]> = [
    ["s", "m"],
    ["", ""],
    ["typical-32-byte-random-turn-secret-value", "1700000300"],
    // Longer than SHA-1's 64-byte block size, exercising the key-hashing branch.
    ["k".repeat(100), "1700000300"],
    // An astral-plane emoji is a UTF-16 surrogate pair; this proves the
    // encoder combines it into one 4-byte UTF-8 sequence like Node does.
    ["utf8-\u{1F642}-secret", "1700000300"],
  ];
  for (const [secret, message] of cases) {
    const expected = createHmac("sha1", secret).update(message, "utf8").digest("base64");
    assert.equal(context.hmacSha1Base64(secret, message), expected, `secret=${secret}`);
  }
});

test("loki_turn_credentials mints a coturn-compatible HMAC-SHA1 credential", async () => {
  const context = await loadLokiRuntime();
  const ctx = {
    userId: "player-1",
    env: {
      LOKI_TURN_SECRET: "test-turn-secret",
      LOKI_TURN_URLS: "turn:turn.lokiplay.cc:3478,turns:turn.lokiplay.cc:5349",
    },
  };
  const result = JSON.parse(context.rpcTurnCredentials(ctx, console, {}));
  assert.equal(result.ok, true);
  assert.equal(result.code, "OK");
  assert.deepEqual(result.urls, [
    "turn:turn.lokiplay.cc:3478",
    "turns:turn.lokiplay.cc:5349",
  ]);
  assert.equal(result.ttlSeconds, context.TURN_CREDENTIAL_TTL_SECONDS);
  assert.match(result.username, /^\d+$/);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiry = Number(result.username);
  assert.ok(expiry > nowSeconds, "username should be a future unix expiry");
  assert.ok(expiry <= nowSeconds + context.TURN_CREDENTIAL_TTL_SECONDS + 5);
  const expectedCredential = createHmac("sha1", "test-turn-secret")
    .update(result.username, "utf8")
    .digest("base64");
  assert.equal(result.credential, expectedCredential);
});

test("loki_turn_credentials returns an empty, STUN-only credential set when the secret is unset", async () => {
  const context = await loadLokiRuntime();
  const result = JSON.parse(
    context.rpcTurnCredentials({ userId: "player-1", env: {} }, console, {}),
  );
  assert.deepEqual(result, {
    ok: true,
    code: "OK",
    urls: [],
    username: "",
    credential: "",
    ttlSeconds: 0,
  });
});

test("loki_turn_credentials returns STUN-only when the secret is set but no URLs are configured", async () => {
  const context = await loadLokiRuntime();
  const result = JSON.parse(
    context.rpcTurnCredentials(
      { userId: "player-1", env: { LOKI_TURN_SECRET: "s" } },
      console,
      {},
    ),
  );
  assert.deepEqual(result.urls, []);
  assert.equal(result.credential, "");
});

test("loki_turn_credentials trims and drops empty entries from a comma-separated LOKI_TURN_URLS", async () => {
  const context = await loadLokiRuntime();
  const result = JSON.parse(
    context.rpcTurnCredentials(
      {
        userId: "player-1",
        env: {
          LOKI_TURN_SECRET: "s",
          LOKI_TURN_URLS: " turn:turn.lokiplay.cc:3478 ,, turns:turn.lokiplay.cc:5349,",
        },
      },
      console,
      {},
    ),
  );
  assert.deepEqual(result.urls, [
    "turn:turn.lokiplay.cc:3478",
    "turns:turn.lokiplay.cc:5349",
  ]);
});

test("loki_turn_credentials rejects an unauthenticated caller", async () => {
  const context = await loadLokiRuntime();
  assert.throws(
    () => context.rpcTurnCredentials({ env: {} }, console, {}),
    /UNAUTHORIZED/,
  );
});
