import SwiftUI
import UIKit
import CapitalForgeLiteKit

/// Görsel dil (L5): "Cam & Bulut". Gündüz parlak bir gökyüzü, gece yıldızlı
/// bir lacivert; ikisi de cihazın açık/koyu moduna göre (Ayarlar'dan
/// zorlanabiliyor). Oyuncak şekiller: yuvarlak kartlar, alt kenarlı parlak
/// düğmeler, buzlu cam yüzeyler. Yazı: Fredoka (başlık ve sayılar), Nunito
/// (metin). Para yeşili yalnızca para için; iyi/kötü/uyarı ayrı.
///
/// Her renk jetonu iki değerli (gündüz, gece): görünümler yalnızca jeton
/// kullanıyor, hiçbir görünüm "gece miyiz" diye sormuyor. İstisna şehir
/// çizimi: orada ışık da değişiyor (`CityPalette`).
enum Theme {
    // MARK: - Metin ve para

    static let ink = Color(light: 0x1D3557, dark: 0xEEF3FF)
    static let muted = Color(light: 0x4F6C8E, dark: 0xA9BADD)
    static let soft = Color(light: 0x7D97B5, dark: 0x8296C2)
    static let money = Color(light: 0x0E9F5A, dark: 0x5BE39A)
    static let good = money
    static let bad = Color(light: 0xE04848, dark: 0xFF7A7A)
    static let warn = Color(light: 0xD98A00, dark: 0xFFC65C)

    // MARK: - Yüzeyler

    static let card = Color(light: 0xFFFFFF, dark: 0x263A70, lightAlpha: 0.72, darkAlpha: 0.52)
    static let cardBorder = Color(light: 0xFFFFFF, dark: 0xAAC3FF, lightAlpha: 0.95, darkAlpha: 0.22)
    static let cardShadow = Color(light: 0x1D3557, dark: 0x00000C, lightAlpha: 0.12, darkAlpha: 0.38)
    static let tile = Color(light: 0xFFFFFF, dark: 0x0A1434, lightAlpha: 0.65, darkAlpha: 0.42)
    static let track = Color(light: 0xFFFFFF, dark: 0x0A1434, lightAlpha: 0.55, darkAlpha: 0.55)
    static let trackOn = Color(light: 0xFFFFFF, dark: 0xFFFFFF, lightAlpha: 1, darkAlpha: 0.16)
    static let trackEdge = Color(light: 0x1D3557, dark: 0x000000, lightAlpha: 0.12, darkAlpha: 0.35)
    static let line = Color(light: 0x1D3557, dark: 0xAAC3FF, lightAlpha: 0.12, darkAlpha: 0.18)

    // MARK: - Olay, darboğaz, rakip payı

    static let eventFill = Color(light: 0xFFF8D6, dark: 0xFFCE6E, lightAlpha: 0.82, darkAlpha: 0.13)
    static let eventEdge = Color(light: 0xFFFFFF, dark: 0xFFCE6E, lightAlpha: 0.95, darkAlpha: 0.34)
    static let eventTitle = Color(light: 0xB07800, dark: 0xFFD37A)
    static let eventText = Color(light: 0x7E6420, dark: 0xE8D6AE)
    static let badFill = Color(light: 0xFFE3E0, dark: 0xFF7A7A, lightAlpha: 0.85, darkAlpha: 0.14)
    static let neck = Color(light: 0xFFF0C8, dark: 0xFFC65C, lightAlpha: 0.9, darkAlpha: 0.13)
    static let neckRing = Color(hex: 0xFFC65C)
    static let badgeText = Color(light: 0x6A4400, dark: 0x4A2E00)
    static let rivalTrack = Color(light: 0xFFD6D2, dark: 0xFF9696, lightAlpha: 0.8, darkAlpha: 0.18)

    // MARK: - Düğmeler (parlak: üst yarı açık, alt yarı koyu, altta kenar)

    static let orange = Gloss(top: [0xFFA65C, 0xFF8A3D], bottom: [0xFF7A2A, 0xFF8B3A], edge: Color(light: 0xD45F1C, dark: 0xA9480F))
    static let green = Gloss(top: [0x4FD88C, 0x2DC26F], bottom: [0x22B262, 0x2DBF6C], edge: Color(light: 0x189150, dark: 0x12723F))
    static let blue = Gloss(top: [0x7DB4FF, 0x5C98F5], bottom: [0x4683E8, 0x4F8CEE], edge: Color(light: 0x2E62BC, dark: 0x1F4890))
    static let gold = Gloss(top: [0xFFE08A, 0xFFCB4F], bottom: [0xFFB938, 0xFFC24A], edge: Color(light: 0xC98A1C, dark: 0x9A6610))
    static let red = Gloss(top: [0xFF8A8A, 0xF26464], bottom: [0xE54B4B, 0xEE5A5A], edge: Color(light: 0xB33232, dark: 0x8E2424))

    // MARK: - Zincirler

    /// Zincirin iki tonlu rengi (ikon karosu, çatı, pay çubuğu).
    static func chainColors(_ id: ChainId) -> (Color, Color) {
        switch id {
        case .bakery: (Color(light: 0xFFD25E, dark: 0xF2C24E), Color(light: 0xFFB020, dark: 0xD99A1C))
        case .coffee: (Color(light: 0xB47A4F, dark: 0xA06E48), Color(light: 0x8C5632, dark: 0x7A4E2E))
        case .fashion: (Color(light: 0xDA8BF0, dark: 0xC77EE3), Color(light: 0xB85DD6, dark: 0x9D52C2))
        case .leather: (Color(light: 0xFF7A7A, dark: 0xF06A6A), Color(light: 0xE04848, dark: 0xC43E44))
        case .tech: (Color(light: 0x5CC8FF, dark: 0x4DB6F0), Color(light: 0x2E9CE8, dark: 0x2A88D4))
        // L7: adalar.
        case .energy: (Color(light: 0x8EE06A, dark: 0x7FD25E), Color(light: 0x46BF55, dark: 0x3DA84B))
        case .auto: (Color(light: 0x5ED6C8, dark: 0x4FC6B8), Color(light: 0x22AFA2, dark: 0x1F9A8F))
        case .aviation: (Color(light: 0xFF8FB8, dark: 0xF07FAA), Color(light: 0xF25D92, dark: 0xD95283))
        }
    }

    static func chain(_ id: ChainId) -> Color { chainColors(id).1 }

    static func chainIcon(_ id: ChainId) -> String {
        switch id {
        case .bakery: "laurel.leading"
        case .coffee: "cup.and.saucer.fill"
        case .fashion: "tshirt.fill"
        case .leather: "handbag.fill"
        case .tech: "cpu.fill"
        case .energy: "bolt.fill"
        case .auto: "car.fill"
        case .aviation: "airplane"
        }
    }

    // MARK: - Gökyüzü

    static func sky(_ scheme: ColorScheme) -> LinearGradient {
        let stops: [UInt32] = scheme == .dark
            ? [0x0A1433, 0x142659, 0x1B2F66, 0x20356F]
            : [0x7CCBFF, 0xA9DEFF, 0xD3EEFF, 0xE8F6FF]
        let locations: [CGFloat] = [0, 0.36, 0.66, 1]
        return LinearGradient(
            stops: zip(stops, locations).map { Gradient.Stop(color: Color(hex: $0.0), location: $0.1) },
            startPoint: .top,
            endPoint: .bottom
        )
    }

    // MARK: - Yazı

    /// Fredoka: başlıklar ve sayılar. Uygulamayla birlikte geliyor (OFL).
    static func display(_ size: CGFloat, _ weight: Font.Weight = .bold) -> Font {
        let name = switch weight {
        case .medium, .regular, .light: "Fredoka-Medium"
        case .semibold: "Fredoka-SemiBold"
        default: "Fredoka-Bold"
        }
        return .custom(name, fixedSize: size)
    }

    /// Nunito: metin ve etiketler.
    static func text(_ size: CGFloat, _ weight: Font.Weight = .bold) -> Font {
        let name = switch weight {
        case .medium, .regular, .light, .semibold: "Nunito-SemiBold"
        case .heavy, .black: "Nunito-ExtraBold"
        default: "Nunito-Bold"
        }
        return .custom(name, fixedSize: size)
    }

    /// Küçük büyük harf etiketi (GÖREV 12/15, ÇARŞI…).
    static func caps(_ size: CGFloat = 10) -> Font { text(size, .heavy) }
}

/// Parlak düğme boyası: iki yarım degrade ve alt kenar rengi.
struct Gloss {
    let top: [UInt32]
    let bottom: [UInt32]
    let edge: Color

    var fill: LinearGradient {
        LinearGradient(
            stops: [
                .init(color: Color(hex: top[0]), location: 0),
                .init(color: Color(hex: top[1]), location: 0.5),
                .init(color: Color(hex: bottom[0]), location: 0.5),
                .init(color: Color(hex: bottom[1]), location: 1),
            ],
            startPoint: .top,
            endPoint: .bottom
        )
    }
}

// MARK: - Düğme stili

/// Oyuncak düğme: parlak yüz, altta kenar, basınca kenar kadar iniyor.
struct GlossyButtonStyle: ButtonStyle {
    var gloss: Gloss? = Theme.orange
    var radius: CGFloat = 14
    var edge: CGFloat = 4
    var foreground: Color = .white

    func makeBody(configuration: Configuration) -> some View {
        let pressed = configuration.isPressed
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        configuration.label
            .foregroundStyle(gloss == nil ? Theme.soft : foreground)
            .background {
                ZStack {
                    shape.fill(gloss?.edge ?? Theme.trackEdge).offset(y: pressed ? 1 : edge)
                    if let gloss {
                        shape.fill(gloss.fill)
                        shape.strokeBorder(
                            LinearGradient(colors: [.white.opacity(0.5), .white.opacity(0)], startPoint: .top, endPoint: .center),
                            lineWidth: 1.5
                        )
                    } else {
                        shape.fill(Theme.track)
                    }
                }
            }
            .offset(y: pressed ? edge - 1 : 0)
            .padding(.bottom, edge)
            // iPad imleci: düğme hafifçe kalkıyor.
            .contentShape(.hoverEffect, shape)
            .hoverEffect(.lift)
            .animation(.spring(response: 0.18, dampingFraction: 0.7), value: pressed)
    }
}

extension ButtonStyle where Self == GlossyButtonStyle {
    static func glossy(_ gloss: Gloss? = Theme.orange, radius: CGFloat = 14, edge: CGFloat = 4, foreground: Color = .white) -> GlossyButtonStyle {
        GlossyButtonStyle(gloss: gloss, radius: radius, edge: edge, foreground: foreground)
    }
}

// MARK: - Kartlar ve küçük parçalar

/// Buzlu cam kart: yuvarlak, ince açık kenar, yumuşak gölge.
struct GlassCard: ViewModifier {
    var radius: CGFloat = 22
    var padding: CGFloat = 12

    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        content
            .padding(padding)
            .background(Theme.card, in: shape)
            .background(.ultraThinMaterial, in: shape)
            .overlay(shape.strokeBorder(Theme.cardBorder, lineWidth: 1))
            .shadow(color: Theme.cardShadow, radius: 14, y: 8)
    }
}

extension View {
    func glassCard(radius: CGFloat = 22, padding: CGFloat = 12) -> some View {
        modifier(GlassCard(radius: radius, padding: padding))
    }
}

/// Renkli ikon karosu: degrade, üstte ışık çizgisi, altta ince kenar.
struct IconTile: View {
    let symbol: String
    let colors: (Color, Color)
    var size: CGFloat = 34

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: size * 0.35, style: .continuous)
        Image(systemName: symbol)
            .font(.system(size: size * 0.48, weight: .bold))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(LinearGradient(colors: [colors.0, colors.1], startPoint: .top, endPoint: .bottom), in: shape)
            .overlay(shape.strokeBorder(LinearGradient(colors: [.white.opacity(0.5), .clear], startPoint: .top, endPoint: .center), lineWidth: 1.2))
            .background(shape.fill(Color.black.opacity(0.15)).offset(y: 2))
    }
}

/// Kasa yanındaki altın para.
struct Coin: View {
    var size: CGFloat = 30

    var body: some View {
        Text("₺")
            .font(Theme.display(size * 0.55))
            .foregroundStyle(.white)
            .shadow(color: Color(hex: 0xB9781C), radius: 0, y: 1)
            .frame(width: size, height: size)
            .background(
                Circle().fill(RadialGradient(colors: [Color(hex: 0xFFE47A), Color(hex: 0xF2B230)], center: UnitPoint(x: 0.35, y: 0.3), startRadius: 1, endRadius: size * 0.7))
            )
            .overlay(Circle().strokeBorder(Color(hex: 0xC27C10), lineWidth: 2))
            .background(Circle().fill(Color(hex: 0xC27C10)).offset(y: 2))
    }
}

/// Küçük hap etiketi (DARBOĞAZ, Kahve ×2…).
struct Pill: View {
    let text: String
    var symbol: String?
    var fill: AnyShapeStyle = AnyShapeStyle(LinearGradient(colors: [Color(hex: 0xFFD878), Color(hex: 0xFFB938)], startPoint: .top, endPoint: .bottom))
    var foreground: Color = Theme.badgeText
    var font: Font = Theme.text(8.5, .heavy)

    var body: some View {
        HStack(spacing: 2) {
            if let symbol { Image(systemName: symbol).font(.system(size: 7, weight: .black)) }
            Text(text)
        }
        .font(font)
        .foregroundStyle(foreground)
        .padding(.horizontal, 5)
        .padding(.vertical, 2)
        .background(fill, in: Capsule())
    }
}

// MARK: - Renk yardımcıları

extension UIColor {
    convenience init(hex: UInt32, alpha: Double = 1) {
        self.init(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: CGFloat(alpha)
        )
    }
}

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: alpha
        )
    }

    /// Gündüz ve gece değerli renk: cihazın (ya da Ayarlar'ın) görünümüne uyuyor.
    init(light: UInt32, dark: UInt32, lightAlpha: Double = 1, darkAlpha: Double = 1) {
        self.init(UIColor { traits in
            traits.userInterfaceStyle == .dark ? UIColor(hex: dark, alpha: darkAlpha) : UIColor(hex: light, alpha: lightAlpha)
        })
    }
}
