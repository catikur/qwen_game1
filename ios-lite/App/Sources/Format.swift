import Foundation

/// Para ve süre biçimi. Türkçede B (bin), M, Mr (milyar), Tn (trilyon), Ka
/// (katrilyon); İngilizcede K, M, B, T, Qa. Ondalık ayırıcı dile göre.
enum Format {
    private static let trUnits: [(Double, String)] = [(1e18, "Kn"), (1e15, "Ka"), (1e12, "Tn"), (1e9, "Mr"), (1e6, "M"), (1e3, "B")]
    private static let enUnits: [(Double, String)] = [(1e18, "Qi"), (1e15, "Qa"), (1e12, "T"), (1e9, "B"), (1e6, "M"), (1e3, "K")]

    static func number(_ value: Double) -> String {
        let units = L10n.lang == .tr ? trUnits : enUnits
        let sign = value < 0 ? "-" : ""
        let v = abs(value)
        for (scale, suffix) in units where v >= scale {
            return sign + decimal(v / scale, digits: v / scale >= 100 ? 1 : 2) + " " + suffix
        }
        if v >= 100 { return sign + decimal(v, digits: 0) }
        return sign + decimal(v, digits: v >= 10 ? 1 : 2)
    }

    static func money(_ value: Double) -> String {
        L10n.lang == .tr ? "\(number(value)) ₺" : "₺\(number(value))"
    }

    static func percent(_ fraction: Double) -> String {
        decimal(fraction * 100, digits: 0)
    }

    static func duration(_ seconds: Double) -> String {
        let s = Int(max(0, seconds).rounded())
        let h = s / 3600
        let m = (s % 3600) / 60
        let sec = s % 60
        if L10n.lang == .tr {
            if h > 0 { return "\(h) sa \(m) dk" }
            if m > 0 { return "\(m) dk \(sec) sn" }
            return "\(sec) sn"
        }
        if h > 0 { return "\(h)h \(m)m" }
        if m > 0 { return "\(m)m \(sec)s" }
        return "\(sec)s"
    }

    private static func decimal(_ value: Double, digits: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.locale = Locale(identifier: L10n.lang == .tr ? "tr_TR" : "en_US")
        formatter.minimumFractionDigits = digits
        formatter.maximumFractionDigits = digits
        return formatter.string(from: NSNumber(value: value)) ?? String(value)
    }
}
