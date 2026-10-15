import Foundation
import Observation
import CapitalForgeLiteKit

// L8: haftalık lig ve davet kodlu özel ligler (kendi sunucumuz:
// `packages/lite-league`, Cloudflare Workers + D1).
//
// - Sunucu adresi Info.plist'te `LiteLeagueURL`; boşsa lig "yakında" kalıyor,
//   oyun etkilenmiyor.
// - Hesap anonim: ad + sunucunun verdiği token (UserDefaults'ta).
// - Haftalık puan uygulamada tutuluyor: toplam kazançtaki artış, yıldızsız.
//   Sunucu her gönderimi kendi saatiyle ve aynı TS modeliyle denetliyor.

struct LeagueRow: Codable, Equatable, Identifiable {
    let rank: Int
    let name: String
    let score: Double
    let me: Bool
    /// Haftalık grupta: +1 çıkış, -1 iniş, 0 kalış (özel ligde yok).
    var move: Int?
    var id: Int { rank }
}

struct LeagueStandings: Codable, Equatable {
    let week: String
    let endsAt: Double
    let division: Int
    let promote: Int
    let demote: Int
    let group: [LeagueRow]
}

struct PrivateLeague: Codable, Equatable, Identifiable {
    let code: String
    let name: String
    var members: [LeagueRow]
    var id: String { code }
}

private struct PrivateLeagues: Codable {
    let leagues: [PrivateLeague]
}

struct LeagueAccount: Codable, Equatable {
    let id: String
    let token: String
    var name: String
}

/// Bu haftanın puanı: hafta değişince sıfırlanıyor.
struct LeagueTracker: Codable, Equatable {
    var week: String
    var score: Double
    var lastTotal: Double
}

enum LeagueError: Error, Equatable {
    case http(Int, String)
    case transport
}

@MainActor
@Observable
final class LeagueService {
    enum Status: Equatable {
        /// Sunucu adresi yok (henüz kurulmadı).
        case unconfigured
        /// Adres var, hesap yok.
        case signedOut
        case ready
    }

    private(set) var status: Status
    private(set) var account: LeagueAccount? = nil
    private(set) var standings: LeagueStandings? = nil
    private(set) var leagues: [PrivateLeague] = []
    private(set) var tracker: LeagueTracker
    private(set) var busy = false
    /// Son hata (kullanıcıya gösterilecek L10n anahtarı).
    var problem: String? = nil

    private let baseURL: URL?
    private let ephemeral: Bool
    private let defaults = UserDefaults.standard
    @ObservationIgnored private var lastSubmit = Date.distantPast
    static let accountKey = "lite.league.account"
    static let trackerKey = "lite.league.tracker"
    /// İki otomatik gönderim arası (sn).
    static let submitEvery = 300.0

    init(scenario: Bool) {
        ephemeral = scenario
        let week = LiteLeague.weekId(epochMs: Date().timeIntervalSince1970 * 1000)
        if scenario {
            // CI kareleri: ağ yok, örnek grup ve özel lig.
            baseURL = nil
            tracker = LeagueTracker(week: week, score: 0, lastTotal: 0)
            if ProcessInfo.processInfo.arguments.contains("-liteLeague") {
                let mock = LeagueService.mock(week: week)
                tracker.score = mock.standings.group.first(where: \.me)?.score ?? 0
                account = LeagueAccount(id: "mock", token: "", name: "Atilla Holding")
                standings = mock.standings
                leagues = mock.leagues
                status = .ready
            } else {
                status = .unconfigured
            }
            return
        }
        let raw = (Bundle.main.object(forInfoDictionaryKey: "LiteLeagueURL") as? String ?? "").trimmingCharacters(in: .whitespaces)
        let url = raw.isEmpty ? nil : URL(string: raw)
        let store = UserDefaults.standard
        let decoder = JSONDecoder()
        let saved = store.data(forKey: LeagueService.accountKey).flatMap { try? decoder.decode(LeagueAccount.self, from: $0) }
        baseURL = url
        account = saved
        tracker = store.data(forKey: LeagueService.trackerKey).flatMap { try? decoder.decode(LeagueTracker.self, from: $0) }
            ?? LeagueTracker(week: week, score: 0, lastTotal: -1)
        status = url == nil ? .unconfigured : (saved == nil ? .signedOut : .ready)
    }

    // MARK: - Haftalık puan

    /// Durum her değiştiğinde: toplam kazançtaki artış yıldızsız olarak bu haftaya.
    func track(_ state: LiteState, now: Date = Date()) {
        // CI kareleri: puan örnek verideki gibi kalsın.
        guard !ephemeral else { return }
        let week = LiteLeague.weekId(epochMs: now.timeIntervalSince1970 * 1000)
        if tracker.week != week {
            tracker = LeagueTracker(week: week, score: 0, lastTotal: state.totalEarned)
            standings = nil
        }
        // İlk açılış (lastTotal -1) ya da kayıt sıfırlandı: geçmiş kazanç bu haftaya yazılmıyor.
        let delta = state.totalEarned - tracker.lastTotal
        if tracker.lastTotal >= 0 && delta > 0 { tracker.score += LiteLeague.starFree(delta, stars: state.stars) }
        tracker.lastTotal = state.totalEarned
    }

    func persist() {
        guard !ephemeral, let data = try? JSONEncoder().encode(tracker) else { return }
        defaults.set(data, forKey: LeagueService.trackerKey)
    }

    // MARK: - Gönderim

    func submitIfDue(_ state: LiteState) {
        guard status == .ready, !ephemeral, !busy, Date().timeIntervalSince(lastSubmit) >= LeagueService.submitEvery else { return }
        Task { await self.submit(state) }
    }

    func submit(_ state: LiteState) async {
        guard status == .ready, !ephemeral else { return }
        lastSubmit = Date()
        let report = Lite.leagueReport(state, week: tracker.week, score: tracker.score)
        do {
            let updated: LeagueStandings = try await send("POST", "v1/reports", body: try JSONEncoder().encode(report))
            standings = updated
            problem = nil
        } catch LeagueError.http(422, _) {
            problem = "league.rejected"
        } catch LeagueError.http(401, _) {
            signOut()
        } catch {
            // Sık gönderim, hafta sınırı, ağ: bir sonraki turda yeniden.
        }
    }

    // MARK: - Hesap ve ligler

    func register(name: String) async {
        await run {
            let body = try JSONEncoder().encode(["name": name])
            let created: LeagueAccount = try await self.send("POST", "v1/players", body: body, auth: false)
            self.account = created
            if let data = try? JSONEncoder().encode(created) { self.defaults.set(data, forKey: LeagueService.accountKey) }
            self.status = .ready
            try await self.reload()
        }
    }

    func rename(_ name: String) async {
        await run {
            struct Renamed: Decodable { let name: String }
            let renamed: Renamed = try await self.send("PATCH", "v1/players/me", body: try JSONEncoder().encode(["name": name]))
            self.account?.name = renamed.name
            if let account = self.account, let data = try? JSONEncoder().encode(account) {
                self.defaults.set(data, forKey: LeagueService.accountKey)
            }
            try await self.reload()
        }
    }

    func refresh() async {
        guard status == .ready, !ephemeral else { return }
        await run { try await self.reload() }
    }

    func createLeague(name: String) async {
        await run {
            struct Created: Decodable { let code: String }
            let _: Created = try await self.send("POST", "v1/leagues", body: try JSONEncoder().encode(["name": name]))
            try await self.reload()
        }
    }

    func joinLeague(code: String) async {
        await run {
            struct Joined: Decodable { let code: String }
            let _: Joined = try await self.send("POST", "v1/leagues/join", body: try JSONEncoder().encode(["code": code]))
            try await self.reload()
        }
    }

    func leaveLeague(code: String) async {
        await run {
            struct Left: Decodable { let ok: Bool }
            let _: Left = try await self.send("DELETE", "v1/leagues/\(code)")
            try await self.reload()
        }
    }

    private func signOut() {
        account = nil
        standings = nil
        leagues = []
        defaults.removeObject(forKey: LeagueService.accountKey)
        status = baseURL == nil ? .unconfigured : .signedOut
    }

    private func reload() async throws {
        let group: LeagueStandings = try await send("GET", "v1/league")
        let mine: PrivateLeagues = try await send("GET", "v1/leagues")
        standings = group
        leagues = mine.leagues
    }

    /// Bir eylemi meşgul işaretiyle koştur; hatayı kullanıcı diline çevir.
    private func run(_ work: @escaping () async throws -> Void) async {
        guard !ephemeral else { return }
        busy = true
        defer { busy = false }
        do {
            try await work()
            problem = nil
        } catch LeagueError.http(let status, let code) {
            if status == 401 { signOut() }
            problem = switch code {
            case "name": "league.error.name"
            case "code": "league.error.code"
            case "full": "league.error.full"
            case "limit": "league.error.limit"
            default: "league.error.network"
            }
        } catch {
            problem = "league.error.network"
        }
    }

    private func send<T: Decodable>(_ method: String, _ path: String, body: Data? = nil, auth: Bool = true) async throws -> T {
        guard let baseURL else { throw LeagueError.transport }
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = method
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if auth, let account { request.setValue("Bearer \(account.id).\(account.token)", forHTTPHeaderField: "Authorization") }
        request.httpBody = body
        let (data, response) = try await URLSession.shared.data(for: request)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else {
            struct Failure: Decodable { let error: String }
            throw LeagueError.http(code, (try? JSONDecoder().decode(Failure.self, from: data))?.error ?? "")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    // MARK: - CI kareleri

    private static func mock(week: String) -> (standings: LeagueStandings, leagues: [PrivateLeague]) {
        let names = [
            "Kuzey Gıda", "Ege Tekstil", "Atlas Lojistik", "Atilla Holding", "Mavi Kahve", "Demir Deri", "Lale Moda",
            "Boğaz Yatırım", "Sarı Fırın", "Pusula Enerji", "Toros Otomotiv", "Rüzgâr AŞ", "Kardelen", "Anka Teknoloji",
            "Martı Havayolu", "Yıldız Çarşı", "Çınar", "Karadeniz Çay", "Ufuk", "Gümüş Ticaret", "Akdeniz", "Nehir",
            "Kule Yapı", "Defne", "Ada Liman", "Su Holding", "Bulut", "Zeytin", "Dağ Madencilik", "Kum Saati",
        ]
        let start = LiteLeague.weekStart(week) ?? 0
        let group = names.enumerated().map { index, name in
            LeagueRow(rank: index + 1, name: name, score: 9.6e12 / pow(1.22, Double(index)), me: name == "Atilla Holding",
                      move: index < 5 ? 1 : (index >= names.count - 5 ? -1 : 0))
        }
        let standings = LeagueStandings(week: week, endsAt: start + 7 * 86_400_000, division: 2, promote: 5, demote: 5, group: group)
        let office = ["Deniz", "Atilla Holding", "Selin", "Mert", "Ece", "Kaan"].enumerated().map { index, name in
            LeagueRow(rank: index + 1, name: name, score: 4.1e12 / pow(1.6, Double(index)), me: name == "Atilla Holding", move: nil)
        }
        return (standings, [PrivateLeague(code: "K7P2QX", name: "Ofis Ligi", members: office)])
    }
}
