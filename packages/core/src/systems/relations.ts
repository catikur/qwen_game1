import { BUILDING_BY_ID, RELATION, RIVAL_CEOS, TEMPERAMENTS, TEMPERAMENT_IDS, fillTemplate, relationLines } from '@capital/content';
import type { RelationBeat, RelationEventKind, TemperamentDef } from '@capital/content';
import { formatMoney } from '../format';
import { tc } from '../i18n';
import { pushNews } from '../news';
import { rivalProfile } from '../profiles';
import { createRng, nextFloat } from '../rng';
import type { CommandResult, CompanyState, GameState, RelationState } from '../types';

/**
 * Rakipler 2.0 (Tur 59): oyuncuya karşı hafıza — içerik ve gerekçe
 * `@capital/content` rivals.ts'te.
 *
 * Bu dosya puanı tutuyor: olaylar (`noteRelation`), günlük sönüm, haftalık
 * fiyat kırma denetimi, eşikler (husumet ve ittifak, aralarında 10 puanlık
 * tampon) ve uzlaşma. Tepkiler sistemlerinde: kampanya `rivalry.ts`'te,
 * lobi `council.ts`'te, ihale `auction.ts`'te, konsorsiyum
 * `consortium.ts`'te; hepsi `stanceOf` okuyor.
 *
 * Zar yok; sözün zarı dışsal (tohum, gün, şirket) ve paylaşılan rng'ye
 * dokunmuyor.
 */

export function relationsEnabled(state: GameState): boolean {
  return state.flags.rivalRelations !== false;
}

function hashOf(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return hash;
}

/** Rakibin CEO'sunun mizacı. Oyuncuda ve profili olmayan şirkette undefined. */
export function temperamentOf(state: GameState, companyId: string): TemperamentDef | undefined {
  const profile = rivalProfile(state, state.companies[companyId]?.profileId);
  if (!profile) return undefined;
  const id =
    RIVAL_CEOS[profile.id]?.temperament ??
    profile.temperament ??
    TEMPERAMENT_IDS[hashOf(profile.id) % TEMPERAMENT_IDS.length]!;
  return TEMPERAMENTS[id];
}

/** İlişki puanı (−100..100); hafızası olmayan rakipte 0. */
export function relationScore(company: CompanyState | undefined): number {
  return company?.relation?.score ?? 0;
}

/** Süren duruş: husumet, ittifak ya da tarafsız (null). */
export function stanceOf(state: GameState, companyId: string): 'hostile' | 'allied' | null {
  if (!relationsEnabled(state)) return null;
  return state.companies[companyId]?.relation?.stance ?? null;
}

/** Profili olan rakipler (oyuncu hariç), kimlik sırasıyla değil durum sırasıyla. */
function rivalCompanies(state: GameState): CompanyState[] {
  return Object.values(state.companies).filter((company) => !company.isPlayer && rivalProfile(state, company.profileId));
}

/** Husumetli rakipler, en husumetli başta (eşitlikte kimlik). */
export function hostileRivals(state: GameState): CompanyState[] {
  return rivalCompanies(state)
    .filter((company) => stanceOf(state, company.id) === 'hostile')
    .sort((a, b) => relationScore(a) - relationScore(b) || (a.id < b.id ? -1 : 1));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampScore(value: number): number {
  return Math.max(RELATION.min, Math.min(RELATION.max, value));
}

/** Rakibin bu andaki ilişki sözü: `Sema Bozkurt: “…”`. Hikâyeler kapalıysa null. */
export function relationQuote(
  state: GameState,
  company: CompanyState | undefined,
  beat: RelationBeat,
  params: Record<string, string> = {},
): string | null {
  if (!company || state.flags.rivalStories === false) return null;
  const profile = rivalProfile(state, company.profileId);
  const temperament = temperamentOf(state, company.id);
  if (!profile || !temperament) return null;
  const lines = relationLines(temperament.id, beat);
  const dice = createRng(((state.meta.seed ^ 0x27d4eb2f) ^ Math.imul(state.time.day ^ hashOf(company.id + beat), 0x165667b1)) >>> 0);
  const pick = Math.floor(nextFloat(dice) * lines.length);
  return tc('core.rivalry.quote', { ceo: profile.ceoName, line: fillTemplate(lines[pick] ?? lines[0] ?? '', params) });
}

function withQuote(body: string, quote: string | null): string {
  return quote ? `${body} ${quote}` : body;
}

function remember(relation: RelationState, day: number, kind: RelationEventKind, delta: number): void {
  const last = relation.memory[0];
  if (last && last.kind === kind && day - last.day < RELATION.mergeDays) {
    last.delta = round2(last.delta + delta);
    last.day = day;
    return;
  }
  relation.memory.unshift({ day, kind, delta: round2(delta) });
  if (relation.memory.length > RELATION.memorySize) relation.memory.length = RELATION.memorySize;
}

/** Eşikler: husumet ve ittifak başlıyor ya da bitiyor; haber ve söz. */
function updateStance(state: GameState, company: CompanyState, relation: RelationState): void {
  const day = state.time.day;
  const score = relation.score;
  if (relation.stance === 'hostile' && score > RELATION.hostileEndsAt) {
    delete relation.stance;
    delete relation.since;
    pushNews(state, 'neutral', tc('core.relations.hostileEndedTitle', { name: company.name }), tc('core.relations.hostileEndedBody'), company.id);
  } else if (relation.stance === 'allied' && score < RELATION.allyEndsAt) {
    delete relation.stance;
    delete relation.since;
    pushNews(state, 'neutral', tc('core.relations.allyEndedTitle', { name: company.name }), tc('core.relations.allyEndedBody'), company.id);
  }
  if (relation.stance) return;
  if (score <= RELATION.hostileAt) {
    relation.stance = 'hostile';
    relation.since = day;
    pushNews(
      state,
      'rival',
      tc('core.relations.hostileTitle', { name: company.name }),
      withQuote(tc('core.relations.hostileBody', { days: RELATION.revengeDays }), relationQuote(state, company, 'hostile')),
      company.id,
    );
  } else if (score >= RELATION.allyAt) {
    relation.stance = 'allied';
    relation.since = day;
    pushNews(
      state,
      'good',
      tc('core.relations.alliedTitle', { name: company.name }),
      withQuote(tc('core.relations.alliedBody'), relationQuote(state, company, 'allied')),
      company.id,
    );
  }
}

/**
 * Oyuncunun bir rakibe karşı hamlesi hafızaya giriyor. `units` olayın
 * büyüklüğü (hissede yüzde, diğerlerinde 1). Mizaç çarpıyor; puan
 * sınırda kırpılıyor. Uygulanan değişimi döner.
 */
export function noteRelation(state: GameState, companyId: string, kind: RelationEventKind, units = 1): number {
  if (!relationsEnabled(state)) return 0;
  const company = state.companies[companyId];
  if (!company || company.isPlayer) return 0;
  const temperament = temperamentOf(state, companyId);
  if (!temperament) return 0;
  const base = RELATION.events[kind] * units;
  let delta = base * (base < 0 ? temperament.hostile : temperament.friendly);
  if (kind === 'outbid' || kind === 'campaignHeld') delta *= temperament.pride;
  const relation = (company.relation ??= { score: 0, memory: [] });
  const before = relation.score;
  relation.score = round2(clampScore(before + delta));
  const applied = relation.score - before;
  if (Math.abs(applied) < 0.01) return 0;
  remember(relation, state.time.day, kind, applied);
  updateStance(state, company, relation);
  return applied;
}

/** Hisse olayının büyüklüğü: hissedarın aldığı/sattığı adedin şirketin hisselerine oranı (yüzde). */
export function sharePercent(count: number, outstanding: number): number {
  return outstanding > 0 ? (count / outstanding) * 100 : 0;
}

// ------------------------------------------------------------ fiyat kırma

/**
 * Oyuncu bu hafta hangi rakiplerden ucuz satıyor: aynı bölgede, aynı
 * kategoride, oyuncunun mağazasının fiyat çarpanı en çok ×0,90 ve
 * rakibin mağazasınınkinden düşük. Rakip başına bir kez.
 */
export function undercutRivals(state: GameState): string[] {
  const player = state.playerCompanyId;
  const cheapest = new Map<string, number>();
  for (const building of Object.values(state.buildings)) {
    if (building.companyId !== player) continue;
    const def = BUILDING_BY_ID[building.defId];
    if (def?.role !== 'outlet' || building.priceMultiplier > RELATION.undercutPrice) continue;
    const key = `${building.districtId}|${def.category}`;
    cheapest.set(key, Math.min(cheapest.get(key) ?? Infinity, building.priceMultiplier));
  }
  if (cheapest.size === 0) return [];
  const hit = new Set<string>();
  for (const building of Object.values(state.buildings)) {
    if (building.companyId === player || hit.has(building.companyId)) continue;
    const def = BUILDING_BY_ID[building.defId];
    if (def?.role !== 'outlet') continue;
    const mine = cheapest.get(`${building.districtId}|${def.category}`);
    if (mine !== undefined && mine < building.priceMultiplier) hit.add(building.companyId);
  }
  return [...hit].sort();
}

// ------------------------------------------------------------ günlük adım

/** Günlük adım: sönüm, haftada bir fiyat kırma. Rakip adımından önce: bugünkü duruşla hamle etsinler. */
export function runRelationsTick(state: GameState): void {
  if (!relationsEnabled(state)) return;
  for (const company of rivalCompanies(state)) {
    const relation = company.relation;
    if (!relation || relation.score === 0) continue;
    const temperament = temperamentOf(state, company.id)!;
    const fade = relation.score < 0 ? temperament.fadeHostile : temperament.fadeFriendly;
    relation.score = relation.score < 0 ? Math.min(0, round2(relation.score + fade)) : Math.max(0, round2(relation.score - fade));
    updateStance(state, company, relation);
  }
  if (state.time.day % RELATION.undercutEveryDays === 0) {
    for (const companyId of undercutRivals(state)) {
      if (rivalProfile(state, state.companies[companyId]?.profileId)) noteRelation(state, companyId, 'undercut');
    }
  }
}

// ------------------------------------------------------------ uzlaşma

/** Uzlaşmanın bedeli: rakibin net değerinin %1'i, en az 50 B ₺. */
export function amendsCost(state: GameState, companyId: string): number {
  const company = state.companies[companyId];
  return Math.max(RELATION.amends.min, Math.round(Math.max(0, company?.netWorth ?? 0) * RELATION.amends.share));
}

/** Uzlaşma neden yapılamıyor; yapılabiliyorsa null. */
export function amendsBlocker(state: GameState, companyId: string): string | null {
  if (!relationsEnabled(state)) return tc('core.relations.disabled');
  const company = state.companies[companyId];
  if (!company || company.isPlayer || !rivalProfile(state, company.profileId)) return tc('core.relations.notRival');
  if (company.relation?.stance === 'allied') return tc('core.relations.alreadyAllied');
  const last = company.relation?.amendsDay;
  if (last !== undefined && state.time.day - last < RELATION.amends.cooldownDays) {
    return tc('core.relations.amendsCooldown', { days: RELATION.amends.cooldownDays - (state.time.day - last) });
  }
  const player = state.companies[state.playerCompanyId];
  const cost = amendsCost(state, companyId);
  if (!player || player.cash < cost) return tc('core.relations.amendsNoCash', { cost: formatMoney(cost) });
  return null;
}

/** Rakibin CEO'sunun vakfına bağış: puan yükseliyor, para kimseye geçmiyor. */
export function makeAmends(state: GameState, companyId: string): CommandResult {
  const blocker = amendsBlocker(state, companyId);
  if (blocker) return { ok: false, reason: blocker };
  const company = state.companies[companyId]!;
  const player = state.companies[state.playerCompanyId]!;
  const cost = amendsCost(state, companyId);
  player.cash -= cost;
  const gained = noteRelation(state, companyId, 'amends');
  company.relation!.amendsDay = state.time.day;
  const profile = rivalProfile(state, company.profileId)!;
  pushNews(
    state,
    'neutral',
    tc('core.relations.amendsTitle', { name: company.name }),
    withQuote(
      tc('core.relations.amendsBody', { ceo: profile.ceoName, cost: formatMoney(cost), points: Math.round(gained) }),
      relationQuote(state, company, 'amends'),
    ),
    company.id,
  );
  return { ok: true };
}
