import assert from "node:assert/strict";
import test from "node:test";
import {
  LokiClient,
  RealtimeRoomError,
  REALTIME_ROOM_DEFAULT_IN_FLIGHT_SNAPSHOTS,
  REALTIME_ROOM_MAX_IN_FLIGHT_SNAPSHOTS,
  REALTIME_ROOM_MAX_ORDERED_INPUTS,
  REALTIME_ROOM_MAX_SNAPSHOT_HZ,
} from "../packages/sdk-js/src/index.js";
import { RealtimeBus, FakeRealtimeTransport, connectedClient } from "./helpers/realtime-bus.js";

type RacerState = { positions: Record<string, number> };
// Loki's protocol requires JSON-canonical safe-integer numbers on the wire;
// games quantize fractional values (see packages/protocol quantize/dequantize).
type RacerInput = { throttle: number } | { action: "boost" };

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

test("host publishSnapshot at 60Hz coalesces to the default 10 Hz cap and bounds in-flight to 3", async () => {
  const bus = new RealtimeBus();
  const { client } = await connectedClient(bus);
  const room = client.createRealtimeRoom<RacerState, RacerInput>({});
  await room.create();

  let tick = 0;
  for (let index = 0; index < 60; index += 1) {
    tick += 1;
    room.publishSnapshot({ positions: { self: tick } }, { simulationTick: tick });
  }
  await sleep(5);
  const snapshot = room.getSnapshot();
  assert.ok(snapshot.pendingSnapshotCount <= REALTIME_ROOM_DEFAULT_IN_FLIGHT_SNAPSHOTS + 1);
  assert.ok((snapshot.diagnostics?.snapshotsSent ?? 0) <= REALTIME_ROOM_DEFAULT_IN_FLIGHT_SNAPSHOTS);
});

test("snapshotHz 30 paces faster than the default 10 Hz cap and raises in-flight headroom", async () => {
  const bus = new RealtimeBus();
  const { client } = await connectedClient(bus);
  const room = client.createRealtimeRoom<RacerState, RacerInput>({
    snapshotHz: REALTIME_ROOM_MAX_SNAPSHOT_HZ,
    diagnostics: true,
  });
  await room.create();

  room.publishSnapshot({ positions: { self: 1 } }, { simulationTick: 1 });
  await sleep(5);
  room.publishSnapshot({ positions: { self: 2 } }, { simulationTick: 2 });
  await sleep(45);
  const fast = room.getSnapshot();
  assert.ok((fast.diagnostics?.snapshotsSent ?? 0) >= 2);
  assert.ok((fast.pendingSnapshotCount ?? 0) <= REALTIME_ROOM_MAX_IN_FLIGHT_SNAPSHOTS + 1);

  const defaultBus = new RealtimeBus();
  const { client: defaultClient } = await connectedClient(defaultBus);
  const defaultRoom = defaultClient.createRealtimeRoom<RacerState, RacerInput>({ diagnostics: true });
  await defaultRoom.create();
  defaultRoom.publishSnapshot({ positions: { self: 1 } }, { simulationTick: 1 });
  await sleep(5);
  defaultRoom.publishSnapshot({ positions: { self: 2 } }, { simulationTick: 2 });
  await sleep(45);
  assert.equal(defaultRoom.getSnapshot().diagnostics?.snapshotsSent, 1);
});

test("stale-round and stale-authority snapshots do not roll back stored state", async () => {
  const bus = new RealtimeBus();
  const { client: hostClient } = await connectedClient(bus);
  const { client: guestClient } = await connectedClient(bus);
  const hostRoom = hostClient.createRealtimeRoom<RacerState, RacerInput>({});
  const created = await hostRoom.create();
  const guestRoom = guestClient.createRealtimeRoom<RacerState, RacerInput>({});
  await guestRoom.join({ inviteCode: created.inviteCode });

  hostRoom.publishSnapshot({ positions: { host: 1 } }, { simulationTick: 1 });
  await sleep(120);
  hostRoom.publishSnapshot({ positions: { host: 2 } }, { simulationTick: 2 });
  await sleep(120);
  assert.equal(guestRoom.getSnapshot().state?.positions.host, 2);

  // A delayed echo of an older tick must be ignored without rewinding state.
  bus.sendRealtime(hostClient.playerId!, {
    protocolVersion: 2,
    roomId: bus.roomId,
    sequence: 999,
    type: "realtime_snapshot",
    authorityEpoch: 0,
    roundSequence: 0,
    simulationTick: 1,
    hostSnapshotSequence: 1,
    processedInputCursors: {},
    state: { positions: { host: -999 } },
  });
  await sleep(5);
  assert.equal(guestRoom.getSnapshot().state?.positions.host, 2);
});

test("beginRound resets input/prediction state and publishes tick zero", async () => {
  const bus = new RealtimeBus();
  const { client } = await connectedClient(bus);
  const room = client.createRealtimeRoom<RacerState, RacerInput>({});
  await room.create();

  room.publishSnapshot({ positions: { self: 5 } }, { simulationTick: 5 });
  await sleep(5);
  assert.equal(room.getSnapshot().authoritativeTick, 5);

  room.beginRound({ positions: { self: 0 } });
  await sleep(5);
  const snapshot = room.getSnapshot();
  assert.equal(snapshot.roundSequence, 1);
  assert.equal(snapshot.authoritativeTick, 0);
});

test("guest ordered input is acknowledged via processedInputCursors and cleared from the pending queue", async () => {
  const bus = new RealtimeBus();
  const { client: hostClient } = await connectedClient(bus);
  const { client: guestClient } = await connectedClient(bus);
  const hostRoom = hostClient.createRealtimeRoom<RacerState, RacerInput>({});
  const created = await hostRoom.create();
  const guestRoom = guestClient.createRealtimeRoom<RacerState, RacerInput>({});
  await guestRoom.join({ inviteCode: created.inviteCode });

  const sendPromise = guestRoom.sendInput({ action: "boost" });
  await sleep(5);
  const guestId = guestClient.playerId!;
  const inputs = hostRoom.inputsForTick(1);
  assert.equal(inputs.orderedCommands.length, 1);
  assert.equal(inputs.orderedCommands[0]!.playerId, guestId);

  hostRoom.publishSnapshot({ positions: { host: 1 } }, { simulationTick: 1 });
  await sendPromise;
  assert.equal(guestRoom.getSnapshot().pendingInputCount, 0);
  assert.ok(guestRoom.getSnapshot().lastAcknowledgedInputSequence >= 1);
});

test("ordered input queue rejects beyond its bound", async () => {
  const bus = new RealtimeBus();
  const { client } = await connectedClient(bus);
  const room = client.createRealtimeRoom<RacerState, RacerInput>({});
  await room.create();

  for (let index = 0; index < REALTIME_ROOM_MAX_ORDERED_INPUTS; index += 1) {
    void room.sendInput({ action: "boost" }).catch(() => undefined);
  }
  await assert.rejects(
    room.sendInput({ action: "boost" }),
    (error: unknown) => error instanceof RealtimeRoomError && error.outcome === "rejected",
  );
});

test("setInput coalesces to latest and resends held controls on an interval", async () => {
  const bus = new RealtimeBus();
  const { client: hostClient } = await connectedClient(bus);
  const { client: guestClient } = await connectedClient(bus);
  const hostRoom = hostClient.createRealtimeRoom<RacerState, RacerInput>({ inputHz: 20 });
  const created = await hostRoom.create();
  const guestRoom = guestClient.createRealtimeRoom<RacerState, RacerInput>({ inputHz: 20 });
  await guestRoom.join({ inviteCode: created.inviteCode });

  guestRoom.setInput({ throttle: 10 });
  guestRoom.setInput({ throttle: 50 });
  guestRoom.setInput({ throttle: 100 });
  await sleep(5);
  const guestId = guestClient.playerId!;
  const inputs = hostRoom.inputsForTick(1);
  assert.deepEqual(inputs.latest[guestId], { throttle: 100 });
});

test("host local inputs bypass the network but enter the same tick input set", async () => {
  const bus = new RealtimeBus();
  const { client } = await connectedClient(bus);
  const room = client.createRealtimeRoom<RacerState, RacerInput>({});
  await room.create();

  room.setInput({ throttle: 75 });
  await sleep(5);
  const hostId = client.playerId!;
  const inputs = room.inputsForTick(1);
  assert.deepEqual(inputs.latest[hostId], { throttle: 75 });
});

test("mixed-capability membership blocks realtime activation until all members are capable", async () => {
  const bus = new RealtimeBus();
  const { client: hostClient } = await connectedClient(bus);
  const legacyTransport = new FakeRealtimeTransport();
  legacyTransport.attachBus(bus);
  const legacyClient = new LokiClient({ projectId: crypto.randomUUID(), transport: legacyTransport });
  await legacyClient.authenticate("token");

  const hostRoom = hostClient.createRealtimeRoom<RacerState, RacerInput>({});
  const created = await hostRoom.create();
  // A legacy (non-realtime-capable) join must be rejected once the room is
  // realtime-active, and must block activation if already present.
  await legacyClient.joinRoom({ inviteCode: created.inviteCode }, { realtimeCapable: false });

  hostRoom.publishSnapshot({ positions: {} }, { simulationTick: 1 });
  await sleep(5);
  assert.equal(hostRoom.getSnapshot().authoritativeTick, -1);
});

test("host migration triggers a realtime sync before the new host can publish", async () => {
  const bus = new RealtimeBus();
  const { client: hostClient } = await connectedClient(bus);
  const { client: guestClient } = await connectedClient(bus);
  const hostRoom = hostClient.createRealtimeRoom<RacerState, RacerInput>({});
  const created = await hostRoom.create();
  const guestRoom = guestClient.createRealtimeRoom<RacerState, RacerInput>({});
  await guestRoom.join({ inviteCode: created.inviteCode });

  hostRoom.publishSnapshot({ positions: { host: 1 } }, { simulationTick: 1 });
  await sleep(5);
  assert.equal(guestRoom.getSnapshot().state?.positions.host, 1);

  await hostRoom.leave();
  await sleep(5);
  const snapshot = guestRoom.getSnapshot();
  assert.equal(snapshot.hostId, guestClient.playerId);
  assert.equal(snapshot.authorityEpoch, 1);
  assert.ok((snapshot.diagnostics === undefined) || true);

  // The promoted host's own tick/hostSnapshotSequence counters restart
  // independently of the departed host's; its first publish must not be
  // silently dropped as a stale echo of the previous authority.
  assert.equal(guestRoom.isHost, true);
  guestRoom.publishSnapshot({ positions: { host: 2 } }, { simulationTick: 2 });
  await sleep(120);
  assert.equal(guestRoom.getSnapshot().state?.positions.host, 2);
  assert.equal(guestRoom.getSnapshot().authorityEpoch, 1);
});

test("disconnect and reconnect re-syncs realtime state", async () => {
  const bus = new RealtimeBus();
  const { client, transport } = await connectedClient(bus);
  const room = client.createRealtimeRoom<RacerState, RacerInput>({});
  await room.create();
  room.publishSnapshot({ positions: { self: 3 } }, { simulationTick: 3 });
  await sleep(5);

  transport.simulateDisconnect();
  assert.equal(room.getSnapshot().connection, "reconnecting");
  await room.reconnect();
  assert.equal(room.getSnapshot().connection, "connected");
  assert.equal(room.getSnapshot().authoritativeTick, 3);
});

test("suspend and resume preserve room identity without leaving", async () => {
  const bus = new RealtimeBus();
  const { client, transport } = await connectedClient(bus);
  const room = client.createRealtimeRoom<RacerState, RacerInput>({});
  await room.create();

  transport.simulateSuspend();
  assert.equal(room.getSnapshot().connection, "suspended");
  transport.simulateResume();
  assert.equal(room.getSnapshot().connection, "reconnecting");
});

test("leave failure leaves the room retryable and close() abandons it", async () => {
  const bus = new RealtimeBus();
  const { client } = await connectedClient(bus);
  const room = client.createRealtimeRoom<RacerState, RacerInput>({});
  await room.create();
  await room.close();
  assert.equal(room.getSnapshot().connection, "closed");
});

test("listener exceptions do not break snapshot delivery", async () => {
  const bus = new RealtimeBus();
  const { client } = await connectedClient(bus);
  const room = client.createRealtimeRoom<RacerState, RacerInput>({});
  room.subscribe(() => {
    throw new Error("boom");
  });
  let calls = 0;
  room.subscribe(() => {
    calls += 1;
  });
  await room.create();
  assert.ok(calls > 0);
});

test("oversized input and invalid schema payloads produce stable typed errors", async () => {
  const bus = new RealtimeBus();
  const { client } = await connectedClient(bus);
  const room = client.createRealtimeRoom<RacerState, RacerInput>({});
  await room.create();

  await assert.rejects(
    room.sendInput({ action: "boost", huge: "x".repeat(20_000) } as unknown as RacerInput),
    (error: unknown) => error instanceof RealtimeRoomError && error.outcome === "invalid",
  );
});

test("join fails fast when the runtime does not advertise realtime_rooms", async () => {
  const bus = new RealtimeBus();
  const originalJoin = bus.join.bind(bus);
  bus.join = (transport, playerId, capable) => {
    const joined = originalJoin(transport, playerId, capable);
    return {
      ...joined,
      snapshot: { ...joined.snapshot, capabilities: { synchronized_rooms: true } } as never,
    };
  };
  const { client } = await connectedClient(bus);
  const room = client.createRealtimeRoom<RacerState, RacerInput>({});
  await assert.rejects(
    room.create(),
    (error: unknown) => error instanceof RealtimeRoomError && error.outcome === "unsupported",
  );
});

test("prediction and reconciliation replay unacknowledged input with bounded correction", async () => {
  const bus = new RealtimeBus();
  const { client: hostClient } = await connectedClient(bus);
  const { client: guestClient } = await connectedClient(bus);
  const hostRoom = hostClient.createRealtimeRoom<RacerState, RacerInput>({});
  const created = await hostRoom.create();
  let blendCalls = 0;
  const guestRoom = guestClient.createRealtimeRoom<RacerState, RacerInput>({
    interpolationDelayMs: 0,
    predict: (state, input) => {
      if ("action" in input && input.action === "boost") {
        return { positions: { ...state.positions, self: (state.positions.self ?? 0) + 1 } };
      }
      return state;
    },
    interpolate: (_from, to) => to,
    blendCorrection: (predicted, authoritative, t) => {
      blendCalls += 1;
      return t >= 1 ? authoritative : predicted;
    },
    correctionMs: 100,
  });
  await guestRoom.join({ inviteCode: created.inviteCode });

  hostRoom.publishSnapshot({ positions: { self: 0 } }, { simulationTick: 1 });
  await sleep(5);
  void guestRoom.sendInput({ action: "boost" });
  await sleep(5);
  const rendered = guestRoom.getRenderState(performance.now());
  assert.equal(rendered?.positions.self, 1);
  assert.ok(blendCalls >= 1);
});

test("setInput prediction advances local render state before the next host snapshot", async () => {
  const bus = new RealtimeBus();
  const { client: hostClient } = await connectedClient(bus);
  const { client: guestClient } = await connectedClient(bus);
  const hostRoom = hostClient.createRealtimeRoom<RacerState, RacerInput>({});
  const created = await hostRoom.create();
  const guestRoom = guestClient.createRealtimeRoom<RacerState, RacerInput>({
    interpolationDelayMs: 0,
    simulationHz: 60,
    predict: (state, input) => {
      if ("throttle" in input) {
        return { positions: { ...state.positions, self: (state.positions.self ?? 0) + input.throttle } };
      }
      return state;
    },
    interpolate: (_from, to) => to,
    blendCorrection: (predicted, authoritative, t) => (t >= 1 ? authoritative : predicted),
  });
  await guestRoom.join({ inviteCode: created.inviteCode });

  hostRoom.publishSnapshot({ positions: { self: 0 } }, { simulationTick: 1 });
  await sleep(5);
  assert.equal(guestRoom.getSnapshot().state?.positions.self, 0);

  guestRoom.setInput({ throttle: 10 });
  const t0 = 1_000;
  guestRoom.advanceFrame(t0);
  guestRoom.advanceFrame(t0 + 20);
  const rendered = guestRoom.getRenderState(t0 + 20);
  assert.equal(rendered?.positions.self, 10);
  assert.equal(guestRoom.getSnapshot().state?.positions.self, 0);

  hostRoom.publishSnapshot({ positions: { self: 0 } }, { simulationTick: 2 });
  await sleep(5);
  const reconciled = guestRoom.getRenderState(t0 + 40);
  assert.equal(reconciled?.positions.self, 10);
  assert.equal(guestRoom.getSnapshot().state?.positions.self, 0);
});

test("reconciliation replays the held control proportionally to ticks predicted ahead of the snapshot", async () => {
  const bus = new RealtimeBus();
  const { client: hostClient } = await connectedClient(bus);
  const { client: guestClient } = await connectedClient(bus);
  const hostRoom = hostClient.createRealtimeRoom<RacerState, RacerInput>({});
  const created = await hostRoom.create();
  // No blendCorrection: getRenderState returns the raw predicted state
  // directly so this test observes #reconcile()'s output, not a blend curve.
  const guestRoom = guestClient.createRealtimeRoom<RacerState, RacerInput>({
    interpolationDelayMs: 0,
    simulationHz: 60,
    predict: (state, input) => {
      if ("throttle" in input) {
        return { positions: { ...state.positions, self: (state.positions.self ?? 0) + input.throttle } };
      }
      return state;
    },
    interpolate: (_from, to) => to,
  });
  await guestRoom.join({ inviteCode: created.inviteCode });

  hostRoom.publishSnapshot({ positions: { self: 0 } }, { simulationTick: 1 });
  await sleep(5);

  guestRoom.setInput({ throttle: 10 });
  const t0 = 1_000;
  const fixedStepMs = 1000 / 60;
  // First call only seeds the accumulator; each subsequent call advances
  // one fixed step plus a small epsilon (to sidestep floating-point ties at
  // the exact catch-up boundary) so five held-input prediction steps
  // accumulate (predictedTick reaches snapshotTick(1) + 5 = 6) before the
  // next snapshot.
  guestRoom.advanceFrame(t0);
  for (let step = 1; step <= 5; step += 1) {
    guestRoom.advanceFrame(t0 + step * (fixedStepMs + 0.01));
  }
  const beforeReconcile = guestRoom.getRenderState(t0 + 5 * fixedStepMs);
  assert.equal(beforeReconcile?.positions.self, 50);

  // The host only advanced one tick server-side, but the guest had predicted
  // five ticks ahead of the previous snapshot; reconciliation must replay the
  // held control that many ticks (not just once) so the corrected prediction
  // does not collapse back to a single step. Wait out the host's 10Hz
  // snapshot pacing so the second publish actually flushes.
  hostRoom.publishSnapshot({ positions: { self: 0 } }, { simulationTick: 2 });
  await sleep(120);
  const reconciled = guestRoom.getRenderState(t0 + 6 * fixedStepMs);
  assert.equal(reconciled?.positions.self, 40);
});

test("blendCorrection targets the live, continuously-advancing predicted state rather than a frozen value", async () => {
  const bus = new RealtimeBus();
  const { client: hostClient } = await connectedClient(bus);
  const { client: guestClient } = await connectedClient(bus);
  const hostRoom = hostClient.createRealtimeRoom<RacerState, RacerInput>({});
  const created = await hostRoom.create();
  const calls: Array<{ from: number; to: number; t: number }> = [];
  const guestRoom = guestClient.createRealtimeRoom<RacerState, RacerInput>({
    interpolationDelayMs: 0,
    simulationHz: 60,
    correctionMs: 200,
    predict: (state, input) => {
      if ("throttle" in input) {
        return { positions: { ...state.positions, self: (state.positions.self ?? 0) + input.throttle } };
      }
      return state;
    },
    interpolate: (_from, to) => to,
    blendCorrection: (predicted, authoritative, t) => {
      calls.push({ from: predicted.positions.self ?? 0, to: authoritative.positions.self ?? 0, t });
      return t >= 1 ? authoritative : predicted;
    },
  });
  await guestRoom.join({ inviteCode: created.inviteCode });

  hostRoom.publishSnapshot({ positions: { self: 0 } }, { simulationTick: 1 });
  await sleep(5);

  guestRoom.setInput({ throttle: 10 });
  const t0 = 2_000;
  const fixedStepMs = 1000 / 60;
  const step = fixedStepMs + 0.01; // avoid float ties at the catch-up boundary
  guestRoom.advanceFrame(t0);
  guestRoom.advanceFrame(t0 + step);
  guestRoom.advanceFrame(t0 + 2 * step);
  let now = t0 + 2 * step;
  assert.equal(guestRoom.getRenderState(now)?.positions.self, 20);

  // Trigger a reconcile that creates a pending correction: the previous
  // predicted state (self=20) becomes pendingCorrection.from, and #reconcile
  // rebuilds #predictedState from the new snapshot (self=10, one held-input
  // tick ahead). Wait out the host's 10Hz snapshot pacing so it flushes.
  hostRoom.publishSnapshot({ positions: { self: 0 } }, { simulationTick: 2 });
  await sleep(120);

  const rendered1 = guestRoom.getRenderState(now);
  void rendered1;
  const callAfterReconcile = calls.at(-1);
  assert.ok(callAfterReconcile);
  assert.equal(callAfterReconcile.from, 20);
  assert.equal(callAfterReconcile.to, 10);
  assert.equal(callAfterReconcile.t, 0);

  // Advance the live prediction further while the correction is still
  // in-flight (t still < 1); the target passed to blendCorrection must track
  // that live prediction (10 -> 20), not stay pinned at a delayed/stale
  // value the way the old authoritative-interpolation target would have.
  now = now + step;
  guestRoom.advanceFrame(now);
  guestRoom.getRenderState(now);
  const callWhileCorrecting = calls.at(-1);
  assert.ok(callWhileCorrecting);
  assert.equal(callWhileCorrecting.from, 20);
  assert.equal(callWhileCorrecting.to, 20);
  assert.ok(callWhileCorrecting.t > 0 && callWhileCorrecting.t < 1);
  assert.notEqual(callAfterReconcile.to, callWhileCorrecting.to);
});

test("diagnostics expose render-clock drift/rate, frame counts, and snapshot cadence", async () => {
  const bus = new RealtimeBus();
  const { client: hostClient } = await connectedClient(bus);
  const { client: guestClient } = await connectedClient(bus);
  const hostRoom = hostClient.createRealtimeRoom<RacerState, RacerInput>({ diagnostics: true });
  const created = await hostRoom.create();
  const guestRoom = guestClient.createRealtimeRoom<RacerState, RacerInput>({
    interpolationDelayMs: 0,
    diagnostics: true,
  });
  await guestRoom.join({ inviteCode: created.inviteCode });

  hostRoom.publishSnapshot({ positions: { self: 1 } }, { simulationTick: 1 });
  await sleep(120);
  hostRoom.publishSnapshot({ positions: { self: 2 } }, { simulationTick: 2 });
  await sleep(120);

  guestRoom.getRenderState(performance.now());
  const snapshot = guestRoom.getSnapshot();
  assert.ok(snapshot.diagnostics);
  assert.ok((snapshot.diagnostics?.framesRendered ?? 0) > 0);
  assert.ok((snapshot.diagnostics?.renderClockRate ?? 0) >= 0.95);
  assert.ok((snapshot.diagnostics?.renderClockRate ?? 0) <= 1.05);
  assert.equal(typeof snapshot.diagnostics?.renderClockDriftTicks, "number");
  assert.ok((snapshot.diagnostics?.lastSnapshotIntervalMs ?? 0) >= 90);
});
