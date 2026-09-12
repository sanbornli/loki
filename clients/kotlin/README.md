# Loki SDK for Kotlin

Dependency-free, headless protocol-v1 client for Kotlin/JVM. Applications
inject `LokiTransport`; the package supplies JSON-safe models and APIs for
authentication, rooms, invites and deep links, matchmaking, realtime actions,
events and host state, presence, chat, private leaderboards, reconnect, and
host migration callbacks.

## Build and test

With Gradle installed:

```sh
cd clients/kotlin
gradle test
gradle build
```

To generate a wrapper for consumers, run `gradle wrapper`. The tests parse a
copy of the shared conformance fixture and replay a protocol-v1 envelope.

Consumers use the exact Maven coordinate `cc.lokiplay:loki-sdk:0.2.3`.

Prefer `createSynchronizedRoom(initialState, reduce)` for shared state. The
wrapper matches the JavaScript API: `create()`, `join(inviteCode)`,
`dispatch(action)`, `leave()`, `reconnect()`, and `close()`. Supply opaque JSON
state and actions plus a synchronous deterministic reducer. Action identity is
`(senderId, actionId)`. Call `dispatch` only while `connection` is `Connected`.
Notify Loki of app foreground changes with `notifyLifecycle(visible, online)`.
A missed confirmation starts recovery instead of immediately failing
`dispatch`. A failed `leave()` stays in `LeaveFailed` until retry
Notify Loki of app foreground changes with `notifyLifecycle(visible, online)`.
A missed confirmation starts recovery instead of immediately failing
`dispatch`. A failed `leave()` stays in `LeaveFailed` until retry
or `close()`. Protocol numbers are integers; encode floats with
`LokiQuantize.quantize` / `dequantize`. An omitted or empty `members` list is
not a leave. The snapshot `membership` field is `ready` only when the local
player is present on a complete roster.

## Publish

```sh
gradle publish
```

Configure the desired Maven repository and credentials in the release
environment. Signing reads `MAVEN_SIGNING_KEY` and
`MAVEN_SIGNING_PASSWORD`.

Licensed under the MIT License; see `LICENSE`.
