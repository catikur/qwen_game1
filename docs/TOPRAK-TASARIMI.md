# Tur 7 — Kıt olan para değil toprak · Tasarım Belgesi

> Durum: **teşhis tamam, tavsiye düzeltildi.** Ölçülen sonuçlar §5'te.
>
> Bu tur bir düzeltmeden çok bir **teşhis düzeltmesi**: `DURUM.md` §4.1
> yanlış bir sebebi işaret ediyordu ve §4.5 ondan yanlış bir sonuç
> çıkarmıştı. İkisi de bu belgede düzeltiliyor.

---

## 1. Yanlış teşhis

Tur 3'ten beri açık duran madde şuydu:

> "Oyuncunun sermayesi talebin bileşik büyümesine yetişemiyor ve
> karşılanmayan talep zamanla artıyor."

Bu cümle makul görünüyordu ve benchmark'ın sayıları da onu destekliyordu
(1200. günde doluluk %100, karşılanmayan talep %48). Ama **hiç
sınanmamıştı.** Sınadığımızda yanlış çıktı.

### Kontrollü deney

1200 gün, aynı tohum, tek değişken oyuncunun politikası:

| Politika | Bina | Doluluk | Boş talep | Net değer |
|---|---|---|---|---|
| A · bugünkü bot (5 günde bir, 4 bölge) | 40 | %100 | %45 | 72 M ₺ |
| B · her gün, tüm bölgeler | 76 | %100 | %58 | 99 M ₺ |
| C · geri ödeme sınırı gevşek | 79 | %99 | %51 | 63 M ₺ |
| **D · sermaye SINIRSIZ** | 94 | %100 | **%52** | 5,00 Mr ₺ |

**Sermaye sınırsız olduğunda bile karşılanmayan talep %52'de kalıyor.**
Para kısıt değil.

### Asıl kısıt

Deneme başına "neden inşa edilemedi" sayacı tek bir cevap veriyor:

| Politika | Kuruldu | **Parsel yok** | Pahalı | Geri ödeme yavaş |
|---|---|---|---|---|
| A | 40 | **200** | 0 | 0 |
| D | 94 | **1167** | 0 | 0 |

1200 denemenin 1167'sinde boş parsel yok. Haritada 285 parsel var ama
yalnızca **108'i başlangıçta boş**; kalan 177'si bir yapının altında ve
ancak sahibinden devralınarak alınıyor. Agresif politikalarda her bölge
**0 boş parsel** ile bitiyor.

---

## 2. Asıl kök sebep: tavsiye yanlış sütuna bakıyor

Toprak kıtsa doğru soru "param ne zaman geri döner" değil, **"bu
parselden en çok ne çıkar"**. Bir bina bir parsel kapladığı için bu
sorunun cevabı tam olarak `dailyProfit`.

Aynı bölgede bütün outlet'ler, oyuncunun gördüğü tahminle:

| Bina | Kapasite | Maliyet | Geri ödeme | Günlük kâr (parsel getirisi) |
|---|---|---|---|---|
| Elektronik Mağazası | 34 | 96 B ₺ | **17 gün** | ~5,6 B ₺ |
| Bakkal | 220 | 31 B ₺ | 21 gün | ~1,5 B ₺ |
| Kafe | 160 | 116 B ₺ | 30 gün | ~3,9 B ₺ |
| Süpermarket | 1400 | 316 B ₺ | 34 gün | ~9,3 B ₺ |
| Mağazalar Zinciri | 620 | 1,23 M ₺ | 39 gün | **~32 B ₺** |

**Geri ödeme 17–41 gün aralığında neredeyse düz, ama parsel başına
kapasite 34 ile 1400 arasında — 41 kat fark.** Geri ödemeye göre seçen
oyuncu kıt parselleri en verimsiz binalara harcıyor, sonra da şehri
dolduramıyor.

Bu bir formül hatası değil: iki sayı da doğru hesaplanıyordu. Oyun
sadece **yanlış olanı öne çıkarıyordu.**

---

## 3. Düzeltme

### 3.1 Yapı menüsü parsel getirisine göre sıralanıyor

`rankedBuildOptions(state, districtId)` seçenekleri günlük kâra göre
sıralıyor ve en iyisini işaretliyor. İki ek kural:

- **İnşa edilebilir seçenekler önce.** Listenin tepesinde bugün
  dokunamayacağın bir bina durması tavsiye değil, hayal kırıklığı.
- **Bölgede kaç parsel kaldığı yazıyor.** Sıralamanın neden getiriye
  göre olduğunu açıklayan bilgi bu; 4'ün altına inince uyarı rengine
  geçiyor, sıfırlanınca devralmayı öneriyor.

Geri ödeme kaldırılmadı — hâlâ kartta duruyor. Paranın ne zaman
döneceği önemli, sadece belirleyici değil.

### 3.2 Ölçüm botları da aynı ölçüte geçti

`balance.ts` ve `benchmark.ts` içindeki "önerilen oynanış" vekili artık
günlük kâra göre seçiyor. Bu şart: vekil oyunun tavsiyesini temsil
ediyor, tavsiye değişince o da değişmeli — yoksa ölçüm eski tavsiyeyi
ölçmeye devam ederdi.

Geri ödeme sınırı (150 gün) eleme filtresi olarak duruyor; seçimi artık
o yapmıyor.

---

## 4. Yol boyunca çıkan iki test hatası

**Temettü korunum kontrolü şans eseri geçiyormuş.** İddia "şehir geneli
nakit değişimi = günlük kâr toplamı" ve bu yalnızca o gün SERMAYE
hareketi olmadığında doğru: bir rakibin arsa alması nakdi varlığa
çevirir, kârda görünmez. Kontrol bunu garanti etmiyordu; bot değişince
rakipler farklı davrandı ve identite kırıldı. Ölçülen gün artık izole
ediliyor (rakip genişlemesi ve ihale kapatılıyor).

**`buildOptions` sıralama kontrolünün aritmetiği yanlıştı.** Dolaylı
faydalı binalar (depo, Ar-Ge, pazarlama) "ulaşılabilir" ama "doğrudan
getirili" değil; ikisini karıştıran bir sayım kontrolü hatalı kırmızı
yakıyordu.

---

## 5. Ölçülen sonuçlar

Tek değişken: sıralama ölçütü. Aynı tempo, aynı nakit disiplini.

### Kontrollü deney (1200 gün, tohum 7)

| | Geri ödemeye göre | **Günlük kâra göre** |
|---|---|---|
| Bina | 40 | 40 |
| Karşılanmayan talep | %45 | **%34** |
| Kapasite / talep | 0,56 | **0,68** |
| Oyuncu net değeri | 72 M ₺ | **196 M ₺** |

### Benchmark (3 tohum)

| | Önce | Sonra |
|---|---|---|
| Karşılanmayan talep · 360. gün | %35 | **%20** |
| Karşılanmayan talep · 700. gün | %38 | **%34** |
| Karşılanmayan talep · 1200. gün | %48 | **%33** |
| Oyuncu / rakip oranı | 0,76 | **1,28** |
| Oyuncu bina sayısı | 48 | 52 |

Oyuncu artık rakipleri geçiyor — çünkü oyunun kendi tavsiyesi artık
oyuncuyu tuzağa sokmuyor.

---

## 6. Kalan yapısal sorun: harita %100 abone

Doygunluk tamamen çözülmedi ve sebebi artık ölçülü:

Nüfus tavanındaki (arketip × 2,6) talebi karşılamak için, her kategoride
**en büyük** outlet kullanılsa bile **284 parsel** gerekiyor. Haritada
**285** parsel var.

Yani şehir ancak parsellerinin neredeyse tamamı outlet olursa doyar ve
geriye fabrikaya, depoya, Ar-Ge'ye, pazarlamaya ve **dört rakibe** hiç
yer kalmaz. Karşılanmayan talebin sıfıra inememesinin sebebi bu.

Bu sayı denge testinde bir kontrol olarak duruyor (`abonman %100`), yani
sessizce kötüleşemez.

### §4.5'in düzeltilmesi

Önceki tur şu sonuca varmıştı: *"harita 2,9 katına çıktığında şehir
yalnızca 6 bina büyüdü, demek ki kısıt harita değil sermaye."*

**Bu çıkarım yanlıştı ve sebebi ölçümün kendisiydi.** O deney 360 günde
ve 5 günde bir tek bina kuran botla yapılmıştı — yani bot-sınırlıydı,
toprak-sınırlı değil. 1200 günlük ve sınırsız sermayeli ölçüm tersini
gösteriyor: kısıt toprak.

**Haritayı büyütmek artık doğru sıradaki iş.** Teknik maliyeti zaten
ölçülmüştü (harita boyutu tamamen `DISTRICT_LAYOUT`'tan türetiliyor,
simülasyon %20 yavaşlıyor, çizim çağrısı değişmiyor).

---

## 7. Yöntem notu

Bu tur, projedeki en pahalı hatanın tekrarıydı: **makul görünen bir
sebebin hiç sınanmadan kaydedilmesi.** §4.1 dört tur boyunca "sermaye
yetişemiyor" diye duruyordu ve tek bir kontrollü deney onu çürüttü.

Ölçüm tasarımının kendisi de suçluydu: benchmark'ın botu 5 günde bir tek
bina kuruyor, yalnızca dört bölgeye bakıyor ve geri ödemeye göre
seçiyordu. Bu botun ürettiği sayı "oyunun davranışı" diye okundu. Bir
ölçüm aracının kısıtları, ölçtüğü şeyin özelliği sanılırsa yanlış sonuç
kaçınılmaz.

Kural olarak: **bir sebebi kaydetmeden önce onu değiştirip ne olduğuna
bak.** Sermayeyi sonsuz yaptığımızda hiçbir şey değişmedi — cevap
oradaydı.
