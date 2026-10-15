import Foundation
import CapitalForgeLiteKit

/// Ekran görüntüsü senaryoları: önerilen hamleyi oynayan bir bot şehri
/// belirli bir ana kadar getiriyor. CI'da simülatör `-liteScenario <ad>` ile
/// açılıyor; kayıt okunmuyor ve yazılmıyor, saat donuk.
enum Scenario {
    struct Built {
        var state: LiteState
        /// Halka arzdan beri hisse fiyatı (borsa grafiği).
        var prices: [Double] = []
    }

    static func build(_ name: String) -> Built {
        switch name {
        case "start": return Built(state: Lite.newGame())
        case "early": return play(seconds: 5 * 60)
        case "mid": return play(seconds: 70 * 60)
        case "late": return play(seconds: 4 * 3600)
        // Meclis oturumu açık (ilk oturum 10. dakikada), karar bekliyor.
        case "council": return play(seconds: 11 * 60, decideCouncil: false)
        // Halka arz açık (1 Mr ₺ kazanç), henüz yapılmadı.
        case "ipo": return play(seconds: 85 * 60, goPublic: false)
        // Halka arzdan bir saat sonra: borsa kartı grafikle.
        case "listed": return play(seconds: 2 * 3600 + 20 * 60)
        // Şehir satıldı, ikinci şehirde 20 dakika: yıldızlar ve öne çıkan zincir.
        case "city2":
            let first = play(seconds: 4 * 3600)
            guard case .success(let next) = Lite.prestige(first.state) else { return first }
            return play(seconds: 20 * 60, from: next)
        default: return Built(state: Lite.newGame())
        }
    }

    private static func play(
        seconds: Int,
        from start: LiteState = Lite.newGame(),
        decideCouncil: Bool = true,
        goPublic: Bool = true
    ) -> Built {
        var state = start
        var prices: [Double] = []
        for second in 0..<seconds {
            // Görev tuttukça ödülü al; mecliste o an daha çok kazandıranı seç.
            while case .success(let next) = Lite.claimGoal(state) { state = next }
            if decideCouncil, state.council != nil,
               case .success(let a) = Lite.chooseCouncil(state, 0),
               case .success(let b) = Lite.chooseCouncil(state, 1) {
                state = Lite.incomePerSecond(a) >= Lite.incomePerSecond(b) ? a : b
            }
            if goPublic, !state.listed, case .success(let next) = Lite.goPublic(state) { state = next }
            if case .success(let next) = Lite.startCampaign(state) { state = next }
            if Lite.managerCost(state.manager) < Lite.incomePerSecond(state) * 120,
               case .success(let next) = Lite.buyManager(state) {
                state = next
            }
            for _ in 0..<60 {
                guard let move = Lite.bestMove(state), move.cost <= state.cash,
                      case .success(let next) = Lite.buy(state, move.chain, move.stage, 1) else { break }
                state = next
            }
            state = Lite.advance(state, 1)
            // Borsa grafiği: uygulamadaki gibi dakikada bir örnek, son iki saat.
            if state.listed && second % Int(PriceHistory.interval) == 0 {
                prices.append(Lite.sharePrice(state))
                if prices.count > PriceHistory.limit { prices.removeFirst() }
            }
        }
        // Görüntüde kampanya sayacı kafa karıştırmasın: senaryo kampanyasız bitiyor.
        state.campaignUntil = state.clock
        state.campaignReadyAt = state.clock
        return Built(state: state, prices: prices)
    }
}
