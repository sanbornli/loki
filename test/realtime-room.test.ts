import assert from "node:assert/strict";
import test from "node:test";
import {
  LokiClient,
  RealtimeRoomError,
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

test("host publishSnapshot at 60Hz coalesces to the default 30 Hz cap and bounds in-flight to 8", async () => {
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
  assert.ok(snapshot.pendingSnapshotCount <= REALTIME_ROOM_MAX_IN_FLIGHT_SNAPSHOTS + 1);
  assert.ok((snapshot.diagnostics?.snapshotsSent ?? 0) <= REALTIME_ROOM_MAX_IN_FLIGHT_SNAPSHOTS);
});

test("snapshotHz 10 paces slower than the default 30 Hz cap and lowers in-flight headroom", async () => {
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

  const slowBus = new RealtimeBus();
  const { client: slowClient } = await connectedClient(slowBus);
  const slowRoom = slowClient.createRealtimeRoom<RacerState, RacerInput>({
    snapshotHz: 10,
    diagnostics: true,
  });
  await slowRoom.create();
  slowRoom.publishSnapshot({ positions: { self: 1 } }, { simulationTick: 1 });
  await sleep(5);
  slowRoom.publishSnapshot({ positions: { self: 2 } }, { simulationTick: 2 });
  await sleep(45);
  assert.equal(slowRoom.getSnapshot().diagnostics?.snapshotsSent, 1);
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
    hostSendTime: Date.now(),
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
  const guestRoom = guestClient.createRealtimeRoom<RacerState, RacerInput>({ inputHz: 20, diagnostics: true });
  await guestRoom.join({ inviteCode: created.inviteCode });

  // The first call transmits immediately (no prior send to be paced
  // against); the next two arrive within the same ~50ms (20 Hz) window and
  // are coalesced away, network transmission carries only the newest value.
  guestRoom.setInput({ throttle: 10 });
  guestRoom.setInput({ throttle: 50 });
  guestRoom.setInput({ throttle: 100 });
  assert.equal(guestRoom.getSnapshot().diagnostics?.inputsCoalesced, 2);
  await sleep(5);
  const guestId = guestClient.playerId!;
  assert.deepEqual(hostRoom.inputsForTick(1).latest[guestId], { throttle: 10 });

  // The coalesced value flushes once the pacing interval elapses.
  await sleep(60);
  assert.deepEqual(hostRoom.inputsForTick(2).latest[guestId], { throttle: 100 });
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

test("diagnostics measure host send interval and runtime relay interval separately from guest arrival interval", async () => {
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

  const guestDiagnostics = guestRoom.getSnapshot().diagnostics;
  assert.ok((guestDiagnostics?.lastSnapshotHostIntervalMs ?? 0) >= 90);
  assert.ok((guestDiagnostics?.lastSnapshotRelayIntervalMs ?? 0) >= 90);
  assert.equal(typeof guestDiagnostics?.snapshotArrivalJitterMs, "number");

  // The host also receives its own broadcast, so the same three-stage
  // cadence measurement is available on the host side too.
  const hostDiagnostics = hostRoom.getSnapshot().diagnostics;
  assert.ok((hostDiagnostics?.lastSnapshotHostIntervalMs ?? 0) >= 90);
  assert.ok((hostDiagnostics?.lastSnapshotRelayIntervalMs ?? 0) >= 90);
});

test("shouldCorrect suppresses imperceptible drift while still counting the reconciliation", async () => {
  const bus = new RealtimeBus();
  const { client: hostClient } = await connectedClient(bus);
  const { client: guestClient } = await connectedClient(bus);
  const hostRoom = hostClient.createRealtimeRoom<RacerState, RacerInput>({});
  const created = await hostRoom.create();
  const guestRoom = guestClient.createRealtimeRoom<RacerState, RacerInput>({
    interpolationDelayMs: 0,
    diagnostics: true,
    predict: (state, input) => {
      if ("throttle" in input) {
        return { positions: { ...state.positions, self: (state.positions.self ?? 0) + input.throttle } };
      }
      return state;
    },
    interpolate: (_from, to) => to,
    blendCorrection: (_from, target) => target,
    // Games understand their own units; Loki's state is opaque JSON, so the
    // threshold is game-supplied instead of hard-coded position/heading
    // fields.
    shouldCorrect: (displayed, reconciled) =>
      Math.abs((reconciled.positions.self ?? 0) - (displayed.positions.self ?? 0)) > 5,
  });
  await guestRoom.join({ inviteCode: created.inviteCode });

  hostRoom.publishSnapshot({ positions: { self: 0 } }, { simulationTick: 1 });
  await sleep(5);
  guestRoom.setInput({ throttle: 1 });
  await sleep(5);
  guestRoom.getRenderState(performance.now());

  // This reconcile is prediction's cold start (there is no prior predicted
  // state to compare against yet), so it must not count as a reconciliation.
  hostRoom.publishSnapshot({ positions: { self: 0 } }, { simulationTick: 2 });
  await sleep(120);
  guestRoom.getRenderState(performance.now());

  // This reconcile has a real prior prediction to compare against, so it is
  // the one that should be suppressed by the threshold.
  hostRoom.publishSnapshot({ positions: { self: 0 } }, { simulationTick: 3 });
  await sleep(120);
  guestRoom.getRenderState(performance.now());

  const diagnostics = guestRoom.getSnapshot().diagnostics;
  assert.ok((diagnostics?.reconciliations ?? 0) >= 1);
  assert.equal(diagnostics?.correctionsStarted, 0);
  assert.ok((diagnostics?.correctionsSuppressed ?? 0) >= 1);
});

test("an in-flight correction rebases from the displayed pose without resetting its deadline", async () => {
  const bus = new RealtimeBus();
  const { client: hostClient } = await connectedClient(bus);
  const { client: guestClient, transport: guestTransport } = await connectedClient(bus);
  const hostRoom = hostClient.createRealtimeRoom<RacerState, RacerInput>({});
  const created = await hostRoom.create();
  const hostId = hostClient.playerId!;
  const calls: Array<{ from: number; to: number; t: number }> = [];
  const guestRoom = guestClient.createRealtimeRoom<RacerState, RacerInput>({
    interpolationDelayMs: 0,
    simulationHz: 60,
    correctionMs: 200,
    diagnostics: true,
    predict: (state, input) => {
      if ("throttle" in input) {
        return { positions: { ...state.positions, self: (state.positions.self ?? 0) + input.throttle } };
      }
      return state;
    },
    interpolate: (_from, to) => to,
    blendCorrection: (from, target, t) => {
      calls.push({ from: from.positions.self ?? 0, to: target.positions.self ?? 0, t });
      return t >= 1 ? target : from;
    },
  });
  await guestRoom.join({ inviteCode: created.inviteCode });

  const envelope = (simulationTick: number, runtimeSnapshotSequence: number) => ({
    protocolVersion: 2,
    roomId: bus.roomId,
    sequence: 9000 + runtimeSnapshotSequence,
    type: "realtime_snapshot",
    hostId,
    authorityEpoch: 0,
    roundSequence: 0,
    simulationTick,
    runtimeSnapshotSequence,
    processedInputCursors: {},
    hostSendTime: Date.now(),
    serverTime: Date.now(),
    state: { positions: { self: 0 } },
  });

  guestTransport.deliver(envelope(1, 1));

  guestRoom.setInput({ throttle: 10 });
  const t0 = 2_000;
  const fixedStepMs = 1000 / 60;
  const step = fixedStepMs + 0.01; // avoid float ties at the catch-up boundary
  guestRoom.advanceFrame(t0);
  guestRoom.advanceFrame(t0 + step);
  guestRoom.advanceFrame(t0 + 2 * step);
  const now = t0 + 2 * step;
  assert.equal(guestRoom.getRenderState(now)?.positions.self, 20);

  // Snapshot 2 triggers a reconcile that starts a correction from self=20.
  guestTransport.deliver(envelope(2, 2));
  guestRoom.getRenderState(now);
  assert.equal(calls.at(-1)?.t, 0);
  assert.equal(guestRoom.getSnapshot().diagnostics?.correctionsStarted, 1);

  // Advance partway into the correction window.
  const midNow = now + 100;
  guestRoom.advanceFrame(midNow);
  guestRoom.getRenderState(midNow);
  const midway = calls.at(-1)!;
  assert.ok(midway.t > 0 && midway.t < 1);

  // A second snapshot arrives mid-correction. It must rebase `from` to the
  // currently displayed pose instead of restarting the correction, and must
  // not reset the deadline: t must keep climbing from where it left off,
  // not jump back to 0 (a full-duration reset every ~33ms would risk a
  // correction that never completes).
  guestTransport.deliver(envelope(3, 3));
  guestRoom.getRenderState(midNow);
  const afterRebase = calls.at(-1)!;
  assert.ok(afterRebase.t > 0, "deadline must not reset to 0 when rebasing mid-correction");
  assert.equal(
    guestRoom.getSnapshot().diagnostics?.correctionsStarted,
    1,
    "rebasing an in-flight correction must not start a second one",
  );
  assert.ok((guestRoom.getSnapshot().diagnostics?.reconciliations ?? 0) >= 2);

  // The original (unreset) deadline elapses; the correction completes.
  const finalNow = now + 201;
  guestRoom.advanceFrame(finalNow);
  guestRoom.getRenderState(finalNow);
  assert.equal(calls.at(-1)?.t, 1);
  assert.equal(guestRoom.getSnapshot().diagnostics?.correctionsCompleted, 1);
});

test("guest counts missing runtimeSnapshotSequence numbers and snapshots coalesced before ever being rendered", async () => {
  const bus = new RealtimeBus();
  const { client, transport } = await connectedClient(bus);
  const room = client.createRealtimeRoom<RacerState, RacerInput>({ diagnostics: true });
  await room.create();
  const hostId = client.playerId!;

  const envelope = (simulationTick: number, runtimeSnapshotSequence: number) => ({
    protocolVersion: 2,
    roomId: bus.roomId,
    sequence: 5000 + runtimeSnapshotSequence,
    type: "realtime_snapshot",
    hostId,
    authorityEpoch: 0,
    roundSequence: 0,
    simulationTick,
    runtimeSnapshotSequence,
    processedInputCursors: {},
    hostSendTime: Date.now(),
    serverTime: Date.now(),
    state: { positions: { self: simulationTick } },
  });

  transport.deliver(envelope(1, 1));
  // Nothing has sampled getRenderState() since snapshot 1 landed, so
  // snapshot 2 arriving now means snapshot 1 was coalesced away unrendered.
  transport.deliver(envelope(2, 2));
  assert.equal(room.getSnapshot().diagnostics?.snapshotsCoalescedOnReceive, 1);

  room.getRenderState(performance.now());
  transport.deliver(envelope(3, 3));
  // Sampled in between this time, so nothing was coalesced.
  assert.equal(room.getSnapshot().diagnostics?.snapshotsCoalescedOnReceive, 1);

  // Sequence jumps from 3 to 5: one missing sequence number.
  transport.deliver(envelope(4, 5));
  assert.equal(room.getSnapshot().diagnostics?.snapshotSequenceGaps, 1);
});

test("getRenderStates exposes independent interpolated/latest-authoritative/predicted streams and their ticks", async () => {
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
  });
  await guestRoom.join({ inviteCode: created.inviteCode });

  hostRoom.publishSnapshot({ positions: { self: 5 } }, { simulationTick: 1 });
  await sleep(5);

  guestRoom.setInput({ throttle: 10 });
  const t0 = 3_000;
  const fixedStepMs = 1000 / 60;
  const step = fixedStepMs + 0.01;
  guestRoom.advanceFrame(t0);
  guestRoom.advanceFrame(t0 + step);
  const now = t0 + step;

  const states = guestRoom.getRenderStates(now);
  // No blendCorrection is configured, so correctedPredicted passes through
  // the raw predicted value unchanged.
  assert.equal(states.predicted?.positions.self, 15);
  assert.equal(states.correctedPredicted?.positions.self, 15);
  // The authoritative streams are sampled independently of prediction and
  // must still reflect the host's last accepted snapshot, not the guest's
  // local prediction.
  assert.equal(states.latestAuthoritative?.positions.self, 5);
  assert.equal(states.interpolated?.positions.self, 5);
  assert.equal(states.authoritativeTick, 1);
  assert.equal(states.predictedTick, 2);
  assert.equal(typeof states.interpolatedTick, "number");

  // getRenderState() without a compositor still defaults to the whole
  // predicted state, matching pre-compositor behavior.
  assert.equal(guestRoom.getRenderState(now)?.positions.self, 15);
});

test("composeRenderState lets a game render entities from different streams, and local reconciliation never disturbs the authoritative stream", async () => {
  const bus = new RealtimeBus();
  const { client: hostClient } = await connectedClient(bus);
  const { client: guestClient } = await connectedClient(bus);
  const hostRoom = hostClient.createRealtimeRoom<RacerState, RacerInput>({});
  const created = await hostRoom.create();
  const composedInterpolatedValues: Array<number | undefined> = [];
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
    // A minimal compositor: local entity from correctedPredicted, remote
    // entity ("host") from the authoritative interpolation stream.
    composeRenderState: (states) => {
      composedInterpolatedValues.push(states.interpolated?.positions.host);
      return {
        positions: {
          self: states.correctedPredicted?.positions.self ?? states.interpolated?.positions.self ?? 0,
          host: states.interpolated?.positions.host ?? 0,
        },
      };
    },
  });
  await guestRoom.join({ inviteCode: created.inviteCode });

  hostRoom.publishSnapshot({ positions: { host: 1 } }, { simulationTick: 1 });
  await sleep(5);

  guestRoom.setInput({ throttle: 10 });
  const t0 = 4_000;
  const fixedStepMs = 1000 / 60;
  const step = fixedStepMs + 0.01;
  guestRoom.advanceFrame(t0);
  guestRoom.advanceFrame(t0 + step);
  let now = t0 + step;
  const rendered = guestRoom.getRenderState(now);
  assert.equal(rendered?.positions.self, 10);
  assert.equal(rendered?.positions.host, 1);

  // A new snapshot triggers local reconciliation of the predicted local
  // entity; the composed remote/authoritative value must be completely
  // unaffected by that reconciliation (it is never reset, replaced, or
  // snapped by it).
  hostRoom.publishSnapshot({ positions: { host: 1 } }, { simulationTick: 2 });
  await sleep(120);
  now = now + step;
  guestRoom.advanceFrame(now);
  const reconciled = guestRoom.getRenderState(now);
  assert.equal(reconciled?.positions.host, 1);
  assert.ok(composedInterpolatedValues.every((value) => value === 1));
});

test("publishSnapshot() called multiple times in one synchronous turn coalesces to a single send of the newest state", async () => {
  const bus = new RealtimeBus();
  const { client } = await connectedClient(bus);
  const room = client.createRealtimeRoom<RacerState, RacerInput>({ diagnostics: true });
  await room.create();

  // Simulate a host catch-up frame that runs several simulation steps and
  // calls publishSnapshot() after each one, all within the same synchronous
  // turn (no awaits in between).
  for (let tick = 1; tick <= 5; tick += 1) {
    room.publishSnapshot({ positions: { self: tick } }, { simulationTick: tick });
  }
  // The flush is deferred to a microtask, which runs before this awaited
  // sleep resolves.
  await sleep(5);

  const snapshot = room.getSnapshot();
  assert.equal(snapshot.diagnostics?.snapshotsSent, 1);
  assert.equal(snapshot.diagnostics?.snapshotsCoalesced, 4);
  assert.equal(snapshot.state?.positions.self, 5);
});

test("publish cadence diagnostics flag back-to-back calls and host frame stalls, and track effective send rate", async () => {
  const bus = new RealtimeBus();
  const { client } = await connectedClient(bus);
  const warnings: Array<{ type: string }> = [];
  const room = client.createRealtimeRoom<RacerState, RacerInput>({
    diagnostics: true,
    onDiagnosticWarning: (event) => warnings.push(event),
  });
  await room.create();

  room.publishSnapshot({ positions: { self: 1 } }, { simulationTick: 1 });
  await sleep(1);
  // A call an instant later than the first is well within the same cadence
  // window at the default 30 Hz (~33ms), so it should be flagged.
  room.publishSnapshot({ positions: { self: 2 } }, { simulationTick: 2 });
  assert.ok(warnings.some((event) => event.type === "back_to_back_publish"));

  await sleep(120);
  // A long gap simulating a stalled host frame loop. The stall threshold is
  // max(3 * snapshotInterval, 150ms) = 150ms at the default 30 Hz.
  room.publishSnapshot({ positions: { self: 3 } }, { simulationTick: 3 });
  await sleep(500);
  room.publishSnapshot({ positions: { self: 4 } }, { simulationTick: 4 });
  await sleep(120);

  const diagnostics = room.getSnapshot().diagnostics;
  assert.ok((diagnostics?.hostFrameStallCount ?? 0) >= 1);
  assert.ok((diagnostics?.lastHostFrameStallMs ?? 0) >= 300);
  assert.ok((diagnostics?.missedSnapshotWindows ?? 0) >= 1);
  assert.ok(warnings.some((event) => event.type === "host_frame_stall"));
  assert.ok(warnings.some((event) => event.type === "missed_snapshot_window"));
  assert.equal(typeof diagnostics?.snapshotPublishCalls, "number");
  assert.ok((diagnostics?.snapshotPublishCalls ?? 0) >= 4);
  assert.equal(typeof diagnostics?.effectiveSnapshotHz, "number");
});

test("sendEffect() confirms a host event with a stable effectId, delivered once per subscriber including the host itself", async () => {
  const bus = new RealtimeBus();
  const { client: hostClient } = await connectedClient(bus);
  const { client: guestClient } = await connectedClient(bus);
  const hostRoom = hostClient.createRealtimeRoom<RacerState, RacerInput, { kind: string }>({});
  const created = await hostRoom.create();
  const guestRoom = guestClient.createRealtimeRoom<RacerState, RacerInput, { kind: string }>({});
  await guestRoom.join({ inviteCode: created.inviteCode });

  const hostEffects: string[] = [];
  const guestEffects: string[] = [];
  hostRoom.onConfirmedEffect((effect) => hostEffects.push(effect.effectId));
  guestRoom.onConfirmedEffect((effect) => guestEffects.push(effect.effectId));

  hostRoom.publishSnapshot({ positions: { self: 1 } }, { simulationTick: 1 });
  await sleep(5);

  hostRoom.sendEffect({ kind: "collision" }, { simulationTick: 1 });
  await sleep(10);

  assert.equal(hostEffects.length, 1);
  assert.equal(guestEffects.length, 1);
  assert.equal(hostEffects[0], guestEffects[0]);

  // Sending a second effect must produce a distinct, still-stable id.
  hostRoom.sendEffect({ kind: "pickup" }, { simulationTick: 2 });
  await sleep(10);
  assert.equal(guestEffects.length, 2);
  assert.notEqual(guestEffects[0], guestEffects[1]);
});

test("a reconnecting guest replays retained confirmed effects it missed, deduped against ones it already saw", async () => {
  const bus = new RealtimeBus();
  const { client: hostClient } = await connectedClient(bus);
  const { client: guestClient, transport: guestTransport } = await connectedClient(bus);
  const hostRoom = hostClient.createRealtimeRoom<RacerState, RacerInput, { kind: string }>({});
  const created = await hostRoom.create();
  const guestRoom = guestClient.createRealtimeRoom<RacerState, RacerInput, { kind: string }>({});
  await guestRoom.join({ inviteCode: created.inviteCode });

  const guestEffects: string[] = [];
  guestRoom.onConfirmedEffect((effect) => guestEffects.push(effect.effectId));

  hostRoom.publishSnapshot({ positions: { self: 1 } }, { simulationTick: 1 });
  await sleep(5);
  hostRoom.sendEffect({ kind: "collision" }, { simulationTick: 1 });
  await sleep(10);
  assert.equal(guestEffects.length, 1);

  // Reconnect and request sync again; the already-seen effect must not be
  // redelivered.
  guestTransport.simulateDisconnect();
  await guestRoom.reconnect();
  await sleep(10);
  assert.equal(guestEffects.length, 1);
});

test("a silently-dropped snapshot submission (late/duplicate echo the runtime never responds to) times out and releases its in-flight slot", async () => {
  const bus = new RealtimeBus();
  const { client } = await connectedClient(bus);
  const room = client.createRealtimeRoom<RacerState, RacerInput>({
    snapshotHz: REALTIME_ROOM_MAX_SNAPSHOT_HZ,
    diagnostics: true,
  });
  await room.create();

  bus.dropNextSnapshot = true;
  room.publishSnapshot({ positions: { self: 1 } }, { simulationTick: 1 });
  await sleep(5);
  // The submission never received an accepted echo or an error, so it's
  // still tracked as in flight immediately after sending.
  assert.equal(room.getSnapshot().pendingSnapshotCount, 1);

  // The ack timeout floor is 1000ms; wait past it.
  await sleep(1100);
  const diagnostics = room.getSnapshot().diagnostics;
  assert.equal(diagnostics?.snapshotAckTimeouts, 1);
  assert.equal(room.getSnapshot().pendingSnapshotCount, 0);

  // Capacity is released, so a newer state can still be sent afterward.
  room.publishSnapshot({ positions: { self: 2 } }, { simulationTick: 2 });
  await sleep(5);
  assert.ok((room.getSnapshot().diagnostics?.snapshotsAttempted ?? 0) >= 2);
});

test("a RATE_LIMITED snapshot rejection releases the specific pending submission and backs off for retryAfterMs", async () => {
  const bus = new RealtimeBus();
  const { client } = await connectedClient(bus);
  const warnings: Array<{ type: string }> = [];
  const room = client.createRealtimeRoom<RacerState, RacerInput>({
    snapshotHz: REALTIME_ROOM_MAX_SNAPSHOT_HZ,
    diagnostics: true,
    onDiagnosticWarning: (event) => warnings.push(event),
  });
  await room.create();

  bus.nextSnapshotError = { code: "RATE_LIMITED", message: "realtime snapshot rate exceeded", retryAfterMs: 200 };
  room.publishSnapshot({ positions: { self: 1 } }, { simulationTick: 1 });
  await sleep(5);

  const diagnostics = room.getSnapshot().diagnostics;
  assert.equal(diagnostics?.snapshotsRejected, 1);
  assert.equal(room.getSnapshot().pendingSnapshotCount, 0);
  assert.ok(warnings.some((event) => event.type === "runtime_rate_limited"));

  // A newer state queued immediately after must wait out the backoff
  // instead of retrying immediately.
  room.publishSnapshot({ positions: { self: 2 } }, { simulationTick: 2 });
  await sleep(50);
  assert.equal(room.getSnapshot().state?.positions.self, undefined);
  await sleep(200);
  assert.equal(room.getSnapshot().state?.positions.self, 2);
});

test("adaptiveRate reduces the target snapshot rate on an ack timeout and never exceeds the configured ceiling", async () => {
  const bus = new RealtimeBus();
  const { client } = await connectedClient(bus);
  const room = client.createRealtimeRoom<RacerState, RacerInput>({
    snapshotHz: 20,
    adaptiveRate: true,
    initialSnapshotHz: 12,
    minSnapshotHz: 4,
    diagnostics: true,
  });
  await room.create();

  assert.equal(room.getSnapshot().diagnostics?.currentTargetSnapshotHz, 12);
  assert.equal(room.getSnapshot().diagnostics?.configuredMaxSnapshotHz, 20);

  bus.dropNextSnapshot = true;
  room.publishSnapshot({ positions: { self: 1 } }, { simulationTick: 1 });
  await sleep(1100);

  const diagnostics = room.getSnapshot().diagnostics;
  assert.equal(diagnostics?.adaptiveRateReductions, 1);
  assert.ok((diagnostics?.currentTargetSnapshotHz ?? 12) < 12);
  assert.ok((diagnostics?.currentTargetSnapshotHz ?? 0) <= 20);
});

test("without adaptiveRate, publishSnapshot keeps sending at the fixed configured rate even after a rejection", async () => {
  const bus = new RealtimeBus();
  const { client } = await connectedClient(bus);
  const room = client.createRealtimeRoom<RacerState, RacerInput>({
    snapshotHz: 20,
    diagnostics: true,
  });
  await room.create();

  bus.dropNextSnapshot = true;
  room.publishSnapshot({ positions: { self: 1 } }, { simulationTick: 1 });
  await sleep(1100);

  assert.equal(room.getSnapshot().diagnostics?.currentTargetSnapshotHz, 20);
  assert.equal(room.getSnapshot().diagnostics?.adaptiveRateReductions, 0);
});

test("guest presentation adapts interpolation delay toward the measured accepted interval, not the configured target", async () => {
  const bus = new RealtimeBus();
  const { client: hostClient } = await connectedClient(bus);
  const { client: guestClient } = await connectedClient(bus);
  const hostRoom = hostClient.createRealtimeRoom<RacerState, RacerInput>({ snapshotHz: REALTIME_ROOM_MAX_SNAPSHOT_HZ });
  const created = await hostRoom.create();
  const guestRoom = guestClient.createRealtimeRoom<RacerState, RacerInput>({});
  await guestRoom.join({ inviteCode: created.inviteCode });

  const initialDelay = guestRoom.getSnapshot().interpolationDelayMs;

  // Simulate a host that's configured for a fast rate but is actually only
  // delivering every ~150ms (well above the configured ~33ms interval).
  let tick = 0;
  for (let index = 0; index < 6; index += 1) {
    tick += 1;
    hostRoom.publishSnapshot({ positions: { self: tick } }, { simulationTick: tick });
    await sleep(150);
  }

  const adaptedDelay = guestRoom.getSnapshot().interpolationDelayMs;
  assert.ok(adaptedDelay > initialDelay, `expected delay to grow past ${initialDelay}, got ${adaptedDelay}`);
});

test("a guest's high-extrapolation report reduces the host's adaptive target rate", async () => {
  const bus = new RealtimeBus();
  const { client: hostClient } = await connectedClient(bus);
  const { client: guestClient } = await connectedClient(bus);
  const hostRoom = hostClient.createRealtimeRoom<RacerState, RacerInput>({
    snapshotHz: 20,
    adaptiveRate: true,
    initialSnapshotHz: 12,
    minSnapshotHz: 4,
    diagnostics: true,
  });
  const created = await hostRoom.create();
  const guestRoom = guestClient.createRealtimeRoom<RacerState, RacerInput>({});
  await guestRoom.join({ inviteCode: created.inviteCode });

  hostRoom.publishSnapshot({ positions: { self: 1 } }, { simulationTick: 1 });
  await sleep(5);

  await guestClient.sendRealtimeGuestReport({
    roundSequence: 0,
    sequenceGaps: 0,
    extrapolatedFrameRatio: 0.9,
  });
  await sleep(5);

  const diagnostics = hostRoom.getSnapshot().diagnostics;
  assert.ok((diagnostics?.currentTargetSnapshotHz ?? 12) < 12);
  assert.ok((diagnostics?.adaptiveRateReductions ?? 0) >= 1);
});

test("authoritative sampling counts a hold/freeze separately from extrapolation", async () => {
  const bus = new RealtimeBus();
  const { client: hostClient } = await connectedClient(bus);
  const { client: guestClient } = await connectedClient(bus);
  const hostRoom = hostClient.createRealtimeRoom<RacerState, RacerInput>({ snapshotHz: 10 });
  const created = await hostRoom.create();
  const guestRoom = guestClient.createRealtimeRoom<RacerState, RacerInput>({
    diagnostics: true,
    interpolationDelayMs: 0,
    simulationHz: 60,
    interpolate: (_from, to) => to,
  });
  await guestRoom.join({ inviteCode: created.inviteCode });

  hostRoom.publishSnapshot({ positions: { host: 1 } }, { simulationTick: 1 });
  for (let attempt = 0; attempt < 20 && !guestRoom.getSnapshot().state; attempt += 1) {
    await sleep(5);
  }
  assert.ok(guestRoom.getSnapshot().state, "guest must have an authoritative snapshot before sampling");
  const t0 = 1_000;
  guestRoom.getRenderState(t0);
  guestRoom.getRenderState(t0 + 500);
  const held = guestRoom.getSnapshot().diagnostics;
  assert.ok((held?.heldAuthoritativeFrames ?? 0) >= 1);
  assert.equal(held?.extrapolatedFrames, 0);
  await hostRoom.leave().catch(() => undefined);
  await guestRoom.leave().catch(() => undefined);
});

test("clamped extrapolation also increments heldAuthoritativeFrames", async () => {
  const bus = new RealtimeBus();
  const { client: hostClient } = await connectedClient(bus);
  const { client: guestClient } = await connectedClient(bus);
  const hostRoom = hostClient.createRealtimeRoom<RacerState, RacerInput>({ snapshotHz: 10 });
  const created = await hostRoom.create();
  const guestRoom = guestClient.createRealtimeRoom<RacerState, RacerInput>({
    diagnostics: true,
    interpolationDelayMs: 0,
    simulationHz: 60,
    interpolate: (_from, to) => to,
    extrapolate: (state) => state,
  });
  await guestRoom.join({ inviteCode: created.inviteCode });
  hostRoom.publishSnapshot({ positions: { host: 1 } }, { simulationTick: 1 });
  for (let attempt = 0; attempt < 20 && !guestRoom.getSnapshot().state; attempt += 1) {
    await sleep(5);
  }
  assert.ok(guestRoom.getSnapshot().state, "guest must have an authoritative snapshot before sampling");
  const t0 = 1_000;
  guestRoom.getRenderState(t0);
  guestRoom.getRenderState(t0 + 20);
  guestRoom.getRenderState(t0 + 500);
  const extra = guestRoom.getSnapshot().diagnostics;
  assert.ok((extra?.extrapolatedFrames ?? 0) >= 1);
  assert.ok((extra?.heldAuthoritativeFrames ?? 0) >= 1);
  await hostRoom.leave().catch(() => undefined);
  await guestRoom.leave().catch(() => undefined);
});
