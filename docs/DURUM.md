# Capital — Durum Raporu

> Bu dosya "neler bitti, neler kaldı" sorusunun tek cevabı. Sayılar
> `pnpm bench` çıktısından; iddialar `pnpm balance` ve `pnpm playtest`
> tarafından her koşuda doğrulanıyor.
>
> Son güncelleme: şema **v6**, 44 tur (Tur 33 denendi ve geri alındı; Tur 34 eski görünüme canlılık ekledi; Tur 35 arayüzü Lite'ın "Cam & Bulut" diline taşıdı; Tur 36 şehre ayrıntı kattı; Tur 37a geç oyuna yönetim yükü, servet vergisi ve kriz dönemleri getirdi; Tur 37b karar kartlarını ve rakip hikâyelerini ekledi; Tur 37c fırsat balonlarını ve aylık görev panosunu getirdi; Tur 37d canlı pazarı, şehir projesi ihalesini ve rakip konsorsiyumunu getirdi; Tur 38 değerlendirme turuydu: geç oyun hızı, gündem ve haber akışı, zorluk eğrisi; Tur 39a senaryo modunu getirdi: Kurtarma ve Krizin ortasında; Tur 39b Konsorsiyuma karşı, Zincir ustası ve Şehrin sponsoru senaryolarını ekledi; Tur 39c Büyük şehir fethi ve Holding: iki şehir ile listeyi yediye tamamladı; Tur 40 cila ve performans; Tur 41 başarımlar ve kariyer; Tur 42 açılışta gölgelendirici derlemesi; Tur 43 oyun içi akıcılık; Tur 44 değerlendirme turuydu: Türkçe sayı biçimi, yardımın kapsamı, haber akışı).

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
| Şirket kendi hissesini çıkaramıyordu, rakip 5. günde devralınabiliyordu | **19** | Halka arz ve sermaye artırımı (kurucu payı), tahvil, oyun başı rakiplere kurucu kilidi |

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

> Tur 35'te yerini Lite'ın "Cam & Bulut" dili aldı; aşağıya bakın.

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

### Tur 19 — Sermaye piyasası: halka arz, tahvil, kurucu kilidi

§4.9'un "halka arz" kalemi ve Tur 18'in bıraktığı tahvil. Önce ölçüldü
(720 gün, 3 tohum):

- **Prim:** oyuncunun hisse primi ilk 180 gün tavanda (×1,80), 720. günde
  ×1,1–1,2.
- **Baskın:** bilgili vekile hiç baskın yok. Yavaş ve savunmasız vekilin
  payı 450–650. günlerden itibaren %49'a kadar toplanıyor; 4 tohumun
  4'ünde devralınıyor, geri alımla 4'te 4 ayakta.
- **Nakit:** vekilin nakdi hiç sıkışmıyor.

**Tasarımın ilk sorusu: bedava para mı?** Net değer "nakit + varlık −
borç"tu ve kimin hisse tuttuğuna bakmıyordu. Bu formülle yeni hisse
satmak bedavaya nakit almak olurdu. O yüzden **kurucu payı** geldi:
ihraç edilen hisseler kurumsal yatırımcıların, net değer şirket
değerinin kurucuya düşen kısmı. Hiç ihraç yapmamış şirkette pay 1,
formül eskisiyle birebir aynı.

**Hisse adedi şirket başına.** 10.000 sabiti `sharesOutstanding` oldu.
Fiyat, dolaşım, kontrol eşiği, temettü, baskın tavanı (artık bir pay,
%3,5) ve arayüz aynı fonksiyondan okuyor. İki 700 günlük koşunun son
durumu bayt bayt aynı kaldı.

**Sermaye artırımı, ilki halka arz.**

- *Koşullar:* şirket değeri en az 1 M ₺; bir seferde en fazla mevcut
  adedin %25'i; fiyat piyasanın %10 altı; iki ihraç arasında 180 gün;
  kurucu payı %51'in altına inemez.
- *Yatırımcı payı dolaşımda değil:* kurumsal yatırımcı hisseyi elde
  tutuyor, baskıncı alamıyor. Kalkan bu kuraldan doğuyor.
- *Geri alım:* önce yatırımcı payını geri alıyor, kurucu payı büyüyor.
  (Tur 28'de değişti: geri alım artık serbest hisseden hazineye; bu kural
  baskın altındaki geri alımı ihraçtan sonra etkisiz bırakıyordu.)
- *Devralma:* devralan şirket, hedefin yatırımcılarını piyasa fiyatından
  nakde çeviriyor.
- *Form:* ihraç günü net değere etkisini gösteriyor. Piyasa primliyken
  artı, primsizken eksi.

**Tahvil** kredi sistemine üçüncü tür olarak eklendi:

- Yalnızca A/B notunda, en az 1 M ₺.
- Vade 360, 720 ya da 1080 gün. Kupon: taban faiz + not farkının %60'ı
  + vade primi; bankadan ucuz.
- Vade boyunca yalnızca kupon, anapara vadede tek seferde.
- *Vade duvarı:* 30 gün önce haber ve gündem kalemi; o gün kasada yoksa
  fark kredili hesaba geçiyor. Muacceliyet ve haciz ortak.

**Rakipler.** Genişlemeci ve teknoloji rakipler nadiren büyüme ihracı
yapıyor: piyasa onları primli fiyatlarken ve nakitleri sıkışıkken.
Premium ve teknoloji rakipler, bir baskıncı payı %30'u geçince ihraçla
savunuyor; diğerleri geri alımla.

**Kurucu kilidi oyun başı rakiplere.** Rakipler, baskın ısınması bitene
kadar (Dengeli'de 160. gün) kilitli. Sonradan gelen rakiplerde bir yıllık
kilit zaten vardı.

**Arayüz.**

- *Borsa paneli:* halka arz / sermaye artırımı formu (adet, fiyat,
  kasaya giren, kurucu payı öncesi ve sonrası, net değere bugünkü etki),
  rakip satırında kurucu kilidi ve kurumsal yatırımcı payı.
- *Banka formu:* tahvil seçeneği.
- *Gündem:* vadesi yaklaşan tahvil; kasa yetmiyorsa acil kalem.

Kalibrasyon (vekil 5 günde bir):

| | Sonuç |
|---|---|
| Erken halka arz (73–87. gün, %25), 720. gün | −%25 / −%23 / −%5 (ort. −%19) |
| İki ihraç | ort. −%31 |
| Geç ihraç (540. gün, prim ×1,2) | ort. −%5 |
| Aceleci vekil (nakdin %87,5'i) + halka arz, 900. gün | −%4 / −%14 / −%23 |
| Devralmacı vekil + halka arz sermayesi | değer zaferi 529–582 → 636–649. gün |
| Baskın: yavaş, savunmasız vekil (4 tohum) | savunmasız 0/4 · geri alım 4/4 (42–57 M ₺) · **ihraç 4/4 (57–67 M ₺)** |
| Devralmacı vekil, kilit öncesi → sonrası | ilk devralma 5. gün → 165. gün · tekel zaferi 130–235. gün → yok · değer zaferi 529–582. gün |

Beş ölçüm dersi:

1. **Ölçüm mekaniğin ne olduğunu değiştirdi.** Halka arz bir büyüme
   aracı olarak tasarlandı. Ölçüm büyümede her senaryoda kaybettirdiğini
   gösterdi: nakit bu ekonomide nadiren bağlayıcı, kalıcı ortaklık
   pahalı. İlk sürüm savunma olarak da işe yaramıyordu. Yeni hisseler
   dolaşıma giriyor, baskıncı onları da topluyordu; geri alımla birlikte
   kullanınca geri alımın tek başına verdiği sonuçtan kötüydü (4'te 3).
   Kurumsal yatırımcının payını elde tutması kuralıyla ihraç bir
   **kontrol aracı** oldu: geri alım nakit yakıyor, ihraç nakit getiriyor,
   bedeli kalıcı ortaklık. Form artı/eksi etkiyi gösteriyor; oyuncu
   tuzağa düşmeden karar verebiliyor.
2. **Yan ölçüm eski bir açığı buldu.** Halka arzın devralma sermayesi
   olarak işe yarayıp yaramadığını ölçen vekil Kilit Market'i 5. günde
   devraldı, tekel zaferine 130–235. günde ulaştı. Tur 4'ten beri oyun
   başı rakiplerde kilit yoktu; rakiplerin baskını ise 160. günden önce
   başlayamıyordu. "Herkes aynı kuralla" ilkesi oyuncu lehine
   çiğneniyordu. Kurucu kilidi bunu kapattı. Kalan asimetri §4.6'da:
   oyuncunun alımında günlük tavan yok.
3. **"Davranış aynı" iddiası bir özetle kanıtlanmalı.** Yeniden
   düzenlemeden önce ve sonra iki 700 günlük koşunun durum özeti
   karşılaştırıldı. İlk karşılaştırma farklı çıktı. Sebep kod değil,
   kayıttaki oluşturma zaman damgasıydı; onu dışarıda bırakınca bayt bayt
   aynı.
4. **Eşli deneyler aynı aileyi büyütüyor.** Rakip ihracı da kollar
   arasında farklı rakip manzarası kuruyor. Zincir A/B'sinde sermaye
   artırımı da kapalı: dönemler, baskınlar, meclis, işgücü ve banka gibi.
   Sabit varsayımlar da kırılıyor: iki devralma testi kontrol için sabit
   5.100 hisse alıyordu; ihraç yapmış rakipte bu %51 değil.
5. **Yeni sistem eski bir kontrolün körlüğünü açığa çıkardı.** Tarayıcı
   testi "geçilme" haberlerini akışın uzunluk farkından buluyordu. Akış 60
   kalemle sınırlı ve yeni sistemlerin haberleriyle o noktada doluyordu:
   uzunluk değişmiyor, yeni haber "yok" görünüyordu. Kontrol artık haber
   kimliğine bakıyor.

### Tur 20 — Devralma emri: herkes için aynı günlük tavan

§4.6'nın Tur 19'da yazılan kalemi. Rakiplerin baskını günde en fazla
%3,5 toplayabiliyordu (Dengeli; Rahat %2, Acımasız %4,5). Oyuncu ise bir
rakibin %51'ini tek tıkla alabiliyordu. Hedefin geri alım ve ihraç
savunması oyuncuya karşı hiç çalışmıyordu, çünkü tepki verecek bir günü
yoktu.

**Kural iki taraf için aynı.** Bir şirket başka bir şirketin hissesinden
günde en fazla zorluğun tavan payı kadar alır. Kendi hissesini geri
alırken de öyle; rakibin geri alımı zaten tavanlıydı. Tavan hisse adediyle
ölçekli: ihraç yapmış hedefte adet büyür, pay aynı kalır. Elle alım ve
emir aynı tavanı paylaşıyor.

**Devralma emri.**

- *Emir her gün alır.* Kontrol için gereken adedi (eşik %50'nin üstü) her
  gün o günkü hisse adedinden hesaplar. Emrin verildiği gün de alır.
- *Kasada işletme payı kalır:* beş günlük gider ya da 100 bin ₺, hangisi
  büyükse. Para yoksa emir bekler; haberi emir başına bir kez.
- *Hedef savunabilir.* %30'u görünce geri alım yapar, doktrini varsa
  ihraç eder. Rakibin oyuncuya karşı geri alımı ayda bir haber oluyor.
- *Dolaşım kontrole yetmezse emir düşer:* "X devralmayı savuşturdu".
  Rakipler hisse satmıyor, ihraç edilen hisse kurumsal yatırımcıda kalıyor;
  yani bu kalıcı. Toplanan pay temettü getirmeye devam ediyor.
- *Baştan reddedilen emir:* kilitli hedef, dolaşımı kontrole yetmeyen
  hedef, kendi şirketin.
- Devralma her zamanki gibi `runTakeoverTick`'te. Hedefe verilmiş emirler
  devir anında kapanıyor.

**Arayüz.**

- *Borsa satırı:* "Devral" düğmesinin yerine "Devralma emri · ~15 gün".
  Süren emrin satırında durum (kalan hisse, en az kaç gün, nakit bekliyor
  mu) ve iptal. Her satırda günlük tavan ve bugün kalan; "Al" ve "100 al"
  tavanla sınırlı.
- *Kendi hissen:* geri alım düğmesi bugünün tavanını tek tıkla kullanıyor.
- *Gündem:* süren emir çipi, kontrol eşiğine göre ilerleme ve kalan gün.
- *Yardım:* yeni madde.

Kalibrasyon (en ucuz rakibe emir veren devralmacı vekil, 900 gün):

| Tohum | Tur 19 (tek tık) | Tur 20 (emir) |
|---|---|---|
| 1 | ilk devralma 165 · 6 devralma · değer zaferi 503 | 183 · 6 · 519 |
| 7 | 165 · 5 · 716 | 200 · 4 · 793 |
| 42 | 165 · 5 · 634 | 183 · 5 · 636 |

| Hedef (savunması) | Sonuç |
|---|---|
| Atlas, Kilit, Anadolu (doktrini yok ya da kasası dar) | her seferinde alındı: nakit yetince 15 gün (5.001 / 350), kilidin açıldığı ilk haftalarda nakit beklemesiyle 20–37 gün |
| Nova (genişlemeci, geri alım) | 15–20 gün; tohum 7'de savuşturdu |
| Meridyen (premium, ihraç) | iki denemede savuşturdu; tohum 1'de Nova'dan miras payla 11 günde alındı |
| Veri (teknoloji, ihraç + geri alım) | üçünde de alındı, 17 gün |

Dört ölçüm dersi:

1. **Fiyat sınırı oyuncuyu korumuyor, emri donduruyordu.** İlk sürüm emri,
   verildiği günün fiyatının 1,25 katında bekletiyordu. Fiyat günlük kârdan
   türeyen güvenle oynuyor: Kilit Market'in güveni üç günde 0,60'tan
   1,24'e çıktı, fiyat iki katına vardı ve emir 75 gün bekledi. Sınır
   kaldırıldı. Fiyat zaten defterin 0,6–1,8 katı arasında; oyuncu
   ilerlemeyi görüyor ve emri istediği gün iptal edebiliyor.
2. **Savunma yavaşlatmıyor, ikili sonuç veriyor.** Geri alım saldırganın
   günlük alımına dokunmuyor, dolaşımı daraltıyor. Savunma kazanırsa emir
   düşüyor; kazanamazsa süre tavanın belirlediği en az güne eşit kalıyor.
   Uzayan emirlerin sebebi nakit beklemesiydi, savunma değil. Baskına
   uğrayan oyuncu için de aynı: geri alım bir yarış, fren değil.
3. **Sayaç da bir iddia.** Emrin verildiği gün de alım günü. Denge
   düzeneği bunu saymıyordu ve doğru çalışan bir emre "tavanı aştı"
   dedi (14 < 15). Tahmin doğruydu, ölçen sayaç bir gün eksikti.
4. **Main'deki kırmızı Tur 18'den kalmaydı.** Mobil "en geniş rakamlar"
   sondajı oyuncuya 123 milyar ₺ borç yazıp oyunu 1x hızda 600 ms
   bekletiyordu. O arada bir gün dönerse Tur 18'in kredili hesabı borcu
   kasadan kapatıyor, "Borç" metriği kayboluyor ve kontrol 5 yerine 4
   metrik sayıyordu (10da3af). Gün dönmesi makinenin o anki temposuna
   bağlı olduğu için ancak bazı koşularda çıktı. Sondaj artık oyunu
   duraklatıyor; ölçtüğü şey yalnızca rakamların genişliği.

### Tur 21 — Açık kalemlerin hepsi: dolaylı tahmin, liderlik, dolu parsel, kalite, büyük şehir, yerelleştirme

Kullanıcı "hepsini yap" dedi; §4'ün açık kalemleri tek turda, her biri
ayrı commit. Yanında üç bulgu çıktı: Tur 8'den beri yanlış olan bölgeler
arası erişim, şehir büyüdükçe karesiyle büyüyen iki tarama, ve sahnenin
harita boyutu değişince yeniden kurulmaması.

**Dolaylı binaların tahmini (§4.6).** Depo, Ar-Ge ve pazarlama yapı
menüsünde artık bir sayı gösteriyor. Yöntem karşı-olgusal gün: durumun
iki kopyası, birinde bina var, ikisinde de aynı üretim ve pazar adımı.
Fiyat ve marka sekiz günde oturtuluyor; fark binanın katkısı. Menüdeki
tek cümle ("mağazalarının maliyetini düşürür") Ar-Ge ve pazarlama için
yanlıştı, role göre ayrıldı. Sıralama değişmedi (parsel başına doğrudan
kâr); NPC'ler bu tahmini kullanmıyor.

| Doğrulama (rakipler donuk, 150 gün sonra; son kod) | Hızlı tahmin | Gerçek |
|---|---|---|
| Depo, tohum 1 / 7 | 6.562 / 4.887 ₺/gün | 7.827 / 6.618 |
| Ar-Ge, tohum 1 / 7 | 2.441 / 3.558 | 7.198 / 5.410 |
| Pazarlama, tohum 1 / 7 | 3.027 / 4.326 | 7.908 / 5.157 |

Hızlı tahmin bugünkü şehri ölçüyor; Ar-Ge ve pazarlamanın katkısı zamanla
büyüyor. İki kanal: mağazalar kapasitede çalışırken prim fiyattan ödüyor
ve o prim karşılanmayan taleple büyüyor; mağaza dışındaki her bina da
temel istihdam yaratıp bölgenin nüfusunu büyütüyor. Bu yüzden yerleştirme
sırasında isteğe bağlı **120 günlük projeksiyon** var (iki kopya gün gün
oynuyor, ~0,7 sn): Ar-Ge 120. günde 4.275 / 6.243 ₺/gün katkı.

**Bölge liderliği (§4.7'nin son kalemi).** Lider: bölgedeki perakende
cirosunun en büyük payı (10 günlük üstel ortalama, devir %5 farkla).
Oyuncuyu ilgilendiren devir haber oluyor, rakibin yüzü ve bölgesiyle;
720 günde ~20 haber, akışın %4'ü. §4.7 kapandı.

**Dolu parsel ihalesi (§4.6).** Merkez dolunca ihale ya kenardaki ucuz bir
köşeye çıkıyor ya da hiç açılmıyordu (900. günde boş parsel kalmıyor).
Belediye artık şehrin kendi yapısı olan bir parseli de "kentsel dönüşüm"
ihalesine çıkarabiliyor: en iyi dolu parsel en iyi boş parselin iki katı
değerliyse ya da boş parsel yoksa. Taban sahibinden devralma bedeli;
kazanan yapıyı yıktırıp parseli boş alıyor. 1.200 günde ihalelerin üçte
biri dolu parsel, 360–600. günde başlıyor.

**Taban kalite fiyata (§4.3).** Kalite, Ar-Ge ve pazarlamayla aynı
kanaldan, aynı kıtlık çarpanıyla fiyata dönüyor: kategorinin en düşük
kaliteli mağazasına göre farkın yarısı. Bakkal, kafe, butik, elektronik
mağazası ve spor salonu birebir Tur 1; süpermarket ve restoran +0,115,
mağazalar zinciri +0,10. Boş talebi %84 olan bölgede süpermarket bakkaldan
%5 pahalı satıyor (×1,434 / ×1,362).

**Büyük şehir (5×5, §4.5).** Kurulumda Standart / Büyük. Standart 3×3
bayt bayt aynı (iki 400 günlük koşunun özeti eşit); lig her zaman
standart. Büyük şehir üç ayar istedi, her biri ölçümden:

| Büyük şehir (900 gün, tohum 1/7/42) | 360. gün boş talep | 720. gün oyuncu | Zafer |
|---|---|---|---|
| Standart (kıyas) | %4–7 | 75–126 M ₺ | 619 / 796 / yok |
| İlk sürüm: köşe kilidi, rakip haftada 1 mağaza | %18–24 | 184–199 M ₺ | 498–529 (kolay mod) |
| Dış halka 4 dalgada + rakip temposu 2 | %12–13 | 142–163 M ₺ | 550 / 567 / yok |
| + zafer eşiği ×1,5 | %12–13 | 142–163 M ₺ | 682 / 732 / yok |
| **Son kod** (zincir düzeltmesi, savunma ihracı) | %10–15 | 159–172 M ₺ | 721 / 654 / 666 |
| Standart, son kod (kıyas) | %4–8 | 99–129 M ₺ | 608 / 724 / 698 |

Son kodda büyük şehrin en iyi rakibi 720. günde oyuncuyla başa baş
(159–168 M ₺), 900. günde iki tohumda önde; standartta oyuncu 1,4–1,9
kat önde. Zafer artık her tohumda geliyor ama 650. günden önce değil.

- Dış halkanın 16 bölgesi 130/260/390/520. günlerde dörder açılıyor;
  oyun 3×3'lük bir çekirdekte sekiz rakiple kalabalık başlıyor.
- Rakip karar başına iki mağaza kurabiliyor (`rivalTempo`); standartta 1,
  döngü bir kez dönüyor, zar tüketimi aynı.
- Zafer eşiği şehir boyutuyla ölçekli (Dengeli büyükte 150 M ₺).
- Sahne harita boyutuyla kuruluyordu; aynı motorda farklı boyutta yeni oyun
  ya da kayıt yüklenince yeniden kurulmuyordu. Artık harita boyutu değişince
  yeniden kuruluyor.
- Yazılımsal GPU'da büyük şehir standarttan %10–27 pahalı kare veriyor
  (parsel 2,8 kat).

**Yerelleştirme (§4.9).** Arayüz metinleri bileşenlerden sözlüğe çekildi:
`t(anahtar, parametreler)`, `packages/ui/src/i18n/tr/` altında dosya
grubu başına bir modül, `registerLocale` / `setLocale`. Kanıt: sabit bir
durumda 54 ekranın (kurulum, paneller, seçili kareler, lensler, oyun
sonu) metin ve erişilebilirlik dökümü taşımadan önce ve sonra bayt bayt
aynı. Kapsam dışı ve sıradaki adım: çekirdeğin ürettiği metinler (haberler,
komut ret sebepleri) ve içerik paketi.

Sekiz ölçüm dersi:

1. **Bölgeler arası erişim Tur 8'den beri yanlıştı.** `accessWeight`
   sütun sayısını `harita genişliği / 8` diye hesaplıyordu. Bölge kenarı
   Tur 8'de 10'a çıkınca 30 genişlikte 4 sütun çıktı: Çarşı hesapta
   Teknopark'ın komşusuydu, gerçek komşusu Liman'a erişemiyordu. 5×5'i
   denerken bulundu. Düzeltme standart şehirde oyuncuyu %4 öne,
   rakipleri %10 geriye aldı (360. gün); bantlar yerinde (outlet geri
   ödemesi 18–55 gün, zincir 194 gün).
2. **Şehir büyüdükçe karesiyle büyüyen iki tarama.** Büyük şehirde geç
   oyunda gün 310 ms'ydi (3x hızda gün 480 ms), standartta bile 51 ms.
   Profil: depo arama (%43) ve Ar-Ge/pazarlama gücü (%22) her mağazada
   bütün binaları tarıyordu. Bina indeksi yalnızca bina değiştirmeyen saf
   hesaplamalarda (pazar, Ar-Ge, kartlar, net değer, teklif turu) açık;
   indeksli ve indekssiz 400 günlük özetler aynı. Gün: büyükte 310 → 67
   ms, standartta 51 → 23 ms.
3. **Tek günlük deney gerçeğin beşte birini buldu.** Dolaylı tahminin ilk
   sürümü tek pazar günü koşuyordu: otomatik fiyat farkın yalnızca %25'ini
   bir günde kapatıyor ve marka ile pay birbirini besliyor. Sekiz günlük
   oturtma ikisini yakaladı; kalan fark (şehir büyümesi) hızlı tahminin
   değil projeksiyonun işi.
4. **Kalitenin tam ağırlığı zinciri bozdu.** Fark 0,23 iken üst kademe
   mağaza o kadar hızlı döndü ki Tur 15'in fırsat maliyeti freni zincir
   ünitelerini erteledi; zincir A/B'si bir tohumda 4 üniteden 1'e indi ve
   "zincir kurulabilen her tohumda kazandırıyor" önkoşulunu kaybetti.
   Yarım ağırlıkta zincir 3 ünite ve önde. (Bu ölçüm 6. dersteki
   düzenek hatasıyla yapılmıştı; aynı sonuç düzeltilmiş düzenekte de
   geçerli.)
5. **Şans eseri geçen kontrol.** "Yatırım tahmini gerçekle tutuyor" boş
   talebi en yüksek bölgeyi seçiyordu ve kilitli bölgeleri elemiyordu.
   Kilitli bölgede boş talep ~%100; erişim düzelince sıralama değişti ve
   kontrol kilitli Teknopark'ı seçip çöktü. Önceden açık bölge şans eseri
   seçiliyordu. Aday listesi artık açık bölgeler.
6. **Zincir A/B'si kendi düzeneğinde takılıyordu, altında da gerçek bir
   hata vardı.** Donuk genişleme kopyası kilitli bölgeleri elemiyordu
   (Tur 14'ten beri): alım reddedilince vekil o hafta hiçbir şey
   kurmuyor, 560 günde 2–6 M ₺'de kalıyordu. Zincirin birkaç ünitesi bu
   küçük tabana göre büyük görünüyordu (+%12 / +%19 / +%30). Kilit
   filtresiyle vekil 68–86 M ₺'ye çıktı ve zincirli kol üç tohumda da
   kaybetti (main'de de). Kök sebep üretim adımındaydı: ara ürün tüketimi
   mağazanın günlük satışından okunuyordu, ama defter üretimden önce
   sıfırlandığı için o gün boştu; kod kapasiteyi raftaki ürünlere eşit
   bölüyordu. Satmayan ürün tüketilmiş, satan ürün eksik sayılıyor, zincir
   kartı yanlış akışa ünite öneriyordu. Mağaza artık dünkü satışı ürün
   başına tutuyor (`soldByGood`, isteğe bağlı alan; şema v6). Zincir A/B
   3/3, ortalama +%2; benchmark zincir satırı (main → dal) normal nakitte
   +%3 → +%16, bol nakitte −%10 → −%3. Kontrolün eşiği %10'dan %0'a indi: %10 takılan
   düzeneğin kalibrasyonuydu. İddia "zincir kazandırıyor", her tohumda
   ayrıca sınanıyor.
7. **"İhraç baskına karşı kalkan" iki şanslı tohuma yaslanıyordu.**
   Zincir düzeltmesi rakip ekonomisini kaydırınca seed 42'de ihraç eden
   oyuncu da düştü (723 → 725. gün). On tohumda ölçünce kuralın kendisi
   çıktı: baskıncının günlük tavanı bir PAY (%3,5), ihraç onun payını
   yalnızca 1/1,25'e indiriyor (%31,5 → %25,2) ve fark iki alımda
   kapanıyor. Yani tek ihraç ~40 gün kazandırıyor, iki ihraç arası 180
   gün. Savunmasız düşen dokuz oyuncudan main'de altısı, dalda üçü ihraçla
   ayakta kalıyordu; main'deki seed 42 de iki baskıncı serbest hisseyi
   bölüşüp tıkandığı için ayaktaydı. **Savunma ihracı:** tek bir
   hissedarın payı %30'u geçince bekleme aranmıyor ("zehir hapı");
   kurucu tabanı (%51) ve ihraç başına tavan aynen geçerli. Dokuzun sekizi
   ayakta, dokuzuncusu 715 yerine 862. günde düşüyor; kalkanın bir sonu
   var. Rakiplerin savunma ihracı da aynı kuraldan geçiyor. Borsa formu
   bekleme kalktığında bunu söylüyor. Kontrol artık dört tohumda (7, 42,
   5, 31); 5 ve 31 eski kuralla düşen tohumlar.
8. **Siluet kontrolü bir form çakışmasını kaçırıyordu.** "Şehir dönüşüyor"
   kuruluşta olmayan formları sayıyordu, ama okul da 'block' formunda ve
   kuruluşta var. Sıra ev → apartman adımı listede görünmüyordu; kontrol
   fiilen 700 günde hem bostan → depo hem sıra ev → apartman → rezidans
   istiyordu. Seed 23'te 15 apartman ve 20 fabrika doğdu, rezidans
   doğmadı ve kontrol düştü. Sekiz tohumda rezidans sayısı main'de 59,
   dalda 57; gerileme yok, tek tohumun kademe zarı. Kontrol artık
   kademeyi sayıyor, aynı sertlikte: iki zincir de dönüşmeli ve en az
   biri iki kademe atlamalı.

### Tur 22 — Rakip koltukları dolu kalıyor; holding: birden çok şehir

Kullanıcı Tur 21'den sonra "önerdiğin şekilde ilerle" dedi: önce rakip
kataloğu, sonra çoklu şehir.

**Katalog bitince yeni rakip üretiliyor (§4.6).** Boşalan koltuğa giriş
Tur 17'den beri vardı ama yalnızca katalogdaki sekiz kişilikten biri
girebiliyordu. Pasif vekille sorun görünmüyordu: 1.200 günde en fazla bir
devralma, katalog hiç bitmiyor. Devralma emri veren bir vekille ölçünce:

| 1.200 gün, avcı vekil | Katalog bittiği gün | 600 / 800 / 1.200. günde rakip (8 koltuk) |
|---|---|---|
| Büyük şehir, önce (tohum 1 / 7 / 42) | 180 / 178 / 178 | 4-4-4 · 3-3-3 · 3-3-3 |
| Büyük şehir, sonra | aynı | 8-8-7 · 7-7-8 · 7-7-7 |
| Standart (4 koltuk), önce | 958 / 958 / — | 1.200. günde 3 · 3 · 4 |
| Standart, sonra | aynı | 1.200. günde 4 · 4 · 4 |

- Büyük şehirde sekiz kişiliğin hepsi baştan sahnede; ilk devralmada
  katalog bitiyordu.
- Yeni profil giriş günü üretiliyor. Doktrin sahnede en az temsil edilen
  kişilikten; sayısal ağırlıklar o kişiliğin katalog profillerinden
  birinin aynısı (denge onlarla ölçüldü). Ad, CEO, renk ve portre tohum +
  üretim sırasından dışsal bir zarla; oyunun zarı kaymıyor.
- İlk sürümde iki kusur çıktı. Ad kökü tekrar ediyordu ("Zeytin Girişim"
  devralındıktan sonra "Zeytin Gayrimenkul" aynı şirketin dönüşü gibi
  okunuyordu). Devralınan rakibin rengi de hemen yenisine geçiyordu. Kök
  artık tekrar etmiyor, renk de en uzun süredir görülmeyenden seçiliyor.
- Giriş beklemesi koltuk başına aynı hız: standartta 120 gün, büyükte
  60. Sabit 120 günle büyük şehir beş-altı rakipte kalıyordu.
- Profil state'te isteğe bağlı bir alanda (`extraProfiles`), şema v6.
  Rakip turu, ihale, lobi, işgücü doktrini ve haber portresi
  `rivalProfile` üzerinden okuyor.
- Katalog bitmeyen oyunlarda davranış aynı: üç 400 günlük koşunun özeti
  (standart 5 ve 7, büyük 5) main ile bayt bayt eşit.

**Holding: birden çok şehir (§4.5'in son kalemi).** Bir şehirde zafere
ulaşınca yeni bir şehre açılmak.

- *Model:* SimCity'nin bölge oyunu. Aynı anda bir şehir oynanıyor,
  diğerleri bekliyor: takvimleri, rakipleri ve şehir gelişimi donuk.
  Eşzamanlı simülasyon her sistemin "hangi şehir" sorusunu bilmesini ve
  günü şehir sayısı kadar pahalı yapmayı gerektirirdi. Bu modelde her
  şehir tam bir simülasyon; bekleyenler oynanan şehrin `holding`
  alanında, kayıtla birlikte gidip geliyor.
- *Açılış:* zafer kazanılan şehirden, en fazla üç şehir. Sermaye o
  şehrin kasasından çıkıyor (en az 2 M ₺). Marka bilinirliğinin yarısı ve
  CEO taşınıyor. Rakip kadrosu katalogda kayıyor: ikinci şehir ikinci
  dörtlüyle (Veri, Anadolu, Kule, Firuze) başlıyor. Tohum ve ad kurucu
  tohumdan.
- *Holding kasası:* bekleyen şehrin ayrıldığın gündeki kâr eğiliminin
  (bina kâr ortalamaları) yarısı her gün kasaya akıyor. Kasa ile şehir
  arasında iki yönlü aktarım var.
- *Zafer şehirde yaratılan değerle:* net değer eksi kasa ile net aktarılan
  sermaye. Kasa ayrı tutuluyor, çünkü bu para doğrudan şehre aksaydı
  ikinci şehrin zaferi kendiliğinden gelirdi: ölçümde kasa ikinci zafere
  kadar 55–105 M ₺ biriktirdi, yani hedefin (100 M ₺) yarısıyla tamamı
  arası. Kurucu şehirde aktarım yok, davranış aynı (özetler eşit).
- *Kaybetmek:* holding'de bir şehri baskınla kaybetmek oyunun sonu
  değil; oyun sonu ekranı bekleyen şehre geçiş sunuyor. Kaybedilen şehir
  kasaya ödeme yapmıyor.
- *Arayüz:*
  - Şehirler paneli: holding değeri, kasa, günlük akış, şehir listesi ve
    geçiş, aktarım, yeni şehir formu (boyut, sermaye, taşınan marka).
  - Zafer ekranında "Yeni şehre açıl", hedeflerde çağrı.
  - Holding kurulunca üst barda tıklanabilir şehir adı.
  - Yardımda yeni madde.
  - Dock'a sekme eklenmedi: mobilde sekiz sekme sınırda.
- *Şehir değişimi:* anlık olaylar (eşik haberleri, sıralama, baskın
  seviyesi) sessizce yeniden kuruluyor. Sahne şehrin tohumuyla yeniden
  kuruluyor, seçim temizleniyor.

| Holding (vekil, sermaye nakdin %25'i) | Tohum 1 | Tohum 7 | Tohum 42 |
|---|---|---|---|
| 1. şehir zafer | 647. gün | 808. gün | 700. gün |
| Kâr eğilimi / kasaya akış | 300 / 150 B ₺/gün | 175 / 88 | 217 / 108 |
| 2. şehre sermaye | 14,1 M ₺ | 11,6 M ₺ | 12,5 M ₺ |
| 2. şehir zafer | 700. gün | 627. gün | 715. gün |
| Kasa / holding değeri, 2. zaferde | 105 / 305 M ₺ | 55 / 255 M ₺ | 77 / 278 M ₺ |
| Kayıt (iki standart şehir) | 1,49 MB | 1,61 MB | 1,56 MB |

Getirilen sermaye ikinci şehri kolaylaştırmıyor; zafer günleri ilk
şehirle aynı bantta. Kayıt IndexedDB'de; iki büyük şehir ~3,3 MB.

Bilinen sınırlar: her şehrin kendi takvimi var (yeni şehir 1 Ocak'tan
başlıyor); panel şehirleri gün sayısıyla gösteriyor. İleride bir şema
yükseltmesi, bekleyen şehirlerin iç içe durumlarını da göç ettirmeli.

Üç ölçüm dersi:

1. **Pasif vekil sorunu göstermiyordu.** Katalog tükenmesi yalnızca
   devralma yapan bir oyuncuda oluyor; denge düzeneğinin standart vekili
   1.200 günde bir devralma yapıyor. Yeni denge bölümü avcı vekille
   koşuyor ve önce kataloğun gerçekten bittiğini doğruluyor (bitmezse
   kontrol anlamsız).
2. **Test düzeneği gerçek günü taklit etmiyordu.** Üretilen rakibin bina
   kurduğunu sınayan ilk test yalnızca rakip turunu çağırıyordu; pazar
   adımı olmadan hiçbir rakip kurmuyor. Motorla gerçek günlerde koşunca
   21 günde 4 bina.
3. **Bir kontrol bir şeyi kanıtlamalı.** Oynanış testinin "şehir değişince
   seçim temizleniyor" kontrolünün ilk hâli her durumda geçiyordu;
   önce bir kare seçip sonra şehir değiştiren gerçek bir kontrol oldu.

### Tur 23 — İkinci dil: İngilizce

Kullanıcı "diğer yapılacaklara geçelim" dedi; listede kalan büyük kalem
yerelleştirmenin ikinci adımıydı (§4.9). Tur 21 yalnızca düğme
yazılarını sözlüğe çekmişti. Haberler, komut ret sebepleri ve içerik
adları (bina, ürün, olay, CEO) Türkçe sabitti; ikinci bir dil bunlar
olmadan yarım kalırdı.

**Tek motor, üç katman.** Sözlük motoru arayüz paketinden en alttaki
içerik paketine taşındı: `translate(anahtar, parametreler, yedek)`,
`registerMessages`, `setLocale`. Arama sırası etkin dil, Türkçe, yedek,
anahtar.

| Katman | Nasıl | Anahtar |
|---|---|---|
| Arayüz | `t('hud.topbar.cash')` (tipli) | 534 |
| Çekirdek | `tc('core.npc.expandTitle', {name})`; üç grup: world, commands, markets | 367 |
| İçerik | metin alanı bir getter: `content.building.grocery.name`, yoksa nesnenin kendi Türkçesi | 241 (İngilizce) |

- Üretilen metin (haber, önerge, sözleşme başlığı) state'e o günün
  diliyle yazılıyor. Dil oyun ortasında değişirse eski haberler
  yazıldıkları dilde kalıyor. Şema v6, kayıt biçimi aynı.
- Biçimler dile göre değişiyor:

  | | Türkçe | İngilizce |
  |---|---|---|
  | Para | 1.20 M ₺ · 45 B ₺ · 1.234 ₺ | ₺1.20M · ₺45K · ₺1,234 |
  | Yüzde | %45 | 45% |
  | Ondalık | 5,5 | 5.5 |
  | Tarih | 27 Kas 2026 | Nov 27, 2026 |
  | Sayı | 1.234 | 1,234 |

  Türkçe çıktı Tur 22 ile aynı. Tek istisna borsa satırındaki pay
  oranı: "%0.0" yerine "%0,0" (Türkçe ondalık virgülü; geri kalan her
  yerde zaten öyleydi).
- Dil seçici yeni oyun ekranında ve Yardım panelinin altında. Dil adları
  kendi dillerinde yazılıyor ("Türkçe", "English"). Seçim tarayıcıda
  hatırlanıyor. `?lang=en` bir bağlantıyı İngilizce açıyor ama hatırlanan
  seçimi değiştirmiyor. Varsayılan Türkçe.
- Çeviriler ortak bir sözlükle yapıldı (Şirket değeri: Company value,
  Devralma: Takeover, Muacceliyet: Acceleration …). Kişi ve şirket adları
  özel ad, çevrilmiyor.

**Kanıt.**

- Türkçe davranış aynı: üç 400 günlük koşunun (standart 5 ve 7,
  büyük 5) state özeti her adımda Tur 22 ile bayt bayt eşit. Haber,
  önerge ve sözleşme metinleri bu özetin içinde.
- Türkçe arayüz aynı: 54 ekranın metin ve erişilebilirlik dökümü,
  yukarıdaki pay oranı satırı dışında birebir.
- Çekirdek metinleri taşınırken eski ve yeni kod yan yana koşturuldu:
  ret sebepleri ve ipuçları 400 günlük özete girmiyor. commands grubunda
  1.741 karşılaştırma, markets grubunda 53.031 karşılaştırma, hepsinde
  0 fark.
- İngilizce taraf:
  - 54 ekranın İngilizce dökümünde ham anahtar, doldurulmamış yer
    tutucu ve Türkçe biçimli para, yüzde ya da ondalık yok.
  - Kalan Türkçe harfler yalnızca kişi ve şirket adlarında ("Deniz
    Arkın", "Atlas Yapı").

**Bir bulgu: rakip yapay zekâsı dili okuyordu.** Rekabet kartları eşitlikte
kategori adına göre sıralanıyor ve rakipler kartları bu sırayla tarıyor.
Ad İngilizcede değişince sıra da değişecekti; aynı tohum İngilizcede
başka bir oyun oynayacaktı. Eşitlik artık kategorinin Türkçe adından
(`baseText`) bozuluyor, Türkçe sıra aynı. Bunu yakalayan test şu: aynı
tohum iki dilde 150 gün oynanıyor, görünen metin alanları (title, body,
summary, name) dışında state'ler eşit olmalı. Ayrı bir koşuda üç 400
günlük oyun da aynı sonucu verdi: metin dışı fark 0.

**Testler.** Yeni birim testleri:

- motorun yedek zinciri;
- üç sözlüğün eksiksizliği ve yer tutucuları;
- İngilizce içerik çevirilerinin gerçek alanlarla birebir eşleşmesi (fazla
  ya da eksik anahtar yok);
- iki dilde aynı simülasyon;
- İngilizce haberlerde ham anahtar yok.

Oynanış testinde yeni "Dil" bölümü:

- İngilizceye geç, şirket kur, 90 gün oynat;
- üst bar, haberler ve altı panelde Türkçe kalıntı arama;
- Yardım'dan Türkçeye dönüş (oyun yerinde kalıyor);
- `?lang=en` bağlantısı ve hatırlanan seçim.

Dört ölçüm dersi:

1. **Dil simülasyona sızabilir, ve sızdığı yer metin değil sıralamaydı.**
   Ekranlara bakmak bunu göstermezdi; iki dilde aynı tohumu koşup
   state'leri karşılaştırmak gösterdi.
2. **Getter içe aktarımda donmuyor, sabit donuyor.** Lens adları ve
   zincir durum etiketleri modül yüklenirken `tc()` ile hesaplanan
   sabitlerdi; dil değişse de Türkçe kalırlardı. Getter'a çevrildiler.
   Aynı sebeple dolaylı tahmin önbelleğinin anahtarına etkin dil eklendi.
3. **Çevirmen biçimi bilmeli.** "{toShare}" ham sayı mı yoksa hazır
   "%37" mi? Yanlış tahmin "%37%" yazardı. Her yer tutucu için kod okundu.
   Hazır biçimli olanlara işaret eklenmedi; hazırlayan yardımcılar
   (`percent()`, `pct()`) dile duyarlı hâle getirildi.
4. **Döküm Türkçe kayıtla İngilizceyi sınayamaz.** İlk İngilizce dökümde
   binden fazla Türkçe satır çıktı. Hepsi kayıtta o günün diliyle yazılmış
   haberlerdi. Sınamak için kaydı İngilizce üretmek gerekti.

**Zamana duyarlı bir oynanış kontrolü.** "En çok satanın kapısı en
kalabalık (±1 araç)" bu turun iki tam koşusunda da kaldı (16'ya 19
araç). Kontrol oyunu gerçek zamanda 1,4 sn akıtıp tek bir ana bakıyor.
Aynı kontrolü 15 farklı anda ölçünce main 12/15, bu dal 14/15 geçti;
kalan anlarda fark iki ilâ üç araç. Kalma sebebi yerelleştirme değil:
kontrol, kapı başına araç tavanının yarattığı kuantalamada sınırda.
Kontrol bu turda değiştirilmedi; Tur 24'te beş anın çoğunluğuna
çevrildi (aşağıda).

### Tur 24 — Bina grafikleri: binalar ne olduklarını söylüyor

Kullanıcı "bina grafikleri içime sinmiyor" dedi ve sunulan seçeneklerden
ikisini seçti: türe özel detay ve ışık/malzeme. Hazır model kiti (Kenney
gibi) yetmezse sonraki seçenek olarak duruyor.

**Teşhis.** Şirket binaları altı formdan biriydi (ev, blok, kule, hangar,
tarla, düzlük). Üstüne bina rengi ve tek bir pencere dokusu geliyordu.
Bakkal, kafe ve spor salonu aynı "ev" kutusuydu. Asıl ders ölçümden değil
kameradan geldi: oyunun bakış açısında en çok görünen yüzey çatı, cephe
değil. İlk adım (cephe türleri, zemine yakın karartma) doğruydu ama fark
inceydi. Şehri değiştiren şey çatılar, ağaçlar ve dükkân önleri oldu.

**Işık ve malzeme (bütün kademelerde).**

- Yüzey gölgelendiricisi (`surface.ts`): tek atlas doku dört cephe türü
  taşıyor. Hangi türün kullanılacağı örnek başına bir öznitelikten
  okunuyor; yani dört malzeme ve dört kat çizim çağrısı yerine yine tek
  çağrı. Türler:
  - konut: delikli pencere, denizlik;
  - ofis camı: koyu cam, ince dikme;
  - zemin kat vitrin: üstü konut ya da ofis (altı dükkân üstü ev binası);
  - sanayi paneli: oluklu, şerit pencere.
- Gece dokusu aynı yerleşimde: ofisler soğuk beyaz yanıyor, vitrinler
  hep yanık.
- Zemine yakın karartma ve kenar vurgusu aynı gölgelendiricide. Gerçek
  ortam kapatmasının en görünür etkisini ek geçiş olmadan veriyor.
- Temas gölgesi: her binanın altında yumuşak bir leke (tek çizim
  çağrısı). Gölge haritası olmayan telefon kademesinde derinliği taşıyan
  şey bu.
- Ekran uzayı ortam kapatması (GTAO) eklenmedi. Bütün sahneyi ikinci kez
  çizen bir geçiş ve saydam lekelerle çakışıyor. Görünen etkisi zemine
  yakın karartma ve temas gölgesiyle bütün kademelerde zaten var.
  Gökyüzü kubbesi de eklenmedi: oyunun bakış açısında ufuk kadrajın
  dışında.

**Türe özel detay (`decor.ts`, `recipes.ts`).** Sekiz parça türü, her
biri kendi örnek ağında:

| Parça | Nerede |
|---|---|
| Kırma çatı | Evler kiremit (beş ton, biraz arduvaz); şirket evleri şirket renginde |
| Tente + tabela | Bakkal, kafe, butik, restoran, süpermarket, mağaza; şehrin esnaf dükkânları |
| Çatı ekipmanı | Su deposu, güneş paneli, klima, yeşil çatı; ofiste anten ve tepe feneri |
| Cam | Spor salonu cephesi, Ar-Ge atriumu, sera, süpermarket ışıklığı, çip fabrikası |
| Silindir | Değirmen siloları, nişasta ve hazır gıda tankları, kavurma bacası, Ar-Ge çanağı |
| Kutu | Depo rampaları, apartman balkonları, ocak vinci, okul bayrak direği |
| Ağaç | Sokak kaldırımları, parklar, ev bahçeleri; kahve bahçesinde fidan sıraları |
| Lamba | Sokak lambaları, gece yanıyor |

- Testere dişi çatı (dokuma ve döşeme fabrikaları) ve çatı ilan panosu
  (pazarlama ofisi) uzaktan okunan iki siluet.
- Rakip binaları şirket renginde kaldı: çatı, tente ve tabela şirketin
  rengini taşıyor, yani kimin nerede olduğu yukarıdan hâlâ okunuyor.
- Veri lenslerinde detaylar ve temas gölgeleri gizleniyor: lens bir
  harita, dekor kalabalığı istemiyor.
- Simülasyon dokunulmadı: detayların zarı konumdan, 400 günlük özetler
  aynı.

**Testler.**

- Yeni birim testi (`packages/render-three/test/recipes.test.ts`):
  - her bina türü en az bir detay taşıyor (Tur 25'te eklenecek binalar
    için bekçi);
  - detaylar kendi parselinde kalıyor;
  - sokak tarafı en yakın yola bakıyor;
  - sokak ağaçları kavşağa ve parsele düşmüyor.
- Oynanış testinde dört yeni kontrol:
  - detay katmanı dolu;
  - temas gölgeleri var;
  - lenste detaylar gizleniyor ve dönünce geri geliyor;
  - lambalar gece yanıyor, gündüz sönük.
- Kamerayı sabit bir bakışa götüren test kancası (`setView`): görsel
  karşılaştırma her koşuda aynı kareyi veriyor.

**Maliyet.**

| | Tur 23 | Tur 24 |
|---|---|---|
| Çizim çağrısı / kare (900 kare, en düşük kademe) | 13 | 29 |
| Detay örneği (oynanış testi anı) | — | 102 çatı · 419 ağaç · 72 lamba · 36 tabela · 29 tente · 23 silo/tank |
| Yazılımsal GPU'da kare hızı (GPU yok) | 5 FPS | 4 FPS |

Çizim çağrısı bütçesi 60. Mobil hedef bandı (50–150) hâlâ uzakta: her
parça türü tek bir örnek ağı, bina sayısı arttıkça çağrı artmıyor.

**Bir bulgu: çok yavaş cihazda açılış donuyordu.** İlk tam oynanış testi
Dil bölümünde, sayfa yenilendikten sonra 20 saniyelik bir zaman aşımıyla
çöktü. Sebep detay katmanı değil, kalite ayarlayıcıydı. Oyun her
açılışta en yüksek kademede başlıyor ve kademe indirme kararı için 2,5
saniye ile 12 kare bekliyordu. Karesi 1,5 saniye süren bir cihazda bu 18
saniyeden fazla en pahalı kademede kalmak demek. Detaylar kareyi biraz
ağırlaştırınca test sınırı aşıldı; ama aynı donma gerçekten yavaş bir
telefonda da yaşanırdı.

- Artık ölçülen hız tabanın dörtte birinin altındaysa (6 FPS) üç kare
  yetiyor ve kademe iki basamak iniyor.
- Kademe değişince ilk iki kare sayılmıyor. Gölgelendirici derlemesi
  güçlü bir GPU'da da ilk kareyi uzatır; onu yavaşlık sanmamak gerekiyor.
- Kayıtlı oyunla yenilemede üst bar 8–9 saniyede yanıt veriyor; kademe
  yüksek → düşük → asgari iniyor.

**Oynanış testi düzeneğinde üç düzeltme.**

1. *Ana sayfa artık kullanılmayınca kapatılıyor.* Ayarlayıcı
   düzeldikten sonra da Dil bölümündeki yenileme 20 saniyeyi aştı; aynı
   akış tek başına 8,5 saniye sürüyordu. Tohum Ligi'nden sonraki bölümler
   kendi sayfalarını açıyor ama ana sayfanın WebGL bağlamı, gölge
   haritası ve bloom zinciri yazılımsal GPU sürecinde duruyordu. Önce
   dondurmak denendi, yetmedi; sayfa kapatılınca yük kalktı. Uygulamanın
   davranışı değişmedi.
2. *Müşteri akışı kontrolü beş anın çoğunluğuna bakıyor.* Tur 23'te
   kırılgan bulunan "en çok satanın kapısı en kalabalık" kontrolü, bu
   turun üç tam koşusunun ikisinde de kaldı (main'de de 15 anın 3'ünde
   kalıyor). Aynı özellik artık beş ayrı anda ölçülüyor ve en az üçünde
   tutmalı. Akış satışı izlemeseydi beş anın hiçbiri geçmezdi; yani gerçek
   bir hata hâlâ kırmızı yakıyor.
3. *Satın alma bölümünde oyun duruyor.* Bir koşuda boş parsel seçildikten
   sonra bir rakip onu satın aldı ve "Parseli satın al" düğmesi hiç gelmedi.
   Bölüm arayüzü sınıyor, rakiple yarışı değil; sonunda hız eski hâline
   dönüyor.


### Tur 25 — Az seçenekli kategoriler çoğaldı: hizmet, elektronik, konut, ofis

Kullanıcı hizmette yalnızca spor salonu olduğunu söyledi: "sinema dahil
hepsini istiyorum, başka böyle az seçenek olanları çoğaltalım". Katalogda
tek seçenekli dört kategori vardı: hizmet ve elektronikte birer mağaza,
konutta ve ofiste birer kira binası. Market, yeme-içme ve perakendede
zaten ikişer mağaza vardı.

| Kategori | Önce | Eklenen |
|---|---|---|
| Hizmet | Spor Salonu | **Kuaför** (küçük, baştan açık) · **Sinema** (geniş kapasite) · **Sağlık Kliniği** (en kaliteli) |
| Elektronik | Elektronik Mağazası | **Telefoncu** (küçük) · **Teknoloji Mağazası** (kalite basamağı) |
| Konut (kira) | Apartman | **Rezidans** (büyük basamak) |
| Ofis (kira) | Plaza | **İş Merkezi** (plazadan önceki orta basamak) |

- Maliyetler kalibrasyon kuralıyla (`calibrate.ts`): makul dolulukta
  küçük basamak 80, büyük basamak 120 günde geri ödüyor. Kira binaları
  mevcut kira binalarının birim başına maliyetinden ölçeklendi.
- Her yeni binanın görünümü Tur 24'ün diliyle:
  - Kuaför: tente ve berber direği.
  - Sinema: ışıklı afiş panosu ve dikey tabela.
  - Klinik: kırmızı haçlı tabela ve yeşil çatı.
  - Teknoloji Mağazası: geniş vitrin ve çatı panosu.
  - Rezidans: çatı havuzu ve balkonlar.
  - İş Merkezi: cam lobi ve saçak.
  - Detay reçetesi bekçi testi her yeni türü yakaladı.
- İngilizce adlar ve açıklamalar eklendi; içerik kapsam testi eksik çeviri
  bırakmıyor.

**Ölçümün düzelttiği dört şey.**

1. *Abonman.* İlk sürümde Sinema 420, Teknoloji Mağazası 120 kapasiteliydi.
   Denge testi şehri her kategorinin en büyük mağazasıyla doyurmayı
   varsayıyor. Gereken parsel 293'ten 181'e indi (abonman %53 → %33, bant
   %35–75) ve toprak bollaştı. Son hâli Sinema 200, Klinik 160, Teknoloji
   Mağazası 40 kapasite: abonman %46.
2. *Kredinin kalıcı avantajı.* Büyük kapasiteli hizmet binaları kredinin
   erken avantajını eritmiyordu: borçla erken büyüyen oyuncu 720. günde de
   önde kalıyordu (tohum 1'de %23 → %17; kontrol yarısının altını istiyor).
   Kapasiteler 200/160'a inince erime geri geldi.
3. *Taban kalite kayması.* Fiyat primi kategorinin en düşük kaliteli
   binasına göre hesaplanıyor (Tur 21). Telefoncu ve Kuaför daha düşük
   kaliteyle girince taban aşağı kaydı. Var olan Elektronik Mağazası ve
   Spor Salonu, hiçbir şey değişmeden +0,05 fiyat primi kazandı. Küçük
   basamaklar artık kategorinin tabanıyla aynı kalitede (0,60 ve 0,65); eski
   binaların ekonomisi aynı.
4. *Elektronik uzmanı rakip.* Rakipler kategoride en yüksek kapasiteli
   binayı seçiyor. Elektronik talebi tam karşılanmadığı için her yeni
   elektronik basamağı Firuze'yi büyüttü. Deneyle ayrıldı:
   - yeni elektronik binaları kapalı: ikinci şehirde zafer 665. gün;
   - yalnız Telefoncu açık: zafer yok;
   - yalnız Teknoloji Mağazası açık: zafer 669. gün.

   Sonuç:
   - Telefoncu'nun kilidi Elektronik Mağazası'yla aynı (300 bin), yani
     erken bir elektronik girişi yok.
   - Teknoloji Mağazası parsel başına kârı Elektronik Mağazası'na yakın
     bir kalite basamağı (40 kapasite, 0,74 kalite, 2,4 M kilit).

**Holding bölümü üç tohumda.** Ayarlardan sonra ikinci şehirde zafer
tohum 7'de 584., tohum 42'de 613. günde geliyor; main'de 627 ve 715. gündü.
Tohum 1'de 1.200. günde Firuze 258 M'ye 249 M ile önde. Bu tohum main'de
de kıl payıydı (114 M'ye 106 M). Bölüm yalnızca tohum 1'e bakıyordu.
Artık Tur 22'deki ölçümün üç tohumunda koşuyor:

- zafer en az ikisinde gelmeli;
- "bedava değil" sınırı (400. gün) her tohumda;
- holding mekaniği (donuk takvim, kasaya akış) her tohumda.

Tek tohuma göre içerik ayarlamak aşırı uydurma olurdu. Tohum 1'deki yarış
gerçek: pasif vekil devralma yapmıyor, elektronik uzmanını durdurmuyor.
(Aşağıdaki tahmin düzeltmesinden sonra üç tohumda da ikinci şehir
kazanılıyor: 478, 453 ve 467. gün.)

**Zincir neden kaybediyordu: yapı menüsü yanlış tahmin ediyordu.**

Yeni binalarla zincir kontrolü kırıldı: zincir kartını izleyen kol 3
tohumun yalnızca 1'inde öndeydi. Tohum sayısı 6'ya, sonra 12'ye çıkınca
sorunun main'de de olduğu görüldü: main'de 6 tohumun 4'ünde öndeydi,
ortalama −%2. Üç tohumluk kontrol kıl payıyla geçiyordu (tohum 1'de
+%0,4). Tur 25'in başında 12 tohumun 3'ünde önde, ortalama −%2,6.

Kök sebep zincirde değil, `estimateInvestment`teydi. Yapı menüsü, rakip
yapay zekâ ve vekil hep aynı fonksiyonu kullanıyor ve fonksiyon iki şeyi
görmüyordu:

1. *Komşu rakipler.* Komşu bölgelerin talebi tahmine ekleniyordu ama o
   talebin peşindeki komşu mağazalar rakip sayılmıyordu. Pay yalnızca
   kendi bölgendeki mağazalara karşı hesaplanıp şehrin yarısının talebine
   uygulanıyordu. Pazar adımı ise her bölgenin talebini o bölgeye erişen
   bütün mağazalar arasında erişim ağırlığıyla bölüyor.
2. *Kendi şubelerin.* Yeni şubenin payının bir kısmı senin eski
   şubelerinden geliyor. Tahmin bunu kâr sayıyordu.

Zincir girdiyi ucuzlatınca bu hata büyüyordu. Vekil aynı kategoriye mağaza
üstüne mağaza açıyordu, mağazalar birbirini yiyordu:

- tohum 99'da 23 Teknoloji Mağazası açıldı, tanesi günde 377 ₺ kazanıyordu;
- tohum 99'da 21 mağazalar zinciri, tanesi 3,3 bin ₺ (düz kolda 16 tanesi
  4,1 bin ₺).

Düzeltme:

- **Tahmin pazar adımı gibi hesaplıyor.** Her hedef bölge için ayrı pay,
  komşu mağazalar erişim ağırlığıyla rakip. Doymuş bölgede yeni şubenin
  kendi şubelerinden alacağı kâr düşülüyor. Yapı menüsü bunu ayrıca
  yazıyor: "kendi şubelerinden 1.200 ₺/gün alıyor (düşüldü)".
- **Rakip küçüğünü de deniyor.** Rakip kategoride en büyük binayı seçiyordu.
  Kapıdan dönerse kategoriyi bütünüyle atlıyordu. Artık sırayla bir
  küçüğünü deniyor. Yoksa üçüncü süpermarketi kendi iki süpermarketini
  yediği için reddediyor, aynı bölgede kâr eden bakkalı hiç sormuyordu.
- **Zincir A/B'si zinciri ve mağazayı aynı tikte oynuyor.** Eskiden zincir
  hamlesi olan hafta mağaza açılmıyordu. Yani deney "kartı izlemek
  kazandırıyor mu" diye değil "bir ünite bir mağazadan iyi mi" diye
  soruyordu. `playerStrategy` bu dersi Tur 14'te almıştı, A/B almamıştı.

Ölçüm (zincir A/B, 560 gün, 12 tohum: 1, 7, 42, 3, 11, 99, 2, 5, 13, 21,
50, 77):

| | Önde | Ortalama |
|---|---|---|
| Tur 25 başı (eski tahmin, ya zincir ya mağaza) | 3/12 | −%2,6 |
| Yeni tahmin, ya zincir ya mağaza | 10/12 | +%14 |
| **Yeni tahmin, aynı tik (denge testi)** | **12/12** | **+%20** (+%4…+%45) |

Düz kol da güçlendi. Doğru tahminle vekilin 560. gün net değeri 70–97 M
₺'den 74–110 M ₺'ye çıktı. Vekil artık kârsız yamyam mağaza yerine
parseli boş bırakıyor: düz kolun bina sayısı 108–112'den 89–102'ye indi.

**Zincirin yan etkisi: zorluk eğrisi kaydı.**

Yapı menüsünü izleyen oyuncu artık belirgin daha iyi oynuyor. 15 günde bir
oynayan savunmasız vekil Dengeli'de düşmüyordu: tohum 7, 42, 5 ve 31'in
dördünde de ayakta kaldı, 112–133 M ₺ ile. Eskiden 572–858. günlerde
düşüyordu. Rakip ise yamyam mağazayı reddetti ama haftada tek karar
temposu yerinde kaldı. Reddedilen yatırımın parası boşta birikti: bir
tohumda 800. günde net değerin %47'si nakitti.

- **Boşta nakit ikinci mağaza deniyor.** Nakdi net değerinin %35'ini aşan
  rakip karar gününde ikinci bir mağaza deniyor. Eşik taraması kodda
  kayıtlı. Sistem kaotik ve eşik tek tek tohumları oynatıyor. %35'te
  Dengeli 832, Acımasız 447. günde düşürüyor. Bilgili oyuncunun zaferi 574
  ve 577. günde. Kademeler 421 / 576 / 726.
- **Kilitlenen baskın yarışı çözülüyor.** Rakipler güçlenince bir
  boşluk açığa çıktı. Tohum 41'de Meridyen %48, Nova %39, Veri %14 tutuyordu
  ve serbest hisse sıfırdı. 450. günden 900. güne hiçbir şey değişmedi:
  oyun kaybedilmiş ama bitmemişti. Artık en büyük paylı baskıncı, yarışı
  kaybeden en küçük paylı rakipten blok satışla alıyor. Satış piyasa
  fiyatından, aynı günlük tavanla. Oyuncu zorla satıcı yapılmıyor.
  - *Savunma ihracı yapmış hedefte bu kural yok.* Kural her hedefe
    uygulanınca ihraç kalkanı çöktü: birbirinden blok alan iki baskıncı
    seyreltmeye rağmen %50'yi geçiyordu. Üç tohumda da ihraçla düşüyordu,
    eskiden üçü de ayaktaydı.

**Üç kontrol ölçtüğü şeyi açık önkoşulla ölçüyor.**

Zincir kontrolündeki ilkeyle ("kurulamamış zincir ölçülemez"):

- *İhraç kalkanı.* Kalkan ancak baskının oyuncuyu düşürdüğü tohumda
  sınanabilir. Güçlenen vekil tohum 42'de savunmasızken de ayakta. Kontrol
  tehdidin gerçekleştiği tohumlara bakıyor ve en az ikisini şart koşuyor;
  atlanan tohum adıyla yazılıyor. Şu an 7, 5 ve 31: üçü de ihraçla ayakta.
- *Şube kapatma.* "900 günde en az bir kapanış" idi. Doğru tahminle rakip
  bu tohumda zararlı şube hiç açmıyor ve sıfır kapanış iki anlama
  gelebiliyordu. Mekanizma artık birim testinde, zarar elle kurularak
  sınanıyor (`prune.test.ts`). Oyundaki kontrol bekleme süresine bakıyor:
  kurala uyan şube iki haftadan uzun açık kalmamalı.
- *Şehir yayılması.* Kontrol 700. gündeki net yapı sayısına bakıyordu. O
  sayı şehrin diktikleri eksi rakiplerin devralıp yıktıkları. Rakip
  boşta nakdiyle daha çok devralınca net %59'dan %20'ye indi, ama şehir
  yavaşlamamıştı. Kontrol artık şehrin kendi diktiği yapıyı sayıyor: 105
  yeni yapı, başlangıç 101, eşik yarısı.

Ayrıca Tur 25'in ilk commit'inde kalan bir test hatası düzeldi. Teknoloji
Mağazası'nın kalite primi 0,045, test 0,035 bekliyordu.


### Tur 26 — Yeni oyuncu rehberi

Kullanıcı sıradaki tur için rehberi seçti. Oyun 25 turda derinleşti ama
ilk kez açan oyuncuyu yalnızca hedef merdiveninin ilk basamağı
karşılıyordu: "Boş bir parsel seç, satın al ve bir mağaza kur". Nerede,
hangi düğmeyle, tahmin ne diyor? Bu soruların cevabı yoktu.

**Ne yapıyor.** Atlanabilen, iki dilli, 11 adımlık bir koç kartı. Hedef
öğeyi çevreleyen bir halkası var.

| Adım | Oyuncu ne yapıyor | Ne zaman geçiyor |
|---|---|---|
| Hoş geldin | okur (zaman duruyor) | "Başlayalım" |
| Fırsatı gör | Fırsat merceğini açar | mercek açık |
| Bir parsel seç | parlayan bölgede boş parsele dokunur | alınabilir parsel seçili |
| Parseli al | satın alma düğmesine basar | parsel onun |
| Ne kuracağını seç | tahmini okur, "en iyi"yi seçer | yerleştirme modunda bir mağaza |
| Kur | parsele dokunur ya da "kur"a basar | mağaza var |
| Zamanı başlat | ▶ | üç gün geçti |
| Sıradaki hedef | hedef çipine dokunur | panel okunup kapandı |
| Tedarik zinciri | Zincir sekmesini açar | panel okunup kapandı |
| Rakipler ve borsa | Borsa sekmesini açar | panel okunup kapandı |
| Hazırsın | — | "Bitir" |

**Üç ilke.**

1. *Oyun durumuna bakar, düğmeye değil.* Adımların çoğu "İleri" ile değil,
   oyuncu o şeyi yapınca geçiyor. Önden giden oyuncu için tamamlanmış
   adımlar kendiliğinden atlanıyor; arsayı zaten almış olan mercek
   adımında beklemiyor. Panel adımlarında kart panel açıkken panelin
   anlatımına geçiyor, panel kapanınca adım bitiyor.
2. *Her an kapatılabilir.* Kart haritanın üstünde, önünde değil. Arkası
   tıklanabilir, halka dokunuşu geçiriyor. Her eylem adımında "Bu adımı
   geç" var; nakdi yetmeyen oyuncu takılı kalmıyor. Küçültülebiliyor.
   Kapatılan rehber Yardım panelinden baştan başlıyor.
3. *Kayıt şemasına dokunmaz.* İlerleme arayüzün işi, simülasyonun değil.
   Oyun durumuna yazılsaydı determinizm ölçümleri, kayıt göçü ve lig
   doğrulaması bir arayüz kaygısını taşımak zorunda kalırdı. İlerleme
   yerel depoda, oyunun kimliğiyle (tohum + kuruluş anı) tutuluyor. Depo
   kapalıysa oturum boyunca bellekte. Sayfa yenilenince kaldığı adımdan
   sürüyor.

Kurulum ekranında "Rehberle başla" seçeneği var. Bu tarayıcıda rehber hiç
bitirilmemiş ya da kapatılmamışsa açık geliyor.

**Yer ölçülerek seçiliyor.** Kart önce üstte deneniyor (üst bar ve
masaüstünde gündem şeridinin altı); hedefi örtüyorsa sıradaki yere
geçiyor. Masaüstünde alt orta haber akışının yeri, o yüzden kart üst
ortada; haritanın gökyüzünü örtüyor. Telefonda sıra üst, parsel
detayının üstü, rıhtımın üstü. Halka yalnızca gerçekten görünen öğeyi
gösteriyor: kutusu ekranda ama başka bir panelin altında kalan öğe
atlanıyor (`elementsFromPoint`, rehberin kendi kartı sayılmadan;
sayılsaydı kart hedefi örtünce hedef değişir, kart kayar, hedef geri
gelirdi).

**Rehberin bulduğu mobil boşluk.** İlk telefon yürüyüşünde rehber
"ne kuracağını seç" adımında takıldı. Sebep rehber değil, arayüzün
kendisiydi: telefonda kendi boş arsan seçiliyken yapı listesi parsel
detayının (alt sayfa) arkasında kalıyordu. İçerik ekrana sığdığı için
sütun kaymıyor, liste öne gelemiyordu. Oyuncu arsayı alıyor, sonra ne
kuracağını göremiyordu.

- *"Buraya ne kurulur?"* (yalnızca dar ekranda): yapı listesini açıyor ve
  parsel detayını derli toplu hâle getiriyor. İstatistikler, yan metin ve
  "Parseli sat" gizleniyor; detay küçülünce en iyi seçim kartı görünür
  alana çıkıyor. Kare değişince detay eski hâline dönüyor.
- *"… kur"* (her genişlikte): bina seçiliyken parsel detayında doğrudan
  inşa düğmesi. Telefonda yapı panelinin altındaki "Seçili arsaya inşa
  et"e ulaşmak gerekmiyor.

**Testler.** Oynanış testinde yeni "Rehber" bölümü var. Rehber gerçek
düğmelerle baştan sona oynanıyor, masaüstünde (duman koşusunda da, CI
her PR'da) ve iPhone 13'te. Ölçülenler:

- rehber karşılamada zamanı durduruyor;
- on adımın hepsi oyunun kendi akışıyla geçiyor;
- panel adımında kart anlatımını değiştiriyor;
- kart hiçbir adımda kendi hedefini örtmüyor;
- sonunda gerçek bir mağaza var;
- bitince tarayıcı rehberi hatırlıyor;
- Yardım'dan yeniden başlıyor, "Rehberi kapat" kaldırıyor;
- sayfa yenilenince kaldığı adımdan sürüyor;
- konsol temiz.

Diğer bölümler rehberi görmüş oyuncuyu oynuyor. Her bağlama bir
başlangıç betiği bu işareti koyuyor; kurulumda seçeneğin kapalı geldiği
ayrıca sınanıyor. Yoksa her bağlamda kart açılır, oyun durur ve
bölümlerin ölçtüğü şey değişirdi.

Tam koşu yeni bir ürün hatası da yakaladı: Yardım'dan yeniden başlatılan
rehber karşılamada zamanı durdurmuyordu. "Bir kez durdur" işareti oyun
başına tutuluyordu; artık rehberin her başlatılışına bağlı.

Masaüstü yürüyüşü en başta, ana sayfa açılmadan koşuyor. CI'da ikinci
bağlamda "Şirketi kur" tıklaması zaman aşımına düşmüştü; yerelde
geçiyordu. Yenileme kontrolü de bilerek geç bölümde, ana sayfa
kapandıktan sonra.
Yazılımsal GPU'da iki canlı WebGL bağlamıyla sayfa yenilemek açılışı 20
saniyenin ötesine itiyordu (Tur 24'ün "Dil" dersinin aynısı).

### Tur 27 — İçerik: sektör olayları ve dört yeni CEO

Kullanıcı sıradaki tur için "içerik ve derinlik"i seçti. Kapsam iki parça:
yeni olaylar ve dört sektör CEO'su. Yeni bir ürün zinciri bilerek sonraki
tura kaldı. Raf paylarını ve kalibrasyon bantlarını yeniden oynatırdı; bir
içerik turunun taşıyacağı yük değil.

**On bir sektör olayı.** Şehrin on bir olayı büyük ekonomik dalgalar:
resesyon, tüketim patlaması, enerji krizi. Yenileri daha dar: bir
kategoriye ya da bir bölge türüne dokunan, iki-dört haftalık haberler.

| Olay | Etki | Süre | Ton |
|---|---|---|---|
| Kuraklık | buğday ×1,4, sebze ×1,35, un ×1,15, hazır yemek ×1,12 (spot fiyat) | 28 gün | kötü |
| Silikonda Bolluk | silikon ×0,75, çip ×0,88 (spot fiyat) | 24 gün | iyi |
| Sağlık Kampanyası | hizmet talebi ×1,2 | 16 gün | iyi |
| Gişe Rekoru | merkezde hizmet ×1,5, yeme-içme ×1,2 | 14 gün | iyi |
| Mahalle Pazarı Haftası | orta gelirli konutta market ×1,35, yeme-içme ×1,25 | 12 gün | iyi |
| Moda Haftası | lüks konutta perakende ×1,45, hizmet ×1,15 | 14 gün | iyi |
| Gıda Denetimi | yeme-içme ×0,72, market ×1,08 | 14 gün | kötü |
| Cihaz Geri Çağırma | elektronik ×0,75 | 18 gün | kötü |
| Sahilde Fırtına | turizm bölgesinde yeme-içme ×0,6, perakende ×0,7, hizmet ×0,8 | 10 gün | kötü |
| Yol Çalışması | çarşı şeridinde perakende ×0,75, yeme-içme ×0,85, market ×0,9 | 16 gün | kötü |
| Grip Mevsimi | hizmet ×0,82, yeme-içme ×0,9 | 14 gün | kötü |

Zinciri olan oyuncu spot fiyat olaylarından (kuraklık, silikon) kendi
maliyetiyle üretip korunuyor; bu, zincirin zaten var olan kuralı.

**İkinci takvim — çünkü birincisi ölçülüyor.** İlk sürüm on olayı şehrin
listesine ekledi ve altı denge kontrolü düştü: rakiplerin zinciri, haciz,
kötü günde borçlu şirket, azınlık hissedar ve Dengeli zorlukta baskın
(iki kontrol). Sebep tek: aynı zar,
aynı günlük olasılık (%3,5), aynı iki olaylık sınır. Liste ikiye katlanınca
resesyon ve enerji krizi yarı yarıya seyreldi. Kredi ve baskın kontrollerinin
ölçtüğü kötü günler kaydı. Tonu yarı yarıya dengelemek (iyi/kötü) sonrasında
da altı kontrol kırmızıydı; sorun ton değil, krizin sıklığıydı.

Sektör olayları artık kendi takviminde:

- *kendi zarı* (tohum ve günden, şehrinkinden ayrı bir karışımla) — şehrin
  zarını paylaşsaydı her sektör olayı bir şehir olayının yerini alırdı;
- *kendi sınırı*: aynı anda en fazla bir sektör olayı, günlük olasılık %2,5;
- *şehrin sınırı yalnızca şehir olaylarını sayıyor* — sektör olayı açıkken
  şehrin krizi ertelenseydi kriz takvimi yine kayardı.

Sektör takvimi kapatıldığında dal main'in davranış özetlerini birebir
veriyor (`standard/5`, `standard/7`, `large/5`). Şehrin kriz takvimi Tur
27'den önceki takvimin aynısı. 900 günde ortalama 27,5 şehir ve 15,8 sektör
olayı çıkıyor; günlerin ~%29'unda bir sektör olayı açık.

**Sektör takvimi talepte nötre yakın.** Ayrı takvimle dört kontrol kaldı.
İlk ayarda takvimin net etkisi olumluydu: Sağlık Kampanyası şehir çapında
hizmeti ×1,35 ile 21 gün taşıyordu. Kredinin erken avantajı üç tohumda da
erimez oldu; ihraç kalkanının sınanabildiği tohum üçten bire indi. Kampanya
×1,2 ve 16 güne indi. Karşısına Grip Mevsimi kondu, günlük olasılık %3'ten
%2,5'e indi. Ağırlıkta iyi ve kötü yarı yarıya (36'ya 37).

**Dört sektör CEO'su.** Eski altı CEO'dan yalnızca biri (Bakkal Çırağı) bir
kategoriye bağlıydı. Yeniler Tur 25'te çoğalan kategorilere birer yüz
veriyor; her birinin bir sektör kalite artısı (+0,10) ve bir bedeli var:

| CEO | Artı | Bedel |
|---|---|---|
| Şef | yeme-içme kalitesi, işletme gideri −%5 | arsa +%10 |
| Moda Tasarımcısı | perakende kalitesi, marka ×1,3 hızlı | inşaat +%8 |
| Teknoloji Girişimcisi | elektronik kalitesi, başlangıç markası 0,18 | sermaye −%15 |
| Hekim | hizmet kalitesi, işletme gideri −%6 | marka ×0,8 yavaş |

Vekille ölçüldü (5 günde bir oynayan, seed 1, 7, 42, 720. gün ortalama net
değer). CEO'suz oyun 148,9 M; eski altının ortalaması 148,3 M (Pazarlamacı
133,0 – Finansçı 158,0). Yeniler: Şef 155,7 · Teknoloji Girişimcisi 150,0 ·
Hekim 152,0. Moda Tasarımcısı ilk ayarda (inşaat +%12) 131,5 M ile en
zayıftı; ceza %8'e inince 139,3 M. Vekil markaya yatırım yapmadığı için
marka CEO'ları bu ölçümde hep biraz geride; Pazarlamacı da öyle. Kurulum
ekranı on kartı aynı ızgarada gösteriyor, portreler parametrelerden.
Masaüstünde serbest dizilim 6 + 4 bırakıyordu; geniş ekranda artık beş
sütun (5 + 5). Telefonda iki sütun, taşma ve yatay kaydırma yok.

**İhraç kalkanının sonu artık açıkça sınanıyor.** Son ayardan sonra tek bir
kontrol kırmızıydı: seed 7'de ihraç eden oyuncu da düşüyordu (825 → 885).
Teşhis:

- Meridyen tek baskıncı. Üç ihraç 671, 727 ve 791. günde yapılıyor;
  kurucu tabanı (%51) yatırımcıyı %48,8'de bırakıyor.
- Kalan %51,2 serbest hisseyi tek başına topluyor; 885. günde payı %50,7.
- Main'de seed 7 bu yüzden değil, iki baskıncı hisseyi bölüştüğü için
  ayaktaydı (Nova %27 + Meridyen %24, serbest sıfır). Yeni olaylar rakip
  ekonomisini kaydırınca Meridyen tek kaldı.

Bu, Tur 21'den beri belgede yazan "kalkanın bir sonu var" cümlesinin
kendisi. Kontrol ise her tehditli tohumda 900. güne kadar ayakta kalmayı
istiyordu.

18 tohumda ölçüldü (savunmasız düşen oyuncu, ihraçla). Main'de 8/8 ayakta,
dalda 9/10; düşen yalnızca seed 7. Seed 2, 6 ve 42'de tek baskıncı 900.
günde %49, %40 ve %47'de. Oradaki "ayakta" ufkun sonu.

Kontrol artık iki şey istiyor:

1. kalkan tehditli tohumların çoğunu ayakta tutuyor (en az iki);
2. kalkanla düşüş yalnızca belgelenen sondan geçebilir: kurucu tabanına
   inilmiş, baskıncı serbest hissenin tamamını tek başına toplamış (kontrol
   dışındaki en büyük pay %2'nin altında) ve düşüş savunmasızdan sonra.

Bölüşülmüş paydan, blok satıştan ya da tabana inmeden gelen bir düşüş
kontrolü kırıyor. Kalkanın sonunu oyuncu açısından ele almak bir tasarım
sorusu; §4.6'da açık kalem.

**Testler.** Yeni `events.test.ts` (4 test):

- şehirde aynı anda en fazla iki olay, sektörde en fazla bir;
- sektör olayları her gün silindiğinde şehir takvimi birebir aynı —
  sınırı bütün olaylara saydıran mutasyon bu testi kırıyor;
- her sektör olayı sekiz tohumda en az bir kez çıkıyor;
- aynı olay üst üste binmiyor.

Sözlük testi iki listeyi de tarıyor (`ALL_EVENTS`); bütün yeni olay ve
CEO metinlerinin İngilizcesi var. Oynanış testi kurulum ekranında on CEO
kartı ve on portre bekliyor.

### Tur 28 — Geri alım serbest piyasadan: kalkan kalıcı olabiliyor

Tur 27'nin açık kalemi (§4.6): kurucu tabanına inmiş oyuncuyu, serbest
hissenin tamamını tek başına toplayan baskıncı yine düşürüyordu. Kullanıcı
üç seçenekten (b)'yi seçti: geri alım serbest piyasadan.

**Kusur.** Tur 19'dan beri ihraç yapmış şirketin geri alımı önce yatırımcı
payını geri alıyordu. Kurucu payı büyüyor, serbest hisse yerinde kalıyordu.
Baskın altındaki "Kendi Hissen" bloğunun "geri al" düğmesi ihraçtan sonra
savunma olmaktan çıkıyordu. Üstelik düğme bunu söylemiyordu; hisse
"hazineye çekildi" diyordu ama dolaşım değişmiyordu.

**Kural.** Geri alım artık her zaman serbest hisseden hazineye. Yatırımcı
payı kalıcı; ihraç formu bunu zaten "kalıcı pay" diye anlatıyordu.
Kalkanın kalıcı olmasının hesabı:

- kurucu tabanında yatırımcı %48,8'de;
- hazineye ~%1,2 çekilince yatırımcı ve hazine yarıyı buluyor;
- tek baskıncı kalan her şeyi alsa da en fazla %50'ye çıkıyor, eşik %50'nin
  üstü.

Bedeli nakitte küçük (seed 7'de 235 hisse, 1,88 M ₺). Asıl bedel ihraçta:
şirketin sonraki bütün büyümesinin %49'u yatırımcının. Kalkan kalıcı,
ama yarım bir şirketin kalkanı.

**Ulaşılabilir pay.** Kilidi hesaplamak için ortak bir ölçü
(`controlReach`): bir hissedar en fazla kaç hisseye ulaşabilir?

- *İhraç yapmış hedef:* elindeki pay artı serbest hisse. Yatırımcı satmıyor,
  hazine satılmıyor, blok alım bu hedefte yok (Tur 25).
- *İhraçsız hedef:* hazine dışındaki her şey. Kilitlenen yarışta rakipler
  birbirinden blok alabiliyor. Bu yüzden ihraçsız şirketi geri alımla
  kilitlemek hisselerin yarısını hazineye çekmek demek; pratikte kilit
  ihraçtan sonra geliyor.

`buybackToLock` kilide kalan hisseyi veriyor. Sıfır kilitli demek; serbest
hisse yetmiyorsa geri alımla kilitlenemiyor demek.

**Rakipler de aynı ölçüyü okuyor.**

- Baskıncı, kontrolünü artık alamayacağı hedefe nakit gömmüyor, sıradakine
  geçiyor. Eskiden yalnızca serbest hissesi sıfır olan hedefi atlıyordu.
- Kilitli şirket boşa geri alım yapmıyor; geri alım kilide yeteni geçmiyor.

**Arayüz.** Baskın altındayken "Kendi Hissen" bloğu iki şeyden birini
söylüyor. Ya "Kalıcı kalkan: hazineye N hisse daha çekersen hiçbir
hissedar %50'yi geçemez" ve düğme kilide yetecek kadarını alıyor. Ya da
"Kontrol kilitli" ve düğme kalkıyor, çünkü fazlası boşa nakit.

**Ölçüm.** Denge testinde kalkan bölümüne üçüncü bir kol eklendi. Oyuncu
baskıncı %30'u geçince ihraç ediyor; ihraç kapanınca (kurucu tabanı) kilide
yetecek kadar geri alıyor.

| Tohum | Savunmasız | Yalnız ihraç | İhraç + geri alım |
|---|---|---|---|
| 7 | 825. gün | 885. gün (kalkanın sonu) | ayakta, 235 hisse (1,88 M ₺) |
| 42 | 858. gün | ayakta | ayakta, 235 hisse (2,85 M ₺) |
| 5 | 662. gün | ayakta | ayakta, geri alım gerekmedi (iki rakip bölüşmüş, ikisi de yarıya ulaşamıyor) |

"Yalnız ihraç" kontrolü olduğu gibi duruyor: kalkanın sonu hâlâ ihracın
kendi sonu. Yeni kontrol, geri alımla o sonun kapandığını ve ihraçla düşen
tohumda geri alımın gerçekten iş gördüğünü istiyor.

**Testler.**

- *Birim (4 test, biri eskisinin yerine):*
  - geri alım hazineye gidiyor, yatırımcı payı yerinde kalıyor;
  - kurucu tabanında kilit: tek baskıncı serbest hissenin hepsiyle de
    geçemiyor;
  - ihraçsız şirkette kilit yarıyı istiyor;
  - rakip kilitli hedefe baskın yapmıyor, kilitsiz hedefe yapıyor. Baskın
    filtresini kaldıran mutasyon bu testi kırıyor.
- *Oynanış (2 yeni, duman koşusunda da):* blok kilide kalan hisseyi
  söylüyor; düğme serbest hisseden hazineye çekiyor ve blok "kontrol
  kilitli"ye dönüyor.

**Yol boyunca.** Oturumun konteyneri iş ortasında yeniden kuruldu ve commit
edilmemiş değişiklikler gitti. Hepsi bağlamdan yeniden uygulandı; bu
turdan itibaren ara commit'ler daha sık.

### Tur 29 — Yeni ürün zinciri: deri ve ayakkabı

Tur 27'de ertelenen iş. Kullanıcı "önce yeni ürün zinciri, sonra eşzamanlı
şehirler" dedi.

**Neden perakende.** Yeni ürün, rafı boş duran bir mağazaya gitmeliydi:

- Mağazalar Zinciri'nin dört rafından ikisi, süpermarketin üç rafından biri
  boştu.
- Market erken oyunun nakit omurgası; oraya üçüncü ürün, bakkalın tek
  rafını en çok sarsacak yer.
- Elektronik ve yeme-içmede iki raftan büyük mağaza yok; üçüncü ürün orada
  hiçbir rafa sığmazdı.

**Zincir.** Ham deri (12 ₺) → deri (25 ₺) → ayakkabı. Raf maliyeti 7,5:
25 + 7,5 = 32,5, perakendenin kimliği (65 × 0,50). Her şeyi pazardan alan
oyuncunun ayakkabı maliyeti giyimle aynı; zincir onu aşağı çekiyor.

| Bina | Rol | Maliyet | Gider/gün | Kapasite | Açılış |
|---|---|---|---|---|---|
| Besi Çiftliği | hammadde | 560 B ₺ | 1.760 | 700 ham deri | 2,4 M ₺ |
| Tabakhane | işleme | 404 B ₺ | 1.264 | 460 deri | 2,0 M ₺ |

Oranlar pamuk tarlasının ve döşeme fabrikasının aynısı (kapasite × fiyat /
gider, maliyet / gider). İkisi de yalnızca sanayi ve limanda. Sahnede kendi
detayları var: ahır çatısı ve ağıl çiti; sepi tankları ve ince baca.

**Talep bölünüyor, eklenmiyor — ölçüldü.** İlk sürüm ayakkabıyı ek harcama
yaptı. Her arketipin perakende ağırlığı ayakkabının payı kadar büyüdü,
giyim ve ev tekstilinin mutlak talebi her bölgede birebir korundu. Ama
toplam tüketici harcaması ~%9 büyüdü ve oyun kolaylaştı; altı kontrol
düştü:

- Dengeli'de yavaş oyuncu düşmez oldu (Acımasız 454. gün);
- büyük şehirde zafer 569. güne geldi (eşik 600);
- kalkan testlerinin sınayacağı tehdit kalmadı;
- şehir dönüşümü (rezidans) yavaşladı.

Kategori talebi Tur 1'den beri ürünler arasında bölünüyor; ayakkabı da
öyle. Ağırlıklar ve kişi başı talep main'le aynı. Tek raflı butik bölgenin
en iyi ürününü taşıyıp uzmanlaşıyor; dört raflı Mağazalar Zinciri üçünü
birden topluyor — rafların tasarlandığı ayrım.

**Her ürün bir yerde kazanmalı.** İlk ayarda ayakkabı hiçbir arketipte
rafın en iyisi değildi; tek raflı dükkânın seçimi sahteydi ("her ürün en
az bir bölgede kazanıyor" kontrolü yakaladı). Ayakkabının payı 0,45; öğrenci
(×1,5) ve çarşı (×1,45) bölgelerinde önde.

**Ölçüm.** Vekil 5 günde bir oynuyor, 720 gün:

| | main | dal |
|---|---|---|
| Oyuncu net değeri (1 / 7 / 42) | 157,0 / 137,6 / 152,3 M ₺ | 154,6 / 143,7 / 150,3 M ₺ |
| Butik başına günlük ciro | 4.921–5.064 | 4.669–4.782 (−%5) |
| Mağazalar Zinciri başına ciro | 38–42 B | 39–40 B |
| Ayakkabı rafı / deri tesisi | — | 14–15 raf · 0–3 tesis |

Butik biraz geriledi (kapasitesi günde 70, çoğu bölgede zaten dolu);
oyuncunun net değeri ±%4 içinde.

**Eski kayıtlar.** Kayıt şeması ürün listesini taşımıyor. Deri zinciri
gelmeden kaydedilmiş şehirde ham deri ve derinin pazar referansı yoktu;
spot fiyat `reference ?? 1` ile ilk fazla üretimde tabana çökerdi. Spot
fiyat adımı eksik girdileri bugünkü bölgelerden türetiyor; yeni oyunda hiçbir
şey eksik değil. Bekleyen holding şehirleri de kayıttan geçmeden döndüğü
için bu iş göçte değil motorda. İçerik sürümü 5 → 6.

**Testler.**

- `goods.test.ts` (3 test): perakende talebi korunuyor, butik bir ürün ve
  Mağazalar Zinciri üç ürün taşıyor, ayakkabı öğrenci ve çarşıda önde.
- Kayıt testi: deri ürünlerinin pazar girdileri silinmiş bir kayıt
  yükleniyor; ilk gün referans ve spot fiyat (25 ve 12) yerinde.

### Tur 30 — Holding şehirleri eşzamanlı yaşıyor

Tur 22'de bilinçli olarak yapılmayan iş: bekleyen şehir donuktu. Takvimi,
rakipleri ve gelişimi duruyordu. Kasaya ayrıldığın gündeki kâr eğiliminin
yarısı akıyordu — hiç değişmeyen, hiç risk taşımayan bir gelir. Tur 22'nin
gerekçesi iki maliyetti: her sistemin "hangi şehir" sorusunu bilmesi ve
günün şehir sayısı kadar pahalılaşması.

**Mimari: günün kendisi ayrıldı.** `GameEngine.runDay`'in şehir sistemleri
(takvim, olaylar, pazar, rakipler, banka) `simulateCityDay` olarak ayrı bir
modülde (`day.ts`). Bekleyen şehir de aynı fonksiyonu kendi durumuyla
çağırıyor; hiçbir sistem "hangi şehir"i bilmiyor, birinci maliyet hiç
doğmadı. Haber eşikleri, sıralama ve liderlik oyuncunun gözünün önündeki
şehrin işi, motorda kaldı. Sıra birebir aynı: holding'siz oyunun davranış
özeti main'le eşit.

**Uzaktan yönetim.**

- *Kâr payı:* bekleyen şehrin o günkü kârının yarısı holding kasasına,
  yarısı şehirde. Kasaya çıkan para şehirden çıkmış sermaye sayılıyor;
  zafer ölçüsü buna göre düzeliyor.
- *Yerel müdür:* yalnızca sendikaya uzlaşmayla cevap veriyor (oyuncu
  uzaktayken grev çıkmasın). Yatırım ve baskına karşı savunma oyuncunun
  işi.
- *Haber oynanan şehre:* uzaktaki şehirde baskın %25'i ve %40'ı geçince
  (her eşik bir kez), şehir kaybedilince, zafere ulaşınca. Uzaktaki şehrin
  kendi haber akışını kimse okumuyor.
- *Kaybedilen şehir* yaşamıyor ve ödemiyor.
- *Şehir değişimi:* bilinen baskın yeniden haber olmuyor (baskın eşiği
  motorla holding'in ortak ölçüsü, `raidStatus`).
- *Şehirler paneli:* uzaktaki şehir "Uzaktan yönetiliyor"; satırda dünkü
  gerçek kâr payı ve %10'u geçen baskın (%25'ten itibaren kötü haber
  rengi). Panel, yeni şehir formu, oyun sonu notu ve Yardım yeni modeli
  anlatıyor (tr/en).

**Ölçüm (denge testi, holding bölümü; vekil ikinci şehre geçiyor ve geri
dönmüyor).**

| Tohum 1 / 7 / 42 | main (donuk) | dal (yaşayan) |
|---|---|---|
| 2. şehir zafer günü | 473 / 461 / 470 | aynı |
| Kasa, 2. zaferde | 79,2 / 71,6 / 77,8 M ₺ | 75,5 / 70,0 / 74,6 M ₺ |
| Holding değeri | 279 / 272 / 278 M ₺ | 351 / 335 / 350 M ₺ |
| Kurucu şehir uzakta | donuk, 80 M ₺ | 80 → 156 / 145 / 156 M ₺ |
| En büyük dış pay (kurucu şehirde) | — | %7 / %42 / %0 |

Kasa donuk modeldekine yakın (−%2..−%5); fark kurucu şehrin kendisinde.
Uzakta da büyüyor: yerleşik mağazaları satıyor, arazisi değerleniyor.
Holding değeri dörtte bir büyük. Risk de gerçek: tohum 7'de bir rakip
kurucu şehirde %42'ye geldi (vekil geri dönüp savunmuyor; oyuncuya
%25'te ve %40'ta haber düşüyor).

Tur 22'nin iki kontrolü bilerek değişti. "Bekleyen şehrin takvimi duruyor"
yerine: kurucu şehir de yaşıyor, takvimler birlikte. "Kasaya her gün
eğilimin yarısı akıyor" yerine: kasaya akan her lira kurucu şehirden çıktı
(kasa, şehirden çıkan sermayenin defterine birebir eşit). Para yoktan
doğmuyor; donuk modelde doğuyordu.

**Hız.** Üç şehirli holdingde günün maliyeti ×2,84 (bu makinede 10 → 29
ms/gün, büyümüş şehirler). En hızlı oyun hızı günde 480 ms; üç şehir
bunun ~%6'sı.

**Testler.**

- *Holding birim testleri:* bekleyen şehir yaşıyor ve kârının yarısını
  ödüyor; kaybedilen şehir yaşamıyor; takvimler birlikte; uzaktaki rakipler
  kurmaya devam ediyor; uzak şehirde %25 baskın oynanan şehre bir kez haber;
  yerel müdür sendikaya uzlaşmayla cevap veriyor.
- *Oynanış testi:* kurucu şehre dönünce o da 20 gün yaşamış; uzaktaki
  şehrin satırı durumu, günü ve kâr payını gösteriyor.

### Tur 31 — Lig güvenliği: kanıta güven, satıra değil

§4.9'un son açık kalemi. Tablo sunucusuz: claude.ai'nin paylaşılan
deposunda her kişi yalnızca kendi satırına yazabiliyor (`league/{self}`).
Ama satırın içeriği tamamen onun tarayıcısından geliyor ve tablo bu
beyana güveniyordu:

| Tehdit | Önce | Şimdi |
|---|---|---|
| Şişirilmiş skor | biri "Doğrula"ya basana kadar tablonun tepesinde | her tarayıcı her satırı kendiliğinden yeniden oynatıyor; sıralama yalnızca doğrulanmış koşulardan, tekrarın skoruyla |
| Sahte eğri, ad, CEO | satırın kendi alanlarından gösteriliyordu | doğrulanmış koşunun kendisinden; eğri tekrarla birebir tutmalı (hayalet de yalan söyleyemiyor) |
| Satırın beyanı ile kod farklı | yalnızca skor ve hafta karşılaştırılıyordu | skor, hafta, ad ve CEO; uymayan satır tekrar başlamadan reddediliyor |
| Dev ya da bozuk kod | herkesin tarayıcısını kilitleyebilirdi | 1,2 M karakter ve 12 bin komut sınırı; tanınmayan komut, sınır dışı gün, bilinmeyen CEO, uzun ad, sonsuz sayı reddediliyor; tekrar hatası yakalanıyor |
| Güncellemeyle tutmayan dürüst koşu | "tutmadı" | koşu kodu v2 simülasyon parmak izi taşıyor: başka sürümde oynanmış koşu "farklı sürüm (sahte değil)"; izsiz eski kod ayrı etiketli |
| Başkasının koşusunu kopyalamak | yakalanmıyordu | aynı eğri ve skor "aynı koşu" — bir kez sayılıyor |

**Parmak izi.** Sabit bir dünyada 60 günün sayısal izdüşümünün özeti:
şirket nakdi ve değeri, binalar, spot fiyatlar, zar durumu. Metinler (haber,
ad) iz dışında; dil değişince iz değişmiyor (sınandı). Sürüm sayacı elle
artırılsaydı unutulurdu: Tur 28, 29 ve 30'un üçü de simülasyonu değiştirdi.
İz kendiliğinden değişiyor. Tarayıcıda parça parça hesaplanıyor (10 günde
bir nefes); tablo ilk çizimde beklemiyor.

**Doğrulama kuyruğu.** Bir tekrar 360 gün (~1–3 sn). Kuyruk:

- tek tek, beyan edilen skora göre işliyor; tablonun tepesi önce oturuyor;
- sonucu yerel depoda tutuyor (anahtar kod + beyan; her sonuç doğrulandığı
  izi taşıyor, güncellemeden sonra eski sonuç okunmuyor);
- yalnızca lig paneli açıkken işliyor: oyun sürerken arka planda tekrar
  koşup kare düşürmesin. Gündem çipindeki hayalet önbelleği okuyor;
  doğrulanmamış hayalet "henüz doğrulanmadı" diye işaretli.

**Tablo.**

- Doğrulanmış sıralama: tekrarın skoru, adı ve CEO'su.
- Altında, ayrı ayrı:
  - sırada bekleyenler (beyan ve ilerleme);
  - aynı koşular ("X'in koşusunun aynısı — bir kez sayıldı");
  - doğrulanamayanlar (açılır; neden ve tekrarın bulduğu skor).
- Elle "Doğrula" düğmesi kalktı; kod yapıştırarak doğrulama duruyor.
- Biten koşuda gündemde "Lig … · tablo" çipi var: sonuç ekranı kapanınca
  tabloya dönüş yolu yoktu, doğrulama da panel açıkken koşuyor.
- Yerel tablo (paylaşılan depo yokken) aynı tarayıcının başka sekmesinden
  gelen koşuyu da görüyor. Önceden depoyu yalnızca abonelikte ve gönderimde
  okuyordu; gündem çipinin hayaleti aboneliği açık tuttuğu için sonradan
  gelen satır hiç görünmüyordu. Tam oynanış testi yakaladı.

**Bilinen sınır: kopya önlenemiyor, görünür kılınıyor.** Koşu kodu tabloda
açık. Şirket adı simülasyonu değiştirmediği için biri başkasının koşusunu
kendi adıyla yazabilir ve kopya doğrulanır (birim testi bunu açıkça
sınıyor). Tablo aynı eğri ve skoru bir kez sayıyor; hangisinin önce
gönderildiğini ise satırın kendi beyan ettiği zaman söylüyor —
sunucusuz bir tabloda başka saat yok. Hiç oynanmamış koşular (boş günlük)
kopya sayılmıyor, ikisi de aynı taban eğriyi çizer.

**Testler.**

- *Birim (9 yeni):*
  - v2 ve iz (kararlı, dilden bağımsız);
  - dürüst koşu (her şey tekrardan);
  - beyan uyuşmazlığı (dört alan);
  - kodla birlikte şişirilen skor ("replay", tekrar gerçek skoru buluyor);
  - sahte eğri ("curve");
  - sürüm farkı ve izsiz eski kod;
  - bozuk, dev ve tanınmayan komutlu kod;
  - sıralama (sahte, bekleyen, kopya, boş koşu);
  - adı değiştirilmiş kopya.
- *Oynanış:* koşu kendiliğinden doğrulanıp sıralamaya giriyor; tabloya
  sahte ve kopya satır enjekte ediliyor. Sahte sıralamaya girmiyor (nedeni
  "tekrar tutmadı", tekrarın skoru yazıyor); kopya doğrulanıyor ama bir kez
  sayılıyor. Biten koşuda tabloya gündemden dönülüyor.

### Tur 32 — Holding derinleşiyor: uzaktan yönetim

Kullanıcı "şehir/holding katmanını derinleştir" dedi. Tur 30'dan beri
uzaktaki şehirler yaşıyordu ama oyuncunun onlar üzerinde kararı yoktu:

- kârın sabit yarısı kasaya akıyordu;
- baskına karşı savunmak için şehre geçmek gerekiyordu;
- kasanın tek kullanımı oynanan şehre aktarımdı;
- holding'in bir hedefi yoktu: üç şehir açılınca katman bitiyordu.

**Şehir talimatları.** Uzaktaki her şehrin satırında, geçiş yapmadan:

- *Kâr payı:* şehirde tut (%0) · yarısı (%50, varsayılan) · hepsi (%100).
- *Savunma:* açıkken en büyük dış pay %20'yi geçince yerel müdür serbest
  hisseden geri alıyor, kontrol kilitlenene kadar (Tur 28'in kilidi).
  - Oyuncunun kendi geri alımıyla aynı yol ve günlük tavan.
  - Günde nakdin yedeğin (320 B ₺, rakiplerin savunma yedeği) üstündeki
    kısmının en fazla %40'ı.
  - Para şehrin kendi kasasından; kâr payından önce koşuyor.
  - Kilitliyken para harcamıyor.
- Talimat şehrin kendi durumunda (`remote`). Geçişlerde şehirle birlikte
  gidip geliyor; şehir oynanırken okunmuyor. Varsayılan (yarısı, savunma
  kapalı) Tur 30 davranışının aynısı.
- Satır savunmanın durumunu tek cümleyle söylüyor: dün kaç hisse aldı ve ne
  ödedi, kilide kaç hisse ve ne kadar kaldı, kilitliyse harcamadığını.
- Uzak baskın haberi talimata göre değişiyor: savunma kapalıysa "talimat
  ver, para gönder ya da geç", açıksa "yerel müdür geri alıyor".

**Kasa her şehre.** Aktarım uzaktaki şehre de çalışıyor: savunma bütçesi
göndermek ya da orada biriken nakdi çekmek için geçiş gerekmiyor. Para o
şehrin "aktarılan sermaye" defterine yazılıyor; zafer ölçüsü o şehirde
düzeliyor. Panelde aktarımın şehri seçiliyor.

**Holding hedefleri.** Dört basamak, sırayla:

1. İkinci şehre açıl
2. İki şehirde zafer
3. Üçüncü şehre açıl
4. Üç şehirde zafer — "Holding tamamlandı" haberi bir kez; oyun serbest
   sürüyor.

Açılan şehir `opened` sayacından, zafer sayısı şehirlerin kendi
kayıtlarından okunuyor. En fazla üç şehir olduğu için kaybedilen bir şehir
son basamağı kalıcı olarak imkânsız kılıyordu. Artık kaybedilen şehir
kapatılabiliyor: yeri boşalıyor, yeni şehir açılabiliyor ve orada
önceden kazanılmış zafer sayılmaya devam ediyor (`closedWins`).

**Ölçüm (denge testi, holding bölümü).** Kurucu şehir uzaktayken 470 gün,
aynı açılış anından ayrı motorlarda:

| Tohum 1 / 7 / 42 | Tepe dış pay | Kurucu şehir | Holding değeri |
|---|---|---|---|
| Yarısı (varsayılan) | %7 / %42 / %0 | ayakta | 351 / 335 / 350 M ₺ |
| Hepsi | %14 / %53 / %53 | tohum 7 ve 42'de kaybedildi (1004. ve 1012. gün) | 351 / 238 / 262 M ₺ |
| Hepsi + savunma | %14 / %21 / %25 | ayakta; savunmanın bedeli 0 / 39 / 41 M ₺ | 351 / 296 / 305 M ₺ |
| Şehirde tut | %0 / %0 / %0 | ayakta | 351 / 341 / 350 M ₺ |

Kararlar gerçek bir takas oldu ve bu takas kurala yazılmadı, pazardan
doğdu:

- *Hepsini çekmek şehri ucuzlatıyor.* Nakit şirket değerinin parçası;
  nakitsiz şehrin hissesi ucuz ve baskıncı gelip alıyor.
- *Savunma tutuyor ama pahalı.* İhraçsız şirkette kilit, şirketin yarısını
  hazineye çekmek demek. Hazinedeki hisse net değere girmiyor, yani bedel
  gerçek.
- *Şehirde tutulan kâr baskını caydırıyor.* Holding değeri yarısıyla aynı,
  çünkü para kasada değil şehirde duruyor. Kasanın avantajı likidite:
  oradaki para her şehre gidebiliyor.

Holding'siz oyunların davranış özeti (üç 240 günlük koşu) main ile bayt
bayt eşit.

**Testler.**

- *Birim (4 yeni):*
  - kâr payı hiç / yarısı / hepsi ve talimatın geçişlerde korunması;
  - savunma: kapalıyken almıyor; açıkken kendi kasasından alıyor ve yedeği
    koruyor; kilitliyken duruyor;
  - uzak şehre aktarım (kaybedilen şehre yok);
  - hedef merdiveni, tamamlanma haberinin bir kez düşmesi, kaybedilen
    şehrin kapatılması.
- *Denge (4 yeni kontrol):* yukarıdaki tablonun dört iddiası. Holding
  bölümü 35 → ~100 sn.
- *Oynanış (5 yeni):* hedefler, panelden kâr payı, %24'lük baskında
  savunma, kasadan uzak şehre aktarım, kaybedilen şehrin kapatılması.
  Telefon genişliğinde (390 px) panel taşmıyor; ayrı denendi, seçiciler
  tek satırda.

Bir ölçüm dersi: i18n testi Türkçeden çıkarılıp İngilizcede kalan bir yer
tutucuyu (`{city}`) yakaladı. Türkçede şehir adından sonra ek getirmek
("Yeşilova'ya", "Kuzeykent'e") sabit bir ekle yapılamıyor; metin adı ek
almayacak şekilde yeniden yazıldı, düğmeler ok kullanıyor
("Kasa → Yeşilova").

### Ara düzeltme — zincir kartı krizde sessiz kalıyordu

Tur 31'in birleşmesinden sonra main'deki tam oynanış koşusu dört kontrolde
düştü. Kart hamle önermedi; zincir kurulamayınca üç kamyon kontrolü de
düştü. Yerelde ve PR'larda (duman koşusu) görünmüyordu.

- *Sebep:* o koşuda kartın ilk yuvası "Kriz"deydi (Tur 27'nin sektör
  olayları). Hammadde pahalanınca ara mal ünitesinin geri ödemesi sonsuza
  gidiyor ve kart onu sessizce atlıyordu. Hamle de sebep de yoktu. Hangi
  gün hangi olayın düştüğü kare zamanlamasına bağlı: main'de beş
  birleşmenin birinde.
- *Ürün:* kart artık sebebini yazıyor ("{girdi} krizde ({fiyat}): bu
  fiyatla {ünite} kâr etmiyor. Kriz geçince hamle geri gelir.").
- *Test:* yeni `chain.test.ts`. Düzeltme olmadan düşüyor. Oynanış testi
  zincir bölümünden önce aktif olayları temizleyip spot fiyatları tabana
  çekiyor: test o günün pazarını değil kartın arayüzünü ölçüyor.
- *Sonra:* düzeltmeden sonraki main tam koşusu zincir kontrollerini
  geçti; bu kez dışa aktarmanın indirme olayı 5 sn'lik süreyi aştı. O koşu
  yavaştı (1438 sn, 2 FPS); uygulama indirmeyi başlatmıştı. Süre 20 sn
  oldu.

Ders: PR'lar duman koşusunu, main tam koşuyu çalıştırıyor. Bir PR'ın yeşili
main'in yeşili değil; birleşmeden sonra main'in koşusuna da bakılmalı.

### Tur 33 — Kenney tarzı grafik denendi, geri alındı

Kullanıcı grafik için B'yi seçti: hazır model kiti değil, aynı prosedürel
geometri ama Kenney'nin görsel diliyle. Yapılan:

- pastel duvarlar, şirket rengi çatıda;
- bina renginden bağımsız mavi cam;
- gri yollar ve beyaz çizgiler;
- canlı yeşil kırsal;
- iki toplu ağaçlar ve tıknaz oyuncak arabalar;
- ACES yerine nötr ton eşleme.

Testlerin hepsi geçti (çizim çağrısı aynı, oynanış 333/333). Canlıya alındı.

**Kullanıcı beğenmedi:** "grafikte bir tık geri gittik". Üç somut şikâyet:

- *Şehrin dışındaki ağaçlar leke gibi.* Kırsalın ağaçları dokuya boyanmış
  koyu lekeler; Tur 33'ün canlı yeşili onları daha da belirgin yaptı.
- *Araçlar çok kötü, hayat yok.* Tıknaz araba kamera uzaklığında renkli
  bir blok; sokakta canlılık hissi vermiyor.
- *Binalar öncekinden kötü.* Nötr ton eşleme ve pastel duvar derinliği
  düzleştirdi; şehir plastik ve oyuncak gibi okundu.

Tur 33'ün tamamı geri alındı (yerine eski görünüm).

Ders: testler ve ölçüm "kötüleşmedi"yi kanıtlayabiliyor, "güzelleşti"yi
kanıtlayamıyor. Görsel işte karar kullanıcının gözü. Bundan sonra görsel
değişiklik canlıya alınmadan önce önce/sonra kareleri gösterilip onay
alınacak.

### Tur 34 — Eski görünüm + canlılık

Kullanıcının yönü: "eski stil + canlılık". Işık, ton eşleme, duvar ve
zemin renkleri Tur 33 öncesiyle aynı; yalnızca parça eklendi. Dört
öncelik, dördü de yapıldı:

**Kırsal.**
- Boyalı lekeler kaldırıldı. Yerlerine 46 orman kümesi ve 260 tek ağaç
  geldi: yaprak döken ve iğne yapraklı, iki örnek ağı.
- Ağaçlar şehrin karesinin ve yerleşimlerin dışında; kalite kademesiyle
  seyreliyor, gece kararıyor.
- Uzak yerleşimler tek renk gri kutulardı ("moloz"). Artık soluk duvarlı,
  kiremit çatılı evler ve birkaç apartman.

**Araçlar.**
- Fon araçları üç türde: araba, minibüs, otobüs. Renkleri doğal; sayı
  48'den 60'a çıktı. Gece farlar ve stoplar yanıyor.
- Sarı taksi ve turuncu otobüs denendi, sonra çıkarıldı. Rakiplerin altın
  sarısı ve turuncusuyla karışıyorlardı. Bilgi taşıyan renk, süs taşıyan
  renkle yarışmamalı.
- Kamyon ve müşteri aracı ışıksız düz kutulardı. Köşeden bakınca düz
  altıgen çıkartma gibi duruyorlardı; kullanıcının "araçlar çok kötü"
  dediği şeyin büyük kısmı buydu.
  - Artık kamyon kasa + kabin + tekerden oluşuyor, müşteri aracı araba
    silüetinde.
  - Hâlâ ışıksız (gece de okunuyorlar); hacmi fırınlanmış köşe gölgesi
    veriyor.
  - Tekerler yolda, 5 cm havada süzülmüyorlar.

**Sokak hayatı.**
- Kaldırımda yayalar yürüyor. Gece üçte biri kalıyor; lenste susuyorlar.
- Duman bilgi taşıyor: yalnızca dün üretim yapmış tesisin bacasından ve
  şehrin çalışan "Fabrika" yapılarından çıkıyor. Girdisi kesilen tesis
  susuyor, zincirin nerede durduğu sokaktan okunuyor.

**Binalar.** İlk turda şehir dokusuna küçük parçalar eklendi: sokak kapısı,
apartman ve kulelerde giriş saçağı, kiremit çatılarda tuğla baca, apartmanlarda
balkon bantları, bazı kulelerde anten.

Kullanıcı ilk kareler için "binalarda pek bir şey değişmemiş" dedi ve haklıydı:
bu parçalar kamera uzaklığında kayboluyordu. İkinci turda en çok yer kaplayan
iki yüzey ele alındı:
- **Kırma çatıya kiremit dokusu:** şaşırtmalı derzli sıralar. Doku renk
  taşımıyor, çatının tonu aynı kaldı.
- **Cephe atlası 256'dan 512 piksele çıktı:**
  - konutta sıva, kat silmesi, söveli ve kayıtlı pencere, denizlik, cam
    yansıması;
  - ofiste panel başına gökyüzü yansıması ve döşeme paneli;
  - vitrinde raflar ve kapı;
  - sanayide kabartmalı oluklu sac.
- Gece dokusu aynı pencere yerlerini kullanıyor.

**Doğrulama.**
- Önce/sonra kareleri aynı kayıttan, aynı kameralardan çekildi: geniş,
  doğu, sokak, köşe, merkez, gece, sokak-gece, telefon.
- Kareler canlıya almadan önce kullanıcıya gösterildi; kullanıcı bina turundan
  sonra onayladı.
- Oynanış testine yeni kontroller eklendi:
  - kırsalda 3B ağaçlar;
  - üç tür fon aracı;
  - farlar gece açık, gündüz kapalı;
  - gece yaya azalıyor;
  - lenste yaya ve duman susuyor;
  - duman yalnızca üretim yapan tesisten çıkıyor.
- Duman kontrolünün ilk sürümü o an şehirde tesis olmadığı için 0 = 0 ile
  boşuna geçiyordu. Şimdi iki yönde sınanıyor:
  - bütün üretim sıfırlanınca hiçbir baca tütmemeli;
  - tek tesis üretince yalnızca o tütmeli;
  - tesis yoksa test sanayi parseline bir değirmen kuruyor.
- Yerel tam koşu: **339/339**, 0 konsol hatası. Çizim çağrısı 900 karede 36.

### Tur 35 — Arayüz: "Cam & Bulut"

Kullanıcının sırası: önce arayüz, sonra şehir grafiği, en son oynanış.
Arayüz Lite ile aynı aileye geçti; iki oyun aynı yayıncının iki oyunu
gibi görünsün diye.

**Seçim.**
- Gerçek oyunun üstünde üç seçenek denendi (`?ui=` önizlemesi, sonra
  kaldırıldı):
  1. Cam & Bulut — Lite'ın birebir aynısı;
  2. sade — küçük köşe, beyaz hap seçim;
  3. Gece camı.
- Kareler: kurulum, oyun içi, gece, açık panel, telefon.
- Kullanıcı "gündüz 1 veya 2, gece 3" dedi. Gündüz 1 alındı: 1 ile 3 aynı
  yapıda, geceye geçerken yalnızca renkler değişiyor. 2'nin parçalı
  şeritleri gece geçişinde yapıyı da değiştirirdi.

**Dil.** Yoğunluk korundu: aynı ızgara, aynı ölçüler, aynı bilgi. Değişen
yüzey:
- **Cam.** Paneller yarı saydam ve arkalarını bulanıklaştırıyor. Modal,
  bildirim ve rehber kartı "kalın cam".
- **Yuvarlak.** Kart 22 px, düğme 14 px, hücre 8 px; rozet, etiket ve
  çubuklar hap.
- **Parlak seçim.** Seçili sekme, hız, mercek ve seçenek mavi parlak
  düğme; ana eylem de öyle. Düğmeler alt kenarına oturuyor, basınca iniyor.
- Renk yine anlam taşıyor: mavi seçim, yeşil yükseliş, kırmızı düşüş.
  "Senin satırın" seçim mavisinin açık tonu.
- Kenar çubukları kalktı (haber, bildirim, savunma, sözleşme): yuvarlak
  kartın kenarına çubuk köşeyi kırıyor. Ton yerine başlık etiketinde,
  noktada ya da kenarlıkta.
- **Yazı tipleri.**
  - Fredoka başlıklar, isimler ve üst barın rakamları için.
  - Nunito gövde için; alt alta gelen rakamlar Nunito'nun eş genişlikli
    rakamlarıyla hizalanıyor.
  - İkisi de Lite'ın dosyalarından, Latin + Türkçe alt küme, CSS'e gömülü
    (`tools/make-cam-fonts.py`): 71 KB woff2.
  - Archivo + Martian Mono kalktı; CSS paketi 297 → 150 KB.
- Tanımsız belirteç kullanan elle aktarım kutusu (`--ink`, `--surface`)
  düzeltildi.

**Gece.**
- Aynı kurallar, Lite'ın gece belirteçleri (`:root[data-appearance='night']`).
- `appearance.ts` karar veriyor. **Otomatik** (varsayılan) iki şeye bakıyor:
  - cihaz koyu moddaysa hep gece;
  - değilse şehrin gün döngüsü.
- Şehir gecesinin iki eşiği var: gün ışığı 0,15'in altına inince gece,
  0,35'in üstüne çıkınca gündüz. Alacakaranlıkta yanıp sönmüyor.
- Geçiş 0,9 sn sürüyor ve yalnızca geçiş anında açık; hareket azaltılmışsa
  yok.
- Yardım panelinde Otomatik / Gündüz / Gece seçici var; seçim dil gibi
  tarayıcıda hatırlanıyor. `?appearance=night` bir kez geçersiz kılıyor.

**Dar ekran.**
- Bulanıklık kalkıyor, yalnızca kalın cam rengi kalıyor. İki sebebi var:
  - mobil GPU'da 3B sahnenin üstünde her kare yeniden hesaplanıyor;
  - `backdrop-filter`, sabit konumlu alt rıhtıma kapsayıcı blok oluyor.
- Önizlemede rıhtım bu yüzden üst bara yapıştı; mevcut test bunu
  yakalamıyordu, çünkü düğmeler yine "ekranda"ydı. Yeni kontrol rıhtımın
  alt kenarını ölçüyor.

**Doğrulama.**
- Oynanış testine "Görünüm" bölümü eklendi:
  - açık modlu cihazda gündüz, koyu modlu cihazda gece;
  - şehirde gece olunca arayüz geceye, sabah gündüze dönüyor;
  - Gündüz sabitlenince şehir gecesi arayüzü değiştirmiyor;
  - Gece seçimi yenilemeden sonra hatırlanıyor.
- Telefonlarda "rıhtım ekranın altında" kontrolü eklendi.

### Tur 36 — Şehir ayrıntısı

Sıradaki iş şehir grafiğinde ayrıntı ve çeşitti. Önce kareleri T34'teki
düzenekle çekildi: sabit kayıt, sabit kameralar. Dört şey göze battı:
- binaların tamamı sahibinin renginde, şehir mor ağırlıklı bir oyuncaktı;
- parseller düz pastel levhalardı;
- kavşakta kesikli çizgi ve kaldırım bandı karşıdan gelen yolun üstüne
  düşüyordu;
- gece bütün binalar aynı pencere desenini taşıyor, şehir çizgili
  görünüyordu.

**Gece pencereleri.**
- Gece dokusunda hangi pencerenin yanacağı sabitti ve her kat tekrarında
  aynıydı. Artık dokuda bütün pencereler ışıklı. Hangisinin yandığına
  gölgelendirici pencere başına karar veriyor:
  - doluluk bina başına %35–85;
  - konut pencerelerinin bir kısmı soğuk ışıklı;
  - ofislerde yarım kat bölümleri (tek tek yanan küçük camlar uzaktan
    kumlu bir parazit gibi okunuyordu);
  - vitrin hep yanık.
- Gece yarısına doğru yanık pencerelerin üçte biri sönüyor, sabaha doğru
  yeniden yanıyor.
- Zar flat değişkenlerden geliyor. Aradeğerlenen sabit değer piksel piksel
  küçük hatalar taşıyordu; zar bunları büyütüp aynı pencereyi kumlu bir
  parazite çeviriyordu.

**Sokak.**
- Yol dokusu üç hücreli atlas: düz yol, yaya geçidi, kavşak. Hücre örnek
  başına (`aRoadCell`), ek çizim çağrısı yok.
  - Kavşak düz asfalt; kaldırımlar köşelerde birleşiyor.
  - Kavşağa giren karonun ucunda zebra var.
- Dur çizgisi denendi ve çıkarıldı: fon araçlarıyla kamyonların şerit
  tarafı aynı değil, çizgi yarı yarıya yanlış şeride düşerdi.
- Gece lambaların altına sıcak, toplamalı bir ışık havuzu düşüyor. Tek
  örneklenmiş ağ; gündüz ve veri lensinde görünmüyor.

**Mahalle.**
- Parsel zemininde kaldırım bandı (küçük karolar, bordür) ve iri döşeme
  derzleri var. Doku renk taşımıyor: bölge tonu ve lens renkleri aynı.
- Müstakil evler bahçeli: çim, iki yanda çit, kapıdan kaldırıma yürüyüş
  yolu. Evler parseli kaplıyordu (0,8); bahçeye yer açmak için 0,62'ye
  indi.

**Bina rengi (A/B).** İki seçenek aynı karelerle gösterildi:
- **A:** renk bugünkü gibi gövdede.
- **B:** gövde doğal malzemede (sıva/tuğla, cam/çelik, sanayi paneli;
  kategori renginden yalnızca bir ima). Sahibin rengi çatı kapağında,
  kornişte, kırma çatıda, tentede ve tabelada.

Kullanıcı B'yi seçti. Kamera yukarıdan baktığı için en çok görünen yüzey
zaten çatı; kimin nerede olduğu okunmaya devam ediyor. Oyuncunun çatı
rengi kamyon ve müşteri araçlarıyla aynı nane yeşili.

**Doğrulama.**
- Oynanış testine eklenen kontroller:
  - kavşak ve yaya geçidi kendi dokusunda;
  - gece lambaların altına ışık düşüyor, gündüz düşmüyor;
  - gece yarısına doğru pencereler sönmeye başlıyor.

### Tur 37a — Geç oyun giderleri ve kriz dönemleri

Tur 37 dört aşamalı bir oynanış turu. Kullanıcı sekiz başlığın hepsini
seçti; aşamalar şöyle:
- **37a:** geç oyun giderleri ve krizler (bu tur);
- **37b:** seçimli olay kartları ve rakip hikayeleri;
- **37c:** fırsat balonları ve haftalık görevler;
- **37d:** mega projeler ve canlı pazar.

**Ölçüm önce.** Yeni termometre `pnpm longrun`: vekil oyuncu, üç tohum,
1440 gün. Tur 37a öncesinde gördükleri:
- Büyüme doğrusal: arsa ~720. günde bitiyor, bina sayısı 140–160'ta
  duruyor.
- 1440. günde servetin %94'ü nakit.
- Bakım ve ücret toplamı cironun yalnızca %19'u.
- Zafer 572–586. günlerde geliyor.

Kartopunun sorunu hız değil boşluk: büyüdükçe hiçbir şey zorlaşmıyor.

**Yönetim yükü.** Kuralı:
- 30 binadan sonra her bina, şirketin bütün bakım ve ücretlerine %0,4
  ekliyor; tavan +%60.
- Sayım gün başına bir kez yapılıyor. Her soruda saysaydık günlük adım
  bina sayısının karesine çıkardı.
- Aynı çarpan üç yerde kullanılıyor: gerçek defter, yatırım tahmini ve
  zincir kartının birim maliyeti. Böylece kart, yükü olan şirkete yanlış
  bir geri ödeme göstermiyor.

**Servet vergisi.** Kademeli ve şirket özkaynağı üzerinden alınıyor:
- 25 M ₺ üstüne %1;
- 100 M ₺ üstüne %2;
- 300 M ₺ üstüne %3.

Vergi dünkü net değerden hesaplanıyor ve defterde `tax` satırı olarak
görünüyor. Emlak vergisi denendi ve bırakıldı: geç oyunda mülk servetin
~%6'sı, vergisi gürültü düzeyinde kalıyordu.

**Kriz dönemleri.** İki kriz var:
- **Durgunluk:** talep %16 düşüyor, arsa geriliyor, inşaat %15
  ucuzluyor.
- **Faiz şoku:** kredili hesap ve yeni krediler +6 puan, talep %5 düşüyor.
  Bağlanmış kredi sabit faizde kalıyor; hazırlanan korunuyor.

Takvim:
- İlk uyarı 320–440. günler arasında geliyor.
- Kriz uyarıdan 30 gün sonra başlıyor ve 100–160 gün sürüyor.
- Bitişten 300–480 gün sonra yeni bir uyarı geliyor.

Zar dışsal: tohumdan ve günden geliyor, `state.rng`'den değil. Eşli
deneylerde iki kol aynı krizleri aynı günlerde yaşıyor. Birim testi, aynı
tohumda oyuncunun kararlarının kriz günlerini değiştirmediğini sınıyor.

Arayüz:
- Gündemde kriz çipi: uyarıda kesikli kenarlı, krizde dolu; ipucunda ne
  olacağı yazıyor.
- Şirket panelinde yönetim yükü yüzdesi ve günlük vergi.
- Yardım panelinde bir adım daha.

**Etkisi** (`pnpm longrun`, tohum 1/7/42; önce → sonra):

| | Önce | Sonra |
|---|---|---|
| Net değer, 360. gün | 37,6 / 41,0 / 45,6 M ₺ | 36,8 / 39,4 / 44,0 M ₺ (%2–4) |
| Net değer, 720. gün | 151 / 142 / 143 M ₺ | 126 / 115 / 118 M ₺ (%17–19) |
| Net değer, 1440. gün | 435 / 383 / 392 M ₺ | 294 / 293 / 273 M ₺ (%23–32) |
| Zafer günü | 572 / 586 / 586 | 623 / 645 / 638 |
| Bakım + ücret / ciro, 1440. gün | %19 | %30–35 |
| Oyuncu / en iyi rakip, 1440. gün | 1,24 / 1,02 / 1,19 | 1,35 / 1,18 / 1,29 |

Okuma:
- Erken oyun neredeyse aynı. Fren, şirket büyüdükçe sıkıyor.
- Asıl fren yönetim yükü. Servet vergisi 1440. günde günde ~13 B ₺,
  kârın %4–7'si.
- Rakipler de aynı kurallarla yavaşlıyor; oran biraz oyuncudan yana
  açıldı.
- Kasa hâlâ servetin ~%91'i. Biriken paraya harcanacak yer yok; bunu
  37d'nin mega projeleri karşılayacak.

**Yan etki ve denge sınavı.** Atıl oyuncuyla dört tohumda ölçüldü:
yönetim yükü rakiplerin bina sayısını %1–3 artırıyor, 720. günde boş
parsel 5–13 daha az. Fark küçük ama sistematik. İmar bölümündeki
"açılan bölgeden parsel alınabiliyor" kontrolü bu yüzden düştü: kontrol
560. günde yapılıyordu ve tohum 19'da son bölgenin 64 parseli o güne
kadar bitmişti. Kontrol artık bölgenin açıldığı gün yapılıyor. Sınanan
şey imar kapısı, arazinin bolluğu değil. Denge sınavı ve benchmark
`flags.lateCosts = false` ile eski zeminde ölçmeye devam ediyor. Krizler
laboratuvarda olaylarla birlikte zaten kapalı (`randomEvents`).

**Baskın tehdidi azaldı.** Yönetim yükü yavaş oyuncudan çok büyük
rakipleri frenliyor; sıralama sıkışıyor. 20 tohumda ölçüldü (900 gün,
15 günde bir oynayan savunmasız oyuncu):
- yük yokken 9 tohumda baskınla düşüyordu, yükle 5 tohumda;
- 900. günde en iyi rakibe oranı 0,5–0,9'dan 0,6–1,2'ye çıktı; üç
  tohumda yavaş oyuncu rakibin önünde.

Yani pasif oyun eskisinden az cezalandırılıyor. Kayıp koşulu yerinde
("savunmasız yavaş oyuncu Dengeli ve Acımasız'da düşüyor" geçiyor), ama
geç oyunun riski şimdilik krizlerden geliyor. Rakip tarafı 37d'de (canlı
pazar) yeniden ele alınacak.

**Denge sınavında değişen dört kontrol.** Hepsinde yönetim yükü,
sınanan mekanizmanın ölçümüne karışıyordu:
- *İmar:* "açılan bölgeden parsel alınabiliyor" kontrolü açılış gününe
  taşındı (yukarıda).
- *Sendika:* ücret oranı ×1,08'den ×1,39'a çıkmıştı, çünkü yük ücretin
  üstüne biniyor. Yük Tur 17 tabanına da girdi; oran yine ×1,07–1,08.
- *İhraç kalkanı:*
  - Eski tohumlarda (42, 5, 31) savunmasız oyuncu artık düşmüyor, yani
    kalkanı ölçemiyorlardı. Tohumlar tehdidin gerçekleştiği yerden
    seçildi: 7, 1, 2, 9.
  - Gelen baskın hep tek baskıncılı. Yalnızca ihraçla korunan oyuncu dört
    tohumun birinde ayakta; üçünde düşüş belgelenen sondan geliyor (kurucu
    %51 tabanında) ve 33–71 gün gecikiyor. Main'de iki tehditli tohumun
    ikisi de ayaktaydı.
  - İddia artık: ihraç düşüşü erteliyor, düşüş yalnızca belgelenen
    sondan. Kalıcı kalkan (ihraç + piyasadan geri alım) dört tohumun
    dördünde ayakta.
- *Uzak şehir savunması:* kârın hepsini çeken şehrin savunma bütçesi
  küçüldü. Tohum 1'de baskın artık geliyor; savunma 37 M ₺ harcıyor ve
  şehri %32'de tutuyor (main %14/21/25 → %32/21/21). Şehir ayakta; eşik
  %30'dan %35'e.

**Main'deki tarayıcı kırmızısı.** Tur 35'ten beri main'in tam oynanış
koşusunda tek bir kontrol düşüyordu: "Otomatik: şehirde gece olunca
arayüz gece camına dönüyor". PR'larda yalnızca duman koşusu döndüğü için
görünmemişti.
- Arayüz geceye dönüyordu, ama 4 sn'den sonra.
- Yazılım GL'de bir kare 0,5–2 sn sürüyor; en uzunu ilk gece karesi.
  500 ms'lik döngü kareler arasında geç uyanıyor.
- Ölçümde ilk dönüş 3,9 sn, ikincisi 2,0 sn sürdü. Kontrol ilk dönüşü
  artık 20 sn bekliyor.

**Doğrulama.**
- Yeni birim testleri (`economy.test.ts`, 7 test):
  - yük eşiği ve tavanı;
  - vergi dilimleri;
  - verginin kâra girmesi;
  - kriz takvimi;
  - takvimin dışsal olması;
  - uyarıda etkisiz, krizde etkili olması;
  - bayraklar.
- Oynanış testine eklenen bölüm ("Kriz ve geç oyun giderleri"):
  - uyarı çipi 30 günle ve ipucuyla görünüyor;
  - etkin kriz çipi görünüyor;
  - şirket panelinde iki geç oyun satırı var;
  - konsol temiz.

### Tur 37b — Karar kartları ve rakip hikâyeleri

Olaylar piyasayı değiştiriyordu ama oyuncuya bir şey sormuyordu. Oyunun
gerçek karar anları sendika talebi ve sözleşme teklifiydi. Rakiplerin
yüzleri (portre) vardı, sesleri yoktu. Bu aşama iki şey ekliyor: masaya
gelen karar kartları ve konuşan, saldıran rakipler.

**Karar kartları** (`content/src/stories.ts`, `core/src/systems/cards.ts`).
- 12 kart:
  - viral video;
  - toplu alım teklifi;
  - sağlık denetimi;
  - sendika temsilcisiyle öğle yemeği;
  - festival sponsorluğu;
  - kasa sistemi;
  - rakibin müdür transferi;
  - gazeteci;
  - okul bağışı;
  - fırtına uyarısı;
  - enerji anlaşması;
  - fenomen tanıtımı.
- Her kartta 2–3 seçenek var. Etki türleri:
  - nakit;
  - süreli çarpanlar: çekicilik (kategoriye özel ya da şirket geneli),
    bakım, ücret, satış maliyeti;
  - sendika baskısı;
  - şanslı seçenekler: ihtimal ve "tutmazsa" etkisi kartta yazılı.
- Hiçbir seçenek açıkça doğru değil: bedel ve risk farklı.
- **Bedel:** günlük kâr eğiliminin 1,2 katı, 30 B ₺ – 2,5 M ₺ arası.
  Teklif gününde sabitleniyor; gösterilen bedel ödenen bedel.
  - Net değere bağlansaydı, geç oyunda servetin %90'ı nakit olduğu için
    bedel kârın günlerce üstüne çıkardı.
  - Sabit olsaydı erken oyunda yıkıcı, geç oyunda önemsiz olurdu.
- **Takvim:** dışsal zardan (tohum, gün).
  - İlk kart 45–59. günler arasında geliyor.
  - Bir kart kapandıktan 22–46 gün sonra yenisi geliyor.
  - Son 4 kart tekrar gelmiyor. Uygun havuz belleğe sığıyorsa (tek
    mağazalı küçük şirket) en eski görülen kart geri geliyor; bellek
    kartları kesmiyor, yalnız arka arkaya tekrarı önlüyor (Codex #62).
  - Kartlar oyuncunun durumuna göre süzülüyor: mağaza ve bina sayısı, en
    çok kazandıran kategori, sendika baskısı.
- **Süre:** kart 12 gün masada kalıyor; dolunca "hiçbir şey yapma"
  uygulanıyor. Uzak şehirde yerel müdür hemen varsayılanı seçiyor.
- **Komut:** seçim `CHOOSE_CARD`, lig günlüğüne giriyor. Birim testi: lig
  koşusunda seçilen kartlar tekrarda aynı skoru veriyor.
- **Arayüz** (`ui/src/DecisionCard.tsx`):
  - kart haritanın üstünde, altta ortada; telefonda rıhtımın üstünde;
  - etkiler renkli etiketler: yeşil iyi, kırmızı kötü, gri bedel;
  - "Sonra" kartı gündem çipine indiriyor, çip kartı yeniden açıyor;
  - panel açıkken, arsa seçiliyken ve yerleştirme modunda kart çekiliyor;
  - şirket panelinde süren kart etkileri görünüyor.

Ölçüm (vekil, 720 gün, tohum 1/7/42):
- 13–15 kart geliyor, yaklaşık 50 günde bir.
- Bedel erken oyunda 30–60 B ₺, sonra 180–340 B ₺.

**Rakip hikâyeleri** (`core/src/systems/rivalry.ts`).
- **Söz:** CEO kişiliğine göre konuşuyor. 5 kişilik × 7 an, her biri iki
  söz.
  - Genişlemeci kendinden emin, fiyat kıran alaycı, premium soğuk, arsa
    sahibi sabırlı, teknoloji veriyle konuşuyor.
  - Sıralama ve bölge liderliği haberlerinde söz var. Kriz başlarken en
    büyük rakip açıklama yapıyor.
  - Erken oyunda sıralama haftada birkaç kez el değiştiriyor. İlk
    sürümde aynı CEO aynı sözü bir hafta içinde üç kez söylüyordu. Sık
    anlarda söz artık aynı rakip ve an için 60 günde bir.
- **Kampanya:** bir rakip, oyuncunun payı en büyük kategoriye (en az %15)
  45 günlük bir fiyat savaşı açıyor.
  - Saldıran, o kategoride zaten satış yapan rakipler arasından en büyük
    paylı olan. Kategoride hiçbir rakip yoksa kampanya açılmıyor, iki
    hafta sonra yeniden bakılıyor (pazarda olmayan rakip fiyat kıramaz).
  - Saldıran kategorideki son mağazasını kapatırsa kampanya o gün
    bitiyor ("… saldırısından çekildi" haberi); sadakat markası yok.
  - Rekabet paneli ve bina penceresi saldıranın indirimli fiyatını
    gösteriyor ("Fiyat · kampanya"); gösterilen fiyat satıştaki fiyat.
  - Rakipler donukken (`npcCompetition` kapalı: laboratuvar, bina
    tahmini) yeni kampanya açılmıyor, süren kampanya ise süresini
    dolduruyor. Bina tahmini saldırı altındaki kategoride bugünkü fiyat
    savaşını görüyor.
  - Yapı menüsündeki hızlı tahmin de aynı koşulları görüyor: kampanya
    indirimi, süren kart etkileri (bakım, ücret, satış maliyeti,
    çekicilik). Kampanya fiyatı yalnız mağazada gösteriliyor.
  - Fiyat kıran %14, diğerleri %7 kırıyor.
  - Duyuru haberi var; gündemde geri sayım var, çip rekabet panelini açıyor.
  - Sonunda pay ölçülüyor. Pay 2 puandan fazla düşmediyse kampanya geri
    tepiyor ve kategoride marka +0,04 artıyor; düştüyse rakip kazanıyor.
  - Takvim: ilk kampanya 170–210. günler arasında, sonra 150–260 günde
    bir; 720 günde 2–3 kampanya.
- **Kaldırılan genişleme yönelimi:** İlk sürümde rakip kampanya boyunca o
  kategoride şube açmaya da yöneliyordu (genişleme puanı ×1,8). Denge
  sınavı kayıp koşulunu kaybetti ("savunmasız yavaş oyuncu Dengeli'de
  ayakta").
  - 20 tohumluk ölçümde baskınla düşüş 5 tohumdan 1'e inmişti.
  - Bileşen bileşen kapatıldı: fiyat kırma ve marka ödülü etkisizdi;
    sebep yönelimdi.
  - Kampanyayı açan çoğu zaman en büyük rakip, yani baskıncı. Nakdini
    şubeye harcayınca baskına para kalmıyordu.
  - Yönelim kaldırıldı. Düşüşler aynı günlerde geri geldi; 20 tohumda
    artık 7 tohum düşüyor.
- **Başlık düzeltmesi:** "{ad}'i geçtin" başlığı Türkçe ek yüzünden
  "Atlas Yapı'i geçtin" diye çıkıyordu; artık "{ad} artık arkanda".

**Etkisi** (`pnpm longrun`, 1440 gün; `STORIES=0` kapatıyor):

| | 37b kapalı | 37b açık |
|---|---|---|
| Net değer, 1440. gün | 294 / 293 / 273 M ₺ | 297 / 273 / 289 M ₺ |
| Oyuncu / en iyi rakip | 1,35 / 1,18 / 1,29 | 1,39 / 0,99 / 1,34 |
| Zafer günü | 623 / 645 / 638 | 621 / 702 / 637 |

Vekil kartlara cevap vermiyor; süre dolunca varsayılan uygulanıyor. Etki
ılımlı. Tohum 7'de kampanya payı aşındırıyor; rakip 1440. günde öne
geçiyor ve zafer 57 gün gecikiyor.

**Denge sınavında değişen kontrol: Acımasız iki tohum.**
- Acımasız zafer tek tohumla (1) ölçülüyordu. Kart ve kampanya birlikte
  açıkken bu tohumda rakip 900. günden sonra öne geçiyor ve 2.200 güne
  kadar zafer yok. Kart ya da kampanya tek başına açıkken zafer
  914 / 897. günde.
- Beş tohumluk ölçümde diğer dördü zafere aynı ya da daha erken ulaşıyor:
  7: 981 → 974 · 42: 792 → 792 · 5: 942 → 919 · 3: 888 → 831.
- Kontrol artık tohum 1 ve 3'ü koşuyor. İddia: Acımasız kazanılabilir ve
  ortalaması Dengeli'den geç (428 / 629 / 831).

**Laboratuvar.**
- `flags.cards` (`randomEvents` ile birlikte) ve `flags.rivalStories`
  (`npcCompetition` ile birlikte) bayrakları eklendi. Laboratuvar motoru
  olayları kapattığı için orada kart yok.
- Bayrak kapanınca süren etkiler de kalkıyor. Bu, #60'taki Codex bulgusu
  (kriz bayrağı) ile aynı ders.

**Doğrulama.**
- Yeni birim testleri (`stories.test.ts`, 16 test):
  - kartlar normal oyunda geliyor ve süresi doluyor;
  - bedel ölçeği;
  - seçimin nakdi, etkisi ve süresi;
  - sendika kartı;
  - bakım etkisinin deftere girmesi;
  - şansın belirlenimci olması;
  - reddedilen komutlar;
  - bayraklar;
  - gündem;
  - yerel müdür;
  - lig tekrarı;
  - sözler ve söz soğuması;
  - kampanyanın iki sonucu;
  - kampanyanın açılmadığı durumlar.
- i18n tamlık testi kartları, seçenekleri ve rakip sözlerini de kapsıyor.
- Oynanış testine eklenen bölüm ("Karar kartı ve rakip kampanyası", 9
  kontrol):
  - kart açılıyor, etiketleri ve ihtimali yazıyor;
  - "Sonra" ve çip;
  - seçim uygulanıyor;
  - şirket panelinde etki görünüyor;
  - panel açıkken kart çekiliyor;
  - kampanya çipi görünüyor;
  - konsol temiz.
- Mobil bölüme her cihazda "kart rıhtımın üstünde ve ekranda" kontrolü
  eklendi.

### Tur 37c — Fırsat balonları ve görev panosu

Kart, kampanya ve kriz şehre bir şey yapıyordu; oyuncu yalnızca cevap
veriyordu. Bu aşama dikkati ödüllendiriyor: mağazaların çatısında beliren
fırsat balonları ve her ay dönen kısa görevler.

**Fırsat balonları** (`content/src/opportunities.ts`,
`core/src/systems/opportunities.ts`, `ui/src/OpportunityBubble.tsx`).
- 5 tür:
  - toplu sipariş: bağlandığı mağazanın 2 günlük cirosu;
  - VIP müşteri: 4 günlük ciro;
  - kapıda kuyruk: mağazanın kategorisinde çekicilik +%20, 6 gün;
  - yatırımcı: merkezin üstünde, kâr eğiliminin 3 günü;
  - indirimli arsa: oyuncunun binalarına en çok 3 kare uzak boş parsel,
    %30 indirimle.
- Balon bağlandığı yere bağlı: mağaza balonu oyuncunun o mağazasına (bina
  kimliğiyle; aynı kareye yeniden kurulan mağaza sayılmıyor), yatırımcı
  genel merkeze, indirimli arsa boş parsele. Mağaza yıkılır ya da
  satılırsa, merkez değişirse, parsele yapı dikilirse balon sönüyor ve
  ödemiyor (Codex #63: kaybolan mağazanın siparişi ödeniyor, yapılı parsel
  boş arsa fiyatıyla veriliyordu).
- Nakit ödül 15 B – 1,5 M ₺ arası, bine yuvarlı. Tutar balonun çıktığı
  gün sabitleniyor: gösterilen, ödenen.
- **Takvim:** ilk balon 24–31. gün; sonraki, öncekinin bitişinden 18–32
  gün sonra. 720 günde ~21 balon.
- **Ömür:** 8 gün. Normal hızda ~21 sn, en hızlıda ~4 sn; duraklatınca
  balon bekliyor. Simülasyon günle ilerlediği (ve lig tekrarı günü
  tekrarladığı) için Lite'taki saniyelik ömür burada gün.
- Zar dışsal (tohum, gün); `state.rng` çekilmiyor. Yakalamak
  `CLAIM_BUBBLE` komutu, lig günlüğüne giriyor.
- Lig simülasyon izi fırsatları da işletiyor: iz senaryosu ilk gün bir
  bakkal kuruyor, her balonu ve tamamlanan her görevi alıyor; izde balon
  ve görev durumu da var. Boşta dünyada balon çıkmıyordu: takvim ya da
  ödül değişince iz aynı kalır, dürüst koşu tekrarda sahte sayılırdı
  (sürüm farkı yerine) (Codex #63).
- Uzaktaki şehirde dokunan yok: balon sönüyor. Bina tahmini balon
  üretmiyor; süren "kuyruk" etkisi tahmine giriyor.
- **Arayüz:**
  - balon her karede çatıya bağlanıyor (`CityRenderer.screenOfTile`);
    kuyruğu binayı gösteriyor, simgenin çevresinde geri sayım halkası var;
  - bina ekran dışındaysa balon ekranın kenarına yapışıyor, taşmıyor;
  - bina bir yan panelin (lens, yatırım listesi, bina penceresi) arkasında
    kalırsa balon panelin üstüne binmiyor, kenarına yapışıyor (önce sağdaki
    bina penceresinin başlığını örtüyordu; şehir projesi karelerinde
    görüldü);
  - ilk üç balonda "Dokun, yakala";
  - yakalayınca ödül balonun yerinden yukarı süzülüyor ve tost çıkıyor;
  - pencere açıkken balon gizli.

**Görev panosu.**
- **"Haftalık" değil, aylık.** Oyun haftası normal hızda ~18 sn; görev
  için kısa. Pano tarih çubuğundaki takvim ayıyla dönüyor; ilk pano
  1 Şubat'ta (31. gün) kuruluyor.
- 8 tür; panoya üçü geliyor:
  - 1–2 yeni mağaza;
  - bir üretim tesisi (mağaza dışında her bina);
  - 2 arsa;
  - en güçlü kategoride +5 puan pay (ödülüne marka +0,03 ekleniyor);
  - günlük ciroyu ×1,2'ye çıkarmak;
  - kasada kâr eğiliminin 15 günü;
  - net değerde hemen öndeki rakibi geçmek (en çok %30 öndeyse). Görev
    adımı şehir gününün içinde değil, net değerin günlük hesabından SONRA
    çalışıyor: önce geçiş bir gün geç sayılıyor (ayın son gününde geçenin
    ödülü düşüyordu) ve pano dünkü sıralamayla kuruluyordu. Görev adımında
    ikinci bir hesap da çözüm değildi: net değer geçmişine günde iki örnek
    yazıyordu (Codex #63);
  - bir balon yakalamak (ay içinde takvimde balon varsa).
- Başarılı her komuttan sonra panonun bütün görevleri ölçülüyor; holding
  aktarımı uzaktaki şehre gittiyse o şehrin panosu da. Günlük adım pano
  değişirken eskisini değerlendirmediği için panonun son gününde yapılan
  eylem (mağaza, parsel, kasaya giren para, net değeri yeniden hesaplayan
  aktarım) kayboluyordu (Codex #63). Görev hemen tamamlanınca ödülü aynı
  gün alınabiliyor. Gün arasında geçme görevi güncel net değere bakıyor
  (`netWorthNow`: kayıtlı değeri ve geçmişi değiştirmeden); ödül, balon
  ve indirimli parsel net değeri kayıt yenilenmeden de değiştiriyor.
- Hedef, pano kurulurken bugünkü şehirden türüyor. Sayaç görevleri
  panodan sonrasını sayıyor.
- Ödül: kâr eğiliminin 0,4–0,75 günü (10 B – 2,5 M ₺), pano kurulurken
  sabit.
- **Ödül komutla alınıyor** (`CLAIM_QUEST`); ay bitince alınmayan ödül
  panoyla birlikte düşüyor. Gündemdeki "Görevler" çipi ödül hazırsa öne
  çıkıyor.
  - İlk sürümde ödül kendiliğinden ödeniyordu. Denge sınavında iki
    kontrol kırıldı: savunmasız yavaş oyuncu Dengeli'de artık düşmüyordu
    (bekleyen oyuncu "biriktir" ve "payını koru" ödüllerini topluyordu),
    zincir deneyi de 2/3 tohuma düştü. Sistem dikkati ödüllendirmeli,
    beklemeyi değil. Komutla alınca ikisi de geçti.
- Tarih çubuğu UTC'ye alındı: batı saat dilimlerinde tarih bir gün geride
  görünüyordu ve pano çubuktaki aydan önce dönerdi.

**Ölçüm** (20 tohum, 720 gün; vekil oyuncu balonu hep yakalıyor, görev
ödülünü hep alıyor — üst sınır):

| | Zafer günü farkı | Net değer oranı | 720 günde zafer |
|---|---|---|---|
| 37c kapalı | — | 1 | 16/20 |
| İlk sürüm | −50 ± 7 | 1,13 | 20/20 |
| Son | −26 ± 8 | 1,07 | 19/20 |

- İlk sürümde ayrık ölçüm: görevler −32 ± 7, balonlar −24 ± 7 gün.
  Görev ödülü kâr eğiliminin 5–9 günüydü, şimdi 0,4–0,75 günü. Balonlar
  seyrekleşti (14–26 → 18–32 gün arayla) ve hafifledi.
- Tek bir balon türü öne çıkmıyor: kuyruksuz −14 ± 7, arsasız −16 ± 8.
- **Gürültü:** 50. günde verilen 100 B ₺ hediye zafer gününü tohum başına
  ±50 gün oynatıyor. Beş tohumluk ölçüm bu yüzden yanıltıcıydı; kararlar
  20 tohumla verildi.
- Denge sınavının vekili balona dokunmuyor ve ödül almıyor. Sınav
  sonuçları 37b ile aynı.

**Laboratuvar.** `flags.bubbles` ve `flags.quests` eklendi (yoklukları
açık). Kartlar kapalıyken balonun kuyruk etkisi sürüyor; balon bayrağı
kapanınca kalkıyor.

**Doğrulama.**
- Yeni birim testleri (`opportunities.test.ts`, 15 test):
  - takvim (UTC ay başı);
  - balon ömrü, nakit, kuyruk etkisi ve bayrağı, indirimli arsa;
  - bayrak ve uzak şehir;
  - zarın dışsal olması (`state.rng` aynı kalıyor);
  - lig tekrarı: balon ve görev ödülleri günlükte, skor aynı;
  - bina tahmini;
  - pano kuruluşu ve yenilenmesi;
  - ödül alma: bir kez, bitmeyen görev reddediliyor, ay sonunda düşüyor;
  - pay ve geçme görevleri, sayaç görevleri, bayrak.
- i18n tamlık testi balon ve görev metinlerini de kapsıyor.
- Oynanış testine eklenen bölüm ("Fırsat balonu ve görev panosu", 9
  kontrol, duman koşusunda):
  - balon çatıda, ödülü rakamla yazılı;
  - dokununca ödül kasada, tost çıkıyor, ödül balonun yerinden süzülüyor;
  - ekran dışındaki balon kenarda ve ekranın içinde;
  - pencere açıkken gizli;
  - gündemde "ödül hazır", pano açılıyor, ödül alınıyor;
  - konsol temiz.
- Mobil bölüme her cihazda "balon ekranda ve rıhtımın üstünde" kontrolü
  eklendi.
- Kareler arasında bulunan hata: balon kalkınca React çapanın `<div>`'ini
  patlama katmanı için yeniden kullanıyordu. Elle verilen `transform`
  katmanda kalıyor, ödül ekranın öbür ucundan süzülüyordu. Anahtarlı
  yapıyla düzeldi.

### Tur 37d-1 — Canlı pazar: eğilim, mevsim, moda

Talep yalnızca nüfusla, olayla, dönemle ve krizle değişiyordu. Gelir
düzeyi, arketip ağırlıkları ve ürün payları sabitti: bir kategoriyi bir
kez doğru seçen oyuncu oyunun sonuna kadar haklı kalıyordu. Kullanıcı
üç katmanın üçünü de seçti (`content/src/living.ts`,
`core/src/systems/living.ts`).

- **Eğilim (yavaş):** her tüketici kategorisi 120–240 günde bir yeni bir
  hedefe doğru doğrusal kayıyor (0,88–1,12). Gün 0'da 1'den başlıyor.
  Hedef ve süre rekabet panelindeki "Pazar nabzı"nda açık: erken okuyan
  kazanıyor. Büyük bir dönüş (en az 6 puan) haber oluyor.
- **Mevsim (orta):** takvim ayından (UTC). Kışın giyim ve elektronik,
  yazın yeme-içme ve hizmet öne çıkıyor. Her kategorinin dört mevsim
  ortalaması tam 1: toplam talep değişmiyor, yalnızca ne zaman nereye
  aktığı. Mevsim dönümü haber oluyor.
- **Moda (hızlı):** tek bir ürüne 30–60 gün kategori içinde ×1,6 ağırlık;
  kategoriye de +%5. İlk moda 60–100. günde, sonrakiler 70–130 gün arayla.
  Tek ürünlü kategori (hizmet) modaya girmiyor, aynı ürün üst üste moda
  olmuyor. Haber ve gündemde geri sayım ("Moda: Kahve · 38 gün").
- **Durumsuz:** üçü de tohumdan ve günden hesaplanıyor; kayda alan
  yazılmıyor, `state.rng` çekilmiyor. Aynı tohum aynı pazarı yaşıyor
  (lig adil), bina tahmininin iki kolu da aynı pazarı görüyor.
- **Boru hattı:** çarpanlar `collectEventModifiers`'tan geçiyor (olay,
  dönem ve krizle aynı yer); moda ürünü `goodShares`'te. Moda payı
  pazarın her adımında aynı: satış, kapasitenin bölgelere bölünüşü
  (`shelfReach`), yatırım tahmininin erişimi ve raf panelindeki yüzdeler.
  İlk sürümde yalnız satış modayı görüyordu; kapasite ve tahmin eski
  ürün karışımıyla çalışıyordu (Codex #64). Yeni binanın rafı ise kalıcı
  karar olduğu için modaya göre değil, bölgenin olağan karışımına göre.
  Test: moda ağırlığıyla ürünün taban payını aynı kat büyütmek birebir
  aynı pazarı veriyor (satış, karşılanmayan talep, tahmin).
- **Laboratuvar:** `flags.livingMarket` (yokluğu açık), `randomEvents`
  kapalıyken de kapalı. İlk denemede denge sınavının üç kontrollü deneyi
  kırıldı (Ar-Ge ve pazarlama geri ödemesi, fiyat kırma): ölçüm 60–400
  gün sürüyor ve arada mevsim ve eğilim değişince ölçülen şey pazar
  oluyordu. Düello motoru olayları zaten kapatıyor; canlı pazar da aynı
  kurala bağlandı.

**Etkisi** (20 tohum, 720 gün, balon ve görev kapalı; vekil eğilime
bakmıyor):

| | Zafer günü farkı | Net değer oranı | 720 günde zafer |
|---|---|---|---|
| Canlı pazar kapalı | — | 1 | 17/20 |
| Açık | +5 ± 7 | 0,96 | 15/20 |

(Son ölçüm moda payı düzeltmesinden ve 37d-2/3'ten sonra; ilk ölçüm
+6 ± 6, 0,96, 16/20 → 14/20. Etki değişmedi.)

Etki gürültü içinde. Vekil kategorilerini eğilime göre seçmediği için
dalgalanma ona hafif pahalı. Eğilimi okuyan oyuncu kazanır.

**Denge sınavında değişen kontrol: yavaş oyuncunun düşmesi beş tohum.**
- Kaybedilebilirlik tek tohumla (7) ölçülüyordu ve o tohum sınırdaydı:
  Dengeli'de 824. günde, 900 günlük pencerenin sonunda düşüyordu. Canlı
  pazar onu pencerenin dışına itti.
- 12 tohumluk ölçümde düşme oranı değişmiyor: Dengeli 3/12 açık, 2/12
  kapalı; Acımasız 10/12 ve 10/12.
- Kontrol artık kalibrasyon notundaki beş tohumu (1/7/42/101/202)
  koşuyor. İddia aynı: Dengeli kaybedilebilir (2/5), Acımasız daha sık
  ve erken düşürüyor (4/5, ortalama 571 < 819).
- Aynı ölçümün yan bulgusu: savunmasız yavaş oyuncu Dengeli'de 12
  tohumun 3–4'ünde **kazanıyor**. "Pasif oyun yeterince cezalandırılmıyor"
  kaygısı ölçüyle doğrulandı; 37d-3'ün (rakip konsorsiyumu) hedefi bu.

**Denge sınavında değişen kontrol: dönem çarpanı oranla.** "Dönem çarpanı
pazara ulaşıyor" sıkılaşma döneminin yeme-içme talebini birleşik çarpanda
1'in altında arıyordu. Canlı pazar aynı çarpana giriyor ve dönemden
bağımsız: moda payı düzeltmesi rakiplerin kararlarını kaydırınca seed 77'de
oyun 1297. günde dondu, o gün yeme-içme eğilim ve mevsimle ×1,17 ve
dönemin 0,88'i birleşikte 1,03 çıktı. Kontrol olayları zaten aynı gerekçeyle
temizliyordu; artık dönemin katkısı dönemli ve dönemsiz çarpanın oranı
(0,88). İddia aynı.

**Doğrulama.**
- Birim testleri (`living.test.ts`, 7 test):
  - mevsim takvimi ve yıllık ortalamanın 1 olması;
  - eğilimin 1'den başlaması, aralıkta kalması, parça sınırında
    kopmaması, tohuma bağlı olması;
  - moda takvimi (ara, süre, tekrar yok, tek ürünlü kategori yok);
  - olay boru hattı ve bayrak;
  - moda payı;
  - haberler ve gündem;
  - durumsuzluk.
- Kriz testi artık kriz × canlı pazar bileşimini sınıyor.
- i18n tamlık testi mevsimleri kapsıyor.
- Oynanış testi: "Canlı pazar" bölümü (2 kontrol, duman koşusunda).


### Tur 37d-2 — Şehir projesi ihalesi

Kullanıcı mega projeyi "şehir projesi ihalesi" olarak seçti: belediye bir
proje açıyor, şirketler katkı yarışına giriyor, en büyük katkı projeye
adını veriyor ve bölgede bir ayrıcalık alıyor (`content/src/projects.ts`,
`core/src/systems/projects.ts`, `ui/src/ProjectPanel.tsx`).

- **Projeler:** 6 tür: metro, stadyum, kongre merkezi, teknoloji kampüsü,
  şehir AVM'si, kapalı çarşı. Her birinin tercih ettiği bölge arketipleri,
  bölge talep çarpanları (+%4–16), arsa değeri çarpanı ve sponsorun marka
  aldığı kategori var.
- **Akış:** duyuru → 90 gün katkı → sponsor belli olur, şantiye kurulur →
  40 gün inşaat → simge yapı ve kalıcı etki.
  - İlk proje 210–270. günde; sonraki, öncekinin bitişinden 260–380 gün
    sonra (900 günde 2 proje).
  - Saha: projesiz bölgeler önce, sonra tercih edilen arketip, sonra
    nüfus. Belediye kendi arazisine yapıyor: bir park ya da meydan.
    İlk sürüm park yoksa boş parseli kamuya geçiriyordu ve denge
    sınavının "büyüme kamu alanı üretmiyor" kontrolü kırıldı (17 → 18).
    Gerekçe büyümeninkiyle aynı: oyuncunun gözüne kestirdiği parselin bir
    gecede kamuya geçmesi geri alınamaz bir kayıp.
  - Takvim ve yer dışsal zardan (tohum, gün); `state.rng` çekilmiyor.
- **Katkı:** açık tablo, geri dönmüyor (herkes öder, biri kazanır).
  Oyuncunun katkısı `CONTRIBUTE_PROJECT` komutu, lig günlüğünde. Panelde
  "Öne geç" (lideri 1 B ₺ geçen tutar) ve kasanın %2/5/10'u.
- **Rakipler:** haftada bir, kişiliğe göre bütçeyle katkı veriyor (zar
  yok). Bütçe net değerin %1,5–5'i (genişlemeci ve arsa spekülatörü en
  istekli), bölgede mağazası varsa ×1,5; kasada 400 B ₺ tampon kalıyor,
  bütçe 8 haftaya yayılıyor. İlk sürümde bütçe yoktu ve geç oyunda rakipler
  25–32 M ₺ veriyordu. Rakipler donukken (izdüşüm) katkı yok.
- **Etki (kimin olursa olsun):** bölgede tam, komşularda yarı
  (`neighborShare`) kalıcı talep artışı (olay boru hattından); arsa bir kez
  değerleniyor; metro ve kampüs nüfus tavanını yükseltiyor.
- **Sponsor ayrıcalığı:** bölgedeki bütün binalarında bakım −%30,
  mağazalarında çekicilik +%8, projenin kategorisinde marka +0,05. Diğer
  katkıcılar katkı payları oranında en çok +0,02 marka alıyor.
- **Laboratuvar:** `flags.cityProjects` (yokluğu açık), `randomEvents`
  kapalıyken de kapalı. Bayrak kapanınca süren etkiler de kalkıyor.
- **Devralma:** katkıcı devralınınca katkısı (ve bitmiş projenin
  sponsorluğu) devralana geçiyor; tabloda oyundan çıkmış şirketin satırı
  görünmüyor. Önce öndeki katkıcı devralınınca proje "belediye karşıladı"
  diye kapanıyordu (Codex #64).
- **Lig izi:** 60 günlük iz projeye ve konsorsiyuma ulaşmıyor; izin son
  durumunun kopyasında saat ileri alınıp proje (aç, katkı, kapanış, bitiş)
  ve konsorsiyum (kuruluş, ortak alım) doğrudan işletiliyor, sonuçları,
  canlı pazarın uzak günleri ve ayarlar ize giriyor (Codex #64). Moda
  için takvim yetmiyordu: kopya ilk modanın gününe alınıp kategori talebi
  ve moda kategorisinin ürün payları da ize giriyor; moda ağırlığı ya da
  kategori eki değişince iz değişiyor (Codex #64). Yardımcıların çıktısı
  da yetmiyordu: moda gününde iki yoklama mağazasıyla (en kalabalık
  bölgede yalnız moda ürünlü tek yuvalı, en tenha bölgede bütün ürünlü
  büyük mağaza) gerçek bir pazar günü işletiliyor; ürün başına satış ve
  bölge başına karşılanmayan talep izde. Satıştaki ya da kapasite
  bölüşümündeki moda geçişi geri alınınca bu parça değişiyor (elle
  sınandı). Yoklama tek projeyi açtığı için bütün projelerin sahası da
  (bugün ve bir proje bittikten sonra) ve tercih ettikleri arketipler
  izde (Codex #64).
- **Katkı tablosu:** ilk beş ve dışarıda kalan oyuncu, gerçek sırasıyla
  (`projectTable`). Önce sıra kesilmiş diziden okunuyordu; yedinci oyuncu
  altıncı görünüyordu (Codex #64).

**Ayrıcalık neden bakım indirimi** (20 tohum, 720 gün; vekil oyuncu
katkıyı pencerenin son günü lideri geçecek kadar veriyor, 0,5–3,3 M ₺):

| Sponsor ayrıcalığı | Pasife göre net değer | Zafer günü farkı |
|---|---|---|
| Çekicilik +%8 (ilk sürüm) | 0,993 ± 0,003 | +2,5 ± 1,7 |
| Çekicilik +%20 | 0,993 ± 0,004 | +2,3 ± 1,8 |
| Marka +0,15 | 0,992 ± 0,003 | +2,7 ± 1,5 |
| + bakım −%20 | 0,999 ± 0,003 | −0,1 ± 1,7 |
| + bakım −%30 (son) | 1,005 ± 0,004 | −2,0 ± 2,1 |

Son iki satırın pasif kolu bakım −%20'li koşu (rakip sponsorun pasif
oyuncuya etkisi ölçülemeyecek kadar küçük, aşağıda).

- Çekicilik satışa dönmüyordu: bölgedeki mağazaların çoğu kapasitenin
  %87–100'ünde. Doğrudan ölçümde 60 günde +%8 çekicilik ~60 B ₺ kâr
  getirdi; kazanmanın bedeli ~750 B ₺.
- Bakım indirimi kapasiteden bağımsız ve bölgede ne kadar bina varsa o
  kadar değerli: soru "bu bölgede ne kadar varım".
- Her 20 günde kasanın %5'ini veren oyuncu her projeyi kazanıyor ama
  kaybediyor: zafer +11 ± 3 gün, net değer ×0,93, 16/20 zafer. Az ve
  zamanında vermek ödülleniyor, körü körüne vermek cezalandırılıyor.
- Hiç vermeyen oyuncu etkilenmiyor (rakip sponsor olsa da: net değer
  ×1,01, zafer −1 ± 3 gün).

**Denge sınavında değişen kontrol: ihraç kalkanının tohumları.**
- Proje bitince bölgede ve komşularda talep kalıcı artıyor, arsa
  değerleniyor; en çok bölgede bulunan oyuncu en çok kazanıyor. Seed 1'de
  savunmasız yavaş oyuncu 700. günde %6 daha zengin ve baskıncının %90
  eşiğinin üstünde kalıyor (79,2 > 75,6 M ₺): baskın başlamıyor.
- 20 tohumda savunmasız düşüş oranı değişmiyor: projesiz 4/20 (1, 4, 9,
  13), projeli 3/20 (9, 13, 17). Tehdit başka tohumlara kayıyor.
- Kalkan kontrolleri tehdidin gerçekleştiği tohumlarda: 9, 13, 17 (önce
  7, 1, 2, 9; 7 ve 2 canlı pazarla zaten ölçüm dışıydı). İhraç üçünü de
  ayakta tutuyor, geri alımla üçü de kilitli.
- Önce baskıncının katkı yapmaması denendi (37b'deki kampanya dersi):
  seed 1'i değiştirmedi; sebep rakibin nakdi değil oyuncunun büyümesi.

**Doğrulama.**
- Birim testleri (`projects.test.ts`, 8 test):
  - takvim, kamu sahası, haber ve gündem;
  - katkı kuralları (en küçük, kasasız, kapalı pencere);
  - rakip bütçesi ve rakipler donukken katkı olmaması;
  - sponsor, şantiye, simge yapı, kalıcı etki, bayrak kapanınca etkinin
    kalkması;
  - ayrıcalığın hızlı yatırım tahmininde ve defterde aynı çarpanla
    görünmesi;
  - laboratuvar;
  - lig tekrarı.
- i18n tamlık testi projeleri ve yeni yapıları kapsıyor.
- Oynanış testi: "Şehir projesi" bölümü (5 kontrol, duman koşusunda):
  gündem çipi, panel, "Öne geç", saha notu, konsol.


### Tur 37d-3 — Rakip konsorsiyumu: öndeki pasif oyuncuya ortak baskın

Tek baskıncı yalnızca kendinden belirgin küçüğe saldırıyor (net değer
< %90). Bir kez öne geçen oyuncu baskından kurtuluyordu: 400. günde el
çeken vekil on tohumun onunda 1200. güne ayakta kaldı ve 594–768. günlerde
zafere de ulaştı, kasasında 160–230 M ₺ atıl dururken. Kullanıcı "rakip
konsorsiyumu"nu seçti (`content/src/consortium.ts`,
`core/src/systems/consortium.ts`).

- **Koşullar:** 300. günden sonra, zaferden önce. Oyuncu en güçlü rakibin
  en az 1,3 katı, kasa net değerin en az %30'u ve son 90 günde yeni bina
  yok. Kasa payı tek başına ayırt etmiyor (etkin vekilin kasası da net
  değerin ~%70'i); asıl ölçü duran yatırım.
- **Akış:** en büyük 2–3 rakip güç birliği yapıyor; duyuru ve 30 günlük
  savunma penceresi, sonra her gün ortak alım. Günlük tavan tek baskıncı
  tavanının 0,35 katı (Dengeli'de %1,225); bedeli üyeler kasalarından
  paylaşıyor, hisseler önderin hesabına. Böylece kontrol, %10/%25/%40
  uyarıları ve geri alım kilidi tek baskıncıyla aynı yoldan işliyor.
- **Savunma:** yatırıma dönmek (kuruluştan bu yana üç yeni bina ya da kasa
  net değerin %20'sinin altına), kontrolü kilitlemek (halka arz + geri
  alım), ya da öndeliğin 1,1 katın altına inmesi. Zafer gelince süren
  konsorsiyum dağılıyor. Dağılınca 120 gün soğuma; topladıkları hisse
  önderde kalıyor.
- İlk ölçü "kasanın dörtte biri yeni binalara"ydı: 50 M ₺ kasada 12 M ₺,
  30 günde etkin oynayan vekilin bile ulaşamadığı bir eşik. Yatırıma dönen
  oyuncu da düşüyordu (10 tohumda 9); ölçü "üç yeni bina" oldu.
- **Yalnız oynanan şehirde:** uzaktaki şehir tanımı gereği pasif (yerel
  müdür bina kurmuyor); orada konsorsiyum yok, şehirden ayrılınca süren
  konsorsiyum dağılıyor. Adım motorun gününde, net değerin günlük
  hesabından sonra.
- **Arayüz:** gündemde "Konsorsiyum" çipi (pencerede geri sayım, alımda
  pay ve kontrol eşiğine ilerleme); tıklayınca borsa paneli. Önderin tek
  baskıncı çipi tekrarlanmıyor. Yardım adımı.
- **Belirlenimci:** zar yok; koşullar ve takvim durumdan (lig adil).
  Bayrak `flags.consortium`; baskınlar, rakipler ya da olaylar
  (laboratuvar) kapalıyken de yok.

**Ölçüm** (10 tohum, Dengeli, 1000 gün):

| Oyuncu | Konsorsiyum | Sonuç |
|---|---|---|
| Etkin (vekil hep 5 günde bir) | hiç kurulmuyor | 10/10 zafer |
| 400. günde el çeken | 489. günde | 9/10 devralınıyor (~560. gün) |
| El çekip uyarıda yatırıma dönen | kuruluyor, dağılıyor | 10/10 ayakta, 10/10 zafer |

İlk ayarda (60 gün, tavan 0,5, zafer sonrası da) etkin vekil de zaferden
sonra şehir dolup bina kurmayı bırakınca 10 tohumun 6'sında düşüyordu;
konsorsiyum artık zafer yolundaki pasifliği cezalandırıyor, serbest oyun
güvende.

**Denge sınavı:** yeni bölüm "Rakip konsorsiyumu: güçlü ama pasif oyuncu"
(3 tohum): el çeken lider düşüyor (560/560/570), uyarıda yatırıma dönen
ayakta ve zafere ulaşıyor (608/680/592). Mevcut 288 kontrolün hepsi
değişmeden geçiyor.

**Doğrulama.**
- Birim testleri (`consortium.test.ts`, 7 test): kuruluş koşulları,
  duyuru ve gündem; pencerede alım yok; ortak alım (tavan, bedeli üyeler,
  hisse önderde); savunmasız pasif lider devralınıyor; üç yeni binayla
  dağılma ve soğuma; kilit ve zaferle dağılma, zaferden sonra kurulmama;
  etkin oyuncuya kurulmama; bayraklar, uzak şehir ve zar.
- Oynanış testi: "Rakip konsorsiyumu" bölümü (4 kontrol, duman koşusunda).

### Tur 38 — Değerlendirme turu: T37'nin sistemleri birlikte

Kullanıcı sıradaki tur için değerlendirmeyi seçti (Tur 17 gibi). Tur 37
dört aşamada sekiz yeni sistem ekledi: kartlar, rakip hikâyeleri, balonlar,
görevler, canlı pazar, şehir projesi, konsorsiyum, geç oyun giderleri ve
krizler. Soru, birlikte nasıl oynandıkları.

**Ölçüm** (Tur 38'in ayarlarından önce; vekil oyuncu 5 günde bir, balonu
yakalıyor, biten görevi alıyor):

| 1000 günde | Standart (10 tohum) | Büyük şehir (3 tohum) |
|---|---|---|
| Zafer günü | 598–715 | 658–724 (biri 1000 günde yok) |
| Karar kartı | 21 (48 günde bir) | 21 |
| Kriz · dönem · rakip kampanyası | 1,8 · 4,9 · 3,9 | 1,7 · 5 · 4 |
| Moda · balon · görev | 7 · 30 · 51 | 7 · 30 · 53 |
| Şehir projesi (sponsor oyuncu) | 2 (0) | 2 (0) |
| Gündem: ortalama · en çok · 8'den kalabalık gün | 6,1 · 11 · %9 | 6,4 · 15 · %15 |
| Haber / gün | 0,77 | 1,6 |
| Gün süresi (ms): erken → geç | 6 → 25–37 | 17–37 → 140 |

Sistemler takvimlerine uyuyor ve üst üste binmiyor. Sorunlar dört yerde:

**1 · Büyük şehrin geç oyunu yavaştı.** 930. gün 143 ms sürüyordu (en hızlı
oyun hızı 480 ms/gün; telefon bu sunucudan 3–4 kat yavaş). Profil üç
gereksiz iş gösterdi:
- Rakip zincir kartı fırsat maliyeti frenini hesaplıyordu (her mağaza türü ×
  her bölge için bir yatırım tahmini: günün beşte biri). Rakip freni bilerek
  okumuyor (Tur 15); rakip kartında fren yok.
- Rekabet kartında her şirket × kategori profili bütün binaları ayrı ayrı
  tarıyordu (günün onda biri); artık kart boyunca tek tarama.
- Pazar adımı her (bölge, ürün) için şehrin bütün mağazalarını geziyordu;
  artık yalnız o kategorininkileri. Ürün payları gün boyunca bir kez,
  kiralık kapasitesi tek taramada.

Toplama sıraları korundu: geç oyun durumundan 30 gün sonra durumun özeti ve
lig izi iki şehir boyunda da birebir aynı. **Büyük şehir 143 → 94 ms/gün,
standart 30 → 28.** Test: frensiz kart aynı hamleyi veriyor.

**2 · Gündem şeridi.**
- Masaüstünde işe yaramayan "+N" düğmesi görünüyordu (gizleyen seçici tek
  sınıftı, `.agenda .event-chip` onu eziyordu).
- Telefonda sözleşme teklifi çipi 390 piksellik ekranda 441 piksel tutuyordu;
  şerit ortalı olduğu için iki ucu da kesiliyordu ("Geç" yarım). Dar ekranda
  çipler satır kırıyor.
- Büyük şehrin dış halkası dalga dalga açılıyor; her dalga dört ayrı, aynı
  geri sayımlı çipti. Aynı gün açılan bölgeler tek çip ("Liman ve 3 bölge
  daha imara açılıyor"). Büyük şehirde 100. gün gündem 11 → 7 çip.

**3 · Haber akışı.** "X genişliyor" akışın %41'iydi, büyük şehirde %58'i
(720 günde 732 haber, günde bir); kart, kriz ve baskın uyarısı bu
kalabalıkta kayboluyordu. Oyuncunun aynı kategoride mağazası olan bölgedeki
açılış doğrudan rekabet: tek başına haber. Gerisi haftanın özetinde
("Rakipler genişliyor · bu hafta N yeni işletme", şirket başına sayım, son
açılışın yeri). Haber akışını okuyan oyun mantığı yok; simülasyon aynı.

**4 · Zorluk eğrisi kaymıştı.** Tur 17'nin kalibrasyonu yeniden koşuldu,
daha çok tohumla (8: 1/7/42/101/202/3/5/11; bilgili 5 günde bir ve
savunmasız, yavaş 15 günde bir):

| Tur 38 öncesi | Bilgili | Yavaş, savunmasız | Yavaş, savunan |
|---|---|---|---|
| Rahat | 391–503'te kazanıyor | 0 düşüş, 7 zafer | — |
| Dengeli | 605–780 (8/8) | **2/8 düşüyor, 4/8 kazanıyor** | 0 düşüş |
| Acımasız | 6/8 kazanıyor, 2 düşüyor | 5/8 düşüyor (454–738) | — |

Tur 17'de Dengeli'de savunmasız yavaş oyuncu 5'in 4'ünde düşüyordu. Tur
37'nin aşamaları kapatılınca (aynı 8 tohum): hepsi kapalı 5/8 düşüş;
yalnız 37a kapalı 0 zafer; 37b ya da 37d kapalı 2/8 düşüş. Etki birikimli,
en büyük payı geç oyun giderlerinin.

Teşhis (tohum 5, 50 günde bir): Tur 37 kapalıyken 600. günde oyuncu 46 M ₺,
Meridyen 56, Nova 55,7 — oyuncu baskıncının 0,9'unun altında, ikisi birden
alıyor (%25 + %53), 691. günde düşüyor. Açıkken geç oyun giderleri 100'ü
aşkın binalı rakipleri çok daha fazla frenliyor: 600. günde oyuncu 55,1 M ₺
(50 bina), Meridyen 51,7. Yavaş oyuncu en büyük şirket; tek baskıncının
hedefi değil (0,9 kuralı), konsorsiyumun da değil (1,3 kat öndelik ve 90
gün yatırımsızlık ister). 0,9 ile 1,3 arasındaki boşlukta 806. günde
kazanıyor.

Denenen kollar (Dengeli, 8 tohum):

| Kol | Yavaş savunmasız: düşüş / zafer | Savunan düşüş | Bilgili |
|---|---|---|---|
| Baskın hedef eşiği 1,05 / 1,15 | 3 / 4 | 1 (tohum 1) | aynı |
| Eşik 1,1 + bütçe 1,5 + konsorsiyum | 7 / 0 | 1 | 1 düşüş (995) |
| Başa baş lidere konsorsiyum | 3 / 3 | 0 | aynı |
| Rakip bütçesi ×1,5 | 3 / 0 | 0 | 613–755 |
| Bütçe ×1,5 + günlük tavan %4,5 (seçilen) | **7 / 0** | **0** | **625–752 (8/8)** |

Eşik tek başına işe yaramıyor: baskıncı adaylar arasında en küçüğü seçiyor,
oyuncu sona kalıyor. Başa baş lidere konsorsiyum etkin oyuncuya da her
120 günde bir uyarı veriyordu (yatırımla dağıtıyor ama gürültü). Bütçe
tek başına baskını geç başlatıyor (düşüşler 900 günlük pencerenin sonunda).
Seçilen ayar kuralları değiştirmiyor, herkese aynı:
- Rakip bütçesi üç kademede 1,5 katı: Rahat 0,8 → 1,2 · Dengeli 1 → 1,5 ·
  Acımasız 1,2 → 1,8. Kademeler arası oran aynı ("Rakipler %20 daha cesur
  yatırır" hâlâ doğru).
- Günlük baskın tavanı Dengeli %3,5 → %4,5, Acımasız %4,5 → %5,5 (Rahat %2).
  Oyuncunun kendi alım tavanı da aynı (yardım metni artık zorluktan
  okuyor; eskiden her zorlukta "%3,5" yazıyordu).

| Tur 38 sonrası | Bilgili | Yavaş, savunmasız | Yavaş, savunan |
|---|---|---|---|
| Rahat | 390–503'te kazanıyor | 0 düşüş | — |
| Dengeli | 625–752 (8/8) | **7/8 düşüyor (754–886)** | **0 düşüş** |
| Acımasız | 5/8 kazanıyor (809–929), 3 düşüyor | 8/8 düşüyor (367–815) | — |

Denge sınavı: iddia yeniden Tur 17'nin cümlesi — Dengeli'de "çoğunlukla"
düşüyor (≥3/5, ölçüm 5/5). İkisi de 5/5'e yaklaşınca "Acımasız daha sık"
beş tohumla ayırt edilemiyor; kontrol artık "en az o kadar sık ve daha
erken" (ortalama 495 < 810). Konsorsiyum testi: pasif lider yine önderce
devralınıyor; ama rakipler daha hızlı büyüdüğü için öndelik eriyor,
konsorsiyum "öndelik" gerekçesiyle dağılıyor (%19 toplamışken) ve işi önder
tek başına 202 günde bitiriyor (önce ~70); pencere 300 gün.

Ayarın başka iki yan etkisi, ikisi de bilerek kabul edildi:
- *Konsorsiyum bölümü:* seed 3'te 400. günde el çeken oyuncu artık hiç 1,3
  kat öne geçmiyor, konsorsiyum kurulmuyor. "Cevap veren lider" iddiası
  konsorsiyumun kurulduğu tohumlarda ölçülüyor (en az ikisinde; 615 ve
  669'da zafer).
- *Holding:* varsayılan talimat (kârın yarısı, savunmasız) iki tohumda
  kurucu şehri ayrılıştan ~300 gün sonra kaybediyor (955-956. gün; önce dış
  pay en çok %42'ydi). Uzak şehir tanımı gereği pasif ve oyuncu %25/%40'ta
  oynadığı şehirde uyarılıyor; savunma talimatı şehri %23-27'de tutuyor.
  Savunmasız pasif şirketin avlanması Dengeli'nin kuralı. Kârın hepsini
  çeken şehir artık "daha derin ya da daha erken" düşüyor (915/936 <
  955/956); iki talimat da tavana vurunca derinlik ayırt edemiyor.

**Değişmeyenler.** Yardım ve rehber T37'nin bütün sistemlerini anlatıyor
(geç oyun, hikâyeler, fırsatlar, canlı pazar, projeler, konsorsiyum); ilk
balon 24., ilk görev panosu 20.'den sonraki ay başı, ilk kart 45. günden
önce gelmiyor (rehberle çakışmıyor). Zaferden sonra kasa servetin %93'ü,
ama zafer ekranı "Yeni şehre açıl"ı (holding) öneriyor. Paket gzip ile
~495 kB.

**Doğrulama.** `pnpm test` 394/394 (yeni: frensiz kart, dalga çipi, iki
haber testi). `pnpm balance` 290/290; değişen kontroller yukarıda (zorluk
iddiası, Acımasız karşılaştırması, konsorsiyum, holding talimatı). Tarayıcı tam koşu 393/393, konsol hatası yok (hız
değişikliğiyle); gündem değişiklikleri ayrı tarayıcı kontrolüyle
(masaüstü "+N" gizli; telefonda teklif çipi 370 piksel, ekran 390).


### Tur 39a — Senaryo modu: çatı, Kurtarma ve Krizin ortasında

Kullanıcı sıradaki tur için senaryo modunu seçti: yedi senaryo, yıldız ve
bu cihazdaki en iyi sonuç (lig dokunulmuyor). Üç aşamada geliyor; bu aşama
çatıyı ve ilk iki senaryoyu kuruyor.

**Çatı.**
- *Tanım içerikte* (`packages/content/src/scenarios.ts`): sabit tohum, şehir
  boyutu, zorluk, ön tarih günü, süre, hedef, yıldız eşikleri, kurulum.
- *Ön tarih:* şehir senaryonun tohumuyla kuruluyor ve `preludeDays` gün
  kendi kendine yaşıyor. Oyuncu sahnede değil (binası yok, kurucu kilidi
  hisselerini koruyor); rakipler zincirlerini kuruyor. Sonra devir: oyuncunun
  şirketi baştan kuruluyor ve senaryonun durumuna getiriliyor. Ad ve CEO
  devirde yazıldığı için ön tarih oyuncudan bağımsız: aynı senaryo her
  seferinde aynı şehirde (birim testi). Tarayıcı ön tarihi on günlük
  parçalarla koşuyor, ilerleme çubuğuyla (150–200 gün ~0,6 sn).
- *Kasa senaryonun kendisi:* CEO'nun başlangıç nakdi çarpanı (2,3 katına
  kadar) uygulanmıyor; diğer özellikleri geçerli.
- *Günlük adım* günün sonunda: devralınan oyuncu kaybediyor; hedefe ulaşan
  ya da süresi dolan koşu bitiyor, oyun duraklıyor; sonra şehir serbest
  oyuna açık. Senaryo sürerken kurallar kilitli (`SET_FLAG`) ve yeni şehir
  açılmıyor.
- *Kayıt:* `state.scenario` seçime bağlı alan, şema sürümü değişmiyor.
  Başla, bitiş ve sonuç ekranının kapanışı otomatik kaydın 30 saniyesini
  beklemeden kaydediliyor.
- *Arayüz:* kurulumda üçüncü oyun türü "Senaryo" (liste, durum, hedef,
  yıldız eşikleri, cihazdaki en iyi). Oyun duraklamış başlıyor: açılış
  ekranı durumu ve hedefi anlatıyor. Gündemde senaryo çipi (hedef, ilerleme,
  geri sayım); tıklayınca hedef panelinin başındaki senaryo bölümü. Sonuç
  ekranında yıldız, cihazdaki en iyi, "Baştan oyna", "Serbest oyuna devam",
  "Senaryolar". Sonuç beklerken oyun sonu ve zafer ekranı çekiliyor; aynı
  gün zafer de geldiyse ekranı sırada bekliyor.
- *Yerel en iyi:* `capitalforge.scenarios.v1`. Yıldızı çok olan iyi;
  eşitlikte senaryonun ölçüsü (gün az, öndelik çok). Koşu kuruluş anı ve
  bitiş günüyle tanınıyor: sonuç ekranı yeniden açılınca ikinci kez
  sayılmıyor.

**Kurtarma** (seed 7, 150 gün ön tarih, 400 gün, hedef 12 M ₺). Ölçüm ilk
tasarımı bozdu: "zarar eden şubeler" bu ekonomide yok. Altı mağaza türü ×
altı bölge yoklandı (150. ve 300. günde, 20 günlük kâr ortalaması): hepsi
artıda, kalabalık bölgede de. Zararın yeri boşa çalışan destek binaları
(Ar-Ge ve pazarlama, günde ~2 bin ₺ gider) ve borç. Kurulum:
- dört küçük şube, rakibin en az mağazası olan bölgelerde (kâr ediyor);
- şirketin hiç mağazası olmayan elektroniğe odaklı iki Ar-Ge merkezi ve iki
  pazarlama ofisi (zarar ediyor);
- 180 günlük 450 bin ₺ kredi, not C. Kaldıraç %40: ilk sürümde 1,2 M ₺ idi,
  kaldıraç %64'le not ilk gün D'ye düştü, kredi çağrıldı ve şirket 15 günde
  haczedildi;
- şehrin en güçlü rakibi hisselerin %30'unda.

| Vekil (400 gün) | Sonuç |
|---|---|
| Hiçbir şey yapmayan · yalnızca savunan · yalnızca büyüyen | 130. günde devralınıyor |
| Beş günde bir kuran, üç günde bir savunan | 348. günde hedefte (1 yıldız) |
| + boşa çalışan binaları ilk gün yıkan | 259. günde (2 yıldız) |
| Üç günde bir kuran, her gün savunan, yıkan | 243. günde (2 yıldız) |
| On beş günde bir kuran | süre doluyor (7,3 M ₺) |

Yıldız eşikleri 300 ve 230 gün: üç yıldız vekilin en keskin oyunundan
iyisini istiyor. Kazanan koşularda baskıncının payı %44–48'e kadar çıkıyor.

**Krizin ortasında** (seed 42, 200 gün ön tarih, 150 gün, 5 M ₺ kasa, bina
yok). Durgunluk uyarıda başlıyor, 30 gün sonra etkisi başlıyor, senaryonun
son günü bitiyor; hedef o gün şehrin en değerli şirketi olmak. Ölçüm iddiayı
daralttı: kriz rakipleri yavaşlatmıyor (mağazalar kapasitede, talep düşüşü
satışa inmiyor; lider 150 günde 5,9 → ~20 M ₺) ve hisseleri de ucuzlamıyor
(fiyat net değerle yükseliyor). Fırsat ucuz inşaat ve gerileyen arsa; metin
artık yalnız bunu söylüyor.

| Vekil (5 M ₺ kasa) | Bitişte en güçlü rakibe oran |
|---|---|
| Kasada bekleyen | ×0,24 |
| On beş günde bir kuran | ×0,70 |
| Beş günde bir kuran | **×1,05** (kriz kapalıyken ×0,94) |
| Üç günde bir kuran | ×1,10 |
| + krizde rakip hissesi alan | ×1,14–1,22 |

Kasa 4 M ₺'de beş günde bir kuran ×1,004'le sınırdaydı, 6 M ₺'de en keskin
vekil üç yıldıza ulaşıyordu; 5 M ₺ seçildi. Yıldız eşikleri ×1,2 ve ×1,4.

**Codex (#66).** Beş bulgu (ikisi aynı kuralın iki ekranı), hepsi düzeltmeden önce kalan testle:
- *Ekranın arkasında takvim:* boşluk tuşu (`TOGGLE_PAUSE`) açılış ekranı
  açıkken senaryonun günlerini, sonuç ekranı açıkken serbest oyunu
  yürütüyordu. Motor senaryonun ekranı kapanana kadar takvimi başlatan
  komutları reddediyor; duraklatmak serbest.
- *Karenin kalan günleri:* `advance()` bir karede dört güne kadar koşuyor;
  senaryo bitip oyun duraklasa da döngü kalan günleri koşuyordu (geciken
  kare, arka plandan dönüş): şehir sonuç ekranının arkasında ilerliyor ve
  öyle kaydediliyordu. Gün oyunu duraklattıysa döngü kesiliyor (lig bitişi
  ve zafer de aynı yoldan).
- *Yuvarlanan skor:* yıldız üç haneye yuvarlanmış öndelikten hesaplanıyordu,
  ×1,3996 ×1,4 olup üç yıldız alıyordu. Yıldız ham skordan; saklanan ve
  gösterilen öndelik aşağı yuvarlanıyor (×1,39), eşiğin altındaki skor
  eşikte görünmüyor.
- *Kayıttan dönülen koşu:* yerel en iyinin koşu kimliği kuruluş anı ve
  bitiş günüydü; kayıttan dönüp aynı gün başka sonuçla biten koşu (Krizin
  ortasında hep son gün bitiyor) sayılmıyordu. Kimlik artık sonucu da
  taşıyor; arayüz paketinin ilk birim testi bunu sınıyor.

**Doğrulama.** `pnpm test` 409/409 (yeni `scenario.test.ts`, 13 test:
kurulum, aynı şehir, Kurtarma ve kriz kurulumları, iki hedef türü, devralma,
yıldız eşikleri, açılış ve sonuç ekranında duran takvim, bitiş gününde duran
kare, aşağı yuvarlanan skor, kural
kilidi ve ekranlar, gündem çipi; arayüzde `scenarioBest.test.ts`, 2 test;
içerik metinlerinin İngilizce kapsamına senaryolar girdi). `pnpm balance`
300/300; yeni bölüm "Senaryolar: kazanılabilir ama bedava değil" (10
kontrol, ~17 sn). Tarayıcı tam koşu 411/411, konsol hatası yok; yeni bölüm
"Senaryo modu" (Codex düzeltmeleriyle 20 kontrol: liste, kurulumdan kalkan seçimler,
ön tarih ve duraklamış açılış, iki ekranda da boşluk tuşunda duran takvim, kural kilidi, gündem çipi, hedef paneli,
kriz bitiminde sonuç, üç yıldız, yerel en iyi, yenilemede sonuç ve tek
sayım, serbest oyun, kayıp ekranı, "Baştan oyna").

### Tur 39b — Senaryo modu: Konsorsiyuma karşı, Zincir ustası, Şehrin sponsoru

İkinci aşama üç senaryo getiriyor; kurulum ve hedef türleri genişliyor.

**Çatıda değişen.**
- *Kurulum parçalı* (`ScenarioSetup`): şube, boşa çalışan bina, bina yaşı,
  kredi, baskıncı payı, kriz, konsorsiyum, proje takvimi. Her senaryo yalnız
  kendi parçalarını yazıyor.
- *Üç yeni hedef türü:* zafer (`victory`), zincir (`chain`), sponsorluk
  (`sponsor`). Kaybın nedeni kayıtta (`lostReason`: devralma, süre, sıra,
  proje); sonuç ekranı onu yazıyor.
- *Devralınan binalar:* bina sayısı bölge sayısını geçince aynı parsel iki
  kez seçiliyordu; ikinci bina kurulamıyor, sessizce düşüyordu (konsorsiyumda
  12 şubenin 9'u). Seçilen parsel bir daha seçilmiyor; Kurtarma ve sponsor
  kurulumları değişmedi (sayıldı).

**Konsorsiyuma karşı** (seed 7, 200 gün ön tarih, 550 gün, hedef zafer).
35 M ₺ kasa ve 150 günlük on iki mağaza; konsorsiyum devir günü kuruluyor,
30 gün sonra ortak alım. Konsorsiyumun "yatırıma dönüş" sayacı kuruluştan
sonra kurulan binaları sayıyor; bina yaşı devralınan mağazaları bu sayımın
dışında tutuyor. Ölçüm: 300 günlük ön tarihte rakipler oyuncuyu geçiyor ve
arsa azalıyordu; atıl kasa işe koşulamıyor, hiçbir vekil zafere
ulaşamıyordu.

| Vekil (550 gün) | Sonuç |
|---|---|
| Hiçbir şey yapmayan | 109. günde devralınıyor |
| On beş günde bir kuran | süre doluyor (değer hedefte, sıra ikinci) |
| Beş günde bir kuran | 435. günde zafer (1 yıldız) |
| Üç günde bir kuran, her gün savunan | 415. günde (2 yıldız) |
| + atıl kasayı aynı gün işe koşan | 413. günde (2 yıldız) |

Eşikler 420 ve 380 gün. Zafer ekranı senaryonun sonuç ekranıyla aynı haberi
verirdi: zafer hedefinde zafer ekranı kapatılıyor, serbest oyuna dönünce de
çıkmıyor.

**Zincir ustası** (seed 42, 300 gün ön tarih, 250 gün, 3 M ₺ kasa, bina
yok). Hedef: silikon ocağı, çip fabrikası ve telefonu rafında tutan mağaza;
çipin birim maliyeti piyasanın altında; elektronikte %40 pay. Üçü aynı gün
sağlanmalı. Ölçüm ürünü değiştirdi: giyimde ve ekmekte pay 4–49 günde %40'ı
geçiyordu. Elektronikte iki kapı var: Silikon Ocağı 6 M ₺ şirket değeriyle
açılıyor, kurulmuş şehirde de pay yavaş birikiyor. Sanayide boş arsa
kalmamış (yapılı arsa alınabiliyor, liman 90. günde açılıyor); metin bunu
söylüyor. İlk vekil ölçümü yanıltıcıydı: vekil kilit açılmadan sanayi
arsası alıp kuramıyor, sonra kendi boş arsasını görmüyordu.

| Vekil (250 gün) | Sonuç |
|---|---|
| Hiçbir şey yapmayan | süre doluyor |
| Zinciri kurmayan büyüme, üç günde bir | 223. günde devralınıyor |
| Beş günde bir oynayıp zinciri kuran | 101. günde (2 yıldız) |
| Zinciri öne alan, üç günde bir | 97. günde (2 yıldız) |
| On beş günde bir oynayıp zinciri kuran | 196. günde (1 yıldız) |

Eşikler 150 ve 90 gün. Hedef panelinde beş koşulun listesi var: üç halka,
maliyet ve pay. Kendi üretimi olmayan için maliyet satırı "kendi üretimi
yok" diyor.

**Şehrin sponsoru** (seed 1, 180 gün ön tarih, 300 gün). 5 M ₺ kasa ve altı
mağaza. İlk ihale devirden 10 gün sonra açılıyor, ikincisi birincinin
bitişinden 30 gün sonra (serbest oyunda 260–380). Bir ihaleyi rakip kaparsa
senaryo biter. Ölçüm ilk kuralı değiştirdi: "ilk ikiden düşme" her gün
sınanıyordu, ilk inşaat net değeri bir an düşürüp oyuncuyu ilk gün
üçüncülüğe indiriyordu. Sıradan düşen şirketin geri dönmek için 20 günü var:
düştüğü gün haber çıkıyor, hedef panelinde geri sayım. 4 M ₺ kasayla bütün
vekiller ilk ayda sıradan düşüyordu (rakipler bu evrede hızlı büyüyor).

| Vekil (5 M ₺ kasa) | Sonuç |
|---|---|
| Hiçbir şey yapmayan | 86. günde sıradan düşüyor |
| On beş günde bir kuran, son haftada lideri geçen | ilk ihaleden sonra sıradan düşüyor (114. gün) |
| Beş günde bir kuran, son haftada %10 geçen | ×1,25 (1 yıldız) |
| Üç günde bir kuran, son üç günde %5 geçen | ×1,57 (2 yıldız) |

Yıldızın ölçüsü ikinci ihalenin kapandığı günkü öndelik; eşikler ×1,35 ve
×1,65. Vekilin katkıları ~0,7 ve ~1,8 M ₺.

**Arayüz.** Sonuç ekranı kaybın nedenini yazıyor: devralma, süre, sıra ya
da proje. Zafer hedefinde değer hedefteyse eksik olanın birincilik olduğunu
söylüyor. Açılış ekranı konsorsiyumun önderini ve ortak alımın gününü,
sponsor senaryosunda ilk ihalenin gününü yazıyor. Öndelik ölçülü yıldız
eşiklerinde, hedef "en değerli şirket" değilse bir yıldız "hedef" oluyor.

**Doğrulama.** `pnpm test` 415/415. Altı yeni test var: konsorsiyum
kurulumu ve bina yaşı, zafer hedefi, zincirin koşulları, iki sponsorluk ve
proje takvimi, rakibin kaptığı ihale, sıradan düşüş ve 20 gün.
`pnpm balance` 314/314; yeni bölüm "Senaryolar II: konsorsiyum, zincir ve
sponsor" (14 kontrol, ~33 sn). Tarayıcı tam koşu 420/420, konsol hatası
yok; "Senaryo modu" bölümüne 7 kontrol eklendi: konsorsiyumun açılışı,
zafer günü sonuç ve araya girmeyen zafer ekranı, zincir listesi, ihale
günü, sıradan düşüş ve geri sayım, kaybın nedeni.

### Tur 39c — Senaryo modu: Büyük şehir fethi, Holding: iki şehir

Üçüncü aşama son iki senaryoyu getiriyor; liste yedi senaryoda tamamlandı.

**Çatıda değişen.**
- *İki yeni hedef türü:* tekel (`monopoly`: şehirde rakip kalmamalı) ve
  holding (`holding`: holding'in bütün şehirlerinde zafer, hiçbiri
  kaybedilmeden). Yeni kayıp nedeni: `city` (uzaktaki şehir kaybedildi).
- *Ertelenen zafer:* hedefi şehrin zaferinin ötesinde olan senaryoda
  (tekel, iki şehir) değer ve birincilik zaferi kaydediliyor ama oyunu
  durdurmuyor, ekranı açılmıyor; sonucu senaryo veriyor.
- *Dondurma* (`freeze`): senaryo boyunca yeni şirket ruhsatı ve hisse
  ihracı; senaryo bitince kalkıyor.
- *İkinci şehir* (`secondCity`): kurulan şehir kurucu şehir olup uzağa
  geçiyor, oyuncu sermayeyle açılan yeni şehirde başlıyor. Yeni şehri
  kuran yol serbest oyunun `openCity`siyle ortak (`foundCity`). Sermaye
  kurucu şehrin kasasından düşülmüyor ve kurucu şehrin zafer ölçüsüne
  "dışarı aktarılan" diye eklenmiyor.
- *Şehir değişince senaryo oyuncuyla geliyor* (`switchCity`): takvimler
  birlikte yürüdüğü için günleri şehirler arasındaki farkla kayıyor;
  uzaktaki şehrin zaferi de ekran açmadan kaydediliyor.

**Büyük şehir fethi** (seed 7, büyük şehir, 200 gün ön tarih, 400 gün,
12 M ₺ kasa, sekiz mağaza; hedef tekel). Ölçüm iki dondurma getirdi:
- *Ruhsat:* büyük şehirde boşalan koltuk 60 günde bir doluyor, gelen
  rakip kurucu kilidiyle; tekel kovalanan bir hedef oluyordu.
- *İhraç:* premium ve teknoloji doktrinli rakip (Meridyen, Veri, Firuze)
  baskıncı %30'u geçtiği gün kurucu payının tabanına kadar ihraç ediyor.
  Yatırımcının hissesi dolaşıma girmiyor; geri alımla birlikte kontrol
  bir hisse farkla kilitleniyor (Tur 28'in kuralı). İhraç açıkken üç
  rakip hiçbir vekille alınamadı (1.200 gün, 500 M ₺ net değerle de);
  payı %29'da toplayıp vurmak bile yetmedi. İhraç kapalıyken geri alım
  savunması sürüyor ama kilide yetmiyor: sızıp vuran dört günde alıyor.

40 M ₺ kasayla her avcı vekil 44–176 günde tekeldeydi; kasa 12 M ₺. Geç
kalan avcının karşısında rakipler birbirini yutup büyüyor (Meridyen ve
Firuze 150–280 M ₺).

| Vekil (400 gün) | Sonuç |
|---|---|
| Hiçbir şey yapmayan · yalnızca büyüyen | süre doluyor (4–5 rakip kalıyor) |
| Kasasını hedefe saklayan avcılar · 15 günde bir oynayan | süre doluyor (3 rakip) |
| Devralma emriyle avlanan | 311. günde tekel (1 yıldız) |
| + her rakipte payı %29'da toplayıp vuran | 241–245. günde (2 yıldız) |
| + bunu yaparken kasasını hedefe saklayan | 155–169. günde (2 yıldız) |

Yıldız eşikleri 250 ve 150 gün. Büyük şehrin ön tarihi tarayıcıda ~3 sn;
sahnenin kurulması yazılımsal GPU'da ~10 sn daha.

**Holding: iki şehir** (seed 11, Rahat, kurucu şehirde 150 gün ön tarih,
550 gün). Kurucu şehirde 10 M ₺ kasa ve on mağaza (1. sırada, 12 M ₺);
oyuncu 4 M ₺'yle açılan yeni şehrin ilk gününde. Ölçüm: 300 günlük kurucu
şehirde rakiplerin ivmesi oyuncuyu üçüncülüğe itiyordu; değer hedefi
geçse de (84/60 M ₺) birincilik gelmiyor, hiçbir vekil kazanamıyordu.

| Vekil (550 gün) | Sonuç |
|---|---|
| Hiçbir şey yapmayan | süre doluyor |
| Yalnızca yeni şehri oynayan | yeni şehirde 350. gün civarı zafer; kurucu şehir üçüncülüğe düşüyor |
| Önce yeni şehri bitirip dönen | süre doluyor (ihmal edilen kurucu şehir 400. günde üçüncü) |
| Gidip gelen, talimatı varsayılan (kârın yarısı kasaya, savunmasız) | süre doluyor (kurucu şehir ikinci) |
| 15 günde bir oynayan | süre doluyor |
| Gidip gelen (30 ya da 60 günde bir), talimatı "şehirde tut + savun" | 419–427. günde (1 yıldız) |
| Aynısı, üç günde bir oynayan | 356–389. günde (2 yıldız) |

Yıldız eşikleri 400 ve 350 gün.

**Arayüz.**
- *Açılış ekranı:* Büyük şehir fethi'nde rakip sayısı ve dondurmalar;
  Holding'de "yeni şehir" başlığı ve kurucu şehrin değeri ile sırası.
- *Hedef paneli:* Holding'de iki şehrin zafer durumu; gündem çipi
  tekelde devralınan ve kalan rakibi yazıyor.
- *Sonuç ekranı:* kalan rakip, zafer kazanılan şehir sayısı ve
  kaybedilen uzak şehir.
- *Senaryo listesi:* Holding'in kurulum satırı yeni şehrin sermayesini
  ve kurucu şehrin gününü ayrı yazıyor.
- *Telefonda uzun açılış:* sonuç ve açılış katmanı kartı ortalıyor ama
  kaymıyordu. Holding'in açılışı iPhone 13'te ekrana sığmıyor (kart 793,
  katman 664 px), "Başla" düğmesine ulaşılamıyordu (Tur 39a'dan beri uzun
  açılışlarda da). Katman artık kayıyor; kart sığınca ortada, sığmayınca
  baştan başlıyor. Tarayıcı kontrolü düzeltmeden önce kaldı.

**Doğrulama.** `pnpm test` 419/419. Dört yeni test var:
- fethin dondurmaları, ertelenen zafer, tekel ve süre;
- holding kurulumu ve sermayenin kurucu şehre sayılmaması;
- şehir değişince taşınan senaryo;
- iki şehirde zafer ve kaybedilen uzak şehir.

`pnpm balance` 324/324 (24 bölüm); yeni bölüm "Senaryolar III: fetih ve
holding" 10 kontrol, ~165 sn. "Holding: ikinci şehir" bölümü yeni şehri
kuran yolun ayrılmasından sonra değişmeden geçiyor. Tarayıcı tam koşu
428/428, konsol hatası yok (~39 dk); "Senaryo modu" bölümüne 8 kontrol
eklendi:
- büyük şehrin açılışı, dondurmalar ve ön tarih süresi;
- ertelenen zafer ve gündem çipi;
- holding açılışı ve iki şehrin listesi;
- şehir değişince gelen senaryo;
- iki şehirde zafer;
- telefonda ekrana sığmayan açılışta "Başla" düğmesine ulaşılması.

### Tur 40 — Cila ve performans

Tur 39'dan kalan dört başlık: başlık yazı tipinde Türkçe harfler, büyük
şehrin açılış süresi, telefonda bütün katman ve panellerin taranması ve
yedi senaryonun tarayıcıda sonuna kadar oynanması.

**Türkçe harfler.**
- *Sorun:* Fredoka (başlık ve sayılar) Ş ş Ğ ğ İ taşımıyor; resmî 2.001
  sürümü de taşımıyor (320 karakter).
  - Ana oyunun gömülü alt kümesinde bu harfler Nunito'ya düşüyordu:
    "Şehrin sponsoru" ve "karşı" aynı başlıkta iki yazı tipiyle.
  - Lite'ın tam dosyası (web, Android, iOS) birleşen işaretleri de
    taşıyor. Tarayıcı ş'yi s + çengelden kendisi kuruyordu; çengel harften
    kopuk duruyordu.
- *Düzeltme:* harfler yazı tipinin kendi harflerinden ve birleşen
  işaretlerinden kuruluyor (s + çengel, g + ayraç, I + nokta).
  - Yükseklik yazı tipinin kendi bileşiklerinden okunuyor (ç, Ç, Â, Ï).
    Yatayda işaret gövdenin ortasına hizalanıyor.
  - `tools/fredoka_turkish.py` Lite'ın altı dosyasını yerinde yamalıyor.
  - `tools/make-cam-fonts.py` ana oyunun alt kümesini aynı işlevle
    üretiyor. Zaman damgası artık kaynaktan geliyor, her koşu aynı dosyayı
    veriyor. Gömülü woff2'lerin toplamı 71 KB.
- *Lisans:* OFL 1.1 değiştirilmiş sürüme izin veriyor ve ayrılmış yazı
  tipi adı yok. Değişiklik OFL.txt'ye yazıldı.
- *Lite web'in önbelleği:* hizmet çalışanı yazı tiplerini önbellekten
  veriyor ve adresleri sabit; geri dönen oyuncu eski dosyayı görmeye devam
  ederdi.
  - İlk düzeltme önbelleğin adını artırıyordu. Yeni çalışan eski önbelleği
    siliyor, yenisi boş kalıyordu: oyuncu sonraki açılışta çevrimdışıysa
    oyun açılmıyordu (Codex #69).
  - Önbellek artık yerinde kalıyor. Yeni çalışan kurulurken üç yazı
    tipini ağdan taze alıp önbellektekinin üstüne yazıyor (`REFRESH`).

**Açılış süresi.** Tarayıcıda CPU profili alındı (yazılımsal GPU,
swiftshader):

| Açılış | Profil süresi | JS | GPU sürücüsü ve tarayıcı |
|---|---|---|---|
| Krizin ortasında | 12,0 sn | 1,8 sn | 10,1 sn |
| Büyük şehir, serbest oyun | 7,3 sn | 0,9 sn | 6,3 sn |
| Büyük şehir fethi (200 gün ön tarih) | 11,4 sn | 3,0 sn | 8,1 sn |

- Sürenin dörtte üçünden fazlası JS değil: yazılımsal GPU'da gölgelendirici
  derlemesi ve ilk kareler.
- Süre büyük şehre özgü değil; Krizin ortasında'nın açılışı serbest büyük
  şehirden uzun.
- JS'nin en büyük kalemi three.js'nin gölgelendirici kurulumu (0,6–0,9 sn).
  Fetihte JS'nin fazlası 200 günlük ön tarihten geliyor: aynı büyük şehir
  serbest oyunda 0,9 sn, fetihte 3,0 sn.
- Gerçek GPU'da ölçülemedi. Bu ortamda kodda kazanılabilecek pay JS'nin
  1–3 saniyesi, o yüzden kod değişmedi.

**Konsol.** three 0.185 `PCFSoftShadowMap`'i kaldırdı; sahne her açılışta
uyarıyla `PCFShadowMap`'e düşüyordu. Sahne artık doğrudan `PCFShadowMap`
istiyor: görüntü aynı, konsol temiz.

**Telefon taraması.** iPhone SE'de (375×667) şu ekranlar tarandı:
- kurulum ve senaryo listesi;
- sekiz panel: zincir, rekabet, borsa, meclis, şirket, rakipler,
  kayıtlar, yardım;
- karar kartı, zafer ve oyun sonu ekranı;
- yedi senaryonun açılışı ve sonucu.

Her görünür düğme, bağlantı ve giriş kaydırılarak görünür alana
getiriliyor; ortasına tıklanınca başka bir öğeye denk gelmemeli. 282
denetimde sorun çıkmadı (Tur 39c'nin kayan katmanından sonra).

**Yedi senaryo sonuna kadar.** Her senaryo tarayıcıda el sürülmeden
sonuna kadar akıtıldı:

| Senaryo | Sonuç | Gün | Gün başına |
|---|---|---|---|
| Kurtarma | devralındı | 130 | 5 ms |
| Krizin ortasında | süre doldu | 150 | 4 ms |
| Konsorsiyuma karşı | devralındı | 109 | 5 ms |
| Zincir ustası | süre doldu | 250 | 7 ms |
| Şehrin sponsoru | sıra kaybedildi | 86 | 2 ms |
| Büyük şehir fethi | süre doldu | 400 | 19 ms |
| Holding: iki şehir | süre doldu | 550 | 10 ms |

**Doğrulama.** `pnpm test` 421/421. Yeni `fonts.test.ts` iki test getiriyor:
Lite'ın altı Fredoka dosyasında ve ana oyunun gömülü alt kümesinde Türkçe
harfler var mı. Testler eski dosyalarla kaldı.

Lite web uçtan uca testine çalışan güncellemesi eklendi (4 kontrol).
Oyuncuların tarayıcısındaki önceki çalışan (`tools/fixtures/lite-sw-v1.js`)
yeni çalışana geçiyor. Ardından oyun yine çevrimdışı açılıyor ve
önbellekteki yazı tipleri yeni dosyalar. Çevrimdışı, sunucunun bağlantıyı
kesmesiyle kuruluyor: Playwright'ın `setOffline`'ı hizmet çalışanının
isteklerine uygulanmıyor. Kontrol önbellek adını artıran ilk düzeltmede
kaldı.

Tarayıcı testine "Cila" bölümü eklendi (9 kontrol):
- başlık yazı tipinde Türkçe harfler (eski gömülü dosyayla kaldı);
- telefon taraması: kurulum ve liste, sekiz panel, karar kartı, zafer ve
  oyun sonu;
- yedi senaryonun açılış ve sonuç ekranı;
- yedi senaryo sonuna kadar akıyor, el sürülmeyen her senaryo
  kaybediliyor;
- gün başına süre 120 ms'nin altında;
- uygulamanın kendi konsol uyarısı yok;
- konsol temiz.

Tarayıcı tam koşu 437/437, konsol hatası yok (~26 dk); "Cila" bölümü ~110 sn.

### Tur 41 — Başarımlar ve kariyer

Kullanıcı "Başarımlar ve kariyer"i seçti. Tur dört şey getiriyor:
- rozetler;
- koşu geçmişi;
- en iyiler;
- senaryo yıldızlarının toplamı.

Hepsi bu cihazda saklanıyor; lig ve senaryo tabloları değişmiyor.

**Rozetler.** 26 rozet, beş grup (`packages/content/src/achievements.ts`):

| Grup | Rozetler |
|---|---|
| Büyüme | Borsada · Çeyrek milyar · Yarım milyar · İkinci şehir · İmparatorluk |
| Zafer | Şehrin sahibi · Yıldırım · Zor yoldan · Büyük şehrin sahibi · Üç CEO |
| Rekabet | İlk devralma · Seri alıcı · Tekel · Kalkan · Konsorsiyumu dağıt |
| Şehir | Fırtınayı atlat · Fırtınada büyü · Şehrin sponsoru · Meclisin sesi · Belediyenin güvendiği · Açık artırma · Balon avcısı · Görev adamı |
| Kariyer | Senaryo turu · Kusursuz · Ligde |

- *Kapsam:* koşu rozeti tek bir koşuda kazanılıyor; holding'in bütün
  şehirleri tek koşu sayılıyor. Kariyer rozeti bütün koşuların toplamından
  geliyor: meclis, sözleşme, ihale, balon, görev, lig, senaryo yıldızı ve
  farklı CEO.
- *Senaryo:* büyüme ve zafer rozetleri senaryoda sayılmıyor, çünkü kurulum
  hazır servet ve şehir veriyor. Borsada da büyüme rozeti: Kurtarma'da
  halka arz açık ve öneriliyor (Codex #70); katalog testi kuralı grup
  üzerinden denetliyor. Rekabet ve şehir rozetleri her oyunda
  sayılıyor. Sayaçlar devir gününden başlıyor: ön tarihte biten kriz
  oyuncunun değil.
- *Eşikler ölçümden:* `pnpm longrun` (üç tohum, Dengeli) koşuldu. Vekil
  625–730. günde kazanıyor, 1.440. günde 277–308 M ₺'de.
  - Çeyrek milyar uzun oyunun rozeti; tek bir şehirdeki şirketin değeri
    (`companyWorth`, gün sonlarının en yükseği). Holding'in toplamı
    sayılmıyor; yoksa iki 150 M'lik şirket Çeyrek milyarı açıyordu
    (Codex #70).
  - Yarım milyar holding'in toplamıyla ölçülüyor.
  - Yıldırım (Dengeli ya da Zor'da 500. günden önce zafer) vekilin en
    iyisinden %20 hızlı.
- *Ödül yok:* hedef merdiveninin gerekçesiyle aynı; rozet dengeyi
  oynatmıyor.

**Çekirdek.**
- *Sayaçlar* (`state.feats`, `systems/feats.ts`): bu anlar durumda iz
  bırakmadan bitiyor: kriz siliniyor, konsorsiyum dağılıyor, baskıncı satıp
  gidiyor. Sayaç anın kendisinde artıyor. Sayılanlar:
  - kriz: oyuncu ayaktayken biten ve başladığı günden değerli biten;
  - konsorsiyum: oyuncunun direnişiyle dağılan (üyeleri oyundan çıkan
    sayılmıyor);
  - baskın: %25'i geçip %10'un altına itilen (karşı devralma dahil); gün
    sonunda ve başarılı her komuttan sonra bakılıyor, duraklatılmış oyunda
    da hemen sayılıyor (Codex #70). Uzaktaki şehrin borsası da yaşıyor:
    orada püskürtülen baskın şehrin kendi gününde sayılıyor (Codex #70).
    Eşik, uyarılar gibi gün sonunda okunuyor: aynı gün içinde %25'i geçip
    inen baskın sayılmıyor, oyuncu onu hiç görmedi;
  - teslim edilen sözleşme, oyuncunun lobi yaptığı tarafın kazandığı
    oylama, kazanılan ihale;
  - oyuncunun sponsor olarak bitirdiği şehir projesi: bitiş anında
    sayılıyor, çünkü devralma `sponsorId`yi sonradan devralana geçiriyor
    (Codex #70). Eski kayıtta sayaçtan önce biten proje bugünkü
    sponsorluktan okunuyor (ikisinin büyüğü).

  Simülasyon sayacı okumuyor; kararlılık, lig ve iki dilde aynı oyun
  testleri değişmeden geçiyor.
- *Koşunun özeti* (`career.ts`, `runFacts`): koşunun kimliği kurucu şehrin
  kuruluş anı ve tohumu. `holding.foundedAtIso` yeni bir alan; eski kayıtta
  şehirlerin en erkeni alınıyor. Şehir açılınca ya da değişince koşu aynı
  kalıyor. Kaybedilen şehir kapatılmadan önce kuruluş anı holding'e
  yazılıyor: eski kayıtta kurucu şehir kapanınca kimlik değişip koşu iki
  kez sayılırdı (Codex #70). Kurucu şehrin boyutu da aynı anda yazılıyor
  (`holding.foundedCitySize`); yoksa koşu geçmişinde oynanan şehrin boyutu
  görünürdü (Codex #70). Şehir sayısı kalıcı `holding.opened`dan
  geliyor; kapatılan şehir de açılmıştı. Kapatılan şehrin sayaçları
  (devralma, halka arz, sponsorluk, balon, görev, şehir sayaçları)
  `holding.closedTally`de birikiyor: şehir listeden çıkınca koşunun
  toplamı düşmüyor, sonraki ilerleme üstüne ekleniyor (Codex #70). Tekel
  bugünkü rakip listesinden ya da tekelle kazanılmış zaferden
  (`victory.kind`): tekelden sonra yeni rakip giren eski kayıt da Tekel'i
  alıyor (Codex #70).
  Yeni şehir açılınca holding'in kalıcı alanları da geçiyor. Tur 32'den
  beri `foundCity` holding'i baştan kuruyor, kapatılan şehrin zaferini
  (`closedWins`) ve tamamlanma gününü düşürüyordu; holding hedefleri de
  bu yüzden geri gidebiliyordu (Codex #70).
- *Kurallar* (`achievementStatus`): saf işlev, düğümde test ediliyor;
  koşular arası depo arayüzde.

**Arayüz.**
- *Depo* (`packages/ui/src/career.ts`, `capitalforge.career.v1`):
  - Son 100 koşu saklanıyor; daha eskisi toplamlara katlanıyor. Katlanan
    koşunun anahtarı ve katkısı arşivde kalıyor. O koşunun kaydı yeniden
    yüklenirse katkısı arşivden düşülüyor ve koşu listeye geri dönüyor;
    yoksa yeni koşu sanılıp iki kez sayılırdı (Codex #70). Arşiv koşunun
    bütün özetini tutuyor; geri gelen koşu onunla birleşiyor. Zaferden,
    devralmadan ya da halka arzdan önceki bir kayıt kazanılanı geri
    almıyor (Codex #70). Budanan koşunun özeti koşu rozetinin en iyisinde
    de sayılıyor (Seri alıcı 4/5 budanınca düşmüyor); toplamlara zaten
    katlandığı için kariyer rozetlerine ikinci kez girmiyor (Codex #70).
  - Arşiv sınırlı (Codex #70): bütün özetiyle en fazla 200 budanmış koşu
    (koşu başına ~550 bayt; depo en fazla ~165 KB). Daha eskisinin özeti
    siliniyor; toplamları arşivde, koşu rozetlerindeki en iyi değeri
    rozet başına tek sayıda (`best`) kalıyor. Bedeli: 300 koşudan eski bir
    kaydın yeniden yüklenmesi yeni koşu sayılıyor.
  - Aynı koşu yeniden görülünce sayaçlar ve değer en yükseğinde kalıyor:
    eski bir kayıttan dönmek kazanılanı geri almıyor.
  - Açılan rozet kalıcı; açıldığı an, şirket ve gün saklanıyor.
  - Depoya rozet açılınca ya da koşunun sonucu değişince yazılıyor; bunun
    dışında en fazla 10 sn'de bir.
- *İzleyici* (`useCareerWatch`): motor gün başı haber vermiyor; durumu
  yerinde değiştiriyor ve bir karede birkaç gün ilerleyebiliyor. İzleyici
  her motor sürümünde koşuyu kaydediyor.
  - İlk sürüm yalnızca gün ya da sonuç değişince bakıyordu. Duraklatılmış
    oyunda aynı gün verilen komut (halka arz, balon, görev) rozeti ertesi
    güne bırakıyordu (Codex #70).
  - Kare yalnız sonunda görülüyor: arada eşiği geçip geri düşen değer
    kariyere girmiyordu (Codex #70). Çekirdek gün sonlarının en yüksek
    holding değerini tutuyor (`feats.peakWorth`); koşunun değeri ondan.
  - Gözlem ucuz; depoya yazma seyreltiliyor.
  - Açılan rozet bildirim olarak düşüyor; ikiden fazlası tek bildirimde.
- *Kariyer sayfası:*
  - özet: rozet, senaryo yıldızı, zafer, en yüksek değer, koşu;
  - gruplara göre rozetler: kazanılanın tarihi, şirketi ve günü,
    kazanılmayanın ilerlemesi;
  - son 12 koşu: tür, CEO, zorluk, şehir, sonuç, değer, tarih. Zaferi
    yalnız kapatılan şehirde kalan koşu "Zafer" yazıyor; günü bilinmiyor
    (Codex #70).
- *Girişler:* kurulum ekranı (koşular arasında bakılan yer) ve Hedefler
  paneli. Rıhtıma dokuzuncu sekme eklenmedi: eşit sütunlu rıhtımda sütun
  375 px'de ~39 px'e inerdi, etiketlerin hepsi kesilirdi.
- *Sonuç ekranları:* zafer, oyun sonu, senaryo ve lig sonucu bu koşuda
  kazanılan rozetleri yazıyor.
- *Yardım:* "Koşuların ötesine bak" adımı eklendi.

**Doğrulama.** `pnpm test` 456/456; 35 yeni test.

`packages/core/test/career.test.ts` (22 test):
- katalog tutarlılığı;
- her sayacın kendi anında artması: kriz, konsorsiyum, sözleşme, ihale,
  meclis, baskın, sponsorluk (sonuncusu düzeltmeden önce kaldı);
- holding'de koşu kimliği, lig ve senaryo kipi, senaryonun ön tarihinin
  sayılmaması;
- kurucu şehir kapanınca koşunun kurucu boyutunun değişmemesi, eski
  holding kaydında kurucu şehir kapanınca kimliğin değişmemesi,
  duraklatılmış oyunda komutla biten baskının hemen sayılması, uzaktaki
  şehirde püskürtülen baskının sayılması, kapatılan şehrin açılmış
  sayılması ve sayaçlarının koşuda kalması (yeni şehir açılınca da), yeni
  şehir açılınca kapatılan şehrin zaferinin kalması, bir karenin arasında
  kalan en yüksek değerin sayılması (sekizi de düzeltmeden önce kaldı);
- Çeyrek milyarın tek şirketi, Yarım milyarın holding'i okuması; tekel
  zaferinden sonra yeni rakip girse de Tekel'in sayılması (ikisi de
  düzeltmeden önce kaldı);
- zafer süzgeçleri, koşu ve kariyer kapsamı, senaryo yıldızı, farklı CEO.

`packages/ui/test/career.test.ts` (11 test):
- rozetin bir kez açılması;
- eski kayıttan dönünce kazanılanın kalması;
- koşuların toplamı;
- senaryonun büyüme rozetine sayılmaması;
- kurulum ekranında senaryo yıldızı;
- budanan koşunun toplamlara katlanması ve koşu rozetinin ilerlemesinde
  sayılmaya devam etmesi, arşivin sınırlı kalıp en eski koşunun en iyi
  değerini koruması (ikisi de düzeltmeden önce kaldı);
- budanan koşunun kaydı geri gelince iki kez sayılmaması, zaferini ve
  devralma, halka arz gibi özetini kaybetmemesi (üçü de düzeltmeden önce
  kaldı).

`packages/ui/test/careerFormat.test.ts` (2 test): geçmişteki sonuç
satırı; zaferi yalnız kapatılan şehirde kalan koşunun zaferli görünmesi
(düzeltmeden önce kaldı).

İçerik çevirileri testi rozetleri de kapsıyor.

Tarayıcı testine "Kariyer" bölümü eklendi (9 kontrol):
- kurulumda Kariyer: 26 rozet, boş geçmiş;
- rozet açılınca bildirim ve depoya hemen yazılması;
- duraklatılmış oyunda aynı gün açılan rozetin de hemen bildirilmesi
  (düzeltmeden önce kaldı);
- Hedefler panelinden Kariyer, kazanılan rozetin günü ve koşu satırı;
- zafer ekranında bu koşunun rozetleri;
- sayfa yenilenince kalıcılık;
- İngilizce;
- iPhone SE'de ulaşılabilirlik ve yana taşmama;
- konsol.

Tarayıcı tam koşu 446/446, konsol hatası yok (~26 dk); "Kariyer" bölümü ~30 sn.

### Tur 42 — Açılış hızı: gölgelendiriciler

Kullanıcı "Açılış hızı: gölgelendiriciler"i seçti. Tur 40'ın profili
açılışın dörtte üçünden fazlasının JS değil, yazılımsal GPU'da
gölgelendirici derlemesi ve ilk kareler olduğunu göstermişti. Bu tur
derlenen programları saydı, sayıyı indirdi ve derlemeyi ilk karenin önüne
aldı. Oyun ve görüntü aynı.

**Ölçüm.** Sayfada WebGL'in `linkProgram`'ı sarıldı: her programın adı,
kaynağı ve derlendiği an tutuldu. Kare zamanları sayfanın içinden,
`frameCount`'tan okundu; Playwright'ın beklemesi meşgul sayfada 2–3 sn
geç kalıyordu. Standart şehrin açılışı 44 program derliyordu:

| Malzeme | Program |
|---|---|
| MeshStandardMaterial | 20 |
| ShaderMaterial (bloom ve son işlem) | 8 |
| MeshBasicMaterial | 6 |
| MeshDepthMaterial (gölge) | 5 |
| Çizgi, ortam haritası, çıkış | 5 |

Üç kök neden:
- *Kademe inişi.* Yazılımsal GPU en pahalı kademeden (gölge, bloom, ortam
  haritası) başlıyordu. İlk kareler ~2 sn sürüyor, uyarlama 2,5 sn'lik
  pencereden sonra kademeyi en alta indiriyor, her malzeme yeni kademe
  için ikinci kez derleniyordu. Testler zaten hep en alt kademede
  oturuyordu.
- *Gölge geçişi ışıklardan önce.* three ilk karede gölge haritasını
  ışıklar sayılmadan çiziyor. Derinlik programları önce "ışıksız"
  anahtarla, ikinci karede ışıklarla yeniden derleniyordu. Kademe
  değişiminde gölgeler açılınca da aynısı oluyordu.
- *Bloom'un beş bulanıklığı.* `UnrealBloomPass` beş mip düzeyinin çekirdek
  yarıçapını (`KERNEL_RADIUS` 6, 10, 14, 18, 22) `#define` olarak yazıyor:
  aynı bulanıklık beş ayrı program.

**Değişiklikler** (`packages/render-three`):
- *Yazılımsal GPU en ucuz kademeden başlıyor* (`gpu.ts`). GPU'nun adı
  `RENDERER`'dan okunuyor. Chrome onu "WebKit WebGL", eski Firefox "Mozilla"
  diye gizliyorsa ad `WEBGL_debug_renderer_info`'dan okunuyor (Firefox:
  Codex #71). SwiftShader, llvmpipe, softpipe ve Windows'un temel sürücüsü
  tanınıyor. Uyarlama yine çalışıyor; gerçek
  GPU'nun açılış tahmini değişmedi.
- *Ön derleme.* Sahne durumu gelince ilk karede görünen her malzeme
  `renderer.compile` ile derleniyor. Işıklar önceden sayılıyor. Programın
  anahtarı ton eşlemesine, o da çizilen hedefe bağlı: bloom açıksa
  derleme ara hedefe. Görünmeyenler (yerleştirme hayaleti, genel merkez
  işareti, veri merceği) eskisi gibi ilk kullanıldıklarında derleniyor.
  - Tarayıcı paralel derlemeyi destekliyorsa (`KHR_parallel_shader_compile`,
    gerçek GPU'larda var) çizim döngüsü programların hazır olmasını
    bekliyor, arayüz canlı kalıyor. Tuval o sırada gökyüzü rengiyle
    siliniyor. Üst sınır 10 sn.
  - Kareler beklerken oyun saati de bekliyor (Codex #71): oyun döngüsü
    `shadersWarm()` sormadan günü ilerletmiyor. Yoksa yeni oyun gökyüzü
    renginin arkasında, kademe değişimi donmuş karenin arkasında akıyordu;
    hızlı kademede oyuncu görmediği günleri kaçırırdı.
  - Derlemenin bittiği karenin ardındaki kare de oyun saatine yazılmıyor
    (Codex #71). Paralel derleme yoksa programlar o karede eşzamanlı
    derleniyor; ağırlık JS'te değil GPU sürecinde, sonraki karenin
    aralığında görünüyor. Yazılımsal GPU'da en üst kademeye geçince sonraki
    kare 3,1 sn sonra geliyor ve oyun saatine 500 ms yazıyordu.
  - Kademe değişince ön derleme yeniden: yeni kademenin programları
    derlenirken son kare ekranda kalıyor.
  - Bloom ve çıkış geçişlerinin tam ekran malzemeleri sahnede değil; ön
    derleme onları da kendi hedefleriyle derliyor (Codex #71).
    - Derleme, three'nin `FullScreenQuad`'ı gibi yalnız konum ve uv taşıyan
      bir dörtgenle yapılıyor; normal olsaydı program `HAS_NORMAL` ile ayrı
      derlenirdi.
    - `OutputPass` ton eşleme tanımlarını ilk çiziminde kuruyor. Ön derleme
      aynı yöntemi hiçbir şey çizmeyen bir çiziciyle önceden çağırıyor.
  - Gölge derinliği programları hâlâ ilk gölge karesinde derleniyor. three
    onları gölge geçişinin içinde kuruyor ve dışarıdan derletmenin bir yolu
    yok. En üst kademede bunlar birkaç küçük program.
- *Bloom tek programla* (`bloom.ts`): yarıçap bir uniform. Döngü en büyük
  yarıçapa kadar sabit sınırla dönüyor ve kendi yarıçapında duruyor.
  Katsayılar ve toplama sırası aynı.

**Sonuç.** Yazılımsal GPU'da (SwiftShader), iki koşunun ortalaması;
süreler "Şirketi kur"a tıklanınca başlıyor:

| Açılış | Program | İlk kare | 5. kare |
|---|---|---|---|
| Standart şehir | 44 → **16** | 6,3 → **2,1 sn** | 13,1 → **4,0 sn** |
| Büyük şehir | 36 → **16** | 7,1 → **2,7 sn** | 14,9 → **5,0 sn** |
| Krizin ortasında | 36 → **14** | 5,9 → **3,0 sn** | 16,0 → **5,7 sn** |
| Büyük şehir fethi | 38 → **15** | 7,3 → **4,2 sn** | 18,6 → **8,0 sn** |

- Fetihte kalan sürenin büyük kısmı 200 günlük ön tarihin JS'si (Tur 40:
  ~3 sn).
- En üst kademede (gerçek GPU'lu masaüstü) derinlik programları 5 → 3,
  bloom ve son işlem programları 8 → 4. Kademe değişince hiçbir program
  aynı kaynakla iki kez derlenmiyor.
- Gerçek GPU'da ölçülemedi. Orada derleme hızlı; kazanç daha az program,
  ikinci derlemenin kalkması ve derleme sırasında canlı kalan arayüz.

**Görüntü.**
- Bloom birebir aynı: 480×320'lik bir sahne iki geçişle de çizildi;
  153.600 pikselin hiçbirinde fark yok.
- En üst kademede, Krizin ortasında'nın şehrinde gündüz ve gece kareleri
  önce ve sonra aynı; yalnız trafik farklı. Gece bloom'un en çok
  göründüğü an: pencere ışıkları ve sokak lambaları.

**Doğrulama.** `pnpm test` 463/463. Yeni `bloom.test.ts` dört test:
- beş bulanıklık malzemesi aynı gölgelendiriciyi ve tanımları paylaşıyor
  (three üst sınıfın yöntemini yeniden adlandırırsa kalır);
- yarıçaplar ve katsayılar three'ninkiyle aynı, yarıçapın ötesi sıfır;
- son işlem malzemeleri: bloom'unkiler ara hedefe, çıkışınki ekrana;
- çıkış geçişinin tanımları önceden kuruluyor ve ilk çizim onları
  değiştirmiyor.

Yeni `gpu.test.ts` üç test: adı açık sürücüler, Chrome'un ve Firefox'un
gizlediği adlar. Firefox testi düzeltmeden önce kaldı.

Tarayıcı testine "Açılış: gölgelendiriciler" bölümü eklendi (12 kontrol):
- yazılımsal GPU tanınıyor, açılış en ucuz kademede;
- açılışta kademe inmiyor;
- gölgelendiriciler ilk kareden önce derleniyor;
- açılışta en fazla 20 program;
- yazılımsal GPU'da eşzamanlı derleme karesinin süresi oyun saatine
  yazılmıyor;
- en üst kademede bloom tek bulanıklık programıyla;
- açılışta ve kademe değişiminde hiçbir program aynı kaynakla iki kez
  derlenmiyor;
- paralel derleme taklit edilince (her program 600 ms sonra hazır) çizim
  döngüsü bekliyor;
- o sırada tuval siyah değil, gökyüzü renginde;
- kareler beklerken oyun saati de bekliyor;
- en üst kademede bloom ve çıkış programları ilk karelerinden önce hazır;
  hiçbiri hazır olmadan kullanılmıyor;
- konsol temiz.

Eski yapıda (main) konsol dışındaki ilk altı kontrol ve paralel derleme
kontrolü kalıyor. "Tuval siyah değil" kontrolü bu turun ilk sürümünde
kaldı: three'nin silme rengi sahne çizilene dek siyah, bekleyen döngü
tuvali siyaha siliyordu. Kontrol önce yazılımsal GPU'nun kendi
açılışındaydı ve düzeltmesiz yapıda da geçiyordu; orada ön derleme
eşzamanlı bitiyor, bekleme yolu hiç koşmuyor. Bu yüzden uzantının
taklit edildiği ayrı bir açılışa taşındı.

"Bloom ve çıkış programları hazır" kontrolü Codex düzeltmesinden önce
kaldı. Düzeltmenin ilk sürümünde de kaldı: normalli dörtgen bulanıklığı
ikinci bir programla derletiyordu. "Oyun saati bekliyor" kontrolü de
düzeltmeden önce kaldı: 600 ms'lik beklemede oyun saati 1.083 ms ilerledi.
"Eşzamanlı derleme karesi" kontrolü de düzeltmeden önce kaldı (+500 ms).

Tarayıcı tam koşu 458/458, konsol hatası yok (~32 dk); "Açılış" bölümü
~50 sn. Firefox düzeltmesi bu koşudan sonra geldi; ardından "Açılış"
bölümü yeniden koşuldu, 12/12.

### Tur 43 — Oyun içi akıcılık

Kullanıcı "Oyun içi akıcılık"ı seçti. Tur 42 açılışa bakmıştı; bu tur
oyunun kendisine baktı: büyük şehirde ve geç oyunda bir karenin JS süresi
ve bir oyun gününün süresi. Oyun ve görüntü aynı.

**Ölçüm.** Tarayıcıda kare JS'i sayfanın içinden ölçüldü (`engine.advance`
ve çizim ayrı), gün başına süre Node'da ve tarayıcıda. CPU profili Node'da
`--cpu-prof`, tarayıcıda CDP ile, küçültülmemiş bir yapıyla alındı.
- Yazılımsal GPU'da (SwiftShader) kare GPU'ya bağlı: kare aralığı
  0,5–1 sn, JS bunun ~%3'ü. Gerçek cihazda takılmayı GPU değil günün JS'i
  yapıyor: 3. hızda gün 480 ms'de bir geliyor ve o kareyi bekletiyor.
- Büyük şehir fethinde (430 bina) bir gün tarayıcıda ~20 ms: simülasyon
  günü, state eşitlemesi (~4,5 ms), React (~1,5 ms).
- Günün içinde pazar adımı her gün ~5,6 ms. İhale günleri 52,8 ms'ye,
  rakip karar günleri ~18 ms'ye çıkıyordu.

Kök nedenler:
- *Pazar adımı aynı değerleri tekrar tekrar hesaplıyordu.* Dağıtım her
  (bölge, ürün) çifti için mağazanın fiyatını, kalitesini, markasını,
  hizmet, kart ve proje çarpanlarını ve kaynak bölgeden erişimi yeniden
  soruyordu. Hiçbiri gün içinde değişmiyor.
- *İhale değerlemesi her artırmada.* Değerleme her bina türü için yatırım
  tahmini demek. Bir teklif turunda her rakip her artırmada yeniden
  değerliyordu; parsel de kasa da tur boyunca değişmiyor.
- *Rakip kartları şehri halka başına tarıyordu.* `flowFor` her ürün halkası
  için bütün binaları tarıyordu, en ucuz parsel araması her kart için
  bütün parselleri.
- *Örnek tamponlarının tamamı her karede yükleniyordu.* Tamponlar en
  kalabalık hâle göre ayrılmış (araç türü başına bütün araçlar, en büyük
  şehrin binaları); çizilen `count` kadarı. `needsUpdate` tamponun
  tamamını yüklüyor.
- *Şehir dokusu her gün yeniden yerleşiyordu.* Oyuncuya ait olmayan
  yapılar, süsleri ve gölgeleri her state eşitlemesinde baştan
  yerleşiyordu. Doku 150 günün 51–67'sinde değişiyor.

**Değişiklikler.**
- *Pazar adımı* (`market.ts`): mağazanın gün boyu sabit değerleri
  (`OutletDay`) mağaza başına bir kez. Erişilen bölgeler ve erişim kaynak
  bölge başına bir kez, raf erişimi arketip başına bir kez, birim maliyet
  ürün başına bir kez. Şirketin kategori satışı şirketin mağazalarında
  paylaşılan bir kayıtta. Çekicilik eskisiyle aynı sırayla çarpılıyor:
  `kalite × marka × fiyat`, sonra `× erişim × hizmet × kart × proje`.
- *İhale* (`auction.ts`): değerleme teklif turu başına rakip başına bir
  kez.
- *Rakip kartları* (`chain.ts`): şirketin bütün ürünlerindeki üretim ve
  tüketim tek taramada; en ucuz parsel bina türü başına bir kez. İkisi de
  bina indeksinin kapsamında (`scopedMemo`): kapsamda bina değişmiyor.
- *Yalnız çizilen kısım yükleniyor* (`instances.ts`): araç, ışık, kamyon,
  yaya, duman, doku ve süs tamponlarında yükleme aralığı `[0, count)`.
  Çağıranlar her yüklemede ilk `count` yuvanın hepsini yeniden yazıyor.
  `count` sıfırsa hiçbir şey yüklenmiyor: WebGL'de sıfır uzunluklu aralık
  "tamponun sonuna kadar" demek.
- *Doku yalnız değiştiği günlerde yerleşiyor* (`scene.ts`): karenin yapısı
  ve yüksekliği aklında tutuluyor. Yerleşim yalnız bu ikisine bakıyor (renk
  sapması ve cephe karenin kimliğinden); ikisi aynıysa çıktı da aynı.
  Binalar 150 günün 119'unda değişiyor; onların atlanması denenmedi.

**Sonuç bit bit aynı.** Her adımdan sonra 11 koşu (standart ve büyük şehir,
yedi senaryo, iki uzun koşu) günün sonundaki state'in parmak iziyle
karşılaştırıldı; hepsi eskisiyle aynı. Zaman damgaları (`…AtIso`) ize
girmiyor, her koşuda değişiyorlar. Yeni `pnpm dayperf` gün başına süreyi
senaryo şehirlerinde yazıyor, sonda izle.

**Gün başına süre, Node** (`pnpm dayperf`, 10 gün ısınma, 120 gün; ms).
Önce ve sonra iç içe üçer koşu, aralıklar koşular arası:

| Senaryo | Bina | Ortalama | p95 | En yavaş gün |
|---|---|---|---|---|
| Büyük şehir fethi | 430 | 22,5–24,0 → **15,8–18,0** | 40–46 → **29–32** | 63–103 → **40–47** |
| Holding | 60 | 9,5–10,5 → **6,8–7,9** | 17–18 → **11–14** | 35–37 → **16–22** |
| Zincir ustası | 225 | 9,0–10,4 → **6,6–8,4** | 17–20 → **11–15** | 30–41 → **14–19** |
| Konsorsiyum | 157 | 6,2–7,2 → **3,9–4,3** | 11–15 → **7–10** | 17–24 → **10–13** |
| Krizin ortasında | 149 | 4,5–5,4 → **2,9–3,5** | 8–10 → **5–6** | 20–27 → **6–10** |

Sponsorda (121 bina, gün ~3,5 ms) fark gürültü düzeyinde.

**Tarayıcı** (SwiftShader, en üst kademe, 3. hız, ~21 sn; iki koşunun
ortalaması):

| | Fetih önce | Fetih sonra | Holding önce | Holding sonra |
|---|---|---|---|---|
| Kare JS, ortalama | 28,2 ms | **18,4 ms** | 9,7 ms | **7,3 ms** |
| Kare JS, p95 | 48,9 ms | **34,4 ms** | 16,0 ms | **12,2 ms** |
| Çizim JS (gün dışı) | 7,5 ms | **3,7 ms** | 2,5 ms | **1,6 ms** |
| Gün | 19,7 ms | **14,0 ms** | 7,2 ms | **5,8 ms** |

- Standart şehirde oyun dururken kare başına yüklenen tampon verisi
  44.928 → **4.608 bayt**: araçlar ve yayalar yürüyor, yalnız onların
  çizilen yuvaları gidiyor.
- 3. hızda 20 günde doku 6 kez yerleşti.
- Gerçek GPU'da ölçülemedi. Orada kare JS'i kare bütçesinin (16,7 ms)
  büyük kısmı; kazanç daha çok orada görünür.
- Kalan en büyük kalemler: rakip karar günü (yatırım tahmini, rekabet
  kartları) ve her gün yeniden yerleşen binalar.

**Görüntü.** Krizin ortasında'nın şehrinde en ucuz kademede gündüz ve
gece, en üst kademede gündüz kareleri önce ve sonra aynı; yalnız trafik
farklı.

**Doğrulama.** `pnpm test` 466/466. Yeni `instances.test.ts` üç test:
yükleme aralığı çizilen örnek sayısı kadar; her yükleme önceki aralığı
siliyor; çizilen yoksa hiçbir şey yüklenmiyor.

Tarayıcı testine "Akıcılık: kare ve gün" bölümü eklendi (3 kontrol):
- araç ve yaya tamponlarından yalnız çizilen kısım yükleniyor (kare başına
  20.000 bayttan az);
- şehir dokusu yalnız değiştiği günlerde yeniden yerleşiyor (3. hızda 20
  gün; çizilen doku kalıyor);
- konsol temiz.

Eski yapıda (main) ilk iki kontrol kalıyor: kare başına 44.928 bayt,
doku sayaçları yok.

Tarayıcı tam koşu 461/461, konsol hatası yok (~33 dk); "Akıcılık" bölümü
~1 dk.

### Tur 44 — Değerlendirme turu: senaryolar, kariyer ve hız turlarından sonra

Kullanıcı sıradaki tur için değerlendirmeyi seçti (Tur 17 ve 38 gibi). Tur
38'den beri senaryo modu (Tur 39), cila (40), kariyer (41) ve iki hız turu
(42, 43) geldi. Soru, oyunun bütün olarak nerede durduğu.

**Ölçüm.** Tur 38'in vekilleri ve tohumları; betikler oturumun karalama
alanında, koşu başına 1000 gün.

*Zorluk eğrisi* (8 tohum: 1/7/42/101/202/3/5/11; bilgili 5 günde bir ve
savunmasız, yavaş 15 günde bir; savunan yavaş üç günde bir geri alıyor):

| | Bilgili | Yavaş, savunmasız | Yavaş, savunan |
|---|---|---|---|
| Rahat | 390–503'te kazanıyor (8/8) | 0 düşüş; bir tohumda zafer (537) | 0 düşüş |
| Dengeli | 625–752 (8/8) | 7/8 düşüyor (754–886) | 0 düşüş |
| Acımasız | 5/8 kazanıyor (809–929), 2 düşüyor, biri 1000 günde zafersiz | 8/8 düşüyor (367–815) | 2/8 düşüyor (405, 426) |

Dengeli'nin üç kolu Tur 38'in ayarından sonraki ölçümle birebir aynı;
Acımasız'da bir tohum düşüş yerine 1000 günü zafersiz bitiriyor. Eğri
senaryo, kariyer ve hız turlarından etkilenmemiş: hiçbiri kuralı
değiştirmedi.

*Sistemler, 1000 günde* (bilgili vekil balonu yakalıyor, biten görevi
alıyor, zaferden sonra oynamaya devam ediyor):

| | Standart (10 tohum) | Büyük şehir (3 tohum) |
|---|---|---|
| Zafer günü | 573–752 | 684, 701 (biri 1000 günde yok) |
| Karar kartı · kriz · dönem · kampanya | 20,6 · 1,8 · 4,7 · 3,8 | 20,3 · 1,7 · 4,7 · 3,7 |
| Balon · görev · şehir projesi | 30 · 49 · 2 | 30 · 57 · 2 |
| Gündem: ortalama · en çok · 8'den kalabalık gün | 6,1 · 11 · %10 | 6,1 · 11 · %9 |
| Gün süresi (ms): erken → orta → geç | 2 → 8 → 10 | 4–8 → 21–25 → 40–47 |

Takvimler Tur 38'deki gibi, üst üste binme yok. Geç oyunda gün standart
şehirde 25–37 ms'den 9–11 ms'ye, büyük şehirde 94 ms'den 40–47 ms'ye
indi (Tur 38 ve 43).

*Rozetler.* Vekil 26 rozetin yalnız üçünü açıyor: Şehrin sahibi, Fırtınayı
atlat, Fırtınada büyü (büyük şehirde Büyük şehrin sahibi; zafersiz tohum
Çeyrek milyarı açıyor). Gerisi bilinçli hamle istiyor: meclis oyu,
sözleşme, ihale, devralma, halka arz, holding. Rozet bunun için var.
Fırtınayı atlat ile Fırtınada büyü büyüyen oyuncuda her krizde birlikte
açılıyor; ayrışmaları küçülen oyuncuda. Bilerek bırakıldı.

*Tarayıcıda yeni oyuncu.* Masaüstü (1280×860) ve telefon (390×844),
Türkçe ve İngilizce: kurulum, senaryo seçimi, boş Kariyer, Kurtarma'nın
açılışı ve ilk saniyeler. Yana taşma yok, konsol temiz. İngilizce
ekranlarda Türkçe harf yalnız kişi adlarında (CEO'lar) ve dil seçicinin
"Türkçe"sinde.

**Bulgular ve düzeltmeler.**

**1 · Türkçe ondalık ayırıcı tutarsızdı.** Para "1.23 M ₺" yazıyordu;
telefonda hemen yanında "-1.616 ₺" bin altı yüz on altı demek. Yüzde ve
ondalıklar virgüllüydü ("%3,5"), Türkçe yazımda da ondalık virgül.
Zincirin birim fiyatı Türkçede de "₺12.60" diye öndeydi; panelin kendi
yorumu "₺2,80" yazıyordu. Kalite, marka ve çarpanlar ("×1.05") da
noktalıydı.
- Para (`formatMoney`, `formatShortMoney`), birim fiyat (yeni
  `formatUnitMoney`), sözleşme ve değer eşiği haberleri, rekabet kartının
  Ar-Ge ve pazarlama satırları, borsa, rekabet, şirket ve arsa
  panellerindeki çarpanlar artık dilin ondalığıyla: "1,23 M ₺", "12,60 ₺",
  "×1,05". İngilizce aynı ("₺1.23M", "₺12.60").
- Lig parmak izi ve tekrarı sayıyı biçimlemiyor; kayıtlı haberlerin metni
  eski biçimde kalıyor.

**2 · Yardımda beş sistem yoktu.** Yardım 17 maddeydi; ihale, meclis,
sözleşme, Tohum Ligi ve senaryo modu anlatılmıyordu (zincir rehberde
anlatılıyor). Beş madde eklendi, oyunda karşılaşılma sırasıyla: ihale
arsadan sonra, meclis ve sözleşme işgücünden sonra, senaryo ve lig
kariyerden önce. Panel artık madde listesinden çiziliyor (`HELP_STEPS`),
her madde `data-help-step` taşıyor.

**3 · Mağazanın yanına açılışlar akışı yine dolduruyordu.** Tur 38 rakip
genişlemelerini haftalık özete toplamıştı; oyuncunun aynı kategoride
mağazası olan bölgedeki açılış tek başına haberdi. Oyuncu büyüdükçe
neredeyse her açılış doğrudan rekabet oluyor. Büyük şehirde görünen 60
haberin tohum başına ortalama 10–13'ü (en çok 20'si) tek tek "X
genişliyor"du. Akış 44–71 günü kapsıyordu.
- Haftanın ilk doğrudan rekabet açılışı yine tek haber; ikincisinden
  itibaren "Mağazalarının yanına rakip · bu hafta N açılış", bölge başına
  sayım ve son açılışın yeri.
- Sonra (aynı tohumlar): ortalama 4–6 özet (en çok 10), akış 50–77 gün.
  Simülasyon aynı; haber akışını okuyan oyun mantığı yok.

**4 · Kurulumdaki Kariyer Escape ile kapanmıyordu.** Oyun içindeki
paneller kapanıyor; kurulum ekranındaki katman yalnız × ile kapanıyordu.

**5 · İngilizce taraması dar kalmıştı.** Tarayıcı testinin "Dil" bölümü
altı paneli tarıyordu; Tur 39–41'in ekranları (senaryo seçimi ve açılışı,
kariyer, hedefler) ve yardım taranmıyordu. Bunlar da tarandı, kalıntı
yok; kontrol kalıcı.

**Değişmeyenler.** Rozet eşikleri (Tur 41'de ölçümle kondu), senaryo
yıldızları (denge testinin üç senaryo bölümü sınıyor) ve zorluk ayarı.

**Doğrulama.** `pnpm test` 468/468.
- `i18n.test.ts`: para, kısa para ve birim fiyat iki dilde. Yeni test:
  400 günlük oyunun haberlerinde, zincir ve rekabet kartlarında Türkçe
  noktalı ondalık yok. İkisi de düzeltmeden önce kaldı ("1.23 M ₺",
  "9.17").
- `news.test.ts`: yeni test, büyük şehirde 400 gün; mağazanın yanına
  açılışlar haftada tek haber ve sayım başlıkla aynı. Düzeltmeden önce
  kaldı (özet yok). Tur 38'in iki testi yeni grubu tanıyor.

Tarayıcı testine "Değerlendirme: yardım, sayılar, İngilizce ekranlar"
bölümü eklendi (5 kontrol):
- yardım ihaleyi, meclisi, sözleşmeyi, ligi ve senaryoyu anlatıyor;
- Türkçede para, çarpan ve birim fiyat virgüllü (üst bar ve dört panel);
- kurulumdaki Kariyer Escape ile kapanıyor;
- İngilizce senaryo seçimi, kariyer, senaryo açılışı, hedefler ve yardımda
  Türkçe kalıntı yok;
- konsol temiz.

Eski yapıda (main) ilk üçü kalıyor: yardımda madde kimliği yok, "chain:
8.16 · rivalry: 0.45 · company: 1.00 · bourse: 1.00", katman açık kalıyor.

Tarayıcı tam koşu 466/466, konsol hatası yok (~26 dk); "Değerlendirme"
bölümü ~40 sn. CI'da tip, test, denge ve duman koşusu yeşil.


---

## 3. Ölçülen durum

`pnpm bench` çıktısından (360 gün, 3 tohum):

### Büyüme ve rekabet

| | Değer |
|---|---|
| Oyuncu / rakip oranı | **2,28** — Tur 25 öncesi 2,00; Tur 21 öncesi 1,75; Tur 7 öncesi 0,76 idi |
| Oyuncu net değeri / en iyi rakip | 42,67 M ₺ / 18,74 M ₺ |
| Oyuncu bina sayısı | 84 |
| Günlük kâr | 275 B ₺ |
| Batan şirket | **0** |

Not: vekil Tur 14'te devralmayı öğrendi (boş parsel bitince mevcut
yapıyı primli alıyor — oyunun kendi öğretisi). Önceki satırlarla kıyasta
bu repertuvar farkının payı var. Tur 25'teki artış yapı menüsünün doğru
tahmininden: vekil artık kendi şubesini yiyen mağazayı açmıyor.

### Doygunluk (Tur 8 sonrası)

| Karşılanmayan talep | 360. gün | 700. gün | 1200. gün |
|---|---|---|---|
| Tur 7 öncesi | %35 | %38 | %48 |
| Tur 7 sonu | %20 | %34 | %33 |
| Tur 8 | %30 | **%12** | **%13** |
| Tur 14 | %10 | **%0** | **%0** |
| Tur 16 | %11 | **%1** | **%0** |
| Tur 21 | %9 | **%0** | **%0** |
| **Tur 25** | %12 | **%10** | **%17** |

Okunması gereken şey sayı değil **yön**. İlk iki satırda boş talep
zamanla artıyor: şehir büyüdükçe geri kalıyor. Son ikisinde azalıyor —
erken oyunda fırsat bol, geç oyunda şehir doyuyor. Tur 14 satırındaki
düşüşün iki kaynağı var: kademeli imar erken şehri küçük tuttuğu için
360. günde kapasite talebe kolay yetişiyor, ve devralmayı öğrenen vekil
geç oyunda talebi süpürüyor. Doluluk %66'ya indiği için çekicilik
rekabeti (kalite/marka/fiyat) canlı.

Tur 25 satırı yönü düzleştirdi ve bu bilinçli. Tur 14–21'deki %0'ı vekil,
kendi şubelerini yiyen mağazalarla talebi süpürerek alıyordu. Tahmin artık
yamyamlığı düştüğü için kalan talebin bir kısmı "açılırsa kendi şubemden
alır" denen yerlerde. Doluluk %91–97: çekicilik rekabeti yine canlı.

### Stratejilerin karşılığı (aynı tohum, tek değişken)

| Strateji | Kâr etkisi | Geri ödeme |
|---|---|---|
| Ar-Ge · 4 mağaza | %5 | 635 gün *(erken; main'de 970)* |
| Ar-Ge · 8 mağaza | **%13** | 134 gün |
| Pazarlama · 8 mağaza | **%12** | 92 gün |
| Fiyatı %25 kırmak | **%14 hacim** | — |
| Zincir · normal nakit | **+%39** (%22…%49) | 194 gün |
| Zincir · bol nakit (20 M ₺) | **+%25** (%5…%42) | — |

Tur 21'e kadar zincir satırları eksiydi ve bu "360 günlük pencere"ye
bağlanıyordu. Asıl sebep üretimdeki tüketim sayımıydı (Tur 21, 6. ders):
satmayan ürün tüketilmiş sayılıyor, zincir kartı yanlış akışa ünite
öneriyordu. Düzeltmeden sonra normal nakitte zincir her tohumda önde.
Tur 25'e kadar bol nakitte hâlâ hafif eksiydi. Bunu "ünite bir mağaza
parselini kaplıyor" diye okuyorduk. Asıl sebep yapı menüsünün tahminiydi:
bol nakitli vekil zincirle ucuzlayan kategoriye kendi şubelerini yiyen
mağazalar açıyordu. Tahmin düzelince bol nakitte de her tohumda önde
(Tur 25).

### Kalibrasyon bantları

| | Değer |
|---|---|
| Outlet geri ödemesi | 18–63 gün |
| Zincir geri ödemesi | 194 gün |
| Devralma maliyeti | **0,79× net değer** |

### Sağlık

| | Değer |
|---|---|
| Determinizm | birebir |
| Simülasyon hızı | ~1.050–2.000 gün/sn (makineye göre; Tur 21'de bina indeksi). Senaryo şehirlerinde gün 3–17 ms (`pnpm dayperf`, Tur 43) |
| Birim testi | **468 test** (`pnpm test`; Tur 24'te render paketi, Tur 39'da arayüz paketi, Tur 40'ta yazı tipleri, Tur 41'de kariyer, Tur 42'de bloom ve GPU tanıma, Tur 43'te örnek tamponu yüklemesi, Tur 44'te Türkçe sayı biçimi de) |
| Denge testi | **324 kontrol, hepsi geçiyor** (24 bölüm, süreleriyle; ~15 dk) |
| Tarayıcı testi | **466 kontrol, hepsi geçiyor**, 0 konsol hatası (~25–40 dk); duman koşusu 132 (~5 dk, rehber dahil) |
| CI | her PR'da tip + test + denge + paket + duman oynanışı |
| Kapsam | 35 bina · 25 ürün · 7 kategori · 8 rakip profili · 10 CEO · 22 olay (11 şehir + 11 sektör) · 2 kriz · 12 karar kartı · 70 rakip sözü · 5 fırsat balonu · 8 görev türü · 4 mevsim · 9 moda ürünü · 17 şehir yapısı (6 siluet) · 6 şehir projesi · 7 senaryo · 26 rozet |

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

### 4.3 ~~Taban bina kalitesi fiyata dönmüyor~~ — Tur 21'de kapandı

Prim gücü yalnızca Ar-Ge ve pazarlamadan geliyordu; süpermarket bakkaldan
kaliteli olmasına rağmen aynı fiyattan satıyordu (`REKABET-TASARIMI.md`
§3.4). Taban kalite artık aynı kanaldan fiyata dönüyor, kategorinin en
düşük kaliteli mağazasına göre ve farkın yarısı kadar. Alt kademe
mağazaların ekonomisi birebir aynı kaldı; Tur 1'in kalibrasyonu yeniden
yapılmadı, bantlar ölçüldü (Tur 21 bölümü).

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
3×3. **5×5 Tur 21'de seçenek oldu** (dış halka dört dalgada, rakip temposu
2, zafer eşiği ×1,5; ölçüm Tur 21 bölümünde). **Çoklu şehir Tur 22'de geldi**
(holding: aynı anda bir şehir oynanıyor, bekleyenler kasaya kâr payı
aktarıyor). **Şehirlerin eşzamanlı yaşaması Tur 30'da geldi:** bekleyen
şehirler de her gün yaşıyor, kârlarının yarısı kasaya akıyor. **Uzaktan
yönetim Tur 32'de geldi:** her uzak şehrin talimatı (kâr payı, savunma),
kasadan her şehre aktarım, holding hedef merdiveni ve kaybedilen şehrin
kapatılması.

### 4.6 Daha küçük kalemler

- ~~`estimateInvestment` depo, Ar-Ge ve pazarlama için `direct: false`
  dönüyor; bu binaların geri ödemesi yapı menüsünde görünmüyor~~ — Tur
  21'de kapandı: karşı-olgusal hızlı tahmin (sekiz günlük oturtma) ve
  isteğe bağlı 120 günlük projeksiyon. Sıralama hâlâ doğrudan kârla.
- ~~Devralınan şirketin yerine yenisi gelmiyor~~ — Tur 17'de kapandı
  (yeni rakip girişi; bu satır Tur 21'e kadar listede eskimiş kaldı).
  Sekiz kişilik katalog tükenince boşalan koltuk boş kalıyordu; Tur 22'de
  kapandı (katalog bitince yeni rakip üretiliyor).
- ~~İhale yalnızca boş parsel için; dolu parsel ihalesi yok~~ — Tur 21'de
  kapandı: kentsel dönüşüm ihalesi (şehir yapısı olan parsel; kazanan
  yapıyı yıktırır). Şirket binası olan parsel ihaleye çıkmıyor.
- ~~Oyuncunun rakip hissesi alımında günlük tavan yok~~ — Tur 20'de
  kapandı: herkes için aynı günlük tavan ve günlere yayılan devralma emri.
- ~~**İhraç kalkanının sonu (Tur 27).**~~ — Tur 28'de kapandı: kullanıcı
  (b)'yi seçti, geri alım serbest hisseden. Kurucu tabanındaki oyuncu
  hazineye ~%1,2 çekince tek baskıncı %50'yi geçemiyor. Eski kalem:
  Kurucu tabanına inmiş oyuncuyu,
  serbest hissenin tamamını tek başına toplayan nakitli bir baskıncı yine
  düşürüyor (seed 7, 885. gün; 18 tohumda ihraç eden on oyuncudan biri).
  Belgeli bir son, ama oyuncunun o noktada savunma hamlesi kalmıyor: ihraçtan
  sonra geri alım önce yatırımcı payını geri alıyor, serbest hisseyi
  azaltmıyor. Elde yalnızca karşı baskın (baskıncının hissesini toplamak)
  var. Seçenekler:
  (a) serbest hisse azaldıkça alım fiyatına kıtlık primi;
  (b) geri alımın serbest hisseden yapılması (kalkanı fiilen kalıcı yapar);
  (c) kuralı bırakıp borsa panelinde "kalkanın sonu"nu açıkça söylemek.
  Üçü de rakipler arası devralmaları değiştiriyor; bu bir tasarım kararı.

### 4.7 ~~Şehrin oyuncuyu içine alması~~ — Tur 9'da başladı, Tur 21'de kapandı

Rapor üç şey istiyordu; Tur 9 birincisini yaptı:

| istenen | tur | durum |
|---|---|---|
| şehirden sana akan bir şey olsun | 9 | **yapıldı** — müşteri akışı |
| kurduğun imparatorluk "senin" olsun | 11 | **yapıldı** — genel merkez işareti ve rozeti |
| rakip seni geçince hırslanasın | 11 | **yapıldı** — geçilme olayı, rakibin yüzü ve aradaki fark |

Üçü de kapandı. Aynı damardaki son kalem, bölge liderliğini kaybetme anı,
Tur 21'de olay oldu: perakende cirosunun 10 günlük ortalamasında lider
%5 farkla el değiştirince haber düşüyor, rakibin yüzü ve bölgesiyle.
(Bu paragraf eskiden "devralınan şirketin yerine yenisi gelmiyor" da
diyordu; yeni rakip girişi Tur 17'de geldi.)

### 4.8 ~~Zincir kartı ölçekte fren bilmiyor~~ — Tur 15'te kapandı

Kart artık fırsat maliyeti freni taşıyor: iyi mağaza fırsatı varken
üniteler 45 günlük tempoya bağlanıyor (`deferred` durumu — ölçek uyarısı
`premature`den ayrı). Teşhis, tasarım ve üç ölçüm dersi Tur 15
bölümünde. Regresyon A/B'si dondurulmuş düzeneğinde (+%30, 3/3);
tempolu tavsiyenin kendi ölçüsü `chain-scale-experiment.ts`.

---

### 4.9 Özgün plandan kalanlar (Tur 17 değerlendirmesi; Tur 18 ve 19 güncellemeleri)

Tur 17 meclisle üç eksik kalemi kapattı: **lobicilik/politika** (meclis),
**vergi** (kategori vergisi ve teşviki, süreli) ve **altyapı** (metro —
nüfus tavanı ve arsa değeri). Hâlâ açık olanlar:

- ~~**Sendika / işgücü**~~ — Tur 18'de kapandı: işgücü piyasası, ücret
  politikası, sendika talebi, grev.
- ~~**Kredi ürünleri**~~ — Tur 18'de kapandı: kredili hesap, vadeli ve
  teminatlı kredi, not, muacceliyet, haciz. Tahvil Tur 19'da geldi.
- ~~**Halka arz**~~ — Tur 19'da kapandı: halka arz ve sermaye artırımı
  (kurucu payı, kurumsal yatırımcı), tahvil.
- ~~**Yerelleştirme**~~ — Tur 21'de başladı (arayüz metinleri sözlükte),
  Tur 23'te kapandı: çekirdek ve içerik metinleri de sözlükte, İngilizce
  tam, dil seçici kurulumda ve Yardım'da. Üçüncü bir dil için üç sözlük
  dosyası, dil adı (`LOCALE_NAMES`) ve `messages.ts`'teki biçim kuralları
  (para, yüzde, ondalık) gerekiyor.
- ~~**Lig tablosunun güvenliği**~~ — Tur 31'de kapandı: her tarayıcı her
  satırı kendiliğinden yeniden oynatıyor, sıralama yalnızca doğrulanmış
  koşulardan ve tekrarın skoruyla; kod sınırları, simülasyon parmak izi,
  kopya tespiti. Sunucu tarafında doğrulama bu mimaride hâlâ yok: dürüst
  cümle "her tarayıcı kendisi doğruluyor". Kalan tek boşluk kopya — önlenemiyor,
  görünür kılınıyor (Tur 31 bölümü).

## 5. Nasıl koşulur

```bash
pnpm typecheck       # altı paketin tamamı
pnpm test            # birim testleri — 327 test, test yoksa kırmızı
pnpm balance         # denge testi — 288 kontrol, geçti/kaldı (~11 dk)
pnpm balance meclis  # yalnızca adında "meclis" geçen bölümler
pnpm bench           # benchmark — sayıların kendisi
pnpm dayperf         # gün başına süre, senaryo şehirlerinde (en yavaş günler ve parmak izi)
pnpm constraint      # kısıt deneyi — bağlayıcı kısıt hangisi?
pnpm land            # abonman oranı — geometri varyantları
pnpm longrun         # uzun oyun — 1440 gün, kartopu ve geç oyun frenleri
pnpm playtest        # tarayıcı testi (build dahil), tam koşu ~20 dk
pnpm playtest:smoke  # duman koşusu ~3,5 dk — PR'da CI bunu koşar
node tools/build-single-file.mjs   # paylaşılan sayfa için tek HTML
pnpm dev             # oyunu aç
```

Yayın: main'e her girişte `.github/workflows/pages.yml` oyunu alt yolla
(`--base=/qwen_game1/`) derleyip GitHub Pages'e koyuyor:
https://catikur.github.io/qwen_game1/. PR'da yalnızca paket deneniyor.
Tek seferlik ayar: Settings → Pages → Source: GitHub Actions.

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
| `pnpm longrun` | Geç oyunda kartopu ne kadar hızlı? (`OFF=1` Tur 37a frenlerini, `STORIES=0` Tur 37b kartlarını ve kampanyalarını kapatır) |

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
