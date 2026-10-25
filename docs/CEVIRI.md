# Çeviri ve yeni dil

Oyunun dilleri: **Türkçe** (temel dil), **İngilizce** (Tur 23), **Almanca**
(Tur 69). Bu belge bir dilin nasıl kurulduğunu ve yenisinin nasıl
ekleneceğini anlatıyor.

## Nasıl çalışıyor

- **Tek motor.** Sözlük motoru `packages/content/src/messages.ts`'te;
  içerik, çekirdek ve arayüz aynı etkin dili okuyor. Metin anahtarla
  isteniyor: `t('hud.topbar.cash')`, `tc('core.engine.noCash')`.
- **Türkçe temel dil.** Bir anahtar etkin dilde yoksa Türkçesi, o da yoksa
  anahtarın kendisi görünüyor (sessiz boşluk yerine fark edilir hata).
- **Simülasyon dili okumuyor.** Aynı tohum her dilde aynı oyunu oynuyor
  (test: `aynı tohum her dilde aynı oyunu oynuyor`). Haber ve önerge
  başlıkları state'e o günün diliyle yazılıyor; dil oyun ortasında
  değişirse eski haberler yazıldıkları dilde kalıyor.
- **Sözlükler geç iniyor** (Tur 46). Türkçe dışındaki her dilin içerik,
  çekirdek ve arayüz sözlüğü tek parça (`locale-en-*.js`,
  `locale-de-*.js`); dil seçilince bir istek. Türkçe oynayanın açılışında
  yok. Paket rafının ve editörün sözlükleri kendi geç inen parçalarında,
  bütün dilleri birlikte.
- **Biçim dil başına** (Tur 69). Sayı, yüzde, para ve kısaltmalar
  `LocaleFormat` tablosunda (`messages.ts`):

  | | Türkçe | İngilizce | Almanca |
  |---|---|---|---|
  | Sayı | 1.234,5 | 1,234.5 | 1.234,5 |
  | Yüzde | %45 | 45% | 45 % |
  | Para | 1,23 M ₺ · 46 B ₺ | ₺1.23M · ₺46K | 1,23 Mio. ₺ · 46 Tsd. ₺ |
  | Kısa para | 1,2M ₺ · 45B ₺ | ₺1.2M · ₺45K | 1,2 Mio. ₺ · 45 Tsd. ₺ |
  | Dil başına metinde yedek | — | — | İngilizce |

  Almancanın yüzdesindeki boşluk bölünmeyen boşluk (U+00A0): satır "45"
  ile "%" arasında kırılmıyor. Para birimi her dilde ₺.
- **Paket metinleri** (`{ "tr": …, "en": …, "de": … }`): etkin dil, sonra
  dilin yedekleri (Almancada İngilizce), sonra Türkçe, o da yoksa ilki
  (`packText`, `textLocales`).

## Yeni dil eklemek

Örnek olarak `xx` kodlu bir dil. İngilizce dosyaların her biri bir şablon:
aynı anahtarlar, aynı sıra, aynı yorum satırları.

1. **Sözlükler** (İngilizcenin yanına):
   - `packages/content/src/i18n/xx.ts` → `contentXx`
   - `packages/core/src/i18n/xx/{commands,markets,world}.ts` ve `index.ts` → `coreXx`
   - `packages/ui/src/i18n/xx/{app,finance,hud,panels}.ts` ve `packages/ui/src/i18n/xx.ts` → `xx`
   - `packages/ui/src/packMessages.xx.ts` → `packXx`
   - `packages/ui/src/packEditorMessages.xx.ts` → `editorXx`

   Arayüz ve çekirdek dosyaları `Record<keyof typeof trHud, string>` gibi
   Türkçenin anahtar türüyle yazılıyor: eksik anahtar tip denetiminde hata.
2. **Kayıt:** `registerLocaleLoader('xx', …)` üç yerde
   (`content/src/locales.ts`, `core/src/i18n/index.ts`,
   `ui/src/i18n/index.ts`); paket rafı ve editör `registerMessages('xx', …)`
   ile (`packMessages.ts`, `packEditorMessages.ts`).
3. **Ad:** `LOCALE_NAMES` (`ui/src/i18n/locale.ts`), dilin kendi dilinde.
4. **Biçim:** `messages.ts`'teki `formats` tablosuna bir satır. Kaydı
   olmayan dil Türkçe biçimle yazıyor.
5. **Parça:** `apps/web/vite.config.ts`'teki `vendorChunk` düzenli ifadesine
   dil kodu; `tools/bundle-check.mjs`'te geç inmesi gerekenler listesine.
6. **Testler:** `packages/core/test/i18n.test.ts`'teki `FOREIGN` tablosuna
   bir satır. Dilin iki kalıbı oraya yazılıyor: sayıdan sonra biçimsiz
   çoğul isim (`{n} days`) ve tekil biçimde çoğul fiil (`1 share are`).
   Tarayıcı testinde dil seçicinin düğme sayısı ve telefon etiketleri
   denetiminin dilleri (`tools/playtest.mjs`).
7. **Yazı tipi:** Fredoka ve Nunito Latin + Türkçe alt kümesi. Almanca ve
   Batı Avrupa dilleri sığıyor; Kiril, Yunan ya da CJK için
   `tools/make-cam-fonts.py`'nin alt kümesi genişlemeli.

## Çeviri kuralları

- **Yer tutucular** `{name}` aynen kalıyor: aynı ad, aynı sayı.
- **Tekil/çoğul:** sayıdan sonra sayılabilen isim gelen her yerde
  `{n|tekil|çoğul}`, `#` sayının kendisi: `{days|# Tag|# Tage}`. Yalnız
  sayı alan yer tutucularda (`{month|…}`, `{district|…}` değil). "Tag(e)"
  gibi ek yok.
- **Türkçeye özgü harf** (ç ğ ı ş İ) kalmıyor.
- **Cinsiyeti bilinmeyen ad** (`{rival}`, `{category}`, `{district}`):
  cümle onunla uyuşması gereken artikel istemeyecek biçimde kuruluyor
  (Almancada "{category}-Filialen", "Rivale {rival}").
- **Kısa etiketler** kısa kalıyor: üst bar, rıhtım, düğmeler, tablo
  başlıkları. Telefonda rıhtım etiketleri tarayıcı testinde ölçülüyor.
- **Metindeki sayılar** dilin biçiminde ("2.700", "3,5", "45 %").

## Denetim

```bash
node tools/i18n-check.mjs de     # dosya dosya: eksik, fazla, yer tutucu, uyarılar
node tools/run-tests.mjs i18n    # birim testi: aynı kurallar zorunlu
```

`i18n-check` testin zorunlu tuttuklarına ek olarak uyarı veriyor:
İngilizcede tekil/çoğul biçimi olup çeviride olmayan metin, İngilizceyle
aynı kalmış uzun metin, iki katına yakın uzamış kısa etiket.

## Almanca terimler

Almanca çevirinin terim sözlüğünden temel kararlar (bütün çeviri bu
terimlerle):

| Türkçe | İngilizce | Almanca |
|---|---|---|
| Nakit | Cash | Kasse |
| Günlük kâr | Daily profit | Tagesgewinn |
| Şirket değeri / net değer | Company value / net worth | Unternehmenswert / Nettovermögen |
| Rakip | Rival | Rivale |
| Mağaza | Store | Laden, Filiale |
| Parsel | Plot | Grundstück |
| Bölge (semt) | District | Viertel |
| Zincir | Chain | Kette, Lieferkette |
| Pay | Share (market) | Anteil, Marktanteil |
| Hisse / halka arz | Shares / IPO | Aktien / Börsengang |
| Devralma / baskın | Takeover / raid | Übernahme / Übernahmeangriff |
| Meclis / önerge | Council / motion | Stadtrat / Antrag |
| Kira / doluluk | Rent / occupancy | Miete / Belegung |
| Santral / enerji | Power plant / energy | Kraftwerk / Energie |
| Nakliye / taşıma sözleşmesi | Freight / haulage contract | Fracht / Transportvertrag |
| Gündem | Agenda | Agenda |
| Fırsat balonu | Opportunity bubble | Gelegenheitsblase |
| Görev panosu | Quest board | Auftragsbrett |
| Senaryo / yıldız | Scenario / stars | Szenario / Sterne |
| Koşu | Run | Partie |
| Günün koşusu / haftanın kuralı | Daily run / this week's rule | Tagespartie / Regel der Woche |
| Lig / tablo | League / leaderboard | Liga / Bestenliste |
| Kariyer / başarım / rozet | Career / achievement / badge | Karriere / Errungenschaft / Abzeichen |
| Zorluk: Rahat, Dengeli, Acımasız | Relaxed, Balanced, Ruthless | Entspannt, Ausgewogen, Gnadenlos |
| Rehber | Guide | Einführung |

Oyuncuya "du" ile hitap ediliyor; tırnak „…“. Başarım adları Steam'in
Almanca arayüzünde "Errungenschaften" altında görünecek (Tur 70).
