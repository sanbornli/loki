import assert from "node:assert/strict";
import test from "node:test";
import { type Socket } from "@heroiclabs/nakama-js";
import {
  FirstPartyTransport,
  LokiClient,
  type ServerEnvelope,
} from "../packages/sdk-js/src/index.js";

type Member = {
  playerId: string;
  sessionId: string;
  joinedAt: number;
  host: boolean;
};

type FakeSocket = Socket & {
  onmatchdata: ((message: { match_id: string; op_code: number; data: Uint8Array }) => void) | null;
};

type Room = {
  matchId: string;
  inviteCode: string;
  hostId: string;
  sequence: number;
  members: Member[];
  sockets: Set<FakeSocket>;
};

const rooms = new Map<string, Room>();

const jwt = (playerId: string): string => {
  const body = Buffer.from(JSON.stringify({ uid: playerId, exp: 4_000_000_000 })).toString(
    "base64url",
  );
  return `eyJhbGciOiJub25lIn0.${body}.c2ln`;
};

const presence = (room: Room) => ({
  protocolVersion: 1,
  roomId: room.matchId,
  sequence: ++room.sequence,
  type: "presence",
  joins: room.members.slice(-1),
  leaves: [],
  members: room.members,
  membersComplete: true,
  membershipRevision: room.members.length,
});

const deliver = (room: Room): void => {
  const data = new TextEncoder().encode(JSON.stringify(presence(room)));
  for (const peer of room.sockets) {
    peer.onmatchdata?.({ match_id: room.matchId, op_code: 2, data });
  }
};

const fakeSocket = (playerId: string): FakeSocket => {
  const socket = {
    onmatchdata: null,
    ondisconnect: null,
    connect: async () => undefined,
    joinMatch: async (matchId: string) => {
      const room = rooms.get(matchId);
      if (!room) throw new Error("missing room");
      room.members.push({
        playerId,
        sessionId: crypto.randomUUID(),
        joinedAt: 1,
        host: room.members.length === 0,
      });
      if (!room.hostId) room.hostId = playerId;
      room.sockets.add(socket as unknown as FakeSocket);
      deliver(room);
    },
    leaveMatch: async () => undefined,
    sendMatchState: async () => undefined,
  };
  return socket as unknown as FakeSocket;
};

const clientFor = async (playerId: string): Promise<{
  client: LokiClient;
  messages: ServerEnvelope[];
}> => {
  const transport = new FirstPartyTransport({
    secure: false,
    nakamaHost: "127.0.0.1",
    sessionProvider: async () => ({ token: jwt(playerId), playerId }),
    nakamaClient: {
      rpc: async (_session, id, input) => {
        const body = (input ?? {}) as { inviteCode?: string; matchId?: string };
        if (id === "loki_create_room") {
          const matchId = crypto.randomUUID();
          const room: Room = {
            matchId,
            inviteCode: "123456",
            hostId: "",
            sequence: 0,
            members: [],
            sockets: new Set(),
          };
          rooms.set(matchId, room);
          return { payload: { matchId, inviteCode: room.inviteCode, roomKey: "room-key" } };
        }
        if (id === "loki_join_room") {
          const room = [...rooms.values()].find((entry) => entry.inviteCode === body.inviteCode);
          if (!room) throw new Error("invite not found");
          return { payload: { matchId: room.matchId, inviteCode: room.inviteCode } };
        }
        if (id === "loki_room_snapshot") {
          const room = rooms.get(body.matchId ?? "");
          if (!room) throw new Error("missing room");
          // The live snapshot RPC returns no roster the client can keep.
          // Membership has to arrive on the match socket instead.
          return {
            payload: {
              ok: true,
              hostId: room.hostId,
              version: 0,
              stateVersion: 0,
              state: {},
              capabilities: { synchronized_rooms: true },
            },
          };
        }
        throw new Error(`unexpected rpc ${id}`);
      },
      createSocket: () => fakeSocket(playerId),
      sessionRefresh: async (session) => session,
    },
  });
  const client = new LokiClient({ projectId: crypto.randomUUID(), transport });
  const messages: ServerEnvelope[] = [];
  client.onMessage((message) => {
    messages.push(message);
  });
  await client.authenticate("token");
  return { client, messages };
};

const rosterSizes = (messages: ServerEnvelope[]): number[] =>
  messages
    .filter((message) => message.type === "presence")
    .map((message) => (message.type === "presence" ? message.members.length : 0));

test("create and join deliver the roster while the match is being entered", async () => {
  const creatorId = crypto.randomUUID();
  const joinerId = crypto.randomUUID();
  const creator = await clientFor(creatorId);
  const created = await creator.client.createRoom({ visibility: "private" });
  assert.deepEqual(rosterSizes(creator.messages), [1]);

  const joiner = await clientFor(joinerId);
  await joiner.client.joinRoom({ inviteCode: created.inviteCode });
  assert.deepEqual(rosterSizes(joiner.messages), [2]);
  assert.deepEqual(rosterSizes(creator.messages), [1, 2]);
});
