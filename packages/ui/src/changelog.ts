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
