# Tur 5 ve Tur 6 — Mobil ve Görsel · Tasarım Belgesi

> Durum: **ikisi de kodlandı.** Ölçülen sonuçlar §6'da.
>
> Bu iki tur oyun mantığına hiç dokunmuyor. Denge sayıları, denge testinin
> 170 kontrolü ve şema sürümü değişmedi — değişen tek şey oyunun nerede
> oynanabildiği ve neye benzediği.

---

## 1. Problem

Değerlendirme iki şey ölçtü ve ikisi de beklenenden farklı çıktı.

**Telefonda oyun açılıyor ama oynanamıyor.** "Optimize değil" değil,
kullanılamaz: panel düğmelerinin hiçbirine ulaşılamıyor ve yakınlaşmak
imkânsız.

**Görsel bütçenin neredeyse tamamı harcanmamış.** Kare başına 5 çizim
çağrısı, 10,5 K üçgen, 0 içerik dokusu, toplam 3 geometri — ve üçü de
kutu. Yani görüntüyü sınırlayan şey performans değil, sahnede o kadar az
şey olması.

---

## 2. Tur 5 — Mobil

### 2.1 Üst bar hiçbir ekrana sığmıyordu

`.topbar` sarmayan bir flex satırıydı. Sarmayan bir flex satırının
min-content genişliği çocuklarının toplamıdır: marka bloğu (190px) + dört
metrik + sekiz düğme = **1002px**.

Asıl zarar burada bitmiyor. Üst bar `.hud` ızgarasının `1fr` sütununda
duruyor, dolayısıyla o 1002px **sütunun tabanı** oluyor ve altındaki
bütün paneller de aynı genişliğe geriliyor.

| Cihaz | Görüntü | Üst bar | Ekran dışında |
|---|---|---|---|
| iPhone 13 | 390 × 664 | 1002px | **612px** |
| Pixel 7 | 412 × 839 | 1002px | **604px** |
| iPad (7. nesil) | 810 × 1080 | 1002px | 206px |

Çözüm: `flex-wrap` ve çocuklarda `min-width: 0`. İkisi birlikte gerekli —
sarma tek başına yetmez, çünkü flex öğeleri varsayılan olarak kendi
içeriklerinin altına inemez.

Dar ekranda panel düğmeleri **alt rıhtıma** iniyor (yatay kaydırmalı
şerit, 44px dokunma hedefi), hız kontrolü üst barda kalıyor: zamanı
durdurmak her an gerekir. Düğmeler iki yerde ÇİZİLMİYOR, tek kap taşınıyor
— aynı düğmeyi iki kez çizmek hem erişilebilirlik hem test tarafında
karışıklık olurdu.

> **Yol boyunca çıkan ikinci hata.** Rıhtım `position: fixed` olduğu halde
> ekranın altına gitmiyor, üst bara yapışıyordu. Sebep: `.topbar`'daki
> `backdrop-filter` sabit konumlu alt öğeler için **kapsayıcı blok**
> yaratıyor. Mobilde bulanıklık kaldırıldı — zaten en pahalı efektlerden
> biri.

### 2.2 HUD haritayı tamamen örtüyordu

Panellerin önüne şeffaf bir ayırıcı (`.hud::before`) kondu: ekranın üst
üçte biri harita olarak açık kalıyor. Ayırıcı bir pseudo-element olduğu
için `.hud > *` kuralına takılmıyor, yani `pointer-events: none` miras
alıyor ve oraya dokunmak kamerayı sürüyor. Panellerin üstünde sürüklemek
ise kolonu kaydırıyor.

### 2.3 Yakınlaşmak imkânsızdı

`controller.zoom()` için kodda **tek bir çağrı yeri** vardı: `wheel`.
Dokunmatik dinleyici yoktu, üstelik canvas'ta `touch-action: none` olduğu
için tarayıcının kendi pinch'i de bastırılıyordu. Döndürme
`e.button === 2 || e.shiftKey` istiyordu — dokunmatikte ikisi de olmaz.

İşaretçi havuzu eklendi:

| Jest | Sonuç |
|---|---|
| Tek parmak sürükleme | kaydırma |
| İki parmak açma/kapama | zoom (`zoomBy`, oransal) |
| İki parmağı birlikte kaydırma | azimut ve eğim |
| Çift dokunuş | seçilen kareye odaklan |

`zoom()` bir delta alıp adımı kendi seçiyor; pinch'te ise oran zaten
parmakların mesafesinden geliyor. İki parmağı iki katına açmak sahneyi tam
iki katı yakınlaştırmalı, yoksa jest "kayıyor" hissi verir — bu yüzden
ayrı bir `zoomBy` var.

### 2.4 Dokunarak parsel seçilemiyordu

Seçim `hoveredTile`'a bakıyor, o da yalnızca `pointermove`'da
güncelleniyordu. Parmakla dokunup kaldırmakta hareket olmadığı için hover
hep boş kalıyor ve **hiçbir parsel seçilemiyordu**. `pointerdown` artık
hover'ı tazeliyor.

### 2.4b Oynayınca çıkan iki hata

Tur 5 telefonu "açılabilir" yaptı ama gerçekten oynanınca iki şey daha
çıktı. İkisi de testlerin göremediği, ancak elde tutunca fark edilen
türden.

#### Parsel detayı ekrana hiç gelmiyordu

Bir kareye dokununca panel açılıyor ama satın alma butonu görünmüyordu.
Ölçüldü: 664px'lik bir ekranda panel **913px**'te başlıyor, butona
ulaşmak için HUD'u **~645px** kaydırmak gerekiyordu.

Sebep yapısaldı. Panel akış içindeyken yerini üstündeki her şeyin
yüksekliği belirliyor: üst bar + harita ayırıcısı + lens çubuğu + yapı
menüsü + haber akışı. Bunların toplamı bir yerde mutlaka ekranı aşıyor ve
hangi sabit yüksekliği kısarsan kıs, başka bir cihazda yine taşıyor.

Çözüm panelin akıştan çıkması: seçim varken **alt sayfa** oluyor
(`position: fixed`, rıhtımın hemen üstünde, en fazla 52vh). Harita
üstünde açık kalıyor, panel her zaman ekranda. Harita uygulamalarının yer
kartı deseni.

İki ek kural, ikisi de aynı sebepten — panel kendi içinde kayabiliyor:

- **Başlık üste yapışıyor.** Kapatma düğmesi orada; kaybolursa alt
  sayfayı kapatmanın yolu kalmıyor ve harita panelin altında kilitleniyor.
- **Eylem butonları alta yapışıyor.** "Parseli satın al" bir kez daha
  gözden kaybolamıyor.

Seçim yokken panel mobilde tamamen gizleniyor: "haritadan bir arsa seç"
demek için dar ekranda yer harcamaya değmez.

#### Kaydırma ters yöndeydi

Kullanıcının tarifi: *"sağa doğru çekince ekran sağa gitsin, şu an baya
ters."*

`pan(dx, dy)` ekran eksenini dünyaya **yanlış yönde** döndürüyordu.
Ekranda sağ dünyada `(cos, −sin)`, ekranda yukarı `(−sin, −cos)`; formülün
çapraz terimlerinin işareti tersti. Azimut sıfırken fark edilmiyordu ama
varsayılan azimut π/4 ve orada yatay bir sürükleme kamerayı **çapraz**
kaydırıyordu. Aynı hata klavye kaydırmasında da vardı.

Doğru kaydırmanın tanımı ölçülebilir: **parmağın tuttuğu zemin noktası,
sürükleme boyunca parmağın altında kalır.** Ölçüm, 120 piksellik bir
sürüklemede tutulan noktanın **7,7–8,4 birim** kaydığını gösterdi.

İşaretleri düzeltmek yetmezdi: ölçek de yanlıştı. `distance * 0.0016`
sabit bir katsayı ve gerçek piksel→dünya oranı FOV'a, eğime ve uzaklığa
bağlı. Bunun yerine `panFromGround` iki ekran noktasının zemin izdüşümünü
alıp farkı hedefe uyguluyor — hem yön hem ölçek kameranın kendi
projeksiyonundan geliyor.

Sapma **7,7 → 0,00**. Yaklaşık formül tamamen silindi; düzeltilmiş ama
ölü bir formül bırakmak sonraki kişi için tuzak olurdu.

### 2.4c Rıhtımın iki düğmesine ulaşmanın yolu yoktu

Üçüncü oyun raporu: *"mobilde yine menü sorunumuz devam ediyor."*

Ölçüm sorunu ilk denemede yerini gösterdi ve beklediğim yerde değildi.
Paneller sorunsuz açılıyordu — yedisi de **%100 görünür**, HUD tabana
kaydırılmışken bile. Kırık olan **rıhtımın kendisiydi**:

```
taşma: scrollWidth 516 vs width 390 → YATAY KAYDIRMA GEREKİYOR
  Kayıt  x=400   ← ekranın dışında
  ?      x=468   ← ekranın dışında
```

Rıhtım `overflow-x: auto` bir şeritti. Yedi yazılı düğme 516 px istiyor,
ekran 390 px veriyordu; son ikisi ekranın dışında kalıyordu ve
kaydırılabildiğini gösteren **hiçbir işaret yoktu**. Gizli kaydırma,
keşfedilmeyen bir arayüzdür — o iki panele ulaşmanın görünür bir yolu
yoktu.

#### Şerit yerine ızgara

Yazılar ikona indi (etiket minik bir alt yazı olarak kaldı — ikon tek
başına ne olduğunu söylemiyor) ve rıhtım eşit sütunlu bir ızgaraya
döndü. Izgara taşmayı **imkânsız** kılıyor: sütunlar `1fr` olduğu için
ekran daraldıkça daralıyorlar, ama hepsi hep ekranda.

| ekran | taşma | ekran dışı düğme | düğme boyu |
|---|---|---|---|
| 320 px | 0 | 0 | 43 × 48 |
| 360 px | 0 | 0 | 49 × 48 |
| 430 px | 0 | 0 | 59 × 48 |

#### Panel rıhtımın üstünde bitiyor

İkinci değişiklik kullanıcının istediği "menü gibi" davranış: alt sayfa
artık tam ekranı değil, **rıhtımın üstünü** kaplıyor. Tam ekran olsaydı
rıhtım örtülür, panel değiştirmek iki dokunuş olur ve hangi panelin açık
olduğu görünmezdi. Şimdi rıhtım bir sekme çubuğu: açık sekme işaretli,
geçiş tek dokunuş.

Bu arada bir CSS tuzağı daha çıktı: `max-height: 100%` hiçbir şeyi
sınırlamıyordu. Izgara satırı içerik boyunda olduğu için yüzde
çözülmüyor ve panel 664 px'lik ekranda **956 px**'e taşıyordu. Sınır
görüntü alanına bağlanınca (`calc(100vh - 56px - safe-area)`) düzeldi.

#### Hatayı gizleyen kontrol

En kayda değeri şu: bu hatayı yakalaması gereken kontrol vardı ve
**yeşil yanıyordu.**

```js
await button.scrollIntoViewIfNeeded();   // ← hatayı burada gizliyordu
await button.click();
```

Kontrol "bütün panel düğmeleri açılıyor" diyordu ve doğru söylüyordu —
çünkü ekran dışındaki düğmeyi önce kendisi görünür yapıyordu. Gerçek
oyuncunun elinde öyle bir imkân yok. Kontrol artık önce **konumu**
ölçüyor, sonra kaydırmadan tıklıyor.

Testler ayrıca görünen yazıya göre seçiyordu (`hasText: 'Rakipler'`);
etiket dar ekrana sığsın diye kısalınca sessizce başka bir düğmeyi
tıklamaya başlarlardı. Artık `data-panel` kimliğine göre seçiyorlar —
yazı bir sunum ayrıntısı, kimlik ise sözleşme.

#### İki sondaj daha zamana yaslanıyordu

Aynı koşumda iki kontrol dönüşümlü kırmızı yandı ve ikisinin de sebebi
aynıydı: **koşul zamanla kurulmuştu, durumla değil.**

- **"Gece pencereler yanıyor."** Veri lensinden çıkarken parıltı ANINDA
  sıfırlanıyor, gerçek değeri bir sonraki kare hesaplıyor. Sondaj
  `activeLens` doğru olur olmaz okuyordu; ikisinin arasına denk gelince
  0 görüyor ve **çalışan** bir özelliği hatalı raporluyordu. Artık lens
  değişiminden sonra bir karenin çizildiğini de bekliyor (`timeOfDay`
  değişti mi).
- **"Dikey sürüklemede tutulan kare kaymıyor."** Bunun sebebi zamanlama
  DEĞİLDİ ve ilk teşhisim yanlıştı. Sabit 700 ms'lik beklemeyi kamera
  durana kadar beklemeye çevirdim; sapma **iki koşumda da tam 6,75**
  kaldı. Aynı sayının tekrarlaması rastgeleliği eler.

  Asıl sebep testin **kendi bıraktığı durumdu**: yeni eklediğim "açılan
  panel görünen ekranda" kontrolü paneli kapatıyor ama React yeniden
  çizene kadar alt sayfa DOM'da kalıyor. Sürükleme o aralıkta başlayınca
  ilk dokunuş paneli kapatmakla harcanıyor, kamera hiç hareket etmiyor ve
  ölçüm "kaydırma bozuk" diyor. Panelin DOM'dan düştüğü artık
  bekleniyor.

İki ders bir arada: **sabit bir uyku, ölçtüğün şeyin hızına dair bir
varsayımdır** — ama **tekrarlayan aynı sayı zamanlama sorunu değildir.**
Rastgeleliğin izi dağılımdır; 6,75'in iki kez birebir çıkması sebebin
başka yerde olduğunu söylüyordu.

Ve bir kez daha: **eklediğin kontrol, sonraki kontrolün ortamını
değiştirebilir.** Aynı tuzağa Tur 5'te de düşülmüştü (alt sayfa açıkken
ölçülen sürükleme).

Dördüncüsü de bu turda ortaya çıktı ve tanı koyduran şey yine sayının
kendisiydi: **"Devralınan binalar haritada el değiştiriyor"** kontrolü
`after === mine + theirs` diye tam eşitlik arıyordu ve bir koşumda 29
yerine 30 gördü. Hata değil — devralma bir gün içinde oluyor ve o gün
şehir çalışmaya devam ediyor; oyuncu ilgisiz bir sebeple bir bina daha
kazanabiliyor. Tarayıcı testinde adımlar arası geçen gün sayısı
makinenin hızına bağlı olduğu için bu her koşumda aynı yere denk
gelmiyor.

Sorulan şey "oyuncunun tam kaç binası var" değildi, "hedefin binaları el
değiştirdi mi". Ölçüt ikiye ayrıldı: oyuncu en az o kadar bina kazandı
**ve** devralınan şirkete ait bina kalmadı. **Bir kontrolün ölçütü,
sorduğu sorudan dar olmamalı** — daha dar bir ölçüt, doğru davranışı
yanlış raporlar.

### 2.4d Dikey bütçe: üç panel ekranın %60'ını tutuyordu

Dördüncü oyun raporu, rıhtım düzeldikten sonra: *"hep ekranda görünen
şehir/fırsat ekranını ikonlardan oluşan, açılıp kapanan bir katman
yapsak; bakkal seçtiğim menüyü de açılır kapanır yapsan."*

Ölçüm teşhisi doğruladı ve büyüklüğünü verdi (390 × 664):

| öğe | yükseklik | ekranın payı |
|---|---|---|
| Yapı menüsü | **292 px** | %44 |
| Lens çubuğu | **104 px** | %16 |
| Haber akışı | 102 px | tamamen fold'un altında |

HUD'un toplam içeriği **967 px**, ekran 664 px — yani **303 px kaydırma**
gerekiyordu ve haritaya kesintisiz kalan pay **%38**'e düşüyordu.

#### Üçü de katlanabilir

Lens çubuğu ikon ızgarasına döndü (üç sütun, 52 px hedef) ve üçü de bir
başlıkla katlanıyor. Başlık **bilgi taşıyor** — katlamak durumu gizlemek
demek değil:

| panel | kapalıyken ne yazıyor |
|---|---|
| Lens | aktif lens: *"Harita: Fırsat"* |
| Yapı menüsü | seçili bölge + kalan boş parsel |
| Haber akışı | en son haberin başlığı ve günü |

Lens seçilince katman kendini kapatıyor: seçtikten sonra elle kapatmak
zorunda bırakmak fazladan bir dokunuş.

#### Katlamak tek başına yetmedi

İlk ölçüm bunu gösterdi: paneller 292/104 → 46/46 px'e indi, kaydırma
303 → 51 px'e düştü, **ama harita payı %38'den ancak %39'a çıktı.**

Boşalan yer haritaya gitmiyordu — **haber akışı yutuyordu** (102 → 153
px, üstelik alt 44 px'i rıhtımın altında kalıyordu). Sebep haritanın
ayırıcısının sabit `32vh` olmasıydı: harita penceresi kazanılan yerden
pay almıyor, aradaki fark en esnek bloğa yazılıyordu.

Ayırıcı `flex: 1 1 auto` olunca artan yer yukarı, yani haritaya yazıldı.
Alt sınır (`min-height: 22vh`) duruyor ki paneller tamamen açıldığında
bile haritadan bir şerit görünsün.

| | önce | sonra |
|---|---|---|
| HUD içeriği | 967 px | **664 px** (= ekran) |
| Gereken kaydırma | 303 px | **0** |
| Harita payı | %38 | **%49** |

Ders: **bir yeri boşaltmak, o yerin istediğin şeye gideceği anlamına
gelmiyor.** Kazanılan alanı kimin alacağını düzenin kendisi belirliyor;
ölçmeseydik "paneller küçüldü, iş bitti" derdik.

### 2.4e Üst bar, yüzen ikon sütunu ve kesilen zincir

Beşinci oyun raporu üç madde getirdi ve üçü de ölçülebilirdi.

#### Üst bar: etiketler ikona döndü

Paneller katlandıktan sonra kalan en büyük sabit blok üst bardı: **177
px**, yani 664 px'lik ekranın **%27**'si. Yerin çoğunu değerler değil
**etiketler** yiyordu — "ŞİRKET DEĞERİ" 13 karakter, gösterdiği sayı 8 —
ve her metrik iki satır kaplıyordu.

Dar ekranda etiket ikona dönüyor, metrik tek satıra iniyor. Etiket
silinmedi: `title` ve `aria-label` tam adı taşımaya devam ediyor, yani
ekran okuyucu ve uzun basma ipucu bir şey kaybetmiyor.

**177 → 128 px** (%27 → %19).

#### Üç panel haritanın sağ kenarına toplandı

Katlanabilir hâlleriyle bile üç tam genişlikte şerit demekti: 3 × 46 px
artı boşluklar. Kapalı bir panelin taşıdığı tek şey ikonu ve tek satırlık
özeti olduğuna göre tam genişlik gereksiz.

Şimdi kapalıyken **44 px'lik ikon düğmeleri** olarak sağ kenarda
duruyorlar; açıldıklarında tam genişlikte bir sayfaya dönüşüp rıhtımın
üstünde bitiyorlar.

> **İlk denemem yanlıştı ve ölçüm onu çürüttü.** Üçünü `position: fixed`
> ile sağ *alta* çivilemiştim. Parsel sayfası açıldığında sütunun
> çakışmaması için yukarı itilmesi gerekiyor ve itmenin miktarı sayfanın
> gerçek yüksekliğine bağlı; `52vh` gibi bir tahminle yazınca sütun
> ekranın **dışına** çıktı (üst kenar −1 px).
>
> Akışta kalıp sağa yaslanmak aynı görsel sonucu sabit sayı olmadan
> veriyor. Parsel sayfası alttan gelince kimse kimseyi itmiyor, çünkü
> ikisi de kendi yerinde duruyor.

#### Zincir yuvaları kesiliyordu

Rapor: *"zincir'e tıkladığımda sağdan ekrandan taşıyor."*

Aritmetik tutmuyordu: 4 yuva × en az 118 px + 3 × 6 px boşluk = **490
px**, telefonda modal gövdesi **388 px**. `overflow-x: auto` bunu
taşırmıyor ama **gizliyor** — sağdaki iki halka kesiliyor ve
kaydırılabildiğine dair hiçbir işaret yok. Rıhtımda düzelttiğimiz gizli
kaydırmanın aynısı, başka bir yerde.

Zincir zaten sıralı bir anlatı (hammadde → ara mal → raf); telefonda
doğal yönü dikey. Yuvalar alt alta akıyor, oklar aşağı bakıyor.

Kontrol yedi panelin **hepsinde** gizli yatay kaydırıcı arıyor, çünkü
aynı desen başka bir panelde de olabilirdi.

#### Ölçülen sonuç

| | Tur 8 sonu | şimdi |
|---|---|---|
| Üst bar | 177 px (%27) | **128 px (%19)** |
| Harita payı | %49 | **%68** |
| Zincir yuvaları | 490 px'i 388 px'e sığdırmaya çalışıyor | dikey, kesilme yok |

#### Ölçütün kendisi yanlış hale geldi

Harita payını **satır** bazında ölçüyorduk: opak kutuların kaplamadığı
yatay şeritler. Paneller tam genişlikteyken doğru cevabı veriyordu.

İkonlara inince yanlış oldu — 44 px genişliğindeki bir ikon, bulunduğu
satırın **tamamını** kapalı sayıyor ve harita payını %68 yerine **%5**
gösteriyordu. Genişlik önemli hale geldiği anda ölçüt de genişliği görmek
zorunda; ölçüm alana çevrildi.

**Bir ölçüt, ölçtüğü şeyin şekli değişince sessizce geçersizleşebilir.**

### 2.4f Üst bar üç satırdan iki satıra

Oyun raporu: *"üst bölüm yine büyük kalmış."* Bir önceki tur barı 177'den
128 px'e indirmişti; demek ki yeterli değildi.

İkinci ölçüm, ilk turda **neyin optimize edilmediğini** gösterdi:

| satır | yükseklik | payı |
|---|---|---|
| marka bloğu (portre + şirket adı + tarih) | 38 px | %30 |
| metrikler | **18 px** | %14 |
| hız düğmeleri | 38 px | %30 |
| dolgu + boşluklar | 34 px | %26 |

Yani geçen tur ikonlara çevirdiğimiz metrik satırı, barın **en ucuz**
parçasıydı. Boyu belirleyen iki şey vardı ve ikisi de sayı değildi: CEO
portresi (38 px) ve hız düğmeleri.

**Portre boyu bedavaya geldi.** İlk satırın yüksekliğini o belirlediği
sürece 38 px'in tamamı ona aitti. İkinci satıra, hız düğmelerinin (34 px)
yanına inince 22 px'e küçültüldü ve artık satırın en uzun öğesi olmadığı
için yüksekliğe **hiç** katkı vermiyor. Aynı portre, sıfır piksele.

**Şirket adı ve CEO adı dar ekranda gizlendi, tarih kaldı.** Üçü de tek
bir metin dizgesiydi; CSS birini tutup diğerini atamıyordu. Ayrı kaplara
bölündüler — ayrımın ölçütü şu: tarihe her gün bakılır (kredi vadesi,
sözleşme günü), diğer ikisi oyun başında bir kez seçilip bir daha
değişmez.

**Hız düğmelerinin boyu padding'den gelmiyordu.** 6 px dolgu ve 12 px
yazıyla 32 px beklenirken 38 px çıkıyordu. Sebep `line-height: normal`:
`▶` ve `❚` karakterleri yedek bir fontla çiziliyor ve o fontun satır
kutusu 12 px'lik yazı için 24 px yer istiyor. Satır yüksekliği
sabitlenince boy yeniden dolgunun kontrolüne girdi.

> **Bir kutunun boyu, o kutuya yazdığınız değerden gelmiyor olabilir.**
> Padding'i kısmak burada hiçbir şeyi değiştirmezdi; ölçülmesi gereken
> şey, boyu kimin belirlediğiydi.

Yeni düzen iki satır: **metrikler tam genişlikte üstte**, altta solda
portre + tarih, sağda hız düğmeleri.

Metriklerin tam satırı kaplaması bir yer kaybı değil, **istikrar
kararı**: beşinci metrik (borç) yalnızca oyuncu kredi çektiğinde çıkıyor.
Metrikler diğerleriyle satır paylaşsaydı bu beşinci öğe satırı taşırır,
bar bir satır uzar ve haritanın tamamı aşağı kayardı — oyuncu kamerasına
hiç dokunmadığı halde şehir yerinden oynamış gibi görünürdü. Kontrol bunu
sınıyor: borç eklenip bar aynı yükseklikte kalmazsa test kırılır.

| | Tur 8 sonu | bir önceki | **şimdi** |
|---|---|---|---|
| Üst bar | 177 px (%27) | 128 px (%19) | **72 px (%11)** |
| Satır sayısı | 3 | 3 | **2** |
| Harita payı · iPhone 13 | %49 | %68 | **%78** |
| Harita payı · Pixel 7 | — | %76 | **%82** |
| En kötü durum (milyarder + borçlu) | — | — | 96 px, hâlâ iki satır |

Kontroller satır **sayısını** da tutuyor, yalnızca yüksekliği değil:
yalnız yüksekliğe bakan bir eşik, satırlardan biri sessizce ikiye bölünüp
diğeri kısalınca aynı sayıyı vermeye devam ederdi.

#### Tutulamayacak bir söz verdim, kontrol yakaladı

İlk yazdığım kontrol şuydu: *"borç metriği çıkınca bar uzamasın."*
iPhone 13'te kırıldı (95 px), Pixel 7'de geçti (72 px) — aradaki fark
ekran genişliği: 390'a karşı 412.

Aritmetiğe bakınca sözün baştan tutulamaz olduğu görüldü. Para dizgeleri
oyun ilerledikçe uzuyor:

| değer | biçim | karakter |
|---|---|---|
| 250 000 | `250 B ₺` | 7 |
| 12 500 000 | `12.50 M ₺` | 9 |
| 999 000 000 000 | `999.00 Mr ₺` | 11 |

En geniş hâlleriyle beş metrik ~535 px istiyor, barın iç genişliği ise
344 px. Sığdırmanın iki yolu vardı ve ikisi de kötüydü: yazıyı okunmaz
küçültmek, ya da rakamı kırpmak. Para kırpılmaz.

Söz düzeltildi: **metrikler en fazla iki satıra çıkar, bar üç satırlık
bir bloğa dönüşmez.** Kontrol artık oyuncuyu milyarder ve borçlu yapıp
tam bunu sınıyor; boşluklar da (12 → 10 px) sarmanın oyunun büyük
bölümünde hiç gerekmemesi için daraltıldı.

> **Bir kontrolün kırılması her zaman kodun yanlış olduğu anlamına
> gelmez; bazen yanlış olan verdiğiniz sözdür.** Buradaki fayda, sözün
> tutulamaz olduğunun oyuncunun ekranında değil testte ortaya çıkması.

Aynı turda ölçüm aletinde bir hata daha çıktı: bar satırlarını öğelerin
**üst kenarına** göre sayıyordum. Aynı satırdaki öğeler dikeyde
ortalandığı için boyları farklıysa üst kenarları da farklı oluyor — 34
px'lik hız düğmeleri 48'de, 22 px'lik portre 54'te başlıyor — ve tek
satır "üç satır" olarak sayılıyordu. Ölçüt kenar değil, dikey aralıkların
çakışması olmalıydı.

### 2.5 Kalite tek kademeden dört kademeye

Eskiden tek karar vardı: gölge açık ya da kapalı. Bu iki sorunu birden
yaratıyordu — zayıf bir cihazda gölgeyi kapatmak yetmiyor (asıl yük piksel
sayısında), güçlü bir telefonda ise gereksiz yere gölgeden vazgeçiliyordu.

| Kademe | Piksel oranı | Gölge | Bloom | Fon aracı |
|---|---|---|---|---|
| yüksek | ≤ 2 | 2048 | var | %100 |
| orta | ≤ 1,75 | 1024 | var | %100 |
| düşük | ≤ 1,35 | yok | yok | %60 |
| asgari | 1 | yok | yok | %30 |

Her kademede önce **süs** kısılıyor. Kamyonlar bu bütçeye dahil değil:
zincirin nerede aktığını anlatıyorlar, yani bilgi.

Bir kez inilen kademenin üstüne bir daha çıkılmıyor. Aksi halde kademe
düşer, hız artar, kademe yükselir, hız düşer diye salınan bir döngü olurdu
ve oyuncu bunu titreme olarak görürdü.

---

## 3. Tur 6 — Görsel

### 3.1 Bina kütlesi: bir kutu değil üç parça

```
çatı   — gövdeden dar, koyu bir kapak
gövde  — asıl kütle; pencere dokusunu taşıyan tek parça
taban  — gövdeden geniş, kısa bir podyum
```

Her parça kendi `InstancedMesh`'inde, yani üçü toplam üç çizim çağrısı
ekliyor — **bina sayısından bağımsız.**

Çatı kapağının ikinci bir işi var: gövdenin üst yüzünü örtüyor. Pencere
dokusu örnek ölçeğine göre döşendiği için gövdenin üst yüzüne de pencere
düşerdi; kapak o yüzü hiç göstermiyor. Sorun geometriyle çözülüyor,
shader'da özel durumla değil.

### 3.2 Pencereler: gecenin bütün işi

Eskiden `emissive` binanın **tüm** yüzeyine düz uygulanıyordu. Yükseltmek
bütün şehri tek parça amber bir kütleye çeviriyordu, bu yüzden bilinçli
olarak 0,03 gibi bir "ima" seviyesinde tutulmuştu.

Emisyon artık bir **dokudan** geliyor: siyah zemin (= sıfır emisyon)
üzerinde yalnızca pencereler parlıyor, üçte biri sönük. Ödünleşim ortadan
kalktığı için parlaklık **0,03 → 1,15**'e çıkabildi ve gece şehrin en iyi
göründüğü an oldu.

**UV'ler örnek ölçeğine göre döşeniyor.** `InstancedMesh`'te bütün
örnekler aynı UV'yi paylaşır, ama binalar farklı boyutlarda ölçekleniyor.
Doku olduğu gibi bırakılsaydı 4 katlı binada da 20 katlı binada da tam 4
sıra pencere olurdu — kat yüksekliği binaya göre değişir ve ölçek duygusu
kaybolurdu. Vertex shader'da örnek matrisinin ölçeği okunup UV onunla
çarpılıyor: bir doku tekrarı sabit bir **dünya ölçüsüne** karşılık geliyor.

> **Kalibrasyon notu.** Cephe dokusunun tabanı ilk sürümde `#b9b9b9` idi.
> `map` binanın kendi rengiyle ÇARPILDIĞI için ortalaması 0,72 olan bir
> doku bütün şehri o oranda karartıyordu ve gündüz binalar siyaha yakın
> çıkıyordu. Taban `#eeeeee`'ye çekildi: doku renk taşımıyor, yalnızca
> ince bir aydınlık dalgalanması yapıyor.

### 3.3 Sokaklar

Haritanın **%44'ü sokak** ve hepsi tek düz renkti. Sokaklar parsellerden
ayrı bir mesh'e alındı; asfalt dokusu iki şey anlatıyor: yolun **yönü**
(kesikli orta çizgi) ve **kenarı** (kaldırım bandı).

Yön ikinci bir dokudan değil, örnek matrisinin döndürülmesinden geliyor:
doku çizgiyi +X ekseninde taşıyor, yani yatay sokak (`y % 4 === 0`)
dönmeden doğru duruyor, düşey sokak çeyrek tur dönüyor.

### 3.4 Ortam haritası

`MeshStandardMaterial` yansıtacak bir şey bulamadığı için metalik ve
pürüzsüz yüzeyler ölüydü. Gradyan bir doku PMREM'den geçiriliyor; maliyeti
bir kerelik. Yansıma şiddeti gün döngüsüyle kısılıyor — gece gökyüzü
karanlıksa camların yansıttığı şey de karanlık olmalı.

### 3.5 Gölge hacmi görüş alanını takip ediyor

Tek gölge haritası bütün şehri kaplıyordu: 24×24'lük alan 1024 texel'e
yayılınca kenarlar bulanıklaşıyordu. Gölge kamerası artık kameranın
baktığı yere daralıyor — **aynı çözünürlükte belirgin şekilde daha keskin
gölge, ek maliyet yok.** Işık da hedefle birlikte taşınıyor ki yönü
sabit kalsın.

### 3.6 İnşaat animasyonu

Bina kurmak "pat" diye oluyordu. Artık yerden yükseliyor (900 ms, yumuşak
giriş-çıkış). İlk senkronda var olan binalar animasyonsuz: kayıt yüklerken
bütün şehrin yerden bitmesi doğru olmazdı.

### 3.7 Bloom ve vinyet

Bloom eşiği yüksek (0,82): yalnızca pencere ışıkları ve en parlak yüzeyler
taşıyor. Düşük eşikte bütün sahne pusa dönüyor ve şehir okunmaz oluyor —
**bloom atmosfer katmalı, bilgi silmemeli.**

Zincir devreye girdiğinde tuvalin kendi MSAA'sı devre dışı kalıyor, bu
yüzden ara hedef çok örneklemeli (`samples: 4`) — yoksa bina kenarları
tırtıklanır.

Vinyet tam ekran bir geçiş değil, tek bir CSS gradyanı: aynı işi yapıyor
ve GPU'ya hiçbir geçiş eklemiyor. Bloom'un aksine sahnenin içeriğini
bilmesi gerekmiyor.

---

## 3.8 Tur 9 — Müşteri akışı: şehirden sana doğru akan ilk şey

Oyun raporu: *"şehir beni içine almıyor. Benzin istasyonuna gelen araçlar
gibi… kurduğum imparatorluk benim gibi olmalı."*

Koda bakınca boşluk tek bir cümleye indi: **şehirden sana doğru akan
hiçbir şey yoktu.** `traffic.ts` bunu kendi yorumunda zaten söylüyordu —
fon araçları için *"simülasyonla hiçbir bağları yoktur, tek işleri boş
sokak bırakmamak"*. Bilgi taşıyan tek katman senin kamyonlarındı, yani
yine sen: senden dışarı. Talep ise bir sayıydı (`district.demand`), kime
gittiği ancak tablo açılınca görülüyordu.

### Veri zaten oradaydı

Her outlet dün kaç birim sattığını (`last.unitsSold`) ve bölgesindeki
payını (`last.share`) zaten tutuyor. `shoppers.ts` bu sayıyı sokak
seviyesine indiriyor: satış → mağazanın kapısına gelen araç sayısı.
`routes.ts` ile aynı disiplin — tamamen türetilmiş, state'e yazmıyor.

### Siluet bir sözlük

Sokakta artık üç şey akıyor ve üçü de renkli kutu olsaydı hiçbiri
okunmazdı:

| görünüm | anlamı | yön |
|---|---|---|
| iri + renkli | kamyon — tedarik | senden dışarı |
| küçük + renkli | müşteri — satış | şehirden sana |
| küçük + gri | fon aracı — hiçbir şey | — |

İlk denemede müşteri aracı kamyonun yalnızca üçte bir altındaydı ve ekran
görüntüsünde ikisi ayırt edilemiyordu: "renkli kutu" görüyordun ama
hangisinin mal hangisinin müşteri taşıdığını bilmiyordun. Boy farkı iki
katına çıkarıldı.

### Dağıtım kuralını ölçüm değiştirdi

İlk sürüm bütçeyi sıralı turlarla dağıtıyordu: liste çoktan aza sıralı,
her mağazaya sırayla bir araç. Mantıklı görünüyordu, ölçünce çöktü —
120. günde şehirde **42 satan mağaza ve 54 araç** vardı, yani ilk tur
zaten 42'sini dağıtıyor, geriye 12 kalıyordu. Sonuç: mağazaların çoğu
1 araç, en işlekleri 2. Oyuncunun okumak istediği tek şey — *benim kapım
mı rakibinki mi daha kalabalık* — tam olarak bu farkın içinde kayboluyordu.

Şimdi **en büyük kalan** yöntemiyle, satış oranında paylaştırılıyor:

| şirket | birim payı | araç payı |
|---|---|---|
| Nova Holding | %55,6 | **%55,6** |
| Meridyen Grup | %23,4 | %24,1 |
| Kilit Market | %21,0 | %20,4 |

Sıfır araç alan mağaza olabiliyor ve bu **kasıtlı**. Çok az satan bir
dükkân sessiz görünmeli; "her mağazaya en az bir araç" kuralı işlemeyen
bir mağazayı işliyor gibi gösterip oyuncunun görmesi gereken tek şeyi —
nerede geride kaldığını — saklardı.

### Filo baştan kurulmuyor, fark kadar güncelleniyor

Kamyonlarda imza yöntemi yetiyordu çünkü bir tedarik bacağı ya var ya
yok. Müşteri dağıtımı ise satış oranına bağlı ve o oran her gün oynuyor —
filoyu her değişimde sıfırdan kursaydık bütün araçlar aynı anda başa
ışınlanırdı. Oysa istenen şey akışın **kayması**: rakip pay aldıkça onun
kapısına bir araç ekleniyor, seninkinden bir tanesi eksiliyor, kalanlar
yollarına devam ediyor.

Bunun bir yan etkisi vardı ve gözden kaçması kolaydı: korunan araçlar
yeni dizide başka indekslere düşüyor, renk buffer'ı ise indekse yazılıyor.
Sıfırlanmasaydı bir aracın rengi başka bir mağazanın aracında kalırdı —
rakip yeşile, oyuncu kırmızıya boyanırdı.

### Ölçülemeyen şey ve ölçülen şey

Bu tur öncekiler gibi ölçülemez: *"şehir beni içine aldı"* bir teste
yazılamaz, kararı oynayan verir. Ölçülebilen şey **öncülleri** ve
kontroller onları tutuyor:

- satan mağaza için araç yola çıkıyor, satmayan için çıkmıyor
- **en çok satanın kapısı en kalabalık** — akış yalan söylemiyor
- oyuncunun mağazasına kendi renginde müşteri geliyor
- akışta birden fazla şirket var (tek renkse rekabeti anlatmıyor demektir)
- araçlar yolda ilerliyor, veri lensinde susmuyor, satış oynayınca filo
  sıfırlanmıyor

---

## 4. Neyi eklemedik, neden

| Aday | Neden bu turda değil |
|---|---|
| SSAO / kontak gölgesi | Bloom'dan sonra ikinci bir tam ekran geçiş; önce bunun mobil maliyeti ölçülmeli |
| Hava ve mevsim | Takvim zaten var, iyi bir aday — ama görsel temel oturmadan katman eklemek erken |
| Yaya kalabalığı | Fon araçları zaten kalite bütçesinin ilk kısılan kalemi; ikinci bir süs katmanı aynı bütçeyi zorlar |
| LOD / kademeli gölge | Şehir küçük olduğu sürece gereksiz; büyürse (Tur 8) gerekir |
| Kontur (outline) seçimi | Ek geçiş; bugünkü halka yeterince okunuyor |

---

## 5. Test edilemeyen iki şey ve nasıl ele alındıkları

Bu ortamda GPU yok; Chromium yazılım rasterizasyonu kullanıyor. İki
kontrol bu yüzden doğrudan yazılamadı ve ikisi de **kontrolü kapatmadan**
çözüldü.

**Çift dokunuş penceresi.** Ana iş parçacığı kare başına yüzlerce ms bloke
olduğu için iki dokunuş arası 1 saniyeyi buluyor; 400 ms'lik pencere
yakalanamıyor. Kontrol saatten bağımsız hale getirildi: **gözlenen
aralığa göre iki yönlü** çalışıyor — pencerenin içindeyse odaklanmalı,
dışına taştıysa odaklanmamalı. İki dal da sert bir iddia.

**Üst kalite kademeleri.** Uyarlama saniyeler içinde en ucuz kademeye
iniyor, dolayısıyla bloom zinciri ve 2048'lik gölge hiç çalışmıyor — yani
hiç sınanmıyor olurdu. `setQuality(tier)` kademeyi sabitliyor ve
uyarlamayı susturuyor; test üst kademeyi zorlayıp zincirin gerçekten
kurulduğunu doğruluyor.

---

## 6. Ölçülen sonuçlar

### Maliyet

| | Önce | Sonra |
|---|---|---|
| Çizim çağrısı / kare | 5 | **16** |
| Üçgen / kare | 10,5 K | **25,2 K** |
| Doku | 7 (hepsi motorun kendi işi) | **15** |
| Geometri çeşidi | 3 (hepsi kutu) | 3 kütle parçası + sokak + zemin |

Yaygın mobil hedef bandı 50–150 çizim çağrısı ve 100–300 K üçgen. Yani
bütçe hâlâ fazlasıyla açık; sonraki görsel işler için yer var.

### Erişilebilirlik

| | Önce | Sonra |
|---|---|---|
| Telefonda ulaşılabilen panel | **0 / 8** | **7 / 7** |
| Dokunmatikte zoom | yok | pinch |
| Dokunmatikte döndürme | yok | iki parmak |
| Dokunarak parsel seçme | çalışmıyor | çalışıyor |

### Test

| | Önce | Sonra |
|---|---|---|
| Tarayıcı kontrolü | 105 | **144** |
| Responsive kontrolü | 1 (hiç başarısız olamayan) | 14 (iki cihaz profili, gerçek dokunuş olayları) |
| Denge kontrolü | 170 | 170 (değişmedi) |

Oyun mantığına dokunulmadığı için denge sayıları ve şema sürümü aynı.
