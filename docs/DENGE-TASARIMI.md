# Tur 3 — Denge · Şehir Neden Hiç Doymuyordu

> Durum: **kodlandı.** Tek dosyalık bir kural değişikliği, ama oyunun en
> temel döngüsünü onarıyor.

---

## 1. Belirti

Tur 2'nin A parçasını ölçerken tuhaf bir şey çıkmıştı: kalite kolunu
sonuna kadar açmak pazar payına neredeyse hiçbir şey katmıyordu.

| Taraf başına süpermarket | Tam Ar-Ge priminin hacme katkısı |
|---|---|
| 4 | %0,0 |
| 12 | %0,6 |
| 20 | %3,4 |

O zaman bunu **fiyat kanalı** ekleyerek dolandık (bkz. `REKABET-TASARIMI.md`
§3.4): arz-kıt bir pazarda kalitenin karşılığı hacim değil fiyattır. Çözüm
işe yaradı ama asıl sorunun üstünü örttü.

Asıl sorun şuydu: **çekicilik formülünün hiçbir değişkeni bir işe
yaramıyordu.** Kalite, marka, fiyat — üçü de talebi paylaştırmak için var.
Ama herkes zaten satabildiğinin tamamını satıyorsa paylaştıracak bir şey
yok. 400. günde bile karşılanmayan talep %19–40 arasındaydı.

---

## 2. Yanlış şüpheliler

Tasarıma geçmeden önce üç adayı tek tek eledik.

**"Talep kapasiteye göre çok büyük."** Değil. Şehrin market talebi
29.274 birim/gün ve en büyük outlet 1.400 kapasiteli — **21 bina** şehri
doyurmaya yetiyor. Alınabilir 283 parsel var.

**"Metrik yanlış."** Kısmen. Harness `unmet` değerini bölge oranlarının
**ağırlıksız** ortalaması olarak raporluyordu; küçük bir bölgede outlet
yoksa oranı 1,0 oluyor ve ortalamayı şişiriyor. Ama ağırlıklı ölçüm de
benzer çıktı (%52'ye karşı %54), yani sorun ölçümde değildi.

**"Defter tutmuyor."** Tutuyor. Birebir sayımda `satılan + karşılanmayan
= talep`, fark **0 birim**.

---

## 3. Gerçek sebep

Aynı sayımda göze çarpan şey şuydu: 21 süpermarketle 200 gün koşulduğunda
market talebi **29.274 → 52.384**'e çıkmıştı (+%79). Binasız bir
laboratuvarda ise aynı sürede yalnızca +%2.

Farkı yaratan satır `runPopulationTick` içindeydi:

```ts
const growth = BASE_GROWTH_PER_DAY + jobs * JOB_GROWTH_FACTOR;
```

Her bina istihdam yaratıyor, istihdam nüfusu büyütüyor, nüfus da talebi.
Bir süpermarket 18 kişi işe alıyor ve o 18 kişi mahalleyi büyütüyor,
mahalle de o süpermarketin talebini.

> **Dükkân kendi müşterisini üretiyordu.**

Bu, kapasitenin talebi asla yakalayamayacağı bir döngü. Ne kadar çok
mağaza açarsan talep o kadar büyüyor; doyma noktası hep bir adım önünde
kaçıyor.

---

## 4. Düzeltme: temel istihdam

Şehir ekonomisinde klasik bir ayrım var: **temel** istihdam (şehre
dışarıdan gelir ve insan çeker) ve **temel olmayan** istihdam (yerel
nüfusa hizmet eder, onu takip eder). Fabrika temeldir; bakkal değildir.

```ts
if (def.role === 'outlet') continue;   // perakende nüfus çekmez
```

Tek satır. Üretim, ofis, lojistik, depo, Ar-Ge ve pazarlama nüfus çekmeye
devam ediyor; konut zaten kendi kanalından sakin ekliyor.

### Ölçülen etki

Aynı kurulum (talebe orantılı 30 süpermarket, 200 gün):

| Model | Nüfus | Market talebi | Doluluk |
|---|---|---|---|
| Eski (her iş sayılır) | 28.114 → 54.324 (**+%93**) | 58.709 | **%100** |
| Temel istihdam | 28.114 → 29.261 (+%4) | 30.469 | **%69** |

**Doluluk %100'den %69'a indi** — yani mağazaların arasında artık
paylaşılacak müşteri var. Rekabet ancak buradan sonra bir anlam taşıyor.

Kalite kolunun doymuş pazardaki karşılığı da buna paralel sıçradı:

| | Tur 3 öncesi | Tur 3 sonrası |
|---|---|---|
| Doymuş pazarda tam Ar-Ge priminin hacme katkısı | %4,2 | **%26,5** |
| O pazarda karşılanmayan talep | %17 | **%0** |

Harness ayrıca şunu doğruluyor: fiyatı %25 kırmak hacmi **+%13**
artırıyor. Tur 3 öncesi bu da fiilen ölüydü.

---

## 5. Yeniden kalibrasyon

Talep artık kaçmadığı için kolların geri ödeme eğrisi değişti — ve
**keskinleşti**:

| Mağaza | Ar-Ge (2 merkez) | Pazarlama (2 ofis) |
|---|---|---|
| 4 | 604 gün | 802 gün |
| 6 | 246 gün | 245 gün |
| 8 | 134 gün | **89 gün** |
| 10 | 117 gün | 89 gün |

Bu eğri tasarımın istediği şeyi zaten söylüyor: **önce büyü, sonra
savun.** İki uyarlama yapıldı:

1. **Kartın eşiği ölçüme uyduruldu.** Rekabet kartı eskiden 3 mağazada
   Ar-Ge öneriyordu; o tavsiye artık yanlış olurdu. Eşik **6**'ya çıktı.
   Kartın işi cesaret vermek değil, doğruyu söylemek.
2. **Pazarlama yeniden kalibre edildi** (190 B ₺ / 1.450 ₺ →
   175 B ₺ / 1.050 ₺). Nüfus düzeltmesinden sonra pazarlama Ar-Ge'den
   *yavaş* dönür hale gelmişti ve tasarımın "ucuz, hızlı giriş silahı"
   kararı bozulmuştu. Şimdi 7 mağazadan sonra yeniden Ar-Ge'den hızlı.

Üretim ünitelerinin ve outlet'lerin kalibrasyonuna dokunulmadı; zincirin
geri ödemesi hâlâ **174 gün**.

---

## 6. Yan etki: şehri büyütmek artık bir STRATEJİ

Eskiden her bina şehri büyütüyordu, yani büyüme oyuncunun kararı değildi.
Şimdi nüfusu büyüten şeyler belli: fabrika, depo, plaza, apartman, Ar-Ge.
Mağaza büyütmüyor.

Bu, haritaya yeni bir soru katıyor: *"Bu bölgeyi büyütmek mi istiyorum,
yoksa sadece mevcut talebini almak mı?"* Sanayi bölgesinde 300 günde
6 çiftlik nüfusu **%173** artırıyor, 6 süpermarket ise **%6,2**.

---

## 7. Bilinen sınır

Şehir geneli karşılanmayan talep hâlâ %46 civarında. Sebep artık
"kapasite yetişemiyor" değil, **kapasitenin mekânsal dağılımı**: bir
outlet kendi bölgesine tam, komşulara kısmi erişiyor (0,30 / 0,14). Uzak
bir bölgenin talebine hiç kimse ulaşamıyor.

Bu, oyun için bir sorun değil — tam tersine haritayı anlamlı kılan şey.
Ama "boş talep" sayısını okurken akılda tutulmalı: o rakam bir arıza
değil, coğrafya.
