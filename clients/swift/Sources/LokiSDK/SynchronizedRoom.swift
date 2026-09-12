import Foundation

public let synchronizedRoomMaxPending = 32
public let synchronizedRoomCommitTimeoutMs: UInt64 = 10_000
public let synchronizedRoomRecoveryDeadlineMs: UInt64 = 60_000
public let synchronizedRoomMinCommitTimeoutMs: UInt64 = 5_000
public let synchronizedRoomMaxCommitTimeoutMs: UInt64 = 60_000
public let synchronizedRoomMinRecoveryDeadlineMs: UInt64 = 30_000
public let synchronizedRoomMaxRecoveryDeadlineMs: UInt64 = 120_000

private func clampTimeout(_ value: UInt64?, fallback: UInt64, minimum: UInt64, maximum: UInt64) -> UInt64 {
    guard let value else { return fallback }
    return min(maximum, max(minimum, value))
}

public enum ConnectionState: String, Sendable {
    case idle, joining, connected, suspended, reconnecting, resynchronizing, leaving, leaveFailed = "leave_failed", closed, failed
}

public enum SynchronizedRoomOutcome: String, Sendable {
    case committed, rejected, duplicate, invalid, rateLimited = "rate_limited"
    case stateConflict = "state_conflict", authorityChanged = "authority_changed"
    case roomClosed = "room_closed", indeterminate
}

public struct SynchronizedRoomError: Error, Sendable {
    public let outcome: SynchronizedRoomOutcome
    public let message: String
    public init(_ outcome: SynchronizedRoomOutcome, _ message: String) {
        self.outcome = outcome
        self.message = message
    }
}

public struct RoomMember: Sendable, Equatable {
    public let playerId: String
    public let sessionId: String
    public let joinedAt: Int64
    public let team: Int?
    public let host: Bool
}

public struct ActionContext: Sendable {
    public let actionId: String
    public let senderId: String
    public let hostId: String
    public let members: [RoomMember]
}

public struct SynchronizedRoomSnapshot: Sendable {
    public let roomId: String
    public let inviteCode: String
    public let playerId: String
    public let hostId: String
    public let members: [RoomMember]
    public let membership: String
    public let membershipRevision: Int64
    public let state: JSONValue
    public let stateVersion: Int64
    public let connection: ConnectionState
    public let lastError: SynchronizedRoomError?
}

public actor SynchronizedRoom {
    private let client: LokiClient
    private let reduce: @Sendable (JSONValue, JSONValue, ActionContext) throws -> JSONValue
    private let initialState: JSONValue
    private var state: JSONValue
    private var previousState: JSONValue
    private var stateVersion: Int64 = 0
    private var connection: ConnectionState = .idle
    private var lastError: SynchronizedRoomError?
    private var playerId = ""
    private var roomId = ""
    private var inviteCode = ""
    private var hostId = ""
    private var members: [RoomMember] = []
    private var membersComplete = false
    private var membershipRevision: Int64 = 0
    private var generation = 0
    private var resyncing = false
    private var pending: [String: CheckedContinuation<SynchronizedRoomSnapshot, Error>] = [:]
    private var pendingActions: [String: (action: JSONValue, senderId: String)] = [:]
    private var recent: [String: Date] = [:]
    private var prepared: [String: JSONValue] = [:]
    private var reducerCount = 0
    private var messageListener: Int?
    private var connectionListener: Int?
    private var watchdogs: [String: Task<Void, Never>] = [:]
    private var watchdogState: [String: (phase: String, confirmRemainingMs: UInt64, recoveryRemainingMs: UInt64, startedAt: Date?)] = [:]
    private var timersPaused = false
    private var recoveringFromTimeout = false
    private var hostQueue: [(actionId: String, action: JSONValue, senderId: String)] = []
    private var draining = false
    private let commitTimeoutMs: UInt64
    private let recoveryDeadlineMs: UInt64

    public init(
        host: LokiClient,
        initialState: JSONValue,
        commitTimeoutMs: UInt64? = nil,
        recoveryDeadlineMs: UInt64? = nil,
        reduce: @escaping @Sendable (JSONValue, JSONValue, ActionContext) throws -> JSONValue
    ) {
        self.client = host
        self.initialState = initialState
        self.state = initialState
        self.previousState = initialState
        self.reduce = reduce
        let commit = clampTimeout(
            commitTimeoutMs,
            fallback: synchronizedRoomCommitTimeoutMs,
            minimum: synchronizedRoomMinCommitTimeoutMs,
            maximum: synchronizedRoomMaxCommitTimeoutMs
        )
        self.commitTimeoutMs = commit
        self.recoveryDeadlineMs = max(
            commit,
            clampTimeout(
                recoveryDeadlineMs,
                fallback: synchronizedRoomRecoveryDeadlineMs,
                minimum: synchronizedRoomMinRecoveryDeadlineMs,
                maximum: synchronizedRoomMaxRecoveryDeadlineMs
            )
        )
    }

    public var isHost: Bool { !playerId.isEmpty && playerId == hostId }
    public var reductions: Int { reducerCount }

    public func getSnapshot() -> SynchronizedRoomSnapshot {
        SynchronizedRoomSnapshot(
            roomId: roomId,
            inviteCode: inviteCode,
            playerId: playerId,
            hostId: hostId,
            members: members,
            membership: membershipStatus(),
            membershipRevision: membershipRevision,
            state: state,
            stateVersion: stateVersion,
            connection: connection,
            lastError: lastError
        )
    }

    public func create() async throws -> SynchronizedRoomSnapshot {
        try await enter(bootstrap: true) { try await self.client.createSessionRoom() }
    }

    public func join(inviteCode: String) async throws -> SynchronizedRoomSnapshot {
        try await enter(bootstrap: false) { try await self.client.joinSessionRoom(inviteCode: inviteCode) }
    }

    public func dispatch(_ action: JSONValue) async throws -> SynchronizedRoomSnapshot {
        guard connection == .connected || connection == .resynchronizing else {
            throw SynchronizedRoomError(.rejected, "room is not connected")
        }
        if pending.count >= synchronizedRoomMaxPending {
            throw SynchronizedRoomError(.rejected, "pending queue is full")
        }
        let actionId = UUID().uuidString
        let sender = try await requirePlayerId()
        return try await withCheckedThrowingContinuation { continuation in
            pending[actionId] = continuation
            pendingActions[actionId] = (action, sender)
            armWatchdog(actionId: actionId)
            Task { await self.submit(actionId: actionId, action: action, senderId: sender) }
        }
    }

    public func leave() async throws {
        generation += 1
        connection = .leaving
        failAll(.roomClosed, "room left")
        let current = roomId
        do {
            try await client.leaveCurrentRoom(current.isEmpty ? nil : current)
            clearIdentity()
            unbind()
            connection = .closed
        } catch {
            connection = .leaveFailed
            throw error
        }
    }

    public func close() async {
        generation += 1
        failAll(.roomClosed, "room closed")
        let current = roomId
        clearIdentity()
        unbind()
        connection = .closed
        try? await client.leaveCurrentRoom(current.isEmpty ? nil : current)
    }

    public func reconnect() async throws {
        if isTerminal {
            throw SynchronizedRoomError(.rejected, "cannot reconnect from a terminal state")
        }
        connection = .reconnecting
        resyncing = true
        do {
            try await client.reconnectCurrentRoom()
            if resyncing { connection = .resynchronizing }
        } catch {
            connection = .reconnecting
            throw error
        }
    }

    private var isTerminal: Bool {
        connection == .closed || connection == .failed || connection == .leaveFailed || connection == .idle
    }

    private var isInactive: Bool {
        connection == .leaving || connection == .leaveFailed || connection == .closed || connection == .failed
    }

    private func requirePlayerId() async throws -> String {
        if !playerId.isEmpty { return playerId }
        if let existing = await client.playerId {
            playerId = existing
            return existing
        }
        throw SynchronizedRoomError(.rejected, "authenticate before dispatching")
    }

    private func enter(bootstrap: Bool, join: () async throws -> JoinedRoom) async throws -> SynchronizedRoomSnapshot {
        if connection == .leaveFailed {
            throw SynchronizedRoomError(.rejected, "resolve the failed leave before joining")
        }
        let current = generation + 1
        generation = current
        connection = .joining
        await bind()
        playerId = try await requirePlayerId()
        var joinedId = ""
        do {
            let joined = try await join()
            joinedId = joined.roomId
            if current != generation {
                try? await client.leaveCurrentRoom(joined.roomId)
                throw SynchronizedRoomError(.rejected, "join superseded")
            }
            try requireCapabilities(joined.snapshot)
            roomId = joined.roomId
            inviteCode = joined.inviteCode
            apply(joined.snapshot, replace: true, preserveLocal: bootstrap)
            if bootstrap && isHost {
                try await bootstrapInitial()
            }
            if current != generation {
                try? await client.leaveCurrentRoom(joined.roomId)
                throw SynchronizedRoomError(.rejected, "join superseded")
            }
            if await !client.isForeground {
                timersPaused = true
                connection = .suspended
            } else {
                connection = .connected
            }
            return getSnapshot()
        } catch {
            if !joinedId.isEmpty { try? await client.leaveCurrentRoom(joinedId) }
            if current == generation {
                clearIdentity()
                unbind()
                connection = .failed
                lastError = error as? SynchronizedRoomError ?? SynchronizedRoomError(.rejected, String(describing: error))
            }
            throw error
        }
    }

    private func bootstrapInitial() async throws {
        let actionId = UUID().uuidString
        try await client.publishSessionHostState(
            expectedVersion: 0,
            state: initialState,
            expectedStateVersion: 0,
            actionId: actionId,
            senderId: playerId
        )
    }

    private func bind() async {
        if messageListener != nil { return }
        messageListener = await client.onMessage { envelope in
            Task { await self.onMessage(envelope) }
        }
        connectionListener = await client.onConnection { event in
            Task { await self.onConnectionEvent(event) }
        }
    }

    private func unbind() {
        if let messageListener { Task { await client.removeMessageListener(messageListener) } }
        if let connectionListener { Task { await client.removeConnectionListener(connectionListener) } }
        messageListener = nil
        connectionListener = nil
    }

    private func onConnectionEvent(_ event: String) {
        if event == "suspended" {
            timersPaused = true
            cancelWatchdogs()
            connection = .suspended
            return
        }
        if event == "resumed" {
            timersPaused = false
            resyncing = true
            connection = .reconnecting
            for actionId in pending.keys { armWatchdog(actionId: actionId) }
            return
        }
        if event == "reconnect_failed" {
            if connection == .suspended { return }
            resyncing = true
            connection = .reconnecting
            return
        }
        if event == "disconnected" {
            if connection == .suspended { return }
            resyncing = true
            connection = .reconnecting
            return
        }
        if connection == .reconnecting || connection == .resynchronizing {
            connection = .resynchronizing
            Task { try? await client.requestSessionSnapshot() }
        }
    }

    private func submit(actionId: String, action: JSONValue, senderId: String) async {
        do {
            if isHost {
                enqueueHost(actionId: actionId, action: action, senderId: senderId)
            } else {
                try await client.sendSessionAction(payload: action, actionId: actionId)
            }
        } catch {
            if let roomError = error as? SynchronizedRoomError,
               roomError.outcome == .rejected || roomError.outcome == .invalid || roomError.outcome == .rateLimited {
                failPending(actionId, roomError)
                return
            }
            await recoverAfterTimeout()
        }
    }

    private func enqueueHost(actionId: String, action: JSONValue, senderId: String) {
        hostQueue.append((actionId, action, senderId))
        Task { await drainHost() }
    }

    private func drainHost() async {
        if draining { return }
        draining = true
        defer { draining = false }
        while !hostQueue.isEmpty && isHost && connection == .connected && !resyncing {
            let item = hostQueue.removeFirst()
            do {
                try await commit(actionId: item.actionId, action: item.action, senderId: item.senderId)
            } catch {
                if let roomError = error as? SynchronizedRoomError,
                   roomError.outcome == .rejected || roomError.outcome == .invalid || roomError.outcome == .rateLimited {
                    failPending(item.actionId, roomError)
                    continue
                }
                await recoverAfterTimeout()
                break
            }
        }
    }

    private func commit(actionId: String, action: JSONValue, senderId: String) async throws {
        let identity = "\(senderId)\u{1f}\(actionId)"
        let next: JSONValue
        if let prepared = prepared[identity] {
            next = prepared
        } else {
            let started = Date()
            let reduced = try reduce(state, action, ActionContext(
                actionId: actionId,
                senderId: senderId,
                hostId: hostId,
                members: members
            ))
            reducerCount += 1
            if Date().timeIntervalSince(started) > 0.05 {
                throw SynchronizedRoomError(.rejected, "reducer exceeded execution budget")
            }
            next = reduced
            prepared[identity] = next
        }
        try await client.publishSessionHostState(
            expectedVersion: stateVersion,
            state: next,
            expectedStateVersion: stateVersion,
            actionId: actionId,
            senderId: senderId
        )
    }

    private func onMessage(_ message: ServerEnvelope) {
        if isInactive && message.type != "room_closed" { return }
        if !roomId.isEmpty && message.roomId != roomId { return }
        switch message.type {
        case "snapshot", "state":
            apply(message, replace: message.type == "snapshot", preserveLocal: false)
        case "action":
            guard isHost, let actionId = message.actionId else { return }
            let action = pendingActions[actionId]?.action ?? message.payload ?? .null
            enqueueHost(actionId: actionId, action: action, senderId: message.senderId ?? "")
        case "presence":
            hostId = message.members?.first(where: { $0.host })?.playerId ?? hostId
            applyMembership(message, replaceIfComplete: true)
        case "host_changed":
            resyncing = true
            connection = .resynchronizing
            hostId = message.hostId ?? hostId
            Task { try? await client.requestSessionSnapshot() }
        case "room_closed":
            generation += 1
            failAll(.roomClosed, "room closed")
            clearIdentity()
            unbind()
            connection = .closed
        case "error":
            onError(message)
        default:
            break
        }
    }

    private func onError(_ message: ServerEnvelope) {
        let text = message.message ?? "error"
        if message.code == "STALE_VERSION" || message.code == "HOST_REQUIRED" {
            resyncing = true
            connection = .resynchronizing
            Task { await recoverAfterTimeout() }
            return
        }
        if text.contains("duplicate action"), let actionId = message.actionId {
            if recent["\(message.senderId ?? playerId)\u{1f}\(actionId)"] != nil {
                succeed(actionId, senderId: message.senderId)
            }
            return
        }
        if let actionId = message.actionId, pending[actionId] != nil {
            let outcome: SynchronizedRoomOutcome = message.code == "RATE_LIMITED" ? .rateLimited
                : message.code == "STALE_VERSION" ? .stateConflict
                : message.actionOutcome == "invalid" ? .invalid : .rejected
            failPending(actionId, SynchronizedRoomError(outcome, text))
        }
    }

    private func apply(_ message: ServerEnvelope, replace: Bool, preserveLocal: Bool) {
        if replace {
            do { try requireCapabilities(message) } catch {
                failRoom(.invalid, (error as? SynchronizedRoomError)?.message ?? "incompatible runtime")
                return
            }
        }
        if let host = message.hostId { hostId = host }
        if replace {
            applyMembership(message, replaceIfComplete: true)
        }
        let incoming = message.stateVersion
        let stale = incoming != nil && incoming! < stateVersion
        let emptyObject: Bool = {
            if case let .object(fields) = message.state { return fields.isEmpty } else { return false }
        }()
        let skip = preserveLocal && emptyObject && (incoming == nil || incoming == 0)
        if !stale, let incoming { stateVersion = incoming }
        if let next = message.state, !skip, !stale {
            previousState = state
            state = next
        }
        if let actionId = message.actionId {
            recent["\(message.senderId ?? playerId)\u{1f}\(actionId)"] = Date()
            prepared.removeValue(forKey: "\(message.senderId ?? playerId)\u{1f}\(actionId)")
            if !stale { succeed(actionId, senderId: message.senderId) }
        }
        if resyncing && !stale && (replace || incoming != nil) {
            resyncing = false
            if connection != .suspended && connection != .reconnecting {
                connection = .connected
                replayPending()
            }
        } else if connection == .joining || connection == .suspended {
            // join completion sets connected; stay suspended until resume
        } else if !resyncing && connection != .closed && connection != .failed && connection != .leaving && connection != .leaveFailed && connection != .reconnecting && connection != .suspended {
            connection = .connected
        }
    }

    private func requireCapabilities(_ message: ServerEnvelope) throws {
        guard message.type == "snapshot" else { return }
        guard case let .object(fields)? = message.capabilities,
              case .bool(true) = fields["synchronized_rooms"] else {
            throw SynchronizedRoomError(.invalid, "runtime does not advertise synchronized_rooms")
        }
    }
    private func succeed(_ actionId: String, senderId: String? = nil) {
        if let senderId, let pendingSender = pendingActions[actionId]?.senderId, pendingSender != senderId {
            return
        }
        watchdogs.removeValue(forKey: actionId)?.cancel()
        watchdogState.removeValue(forKey: actionId)
        pendingActions.removeValue(forKey: actionId)
        pending.removeValue(forKey: actionId)?.resume(returning: getSnapshot())
    }

    private func failPending(_ actionId: String, _ error: SynchronizedRoomError) {
        lastError = error
        watchdogs.removeValue(forKey: actionId)?.cancel()
        watchdogState.removeValue(forKey: actionId)
        pendingActions.removeValue(forKey: actionId)
        pending.removeValue(forKey: actionId)?.resume(throwing: error)
    }

    private func armWatchdog(actionId: String) {
        watchdogs.removeValue(forKey: actionId)?.cancel()
        if watchdogState[actionId] == nil {
            watchdogState[actionId] = (
                phase: "confirming",
                confirmRemainingMs: commitTimeoutMs,
                recoveryRemainingMs: recoveryDeadlineMs,
                startedAt: nil
            )
        }
        if timersPaused || connection == .suspended { return }
        guard var dog = watchdogState[actionId] else { return }
        let remaining = dog.phase == "confirming" ? dog.confirmRemainingMs : dog.recoveryRemainingMs
        if remaining == 0 {
            Task { await self.handleWatchdog(actionId: actionId) }
            return
        }
        dog.startedAt = Date()
        watchdogState[actionId] = dog
        watchdogs[actionId] = Task {
            try? await Task.sleep(nanoseconds: remaining * 1_000_000)
            guard !Task.isCancelled else { return }
            await self.handleWatchdog(actionId: actionId)
        }
    }

    private func handleWatchdog(actionId: String) async {
        guard pending[actionId] != nil else { return }
        if isInactive || connection == .suspended || timersPaused { return }
        guard var dog = watchdogState[actionId] else { return }
        if dog.phase == "confirming" {
            dog.phase = "recovering"
            dog.confirmRemainingMs = 0
            dog.startedAt = nil
            watchdogState[actionId] = dog
            armWatchdog(actionId: actionId)
            await recoverAfterTimeout()
            return
        }
        failPending(actionId, SynchronizedRoomError(.indeterminate, "authoritative confirmation timed out"))
    }

    private func recoverAfterTimeout() async {
        if isInactive || connection == .suspended || recoveringFromTimeout { return }
        recoveringFromTimeout = true
        resyncing = true
        connection = .resynchronizing
        defer { recoveringFromTimeout = false }
        try? await client.reconnectCurrentRoom()
    }

    private func cancelWatchdogs() {
        let now = Date()
        for actionId in watchdogState.keys {
            if var dog = watchdogState[actionId], let started = dog.startedAt {
                let elapsed = UInt64(max(0, now.timeIntervalSince(started) * 1000))
                if dog.phase == "confirming" {
                    dog.confirmRemainingMs = dog.confirmRemainingMs > elapsed ? dog.confirmRemainingMs - elapsed : 0
                } else {
                    dog.recoveryRemainingMs = dog.recoveryRemainingMs > elapsed ? dog.recoveryRemainingMs - elapsed : 0
                }
                dog.startedAt = nil
                watchdogState[actionId] = dog
            }
            watchdogs.removeValue(forKey: actionId)?.cancel()
        }
    }

    private func replayPending() {
        if isHost {
            for (actionId, item) in pendingActions {
                enqueueHost(actionId: actionId, action: item.action, senderId: item.senderId)
            }
            return
        }
        for (actionId, item) in pendingActions {
            Task { await self.submit(actionId: actionId, action: item.action, senderId: item.senderId) }
        }
    }

    private func failAll(_ outcome: SynchronizedRoomOutcome, _ message: String) {
        let error = SynchronizedRoomError(outcome, message)
        lastError = error
        for actionId in Array(pending.keys) { failPending(actionId, error) }
    }

    private func failRoom(_ outcome: SynchronizedRoomOutcome, _ message: String) {
        resyncing = false
        failAll(outcome, message)
        unbind()
        connection = .failed
    }

    private func clearIdentity() {
        roomId = ""
        inviteCode = ""
        hostId = ""
        members = []
        membersComplete = false
        membershipRevision = 0
    }

    private func membershipStatus() -> String {
        let haveSelf = !playerId.isEmpty && members.contains { $0.playerId == playerId }
        return membersComplete && haveSelf ? "ready" : "synchronizing"
    }

    private func snapshotMembersAreComplete(_ message: ServerEnvelope) -> Bool {
        if message.membersComplete == true { return true }
        if message.membersComplete == false { return false }
        return !(message.members ?? []).isEmpty
    }

    private func applyMembership(_ message: ServerEnvelope, replaceIfComplete: Bool) {
        if let revision = message.membershipRevision, revision >= membershipRevision {
            membershipRevision = revision
        }
        if replaceIfComplete && snapshotMembersAreComplete(message) {
            members = (message.members ?? []).map {
                RoomMember(
                    playerId: $0.playerId,
                    sessionId: $0.sessionId,
                    joinedAt: $0.joinedAt,
                    team: $0.team,
                    host: $0.host || $0.playerId == hostId
                )
            }
            membersComplete = true
            return
        }
        if let leaves = message.leaves {
            let left = Set(leaves.map(\.playerId))
            members.removeAll { left.contains($0.playerId) }
        }
        if let joins = message.joins {
            for join in joins {
                members.removeAll { $0.playerId == join.playerId }
                members.append(RoomMember(
                    playerId: join.playerId,
                    sessionId: join.sessionId,
                    joinedAt: join.joinedAt,
                    team: join.team,
                    host: join.host || join.playerId == hostId
                ))
            }
        }
    }
}
