# Tur 2 — Kalite, Marka ve Toprak · Tasarım Belgesi

> Durum: **Tur 2 tamamlandı (A–D)**. §9'daki iş sırasına bakın.
>
> Tur 1 (`ZINCIR-TASARIMI.md`) satılan şeyin bir maliyeti olmasını sağladı.
> Tur 2 aynı rafta duran iki şirketten hangisinin kazanacağı sorusuna
> cevap veriyor: **fiyat tek silah olmaktan çıkıyor.**
>
> ⚠️ Bu belgenin ilk hali kaliteyi yalnızca **paya** bağlıyordu. Ölçüm o
> varsayımı çürüttü ve model değişti — bkz. §3.4. Eski gerekçe silinmedi,
> üstü çizilerek bırakıldı; yanlış çıkan bir tasarım kararı da kayıttır.

---

## 1. Problem

Tur 1'den sonra oyunda şu doğru: bir ürünün maliyeti var, o maliyetin bir
zinciri var, zinciri kuran ucuza satabiliyor. Ama rekabetin tamamı hâlâ
**iki değişkene** sıkışmış:

1. Kaç dükkânın var (kapasite),
2. Kaça satıyorsun (fiyat).

Motorun çekicilik formülü aslında dört değişken taşıyor:

```
çekicilik = kalite^1,15  ×  marka  ×  (1/fiyat)^esneklik  ×  erişim
```

Bunlardan **kalite bir bina sabiti** (`def.quality`), **marka ise pazar
payının gecikmeli aynası**. Yani ikisi de oyuncunun dokunamadığı,
kendiliğinden olan şeyler. Oyuncunun elinde sadece fiyat var — o da
varsayılan olarak otomatik.

Sonuç: iki şirket aynı bölgede aynı ürünü satarken kazanan, daha çok
mağaza açan. Bu bir tycoon oyunu için yeterli, bir **capitalism** oyunu
için değil. Türün kimliği tam olarak şurada: *aynı ürünü satan iki şirket
farklı şeyler yaparak kazanabilmeli.*

### Neyi eklemiyoruz, neden

| Aday | Neden bu turda değil |
|---|---|
| Borsa, halka arz, rakip hisse toplama | Capitalism'in imzası ama tek başına bir tur; kalite/marka olmadan "neden bu şirketi alayım" sorusunun cevabı yok |
| Ürün başına ayrı kalite eğrisi | 22 ürün × 5 şirket = okunamaz tablo; kategori düzeyi kararı aynı derecede zengin |
| Personel, moral, eğitim | Ücret zaten gider kaleminde; ayrı bir kaynak yönetimi katmanı casual sözünü bozar |

---

## 2. Model — üç kol, üç farklı zamanlama

Tur 2 üç şey ekliyor ve üçü **bilinçli olarak farklı hızlarda** çalışıyor.
Aynı hızda olsalardı üçü de "para bas, çarpan al" olurdu.

| Kol | Ne yapar | Ne kadar sürer | Ne zaman güçlü |
|---|---|---|---|
| **Ar-Ge** | Kategorideki kaliteni kalıcı olarak yükseltir | Yavaş (aylar) | Pazar **çekişmeli** olduğunda |
| **Pazarlama** | Markanı payının hak ettiğinden yukarı iter | Orta | Payın **düşük** olduğunda |
| **İhale** | Parseli en çok ödeyene verir | Anlık | Bölge **dolduğunda** |

Bu üçlü, oyuna Tur 1'in vermediği şeyi veriyor: **rakibin ne yaptığına
göre farklı cevap vermek.** Ucuz satan bir rakibe karşı fiyat kırmak
intihar; ona karşı kalite açman gerekir. Markası devasa bir rakibe karşı
kalite açmak yavaş; ona karşı ihalede önünü kesmek gerekir.

---

## 3. Ar-Ge — kalite kolu

### 3.1 Neden bina, neden dial değil

Kalite yatırımını "günde şu kadar ₺ harca" şeklinde bir kaydırıcı olarak
da yapabilirdik. Bina olarak yapıyoruz çünkü:

- Oyunun bütün kararları zaten haritada geçiyor: parsel al → bina kur →
  bir şey olur. Kaydırıcı bu döngünün dışında duran ikinci bir dil olurdu.
- Bina, **parsel rekabetine** giriyor. "Bu parsele bir mağaza mı, bir
  Ar-Ge merkezi mi?" sorusu, kaydırıcının asla soramayacağı bir soru.
- Rakip de aynı binayı kuruyor ve sen onu haritada **görüyorsun**. Bir
  kaydırıcı görünmez olurdu; doktrin okunamazdı.

### 3.2 Kurallar

**Ar-Ge Merkezi** (`role: 'research'`) bir kategoriye atanır. Atama
`SET_FOCUS` komutuyla değişir — raf düzenleyicisiyle aynı arayüz dili.

Kategori başına birikmiş kalite primi `company.research[category]`, her
gün tavanına doğru ilerler:

```
tavan     = min(0,30 ; 0,12 × o kategoriye atanmış merkez sayısı)
ilerleme  = (tavan − mevcut) × 0,025      // günde kalan farkın %2,5'i
```

- Bir merkez: **+0,12** tavan, %90'ına ~92 günde varılır.
- İki merkez: +0,24. Üç ve üzeri: 0,30'da sabit — üçüncü merkez yalnızca
  +0,06 katar, dördüncü hiçbir şey. **Azalan verim açıkça görünsün** diye
  tavan sert; oyuncu "beşinci merkezi de kurayım" tuzağına düşmesin.
- Merkez yıkılırsa tavan düşer ve birikim **geri erir** (aynı %2,5 hızla).
  Kalite kiralanır, satın alınmaz.

Çekicilik formülünde:

```
kalite = clamp(0,05 ; 1 ; def.quality + ceoPrimi + research[kategori])
```

### 3.3 Ne kadar değer: sayılarla

Tipik bir market outlet'inin `def.quality` değeri 0,55. Bir Ar-Ge merkezi
onu 0,67'ye çıkarır:

```
(0,67 / 0,55)^1,15  =  1,235
```

Yani **%23,5 daha çekici**. İki şirketin eşit yarıştığı bir bölgede pay
%50 → **%55**. Marjinal görünüyor ama kategorideki **her** outlet'ine
aynı anda uygulanıyor — değeri outlet sayınla doğru orantılı.

### 3.4 Ölçümün çürüttüğü varsayım — ve modelin ikinci kanalı

> ~~**Ar-Ge, boş pazarda değersizdir.** Pay zaten karşılanmamış talepten
> geliyorsa kaliteyi yükseltmek sana hiçbir ek birim getirmez. Ar-Ge
> yalnızca rakipten pay almak için işe yarar; doğal bir "önce büyü, sonra
> savun" sıralaması oluşuyor.~~

Bu doğruydu ama **sonucu bu oyunda felaketti.** A parçasını kodladıktan
sonra kontrollü bir ölçüm yaptık: aynı tohum, aynı bölgeler, iki tarafta
eşit sayıda süpermarket, tek fark oyuncunun Ar-Ge merkezleri.

| Taraf başına süpermarket | Boş talep | Tam Ar-Ge priminin hacme katkısı |
|---|---|---|
| 4 | %60 | **%0,0** |
| 8 | %48 | **%0,0** |
| 12 | %33 | %0,6 |
| 16 | %24 | %0,8 |
| 20 | %19 | %3,4 |

Sebep: bu şehirde **talep kronik olarak kapasiteyi aşıyor.** Herkes zaten
kapasitesinin tamamını satıyor, yani çekicilik formülü hiç devreye
girmiyor — pay yarışı diye bir şey yaşanmıyor. Şehre kırk süpermarket
dikildiğinde bile kalitenin karşılığı %3,4.

Yani "kalite paya döner" tasarımı, oyuncunun **fark bile edemeyeceği** bir
mekanik anlamına geliyordu.

**Çözüm: ikinci bir ödeme kanalı.** Arz-kıt bir pazarda kalitenin gerçek
karşılığı zaten hacim değil **fiyattır** — malın kapış kapış gidiyorsa,
daha iyi olanı daha pahalıya satarsın. Otomatik fiyatlama formülüne
şirketin "prim gücü" (`Ar-Ge primi + pazarlama kaldıracı`) eklendi ve
**kıtlıkla çarpıldı**:

```
prim gücü = research[kategori] + pazarlamaKaldıracı        // kolsuzken 0
kıtlık    = 1 + boşTalep × 0,5 × (1 + primGücü × 1,8)
tavan     = 1,40 + primGücü × 0,30
```

Sonuç, tek mekaniğin pazarın durumuna göre iki farklı ödeme biçimi:

| Pazar | Ne oluyor | Ölçülen |
|---|---|---|
| **Arz-kıt** (boş talep %60) | Kalite fiyata döner | Fiyat ×1,13 → ×1,25, kâr **+%10**, hacim %0,0 |
| **Doymuş** (boş talep %17) | Kalite paya döner | Hacim **+%4,2** |

`primGücü = 0` olduğunda formül Tur 1'deki haline birebir indirgeniyor,
yani denge kimliği bozulmuyor (§5).

**Bilinen sadeleştirme:** prim gücü yalnızca Ar-Ge ve pazarlamadan
geliyor; binanın taban kalitesi (`def.quality`) fiyata dönmüyor. Yani bir
süpermarket, bir bakkaldan daha kaliteli olmasına rağmen aynı fiyattan
satıyor. Genel model daha doğru olurdu ama Tur 1'in bütün kalibrasyonunu
yeniden yapmayı gerektirirdi; bu turun kapsamı değil.

**Ar-Ge, ölçekle birlikte ucuzlar.** Sabit gideri var, faydası outlet
sayınla çarpılıyor. Tek mağazalı bir oyuncu için hiç dönmüyor; dört
mağazalı için 225 gün. Zincir Tur 1'de aynı özelliği taşıyordu ("henüz
erken" uyarısı); tutarlılık kasıtlı.

### 3.5 Kalibrasyon — hedef ve ölçülen

| Ölçüt | Hedef | Ölçülen |
|---|---|---|
| 1 outlet'li kategoride geri ödeme | kâr etmemeli | **hiç dönmüyor** |
| 4 outlet'li kategoride | 200–260 gün | **225 gün** |
| Zincirden yavaş mı (bant 170–174) | evet | evet |

Bu banda ulaşmak için ilk seçilen değerler (280 B ₺ yerine 240 B ₺,
860 ₺ yerine 640 ₺) 164 gün veriyordu — yani zincirden bile hızlı.
Ar-Ge sabırlı sermayenin işi olmalı.

---

## 4. Pazarlama — marka kolu

### 4.1 Bugün marka nedir

```
hedef  = min(1 ; pay × 1,15)
marka += (hedef − marka) × 0,035 × ceoPazarlama
```

Yani marka **payın gecikmeli aynası**. Bu, zengini daha zengin yapan bir
döngü: payı büyük olanın markası büyür, markası büyük olanın payı büyür.
Küçük oyuncunun bu döngüye girecek bir kapısı yok.

### 4.2 Pazarlama Ofisi

**Pazarlama Ofisi** (`role: 'marketing'`) da bir kategoriye atanır ve
marka **hedefini** yukarı iter:

```
kaldıraç = min(0,35 ; 0,15 × o kategoriye atanmış ofis sayısı)
hedef    = min(1 ; pay × 1,15 + kaldıraç)
```

Ofis yıkılırsa kaldıraç düşer ve marka aynı hızla geri iner.

### 4.3 Ar-Ge'nin tam tersi bir asimetri

Marka çekiciliğe `0,45 + 0,55 × marka` olarak giriyor. Bu doğrusal ifade,
kaldıracın **düşük markada daha çok işe yaraması** demek:

| Durum | Kaldıraçsız marka | Kaldıraçlı | Çekicilik kazancı |
|---|---|---|---|
| Payın %10 | 0,115 | 0,465 | **+%37** |
| Payın %60 | 0,69 | 1,00 (tavan) | +%21 |

Yani **pazarlama giriş silahı, Ar-Ge savunma silahı.** İkisi de
"çekiciliği artır" diyor ama biri seni pazara sokuyor, öteki pazarda
tutuyor. Bu asimetri de formülden çıkıyor, elle kurulmuyor.

### 4.4 Neden marka tavanı 1,0'da bırakılmıyor da kaldıraç 0,35'te durduruluyor

Kaldıraç sınırsız olsaydı, tek doğru strateji "her kategoriye üç ofis"
olurdu ve pazarlama fiyatın yerine geçen ikinci bir tek-silah haline
gelirdi. 0,35, hiç payı olmayan bir oyuncuyu bile yarışa sokmaya yetiyor
ama liderin yerini tek başına almaya yetmiyor.

### 4.5 Kalibrasyon — ağırlık işletme giderinde

| Ölçüt | Hedef | Ölçülen |
|---|---|---|
| 4 outlet'li kategoride geri ödeme | Ar-Ge'den hızlı, mağazadan yavaş | **124 gün** |
| Ar-Ge (225 gün) ile karşılaştırma | daha hızlı | evet |
| En iyi outlet (60–110 gün) ile | daha yavaş | evet |

İlk denemede (168 B ₺ / 520 ₺) **68 gün**de dönüyordu — en iyi mağazadan
bile hızlı, yani düşünmeden kurulacak bir bina. Ağırlık bilinçli olarak
maliyete değil **işletme giderine** verildi (190 B ₺ / 1.450 ₺): reklam
gerçek hayatta da tek seferlik bir yatırım değil sürekli bir giderdir,
kesersen etkisi biter. Bu, §10.2'deki "kalite kiralanır, satın alınmaz"
kararının pazarlamadaki karşılığı.

---

## 5. Denge kimliği (Tur 1'deki kısıtın aynısı)

> **Hiç Ar-Ge merkezi ve pazarlama ofisi kurmayan bir oyuncunun ekonomisi
> Tur 1 ile BİREBİR aynı kalır.**

`research[kategori] = 0` ve `kaldıraç = 0` olduğunda her iki formül de
bugünkü haline indirgeniyor — ikisi de **toplamsal** ve tabanları sıfır.
Bu kısıt sayesinde:

- Mevcut kalibrasyon (60–110 gün outlet, 170–174 gün zincir) geçerli kalır.
- Yeni katman "her şeyi yeniden dengele" borcu getirmez.
- Harness bunu her koşuda doğrular: aynı tohum, Ar-Ge'siz oyuncu →
  Tur 1'in sonucuyla aynı sayı.

---

## 6. Rakip doktrinleri

Rakipler bugün kişiliklerini dört yerde gösteriyor: hangi fırsatı seçtiği,
nereye girdiği, fiyatı nasıl kurduğu, zincire ne kadar meyilli olduğu.
Tur 2 buna iki kol daha ekliyor — ve **asıl kazanç kişiliklerin birbirinden
ayrışması**:

| Doktrin | trait | Zincir | Ar-Ge | Pazarlama | Oyuncu bunu nasıl okur |
|---|---|---|---|---|---|
| **Ucuzcu** | `price_cutter` | 1,4 | 0,2 | 0,4 | Fiyatı kırar, maliyeti zincirle düşürür. Fiyatla yenilmez; **kaliteyle** yenilir |
| **Kalite avcısı** | `premium` | 0,8 | 1,5 | 1,0 | Ar-Ge'ye yatırır, pahalı satar. Kaliteyle yenilmez; **fiyatla ve erişimle** yenilir |
| **Yayılmacı** | `expansionist` | 1,0 | 0,7 | 1,3 | Her yere girer, markayla tutunur. **İhalede** durdurulur |
| **Teknoloji** | `tech` | 0,9 | 1,3 | 0,8 | Elektronikte yoğunlaşır; dar ama derin |
| **Toprak ağası** | `landlord` | 0,2 | 0,1 | 0,2 | Parsel toplar, kira alır. Tüketici pazarında rakip değil, **arazi rakibi** |

Her doktrinin bir **karşı hamlesi** var ve tablodaki son sütun onu
söylüyor. Bu, "rakip zorlaştı" ile "rakip anlaşılır oldu" arasındaki fark.

Doktrin hamleleri haber akışına düşer (`pushNews`): *"Meridyen Grup
Yeme-İçme kategorisinde Ar-Ge merkezi açtı."* Oyuncu rakibin ne yaptığını
tablo açmadan, akıştan öğreniyor.

---

## 7. Parsel ihalesi

### 7.1 Problem

Bugün parsel alımı **ilk gelen alır**. Rakip haftada bir karar veriyor,
oyuncu istediği an alabiliyor; yani oyuncu her zaman kazanıyor ve arazi
hiç çekişmiyor. Bölge dolduğunda tek çıkış "devralma" (buyout) — o da
sabit çarpanlı, pazarlıksız.

### 7.2 Kurallar

Belediye periyodik olarak (varsayılan **her 30 günde bir**) bir parseli
ihaleye çıkarır. Seçim rastgele değil: **en çok gelişmiş bölgedeki en
değerli boş parsel**. Yani ihale her zaman gerçekten istenen bir yer için
oluyor.

- İhale **3 oyun günü** sürer. Üstteki olay çipi geri sayar.
- Taban fiyat = `tilePrice` (bugünkü fiyatın aynısı).
- Rakipler kendi değerlemelerine göre teklif verir: o parselde
  kurabilecekleri en iyi binanın `estimateInvestment` çıktısından türeyen
  bir üst sınır. Yani rakip asla "kızgınlıktan" fazla ödemez — oyuncuya
  gösterilen matematiğin aynısını kullanır.
- Oyuncu teklif verir, artırabilir. En yüksek teklif kazanır ve **kendi
  teklifini öder** (birinci fiyat).
- Kimse teklif vermezse parsel normal satışa döner.

### 7.3 Neden birinci fiyat, neden kapalı zarf değil

Kapalı zarf (herkes bir kez teklif verir, en yüksek kazanır) daha az
tıklama ister ama oyuncuya **geri bildirim vermez**: kaybettiğinde neden
kaybettiğini bilmez. Açık artırma, rakibin değerlemesini oyuncuya
öğretiyor: "Nova bu parsele 480 B ₺ dedi, demek burada bir şey görüyor."
Bu, bir sayı tablosu vermeden rakibin kafasının içini göstermenin en ucuz
yolu.

### 7.4 Risk

İhale, oyunun akışını **kesen** ilk mekanik. 30 günde bir modal açılması
casual sözünü zedeleyebilir. Bu yüzden:

- İhale **duraklatmaz**; üstte bir çip olarak durur, oyuncu ilgilenmezse
  kendiliğinden sonuçlanır.
- Ayarlarda kapatılabilir (`flags.landAuctions`), tıpkı `randomEvents`
  gibi.

---

## 8. Şema değişikliği (v3 → v4)

```ts
export interface CompanyState {
  /** Kategori bazlı birikmiş Ar-Ge kalite primi 0..0,30. */
  research: Record<CategoryId, number>;
}

export interface BuildingInstance {
  /** research/marketing binasının atandığı kategori; diğerlerinde null. */
  focus: CategoryId | null;
}

export interface GameState {
  /** Açık ihale; yoksa null. */
  auction: AuctionState | null;
}

export interface AuctionState {
  tileId: number;
  endsOnDay: number;
  /** Şu anki en yüksek teklif ve sahibi. */
  bid: number;
  bidderId: string | null;
  /** Taban fiyat — kimse teklif vermezse iptal. */
  reserve: number;
}
```

Pazarlama kaldıracı **türetilmiş**: binalardan her gün hesaplanıyor,
state'te tutulmuyor. Ar-Ge primi birikimli olduğu için state'te duruyor.

Göç (`v3 → v4`): `research` sıfırlarla, `focus` null, `auction` null.
`flags.landAuctions` varsayılan `true`.

---

## 9. İş sırası

| # | Parça | Çıktı | Doğrulama | Durum |
|---|---|---|---|---|
| A | `research`/`marketing` rolleri, `SET_FOCUS`, kalite/marka/fiyat formülleri, şema v4 | motor katmanı, UI yok | denge kimliği + iki kanal A/B + kalibrasyon | **bitti** |
| B | Rekabet kartı: kategoride sen vs lider (kalite, marka, fiyat), Ar-Ge/pazarlama atama arayüzü | oyuncunun gördüğü katman | harness + playtest | **bitti** |
| C | Rakip doktrinleri: Ar-Ge ve pazarlama iştahı, haber akışı | rekabet | her doktrin ayrışıyor; hiçbiri batmıyor | **bitti** |
| D | Parsel ihalesi | arazi çekişmesi | rakip değerlemesi tutarlı; oyuncu kaybedebiliyor | **bitti** |

### A parçasının ölçülen sonuçları

`packages/core/test/balance.ts` her koşuda bunları doğruluyor (108 kontrol):

| Kontrol | Sonuç |
|---|---|
| Denge kimliği: kol yokken prim ve kaldıraç | tam **0** — Tur 1 çıktısının tamamı birebir aynı, tek fark katalog sayısı (24 → 26) |
| Arz-kıt pazarda Ar-Ge | fiyat ×1,13 → ×1,25, kâr **+%10**, hacim %0,0 |
| Doymuş pazarda Ar-Ge | hacim **+%4,2** (boş talep %17) |
| Tavan ve azalan verim | 1 merkez 0,12 · 2 merkez 0,24 · 3+ merkez 0,30'da sabit |
| Prim erimesi | merkezler yıkılınca 0,300 → 0,002 (200 gün) |
| Marka kaldıraçlı hedefine yakınsıyor | pay %50 iken marka 0,92 (hedef 0,925) |
| Pazarlama asimetrisi | payı %10 olanda ×1,375, payı %60 olanda ×1,206 |
| Ar-Ge geri ödemesi | 1 mağaza: hiç dönmüyor · 4 mağaza: **225 gün** |
| Pazarlama geri ödemesi | 4 mağaza: **124 gün** |

Tarayıcı testleri (`tools/playtest.mjs`): **88/88**, 0 konsol hatası.

### B parçası — kartın söylediği şey

`packages/core/src/competition.ts` de `chain.ts` gibi tamamen türetilmiş:
state'e yazmaz. Kart kategoride payı, lideri, üç ölçüyü (kalite, marka,
fiyat) ve iki kolun doluluğunu gösterir; altında tek bir hamle vardır.

**Kartın taşıdığı asıl fikir: kolun karşılığı hangi kanaldan geliyor.**
İlk sürüm bunu bölgenin boş talebinden okuyordu ve YANLIŞTI — bir outlet
kapasitesini komşu bölgelere de dağıtıyor, dolayısıyla kendi bölgesinde
boş talep düşük görünürken outlet yine tepede çalışabiliyor. Test tam
bunu yakaladı: kart "pazar doymuş, kalite paya döner" diyordu, oysa aynı
kurulumda ölçüm kârın tamamının fiyattan geldiğini göstermişti.

Doğru sinyal doğrudan mekanizmanın kendisi: **kendi kapasite doluluğun.**
%95'in üstündeyse çekicilik sana bir birim daha getiremez; getirisi
fiyattadır.

#### Ekrana bakarken çıkan üç sorun

| Sorun | Neden yanlıştı | Çözüm |
|---|---|---|
| Her ölçüde önde olup payı düşük olmak çelişki gibi görünüyordu (kalite 1,00 vs 0,51, marka 0,47 vs 0,24, üstelik daha ucuz — ama pay %24 vs %26) | Pay çekicilikle değil kapasiteyle sınırlıydı; tablo bunu söylemiyordu | Tablonun altına, yalnızca gerektiğinde çıkan bir açıklama satırı |
| Fiyat satırı oyuncu tarafında hep yeşildi | Ucuz olmak "iyi", pahalı olmak "kötü" değil — ikisi de strateji | Fiyat satırı nötr çiziliyor |
| Ar-Ge merkezi kartı "günlük kâr −1.802 ₺, doluluk %0, bölge payı %0" gösteriyordu | Destek binası kendi defterinde asla kâr göstermez; oyuncu bunu bozuk sanıp yıkardı | Depo/Ar-Ge/pazarlama için satış defteri yerine **gider defteri** ve karşılığın nerede göründüğünü söyleyen bir cümle |

Üçüncüsü depoyu da kapsıyor — yani Tur 1'den beri duran bir sorun.

Denge harness'ı: **120 kontrol**. Tarayıcı testleri: **88/88**.

### C parçası — doktrin sırası bir ölçümle bulundu

Rakipler oyuncunun rekabet kartını besleyen `competitionCards`
fonksiyonunun **aynısını** okuyup karar veriyor — zincirde kurduğumuz
kuralın aynısı, "NPC hile yapıyor" hissi mimari olarak imkânsız.

İlk sürümde kol hamlesi zincirden hemen sonra, **genişlemeden önce**
değerlendiriliyordu. Kontrollü A/B (aynı tohum, tek fark rakiplerin kol
iştahı) bunun rakipleri çökerttiğini gösterdi:

| Tohum | Rakip toplamı (kolsuz) | Kol iştahı önde | Kol iştahı en sonda |
|---|---|---|---|
| 12 | 162,25 M ₺ | **89,20 M ₺** | 159,78 M ₺ |
| 5 | 156,28 M ₺ | **79,18 M ₺** | 155,22 M ₺ |
| 33 | 162,05 M ₺ | **86,53 M ₺** | 162,40 M ₺ |

Kalite avcısı tek başına 77 M ₺'den 19 M ₺'ye düşüyordu.

Sebep basit ve kalibrasyonda zaten yazılıydı: **mağaza 60–110 günde,
kol 124–225 günde dönüyor.** Her hafta mağaza yerine kol kuran rakip
kendi büyümesini durduruyordu. Zincirde bu sorun yoktu çünkü zincirin bir
geri ödeme kapısı var (220 gün); kolun yok.

Kapı yerine **sıra** kullanıldı: kol, kârlı bir genişleme bulunamadığı
haftalarda kuruluyor — gerçek hayattaki gibi, büyüme yavaşladığında
verimliliğe dönülüyor. Bu değişiklikten sonra rakipler kolsuz tabana
döndü ve doktrinler ayrışmaya devam etti.

#### Ölçülen doktrinler (500 gün, tohum 12)

| Rakip | Doktrin | Ar-Ge | Pazarlama | Değer |
|---|---|---|---|---|
| Nova Holding | Yayılmacı | 3 | 6 | 75,74 M ₺ |
| Kilit Market | Ucuzcu | 0 | 3 | 4,25 M ₺ |
| Meridyen Grup | Kalite avcısı | 3 | 2 | 78,00 M ₺ |
| Atlas Yapı | Toprak ağası | 0 | 0 | 1,79 M ₺ |

Ayrışma yalnızca bina sayısında kalmıyor: kalite avcısının kalite primi
0,20'ye çıkarken ucuzcununki 0,00'da kalıyor ve fark oyuncunun rekabet
kartındaki **rakip sütununa** yansıyor. Harness bunu ayrıca doğruluyor —
doktrin oyuncuya görünmüyorsa hiçbir şey değişmemiş demektir.

Denge harness'ı: **128 kontrol**.

### D parçası — ihale iki kez düzeltildi

**Değerleme.** İlk model "en iyi binanın 220 günlük kârı" idi ve iki
yönden bozuktu: parseller kazandırdıkları şeye göre çok ucuz olduğu için
7.000 ₺'lik bir parsele 780.000 ₺ teklif ettiriyordu; sonucu nakitle
kırpınca da **her parsel aynı değere iniyordu** — yani teklif hiçbir
bilgi taşımıyordu, oysa açık artırmanın tek amacı rakibin değerlemesini
oyuncuya öğretmek. Model taban fiyatın katına çevrildi: fırsatın geri
ödemesi ne kadar kısaysa kat o kadar yüksek (en fazla 4×). Nakit sınırı
değerlemeden çıkıp **teklif anına** taşındı.

**Fiyat keşfi.** Teklif turu günde yalnızca bir geçiş yapıyordu ve ihale
fiyat keşfi yapamıyordu: dört teklifçi, üç gün ve %5'lik adımlarla fiyat
en fazla 1,05¹² ≈ 1,8 katına çıkabiliyordu, yani kimsenin değerlemesine
ulaşamıyordu. Ekranda tuhaf bir çelişki olarak göründü — panel *"burada
günde 30.690 ₺ kazanırsın"* derken en yüksek teklif **5.239 ₺**'ydi.

Gerçek bir açık artırma hızlıdır: tur artık kimse artırmayana kadar
sürüyor ve fiyat ikinci en yüksek değerlemede duruyor. Aynı parsel
3.188 ₺ tabandan **13.803 ₺**'ye, 31 artırımla çıkıyor. Fiyat artık
bilgi taşıyor.

Üçüncü düzeltme okunabilirlikte: `formatMoney` bin ölçeğine yuvarladığı
için "en yüksek teklif 16 B ₺" ile "en az teklifi ver · 16 B ₺" aynı
görünüyordu — oysa aradaki 776 ₺ kararın kendisi. İhalede rakam tam
yazılıyor (zincir panelinde birim maliyet için aynı kararı vermiştik).

| Kontrol | Sonuç |
|---|---|
| İhale düzenli açılıyor | 400 günde **13** ihale |
| Oyuncu kaybedebiliyor | fakir oyuncuda 13/13 ihaleyi rakip kazandı |
| Rakip değerlemesi ayrışıyor | Orta Gelir Konut 10 B ₺ · Sanayi 3.728 ₺ |
| Kimse nakdinin üstüne teklif vermiyor | 0 ihlal (300 gün) |
| İhaledeki parsel doğrudan alınamıyor | engelleniyor |
| Bayrak kapatılabiliyor | evet |
| İhale ekonomiyi ele geçirmiyor | ihaleli/ihalesiz oyuncu farkı **%0** |

Son satır bilinçli: ihale, ilgilenmeyen oyuncuyu **cezalandırmıyor**.
Kaçırılan ihale bir ceza değil, kaçırılmış bir fırsat.

Denge harness'ı: **144 kontrol**. Tarayıcı testleri: **97/97**.

Sıralama Tur 1 ile aynı mantıkta: **önce motor, sonra oyuncunun gördüğü
katman, sonra rakip, en son yeni akış.** B'den önce C yazılırsa rakibin
ne yaptığını göremeyiz; C'den önce D yazılırsa ihalede rakip teklifi
anlamsız olur.

---

## 10. Karara açık üç nokta

Aşağıdakiler tasarımda **seçilmiş** ama tersine çevrilebilir; gerekçeleri
ileride "bu neden böyle" diye sorulduğunda kayıtta kalsın diye duruyor.

### 10.1 Ar-Ge kategori düzeyinde, ürün düzeyinde değil

**Seçilen:** kategori. Ürün düzeyi (22 ürün) daha zengin olurdu ama
rekabet kartı okunamaz hale gelirdi ve oyuncu 22 ayrı eğri yönetirdi.
Kategori düzeyi, raf seçimiyle (ürün düzeyi) birlikte zaten iki kademeli
bir karar veriyor.

### 10.2 Kalite geriye erir

**Seçilen:** merkez yıkılınca prim erir. Alternatif "kazanılan kalite
kalıcıdır" olurdu; o zaman doğru strateji "merkez kur, tavana çık, yık"
olurdu ve mekanik tek seferlik bir maliyete dönerdi. Erime, Ar-Ge'yi
**sürekli bir gider** yapıyor — gerçek hayattaki gibi.

### 10.3 İhale duraklatmıyor

**Seçilen:** akışı kesmiyor, ilgilenmezsen kendiliğinden sonuçlanıyor.
Alternatif "ihale açıldığında oyun duraklar" olurdu; daha dramatik ama
`Capitalism.md`'deki "casual oynanış" sözünü doğrudan çiğnerdi. Kaçırılan
ihale bir ceza değil, sadece kaçırılmış bir fırsat.
