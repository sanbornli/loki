# @lokiplay/sdk

JavaScript client SDK for authenticating players, joining Loki multiplayer
rooms, sending actions and events, and subscribing to server messages.

```sh
npm install @lokiplay/sdk@0.3.4
```

Use `FirstPartyTransport` for production. It defaults to
`https://api.lokiplay.cc` and the managed Loki multiplayer endpoint; explicit
endpoint overrides are available for local and staging environments. The
public API exposes Loki protocol values only—Nakama objects are never returned.

Hosted sandbox games receive a `MessagePort` in the `loki:init` message. Pass
that port and nonce to `hostedGameSessionProvider` so session exchange occurs
through the approved parent bridge without adding Loki infrastructure to the
game manifest allowlist.

`LokiClient` supports rooms, invite resolution, matchmaking, actions, events,
host state, snapshots, presence, chat, private scores, token refresh, reconnect,
and host-migration messages. Loki creates every room and issues the shareable
invite code. New rooms issue a 6-digit code. `0.2.0` 16-character hex codes
still join. Call `createRoom()` and `joinRoom({ inviteCode })` and do not invent
room keys.

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
4. Create or join with `create()` or `join({ inviteCode })`.
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
    // 0 to 1 over correctionMs.
    return target;
  },
});

const created = await room.create();
// or: await room.join({ inviteCode });

// Host loop: publish the latest simulated state; Loki paces/coalesces sends
// up to the runtime's snapshot cap (30 Hz; default 10 Hz).
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

Snapshot publication defaults to 10 Hz and is capped at 30 Hz
(`publishSnapshot()` paces and coalesces calls faster than that). A room
that opts into a higher `snapshotHz` also gets a larger in-flight snapshot
budget so RTT does not stall the higher cadence. Input queues are bounded
(`REALTIME_ROOM_MAX_IN_FLIGHT_SNAPSHOTS`, `REALTIME_ROOM_MAX_ORDERED_INPUTS`)
so a latency spike cannot grow memory unboundedly; oldest-first entries are
dropped once a bound is hit. `RealtimeRoomError` reports backpressure and
capability failures (e.g. joining a realtime room with a non-realtime-capable
transport). Use the room's diagnostics to observe RTT, jitter, and
reconnect/migration duration when tuning simulation and snapshot rates for a
specific game; report the rates actually used along with this evidence rather
than assuming defaults are sufficient for every game.

`diagnostics: true` also exposes: `renderClockRate` (the current ±5%
playback-rate nudge applied to keep the guest's render clock aligned with the
host's tick cadence — see `REALTIME_ROOM_MAX_CLOCK_NUDGE`), `renderClockDriftTicks`
(the error observed at the last nudge), `framesRendered` /
`extrapolatedFrames` (compare these to see how often rendering had to
extrapolate past the newest snapshot), `correctionCount` /
`correctionsCompleted` (corrections started vs. ones that finished blending
before being superseded by the next snapshot), and `lastSnapshotIntervalMs`
(the actual wall-clock gap between the two most recently accepted snapshots,
useful for confirming the real send/ack rate matches the configured
`snapshotHz`).

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
