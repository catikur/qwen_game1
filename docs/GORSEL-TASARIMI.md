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
