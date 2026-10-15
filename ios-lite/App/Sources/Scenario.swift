import Foundation
import CapitalForgeLiteKit

/// Ekran görüntüsü senaryoları: önerilen hamleyi oynayan bir bot şehri
/// belirli bir ana kadar getiriyor. CI'da simülatör `-liteScenario <ad>` ile
/// açılıyor; kayıt okunmuyor ve yazılmıyor.
enum Scenario {
    static func build(_ name: String) -> LiteState {
        switch name {
        case "start": return Lite.newGame()
        case "early": return play(seconds: 5 * 60)
        case "mid": return play(seconds: 70 * 60)
        case "late": return play(seconds: 4 * 3600)
        // Meclis oturumu açık (ilk oturum 10. dakikada), karar bekliyor.
        case "council": return play(seconds: 11 * 60, decideCouncil: false)
        default: return Lite.newGame()
        }
    }

    private static func play(seconds: Int, decideCouncil: Bool = true) -> LiteState {
        var state = Lite.newGame()
        for _ in 0..<seconds {
            // Görev tuttukça ödülü al; mecliste o an daha çok kazandıranı seç.
            while case .success(let next) = Lite.claimGoal(state) { state = next }
            if decideCouncil, state.council != nil,
               case .success(let a) = Lite.chooseCouncil(state, 0),
               case .success(let b) = Lite.chooseCouncil(state, 1) {
                state = Lite.incomePerSecond(a) >= Lite.incomePerSecond(b) ? a : b
            }
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
        }
        // Görüntüde kampanya sayacı kafa karıştırmasın: senaryo kampanyasız bitiyor.
        state.campaignUntil = state.clock
        state.campaignReadyAt = state.clock
        return state
    }
}
