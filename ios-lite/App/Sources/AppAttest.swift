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
///
/// Apple'ın kuralları: üretilen anahtarın kimliği sonradan geri alınamıyor,
/// üretilir üretilmez saklanıyor; Apple'a ulaşılamazsa (`serverUnavailable`)
/// kanıt aynı anahtar ve aynı challenge ile yeniden deneniyor; sunucu kanıtı
/// reddederse anahtar atılıyor.
@MainActor
final class AppAttestor {
    static let keyIdKey = "lite.attest.keyId"
    /// Üretilmiş, sunucunun henüz kabul etmediği anahtar ve bekleyen kanıtı.
    static let pendingKeyIdKey = "lite.attest.pendingKeyId"
    static let pendingChallengeKey = "lite.attest.pendingChallenge"
    static let pendingAttestationKey = "lite.attest.pendingAttestation"
    private let defaults = UserDefaults.standard

    var supported: Bool { DCAppAttestService.shared.isSupported }

    /// Sunucunun kabul ettiği (kanıtlanmış) anahtar.
    private(set) var keyId: String?

    init() {
        keyId = defaults.string(forKey: AppAttestor.keyIdKey)
    }

    /// Önceki denemeden kalan challenge (Apple'a ulaşılamadıysa ya da sunucuya gönderilemediyse).
    var pendingChallenge: String? { defaults.string(forKey: AppAttestor.pendingChallengeKey) }

    /// Kanıtlanacak challenge'ı sakla: yeniden deneme aynı challenge ile.
    func begin(challenge: String) {
        defaults.set(challenge, forKey: AppAttestor.pendingChallengeKey)
    }

    /// Bekleyen anahtarı (yoksa yenisini üretip hemen saklayarak) challenge ile kanıtla.
    /// Kanıt bu challenge için zaten alındıysa yeniden istenmiyor. Sunucu kabul edince `confirm`.
    /// Challenge base64; kanıta baytlarının SHA-256'sı giriyor.
    func attest(challenge: String) async throws -> (keyId: String, attestation: Data) {
        guard let raw = Data(base64Encoded: challenge) else { throw AttestFailure.challenge }
        let service = DCAppAttestService.shared
        let keyId: String
        if let pending = defaults.string(forKey: AppAttestor.pendingKeyIdKey) {
            keyId = pending
        } else {
            keyId = try await service.generateKey()
            defaults.set(keyId, forKey: AppAttestor.pendingKeyIdKey)
        }
        if let saved = defaults.data(forKey: AppAttestor.pendingAttestationKey), pendingChallenge == challenge {
            return (keyId, saved)
        }
        let attestation = try await service.attestKey(keyId, clientDataHash: Data(SHA256.hash(data: raw)))
        defaults.set(attestation, forKey: AppAttestor.pendingAttestationKey)
        return (keyId, attestation)
    }

    /// Challenge'ın süresi geçti: anahtar kalıyor, sonraki deneme yeni challenge ile.
    func dropChallenge() {
        defaults.removeObject(forKey: AppAttestor.pendingChallengeKey)
        defaults.removeObject(forKey: AppAttestor.pendingAttestationKey)
    }

    func confirm(_ keyId: String) {
        self.keyId = keyId
        defaults.set(keyId, forKey: AppAttestor.keyIdKey)
        defaults.removeObject(forKey: AppAttestor.pendingKeyIdKey)
        dropChallenge()
    }

    /// İsteğin tam gövdesi için onay.
    func assertion(for body: Data) async throws -> Data {
        guard let keyId else { throw AttestFailure.noKey }
        return try await DCAppAttestService.shared.generateAssertion(keyId, clientDataHash: Data(SHA256.hash(data: body)))
    }

    /// Anahtar geçersiz (sunucu tanımıyor ya da reddetti, hesap silindi): atılıyor,
    /// sonraki gönderimde yenisi üretilip kanıtlanıyor.
    func reset() {
        keyId = nil
        defaults.removeObject(forKey: AppAttestor.keyIdKey)
        defaults.removeObject(forKey: AppAttestor.pendingKeyIdKey)
        dropChallenge()
    }
}

enum AttestFailure: Error {
    case challenge
    case noKey
}
