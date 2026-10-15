import Foundation

// CapitalForge Lite — oyun modeli.
//
// `packages/lite-model/src/model.ts`'in birebir çevirisi. Aynı işlemler aynı
// sırada (kayan nokta sonucu sıraya bağlı); döngüler sabit sırada
// (ChainId.allCases, Stage.allCases), adımlar sabit uzunlukta. Eşitliği
// `FixtureTests` koruyor: TS modelinin ürettiği altın değerleri burada
// yeniden üretmek zorunda.

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

    public subscript(chain id: ChainId) -> ChainState {
        get { chains[id.index] }
        set { chains[id.index] = newValue }
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
    case locked, cash, max, cooldown
}

public struct OfflineResult: Sendable {
    public let state: LiteState
    public let earned: Double
    public let seconds: Double
}

public enum Lite {
    public static let onlineStep = 1.0
    public static let offlineStep = 30.0

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

    // MARK: - Gelir

    public static func campaignActive(_ state: LiteState) -> Bool {
        state.clock < state.campaignUntil
    }

    public static func incomeMultiplier(_ state: LiteState) -> Double {
        var multiplier = 1 + LiteContent.starBonus * Double(state.stars)
        for district in LiteContent.districts where state.earned >= district.unlockAt {
            multiplier *= district.incomeMultiplier
        }
        if campaignActive(state) { multiplier *= LiteContent.campaignMultiplier }
        return multiplier
    }

    static func shareOf(_ sold: Double, _ rival: Double) -> Double {
        if sold <= 0 { return 0 }
        return max(LiteContent.shareFloor, sold / (sold + rival))
    }

    static func marginUnits(_ rates: [Double]) -> (sold: Double, processed: Double, integrated: Double, units: Double) {
        let sold = rates[2]
        let processed = min(sold, rates[1])
        let integrated = min(processed, rates[0])
        let units = integrated * LiteContent.marginIntegrated + (processed - integrated) * LiteContent.marginProcessed
            + (sold - processed) * LiteContent.marginBought
        return (sold, processed, integrated, units)
    }

    static func rates(_ levels: [Int]) -> [Double] {
        [stageRate(.raw, levels[0]), stageRate(.process, levels[1]), stageRate(.retail, levels[2])]
    }

    static func chainIncome(_ state: LiteState, _ chain: ChainId, _ levels: [Int], _ multiplier: Double) -> Double {
        let m = marginUnits(rates(levels))
        let share = shareOf(m.sold, state[chain: chain].rival)
        return LiteContent.chain(chain).price * m.units * share * multiplier
    }

    public static func chainReport(_ state: LiteState, _ chain: ChainId) -> ChainReport {
        let r = rates(state[chain: chain].levels)
        let m = marginUnits(r)
        let share = shareOf(m.sold, state[chain: chain].rival)
        let income = LiteContent.chain(chain).price * m.units * share * incomeMultiplier(state)
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
        return .success(next)
    }

    // MARK: - Zaman

    public static func rivalAggression(_ city: Int) -> Double {
        LiteContent.rivalAggressionBase + LiteContent.rivalAggressionPerCity * Double(city)
    }

    public static func advance(_ state: LiteState, _ seconds: Double, offline: Bool = false) -> LiteState {
        var next = state
        let step = offline ? offlineStep : onlineStep
        let lag = offline ? LiteContent.rivalLag * 2 : LiteContent.rivalLag
        let aggression = rivalAggression(next.city)
        var remaining = seconds
        while remaining > 1e-9 {
            var h = min(step, remaining)
            if next.campaignUntil > next.clock { h = min(h, next.campaignUntil - next.clock) }
            let income = incomePerSecond(next) * (offline ? LiteContent.offlineEfficiency : 1)
            next.cash += income * h
            next.earned += income * h
            next.totalEarned += income * h
            let pull = 1 - exp(-h / lag)
            for index in next.chains.indices {
                let sold = stageRate(.retail, next.chains[index].levels[2])
                next.chains[index].rival += (aggression * sold - next.chains[index].rival) * pull
            }
            next.clock += h
            remaining -= h
        }
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

    public static func starsFor(_ earned: Double) -> Int {
        Int(floor(LiteContent.starScale * sqrt(max(0, earned) / LiteContent.starUnit)))
    }

    public static func prestigePreview(_ state: LiteState) -> Int {
        starsFor(state.earned)
    }

    public static func prestige(_ state: LiteState) -> Result<LiteState, ActionError> {
        let gained = prestigePreview(state)
        if gained < 1 { return .failure(.locked) }
        return .success(newGame(city: state.city + 1, stars: state.stars + gained, totalEarned: state.totalEarned))
    }
}
