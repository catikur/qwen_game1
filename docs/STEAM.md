# Steam

> Tur 70'te yazıldı. Masaüstü sürümünün kendisi `docs/MASAUSTU.md`de; bu
> belge onun Steam'e çıkışı: oyunun içindeki Steam bağlantısı, Steamworks'e
> girilecek her şey ve yükleme.

## Oyunda ne var

- **Başarımlar.** Kariyerin 29 rozeti Steam başarımı. Rozet açılınca
  (`packages/ui/src/career.ts`) sayfa API adını kabuğa bildiriyor
  (`apps/web/src/desktop/steam.ts`), kabuk Steamworks'te açıyor
  (`apps/desktop/src-tauri/src/steam.rs`). Ad tablosu
  `packages/content/src/steam.ts` (`STEAM_ACHIEVEMENTS`): açık yazılı, rozet
  kimliğinden türetilmiyor; Steamworks'teki ad değişirse oyuncunun açtığı
  başarım kaybolur. Açılışta bütün açık rozetler bir kez gidiyor: web
  sürümünde ya da Steam kapalıyken kazanılan rozet de yetişiyor. Paket
  senaryoları (kendi senaryoların) kariyere ve başarıma sayılmıyor.
- **Bağlantı isteğe bağlı.** Steam bağlantısı `steam` özelliğiyle
  derleniyor (`cargo`/`tauri build --features steam`). Özellik kapalıysa,
  Steam istemcisi açık değilse ya da oyun Steam'den açılmadıysa oyun aynı;
  yalnız başarım gitmiyor (günlükte bir satır). Steamworks oyuncunun
  istatistiklerini açılıştan biraz sonra indiriyor; o zamana kadar açma
  istekleri kuyrukta bekliyor (`Queue`, birim testli). Steam'e yazma
  (`StoreStats`) başarısız olursa ~10 sn'de bir yeniden deneniyor.
- **Kumanda ve ekran klavyesi (Tur 72).** Oyun kumandayı kendisi okuyor
  (tarayıcının Gamepad API'si, standart düzen); Steam Input'un sanal
  kumandası da bir Xbox kumandası gibi geliyor. Düğme yazıları kumandaya
  göre: Xbox ve Steam Deck'te A B X Y, PlayStation'da ✕ ○ □ △; Steam
  Input'suz bağlanan Nintendo kumandasında konumuna göre B A Y X (eylemler
  bütün kumandalarda konuma göre: alttaki seçiyor, sağdaki geri). Kumandayla
  bir yazı alanı seçilince (şirket adı, davet kodu) Steam'in ekran klavyesi
  alanı örtmeden açılıyor (`ShowFloatingGamepadTextInput`; Steam Deck'te ve
  Büyük Resim kipinde). Steam yoksa oyuncu kendi klavyesiyle yazıyor.
  Düğmelerin işi `docs/MASAUSTU.md` → "Kumanda ve yalnız klavye".
- **Tek pencere.** İkinci kopya açılmıyor, açık pencere öne geliyor
  (`tauri-plugin-single-instance`); iki pencere aynı kayda yazamıyor.
- **Kayıtlar Steam Cloud'a hazır.** Dosyada, kökleri sabit; Auto-Cloud
  ayarı `docs/MASAUSTU.md` → "Steam Cloud".

## Senin yapacakların

Sırası önemli; ilk ikisi olmadan gerisi açılmıyor.

1. **Steamworks hesabı** (partner.steamgames.com): Conforcus adına iş
   ortağı hesabı; şirket bilgileri, vergi formu (ABD dışı şirket:
   W-8BEN-E), banka ve kimlik doğrulaması.
2. **Steam Direct ücreti**: oyun başına 100 $. Ücretsiz oyunda da
   ödeniyor ve geri dönmüyor (iade 1.000 $ satıştan sonra). Ödenince
   **uygulama kimliği** (App ID) geliyor. Bana kimliği söylemen yeter;
   kodda sır değil.
3. **Başarımlar** (Steamworks → Stats & Achievements → Achievements):
   `docs/steam/basarimlar.csv`teki 29 satırın her biri için "New
   Achievement":
   - API Name: `api_name` sütunu (`CF_…`), aynen.
   - Display Name ve Description: `name_english`/`desc_english`; dil
     seçicisinden Turkish ve German için `_turkish` ve `_german` sütunları.
   - Achieved icon: `docs/steam/basarim/<API>.jpg`; Unachieved icon:
     `docs/steam/basarim/<API>_kilitli.jpg` (256 × 256).
   - Hidden: hayır (rozetler oyunda da görünüyor).
   - Sonunda sayfanın üstündeki "Publish": Steamworks değişikliği
     yayımlanmadan oyuna görünmüyor.
4. **Mağaza sayfası** (Store Page Admin): metinler ve sistem
   gereksinimleri `docs/steam/MAGAZA.md`de, üç dilde, yapıştırmaya hazır.
   Görseller (Graphical Assets):

   | Steamworks'teki ad | Dosya | Ölçü |
   |---|---|---|
   | Header Capsule | `docs/steam/magaza/header.jpg` | 920 × 430 |
   | Small Capsule | `docs/steam/magaza/small.jpg` | 462 × 174 |
   | Main Capsule | `docs/steam/magaza/main.jpg` | 1232 × 706 |
   | Vertical Capsule | `docs/steam/magaza/vertical.jpg` | 748 × 896 |
   | Screenshots (en az 5) | `docs/tanitim/kareler/<dil>-masaustu-2…6.jpg` | 1920 × 1080 |
   | Library Capsule | `docs/steam/kutuphane/library.jpg` | 600 × 900 |
   | Library Header | `docs/steam/magaza/header.jpg` (aynısı) | 920 × 430 |
   | Library Hero | `docs/steam/kutuphane/hero.jpg` | 3840 × 1240 |
   | Library Logo | `docs/steam/kutuphane/logo.png` (saydam) | 1280 geniş |
   | Community / App Icon | `docs/steam/simge/app-184.jpg` | 184 × 184 |
   | Shortcut Icon | `docs/steam/simge/shortcut-256.png` | 256 × 256 |
   | Client Icon (Windows) | `apps/desktop/src-tauri/icons/icon.ico` | — |

   Ekran görüntüleri dil başına: İngilizcesi varsayılan, Türkçe ve Almanca
   sayfaya kendi dillerindeki kareler. `1-kurulum` menü ekranı; Steam
   oynanışı gösteren kare istiyor, onu sona koy ya da koyma.
5. **Yapay zekâ beyanı** (Content Survey): önerilen metin
   `docs/steam/MAGAZA.md` → "Yapay zekâ beyanı". Kod, metinler ve çeviriler
   yapay zekâ yardımıyla yazıldı; beyan etmek gerekiyor.
6. **Depolar ve başlatma** (Steamworks → Installation, SteamPipe):
   - Üç depo: Windows, macOS, Linux (Steamworks → SteamPipe → Depots;
     ilki hazır, uygulama kimliği + 1). Her depoya kendi işletim sistemi.
   - Launch Options: Windows `capitalforge.exe`, macOS
     `CapitalForge.app`, Linux `capitalforge` (her biri kendi işletim
     sistemiyle).
   - Windows: Installation → General → Install Script:
     `installscript_win.vdf` (WebView2, aşağıda).
   - Steam Cloud: `docs/MASAUSTU.md` → "Steam Cloud" tablosu.
7. **Steam Input** (Steamworks → Application → Steam Input):
   - Steam Input Default Configuration: "Gamepad" şablonu. Steam Deck için
     "Gamepad with Mouse Trackpad": sağ dokunmatik yüzey fare oluyor.
   - PlayStation kumandaları: "oyun kendisi destekliyor" (Steam Input
     kapalı). Steam Input açıkken Steam oyuna Xbox kumandası veriyor, oyun
     DualSense'i tanıyamıyor ve düğme yazıları A B X Y kalıyor.
   - Xbox ve öbür kumandalar: varsayılan.
8. **Yükleme hesabı**: SteamPipe'ı çalıştıracak bir Steam hesabı. Ya
   kendi hesabınla yüklersin (adım 9), ya da yalnız yükleme izni olan ayrı
   bir hesap açarsın, bilgileri depoya sır olarak girer, yüklemeyi CI'a
   eklerim.
9. **Yükleme**: GitHub → Actions → Masaüstü → Run workflow. Bitince üç
   paket: `steam-depot-Windows`, `steam-depot-macOS`, `steam-depot-Linux`.
   Steamworks SDK'sının `tools/ContentBuilder/` klasöründe:
   - `content/windows`, `content/macos`, `content/linux` klasörlerine
     paketlerin içi;
   - `scripts/app_build.vdf`: `docs/steam/steampipe/app_build.vdf`,
     `UYGULAMA` ve `DEPO_…` yerine Steamworks'teki sayılar;
   - `steamcmd +login <hesap> +run_app_build <app_build.vdf'nin tam yolu> +quit`.
   - Steamworks → SteamPipe → Builds: yüklenen derlemeyi `default` dalına
     al.
10. **İnceleme**: Steam hem mağaza sayfasını hem derlemeyi inceliyor (birkaç
   iş günü). Mağaza sayfası "Coming Soon" olarak en az iki hafta açık
   kalmadan oyun yayımlanamıyor; yayın tarihini buna göre seç.
11. **macOS imzası** (isteğe bağlı, önerilir): Apple Developer Program
    (yıllık 99 $). Sırlar ve ayrıntı `docs/MASAUSTU.md` → "Steam'e
    hazırlık". Steam'den inen dosyalarda karantina işareti olmadığı için
    Gatekeeper imzasız uygulamayı genellikle durdurmuyor; yine de imzasız
    sürümü bir Mac'te Steam'den kurup açarak dene.

## Depolar

Steam kurulum paketi istemiyor, klasör istiyor. CI'daki "Steam deposu"
adımı (`.github/workflows/desktop.yml`, elle çalıştırılan paket işinde)
oyunu `steam` özelliğiyle derleyip klasörü `tools/steam-depot.mjs` ile
hazırlıyor:

| Depo | İçerik |
|---|---|
| Windows | `capitalforge.exe`, `steam_api64.dll`, `installscript_win.vdf`, `_CommonRedist/WebView2/MicrosoftEdgeWebview2Setup.exe` |
| macOS | `CapitalForge.app` (evrensel: Apple Silicon ve Intel), içinde `Contents/MacOS/libsteam_api.dylib` |
| Linux | `capitalforge`, `libsteam_api.so` |

Steamworks'ün kütüphanesi (`steam_api64.dll` / `libsteam_api.so` /
`libsteam_api.dylib`) `steamworks` paketiyle geliyor (Steamworks SDK'sının
Valve'ın dağıtılmasına izin verdiği dosyaları; macOS'unki evrensel); oyun
onu kendi yanında arıyor (Linux'ta rpath `$ORIGIN`, macOS'ta
`@executable_path`, `apps/desktop/src-tauri/build.rs`).

**WebView2 (Windows).** Oyun Edge'in WebView2'siyle çalışıyor; Windows
11'de ve güncel Windows 10'da kurulu. Olmayan makine için depoda
Microsoft'un önyükleyicisi (~2 MB) ve Steam'in kurulum betiği
(`docs/steam/steampipe/installscript_win.vdf`): Steam oyunu ilk açmadan
önce önyükleyiciyi bir kez çalıştırıyor; WebView2 zaten varsa bir şey
yapmadan çıkıyor. Sabit sürümlü WebView2'yi depoya koymak (~180 MB) da bir
yol; gerek görmedim.

**Linux ve Steam Deck.** Linux deposu sistemin WebKitGTK 4.1'ini kullanıyor
(`libwebkit2gtk-4.1-0`; Ubuntu 22.04 ve sonrası). Steam'in Linux çalışma
ortamında (Steam Runtime) WebKitGTK yok, SteamOS'ta kurulu olup olmadığı
denenmedi. Bu yüzden ilk sürümde Linux'u "deneysel" say: Steam Deck'te
kurup aç; açılmazsa iki yol var: WebKitGTK'yi içinde taşıyan AppImage'i
depoya koymak (Tauri zaten üretiyor; `libsteam_api.so` içine girmeli) ya da
Deck'i Windows sürümüyle Proton'a bırakmak (WebView2 Proton'da sorunlu
olabilir). "Steam Deck Verified" için Valve'ın kendi testi var; ondan önce
Deck'te denemek gerekiyor.

Verified ölçüsünden bugün hazır olanlar (Tur 71): varsayılan çözünürlük
Deck'in ekranı (1280 × 800, oyun pencereye uyuyor, taşma yok); okunabilirlik
(Steam `SteamDeck=1` verince metin ilk açılışta "çok büyük", en küçük yazı
13 piksel; Valve'ın alt sınırı 9, önerisi 12); başlatıcı yok, oyun doğrudan
açılıyor. Tur 72'de girdi ölçüleri de: oyunun bütün işleri kumandayla
yapılıyor, ekranda kumandanın düğme ipuçları var (Deck'te A B X Y), yazı
alanında Steam'in ekran klavyesi açılıyor. Kalan: Deck'in kendisinde
denemek.

## Geliştirirken

Steam istemcisi açıkken, Steam'den açmadan denemek için:

```sh
cd apps/desktop/src-tauri
CAPITALFORGE_STEAM_APPID=<uygulama kimliği> cargo run --features steam
```

Kimlik verilmezse Steamworks çalışma dizinindeki `steam_appid.txt`'ye
bakıyor. Bağlanırsa günlükte bir şey yazmıyor; bağlanamazsa "Steam
başarımları kapalı: …" (sayfanın konsolu). Steamworks'te tanımlı olmayan
API adı ~60 sn denenip düşüyor ("Steam başarımı açılamadı (Steamworks'te
tanımlı mı?)"); Steamworks'e girilen adlar tabloyla aynı olmalı.

Başarımı sıfırlamak: Steam istemcisinin konsolunda (`steam://open/console`)
`reset_all_stats <uygulama kimliği>`.

## Malzemeyi yeniden üretmek

```sh
pnpm build
node tools/run-node-script.mjs tools/tanitim/sehir.ts /tmp/sehir
node tools/run-node-script.mjs tools/steam/basarimlar.ts docs/steam
node tools/steam/gorseller.mjs /tmp/sehir docs/steam
node tools/tanitim/kareler.mjs /tmp/sehir docs/tanitim/kareler
```

- `basarimlar.ts`: `basarimlar.csv` (API adı, grup, üç dilde ad ve
  açıklama; oyunun kendi sözlüklerinden). Çevrilmemiş ya da boş alan
  varsa duruyor.
- `gorseller.mjs`: başarım simgeleri (grubun rengi, rozetin çizimi,
  kilitli hali gri), mağaza ve kütüphane kapsülleri, logo, simgeler. Şehir
  tanıtım karelerinin şehri (516. gün, yaz başı, açık hava), arayüz gizli;
  logo uygulama simgesi (`tools/app-icon.mjs`) ve Fredoka. Rozet eklenince
  `GLYPHS`'e çizimi girmeli; yoksa araç duruyor.
- `kareler.mjs`: ekran görüntüleri, üç dilde (`docs/tanitim/README.md`).

Yeni rozet: `packages/content/src/achievements.ts`'e rozet,
`packages/content/src/steam.ts`'e yeni bir API adı (test eksik ad
bırakmıyor), `gorseller.mjs`'e çizim; Steamworks'e başarım. Var olan bir
API adını değiştirme.

## Testler

- `apps/web/test/desktop.test.ts` → "Steam başarımları (Tur 70)": tablo
  tam, adlar tekil ve Steamworks'ün biçiminde; açılışta ve her değişiklikte
  bildirim, bilinmeyen rozet atlanıyor; Steam yokken hiçbir şey gitmiyor;
  giden istek düşerse sonraki değişiklikte yeniden; kumanda yazı alanını
  seçince ekran klavyesi alanın yerinde, fiziksel pikselde isteniyor
  (Tur 72), Steam yokken istenmiyor; kabuğun üç komutu kayıtlı.
- `cargo test` ve `cargo test --features steam`: kuyruk istatistikler
  inene kadar bekliyor, açılan ad yeniden girmiyor, tanımsız ad sınırda
  düşüyor, yazılamayan başarım aralıkla yeniden yazılıyor; Steam'siz
  derlemede durum "kapalı", ekran klavyesi yok.
- `tools/desktop-e2e.mjs` → "Steam ve tek pencere": derlenmiş oyunda
  Steam komutları yanıt veriyor; ikinci kopya açılmıyor, ilk pencere
  yerinde.
