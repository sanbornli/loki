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
  return quickly. Loki clones inputs and catches thrown errors; it cannot stop a
  synchronous infinite loop without changing the reducer API.
- Subscribe to synchronized snapshots for state, members, authority, and
  connection status. Handle rejected actions, reconnects, and focus release
  when the Loki overlay opens.
- Handle rejected actions from `dispatch()` without inventing a parallel
  protocol. Build and deploy from this repository.
- Loki-hosted games run in a sandbox iframe with a strict CSP. Do not use
  inline `<script>` tags, inline event handlers, Google Fonts or other remote
  stylesheets, or `<form>` submissions. Put JavaScript and fonts in same-origin
  files and use `<button type="button">` for create/join controls.
- Run `npx lokiplay validate` before `npx lokiplay deploy`.
