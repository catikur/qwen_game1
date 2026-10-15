import Foundation
import CapitalForgeLiteKit

/// Ekran görüntüsü senaryoları: önerilen hamleyi oynayan bir bot şehri
/// belirli bir ana kadar getiriyor. CI'da simülatör `-liteScenario <ad>` ile
/// açılıyor; kayıt okunmuyor ve yazılmıyor.
enum Scenario {
    static func build(_ name: String) -> LiteState {
        switch name {
        case "start": return Lite.newGame()
        case "early": return play(seconds: 6 * 60)
        case "mid": return play(seconds: 70 * 60)
        case "late": return play(seconds: 4 * 3600)
        default: return Lite.newGame()
        }
    }

    private static func play(seconds: Int) -> LiteState {
        var state = Lite.newGame()
        for _ in 0..<seconds {
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
