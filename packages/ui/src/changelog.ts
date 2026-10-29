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
