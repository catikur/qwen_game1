import { CATEGORIES, PROJECTS, PROJECT_BY_ID, PROJECT_TIMING, STRUCTURE_BY_ID } from '@capital/content';
import type { CategoryId, ProjectDef } from '@capital/content';
import { tc } from '../i18n';
import '../i18n/gameTr';
import { pushNews } from '../news';
import { rivalProfile } from '../profiles';
import { createRng, nextFloat } from '../rng';
import { formatMoney } from '../selectors';
import { isDistrictOpen } from './city';
import { noteFeat } from './feats';
import { rivalQuote, withQuote } from './rivalry';
import { scenarioProjectGap } from './scenario';
import type { CommandResult, CompanyState, DistrictState, GameState, ProjectState } from '../types';

/**
 * Şehir projeleri (Tur 37d) — içerik ve gerekçe `@capital/content`
 * projects.ts'te.
 *
 * Akış: duyuru → 90 gün katkı → sponsor belli olur, şantiye kurulur →
 * 40 gün inşaat → simge yapı ve kalıcı etki. Takvim ve yer seçimi dışsal
 * zardan (tohum, gün); katkılar komut (`CONTRIBUTE_PROJECT`, lig
 * günlüğünde) ya da rakibin kişiliğine göre haftalık karar (zar yok).
 */

export function projectsEnabled(state: GameState): boolean {
  return state.flags.cityProjects !== false && state.flags.randomEvents !== false;
}

function dice(state: GameState, salt: number): ReturnType<typeof createRng> {
  return createRng(((state.meta.seed ^ 0x1f83d9ab) ^ Math.imul(salt, 0x9e3779b1)) >>> 0);
}

function rangeInt(die: ReturnType<typeof createRng>, [min, max]: readonly [number, number]): number {
  return min + Math.floor(nextFloat(die) * (max - min + 1));
}

/** Komşu bölge: ızgarada yan yana ya da çapraz (pazarın erişim kuralıyla aynı). */
function neighbours(state: GameState, district: DistrictState): DistrictState[] {
  const size = district.x1 - district.x0 + 1;
  return state.districts.filter((other) => {
    if (other.id === district.id) return false;
    return Math.abs(other.x0 - district.x0) / size <= 1 && Math.abs(other.y0 - district.y0) / size <= 1;
  });
}

// ------------------------------------------------------------ etki

/**
 * Bitmiş projelerin bölge talep çarpanları — olay boru hattına giriyor.
 * Proje bölgesi tam etkiyi, komşular `neighborShare` kadarını alıyor;
 * aynı bölgede iki proje varsa çarpanlar çarpılıyor.
 */
export function projectDistrictDemand(
  state: GameState,
): Array<{ districtId: number; multipliers: Partial<Record<CategoryId, number>> }> {
  if (!projectsEnabled(state) || !state.cityProjects?.length) return [];
  const out: Array<{ districtId: number; multipliers: Partial<Record<CategoryId, number>> }> = [];
  for (const done of state.cityProjects) {
    const def = PROJECT_BY_ID[done.defId];
    const district = state.districts[done.districtId];
    if (!def || !district) continue;
    out.push({ districtId: district.id, multipliers: def.demand });
    const shared: Partial<Record<CategoryId, number>> = {};
    for (const [category, multiplier] of Object.entries(def.demand) as [CategoryId, number][]) {
      shared[category] = 1 + (multiplier - 1) * def.neighborShare;
    }
    for (const neighbour of neighbours(state, district)) out.push({ districtId: neighbour.id, multipliers: shared });
  }
  return out;
}

/** Sponsorun proje bölgesindeki mağazalarına kalıcı çekicilik (yoksa 1). */
export function projectAttraction(state: GameState, companyId: string, districtId: number): number {
  if (!projectsEnabled(state) || !state.cityProjects?.length) return 1;
  let multiplier = 1;
  for (const done of state.cityProjects) {
    if (done.sponsorId === companyId && done.districtId === districtId) multiplier *= PROJECT_TIMING.sponsorAttraction;
  }
  return multiplier;
}

/** Sponsorun proje bölgesindeki binalarında bakım çarpanı (belediye ayrıcalığı). */
export function projectUpkeep(state: GameState, companyId: string, districtId: number): number {
  if (!projectsEnabled(state) || !state.cityProjects?.length) return 1;
  let multiplier = 1;
  for (const done of state.cityProjects) {
    if (done.sponsorId === companyId && done.districtId === districtId) multiplier *= PROJECT_TIMING.sponsorUpkeep;
  }
  return multiplier;
}

// ------------------------------------------------------------ katkı

/** Katkı tablosu, büyükten küçüğe (eşitlikte önce katkı veren değil, kimlik sırası: belirlenimci). */
export function projectStandings(state: GameState, project: ProjectState): Array<{ companyId: string; amount: number }> {
  // Oyundan çıkmış şirketin satırı tabloda yok (devralmada katkı devralana geçiyor).
  return Object.entries(project.contributions)
    .filter(([companyId, amount]) => amount > 0 && state.companies[companyId])
    .map(([companyId, amount]) => ({ companyId, amount }))
    .sort((a, b) => b.amount - a.amount || (a.companyId < b.companyId ? -1 : 1));
}

/**
 * Katkı tablosunun satırları: ilk `limit` şirket ve dışarıda kaldıysa oyuncu,
 * GERÇEK sıralarıyla. Önce sıra kesilmiş diziden okunuyordu; yedinci oyuncu
 * altıncı görünüyordu (Codex #64).
 */
export function projectTable(
  state: GameState,
  project: ProjectState,
  limit = 5,
): Array<{ companyId: string; amount: number; rank: number }> {
  const ranked = projectStandings(state, project).map((row, index) => ({ ...row, rank: index + 1 }));
  const rows = ranked.slice(0, limit);
  const mine = ranked.find((row) => row.companyId === state.playerCompanyId);
  if (mine && mine.rank > limit) rows.push(mine);
  return rows;
}

function contribute(state: GameState, company: CompanyState, amount: number): void {
  const project = state.project!;
  company.cash -= amount;
  project.contributions[company.id] = (project.contributions[company.id] ?? 0) + amount;
}

export function contributeToProject(state: GameState, amount: number): CommandResult {
  const project = state.project;
  if (!project || !projectsEnabled(state)) return { ok: false, reason: tc('core.projects.none') };
  if (project.phase !== 'funding') return { ok: false, reason: tc('core.projects.closed') };
  const player = state.companies[state.playerCompanyId];
  if (!player) return { ok: false, reason: tc('core.projects.none') };
  const value = Math.round(amount);
  if (!Number.isFinite(value) || value < PROJECT_TIMING.minContribution) {
    return { ok: false, reason: tc('core.projects.tooSmall', { amount: formatMoney(PROJECT_TIMING.minContribution) }) };
  }
  if (player.cash < value) return { ok: false, reason: tc('core.projects.noCash', { amount: formatMoney(value) }) };
  const leaderBefore = projectStandings(state, project)[0]?.companyId;
  contribute(state, player, value);
  const leaderAfter = projectStandings(state, project)[0]?.companyId;
  if (leaderAfter === player.id && leaderBefore !== player.id) {
    const def = PROJECT_BY_ID[project.defId];
    pushNews(state, 'good', tc('core.projects.youLeadTitle', { project: def.name }), tc('core.projects.youLeadBody', { project: def.name }));
  }
  return { ok: true };
}

/**
 * Rakibin bir projeye ayırdığı bütçe: net değerinin bu kadarı (kişiliğe
 * göre), bölgede mağazası varsa 1,5 katı. Bütçe ~8 haftaya yayılıyor,
 * boştaki nakitle sınırlı.
 *
 * İlk denemede bütçe yoktu, haftalık boştaki nakdin %3–5'i veriliyordu:
 * geç oyunda nakit yığan rakip tek projeye 25–32 M ₺ gömüyordu. Bir
 * sponsorluğun değeri (bir bölgede +%8 çekicilik, marka) bunun çok
 * altında; oyuncu hiçbir projeyi makul bir bedelle alamıyordu.
 */
const RIVAL_BUDGET: Record<string, number> = {
  expansionist: 0.05,
  land_speculator: 0.05,
  tech: 0.04,
  quality_hunter: 0.03,
  price_cutter: 0.015,
};
const BUDGET_WEEKS = 8;

/** Rakip, baskın ve büyüme için kasada tutacağı bu kadarın üstünü değerlendirir. */
const RIVAL_RESERVE = 400_000;

/**
 * Rakiplerin haftalık katkısı. Zar yok: kasa, kişilik ve bölgedeki
 * mağazası belirliyor. Bölgede mağazası olan rakip iki kat istekli —
 * projenin getirisi ona da.
 */
function rivalContributions(state: GameState, project: ProjectState): void {
  if (state.flags.npcCompetition === false) return;
  const leaderBefore = projectStandings(state, project)[0]?.companyId;
  for (const company of Object.values(state.companies)) {
    if (company.isPlayer) continue;
    const profile = rivalProfile(state, company.profileId);
    if (!profile) continue;
    const spare = company.cash - RIVAL_RESERVE;
    if (spare <= 0) continue;
    const present = Object.values(state.buildings).some(
      (building) => building.companyId === company.id && building.districtId === project.districtId,
    );
    const budget = Math.max(0, company.netWorth) * (RIVAL_BUDGET[profile.trait] ?? 0.02) * (present ? 1.5 : 1);
    const left = budget - (project.contributions[company.id] ?? 0);
    const amount = Math.floor(Math.min(spare, left, budget / BUDGET_WEEKS) / 1000) * 1000;
    if (amount >= PROJECT_TIMING.minContribution) contribute(state, company, amount);
  }
  const leaderAfter = projectStandings(state, project)[0]?.companyId;
  const leader = leaderAfter ? state.companies[leaderAfter] : undefined;
  if (leader && !leader.isPlayer && leaderAfter !== leaderBefore) {
    const def = PROJECT_BY_ID[project.defId];
    pushNews(
      state,
      'rival',
      tc('core.projects.rivalLeadTitle', { name: leader.name, project: def.name }),
      withQuote(tc('core.projects.rivalLeadBody', { project: def.name }), rivalQuote(state, leader, 'overtook', {}, 60)),
      leader.id,
    );
  }
}

// ------------------------------------------------------------ takvim

/** Projenin bölgesi ve şantiye karesi: tercih edilen arketipte, en kalabalık açık bölgenin parkı ya da meydanı. */
function pickSite(state: GameState, def: ProjectDef): { districtId: number; tileId: number } | null {
  const taken = new Set((state.cityProjects ?? []).map((done) => done.tileId));
  const built = new Set((state.cityProjects ?? []).map((done) => done.districtId));
  const open = state.districts.filter((district) => isDistrictOpen(state, district.id));
  // Projesi olmayan bölge önce (şehir yayılsın), sonra tercih edilen arketip, sonra nüfus.
  const ranked = [...open].sort((a, b) => {
    const fa = built.has(a.id) ? 0 : 1;
    const fb = built.has(b.id) ? 0 : 1;
    const pa = def.archetypes.includes(a.archetype) ? 1 : 0;
    const pb = def.archetypes.includes(b.archetype) ? 1 : 0;
    return fb - fa || pb - pa || b.population - a.population || a.id - b.id;
  });
  for (const district of ranked) {
    // Belediye kendi arazisine yapıyor: park ya da meydan. Parsel kamuya
    // geçmiyor — büyümenin kuralıyla aynı gerekçe: oyuncunun gözüne
    // kestirdiği parselin bir gecede kamuya geçmesi geri alınamaz bir kayıp.
    const tile = state.map.tiles.find(
      (candidate) =>
        candidate.districtId === district.id &&
        !taken.has(candidate.id) &&
        candidate.kind === 'civic' &&
        candidate.structureId !== null &&
        STRUCTURE_BY_ID[candidate.structureId]?.form === 'flat',
    );
    if (tile) return { districtId: district.id, tileId: tile.id };
  }
  return null;
}

/** Bu proje bugün açılsa sahası (lig izi her projenin saha kuralını sınıyor). */
export function projectSite(state: GameState, defId: ProjectDef['id']): { districtId: number; tileId: number } | null {
  const def = PROJECT_BY_ID[defId];
  return def ? pickSite(state, def) : null;
}

function openProject(state: GameState): boolean {
  const day = state.time.day;
  const done = new Set((state.cityProjects ?? []).map((project) => project.defId));
  const options = PROJECTS.filter((def) => !done.has(def.id));
  if (options.length === 0) return false;
  const def = options[Math.floor(nextFloat(dice(state, day)) * options.length)]!;
  const site = pickSite(state, def);
  if (!site) return false;
  const tile = state.map.tiles[site.tileId]!;
  state.project = {
    defId: def.id,
    districtId: site.districtId,
    tileId: site.tileId,
    openedDay: day,
    closesDay: day + PROJECT_TIMING.windowDays,
    doneDay: day + PROJECT_TIMING.windowDays + PROJECT_TIMING.buildDays,
    phase: 'funding',
    contributions: {},
    previousStructureId: tile.structureId,
  };
  // Saha zaten kamunun (park ya da meydan): satılmıyor, ihaleye çıkmıyor.
  tile.kind = 'civic';
  tile.ownerId = null;
  delete tile.renewal;
  const district = state.districts[site.districtId]!;
  pushNews(
    state,
    'neutral',
    tc('core.projects.openTitle', { project: def.name, district: district.name }),
    tc('core.projects.openBody', { pitch: def.pitch, days: PROJECT_TIMING.windowDays }),
    { districtId: district.id, tileId: tile.id },
  );
  return true;
}

function closeFunding(state: GameState, project: ProjectState): void {
  const def = PROJECT_BY_ID[project.defId];
  const leader = projectStandings(state, project)[0];
  const sponsor = leader ? state.companies[leader.companyId] : undefined;
  project.phase = 'building';
  // İnşaat kapanış gününden sayılıyor; açılışta yazılan tarih yalnızca plan.
  project.doneDay = state.time.day + PROJECT_TIMING.buildDays;
  if (sponsor) {
    project.sponsorId = sponsor.id;
    project.sponsorName = sponsor.name;
  }
  const tile = state.map.tiles[project.tileId];
  if (tile) {
    tile.structureId = 'construction_site';
    tile.structureHeight = STRUCTURE_BY_ID['construction_site']!.minHeight;
  }
  const body = sponsor
    ? tc('core.projects.sponsorBody', {
        sponsor: sponsor.name,
        amount: formatMoney(leader!.amount),
        days: PROJECT_TIMING.buildDays,
      })
    : tc('core.projects.citySponsorBody', { days: PROJECT_TIMING.buildDays });
  pushNews(
    state,
    sponsor?.isPlayer ? 'good' : 'neutral',
    tc('core.projects.sponsorTitle', { project: def.name, sponsor: sponsor?.name ?? tc('core.projects.city') }),
    sponsor && !sponsor.isPlayer ? withQuote(body, rivalQuote(state, sponsor, 'campaignWon', { category: CATEGORIES[def.leadCategory].name })) : body,
    sponsor && !sponsor.isPlayer ? sponsor.id : { tileId: project.tileId },
  );
}

function finishProject(state: GameState, project: ProjectState): void {
  const def = PROJECT_BY_ID[project.defId];
  const district = state.districts[project.districtId];
  const tile = state.map.tiles[project.tileId];
  if (tile) {
    tile.structureId = def.structureId;
    tile.structureHeight = STRUCTURE_BY_ID[def.structureId]?.minHeight ?? 1;
  }
  if (district) {
    district.infrastructure = (district.infrastructure ?? 0) + def.infrastructure;
    for (const other of state.map.tiles) {
      if (other.districtId === district.id) other.landValue = Math.round(other.landValue * def.landValue);
    }
  }
  // Marka: sponsora tam, diğer katkıcılara katkı payları oranında.
  const total = Object.values(project.contributions).reduce((sum, amount) => sum + amount, 0);
  for (const [companyId, amount] of Object.entries(project.contributions)) {
    const company = state.companies[companyId];
    if (!company || amount <= 0) continue;
    const bonus = companyId === project.sponsorId ? PROJECT_TIMING.sponsorBrand : PROJECT_TIMING.supporterBrand * (amount / total);
    company.brand[def.leadCategory] = Math.min(1, (company.brand[def.leadCategory] ?? 0) + bonus);
  }
  (state.cityProjects ??= []).push({
    defId: def.id,
    districtId: project.districtId,
    tileId: project.tileId,
    doneDay: state.time.day,
    ...(project.sponsorId ? { sponsorId: project.sponsorId, sponsorName: project.sponsorName } : {}),
  });
  delete state.project;
  // Kariyer (Tur 41): sponsorluk bitiş anında; devralma `sponsorId`yi sonradan devrediyor (Codex #70).
  if (project.sponsorId === state.playerCompanyId) noteFeat(state, 'projectsSponsored');
  // Senaryonun takvimi (Tur 39: Şehrin sponsoru) serbest oyununkinden sık.
  state.nextProjectDay = state.time.day + rangeInt(dice(state, state.time.day ^ 0x5bd1e995), scenarioProjectGap(state) ?? PROJECT_TIMING.gapDays);
  pushNews(
    state,
    'good',
    tc('core.projects.doneTitle', { name: projectName(state, def.id, project.sponsorName) }),
    tc('core.projects.doneBody', { district: district?.name ?? '' }),
    { tileId: project.tileId },
  );
}

/** Projenin görünen adı: sponsorlu ise "Metro Hattı · Karaca Holding". */
export function projectName(state: GameState, defId: ProjectDef['id'], sponsorName?: string): string {
  const def = PROJECT_BY_ID[defId];
  return sponsorName ? tc('core.projects.named', { project: def.name, sponsor: sponsorName }) : def.name;
}

/**
 * Günlük proje adımı — pazardan ÖNCE değil SONRA da olabilirdi; etki
 * bitiş gününün ertesinden başlıyor (olay boru hattı günün başında
 * okunuyor). Katkı penceresinde rakipler haftada bir karar veriyor.
 */
export function runProjectTick(state: GameState): void {
  if (!projectsEnabled(state)) return;
  const day = state.time.day;
  const project = state.project;
  if (project) {
    if (project.phase === 'funding') {
      if ((day - project.openedDay) % 7 === 3) rivalContributions(state, project);
      if (day >= project.closesDay) closeFunding(state, project);
    } else if (day >= project.doneDay) {
      finishProject(state, project);
    }
    return;
  }
  if (state.gameOver) return;
  state.nextProjectDay ??= rangeInt(dice(state, 1), PROJECT_TIMING.firstDay);
  if (day < state.nextProjectDay) return;
  if (!openProject(state)) state.nextProjectDay = day + 30;
}
