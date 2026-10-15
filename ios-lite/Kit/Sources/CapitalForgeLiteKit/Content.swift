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
}
