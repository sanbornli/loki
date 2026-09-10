import Foundation
import XCTest
@testable import LokiSDK

private actor RecordingTransport: LokiTransport {
    private(set) var requests: [LokiRequest] = []
    private var listener: (@Sendable (Data) -> Void)?

    func request(_ request: LokiRequest) async throws -> Data {
        requests.append(request)
        switch request.operation {
        case "auth.authenticate":
            return Data(#"{"playerId":"p1","accessToken":"access","refreshToken":"refresh","expiresAt":100}"#.utf8)
        case "rooms.join":
            return Data(#"{"roomId":"room-1","roomKey":"duel","hostId":"p1"}"#.utf8)
        default: return Data("{}".utf8)
        }
    }

    func connect(onMessage: @escaping @Sendable (Data) -> Void) async throws { listener = onMessage }
    func disconnect() async { listener = nil }
    func emit(_ data: Data) { listener?(data) }
}

final class LokiSDKTests: XCTestCase {
    func testQuantizeRoundsAndRejectsNonFinite() throws {
        XCTAssertEqual(try LokiQuantize.quantize(3.35, scale: 100), 335)
        XCTAssertEqual(try LokiQuantize.dequantize(335, scale: 100), 3.35, accuracy: 0.0001)
        XCTAssertThrowsError(try LokiQuantize.quantize(.nan, scale: 100))
        XCTAssertThrowsError(try LokiQuantize.quantize(3.35, scale: 0))
    }

    func testFixtureDecodesAsRealJSON() throws {
        let url = try XCTUnwrap(Bundle.module.url(forResource: "conformance", withExtension: "json", subdirectory: "Fixtures"))
        let root = try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
        guard case let .object(document) = root,
              case let .object(canonical)? = document["canonicalState"] else {
            return XCTFail("fixture shape changed")
        }
        XCTAssertEqual(canonical["sha256"], .string("039c5612a00a3ea03835619893ad0b6ddadcf6e331a0b1be69e0ad89fb5e676c"))
    }

    func testRequestAndEnvelopeReplay() async throws {
        let transport = RecordingTransport()
        let client = LokiClient(transport: transport)
        let session = try await client.authenticate(token: "guest")
        XCTAssertEqual(session.playerId, "p1")
        _ = try await client.joinRoom(roomId: "room-1")

        let snapshot = expectation(description: "snapshot callback")
        let migration = expectation(description: "host migration callback")
        var callbacks = LokiCallbacks()
        callbacks.onHostState = { envelope in
            XCTAssertEqual(envelope.sequence, 0)
            snapshot.fulfill()
        }
        callbacks.onHostMigrated = { previous, host, version in
            XCTAssertEqual(previous, "00000000-0000-4000-8000-000000000002")
            XCTAssertEqual(host, "00000000-0000-4000-8000-000000000003")
            XCTAssertEqual(version, 0)
            migration.fulfill()
        }
        await client.setCallbacks(callbacks)

        let url = try XCTUnwrap(Bundle.module.url(forResource: "conformance", withExtension: "json", subdirectory: "Fixtures"))
        let document = try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
        guard case let .object(root) = document, case let .array(replay)? = root["serverReplay"] else {
            return XCTFail("fixture replay is missing")
        }
        for envelope in replay {
            await client.receive(try JSONEncoder().encode(envelope))
        }
        await fulfillment(of: [snapshot, migration], timeout: 1)

        let requests = await transport.requests
        XCTAssertEqual(requests.map(\.operation), ["auth.authenticate", "rooms.join"])

        try await client.sendAction(roomId: "room-1", sequence: 1, payload: .object(["move": .number(1)]), actionId: "fixture_action_1")
        try await client.publishHostState(
            roomId: "room-1",
            sequence: 2,
            expectedVersion: 0,
            state: .object(["tick": .number(1)]),
            expectedStateVersion: 0,
            actionId: "fixture_action_1"
        )
        try await client.sendActionReject(
            roomId: "room-1",
            sequence: 4,
            actionId: "fixture_action_2",
            outcome: "rejected",
            message: "action rejected"
        )
        let encoded = await transport.requests.suffix(3).compactMap { request -> [String: JSONValue]? in
            guard case let .object(payload) = request.payload,
                  case let .object(envelope)? = payload["envelope"] else { return nil }
            return envelope
        }
        XCTAssertEqual(encoded[0]["type"], .string("action"))
        XCTAssertEqual(encoded[0]["actionId"], .string("fixture_action_1"))
        XCTAssertEqual(encoded[1]["type"], .string("host_state"))
        XCTAssertEqual(encoded[1]["expectedStateVersion"], .number(0))
        XCTAssertEqual(encoded[2]["type"], .string("action_reject"))
        XCTAssertEqual(encoded[2]["actionId"], .string("fixture_action_2"))
    }

    func testSynchronizedRoomsConvergeAndRetainFailedLeave() async throws {
        let world = MemoryWorld()
        let hostTransport = MemoryRoomTransport(world: world)
        let memberTransport = MemoryRoomTransport(world: world)
        let host = LokiClient(transport: hostTransport)
        let member = LokiClient(transport: memberTransport)
        _ = try await host.authenticate(token: "host")
        try await host.connect()
        _ = try await member.authenticate(token: "member")
        try await member.connect()
        let hostRoom = await host.createSynchronizedRoom(initialState: .object(["n": .number(0)])) { state, action, _ in
            guard case let .object(fields) = state, case let .number(n) = fields["n"],
                  case let .object(payload) = action, case let .number(d) = payload["d"] else {
                throw SynchronizedRoomError(.invalid, "bad action")
            }
            return .object(["n": .number(n + d)])
        }
        let memberRoom = await member.createSynchronizedRoom(initialState: .object(["n": .number(0)])) { state, action, _ in
            guard case let .object(fields) = state, case let .number(n) = fields["n"],
                  case let .object(payload) = action, case let .number(d) = payload["d"] else {
                return state
            }
            return .object(["n": .number(n + d)])
        }
        let created = try await hostRoom.create()
        _ = try await memberRoom.join(inviteCode: created.inviteCode)
        _ = try await memberRoom.dispatch(.object(["d": .number(3)]))
        let hostSnapshot = try await waitForState(hostRoom, n: 3)
        let memberSnapshot = try await waitForState(memberRoom, n: 3)
        XCTAssertEqual(hostSnapshot.state, .object(["n": .number(3)]))
        XCTAssertEqual(memberSnapshot.state, .object(["n": .number(3)]))
        let hostIsHost = await hostRoom.isHost
        let memberIsHost = await memberRoom.isHost
        XCTAssertTrue(hostIsHost)
        XCTAssertFalse(memberIsHost)

        await hostTransport.failNextLeave()
        do { try await hostRoom.leave(); XCTFail("leave should fail") } catch {}
        let failedLeave = await hostRoom.getSnapshot()
        XCTAssertEqual(failedLeave.connection, .leaveFailed)
        let retainedRoom = await host.currentRoomId
        XCTAssertNotNil(retainedRoom)
        try await hostRoom.leave()
        let closed = await hostRoom.getSnapshot()
        XCTAssertEqual(closed.connection, .closed)
    }

    func testLeaveWinsAndStaleSnapshotIsIgnored() async throws {
        let world = MemoryWorld()
        let transport = MemoryRoomTransport(world: world)
        let client = LokiClient(transport: transport)
        _ = try await client.authenticate(token: "host")
        try await client.connect()
        let room = await client.createSynchronizedRoom(initialState: .object(["n": .number(0)])) { state, action, _ in
            guard case let .object(fields) = state, case let .number(n) = fields["n"],
                  case let .object(payload) = action, case let .number(d) = payload["d"] else { return state }
            return .object(["n": .number(n + d)])
        }
        _ = try await room.create()
        _ = try await room.dispatch(.object(["d": .number(4)]))
        await transport.injectStaleSnapshot()
        let afterStale = await room.getSnapshot()
        XCTAssertEqual(afterStale.state, .object(["n": .number(4)]))
        XCTAssertEqual(afterStale.stateVersion, 2)

        let lateTransport = MemoryRoomTransport(world: world)
        let second = LokiClient(transport: lateTransport)
        _ = try await second.authenticate(token: "late")
        try await second.connect()
        let late = await second.createSynchronizedRoom(initialState: .object(["n": .number(0)])) { state, _, _ in state }
        await lateTransport.holdNextEnter()
        let invite = await room.getSnapshot().inviteCode
        let joining = Task { try await late.join(inviteCode: invite) }
        await lateTransport.waitUntilHeld()
        let leaving = Task { try await late.leave() }
        await lateTransport.releaseEnter()
        _ = try? await joining.value
        _ = try? await leaving.value
        let connection = await late.getSnapshot().connection
        XCTAssertTrue([.closed, .failed, .leaveFailed].contains(connection))
    }

    func testListenerIsolationAndReconnectFailure() async throws {
        let world = MemoryWorld()
        let transport = MemoryRoomTransport(world: world)
        let client = LokiClient(transport: transport)
        _ = try await client.authenticate(token: "host")
        try await client.connect()
        _ = await client.onMessage { _ in
            enum Isolated: Error { case failed }
            _ = Isolated.failed
        }
        let room = await client.createSynchronizedRoom(initialState: .object(["n": .number(0)])) { state, action, _ in
            guard case let .object(fields) = state, case let .number(n) = fields["n"],
                  case let .object(payload) = action, case let .number(d) = payload["d"] else { return state }
            return .object(["n": .number(n + d)])
        }
        _ = try await room.create()
        _ = try await room.dispatch(.object(["d": .number(1)]))
        await client.notifyConnection("reconnect_failed")
        var snapshot = await room.getSnapshot()
        for _ in 0..<20 where snapshot.connection != .reconnecting {
            try await Task.sleep(nanoseconds: 10_000_000)
            snapshot = await room.getSnapshot()
        }
        XCTAssertEqual(snapshot.connection, .reconnecting)
    }

    func testAuthorityMigrationAndDuplicateSettlement() async throws {
        let world = MemoryWorld()
        let hostTransport = MemoryRoomTransport(world: world)
        let memberTransport = MemoryRoomTransport(world: world)
        let host = LokiClient(transport: hostTransport)
        let member = LokiClient(transport: memberTransport)
        _ = try await host.authenticate(token: "host")
        try await host.connect()
        _ = try await member.authenticate(token: "member")
        try await member.connect()
        let reduce: @Sendable (JSONValue, JSONValue, ActionContext) throws -> JSONValue = { state, action, _ in
            guard case let .object(fields) = state, case let .number(n) = fields["n"],
                  case let .object(payload) = action, case let .number(d) = payload["d"] else { return state }
            return .object(["n": .number(n + d)])
        }
        let hostRoom = await host.createSynchronizedRoom(initialState: .object(["n": .number(0)]), reduce: reduce)
        let memberRoom = await member.createSynchronizedRoom(initialState: .object(["n": .number(0)]), reduce: reduce)
        let created = try await hostRoom.create()
        _ = try await memberRoom.join(inviteCode: created.inviteCode)
        await memberTransport.emitUnseenDuplicateOnce()
        _ = try await memberRoom.dispatch(.object(["d": .number(2)]))
        let afterDuplicate = try await waitForState(memberRoom, n: 2)
        XCTAssertEqual(afterDuplicate.state, .object(["n": .number(2)]))
        try await hostRoom.leave()
        _ = try await memberRoom.dispatch(.object(["d": .number(1)]))
        let migrated = try await waitForState(memberRoom, n: 3)
        XCTAssertEqual(migrated.state, .object(["n": .number(3)]))
        let memberBecameHost = await memberRoom.isHost
        XCTAssertTrue(memberBecameHost)
    }
}

private func waitForState(_ room: SynchronizedRoom, n: Int64) async throws -> SynchronizedRoomSnapshot {
    for _ in 0..<50 {
        let snapshot = await room.getSnapshot()
        if snapshot.state == .object(["n": .number(n)]) { return snapshot }
        try await Task.sleep(nanoseconds: 10_000_000)
    }
    return await room.getSnapshot()
}

private actor MemoryWorld {
    var rooms: [String: MemoryRoom] = [:]
    var invites: [String: String] = [:]
    var listeners: [String: [@Sendable (Data) -> Void]] = [:]

    func register(roomId: String, listener: @escaping @Sendable (Data) -> Void) {
        listeners[roomId, default: []].append(listener)
    }

    func broadcast(roomId: String, fields: [String: JSONValue]) {
        let data = try! JSONEncoder().encode(JSONValue.object(fields))
        for listener in listeners[roomId, default: []] { listener(data) }
    }
}

private struct MemoryRoom {
    var roomId: String
    var inviteCode: String
    var hostId: String
    var version: Int64
    var sequence: Int64
    var state: JSONValue
    var members: [String: Presence]
}

private actor MemoryRoomTransport: LokiTransport {
    private let world: MemoryWorld
    private var playerId: String?
    private var roomId: String?
    private var listener: (@Sendable (Data) -> Void)?
    private var failLeave = false
    private var enterHold: CheckedContinuation<Void, Never>?
    private var holding = false
    private var parked = false
    private var unseenDuplicate = false

    init(world: MemoryWorld) { self.world = world }

    func request(_ request: LokiRequest) async throws -> Data {
        switch request.operation {
        case "auth.authenticate":
            playerId = UUID().uuidString
            return json(["playerId": playerId!, "accessToken": "a", "refreshToken": "r", "expiresAt": 1])
        case "rooms.create":
            if holding {
                await withCheckedContinuation { continuation in
                    parked = true
                    enterHold = continuation
                }
            }
            let id = UUID().uuidString
            let invite = String(id.replacingOccurrences(of: "-", with: "").prefix(16)).uppercased()
            let player = try requirePlayer()
            var room = MemoryRoom(
                roomId: id, inviteCode: invite, hostId: player, version: 0, sequence: 0,
                state: .object([:]), members: [:]
            )
            room.members[player] = Presence(playerId: player, sessionId: player, joinedAt: 0, team: nil, host: true)
            await world.set(room)
            roomId = id
            if let listener { await world.register(roomId: id, listener: listener) }
            return try encodeJoined(room)
        case "rooms.join":
            if holding {
                await withCheckedContinuation { continuation in
                    parked = true
                    enterHold = continuation
                }
            }
            guard case let .object(payload) = request.payload,
                  case let .string(invite)? = payload["inviteCode"] else { throw LokiClientError.invalidSnapshot }
            let player = try requirePlayer()
            var room = try await world.room(invite: invite)
            room.members[player] = Presence(playerId: player, sessionId: player, joinedAt: 0, team: nil, host: false)
            await world.set(room)
            roomId = room.roomId
            if let listener { await world.register(roomId: room.roomId, listener: listener) }
            return try encodeJoined(room)
        case "rooms.leave":
            if failLeave {
                failLeave = false
                throw SynchronizedRoomError(.indeterminate, "leave failed")
            }
            try await leaveRoom()
            return Data("{}".utf8)
        case "rooms.reconnect":
            return Data("{}".utf8)
        case "rooms.send":
            guard case let .object(payload) = request.payload,
                  case let .object(envelope)? = payload["envelope"] else { return Data("{}".utf8) }
            try await handle(envelope)
            return Data("{}".utf8)
        default:
            return Data("{}".utf8)
        }
    }

    func connect(onMessage: @escaping @Sendable (Data) -> Void) async throws { listener = onMessage }
    func disconnect() async { listener = nil }
    func failNextLeave() { failLeave = true }
    func holdNextEnter() { holding = true; parked = false }
    func emitUnseenDuplicateOnce() { unseenDuplicate = true }
    func waitUntilHeld() async {
        while holding && !parked {
            await Task.yield()
        }
    }
    func releaseEnter() {
        holding = false
        enterHold?.resume()
        enterHold = nil
    }

    func injectStaleSnapshot() async {
        guard let roomId, var room = await world.room(id: roomId) else { return }
        room.sequence += 1
        await world.broadcast(roomId: roomId, fields: snapshot(room, version: max(0, room.version - 1), state: .object(["n": .number(-1)])))
    }

    private func leaveRoom() async throws {
        guard let roomId, var room = await world.room(id: roomId) else {
            self.roomId = nil
            return
        }
        let player = try requirePlayer()
        room.members.removeValue(forKey: player)
        let previousHost = room.hostId
        if room.hostId == player {
            room.hostId = room.members.keys.first ?? ""
            room.sequence += 1
            await world.set(room)
            await world.broadcast(roomId: room.roomId, fields: [
                "protocolVersion": .number(1),
                "roomId": .string(room.roomId),
                "sequence": .number(room.sequence),
                "type": .string("host_changed"),
                "previousHostId": .string(previousHost),
                "hostId": .string(room.hostId),
                "stateVersion": .number(room.version),
            ])
        } else {
            await world.set(room)
        }
        self.roomId = nil
    }

    private func handle(_ envelope: [String: JSONValue]) async throws {
        guard let roomId, var room = await world.room(id: roomId) else { return }
        let type: String
        if case let .string(value) = envelope["type"] { type = value } else { return }
        if type == "snapshot_request" {
            room.sequence += 1
            await world.set(room)
            await world.broadcast(roomId: room.roomId, fields: snapshot(room))
            return
        }
        if type == "host_state" {
            room.state = envelope["state"] ?? room.state
            room.version += 1
            room.sequence += 1
            await world.set(room)
            await world.broadcast(
                roomId: room.roomId,
                fields: state(room, actionId: string(envelope["actionId"]), senderId: string(envelope["senderId"]))
            )
        }
        if type == "action", case let .string(actionId) = envelope["actionId"] {
            let sender = try requirePlayer()
            if unseenDuplicate {
                unseenDuplicate = false
                room.sequence += 1
                await world.set(room)
                listener?(try! JSONEncoder().encode(JSONValue.object([
                    "protocolVersion": .number(1),
                    "roomId": .string(room.roomId),
                    "sequence": .number(room.sequence),
                    "type": .string("error"),
                    "code": .string("INVALID_MESSAGE"),
                    "message": .string("duplicate action"),
                    "actionId": .string(actionId),
                    "senderId": .string(sender),
                ])))
            }
            room.sequence += 1
            await world.set(room)
            await world.broadcast(roomId: room.roomId, fields: [
                "protocolVersion": .number(1),
                "roomId": .string(room.roomId),
                "sequence": .number(room.sequence),
                "type": .string("action"),
                "senderId": .string(sender),
                "actionId": .string(actionId),
                "payload": envelope["payload"] ?? .null,
            ])
        }
    }

    private func encodeJoined(_ room: MemoryRoom) throws -> Data {
        let encoder = JSONEncoder()
        return try encoder.encode(JoinedRoom(roomId: room.roomId, inviteCode: room.inviteCode, snapshot: decode(snapshot(room))))
    }

    private func snapshot(_ room: MemoryRoom, version: Int64? = nil, state: JSONValue? = nil) -> [String: JSONValue] {
        [
            "protocolVersion": .number(1),
            "roomId": .string(room.roomId),
            "sequence": .number(room.sequence),
            "type": .string("snapshot"),
            "hostId": .string(room.hostId),
            "state": state ?? room.state,
            "stateVersion": .number(version ?? room.version),
            "members": .array(room.members.values.map {
                .object([
                    "playerId": .string($0.playerId),
                    "sessionId": .string($0.sessionId),
                    "joinedAt": .number($0.joinedAt),
                    "host": .bool($0.host || $0.playerId == room.hostId),
                ])
            }),
            "capabilities": .object([
                "synchronized_rooms": .bool(true),
                "minimumProtocolVersion": .number(1),
            ]),
        ]
    }

    private func state(_ room: MemoryRoom, actionId: String?, senderId: String?) -> [String: JSONValue] {
        var fields: [String: JSONValue] = [
            "protocolVersion": .number(1),
            "roomId": .string(room.roomId),
            "sequence": .number(room.sequence),
            "type": .string("state"),
            "hostId": .string(room.hostId),
            "state": room.state,
            "stateVersion": .number(room.version),
        ]
        if let actionId { fields["actionId"] = .string(actionId) }
        if let senderId { fields["senderId"] = .string(senderId) }
        return fields
    }

    private func decode(_ fields: [String: JSONValue]) -> ServerEnvelope {
        try! JSONDecoder().decode(ServerEnvelope.self, from: try! JSONEncoder().encode(JSONValue.object(fields)))
    }

    private func json(_ fields: [String: Any]) -> Data {
        try! JSONSerialization.data(withJSONObject: fields)
    }

    private func string(_ value: JSONValue?) -> String? {
        if case let .string(text) = value { return text }
        return nil
    }

    private func requirePlayer() throws -> String {
        guard let playerId else { throw LokiClientError.missingRoom }
        return playerId
    }
}

private extension MemoryWorld {
    func set(_ room: MemoryRoom) {
        rooms[room.roomId] = room
        invites[room.inviteCode] = room.roomId
    }

    func room(id: String) -> MemoryRoom? { rooms[id] }

    func room(invite: String) throws -> MemoryRoom {
        guard let id = invites[invite], let room = rooms[id] else { throw LokiClientError.invalidSnapshot }
        return room
    }
}
