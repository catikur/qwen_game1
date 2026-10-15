import Foundation

// CapitalForge Lite — online lig (L8).
//
// `packages/lite-model/src/league.ts`'in uygulamaya gereken kısmı: hafta
// kimliği ve haftalık puan. Akla yatkınlık denetimi sunucuda (aynı TS
// modeliyle); uygulama yalnızca durumu bildiriyor.

public enum LiteLeague {
    public static let divisions = 4
    public static let groupSize = 30
    public static let promote = 5
    public static let demote = 5
    /// Bronz, Gümüş, Altın, Elmas (sunucu aynı anahtarları kullanıyor).
    public static let divisionKeys = ["bronze", "silver", "gold", "diamond"]

    static let dayMs = 86_400_000.0

    /// ISO 8601 hafta kimliği (UTC), ör. "2026-W42". Hafta pazartesi 00:00 UTC'de başlıyor.
    public static func weekId(epochMs: Double) -> String {
        let day = Int(floor(epochMs / dayMs))
        // 1970-01-01 perşembe: (gün + 3) mod 7 → pazartesi 0.
        let weekday = ((day + 3) % 7 + 7) % 7
        let thursday = day - weekday + 3
        let year = yearOf(day: thursday)
        let week = (thursday - daysFromCivil(year, 1, 1)) / 7 + 1
        return String(format: "%04d-W%02d", year, week)
    }

    /// Haftanın başlangıcı (pazartesi 00:00 UTC, ms); bozuk kimlikte nil.
    public static func weekStart(_ id: String) -> Double? {
        let parts = id.split(separator: "-")
        guard parts.count == 2, parts[0].count == 4, parts[1].count == 3, parts[1].first == "W",
              let year = Int(parts[0]), let week = Int(parts[1].dropFirst()) else { return nil }
        let jan4 = daysFromCivil(year, 1, 4)
        let weekday = ((jan4 + 3) % 7 + 7) % 7
        return Double(jan4 - weekday + (week - 1) * 7) * dayMs
    }

    /// Bir kazancın yıldızsız karşılığı (haftalık puana giden).
    public static func starFree(_ amount: Double, stars: Int) -> Double {
        amount / (1 + LiteContent.starBonus * Double(stars))
    }

    /// 1970-01-01'den gün sayısı (Gregoryen, tamsayı; H. Hinnant).
    static func daysFromCivil(_ year: Int, _ month: Int, _ day: Int) -> Int {
        let y = month <= 2 ? year - 1 : year
        let era = (y >= 0 ? y : y - 399) / 400
        let yoe = y - era * 400
        let mp = (month + 9) % 12
        let doy = (153 * mp + 2) / 5 + day - 1
        let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
        return era * 146_097 + doe - 719_468
    }

    /// Günün yılı (Gregoryen, tamsayı).
    static func yearOf(day: Int) -> Int {
        let z = day + 719_468
        let era = (z >= 0 ? z : z - 146_096) / 146_097
        let doe = z - era * 146_097
        let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
        let mp = (5 * doy + 2) / 153
        let month = mp < 10 ? mp + 3 : mp - 9
        return yoe + era * 400 + (month <= 2 ? 1 : 0)
    }
}

/// Uygulamanın lig sunucusuna gönderdiği durum (TS `LeagueReport`).
public struct LeagueReport: Codable, Equatable, Sendable {
    public var week: String
    /// Bu hafta kazanılan, yıldızsız.
    public var score: Double
    public var city: Int
    public var stars: Int
    /// Şu anki şehirde ömür boyu kazanç.
    public var cityEarned: Double
    /// `ChainId.allCases` sırasıyla [ham, işleme, satış].
    public var levels: [[Int]]

    public init(week: String, score: Double, city: Int, stars: Int, cityEarned: Double, levels: [[Int]]) {
        self.week = week
        self.score = score
        self.city = city
        self.stars = stars
        self.cityEarned = cityEarned
        self.levels = levels
    }
}

extension Lite {
    public static func leagueReport(_ state: LiteState, week: String, score: Double) -> LeagueReport {
        LeagueReport(week: week, score: score, city: state.city, stars: state.stars, cityEarned: state.earned, levels: state.chains.map(\.levels))
    }
}
