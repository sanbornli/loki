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

## Publish

```sh
gradle publish
```

Configure the desired Maven repository and credentials in the release
environment. Signing reads `MAVEN_SIGNING_KEY` and
`MAVEN_SIGNING_PASSWORD`.

Licensed under the MIT License; see `LICENSE`.
