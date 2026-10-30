/**
 * Değişiklik günlüğü (Tur 74): oyun içindeki "Yenilikler" sayfası bunu
 * gösteriyor. En yeni sürüm başta. Her sürümün maddeleri üç dilde, aynı
 * sırada; `apps/web/test/version.test.ts` en yeni girdinin oyunun sürümü
 * olduğunu ve dillerin eşit olduğunu sınıyor.
 *
 * Geç inen parça: yalnız sayfa açılınca. Yeni sürüm: `tools/set-version.mjs`,
 * sonra buraya bir girdi (`docs/YAYIN.md` → "Sürüm").
 */
export const CHANGELOG_LOCALES = ['tr', 'en', 'de'] as const;
export type ChangelogLocale = (typeof CHANGELOG_LOCALES)[number];

export interface ChangelogEntry {
  /** "büyük.küçük.yama" */
  version: string;
  /** Yayın günü, YYYY-AA-GG. */
  date: string;
  notes: Record<ChangelogLocale, string[]>;
}

/** Girdinin o dildeki maddeleri; bilinmeyen dilde İngilizcesi. */
export function changelogNotes(entry: ChangelogEntry, locale: string): string[] {
  return (CHANGELOG_LOCALES as readonly string[]).includes(locale) ? entry.notes[locale as ChangelogLocale] : entry.notes.en;
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.5.0',
    date: '2026-10-30',
    notes: {
      tr: [
        'Hat formu artık hattın kendi etkisini tahmin ediyor: seçtiğin kamyonlarla 30 gün sonra iki şehrin fiyatı, birim ve günlük kâr. Dar pazarda kâr eksiye düşüyorsa kırmızıyla söylüyor, en kârlı kamyon sayısını öneriyor.',
        'Yardımda şehirler arası hatların adımı: terminal, fiyatlar, kâr, dar pazar ve rakipler. Holding\'in adımı yeni şehrin türünü anlatıyor.',
        'Kumandada sayı kutuları sağ-solla değişiyor: hattın kamyon sayısı, hisse adedi ve ihale teklifi ekran klavyesi olmadan da ayarlanıyor.',
        'Açılış daha hafif: kurulum ekranı oyunun panellerinin metinlerini artık indirmiyor, onlar oyunla geliyor.',
      ],
      en: [
        'The line form now estimates the line\'s own effect: with the trucks you pick, both cities\' prices, the margin per unit and the daily profit in 30 days. If a thin market pushes the margin below zero, it warns in red and suggests the most profitable number of trucks.',
        'The help has a step on lines between cities: terminals, prices, profit, thin markets and rivals. The holding step explains the new city\'s type.',
        'On a gamepad, number boxes change with left and right: a line\'s trucks, the share amount and an auction bid can be set without the on-screen keyboard.',
        'A lighter start: the setup screen no longer downloads the texts of the game\'s panels; they come with the game.',
      ],
      de: [
        'Das Linienformular schätzt jetzt die eigene Wirkung der Linie: mit den gewählten Lkw die Preise beider Städte, die Spanne je Einheit und den Tagesgewinn in 30 Tagen. Drückt ein kleiner Markt die Spanne unter null, warnt es rot und schlägt die rentabelste Zahl an Lkw vor.',
        'Die Hilfe hat einen Schritt zu Linien zwischen Städten: Terminals, Preise, Gewinn, kleine Märkte und Rivalen. Der Holding-Schritt erklärt den Typ der neuen Stadt.',
        'Am Controller lassen sich Zahlenfelder mit Links und Rechts verstellen: die Lkw einer Linie, die Aktienzahl und ein Auktionsgebot, ohne Bildschirmtastatur.',
        'Ein leichterer Start: Der Startbildschirm lädt die Texte der Spielfenster nicht mehr, sie kommen mit dem Spiel.',
      ],
    },
  },
  {
    version: '1.4.0',
    date: '2026-10-30',
    notes: {
      tr: [
        'Ticaretle zafer: iki yeni senaryo. Kahve yolu limandan sanayiye, Başkentin tedarikçisi sanayiden başkente. Hedef, şehirler arası hatlarınla 1 M ₺ kâr etmek.',
        'Hedefin ölçüsü kâr: hattın bugün yüklediği mal varışın fiyatıyla değerlenir, malın bedeli ve nakliye düşülür. Zarar eden gün toplamı azaltır. Hedef panelinde iki şehrin terminali, açık hatlar ve bugünkü kâr görünür.',
        'Zarar eden hat artık gündemde: tıklayınca Şehirler paneli açılır, kamyon çekebilir ya da hattı kapatabilirsin. Hattın satırında bugünkü kârı yazıyor.',
        'Senaryo editörü şehrin türünü ve ikinci şehrin türünü seçtiriyor; ticaret hedefi ikinci şehirle geliyor.',
      ],
      en: [
        'Victory through trade: two new scenarios. The Coffee Road runs from a port to an industrial city, Supplier to the Capital from an industrial city to the capital. The goal is to earn ₺1M from your lines between cities.',
        'The goal counts profit: what a line loads today is valued at the destination price, minus the goods and the freight. A losing day lowers the total. The goal panel shows both cities\' terminals, your open lines and today\'s profit.',
        'A losing line now shows up on the agenda: click it to open the Cities panel, where you can pull trucks or close the line. The line\'s row shows today\'s profit.',
        'The scenario editor lets you pick the city type and the second city\'s type; a trade goal comes with a second city.',
      ],
      de: [
        'Sieg durch Handel: zwei neue Szenarien. Die Kaffeestraße führt vom Hafen in die Industriestadt, Lieferant der Hauptstadt von der Industriestadt in die Hauptstadt. Das Ziel: 1 Mio. ₺ Gewinn mit deinen Linien zwischen den Städten.',
        'Das Ziel zählt Gewinn: Was eine Linie heute lädt, wird zum Preis am Ziel bewertet, abzüglich Ware und Fracht. Ein Verlusttag senkt die Summe. Das Zielfenster zeigt die Terminals beider Städte, die offenen Linien und den Gewinn von heute.',
        'Eine Linie im Minus steht jetzt auf der Agenda: Ein Klick öffnet das Fenster „Städte“, wo du Lkw abziehen oder die Linie schließen kannst. Die Zeile der Linie zeigt den Gewinn von heute.',
        'Im Szenario-Editor wählst du den Stadttyp und den Typ der zweiten Stadt; ein Handelsziel bringt eine zweite Stadt mit.',
      ],
    },
  },
  {
    version: '1.3.0',
    date: '2026-10-30',
    notes: {
      tr: [
        'Ticaretin fiyatı: hat fazla yetmezse eksiğini çıkış şehrinin pazarından alabilir. Mal bir şehirde ucuz, öbüründe pahalıysa üretimsiz de kâr eder; varışta kendi tesislerine gider ya da pazara satılır.',
        'Şehirlerin fiyatları Şehirler panelinde yan yana: her malın en ucuz ve en pahalı şehri, en kârlı yönü ve birim kârı. Hat satırı alışı, satışı, nakliyeyi ve birim kârı gösteriyor.',
        'Fark daralıyor: pazardan alındıkça çıkış şehrinde fiyat yükselir, satıldıkça varışta düşer. Kârlı bir yolu rakipler de görür; bir ay sonra kopyalar, kâr sürdükçe kamyon ekler.',
        'Hattın varışta pazara sattığı mal planlı satış: üretim fazlası gibi %15 değil %5 kırılır. Bu sürümün kayıtları eski sürümde açılmıyor.',
      ],
      en: [
        'The price of trade: if the surplus falls short, a line can buy the rest on the origin city\'s market. When a good is cheap in one city and dear in the other, a line pays without any production; at the destination the goods feed your own plants or are sold on the market.',
        'Prices side by side in the Cities panel: the cheapest and dearest city for each good, the best route and its margin per unit. A line\'s row shows the buying price, the selling price, the freight and the margin per unit.',
        'The gap narrows: buying lifts the price at the origin, selling lowers it at the destination. Rivals see a profitable route too; after a month they copy it and add trucks while it still pays.',
        'Goods a line sells on the destination market are a planned sale: they lose 5% of the price, not 15% like surplus production. Saves from this version don\'t open in older versions.',
      ],
      de: [
        'Der Preis des Handels: Reicht der Überschuss nicht, kann eine Linie den Rest am Markt der Ausgangsstadt kaufen. Ist eine Ware in einer Stadt billig und in der anderen teuer, lohnt sich die Linie auch ohne Produktion; am Ziel beliefert sie deine eigenen Werke oder wird am Markt verkauft.',
        'Die Preise stehen im Fenster „Städte“ nebeneinander: die günstigste und teuerste Stadt jeder Ware, die beste Route und ihre Spanne je Einheit. Die Zeile einer Linie zeigt Einkauf, Verkauf, Fracht und Spanne je Einheit.',
        'Die Spanne schrumpft: Kaufen hebt den Preis am Start, Verkaufen senkt ihn am Ziel. Auch Rivalen sehen eine lohnende Route; nach einem Monat kopieren sie sie und stocken Lkw auf, solange sie sich lohnt.',
        'Was eine Linie am Markt der Zielstadt verkauft, ist ein geplanter Verkauf: 5 % Abschlag statt 15 % wie bei Überschussproduktion. Spielstände dieser Version lassen sich in älteren Versionen nicht öffnen.',
      ],
    },
  },
  {
    version: '1.2.0',
    date: '2026-10-30',
    notes: {
      tr: [
        'Şehirler arası hat: holding\'in iki şehrindeki nakliye terminallerini bir malla bağla. Bir şehrin fazla ürettiği mal öbür şehirdeki tesislerine ve mağazalarına gider; orada pazardan alınmaz.',
        'Hattın kapasitesi (kamyon başına günde 300 birim), yolu (iki şehir arası 3–6 gün) ve bedeli (kamyon başına, yolun her günü için) var. Kamyonlar terminalin filosundan, taşıma sözleşmeleriyle ortak.',
        'Çıkış şehri malı fazlanın pazar fiyatıyla satar; varış şehri malın bedelini ve nakliyeyi öder. Yoldaki mal varış şehrinin bilançosunda; hat kapanınca yine varır.',
        'Hatlar Şehirler panelinde: bugünkü sefer, yoldaki mal, kamyon sayısı. Bu sürümün kayıtları eski sürümde açılmıyor.',
      ],
      en: [
        'Lines between cities: connect the freight terminals of two of your holding\'s cities with one good. What one city makes too much of goes to the other city\'s plants and stores instead of being bought on the market there.',
        'A line has a capacity (300 units per truck a day), a route (3–6 days between two cities) and a cost (per truck, for every day of the route). Trucks come from the terminal\'s fleet, shared with freight contracts.',
        'The origin sells the goods at its surplus price; the destination pays for the goods and the freight. Goods on the road are on the destination\'s balance sheet, and still arrive if the line closes.',
        'Lines live in the Cities panel: today\'s shipment, goods on the road, the number of trucks. Saves from this version don\'t open in older versions.',
      ],
      de: [
        'Linien zwischen Städten: Verbinde die Frachtterminals zweier Städte deiner Holding mit einer Ware. Was eine Stadt zu viel herstellt, geht an die Werke und Läden der anderen Stadt, statt dass sie es dort am Markt kauft.',
        'Eine Linie hat eine Kapazität (300 Einheiten pro Lkw am Tag), eine Strecke (3–6 Tage zwischen zwei Städten) und Kosten (pro Lkw für jeden Tag der Strecke). Die Lkw kommen aus der Flotte des Terminals, geteilt mit den Transportverträgen.',
        'Die Ausgangsstadt verkauft die Ware zum Überschusspreis; die Zielstadt bezahlt Ware und Fracht. Ware unterwegs steht in der Bilanz der Zielstadt und kommt auch an, wenn die Linie geschlossen wird.',
        'Die Linien stehen im Fenster „Städte“: die heutige Fahrt, die Ware unterwegs, die Zahl der Lkw. Spielstände dieser Version lassen sich in älteren Versionen nicht öffnen.',
      ],
    },
  },
  {
    version: '1.1.0',
    date: '2026-10-29',
    notes: {
      tr: [
        'Şehrin türü: kurulumda liman kenti, sanayi kenti ya da başkent seç. Dengeli şehir eskisi gibi.',
        'Her türün kendi bölgeleri, hammadde fiyatları, rakipleri ve kuralı var. Limanda kahve ve pamuk ucuz, nakliye kârlı. Sanayi kentinde fabrika arazisi bol, sendika güçlü. Başkentte gelir yüksek, arsa pahalı.',
        'Holding yeni şehri istediğin türde açıyor; şehrin türü üst barda yazıyor.',
        'Tohum Ligi her zaman dengeli şehirde. Bu sürümün kayıtları eski sürümde açılmıyor.',
      ],
      en: [
        'City types: pick a port city, an industrial city or the capital at setup. The balanced city is as before.',
        'Each type has its own districts, raw-material prices, rivals and rule. In the port city coffee and cotton are cheap and freight pays. The industrial city has plenty of factory land and a strong union. The capital has high incomes and dear land.',
        'Your holding opens its new city in the type you choose; the city type shows in the top bar.',
        'The Seed League is always played in a balanced city. Saves from this version don’t open in older versions.',
      ],
      de: [
        'Stadttypen: Wähle beim Start eine Hafenstadt, eine Industriestadt oder die Hauptstadt. Die ausgewogene Stadt bleibt wie bisher.',
        'Jeder Typ hat eigene Viertel, Rohstoffpreise, Rivalen und eine Regel. In der Hafenstadt sind Kaffee und Baumwolle günstig und Fracht lohnt sich. Die Industriestadt hat viel Fabrikland und eine starke Gewerkschaft. In der Hauptstadt sind die Einkommen hoch und der Grund teuer.',
        'Deine Holding eröffnet die neue Stadt im Typ deiner Wahl; der Stadttyp steht in der oberen Leiste.',
        'Die Seed-Liga spielt immer in einer ausgewogenen Stadt. Spielstände dieser Version lassen sich in älteren Versionen nicht öffnen.',
      ],
    },
  },
  {
    version: '1.0.1',
    date: '2026-10-29',
    notes: {
      tr: [
        'Hata raporu Kayıtlar → "JSON içe aktar"la açılıyor: içindeki kayıt yükleniyor.',
        'Kayıt açılmayınca nedeni seçtiğin dilde yazıyor. Açılmayan otomatik kayıt kurulum ekranında söyleniyor.',
        "Oyunun daha yeni bir sürümünün otomatik kaydının (Steam'in beta dalı gibi) artık üstüne yazılmıyor.",
        "Yenilikler ve Hata bildir sayfalarında Escape ve kumandanın B'si bir adım geri götürüyor; hata raporunun notu silinmiyor.",
      ],
      en: [
        'Bug reports open from Saves → "Import JSON": the save inside is loaded.',
        'When a save doesn’t open, the reason is given in your language. An autosave that can’t be opened is mentioned on the setup screen.',
        'An autosave from a newer version of the game (a Steam beta branch, say) is no longer overwritten.',
        'On the What’s new and Report a bug pages, Escape and the controller’s B go back one step; the bug report’s note is kept.',
      ],
      de: [
        'Fehlerberichte lassen sich über Spielstände → „JSON importieren“ öffnen: Der Spielstand darin wird geladen.',
        'Öffnet sich ein Spielstand nicht, steht der Grund in deiner Sprache. Lässt sich die Autospeicherung nicht öffnen, steht das auf dem Startbildschirm.',
        'Eine Autospeicherung aus einer neueren Version des Spiels (etwa aus einem Steam-Beta-Zweig) wird nicht mehr überschrieben.',
        'Auf den Seiten „Neuigkeiten“ und „Fehler melden“ führen Escape und die B-Taste des Controllers einen Schritt zurück; die Notiz im Fehlerbericht bleibt erhalten.',
      ],
    },
  },
  {
    version: '1.0.0',
    date: '2026-10-29',
    notes: {
      tr: [
        'İlk tam sürüm. Bir şehrin ekonomisinde şirketini büyüt: perakende, üretim zincirleri, lojistik, enerji ve gayrimenkul.',
        "Rakip şirketler kendi CEO'larıyla: ittifak, husumet, konsorsiyum.",
        'On senaryo, yıldızlar ve en iyi skorlar. Kendi senaryonu tarayıcıda yaz, kodla paylaş.',
        'Tohum Ligi: haftalık ve günlük koşu, sunucuda doğrulanan sıralama, davetli ligler, liderin hayalet eğrisi.',
        "Kariyer rozetleri. Masaüstünde Steam başarımları, Workshop ve skor tabloları.",
        'Masaüstü sürümü (Windows, macOS, Linux): kayıt dosyada, Steam Cloud ile eşitleniyor.',
        "Oyun kumandası ve Steam Deck: bütün oyun faresiz, yazı alanında Steam'in ekran klavyesi. Yalnız klavyeyle de oynanıyor.",
        'Üç dil: Türkçe, İngilizce, Almanca. Metin boyutu, renk paletleri, azaltılmış hareket.',
        'Bu sürümde: Yenilikler sayfası ve hata bildirme (Ayarlar → Sürüm).',
      ],
      en: [
        "First full release. Grow your company in a city's economy: retail, production chains, logistics, energy and real estate.",
        'Rival companies with their own CEOs: alliances, grudges, consortiums.',
        'Ten scenarios with stars and best scores. Write your own scenario in the browser and share it with a code.',
        "Seed League: weekly and daily runs, rankings verified on the server, invite leagues, the leader's ghost curve.",
        'Career badges. On desktop, Steam achievements, Workshop and leaderboards.',
        'Desktop version (Windows, macOS, Linux): saves on disk, synced with Steam Cloud.',
        "Controllers and Steam Deck: the whole game without a mouse, Steam's on-screen keyboard for text fields. Keyboard-only play too.",
        'Three languages: Turkish, English, German. Text size, colour palettes, reduced motion.',
        'New in this version: the What’s new page and bug reports (Settings → Version).',
      ],
      de: [
        'Erste vollständige Version. Bau dein Unternehmen in der Wirtschaft einer Stadt aus: Einzelhandel, Produktionsketten, Logistik, Energie und Immobilien.',
        'Rivalisierende Firmen mit eigenen CEOs: Bündnisse, Feindschaften, Konsortien.',
        'Zehn Szenarien mit Sternen und Bestwerten. Schreib dein eigenes Szenario im Browser und teile es per Code.',
        'Seed-Liga: wöchentliche und tägliche Läufe, auf dem Server geprüfte Ranglisten, Einladungsligen, die Geisterkurve des Spitzenreiters.',
        'Karriere-Abzeichen. Auf dem Desktop Steam-Errungenschaften, Workshop und Bestenlisten.',
        'Desktop-Version (Windows, macOS, Linux): Spielstände auf der Festplatte, über Steam Cloud abgeglichen.',
        'Controller und Steam Deck: das ganze Spiel ohne Maus, Steams Bildschirmtastatur für Textfelder. Auch nur mit der Tastatur spielbar.',
        'Drei Sprachen: Türkisch, Englisch, Deutsch. Textgröße, Farbpaletten, reduzierte Bewegung.',
        'Neu in dieser Version: die Seite „Neuigkeiten“ und Fehlerberichte (Einstellungen → Version).',
      ],
    },
  },
];
