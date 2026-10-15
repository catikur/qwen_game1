import Foundation

// CapitalForge Lite — içerik (zincirler, mahalleler, sabitler).
//
// TypeScript karşılığı `packages/lite-model/src/content.ts`. İkisi aynı
// sayıları taşımak ZORUNDA: denge orada ayarlanıyor, burada koşuyor.
// Fikstür testleri ayrışmayı yakalıyor ama sebebi en çok burada olur.

public enum ChainId: String, CaseIterable, Codable, Sendable {
    case bakery, coffee, fashion, leather, tech

    /// `LiteState.chains` dizisindeki yeri (sıra TS'teki CHAIN_IDS ile aynı).
    public var index: Int { ChainId.allCases.firstIndex(of: self)! }
}

public enum DistrictId: String, CaseIterable, Codable, Sendable {
    case bazaar, center, industry, port, technopark
}

/// Kademe: 0 ham, 1 işleme, 2 satış.
public enum Stage: Int, CaseIterable, Codable, Sendable {
    case raw = 0, process = 1, retail = 2
}

public struct ChainDef: Sendable {
    public let id: ChainId
    public let district: DistrictId
    /// Satılan birimin fiyatı (₺).
    public let price: Double
    /// Kademe başına ilk seviyenin maliyeti: [ham, işleme, satış].
    public let baseCost: [Double]
    /// Zincir şu ömür boyu kazançta açılıyor.
    public let unlockAt: Double
}

public struct DistrictDef: Sendable {
    public let id: DistrictId
    public let unlockAt: Double
    public let incomeMultiplier: Double
}

public enum LiteContent {
    public static let chains: [ChainDef] = [
        ChainDef(id: .bakery, district: .bazaar, price: 1, baseCost: [6, 8, 4], unlockAt: 0),
        ChainDef(id: .coffee, district: .bazaar, price: 14, baseCost: [84, 112, 56], unlockAt: 3_000),
        ChainDef(id: .fashion, district: .center, price: 200, baseCost: [1_200, 1_600, 800], unlockAt: 400_000),
        ChainDef(id: .leather, district: .industry, price: 3_000, baseCost: [18_000, 24_000, 12_000], unlockAt: 60_000_000),
        ChainDef(id: .tech, district: .technopark, price: 45_000, baseCost: [270_000, 360_000, 180_000], unlockAt: 9_000_000_000),
    ]

    public static let districts: [DistrictDef] = [
        DistrictDef(id: .bazaar, unlockAt: 0, incomeMultiplier: 1),
        DistrictDef(id: .center, unlockAt: 400_000, incomeMultiplier: 1),
        DistrictDef(id: .industry, unlockAt: 60_000_000, incomeMultiplier: 1),
        DistrictDef(id: .port, unlockAt: 1_500_000_000, incomeMultiplier: 1.5),
        DistrictDef(id: .technopark, unlockAt: 9_000_000_000, incomeMultiplier: 1),
    ]

    public static func chain(_ id: ChainId) -> ChainDef { chains[id.index] }

    public static func district(_ id: DistrictId) -> DistrictDef {
        districts.first { $0.id == id }!
    }

    /// İlk seviyenin hızı (birim/sn): [ham, işleme, satış].
    public static let baseRate: [Double] = [1.5, 1.2, 1]
    /// Seviye başına maliyet büyümesi: [ham, işleme, satış].
    public static let costGrowth: [Double] = [1.13, 1.15, 1.14]
    /// Bu seviyelerin her birinde kademenin hızı ikiye katlanıyor.
    public static let milestones: [Int] = [25, 50, 75, 100, 150, 200, 250, 300, 400, 500, 600, 800, 1000]

    /// Marj: pazardan alınan mal, kendi işlemen, tam entegrasyon.
    public static let marginBought = 0.2
    public static let marginProcessed = 0.55
    public static let marginIntegrated = 0.85

    public static let rivalAggressionBase = 0.6
    public static let rivalAggressionPerCity = 0.15
    public static let rivalLag = 600.0
    public static let shareFloor = 0.15

    public static let campaignMultiplier = 2.0
    public static let campaignDuration = 30.0
    public static let campaignCooldown = 180.0

    public static let offlineCapBase = 2.0 * 3600
    public static let offlineEfficiency = 0.5
    public static let offlineCapPerManager = 3600.0
    public static let managerMax = 10
    public static let managerBaseCost = 5_000.0
    public static let managerCostGrowth = 14.0

    public static let starBonus = 0.02
    public static let starScale = 1.0
    public static let starUnit = 1e9

    public static let startingCash = 10.0

    // MARK: - L3: olaylar

    public static let eventFirst = 240.0
    public static let eventGap = 330.0
    public static let eventDuration = 120.0
    public static let tourismMultiplier = 2.0
    public static let fashionWeekMultiplier = 2.5
    public static let exportBoomMultiplier = 1.5
    public static let strikeMultiplier = 0.5
    public static let rivalPushMultiplier = 1.6
    public static let crisisBought = 0.05
    public static let crisisProcessed = 0.4

    // MARK: - L3: meclis

    public static let councilPairs: [[PolicyKind]] = [
        [.industryGrant, .pedestrian],
        [.taxCut, .competitionBoard],
        [.techGrant, .tourismPromo],
        [.campaignFund, .exportFair],
    ]
    public static let councilFirst = 600.0
    public static let councilGap = 3600.0
    public static let policyDuration = 3600.0

    public static func policyValue(_ kind: PolicyKind) -> Double {
        switch kind {
        case .industryGrant: 1.3
        case .pedestrian: 1.2
        case .taxCut: 1.15
        case .competitionBoard: 0.6
        case .techGrant: 1.3
        case .tourismPromo: 1.25
        case .campaignFund: 3
        case .exportFair: 1.1
        }
    }

    // MARK: - L3: görevler

    public static let goals: [GoalDef] = [
        GoalDef(kind: .bakeryRetail, rewardSeconds: 30, minReward: 10),
        GoalDef(kind: .bakeryProcess, rewardSeconds: 30, minReward: 20),
        GoalDef(kind: .bakeryChain, rewardSeconds: 60, minReward: 40),
        GoalDef(kind: .firstCampaign, rewardSeconds: 45, minReward: 50),
        GoalDef(kind: .coffeeRetail, rewardSeconds: 60, minReward: 100),
        GoalDef(kind: .level25, rewardSeconds: 90, minReward: 200),
        GoalDef(kind: .center, rewardSeconds: 120, minReward: 1_000),
        GoalDef(kind: .manager, rewardSeconds: 120, minReward: 2_000),
        GoalDef(kind: .council, rewardSeconds: 120, minReward: 2_000),
        GoalDef(kind: .share75, rewardSeconds: 150, minReward: 5_000),
        GoalDef(kind: .industry, rewardSeconds: 180, minReward: 50_000),
        GoalDef(kind: .port, rewardSeconds: 240, minReward: 1_000_000),
        GoalDef(kind: .technopark, rewardSeconds: 300, minReward: 5_000_000),
        GoalDef(kind: .firstStar, rewardSeconds: 300, minReward: 10_000_000),
    ]
}

// MARK: - L3 türleri

/// Şehir olayı. Sıra TS'teki EVENT_KINDS ile aynı: seçim bu sırayla süzülüyor.
public enum EventKind: String, CaseIterable, Codable, Sendable {
    case tourism, crisis, strike, fashionWeek, exportBoom, rivalPush
}

/// Meclis politikası.
public enum PolicyKind: String, CaseIterable, Codable, Sendable {
    case industryGrant, pedestrian, taxCut, competitionBoard, techGrant, tourismPromo, campaignFund, exportFair
}

public enum GoalKind: String, CaseIterable, Codable, Sendable {
    case bakeryRetail, bakeryProcess, bakeryChain, firstCampaign, coffeeRetail, level25, center, manager, council,
         share75, industry, port, technopark, firstStar
}

public struct GoalDef: Sendable {
    public let kind: GoalKind
    public let rewardSeconds: Double
    public let minReward: Double
}
