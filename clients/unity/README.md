# Loki SDK for Unity

Headless protocol-v1 UPM package with no runtime Unity-engine dependency.
Games inject `ILokiTransport` and use `LokiClient` for authentication, rooms,
invite/deep-link resolution, matchmaking, actions/events/host state,
presence, chat, private leaderboards, refresh, reconnect, and host migration
callbacks.

## Install

In Unity Package Manager, add the Git URL with the package subdirectory:

```text
https://github.com/sanbornli/loki.git?path=/clients/unity
```

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
