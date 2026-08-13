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
| Şehrin nüfusu haritasına sığmıyordu | **8** | Izgara geometrisi: 285 → 504 parsel, abonman %101 → %57 |
| Şehir oyuncuyu içine almıyordu | **9** | Müşteri akışı: satış, mağazanın kapısına gelen araca dönüştü |

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

Oynanınca üç hata daha çıktı ve üçü de ancak elde tutunca görülüyordu
(`GORSEL-TASARIMI.md` §2.4b–c):

| Rapor | Ölçülen kök sebep | Sonuç |
|---|---|---|
| "arsaya tıklayınca butonu göremiyorsun" | panel 664px ekranda 913px'te başlıyor | alt sayfa · kaydırma **645px → 0** |
| "kaydırma baya ters" | ekran ekseni dünyaya ters işaretle dönüyor | sapma **7,7 → 0,00** |
| "menü sorunumuz devam ediyor" | yedi yazılı düğme 516px istiyor, ekran 390px | ikon ızgarası · taşma **126px → 0** |
| "hep ekranda duran panelleri açılır kapanır yap" | üç panel 498px, HUD içeriği 967px | katlanabilir · harita payı **%38 → %49** |
| "üst blok küçülsün, paneller sağa ikon olsun, zincir taşıyor" | üst bar 177px (%27); zincir şeridi 490px'i 388px'e sığdırmaya çalışıyor | ikon metrikler + yüzen sütun + dikey zincir · harita payı **%49 → %68** |
| "üst bölüm yine büyük kalmış" | barın 128px'inin yalnızca **18px**'i metrik; boyu CEO portresi (38) ve hız düğmeleri (38) belirliyor | üç satır → iki satır · üst bar **128px → 72px** · harita payı **%68 → %78** |

Üçüncüsünde asıl ders testteydi: kontrol vardı, yeşil yanıyordu ve
`scrollIntoViewIfNeeded()` çağırdığı için ekran dışındaki düğmeyi önce
kendisi görünür yapıyordu.

İkinci bir ders de aynı turda çıktı: yeni eklenen kontrol paneli açık
bırakınca sonraki sürükleme ölçümü bozuldu ve sapma **iki koşumda da tam
6,75** verdi. Önce zamanlama sandım, yanlıştı — **tekrarlayan aynı sayı
zamanlama sorunu değildir**; rastgeleliğin izi dağılımdır.

Üçüncüsü panelleri katlarken çıktı: üçü de 292/104/102 px'den 46 px'e
indi, kaydırma 303 → 51 px'e düştü, **ama harita payı %38'den ancak
%39'a çıktı.** Boşalan yeri haber akışı yutmuştu, çünkü haritanın
ayırıcısı sabit `32vh`'ti ve kazanılan alandan pay almıyordu. **Bir yeri
boşaltmak, o yerin istediğin şeye gideceği anlamına gelmiyor** —
kazanılan alanı kimin alacağını düzenin kendisi belirler.

Dördüncüsü bir tur sonra, aynı ölçütün kendisinde çıktı: harita payı
**satır** bazında ölçülüyordu ve paneller tam genişlikteyken doğruydu.
Paneller 44 px'lik ikonlara inince ölçüt yanlış oldu — bir ikon,
bulunduğu satırın tamamını kapalı sayıyor ve haritayı %68 yerine **%5**
gösteriyordu. **Bir ölçüt, ölçtüğü şeyin şekli değişince sessizce
geçersizleşebilir.**

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

### Tur 8 — Şehir geometrisi · `docs/SEHIR-GEOMETRISI.md`

Tur 7 sıradaki iş olarak "haritayı büyütmek" demişti. Sınandı, **reçete
yanlış çıktı**: bölge eklemek nüfusu da parseli de aynı oranda büyüttüğü
için abonman oranı yerinde sayıyor (%101 → %95).

Kaldıraç bölge sayısı değil ızgara geometrisi. Bölge kenarı 8→10, sokak
aralığı 4→5: harita 24×24'ten **30×30**'a, parsel 285'ten **504**'e
çıktı, abonman **%101 → %57**'ye indi. Merkez %98'de kaldı — şehir
doyabiliyor ama merkezde parsel hâlâ kıt.

Karşılanmayan talebin **yönü** tersine döndü: eskiden zamanla artıyordu
(%20 → %34 → %33), şimdi azalıyor (%30 → %12 → %13).

Geometri değişince rakipler kol kurmayı bıraktı (0/4) — kol hamlesi
"kârlı genişleme bulunamazsa" tetikleniyordu, yani örtük olarak toprağın
tükenmesini bekliyordu. Kapı ölçeğe taşındı: kategoride 8 mağazası olan
rakip kolu genişlemeden önce kuruyor.

5×5 yerleşim de ölçüldü ve **ertelendi**: sorun harita değil inşaatçı
sayısı. Dört rakip 2,7 kat şehri yıllarca boş bırakıyor (360. günde %53
boş talep); tempo artırılınca açık %13'e iniyor. Önkoşul, rakip
sayısının şehirle ölçeklenmesi.

### Tur 9 — Müşteri akışı · `docs/GORSEL-TASARIMI.md` §3.8

Oyun raporu bu kez bir hata değil bir eksiklikti: *"şehir beni içine
almıyor."*

Koda bakınca eksik tek cümleye indi: **şehirden oyuncuya doğru akan
hiçbir şey yoktu.** Sokaktaki tek anlamlı katman oyuncunun kendi
kamyonlarıydı — senden dışarı akan bir şey. Talep ise bir sayıydı ve
kime gittiği ancak tablo açılınca görülüyordu.

`shoppers.ts` her outlet'in dünkü satışını (`last.unitsSold`) mağazanın
kapısına gelen araca çeviriyor; araç sahibinin rengini taşıyor. Rakip
senden pay aldığında akış onun kapısına bükülüyor — panel açmadan.

İki karar ölçümle değişti:

- **Dağıtım sıralı turlarla değil, satış oranında.** İlk sürümde 42 satan
  mağazaya 54 araç düşüyor, herkes 1 araç alıyor ve "kimin kapısı daha
  kalabalık" sorusu kayboluyordu. En büyük kalan yöntemine geçilince araç
  payı satış payını birebir izler oldu (%55,6 → %55,6).
- **Müşteri aracı küçültüldü.** İlk boyda kamyonla ayırt edilemiyordu;
  sokakta "renkli kutu" görünüyor ama hangisinin mal hangisinin müşteri
  taşıdığı bilinmiyordu.

Filo her değişimde sıfırdan kurulmuyor, fark kadar güncelleniyor: yoksa
satış her oynadığında bütün araçlar aynı anda başa ışınlanırdı.

Bu tur öncekiler gibi **ölçülemez** — "şehir beni içine aldı" bir teste
yazılamaz. Kontroller öncülleri tutuyor; kararı oynayan veriyor.

---

## 3. Ölçülen durum

`pnpm bench` çıktısından (360 gün, 3 tohum):

### Büyüme ve rekabet

| | Değer |
|---|---|
| Oyuncu / rakip oranı | **1,58** — Tur 7 öncesi 0,76 idi |
| Oyuncu bina sayısı | 70 |
| Günlük kâr | 235 B ₺ |
| Batan şirket | **0/5** |

### Doygunluk (Tur 8 sonrası)

| Karşılanmayan talep | 360. gün | 700. gün | 1200. gün |
|---|---|---|---|
| Tur 7 öncesi | %35 | %38 | %48 |
| Tur 7 sonu | %20 | %34 | %33 |
| **Tur 8** | %30 | **%12** | **%13** |

Okunması gereken şey sayı değil **yön**. İlk iki satırda boş talep
zamanla artıyor: şehir büyüdükçe geri kalıyor. Üçüncüde azalıyor — erken
oyunda fırsat bol, geç oyunda şehir doyuyor. Erken oyundaki %20 → %30
bir bedel değil, 1,8 kat parselin aynı beş inşaatçıya dağılması.

### Stratejilerin karşılığı (aynı tohum, tek değişken)

| Strateji | Kâr etkisi | Geri ödeme |
|---|---|---|
| Ar-Ge · 4 mağaza | %6 | 622 gün *(erken)* |
| Ar-Ge · 8 mağaza | **%14** | 140 gün |
| Pazarlama · 8 mağaza | **%12** | 103 gün |
| Fiyatı %25 kırmak | **%17 hacim** | — |
| Zincir · normal nakit | **%12** | ~190 gün |
| Zincir · bol nakit (20 M ₺) | %1 | — |

Son iki satır ayrı duruyor çünkü farkları bir bulgu: bol nakitle parseli
outlet'le doldurmak zinciri geçiyor. **Zincir bir nakit kısıtı oyunu.**

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
| Tarayıcı testi | **144 kontrol**, 0 konsol hatası |
| Kapsam | 26 bina · 22 ürün · 7 kategori · 4 rakip profili |

### Render (Tur 6 sonrası)

| | Önce | Sonra |
|---|---|---|
| Çizim çağrısı / kare | 5 | **16** |
| Üçgen / kare | 10,5 K | **25,2 K** |
| İçerik dokusu | 0 | 3 (pencere, cephe, asfalt) |
| Telefonda ulaşılabilen panel | 0 / 8 | **7 / 7** |
| Sürüklemede tutulan karenin kayması | 7,7 birim | **0,00** |
| Satın alma butonuna gereken kaydırma | ~645 px | **0 px** |

Yaygın mobil hedef bandı 50–150 çizim çağrısı, 100–300 K üçgen — yani
bütçe hâlâ fazlasıyla açık.

---

## 4. Açık kalan işler

### 4.1 ~~Harita %100 abone~~ — Tur 8'de kapandı · `docs/SEHIR-GEOMETRISI.md`

Bu madde iki tur boyunca listenin başındaydı ve iki kez yanlış teşhis
edildi:

| tur | teşhis | sonuç |
|---|---|---|
| Tur 3–6 | "sermaye talebe yetişemiyor" | **yanlış** — sınırsız sermayeyle bile boş talep %52 |
| Tur 7 | "harita küçük, bölge ekle" | teşhis doğru, **reçete yanlış** — bölge eklemek oranı değiştirmiyor |
| Tur 8 | "nüfus başına parsel az" | **doğru** — ızgara geometrisi |

Bölge kenarı 8→10, sokak aralığı 4→5. Abonman **%101 → %57**, boş talep
1200. günde **%33 → %13** ve eğri artıştan azalışa döndü.

Kapanmış sayılmasının şartı, geri gelmemesi: denge testi abonman oranını
**%35–%75 bandında** tutuyor. Üst sınır tıkanmayı, alt sınır toprağın
bedavalaşmasını engelliyor — ikincisi olmadan "harita ne kadar büyükse o
kadar iyi" gibi yanlış bir yöne kayılabilirdi.

Geriye kalan: 1200. günde harita hâlâ tamamen tükeniyor (0 boş parsel),
ama artık **talebi karşıladıktan sonra**. Bu bir kusur değil bir şehrin
olgunlaşması; geç oyunun rekabeti fiyat, kalite ve devralma üzerinden
yürüyor.

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

### 4.5 Daha büyük şehrin önkoşulu: rakip sayısı ← sıradaki iş

Harita Tur 8'de 24×24'ten 30×30'a çıktı. **Bölge sayısını** artırmak
(3×3 → 5×5) ayrıca ölçüldü ve ertelendi:

| yerleşim | harita | parsel | 360g boş talep | 1200g | oyn/rak |
|---|---|---|---|---|---|
| **3×3** *(bugün)* | 30×30 | 504 | %13 | %9 | 0,66 |
| 5×5 | 50×50 | 1377 | **%53** | %9 | 0,52 |
| 5×5 · hızlı bot | 50×50 | 1377 | **%13** | %14 | 7,62 |

Üçüncü satır ayırt edici: tek değişken inşa temposu. Tempo artınca
5×5'in erken oyun açığı 3×3 seviyesine iniyor — yani sorun harita değil
**inşaatçı sayısı.** Dört rakip ve bir oyuncu, 2,7 kat şehri yıllarca
boş bırakıyor.

Önkoşul: `NPC_PROFILES` bugün dört tane ve `npcCount` onunla sınırlı.
Rakip sayısı (ya da rakiplerin genişleme temposu) şehir boyutuyla
ölçeklenmeden büyük şehir boş bir dekor olur.

Dikiş hazır: `createNewGame` artık bir `layout` argümanı alıyor, harita
boyutu hiçbir yerde sabit değil. Bölge açma ve çoklu şehir işleri o
dikişten geçecek.

Sıra: rakip ölçeklemesi → 5×5 → bölge açma → çoklu şehir.

### 4.6 Daha küçük kalemler

- `estimateInvestment` depo, Ar-Ge ve pazarlama için `direct: false`
  dönüyor; bu binaların geri ödemesi yapı menüsünde görünmüyor
- Devralınan şirketin yerine yenisi gelmiyor; geç oyunda rakip sayısı
  azalıyor
- İhale yalnızca boş parsel için; dolu parsel ihalesi yok

### 4.7 Şehrin oyuncuyu içine alması — Tur 9'da başladı, bitmedi

Rapor üç şey istiyordu; Tur 9 birincisini yaptı:

| istenen | durum |
|---|---|
| şehirden sana akan bir şey olsun | **yapıldı** — müşteri akışı |
| kurduğun imparatorluk "senin" olsun | açık — şirketin adresi yok; ilk mağaza genel merkeze dönüşebilir |
| rakip seni geçince hırslanasın | açık — geçilme anı bir olay değil; rakibin yüzü ve kaybettiğinin adı yok |

İkincisi ve üçüncüsü ayrı turlar. Üçüncüsü için malzeme hazır: rakiplerin
adı, rengi, doktrini ve karakter tarifi zaten var (`NPC_PROFILES`), CEO
portreleri de öyle — eksik olan, geçilme anını yakalayan bir olay ve onu
oyuncunun kaybettiği şeyle birlikte söyleyen bir kart.

---

## 5. Nasıl koşulur

```bash
pnpm typecheck     # altı paketin tamamı
pnpm balance       # denge testi — 178 kontrol, geçti/kaldı
pnpm bench         # benchmark — sayıların kendisi
pnpm constraint    # kısıt deneyi — bağlayıcı kısıt hangisi?
pnpm land          # abonman oranı — geometri varyantları
pnpm playtest      # tarayıcı testi (build dahil), 165 kontrol
pnpm dev           # oyunu aç
```

`balance` bir **sınav**, `bench` bir **termometre**: ilki bir şey
bozulduğunda bağırır, ikincisi neyin ne kadar değiştiğini gösterir. İki
sürüm karşılaştırırken `bench` çıktılarını yan yana koymak yeterli.

`constraint` ve `land` ise **deney**: bir sınav gibi geçip kalmazlar,
bir termometre gibi sürekli okunmazlar — bir SORUYA cevap verirler.
Tur 7'nin sınırsız-sermaye deneyi bir kez koşulmuş, sayıları alıntılanmış
ama kendisi repoda kalmamıştı; sonraki tur onu tekrarlayamadı, yalnızca
güvenebildi. Artık ikisi de koşulabilir:

| | cevapladığı soru |
|---|---|
| `pnpm constraint` | Oyunu ne sınırlıyor — para mı, toprak mı, tempo mu? |
| `pnpm land` | Bir geometri değişikliği abonman oranını ne yapar? |

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

Aynı sorunun daha sinsi bir hâli sonra çıktı: kontrol kırmızı
yanabiliyordu, ama **testin kendisi hatayı onarıyordu.** "Bütün panel
düğmeleri açılıyor" kontrolü tıklamadan önce
`scrollIntoViewIfNeeded()` çağırıyordu; ekranın dışında kalmış iki
düğmeyi önce kendisi görünür yapıp sonra tıklıyor ve yeşil yanıyordu.
Gerçek oyuncunun elinde öyle bir imkân yok. **Bir testin kolaylık için
yaptığı her şey, ölçtüğü gerçeği değiştirmiş olabilir.**

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

Tur 8 aynı kuralı bir adım öteye taşıdı: **bir reçeteyi uygulamadan önce
de sına.** Tur 7'nin teşhisi doğruydu (kısıt toprak) ama reçetesi
yanlıştı (bölge ekle). Bölge eklemek nüfusu da parseli de aynı oranda
büyüttüğü için abonman oranı yerinde sayıyor — %101'den ancak %95'e
iniyor. Doğru kaldıraç ızgara geometrisiydi. Ölçüm on dakika sürdü,
yanlış reçeteyi uygulamak günler alırdı.

İkinci ders daha ince: **bir çözüm, çözmediği bir şeye yaslanmış
olabilir.** Rakiplerin kol yatırımı "kârlı genişleme bulunamazsa"
tetikleniyordu. Bu kural Tur 2'de ölçümle bulunmuştu ve gerçek bir
sorunu çözüyordu, ama sessizce toprağın kıtlığına yaslanıyordu:
genişleme er geç tıkanır, sıra kola gelirdi. Toprak bollaşınca sıra hiç
gelmedi ve rakipler 0/4 kol kurdu. Bir kuralın neye yaslandığı yazılı
değilse, değişen her şeyle birlikte sessizce bozulabilir.

Üçüncüsü tanıdık ama yeni bir kılıkta: **bir eşik, neye bağlıysa onunla
ölçülmeli.** `vacant >= 80 && vacant <= 180` kontrolü harita büyüyünce
kırıldı; oysa ölçtüğü şey (şehrin ne kadar boş başladığı) %38'den %39'a
gitmişti, yani hiç değişmemişti. Aynı hata tarayıcı testinde de vardı.
Mutlak sayıya bağlanan eşik, gerçek bir sorun yokken kırmızı yakar ve
asıl sorunu gölgeler.

Ve yine: **yeni yazılan ölçüm aracı da şüphelidir.** `constraint.ts`'in
ilk hali `district.unmet`'i birim sanıp doğrudan topladı, oysa oran
tutuyor; payda payı ezince her satır %0 çıktı — yani kontrol hiçbir
koşulda kırmızı yanamazdı.

Dördüncüsü en uzun süredir gizleniyordu: **zincir yatırımının karşılığı,
o yatırımın geri ödemesinden kısa bir pencerede ölçülüyordu.** Benchmark
-%11 derken denge testi +%21 diyordu ve iki sayı yan yana durdu. Üç
hipotez elendi (tek gün, tek tohum, nakit koşulu); sebep ufuktu —
zincirin geri ödemesi ~190 gün, benchmark 400 günde kesiyordu. 500'e
çıkınca iki ölçüm birebir aynı sayıyı verdi: **+%12**.

> Bir yatırımın karşılığını ölçen pencere, o yatırımın geri ödemesinden
> belirgin şekilde uzun olmalı.

Yan ürün olarak çıkan şey de kayda değer: zincirin getirisi normal
nakitte +%12, bol nakitte (20 M ₺) +%1. **Zincir bir nakit kısıtı
oyunu** — toprak bollaşınca bunu bilmek daha önemli hale geldi.
