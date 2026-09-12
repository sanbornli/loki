package play.loki.sdk

import kotlin.coroutines.Continuation
import kotlin.coroutines.EmptyCoroutineContext
import kotlin.coroutines.startCoroutine

const val LOKI_PROTOCOL_VERSION: Long = 1

sealed class JsonValue {
    data object Null : JsonValue()
    data class Bool(val value: Boolean) : JsonValue()
    data class Number(val value: Long) : JsonValue()
    data class StringValue(val value: String) : JsonValue()
    data class ArrayValue(val value: List<JsonValue>) : JsonValue()
    data class ObjectValue(val value: Map<String, JsonValue>) : JsonValue()
}

data class LokiRequest(
    val protocolVersion: Long = LOKI_PROTOCOL_VERSION,
    val operation: String,
    val payload: JsonValue.ObjectValue = JsonValue.ObjectValue(emptyMap()),
)

interface LokiTransport {
    suspend fun request(request: LokiRequest): JsonValue
    suspend fun connect(onMessage: (JsonValue.ObjectValue) -> Unit)
    suspend fun disconnect()
}

data class AuthSession(
    val playerId: String,
    val accessToken: String,
    val refreshToken: String?,
    val expiresAt: Long,
)

data class Room(val roomId: String, val roomKey: String?, val hostId: String?)
data class InviteResolution(val projectId: String, val roomId: String, val inviteToken: String)
data class MatchTicket(val ticketId: String, val status: String, val roomId: String?)
data class Presence(val playerId: String, val sessionId: String, val joinedAt: Long, val team: Long?, val host: Boolean)
data class LeaderboardRecord(val playerId: String, val score: Long, val subscore: Long, val rank: Long)

data class ServerEnvelope(
    val protocolVersion: Long,
    val roomId: String,
    val sequence: Long,
    val type: String,
    val fields: Map<String, JsonValue>,
) {
    companion object {
        fun fromJson(value: JsonValue.ObjectValue): ServerEnvelope {
            val fields = value.value
            return ServerEnvelope(
                fields.long("protocolVersion"),
                fields.string("roomId"),
                fields.long("sequence"),
                fields.string("type"),
                fields,
            )
        }
    }
}

class LokiCallbacks {
    var onEnvelope: (ServerEnvelope) -> Unit = {}
    var onAction: (ServerEnvelope) -> Unit = {}
    var onEvent: (ServerEnvelope) -> Unit = {}
    var onHostState: (ServerEnvelope) -> Unit = {}
    var onPresence: (ServerEnvelope) -> Unit = {}
    var onChat: (ServerEnvelope) -> Unit = {}
    var onLeaderboard: (ServerEnvelope) -> Unit = {}
    var onDisconnected: (Throwable?) -> Unit = {}
    var onSessionRefreshed: (AuthSession) -> Unit = {}
    var onReconnected: () -> Unit = {}
    var onHostMigrated: (previousHostId: String?, hostId: String, stateVersion: Long) -> Unit = { _, _, _ -> }
}

data class JoinedRoom(val roomId: String, val inviteCode: String, val snapshot: ServerEnvelope)

class LokiClient(private val transport: LokiTransport) {
    var callbacks: LokiCallbacks = LokiCallbacks()
    private var session: AuthSession? = null
    var currentRoomId: String? = null
        private set
    var currentInviteCode: String = ""
        private set
    private var sendSequence = 0L
    private var lifecycleGeneration = 0
    private var lifecycleVisible = true
    private var lifecycleOnline = true
    private var leaveFailed = false
    private var reconnecting = false
    private val messageListeners = mutableMapOf<Int, (ServerEnvelope) -> Unit>()
    private val connectionListeners = mutableMapOf<Int, (String) -> Unit>()
    private var nextListenerId = 1
    private val lock = Any()

    val playerId: String? get() = session?.playerId
    val isForeground: Boolean get() = lifecycleVisible && lifecycleOnline

    suspend fun connect() = transport.connect(::receive)

    suspend fun disconnect() {
        transport.disconnect()
        callbacks.onDisconnected(null)
    }

    suspend fun authenticate(token: String): AuthSession {
        val value = call("auth.authenticate", mapOf("token" to token.jsonString())).objectMap()
        return AuthSession(
            value.string("playerId"),
            value.string("accessToken"),
            value.optionalString("refreshToken"),
            value.long("expiresAt"),
        ).also { session = it }
    }

    suspend fun refresh(): AuthSession {
        val token = session?.refreshToken ?: error("No refresh token is available")
        val value = call("auth.refresh", mapOf("refreshToken" to token.jsonString())).objectMap()
        return AuthSession(
            value.string("playerId"),
            value.string("accessToken"),
            value.optionalString("refreshToken"),
            value.long("expiresAt"),
        ).also {
            session = it
            callbacks.onSessionRefreshed(it)
        }
    }

    suspend fun createRoom(
        roomKey: String,
        visibility: String,
        maxPlayers: Long,
        teamSize: Long? = null,
        tickRate: Long = 10,
    ): Room {
        val payload = mutableMapOf(
            "roomKey" to roomKey.jsonString(),
            "visibility" to visibility.jsonString(),
            "maxPlayers" to maxPlayers.jsonNumber(),
            "tickRate" to tickRate.jsonNumber(),
        )
        teamSize?.let { payload["teamSize"] = it.jsonNumber() }
        return call("rooms.create", payload).toRoom()
    }

    suspend fun joinRoom(roomId: String, inviteToken: String? = null): Room {
        val payload = mutableMapOf("roomId" to roomId.jsonString())
        inviteToken?.let { payload["inviteToken"] = it.jsonString() }
        return call("rooms.join", payload).toRoom()
    }

    suspend fun leaveRoom(roomId: String) = call("rooms.leave", mapOf("roomId" to roomId.jsonString()))

    suspend fun resolveInvite(token: String): InviteResolution =
        call("invites.resolve", mapOf("token" to token.jsonString())).toInvite()

    suspend fun resolveDeepLink(url: String): InviteResolution =
        call("invites.resolve_deep_link", mapOf("url" to url.jsonString())).toInvite()

    suspend fun startMatchmaking(
        roomKey: String,
        properties: JsonValue = JsonValue.ObjectValue(emptyMap()),
    ): MatchTicket {
        val fields = call(
            "matchmaking.start",
            mapOf("roomKey" to roomKey.jsonString(), "properties" to properties),
        ).objectMap()
        return MatchTicket(fields.string("ticketId"), fields.string("status"), fields.optionalString("roomId"))
    }

    suspend fun cancelMatchmaking(ticketId: String) =
        call("matchmaking.cancel", mapOf("ticketId" to ticketId.jsonString()))

    suspend fun reconnect(roomId: String, lastSequence: Long) {
        connect()
        call(
            "rooms.reconnect",
            mapOf("roomId" to roomId.jsonString(), "lastSequence" to lastSequence.jsonNumber()),
        )
        callbacks.onReconnected()
    }

    suspend fun sendAction(
        roomId: String,
        sequence: Long,
        payload: JsonValue,
        actionId: String? = null,
    ) = sendEnvelope(
        roomId,
        sequence,
        "action",
        buildMap {
            put("payload", payload)
            if (actionId != null) put("actionId", actionId.jsonString())
        },
    )

    suspend fun sendEvent(roomId: String, sequence: Long, payload: JsonValue, reliable: Boolean = true) =
        sendEnvelope(
            roomId,
            sequence,
            "event",
            mapOf("payload" to payload, "reliable" to JsonValue.Bool(reliable)),
        )

    suspend fun publishHostState(
        roomId: String,
        sequence: Long,
        expectedVersion: Long,
        state: JsonValue,
        expectedStateVersion: Long? = null,
        actionId: String? = null,
        senderId: String? = null,
    ) = sendEnvelope(
        roomId,
        sequence,
        "host_state",
        buildMap {
            put("expectedVersion", expectedVersion.jsonNumber())
            put("state", state)
            if (expectedStateVersion != null) put("expectedStateVersion", expectedStateVersion.jsonNumber())
            if (actionId != null) put("actionId", actionId.jsonString())
            if (senderId != null) put("senderId", senderId.jsonString())
        },
    )

    suspend fun sendActionReject(
        roomId: String,
        sequence: Long,
        actionId: String,
        outcome: String,
        message: String,
        senderId: String? = null,
    ) = sendEnvelope(
        roomId,
        sequence,
        "action_reject",
        buildMap {
            put("actionId", actionId.jsonString())
            put("outcome", outcome.jsonString())
            put("message", message.jsonString())
            if (senderId != null) put("senderId", senderId.jsonString())
        },
    )

    suspend fun requestSnapshot(roomId: String, sequence: Long) =
        sendEnvelope(roomId, sequence, "snapshot_request")

    suspend fun sendChat(roomId: String, sequence: Long, channel: String, text: String) =
        sendEnvelope(
            roomId,
            sequence,
            "chat",
            mapOf("channel" to channel.jsonString(), "text" to text.jsonString()),
        )

    suspend fun submitScore(
        roomId: String,
        sequence: Long,
        leaderboardId: String,
        score: Long,
        subscore: Long = 0,
    ) = sendEnvelope(
        roomId,
        sequence,
        "score_submit",
        mapOf(
            "leaderboardId" to leaderboardId.jsonString(),
            "score" to score.jsonNumber(),
            "subscore" to subscore.jsonNumber(),
        ),
    )

    suspend fun getPrivateLeaderboard(
        roomId: String,
        leaderboardId: String,
        limit: Long = 100,
    ): List<LeaderboardRecord> {
        val result = call(
            "leaderboards.private",
            mapOf(
                "roomId" to roomId.jsonString(),
                "leaderboardId" to leaderboardId.jsonString(),
                "limit" to limit.jsonNumber(),
            ),
        ) as? JsonValue.ArrayValue ?: error("Expected leaderboard record array")
        return result.value.map {
            val fields = it.objectMap()
            LeaderboardRecord(
                fields.string("playerId"),
                fields.long("score"),
                fields.long("subscore"),
                fields.long("rank"),
            )
        }
    }

    fun receive(value: JsonValue.ObjectValue) {
        try {
            val envelope = ServerEnvelope.fromJson(value)
            if (envelope.protocolVersion != LOKI_PROTOCOL_VERSION) {
                callbacks.onDisconnected(IllegalArgumentException("Unsupported protocol ${envelope.protocolVersion}"))
                return
            }
            callbacks.onEnvelope(envelope)
            synchronized(lock) { messageListeners.values.toList() }.forEach { listener ->
                runCatching { listener(envelope) }
            }
            when (envelope.type) {
                "action" -> callbacks.onAction(envelope)
                "event" -> callbacks.onEvent(envelope)
                "snapshot", "state" -> callbacks.onHostState(envelope)
                "presence" -> callbacks.onPresence(envelope)
                "chat" -> callbacks.onChat(envelope)
                "leaderboard" -> callbacks.onLeaderboard(envelope)
                "host_changed" -> callbacks.onHostMigrated(
                    envelope.fields.optionalString("previousHostId"),
                    envelope.fields.string("hostId"),
                    envelope.fields.long("stateVersion"),
                )
            }
        } catch (error: Throwable) {
            callbacks.onDisconnected(error)
        }
    }

    fun onMessage(listener: (ServerEnvelope) -> Unit): Int = synchronized(lock) {
        val id = nextListenerId++
        messageListeners[id] = listener
        id
    }

    fun removeMessageListener(id: Int) { synchronized(lock) { messageListeners.remove(id) } }

    fun onConnection(listener: (String) -> Unit): Int = synchronized(lock) {
        val id = nextListenerId++
        connectionListeners[id] = listener
        id
    }

    fun removeConnectionListener(id: Int) { synchronized(lock) { connectionListeners.remove(id) } }

    fun notifyConnection(event: String) {
        synchronized(lock) { connectionListeners.values.toList() }.forEach { listener ->
            runCatching { listener(event) }
        }
    }

    fun notifyLifecycle(visible: Boolean, online: Boolean) {
        val background = !visible || !online
        lifecycleVisible = visible
        lifecycleOnline = online
        if (background) {
            notifyConnection("suspended")
            return
        }
        notifyConnection("resumed")
        if (currentRoomId != null) {
            suspend { reconnectWithBackoff() }.startCoroutine(
                object : Continuation<Unit> {
                    override val context = EmptyCoroutineContext
                    override fun resumeWith(value: Result<Unit>) {}
                },
            )
        }
    }

    private suspend fun reconnectWithBackoff() {
        var attempt = 0
        while (currentRoomId != null && isForeground && !leaveFailed) {
            try {
                reconnectCurrentRoom()
                return
            } catch (_: Throwable) {
                val shift = minOf(attempt, 5)
                val delay = minOf(15_000L, 500L * (1L shl shift))
                attempt += 1
                Thread.sleep(delay)
            }
        }
    }

    suspend fun createSessionRoom(): JoinedRoom = enterRoom("rooms.create", emptyMap())

    suspend fun joinSessionRoom(inviteCode: String): JoinedRoom =
        enterRoom("rooms.join", mapOf("inviteCode" to inviteCode.jsonString()))

    suspend fun leaveCurrentRoom(explicitRoomId: String? = null) {
        lifecycleGeneration += 1
        val target = explicitRoomId ?: currentRoomId ?: return
        try {
            call("rooms.leave", mapOf("roomId" to target.jsonString()))
            if (currentRoomId == target) {
                currentRoomId = null
                currentInviteCode = ""
                sendSequence = 0
                leaveFailed = false
            }
        } catch (error: Throwable) {
            if (currentRoomId == target || currentRoomId == null) {
                currentRoomId = target
                leaveFailed = true
            }
            throw error
        }
    }

    suspend fun reconnectCurrentRoom() {
        if (reconnecting) return
        reconnecting = true
        try {
            if (leaveFailed) error("resolve the failed leave before reconnecting")
            val roomId = currentRoomId ?: error("join a room before reconnecting")
            call("rooms.reconnect", mapOf("roomId" to roomId.jsonString()))
            requestSessionSnapshot()
        } finally {
            reconnecting = false
        }
    }

    suspend fun sendSessionAction(payload: JsonValue, actionId: String? = null) {
        val roomId = currentRoomId ?: error("join a room before sending actions")
        sendAction(roomId, ++sendSequence, payload, actionId)
    }

    suspend fun publishSessionHostState(
        expectedVersion: Long,
        state: JsonValue,
        expectedStateVersion: Long? = null,
        actionId: String? = null,
        senderId: String? = null,
    ) {
        val roomId = currentRoomId ?: error("join a room before sending state")
        publishHostState(roomId, ++sendSequence, expectedVersion, state, expectedStateVersion, actionId, senderId)
    }

    suspend fun sendSessionActionReject(
        actionId: String,
        outcome: String,
        message: String,
        senderId: String? = null,
    ) {
        val roomId = currentRoomId ?: error("join a room before rejecting actions")
        sendActionReject(roomId, ++sendSequence, actionId, outcome, message, senderId)
    }

    suspend fun requestSessionSnapshot() {
        val roomId = currentRoomId ?: error("join a room before sending messages")
        requestSnapshot(roomId, ++sendSequence)
    }

    fun createSynchronizedRoom(
        initialState: JsonValue,
        commitTimeoutMs: Long = SYNCHRONIZED_ROOM_COMMIT_TIMEOUT_MS,
        recoveryDeadlineMs: Long = SYNCHRONIZED_ROOM_RECOVERY_DEADLINE_MS,
        reduce: (JsonValue, JsonValue, ActionContext) -> JsonValue,
    ) = SynchronizedRoom(this, initialState, reduce, commitTimeoutMs, recoveryDeadlineMs)

    private suspend fun enterRoom(operation: String, payload: Map<String, JsonValue>): JoinedRoom {
        if (leaveFailed) error("resolve the failed leave before joining another room")
        val generation = ++lifecycleGeneration
        val fields = call(operation, payload).objectMap()
        val roomId = fields.string("roomId")
        val inviteCode = fields.optionalString("inviteCode") ?: ""
        val snapshot = ServerEnvelope.fromJson(
            fields["snapshot"] as? JsonValue.ObjectValue ?: error("invalid join snapshot"),
        )
        if (snapshot.roomId != roomId || snapshot.type != "snapshot") {
            runCatching { call("rooms.leave", mapOf("roomId" to roomId.jsonString())) }
            error("invalid join snapshot")
        }
        if (generation != lifecycleGeneration) {
            runCatching { call("rooms.leave", mapOf("roomId" to roomId.jsonString())) }
            error("stale room join abandoned")
        }
        currentRoomId = roomId
        currentInviteCode = inviteCode
        sendSequence = 0
        return JoinedRoom(roomId, inviteCode, snapshot)
    }

    private suspend fun sendEnvelope(
        roomId: String,
        sequence: Long,
        type: String,
        fields: Map<String, JsonValue> = emptyMap(),
    ): JsonValue {
        val envelope = fields.toMutableMap()
        envelope["protocolVersion"] = LOKI_PROTOCOL_VERSION.jsonNumber()
        envelope["roomId"] = roomId.jsonString()
        envelope["sequence"] = sequence.jsonNumber()
        envelope["type"] = type.jsonString()
        return call("rooms.send", mapOf("envelope" to JsonValue.ObjectValue(envelope)))
    }

    private suspend fun call(operation: String, payload: Map<String, JsonValue>): JsonValue =
        transport.request(LokiRequest(operation = operation, payload = JsonValue.ObjectValue(payload)))
}

private fun JsonValue.toRoom(): Room {
    val fields = objectMap()
    return Room(fields.string("roomId"), fields.optionalString("roomKey"), fields.optionalString("hostId"))
}

private fun JsonValue.toInvite(): InviteResolution {
    val fields = objectMap()
    return InviteResolution(fields.string("projectId"), fields.string("roomId"), fields.string("inviteToken"))
}

fun JsonValue.objectMap(): Map<String, JsonValue> =
    (this as? JsonValue.ObjectValue)?.value ?: error("Expected JSON object")

fun Map<String, JsonValue>.string(key: String): String =
    (get(key) as? JsonValue.StringValue)?.value ?: error("Expected string '$key'")

fun Map<String, JsonValue>.optionalString(key: String): String? =
    when (val value = get(key)) {
        null, JsonValue.Null -> null
        is JsonValue.StringValue -> value.value
        else -> error("Expected optional string '$key'")
    }

fun Map<String, JsonValue>.long(key: String): Long =
    (get(key) as? JsonValue.Number)?.value ?: error("Expected integer '$key'")

fun String.jsonString() = JsonValue.StringValue(this)
fun Long.jsonNumber() = JsonValue.Number(this)

object LokiJson {
    fun parse(source: String): JsonValue = Parser(source).parse()

    private class Parser(private val source: String) {
        private var index = 0

        fun parse(): JsonValue {
            val result = value()
            whitespace()
            require(index == source.length) { "Unexpected trailing JSON at $index" }
            return result
        }

        private fun value(): JsonValue {
            whitespace()
            require(index < source.length) { "Unexpected end of JSON" }
            return when (source[index]) {
                '{' -> objectValue()
                '[' -> arrayValue()
                '"' -> JsonValue.StringValue(string())
                't' -> literal("true", JsonValue.Bool(true))
                'f' -> literal("false", JsonValue.Bool(false))
                'n' -> literal("null", JsonValue.Null)
                else -> number()
            }
        }

        private fun objectValue(): JsonValue.ObjectValue {
            index++
            whitespace()
            val fields = linkedMapOf<String, JsonValue>()
            if (take('}')) return JsonValue.ObjectValue(fields)
            while (true) {
                whitespace()
                val key = string()
                whitespace()
                expect(':')
                fields[key] = value()
                whitespace()
                if (take('}')) return JsonValue.ObjectValue(fields)
                expect(',')
            }
        }

        private fun arrayValue(): JsonValue.ArrayValue {
            index++
            whitespace()
            val items = mutableListOf<JsonValue>()
            if (take(']')) return JsonValue.ArrayValue(items)
            while (true) {
                items += value()
                whitespace()
                if (take(']')) return JsonValue.ArrayValue(items)
                expect(',')
            }
        }

        private fun string(): String {
            expect('"')
            val output = StringBuilder()
            while (index < source.length) {
                val character = source[index++]
                when (character) {
                    '"' -> return output.toString()
                    '\\' -> {
                        require(index < source.length) { "Unterminated escape" }
                        when (val escaped = source[index++]) {
                            '"', '\\', '/' -> output.append(escaped)
                            'b' -> output.append('\b')
                            'f' -> output.append('\u000c')
                            'n' -> output.append('\n')
                            'r' -> output.append('\r')
                            't' -> output.append('\t')
                            'u' -> {
                                require(index + 4 <= source.length) { "Invalid unicode escape" }
                                output.append(source.substring(index, index + 4).toInt(16).toChar())
                                index += 4
                            }
                            else -> error("Invalid JSON escape")
                        }
                    }
                    else -> output.append(character)
                }
            }
            error("Unterminated string")
        }

        private fun number(): JsonValue.Number {
            val start = index
            if (source[index] == '-') index++
            while (index < source.length && source[index].isDigit()) index++
            require(index > start && !source.substring(start, index).contains('.')) {
                "Protocol numbers must be integers"
            }
            return JsonValue.Number(source.substring(start, index).toLong())
        }

        private fun <T : JsonValue> literal(text: String, result: T): T {
            require(source.startsWith(text, index)) { "Invalid JSON literal" }
            index += text.length
            return result
        }

        private fun whitespace() {
            while (index < source.length && source[index].isWhitespace()) index++
        }

        private fun expect(character: Char) {
            require(take(character)) { "Expected '$character' at $index" }
        }

        private fun take(character: Char): Boolean =
            if (index < source.length && source[index] == character) {
                index++
                true
            } else false
    }
}
