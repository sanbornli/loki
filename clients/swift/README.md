# LokiSDK for Swift

Headless protocol-v1 client for Apple platforms. The package contains no UI or
networking dependency: applications inject a `LokiTransport`, then use
`LokiClient` for authentication, rooms, invites, matchmaking, realtime
messages, presence, chat, private leaderboards, reconnect, and host migration.

## Install

Add `https://github.com/sanbornli/loki.git` through Swift Package Manager and
select version `0.1.1` or newer. The repository root exposes `LokiSDK`.

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
