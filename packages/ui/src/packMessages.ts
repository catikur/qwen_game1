import { numberLocale, registerMessages, translate } from '@capital/content';
import type { PackIssue } from '@capital/content';

/*
 * Paket rafının metinleri (Tur 67). Raf kurulum ekranında geç inen bir
 * parça (`PackShelf`): doğrulayıcı da, bu sözlük de açılışın yolunda yok.
 * İki dil birlikte geliyor; ikisi de küçük. Anahtarlar arayüzün `hud.`
 * önekinde, çakışmasın diye `hud.pack.` altında.
 */
export const packTr = {
  'hud.pack.title': 'Kendi senaryoların',
  'hud.pack.empty': 'Henüz yok. Bir arkadaşının paylaştığı kodu ya da bir paket dosyasını aşağıdan ekle.',
  'hud.pack.from': 'Paket: {pack}',
  'hud.pack.add': 'Senaryo ekle',
  'hud.pack.addHint': 'Paylaşım kodunu (CF1.…) ya da paketin JSON metnini yapıştır, ya da dosyasını seç.',
  'hud.pack.inputLabel': 'Paylaşım kodu ya da paket JSON',
  'hud.pack.placeholder': 'CF1.… ya da { "format": "capitalforge-pack", … }',
  'hud.pack.addButton': 'Ekle',
  'hud.pack.file': 'Dosyadan seç',
  'hud.pack.example': 'Örnekle doldur',
  'hud.pack.exampleHint': 'Seçili hazır senaryo paket olarak kutuya yazıldı: değiştir, sonra Ekle.',
  'hud.pack.checking': 'Paket okunuyor…',
  'hud.pack.added': '"{name}" eklendi: {count|# senaryo|# senaryo}.',
  'hud.pack.updated': '"{name}" güncellendi: {count|# senaryo|# senaryo}.',
  'hud.pack.rejected': 'Paket eklenmedi; {count|# sorun|# sorun} var:',
  'hud.pack.more': '… ve {count|# sorun|# sorun} daha.',
  'hud.pack.error.empty': 'Kutu boş: önce kodu ya da JSON metnini yapıştır.',
  'hud.pack.error.unknown': 'Bu bir paylaşım kodu (CF1. ile başlar) ya da paket JSON metni değil.',
  'hud.pack.error.json': 'JSON okunamadı: {reason}',
  'hud.pack.error.tooLarge': 'Paket çok büyük (en fazla 64 KB).',
  'hud.pack.error.code.prefix': 'Kod CF1. ile başlamıyor.',
  'hud.pack.error.code.length': 'Kod çok uzun.',
  'hud.pack.error.code.decode': 'Kod açılamadı; eksik ya da bozuk kopyalanmış olabilir.',
  'hud.pack.error.code.json': 'Kodun içi bir paket değil.',
  'hud.pack.error.full': 'En fazla {count} paket yüklenebiliyor; önce birini kaldır.',
  'hud.pack.error.file': 'Dosya okunamadı.',
  'hud.pack.copyCode': 'Kodu kopyala',
  'hud.pack.copyLink': 'Bağlantıyı kopyala',
  'hud.pack.copied': 'Kopyalandı: arkadaşın senaryo ekle kutusuna yapıştırsın.',
  'hud.pack.linkCopied': 'Bağlantı kopyalandı: açan senaryoyu doğrudan görüyor.',
  'hud.pack.copiedJson': 'Senaryo kod için fazla uzun; paketin JSON metni kopyalandı: arkadaşın ekleme kutusuna yapıştırsın.',
  'hud.pack.copyFailed': 'Pano kapalı; kodu buradan seçip kopyala:',
  'hud.pack.remove': 'Paketi kaldır',
  'hud.pack.removeConfirm': '"{name}" kaldırılsın mı? Yıldızların bu cihazda kalıyor.',
  'hud.pack.removeYes': 'Kaldır',
  'hud.pack.removeNo': 'Vazgeç',
  'hud.pack.removed': '"{name}" kaldırıldı.',
  'hud.pack.linked': 'Bağlantıyla gelen senaryo kutuda: bakıp Ekle.',
  'hud.pack.issue.type': '{expected} olmalı',
  'hud.pack.issue.missing': 'eksik',
  'hud.pack.issue.unknownField': 'bilinmeyen alan',
  'hud.pack.issue.range': '{min} ile {max} arasında olmalı',
  'hud.pack.issue.integer': 'tam sayı olmalı',
  'hud.pack.issue.enum': 'şunlardan biri olmalı: {options}',
  'hud.pack.issue.id': 'küçük harf, rakam ve tire; en fazla 32 karakter',
  'hud.pack.issue.length': 'en fazla {max} karakter',
  'hud.pack.issue.duplicate': 'bu kimlik iki kez kullanılmış',
  'hud.pack.issue.unknownRef': 'oyunda yok: {value}',
  'hud.pack.issue.conflict': 'aynı hazır kural iki kez: {value}',
  'hud.pack.issue.count': 'en fazla {max} tane',
  'hud.pack.issue.format': 'şu olmalı: {expected}',
  'hud.pack.issue.version': 'sürüm {expected} olmalı',
  'hud.pack.issue.starsOrder': 'üç yıldız iki yıldızdan zor olmalı',
  'hud.pack.issue.metric': 'bu hedefte yıldız ölçüsü {expected} olmalı',
  'hud.pack.issue.needsSetup': 'bu hedef için kurulumda gerekli',
  'hud.pack.expected.object': 'nesne',
  'hud.pack.expected.array': 'liste',
  'hud.pack.expected.number': 'sayı',
  'hud.pack.expected.boolean': 'true ya da false',
  'hud.pack.expected.text': 'metin',
} as const;

export type PackMessageKey = keyof typeof packTr;

export const packEn: Record<PackMessageKey, string> = {
  'hud.pack.title': 'Your scenarios',
  'hud.pack.empty': 'None yet. Add a code a friend shared, or a pack file, below.',
  'hud.pack.from': 'Pack: {pack}',
  'hud.pack.add': 'Add a scenario',
  'hud.pack.addHint': 'Paste a share code (CF1.…) or the pack JSON, or pick its file.',
  'hud.pack.inputLabel': 'Share code or pack JSON',
  'hud.pack.placeholder': 'CF1.… or { "format": "capitalforge-pack", … }',
  'hud.pack.addButton': 'Add',
  'hud.pack.file': 'Choose file',
  'hud.pack.example': 'Fill with an example',
  'hud.pack.exampleHint': 'The selected built-in scenario is in the box as a pack: edit it, then Add.',
  'hud.pack.checking': 'Reading the pack…',
  'hud.pack.added': '"{name}" added: {count|# scenario|# scenarios}.',
  'hud.pack.updated': '"{name}" updated: {count|# scenario|# scenarios}.',
  'hud.pack.rejected': 'Pack not added; {count|# problem|# problems}:',
  'hud.pack.more': '… and {count|# more problem|# more problems}.',
  'hud.pack.error.empty': 'The box is empty: paste the code or the JSON first.',
  'hud.pack.error.unknown': 'This is not a share code (starts with CF1.) or pack JSON.',
  'hud.pack.error.json': 'Could not read the JSON: {reason}',
  'hud.pack.error.tooLarge': 'The pack is too large (64 KB at most).',
  'hud.pack.error.code.prefix': 'The code does not start with CF1.',
  'hud.pack.error.code.length': 'The code is too long.',
  'hud.pack.error.code.decode': 'The code could not be opened; it may be cut off or mistyped.',
  'hud.pack.error.code.json': 'The code does not hold a pack.',
  'hud.pack.error.full': 'Up to {count} packs can be installed; remove one first.',
  'hud.pack.error.file': 'The file could not be read.',
  'hud.pack.copyCode': 'Copy code',
  'hud.pack.copyLink': 'Copy link',
  'hud.pack.copied': 'Copied: your friend pastes it into the add box.',
  'hud.pack.linkCopied': 'Link copied: whoever opens it sees the scenario right away.',
  'hud.pack.copiedJson': 'The scenario is too long for a code; the pack JSON was copied: your friend pastes it into the add box.',
  'hud.pack.copyFailed': 'The clipboard is blocked; select the code here and copy it:',
  'hud.pack.remove': 'Remove pack',
  'hud.pack.removeConfirm': 'Remove "{name}"? Your stars stay on this device.',
  'hud.pack.removeYes': 'Remove',
  'hud.pack.removeNo': 'Cancel',
  'hud.pack.removed': '"{name}" removed.',
  'hud.pack.linked': 'The scenario from the link is in the box: check it, then Add.',
  'hud.pack.issue.type': 'must be {expected}',
  'hud.pack.issue.missing': 'missing',
  'hud.pack.issue.unknownField': 'unknown field',
  'hud.pack.issue.range': 'must be between {min} and {max}',
  'hud.pack.issue.integer': 'must be a whole number',
  'hud.pack.issue.enum': 'must be one of: {options}',
  'hud.pack.issue.id': 'lowercase letters, digits and dashes; 32 characters at most',
  'hud.pack.issue.length': '{max} characters at most',
  'hud.pack.issue.duplicate': 'this id is used twice',
  'hud.pack.issue.unknownRef': 'not in the game: {value}',
  'hud.pack.issue.conflict': 'the same built-in rule twice: {value}',
  'hud.pack.issue.count': '{max} at most',
  'hud.pack.issue.format': 'must be: {expected}',
  'hud.pack.issue.version': 'version must be {expected}',
  'hud.pack.issue.starsOrder': 'three stars must be harder than two',
  'hud.pack.issue.metric': 'for this goal the star measure must be {expected}',
  'hud.pack.issue.needsSetup': 'required in the setup for this goal',
  'hud.pack.expected.object': 'an object',
  'hud.pack.expected.array': 'a list',
  'hud.pack.expected.number': 'a number',
  'hud.pack.expected.boolean': 'true or false',
  'hud.pack.expected.text': 'text',
};

registerMessages('tr', packTr);
registerMessages('en', packEn);

export function pt(key: PackMessageKey, params?: Record<string, string | number>): string {
  return translate(key, params);
}

function number(value: string | number): string {
  return typeof value === 'number' ? new Intl.NumberFormat(numberLocale(), { maximumFractionDigits: 3 }).format(value) : value;
}

/** Sorunun okunur hâli: "scenarios[0].goal.target: 100.000 ile … arasında olmalı". */
export function issueText(issue: PackIssue): string {
  const params: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(issue.params ?? {})) {
    params[key] = key === 'expected' && issue.code === 'type' ? pt(`hud.pack.expected.${value}` as PackMessageKey) : number(value);
  }
  return pt(`hud.pack.issue.${issue.code}` as PackMessageKey, params);
}
