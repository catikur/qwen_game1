import { BUILDING_BY_ID, GOOD_BY_ID } from '@capital/content';
import { formatMoney } from '../format';
import { tc } from '../i18n';
import { nextFloat } from '../rng';
import { pushNews } from '../news';
import { FREIGHT_SHARE, ownDepotRelief, reliefOf } from './supply';
import type { BuildingInstance, CommandResult, FreightDeal, FreightState, GameState } from '../types';

/**
 * Taşıma sözleşmeleri — lojistik bir iş kolu (Tur 56).
 *
 * Kamyonlar şehirde Tur 13'ten beri dolaşıyor ama hep kendi zincirini
 * taşıyordu; depo yalnızca kendi mağazanın maliyetini düşürüyordu. Nakliye
 * terminalinin filosu var: menzilindeki rakip mağazalarına da taşıyor.
 * Rakip mağazalarının dağıtımını terminale vermek için teklif getiriyor;
 * kabul edersen her sattığı birimden ücret alıyorsun.
 *
 * EKONOMİ. Terminal mağazanın perakende maliyetinden %35 siliyor. Kendi
 * mağazanda hepsi senin; sözleşmedeki rakip mağazasında %60'ı ücret olarak
 * sana, %40'ı rakibe kalıyor (`FREIGHT_SHARE`). Rakibin ödediği ücret onun
 * mal maliyetinde, senin cironda: para yaratılmıyor, el değiştiriyor. İki
 * taraf da kazanıyor, ama rakip senin kamyonunla ucuzluyor: rakibin
 * zincirine hizmet etmek onu güçlendiriyor. Ücret satışla büyüyor; rakip
 * büyüdükçe terminal de kazanıyor.
 *
 * Üç bilinçli sınır:
 *
 * - FİLO. Terminal başına en çok 16 mağaza (`fleet`). Şehrin bütün rakip
 *   mağazalarına hizmet etmek için birden çok terminal ve menzil gerekiyor:
 *   lojistik bir yer seçme oyunu olarak kalıyor.
 *
 * - TEKLİF RAKİPTEN GELİYOR. Oyuncu rakibin mağazasını seçip "sana
 *   taşıyorum" diyemiyor; teklif masaya gelir, kabul ya da ret. Reddedilen
 *   rakip bir süre yeniden teklif getirmiyor. Belediye sözleşmesindeki gibi
 *   reddin bedeli yok.
 *
 * - CAYMA BEDELİ. Kabul edilen sözleşmeyi bitirmek (ya da terminali yıkmak)
 *   rakibe günlük ücret tahmininin 20 katını ödetiyor. Rakibin mağazası
 *   kapanırsa, rakip devralınırsa ya da kendi deposunu kurarsa mağaza
 *   bedelsiz çıkıyor.
 */

export const FREIGHT = {
  /** İki teklif arasındaki en az gün. */
  offerCooldownDays: 12,
  /** Soğuma bittikten sonra günlük teklif olasılığı. */
  offerChance: 0.2,
  /** Teklifin masada kaldığı süre. */
  offerLifetimeDays: 20,
  /** Masada aynı anda en çok teklif. */
  maxOffers: 2,
  /** Sözleşmenin süresi. */
  durationDays: 120,
  /** Bir teklifte en az ve en çok mağaza. */
  minOutlets: 2,
  maxOutlets: 8,
  /** Reddeden rakip bu kadar gün yeniden teklif getirmiyor. */
  declineCooldownDays: 60,
  /** Cayma bedeli: günlük ücret tahmininin bu katı. */
  cancelPenaltyDays: 20,
} as const;

/** Oyuncunun terminalleri (filosu olan lojistik binaları), kimlik sırasıyla. */
export function freightTerminals(state: GameState, companyId = state.playerCompanyId): BuildingInstance[] {
  return Object.values(state.buildings)
    .filter((building) => building.companyId === companyId && (BUILDING_BY_ID[building.defId]?.fleet ?? 0) > 0)
    .sort((a, b) => a.tileId - b.tileId);
}

/** Terminalin filosunda süren sözleşmelerin tuttuğu kamyon sayısı. */
export function fleetUsed(state: GameState, terminalId: string): number {
  let used = 0;
  for (const deal of state.freight?.contracts ?? []) if (deal.terminalId === terminalId) used += deal.outletIds.length;
  return used;
}

/** Terminalin boştaki kamyonları: filo eksi sözleşmeler eksi masadaki teklifler. */
function fleetFree(state: GameState, terminal: BuildingInstance): number {
  const fleet = BUILDING_BY_ID[terminal.defId]?.fleet ?? 0;
  let held = fleetUsed(state, terminal.id);
  for (const offer of state.freight?.offers ?? []) if (offer.terminalId === terminal.id) held += offer.outletIds.length;
  return Math.max(0, fleet - held);
}

function distance(state: GameState, a: BuildingInstance, b: BuildingInstance): number {
  const ta = state.map.tiles[a.tileId];
  const tb = state.map.tiles[b.tileId];
  if (!ta || !tb) return Number.POSITIVE_INFINITY;
  return Math.abs(ta.x - tb.x) + Math.abs(ta.y - tb.y);
}

/**
 * Bir rakip mağazasının terminale günlük ücreti: dünkü satışından, terminalin
 * payıyla. Teklif bu tahminle geliyor; gerçek ücret her gün o günün satışı.
 */
export function freightFeeEstimate(outlet: BuildingInstance, terminalDefId: string): number {
  const def = BUILDING_BY_ID[terminalDefId];
  if (!def) return 0;
  return feeAt(outlet, reliefOf(def) * FREIGHT_SHARE);
}

function feeAt(outlet: BuildingInstance, rate: number): number {
  let fee = 0;
  for (const [goodId, units] of Object.entries(outlet.soldByGood ?? {})) fee += units * (GOOD_BY_ID[goodId]?.retailCost ?? 0) * rate;
  return fee;
}

/**
 * Mağazaların günlük ücret tahmininin toplamı. Mağaza düşünce tahmin kalan
 * mağazalardan yeniden: satışları farklı, sayıyla orantı cayma bedelini
 * şaşırtıyordu (Codex #86).
 */
function estimateFor(state: GameState, outletIds: readonly string[], rate: number): number {
  let total = 0;
  for (const id of outletIds) {
    const outlet = state.buildings[id];
    if (outlet) total += feeAt(outlet, rate);
  }
  return Math.round(total);
}

/** Bir mağaza bir sözleşmede ya da masadaki bir teklifte mi? */
function heldOutlets(state: GameState): Set<string> {
  const held = new Set<string>();
  for (const deal of state.freight?.contracts ?? []) for (const id of deal.outletIds) held.add(id);
  for (const deal of state.freight?.offers ?? []) for (const id of deal.outletIds) held.add(id);
  return held;
}

/**
 * Terminalin menzilindeki, taşınabilecek rakip mağazaları: kendi deposu
 * yok, başka sözleşmede ya da teklifte değil. Yakından uzağa.
 */
export function freightProspects(state: GameState, terminal: BuildingInstance): BuildingInstance[] {
  const def = BUILDING_BY_ID[terminal.defId];
  if (!def?.fleet) return [];
  const held = heldOutlets(state);
  return Object.values(state.buildings)
    .filter((outlet) => {
      if (outlet.companyId === state.playerCompanyId || held.has(outlet.id)) return false;
      if (BUILDING_BY_ID[outlet.defId]?.role !== 'outlet' || !state.companies[outlet.companyId]) return false;
      if (distance(state, terminal, outlet) > def.radius) return false;
      return ownDepotRelief(state, outlet) === 0;
    })
    .sort((a, b) => distance(state, terminal, a) - distance(state, terminal, b) || a.tileId - b.tileId);
}

/**
 * Bir parsele kurulacak terminalin taşıma potansiyeli (yapı menüsü): menzilde
 * taşınabilecek rakip mağazaları ve filo kadarının günlük ücret tahmini.
 * Teklif gelirse ve kabul edilirse; tahmin, söz değil.
 */
export function freightPotential(state: GameState, companyId: string, defId: string, tileId: number): { outlets: number; fee: number } {
  const def = BUILDING_BY_ID[defId];
  const tile = state.map.tiles[tileId];
  if (!def?.fleet || !tile) return { outlets: 0, fee: 0 };
  const held = heldOutlets(state);
  const fees: number[] = [];
  for (const outlet of Object.values(state.buildings)) {
    if (outlet.companyId === companyId || held.has(outlet.id)) continue;
    if (BUILDING_BY_ID[outlet.defId]?.role !== 'outlet' || !state.companies[outlet.companyId]) continue;
    const at = state.map.tiles[outlet.tileId];
    if (!at || Math.abs(at.x - tile.x) + Math.abs(at.y - tile.y) > def.radius) continue;
    if (ownDepotRelief(state, outlet) > 0) continue;
    fees.push(freightFeeEstimate(outlet, defId));
  }
  fees.sort((a, b) => b - a);
  return { outlets: fees.length, fee: fees.slice(0, def.fleet).reduce((sum, fee) => sum + fee, 0) };
}

function ensureFreight(state: GameState): FreightState {
  // Soğuma ilk teklifi bekletmesin (sonsuz değil: kayıt JSON).
  state.freight ??= { offers: [], contracts: [], nextId: 1, lastOfferDay: -FREIGHT.offerCooldownDays, declined: {}, earnedTotal: 0 };
  return state.freight;
}

/**
 * Masaya bir teklif: her terminal için menzilindeki rakip mağazaları
 * şirket şirket toplanıyor; günlük ücreti en büyük (rakip, terminal) çifti
 * kazanıyor. Mağazalar terminale yakından uzağa, boştaki kamyon kadar.
 */
function generateOffer(state: GameState): FreightDeal | null {
  const freight = ensureFreight(state);
  const day = state.time.day;
  let best: { companyId: string; terminal: BuildingInstance; outlets: BuildingInstance[]; estimate: number } | null = null;

  for (const terminal of freightTerminals(state)) {
    const free = Math.min(fleetFree(state, terminal), FREIGHT.maxOutlets);
    if (free < FREIGHT.minOutlets) continue;
    const byCompany = new Map<string, BuildingInstance[]>();
    for (const outlet of freightProspects(state, terminal)) {
      const declined = freight.declined[outlet.companyId];
      if (declined !== undefined && day - declined < FREIGHT.declineCooldownDays) continue;
      const list = byCompany.get(outlet.companyId);
      if (list) list.push(outlet);
      else byCompany.set(outlet.companyId, [outlet]);
    }
    for (const companyId of [...byCompany.keys()].sort()) {
      const outlets = byCompany.get(companyId)!.slice(0, free);
      if (outlets.length < FREIGHT.minOutlets) continue;
      const estimate = outlets.reduce((sum, outlet) => sum + freightFeeEstimate(outlet, terminal.defId), 0);
      if (estimate <= 0) continue;
      if (!best || estimate > best.estimate) best = { companyId, terminal, outlets, estimate };
    }
  }
  if (!best) return null;

  return {
    id: `fr${freight.nextId++}`,
    companyId: best.companyId,
    terminalId: best.terminal.id,
    outletIds: best.outlets.map((outlet) => outlet.id),
    durationDays: FREIGHT.durationDays,
    offeredDay: day,
    estimate: Math.round(best.estimate),
    rate: reliefOf(BUILDING_BY_ID[best.terminal.defId]!) * FREIGHT_SHARE,
  };
}

/** Sözleşmenin geçerli mağazaları: hâlâ müşterinin, menzilde, kendi deposu yok. */
function liveOutlets(state: GameState, deal: FreightDeal, terminal: BuildingInstance): string[] {
  const radius = BUILDING_BY_ID[terminal.defId]?.radius ?? 0;
  return deal.outletIds.filter((id) => {
    const outlet = state.buildings[id];
    if (!outlet || outlet.companyId !== deal.companyId) return false;
    if (distance(state, terminal, outlet) > radius) return false;
    return ownDepotRelief(state, outlet) === 0;
  });
}

function companyName(state: GameState, companyId: string): string {
  return state.companies[companyId]?.name ?? companyId;
}

/**
 * Sözleşmenin bugün hâlâ geçerli mağazaları. Terminal oyuncunun değilse
 * (yıkıldı) menzil sorulmuyor: müşterinin hâlâ elindeki mağazalar.
 */
function survivingOutlets(state: GameState, deal: FreightDeal): string[] {
  const terminal = state.buildings[deal.terminalId];
  if (terminal?.companyId === state.playerCompanyId) return liveOutlets(state, deal, terminal);
  return deal.outletIds.filter((id) => state.buildings[id]?.companyId === deal.companyId);
}

/**
 * Cayma bedeli: oyuncudan müşteriye, günlük tahminin `cancelPenaltyDays`
 * katı. Bugünkü mağazalardan: taşıma adımından sonra kapanan ya da el
 * değiştiren mağaza sayılmıyor; panelin yazdığı ve kesilen aynı (Codex #86).
 */
export function freightPenalty(state: GameState, deal: FreightDeal): number {
  const outlets = survivingOutlets(state, deal);
  if (outlets.length === 0) return 0;
  const estimate = outlets.length === deal.outletIds.length ? deal.estimate : estimateFor(state, outlets, deal.rate);
  return Math.round(estimate * FREIGHT.cancelPenaltyDays);
}

function payPenalty(state: GameState, deal: FreightDeal): number {
  const penalty = freightPenalty(state, deal);
  const player = state.companies[state.playerCompanyId];
  const client = state.companies[deal.companyId];
  if (player) player.cash -= penalty;
  if (client) client.cash += penalty;
  return penalty;
}

export function acceptFreight(state: GameState, offerId: string): CommandResult {
  const freight = state.freight;
  const index = freight?.offers.findIndex((offer) => offer.id === offerId) ?? -1;
  if (!freight || index < 0) return { ok: false, reason: tc('core.freight.noOffer') };
  const offer = freight.offers[index]!;
  const terminal = state.buildings[offer.terminalId];
  if (!terminal || terminal.companyId !== state.playerCompanyId) {
    freight.offers.splice(index, 1);
    return { ok: false, reason: tc('core.freight.noTerminal') };
  }
  // Teklif masada beklerken mağaza kapanmış ya da el değiştirmiş olabilir.
  const outlets = liveOutlets(state, offer, terminal);
  const fleet = BUILDING_BY_ID[terminal.defId]?.fleet ?? 0;
  if (outlets.length === 0) {
    freight.offers.splice(index, 1);
    return { ok: false, reason: tc('core.freight.stale') };
  }
  if (fleetUsed(state, terminal.id) + outlets.length > fleet) return { ok: false, reason: tc('core.freight.fleetFull') };

  freight.offers.splice(index, 1);
  freight.contracts.push({
    ...offer,
    outletIds: outlets,
    estimate: outlets.length === offer.outletIds.length ? offer.estimate : estimateFor(state, outlets, offer.rate),
    acceptedDay: state.time.day,
    endDay: state.time.day + offer.durationDays,
    lastFee: 0,
    earned: 0,
  });
  freight.lastOfferDay = state.time.day;
  return { ok: true };
}

export function declineFreight(state: GameState, offerId: string): CommandResult {
  const freight = state.freight;
  const index = freight?.offers.findIndex((offer) => offer.id === offerId) ?? -1;
  if (!freight || index < 0) return { ok: false, reason: tc('core.freight.noOffer') };
  const [offer] = freight.offers.splice(index, 1);
  freight.declined[offer!.companyId] = state.time.day;
  return { ok: true };
}

export function cancelFreight(state: GameState, contractId: string): CommandResult {
  const freight = state.freight;
  const index = freight?.contracts.findIndex((deal) => deal.id === contractId) ?? -1;
  if (!freight || index < 0) return { ok: false, reason: tc('core.freight.noContract') };
  const [deal] = freight.contracts.splice(index, 1);
  // Gün içinde geçersizleşmiş sözleşme (müşteri devralındı, mağazası kalmadı):
  // taşıma adımı onu yarın bedelsiz bitirecekti; şimdi de bedelsiz (Codex #86).
  // Terminali yıkılmışsa sözü bozan oyuncu: bedel aşağıda, adımdaki gibi.
  const terminal = state.buildings[deal!.terminalId];
  if (terminal?.companyId === state.playerCompanyId && (!state.companies[deal!.companyId] || liveOutlets(state, deal!, terminal).length === 0)) {
    pushNews(
      state,
      'neutral',
      tc('core.freight.endedTitle'),
      tc('core.freight.lostBody', { company: companyName(state, deal!.companyId), earned: formatMoney(deal!.earned ?? 0) }),
      { companyId: deal!.companyId },
    );
    return { ok: true };
  }
  const penalty = payPenalty(state, deal!);
  pushNews(
    state,
    'bad',
    tc('core.freight.cancelledTitle'),
    tc('core.freight.cancelledBody', { company: companyName(state, deal!.companyId), penalty: formatMoney(penalty) }),
    { companyId: deal!.companyId },
  );
  return { ok: true };
}

/**
 * Günün sonu (pazardan sonra): bugünkü ücret deftere, bozulan ve biten
 * sözleşmeler, masadaki tekliflerin süresi, yeni teklif.
 *
 * Terminali olmayan oyunda zar atılmıyor: taşıma, terminal kurmayan bir
 * koşunun hiçbir sayısını değiştirmiyor.
 */
export function runFreightTick(state: GameState): void {
  const freight = state.freight;
  const day = state.time.day;

  if (freight) {
    const kept: FreightDeal[] = [];
    for (const deal of freight.contracts) {
      const fee = deal.lastFee ?? 0;
      deal.earned = (deal.earned ?? 0) + fee;
      freight.earnedTotal += fee;
      const client = state.companies[deal.companyId];
      const terminal = state.buildings[deal.terminalId];
      // Terminalin toplamı ayrı: sözleşme bitince panelden silinmesin (Codex #86).
      if (terminal) terminal.freightEarned = (terminal.freightEarned ?? 0) + fee;
      const name = companyName(state, deal.companyId);

      if (!terminal || terminal.companyId !== state.playerCompanyId) {
        // Terminal yıkıldı ya da satıldı: sözü bozan oyuncu.
        const penalty = payPenalty(state, deal);
        pushNews(state, 'bad', tc('core.freight.brokenTitle'), tc('core.freight.brokenBody', { company: name, penalty: formatMoney(penalty) }), {
          companyId: deal.companyId,
        });
        continue;
      }
      const outlets = client ? liveOutlets(state, deal, terminal) : [];
      if (outlets.length === 0) {
        pushNews(state, 'neutral', tc('core.freight.endedTitle'), tc('core.freight.lostBody', { company: name, earned: formatMoney(deal.earned) }), {
          companyId: deal.companyId,
          tileId: terminal.tileId,
        });
        continue;
      }
      if (outlets.length < deal.outletIds.length) {
        deal.estimate = estimateFor(state, outlets, deal.rate);
        deal.outletIds = outlets;
      }
      if (day >= (deal.endDay ?? day)) {
        pushNews(
          state,
          'good',
          tc('core.freight.endedTitle'),
          tc('core.freight.endedBody', { company: name, days: deal.durationDays, earned: formatMoney(deal.earned) }),
          { companyId: deal.companyId, tileId: terminal.tileId },
        );
        continue;
      }
      kept.push(deal);
    }
    freight.contracts = kept;

    // Masadaki teklifler sessizce düşüyor; terminali gidenler de. Müşterisi
    // devralınan ya da mağazası kalmayan teklif de: filoyu ve gündemi
    // tutmasın. Mağazası azalan teklif kalanlarla (Codex #86).
    freight.offers = freight.offers.filter((offer) => {
      const terminal = state.buildings[offer.terminalId];
      if (day >= offer.offeredDay + FREIGHT.offerLifetimeDays || terminal?.companyId !== state.playerCompanyId) return false;
      const outlets = state.companies[offer.companyId] ? liveOutlets(state, offer, terminal) : [];
      if (outlets.length === 0) return false;
      if (outlets.length < offer.outletIds.length) {
        offer.outletIds = outlets;
        offer.estimate = estimateFor(state, outlets, offer.rate);
      }
      return true;
    });
  }

  // ---- Yeni teklif ----
  const terminals = freightTerminals(state);
  if (terminals.length === 0) return;
  if (!terminals.some((terminal) => fleetFree(state, terminal) >= FREIGHT.minOutlets)) return;
  const current = ensureFreight(state);
  if (current.offers.length >= FREIGHT.maxOffers) return;
  if (day - current.lastOfferDay < FREIGHT.offerCooldownDays) return;
  if (nextFloat(state.rng) > FREIGHT.offerChance) return;

  const offer = generateOffer(state);
  if (!offer) return;
  current.offers.push(offer);
  current.lastOfferDay = day;
  const terminal = state.buildings[offer.terminalId]!;
  pushNews(
    state,
    'neutral',
    tc('core.freight.offerTitle', { company: companyName(state, offer.companyId) }),
    tc('core.freight.offerBody', {
      company: companyName(state, offer.companyId),
      count: offer.outletIds.length,
      fee: formatMoney(offer.estimate),
      days: offer.durationDays,
      lifetime: FREIGHT.offerLifetimeDays,
    }),
    { companyId: offer.companyId, tileId: terminal.tileId },
  );
}
