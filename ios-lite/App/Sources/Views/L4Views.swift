import SwiftUI
import CapitalForgeLiteKit

/// Halka arz ve borsa: sanayi açılınca kilitli olarak görünüyor, 1 Mr ₺
/// kazançta düğme açılıyor, halka arzdan sonra borsa kartına dönüşüyor.
struct IpoCard: View {
    enum Placement {
        /// Listenin başı: yalnızca açılmış ama yapılmamış halka arz (görev kartının hemen altında).
        case offer
        /// Zincirlerin altı: kilitliyken ilerleme, halka arzdan sonra borsa.
        case market
    }

    @Environment(GameStore.self) private var store
    let placement: Placement

    var body: some View {
        let state = store.state
        switch placement {
        case .offer:
            if !state.listed && Lite.ipoUnlocked(state) { offer(state) }
        case .market:
            if state.listed {
                StockCard()
            } else if !Lite.ipoUnlocked(state) && Lite.districtUnlocked(state, .industry) {
                locked(state)
            }
        }
    }

    private func offer(_ state: LiteState) -> some View {
        let proceeds = Lite.ipoProceeds(state)
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                IconTile(symbol: "bell.fill", colors: (Color(hex: 0xFFE08A), Color(hex: 0xFFB938)), size: 36)
                VStack(alignment: .leading, spacing: 1) {
                    Text(L10n.t("ipo.title")).font(Theme.display(18)).foregroundStyle(Theme.ink)
                    Text(L10n.t("ipo.body"))
                        .font(Theme.text(11.5))
                        .foregroundStyle(Theme.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Button {
                store.goPublic()
            } label: {
                Text(L10n.t("ipo.action", Format.money(proceeds)))
                    .font(Theme.display(16))
                    .frame(maxWidth: .infinity, minHeight: 46)
            }
            .buttonStyle(.glossy(Theme.green, radius: 16, edge: 5))
            .accessibilityIdentifier("ipo")
        }
        .glassCard()
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(Theme.neckRing, lineWidth: 2))
    }

    private func locked(_ state: LiteState) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 9) {
                Image(systemName: "lock.fill")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Theme.soft)
                    .frame(width: 34, height: 34)
                    .background(Theme.track, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                Text(L10n.t("ipo.title")).font(Theme.display(18)).foregroundStyle(Theme.muted)
                Spacer()
            }
            ProgressBar(value: min(1, state.earned / LiteContent.ipoUnlock), colors: (Color(hex: 0xFFE08A), Color(hex: 0xFFB938)))
            Text(L10n.t("ipo.locked", Format.money(LiteContent.ipoUnlock)))
                .font(Theme.text(11.5))
                .foregroundStyle(Theme.muted)
        }
        .glassCard()
        .opacity(0.85)
    }
}

/// Borsa: hisse fiyatı, halka arzdan beri değişim ve grafik.
struct StockCard: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        let state = store.state
        let price = Lite.sharePrice(state)
        let history = store.priceHistory
        let first = history.first ?? price
        let change = first > 0 ? price / first - 1 : 0
        let stake = Lite.companyValue(state) * (1 - LiteContent.ipoShare)
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .center, spacing: 10) {
                IconTile(symbol: "chart.line.uptrend.xyaxis", colors: (Color(hex: 0x4FD88C), Color(hex: 0x22B262)), size: 34)
                VStack(alignment: .leading, spacing: 0) {
                    Text(L10n.t("stock.title")).font(Theme.display(18)).foregroundStyle(Theme.ink)
                    Text(L10n.t("stock.price").uppercased(with: L10n.locale))
                        .font(Theme.caps(9.5))
                        .tracking(0.6)
                        .foregroundStyle(Theme.soft)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 1) {
                    Text(Format.money(price))
                        .font(Theme.display(18))
                        .foregroundStyle(Theme.ink)
                        .accessibilityIdentifier("share-price")
                    Text(L10n.t("stock.since", change >= 0 ? "+" : "−", Format.percent(abs(change))))
                        .font(Theme.text(11, .heavy))
                        .foregroundStyle(change >= 0 ? Theme.good : Theme.bad)
                }
            }
            PriceChart(values: history + [price])
                .frame(height: 78)
                .padding(.vertical, 2)
            HStack {
                Text(L10n.t("stock.stake", Format.money(stake)))
                Spacer()
                Text(L10n.t("stock.premium"))
            }
            .font(Theme.text(10.5))
            .foregroundStyle(Theme.muted)
        }
        .glassCard()
        .accessibilityIdentifier("stock")
    }
}

/// Yuvarlak uçlu kalın çizgi, yeşil alan dolgusu, uç noktada parlayan nokta.
struct PriceChart: View {
    let values: [Double]

    var body: some View {
        Canvas { context, size in
            guard values.count >= 2, let low = values.min(), let high = values.max() else {
                var flat = Path()
                flat.move(to: CGPoint(x: 0, y: size.height / 2))
                flat.addLine(to: CGPoint(x: size.width, y: size.height / 2))
                context.stroke(flat, with: .color(Theme.money), style: StrokeStyle(lineWidth: 3, lineCap: .round))
                return
            }
            let span = max(high - low, high * 0.02)
            let inset: CGFloat = 6
            func point(_ index: Int) -> CGPoint {
                let x = inset + (size.width - 2 * inset) * CGFloat(index) / CGFloat(values.count - 1)
                let y = inset + (size.height - 2 * inset) * CGFloat(1 - (values[index] - low) / span)
                return CGPoint(x: x, y: y)
            }
            var line = Path()
            line.move(to: point(0))
            for index in 1..<values.count { line.addLine(to: point(index)) }

            var area = line
            area.addLine(to: CGPoint(x: size.width - inset, y: size.height))
            area.addLine(to: CGPoint(x: inset, y: size.height))
            area.closeSubpath()
            context.fill(area, with: .linearGradient(Gradient(colors: [Theme.money.opacity(0.28), Theme.money.opacity(0.02)]), startPoint: .zero, endPoint: CGPoint(x: 0, y: size.height)))

            context.stroke(line, with: .color(Theme.money), style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round))
            let end = point(values.count - 1)
            let glow = CGRect(x: end.x - 9, y: end.y - 9, width: 18, height: 18)
            context.fill(Path(ellipseIn: glow), with: .color(Theme.money.opacity(0.25)))
            let dot = CGRect(x: end.x - 4.5, y: end.y - 4.5, width: 9, height: 9)
            context.fill(Path(ellipseIn: dot), with: .color(Theme.money))
            context.stroke(Path(ellipseIn: dot), with: .color(.white), lineWidth: 2)
        }
        .accessibilityHidden(true)
    }
}

/// Bir kez soruluyor: ilk kampanyadan sonra, oyuncu oyunu tanıyınca.
struct NotifyPromptCard: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        let settings = store.settings
        if !settings.notificationsOffered && !settings.notifications && store.state.goal >= 4 && !store.isScenario {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 10) {
                    IconTile(symbol: "bell.badge.fill", colors: (Color(hex: 0x7DB4FF), Color(hex: 0x4683E8)), size: 34)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(L10n.t("notify.prompt.title")).font(Theme.display(16)).foregroundStyle(Theme.ink)
                        Text(L10n.t("notify.prompt.body")).font(Theme.text(11.5)).foregroundStyle(Theme.muted)
                    }
                }
                HStack(spacing: 8) {
                    Button {
                        Task { await store.setNotifications(true) }
                    } label: {
                        Text(L10n.t("notify.prompt.yes"))
                            .font(Theme.display(14))
                            .frame(maxWidth: .infinity, minHeight: 38)
                    }
                    .buttonStyle(.glossy(Theme.blue, radius: 14))
                    Button {
                        settings.notificationsOffered = true
                    } label: {
                        Text(L10n.t("notify.prompt.no"))
                            .font(Theme.display(14))
                            .frame(maxWidth: .infinity, minHeight: 38)
                    }
                    .buttonStyle(.glossy(nil, radius: 14))
                }
            }
            .glassCard()
        }
    }
}

/// Ayarlar: görünüm, dil, ses, titreşim, bildirim, gizlilik ve destek, kaydı sıfırla.
struct SettingsSheet: View {
    /// Gizlilik ve destek sayfaları (apps/web/public/lite, GitHub Pages).
    static let site = "https://catikur.github.io/qwen_game1/lite/"

    @Environment(GameStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    @State private var confirmReset = false

    var body: some View {
        @Bindable var settings = store.settings
        VStack(spacing: 0) {
            HStack {
                Text(L10n.t("settings.title")).font(Theme.display(22)).foregroundStyle(Theme.ink)
                Spacer()
                Button {
                    dismiss()
                } label: {
                    Text(L10n.t("settings.done"))
                        .font(Theme.display(14))
                        .padding(.horizontal, 14)
                        .frame(minHeight: 34)
                }
                .buttonStyle(.glossy(Theme.blue, radius: 12, edge: 3))
                .accessibilityIdentifier("settings-done")
            }
            .padding(.horizontal, 16)
            .padding(.top, 18)
            .padding(.bottom, 10)

            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    section(L10n.t("settings.appearance")) {
                        PillPicker(selection: $settings.appearance, options: AppearanceChoice.allCases) { L10n.t("settings.appearance.\($0.rawValue)") }
                    }
                    section(L10n.t("settings.language")) {
                        PillPicker(selection: $settings.language, options: LanguageChoice.allCases) { L10n.t("settings.lang.\($0.rawValue)") }
                    }
                    section(nil) {
                        toggle(L10n.t("settings.sound"), "speaker.wave.2.fill", (Color(hex: 0xFFA65C), Color(hex: 0xFF7A2A)), $settings.sound)
                        Divider().overlay(Theme.line)
                        toggle(L10n.t("settings.haptics"), "iphone.radiowaves.left.and.right", (Color(hex: 0xDA8BF0), Color(hex: 0xB85DD6)), $settings.haptics)
                        Divider().overlay(Theme.line)
                        toggle(
                            L10n.t("settings.notifications"),
                            "bell.fill",
                            (Color(hex: 0x7DB4FF), Color(hex: 0x4683E8)),
                            Binding(get: { settings.notifications }, set: { on in Task { await store.setNotifications(on) } })
                        )
                        Text(settings.notificationsDenied ? L10n.t("settings.notifications.denied") : L10n.t("settings.notifications.body"))
                            .font(Theme.text(11.5, .semibold))
                            .foregroundStyle(settings.notificationsDenied ? Theme.bad : Theme.muted)
                    }
                    section(nil) {
                        link(L10n.t("settings.privacy"), "hand.raised.fill", (Color(hex: 0x7BE08F), Color(hex: 0x3BA85E)), page("privacy.html"))
                        Divider().overlay(Theme.line)
                        link(L10n.t("settings.support"), "questionmark.bubble.fill", (Color(hex: 0x7DD3F0), Color(hex: 0x3B9FD6)), page("support.html"))
                    }
                    Button {
                        confirmReset = true
                    } label: {
                        Label(L10n.t("settings.reset"), systemImage: "arrow.counterclockwise")
                            .font(Theme.display(15))
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.glossy(Theme.red, radius: 15))
                    .accessibilityIdentifier("reset")
                    Text(footer)
                        .font(Theme.text(10.5, .semibold))
                        .foregroundStyle(Theme.soft)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 4)
                }
                .padding(.horizontal, 14)
                .padding(.bottom, 20)
            }
        }
        .background(Theme.sky(scheme).ignoresSafeArea())
        .confirmationDialog(L10n.t("settings.reset.confirm"), isPresented: $confirmReset, titleVisibility: .visible) {
            Button(L10n.t("settings.reset.action"), role: .destructive) {
                store.resetGame()
                dismiss()
            }
            Button(L10n.t("common.cancel"), role: .cancel) {}
        } message: {
            Text(L10n.t("settings.reset.body"))
        }
    }

    private var footer: String {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?"
        return L10n.t("settings.footer", version, store.state.city + 1, Format.money(store.state.totalEarned))
    }

    private func section<Inner: View>(_ title: String?, @ViewBuilder _ content: () -> Inner) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if let title {
                Text(title.uppercased(with: L10n.locale))
                    .font(Theme.caps(10))
                    .tracking(0.8)
                    .foregroundStyle(Theme.soft)
            }
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassCard()
    }

    /// Sayfa adresi; İngilizcede sayfanın İngilizce bölümüne.
    private func page(_ name: String) -> URL {
        URL(string: SettingsSheet.site + name + (L10n.lang == .tr ? "" : "#en"))!
    }

    private func link(_ title: String, _ icon: String, _ colors: (Color, Color), _ url: URL) -> some View {
        Link(destination: url) {
            HStack(spacing: 10) {
                IconTile(symbol: icon, colors: colors, size: 30)
                Text(title).font(Theme.display(15)).foregroundStyle(Theme.ink)
                Spacer()
                Image(systemName: "arrow.up.right")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Theme.soft)
            }
            .frame(minHeight: 34)
            .contentShape(Rectangle())
        }
    }

    private func toggle(_ title: String, _ icon: String, _ colors: (Color, Color), _ value: Binding<Bool>) -> some View {
        Toggle(isOn: value) {
            HStack(spacing: 10) {
                IconTile(symbol: icon, colors: colors, size: 30)
                Text(title).font(Theme.display(15)).foregroundStyle(Theme.ink)
            }
        }
        .tint(Theme.money)
    }
}

/// Hap seçici: Ayarlar'da görünüm ve dil (oyunun toplu alım seçicisiyle aynı dil).
struct PillPicker<Option: Hashable>: View {
    @Binding var selection: Option
    let options: [Option]
    let label: (Option) -> String

    var body: some View {
        HStack(spacing: 0) {
            ForEach(options, id: \.self) { option in
                let on = option == selection
                Button {
                    selection = option
                } label: {
                    Text(label(option))
                        .font(Theme.display(14))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity, minHeight: 32)
                        .foregroundStyle(on ? Theme.ink : Theme.muted)
                        .background {
                            if on {
                                RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Theme.trackOn)
                                    .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Theme.trackEdge).offset(y: 2))
                            }
                        }
                }
                .buttonStyle(.plain)
                .hoverEffect(.highlight)
            }
        }
        .padding(4)
        .background(Theme.track, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}
