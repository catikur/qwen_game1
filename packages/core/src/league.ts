import { BUILDINGS, BUILDING_BY_ID, CEO_BY_ID, CONSORTIUM, CRISES, CRISIS_TIMING, ENERGY, ERAS, EVENTS, SECTOR_EVENTS, CONSUMER_CATEGORIES, FAD, GOOD_BY_ID, GOODS_BY_CATEGORY, MODIFIER_RULES, PROJECTS, PROJECT_TIMING, REAL_ESTATE, SEASONS, TREND } from '@capital/content';
import type { CategoryId } from '@capital/content';
import { GameEngine } from './engine';
import { formatMoney } from './selectors';
import { LEAGUE_DAILY_DAYS, LEAGUE_RULES_FROM, LEAGUE_RULE_ROTATION, LEAGUE_SAMPLE_DAYS, leagueBoardKind, leagueLength } from './systems/league';
import { build, buyTile } from './actions';
import { isDistrictOpen, isPurchasable } from './systems/city';
import { runConsortiumTick } from './systems/consortium';
import { fadSchedule, livingDemand, seasonMultiplier, trendAt } from './systems/living';
import { goodShares } from './systems/demand';
import { runMarketTick } from './systems/market';
import { FREIGHT, acceptFreight, runFreightTick } from './systems/freight';
import { energyPrice, lockFuel } from './systems/energy';
import { runRealEstateTick, setRent } from './systems/realestate';
import { DISTRIBUTION_RELIEF } from './systems/buildingIndex';
import { FREIGHT_SHARE, resetDailyLedgers } from './systems/supply';
import { contributeToProject, projectAttraction, projectDistrictDemand, projectSite, projectUpkeep, runProjectTick } from './systems/projects';
import { createNewGame } from './worldgen';
import type { GameCommand, GameState, LoggedCommand, ProjectState } from './types';

/**
 * Lig koşu kodu ve tekrar doğrulaması (kural ve takvim: systems/league).
 *
 * GÜVEN MODELİ (Tur 31). Sunucu yok: tablo claude.ai'nin paylaşılan
 * deposunda, her kişi yalnızca kendi satırına yazabiliyor ama satırın
 * içeriği tamamen onun tarayıcısından geliyor. Bu yüzden satıra değil
 * KANITA güveniliyor: her tarayıcı her koşuyu kendisi yeniden oynatıyor ve
 * sıralama yalnızca kendi tekrarının bulduğu skorla yapılıyor. Satırın
 * beyan ettiği skor, ad, CEO ve eğri sıralamaya hiç girmiyor; gösterilen
 * her şey doğrulanmış koşunun kendisinden.
 *
 * Bu modelin yapamadığı tek şey kopyayı önlemek: koşu kodu tabloda açık,
 * biri başkasının koşusunu kendi satırına yazabilir (şirket adı simülasyonu
 * değiştirmediği için adı da değiştirebilir). Aynı eğri ve skor "aynı koşu"
 * diye işaretleniyor ve tabloda bir kez sayılıyor; hangisinin önce
 * gönderildiğini ise yalnızca satırın kendi beyan ettiği zaman söylüyor.
 */

// ---------------------------------------------------------------- koşu kodu

export interface LeagueRun {
  /** 1: Tur 17 · 2: simülasyon parmak izi (Tur 31). */
  version: 1 | 2;
  /** Tablonun kimliği: hafta ("2026-W43") ya da Tur 53'ten beri gün ("2026-10-22", günün koşusu). */
  weekId: string;
  ceoId: string | null;
  companyName: string;
  score: number;
  /** Net değer eğrisi — hayalet karşılaştırması için; tekrarla birebir tutmalı. */
  curve: number[];
  log: LoggedCommand[];
  /** Koşunun oynandığı simülasyonun parmak izi (`simFingerprint`); v1'de yok. */
  sim?: string;
}

/** Kod ve günlük sınırları: bozuk ya da kötü niyetli bir satır kimsenin tarayıcısını kilitlemesin. */
export const RUN_LIMITS = {
  /** Kodun karakter sınırı (base64). Gerçek bir koşu ~10–300 bin karakter. */
  codeLength: 1_200_000,
  /** Günlükteki komut sınırı. Vekil 360 günde ~200, yoğun bir oyuncu birkaç bin. */
  logEntries: 12_000,
  nameLength: 40,
} as const;

/**
 * Günlüğe girebilecek komutlar. Tanımadığı türü taşıyan kod reddediliyor:
 * motor da reddederdi, ama sınırın kod çözülürken çizilmesi tekrarın hiç
 * başlamaması demek.
 */
const LOGGABLE: ReadonlySet<string> = new Set<GameCommand['type']>([
  'ACCEPT_CONTRACT',
  'ACCEPT_FREIGHT',
  'BUILD',
  'BUYOUT_TILE',
  'BUY_SHARES',
  'BUY_TILE',
  'CANCEL_FREIGHT',
  'CANCEL_TAKEOVER_ORDER',
  'CHOOSE_CARD',
  'CLAIM_BUBBLE',
  'CLAIM_QUEST',
  'CONTRIBUTE_PROJECT',
  'DECLINE_CONTRACT',
  'DECLINE_FREIGHT',
  'DEMOLISH',
  'HOLDING_TRANSFER',
  'ISSUE_SHARES',
  'LOBBY',
  'LOCK_FUEL',
  'OPEN_CITY',
  'PLACE_BID',
  'PLACE_TAKEOVER_ORDER',
  'RENAME_COMPANY',
  'REPAY_LOAN',
  'REQUEST_RENEWAL',
  'RESPOND_UNION',
  'SELL_SHARES',
  'SELL_TILE',
  'SET_AUTO_PRICE',
  'SET_FLAG',
  'SET_FOCUS',
  'SET_PRICE_MULTIPLIER',
  'SET_RENT',
  'SET_STOCK',
  'SET_WAGE_POLICY',
  'SWITCH_CITY',
  'TAKE_LOAN',
]);

/** Eğrinin en çok örneği: koşunun uzunluğundan (gün 90, hafta 360). */
const curveMax = (id: string): number => Math.floor(leagueLength(id) / LEAGUE_SAMPLE_DAYS) + 1;

export function runFromState(state: GameState): LeagueRun | null {
  const league = state.league;
  if (!league || league.score === undefined) return null;
  const player = state.companies[state.playerCompanyId]!;
  return {
    version: 2,
    weekId: league.weekId,
    ceoId: player.ceoId,
    companyName: player.name,
    score: league.score,
    curve: league.curve,
    log: state.commandLog ?? [],
    sim: simFingerprint(),
  };
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(code: string): string {
  const binary = atob(code);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeRun(run: LeagueRun): string {
  return `CF1.${toBase64(JSON.stringify(run))}`;
}

export type DecodeError = 'unreadable' | 'tooLarge' | 'malformed';

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Yapı denetimi: her alan beklenen türde ve sınırda mı? */
function wellFormed(raw: unknown): raw is LeagueRun {
  if (!raw || typeof raw !== 'object') return false;
  const run = raw as Record<string, unknown>;
  if (run['version'] !== 1 && run['version'] !== 2) return false;
  const id = run['weekId'];
  if (typeof id !== 'string' || leagueBoardKind(id) === null) return false;
  const length = leagueLength(id);
  const ceoId = run['ceoId'];
  if (ceoId !== null && (typeof ceoId !== 'string' || !CEO_BY_ID[ceoId])) return false;
  const name = run['companyName'];
  if (typeof name !== 'string' || name.length === 0 || name.length > RUN_LIMITS.nameLength) return false;
  if (!finite(run['score']) || (run['score'] as number) < 0) return false;
  const curve = run['curve'];
  if (!Array.isArray(curve) || curve.length > curveMax(id) || !curve.every(finite)) return false;
  if (run['sim'] !== undefined && (typeof run['sim'] !== 'string' || run['sim'].length > 32)) return false;
  const log = run['log'];
  if (!Array.isArray(log) || log.length > RUN_LIMITS.logEntries) return false;
  for (const entry of log) {
    if (!Array.isArray(entry) || entry.length !== 2) return false;
    const [day, command] = entry as [unknown, unknown];
    if (!Number.isInteger(day) || (day as number) < 0 || (day as number) > length) return false;
    if (!command || typeof command !== 'object' || Array.isArray(command)) return false;
    const type = (command as { type?: unknown }).type;
    if (typeof type !== 'string' || !LOGGABLE.has(type)) return false;
  }
  return true;
}

/** Kodu çözer; reddederse nedeniyle. */
export function decodeRunChecked(code: string): { run: LeagueRun } | { error: DecodeError } {
  const trimmed = code.trim();
  if (trimmed.length > RUN_LIMITS.codeLength) return { error: 'tooLarge' };
  if (!trimmed.startsWith('CF1.')) return { error: 'unreadable' };
  let raw: unknown;
  try {
    raw = JSON.parse(fromBase64(trimmed.slice(4)));
  } catch {
    return { error: 'unreadable' };
  }
  return wellFormed(raw) ? { run: raw } : { error: 'malformed' };
}

export function decodeRun(code: string): LeagueRun | null {
  const decoded = decodeRunChecked(code);
  return 'run' in decoded ? decoded.run : null;
}

// ---------------------------------------------------------------- parmak izi

let fingerprint: string | null = null;

/**
 * Simülasyonun parmak izi (Tur 31).
 *
 * Oyun güncellenince simülasyon değişebiliyor (Tur 29'un deri zinciri,
 * Tur 30'un yaşayan şehirleri) ve haftanın ortasında oynanmış dürüst bir
 * koşu yeni sürümde tutmayabiliyor. O koşu sahte değil, eski. Ayırt etmek
 * için her koşu oynandığı simülasyonun izini taşıyor: sabit bir dünyada
 * 60 gün, durumun sayısal izdüşümünün özeti. Metinler (haber, ad) izin
 * dışında — dil değişince iz değişmesin. Sürüm sayacı elle artırılsaydı
 * unutulurdu; iz kendiliğinden değişiyor.
 */
export function simFingerprint(): string {
  fingerprint ??= computeSimFingerprint();
  return fingerprint;
}

const FINGERPRINT_DAYS = 60;

function fingerprintWorld(): GameEngine {
  return new GameEngine(createNewGame({ seed: 20_261_013, companyName: 'Parmak İzi', league: { weekId: '2000-W01' } }));
}

/**
 * Kural yoklaması (Tur 53): haftanın kuralı lig koşusunu değiştiriyor, ama
 * izin dünyası kuralsız bir hafta. Kuralların hepsiyle küçük bir dünya ilk
 * günlerinde izin yanında koşuyor (arsa fiyatı ve imar takvimi, kuruluş
 * kredisi ve faizi, rakiplerin yatırımı); kuralların değerleri, sırası ve
 * günün koşusunun uzunluğu da izde. Fırtınaların ilk krizi bu günlere
 * düşmüyor: onun takvimi değerlerinden.
 */
const RULE_PROBE_DAYS = 15;

function ruleProbeWorld(): GameEngine {
  return new GameEngine(createNewGame({ seed: 20_261_013, companyName: 'Parmak İzi', modifiers: LEAGUE_RULE_ROTATION }));
}

/** İzin ve kural yoklamasının bir günü. */
function fingerprintDay(engine: GameEngine, probe: GameEngine, day: number): void {
  fingerprintStep(engine, day);
  if (day <= RULE_PROBE_DAYS) fingerprintStep(probe, day);
}

function ruleProbeParts(probe: GameState): string[] {
  const parts = [`rules:${JSON.stringify({ MODIFIER_RULES, LEAGUE_RULE_ROTATION, LEAGUE_RULES_FROM, LEAGUE_DAILY_DAYS })}`];
  parts.push(`rule-world:${probe.time.day}:${probe.rng.s}:${probe.districts.map((district) => district.opensOnDay ?? '-').join(',')}`);
  for (const id of Object.keys(probe.companies).sort()) {
    const c = probe.companies[id]!;
    parts.push(`rule-${id}:${Math.round(c.cash)}:${Math.round(c.netWorth)}`);
  }
  for (const id of Object.keys(probe.buildings).sort()) {
    const b = probe.buildings[id]!;
    parts.push(`rule-${b.defId}@${b.tileId}:${b.companyId}`);
  }
  return parts;
}

/**
 * İz senaryosu: boşta bir dünya değil, fırsatları da işleten küçük bir oyun.
 * Balon ve görev ödülleri lig skorunu değiştirebiliyor; boşta dünyada mağaza
 * olmadığı için balon çıkmıyor, ödül de alınmıyordu. Takvimleri ya da
 * ödülleri değişince iz değişmezse dürüst bir koşu tekrarda sahte sayılırdı
 * (sürüm farkı yerine). İlk gün tek bir bakkal, sonra her balon ve her
 * tamamlanan görev alınıyor (Codex #63).
 */
function fingerprintStep(engine: GameEngine, day: number): void {
  const state = engine.getState();
  if (day === 1) {
    for (const tile of state.map.tiles) {
      if (!isPurchasable(tile) || tile.structureId || tile.buildingId) continue;
      if (!engine.dispatch({ type: 'BUY_TILE', tileId: tile.id }).ok) continue;
      if (engine.dispatch({ type: 'BUILD', tileId: tile.id, defId: 'corner_shop' }).ok) break;
    }
  }
  if (state.bubble) engine.dispatch({ type: 'CLAIM_BUBBLE' });
  state.quests?.items.forEach((quest, index) => {
    if (quest.doneDay !== undefined && !quest.claimed) engine.dispatch({ type: 'CLAIM_QUEST', index });
  });
  engine.runDay();
}

/**
 * Geç oyun sondası (Tur 37d): 60 günlük iz şehir projesine (210. günden)
 * ve konsorsiyuma (300. günden) ulaşmıyor; takvimleri izde ama işleyişleri
 * değil. İzin son durumunun kopyasında saat ileri alınıp ikisi doğrudan
 * işletiliyor (proje: aç, oyuncu katkısı, kapanış, bitiş; konsorsiyum:
 * kuruluş, ortak alım) ve sonuçları ize giriyor. Canlı pazarın uzak günleri
 * ve üç sistemin ayarları da örnekleniyor (Codex #64). Kopyada çalışıyor,
 * izin durumuna dokunmuyor; metin değil sayı (dilden bağımsız).
 */
function lateGameProbe(state: GameState): string[] {
  const parts: string[] = [];
  const clone = (): GameState => JSON.parse(JSON.stringify(state)) as GameState;

  // Saha kuralı her proje için: yoklama tek projeyi açıyor, takvim ise
  // herhangi birini açabilir (Codex #64). Bugün ve bir proje bittikten sonra.
  const sites = (world: GameState): string =>
    PROJECTS.map((def) => `${def.id}@${projectSite(world, def.id)?.tileId ?? '-'}`).join(',');
  const fresh = clone();
  delete fresh.project;
  parts.push(`sites:${sites(fresh)}`);

  const p = clone();
  delete p.project;
  p.nextProjectDay = p.time.day;
  runProjectTick(p);
  // `delete` daraltmasını aş: proje adımı alanı yeniden dolduruyor.
  const project = p.project as ProjectState | undefined;
  if (project) {
    p.companies[p.playerCompanyId]!.cash += 1_000_000;
    contributeToProject(p, 400_000);
    for (const day of [project.openedDay + 3, project.openedDay + 10, project.closesDay, project.doneDay]) {
      p.time.day = day;
      runProjectTick(p);
    }
  }
  const done = p.cityProjects?.[0];
  parts.push(`probe-project:${project?.defId ?? '-'}:${project?.tileId ?? '-'}:${done?.sponsorId ?? '-'}`);
  for (const entry of projectDistrictDemand(p)) parts.push(`${entry.districtId}:${JSON.stringify(entry.multipliers)}`);
  if (done) {
    parts.push(`privilege:${projectUpkeep(p, p.playerCompanyId, done.districtId)}:${projectAttraction(p, p.playerCompanyId, done.districtId)}`);
  }
  parts.push(`brand:${JSON.stringify(p.companies[p.playerCompanyId]!.brand)}`);
  parts.push(`land:${Math.round(p.map.tiles.reduce((sum, tile) => sum + tile.landValue, 0))}`);
  parts.push(`sites-after:${sites(p)}`);

  const c = clone();
  c.time.day = Math.max(c.time.day, CONSORTIUM.earliestDay) + CONSORTIUM.idleDays + 1;
  const me = c.companies[c.playerCompanyId]!;
  const top = Math.max(0, ...Object.values(c.companies).filter((company) => !company.isPlayer).map((company) => company.netWorth));
  const lift = Math.max(0, top * (CONSORTIUM.leadRatio + 0.2) - me.netWorth);
  me.cash += lift;
  me.netWorth += lift;
  // 60. günde rakiplerin kasası üye tabanının altında: alımın bedeli ödenebilsin.
  for (const company of Object.values(c.companies)) if (!company.isPlayer) company.cash += 2_000_000;
  runConsortiumTick(c);
  const formed = c.consortium;
  if (formed) {
    for (const day of [formed.startsDay, formed.startsDay + 1]) {
      c.time.day = day;
      runConsortiumTick(c);
    }
  }
  const stakes = Object.keys(c.companies).sort().map((id) => c.companies[id]!.shares[c.playerCompanyId] ?? 0);
  parts.push(`probe-consortium:${formed?.leaderId ?? '-'}:${formed?.memberIds.join(',') ?? '-'}:${stakes.join(',')}`);

  // Moda etkisi: ilk moda izin 60 gününden sonra başlıyor. Kopyada moda
  // gününe geçip kategori talebi ve moda kategorisinin ürün payları — ayar
  // değil uygulanan etki (Codex #64).
  const f = clone();
  const firstFad = fadSchedule(f.meta.seed, f.time.day).next;
  f.time.day = firstFad.startDay;
  const fadCategory = GOOD_BY_ID[firstFad.goodId]?.category;
  parts.push(`fad-demand:${CONSUMER_CATEGORIES.map((category) => livingDemand(f, category).toFixed(6)).join(',')}`);
  if (fadCategory) {
    const shares = goodShares('downtown', fadCategory as CategoryId, firstFad.goodId);
    parts.push(`fad-shares:${shares.map(({ good, share }) => `${good.id}=${share.toFixed(6)}`).join(',')}`);
    // Yardımcıların çıktısı yetmiyor: modanın satışa giden yolu da izde.
    // Moda gününde bir pazar günü, iki yoklama mağazasıyla (Codex #64):
    // en kalabalık bölgede rafında yalnız moda ürünü olan tek yuvalı mağaza
    // (kapasitesi dolu: bölgelere bölünüşü karşılanmayan talepte görünüyor)
    // ve en tenha bölgede bütün ürünleri taşıyan büyük mağaza (kapasitesi
    // boş: ürün başına satışı satıştaki payı gösteriyor).
    const outlets = BUILDINGS.filter((def) => def.role === 'outlet' && def.category === fadCategory);
    const small = outlets.find((def) => (def.slots ?? 1) === 1);
    const large = [...outlets].sort((a, b) => (b.slots ?? 1) - (a.slots ?? 1))[0];
    const me = f.companies[f.playerCompanyId]!;
    me.cash += 10_000_000;
    const byPopulation = f.districts.filter((district) => isDistrictOpen(f, district.id)).sort((a, b) => b.population - a.population || a.id - b.id);
    const place = (defId: string | undefined, districts: typeof byPopulation): string | null => {
      for (const district of defId ? districts : []) {
        const tile = f.map.tiles.find((candidate) => candidate.districtId === district.id && isPurchasable(candidate) && !candidate.structureId && !candidate.buildingId);
        if (!tile || !buyTile(f, me.id, tile.id).ok || !build(f, me.id, tile.id, defId!).ok) continue;
        return f.map.tiles[tile.id]!.buildingId;
      }
      return null;
    };
    const shop = place(small?.id, byPopulation);
    if (shop) f.buildings[shop]!.stocked = [firstFad.goodId];
    const store = large && large !== small ? place(large.id, [...byPopulation].reverse()) : null;
    if (store) f.buildings[store]!.stocked = (GOODS_BY_CATEGORY[fadCategory as CategoryId] ?? []).map((good) => good.id).slice(0, large!.slots ?? 1);
    runMarketTick(f);
    const sold = Object.keys(f.buildings)
      .sort()
      .filter((id) => {
        const def = BUILDING_BY_ID[f.buildings[id]!.defId];
        return def?.role === 'outlet' && def.category === fadCategory;
      })
      .map((id) => `${id}=${JSON.stringify(f.buildings[id]!.soldByGood ?? {})}`);
    const unmet = f.districts.map((district) => (district.unmet[fadCategory as CategoryId] ?? 0).toFixed(6));
    parts.push(`fad-market:${shop ?? '-'}:${store ?? '-'}:${sold.join(',')}:${unmet.join(',')}`);
  }

  parts.push(...freightProbe(clone()));
  parts.push(...energyProbe(clone()));
  parts.push(...realEstateProbe(clone()));

  const seed = state.meta.seed;
  for (const day of [120, 240, 360]) {
    parts.push(`living:${day}:${CONSUMER_CATEGORIES.map((category) => trendAt(seed, category, day).value.toFixed(6) + '/' + seasonMultiplier(day, category).toFixed(4)).join(',')}`);
    const fad = fadSchedule(seed, day);
    parts.push(`fad:${day}:${fad.next.goodId}:${fad.next.startDay}:${fad.next.endDay}`);
  }
  parts.push(
    `settings:${JSON.stringify({
      PROJECT_TIMING,
      CONSORTIUM,
      TREND,
      FAD,
      seasons: SEASONS.map(({ id, months, demand }) => ({ id, months, demand })),
      projects: PROJECTS.map(({ id, structureId, archetypes, demand, neighborShare, landValue, infrastructure, leadCategory }) => ({ id, structureId, archetypes, demand, neighborShare, landValue, infrastructure, leadCategory })),
    })}`,
  );
  return parts;
}

/**
 * Taşıma yoklaması (Tur 56): izin dünyasında terminal yok, ücret de akmıyor.
 * Kopyada oyuncu rakip mağazalarının en yoğun olduğu parsele bir terminal
 * kuruyor, ilk teklif gelene kadar taşıma adımı koşuyor, teklif kabul
 * ediliyor ve bir pazar günüyle bir taşıma adımı daha. Teklifin seçimi,
 * ücret, terminalin indirimi ve sözleşmenin defteri izde; ayarlar da.
 */
function freightProbe(world: GameState): string[] {
  const parts = [
    `freight-settings:${JSON.stringify({ FREIGHT, FREIGHT_SHARE, DISTRIBUTION_RELIEF, depots: BUILDINGS.filter((def) => def.role === 'logistics').map(({ id, cost, upkeepPerDay, jobs, radius, relief, fleet, unlockNetWorth }) => ({ id, cost, upkeepPerDay, jobs, radius, relief, fleet, unlockNetWorth })) })}`,
  ];
  const me = world.companies[world.playerCompanyId]!;
  me.cash += 10_000_000;
  me.netWorth += 10_000_000;
  const terminal = BUILDINGS.find((def) => (def.fleet ?? 0) > 0);
  if (!terminal) return parts;
  const rivals = Object.values(world.buildings).filter((b) => b.companyId !== me.id && BUILDING_BY_ID[b.defId]?.role === 'outlet');
  let site: { id: number; count: number } | null = null;
  for (const tile of world.map.tiles) {
    if (!isPurchasable(tile) || tile.structureId || tile.buildingId || tile.ownerId) continue;
    let count = 0;
    for (const outlet of rivals) {
      const at = world.map.tiles[outlet.tileId]!;
      if (Math.abs(at.x - tile.x) + Math.abs(at.y - tile.y) <= terminal.radius) count++;
    }
    if (!site || count > site.count) site = { id: tile.id, count };
  }
  if (!site || !buyTile(world, me.id, site.id).ok || !build(world, me.id, site.id, terminal.id).ok) return [...parts, 'probe-freight:-'];
  for (let i = 0; i < 60 && !world.freight?.offers.length; i++) {
    world.time.day += 1;
    runFreightTick(world);
  }
  const offer = world.freight?.offers[0];
  if (!offer) return [...parts, `probe-freight:${site.id}:-`];
  const accepted = acceptFreight(world, offer.id).ok;
  world.time.day += 1;
  resetDailyLedgers(world);
  runMarketTick(world);
  runFreightTick(world);
  const deal = world.freight?.contracts[0];
  const client = world.companies[offer.companyId];
  parts.push(
    `probe-freight:${site.id}:${world.time.day}:${offer.companyId}:${offer.outletIds.join(',')}:${offer.estimate}:${accepted}:${(deal?.earned ?? 0).toFixed(4)}:${Math.round(me.cash)}:${Math.round(client?.cash ?? 0)}`,
  );
  return parts;
}

/**
 * Enerji yoklaması (Tur 57): izin dünyasında santral yok ve 60 günde kriz
 * gelmiyor. Kopyada oyuncu menziline en çok binayı alan izinli parsele bir
 * doğalgaz santrali kuruyor ve bir gün defter yazılıyor; sonra yakıtı
 * sabitleyip enerji krizini başlatıyor ve bir gün daha. Dağıtım, faturalar,
 * yakıt, şebeke fiyatıyla bütün binaların bakımı izde. Ayarlarda kriz
 * tablosu da var: krizlerin seçimi şimdiye kadar izde değildi, yeni kriz
 * eski sunucuda "aynı sürüm" geçerdi.
 */
function energyProbe(world: GameState): string[] {
  const parts = [
    `energy-settings:${JSON.stringify({
      ENERGY,
      CRISIS_TIMING,
      crises: CRISES.map(({ id, weight, durationDays, effects }) => ({ id, weight, durationDays, effects })),
      events: [...EVENTS, ...SECTOR_EVENTS, ...ERAS].filter((def) => def.effects.energyPrice).map((def) => [def.id, def.effects.energyPrice]),
      plants: BUILDINGS.filter((def) => def.role === 'energy').map(({ id, cost, upkeepPerDay, jobs, radius, power, fuel, solar, unlockNetWorth, zones }) => ({ id, cost, upkeepPerDay, jobs, radius, power, fuel, solar, unlockNetWorth, zones })),
    })}`,
  ];
  const me = world.companies[world.playerCompanyId]!;
  me.cash += 10_000_000;
  me.netWorth += 10_000_000;
  const gas = BUILDINGS.find((def) => def.role === 'energy' && (def.fuel ?? 0) > 0);
  const shock = CRISES.find((def) => (def.effects.energyPrice ?? 1) > 1);
  if (!gas || !shock) return parts;
  let site: { id: number; count: number } | null = null;
  for (const tile of world.map.tiles) {
    if (!isPurchasable(tile) || tile.structureId || tile.buildingId || tile.ownerId) continue;
    const archetype = world.districts[tile.districtId]?.archetype;
    if (gas.zones && (!archetype || !gas.zones.includes(archetype))) continue;
    let count = 0;
    for (const other of Object.values(world.buildings)) {
      const at = world.map.tiles[other.tileId]!;
      if (Math.abs(at.x - tile.x) + Math.abs(at.y - tile.y) <= gas.radius) count++;
    }
    if (!site || count > site.count) site = { id: tile.id, count };
  }
  if (!site || !buyTile(world, me.id, site.id).ok || !build(world, me.id, site.id, gas.id).ok) return [...parts, 'probe-energy:-'];
  const plant = world.buildings[world.map.tiles[site.id]!.buildingId!]!;
  const ledger = (): string => {
    const served = Object.keys(world.buildings)
      .sort()
      .filter((id) => world.buildings[id]!.last.power)
      .map((id) => {
        const power = world.buildings[id]!.last.power!;
        return `${id}=${power.plantId}/${power.bill.toFixed(4)}/${power.saved.toFixed(4)}`;
      });
    const upkeep = Object.values(world.buildings).reduce((sum, b) => sum + b.last.upkeep, 0);
    return `${plant.last.revenue.toFixed(4)}:${plant.last.cogs.toFixed(4)}:${JSON.stringify(plant.last.plant)}:${upkeep.toFixed(4)}:${served.join(',')}`;
  };
  world.time.day += 1;
  resetDailyLedgers(world);
  parts.push(`probe-energy:${site.id}:${world.time.day}:${ledger()}`);
  const locked = lockFuel(world).ok;
  world.time.day += 1;
  world.crisis = { defId: shock.id, phase: 'active', activeDay: world.time.day, endDay: world.time.day + shock.durationDays[0] };
  resetDailyLedgers(world);
  parts.push(`probe-energy-shock:${locked}:${energyPrice(world).toFixed(6)}:${ledger()}:${Math.round(me.today.revenue)}:${Math.round(me.today.cogs)}`);
  return parts;
}

/**
 * Gayrimenkul (Tur 58) yoklaması. Kopyada en kalabalık izinli parsele Konut
 * Sitesi, dönüşüm hakkı verilmiş bir parsele Ofis Kampüsü. Bir gün şantiye,
 * sonra ikisinin açılış günü ve bir gün defter (doluluk, kira, hak
 * sahipleri); sonra sitenin kirası artıyor, bir gün daha. Bütün kiralıkların
 * cirosu izde: projenin baskısı rakiplerin doluluğunu da değiştiriyor.
 */
function realEstateProbe(world: GameState): string[] {
  const projects = BUILDINGS.filter((def) => (def.buildDays ?? 0) > 0);
  const parts = [
    `realestate-settings:${JSON.stringify({
      REAL_ESTATE,
      projects: projects.map(({ id, category, cost, upkeepPerDay, capacity, jobs, buildDays, unlockNetWorth, zones }) => ({ id, category, cost, upkeepPerDay, capacity, jobs, buildDays, unlockNetWorth, zones })),
    })}`,
  ];
  const me = world.companies[world.playerCompanyId]!;
  me.cash += 10_000_000;
  me.netWorth += 10_000_000;
  const estate = projects.find((def) => def.category === 'housing');
  const campus = projects.find((def) => def.category === 'office');
  if (!estate || !campus) return parts;
  const site = (defZones: readonly string[] | undefined, avoid: number): number | null => {
    let best: { id: number; population: number } | null = null;
    for (const tile of world.map.tiles) {
      if (!isPurchasable(tile) || tile.structureId || tile.buildingId || tile.id === avoid) continue;
      if (!isDistrictOpen(world, tile.districtId)) continue;
      const district = world.districts[tile.districtId]!;
      if (defZones && !defZones.includes(district.archetype)) continue;
      if (!best || district.population > best.population) best = { id: tile.id, population: district.population };
    }
    return best?.id ?? null;
  };
  const a = site(estate.zones, -1);
  if (a === null || !buyTile(world, me.id, a).ok || !build(world, me.id, a, estate.id).ok) return [...parts, 'probe-realestate:-'];
  const b = site(campus.zones, a);
  if (b !== null) {
    const tile = world.map.tiles[b]!;
    tile.ownerId = me.id;
    tile.renewal = { day: world.time.day, structureId: 'row_houses' };
    build(world, me.id, b, campus.id);
  }
  const ids = [a, b].map((id) => (id === null ? null : world.map.tiles[id]?.buildingId ?? null)).filter((id): id is string => id !== null);
  const day = (): void => {
    runRealEstateTick(world);
    resetDailyLedgers(world);
    runMarketTick(world);
  };
  const ledger = (): string => {
    const own = ids.map((id) => {
      const x = world.buildings[id]!;
      return `${x.defId}:${JSON.stringify(x.development)}:${x.rent ?? 1}:${x.last.revenue.toFixed(4)}:${x.last.upkeep.toFixed(4)}:${x.last.wages.toFixed(4)}`;
    });
    const rentals = Object.values(world.buildings).reduce((sum, x) => sum + (BUILDING_BY_ID[x.defId]?.role === 'rental' ? x.last.revenue : 0), 0);
    return `${own.join(',')}:${rentals.toFixed(4)}`;
  };
  world.time.day += 1;
  day();
  parts.push(`probe-realestate-site:${a}:${b ?? '-'}:${ledger()}`);
  world.time.day = Math.max(...ids.map((id) => world.buildings[id]!.development?.opensOnDay ?? world.time.day));
  day();
  parts.push(`probe-realestate-open:${world.time.day}:${ledger()}`);
  const rented = setRent(world, me.id, ids[0]!, 1.15).ok;
  world.time.day += 1;
  day();
  parts.push(`probe-realestate-rent:${rented}:${ledger()}`);
  return parts;
}

function fingerprintOf(state: GameState, probe: GameState): string {
  return fnv([...fingerprintParts(state), ...ruleProbeParts(probe)].join('|'));
}

function fingerprintParts(state: GameState): string[] {
  const parts: string[] = [String(state.time.day), String(state.rng.s)];
  // Fırsatların takvimi ve ödülleri de izde (ödül alınmasa da).
  parts.push(`bubbles:${state.bubblesShown ?? 0}/${state.bubblesCaught ?? 0}/${state.nextBubbleDay ?? '-'}`);
  parts.push(`quests:${state.questsDone ?? 0}`);
  // Şehir projesi takvimi (Tur 37d): ilk proje izin 60 gününden sonra açılıyor, takvimi önceden belli.
  parts.push(`project:${state.nextProjectDay ?? '-'}:${state.project?.defId ?? '-'}:${state.cityProjects?.length ?? 0}`);
  parts.push(...lateGameProbe(state));
  for (const quest of state.quests?.items ?? []) parts.push(`${quest.defId}:${quest.target}:${quest.reward}:${quest.doneDay ?? '-'}`);
  for (const id of Object.keys(state.companies).sort()) {
    const c = state.companies[id]!;
    parts.push(`${id}:${Math.round(c.cash)}:${Math.round(c.netWorth)}`);
  }
  for (const id of Object.keys(state.buildings).sort()) {
    const b = state.buildings[id]!;
    parts.push(`${b.defId}@${b.tileId}:${b.companyId}`);
  }
  for (const id of Object.keys(state.market.spot).sort()) parts.push(`${id}=${state.market.spot[id]!.toFixed(6)}`);
  return parts;
}

/** Önbelleksiz hesap (test: dil değişince iz aynı kalmalı). */
export function computeSimFingerprint(): string {
  const engine = fingerprintWorld();
  const probe = ruleProbeWorld();
  for (let day = 1; day <= FINGERPRINT_DAYS; day++) fingerprintDay(engine, probe, day);
  return fingerprintOf(engine.getState(), probe.getState());
}

/** İzin özetlenmemiş parçaları: testler bir yoklamanın gerçekten bir şey ölçtüğünü görsün. */
export function simFingerprintParts(): string[] {
  const engine = fingerprintWorld();
  const probe = ruleProbeWorld();
  for (let day = 1; day <= FINGERPRINT_DAYS; day++) fingerprintDay(engine, probe, day);
  return [...fingerprintParts(engine.getState()), ...ruleProbeParts(probe.getState())];
}

/**
 * Aynı iz, tarayıcıda parça parça: 10 günde bir kontrolü bırakıyor, tablo
 * açılırken arayüz donmuyor. Sonuç `simFingerprint` ile paylaşılıyor.
 */
export async function simFingerprintAsync(yieldEvery = 10): Promise<string> {
  if (fingerprint) return fingerprint;
  const engine = fingerprintWorld();
  const probe = ruleProbeWorld();
  for (let day = 1; day <= FINGERPRINT_DAYS; day++) {
    fingerprintDay(engine, probe, day);
    if (day % yieldEvery === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  fingerprint ??= fingerprintOf(engine.getState(), probe.getState());
  return fingerprint;
}

/** 64 bitlik FNV-1a benzeri özet (iki 32 bitlik koldan), onaltılık. */
export function fnv(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619) >>> 0;
    b = Math.imul(b ^ c, 2246822519) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

// ---------------------------------------------------------------- tekrar

export interface ReplayResult {
  ok: boolean;
  /** Tekrarda bulunan skor ve eğri. */
  score: number;
  curve: number[];
  reason?: string;
}

/** Bir lig koşusunun başlangıç dünyası. */
export function createLeagueGame(weekId: string, companyName: string, ceoId: string | null): GameState {
  return createNewGame({ companyName, ceoId, league: { weekId } });
}

function sameCurve(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

/**
 * Koşuyu baştan oynatır. `yieldEvery` verilirse her N günde bir kontrolü
 * bırakır (tarayıcıda arayüz donmasın diye) — sonucu değiştirmez. Skor da
 * eğri de tutmalı: eğri hayalet karşılaştırmasında gösteriliyor.
 */
export async function replayRun(
  run: LeagueRun,
  options: { yieldEvery?: number; onProgress?: (day: number) => void } = {},
): Promise<ReplayResult> {
  const engine = new GameEngine(createLeagueGame(run.weekId, run.companyName, run.ceoId));
  const state = () => engine.getState();
  const byDay = new Map<number, GameCommand[]>();
  for (const [day, command] of run.log) {
    const list = byDay.get(day) ?? [];
    list.push(command);
    byDay.set(day, list);
  }

  while (state().league && state().league!.finishedDay === undefined) {
    const day = state().time.day;
    for (const command of byDay.get(day) ?? []) engine.dispatch(command);
    engine.runDay();
    if (options.yieldEvery && state().time.day % options.yieldEvery === 0) {
      options.onProgress?.(state().time.day);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (state().time.day > leagueLength(run.weekId) + 5) break; // emniyet
  }

  const score = state().league?.score ?? 0;
  const curve = state().league?.curve ?? [];
  if (score !== run.score) {
    return { ok: false, score, curve, reason: `Tekrarda skor ${formatMoney(score)}, iddia ${formatMoney(run.score)}.` };
  }
  if (!sameCurve(curve, run.curve)) return { ok: false, score, curve, reason: 'Tekrarda eğri tutmadı.' };
  return { ok: true, score, curve };
}

// ---------------------------------------------------------------- doğrulama

export type RunRejection =
  /** Kod okunamıyor. */
  | 'unreadable'
  /** Kod sınırı aşıyor. */
  | 'tooLarge'
  /** Kodun yapısı bozuk (alan türü, tanınmayan komut, sınır dışı gün). */
  | 'malformed'
  /** Satırın beyan ettiği skor, hafta, ad ya da CEO koddakiyle aynı değil. */
  | 'mismatch'
  /** Bu sürümde tekrar skoru tutmadı: sahte ya da bozuk. */
  | 'replay'
  /** Skor tuttu, eğri tutmadı. */
  | 'curve'
  /** Başka bir simülasyon sürümünde oynanmış; bu sürümle tutmuyor (sahte değil). */
  | 'version'
  /** Parmak izsiz eski kod; bu sürümle tutmuyor, hangi sürümde oynandığı bilinmiyor. */
  | 'unknownVersion'
  /** Tekrar sırasında hata. */
  | 'error';

export interface VerifiedRun {
  status: 'ok';
  score: number;
  curve: number[];
  companyName: string;
  ceoId: string | null;
  /** Günlük boş mu (kopya tespiti hiç oynanmamış koşuları ayırmasın). */
  idle: boolean;
}

export interface RejectedRun {
  status: 'bad';
  kind: RunRejection;
  /** Tekrarın bulduğu skor (tekrar koştuysa). */
  score?: number;
}

export type RunVerdict = VerifiedRun | RejectedRun;

/** Satırın beyanı: tabloya yazılan alanlar. */
export interface RunClaim {
  weekId: string;
  score: number;
  companyName?: string;
  ceoId?: string | null;
}

/**
 * Bir koşuyu doğrular. Satırın beyanı verilirse beyan koda birebir uymalı;
 * sonra koşu bu tarayıcıda yeniden oynanıyor. Doğrulanan koşunun skoru,
 * eğrisi, adı ve CEO'su tekrarın kendisinden — satırdan değil.
 */
export async function verifyRun(
  code: string,
  claim?: RunClaim,
  options: { yieldEvery?: number; onProgress?: (day: number) => void } = {},
): Promise<RunVerdict> {
  const decoded = decodeRunChecked(code);
  if ('error' in decoded) return { status: 'bad', kind: decoded.error };
  const run = decoded.run;
  if (
    claim &&
    (claim.weekId !== run.weekId ||
      claim.score !== run.score ||
      (claim.companyName !== undefined && claim.companyName !== run.companyName) ||
      (claim.ceoId !== undefined && claim.ceoId !== run.ceoId))
  ) {
    return { status: 'bad', kind: 'mismatch' };
  }
  let result: ReplayResult;
  try {
    result = await replayRun(run, options);
  } catch {
    return { status: 'bad', kind: 'error' };
  }
  if (result.ok) {
    return { status: 'ok', score: result.score, curve: result.curve, companyName: run.companyName, ceoId: run.ceoId, idle: run.log.length === 0 };
  }
  // Tutmayan koşu: sürüm farkı mı, sahte mi?
  const kind: RunRejection =
    run.sim === undefined ? 'unknownVersion' : run.sim !== simFingerprint() ? 'version' : result.score === run.score ? 'curve' : 'replay';
  return { status: 'bad', kind, score: result.score };
}

// ---------------------------------------------------------------- sıralama

export interface LeagueRow {
  id: string;
  submittedAt: string;
}

export interface LeagueStanding<T extends LeagueRow> {
  /** Doğrulanmış, tekrarın skoruyla sıralı; her koşu bir kez. */
  ranked: Array<{ entry: T; verdict: VerifiedRun }>;
  /** Henüz doğrulanmadı. */
  pending: T[];
  /** Doğrulanamadı (neden ve varsa tekrarın skoru). */
  rejected: Array<{ entry: T; verdict: RejectedRun }>;
  /** Doğrulanmış ama sıralamadaki bir koşunun aynısı (eğri ve skor). */
  copies: Array<{ entry: T; verdict: VerifiedRun; of: T }>;
}

/**
 * Tablonun kendisi. Satırın beyan ettiği skor sıralamaya girmiyor; yalnızca
 * doğrulanmış koşular, tekrarın skoruyla. Aynı eğri ve skoru taşıyan
 * koşulardan yalnızca önce gönderildiğini beyan eden sayılıyor (beyan
 * edilen zaman satırın kendisinden; sunucusuz bir tabloda başka saat yok).
 */
export function rankLeague<T extends LeagueRow>(
  entries: readonly T[],
  verdictOf: (entry: T) => RunVerdict | undefined,
): LeagueStanding<T> {
  const standing: LeagueStanding<T> = { ranked: [], pending: [], rejected: [], copies: [] };
  const verified: Array<{ entry: T; verdict: VerifiedRun }> = [];
  for (const entry of entries) {
    const verdict = verdictOf(entry);
    if (!verdict) standing.pending.push(entry);
    else if (verdict.status === 'bad') standing.rejected.push({ entry, verdict });
    else verified.push({ entry, verdict });
  }
  verified.sort((a, b) => a.entry.submittedAt.localeCompare(b.entry.submittedAt) || a.entry.id.localeCompare(b.entry.id));
  const firstOf = new Map<string, T>();
  for (const row of verified) {
    const key = `${row.verdict.score}|${row.verdict.curve.join(',')}`;
    const first = row.verdict.idle ? undefined : firstOf.get(key);
    if (first) standing.copies.push({ ...row, of: first });
    else {
      if (!row.verdict.idle) firstOf.set(key, row.entry);
      standing.ranked.push(row);
    }
  }
  standing.ranked.sort((a, b) => b.verdict.score - a.verdict.score);
  return standing;
}
