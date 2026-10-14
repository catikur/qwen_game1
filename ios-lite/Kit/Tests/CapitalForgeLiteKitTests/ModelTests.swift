import XCTest
@testable import CapitalForgeLiteKit

/// Modelin kuralları — TS tarafındaki `model.test.ts` ile aynı sözleşmeler.
final class ModelTests: XCTestCase {
    private func rich() -> LiteState {
        var state = Lite.newGame()
        state.cash = 1e6
        return state
    }

    private func must(_ result: Result<LiteState, ActionError>, file: StaticString = #filePath, line: UInt = #line) -> LiteState {
        switch result {
        case .success(let state): return state
        case .failure(let error):
            XCTFail("eylem başarısız: \(error)", file: file, line: line)
            return Lite.newGame()
        }
    }

    func testNewGameSuggestsBakeryRetail() {
        let state = Lite.newGame()
        XCTAssertEqual(state.cash, LiteContent.startingCash)
        XCTAssertEqual(Lite.incomePerSecond(state), 0)
        let move = Lite.bestMove(state)
        XCTAssertEqual(move?.chain, .bakery)
        XCTAssertEqual(move?.stage, .retail)
    }

    func testUpstreamNeverLowersIncome() {
        var state = must(Lite.buy(rich(), .bakery, .retail, 20))
        let sellingOnly = Lite.incomePerSecond(state)
        state = must(Lite.buy(state, .bakery, .process, 1))
        let withMill = Lite.incomePerSecond(state)
        state = must(Lite.buy(state, .bakery, .raw, 1))
        XCTAssertGreaterThan(withMill, sellingOnly)
        XCTAssertGreaterThan(Lite.incomePerSecond(state), withMill)
    }

    func testCampaignLastsExactly30Seconds() {
        var state = Lite.advance(must(Lite.buy(rich(), .bakery, .retail, 10)), 5)
        let base = Lite.incomePerSecond(state)
        state = must(Lite.startCampaign(state))
        XCTAssertEqual(Lite.incomePerSecond(state) / base, LiteContent.campaignMultiplier, accuracy: 1e-12)
        state = Lite.advance(state, LiteContent.campaignDuration - 1e-6)
        XCTAssertGreaterThan(Lite.incomePerSecond(state), base * 1.5)
        state = Lite.advance(state, 1e-3)
        XCTAssertLessThan(Lite.incomePerSecond(state), base * 1.5)
        if case .success = Lite.startCampaign(state) { XCTFail("bekleme dolmadan açılmamalı") }
    }

    func testOfflineIsCappedAndHalfRate() {
        let state = Lite.advance(must(Lite.buy(rich(), .bakery, .retail, 10)), 3600)
        let result = Lite.applyOffline(state, 10 * 3600)
        XCTAssertEqual(result.seconds, LiteContent.offlineCapBase)
        let ratio = (result.earned / result.seconds) / Lite.incomePerSecond(state)
        XCTAssertGreaterThan(ratio, 0.4)
        XCTAssertLessThan(ratio, 0.6)
    }

    func testSaveRoundTrip() throws {
        let state = Lite.advance(must(Lite.buy(rich(), .bakery, .retail, 7)), 42)
        let data = try JSONEncoder().encode(state)
        XCTAssertEqual(try JSONDecoder().decode(LiteState.self, from: data), state)
    }
}
