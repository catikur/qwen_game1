import SwiftUI
import CapitalForgeLiteKit

/// Kasa, saniyelik gelir, ayarlar ve kampanya düğmesi.
struct HeaderView: View {
    @Environment(GameStore.self) private var store
    @Binding var showSettings: Bool

    var body: some View {
        let state = store.state
        HStack(alignment: .center, spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(L10n.t("header.cash").uppercased(with: L10n.locale) + " · " + L10n.t("city.label", state.city + 1).uppercased(with: L10n.locale))
                        .font(Theme.caps(11))
                        .tracking(0.5)
                        .foregroundStyle(Theme.muted)
                        .lineLimit(1)
                    if let featured = Lite.featuredChain(state) {
                        FeaturedChip(chain: featured)
                    }
                }
                .accessibilityIdentifier("city-label")
                HStack(spacing: 8) {
                    Coin(size: 30)
                    Text(Format.money(state.cash))
                        .font(Theme.display(34))
                        .foregroundStyle(Theme.ink)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                        .contentTransition(.numericText())
                        .accessibilityIdentifier("cash")
                }
                HStack(spacing: 5) {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 9, weight: .black))
                        .foregroundStyle(.white)
                        .frame(width: 16, height: 16)
                        .background(Theme.money, in: Circle())
                    Text(L10n.t("header.income", Format.money(Lite.incomePerSecond(state))))
                        .font(Theme.display(14.5))
                        .foregroundStyle(Theme.money)
                }
            }
            Spacer(minLength: 4)
            Button {
                showSettings = true
            } label: {
                Image(systemName: "gearshape.fill")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(Theme.ink)
                    .frame(width: 44, height: 44)
                    .background(Theme.card, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
                    .background(RoundedRectangle(cornerRadius: 15, style: .continuous).fill(Theme.trackEdge).offset(y: 3))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(L10n.t("settings.title"))
            .accessibilityIdentifier("settings")
            CampaignButton()
        }
        .padding(.horizontal, 16)
        .padding(.top, 4)
        .padding(.bottom, 10)
    }
}

/// "Kahve ×2": ikinci şehirden itibaren öne çıkan zincir.
struct FeaturedChip: View {
    let chain: ChainId

    var body: some View {
        let colors = Theme.chainColors(chain)
        HStack(spacing: 4) {
            RoundedRectangle(cornerRadius: 4, style: .continuous)
                .fill(LinearGradient(colors: [colors.0, colors.1], startPoint: .top, endPoint: .bottom))
                .frame(width: 12, height: 12)
            Text(L10n.t("city.featured", L10n.chainName(chain)))
                .font(Theme.text(11, .heavy))
                .foregroundStyle(Theme.ink)
        }
        .padding(.leading, 5)
        .padding(.trailing, 8)
        .padding(.vertical, 2)
        .background(Theme.card, in: Capsule())
        .overlay(Capsule().strokeBorder(Theme.cardBorder, lineWidth: 1))
        .lineLimit(1)
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
            VStack(spacing: 1) {
                Image(systemName: active ? "megaphone.fill" : "megaphone")
                    .font(.system(size: 17, weight: .bold))
                Text(title(active: active, ready: ready, state: state))
                    .font(Theme.display(14))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Text(subtitle(active: active, ready: ready, state: state))
                    .font(Theme.caps(9.5))
                    .tracking(0.4)
                    .opacity(0.85)
            }
            .frame(width: 116, height: 58)
        }
        .buttonStyle(.glossy(active ? Theme.green : (ready ? Theme.orange : nil), radius: 19, edge: 5))
        .disabled(!ready && !active)
        .accessibilityIdentifier("campaign")
    }

    private func title(active: Bool, ready: Bool, state: LiteState) -> String {
        if active { return L10n.t("campaign.active", Format.duration(state.campaignUntil - state.clock)) }
        return L10n.t("campaign.start", String(Int(Lite.campaignMultiplier(state))))
    }

    private func subtitle(active: Bool, ready: Bool, state: LiteState) -> String {
        if active { return L10n.t("campaign.running").uppercased(with: L10n.locale) }
        if ready { return Format.duration(LiteContent.campaignDuration).uppercased(with: L10n.locale) }
        return L10n.t("campaign.wait", Format.duration(state.campaignReadyAt - state.clock)).uppercased(with: L10n.locale)
    }
}
