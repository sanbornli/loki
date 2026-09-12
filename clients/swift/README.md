# LokiSDK for Swift

Headless protocol-v1 client for Apple platforms. The package contains no UI or
networking dependency: applications inject a `LokiTransport`, then use
`LokiClient` for authentication, rooms, invites, matchmaking, realtime
messages, presence, chat, private leaderboards, reconnect, and host migration.

## Install

Add `https://github.com/sanbornli/loki.git` through Swift Package Manager and
select version `0.2.3` exactly. The repository root exposes `LokiSDK`.

Prefer `createSynchronizedRoom(initialState:reduce:)` for shared state. The
wrapper matches the JavaScript API: `create()`, `join(inviteCode:)`,
`dispatch(_:)`, `leave()`, `reconnect()`, and `close()`. Supply opaque JSON
state and actions plus a synchronous deterministic reducer. Action identity is
`(senderId, actionId)`. Call `dispatch` only while `connection` is `connected`.
Notify Loki of app foreground changes with `notifyLifecycle(visible:online:)`.
A missed confirmation starts recovery instead of immediately failing
`dispatch`. A failed `leave()` stays in `leaveFailed` until retry
or `close()`. Protocol numbers are integers; encode floats with
`LokiQuantize.quantize(_:scale:)` / `dequantize(_:scale:)`. An omitted or
empty `members` list is not a leave. The snapshot `membership` field is
`ready` only when the local player is present on a complete roster.

## Build and test

```sh
swift build --package-path clients/swift
swift test --package-path clients/swift
```

The test suite decodes a package copy of the shared protocol conformance
fixture and replays a server envelope through callbacks.

## Transport

Implement `LokiTransport.request`, `connect`, and `disconnect`. Requests carry
`protocolVersion: 1`, an operation name, and `JSONValue` payload so transports
may use HTTP, WebSocket, Nakama, or an in-memory test adapter.

Licensed under the MIT License; see `LICENSE`.
