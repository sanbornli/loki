# Loki SDK for Unity

Headless protocol-v1 UPM package with no runtime Unity-engine dependency.
Games inject `ILokiTransport` and use `LokiClient` for authentication, rooms,
invite/deep-link resolution, matchmaking, actions/events/host state,
presence, chat, private leaderboards, refresh, reconnect, and host migration
callbacks.

## Install

In Unity Package Manager, add the Git URL with the package subdirectory:

```text
https://github.com/sanbornli/loki.git?path=/clients/unity#v0.2.2
```

Prefer `CreateSynchronizedRoom(initialState, reduce)` for shared state. The
wrapper matches the JavaScript API: `CreateAsync()`, `JoinAsync(inviteCode)`,
`DispatchAsync(action)`, `LeaveAsync()`, `ReconnectAsync()`, and `CloseAsync()`.
Supply opaque JSON state and actions plus a synchronous deterministic reducer.
Action identity is `(senderId, actionId)`. A failed leave stays in
`LeaveFailed` until retry or `CloseAsync()`. Protocol numbers are integers;
encode floats with `LokiQuantize.Quantize` / `Dequantize`. An omitted or empty
`members` list is not a leave. Snapshot `Membership` is `ready` only when the
local player is present on a complete roster.

## Test

Open Unity Test Runner and run EditMode tests for `Loki.Play.SDK.Tests`, or:

```sh
Unity -batchmode -quit -projectPath /path/to/test-project \
  -runTests -testPlatform EditMode \
  -testResults /tmp/loki-unity-tests.xml
```

The test project must reference this package. Tests parse the packaged shared
conformance fixture and replay a protocol-v1 envelope.

Publishing requires access to the target UPM-compatible registry and its
credentials. Licensed under the MIT License; see `LICENSE.md`.
