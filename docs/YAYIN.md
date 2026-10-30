# Yayın listesi

CapitalForge üç yerde yayımlanıyor, üçü de ücretsiz:

- **Tarayıcı**: GitHub Pages. `main`'e her birleşmede kendiliğinden.
- **Masaüstü**: Windows, macOS, Linux. Kurulum paketleri GitHub
  Actions'tan, Steam depoları SteamPipe'la.
- **Lig sunucusu**: Cloudflare Workers ve D1. Tohum Ligi'nin tabloları,
  davetli ligler, sunucuda doğrulama.

Bu sayfa bir sürümü yayına çıkarmanın sırası. Ayrıntılar başka
belgelerde, bağlantıları adımlarda: masaüstü `docs/MASAUSTU.md`, Steam
`docs/STEAM.md`. İlk tam sürüm 1.0.0 (Tur 74), ilk yaması 1.0.1 (Tur 75),
ilk küçük sürümü 1.1.0 (Tur 76: şehrin türü, kayıt şeması v7).

## 1. Sürüm numarası

Sürüm tek bir sayı, `büyük.küçük.yama`:

- **Yama**: düzeltme, yeni içerik yok.
- **Küçük**: yeni içerik ya da özellik. Eski kayıtlar açılıyor.
- **Büyük**: oyunun kuralları ya da kayıtların biçimi oyuncunun fark
  edeceği kadar değişti.

Kayıt şemasının ayrı bir sürümü var (`SCHEMA_VERSION`, eski kayıtları
`packages/persistence` taşıyor). Lig sunucusu da sürüme değil simülasyonun
parmak izine bakıyor (`packages/core/src/league.ts`). Yani sürüm numarasını
yükseltmek ne kayıtları ne ligi bozuyor.

Şema yükselince (1.1.0'da v7) yeni sürüm eski kayıtları taşıyarak açıyor.
Eski sürüm yeni kaydı açmıyor ama ezmiyor da (Tur 75): oyuncu Steam'in
beta dalından geri dönse de kaydı kalıyor. Simülasyonun parmak izi
değişmediyse (1.1.0'da değişmedi) lig sunucusunu dağıtmak gerekmiyor.

Adımlar:

1. `node tools/set-version.mjs 1.0.1`. Sürüm yedi dosyada duruyor:
   - depo kökü, `apps/web` ve `apps/desktop` paketleri;
   - çekirdeğin `GAME_VERSION`'ı (kaydın künyesine yazılıyor);
   - Tauri'nin yapılandırması (işletim sisteminin gördüğü sürüm);
   - Rust paketi ve onun kilit dosyası.

   Araç yedisini birlikte değiştiriyor. Oyundaki sürüm
   `apps/web/package.json`'dan derlemeye giriyor (`__CF_VERSION__`).
2. Değişiklik günlüğüne girdi: `packages/ui/src/changelog.ts` başına.
   - Sürüm, yayın günü (YYYY-AA-GG) ve maddeler.
   - Maddeler üç dilde (Türkçe, İngilizce, Almanca), aynı sırada ve aynı
     sayıda.
   - Oyuncunun gözünden yaz: ne değişti, nerede bulunur.

   Oyun Ayarlar → Sürüm → "Yenilikler"de bunu gösteriyor. Eski sürümden
   gelen oyuncuya Ayarlar düğmesinde nokta ve Ayarlar'ın başında duyuru
   çıkıyor; "Yenilikler" açılınca kalkıyor.
3. `pnpm test`. `apps/web/test/version.test.ts` iki şeyi sınıyor:
   yedi dosyanın aynı sürümde olduğunu ve günlüğün en yeni girdisinin bu
   sürüm olduğunu. Diller arasında madde sayısının tuttuğunu da.

## 2. Denetimler

Hepsi yerelde ve CI'da koşuyor. Yayından önce `main`'in son koşusu yeşil
olmalı.

| Ne | Komut |
|---|---|
| Tip denetimi | `pnpm -s typecheck` |
| Birim testleri | `pnpm test` |
| Almanca sözlük | `node tools/i18n-check.mjs de` (0 hata) |
| Paket bütçesi | `pnpm bundle:check` (derleyip bütçeyi sınıyor) |
| Denge | `pnpm balance` (bantlar `docs/DURUM.md` → "Kalibrasyon bantları") |
| Tarayıcıda oynanış | `pnpm playtest` (derleyip bütün bölümler) |
| Masaüstü kabuğu | `apps/desktop/src-tauri`'da `cargo test --locked`, `cargo test --locked --features steam`, iki derlemede `cargo clippy --all-targets` |
| Gerçek pencerede | `node tools/desktop-e2e.mjs` (Linux, WebKitGTK) |

Tarayıcı testinin bütünü `main`'de koşuyor (120 dakika sınırı); PR'larda
kısa hâli (`pnpm playtest:smoke`). Denge sınavı `pnpm balance`: bantların
dışına çıkan koşu CI'ı kırmızıya çeviriyor. `pnpm bench` yalnız ölçüyor,
sınamıyor.

## 3. Tarayıcı (GitHub Pages)

- `main`'e birleşince `.github/workflows/pages.yml` yayımlıyor. Elle de
  çalıştırılabiliyor: Actions → Pages → Run workflow.
- Kurulu oyuncu yeni sürümü "Oyunun yeni sürümü hazır" bildirimiyle
  alıyor (hizmet çalışanı, Tur 48). Yenileyince oyun kaydediliyor ve yeni
  sürümle açılıyor.

## 4. Lig sunucusu (Cloudflare)

- `.github/workflows/lite-league.yml` dağıtıyor. İki sır gerekiyor,
  Settings → Secrets and variables → Actions → **Repository secrets**'e
  (Variables'a ya da bir Environment'a girilen sırrı iş görmüyor):
  - `CLOUDFLARE_API_TOKEN`: Workers ve D1'e yazma izni olan bir anahtar.
  - `CLOUDFLARE_ACCOUNT_ID`.
- `main`'e birleşmek kendiliğinden dağıtmıyor. Dağıtım elle: Actions →
  Lite lig sunucusu → Run workflow. Her birleşmede dağıtsın istenirse depo
  değişkeni `LITE_LEAGUE_AUTODEPLOY=true` (Variables'a). Sırlar yokken ya da
  kapı kapalıyken dağıtım adımı atlanıyor, testler yine koşuyor.
- Dağıtım D1 veritabanını yoksa açıyor, şemayı her seferinde uyguluyor
  (`IF NOT EXISTS`: var olan tablolara dokunmuyor), sonra Worker'ı
  yüklüyor.
- Sunucunun simülasyon izi `GET /v1/seed/sim`'de (Tur 71). Oyununkiyle
  aynı olmalı; değilse sunucu eski kodla koşuyor ve yeni sürümün
  koşularını reddediyor. İş akışı dağıtımdan sonra izi depodakiyle
  karşılaştırıyor (`packages/lite-league/scripts/simCheck.ts`): `main`'de
  fark iş akışını kırmızıya çeviriyor. Sunucu dağıtılmadıkça bu kırmızı
  kalıyor; düzeltmesi dağıtmak.
- Sunucu tarayıcı isteklerini yalnız oyunun kökenlerinden kabul ediyor:
  Pages adresi ve masaüstü penceresinin kökeni
  (`packages/lite-league/src/http.ts`). Oyun başka bir adrese taşınırsa
  o liste de güncellenmeli.

## 5. Masaüstü

- **Paketler**: Actions → Masaüstü → Run workflow
  (`.github/workflows/desktop.yml`). Üç işletim sistemi için ayrı ayrı:
  - kurulum paketleri: Windows MSI ve NSIS, macOS `.app` ve DMG, Linux
    deb, rpm ve AppImage;
  - Steam depoları: `steam-depot-Windows`, `steam-depot-macOS`,
    `steam-depot-Linux`.

  macOS'un Steam deposu evrensel (Apple Silicon ve Intel). Kurulum paketi
  koşucunun mimarisinde (Apple Silicon).
- **İmza**:
  - *macOS*: Apple Developer Program (yıllık 99 $; şirket adına D-U-N-S
    numarası). İmzasız uygulamayı Gatekeeper, internetten inince
    açtırmıyor; Steam'den inende çoğu zaman açılıyor ama önerilmiyor.
    Depoya altı sır:

    | Sır | Ne |
    |---|---|
    | `APPLE_CERTIFICATE` | "Developer ID Application" sertifikasının `.p12` dosyası, base64 |
    | `APPLE_CERTIFICATE_PASSWORD` | `.p12`'nin parolası |
    | `APPLE_SIGNING_IDENTITY` | `Developer ID Application: Conforcus (TEAMID)` |
    | `APPLE_ID` | geliştirici hesabının e-postası |
    | `APPLE_PASSWORD` | uygulamaya özel parola (appleid.apple.com) |
    | `APPLE_TEAM_ID` | 10 karakterlik takım kimliği |

    Sırlar girince paket iş akışı macOS'ta imzalıyor ve noter onayına
    gönderiyor (`tools/apple-signing.sh` bunları Tauri'ye aktarıyor).
    Sırlar takım takım gidiyor: ilk üçü imza için, son üçü noter onayı
    için (yalnız imza tamsa). Eksik bir takım hiç aktarılmıyor; yarım
    takım paketi düşürürdü. Sırlar yokken ya da eksikken paket imzasız
    (ya da imzalı ama onaysız) çıkıyor; iş akışının günlüğü eksiklerin
    adını yazıyor. Sırlar iş akışında yalnız macOS'un iki paket adımına
    veriliyor; bağımlılıkların kurulum betikleri onları görmüyor.
  - *Windows*: isteğe bağlı. Steam'den kurulan oyunda SmartScreen
    uyarısı çıkmıyor. Kurulum paketi Steam dışında da dağıtılacaksa
    kod imzalama sertifikası gerekiyor: OV ya da EV sertifika, ya da Azure
    Trusted Signing. O zaman Tauri'nin `bundle.windows` imza ayarı eklenecek;
    bugün yok.
  - *Linux*: imza yok.
- **Steam'e yükleme**: `docs/STEAM.md` → "Senin yapacakların", adım 10–11.
  Derlemeyi önce bir test dalına (`beta`) al, Steam'den kurup dene,
  sonra `default`'a.
- **Kayıt biçimi değişen sürüm betadayken**: betayı deneyen oyuncunun
  otomatik kaydı yeni biçime geçiyor ve Steam Cloud onu öteki
  bilgisayarlarına da taşıyor. Eski sürüm o kaydı açamıyor (Tur 75):
  açılışta kurulum ekranında söylüyor, üstüne yazmıyor; oyuncu yeni
  oyununu başka bir slota kaydedebiliyor. Kayıt biçimini (`SCHEMA_VERSION`) değiştiren
  derlemeyi betada kısa tut, `default`'a geçince eski sürümdekiler de
  güncelleniyor.

## 6. Steam'de yayın

Steamworks'teki adımlar `docs/STEAM.md`'de, sırasıyla. Yayından önce
hepsi bitmiş olmalı: başarımlar, mağaza sayfası, depolar, Steam Input,
Workshop, Steam Cloud. Değişiklikler Steamworks'te "Publish" denmeden
oyuna yansımıyor.

- Steam hem mağaza sayfasını hem derlemeyi inceliyor; birkaç iş günü
  sürüyor.
- Mağaza sayfası en az iki hafta "Coming Soon" olarak açık kalmadan oyun
  yayımlanamıyor. Yayın tarihini buna göre seç.
- Workshop'un görünürlüğü yayından önce yalnız geliştiriciler ve test
  hesapları; yayında herkese açık.

## 7. Yayın günü

1. `main` yeşil, Pages güncel, lig sunucusunun izi tutuyor.
2. Masaüstü paketleri bu sürümün koşusundan; Steam derlemesi `default`
   dalında.
3. GitHub'da sürüm: etiket `v1.0.0`, notlar değişiklik günlüğünün
   maddeleri, kurulum paketleri ekte.
4. Steam'de "Release".

## 8. Hata raporları

Oyuncu hatayı oyunun içinden bildiriyor: Ayarlar → Sürüm → "Hata bildir".
Rapor tek bir JSON dosyası. Oyun onu hiçbir yere göndermiyor: oyuncu
dosyayı kaydedip **info@conforcus.com** adresine e-postayla yolluyor.

Raporda (`packages/ui/src/bugReport.ts`):

- `kind: "capitalforge-bug-report"`, `format: 1`, oluşturulma zamanı;
- sürüm ve türü (`web`, `desktop`, `steam`);
- dil, tarayıcı, ekran ve pencere ölçüsü, ekran kartının adı;
- ayarlar;
- oyuncunun notu;
- son 60 uyarı ve hata (konsol, yakalanmamış hatalar). Oyuncu çıkarabiliyor.
- Kayıt, en sonda: oyun açıksa o anki durum, değilse son otomatik kayıt.
  Oyuncu bunu da çıkarabiliyor.

Kaydı açmak için oyunda Kayıtlar → "JSON içe aktar" → rapor dosyası:
oyun raporun içindeki kaydı açıyor (Tur 75). Kaydı çıkarılmış rapor
açılmıyor, oyun nedenini söylüyor. Kaydın biçimi dışa aktarılan kayıtla
aynı; ayrı dosya olarak da alınabiliyor:
`jq '.save' rapor.json > kayit.json`.
