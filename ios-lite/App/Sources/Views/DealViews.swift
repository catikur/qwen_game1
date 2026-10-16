import SwiftUI
import CapitalForgeLiteKit

// L9: şehir fırsatları. Bir binanın üstünde beliren balon; dokununca ödül
// kasaya, balon patlıyor ve tutar yukarı uçuyor.

/// Adanın üstündeki katman: duran fırsat ve son yakalananın uçuşu.
struct DealLayer: View {
    @Environment(GameStore.self) private var store
    let island: Int
    let size: CGSize
    let palette: CityPalette

    var body: some View {
        let state = store.state
        let painter = IsoPainter(size: size, palette: palette, island: island, state: state)
        ZStack {
            if let deal = state.deal {
                DealBubble(deal: deal, reward: Lite.dealReward(state), remaining: deal.until - state.clock, hint: state.deals <= 3) {
                    store.catchDeal()
                }
                .position(DealLayer.anchor(deal, island: island, painter: painter, state: state, size: size))
                .transition(.scale(scale: 0.3).combined(with: .opacity))
                .id(state.deals)
            }
            if let caught = store.lastCatch, caught.frozen || Date().timeIntervalSince(caught.date) < DealBurst.duration {
                DealBurst(caught: caught)
                    .position(DealLayer.anchor(caught.deal, island: island, painter: painter, state: state, size: size))
                    .id(caught.id)
            }
        }
        .animation(.spring(response: 0.42, dampingFraction: 0.62), value: state.deal)
    }

    /// Balonun yeri: zincirin satış binasının üstü; zincir başka adadaysa sayfanın
    /// sağ üstü (kaçmasın); yatırımcı adanın ortasında.
    static func anchor(_ deal: ActiveDeal, island: Int, painter: IsoPainter, state: LiteState, size: CGSize) -> CGPoint {
        var point: CGPoint
        if let chain = deal.chain {
            let home = LiteContent.district(LiteContent.chain(chain).district).island
            if home == island {
                let tile = island == 0 ? CityLayout.tiles(chain)[2] : IslandLayout.tiles[2]
                let height = IsoPainter.shape(.retail, max(1, state[chain: chain].levels[2])).height
                point = painter.point(Double(tile.0) + 0.5, Double(tile.1) + 0.5, height + 0.9)
            } else {
                point = CGPoint(x: size.width * 0.8, y: size.height * 0.3)
            }
        } else {
            let middle = Double(painter.grid) / 2
            point = painter.point(middle, middle, 2.4)
        }
        // Kenarlardan taşmasın.
        point.x = min(max(point.x, 60), size.width - 60)
        point.y = min(max(point.y, 64), size.height - 50)
        return point
    }
}

/// Fırsatın görünüşü: tür ve zincire göre renk ve simge.
struct DealStyle {
    let inner: Color
    let outer: Color
    let glyph: Color
    let symbol: String

    init(_ deal: ActiveDeal) {
        switch deal.kind {
        case .order:
            let chain = deal.chain ?? .bakery
            inner = .white
            outer = Theme.chainColors(chain).0
            glyph = Theme.chainColors(chain).1
            symbol = Theme.chainIcon(chain)
        case .vip:
            inner = Color(hex: 0xFFE9F8)
            outer = Color(hex: 0xE07BFF)
            glyph = Color(hex: 0x9B34D1)
            symbol = "crown.fill"
        case .investor:
            inner = Color(hex: 0xFFF7CF)
            outer = Color(hex: 0xFFB21E)
            glyph = Color(hex: 0xA35A00)
            symbol = "briefcase.fill"
        }
    }
}

/// Dokunulabilir balon: süzülüyor, kalan süre halkada, ödül altında.
struct DealBubble: View {
    let deal: ActiveDeal
    let reward: Double
    let remaining: Double
    /// İlk birkaç fırsatta "Dokun!" ipucu.
    let hint: Bool
    let action: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let style = DealStyle(deal)
        let left = max(0, min(1, remaining / LiteContent.dealLifetime))
        Button(action: action) {
            TimelineView(.animation(minimumInterval: 1.0 / 30, paused: reduceMotion)) { timeline in
                let t = timeline.date.timeIntervalSinceReferenceDate
                let bob = reduceMotion ? 0 : sin(t * 2.4) * 4
                let urgent = remaining < 3 && !reduceMotion
                VStack(spacing: 5) {
                    if hint {
                        Text(L10n.t("deal.hint"))
                            .font(Theme.display(12))
                            .foregroundStyle(Theme.ink)
                            .padding(.horizontal, 8)
                            .frame(minHeight: 20)
                            .background(Capsule().fill(Color.white.opacity(0.92)))
                    }
                    ZStack {
                        Circle()
                            .fill(RadialGradient(colors: [style.inner, style.outer], center: UnitPoint(x: 0.35, y: 0.3), startRadius: 2, endRadius: 38))
                        Circle().strokeBorder(Color.white.opacity(0.95), lineWidth: 2.5)
                        Circle()
                            .trim(from: 0, to: left)
                            .stroke(Color.white, style: StrokeStyle(lineWidth: 3.5, lineCap: .round))
                            .rotationEffect(.degrees(-90))
                            .padding(-6)
                            .animation(.linear(duration: 1), value: left)
                        Image(systemName: style.symbol)
                            .font(.system(size: 24, weight: .heavy))
                            .foregroundStyle(style.glyph)
                        Ellipse()
                            .fill(Color.white.opacity(0.8))
                            .frame(width: 16, height: 9)
                            .rotationEffect(.degrees(-32))
                            .offset(x: -13, y: -15)
                    }
                    .frame(width: 58, height: 58)
                    .shadow(color: style.outer.opacity(0.6), radius: 10)
                    .scaleEffect(urgent ? 1 + 0.06 * sin(t * 12) : 1)
                    Text("+" + Format.money(reward))
                        .font(Theme.display(13))
                        .foregroundStyle(Color.white)
                        .padding(.horizontal, 9)
                        .frame(minHeight: 22)
                        .background(Capsule().fill(Theme.money))
                        .overlay(Capsule().strokeBorder(Color.white.opacity(0.85), lineWidth: 1.5))
                }
                .offset(y: bob)
            }
            .frame(width: 120, height: hint ? 128 : 104)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L10n.t("deal.a11y", L10n.t("deal.\(deal.kind.rawValue)"), Format.money(reward)))
        .accessibilityIdentifier("deal")
    }
}

/// Yakalanınca: altın taneler dağılıyor, tutar yukarı uçuyor.
struct DealBurst: View {
    static let duration = 1.3
    let caught: DealCatch

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 60, paused: caught.frozen)) { timeline in
            let p = caught.frozen ? 0.4 : min(1, timeline.date.timeIntervalSince(caught.date) / DealBurst.duration)
            let ease = 1 - pow(1 - p, 3)
            ZStack {
                ForEach(0..<10, id: \.self) { k in
                    let angle = Double(k) / 10 * 2 * .pi
                    Circle()
                        .fill(Color(hex: k.isMultiple(of: 2) ? 0xFFD24A : 0xFFF1A8))
                        .frame(width: 9, height: 9)
                        .offset(x: cos(angle) * 46 * ease, y: sin(angle) * 46 * ease - 14 * ease)
                        .opacity(1 - p)
                }
                Text("+" + Format.money(caught.reward))
                    .font(Theme.display(18))
                    .foregroundStyle(Color.white)
                    .padding(.horizontal, 11)
                    .frame(minHeight: 30)
                    .background(Capsule().fill(Theme.money))
                    .overlay(Capsule().strokeBorder(Color.white.opacity(0.9), lineWidth: 2))
                    .shadow(color: Theme.cardShadow, radius: 4, y: 2)
                    .offset(y: -12 - 56 * ease)
                    .opacity(p < 0.7 ? 1 : (1 - p) / 0.3)
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// Son yakalanan fırsat (uçuş için).
struct DealCatch: Equatable {
    let id: Int
    let deal: ActiveDeal
    let reward: Double
    let date: Date
    /// CI karesi: uçuş yarı yolda donuk.
    var frozen = false
}
