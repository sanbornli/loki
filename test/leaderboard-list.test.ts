import assert from "node:assert/strict";
import test from "node:test";
import {
  LokiClient,
  type ConnectionEvent,
  type JoinedRoom,
  type LeaderboardListInput,
  type LokiTransport,
} from "../packages/sdk-js/src/index.js";

test("listing a leaderboard ignores the server ok and code fields", async () => {
  const transport: LokiTransport = {
    async authenticate() {
      return { playerId: crypto.randomUUID() };
    },
    async createRoom(): Promise<JoinedRoom> {
      throw new Error("unused");
    },
    async joinRoom(): Promise<JoinedRoom> {
      throw new Error("unused");
    },
    async send() {},
    subscribe(_listener: (message: unknown) => void) {
      return () => {};
    },
    subscribeConnection(_listener: (event: ConnectionEvent) => void) {
      return () => {};
    },
    async close() {},
    async listLeaderboard(_input: LeaderboardListInput) {
      return {
        ok: true,
        code: "OK",
        leaderboardId: "season",
        records: [
          {
            playerId: "player-1",
            displayName: "Ada",
            score: 10,
            subscore: 0,
            rank: 1,
          },
        ],
        nextCursor: "page-2",
      } as never;
    },
  };
  const client = new LokiClient({ projectId: crypto.randomUUID(), transport });
  await client.authenticate("token");
  const page = await client.listLeaderboard("season");
  assert.equal(page.leaderboardId, "season");
  assert.equal(page.nextCursor, "page-2");
  assert.equal(page.records.length, 1);
  assert.equal(page.records[0]?.displayName, "Ada");
  assert.equal("ok" in page, false);
  assert.equal("code" in page, false);
});
