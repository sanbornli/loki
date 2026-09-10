import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import test from "node:test";
import {
  Client,
  type MatchmakerMatched,
  type Session,
  type Socket,
} from "@heroiclabs/nakama-js";
import WebSocket from "ws";
import { ServerEnvelopeSchema } from "../packages/protocol/src/index.js";

globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;

const HOST = process.env.NAKAMA_HOST ?? "127.0.0.1";
const PORT = process.env.NAKAMA_PORT ?? "7350";
const SERVER_KEY = process.env.NAKAMA_SERVER_KEY ?? "defaultkey";
const HTTP_KEY = process.env.NAKAMA_HTTP_KEY ?? "defaulthttpkey";
const SSL = process.env.NAKAMA_SSL === "true";
const HTTP_PROTOCOL = SSL ? "https" : "http";
const client = new Client(SERVER_KEY, HOST, PORT, SSL);

interface TestUser {
  session: Session;
  socket: Socket;
  projectId: string;
  inbound: string[];
  waiters: Array<{
    matchId: string;
    opCode: number;
    predicate: (message: ProtocolEnvelope) => boolean;
    resolve: (message: ProtocolEnvelope) => void;
    seen: string[];
  }>;
}

const payload = <T>(response: { payload?: object }): T => response.payload as T;

interface TenantConfig {
  status?: "active" | "suspended";
  maxPlayers?: number;
  tickRate?: number;
  visibility?: "private" | "unlisted" | "matchmaking";
  teamSize?: number;
  inviteTtlSeconds?: number;
  concurrentRoomQuota?: number;
}

async function provisionTenant(
  userId: string,
  projectId: string,
  config: TenantConfig = {},
): Promise<void> {
  const response = await fetch(
    `${HTTP_PROTOCOL}://${HOST}:${PORT}/v2/rpc/loki_provision_tenant?unwrap`,
    {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${HTTP_KEY}:`).toString("base64")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ userId, projectId, ...config }),
    },
  );
  if (!response.ok) {
    throw new Error(`tenant provisioning failed: ${await response.text()}`);
  }
}

async function waitForNakama(): Promise<void> {
  const deadline = Date.now() + 30_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${HTTP_PROTOCOL}://${HOST}:${PORT}/healthcheck`);
      if (response.ok) return;
      lastError = new Error(`healthcheck returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Nakama did not become healthy: ${String(lastError)}`);
}

async function createUser(
  suffix: string,
  projectId: string,
  runId: string,
): Promise<TestUser> {
  const session = await client.authenticateCustom(
    `loki-phase-zero-${runId}-${suffix}`,
    true,
    `loki_${suffix}_${runId}`.slice(0, 128),
  );
  assert.ok(session.user_id);
  await provisionTenant(session.user_id, projectId, {
    status: "active",
    maxPlayers: 16,
    tickRate: 5,
    visibility: "matchmaking",
    teamSize: 0,
    inviteTtlSeconds: 900,
    concurrentRoomQuota: 20,
  });
  const socket = client.createSocket(SSL, false);
  const user: TestUser = {
    session,
    socket,
    projectId,
    waiters: [],
    inbound: [],
  };
  await socket.connect(session, true);
  attachMatchHandler(user);
  return user;
}

async function rpc<T>(
  user: TestUser,
  id: string,
  input: Record<string, unknown> = {},
): Promise<T> {
  return payload<T>(await client.rpc(user.session, id, input));
}

function nextMatch(user: TestUser): Promise<MatchmakerMatched> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("matchmaker timed out")), 20_000);
    user.socket.onmatchmakermatched = (matched) => {
      clearTimeout(timer);
      resolve(matched);
    };
  });
}

interface ProtocolEnvelope {
  protocolVersion: number;
  roomId: string;
  sequence: number;
  type: string;
  [key: string]: unknown;
}

function sameMatch(left: string, right: string): boolean {
  return (
    left === right || left.startsWith(`${right}.`) || right.startsWith(`${left}.`)
  );
}

function attachMatchHandler(user: TestUser): void {
  user.socket.onmatchdata = (message) => {
    try {
      const decoded = JSON.parse(
        new TextDecoder().decode(message.data),
      ) as ProtocolEnvelope;
      const note = `${message.match_id}/${message.op_code}/${decoded.type}/${String(decoded.actionId ?? "")}/${String(decoded.senderId ?? "")}/${String(decoded.code ?? "")}/${String(decoded.message ?? "")}`;
      user.inbound.push(note);
      for (const waiter of [...user.waiters]) {
        waiter.seen.push(note);
        if (
          !sameMatch(message.match_id, waiter.matchId) ||
          message.op_code !== waiter.opCode
        ) {
          continue;
        }
        if (!waiter.predicate(decoded)) continue;
        user.waiters.splice(user.waiters.indexOf(waiter), 1);
        waiter.resolve(decoded);
      }
    } catch (error) {
      user.inbound.push(`decode-error:${message.op_code}:${String(error)}`);
    }
  };
}

function nextMatchData(
  user: TestUser,
  matchId: string,
  opCode: number,
  predicate: (message: ProtocolEnvelope) => boolean = () => true,
): Promise<ProtocolEnvelope> {
  return new Promise((resolve, reject) => {
    const waiter = {
      matchId,
      opCode,
      predicate,
      resolve: (message: ProtocolEnvelope) => {
        clearTimeout(timer);
        resolve(message);
      },
      seen: [] as string[],
    };
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            `match data opcode ${opCode} timed out; waiter saw ${waiter.seen.join(", ") || "nothing"}; inbound ${user.inbound.slice(-12).join(" | ") || "nothing"}`,
          ),
        ),
      8_000,
    );
    user.waiters.push(waiter);
  });
}

async function sendEnvelope(
  user: TestUser,
  matchId: string,
  opCode: number,
  sequence: number,
  body: Record<string, unknown>,
): Promise<void> {
  await user.socket.sendMatchState(
    matchId,
    opCode,
    JSON.stringify({
      protocolVersion: 1,
      roomId: matchId,
      sequence,
      ...body,
    }),
  );
}

test("live Nakama isolates tenants across RPCs, rooms and matchmaking", async (t) => {
  await waitForNakama();
  const runId = Date.now().toString(36);
  const leaderboardId = `weekly-${runId}`;
  const users = await Promise.all(
    ["game-a", "game-b"].flatMap((projectId) =>
      Array.from({ length: 8 }, (_, index) =>
        createUser(`${projectId.at(-1)}${index + 1}`, projectId, runId),
      ),
    ),
  );
  const gameAUsers = users.filter((user) => user.projectId === "game-a");
  const gameBUsers = users.filter((user) => user.projectId === "game-b");
  const [a1, a2, a3] = gameAUsers as [
    TestUser,
    TestUser,
    TestUser,
    ...TestUser[],
  ];
  const [b1, b2] = gameBUsers as [TestUser, TestUser, ...TestUser[]];
  t.after(() => users.forEach((user) => user.socket.disconnect(false)));

  // A client-supplied projectId is ignored; tenancy comes from the server-only
  // storage mapping provisioned through the HTTP-key control-plane path.
  const derived = await rpc<{ projectId: string }>(a1, "loki_tenant", {
    projectId: "game-b",
  });
  assert.equal(derived.projectId, "game-a");
  await assert.rejects(
    client.rpc(a1.session, "loki_provision_tenant", {
      userId: a1.session.user_id,
      projectId: "game-b",
    }),
  );

  const roomA = await rpc<{
    matchId: string;
    projectId: string;
    roomKey: string;
    inviteCode: string;
    inviteExpiresAt: number;
    maxPlayers: number;
    tickRate: number;
    visibility: string;
  }>(
    a1,
    "loki_create_room",
    { projectId: "game-b" },
  );
  const roomB = await rpc<{
    matchId: string;
    projectId: string;
    roomKey: string;
    inviteCode: string;
  }>(
    b1,
    "loki_create_room",
    { projectId: "game-a" },
  );
  assert.equal(roomA.projectId, "game-a");
  assert.equal(roomB.projectId, "game-b");
  assert.notEqual(roomA.matchId, roomB.matchId);
  assert.notEqual(roomA.roomKey, roomB.roomKey);
  assert.match(roomA.roomKey, /^[a-z0-9-]{1,64}$/);
  assert.equal(roomA.maxPlayers, 16);
  assert.equal(roomA.tickRate, 5);
  assert.equal(roomA.visibility, "matchmaking");
  assert.ok(roomA.inviteExpiresAt > Date.now());

  const joinedRoomA = await rpc<{ matchId: string; projectId: string }>(
    a2,
    "loki_join_room",
    { inviteCode: roomA.inviteCode },
  );
  const joinedRoomB = await rpc<{ matchId: string; projectId: string }>(
    b2,
    "loki_join_room",
    { inviteCode: roomB.inviteCode },
  );
  assert.equal(joinedRoomA.matchId, roomA.matchId);
  assert.equal(joinedRoomA.projectId, "game-a");
  assert.equal(joinedRoomB.matchId, roomB.matchId);
  assert.equal(joinedRoomB.projectId, "game-b");
  const secondCreate = await rpc<{ matchId: string }>(a2, "loki_create_room", {});
  assert.notEqual(secondCreate.matchId, roomA.matchId);
  const reconnectRoom = await rpc<{ matchId: string; inviteCode: string }>(
    a1,
    "loki_create_room",
    {},
  );
  await a1.socket.joinMatch(reconnectRoom.matchId);
  await a1.socket.leaveMatch(reconnectRoom.matchId);
  await new Promise((resolve) => setTimeout(resolve, 200));
  const reconnectExisting = await rpc<{ matchId: string }>(
    a3,
    "loki_join_room",
    { inviteCode: reconnectRoom.inviteCode },
  );
  assert.equal(reconnectExisting.matchId, reconnectRoom.matchId);
  await a3.socket.joinMatch(reconnectRoom.matchId);
  await assert.rejects(
    rpc(a2, "loki_join_room", { inviteCode: "missing-room" }),
  );

  const secondInvite = await rpc<{ inviteCode: string }>(a1, "loki_create_room", {});
  assert.match(roomA.inviteCode, /^[0-9]{6}$/);
  assert.notEqual(secondInvite.inviteCode, roomA.inviteCode);

  const resolvedInvite = await rpc<{ matchId: string }>(
    a2,
    "loki_resolve_invite",
    { inviteCode: roomA.inviteCode },
  );
  assert.equal(resolvedInvite.matchId, roomA.matchId);
  await assert.rejects(
    rpc(b1, "loki_resolve_invite", { inviteCode: roomA.inviteCode }),
  );

  await a1.socket.joinMatch(roomA.matchId);
  await Promise.all(
    gameAUsers.slice(1).map((user) => user.socket.joinMatch(roomA.matchId)),
  );
  const [delayedJoinSnapshot, delayedHostPresence] = await Promise.all([
    nextMatchData(
      a2,
      roomA.matchId,
      13,
      (message) => message.type === "snapshot",
    ),
    nextMatchData(
      a1,
      roomA.matchId,
      13,
      (message) =>
        message.type === "presence" &&
        Array.isArray(message.members) &&
        message.members.length === 8,
    ),
  ]);
  assert.equal(
    (delayedHostPresence.members as unknown[]).length,
    8,
  );
  ServerEnvelopeSchema.parse(delayedHostPresence);
  assert.equal(delayedJoinSnapshot.hostId, a1.session.user_id);
  await assert.rejects(
    b1.socket.joinMatch(roomA.matchId),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      String(error.message).includes("tenant mismatch"),
  );
  await b1.socket.joinMatch(roomB.matchId);

  const initial = await rpc<{
    ok: boolean;
    hostId: string;
    version: number;
    members: string[];
  }>(a1, "loki_room_snapshot", { matchId: roomA.matchId });
  assert.equal(initial.ok, true);
  assert.equal(initial.hostId, a1.session.user_id);
  assert.equal(initial.version, 0);
  assert.equal(initial.members.length, 8);

  const broadcastPromise = nextMatchData(
    a2,
    roomA.matchId,
    1,
    (message) => message.type === "state",
  );
  const updated = await rpc<{
    ok: boolean;
    projectId: string;
    roomKey: string;
    hostId: string;
    version: number;
    stateVersion: number;
    state: unknown;
    members: string[];
    capabilities?: { synchronized_rooms?: boolean; limits?: { maxMessageBytes?: number } };
  }>(
    a1,
    "loki_room_update",
    { matchId: roomA.matchId, expectedVersion: 0, state: { tick: 1 } },
  );
  assert.equal(updated.ok, true);
  assert.equal(updated.projectId, "game-a");
  assert.equal(updated.roomKey, roomA.roomKey);
  assert.equal(updated.hostId, a1.session.user_id);
  assert.equal(updated.version, 1);
  assert.equal(updated.stateVersion, 1);
  assert.deepEqual(updated.state, { tick: 1 });
  assert.deepEqual(updated.members, initial.members);
  assert.equal(updated.capabilities?.synchronized_rooms, true);
  assert.equal(updated.capabilities?.limits?.maxMessageBytes, 16384);
  const broadcast = await broadcastPromise;
  assert.equal(broadcast.type, "state");
  assert.equal(broadcast.version ?? broadcast.stateVersion, 1);

  const stale = await rpc<{ ok: boolean; error: string }>(
    a1,
    "loki_room_update",
    { matchId: roomA.matchId, expectedVersion: 0, state: { tick: 2 } },
  );
  assert.deepEqual(stale, { ok: false, error: "stale version" });

  const loadStarted = performance.now();
  for (let version = 1; version <= 50; version += 1) {
    const result = await rpc<{ ok: boolean; version: number }>(
      a1,
      "loki_room_update",
      {
        matchId: roomA.matchId,
        expectedVersion: version,
        state: { tick: version + 1 },
      },
    );
    assert.equal(result.ok, true);
    assert.equal(result.version, version + 1);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const loadDurationMs = performance.now() - loadStarted;
  const updatesPerSecond = 50 / (loadDurationMs / 1_000);
  assert.ok(
    updatesPerSecond >= 1,
    `expected the remote RPC path to sustain at least 1 update/s, measured ${updatesPerSecond.toFixed(2)}`,
  );

  const actionPromise = nextMatchData(
    a1,
    roomA.matchId,
    10,
    (message) => message.type === "action",
  );
  await sendEnvelope(a2, roomA.matchId, 10, 1, {
    type: "action",
    payload: { move: "left" },
  });
  const action = await actionPromise;
  assert.equal(action.protocolVersion, 1);
  assert.equal(action.roomId, roomA.matchId);
  assert.equal(action.senderId, a2.session.user_id);
  assert.deepEqual(action.payload, { move: "left" });

  const eventPromise = nextMatchData(
    a1,
    roomA.matchId,
    11,
    (message) => message.type === "event",
  );
  await sendEnvelope(a2, roomA.matchId, 11, 2, {
    type: "event",
    reliable: true,
    payload: { emote: "wave" },
  });
  const event = await eventPromise;
  assert.equal(event.reliable, true);
  assert.deepEqual(event.payload, { emote: "wave" });

  const statePromise = nextMatchData(
    a2,
    roomA.matchId,
    12,
    (message) => message.type === "state",
  );
  await sendEnvelope(a1, roomA.matchId, 12, 1, {
    type: "host_state",
    expectedVersion: 51,
    state: { tick: 52, authoritative: true },
  });
  const stateEnvelope = await statePromise;
  assert.equal(stateEnvelope.hostId, a1.session.user_id);
  assert.deepEqual(stateEnvelope.state, { tick: 52, authoritative: true });
  const alignedVersion = await rpc<{ version: number }>(
    a1,
    "loki_room_snapshot",
    { matchId: roomA.matchId },
  );
  assert.equal(alignedVersion.version, stateEnvelope.sequence);

  const driftedStatePromise = nextMatchData(
    a2,
    roomA.matchId,
    12,
    (message) =>
      message.type === "state" &&
      Boolean((message.state as { drifted?: boolean } | undefined)?.drifted),
  );
  await sendEnvelope(a1, roomA.matchId, 12, 2, {
    type: "host_state",
    expectedVersion: stateEnvelope.sequence + 4,
    state: { tick: 53, drifted: true },
  });
  const driftedState = await driftedStatePromise;
  assert.deepEqual(driftedState.state, { tick: 53, drifted: true });

  const nonHostErrorPromise = nextMatchData(
    a2,
    roomA.matchId,
    12,
    (message) => message.type === "error",
  );
  await sendEnvelope(a2, roomA.matchId, 12, 3, {
    type: "host_state",
    expectedVersion: 52,
    state: { forged: true },
  });
  assert.equal((await nonHostErrorPromise).code, "HOST_REQUIRED");

  const snapshotPromise = nextMatchData(
    a2,
    roomA.matchId,
    13,
    (message) => message.type === "snapshot",
  );
  await sendEnvelope(a2, roomA.matchId, 13, 4, {
    type: "snapshot_request",
  });
  const realtimeSnapshot = await snapshotPromise;
  assert.equal(realtimeSnapshot.hostId, a1.session.user_id);
  assert.deepEqual(realtimeSnapshot.state, {
    tick: 53,
    drifted: true,
  });

  const chatPromise = nextMatchData(
    a1,
    roomA.matchId,
    14,
    (message) => message.type === "chat",
  );
  await sendEnvelope(a2, roomA.matchId, 14, 5, {
    type: "chat",
    channel: "match",
    text: "  hello Loki  ",
  });
  const chat = await chatPromise;
  assert.equal(chat.senderId, a2.session.user_id);
  assert.equal(chat.text, "hello Loki");
  assert.equal(chat.channel, "match");

  const chatRatePromise = nextMatchData(
    a3,
    roomA.matchId,
    14,
    (message) => message.type === "error" && message.code === "RATE_LIMITED",
  );
  for (let sequence = 1; sequence <= 6; sequence += 1) {
    await sendEnvelope(a3, roomA.matchId, 14, sequence, {
      type: "chat",
      channel: "match",
      text: `message ${sequence}`,
    });
  }
  assert.equal((await chatRatePromise).code, "RATE_LIMITED");

  const scorePromise = nextMatchData(
    a2,
    roomA.matchId,
    15,
    (message) => message.type === "leaderboard",
  );
  await sendEnvelope(a2, roomA.matchId, 15, 6, {
    type: "score_submit",
    leaderboardId,
    score: 42,
    subscore: 7,
    playerId: b1.session.user_id,
  });
  const score = await scorePromise;
  assert.equal(
    (score.records as Array<{ playerId: string }>)[0]?.playerId,
    a2.session.user_id,
  );

  const submitted = await rpc<{
    record: { playerId: string; score: number };
  }>(a1, "loki_leaderboard_submit", {
    leaderboardId,
    score: 100,
    playerId: b1.session.user_id,
  });
  assert.equal(submitted.record.playerId, a1.session.user_id);
  const boardA = await rpc<{
    records: Array<{ playerId: string; score: number }>;
  }>(a2, "loki_leaderboard_list", { leaderboardId });
  assert.deepEqual(
    new Set(boardA.records.map((record) => record.playerId)),
    new Set([a1.session.user_id, a2.session.user_id]),
  );
  await rpc(b1, "loki_leaderboard_submit", {
    leaderboardId,
    score: 999,
  });
  const boardB = await rpc<{
    records: Array<{ playerId: string }>;
  }>(b2, "loki_leaderboard_list", { leaderboardId });
  assert.deepEqual(
    boardB.records.map((record) => record.playerId),
    [b1.session.user_id],
  );

  const crossTenantSnapshot = await rpc<{ ok: boolean; error: string }>(
    b1,
    "loki_room_snapshot",
    { matchId: roomA.matchId },
  );
  assert.deepEqual(crossTenantSnapshot, { ok: false, error: "tenant mismatch" });

  a3.socket.disconnect(false);
  a3.socket = client.createSocket(SSL, false);
  await a3.socket.connect(a3.session, true);
  attachMatchHandler(a3);
  const reconnectMessage = nextMatchData(
    a3,
    roomA.matchId,
    13,
    (message) => message.type === "snapshot",
  );
  await a3.socket.joinMatch(roomA.matchId);
  const reconnectSnapshot = await reconnectMessage;
  assert.equal(reconnectSnapshot.hostId, a1.session.user_id);
  assert.deepEqual(reconnectSnapshot.state, {
    tick: 53,
    drifted: true,
  });

  const hostChangedPromise = nextMatchData(
    a2,
    roomA.matchId,
    13,
    (message) => message.type === "host_changed",
  );
  await a1.socket.leaveMatch(roomA.matchId);
  const hostChanged = await hostChangedPromise;
  assert.equal(hostChanged.previousHostId, a1.session.user_id);
  assert.equal(typeof hostChanged.hostId, "string");
  assert.notEqual(hostChanged.hostId, a1.session.user_id);
  assert.ok(initial.members.includes(hostChanged.hostId as string));
  const migrated = await rpc<{ hostId: string; version: number }>(
    a2,
    "loki_room_snapshot",
    { matchId: roomA.matchId },
  );
  assert.equal(migrated.hostId, hostChanged.hostId);
  assert.equal(migrated.version, driftedState.sequence);

  const matchmakingUsers = [a1, a2, b1, b2];
  const matchedPromises = matchmakingUsers.map(nextMatch);
  await Promise.all(
    matchmakingUsers.map((user) => user.socket.addMatchmaker("*", 2, 2)),
  );
  const matches = await Promise.all(matchedPromises);
  const projectByUser = new Map(
    users.map((user) => [user.session.user_id!, user.projectId]),
  );
  for (const match of matches) {
    assert.ok(match.match_id, "matchmaker did not create an authoritative room");
    const participants = [match.self, ...match.users];
    const projects = new Set(
      participants.map((participant) =>
        projectByUser.get(participant.presence.user_id),
      ),
    );
    assert.equal(projects.size, 1, "matchmaker crossed tenant boundaries");
  }
  await Promise.all(
    matchmakingUsers.map((user, index) =>
      user.socket.joinMatch(matches[index]!.match_id, matches[index]!.token),
    ),
  );
  const matchmadeSnapshot = await rpc<{ ok: boolean; roomKey: string }>(
    a1,
    "loki_room_snapshot",
    { matchId: matches[0]!.match_id },
  );
  assert.equal(matchmadeSnapshot.ok, true);
  assert.match(matchmadeSnapshot.roomKey, /^match-[a-f0-9]{8}$/);

  const rateLimitPromise = nextMatchData(
    a2,
    roomA.matchId,
    10,
    (message) => message.type === "error" && message.code === "RATE_LIMITED",
  );
  for (let sequence = 7; sequence <= 30; sequence += 1) {
    await sendEnvelope(a2, roomA.matchId, 10, sequence, {
      type: "action",
      payload: { sequence },
    });
  }
  const rateLimitError = await rateLimitPromise;
  assert.equal(rateLimitError.code, "RATE_LIMITED");
  assert.ok(Number(rateLimitError.retryAfterMs) > 0);

  await provisionTenant(b1.session.user_id!, "game-b", {
    concurrentRoomQuota: 1,
  });
  await assert.rejects(rpc(b1, "loki_create_room", {}));

  const suspendedPromise = nextMatchData(
    a2,
    roomA.matchId,
    13,
    (message) =>
      message.type === "room_closed" && message.reason === "suspended",
  );
  await provisionTenant(a1.session.user_id!, "game-a", {
    status: "suspended",
  });
  await assert.rejects(rpc(a2, "loki_tenant"));
  assert.equal((await suspendedPromise).reason, "suspended");
  await provisionTenant(a1.session.user_id!, "game-a", { status: "active" });

  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/nakama-integration.json",
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        nakamaEndpoint: `${HOST}:${PORT}`,
        checks: {
          serverOnlyTenantProvisioning: true,
          forgedProjectIgnored: true,
          duplicateRoomKeysIsolated: true,
          crossTenantJoinRejected: true,
          crossTenantSnapshotRejected: true,
          staleUpdateRejected: true,
          hostMigration: true,
          inviteCodesIsolated: true,
          realtimeStateBroadcast: true,
          realtimeProtocolOpcodes: true,
          reconnectSnapshot: true,
          presenceAndHostChangeBroadcasts: true,
          privateProjectLeaderboards: true,
          scoreAntiSpoofing: true,
          messageRateLimit: true,
          chatRateLimit: true,
          concurrentRoomQuota: true,
          immediateSuspension: true,
          matchmakingIsolated: true,
          matchmakingAuthoritativeRoom: true,
          eightPlayerRoom: initial.members.length === 8,
          configuredTickRate: roomA.tickRate === 5,
          remoteRpcSustainedLoad: updatesPerSecond >= 1,
        },
        measurements: {
          playersInRoom: initial.members.length,
          updates: 50,
          loadDurationMs,
        updatesPerSecond,
        },
      },
      null,
      2,
    )}\n`,
  );
});

test("synchronized room fields keep state version independent of presence", async (t) => {
  await waitForNakama();
  const runId = crypto.randomUUID();
  const projectId = `sync-${runId.slice(0, 8)}`;
  const host = await createUser("sync-host", projectId, runId);
  const member = await createUser("sync-member", projectId, runId);
  t.after(async () => {
    await host.socket.disconnect(false);
    await member.socket.disconnect(false);
  });
  const created = await rpc<{ matchId: string; inviteCode: string }>(
    host,
    "loki_create_room",
    { projectId },
  );
  await host.socket.joinMatch(created.matchId);
  const joined = await rpc<{ matchId: string }>(member, "loki_join_room", {
    inviteCode: created.inviteCode,
  });
  await member.socket.joinMatch(joined.matchId);

  const committed = nextMatchData(
    member,
    created.matchId,
    12,
    (message) =>
      message.type === "state" && message.actionId === "syncaction01",
  );
  await sendEnvelope(host, created.matchId, 12, 1, {
    type: "host_state",
    expectedVersion: 0,
    expectedStateVersion: 0,
    actionId: "syncaction01",
    senderId: host.session.user_id,
    state: { n: 1 },
  });
  const state = await committed;
  assert.equal(state.stateVersion, 1);
  assert.deepEqual(state.state, { n: 1 });

  const snapshot = await rpc<{ version: number; stateVersion?: number }>(
    host,
    "loki_room_snapshot",
    { matchId: created.matchId },
  );
  assert.equal(snapshot.stateVersion ?? snapshot.version, 1);

  const duplicate = nextMatchData(
    host,
    created.matchId,
    12,
    (message) =>
      message.type === "state" &&
      message.actionId === "syncaction01" &&
      message.senderId === host.session.user_id,
  );
  await sendEnvelope(host, created.matchId, 12, 2, {
    type: "host_state",
    expectedVersion: 1,
    expectedStateVersion: 1,
    actionId: "syncaction01",
    senderId: host.session.user_id,
    state: { n: 1 },
  });
  const acknowledged = await duplicate;
  assert.equal(acknowledged.stateVersion, 1);
  assert.deepEqual(acknowledged.state, { n: 1 });
  assert.equal(acknowledged.senderId, host.session.user_id);

  const conflict = nextMatchData(
    host,
    created.matchId,
    12,
    (message) => message.type === "error" && message.actionId === "syncaction02",
  );
  await sendEnvelope(host, created.matchId, 12, 3, {
    type: "host_state",
    expectedVersion: 0,
    expectedStateVersion: 0,
    actionId: "syncaction02",
    senderId: host.session.user_id,
    state: { n: 9 },
  });
  assert.equal((await conflict).code, "STALE_VERSION");

  const delivered = nextMatchData(
    host,
    created.matchId,
    10,
    (message) => message.type === "action" && message.actionId === "syncaction03",
  );
  await sendEnvelope(member, created.matchId, 10, 2, {
    type: "action",
    actionId: "syncaction03",
    payload: { n: -1 },
  });
  assert.equal((await delivered).senderId, member.session.user_id);

  const rejected = nextMatchData(
    member,
    created.matchId,
    10,
    (message) => message.type === "error" && message.actionId === "syncaction03",
  );
  await sendEnvelope(host, created.matchId, 16, 4, {
    type: "action_reject",
    actionId: "syncaction03",
    senderId: member.session.user_id,
    outcome: "rejected",
    message: "action rejected",
  });
  const rejection = await rejected;
  assert.equal(rejection.actionOutcome, "rejected");
  assert.equal(rejection.message, "action rejected");

  const malformed = nextMatchData(
    host,
    created.matchId,
    16,
    (message) => message.type === "error" && message.code === "INVALID_MESSAGE",
  );
  await sendEnvelope(host, created.matchId, 16, 5, {
    type: "action_reject",
    actionId: "bad",
    outcome: "nope",
    message: "",
  });
  const invalid = await malformed;
  assert.equal(invalid.code, "INVALID_MESSAGE");
  ServerEnvelopeSchema.parse(invalid);
});

test("sender-scoped actions isolate collisions and require host identity", async (t) => {
  await waitForNakama();
  const runId = crypto.randomUUID();
  const projectId = `scope-${runId.slice(0, 8)}`;
  const host = await createUser("scope-host", projectId, runId);
  const left = await createUser("scope-left", projectId, runId);
  const right = await createUser("scope-right", projectId, runId);
  t.after(async () => {
    await host.socket.disconnect(false);
    await left.socket.disconnect(false);
    await right.socket.disconnect(false);
  });
  const created = await rpc<{ matchId: string; inviteCode: string }>(
    host,
    "loki_create_room",
    { projectId },
  );
  const hostJoined = nextMatchData(
    host,
    created.matchId,
    13,
    (message) => message.type === "snapshot",
  );
  await host.socket.joinMatch(created.matchId);
  await hostJoined;
  await rpc(left, "loki_join_room", { inviteCode: created.inviteCode });
  const leftJoined = nextMatchData(
    left,
    created.matchId,
    13,
    (message) => message.type === "snapshot",
  );
  await left.socket.joinMatch(created.matchId);
  await leftJoined;
  await rpc(right, "loki_join_room", { inviteCode: created.inviteCode });
  const rightJoined = nextMatchData(
    right,
    created.matchId,
    13,
    (message) => message.type === "snapshot",
  );
  await right.socket.joinMatch(created.matchId);
  await rightJoined;
  const liveMembers = await rpc<{ hostId: string; members: string[] }>(
    host,
    "loki_room_snapshot",
    { matchId: created.matchId },
  );
  assert.equal(liveMembers.hostId, host.session.user_id);
  assert.equal(liveMembers.members.length, 3);

  const leftDelivered = nextMatchData(
    host,
    created.matchId,
    10,
    (message) =>
      message.type === "action" &&
      message.actionId === "sharedact01" &&
      message.senderId === left.session.user_id,
  );
  await sendEnvelope(left, created.matchId, 10, 1, {
    type: "action",
    actionId: "sharedact01",
    payload: { n: 1 },
  });
  assert.equal((await leftDelivered).senderId, left.session.user_id);
  const rightDelivered = nextMatchData(
    host,
    created.matchId,
    10,
    (message) =>
      message.type === "action" &&
      message.actionId === "sharedact01" &&
      message.senderId === right.session.user_id,
  );
  await sendEnvelope(right, created.matchId, 10, 1, {
    type: "action",
    actionId: "sharedact01",
    payload: { n: 2 },
  });
  assert.equal((await rightDelivered).senderId, right.session.user_id);

  const leftRetry = nextMatchData(
    left,
    created.matchId,
    10,
    (message) => message.type === "error" && message.message === "duplicate action",
  );
  await sendEnvelope(left, created.matchId, 10, 2, {
    type: "action",
    actionId: "sharedact01",
    payload: { n: 1 },
  });
  assert.equal((await leftRetry).message, "duplicate action");

  const ambiguous = nextMatchData(
    host,
    created.matchId,
    12,
    (message) =>
      message.type === "error" &&
      message.code === "INVALID_MESSAGE" &&
      String(message.message).includes("ambiguous"),
  );
  await sendEnvelope(host, created.matchId, 12, 2, {
    type: "host_state",
    expectedVersion: 0,
    expectedStateVersion: 0,
    actionId: "sharedact01",
    state: { n: 9 },
  });
  assert.equal((await ambiguous).code, "INVALID_MESSAGE");

  const committed = nextMatchData(
    left,
    created.matchId,
    12,
    (message) =>
      message.type === "state" &&
      message.actionId === "sharedact01" &&
      message.senderId === left.session.user_id,
  );
  await sendEnvelope(host, created.matchId, 12, 3, {
    type: "host_state",
    expectedVersion: 0,
    expectedStateVersion: 0,
    actionId: "sharedact01",
    senderId: left.session.user_id,
    state: { n: 1 },
  });
  const state = await committed;
  assert.equal(state.stateVersion, 1);
  assert.equal(state.senderId, left.session.user_id);

  const sameSender = nextMatchData(
    left,
    created.matchId,
    12,
    (message) =>
      message.type === "state" &&
      message.actionId === "sharedact01" &&
      message.senderId === left.session.user_id &&
      message.stateVersion === 1,
  );
  await sendEnvelope(left, created.matchId, 10, 3, {
    type: "action",
    actionId: "sharedact01",
    payload: { n: 1 },
  });
  assert.equal((await sameSender).stateVersion, 1);

  const snapshot = await rpc<{
    ok: boolean;
    capabilities?: { synchronized_rooms?: boolean; limits?: { maxMessageBytes?: number } };
  }>(host, "loki_room_snapshot", { matchId: created.matchId });
  assert.equal(snapshot.ok, true);
  assert.equal(snapshot.capabilities?.synchronized_rooms, true);
  assert.equal(snapshot.capabilities?.limits?.maxMessageBytes, 16384);

  const inboundBeforeOversize = host.inbound.length;
  await left.socket.sendMatchState(
    created.matchId,
    10,
    JSON.stringify({
      protocolVersion: 1,
      roomId: created.matchId,
      sequence: 4,
      type: "action",
      actionId: "oversize1",
      payload: { blob: "x".repeat(20_000) },
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 750));
  assert.equal(
    host.inbound
      .slice(inboundBeforeOversize)
      .some((line) => line.includes("/10/action/oversize1")),
    false,
    "16 KiB socket limit must drop oversized actions before host delivery",
  );

  const capabilitySnapshot = nextMatchData(
    right,
    created.matchId,
    13,
    (message) => message.type === "snapshot",
  );
  await sendEnvelope(right, created.matchId, 13, 2, {
    type: "snapshot_request",
  });
  const liveSnapshot = await capabilitySnapshot;
  assert.equal(
    (liveSnapshot.capabilities as { synchronized_rooms?: boolean } | undefined)
      ?.synchronized_rooms,
    true,
  );
  ServerEnvelopeSchema.parse(liveSnapshot);
});
