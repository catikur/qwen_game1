import type { ReleaseMessageKey } from './releaseMessages';

/** „Neuigkeiten“ und „Fehler melden“, Almanca (Tur 74). */
export const releaseDe: Record<ReleaseMessageKey, string> = {
  'panels.release.whatsNew.title': 'Neuigkeiten',
  'panels.release.whatsNew.entry': 'Version {version}',
  'panels.release.whatsNew.current': 'deine Version',

  'panels.release.report.title': 'Fehler melden',
  'panels.release.report.lead':
    'Der Bericht ist eine einzige Datei: Spielversion, dein Gerät, deine Einstellungen, letzte Warnungen und auf Wunsch dein Spielstand. Er wird nirgendwohin von selbst gesendet: Speichere die Datei, häng sie an eine E-Mail an und schick sie an {email}.',
  'panels.release.report.note': 'Was ist passiert?',
  'panels.release.report.notePlaceholder': 'Was hast du gemacht, was hast du erwartet, was ist passiert?',
  'panels.release.report.save': 'Spielstand beifügen',
  'panels.release.report.saveHint': 'Der aktuelle Spielstand; ohne offenes Spiel der letzte automatische Spielstand. So sehen wir den Fehler an derselben Stelle. Dein Firmenname steht auch darin.',
  'panels.release.report.saveNone': 'Kein Spielstand zum Beifügen: weder ein offenes Spiel noch ein automatischer Spielstand.',
  'panels.release.report.log': 'Warnprotokoll beifügen ({count|# Zeile|# Zeilen})',
  'panels.release.report.logEmpty': 'Das Warnprotokoll ist leer.',
  'panels.release.report.preview': 'Was steht im Bericht?',
  'panels.release.report.previewSave': '(Spielstand, {size})',
  'panels.release.report.download': 'Bericht speichern',
  'panels.release.report.email': 'E-Mail schreiben',
  'panels.release.report.copyAddress': 'Adresse kopieren',
  'panels.release.report.addressCopied': 'Adresse in die Zwischenablage kopiert: {email}',
  'panels.release.report.addressFailed': 'Die Zwischenablage ist nicht verfügbar; die Adresse lautet {email}',
  'panels.release.report.emailSubject': 'CapitalForge {version} ({edition}): Fehlerbericht',
  'panels.release.report.emailBody': 'Hallo,\n\nich melde einen Fehler in CapitalForge {version} ({edition}). Die Berichtsdatei ist angehängt.\n\nWas passiert ist:\n{note}\n',
  'panels.release.report.preparing': 'Bericht wird vorbereitet …',
  'panels.release.report.saved': 'Bericht gespeichert: {filename}. Häng ihn jetzt an eine E-Mail an und schick sie ab.',
  'panels.release.report.downloads': 'Der Bericht liegt im Ordner „Downloads“: {filename}. Häng ihn jetzt an eine E-Mail an und schick sie ab.',
  'panels.release.report.started': 'Download gestartet: {filename}. Häng ihn dann an eine E-Mail an und schick sie ab.',
  'panels.release.report.copied': 'Die Datei ließ sich nicht speichern; der Bericht ist in der Zwischenablage. Füg ihn in eine E-Mail ein und schick sie ab.',
  'panels.release.report.declined': 'Speichern abgebrochen.',
  'panels.release.report.blocked': 'Der Bericht ließ sich nicht speichern. Prüf die Download-Berechtigung oder versuch es noch einmal.',
};
