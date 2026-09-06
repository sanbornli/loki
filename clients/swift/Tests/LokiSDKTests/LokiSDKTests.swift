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
    }
}
