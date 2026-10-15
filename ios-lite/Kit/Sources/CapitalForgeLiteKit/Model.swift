import Foundation

// CapitalForge Lite — oyun modeli.
//
// `packages/lite-model/src/model.ts`'in birebir çevirisi. Aynı işlemler aynı
// sırada (kayan nokta sonucu sıraya bağlı); döngüler sabit sırada
// (ChainId.allCases, Stage.allCases, EventKind.allCases), adımlar sabit
// uzunlukta, seçimler tamsayı aritmetiğiyle. Eşitliği `FixtureTests`
// koruyor: TS modelinin ürettiği altın değerleri burada yeniden üretmek zorunda.

public struct ChainState: Codable, Equatable, Sendable {
    /// Kademe seviyeleri: [ham, işleme, satış]; 0 = sahip değil.
    public var levels: [Int]
    /// Rakibin bu zincirdeki akışı (birim/sn).
    public var rival: Double

    public init(levels: [Int] = [0, 0, 0], rival: Double = 0) {
        self.levels = levels
        self.rival = rival
    }
}

public struct ActiveEvent: Codable, Equatable, Sendable {
    public var kind: EventKind
    /// Grevin vurduğu zincir; diğer olaylarda nil.
    public var chain: ChainId?
    public var until: Double
}

public struct ActivePolicy: Codable, Equatable, Sendable {
    public var kind: PolicyKind
    public var until: Double
}

public struct LiteState: Codable, Equatable, Sendable {
    public var version: Int = 1
    /// Kaçıncı şehir (0'dan).
    public var city: Int
    /// Holding Yıldızı: kalıcı gelir çarpanı.
    public var stars: Int
    public var cash: Double
    /// Bu şehirde ömür boyu kazanç.
    public var earned: Double
    /// Bütün şehirler boyunca kazanç.
    public var totalEarned: Double
    /// Bu şehirde geçen oyun zamanı (sn), çevrimdışı dahil.
    public var clock: Double
    /// Genel Müdür seviyesi.
    public var manager: Int
    public var campaignUntil: Double
    public var campaignReadyAt: Double
    /// Zincirler, `ChainId.allCases` sırasıyla.
    public var chains: [ChainState]
    // L3
    public var event: ActiveEvent?
    public var nextEventAt: Double = LiteContent.eventFirst
    public var events: Int = 0
    /// Açık meclis oturumu: hangi seçenek çifti.
    public var council: Int?
    public var nextCouncilAt: Double = LiteContent.councilFirst
    public var sessions: Int = 0
    public var policy: ActivePolicy?
    public var policies: Int = 0
    public var campaigns: Int = 0
    /// Görev merdiveninde sıradaki görev.
    public var goal: Int = 0
    // L4
    /// Şirket bu şehirde halka arz edildi mi.
    public var listed: Bool = false

    public subscript(chain id: ChainId) -> ChainState {
        get { chains[id.index] }
        set { chains[id.index] = newValue }
    }
}

extension LiteState {
    private enum CodingKeys: String, CodingKey {
        case version, city, stars, cash, earned, totalEarned, clock, manager, campaignUntil, campaignReadyAt, chains
        case event, nextEventAt, events, council, nextCouncilAt, sessions, policy, policies, campaigns, goal
        case listed
    }

    /// Eski kayıtlarda yeni alanlar yok: varsayılanla açılıyor. L2'de L3
    /// alanları, L3'te `listed` yok. L3 kaydında görev sırası halka arz
    /// görevinden sonrasını bir kaydırıyor (o görev L4'te araya girdi).
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        version = try c.decodeIfPresent(Int.self, forKey: .version) ?? 1
        city = try c.decode(Int.self, forKey: .city)
        stars = try c.decode(Int.self, forKey: .stars)
        cash = try c.decode(Double.self, forKey: .cash)
        earned = try c.decode(Double.self, forKey: .earned)
        totalEarned = try c.decode(Double.self, forKey: .totalEarned)
        clock = try c.decode(Double.self, forKey: .clock)
        manager = try c.decode(Int.self, forKey: .manager)
        campaignUntil = try c.decode(Double.self, forKey: .campaignUntil)
        campaignReadyAt = try c.decode(Double.self, forKey: .campaignReadyAt)
        chains = try c.decode([ChainState].self, forKey: .chains)
        event = try c.decodeIfPresent(ActiveEvent.self, forKey: .event)
        nextEventAt = try c.decodeIfPresent(Double.self, forKey: .nextEventAt) ?? clock + LiteContent.eventFirst
        events = try c.decodeIfPresent(Int.self, forKey: .events) ?? 0
        council = try c.decodeIfPresent(Int.self, forKey: .council)
        nextCouncilAt = try c.decodeIfPresent(Double.self, forKey: .nextCouncilAt) ?? clock + LiteContent.councilFirst
        sessions = try c.decodeIfPresent(Int.self, forKey: .sessions) ?? 0
        policy = try c.decodeIfPresent(ActivePolicy.self, forKey: .policy)
        policies = try c.decodeIfPresent(Int.self, forKey: .policies) ?? 0
        campaigns = try c.decodeIfPresent(Int.self, forKey: .campaigns) ?? 0
        goal = try c.decodeIfPresent(Int.self, forKey: .goal) ?? 0
        if let value = try c.decodeIfPresent(Bool.self, forKey: .listed) {
            listed = value
        } else {
            listed = false
            if goal >= LiteContent.goalIpoIndex { goal += 1 }
        }
    }
}

public struct ChainReport: Sendable {
    public let rates: [Double]
    public let sold: Double
    public let processed: Double
    public let integrated: Double
    public let margin: Double
    public let share: Double
    public let income: Double
    public let bottleneck: Stage
}

public struct Move: Equatable, Sendable {
    public let chain: ChainId
    public let stage: Stage
    public let cost: Double
    public let gain: Double
}

public enum ActionError: Error, Equatable, Sendable {
    case locked, cash, max, cooldown, none, unmet
}

public struct OfflineResult: Sendable {
    public let state: LiteState
    public let earned: Double
    public let seconds: Double
}

public enum Lite {
    public static let onlineStep = 1.0
    public static let offlineStep = 30.0
    /// Sınır toleransı: kayan nokta toplamı sınırın bir tık altında kalmasın.
    static let eps = 1e-9

    public static func newGame(city: Int = 0, stars: Int = 0, totalEarned: Double = 0) -> LiteState {
        LiteState(
            city: city,
            stars: stars,
            cash: LiteContent.startingCash,
            earned: 0,
            totalEarned: totalEarned,
            clock: 0,
            manager: 0,
            campaignUntil: 0,
            campaignReadyAt: 0,
            chains: ChainId.allCases.map { _ in ChainState() }
        )
    }

    // MARK: - Kademeler

    public static func milestonesReached(_ level: Int) -> Int {
        LiteContent.milestones.reduce(0) { $0 + (level >= $1 ? 1 : 0) }
    }

    public static func nextMilestone(_ level: Int) -> Int? {
        LiteContent.milestones.first { level < $0 }
    }

    /// Kademenin taban hızı (birim/sn): olay ve politika hariç.
    public static func stageRate(_ stage: Stage, _ level: Int) -> Double {
        if level <= 0 { return 0 }
        return LiteContent.baseRate[stage.rawValue] * Double(level) * pow(2.0, Double(milestonesReached(level)))
    }

    public static func upgradeCost(_ chain: ChainId, _ stage: Stage, _ level: Int, _ count: Int = 1) -> Double {
        let base = LiteContent.chain(chain).baseCost[stage.rawValue]
        let growth = LiteContent.costGrowth[stage.rawValue]
        return (base * pow(growth, Double(level)) * (pow(growth, Double(count)) - 1)) / (growth - 1)
    }

    public static func maxAffordable(_ cash: Double, _ chain: ChainId, _ stage: Stage, _ level: Int) -> Int {
        let base = LiteContent.chain(chain).baseCost[stage.rawValue]
        let growth = LiteContent.costGrowth[stage.rawValue]
        let first = base * pow(growth, Double(level))
        if cash < first { return 0 }
        var count = Int(floor(log((cash * (growth - 1)) / first + 1) / log(growth)))
        while count > 0 && upgradeCost(chain, stage, level, count) > cash { count -= 1 }
        while upgradeCost(chain, stage, level, count + 1) <= cash { count += 1 }
        return count
    }

    // MARK: - Açılış

    public static func districtUnlocked(_ state: LiteState, _ id: DistrictId) -> Bool {
        state.earned >= LiteContent.district(id).unlockAt
    }

    public static func chainUnlocked(_ state: LiteState, _ id: ChainId) -> Bool {
        let chain = LiteContent.chain(id)
        return districtUnlocked(state, chain.district) && state.earned >= chain.unlockAt
    }

    // MARK: - Olay ve politika etkileri

    static func eventIs(_ state: LiteState, _ kind: EventKind) -> Bool { state.event?.kind == kind }
    static func policyIs(_ state: LiteState, _ kind: PolicyKind) -> Bool { state.policy?.kind == kind }

    public static func campaignActive(_ state: LiteState) -> Bool {
        state.clock < state.campaignUntil
    }

    public static func campaignMultiplier(_ state: LiteState) -> Double {
        policyIs(state, .campaignFund) ? LiteContent.policyValue(.campaignFund) : LiteContent.campaignMultiplier
    }

    public static func incomeMultiplier(_ state: LiteState) -> Double {
        var multiplier = 1 + LiteContent.starBonus * Double(state.stars)
        for district in LiteContent.districts where state.earned >= district.unlockAt {
            multiplier *= district.incomeMultiplier
        }
        if campaignActive(state) { multiplier *= campaignMultiplier(state) }
        if eventIs(state, .exportBoom) { multiplier *= LiteContent.exportBoomMultiplier }
        if policyIs(state, .taxCut) { multiplier *= LiteContent.policyValue(.taxCut) }
        if policyIs(state, .exportFair) { multiplier *= LiteContent.policyValue(.exportFair) }
        return multiplier
    }

    /// Şehrin öne çıkan zinciri: ilk şehirde yok, sonra `cityFeatured` sırasıyla.
    public static func featuredChain(_ state: LiteState) -> ChainId? {
        if state.city < 1 { return nil }
        return LiteContent.cityFeatured[(state.city - 1) % LiteContent.cityFeatured.count]
    }

    public static func chainMultiplier(_ state: LiteState, _ chain: ChainId) -> Double {
        var multiplier = featuredChain(state) == chain ? LiteContent.cityBonus : 1.0
        let tourist = chain == .bakery || chain == .coffee
        if eventIs(state, .tourism) && tourist { multiplier *= LiteContent.tourismMultiplier }
        if eventIs(state, .fashionWeek) && chain == .fashion { multiplier *= LiteContent.fashionWeekMultiplier }
        if policyIs(state, .tourismPromo) && (tourist || chain == .fashion) { multiplier *= LiteContent.policyValue(.tourismPromo) }
        return multiplier
    }

    public static func stageMultiplier(_ state: LiteState, _ chain: ChainId, _ stage: Stage) -> Double {
        var multiplier = 1.0
        if stage == .retail, let event = state.event, event.kind == .strike, event.chain == chain {
            multiplier *= LiteContent.strikeMultiplier
        }
        if stage == .raw && policyIs(state, .industryGrant) { multiplier *= LiteContent.policyValue(.industryGrant) }
        if stage == .process && policyIs(state, .techGrant) { multiplier *= LiteContent.policyValue(.techGrant) }
        if stage == .retail && policyIs(state, .pedestrian) { multiplier *= LiteContent.policyValue(.pedestrian) }
        return multiplier
    }

    public static func effectiveRates(_ state: LiteState, _ chain: ChainId, _ levels: [Int]) -> [Double] {
        [
            stageRate(.raw, levels[0]) * stageMultiplier(state, chain, .raw),
            stageRate(.process, levels[1]) * stageMultiplier(state, chain, .process),
            stageRate(.retail, levels[2]) * stageMultiplier(state, chain, .retail),
        ]
    }

    static func margins(_ state: LiteState) -> (bought: Double, processed: Double, integrated: Double) {
        if eventIs(state, .crisis) {
            return (LiteContent.crisisBought, LiteContent.crisisProcessed, LiteContent.marginIntegrated)
        }
        return (LiteContent.marginBought, LiteContent.marginProcessed, LiteContent.marginIntegrated)
    }

    public static func rivalAggression(_ state: LiteState) -> Double {
        var aggression = LiteContent.rivalAggressionBase + LiteContent.rivalAggressionPerCity * Double(state.city)
        if eventIs(state, .rivalPush) { aggression *= LiteContent.rivalPushMultiplier }
        if policyIs(state, .competitionBoard) { aggression *= LiteContent.policyValue(.competitionBoard) }
        return aggression
    }

    // MARK: - Gelir

    static func shareOf(_ sold: Double, _ rival: Double) -> Double {
        if sold <= 0 { return 0 }
        return max(LiteContent.shareFloor, sold / (sold + rival))
    }

    static func marginUnits(_ rates: [Double], _ m: (bought: Double, processed: Double, integrated: Double))
        -> (sold: Double, processed: Double, integrated: Double, units: Double) {
        let sold = rates[2]
        let processed = min(sold, rates[1])
        let integrated = min(processed, rates[0])
        let units = integrated * m.integrated + (processed - integrated) * m.processed + (sold - processed) * m.bought
        return (sold, processed, integrated, units)
    }

    static func chainIncome(_ state: LiteState, _ chain: ChainId, _ levels: [Int], _ multiplier: Double) -> Double {
        let m = marginUnits(effectiveRates(state, chain, levels), margins(state))
        let share = shareOf(m.sold, state[chain: chain].rival)
        return LiteContent.chain(chain).price * m.units * share * multiplier * chainMultiplier(state, chain)
    }

    public static func chainReport(_ state: LiteState, _ chain: ChainId) -> ChainReport {
        let r = effectiveRates(state, chain, state[chain: chain].levels)
        let m = marginUnits(r, margins(state))
        let share = shareOf(m.sold, state[chain: chain].rival)
        let income = LiteContent.chain(chain).price * m.units * share * incomeMultiplier(state) * chainMultiplier(state, chain)
        return ChainReport(
            rates: r,
            sold: m.sold,
            processed: m.processed,
            integrated: m.integrated,
            margin: m.sold > 0 ? m.units / m.sold : 0,
            share: share,
            income: income,
            bottleneck: bottleneck(state, chain)
        )
    }

    public static func incomePerSecond(_ state: LiteState) -> Double {
        let multiplier = incomeMultiplier(state)
        var total = 0.0
        for id in ChainId.allCases { total += chainIncome(state, id, state[chain: id].levels, multiplier) }
        return total
    }

    /// Sürekli gelir: kampanya, olay ve politika olmadan. Halka arz değerlemesi buna bakıyor.
    public static func steadyIncome(_ state: LiteState) -> Double {
        var calm = state
        calm.event = nil
        calm.policy = nil
        calm.campaignUntil = calm.clock
        return incomePerSecond(calm)
    }

    public static func upgradeGain(_ state: LiteState, _ chain: ChainId, _ stage: Stage) -> Double {
        let multiplier = incomeMultiplier(state)
        let levels = state[chain: chain].levels
        let before = chainIncome(state, chain, levels, multiplier)
        var next = levels
        next[stage.rawValue] += 1
        return chainIncome(state, chain, next, multiplier) - before
    }

    public static func bottleneck(_ state: LiteState, _ chain: ChainId) -> Stage {
        let levels = state[chain: chain].levels
        if levels[2] == 0 { return .retail }
        var best = Stage.retail
        var bestRatio = -1.0
        for stage in Stage.allCases {
            let ratio = upgradeGain(state, chain, stage) / upgradeCost(chain, stage, levels[stage.rawValue])
            if ratio > bestRatio {
                bestRatio = ratio
                best = stage
            }
        }
        return best
    }

    public static func bestMove(_ state: LiteState) -> Move? {
        var best: Move?
        var bestRatio = -1.0
        for id in ChainId.allCases where chainUnlocked(state, id) {
            let levels = state[chain: id].levels
            for stage in Stage.allCases {
                let cost = upgradeCost(id, stage, levels[stage.rawValue])
                let gain = upgradeGain(state, id, stage)
                let ratio = gain / cost
                if gain > 0 && ratio > bestRatio {
                    bestRatio = ratio
                    best = Move(chain: id, stage: stage, cost: cost, gain: gain)
                }
            }
        }
        return best
    }

    // MARK: - Görevler

    public static func currentGoal(_ state: LiteState) -> GoalDef? {
        state.goal < LiteContent.goals.count ? LiteContent.goals[state.goal] : nil
    }

    public static func goalMet(_ state: LiteState, _ goal: GoalDef) -> Bool {
        let bakery = state[chain: .bakery].levels
        switch goal.kind {
        case .bakeryRetail: return bakery[2] >= 1
        case .bakeryProcess: return bakery[1] >= 1
        case .bakeryChain: return bakery[0] >= 1 && bakery[1] >= 1 && bakery[2] >= 1
        case .firstCampaign: return state.campaigns >= 1
        case .coffeeRetail: return state[chain: .coffee].levels[2] >= 1
        case .level25: return state.chains.contains { chain in chain.levels.contains { level in level >= 25 } }
        case .center: return districtUnlocked(state, .center)
        case .manager: return state.manager >= 1
        case .council: return state.policies >= 1
        case .share75:
            return ChainId.allCases.contains { state[chain: $0].levels[2] > 0 && chainReport(state, $0).share >= 0.75 }
        case .industry: return districtUnlocked(state, .industry)
        case .ipo: return state.listed
        case .port: return districtUnlocked(state, .port)
        case .technopark: return districtUnlocked(state, .technopark)
        case .firstStar: return prestigePreview(state) >= 1
        }
    }

    public static func goalReward(_ state: LiteState, _ goal: GoalDef) -> Double {
        max(goal.minReward, incomePerSecond(state) * goal.rewardSeconds)
    }

    // MARK: - Eylemler

    public static func buy(_ state: LiteState, _ chain: ChainId, _ stage: Stage, _ count: Int = 1) -> Result<LiteState, ActionError> {
        if !chainUnlocked(state, chain) { return .failure(.locked) }
        if count < 1 { return .failure(.cash) }
        let level = state[chain: chain].levels[stage.rawValue]
        let cost = upgradeCost(chain, stage, level, count)
        if cost > state.cash { return .failure(.cash) }
        var next = state
        next.cash -= cost
        next[chain: chain].levels[stage.rawValue] = level + count
        return .success(next)
    }

    public static func managerCost(_ level: Int) -> Double {
        LiteContent.managerBaseCost * pow(LiteContent.managerCostGrowth, Double(level))
    }

    public static func buyManager(_ state: LiteState) -> Result<LiteState, ActionError> {
        if state.manager >= LiteContent.managerMax { return .failure(.max) }
        let cost = managerCost(state.manager)
        if cost > state.cash { return .failure(.cash) }
        var next = state
        next.cash -= cost
        next.manager += 1
        return .success(next)
    }

    public static func startCampaign(_ state: LiteState) -> Result<LiteState, ActionError> {
        if state.clock < state.campaignReadyAt { return .failure(.cooldown) }
        var next = state
        next.campaignUntil = state.clock + LiteContent.campaignDuration
        next.campaignReadyAt = state.clock + LiteContent.campaignDuration + LiteContent.campaignCooldown
        next.campaigns += 1
        return .success(next)
    }

    /// Meclis kararı: açık oturumun iki seçeneğinden biri (0 ya da 1).
    public static func chooseCouncil(_ state: LiteState, _ choice: Int) -> Result<LiteState, ActionError> {
        guard let pair = state.council else { return .failure(.none) }
        var next = state
        next.policy = ActivePolicy(kind: LiteContent.councilPairs[pair][choice], until: state.clock + LiteContent.policyDuration)
        next.council = nil
        next.policies += 1
        return .success(next)
    }

    public static func claimGoal(_ state: LiteState) -> Result<LiteState, ActionError> {
        guard let goal = currentGoal(state) else { return .failure(.none) }
        if !goalMet(state, goal) { return .failure(.unmet) }
        let reward = goalReward(state, goal)
        var next = state
        next.cash += reward
        next.goal += 1
        return .success(next)
    }

    // MARK: - Halka arz

    public static func ipoUnlocked(_ state: LiteState) -> Bool {
        state.earned >= LiteContent.ipoUnlock
    }

    /// Şirket değeri: sürekli gelirin `ipoValuationSeconds` saniyesi.
    public static func companyValue(_ state: LiteState) -> Double {
        steadyIncome(state) * LiteContent.ipoValuationSeconds
    }

    /// Borsadaki hisse fiyatı.
    public static func sharePrice(_ state: LiteState) -> Double {
        companyValue(state) / LiteContent.ipoShares
    }

    /// Halka arzda kasaya girecek para.
    public static func ipoProceeds(_ state: LiteState) -> Double {
        companyValue(state) * LiteContent.ipoShare
    }

    /// Halka arz: hissenin `ipoShare`'i satılıyor, karşılığı kasaya. Şehirde bir kez.
    public static func goPublic(_ state: LiteState) -> Result<LiteState, ActionError> {
        if state.listed { return .failure(.max) }
        if !ipoUnlocked(state) { return .failure(.locked) }
        let proceeds = ipoProceeds(state)
        var next = state
        next.cash += proceeds
        next.listed = true
        return .success(next)
    }

    // MARK: - Zaman

    static func startEvent(_ state: inout LiteState) {
        let selling = ChainId.allCases.filter { state[chain: $0].levels[2] > 0 }
        let candidates = EventKind.allCases.filter { kind in
            switch kind {
            case .strike: return !selling.isEmpty
            case .fashionWeek: return state[chain: .fashion].levels[2] > 0
            case .exportBoom: return districtUnlocked(state, .port)
            default: return true
            }
        }
        let kind = candidates[(state.events * 7 + state.city * 3) % candidates.count]
        let chain: ChainId? = kind == .strike ? selling[(state.events * 5 + state.city) % selling.count] : nil
        state.event = ActiveEvent(kind: kind, chain: chain, until: state.clock + LiteContent.eventDuration)
        state.events += 1
        state.nextEventAt = state.clock + LiteContent.eventGap
    }

    static func openCouncil(_ state: inout LiteState) {
        state.council = state.sessions % LiteContent.councilPairs.count
        state.sessions += 1
        state.nextCouncilAt = state.clock + LiteContent.councilGap
    }

    static func applyBoundaries(_ state: inout LiteState, offline: Bool) {
        if let event = state.event, state.clock >= event.until - eps { state.event = nil }
        if let policy = state.policy, state.clock >= policy.until - eps { state.policy = nil }
        // Olay yalnızca oyuncu oradayken başlıyor; kapalıyken kaçan olay dönüşte başlıyor.
        if !offline && state.event == nil && state.clock >= state.nextEventAt - eps { startEvent(&state) }
        if state.clock >= state.nextCouncilAt - eps { openCouncil(&state) }
    }

    public static func advance(_ state: LiteState, _ seconds: Double, offline: Bool = false) -> LiteState {
        var next = state
        let step = offline ? offlineStep : onlineStep
        let lag = offline ? LiteContent.rivalLag * 2 : LiteContent.rivalLag
        var remaining = seconds
        while remaining > eps {
            applyBoundaries(&next, offline: offline)
            var h = min(step, remaining)
            var bounds = [next.campaignUntil, next.nextCouncilAt]
            if let event = next.event { bounds.append(event.until) } else if !offline { bounds.append(next.nextEventAt) }
            if let policy = next.policy { bounds.append(policy.until) }
            for bound in bounds where bound - next.clock > eps { h = min(h, bound - next.clock) }
            let income = incomePerSecond(next) * (offline ? LiteContent.offlineEfficiency : 1)
            next.cash += income * h
            next.earned += income * h
            next.totalEarned += income * h
            let pull = 1 - exp(-h / lag)
            let aggression = rivalAggression(next)
            for id in ChainId.allCases {
                let sold = effectiveRates(next, id, next[chain: id].levels)[2]
                next[chain: id].rival += (aggression * sold - next[chain: id].rival) * pull
            }
            next.clock += h
            remaining -= h
        }
        applyBoundaries(&next, offline: offline)
        return next
    }

    public static func offlineCap(_ state: LiteState) -> Double {
        LiteContent.offlineCapBase + LiteContent.offlineCapPerManager * Double(state.manager)
    }

    public static func applyOffline(_ state: LiteState, _ elapsed: Double) -> OfflineResult {
        let seconds = max(0, min(elapsed, offlineCap(state)))
        var base = state
        if base.campaignUntil > base.clock { base.campaignUntil = base.clock }
        let next = advance(base, seconds, offline: true)
        return OfflineResult(state: next, earned: next.cash - base.cash, seconds: seconds)
    }

    // MARK: - Holding

    /// Yıldız: halka açık şirket daha yüksek değerlemeyle satılıyor.
    public static func starsFor(_ earned: Double, listed: Bool = false) -> Int {
        let premium = listed ? LiteContent.listedStarMultiplier : 1.0
        return Int(floor(LiteContent.starScale * sqrt(max(0, earned) / LiteContent.starUnit) * premium))
    }

    public static func prestigePreview(_ state: LiteState) -> Int {
        starsFor(state.earned, listed: state.listed)
    }

    public static func prestige(_ state: LiteState) -> Result<LiteState, ActionError> {
        let gained = prestigePreview(state)
        if gained < 1 { return .failure(.locked) }
        return .success(newGame(city: state.city + 1, stars: state.stars + gained, totalEarned: state.totalEarned))
    }

    // MARK: - Bildirim

    /// Uygulama kapalı kalırsa rakip kaçıncı saniyede bir zincirde payını
    /// `overtakeShare`'in altına düşürüyor (yoksa nil). Yalnızca şu an önde
    /// olunan zincirler; `applyOffline` ile aynı koşullar, adımlar `offlineStep`.
    public static func firstOvertake(_ state: LiteState, _ horizon: Double) -> Double? {
        var current = state
        if current.campaignUntil > current.clock { current.campaignUntil = current.clock }
        let start = current
        let leading = ChainId.allCases.filter {
            start[chain: $0].levels[2] > 0 && chainReport(start, $0).share >= LiteContent.overtakeShare
        }
        if leading.isEmpty { return nil }
        var elapsed = 0.0
        while horizon - elapsed > eps {
            let h = min(offlineStep, horizon - elapsed)
            current = advance(current, h, offline: true)
            elapsed += h
            for id in leading where chainReport(current, id).share < LiteContent.overtakeShare { return elapsed }
        }
        return nil
    }
}
