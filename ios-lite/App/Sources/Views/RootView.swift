import SwiftUI
import UIKit
import CapitalForgeLiteKit

/// Ana ekran. Telefonda tek sütun, dikey, tek el: üstte kasa ve kampanya, ortada
/// gökyüzünde süzülen şehir, altta zincir kartları. iPad'de (L6) aynı parçalar
/// büyük ekrana dağılıyor:
/// - yatay: solda büyük şehir, sağda kartlar;
/// - dikey: üstte geniş şehir, altta iki sütun kart;
/// - dar pencere (Split View'in üçte biri): telefon düzeni.
struct RootView: View {
    @Environment(GameStore.self) private var store
    @Environment(\.colorScheme) private var scheme
    @Environment(\.horizontalSizeClass) private var sizeClass
    @State private var confirmSell = false
    @State private var showSettings = ProcessInfo.processInfo.arguments.contains("-liteSettings")

    enum Layout {
        case phone, tabletPortrait, tabletLandscape
    }

    /// İki sütun kart için gereken genişlik: zincir kartı telefondaki kadar ferah kalsın.
    static let twoColumnWidth: CGFloat = 760

    static func layout(for size: CGSize, sizeClass: UserInterfaceSizeClass?) -> Layout {
        guard sizeClass == .regular, size.width >= 700 else { return .phone }
        return size.width > size.height * 1.05 ? .tabletLandscape : .tabletPortrait
    }

    var body: some View {
        @Bindable var store = store
        let haptics = store.settings.haptics
        GeometryReader { proxy in
            let size = proxy.size
            switch Self.layout(for: size, sizeClass: sizeClass) {
            case .phone:
                VStack(spacing: 0) {
                    HeaderView(showSettings: $showSettings)
                    EventBanner()
                    CityView().frame(height: 214)
                    cards(columns: 1)
                }
            case .tabletPortrait:
                VStack(spacing: 0) {
                    HeaderView(showSettings: $showSettings)
                        .frame(maxWidth: 900)
                    EventBanner()
                        .frame(maxWidth: 900)
                    CityView().frame(height: min(460, size.height * 0.36))
                    cards(columns: size.width - 28 >= Self.twoColumnWidth ? 2 : 1)
                }
                .frame(maxWidth: .infinity)
            case .tabletLandscape:
                let left = min(620, size.width * 0.46)
                HStack(spacing: 0) {
                    VStack(spacing: 0) {
                        HeaderView(showSettings: $showSettings)
                        EventBanner()
                        CityView().frame(maxHeight: .infinity)
                    }
                    .frame(width: left)
                    cards(columns: size.width - left - 28 >= Self.twoColumnWidth ? 2 : 1)
                        .padding(.top, 8)
                }
            }
        }
        .background { KeyboardShortcuts(store: store) }
        .task { applyScenarioOrientation() }
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
                .presentationBackground { Theme.sky(scheme) }
        }
        .sheet(item: $store.offlineReport) { report in
            OfflineSheet(report: report)
                .presentationDetents([.height(360)])
                .presentationCornerRadius(28)
                // Pencerenin tamamı gökyüzü: üstte ve altta beyaz bant kalmasın.
                .presentationBackground { Theme.sky(scheme) }
        }
        .confirmationDialog(L10n.t("holding.confirm"), isPresented: $confirmSell, titleVisibility: .visible) {
            Button(L10n.t("holding.sell"), role: .destructive) { store.sellCity() }
            Button(L10n.t("common.cancel"), role: .cancel) {}
        } message: {
            Text(L10n.t("holding.confirmBody", Lite.prestigePreview(store.state)))
        }
    }
}

extension RootView {
    /// Kartlar: telefonda tek sütun; iPad'de zincirler ve alt kartlar iki sütunlu ızgarada.
    @ViewBuilder
    func cards(columns: Int) -> some View {
        @Bindable var store = store
        ScrollViewReader { proxy in
            ScrollView {
                VStack(spacing: 11) {
                    NotifyPromptCard()
                    CouncilCard()
                    GoalCard()
                    IpoCard(placement: .offer)
                    BuyAmountPicker(selection: $store.buyAmount)
                    if columns > 1 {
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12, alignment: .top), count: columns), spacing: 12) {
                            ForEach(ChainId.allCases, id: \.self) { chain in
                                ChainCard(chain: chain)
                            }
                            IpoCard(placement: .market).id("market")
                            ManagerCard()
                            HoldingCard(confirm: $confirmSell).id("holding")
                        }
                    } else {
                        ForEach(ChainId.allCases, id: \.self) { chain in
                            ChainCard(chain: chain)
                        }
                        IpoCard(placement: .market).id("market")
                        ManagerCard()
                        HoldingCard(confirm: $confirmSell).id("holding")
                    }
                }
                .padding(.horizontal, 14)
                .padding(.top, 4)
                .padding(.bottom, 16)
                .frame(maxWidth: columns > 1 ? 1100 : .infinity)
                .frame(maxWidth: .infinity)
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

    /// CI kareleri: `-liteLandscape` iPad'i yatay çeviriyor (senaryo modunda).
    func applyScenarioOrientation() {
        guard ProcessInfo.processInfo.arguments.contains("-liteLandscape"),
              let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene else { return }
        scene.requestGeometryUpdate(.iOS(interfaceOrientations: .landscapeRight)) { _ in }
    }
}

/// iPad klavyesi: 1/2/3 toplu alım, K kampanya. Görünmez düğmeler.
struct KeyboardShortcuts: View {
    let store: GameStore

    var body: some View {
        ZStack {
            Button("×1") { store.buyAmount = .one }.keyboardShortcut("1", modifiers: [])
            Button("×10") { store.buyAmount = .ten }.keyboardShortcut("2", modifiers: [])
            Button("Max") { store.buyAmount = .max }.keyboardShortcut("3", modifiers: [])
            Button("Kampanya") { store.campaign() }.keyboardShortcut("k", modifiers: [])
        }
        .opacity(0)
        .accessibilityHidden(true)
        .allowsHitTesting(false)
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
