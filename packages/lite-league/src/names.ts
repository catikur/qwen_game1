/**
 * Herkese görünen adlar: kurallar ve küfür süzgeci. Lite (şirket ve lig
 * adları) ve ana oyunun Tohum Ligi (şirket adı, Tur 51) aynı süzgeçten.
 */
import { LEAGUE } from '../../lite-model/src/index';

/** Ad: harf, rakam, boşluk, alt çizgi, tire; baştaki/sondaki boşluk kırpılıyor. */
export function cleanName(raw: unknown, max: number = LEAGUE.nameMax): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (name.length < LEAGUE.nameMin || name.length > max) return null;
  return /^[\p{L}\p{N} _-]+$/u.test(name) ? name : null;
}

/**
 * Herkesin gördüğü adlarda küfür ve hakaret yok (App Store 1.2). Kısa ve
 * belirsiz kökler yalnızca tek başına sözcükken ("sik" değil ama "Sikke"
 * geçiyor), uzun ve tek anlamlılar ad içinde de yakalanıyor. Rakamla yazılmış
 * harfler (0→o, 1→i, 3→e, 4→a, 5→s, 7→t) ve araya konan boşluk, _ ve -
 * çözülüyor.
 */
const BLOCKED_WORDS = new Set([
  'am', 'amk', 'aq', 'göt', 'got', 'piç', 'pic', 'sik', 'sikik', 'ibne', 'kahpe', 'şerefsiz', 'serefsiz', 'yavşak', 'yavsak',
  'oç', 'oc', 'gerizekalı', 'salak', 'fuck', 'shit', 'dick', 'cock', 'slut', 'sex', 'seks', 'porn', 'porno', 'rape', 'nazi',
]);
const BLOCKED_ROOTS = [
  'orospu', 'yarrak', 'yarak', 'amcık', 'amcik', 'sikiş', 'sikis', 'siktir', 'sikerim', 'pezevenk', 'gavat', 'ananı', 'anani',
  'fuck', 'bitch', 'cunt', 'nigger', 'nigga', 'faggot', 'whore', 'asshole', 'pussy', 'hitler', 'porn',
];
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's', '!': 'i', '|': 'i' };

export function offensiveName(name: string): boolean {
  const lower = name.toLocaleLowerCase('tr').replace(/[013457@$!|]/g, (ch) => LEET[ch] ?? ch);
  // Harf ve rakam dışındaki her işaret ayırıcı: ana oyunun şirket adı noktalamaya
  // izin veriyor ("F.U.C.K", "Oro.spu"; Codex #80). Lite'ın adında zaten yalnız
  // boşluk, _ ve - var.
  const words = lower.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  // Kısa sözcükler tek başınayken; araya işaret konmuşsa ("S-İ-K", "si k")
  // yan yana sözcüklerin birleşimi de. Alt dizgi değil: "Sikke" geçiyor.
  for (let start = 0; start < words.length; start++) {
    let joined = '';
    for (let end = start; end < Math.min(words.length, start + 6); end++) {
      joined += words[end];
      if (BLOCKED_WORDS.has(joined)) return true;
    }
  }
  const compact = words.join('');
  return BLOCKED_ROOTS.some((root) => compact.includes(root));
}

