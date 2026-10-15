import SwiftUI
import CapitalForgeLiteKit

@main
struct CapitalForgeLiteApp: App {
    @State private var store = GameStore()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                // Görünüm Ayarlar'dan: cihaz, gündüz ya da gece.
                .preferredColorScheme(store.settings.appearance.scheme)
                .onChange(of: scenePhase) { _, phase in
                    store.scenePhaseChanged(phase)
                }
        }
    }
}
