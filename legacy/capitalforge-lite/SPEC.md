# CapitalForge Lite — Qwen Coder Master Build Spec

Bu belge, CapitalForge Lite adlı oyunun tek kaynak şartnamesidir.

Qwen Coder bu belgeyi okuyarak boş repository içinde oyunu sıfırdan oluşturmalıdır.

Bu proje için öncelik:

- Basitlik
- Eğlence
- Hemen oynanabilirlik
- Çalışan kod
- Gereksiz karmaşıklıktan kaçınmak

Qwen Coder, bu belgede olmayan büyük sistemleri kendi başına eklememelidir.

---

## 1. Qwen Coder İçin Ana Talimat

Sen bu repoda sıfırdan bir web oyunu oluşturacaksın.

Repository şu an boş olabilir veya sadece bu spec dosyası bulunabilir.

Görevin:

1. Bu spec dosyasını okumak
2. Aşağıdaki kurallara göre oyunu tasarlamak
3. Gerekli tüm dosyaları repository içine eklemek
4. Oyunu çalışır ve test edilebilir hale getirmek
5. README.md dosyasını oluşturmak
6. Sonunda kısa bir doğrulama checklist’i vermek

Önemli kurallar:

- Build adımı gerektiren bir sistem kurma.
- Framework kullanma.
- npm bağımlılığı zorunlu hale getirme.
- Three.js kullanma.
- Harici asset kullanma.
- Kod çalışır olmalı.
- Placeholder veya TODO bırakma.
- Oyun doğrudan index.html açıldığında çalışmalı.
- Tüm oyun metinleri Türkçe olmalı.
- Basit ama eğlenceli bir oyun hissi oluştur.

---

## 2. Ürün Özeti

Oyun adı:

CapitalForge Lite

Tür:

Basit, eğlenceli, 2D grid tabanlı iş kurma / şehir büyütme oyunu.

Oyuncu küçük bir girişimci olarak başlar.

Amaç:

- Arsalar satın almak
- Binalar inşa etmek
- Saniyede gelir elde etmek
- Mutluluğu yönetmek
- Görevleri tamamlamak
- Rastgele olaylara karar vermek
- Rakip şirketten daha büyük bir ekonomik güç haline gelmek

Oyun ciddi bir kapitalizm simülasyonu olmak zorunda değildir.

Oyun hissi şu olmalı:

“Bir tık daha yapayım, biraz daha büyüyeyim, yeni binayı açayım.”

---

## 3. Teknik Gereksinimler

Oyun şu teknolojilerle yapılmalı:

- HTML
- CSS
- Vanilla JavaScript

Kullanılmaması gerekenler:

- React
- Vue
- Svelte
- Angular
- Vite
- Webpack
- TypeScript build zorunluluğu
- Three.js
- Phaser
- Bootstrap
- Tailwind
- jQuery
- npm runtime bağımlılıkları

Oyun doğrudan tarayıcıda çalışmalı.

Açılış noktası:

index.html

Gerekli dosyalar:

index.html
styles.css
game.js
README.md

game.js, index.html içinde klasik script olarak yüklenmeli.

ES module kullanma.

Şu kullanım tercih edilmeli:

<script src="game.js"></script>

Oyun localStorage kullanarak kayıt almalı.

---

## 4. Hedef Dosya Yapısı

Repository kökünde şu dosyalar olmalı:

index.html
styles.css
game.js
README.md
CAPITALFORGE_LITE_SPEC.md

Ek klasör zorunlu değildir.

Eğer görsel asset gerekiyorsa harici dosya yerine emoji kullanılmalı.

---

## 5. Oyun Alanı

Oyun 10x10 grid tabanlı bir harita kullanmalı.

Toplam 100 kare olsun.

Her kare bir arsadır.

Arsalar dört durumda olabilir:

1. Boş satılık arsa
2. Oyuncuya ait boş arsa
3. Oyuncuya ait binalı arsa
4. Rakibe ait arsa

Her arsanın şu bilgileri olsun:

- id
- x
- y
- owner: null, "player", "rival"
- building: null veya bina id
- price

Arsa fiyatı başlangıçta rastgele belirlenmeli.

Basit fiyat aralığı:

Minimum 50
Maksimum 500

Merkeze yakın arsalar biraz daha pahalı olabilir.

---

## 6. Temel Oyun Kaynakları

Oyunda şu kaynaklar olmalı:

- Para
- Gelir/saniye
- Toplam kazanılan para
- Mutluluk
- Rakip skoru

Başlangıç değerleri:

Para: 500
Gelir/saniye: 0
Toplam kazanılan para: 0
Mutluluk: 10
Rakip skoru: 0

Mutluluk 0 ile 100 arasında olmalı.

Mutluluk bonusu:

Gerçek gelir = temel gelir * (1 + mutluluk * 0.005)

Örnek:

Mutluluk 10 ise gelir bonusu %5 olur.

Mutluluk 100 ise gelir bonusu %50 olur.

---

## 7. Binalar

Binalar basit, okunabilir ve emoji tabanlı olmalı.

Bina tanımları:

Kafe
Emoji: ☕
Maliyet: 100
Gelir/saniye: 1
Mutluluk etkisi: +1

Market
Emoji: 🛒
Maliyet: 250
Gelir/saniye: 3
Mutluluk etkisi: +1

Ofis
Emoji: 🏢
Maliyet: 600
Gelir/saniye: 7
Mutluluk etkisi: 0

Fabrika
Emoji: 🏭
Maliyet: 1500
Gelir/saniye: 18
Mutluluk etkisi: -2

Park
Emoji: 🌳
Maliyet: 300
Gelir/saniye: 0
Mutluluk etkisi: +8

Banka
Emoji: 🏦
Maliyet: 5000
Gelir/saniye: 60
Mutluluk etkisi: 0

Banka başta kilitli olmalı.

Banka açılma koşulu:

Toplam kazanılan para >= 5000

Banka kilitliyken UI’da kilitli görünsün.

Kilit açıldığında oyuncuya küçük bir bildirim gösterilebilir.

---

## 8. Satın Alma ve İnşa Akışı

Oyuncu boş bir arsaya tıklayınca panel açılmalı.

Eğer arsa satılıksa:

- Arsa fiyatı gösterilmeli
- Satın alma butonu olmalı
- Para yetersizse buton disabled olmalı

Oyuncu arsayı satın aldıktan sonra aynı arsaya bina inşa edebilir.

Eğer arsa oyuncuya ait boş arsa ise:

- Bina listesi gösterilmeli
- Her binanın maliyeti ve geliri görünmeli
- Para yetersizse bina butonu disabled olmalı
- Kilitli bina varsa kilitli görünmeli

Eğer arsa rakibe aitse:

- Satın alınamaz
- Sadece bilgi gösterilir

Eğer arsada bina varsa:

- Bina bilgisi gösterilir
- İstenirse basit gelir bilgisi gösterilir

---

## 9. Gelir Döngüsü

Oyun gerçek zamanlı çalışmalı.

Her saniye bir tick çalışmalı.

Her tickte:

1. Oyuncunun toplam temel geliri hesaplanmalı
2. Mutluluk bonusu uygulanmalı
3. Para artırılmalı
4. Toplam kazanılan para artırılmalı
5. UI güncellenmeli

Gelir formülü:

gercekGelir = temelGelir * (1 + mutluluk * 0.005)

Gelir küsuratlı olabilir.

UI’da para tam sayı olarak gösterilebilir.

---

## 10. Rakip Şirket

Oyunda basit bir rakip olmalı.

Rakip adı:

Rakip AŞ

Rakip her 10 saniyede bir hamle yapmalı.

Rakip hamlesi:

1. Boş ve satılık bir arsa seç
2. Arsayı satın al
3. Rastgele bir bina inşa et
4. Rakip skorunu artır

Rakip skoru:

Her rakip binası +10 puan

Rakip, oyuncunun parasını etkilemez.

Rakip sadece yarış hissi verir.

Topbar’da şu gösterilmeli:

Oyuncu skoru
Rakip skoru

Oyuncu skoru basitçe şu olabilir:

Her oyuncu binası +10 puan

Eğer oyuncu rakip skorundan daha yüksekse küçük bir “öndesin” göstergesi olabilir.

---

## 11. Rastgele Olaylar

Oyunda rastgele olaylar olmalı.

İlk olay 20 saniyeden önce gelmemeli.

Sonraki olaylar 25-40 saniye arasında rastgele gelmeli.

Aynı anda sadece bir aktif olay olabilir.

Olaylar panelde veya modal benzeri bir alanda gösterilmeli.

Her olayda:

- Başlık
- Açıklama
- İki seçenek
- Her seçeneğin etkisi

Oyuncu bir seçim yapınca olay kapanmalı ve etkiler uygulanmalı.

Olay örnekleri:

Olay 1:

Başlık: Sosyal Medya Trendi
Açıklama: Kafenler sosyal medyada trend oldu.
Seçenek A: Reklam kampanyası başlat
Etki: -200 para, +10 mutluluk
Seçenek B: Sakin kal
Etki: +5 mutluluk

Olay 2:

Başlık: Vergi İndirimi
Açıklama: Belediye kısa süreli vergi indirimi açıkladı.
Seçenek A: Nakit ödeyip teşvik al
Etki: -300 para, +500 para
Seçenek B: Bekle
Etki: hiçbir şey olmaz

Olay 3:

Başlık: Fabrika Protestosu
Açıklama: Fabrika bölgesinde küçük bir protesto var.
Seçenek A: Halkla ilişkiler yap
Etki: -250 para, +8 mutluluk
Seçenek B: Görmezden gel
Etki: -8 mutluluk

Olay 4:

Başlık: Yatırımcı Meleği
Açıklama: Bir yatırımcı melek senin girişimine ilgi duyuyor.
Seçenek A: Yatırım kabul et
Etki: +800 para, -5 mutluluk
Seçenek B: Reddet
Etki: +5 mutluluk

Olay 5:

Başlık: Şehir Festivali
Açıklama: Şehirde festival düzenleniyor.
Seçenek A: Stant aç
Etki: -150 para, +12 mutluluk
Seçenek B: Katılma
Etki: -3 mutluluk

Eğer oyuncunun parası seçeneğin maliyetini karşılamıyorsa o seçenek disabled olabilir.

---

## 12. Görevler

Oyunda görev sistemi olmalı.

Görevler sol panelde listelenmeli.

Tamamlanan görevler işaretlenmeli.

Görevler otomatik takip edilmeli.

Örnek görevler:

Görev 1:

Ad: İlk Mülk
Koşul: 1 arsa satın al
Ödül: +200 para

Görev 2:

Ad: Girişimci
Koşul: 3 bina inşa et
Ödül: +500 para

Görev 3:

Ad: Kafe Zinciri
Koşul: 3 kafe sahip ol
Ödül: +300 para

Görev 4:

Ad: Yeşil Şehir
Koşul: 2 park inşa et
Ödül: +400 para

Görev 5:

Ad: Zenginlik
Koşul: Toplam 5000 para kazan
Ödül: +1000 para

Görev 6:

Ad: Rakibe Fark At
Koşul: Rakip skorundan 50 puan öne geç
Ödül: +800 para

Görev ödülü verildikten sonra görev tamamlandı olarak işaretlenmeli.

---

## 13. UI Gereksinimleri

Arayüz üç ana bölgeden oluşmalı.

Üst bar:

- Oyun adı
- Para
- Gelir/saniye
- Mutluluk
- Oyuncu skoru
- Rakip skoru
- Kaydet butonu
- Yükle butonu
- Sıfırla butonu

Sol panel:

- Bina listesi
- Görevler
- Aktif olay
- Olay geçmişi opsiyonel

Orta alan:

- 10x10 oyun grid’i

Grid kareleri:

- Boş arsa: koyu gri
- Satılık arsa: hafif vurgulu
- Oyuncu arsası: yeşilimsi
- Rakip arsası: kırmızımsı
- Bina varsa emoji göster
- Seçili arsa belirgin şekilde vurgulanmalı

Responsive davranış:

Masaüstünde üç bölgeli düzen olabilir.

Dar ekranda panel alta geçebilir.

Çok gelişmiş responsive gerekmez ama oyun mobilde tamamen bozulmamalı.

---

## 14. Görsel Stil

Oyun modern ve eğlenceli görünmeli.

Stil kuralları:

- Koyu arka plan
- Renkli kartlar
- Yuvarlatılmış köşeler
- Hover efektleri
- Disabled butonlar soluk görünmeli
- Emoji kullanımı serbest
- Çok parlak olmayan renkler
- Okunabilir font boyutları
- Butonlar tıklanabilir his vermeli

Renk paleti önerisi:

Arka plan: #0b1220
Panel: #111a2c
Border: rgba(255,255,255,0.08)
Ana renk: #4cc9f0
Para rengi: #90be6d
Uyarı rengi: #ffd166
Negatif renk: #ef476f

---

## 15. Save Sistemi

Oyun localStorage kullanmalı.

Autosave:

Her 10 saniyede bir otomatik kayıt yapılmalı.

Manual save:

Topbar’da Kaydet butonu olmalı.

Manual load:

Topbar’da Yükle butonu olmalı.

Reset:

Topbar’da Sıfırla butonu olmalı.

Reset butonu önce confirm sormalı.

Save içeriği şu bilgileri içermeli:

- Para
- Gelir
- Mutluluk
- Toplam kazanılan para
- Oyuncu skoru
- Rakip skoru
- Arsalar
- Görev durumları
- Banka kilidi açıldı mı
- Son olay zamanı opsiyonel

Load sonrası oyun kaldığı yerden devam etmeli.

Save bozuksa oyun yeni oyun başlatmalı ve console’da hata fırlatmamalı.

---

## 16. Oyun State Yapısı

Kod içinde tek bir state objesi kullanılabilir.

Önerilen state alanları:

state.money
state.baseIncome
state.happiness
state.totalEarned
state.playerScore
state.rivalScore
state.tiles
state.quests
state.activeEvent
state.lastEventTime
state.bankUnlocked
state.autosaveTimer
state.selectedTileId

Her tile için önerilen yapı:

tile.id
tile.x
tile.y
tile.owner
tile.building
tile.price

building değeri null veya bina id olabilir.

Örnek bina id’leri:

cafe
market
office
factory
park
bank

---

## 17. Kod Kalitesi Kuralları

Kod mümkün olduğunca okunabilir olmalı.

Kurallar:

- Fonksiyonlar küçük ve anlamlı olmalı
- Magic number yerine sabitler kullanılmalı
- UI render fonksiyonu gereksiz yere devasa olmamalı
- Oyun tick fonksiyonu ayrı olmalı
- Render fonksiyonu ayrı olmalı
- Event handler’lar ayrı olmalı
- Save/load fonksiyonları ayrı olmalı
- Global değişken sayısı makul tutulmalı
- Console’da kritik hata olmamalı
- Alert kullanımı sadece reset confirm için olabilir

---

## 18. README.md Gereksinimleri

Qwen Coder bir README.md dosyası oluşturmalı.

README içeriğinde şunlar olmalı:

- Oyun adı
- Kısa açıklama
- Nasıl çalıştırılır
- Nasıl oynanır
- Oyun mekanikleri
- Save sistemi
- Kullanılan dosyalar
- Gelecek fikirler

Çalıştırma açıklaması basit olmalı:

index.html dosyasını tarayıcıda aç.

README Türkçe olmalı.

---

## 19. Kapsam Dışı

Bu ilk sürümde şunlar olmayabilir:

- Three.js
- Gerçek zamanlı multiplayer
- Backend
- Login sistemi
- Veritabanı
- Borsa
- Kredi sistemi
- IPO
- Teknoloji ağacı
- Enerji sistemi
- Lojistik sistemi
- District sistemi
- Derin NPC AI
- Ses efektleri
- Müzik
- Animasyonlu araçlar
- Harita editörü

Bunlar sonraki sürümlerde eklenebilir.

Qwen Coder bu sistemleri kendi başına eklememeli.

---

## 20. Kabul Kriterleri

Qwen Coder işi tamamlamadan önce şu maddeleri doğrulamalı:

1. index.html açılınca oyun başlıyor
2. Console’da kritik hata yok
3. 10x10 grid görünüyor
4. Arsaya tıklanınca panel açılıyor
5. Arsa satın alınabiliyor
6. Bina inşa edilebiliyor
7. Bina gelir üretiyor
8. Mutluluk bonusu çalışıyor
9. Rakip şirket otomatik büyüyor
10. Oyuncu ve rakip skoru güncelleniyor
11. Görevler takip ediliyor
12. Görev ödülleri veriliyor
13. Rastgele olaylar çıkıyor
14. Olay seçenekleri çalışıyor
15. Banka 5000 toplam kazançtan sonra açılıyor
16. Kaydet butonu çalışıyor
17. Yükle butonu çalışıyor
18. Autosave çalışıyor
19. Sıfırla butonu çalışıyor
20. Para yetersizken butonlar disabled oluyor
21. UI okunabilir
22. README.md mevcut

---

## 21. Uygulama Sırası

Qwen Coder şu sırayla ilerlemeli:

1. Basit HTML iskeletini oluştur
2. CSS temel düzenini kur
3. Grid oluştur
4. State yapısını kur
5. Tile render et
6. Arsa satın alma sistemini ekle
7. Bina inşa sistemini ekle
8. Gelir tick sistemini ekle
9. Mutluluk sistemini ekle
10. Rakip sistemini ekle
11. Görev sistemini ekle
12. Rastgele olay sistemini ekle
13. Save/load sistemini ekle
14. UI polish yap
15. README.md ekle
16. Acceptance criteria üzerinden kontrol et

---

## 22. Qwen Coder Teslim Formatı

Qwen Coder teslim ederken şunları yapmalı:

- Gerekli tüm dosyaları repository’ye eklemeli
- Kodun çalıştığını varsayarak teslim etmemeli; mümkünse kontrol etmeli
- Eğer environment yoksa en azından söz dizimi hatası olmadığını garanti etmeli
- Son mesajında kısa bir checklist vermeli

Örnek teslim checklist:

- index.html oluşturuldu
- styles.css oluşturuldu
- game.js oluşturuldu
- README.md oluşturuldu
- Oyun temel döngüsü çalışıyor
- Save/load eklendi
- Görevler eklendi
- Olaylar eklendi
- Rakip sistemi eklendi

---

## 23. Önemli Son Not

Bu oyun ilk sürüm olacak.

Amaç mükemmel mimari değil.

Amaç:

- Çalışan
- Eğlenceli
- Basit
- Hemen oynanabilir
- Geliştirilebilir

bir başlangıç sürümü oluşturmak.

Qwen Coder, bu belgeyi tek kaynak olarak kabul etmeli ve belgede olmayan büyük özellikleri eklememeli.