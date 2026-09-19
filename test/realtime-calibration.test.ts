// Validates calibrateRealtimeRoom() against the same in-memory RealtimeBus
// harness used by test/realtime-room.test.ts, plus the Loki-owned gates
// (delivery, hold, ack cliff) which the picker reads from diagnostics.
import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAckLatencyCliffs,
  buildRecommendedRealtimeProfile,
  calibrateRealtimeRoom,
  qualifyRealtimeCalibrationSample,
  type RealtimeCalibrationSample,
} from "../packages/sdk-js/src/realtime-calibration.js";
import type { RealtimeRoomDiagnostics } from "../packages/sdk-js/src/realtime-room.js";
import { RealtimeBus, connectedClient } from "./helpers/realtime-bus.js";

type RacerState = { tick: number };
type RacerInput = { throttle: number };

const profileKeys = [
  "adaptiveRate",
  "correctionMs",
  "initialSnapshotHz",
  "inputHz",
  "interpolationDelayMs",
  "minSnapshotHz",
  "schemaVersion",
  "simulationHz",
  "snapshotHz",
] as const;

const healthyDiagnostics = (overrides: Partial<RealtimeRoomDiagnostics> = {}): RealtimeRoomDiagnostics => ({
  inputsSent: 0,
  inputsCoalesced: 0,
  inputsDropped: 0,
  snapshotsSent: 20,
  snapshotsCoalesced: 0,
  snapshotsAcked: 20,
  extrapolatedFrames: 0,
  heldAuthoritativeFrames: 0,
  framesRendered: 200,
  reconciliations: 0,
  correctionsStarted: 0,
  correctionsCompleted: 0,
  correctionsSuppressed: 0,
  reconnectCount: 0,
  hostMigrationCount: 0,
  renderClockRate: 1,
  renderClockDriftTicks: 0,
  snapshotArrivalJitterMs: 0,
  snapshotSequenceGaps: 0,
  snapshotsCoalescedOnReceive: 0,
  snapshotPublishCalls: 20,
  missedSnapshotWindows: 0,
  hostFrameStallCount: 0,
  snapshotsAttempted: 20,
  snapshotsAccepted: 20,
  snapshotsRejected: 0,
  snapshotAckTimeouts: 0,
  snapshotBackpressureDurationMs: 0,
  maxInFlightObserved: 1,
  configuredMaxSnapshotHz: 20,
  currentTargetSnapshotHz: 20,
  snapshotAcceptanceRatio: 1,
  snapshotAckP95Ms: 90,
  adaptiveRateReductions: 0,
  adaptiveRateIncreases: 0,
  inputCalls: 0,
  inputsTransmitted: 0,
  inputRateLimited: 0,
  effectiveAcceptedSnapshotHz: 20,
  guestEffectiveSnapshotHz: 20,
  ...overrides,
});

const sampleAt = (
  snapshotHz: number,
  overrides: { host?: Partial<RealtimeRoomDiagnostics>; guest?: Partial<RealtimeRoomDiagnostics> } = {},
): RealtimeCalibrationSample => {
  const host = healthyDiagnostics({
    configuredMaxSnapshotHz: snapshotHz,
    currentTargetSnapshotHz: snapshotHz,
    effectiveAcceptedSnapshotHz: snapshotHz,
    snapshotAckP95Ms: 90,
    ...overrides.host,
  });
  const guest = healthyDiagnostics({
    guestEffectiveSnapshotHz: snapshotHz,
    heldAuthoritativeFrames: 0,
    extrapolatedFrames: 0,
    ...overrides.guest,
  });
  const { rejectionReasons, score } = qualifyRealtimeCalibrationSample({ snapshotHz }, host, guest);
  return {
    candidate: { snapshotHz },
    hostDiagnostics: host,
    guestDiagnostics: guest,
    acceptable: rejectionReasons.length === 0,
    score,
    rejectionReasons,
  };
};

test("qualifyRealtimeCalibrationSample rejects delivery shortfall, holds, and the old 30-vs-8 shape", () => {
  const delivered = qualifyRealtimeCalibrationSample({ snapshotHz: 20 }, healthyDiagnostics(), healthyDiagnostics());
  assert.deepEqual(delivered.rejectionReasons, []);

  const short = qualifyRealtimeCalibrationSample(
    { snapshotHz: 25 },
    healthyDiagnostics({ effectiveAcceptedSnapshotHz: 21, snapshotAcceptanceRatio: 0.99 }),
    healthyDiagnostics({ guestEffectiveSnapshotHz: 21, framesRendered: 200, extrapolatedFrames: 0 }),
  );
  assert.ok(short.rejectionReasons.includes("delivery"));

  const held = qualifyRealtimeCalibrationSample(
    { snapshotHz: 20 },
    healthyDiagnostics(),
    healthyDiagnostics({ heldAuthoritativeFrames: 80, framesRendered: 200, guestEffectiveSnapshotHz: 20 }),
  );
  assert.ok(held.rejectionReasons.includes("hold"));

  const oldPong = qualifyRealtimeCalibrationSample(
    { snapshotHz: 30 },
    healthyDiagnostics({
      effectiveAcceptedSnapshotHz: 8,
      snapshotAcceptanceRatio: 0.99,
      snapshotAckP95Ms: 90,
    }),
    healthyDiagnostics({
      guestEffectiveSnapshotHz: 8,
      extrapolatedFrames: 0,
      heldAuthoritativeFrames: 0,
      framesRendered: 714,
    }),
  );
  assert.ok(oldPong.rejectionReasons.includes("delivery"));
  assert.ok(!oldPong.rejectionReasons.includes("extrapolation"));

  const hostOnly = qualifyRealtimeCalibrationSample(
    { snapshotHz: 30 },
    healthyDiagnostics({ effectiveAcceptedSnapshotHz: 29.3, snapshotAcceptanceRatio: 0.991 }),
    healthyDiagnostics({
      guestEffectiveSnapshotHz: 8,
      extrapolatedFrames: 0,
      heldAuthoritativeFrames: 0,
      framesRendered: 714,
    }),
  );
  assert.ok(hostOnly.rejectionReasons.includes("delivery"));

  const guestMissing = qualifyRealtimeCalibrationSample(
    { snapshotHz: 30 },
    healthyDiagnostics({ effectiveAcceptedSnapshotHz: 29.3 }),
    healthyDiagnostics({ guestEffectiveSnapshotHz: undefined, framesRendered: 200 }),
  );
  assert.ok(guestMissing.rejectionReasons.includes("delivery"));
});

test("applyAckLatencyCliffs rejects a p95 cap or cliff without dropping a later healthy rate", () => {
  const samples = [
    sampleAt(8, { host: { snapshotAckP95Ms: 97 } }),
    sampleAt(20, { host: { snapshotAckP95Ms: 134 } }),
    sampleAt(25, { host: { snapshotAckP95Ms: 272 } }),
    sampleAt(30, { host: { snapshotAckP95Ms: 91 } }),
  ];
  assert.ok(samples.every((sample) => sample.acceptable));
  applyAckLatencyCliffs(samples);
  assert.equal(samples.find((sample) => sample.candidate.snapshotHz === 25)?.acceptable, false);
  assert.ok(samples.find((sample) => sample.candidate.snapshotHz === 25)?.rejectionReasons.includes("ack_cap"));
  assert.equal(samples.find((sample) => sample.candidate.snapshotHz === 30)?.acceptable, true);

  const cleanPath = [sampleAt(8, { host: { snapshotAckP95Ms: 1 } }), sampleAt(30, { host: { snapshotAckP95Ms: 4 } })];
  applyAckLatencyCliffs(cleanPath);
  assert.ok(cleanPath.every((sample) => sample.acceptable));
});

test("buildRecommendedRealtimeProfile picks the highest qualified rate as an adaptive ceiling", () => {
  const samples = [sampleAt(8), sampleAt(20), sampleAt(25), sampleAt(30)];
  samples[2]!.acceptable = false;
  samples[2]!.rejectionReasons.push("delivery");
  const { recommended, usedFallback } = buildRecommendedRealtimeProfile(samples, { simulationHz: 60 });
  assert.equal(usedFallback, false);
  assert.equal(recommended.snapshotHz, 30);
  assert.equal(recommended.adaptiveRate, true);
  assert.equal(recommended.minSnapshotHz, 8);
  assert.equal(recommended.initialSnapshotHz, 12);
  assert.equal(recommended.inputHz, 20);
  assert.equal("tickRate" in recommended, false);
  assert.deepEqual(Object.keys(recommended).sort(), [...profileKeys]);
});

test("buildRecommendedRealtimeProfile uses the Loki floor when nothing qualifies", () => {
  const samples = [sampleAt(10), sampleAt(20)];
  for (const sample of samples) {
    sample.acceptable = false;
    sample.rejectionReasons.push("evaluate");
  }
  const { recommended, usedFallback } = buildRecommendedRealtimeProfile(samples, { simulationHz: 60 });
  assert.equal(usedFallback, true);
  assert.equal(recommended.snapshotHz, 8);
  assert.equal(recommended.minSnapshotHz, 8);
  assert.equal(recommended.initialSnapshotHz, 8);
  assert.equal(recommended.adaptiveRate, true);
  assert.equal("tickRate" in recommended, false);
});

test("calibrateRealtimeRoom recommends the highest delivered candidate as an adaptive ceiling", async () => {
  const bus = new RealtimeBus();
  const { client: hostClient } = await connectedClient(bus);
  const { client: guestClient } = await connectedClient(bus);

  const result = await calibrateRealtimeRoom<RacerState, RacerInput>({
    snapshotHzCandidates: [8, 20, 30],
    simulationHz: 60,
    durationMsPerCandidate: 400,
    minDeliveryRatio: 0.7,
    createHostRoom: (candidate) =>
      hostClient.createRealtimeRoom<RacerState, RacerInput>({ snapshotHz: candidate.snapshotHz, diagnostics: true }),
    createGuestRoom: () => guestClient.createRealtimeRoom<RacerState, RacerInput>({ diagnostics: true }),
    driveHost: (host, tick) => host.publishSnapshot({ tick }, { simulationTick: tick }),
  });

  assert.equal(result.samples.length, 3);
  assert.equal(result.usedFallback, false);
  assert.equal(result.recommended.schemaVersion, 1);
  assert.equal(result.recommended.simulationHz, 60);
  assert.equal(
    result.recommended.snapshotHz,
    30,
    JSON.stringify(result.samples.map((sample) => ({ hz: sample.candidate.snapshotHz, ok: sample.acceptable, reasons: sample.rejectionReasons }))),
  );
  assert.equal(result.recommended.adaptiveRate, true);
  assert.equal(result.recommended.minSnapshotHz, 8);
  assert.equal(result.recommended.initialSnapshotHz, 12);
  assert.equal("tickRate" in result.recommended, false);
  assert.ok(result.samples.every((sample) => sample.acceptable));
});

test("calibrateRealtimeRoom candidate order does not change the recommended ceiling", async () => {
  const bus = new RealtimeBus();
  const { client: hostClient } = await connectedClient(bus);
  const { client: guestClient } = await connectedClient(bus);

  const result = await calibrateRealtimeRoom<RacerState, RacerInput>({
    snapshotHzCandidates: [30, 8, 20],
    simulationHz: 60,
    durationMsPerCandidate: 400,
    minDeliveryRatio: 0.7,
    createHostRoom: (candidate) =>
      hostClient.createRealtimeRoom<RacerState, RacerInput>({ snapshotHz: candidate.snapshotHz, diagnostics: true }),
    createGuestRoom: () => guestClient.createRealtimeRoom<RacerState, RacerInput>({ diagnostics: true }),
    driveHost: (host, tick) => host.publishSnapshot({ tick }, { simulationTick: tick }),
  });

  assert.equal(result.recommended.snapshotHz, 30);
});

test("calibrateRealtimeRoom evaluate can veto a high rate but cannot withhold the floor fallback", async () => {
  const bus = new RealtimeBus();
  const { client: hostClient } = await connectedClient(bus);
  const { client: guestClient } = await connectedClient(bus);

  const vetoed = await calibrateRealtimeRoom<RacerState, RacerInput>({
    snapshotHzCandidates: [8, 20],
    simulationHz: 60,
    durationMsPerCandidate: 400,
    minDeliveryRatio: 0.7,
    createHostRoom: (candidate) =>
      hostClient.createRealtimeRoom<RacerState, RacerInput>({ snapshotHz: candidate.snapshotHz, diagnostics: true }),
    createGuestRoom: () => guestClient.createRealtimeRoom<RacerState, RacerInput>({ diagnostics: true }),
    driveHost: (host, tick) => host.publishSnapshot({ tick }, { simulationTick: tick }),
    evaluate: ({ candidate }) => ({ acceptable: candidate.snapshotHz < 20 }),
  });
  assert.equal(vetoed.recommended.snapshotHz, 8);
  assert.equal(vetoed.usedFallback, false);
  assert.ok(vetoed.samples.find((sample) => sample.candidate.snapshotHz === 20)?.rejectionReasons.includes("evaluate"));

  const allVetoed = await calibrateRealtimeRoom<RacerState, RacerInput>({
    snapshotHzCandidates: [10, 20],
    simulationHz: 60,
    durationMsPerCandidate: 400,
    minDeliveryRatio: 0.7,
    createHostRoom: (candidate) =>
      hostClient.createRealtimeRoom<RacerState, RacerInput>({ snapshotHz: candidate.snapshotHz, diagnostics: true }),
    createGuestRoom: () => guestClient.createRealtimeRoom<RacerState, RacerInput>({ diagnostics: true }),
    driveHost: (host, tick) => host.publishSnapshot({ tick }, { simulationTick: tick }),
    evaluate: () => ({ acceptable: false }),
  });
  assert.equal(allVetoed.usedFallback, true);
  assert.equal(allVetoed.recommended.snapshotHz, 8);
  assert.ok(allVetoed.samples.every((sample) => sample.acceptable === false));
});

test("calibrateRealtimeRoom requires diagnostics, fixed-rate candidates, and a complete sweep", async () => {
  const bus = new RealtimeBus();
  const { client: hostClient } = await connectedClient(bus);
  const { client: guestClient } = await connectedClient(bus);

  await assert.rejects(
    calibrateRealtimeRoom<RacerState, RacerInput>({
      snapshotHzCandidates: [10],
      simulationHz: 60,
      durationMsPerCandidate: 20,
      createHostRoom: (candidate) =>
        hostClient.createRealtimeRoom<RacerState, RacerInput>({ snapshotHz: candidate.snapshotHz }),
      createGuestRoom: () => guestClient.createRealtimeRoom<RacerState, RacerInput>(),
      driveHost: (host, tick) => host.publishSnapshot({ tick }, { simulationTick: tick }),
    }),
    /diagnostics: true/,
  );

  await assert.rejects(
    calibrateRealtimeRoom<RacerState, RacerInput>({
      snapshotHzCandidates: [20],
      simulationHz: 60,
      durationMsPerCandidate: 80,
      createHostRoom: (candidate) =>
        hostClient.createRealtimeRoom<RacerState, RacerInput>({
          snapshotHz: candidate.snapshotHz,
          adaptiveRate: true,
          initialSnapshotHz: 12,
          diagnostics: true,
        }),
      createGuestRoom: () => guestClient.createRealtimeRoom<RacerState, RacerInput>({ diagnostics: true }),
      driveHost: (host, tick) => host.publishSnapshot({ tick }, { simulationTick: tick }),
    }),
    /adaptiveRate: false/,
  );

  await assert.rejects(
    calibrateRealtimeRoom<RacerState, RacerInput>({
      snapshotHzCandidates: [8, 30],
      simulationHz: 60,
      durationMsPerCandidate: 40,
      createHostRoom: (candidate) => {
        if (candidate.snapshotHz === 30) throw new Error("lobby stuck");
        return hostClient.createRealtimeRoom<RacerState, RacerInput>({
          snapshotHz: candidate.snapshotHz,
          diagnostics: true,
        });
      },
      createGuestRoom: () => guestClient.createRealtimeRoom<RacerState, RacerInput>({ diagnostics: true }),
      driveHost: (host, tick) => host.publishSnapshot({ tick }, { simulationTick: tick }),
    }),
    /lobby stuck/,
  );

  await assert.rejects(
    calibrateRealtimeRoom<RacerState, RacerInput>({
      snapshotHzCandidates: [],
      simulationHz: 60,
      durationMsPerCandidate: 20,
      createHostRoom: (candidate) =>
        hostClient.createRealtimeRoom<RacerState, RacerInput>({ snapshotHz: candidate.snapshotHz, diagnostics: true }),
      createGuestRoom: () => guestClient.createRealtimeRoom<RacerState, RacerInput>({ diagnostics: true }),
      driveHost: (host, tick) => host.publishSnapshot({ tick }, { simulationTick: tick }),
    }),
    /no candidates were provided/,
  );
});
