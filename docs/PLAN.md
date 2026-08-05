# CapitalForge — Onaylanmış Plan

Bu belge, `Capitalism.md` planlama dokümanındaki kararların uygulanmış
hâlidir. Kapsam daraltılmadı; sistemler modüler kuruldu ve fazlara yayıldı.

## Verilen kararlar

| # | Karar | Seçim |
|---|-------|-------|
| 1 | Tema | Modern, stilize kapitalist şehir |
| 2 | Görsel stil | Low-poly, temiz ışıklandırma, stilize |
| 3 | Harita | District'lere bölünmüş grid şehir (3×3 bölge, 24×24 kare) |
| 4 | Oyun odağı | Hibrit: perakende + hizmet + üretim + gayrimenkul + şirket yönetimi |
| 5 | Ekonomi derinliği | Katmanlı — yüzeyde basit, panelde derin |
| 6 | Rakipler | Kişilik bazlı, aktif ama adil |
| 7 | Oyun modları | Hepsi modüler destekli (feature flag altyapısı kurulu) |
| 8 | Kayıt | IndexedDB + çok slot + autosave + göç + JSON dışa/içe aktarma |
| 9 | UI framework | **React 19 + TypeScript + Vite** (aşağıda gerekçe) |
| 10 | Hedef cihaz | Desktop-first, responsive hybrid |
| 11 | Dil | Türkçe içerik, localization-ready mimari |
| 12 | Özel istekler | Borsa, halka arz, lobicilik/politika, sendika, şirket satın alma — yol haritasında |

### Karar 9 gerekçesi — neden React

Oyun canvas'ı ile arayüz tamamen ayrık çalışıyor: Three.js sahnesi kendi
döngüsünde, React yalnızca HUD'da. React'in yeniden çizimi simülasyon hızına
değil, günlük tick'e bağlı (`useSyncExternalStore` + sürüm sayacı), dolayısıyla
sanal DOM maliyeti oyunun kare hızına dokunmuyor. Fare hareketi gibi yüksek
frekanslı olaylar bilinçli olarak React'e hiç uğramıyor — hover'ı render
katmanı kendi içinde tutuyor. Ekosistem genişliği ve panel yoğunluğu göz
önüne alındığında Preact/Svelte'ye göre net kazanç bu projede React'te.

## Oynanış tasarımı: "sofistike simülasyon, sakin oynanış"

Bu, planın en kritik ek kararı. Uygulanışı:

| Derinlik altta | Sadelik üstte |
|----------------|---------------|
| Fiyat esnekliği, marka, kalite, erişilebilirlik ile pazar payı çözümü | Tek bir "Fırsat" ısı lensi: nereye yatırım yapılacağını renk söyler |
| Her binanın kalem kalem defteri | Yapı kartında tek satır: `≈ 1.632 ₺/gün · 19 günde geri öder` |
| Fiyat/talep optimizasyonu | Varsayılan otomatik fiyatlama; isteyen manuel devralır |
| Rakiplerin hedef seçimi, kişilik ağırlıkları | Haber akışında tek cümle: "Nova Holding Merkez'de kafe açtı" |
| Ekonomik olay çarpanları | Üstte bir çip: "Turizm Sezonu · 20 gün" |
| Nakit açığı, faiz, kredi limiti | Otomatik kredi devreye girer; oyun sert bitmez, uyarı düşer |

Kurallar:

- **Hiçbir olay oyunu durdurmaz.** Modal dayatma yok; piyasa değişir, haber
  akar, oyuncu isterse tepki verir.
- **Kayıp her zaman açıklanabilir.** "Neden para kaybediyorum?" sorusunun
  cevabı seçili arsanın panelinde kalem kalem yazar.
- **Oyun oyuncuya yalan söylemez.** Yapı menüsündeki tahmin ile gerçekleşen
  kâr arasındaki sapma otomatik testle doğrulanıyor (şu an %0).

## Faz durumu

- **Faz 0 — Teknik temel:** ✅ monorepo, Three.js sahnesi, RTS kamera, grid,
  seçim, yerleştirme önizlemesi, oyun döngüsü, hız kademeleri, komut sistemi,
  kayıt temeli, HUD kabuğu.
- **Faz 1 — Oynanabilir çekirdek:** ✅ arsa alımı, bina kurulumu, talep
  modeli, gelir/gider, günlük tick, finans paneli, autosave, haber akışı.
- **Faz 2 — Rekabet katmanı:** ✅ kişilikli NPC şirketler, arsa kapma, pazar
  payı, fiyat rekabeti, rakip paneli, oyuncu domine ettiğinde karşı hamle.
- **Faz 3 — Derin ekonomi ve şehir:** kısmen — bölge sistemi, nüfus/gelir
  modeli, arsa değeri dinamikleri, kira, lojistik ve üretim indirimleri,
  ekonomik olaylar var. Eksik: imar, altyapı, kredi ürünleri, vergi.
- **Faz 4-6:** yol haritasında.

## Denge hedefleri

Bunlar `packages/core/test/balance.ts` ile her değişiklikte doğrulanıyor:

- Tier-1 yatırım ~80 günde, tier-2 ~120 günde geri ödemeli (makul dolulukta).
- Yatırım yapan oyuncu bir oyun yılında belirgin büyümeli.
- Hiçbir şey yapmayan oyuncu büyümemeli.
- Rakipler canlı kalmalı ama oyuncuyu ezici üstünlükle geçmemeli.
- Bir oyun yılı sonunda pazarda hâlâ karşılanmamış talep kalmalı.

## v0.2 — oyuncu deneyimi turu

Oynanış geri bildirimi sonrası eklenenler:

- **Şirket kurulumu ekranı.** Oyun artık haritanın ortasında başlamıyor;
  önce şirket adı ve CEO seçiliyor.
- **CEO'lar.** Altı karakter, her biri parametrelerden çizilen SVG portre.
  Seçim kozmetik değil: başlangıç sermayesi, arsa pazarlığı, inşaat
  maliyeti, işletme gideri, marka büyüme hızı ve sektör kalitesi CEO'ya
  göre değişiyor.
- **Parsel sistemi.** Sınırsız tahta yerine gerçek şehir kısıtı: kareler
  sokak / kamu alanı / parsel olarak ayrıldı. Şehrin %80'i zaten kurulu
  geliyor; boş parsel kıt bir kaynak.
- **Devralma.** Dolu bir parseli almak istiyorsan mevcut sahibine yapı
  tipine göre 1,7x–3,6x prim ödeyip yapıyı yıkıyorsun. İyi bölgede boş
  parsel bitince büyümenin yolu bu.
- **Yaşayan şehir.** Sokak ızgarası, mevcut yapı dokusu (apartman,
  rezidans, esnaf, depo, park, okul, meydan), sokaklarda akan trafik ve
  bağımsız bir gece-gündüz döngüsü. Gece binaların pencereleri yanıyor.
- **Uyarlanabilir kalite.** İlk 2,5 saniyede kare hızı ölçülüyor; zayıf
  cihazda gölgeler kapatılıp akıcılık korunuyor.

## Bilinen dengesizlikler

- Geç oyunda büyüme üstel: bir oyun yılında ~25-35M şirket değeri. Faz 3'ün
  vergi ve kredi sistemleri bunu doğal olarak yavaşlatacak.
- Nakit birikiyor; borsa ve şirket satın alma gelene kadar sermayeyi
  harcayacak yeterli kanal yok.
- Rakipler bina yıkmıyor ve zarar eden şubeyi kapatmıyor.
