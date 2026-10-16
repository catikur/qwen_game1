import Foundation

// CapitalForge Lite — içerik (zincirler, mahalleler, sabitler).
//
// TypeScript karşılığı `packages/lite-model/src/content.ts`. İkisi aynı
// sayıları taşımak ZORUNDA: denge orada ayarlanıyor, burada koşuyor.
// Fikstür testleri ayrışmayı yakalıyor ama sebebi en çok burada olur.

public enum ChainId: String, CaseIterable, Codable, Sendable {
    case bakery, coffee, fashion, leather, tech
    // L7: takımada.
    case energy, auto, aviation

    /// `LiteState.chains` dizisindeki yeri (sıra TS'teki CHAIN_IDS ile aynı).
    public var index: Int { ChainId.allCases.firstIndex(of: self)! }
}

public enum DistrictId: String, CaseIterable, Codable, Sendable {
    case bazaar, center, industry, port, technopark
    // L7: köprüyle bağlı adalar.
    case energyIsland, autoIsland, airIsland
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
    /// Hangi adada (L7): 0 ana ada, sonra köprüyle bağlı adalar.
    public let island: Int
}

/// Şehir teması (L7): her holding turu başka bir coğrafyada.
public enum CityTheme: String, CaseIterable, Codable, Sendable {
    case coast, mountain, desert, snow
}

public enum LiteContent {
    public static let chains: [ChainDef] = [
        ChainDef(id: .bakery, district: .bazaar, price: 1, baseCost: [6, 8, 4], unlockAt: 0),
        ChainDef(id: .coffee, district: .bazaar, price: 14, baseCost: [84, 112, 56], unlockAt: 3_000),
        ChainDef(id: .fashion, district: .center, price: 200, baseCost: [1_200, 1_600, 800], unlockAt: 400_000),
        ChainDef(id: .leather, district: .industry, price: 3_000, baseCost: [18_000, 24_000, 12_000], unlockAt: 60_000_000),
        ChainDef(id: .tech, district: .technopark, price: 45_000, baseCost: [270_000, 360_000, 180_000], unlockAt: 9_000_000_000),
        // L7: takımada. Her ada köprüyle bağlı, tek zincirli.
        ChainDef(id: .energy, district: .energyIsland, price: 700_000, baseCost: [4_200_000, 5_600_000, 2_800_000], unlockAt: energyUnlock),
        ChainDef(id: .auto, district: .autoIsland, price: 10_000_000, baseCost: [60_000_000, 80_000_000, 40_000_000], unlockAt: autoUnlock),
        ChainDef(id: .aviation, district: .airIsland, price: 150_000_000, baseCost: [900_000_000, 1_200_000_000, 600_000_000], unlockAt: airUnlock),
    ]

    public static let districts: [DistrictDef] = [
        DistrictDef(id: .bazaar, unlockAt: 0, incomeMultiplier: 1, island: 0),
        DistrictDef(id: .center, unlockAt: 400_000, incomeMultiplier: 1, island: 0),
        DistrictDef(id: .industry, unlockAt: 60_000_000, incomeMultiplier: 1, island: 0),
        DistrictDef(id: .port, unlockAt: 1_500_000_000, incomeMultiplier: 1.5, island: 0),
        DistrictDef(id: .technopark, unlockAt: 9_000_000_000, incomeMultiplier: 1, island: 0),
        DistrictDef(id: .energyIsland, unlockAt: energyUnlock, incomeMultiplier: 1, island: 1),
        DistrictDef(id: .autoIsland, unlockAt: autoUnlock, incomeMultiplier: 1, island: 2),
        DistrictDef(id: .airIsland, unlockAt: airUnlock, incomeMultiplier: 1, island: 3),
    ]

    // MARK: - L7: takımada

    /// Ada açılışları (ömür boyu kazanç).
    public static let energyUnlock = 80_000_000_000.0
    public static let autoUnlock = 1_500_000_000_000.0
    public static let airUnlock = 30_000_000_000_000.0
    /// Ada sayısı (ana ada dahil).
    public static let islandCount = 4

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
    /// L7: bu kazançtan sonra yıldız dördüncü kökle (√√) büyüyor; eğri kesintisiz.
    public static let starSoftFrom = 1e11

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
        GoalDef(kind: .ipo, rewardSeconds: 180, minReward: 500_000),
        GoalDef(kind: .port, rewardSeconds: 240, minReward: 1_000_000),
        GoalDef(kind: .technopark, rewardSeconds: 300, minReward: 5_000_000),
        GoalDef(kind: .firstStar, rewardSeconds: 300, minReward: 10_000_000),
        // L7: sona eklendi; eski kayıtların görev sırası kaymıyor.
        GoalDef(kind: .energyIsland, rewardSeconds: 300, minReward: 100_000_000),
        GoalDef(kind: .autoIsland, rewardSeconds: 360, minReward: 1_000_000_000),
        GoalDef(kind: .airIsland, rewardSeconds: 420, minReward: 10_000_000_000),
    ]

    /// L4'te eklenen "halka arz" görevinin sırası: L3 kayıtları bu sıradan sonrasını bir kaydırıyor.
    public static let goalIpoIndex = goals.firstIndex(where: { $0.kind == .ipo })!

    // MARK: - L4: halka arz

    /// Halka arz şu ömür boyu kazançta açılıyor.
    public static let ipoUnlock = 1_000_000_000.0
    /// Satılan hisse payı.
    public static let ipoShare = 0.25
    /// Şirket değeri: sürekli gelirin bu kadar saniyesi.
    public static let ipoValuationSeconds = 3600.0
    /// Borsadaki hisse adedi (fiyat = değer / adet).
    public static let ipoShares = 1_000_000.0
    /// Halka açık şirket satılırken kazanılan yıldıza çarpan.
    public static let listedStarMultiplier = 1.2

    // MARK: - L4: şehir bonusu

    /// İkinci şehirden başlayarak bu sırayla bir zincirin geliri ×2.
    public static let cityFeatured: [ChainId] = [.coffee, .fashion, .leather, .tech, .bakery]
    public static let cityBonus = 2.0

    // MARK: - L4: bildirim

    /// "Rakip seni geçti" eşiği: pay bunun altına inince.
    public static let overtakeShare = 0.5

    // MARK: - L7: enerji, ticaret yolu, görünüm

    /// Enerji şebekesi kurulunca (işleme seviyesi ≥ 1) diğer zincirlerde işleme hızı.
    public static let energyProcessing = 1.3
    /// Satılan her şehir öne çıkan zincirine (ilk şehirde fırın) kalıcı +%10 bırakıyor.
    public static let tradeRouteBonus = 0.1
    /// Bina kademeleri: dükkân → orta kat → kule → simge yapı.
    public static let buildingTiers: [Int] = [25, 50, 100]
    /// Şehir temaları sırası.
    public static let cityThemes: [CityTheme] = [.coast, .mountain, .desert, .snow]

    // L9: şehir fırsatları
    /// İlk fırsat bu saniyede; sonrakiler başlangıçtan başlangıca `dealGap` arayla, yalnızca oyuncu oradayken.
    public static let dealFirst = 150.0
    public static let dealGap = 100.0
    /// Fırsat bu kadar saniye duruyor; yakalanmazsa kayboluyor.
    public static let dealLifetime = 12.0
    /// Sıra: dört sipariş arasında bir ünlü müşteri, altıncıda yatırımcı.
    public static let dealPattern: [DealKind] = [.order, .order, .vip, .order, .order, .investor]
    /// Ödül: şirketin o anki gelirinin bu kadar saniyesi, kasaya (kazanca sayılmıyor).
    public static func dealRewardSeconds(_ kind: DealKind) -> Double {
        switch kind {
        case .order: 12
        case .vip: 30
        case .investor: 60
        }
    }
    public static let dealMinReward = 10.0
}

/// Şehir fırsatı (L9): bir binanın üstünde beliriyor, dokununca ödül kasaya.
public enum DealKind: String, CaseIterable, Codable, Sendable {
    /// Bir zincire toplu sipariş.
    case order
    /// Zincire gelen ünlü müşteri.
    case vip
    /// Bütün şirkete yatırımcı; seyrek.
    case investor
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
         share75, industry, ipo, port, technopark, firstStar,
         // L7
         energyIsland, autoIsland, airIsland
}

public struct GoalDef: Sendable {
    public let kind: GoalKind
    public let rewardSeconds: Double
    public let minReward: Double
}
