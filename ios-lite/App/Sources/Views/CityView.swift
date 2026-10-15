import SwiftUI
import UIKit
import CapitalForgeLiteKit

/// İzometrik şehir (L5, "Cam & Bulut"): gökyüzünde süzülen bir ada. 7×7 karelik
/// ızgara, ortada iki yol. Her zincirin üç kademesi bir sıra parsel (ham →
/// işleme → satış); işleme tesisinin bacası tütüyor, yollarda araçlar akıyor.
/// Gündüz bulutlar, gece yıldızlar, ay, yanan pencereler, sokak lambaları ve
/// farlar. Hiçbir görsel dosya yok: hepsi Canvas.
///
/// L7: ada dolunca da şehir değişmeye devam ediyor.
/// - Bina kademeleri: dükkân → orta kat → kule → simge yapı. Binalar uzadıkça
///   kamera biraz geri çekiliyor.
/// - Takımada: köprüyle bağlı adalar yatay sayfalar; üstte küçük ada haritası.
/// - Şehir teması her holding turunda değişiyor: sahil, dağ, çöl, kar.
struct CityView: View {
    @Environment(GameStore.self) private var store
    @State private var page: Int?

    init() {
        // CI kareleri: `-liteIsland <n>` o adanın sayfasıyla açılıyor.
        let arguments = ProcessInfo.processInfo.arguments
        var initial = 0
        if let index = arguments.firstIndex(of: "-liteIsland"), index + 1 < arguments.count, let value = Int(arguments[index + 1]) {
            initial = value
        }
        _page = State(initialValue: initial)
    }

    var body: some View {
        let state = store.state
        let islands = (0..<LiteContent.islandCount).filter { Lite.islandUnlocked(state, $0) }
        let showMap = islands.count > 1 || Lite.districtUnlocked(state, .technopark)
        Group {
            if islands.count > 1 {
                ScrollView(.horizontal) {
                    LazyHStack(spacing: 0) {
                        ForEach(islands, id: \.self) { island in
                            IslandCanvas(island: island)
                                .containerRelativeFrame([.horizontal, .vertical])
                                .id(island)
                        }
                    }
                    .scrollTargetLayout()
                }
                .scrollTargetBehavior(.paging)
                .scrollIndicators(.hidden)
                .scrollPosition(id: $page)
            } else {
                IslandCanvas(island: 0)
            }
        }
        .overlay(alignment: .topLeading) {
            if showMap {
                IslandMap(state: state, page: $page)
                    .padding(.leading, 12)
                    .padding(.top, 6)
            }
        }
        .accessibilityIdentifier("city")
    }
}

/// Adalar arasında küçük harita: açık adalar renkli, sıradaki kilitli.
struct IslandMap: View {
    let state: LiteState
    @Binding var page: Int?

    var body: some View {
        let current = page ?? 0
        HStack(spacing: 6) {
            ForEach(0..<LiteContent.islandCount, id: \.self) { island in
                let open = Lite.islandUnlocked(state, island)
                let colors = IslandMap.colors(island)
                Button {
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) { page = island }
                } label: {
                    ZStack {
                        Circle()
                            .fill(open ? LinearGradient(colors: [colors.0, colors.1], startPoint: .top, endPoint: .bottom)
                                       : LinearGradient(colors: [Theme.track, Theme.track], startPoint: .top, endPoint: .bottom))
                        Image(systemName: open ? IslandMap.icon(island) : "lock.fill")
                            .font(.system(size: open ? 10 : 8, weight: .heavy))
                            .foregroundStyle(open ? Color.white : Theme.soft)
                    }
                    .frame(width: current == island ? 24 : 20, height: current == island ? 24 : 20)
                    .overlay(Circle().strokeBorder(Color.white.opacity(current == island ? 0.95 : 0), lineWidth: 2))
                    .shadow(color: Theme.cardShadow, radius: current == island ? 3 : 0, y: 1)
                }
                .buttonStyle(.plain)
                .disabled(!open)
                .accessibilityLabel(IslandMap.name(island))
            }
            Text(IslandMap.caption(state, current))
                .font(Theme.text(10.5, .heavy))
                .foregroundStyle(Theme.ink)
                .lineLimit(1)
                .padding(.trailing, 4)
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 4)
        .background(.ultraThinMaterial, in: Capsule())
        .overlay(Capsule().strokeBorder(Theme.cardBorder, lineWidth: 1))
    }

    static func chain(_ island: Int) -> ChainId? {
        island == 0 ? nil : LiteContent.chains.first { LiteContent.district($0.district).island == island }?.id
    }

    static func name(_ island: Int) -> String {
        guard let chain = chain(island) else { return L10n.t("island.main") }
        return L10n.districtName(LiteContent.chain(chain).district)
    }

    static func icon(_ island: Int) -> String {
        guard let chain = chain(island) else { return "house.fill" }
        return Theme.chainIcon(chain)
    }

    static func colors(_ island: Int) -> (Color, Color) {
        guard let chain = chain(island) else { return (Color(hex: 0xFFC46B), Color(hex: 0xFF9A3D)) }
        return Theme.chainColors(chain)
    }

    /// Şu anki adanın adı; sıradaki ada kilitliyse köprünün açılacağı kazanç.
    static func caption(_ state: LiteState, _ current: Int) -> String {
        let next = (0..<LiteContent.islandCount).first { !Lite.islandUnlocked(state, $0) }
        if let next, current == next - 1, let chain = chain(next) {
            return name(current) + " · " + L10n.t("island.locked", Format.money(LiteContent.chain(chain).unlockAt))
        }
        return name(current)
    }
}

/// Bir adanın canlı çizimi.
struct IslandCanvas: View {
    @Environment(GameStore.self) private var store
    @Environment(\.colorScheme) private var scheme
    let island: Int

    var body: some View {
        let state = store.state
        let palette = CityPalette(scheme, theme: Lite.cityTheme(state.city))
        TimelineView(.animation(minimumInterval: 1.0 / 30)) { timeline in
            Canvas { context, size in
                let painter = IsoPainter(size: size, palette: palette, island: island, state: state)
                painter.draw(in: &context, state: state, time: timeline.date.timeIntervalSinceReferenceDate)
            }
        }
    }
}

/// Parsel düzeni: zincir başına üç kare, mahalle başına çeyrek.
enum CityLayout {
    static let size = 7
    static let roads: Set<Int> = [3]

    /// Ana adadaki parseller. Ada zincirleri kendi adalarında (`IslandLayout`).
    static func tiles(_ chain: ChainId) -> [(Int, Int)] {
        switch chain {
        case .bakery: [(0, 0), (1, 0), (2, 0)]
        case .coffee: [(0, 2), (1, 2), (2, 2)]
        case .fashion: [(4, 0), (5, 0), (6, 0)]
        case .leather: [(0, 4), (1, 4), (2, 4)]
        case .tech: [(4, 4), (5, 4), (6, 4)]
        case .energy, .auto, .aviation: []
        }
    }

    static let mainChains: [ChainId] = [.bakery, .coffee, .fashion, .leather, .tech]

    /// Liman: güneydoğu köşesinde su ve vinçler.
    static let port: [(Int, Int)] = [(4, 6), (5, 6), (6, 6)]

    static func isRoad(_ c: Int, _ r: Int) -> Bool { roads.contains(c) || roads.contains(r) }

    static func isClaimed(_ c: Int, _ r: Int) -> Bool {
        mainChains.contains { chain in tiles(chain).contains { $0 == (c, r) } } || port.contains { $0 == (c, r) }
    }
}

/// Uydu ada düzeni (L7): 3×3, ortada yol (köprüler ona bağlanıyor), bir yanda
/// zincirin üç parseli, öbür yanda adanın süsleri.
enum IslandLayout {
    static let size = 3
    static let road = 1
    /// [ham, işleme, satış]
    static let tiles: [(Int, Int)] = [(2, 0), (0, 1), (2, 2)]
    static let decor: [(Int, Int)] = [(0, 0), (2, 1), (0, 2)]
}

/// Şehrin ışığı ve coğrafyası: gündüz/gece × sahil/dağ/çöl/kar. Canvas'ta
/// dinamik renk yerine düz renk.
struct CityPalette {
    enum Flora { case round, pine, cactus, snowPine }

    let night: Bool
    let theme: CityTheme
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
    let flora: Flora
    /// Arka plan siluetleri (dağ, kaya) için.
    let far: Color

    init(_ scheme: ColorScheme, theme: CityTheme = .coast) {
        night = scheme == .dark
        self.theme = theme
        if night {
            road = Color(hex: 0x28345A)
            dash = Color(hex: 0xFFD37A)
            wall = (Color(hex: 0xC3CFF0), Color(hex: 0x8F9FCC), Color(hex: 0x6F80B2))
            window = Color(hex: 0xFFD37A)
            windowOff = Color(hex: 0x33467A)
            glint = Color(hex: 0xFFF4CC)
            water = (Color(hex: 0x1E4C8E), Color(hex: 0x143A72))
            shadow = Color(hex: 0x000010, alpha: 0.38)
            smoke = Color(hex: 0xBECDF0, alpha: 0.35)
            empty = Color(hex: 0x9FB6E0, alpha: 0.35)
        } else {
            road = Color(hex: 0xB5C3D3)
            dash = .white
            wall = (.white, Color(hex: 0xF1F5FA), Color(hex: 0xDDE6F0))
            window = Color(hex: 0x7FD0FF)
            windowOff = Color(hex: 0x7FD0FF)
            glint = .white
            water = (Color(hex: 0x6FD4FF), Color(hex: 0x3EB6F2))
            shadow = Color(hex: 0x1D3557, alpha: 0.18)
            smoke = Color(hex: 0xFFFFFF, alpha: 0.92)
            empty = Color(hex: 0x507850, alpha: 0.45)
        }
        switch (theme, night) {
        case (.coast, false):
            grass = (Color(hex: 0xA6E58E), Color(hex: 0x98DC7F))
            side = (Color(hex: 0xB9875A), Color(hex: 0x9B6C43))
            lip = Color(hex: 0x86CF6C)
            tree = (Color(hex: 0x43B05A), Color(hex: 0x6ED36E))
            flora = .round
            far = Color(hex: 0xFFFFFF, alpha: 0)
        case (.coast, true):
            grass = (Color(hex: 0x2C6A58), Color(hex: 0x286150))
            side = (Color(hex: 0x3C3358), Color(hex: 0x2F2848))
            lip = Color(hex: 0x3A8C6E)
            tree = (Color(hex: 0x1E5A47), Color(hex: 0x2F7C60))
            flora = .round
            far = Color(hex: 0x000000, alpha: 0)
        case (.mountain, false):
            grass = (Color(hex: 0x9BD68C), Color(hex: 0x8CCB7E))
            side = (Color(hex: 0x9DA6B8), Color(hex: 0x7F889C))
            lip = Color(hex: 0x7CC26E)
            tree = (Color(hex: 0x2F8A57), Color(hex: 0x46A86A))
            flora = .pine
            far = Color(hex: 0xA9C4E8)
        case (.mountain, true):
            grass = (Color(hex: 0x2A6152), Color(hex: 0x26594B))
            side = (Color(hex: 0x464E68), Color(hex: 0x3A4159))
            lip = Color(hex: 0x37806A)
            tree = (Color(hex: 0x1A4F3E), Color(hex: 0x276B53))
            flora = .pine
            far = Color(hex: 0x2B3D72)
        case (.desert, false):
            grass = (Color(hex: 0xF4D9A0), Color(hex: 0xEDCD8E))
            side = (Color(hex: 0xD38E58), Color(hex: 0xB47040))
            lip = Color(hex: 0xE9BC74)
            tree = (Color(hex: 0x4FA35E), Color(hex: 0x6DC27A))
            flora = .cactus
            far = Color(hex: 0xF3C9A2)
        case (.desert, true):
            grass = (Color(hex: 0x6E5E52), Color(hex: 0x66574C))
            side = (Color(hex: 0x5E4140), Color(hex: 0x4C3434))
            lip = Color(hex: 0x8A7058)
            tree = (Color(hex: 0x2F6A48), Color(hex: 0x3F8559))
            flora = .cactus
            far = Color(hex: 0x3F3A6E)
        case (.snow, false):
            grass = (Color(hex: 0xEEF6FF), Color(hex: 0xE1EDFA))
            side = (Color(hex: 0xA3B7D3), Color(hex: 0x869BBC))
            lip = Color(hex: 0xFFFFFF)
            tree = (Color(hex: 0x2E7D5B), Color(hex: 0x3F9670))
            flora = .snowPine
            far = Color(hex: 0xFFFFFF, alpha: 0)
        case (.snow, true):
            grass = (Color(hex: 0x5C6D98), Color(hex: 0x55658E))
            side = (Color(hex: 0x46537A), Color(hex: 0x3A466B))
            lip = Color(hex: 0x8FA3D0)
            tree = (Color(hex: 0x1C4E44), Color(hex: 0x28655A))
            flora = .snowPine
            far = Color(hex: 0x000000, alpha: 0)
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
        case (.energy, false): (0x8EE06A, 0x46BF55)
        case (.energy, true): (0x7FD25E, 0x3DA84B)
        case (.auto, false): (0x5ED6C8, 0x22AFA2)
        case (.auto, true): (0x4FC6B8, 0x1F9A8F)
        case (.aviation, false): (0xFF8FB8, 0xF25D92)
        case (.aviation, true): (0xF07FAA, 0xD95283)
        }
        return (Color(hex: pair.0), Color(hex: pair.1))
    }
}

struct IsoPainter {
    let size: CGSize
    let palette: CityPalette
    /// 0 ana ada; 1–3 köprüyle bağlı adalar.
    let island: Int
    let grid: Int
    let tileWidth: CGFloat
    let origin: CGPoint

    init(size: CGSize, palette: CityPalette, island: Int = 0, state: LiteState) {
        self.size = size
        self.palette = palette
        self.island = island
        grid = island == 0 ? CityLayout.size : IslandLayout.size
        // Binalar uzadıkça kamera geri çekiliyor: kule ve simge yapı kadraja sığsın.
        let tallest = IsoPainter.tallestTier(state, island: island)
        let zoom: CGFloat = tallest >= 4 ? 0.8 : tallest == 3 ? 0.9 : 1
        if island == 0 {
            // 7 kare enine sığsın; altta adanın yanlarına, üstte binalara yer kalsın.
            tileWidth = min(size.width / 7.4, size.height / 3.95) * zoom
            // Yüksek kutuda (iPad yatay) ada dikeyde ortalanıyor; telefonda ve
            // iPad dikeyde ilk değer büyük kalıyor, görünüm değişmiyor.
            let above = 0.55 + (1 - zoom) * 5
            let centered = (size.height - tileWidth * (3.25 + above)) / 2 + tileWidth * above
            origin = CGPoint(x: size.width / 2, y: max(size.height * (0.21 + (1 - zoom) * 0.55), centered))
        } else {
            tileWidth = min(size.width / 4.8, size.height / 2.75) * zoom
            let above = 0.35 + (1 - zoom) * 5
            let centered = (size.height - tileWidth * (1.85 + above)) / 2 + tileWidth * above
            // Sol üstteki ada haritası arka binanın çatısını örtmesin: ada biraz aşağıda.
            origin = CGPoint(x: size.width / 2, y: max(size.height * (0.3 + (1 - zoom) * 0.6), centered))
        }
    }

    /// Adadaki en yüksek bina kademesi (tarlalar sayılmıyor).
    static func tallestTier(_ state: LiteState, island: Int) -> Int {
        let chains: [ChainId] = island == 0 ? CityLayout.mainChains : [IslandMap.chain(island)].compactMap { $0 }
        var tallest = 0
        for chain in chains where Lite.chainUnlocked(state, chain) {
            let levels = state[chain: chain].levels
            tallest = max(tallest, Lite.buildingTier(levels[1]), Lite.buildingTier(levels[2]))
        }
        return tallest
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

    typealias Item = (depth: Double, draw: (inout GraphicsContext) -> Void)

    func draw(in context: inout GraphicsContext, state: LiteState, time: Double) {
        drawSky(&context, time: time)
        drawBackdrop(&context)
        if island == 0 {
            drawMain(&context, state: state, time: time)
        } else {
            drawSatellite(&context, state: state, time: time)
        }
        if palette.theme == .snow { drawSnow(&context, time: time) }
    }

    // MARK: - Ana ada

    private func drawMain(_ context: inout GraphicsContext, state: LiteState, time: Double) {
        // Takımada: arka kenardan bir sonraki adaya köprü (sayfa kenarında bulutlara karışıyor).
        if Lite.islandUnlocked(state, 1) { drawBridge(&context, column: 3, from: 0, to: -6, fadeTo: -4.2) }
        drawIsland(&context)
        drawGround(&context, state: state)

        var items: [Item] = []
        for chain in CityLayout.mainChains {
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
        if palette.night {
            drawLamps(&context, spots: [(3.0, 1.0), (3.0, 5.0), (1.0, 3.0), (5.0, 3.0), (3.0, 0.1), (0.1, 3.0), (6.2, 3.0)])
        }
    }

    // MARK: - Uydu ada (L7)

    private func drawSatellite(_ context: inout GraphicsContext, state: LiteState, time: Double) {
        guard let chain = IslandMap.chain(island) else { return }
        // Önceki adadan gelen köprü (önde, sol alttan) ve açıksa sıradakine giden (arkada, sağ üste).
        if Lite.islandUnlocked(state, island + 1) { drawBridge(&context, column: 1, from: 0, to: -6, fadeTo: -3.4) }
        drawIsland(&context)
        drawGround(&context, state: state)

        let unlocked = Lite.chainUnlocked(state, chain)
        let levels = state[chain: chain].levels
        var items: [Item] = []
        for (stage, tile) in zip(Stage.allCases, IslandLayout.tiles) {
            let level = levels[stage.rawValue]
            let (c, r) = (Double(tile.0), Double(tile.1))
            items.append((depth: c + r, draw: { (ctx: inout GraphicsContext) in
                if stage == .raw && level > 0 {
                    self.drawIslandRaw(&ctx, chain: chain, level: level, c: c, r: r, time: time)
                } else {
                    self.drawBuilding(&ctx, chain: chain, stage: stage, level: level, unlocked: unlocked, c: c, r: r, time: time)
                }
            }))
        }
        for (index, tile) in IslandLayout.decor.enumerated() {
            let (c, r) = (Double(tile.0), Double(tile.1))
            items.append((depth: c + r + 0.1, draw: { (ctx: inout GraphicsContext) in
                self.drawDecor(&ctx, chain: chain, index: index, c: c, r: r, levels: levels, time: time)
            }))
        }
        items.append((depth: 4.6, draw: { (ctx: inout GraphicsContext) in
            self.drawBridge(&ctx, column: 1, from: 3, to: 9, fadeTo: 6.4)
        }))
        for item in items.sorted(by: { $0.depth < $1.depth }) { item.draw(&context) }
        if chain == .aviation && levels[2] > 0 { drawPlane(&context, time: time) }
        if palette.night { drawLamps(&context, spots: [(1.0, 0.1), (1.0, 2.9), (1.9, 1.5)]) }
    }

    // MARK: - Gökyüzü ve ada

    private func drawSky(_ context: inout GraphicsContext, time: Double) {
        if palette.night {
            // Yıldızlar sabit tohumla; hafif göz kırpma.
            var seed: UInt64 = 7 &+ UInt64(island) &* 31
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
            if island == 0 {
                let moon = CGPoint(x: size.width * 0.86, y: size.height * 0.13)
                let halo = 46 * unit
                context.fill(
                    Path(ellipseIn: CGRect(x: moon.x - halo, y: moon.y - halo, width: halo * 2, height: halo * 2)),
                    with: .radialGradient(Gradient(colors: [Color(hex: 0xFFF0C8, alpha: 0.35), Color(hex: 0xFFF0C8, alpha: 0)]), center: moon, startRadius: 4, endRadius: halo)
                )
                let m = 11 * unit
                context.fill(Path(ellipseIn: CGRect(x: moon.x - m, y: moon.y - m, width: m * 2, height: m * 2)), with: .color(Color(hex: 0xFFF2CC)))
                context.fill(Path(ellipseIn: CGRect(x: moon.x - m + 5 * unit, y: moon.y - m - 3 * unit, width: m * 1.75, height: m * 1.75)), with: .color(Color(hex: 0x15275A)))
            }
            drawClouds(&context, color: Color(hex: 0x7896E6, alpha: 0.2), time: time)
        } else {
            drawClouds(&context, color: Color(hex: 0xFFFFFF, alpha: 0.85), time: time)
        }
    }

    private func drawClouds(_ context: inout GraphicsContext, color: Color, time: Double) {
        let clouds: [(Double, Double, Double)] = island == 0
            ? [(0.08, 0.2, 1), (0.8, 0.12, 0.8), (0.74, 0.56, 0.6)]
            : [(0.12, 0.16, 0.8), (0.86, 0.3, 0.9), (0.2, 0.72, 0.6)]
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

    /// Temanın uzak siluetleri: dağda karlı tepeler, çölde düz tepeli kayalar.
    private func drawBackdrop(_ context: inout GraphicsContext) {
        switch palette.theme {
        case .mountain:
            let base = size.height * 0.62
            let peaks: [(Double, Double, Double)] = [(0.1, 0.34, 0.22), (0.3, 0.2, 0.3), (0.62, 0.3, 0.24), (0.9, 0.16, 0.3)]
            for (x, top, half) in peaks {
                let cx = size.width * CGFloat(x), ty = size.height * CGFloat(top), hw = size.width * CGFloat(half) / 2
                var hill = Path()
                hill.move(to: CGPoint(x: cx - hw, y: base))
                hill.addLine(to: CGPoint(x: cx, y: ty))
                hill.addLine(to: CGPoint(x: cx + hw, y: base))
                hill.closeSubpath()
                context.fill(hill, with: .linearGradient(Gradient(colors: [palette.far, palette.far.opacity(0)]), startPoint: CGPoint(x: cx, y: ty), endPoint: CGPoint(x: cx, y: base)))
                // Karlı tepe.
                let cap = (base - ty) * 0.22
                var snow = Path()
                snow.move(to: CGPoint(x: cx, y: ty))
                snow.addLine(to: CGPoint(x: cx + hw * cap / (base - ty), y: ty + cap))
                snow.addLine(to: CGPoint(x: cx, y: ty + cap * 0.7))
                snow.addLine(to: CGPoint(x: cx - hw * cap / (base - ty), y: ty + cap))
                snow.closeSubpath()
                context.fill(snow, with: .color(palette.night ? Color(hex: 0xC9D6F5, alpha: 0.5) : Color.white.opacity(0.9)))
            }
        case .desert:
            let base = size.height * 0.6
            let mesas: [(Double, Double, Double)] = [(0.12, 0.38, 0.2), (0.86, 0.3, 0.24), (0.66, 0.44, 0.14)]
            for (x, top, width) in mesas {
                let cx = size.width * CGFloat(x), ty = size.height * CGFloat(top), w = size.width * CGFloat(width)
                var rock = Path()
                rock.move(to: CGPoint(x: cx - w / 2, y: base))
                rock.addLine(to: CGPoint(x: cx - w * 0.32, y: ty))
                rock.addLine(to: CGPoint(x: cx + w * 0.32, y: ty))
                rock.addLine(to: CGPoint(x: cx + w / 2, y: base))
                rock.closeSubpath()
                context.fill(rock, with: .linearGradient(Gradient(colors: [palette.far, palette.far.opacity(0)]), startPoint: CGPoint(x: cx, y: ty), endPoint: CGPoint(x: cx, y: base)))
            }
        case .coast, .snow:
            break
        }
    }

    /// Kar teması: yavaş düşen taneler.
    private func drawSnow(_ context: inout GraphicsContext, time: Double) {
        var flakes = Path()
        for i in 0..<36 {
            let seed = Double(i) * 12.9898
            let x0 = (sin(seed) * 43758.5453).truncatingRemainder(dividingBy: 1)
            let speed = 0.05 + 0.04 * Double(i % 4)
            let fall = (time * speed + Double(i) * 0.137).truncatingRemainder(dividingBy: 1)
            let sway = sin(time * 0.8 + Double(i)) * 0.012
            let x = size.width * CGFloat(abs(x0) + sway), y = size.height * CGFloat(fall)
            let r = CGFloat(1 + Double(i % 3) * 0.5) * unit
            flakes.addEllipse(in: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2))
        }
        context.fill(flakes, with: .color(Color.white.opacity(palette.night ? 0.55 : 0.9)))
    }

    private func drawIsland(_ context: inout GraphicsContext) {
        let n = Double(grid)
        let center = point(n / 2, n / 2)
        let shadowRect = CGRect(x: center.x - tileWidth * CGFloat(n) * 0.57, y: center.y + 40 * unit - tileHeight * CGFloat(n) * 0.3,
                                width: tileWidth * CGFloat(n) * 1.14, height: tileHeight * CGFloat(n) * 0.6)
        context.fill(Path(ellipseIn: shadowRect), with: .color(palette.night ? Color(hex: 0x000014, alpha: 0.35) : Color(hex: 0x285078, alpha: 0.14)))

        let g1 = point(n, 0), g2 = point(n, n), g3 = point(0, n)
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

    private func isRoad(_ c: Int, _ r: Int) -> Bool {
        island == 0 ? CityLayout.isRoad(c, r) : c == IslandLayout.road
    }

    private func drawGround(_ context: inout GraphicsContext, state: LiteState) {
        let port = island == 0 && Lite.districtUnlocked(state, .port)
        for r in 0..<grid {
            for c in 0..<grid {
                let (dc, dr) = (Double(c), Double(r))
                let portTile = island == 0 && CityLayout.port.contains(where: { $0 == (c, r) })
                if isRoad(c, r) {
                    context.fill(diamond(dc, dr), with: .color(palette.road))
                } else if port && portTile {
                    context.fill(diamond(dc, dr), with: .linearGradient(Gradient(colors: [palette.water.0, palette.water.1]), startPoint: point(dc, dr), endPoint: point(dc + 1, dr + 1)))
                } else {
                    context.fill(diamond(dc, dr), with: .color((c + r) % 2 == 0 ? palette.grass.0 : palette.grass.1))
                    if portTile {
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
        if island == 0 {
            for i in 0..<CityLayout.size where i != 3 {
                let t = Double(i)
                dashes.move(to: point(t + 0.3, 3.5))
                dashes.addLine(to: point(t + 0.7, 3.5))
                dashes.move(to: point(3.5, t + 0.3))
                dashes.addLine(to: point(3.5, t + 0.7))
            }
        } else {
            for i in 0..<IslandLayout.size {
                let t = Double(i)
                dashes.move(to: point(1.5, t + 0.3))
                dashes.addLine(to: point(1.5, t + 0.7))
            }
        }
        context.stroke(dashes, with: .color(palette.dash), style: StrokeStyle(lineWidth: 1.6 * unit, lineCap: .round))
    }

    /// Köprü: `column` sütununun yolu adanın dışına uzuyor; `fadeTo`'dan sonra
    /// bulutlara karışıp kayboluyor (sayfa kenarındaki kesik görünmesin).
    private func drawBridge(_ context: inout GraphicsContext, column: Double, from: Double, to: Double, fadeTo: Double) {
        let c0 = column + 0.12, c1 = column + 0.88
        let near = point(column + 0.5, from), far = point(column + 0.5, fadeTo)
        let deckColor = palette.night ? Color(hex: 0x4A5684) : Color(hex: 0xC9D5E3)
        let edge = palette.night ? Color(hex: 0x2E365A) : Color(hex: 0x9AA9BD)
        let fade = Gradient(stops: [
            .init(color: deckColor, location: 0),
            .init(color: deckColor, location: 0.55),
            .init(color: deckColor.opacity(0), location: 1),
        ])
        let edgeFade = Gradient(stops: [
            .init(color: edge, location: 0),
            .init(color: edge, location: 0.55),
            .init(color: edge.opacity(0), location: 1),
        ])
        // Alt kenar (kalınlık) ve güverte.
        var side = Path()
        side.addLines([point(c1, from), point(c1, to), point(c1, to, -0.12), point(c1, from, -0.12)])
        side.closeSubpath()
        context.fill(side, with: .linearGradient(edgeFade, startPoint: near, endPoint: far))
        var deck = Path()
        deck.addLines([point(c0, from), point(c1, from), point(c1, to), point(c0, to)])
        deck.closeSubpath()
        context.fill(deck, with: .linearGradient(fade, startPoint: near, endPoint: far))
        // Korkuluk direkleri ve tırabzan.
        let step = to > from ? 0.5 : -0.5
        var posts = Path()
        var rails = Path()
        for rail in [c0, c1] {
            rails.move(to: point(rail, from, 0.16))
            rails.addLine(to: point(rail, to, 0.16))
            var t = from + step
            while (step > 0 && t < to) || (step < 0 && t > to) {
                posts.move(to: point(rail, t))
                posts.addLine(to: point(rail, t, 0.16))
                t += step
            }
        }
        let railColor = palette.night ? Color(hex: 0xC9D6F5) : Color.white
        let railFade = Gradient(stops: [
            .init(color: railColor, location: 0),
            .init(color: railColor, location: 0.55),
            .init(color: railColor.opacity(0), location: 1),
        ])
        context.stroke(posts, with: .linearGradient(railFade, startPoint: near, endPoint: far), style: StrokeStyle(lineWidth: 1.4 * unit, lineCap: .round))
        context.stroke(rails, with: .linearGradient(railFade, startPoint: near, endPoint: far), style: StrokeStyle(lineWidth: 1.6 * unit, lineCap: .round))
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

    /// Bina biçimi kademeye göre (L7): yükseklik, kenar payı, pencere sırası.
    struct Massing {
        let height: Double
        let margin: Double
        let rows: Int
    }

    static func shape(_ stage: Stage, _ level: Int) -> Massing {
        let tier = Lite.buildingTier(level)
        // Kademe içinde de hafif büyüme: bir sonraki eşiğe yaklaştıkça.
        let bounds: (Int, Int) = switch tier {
        case 1: (1, 25)
        case 2: (25, 50)
        case 3: (50, 100)
        default: (100, 300)
        }
        let progress = min(1, Double(max(0, level - bounds.0)) / Double(bounds.1 - bounds.0))
        if stage == .process {
            switch tier {
            case 1: return Massing(height: 0.62 + 0.2 * progress, margin: 0.15, rows: 2)
            case 2: return Massing(height: 0.92 + 0.12 * progress, margin: 0.1, rows: 2)
            case 3: return Massing(height: 1.12 + 0.14 * progress, margin: 0.1, rows: 3)
            default: return Massing(height: 1.32 + 0.14 * progress, margin: 0.08, rows: 3)
            }
        }
        switch tier {
        case 1: return Massing(height: 0.55 + 0.25 * progress, margin: 0.15, rows: 2)
        case 2: return Massing(height: 0.98 + 0.17 * progress, margin: 0.15, rows: 4)
        case 3: return Massing(height: 1.35 + 0.25 * progress, margin: 0.2, rows: 5)
        default: return Massing(height: 1.85 + 0.3 * progress, margin: 0.2, rows: 6)
        }
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
        let tier = Lite.buildingTier(level)
        if stage == .raw {
            drawField(&context, c: c, r: r, colors: (roofTop, roofSide), tier: tier)
            return
        }
        let shape = IsoPainter.shape(stage, level)
        let m = shape.margin
        let h = shape.height
        // Yumuşak gölge.
        let base = point(c + 0.55, r + 0.62)
        let spread = CGFloat(1 + 0.12 * Double(tier - 1))
        context.fill(Path(ellipseIn: CGRect(x: base.x - tileWidth * 0.46 * spread, y: base.y - tileHeight * 0.44, width: tileWidth * 0.96 * spread, height: tileHeight * 0.92)), with: .color(palette.shadow))
        // Gövde: açık duvarlar, aşağı doğru hafif koyulaşan.
        box(&context, c: c, r: r, m: m, h: h,
            top: .color(palette.wall.0),
            left: .linearGradient(Gradient(colors: [palette.wall.1, palette.wall.1.shade(0.94)]), startPoint: point(c, r + 1, h), endPoint: point(c, r + 1, 0)),
            right: .linearGradient(Gradient(colors: [palette.wall.2, palette.wall.2.shade(0.92)]), startPoint: point(c + 1, r, h), endPoint: point(c + 1, r, 0)))
        // Simge yapı: çatı altında zincir renginde ışıklı bant.
        if tier >= 4 && stage == .retail {
            box(&context, c: c, r: r, m: m - 0.01, z0: h - 0.16, h: 0.1,
                top: .color(roofTop), left: .color(roofTop.shade(palette.night ? 1.15 : 1.05)), right: .color(roofSide))
        }
        // Çatı plakası: zincir rengi, biraz taşkın; üst kenarında ışık çizgisi.
        let gold = Color(hex: 0xFFD44F), goldSide = Color(hex: 0xE0A825)
        let roof = box(&context, c: c, r: r, m: m - 0.035, z0: h, h: 0.17,
                       top: .color(roofTop.shade(1.08)), left: .color(roofTop), right: .color(roofSide))
        var rim = Path()
        rim.addLines([roof.a, roof.b, roof.d])
        context.stroke(rim, with: .color(tier >= 4 ? gold : Color.white.opacity(0.55)), lineWidth: tier >= 4 ? 1.6 : 1)
        drawWindows(&context, c: c, r: r, m: m, h: h, rows: shape.rows)
        if stage == .process {
            // Baca sayısı kademeyle: kule ve simge yapıda iki baca.
            let stacks: [(Double, Double)] = tier >= 3 ? [(0.62, 0.3), (0.38, 0.3)] : [(0.66, 0.32)]
            let tall = tier >= 2 ? 0.8 : 0.65
            for (index, spot) in stacks.enumerated() {
                let foot = point(c + spot.0, r + spot.1, h + 0.17), head = point(c + spot.0, r + spot.1, h + tall)
                let w = 6.4 * unit
                context.fill(Path(roundedRect: CGRect(x: foot.x - w / 2, y: head.y, width: w, height: foot.y - head.y), cornerRadius: 1.5), with: .color(roofSide.shade(0.85)))
                context.fill(Path(CGRect(x: foot.x - w / 2, y: head.y, width: w, height: 2 * unit)), with: .color(tier >= 4 ? gold : roofTop.shade(1.15)))
                // Enerji temiz: şebeke tütmüyor.
                if chain != .energy { drawSmoke(&context, at: head, time: time, seed: c * 0.37 + r * 0.61 + Double(index) * 0.5) }
            }
        } else {
            drawAwning(&context, c: c, r: r, m: m, color: roofTop)
            if tier == 2 {
                // Orta kat: çatıda küçük bir makine dairesi.
                box(&context, c: c + 0.18, r: r + 0.12, m: 0.3, z0: h + 0.17, h: 0.12,
                    top: .color(palette.wall.0), left: .color(palette.wall.1), right: .color(palette.wall.2))
            }
            if tier >= 3 {
                // Kule: geri çekilmiş tepe; simge yapıda altın tepe ve anten.
                let crownTop: Color = tier >= 4 ? gold : roofTop
                let crownSide: Color = tier >= 4 ? goldSide : roofSide
                box(&context, c: c, r: r, m: m + 0.1, z0: h + 0.17, h: 0.22,
                    top: .color(crownTop.shade(1.08)), left: .color(crownTop), right: .color(crownSide))
                if tier >= 4 {
                    let foot = point(c + 0.5, r + 0.5, h + 0.39), tip = point(c + 0.5, r + 0.5, h + 0.85)
                    var mast = Path()
                    mast.move(to: foot)
                    mast.addLine(to: tip)
                    context.stroke(mast, with: .color(palette.night ? Color(hex: 0xC9D6F5) : Color(hex: 0x8C9BB5)), lineWidth: 1.6 * unit)
                    let blink = 0.5 + 0.5 * sin(time * 3 + c + r)
                    let dot = 2.2 * unit
                    context.fill(Path(ellipseIn: CGRect(x: tip.x - dot, y: tip.y - dot, width: dot * 2, height: dot * 2)), with: .color(Color(hex: 0xFF4D5E, alpha: 0.45 + 0.55 * blink)))
                }
            }
        }
    }

    /// Ham kademe tarlası; orta kattan itibaren arkada bir silo, simge yapıda altın kubbeli.
    private func drawField(_ context: inout GraphicsContext, c: Double, r: Double, colors: (Color, Color), tier: Int) {
        context.fill(diamond(c, r, inset: 0.08), with: .linearGradient(Gradient(colors: [colors.0.mix(with: .white, 0.35), colors.0.mix(with: .white, 0.15)]), startPoint: point(c, r), endPoint: point(c + 1, r + 1)))
        var rows = Path()
        for k in 1...4 {
            let t = Double(k) * 0.2
            rows.move(to: point(c + 0.16, r + t))
            rows.addLine(to: point(c + 0.84, r + t))
        }
        context.stroke(rows, with: .color(colors.1), style: StrokeStyle(lineWidth: 1.6 * unit, lineCap: .round))
        guard tier >= 2 else { return }
        let height = tier >= 4 ? 0.62 : tier == 3 ? 0.5 : 0.36
        box(&context, c: c + 0.28, r: r - 0.22, m: 0.36, h: height,
            top: .color(palette.wall.0), left: .color(palette.wall.1), right: .color(palette.wall.2))
        let top = point(c + 0.5 + 0.28, r + 0.5 - 0.22, height)
        let dome = 6.2 * unit
        context.fill(Path(ellipseIn: CGRect(x: top.x - dome, y: top.y - dome * 0.75, width: dome * 2, height: dome * 1.3)),
                     with: .color(tier >= 4 ? Color(hex: 0xFFD44F) : colors.1))
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

    // MARK: - Adaların kendi yapıları (L7)

    /// Ada zincirlerinin ham kademesi: rüzgâr türbinleri, maden ocağı, malzeme laboratuvarı.
    private func drawIslandRaw(_ context: inout GraphicsContext, chain: ChainId, level: Int, c: Double, r: Double, time: Double) {
        let (top, side) = palette.chain(chain)
        let tier = Lite.buildingTier(level)
        switch chain {
        case .energy:
            context.fill(diamond(c, r, inset: 0.08), with: .color(palette.grass.0.mix(with: top, 0.18)))
            let spots: [(Double, Double)] = [(0.3, 0.3), (0.72, 0.42), (0.36, 0.76), (0.76, 0.8)]
            for spot in spots.prefix(tier) {
                drawTurbine(&context, at: (c + spot.0, r + spot.1), height: 0.9, time: time, seed: spot.0 * 3 + spot.1)
            }
        case .auto:
            // Basamaklı ocak: içe doğru koyulaşan halkalar, kenarda kamyon.
            for step in 0..<3 {
                let inset = 0.08 + Double(step) * 0.11
                let tone = palette.night ? Color(hex: 0x5A5F7A) : Color(hex: 0xB9A58E)
                context.fill(diamond(c, r, inset: inset, z: -0.04 * Double(step)), with: .color(tone.shade(1 - 0.1 * Double(step))))
            }
            for k in 0..<min(3, tier) {
                let p = point(c + 0.25 + Double(k) * 0.22, r + 0.82)
                context.fill(Path(roundedRect: CGRect(x: p.x - 5 * unit, y: p.y - 6 * unit, width: 10 * unit, height: 5 * unit), cornerRadius: 1.2 * unit), with: .color(Color(hex: 0xFFC23A)))
                context.fill(Path(roundedRect: CGRect(x: p.x + 2 * unit, y: p.y - 8 * unit, width: 4 * unit, height: 3 * unit), cornerRadius: 1 * unit), with: .color(Color(hex: 0x3A4A6B)))
            }
        default:
            // Laboratuvar: alçak taban ve kubbe; kademe büyüdükçe kubbe büyüyor.
            box(&context, c: c, r: r, m: 0.18, h: 0.28,
                top: .color(palette.wall.0), left: .color(palette.wall.1), right: .color(palette.wall.2))
            let center = point(c + 0.5, r + 0.5, 0.28)
            let radius = (12 + 2.5 * CGFloat(tier)) * unit
            context.fill(Path(ellipseIn: CGRect(x: center.x - radius, y: center.y - radius * 0.95, width: radius * 2, height: radius * 1.5)),
                         with: .linearGradient(Gradient(colors: [palette.wall.0, palette.wall.2]), startPoint: CGPoint(x: center.x - radius, y: center.y - radius), endPoint: CGPoint(x: center.x + radius, y: center.y)))
            var ring = Path()
            ring.addEllipse(in: CGRect(x: center.x - radius * 0.9, y: center.y - radius * 0.3, width: radius * 1.8, height: radius * 0.5))
            context.stroke(ring, with: .color(side), lineWidth: 2 * unit)
            context.fill(Path(ellipseIn: CGRect(x: center.x - 2.5 * unit, y: center.y - radius * 0.95 - 1.5 * unit, width: 5 * unit, height: 4 * unit)), with: .color(top))
        }
    }

    private func drawTurbine(_ context: inout GraphicsContext, at spot: (Double, Double), height: Double, time: Double, seed: Double) {
        let foot = point(spot.0, spot.1), hub = point(spot.0, spot.1, height)
        var mast = Path()
        mast.move(to: foot)
        mast.addLine(to: hub)
        context.stroke(mast, with: .color(palette.night ? Color(hex: 0xC9D6F5) : Color.white), style: StrokeStyle(lineWidth: 2.4 * unit, lineCap: .round))
        let angle = time * 1.6 + seed
        var blades = Path()
        for k in 0..<3 {
            let a = angle + Double(k) * 2 * .pi / 3
            let tip = CGPoint(x: hub.x + CGFloat(cos(a)) * 13 * unit, y: hub.y + CGFloat(sin(a)) * 13 * unit)
            blades.move(to: hub)
            blades.addLine(to: tip)
        }
        context.stroke(blades, with: .color(palette.night ? Color(hex: 0xE3EAFF) : Color.white), style: StrokeStyle(lineWidth: 2 * unit, lineCap: .round))
        context.fill(Path(ellipseIn: CGRect(x: hub.x - 2 * unit, y: hub.y - 2 * unit, width: 4 * unit, height: 4 * unit)), with: .color(Color(hex: 0x8C9BB5)))
    }

    /// Ada süsleri: güneş panelleri ve direkler; kamyon parkı; kontrol kulesi ve apron.
    private func drawDecor(_ context: inout GraphicsContext, chain: ChainId, index: Int, c: Double, r: Double, levels: [Int], time: Double) {
        switch (chain, index) {
        case (.energy, 0), (.energy, 2):
            // Güneş paneli dizileri.
            for k in 0..<3 {
                let t = 0.2 + Double(k) * 0.26
                var panel = Path()
                panel.addLines([point(c + 0.15, r + t, 0.08), point(c + 0.85, r + t, 0.08), point(c + 0.85, r + t + 0.16, 0.02), point(c + 0.15, r + t + 0.16, 0.02)])
                panel.closeSubpath()
                context.fill(panel, with: .linearGradient(Gradient(colors: [Color(hex: 0x3D6FD6), Color(hex: 0x2A4FA8)]), startPoint: point(c, r + t), endPoint: point(c + 1, r + t)))
                context.stroke(panel, with: .color(.white.opacity(0.6)), lineWidth: 0.8)
            }
        case (.energy, _):
            // Şebeke direği.
            let foot = point(c + 0.5, r + 0.5), head = point(c + 0.5, r + 0.5, 1.0)
            var pylon = Path()
            pylon.move(to: CGPoint(x: foot.x - 5 * unit, y: foot.y))
            pylon.addLine(to: head)
            pylon.addLine(to: CGPoint(x: foot.x + 5 * unit, y: foot.y))
            pylon.move(to: CGPoint(x: head.x - 9 * unit, y: head.y + 6 * unit))
            pylon.addLine(to: CGPoint(x: head.x + 9 * unit, y: head.y + 6 * unit))
            context.stroke(pylon, with: .color(palette.night ? Color(hex: 0xA9B7DD) : Color(hex: 0x8C9BB5)), style: StrokeStyle(lineWidth: 1.6 * unit, lineJoin: .round))
        case (.auto, 1):
            // Bayi önünde sergilenen araçlar.
            let colors: [UInt32] = [0xFF5E6C, 0x3D8BFF, 0xFFD23F, 0x2EC27E]
            for k in 0..<4 {
                let p = point(c + 0.28 + Double(k % 2) * 0.44, r + 0.3 + Double(k / 2) * 0.4)
                context.fill(Path(roundedRect: CGRect(x: p.x - 6 * unit, y: p.y - 3.5 * unit, width: 12 * unit, height: 6 * unit), cornerRadius: 3 * unit), with: .color(Color(hex: colors[k])))
                context.fill(Path(CGRect(x: p.x - 2 * unit, y: p.y - 2.8 * unit, width: 4 * unit, height: 2 * unit)), with: .color(.white.opacity(0.65)))
            }
        case (.aviation, 1):
            // Apron: park etmiş uçak.
            let center = point(c + 0.5, r + 0.5)
            drawPlaneShape(&context, at: center, scale: 1, heading: 0)
        case (.aviation, 0):
            // Kontrol kulesi.
            let foot = point(c + 0.5, r + 0.5), head = point(c + 0.5, r + 0.5, 1.1)
            context.fill(Path(roundedRect: CGRect(x: foot.x - 3.5 * unit, y: head.y, width: 7 * unit, height: foot.y - head.y), cornerRadius: 2), with: .color(palette.wall.1))
            context.fill(Path(roundedRect: CGRect(x: head.x - 9 * unit, y: head.y - 7 * unit, width: 18 * unit, height: 8 * unit), cornerRadius: 3 * unit), with: .color(palette.window))
            context.fill(Path(roundedRect: CGRect(x: head.x - 10 * unit, y: head.y - 10 * unit, width: 20 * unit, height: 3.5 * unit), cornerRadius: 1.5 * unit), with: .color(palette.chain(.aviation).1))
        default:
            for k in 0..<3 { drawTree(&context, c: c, r: r, k: k) }
        }
    }

    private func drawPlaneShape(_ context: inout GraphicsContext, at center: CGPoint, scale: CGFloat, heading: Double) {
        var ctx = context
        ctx.translateBy(x: center.x, y: center.y)
        ctx.rotate(by: .radians(heading))
        ctx.scaleBy(x: scale, y: scale)
        let body = Color.white, accent = palette.chain(.aviation).1
        ctx.fill(Path(roundedRect: CGRect(x: -14 * unit, y: -2.6 * unit, width: 28 * unit, height: 5.2 * unit), cornerRadius: 2.6 * unit), with: .color(body))
        var wings = Path()
        wings.addLines([CGPoint(x: -2 * unit, y: -2 * unit), CGPoint(x: 4 * unit, y: -2 * unit), CGPoint(x: -4 * unit, y: -13 * unit), CGPoint(x: -8 * unit, y: -13 * unit)])
        wings.closeSubpath()
        wings.addLines([CGPoint(x: -2 * unit, y: 2 * unit), CGPoint(x: 4 * unit, y: 2 * unit), CGPoint(x: -4 * unit, y: 13 * unit), CGPoint(x: -8 * unit, y: 13 * unit)])
        wings.closeSubpath()
        ctx.fill(wings, with: .color(body.shade(0.92)))
        var tail = Path()
        tail.addLines([CGPoint(x: -14 * unit, y: -1 * unit), CGPoint(x: -10 * unit, y: -1 * unit), CGPoint(x: -14 * unit, y: -7 * unit)])
        tail.closeSubpath()
        ctx.fill(tail, with: .color(accent))
        ctx.fill(Path(CGRect(x: -6 * unit, y: -0.8 * unit, width: 16 * unit, height: 1.6 * unit)), with: .color(accent))
    }

    /// Havayolu açıkken gökyüzünden ara ara bir uçak geçiyor.
    private func drawPlane(_ context: inout GraphicsContext, time: Double) {
        let cycle = 14.0
        let t = (time / cycle).truncatingRemainder(dividingBy: 1)
        guard t < 0.6 else { return }
        let progress = CGFloat(t / 0.6)
        let start = CGPoint(x: -40 * unit, y: size.height * 0.42), end = CGPoint(x: size.width + 40 * unit, y: size.height * 0.08)
        let p = CGPoint(x: start.x + (end.x - start.x) * progress, y: start.y + (end.y - start.y) * progress)
        let heading = Double(atan2(end.y - start.y, end.x - start.x))
        drawPlaneShape(&context, at: p, scale: 0.7, heading: heading)
    }

    // MARK: - Ağaç, vinç, lamba

    private func drawTree(_ context: inout GraphicsContext, c: Double, r: Double, k: Int) {
        let p = point(c + 0.3 + Double(k % 2) * 0.42, r + 0.33 + (k > 1 ? 0.38 : 0))
        context.fill(Path(ellipseIn: CGRect(x: p.x - 5 * unit, y: p.y - 1.6 * unit, width: 12 * unit, height: 5 * unit)), with: .color(palette.shadow))
        switch palette.flora {
        case .round:
            context.fill(Path(CGRect(x: p.x - 1.2 * unit, y: p.y - 6 * unit, width: 2.4 * unit, height: 6 * unit)), with: .color(Color(hex: 0x8A5A3B)))
            let crown = CGPoint(x: p.x, y: p.y - 10.5 * unit)
            let radius = 6.8 * unit
            context.fill(
                Path(ellipseIn: CGRect(x: crown.x - radius, y: crown.y - radius, width: radius * 2, height: radius * 2)),
                with: .radialGradient(Gradient(colors: [palette.tree.1, palette.tree.0]), center: CGPoint(x: crown.x - 2 * unit, y: crown.y - 2.5 * unit), startRadius: 1, endRadius: radius * 1.2)
            )
        case .pine, .snowPine:
            context.fill(Path(CGRect(x: p.x - 1.2 * unit, y: p.y - 4 * unit, width: 2.4 * unit, height: 4 * unit)), with: .color(Color(hex: 0x7A4E33)))
            for layer in 0..<3 {
                let w = (8 - CGFloat(layer) * 2) * unit, base = p.y - (4 + CGFloat(layer) * 5) * unit
                var cone = Path()
                cone.addLines([CGPoint(x: p.x - w, y: base), CGPoint(x: p.x, y: base - 8 * unit), CGPoint(x: p.x + w, y: base)])
                cone.closeSubpath()
                context.fill(cone, with: .color(layer == 1 ? palette.tree.1 : palette.tree.0))
                if palette.flora == .snowPine {
                    var cap = Path()
                    cap.addLines([CGPoint(x: p.x - w * 0.45, y: base - 4.4 * unit), CGPoint(x: p.x, y: base - 8 * unit), CGPoint(x: p.x + w * 0.45, y: base - 4.4 * unit)])
                    cap.closeSubpath()
                    context.fill(cap, with: .color(.white.opacity(palette.night ? 0.7 : 0.95)))
                }
            }
        case .cactus:
            let green = palette.tree.0, light = palette.tree.1
            context.fill(Path(roundedRect: CGRect(x: p.x - 2.4 * unit, y: p.y - 15 * unit, width: 4.8 * unit, height: 15 * unit), cornerRadius: 2.4 * unit), with: .color(green))
            context.fill(Path(roundedRect: CGRect(x: p.x - 7 * unit, y: p.y - 11 * unit, width: 3.6 * unit, height: 6 * unit), cornerRadius: 1.8 * unit), with: .color(green))
            context.fill(Path(roundedRect: CGRect(x: p.x - 7 * unit, y: p.y - 7 * unit, width: 6 * unit, height: 2.6 * unit), cornerRadius: 1.3 * unit), with: .color(green))
            context.fill(Path(roundedRect: CGRect(x: p.x + 3.6 * unit, y: p.y - 13 * unit, width: 3.4 * unit, height: 5 * unit), cornerRadius: 1.7 * unit), with: .color(green))
            context.fill(Path(roundedRect: CGRect(x: p.x + 1 * unit, y: p.y - 9.4 * unit, width: 6 * unit, height: 2.4 * unit), cornerRadius: 1.2 * unit), with: .color(green))
            context.fill(Path(roundedRect: CGRect(x: p.x - 1.2 * unit, y: p.y - 14 * unit, width: 1.2 * unit, height: 10 * unit), cornerRadius: 0.6 * unit), with: .color(light))
        }
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

    private func drawLamps(_ context: inout GraphicsContext, spots: [(Double, Double)]) {
        for (c, r) in spots {
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
        let selling = CityLayout.mainChains.filter { Lite.chainUnlocked(state, $0) && state[chain: $0].levels[2] > 0 }
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
