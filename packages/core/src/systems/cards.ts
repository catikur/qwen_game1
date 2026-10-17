import { BUILDING_BY_ID, CARDS, CARD_BY_ID, CARD_TIMING, CATEGORIES, CONSUMER_CATEGORIES, fillTemplate } from '@capital/content';
import type { CardBoostTarget, CardChoiceDef, CardDef, CardEffect, CategoryId } from '@capital/content';
import { pushNews } from '../news';
import { tc } from '../i18n';
import { rivalProfile } from '../profiles';
import { createRng, nextFloat, pickWeighted } from '../rng';
import { laborEnabled } from './labor';
import { formatMoney } from '../selectors';
import type { CardState, CommandResult, CompanyState, GameState } from '../types';

/**
 * Karar kartları (Tur 37b) — içerik ve gerekçe `@capital/content`
 * stories.ts'te.
 *
 * Kurallar sendika talebiyle aynı kalıpta: masaya bir şey gelir, süre
 * işler, oyuncu komutla cevap verir (`CHOOSE_CARD`, lig günlüğüne girer),
 * süre dolarsa kartın `fallback`'i ("hiçbir şey yapma") uygulanır.
 */

export function cardsEnabled(state: GameState): boolean {
  return state.flags.cards !== false && state.flags.randomEvents !== false;
}

/**
 * Kart zarı DIŞSAL — kriz ve olay takvimiyle aynı ilke: tohumdan ve
 * günden. Hangi kartın geleceği oyuncunun durumuna (mağaza sayısı, en
 * güçlü kategori) bakıyor ama zamanı ve şansı değil.
 */
function cardDice(state: GameState, salt: number): ReturnType<typeof createRng> {
  return createRng(((state.meta.seed ^ 0x51ed270b) ^ Math.imul(salt, 0x9e3779b1)) >>> 0);
}

function rangeFrom(dice: ReturnType<typeof createRng>, [min, max]: readonly [number, number]): number {
  return min + Math.floor(nextFloat(dice) * (max - min + 1));
}

/** Oyuncunun günlük kâr eğilimi: bina eğilimlerinin toplamı. */
function profitTrend(state: GameState): number {
  let total = 0;
  for (const building of Object.values(state.buildings)) {
    if (building.companyId !== state.playerCompanyId) continue;
    total += building.profitTrend ?? building.last.profit;
  }
  return total;
}

/** Kartın tutarı: kâr eğiliminin katı, taban ve tavanla, bine yuvarlı. */
export function cardAmount(state: GameState): number {
  const raw = Math.max(0, profitTrend(state)) * CARD_TIMING.amountDays;
  const clamped = Math.min(CARD_TIMING.amountMax, Math.max(CARD_TIMING.amountMin, raw));
  return Math.round(clamped / 1000) * 1000;
}

interface PlayerShape {
  outlets: number;
  buildings: number;
  topCategory: CategoryId | null;
}

function playerShape(state: GameState): PlayerShape {
  const revenue = new Map<CategoryId, number>();
  let outlets = 0;
  let buildings = 0;
  for (const building of Object.values(state.buildings)) {
    if (building.companyId !== state.playerCompanyId) continue;
    buildings++;
    const def = BUILDING_BY_ID[building.defId];
    if (def?.role !== 'outlet') continue;
    outlets++;
    revenue.set(def.category, (revenue.get(def.category) ?? 0) + building.last.revenue);
  }
  // Sıra içerikten (CONSUMER_CATEGORIES): eşit gelirde de belirlenimci.
  let topCategory: CategoryId | null = null;
  for (const category of CONSUMER_CATEGORIES) {
    if (!revenue.has(category)) continue;
    if (topCategory === null || revenue.get(category)! > revenue.get(topCategory)!) topCategory = category;
  }
  return { outlets, buildings, topCategory };
}

/** Kartın rakip yüzü: net değeri en büyük, profili olan rakip. */
function strongestRival(state: GameState): CompanyState | null {
  let best: CompanyState | null = null;
  for (const company of Object.values(state.companies)) {
    if (company.isPlayer || !rivalProfile(state, company.profileId)) continue;
    if (!best || company.netWorth > best.netWorth) best = company;
  }
  return best;
}

function eligible(state: GameState, def: CardDef, shape: PlayerShape, rival: CompanyState | null): boolean {
  const need = def.requires;
  if (need.outlets !== undefined && shape.outlets < need.outlets) return false;
  if (need.buildings !== undefined && shape.buildings < need.buildings) return false;
  if (need.category && !shape.topCategory) return false;
  if (need.rival && !rival) return false;
  if (need.pressure !== undefined) {
    const pressure = state.companies[state.playerCompanyId]?.labor?.pressure ?? 0;
    if (!laborEnabled(state) || pressure < need.pressure) return false;
  }
  return true;
}

/** Kart metinlerinin yer tutucuları: kategori, rakip ve CEO adı. */
export function cardParams(state: GameState, card: CardState): Record<string, string> {
  const params: Record<string, string> = {};
  if (card.category) params['category'] = CATEGORIES[card.category].name;
  const rival = card.rivalId ? state.companies[card.rivalId] : undefined;
  if (rival) {
    params['rival'] = rival.name;
    params['ceo'] = rivalProfile(state, rival.profileId)?.ceoName ?? rival.name;
  }
  return params;
}

/** Kartın bir seçeneği uygulanınca nakdin değişimi (gösterim ve test için). */
export function cashEffect(card: CardState, effects: readonly CardEffect[]): number {
  let total = 0;
  for (const effect of effects) if (effect.kind === 'cash') total += card.amount * effect.times;
  return total;
}

/** Günlük kart adımı. Sözleşmeden sonra, işgücünden ÖNCE: sendika etkisi aynı gün otursun. */
export function runCardTick(state: GameState): void {
  const day = state.time.day;
  const player = state.companies[state.playerCompanyId];
  if (player?.boosts) {
    player.boosts = player.boosts.filter((boost) => boost.untilDay >= day);
    if (player.boosts.length === 0) delete player.boosts;
  }
  if (!cardsEnabled(state)) {
    // Kapatılan sistem masada kart bırakmasın.
    delete state.card;
    return;
  }

  const card = state.card;
  if (card) {
    if (day > card.deadlineDay) resolveCard(state, card, CARD_BY_ID[card.defId]?.fallback ?? '', 'expired');
    return;
  }

  state.nextCardDay ??= CARD_TIMING.firstDay + Math.floor(nextFloat(cardDice(state, 1)) * 15);
  if (day < state.nextCardDay || !player) return;

  const shape = playerShape(state);
  const rival = strongestRival(state);
  const recent = new Set(state.recentCards ?? []);
  const options = CARDS.filter((def) => !recent.has(def.id) && eligible(state, def, shape, rival));
  if (options.length === 0) {
    // Erken oyunda uygun kart yoksa bir hafta sonra yeniden bak.
    state.nextCardDay = day + 7;
    return;
  }
  const def = pickWeighted(cardDice(state, day), options, (option) => option.weight);
  state.card = {
    defId: def.id,
    offeredDay: day,
    deadlineDay: day + CARD_TIMING.lifetimeDays,
    amount: cardAmount(state),
    ...(def.requires.category && shape.topCategory ? { category: shape.topCategory } : {}),
    ...(def.requires.rival && rival ? { rivalId: rival.id } : {}),
  };
}

/**
 * `firstDay`: süreli etkinin ilk etkili günü. Oyuncu kartı (ve uzaktaki
 * şehirde yerel müdür) gün ARASINDA seçiyor: bugünün pazarı kapandı, etki
 * yarından başlıyor. Süresi dolan kart ise günün adımında, pazardan önce
 * kapanıyor ve bugünü de sayıyor. İkisinde de etki tam `days` pazar günü
 * sürüyor (Codex #62: seçilen kartta bir gün eksik kalıyordu).
 */
function applyEffects(state: GameState, card: CardState, effects: readonly CardEffect[], firstDay: number): void {
  const player = state.companies[state.playerCompanyId];
  if (!player) return;
  for (const effect of effects) {
    if (effect.kind === 'cash') {
      player.cash += card.amount * effect.times;
    } else if (effect.kind === 'boost') {
      (player.boosts ??= []).push({
        target: effect.target,
        multiplier: effect.multiplier,
        untilDay: firstDay + effect.days - 1,
        ...(effect.category && card.category ? { category: card.category } : {}),
        cardId: card.defId,
      });
    } else if (effect.kind === 'pressure' && laborEnabled(state) && player.labor) {
      player.labor.pressure = Math.max(0, Math.min(1, player.labor.pressure + effect.delta));
    }
  }
}

/** Bir seçeneğin şansı tuttu mu? Zar dışsal: kart, gün ve seçenek. */
function rolled(state: GameState, card: CardState, choice: CardChoiceDef): boolean {
  if (choice.odds === undefined) return true;
  let hash = card.offeredDay * 31 + state.time.day;
  for (let i = 0; i < choice.id.length; i++) hash = Math.imul(hash ^ choice.id.charCodeAt(i), 0x01000193) >>> 0;
  return nextFloat(cardDice(state, hash)) < choice.odds;
}

/** `chosen`: oyuncu seçti · `expired`: süre doldu · `away`: uzaktaki şehirde yerel müdür. */
type Resolution = 'chosen' | 'expired' | 'away';

function resolveCard(state: GameState, card: CardState, choiceId: string, how: Resolution): void {
  const def = CARD_BY_ID[card.defId];
  const choice = def?.choices.find((option) => option.id === choiceId);
  delete state.card;
  const day = state.time.day;
  state.recentCards = [card.defId, ...(state.recentCards ?? [])].slice(0, CARD_TIMING.memory);
  state.nextCardDay = day + rangeFrom(cardDice(state, day ^ 0x7f4a7c15), CARD_TIMING.gapDays);
  if (!def || !choice) return;

  const success = rolled(state, card, choice);
  const effects = success ? choice.effects : (choice.fail ?? []);
  applyEffects(state, card, effects, how === 'expired' ? day : day + 1);

  const params = cardParams(state, card);
  const text = fillTemplate(success ? choice.result : (choice.failResult ?? choice.result), params);
  const cash = cashEffect(card, effects);
  const parts = [text];
  if (cash !== 0) parts.push(tc(cash < 0 ? 'core.cards.paid' : 'core.cards.earned', { amount: formatMoney(Math.abs(cash)) }));
  if (how !== 'chosen') parts.push(tc(how === 'away' ? 'core.cards.away' : 'core.cards.expired', { choice: choice.label }));
  const tone = !success ? 'bad' : how === 'chosen' ? 'good' : 'neutral';
  pushNews(state, tone, fillTemplate(def.title, params), parts.join(' '), card.rivalId);
}

/** Oyuncunun kart seçimi (`CHOOSE_CARD`). */
export function chooseCard(state: GameState, choiceId: string): CommandResult {
  if (!cardsEnabled(state)) return { ok: false, reason: tc('core.cards.disabled') };
  const card = state.card;
  if (!card) return { ok: false, reason: tc('core.cards.none') };
  const def = CARD_BY_ID[card.defId];
  if (!def?.choices.some((choice) => choice.id === choiceId)) return { ok: false, reason: tc('core.cards.unknownChoice') };
  resolveCard(state, card, choiceId, 'chosen');
  return { ok: true };
}

/** Uzaktaki şehirde yerel müdür kartı beklemeden varsayılanla kapatır (sendika talebi gibi). */
export function settleCardAway(state: GameState): void {
  const card = state.card;
  if (card) resolveCard(state, card, CARD_BY_ID[card.defId]?.fallback ?? '', 'away');
}

/**
 * Kart çarpanı: şirketin süren kart etkilerinin çarpımı. Kategoriye özel
 * etki yalnızca o kategoride; kategorisiz soru (bakım, ücret) yalnızca
 * şirket geneli etkileri görür. Bayrak kapalıyken 1 (Codex #60 dersi:
 * kapatılan sistemin etkisi de kalkmalı).
 */
export function boostMultiplier(
  state: GameState,
  companyId: string,
  target: CardBoostTarget,
  category?: CategoryId,
): number {
  const boosts = state.companies[companyId]?.boosts;
  if (!boosts || !cardsEnabled(state)) return 1;
  const day = state.time.day;
  let multiplier = 1;
  for (const boost of boosts) {
    if (boost.target !== target || boost.untilDay < day) continue;
    if (boost.category && boost.category !== category) continue;
    multiplier *= boost.multiplier;
  }
  return multiplier;
}
