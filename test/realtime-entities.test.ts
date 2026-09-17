// Validates the game-agnostic entity helpers (createEntityCompositor,
// createLocalPrediction) built on top of RealtimeRoom's independent render
// streams. Loki itself never learns what an "entity" is here: every
// selector below is supplied by this test acting as the game.
import assert from "node:assert/strict";
import test from "node:test";
import { createEntityCompositor, createLocalPrediction } from "../packages/sdk-js/src/realtime-entities.js";
import { RealtimeBus, connectedClient } from "./helpers/realtime-bus.js";

type Car = { x: number };
type MultiCarState = { cars: Record<string, Car> };
type MultiCarInput = { dx: number };

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

test("createEntityCompositor renders the local entity from corrected prediction and remotes from interpolation", async () => {
  const bus = new RealtimeBus();
  const { client: hostClient } = await connectedClient(bus);
  const { client: guestClient } = await connectedClient(bus);
  const hostRoom = hostClient.createRealtimeRoom<MultiCarState, MultiCarInput>({});
  const created = await hostRoom.create();

  const localId = guestClient.playerId!;
  const localPredict = createLocalPrediction<MultiCarState, Car, MultiCarInput>({
    localEntityId: () => localId,
    getLocalEntity: (state, id) => state.cars[id],
    predictLocal: (car, input) => ({ x: car.x + input.dx }),
    replaceLocalEntity: (state, id, car) => ({ cars: { ...state.cars, [id]: car } }),
  });

  const guestRoom = guestClient.createRealtimeRoom<MultiCarState, MultiCarInput>({
    interpolationDelayMs: 0,
    simulationHz: 60,
    predict: localPredict,
    interpolate: (_from, to) => to,
    composeRenderState: createEntityCompositor<MultiCarState, Car>({
      listEntityIds: (state) => Object.keys(state.cars),
      getEntity: (state, id) => state.cars[id],
      setEntity: (state, id, car) => ({ cars: { ...state.cars, [id]: car } }),
      isLocalEntity: (id) => id === localId,
    }),
  });
  await guestRoom.join({ inviteCode: created.inviteCode });

  hostRoom.publishSnapshot(
    { cars: { [localId]: { x: 0 }, remote: { x: 100 } } },
    { simulationTick: 1 },
  );
  await sleep(5);

  guestRoom.setInput({ dx: 10 });
  const t0 = 5_000;
  const fixedStepMs = 1000 / 60;
  const step = fixedStepMs + 0.01;
  guestRoom.advanceFrame(t0);
  guestRoom.advanceFrame(t0 + step);
  const now = t0 + step;

  const rendered = guestRoom.getRenderState(now);
  // Local car comes from prediction (advanced by the held input)...
  assert.equal(rendered?.cars[localId]?.x, 10);
  // ...while the remote car comes untouched from authoritative interpolation.
  assert.equal(rendered?.cars.remote?.x, 100);

  // A new authoritative snapshot triggers reconciliation of the local car
  // only; the remote car (never predicted) must stay exactly what the host
  // published.
  hostRoom.publishSnapshot(
    { cars: { [localId]: { x: 0 }, remote: { x: 100 } } },
    { simulationTick: 2 },
  );
  await sleep(120);
  guestRoom.advanceFrame(now + step);
  const reconciled = guestRoom.getRenderState(now + step);
  assert.equal(reconciled?.cars.remote?.x, 100);
});

test("createEntityCompositor's bulk setEntities is preferred over setEntity and copies the entity collection once", () => {
  const compositor = createEntityCompositor<MultiCarState, Car>({
    listEntityIds: (state) => Object.keys(state.cars),
    getEntity: (state, id) => state.cars[id],
    setEntity: () => {
      throw new Error("setEntity must not be called when setEntities is provided");
    },
    setEntities: (state, entities) => {
      const cars = { ...state.cars };
      for (const [id, car] of entities) cars[id] = car;
      return { cars };
    },
    isLocalEntity: (id) => id === "local",
  });

  const result = compositor({
    interpolated: { cars: { local: { x: 0 }, remote: { x: 100 } } },
    correctedPredicted: { cars: { local: { x: 42 }, remote: { x: 999 } } },
  });
  assert.equal(result?.cars.local?.x, 42);
  assert.equal(result?.cars.remote?.x, 100);
});

test("createEntityCompositor requires setEntity or setEntities", () => {
  assert.throws(() =>
    createEntityCompositor<MultiCarState, Car>({
      listEntityIds: (state) => Object.keys(state.cars),
      getEntity: (state, id) => state.cars[id],
      isLocalEntity: () => false,
    }),
  );
});

test("createLocalPrediction leaves every non-local entity untouched, predicting only the local one", () => {
  const predict = createLocalPrediction<MultiCarState, Car, MultiCarInput>({
    localEntityId: () => "a",
    getLocalEntity: (state, id) => state.cars[id],
    predictLocal: (car, input, dtSeconds) => ({ x: car.x + input.dx * dtSeconds }),
    replaceLocalEntity: (state, id, car) => ({ cars: { ...state.cars, [id]: car } }),
  });

  const state: MultiCarState = { cars: { a: { x: 0 }, b: { x: 50 } } };
  const next = predict(state, { dx: 20 }, 0.5);
  assert.equal(next.cars.a?.x, 10);
  assert.equal(next.cars.b?.x, 50);
  // The original state is untouched.
  assert.equal(state.cars.a?.x, 0);
});

test("createLocalPrediction is a no-op passthrough when there is no local entity yet", () => {
  const predict = createLocalPrediction<MultiCarState, Car, MultiCarInput>({
    localEntityId: (state) => (state.cars.a ? "a" : undefined),
    getLocalEntity: (state, id) => state.cars[id],
    predictLocal: (car, input, dtSeconds) => ({ x: car.x + input.dx * dtSeconds }),
    replaceLocalEntity: (state, id, car) => ({ cars: { ...state.cars, [id]: car } }),
  });

  const state: MultiCarState = { cars: {} };
  assert.deepEqual(predict(state, { dx: 20 }, 0.5), state);
});
