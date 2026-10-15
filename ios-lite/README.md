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

**Bildirimler** (isteğe bağlı): oyun bir kez soruyor, ya da başlıktaki dişliden
**Ayarlar → Bildirimler**. Kasa dolunca, meclis toplanınca ve rakip seni geçince
haber veriyor. Hepsi yerel bildirim; sunucu ya da hesap yok.

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

İkisi de hesaplar hazır olana kadar kapalı; oyun etkilenmiyor. Haftalık puan
şimdiden sayılıyor.

### Lig sunucusu (Cloudflare, ücretsiz katman)

**Veritabanı hazır:** `capitalforge-lite-league` (D1, Doğu Avrupa, şema
uygulandı; kimlik `wrangler.toml`'de). Geriye Worker'ın kendisi kalıyor.

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
   açılıyor. O sürümden sonra şehir satıldıkça yıldız genel tabloya yazılıyor;
   lig penceresinde "Game Center genel tablosu" düğmesi çıkıyor.

### Hile payı

- Sunucu her gönderimi kendi saatiyle kaydediyor; telefonun saatini ileri
  almak işe yaramıyor.
- Aynı TS modeliyle (`packages/lite-model/src/league.ts`) iki şeyi denetliyor:
  - bildirilen seviyelerin maliyeti şehirde kazanılanla uyumlu mu;
  - puan artışı o seviyelerle en iyi koşullarda kazanılabilecek olanı aşıyor
    mu.
- Reddedilen gönderimler `rejects` tablosunda duruyor.
