import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDING_BY_ID, CAMPAIGN, CONSUMER_CATEGORIES, RELATION, RIVAL_CEOS, TEMPERAMENTS, TEMPERAMENT_IDS, rivalBio } from '@capital/content';
import type { CategoryId } from '@capital/content';
import { GameEngine } from '../src/engine';
import { createNewGame } from '../src/worldgen';
import { build, buyTile } from '../src/actions';
import { agenda } from '../src/agenda';
import { rivalProfile, rivalProfiles } from '../src/profiles';
import { isDistrictOpen, isPurchasable } from '../src/systems/city';
import { runAuctionTick, valuationFor } from '../src/systems/auction';
import { lobby, runCouncilTick } from '../src/systems/council';
import { formConsortium } from '../src/systems/consortium';
import { generateProfile } from '../src/systems/entrants';
import { buyShares, sellShares, sharesOutstanding } from '../src/systems/equity';
import { acceptFreight, cancelFreight, runFreightTick } from '../src/systems/freight';
import { revengeDay, runRivalryTick } from '../src/systems/rivalry';
import {
  amendsBlocker,
  amendsCost,
  noteRelation,
  relationScore,
  runRelationsTick,
  stanceOf,
  temperamentOf,
} from '../src/systems/relations';
import { playerStrategy } from './proxy';
import type { CampaignState, CompanyState, GameState } from '../src/types';

/** Büyümüş bir şehir: vekil 150 gün; olay, dönem ve kriz yok. */
function grown(seed = 1): GameEngine {
  const engine = new GameEngine(createNewGame({ seed, companyName: 'Hafıza AŞ' }));
  for (let day = 1; day <= 150; day++) {
    if (day % 7 === 1) playerStrategy(engine);
    engine.runDay();
  }
  return engine;
}

const base = grown();
const fresh = (): GameState => {
  const state = JSON.parse(JSON.stringify(base.getState())) as GameState;
  state.activeEvents = [];
  state.era = undefined;
  state.crisis = undefined;
  const me = state.companies[state.playerCompanyId]!;
  me.cash += 20_000_000;
  me.netWorth += 20_000_000;
  // Kurucu kilitleri yok: oyuncu rakip hissesi alabilsin.
  for (const company of Object.values(state.companies)) {
    delete company.lockedUntilDay;
    delete company.playerLockedUntilDay;
  }
  return state;
};

function rivals(state: GameState): CompanyState[] {
  return rivalProfiles(state)
    .map((profile) => state.companies[profile.id])
    .filter((company): company is CompanyState => Boolean(company));
}

/** Mizacı verilen ilk rakip. */
function rivalWith(state: GameState, temperament: string): CompanyState {
  const found = rivals(state).find((company) => temperamentOf(state, company.id)?.id === temperament);
  assert.ok(found, `${temperament} rakip yok`);
  return found;
}

function sellsIn(state: GameState, companyId: string, category: CategoryId): boolean {
  return Object.values(state.buildings).some((b) => {
    const def = BUILDING_BY_ID[b.defId];
    return b.companyId === companyId && def?.role === 'outlet' && def.category === category;
  });
}

/** Oyuncuyla ortak rafı olan rakip ve kategori (oyuncunun payı kampanya eşiğinde). */
function sharedShelf(state: GameState): { rival: CompanyState; category: CategoryId } {
  const player = state.companies[state.playerCompanyId]!;
  for (const category of CONSUMER_CATEGORIES) {
    if ((player.marketShare[category] ?? 0) < CAMPAIGN.minPlayerShare) continue;
    const rival = rivals(state).find((c) => (c.marketShare[category] ?? 0) > 0 && sellsIn(state, c.id, category));
    if (rival) return { rival, category };
  }
  assert.fail('ortak raf yok');
}

function hostile(state: GameState, company: CompanyState): void {
  noteRelation(state, company.id, 'shares', 20);
  assert.equal(stanceOf(state, company.id), 'hostile');
}

function allied(state: GameState, company: CompanyState): void {
  noteRelation(state, company.id, 'freight', 6);
  assert.equal(stanceOf(state, company.id), 'allied');
}

describe('rakipler 2.0: mizaç, hafıza ve tepkiler (Tur 59)', () => {
  test('kimlik: katalog CEO\'sunun mizacı ve geçmişi; üretilen rakibin mizacı zarla ve kararlı', () => {
    const state = fresh();
    for (const company of rivals(state)) {
      const profile = rivalProfile(state, company.profileId)!;
      const own = RIVAL_CEOS[profile.id];
      if (own) assert.equal(temperamentOf(state, company.id)?.id, own.temperament);
      assert.ok(rivalBio(profile.id, profile.trait).length > 10, `${profile.id} geçmişi yok`);
    }
    // Sekiz katalog CEO'sunda dört mizacın hepsi var.
    assert.deepEqual(new Set(Object.values(RIVAL_CEOS).map((ceo) => ceo.temperament)), new Set(TEMPERAMENT_IDS));
    const a = generateProfile(state, rivals(state));
    const b = generateProfile(state, rivals(state));
    assert.ok(a.temperament && TEMPERAMENT_IDS.includes(a.temperament));
    assert.equal(a.temperament, b.temperament);
    assert.deepEqual(a.portrait, b.portrait);
  });

  test('hisse: alınan her %1 −4 × mizaç; bir hafta içindeki alımlar tek satır; eşikte husumet ve haber; satış dostça', () => {
    const state = fresh();
    const me = state.playerCompanyId;
    const rival = rivalWith(state, 'vindictive');
    const outstanding = sharesOutstanding(state, rival.id);
    assert.ok(buyShares(state, me, rival.id, outstanding * 0.03).ok);
    const kind = TEMPERAMENTS.vindictive;
    assert.equal(relationScore(rival), -4 * 3 * kind.hostile);
    state.time.day += 3;
    assert.ok(buyShares(state, me, rival.id, outstanding * 0.03).ok);
    assert.equal(rival.relation!.memory.length, 1, 'aynı hafta tek satır');
    assert.equal(rival.relation!.memory[0]!.delta, -4 * 6 * kind.hostile);
    assert.equal(stanceOf(state, rival.id), null, '−36 henüz husumet değil');
    const seq = state.newsSeq ?? 0;
    state.time.day += 10;
    assert.ok(buyShares(state, me, rival.id, outstanding * 0.01).ok);
    assert.equal(stanceOf(state, rival.id), 'hostile');
    assert.equal(rival.relation!.since, state.time.day);
    assert.ok(state.news.some((n) => n.id > seq && n.title.includes(rival.name)), 'husumet haberi yok');
    assert.equal(rival.relation!.memory.length, 2);
    const before = relationScore(rival);
    assert.ok(sellShares(state, me, rival.id, outstanding * 0.02).ok);
    assert.equal(relationScore(rival), before + 2 * 2 * kind.friendly);
    assert.equal(rival.relation!.memory[0]!.kind, 'sold');
  });

  test('sönüm: mizacın hızıyla sıfıra; husumet −30\'un üstünde bitiyor (tampon); pragmatik kindardan hızlı unutuyor', () => {
    const state = fresh();
    const grudge = rivalWith(state, 'vindictive');
    const cool = rivalWith(state, 'pragmatic');
    for (const company of [grudge, cool]) company.relation = { score: -45, stance: 'hostile', since: state.time.day, memory: [] };
    runRelationsTick(state);
    assert.equal(grudge.relation!.score, -45 + TEMPERAMENTS.vindictive.fadeHostile);
    assert.equal(cool.relation!.score, -45 + TEMPERAMENTS.pragmatic.fadeHostile);
    let days = 1;
    while (stanceOf(state, cool.id) === 'hostile' && days < 400) {
      state.time.day += 1;
      runRelationsTick(state);
      days++;
    }
    assert.ok(cool.relation!.score > RELATION.hostileEndsAt && cool.relation!.score <= RELATION.hostileEndsAt + 0.2);
    assert.equal(stanceOf(state, grudge.id), 'hostile', 'kindar hâlâ husumetli');
    assert.ok(grudge.relation!.score < -40);
  });

  test('fiyat kırma: aynı bölgede, aynı kategoride ×0,90 ve altı haftada bir; ×0,95 sayılmıyor', () => {
    const state = fresh();
    const me = state.playerCompanyId;
    const target = Object.values(state.buildings).find((b) => {
      const def = BUILDING_BY_ID[b.defId];
      if (b.companyId === me || def?.role !== 'outlet' || !rivalProfile(state, state.companies[b.companyId]?.profileId)) return false;
      return state.map.tiles.some((t) => t.districtId === b.districtId && isPurchasable(t) && !t.structureId && !t.buildingId);
    })!;
    assert.ok(target, 'rakip mağazası yok');
    const tile = state.map.tiles.find((t) => t.districtId === target.districtId && isPurchasable(t) && !t.structureId && !t.buildingId)!;
    assert.ok(buyTile(state, me, tile.id).ok);
    assert.ok(build(state, me, tile.id, target.defId).ok, 'mağaza kurulamadı');
    const mine = state.buildings[state.map.tiles[tile.id]!.buildingId!]!;
    const rival = state.companies[target.companyId]!;
    const week = (multiplier: number): number => {
      mine.priceMultiplier = multiplier;
      state.time.day = (Math.floor(state.time.day / RELATION.undercutEveryDays) + 1) * RELATION.undercutEveryDays;
      const before = relationScore(rival);
      runRelationsTick(state);
      return relationScore(rival) - before;
    };
    assert.equal(week(0.95), 0, 'fiyat kırma sayılmamalı');
    const temperament = temperamentOf(state, rival.id)!;
    assert.equal(week(0.85), RELATION.events.undercut * temperament.hostile);
    assert.equal(rival.relation!.memory[0]!.kind, 'undercut');
  });

  test('rövanş: husumetli rakip ortak raftaki kategoride 20 gün sonra fiyat savaşı açıyor; müttefik kampanya açmıyor', () => {
    const state = fresh();
    const { rival, category } = sharedShelf(state);
    delete state.campaign;
    state.nextCampaignDay = state.time.day + 500;
    hostile(state, rival);
    const since = state.time.day;
    assert.equal(revengeDay(state), since + RELATION.revengeDays);
    for (let day = 0; day < RELATION.revengeDays + 1 && !state.campaign; day++) {
      state.time.day += 1;
      runRivalryTick(state);
    }
    // Döngü kampanyayı açtı; tip daraltması `delete`ten kalıyor.
    const campaign = state.campaign as CampaignState | undefined;
    assert.ok(campaign, 'rövanş açılmadı');
    assert.equal(campaign.companyId, rival.id);
    assert.equal(campaign.revenge, true);
    assert.equal(state.time.day, since + RELATION.revengeDays);
    const player = state.companies[state.playerCompanyId]!;
    const best = CONSUMER_CATEGORIES.filter((c) => (player.marketShare[c] ?? 0) >= CAMPAIGN.minPlayerShare && sellsIn(state, rival.id, c) && (rival.marketShare[c] ?? 0) > 0)
      .sort((a, b) => (player.marketShare[b] ?? 0) - (player.marketShare[a] ?? 0))[0];
    assert.equal(campaign.category, best ?? category);
    assert.ok(agenda(state).some((item) => item.kind === 'campaign'));

    // Müttefik: o kategorinin her satıcısı müttefikse kampanya onlardan gelmiyor.
    const other = fresh();
    delete other.campaign;
    other.nextCampaignDay = other.time.day;
    for (const company of rivals(other)) allied(other, company);
    runRivalryTick(other);
    assert.equal(other.campaign, undefined, 'müttefik kampanya açtı');
  });

  test('kampanya sonu: geri püskürtülen kampanya rakibe ağır geliyor (gururlu iki kat); kazanılan rövanş kini yumuşatıyor', () => {
    const state = fresh();
    const { rival, category } = sharedShelf(state);
    const player = state.companies[state.playerCompanyId]!;
    const share = player.marketShare[category] ?? 0;
    state.campaign = { companyId: rival.id, category, startDay: state.time.day - 45, endDay: state.time.day, playerShare: share };
    runRivalryTick(state);
    const temperament = temperamentOf(state, rival.id)!;
    assert.equal(rival.relation!.memory[0]!.kind, 'campaignHeld');
    assert.equal(rival.relation!.memory[0]!.delta, RELATION.events.campaignHeld * temperament.hostile * temperament.pride);
    assert.equal(state.campaignEndedDay, state.time.day);

    const lost = fresh();
    const pair = sharedShelf(lost);
    hostile(lost, pair.rival);
    const before = relationScore(pair.rival);
    lost.campaign = { companyId: pair.rival.id, category: pair.category, startDay: lost.time.day - 45, endDay: lost.time.day, playerShare: 0.99, revenge: true };
    runRivalryTick(lost);
    const t = temperamentOf(lost, pair.rival.id)!;
    assert.equal(relationScore(pair.rival), before + RELATION.events.settled * t.friendly);
    // Husumet sürüyorsa sıradaki rövanş bitişten en az 90 gün sonra.
    if (stanceOf(lost, pair.rival.id) === 'hostile') assert.equal(revengeDay(lost), lost.time.day + RELATION.revengeGapDays);
  });

  test('meclis: husumetli çıkarına karşı ve bağışının yarısı kadar karşına, müttefik çıkarın yönünde ve üçte biri kadar yanına; tepki bağışı hafızaya girmiyor', () => {
    const state = fresh();
    const me = state.playerCompanyId;
    const all = rivals(state);
    // Ruhsat kolaylığı: oyuncunun çıkarı lehte (0,3). Genişlemeci olmayan rakibin
    // kendi çıkarı da 0,3: husumetli için ikisi birbirini götürüyor, kendiliğinden
    // bağışı yok; karşı bağışı oyuncunun bağışına tepki.
    const foe = all.find((r) => rivalProfile(state, r.profileId)!.trait !== 'expansionist')!;
    const friend = all.find((r) => r !== foe && rivalProfile(state, r.profileId)!.trait !== 'expansionist')!;
    hostile(state, foe);
    allied(state, friend);
    foe.cash += 5_000_000;
    friend.cash += 5_000_000;
    const day = state.time.day;
    state.council = {
      nextSessionDay: day + 90,
      session: { openedDay: day - 2, voteDay: day + 5, motions: [{ id: 'm', kind: 'permit_relief', title: 'Ruhsat', summary: '', baseSupport: 0.5, lobby: {} }] },
      history: [],
    };
    assert.ok(lobby(state, me, 'm', 'for', 400_000).ok);
    const profileOf = (company: CompanyState) => rivalProfile(state, company.profileId)!;
    const budget = (company: CompanyState, cash: number) => Math.min(cash * 0.04, 300_000) * profileOf(company).aggression;
    const friendCash = friend.cash;
    state.time.day += 1;
    runCouncilTick(state);
    const motion = state.council.session!.motions[0]!;
    // Husumetli: kendiliğinden bağış yok, oyuncunun bağışına yarısı kadar karşılık (iki kat bütçeye kadar).
    assert.ok((motion.lobby[foe.id] ?? 0) < 0, 'husumetli karşı bağış yapmadı');
    const reaction = motion.reactions?.[foe.id] ?? 0;
    const expected = Math.round(Math.min(400_000 * RELATION.counterLobby, budget(foe, foe.cash + reaction) * RELATION.lobbyBudgetMultiple));
    assert.ok(Math.abs(reaction - expected) < 1, `karşı bağış ${reaction}, beklenen ${expected}`);
    assert.equal(Math.abs(motion.lobby[foe.id]!), reaction);
    // Müttefik: çıkarı (0,3) + oyuncunun çıkarının yarısı (0,15), sonra bağışına üçte bir.
    const own = Math.round(budget(friend, friendCash) * 0.3);
    assert.ok(motion.lobby[friend.id]! > own, 'müttefik yanında bağış yapmadı');
    assert.ok(Math.abs(motion.lobby[friend.id]! - own - motion.reactions![friend.id]!) < 2);
    assert.ok(state.news.some((n) => n.title.includes(friend.name)), 'müttefik haberi yok');
    // Oyuncu artırınca ertesi gün tepki tamamlanıyor (tavana kadar).
    const counter = motion.reactions![foe.id]!;
    const ceiling = budget(foe, foe.cash) * RELATION.lobbyBudgetMultiple + counter;
    assert.ok(lobby(state, me, 'm', 'for', 200_000).ok);
    state.time.day += 1;
    runCouncilTick(state);
    const after = motion.reactions![foe.id]!;
    assert.ok(after >= counter);
    assert.ok(after <= Math.min(600_000 * RELATION.counterLobby, ceiling) + 1);
    // Oylama: kendi çıkarıyla yaptığı bağış sayılıyor, tepki bağışı sayılmıyor.
    const foeMemory = foe.relation!.memory.length;
    const friendMemory = friend.relation!.memory.length;
    state.time.day = day + 5;
    runCouncilTick(state);
    assert.equal(foe.relation!.memory.length, foeMemory, 'tepki bağışı husumeti beslemiş');
    assert.equal(friend.relation!.memory.length, friendMemory + 1);
    assert.equal(friend.relation!.memory[0]!.kind, 'lobbyWith');
  });

  test('meclis, kendiliğinden: husumetli oyuncunun en güçlü kategorisine vergiyi istiyor, müttefik karşı çıkıyor', () => {
    const state = fresh();
    const player = state.companies[state.playerCompanyId]!;
    const category = CONSUMER_CATEGORIES.slice().sort((a, b) => (player.marketShare[b] ?? 0) - (player.marketShare[a] ?? 0))[0]!;
    assert.ok((player.marketShare[category] ?? 0) > 0.1, 'oyuncunun güçlü kategorisi yok');
    const [foe, friend] = rivals(state).filter((r) => (r.marketShare[category] ?? 0) < 0.05);
    assert.ok(foe && friend, 'kategoride payı küçük iki rakip yok');
    hostile(state, foe);
    allied(state, friend);
    foe.cash += 5_000_000;
    friend.cash += 5_000_000;
    const day = state.time.day;
    state.council = {
      nextSessionDay: day + 90,
      session: { openedDay: day - 2, voteDay: day + 5, motions: [{ id: 't', kind: 'category_tax', category, title: 'Vergi', summary: '', baseSupport: 0.5, lobby: {} }] },
      history: [],
    };
    // Aynı oturum, duruşsuz: karşılaştırma.
    const calm = JSON.parse(JSON.stringify(state)) as GameState;
    for (const company of Object.values(calm.companies)) delete company.relation;
    state.time.day += 1;
    calm.time.day += 1;
    runCouncilTick(state);
    runCouncilTick(calm);
    const motion = state.council.session!.motions[0]!;
    const quiet = calm.council!.session!.motions[0]!;
    assert.ok((motion.lobby[foe.id] ?? 0) > (quiet.lobby[foe.id] ?? 0), `husumetli vergiyi istemedi: ${motion.lobby[foe.id]} / ${quiet.lobby[foe.id]}`);
    assert.ok((motion.lobby[foe.id] ?? 0) > 0);
    assert.ok((motion.lobby[friend.id] ?? 0) < (quiet.lobby[friend.id] ?? 0), 'müttefik vergiye karşı çıkmadı');
    assert.ok(state.news.some((n) => n.title.includes(foe.name)), 'husumetli lobi haberi yok');
  });

  test('ihale: öndeki sensen müttefik artırmıyor, husumetli değerlemesinin %20 üstüne kadar inadına geçiyor; kazanırsan geçtiğin rakipler hatırlıyor', () => {
    const state = fresh();
    const me = state.playerCompanyId;
    const tile = state.map.tiles.find((t) => isPurchasable(t) && !t.structureId && !t.buildingId && isDistrictOpen(state, t.districtId))!;
    // En yüksek tavanlı rakip; senin teklifin tavanının 1,1 katı.
    const appetite = (c: CompanyState) => {
      const trait = rivalProfile(state, c.profileId)!.trait;
      return trait === 'landlord' ? 1.5 : trait === 'price_cutter' ? 0.7 : 1;
    };
    const ranked = rivals(state).map((c) => ({ c, ceiling: valuationFor(state, c.id, tile.id) * appetite(c) })).sort((a, b) => b.ceiling - a.ceiling);
    const top = ranked[0]!;
    top.c.cash += top.ceiling * 2;
    const bid = Math.round(top.ceiling * 1.1);
    const open = (world: GameState) => {
      world.auction = { tileId: tile.id, endsOnDay: world.time.day + 3, reserve: 1, bid, bidderId: me, rounds: 1 };
    };
    const neutral = JSON.parse(JSON.stringify(state)) as GameState;
    open(neutral);
    runAuctionTick(neutral);
    assert.equal(neutral.auction!.bidderId, me, 'tarafsız rakip tavanının üstüne çıktı');
    const spite = JSON.parse(JSON.stringify(state)) as GameState;
    hostile(spite, spite.companies[top.c.id]!);
    open(spite);
    runAuctionTick(spite);
    assert.equal(spite.auction!.bidderId, top.c.id, 'husumetli inadına geçmedi');
    assert.ok(spite.auction!.bid <= top.ceiling * RELATION.spite + 1);

    // Müttefikler: senin düşük teklifinin üstüne bile çıkmıyor.
    const friends = JSON.parse(JSON.stringify(state)) as GameState;
    for (const company of rivals(friends)) allied(friends, company);
    friends.auction = { tileId: tile.id, endsOnDay: friends.time.day + 3, reserve: 1, bid: 1, bidderId: me, rounds: 1, bidders: [top.c.id] };
    runAuctionTick(friends);
    assert.equal(friends.auction!.bidderId, me);
    friends.time.day = friends.auction!.endsOnDay;
    const before = friends.companies[top.c.id]!.relation!.memory.length;
    runAuctionTick(friends);
    assert.equal(friends.map.tiles[tile.id]!.ownerId, me);
    const memory = friends.companies[top.c.id]!.relation!.memory;
    assert.equal(memory.length, before + 1);
    const t = temperamentOf(friends, top.c.id)!;
    assert.equal(memory[0]!.kind, 'outbid');
    assert.equal(memory[0]!.delta, RELATION.events.outbid * t.hostile * t.pride);
  });

  test('konsorsiyum: müttefik oyuncuya karşı birliğe girmiyor', () => {
    const state = fresh();
    const top = rivals(state).sort((a, b) => b.netWorth - a.netWorth)[0]!;
    allied(state, top);
    if (formConsortium(state, 30)) assert.ok(!state.consortium!.memberIds.includes(top.id), 'müttefik konsorsiyumda');
    const all = fresh();
    for (const company of rivals(all)) allied(all, company);
    assert.equal(formConsortium(all, 30), false);
  });

  test('nakliye: mağazalarını taşıyan oyuncuyu müşteri hatırlıyor; sözü bozanı da', () => {
    const state = fresh();
    const me = state.companies[state.playerCompanyId]!;
    const outlets = Object.values(state.buildings).filter((b) => b.companyId !== me.id && BUILDING_BY_ID[b.defId]?.role === 'outlet');
    const radius = BUILDING_BY_ID.freight_terminal!.radius;
    let best: { id: number; count: number } | null = null;
    for (const tile of state.map.tiles) {
      if (!isPurchasable(tile) || tile.structureId || tile.buildingId || tile.ownerId) continue;
      const count = outlets.filter((o) => {
        const at = state.map.tiles[o.tileId]!;
        return Math.abs(at.x - tile.x) + Math.abs(at.y - tile.y) <= radius;
      }).length;
      if (!best || count > best.count) best = { id: tile.id, count };
    }
    assert.ok(best && buyTile(state, me.id, best.id).ok && build(state, me.id, best.id, 'freight_terminal').ok);
    for (let i = 0; i < 80 && !state.freight?.offers.length; i++) {
      state.time.day += 1;
      runFreightTick(state);
    }
    const offer = state.freight!.offers[0]!;
    const client = state.companies[offer.companyId]!;
    assert.ok(acceptFreight(state, offer.id).ok);
    const t = temperamentOf(state, client.id)!;
    assert.equal(client.relation!.memory[0]!.kind, 'freight');
    assert.equal(relationScore(client), RELATION.events.freight * t.friendly);
    const contract = state.freight!.contracts.find((deal) => deal.companyId === client.id)!;
    state.time.day += 30;
    assert.ok(cancelFreight(state, contract.id).ok);
    assert.equal(client.relation!.memory[0]!.kind, 'freightCancel');
  });

  test('uzlaşma: bedel net değerin %1\'i (en az 50 B ₺), puan +25 × mizaç, 90 günde bir; müttefikle ve kasasız yok', () => {
    const state = fresh();
    const engine = new GameEngine(state);
    const live = engine.getState();
    const rival = rivals(live).find((c) => temperamentOf(live, c.id)?.id === 'loyal')!;
    rival.relation = { score: -50, stance: 'hostile', since: live.time.day, memory: [] };
    const me = live.companies[live.playerCompanyId]!;
    const cost = amendsCost(live, rival.id);
    assert.equal(cost, Math.max(RELATION.amends.min, Math.round(rival.netWorth * RELATION.amends.share)));
    const cash = me.cash;
    const rivalCash = rival.cash;
    assert.ok(engine.dispatch({ type: 'MAKE_AMENDS', companyId: rival.id }).ok);
    assert.equal(me.cash, cash - cost);
    assert.equal(rival.cash, rivalCash, 'bağış rakibe geçmemeli');
    assert.equal(relationScore(rival), -50 + RELATION.events.amends * TEMPERAMENTS.loyal.friendly);
    assert.equal(stanceOf(live, rival.id), null, 'husumet bitmeli (−12,5)');
    assert.ok(amendsBlocker(live, rival.id), 'bekleme süresi');
    live.time.day += RELATION.amends.cooldownDays;
    assert.equal(amendsBlocker(live, rival.id), null);
    allied(live, rival);
    assert.ok(amendsBlocker(live, rival.id), 'müttefikle uzlaşma');
    const poor = rivals(live).find((c) => c.id !== rival.id)!;
    me.cash = 10;
    assert.ok(amendsBlocker(live, poor.id), 'kasasız');
    assert.equal(engine.dispatch({ type: 'MAKE_AMENDS', companyId: poor.id }).ok, false);
    assert.equal(engine.dispatch({ type: 'MAKE_AMENDS', companyId: live.playerCompanyId }).ok, false);
  });

  test('kapalı: olay kaydı, duruş ve rövanş yok', () => {
    const state = fresh();
    state.flags.rivalRelations = false;
    const rival = rivals(state)[0]!;
    assert.ok(buyShares(state, state.playerCompanyId, rival.id, 500).ok);
    assert.equal(rival.relation, undefined);
    rival.relation = { score: -80, stance: 'hostile', since: state.time.day, memory: [] };
    assert.equal(stanceOf(state, rival.id), null);
    assert.equal(revengeDay(state), Number.POSITIVE_INFINITY);
    assert.ok(amendsBlocker(state, rival.id));
  });

  test('hamle yoksa eski oyun: hafıza açık ve kapalı iki koşu aynı', () => {
    const run = (relations: boolean): GameState => {
      const engine = new GameEngine(createNewGame({ seed: 7, companyName: 'Hafıza AŞ' }));
      if (!relations) engine.getState().flags.rivalRelations = false;
      for (let day = 1; day <= 240; day++) {
        if (day % 7 === 1) playerStrategy(engine);
        engine.runDay();
      }
      return engine.getState();
    };
    const on = run(true);
    const off = run(false);
    assert.equal(on.rng.s, off.rng.s);
    for (const id of Object.keys(off.companies)) {
      assert.equal(on.companies[id]?.netWorth, off.companies[id]!.netWorth, id);
      assert.equal(on.companies[id]?.relation, undefined, `${id} olay kaydetti`);
    }
    assert.deepEqual(on.campaign, off.campaign);
  });

  test('kayıt: ilişki, hafıza ve duruş kaydedilip açılıyor', () => {
    const state = fresh();
    const [foe, friend] = rivals(state);
    hostile(state, foe!);
    allied(state, friend!);
    const engine = new GameEngine(state);
    engine.runDay();
    const copy = new GameEngine(JSON.parse(JSON.stringify(engine.getState())) as GameState);
    engine.runDay();
    copy.runDay();
    const a = engine.getState();
    const b = copy.getState();
    for (const id of [foe!.id, friend!.id]) assert.deepEqual(b.companies[id]!.relation, a.companies[id]!.relation);
    assert.equal(stanceOf(b, foe!.id), 'hostile');
    assert.equal(stanceOf(b, friend!.id), 'allied');
    assert.ok(agenda(b).some((item) => item.kind === 'rival' && item.key === `rival:${foe!.id}`));
  });
});
