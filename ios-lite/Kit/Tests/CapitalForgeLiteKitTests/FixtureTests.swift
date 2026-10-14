import Foundation
import XCTest
@testable import CapitalForgeLiteKit

/// TS modelinin (denge orada ayarlanıyor) ürettiği altın değerleri Swift
/// modeliyle yeniden üretir. Fikstür: `Fixtures/scenarios.json`
/// (`packages/lite-model/test/write-fixtures.ts`).
final class FixtureTests: XCTestCase {
    private var fixtures: [String: Any] = [:]

    override func setUpWithError() throws {
        let url = try XCTUnwrap(Bundle.module.url(forResource: "scenarios", withExtension: "json", subdirectory: "Fixtures"))
        let data = try Data(contentsOf: url)
        fixtures = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    /// Bağıl tolerans: iki dilin matematik kütüphaneleri son bitte ayrışabiliyor.
    private func close(_ a: Double, _ b: Double, _ what: @autoclosure () -> String, file: StaticString = #filePath, line: UInt = #line) {
        let scale = max(1, abs(a), abs(b))
        XCTAssertLessThanOrEqual(abs(a - b), 1e-9 * scale, "\(what()): Swift \(a) · TS \(b)", file: file, line: line)
    }

    private func num(_ value: Any?) -> Double { (value as? NSNumber)?.doubleValue ?? .nan }
    private func int(_ value: Any?) -> Int { (value as? NSNumber)?.intValue ?? Int.min }
    private func chain(_ value: Any?) -> ChainId { ChainId(rawValue: value as? String ?? "")! }
    private func stage(_ value: Any?) -> Stage { Stage(rawValue: int(value))! }

    func testStageRates() throws {
        let rows = try XCTUnwrap(fixtures["rates"] as? [[Any]])
        XCTAssertFalse(rows.isEmpty)
        for row in rows {
            close(Lite.stageRate(stage(row[0]), int(row[1])), num(row[2]), "hız \(row)")
        }
    }

    func testUpgradeCosts() throws {
        let rows = try XCTUnwrap(fixtures["costs"] as? [[Any]])
        for row in rows {
            close(Lite.upgradeCost(chain(row[0]), stage(row[1]), int(row[2]), int(row[3])), num(row[4]), "maliyet \(row)")
        }
    }

    func testMaxAffordable() throws {
        let rows = try XCTUnwrap(fixtures["affordable"] as? [[Any]])
        for row in rows {
            XCTAssertEqual(Lite.maxAffordable(num(row[0]), chain(row[1]), stage(row[2]), int(row[3])), int(row[4]), "alım \(row)")
        }
    }

    func testStarsAndManagerCosts() throws {
        for row in try XCTUnwrap(fixtures["stars"] as? [[Any]]) {
            XCTAssertEqual(Lite.starsFor(num(row[0])), int(row[1]), "yıldız \(row)")
        }
        for row in try XCTUnwrap(fixtures["managerCosts"] as? [[Any]]) {
            close(Lite.managerCost(int(row[0])), num(row[1]), "müdür \(row)")
        }
    }

    func testScenarios() throws {
        let scenarios = try XCTUnwrap(fixtures["scenarios"] as? [[String: Any]])
        XCTAssertEqual(scenarios.count, 3)
        for scenario in scenarios {
            try replay(scenario)
        }
    }

    private func replay(_ scenario: [String: Any]) throws {
        let name = scenario["name"] as? String ?? "?"
        let ops = try XCTUnwrap(scenario["ops"] as? [[String: Any]])
        let snapshots = try XCTUnwrap(scenario["snapshots"] as? [[String: Any]])
        var state = Lite.newGame()
        var played = 0
        for snapshot in snapshots {
            let target = int(snapshot["after"])
            while played < target {
                let op = ops[played]
                let (next, ok) = apply(state, op)
                XCTAssertEqual(ok, op["ok"] as? Bool, "\(name) adım \(played) \(op)")
                state = next
                played += 1
            }
            compare(state, snapshot, "\(name) @\(target)")
        }
    }

    private func apply(_ state: LiteState, _ op: [String: Any]) -> (LiteState, Bool) {
        func unwrap(_ result: Result<LiteState, ActionError>) -> (LiteState, Bool) {
            switch result {
            case .success(let next): return (next, true)
            case .failure: return (state, false)
            }
        }
        switch op["op"] as? String {
        case "buy": return unwrap(Lite.buy(state, chain(op["chain"]), stage(op["stage"]), int(op["count"])))
        case "advance": return (Lite.advance(state, num(op["seconds"])), true)
        case "offline": return (Lite.applyOffline(state, num(op["seconds"])).state, true)
        case "campaign": return unwrap(Lite.startCampaign(state))
        case "manager": return unwrap(Lite.buyManager(state))
        case "prestige": return unwrap(Lite.prestige(state))
        default:
            XCTFail("bilinmeyen adım \(op)")
            return (state, false)
        }
    }

    private func compare(_ state: LiteState, _ snapshot: [String: Any], _ label: String) {
        close(state.cash, num(snapshot["cash"]), "\(label) kasa")
        close(state.earned, num(snapshot["earned"]), "\(label) kazanç")
        close(state.totalEarned, num(snapshot["totalEarned"]), "\(label) toplam kazanç")
        close(state.clock, num(snapshot["clock"]), "\(label) saat")
        XCTAssertEqual(state.city, int(snapshot["city"]), "\(label) şehir")
        XCTAssertEqual(state.stars, int(snapshot["stars"]), "\(label) yıldız")
        XCTAssertEqual(state.manager, int(snapshot["manager"]), "\(label) müdür")
        let levels = (snapshot["levels"] as? [[NSNumber]])?.map { $0.map(\.intValue) } ?? []
        XCTAssertEqual(state.chains.map(\.levels), levels, "\(label) seviyeler")
        let rivals = (snapshot["rivals"] as? [NSNumber])?.map(\.doubleValue) ?? []
        for (index, rival) in rivals.enumerated() {
            close(state.chains[index].rival, rival, "\(label) rakip \(index)")
        }
        close(Lite.incomePerSecond(state), num(snapshot["income"]), "\(label) gelir")
        let move = Lite.bestMove(state)
        if let best = snapshot["best"] as? [String: Any] {
            XCTAssertEqual(move?.chain, chain(best["chain"]), "\(label) önerilen zincir")
            XCTAssertEqual(move?.stage, stage(best["stage"]), "\(label) önerilen kademe")
        } else {
            XCTAssertNil(move, "\(label) önerilen hamle olmamalı")
        }
    }
}
