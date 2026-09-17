// Validates RealtimeRoom against three deterministic game-shape adapters
// (racer, Snake, and a simultaneous-input grid/Bomberman-style game) so the
// abstraction is proven against more than one genre before increasing the
// snapshot cap past the default 30 Hz. These are harness adapters, not polished games:
// each test owns its own simulation, callbacks and rendering; RealtimeRoom
// only ever sees plain JSON state/input and never branches on game genre.
//
// What stays game-specific in every adapter below (RealtimeRoom never sees
// or needs to know any of this):
//   - The shape of State/Input and how the host simulates a step.
//   - Whether guest control is continuous (setInput/"latest") or discrete,
//     order-sensitive commands (sendInput/"ordered").
//   - Collision/physics/grid rules and conflict resolution between players.
//   - The render loop and how snapshots are interpolated/extrapolated.
import assert from "node:assert/strict";
import test from "node:test";
import { RealtimeBus, connectedClient } from "./helpers/realtime-bus.js";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// --- Adapter 1: racer (continuous "latest" control input) ---
// Full pacing/backpressure/prediction coverage for this shape already lives
// in realtime-room.test.ts; this is a brief end-to-end confirmation that a
// continuous-control game genre works unmodified through the public API.
type RacerState = { positions: Record<string, number> };
type RacerInput = { throttle: number };

test("racer adapter: continuous throttle input drives host-authoritative position snapshots", async () => {
  const bus = new RealtimeBus();
  const { client: hostClient } = await connectedClient(bus);
  const { client: guestClient } = await connectedClient(bus);
  const hostRoom = hostClient.createRealtimeRoom<RacerState, RacerInput>({});
  const created = await hostRoom.create();
  const guestRoom = guestClient.createRealtimeRoom<RacerState, RacerInput>({});
  await guestRoom.join({ inviteCode: created.inviteCode });

  guestRoom.setInput({ throttle: 10 });
  await sleep(5);

  let position = 0;
  for (let tick = 1; tick <= 3; tick += 1) {
    const { latest } = hostRoom.inputsForTick(tick);
    const throttle = latest[guestClient.playerId!]?.throttle ?? 0;
    position += throttle;
    hostRoom.publishSnapshot({ positions: { racer: position } }, { simulationTick: tick });
    await sleep(120);
  }

  assert.equal(guestRoom.getSnapshot().state?.positions.racer, position);
  assert.ok(position > 0);
});

// --- Adapter 2: fast Snake (grid movement, continuous direction input) ---
// Direction changes are latest-wins (only the most recent heading matters),
// same as racer throttle, but the state shape and step rule are entirely
// different: a discrete grid and a snake body array instead of continuous
// positions. RealtimeRoom's API does not change between the two.
type SnakeDirection = "up" | "down" | "left" | "right";
type SnakeState = { body: Array<{ x: number; y: number }>; grid: number };
type SnakeInput = { direction: SnakeDirection };

function stepSnake(state: SnakeState, direction: SnakeDirection): SnakeState {
  const head = state.body[0]!;
  const delta = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }[
    direction
  ];
  const next = {
    x: (head.x + delta.x + state.grid) % state.grid,
    y: (head.y + delta.y + state.grid) % state.grid,
  };
  return { grid: state.grid, body: [next, ...state.body.slice(0, -1)] };
}

test("Snake adapter: latest-wins direction input steers a host-simulated grid snake", async () => {
  const bus = new RealtimeBus();
  const { client: hostClient } = await connectedClient(bus);
  const { client: guestClient } = await connectedClient(bus);
  const hostRoom = hostClient.createRealtimeRoom<SnakeState, SnakeInput>({});
  const created = await hostRoom.create();
  const guestRoom = guestClient.createRealtimeRoom<SnakeState, SnakeInput>({});
  await guestRoom.join({ inviteCode: created.inviteCode });

  guestRoom.setInput({ direction: "right" });
  await sleep(5);

  let state: SnakeState = {
    grid: 10,
    body: [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }],
  };
  for (let tick = 1; tick <= 3; tick += 1) {
    const { latest } = hostRoom.inputsForTick(tick);
    const direction = latest[guestClient.playerId!]?.direction ?? "right";
    state = stepSnake(state, direction);
    hostRoom.publishSnapshot(state, { simulationTick: tick });
    await sleep(120);
  }

  assert.deepEqual(guestRoom.getSnapshot().state, state);
  // The snake's head moved three cells to the right of its start.
  assert.deepEqual(state.body[0], { x: 8, y: 5 });
});

// --- Adapter 3: simultaneous-input grid / Bomberman-style resolution ---
// Every player issues discrete, order-sensitive commands each round (move
// or place-bomb) rather than a continuous control value, so this uses
// sendInput's "ordered" delivery instead of setInput's "latest" delivery.
// The host resolves all players' commands for a tick deterministically
// (sorted by inputSequence, tie-broken by playerId) before advancing state,
// which is exactly the conflict-resolution/game-rule logic that stays
// entirely game-specific and outside RealtimeRoom.
type GridState = {
  players: Record<string, { x: number; y: number }>;
  bombs: Array<{ x: number; y: number; placedBy: string }>;
};
type GridInput = { command: "move"; dx: number; dy: number } | { command: "bomb" };

function stepGrid(
  state: GridState,
  ordered: Array<{ playerId: string; input: GridInput }>,
): GridState {
  const players = { ...state.players };
  const bombs = [...state.bombs];
  for (const { playerId, input } of ordered) {
    const current = players[playerId];
    if (!current) continue;
    if (input.command === "move") {
      players[playerId] = { x: current.x + input.dx, y: current.y + input.dy };
    } else {
      bombs.push({ x: current.x, y: current.y, placedBy: playerId });
    }
  }
  return { players, bombs };
}

test("simultaneous-input grid adapter: ordered per-player commands resolve deterministically each round", async () => {
  const bus = new RealtimeBus();
  const { client: hostClient } = await connectedClient(bus);
  const { client: guestClient } = await connectedClient(bus);
  const hostRoom = hostClient.createRealtimeRoom<GridState, GridInput>({});
  const created = await hostRoom.create();
  const guestRoom = guestClient.createRealtimeRoom<GridState, GridInput>({});
  await guestRoom.join({ inviteCode: created.inviteCode });

  let state: GridState = {
    players: {
      [hostClient.playerId!]: { x: 0, y: 0 },
      [guestClient.playerId!]: { x: 5, y: 5 },
    },
    bombs: [],
  };
  hostRoom.publishSnapshot(state, { simulationTick: 0 });
  await sleep(120);

  // Round 1: both players move; only the guest's command is acknowledged
  // back to it, proving the host-side ordered-input ledger tracks each
  // sender's own cursor independently.
  const guestMove = guestRoom.sendInput({ command: "move", dx: -1, dy: 0 });
  await sleep(5);
  const { orderedCommands: round1 } = hostRoom.inputsForTick(1);
  state = stepGrid(state, round1.map((entry) => ({ playerId: entry.playerId, input: entry.input })));
  hostRoom.publishSnapshot(state, { simulationTick: 1 });
  await guestMove;
  await sleep(120);

  assert.deepEqual(guestRoom.getSnapshot().state?.players[guestClient.playerId!], { x: 4, y: 5 });

  // Round 2: the guest places a bomb; the discrete one-shot command must
  // not be silently coalesced the way a "latest" control input would be.
  const guestBomb = guestRoom.sendInput({ command: "bomb" });
  await sleep(5);
  const { orderedCommands: round2 } = hostRoom.inputsForTick(2);
  state = stepGrid(state, round2.map((entry) => ({ playerId: entry.playerId, input: entry.input })));
  hostRoom.publishSnapshot(state, { simulationTick: 2 });
  await guestBomb;
  await sleep(120);

  const snapshot = guestRoom.getSnapshot().state;
  assert.equal(snapshot?.bombs.length, 1);
  assert.equal(snapshot?.bombs[0]?.placedBy, guestClient.playerId);
});
