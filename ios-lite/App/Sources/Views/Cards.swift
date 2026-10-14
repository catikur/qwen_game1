import SwiftUI
import CapitalForgeLiteKit

/// Genel Müdür: çevrimdışı kazanç tavanını uzatıyor.
struct ManagerCard: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        let state = store.state
        let maxed = state.manager >= Content.managerMax
        let cost = Lite.managerCost(state.manager)
        HStack(spacing: 12) {
            Image(systemName: "person.crop.square")
                .font(.system(size: 26))
                .foregroundStyle(Theme.ink)
            VStack(alignment: .leading, spacing: 2) {
                Text(L10n.t("manager.title") + " · " + L10n.t("stage.level", state.manager))
                    .font(Theme.sans(14, .bold))
                Text(L10n.t("manager.body", Format.duration(Lite.offlineCap(state))))
                    .font(Theme.mono(11))
                    .foregroundStyle(Theme.muted)
            }
            Spacer()
            Button {
                store.buyManager()
            } label: {
                Text(maxed ? L10n.t("manager.max") : Format.money(cost))
                    .font(Theme.mono(11, .bold))
                    .padding(.horizontal, 10)
                    .frame(minHeight: 32)
                    .foregroundStyle(!maxed && cost <= state.cash ? Theme.paper : Theme.muted)
                    .background(!maxed && cost <= state.cash ? Theme.ink : Theme.accentSoft)
            }
            .buttonStyle(.plain)
            .disabled(maxed)
            .accessibilityIdentifier("manager")
        }
        .padding(12)
        .ruled()
    }
}

/// Holding: şehri sat, yıldız kazan, yeni şehre geç.
struct HoldingCard: View {
    @Environment(GameStore.self) private var store
    @Binding var confirm: Bool

    var body: some View {
        let state = store.state
        let preview = Lite.prestigePreview(state)
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "building.columns")
                Text(L10n.t("holding.title")).font(Theme.sans(14, .bold))
                Spacer()
                Text(L10n.t("holding.stars", state.stars, state.stars * 2))
                    .font(Theme.mono(11, .semibold))
                    .foregroundStyle(Theme.money)
            }
            Text(L10n.t("holding.body"))
                .font(Theme.sans(12))
                .foregroundStyle(Theme.muted)
            Button {
                confirm = true
            } label: {
                Text(preview > 0 ? L10n.t("holding.sell") + " · " + L10n.t("holding.preview", preview) : L10n.t("holding.notYet"))
                    .font(Theme.mono(12, .bold))
                    .frame(maxWidth: .infinity, minHeight: 36)
                    .foregroundStyle(preview > 0 ? Theme.paper : Theme.muted)
                    .background(preview > 0 ? Theme.ink : Theme.accentSoft)
            }
            .buttonStyle(.plain)
            .disabled(preview < 1)
            .accessibilityIdentifier("holding")
        }
        .padding(12)
        .ruled()
    }
}

/// "Yokken kazandın" penceresi.
struct OfflineSheet: View {
    @Environment(GameStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let report: OfflineReport

    var body: some View {
        VStack(spacing: 14) {
            Text(L10n.t("offline.title").uppercased())
                .font(Theme.mono(12, .semibold))
                .tracking(1)
                .foregroundStyle(Theme.muted)
            Text("+" + Format.money(report.earned))
                .font(Theme.mono(34, .bold))
                .foregroundStyle(Theme.money)
            Text(L10n.t("offline.body", Format.duration(report.seconds)))
                .font(Theme.sans(14))
                .foregroundStyle(Theme.ink)
                .multilineTextAlignment(.center)
            Text(L10n.t("offline.cap", Format.duration(report.cap)))
                .font(Theme.mono(11))
                .foregroundStyle(Theme.muted)
            Button {
                dismiss()
            } label: {
                Text(L10n.t("offline.collect"))
                    .font(Theme.mono(14, .bold))
                    .frame(maxWidth: .infinity, minHeight: 46)
                    .foregroundStyle(Theme.paper)
                    .background(Theme.ink)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("offline-collect")
        }
        .padding(20)
        .background(Theme.paper)
    }
}
