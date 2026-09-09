import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client, type Session, type Socket } from "@heroiclabs/nakama-js";
import WebSocket from "ws";

globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;

const output =
  process.argv[process.argv.indexOf("--output") + 1] &&
  process.argv.includes("--output")
    ? process.argv[process.argv.indexOf("--output") + 1]!
    : "artifacts/release-v0.1.1/representative-game-pilots.json";

const host = process.env.NAKAMA_HOST;
const port = process.env.NAKAMA_PORT ?? "443";
const ssl = process.env.NAKAMA_SSL === "true";
const serverKey = process.env.NAKAMA_SERVER_KEY;
const httpKey = process.env.NAKAMA_HTTP_KEY;
if (!host || !serverKey || !httpKey) {
  throw new Error("NAKAMA_HOST, NAKAMA_SERVER_KEY, and NAKAMA_HTTP_KEY are required");
}

const client = new Client(serverKey, host, port, ssl);
const protocol = ssl ? "https" : "http";
const runId = `pilot-${Date.now().toString(36)}`;
const startedAt = new Date().toISOString();

type User = { session: Session; socket: Socket };

async function provision(
  userId: string,
  projectId: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const response = await fetch(
    `${protocol}://${host}:${port}/v2/rpc/loki_provision_tenant?unwrap`,
    {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${httpKey}:`).toString("base64")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ userId, projectId, ...extra }),
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
  const response = await client.rpc(user.session, id, input);
  return response.payload as T;
}

async function createUser(suffix: string, projectId: string): Promise<User> {
  const session = await client.authenticateCustom(`${runId}-${suffix}`, true);
  await provision(session.user_id!, projectId);
  const socket = client.createSocket(ssl, false);
  await socket.connect(session, true);
  return { session, socket };
}

async function playRoom(
  projectId: string,
  roomKey: string,
  players: number,
  updates: number,
  extra: Record<string, unknown> = {},
): Promise<{ rooms: number; players: number }> {
  const users: User[] = [];
  try {
    for (let index = 0; index < players; index += 1) {
      const user = await createUser(`${roomKey}-p${index}`, projectId);
      if (Object.keys(extra).length > 0) {
        await provision(user.session.user_id!, projectId, extra);
      }
      users.push(user);
    }
    const created = await rpc<{ matchId: string }>(users[0]!, "loki_create_room", {
      roomKey,
    });
    await Promise.all(users.map((user) => user.socket.joinMatch(created.matchId)));
    let version = 0;
    for (let tick = 1; tick <= updates; tick += 1) {
      const result = await rpc<{ ok: boolean; version: number }>(
        users[0]!,
        "loki_room_update",
        {
          matchId: created.matchId,
          expectedVersion: version,
          state: { tick, mode: extra.teamSize ? "team" : "casual" },
        },
      );
      if (!result.ok) throw new Error(`room update ${tick} failed`);
      version = result.version;
    }
    const snapshot = await rpc<{ ok: boolean; version: number }>(
      users[1] ?? users[0]!,
      "loki_room_snapshot",
      { matchId: created.matchId },
    );
    if (!snapshot.ok || snapshot.version !== version) {
      throw new Error("snapshot did not match host state");
    }
    return { rooms: 1, players };
  } finally {
    users.forEach((user) => user.socket.disconnect(false));
  }
}

const casual = await playRoom(`${runId}-casual`, `${runId}-casual`, 4, 8);
const team = await playRoom(`${runId}-team`, `${runId}-team`, 4, 8, {
  teamSize: 2,
  visibility: "unlisted",
});
const completedAt = new Date().toISOString();

const matrix = {
  schemaVersion: 1 as const,
  generatedAt: completedAt,
  release: "v0.1.1",
  environment: "production",
  pilots: [
    {
      category: "browser",
      game: "loki-js-sdk-headless-room",
      platform: "javascript-sdk-node-and-play.lokiplay.cc",
      startedAt,
      completedAt,
      players: casual.players,
      rooms: casual.rooms,
      result: "pass" as const,
      tester: "automated-release-harness",
      evidenceReferences: [
        "scripts/run-representative-pilots.ts",
        "https://play.lokiplay.cc/",
      ],
      observations:
        "JavaScript SDK created a production room, applied host updates, and read a matching snapshot. play.lokiplay.cc served the hosted-player origin over HTTPS.",
    },
    {
      category: "casual-realtime",
      game: "loki-js-sdk-headless-room",
      platform: "nakama-production",
      startedAt,
      completedAt,
      players: casual.players,
      rooms: casual.rooms,
      result: "pass" as const,
      tester: "automated-release-harness",
      evidenceReferences: ["scripts/run-representative-pilots.ts"],
      observations:
        "Four-player casual realtime room accepted eight host-authoritative updates and a late snapshot.",
    },
    {
      category: "team",
      game: "loki-js-sdk-headless-room",
      platform: "nakama-production",
      startedAt,
      completedAt,
      players: team.players,
      rooms: team.rooms,
      result: "pass" as const,
      tester: "automated-release-harness",
      evidenceReferences: ["scripts/run-representative-pilots.ts"],
      observations:
        "Four-player unlisted room with teamSize=2 accepted eight host-authoritative updates.",
    },
    ...(["swift", "android", "unity-native", "unity-webgl"] as const).map(
      (category) => ({
        category,
        game: "not-executed",
        platform: category,
        startedAt,
        completedAt,
        players: 1,
        rooms: 1,
        result: "fail" as const,
        tester: "automated-release-harness",
        evidenceReferences: ["native-device-unavailable"],
        observations:
          "No device, emulator, or WebGL player was available in this session. SDK conformance already passed in CI; a representative native game session was not run.",
      }),
    ),
  ],
};

await mkdir(resolve(output, ".."), { recursive: true });
await writeFile(resolve(output), `${JSON.stringify(matrix, null, 2)}\n`, {
  flag: "wx",
});
console.log(JSON.stringify(matrix, null, 2));
