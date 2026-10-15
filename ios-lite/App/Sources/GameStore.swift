import Foundation
import Observation
import SwiftUI
import CapitalForgeLiteKit

/// Toplu alım: ×1, ×10, kasanın yettiği kadar.
enum BuyAmount: String, CaseIterable, Identifiable {
    case one, ten, max
    var id: String { rawValue }
}

/// "Yokken kazandın" penceresinin içeriği.
struct OfflineReport: Identifiable {
    let id = UUID()
    let earned: Double
    let seconds: Double
    let cap: Double
}

/// Kayıt dosyası: durum + en son görülme anı (çevrimdışı kazanç için).
struct SaveFile: Codable {
    var version = 1
    var state: LiteState
    var lastSeen: Date
}

/// Oyunun tek kaynağı. Model saf (CapitalForgeLiteKit); burada yalnızca zaman,
/// kayıt ve kullanıcı eylemleri var.
@MainActor
@Observable
final class GameStore {
    private(set) var state: LiteState
    var offlineReport: OfflineReport?
    var buyAmount: BuyAmount = .one
    /// Başarılı alım sayacı: dokunsal geri bildirimin tetiği.
    private(set) var purchases = 0
    /// Başarısız alım sayacı.
    private(set) var refusals = 0

    @ObservationIgnored private var lastTick = Date()
    @ObservationIgnored private var timer: Timer?
    @ObservationIgnored private var sinceSave: Double = 0
    /// Arka plana geçiş anı. Çevrimdışı süre buradan sayılıyor; açılıştaki
    /// süre ise kayıttaki `lastSeen`'den (ikisi aynı ayrılışı iki kez saymasın).
    @ObservationIgnored private var backgroundAt: Date?
    private let saveURL: URL

    init() {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: support, withIntermediateDirectories: true)
        saveURL = support.appendingPathComponent("capitalforge-lite.json")

        let arguments = ProcessInfo.processInfo.arguments
        if let index = arguments.firstIndex(of: "-liteScenario"), index + 1 < arguments.count {
            // Ekran görüntüsü senaryosu: kayıt okunmuyor ve yazılmıyor.
            state = Scenario.build(arguments[index + 1])
            if let offline = arguments.firstIndex(of: "-liteOffline"), offline + 1 < arguments.count,
               let seconds = Double(arguments[offline + 1]) {
                applyOffline(seconds)
            }
        } else if let data = try? Data(contentsOf: saveURL),
                  let save = try? JSONDecoder().decode(SaveFile.self, from: data) {
            state = save.state
            applyOffline(Date().timeIntervalSince(save.lastSeen))
        } else {
            state = Lite.newGame()
        }
        start()
    }

    var isScenario: Bool { ProcessInfo.processInfo.arguments.contains("-liteScenario") }

    // MARK: - Zaman

    func start() {
        lastTick = Date()
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.tick() }
        }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    private func tick() {
        let now = Date()
        // Uyku ya da duraklama sonrası büyük sıçrama çevrimdışı kazanç sayılıyor, burada değil.
        let dt = min(now.timeIntervalSince(lastTick), 2)
        lastTick = now
        guard dt > 0 else { return }
        state = Lite.advance(state, dt)
        sinceSave += dt
        if sinceSave >= 5 { save() }
    }

    func scenePhaseChanged(_ phase: ScenePhase) {
        switch phase {
        case .active:
            if let away = backgroundAt {
                backgroundAt = nil
                applyOffline(Date().timeIntervalSince(away))
            }
            start()
        case .background:
            if backgroundAt == nil { backgroundAt = Date() }
            stop()
            save()
        case .inactive:
            save()
        @unknown default:
            break
        }
    }

    private func applyOffline(_ elapsed: Double) {
        // Bir dakikadan kısa ayrılışlar sayılmıyor: uygulama değiştirip dönmek "yokken" değil.
        guard elapsed > 60 else { return }
        let result = Lite.applyOffline(state, elapsed)
        state = result.state
        if result.earned > 0 {
            offlineReport = OfflineReport(earned: result.earned, seconds: result.seconds, cap: Lite.offlineCap(state))
        }
    }

    func save() {
        sinceSave = 0
        guard !isScenario else { return }
        let file = SaveFile(state: state, lastSeen: Date())
        if let data = try? JSONEncoder().encode(file) {
            try? data.write(to: saveURL, options: .atomic)
        }
    }

    // MARK: - Eylemler

    /// Seçili toplu alım miktarına göre kaç seviye alınacağı (0: yetmiyor).
    func count(for chain: ChainId, _ stage: Stage) -> Int {
        let level = state[chain: chain].levels[stage.rawValue]
        switch buyAmount {
        case .one: return 1
        case .ten: return 10
        case .max: return max(1, Lite.maxAffordable(state.cash, chain, stage, level))
        }
    }

    func cost(for chain: ChainId, _ stage: Stage) -> Double {
        Lite.upgradeCost(chain, stage, state[chain: chain].levels[stage.rawValue], count(for: chain, stage))
    }

    func canBuy(_ chain: ChainId, _ stage: Stage) -> Bool {
        Lite.chainUnlocked(state, chain) && cost(for: chain, stage) <= state.cash
    }

    func buy(_ chain: ChainId, _ stage: Stage) {
        switch Lite.buy(state, chain, stage, count(for: chain, stage)) {
        case .success(let next):
            state = next
            purchases += 1
        case .failure:
            refusals += 1
        }
    }

    func buyManager() {
        if case .success(let next) = Lite.buyManager(state) {
            state = next
            purchases += 1
        } else {
            refusals += 1
        }
    }

    func campaign() {
        if case .success(let next) = Lite.startCampaign(state) {
            state = next
            purchases += 1
        }
    }

    func chooseCouncil(_ choice: Int) {
        if case .success(let next) = Lite.chooseCouncil(state, choice) {
            state = next
            purchases += 1
        }
    }

    func claimGoal() {
        if case .success(let next) = Lite.claimGoal(state) {
            state = next
            purchases += 1
        } else {
            refusals += 1
        }
    }

    func sellCity() {
        if case .success(let next) = Lite.prestige(state) {
            state = next
            purchases += 1
            save()
        }
    }
}
