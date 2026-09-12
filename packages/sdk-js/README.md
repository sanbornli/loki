# @lokiplay/sdk

JavaScript client SDK for authenticating players, joining Loki multiplayer
rooms, sending actions and events, and subscribing to server messages.

```sh
npm install @lokiplay/sdk@0.2.3
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
