// swift-tools-version:5.9
import PackageDescription

// CapitalForge Lite — oyun modeli (saf Swift, yalnızca Foundation).
// Uygulama (SwiftUI) bu paketi kullanıyor; model iOS'tan bağımsız test ediliyor.
let package = Package(
    name: "CapitalForgeLite",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "CapitalForgeLiteKit", targets: ["CapitalForgeLiteKit"]),
    ],
    targets: [
        .target(name: "CapitalForgeLiteKit"),
        .testTarget(
            name: "CapitalForgeLiteKitTests",
            dependencies: ["CapitalForgeLiteKit"],
            resources: [.copy("Fixtures")]
        ),
    ]
)
