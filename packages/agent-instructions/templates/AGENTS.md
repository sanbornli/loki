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
  Games must not invent Loki room keys.
- Keep game state JSON-compatible and use finite safe integers.
- Handle reconnect snapshots, host changes, stale-update errors, and focus
  release when the Loki overlay opens.
- Run `npx lokiplay validate` before `npx lokiplay deploy`.
