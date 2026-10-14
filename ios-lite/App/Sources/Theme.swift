import SwiftUI
import CapitalForgeLiteKit

/// Görsel dil: ana oyunun "Kambiyo" teması. Aydınlık kâğıt zemin, mürekkep
/// vurgu, sıfır yuvarlaklık, gölge yok, rakamlar tabular. Kâr yeşili
/// (brass) yalnızca para için; iyi/kötü/uyarı ayrı.
enum Theme {
    static let background = Color(hex: 0xE6E7E4)
    static let paper = Color(hex: 0xF1F2F0)
    static let panel = Color.white
    static let ink = Color(hex: 0x0D1210)
    static let muted = Color(hex: 0x5F6764)
    static let line = Color(hex: 0x0D1210).opacity(0.18)
    static let lineStrong = Color(hex: 0x0D1210).opacity(0.34)
    static let accentSoft = Color(hex: 0x0D1210).opacity(0.07)
    static let money = Color(hex: 0x0B6A4F)
    static let good = Color(hex: 0x0F7A45)
    static let bad = Color(hex: 0xB02A1E)
    static let warn = Color(hex: 0x9A6A10)

    /// Zincirlerin rengi: ana oyundaki kategori renklerinden.
    static func chain(_ id: ChainId) -> Color {
        switch id {
        case .bakery: Color(hex: 0xC9A83F)
        case .coffee: Color(hex: 0x8A5A3B)
        case .fashion: Color(hex: 0xA86FBB)
        case .leather: Color(hex: 0xB8484F)
        case .tech: Color(hex: 0x4A9AC4)
        }
    }

    static func mono(_ size: CGFloat, _ weight: Font.Weight = .semibold) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }

    static func sans(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .default)
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
}

/// Kâğıt üstüne çizilmiş kutu: ince çizgi, köşe yok.
struct Ruled: ViewModifier {
    var strong = false
    func body(content: Content) -> some View {
        content
            .background(Theme.panel)
            .overlay(Rectangle().stroke(strong ? Theme.ink : Theme.line, lineWidth: strong ? 1.5 : 1))
    }
}

extension View {
    func ruled(strong: Bool = false) -> some View { modifier(Ruled(strong: strong)) }
}
