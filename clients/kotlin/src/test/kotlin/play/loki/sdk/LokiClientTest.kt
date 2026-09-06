package play.loki.sdk

import kotlin.coroutines.Continuation
import kotlin.coroutines.EmptyCoroutineContext
import kotlin.coroutines.startCoroutine
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNotNull

private class RecordingTransport : LokiTransport {
    val requests = mutableListOf<LokiRequest>()
    private var listener: ((JsonValue.ObjectValue) -> Unit)? = null

    override suspend fun request(request: LokiRequest): JsonValue {
        requests += request
        return when (request.operation) {
            "auth.authenticate" -> LokiJson.parse(
                """{"playerId":"p1","accessToken":"access","refreshToken":"refresh","expiresAt":100}""",
            )
            "rooms.join" -> LokiJson.parse("""{"roomId":"room-1","roomKey":"duel","hostId":"p1"}""")
            else -> JsonValue.ObjectValue(emptyMap())
        }
    }

    override suspend fun connect(onMessage: (JsonValue.ObjectValue) -> Unit) { listener = onMessage }
    override suspend fun disconnect() { listener = null }
}

class LokiClientTest {
    @Test
    fun fixtureDecodesAsRealJson() {
        val source = assertNotNull(javaClass.getResource("/conformance.json")).readText()
        val document = LokiJson.parse(source).objectMap()
        val canonical = assertIs<JsonValue.ObjectValue>(document["canonicalState"]).value
        assertEquals(
            "039c5612a00a3ea03835619893ad0b6ddadcf6e331a0b1be69e0ad89fb5e676c",
            canonical.string("sha256"),
        )
    }

    @Test
    fun requestsAndReplaysEnvelope() {
        val transport = RecordingTransport()
        val client = LokiClient(transport)
        val session = runSuspend { client.authenticate("guest") }
        assertEquals("p1", session.playerId)
        runSuspend { client.joinRoom("room-1") }

        var snapshotSequence: Long? = null
        var migratedHost: String? = null
        client.callbacks.onHostState = { snapshotSequence = it.sequence }
        client.callbacks.onHostMigrated = { _, host, _ -> migratedHost = host }

        val source = assertNotNull(javaClass.getResource("/conformance.json")).readText()
        val replay = assertIs<JsonValue.ArrayValue>(
            LokiJson.parse(source).objectMap()["serverReplay"],
        )
        replay.value.forEach { client.receive(assertIs<JsonValue.ObjectValue>(it)) }

        assertEquals(0L, snapshotSequence)
        assertEquals("00000000-0000-4000-8000-000000000003", migratedHost)
        assertEquals(listOf("auth.authenticate", "rooms.join"), transport.requests.map { it.operation })
    }
}

private fun <T> runSuspend(block: suspend () -> T): T {
    var result: Result<T>? = null
    block.startCoroutine(object : Continuation<T> {
        override val context = EmptyCoroutineContext
        override fun resumeWith(value: Result<T>) { result = value }
    })
    return checkNotNull(result) { "Test transport unexpectedly suspended" }.getOrThrow()
}
