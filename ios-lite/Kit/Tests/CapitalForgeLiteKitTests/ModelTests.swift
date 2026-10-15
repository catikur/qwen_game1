import Foundation
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

    private func quiet(_ state: LiteState) -> LiteState {
        var s = state
        s.event = nil
        s.nextEventAt = 1e12
        s.policy = nil
        s.council = nil
        s.nextCouncilAt = 1e12
        return s
    }

    func testEventScheduleAndOfflineSkip() {
        var state = must(Lite.buy(rich(), .bakery, .retail, 5))
        state = Lite.advance(state, LiteContent.eventFirst)
        XCTAssertNotNil(state.event, "ilk olay başlamalı")
        XCTAssertEqual(state.event?.until, LiteContent.eventFirst + LiteContent.eventDuration)
        let away = Lite.applyOffline(must(Lite.buy(rich(), .bakery, .retail, 5)), 2000).state
        XCTAssertNil(away.event, "olay çevrimdışı başlamaz")
        XCTAssertEqual(away.events, 0)
    }

    func testCrisisSparesIntegratedChain() {
        var state = must(Lite.buy(rich(), .bakery, .retail, 5))
        state = must(Lite.buy(state, .bakery, .process, 40))
        state = must(Lite.buy(state, .bakery, .raw, 40))
        state = quiet(state)
        let calm = Lite.chainReport(state, .bakery).margin
        var crisis = state
        crisis.event = ActiveEvent(kind: .crisis, chain: nil, until: state.clock + 100)
        XCTAssertEqual(Lite.chainReport(crisis, .bakery).margin, calm, accuracy: 1e-12)
    }

    func testCouncilPolicyAndGoalLadder() {
        var state = quiet(must(Lite.buy(rich(), .bakery, .retail, 8)))
        state.council = 0
        let before = Lite.chainReport(state, .bakery).rates[2]
        state = must(Lite.chooseCouncil(state, 1))
        XCTAssertEqual(state.policy?.kind, .pedestrian)
        XCTAssertEqual(Lite.chainReport(state, .bakery).rates[2], before * 1.2, accuracy: 1e-9)
        let cash = state.cash
        let reward = Lite.goalReward(state, LiteContent.goals[0])
        state = must(Lite.claimGoal(state))
        XCTAssertEqual(state.goal, 1)
        XCTAssertEqual(state.cash, cash + reward, accuracy: 1e-9)
        if case .success = Lite.claimGoal(state) { XCTFail("değirmen şartı tutmadan ödül yok") }
    }

    func testOldSaveWithoutL3FieldsDecodes() throws {
        let old = #"{"version":1,"city":0,"stars":0,"cash":42,"earned":7,"totalEarned":7,"clock":100,"manager":0,"campaignUntil":0,"campaignReadyAt":0,"chains":[{"levels":[0,0,1],"rival":0},{"levels":[0,0,0],"rival":0},{"levels":[0,0,0],"rival":0},{"levels":[0,0,0],"rival":0},{"levels":[0,0,0],"rival":0}]}"#
        let state = try JSONDecoder().decode(LiteState.self, from: Data(old.utf8))
        XCTAssertEqual(state.cash, 42)
        XCTAssertEqual(state.goal, 0)
        XCTAssertNil(state.event)
        XCTAssertEqual(state.nextEventAt, 100 + LiteContent.eventFirst)
    }

    func testSaveRoundTrip() throws {
        let state = Lite.advance(must(Lite.buy(rich(), .bakery, .retail, 7)), 42)
        let data = try JSONEncoder().encode(state)
        XCTAssertEqual(try JSONDecoder().decode(LiteState.self, from: data), state)
    }
}
