# Loki integration rules

- Install and use `@lokiplay/sdk`; do not import Nakama APIs into game code.
- Production multiplayer runs only from a Loki-hosted finished browser build.
- Upload `game.json`, `index.html`, and static assets. Do not upload source-only
  repositories, backend processes, secrets, creator ad scripts, or localhost
  dependencies.
- MVP multiplayer is host-authoritative. Loki controls identity, tenant
  boundaries, membership, matchmaking, sequencing, snapshots, and host
  migration.
- Never trust or override the `projectId`, player identity, room membership, or
  sequence returned by Loki.
- Create rooms with `createRoom()` and join with `joinRoom({ inviteCode })`.
  Do not invent Loki room keys.
- Prefer `createSynchronizedRoom()` for shared state. Define project-owned
  state and actions, then provide a reducer. Do not implement a parallel
  authority, version, or membership protocol.
- Keep shared state JSON-compatible and use finite safe integers. Reducers must
  be synchronous, deterministic, and fast. Do not perform rendering, timers,
  network calls, or other I/O inside a reducer. Keep transient visual and
  interpolation data out of synchronized state.
- Subscribe to synchronized snapshots for state, members, authority, and
  connection status. Keep the same `LokiClient` and synchronized-room instance
  while interrupted. Let the SDK own browser lifecycle detection, socket
  replacement, reconnect retries, snapshot recovery, and pending-action replay.
- Do not implement competing reconnect behavior for `visibilitychange`,
  `pagehide`, `pageshow`, `blur`, `focus`, `online`, or `offline`. Never call
  `leave()`, `close()`, transport disconnect, or create a replacement room
  because the page became hidden, blurred, offline, or unloaded. Call `leave()`
  only for an explicit user Leave/End Game action.
- Call `dispatch()` only while `connection` is `connected`. For `suspended`,
  `reconnecting`, or `resynchronizing`, lock authoritative input, preserve the
  last rendered state, show a temporary reconnecting message, and wait for an
  authoritative snapshot. Do not assume the player is still host afterward.
- Loki replays unresolved actions with the same `(senderId, actionId)`. Do not
  repeat one under a new action ID. Treat `indeterminate` or "authoritative
  confirmation timed out" as an unknown outcome, not proof of failure. Treat
  `room_closed` as terminal. Resolve `leave_failed` before starting another
  room with that client.
- Handle rejected actions from `dispatch()` without inventing a parallel
  protocol. Build and deploy from this repository.
- Include `<meta name="viewport"
  content="width=device-width, initial-scale=1, viewport-fit=cover">`. Do not
  globally disable browser zoom. Make the game root `width: 100%`,
  `height: 100vh`, then `height: 100dvh`, with `overflow: hidden`. Account for
  `env(safe-area-inset-*)`; gameplay must not require document scrolling,
  though internal menus may scroll.
- Recalculate layout from the game container on resize. Handle
  `visualViewport.resize` when available and `orientationchange` as a fallback.
  Preserve logical game coordinates and fit them to the available area instead
  of hard-coding desktop pixels. Support both orientations unless the game
  clearly explains a required orientation.
- For canvas games, separate CSS size from backing resolution, scale the
  backing store by `devicePixelRatio` with a reasonable cap such as 2, and
  resize and redraw after viewport changes without replacing the canvas node.
  Keep critical controls inside safe-area boundaries.
- Use Pointer Events for touch, mouse, pen, and trackpad. Apply
  `touch-action: none` only to a direct-manipulation playfield, use pointer
  capture for dragging or aiming, handle `pointercancel` and lost capture, make
  primary targets at least 44x44 CSS pixels, and do not rely on hover.
- Use one controlled `requestAnimationFrame` rendering loop. Pause or throttle
  rendering while hidden without leaving the Loki room, then render the latest
  authoritative snapshot. Cap canvas resolution and avoid allocating large
  buffers every frame.
- Loki-hosted games run in a sandbox iframe with a strict CSP. Do not use
  inline `<script>` tags, inline event handlers, Google Fonts or other remote
  stylesheets, or `<form>` submissions. Put JavaScript and fonts in same-origin
  files and use `<button type="button">` for create/join controls.
- Run `npx lokiplay validate` before `npx lokiplay deploy`. Report whether
  mobile Safari and Android Chrome were tested; never claim real-device testing
  unless it was actually performed. Exercise resize, orientation changes,
  interrupted gestures, hide/restore, temporary offline recovery, host
  migration, and return after an extended background period when the available
  test environment supports them.
