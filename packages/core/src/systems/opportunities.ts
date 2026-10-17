import { BUBBLES, BUBBLE_BY_ID, BUBBLE_TIMING, BUILDING_BY_ID, CATEGORIES, CONSUMER_CATEGORIES, QUESTS, QUEST_BY_ID, QUEST_TIMING, fillTemplate } from '@capital/content';
import type { BubbleDef, CategoryId, QuestDef } from '@capital/content';
import { headquarters } from '../headquarters';
import { tc } from '../i18n';
import { pushNews } from '../news';
import { createRng, nextFloat, pickWeighted } from '../rng';
import { formatMoney, nextMonthStart, dayOfMonth } from '../selectors';
import { purchaseBlocker } from '../actions';
import { profitTrend } from './cards';
import { tilePrice } from './city';
import type { BubbleState, CommandResult, CompanyState, GameState, QuestBoard, QuestState } from '../types';

/**
 * Fırsat balonları ve görev panosu (Tur 37c) — içerik ve gerekçe
 * `@capital/content` opportunities.ts'te.
 *
 * İkisinin de zarı DIŞSAL (kart ve kriz takvimiyle aynı ilke): tohumdan
 * ve günden. `state.rng` hiç çekilmiyor; lig parmak izi ve tekrar,
 * balonun çıkıp çıkmamasından etkilenmiyor.
 *
 * İkisinin de ödülü KOMUTLA alınıyor (`CLAIM_BUBBLE`, `CLAIM_QUEST`; lig
 * günlüğüne giriyor). İlk sürümde görev ödülü kendiliğinden ödeniyordu:
 * hiçbir şey yapmayan oyuncu "kasada biriktir", "payını koru" ödüllerini
 * topluyor ve denge sınavındaki savunmasız yavaş oyuncu baskında artık
 * düşmüyordu. Sistem dikkati ödüllendirmeli, beklemeyi değil.
 */

export function bubblesEnabled(state: GameState): boolean {
  return state.flags.bubbles !== false;
}

export function questsEnabled(state: GameState): boolean {
  return state.flags.quests !== false;
}

function dice(state: GameState, base: number, salt: number): ReturnType<typeof createRng> {
  return createRng(((state.meta.seed ^ base) ^ Math.imul(salt, 0x9e3779b1)) >>> 0);
}

function rangeFrom(die: ReturnType<typeof createRng>, [min, max]: readonly [number, number]): number {
  return min + Math.floor(nextFloat(die) * (max - min + 1));
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function clampAmount(raw: number, min: number, max: number): number {
  return roundTo(Math.min(max, Math.max(min, raw)), 1000);
}

/** Oyuncunun mağazaları, kimliğe göre sıralı (tekrar ve kayıt sırasından bağımsız). */
function playerOutlets(state: GameState): GameState['buildings'][string][] {
  return Object.values(state.buildings)
    .filter((building) => building.companyId === state.playerCompanyId && BUILDING_BY_ID[building.defId]?.role === 'outlet')
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// ------------------------------------------------------------ balon

/** İndirimli arsa adayları: oyuncunun binalarına yakın, alınabilir boş parseller. */
function parcelCandidates(state: GameState): number[] {
  const reach = BUBBLE_TIMING.parcelReach;
  const own: { x: number; y: number }[] = [];
  for (const building of Object.values(state.buildings)) {
    if (building.companyId !== state.playerCompanyId) continue;
    const tile = state.map.tiles[building.tileId];
    if (tile) own.push(tile);
  }
  if (own.length === 0) return [];
  const result: number[] = [];
  for (const tile of state.map.tiles) {
    if (tile.kind !== 'plot' || tile.ownerId || tile.structureId || tile.buildingId) continue;
    if (purchaseBlocker(state, tile.id)) continue;
    if (own.some((o) => Math.abs(o.x - tile.x) + Math.abs(o.y - tile.y) <= reach)) result.push(tile.id);
  }
  return result;
}

/** Balonu bir yere bağla; uygun yer yoksa null (o tür bu sefer çıkmaz). */
function placeBubble(state: GameState, def: BubbleDef, die: ReturnType<typeof createRng>): BubbleState | null {
  const day = state.time.day;
  const untilDay = day + BUBBLE_TIMING.lifetimeDays - 1;
  const { amountMin, amountMax } = BUBBLE_TIMING;
  if (def.anchor === 'outlet') {
    const outlets = playerOutlets(state);
    if (outlets.length === 0) return null;
    const outlet = outlets[Math.floor(nextFloat(die) * outlets.length)]!;
    const category = BUILDING_BY_ID[outlet.defId]?.category;
    const amount =
      def.reward.kind === 'cash' ? clampAmount(outlet.last.revenue * def.reward.days, amountMin, amountMax) : 0;
    return {
      kind: def.id,
      tileId: outlet.tileId,
      offeredDay: day,
      untilDay,
      amount,
      ...(category && CATEGORIES[category as CategoryId] ? { category: category as CategoryId } : {}),
    };
  }
  if (def.anchor === 'hq') {
    const hq = headquarters(state, state.playerCompanyId);
    if (!hq) return null;
    const days = def.reward.kind === 'cash' ? def.reward.days : 0;
    return {
      kind: def.id,
      tileId: hq.tileId,
      offeredDay: day,
      untilDay,
      amount: clampAmount(profitTrend(state) * days, amountMin, amountMax),
    };
  }
  const candidates = parcelCandidates(state);
  if (candidates.length === 0 || def.reward.kind !== 'parcel') return null;
  const tileId = candidates[Math.floor(nextFloat(die) * candidates.length)]!;
  const price = tilePrice(state, tileId, state.playerCompanyId);
  return {
    kind: def.id,
    tileId,
    offeredDay: day,
    untilDay,
    amount: roundTo(price * (1 - def.reward.discount), 1000),
  };
}

/** Günlük balon adımı: süresi dolanı kaldır, takvimi gelince yenisini çıkar. */
function parcelStillFree(state: GameState, tileId: number): boolean {
  const tile = state.map.tiles[tileId];
  return Boolean(tile && !tile.structureId && !tile.buildingId && purchaseBlocker(state, tileId) === null);
}

export function runBubbleTick(state: GameState): void {
  if (!bubblesEnabled(state)) {
    delete state.bubble;
    return;
  }
  const day = state.time.day;
  if (state.bubble && day > state.bubble.untilDay) delete state.bubble;
  // İndirimli arsa elden çıktıysa (yapı dikildi, satıldı) balon da sönüyor.
  if (state.bubble && BUBBLE_BY_ID[state.bubble.kind].reward.kind === 'parcel' && !parcelStillFree(state, state.bubble.tileId)) {
    delete state.bubble;
  }
  if (state.bubble || state.gameOver) return;

  state.nextBubbleDay ??= BUBBLE_TIMING.firstDay + Math.floor(nextFloat(dice(state, 0x2b0b1e5, 0)) * 8);
  if (day < state.nextBubbleDay) return;

  const die = dice(state, 0x2b0b1e5, day);
  // Uygun türler: bağlanacak yeri olanlar. Sıra içerikten — belirlenimci.
  const options: { def: BubbleDef; bubble: BubbleState }[] = [];
  BUBBLES.forEach((def, index) => {
    const bubble = placeBubble(state, def, dice(state, 0x2b0b1e5 ^ 0x5bd1e995, day * 16 + index));
    if (bubble) options.push({ def, bubble });
  });
  if (options.length === 0) {
    state.nextBubbleDay = day + 5;
    return;
  }
  const picked = pickWeighted(die, options, (option) => option.def.weight);
  state.bubble = picked.bubble;
  state.bubblesShown = (state.bubblesShown ?? 0) + 1;
  state.nextBubbleDay = picked.bubble.untilDay + 1 + rangeFrom(die, BUBBLE_TIMING.gapDays);
}

/** Uzaktaki şehirde balona dokunan yok: kendiliğinden söner. */
export function settleBubbleAway(state: GameState): void {
  delete state.bubble;
}

/** Balonun gösterilecek ödül cümlesi. */
export function bubbleText(bubble: BubbleState): string {
  const def = BUBBLE_BY_ID[bubble.kind];
  return fillTemplate(def.caught, {
    amount: formatMoney(bubble.amount),
    category: bubble.category ? CATEGORIES[bubble.category].name : '',
    days: def.reward.kind === 'boost' ? def.reward.days : 0,
  });
}

export function claimBubble(state: GameState): CommandResult {
  const bubble = state.bubble;
  if (!bubble || !bubblesEnabled(state)) return { ok: false, reason: tc('core.bubbles.none') };
  const player = state.companies[state.playerCompanyId];
  if (!player) return { ok: false, reason: tc('core.bubbles.none') };
  const def = BUBBLE_BY_ID[bubble.kind];
  const day = state.time.day;

  if (def.reward.kind === 'parcel') {
    // Balonun ömründe şehir parsele yapı dikmiş olabilir; `purchaseBlocker`
    // yapıya bakmıyor (normal alımda yapının devir bedeli ayrıca ödeniyor).
    // İndirim boş arsanın fiyatıydı: yapılı parsel indirimle verilmiyor (Codex #63).
    const blocker =
      purchaseBlocker(state, bubble.tileId) ?? (state.map.tiles[bubble.tileId]?.structureId ? tc('core.bubbles.parcelGone') : null);
    if (blocker) {
      delete state.bubble;
      return { ok: false, reason: blocker };
    }
    if (player.cash < bubble.amount) {
      return { ok: false, reason: tc('core.bubbles.noCash', { price: formatMoney(bubble.amount) }) };
    }
    player.cash -= bubble.amount;
    state.map.tiles[bubble.tileId]!.ownerId = player.id;
  } else if (def.reward.kind === 'cash') {
    player.cash += bubble.amount;
  } else {
    // Yakalama gün arasında: etki yarından başlıyor ve tam `days` gün sürüyor (kartla aynı kural).
    (player.boosts ??= []).push({
      target: 'attraction',
      multiplier: def.reward.multiplier,
      untilDay: day + def.reward.days,
      ...(bubble.category ? { category: bubble.category } : {}),
      cardId: `bubble:${def.id}`,
    });
  }
  state.bubblesCaught = (state.bubblesCaught ?? 0) + 1;
  delete state.bubble;
  return { ok: true };
}

// ------------------------------------------------------------ görev panosu

function playerRevenue(state: GameState): number {
  return state.companies[state.playerCompanyId]?.today.revenue ?? 0;
}

function ownedTiles(state: GameState): number {
  let count = 0;
  for (const tile of state.map.tiles) if (tile.ownerId === state.playerCompanyId) count++;
  return count;
}

function builtSince(state: GameState, startDay: number, outlet: boolean): number {
  let count = 0;
  for (const building of Object.values(state.buildings)) {
    if (building.companyId !== state.playerCompanyId || building.builtDay < startDay) continue;
    if ((BUILDING_BY_ID[building.defId]?.role === 'outlet') === outlet) count++;
  }
  return count;
}

/** Net değerde hemen öndeki, ulaşılabilir rakip. */
function rivalAhead(state: GameState, player: CompanyState): CompanyState | null {
  let best: CompanyState | null = null;
  for (const company of Object.values(state.companies)) {
    if (company.isPlayer || company.netWorth <= player.netWorth) continue;
    if (!best || company.netWorth < best.netWorth || (company.netWorth === best.netWorth && company.id < best.id)) best = company;
  }
  if (!best || best.netWorth <= 0) return null;
  return (best.netWorth - player.netWorth) / best.netWorth <= QUEST_TIMING.overtakeGap ? best : null;
}

/** Bir görevi bugünkü şehirden kur; bu ay anlamı yoksa null. */
function makeQuest(state: GameState, def: QuestDef, endDay: number): QuestState | null {
  const player = state.companies[state.playerCompanyId];
  if (!player) return null;
  const trend = profitTrend(state);
  const reward = clampAmount(trend * def.rewardDays, QUEST_TIMING.rewardMin, QUEST_TIMING.rewardMax);
  const outlets = playerOutlets(state).length;
  switch (def.id) {
    case 'outlets':
      return { defId: def.id, base: 0, target: outlets < 4 ? 1 : 2, reward };
    case 'producer':
      return outlets > 0 ? { defId: def.id, base: 0, target: 1, reward } : null;
    case 'parcels':
      return { defId: def.id, base: ownedTiles(state), target: 2, reward };
    case 'share': {
      let category: CategoryId | null = null;
      for (const id of CONSUMER_CATEGORIES) {
        const value = player.marketShare[id] ?? 0;
        if (value <= 0 || value > QUEST_TIMING.shareCap - QUEST_TIMING.shareStep) continue;
        if (category === null || value > (player.marketShare[category] ?? 0)) category = id;
      }
      if (!category) return null;
      const target = Math.ceil(((player.marketShare[category] ?? 0) + QUEST_TIMING.shareStep) * 100) / 100;
      return { defId: def.id, base: 0, target, reward, category };
    }
    case 'revenue': {
      const revenue = playerRevenue(state);
      if (revenue <= 0) return null;
      return { defId: def.id, base: 0, target: roundTo(revenue * QUEST_TIMING.revenueStep, 1000), reward };
    }
    case 'cash': {
      if (trend <= 0) return null;
      return { defId: def.id, base: 0, target: roundTo(player.cash + trend * QUEST_TIMING.cashDays, 1000), reward };
    }
    case 'overtake': {
      const rival = rivalAhead(state, player);
      return rival ? { defId: def.id, base: 0, target: 1, reward, rivalId: rival.id, rivalName: rival.name } : null;
    }
    case 'bubble': {
      if (!bubblesEnabled(state)) return null;
      // Ay içinde gerçekten bir balon çıkacaksa (takvim belli).
      const next = state.bubble ? state.time.day : (state.nextBubbleDay ?? Number.POSITIVE_INFINITY);
      if (next > endDay - 3) return null;
      return { defId: def.id, base: state.bubblesCaught ?? 0, target: 1, reward };
    }
  }
}

/** Görevin bugünkü değeri (hedefle aynı birimde). */
export function questValue(state: GameState, board: QuestBoard, quest: QuestState): number {
  const player = state.companies[state.playerCompanyId];
  if (!player) return 0;
  switch (quest.defId) {
    case 'outlets':
      return builtSince(state, board.startDay, true);
    case 'producer':
      return builtSince(state, board.startDay, false);
    case 'parcels':
      return ownedTiles(state) - quest.base;
    case 'share':
      return quest.category ? (player.marketShare[quest.category] ?? 0) : 0;
    case 'revenue':
      return playerRevenue(state);
    case 'cash':
      return player.cash;
    case 'overtake': {
      // Rakip oyundan çıktıysa (devralma, iflas) yarış bitti: geçilmiş sayılıyor.
      const rival = quest.rivalId ? state.companies[quest.rivalId] : undefined;
      return !rival || player.netWorth > rival.netWorth ? 1 : 0;
    }
    case 'bubble':
      return (state.bubblesCaught ?? 0) - quest.base;
  }
}

/** 0..1 ilerleme (çubuk için). */
export function questProgress(state: GameState, board: QuestBoard, quest: QuestState): number {
  if (quest.doneDay !== undefined) return 1;
  if (quest.defId === 'overtake') {
    const player = state.companies[state.playerCompanyId];
    const rival = quest.rivalId ? state.companies[quest.rivalId] : undefined;
    if (!player || !rival) return 1;
    return Math.max(0, Math.min(1, player.netWorth / Math.max(1, rival.netWorth)));
  }
  if (quest.target <= 0) return 1;
  return Math.max(0, Math.min(1, questValue(state, board, quest) / quest.target));
}

/** Panodaki satırın metni (etkin dilde). */
export function questTitle(state: GameState, quest: QuestState): string {
  const def = QUEST_BY_ID[quest.defId];
  const rival = quest.rivalId ? state.companies[quest.rivalId] : undefined;
  return fillTemplate(def.title, {
    n: quest.target,
    category: quest.category ? CATEGORIES[quest.category].name : '',
    target: Math.round(quest.target * 100),
    amount: formatMoney(quest.target),
    rival: rival?.name ?? quest.rivalName ?? '',
  });
}

function buildBoard(state: GameState): QuestBoard {
  const day = state.time.day;
  const endDay = nextMonthStart(day);
  const die = dice(state, 0x7a5c3e1d, day);
  const options: { def: QuestDef; quest: QuestState }[] = [];
  for (const def of QUESTS) {
    const quest = makeQuest(state, def, endDay);
    if (quest) options.push({ def, quest });
  }
  const items: QuestState[] = [];
  while (items.length < QUEST_TIMING.slots && options.length > 0) {
    const picked = pickWeighted(die, options, (option) => option.def.weight);
    items.push(picked.quest);
    options.splice(options.indexOf(picked), 1);
  }
  return { startDay: day, endDay, items };
}

function completeQuest(state: GameState, quest: QuestState): void {
  quest.doneDay = state.time.day;
  pushNews(
    state,
    'good',
    tc('core.quests.doneTitle', { title: questTitle(state, quest) }),
    tc('core.quests.doneBody', { amount: formatMoney(quest.reward) }),
  );
}

/** Tamamlanan görevin ödülü: nakit (ve pay görevinde marka). Ay bitince alınmayan ödül düşüyor. */
export function claimQuest(state: GameState, index: number): CommandResult {
  const quest = questsEnabled(state) ? state.quests?.items[index] : undefined;
  if (!quest) return { ok: false, reason: tc('core.quests.none') };
  if (quest.doneDay === undefined) return { ok: false, reason: tc('core.quests.notDone') };
  if (quest.claimed) return { ok: false, reason: tc('core.quests.claimed') };
  const player = state.companies[state.playerCompanyId];
  if (!player) return { ok: false, reason: tc('core.quests.none') };
  const def = QUEST_BY_ID[quest.defId];
  quest.claimed = true;
  player.cash += quest.reward;
  if (def.brand && quest.category) {
    player.brand[quest.category] = Math.min(1, (player.brand[quest.category] ?? 0) + def.brand);
  }
  state.questsDone = (state.questsDone ?? 0) + 1;
  return { ok: true };
}

/** Panoda alınmayı bekleyen ödül sayısı. */
export function questsReady(state: GameState): number {
  return state.quests?.items.filter((quest) => quest.doneDay !== undefined && !quest.claimed).length ?? 0;
}

/**
 * Günlük görev adımı — günün SONUNDA: pay, ciro ve net değer bugünün
 * defterinden okunuyor. Pano ay başında kuruluyor; tamamlanan görev
 * işaretleniyor, ödülü `CLAIM_QUEST` ile alınıyor.
 *
 * Şehir gününün (`simulateCityDay`) içinde değil, net değerin günlük
 * hesabından SONRA çağrılıyor (motorun günü ve holdingin bekleyen
 * şehirleri): geçme görevi ve panonun "hemen öndeki rakibi" bugünün net
 * değeriyle ölçülsün. Gün içinde ikinci bir hesap net değer geçmişine çift
 * örnek yazardı (Codex #63).
 */
export function runQuestTick(state: GameState): void {
  if (!questsEnabled(state)) {
    delete state.quests;
    return;
  }
  if (state.gameOver) return;
  const day = state.time.day;
  let board = state.quests;
  if (board && day >= board.endDay) board = undefined;
  if (!board) {
    if (day < QUEST_TIMING.firstDay || dayOfMonth(day) !== 1) {
      delete state.quests;
      return;
    }
    board = buildBoard(state);
    state.quests = board;
    return;
  }
  for (const quest of board.items) {
    if (quest.doneDay !== undefined) continue;
    if (questValue(state, board, quest) >= quest.target) completeQuest(state, quest);
  }
}
