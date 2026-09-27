import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

// loki.js is a standalone Nakama runtime script (see test/turn-credentials.test.ts
// for why this loads it in an isolated vm context rather than importing it).
// This exercises the server-authority routing helpers directly against fake
// nk/dispatcher objects, without needing a live Nakama server.
async function loadLokiRuntime(): Promise<vm.Context> {
  const source = await readFile(
    new URL("../infra/nakama/modules/loki.js", import.meta.url),
    "utf8",
  );
  const context = vm.createContext({ Date, Math, JSON, console });
  vm.runInContext(source, context, { filename: "loki.js" });
  return context;
}

const validStep = {
  abiVersion: 1,
  modulePath: "server/step.wasm",
  sha256: "a".repeat(64),
};

test("validateProjectConfig defaults authority to host and requires a valid stepModule only for server", async () => {
  const context = await loadLokiRuntime();
  const defaulted = context.validateProjectConfig("project-1", {}, undefined);
  assert.equal(defaulted.authority, "host");
  assert.equal(defaulted.stepModule, null);

  assert.throws(() =>
    context.validateProjectConfig("project-1", { authority: "server" }, undefined),
  );
  assert.throws(() =>
    context.validateProjectConfig(
      "project-1",
      { authority: "server", stepModule: { abiVersion: 1, modulePath: "x.wasm", sha256: "not-hex" } },
      undefined,
    ),
  );
  const server = context.validateProjectConfig(
    "project-1",
    { authority: "server", stepModule: validStep },
    undefined,
  );
  assert.equal(server.authority, "server");
  assert.deepEqual(server.stepModule, validStep);

  assert.throws(() =>
    context.validateProjectConfig(
      "project-1",
      { authority: "host", stepModule: validStep },
      undefined,
    ),
  );
  assert.throws(() =>
    context.validateProjectConfig("project-1", { authority: "invalid" }, undefined),
  );
});

test("serverAuthorityEnabled requires the exact runtime env opt-in", async () => {
  const context = await loadLokiRuntime();
  assert.equal(context.serverAuthorityEnabled({ env: {} }), false);
  assert.equal(context.serverAuthorityEnabled({ env: { LOKI_SERVER_AUTHORITY_ENABLED: "1" } }), false);
  assert.equal(
    context.serverAuthorityEnabled({ env: { LOKI_SERVER_AUTHORITY_ENABLED: "true" } }),
    true,
  );
  assert.equal(context.serverAuthorityEnabled(undefined), false);
});

test("placeServerAuthorityMatch requires a configured orchestrator and a well-formed placement", async () => {
  const context = await loadLokiRuntime();
  const ctx = { env: { LOKI_WORKER_ORCHESTRATOR_URL: "http://worker.internal:9000/" } };

  assert.throws(
    () => context.placeServerAuthorityMatch({ env: {} }, {}, "match-1", 10, validStep),
    /SERVICE_UNAVAILABLE/,
  );

  const okNk = {
    httpRequest: (url: string, method: string) => {
      assert.equal(url, "http://worker.internal:9000/matches");
      assert.equal(method, "post");
      return { code: 200, body: JSON.stringify({ workerUrl: "http://worker-1.internal:9001/" }) };
    },
  };
  const placement = context.placeServerAuthorityMatch(ctx, okNk, "match-1", 10, validStep);
  assert.equal(placement.url, "http://worker-1.internal:9001");
  assert.equal(typeof placement.placedAt, "number");

  const refusedNk = { httpRequest: () => ({ code: 503, body: "{}" }) };
  assert.throws(
    () => context.placeServerAuthorityMatch(ctx, refusedNk, "match-1", 10, validStep),
    /SERVICE_UNAVAILABLE/,
  );

  const throwingNk = {
    httpRequest: () => {
      throw new Error("network down");
    },
  };
  assert.throws(
    () => context.placeServerAuthorityMatch(ctx, throwingNk, "match-1", 10, validStep),
    /SERVICE_UNAVAILABLE/,
  );

  const malformedNk = { httpRequest: () => ({ code: 200, body: "{}" }) };
  assert.throws(
    () => context.placeServerAuthorityMatch(ctx, malformedNk, "match-1", 10, validStep),
    /SERVICE_UNAVAILABLE/,
  );
});

function baseState() {
  return {
    roomId: "match-1",
    tickRate: 10,
    authority: "server",
    worker: { url: "http://worker-1.internal:9001" },
    serverAuthority: { pendingInputs: [] as any[], consecutiveFailures: 0 },
    members: {
      alice: { ordinal: 0, sessionId: "s1" },
    },
    realtime: {
      active: true,
      authorityEpoch: 0,
      roundSequence: 0,
      runtimeSnapshotSequence: 0,
      latestSnapshot: null as null | { simulationTick: number },
      capableSessions: { alice: { sessionId: "s1", capable: true, webrtc: false } },
    },
  };
}

test("queueServerAuthorityInput appends to the pending-inputs queue", async () => {
  const context = await loadLokiRuntime();
  const state = baseState();
  context.queueServerAuthorityInput(
    state,
    "alice",
    { inputSequence: 1, targetTick: 5, delivery: "latest", clientSendTime: 100, payload: { x: 1 } },
    200,
  );
  assert.equal(state.serverAuthority.pendingInputs.length, 1);
  assert.equal(state.serverAuthority.pendingInputs[0]!.senderId, "alice");
  assert.equal(state.serverAuthority.pendingInputs[0]!.serverReceiveTime, 200);
});

test("stepServerAuthorityMatch relays the worker's snapshot and clears pending inputs", async () => {
  const context = await loadLokiRuntime();
  const state = baseState();
  state.serverAuthority.pendingInputs.push({ senderId: "alice", inputSequence: 1 });
  const broadcasts: unknown[] = [];
  const dispatcher = {
    broadcastMessage: (opCode: number, data: string) => {
      broadcasts.push({ opCode, message: JSON.parse(data) });
    },
  };
  const nk = {
    httpRequest: (url: string, method: string, _headers: unknown, body: string) => {
      assert.equal(url, "http://worker-1.internal:9001/matches/match-1/tick");
      const parsed = JSON.parse(body);
      assert.equal(parsed.inputs.length, 1);
      return { code: 200, body: JSON.stringify({ simulationTick: 3, state: { score: 1 } }) };
    },
  };
  const ok = context.stepServerAuthorityMatch({}, nk, dispatcher, state, 3, 1000);
  assert.equal(ok, true);
  assert.equal(state.serverAuthority.pendingInputs.length, 0);
  assert.equal(state.serverAuthority.consecutiveFailures, 0);
  assert.equal(state.realtime.latestSnapshot!.simulationTick, 3);
  assert.equal(broadcasts.length, 1);
  assert.equal((broadcasts[0] as any).message.type, "realtime_snapshot");
  assert.equal((broadcasts[0] as any).message.hostId, "");
});

test("stepServerAuthorityMatch counts consecutive failures without throwing", async () => {
  const context = await loadLokiRuntime();
  const state = baseState();
  const dispatcher = { broadcastMessage: () => undefined };
  const failingNk = {
    httpRequest: () => {
      throw new Error("worker unreachable");
    },
  };
  const ok = context.stepServerAuthorityMatch({}, failingNk, dispatcher, state, 1, 1000);
  assert.equal(ok, false);
  assert.equal(state.serverAuthority.consecutiveFailures, 1);
});

test("a dead worker ends the room and never elects a player host", async () => {
  const context = await loadLokiRuntime();
  const state = baseState() as ReturnType<typeof baseState> & {
    hostId: string;
    projectId: string;
    roomKey: string;
    joinSyncs: unknown[];
    disconnectGraces: Record<string, unknown>;
  };
  state.hostId = "";
  state.projectId = "project-1";
  state.roomKey = "room-key";
  state.joinSyncs = [];
  state.disconnectGraces = {};
  state.members = { alice: { ordinal: 0, sessionId: "s1" } };
  const closed: string[] = [];
  const dispatcher = {
    broadcastMessage: (_op: number, data: string) => {
      closed.push(JSON.parse(data).type);
    },
  };
  const nk = {
    storageRead: () => [
      {
        value: {
          status: "active",
          maxPlayers: 8,
          tickRate: 10,
          visibility: "private",
          teamSize: 0,
          inviteTtlSeconds: 3600,
          concurrentRoomQuota: 20,
          authority: "host",
          stepModule: null,
        },
        version: "*",
      },
    ],
    storageDelete: () => undefined,
    httpRequest: () => {
      throw new Error("worker process gone");
    },
  };
  let result: { state?: unknown } | null = { state };
  for (let tick = 1; tick <= 5; tick += 1) {
    result = context.matchLoop({}, null, nk, dispatcher, tick, state, []);
  }
  assert.equal(result, null);
  assert.equal(state.hostId, "");
  assert.equal(state.serverAuthority.consecutiveFailures, 5);
  assert.ok(closed.includes("room_closed"));
  assert.equal(closed.includes("host_changed"), false);
});

test("teardownServerAuthorityMatch never throws even when the worker is unreachable", async () => {
  const context = await loadLokiRuntime();
  const state = baseState();
  const failingNk = {
    httpRequest: () => {
      throw new Error("worker unreachable");
    },
  };
  assert.doesNotThrow(() => context.teardownServerAuthorityMatch(failingNk, state));
});

test("an explicit host config clears a stored server step module, and omitting stepModule does not", async () => {
  const context = await loadLokiRuntime();
  const previous = context.validateProjectConfig(
    "project-1",
    { authority: "server", stepModule: validStep },
    undefined,
  );
  const cleared = context.validateProjectConfig(
    "project-1",
    { authority: "host", stepModule: null },
    previous,
  );
  assert.equal(cleared.authority, "host");
  assert.equal(cleared.stepModule, null);
  assert.throws(() =>
    context.validateProjectConfig("project-1", { authority: "host" }, previous),
  );
});

test("two join attempts cannot both take the last open seat", async () => {
  const context = await loadLokiRuntime();
  const project = {
    projectId: "project-1",
    status: "active",
    maxPlayers: 8,
    tickRate: 10,
    visibility: "private",
    teamSize: 0,
    inviteTtlSeconds: 3600,
    concurrentRoomQuota: 20,
    leaderboardNamespace: "ns",
    authority: "host",
    stepModule: null,
  };
  const nk = {
    storageRead: (reads: Array<{ collection: string }>) => {
      const read = reads[0];
      if (!read) return [];
      if (read.collection === "_loki_tenants") return [{ value: { projectId: "project-1" } }];
      return [{ value: project }];
    },
  };
  const state = {
    projectId: "project-1",
    maxPlayers: 2,
    members: { host: { sessionId: "host-session" } },
    joinReservations: {},
    realtime: { capableSessions: {}, pendingCapability: {}, active: false },
  };
  const attempt = (userId: string) =>
    context.matchJoinAttempt(
      {},
      null,
      nk,
      {},
      1,
      state,
      { userId, sessionId: `${userId}-session` },
      {},
    );
  const first = attempt("guest");
  const second = attempt("racer");
  assert.equal(first.accept, true);
  assert.equal(second.accept, false);
  assert.match(String(second.rejectMessage), /ROOM_FULL/);
});
