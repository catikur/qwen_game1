# Tur 4 — Borsa · Tasarım Belgesi

> Durum: **kodlandı (A, B, C).** §7'deki iş sırasına bakın.
>
> Tur 1 maliyeti, Tur 2 rekabeti, Tur 3 dengeyi verdi. Tur 4, Capitalism'i
> Capitalism yapan şeyi ekliyor: **rakibini pazarda değil, sahiplikte
> yenmek.**

---

## 1. Problem

Bugün rakibini yenmenin tek yolu onu pazarda geçmek. Bu yeterli bir tycoon
oyunu ama türün asıl vaadi başka: *"Meridyen Grup benden iyi bir zincir
kurdu. O zaman Meridyen Grup'u satın alırım."*

Bunun bugün hiçbir karşılığı yok. Şirketler kapalı kutular: değerleri
`netWorth` diye bir sayı, sahibi tek bir oyuncu, ve el değiştirmiyorlar.

### Neyi eklemiyoruz, neden

| Aday | Neden bu turda değil |
|---|---|
| Gerçek zamanlı emir defteri (alış/satış kuyruğu) | Tek tıkla anlaşılmıyor; casual sözünü doğrudan çiğner |
| Tahvil, opsiyon, kaldıraçlı işlem | Borsa daha oturmadan ikinci bir finans katmanı |
| Rakiplerin oyuncunun hissesini toplaması | Turun sonunda değerlendirilecek — önce oyuncu tarafı dursun (§6.3) |

---

## 2. Model

### 2.1 Hisse ve fiyat

Her şirket **10.000 hisseye** bölünür. Fiyat türetilir, state'te tutulmaz:

```
piyasa değeri = netWorth × güven
hisse fiyatı  = piyasa değeri / 10.000
```

`güven` (0,6–1,8) şirketin son 90 günlük kâr eğilimine bakar:

```
güven = clamp(0,6 ; 1,8 ; 1 + normalize(günlük kâr / net değer) × 3)
```

Böylece **büyüyen şirket defter değerinin üstünde, eriyen şirket altında
işlem görür.** Oyuncu için okunabilir bir sinyal: ucuz hisse ya fırsattır
ya tuzak.

> Fiyatın türetilmiş olması bir mimari tercih: `chain.ts`, `competition.ts`
> ve `routes.ts` gibi bu da state'e yazmaz. Kaydedilen tek şey **kimin
> kaç hissesi olduğu**.

### 2.2 Sahiplik

```ts
shares: Record<string, number>;   // şirket kimliği → hisse adedi
```

Başlangıçta her şirket kendi hisselerinin tamamına sahiptir (10.000). Bir
şirketin hisselerini almak `cash` ile olur; satmak `cash`e döner.

**Net değer çift sayılmaz.** Bir şirketin `netWorth` değeri artık
sahiplik payına göre düzeltilir:

```
gerçek net değer = kendi varlıkları + Σ (başka şirketteki pay × o şirketin piyasa değeri)
```

Bu, Tur 1'in denge kimliğiyle aynı disiplin: hiç hisse almayan oyuncunun
net değeri bugünküyle **birebir aynı** kalır.

### 2.3 Devralma

Bir şirketin **%50'sini** geçen taraf onu devralır:

- Devralınan şirketin bütün binaları ve parselleri devralanın olur.
- Devralınan şirket **oyundan çıkar** (haber akışında ilan edilir).
- Kalan azınlık hisseleri, devralma anındaki fiyattan nakde çevrilir —
  yani azınlık hissedar mağdur olmaz.

Neden %50 ve neden anında: kademeli kontrol (yönetim kurulu, oy hakkı)
daha zengin olurdu ama tek bir eşik, tek bir sonuç okunabilir. Oyuncu
"ne kadar daha almam lazım" sorusunu tek sayıya bakarak cevaplayabilmeli.

### 2.4 Temettü

Şirket günlük kârının bir kısmını hissedarlarına dağıtır:

```
temettü = max(0 ; günlük kâr) × 0,25
```

Bu, azınlık hissesini **kendi başına bir yatırım** yapıyor: devralmayacak
kadar az hisse de para kazandırır. Yoksa borsa yalnızca bir devralma
düğmesi olurdu.

---

## 3. Neden bu, oyuna ne katıyor

**Kazanmanın ikinci yolu.** Pazarda yenemediğin rakibi sahiplikte
yenebilirsin. Kalite avcısı Meridyen sana kaliteyle üstün geliyorsa,
onunla kalite yarışına girmek yerine hisselerini toplayabilirsin.

**Nakit artık atıl kalmıyor.** Bugün oyunun geç safhasında nakit birikiyor
ve yapacak bir şey kalmıyor (harness'ta 400. günde 20 M ₺ nakit
görülüyor). Hisse, nakde ikinci bir kullanım veriyor.

**Rakibin başarısı sana da kazandırıyor.** Bir rakibin %20'sine sahipsen
onun büyümesi senin net değerini de büyütür. Bu, "rakip güçlenirse ben
kaybederim" ilişkisini kırıyor ve tahtayı okumayı ödüllendiriyor.

---

## 4. Riskler ve karşılıkları

| Risk | Karşılık |
|---|---|
| **Sonsuz döngü**: A, B'nin hissesini alır; B'nin değeri A'yı içerir | Karşılıklı sahiplik değerlemede **tek kademe** çözülür; ikinci kademe defter değerinden sayılır |
| **Nakit sarmalı**: temettü + hisse değeri artışı oyunu kolaylaştırır | Temettü kârın yalnızca %25'i; ayrıca hisse alımı nakdi bağlar, işletmeye harcanamaz |
| **Devralma oyunu bitirir**: tek rakip kalınca rekabet ölür | Devralınan şirketin yerine yenisi gelmez, ama devralma **pahalıdır** (§5) ve şehirdeki rekabet parsel bazında sürer |
| **UI şişmesi** | Tek panel: rakip listesi + hisse satırı. Zincir ve rekabet kartlarıyla aynı dil |

---

## 5. Kalibrasyon hedefi

| Ölçüt | Hedef |
|---|---|
| Bir rakibin %50'sini almanın maliyeti | O rakibin net değerinin **%50–90'ı** (güvene göre) |
| Devralmanın geri ödemesi | 250–400 gün — zincirden ve koldan yavaş |
| Temettü getirisi | Yıllık **%5–12** (hisse fiyatına göre) |
| Hiç hisse almayan oyuncunun ekonomisi | Tur 3 ile **birebir aynı** |

Son satır Tur 1 ve 2'deki kimlik kısıtının aynısı ve harness her koşuda
doğrulayacak.

---

## 6. Karara açık üç nokta

### 6.1 Hisse fiyatı türetilmiş, simüle edilmiş değil

**Seçilen:** türetilmiş. Alternatif, arz-talebe göre hareket eden gerçek
bir fiyat olurdu; daha canlı ama oyuncunun kontrol edemediği bir gürültü
katmanı ekler ve "neden düştü" sorusunun cevabı olmaz. Türetilmiş fiyat
her zaman açıklanabilir: değer × güven.

### 6.2 Devralma eşiği %50, kademeli kontrol yok

**Seçilen:** tek eşik. Kademeli kontrol (%25 blokaj, %50 kontrol, %75 tam)
daha zengin ama üç ayrı kuralı da anlatmak gerekir. Tek eşik tek cümleyle
anlatılıyor.

### 6.3 Rakipler oyuncunun hissesini toplamıyor — şimdilik

**Seçilen:** tek yönlü başla. İki yönlü devralma daha adil ama oyuncunun
haberi olmadan oyunu kaybetmesi anlamına gelebilir; önce oyuncu tarafı
oturmalı, sonra rakipler açılır. Bu, turun sonunda ölçümle
değerlendirilecek bir karar — kalıcı bir tasarım kararı değil.

---

## 7. İş sırası

| # | Parça | Çıktı | Doğrulama |
|---|---|---|---|
| A | `shares`, hisse fiyatı, net değer düzeltmesi, temettü, şema v6 | motor katmanı | denge kimliği + temettü getirisi |
| B | Borsa paneli: rakip listesi, fiyat, güven, al/sat, devralma göstergesi | oyuncunun gördüğü katman | harness + playtest |
| C | Devralma: eşik, varlık devri, azınlık nakde çevirme, haber | oyunun ikinci kazanma yolu | devralma tutarlı, kaçak yok |

Üçü de **bitti**.

---

## 8. Ölçülen sonuçlar

`packages/core/test/balance.ts` her koşuda doğruluyor:

| Kontrol | Sonuç |
|---|---|
| Denge kimliği: hisse alınmadıysa portföy değeri | tam **0** |
| Değerleme tutarlılığı | `piyasa değeri = defter × güven`, sapma < 1 ₺ |
| Hisse fiyatı | piyasa değerinin tam 1/10.000'i |
| Temettü para yaratıyor mu | **hayır** — şehir geneli nakit değişimi = günlük kâr, sapma 0 ₺ |
| Devralma | 35 bina ve 35 parsel el değiştiriyor, ölü şirketin hissesi kimsede kalmıyor |
| Azınlık hissedar | payı nakde çevriliyor (+1,02 M ₺) |
| Devralma bedava mı | **hayır** — %51'in maliyeti hedefin net değerinin **0,92 katı** |
| Güven şirketleri ayırıyor mu | yayılım **0,70** (1,10 · 1,21 · 1,65 · 1,78 · 1,80) |
| Zarar eden şirket | defter değerinin **altında** işlem görüyor |

### Kalibrasyon: güven bir kez ölmüştü

İlk sürümde referans günlük getiri 0,004 seçilmişti. Sağlıklı bir
şirketin günlük getirisi zaten %0,5–1,1 olduğu için **dört rakipten üçü
tavana (×1,80) yapışıyordu** — ekranda hepsi aynı görünüyordu.

Güvenin tek işi şirketleri birbirinden ayırmak; ayıramıyorsa hisse
fiyatı bir bilgi taşımıyor demektir. Referans 0,012'ye, eğim 0,4'ten
0,8'e çıkarıldı. Aynı hatayı bir kez de parsel ihalesinin
değerlemesinde yapmıştık (bkz. `REKABET-TASARIMI.md` §9, D parçası):
bir sayı her nesne için aynı çıkıyorsa o sayı ölçüm değil süstür.

Tarayıcı testleri (`tools/playtest.mjs`): **105/105**, 0 konsol hatası.
