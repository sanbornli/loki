import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  HostAuthoritativeRoom,
  IsolatedRulesRunner,
  NakamaRunnerAdapter,
  SharedNakamaPrototype,
  createSandboxLaunch,
  decodeEnvelope,
  evaluateWasm,
  extractScoreRule,
  validateBridgeMessage,
  type ClientKind,
  type SessionClaims,
} from "../src/prototypes.js";

const claims = (
  playerId: string,
  projectId = "game-a",
  client: ClientKind = "javascript",
): SessionClaims => ({ playerId, projectId, client });

test("shared infrastructure derives tenant from the trusted session", () => {
  const nakama = new SharedNakamaPrototype();
  const a1 = nakama.issueSession(claims("a1"));
  const a2 = nakama.issueSession(claims("a2", "game-a", "swift"));
  const b1 = nakama.issueSession(claims("b1", "game-b", "kotlin"));
  assert.equal(nakama.enqueue(a1), undefined);
  assert.equal(nakama.enqueue(b1), undefined);
  assert.deepEqual(
    nakama.enqueue(a2)?.map((entry) => entry.playerId),
    ["a1", "a2"],
  );
  assert.throws(
    () =>
      decodeEnvelope(
        JSON.stringify({
          version: 1,
          projectId: "game-b",
          roomId: "room",
          sequence: 1,
          type: "action",
          payload: {},
        }),
        "game-a",
      ),
    /cross-tenant/,
  );
});

test("host room supports 16 players, stale rejection, late join and migration", () => {
  const room = new HostAuthoritativeRoom("room-1", "game-a", { tick: 0 });
  for (let index = 0; index < 16; index += 1) room.join(claims(`p${index}`));
  assert.equal(room.snapshot().members.length, 16);
  room.update(claims("p0"), 0, { tick: 1 });
  assert.throws(() => room.update(claims("p0"), 0, { tick: 2 }), /stale/);
  assert.equal(room.join(claims("late")).state.tick, 1);
  const migrated = room.leave(claims("p0"));
  assert.equal(migrated?.hostId, "p1");
  assert.throws(() => room.join(claims("intruder", "game-b")), /tenant/);
  for (let index = 1; index < 16; index += 1) room.leave(claims(`p${index}`));
  assert.equal(room.leave(claims("late")), undefined);
  assert.equal(room.empty, true);
});

test("browser launch is a separate origin with deny-by-default networking", () => {
  const launch = createSandboxLaunch("game-a", "sha-abc123");
  assert.match(launch.gameOrigin, /^https:\/\/game-a\.games\./);
  assert.match(launch.headers["content-security-policy"]!, /connect-src 'none'/);
  assert.doesNotMatch(launch.iframeSandbox, /allow-same-origin/);
  assert.doesNotMatch(launch.iframeSandbox, /allow-forms|allow-popups/);
  const message = {
    version: 1,
    projectId: "game-a",
    roomId: "room",
    sequence: 1,
    type: "action",
    payload: {},
  };
  assert.equal(
    validateBridgeMessage("https://shell.loki.invalid", "https://shell.loki.invalid", "game-a", message)
      .projectId,
    "game-a",
  );
  assert.throws(
    () =>
      validateBridgeMessage(
        "https://evil.invalid",
        "https://shell.loki.invalid",
        "game-a",
        message,
      ),
    /untrusted/,
  );
});

test("four clients carry the same protocol contract without Nakama types", async () => {
  for (const file of [
    "clients/javascript/client.ts",
    "clients/swift/Sources/LokiSDK/LokiClient.swift",
    "clients/kotlin/src/main/kotlin/play/loki/sdk/LokiClient.kt",
    "clients/unity/Runtime/LokiClient.cs",
  ]) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    for (const operation of ["authenticate", "joinRoom", "sendAction"]) {
      assert.match(source, new RegExp(operation, "i"));
    }
    assert.doesNotMatch(source, /Nakama|nakama/);
  }
});

test("rules are deterministic and infinite loops are terminated", async () => {
  const runner = new IsolatedRulesRunner(200, 16);
  const rules = {
    projectId: "game-a",
    version: "1",
    source:
      "(state, action, api) => ({ state: { value: state.value + action.amount, roll: api.random(), tick: api.now() } })",
  };
  const left = await runner.execute(rules, { value: 0 }, { amount: 2 }, 7, 1);
  const right = await runner.execute(rules, { value: 0 }, { amount: 2 }, 7, 1);
  assert.equal(left.ok, true);
  assert.deepEqual(left.state, right.state);

  const loop = await new IsolatedRulesRunner(30, 16).execute(
    { ...rules, source: "() => { while (true) {} }" },
    {},
    {},
    1,
    1,
  );
  assert.equal(loop.error, "timeout");
});

test("adapter validates tenants and contains rule failures", async () => {
  const runner = new IsolatedRulesRunner(200, 16);
  const adapter = new NakamaRunnerAdapter(
    "game-a",
    "room",
    { score: 0 },
    {
      projectId: "game-a",
      version: "v1",
      source:
        "(state, action) => ({ state: { score: state.score + action.amount }, events: [] })",
    },
    runner,
  );
  assert.equal((await adapter.apply(claims("p1"), { amount: 3 })).state.score, 3);
  await assert.rejects(adapter.apply(claims("p2", "game-b"), { amount: 1 }), /tenant/);

  const broken = new NakamaRunnerAdapter(
    "game-a",
    "broken",
    {},
    { projectId: "game-a", version: "bad", source: "() => { throw new Error() }" },
    runner,
  );
  await assert.rejects(broken.apply(claims("p1"), {}), /runner failure/);
  assert.equal((await adapter.apply(claims("p1"), { amount: 1 })).state.score, 4);
});

test("representative sources extract to one behaviorally equivalent rule", async () => {
  const samples = {
    javascript: "function apply(state, action) { state.score += action.amount; }",
    swift: "func apply(_ state: inout State, _ action: Action) { state.score += action.amount }",
    kotlin: "fun apply(state: State, action: Action) { state.score += action.amount }",
    csharp: "void Apply(State state, Action action) { state.score += action.amount; }",
  } as const;
  const runner = new IsolatedRulesRunner(200, 16);
  for (const [language, source] of Object.entries(samples)) {
    const rules = extractScoreRule(
      language as keyof typeof samples,
      source,
      "game-a",
    );
    const result = await runner.execute(rules, { score: 4 }, { amount: 3 }, 1, 1);
    assert.deepEqual(result.state, { score: 7 });
  }
  assert.throws(
    () => extractScoreRule("swift", "URLSession.shared.dataTask()", "game-a"),
    /impure/,
  );
});

test("WebAssembly spike instantiates and executes a deterministic module", async () => {
  const result = await evaluateWasm(1_000);
  assert.equal(result.result, 1_000);
  assert.ok(result.startupMs >= 0);
  assert.ok(result.operationsPerSecond > 0);
});
