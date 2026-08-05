# CapitalForge Lite

Basit, eğlenceli, 2D grid tabanlı iş kurma / şehir büyütme oyunu.

## Nasıl Çalıştırılır?

1. `index.html` dosyasını herhangi bir modern web tarayıcısında açın (Chrome, Firefox, Edge, Safari).
2. Herhangi bir kurulum veya build adımı gerekmez.
3. Oyun otomatik olarak başlayacaktır.

## Nasıl Oynanır?

### Temel Amaç
- Arsalar satın alın
- Binalar inşa edin
- Gelir elde edin
- Mutluluğu yönetin
- Görevleri tamamlayın
- Rakip şirketten daha büyük olun

### Ekran Düzeni

| Bölge | İçerik |
|-------|--------|
| Üst bar | Kaynaklar (Para, Gelir/s, Mutluluk, Skorlar) ve Kaydet / Yükle / Sıfırla |
| Sol panel | Bina listesi, görevler, aktif rastgele olay |
| Orta alan | 10x10 oyun grid'i |
| Sağ panel | Seçili arsanın detayı ve işlemleri |

Aktif bir olay çıktığında olay kartı sol panelin en üstüne taşınır ve sağ alt köşede
bir bildirim gösterilir.

### Oyun Kontrolleri

**Grid üzerindeki arsaya tıklayarak:**
- Satılık arsaları satın alabilirsiniz
- Sahip olduğunuz arsalara bina inşa edebilirsiniz
- Rakip arsalarının bilgisini görebilirsiniz

Detay paneli grid'in yanında sabit durur, oyun tahtasını kapatmaz — arsadan arsaya
tıklayarak gezinebilirsiniz. `Esc` tuşu seçimi temizler. Kareler ve bina kartları
klavye ile de gezilebilir (Tab / Enter).

**Sol paneldeki bina kartına tıklamak:**
- Seçili boş arsanız varsa oraya inşa eder
- Seçim yoksa ilk boş arsanıza inşa eder ve hangi arsaya inşa edildiğini bildirir

## Oyun Mekanikleri

### Kaynaklar
- **Para**: Başlangıçta 500 para
- **Gelir/saniye**: Binalarınızdan gelen gelir
- **Mutluluk**: 0-100 arası, geliri %0-%50 arasında artırır
- **Oyuncu Skoru**: Her binanız +10 puan
- **Rakip Skoru**: Rakibin her binası +10 puan

Rakibin skorunu geçtiğinizde üst barda "Öndesin" rozeti belirir.

### Arsalar

10x10 = 100 arsa. Fiyatlar 50-500 para arasında rastgele belirlenir; merkeze yakın
arsalar belirgin şekilde daha pahalıdır.

### Binalar

| Bina | Emoji | Maliyet | Gelir/s | Mutluluk |
|------|-------|---------|---------|----------|
| Kafe | ☕ | 100 | 1 | +1 |
| Market | 🛒 | 250 | 3 | +1 |
| Ofis | 🏢 | 600 | 7 | 0 |
| Park | 🌳 | 300 | 0 | +8 |
| Fabrika | 🏭 | 1500 | 18 | -2 |
| Banka | 🏦 | 5000 | 60 | 0 |

**Not:** Banka, toplam 5000 para kazanana kadar kilitlidir.

### Gelir Formülü
```
Gerçek Gelir = Temel Gelir × (1 + Mutluluk × 0.005)
```

Örnek:
- Mutluluk 10 → %5 bonus
- Mutluluk 100 → %50 bonus

### Görevler

1. **İlk Mülk**: 1 arsa satın al → +200 para
2. **Girişimci**: 3 bina inşa et → +500 para
3. **Kafe Zinciri**: 3 kafe sahip ol → +300 para
4. **Yeşil Şehir**: 2 park inşa et → +400 para
5. **Zenginlik**: Toplam 5000 para kazan → +1000 para
6. **Rakibe Fark At**: Rakip skorundan 50 puan öne geç → +800 para

### Rastgele Olaylar

İlk olay 20-30 saniye arasında, sonraki olaylar bir öncekinin çözülmesinden
25-40 saniye sonra gelir. Aynı anda yalnızca bir olay aktif olur. Her olayda iki
seçenek bulunur; peşin para gerektiren seçenek paranız yetmiyorsa pasif kalır.

- Sosyal Medya Trendi
- Vergi İndirimi
- Fabrika Protestosu
- Yatırımcı Meleği
- Şehir Festivali

### Rakip Şirket

- **Rakip AŞ** her 10 saniyede bir hamle yapar
- Boş bir arsa satın alır ve rastgele bir bina inşa eder (banka hariç)
- Skorunuzu rakiple karşılaştırarak ilerlemenizi görebilirsiniz

## Save Sistemi

Oyun `localStorage` kullanarak kayıt alır:

- **Autosave**: Her 10 saniyede otomatik kaydedilir
- **Manuel Kaydet**: Üst bardaki "Kaydet" butonu ile
- **Yükle**: "Yükle" butonu ile son kaydı yükleyin
- **Sıfırla**: "Sıfırla" butonu ile oyunu başa döndürün (onay ister)

Kayda yalnızca veri yazılır (para, mutluluk, arsalar, görev durumları, aktif olayın
kimliği, banka kilidi). Görev koşulları ve olay etkileri kod tarafında sabit tutulur
ve yükleme sırasında kimlik üzerinden yeniden bağlanır. Bozuk veya eski sürüm bir
kayıt bulunursa oyun sessizce yeni oyun başlatır, konsola hata düşürmez.

## Dosyalar

| Dosya | Açıklama |
|-------|----------|
| `index.html` | Ana HTML iskeleti |
| `styles.css` | Koyu temalı UI stilleri |
| `game.js` | Tüm oyun mantığı (vanilla JS) |
| `README.md` | Bu dokümantasyon dosyası |
| `CAPITALFORGE_LITE_SPEC.md` | Oyun şartname dosyası |

## Teknik Özellikler

- Framework kullanılmamıştır (Vanilla JavaScript)
- Harici bağımlılık yoktur
- Emoji tabanlı grafikler
- Responsive tasarım (dar ekranda grid üstte, paneller altta)
- Klavye erişilebilirliği ve `prefers-reduced-motion` desteği
- Engelleyici `alert` yerine geçici bildirimler (yalnızca sıfırlama onayı `confirm` kullanır)
- Türkçe arayüz

## Gelecek Fikirler

Potansiyel geliştirmeler:
- Daha fazla bina türü
- Daha fazla görev ve olay
- Ses efektleri
- Liderlik tablosu
- Başarımlar sistemi
- Daha gelişmiş rakip AI

---

**CapitalForge Lite** - Eğlenceli ve basit bir kapitalizm simülasyonu!
