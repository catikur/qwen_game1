import Foundation
import CapitalForgeLiteKit

/// İki dil: Türkçe (varsayılan) ve İngilizce. Cihaz dili Türkçe değilse İngilizce.
enum Lang: String {
    case tr, en

    static let current: Lang = {
        let code = Locale.preferredLanguages.first?.prefix(2) ?? "tr"
        return code == "tr" ? .tr : .en
    }()
}

enum L10n {
    static var lang: Lang = .current

    static func t(_ key: String, _ args: CVarArg...) -> String {
        let table = lang == .tr ? tr : en
        let format = table[key] ?? tr[key] ?? key
        return args.isEmpty ? format : String(format: format, arguments: args)
    }

    static func chainName(_ id: ChainId) -> String { t("chain.\(id.rawValue)") }

    static func stageName(_ chain: ChainId, _ stage: Stage) -> String {
        t("stage.\(chain.rawValue).\(stage.rawValue)")
    }

    static func stageRole(_ stage: Stage) -> String { t("role.\(stage.rawValue)") }

    static func districtName(_ id: DistrictId) -> String { t("district.\(id.rawValue)") }

    private static let tr: [String: String] = [
        "app.title": "CapitalForge Lite",
        "header.cash": "Kasa",
        "header.income": "%@/sn",
        "campaign.start": "Kampanya ×2",
        "campaign.active": "Kampanya %@",
        "campaign.wait": "Hazır: %@",
        "buy.one": "×1",
        "buy.ten": "×10",
        "buy.max": "En çok",
        "chain.bakery": "Fırın",
        "chain.coffee": "Kahve",
        "chain.fashion": "Moda",
        "chain.leather": "Deri",
        "chain.tech": "Teknoloji",
        "stage.bakery.0": "Buğday Tarlası",
        "stage.bakery.1": "Değirmen",
        "stage.bakery.2": "Fırın",
        "stage.coffee.0": "Kahve Bahçesi",
        "stage.coffee.1": "Kavurma",
        "stage.coffee.2": "Kafe",
        "stage.fashion.0": "Pamuk Tarlası",
        "stage.fashion.1": "Tekstil",
        "stage.fashion.2": "Butik",
        "stage.leather.0": "Besi Çiftliği",
        "stage.leather.1": "Tabakhane",
        "stage.leather.2": "Ayakkabıcı",
        "stage.tech.0": "Silisyum Ocağı",
        "stage.tech.1": "Çip Fabrikası",
        "stage.tech.2": "Elektronik",
        "role.0": "Ham",
        "role.1": "İşleme",
        "role.2": "Satış",
        "district.bazaar": "Çarşı",
        "district.center": "Merkez",
        "district.industry": "Sanayi",
        "district.port": "Liman",
        "district.technopark": "Teknopark",
        "chain.locked": "%@ kazançta açılıyor",
        "chain.margin": "Marj %%%@",
        "chain.share": "Pay %%%@",
        "chain.bottleneck": "Darboğaz",
        "chain.suggest": "Önerilen: %@",
        "chain.noRetail": "Satış olmadan para yok — önce %@",
        "stage.level": "Sv %ld",
        "stage.rate": "%@/sn",
        "stage.next": "%ld sv sonra ×2",
        "manager.title": "Genel Müdür",
        "manager.body": "Yokken kazanç tavanı: %@",
        "manager.max": "En üst seviye",
        "holding.title": "Holding",
        "holding.body": "Şehri sat, yeni şehre geç. Her yıldız gelire kalıcı +%2.",
        "holding.stars": "%ld yıldız · gelir +%%%ld",
        "holding.preview": "Şimdi satarsan +%ld yıldız",
        "holding.sell": "Şehri sat",
        "holding.notYet": "İlk yıldız 1 Mr ₺ kazançta",
        "holding.confirm": "Şehri satıp yeni şehre geçilsin mi?",
        "holding.confirmBody": "Kasa ve zincirler sıfırlanır; %ld yıldız kazanırsın.",
        "common.cancel": "Vazgeç",
        "offline.title": "Yokken kazandın",
        "offline.body": "%@ boyunca şirket çalıştı (gelirin yarısı).",
        "offline.cap": "Tavan: %@ — Genel Müdür tavanı uzatır.",
        "offline.collect": "Kasaya al",
        "city.label": "Şehir %ld",
        "district.lockedAt": "%@ kazançta",
        "port.bonus": "İhracat ×1,5",
    ]

    private static let en: [String: String] = [
        "app.title": "CapitalForge Lite",
        "header.cash": "Cash",
        "header.income": "%@/s",
        "campaign.start": "Campaign ×2",
        "campaign.active": "Campaign %@",
        "campaign.wait": "Ready in %@",
        "buy.one": "×1",
        "buy.ten": "×10",
        "buy.max": "Max",
        "chain.bakery": "Bakery",
        "chain.coffee": "Coffee",
        "chain.fashion": "Fashion",
        "chain.leather": "Leather",
        "chain.tech": "Tech",
        "stage.bakery.0": "Wheat Farm",
        "stage.bakery.1": "Flour Mill",
        "stage.bakery.2": "Bakery",
        "stage.coffee.0": "Coffee Estate",
        "stage.coffee.1": "Roastery",
        "stage.coffee.2": "Café",
        "stage.fashion.0": "Cotton Farm",
        "stage.fashion.1": "Textile Mill",
        "stage.fashion.2": "Boutique",
        "stage.leather.0": "Cattle Ranch",
        "stage.leather.1": "Tannery",
        "stage.leather.2": "Shoe Store",
        "stage.tech.0": "Silicon Mine",
        "stage.tech.1": "Chip Fab",
        "stage.tech.2": "Electronics",
        "role.0": "Raw",
        "role.1": "Process",
        "role.2": "Retail",
        "district.bazaar": "Bazaar",
        "district.center": "Center",
        "district.industry": "Industry",
        "district.port": "Port",
        "district.technopark": "Technopark",
        "chain.locked": "Unlocks at %@ earned",
        "chain.margin": "Margin %@%%",
        "chain.share": "Share %@%%",
        "chain.bottleneck": "Bottleneck",
        "chain.suggest": "Suggested: %@",
        "chain.noRetail": "No money without retail — start with %@",
        "stage.level": "Lv %ld",
        "stage.rate": "%@/s",
        "stage.next": "×2 in %ld lv",
        "manager.title": "General Manager",
        "manager.body": "Offline earnings cap: %@",
        "manager.max": "Max level",
        "holding.title": "Holding",
        "holding.body": "Sell the city, move to a new one. Each star: +2% income, forever.",
        "holding.stars": "%ld stars · income +%ld%%",
        "holding.preview": "Sell now for +%ld stars",
        "holding.sell": "Sell city",
        "holding.notYet": "First star at ₺1B earned",
        "holding.confirm": "Sell this city and move on?",
        "holding.confirmBody": "Cash and chains reset; you gain %ld stars.",
        "common.cancel": "Cancel",
        "offline.title": "While you were away",
        "offline.body": "Your company ran for %@ (half income).",
        "offline.cap": "Cap: %@ — the General Manager extends it.",
        "offline.collect": "Collect",
        "city.label": "City %ld",
        "district.lockedAt": "at %@ earned",
        "port.bonus": "Exports ×1.5",
    ]
}
