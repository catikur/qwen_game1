# CapitalForge Lite — iOS idle tasarımı

> Ana oyunun felsefesi (tedarik zinciri, rekabet, sermaye, holding) aynı.
> Oynanış idle mobil oyunlara göre baştan kuruldu: oturum 30 saniye ile
> 3 dakika arası, tek el, dikey ekran. Oyun kapalıyken de para kazanılıyor.
> Uygulama iOS'ta yerel (SwiftUI); ağ, reklam ve uygulama içi satın alma yok.

---

## 1. Ana oyundan ne kalıyor, ne gidiyor

| Ana oyun | Lite karşılığı |
|---|---|
| 900 parsellik şehir, parsel alımı, imar | Şehir 5 mahalleden oluşuyor; mahalleler net değerle açılıyor |
| 35 bina, 25 ürün, 7 kategori | 5 zincir, her zincirde 3 kademe (ham → işleme → satış) |
| Zincir kartının "tek hamle" önerisi | **Darboğaz**: zincirde en yavaş kademe parlıyor, tek dokunuşla büyütülüyor |
| Rakiplerle pazar payı | Her zincirde rakiple bir pay çubuğu; rakip zamanla büyüyor |
| Borsa, halka arz, devralma | **Halka arz** bir dönüm noktası; **holding** prestij döngüsü |
| Holding: birden çok şehir | Şirketi sat → Holding Yıldızı kazan → yeni şehir, kalıcı çarpan |
| Sektör ve şehir olayları | 2–3 dakikalık zamanlı olaylar (turizm, kriz, grev…) |
| Belediye meclisi | Saatte bir iki seçenekli karar kartı |
| Hedef merdiveni | Şehir başına 10 görev, her biri ödüllü |
| Sendika, kredi, tahvil, lig | Yok (Lite'ta yük olur) |

## 2. Çekirdek döngü: zincir ve darboğaz

Her zincirin üç kademesi var (sayılar `packages/lite-model/src/content.ts`):

| Zincir | Ham | İşleme | Satış | Mahalle | Açılış (ömür boyu kazanç) | Birim fiyatı |
|---|---|---|---|---|---|---|
| Fırın | Buğday Tarlası | Değirmen | Fırın | Çarşı | baştan | 1 ₺ |
| Kahve | Kahve Bahçesi | Kavurma | Kafe | Çarşı | 3 B ₺ | 14 ₺ |
| Moda | Pamuk Tarlası | Tekstil | Butik | Merkez | 400 B ₺ | 200 ₺ |
| Deri | Besi Çiftliği | Tabakhane | Ayakkabıcı | Sanayi | 60 M ₺ | 3 B ₺ |
| Teknoloji | Silisyum Ocağı | Çip Fabrikası | Elektronik | Teknopark | 9 Mr ₺ | 45 B ₺ |

Liman 1,5 Mr ₺'de açılıyor ve bütün satışlara ×1,5 veriyor. Her zincir bir
öncekinin yaklaşık 14 katı fiyatla geliyor ama ilk seviyelerinin geri ödemesi
(~20 sn) aynı. Yeni zincir bu yüzden "taze bir başlangıç" gibi hissettiriyor
ve gelire bir basamak ekliyor.

**Para yalnızca satış kademesinden geliyor.** Satış saniyede `r_satış` birim
satıyor; satılanın ne kadarını kendi zincirinden karşıladığına göre marj değişiyor:

- kendi işlemenden karşılanan kısım (`min(r_satış, r_işleme)`) **%55** marjla;
- onun da kendi hammaddenden karşılanan kısmı (`min(…, r_ham)`) **%85** marjla;
- kalanı pazardan alınan malla **%20** marjla.

**Yukarı kademeyi almak hiçbir zaman zarar ettirmiyor** ("kolay"): en kötü
ihtimalle karşıladığı kısım kadar kazandırıyor. En çok kazandıran hamle ise
darboğazı açan hamle ("aynı felsefe"). Darboğaz, +1 seviyenin harcanan lira
başına en çok gelir getirdiği kademe. Arayüz onu vurguluyor ve tek bir hamle
öneriyor ("Değirmeni büyüt"); bu, ana oyundaki zincir kartının karşılığı.

Ölçüm: aktif bot önerilen hamleyle oynayınca hamlelerin %40'ı satış, %33'ü
işleme, %27'si ham. Yani entegrasyon gerçekten oynanıyor.

**Kademe seviyesi.**
- Hız: `taban × seviye × 2^(geçilen kilometre taşı)`.
- Maliyet: `taban maliyet × büyüme^seviye`. Büyüme ham kademede 1,13, işlemede
  1,15, satışta 1,14.
- Kilometre taşları 25, 50, 75, 100, 150, 200, 250, 300, 400… seviyelerde; her
  biri o kademenin hızını ×2 yapıyor. Oyuncu "bir sonraki taşa 3 seviye" gibi
  kısa hedefler görüyor.

## 3. Rakip ve pazar payı

Her şehirde bir rakip CEO var; yüzü ana oyundaki avatar sisteminden geliyor.
- Her zincirde rakibin bir akışı var ve **seni kovalıyor**: hedefi senin satış
  hızının 0,6 katı (her yeni şehirde +0,15). Hedefe 10 dakikalık zaman sabitiyle
  yaklaşıyor.
- Senin payın = `satış_sen / (satış_sen + rakip)`; gelirin bu payla çarpılıyor.
  Pay %15'in altına inmiyor, yani hiç kazanamamak yok.
- Büyüttüğün an pay yükseliyor, rakip yetiştikçe ~%63'e geri iniyor. Büyütmeyi
  bırakan zincir payını kaptırıyor. "Nova Holding Kahve'de öne geçti" uyarısı
  ana oyundaki geçilme olayının karşılığı.
- Kapalıyken rakip yarı hızda kovalıyor: geri dönen oyuncu cezalandırılmasın.

## 4. Mahalleler, halka arz, holding (prestij)

- **Mahalleler** ömür boyu kazançla açılıyor: Çarşı → Merkez → Sanayi → Liman →
  Teknopark. Liman zincir açmıyor, bütün satışlara ihracat çarpanı (×1,5) veriyor.
- **Halka arz (L4):** şehirdeki ömür boyu kazanç 1 Mr ₺'yi geçince açılıyor,
  şehirde bir kez yapılıyor.
  - Hissenin %25'i satılıyor; karşılığı kasaya giriyor.
  - Şirket değeri = sürekli gelirin 1 saati. Sürekli gelirde kampanya, olay ve
    politika yok; yoksa tek doğru hamle halka arzı çarpanların üstüne denk
    getirmek olurdu.
  - Kalıcı etkisi satışta: halka açık şirket yıldızı ×1,2 getiriyor.
  - Borsa kartı açılıyor: hisse fiyatı (değer / 1 milyon hisse), halka arzdan
    beri değişim, dakikada bir örneklenen grafik, payının (%75) değeri.
  - İlk taslaktaki "temettü" düştü. Oyuncu şirketin kendisi; kendine temettü
    ödemesi bir şey anlatmıyordu.
- **Holding (prestij):** şehrin şirketini satıp yeni şehre geçiyorsun. Sıfırdan
  başlıyorsun ama Holding Yıldızı kazanıyorsun:
  - yıldız = `⌊√(şehirdeki ömür boyu kazanç / 1 Mr ₺) × (halka açıksa 1,2)⌋`;
  - L7: 100 Mr ₺ kazançtan sonra karekök yerine dördüncü kök (eşikte 10 yıldız,
    eğri kesintisiz). Adalar kazancı binlerce kat büyütüyor; karekökle yıldız
    yüzlere çıkıp ikinci şehri dakikalara indiriyordu;
  - her yıldız bütün gelire kalıcı +%2;
  - her şehrin rakibi bir öncekinden sert (kovalama hedefi +0,15);
  - ikinci şehirden başlayarak her şehrin bir öne çıkan zinciri var, geliri ×2.
    Sıra: kahve, moda, deri, teknoloji, fırın, sonra baştan. Her holding turu
    aynı yolu yürümesin diye.

## 5. Kısa oturum öğeleri

| Öğe | Kural |
|---|---|
| Çevrimdışı kazanç | Dönüşte "Yokken kazandın: 1,2 M ₺". Gelirin **yarısı** işliyor (tam hızda gündelik oyuncu bir günde her şeyi açıyordu). İlk tavan 2 saat; her Genel Müdür seviyesi +1 saat (en çok 10) |
| Kampanya | Şehre dokununca 30 saniye ×2 gelir, 3 dakika bekleme. Ana oyundaki pazarlama kolunun karşılığı |
| Olaylar (L3) | İlk olay 4. dakikada; sonrakiler başlangıçtan başlangıca 5,5 dakikada bir, her biri 2 dakika. Ayrıntı aşağıda |
| Meclis kartı (L3) | İlk oturum 10. dakikada, sonra saatte bir; iki seçenekli karar, bir saat yürürlükte. Ayrıntı aşağıda |
| Görevler (L3) | Şehir başına 15 basamaklı merdiven (L4'te halka arz eklendi); ödül, alındığı andaki gelirin 30 saniye ile 5 dakikası arası. Ayrıntı aşağıda |
| Bildirim (L4, izinle) | Yerel, sunucu yok. Uygulama arka plana geçerken modelden hesaplanıp zamanlanıyor, dönünce siliniyor. Ayrıntı aşağıda |
| Ses ve titreşim (L4) | Ses dosyası yok: kısa sinüs notaları (alım, kilometre taşı, ödül, ret, olay, halka arz). Oturum "ambient": sessiz anahtara uyuyor, çalan müziği kesmiyor. Titreşim: alım seçim, ret uyarı, büyük anlar başarı |

### 5.1 Olaylar (L3)

Olay yalnızca oyuncu oradayken başlıyor; kapalıyken kaçan olay dönüşte
başlıyor. Seçim olay sayacından tamsayıyla yapılıyor: TS ile Swift aynı olayı
seçiyor.

| Olay | Etki | Ne zaman gelebilir |
|---|---|---|
| Turizm sezonu | Fırın ve kahve ×2 | her zaman |
| Hammadde krizi | Pazardan alınan mal %20 → %5, pazardan hammadde %55 → %40 marj; **tam entegre zincir %85'te kalıyor** | her zaman |
| Grev | Satışı olan zincirlerden birinin satışı ×0,5 | bir satış varsa |
| Moda haftası | Moda ×2,5 | Moda satıyorsa |
| İhracat atağı | Bütün gelir ×1,5 | Liman açıksa |
| Rakip atağı | Rakibin kovalama hedefi ×1,6 | her zaman |

Hammadde krizi felsefenin dersi: oyuncu bir kriz yaşayınca zincirini neden
tamamlaması gerektiğini sayılarda görüyor.

### 5.2 Meclis (L3)

| Oturum | Seçenek A | Seçenek B |
|---|---|---|
| 1 | Sanayi teşviki: ham ×1,3 | Çarşıya yaya yolu: satış ×1,2 |
| 2 | Vergi indirimi: gelir ×1,15 | Rekabet kurulu: rakip ×0,6 |
| 3 | Teknoloji hibesi: işleme ×1,3 | Turizm tanıtımı: fırın, kahve ve moda ×1,25 |
| 4 | Kampanya fonu: kampanya ×3 | İhracat fuarı: gelir ×1,1 |

Seçilmeyen oturum bir sonrakine kadar açık kalıyor. Seçimin doğru cevabı
zincirin durumuna bağlı: hammaddesi darboğaz olan için teşvik, payı düşen için
rekabet kurulu.

### 5.3 Görevler (L3)

1. İlk fırını aç
2. Değirmeni kur
3. Fırın zincirini tamamla
4. İlk kampanya
5. Kafeyi aç
6. Bir kademede 25. seviye
7. Merkez
8. Genel Müdür
9. Meclis kararı
10. Bir zincirde %75 pay
11. Sanayi
12. Liman
13. Teknopark
14. İlk holding yıldızı

İlk görevler oyunun kendisini öğretiyor: satış, işleme, entegrasyon, kampanya.
Sonrakiler uzun hedef. Ödül gelirle ölçeklendiği için hiçbir zaman önemsiz
kalmıyor.

L4'te Sanayi ile Liman arasına "Şirketi halka arz et" girdi. L3 kayıtlarında
görev sırası o noktadan sonra bir kaydırılıyor (Swift kodlayıcısı `listed`
alanı olmayan kaydı L3 kaydı sayıyor).

### 5.4 Bildirimler (L4)

Üçü de çevrimdışı tavanının içinde; tavandan sonra şirket durduğu için bir şey
olmuyor. Bir dakikadan yakın bildirim kurulmuyor.

| Bildirim | Ne zaman |
|---|---|
| Kasa doldu | Tavan anında; metinde o ana kadar birikecek para |
| Meclis toplandı | Sıradaki oturum anında (açık oturum yoksa) |
| Rakip seni geçti | `firstOvertake`: şu an önde olduğun bir zincirde payın %50'nin altına ineceği an. Zaten geride olduğun zincir sayılmıyor |

İzin bir kez soruluyor: ilk kampanya görevinden sonra küçük bir kart ("Haber
verelim mi?"). Reddedilirse bir daha sorulmuyor; Ayarlar'dan açılıyor.

## 6. Ekranlar (dikey, tek el)

1. **Şehir:**
   - üst yarıda izometrik şehir: mahalleler, seviyeyle büyüyen binalar, sokakta
     akan araçlar ve tüten bacalar (ana oyunun dili);
   - alt yarıda zincir kartları.
2. **Zincir kartı:**
   - üç kademe yan yana; her birinde seviye, hız ve "Büyüt" düğmesi;
   - darboğaz vurgulu;
   - rakiple pay çubuğu;
   - toplu alım seçenekleri: ×1, ×10, ×max.
3. **Holding:** yıldızlar, şehirler, satış önizlemesi ("şimdi satarsan +7 yıldız").
4. **Borsa** (halka arzdan sonra, zincirlerin altında): hisse fiyatı, halka
   arzdan beri değişim, grafik. Halka arz açılınca teklif kartı görev kartının
   hemen altına çıkıyor.
5. **Ayarlar** (başlıktaki dişli): görünüm (cihaz, gündüz, gece), dil (cihaz,
   Türkçe, English), ses, titreşim, bildirim, kaydı sıfırla (onaylı).

### 6.1 Görsel kimlik (L5): "Cam & Bulut"

Kullanıcı üç yön (Oyuncak Şehir, Holding Gecesi, Renk Blokları) arasından
Oyuncak Şehir'i seçti. Ardından onun üç premium alt yönünden Cam & Bulut'u,
gece sürümüyle birlikte seçti.

| Öğe | Gündüz | Gece |
|---|---|---|
| Gökyüzü | #7CCBFF → #E8F6FF, bulutlar | #0A1433 → #20356F, yıldızlar, hilal |
| Kartlar | buzlu cam (%72 beyaz), açık kenar | buzlu cam (%52 lacivert), ince açık kenar |
| Metin | #1D3557 lacivert | #EEF3FF |
| Para | #0E9F5A | #5BE39A |
| Şehir | çimenli ada, beyaz duvar, renkli çatı | yanan pencereler, sokak lambaları, farlar, suda ay ışığı |

- **Görünüm:** cihazın açık/koyu modunu izliyor; Ayarlar'dan gündüz ya da gece
  zorlanabiliyor. Renkler `Theme.swift`'te iki değerli jetonlar; görünümler
  "gece miyiz" diye sormuyor. Tek istisna şehir çizimi, orada ışık da
  değişiyor (`CityPalette`).
- **Yazı:** Fredoka (başlık ve sayılar) ve Nunito (metin). İkisi de OFL;
  uygulamayla birlikte geliyor (`Resources/Fonts`, lisans `OFL.txt`).
- **Düğmeler:** oyuncak düğme.
  - Parlak yüz: üst yarı açık, alt yarı koyu degrade.
  - Altta 4–5 pt kenar; basınca düğme kenar kadar iniyor.
  - Renkler: turuncu alım, yeşil ödül ve halka arz, mavi ikincil, altın
    holding, kırmızı sıfırla.
- **Parçalar:**
  - zincir başına SF Symbol'lü renkli ikon karosu;
  - kasa yanında altın para;
  - darboğaz için altın halka ve şimşekli hap;
  - kilometre taşına (hız ×2) ilerleme çubuğu;
  - görev merdiveninde dörtlü nokta göstergesi.
- **Simge (L9):** koyu maviden açığa ışınlar önünde altın sikke; yüzünde üç
  binalı şehir silueti, kenarında ince tırtıl, köşede parıltı. Küçük boyda da
  okunuyor (sikke + siluet). `ios-lite/App/tools/make-icon.mjs` SVG'den
  üretiyor, alfa kanalını atıyor; aynı SVG'den web sayfaları için 192 px
  `apps/lite-web/public/icon.png`.

Şehir çizimi SwiftUI `Canvas` ile prosedürel; hiçbir dış görsel dosya
kullanılmıyor.

## 7. Mühendislik

```
ios-lite/
  Kit/Package.swift           CapitalForgeLiteKit: saf Swift oyun modeli (Foundation)
  Kit/Sources/CapitalForgeLiteKit/
  Kit/Tests/CapitalForgeLiteKitTests/   XCTest + TS'ten gelen fikstürler
  App/project.yml             XcodeGen (Mac'te: brew install xcodegen && xcodegen)
  App/Sources/                SwiftUI uygulaması (L2)
packages/lite-model/          Aynı modelin TypeScript karşılığı: denge burada ayarlanıyor
packages/lite-model/test/balance.ts         Denge raporu (pnpm lite:balance)
packages/lite-model/test/write-fixtures.ts  Swift testlerine altın değerler (pnpm lite:fixtures)
.github/workflows/ios-lite.yml   macOS: swift test + xcodebuild + simülatör ekran görüntüleri
```

- **Denge TypeScript'te ayarlanıyor, Swift'te koşuyor.**
  - Idle oyunun ruhu sayılarda, ve sayıları ayarlamak çok tekrar istiyor.
    Bu makinede Swift derleyicisi yok; TS modeli yerelde saniyeler içinde
    binlerce oturumu taklit ediyor.
  - Swift modeli aynı formüllerin çevirisi.
  - **Eşitlik testi:** TS modeli belirli durumlar için sonuçları JSON fikstüre
    yazıyor; Swift testleri aynı sonuçları %0,0001 tolerans içinde üretmek
    zorunda. İki model ayrışırsa CI kırmızı.
- **Zaman:** model `advance(state, saniye)` ile ilerliyor. Çevrimdışı kazanç aynı
  fonksiyonla hesaplanıyor; olaylar ve rakip için kapalı formdaki karşılığı kullanılıyor.
- **Kayıt:** Codable JSON, Application Support altında. Sürüm alanı ve göç fonksiyonu var.
- **CI** (macOS koşucusu; depo herkese açık olduğu için ücretsiz):
  - `swift test`;
  - `xcodegen` ve `xcodebuild` ile simülatörde derleme ve arayüz testi;
  - arayüz testinin çektiği ekran görüntüleri onaya sunulmak üzere ayrı bir dala yazılıyor.

## 8. Cihaza kurulum (kullanıcı tarafı)

Adım adım: [`ios-lite/README.md`](../ios-lite/README.md). Kısaca Mac'te
`./ios-lite/xcode.sh` çalıştır, ardından Xcode'da kendi Apple kimliğini Team
olarak seç ve ▶︎ ile iPhone'da çalıştır.


- **Mac + Xcode + ücretsiz Apple kimliği:** kendi iPhone'una kurulum mümkün;
  imza 7 günde bir yenileniyor.
- **Apple Developer Program (yıllık 99 $):** TestFlight ile kalıcı kurulum ve
  başkalarına dağıtım.
- Mac yoksa uygulama yalnızca CI'daki simülatörde koşuyor; ekran görüntüleri oradan geliyor.

## 9. Denge ölçümü (L1)

`pnpm lite:balance` iki botla ölçüyor. **Aktif bot** her saniye önerilen hamleyi
alıyor ve kampanyayı hazır oldukça açıyor:

| An | Aktif oyuncu |
|---|---|
| 3 dk 31 sn | Kahve açıldı |
| 12 dk | Merkez, Moda |
| 54 dk | Sanayi, Deri |
| 1 sa 48 dk | Liman (×1,5) |
| 3 sa 40 dk | Teknopark, Teknoloji |
| 4 sa | gelir 11 M ₺/sn, yıldız önizlemesi 4 |

**Gündelik bot** 3 saatte bir 4 dakika oynuyor, arada çevrimdışı:

| Gün | Kazanç | Yıldız önizlemesi |
|---|---|---|
| 1 | 246 Mr ₺ | 15 |
| 2 | 1,7 Tn ₺ | 41 |
| 3 | 3,6 Tn ₺ | 59 (gelir ×2,2) |
| 6 | 11 Tn ₺ | 104 |

Gelir 3. günden sonra yavaşlıyor; holding'e geçmenin anlamlı olduğu yer orası.

**L3 sonrası** (görevler, olaylar, meclis; aktif bot görevleri alıp o an daha
çok kazandıran meclis seçeneğini seçiyor):

| Açılış | L1 | L3 |
|---|---|---|
| Kahve | 3 dk 31 sn | 1 dk 56 sn |
| Merkez, Moda | 12 dk | 8 dk 10 sn |
| Sanayi, Deri | 54 dk | 43 dk 40 sn |
| Liman | 1 sa 48 dk | 1 sa 34 dk |
| Teknopark | 3 sa 40 dk | 3 sa 6 dk |

Açılış hızlandı: ilk görevlerin ödülü başlangıç kasasını katlıyor. Bu, idle
türünün "ilk dakikada her şey oluyor" beklentisine uyuyor. Orta oyun aşağı
yukarı aynı kaldı.

Aktif bot 4 saatte 14 görevin hepsini aldı, 65 olay yaşadı ve 6 meclis kararı
verdi. Gündelik oyuncunun temposu değişmedi; kapalıyken olay başlamıyor.

Açık konu: gündelik bot (günde 8 oturum) beş zinciri ilk gün açıyor. L3'te
olaylar ve görevler gelince gündelik tempo yeniden ölçülecek.

**L4 sonrası** (aktif bot halka arzı açılır açılmaz yapıyor, 4 saatte şehri
satıp ikinci şehirde 2 saat oynuyor):

| Açılış | 1. şehir | 2. şehir (9 yıldız, kahve ×2) |
|---|---|---|
| Kahve | 1 dk 56 sn | 1 dk 26 sn |
| Merkez, Moda | 8 dk 10 sn | 4 dk 53 sn |
| Sanayi, Deri | 43 dk 40 sn | 32 dk 9 sn |
| Halka arz | 1 sa 20 dk | 1 sa 4 dk |
| Liman | 1 sa 33 dk | 1 sa 17 dk |

- Halka arzda kasaya o anki sürekli gelirin 15 dakikası giriyor. Anlık gelir
  kampanyayla iki katına yakın olduğu için bu, oyuncunun gördüğü gelirin
  yaklaşık 6,5 dakikası.
- Dört saatte satış önizlemesi 9 yıldız (halka açık, ×1,2).
- İkinci şehrin açılışı belirgin hızlı, iki saatte geliri ilk şehirle başa baş.
- Gündelik oyuncu 2. günün sonunda 50 yıldızı (+%100) görüyor: ilk satışın
  anlamlı olduğu yer orası.

## 10. Turlar

| Tur | Kapsam |
|---|---|
| L1 | TS modeli + denge raporu; Swift kit + eşitlik testleri; macOS CI |
| L2 | SwiftUI MVP: şehir, zincir kartları, büyütme, çevrimdışı kazanç, kayıt; simülatör kareleri |
| L3 | Rakip ve pay, olaylar, meclis kartları, görevler |
| L4 | Halka arz ve borsa, şehir bonusu, bildirimler, ayarlar (dil, ses, titreşim, bildirim, sıfırla), prosedürel ses ve titreşim, geçici simge |
| L5 | **Stil yenilemesi: "Cam & Bulut", gündüz ve gece** (§6.1). Yazı tipi, renk, şehir çizimi, kart ve düğme yapısı, simge baştan. Görünüm cihaza uyuyor; Ayarlar'dan zorlanabiliyor. Oyun mantığına dokunulmuyor |
| L6 | **iPadOS** (ayrı koşu): aynı oyun, büyük ekrana göre düzen. Ayrıntı §11 |
| L7 | **Ada dolunca: oyunun devamı.** Bina kademeleri, takımada (üç ada, üç zincir), holding haritası, şehir temaları. Ayrıntı §12 |
| L8 | **Online: lider tablosu ve ligler.** Haftalık bölüm ligi ve davet kodlu ligler kendi sunucumuzda, genel tablo Game Center'da. Ayrıntı §13 |
| L9 | **Mağazaya hazırlık.** App Attest hile koruması (§13.1), şehir fırsatları (§14), yeni simge, App Store gönderim paketi |
| Son | **Uygulama simgesi yeniden.** L4'teki geçici simge beğenilmedi; L9'da üç taslaktan "Altın sikke" seçildi |
| L10 | **Web sürümü.** Aynı oyun tarayıcıda (telefon ve masaüstü), aynı lig. Sunucu yetkili kayıt: cihazlar arası devam ve web için hile koruması. Ortak genel yıldız tablosu. Ayrıntı §15 |
| L11 | **Android sürümü.** Aynı lig, Play Store paketi. Ayrıntı §15 |
| Sonra | **Ana oyuna dönüş.** L10–L11'den sonra Lite'a yeni özellik eklenmiyor (yalnızca hata düzeltmesi); geliştirme CapitalForge web oyununun aslında sürüyor |

L5 kullanıcının isteği: "En son tüm stili değiştireceğiz. Fonttan grafiklere,
renkten buton yapısına kadar her şeyi yenilemek istiyorum." L6–L8 de onun
isteği: "ipad OS için de çalışacak durumda olan ayrı bir koşu olsun; bu
ekrandaki alan bir noktada sonlanacak, devamı nasıl olacak onu da düşünelim;
leaderboard online olsun, ligler kurulabilsin." L10–L11 de: "lite versiyonun
entegre web versiyonu ve android versiyonu da olsun; hepsi aynı leaderboard
ile çalışsın, bütünleşik. Bunlar tamamlandıktan sonra daha fazla
geliştirmeden oyunun aslına dönüp onda değişikliklerimize devam ederiz."

## 11. iPadOS (L6)

- **Hedef:** iPhone ve iPad (`TARGETED_DEVICE_FAMILY 1,2`); iPad'de dört yön,
  Stage Manager ve Split View pencere boyları (`UIRequiresFullScreen` kapalı).
- **Düzen:** `RootView` pencere boyuna ve genişlik sınıfına bakıp üç düzenden
  birini seçiyor.
  - **Telefon:** genişlik sınıfı `compact` ya da pencere 700 pt'den dar. Split
    View'in üçte biri ve iPhone bu düzende.
  - **iPad dikey:** üstte kasa ve olay şeridi (en çok 900 pt), altında geniş
    şehir (ekranın %36'sı, en çok 460 pt), altta kartlar.
  - **iPad yatay:** solda kasa, olay şeridi ve boyu dolduran şehir (ekranın
    %46'sı, en çok 620 pt); sağda kartlar.
  - Kart alanı 760 pt'yi geçince zincirler, borsa, Genel Müdür ve holding iki
    sütunlu ızgaraya geçiyor; görev, meclis ve halka arz teklifi tam genişlikte
    kalıyor.
- **Şehir:** aynı `Canvas`; çizim kutuya göre ölçeklendiği için iPad'de ada
  büyüyor, ayrıntı aynı kalıyor.
- **Girdi:**
  - İmleçle üzerine gelince parlak düğmeler hafifçe kalkıyor, seçim hapları
    vurgulanıyor.
  - Klavye kısayolları: 1/2/3 toplu alım (×1, ×10, en çok), K kampanya.
  - Dokunma hedefleri aynı kalıyor.
- **CI:** iPhone karelerinden sonra bir iPad simülatörü açılıyor. Kareler:
  `ipad-mid` (dikey), `ipad-land` (yatay, borsa), `ipad-settings`,
  `ipad-night-land` (yatay, gece). Yatay kareler `-liteLandscape` argümanıyla
  çekiliyor. Uygulama önce sistemden yatay yön istiyor; başsız CI
  simülatörü dönmezse aynı yatay düzeni 90° çevrilmiş bir kapta çiziyor
  (düzen yalnızca pencere boyuna bağlı, sonuç aynı). Hangisinin olduğunu
  `Documents/orientation.txt`'ye yazıyor; betik kareyi ona göre çeviriyor.

## 12. Ada dolunca: oyunun devamı (L7)

**Sorun.** Ada 7×7: beş zincirin 15 parseli, liman ve yollar. Aktif oyuncu
Teknopark'ı yaklaşık 3 saatte, gündelik oyuncu ilk gün açıyor. Ondan sonra
şehir görsel olarak değişmiyor. Büyüme yalnızca seviye sayısında, yeni hedef
yalnızca şehri satmak. "Alan bir noktada sonlanıyor."

Üç katman önerisi; birbirinin yerine değil, üst üste:

1. **Bina kademeleri (aynı ada, derinlik).** Her parseldeki bina kilometre
   taşlarıyla biçim değiştiriyor:

   | Seviye | Biçim |
   |---|---|
   | 1–24 | dükkân, atölye |
   | 25–99 | orta kat |
   | 100–299 | kule |
   | 300+ | simge yapı (altın çatı, anten, ışıklı tabela) |

   Ada dolduktan sonra da her alım şehirde bir şeyi değiştiriyor. Model
   değişmiyor, yalnızca çizim.
2. **Takımada (yeni adalar, yeni zincirler).** Teknopark'tan sonra köprüyle
   bağlı yeni adalar açılıyor. Şehir görünümü yatay kaydırmalı oluyor;
   üstte küçük bir ada haritası.
   - **Ada 2 · Enerji:** rüzgâr ve güneş → şebeke → enerji satışı. Bütün
     zincirlerin işleme kademesine bonus.
   - **Ada 3 · Otomotiv:** maden → parça fabrikası → bayi.
   - **Ada 4 · Havacılık:** ileri malzeme → montaj → havayolu.

   Bir şehrin aktif ömrü yaklaşık 3 saatten 8 saate, gündelik ömrü bir günden
   üç güne çıkıyor. Denge TS modelinde ölçülecek; yeni zincirler yeni fikstür
   demek.
3. **Holding haritası (meta).** Satılan şehirler bir dünya haritasında ada
   olarak kalıyor.
   - Her eski şehir yeni şehirlere bir ticaret yolu bırakıyor: kendi öne
     çıkan zincirine kalıcı küçük bir bonus.
   - Şehir temaları dönüyor (sahil, dağ, çöl, kar): her holding turu başka
     görünüyor.

**Karar (kullanıcı): üçü birden.** L7 bina kademeleri, takımada ve holding
haritasını birlikte getiriyor.

### 12.1 Uygulanan (L7)

- **Bina kademeleri** (`buildingTier`, eşikler 25 / 50 / 100):

  | Seviye | Satış | İşleme | Ham |
  |---|---|---|---|
  | 1–24 | dükkân, tente | atölye, tek baca | tarla |
  | 25–49 | orta kat, çatıda makine dairesi | geniş fabrika, uzun baca | tarla + silo |
  | 50–99 | kule, geri çekilmiş tepe | iki baca | daha yüksek silo |
  | 100+ | simge yapı: ışıklı bant, altın tepe, yanıp sönen anten | altın baca uçları | altın kubbeli silo |

  Kademeler kilometre taşlarıyla çakışıyor: hız ikiye katlanırken bina da
  büyüyor. Binalar uzadıkça kamera geri çekiliyor (kule ×0,9, simge yapı
  ×0,8), kadraja sığıyor. Ölçüm: aktif oyuncunun seviyeleri 5. dakikada 25,
  ilk saatte 50, dördüncü saatte 75–95.
- **Takımada:** Teknopark'tan sonra köprüyle bağlı üç ada. Her ada tek zincir:

  | Ada | Açılış | Zincir (ham → işleme → satış) | Fiyat |
  |---|---|---|---|
  | Enerji | 80 Mr ₺ | Rüzgâr ve Güneş → Şebeke → Enerji Satışı | 700 B ₺ |
  | Otomotiv | 1,5 Tn ₺ | Maden → Parça Fabrikası → Bayi | 10 M ₺ |
  | Havacılık | 30 Tn ₺ | İleri Malzeme → Montaj Hattı → Havayolu | 150 M ₺ |

  - Enerji şebekesi (işleme ≥ 1) diğer bütün zincirlerin işleme hızını ×1,3
    yapıyor. Önerilen hamle bunu sayıyor: şebekenin ilk seviyesinin getirisi
    diğer zincirlerin hızlanmasını da içeriyor.
  - Şehir görünümü yatay sayfalı: ana ada, sonra açık adalar. Sol üstte küçük
    ada haritası; sıradaki kilitli adanın köprü eşiği yazıyor. Köprüler sayfa
    kenarında bulutlara karışıyor.
  - Kartlarda açık zincirler ve yalnızca sıradaki kilitli zincir görünüyor.
  - Üç yeni görev sona eklendi (köprüler); eski kayıtların görev sırası
    kaymıyor.
- **Holding haritası:** satılan şehirler denizde ada (`history`). Her biri
  öne çıkan zincirine (ilk şehirde fırına) kalıcı +%10 ticaret yolu
  bırakıyor; aynı zincire düşen yollar toplanıyor. Holding kartında "Harita".
- **Şehir temaları:** holding turları sırayla sahil, dağ, çöl, kar.
  - Dağ: gri kaya yanlar, çam, arkada karlı tepeler.
  - Çöl: kum zemin, kiremit yanlar, kaktüs, arkada düz tepeli kayalar.
  - Kar: beyaz zemin, karlı çamlar, yağan kar.
- **Kayıt:** L6 kayıtlarında beş zincir var; ada zincirleri boş tamamlanıyor,
  harita boş başlıyor.

**Denge (aktif bot, kampanya açık):**

| | 1. şehir | 2. şehir (69 yıldız, kahve ×2) |
|---|---|---|
| Teknopark | 3 sa 02 dk | 1 sa 10 dk |
| Enerji Adası | 4 sa 15 dk | 1 sa 38 dk |
| Otomotiv Adası | 5 sa 48 dk | 2 sa 13 dk |
| Havacılık Adası | 7 sa 31 dk | 2 sa 55 dk |
| 8. saatte satış önizlemesi | 69 yıldız | — |

Gündelik oyuncu (3 saatte bir 4 dakika) ikinci gün sekiz zincirin hepsini
açıyor; ikinci günün sonunda satış önizlemesi 146 yıldız.

## 13. Online: lider tablosu ve ligler (L8)

**Oyun tarafı.**
- **Haftalık lig:** Duolingo usulü bölümler (Bronz → Gümüş → Altın → Elmas).
  - Oyuncu her hafta 30 kişilik bir gruba düşüyor.
  - Puan haftalık holding kazancı; yıldız çarpanı hariç, yoksa eski oyuncu
    hep kazanır.
  - İlk 5 üst bölüme çıkıyor, son 5 iniyor.
- **Özel ligler:** 6 harfli davet koduyla arkadaş ligi kuruluyor. Aynı
  haftalık puan, kendi tablosu.
- **Genel tablo:** toplam holding değeri ve yıldız; dünya ve arkadaşlar.
- **Hile payı:**
  - İdle oyunda saat oynamak en kolay hile. Sunucu her gönderimi zamanla
    kaydediyor.
  - "Bu sürede en fazla bu kadar kazanılabilir" sınırını aynı TS modeliyle
    (`packages/lite-model`) hesaplıyor.
  - Web oyununun Tohum Ligi'ndeki "her koşu doğrulanır" fikrinin idle
    karşılığı.

**Altyapı, kullanıcının kararı:**

| Seçenek | Ne verir | Ne ister |
|---|---|---|
| A · Game Center | Hazır lider tabloları (haftalık yinelenen dahil), arkadaşlar, sunucu yok | Ücretli Apple Developer Program (yılda 99 $) ve App Store Connect ayarı. Davet kodlu özel lig yok |
| B · Kendi sunucumuz (Cloudflare Workers + D1, ücretsiz katman) | Haftalık lig, davet kodu, TS modeliyle doğrulama; ücretsiz imzayla çalışıyor | Bir Cloudflare hesabı ve API anahtarı (depo sırrı olarak) |
| C · İkisi | Genel tablo Game Center'da, ligler kendi sunucumuzda | A ve B'nin gerekleri |

Bugün uygulama ücretsiz "Personal Team" imzasıyla kuruluyor. Game Center ve
iCloud gibi Apple servisleri ücretli üyelik istiyor; B ücretsiz imzayla da
çalışıyor.

**Karar (kullanıcı): C, ikisi birden.**
- **Game Center:** genel tablo.
- **Kendi sunucumuz:** haftalık bölüm ligleri ve davet kodlu ligler.
- **Kullanıcıdan gerekenler** (L8 başlarken adım adım yazılacak):
  - ücretli Apple Developer üyeliği ve App Store Connect'te lider tabloları;
  - Cloudflare hesabı ve API anahtarı (depo sırrı).
- **Bağımlılık:** sunucu tarafı ve oyun içi lig ekranları bunlar gelmeden de
  yazılabilir. Gerçek bağlantı ancak hesaplar hazır olunca açılır.

### 13.1 Uygulanan (L8)

- **Kurallar** (`packages/lite-model/src/league.ts`, Swift `League.swift`):
  - Hafta ISO 8601, UTC; pazartesi 00:00'da başlıyor.
  - Puan bu hafta kazanılan, yıldızsız: toplam kazançtaki artış ÷ (1 + 0,02 × yıldız).
    Hafta uygulama kapalıyken döndüyse aradaki kazancın süreyle orantılı payı
    yeni haftaya yazılıyor (Swift `LeagueTracker`).
  - Bölümler: Bronz, Gümüş, Altın, Elmas. Grup 30 kişi.
  - İlk 5 çıkıyor (puanı sıfır olan çıkmıyor), son 5 iniyor. 10 kişiden küçük
    grupta kimse inmiyor.
- **Sunucu** (`packages/lite-league`, Cloudflare Workers + D1): anonim hesap
  (ad + token, yalnızca özeti saklanıyor), gönderim, haftalık grup, özel ligler,
  hesap silme (oyuncunun her izi; boşalan özel lig de).
  - **Hafta dönümü:** pazartesi cron'unda; kaçarsa ilk istekte yapılıyor, tek
    sefer. İşaret ve bütün bölüm değişiklikleri tek D1 işleminde, iki ifadede
    (grup sıralaması SQL pencere işlevleriyle): yarıda kalırsa hiçbiri
    yazılmıyor, sonraki istek baştan yapıyor. Oyuncu sayısı ne olursa olsun
    birkaç sorgu (ücretsiz katman istek başına en çok 50).
  - **Özel lig:** 6 harfli davet kodu; en çok 50 üye, oyuncu başına en çok 10 lig.
  - **Testler:** gerçek SQLite (`node:sqlite`) üstünde koşuyor.
- **Akla yatkınlık:** süre sunucunun saatinden.
  - Seviyelerin maliyeti ≤ 3 × şehirde kazanılan + 10 M.
  - Puan artışı ≤ o seviyelerle en yüksek gelir × geçen süre × 1,2. En
    yüksek gelirde pay 1; anlık çarpanların üst sınırı ×7,5 (kampanya fonu ×3,
    moda haftası ×2,5).
  - Puan hafta içinde geri gitmiyor. Şehir ve yıldız geri gidebiliyor (oyunu
    sıfırlamak); hız sınırını büyütmüyorlar.
  - Gönderim en sık 30 saniyede bir; uygulama 5 dakikada bir ve arka plana
    geçerken gönderiyor.
  - **App Attest (L9):** durum hâlâ uygulamanın bildirdiği; ama artık yalnızca
    gerçek uygulamadan, gerçek bir Apple cihazından kabul ediliyor. Cihaz başına
    bir kez kanıt (zincir Apple köküne, uygulama kimliği, anahtar), her
    gönderimde gövde üstüne imza ve artan sayaç. Kendi isteklerini yazan biri
    artık puan gönderemiyor. Kalan risk: değiştirilmiş (jailbreak) cihaz;
    Apple'ın sahtecilik ölçüsü (receipt) ileride eklenebilir.
- **Uygulama:**
  - Kartlarda haftalık lig kartı: bölüm, sıra, bitişe kalan süre.
  - Lig penceresi:
    - bölüm özeti;
    - 30 kişilik grup (çıkış/iniş okları, sen vurgulu);
    - özel ligler: kur, koda katıl, kodu kopyala, ayrıl;
    - adla katılma;
    - hesap satırı: adı değiştir, hesabı sil (onaylı; App Store 5.1.1(v)).
  - Sunucu adresi yokken "yakında"; haftalık puan yine sayılıyor.
- **Game Center:** `cf.lite.stars` tablosuna şehir satılınca yıldız. Info.plist
  `LiteGameCenter` ücretli üyelik gelene kadar kapalı.
- **Kurulum:** kullanıcı adımları `ios-lite/README.md` → "Online lig (L8)".
  Dağıtım iş akışı `.github/workflows/lite-league.yml`; sırlar yokken atlanıyor.


## 14. Şehir fırsatları (L9)

Oynarken şehrin kendisi de bir şey istesin: ara sıra bir binanın üstünde bir
fırsat balonu beliriyor; dokunan yakalıyor, kaçıran kaçırıyor.

- **Türler** (sabit sırayla: sipariş, sipariş, ünlü müşteri, sipariş, sipariş,
  yatırımcı):
  - **Toplu sipariş:** satış yapan bir zincirin binasından; gelirin 12 saniyesi.
  - **Ünlü müşteri:** taçlı mor balon; gelirin 30 saniyesi.
  - **Yatırımcı:** adanın ortasında altın balon; gelirin 60 saniyesi.
- **Zaman:** ilki 150. saniyede, sonrakiler 100 saniyede bir (başlangıçtan
  başlangıca); her balon 12 saniye duruyor. Yalnızca oyuncu oradayken: kapalıyken
  çıkmıyor, duran balon kapalıyken kaçıyor. Zincir satış yapan zincirlerden
  sayaçla seçiliyor; satış yoksa balon çıkmıyor.
- **Ödül kasaya:** kazanca (mahalleler, yıldız, lig puanı) sayılmıyor, görev
  ödülü gibi. Lig hız sınırı bu yüzden değişmiyor. Ödül şirketin o anki
  gelirinden (zincirinkinden değil): geç oyunda tek zincir küçük bir pay, balon
  sönmesin.
- **Denge** (`pnpm lite:balance`, bot her balonu yakalıyor; `DEALS=0` ile kapalı):
  sekiz saatte kazancın ~%22'si kadar nakit, satışta 69 yerine 83 yıldız; adalar
  %5 kadar erken. Gerçek oyuncu birkaçını kaçırıyor: aktif oyuna görünür ama
  dengeyi bozmayan bir ödül.
- **Görünüş:** cam balon zincirin rengi ve simgesiyle (ünlü müşteri taç, yatırımcı
  çanta), hafifçe süzülüyor; kalan süre halkada, ödül altında. Son 3 saniyede
  titriyor. Dokununca altın taneler dağılıyor, tutar yukarı uçuyor; ses ve
  titreşim. İlk birkaç balonda "Dokun!" ipucu. Zincirin adası başka sayfadaysa
  balon sayfanın köşesinde: kaçmıyor. Hareket azaltılınca süzülme yok.
- **Model:** `ActiveDeal`, `nextDealAt`, `deals`; `catchDeal`, `dealReward`
  (TS ve Swift, eşitlik fikstüründe `firsatlar` senaryosu). Eski kayıtta ilk
  balon açılışın hemen ardından.


## 15. Çok platform: web ve Android (L10–L11)

Hedef: Lite iPhone, iPad, tarayıcı ve Android'de aynı oyun; tek lig sunucusu,
tek tablo. Bir cihazda başlayan oyun öbüründe sürüyor.

- **Model:** `packages/lite-model` zaten oyunun kaynağı (Swift kit onun
  eşleniği, fikstürlerle). Web onu doğrudan kullanıyor; port yok, eşitlik
  sorunu yok.
- **Web (L10):** `apps/lite-web` (React + Vite, ana oyunla aynı yığın).
  GitHub Pages'te `/qwen_game1/lite/`; gizlilik ve destek sayfaları da oraya
  taşınıyor. Dokunmatik öncelikli, dikey telefon ve geniş ekran; "Cam & Bulut"
  görünüşü (§6.1), gündüz ve gece. Şehir `<canvas>`'ta aynı izometrik çizimle.
  Çevrimdışı çalışıyor (PWA, ana ekrana eklenebiliyor); kayıt tarayıcıda.
- **Lig ve hile payı:**
  - iOS: App Attest (L9) aynen.
  - Web ve Android'de cihaz kanıtı yok (tarayıcının App Attest karşılığı yok).
    Onun yerine **sunucu yetkili kayıt:** istemci son eşitlemeden beri yaptığı
    hamleleri (seviye al, kampanya, balon yakala, şehir sat…) oyun saatiyle
    gönderiyor; sunucu aynı TS modelini kendi kayıtlı durumundan oynatıyor.
    Geçen süre sunucunun saatinden: saat oynamak, kasayı elle değiştirmek
    işe yaramıyor. Sunucunun durumu esas; istemci farklıysa ona dönüyor.
    Gönderim başına yalnızca son birkaç dakikanın hamleleri, ücretsiz
    katmanın işlemci sınırına sığıyor.
  - Hesap açmada Cloudflare Turnstile (bot karşı).
  - Tablolarda platform işareti (telefon, tablet, tarayıcı); herkes aynı
    grupta.
- **Cihazlar arası devam:** hesap ekranında "başka cihaza taşı" kodu (6 harf,
  10 dakika). Diğer cihaz kodu girince lig hesabı ve kayıt oraya geçiyor. iOS
  kaydı sunucuya App Attest imzalı yüklüyor; web ve Android zaten sunucuda.
- **Genel tablo:** Game Center yalnızca Apple'da. Sunucuya bütün platformların
  ortak "yıldız" tablosu ekleniyor (dünya ve özel lig arkadaşları); iOS
  Game Center'a yazmayı sürdürüyor.
- **Android (L11), önerilen yol:** web sürümü Capacitor ile yerel uygulama
  kabuğunda; arayüz web ile tek kod. Yerel eklentiler: bildirim, titreşim,
  arka plana geçerken gönderim. Lig doğrulaması web'deki gibi sunucu yetkili
  kayıt; Play Integrity gerekmiyor (istenirse sonra eklenebilir). Diğer yol
  (Kotlin + Compose, modelin üçüncü portu) daha yerel ama üçüncü bir arayüz
  ve eşitlik fikstürü demek.
- **Kullanıcıdan gerekenler:**
  - Web: yok (Pages zaten açık). Turnstile için Cloudflare panelinden bir site
    anahtarı (ücretsiz).
  - Android: Google Play Console geliştirici hesabı (tek sefer 25 $), uygulama
    imzalama anahtarı (Play App Signing).

### 15.1 Uygulanan (L10)

- **Eşitleme** (`packages/lite-model/src/sync.ts`, sunucu `src/saves.ts`):
  - Zaman sabit 1 sn adımlarla; istemci yalnızca `advance(state, 1)` çağırıyor,
    kesir ekranda süsleniyor. Günlük: `['t', n]` adım, `['o', sn]` yokken,
    eylemler (`b` seviye, `m` müdür, `c` kampanya, `p` meclis, `g` görev,
    `d` fırsat, `i` halka arz, `s` şehri sat, `r` sıfırla).
  - Sunucu aynı kodu aynı sırayla oynatıyor: dürüst istemcide sonuç bit bit
    aynı (testte ve tarayıcıda doğrulanıyor). Süre bütçesi hesap açıldığından
    beri gerçekten geçen süre (+10 sn pay; yeni hesaba açılış öncesi için en çok
    1 saat). Günlük tamken (`rest: 0`) kullanılmayan süre birikmiyor.
  - Gönderim başına en çok 600 adım, 1000 kayıt: ücretsiz katmanın işlemci
    sınırına sığıyor (600 adım ≈ 2–3 ms).
  - İyimser sürüm kilidi; başka cihaz ilerlediyse 409 ve güncel durum,
    istemci ona dönüyor. Yanıtı kaybolan gönderimin tekrarı zararsız.
  - Haftalık puanı sunucu hesaplıyor: her zaman dilimi gerçek zamana
    yerleşiyor, pazartesiyi aşan dilim süresiyle bölünüyor.
- **Hesap:** web ve Android ilk açılışta sessiz (adsız) hesap; ad verince lige
  katılıyor (hemen bu haftanın grubunda). Bir hesabın birden çok cihazı
  (`tokens`). Taşıma kodu 6 harf, 10 dakika, tek seferlik; kayıt sunucuda
  olmalı (iOS önce yüklüyor).
- **iOS:** her 5 dakikada ve arka plana geçerken önce kaydı yüklüyor
  (App Attest onaylı, Swift biçimi sunucuda TS'ye çevriliyor), sonra puanı.
  Öne gelince sunucu ilerlemişse onun durumuna ve haftalık puanına geçiyor.
- **Genel tablo:** `GET /v1/stars` (dünya ilk 50, sıram, özel lig
  arkadaşları); tablolarda platform işareti (iPhone/iPad, tarayıcı, Android).
- **Web arayüzü** (`apps/lite-web`): React + Vite; şehir çizimi iOS'un
  `IsoPainter`'ının Canvas karşılığı (aynı geometri, renkler, belirlenimci
  rastgele diziler). PWA (çevrimdışı, ana ekrana ekleme). Telefon, tablet ve
  masaüstü düzeni. Metinler `L10n.swift`'ten derleme anında.
- **Testler:** `packages/lite-model/test/sync.test.ts`,
  `packages/lite-league/test/sync.test.ts`, tarayıcıda uçtan uca
  `tools/lite-web-e2e.mjs` (CI'de "Lite web · uçtan uca ve kareler").

### 15.2 Uygulanan (L11): Android

- `apps/lite-android`: Capacitor 8 kabuğu, `apps/lite-web` paketi içinde
  (`webDir`). Uygulama kimliği iOS ile aynı: `com.catikur.capitalforgelite`.
- Yerel parçalar (`apps/lite-web/src/native.ts`, tarayıcıda boş): titreşim
  (Haptics), uygulama durumu (arka plana geçerken kaydet, eşitle, bildirim
  zamanla; dönünce sil), geri tuşu (açık pencereyi kapatır, yoksa uygulamayı
  arka plana alır), yerel bildirimler (iOS ile aynı plan: kasa doldu, meclis,
  rakip). Kesin alarm izni istenmiyor (Play kuralı); bildirimler birkaç dakika
  oynayabilir.
- Lig: web ile aynı (sunucu yetkili kayıt, platform `android`).
- Simgeler ve açılış ekranı iOS simgesinin SVG'sinden
  (`apps/lite-android/tools/make-icons.mjs`); Play görselleri `store/`.
- CI (`.github/workflows/lite-android.yml`): emülatörde aç ve kare al,
  APK ve AAB; yükleme anahtarı sırlardaysa AAB imzalı. Play adımları
  `apps/lite-android/README.md`.

