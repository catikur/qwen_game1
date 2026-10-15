import CryptoKit
import DeviceCheck
import Foundation

/// App Attest (L9): lig gönderimlerinin gerçek uygulamadan, gerçek bir Apple
/// cihazından geldiğini sunucuya kanıtlıyor.
///
/// - Cihaz başına bir kez: anahtar üret, sunucunun challenge'ıyla kanıtla
///   (`packages/lite-league/src/attest.ts` doğruluyor).
/// - Her gönderimde: isteğin tam gövdesi için onay (imza ve artan sayaç).
///
/// Simülatörde App Attest yok: orada lig puanı gönderilmiyor.
@MainActor
final class AppAttestor {
    static let keyIdKey = "lite.attest.keyId"
    private let defaults = UserDefaults.standard

    var supported: Bool { DCAppAttestService.shared.isSupported }

    /// Sunucunun kabul ettiği (kanıtlanmış) anahtar.
    private(set) var keyId: String?

    init() {
        keyId = defaults.string(forKey: AppAttestor.keyIdKey)
    }

    /// Yeni anahtar üret ve challenge ile kanıtla. Sunucu kabul edince `confirm`.
    /// Challenge base64; kanıta baytlarının SHA-256'sı giriyor.
    func attest(challenge: String) async throws -> (keyId: String, attestation: Data) {
        guard let raw = Data(base64Encoded: challenge) else { throw AttestFailure.challenge }
        let service = DCAppAttestService.shared
        let keyId = try await service.generateKey()
        let attestation = try await service.attestKey(keyId, clientDataHash: Data(SHA256.hash(data: raw)))
        return (keyId, attestation)
    }

    func confirm(_ keyId: String) {
        self.keyId = keyId
        defaults.set(keyId, forKey: AppAttestor.keyIdKey)
    }

    /// İsteğin tam gövdesi için onay.
    func assertion(for body: Data) async throws -> Data {
        guard let keyId else { throw AttestFailure.noKey }
        return try await DCAppAttestService.shared.generateAssertion(keyId, clientDataHash: Data(SHA256.hash(data: body)))
    }

    /// Anahtar geçersiz (sunucu tanımıyor, hesap silindi): sonraki gönderimde yeniden kanıtlanıyor.
    func reset() {
        keyId = nil
        defaults.removeObject(forKey: AppAttestor.keyIdKey)
    }
}

enum AttestFailure: Error {
    case challenge
    case noKey
}
