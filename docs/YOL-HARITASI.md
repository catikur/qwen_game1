# Capital — Yol Haritası

> Tur 47'de yazıldı, her turda güncelleniyor. Biten işin ayrıntısı
> `docs/DURUM.md`'de; bu dosya önümüzdeki işin sırasını ve gerekçesini
> tutuyor.

## Nerede duruyoruz (Tur 46 sonu)

- **Simülasyon derin ve sağlam sınanmış.**
  - 7 kategori, 25 ürün ve 35 bina var.
  - Borsa, meclis, sendika, kredi, ihale, holding, 7 senaryo, 28 rozet ve 4 ek kural da yerinde.
  - Arkasında 485 birim, 331 denge ve 478 tarayıcı kontrolü var.
- **Oyunun evi tek bir tarayıcı sekmesi.** Oyun GitHub Pages'te duruyor.
  Kayıt yalnız o tarayıcıda kalıyor. Oyun çevrimdışı açılmıyor, cihaza
  kurulamıyor.
- **Rekabet aslında tek kişilik.** Pages'te Tohum Ligi tablosu yerel.
  Paylaşılan tablo yalnız claude.ai sayfasında çalışıyor. Skoru sunucuda
  doğrulayan bir şey yok.
- **His tarafı ince.** Ortam sesi var, müzik yok. Ayarlar dağınık: dil ve
  görünüm yardım panelinde, ses yalnız aç/kapa (Tur 47 bunu kapatıyor).
- **Lite ayrı bir ürün ve bu konularda daha ileride.** Kendi sunucusu,
  davetli ligleri, Game Center ve App Attest'i var. Web ve Android
  sürümleri de çıktı.

## Vizyon

Bir bağlantıyla açılan, istenirse kurulan ve çevrimdışı da oynanan bir
şehir kapitalizmi oyunu.
- Her hafta herkes aynı şehirde, aynı kurallarla yarışıyor; skorları
  sunucu doğruluyor.
- Zafere birden çok, gerçekten farklı yol var.
- Sonunda masaüstüne ve topluluk içeriğine açılıyor.

## Fazlar

| Faz | Amaç | Turlar | Bitti sayılır | Durum |
|---|---|---|---|---|
| **1 · Ürün temeli** | Oyun bir ürün gibi davransın | 47–50 | Kuruluyor, çevrimdışı açılıyor, tek Ayarlar paneli var, müzik var | **sürüyor** |
| **2 · Çevrimiçi rekabet** | Herkes aynı şehirde | 51–55 | Pages'te paylaşılan tablo var, skor sunucuda doğrulanıyor | |
| **3 · Yeni yollar** | Her koşu farklı bir şirket | 56–61 | Zafere en az üç farklı yol var, her birini kazanan bir vekil var | |
| **4 · Şehrin hissi** | Oynaması keyifli | 62–65 | Mevsim ve hava görünüyor, önemli anlar hissediliyor | |
| **5 · Platform ve topluluk** | Oyunun evi büyüsün | 66+ | Masaüstü sürümü ve paylaşılabilir senaryolar var | |

### Faz 1 · Ürün temeli

Kullanıcı "fazı baştan sona yürüt" dedi:
- turlar sırayla geliyor, her tur ayrı bir PR;
- Codex temiz ve CI yeşilse birleşiyor;
- rapor fazın sonunda.

| Tur | İş | Durum |
|---|---|---|
| **47 · Ayarlar ve erişilebilirlik** | Tek Ayarlar paneli: dil, görünüm, metin boyutu, renk körlüğüne uygun palet, hareketi azaltma, ayrı ses düzeyleri, kısayollar. Pencerelerde klavye sözleşmesi (odak, Tab, Escape). | bu PR |
| **48 · Kurulabilir ve çevrimdışı oyun** | Simge ve kurulum, çevrimdışı açılış, yayından sonra "yeni sürüm hazır" bildirimi. Tur 46'daki "eski sayfa yeni parçayı bulamıyor" sorununu kökten çözer. | |
| **49 · Müzik** | Gündüz, gece ve kriz katmanları olan dinamik müzik; Tur 47'deki ses düzeyleriyle birleşir. | |
| **50 · Değerlendirme ve tanıtım** | Yeni oyuncu, telefon ve ilk saat değerlendirmesi. Tanıtım malzemesi: ekran görüntüleri, TR/EN tanıtım metni. Faz 1 raporu. | |

### Faz 2 · Çevrimiçi rekabet

- **51 · Lig sunucusu ana oyuna.** Lite'ın sunucusu ana oyunun koşularını
  da alıyor, Pages'te paylaşılan tablo oluyor.
- **52 · Sunucuda doğrulama.** Gönderilen koşu sunucuda yeniden oynanıyor,
  skor orada hesaplanıyor. Simülasyon da sunucu da TypeScript. Bu,
  DURUM'daki en eski güvenlik açığını kapatır.
- **53 · Haftanın kuralı ve günlük kısa koşu.** Ligde ek kurallar her hafta
  dönüyor; bir de 90 günlük günlük koşu geliyor.
- **54 · Hayalet eğri.** Liderlerin değer eğrisi senin koşunun üstünde
  görünüyor ("lider 300. günde ne yapmıştı").
- **55 · Davetli ligler ve arkadaş tablosu.** Lite'ta var, ana oyuna geliyor.

Kodu ve yerel sunucu testlerini Claude yapıyor. Canlı yayın kullanıcının
hesabında; canlı veritabanına yazılmıyor.

### Faz 3 · Yeni yollar

- **56 · Lojistik.** Kamyonlar zaten şehirde dolaşıyor. Gelecekler:
  - nakliye şirketi kurmak;
  - taşıma sözleşmeleri;
  - rakiplerin zincirine hizmet etmek.
- **57 · Enerji.** Santraller binalara enerji satıyor; fiyat şokları
  krizlere bağlanıyor.
- **58 · Gayrimenkul geliştiricisi.** Konut ve ofis projeleri, kira ve
  doluluk; kentsel dönüşüm ihalesiyle bağlantılı.
- **59 · Rakipler 2.0.** Gelecekler:
  - CEO kimlikleri;
  - ittifak ve husumet hafızası;
  - oyuncuya özel tepkiler (fiyat savaşı, lobi).
- **60 · Senaryo paketi II.** Yeni sektörlerle ve ek kurallarla üç senaryo.
- **61 · Değerlendirme.** Strateji çeşitliliği ölçülüyor; her yol için
  ayrı bir vekil.

### Faz 4 · Şehrin hissi

- **62 · Mevsim ve hava.** Simülasyondaki mevsimler şehirde görünür oluyor.
- **63 · Önemli anlar.** İnşaat animasyonu, para akışı, devralma ve zafer anları.
- **64 · Paylaşılabilir şehir kartı.** Koşunun özeti tek bir görselde.
- **65 · Değerlendirme ve telefon performansı.**

### Faz 5 · Platform ve topluluk

- **66 · Masaüstü sürümü.** Tauri ile, kayıt dosyada; Steam'e hazırlık.
- **67 · İçerik paketleri.** Senaryo ve kurallar dosyadan tanımlanıyor,
  senaryolar kodla paylaşılıyor.
- **68 · Tarayıcıda senaryo editörü.**
- **69 · Üçüncü dil.**
- **70 · Steam.** Başarımlar ve mağaza sayfası.

## Her fazda sürecek işler

- Her 5–6 turda bir değerlendirme turu.
- Paket bütçesi ve gün süresi bütçesi CI'da kalıyor.
- Her yeni sistem denge testine bir bölümle giriyor.
- Her tur ayrı bir PR. Codex temiz ve CI yeşilse birleşiyor.

## Kullanıcının vereceği kararlar

Bu kararlar ilgili faza gelmeden sorulacak; o zamana kadar varsayılan
yazılan.

| Karar | Etkilediği | Varsayılan |
|---|---|---|
| **Platform:** yalnız web mi, masaüstü ve Steam de mi? | Faz 5'in kapsamı | yalnız web |
| **Sunucu:** Lite'ın lig sunucusu ana oyuna açılsın mı? Yayın ve maliyet kullanıcının hesabında. | Faz 2 | Faz 2'ye gelmeden sorulacak |
| **Gelir modeli:** tamamen ücretsiz mi, ücretsiz web + ücretli masaüstü mü? | Faz 5 | ücretsiz |
| **Lite:** App Store yayını ve canlı işletim bu haritanın neresinde? | sıra | ayrı hat, bu haritanın dışında |
