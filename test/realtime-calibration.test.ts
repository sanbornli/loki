// Validates calibrateRealtimeRoom() against the same in-memory RealtimeBus
// harness used by test/realtime-room.test.ts. Loki never inspects game
// state here: RacerState/RacerInput and the drive/evaluate callbacks below
// are the test acting as "the game"; calibrateRealtimeRoom() only reads
// transport diagnostics.
import assert from "node:assert/strict";
import test from "node:test";
import { calibrateRealtimeRoom } from "../packages/sdk-js/src/realtime-calibration.js";
import { RealtimeBus, connectedClient } from "./helpers/realtime-bus.js";

type RacerState = { tick: number };
type RacerInput = { throttle: number };

test("calibrateRealtimeRoom recommends the lowest candidate that stays transport-healthy", async () => {
  const bus = new RealtimeBus();
  const { client: hostClient } = await connectedClient(bus);
  const { client: guestClient } = await connectedClient(bus);

  const result = await calibrateRealtimeRoom<RacerState, RacerInput>({
    snapshotHzCandidates: [10, 20, 30],
    simulationHz: 60,
    durationMsPerCandidate: 60,
    createHostRoom: (candidate) =>
      hostClient.createRealtimeRoom<RacerState, RacerInput>({ snapshotHz: candidate.snapshotHz, diagnostics: true }),
    createGuestRoom: () => guestClient.createRealtimeRoom<RacerState, RacerInput>({ diagnostics: true }),
    driveHost: (host, tick) => host.publishSnapshot({ tick }, { simulationTick: tick }),
  });

  assert.equal(result.samples.length, 3);
  assert.equal(result.recommended.schemaVersion, 1);
  assert.equal(result.recommended.simulationHz, 60);
  // All three candidates are well within Loki's transport limits at this
  // scale, so the lowest one tried is recommended.
  assert.equal(result.recommended.snapshotHz, 10);
  assert.ok(result.samples.every((sample) => sample.acceptable));
});

test("calibrateRealtimeRoom falls back to the best-scoring candidate when none are acceptable, and never invents game-side judgment", async () => {
  const bus = new RealtimeBus();
  const { client: hostClient } = await connectedClient(bus);
  const { client: guestClient } = await connectedClient(bus);

  const evaluated: number[] = [];
  const result = await calibrateRealtimeRoom<RacerState, RacerInput>({
    snapshotHzCandidates: [10, 20],
    simulationHz: 60,
    durationMsPerCandidate: 30,
    createHostRoom: (candidate) =>
      hostClient.createRealtimeRoom<RacerState, RacerInput>({ snapshotHz: candidate.snapshotHz, diagnostics: true }),
    createGuestRoom: () => guestClient.createRealtimeRoom<RacerState, RacerInput>({ diagnostics: true }),
    driveHost: (host, tick) => host.publishSnapshot({ tick }, { simulationTick: tick }),
    // Loki cannot judge game-visible quality itself; this stands in for a
    // game reporting every candidate as unacceptable.
    evaluate: ({ candidate }) => {
      evaluated.push(candidate.snapshotHz);
      return { acceptable: false, score: candidate.snapshotHz };
    },
  });

  assert.deepEqual(evaluated.sort((a, b) => a - b), [10, 20]);
  assert.ok(result.samples.every((sample) => sample.acceptable === false));
  // Lower score (10 Hz) wins the fallback even though nothing was "acceptable".
  assert.equal(result.recommended.snapshotHz, 10);
});

test("calibrateRealtimeRoom requires diagnostics to be enabled on the rooms it builds", async () => {
  const bus = new RealtimeBus();
  const { client: hostClient } = await connectedClient(bus);
  const { client: guestClient } = await connectedClient(bus);

  await assert.rejects(
    calibrateRealtimeRoom<RacerState, RacerInput>({
      snapshotHzCandidates: [10],
      simulationHz: 60,
      durationMsPerCandidate: 20,
      createHostRoom: (candidate) => hostClient.createRealtimeRoom<RacerState, RacerInput>({ snapshotHz: candidate.snapshotHz }),
      createGuestRoom: () => guestClient.createRealtimeRoom<RacerState, RacerInput>(),
      driveHost: (host, tick) => host.publishSnapshot({ tick }, { simulationTick: tick }),
    }),
    /diagnostics: true/,
  );
});
