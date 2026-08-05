# CapitalForge

Tarayıcıda çalışan 3B kapitalizm simülasyonu. Three.js ile şehir, saf
TypeScript ile ekonomi.

**Tasarım sözü:** simülasyon derin, oynanış sakin. Altta arz-talep, fiyat
esnekliği, marka gücü, pazar payı ve arsa değeri dinamikleri işler; üstte
oyuncu bir ısı haritasına bakıp bir kareye tıklar. Hesabı oyun yapar, kararı
oyuncu verir.

## Çalıştırma

```bash
pnpm install
pnpm dev        # http://127.0.0.1:5173
```

Üretim derlemesi ve önizleme:

```bash
pnpm build
pnpm preview
```

## Nasıl oynanır

Oyun şirketini kurmakla başlar: bir isim ve altı CEO'dan biri. CEO seçimi
kozmetik değil — sermayeni, arsa pazarlığını, işletme giderini ve marka
büyüme hızını değiştirir.

Şehir zaten kurulu gelir. Kareler üç türdür: **sokak** ve **kamu alanı**
hiçbir fiyata satılmaz, **parsel** satılabilir. Parsellerin çoğunda mevcut
bir yapı vardır; boşları doğrudan alırsın, dolularını sahibinden primli
devralıp yıkarsın. Boş parsel kıt bir kaynaktır.

1. **Fırsat lensini aç.** Harita, karşılanmamış talebe göre boyanır; sıcak
   bölgeler para bırakır.
2. **Bir arsa seç ve satın al.** Merkeze yakın arsa pahalıdır ama daha çok
   müşteri görür ve zamanla değerlenir.
3. **Soldan bir yatırım seç.** Her kartta o bölge için tahmini günlük kâr ve
   geri ödeme süresi yazar. Rakip şirketler de aynı hesabı yapıyor.
4. **Kâr etmeyen şubeye bak.** Arsa panelinde ciro, satılan malın maliyeti,
   personel ve kâr kalem kalem görünür — neden kaybettiğin hep okunur.
5. **Fiyatı oyuna bırak ya da devral.** Varsayılan otomatik fiyat makul
   oynar; fiyat savaşı açmak istersen kontrolü sen alırsın.

Kontroller: sürükle = kaydır · sağ tık sürükle = döndür · tekerlek =
yakınlaş · WASD = kaydır · Boşluk = duraklat · Esc = seçimi bırak

## Mimari

Plandaki katman ayrımı korunuyor: **çekirdek Three.js bilmez, render katmanı
oyun kurallarını bilmez.**

```
apps/web              Vite + React kabuğu; motoru, sahneyi ve arayüzü bağlar
packages/core         Simülasyon: ekonomi, şirketler, rakipler, olaylar, komutlar
packages/content      Saf veri: kategoriler, binalar, bölgeler, NPC profilleri, olaylar
packages/render-three Three.js sahnesi ve RTS kamerası
packages/ui           React HUD, paneller, lensler
packages/persistence  IndexedDB kayıt, şema sürümleme, göç, JSON dışa/içe aktarma
tools/                Geliştirici araçları (tarayıcı testi)
```

Uygulanan ilkeler:

- **Tek yönlü akış.** Arayüz state'i değiştirmez, komut gönderir
  (`BUY_TILE`, `BUILD`, `SET_PRICE_MULTIPLIER` …). Motor değişimi bir sürüm
  sayacıyla duyurur.
- **Deterministik simülasyon.** `Math.random` çekirdekte kullanılmaz; RNG
  durumu tek bir sayıdır ve kayda yazılır. Aynı seed + aynı komutlar = aynı
  sonuç.
- **State yalnızca veridir.** `GameState` ağacında fonksiyon, `Map` veya
  sınıf örneği bulunmaz; davranış içerik tanımlarında ve sistemlerde durur.
  Kayıt sistemi bu yüzden kırılamaz.
- **Rakipler ayrıcalıksız.** NPC'ler oyuncuyla aynı `actions.ts`
  fonksiyonlarını, aynı fiyatları ve aynı nakit kısıtını kullanır. Zorluk,
  görünmez bonuslarla değil kişilik ağırlıklarıyla ayarlanır.
- **Tek doğru matematik.** Yapı menüsündeki "≈ 82 günde geri öder" tahmini
  ile rakip yapay zekânın kârlılık kapısı aynı `estimateInvestment`
  fonksiyonundan gelir.

## Ekonomi modeli

Her oyun günü, her bölgenin her sektörü için:

1. Talep hesaplanır — nüfus × kişi başı talep × bölge arketip ağırlığı ×
   gelir duyarlılığı × aktif olay çarpanı.
2. O talebe erişebilen mağazalar toplanır (kendi bölgesi tam ağırlıkla,
   komşu bölgeler kısmi ağırlıkla).
3. Her mağazanın çekiciliği bulunur: kalite, marka gücü, fiyat esnekliği ve
   erişilebilirlik.
4. Talep çekicilik oranında paylaştırılır, kapasite sınırı uygulanır, taşan
   talep ikinci turda yeniden dağıtılır.
5. Defterler işlenir; arsa değerleri gelişmeye göre kayar, nüfus istihdama
   göre büyür.

## Testler

**Denge simülasyonu** (başlıksız, tarayıcısız — 360 günü saniyeler içinde
koşturur):

```bash
node_modules/.pnpm/esbuild@*/node_modules/esbuild/bin/esbuild \
  packages/core/test/balance.ts --bundle --platform=node --format=esm \
  --outfile=/tmp/balance.mjs && node /tmp/balance.mjs
```

Doğruladıkları: yatırım yapan oyuncu büyür, atıl oyuncu büyümez, rakipler
canlı kalır, pazar doymaz, oyuncu borç sarmalına girmez, aynı seed aynı
sonucu verir, katalogdaki her bina kurulabilir ve **yapı menüsündeki tahmin
gerçekleşen kârla tutar**.

`packages/core/test/calibrate.ts` bina maliyetlerini hedef geri ödeme
süresine göre yeniden türetir; denge ayarlarken kullanılır.

**Tarayıcı testi** (Playwright gerekir):

```bash
pnpm build && node tools/playtest.mjs
```

Doğruladıkları: WebGL sahnesi açılır, zaman akar, duraklatma ve hız
kademeleri çalışır, arsa alınıp bina kurulur, lensler ve kamera hatasız
çalışır, IndexedDB kaydı yazılır ve geri yüklenir, sayfa yenilenince
ilerleme korunur, bozuk kayıtta oyun çökmeden yeni oyuna düşer.

## Yol haritası

Ayrıntılı plan ve verilen kararlar: [`docs/PLAN.md`](docs/PLAN.md).

Bu sürüm **Faz 0 + Faz 1 + Faz 2'nin çekirdeği**: 3B şehir, kamera, seçim,
yerleştirme, gerçek zamanlı ekonomi, kira ve lojistik katmanları, kişilikli
rakipler, ekonomik olaylar, veri lensleri, kayıt/göç sistemi.

Sırada: derin şehir katmanı (imar, altyapı, kredi, vergi), AR-GE ve
pazarlama, borsa ve halka arz, lobicilik, sendika, şirket satın alma.

## Eski sürüm

`legacy/capitalforge-lite/` içinde, farklı bir şartnameden (`SPEC.md`)
üretilmiş 2B emoji tabanlı prototip duruyor. Tarayıcıda `index.html`
açılarak çalışır; bu projeyle kod paylaşmaz.
