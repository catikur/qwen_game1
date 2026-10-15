import SwiftUI
import UIKit
import CapitalForgeLiteKit

/// İzometrik şehir (L5, "Cam & Bulut"): gökyüzünde süzülen bir ada. 7×7 karelik
/// ızgara, ortada iki yol. Her zincirin üç kademesi bir sıra parsel (ham →
/// işleme → satış); bina seviyeyle yükseliyor, işleme tesisinin bacası
/// tütüyor, yollarda araçlar akıyor. Gündüz bulutlar, gece yıldızlar, ay,
/// yanan pencereler, sokak lambaları ve farlar. Hiçbir görsel dosya yok:
/// hepsi Canvas.
struct CityView: View {
    @Environment(GameStore.self) private var store
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let state = store.state
        let palette = CityPalette(scheme)
        TimelineView(.animation(minimumInterval: 1.0 / 30)) { timeline in
            Canvas { context, size in
                let painter = IsoPainter(size: size, palette: palette)
                painter.draw(in: &context, state: state, time: timeline.date.timeIntervalSinceReferenceDate)
            }
        }
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

    static func isClaimed(_ c: Int, _ r: Int) -> Bool {
        ChainId.allCases.contains { chain in tiles(chain).contains { $0 == (c, r) } } || port.contains { $0 == (c, r) }
    }
}

/// Şehrin ışığı: gündüz ve gece ayrı. Canvas'ta dinamik renk yerine düz renk.
struct CityPalette {
    let night: Bool
    let grass: (Color, Color)
    let road: Color
    let dash: Color
    let side: (Color, Color)
    let lip: Color
    let wall: (Color, Color, Color)
    let window: Color
    let windowOff: Color
    let glint: Color
    let water: (Color, Color)
    let tree: (Color, Color)
    let shadow: Color
    let smoke: Color
    let empty: Color

    init(_ scheme: ColorScheme) {
        night = scheme == .dark
        if night {
            grass = (Color(hex: 0x2C6A58), Color(hex: 0x286150))
            road = Color(hex: 0x28345A)
            dash = Color(hex: 0xFFD37A)
            side = (Color(hex: 0x3C3358), Color(hex: 0x2F2848))
            lip = Color(hex: 0x3A8C6E)
            wall = (Color(hex: 0xC3CFF0), Color(hex: 0x8F9FCC), Color(hex: 0x6F80B2))
            window = Color(hex: 0xFFD37A)
            windowOff = Color(hex: 0x33467A)
            glint = Color(hex: 0xFFF4CC)
            water = (Color(hex: 0x1E4C8E), Color(hex: 0x143A72))
            tree = (Color(hex: 0x1E5A47), Color(hex: 0x2F7C60))
            shadow = Color(hex: 0x000010, alpha: 0.38)
            smoke = Color(hex: 0xBECDF0, alpha: 0.35)
            empty = Color(hex: 0x9FB6E0, alpha: 0.35)
        } else {
            grass = (Color(hex: 0xA6E58E), Color(hex: 0x98DC7F))
            road = Color(hex: 0xB5C3D3)
            dash = .white
            side = (Color(hex: 0xB9875A), Color(hex: 0x9B6C43))
            lip = Color(hex: 0x86CF6C)
            wall = (.white, Color(hex: 0xF1F5FA), Color(hex: 0xDDE6F0))
            window = Color(hex: 0x7FD0FF)
            windowOff = Color(hex: 0x7FD0FF)
            glint = .white
            water = (Color(hex: 0x6FD4FF), Color(hex: 0x3EB6F2))
            tree = (Color(hex: 0x43B05A), Color(hex: 0x6ED36E))
            shadow = Color(hex: 0x1D3557, alpha: 0.18)
            smoke = Color(hex: 0xFFFFFF, alpha: 0.92)
            empty = Color(hex: 0x507850, alpha: 0.45)
        }
    }

    /// Zincirin çatı rengi: üst (açık) ve yan (koyu).
    func chain(_ id: ChainId) -> (Color, Color) {
        let pair: (UInt32, UInt32) = switch (id, night) {
        case (.bakery, false): (0xFFD25E, 0xFFB020)
        case (.bakery, true): (0xF2C24E, 0xD99A1C)
        case (.coffee, false): (0xB47A4F, 0x8C5632)
        case (.coffee, true): (0xA06E48, 0x7A4E2E)
        case (.fashion, false): (0xDA8BF0, 0xB85DD6)
        case (.fashion, true): (0xC77EE3, 0x9D52C2)
        case (.leather, false): (0xFF7A7A, 0xE04848)
        case (.leather, true): (0xF06A6A, 0xC43E44)
        case (.tech, false): (0x5CC8FF, 0x2E9CE8)
        case (.tech, true): (0x4DB6F0, 0x2A88D4)
        }
        return (Color(hex: pair.0), Color(hex: pair.1))
    }
}

struct IsoPainter {
    let size: CGSize
    let palette: CityPalette
    let tileWidth: CGFloat
    let origin: CGPoint

    init(size: CGSize, palette: CityPalette) {
        self.size = size
        self.palette = palette
        // 7 kare enine sığsın; altta adanın yanlarına, üstte binalara yer kalsın.
        tileWidth = min(size.width / 7.4, size.height / 3.95)
        // Yüksek kutuda (iPad yatay) ada dikeyde ortalanıyor; telefonda ve iPad
        // dikeyde ilk değer büyük kalıyor, görünüm değişmiyor.
        origin = CGPoint(x: size.width / 2, y: max(size.height * 0.21, (size.height - tileWidth * 3.8) / 2 + tileWidth * 0.55))
    }

    var tileHeight: CGFloat { tileWidth / 2 }

    /// Karenin (c, r) köşesinin ekran konumu; `z` kare birimiyle yükseklik.
    func point(_ c: Double, _ r: Double, _ z: Double = 0) -> CGPoint {
        CGPoint(
            x: origin.x + CGFloat(c - r) * tileWidth / 2,
            y: origin.y + CGFloat(c + r) * tileHeight / 2 - CGFloat(z) * tileWidth * 0.62
        )
    }

    /// Ölçek: çizim ayrıntıları (pencere, araç) kare genişliğine göre.
    private var unit: CGFloat { tileWidth / 52 }

    func draw(in context: inout GraphicsContext, state: LiteState, time: Double) {
        drawSky(&context, time: time)
        drawIsland(&context)
        drawGround(&context, state: state)

        var items: [(depth: Double, draw: (inout GraphicsContext) -> Void)] = []
        for chain in ChainId.allCases {
            let unlocked = Lite.chainUnlocked(state, chain)
            let levels = state[chain: chain].levels
            for (stage, tile) in zip(Stage.allCases, CityLayout.tiles(chain)) {
                let level = levels[stage.rawValue]
                let (c, r) = (Double(tile.0), Double(tile.1))
                items.append((depth: c + r, draw: { (ctx: inout GraphicsContext) in
                    self.drawBuilding(&ctx, chain: chain, stage: stage, level: level, unlocked: unlocked, c: c, r: r, time: time)
                }))
            }
        }
        // Ağaçlar: boş parsellerin yarısında, üçerli kümeler.
        var empty = 0
        for r in 0..<CityLayout.size {
            for c in 0..<CityLayout.size where !CityLayout.isRoad(c, r) && !CityLayout.isClaimed(c, r) {
                empty += 1
                guard empty % 2 == 1 else { continue }
                for k in 0..<3 {
                    let (dc, dr) = (Double(c), Double(r))
                    items.append((depth: dc + dr + 0.05 * Double(k), draw: { (ctx: inout GraphicsContext) in self.drawTree(&ctx, c: dc, r: dr, k: k) }))
                }
            }
        }
        if Lite.districtUnlocked(state, .port) {
            for (index, tile) in CityLayout.port.enumerated() {
                let (c, r) = (Double(tile.0), Double(tile.1))
                items.append((depth: c + r + 0.3, draw: { (ctx: inout GraphicsContext) in self.drawCrane(&ctx, c: c, r: r, index: index) }))
            }
        }
        for car in cars(state: state, time: time) {
            items.append((depth: car.c + car.r + 0.5, draw: { (ctx: inout GraphicsContext) in self.drawCar(&ctx, car) }))
        }
        for item in items.sorted(by: { $0.depth < $1.depth }) { item.draw(&context) }
        if palette.night { drawLamps(&context) }
    }

    // MARK: - Gökyüzü ve ada

    private func drawSky(_ context: inout GraphicsContext, time: Double) {
        if palette.night {
            // Yıldızlar sabit tohumla; hafif göz kırpma.
            var seed: UInt64 = 7
            func next() -> Double {
                seed = seed &* 6364136223846793005 &+ 1442695040888963407
                return Double(seed >> 33) / Double(1 << 31)
            }
            for i in 0..<46 {
                let x = CGFloat(next()) * size.width, y = CGFloat(next()) * size.height * 0.5, r = CGFloat(0.4 + next() * 0.9)
                let twinkle = 0.5 + 0.5 * sin(time * (0.8 + Double(i % 5) * 0.3) + Double(i))
                let alpha = (0.3 + next() * 0.5) * (0.6 + 0.4 * twinkle)
                context.fill(Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)), with: .color(Color(hex: 0xFFFFF0, alpha: alpha)))
            }
            let moon = CGPoint(x: size.width * 0.86, y: size.height * 0.13)
            let halo = 46 * unit
            context.fill(
                Path(ellipseIn: CGRect(x: moon.x - halo, y: moon.y - halo, width: halo * 2, height: halo * 2)),
                with: .radialGradient(Gradient(colors: [Color(hex: 0xFFF0C8, alpha: 0.35), Color(hex: 0xFFF0C8, alpha: 0)]), center: moon, startRadius: 4, endRadius: halo)
            )
            let m = 11 * unit
            context.fill(Path(ellipseIn: CGRect(x: moon.x - m, y: moon.y - m, width: m * 2, height: m * 2)), with: .color(Color(hex: 0xFFF2CC)))
            context.fill(Path(ellipseIn: CGRect(x: moon.x - m + 5 * unit, y: moon.y - m - 3 * unit, width: m * 1.75, height: m * 1.75)), with: .color(Color(hex: 0x15275A)))
            drawClouds(&context, color: Color(hex: 0x7896E6, alpha: 0.2), time: time)
        } else {
            drawClouds(&context, color: Color(hex: 0xFFFFFF, alpha: 0.85), time: time)
        }
    }

    private func drawClouds(_ context: inout GraphicsContext, color: Color, time: Double) {
        let clouds: [(Double, Double, Double)] = [(0.08, 0.2, 1), (0.8, 0.12, 0.8), (0.74, 0.56, 0.6)]
        for (index, cloud) in clouds.enumerated() {
            // Bulutlar çok yavaş sürükleniyor.
            let drift = CGFloat(sin(time / 40 + Double(index) * 2)) * 8 * unit
            let x = size.width * CGFloat(cloud.0) + drift, y = size.height * CGFloat(cloud.1), s = CGFloat(cloud.2) * unit
            var path = Path()
            path.addEllipse(in: CGRect(x: x - 12 * s, y: y - 12 * s, width: 24 * s, height: 24 * s))
            path.addEllipse(in: CGRect(x: x - 1 * s, y: y - 21 * s, width: 30 * s, height: 30 * s))
            path.addEllipse(in: CGRect(x: x + 19 * s, y: y - 11 * s, width: 22 * s, height: 22 * s))
            context.fill(path, with: .color(color))
        }
    }

    private func drawIsland(_ context: inout GraphicsContext) {
        let center = point(3.5, 3.5)
        let shadowRect = CGRect(x: center.x - tileWidth * 4, y: center.y + 40 * unit - tileHeight * 2.1, width: tileWidth * 8, height: tileHeight * 4.2)
        context.fill(Path(ellipseIn: shadowRect), with: .color(palette.night ? Color(hex: 0x000014, alpha: 0.35) : Color(hex: 0x285078, alpha: 0.14)))

        let g1 = point(7, 0), g2 = point(7, 7), g3 = point(0, 7)
        let depth = 15 * unit
        var left = Path()
        left.addLines([g3, g2, CGPoint(x: g2.x, y: g2.y + depth), CGPoint(x: g3.x, y: g3.y + depth)])
        left.closeSubpath()
        context.fill(left, with: .linearGradient(Gradient(colors: [palette.side.0, palette.side.0.shade(0.88)]), startPoint: g3, endPoint: CGPoint(x: g3.x, y: g3.y + depth)))
        var right = Path()
        right.addLines([g2, g1, CGPoint(x: g1.x, y: g1.y + depth), CGPoint(x: g2.x, y: g2.y + depth)])
        right.closeSubpath()
        context.fill(right, with: .linearGradient(Gradient(colors: [palette.side.1, palette.side.1.shade(0.88)]), startPoint: g2, endPoint: CGPoint(x: g2.x, y: g2.y + depth)))
        var lip = Path()
        lip.addLines([CGPoint(x: g3.x, y: g3.y + 1.5), CGPoint(x: g2.x, y: g2.y + 1.5), CGPoint(x: g1.x, y: g1.y + 1.5)])
        context.stroke(lip, with: .color(palette.lip), style: StrokeStyle(lineWidth: 3 * unit, lineJoin: .round))
    }

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
        let port = Lite.districtUnlocked(state, .port)
        for r in 0..<CityLayout.size {
            for c in 0..<CityLayout.size {
                let (dc, dr) = (Double(c), Double(r))
                if CityLayout.isRoad(c, r) {
                    context.fill(diamond(dc, dr), with: .color(palette.road))
                } else if port && CityLayout.port.contains(where: { $0 == (c, r) }) {
                    context.fill(diamond(dc, dr), with: .linearGradient(Gradient(colors: [palette.water.0, palette.water.1]), startPoint: point(dc, dr), endPoint: point(dc + 1, dr + 1)))
                } else {
                    context.fill(diamond(dc, dr), with: .color((c + r) % 2 == 0 ? palette.grass.0 : palette.grass.1))
                    if CityLayout.port.contains(where: { $0 == (c, r) }) {
                        context.stroke(diamond(dc, dr, inset: 0.12), with: .color(palette.empty), style: StrokeStyle(lineWidth: 1.2, dash: [3, 3]))
                    }
                }
            }
        }
        if port {
            // Suda ışık çizgileri (gece ay ışığı).
            var glints = Path()
            let glintSpots: [(Double, Double, CGFloat)] = [(4.5, 6.5, 4), (5.4, 6.4, 6), (6.2, 6.6, 4)]
            for (c, r, w) in glintSpots {
                let p = point(c, r)
                glints.move(to: CGPoint(x: p.x - w * unit, y: p.y))
                glints.addLine(to: CGPoint(x: p.x + w * unit, y: p.y))
            }
            context.stroke(glints, with: .color(palette.night ? Color(hex: 0xFFF0C8, alpha: 0.45) : Color.white.opacity(0.7)), style: StrokeStyle(lineWidth: 1.3, lineCap: .round))
        }
        var dashes = Path()
        for i in 0..<CityLayout.size where i != 3 {
            let t = Double(i)
            dashes.move(to: point(t + 0.3, 3.5))
            dashes.addLine(to: point(t + 0.7, 3.5))
            dashes.move(to: point(3.5, t + 0.3))
            dashes.addLine(to: point(3.5, t + 0.7))
        }
        context.stroke(dashes, with: .color(palette.dash), style: StrokeStyle(lineWidth: 1.6 * unit, lineCap: .round))
    }

    // MARK: - Binalar

    /// Kutu: (c, r) karesinin içinde, kenar payı m, z0'dan h yüksekliğe.
    @discardableResult
    private func box(_ context: inout GraphicsContext, c: Double, r: Double, m: Double, z0: Double = 0, h: Double, top: GraphicsContext.Shading, left: GraphicsContext.Shading, right: GraphicsContext.Shading) -> (a: CGPoint, b: CGPoint, d: CGPoint) {
        let c0 = c + m, c1 = c + 1 - m, r0 = r + m, r1 = r + 1 - m
        var leftFace = Path()
        leftFace.addLines([point(c0, r1, z0), point(c1, r1, z0), point(c1, r1, z0 + h), point(c0, r1, z0 + h)])
        leftFace.closeSubpath()
        var rightFace = Path()
        rightFace.addLines([point(c1, r1, z0), point(c1, r0, z0), point(c1, r0, z0 + h), point(c1, r1, z0 + h)])
        rightFace.closeSubpath()
        var topFace = Path()
        topFace.addLines([point(c0, r0, z0 + h), point(c1, r0, z0 + h), point(c1, r1, z0 + h), point(c0, r1, z0 + h)])
        topFace.closeSubpath()
        context.fill(leftFace, with: left)
        context.fill(rightFace, with: right)
        context.fill(topFace, with: top)
        return (point(c0, r1, z0 + h), point(c1, r1, z0 + h), point(c1, r0, z0 + h))
    }

    private func height(_ stage: Stage, _ level: Int) -> Double {
        let grow = min(1, log2(1 + Double(level)) / log2(101))
        return stage == .process ? 0.62 + grow * 0.55 : 0.55 + grow * 0.75
    }

    private func drawBuilding(_ context: inout GraphicsContext, chain: ChainId, stage: Stage, level: Int, unlocked: Bool, c: Double, r: Double, time: Double) {
        guard unlocked else {
            context.stroke(diamond(c, r, inset: 0.12), with: .color(palette.empty), style: StrokeStyle(lineWidth: 1.2, dash: [3, 3]))
            return
        }
        let (roofTop, roofSide) = palette.chain(chain)
        guard level > 0 else {
            context.stroke(diamond(c, r, inset: 0.12), with: .color(roofSide.opacity(0.8)), style: StrokeStyle(lineWidth: 1.4, dash: [4, 3]))
            return
        }
        if stage == .raw {
            drawField(&context, c: c, r: r, colors: (roofTop, roofSide))
            return
        }
        let m = 0.15
        let h = height(stage, level)
        // Yumuşak gölge.
        let base = point(c + 0.55, r + 0.62)
        context.fill(Path(ellipseIn: CGRect(x: base.x - tileWidth * 0.46, y: base.y - tileHeight * 0.44, width: tileWidth * 0.96, height: tileHeight * 0.92)), with: .color(palette.shadow))
        // Gövde: açık duvarlar, aşağı doğru hafif koyulaşan.
        box(&context, c: c, r: r, m: m, h: h,
            top: .color(palette.wall.0),
            left: .linearGradient(Gradient(colors: [palette.wall.1, palette.wall.1.shade(0.94)]), startPoint: point(c, r + 1, h), endPoint: point(c, r + 1, 0)),
            right: .linearGradient(Gradient(colors: [palette.wall.2, palette.wall.2.shade(0.92)]), startPoint: point(c + 1, r, h), endPoint: point(c + 1, r, 0)))
        // Çatı plakası: zincir rengi, biraz taşkın; üst kenarında ışık çizgisi.
        let roof = box(&context, c: c, r: r, m: m - 0.035, z0: h, h: 0.17,
                       top: .color(roofTop.shade(1.08)), left: .color(roofTop), right: .color(roofSide))
        var rim = Path()
        rim.addLines([roof.a, roof.b, roof.d])
        context.stroke(rim, with: .color(.white.opacity(0.55)), lineWidth: 1)
        drawWindows(&context, c: c, r: r, m: m, h: h, rows: stage == .process ? 2 : 3)
        if stage == .process {
            let foot = point(c + 0.66, r + 0.32, h + 0.17), head = point(c + 0.66, r + 0.32, h + 0.65)
            let w = 6.4 * unit
            context.fill(Path(roundedRect: CGRect(x: foot.x - w / 2, y: head.y, width: w, height: foot.y - head.y), cornerRadius: 1.5), with: .color(roofSide.shade(0.85)))
            context.fill(Path(CGRect(x: foot.x - w / 2, y: head.y, width: w, height: 2 * unit)), with: .color(roofTop.shade(1.15)))
            drawSmoke(&context, at: head, time: time, seed: c * 0.37 + r * 0.61)
        } else {
            drawAwning(&context, c: c, r: r, m: m, color: roofTop)
        }
    }

    private func drawField(_ context: inout GraphicsContext, c: Double, r: Double, colors: (Color, Color)) {
        context.fill(diamond(c, r, inset: 0.08), with: .linearGradient(Gradient(colors: [colors.0.mix(with: .white, 0.35), colors.0.mix(with: .white, 0.15)]), startPoint: point(c, r), endPoint: point(c + 1, r + 1)))
        var rows = Path()
        for k in 1...4 {
            let t = Double(k) * 0.2
            rows.move(to: point(c + 0.16, r + t))
            rows.addLine(to: point(c + 0.84, r + t))
        }
        context.stroke(rows, with: .color(colors.1), style: StrokeStyle(lineWidth: 1.6 * unit, lineCap: .round))
    }

    private func drawWindows(_ context: inout GraphicsContext, c: Double, r: Double, m: Double, h: Double, rows: Int) {
        let w = 4.8 * unit, hh = 5 * unit
        for row in 0..<rows {
            let z = h * (Double(row) + 0.5) / (Double(rows) + 0.3)
            for j in 0..<3 {
                let u = c + m + (Double(j) + 0.62) * ((1 - 2 * m) / 3.35)
                let p = point(u, r + 1 - m, z)
                let lit = !palette.night || (row * 3 + j + Int(c) * 5 + Int(r) * 3) % 4 != 0
                if palette.night && lit {
                    let glow = 7 * unit
                    context.fill(
                        Path(ellipseIn: CGRect(x: p.x - glow, y: p.y - 1 - glow, width: glow * 2, height: glow * 2)),
                        with: .radialGradient(Gradient(colors: [Color(hex: 0xFFCD6E, alpha: 0.45), Color(hex: 0xFFCD6E, alpha: 0)]), center: CGPoint(x: p.x, y: p.y - 1), startRadius: 0, endRadius: glow)
                    )
                }
                context.fill(Path(roundedRect: CGRect(x: p.x - w / 2, y: p.y - hh * 0.7, width: w, height: hh), cornerRadius: 1.6 * unit), with: .color(lit ? palette.window : palette.windowOff))
                if lit { context.fill(Path(CGRect(x: p.x - w / 2 + 0.8 * unit, y: p.y - hh * 0.58, width: 1.4 * unit, height: 1.6 * unit)), with: .color(palette.glint)) }
            }
            // Sağ yüzde tek pencere.
            let q = point(c + 1 - m, r + 0.5, z)
            let side = palette.night ? (row % 2 == 0 ? Color(hex: 0xE8B85A) : Color(hex: 0x2B3C6C)) : palette.window.shade(0.9)
            context.fill(Path(roundedRect: CGRect(x: q.x + 2 * unit, y: q.y - hh * 0.72, width: w, height: hh), cornerRadius: 1.6 * unit), with: .color(side))
        }
    }

    private func drawAwning(_ context: inout GraphicsContext, c: Double, r: Double, m: Double, color: Color) {
        let a = point(c + m, r + 1 - m, 0.4), b = point(c + 1 - m, r + 1 - m, 0.4)
        let a3 = CGPoint(x: a.x - 2.5 * unit, y: a.y + 5 * unit), b3 = CGPoint(x: b.x - 2.5 * unit, y: b.y + 5 * unit)
        if palette.night {
            let center = CGPoint(x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 10 * unit)
            let glow = 22 * unit
            context.fill(
                Path(ellipseIn: CGRect(x: center.x - glow, y: center.y - glow, width: glow * 2, height: glow * 2)),
                with: .radialGradient(Gradient(colors: [Color(hex: 0xFFD278, alpha: 0.35), Color(hex: 0xFFD278, alpha: 0)]), center: center, startRadius: 0, endRadius: glow)
            )
        }
        var awning = Path()
        awning.addLines([a, b, b3, a3])
        awning.closeSubpath()
        context.fill(awning, with: .color(color))
        var stripes = Path()
        for k in 1..<4 {
            let t = CGFloat(k) / 4
            stripes.move(to: CGPoint(x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t))
            stripes.addLine(to: CGPoint(x: a3.x + (b3.x - a3.x) * t, y: a3.y + (b3.y - a3.y) * t))
        }
        context.stroke(stripes, with: .color(.white.opacity(0.85)), lineWidth: 1.6 * unit)
    }

    private func drawSmoke(_ context: inout GraphicsContext, at head: CGPoint, time: Double, seed: Double) {
        let phase = seed.truncatingRemainder(dividingBy: 1)
        for k in 0..<4 {
            let age = (time / 3.2 + phase + Double(k) / 4).truncatingRemainder(dividingBy: 1)
            let x = head.x + CGFloat(age) * 16 * unit, y = head.y - CGFloat(age) * 22 * unit - 3 * unit
            let radius = (3 + CGFloat(age) * 6) * unit
            let alpha = age < 0.7 ? 1 : (1 - age) / 0.3
            context.fill(Path(ellipseIn: CGRect(x: x - radius, y: y - radius, width: radius * 2, height: radius * 2)), with: .color(palette.smoke.opacity(alpha)))
        }
    }

    private func drawTree(_ context: inout GraphicsContext, c: Double, r: Double, k: Int) {
        let p = point(c + 0.3 + Double(k % 2) * 0.42, r + 0.33 + (k > 1 ? 0.38 : 0))
        context.fill(Path(ellipseIn: CGRect(x: p.x - 5 * unit, y: p.y - 1.6 * unit, width: 12 * unit, height: 5 * unit)), with: .color(palette.shadow))
        context.fill(Path(CGRect(x: p.x - 1.2 * unit, y: p.y - 6 * unit, width: 2.4 * unit, height: 6 * unit)), with: .color(Color(hex: 0x8A5A3B)))
        let crown = CGPoint(x: p.x, y: p.y - 10.5 * unit)
        let radius = 6.8 * unit
        context.fill(
            Path(ellipseIn: CGRect(x: crown.x - radius, y: crown.y - radius, width: radius * 2, height: radius * 2)),
            with: .radialGradient(Gradient(colors: [palette.tree.1, palette.tree.0]), center: CGPoint(x: crown.x - 2 * unit, y: crown.y - 2.5 * unit), startRadius: 1, endRadius: radius * 1.2)
        )
    }

    private func drawCrane(_ context: inout GraphicsContext, c: Double, r: Double, index: Int) {
        let foot = point(c + 0.5, r + 0.22)
        var arm = Path()
        arm.move(to: foot)
        arm.addLine(to: CGPoint(x: foot.x, y: foot.y - 26 * unit))
        arm.addLine(to: CGPoint(x: foot.x + 15 * unit, y: foot.y - 30 * unit))
        context.stroke(arm, with: .color(palette.night ? Color(hex: 0xD9A23A) : Color(hex: 0xF2A93B)), style: StrokeStyle(lineWidth: 2.6 * unit, lineCap: .round, lineJoin: .round))
        let cargo = [Color(hex: 0xE35D5D), Color(hex: 0x3D8BFF), Color(hex: 0xE35D5D)][index % 3]
        context.fill(Path(roundedRect: CGRect(x: foot.x + 8 * unit, y: foot.y - 22 * unit, width: 7 * unit, height: 6 * unit), cornerRadius: 1.5), with: .color(cargo))
    }

    private func drawLamps(_ context: inout GraphicsContext) {
        for (c, r) in [(3.0, 1.0), (3.0, 5.0), (1.0, 3.0), (5.0, 3.0), (3.0, 0.1), (0.1, 3.0), (6.2, 3.0)] {
            let p = point(c + 0.04, r + 0.04)
            var pole = Path()
            pole.move(to: p)
            pole.addLine(to: CGPoint(x: p.x, y: p.y - 10 * unit))
            context.stroke(pole, with: .color(Color(hex: 0x55638F)), lineWidth: 1.2)
            let bulb = CGPoint(x: p.x, y: p.y - 11 * unit)
            let glow = 18 * unit
            context.fill(
                Path(ellipseIn: CGRect(x: bulb.x - glow, y: bulb.y - glow, width: glow * 2, height: glow * 2)),
                with: .radialGradient(Gradient(colors: [Color(hex: 0xFFD68C, alpha: 0.55), Color(hex: 0xFFD68C, alpha: 0)]), center: bulb, startRadius: 0, endRadius: glow)
            )
            context.fill(Path(ellipseIn: CGRect(x: bulb.x - 1.8, y: bulb.y - 1.8, width: 3.6, height: 3.6)), with: .color(Color(hex: 0xFFE7B0)))
        }
    }

    // MARK: - Araçlar

    struct Car {
        let c: Double
        let r: Double
        let horizontal: Bool
        let forward: Bool
        let color: Color
    }

    private func cars(state: LiteState, time: Double) -> [Car] {
        let selling = ChainId.allCases.filter { Lite.chainUnlocked(state, $0) && state[chain: $0].levels[2] > 0 }
        let count = min(10, 2 + selling.count * 2)
        let palette: [UInt32] = self.palette.night
            ? [0x3D5BA8, 0xC94D58, 0xD9A63A, 0x9FB0D9]
            : [0xFF5E6C, 0x3D8BFF, 0xFFD23F, 0xFFFFFF, 0x2EC27E]
        return (0..<count).map { i in
            let horizontal = i % 2 == 0
            let speed = 0.35 + Double(i % 3) * 0.12
            let forward = i % 4 < 2
            var t = (time * speed + Double(i) * 1.7).truncatingRemainder(dividingBy: 7.6)
            if !forward { t = 7.6 - t }
            let along = t - 0.3
            let lane = 3.5 + (forward ? 0.18 : -0.18)
            return Car(c: horizontal ? along : lane, r: horizontal ? lane : along, horizontal: horizontal, forward: forward,
                       color: Color(hex: palette[i % palette.count]))
        }
    }

    private func drawCar(_ context: inout GraphicsContext, _ car: Car) {
        // Adanın dışına taşan araç çizilmiyor (yol kenarında beliriyor).
        guard car.c > -0.1, car.c < 7.1, car.r > -0.1, car.r < 7.1 else { return }
        let p = point(car.c, car.r)
        var ctx = context
        ctx.translateBy(x: p.x, y: p.y)
        // Yol yönü ekranda ±26,6°; geri giden araç ters yöne bakıyor.
        let angle = atan2(Double(tileHeight), Double(tileWidth))
        let heading = car.horizontal ? angle : .pi - angle
        ctx.rotate(by: .radians(car.forward ? heading : heading + .pi))
        let w = 11 * unit, h = 6 * unit
        ctx.fill(Path(roundedRect: CGRect(x: -w / 2, y: -h / 2 + 2 * unit, width: w, height: h), cornerRadius: h / 2), with: .color(.black.opacity(0.12)))
        ctx.fill(Path(roundedRect: CGRect(x: -w / 2, y: -h / 2, width: w, height: h), cornerRadius: h / 2), with: .color(car.color))
        ctx.fill(Path(CGRect(x: -1.5 * unit, y: -h / 2 + 0.6 * unit, width: 3.5 * unit, height: 2 * unit)), with: .color(.white.opacity(0.6)))
        if palette.night {
            let beam = CGRect(x: w / 2 - 1 * unit, y: -5 * unit, width: 22 * unit, height: 10 * unit)
            ctx.fill(Path(ellipseIn: beam), with: .radialGradient(Gradient(colors: [Color(hex: 0xFFF0BE, alpha: 0.55), Color(hex: 0xFFF0BE, alpha: 0)]), center: CGPoint(x: w / 2, y: 0), startRadius: 0, endRadius: 12 * unit))
            ctx.fill(Path(ellipseIn: CGRect(x: w / 2 - 1.6 * unit, y: -h / 2 + 0.4 * unit, width: 2.2 * unit, height: 2.2 * unit)), with: .color(Color(hex: 0xFFF4C8)))
            ctx.fill(Path(ellipseIn: CGRect(x: w / 2 - 1.6 * unit, y: h / 2 - 2.6 * unit, width: 2.2 * unit, height: 2.2 * unit)), with: .color(Color(hex: 0xFFF4C8)))
        }
    }
}

extension Color {
    /// Rengi bir katsayıyla koyulaştırır/açar (yüz gölgesi için). Düz sRGB renkler için.
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
