import GameKit
import UIKit

/// Game Center: genel tablo (L8). Ücretli Apple Developer üyeliği ve
/// App Store Connect'te tanımlı lider tablosu gerektiriyor; o gelene kadar
/// Info.plist'te `LiteGameCenter` kapalı ve hiçbir çağrı yapılmıyor.
///
/// Tablolar (App Store Connect → Game Center → Leaderboards):
/// - `cf.lite.stars`: holding yıldızı (klasik, en yüksek, tamsayı).
@MainActor
enum GameCenter {
    static let starsBoard = "cf.lite.stars"

    static var enabled: Bool {
        Bundle.main.object(forInfoDictionaryKey: "LiteGameCenter") as? Bool ?? false
    }

    static var available: Bool { enabled && GKLocalPlayer.local.isAuthenticated }

    /// Açılışta bir kez: oturum açık değilse Game Center kendi penceresini gösteriyor.
    static func authenticate() {
        guard enabled else { return }
        GKLocalPlayer.local.authenticateHandler = { controller, _ in
            guard let controller else { return }
            let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
            scene?.keyWindow?.rootViewController?.present(controller, animated: true)
        }
    }

    /// Yıldız sayısını genel tabloya yaz (şehir satılınca ve açılışta).
    static func submit(stars: Int) {
        guard available, stars > 0 else { return }
        Task {
            try? await GKLeaderboard.submitScore(stars, context: 0, player: GKLocalPlayer.local, leaderboardIDs: [starsBoard])
        }
    }

    /// Game Center'ın kendi tablo ekranı.
    static func showLeaderboards() {
        guard available else { return }
        GKAccessPoint.shared.trigger(state: .leaderboards) {}
    }
}
