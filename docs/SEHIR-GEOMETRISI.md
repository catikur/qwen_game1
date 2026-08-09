# Tur 8 — Şehir geometrisi · Tasarım Belgesi

> Durum: **uygulandı ve ölçüldü.** Sonuçlar §5'te.
>
> Bu tur, `TOPRAK-TASARIMI.md`'nin bıraktığı işi devralıyor — ama önce
> onun tavsiyesini sınıyor. Tavsiye yanlış çıktı.

---

## 1. Sınanan tavsiye

Tur 7 şunu yazmıştı:

> "Haritayı büyütmek artık doğru sıradaki iş."

Gerekçe abonman oranıydı: nüfus tavanındaki talebi karşılamak 284 parsel
gerektiriyor, haritada 285 var — yani şehir ancak her parseli outlet
olursa doyuyor.

Teşhis doğruydu. **Reçete yanlıştı.**

## 2. Neden yanlış: bölge eklemek oranı değiştirmiyor

Abonman oranı bir bölünme:

```
abonman = (nüfus tavanının talebi ÷ en büyük outlet kapasitesi)
          ────────────────────────────────────────────────────
                     bölge sayısı × bölge başına parsel
```

Bir bölge eklemek payı da paydayı da aynı oranda büyütür. Nüfus bölgeden
gelir, parsel de bölgeden gelir — oran yerinde sayar.

`pnpm land` bunu doğrudan ölçüyor. Model önce gerçek üretece karşı
doğrulanıyor (%1,4 sapma), sonra varyantlar aynı modelden geçiyor:

| varyant | harita | bölge | parsel | gereken | abonman |
|---|---|---|---|---|---|
| bugün · 3×3 | 24 × 24 | 9 | 279 | 283 | **%101** |
| **5×5 bölge** *(Tur 7'nin tavsiyesi)* | 40 × 40 | 25 | 775 | 735 | **%95** |
| bölge 8→12 | 36 × 36 | 9 | 629 | 283 | %45 |
| **ada 4→5** | 30 × 30 | 9 | 497 | 283 | **%57** |
| ada 4→6 | 36 × 36 | 9 | 776 | 283 | %36 |

Bölge sayısını 2,8 katına çıkarmak abonmanı %101'den ancak %95'e
indiriyor — o altı puan da arketip karışımının değişmesinden geliyor,
büyümeden değil.

Kaldıraç bölge sayısı değil **nüfus başına parsel**. O da ızgara
geometrisinde: sokak aralığı ve bölge kenarı.

## 3. Uygulanan değişiklik

```
DISTRICT_SIZE  8 → 10      bölge kenarı
BLOCK_SIZE     4 → 5       her 5 karede bir sokak
```

Harita 24×24'ten **30×30**'a, parsel 285'ten **504**'e çıkıyor. Yapı
adaları 3×3'ten **4×4**'e büyüyor — sokak payı %44'ten %36'ya iniyor,
yani şehir hem daha geniş hem daha *dolu* görünüyor.

### Neden ada 5, ada 6 değil

Abonmanı düşürmek tek başına hedef değil. Toprak bedava olursa oyunun
konum kararı anlamını yitirir. Bölge bazında bakınca doğru eşik
görünüyor:

| arketip | nüfus | parsel | gereken | abonman |
|---|---|---|---|---|
| **Merkez** | 4.200 | 56,3 | 55,1 | **%98** |
| Orta Gelir Konut | 5.800 | 53,8 | 50,2 | %93 |
| Lüks Konut | 2.600 | 49,9 | 38,3 | %77 |
| Üniversite | 4.600 | 51,2 | 36,4 | %71 |
| Teknopark | 2.300 | 55,0 | 33,6 | %61 |
| Çarşı | 3.100 | 60,2 | 30,7 | %51 |
| Turizm | 1.900 | 49,9 | 21,4 | %43 |
| Liman | 1.100 | 60,2 | 7,7 | %13 |
| Sanayi | 1.400 | 60,2 | 7,3 | %12 |

Şehir geneli %57'ye inerken **Merkez %98'de kalıyor.** Aradığımız tam
buydu: şehir doyabiliyor ama merkezde parsel hâlâ kıt, çeperde bol.
Emlak oyununu ayakta tutan şey bu eğim — ada 6'da Merkez %63'e düşüyor
ve merkez de sıradanlaşıyor.

Denge testi artık bunu **çift taraflı** tutuyor: abonman %35–%75
bandının dışına çıkarsa kırmızı yanar. Üst sınır tıkanmayı, alt sınır
toprağın bedavalaşmasını engelliyor.

## 4. Beklenmedik sonuç: rakipler kol kurmayı bıraktı

Geometri değişince denge testinde **yedi kontrol** kırıldı. Altısı tek
bir kök sebepten:

```
FAIL  rakipler kol kuruyor — 0/4 rakip
FAIL  doktrinler birbirinden ayrışıyor — 1 farklı kol profili: 0/0
FAIL  kalite avcısı ucuzcudan daha çok Ar-Ge kuruyor — 0 > 0
FAIL  zincir kartını izlemek günlük kârı artırıyor — ortalama %-14
```

Rakiplerin kol (Ar-Ge / pazarlama) hamlesi şu sırayla çalışıyordu:

> "Kol, kârlı bir genişleme bulunamadığı haftalarda kurulur."

Bu sıra Tur 2'de ölçümle bulunmuştu ve doğru bir sorunu çözüyordu: kol
genişlemeden önce gelince rakipler kendi büyümelerinden oluyordu (aynı
tohumda toplam değer 160 M ₺ → 85 M ₺).

Ama çözüm **örtük olarak toprağın kıtlığına yaslanıyordu.** Genişleme er
geç tıkanıyor, sıra kola geliyordu. Toprak bollaşınca sıra hiç gelmedi.

### Düzeltme: kapıyı sıradan ölçeğe taşımak

Kolun getirisi bina başına değil, kategorideki **bütün** mağazalara
dağılır — değeri mağaza sayısıyla artar, maliyeti sabittir. Benchmark bu
eşiği zaten ölçüyordu:

| | kâr etkisi | geri ödeme |
|---|---|---|
| Ar-Ge · 4 mağaza | %6 | 622 gün |
| Ar-Ge · 8 mağaza | **%14** | **140 gün** |

Kol artık genişlemeden **önce** deneniyor, ama yalnızca kategoride
**8 mağazası olan** rakip için. Sekizin altında kol kurmak rakibi kendi
büyümesinden ediyor; üstünde kurmamak masada para bırakıyor. Kapı bunu
doğrudan söylüyor, dolaylı olarak değil.

Büyüme gerçekten tıkandığında eski davranış korunuyor: kârlı genişleme
bulunamayan haftada ölçek kapısı aranmıyor.

### Yeni kontrol

Bu hatayı bir daha geometri değişikliğine bırakmamak için denge testi
artık **iki dünyayı yan yana** koşuyor: bugünkü harita ve yapılı
parsellerin yarısı boşaltılmış bir harita. İkincide kol sayısı çökerse
kapı yine toprağa bağlanmış demektir.

Kontrolün kırmızı yanabildiği doğrulandı: kapı devre dışı bırakılınca
`bol toprakta 0 kol` diyor.

## 5. Ölçülen sonuçlar

### Boş talep eğrisi tersine döndü

| | 360. gün | 700. gün | 1200. gün |
|---|---|---|---|
| Tur 7 sonu | %20 | %34 | %33 |
| **Tur 8** | %30 | **%12** | **%13** |

Sayının kendisinden çok **yönü** değişti. Önce boş talep zamanla
*artıyordu*: şehir büyüdükçe geri kalıyordu, çünkü nüfus tavanı
haritanın kapasitesini aşıyordu. Şimdi tersi — erken oyunda fırsat bol,
geç oyunda şehir doyuyor.

Erken oyundaki %20 → %30 artışı bir bedel değil, aynı madalyonun öbür
yüzü: 1,8 kat parsel, aynı beş inşaatçı. Doldurulacak yer var demek.

### Kısıt deneyi

`pnpm constraint` — 1200 gün, sermaye sınırsız:

| | Tur 7 | **Tur 8** |
|---|---|---|
| Sınırsız sermayeyle boş talep | %52 | **%12** |
| 1200. günde boş parsel | 0 | 0 |

Toprak hâlâ tamamen tüketiliyor, ama artık **talebi karşıladıktan
sonra**. Fark bu.

### Benchmark

| | önce | sonra |
|---|---|---|
| Oyuncu net değeri | 36,3 M ₺ | 38,5 M ₺ |
| Oyuncu / rakip oranı | 1,37 | 1,58 |
| Simülasyon hızı | 207 gün/sn | 76 gün/sn |

Simülasyon 1,8 kat parsel ve 1,75 kat bina için yavaşladı; oyunun
gerçek ihtiyacı saniyede birkaç gün olduğu için pay bırakıyor.

## 6. Bölge sayısı kararı: 3×3 kalıyor

5×5 yerleşim gerçek simülasyonda ölçüldü (`pnpm constraint`, son bölüm):

| yerleşim | harita | parsel | 360g | 700g | 1200g | oyn/rak | gün/sn |
|---|---|---|---|---|---|---|---|
| 3×3 | 30×30 | 504 | %13 | %0 | %9 | 0,66 | 38 |
| 5×5 | 50×50 | 1377 | **%53** | %24 | %9 | 0,52 | 31 |
| 5×5 · hızlı bot | 50×50 | 1377 | **%13** | %12 | %14 | 7,62 | 9 |

Üçüncü satır bir **ayırt etme** deneyi: tek değişken inşa temposu. Tempo
artınca 5×5'in erken oyun açığı %53'ten %13'e — yani 3×3 seviyesine —
iniyor.

Sonuç: 5×5'in sorunu harita değil **inşaatçı sayısı.** Dört rakip ve bir
oyuncu, 2,7 kat şehri yıllarca boş bırakıyor. Büyük şehrin önkoşulu
rakip sayısının şehir boyutuyla ölçeklenmesi — `NPC_PROFILES` bugün dört
tane ve `npcCount` onunla sınırlı.

Bu yüzden yerleşim 3×3 kalıyor, ama artık **argüman**: `createNewGame`
bir `layout` alıyor. Bölge açma ve çoklu şehir işleri o dikişten
geçecek.

## 7. Yöntem notu

Bu tur üç kez aynı dersi verdi, üçü de farklı kılıkta.

**Bir tavsiyeyi uygulamadan önce sına.** Tur 7 "haritayı büyüt" diye
yazdı ve gerekçesi doğruydu; reçetesi yanlıştı. Bölge eklemek payı da
paydayı da büyütüyor. Ölçüm on dakika sürdü, uygulama günler sürerdi.

**Bir çözüm, çözmediği bir şeye yaslanmış olabilir.** Kolun "en sona
al" sırası, toprağın kıtlığı sayesinde çalışıyordu. Toprak değişince
sıra hiç gelmedi. Bir kuralın neye yaslandığını bilmiyorsan, o kural
değişen her şeyle birlikte sessizce bozulabilir.

**Bir eşik neye bağlıysa onunla ölçülmeli.** `vacant >= 80 && vacant <=
180` kontrolü harita büyüyünce kırıldı — oysa ölçtüğü şey (şehrin ne
kadar boş başladığı) hiç değişmemişti: %38'den %39'a. Mutlak sayıya
bağlanan eşik, gerçek bir sorun yokken kırmızı yakar; oran bağlanınca
doğru şeyi ölçmeye devam etti.

Bir de tanıdık bir tuzak tekrar çıktı: **yeni yazdığım ölçüm hatalıydı.**
`constraint.ts`'in ilk hali `district.unmet`'i birim sanıp doğrudan
topluyordu, oysa oran tutuyor. Payda pay ezince her satır %0 çıktı — yani
kontrol hiçbir koşulda kırmızı yanamazdı. Benchmark'ın aynı hesabı
doğru yapması yakalattı. Yeni bir ölçüm aracı, ölçtüğü şey kadar
şüpheyle karşılanmalı.

### Zincir satırı: üç yanlış hipotez, sonra doğrusu

Benchmark'ın zincir satırı uzun süre denge testiyle **ters işaret**
veriyordu: termometre -%11, sınav +%21. İki sayı yan yana durdu ve
ikisine de güvenildi.

Hipotezler sırayla elendi:

| # | hipotez | sınandı | sonuç |
|---|---|---|---|
| 1 | tek günün gürültüsü | son 60 günün ortalaması | işaret değişmedi (-%17) |
| 2 | tek tohumun tesadüfü | üç tohum | değişmedi (-%19) |
| 3 | nakit koşulu farkı | 20 M ₺ kaldırıldı | daraldı ama kapanmadı (-%4) |
| 4 | **ölçüm ufku** | 400 → 500 gün | **+%12 — sınavla birebir** |

Zincirin geri ödemesi **~190 gün**; benchmark 400 günde kesip son 60
günü okuyordu. Yatırımın geri dönmesine fırsat vermeden sonucu
açıklıyordu.

> **Kural:** bir yatırımın karşılığını ölçen pencere, o yatırımın geri
> ödemesinden belirgin şekilde uzun olmalı.

Üçüncü hipotez elenirken çıkan şey de kayda değer olduğu için ayrı bir
satır olarak duruyor:

| | zincirin getirisi |
|---|---|
| normal nakit | **+%12** |
| bol nakit (20 M ₺) | **+%1** |

Bol nakit + bol toprak, parseli outlet'le doldurmayı zincire tercih
ettiriyor — her inşa yuvası bir parsel, zincire harcanan yuva bir mağaza
etmiyor. **Zincir bir nakit kısıtı oyunudur** ve Tur 8 toprağı
bollaştırdığı için bunu bilmek artık daha önemli.

Aynı hatanın sınav tarafı da düzeltildi: denge testi de kârı `today.profit`
ile, yani **tek günden** okuyordu. Kontrol geçiyordu ama geçmesi ölçtüğü
şeyin doğru olduğunu göstermiyordu.
