# İçerik paketleri

> Tur 67'de yazıldı. Kod `packages/content/src/packs.ts` (biçim, doğrulayıcı,
> paylaşım kodu) ve `packages/ui/src/PackShelf.tsx` (kurulum ekranındaki raf).
> Örnek paket: [`docs/ornek-paket.json`](ornek-paket.json) (testler her
> koşuda doğruluyor).

## Ne

Bir paket düz bir JSON belgesi: kimliği, adı, isteğe bağlı kuralları ve bir
ya da birkaç senaryosu var. Senaryo hazır senaryolarla aynı parçalardan
yapılıyor: tohum, ön tarih, süre, hedef, yıldızlar, devir. Kural, hazır dört
ek kuraldan birinin ayarları sınırlar içinde değiştirilmiş hâli ("Sert kış":
ilk kriz 60. günde, sonrakiler 90–150 günde bir). Oyun yeni bir mekanik
okumuyor; paket var olan parçaları bir araya getiriyor.

## Oyunda

**Yeni oyun → Senaryo → Kendi senaryoların.** Hazır on senaryonun altında.

- **Ekleme.** "Senaryo ekle" kutusuna paylaşım kodu (`CF1.…`) ya da paketin
  JSON metni yapıştırılıyor, ya da **Dosyadan seç**. Geçmeyen paket
  eklenmiyor; her sorun yeriyle ve nedeniyle yazıyor:
  `scenarios[0].goal.target 100.000 ile 100.000.000.000 arasında olmalı`.
- **Örnekle doldur.** Seçili hazır senaryo paket olarak kutuya yazılıyor:
  yazmaya oradan başlamak en kolayı.
- **Paylaşma.** Paketten gelen bir senaryo seçiliyken **Kodu kopyala**
  (senaryo ve kullandığı kurallar, sıkıştırılmış) ya da **Bağlantıyı
  kopyala** (`…/?paket=CF1.…`). Bağlantıyı açan senaryo sekmesine düşüyor,
  kod ekleme kutusunda; eklemek onun kararı. Masaüstü sürümünde bağlantı
  düğmesi yok (adresi başkasında açılmıyor), kod var.
- **Yeni sürüm.** Aynı kimlikli paket eklenince eskisinin yerine geçiyor.
  Bir senaryonun oyunu değiştiyse (hedef, yıldızlar, kurulum, kuralın
  ayarları) o senaryonun cihazdaki skoru siliniyor; yalnız metni değiştiyse
  kalıyor.
- **Kaldırma.** Onayla; yıldızlar cihazda kalıyor.
- Paketler tarayıcıda kalıcı (`capitalforge.packs.v1`; masaüstünde
  `profile/` altında dosya, Steam Cloud'la eşitleniyor). En fazla 20 paket.

**Kayıt.** Oynanan senaryonun paketi kayda giriyor (`state.scenario.pack`).
Kayıt, paketi yüklü olmayan bir cihazda da açılıyor. Aynı paketin başka bir
sürümü yüklü olsa da koşu kendi tanımıyla sürüyor.

**Kariyer.** Paketten gelen senaryo kariyere, rozetlere ve (Tur 70'te)
Steam başarımlarına sayılmıyor; kuralı da kurulumu da yazanın elinde.
Senaryonun ayrıntısında yazıyor. Yıldızları cihazda tutuluyor, senaryo
kartında görünüyor.

**Lig.** Lig koşuları paket kullanmıyor; haftanın tohumu ve günün koşusu
herkese aynı.

## Biçim

```json
{
  "format": "capitalforge-pack",
  "version": 1,
  "id": "zor-kis",
  "name": { "tr": "Zor kış", "en": "Hard winter" },
  "author": "Conforcus",
  "rules": [ … ],
  "scenarios": [ … ]
}
```

| Alan | Gerekli | Kural |
|---|---|---|
| `format` | evet | `"capitalforge-pack"` |
| `version` | evet | `1` |
| `id` | evet | kimlik (aşağıda) |
| `name` | evet | metin, en fazla 60 karakter |
| `author` | hayır | düz yazı, en fazla 60 karakter |
| `rules` | hayır | en fazla 8 kural |
| `scenarios` | evet | 1–12 senaryo |

**Kimlik:** küçük harf, rakam ve tire; harf ya da rakamla başlıyor, en fazla
32 karakter (`zor-kis`, `kista-kurtarma`). Oyundaki senaryo kimliği
`paket/senaryo` (`zor-kis/kista-kurtarma`); hazır senaryolarla çakışmıyor.

**Metin:** tek dilde düz yazı ya da dil başına
(`{ "tr": "…", "en": "…" }`). Oyun etkin dildekini, yoksa Türkçeyi, o da
yoksa ilkini gösteriyor.

**Bilinmeyen alan** hata: yazım yanlışı (`"tagLine"`) sessizce yok
sayılmıyor.

### Senaryo

| Alan | Kural |
|---|---|
| `id` | kimlik; pakette tek |
| `title` | metin, ≤ 48 |
| `tagline` | metin, ≤ 140: listede başlığın altında |
| `brief` | metin, ≤ 700: oyuncu neyin ortasına düşüyor |
| `goalText` | metin, ≤ 220: hedef cümlesi; yer tutucular aşağıda |
| `facts` | isteğe bağlı, ≤ 6 metin (her biri ≤ 220) |
| `seed` | 1 – 2 147 483 647 tam sayı: şehrin tohumu |
| `citySize` | `standard` · `large` |
| `difficulty` | `easy` · `normal` · `hard` |
| `preludeDays` | 0–400 tam sayı: devirden önce şehrin kaç gün yaşadığı |
| `rules` | isteğe bağlı: hazır kural kimlikleri ya da paketin kuralları; aynı hazır kural iki kez olmaz |
| `days` | 30–1000 tam sayı: devirden sonraki süre |
| `goal` | hedef (aşağıda) |
| `stars` | yıldızlar (aşağıda) |
| `setup` | devir (aşağıda) |

`goalText`'in yer tutucuları oyunda doluyor: `{days}` (süre), `{target}`
(para hedefi, biçimli), `{share}` (zincirde pay, yüzde), `{rivals}` ve
`{outlets}` (nakliye), `{units}` ve `{renewals}` (kiralık).

### Hedef

| `kind` | Alanlar | Yıldız ölçüsü |
|---|---|---|
| `netWorth` | `target` 100 bin – 100 milyar ₺ | `days` |
| `leadAtEnd` | — : süre bitince en değerli şirket | `lead` |
| `victory` | — : zafer (şirket değeri ve birincilik) | `days` |
| `chain` | `goodId` zinciri olan bir tüketici ürünü (`bread`, `coffee`, `apparel`, `footwear` …), `share` 0,05–1 | `days` |
| `sponsor` | `projects` 1–5, `maxRank` 1–5, `graceDays` 0–120 | `lead` |
| `monopoly` | — : bütün rakipleri devral | `days` |
| `holding` | — : iki şehirde zafer; `setup.secondCity` gerekli | `days` |
| `freight` | `rivals` 1–6, `outlets` 1–60 | `days` |
| `power` | `target` 100 bin – 10 milyar ₺ (rakiplere satılan elektrik) | `days` |
| `rental` | `units` 1–20 000, `renewals` 0–5 | `days` |

### Yıldızlar

`{ "metric": "days", "two": 320, "three": 260 }`: hedefe ulaşmak bir
yıldız; iki ve üç yıldız o kadar gün içinde (`three < two ≤ days`).

`{ "metric": "lead", "two": 1.2, "three": 1.45 }`: bitişte en güçlü rakibe
oran (1–10, `three > two`).

Ölçü hedefe bağlı (tablodaki sütun); yanlışı hata.

### Devir (`setup`)

| Alan | Kural |
|---|---|
| `cash` | 0 – 1 milyar ₺: kasa |
| `outlets` | ≤ 12 mağaza ya da kiralık kimliği (`corner_shop`, `supermarket`, `cafe`, `apartment` …): önceki yönetimin şubeleri |
| `idle` | `{ "defIds": [≤ 8 Ar-Ge ya da pazarlama], "focus": kategori }`: boşa çalışan destek binaları |
| `builtDaysAgo` | 0–400: devralınan binaların yaşı |
| `loan` | `{ "amount": 1 bin – 1 milyar, "termDays": 30–720 }` |
| `raiderStake` | 0–0,45: en güçlü baskıncının payı |
| `crisis` | `{ "id": "deep_recession" · "rate_shock" · "energy_shock", "warningDays": 0–120 }` |
| `consortium` | `{ "warningDays": 5–120 }`: rakip konsorsiyumu |
| `projects` | `{ "firstInDays": 0–400, "gapDays": 30–400 }`: şehir projesi takvimi |
| `freeze` | `{ "entrants": bool, "issuance": bool }`: yeni şirket ve hisse ihracı dondurulmuş |
| `secondCity` | `{ "capital": 100 bin – 1 milyar, "citySize": … }`: holding |
| `feud` | 0–4: oyuncuya kinli başlayan rakip sayısı |

Kategoriler: `grocery`, `dining`, `retail`, `electronics`, `services`,
`housing`, `office`.

## Kurallar

```json
{
  "id": "sert-kis",
  "base": "storms",
  "name": { "tr": "Sert kış", "en": "Hard winter" },
  "blurb": "İlk kriz erken geliyor, sonrakiler sık.",
  "params": { "firstDay": 60, "firstSpread": 30, "gapDays": [90, 150] }
}
```

`base` hazır kurallardan biri; `params` onun ayarlarından istenenler
(yazılmayan hazır değerinde). Kuralın kimliği hazır bir kuralın kimliğiyle
aynı olamaz. `name` (metin, ≤ 60) ve `blurb` (metin, ≤ 140) kurulumda, açılışta ve hedef
panelinde hazır kuralın adının yerine yazıyor.

| `base` | Ayar | Hazır değer | Sınır |
|---|---|---|---|
| `storms` (Fırtınalı yıllar) | `firstDay` | 160 | 30–600 tam sayı |
| | `firstSpread` | 60 | 0–300 tam sayı |
| | `gapDays` | [150, 240] | iki tam sayı, 30–900, artan |
| | `buildDiscount` | false | true / false: krizde inşaat ucuz mu |
| `hungry_rivals` (Aç gözlü rakipler) | `budgetMultiplier` | 1,3 | 1–2,5 |
| | `raidWarmupMultiplier` | 0,65 | 0,2–1 |
| `tight_credit` (Sıkı banka) | `rateDelta` | 0,04 | 0–0,12 |
| | `limitMultiplier` | 0,6 | 0,1–1 |
| | `startingLoanShare` | 0,5 | 0–0,9 |
| | `startingLoanDays` | 360 | 60–900 tam sayı |
| `scarce_land` (Kıt arsa) | `priceMultiplier` | 1,7 | 1–4 |
| | `unlockDelay` | 1,5 | 1–3 |

Senaryo hazır kuralı ayarsız da kullanabilir: `"rules": ["storms"]`.

## Paylaşım kodu

`CF1.` ve paketin JSON'unun sıkıştırılmış (deflate) base64url hâli. Kod bir
senaryoyu ve kullandığı kuralları taşıyor (paketin tamamını değil). Sohbete
yapıştırılırken bölünen kodun boşlukları ve satır sonları yok sayılıyor.
Sınırlar: kod ≤ 24 000 karakter, açılmış hâli ≤ 64 KB (küçük kodun açılınca
devleşmesine karşı). Sınırı aşan kod üretilmiyor: çok dilli uzun metinli bir
senaryoda raf kodun yerine paketin JSON'unu kopyalıyor; ekleme kutusu onu da
alıyor. Yapıştırılan ya da seçilen JSON da ≤ 64 KB.

## Sorunlar

Doğrulayıcı ilk 40 sorunu döndürüyor (`{ path, code, params }`); raf ilk
8'ini gösteriyor.

| Kod | Anlamı |
|---|---|
| `type` | yanlış tür (nesne, liste, sayı, true/false, metin) |
| `missing` | eksik ya da boş |
| `unknownField` | bilinmeyen alan |
| `range` | sınır dışında (`min`, `max`) |
| `integer` | tam sayı olmalı |
| `enum` | şunlardan biri olmalı (`options`) |
| `id` | kimlik biçimi |
| `length` | metin uzun (`max`) |
| `duplicate` | aynı kimlik iki kez ya da hazır kuralın kimliği |
| `unknownRef` | oyunda yok (ürün, bina, kriz, kural) |
| `conflict` | aynı hazır kural iki kez |
| `count` | çok fazla (`max`) |
| `format` | biçim adı ya da metnin dil kodu |
| `version` | sürüm |
| `starsOrder` | üç yıldız ikiden zor değil |
| `metric` | bu hedefte yıldız ölçüsü başka |
| `needsSetup` | hedefin gerektirdiği kurulum yok (holding → `secondCity`) |

## Testler

- `packages/core/test/packs.test.ts`: hazır on senaryonun hepsi paket olarak
  yazılıyor ve doğrulanıyor; örnek paket (bu belgedeki) geçerli ve
  oynanıyor; her sorun kodu yeriyle; kural ayarının simülasyona girmesi;
  kayıt, paket yüklü olmayan cihazda; yeni sürüm süren koşuyu değiştirmiyor;
  dil başına metin; paylaşım kodu ve bozuk kod.
- `packages/ui/test/packs.test.ts`: raf (ekle, yeni sürüm, kaldır, dolu),
  sorunların iki dilde metni, paketin kural adı, kariyere girmemesi.
- Tarayıcı: `tools/playtest.mjs` → "İçerik paketleri".
