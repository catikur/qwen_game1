import { CREDIT, ERA_BY_ID, EVENTS } from '@capital/content';
import { nextGoal } from './systems/goals';
import { OFFER_LIFETIME_DAYS, contractProgress } from './systems/contracts';
import { sharesHeld, TOTAL_SHARES } from './systems/equity';
import { creditEnabled, overdraftLimit, overdraftOf } from './systems/credit';
import { laborEnabled } from './systems/labor';
import { formatMoney } from './selectors';
import type { GameState } from './types';

/**
 * Gündem — "şu an ne önemli?" sorusunun tek listesi.
 *
 * Çipler eskiden sabit bir sırayla diziliyordu (ihale, dönem, sözleşme,
 * olaylar) ve ekranın en değerli satırını aciliyet değil kod sırası
 * belirliyordu: bir baskın %40'a dayanırken en solda dönemin adı
 * duruyordu. Gündem her kalemi bir ACİLİYETLE (0-3) ve geri sayımla
 * işaretliyor; arayüz yalnızca sıralayıp çiziyor.
 *
 * Kalemler geleceğe de bakıyor: imara açılacak bölge, sıradaki hedef —
 * oyuncu ne olduğunu değil ne OLACAĞINI görmeli.
 */
export type AgendaKind =
  | 'raid'
  | 'bank'
  | 'union'
  | 'contractOffer'
  | 'contract'
  | 'auction'
  | 'unlock'
  | 'council'
  | 'league'
  | 'event'
  | 'era'
  | 'goal';

export interface AgendaItem {
  kind: AgendaKind;
  /** Kararlı anahtar (React ve testler için). */
  key: string;
  /** 0 bilgi · 1 dikkat · 2 karar zamanı · 3 acil. */
  urgency: number;
  /** Geri sayım; süresiz kalemlerde null. */
  daysLeft: number | null;
  label: string;
  tone: 'good' | 'bad' | 'neutral';
  /** İlgili yer — tıklanınca kamera oraya gider. */
  districtId?: number;
  tileId?: number;
  /** 0..1; ilerlemesi olan kalemlerde. */
  progress?: number;
}

/** İmar duyurusunun gündeme girdiği süre (gün) — haberle aynı pencere. */
const UNLOCK_HORIZON_DAYS = 30;

export function agenda(state: GameState): AgendaItem[] {
  const items: AgendaItem[] = [];
  const day = state.time.day;
  const player = state.companies[state.playerCompanyId];

  // Baskın: en büyük yabancı pay.
  if (player) {
    let top = 0;
    let raider: string | null = null;
    for (const company of Object.values(state.companies)) {
      if (company.isPlayer) continue;
      const count = sharesHeld(state, company.id, player.id);
      if (count > top) {
        top = count;
        raider = company.id;
      }
    }
    const fraction = top / TOTAL_SHARES;
    if (raider && fraction >= 0.1) {
      items.push({
        kind: 'raid',
        key: `raid:${raider}`,
        urgency: fraction >= 0.4 ? 3 : fraction >= 0.25 ? 2 : 1,
        daysLeft: null,
        label: `${state.companies[raider]!.name} payında %${Math.round(fraction * 100)}`,
        tone: 'bad',
      });
    }
  }

  // Sendika: masadaki talep, süren grev, dolmak üzere olan baskı.
  const labor = player?.labor;
  if (player && labor && laborEnabled(state)) {
    if (labor.strike) {
      items.push({
        kind: 'union',
        key: 'union:strike',
        urgency: 2,
        daysLeft: Math.max(0, labor.strike.endsOnDay - day + 1),
        label: 'Grev',
        tone: 'bad',
      });
    } else if (labor.demand) {
      const left = Math.max(0, labor.demand.deadlineDay - day);
      items.push({
        kind: 'union',
        key: 'union:demand',
        urgency: left <= 3 ? 3 : 2,
        daysLeft: left,
        label: `Sendika %${String(Math.round(labor.demand.raise * 1000) / 10).replace('.', ',')} zam istiyor`,
        tone: 'bad',
      });
    } else if (labor.pressure >= 0.75) {
      items.push({
        kind: 'union',
        key: 'union:pressure',
        urgency: 1,
        daysLeft: null,
        label: 'Sendika baskısı',
        tone: 'neutral',
        progress: labor.pressure,
      });
    }
  }

  // Banka: ihtar (acil) ya da kullanılan kredili hesap (dikkat).
  if (player && creditEnabled(state)) {
    const arrears = player.credit?.arrearsDays ?? 0;
    const overdraft = overdraftOf(player);
    if (arrears > 0) {
      items.push({
        kind: 'bank',
        key: 'bank:arrears',
        urgency: 3,
        daysLeft: Math.max(0, CREDIT.graceDays - arrears + 1),
        label: `Banka ihtarı · ${formatMoney(overdraft)} / ${formatMoney(overdraftLimit(player))}`,
        tone: 'bad',
      });
    } else if (overdraft > 0) {
      items.push({
        kind: 'bank',
        key: 'bank:overdraft',
        urgency: 1,
        daysLeft: null,
        label: `Kredili hesap ${formatMoney(overdraft)}`,
        tone: 'bad',
      });
    }
  }

  if (state.contractOffer) {
    const left = Math.max(0, state.contractOffer.offeredDay + OFFER_LIFETIME_DAYS - day);
    items.push({
      kind: 'contractOffer',
      key: 'contractOffer',
      urgency: left <= 5 ? 2 : 1,
      daysLeft: left,
      label: state.contractOffer.title,
      tone: 'neutral',
    });
  }

  if (state.contract) {
    const left = Math.max(0, state.contract.deadlineDay - day);
    const progress = contractProgress(state, state.contract);
    // Geride kalan sözleşme aciliyet kazanıyor: kalan süre oranı ile
    // kalan iş oranı kıyaslanıyor.
    const timeShare = left / Math.max(1, state.contract.durationDays);
    items.push({
      kind: 'contract',
      key: 'contract',
      urgency: progress < 1 - timeShare ? 2 : 1,
      daysLeft: left,
      label: state.contract.title,
      tone: 'neutral',
      progress,
    });
  }

  if (state.auction) {
    const left = Math.max(0, state.auction.endsOnDay - day);
    items.push({
      kind: 'auction',
      key: 'auction',
      urgency: left <= 3 ? 2 : 1,
      daysLeft: left,
      label: 'İhale',
      tone: 'neutral',
      tileId: state.auction.tileId,
    });
  }

  for (const district of state.districts) {
    if (district.opensOnDay === undefined || district.opensOnDay <= day) continue;
    const left = district.opensOnDay - day;
    if (left > UNLOCK_HORIZON_DAYS) continue;
    items.push({
      kind: 'unlock',
      key: `unlock:${district.id}`,
      urgency: left <= 7 ? 2 : 1,
      daysLeft: left,
      label: `${district.name} imara açılıyor`,
      tone: 'good',
      districtId: district.id,
    });
  }

  const league = state.league;
  if (league && league.finishedDay === undefined) {
    const left = Math.max(0, league.endDay - day);
    items.push({
      kind: 'league',
      key: `league:${league.weekId}`,
      urgency: left <= 10 ? 2 : 0,
      daysLeft: left,
      label: `Lig ${league.weekId}`,
      tone: 'neutral',
      progress: day / league.endDay,
    });
  }

  const session = state.council?.session;
  if (session) {
    const left = Math.max(0, session.voteDay - day);
    items.push({
      kind: 'council',
      key: `council:${session.openedDay}`,
      urgency: left <= 3 ? 2 : 1,
      daysLeft: left,
      label: `Meclis · ${session.motions.length} önerge`,
      tone: 'neutral',
    });
  }

  for (const active of state.activeEvents) {
    const def = EVENTS.find((event) => event.id === active.defId);
    if (!def) continue;
    items.push({
      kind: 'event',
      key: `event:${active.defId}`,
      urgency: 0,
      daysLeft: active.remainingDays,
      label: def.title,
      tone: def.tone,
    });
  }

  const era = state.era ? ERA_BY_ID[state.era.defId] : undefined;
  if (era) {
    items.push({
      kind: 'era',
      key: `era:${era.id}`,
      urgency: 0,
      daysLeft: null,
      label: era.title,
      tone: era.tone,
    });
  }

  const goal = state.gameOver ? null : nextGoal(state);
  if (goal) {
    items.push({
      kind: 'goal',
      key: `goal:${goal.def.id}`,
      urgency: 0,
      daysLeft: null,
      label: goal.def.title,
      tone: 'neutral',
      progress: goal.progress,
    });
  }

  // Aciliyet önce; eşitlikte yakın bitiş, süresizler sona. Sıralama
  // kararlı: aynı anahtarlar her karede aynı yerde durur.
  return items.sort((a, b) => {
    if (a.urgency !== b.urgency) return b.urgency - a.urgency;
    const da = a.daysLeft ?? Number.POSITIVE_INFINITY;
    const db = b.daysLeft ?? Number.POSITIVE_INFINITY;
    return da - db;
  });
}
