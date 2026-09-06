import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client, type Session, type Socket } from "@heroiclabs/nakama-js";
import WebSocket from "ws";

globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;

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

const config = {
  host: process.env.NAKAMA_HOST ?? "127.0.0.1",
  port: process.env.NAKAMA_PORT ?? "7350",
  ssl: process.env.NAKAMA_SSL === "true",
  serverKey: process.env.NAKAMA_SERVER_KEY ?? "defaultkey",
  httpKey: process.env.NAKAMA_HTTP_KEY,
  playersPerRoom: numberArg("players", 16),
  rooms: numberArg("rooms", 20),
  updatesPerSecond: numberArg("updates-per-second", 5),
  durationSeconds: numberArg("duration-seconds", 600),
  maxErrorRatio: numberArg("max-error-percent", 1) / 100,
  maxRttMs: numberArg("max-rtt-ms", 250),
  recoverySeconds: numberArg("recovery-seconds", 60),
  minimumRecoveryRatio: numberArg("minimum-recovery-percent", 95) / 100,
  recoveryActionUrl: stringArg("recovery-action-url"),
  requireRecovery: process.argv.includes("--require-recovery"),
  output:
    stringArg("output") ?? "artifacts/release/load-recovery.json",
};
if (!config.httpKey) {
  throw new Error("NAKAMA_HTTP_KEY is required; the harness will not guess production credentials");
}
if (
  config.playersPerRoom !== 16 ||
  config.rooms < 20 ||
  config.updatesPerSecond < 5 ||
  config.updatesPerSecond > 10 ||
  config.durationSeconds < 600
) {
  throw new Error(
    "release evidence requires exactly 16 players/room, at least 20 rooms, 5-10 updates/s, and at least 600 seconds",
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
const rooms: { matchId: string; host: User; version: number }[] = [];
const latencies: number[] = [];
let attempts = 0;
let errors = 0;

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
  attempts += 1;
  try {
    const response = await client.rpc(user.session, id, input);
    latencies.push(performance.now() - started);
    return response.payload as T;
  } catch (error) {
    errors += 1;
    throw error;
  }
}

async function reconnectAndSnapshot(
  user: User,
  matchId: string,
  deadline: number,
): Promise<boolean> {
  while (Date.now() < deadline) {
    try {
      user.socket = client.createSocket(config.ssl, false);
      await user.socket.connect(user.session, true);
      await user.socket.joinMatch(matchId);
      await rpc(user, "loki_room_snapshot", { matchId });
      return true;
    } catch {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_000));
    }
  }
  return false;
}

let recovery:
  | {
      attempted: true;
      actionUrl: string;
      recovered: number;
      total: number;
      ratio: number;
      durationMs: number;
    }
  | { attempted: false } = { attempted: false };

try {
  for (let roomIndex = 0; roomIndex < config.rooms; roomIndex += 1) {
    const projectId = `${runId}-project`;
    const roomUsers: User[] = [];
    for (
      let playerIndex = 0;
      playerIndex < config.playersPerRoom;
      playerIndex += 1
    ) {
      const session = await client.authenticateCustom(
        `${runId}-r${roomIndex}-p${playerIndex}`,
        true,
      );
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
    await Promise.all(
      roomUsers.map((user) => user.socket.joinMatch(created.matchId)),
    );
    rooms.push({ matchId: created.matchId, host: roomUsers[0]!, version: 0 });
  }

  const startedAt = new Date();
  const deadline = performance.now() + config.durationSeconds * 1_000;
  const intervalMs = 1_000 / config.updatesPerSecond;
  let tick = 0;
  let recoveryTriggered = false;
  while (performance.now() < deadline) {
    const tickStarted = performance.now();
    tick += 1;
    await Promise.allSettled(
      rooms.map(async (room) => {
        const result = await rpc<{ ok: boolean; version: number }>(
          room.host,
          "loki_room_update",
          {
            matchId: room.matchId,
            expectedVersion: room.version,
            state: { tick, sentAt: Date.now() },
          },
        );
        if (!result.ok) {
          errors += 1;
          return;
        }
        room.version = result.version;
      }),
    );

    if (
      config.recoveryActionUrl &&
      !recoveryTriggered &&
      performance.now() >=
        deadline - (config.durationSeconds * 1_000) / 2
    ) {
      recoveryTriggered = true;
      users.forEach((user) => user.socket.disconnect(false));
      const recoveryStarted = performance.now();
      const response = await fetch(config.recoveryActionUrl, {
        method: "POST",
        headers: process.env.LOKI_RECOVERY_ACTION_TOKEN
          ? {
              authorization: `Bearer ${process.env.LOKI_RECOVERY_ACTION_TOKEN}`,
            }
          : undefined,
      });
      if (!response.ok) {
        throw new Error(`recovery action failed (${response.status})`);
      }
      const recoveryDeadline = Date.now() + config.recoverySeconds * 1_000;
      const recovered = (
        await Promise.all(
          users.map((user, index) =>
            reconnectAndSnapshot(
              user,
              rooms[Math.floor(index / config.playersPerRoom)]!.matchId,
              recoveryDeadline,
            ),
          ),
        )
      ).filter(Boolean).length;
      recovery = {
        attempted: true,
        actionUrl: new URL(config.recoveryActionUrl).origin,
        recovered,
        total: users.length,
        ratio: recovered / users.length,
        durationMs: performance.now() - recoveryStarted,
      };
    }
    const remaining = intervalMs - (performance.now() - tickStarted);
    if (remaining > 0) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, remaining));
    }
  }

  const errorRatio = attempts === 0 ? 1 : errors / attempts;
  const p95RttMs = percentile(latencies, 0.95);
  const passed =
    errorRatio < config.maxErrorRatio &&
    p95RttMs <= config.maxRttMs &&
    (!config.requireRecovery ||
      (recovery.attempted &&
        recovery.ratio >= config.minimumRecoveryRatio &&
        recovery.durationMs <= config.recoverySeconds * 1_000));
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
      minimumRecoveryRatio: config.minimumRecoveryRatio,
      maxRecoverySeconds: config.recoverySeconds,
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
  };
  await mkdir(resolve(config.output, ".."), { recursive: true });
  await writeFile(resolve(config.output), `${JSON.stringify(artifact, null, 2)}\n`, {
    flag: "wx",
  });
  if (!passed) throw new Error("load/recovery budgets were not met");
  console.log(JSON.stringify(artifact, null, 2));
} finally {
  users.forEach((user) => user.socket.disconnect(false));
}
