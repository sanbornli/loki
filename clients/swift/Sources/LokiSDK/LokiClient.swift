import Foundation

public let lokiProtocolVersion = 1

public enum JSONValue: Codable, Equatable, Sendable {
    case null
    case bool(Bool)
    case number(Int64)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    public init(from decoder: Decoder) throws {
        let value = try decoder.singleValueContainer()
        if value.decodeNil() { self = .null }
        else if let decoded = try? value.decode(Bool.self) { self = .bool(decoded) }
        else if let decoded = try? value.decode(Int64.self) { self = .number(decoded) }
        else if let decoded = try? value.decode(String.self) { self = .string(decoded) }
        else if let decoded = try? value.decode([JSONValue].self) { self = .array(decoded) }
        else if let decoded = try? value.decode([String: JSONValue].self) { self = .object(decoded) }
        else { throw DecodingError.dataCorruptedError(in: value, debugDescription: "Only protocol-v1 JSON values are supported") }
    }

    public func encode(to encoder: Encoder) throws {
        var value = encoder.singleValueContainer()
        switch self {
        case .null: try value.encodeNil()
        case let .bool(item): try value.encode(item)
        case let .number(item): try value.encode(item)
        case let .string(item): try value.encode(item)
        case let .array(item): try value.encode(item)
        case let .object(item): try value.encode(item)
        }
    }
}

public struct LokiRequest: Codable, Equatable, Sendable {
    public let protocolVersion: Int
    public let operation: String
    public let payload: JSONValue

    public init(operation: String, payload: JSONValue = .object([:])) {
        self.protocolVersion = lokiProtocolVersion
        self.operation = operation
        self.payload = payload
    }
}

public protocol LokiTransport: Sendable {
    func request(_ request: LokiRequest) async throws -> Data
    func connect(onMessage: @escaping @Sendable (Data) -> Void) async throws
    func disconnect() async
}

public struct AuthSession: Codable, Equatable, Sendable {
    public let playerId: String
    public let accessToken: String
    public let refreshToken: String?
    public let expiresAt: Int64
}

public struct Room: Codable, Equatable, Sendable {
    public let roomId: String
    public let roomKey: String?
    public let hostId: String?
}

public struct InviteResolution: Codable, Equatable, Sendable {
    public let projectId: String
    public let roomId: String
    public let inviteToken: String
}

public struct MatchTicket: Codable, Equatable, Sendable {
    public let ticketId: String
    public let status: String
    public let roomId: String?
}

public struct Presence: Codable, Equatable, Sendable {
    public let playerId: String
    public let sessionId: String
    public let joinedAt: Int64
    public let team: Int?
    public let host: Bool
}

public struct LeaderboardRecord: Codable, Equatable, Sendable {
    public let playerId: String
    public let score: Int64
    public let subscore: Int64
    public let rank: Int
}

public struct ServerEnvelope: Codable, Equatable, Sendable {
    public let protocolVersion: Int
    public let roomId: String
    public let sequence: Int64
    public let type: String
    public let payload: JSONValue?
    public let state: JSONValue?
    public let senderId: String?
    public let reliable: Bool?
    public let hostId: String?
    public let previousHostId: String?
    public let stateVersion: Int64?
    public let joins: [Presence]?
    public let leaves: [Presence]?
    public let members: [Presence]?
    public let channel: String?
    public let messageId: String?
    public let text: String?
    public let sentAt: Int64?
    public let leaderboardId: String?
    public let records: [LeaderboardRecord]?
    public let reason: String?
    public let code: String?
    public let message: String?
    public let retryAfterMs: Int64?
}

public struct LokiCallbacks: Sendable {
    public var onEnvelope: @Sendable (ServerEnvelope) -> Void = { _ in }
    public var onAction: @Sendable (ServerEnvelope) -> Void = { _ in }
    public var onEvent: @Sendable (ServerEnvelope) -> Void = { _ in }
    public var onHostState: @Sendable (ServerEnvelope) -> Void = { _ in }
    public var onPresence: @Sendable (ServerEnvelope) -> Void = { _ in }
    public var onChat: @Sendable (ServerEnvelope) -> Void = { _ in }
    public var onLeaderboard: @Sendable (ServerEnvelope) -> Void = { _ in }
    public var onDisconnected: @Sendable (Error?) -> Void = { _ in }
    public var onSessionRefreshed: @Sendable (AuthSession) -> Void = { _ in }
    public var onReconnected: @Sendable () -> Void = {}
    public var onHostMigrated: @Sendable (String?, String, Int64) -> Void = { _, _, _ in }
    public init() {}
}

public actor LokiClient {
    private let transport: LokiTransport
    private let decoder = JSONDecoder()
    private var callbacks = LokiCallbacks()
    private var session: AuthSession?

    public init(transport: LokiTransport) { self.transport = transport }

    public func setCallbacks(_ callbacks: LokiCallbacks) { self.callbacks = callbacks }

    public func connect() async throws {
        try await transport.connect { [weak self] data in
            Task { await self?.receive(data) }
        }
    }

    public func disconnect() async {
        await transport.disconnect()
        callbacks.onDisconnected(nil)
    }

    @discardableResult
    public func authenticate(token: String) async throws -> AuthSession {
        let result: AuthSession = try await call("auth.authenticate", ["token": .string(token)])
        session = result
        return result
    }

    @discardableResult
    public func refresh() async throws -> AuthSession {
        guard let refreshToken = session?.refreshToken else { throw LokiClientError.missingRefreshToken }
        let result: AuthSession = try await call("auth.refresh", ["refreshToken": .string(refreshToken)])
        session = result
        callbacks.onSessionRefreshed(result)
        return result
    }

    public func createRoom(roomKey: String, visibility: String, maxPlayers: Int, teamSize: Int? = nil, tickRate: Int = 10) async throws -> Room {
        var payload: [String: JSONValue] = [
            "roomKey": .string(roomKey), "visibility": .string(visibility),
            "maxPlayers": .number(Int64(maxPlayers)), "tickRate": .number(Int64(tickRate)),
        ]
        if let teamSize { payload["teamSize"] = .number(Int64(teamSize)) }
        return try await call("rooms.create", payload)
    }

    public func joinRoom(roomId: String, inviteToken: String? = nil) async throws -> Room {
        var payload: [String: JSONValue] = ["roomId": .string(roomId)]
        if let inviteToken { payload["inviteToken"] = .string(inviteToken) }
        return try await call("rooms.join", payload)
    }

    public func leaveRoom(roomId: String) async throws { try await callVoid("rooms.leave", ["roomId": .string(roomId)]) }
    public func resolveInvite(_ token: String) async throws -> InviteResolution { try await call("invites.resolve", ["token": .string(token)]) }
    public func resolveDeepLink(_ url: String) async throws -> InviteResolution { try await call("invites.resolve_deep_link", ["url": .string(url)]) }
    public func startMatchmaking(roomKey: String, properties: JSONValue = .object([:])) async throws -> MatchTicket {
        try await call("matchmaking.start", ["roomKey": .string(roomKey), "properties": properties])
    }
    public func cancelMatchmaking(ticketId: String) async throws { try await callVoid("matchmaking.cancel", ["ticketId": .string(ticketId)]) }
    public func reconnect(roomId: String, lastSequence: Int64) async throws {
        try await connect()
        try await callVoid("rooms.reconnect", ["roomId": .string(roomId), "lastSequence": .number(lastSequence)])
        callbacks.onReconnected()
    }

    public func sendAction(roomId: String, sequence: Int64, payload: JSONValue) async throws {
        try await sendEnvelope(roomId, sequence, "action", ["payload": payload])
    }
    public func sendEvent(roomId: String, sequence: Int64, payload: JSONValue, reliable: Bool = true) async throws {
        try await sendEnvelope(roomId, sequence, "event", ["payload": payload, "reliable": .bool(reliable)])
    }
    public func publishHostState(roomId: String, sequence: Int64, expectedVersion: Int64, state: JSONValue) async throws {
        try await sendEnvelope(roomId, sequence, "host_state", ["expectedVersion": .number(expectedVersion), "state": state])
    }
    public func requestSnapshot(roomId: String, sequence: Int64) async throws { try await sendEnvelope(roomId, sequence, "snapshot_request") }
    public func sendChat(roomId: String, sequence: Int64, channel: String, text: String) async throws {
        try await sendEnvelope(roomId, sequence, "chat", ["channel": .string(channel), "text": .string(text)])
    }
    public func submitScore(roomId: String, sequence: Int64, leaderboardId: String, score: Int64, subscore: Int64 = 0) async throws {
        try await sendEnvelope(roomId, sequence, "score_submit", [
            "leaderboardId": .string(leaderboardId), "score": .number(score), "subscore": .number(subscore),
        ])
    }
    public func getPrivateLeaderboard(roomId: String, leaderboardId: String, limit: Int = 100) async throws -> [LeaderboardRecord] {
        try await call("leaderboards.private", [
            "roomId": .string(roomId), "leaderboardId": .string(leaderboardId), "limit": .number(Int64(limit)),
        ])
    }

    public func receive(_ data: Data) {
        do {
            let envelope = try decoder.decode(ServerEnvelope.self, from: data)
            guard envelope.protocolVersion == lokiProtocolVersion else {
                callbacks.onDisconnected(LokiClientError.unsupportedProtocol(envelope.protocolVersion))
                return
            }
            callbacks.onEnvelope(envelope)
            switch envelope.type {
            case "action": callbacks.onAction(envelope)
            case "event": callbacks.onEvent(envelope)
            case "snapshot", "state": callbacks.onHostState(envelope)
            case "presence": callbacks.onPresence(envelope)
            case "chat": callbacks.onChat(envelope)
            case "leaderboard": callbacks.onLeaderboard(envelope)
            case "host_changed":
                callbacks.onHostMigrated(envelope.previousHostId, envelope.hostId ?? "", envelope.stateVersion ?? 0)
            default: break
            }
        } catch {
            callbacks.onDisconnected(error)
        }
    }

    private func sendEnvelope(_ roomId: String, _ sequence: Int64, _ type: String, _ fields: [String: JSONValue] = [:]) async throws {
        var envelope = fields
        envelope["protocolVersion"] = .number(Int64(lokiProtocolVersion))
        envelope["roomId"] = .string(roomId)
        envelope["sequence"] = .number(sequence)
        envelope["type"] = .string(type)
        try await callVoid("rooms.send", ["envelope": .object(envelope)])
    }

    private func call<T: Decodable>(_ operation: String, _ payload: [String: JSONValue]) async throws -> T {
        let data = try await transport.request(LokiRequest(operation: operation, payload: .object(payload)))
        return try decoder.decode(T.self, from: data)
    }

    private func callVoid(_ operation: String, _ payload: [String: JSONValue]) async throws {
        _ = try await transport.request(LokiRequest(operation: operation, payload: .object(payload)))
    }
}

public enum LokiClientError: Error, Equatable {
    case missingRefreshToken
    case unsupportedProtocol(Int)
}
