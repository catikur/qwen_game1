import { BUILDING_BY_ID, CARD_BY_ID, CATEGORIES, CREDIT, CRISIS_BY_ID, ERA_BY_ID, EVENT_BY_ID, GOOD_BY_ID, PROJECT_BY_ID, fillTemplate, localizeDecimal } from '@capital/content';
import { nextGoal } from './systems/goals';
import { leagueBoardKind } from './systems/leagueWeek';
import { OFFER_LIFETIME_DAYS, contractProgress } from './systems/contracts';
import { FREIGHT } from './systems/freight';
import { fuelLock } from './systems/energy';
import { AUCTION_PERIOD_DAYS } from './systems/auction';
import { sharesHeld, sharesOutstanding } from './systems/equity';
import { creditEnabled, overdraftLimit, overdraftOf } from './systems/credit';
import { dailyBuyCap, sharesToControl } from './systems/orders';
import { laborEnabled } from './systems/labor';
import { crisesEnabled } from './systems/economy';
import { cardParams, cardsEnabled } from './systems/cards';
import { campaignsLive, revengeDay } from './systems/rivalry';
import { hostileRivals } from './systems/relations';
import { questsEnabled, questsReady } from './systems/opportunities';
import { activeFad } from './systems/living';
import { projectStandings, projectsEnabled } from './systems/projects';
import { consortiumEnabled, consortiumStake } from './systems/consortium';
import { scenarioDefOf, scenarioProgress } from './systems/scenario';
import { formatMoney, monthName } from './selectors';
import { tc } from './i18n';
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
  | 'consortium'
  | 'order'
  | 'bank'
  | 'union'
  | 'contractOffer'
  | 'contract'
  | 'freightOffer'
  | 'fuelLock'
  | 'renewal'
  | 'auction'
  | 'unlock'
  | 'council'
  | 'league'
  | 'scenario'
  | 'event'
  | 'era'
  | 'crisis'
  | 'card'
  | 'campaign'
  | 'rival'
  | 'quests'
  | 'fad'
  | 'project'
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
    const fraction = top / sharesOutstanding(state, player.id);
    // Konsorsiyumun önderi kendi kalemiyle görünüyor (aşağıda).
    const consortium = consortiumEnabled(state) ? state.consortium : undefined;
    if (consortium && !state.gameOver) {
      const buying = day >= consortium.startsDay;
      const stake = consortiumStake(state, consortium);
      items.push({
        kind: 'consortium',
        key: `consortium:${consortium.formedDay}`,
        urgency: buying ? (stake >= 0.25 ? 3 : 2) : 2,
        daysLeft: buying ? null : consortium.startsDay - day,
        label: buying
          ? tc('core.agenda.consortiumBuying', { leader: consortium.names[0] ?? '', percent: Math.round(stake * 100) })
          : tc('core.agenda.consortiumWarning', { leader: consortium.names[0] ?? '', count: consortium.memberIds.length - 1 }),
        tone: 'bad',
        ...(buying ? { progress: Math.min(1, stake / 0.5) } : {}),
      });
    }
    if (raider && fraction >= 0.1 && raider !== consortium?.leaderId) {
      items.push({
        kind: 'raid',
        key: `raid:${raider}`,
        urgency: fraction >= 0.4 ? 3 : fraction >= 0.25 ? 2 : 1,
        daysLeft: null,
        label: tc('core.agenda.raid', { name: state.companies[raider]!.name, percent: Math.round(fraction * 100) }),
        tone: 'bad',
      });
    }
  }

  // Süren devralma emirleri (Tur 20): ilerleme çubuğu kontrol eşiğine göre,
  // geri sayım tavanla kalan en az gün. Nakit bekleyen emir dikkat ister.
  for (const order of player?.orders ?? []) {
    const issuer = state.companies[order.issuerId];
    if (!player || !issuer) continue;
    const outstanding = sharesOutstanding(state, issuer.id);
    const held = sharesHeld(state, player.id, issuer.id);
    const need = sharesToControl(state, player.id, issuer.id);
    const cap = dailyBuyCap(state, issuer.id);
    items.push({
      kind: 'order',
      key: `order:${issuer.id}`,
      urgency: order.waitingCash ? 2 : 1,
      daysLeft: cap > 0 ? Math.ceil(need / cap) : null,
      label: tc(order.waitingCash ? 'core.agenda.orderWaitingCash' : 'core.agenda.order', {
        name: issuer.name,
        percent: Math.round((held / outstanding) * 100),
      }),
      tone: order.waitingCash ? 'bad' : 'neutral',
      progress: Math.min(1, held / (Math.floor(outstanding / 2) + 1)),
    });
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
        label: tc('core.agenda.strike'),
        tone: 'bad',
      });
    } else if (labor.demand) {
      const left = Math.max(0, labor.demand.deadlineDay - day);
      items.push({
        kind: 'union',
        key: 'union:demand',
        urgency: left <= 3 ? 3 : 2,
        daysLeft: left,
        label: tc('core.agenda.unionDemand', {
          raise: localizeDecimal(String(Math.round(labor.demand.raise * 1000) / 10)),
        }),
        tone: 'bad',
      });
    } else if (labor.pressure >= 0.75) {
      items.push({
        kind: 'union',
        key: 'union:pressure',
        urgency: 1,
        daysLeft: null,
        label: tc('core.agenda.unionPressure'),
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
        label: tc('core.agenda.bankArrears', {
          overdraft: formatMoney(overdraft),
          limit: formatMoney(overdraftLimit(player)),
        }),
        tone: 'bad',
      });
    } else if (overdraft > 0) {
      items.push({
        kind: 'bank',
        key: 'bank:overdraft',
        urgency: 1,
        daysLeft: null,
        label: tc('core.agenda.overdraft', { amount: formatMoney(overdraft) }),
        tone: 'bad',
      });
    }
    // Tahvil vade duvarı: anapara tek seferde. Kasa yetmiyorsa acil.
    for (const loan of player.credit?.loans ?? []) {
      if (loan.kind !== 'bond') continue;
      const left = loan.startDay + loan.termDays - day;
      if (left > CREDIT.bond.warnDays) continue;
      items.push({
        kind: 'bank',
        key: `bank:bond:${loan.id}`,
        urgency: player.cash < loan.balance ? 3 : 2,
        daysLeft: Math.max(0, left),
        label: tc('core.agenda.bondDue', { amount: formatMoney(loan.balance) }),
        tone: player.cash < loan.balance ? 'bad' : 'neutral',
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

  // Taşıma teklifleri (Tur 56): karar terminalin panelinde, çip oraya götürüyor.
  for (const offer of state.freight?.offers ?? []) {
    const left = Math.max(0, offer.offeredDay + FREIGHT.offerLifetimeDays - day);
    items.push({
      kind: 'freightOffer',
      key: `freight:${offer.id}`,
      urgency: left <= 5 ? 2 : 1,
      daysLeft: left,
      label: tc('core.agenda.freightOffer', {
        company: state.companies[offer.companyId]?.name ?? offer.companyId,
        count: offer.outletIds.length,
        fee: formatMoney(offer.estimate),
      }),
      tone: 'neutral',
      tileId: state.buildings[offer.terminalId]?.tileId,
    });
  }

  // Enerji krizi geliyor (Tur 57): doğalgaz santrali olan, yakıtı sabit
  // değilse karar zamanı. Çip santrale gidiyor; düğme panelinde.
  const coming = state.crisis?.phase === 'warning' ? CRISIS_BY_ID[state.crisis.defId] : undefined;
  if (state.crisis && coming && (coming.effects.energyPrice ?? 1) > 1 && crisesEnabled(state) && !fuelLock(state, state.playerCompanyId)) {
    const plant = Object.values(state.buildings).find((b) => b.companyId === state.playerCompanyId && (BUILDING_BY_ID[b.defId]?.fuel ?? 0) > 0);
    if (plant) {
      items.push({
        kind: 'fuelLock',
        key: 'fuelLock',
        urgency: 2,
        daysLeft: Math.max(0, state.crisis.activeDay - day),
        label: tc('core.agenda.fuelLock'),
        tone: 'neutral',
        tileId: plant.tileId,
      });
    }
  }

  // Kentsel dönüşüm (Tur 58): bekleyen başvuru ihaleye kadar; dönüşüm hakkı
  // olan boş parsel proje bekliyor (başka bina hakkı düşürür).
  const request = state.renewalRequest;
  if (request) {
    const opens = (Math.floor(day / AUCTION_PERIOD_DAYS) + 1) * AUCTION_PERIOD_DAYS;
    items.push({
      kind: 'renewal',
      key: 'renewal:request',
      urgency: 0,
      daysLeft: opens - day,
      label: tc('core.agenda.renewalRequest'),
      tone: 'neutral',
      tileId: request.tileId,
    });
  }
  for (const tile of state.map.tiles) {
    if (!tile.renewal || tile.ownerId !== state.playerCompanyId || tile.buildingId) continue;
    items.push({
      kind: 'renewal',
      key: `renewal:${tile.id}`,
      urgency: 1,
      daysLeft: null,
      label: tc('core.agenda.renewalPlot'),
      tone: 'good',
      tileId: tile.id,
    });
  }

  if (state.auction) {
    const left = Math.max(0, state.auction.endsOnDay - day);
    items.push({
      kind: 'auction',
      key: 'auction',
      urgency: left <= 3 ? 2 : 1,
      daysLeft: left,
      label: tc('core.agenda.auction'),
      tone: 'neutral',
      tileId: state.auction.tileId,
    });
  }

  // Aynı gün açılan bölgeler tek çip (Tur 38): büyük şehrin dış halkası
  // dalga dalga açılıyor ve her dalga dört ayrı, aynı geri sayımlı çipti.
  // Çip ilk bölgeye götürüyor; adı ve kalanların sayısı yazıyor.
  const waves = new Map<number, Array<(typeof state.districts)[number]>>();
  for (const district of state.districts) {
    if (district.opensOnDay === undefined || district.opensOnDay <= day) continue;
    if (district.opensOnDay - day > UNLOCK_HORIZON_DAYS) continue;
    const wave = waves.get(district.opensOnDay) ?? [];
    wave.push(district);
    waves.set(district.opensOnDay, wave);
  }
  for (const [opensOnDay, wave] of waves) {
    const left = opensOnDay - day;
    const first = wave[0]!;
    items.push({
      kind: 'unlock',
      key: wave.length > 1 ? `unlock:wave:${opensOnDay}` : `unlock:${first.id}`,
      urgency: left <= 7 ? 2 : 1,
      daysLeft: left,
      label:
        wave.length > 1
          ? tc('core.agenda.unlockWave', { district: first.name, count: wave.length - 1 })
          : tc('core.agenda.unlock', { district: first.name }),
      tone: 'good',
      districtId: first.id,
    });
  }

  const league = state.league;
  // Günün koşusu (Tur 53) kendi adıyla: "Lig 2026-10-22" değil.
  const daily = league !== undefined && leagueBoardKind(league.weekId) === 'day';
  if (league && league.finishedDay === undefined) {
    const left = Math.max(0, league.endDay - day);
    items.push({
      kind: 'league',
      key: `league:${league.weekId}`,
      urgency: left <= 10 ? 2 : 0,
      daysLeft: left,
      label: daily ? tc('core.agenda.leagueDay') : tc('core.agenda.league', { week: league.weekId }),
      tone: 'neutral',
      progress: day / league.endDay,
    });
  } else if (league) {
    // Biten koşuda da tabloya bir kapı (Tur 31): doğrulama panel açıkken
    // koşuyor; sonuç ekranı kapanınca tabloya dönüş yolu kalmıyordu.
    items.push({
      kind: 'league',
      key: `league:${league.weekId}:done`,
      urgency: 0,
      daysLeft: null,
      label: daily ? tc('core.agenda.leagueDayDone') : tc('core.agenda.leagueDone', { week: league.weekId }),
      tone: 'neutral',
    });
  }

  // Senaryo (Tur 39): hedef, ilerleme ve kalan süre tek çipte.
  const run = state.scenario;
  const scenario = run && run.finishedDay === undefined ? scenarioDefOf(state) : null;
  const status = scenario ? scenarioProgress(state) : null;
  if (run && scenario && status) {
    items.push({
      kind: 'scenario',
      key: `scenario:${run.id}`,
      urgency: status.daysLeft <= 30 ? 2 : 1,
      daysLeft: status.daysLeft,
      label: tc('core.agenda.scenario', { title: scenario.title, detail: status.detail }),
      tone: scenario.goal.kind === 'leadAtEnd' ? (status.ahead ? 'good' : 'bad') : 'neutral',
      progress: status.progress,
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
      label: tc('core.agenda.council', { count: session.motions.length }),
      tone: 'neutral',
    });
  }

  for (const active of state.activeEvents) {
    const def = EVENT_BY_ID[active.defId];
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

  // Kriz (Tur 37a): uyarı evresinde geri sayım krize, kriz evresinde bitişe.
  const crisis = state.crisis ? CRISIS_BY_ID[state.crisis.defId] : undefined;
  if (state.crisis && crisis && crisesEnabled(state)) {
    const warning = state.crisis.phase === 'warning';
    items.push({
      kind: 'crisis',
      key: `crisis:${crisis.id}:${state.crisis.phase}`,
      urgency: 1,
      daysLeft: Math.max(0, (warning ? state.crisis.activeDay : state.crisis.endDay) - day),
      label: warning ? tc('core.agenda.crisisWarning', { title: crisis.title }) : crisis.title,
      tone: 'bad',
    });
  }

  // Karar kartı (Tur 37b): masada bekliyor, geri sayım karar süresine.
  const card = state.card ? CARD_BY_ID[state.card.defId] : undefined;
  if (state.card && card && cardsEnabled(state)) {
    items.push({
      kind: 'card',
      key: `card:${card.id}:${state.card.offeredDay}`,
      urgency: 2,
      daysLeft: Math.max(0, state.card.deadlineDay - day),
      label: fillTemplate(card.title, cardParams(state, state.card)),
      tone: 'neutral',
    });
  }

  // Rakip kampanyası (Tur 37b): kim, hangi kategoride, kaç gün kaldı.
  const campaign = state.campaign;
  const attacker = campaign ? state.companies[campaign.companyId] : undefined;
  if (campaign && attacker && campaignsLive(state)) {
    items.push({
      kind: 'campaign',
      key: `campaign:${campaign.companyId}:${campaign.startDay}`,
      urgency: 1,
      daysLeft: Math.max(0, campaign.endDay - day),
      label: tc(campaign.revenge ? 'core.agenda.revenge' : 'core.agenda.campaign', { name: attacker.name, category: CATEGORIES[campaign.category].name }),
      tone: 'bad',
    });
  }

  // Husumet (Tur 59): kim, ve kampanya yoksa rövanşa kaç gün.
  const revenge = campaign || !campaignsLive(state) ? null : revengeDay(state);
  for (const rival of hostileRivals(state)) {
    items.push({
      kind: 'rival',
      key: `rival:${rival.id}`,
      urgency: 1,
      daysLeft: revenge !== null && Number.isFinite(revenge) ? Math.max(0, revenge - day) : null,
      label: tc('core.agenda.hostile', { name: rival.name }),
      tone: 'bad',
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

  // Ayın görev panosu (Tur 37c): kaç görev bitti, ay bitimine kaç gün.
  const board = state.quests;
  if (board && board.items.length > 0 && questsEnabled(state) && !state.gameOver) {
    const done = board.items.filter((quest) => quest.doneDay !== undefined).length;
    // Alınmayı bekleyen ödül varsa kalem öne çıkıyor: ay bitince ödül düşüyor.
    const ready = questsReady(state);
    items.push({
      kind: 'quests',
      key: `quests:${board.startDay}`,
      urgency: ready > 0 ? 1 : 0,
      daysLeft: Math.max(0, board.endDay - day),
      label:
        ready > 0
          ? tc('core.agenda.questsReady', { count: ready })
          : tc('core.agenda.quests', { month: monthName(board.startDay), done, total: board.items.length }),
      tone: ready > 0 ? 'good' : 'neutral',
      progress: done / board.items.length,
    });
  }

  // Şehir projesi (Tur 37d): katkı penceresinde sıran, inşaatta kalan gün.
  const project = state.project;
  if (project && projectsEnabled(state) && !state.gameOver) {
    const def = PROJECT_BY_ID[project.defId];
    const funding = project.phase === 'funding';
    const rank = projectStandings(state, project).findIndex((row) => row.companyId === state.playerCompanyId) + 1;
    items.push({
      kind: 'project',
      key: `project:${project.defId}:${project.openedDay}`,
      urgency: funding ? 1 : 0,
      daysLeft: Math.max(0, (funding ? project.closesDay : project.doneDay) - day),
      label: funding
        ? rank > 0
          ? tc('core.agenda.projectRank', { project: def.name, rank })
          : tc('core.agenda.projectOpen', { project: def.name })
        : tc('core.agenda.projectBuilding', { project: def.name }),
      tone: rank === 1 ? 'good' : 'neutral',
      tileId: project.tileId,
    });
  }

  // Ürün modası (Tur 37d): hangi ürün, kaç gün kaldı — rafı çevirmek için zaman.
  const fad = activeFad(state);
  const fadGood = fad ? GOOD_BY_ID[fad.goodId] : undefined;
  if (fad && fadGood && !state.gameOver) {
    items.push({
      kind: 'fad',
      key: `fad:${fad.goodId}:${fad.startDay}`,
      urgency: 0,
      daysLeft: Math.max(0, fad.endDay - day),
      label: tc('core.agenda.fad', { good: fadGood.name }),
      tone: 'good',
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
