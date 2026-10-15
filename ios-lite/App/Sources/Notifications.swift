import Foundation
import UserNotifications
import CapitalForgeLiteKit

/// Yerel bildirimler: sunucu yok. Uygulama arka plana geçerken modelden
/// "ne zaman ne olacak" hesaplanıp zamanlanıyor; geri dönünce hepsi siliniyor.
///
/// Üç bildirim, üçü de ancak çevrimdışı tavanı içinde (tavandan sonra
/// şirket durduğu için hiçbir şey olmuyor):
/// - Kasa doldu: tavan anında, o ana kadar birikecek parayla.
/// - Meclis toplandı: sıradaki oturum anında (oturum açık değilse).
/// - Rakip seni geçti: `Lite.firstOvertake` önde olduğun bir zincirde payın
///   %50'nin altına ineceği anı veriyorsa.
enum LiteNotifications {
    private static let ids = ["cap", "council", "rival"]
    /// Bundan yakın bildirim kurulmuyor: uygulamayı değiştirip dönmek "yokken" değil.
    private static let minimumDelay = 60.0

    static func authorization() async -> UNAuthorizationStatus {
        await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
    }

    static func requestAuthorization() async -> Bool {
        (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])) ?? false
    }

    static func cancelAll() {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: ids)
        center.removeDeliveredNotifications(withIdentifiers: ids)
    }

    /// Plan: (kimlik, başlık, metin, kaç saniye sonra). Ayrı tutuldu ki zamanlama mantığı okunabilsin.
    static func plan(for state: LiteState) -> [(id: String, title: String, body: String, delay: Double)] {
        var plan: [(id: String, title: String, body: String, delay: Double)] = []
        let cap = Lite.offlineCap(state)

        let earned = Lite.applyOffline(state, cap).earned
        if earned > 0 {
            plan.append(("cap", L10n.t("notify.cap.title"), L10n.t("notify.cap.body", Format.money(earned)), cap))
        }

        if state.council == nil {
            let delay = state.nextCouncilAt - state.clock
            if delay <= cap {
                plan.append(("council", L10n.t("notify.council.title"), L10n.t("notify.council.body"), delay))
            }
        }

        if let delay = Lite.firstOvertake(state, cap) {
            let later = Lite.applyOffline(state, delay).state
            let chain = ChainId.allCases.first {
                state[chain: $0].levels[2] > 0
                    && Lite.chainReport(state, $0).share >= LiteContent.overtakeShare
                    && Lite.chainReport(later, $0).share < LiteContent.overtakeShare
            }
            if let chain {
                plan.append(("rival", L10n.t("notify.rival.title"), L10n.t("notify.rival.body", L10n.chainName(chain)), delay))
            }
        }
        return plan.filter { $0.delay >= minimumDelay }
    }

    static func schedule(for state: LiteState) {
        cancelAll()
        let center = UNUserNotificationCenter.current()
        for item in plan(for: state) {
            let content = UNMutableNotificationContent()
            content.title = item.title
            content.body = item.body
            content.sound = .default
            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: item.delay, repeats: false)
            center.add(UNNotificationRequest(identifier: item.id, content: content, trigger: trigger))
        }
    }
}
