import SwiftUI
import CapitalForgeLiteKit

/// Kasa, saniyelik gelir ve kampanya düğmesi.
struct HeaderView: View {
    @Environment(GameStore.self) private var store
    @Binding var showSettings: Bool

    var body: some View {
        let state = store.state
        HStack(alignment: .center, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(label(state))
                    .font(Theme.mono(10, .medium))
                    .foregroundStyle(Theme.muted)
                    .tracking(0.8)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .accessibilityIdentifier("city-label")
                Text(Format.money(state.cash))
                    .font(Theme.mono(26, .bold))
                    .foregroundStyle(Theme.ink)
                    .contentTransition(.numericText())
                    .accessibilityIdentifier("cash")
                Text(L10n.t("header.income", Format.money(Lite.incomePerSecond(state))))
                    .font(Theme.mono(13))
                    .foregroundStyle(Theme.money)
            }
            Spacer(minLength: 6)
            Button {
                showSettings = true
            } label: {
                Image(systemName: "gearshape")
                    .font(.system(size: 18, weight: .medium))
                    .frame(width: 40, height: 56)
                    .foregroundStyle(Theme.ink)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(L10n.t("settings.title"))
            .accessibilityIdentifier("settings")
            CampaignButton()
        }
        .padding(.horizontal, 14)
        .padding(.top, 8)
        .padding(.bottom, 10)
        .background(Theme.panel)
        .overlay(alignment: .bottom) { Rectangle().fill(Theme.ink).frame(height: 1.5) }
    }

    /// "KASA · Şehir 2 · Kahve ×2": öne çıkan zincir ikinci şehirden itibaren.
    private func label(_ state: LiteState) -> String {
        var parts = [L10n.t("header.cash").uppercased(), L10n.t("city.label", state.city + 1)]
        if let featured = Lite.featuredChain(state) { parts.append(L10n.t("city.featured", L10n.chainName(featured))) }
        return parts.joined(separator: " · ")
    }
}

struct CampaignButton: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        let state = store.state
        let active = Lite.campaignActive(state)
        let ready = state.clock >= state.campaignReadyAt
        Button {
            store.campaign()
        } label: {
            VStack(spacing: 2) {
                Image(systemName: active ? "megaphone.fill" : "megaphone")
                    .font(.system(size: 18, weight: .semibold))
                Text(label(active: active, ready: ready, state: state))
                    .font(Theme.mono(10, .semibold))
                    .lineLimit(1)
            }
            .frame(width: 112, height: 56)
            .foregroundStyle(active || ready ? Theme.paper : Theme.muted)
            .background(active ? Theme.money : (ready ? Theme.ink : Theme.accentSoft))
        }
        .buttonStyle(.plain)
        .disabled(!ready)
        .accessibilityIdentifier("campaign")
    }

    private func label(active: Bool, ready: Bool, state: LiteState) -> String {
        if active { return L10n.t("campaign.active", Format.duration(state.campaignUntil - state.clock)) }
        if ready { return L10n.t("campaign.start", String(Int(Lite.campaignMultiplier(state)))) }
        return L10n.t("campaign.wait", Format.duration(state.campaignReadyAt - state.clock))
    }
}
