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
    /// L4: borsa grafiği (hisse fiyatı örnekleri). Eski kayıtlarda yok.
    var priceHistory: [Double]?
}

/// Borsa grafiği: oyun saatinde dakikada bir örnek, son iki saat.
enum PriceHistory {
    static let interval = 60.0
    static let limit = 120
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
    /// Büyük an sayacı (kilometre taşı, görev, halka arz, şehir satışı): başarı titreşimi.
    private(set) var triumphs = 0
    /// L9: yakalanan fırsat sayısı ve sonuncusu (şehirde uçuş için).
    private(set) var catches = 0
    private(set) var lastCatch: DealCatch? = nil
    /// Halka arzdan beri hisse fiyatı (dakikada bir örnek).
    private(set) var priceHistory: [Double] = []
    let settings: AppSettings
    /// L8: haftalık lig ve özel ligler.
    let league: LeagueService
    private let sound = SoundPlayer()
    @ObservationIgnored private var lastSampleClock: Double = -.infinity

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
        let scenario = arguments.contains("-liteScenario")
        settings = AppSettings(ephemeral: scenario)
        league = LeagueService(scenario: scenario)
        if let index = arguments.firstIndex(of: "-liteScenario"), index + 1 < arguments.count {
            // Ekran görüntüsü senaryosu: kayıt okunmuyor ve yazılmıyor.
            let built = Scenario.build(arguments[index + 1])
            state = built.state
            priceHistory = built.prices
            if let offline = arguments.firstIndex(of: "-liteOffline"), offline + 1 < arguments.count,
               let seconds = Double(arguments[offline + 1]) {
                applyOffline(seconds)
            }
            // L9: `-liteDeal order|vip|investor` fırsatla açılıyor; `-liteDealCaught` yakalanmış (uçuş donuk).
            state.deal = nil
            if let index = arguments.firstIndex(of: "-liteDeal"), index + 1 < arguments.count,
               let kind = DealKind(rawValue: arguments[index + 1]) {
                let selling = ChainId.allCases.filter { state[chain: $0].levels[2] > 0 }
                let chain: ChainId? = kind == .investor ? nil : (selling.contains(.coffee) ? .coffee : selling.first)
                state.deal = ActiveDeal(kind: kind, chain: chain, until: state.clock + LiteContent.dealLifetime * 0.7)
                state.deals = 9
                if arguments.contains("-liteDealCaught"), let deal = state.deal {
                    let reward = Lite.dealReward(state)
                    if case .success(let next) = Lite.catchDeal(state) {
                        state = next
                        lastCatch = DealCatch(id: 1, deal: deal, reward: reward, date: Date(), frozen: true)
                    }
                }
            }
        } else if let data = try? Data(contentsOf: saveURL),
                  let save = try? JSONDecoder().decode(SaveFile.self, from: data) {
            state = save.state
            priceHistory = save.priceHistory ?? []
            applyOffline(Date().timeIntervalSince(save.lastSeen))
        } else {
            state = Lite.newGame()
        }
        lastSampleClock = state.clock
        league.track(state)
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
        // Senaryo (CI kareleri) donuk: kare tam olarak kurulan anı göstersin.
        guard dt > 0, !isScenario else { return }
        let hadEvent = state.event != nil
        state = Lite.advance(state, dt)
        league.track(state)
        league.submitIfDue(state)
        if !hadEvent && state.event != nil { cue(.event) }
        samplePrice()
        sinceSave += dt
        if sinceSave >= 5 { save() }
    }

    /// Halka açıksa dakikada bir hisse fiyatı örneği.
    private func samplePrice() {
        guard state.listed, state.clock - lastSampleClock >= PriceHistory.interval else { return }
        lastSampleClock = state.clock
        priceHistory.append(Lite.sharePrice(state))
        if priceHistory.count > PriceHistory.limit { priceHistory.removeFirst(priceHistory.count - PriceHistory.limit) }
    }

    func scenePhaseChanged(_ phase: ScenePhase) {
        switch phase {
        case .active:
            LiteNotifications.cancelAll()
            if let away = backgroundAt {
                backgroundAt = nil
                applyOffline(Date().timeIntervalSince(away))
            }
            start()
        case .background:
            if backgroundAt == nil { backgroundAt = Date() }
            stop()
            save()
            let snapshot = state
            Task { await self.league.submit(snapshot) }
            if settings.notifications && !isScenario { LiteNotifications.schedule(for: state) }
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
        league.track(state)
        if state.listed { priceHistory.append(Lite.sharePrice(state)) }
        lastSampleClock = state.clock
        if result.earned > 0 {
            offlineReport = OfflineReport(earned: result.earned, seconds: result.seconds, cap: Lite.offlineCap(state))
        }
    }

    func save() {
        sinceSave = 0
        guard !isScenario else { return }
        league.persist()
        let file = SaveFile(state: state, lastSeen: Date(), priceHistory: priceHistory)
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
        let before = state[chain: chain].levels[stage.rawValue]
        switch Lite.buy(state, chain, stage, count(for: chain, stage)) {
        case .success(let next):
            state = next
            let after = state[chain: chain].levels[stage.rawValue]
            if Lite.milestonesReached(after) > Lite.milestonesReached(before) {
                triumphs += 1
                cue(.milestone)
            } else {
                purchases += 1
                cue(.buy)
            }
        case .failure:
            refusals += 1
            cue(.refuse)
        }
    }

    func buyManager() {
        if case .success(let next) = Lite.buyManager(state) {
            state = next
            purchases += 1
            cue(.buy)
        } else {
            refusals += 1
            cue(.refuse)
        }
    }

    func campaign() {
        if case .success(let next) = Lite.startCampaign(state) {
            state = next
            purchases += 1
            cue(.milestone)
        }
    }

    func chooseCouncil(_ choice: Int) {
        if case .success(let next) = Lite.chooseCouncil(state, choice) {
            state = next
            triumphs += 1
            cue(.reward)
        }
    }

    /// L9: şehirdeki fırsatı yakala.
    func catchDeal() {
        guard let deal = state.deal else { return }
        let reward = Lite.dealReward(state)
        guard case .success(let next) = Lite.catchDeal(state) else { return }
        state = next
        catches += 1
        lastCatch = DealCatch(id: catches, deal: deal, reward: reward, date: Date())
        triumphs += 1
        cue(deal.kind == .investor ? .fanfare : .reward)
    }

    func claimGoal() {
        if case .success(let next) = Lite.claimGoal(state) {
            state = next
            triumphs += 1
            cue(.reward)
        } else {
            refusals += 1
            cue(.refuse)
        }
    }

    func goPublic() {
        if case .success(let next) = Lite.goPublic(state) {
            state = next
            priceHistory = [Lite.sharePrice(state)]
            lastSampleClock = state.clock
            triumphs += 1
            cue(.fanfare)
            save()
        }
    }

    func sellCity() {
        if case .success(let next) = Lite.prestige(state) {
            state = next
            GameCenter.submit(stars: state.stars)
            priceHistory = []
            lastSampleClock = state.clock
            triumphs += 1
            cue(.fanfare)
            save()
        }
    }

    /// Bütün ilerlemeyi sil: yeni oyun, boş borsa.
    func resetGame() {
        state = Lite.newGame()
        league.track(state)
        priceHistory = []
        lastSampleClock = state.clock
        offlineReport = nil
        backgroundAt = nil
        save()
    }

    // MARK: - Ses ve bildirim

    private func cue(_ sound: SoundPlayer.Cue) {
        if settings.sound && !isScenario { self.sound.play(sound) }
    }

    /// Bildirim anahtarı: açarken izin iste; reddedildiyse kapalı kal.
    func setNotifications(_ on: Bool) async {
        settings.notificationsOffered = true
        guard on else {
            settings.notifications = false
            LiteNotifications.cancelAll()
            return
        }
        let status = await LiteNotifications.authorization()
        switch status {
        case .denied:
            settings.notificationsDenied = true
            settings.notifications = false
        case .notDetermined:
            let granted = await LiteNotifications.requestAuthorization()
            settings.notificationsDenied = !granted
            settings.notifications = granted
        default:
            settings.notificationsDenied = false
            settings.notifications = true
        }
    }

    /// Açılışta iznin hâlâ geçerli olduğunu doğrula (kullanıcı iPhone Ayarlar'ından kapatmış olabilir).
    func refreshNotificationStatus() async {
        guard !isScenario else { return }
        let status = await LiteNotifications.authorization()
        settings.notificationsDenied = status == .denied
        if status == .denied { settings.notifications = false }
    }
}
