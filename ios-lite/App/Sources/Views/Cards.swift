import SwiftUI
import CapitalForgeLiteKit

/// Genel Müdür: çevrimdışı kazanç tavanını uzatıyor.
struct ManagerCard: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        let state = store.state
        let maxed = state.manager >= LiteContent.managerMax
        let cost = Lite.managerCost(state.manager)
        HStack(spacing: 11) {
            IconTile(symbol: "person.crop.circle.fill.badge.checkmark", colors: (Color(hex: 0x9FA8FF), Color(hex: 0x6C78F0)), size: 38)
            VStack(alignment: .leading, spacing: 1) {
                Text(L10n.t("manager.title") + " · " + L10n.t("stage.level", state.manager))
                    .font(Theme.display(16))
                    .foregroundStyle(Theme.ink)
                Text(L10n.t("manager.body", Format.duration(Lite.offlineCap(state))))
                    .font(Theme.text(11.5))
                    .foregroundStyle(Theme.muted)
            }
            Spacer(minLength: 6)
            Button {
                store.buyManager()
            } label: {
                Text(maxed ? L10n.t("manager.max") : Format.money(cost))
                    .font(Theme.display(13.5))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .padding(.horizontal, 12)
                    .frame(minHeight: 38)
            }
            .buttonStyle(.glossy(!maxed && cost <= state.cash ? Theme.orange : nil, radius: 14))
            .disabled(maxed)
            .accessibilityIdentifier("manager")
        }
        .glassCard()
    }
}

/// Holding: şehri sat, yıldız kazan, yeni şehre geç. L7: satılan şehir
/// haritaya geçiyor ve öne çıkan zincirine ticaret yolu bırakıyor.
struct HoldingCard: View {
    @Environment(GameStore.self) private var store
    @Binding var confirm: Bool
    @Binding var showMap: Bool

    var body: some View {
        let state = store.state
        let preview = Lite.prestigePreview(state)
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 10) {
                IconTile(symbol: "building.2.fill", colors: (Color(hex: 0xFFE08A), Color(hex: 0xFFB938)), size: 34)
                Text(L10n.t("holding.title")).font(Theme.display(18)).foregroundStyle(Theme.ink)
                Spacer()
                Button {
                    showMap = true
                } label: {
                    Label(L10n.t("map.open"), systemImage: "map.fill")
                        .font(Theme.display(12.5))
                        .padding(.horizontal, 10)
                        .frame(minHeight: 30)
                }
                .buttonStyle(.glossy(Theme.blue, radius: 11, edge: 3))
                .accessibilityIdentifier("holding-map")
                HStack(spacing: 3) {
                    Image(systemName: "star.fill").font(.system(size: 11, weight: .bold)).foregroundStyle(Color(hex: 0xFFB938))
                    Text(L10n.t("holding.stars", state.stars, state.stars * 2))
                        .font(Theme.text(11.5, .heavy))
                        .foregroundStyle(Theme.money)
                }
            }
            Text(L10n.t("holding.body"))
                .font(Theme.text(12))
                .foregroundStyle(Theme.muted)
            if let next = Lite.featuredChain(Lite.newGame(city: state.city + 1)) {
                Text(L10n.t("holding.theme", L10n.t("theme.\(Lite.cityTheme(state.city + 1).rawValue)")) + " · " + L10n.t("holding.next", L10n.chainName(next)))
                    .font(Theme.text(11.5, .heavy))
                    .foregroundStyle(Theme.ink)
            }
            Text(L10n.t("holding.route", L10n.chainName(Lite.tradeRouteChain(state.city))))
                .font(Theme.text(11.5))
                .foregroundStyle(Theme.muted)
            Button {
                confirm = true
            } label: {
                Text(preview > 0 ? L10n.t("holding.sell") + " · " + L10n.t("holding.preview", preview) : L10n.t("holding.notYet"))
                    .font(Theme.display(14.5))
                    .frame(maxWidth: .infinity, minHeight: 42)
            }
            .buttonStyle(.glossy(preview > 0 ? Theme.gold : nil, radius: 15, foreground: Color(hex: 0x5A3A00)))
            .disabled(preview < 1)
            .accessibilityIdentifier("holding")
        }
        .glassCard()
    }
}

/// "Yokken kazandın" penceresi.
struct OfflineSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    let report: OfflineReport

    var body: some View {
        VStack(spacing: 12) {
            Coin(size: 46)
            Text(L10n.t("offline.title").uppercased(with: L10n.locale))
                .font(Theme.caps(12))
                .tracking(1)
                .foregroundStyle(Theme.muted)
            Text("+" + Format.money(report.earned))
                .font(Theme.display(36))
                .foregroundStyle(Theme.money)
            Text(L10n.t("offline.body", Format.duration(report.seconds)))
                .font(Theme.text(14, .semibold))
                .foregroundStyle(Theme.ink)
                .multilineTextAlignment(.center)
            Text(L10n.t("offline.cap", Format.duration(report.cap)))
                .font(Theme.text(11.5))
                .foregroundStyle(Theme.muted)
            Button {
                dismiss()
            } label: {
                Text(L10n.t("offline.collect"))
                    .font(Theme.display(17))
                    .frame(maxWidth: .infinity, minHeight: 50)
            }
            .buttonStyle(.glossy(Theme.green, radius: 17, edge: 5))
            .accessibilityIdentifier("offline-collect")
        }
        .padding(.horizontal, 20)
        .padding(.top, 26)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }
}
