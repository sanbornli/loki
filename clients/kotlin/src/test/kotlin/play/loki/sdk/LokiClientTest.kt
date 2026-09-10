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
    fun quantizeRoundsAndRejectsNonFinite() {
        assertEquals(335L, LokiQuantize.quantize(3.35, 100))
        assertEquals(3.35, LokiQuantize.dequantize(335, 100))
        try {
            LokiQuantize.quantize(Double.NaN, 100)
            throw AssertionError("expected non-finite quantize to fail")
        } catch (_: IllegalArgumentException) {
        }
        try {
            LokiQuantize.quantize(3.35, 0)
            throw AssertionError("expected invalid scale to fail")
        } catch (_: IllegalArgumentException) {
        }
    }

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

        runSuspend {
            client.sendAction("room-1", 1, JsonValue.ObjectValue(mapOf("move" to 1L.jsonNumber())), "fixture_action_1")
            client.publishHostState(
                "room-1",
                2,
                0,
                JsonValue.ObjectValue(mapOf("tick" to 1L.jsonNumber())),
                0,
                "fixture_action_1",
            )
            client.sendActionReject("room-1", 4, "fixture_action_2", "rejected", "action rejected")
        }
        val encoded = transport.requests.takeLast(3).map { request ->
            checkNotNull(request.payload.value["envelope"]).objectMap()
        }
        assertEquals("action", encoded[0].string("type"))
        assertEquals("fixture_action_1", encoded[0].string("actionId"))
        assertEquals("host_state", encoded[1].string("type"))
        assertEquals(0L, encoded[1].long("expectedStateVersion"))
        assertEquals("action_reject", encoded[2].string("type"))
        assertEquals("fixture_action_2", encoded[2].string("actionId"))
    }

    @Test
    fun synchronizedRoomsConvergeAndRetainFailedLeave() {
        val world = MemoryWorld()
        val hostTransport = MemoryRoomTransport(world)
        val memberTransport = MemoryRoomTransport(world)
        val host = LokiClient(hostTransport)
        val member = LokiClient(memberTransport)
        runAwait {
            host.authenticate("host")
            host.connect()
            member.authenticate("member")
            member.connect()
        }
        val hostRoom = host.createSynchronizedRoom(counterState()) { state, action, _ -> reduceCounter(state, action) }
        val memberRoom = member.createSynchronizedRoom(counterState()) { state, action, _ -> reduceCounter(state, action) }
        val created = runAwait { hostRoom.create() }
        runAwait { memberRoom.join(created.inviteCode) }
        runAwait { memberRoom.dispatch(JsonValue.ObjectValue(mapOf("d" to 3L.jsonNumber()))) }
        assertEquals(3L, counterValue(hostRoom.getSnapshot().state))
        assertEquals(3L, counterValue(memberRoom.getSnapshot().state))
        assertEquals(true, hostRoom.isHost)
        assertEquals(false, memberRoom.isHost)

        hostTransport.failNextLeave()
        try {
            runAwait { hostRoom.leave() }
            throw AssertionError("leave should fail")
        } catch (error: Throwable) {
            assertEquals(ConnectionState.LeaveFailed, hostRoom.getSnapshot().connection)
        }
        assertNotNull(host.currentRoomId)
        runAwait { hostRoom.leave() }
        assertEquals(ConnectionState.Closed, hostRoom.getSnapshot().connection)
    }

    @Test
    fun leaveWinsStaleSnapshotAuthorityAndDuplicate() {
        val world = MemoryWorld()
        val transport = MemoryRoomTransport(world)
        val client = LokiClient(transport)
        runAwait {
            client.authenticate("host")
            client.connect()
        }
        val room = client.createSynchronizedRoom(counterState()) { state, action, _ -> reduceCounter(state, action) }
        runAwait { room.create() }
        runAwait { room.dispatch(JsonValue.ObjectValue(mapOf("d" to 4L.jsonNumber()))) }
        transport.injectStaleSnapshot()
        assertEquals(4L, counterValue(room.getSnapshot().state))
        assertEquals(2L, room.getSnapshot().stateVersion)

        val memberTransport = MemoryRoomTransport(world)
        val member = LokiClient(memberTransport)
        runAwait {
            member.authenticate("member")
            member.connect()
        }
        val memberRoom = member.createSynchronizedRoom(counterState()) { state, action, _ -> reduceCounter(state, action) }
        val created = room.getSnapshot()
        memberTransport.emitUnseenDuplicateOnce()
        runAwait { memberRoom.join(created.inviteCode) }
        runAwait { memberRoom.dispatch(JsonValue.ObjectValue(mapOf("d" to 1L.jsonNumber()))) }
        assertEquals(5L, counterValue(memberRoom.getSnapshot().state))

        val holdTransport = MemoryRoomTransport(world)
        holdTransport.holdNextEnter()
        val second = LokiClient(holdTransport)
        runAwait {
            second.authenticate("late")
            second.connect()
        }
        val lateRoom = second.createSynchronizedRoom(counterState()) { state, _, _ -> state }
        val joining = startAwait { lateRoom.join(created.inviteCode) }
        holdTransport.waitUntilHeld()
        val leaving = startAwait { lateRoom.leave() }
        holdTransport.releaseEnter()
        joining.await()
        leaving.await()
        val connection = lateRoom.getSnapshot().connection
        assertEquals(
            true,
            connection == ConnectionState.Closed ||
                connection == ConnectionState.Failed ||
                connection == ConnectionState.LeaveFailed,
        )
    }

    @Test
    fun listenerIsolationReconnectAndHostMigration() {
        val world = MemoryWorld()
        val hostTransport = MemoryRoomTransport(world)
        val memberTransport = MemoryRoomTransport(world)
        val host = LokiClient(hostTransport)
        val member = LokiClient(memberTransport)
        runAwait {
            host.authenticate("host")
            host.connect()
            member.authenticate("member")
            member.connect()
        }
        host.onMessage { error("isolated listener") }
        val hostRoom = host.createSynchronizedRoom(counterState()) { state, action, _ -> reduceCounter(state, action) }
        val memberRoom = member.createSynchronizedRoom(counterState()) { state, action, _ -> reduceCounter(state, action) }
        val created = runAwait { hostRoom.create() }
        runAwait { memberRoom.join(created.inviteCode) }
        runAwait { hostRoom.dispatch(JsonValue.ObjectValue(mapOf("d" to 5L.jsonNumber()))) }
        runAwait { hostRoom.leave() }
        runAwait { memberRoom.dispatch(JsonValue.ObjectValue(mapOf("d" to 1L.jsonNumber()))) }
        assertEquals(6L, counterValue(memberRoom.getSnapshot().state))
        assertEquals(true, memberRoom.isHost)

        val isolated = LokiClient(MemoryRoomTransport(world))
        runAwait {
            isolated.authenticate("iso")
            isolated.connect()
        }
        isolated.onMessage { error("isolated") }
        val isolatedRoom = isolated.createSynchronizedRoom(counterState()) { state, action, _ -> reduceCounter(state, action) }
        runAwait { isolatedRoom.create() }
        runAwait { isolatedRoom.dispatch(JsonValue.ObjectValue(mapOf("d" to 1L.jsonNumber()))) }
        isolated.notifyConnection("reconnect_failed")
        assertEquals(ConnectionState.Reconnecting, isolatedRoom.getSnapshot().connection)
    }
}

private fun counterState() = JsonValue.ObjectValue(mapOf("n" to 0L.jsonNumber()))

private fun reduceCounter(state: JsonValue, action: JsonValue): JsonValue {
    val n = state.objectMap()["n"] as? JsonValue.Number ?: return state
    val d = action.objectMap()["d"] as? JsonValue.Number ?: return state
    return JsonValue.ObjectValue(mapOf("n" to (n.value + d.value).jsonNumber()))
}

private fun counterValue(state: JsonValue): Long =
    (state.objectMap()["n"] as JsonValue.Number).value

private fun <T> runAwait(block: suspend () -> T): T {
    val latch = java.util.concurrent.CountDownLatch(1)
    var result: Result<T>? = null
    block.startCoroutine(object : Continuation<T> {
        override val context = EmptyCoroutineContext
        override fun resumeWith(value: Result<T>) {
            result = value
            latch.countDown()
        }
    })
    check(latch.await(8, java.util.concurrent.TimeUnit.SECONDS)) { "timed out" }
    return checkNotNull(result).getOrThrow()
}

private class AwaitHandle<T> {
    private val latch = java.util.concurrent.CountDownLatch(1)
    private var result: Result<T>? = null

    fun complete(value: Result<T>) {
        result = value
        latch.countDown()
    }

    fun await(): Result<T> {
        check(latch.await(8, java.util.concurrent.TimeUnit.SECONDS)) { "timed out" }
        return checkNotNull(result)
    }
}

private fun <T> startAwait(block: suspend () -> T): AwaitHandle<T> {
    val handle = AwaitHandle<T>()
    block.startCoroutine(object : Continuation<T> {
        override val context = EmptyCoroutineContext
        override fun resumeWith(value: Result<T>) { handle.complete(value) }
    })
    return handle
}

private fun <T> runSuspend(block: suspend () -> T): T {
    var result: Result<T>? = null
    block.startCoroutine(object : Continuation<T> {
        override val context = EmptyCoroutineContext
        override fun resumeWith(value: Result<T>) { result = value }
    })
    return checkNotNull(result) { "Test transport unexpectedly suspended" }.getOrThrow()
}

private data class MemoryRoom(
    val roomId: String,
    val inviteCode: String,
    var hostId: String,
    var version: Long,
    var sequence: Long,
    var state: JsonValue,
    val members: MutableMap<String, JsonValue.ObjectValue>,
)

private class MemoryWorld {
    private val lock = Any()
    private val rooms = mutableMapOf<String, MemoryRoom>()
    private val invites = mutableMapOf<String, String>()
    private val listeners = mutableMapOf<String, MutableList<(JsonValue.ObjectValue) -> Unit>>()

    fun set(room: MemoryRoom) = synchronized(lock) {
        rooms[room.roomId] = room
        invites[room.inviteCode] = room.roomId
    }

    fun room(id: String) = synchronized(lock) { rooms[id] }

    fun roomByInvite(invite: String) = synchronized(lock) {
        invites[invite]?.let { rooms[it] } ?: error("invite not found")
    }

    fun register(roomId: String, listener: (JsonValue.ObjectValue) -> Unit) = synchronized(lock) {
        listeners.getOrPut(roomId) { mutableListOf() }.add(listener)
    }

    fun broadcast(roomId: String, fields: Map<String, JsonValue>) {
        val envelope = JsonValue.ObjectValue(fields)
        val targets = synchronized(lock) { listeners[roomId]?.toList().orEmpty() }
        targets.forEach { it(envelope) }
    }
}

private class MemoryRoomTransport(private val world: MemoryWorld) : LokiTransport {
    private var playerId: String? = null
    private var roomId: String? = null
    private var listener: ((JsonValue.ObjectValue) -> Unit)? = null
    private var failLeave = false
    private var holding = false
    private var enterHold: Continuation<Unit>? = null
    private var unseenDuplicate = false
    @Volatile private var parked = false

    override suspend fun request(request: LokiRequest): JsonValue {
        return when (request.operation) {
            "auth.authenticate" -> {
                playerId = java.util.UUID.randomUUID().toString()
                JsonValue.ObjectValue(
                    mapOf(
                        "playerId" to playerId!!.jsonString(),
                        "accessToken" to "a".jsonString(),
                        "refreshToken" to "r".jsonString(),
                        "expiresAt" to 1L.jsonNumber(),
                    ),
                )
            }
            "rooms.create" -> {
                waitIfHeld()
                val id = java.util.UUID.randomUUID().toString()
                val invite = id.replace("-", "").take(16).uppercase()
                val player = requirePlayer()
                val room = MemoryRoom(id, invite, player, 0, 0, JsonValue.ObjectValue(emptyMap()), mutableMapOf())
                room.members[player] = member(player, true)
                world.set(room)
                roomId = id
                listener?.let { world.register(id, it) }
                joined(room)
            }
            "rooms.join" -> {
                waitIfHeld()
                val invite = request.payload.value.string("inviteCode")
                val player = requirePlayer()
                val room = world.roomByInvite(invite)
                room.members[player] = member(player, false)
                world.set(room)
                roomId = room.roomId
                listener?.let { world.register(room.roomId, it) }
                joined(room)
            }
            "rooms.leave" -> {
                if (failLeave) {
                    failLeave = false
                    error("leave failed")
                }
                leaveRoom()
                JsonValue.ObjectValue(emptyMap())
            }
            "rooms.reconnect" -> JsonValue.ObjectValue(emptyMap())
            "rooms.send" -> {
                val envelope = request.payload.value["envelope"]?.objectMap() ?: return JsonValue.ObjectValue(emptyMap())
                handle(envelope)
                JsonValue.ObjectValue(emptyMap())
            }
            else -> JsonValue.ObjectValue(emptyMap())
        }
    }

    override suspend fun connect(onMessage: (JsonValue.ObjectValue) -> Unit) { listener = onMessage }
    override suspend fun disconnect() { listener = null }

    fun failNextLeave() { failLeave = true }
    fun holdNextEnter() { holding = true; parked = false }
    fun emitUnseenDuplicateOnce() { unseenDuplicate = true }
    fun waitUntilHeld() {
        val started = System.currentTimeMillis()
        while (holding && !parked && System.currentTimeMillis() - started < 2000) Thread.sleep(1)
    }
    fun releaseEnter() {
        holding = false
        enterHold?.resumeWith(Result.success(Unit))
        enterHold = null
    }

    fun injectStaleSnapshot() {
        val current = roomId ?: return
        val room = world.room(current) ?: return
        world.broadcast(current, snapshot(room, version = maxOf(0, room.version - 1), state = JsonValue.ObjectValue(mapOf("n" to (-1L).jsonNumber()))))
    }

    private suspend fun waitIfHeld() {
        if (!holding) return
        kotlin.coroutines.suspendCoroutine { continuation ->
            enterHold = continuation
            parked = true
        }
    }

    private fun leaveRoom() {
        val current = roomId
        val player = playerId
        if (current == null || player == null) {
            roomId = null
            return
        }
        val room = world.room(current) ?: run {
            roomId = null
            return
        }
        room.members.remove(player)
        if (room.hostId == player) {
            val previous = room.hostId
            room.hostId = room.members.keys.firstOrNull() ?: ""
            room.sequence += 1
            world.set(room)
            world.broadcast(
                room.roomId,
                mapOf(
                    "protocolVersion" to 1L.jsonNumber(),
                    "roomId" to room.roomId.jsonString(),
                    "sequence" to room.sequence.jsonNumber(),
                    "type" to "host_changed".jsonString(),
                    "previousHostId" to previous.jsonString(),
                    "hostId" to room.hostId.jsonString(),
                    "stateVersion" to room.version.jsonNumber(),
                ),
            )
        } else {
            world.set(room)
        }
        roomId = null
    }

    private fun handle(envelope: Map<String, JsonValue>) {
        val current = roomId ?: return
        val room = world.room(current) ?: return
        when (envelope.optionalString("type")) {
            "snapshot_request" -> {
                room.sequence += 1
                world.set(room)
                world.broadcast(room.roomId, snapshot(room))
            }
            "host_state" -> {
                room.state = envelope["state"] ?: room.state
                room.version += 1
                room.sequence += 1
                world.set(room)
                world.broadcast(room.roomId, state(room, envelope.optionalString("actionId"), envelope.optionalString("senderId")))
            }
            "action" -> {
                val actionId = envelope.optionalString("actionId") ?: return
                val sender = requirePlayer()
                if (unseenDuplicate) {
                    unseenDuplicate = false
                    room.sequence += 1
                    world.set(room)
                    listener?.invoke(
                        JsonValue.ObjectValue(
                            mapOf(
                                "protocolVersion" to 1L.jsonNumber(),
                                "roomId" to room.roomId.jsonString(),
                                "sequence" to room.sequence.jsonNumber(),
                                "type" to "error".jsonString(),
                                "code" to "INVALID_MESSAGE".jsonString(),
                                "message" to "duplicate action".jsonString(),
                                "actionId" to actionId.jsonString(),
                                "senderId" to sender.jsonString(),
                            ),
                        ),
                    )
                }
                room.sequence += 1
                world.set(room)
                world.broadcast(
                    room.roomId,
                    mapOf(
                        "protocolVersion" to 1L.jsonNumber(),
                        "roomId" to room.roomId.jsonString(),
                        "sequence" to room.sequence.jsonNumber(),
                        "type" to "action".jsonString(),
                        "senderId" to sender.jsonString(),
                        "actionId" to actionId.jsonString(),
                        "payload" to (envelope["payload"] ?: JsonValue.Null),
                    ),
                )
            }
        }
    }

    private fun joined(room: MemoryRoom) = JsonValue.ObjectValue(
        mapOf(
            "roomId" to room.roomId.jsonString(),
            "inviteCode" to room.inviteCode.jsonString(),
            "snapshot" to JsonValue.ObjectValue(snapshot(room)),
        ),
    )

    private fun snapshot(
        room: MemoryRoom,
        version: Long? = null,
        state: JsonValue? = null,
    ) = mapOf(
        "protocolVersion" to 1L.jsonNumber(),
        "roomId" to room.roomId.jsonString(),
        "sequence" to room.sequence.jsonNumber(),
        "type" to "snapshot".jsonString(),
        "hostId" to room.hostId.jsonString(),
        "state" to (state ?: room.state),
        "stateVersion" to (version ?: room.version).jsonNumber(),
        "members" to JsonValue.ArrayValue(room.members.values.toList()),
        "capabilities" to JsonValue.ObjectValue(
            mapOf(
                "synchronized_rooms" to JsonValue.Bool(true),
                "minimumProtocolVersion" to 1L.jsonNumber(),
            ),
        ),
    )

    private fun state(room: MemoryRoom, actionId: String?, senderId: String?): Map<String, JsonValue> {
        val fields = mutableMapOf(
            "protocolVersion" to 1L.jsonNumber(),
            "roomId" to room.roomId.jsonString(),
            "sequence" to room.sequence.jsonNumber(),
            "type" to "state".jsonString(),
            "hostId" to room.hostId.jsonString(),
            "state" to room.state,
            "stateVersion" to room.version.jsonNumber(),
        )
        if (actionId != null) fields["actionId"] = actionId.jsonString()
        if (senderId != null) fields["senderId"] = senderId.jsonString()
        return fields
    }

    private fun member(playerId: String, host: Boolean) = JsonValue.ObjectValue(
        mapOf(
            "playerId" to playerId.jsonString(),
            "sessionId" to playerId.jsonString(),
            "joinedAt" to 0L.jsonNumber(),
            "host" to JsonValue.Bool(host),
        ),
    )

    private fun requirePlayer() = playerId ?: error("authenticate first")
}
