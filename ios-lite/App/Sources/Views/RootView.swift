import SwiftUI
import CapitalForgeLiteKit

/// Tek ekran, dikey, tek el: üstte kasa ve kampanya, ortada gökyüzünde süzülen
/// şehir, altta zincir kartları. Her şey başparmak menzilinde.
struct RootView: View {
    @Environment(GameStore.self) private var store
    @Environment(\.colorScheme) private var scheme
    @State private var confirmSell = false
    @State private var showSettings = ProcessInfo.processInfo.arguments.contains("-liteSettings")

    var body: some View {
        @Bindable var store = store
        let haptics = store.settings.haptics
        VStack(spacing: 0) {
            HeaderView(showSettings: $showSettings)
            EventBanner()
            CityView()
                .frame(height: 214)
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(spacing: 11) {
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
                    .padding(.top, 4)
                    .padding(.bottom, 16)
                }
                .scrollIndicators(.hidden)
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
        .background(Theme.sky(scheme).ignoresSafeArea())
        .sensoryFeedback(trigger: store.purchases) { _, _ in haptics ? .selection : nil }
        .sensoryFeedback(trigger: store.refusals) { _, _ in haptics ? .warning : nil }
        .sensoryFeedback(trigger: store.triumphs) { _, _ in haptics ? .success : nil }
        .task { await store.refreshNotificationStatus() }
        .sheet(isPresented: $showSettings) {
            SettingsSheet()
                .presentationDetents([.fraction(0.82), .large])
                .presentationCornerRadius(28)
        }
        .sheet(item: $store.offlineReport) { report in
            OfflineSheet(report: report)
                .presentationDetents([.height(340)])
                .presentationCornerRadius(28)
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
        PillPicker(selection: $selection, options: BuyAmount.allCases) { amount in
            switch amount {
            case .one: L10n.t("buy.one")
            case .ten: L10n.t("buy.ten")
            case .max: L10n.t("buy.max")
            }
        }
    }
}
