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
        // Olay ve meclis takvimi uzağa: kural tek başına ölçülsün (3600. saniyede bir olay sürüyor).
        let state = quiet(Lite.advance(must(Lite.buy(rich(), .bakery, .retail, 10)), 3600))
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

    // MARK: - L9 fırsatlar

    func testDealsAppearOnScheduleAndPayIntoCash() throws {
        var state = must(Lite.buy(rich(), .bakery, .retail, 10))
        state = Lite.advance(state, LiteContent.dealFirst - 1)
        XCTAssertNil(state.deal)
        state = Lite.advance(state, 1)
        let deal = try XCTUnwrap(state.deal)
        XCTAssertEqual(deal.kind, LiteContent.dealPattern[0])
        XCTAssertEqual(deal.chain, .bakery)
        XCTAssertEqual(deal.until, LiteContent.dealFirst + LiteContent.dealLifetime, accuracy: 1e-9)
        let reward = Lite.dealReward(state)
        XCTAssertEqual(reward, max(LiteContent.dealMinReward, Lite.incomePerSecond(state) * LiteContent.dealRewardSeconds(.order)), accuracy: 1e-9)
        let caught = must(Lite.catchDeal(state))
        XCTAssertEqual(caught.cash, state.cash + reward, accuracy: 1e-9)
        XCTAssertEqual(caught.earned, state.earned, "fırsat ödülü kazanca sayılmıyor")
        XCTAssertNil(caught.deal)
        XCTAssertEqual(Lite.catchDeal(caught).failureValue, ActionError.none)
        // Yakalanmazsa süresi dolunca kayboluyor; kapalıyken yenisi çıkmıyor.
        XCTAssertNil(Lite.advance(state, LiteContent.dealLifetime).deal)
        let away = Lite.applyOffline(state, 3 * 3600).state
        XCTAssertNil(away.deal)
        XCTAssertEqual(away.deals, state.deals)
    }

    func testOldSaveGetsDealsSoon() throws {
        let l8 = #"{"version":1,"city":0,"stars":0,"cash":5,"earned":5,"totalEarned":5,"clock":900,"manager":0,"campaignUntil":0,"campaignReadyAt":0,"chains":[{"levels":[1,1,1],"rival":0},{"levels":[0,0,0],"rival":0},{"levels":[0,0,0],"rival":0},{"levels":[0,0,0],"rival":0},{"levels":[0,0,0],"rival":0}],"nextEventAt":1000,"events":2,"nextCouncilAt":1200,"sessions":1,"policies":0,"campaigns":0,"goal":3,"listed":false,"history":[]}"#
        let state = try JSONDecoder().decode(LiteState.self, from: Data(l8.utf8))
        XCTAssertNil(state.deal)
        XCTAssertEqual(state.deals, 0)
        XCTAssertEqual(state.nextDealAt, 900)
        XCTAssertNotNil(Lite.advance(state, 1).deal, "eski kayıtta ilk fırsat hemen")
    }

    func testSaveRoundTrip() throws {
        var state = Lite.advance(must(Lite.buy(rich(), .bakery, .retail, 7)), 42)
        state.listed = true
        state.goal = 13
        state.history = [CityRecord(stars: 9, listed: true, earned: 6.2e10)]
        state.deal = ActiveDeal(kind: .vip, chain: .bakery, until: 50)
        state.deals = 3
        let data = try JSONEncoder().encode(state)
        XCTAssertEqual(try JSONDecoder().decode(LiteState.self, from: data), state)
    }

    // MARK: - L4

    /// L3 kaydı: `listed` yok. Halka arz görevi araya girdiği için limandan
    /// sonraki görev sırası bir kayıyor; ondan öncekiler olduğu gibi.
    func testL3SaveShiftsGoalsAfterIpo() throws {
        func l3Save(goal: Int) -> String {
            #"{"version":1,"city":0,"stars":0,"cash":1,"earned":1,"totalEarned":1,"clock":1,"manager":0,"campaignUntil":0,"campaignReadyAt":0,"chains":[{"levels":[0,0,1],"rival":0},{"levels":[0,0,0],"rival":0},{"levels":[0,0,0],"rival":0},{"levels":[0,0,0],"rival":0},{"levels":[0,0,0],"rival":0}],"nextEventAt":240,"events":0,"nextCouncilAt":600,"sessions":0,"policies":0,"campaigns":0,"goal":\#(goal)}"#
        }
        XCTAssertEqual(LiteContent.goals[LiteContent.goalIpoIndex].kind, .ipo)
        let before = try JSONDecoder().decode(LiteState.self, from: Data(l3Save(goal: 10).utf8))
        XCTAssertEqual(before.goal, 10)
        XCTAssertFalse(before.listed)
        // L3'te 11. görev limandı; L4'te liman 12. sırada.
        let port = try JSONDecoder().decode(LiteState.self, from: Data(l3Save(goal: 11).utf8))
        XCTAssertEqual(LiteContent.goals[port.goal].kind, .port)
    }

    private func ipoReady() -> LiteState {
        var state = rich()
        state.cash = 1e9
        state.earned = LiteContent.ipoUnlock
        for id in [ChainId.bakery, .coffee] {
            for stage in Stage.allCases { state = must(Lite.buy(state, id, stage, 40)) }
        }
        return state
    }

    func testIpoOnceForSteadyValue() {
        var early = ipoReady()
        early.earned = LiteContent.ipoUnlock - 1
        XCTAssertEqual(Lite.goPublic(early).failureValue, .locked)

        let state = ipoReady()
        let expected = Lite.steadyIncome(state) * LiteContent.ipoValuationSeconds * LiteContent.ipoShare
        let listed = must(Lite.goPublic(state))
        XCTAssertEqual(listed.cash - state.cash, expected, accuracy: 1e-6 * expected)
        XCTAssertTrue(listed.listed)
        XCTAssertEqual(Lite.goPublic(listed).failureValue, .max)

        var boosted = must(Lite.startCampaign(state))
        boosted.policy = ActivePolicy(kind: .taxCut, until: boosted.clock + 60)
        XCTAssertGreaterThan(Lite.incomePerSecond(boosted), Lite.incomePerSecond(state) * 2)
        XCTAssertEqual(Lite.companyValue(boosted), Lite.companyValue(state))
    }

    func testListedCompanySellsForMoreStars() {
        var state = ipoReady()
        state.earned = 1e11
        XCTAssertEqual(Lite.prestigePreview(state), 10)
        let listed = must(Lite.goPublic(state))
        XCTAssertEqual(Lite.prestigePreview(listed), 12)
        let next = must(Lite.prestige(listed))
        XCTAssertEqual(next.stars, 12)
        XCTAssertFalse(next.listed)
        XCTAssertEqual(next.history, [CityRecord(stars: 12, listed: true, earned: 1e11)])
    }

    func testFeaturedChainRotates() {
        XCTAssertNil(Lite.featuredChain(Lite.newGame(city: 0)))
        XCTAssertEqual(Lite.featuredChain(Lite.newGame(city: 1)), .coffee)
        XCTAssertEqual(Lite.featuredChain(Lite.newGame(city: 5)), .bakery)
        XCTAssertEqual(Lite.featuredChain(Lite.newGame(city: 6)), .coffee)
        func build(_ city: Int) -> LiteState {
            var state = Lite.newGame(city: city)
            state.cash = 1e6
            state.earned = 1e5
            return must(Lite.buy(state, .coffee, .retail, 10))
        }
        XCTAssertEqual(Lite.chainReport(build(1), .coffee).income, Lite.chainReport(build(0), .coffee).income * 2)
    }

    func testOvertakeForecast() {
        func setup(_ city: Int, _ online: Double) -> LiteState {
            var state = Lite.newGame(city: city)
            state.cash = 1e7
            for stage in Stage.allCases { state = must(Lite.buy(state, .bakery, stage, 30)) }
            return Lite.advance(state, online)
        }
        XCTAssertNil(Lite.firstOvertake(setup(0, 300), 4 * 3600))
        let hard = setup(6, 120)
        let at = Lite.firstOvertake(hard, 2 * 3600)
        XCTAssertNotNil(at)
        if let at {
            XCTAssertLessThan(Lite.chainReport(Lite.applyOffline(hard, at).state, .bakery).share, 0.5)
            XCTAssertGreaterThanOrEqual(Lite.chainReport(Lite.applyOffline(hard, at - 30).state, .bakery).share, 0.5)
        }
        XCTAssertNil(Lite.firstOvertake(setup(6, 9_000), 2 * 3600))
    }

    // MARK: - L7

    func testStarCurveSoftensAfterThreshold() {
        XCTAssertEqual(Lite.starsFor(1e11), 10)
        XCTAssertEqual(Lite.starsFor(1.6e12), 20)
        XCTAssertEqual(Lite.starsFor(1e15), 100)
        XCTAssertEqual(Lite.starsFor(1e15, listed: true), 120)
        XCTAssertEqual(Lite.starsFor(LiteContent.starSoftFrom * 0.999999), 9)
        XCTAssertEqual(Lite.starsFor(LiteContent.starSoftFrom * 1.000001), 10)
    }

    func testIslandsUnlockInOrder() {
        var state = Lite.newGame()
        state.earned = LiteContent.energyUnlock - 1
        XCTAssertTrue(Lite.islandUnlocked(state, 0))
        XCTAssertFalse(Lite.islandUnlocked(state, 1))
        XCTAssertFalse(Lite.chainUnlocked(state, .energy))
        state.earned = LiteContent.energyUnlock
        XCTAssertTrue(Lite.chainUnlocked(state, .energy))
        XCTAssertFalse(Lite.chainUnlocked(state, .auto))
        state.earned = LiteContent.airUnlock
        XCTAssertTrue(Lite.chainUnlocked(state, .aviation))
        XCTAssertTrue(Lite.islandUnlocked(state, 3))
        XCTAssertEqual(ChainId.allCases.count, 8)
    }

    func testEnergyGridSpeedsUpOtherProcessing() {
        var state = Lite.newGame()
        state.earned = LiteContent.energyUnlock
        state.cash = 1e9
        state = must(Lite.buy(state, .bakery, .process, 10))
        state = must(Lite.buy(state, .energy, .retail, 1))
        state.cash = 1e9
        let before = Lite.chainReport(state, .bakery).rates[1]
        XCTAssertFalse(Lite.gridPowered(state))
        let gain = Lite.upgradeGain(state, .energy, .process)
        let powered = must(Lite.buy(state, .energy, .process, 1))
        XCTAssertTrue(Lite.gridPowered(powered))
        XCTAssertEqual(Lite.chainReport(powered, .bakery).rates[1], before * LiteContent.energyProcessing, accuracy: 1e-9)
        XCTAssertEqual(Lite.chainReport(powered, .energy).rates[1], Lite.stageRate(.process, 1))
        let actual = Lite.incomePerSecond(powered) - Lite.incomePerSecond(state)
        XCTAssertEqual(gain, actual, accuracy: 1e-9 * max(1, abs(actual)))
    }

    func testTradeRoutesTiersThemes() {
        XCTAssertEqual(Lite.tradeRoutes(0, .bakery), 0)
        XCTAssertEqual(Lite.tradeRoutes(1, .bakery), 1)
        XCTAssertEqual(Lite.tradeRoutes(6, .bakery), 2)
        XCTAssertEqual(Lite.tradeRoutes(6, .coffee), 1)
        XCTAssertEqual(Lite.tradeRoutes(13, .energy), 0)
        XCTAssertEqual([0, 1, 24, 25, 49, 50, 99, 100, 777].map(Lite.buildingTier), [0, 1, 1, 2, 2, 3, 3, 4, 4])
        XCTAssertEqual((0...4).map(Lite.cityTheme), [.coast, .mountain, .desert, .snow, .coast])
    }

    func testIslandGoalsAppendedAtEnd() {
        XCTAssertEqual(LiteContent.goalIpoIndex, 11)
        XCTAssertEqual(LiteContent.goals.suffix(4).map(\.kind), [.firstStar, .energyIsland, .autoIsland, .airIsland])
    }

    /// L6 kaydı: beş zincir, harita yok. Ada zincirleri boş tamamlanıyor.
    func testL6SaveGainsIslandChains() throws {
        let old = #"{"version":1,"city":2,"stars":5,"cash":1,"earned":1,"totalEarned":1,"clock":1,"manager":0,"campaignUntil":0,"campaignReadyAt":0,"chains":[{"levels":[3,2,1],"rival":0.5},{"levels":[0,0,0],"rival":0},{"levels":[0,0,0],"rival":0},{"levels":[0,0,0],"rival":0},{"levels":[0,0,0],"rival":0}],"nextEventAt":240,"events":0,"nextCouncilAt":600,"sessions":0,"policies":0,"campaigns":0,"goal":4,"listed":false}"#
        let state = try JSONDecoder().decode(LiteState.self, from: Data(old.utf8))
        XCTAssertEqual(state.chains.count, ChainId.allCases.count)
        XCTAssertEqual(state[chain: .bakery].levels, [3, 2, 1])
        XCTAssertEqual(state[chain: .aviation], ChainState())
        XCTAssertEqual(state.history, [])
        XCTAssertEqual(state.goal, 4)
    }
}

private extension Result {
    var failureValue: Failure? {
        if case .failure(let error) = self { return error }
        return nil
    }
}
