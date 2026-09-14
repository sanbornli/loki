import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client, type Session, type Socket } from "@heroiclabs/nakama-js";
import WebSocket from "ws";
import { REALTIME_OPCODES, REALTIME_PROTOCOL_VERSION } from "../packages/protocol/src/index.js";

globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
// nakama-js heartbeat errors reference `window.console`; Node has no window.
(globalThis as { window?: { console: Console } }).window ??= { console };

const numberArg = (name: string, fallback: number): number => {
  const position = process.argv.indexOf(`--${name}`);
  const value = Number(position === -1 ? fallback : process.argv[position + 1]);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`--${name} must be a positive number`);
  }
  return value;
};
const stringArg = (name: string): string | undefined => {
  const position = process.argv.indexOf(`--${name}`);
  return position === -1 ? undefined : process.argv[position + 1];
};
const percentile = (values: number[], ratio: number): number => {
  if (values.length === 0) return Number.POSITIVE_INFINITY;
  return [...values].sort((a, b) => a - b)[
    Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1)
  ]!;
};
const sleep = (ms: number): Promise<void> =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
const describeError = async (error: unknown): Promise<string> => {
  if (error instanceof Response) {
    const body = await error.text().catch(() => "");
    return `HTTP ${error.status} ${error.statusText}${body ? `: ${body.slice(0, 500)}` : ""}`;
  }
  if (error instanceof Error) return error.message;
  return String(error);
};
const toError = async (error: unknown): Promise<Error> =>
  error instanceof Error ? error : new Error(await describeError(error));

const config = {
  host: process.env.NAKAMA_HOST ?? "127.0.0.1",
  port: process.env.NAKAMA_PORT ?? "7350",
  ssl: process.env.NAKAMA_SSL === "true",
  serverKey: process.env.NAKAMA_SERVER_KEY ?? "defaultkey",
  httpKey: process.env.NAKAMA_HTTP_KEY,
  mode: stringArg("mode") ?? "synchronized",
  playersPerRoom: numberArg("players", 8),
  rooms: numberArg("rooms", 20),
  updatesPerSecond: numberArg("updates-per-second", 5),
  durationSeconds: numberArg("duration-seconds", 600),
  maxErrorRatio: numberArg("max-error-percent", 1) / 100,
  maxRttMs: numberArg("max-rtt-ms", 250),
  recoverySeconds: numberArg("recovery-seconds", 60),
  recoveryActionUrl: stringArg("recovery-action-url"),
  requireRecovery: process.argv.includes("--require-recovery"),
  output: stringArg("output") ?? "artifacts/release/load-recovery.json",
};
if (!config.httpKey) {
  throw new Error("NAKAMA_HTTP_KEY is required; the harness will not guess production credentials");
}
if (config.mode !== "synchronized" && config.mode !== "realtime") {
  throw new Error('--mode must be "synchronized" (default) or "realtime"');
}
if (
  config.playersPerRoom !== 8 ||
  config.rooms < 20 ||
  config.updatesPerSecond < 5 ||
  config.updatesPerSecond > 10 ||
  config.durationSeconds < 600
) {
  throw new Error(
    "release evidence requires exactly 8 players/room, at least 20 rooms, 5-10 updates/s, and at least 600 seconds",
  );
}
if (config.requireRecovery && !config.recoveryActionUrl) {
  throw new Error("--require-recovery requires --recovery-action-url");
}

const client = new Client(
  config.serverKey,
  config.host,
  config.port,
  config.ssl,
);
const protocol = config.ssl ? "https" : "http";
const runId = `release-${Date.now().toString(36)}`;
type User = { session: Session; socket: Socket };
const users: User[] = [];
type Room = {
  matchId: string;
  host: User;
  projectId: string;
  version: number;
  sequence: number;
  waiters: Array<(result: { ok: boolean; version?: number; error?: string }) => void>;
};
const rooms: Room[] = [];
const latencies: number[] = [];
let attempts = 0;
let errors = 0;
let counting = false;
const OP_HOST_STATE = 12;
const OP_LEGACY_STATE = 1;

async function provision(userId: string, projectId: string): Promise<void> {
  const response = await fetch(
    `${protocol}://${config.host}:${config.port}/v2/rpc/loki_provision_tenant?unwrap`,
    {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${config.httpKey!}:`).toString("base64")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ userId, projectId }),
    },
  );
  if (!response.ok) {
    throw new Error(`tenant provisioning failed (${response.status})`);
  }
}

async function rpc<T>(
  user: User,
  id: string,
  input: Record<string, unknown>,
): Promise<T> {
  const started = performance.now();
  if (counting) attempts += 1;
  try {
    const response = await client.rpc(user.session, id, input);
    if (counting) latencies.push(performance.now() - started);
    return response.payload as T;
  } catch (error) {
    if (counting) errors += 1;
    throw await toError(error);
  }
}

async function waitReady(deadline: number): Promise<void> {
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(
        `${protocol}://${config.host}:${config.port}/healthcheck`,
      );
      if (!response.ok) {
        throw new Error(`healthcheck ${response.status}`);
      }
      const session = await client.authenticateCustom(
        `${runId}-ready-${Date.now().toString(36)}`,
        true,
      );
      if (session.token) return;
      throw new Error("authenticate returned no token");
    } catch (error) {
      lastError = error;
    }
    await sleep(1_000);
  }
  throw new Error(
    `Nakama did not become ready: ${await describeError(lastError)}`,
  );
}

function attachHostListener(room: Room): void {
  room.host.socket.onmatchdata = (message) => {
    if (message.match_id !== room.matchId) return;
    let data: { type?: string; version?: number; code?: string; message?: string };
    try {
      const raw = message.data;
      data = JSON.parse(
        typeof raw === "string" ? raw : new TextDecoder().decode(raw),
      );
    } catch {
      return;
    }
    if (message.op_code === OP_HOST_STATE && data.type === "state") {
      const waiters = room.waiters.splice(0);
      waiters.forEach((resolve) =>
        resolve({
          ok: true,
          version:
            typeof data.version === "number" ? data.version : room.version + 1,
        }),
      );
      return;
    }
    if (
      message.op_code === OP_LEGACY_STATE &&
      data.type === "state" &&
      typeof data.version === "number"
    ) {
      const waiters = room.waiters.splice(0);
      waiters.forEach((resolve) => resolve({ ok: true, version: data.version }));
      return;
    }
    if (message.op_code === OP_HOST_STATE && data.type === "error") {
      const waiters = room.waiters.splice(0);
      waiters.forEach((resolve) =>
        resolve({ ok: false, error: String(data.code ?? data.message ?? "error") }),
      );
    }
  };
}

async function hostStateUpdate(room: Room, state: unknown): Promise<void> {
  const started = performance.now();
  if (counting) attempts += 1;
  let onResult: (result: { ok: boolean; version?: number; error?: string }) => void =
    () => undefined;
  const acked = new Promise<{ ok: boolean; version?: number; error?: string }>(
    (resolve) => {
      const timer = setTimeout(() => {
        const index = room.waiters.indexOf(onResult);
        if (index !== -1) room.waiters.splice(index, 1);
        resolve({ ok: false, error: "timeout" });
      }, 2_000);
      onResult = (result) => {
        clearTimeout(timer);
        resolve(result);
      };
      room.waiters.push(onResult);
    },
  );
  try {
    room.sequence += 1;
    await room.host.socket.sendMatchState(
      room.matchId,
      OP_HOST_STATE,
      JSON.stringify({
        protocolVersion: 1,
        roomId: room.matchId,
        sequence: room.sequence,
        type: "host_state",
        expectedVersion: room.version,
        state,
      }),
    );
    const result = await acked;
    if (!result.ok) {
      if (counting) errors += 1;
      if (result.error && errors <= 3) {
        console.error(`host_state failed: ${result.error}`);
      }
      return;
    }
    room.version = result.version ?? room.version + 1;
    if (counting) latencies.push(performance.now() - started);
  } catch (error) {
    const index = room.waiters.indexOf(onResult);
    if (index !== -1) room.waiters.splice(index, 1);
    if (counting) errors += 1;
    if (errors <= 3) console.error(await describeError(error));
  }
}

async function oldRoomStillAlive(matchId: string): Promise<boolean> {
  const socket = client.createSocket(config.ssl, false);
  try {
    const session = await client.authenticateCustom(
      `${runId}-old-${matchId.slice(0, 8)}`,
      true,
    );
    await socket.connect(session, true);
    await socket.joinMatch(matchId);
    return true;
  } catch {
    return false;
  } finally {
    socket.disconnect(false);
  }
}

let recovery:
  | {
      attempted: true;
      mode: "fail-closed";
      actionUrl: string;
      oldRoomsDead: boolean;
      oldRoomsChecked: number;
      oldRoomsStillAlive: number;
      newRoomUpdatesOk: boolean;
      durationMs: number;
    }
  | { attempted: false } = { attempted: false };
const startedAt = new Date();
let artifactWritten = false;

const writeArtifact = async (
  passed: boolean,
  extra: Record<string, unknown> = {},
): Promise<void> => {
  const errorRatio = attempts === 0 ? 1 : errors / attempts;
  const p95RttMs = percentile(latencies, 0.95);
  const artifact = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    startedAt: startedAt.toISOString(),
    target: {
      playersPerRoom: config.playersPerRoom,
      rooms: config.rooms,
      updatesPerSecond: config.updatesPerSecond,
      durationSeconds: config.durationSeconds,
    },
    budgets: {
      maxErrorRatio: config.maxErrorRatio,
      maxP95RttMs: config.maxRttMs,
      maxRecoverySeconds: config.recoverySeconds,
      recoveryMode: "fail-closed" as const,
    },
    measurements: {
      attempts,
      errors,
      errorRatio,
      p50RttMs: percentile(latencies, 0.5),
      p95RttMs,
      p99RttMs: percentile(latencies, 0.99),
      recovery,
    },
    passed,
    ...extra,
  };
  await mkdir(resolve(config.output, ".."), { recursive: true });
  await writeFile(resolve(config.output), `${JSON.stringify(artifact, null, 2)}\n`, {
    flag: "wx",
  });
  artifactWritten = true;
  console.log(JSON.stringify(artifact, null, 2));
};

if (config.mode === "realtime") {
  await runRealtimeMode();
} else {
try {
  for (let roomIndex = 0; roomIndex < config.rooms; roomIndex += 1) {
    const projectId = `${runId}-game-${roomIndex}`;
    const roomUsers: User[] = [];
    for (
      let playerIndex = 0;
      playerIndex < config.playersPerRoom;
      playerIndex += 1
    ) {
      const session = await client.authenticateCustom(
        `${runId}-r${roomIndex}-p${playerIndex}`,
        true,
      ).catch(async (error: unknown) => {
        throw await toError(error);
      });
      await provision(session.user_id!, projectId);
      const socket = client.createSocket(config.ssl, false);
      await socket.connect(session, true);
      const user = { session, socket };
      users.push(user);
      roomUsers.push(user);
    }
    const created = await rpc<{ matchId: string }>(
      roomUsers[0]!,
      "loki_create_room",
      { roomKey: `${runId}-room-${roomIndex}` },
    );
    const creator = roomUsers[0]!;
    await creator.socket.joinMatch(created.matchId);
    await Promise.all(
      roomUsers.slice(1).map((user) => user.socket.joinMatch(created.matchId)),
    );
    const snapshot = await rpc<{ hostId?: string; version?: number }>(
      creator,
      "loki_room_snapshot",
      { matchId: created.matchId },
    );
    const host =
      roomUsers.find((user) => user.session.user_id === snapshot.hostId) ??
      creator;
    const room: Room = {
      matchId: created.matchId,
      host,
      projectId,
      version: typeof snapshot.version === "number" ? snapshot.version : 0,
      sequence: 0,
      waiters: [],
    };
    attachHostListener(room);
    rooms.push(room);
    console.error(`provisioned room ${roomIndex + 1}/${config.rooms}`);
  }

  counting = true;
  const deadline = performance.now() + config.durationSeconds * 1_000;
  const intervalMs = 1_000 / config.updatesPerSecond;
  let tick = 0;
  let lastProgress = 0;
  while (performance.now() < deadline) {
    const tickStarted = performance.now();
    tick += 1;
    await Promise.allSettled(
      rooms.map((room) =>
        hostStateUpdate(room, { tick, sentAt: Date.now() }),
      ),
    );
    if (tickStarted - lastProgress >= 30_000) {
      lastProgress = tickStarted;
      const elapsed = Math.round((tickStarted - (deadline - config.durationSeconds * 1_000)) / 1_000);
      console.error(
        `load tick=${tick} elapsed=${elapsed}s attempts=${attempts} errors=${errors} p95=${Math.round(percentile(latencies, 0.95))}ms`,
      );
    }
    const remaining = intervalMs - (performance.now() - tickStarted);
    if (remaining > 0) await sleep(remaining);
  }

  if (config.recoveryActionUrl) {
    counting = false;
    users.forEach((user) => user.socket.disconnect(false));
    console.error("issuing Nakama restart");
    const response = await fetch(config.recoveryActionUrl, {
      method: "POST",
      headers: process.env.LOKI_RECOVERY_ACTION_TOKEN
        ? {
            authorization: `Bearer ${process.env.LOKI_RECOVERY_ACTION_TOKEN}`,
          }
        : undefined,
    });
    if (!response.ok) {
      throw new Error(
        `recovery action failed (${response.status}): ${await response.text()}`,
      );
    }
    const recoveryStarted = performance.now();
    const recoveryDeadline = Date.now() + config.recoverySeconds * 1_000;
    await waitReady(recoveryDeadline);

    const stillAlive = (
      await Promise.all(rooms.map((room) => oldRoomStillAlive(room.matchId)))
    ).filter(Boolean).length;

    let newRoomUpdatesOk = false;
    let probeError: string | undefined;
    while (Date.now() < recoveryDeadline) {
      const probeSocket = client.createSocket(config.ssl, false);
      try {
        const probeSession = await client.authenticateCustom(
          `${runId}-failclosed-host-${Date.now().toString(36)}`,
          true,
        );
        await provision(probeSession.user_id!, `${runId}-failclosed-new`);
        await probeSocket.connect(probeSession, true);
        const probe: User = { session: probeSession, socket: probeSocket };
        const created = await rpc<{ matchId: string }>(probe, "loki_create_room", {
          roomKey: `${runId}-new-${Date.now().toString(36)}`.slice(0, 64),
        });
        await probeSocket.joinMatch(created.matchId);
        const updated = await rpc<{ ok: boolean }>(probe, "loki_room_update", {
          matchId: created.matchId,
          expectedVersion: 0,
          state: { afterRestart: true },
        });
        newRoomUpdatesOk = updated.ok === true;
        if (newRoomUpdatesOk) break;
        probeError = "new room update returned not ok";
      } catch (error) {
        probeError = await describeError(error);
      } finally {
        probeSocket.disconnect(false);
      }
      await sleep(1_000);
    }

    recovery = {
      attempted: true,
      mode: "fail-closed",
      actionUrl: new URL(config.recoveryActionUrl).origin,
      oldRoomsDead: stillAlive === 0,
      oldRoomsChecked: rooms.length,
      oldRoomsStillAlive: stillAlive,
      newRoomUpdatesOk,
      durationMs: performance.now() - recoveryStarted,
    };
    if (!newRoomUpdatesOk && probeError) {
      console.error(`new room probe failed: ${probeError}`);
    }
  }

  const errorRatio = attempts === 0 ? 1 : errors / attempts;
  const p95RttMs = percentile(latencies, 0.95);
  const passed =
    errorRatio < config.maxErrorRatio &&
    p95RttMs <= config.maxRttMs &&
    (!config.requireRecovery ||
      (recovery.attempted &&
        recovery.mode === "fail-closed" &&
        recovery.oldRoomsDead &&
        recovery.newRoomUpdatesOk &&
        recovery.durationMs <= config.recoverySeconds * 1_000));
  await writeArtifact(passed);
  if (!passed) throw new Error("load/recovery budgets were not met");
} catch (error) {
  const message = await describeError(error);
  console.error(message);
  if (!artifactWritten) {
    await writeArtifact(false, { error: message }).catch((writeError: unknown) => {
      console.error(`failed to write artifact: ${String(writeError)}`);
    });
  }
  throw new Error(message);
} finally {
  users.forEach((user) => user.socket.disconnect(false));
}
}

// --- Realtime (RealtimeRoom / protocol-v2) load and recovery mode ---
//
// RealtimeRoom's data plane (protocol-v2, opcodes 17-19) is exercised
// directly over raw nakama-js sockets here (mirroring the low-level
// synchronized-mode harness above) rather than through the JS SDK, so this
// stresses the Nakama runtime's realtime input/snapshot/sync handling,
// authority/round fencing and rate limiting under sustained concurrent load.
async function runRealtimeMode(): Promise<void> {
  type RealtimeUser = { session: Session; socket: Socket };
  type RealtimeRoomState = {
    matchId: string;
    users: RealtimeUser[];
    hostUserId: string;
    authorityEpoch: number;
    roundSequence: number;
    hostSnapshotSequence: number;
    simulationTick: number;
    inFlightSnapshots: number;
    v2Sequence: Map<string, number>;
    pendingSnapshots: Map<number, number>;
    pendingInputs: Array<{ playerId: string; inputSequence: number; sentAt: number }>;
    inputSequence: Map<string, number>;
    // Highest realtime_input inputSequence the host has observed per sender;
    // echoed back as processedInputCursors on the next published snapshot,
    // mirroring how a real RealtimeRoom host acknowledges guest inputs.
    hostProcessedCursors: Map<string, number>;
    migration?: { disconnectedAt: number; previousHostId: string; resolved: boolean };
  };

  const realtimeUsers: RealtimeUser[] = [];
  const realtimeRooms: RealtimeRoomState[] = [];
  const snapshotLatencies: number[] = [];
  const inputLatencies: number[] = [];
  const migrationDurations: number[] = [];
  let snapshotAttempts = 0;
  let snapshotErrors = 0;
  let inputAttempts = 0;
  let inputErrors = 0;
  let bytesSent = 0;
  let coalescedTicks = 0;
  let realtimeCounting = false;
  const startedAt = new Date();
  let artifactWritten = false;

  const nextV2Sequence = (room: RealtimeRoomState, userId: string): number => {
    const next = (room.v2Sequence.get(userId) ?? 0) + 1;
    room.v2Sequence.set(userId, next);
    return next;
  };

  const sendRealtimeEnvelope = async (
    user: RealtimeUser,
    room: RealtimeRoomState,
    opCode: number,
    body: Record<string, unknown>,
  ): Promise<void> => {
    const payload = JSON.stringify({
      protocolVersion: REALTIME_PROTOCOL_VERSION,
      roomId: room.matchId,
      sequence: nextV2Sequence(room, user.session.user_id!),
      ...body,
    });
    bytesSent += payload.length;
    await user.socket.sendMatchState(room.matchId, opCode, payload);
  };

  const attachRealtimeListener = (room: RealtimeRoomState, user: RealtimeUser): void => {
    // Each user is only ever attached to one room in this harness, so this
    // replaces nakama-js's default (window-referencing, Node-incompatible)
    // no-op handler rather than chaining onto it.
    user.socket.onmatchdata = (message) => {
      if (message.match_id !== room.matchId) return;
      let data: Record<string, unknown>;
      try {
        const raw = message.data;
        data = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
      } catch {
        return;
      }
      if (message.op_code === REALTIME_OPCODES.input && data.type === "realtime_input") {
        // Only the host receives routed realtime_input; track the highest
        // inputSequence per sender so the next published snapshot can echo
        // real acknowledgement cursors back to guests.
        const senderId = data.senderId as string;
        const inputSequence = data.inputSequence as number;
        const current = room.hostProcessedCursors.get(senderId) ?? -1;
        if (inputSequence > current) room.hostProcessedCursors.set(senderId, inputSequence);
        return;
      }
      if (message.op_code === REALTIME_OPCODES.snapshot && data.type === "realtime_snapshot") {
        const tick = data.simulationTick as number;
        const sentAt = room.pendingSnapshots.get(tick);
        if (sentAt !== undefined) {
          room.pendingSnapshots.delete(tick);
          if (realtimeCounting) snapshotLatencies.push(performance.now() - sentAt);
          room.inFlightSnapshots = Math.max(0, room.inFlightSnapshots - 1);
        }
        const cursors = (data.processedInputCursors as Record<string, number>) ?? {};
        const acked = cursors[user.session.user_id!];
        if (acked !== undefined) {
          room.pendingInputs = room.pendingInputs.filter((pending) => {
            if (pending.playerId !== user.session.user_id || pending.inputSequence > acked) return true;
            if (realtimeCounting) inputLatencies.push(performance.now() - pending.sentAt);
            return false;
          });
        }
        if (room.migration && !room.migration.resolved && data.hostId !== room.migration.previousHostId) {
          room.migration.resolved = true;
          migrationDurations.push(performance.now() - room.migration.disconnectedAt);
        }
        return;
      }
      if (message.op_code === REALTIME_OPCODES.snapshot && data.type === "error") {
        if (realtimeCounting) snapshotErrors += 1;
        return;
      }
      if (message.op_code === REALTIME_OPCODES.input && data.type === "error") {
        if (realtimeCounting) inputErrors += 1;
        return;
      }
      if (message.op_code === 13 && data.type === "host_changed") {
        room.hostUserId = data.hostId as string;
        room.authorityEpoch += 1;
        room.hostSnapshotSequence = 0;
      }
    };
  };

  try {
    for (let roomIndex = 0; roomIndex < config.rooms; roomIndex += 1) {
      const projectId = `${runId}-realtime-${roomIndex}`;
      const roomUsers: RealtimeUser[] = [];
      for (let playerIndex = 0; playerIndex < config.playersPerRoom; playerIndex += 1) {
        const session = await client.authenticateCustom(
          `${runId}-rt-r${roomIndex}-p${playerIndex}`,
          true,
        );
        await provision(session.user_id!, projectId);
        const socket = client.createSocket(config.ssl, false);
        await socket.connect(session, true);
        const user = { session, socket };
        realtimeUsers.push(user);
        roomUsers.push(user);
      }
      const created = await rpc<{ matchId: string }>(roomUsers[0]!, "loki_create_room", {
        roomKey: `${runId}-rt-room-${roomIndex}`,
      });
      await roomUsers[0]!.socket.joinMatch(created.matchId, undefined, { realtimeCapable: "true" });
      await Promise.all(
        roomUsers.slice(1).map((user) =>
          user.socket.joinMatch(created.matchId, undefined, { realtimeCapable: "true" }),
        ),
      );
      const room: RealtimeRoomState = {
        matchId: created.matchId,
        users: roomUsers,
        hostUserId: roomUsers[0]!.session.user_id!,
        authorityEpoch: 0,
        roundSequence: 0,
        hostSnapshotSequence: 0,
        simulationTick: 0,
        inFlightSnapshots: 0,
        v2Sequence: new Map(),
        pendingSnapshots: new Map(),
        pendingInputs: [],
        inputSequence: new Map(),
        hostProcessedCursors: new Map(),
      };
      for (const user of roomUsers) attachRealtimeListener(room, user);
      realtimeRooms.push(room);
      console.error(`provisioned realtime room ${roomIndex + 1}/${config.rooms}`);
    }

    realtimeCounting = true;
    const deadline = performance.now() + config.durationSeconds * 1_000;
    // Snapshot cadence is capped at the runtime's 25 Hz limit; the host's
    // own simulation runs at a representative 60 Hz internally (modeled
    // here by advancing simulationTick several times per published snapshot).
    const snapshotHz = Math.min(config.updatesPerSecond, 25);
    const snapshotIntervalMs = 1_000 / snapshotHz;
    const inputIntervalMs = 1_000 / 15; // representative control traffic, under the 20 Hz cap
    const maxInFlightSnapshots = Math.max(3, Math.ceil((250 / 1000) * snapshotHz));
    let lastProgress = 0;
    // Force one host migration partway through the run, on a fixed subset
    // of rooms, to validate realtime authority handoff under load.
    const migrationAtMs = config.durationSeconds * 500;
    const migrationRoomCount = Math.min(3, realtimeRooms.length);
    let migrationTriggered = false;

    const snapshotLoop = setInterval(() => {
      void Promise.allSettled(
        realtimeRooms.map(async (room) => {
          const host = room.users.find((user) => user.session.user_id === room.hostUserId);
          if (!host) return;
          if (room.inFlightSnapshots >= maxInFlightSnapshots) {
            coalescedTicks += 1;
            return;
          }
          room.simulationTick += Math.max(1, Math.round(60 / snapshotHz));
          room.hostSnapshotSequence += 1;
          room.inFlightSnapshots += 1;
          snapshotAttempts += 1;
          const sentAt = performance.now();
          room.pendingSnapshots.set(room.simulationTick, sentAt);
          const processedInputCursors = Object.fromEntries(room.hostProcessedCursors);
          try {
            await sendRealtimeEnvelope(host, room, REALTIME_OPCODES.snapshot, {
              type: "realtime_snapshot",
              authorityEpoch: room.authorityEpoch,
              roundSequence: room.roundSequence,
              simulationTick: room.simulationTick,
              hostSnapshotSequence: room.hostSnapshotSequence,
              processedInputCursors,
              state: { tick: room.simulationTick, sentAt: Date.now() },
            });
          } catch {
            snapshotErrors += 1;
            room.inFlightSnapshots = Math.max(0, room.inFlightSnapshots - 1);
            room.pendingSnapshots.delete(room.simulationTick);
          }
        }),
      );
    }, snapshotIntervalMs);

    const inputLoop = setInterval(() => {
      void Promise.allSettled(
        realtimeRooms.map((room) =>
          Promise.allSettled(
            room.users.map(async (user) => {
              const userId = user.session.user_id!;
              const inputSequence = (room.inputSequence.get(userId) ?? 0) + 1;
              room.inputSequence.set(userId, inputSequence);
              inputAttempts += 1;
              const sentAt = performance.now();
              room.pendingInputs.push({ playerId: userId, inputSequence, sentAt });
              try {
                await sendRealtimeEnvelope(user, room, REALTIME_OPCODES.input, {
                  type: "realtime_input",
                  roundSequence: room.roundSequence,
                  inputSequence,
                  targetTick: room.simulationTick + 1,
                  delivery: "latest",
                  clientSendTime: Date.now(),
                  payload: { throttle: 50 },
                });
              } catch {
                inputErrors += 1;
              }
            }),
          ),
        ),
      );
    }, inputIntervalMs);

    while (performance.now() < deadline) {
      const elapsedMs = config.durationSeconds * 1_000 - (deadline - performance.now());
      if (!migrationTriggered && elapsedMs >= migrationAtMs) {
        migrationTriggered = true;
        for (const room of realtimeRooms.slice(0, migrationRoomCount)) {
          const currentHost = room.users.find((user) => user.session.user_id === room.hostUserId);
          if (!currentHost) continue;
          room.migration = {
            disconnectedAt: performance.now(),
            previousHostId: room.hostUserId,
            resolved: false,
          };
          currentHost.socket.disconnect(false);
        }
      }
      if (performance.now() - lastProgress >= 30_000) {
        lastProgress = performance.now();
        const elapsed = Math.round(elapsedMs / 1_000);
        console.error(
          `realtime load elapsed=${elapsed}s snapshots=${snapshotAttempts}/${snapshotErrors} inputs=${inputAttempts}/${inputErrors} coalesced=${coalescedTicks}`,
        );
      }
      await sleep(1_000);
    }
    clearInterval(snapshotLoop);
    clearInterval(inputLoop);
    // Allow the last in-flight round trips to settle before measuring.
    await sleep(500);

    const snapshotErrorRatio = snapshotAttempts === 0 ? 1 : snapshotErrors / snapshotAttempts;
    const inputErrorRatio = inputAttempts === 0 ? 1 : inputErrors / inputAttempts;
    const combinedErrorRatio =
      (snapshotAttempts + inputAttempts) === 0
        ? 1
        : (snapshotErrors + inputErrors) / (snapshotAttempts + inputAttempts);
    const p95SnapshotRttMs = percentile(snapshotLatencies, 0.95);
    const migrationsExpected = migrationTriggered ? migrationRoomCount : 0;
    const migrationsResolved = migrationDurations.length;
    const passed =
      combinedErrorRatio < config.maxErrorRatio &&
      p95SnapshotRttMs <= config.maxRttMs &&
      migrationsResolved === migrationsExpected;

    const artifact = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      startedAt: startedAt.toISOString(),
      mode: "realtime" as const,
      target: {
        playersPerRoom: config.playersPerRoom,
        rooms: config.rooms,
        snapshotHz,
        inputHz: 15,
        maxInFlightSnapshots,
        durationSeconds: config.durationSeconds,
      },
      budgets: {
        maxErrorRatio: config.maxErrorRatio,
        maxP95SnapshotRttMs: config.maxRttMs,
      },
      measurements: {
        snapshotAttempts,
        snapshotErrors,
        snapshotErrorRatio,
        inputAttempts,
        inputErrors,
        inputErrorRatio,
        combinedErrorRatio,
        p50SnapshotRttMs: percentile(snapshotLatencies, 0.5),
        p95SnapshotRttMs,
        p99SnapshotRttMs: percentile(snapshotLatencies, 0.99),
        p50InputAckMs: percentile(inputLatencies, 0.5),
        p95InputAckMs: percentile(inputLatencies, 0.95),
        rttJitterMs:
          snapshotLatencies.length < 2
            ? 0
            : Math.max(...snapshotLatencies) - Math.min(...snapshotLatencies),
        bytesSent,
        bytesPerSecond: bytesSent / config.durationSeconds,
        coalescedTicks,
        migration: {
          expected: migrationsExpected,
          resolved: migrationsResolved,
          durationsMs: migrationDurations,
          p95DurationMs: percentile(migrationDurations, 0.95),
        },
      },
      passed,
    };
    await mkdir(resolve(config.output, ".."), { recursive: true });
    await writeFile(resolve(config.output), `${JSON.stringify(artifact, null, 2)}\n`, { flag: "wx" });
    artifactWritten = true;
    console.log(JSON.stringify(artifact, null, 2));
    if (!passed) throw new Error("realtime load/recovery budgets were not met");
  } catch (error) {
    const message = await describeError(error);
    console.error(message);
    if (!artifactWritten) {
      const fallback = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        startedAt: startedAt.toISOString(),
        mode: "realtime" as const,
        error: message,
        passed: false,
      };
      await mkdir(resolve(config.output, ".."), { recursive: true }).catch(() => undefined);
      await writeFile(resolve(config.output), `${JSON.stringify(fallback, null, 2)}\n`, { flag: "wx" }).catch(
        (writeError: unknown) => console.error(`failed to write artifact: ${String(writeError)}`),
      );
    }
    throw new Error(message);
  } finally {
    realtimeUsers.forEach((user) => user.socket.disconnect(false));
  }
}
