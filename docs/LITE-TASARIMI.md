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
5. **Ayarlar** (başlıktaki dişli): dil (cihaz, Türkçe, English), ses, titreşim,
   bildirim, kaydı sıfırla (onaylı).

Görsel kimlik ana oyunun Kadastro teması (aydınlık zemin, mürekkep vurgu,
tabular rakamlar). Şehir çizimi SwiftUI `Canvas` ile prosedürel; hiçbir dış
görsel dosya kullanılmıyor. L5'te bunların hepsi baştan ele alınıyor (§10).

Simge (L4, geçici): koyu zeminde yükselen üç izometrik kule (ham → işleme →
satış). `ios-lite/App/tools/make-icon.mjs` SVG'den üretiyor, alfa kanalını
atıyor.

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
| L5 | **Stil yenilemesi: her şey baştan.** Yazı tipi, renk paleti, şehir grafikleri, kart ve düğme yapısı, simge. Önce 2–3 farklı yön kareleriyle önerilip kullanıcı seçiyor; sonra tema dosyası, şehir çizimi, bütün kartlar ve simge o yöne göre yeniden yapılıyor. Oyun mantığına dokunulmuyor |

L5 kullanıcının isteği: "En son tüm stili değiştireceğiz. Fonttan grafiklere,
renkten buton yapısına kadar her şeyi yenilemek istiyorum." Bu yüzden L4'teki
simge ve yeni kartlar bugünkü temayı izliyor ama geçici sayılıyor.
