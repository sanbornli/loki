import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client, type Session, type Socket } from "@heroiclabs/nakama-js";
import WebSocket from "ws";

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
