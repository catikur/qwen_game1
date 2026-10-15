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
   - **Signing & Capabilities** sekmesinde **Team** ücretli ekip olarak hazır
     geliyor (`DEVELOPMENT_TEAM`). Ücretsiz Apple kimliğiyle denemek için
     "Personal Team" seç.
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

**Bildirimler** (isteğe bağlı): oyun bir kez soruyor, ya da başlıktaki dişliden
**Ayarlar → Bildirimler**. Kasa dolunca, meclis toplanınca ve rakip seni geçince
haber veriyor. Hepsi yerel bildirim; sunucu ya da hesap yok.

## App Store'a yükleme (TestFlight)

Ücretli Apple Developer Program üyeliği gerekiyor. Xcode, App Store'daki en
son sürüm olmalı: App Store Connect eski SDK ile derlenen yüklemeyi kabul
etmiyor. CI'daki "cihaz derlemesi (App Store)" işi aynı derlemeyi imzasız
yapıyor; orası yeşilse Mac'te yalnızca imza kalıyor.

**Bir kez:**

1. **Xcode'a giriş:** **Xcode → Settings → Accounts → +** → Apple ID. Listede
   ekibin (Team) "Personal Team" değil, şirket ya da kendi adınla görünmeli.
2. **Team ID:** `project.yml`'de `DEVELOPMENT_TEAM` (`77J92PA5Q9`); proje
   her üretildiğinde ekip hazır geliyor. Ekip değişirse
   [developer.apple.com/account](https://developer.apple.com/account) →
   **Membership details** → **Team ID**.
3. **Paket kimliğini kaydet:** projeyi aç (`./ios-lite/xcode.sh`), bir kez
   iPhone'a ya da "Any iOS Device"a derle. Xcode
   `com.catikur.capitalforgelite` kimliğini hesabına kaydediyor.
4. **App Store Connect kaydı:** [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
   → **Apps → + → New App**:
   - Platform **iOS**;
   - Name **CapitalForge Lite** (alınmışsa başka bir ad; sonra değişebilir);
   - Primary Language **Turkish**;
   - Bundle ID `com.catikur.capitalforgelite`;
   - SKU `capitalforge-lite`;
   - User Access **Full Access**.

**Her yüklemede:**

1. `git pull`, sonra `./ios-lite/xcode.sh`.
2. **CapitalForgeLite** hedefi → **Signing & Capabilities**'ta ekip zaten
   seçili (Automatically manage signing açık). Kırmızı uyarı varsa **Try
   Again**.
3. Üst çubukta hedef: **Any iOS Device (arm64)** (simülatör seçiliyken
   arşiv menüsü gri).
4. **Product → Archive.** Bitince **Organizer** açılıyor.
5. **Distribute App → App Store Connect → Distribute**. Xcode imzayı,
   sertifikayı ve profili kendisi hazırlıyor.
6. App Store Connect → uygulama → **TestFlight**: yükleme 10–30 dakikada
   işleniyor. Şifreleme sorusu çıkmıyor (Info.plist'te yanıtlı).
7. **Internal Testing → +** grup kur, kendini ekle. iPhone'a **TestFlight**
   uygulamasını kur; davetten yükle.

Aynı yapı numarasıyla (`CFBundleVersion`, `project.yml`) ikinci kez yükleme
reddediliyor; her sürümde artıyor.

**Mağazaya göndermeden önce** (TestFlight için gerekmiyor):
- **App Privacy** soruları (`Resources/PrivacyInfo.xcprivacy` ile aynı):
  - toplanan veri: **User ID** (lig adı) ve **Gameplay Content** (haftalık puan);
  - ikisi de **App Functionality**, **Linked to user: Yes**, **Tracking: No**;
  - başka veri yok, reklam yok.
- **Privacy Policy URL** (zorunlu).
- Ekran görüntüleri: 6,9" iPhone ve 13" iPad.
- Kategori (Games → Simulation), yaş derecelendirmesi, açıklama.

**Sık takılanlar:**
- *"No profiles for 'com.catikur.capitalforgelite'"*: Xcode'da ücretli ekibin
  hesabı açık değil (Settings → Accounts). Giriş yap, **Try Again**.
- *"Bundle identifier is not available"*: kimlik başka bir hesapta kayıtlı;
  `project.yml`'de `PRODUCT_BUNDLE_IDENTIFIER`'ı değiştir.
- *Organizer'da arşiv yok*: hedef simülatördü; **Any iOS Device** seç, yeniden
  **Archive**.

## Geliştirme

| Ne | Komut | Nerede |
|---|---|---|
| Oyun modeli testleri (Swift) | `cd ios-lite/Kit && swift test` | Mac |
| Uygulamayı simülatörde açmak | `./ios-lite/xcode.sh`, sonra bir iPhone ya da iPad simülatörü seç ve ▶︎ | Mac |
| Denge raporu (TypeScript modeli) | `pnpm lite:balance` | her yerde |
| Swift'e altın değerleri yeniden yazmak | `pnpm lite:fixtures` | her yerde |
| Uygulama simgesini yeniden üretmek | `node ios-lite/App/tools/make-icon.mjs` (Playwright gerekir) | her yerde |

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

Simülatörde senaryo açmak için uygulamayı
`-liteScenario start|early|mid|late|council|ipo|listed|city2|islands|skyline|desert|snow` argümanıyla başlat.
Xcode'da: **Product → Scheme → Edit Scheme → Run → Arguments**.

- Senaryo modunda kayıt okunmuyor ve yazılmıyor, ses kapalı, oyun saati donuk.
- Ek argümanlar:
  - `-liteOffline <sn>`: "yokken kazandın" penceresi;
  - `-liteSettings`: Ayarlar açık;
  - `-liteScroll market`: liste borsa kartına kaymış;
  - `-liteLandscape`: iPad yatay açılıyor;
  - `-liteIsland <1-3>`: şehir o adanın sayfasında (L7);
  - `-liteMap`: holding haritası açık;
  - `-liteLeague`: lig örnek veriyle (ağ yok), `-liteLeagueSheet` lig penceresi
    açık, `-liteLeaguePrivate` özel ligler sekmesi.

Uygulama iPad'de de çalışıyor (L6): yatayda solda şehir, sağda kartlar;
dikeyde üstte şehir, altta iki sütun kart. Split View'in dar penceresinde
telefon düzenine dönüyor. Klavyede 1/2/3 toplu alım, K kampanya.

## Online lig (L8)

İki parça:
- **Haftalık lig ve özel ligler:** kendi sunucumuz (`packages/lite-league`,
  Cloudflare Workers + D1).
- **Genel tablo:** Game Center.

Lig sunucusu kurulu ve uygulama ona bağlı. Game Center ücretli Apple
Developer üyeliği gelene kadar kapalı; oyun etkilenmiyor.

### Lig sunucusu (Cloudflare, ücretsiz katman)

**Kurulu:** Worker `https://capitalforge-lite-league.catikur.workers.dev`
(D1 bağlaması `DB`, pazartesi cron'u açık), veritabanı `capitalforge-lite-league`
(D1, Doğu Avrupa; kimlik `wrangler.toml`'de). Uygulama bu adrese bağlı
(`project.yml` → `LiteLeagueURL`). Her PR'da ve `main`'de "Canlı sunucu
denetimi" işi hesap açıyor, ligi okuyor ve hesabı siliyor. Sunucu eski
sürümdeyse uyarı veriyor: o zaman aşağıdaki A'nın 1. ve 3. adımı.

Kod değişince sunucuyu güncellemek için aşağıdaki A ya da B.

**A · Panelden yapıştır (API anahtarı gerekmez):**

1. `pnpm lite:league-bundle` →
   `packages/lite-league/dist/capitalforge-lite-league.js` (tek dosya).
2. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages →
   Create → Start with Hello World!**:
   - ad: `capitalforge-lite-league`;
   - **Deploy**.
3. **Edit code**: içindekini sil, dosyanın tamamını yapıştır, **Deploy**.
4. Worker'ın **Settings → Bindings → Add → D1 database**:
   - değişken adı `DB`;
   - veritabanı `capitalforge-lite-league`;
   - **Add binding**.
5. İsteğe bağlı: **Settings → Trigger events → Add → Cron**, `5 0 * * 1`
   (pazartesi bölüm değişimi; yapılmazsa ilk istekte yapılıyor).
6. Worker'ın adresi (`https://capitalforge-lite-league.<alt-alan>.workers.dev`)
   `ios-lite/App/project.yml`'de `LiteLeagueURL`'ye yazılıyor.

Kod değiştikçe 1 ve 3 tekrarlanıyor.

**B · Otomatik dağıtım (her `main` değişikliğinde):**

1. **My Profile → API Tokens → Create Token** aç:
   - **Edit Cloudflare Workers** şablonunu seç;
   - **Account → D1 → Edit** iznini ekle.
2. Depoya iki sır ekle (**Settings → Secrets and variables → Actions**):
   - `CLOUDFLARE_API_TOKEN`: 1. adımdaki anahtar;
   - `CLOUDFLARE_ACCOUNT_ID`: Workers & Pages sayfasının sağındaki **Account ID**.
3. **Actions → Lite lig sunucusu → Run workflow**. İş, var olan veritabanını adından
   buluyor.

### Game Center (ücretli Apple Developer üyeliği)

1. [developer.apple.com/programs](https://developer.apple.com/programs/enroll/)
   adresinden Apple Developer Program'a katıl (yılda 99 $).
2. Xcode'da **Signing & Capabilities → Team** olarak ücretli takımı seç.
3. [App Store Connect](https://appstoreconnect.apple.com)'te uygulamayı oluştur:
   **Apps → + → New App**, Bundle ID `com.catikur.capitalforgelite`.
4. Uygulamanın sayfasında **Services → Game Center → Leaderboards → +** ile bir
   tablo ekle:
   - tür: **Classic**;
   - **Leaderboard ID**: `cf.lite.stars`;
   - ad: "Holding Yıldızı";
   - puan biçimi: Integer;
   - sıralama: High to Low.
5. Uygulamada Game Center yetkisi (entitlement) ve `LiteGameCenter: true`
   açık (`App/project.yml`). Bu sürümden sonra şehir satıldıkça yıldız genel tabloya yazılıyor;
   lig penceresinde "Game Center genel tablosu" düğmesi çıkıyor.

### Hile payı

- Sunucu her gönderimi kendi saatiyle kaydediyor; telefonun saatini ileri
  almak işe yaramıyor.
- Aynı TS modeliyle (`packages/lite-model/src/league.ts`) iki şeyi denetliyor:
  - bildirilen seviyelerin maliyeti şehirde kazanılanla uyumlu mu;
  - puan artışı o seviyelerle en iyi koşullarda kazanılabilecek olanı aşıyor
    mu.
- Reddedilen gönderimler `rejects` tablosunda duruyor.
