# Capital — Durum Raporu

> Bu dosya "neler bitti, neler kaldı" sorusunun tek cevabı. Sayılar
> `pnpm bench` çıktısından; iddialar `pnpm balance` ve `pnpm playtest`
> tarafından her koşuda doğrulanıyor.
>
> Son güncelleme: şema **v6**, 6 tur tamamlandı.

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

Dördü kapandıktan sonra ölçüm üç eksik daha gösterdi. İlk ikisi oyun
mantığının dışında; üçüncüsü ise oyunun kendi **tavsiyesindeydi**:

| Eksik | Tur | Ne yapıldı |
|---|---|---|
| Telefonda oyun açılıyor ama oynanamıyordu | **5** | Sarma, alt rıhtım, pinch zoom, dokunarak seçim |
| Görsel bütçenin %95'i harcanmamıştı | **6** | Bina kütlesi, pencere ışıkları, asfalt, bloom |
| Tavsiye kıt olan parseli en verimsiz binaya harcatıyordu | **7** | Yapı menüsü parsel getirisine göre sıralanıyor |

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

### Tur 5 ve Tur 6 — Mobil ve Görsel · `docs/GORSEL-TASARIMI.md`

İkisi de oyun mantığına dokunmuyor; denge sayıları ve şema sürümü aynı.

| Tur | Ne değişti |
|---|---|
| **5** | Telefonda ulaşılabilen panel **0/8 → 7/7**. Pinch zoom, iki parmakla döndürme, dokunarak seçim (üçü de yoktu). Kalite tek kademeden dört kademeye. |
| **6** | Bina tek kutudan üç parçaya (taban, gövde, çatı). Pencere ışıkları gerçek pencerelerden geliyor — emisyon **0,03 → 1,15**. Sokaklar asfalt dokusu ve şerit çizgisi kazandı. Ortam haritası, bloom, vinyet, inşaat animasyonu. |

Kök sebepler ilginçti: üst bar sarmayan bir flex satırıydı ve min-content
genişliği **1002px**'e sabitlenmişti; `controller.zoom()` için kodda tek
bir çağrı yeri vardı (`wheel`); ve dokunmatikte seçim `pointermove`'a
bağlı olduğu için hiç çalışmıyordu.

### Tur 7 — Kıt olan para değil toprak · `docs/TOPRAK-TASARIMI.md`

Dört tur boyunca §4.1'de "sermaye yetişemiyor" yazıyordu. Sınandı,
yanlış çıktı: sermaye sınırsız olduğunda bile karşılanmayan talep
%52'de kalıyor ve denemelerin %97'sinde "boş parsel yok" deniyor.

Asıl sebep tavsiyedeydi. Bir bina bir parsel kapladığına göre doğru
ölçüt paranın getirisi (geri ödeme) değil **parselin getirisi** (günlük
kâr). İkisi aynı şeyi söylemiyor: geri ödeme 17–41 gün aralığında düz,
parsel başına kapasite ise **41 kat** değişiyor. Yapı menüsü artık
getiriye göre sıralıyor.

Ölçülen etki — tek değişken sıralama ölçütü, aynı tempo ve nakit:
karşılanmayan talep 1200. günde %48 → **%33**, oyuncu/rakip oranı
0,76 → **1,28**.

---

## 3. Ölçülen durum

`pnpm bench` çıktısından (360 gün, 3 tohum):

### Büyüme ve rekabet

| | Değer |
|---|---|
| Oyuncu / rakip oranı | **1,28** — Tur 7 öncesi 0,76 idi |
| Oyuncu bina sayısı | 52 |
| Günlük kâr | 168 B ₺ |
| Batan şirket | **0/5** |

### Doygunluk (Tur 7 sonrası)

| Karşılanmayan talep | 360. gün | 700. gün | 1200. gün |
|---|---|---|---|
| Önce | %35 | %38 | %48 |
| **Sonra** | **%20** | **%34** | **%33** |

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
| Denge testi | **176 kontrol, hepsi geçiyor** |
| Tarayıcı testi | **134 kontrol**, 0 konsol hatası |
| Kapsam | 26 bina · 22 ürün · 7 kategori · 4 rakip profili |

### Render (Tur 6 sonrası)

| | Önce | Sonra |
|---|---|---|
| Çizim çağrısı / kare | 5 | **16** |
| Üçgen / kare | 10,5 K | **25,2 K** |
| İçerik dokusu | 0 | 3 (pencere, cephe, asfalt) |
| Telefonda ulaşılabilen panel | 0 / 8 | **7 / 7** |

Yaygın mobil hedef bandı 50–150 çizim çağrısı, 100–300 K üçgen — yani
bütçe hâlâ fazlasıyla açık.

---

## 4. Açık kalan işler

### 4.1 Harita %100 abone ← en önemlisi · `docs/TOPRAK-TASARIMI.md`

> **Bu maddenin eski teşhisi yanlıştı ve Tur 7'de düzeltildi.** Dört tur
> boyunca burada "oyuncunun sermayesi talebe yetişemiyor" yazıyordu.
> Sınandığında yanlış çıktı: sermaye sınırsız yapıldığında karşılanmayan
> talep **%52'de kalıyor**. Kısıt para değil **toprak**.

Tur 7 tavsiyeyi düzeltti (yapı menüsü artık parsel getirisine göre
sıralıyor) ve sayılar belirgin şekilde iyileşti:

| | 360. gün | 700. gün | 1200. gün |
|---|---|---|---|
| Karşılanmayan talep · önce | %35 | %38 | %48 |
| Karşılanmayan talep · **sonra** | **%20** | **%34** | **%33** |

Ama tamamen çözülmedi ve kalan sebep yapısal: nüfus tavanındaki talebi
karşılamak, her kategoride **en büyük** outlet kullanılsa bile **284
parsel** gerektiriyor. Haritada **285** parsel var — yani **abonman
%100**. Şehir ancak parsellerinin tamamı outlet olursa doyar; fabrikaya,
depoya ve dört rakibe yer kalmaz.

Bu sayı denge testinde bir kontrol olarak duruyor, sessizce
kötüleşemiyor.

**Sıradaki iş:** haritayı büyütmek (§4.5) — artık ölçümle gerekçeli.

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

### 4.5 Şehir küçük — ama büyütmek tek başına işe yaramıyor

Ölçüldü: bölge yerleşimi geçici olarak 3×3'ten 5×5'e çıkarıldı.

| | Bugün (3×3) | Deney (5×5) |
|---|---|---|
| Harita | 24 × 24 | 40 × 40 |
| Parsel | 283 | 808 |
| Simülasyon hızı | 207 gün/sn | 166 gün/sn |
| Çizim çağrısı | değişmiyor | değişmiyor |
| **360. günde bina** | **137** | **143** |

Teknik maliyet ihmal edilebilir — harita boyutu tamamen
`DISTRICT_LAYOUT`'tan türetiliyor, hiçbir yerde sabit kodlanmamış.

> **Bu maddenin sonucu da Tur 7'de düzeltildi.** Burada şöyle yazıyordu:
> *"harita 2,9 katına çıktığında şehir yalnızca 6 bina büyüdü, demek ki
> kısıt harita değil sermaye."* Çıkarım yanlıştı ve sebebi ölçümün
> kendisiydi: o deney 360 günde ve **5 günde bir tek bina kuran** botla
> yapılmıştı, yani bot-sınırlıydı. 1200 günlük ve sınırsız sermayeli
> ölçüm tersini gösteriyor — kısıt toprak.

**Haritayı büyütmek artık doğru sıradaki iş.** §4.1'deki abonman oranı
(%100) bunun gerekçesi: şehrin fabrikaya, depoya ve rakiplere yer
bırakacak kadar parseli yok.

Sıra: ızgarayı büyüt → bölge açma → çoklu şehir.

### 4.6 Daha küçük kalemler

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

Tur 5 ve 6 aynı iki dersi bir kez daha, ama daha keskin biçimde verdi.

**Bir kontrol, başarısız OLABİLİYOR mu?** "Dar ekranda yatay taşma yok"
kontrolü aylarca yeşil yandı ve hiçbir şey ölçmüyordu: `body`'de
`overflow: hidden` varken `scrollWidth − clientWidth` her koşulda 0'dır.
Bu yüzden 1002px genişliğinde takılı bir üst barı ve telefonda hiçbir
panele ulaşılamamasını kaçırdı. Bir kontrolü yazarken sorulacak soru
"geçiyor mu" değil, **"bu kontrol hangi durumda kırmızı yanar"**.

**Ortamın ölçemediği şeyi kontrolü kapatarak değil, soruyu değiştirerek
çöz.** İki şey bu ortamda doğrudan test edilemedi: 400 ms'lik çift
dokunuş penceresi (yazılım rasterizasyonunda iki dokunuş arası 1 saniye)
ve üst kalite kademeleri (uyarlama saniyeler içinde en ucuza iniyor).
İkisi de kontrol kapatılarak değil, sorunun yeniden kurulmasıyla çözüldü
— çift dokunuş gözlenen aralığa göre iki yönlü kontrol ediliyor, kalite
kademesi ise sabitlenebilir hale getirildi.

Bir de üç ayrı "doğru görünen ama yanlış" CSS/render tuzağı çıktı, üçü de
ancak ekrana bakınca görüldü: `backdrop-filter` sabit konumlu alt öğe
için kapsayıcı blok yaratıyor (alt rıhtım ekranın tepesine yapışmıştı);
`map` binanın kendi rengiyle çarpıldığı için ortalaması 0,72 olan bir
doku bütün şehri karartıyordu; ve flex kolonunda paneller doğal
yüksekliklerini koruyamayıp birbirini eziyordu.

Tur 7 ise dersin en pahalı halini verdi: **makul görünen bir sebep, hiç
sınanmadan dört tur boyunca kayıtta kaldı.** §4.1'de "sermaye
yetişemiyor" yazıyordu; sermayeyi sonsuz yapan tek bir kontrollü deney
onu çürüttü — hiçbir şey değişmedi, çünkü kısıt paranın değil toprağın
kıtlığıydı.

Ölçüm aracının kendisi de suçluydu. Benchmark'ın botu 5 günde bir tek
bina kuruyor, dört bölgeye bakıyor ve geri ödemeye göre seçiyordu; o
botun ürettiği sayı "oyunun davranışı" diye okundu ve **§4.5'in sonucu
da bu yüzden yanlış çıktı.** Bir ölçüm aracının kısıtları, ölçtüğü
şeyin özelliği sanılırsa yanlış sonuç kaçınılmaz.

Kural: **bir sebebi kaydetmeden önce onu değiştirip ne olduğuna bak.**
