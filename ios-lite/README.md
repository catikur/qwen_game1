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
    açık, `-liteLeaguePrivate` özel ligler, `-liteLeagueStars` yıldız tablosu sekmesi;
  - `-liteDeal order|vip|investor`: şehirde fırsat balonu; `-liteDealCaught`
    yakalanmış hali (uçuş donuk).

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

**B · CI'den dağıtım (elle başlatılan, isteğe bağlı her `main` değişikliğinde):**

1. **My Profile → API Tokens → Create Token** aç:
   - **Edit Cloudflare Workers** şablonunu seç;
   - **Account → D1 → Edit** iznini ekle.
2. Depoya iki sır ekle (**Settings → Secrets and variables → Actions**):
   - `CLOUDFLARE_API_TOKEN`: 1. adımdaki anahtar;
   - `CLOUDFLARE_ACCOUNT_ID`: Workers & Pages sayfasının sağındaki **Account ID**.
3. **Actions → Lite lig sunucusu → Run workflow**. İş, var olan veritabanını adından
   buluyor.
4. İsteğe bağlı: `main`'e her birleşmede dağıtım için depo değişkeni
   `LITE_LEAGUE_AUTODEPLOY` = `true` (**Settings → Secrets and variables →
   Actions → Variables**). Varsayılan kapalı: canlıya geçiş senin kararın
   (Tur 51, Codex #80). Sırlar olsa da değişken yoksa birleşme yalnız denetimi
   koşturuyor, dağıtmıyor.

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
- **App Attest** (Apple): puan yalnızca gerçek uygulamadan, gerçek bir Apple
  cihazından kabul ediliyor.
  - Cihaz başına bir kez: uygulama anahtar üretiyor, sunucunun tek seferlik
    challenge'ıyla Apple'a kanıtlatıyor; sunucu sertifika zincirini Apple'ın
    App Attest köküne, uygulama kimliğini (`77J92PA5Q9.com.catikur.capitalforgelite`)
    ve anahtarı doğruluyor (`packages/lite-league/src/attest.ts`).
  - Her gönderimde: isteğin tam gövdesi üstüne imza ve artan sayaç. Gövdeyi
    değiştirmek ya da eski bir isteği yeniden göndermek işe yaramıyor.
  - Bir anahtar tek hesaba bağlı; yeni kurulumda yeni anahtar eskisinin yerini
    alıyor.
  - Anahtar üretilir üretilmez saklanıyor (Apple'ın kuralı). Apple'a ya da
    sunucuya ulaşılamazsa sonraki turda aynı anahtar ve aynı challenge ile
    yeniden deneniyor (challenge 30 dakika geçerli); sunucu kanıtı reddederse
    anahtar atılıyor.
  - Simülatörde App Attest yok: orada puan gönderilmiyor (lig penceresinde not).
  - Geliştirme (Xcode) ve dağıtım (TestFlight, App Store) anahtarlarının ikisi
    de kabul; uygulama kategorisi (TestFlight, App Store, geliştirme) dışındaki
    imzalar (ad hoc, kurumsal) reddediliyor.
- Reddedilen gönderimler ve doğrulama hataları `rejects` tablosunda duruyor
  (`attest:…`, `assertion:…`).
- **Adlar** herkese görünüyor: şirket ve lig adlarında küfür süzgeci var
  (Türkçe ve İngilizce, rakamlı yazım dahil; `offensiveName`). Reddedilen ad
  için uygulama "Bu ad kullanılamıyor" diyor.

## Web ve cihazlar arası (L10)

Aynı oyunun web sürümü `apps/lite-web` (tasarım: `docs/LITE-TASARIMI.md` §15).
GitHub Pages'te <https://catikur.github.io/qwen_game1/lite/>; aynı lig sunucusu,
aynı haftalık lig ve özel ligler.

- **Hile payı (web, Android):** cihaz kanıtı yok. Oyun sunucuda: istemci
  hamlelerini günlük olarak gönderiyor, sunucu aynı modeli oynatıyor; süre
  sunucunun saatinden. İleri alınan saat ve elle şişirilen kasa geri alınıyor.
- **iPhone ve iPad:** her gönderimde kaydını da App Attest onayıyla yüklüyor
  (`POST /v1/save`). Öne gelince başka cihaz ilerlemişse o duruma geçiyor.
- **Başka cihazda oyna:** Lig → "Başka cihazda oyna" → **Kod al**. Öbür cihazda
  aynı kart → kodu gir → **Buraya al**. Kod 10 dakika geçerli, bir kez
  kullanılıyor; iki cihaz da aynı hesapla oynamayı sürdürüyor.
- **Yıldız tablosu:** Lig → **Yıldız**: bütün platformların holding yıldızı
  (dünya ilk 50 ve özel lig arkadaşları). Game Center yalnızca Apple'da.

| Ne | Komut |
|---|---|
| Web sürümünü yerelde açmak | `pnpm lite:league-local` (yerel lig, 8788) ve `VITE_LEAGUE_URL=http://127.0.0.1:8788 pnpm lite:web` |
| Web paketi | `pnpm lite:web-build` → `apps/lite-web/dist` |
| Uçtan uca test ve kareler | `pnpm lite:web-e2e` (Playwright; kareler `apps/lite-web/shots`) |

Senaryo kareleri: adrese `?scenario=<ad>` (iOS ile aynı adlar); ek
parametreler `lang=tr|en`, `theme=day|night`, `sheet=settings|league|map`,
`league` (örnek lig), `private`, `stars`, `deal=order|vip|investor`, `caught`,
`offline=<sn>`, `island=<n>`, `scroll=market|holding|league`.

**Sunucuyu güncellerken (L10):** yeni tablolar (`tokens`, `saves`, `profiles`,
`links`) `schema.sql`'de; uzak veritabanına bir kez uygulanmalı (CI'nin
dağıtım işi ya da D1 konsolunda `d1-console.sql`, aşağıda). `TURNSTILE_SECRET`
sırrını şimdilik **tanımlama**: sunucu tarafı hazır ama web ve Android
istemcisinde doğrulama kutusu henüz yok; sır tanımlanırsa yeni web ve Android
hesapları açılamaz (bot sorunu çıkarsa istemci tarafı eklenecek).

**Sunucuyu güncellerken (Tur 51–53, ana oyunun Tohum Ligi):** GitHub
Pages'teki CapitalForge de lig tablosunu bu sunucudan okuyor (`src/seed.ts`).
Canlı sunucu bu sürüme gelene kadar oyun kendi yerel tablosuyla açılıyor; bir
şey bozulmuyor. Tur 52'den beri sunucu her koşuyu gönderimde yeniden
oynatıyor: tabloya yalnız doğrulanmış skor giriyor.

Açmak için (sıra önemli):

1. **Workers Paid** (aylık 5 $): Cloudflare panelinde **Workers & Pages →
   Plans**. Tekrar koşu başına ~1,5–2 sn CPU harcıyor; ücretsiz katmanın
   istek başına sınırı 10 ms. Ücretsiz katmanda gönderimler CPU sınırına
   takılır (oyun bunu geçici hata sayıp koşuyu bekletiyor); Lite etkilenmiyor.
   Ücretli planın varsayılan sınırı (istek başına 30 sn) yetiyor, ayar gerekmiyor.
2. Şema. **Storage & Databases → D1 → capitalforge-lite-league →
   Console**: `packages/lite-league/d1-console.sql`'in satırlarını yapıştır,
   çalıştır. `schema.sql`'i olduğu gibi yapıştırma: açıklamalarındaki `;` ve
   kesme işaretleri ("Lite'ın") konsolun ifadeleri ayırmasını bozuyor, şema
   hata veriyor. Konsol dosyası aynı ifadeler, açıklamasız ve her ifade tek
   satırda. Toplu yapıştırma hata verirse satır satır. Her tablo `IF NOT
   EXISTS`: var olanlar ve içlerindeki veri (Lite'ın oyuncuları, kayıtları)
   değişmiyor, tekrar çalıştırmak zarar vermiyor. Doğrulanmış koşular
   `seed_verified`'da. Kontrol: `SELECT name FROM sqlite_master WHERE type =
   'table' AND name LIKE 'seed_%' ORDER BY name;` beş tablo
   (`seed_gaps`, `seed_league_members`, `seed_leagues`, `seed_limits`,
   `seed_verified`).
3. Kod. `pnpm lite:league-bundle` → paketi paneldeki Worker kodunun yerine
   yapıştır, **Deploy** (A'nın 1. ve 3. adımı). Paket ana oyunun motorunu da
   taşıyor (~700 KB, sıkıştırılmış ~185 KB; ücretli sınır 10 MB). Yeni kod
   sağlık ucunda hemen `"seed":1`, `"verify":1` ve `"daily":1` diyor ve oyun sunucu
   tablosuna geçiyor; tablolar yoksa istekleri düşerdi (Codex #80). Oyun
   `"verify":1` demeyen sunucuyu (Tur 51'inki) kullanmıyor: o koşuyu
   doğrulamadan eski tabloya yazıyor, yeni kod gelince görünmez olurdu
   (Codex #81).
4. Denetim: `/v1/health` cevabında `"seed":1`, `"verify":1` ve (Tur 53'ten
   beri) `"daily":1`. Pages'teki oyun sonraki açılışta lig sunucusunun
   tablosuna geçiyor.
5. Yalnız Tur 51 canlıya gittiyse (gitmedi): yeni Worker çalışırken konsolda
   `DROP TABLE IF EXISTS seed_runs;`. O tabloda sunucunun doğrulamadığı
   koşular var; yeni kod onu okumuyor. Şema Worker'dan önce uygulandığı için
   2. adımda silinmiyor: eski Worker yeni kod gelene kadar onunla çalışsın
   (Codex #81).

**Tur 53 (haftanın kuralı ve günün koşusu):** şema değişmedi, günün
koşuları da `seed_verified`'da. Yalnız 3. adım (kod). Oyun `"daily":1`
demeyen sunucuyu (Tur 52'ninki: günün koşusunun ucu ve haftanın kuralı yok)
eski sayıp yerel tabloyla açılıyor; yeni kod gelince sunucuya dönüyor.

**Tur 55 (davetli ligler ve arkadaş tablosu):** iki yeni tablo
(`seed_leagues`, `seed_league_members`, `schema.sql`'in son bölümü). Sıra yine
şema, kod:

1. D1 konsolunda `d1-console.sql` (yukarıdaki 2. adım), ya da yalnız bu üç
   satır (her tablo `IF NOT EXISTS`, var olanlar değişmiyor):

   ```sql
   CREATE TABLE IF NOT EXISTS seed_leagues (code TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS seed_league_members (code TEXT NOT NULL, player_id TEXT NOT NULL, joined_at INTEGER NOT NULL, PRIMARY KEY (code, player_id));
   CREATE INDEX IF NOT EXISTS seed_league_members_by_player ON seed_league_members (player_id);
   ```

2. Kod: 3. adım (paketi yapıştır, Deploy).
3. Denetim: `/v1/health` cevabında `"friends":1`.

Kod şemadan önce giderse bir şey bozulmuyor: sağlık ucu `"friends":0` diyor,
oyun arkadaş liglerini göstermiyor, genel tablo ve Lite eskisi gibi; hesap
silme ve haftalık temizlik yeni tabloları yoksa atlıyor.

**Şema değişince:** `schema.sql`'i düzenle, sonra `pnpm lite:d1-sql` konsol
dosyasını yeniden üretiyor. `test/consoleSql.test.ts` ikisinin eşit olduğunu,
konsol dosyasının açıklamasız ve ASCII olduğunu, satır satır (iki kez de)
çalıştırılınca şemanın aynısını kurduğunu ve Lite'ın eski veritabanındaki
veriye dokunmadığını denetliyor.

**Canlı durum (2026-10-23):** şema uygulandı. Veritabanından okundu (yalnız
`SELECT`): beş `seed_*` tablosu ve üç dizin şemayla birebir, Lite'ın
tabloları ve verisi yerinde (3 oyuncu, kayıt, haftalık puanlar). Worker kodu
aynı gün dağıtıldı.

**Tur 56 (lojistik: nakliye terminali ve taşıma sözleşmeleri):** şema
değişmedi, simülasyon değişti (yeni bina, taşıma ücreti). Yalnız 3. adım
(kod): `pnpm lite:league-bundle`, paketi yapıştır, Deploy. Sağlık ucu
değişmiyor. Paket yapıştırılana kadar Tur 56'dan sonra oynanan koşular
"sunucu bu sürümü henüz tanımıyor" diye bekliyor (aşağıda), Lite etkilenmiyor.

**Tur 57 (enerji: santraller, şebeke fiyatı, enerji krizi):** şema
değişmedi, simülasyon değişti (iki santral, enerji faturası, yeni kriz,
yakıt sabitleme komutu). Yine yalnız 3. adım: `pnpm lite:league-bundle`,
paketi yapıştır, Deploy. Sağlık ucu değişmiyor, Lite etkilenmiyor.

**Tur 58 (gayrimenkul: proje, kira, kentsel dönüşüm):** şema değişmedi,
simülasyon değişti (iki proje, kira ve doluluk, dönüşüm hakkı, iki yeni
komut). Yine yalnız 3. adım: `pnpm lite:league-bundle`, paketi yapıştır,
Deploy. Sağlık ucu değişmiyor, Lite etkilenmiyor.

**Tur 59 (Rakipler 2.0: hafıza, husumet ve ittifak):** şema değişmedi,
simülasyon değişti (ilişki puanı, rakiplerin tepkileri, uzlaşma komutu).
Yine yalnız 3. adım: `pnpm lite:league-bundle`, paketi yapıştır, Deploy.
Sağlık ucu değişmiyor, Lite etkilenmiyor.

**Tur 60 (senaryo paketi II):** şema değişmedi, simülasyon değişti (kinli
rakip taşıma teklifi getirmiyor; senaryolar ligde yok). Yine yalnız 3.
adım: `pnpm lite:league-bundle`, paketi yapıştır, Deploy. Sağlık ucu
değişmiyor, Lite etkilenmiyor.

**Sürüm uyumu.** Sunucu koşuyu yalnız kendi simülasyon sürümüyle
yargılayabiliyor. Pages'teki oyun her `main` birleşmesinde kendiliğinden
güncelleniyor, Worker elle. Oyunun simülasyonunu değiştiren bir birleşmeden
sonra (çekirdek ya da içerik; "Lite lig sunucusu" iş akışı bu dosyalarda
koşuyor) 3. adımı tekrarla. O zamana kadar yeni koşular "sunucu bu sürümü
henüz tanımıyor" diye bekliyor, dağıtılınca kendiliğinden gidiyor.

B kuruluysa 2. ve 3. adımı **Run workflow** ile CI yapıyor; `main`'e
birleşmek kendiliğinden dağıtmıyor (B'nin 4. adımındaki değişken açılmadıkça).

