# Capital — Durum Raporu

> Bu dosya "neler bitti, neler kaldı" sorusunun tek cevabı. Sayılar
> `pnpm bench` çıktısından; iddialar `pnpm balance` ve `pnpm playtest`
> tarafından her koşuda doğrulanıyor.
>
> Son güncelleme: şema **v6**, 18 tur tamamlandı.

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
| Arayüz karanlıktı, şehir boşlukta yüzüyordu | **10** | Kadastro teması (aydınlık, gömülü tipografi) + kırsal, ufuk eğriliği, uzak yerleşimler |
| İmparatorluğun adresi yoktu, rakip seni geçince hiçbir şey olmuyordu | **11** | Genel merkez işareti + geçilme olayı, rakiplerin yüzü |
| Arayüz "klasik yapım" diye bağırıyordu | **12** | Kambiyo: terminal dili — sıfır yuvarlaklık, sıfır gölge, mürekkep vurgu, Archivo + Martian Mono |
| Oyun tekrara düşüyordu, kaybetmek imkânsızdı | **13** | Rakip ölçeklemesi, çift yönlü borsa + oyun sonu, dönemler, sözleşmeler |
| Arazi oyunu ilk yılda sönüyordu | **14** | Kademeli imar: köşeler köy başlıyor, 130-520. günlerde açılıyor + kademeli bina silueti |
| Zincir kartı ölçekte kötü tavsiye veriyordu | **15** | Fırsat maliyeti freni: "ertelendi" durumu — tempo, yasak değil |
| Şehir gün 0'da bitmiş bir dekordu | **16** | Kasabadan metropole: yayılma, yükselme, kademe atlama + bölgeyi silüetten okutan formlar |
| Kazanmak yoktu, testler sahte yeşildi | **17** | Hedef merdiveni ve zafer, zorluk, CI, belediye meclisi, Tohum Ligi, ses |
| Ücret sabit bir satırdı, borç hiç ödenmiyordu | **18** | İşgücü piyasası, ücret politikası, sendika ve grev; banka: kredili hesap, vadeli ve teminatlı kredi, not, muacceliyet, haciz |

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

### Tur 10 — Kadastro · `docs/GORSEL-TASARIMI.md` §3.9

İki oyun raporu, tek tur: *"dark tema istemiyorum, daha premium bir şey
olsun"* ve *"harita dışı uzay gibi boşlukta, orayı da yeşillik yapsana."*

**Tema.** Oyun toprak üzerine; arayüz artık bunu söylüyor. Kireçtaşı
kâğıt, mürekkep yazı, mühür yeşili vurgu, pirinç ikincil. Başlıklar
tırnaklı (IBM Plex Serif), veriler sans (IBM Plex Sans) — ayrım işlevsel:
tırnaklı yazı bir şeyin ADI, sans onun hakkındaki VERİ. Fontlar CDN'den
değil gömülü, çünkü oyun internetsiz açılabilen tek bir HTML dosyası
olarak da dağıtılıyor.

İki şey ölçümle çıktı:

- **Karanlık varsayımı 21 yerde gizliydi** — koyu temada kabartma beyazla
  yapılıyordu. Hepsi dört basamaklı bir yüzey tonu ölçeğine bağlandı.
- **Asıl karartma CSS'te değildi.** Tema aydınlığa döndüğünde şehir hâlâ
  kara bir kütleydi; sebep yapı ve bölge renklerinin koyu sahneye göre
  seçilmiş olmasıydı (yapılar L≈%35). Doku zaten açıktı. **Bir temanın
  rengi CSS'te bitmiyor.**

**Dünya.** Zemin yalnızca harita karelerinden oluşuyordu; onun bittiği
yerde hiçbir şey yoktu. Şehir artık kırsalın içinde, zemin uzaklaştıkça
küresel bir formla alçalıyor ve ufukta yedi yerleşim kümesi duruyor.

Bunun da bir ölçüm dersi vardı: kırsal bitti, ekran görüntüsü alındı ve
**görünmedi**. Kamera 46 birimde kilitliydi — şehir boşlukta yüzerken
doğru olan sınır, dünya eklenince hataya dönüşmüştü. **Bir şeyi yapmak,
oyuncunun onu görebileceği anlamına gelmiyor.**

### Tur 11 — Adres ve hırs · `docs/GORSEL-TASARIMI.md` §3.10

Tur 9 raporunun kalan iki isteği:

**"Kurduğun imparatorluk senin olsun."** Şirketin bir adı vardı ama bir
YERİ yoktu. Artık en eski binan genel merkez: tepesinde şirket renginde
bir bayrak, parsel panelinde bir rozet.

Merkez **saklanmıyor, türetiliyor** (`headquarters.ts`). Şema alanı açmak,
migration yazmak ve bina yıkıldığında ortada kalan kimliği temizlemek
gerekirdi; oysa kural tek cümlede duruyor: *en eski binan merkezindir.*
Kural kendini onarıyor da — merkezi yıkarsan şirket bir sonraki en eski
binaya taşınıyor.

**"Rakip seni geçince hırslanasın."** Sıralama üst barda "4." diye duran
bir sayıydı; geçildiğin an hiçbir şey olmuyordu. Artık bir olay: kimin
geçtiği, aradaki fark ve elinde senden kaç bina fazla olduğu. Geri
aldığında da bir olay — yalnızca kötü haberi vermek oyuncuyu
cezalandırırdı.

Rakiplerin bugüne kadar `ceoId`'si null'dı: adları, renkleri, karakter
tarifleri vardı ama **bir yüzleri yoktu**. Dördüne de portre ve CEO adı
verildi. `ceoId` üzerinden değil ayrı bir alanla, çünkü CEO tanımları
oyuncunun perk'lerini de taşıyor — rakiplere ceoId vermek onlara görünmez
avantaj dağıtmak olurdu. Yüz var, avantaj yok.

Yol boyunca küçük bir ders: olay metni her zaman bina sayısını yazıyordu
ve sondajda *"Nova Holding 0 binayla çalışıyor"* çıktı. **Bir karşılaştırma
ancak karşılaştırılacak bir şey varsa bilgi taşır**; cümle koşullu hâle
geldi.

### Tur 12 — Kambiyo · PR #21

Rapor: *"her şey klasik yapım diye bağırıyor; modern ve elit bir çerçeve
istiyorum."* Yeni dil üç şeyi YAPMAMAKTAN kuruluyor: yuvarlaklık yok
(31 sabit köşe sıfırlandı), gölge yok (katmanlar kılcal çizgiyle),
renkli vurgu yok (vurgu mürekkebin kendisi; renk yalnızca anlamda —
yükseliş, düşüş, uyarı — ve 3B sahnenin kimlik renkleriyle çakışmıyor).
Denetimler bölmeli ızgara; tipografi Archivo + Martian Mono (mono
yalnızca alt alta gelen rakamlarda), bütçe 112 → 107 KB.

### Tur 13 — Derinlik: kaybedilebilir ve mevsimli oyun

Rapor: *"oyun bir süre sonra tekrara düşüp sıkıcı hale gelebilir."*
Teşhis dörttü: ana fiil (parsel al-kur) haritayla birlikte tükeniyor,
kaybetme ihtimali yok (benchmark: batan 0/5), rakipler sana bir şey
yapmıyor, yeni fiil gelmiyor. Bu tur üçünü kapattı:

- **Rakip ölçeklemesi** — profil kataloğu 4 → 8 (tech doktrini ilk kez
  sahada), `npcCount` parsel sayısından türüyor. 3×3 varsayılan birebir
  aynı (4 rakip); 5×5'te 8 rakip, erken açık %56 → %38.
- **Çift yönlü borsa** — rakipler zayıf şirketlerin (oyuncu dahil)
  hissesini topluyor; %10/%25/%40 eşiklerinde baskıncının yüzüyle uyarı;
  %50'de OYUN BİTİYOR (şirket silinmiyor, takvim duruyor, ekran iniyor).
  Savunma: geri alım — hazineye çekilen hisse dolaşımdan düşer; rakipler
  de aynı kalkanı kullanıyor. Boştaki oyuncu 543. günde kaybediyor;
  güçlü oyuncu (benchmark 1,48) hedef olmuyor — zayıfa vurulur.
- **Dönemler** — beş makro mevsim (200-260 gün), olaylarla aynı çarpan
  hattı, kapanış 20 gün önceden bildiriliyor. İklim DIŞSAL: tohum+güne
  bağlı zar — sonra aynı ilke kısa olaylara da uygulandı.
- **Sözleşmeler** — belediyeden süreli hedef (inşaat / pazar payı),
  teslimatta ödül, süre aşımında cayma bedeli; teklif çipten kabul
  ediliyor, ret bedava.

Tur boyunca üç ölçüm dersi ve bir ürün hatası:

1. **Deney, ölçtüğü değişkeni kilitliyordu** — constraint deneyi
   `npcCount: 4` sabitliyordu; kaldırılınca 5×5 gerçeği çıktı.
2. **"Ayrı bütçe" yorumu yanlıştı, tempo ölçümden çıktı** — baskın 7
   günlük karar kapısındayken tek hedefi yutmak 500+ gün sürüyor,
   oyuncuya baskı hiç ulaşmıyordu. Zar günlük oldu.
3. **İklim dışsal olmalı** — dönemler ve olaylar paylaşılan rng'den
   zamanlanırken eşli deneylerin kolları farklı fırtınalar yaşıyordu;
   zincir A/B'si 3/3'ten 1/3'e düşüp geri geldi. Ayrıca kuyruk penceresi
   geriye değil İLERİ uzatıldı (440-560) — Tur 8'in horizon dersi.
4. **Hazine mirası** — yutulan şirketin kendi hissesi "portföy" diye
   devralana geçiyor, devralan ölü şirketin hissedarı kalıyordu. Geri
   alım savunması bu yolu açmıştı; denge kontrolü yakaladı (player:350).

### Tur 14 · A — Kademeli imar: arazi kıtlığı yenileniyor

Tur 13'ün kapatamadığı dördüncü teşhis: ana fiil (parsel al-kur)
haritayla birlikte tükeniyor. Haritayı büyütmek çözüm değil — büyük
harita ilk günden bol arsa demek, kıtlık hiç yaşanmıyor. Kademeli imar
ikisini birden veriyor:

- **Köşe bölgeler kilitli başlıyor** — düşük nüfuslu köy (%32), seyrek
  doku, iskontolu arsa (×0,55). Sırayla 130/260/390/520. günlerde imara
  açılıyorlar; sıra tohumdan, günler sabit (dışsal iklim ilkesi: eşli
  deneyler eşli kalır).
- **Tek kapı** — `isDistrictOpen` kontrolü `purchaseBlocker`'da; oyuncu,
  NPC, ihale ve sözleşme üreticisi aynı kapıdan geçiyor. 560 günlük
  koşuda 0 ihlal.
- **Açılış bir olay** — 30 gün önceden "imar planı açıklandı" duyurusu,
  açılış günü haber + göç rampası (köy ~95 günde şehir tabanına).
  Zeminde kilitli bölge her lenste kırsal yeşil.
- **Laboratuvar kapısı** — `districtUnlocks: false` eski dünyayı rng
  tüketimi dahil birebir geri getiriyor; zincir kalibrasyonu gibi "Tur 1
  kimliği" iddialı ölçümler o sabit zeminde koşuyor.

Üç bulgu: (1) `bestPlotFor` "en ucuz parseli" ararken iskontolu kilitli
limanı seçiyor, her zincir kartı alınamaz hamle öneriyordu — üç tohumda
0 rakip zinciri; kilit filtresiyle A/B **+%30, 3/3**'e çıktı (kıt sanayi
arazisi zincirin değerini artırdı). (2) İhale sayacı gibi kasıtlı fakir
oyunculu senaryolar baskında yutulup takvimi donduruyor — bu tür izole
ölçümler artık `flags.raids = false` ile koşuyor. (3) Vekil oyuncunun
repertuvarında devralma yoktu; dar şehirde boş parsel ~60. günde bitince
vekil dururken NPC'ler devralmayla büyüdü ve oyuncu/rakip oranı 0,20'ye
çöktü — ölçülen şey denge değil vekilin kör noktasıydı. Devralmayı
öğrenen vekille oran **1,86** (repertuvar farkı: yeni ürün sorusu §4.8'e
düştü).

### Tur 14 · B — Prosedürel kütle: siluet çeşitliliği

Rapor "binalar klasik yapım diye bağırıyor" demişti; seçilen yön hazır
model değil prosedürel zenginleştirme. Üç yeni öğe, üçü de MEVCUT üç
InstancedMesh'e ek örnek — **çizim çağrısı sabit** (örnek kapasitesi
gövde ×2, çatı ×5):

- **Kademe (setback)** — 1,6 birimden yüksek gövde iki bloğa ayrılıyor:
  alt geniş, üst dar (%66-80), arada teras kapağı. Teras aynı zamanda
  alt bloğun açığa çıkan üst yüzünü örtüyor (pencere dokusu o yüze de
  düşerdi — Tur 6'daki çatı kapağı dersinin devamı).
- **Korniş** — orta boy binaların ~%60'ında çatı altına ince bant.
- **Çatı ekipmanı** — yüksek yapılarda 1-2 klima/asansör kutusu.

Varyasyon zarı KONUMDAN türetiliyor (`x·151 + z·73` karması): kütle her
karede yeniden yerleştirildiği için durum taşımadan aynı binanın hep
aynı görünmesinin tek yolu kimliği koordinattan okumak. Köşe pahı
bilinçli atlandı: pahlı prizmanın açılı yüzlerinde pencere dokusu
yayılırdı; siluet çeşitliliğini kademe zaten veriyor.

### Tur 15 — Zincir kartına fırsat maliyeti freni (§4.8 kapandı)

Teşhis deneyi (`chain-scale-experiment.ts`, ünite tavanı kolları +
satın alma günlüğü) iki hipotezi öldürdü: 42 alımın HİÇBİRİNDE delta ≤ 0
ya da kötü geri ödeme tahmini yok. Yıkım ünitenin kendisinden değil,
17-55 günde dönen mağaza fırsatları dururken 5 günde bir 100-200 günlük
üniteye para bağlamanın bileşik maliyetinden geliyor. Ölçülen sağlıklı
sınır ~8-10 ünite.

Fren: karta `deferred` ("ertelendi") durumu — `premature`den ayrı, çünkü
farklı soruların cevabı (ölçek vs sıra). Kural: iyi bir mağaza fırsatı
(≤60g, GERÇEKTEN alınabilir parselli) varken iki ünite arasında en az
45 gün istenir. İlk ünite hiç frenlenmez; fırsat kuruyunca fren
kendiliğinden kalkar. Gerekçe metni pazarlık etmiyor: "aynı nakit
mağazada ~17 günde dönüyor, zincir sırası ~45 gün sonra."

Üç ölçüm dersi: (1) mutlak yasak denendi, ölçüm reddetti — ertelme hiç
kalkmıyor, ünite üç tohumda da 0'a iniyor, sistem ölüyor; (2) fren
NPC'lere de uygulanınca kalibre edilmiş rakip üretimi düşüp A/B'yi
−%7'ye indirdi — fren bir OYUNCU tavsiye politikası, rakipler zaten
iştah kapılarıyla sınırlı; (3) doktrin ayrışması kontrolünün `min(x,3)`
şapkası 3/6 ile 3/4'ü aynı hücreye ezip gerçek ayrışmayı silmişti —
enstrüman yine sinyalin önündeydi. Frenle sınırsız kol kendiliğinden
7-11 ünitede duruyor; 560g kuyruğunda iki tohumda +%15/+%19, birinde
başa baş. Benchmark'ın 360g'lük zincir satırları frenle EKSİ okur —
ufuk dersi: fren geç oyunu optimize ediyor, 360. gün penceresi olgun
temposunu henüz görmüyor (gerçek ölçü 560g deneyi).

### Tur 16 — Şehir oyunla birlikte gelişiyor

Rapor: *"en başta her yer boş olsa da sonra bazı yerler gelişse, üstelik
apartmanlar gökdelenler çok önce az katlı olsa"* ve *"bölgeler tam
anlaşılmıyor — fabrika, tarım, yaşam alanı ayrı tarzda olsa."*

**Kuruluş artık şehrin bugünü değil dünü.** Doku tablosu (olgun karışım)
yerinde duruyor ama her seçim `rootStructureOf` ile zincirin atasına
iniyor: merkezde rezidans yerine sıra evler, sanayide fabrika yerine
bostan. Yükseklik de aralığın yalnızca alt %25'inden geliyor. Üstüne
yoğunluk merkezden kenara düşüyor (%62 → %28), yani harita bir çekirdek
ve etrafında yapılaşmamış arazi olarak açılıyor.

**Üç hareket, tek basınç.** `runCityGrowthTick` üç gün arayla çalışıyor:
yayılma (boş parseller yapılaşır), yükselme (yapı kat kazanır), dönüşüm
(bostan → depo → fabrika, sıra ev → apartman → rezidans). Basınç iki
kaynaklı — zaman (şehir kendi başına ~900 günde olgunlaşır) ve nüfus
(oyuncunun ürettiği istihdam). İkincisi mekaniğin can alıcı yeri: şehir
oyuncuyla birlikte büyüyor. Zar DIŞSAL (tohum+gün), sınırlar sert:
kilitli bölge gelişmez, şirket parseline dokunulmaz, kamu yapısı
üretilmez (park satılmaz — bir gecede parsel kaybı olurdu) ve bölgede
dört boş parselden azı kalmışsa şehir durur.

**Kıtlık kaybolmadı, ZAMANA yayıldı.** Gün 0'da arazi bol; şehir ve
rakipler onu yiyor. Yeni baskı bu: bugün almadığın parsele yarın bina
dikilir ve primli devralman gerekir. Statik kıtlık yerine ilerleyen
kıtlık.

**Bölge kimliği artık silüette.** Kütleye altı form geldi — kule
(kademeli), blok (kornişli), ev (beşik çatılı), hangar (geniş, bacalı),
tarla (karık şeritli), düzlük (park/meydan). Oyuncu binaları formunu
ROLDEN alıyor: `extract` → tarla, `process`/`logistics` → hangar,
`rental` → kule/blok. Yirmi altı bina tanımına elle form yazmak aynı
gerçeği ikinci kez yazmak olurdu. Altı formun tamamı MEVCUT üç
InstancedMesh'i paylaşıyor: çizim çağrısı sabit.

Ölçüm: gün 0'da 101 yapı · ort. yükseklik 0,46 · silüet {ev, tarla};
gün 700'de 162 yapı · 0,99 · {ev, tarla, blok, hangar, kule}.

Üç ölçüm dersi:

1. **Payda yanlışsa sistem sessizce kapanır.** Yayılma hedefi ilk sürümde
   şirket parsellerini de "gelişmiş" sayıyordu; rakipler ilk 120 günde
   58 parsel kapatınca hedef zaten aşılıyor ve şehir TEK yapı bile
   eklemiyordu (87 → 87). Payda "şehrin kendi arazisi" olunca hareket
   geri geldi (87 → 181).
2. **Pencereyi uzatmak rejimi değiştirebilir.** Zincir A/B'si bir
   tohumda kırılınca ufuk 900 güne çıkarıldı ve üç tohumda da eksiye
   döndü: oyuncu 28-46 M ₺'ye çıkıp NAKİT KISITLI rejimden BOL NAKİT
   rejimine geçmişti — benchmark'ın yıllardır yazdığı satırın aynısı.
   `districtUnlocks:false` de aynı tuzak: kilitsiz harita araziyi
   bollaştırıp aynı rejime düşürüyor. Doğru düzeltme pencerede değil
   kontroldeydi: *kurulamamış bir zincir ölçülemez* — sanayisi geç
   açılan tohum artık adıyla ölçüm dışı yazılıyor.
3. **Kontrol iki aktörü tek sayıda toplamamalı.** "Hiçbir bölge
   tıkanmasın" kontrolü kırıldı ama kırdığı şey şehir değil rakiplerdi
   (geç oyun olgunlaşması, §4.1'den beri bilinen). Soru daraltıldı:
   şehir boş parsel tabanının altına inerken yapı dikiyor mu? 700 günde
   sıfır ihlal.

### Tur 17 — Değerlendirme turu: düzeltmeler, iyileştirmeler, üç yenilik · PR #23

Baştan sona değerlendirmenin aksiyon listesi tek turda. En zayıf not
"uzun vadeli eğlence" (kaybetme vardı, kazanma yoktu; geç oyun
tenhalaşıyordu), ikincisi "teknik güvence" (sahte yeşil test, CI yok).

**Düzeltmeler.**

- *D1 · Dışa aktarma dürüst.* "İndirildi" yalnızca gerçekten indiyse;
  yayınlanmış sayfada barındırıcının `downloads` yeteneği, olmazsa pano,
  o da olmazsa açık bir "engelli" ve her yerde çalışan metinle aktarım.
- *D2 · `pnpm test` gerçek.* Eski komut var olmayan dosyaları arıyor ve
  sıfır testle "geçti" diyordu. Koşucu artık her `*.test.ts`'i esbuild
  ile paketleyip `node --test`'e veriyor; dosya yoksa kırmızı. 68 test:
  rng sözleşmesi, imar kapısı, basınç tavanı, kademeler, belirlenimcilik,
  kayıt göçleri, hedefler, gündem, meclis, girişler, lig tekrarı. PR #21
  ve #22'de botların yakaladığı iki hata testle korunuyor.
- *D3 · CI.* Her PR'da tip + test + denge + paket ve tarayıcıda duman
  oynanışı; main'de tam oynanış.
- *D4 · Rakip zararlı şubeyi kapatıyor.* Ölçüm: oyuncu baskısında 900.
  günde 21 zararda rakip mağazası, 14'ü 60 gündür kâr görmemiş. 30 günlük
  kâr eğilimi + 120 gün yaş + bakımın %5'i taban; 180 gün aynı yere aynı
  tür yok. Süreğen zararlı 14 → 0.
- *D5 · Test vekili tek kopya* (`test/proxy.ts`), ölü kod silindi. Denge
  çıktısı bayt bayt aynı.

**İyileştirmeler.**

- *İ1 · Hedef merdiveni ve zafer.* On basamak (ilk dükkândan devralmaya);
  zafer = zorluğun hedef değeri ve bir numara, ya da bütün rakipleri
  devralmak. Zafer oyunu duraklatır ama bitirmez.
- *İ2 · Zorluk.* Rahat / Dengeli / Acımasız — sermaye, rakip cesareti,
  baskın ısınması ve tavanı, zafer hedefi. Görünmez bonus yok; farklar
  kurulum ekranında yazılı.
- *İ3 · Yeni rakip girişi.* Devralmayla boşalan koltuğa 45 gün sonra
  (önce haber) katalogdan yeni bir kişilik; bir yıl kurucu kilidi.
- *İ4 · Olay yerine git.* Haberler yer taşıyor; "Git" kamerayı kaydırıp
  kareyi seçiyor.
- *İ5 · Gündem şeridi.* `agenda()` kalemleri aciliyetle sıralıyor (baskın,
  sözleşme, ihale, imar geri sayımı, meclis, lig, olay, dönem, hedef).
- *İ6 · Hızlı geri bildirim.* `pnpm playtest:smoke` (~2,5 dk), denge
  bölüm seçimi (`pnpm balance imar`) ve bölüm süreleri; paket three /
  react / oyun parçalarına bölündü, tek dosya ayrı paketten.

**Yenilikler.**

- *Y1 · Belediye meclisi.* 120. günden itibaren her 90 günde iki önerge
  (imarı öne çekme, kategori vergisi/teşviki, metro, ruhsat), 20 gün lobi.
  Destek = meclisin eğilimi (dışsal zar) + √ azalan lobi kayması (±%30).
  Rakipler çıkarına göre bağış yapıyor, bağışlar kamuya açık, sonuç
  haberi kimin kaç puan ittiğini yazıyor.
- *Y2 · Tohum Ligi.* Haftanın şehri herkes için aynı, 360 gün. Komut
  günlüğü + belirlenimcilik = **skor tekrarla doğrulanıyor**: koşu kodu
  herhangi bir tarayıcıda baştan oynanıp aynı skoru bulmalı. Tablo
  yayınlanmış sayfada paylaşılan (`db` + `user`), en iyi koşu hayalet
  olarak yarışıyor.
- *Y3 · Ses manzarası.* Dosyasız, tamamen üretilmiş: nüfusla uğultu,
  binalarla trafik, gece cırcır böcekleri, baskınla gerilim; kasa,
  inşaat, kötü haber, tokmak. İlk dokunuşa kadar sessiz.

Kalibrasyon (bilgili vekil 5 günde bir, yavaş vekil 15 günde bir ve
savunmasız; bilgili tohum 1/7/42, yavaş tohum 1/7/42/101/202):

| | bilgili zafer günü | savunmasız yavaş |
|---|---|---|
| Rahat | 443–467 | ayakta |
| Dengeli | 608–779 | 589–835'te düşüyor (5'te 4) |
| Acımasız | ~900 | 432–548'de düşüyor (5'te 5) |

Dört ölçüm dersi:

1. **Bir sistem başka bir sistemin gizli hatasını açığa çıkarabilir.**
   Yeni rakip girişi ilk ölçümde oyunu kaybedilemez yaptı (savunmasız
   oyuncu 5 tohumun 4'ünde ayakta). Girişi zayıflatmak, kilitlemek,
   sermayesini değiştirmek hiçbir şey değiştirmedi — sebep giriş değil,
   baskındaydı: üç baskıncı küçük bir rakibin hisselerinin TAMAMINI
   bölüşüyor, kimse %50'yi geçemiyor ve "başladığı işi bitirir" kuralıyla
   400 gün aynı hedefe çakılı kalıyordu. Girişler bu kilidi sıklaştırdı.
   Düzeltme bir satır: hissesi kalmamış şirket hedef değil.
2. **Aşırı düzeltme de bir ölçüm sonucu.** "Cesur avcı en büyük avı
   seçer" denemesi savunmasız oyuncuyu 300. günde düşürdü — eğri
   bozuldu, geri alındı. Önce mekanizmayı bul, sonra düzelt.
3. **Eşli deneyler her yapısal ayrışma kaynağını kapatmalı.** Meclis
   açıkken zincir A/B'si +%29'dan +%1'e indi: kollar arasında farklı
   vergi kararları geçiyordu. Dönemler ve baskınlarla aynı aile; meclis
   de A/B'de kapalı.
4. **Bir kontrolü geçirmek için kuralı değil kontrolü düzeltmek bazen
   doğru, bazen değil.** Vergi lobisi kontrolü 3/4'te kaldı — rakibin
   nakdi bağışa yetmiyordu (doğru davranış), kontrol "çıkarı VE imkânı
   olan" diye daraltıldı. Ama sanayi dokusunu yutan ruhsat kolaylığı
   kontrolün değil kuralın hatasıydı: her rakip lehte olduğu için her
   çıktığında geçiyordu; %8 / 90 gün ve meclisin isteksizliğiyle düzeldi.

### Tur 18 — Sendika ve kredi ürünleri

§4.9'un ilk iki kalemi. Önce ölçüldü (6 koşu, 720 gün):

- **Kimse borçlanmıyordu.** Vekil nakdinin en fazla yarısını harcıyor;
  240. günde ~2 M ₺ nakitle oturuyor. Krediye anlam veren tek yer erken
  oyun: ilk 250 bin ₺'yi büyütmek bileşik büyümeyi öne çeker.
- **Borç hiç geri ödenmiyordu** (hata). Kasa eksiye düşünce fark borca
  yazılıyor, %8 faiz işliyor, ama kasaya para girse de borç kapanmıyordu.
- **Ücret giderin %12–15'i** (SMM ~%50, bakım ~%8) ve sabit bir satırdı.
  Sanayi bölgelerinde iş/nüfus oranı 0,5–0,74'e çıkıyor, bunun bir bedeli
  yoktu. Oyuncu 360. günde ~2.000, 900. günde ~4.400 kişi çalıştırıyor.

Sonuç: zam tek başına hafif bir etki. Oyunu değiştiren grev ve birikerek
büyüyen toplu sözleşme. Kredi ise riski olmazsa erken oyunu önemsizleştirir.

**İşgücü.** Ücret tek kapıdan hesaplanıyor (`systems/labor.wageFor`):
defter, yatırım tahmini ve zincir kartı aynı rakamı görüyor. Üç çarpan
var:

- *Bölge ücret endeksi.* İş/nüfus oranı 0,25'i geçtikçe ×1,35'e kadar
  çıkıyor ve 30 günlük ortalamayla yürüyor. Sanayi kümesi pahalı.
- *Ücret politikası* (şirket geneli, 30 gün soğuma). Düşük: ücret ×0,88,
  mağaza hizmeti −%4, sendika baskısı ×1,4. Yüksek: ücret ×1,10, hizmet
  +%4, baskı ×0,5. Yüksek ücretin uzlaşma güveni 90 gün tutulunca işliyor.
- *Toplu sözleşme* birikimi.

**Sendika.** 150 çalışanın altında sendika yok. Baskı her gün görünür
biçimde doluyor ve %100'e ulaşınca talep masaya geliyor: %5, artı kâr
marjına göre %4'e kadar, ±%1 zar. Cevap için 10 gün var; süre dolarsa Ret
sayılıyor.

- *Kabul:* talep olduğu gibi sözleşmeye giriyor.
- *Uzlaşma:* talebin yarısı teklif ediliyor. Tutma ihtimali %60; düşük
  ücret −20 puan, yüksek ücret +15 puan, son bir yıldaki Ret −15 puan.
- *Ret:* politikaya göre %50–90 grev ihtimali.

Grev 12 gün sürüyor. Mağazalar ve fabrikalar %35 kapasitede çalışıyor,
ücret de %35 ödeniyor. Grev bitince talebin %60'ı sözleşmeye giriyor.
Zar dışsal (tohum ^ gün ^ şirket).

Rakipler doktrinle cevap veriyor: fiyat kırıcı düşük ücret + Ret,
premium ve teknoloji yüksek ücret + Kabul, genişlemeci ve ev sahibi
piyasa ücreti + Uzlaşma. Rakip grevi yeriyle haber oluyor.

**Banka.**

- *Kredili hesap otomatik.* Kasaya giren para önce onu kapatıyor (hata
  düzeltmesi, banka ürünleri kapalıyken de). Faizi taban %8 + %10 + not
  farkı.
- *Vadeli kredi* 180, 360 ya da 720 gün, sabit günlük taksitle (anüite).
  %1 dosya masrafı, iki başvuru arasında 30 gün.
- *Arsa teminatlı kredi* arsa değerinin %60'ına kadar, yarım not farkı
  −%1,5 faizle. Rehinli arsa satılamıyor.
- *Not A–D* kaldıraçtan ve son ~90 günün kredili hesap günlerinden
  hesaplanıyor. Yükselmek için eşiğin %90'ı gerekiyor (histerezis). Not
  limiti belirliyor: A brüt varlığın %30'u, D'de yeni kredi yok; taban
  limit 150 bin ₺, sert tavan %45 kaldıraç.
- *Muacceliyet.* Not D'ye düşerse kalan anapara kredili hesaba geçiyor.
- *İhtar ve haciz.* Kredili hesap 15 gün limit üstünde kalırsa banka
  satıyor: önce hisseler, sonra boş arsalar, sonra en çok zarar eden
  binalar, en son teminat. Not 180 gün D kalıyor.
- *Rakipler doktrinle borçlanıyor:* genişlemeci vadeli, ev sahibi
  teminatlı, fiyat kırıcı hiç. Yalnızca A/B notunda ve nakit sıkışıkken
  borçlanıyorlar, çektikleri kredi haber oluyor.

**Arayüz.** Şirket paneline iki bölüm eklendi:

- *Banka:* not rozeti, kaldıraç, kredili hesap ve limiti, krediler
  tablosu (erken kapatma), kredi formu. Form türü, vadeyi ve tutarı
  seçtiriyor; günlük taksiti ve toplam faizi gösteriyor.
- *İşgücü:* çalışan sayısı, ücret, piyasa ve sözleşme çarpanı,
  politika seçimi, baskı göstergesi, talep kartı. Kartta her düğmenin
  yanında sonucu yazıyor: tutma ihtimali, grev ihtimali.

Gündem şeridine sendika talebi, grev ve dolmak üzere olan baskı eklendi,
banka ihtarı ve kredili hesap da. Süresi dolan talep ve ihtar acil kalem.
Yardım paneline iki madde eklendi.

Kalibrasyon (vekil 5 günde bir):

| | Değer |
|---|---|
| İlk sendika talebi (tohum 1/7) | 404–410. gün |
| 720 günde sözleşme · ödenen ücret / Tur 17 formülü | ×1,09–1,10 · **×1,04–1,08** |
| Bölge endeksi en çok | ×1,14–1,16 |
| Ret kolunda grev · grevde mağaza doluluğu | 24 gün · %35 |
| Ücret politikası, 720. gün (3 tohum ort.) | Piyasa 101,2 · Yüksek 101,0 · Düşük 97,2 M ₺ |
| Kredi, aceleci vekil: 180. gün → 720. gün farkı | +%19…51 → **+%3…21** |
| Fiyat savaşı (90. günden ×0,6), 360. gün | borçlu −304/−363 B ₺, 0 arsa · borçsuz +207/+245 B ₺, 1–3 arsa |
| Zafer günü Rahat / Dengeli / Acımasız (ort.) | 478 / 704 / 1028 (Tur 17: ~455 / ~690 / ~900) |

İşgücü ve banka birlikte vekilin 720. gün değerini ortalama %3 düşürüyor
(104,8 → 101,2 M ₺; tohuma göre %0–9). Zafer biraz geç geliyor ama
kademeler sıralı. Savunmasız yavaş oyuncu Dengeli'de ve Acımasız'da hâlâ
düşüyor.

Dört ölçüm dersi:

1. **Kontrol kolu olmadan kıyas iki değişkenli kalıyor.** İlk ölçümde
   limitler gevşekti (A %50, tavan %70). Her beş günde limitin boşluğunu
   çekip üç kat hızlı harcayan "kaldıraç" vekili normal vekilden %36
   öndeydi ve rakiplerin toplam değeri yarıya inmişti; kredi baskın
   strateji gibi görünüyordu. Aynı hızda harcayan borçsuz kontrol kolu
   tek başına 137,6 M ₺'ye çıktı, farkın büyük kısmı harcama hızıydı.
   Limitler yine de sıkılaştırıldı ve dosya masrafı ile başvuru soğuması
   eklendi. Son ölçümde borçlu kol 180. günde %19–51 önde, 720. günde
   %3–21: kredi tempoyu öne çekiyor, tavanı değil.
2. **Verimsizlik zarar değil.** Kredinin riskini göstermek için kurulan
   "kötü yatırımcı" (tahmine bakmadan en pahalı mağaza, rastgele bölge)
   borçlu ve borçsuz kolu ayıramadı (−%12, +%19, −%16). O vekil zarar
   etmiyor, yalnızca daha az kazanıyor. Risk ancak nakit akışı eksiye
   dönünce ortaya çıkıyor. Ama maliyetin altında fiyat savaşında da ilk
   tasarım iki kolu birlikte sıfırlıyordu, çünkü limitler taksiti küçük
   tutuyor. Krediye özgü riski muacceliyet maddesi kurdu.
3. **İki yönlü bir seçenek iki yönde de kaybediyorsa seçim değildir.**
   Ücret politikasının ilk ayarında (yüksek ×1,15 / hizmet +%3) hem
   düşük hem yüksek ücret piyasanın gerisindeydi. Piyasa ücreti baskındı.
   Yüksek ×1,10 / +%4 ile yüksek ücret ortalamada başa baş, tohuma göre
   ±%5 (gerçek bir takas). Düşük ücret mağaza ağırlıklı vekilde hâlâ %4
   geride; uzlaşma tutmadığı için grevle ödüyor. Üretim ağırlıklı şirketin
   seçeneği o.
4. **Yeni sistem eski kontrollerin özdeşliğini kırar.** "Temettü para
   yaratmıyor" kontrolü şehir geneli nakit değişimini kârla eşliyordu.
   Taksitin anaparası kâra girmeden kasadan çıkıyor, kontrol artık
   *nakit − borç*'a bakıyor. Zincir A/B'si de işgücü ve banka açıkken iki
   tohumu ölçüm dışına düşürdü: grev kesikli bir şok, rakip haczi farklı
   bir rakip manzarası kuruyor. Dönemler, baskınlar ve meclisle aynı
   aile; ikisi de A/B'de kapalı.

---

## 3. Ölçülen durum

`pnpm bench` çıktısından (360 gün, 3 tohum):

### Büyüme ve rekabet

| | Değer |
|---|---|
| Oyuncu / rakip oranı | **1,99** — Tur 7 öncesi 0,76 idi |
| Oyuncu bina sayısı | 78 |
| Günlük kâr | 244 B ₺ |
| Batan şirket | **0/4** |

Not: vekil Tur 14'te devralmayı öğrendi (boş parsel bitince mevcut
yapıyı primli alıyor — oyunun kendi öğretisi). Önceki satırlarla kıyasta
bu repertuvar farkının payı var.

### Doygunluk (Tur 8 sonrası)

| Karşılanmayan talep | 360. gün | 700. gün | 1200. gün |
|---|---|---|---|
| Tur 7 öncesi | %35 | %38 | %48 |
| Tur 7 sonu | %20 | %34 | %33 |
| Tur 8 | %30 | **%12** | **%13** |
| Tur 14 | %10 | **%0** | **%0** |
| **Tur 16** | %11 | **%1** | **%0** |

Okunması gereken şey sayı değil **yön**. İlk iki satırda boş talep
zamanla artıyor: şehir büyüdükçe geri kalıyor. Son ikisinde azalıyor —
erken oyunda fırsat bol, geç oyunda şehir doyuyor. Tur 14 satırındaki
düşüşün iki kaynağı var: kademeli imar erken şehri küçük tuttuğu için
360. günde kapasite talebe kolay yetişiyor, ve devralmayı öğrenen vekil
geç oyunda talebi süpürüyor. Doluluk %66'ya indiği için çekicilik
rekabeti (kalite/marka/fiyat) canlı.

### Stratejilerin karşılığı (aynı tohum, tek değişken)

| Strateji | Kâr etkisi | Geri ödeme |
|---|---|---|
| Ar-Ge · 4 mağaza | %4 | 970 gün *(erken)* |
| Ar-Ge · 8 mağaza | **%14** | 141 gün |
| Pazarlama · 8 mağaza | **%11** | 111 gün |
| Fiyatı %25 kırmak | **%17 hacim** | — |
| Zincir · normal nakit | −%9 *(360g penceresi)* | ~190 gün |
| Zincir · bol nakit (20 M ₺) | −%4 *(360g penceresi)* | — |

Son iki satır ayrı duruyor çünkü farkları bir bulgu: sınırsız devralma
çağında parseli outlet'le doldurmak zinciri geçiyor. **Zincir bir nakit
kısıtı oyunu** — arazi kısıtlı dünyada (dondurulmuş A/B) +%30, 3/3.
Eksili satırlar 360 günlük pencerenin eseri: Tur 15 freni zinciri geç
oyun temposuna bağladı; 560g deneyinde frenli kol iki tohumda taban
çizgisinin +%15/+%19 üstünde, birinde başa baş (Tur 15 bölümündeki
ufuk dersi).

### Kalibrasyon bantları

| | Değer |
|---|---|
| Outlet geri ödemesi | 17–55 gün |
| Zincir geri ödemesi | 190 gün |
| Devralma maliyeti | **0,76× net değer** |

### Sağlık

| | Değer |
|---|---|
| Determinizm | birebir |
| Simülasyon hızı | ~570 gün/sn |
| Birim testi | **93 test** (`pnpm test`) |
| Denge testi | **244 kontrol, hepsi geçiyor** (15 bölüm, süreleriyle; ~11 dk) |
| Tarayıcı testi | **252 kontrol**, 0 konsol hatası; duman koşusu 81 |
| CI | her PR'da tip + test + denge + paket + duman oynanışı |
| Kapsam | 26 bina · 22 ürün · 7 kategori · 8 rakip profili · 10 şehir yapısı (6 siluet) |

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

### 4.2 ~~Rakipler oyuncunun hissesini toplamıyor~~ — Tur 13'te kapandı

"Oyuncunun haberi olmadan kaybetmesi" endişesi üç katmanla çözüldü:
eşik uyarıları (%10/%25/%40, baskıncının yüzüyle), günlük alım tavanı
(%3,5 — baskın dalga dalga gelir, sıçramaz) ve geri alım savunması.
Eşik aşılırsa şirket silinmiyor; takvim duruyor, oyun sonu ekranı
iniyor, son duruma bakılabiliyor.

### 4.3 Taban bina kalitesi fiyata dönmüyor

Prim gücü yalnızca Ar-Ge ve pazarlamadan geliyor. Bir süpermarket
bakkaldan kaliteli olmasına rağmen aynı fiyattan satıyor
(`REKABET-TASARIMI.md` §3.4). Genel model daha doğru olurdu ama Tur 1'in
bütün kalibrasyonunu yeniden yapmayı gerektirir.

### 4.4 Kapasitenin mekânsal dağılımı

Bir outlet kendi bölgesine tam, komşulara kısmi (0,30 / 0,14) erişiyor;
uzak bölgenin talebine kimse ulaşamıyor. Bu bir arıza değil coğrafya,
ama "boş talep" sayısını okurken akılda tutulmalı.

### 4.5 Daha büyük şehrin önkoşulu: rakip sayısı — ölçekleme Tur 13'te geldi

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

Rakip ölçeklemesi Tur 13'te kapandı: profil kataloğu sekize çıktı,
`npcCount` parselden türüyor, 5×5'te erken açık %56 → %38. Kademeli
bölge açma Tur 14'te geldi: köşeler 130-520. günlerde sırayla imara
açılıyor, arazi kıtlığı dört kez yenileniyor. Varsayılan harita hâlâ
3×3 — kalan sıra: **5×5 → çoklu şehir.** (5×5'te kilit deseni aynı:
köşeler; açılış takvimi büyük haritada yeniden ölçülmeli.)

### 4.6 Daha küçük kalemler

- `estimateInvestment` depo, Ar-Ge ve pazarlama için `direct: false`
  dönüyor; bu binaların geri ödemesi yapı menüsünde görünmüyor
- Devralınan şirketin yerine yenisi gelmiyor; geç oyunda rakip sayısı
  azalıyor
- İhale yalnızca boş parsel için; dolu parsel ihalesi yok

### 4.7 Şehrin oyuncuyu içine alması — Tur 9'da başladı, bitmedi

Rapor üç şey istiyordu; Tur 9 birincisini yaptı:

| istenen | tur | durum |
|---|---|---|
| şehirden sana akan bir şey olsun | 9 | **yapıldı** — müşteri akışı |
| kurduğun imparatorluk "senin" olsun | 11 | **yapıldı** — genel merkez işareti ve rozeti |
| rakip seni geçince hırslanasın | 11 | **yapıldı** — geçilme olayı, rakibin yüzü ve aradaki fark |

Üçü de kapandı. Geriye kalan, aynı damardaki daha küçük kalemler: bölge
liderliğini kaybetme anı henüz bir olay değil (yalnızca net değer
sıralaması izleniyor), ve devralınan şirketin yerine yenisi gelmediği
için geç oyunda rakip sayısı azalıyor.

### 4.8 ~~Zincir kartı ölçekte fren bilmiyor~~ — Tur 15'te kapandı

Kart artık fırsat maliyeti freni taşıyor: iyi mağaza fırsatı varken
üniteler 45 günlük tempoya bağlanıyor (`deferred` durumu — ölçek uyarısı
`premature`den ayrı). Teşhis, tasarım ve üç ölçüm dersi Tur 15
bölümünde. Regresyon A/B'si dondurulmuş düzeneğinde (+%30, 3/3);
tempolu tavsiyenin kendi ölçüsü `chain-scale-experiment.ts`.

---

### 4.9 Özgün plandan kalanlar (Tur 17 değerlendirmesi, Tur 18 güncellemesi)

Tur 17 meclisle üç eksik kalemi kapattı: **lobicilik/politika** (meclis),
**vergi** (kategori vergisi ve teşviki, süreli) ve **altyapı** (metro —
nüfus tavanı ve arsa değeri). Hâlâ açık olanlar:

- ~~**Sendika / işgücü**~~ — Tur 18'de kapandı: işgücü piyasası, ücret
  politikası, sendika talebi, grev.
- ~~**Kredi ürünleri**~~ — Tur 18'de kapandı: kredili hesap, vadeli ve
  teminatlı kredi, not, muacceliyet, haciz. Tahvil (şirketin borç
  senedi ihracı) yok; halka arzla birlikte düşünülmeli.
- **Halka arz:** hisse alım-satımı ve devralma var, oyuncunun kendi
  hisse ihracı (sermaye artırımı) yok — kısmi.
- **Yerelleştirme:** arayüz metinleri bileşenlerin içinde (en az 133 sabit
  Türkçe dize); "yerelleştirmeye hazır" hedefi karşılanmadı. İlk adım
  metinleri bir sözlüğe çekmek olur; içerik paketindeki adlar zaten tek yerde.
- **Lig tablosunun güvenliği:** skorlar tekrarla doğrulanabiliyor ama
  doğrulama izleyicinin isteğine bağlı (her satırda "Doğrula"); tablo
  doğrulanmamış skoru da gösteriyor. Sunucu tarafında doğrulama bu
  mimaride yok — dürüst cümle "herkes doğrulayabilir", "doğrulanmış" değil.

## 5. Nasıl koşulur

```bash
pnpm typecheck       # altı paketin tamamı
pnpm test            # birim testleri — 93 test, test yoksa kırmızı
pnpm balance         # denge testi — 244 kontrol, geçti/kaldı (~11 dk)
pnpm balance meclis  # yalnızca adında "meclis" geçen bölümler
pnpm bench           # benchmark — sayıların kendisi
pnpm constraint      # kısıt deneyi — bağlayıcı kısıt hangisi?
pnpm land            # abonman oranı — geometri varyantları
pnpm playtest        # tarayıcı testi (build dahil), tam koşu ~16 dk
pnpm playtest:smoke  # duman koşusu ~3,5 dk — PR'da CI bunu koşar
node tools/build-single-file.mjs   # paylaşılan sayfa için tek HTML
pnpm dev             # oyunu aç
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
