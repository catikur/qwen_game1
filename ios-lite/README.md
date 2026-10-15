# CapitalForge Lite — iOS

CapitalForge'un idle mobil sürümü. Felsefe ana oyunla aynı: tedarik zinciri,
rakip, sermaye, holding. Oyun mantığı `Kit/` paketinde, uygulama `App/`
klasöründe (SwiftUI, iOS 17+). Tasarım ve denge: [`docs/LITE-TASARIMI.md`](../docs/LITE-TASARIMI.md).

## iPhone'da çalıştırmak (Mac + Xcode)

1. **Xcode'u kur.** App Store'dan Xcode 15 ya da daha yenisini kur ve bir kez
   açıp ek bileşenlerin kurulmasını bekle.
2. **Depoyu Mac'e indir.**

   ```sh
   git clone https://github.com/catikur/qwen_game1.git
   cd qwen_game1
   ```

3. **Projeyi oluştur ve aç.**

   ```sh
   ./ios-lite/xcode.sh
   ```

   Betik:
   - XcodeGen yoksa Homebrew ile kuruyor (`brew install xcodegen`);
   - `ios-lite/App/project.yml`'den `CapitalForgeLite.xcodeproj`'u üretiyor;
   - Xcode'da açıyor.

   Homebrew yoksa önce <https://brew.sh> adresindeki tek satırı çalıştır.
4. **İmza.**
   - Xcode'da sol üstte **CapitalForgeLite** projesini seç.
   - **Signing & Capabilities** sekmesinde **Team** olarak kendi Apple kimliğini
     seç: "Personal Team" yeterli, ücretli hesap gerekmiyor.
   - Paket kimliği başka biriyle çakışırsa **Bundle Identifier**'ın sonuna bir ek
     yaz, örneğin `com.catikur.capitalforgelite.atilla`.
5. **iPhone'u bağla.**
   - Kabloyla bağla, telefonda "Bu bilgisayara güven" de.
   - Xcode'un üst çubuğunda hedef olarak iPhone'unu seç.
   - iOS 16 ve sonrasında **Ayarlar → Gizlilik ve Güvenlik → Geliştirici Modu**'nu
     aç (telefon yeniden başlar).
6. **▶︎ (Run).** İlk kurulumda telefon geliştiriciye güvenmeni isteyebilir:
   **Ayarlar → Genel → VPN ve Cihaz Yönetimi → (Apple kimliğin) → Güven**.

Ücretsiz Apple kimliğiyle yapılan imza 7 gün geçerli. Süre dolunca uygulama
açılmaz; Xcode'dan yeniden ▶︎ demek yeter, kayıt telefonda kalır.

## Geliştirme

| Ne | Komut | Nerede |
|---|---|---|
| Oyun modeli testleri (Swift) | `cd ios-lite/Kit && swift test` | Mac |
| Uygulamayı simülatörde açmak | `./ios-lite/xcode.sh`, sonra bir iPhone simülatörü seç ve ▶︎ | Mac |
| Denge raporu (TypeScript modeli) | `pnpm lite:balance` | her yerde |
| Swift'e altın değerleri yeniden yazmak | `pnpm lite:fixtures` | her yerde |

Denge `packages/lite-model` içinde TypeScript'te ayarlanıyor; Swift modeli
(`Kit/Sources/CapitalForgeLiteKit/Model.swift`) aynı formüllerin çevirisi.

- Bir sayıyı değiştirdiysen **iki dosyada da** değiştir:
  - `packages/lite-model/src/content.ts`;
  - `ios-lite/Kit/Sources/CapitalForgeLiteKit/Content.swift`.
- Ardından `pnpm lite:fixtures` çalıştır.
- Eşitlik testleri (`FixtureTests`) iki model ayrışırsa kırmızı yanıyor.

CI (`.github/workflows/ios-lite.yml`) her değişiklikte macOS'ta şunları yapıyor:
- `swift test`;
- uygulamayı simülatör için derliyor;
- senaryo ekran görüntülerini `ios-lite-shots` dalına yazıyor.

Simülatörde senaryo açmak için uygulamayı `-liteScenario start|early|mid|late|council`
argümanıyla başlat. Xcode'da: **Product → Scheme → Edit Scheme → Run → Arguments**.
Senaryo modunda kayıt okunmuyor ve yazılmıyor.
