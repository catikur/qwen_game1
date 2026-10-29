# Masaüstü sürümü

> Tur 66'da yazıldı. Kod `apps/desktop` (Tauri 2 kabuğu) ve
> `apps/web/src/desktop/` (sayfa tarafı). Steam (başarımlar, depolar,
> mağaza sayfası, yükleme) Tur 70'te: `docs/STEAM.md`. Uygulama gibi
> davranması, pencere ve Steam Deck Tur 71'de.

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
- **Web sayfası gibi davranmıyor (Tur 71, `native.ts`).** Tarayıcının
  kısayolları yutuluyor: F5, Ctrl+R (yeniden yükle; WebView2'de son otomatik
  kayıttan sonrası giderdi), Ctrl+P, Ctrl+F, Ctrl+U, Ctrl+S, Ctrl+J, Ctrl+H,
  Ctrl+N, yakınlaştırma, Alt+← ve →, F3, F7. macOS'ta Cmd'li karşılıkları;
  uygulama menüsünün kısayolları (Cmd+H, Cmd+M, Cmd+W, Cmd+Q) yerinde.
  Ctrl+Alt (Windows'ta AltGr: "}", "@", "ś") hiç yutulmuyor; yazı alanında
  Alt + ok da (macOS'ta sözcük sözcük gezinme). Sağ
  tık menüsü yalnız yazı alanında ve seçili kodda; oyunun metni seçilmiyor
  (yazı alanı ve kod seçiliyor), sürükle-bırak yok, kaydırma çubukları ince.
- **Tam ekran ve pencere (Tur 71).** F11 ya da Alt+Enter (kabuğun
  `fullscreen_toggle` komutu). İlk açılışta pencere büyütülmüş; sonra
  kapandığı boyda, yerde, büyütülmüş ya da tam ekran açılıyor (kabuğun
  `src/window.rs` modülü). Boy ve yer yalnız pencere kipindeyken
  hatırlanıyor: tam ekranda kapanan oyun tam ekran açılıyor, çıkınca pencere
  eski boyunda. En küçük pencere 960 × 600.
- **Steam Deck (Tur 71).** Steam, Deck'te başlattığı sürece `SteamDeck=1`
  veriyor; kabuk bunu `shell_info` ile söylüyor ve metin ilk açılışta "çok
  büyük" oluyor (Valve'ın okunabilirlik ölçüsü 1280 × 800'de en küçük yazı 12
  piksel; çok büyükte arayüzün en küçük yazısı 13). Oyuncunun seçimi önde:
  Ayarlar'dan seçilen boy işaretleniyor (`textSizeChosen`), başka bir ayarı
  değiştirmek seçim sayılmıyor; Steam Cloud'la PC'den gelen kayıt da Deck'te
  büyük açılıyor. Başlatma seçeneğinde `SteamDeck=0` ile kapanıyor. Kumanda
  Tur 72'de.

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
  `capitalforge.packs.v1`), senaryo editörünün taslağı (Tur 68,
  `capitalforge.pack-draft.v1`).

Her yazma önce yanına bir geçici dosyaya, sonra yerine taşınarak: yazma
sırasında kapanan oyun eski kaydı bozmuyor. Bozuk ya da yarım bir istek
sağlam kaydın üstüne yazılmıyor.

Açılışta ayar dosyaları web motorunun yerel deposuna yükleniyor, dosya
kazanıyor (başka makineden gelen yeni değer). Sonra her yazma sırayla
dosyaya da gidiyor. Dosyası olmayıp yerel depoda olan anahtar (ilk açılış)
dosyaya yazılıyor.

Testler ve taşınabilir kurulum için: `CAPITALFORGE_DATA_DIR` (kök),
`CAPITALFORGE_EXPORT_DIR` (dışa aktarma).

Pencerenin boyu, yeri, büyütülmüşlüğü ve tam ekranı (Tur 71) uygulamanın
ayar dizininde, `window.json` (Linux `~/.config/com.conforcus.capitalforge/`,
Windows `%APPDATA%\com.conforcus.capitalforge\`, macOS
`~/Library/Application Support/com.conforcus.capitalforge/`). Makineye ait:
Steam Cloud'a girmiyor.

## Steam'e hazırlık

Kullanıcının kararı (Tur 66'dan önce): web, masaüstü ve Steam; oyun
tamamen ücretsiz.

**Kullanıcının hesabında yapılacaklar** (adım adım sırası `docs/STEAM.md`
→ "Senin yapacakların"):

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

- Windows: `capitalforge.exe` (`tauri build --features steam --no-bundle`).
  WebView2 Windows 11'de ve güncel Windows 10'da kurulu; olmayan makine
  için Tur 70'te seçilen yol Steam'in kurulum betiği: depoda Microsoft'un
  önyükleyicisi, Steam onu ilk açılıştan önce bir kez çalıştırıyor
  (`docs/STEAM.md` → "Depolar"). Sabit sürümlü WebView2 (~180 MB) gerekmedi.
- macOS: `CapitalForge.app`, evrensel (Apple Silicon ve Intel); imza
  isteğe bağlı ama önerilir.
- Linux: Steam'in Linux çalışma ortamında (Steam Runtime) WebKitGTK yok;
  depo sistemin WebKitGTK 4.1'ini kullanıyor. Steam Deck'te denenmedi
  (`docs/STEAM.md` → "Linux ve Steam Deck").

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

**Tur 70'te yapıldı** (`docs/STEAM.md`): başarımlar (`steam` özelliği,
`steamworks` paketi), tek pencere (`tauri-plugin-single-instance`), Steam
depoları CI'da, mağaza sayfasının metinleri ve görselleri. Kalan: Linux
deposunun Steam Deck'te denenmesi; o bir Deck istiyor.

## Testler

- `cargo test` ve `cargo test --features steam` (`apps/desktop/src-tauri`):
  Steam başarım kuyruğu (`docs/STEAM.md`); dosya deposu: kayıt yazma,
  okuma, listede yalnız künyeler, bozuk isteğin sağlam kaydı ezmemesi,
  ayar anahtarının dizinden çıkamaması, dışa aktarmanın üstüne yazmaması.
- `pnpm test` → `apps/web/test/desktop.test.ts`: ayar aynası (dosya kazanır,
  sıra, oturum deposu hariç, düşen yazma), slotların dosya deposuyla
  kaydet-listele-yükle, oyunun her yerel depo anahtarının dosyaya
  gidebilmesi, sürümlerin eşliği.
- `tools/desktop-e2e.mjs`: derlenmiş oyun gerçek penceresinde (Linux,
  WebKitGTK, tauri-driver ve WebDriver): slota kayıt dosyada, dışa aktarma
  ve şehir kartı İndirilenler'de, ayar dosyada, kapanırken kayıt, yeniden
  açılınca kaldığı gün ve dil; Steam komutları ve tek pencere (Tur 70);
  tarayıcı kısayolları, sağ tık ve seçim, F11, pencerenin durumu, ayrı bir
  sürücüyle Steam Deck'in metni (Tur 71). CI: `.github/workflows/desktop.yml`.
- `pnpm playtest` → "Pencere boyları ve Steam Deck" (Tur 71): 960 × 600,
  1093 × 614, 1280 × 800 ve 1920 × 1080'de paneller üst üste binmiyor, şehir
  ortada tıklanabilir; Deck'in boyunda her panelde en küçük yazı ≥ 12 piksel.

```sh
cargo install tauri-driver --version 2.0.6 --locked   # bir kez
xvfb-run -a dbus-run-session -- node tools/desktop-e2e.mjs   # Linux; ekran varsa xvfb-run gerekmez
```
