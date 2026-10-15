import XCTest
@testable import CapitalForgeLiteKit

/// Haftalık puan (uygulamada tutulan): artış, yıldız, ilk açılış, sıfırlama, hafta dönümü.
final class LeagueTrackerTests: XCTestCase {
    /// 2026-W43'ün başı (pazartesi 00:00 UTC), epoch saniye.
    private let monday = LiteLeague.weekStart("2026-W43")! / 1000

    func testGainIsStarFree() {
        var tracker = LeagueTracker(week: "2026-W43", score: 100, lastTotal: 1_000, lastAt: monday + 60)
        let rolled = tracker.track(totalEarned: 1_600, stars: 10, now: monday + 120)
        XCTAssertFalse(rolled)
        XCTAssertEqual(tracker.score, 100 + 600 / 1.2, accuracy: 1e-9)
        XCTAssertEqual(tracker.lastTotal, 1_600)
        XCTAssertEqual(tracker.lastAt, monday + 120)
    }

    func testFirstLaunchAndResetAddNothing() {
        // İlk açılış: geçmiş kazanç bu haftaya yazılmıyor.
        var fresh = LeagueTracker(week: "2026-W43", score: 0, lastTotal: -1)
        fresh.track(totalEarned: 5e9, stars: 0, now: monday + 10)
        XCTAssertEqual(fresh.score, 0)
        XCTAssertEqual(fresh.lastTotal, 5e9)
        // Oyunu sıfırlamak: toplam düşüyor, haftanın puanı yerinde.
        var reset = LeagueTracker(week: "2026-W43", score: 700, lastTotal: 5e9, lastAt: monday + 10)
        reset.track(totalEarned: 0, stars: 0, now: monday + 20)
        XCTAssertEqual(reset.score, 700)
        XCTAssertEqual(reset.lastTotal, 0)
    }

    func testRolloverKeepsNewWeekShareOfOfflineEarnings() {
        // Pazar 22:00'de kapattı, pazartesi 02:00'de açtı: dört saatin ikisi yeni haftada.
        var tracker = LeagueTracker(week: "2026-W42", score: 9_000, lastTotal: 1_000, lastAt: monday - 7_200)
        let rolled = tracker.track(totalEarned: 9_000, stars: 0, now: monday + 7_200)
        XCTAssertTrue(rolled)
        XCTAssertEqual(tracker.week, "2026-W43")
        XCTAssertEqual(tracker.score, 4_000, accuracy: 1e-9)
        XCTAssertEqual(tracker.lastTotal, 9_000)
    }

    func testRolloverWithoutLastSeenStartsAtZero() {
        // Eski kayıt (son görülme yok): eskisi gibi yeni hafta sıfırdan.
        var tracker = LeagueTracker(week: "2026-W42", score: 9_000, lastTotal: 1_000)
        let rolled = tracker.track(totalEarned: 9_000, stars: 0, now: monday + 7_200)
        XCTAssertTrue(rolled)
        XCTAssertEqual(tracker.score, 0)
    }

    func testOldSaveDecodes() throws {
        // L8 ilk sürümünün kaydı: lastAt alanı yok.
        let json = Data(#"{"week":"2026-W42","score":12.5,"lastTotal":300}"#.utf8)
        let tracker = try JSONDecoder().decode(LeagueTracker.self, from: json)
        XCTAssertEqual(tracker, LeagueTracker(week: "2026-W42", score: 12.5, lastTotal: 300))
        XCTAssertNil(tracker.lastAt)
    }
}
