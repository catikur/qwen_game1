import SwiftUI
import CapitalForgeLiteKit

/// Tek ekran, dikey, tek el: üstte kasa ve kampanya, ortada şehir, altta
/// zincir kartları. Her şey başparmak menzilinde.
struct RootView: View {
    @Environment(GameStore.self) private var store
    @State private var confirmSell = false
    @State private var showSettings = ProcessInfo.processInfo.arguments.contains("-liteSettings")

    var body: some View {
        @Bindable var store = store
        let haptics = store.settings.haptics
        VStack(spacing: 0) {
            HeaderView(showSettings: $showSettings)
            EventBanner()
            CityView()
                .frame(height: 196)
                .overlay(alignment: .bottom) { Rectangle().fill(Theme.line).frame(height: 1) }
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(spacing: 10) {
                        NotifyPromptCard()
                        CouncilCard()
                        GoalCard()
                        IpoCard(placement: .offer)
                        BuyAmountPicker(selection: $store.buyAmount)
                        ForEach(ChainId.allCases, id: \.self) { chain in
                            ChainCard(chain: chain)
                        }
                        IpoCard(placement: .market).id("market")
                        ManagerCard()
                        HoldingCard(confirm: $confirmSell).id("holding")
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
                }
                .onAppear {
                    // CI kareleri: `-liteScroll market` listeyi o karta kaydırıyor.
                    let arguments = ProcessInfo.processInfo.arguments
                    if let index = arguments.firstIndex(of: "-liteScroll"), index + 1 < arguments.count {
                        proxy.scrollTo(arguments[index + 1], anchor: .top)
                    }
                }
            }
        }
        // Dil değişince bütün metinler yeniden kurulsun.
        .id(store.settings.language)
        .background(Theme.paper.ignoresSafeArea())
        .sensoryFeedback(trigger: store.purchases) { _, _ in haptics ? .selection : nil }
        .sensoryFeedback(trigger: store.refusals) { _, _ in haptics ? .warning : nil }
        .sensoryFeedback(trigger: store.triumphs) { _, _ in haptics ? .success : nil }
        .task { await store.refreshNotificationStatus() }
        .sheet(isPresented: $showSettings) {
            SettingsSheet()
                .presentationDetents([.large])
        }
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
