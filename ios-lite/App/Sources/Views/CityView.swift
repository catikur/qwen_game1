import SwiftUI
import UIKit
import CapitalForgeLiteKit

/// İzometrik şehir: 7×7 karelik ızgara, ortada iki yol. Her zincirin üç
/// kademesi bir sıra parsel (ham → işleme → satış); bina seviyeyle yükseliyor,
/// işleme tesisinin bacası tütüyor, yollarda araçlar akıyor. Kilitli
/// mahalleler kesik çizgili boş parsel. Hiçbir görsel dosya yok: hepsi Canvas.
struct CityView: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        let state = store.state
        TimelineView(.animation(minimumInterval: 1.0 / 30)) { timeline in
            Canvas { context, size in
                let painter = IsoPainter(size: size)
                painter.draw(in: &context, state: state, time: timeline.date.timeIntervalSinceReferenceDate)
            }
        }
        .background(Theme.background)
        .accessibilityIdentifier("city")
    }
}

/// Parsel düzeni: zincir başına üç kare, mahalle başına çeyrek.
enum CityLayout {
    static let size = 7
    static let roads: Set<Int> = [3]

    static func tiles(_ chain: ChainId) -> [(Int, Int)] {
        switch chain {
        case .bakery: [(0, 0), (1, 0), (2, 0)]
        case .coffee: [(0, 2), (1, 2), (2, 2)]
        case .fashion: [(4, 0), (5, 0), (6, 0)]
        case .leather: [(0, 4), (1, 4), (2, 4)]
        case .tech: [(4, 4), (5, 4), (6, 4)]
        }
    }

    /// Liman: güneydoğu köşesinde su ve vinçler.
    static let port: [(Int, Int)] = [(4, 6), (5, 6), (6, 6)]

    static func isRoad(_ c: Int, _ r: Int) -> Bool { roads.contains(c) || roads.contains(r) }
}

struct IsoPainter {
    let size: CGSize
    let tileWidth: CGFloat
    let origin: CGPoint

    init(size: CGSize) {
        self.size = size
        // 7 kare enine sığsın; yükseklik de binalara yer bıraksın.
        tileWidth = min(size.width / 7.6, size.height / 4.3)
        origin = CGPoint(x: size.width / 2, y: size.height * 0.2)
    }

    var tileHeight: CGFloat { tileWidth / 2 }

    /// Karenin (c, r) köşesinin ekran konumu; `z` kare birimiyle yükseklik.
    func point(_ c: Double, _ r: Double, _ z: Double = 0) -> CGPoint {
        CGPoint(
            x: origin.x + CGFloat(c - r) * tileWidth / 2,
            y: origin.y + CGFloat(c + r) * tileHeight / 2 - CGFloat(z) * tileWidth * 0.62
        )
    }

    func draw(in context: inout GraphicsContext, state: LiteState, time: Double) {
        drawGround(&context, state: state)
        var items: [(depth: Double, draw: (inout GraphicsContext) -> Void)] = []

        for chain in ChainId.allCases {
            let unlocked = Lite.chainUnlocked(state, chain)
            let levels = state[chain: chain].levels
            for (stage, tile) in zip(Stage.allCases, CityLayout.tiles(chain)) {
                let level = levels[stage.rawValue]
                let (c, r) = (Double(tile.0), Double(tile.1))
                items.append((c + r, { (ctx: inout GraphicsContext) in
                    self.drawBuilding(&ctx, chain: chain, stage: stage, level: level, unlocked: unlocked, c: c, r: r, time: time)
                }))
            }
        }
        if Lite.districtUnlocked(state, .port) {
            for (index, tile) in CityLayout.port.enumerated() {
                let (c, r) = (Double(tile.0), Double(tile.1))
                items.append((c + r, { (ctx: inout GraphicsContext) in self.drawCrane(&ctx, c: c, r: r, phase: Double(index)) }))
            }
        }
        for car in cars(state: state, time: time) {
            items.append((car.c + car.r + 0.5, { (ctx: inout GraphicsContext) in self.drawCar(&ctx, car) }))
        }
        for item in items.sorted(by: { $0.depth < $1.depth }) { item.draw(&context) }
    }

    // MARK: - Zemin ve yollar

    private func diamond(_ c: Double, _ r: Double, inset: Double = 0, z: Double = 0) -> Path {
        var path = Path()
        path.move(to: point(c + inset, r + inset, z))
        path.addLine(to: point(c + 1 - inset, r + inset, z))
        path.addLine(to: point(c + 1 - inset, r + 1 - inset, z))
        path.addLine(to: point(c + inset, r + 1 - inset, z))
        path.closeSubpath()
        return path
    }

    private func drawGround(_ context: inout GraphicsContext, state: LiteState) {
        for r in 0..<CityLayout.size {
            for c in 0..<CityLayout.size {
                let (dc, dr) = (Double(c), Double(r))
                if CityLayout.isRoad(c, r) {
                    context.fill(diamond(dc, dr), with: .color(Color(hex: 0x2B3036)))
                } else if CityLayout.port.contains(where: { $0 == (c, r) }) {
                    let water = Lite.districtUnlocked(state, .port) ? Color(hex: 0x5D8FB0) : Color(hex: 0xD3D6D2)
                    context.fill(diamond(dc, dr), with: .color(water))
                } else {
                    context.fill(diamond(dc, dr), with: .color(Color(hex: 0xC9D2BE)))
                    context.fill(diamond(dc, dr, inset: 0.06), with: .color(Color(hex: 0xEEF0EC)))
                }
            }
        }
        // Yol çizgileri: kesikli orta şerit.
        var dashes = Path()
        for i in 0..<CityLayout.size {
            let t = Double(i)
            dashes.move(to: point(t + 0.2, 3.5))
            dashes.addLine(to: point(t + 0.55, 3.5))
            dashes.move(to: point(3.5, t + 0.2))
            dashes.addLine(to: point(3.5, t + 0.55))
        }
        context.stroke(dashes, with: .color(Color(hex: 0xC9B46A)), lineWidth: 1)
    }

    // MARK: - Binalar

    /// Kutu: üst yüz açık, güneybatı yüzü orta, güneydoğu yüzü koyu (ışık kuzeybatıdan).
    private func box(_ context: inout GraphicsContext, c: Double, r: Double, w: Double, d: Double, z0: Double = 0, h: Double, color: Color) {
        let c1 = c + w, r1 = r + d
        var top = Path()
        top.move(to: point(c, r, z0 + h))
        top.addLine(to: point(c1, r, z0 + h))
        top.addLine(to: point(c1, r1, z0 + h))
        top.addLine(to: point(c, r1, z0 + h))
        top.closeSubpath()
        var left = Path()
        left.move(to: point(c, r1, z0))
        left.addLine(to: point(c1, r1, z0))
        left.addLine(to: point(c1, r1, z0 + h))
        left.addLine(to: point(c, r1, z0 + h))
        left.closeSubpath()
        var right = Path()
        right.move(to: point(c1, r, z0))
        right.addLine(to: point(c1, r1, z0))
        right.addLine(to: point(c1, r1, z0 + h))
        right.addLine(to: point(c1, r, z0 + h))
        right.closeSubpath()
        context.fill(left, with: .color(color.shade(0.82)))
        context.fill(right, with: .color(color.shade(0.66)))
        context.fill(top, with: .color(color))
        context.stroke(top, with: .color(Theme.ink.opacity(0.18)), lineWidth: 0.5)
    }

    private func height(_ level: Int) -> Double {
        level <= 0 ? 0 : min(1.7, 0.22 + 0.13 * log2(1 + Double(level)))
    }

    private func drawBuilding(_ context: inout GraphicsContext, chain: ChainId, stage: Stage, level: Int, unlocked: Bool, c: Double, r: Double, time: Double) {
        guard unlocked else {
            context.stroke(diamond(c, r, inset: 0.12), with: .color(Theme.ink.opacity(0.35)), style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
            return
        }
        guard level > 0 else {
            context.stroke(diamond(c, r, inset: 0.12), with: .color(Theme.chain(chain).opacity(0.7)), style: StrokeStyle(lineWidth: 1.2, dash: [4, 2]))
            return
        }
        let tint = Theme.chain(chain)
        let h = height(level)
        switch stage {
        case .raw:
            // Tarla / ocak: alçak taban ve sıra sıra ekin şeritleri, köşede silo.
            box(&context, c: c + 0.1, r: r + 0.1, w: 0.8, d: 0.8, h: 0.05, color: tint.mix(with: Color(hex: 0x93A565), 0.55))
            var rows = Path()
            for k in 1...3 {
                let t = 0.1 + 0.2 * Double(k)
                rows.move(to: point(c + 0.15, r + t, 0.05))
                rows.addLine(to: point(c + 0.85, r + t, 0.05))
            }
            context.stroke(rows, with: .color(Theme.ink.opacity(0.18)), lineWidth: 1)
            box(&context, c: c + 0.62, r: r + 0.14, w: 0.22, d: 0.22, h: h * 0.9, color: Color(hex: 0xD9D2C0))
        case .process:
            // Hangar ve baca: üretim varsa duman.
            box(&context, c: c + 0.08, r: r + 0.18, w: 0.84, d: 0.66, h: h * 0.7, color: Color(hex: 0xB9B4AA).mix(with: tint, 0.25))
            box(&context, c: c + 0.16, r: r + 0.24, w: 0.14, d: 0.14, z0: h * 0.7, h: 0.45 + h * 0.3, color: Color(hex: 0x7F858D))
            drawSmoke(&context, c: c + 0.23, r: r + 0.31, z: h * 0.7 + 0.45 + h * 0.3, time: time)
        case .retail:
            // Dükkân: gövde, zincir renginde tente ve tabela.
            box(&context, c: c + 0.15, r: r + 0.15, w: 0.7, d: 0.7, h: h, color: Color(hex: 0xE9E1CF).mix(with: tint, 0.18))
            box(&context, c: c + 0.15, r: r + 0.85, w: 0.7, d: 0.1, z0: min(0.28, h * 0.5), h: 0.05, color: tint)
            box(&context, c: c + 0.25, r: r + 0.2, w: 0.5, d: 0.04, z0: h, h: 0.12, color: tint.shade(1.05))
        }
    }

    private func drawSmoke(_ context: inout GraphicsContext, c: Double, r: Double, z: Double, time: Double) {
        let phase = (c * 0.37 + r * 0.61).truncatingRemainder(dividingBy: 1)
        for k in 0..<4 {
            let age = (time / 3.2 + phase + Double(k) / 4).truncatingRemainder(dividingBy: 1)
            let p = point(c + age * 0.5, r - age * 0.2, z + age * 1.1)
            let radius = (2 + age * 7) * tileWidth / 46
            let alpha = age < 0.75 ? 0.75 : 0.75 * (1 - age) / 0.25
            let rect = CGRect(x: p.x - radius, y: p.y - radius, width: radius * 2, height: radius * 2)
            context.fill(Path(ellipseIn: rect), with: .color(Color(hex: 0xE9E9E5).opacity(alpha)))
        }
    }

    private func drawCrane(_ context: inout GraphicsContext, c: Double, r: Double, phase: Double) {
        box(&context, c: c + 0.4, r: r + 0.4, w: 0.12, d: 0.12, h: 1.1, color: Color(hex: 0xD8A83A))
        box(&context, c: c + 0.1, r: r + 0.4, w: 0.8, d: 0.08, z0: 1.1, h: 0.08, color: Color(hex: 0xD8A83A))
        box(&context, c: c + 0.15, r: r + 0.12, w: 0.35, d: 0.22, h: 0.18, color: phase == 1 ? Color(hex: 0x3B6FD4) : Color(hex: 0xB8484F))
    }

    // MARK: - Araçlar

    struct Car {
        let c: Double
        let r: Double
        let horizontal: Bool
        let color: Color
    }

    private func cars(state: LiteState, time: Double) -> [Car] {
        let unlocked = ChainId.allCases.filter { Lite.chainUnlocked(state, $0) && state[chain: $0].levels[2] > 0 }
        let count = min(10, 2 + unlocked.count * 2)
        let palette = [0xE8E8E4, 0x7C828A, 0x2E3136, 0xBFC3C8, 0x2A3A52, 0x6E2F2B]
        return (0..<count).map { i in
            let horizontal = i % 2 == 0
            let speed = 0.35 + Double(i % 3) * 0.12
            let direction: Double = i % 4 < 2 ? 1 : -1
            var t = (time * speed + Double(i) * 1.7).truncatingRemainder(dividingBy: 7.6)
            if direction < 0 { t = 7.6 - t }
            let along = t - 0.3
            let lane = 3.5 + (direction > 0 ? 0.18 : -0.18)
            return Car(
                c: horizontal ? along : lane,
                r: horizontal ? lane : along,
                horizontal: horizontal,
                color: Color(hex: UInt32(palette[i % palette.count]))
            )
        }
    }

    private func drawCar(_ context: inout GraphicsContext, _ car: Car) {
        let (w, d) = car.horizontal ? (0.3, 0.16) : (0.16, 0.3)
        box(&context, c: car.c - w / 2, r: car.r - d / 2, w: w, d: d, h: 0.1, color: car.color)
    }
}

extension Color {
    /// Rengi bir katsayıyla koyulaştırır/açar (yüz gölgesi için).
    func shade(_ factor: Double) -> Color {
        let ui = UIColor(self)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        ui.getRed(&r, green: &g, blue: &b, alpha: &a)
        return Color(.sRGB, red: min(1, r * factor), green: min(1, g * factor), blue: min(1, b * factor), opacity: a)
    }

    func mix(with other: Color, _ amount: Double) -> Color {
        let a = UIColor(self), b = UIColor(other)
        var r1: CGFloat = 0, g1: CGFloat = 0, b1: CGFloat = 0, a1: CGFloat = 0
        var r2: CGFloat = 0, g2: CGFloat = 0, b2: CGFloat = 0, a2: CGFloat = 0
        a.getRed(&r1, green: &g1, blue: &b1, alpha: &a1)
        b.getRed(&r2, green: &g2, blue: &b2, alpha: &a2)
        let t = CGFloat(amount)
        return Color(.sRGB, red: r1 + (r2 - r1) * t, green: g1 + (g2 - g1) * t, blue: b1 + (b2 - b1) * t, opacity: a1 + (a2 - a1) * t)
    }
}
