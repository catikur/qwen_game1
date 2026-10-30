# Capital — Yol Haritası

> Tur 47'de yazıldı, her turda güncelleniyor (son: Tur 75). Biten işin ayrıntısı
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
| **1 · Ürün temeli** | Oyun bir ürün gibi davransın | 47–50 | Kuruluyor, çevrimdışı açılıyor, tek Ayarlar paneli var, müzik var | **bitti** (Tur 50) |
| **2 · Çevrimiçi rekabet** | Herkes aynı şehirde | 51–55 | Pages'te paylaşılan tablo var, skor sunucuda doğrulanıyor | **bitti** (Tur 55) |
| **3 · Yeni yollar** | Her koşu farklı bir şirket | 56–61 | Zafere en az üç farklı yol var, her birini kazanan bir vekil var | **bitti** (Tur 61) |
| **4 · Şehrin hissi** | Oynaması keyifli | 62–65 | Mevsim ve hava görünüyor, önemli anlar hissediliyor | **bitti** (Tur 65) |
| **5 · Platform ve topluluk** | Oyunun evi büyüsün | 66–70 | Masaüstü sürümü ve paylaşılabilir senaryolar var | **bitti** (Tur 70) |
| **6 · Yayına hazırlık** | Steam'de 1.0 | 71–75 | Masaüstü bir uygulama gibi davranıyor, oyun kumandayla oynanıyor, Workshop ve skor tabloları Steam'de, 1.0 çıktı | **bitti** (Tur 75) |
| **7 · İkinci şehir ve ticaret** | Şehirler birbirine bağlansın | 76–80 (taslak) | İkinci şehrin kendi kimliği var, şehirler arasında mal akıyor, ticaret bir yol | **sıradaki** (taslak turlar Tur 75'te) |
| **8 · Lite'ı güncelleme** | Lite ana oyunun çizgisine gelsin | 81–85 (taslak) | Lite'ın eksikleri ölçülmüş ve kapanmış, aynı sunucunun bugünkü sürümüyle çalışıyor | sırada |

### Faz 1 · Ürün temeli

Kullanıcı "fazı baştan sona yürüt" dedi:
- turlar sırayla geliyor, her tur ayrı bir PR;
- Codex temiz ve CI yeşilse birleşiyor;
- rapor fazın sonunda.

| Tur | İş | Durum |
|---|---|---|
| **47 · Ayarlar ve erişilebilirlik** | Tek Ayarlar paneli: dil, görünüm, metin boyutu, renk körlüğüne uygun palet, hareketi azaltma, ayrı ses düzeyleri, kısayollar. Pencerelerde klavye sözleşmesi (odak, Tab, Escape). | bitti (#76) |
| **48 · Kurulabilir ve çevrimdışı oyun** | Simge ve kurulum, çevrimdışı açılış, yayından sonra "yeni sürüm hazır" bildirimi. Tur 46'daki "eski sayfa yeni parçayı bulamıyor" sorununu kökten çözer. | bitti (#77) |
| **49 · Müzik** | Gündüz, gece ve kriz katmanları olan dinamik müzik; Tur 47'deki ses düzeyleriyle birleşir. | bitti (#78) |
| **50 · Değerlendirme ve tanıtım** | Yeni oyuncu, telefon ve ilk saat değerlendirmesi. Tanıtım malzemesi: ekran görüntüleri, TR/EN tanıtım metni. Faz 1 raporu. | bitti (#79) |

### Faz 2 · Çevrimiçi rekabet

Kullanıcı sunucuyu açtı ve "Faz 2'yi yürüt" dedi; Faz 1'deki gibi turlar
sırayla, her tur ayrı PR, rapor fazın sonunda.

| Tur | İş | Durum |
|---|---|---|
| **51 · Lig sunucusu ana oyuna** | Lite'ın sunucusu ana oyunun koşularını da alıyor, Pages'te paylaşılan tablo oluyor. | bitti (#80) |
| **52 · Sunucuda doğrulama** | Gönderilen koşu sunucuda yeniden oynanıyor, skor orada hesaplanıyor. Simülasyon da sunucu da TypeScript. Bu, DURUM'daki en eski güvenlik açığını kapatır. | bitti (#81) |
| **53 · Haftanın kuralı ve günlük kısa koşu** | Ligde ek kurallar her hafta dönüyor; bir de 90 günlük günlük koşu geliyor. | bitti (#82) |
| **54 · Hayalet eğri** | Liderlerin değer eğrisi senin koşunun üstünde görünüyor ("lider 300. günde ne yapmıştı"). | bitti (#83) |
| **55 · Davetli ligler ve arkadaş tablosu** | Lite'ta var, ana oyuna geliyor. | bitti (#84) |

Kodu ve yerel sunucu testlerini Claude yapıyor. Canlı yayın kullanıcının
hesabında; canlı veritabanına yazılmıyor. Tur 51'den beri canlı sunucu
eski sürümde kaldıkça Pages'teki oyun yerel tabloyla açılıyor; güncelleme
adımları `ios-lite/README.md`'de ("Sunucuyu güncellerken"). Tur 52'den beri
sıra: Workers Paid, şema, kod. Simülasyonu değiştiren her birleşmeden sonra
Worker yeniden dağıtılıyor; o zamana kadar yeni koşular bekliyor. Tur 53
şemayı değiştirmiyor, yalnız kodu; oyun yeni kodu (`"daily":1`) görene kadar
yerel tabloyla açılıyor. Tur 54 sunucuya ve simülasyona dokunmuyor; Worker
olduğu gibi kalıyor. Tur 55 şemayı değiştiriyor (iki yeni tablo): önce şema,
sonra kod; oyun `"friends":1` görene kadar arkadaş liglerini göstermiyor.
Faz 2'nin raporu `docs/DURUM.md`'de, Tur 55 bölümünün sonunda. Canlıya
geçiş 23 Ekim'de yapıldı: şema (D1 konsolunda `d1-console.sql`) ve Tur 55'in
kodu.

### Faz 3 · Yeni yollar

Kullanıcı Faz 2'nin sonunda "devam edelim" dedi; turlar yine sırayla, her
tur ayrı PR, Codex temiz ve CI yeşilse birleşiyor.

| Tur | İş | Durum |
|---|---|---|
| **56 · Lojistik** | Nakliye terminali (filolu lojistik binası), rakip mağazalarına taşıma sözleşmeleri, ücret rakibin tasarrufundan; kamyonlar rakibin vitrinine gidiyor. | bitti (#86) |
| **57 · Enerji** | Şebeke fiyatı (bakımın enerji payı), doğalgaz santrali ve güneş tarlası, yeni kriz: enerji krizi; yakıt sabitleme. Santral önce kendi binalarına, sonra rakiplere. | bitti (#87) |
| **58 · Gayrimenkul geliştiricisi** | Konut Sitesi ve Ofis Kampüsü (inşaatı süren, kiracısı zamanla gelen projeler), kira ayarı ve doluluk, kentsel dönüşüm hakkı (imar artışı, hak sahipleri) ve dönüşüm başvurusu. | bitti (#88) |
| **59 · Rakipler 2.0** | CEO'nun mizacı ve geçmişi; oyuncuya karşı ilişki puanı ve hafıza (hisse, ihale, meclis, nakliye, fiyat kırma, kampanya); husumette rövanş fiyat savaşı, mecliste karşı bağış, rafına mağaza, inadına teklif; ittifakta tersi; uzlaşma. | bitti (#89) |
| **60 · Senaryo paketi II** | Herkesin nakliyecisi (Aç gözlü rakipler, kinli iki rakip), Karanlık kış (Sıkı banka, enerji krizi), Kentsel dönüşüm (Kıt arsa); üç yeni hedef: taşınan mağaza, rakiplere satılan elektrik, dolu birim ve dönüşüm projesi. Kinli rakip taşıma teklifi getirmiyor. | bitti (#90) |
| **61 · Değerlendirme** | Strateji çeşitliliği ölçülüyor, her yol için ayrı vekil. Kârın kaynağı defteri ve şirketin yolu (Hedefler, zafer ekranı, kariyer, Üç yol rozeti); taşıma teklifinde müşterinin yarıştaki yeri. Üç yol gerçek (perakende, devralma, gayrimenkul), enerji ve nakliye yan iş kolu. Faz 3 raporu. | bitti (#91) |

Faz 3 simülasyonu değiştiriyor: her birleşmeden sonra Worker yeniden
dağıtılıyor (`ios-lite/README.md`, "Sürüm uyumu"); o zamana kadar yeni
koşular bekliyor. Tur 61 simülasyona dokunmuyor (lig izi aynı); Tur 56–60
için tek dağıtım yeterli. Faz 3'ün raporu `docs/DURUM.md`'de, Tur 61
bölümünün sonunda.

### Faz 4 · Şehrin hissi

- **62 · Mevsim ve hava.** Simülasyondaki mevsimler şehirde görünür oluyor.
  Altı hava, mevsimin ağırlıklarıyla üç günlük dönemler; havası olan olay
  (sahilde fırtına, kuraklık) şehrin havasını belirliyor. Ağaçlar ve çimen
  mevsimin renginde, kar zemini ve çatıları beyazlatıyor, yağmur ve kar
  yağıyor, bulut ışığı kısıyor. Üst barda "Kış · Karlı", Ayarlar'da "Yağmur
  ve kar". Hava görünüm: simülasyona dokunmuyor, lig izi aynı. — bitti (#92)
- **63 · Önemli anlar.** İnşaatta toz ve yerde halka; şantiye açılış günü
  iskeletin boyundan yükseliyor; yıkımda toz. Devralınan binaların çatısı
  yeni sahibin merkezinden dışa doğru bir dalgayla onun rengine dönüyor,
  ekranın üstünde "… artık senin". Her gün en çok kazandıran üç binanın
  çatısından dünkü kâr yükseliyor, kasa sayarak değişiyor. Zaferde şehrin
  üstünde havai fişek, zafer ekranı ardından. Azaltılmış harekette hiçbiri
  çizilmiyor. Görünüm: lig izi aynı. — bitti (#93)
- **64 · Paylaşılabilir şehir kartı.** Koşunun özeti tek bir görselde:
  1200 × 630 PNG, solda şirket, sonuç, gün, dört sayı ve şirketin yolu,
  sağda şehrin kuşbakışı (şirketin binalarını sığdıran sabit bir bakış).
  Zafer, senaryo ve lig sonucu, oyun sonu ekranlarında ve Hedefler'de;
  indir ya da paylaş. Görünüm: lig izi aynı. — bitti (#94)
- **65 · Değerlendirme ve telefon performansı.** Telefon görünümünde (CPU 4×
  yavaş) yeni özelliklerin yükü gürültünün içinde; günün JS'inden üç kalem
  çıktı: tuvalin yeri her karede okunmuyor, tarih biçimleyicisi ve renkler
  bir kez kuruluyor. Kaydın dosya adı ASCII. Faz 4 raporu `docs/DURUM.md`'de,
  Tur 65'in sonunda. — bitti (#95)

### Faz 5 · Platform ve topluluk

Kullanıcı fazın kapsamını Tur 66'dan önce seçti: web, masaüstü ve Steam;
oyun her yerde tamamen ücretsiz. Turlar Faz 4'teki gibi.

- **66 · Masaüstü sürümü.** Tauri 2 kabuğu (`apps/desktop`), oyun aynı web
  paketi (`--mode desktop`). Kayıt slotları ve ayarlar uygulamanın veri
  dizininde dosya; dışa aktarma ve şehir kartı İndirilenler'e; pencere
  kapanırken otomatik kayıt. Derlenmiş oyun gerçek penceresinde sınanıyor
  (Linux, WebKitGTK). Steam'e hazırlık `docs/MASAUSTU.md`'de: depolar, Steam
  Cloud yolları, kullanıcının hesabında yapılacaklar. Lig sunucusu
  masaüstünün kökenlerini kabul ediyor (Worker dağıtımıyla canlıya). — bitti (#96)
- **67 · İçerik paketleri.** Senaryo ve kurallar dosyadan: JSON paket
  (`capitalforge-pack` 1), her sorunu yeriyle söyleyen doğrulayıcı, hazır
  dört kuralın ayarları sınırlar içinde. Kurulum ekranında "Kendi
  senaryoların": kod, JSON ya da dosyayla ekle; kodu ya da bağlantıyı
  (`?paket=`) paylaş. Senaryonun tanımı kayıtta; paketten gelen koşu
  kariyere sayılmıyor. Biçim `docs/ICERIK-PAKETI.md`'de. — bitti (#97)
- **68 · Tarayıcıda senaryo editörü.** Kurulum ekranında paketi alan alan
  kuran pencere: sınırlar doğrulayıcının kendi tablolarından, sorun alanın
  altında, ön izleme kurulum ekranındaki kart. "Dene" taslağı kaydetmeden
  oynatıyor, menüde editör kaldığı yerde; rafa kaydet, dosya olarak indir,
  raftaki paketi düzenle. Taslak cihazda. Hedef cümlesinin yer tutucuları
  doğrulanıyor. — bitti (#98)
- **69 · Üçüncü dil: Almanca.** İçerik, çekirdek ve arayüzün her metni
  Almancada; sözlük ayrı parçada, dil seçilince iniyor. Sayı, yüzde ve para
  dil başına bir biçim tablosunda ("45 %", "1,2 Mio. ₺"); paket metninde
  Almanca yoksa İngilizcesi. Seçicide dil sırası sabit; lens düğmeleri iki
  sütun (üç dilde de kesilmiyor). Yeni dil eklemenin kılavuzu ve denetim
  betiği `docs/CEVIRI.md`'de. — bitti (#99)
- **70 · Steam.** Kariyerin 29 rozeti Steam başarımı: masaüstü kabuğu
  `steam` özelliğiyle Steamworks'e bağlanıyor, Steam yoksa oyun aynı. Tek
  pencere (ikinci kopya açılmıyor). CI'da üç işletim sisteminin Steam deposu
  (macOS evrensel, Windows'ta WebView2 kurulum betiği). Mağaza sayfası üç
  dilde; başarım simgeleri, kapsüller, kütüphane görselleri ve logo gerçek
  oyundan bir araçla; ekran görüntüleri üç dilde. Steamworks'te yapılacaklar
  adım adım `docs/STEAM.md`'de. — bitti (#100)

Faz 5 Tur 70'le bitti (rapor `docs/DURUM.md`'de, Tur 70'in sonunda).

### Faz 6 · Yayına hazırlık

Kullanıcı sırayı Tur 71'den önce seçti: önce yayına hazırlık, sonra ikinci
şehir ve ticaret, sonra Lite. Steam hesabı kullanıcıda, bu fazla paralel
açılıyor.

- **71 · Değerlendirme: masaüstünün ilk saati.** Oyun masaüstünde bir web
  sayfası gibi davranmıyor: tarayıcı kısayolları (F5, Ctrl+R, Ctrl+P,
  Ctrl+F, Alt+←) ve sağ tık menüsü kapalı, metin seçilmiyor; F11 ve
  Alt+Enter tam ekran; pencere kaldığı boyda ve yerde açılıyor, ilk açılışta
  büyütülmüş. Steam Deck'te metin ilk açılışta "çok büyük" (Valve'ın
  okunabilirlik ölçüsü). 1100 pikselin altında üst üste binen paneller
  düzeldi (masaüstünün en küçük penceresi ve ölçekli dizüstüleri o
  aralıkta). Lig sunucusunun canlı denetimi simülasyon sürümünü
  karşılaştırıyor; CI dağıtımının hiç çalışmayan derlemesi düzeldi. Açık
  kalan 4.4 ve 4.10 yeniden değerlendirildi. — bitti (#101)
- **72 · Oyun kumandası ve yalnız klavye.** Fare olmadan parsel
  seçilemiyordu. Klavye ya da kumanda kullanılınca imleç kameranın
  ortasındaki parsel (nişangâh); Enter ve A seçiyor, kuruyor. Q/E ve +/−
  ile, kumandada çubuklarla ve tetiklerle kamera dönüyor ve yakınlaşıyor.
  Kumandada yön tuşu düğmeler arasında geziyor; LB/RB paneller, Y
  duraklat, X hız. Ekranın altında kumandanın düğme ipuçları var
  (PlayStation'da ✕ ○ □ △, Nintendo'da B A Y X). Steam Deck'te yazı
  alanı için Steam'in ekran klavyesi açılıyor; Steam Input'un önerilen
  düzeni `docs/STEAM.md`'de.
  — bitti (#102)
- **73 · Steam Workshop ve skor tabloları.** İçerik paketleri (Tur 67)
  Workshop'tan rafa iniyor, salt okunur; oyuncunun paketi rafın düğmesiyle
  Workshop'a yükleniyor, sonraki yükleme aynı öğeyi güncelliyor. Tohum
  Ligi'nin her haftasının ve gününün Steam'de bir tablosu: gönderilen
  koşunun puanı oraya da gidiyor, lig panelinde Steam arkadaşları. Gerçek
  Steam'de denemek için Steamworks uygulama kimliği gerekiyor (kullanıcı;
  `docs/STEAM.md` adım 8–9). — bitti (#103)
- **74 · Sürüm 1.0.** Sürüm tek bir sayı, 1.0.0 (`tools/set-version.mjs`
  yedi dosyayı birlikte değiştiriyor). Ayarlar'da Sürüm bölümü:
  "Yenilikler" (değişiklik günlüğü, üç dilde; eski sürümden gelen
  oyuncuya Ayarlar düğmesinde nokta) ve "Hata bildir" (not, kayıt ve uyarı
  günlüğüyle tek dosya; oyuncu info@conforcus.com'a yolluyor). Yayın
  listesi `docs/YAYIN.md`; macOS imzası sırlar gelince iş akışında. Oyunun
  Türkçe metinlerinin çoğu oyun ekranıyla iniyor: ana parça 74,6 KB'tan
  66 KB'a. — bitti (#104)
- **75 · Değerlendirme ve Faz 6 raporu.** Yayın listesi baştan sona kuru
  koşuldu, Tur 73–74'ün ekranları kumandayla ve Deck boyunda, 1.0 gerçek
  pencerede ve üç işletim sisteminin paketlerinde denendi. Hata raporu
  Kayıtlar'dan doğrudan açılıyor (önce "dosya bozuk" deniyordu). Kaydın
  neden açılmadığı oyuncunun dilinde; açılamayan otomatik kayıt kurulum
  ekranında söyleniyor. Oyunun daha yeni bir sürümünün otomatik kaydı
  (Steam'in beta dalı, Steam Cloud) artık ezilmiyor. Ayarlar'ın alt
  sayfasında Escape ve B bir adım geri, notu silmiyor. Yayın listesinin
  yanlışları düzeldi (`pnpm balance`, lig sunucusunun dağıtım kapısı,
  `/v1/seed/sim`). Düzeltmeler sürüm 1.0.1 olarak çıkıyor; Faz 6 raporu
  `docs/DURUM.md`'de. — bitti (#105)

### Faz 7 · İkinci şehir ve ticaret (taslak)

Kullanıcının isteği "ikinci şehrin eklenmesi ve ticareti". Holding bugün
üç şehre kadar çıkıyor (Tur 22, 30, 32), ama şehirler aynı kalıptan ve
aralarında yalnız para akıyor. Harita isteği iki parça okuyor (kullanıcı
başka bir şey kastettiyse Tur 76'dan önce düzeltilir):

- **İkinci şehrin kendi kimliği:** liman ya da sanayi kenti gibi; farklı
  talep, hammadde, rakipler ve kurallar.
- **Şehirler arası ticaret:** mal bir şehirde üretilip öbüründe satılıyor;
  nakliye terminali (Tur 56) şehirler arası hat işletiyor, fiyat farkı ve
  taşıma bedeli kâr ediyor. Açık iş 4.10'un (b) seçeneği (nakliye
  perakendenin dışında daha büyük bir mal akışına) burada büyüyor.

Taslak turlar (Tur 75'te yazıldı). Haritanın varsayılan okumasına göre;
kullanıcı Tur 76'dan önce değiştirmedi. Kayıt biçimi Tur 76'da değişti
(şema v7): Tur 75'ten beri eski sürüm yeni biçimin kaydını açamıyor ama
üstüne de yazmıyor. Sürüm numarası 1.1.0 (yeni içerik, eski kayıtlar
açılıyor). Lig her zaman dengeli şehirde; Tur 76 lig izini değiştirmedi.
Lig izini değiştiren tur (hat ve ticaret dengeli şehre de dokunursa) lig
sunucusunun dağıtımını istiyor (`docs/YAYIN.md` §4).

- **76 · Şehrin kimliği.** Dört tür: dengeli (bugünkü şehir), liman
  kenti, sanayi kenti, başkent. Tür bölge dizilişini ve onunla üretim
  arazisini, hammaddenin referans fiyatını, rakip kadrosunun ilk dördünü,
  bir kuralı (limanda nakliye, sanayide bakım ve sendika, başkentte arsa
  ve gelir) ve zafer eşiğini değiştiriyor. Eşik türün ekonomisiyle: beş
  yol vekilinin ortalama zafer günü dört türde 615–622. Firuze Grup hiçbir
  türün ilk dördünde değil (zaferi kilitliyordu). Tür kurulumda ve
  holding'in yeni şehrinde seçiliyor, üst barda yazıyor. Eski kayıtlar,
  Tohum Ligi ve senaryolar dengeli; lig izi aynı. Şema v7, sürüm 1.1.0.
  — bu PR
- **77 · Şehirler arası hat.** Nakliye terminali (Tur 56) iki şehri
  bağlıyor. Mal bir şehirde üretilip öbüründe rafa giriyor. Hattın
  kapasitesi, taşıma süresi (gün) ve bedeli var; yolda kalan mal
  bilançoda.
- **78 · Ticaretin fiyatı.** Şehirlerin pazar fiyatları ayrışıyor: bir
  şehrin bol hammaddesi öbüründe kıt. Fiyat farkı ve taşıma bedeli kâr
  ediyor. Rakipler de hat açıyor, fark daralıyor. Denge testinde yeni
  bölüm; ticaret tek başına bir yol mu, ölçülüyor.
- **79 · Ticaretle zafer.** Yeni hedef türü ("şehirler arası satış") ve
  iki senaryo. Ticaret zafere bir yol: onu kazanan bir vekil (Tur 61'in
  yöntemiyle).
- **80 · Değerlendirme ve Faz 7 raporu.**

### Faz 8 · Lite'ı güncelleme (taslak)

Lite (iOS, web, Android) L12'den beri değişmedi; ana oyun bu arada Faz
1–5'i yaşadı (ayarlar ve erişilebilirlik, müzik, mevsim ve hava, önemli
anlar, Almanca). Faz bir değerlendirmeyle açılıyor: Lite'ın hangi eksiği
oyuncunun gözünde, hangisi ortak sunucunun sözleşmesinde. Turlar o
ölçümden sonra.

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
| **Platform:** yalnız web mi, masaüstü ve Steam de mi? | Faz 5'in kapsamı | **web, masaüstü ve Steam** (kullanıcı, Tur 66'dan önce) |
| **Sunucu:** Lite'ın lig sunucusu ana oyuna açılsın mı? Yayın ve maliyet kullanıcının hesabında. | Faz 2 | **evet** (Tur 51'den önce kullanıcı açtı) |
| **Canlı güncelleme:** Tur 51'in sunucusu canlıya ne zaman? Tablo doğrulanmamış beyanla kesiliyor (Codex #80). | Faz 2 | **Tur 52 birleşince** (kullanıcı, Tur 51) |
| **Sunucuda doğrulama planı:** tekrar koşu başına 0,7–1,8 sn CPU; Workers'ın ücretsiz katmanı istek başına 10 ms. | Tur 52 | **Workers Paid, aylık 5 $** (kullanıcı, Tur 51) |
| **Gelir modeli:** tamamen ücretsiz mi, ücretsiz web + ücretli masaüstü mü? | Faz 5 | **tamamen ücretsiz** (kullanıcı, Tur 66'dan önce) |
| **Üçüncü dil:** hangisi? | Tur 69 | **Almanca** (varsayılan: Steam'de ekonomi oyunlarının güçlü pazarı, Latin alfabesi, sayı biçimi Türkçeyle aynı; kullanıcı değiştirebilir — çeviri katmanı dilden bağımsız, `docs/CEVIRI.md`) |
| **Lite:** App Store yayını ve canlı işletim bu haritanın neresinde? | sıra | **Faz 8: Lite'ı güncelleme** (kullanıcı, Tur 71'den önce; Tur 70'e kadar ayrı hattı) |
| **Faz 6–8'in sırası** | sıra | **yayına hazırlık → ikinci şehir ve ticaret → Lite** (kullanıcı, Tur 71'den önce) |
| **"İkinci şehir ve ticaret" nedir?** | Faz 7 | **ikinci şehrin kendi kimliği ve şehirler arası mal ticareti** (varsayılan: holding zaten üç şehre çıkıyor; kullanıcı Tur 76'dan önce değiştirebilir) |
| **Faz 7'nin turları** | Faz 7 | **76 şehrin kimliği · 77 şehirler arası hat · 78 ticaretin fiyatı · 79 ticaretle zafer · 80 değerlendirme** (taslak, Tur 75; kullanıcı Tur 76'dan önce değiştirebilir) |
| **Lig sunucusu her birleşmede kendiliğinden mi dağıtılsın?** | sunucu | **elle** (Tur 51, Codex #80). Tur 71'den beri canlı denetim eski simülasyonlu sunucuyu `main`'de kırmızıyla söylüyor; `LITE_LEAGUE_AUTODEPLOY=true` önerilir (`ios-lite/README.md`) |
