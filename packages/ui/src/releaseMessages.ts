import { registerMessages, translate } from '@capital/content';
import type { MessageParams } from '@capital/content';
import { releaseDe } from './releaseMessages.de';

/*
 * "Yenilikler" ve "Hata bildir" sayfalarının metinleri (Tur 74). İki sayfa
 * da Ayarlar'dan açılan geç parçalar (`WhatsNewPage.tsx`, `BugReportPage.tsx`); bu
 * sözlük onlarla iniyor, giriş paketine girmiyor. Ayarlar'daki düğmelerin
 * yazıları ana sözlükte (`panels.settings.version.*`). Almancası
 * `releaseMessages.de.ts`'te. Anahtarlar `panels.release.` altında.
 */
export const releaseTr = {
  'panels.release.whatsNew.title': 'Yenilikler',
  'panels.release.whatsNew.entry': 'Sürüm {version}',
  'panels.release.whatsNew.current': 'oynadığın sürüm',

  'panels.release.report.title': 'Hata bildir',
  'panels.release.report.lead':
    'Rapor tek bir dosya: oyunun sürümü, cihazın, ayarların, son uyarılar ve istersen kaydın. Kendiliğinden hiçbir yere gitmiyor; dosyayı kaydet, e-postaya ekleyip {email} adresine gönder.',
  'panels.release.report.note': 'Ne oldu?',
  'panels.release.report.notePlaceholder': 'Ne yapıyordun, ne bekliyordun, ne oldu?',
  'panels.release.report.save': 'Kaydı ekle',
  'panels.release.report.saveHint': 'Oyunun şu anki durumu; açık oyun yoksa son otomatik kayıt. Hatayı aynı yerden görmemizi sağlıyor. Şirketinin adı da içinde.',
  'panels.release.report.saveNone': 'Eklenecek kayıt yok: açık oyun da otomatik kayıt da yok.',
  'panels.release.report.log': 'Uyarı günlüğünü ekle ({count} satır)',
  'panels.release.report.logEmpty': 'Uyarı günlüğü boş.',
  'panels.release.report.preview': 'Raporda ne var?',
  'panels.release.report.previewSave': '(kayıt, {size})',
  'panels.release.report.download': 'Raporu kaydet',
  'panels.release.report.email': 'E-posta yaz',
  'panels.release.report.copyAddress': 'Adresi kopyala',
  'panels.release.report.addressCopied': 'Adres panoya kopyalandı: {email}',
  'panels.release.report.addressFailed': 'Pano kullanılamıyor; adres: {email}',
  'panels.release.report.emailSubject': 'CapitalForge {version} ({edition}): hata raporu',
  'panels.release.report.emailBody': 'Merhaba,\n\nCapitalForge {version} ({edition}) ile ilgili bir hata bildiriyorum. Rapor dosyası ekte.\n\nNe oldu:\n{note}\n',
  'panels.release.report.preparing': 'Rapor hazırlanıyor…',
  'panels.release.report.saved': 'Rapor kaydedildi: {filename}. Şimdi e-postaya ekleyip gönder.',
  'panels.release.report.downloads': 'Rapor İndirilenler klasöründe: {filename}. Şimdi e-postaya ekleyip gönder.',
  'panels.release.report.started': 'İndirme başladı: {filename}. Sonra e-postaya ekleyip gönder.',
  'panels.release.report.copied': 'Dosya kaydedilemedi; rapor panoya kopyalandı. E-postaya yapıştırıp gönder.',
  'panels.release.report.declined': 'Kaydetme iptal edildi.',
  'panels.release.report.blocked': 'Rapor kaydedilemedi. İndirme iznini denetle ya da bir daha dene.',
} as const;

export type ReleaseMessageKey = keyof typeof releaseTr;

export const releaseEn: Record<ReleaseMessageKey, string> = {
  'panels.release.whatsNew.title': 'What’s new',
  'panels.release.whatsNew.entry': 'Version {version}',
  'panels.release.whatsNew.current': 'the version you’re playing',

  'panels.release.report.title': 'Report a bug',
  'panels.release.report.lead':
    'The report is a single file: the game version, your device, your settings, recent warnings and, if you like, your save. It isn’t sent anywhere on its own: save the file, attach it to an email and send it to {email}.',
  'panels.release.report.note': 'What happened?',
  'panels.release.report.notePlaceholder': 'What were you doing, what did you expect, what happened?',
  'panels.release.report.save': 'Include the save',
  'panels.release.report.saveHint': 'The game’s current state, or the last autosave if no game is open. It lets us see the bug from the same spot. Your company name is in it too.',
  'panels.release.report.saveNone': 'There’s no save to include: no open game and no autosave.',
  'panels.release.report.log': 'Include the warning log ({count|# line|# lines})',
  'panels.release.report.logEmpty': 'The warning log is empty.',
  'panels.release.report.preview': 'What’s in the report?',
  'panels.release.report.previewSave': '(save, {size})',
  'panels.release.report.download': 'Save the report',
  'panels.release.report.email': 'Write an email',
  'panels.release.report.copyAddress': 'Copy the address',
  'panels.release.report.addressCopied': 'Address copied to the clipboard: {email}',
  'panels.release.report.addressFailed': 'The clipboard isn’t available; the address is {email}',
  'panels.release.report.emailSubject': 'CapitalForge {version} ({edition}): bug report',
  'panels.release.report.emailBody': 'Hello,\n\nI’m reporting a bug in CapitalForge {version} ({edition}). The report file is attached.\n\nWhat happened:\n{note}\n',
  'panels.release.report.preparing': 'Preparing the report…',
  'panels.release.report.saved': 'Report saved: {filename}. Now attach it to an email and send it.',
  'panels.release.report.downloads': 'The report is in your Downloads folder: {filename}. Now attach it to an email and send it.',
  'panels.release.report.started': 'Download started: {filename}. Then attach it to an email and send it.',
  'panels.release.report.copied': 'The file couldn’t be saved; the report was copied to the clipboard. Paste it into an email and send it.',
  'panels.release.report.declined': 'Saving was cancelled.',
  'panels.release.report.blocked': 'The report couldn’t be saved. Check the download permission or try again.',
};

registerMessages('tr', releaseTr);
registerMessages('en', releaseEn);
registerMessages('de', releaseDe);

export function rt(key: ReleaseMessageKey, params?: MessageParams): string {
  return translate(key, params);
}
