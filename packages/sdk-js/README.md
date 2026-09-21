# @lokiplay/sdk

JavaScript client SDK for authenticating players, joining Loki multiplayer
rooms, sending actions and events, and subscribing to server messages.

```sh
npm install @lokiplay/sdk@0.4.0
```

Use `FirstPartyTransport` for production. It defaults to
`https://api.lokiplay.cc` and the managed Loki multiplayer endpoint; explicit
endpoint overrides are available for local and staging environments. The
public API exposes Loki protocol values only—Nakama objects are never returned.

Hosted sandbox games receive a `MessagePort` in the `loki:init` message. Call
`createHostedLokiClient({ projectId })` once at page boot rather than
hand-writing that handshake: it installs the `loki:init` listener
immediately, replies, and requests the session as soon as the handshake
arrives — not deferred until the player clicks Create/Join, which is what
lets the hosted shell's own ~15s "Connecting…" timeout elapse before the
game ever asked for a session. Reuse the client it returns for every
subsequent `createRoom()`/`joinRoom()`. Pass `fallbackTransport` (e.g. a
`FirstPartyTransport` configured for local dev) to run outside the hosted
shell. Lower-level access remains available via `hostedGameSessionProvider`
if a game needs to build its own `FirstPartyTransport`.

`LokiClient` supports rooms, invite resolution, matchmaking, actions, events,
host state, snapshots, presence, chat, private scores, token refresh, reconnect,
and host-migration messages. Loki creates every room and issues the shareable
invite code. New rooms issue a 6-digit code. `0.2.0` 16-character hex codes
still join. Call `createRoom()` and `joinRoom({ inviteCode })` and do not invent
room keys. `create()` stays invite-only unless the game passes
`{ visibility: "public" }`. Public rooms can be listed with
`listPublicRooms()` and joined with `joinPublic({ roomId })` when the runtime
advertises `public_room_browser`. A public summary includes only an opaque
`roomId`, occupancy, joinable, and an optional bounded `modeLabel`. The SDK
does not add a public lobby screen; the game must build the browser and all
loading, empty, joining, full-room, waiting, readiness, and error states.
The Loki overlay does not list, create, or join public rooms. Do not make
every room public.

Prefer `createSynchronizedRoom()` for shared state. Supply opaque state, opaque
actions, and a reducer. Loki sequences actions, commits only from the current
authority, tracks `stateVersion`, deduplicates action IDs, restores snapshots,
and exposes membership and connection status. Low-level `sendAction()` and
`sendHostState()` remain available. Host authority is suitable for casual
unranked sessions, not ranked integrity.

Generic integration steps:

1. Install the exact published SDK version for this release.
2. Define this project's state and action schemas.
3. Define a synchronous, deterministic, JSON-compatible reducer.
4. Create or join with `create()`, `join({ inviteCode })`, or, when the game
   enables public discovery, `listPublicRooms()` and `joinPublic({ roomId })`.
5. Subscribe to snapshots for state, members, authority, and connection.
6. Dispatch actions and wait for authoritative confirmation.
7. Render connection and `lastError` from the snapshot.
8. Handle rejected actions without inventing a parallel protocol.
9. Build and deploy from this project's own repository.

Reducers must return quickly. Loki clones reducer inputs and catches thrown
errors, but a synchronous infinite loop cannot be interrupted without changing
the reducer API. Do not perform I/O or rendering inside `reduce`. Reducers must
be synchronous, deterministic, and JSON-compatible. Only the current host runs
`reduce`; members wait for an authoritative `state` acknowledgement keyed by
`(senderId, actionId)`.

`create()`, `join({ inviteCode })`, `dispatch(action)`, `leave()`, and
`reconnect()` are the shared synchronized-room API. Call `dispatch()` only
while the snapshot `connection` is `connected`. Hidden or offline pages enter
`suspended`, pause confirmation timers, and keep pending actions and room
identity. Returning to the foreground replaces the socket, requests a snapshot,
and replays unresolved actions with the same `(senderId, actionId)`. A missed
confirmation starts recovery instead of immediately failing `dispatch()`. If
recovery cannot determine the outcome before the recovery deadline, the
promise rejects as `indeterminate`. A failed `leave()` retains the room
identity in `leave_failed` and blocks a new join until `leave()` succeeds or
`close()` abandons the handle. Only `leave()` sends an immediate membership
leave. Connection loss is an interruption and uses reconnect grace. 0.2.0
clients fail fast when a snapshot does not advertise
`capabilities.synchronized_rooms`.
and replays unresolved actions with the same `(senderId, actionId)`. A missed
confirmation starts recovery instead of immediately failing `dispatch()`. If
recovery cannot determine the outcome before the recovery deadline, the
promise rejects as `indeterminate`. A failed `leave()` retains the room
identity in `leave_failed` and blocks a new join until `leave()` succeeds or
`close()` abandons the handle. Only `leave()` sends an immediate membership
leave. Connection loss is an interruption and uses reconnect grace. 0.2.0
clients fail fast when a snapshot does not advertise
`capabilities.synchronized_rooms`.

Protocol numbers must be finite safe integers. Encode fractional values with
stylesheets, or `<form>` submissions. On mobile, the SDK suspends while the page is hidden or offline, then replaces
the socket when the page is visible and online again, retries with backoff, and
leave. Clients replace the roster only when `membersComplete` is true, or when
that flag is omitted and `members` is non-empty. `snapshot.membership` is
`ready` only when the local player is present on a complete roster; otherwise
it is `synchronizing`.

Loki-hosted games run inside a sandboxed iframe. Bundle JavaScript and fonts
as same-origin files. Do not use inline scripts, Google Fonts, remote
stylesheets, or `<form>` submissions. On mobile, the SDK defers reconnect
while the page is hidden or offline, then retries with backoff and
resynchronizes from an authoritative snapshot instead of failing the room.

## RealtimeRoom

`createSynchronizedRoom()` fits turn-based and event-driven games, where state
changes on discrete actions. `createRealtimeRoom()` is for continuously
simulated, host-authoritative games (racers, shooters, anything with a
physics or movement tick) that need smooth remote presentation and cannot
wait for a round-trip confirmation per input. Pick one room type per game
mode by how authoritative state actually progresses, not by genre or visual
frame rate; do not run both for the same mode.

### Responsibility boundary

`RealtimeRoom` owns transport, sequencing, authority/round fencing, snapshot
pacing and backpressure, input delivery and coalescing, reconnect and host
migration, and diagnostics. The game owns simulation, physics, collision,
rendering, and interpolation/extrapolation/reconciliation of remote state.
Loki does not supply game physics, collision resolution, rendering
optimization, or competitive/anti-cheat integrity for realtime rooms.

Every room member must be realtime-capable before a room activates; a
non-realtime-capable (legacy) member blocks activation and cannot join an
already-active realtime room. Native clients cannot join realtime-mode rooms
until a later parity release—use `createSynchronizedRoom()` for cross-client
modes today.

### API example

```ts
import { LokiClient, FirstPartyTransport } from "@lokiplay/sdk";

interface RacerState {
  positions: Record<string, number>;
}
interface RacerInput {
  throttle: number; // 0-100, latest-wins
}

const client = new LokiClient({
  projectId,
  transport: new FirstPartyTransport(),
});
await client.authenticate(token);

// createRealtimeRoom() marks the room realtimeCapable automatically; the
// game's own simulation (not the SDK) advances state from inputs each tick.
const room = client.createRealtimeRoom<RacerState, RacerInput>({
  predict(state, localInput, dtSeconds) {
    // Local-only prediction: applied each advanceFrame() step for the latest
    // setInput() control, and once immediately for each sendInput() command.
    return state;
  },
  interpolate(from, to, t) {
    // Blend remote state between two received snapshots (t in [0, 1]).
    return to;
  },
  extrapolate(state, dtSeconds) {
    // Optional: advance state when no newer snapshot has arrived yet.
    return state;
  },
  blendCorrection(predicted, target, t) {
    // Optional: smooth a misprediction (predicted, frozen at the moment the
    // correction started) back toward `target`, which is the room's live,
    // continuously-advancing #predictedState (not a delayed snapshot), so the
    // blend always converges on zero-latency local prediction. t rises from
    // 0 to 1 over correctionMs. If a new snapshot arrives while a correction
    // is already in flight, Loki rebases `predicted` to whatever was last
    // displayed instead of restarting, and preserves the original deadline.
    return target;
  },
  shouldCorrect(displayed, reconciled) {
    // Optional: Loki's state is opaque JSON, so it can't judge position
    // units or heading radians itself. Return false to suppress starting a
    // new correction when the drift between what's currently displayed and
    // the freshly reconciled prediction is imperceptible. Defaults to
    // always correcting when omitted.
    return true;
  },
  composeRenderState(states) {
    // Optional: compose the independent render streams (see below) into the
    // single State returned by getRenderState(), instead of one predicted-
    // or-authoritative value applying to the whole state at once. Defaults
    // to `correctedPredicted ?? interpolated` when omitted.
    return states.correctedPredicted ?? states.interpolated;
  },
});

const created = await room.create();
// or: await room.join({ inviteCode });

// Host loop: publish the latest simulated state. `snapshotHz` (default 30,
// also the runtime cap) is a ceiling, not a delivery guarantee — Loki
// paces/coalesces calls, tracks each submission until it's accepted,
// rejected, or times out, and never lets a dropped submission permanently
// consume in-flight budget (see "Tuning defaults and diagnostics" below).
room.publishSnapshot(currentState, { simulationTick });

// Every client: continuous latest-wins input (throttle, aim, movement axis).
room.setInput({ throttle: 75 });

// Ordered, discrete commands that must not be coalesced (e.g. "place bomb").
await room.sendInput({ type: "placeBomb", cell: 12 });

// Drive rendering from the game's own requestAnimationFrame loop.
function frame(now: number) {
  room.advanceFrame(now);
  render(room.getRenderState(now));
}
```

### Independent render streams and composition

For a single-entity game, `getRenderState()`'s default of "the whole state is
either fully predicted or fully authoritative-interpolated" is enough. For a
multi-entity game (e.g. a racer with other players' cars, or anything with
collisions), predicting every entity from local input guesses other players'
controls and can diverge sharply after a collision. `getRenderStates(now)`
exposes the streams `getRenderState()` composes internally, so a compositor
can render each entity from whichever stream fits it best:

```ts
composeRenderState(states) {
  return {
    // Local entity: zero-latency prediction (with correction blending).
    cars: {
      ...states.interpolated?.cars,
      [localPlayerId]: states.correctedPredicted?.cars[localPlayerId],
    },
  };
},
```

- `interpolated` / `latestAuthoritative`: the delayed/interpolated (or
  extrapolated) authoritative sample, and the most recently accepted
  snapshot with no delay applied — use these for remote entities and as
  collision proxies. Both are sampled independently of local reconciliation:
  a local correction never resets, replaces, or snaps this stream.
- `predicted` / `correctedPredicted`: the live local prediction, before and
  after `blendCorrection` is applied — use these for the local entity.
- `interpolatedTick` / `authoritativeTick` / `predictedTick`: the simulation
  ticks each stream currently represents, for compositors that need to
  reason about relative timing (e.g. how far ahead prediction has advanced).

`getRenderState()` calls `getRenderStates()` internally and, if
`composeRenderState` is configured, passes its result through that callback;
otherwise it defaults to `correctedPredicted ?? interpolated`, matching prior
behavior. Loki has no concept of "entities" — `composeRenderState` composes
whatever opaque State shape the game defines; correction-magnitude/entity
diagnostics (e.g. "car 3 corrected by 0.4m") are similarly game-specific and
are expected to be computed inside `shouldCorrect`/`composeRenderState`
rather than built into Loki's diagnostics.

#### `createEntityCompositor` / `createLocalPrediction` helpers

Hand-writing a `composeRenderState` that renders the local entity from
prediction and every other entity from interpolation (or a `predict` that
only ever touches the local entity) is the same boilerplate for most
multi-entity games. `createEntityCompositor` and `createLocalPrediction`
cover that plumbing; the game still supplies the selectors that know its own
State shape — Loki still has no built-in concept of "entity", "position", or
"heading":

```ts
import { createEntityCompositor, createLocalPrediction } from "@lokiplay/sdk";

const room = client.createRealtimeRoom<RacerState, RacerInput>({
  predict: createLocalPrediction<RacerState, CarState, RacerInput>({
    localEntityId: () => client.playerId,
    getLocalEntity: (state, id) => state.cars[id],
    predictLocal: (car, input, dtSeconds) => stepCar(car, input, dtSeconds),
    replaceLocalEntity: (state, id, car) => ({ ...state, cars: { ...state.cars, [id]: car } }),
  }),
  composeRenderState: createEntityCompositor<RacerState, CarState>({
    listEntityIds: (state) => Object.keys(state.cars),
    getEntity: (state, id) => state.cars[id],
    setEntity: (state, id, car) => ({ ...state, cars: { ...state.cars, [id]: car } }),
    isLocalEntity: (id) => id === client.playerId,
  }),
});
```

`createLocalPrediction` guards against a common mistake — a `predict()` that
closes over the whole state and accidentally advances every entity (guessing
other players' controls) instead of just the local one.

For many entities, prefer `setEntities(state, entities)` (a `Map`) over
`setEntity(state, id, entity)`: `setEntities` is called at most once per
frame with every entity being overlaid, so the game copies its entity
collection once instead of once per entity. `setEntities` is used instead
of `setEntity` whenever both are supplied.

### Confirmed effects

Speculative local effects (collision particles, impact audio) need to be
reconciled against the host's authoritative outcome without the game
building its own event-confirmation channel. Host-only `sendEffect()`
confirms an event with a stable, runtime-assigned `effectId` (unique even
across host migrations), reliably broadcast to every member — including the
host itself, through the same `onConfirmedEffect()` path everyone else
uses — plus replayed to a reconnecting member from a short server-side
retained-effect ring so it isn't missed. Loki never interprets `payload`:

```ts
// Host, e.g. on detecting a collision:
room.sendEffect({ kind: "collision", entities: ["car-1", "car-2"] }, { simulationTick });

// Every member, including the host:
room.onConfirmedEffect((effect) => {
  // effect.effectId is stable and delivered at most once per subscriber;
  // dedupe a speculative local effect already played for the same event.
  playConfirmedCollision(effect.payload);
});
```

### Lifecycle and round flow

Rooms use protocol v1 for membership, presence, and host-migration control
messages, and protocol v2 for realtime input/snapshot/sync data traffic; both
run over the same connection. `authorityEpoch` increments on host migration;
`roundSequence` increments when a host calls `beginRound()`. The runtime and
SDK reject stale-round or stale-authority snapshots and inputs so a
reconnecting or migrating host cannot roll back state that members already
rendered. On host migration, `RealtimeRoom` requests a sync from the runtime
before the newly elected host is allowed to publish, so the new host starts
from the latest known state instead of a blank one.

### Tuning defaults and diagnostics

`snapshotHz` (default and cap 30 Hz) is a ceiling, never a promise of
delivery. `simulationHz` (default 60) is the game's own local step rate and
is independent of it — a game commonly runs simulation at 60 Hz while
publishing snapshots far less often. `inputHz` (default/cap 20) is the
network transmission rate for `setInput()`'s continuous control, also
independent of both. None of `simulationHz`/`snapshotHz`/`inputHz` need to
match the deployed `game.json` `tickRate` (a separate, deployment-time
Nakama room-loop setting).

**A higher configured `snapshotHz` is not automatically better.** A room
configured for 30 Hz that only actually gets ~8 Hz delivered (a slow guest,
a saturated in-flight budget, sustained rate limiting) presents *worse*
than a room honestly configured near what it can sustain, because
interpolation/extrapolation assume the configured cadence unless enough
arrival samples exist to correct that assumption (see below). Start with a
conservative rate (`adaptiveRate: true`, or an explicit low `snapshotHz`)
and raise it only with diagnostic evidence — ideally from
`calibrateRealtimeRoom()` (see "Adaptive rate and calibration" below) —
rather than assuming the cap is the right default for every game.

Every `publishSnapshot()` submission is tracked individually
(by a runtime-assigned `hostSnapshotSequence`) until it is accepted,
explicitly rejected, or times out; a submission that never resolves either
way (the runtime's own "late/duplicate echo, dropped silently, no rewind, no
response" behavior for out-of-order in-flight submissions) still releases
its in-flight slot once its ack timeout elapses, so it can never
permanently saturate the in-flight budget. Input queues are also bounded
(`REALTIME_ROOM_MAX_IN_FLIGHT_SNAPSHOTS`, `REALTIME_ROOM_MAX_ORDERED_INPUTS`)
so a latency spike cannot grow memory unboundedly; oldest-first entries are
dropped once a bound is hit. `RealtimeRoomError` reports backpressure and
capability failures (e.g. joining a realtime room with a non-realtime-capable
transport). A runtime `RATE_LIMITED` response to a snapshot submission backs
the next flush off for `retryAfterMs` instead of retrying immediately.

`setInput()` updates local prediction immediately (safe to call every
render frame) but paces network transmission to at most once per `inputHz`
interval; calls faster than that only replace the pending value
(`inputsCoalesced`) and the most recent one is sent once the interval
elapses, and held controls are still periodically refreshed at the same
cadence. A game no longer needs its own input-rate throttle in front of
`setInput()`.

Use the room's diagnostics to observe RTT, jitter, acceptance/rejection, and
reconnect/migration duration when tuning simulation and snapshot rates for a
specific game; report the rates actually used along with this evidence
rather than assuming defaults are sufficient for every game.

`diagnostics: true` also exposes: `renderClockRate` (the current ±5%
playback-rate nudge applied to keep the guest's render clock aligned with the
host's tick cadence — see `REALTIME_ROOM_MAX_CLOCK_NUDGE`), `renderClockDriftTicks`
(the error observed at the last nudge), `framesRendered` /
`extrapolatedFrames` (compare these to see how often rendering had to
extrapolate past the newest snapshot), `heldAuthoritativeFrames` (frames
that held the last snapshot instead — a freeze), and `reconciliations` /
`correctionsStarted` / `correctionsCompleted` / `correctionsSuppressed`
(every reconcile against a prior prediction counts as a `reconciliation`;
it becomes a started correction unless `shouldCorrect` returns false, in
which case it's counted as suppressed instead; a started correction is
`completed` once its blend reaches `t = 1`).

Snapshot cadence is measured at three independent stages so unevenness can
be attributed to its source: `lastSnapshotHostIntervalMs` (interval between
the host's own send timestamps — host pacing), `lastSnapshotRelayIntervalMs`
(interval between the runtime's accept/broadcast timestamps — relay/
backpressure), and `lastSnapshotIntervalMs` (the wall-clock gap between
snapshots as this client actually observed them arriving — the network).
`snapshotArrivalJitterMs` is a smoothed measure of how much that arrival
interval deviates from its own running average; Loki folds it into the
default adaptive interpolation delay (raising delay temporarily when
arrival is uneven, lowering it when stable) unless `interpolationDelayMs` is
set explicitly. `snapshotSequenceGaps` counts missing `runtimeSnapshotSequence`
numbers between consecutive accepted snapshots, and
`snapshotsCoalescedOnReceive` counts snapshots that were superseded by a
newer one before the game ever called `getRenderState()` to sample them.

`publishSnapshot()` defers its flush to a microtask, so if a host calls it
more than once within the same synchronous turn (e.g. a catch-up frame that
simulates several steps before rendering), only the newest state is ever
transmitted — every call after the first just overwrites the pending state
and increments `snapshotsCoalesced`, matching the same-turn coalescing a
game would otherwise have to implement itself.

`diagnostics: true` also exposes host-only publish-cadence diagnostics
measured from `publishSnapshot()`'s own call times (distinct from the
runtime/guest-side cadence numbers above, which measure the wire):
`snapshotPublishCalls`, `lastSnapshotPublishIntervalMs`,
`effectiveSnapshotHz` (the smoothed rate of attempted sends),
`missedSnapshotWindows`, `hostFrameStallCount`, and `lastHostFrameStallMs`.
These flag problems Loki cannot fix itself — the host's own frame loop
stalling, or calling `publishSnapshot()` faster than its configured rate
needs — via an optional `onDiagnosticWarning(event)` callback:

```ts
const room = client.createRealtimeRoom<RacerState, RacerInput>({
  onDiagnosticWarning(event) {
    // event.type: "back_to_back_publish" | "host_frame_stall"
    //           | "missed_snapshot_window" | "low_effective_snapshot_rate"
    //           | "snapshot_ack_timeout" | "snapshot_backpressure"
    //           | "runtime_rate_limited" | "high_extrapolation_ratio"
    console.warn("[loki]", event);
  },
});
```

Host-only, per-submission accounting: `snapshotsAttempted` (equivalent to
`snapshotsSent`, named for clarity: attempts, not runtime acceptance),
`snapshotsAccepted`, `snapshotsRejected` (explicit runtime errors),
`snapshotAckTimeouts` (submissions that never resolved either way and were
released speculatively), `snapshotBackpressureDurationMs` (cumulative time
spent with the in-flight budget fully saturated), `maxInFlightObserved`,
`effectiveAcceptedSnapshotHz` (smoothed rate of *accepted* echoes — falls
behind `effectiveSnapshotHz` when the runtime is dropping/rejecting
submissions), `snapshotAcceptanceRatio`, and `snapshotAckP95Ms`.
Input accounting: `inputCalls` (every `setInput()` call), `inputsTransmitted`
(paced network sends of that continuous control), and `inputRateLimited`.
Guest-only: `guestEffectiveSnapshotHz` (this client's own observed accepted
arrival rate, independent of what the host is configured/targeting to
send).

### Adaptive rate and calibration

By default `snapshotHz` is a fixed target (matching prior behavior). Opt
into an AIMD controller instead — start conservative, climb slowly on
sustained clean acknowledgements, back off immediately and further on
rejection, timeout, or sustained backpressure — with `adaptiveRate: true`:

```ts
const room = client.createRealtimeRoom<RacerState, RacerInput>({
  snapshotHz: 30, // ceiling: never exceeded
  adaptiveRate: true,
  initialSnapshotHz: 12, // start conservative
  minSnapshotHz: 8, // floor
});
```

`currentTargetSnapshotHz`/`configuredMaxSnapshotHz`, and
`adaptiveRateReductions`/`adaptiveRateIncreases`, report the controller's
live target and how often it has adjusted. A guest also sends the host a
bounded, low-frequency (~1 Hz) transport-health report (arrival rate,
jitter, missing sequence numbers, extrapolation ratio); a struggling guest
can trigger a reduction (and blocks further increases) even when the host's
own send/ack cadence looks clean, without the host ever seeing guest state
or controls.

Rather than guessing a starting rate, use `calibrateRealtimeRoom()` to try
candidate rates against a real two-client `RealtimeRoom` pair and recommend
the highest rate that is actually delivered without a Loki-owned cliff
(acceptance, delivery match, extrapolation, held authoritative frames, ack
latency, backpressure). Optional `evaluate()` can only veto a rate:

```ts
import { calibrateRealtimeRoom } from "@lokiplay/sdk";

const { recommended, samples } = await calibrateRealtimeRoom<RacerState, RacerInput>({
  snapshotHzCandidates: [8, 12, 15, 20, 25, 30],
  simulationHz: 60,
  durationMsPerCandidate: 20_000,
  createHostRoom: (candidate) =>
    hostClient.createRealtimeRoom<RacerState, RacerInput>({
      snapshotHz: candidate.snapshotHz,
      adaptiveRate: false,
      diagnostics: true,
    }),
  createGuestRoom: () => guestClient.createRealtimeRoom<RacerState, RacerInput>({ diagnostics: true }),
  driveHost: (host, tick) => host.publishSnapshot(simulateOneStep(tick), { simulationTick: tick }),
  driveGuest: (guest) => guest.setInput(representativeControl()),
});
```

`calibrateRealtimeRoom()` is game-agnostic: it only reads diagnostics from
the rooms `createHostRoom`/`createGuestRoom` build (which must pass
`diagnostics: true` and run each candidate at a fixed `snapshotHz`) and
calls the game's own `driveHost`/`driveGuest`/`evaluate` callbacks — it
never inspects `State`. `hostClient` and `guestClient` need two distinct
authenticated identities (two real players, or two isolated test/browser
sessions); two tabs sharing one signed-in player are not two players. The
result is one `RealtimeProfile` (`schemaVersion`, `simulationHz`,
`snapshotHz` as the ceiling, `inputHz`, `interpolationDelayMs`,
`correctionMs`, `adaptiveRate: true`, `minSnapshotHz: 8`,
`initialSnapshotHz` 12 or the ceiling if lower) to write into
`createRealtimeRoom()` only. If no candidate qualifies, the profile is the
Loki floor (8 Hz, adaptive). If the sweep is incomplete, calibration
throws. `game.json` `tickRate` stays a separate Nakama room-loop setting
and must not be copied from `snapshotHz`.

For calibrating against a *hosted* build (the real player path, including
`createHostedLokiClient()`'s handshake) rather than a headless pair, drive
`createHostRoom`/`createGuestRoom` from two isolated browser contexts
instead of two in-process clients — the mechanics above are identical, only
where the two `RealtimeRoom`s live changes.

### Migrating from hand-rolled racer networking

If a game already ships its own input queue, RTT estimator, snapshot pacer,
stale-round rejection, input replay ledger, interpolation buffer, or
reconnect netcode, replace that code with `RealtimeRoom` rather than running
both. Keep the game's existing simulation, physics, and rendering code: read
input from `setInput()`/`sendInput()` on the host to advance simulation each
tick, publish results with `publishSnapshot()`, and wire remote presentation
into `predict`/`interpolate`/`extrapolate`/`blendCorrection`, driven by one
game-owned `requestAnimationFrame` loop calling `advanceFrame()` and
`getRenderState()`.
