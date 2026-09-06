// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "LokiSDK",
    platforms: [
        .iOS(.v13),
        .macOS(.v12),
        .tvOS(.v13),
        .watchOS(.v6),
    ],
    products: [
        .library(name: "LokiSDK", targets: ["LokiSDK"]),
    ],
    targets: [
        .target(name: "LokiSDK"),
        .testTarget(
            name: "LokiSDKTests",
            dependencies: ["LokiSDK"],
            resources: [.copy("Fixtures")]
        ),
    ]
)
