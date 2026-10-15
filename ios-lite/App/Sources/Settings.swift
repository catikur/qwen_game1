import Foundation
import Observation
import SwiftUI

/// Dil seçimi: cihaz dili ya da elle.
enum LanguageChoice: String, CaseIterable, Identifiable {
    case system, tr, en
    var id: String { rawValue }

    var lang: Lang {
        switch self {
        case .system: Lang.current
        case .tr: .tr
        case .en: .en
        }
    }
}

/// Görünüm: cihazın açık/koyu moduna uy ya da gündüz/gece zorla.
enum AppearanceChoice: String, CaseIterable, Identifiable {
    case system, day, night
    var id: String { rawValue }

    /// `nil`: cihaz neyse o.
    var scheme: ColorScheme? {
        switch self {
        case .system: nil
        case .day: .light
        case .night: .dark
        }
    }
}

/// Oyuncu tercihleri. UserDefaults'ta tutuluyor; senaryo modunda (CI kareleri)
/// hiçbir şey okunmuyor ve yazılmıyor.
@MainActor
@Observable
final class AppSettings {
    var language: LanguageChoice {
        didSet {
            L10n.lang = language.lang
            write(language.rawValue, "language")
        }
    }
    var appearance: AppearanceChoice { didSet { write(appearance.rawValue, "appearance") } }
    var sound: Bool { didSet { write(sound, "sound") } }
    var haptics: Bool { didSet { write(haptics, "haptics") } }
    var notifications: Bool { didSet { write(notifications, "notifications") } }
    /// Bildirim izni oyunda bir kez önerildi mi. Bir daha sorulmuyor; Ayarlar'dan açılıyor.
    var notificationsOffered: Bool { didSet { write(notificationsOffered, "notificationsOffered") } }
    /// iOS izni reddettiyse: anahtar açılamıyor, Ayarlar'a yönlendiriyoruz.
    var notificationsDenied = false

    private let defaults: UserDefaults?

    init(ephemeral: Bool) {
        defaults = ephemeral ? nil : UserDefaults.standard
        let stored = defaults
        language = LanguageChoice(rawValue: stored?.string(forKey: "language") ?? "") ?? .system
        appearance = AppearanceChoice(rawValue: stored?.string(forKey: "appearance") ?? "") ?? .system
        // Senaryo modunda da varsayılan görünsün; çalmayı GameStore senaryoda zaten kesiyor.
        sound = stored?.object(forKey: "sound") as? Bool ?? true
        haptics = stored?.object(forKey: "haptics") as? Bool ?? true
        notifications = stored?.object(forKey: "notifications") as? Bool ?? false
        notificationsOffered = stored?.object(forKey: "notificationsOffered") as? Bool ?? false
        L10n.lang = language.lang
    }

    private func write(_ value: Any, _ key: String) {
        defaults?.set(value, forKey: key)
    }
}
