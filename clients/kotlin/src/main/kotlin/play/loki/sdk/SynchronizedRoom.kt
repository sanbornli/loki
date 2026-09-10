package play.loki.sdk

import java.util.UUID
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock
import kotlin.coroutines.Continuation
import kotlin.coroutines.EmptyCoroutineContext
import kotlin.coroutines.startCoroutine
import kotlin.coroutines.suspendCoroutine

const val SYNCHRONIZED_ROOM_MAX_PENDING = 32

enum class ConnectionState {
    Idle, Joining, Connected, Reconnecting, Resynchronizing, Leaving, LeaveFailed, Closed, Failed
}

enum class SynchronizedRoomOutcome {
    Committed, Rejected, Duplicate, Invalid, RateLimited, StateConflict, AuthorityChanged, RoomClosed, Indeterminate
}

class SynchronizedRoomError(val outcome: SynchronizedRoomOutcome, message: String) : RuntimeException(message)

data class RoomMember(
    val playerId: String,
    val sessionId: String,
    val joinedAt: Long,
    val team: Long?,
    val host: Boolean,
)

data class ActionContext(
    val actionId: String,
    val senderId: String,
    val hostId: String,
    val members: List<RoomMember>,
)

data class SynchronizedRoomSnapshot(
    val roomId: String,
    val inviteCode: String,
    val playerId: String,
    val hostId: String,
    val members: List<RoomMember>,
    val membership: String,
    val membershipRevision: Long,
    val state: JsonValue,
    val stateVersion: Long,
    val connection: ConnectionState,
    val lastError: SynchronizedRoomError?,
)

class SynchronizedRoom(
    private val client: LokiClient,
    private val initialState: JsonValue,
    private val reduce: (JsonValue, JsonValue, ActionContext) -> JsonValue,
) {
    private val lock = ReentrantLock()
    private var state = initialState
    private var stateVersion = 0L
    private var connection = ConnectionState.Idle
    private var lastError: SynchronizedRoomError? = null
    private var playerId = ""
    private var roomId = ""
    private var inviteCode = ""
    private var hostId = ""
    private var members = listOf<RoomMember>()
    private var membersComplete = false
    private var membershipRevision = 0L
    private var generation = 0
    private var resyncing = false
    private val pending = mutableMapOf<String, Continuation<SynchronizedRoomSnapshot>>()
    private val pendingActions = mutableMapOf<String, Pair<JsonValue, String>>()
    private val recent = mutableSetOf<String>()
    private val prepared = mutableMapOf<String, JsonValue>()
    var reductions = 0
        private set
    private var messageListener: Int? = null
    private var connectionListener: Int? = null

    val isHost: Boolean get() = playerId.isNotEmpty() && playerId == hostId

    fun getSnapshot() = lock.withLock {
        SynchronizedRoomSnapshot(
            roomId,
            inviteCode,
            playerId,
            hostId,
            members,
            membershipStatus(),
            membershipRevision,
            state,
            stateVersion,
            connection,
            lastError,
        )
    }

    suspend fun create(): SynchronizedRoomSnapshot = enter(true) { client.createSessionRoom() }

    suspend fun join(inviteCode: String): SynchronizedRoomSnapshot =
        enter(false) { client.joinSessionRoom(inviteCode) }

    suspend fun dispatch(action: JsonValue): SynchronizedRoomSnapshot {
        val snapshot = getSnapshot()
        if (snapshot.connection != ConnectionState.Connected && snapshot.connection != ConnectionState.Resynchronizing) {
            throw SynchronizedRoomError(SynchronizedRoomOutcome.Rejected, "room is not connected")
        }
        if (pending.size >= SYNCHRONIZED_ROOM_MAX_PENDING) {
            throw SynchronizedRoomError(SynchronizedRoomOutcome.Rejected, "pending queue is full")
        }
        val actionId = UUID.randomUUID().toString()
        val sender = client.playerId ?: throw SynchronizedRoomError(SynchronizedRoomOutcome.Rejected, "authenticate before dispatching")
        playerId = sender
        return suspendCoroutine { continuation ->
            lock.withLock {
                pending[actionId] = continuation
                pendingActions[actionId] = action to sender
            }
            launch {
                try {
                    submit(actionId, action, sender)
                } catch (error: Throwable) {
                    failPending(
                        actionId,
                        SynchronizedRoomError(SynchronizedRoomOutcome.Indeterminate, error.message ?: "submit failed"),
                    )
                }
            }
        }
    }

    suspend fun leave() {
        generation += 1
        lock.withLock { connection = ConnectionState.Leaving }
        failAll(SynchronizedRoomOutcome.RoomClosed, "room left")
        val current = roomId
        try {
            client.leaveCurrentRoom(current.ifEmpty { null })
            clearIdentity()
            unbind()
            lock.withLock { connection = ConnectionState.Closed }
        } catch (error: Throwable) {
            lock.withLock { connection = ConnectionState.LeaveFailed }
            throw error
        }
    }

    suspend fun close() {
        generation += 1
        failAll(SynchronizedRoomOutcome.RoomClosed, "room closed")
        val current = roomId
        clearIdentity()
        unbind()
        lock.withLock { connection = ConnectionState.Closed }
        runCatching { client.leaveCurrentRoom(current.ifEmpty { null }) }
    }

    suspend fun reconnect() {
        if (isTerminal) {
            throw SynchronizedRoomError(SynchronizedRoomOutcome.Rejected, "cannot reconnect from a terminal state")
        }
        lock.withLock {
            connection = ConnectionState.Reconnecting
            resyncing = true
        }
        try {
            client.reconnectCurrentRoom()
            if (resyncing) lock.withLock { connection = ConnectionState.Resynchronizing }
        } catch (error: Throwable) {
            failRoom(SynchronizedRoomOutcome.Indeterminate, error.message ?: "reconnect failed")
            throw error
        }
    }

    private val isTerminal: Boolean
        get() = connection == ConnectionState.Closed || connection == ConnectionState.Failed ||
            connection == ConnectionState.LeaveFailed || connection == ConnectionState.Idle

    private val isInactive: Boolean
        get() = connection == ConnectionState.Leaving || connection == ConnectionState.LeaveFailed ||
            connection == ConnectionState.Closed || connection == ConnectionState.Failed

    private suspend fun enter(bootstrap: Boolean, join: suspend () -> JoinedRoom): SynchronizedRoomSnapshot {
        if (connection == ConnectionState.LeaveFailed) {
            throw SynchronizedRoomError(SynchronizedRoomOutcome.Rejected, "resolve the failed leave before joining")
        }
        val current = ++generation
        lock.withLock { connection = ConnectionState.Joining }
        bind()
        playerId = client.playerId ?: throw SynchronizedRoomError(SynchronizedRoomOutcome.Rejected, "authenticate first")
        var joinedId = ""
        try {
            val joined = join()
            joinedId = joined.roomId
            if (current != generation) {
                runCatching { client.leaveCurrentRoom(joined.roomId) }
                throw SynchronizedRoomError(SynchronizedRoomOutcome.Rejected, "join superseded")
            }
            requireCapabilities(joined.snapshot)
            roomId = joined.roomId
            inviteCode = joined.inviteCode
            apply(joined.snapshot, replace = true, preserveLocal = bootstrap)
            if (bootstrap && isHost) {
                client.publishSessionHostState(0, initialState, 0, UUID.randomUUID().toString(), playerId)
            }
            if (current != generation) {
                runCatching { client.leaveCurrentRoom(joined.roomId) }
                throw SynchronizedRoomError(SynchronizedRoomOutcome.Rejected, "join superseded")
            }
            lock.withLock { connection = ConnectionState.Connected }
            return getSnapshot()
        } catch (error: Throwable) {
            if (joinedId.isNotEmpty()) runCatching { client.leaveCurrentRoom(joinedId) }
            if (current == generation) {
                clearIdentity()
                unbind()
                lock.withLock {
                    connection = ConnectionState.Failed
                    lastError = error as? SynchronizedRoomError
                        ?: SynchronizedRoomError(SynchronizedRoomOutcome.Rejected, error.message ?: "failed")
                }
            }
            throw error
        }
    }

    private fun bind() {
        if (messageListener != null) return
        messageListener = client.onMessage { onMessage(it) }
        connectionListener = client.onConnection { onConnection(it) }
    }

    private fun unbind() {
        messageListener?.let { client.removeMessageListener(it) }
        connectionListener?.let { client.removeConnectionListener(it) }
        messageListener = null
        connectionListener = null
    }

    private fun onConnection(event: String) {
        if (isInactive) return
        if (event == "reconnect_failed") {
            lock.withLock {
                resyncing = true
                connection = ConnectionState.Reconnecting
            }
            return
        }
        if (event == "disconnected") {
            lock.withLock {
                resyncing = true
                connection = ConnectionState.Reconnecting
            }
        }
    }

    private suspend fun submit(actionId: String, action: JsonValue, senderId: String) {
        if (isHost) commit(actionId, action, senderId) else client.sendSessionAction(action, actionId)
    }

    private suspend fun commit(actionId: String, action: JsonValue, senderId: String) {
        val identity = "$senderId\u001f$actionId"
        val next = prepared[identity] ?: run {
            val started = System.nanoTime()
            val reduced = reduce(state, action, ActionContext(actionId, senderId, hostId, members))
            val elapsedMs = (System.nanoTime() - started) / 1_000_000
            if (elapsedMs > 50) {
                throw SynchronizedRoomError(SynchronizedRoomOutcome.Rejected, "reducer exceeded execution budget")
            }
            reductions += 1
            prepared[identity] = reduced
            reduced
        }
        client.publishSessionHostState(stateVersion, next, stateVersion, actionId, senderId)
    }

    private fun onMessage(message: ServerEnvelope) {
        if (isInactive && message.type != "room_closed") return
        if (roomId.isNotEmpty() && message.roomId != roomId) return
        when (message.type) {
            "snapshot", "state" -> apply(message, message.type == "snapshot", false)
            "action" -> {
                val actionId = message.fields.optionalString("actionId") ?: return
                if (!isHost) return
                val action = pendingActions[actionId]?.first ?: message.fields["payload"] ?: JsonValue.Null
                val sender = message.fields.optionalString("senderId") ?: ""
                launch {
                    runCatching { commit(actionId, action, sender) }
                }
            }
            "presence" -> {
                message.fields.optionalString("hostId")?.let { hostId = it }
                applyMembership(message)
            }
            "host_changed" -> {
                resyncing = true
                connection = ConnectionState.Resynchronizing
                hostId = message.fields.optionalString("hostId") ?: hostId
                launch { runCatching { client.requestSessionSnapshot() } }
            }
            "room_closed" -> {
                generation += 1
                failAll(SynchronizedRoomOutcome.RoomClosed, "room closed")
                clearIdentity()
                unbind()
                lock.withLock { connection = ConnectionState.Closed }
            }
            "error" -> onError(message)
        }
    }

    private fun onError(message: ServerEnvelope) {
        val text = message.fields.optionalString("message") ?: "error"
        val actionId = message.fields.optionalString("actionId")
        if (text.contains("duplicate action") && actionId != null) {
            val identity = "${message.fields.optionalString("senderId") ?: playerId}\u001f$actionId"
            if (identity in recent) succeed(actionId)
            return
        }
        if (actionId != null && pending.containsKey(actionId)) {
            val outcome = when {
                message.fields.optionalString("code") == "RATE_LIMITED" -> SynchronizedRoomOutcome.RateLimited
                message.fields.optionalString("code") == "STALE_VERSION" -> SynchronizedRoomOutcome.StateConflict
                message.fields.optionalString("actionOutcome") == "invalid" -> SynchronizedRoomOutcome.Invalid
                else -> SynchronizedRoomOutcome.Rejected
            }
            failPending(actionId, SynchronizedRoomError(outcome, text))
        }
    }

    private fun apply(message: ServerEnvelope, replace: Boolean, preserveLocal: Boolean) {
        if (replace) {
            try {
                requireCapabilities(message)
            } catch (error: SynchronizedRoomError) {
                failRoom(SynchronizedRoomOutcome.Invalid, error.message ?: "incompatible runtime")
                return
            }
        }
        message.fields.optionalString("hostId")?.let { hostId = it }
        if (replace) applyMembership(message)
        val incoming = message.fields.optionalLong("stateVersion")
        val stale = incoming != null && incoming < stateVersion
        val stateValue = message.fields["state"]
        val empty = stateValue is JsonValue.ObjectValue && stateValue.value.isEmpty()
        val skip = preserveLocal && empty && (incoming == null || incoming == 0L)
        if (!stale && incoming != null) stateVersion = incoming
        if (stateValue != null && !skip && !stale) state = stateValue
        val actionId = message.fields.optionalString("actionId")
        if (actionId != null) {
            val identity = "${message.fields.optionalString("senderId") ?: playerId}\u001f$actionId"
            recent += identity
            prepared.remove(identity)
            if (!stale) succeed(actionId)
        }
        if (resyncing && !stale && (replace || incoming != null)) {
            resyncing = false
            connection = ConnectionState.Connected
        } else if (connection != ConnectionState.Joining && !resyncing &&
            connection != ConnectionState.Closed && connection != ConnectionState.Failed &&
            connection != ConnectionState.Leaving && connection != ConnectionState.LeaveFailed &&
            connection != ConnectionState.Reconnecting
        ) {
            connection = ConnectionState.Connected
        }
    }

    private fun requireCapabilities(message: ServerEnvelope) {
        if (message.type != "snapshot") return
        val caps = message.fields["capabilities"] as? JsonValue.ObjectValue
        if (caps?.value?.get("synchronized_rooms") != JsonValue.Bool(true)) {
            throw SynchronizedRoomError(SynchronizedRoomOutcome.Invalid, "runtime does not advertise synchronized_rooms")
        }
    }

    private fun succeed(actionId: String) {
        pendingActions.remove(actionId)
        pending.remove(actionId)?.resumeWith(Result.success(getSnapshot()))
    }

    private fun failPending(actionId: String, error: SynchronizedRoomError) {
        lastError = error
        pendingActions.remove(actionId)
        pending.remove(actionId)?.resumeWith(Result.failure(error))
    }

    private fun failAll(outcome: SynchronizedRoomOutcome, message: String) {
        val error = SynchronizedRoomError(outcome, message)
        lastError = error
        pending.keys.toList().forEach { failPending(it, error) }
    }

    private fun failRoom(outcome: SynchronizedRoomOutcome, message: String) {
        resyncing = false
        failAll(outcome, message)
        unbind()
        lock.withLock { connection = ConnectionState.Failed }
    }

    private fun clearIdentity() {
        roomId = ""
        inviteCode = ""
        hostId = ""
        members = emptyList()
        membersComplete = false
        membershipRevision = 0L
    }

    private fun membershipStatus(): String {
        val haveSelf = playerId.isNotEmpty() && members.any { it.playerId == playerId }
        return if (membersComplete && haveSelf) "ready" else "synchronizing"
    }

    private fun snapshotMembersAreComplete(message: ServerEnvelope): Boolean {
        val complete = message.fields.optionalBool("membersComplete")
        if (complete == true) return true
        if (complete == false) return false
        val list = (message.fields["members"] as? JsonValue.ArrayValue)?.value
        return !list.isNullOrEmpty()
    }

    private fun applyMembership(message: ServerEnvelope) {
        val revision = message.fields.optionalLong("membershipRevision")
        if (revision != null && revision >= membershipRevision) {
            membershipRevision = revision
        }
        if (snapshotMembersAreComplete(message)) {
            val list = (message.fields["members"] as? JsonValue.ArrayValue)?.value.orEmpty()
            members = list.map { it.toMember(hostId) }
            membersComplete = true
            return
        }
        val leaves = (message.fields["leaves"] as? JsonValue.ArrayValue)?.value.orEmpty()
        if (leaves.isNotEmpty()) {
            val left = leaves.map { it.objectMap().string("playerId") }.toSet()
            members = members.filter { it.playerId !in left }
        }
        val joins = (message.fields["joins"] as? JsonValue.ArrayValue)?.value.orEmpty()
        if (joins.isNotEmpty()) {
            val incoming = joins.map { it.toMember(hostId) }
            val ids = incoming.map { it.playerId }.toSet()
            members = members.filter { it.playerId !in ids } + incoming
        }
    }

    private fun launch(block: suspend () -> Unit) {
        block.startCoroutine(object : Continuation<Unit> {
            override val context = EmptyCoroutineContext
            override fun resumeWith(value: Result<Unit>) {}
        })
    }
}

private fun JsonValue.toMember(hostId: String): RoomMember {
    val fields = objectMap()
    val playerId = fields.string("playerId")
    return RoomMember(
        playerId,
        fields.optionalString("sessionId") ?: playerId,
        fields.optionalLong("joinedAt") ?: 0L,
        fields.optionalLong("team"),
        fields["host"] == JsonValue.Bool(true) || playerId == hostId,
    )
}

fun Map<String, JsonValue>.optionalLong(key: String): Long? =
    when (val value = get(key)) {
        null, JsonValue.Null -> null
        is JsonValue.Number -> value.value
        else -> error("Expected optional integer '$key'")
    }

fun Map<String, JsonValue>.optionalBool(key: String): Boolean? =
    when (val value = get(key)) {
        null, JsonValue.Null -> null
        is JsonValue.Bool -> value.value
        else -> error("Expected optional boolean '$key'")
    }
