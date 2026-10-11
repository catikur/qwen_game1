import { CATEGORIES, COUNCIL, CONSUMER_CATEGORIES, MOTION_BIAS, MOTION_TEXT } from '@capital/content';
import type { CategoryId, MotionKind, NpcProfileDef } from '@capital/content';
import { createRng, nextInt, nextRange } from '../rng';
import { pushNews } from '../news';
import { rivalProfiles } from '../profiles';
import { formatMoney } from '../selectors';
import type { CommandResult, CompanyState, GameState, MotionState, PolicyState } from '../types';

/**
 * Belediye meclisi ve lobicilik.
 *
 * Takvim: 120. günden itibaren her 90 günde bir oturum. Oturum açılınca
 * iki önerge açıklanıyor, 20 gün lobi penceresi var, sonra oylama.
 *
 * Destek = meclisin kendi eğilimi + lobi kayması. Kayma her taraf için
 * `swingPerUnit · √(harcama / ölçek)` — azalan verim, toplamda ±%30
 * tavan. %50 ve üstü geçer. Zar YALNIZCA önergeyi ve meclisin eğilimini
 * belirliyor ve o zar dışsal (tohum ^ gün): eşli deneylerde iki kol aynı
 * önergeyi aynı eğilimle görür, fark yalnızca lobiden doğar.
 *
 * Sonuç haberi kimin ne kadar ittiğini yazıyor; aynı lobiyle aynı sonuç.
 */

const COUNCIL_SALT = 2_246_822_519;

function ensureCouncil(state: GameState) {
  return (state.council ??= { nextSessionDay: COUNCIL.firstSessionDay, session: null, history: [] });
}

/** Bir tarafın lobi toplamından destek kayması (işaretsiz). */
function sideSwing(total: number): number {
  if (total <= 0) return 0;
  return COUNCIL.swingPerUnit * Math.sqrt(total / COUNCIL.influenceScale);
}

export interface SupportBreakdown {
  support: number;
  base: number;
  /** Şirket → destek payına katkısı (işaretli, yüzde puanı değil oran). */
  contributions: Array<{ companyId: string; delta: number; spent: number }>;
}

/**
 * Önergenin bugünkü desteği ve kimin ne kadar kaydırdığı.
 *
 * Bir tarafın kayması harcamaya göre şirketlere bölüştürülüyor; tavan
 * uygulanınca katkılar aynı oranda kırpılıyor. Böylece haberdeki
 * katkıların toplamı her zaman ekrandaki desteğe eşit.
 */
export function motionSupport(motion: MotionState): SupportBreakdown {
  let forTotal = 0;
  let againstTotal = 0;
  for (const amount of Object.values(motion.lobby)) {
    if (amount > 0) forTotal += amount;
    else againstTotal -= amount;
  }
  const rawFor = sideSwing(forTotal);
  const rawAgainst = sideSwing(againstTotal);
  const net = rawFor - rawAgainst;
  const capped = Math.max(-COUNCIL.maxSwing, Math.min(COUNCIL.maxSwing, net));
  const scale = net !== 0 ? capped / net : 1;

  const contributions = Object.entries(motion.lobby)
    .filter(([, amount]) => amount !== 0)
    .map(([companyId, amount]) => {
      const share = amount > 0 ? (forTotal > 0 ? amount / forTotal : 0) : againstTotal > 0 ? -amount / againstTotal : 0;
      const delta = (amount > 0 ? rawFor : -rawAgainst) * share * scale;
      return { companyId, delta, spent: Math.abs(amount) };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return {
    support: Math.max(0, Math.min(1, motion.baseSupport + capped)),
    base: motion.baseSupport,
    contributions,
  };
}

// ------------------------------------------------------------ önergeler

function fill(template: string, district?: string, category?: string): string {
  return template.replace(/\{district\}/g, district ?? 'Şehir').replace(/\{category\}/g, category ?? 'Perakende');
}

function generateMotions(state: GameState): MotionState[] {
  const day = state.time.day;
  const dice = createRng((state.meta.seed ^ Math.imul(day, COUNCIL_SALT)) >>> 0);
  const kinds: MotionKind[] = ['category_tax', 'category_relief', 'infrastructure', 'permit_relief'];
  const locked = state.districts.filter(
    (district) => district.opensOnDay !== undefined && district.opensOnDay - day > COUNCIL.lobbyWindowDays + COUNCIL.zoningMinLeadDays,
  );
  if (locked.length > 0) kinds.push('zoning_rush');

  const motions: MotionState[] = [];
  const used = new Set<MotionKind>();
  for (let index = 0; index < COUNCIL.motionsPerSession; index++) {
    const pool = kinds.filter((kind) => !used.has(kind));
    if (pool.length === 0) break;
    const kind = pool[nextInt(dice, 0, pool.length)]!;
    used.add(kind);

    let districtId: number | undefined;
    let category: CategoryId | undefined;
    if (kind === 'zoning_rush') districtId = locked[nextInt(dice, 0, locked.length)]!.id;
    if (kind === 'infrastructure') {
      const open = state.districts.filter((d) => d.opensOnDay === undefined || d.opensOnDay <= day);
      districtId = open[nextInt(dice, 0, open.length)]!.id;
    }
    if (kind === 'category_tax' || kind === 'category_relief') {
      category = CONSUMER_CATEGORIES[nextInt(dice, 0, CONSUMER_CATEGORIES.length)]!;
    }

    const districtName = districtId !== undefined ? state.districts[districtId]!.name : undefined;
    const categoryName = category ? CATEGORIES[category].name : undefined;
    const text = MOTION_TEXT[kind];
    motions.push({
      id: `m${day}-${index}`,
      kind,
      title: fill(text.title, districtName, categoryName),
      summary: fill(text.summary, districtName, categoryName),
      ...(districtId !== undefined ? { districtId } : {}),
      ...(category ? { category } : {}),
      baseSupport: nextRange(dice, COUNCIL.baseSupportMin, COUNCIL.baseSupportMax) + MOTION_BIAS[kind],
      lobby: {},
    });
  }
  return motions;
}

// -------------------------------------------------------------- çıkar

function ownedShareIn(state: GameState, companyId: string, districtId: number): number {
  let owned = 0;
  let plots = 0;
  for (const tile of state.map.tiles) {
    if (tile.districtId !== districtId || tile.kind !== 'plot') continue;
    plots++;
    if (tile.ownerId === companyId) owned++;
  }
  return plots > 0 ? owned / plots : 0;
}

/**
 * Bir şirketin önergeye çıkarı, −1..1.
 *
 * Doktrin burada konuşuyor: vergi gelen kategoride payın büyükse karşı,
 * teşvikte lehte; metro gelecek bölgede arsan varsa lehte; genişlemeci
 * ruhsat kolaylığını ve erken imarı ister, arsa spekülatörü erken imara
 * karşıdır (arz artarsa elindeki arsa ucuzlar).
 */
export function interestOf(state: GameState, company: CompanyState, motion: MotionState, profile?: NpcProfileDef): number {
  const clamp = (value: number) => Math.max(-1, Math.min(1, value));
  switch (motion.kind) {
    case 'category_tax':
      return clamp(-(company.marketShare[motion.category!] ?? 0) * 3);
    case 'category_relief':
      return clamp((company.marketShare[motion.category!] ?? 0) * 3);
    case 'infrastructure': {
      const share = ownedShareIn(state, company.id, motion.districtId!);
      return clamp(share * 4 * (profile?.trait === 'landlord' ? 1.5 : 1));
    }
    case 'permit_relief':
      return profile?.trait === 'expansionist' ? 0.7 : 0.3;
    case 'zoning_rush':
      if (profile?.trait === 'landlord') return -0.6;
      return profile?.trait === 'expansionist' ? 0.6 : 0.15;
  }
}

/** Rakibin bir önerge için ayıracağı bütçe tavanı. */
function rivalLobbyBudget(company: CompanyState, profile: NpcProfileDef): number {
  return Math.min(company.cash * 0.04, 300_000) * profile.aggression;
}

function rivalsLobby(state: GameState, motions: MotionState[]): void {
  rivalProfiles(state).forEach((profile) => {
    const company = state.companies[profile.id];
    if (!company) return;
    for (const motion of motions) {
      if (motion.lobby[company.id] !== undefined) continue;
      const interest = interestOf(state, company, motion, profile);
      const amount = Math.round(rivalLobbyBudget(company, profile) * interest);
      if (Math.abs(amount) < 10_000 || Math.abs(amount) > company.cash) continue;
      company.cash -= Math.abs(amount);
      motion.lobby[company.id] = amount;
    }
  });
}

// ------------------------------------------------------------- etkiler

function applyMotion(state: GameState, motion: MotionState): string {
  const day = state.time.day;
  switch (motion.kind) {
    case 'category_tax':
    case 'category_relief': {
      const rate = motion.kind === 'category_tax' ? COUNCIL.taxRate : COUNCIL.reliefRate;
      const policy: PolicyState = {
        kind: motion.kind,
        category: motion.category!,
        rate,
        untilDay: day + COUNCIL.policyDays,
        title: motion.title,
      };
      (state.policies ??= []).push(policy);
      return `${COUNCIL.policyDays} gün yürürlükte.`;
    }
    case 'permit_relief':
      (state.policies ??= []).push({
        kind: 'permit_relief',
        rate: COUNCIL.permitDiscount,
        untilDay: day + COUNCIL.permitDays,
        title: motion.title,
      });
      return `${COUNCIL.permitDays} gün boyunca inşaat %${Math.round(COUNCIL.permitDiscount * 100)} ucuz.`;
    case 'infrastructure': {
      const district = state.districts[motion.districtId!]!;
      district.infrastructure = (district.infrastructure ?? 0) + 1;
      for (const tile of state.map.tiles) {
        if (tile.districtId === district.id) tile.landValue *= 1 + COUNCIL.infrastructureLandBoost;
      }
      return `${district.name} arsaları %${Math.round(COUNCIL.infrastructureLandBoost * 100)} değer kazandı.`;
    }
    case 'zoning_rush': {
      const district = state.districts[motion.districtId!]!;
      if (district.opensOnDay === undefined) return 'Bölge zaten açık.';
      district.opensOnDay = Math.max(day + COUNCIL.zoningMinLeadDays, district.opensOnDay - COUNCIL.zoningAdvanceDays);
      // Bu haber imar duyurusunun yerine de geçiyor: 30 gün kala düşen
      // duyuru günü öne çekmeyle geride kalmış olabilir.
      return `İmar planı açıklandı: ${district.name} ${district.opensOnDay - day} gün sonra imara açılıyor — arsa koşusu o gün başlar.`;
    }
  }
}

function explain(state: GameState, motion: MotionState, breakdown: SupportBreakdown): string {
  const percent = (value: number) => `%${Math.round(value * 100)}`;
  const parts = breakdown.contributions.slice(0, 3).map((entry) => {
    const name = state.companies[entry.companyId]?.name ?? 'Bir şirket';
    const sign = entry.delta >= 0 ? '+' : '−';
    return `${name} ${sign}${Math.abs(Math.round(entry.delta * 100))} puan (${formatMoney(entry.spent)})`;
  });
  const lobby = parts.length > 0 ? `; ${parts.join(', ')}` : '; kimse lobi yapmadı';
  return `${percent(breakdown.support)} destek — meclisin eğilimi ${percent(breakdown.base)}${lobby}.`;
}

// ---------------------------------------------------------------- tick

/** Süresi dolan kararları düşürür. */
function expirePolicies(state: GameState): void {
  if (!state.policies) return;
  const before = state.policies.length;
  state.policies = state.policies.filter((policy) => policy.untilDay > state.time.day);
  if (state.policies.length < before) {
    pushNews(state, 'neutral', 'Meclis kararının süresi doldu', 'Geçici vergi/teşvik/ruhsat kararı sona erdi.');
  }
}

export function runCouncilTick(state: GameState): void {
  // Kararlar meclis kapatılsa da süresinde biter — yoksa vergi sonsuza
  // dek yürürlükte kalırdı.
  expirePolicies(state);
  if (state.flags.council === false) {
    const session = state.council?.session;
    if (session) {
      // Açık oturum oylanmadan dağılıyor: bağışlar sahiplerine dönüyor.
      for (const motion of session.motions) {
        for (const [companyId, amount] of Object.entries(motion.lobby)) {
          const company = state.companies[companyId];
          if (company) company.cash += Math.abs(amount);
        }
      }
      state.council!.session = null;
    }
    return;
  }
  const council = ensureCouncil(state);
  const day = state.time.day;

  const session = council.session;
  if (session) {
    // Rakipler oturumun üçüncü gününde lobi yapıyor: oyuncu önergeleri
    // görüp kimin hangi tarafta olduğunu izleyebilsin, ama son güne kadar
    // beklemesin — lobi kamuya açık ve tepki verilebilir olmalı.
    if (day === session.openedDay + 3) rivalsLobby(state, session.motions);

    if (day >= session.voteDay) {
      for (const motion of session.motions) {
        const breakdown = motionSupport(motion);
        const passed = breakdown.support >= 0.5;
        motion.result = { passed, support: breakdown.support, day };
        const effect = passed ? ` ${applyMotion(state, motion)}` : '';
        pushNews(
          state,
          passed ? 'good' : 'neutral',
          `${passed ? 'Meclis kabul etti' : 'Meclis reddetti'}: ${motion.title}`,
          `${explain(state, motion, breakdown)}${effect}`,
          motion.districtId !== undefined ? { districtId: motion.districtId } : undefined,
        );
      }
      council.history = [...session.motions, ...council.history].slice(0, 8);
      council.session = null;
      council.nextSessionDay = day + COUNCIL.sessionEveryDays - COUNCIL.lobbyWindowDays;
    }
    return;
  }

  if (day < council.nextSessionDay) return;
  const motions = generateMotions(state);
  if (motions.length === 0) return;
  council.session = { openedDay: day, voteDay: day + COUNCIL.lobbyWindowDays, motions };
  pushNews(
    state,
    'neutral',
    'Belediye meclisi toplanıyor',
    `${COUNCIL.lobbyWindowDays} gün sonra oylanacak: ${motions.map((m) => m.title).join(' · ')}. Lobi bağışları kamuya açık.`,
  );
}

// ------------------------------------------------------------- oyuncu

export function lobby(
  state: GameState,
  companyId: string,
  motionId: string,
  side: 'for' | 'against',
  amount: number,
): CommandResult {
  const session = state.council?.session;
  if (state.flags.council === false || !session) return { ok: false, reason: 'Meclis şu an toplantıda değil.' };
  const motion = session.motions.find((m) => m.id === motionId);
  if (!motion) return { ok: false, reason: 'Bu önerge gündemde değil.' };
  // Bir önergede tek taraf: iki tarafa birden bağış kamuya açık kayıtta
  // birbirini silerdi, harcanan para ise gerçek olurdu.
  const previous = motion.lobby[companyId] ?? 0;
  if ((previous > 0 && side === 'against') || (previous < 0 && side === 'for')) {
    return { ok: false, reason: 'Bu önergede zaten öteki tarafa bağış yaptın — taraf değiştirilemez.' };
  }
  const company = state.companies[companyId];
  if (!company) return { ok: false, reason: 'Bilinmeyen şirket.' };
  const spend = Math.round(amount);
  if (!(spend > 0)) return { ok: false, reason: 'Bağış tutarı sıfırdan büyük olmalı.' };
  if (spend > company.cash) return { ok: false, reason: 'Nakdin bu bağışa yetmiyor.' };

  company.cash -= spend;
  motion.lobby[companyId] = (motion.lobby[companyId] ?? 0) + (side === 'for' ? spend : -spend);
  return { ok: true };
}

// ------------------------------------------------------- okuyucular

/** Kategori cirosuna uygulanan net oran (+ teşvik, − vergi). */
export function categoryRevenueRate(state: GameState, category: CategoryId): number {
  let rate = 0;
  for (const policy of state.policies ?? []) {
    if (policy.category !== category) continue;
    if (policy.kind === 'category_tax') rate -= policy.rate;
    if (policy.kind === 'category_relief') rate += policy.rate;
  }
  return rate;
}

/** İnşaat maliyetine çarpan (ruhsat kolaylığı). */
export function permitMultiplier(state: GameState): number {
  let multiplier = 1;
  for (const policy of state.policies ?? []) {
    if (policy.kind === 'permit_relief') multiplier *= 1 - policy.rate;
  }
  return multiplier;
}
