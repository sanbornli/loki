# @lokiplay/sdk

JavaScript client SDK for authenticating players, joining Loki multiplayer
rooms, sending actions and events, and subscribing to server messages.

```sh
npm install @lokiplay/sdk
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
invite code. Games call `createRoom()` and `joinRoom({ inviteCode })` and must
not invent room keys. Host authority is suitable for casual/unranked games, not
ranked anti-cheat.
