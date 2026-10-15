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
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "bell.fill")
                Text(L10n.t("ipo.title")).font(Theme.sans(15, .bold))
                Spacer()
            }
            Text(L10n.t("ipo.body"))
                .font(Theme.sans(12))
                .foregroundStyle(Theme.muted)
                .fixedSize(horizontal: false, vertical: true)
            Button {
                store.goPublic()
            } label: {
                Text(L10n.t("ipo.action", Format.money(proceeds)))
                    .font(Theme.mono(13, .bold))
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .foregroundStyle(Theme.paper)
                    .background(Theme.money)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("ipo")
        }
        .padding(12)
        .ruled(strong: true)
    }

    private func locked(_ state: LiteState) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "lock.fill").font(.system(size: 11)).foregroundStyle(Theme.muted)
                Text(L10n.t("ipo.title")).font(Theme.sans(15, .semibold)).foregroundStyle(Theme.muted)
                Spacer()
            }
            ProgressView(value: min(1, state.earned / LiteContent.ipoUnlock)).tint(Theme.ink)
            Text(L10n.t("ipo.locked", Format.money(LiteContent.ipoUnlock)))
                .font(Theme.mono(11))
                .foregroundStyle(Theme.muted)
        }
        .padding(12)
        .background(Theme.accentSoft)
        .overlay(Rectangle().stroke(Theme.line, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
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
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Image(systemName: "chart.line.uptrend.xyaxis")
                Text(L10n.t("stock.title")).font(Theme.sans(15, .bold))
                Spacer()
                Text(Format.money(price))
                    .font(Theme.mono(15, .bold))
                    .foregroundStyle(Theme.ink)
                    .accessibilityIdentifier("share-price")
            }
            HStack {
                Text(L10n.t("stock.price").uppercased())
                    .font(Theme.mono(9, .medium))
                    .tracking(0.8)
                    .foregroundStyle(Theme.muted)
                Spacer()
                Text(L10n.t("stock.since", change >= 0 ? "+" : "−", Format.percent(abs(change))))
                    .font(Theme.mono(11, .semibold))
                    .foregroundStyle(change >= 0 ? Theme.good : Theme.bad)
            }
            PriceChart(values: history + [price])
                .frame(height: 74)
            HStack {
                Text(L10n.t("stock.stake", Format.money(stake)))
                Spacer()
                Text(L10n.t("stock.premium"))
            }
            .font(Theme.mono(10))
            .foregroundStyle(Theme.muted)
        }
        .padding(12)
        .ruled()
        .accessibilityIdentifier("stock")
    }
}

/// İnce çizgi, hafif alan dolgusu, uç noktada nokta. Eksen yok: tek seri,
/// başlık ve değişim yüzdesi kartın üstünde yazıyor.
struct PriceChart: View {
    let values: [Double]

    var body: some View {
        Canvas { context, size in
            guard values.count >= 2, let low = values.min(), let high = values.max() else {
                var flat = Path()
                flat.move(to: CGPoint(x: 0, y: size.height / 2))
                flat.addLine(to: CGPoint(x: size.width, y: size.height / 2))
                context.stroke(flat, with: .color(Theme.ink), lineWidth: 2)
                return
            }
            let span = max(high - low, high * 0.02)
            let inset: CGFloat = 4
            func point(_ index: Int) -> CGPoint {
                let x = size.width * CGFloat(index) / CGFloat(values.count - 1)
                let y = inset + (size.height - 2 * inset) * CGFloat(1 - (values[index] - low) / span)
                return CGPoint(x: x, y: y)
            }
            var line = Path()
            line.move(to: point(0))
            for index in 1..<values.count { line.addLine(to: point(index)) }

            var area = line
            area.addLine(to: CGPoint(x: size.width, y: size.height))
            area.addLine(to: CGPoint(x: 0, y: size.height))
            area.closeSubpath()
            context.fill(area, with: .color(Theme.money.opacity(0.10)))

            var base = Path()
            base.move(to: CGPoint(x: 0, y: size.height - 0.5))
            base.addLine(to: CGPoint(x: size.width, y: size.height - 0.5))
            context.stroke(base, with: .color(Theme.line), lineWidth: 1)

            context.stroke(line, with: .color(Theme.money), style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
            let end = point(values.count - 1)
            context.fill(Path(ellipseIn: CGRect(x: end.x - 4, y: end.y - 4, width: 8, height: 8)), with: .color(Theme.money))
            context.stroke(Path(ellipseIn: CGRect(x: end.x - 4, y: end.y - 4, width: 8, height: 8)), with: .color(Theme.panel), lineWidth: 2)
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
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    Image(systemName: "bell.badge")
                    Text(L10n.t("notify.prompt.title")).font(Theme.sans(14, .bold))
                    Spacer()
                }
                Text(L10n.t("notify.prompt.body"))
                    .font(Theme.sans(12))
                    .foregroundStyle(Theme.muted)
                HStack(spacing: 8) {
                    Button {
                        Task { await store.setNotifications(true) }
                    } label: {
                        Text(L10n.t("notify.prompt.yes"))
                            .font(Theme.mono(12, .bold))
                            .frame(maxWidth: .infinity, minHeight: 36)
                            .foregroundStyle(Theme.paper)
                            .background(Theme.ink)
                    }
                    Button {
                        settings.notificationsOffered = true
                    } label: {
                        Text(L10n.t("notify.prompt.no"))
                            .font(Theme.mono(12))
                            .frame(maxWidth: .infinity, minHeight: 36)
                            .foregroundStyle(Theme.ink)
                            .background(Theme.accentSoft)
                    }
                }
                .buttonStyle(.plain)
            }
            .padding(12)
            .ruled()
        }
    }
}

/// Ayarlar: dil, ses, titreşim, bildirim, kaydı sıfırla.
struct SettingsSheet: View {
    @Environment(GameStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var confirmReset = false

    var body: some View {
        @Bindable var settings = store.settings
        VStack(spacing: 0) {
            HStack {
                Text(L10n.t("settings.title")).font(Theme.sans(18, .bold))
                Spacer()
                Button(L10n.t("settings.done")) { dismiss() }
                    .font(Theme.mono(13, .bold))
                    .foregroundStyle(Theme.ink)
                    .accessibilityIdentifier("settings-done")
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .overlay(alignment: .bottom) { Rectangle().fill(Theme.ink).frame(height: 1.5) }

            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    section(L10n.t("settings.language")) {
                        Picker(L10n.t("settings.language"), selection: $settings.language) {
                            ForEach(LanguageChoice.allCases) { choice in
                                Text(L10n.t("settings.lang.\(choice.rawValue)")).tag(choice)
                            }
                        }
                        .pickerStyle(.segmented)
                    }
                    section(nil) {
                        toggle(L10n.t("settings.sound"), "speaker.wave.2", $settings.sound)
                        Divider().overlay(Theme.line)
                        toggle(L10n.t("settings.haptics"), "iphone.radiowaves.left.and.right", $settings.haptics)
                        Divider().overlay(Theme.line)
                        toggle(
                            L10n.t("settings.notifications"),
                            "bell",
                            Binding(get: { settings.notifications }, set: { on in Task { await store.setNotifications(on) } })
                        )
                        Text(settings.notificationsDenied ? L10n.t("settings.notifications.denied") : L10n.t("settings.notifications.body"))
                            .font(Theme.sans(11))
                            .foregroundStyle(settings.notificationsDenied ? Theme.bad : Theme.muted)
                    }
                    Button {
                        confirmReset = true
                    } label: {
                        Text(L10n.t("settings.reset"))
                            .font(Theme.mono(13, .bold))
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .foregroundStyle(Theme.bad)
                            .overlay(Rectangle().stroke(Theme.bad, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("reset")
                    Text(footer)
                        .font(Theme.mono(10))
                        .foregroundStyle(Theme.muted)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 6)
                }
                .padding(14)
            }
        }
        .background(Theme.paper.ignoresSafeArea())
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
                Text(title.uppercased())
                    .font(Theme.mono(10, .medium))
                    .tracking(0.8)
                    .foregroundStyle(Theme.muted)
            }
            content()
        }
        .padding(12)
        .ruled()
    }

    private func toggle(_ title: String, _ icon: String, _ value: Binding<Bool>) -> some View {
        Toggle(isOn: value) {
            Label {
                Text(title).font(Theme.sans(14)).foregroundStyle(Theme.ink)
            } icon: {
                Image(systemName: icon).foregroundStyle(Theme.ink)
            }
        }
        .tint(Theme.money)
    }
}
