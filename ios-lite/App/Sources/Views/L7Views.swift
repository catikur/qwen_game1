import SwiftUI
import CapitalForgeLiteKit

/// Holding haritası (L7): satılan şehirler denizde ada olarak kalıyor; her biri
/// şu anki şehre bir ticaret yolu bırakıyor (öne çıkan zincirine kalıcı +%10).
struct HoldingMapSheet: View {
    @Environment(GameStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let state = store.state
        VStack(spacing: 0) {
            HStack {
                Text(L10n.t("map.title")).font(Theme.display(22)).foregroundStyle(Theme.ink)
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
                .accessibilityIdentifier("map-done")
            }
            .padding(.horizontal, 16)
            .padding(.top, 18)
            .padding(.bottom, 10)

            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text(L10n.t("map.body"))
                        .font(Theme.text(12.5))
                        .foregroundStyle(Theme.muted)
                        .padding(.horizontal, 4)
                    HoldingMapCanvas(state: state)
                        .frame(height: HoldingMapCanvas.height(cities: state.city + 1))
                        .glassCard(padding: 8)
                    routes(state)
                }
                .padding(.horizontal, 14)
                .padding(.bottom, 20)
            }
            .scrollIndicators(.hidden)
        }
    }

    @ViewBuilder
    private func routes(_ state: LiteState) -> some View {
        let active = ChainId.allCases.filter { Lite.tradeRoutes(state.city, $0) > 0 }
        VStack(alignment: .leading, spacing: 9) {
            Text(L10n.t("map.routes").uppercased(with: L10n.locale))
                .font(Theme.caps(10.5))
                .tracking(0.8)
                .foregroundStyle(Theme.soft)
            if active.isEmpty {
                Text(L10n.t("map.noRoutes"))
                    .font(Theme.text(12.5))
                    .foregroundStyle(Theme.muted)
            } else {
                ForEach(active, id: \.self) { chain in
                    let count = Lite.tradeRoutes(state.city, chain)
                    HStack(spacing: 10) {
                        IconTile(symbol: Theme.chainIcon(chain), colors: Theme.chainColors(chain), size: 30)
                        Text(L10n.t("map.route", L10n.chainName(chain), count * 10))
                            .font(Theme.display(15))
                            .foregroundStyle(Theme.ink)
                        Spacer()
                        Text("×\(count)")
                            .font(Theme.text(12, .heavy))
                            .foregroundStyle(Theme.muted)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassCard()
    }
}

/// Haritanın çizimi: şehirler yılan gibi dizilmiş küçük adalar; eski şehirlerden
/// şu anki şehre kesikli ticaret yolları.
struct HoldingMapCanvas: View {
    @Environment(\.colorScheme) private var scheme
    let state: LiteState

    static let columns = 4
    static let rowHeight: CGFloat = 92

    static func height(cities: Int) -> CGFloat {
        let rows = (cities + columns - 1) / columns
        return CGFloat(max(1, rows)) * rowHeight + 16
    }

    /// Şehrin haritadaki yeri: satır satır, her satırda yön değişiyor.
    static func position(_ index: Int, in size: CGSize) -> CGPoint {
        let row = index / columns
        var column = index % columns
        if row % 2 == 1 { column = columns - 1 - column }
        let cell = size.width / CGFloat(columns)
        return CGPoint(x: cell * (CGFloat(column) + 0.5), y: 8 + rowHeight * (CGFloat(row) + 0.42))
    }

    var body: some View {
        let night = scheme == .dark
        Canvas { context, size in
            let count = state.city + 1
            let current = HoldingMapCanvas.position(state.city, in: size)
            // Deniz dalgaları.
            var waves = Path()
            for k in 0..<Int(size.height / 26) {
                let y = CGFloat(k) * 26 + 14
                for j in 0..<6 {
                    let x = CGFloat(j) * size.width / 6 + (k % 2 == 0 ? 10 : 34)
                    waves.move(to: CGPoint(x: x, y: y))
                    waves.addQuadCurve(to: CGPoint(x: x + 16, y: y), control: CGPoint(x: x + 8, y: y - 4))
                }
            }
            context.stroke(waves, with: .color(night ? Color(hex: 0x8FB0FF, alpha: 0.18) : Color(hex: 0x3EB6F2, alpha: 0.28)), lineWidth: 1.4)
            // Ticaret yolları: satılmış her şehirden şu ankine.
            for index in 0..<state.city {
                let from = HoldingMapCanvas.position(index, in: size)
                var route = Path()
                route.move(to: from)
                route.addQuadCurve(to: current, control: CGPoint(x: (from.x + current.x) / 2, y: min(from.y, current.y) - 26))
                let color = Theme.chainColors(Lite.tradeRouteChain(index)).1
                context.stroke(route, with: .color(color.opacity(0.75)), style: StrokeStyle(lineWidth: 2, lineCap: .round, dash: [5, 5]))
            }
            for index in 0..<count {
                let center = HoldingMapCanvas.position(index, in: size)
                drawIsland(&context, at: center, city: index, current: index == state.city, night: night)
            }
        }
        .accessibilityIdentifier("holding-map-canvas")
    }

    /// Satılmış şehrin kaydı: harita L7'de geldi, ondan önce satılanların kaydı yok.
    private func record(_ city: Int) -> CityRecord? {
        let offset = state.city - state.history.count
        let index = city - offset
        return index >= 0 && index < state.history.count ? state.history[index] : nil
    }

    private func drawIsland(_ context: inout GraphicsContext, at center: CGPoint, city: Int, current: Bool, night: Bool) {
        let palette = CityPalette(night ? .dark : .light, theme: Lite.cityTheme(city))
        let w: CGFloat = current ? 54 : 46
        let h = w / 2
        let depth: CGFloat = 7
        let top = CGPoint(x: center.x, y: center.y - h / 2), right = CGPoint(x: center.x + w / 2, y: center.y)
        let bottom = CGPoint(x: center.x, y: center.y + h / 2), left = CGPoint(x: center.x - w / 2, y: center.y)
        var sideLeft = Path()
        sideLeft.addLines([left, bottom, CGPoint(x: bottom.x, y: bottom.y + depth), CGPoint(x: left.x, y: left.y + depth)])
        sideLeft.closeSubpath()
        context.fill(sideLeft, with: .color(palette.side.0))
        var sideRight = Path()
        sideRight.addLines([bottom, right, CGPoint(x: right.x, y: right.y + depth), CGPoint(x: bottom.x, y: bottom.y + depth)])
        sideRight.closeSubpath()
        context.fill(sideRight, with: .color(palette.side.1))
        var face = Path()
        face.addLines([top, right, bottom, left])
        face.closeSubpath()
        context.fill(face, with: .color(palette.grass.0))
        if current {
            context.stroke(face, with: .color(Color(hex: 0xFFD44F)), lineWidth: 2.5)
        }
        // Bayrak: o şehrin öne çıkan zinciri (ilk şehirde fırın).
        let flag = Theme.chainColors(Lite.tradeRouteChain(city)).1
        var pole = Path()
        pole.move(to: CGPoint(x: center.x, y: center.y + 2))
        pole.addLine(to: CGPoint(x: center.x, y: center.y - 20))
        context.stroke(pole, with: .color(night ? Color(hex: 0xC9D6F5) : Color(hex: 0x55638F)), lineWidth: 1.5)
        var banner = Path()
        banner.addLines([CGPoint(x: center.x, y: center.y - 20), CGPoint(x: center.x + 12, y: center.y - 16), CGPoint(x: center.x, y: center.y - 12)])
        banner.closeSubpath()
        context.fill(banner, with: .color(flag))
        // Etiket.
        let title = current ? L10n.t("map.current") : L10n.t("map.city", city + 1)
        context.draw(Text(title).font(Theme.display(12)).foregroundColor(Theme.ink), at: CGPoint(x: center.x, y: center.y + h / 2 + depth + 9))
        if let record = record(city) {
            context.draw(Text(L10n.t("map.stars", record.stars)).font(Theme.text(10.5, .heavy)).foregroundColor(Theme.money),
                         at: CGPoint(x: center.x, y: center.y + h / 2 + depth + 23))
        } else if current {
            context.draw(Text(L10n.t("theme.\(Lite.cityTheme(city).rawValue)")).font(Theme.text(10.5, .heavy)).foregroundColor(Theme.muted),
                         at: CGPoint(x: center.x, y: center.y + h / 2 + depth + 23))
        }
    }
}
