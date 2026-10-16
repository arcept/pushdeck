// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "PushMenu",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(name: "PushMenu", dependencies: ["WinGeo"]),
        .target(name: "WinGeo"),   // window layout maths (pure, no AppKit): used by the window server in PushMenu (`PushMenu --windows`)
        .testTarget(name: "WinGeoTests", dependencies: ["WinGeo"]),
    ]
)
