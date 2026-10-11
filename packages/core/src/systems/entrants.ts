import {
  NPC_PROFILES,
  RIVAL_CEO_FIRST_NAMES,
  RIVAL_CEO_LAST_NAMES,
  RIVAL_EXTRA_COLORS,
  RIVAL_NAME_STEMS,
  RIVAL_NAME_SUFFIXES,
  RIVAL_PORTRAIT_PARTS,
} from '@capital/content';
import type { NpcProfileDef, NpcTrait } from '@capital/content';
import { pushNews } from '../news';
import { rivalProfile, rivalProfiles } from '../profiles';
import { createRng, nextFloat, pick } from '../rng';
import { formatMoney } from '../selectors';
import { makeCompany, rivalSlotsFor } from '../worldgen';
import type { CompanyState, GameState } from '../types';

/**
 * Yeni rakip girişi.
 *
 * Ölçüm (Tur 17 değerlendirmesi): rakipler birbirini devraldıkça kadro
 * eriyordu — üç tohumun hepsinde 600. günde dört rakipten ikisi
 * kalıyordu ve katalogdaki sekiz kişiliğin dördü hiç sahneye çıkmıyordu.
 * Geç oyun tenhalaşıyor, "kim hamle yapacak" sorusunun cevabı iki isme
 * iniyordu.
 *
 * Kural: boşalan koltuğa, hiç sahneye çıkmamış bir kişilik girer.
 *   - 200. günden önce yok (erken oyun kurulan rekabetin), girişler
 *     arasında en az 120 gün,
 *   - koltuk sayısı haritanın taşıdığı rakip sayısı (kuruluştaki kural),
 *   - sermaye ekonomiye ölçekli: mevcut rakiplerin medyan değerinin
 *     %35'i, profilin kendi başlangıç sermayesinden az değil. Yeni gelen
 *     yarışa girebilmeli ama kurulu düzeni bir gecede yıkmamalı,
 *   - devralınıp silinen bir isim geri dönmez (`rivalHistory`).
 *
 * KURUCU KİLİDİ (bir yıl): yeni gelenin hisseleri piyasada yok. Küçük
 * başlayan şirket gelir gelmez şehrin en küçüğü oluyor ve "en küçüğe
 * vur" kuralıyla ilk ay yutulurdu — giriş bir olay değil bir yem olurdu.
 * Bir yıl inşa etmeye zaman tanıyor.
 *
 * (Girişlerin ölçümünde ortaya çıkan asıl kilit baskın tarafındaydı:
 * hissesi tükenmiş hedefe çakılı kalan baskıncılar — npc.ts'te düzeltildi.)
 *
 * Zar yok. Koltuk boşaldığı gün bir haber düşer ("şehre yeni bir şirket
 * geliyor") ve yeni rakip 45 gün sonra girer: devralmanın sonucu bir
 * an bile görünmeden silinmesin, oyuncu boşalan pazara önce kendisi
 * yerleşebilsin. Giriş haberi kişiliği ve doktrini söylüyor — oyuncu
 * yeni rakibin nasıl oynayacağını bilmeli.
 *
 * KATALOG BİTİNCE ÜRETİM (Tur 22). Sekiz kişilik tükenince koltuk boş
 * kalıyordu; büyük şehirde sekizi baştan sahnede olduğu için ilk
 * devralmada. Artık yeni rakip üretiliyor (`generateProfile`). Ad ve yüz
 * için dışsal bir zar kullanılıyor (tohum + üretim sırası), oyunun
 * zarı değil: üretim başka hiçbir sistemin sırasını kaydırmıyor.
 */
export const ENTRY_FIRST_DAY = 200;
export const ENTRY_COOLDOWN_DAYS = 120;
/** Bekleme bu koltuk sayısına göre (standart şehir); büyük şehirde orantılı kısa. */
const COOLDOWN_BASE_SLOTS = 4;
export const ENTRY_DELAY_DAYS = 45;
export const FOUNDER_LOCK_DAYS = 365;
const ENTRY_CAPITAL_SHARE = 0.35;
/** Üretilen rakiplerin dışsal zarının karışım sabiti. */
const GENERATED_SALT = 0x5bd1e995;
const TRAITS: readonly NpcTrait[] = ['expansionist', 'price_cutter', 'premium', 'landlord', 'tech'];

/**
 * Katalog dışı yeni bir rakip profili.
 *
 * DOKTRİN SAHNEDE EN AZ TEMSİL EDİLEN KİŞİLİKTEN. Devralmalar kadroyu
 * tek tipe itebilir (ucuzcular birbirini yutar, geriye iki arsa
 * spekülatörü kalır); yeni gelen eksik sesi tamamlıyor. Eşitlikte
 * kataloğun sırası. Sayısal ağırlıklar o kişiliğin katalogdaki
 * profillerinden birinin AYNISI: denge onlarla ölçüldü.
 *
 * Ad, CEO ve renk sahnede ve geçmişte kullanılmamış olanlardan.
 */
export function generateProfile(state: GameState, rivals: CompanyState[]): NpcProfileDef {
  const index = (state.extraProfiles?.length ?? 0) + 1;
  const dice = createRng((state.meta.seed ^ Math.imul(index, GENERATED_SALT)) >>> 0);

  const counts = new Map<NpcTrait, number>(TRAITS.map((trait) => [trait, 0]));
  for (const company of rivals) {
    const trait = rivalProfile(state, company.profileId)?.trait;
    if (trait) counts.set(trait, (counts.get(trait) ?? 0) + 1);
  }
  const fewest = Math.min(...counts.values());
  const trait = TRAITS.find((candidate) => counts.get(candidate) === fewest)!;
  const template = pick(dice, NPC_PROFILES.filter((profile) => profile.trait === trait));

  const known = rivalProfiles(state);
  const usedNames = new Set([...known.map((profile) => profile.name), ...Object.values(state.companies).map((c) => c.name)]);
  const usedCeos = new Set(known.map((profile) => profile.ceoName));
  // Kök de tekrar etmesin: "Zeytin Girişim" devralındıktan sonra gelen
  // "Zeytin Gayrimenkul" aynı şirketin dönüşü gibi okunuyordu (ölçüm).
  const usedStems = new Set((state.extraProfiles ?? []).map((profile) => profile.name.split(' ')[0]!));
  const freshStems = RIVAL_NAME_STEMS.filter((stem) => !usedStems.has(stem));
  const stems = freshStems.length > 0 ? freshStems : RIVAL_NAME_STEMS;
  const suffixes = RIVAL_NAME_SUFFIXES[trait];
  let name = '';
  for (let attempt = 0; attempt < 64 && (!name || usedNames.has(name)); attempt++) {
    name = `${pick(dice, stems)} ${pick(dice, suffixes)}`;
  }
  if (usedNames.has(name)) name = `${name} ${index + 1}`;
  let ceoName = '';
  for (let attempt = 0; attempt < 64 && (!ceoName || usedCeos.has(ceoName)); attempt++) {
    ceoName = `${pick(dice, RIVAL_CEO_FIRST_NAMES)} ${pick(dice, RIVAL_CEO_LAST_NAMES)}`;
  }

  /*
   * RENK: sahnede olmayanlardan, EN UZUN SÜREDİR görülmeyeni. İlk sürüm
   * yalnızca sahnedekilere bakıyordu ve devralınan rakibin rengi hemen
   * yenisine geçiyordu; haritada eski rakip yaşıyor gibi görünüyordu.
   * Hiç kullanılmamış renk önce, sonra son görülmesi en eski olan.
   */
  const onStage = new Set(Object.values(state.companies).map((company) => company.color));
  const lastSeen = new Map<string, number>();
  (state.rivalHistory ?? []).forEach((id, order) => {
    const seen = rivalProfile(state, id)?.color;
    if (seen) lastSeen.set(seen, order);
  });
  const palette = [...RIVAL_EXTRA_COLORS, ...NPC_PROFILES.map((profile) => profile.color)];
  let color = palette[0]!;
  let oldest = Infinity;
  for (const candidate of palette) {
    if (onStage.has(candidate)) continue;
    const seenAt = lastSeen.get(candidate) ?? -1;
    if (seenAt < oldest) {
      oldest = seenAt;
      color = candidate;
    }
  }

  return {
    ...template,
    id: `yeni_${index}`,
    name,
    color,
    ceoName,
    portrait: {
      skin: pick(dice, RIVAL_PORTRAIT_PARTS.skins),
      hair: pick(dice, RIVAL_PORTRAIT_PARTS.hairs),
      hairStyle: pick(dice, RIVAL_PORTRAIT_PARTS.styles),
      clothes: shade(color, 0.55),
      accent: color,
      glasses: nextFloat(dice) < 0.35,
      facialHair: nextFloat(dice) < 0.3,
      background: shade(color, 0.22),
    },
  };
}

/** Rengi siyaha doğru karartır (0 siyah, 1 renk kendisi). */
function shade(hex: string, amount: number): string {
  const value = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => Math.round(((value >> shift) & 0xff) * amount);
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * İki giriş arasındaki bekleme (Tur 22): koltuk başına aynı dolma hızı.
 * Standart şehirde (4 koltuk) 120 gün, büyükte (8) 60. Sabit 120 günle
 * devralma yapan oyuncu büyük şehirde sekiz koltuğu beş-altıda tutuyordu.
 */
export function entryCooldown(slots: number): number {
  return Math.round((ENTRY_COOLDOWN_DAYS * COOLDOWN_BASE_SLOTS) / Math.max(COOLDOWN_BASE_SLOTS, slots));
}

export function runEntrantTick(state: GameState): void {
  if (!state.flags.npcCompetition || state.flags.rivalEntry === false) return;
  if (state.gameOver) return;
  const day = state.time.day;
  if (day < ENTRY_FIRST_DAY) return;

  const rivals = Object.values(state.companies).filter((company) => !company.isPlayer);
  // Koltuk sayısı kuruluştaki kadro (deney az rakiple kurduysa o kadar);
  // eski kayıtlarda alan yok, haritanın taşıdığı sayıya düşülüyor.
  const slots = state.rivalSlots ?? rivalSlotsFor(state.map.tiles.filter((tile) => tile.kind === 'plot').length);
  if (state.lastEntryDay !== undefined && day - state.lastEntryDay < entryCooldown(slots)) return;
  if (rivals.length >= slots) {
    delete state.rivalVacancyDay;
    return;
  }

  // Eski kayıtlarda geçmiş yok: elde olan en iyi bilgi bugünkü kadro.
  const history = new Set(state.rivalHistory ?? rivals.map((company) => company.id));
  const fromCatalog = NPC_PROFILES.find((candidate) => !history.has(candidate.id) && !state.companies[candidate.id]);

  if (state.rivalVacancyDay === undefined) {
    state.rivalVacancyDay = day;
    pushNews(
      state,
      'neutral',
      'Şehre yeni bir şirket geliyor',
      `Boşalan pazarı gözüne kestiren bir grup ${ENTRY_DELAY_DAYS} gün içinde şehre girecek. Boşluğu önce sen doldurabilirsin.`,
    );
    return;
  }
  if (day - state.rivalVacancyDay < ENTRY_DELAY_DAYS) return;

  // Katalog bittiyse yeni bir profil; giriş gününde üretiliyor ki doktrin
  // o günün kadrosuna baksın.
  let profile = fromCatalog;
  if (!profile) {
    profile = generateProfile(state, rivals);
    state.extraProfiles = [...(state.extraProfiles ?? []), profile];
  }

  const worths = rivals.map((company) => company.netWorth).sort((a, b) => a - b);
  const median = worths.length > 0 ? worths[Math.floor(worths.length / 2)]! : profile.startingCash;
  const capital = Math.max(profile.startingCash, Math.round(median * ENTRY_CAPITAL_SHARE));

  state.companies[profile.id] = makeCompany(
    profile.id,
    profile.name,
    false,
    profile.color,
    capital,
    profile.id,
    null,
    0.12,
  );
  state.companies[profile.id]!.lockedUntilDay = day + FOUNDER_LOCK_DAYS;
  state.rivalHistory = [...history, profile.id];
  state.lastEntryDay = day;
  delete state.rivalVacancyDay;

  pushNews(
    state,
    'rival',
    `Şehre yeni rakip: ${profile.name}`,
    `${profile.ceoName} yönetiminde, ${formatMoney(capital)} sermayeyle geldi. ${profile.description} ` +
      `Hisseleri ${FOUNDER_LOCK_DAYS} gün kurucu kilidinde.`,
    profile.id,
  );
}
