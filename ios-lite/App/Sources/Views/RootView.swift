import SwiftUI
import CapitalForgeLiteKit

/// Tek ekran, dikey, tek el: üstte kasa ve kampanya, ortada şehir, altta
/// zincir kartları. Her şey başparmak menzilinde.
struct RootView: View {
    @Environment(GameStore.self) private var store
    @State private var confirmSell = false

    var body: some View {
        @Bindable var store = store
        VStack(spacing: 0) {
            HeaderView()
            CityView()
                .frame(height: 210)
                .overlay(alignment: .top) { EventBanner() }
                .overlay(alignment: .bottom) { Rectangle().fill(Theme.line).frame(height: 1) }
            ScrollView {
                VStack(spacing: 10) {
                    CouncilCard()
                    GoalCard()
                    BuyAmountPicker(selection: $store.buyAmount)
                    ForEach(ChainId.allCases, id: \.self) { chain in
                        ChainCard(chain: chain)
                    }
                    ManagerCard()
                    HoldingCard(confirm: $confirmSell)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
            }
        }
        .background(Theme.paper.ignoresSafeArea())
        .sensoryFeedback(.selection, trigger: store.purchases)
        .sensoryFeedback(.warning, trigger: store.refusals)
        .sheet(item: $store.offlineReport) { report in
            OfflineSheet(report: report)
                .presentationDetents([.height(280)])
        }
        .confirmationDialog(L10n.t("holding.confirm"), isPresented: $confirmSell, titleVisibility: .visible) {
            Button(L10n.t("holding.sell"), role: .destructive) { store.sellCity() }
            Button(L10n.t("common.cancel"), role: .cancel) {}
        } message: {
            Text(L10n.t("holding.confirmBody", Lite.prestigePreview(store.state)))
        }
    }
}

struct BuyAmountPicker: View {
    @Binding var selection: BuyAmount

    var body: some View {
        HStack(spacing: 0) {
            ForEach(BuyAmount.allCases) { amount in
                Button {
                    selection = amount
                } label: {
                    Text(label(amount))
                        .font(Theme.mono(13))
                        .frame(maxWidth: .infinity, minHeight: 34)
                        .foregroundStyle(selection == amount ? Theme.paper : Theme.ink)
                        .background(selection == amount ? Theme.ink : Theme.panel)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("buy-\(amount.rawValue)")
            }
        }
        .overlay(Rectangle().stroke(Theme.ink, lineWidth: 1))
    }

    private func label(_ amount: BuyAmount) -> String {
        switch amount {
        case .one: L10n.t("buy.one")
        case .ten: L10n.t("buy.ten")
        case .max: L10n.t("buy.max")
        }
    }
}
