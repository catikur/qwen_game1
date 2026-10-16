# CapitalForge Lite — Android

Web sürümü (`apps/lite-web`) Capacitor kabuğunda: arayüz ve oyun aynı kod,
lig sunucusu aynı (iPhone, iPad, tarayıcı ve Android bir arada). Yerel
parçalar: titreşim, yerel bildirimler (kasa doldu, meclis, rakip), geri tuşu,
uygulama simgesi ve açılış ekranı. Tasarım: `docs/LITE-TASARIMI.md` §15.

## Telefona kurmak (deneme)

1. GitHub → **Actions → Lite Android** → son koşu → **lite-android-packages**
   çıktısını indir, içindeki `app-debug.apk`'yı telefona at.
2. Telefonda dosyaya dokun; "bilinmeyen kaynaklar" sorulursa izin ver.

Ya da Android Studio ile:

```sh
pnpm install
pnpm --filter @capital/lite-android sync   # web paketi + Android'e kopya
pnpm --filter @capital/lite-android open   # Android Studio'da aç, ▶︎
```

## Play Store'a yükleme

**Bir kez:**

1. [Google Play Console](https://play.google.com/console) geliştirici hesabı
   (tek sefer 25 $). Şirket hesabı için D-U-N-S numarası isteniyor.
2. **Yükleme anahtarı** (upload key) üret ve sakla:

   ```sh
   keytool -genkeypair -v -keystore capitalforge-upload.jks -alias upload \
     -keyalg RSA -keysize 2048 -validity 10000
   ```

   Dosyayı ve şifreleri güvenli bir yerde tut; kaybolursa Play Console'dan
   anahtar sıfırlama isteniyor.
3. GitHub deposuna dört sır ekle (**Settings → Secrets and variables → Actions**):
   - `ANDROID_KEYSTORE_BASE64`: `base64 -i capitalforge-upload.jks` çıktısı;
   - `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`upload`), `ANDROID_KEY_PASSWORD`.

   Sırlar yoksa CI imzasız AAB üretiyor; Android Studio'da
   **Build → Generate Signed Bundle** ile de imzalanabiliyor.
4. Play Console → **Create app**: ad *CapitalForge Lite*, varsayılan dil
   Türkçe, oyun, ücretsiz. **Play App Signing** açık (varsayılan).

**Her yüklemede:**

1. `android/app/build.gradle`'da `versionCode`'u bir artır (`versionName`
   iOS ile aynı: `ios-lite/App/project.yml`).
2. CI'nin **lite-android-packages** çıktısındaki `app-release.aab`'yi Play
   Console → **Testing → Internal testing → Create release**'e yükle.

## Mağaza bilgileri

Metinler iOS ile ortak: `ios-lite/store/README.md` (ad, kısa açıklama için
alt başlık, tam açıklama, anahtar kelimeler). Play'e özgü:

| Alan | Değer |
|---|---|
| Uygulama simgesi | `store/icon-512.png` (512 × 512) |
| Öne çıkan görsel | `store/feature-graphic.png` (1024 × 500) |
| Ekran görüntüleri | `android-<n>.png` (1080 × 1920, başlıklı): CI "Lite web · uçtan uca ve kareler" çıktısındaki `play-*` kareleri, `node ios-lite/App/tools/store-shots.mjs <kareler> <çıktı>`; tablet için `tablet-mid.png` (1024 × 1366) |
| Kategori | Oyun → Simülasyon |
| Gizlilik politikası | https://catikur.github.io/qwen_game1/lite/privacy.html |
| İletişim | info@conforcus.com |
| Reklam | Yok |

**Veri güvenliği (Data safety)** soruları:

- Veri toplanıyor mu? **Evet.** Paylaşılıyor mu? **Hayır.**
- **Uygulama etkinliği → Uygulama etkileşimleri** (oyun hamleleri, oyun
  kaydı, haftalık puan): uygulama işlevi ve sahtekârlığı önleme; **zorunlu**
  (kayıt sunucuda tutuluyor ve sunucu oyunu oynatıp doğruluyor).
- **Uygulama etkinliği → Diğer kullanıcı içeriği** (seçilen şirket ve özel
  lig adları): uygulama işlevi; **isteğe bağlı** (yalnızca ligde görünmek
  için).
- **Kişisel bilgiler → Kullanıcı kimlikleri** (rastgele hesap kimliği):
  uygulama işlevi; zorunlu.
- Konum, cihaz kimliği, reklam kimliği, IP: **toplanmıyor.**
- Aktarımda şifreli: **Evet** (HTTPS). Silme isteği: **Evet**, uygulamada
  Lig → Hesabı sil (sunucudaki kayıt dahil her şey hemen siliniyor).

**İçerik derecelendirmesi (IARC):** şiddet, korku, kumar, cinsellik yok;
kullanıcılar arası etkileşim yalnızca şirket ve lig adları (küfür
süzgecinden geçiyor), sohbet yok. Beklenen: PEGI 3 / Herkes.

**Hedef kitle:** 13 yaş ve üstü (çocuklara yönelik değil).

## Simgeler

`node apps/lite-android/tools/make-icons.mjs`: uyarlanabilir simge (ışınlar
arka planda, sikke ön planda, Android 13 tek renkli), yuvarlak simge,
bildirim simgesi, açılış ekranı ve mağaza görselleri; iOS simgesinin
SVG'sinden (`ios-lite/App/tools/icon.svg`).
