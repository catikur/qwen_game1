import { BUILDING_BY_ID, CRISIS_BY_ID, SCENARIO_BY_ID, getCeoModifiers, hasModifier } from '@capital/content';
import type { ScenarioDef, ScenarioSetup } from '@capital/content';
import { build, buyTile, purchaseBlocker, zoningBlocker } from './actions';
import { GameEngine } from './engine';
import { foundCity } from './holding';
import { tc } from './i18n';
import { pushNews } from './news';
import { recomputeNetWorth } from './systems/city';
import { annuityPayment, loanRate } from './systems/credit';
import { formConsortium } from './systems/consortium';
import { TOTAL_SHARES } from './systems/equity';
import { noteRelation } from './systems/relations';
import { ruleValues } from './systems/rules';
import { createNewGame, makeCompany } from './worldgen';
import type { BuildingInstance, GameState } from './types';

/**
 * Senaryo kurulumu (Tur 39). Tanımlar içerikte (`SCENARIOS`), günlük
 * değerlendirme `systems/scenario.ts`te.
 *
 * İKİ ADIM. Önce ön tarih: şehir senaryonun tohumuyla kuruluyor ve
 * `preludeDays` gün kendi kendine yaşıyor. Oyuncu sahnede değil — binası
 * yok, kurucu kilidi hisselerini koruyor; rakipler zincirlerini kuruyor,
 * şehir büyüyor. Sonra devir: oyuncunun şirketi baştan kuruluyor ve
 * senaryonun durumuna getiriliyor (şubeler, kredi, baskıncı payı, kasa,
 * kriz).
 *
 * Ön tarih oyuncunun seçimlerinden bağımsız (ad ve CEO devirde
 * yazılıyor): aynı senaryo her seferinde aynı şehirde başlıyor.
 *
 * Tarayıcı ön tarihi parça parça koşturuyor (`startScenario().step`),
 * ekran donmasın diye; testler ve araçlar `createScenarioGame` ile tek
 * seferde.
 */

export interface ScenarioOptions {
  companyName?: string;
  ceoId?: string | null;
}

export interface ScenarioBuilder {
  readonly def: ScenarioDef;
  /** Ön tarihin toplam gün sayısı. */
  readonly totalDays: number;
  /** Koşulmuş gün sayısı. */
  daysDone(): number;
  /** Ön tarihten en çok `days` gün koşar; bittiyse true. */
  step(days: number): boolean;
  /** Devir: oyuncunun şirketi senaryonun durumuna. Ön tarih bitmemişse önce onu bitirir. */
  finish(): GameState;
}

export function startScenario(id: string, options: ScenarioOptions = {}): ScenarioBuilder {
  const def = SCENARIO_BY_ID[id];
  if (!def) throw new Error(`unknown scenario: ${id}`);
  // Ek kurallar (Tur 60) ön tarihle birlikte: şehir onlarla büyüdü.
  const state = createNewGame({
    seed: def.seed,
    citySize: def.citySize,
    difficulty: def.difficulty,
    ...(def.modifiers ? { modifiers: def.modifiers } : {}),
    // Paketin kuralları (Tur 67) kendi ayarlarıyla, ön tarihte de.
    ...(def.ruleOverrides ? { ruleOverrides: def.ruleOverrides } : {}),
  });
  // Oyuncu sahnede değil: hissesi ön tarih boyunca alınamıyor.
  state.companies[state.playerCompanyId]!.lockedUntilDay = def.preludeDays + 1;
  const engine = new GameEngine(state);
  let done = 0;
  let played: GameState | null = null;
  const step = (days: number): boolean => {
    for (let i = 0; i < days && done < def.preludeDays; i++) {
      engine.runDay();
      done++;
    }
    return done >= def.preludeDays;
  };
  return {
    def,
    totalDays: def.preludeDays,
    daysDone: () => done,
    step,
    finish: () => {
      if (!played) {
        step(Number.POSITIVE_INFINITY);
        played = handOver(state, def, options);
      }
      return played;
    },
  };
}

/** Ön tarih ve devir tek seferde. */
export function createScenarioGame(id: string, options: ScenarioOptions = {}): GameState {
  return startScenario(id, options).finish();
}

/**
 * Devir. Oyuncunun ön tarihteki şirketi (bina yok, yalnızca başlangıç
 * kasası) yerine taze bir şirket; ön tarihte oyuncuya açılıp süresi dolan
 * kart, teklif, balon ve pano masadan kalkıyor, haber akışı senaryonun
 * açılışıyla başlıyor.
 *
 * Kasa senaryonun kendisi: CEO'nun başlangıç nakdi çarpanı uygulanmıyor
 * (Krizin ortasında 2,3 katı kasayla başlamak hedefi anlamsızlaştırırdı).
 * CEO'nun diğer özellikleri — inşaat pazarlığı, marka, ücret — geçerli.
 *
 * Dönen durum oynanacak şehir: ikinci şehirle başlayan senaryoda (Holding:
 * iki şehir) yeni şehir, kurulan şehir onun holding'inde uzakta.
 */
function handOver(state: GameState, def: ScenarioDef, options: ScenarioOptions): GameState {
  const playerId = state.playerCompanyId;
  const previous = state.companies[playerId]!;
  const ceoId = options.ceoId ?? null;
  const name = options.companyName?.trim() || previous.name;
  // CEO'nun başlangıç markası serbest oyundaki gibi; kasa senaryonun.
  const fresh = makeCompany(playerId, name.slice(0, 32), true, previous.color, 0, null, ceoId, getCeoModifiers(ceoId).startingBrand);
  state.companies[playerId] = fresh;

  delete state.card;
  delete state.contractOffer;
  delete state.contract;
  delete state.bubble;
  delete state.quests;
  delete state.goals;
  delete state.bubblesShown;
  delete state.bubblesCaught;
  delete state.questsDone;
  // Kariyer sayaçları (Tur 41) oyuncunun devraldığı günden sayılıyor: ön tarihte biten kriz onun değil.
  delete state.feats;
  state.news = [];

  const day = state.time.day;
  // Paketten gelen senaryo tanımını kayda yazıyor: paket yüklü olmayan cihazda da açılsın (Tur 67).
  state.scenario = { id: def.id, startDay: day, endDay: day + def.days, ...(def.source ? { pack: def.source.doc } : {}) };

  const setup = def.setup;
  for (const site of inheritedSites(state, setup.outlets ?? [])) placeInherited(state, playerId, site.tileId, site.defId);
  if (setup.idle) {
    for (const site of inheritedSites(state, setup.idle.defIds)) {
      const building = placeInherited(state, playerId, site.tileId, site.defId);
      if (building) building.focus = setup.idle.focus;
    }
  }
  // Devralınan binalar önceki yönetimin: konsorsiyumun "yeni bina" sayımına girmesin.
  if (setup.builtDaysAgo) {
    for (const building of Object.values(state.buildings)) {
      if (building.companyId === playerId) building.builtDay = day - setup.builtDaysAgo;
    }
  }
  fresh.cash = setup.cash;
  if (setup.loan) {
    // Şubeler krediyle kurulmuş: vadeli kredi, not C (kredili hesap pahalı).
    // Sıkı bankada (Tur 60, Karanlık kış) kuralın faiz farkıyla.
    const tight = hasModifier(state.modifiers, 'tight_credit') ? ruleValues(state).tightCredit.rateDelta : 0;
    const rate = loanRate('C', 'term', setup.loan.termDays) + tight;
    fresh.debt = setup.loan.amount;
    fresh.credit = {
      loans: [
        {
          id: `${playerId}-L1`,
          kind: 'term',
          principal: setup.loan.amount,
          balance: setup.loan.amount,
          rate,
          termDays: setup.loan.termDays,
          startDay: day,
          payment: annuityPayment(setup.loan.amount, rate, setup.loan.termDays),
        },
      ],
      rating: 'C',
      overdraftDays: 0,
      loanSeq: 1,
    };
  }
  recomputeNetWorth(state);

  // Senaryonun açılış haberinden SONRA olanlar (haber akışının sırası).
  const afterBrief: Array<() => void> = [];
  if (setup.raiderStake) {
    // Baskıncı: şehrin en güçlü rakibi, payı topladı bile.
    const stake = setup.raiderStake;
    const raider = Object.values(state.companies)
      .filter((company) => !company.isPlayer)
      .sort((a, b) => b.netWorth - a.netWorth || a.id.localeCompare(b.id))[0];
    if (raider) {
      raider.shares[playerId] = Math.round(stake * TOTAL_SHARES);
      state.scenario.rivalId = raider.id;
      afterBrief.push(() =>
        pushNews(
          state,
          'bad',
          tc('core.scenario.rescueRaidTitle', { name: raider.name, percent: Math.round(stake * 100) }),
          tc('core.scenario.rescueRaidBody'),
          raider.id,
        ),
      );
    }
  }
  if (setup.feud) {
    // Devralınan husumet (Tur 60): şehrin en değerli rakipleri önceki
    // yönetimin fiyat savaşlarını unutmadı. Duruşun haberi açılıştan sonra.
    const count = setup.feud;
    const foes = Object.values(state.companies)
      .filter((company) => !company.isPlayer)
      .sort((a, b) => b.netWorth - a.netWorth || a.id.localeCompare(b.id))
      .slice(0, count);
    afterBrief.push(() => {
      for (const foe of foes) noteRelation(state, foe.id, 'feud');
    });
  }
  if (setup.crisis) {
    const crisis = CRISIS_BY_ID[setup.crisis.id];
    if (crisis) {
      // Kriz senaryonun bitiş gününde sona eriyor: hedef "kriz bittiğinde".
      state.crisis = { defId: crisis.id, phase: 'warning', activeDay: day + setup.crisis.warningDays, endDay: state.scenario.endDay };
      afterBrief.push(() => pushNews(state, 'bad', crisis.warningTitle, crisis.warningBody));
    }
  }
  if (setup.consortium) {
    const warningDays = setup.consortium.warningDays;
    // Konsorsiyum devir günü kuruluyor; duyurusu senaryonun açılışından sonra.
    afterBrief.push(() => {
      formConsortium(state, warningDays);
      if (state.consortium) state.scenario!.rivalId = state.consortium.leaderId;
    });
  }
  if (setup.projects) {
    // Belediyenin takvimi senaryonun: ilk proje yakında (sonrakiler `scenarioProjectGap`).
    state.nextProjectDay = day + setup.projects.firstInDays;
  }
  if (setup.freeze?.entrants) {
    // Ruhsat dondurması: boşalan koltuğa kimse girmiyor (senaryo bitince kalkıyor).
    state.flags.rivalEntry = false;
    delete state.rivalVacancyDay;
  }
  // İhraç dondurması: rakibin de oyuncunun da yeni hisse ihracı kapalı.
  if (setup.freeze?.issuance) state.flags.issuance = false;
  if (def.goal.kind === 'monopoly') {
    state.scenario.rivalsAtStart = Object.values(state.companies).filter((company) => !company.isPlayer).length;
  }

  fresh.netWorthHistory = [Math.round(fresh.netWorth)];
  // Oyun duraklamış başlıyor: önce açılış ekranı (durum, hedef, süre).
  state.time.speed = 0;
  state.time.accumulatorMs = 0;

  pushNews(state, 'neutral', tc('core.scenario.startTitle', { title: def.title }), def.brief);
  for (const step of afterBrief) step();
  return setup.secondCity ? openSecondCity(state, def, setup.secondCity) : state;
}

/**
 * Holding: iki şehir. Kurulan şehir kurucu şehir olup uzağa geçiyor;
 * oyuncu sermayeyle açılan yeni şehirde başlıyor ve senaryo onunla
 * geliyor. Sermaye kurucu şehrin kasasından düşülmüyor (kasa senaryonun
 * `cash`i) ve kurucu şehrin zafer ölçüsüne "dışarı aktarılan" diye
 * eklenmiyor: o şehrin zaferi kendi değeriyle.
 */
function openSecondCity(founding: GameState, def: ScenarioDef, city: NonNullable<ScenarioSetup['secondCity']>): GameState {
  const run = founding.scenario!;
  delete founding.scenario;
  const owner = founding.companies[founding.playerCompanyId]!;
  owner.cash += city.capital;
  const next = foundCity(founding, city.citySize, city.capital);
  const away = next.holding!.dormant[0]!.state;
  delete away.importedCapital;
  recomputeNetWorth(away);

  const day = next.time.day;
  next.scenario = { ...run, startDay: day, endDay: day + def.days };
  next.time.speed = 0;
  next.time.accumulatorMs = 0;
  pushNews(next, 'neutral', tc('core.scenario.startTitle', { title: def.title }), def.brief);
  return next;
}

/**
 * Önceki yönetimin şubesi. Mağazanın açılış eşiği ve kasa kuralı yeni
 * yatırım içindir; devralınan şube zaten orada, bu yüzden geçici bir
 * kasayla kuruluyor (kasa devirde senaryonun değerine yazılıyor).
 */
function placeInherited(state: GameState, companyId: string, tileId: number, defId: string): BuildingInstance | null {
  const company = state.companies[companyId]!;
  const cash = company.cash;
  const worth = company.netWorth;
  company.cash = Number.MAX_SAFE_INTEGER / 4;
  company.netWorth = Number.MAX_SAFE_INTEGER / 4;
  const built = buyTile(state, companyId, tileId).ok && build(state, companyId, tileId, defId).ok;
  company.cash = cash;
  company.netWorth = worth;
  const id = state.map.tiles[tileId]?.buildingId;
  return built && id ? (state.buildings[id] ?? null) : null;
}

/**
 * Devralınan binalar: her biri, o kategoride rakibin en az mağazası
 * olan açık bölgede (eşitlikte az kullanılmış bölge, sonra kimlik).
 * Parsel bölgenin rakip mağazalarının ortasına en yakın boş parsel; rakip
 * yoksa bölgenin ortası. Binadan çok bölge olunca bir bölgeye ikinci bina
 * düşüyor; seçilen parsel bir daha seçilmiyor (yerleştirme listeden sonra).
 */
export function inheritedSites(state: GameState, defIds: readonly string[]): Array<{ tileId: number; defId: string }> {
  const width = state.map.width;
  const used = new Map<number, number>();
  for (const building of Object.values(state.buildings)) {
    if (building.companyId === state.playerCompanyId) used.set(building.districtId, (used.get(building.districtId) ?? 0) + 1);
  }
  const sites: Array<{ tileId: number; defId: string }> = [];
  const taken = new Set<number>();
  for (const defId of defIds) {
    const def = BUILDING_BY_ID[defId];
    if (!def) continue;
    const rivals = new Map<number, number[]>();
    for (const building of Object.values(state.buildings)) {
      if (building.companyId === state.playerCompanyId) continue;
      const other = BUILDING_BY_ID[building.defId];
      if (other?.role !== 'outlet' || other.category !== def.category) continue;
      const list = rivals.get(building.districtId) ?? [];
      list.push(building.tileId);
      rivals.set(building.districtId, list);
    }
    const districts = state.districts
      .filter((district) => !zoningBlocker(state, district.id, defId))
      .filter((district) => district.opensOnDay === undefined || state.time.day >= district.opensOnDay)
      .map((district) => ({ district, count: rivals.get(district.id)?.length ?? 0, mine: used.get(district.id) ?? 0 }))
      .sort((a, b) => a.mine - b.mine || a.count - b.count || a.district.id - b.district.id);
    for (const { district } of districts) {
      const tiles = rivals.get(district.id);
      const cx = tiles ? tiles.reduce((sum, id) => sum + (id % width), 0) / tiles.length : (district.x0 + district.x1) / 2;
      const cy = tiles ? tiles.reduce((sum, id) => sum + Math.floor(id / width), 0) / tiles.length : (district.y0 + district.y1) / 2;
      let best: { tileId: number; distance: number } | null = null;
      for (const tile of state.map.tiles) {
        if (tile.districtId !== district.id || tile.kind !== 'plot' || tile.structureId || tile.buildingId || tile.ownerId) continue;
        if (taken.has(tile.id)) continue;
        if (purchaseBlocker(state, tile.id)) continue;
        const distance = Math.abs(tile.x - cx) + Math.abs(tile.y - cy);
        if (!best || distance < best.distance) best = { tileId: tile.id, distance };
      }
      if (!best) continue;
      used.set(district.id, (used.get(district.id) ?? 0) + 1);
      taken.add(best.tileId);
      sites.push({ tileId: best.tileId, defId });
      break;
    }
  }
  return sites;
}
