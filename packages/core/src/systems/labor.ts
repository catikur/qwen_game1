import { BUILDING_BY_ID, LABOR, NPC_LABOR, WAGE_POLICIES } from '@capital/content';
import type { BuildingDef, UnionResponse, WagePolicy } from '@capital/content';
import { pushNews } from '../news';
import { rivalProfile } from '../profiles';
import { createRng, nextFloat, nextRange } from '../rng';
import type { CommandResult, CompanyState, GameState, LaborState } from '../types';

/**
 * İşgücü — ücretin tek doğru kaynağı.
 *
 * Ücret eskiden üç yerde ayrı ayrı yazılıyordu (günlük defter, yatırım
 * tahmini, zincir kartının birim maliyeti) ve aynı sabitin üç kopyası
 * vardı. Bu fonksiyon tek kapı: defter, tahmin ve kart aynı rakamı görür
 * — oyuncuya gösterilen geri ödeme, ödeyeceği ücretle hesaplanır.
 *
 * Üç katman çarpılıyor:
 *   - bölgenin ücret endeksi (iş/nüfus oranından; sanayi kümesi pahalı),
 *   - şirketin ücret politikası (düşük / piyasa / yüksek),
 *   - imzalanmış toplu sözleşmelerin birikmiş zammı.
 *
 * Sendika baskısı her gün GÖRÜNÜR biçimde dolar; dolunca talep masaya
 * gelir. Zar yalnızca talebin küçük oynamasında ve cevabın sonucunda, o
 * da dışsal (tohum ^ gün ^ şirket): eşli deneylerin iki kolu aynı günde
 * aynı cevabı verirse aynı sonucu görür.
 */
export const WAGE_PER_JOB = 42;

const LABOR_SALT = 1_597_334_677;

export function laborEnabled(state: GameState): boolean {
  return state.flags.labor !== false;
}

/** Grevin vurduğu binalar: mağazalar ve üretim. Kiralık, Ar-Ge, depo çalışır. */
export function struckRole(def: BuildingDef): boolean {
  return def.role === 'outlet' || def.role === 'extract' || def.role === 'process';
}

/** Bir binanın günlük ücret gideri (henüz kurulmamış bina için de). */
export function wageFor(state: GameState, companyId: string, defId: string, districtId: number): number {
  const def = BUILDING_BY_ID[defId];
  if (!def) return 0;
  const district = state.districts[districtId];
  const base = def.jobs * WAGE_PER_JOB * (0.6 + (district?.incomeLevel ?? 0.5));
  if (!laborEnabled(state)) return base;
  const labor = state.companies[companyId]?.labor;
  const policy = WAGE_POLICIES[labor?.policy ?? 'market'].wage;
  return base * (district?.wageIndex ?? 1) * policy * (labor?.agreement ?? 1);
}

/** Grev sürüyorsa çalışan kapasite oranı (yalnızca `struckRole` binalar). */
export function strikeFactor(state: GameState, companyId: string): number {
  if (!laborEnabled(state)) return 1;
  const strike = state.companies[companyId]?.labor?.strike;
  if (!strike) return 1;
  const day = state.time.day;
  return day >= strike.startedDay && day <= strike.endsOnDay ? LABOR.strikeCapacity : 1;
}

/** Binaya özgü grev çarpanı. */
export function buildingStrikeFactor(state: GameState, companyId: string, def: BuildingDef): number {
  return struckRole(def) ? strikeFactor(state, companyId) : 1;
}

/** Mağaza hizmeti: ücret politikasının çekiciliğe çarpanı. */
export function serviceFactor(state: GameState, companyId: string): number {
  if (!laborEnabled(state)) return 1;
  return WAGE_POLICIES[state.companies[companyId]?.labor?.policy ?? 'market'].service;
}

/** Şirketin toplam çalışanı ve çalışan ağırlıklı ücret endeksi. */
export function workforce(state: GameState, companyId: string): { employees: number; index: number } {
  let employees = 0;
  let weighted = 0;
  for (const building of Object.values(state.buildings)) {
    if (building.companyId !== companyId) continue;
    const jobs = BUILDING_BY_ID[building.defId]?.jobs ?? 0;
    employees += jobs;
    weighted += jobs * (state.districts[building.districtId]?.wageIndex ?? 1);
  }
  return { employees, index: employees > 0 ? weighted / employees : 1 };
}

/** Bölgenin hedef ücret endeksi: iş/nüfus oranından. */
export function wageIndexTarget(jobs: number, population: number): number {
  const density = jobs / Math.max(1, population);
  return Math.min(LABOR.indexCap, 1 + LABOR.densitySlope * Math.max(0, density - LABOR.densityFree));
}

function profileOf(state: GameState, company: CompanyState) {
  return company.isPlayer ? undefined : rivalProfile(state, company.profileId);
}

function ensureLabor(state: GameState, company: CompanyState): LaborState {
  if (company.labor) return company.labor;
  const doctrine = profileOf(state, company);
  company.labor = {
    policy: doctrine ? NPC_LABOR[doctrine.trait].policy : 'market',
    pressure: 0,
    agreement: 1,
  };
  return company.labor;
}

function companyDice(state: GameState, companyId: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < companyId.length; i++) {
    hash ^= companyId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return createRng((state.meta.seed ^ Math.imul(state.time.day, LABOR_SALT) ^ hash) >>> 0);
}

/** En kalabalık grev binası — haberin yeri. */
function laborSite(state: GameState, companyId: string): number | undefined {
  let best: { tileId: number; jobs: number } | null = null;
  for (const building of Object.values(state.buildings)) {
    if (building.companyId !== companyId) continue;
    const def = BUILDING_BY_ID[building.defId];
    if (!def || !struckRole(def)) continue;
    if (!best || def.jobs > best.jobs) best = { tileId: building.tileId, jobs: def.jobs };
  }
  return best?.tileId;
}

export function percent(rate: number): string {
  const value = Math.round(rate * 1000) / 10;
  return `%${String(value).replace('.', ',')}`;
}

/** Uzlaşma teklifinin tutma ihtimali (arayüz de bunu gösteriyor). */
export function compromiseOdds(state: GameState, labor: LaborState): number {
  const policy = WAGE_POLICIES[labor.policy];
  const held = labor.policyDay === undefined || state.time.day - labor.policyDay >= LABOR.trustAfterDays;
  // Yüksek ücretin güveni zamanla kazanılır; düşük ücretin bedeli hemen.
  const trust = policy.trust > 0 && !held ? 0 : policy.trust;
  const hardline =
    labor.lastResponse?.kind === 'reject' && state.time.day - labor.lastResponse.day <= LABOR.hardlineMemoryDays
      ? LABOR.hardlinePenalty
      : 0;
  return Math.max(0.05, Math.min(0.95, LABOR.compromiseOdds + trust - hardline));
}

/** Ret sonrası grev ihtimali. */
export function strikeOdds(labor: LaborState): number {
  return LABOR.strikeOdds[labor.policy];
}

function startStrike(state: GameState, company: CompanyState, labor: LaborState, raise: number, startDay: number): void {
  labor.strike = { startedDay: startDay, endsOnDay: startDay + LABOR.strikeDays - 1, raise };
  labor.pressure = 0;
  const tileId = laborSite(state, company.id);
  const where = tileId !== undefined ? { companyId: company.id, tileId } : company.id;
  if (company.isPlayer) {
    pushNews(
      state,
      'bad',
      'Grev başladı',
      `${LABOR.strikeDays} gün boyunca mağazaların ve fabrikaların ${percent(LABOR.strikeCapacity)} kapasiteyle çalışacak. Grev bitince ${percent(raise)} zamla sözleşme imzalanacak.`,
      where,
    );
  } else {
    pushNews(
      state,
      'rival',
      `${company.name}'de grev`,
      `Sendika iş bıraktı: ${LABOR.strikeDays} gün mağazaları ve fabrikaları ${percent(LABOR.strikeCapacity)} kapasitede. Raflarında boşluk olacak.`,
      where,
    );
  }
}

/**
 * Talebe cevap — oyuncu komutla, rakip doktrinle, süre dolarsa "Ret".
 * `startDay`: grev çıkarsa ilk günü (komut gün içinde geldiği için ertesi gün).
 */
function resolveDemand(state: GameState, company: CompanyState, response: UnionResponse, startDay: number): void {
  const labor = company.labor;
  const demand = labor?.demand;
  if (!labor || !demand) return;
  delete labor.demand;
  const dice = companyDice(state, company.id);
  const roll = nextFloat(dice);
  const raise = demand.raise;
  const day = state.time.day;
  const player = company.isPlayer;

  if (response === 'accept') {
    labor.agreement *= 1 + raise;
    labor.pressure = 0;
    if (player) pushNews(state, 'neutral', 'Toplu sözleşme imzalandı', `Ücretler ${percent(raise)} arttı. Sendika baskısı sıfırlandı.`);
  } else if (response === 'compromise') {
    const odds = compromiseOdds(state, labor);
    const offered = raise * LABOR.compromiseShare;
    if (roll < odds) {
      labor.agreement *= 1 + offered;
      labor.pressure = LABOR.compromisePressureKeep;
      if (player) pushNews(state, 'good', 'Uzlaşma tuttu', `Sendika ${percent(offered)} zamma razı oldu (istenen ${percent(raise)}).`);
    } else {
      if (player) pushNews(state, 'bad', 'Sendika uzlaşmayı reddetti', `${percent(offered)} teklifi masada kalmadı.`);
      startStrike(state, company, labor, raise * LABOR.strikeSettlement, startDay);
    }
  } else {
    if (roll < strikeOdds(labor)) {
      startStrike(state, company, labor, raise * LABOR.strikeSettlement, startDay);
    } else {
      labor.pressure = LABOR.rejectPressureKeep;
      if (player) pushNews(state, 'neutral', 'Sendika geri adım attı', 'Grev çıkmadı ama baskı yarıdan başlıyor — talep yine gelecek.');
    }
  }
  labor.lastResponse = { kind: response, day };
}

function openDemand(state: GameState, company: CompanyState, labor: LaborState): void {
  const day = state.time.day;
  const dice = companyDice(state, company.id);
  // Dünkü defter: tick, defter sıfırlanmadan önce koşuyor.
  const margin = company.today.revenue > 0 ? company.today.profit / company.today.revenue : 0;
  const raw =
    LABOR.demandBase +
    LABOR.demandMargin * Math.max(0, Math.min(1, margin / LABOR.marginFull)) +
    WAGE_POLICIES[labor.policy].demandBonus +
    nextRange(dice, -LABOR.demandJitter, LABOR.demandJitter);
  const raise = Math.round(Math.max(0.03, raw) * 200) / 200;
  labor.demand = { raise, offeredDay: day, deadlineDay: day + LABOR.deadlineDays };

  const profile = profileOf(state, company);
  if (profile) {
    resolveDemand(state, company, NPC_LABOR[profile.trait].response, day);
    return;
  }
  const tileId = laborSite(state, company.id);
  pushNews(
    state,
    'bad',
    `Sendika ${percent(raise)} zam istiyor`,
    `${LABOR.deadlineDays} gün içinde cevap ver. Kabul: ücretler ${percent(raise)} artar. Uzlaşma: ${percent(raise * LABOR.compromiseShare)} teklif, tutma ihtimali ${percent(compromiseOdds(state, labor))}. Ret: grev ihtimali ${percent(strikeOdds(labor))}. Cevapsız kalırsa Ret sayılır.`,
    tileId !== undefined ? { tileId } : undefined,
  );
}

/** Günlük işgücü adımı. Defterler sıfırlanmadan ÖNCE koşar (dünkü marjı okur). */
export function runLaborTick(state: GameState): void {
  if (!laborEnabled(state)) {
    // Kapatılan sistem masada talep ya da süren grev bırakmasın.
    for (const company of Object.values(state.companies)) {
      if (!company.labor) continue;
      delete company.labor.demand;
      delete company.labor.strike;
    }
    return;
  }
  const day = state.time.day;

  // ---- Bölge ücret endeksi ----
  const jobs = new Array<number>(state.districts.length).fill(0);
  for (const building of Object.values(state.buildings)) {
    jobs[building.districtId] = (jobs[building.districtId] ?? 0) + (BUILDING_BY_ID[building.defId]?.jobs ?? 0);
  }
  for (const district of state.districts) {
    const target = wageIndexTarget(jobs[district.id] ?? 0, district.population);
    const current = district.wageIndex ?? 1;
    district.wageIndex = current + (target - current) / LABOR.indexSmoothingDays;
  }

  // ---- Şirketler ----
  for (const company of Object.values(state.companies)) {
    const labor = ensureLabor(state, company);

    if (labor.strike && day > labor.strike.endsOnDay) {
      const { raise, endsOnDay, startedDay } = labor.strike;
      labor.agreement *= 1 + raise;
      labor.strikeDays = (labor.strikeDays ?? 0) + (endsOnDay - startedDay + 1);
      delete labor.strike;
      if (company.isPlayer) {
        pushNews(state, 'neutral', 'Grev bitti', `Sözleşme ${percent(raise)} zamla imzalandı; kapasite tam.`);
      }
    }
    if (labor.strike) continue;

    if (labor.demand) {
      if (day > labor.demand.deadlineDay) resolveDemand(state, company, 'reject', day);
      continue;
    }

    const { employees, index } = workforce(state, company.id);
    if (employees < LABOR.minEmployees) continue;
    const before = labor.pressure;
    labor.pressure = Math.min(
      1,
      labor.pressure +
        LABOR.pressurePerDay *
          Math.min(1, employees / LABOR.pressureFullAt) *
          WAGE_POLICIES[labor.policy].pressure *
          (1 + LABOR.tightnessPressure * Math.max(0, index - 1)),
    );
    if (company.isPlayer && before < 0.75 && labor.pressure >= 0.75) {
      pushNews(state, 'neutral', 'Sendika örgütleniyor', `Baskı ${percent(labor.pressure)}. Dolduğunda zam talebi masaya gelecek.`);
    }
    if (labor.pressure >= 1) openDemand(state, company, labor);
  }
}

export function setWagePolicy(state: GameState, companyId: string, policy: WagePolicy): CommandResult {
  if (!laborEnabled(state)) return { ok: false, reason: 'İşgücü sistemi kapalı.' };
  const company = state.companies[companyId];
  if (!company) return { ok: false, reason: 'Şirket bulunamadı.' };
  if (!WAGE_POLICIES[policy]) return { ok: false, reason: 'Bilinmeyen politika.' };
  const labor = ensureLabor(state, company);
  if (labor.policy === policy) return { ok: false, reason: 'Politika zaten bu.' };
  if (labor.policyDay !== undefined && state.time.day - labor.policyDay < LABOR.policyCooldownDays) {
    const left = LABOR.policyCooldownDays - (state.time.day - labor.policyDay);
    return { ok: false, reason: `Ücret politikası ${left} gün sonra yeniden değiştirilebilir.` };
  }
  labor.policy = policy;
  labor.policyDay = state.time.day;
  return { ok: true };
}

export function respondUnion(state: GameState, companyId: string, response: UnionResponse): CommandResult {
  if (!laborEnabled(state)) return { ok: false, reason: 'İşgücü sistemi kapalı.' };
  const company = state.companies[companyId];
  if (!company?.labor?.demand) return { ok: false, reason: 'Masada sendika talebi yok.' };
  if (response !== 'accept' && response !== 'compromise' && response !== 'reject') {
    return { ok: false, reason: 'Bilinmeyen cevap.' };
  }
  // Gün içinde verilen cevabın grevi ertesi gün başlar: bugünün defteri kapanmış.
  resolveDemand(state, company, response, state.time.day + 1);
  return { ok: true };
}
