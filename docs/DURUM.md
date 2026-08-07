# Capital — Durum Raporu

> Bu dosya "neler bitti, neler kaldı" sorusunun tek cevabı. Sayılar
> `pnpm bench` çıktısından; iddialar `pnpm balance` ve `pnpm playtest`
> tarafından her koşuda doğrulanıyor.
>
> Son güncelleme: şema **v6**, 4 tur tamamlandı.

---

## 1. Nerede başladık, nereye geldik

Başlangıçtaki teşhis şuydu: *"Oyunu oynuyorum ama gerçekten capitalism
olmaktan çok uzak."* O cümlenin arkasında dört ayrı eksik vardı ve
dördü de kapandı:

| Eksik | Tur | Ne eklendi |
|---|---|---|
| Satılan şeyin bir maliyeti yoktu | **1** | Tedarik zinciri: hammadde → ara mal → raf |
| Rekabetin tek silahı fiyattı | **2** | Kalite (Ar-Ge) ve marka (pazarlama) kolları |
| Pazar payı yarışı fiilen yaşanmıyordu | **3** | Nüfus modelinin onarımı |
| Rakibi yenmenin tek yolu pazardı | **4** | Borsa: hisse, temettü, devralma |

---

## 2. Biten işler

### Tur 1 — Ürün ve Zincir · `docs/ZINCIR-TASARIMI.md`

| Parça | Ne yapar |
|---|---|
| A | Ürün kataloğu, spot pazar, harmanlanmış birim maliyet, imar kısıtı |
| B | Zincir kartı: hangi halka sende, hangisi pazardan, en iyi hamle ne |
| C | Rakipler de zincir kuruyor — oyuncunun okuduğu kartı okuyarak |
| D | Kategori başına ikinci ürün + raf yuvası (konum kararı) |
| E | Zincir kamyonları: akış şehirde görünür |

**Denge kimliği:** `basePrice(ara mal) + retailCost(tüketici) = basePrice × costRatio`.
Zincir kurmayan oyuncunun ekonomisi zincir öncesiyle bit düzeyinde aynı.

### Tur 2 — Kalite, Marka ve Toprak · `docs/REKABET-TASARIMI.md`

| Parça | Ne yapar |
|---|---|
| A | Ar-Ge ve pazarlama binaları, kalite/marka/fiyat formülleri |
| B | Rekabet kartı: sen vs bölge lideri; odak atama arayüzü |
| C | Rakip doktrinleri — her kişiliğin farklı silahı ve karşı hamlesi |
| D | Parsel ihalesi: arazi artık çekişiyor, oyuncu kaybedebiliyor |

**Tek mekanik, iki ödeme kanalı:** kapasiten doluysa kalite fiyata
döner, boş kapasiten varsa paya.

### Tur 3 — Denge · `docs/DENGE-TASARIMI.md`

Tek satırlık kural değişikliği, en büyük etki: **perakende istihdamı
artık nüfus çekmiyor.** Öncesinde açtığın dükkân istihdam yaratıyor,
istihdam nüfusu, nüfus da o dükkânın talebini büyütüyordu — dükkân kendi
müşterisini üretiyordu.

Kontrollü ölçümde doluluk %100 → **%69**, doymuş pazarda Ar-Ge'nin hacim
katkısı %4,2 → **%26,5**.

### Tur 4 — Borsa · `docs/BORSA-TASARIMI.md`

Şirketler 10.000 hisseye bölündü, fiyat `defter değeri × güven` olarak
türetiliyor, kâr temettü olarak dağılıyor ve %50'yi geçen devralıyor:
bütün binalar ve parseller el değiştiriyor, azınlık hissedar nakde
çevriliyor.

---

## 3. Ölçülen durum

`pnpm bench` çıktısından (360 gün, 3 tohum):

### Büyüme ve rekabet

| | Değer |
|---|---|
| Oyuncu net değeri | **22,06 M ₺** |
| En iyi rakip | 28,91 M ₺ |
| Oyuncu / rakip oranı | **0,76** — rakipler oyuncuyu geçebiliyor |
| Oyuncu bina sayısı | 48 |
| Batan şirket | **0/5** |

### Stratejilerin karşılığı (aynı tohum, tek değişken)

| Strateji | Kâr etkisi | Geri ödeme |
|---|---|---|
| Ar-Ge · 4 mağaza | %6 | 604 gün *(erken)* |
| Ar-Ge · 8 mağaza | **%13** | 134 gün |
| Pazarlama · 8 mağaza | **%12** | 89 gün |
| Fiyatı %25 kırmak | **%13 hacim** | — |
| Zincir kurmak | %5 | — |

### Kalibrasyon bantları

| | Değer |
|---|---|
| Outlet geri ödemesi | 18–42 gün |
| Zincir geri ödemesi | 194 gün |
| Devralma maliyeti | **0,84× net değer** |

### Sağlık

| | Değer |
|---|---|
| Determinizm | birebir |
| Simülasyon hızı | ~70 gün/sn |
| Denge testi | **170 kontrol, hepsi geçiyor** |
| Tarayıcı testi | **105/105**, 0 konsol hatası |
| Kapsam | 26 bina · 22 ürün · 5 kategori · 4 rakip profili |

---

## 4. Açık kalan işler

### 4.1 Canlı oyunda pazar hâlâ doymuyor ← en önemlisi

Tur 3 patolojik döngüyü kapattı ve **kontrollü koşullarda** rekabeti
canlandırdı. Ama canlı oyunda:

| | 360. gün | 700. gün | 1200. gün |
|---|---|---|---|
| Outlet doluluğu | %100 | %100 | %100 |
| Karşılanmayan talep | %35 | %38 | **%48** |

Yani oyuncunun sermayesi talebin bileşik büyümesine yetişemiyor ve
karşılanmayan talep zamanla **artıyor**. Bunun sonucu: kalite ve marka
kolları canlı oyunda tasarlandıkları kadar ısırmıyor; büyük ölçüde fiyat
primi kanalından ödüyorlar.

**Sıradaki teşhis:** talebi ne büyütüyor — taban nüfus artışı mı, konut
mu, üretim istihdamı mı? Sermaye tarafında ne kısıtlıyor — geri ödeme
bandı mı, parsel sayısı mı, kredi limiti mi?

### 4.2 Rakipler oyuncunun hissesini toplamıyor

Borsa şu an tek yönlü (`BORSA-TASARIMI.md` §6.3). İki yönlü devralma
daha adil ama oyuncunun haberi olmadan oyunu kaybetmesi anlamına
gelebilir; ölçümle değerlendirilmesi gereken bir karar.

### 4.3 Taban bina kalitesi fiyata dönmüyor

Prim gücü yalnızca Ar-Ge ve pazarlamadan geliyor. Bir süpermarket
bakkaldan kaliteli olmasına rağmen aynı fiyattan satıyor
(`REKABET-TASARIMI.md` §3.4). Genel model daha doğru olurdu ama Tur 1'in
bütün kalibrasyonunu yeniden yapmayı gerektirir.

### 4.4 Kapasitenin mekânsal dağılımı

Bir outlet kendi bölgesine tam, komşulara kısmi (0,30 / 0,14) erişiyor;
uzak bölgenin talebine kimse ulaşamıyor. Bu bir arıza değil coğrafya,
ama "boş talep" sayısını okurken akılda tutulmalı.

### 4.5 Daha küçük kalemler

- `estimateInvestment` depo, Ar-Ge ve pazarlama için `direct: false`
  dönüyor; bu binaların geri ödemesi yapı menüsünde görünmüyor
- Devralınan şirketin yerine yenisi gelmiyor; geç oyunda rakip sayısı
  azalıyor
- İhale yalnızca boş parsel için; dolu parsel ihalesi yok

---

## 5. Nasıl koşulur

```bash
pnpm typecheck     # altı paketin tamamı
pnpm balance       # denge testi — 170 kontrol, geçti/kaldı
pnpm bench         # benchmark — sayıların kendisi
pnpm playtest      # tarayıcı testi (build dahil), 105 kontrol
pnpm dev           # oyunu aç
```

`balance` bir **sınav**, `bench` bir **termometre**: ilki bir şey
bozulduğunda bağırır, ikincisi neyin ne kadar değiştiğini gösterir. İki
sürüm karşılaştırırken `bench` çıktılarını yan yana koymak yeterli.

---

## 6. Bu oturumun yöntem notu

Bu turlarda tekrar eden tek bir şey vardı ve kayda değer: **makul görünen
bir sonucun, ölçümün kendisinin ürünü olduğu defalarca ortaya çıktı.**

- "Zincirsiz taban" diye kurulan git worktree'si node_modules üzerinden
  değiştirilmiş paketlere çözülüyordu — yani taban değildi
- Rakip net değerindeki düşüş kontrolsüz bir gözlemdi; kontrollü A/B
  tersini gösterdi
- FPS eşiği kodu değil konteyneri ölçüyordu
- Lens testleri sabit `sleep` yüzünden bir adım geriden okuyordu ve
  ÇALIŞAN bir özelliği hatalı raporluyordu
- "Boş talep" bölge oranlarının ağırlıksız ortalamasıydı
- İhale değerlemesi her parsele aynı fiyatı biçiyordu — teklif hiçbir
  bilgi taşımıyordu
- Hisse güveni dört şirketten üçünde tavana yapışıyordu

Bir sayı her nesne için aynı çıkıyorsa o sayı ölçüm değil süstür. İkinci
tekrar eden şey: **yeşil testler görünürlüğü garanti etmiyor.** Ekranı
açıp bakmak, testlerin kaçırdığı yedi ayrı hatayı buldu — %134 pazar
payı, "%100 boş" bölge, yuvarlanmış birim fiyatlar, 395 günlük tavsiye,
sahte raf seçimi, bozuk sanılıp yıkılacak Ar-Ge merkezi, ve fiyat keşfi
yapamayan ihale.
