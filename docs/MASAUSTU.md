# Masaüstü sürümü

> Tur 66'da yazıldı. Kod `apps/desktop` (Tauri 2 kabuğu) ve
> `apps/web/src/desktop/` (sayfa tarafı). Steam'e yükleme Tur 70'in işi;
> bu belge oraya kadar gerekenleri tutuyor.

## Ne

Oyunun kendisi web paketiyle aynı (`apps/web`); masaüstü sürümü onu bir
pencerede açan küçük bir kabuk. Tauri, işletim sisteminin kendi web
motorunu kullanıyor: Windows'ta WebView2 (Edge), macOS'te WebKit, Linux'ta
WebKitGTK. Kabuk Rust'ta (`apps/desktop/src-tauri/src`), ikili ~6,4 MB
(Linux, sürüm derlemesi).

Web sürümünden farkı:

- **Kayıtlar dosyada.** Her slot bir dosya, ayarlar da öyle; oyuncu
  görebiliyor, yedekleyebiliyor, Steam Cloud eşitleyebiliyor (aşağıda).
- **Dışa aktarma İndirilenler klasörüne.** Kayıt JSON'u ve şehir kartı
  doğrudan yazılıyor (aynı ad varsa "ad (2).json"), oyun "İndirilenler
  klasörüne kaydedildi" diyor.
- **Kapatınca kaydediyor.** Pencere kapanırken oyun otomatik kayıt slotuna
  yazıyor, sonra kapanıyor. Sayfa cevap vermezse kabuk 5 sn sonra kendisi
  kapanıyor; ikinci tıklama beklemeden kapatıyor.
- **Hizmet çalışanı ve manifest yok.** Dosyalar zaten diskte; güncellemeyi
  kurulum (ya da Steam) getiriyor.
- **Lig aynı sunucuda.** Worker masaüstünün kökenlerini kabul ediyor
  (`tauri://localhost`, Windows'ta `http(s)://tauri.localhost`); bu değişiklik
  Worker dağıtılınca canlıya çıkıyor. O zamana kadar lig masaüstünde
  "sunucuya ulaşılamıyor" gibi davranıyor, koşular bekliyor.

## Derleme ve çalıştırma

Gerekenler: Node 22 ve pnpm, Rust (1.80+). İşletim sistemine göre:

| | Gereken |
|---|---|
| Windows 10/11 | WebView2 (Windows 11'de ve güncel Windows 10'da kurulu), Visual Studio C++ derleme araçları |
| macOS | Xcode komut satırı araçları |
| Linux | `libwebkit2gtk-4.1-dev librsvg2-dev libayatana-appindicator3-dev` (Debian/Ubuntu) |

```sh
pnpm install
pnpm --filter @capital/desktop dev                         # geliştirme: vite --mode desktop + pencere
pnpm --filter @capital/desktop exec tauri build --no-bundle # yalnız ikili: src-tauri/target/release/capitalforge
pnpm --filter @capital/desktop build                        # kurulum paketleri: src-tauri/target/release/bundle/
pnpm --filter @capital/desktop icons                        # simgeler (kaynak: tools/make-app-icons.mjs --desktop)
```

Web paketi masaüstü kipinde derleniyor (`pnpm --filter @capital/web
build:desktop`, `apps/web/dist-desktop/`); Tauri bunu kendisi çağırıyor.
Lig sunucusu web'deki gibi `VITE_LEAGUE_URL` ile veriliyor; verilmezse lig
yerel.

Üç işletim sisteminin kurulum paketleri CI'da: Actions → **Masaüstü** →
Run workflow (`.github/workflows/desktop.yml`, imzasız).

## Veri nerede

Kök, uygulamanın veri dizini (`com.conforcus.capitalforge`):

| | Kök |
|---|---|
| Windows | `%APPDATA%\com.conforcus.capitalforge\` |
| macOS | `~/Library/Application Support/com.conforcus.capitalforge/` |
| Linux | `~/.local/share/com.conforcus.capitalforge/` |

- `saves/slot-0.json` … `slot-5.json`: kayıt slotları (0 otomatik kayıt).
  Biçim oyunun kendi kaydı (`{ meta, state }`); şema göçleri web'deki gibi.
- `profile/<anahtar>`: arayüzün küçük kayıtları, anahtar başına bir dosya:
  ayarlar (`capitalforge.settings.v1`), kariyer, senaryo yıldızları,
  rehber, dil, görünüm, lig hesabı, yüklü senaryo paketleri (Tur 67,
  `capitalforge.packs.v1`).

Her yazma önce yanına bir geçici dosyaya, sonra yerine taşınarak: yazma
sırasında kapanan oyun eski kaydı bozmuyor. Bozuk ya da yarım bir istek
sağlam kaydın üstüne yazılmıyor.

Açılışta ayar dosyaları web motorunun yerel deposuna yükleniyor, dosya
kazanıyor (başka makineden gelen yeni değer). Sonra her yazma sırayla
dosyaya da gidiyor. Dosyası olmayıp yerel depoda olan anahtar (ilk açılış)
dosyaya yazılıyor.

Testler ve taşınabilir kurulum için: `CAPITALFORGE_DATA_DIR` (kök),
`CAPITALFORGE_EXPORT_DIR` (dışa aktarma).

## Steam'e hazırlık

Kullanıcının kararı (Tur 66'dan önce): web, masaüstü ve Steam; oyun
tamamen ücretsiz.

**Kullanıcının hesabında yapılacaklar** (Tur 70'ten önce):

- **Steamworks** (partner.steamgames.com): Conforcus adına iş ortağı hesabı;
  şirket bilgileri, vergi formu (ABD dışı şirket: W-8BEN-E), banka ve kimlik
  doğrulaması. Steam Direct ücreti oyun başına 100 $ (ücretsiz oyunda da).
  Uygulama kimliği (App ID) buradan; mağaza sayfasının onaya gönderilmesi ve
  yayın tarihi de.
- **Steam'e yükleme** (SteamPipe) iki yoldan biriyle: paketi CI hazırlar,
  kullanıcı SteamPipe ile yükler; ya da yalnız yükleme izni olan ayrı bir
  Steam hesabı açılır, bilgileri depoya sır olarak girer, yüklemeyi CI yapar.
- **macOS: Apple Developer Program** (yıllık 99 $; şirket adına D-U-N-S
  numarası gerekiyor): imza ve noter onayı olmadan Gatekeeper oyunu
  açtırmıyor. "Developer ID Application" sertifikası `.p12` olarak, noter
  onayı için uygulamaya özel parola (appleid.apple.com) ve Team ID. Depoya
  sır olarak (Tauri bunları doğrudan okuyor): `APPLE_CERTIFICATE` (`.p12`'nin
  base64'ü), `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`
  (`Developer ID Application: … (TEAMID)`), `APPLE_ID`, `APPLE_PASSWORD`,
  `APPLE_TEAM_ID`. Sırlar gelince paket iş akışı imzalayıp onaylatıyor.
- Windows imzası isteğe bağlı (SmartScreen uyarısı Steam'den kurulan
  oyunda çıkmıyor).

**Depolar.** Steam kurulum paketi istemiyor, klasör istiyor:

- Windows: `capitalforge.exe` (`tauri build --no-bundle`). WebView2 Windows
  11'de ve güncel Windows 10'da kurulu; olmayan makine için iki yol var:
  Steamworks'ün kurulum betiğinde Microsoft'un WebView2 kurucusu, ya da
  sabit sürümlü WebView2'yi depoya koymak (`webviewInstallMode:
  fixedRuntime`, ~180 MB). Tur 70'te seçilecek.
- macOS: `CapitalForge.app` (imzalı ve noter onaylı).
- Linux: Steam'in Linux çalışma ortamında (Steam Runtime) WebKitGTK yok.
  AppImage (WebKitGTK'yi içinde taşıyor) ya da sistem kütüphaneleri; Steam
  Deck'te denenecek.

**Steam Cloud.** Kayıtlar ve ayarlar zaten dosyada, kökleri sabit;
Steamworks → Steam Cloud → Auto-Cloud:

| Kök | Alt dizin | Desen | İşletim sistemi |
|---|---|---|---|
| `WinAppDataRoaming` | `com.conforcus.capitalforge/saves` | `*.json` | Windows |
| `WinAppDataRoaming` | `com.conforcus.capitalforge/profile` | `capitalforge.*` | Windows |
| `MacAppSupport` | aynı | aynı | macOS |
| `LinuxXdgDataHome` | aynı | aynı | Linux |

Geçici dosyalar noktayla başlıyor (`.slot-0.json.tmp`): desene girmiyor,
yarım yazma eşitlenmiyor. Açılışta
dosya yerel depoyu ezdiği için başka makineden gelen ayar kazanıyor.

**Tur 70'e kalanlar:**

- Steamworks SDK ve başarımlar: kariyerin 29 rozeti Steam başarımlarına
  (Rust tarafında `steamworks` paketi; SDK'nın kütüphaneleri depoda).
- Mağaza sayfası: kapsül görselleri, ekran görüntüleri, tanıtım metni
  (Tur 50'nin tanıtım paketi, `tools/tanitim`).
- Tek örnek: iki pencere aynı kayda yazmasın (Steam oyunu bir kez açıyor;
  elle açılan ikinci kopya için `tauri-plugin-single-instance`).
- Linux deposunun Steam Deck'te denenmesi.

## Testler

- `cargo test` (`apps/desktop/src-tauri`): dosya deposu: kayıt yazma,
  okuma, listede yalnız künyeler, bozuk isteğin sağlam kaydı ezmemesi,
  ayar anahtarının dizinden çıkamaması, dışa aktarmanın üstüne yazmaması.
- `pnpm test` → `apps/web/test/desktop.test.ts`: ayar aynası (dosya kazanır,
  sıra, oturum deposu hariç, düşen yazma), slotların dosya deposuyla
  kaydet-listele-yükle, oyunun her yerel depo anahtarının dosyaya
  gidebilmesi, sürümlerin eşliği.
- `tools/desktop-e2e.mjs`: derlenmiş oyun gerçek penceresinde (Linux,
  WebKitGTK, tauri-driver ve WebDriver): slota kayıt dosyada, dışa aktarma
  ve şehir kartı İndirilenler'de, ayar dosyada, kapanırken kayıt, yeniden
  açılınca kaldığı gün ve dil. CI: `.github/workflows/desktop.yml`.

```sh
cargo install tauri-driver --version 2.0.6 --locked   # bir kez
xvfb-run -a node tools/desktop-e2e.mjs                 # Linux; ekran varsa xvfb-run gerekmez
```
