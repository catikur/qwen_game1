import { BUILDING_BY_ID, CONSUMER_CATEGORIES, GOODS_BY_CATEGORY, formatDecimal, formatPercent } from '@capital/content';
import { build, buyTile, buyoutTile, demolish, sellTile } from './actions';
import { pushNews } from './news';
import { stepLeadership } from './leadership';
import type { LeadershipMemory } from './leadership';
import { companyRanking, formatMoney } from './selectors';
import { runGoalTick } from './systems/goals';
import { isLoggable, leagueActive, runLeagueTick } from './systems/league';
import { runScenarioTick, scenarioActive, scenarioScreenPending } from './systems/scenario';
import { lobby } from './systems/council';
import { respondUnion, setWagePolicy } from './systems/labor';
import { chooseCard } from './systems/cards';
import { claimBubble, claimQuest, evaluateCommandQuests, runQuestTick } from './systems/opportunities';
import { contributeToProject } from './systems/projects';
import { QUOTE_COOLDOWN_DAYS, rivalQuote, withQuote } from './systems/rivalry';
import { repayLoan, takeLoan } from './systems/credit';
import { issueShares } from './systems/issuance';
import { cancelTakeoverOrder, placeTakeoverOrder, playerBuy } from './systems/orders';
import { recomputeNetWorth } from './systems/city';
import { runConsortiumTick } from './systems/consortium';
import { acceptContract, declineContract } from './systems/contracts';
import { acceptFreight, cancelFreight, declineFreight } from './systems/freight';
import { lockFuel } from './systems/energy';
import { requestRenewal, setRent } from './systems/realestate';
import { makeAmends } from './systems/relations';
import { placeBid } from './systems/auction';
import { noteCompanyPeak, notePeakWorth, noteRaidStage } from './systems/feats';
import { sellShares } from './systems/equity';
import {
  checkHoldingComplete,
  closeCity,
  holdingNetWorth,
  holdingTransfer,
  openCity,
  raidStatus,
  runHoldingTick,
  setCityDirective,
  switchCity,
} from './holding';
import { simulateCityDay } from './day';
import { tc } from './i18n';
import { SPEED_MS } from './types';
import type { CommandResult, GameCommand, GameState } from './types';

type Listener = () => void;

/** Bir karede en fazla kaç gün işlenir — sekme arka plandan dönünce donmasın. */
const MAX_TICKS_PER_FRAME = 4;
const MILESTONES = [500_000, 1_000_000, 5_000_000, 25_000_000];

/**
 * Oyun motoru.
 *
 * UI state'i doğrudan değiştirmez; sadece komut gönderir. Motor state'i
 * değiştirir ve bir sürüm numarası artırır — React bu numarayı dinleyerek
 * yeniden çizer. Bu ayrım sayesinde simülasyon Three.js'ten de React'ten de
 * bağımsız kalır ve başlıksız (headless) test edilebilir.
 */
export class GameEngine {
  private state: GameState;
  private listeners = new Set<Listener>();
  private version = 0;
  private reachedMilestones = new Set<number>();
  /**
   * Oyuncunun dünkü sırası; geçilme ANINI yakalamak için.
   *
   * State'te DEĞİL, motorda: bir sıralama zaten her gün net değerden
   * türetiliyor, saklamaya değer bir bilgi değil. Kayıt yüklendiğinde
   * null olması da doğru davranış — oyunu açar açmaz "seni geçtiler"
   * demek, olmamış bir olayı bildirmek olurdu.
   */
  private lastRank: number | null = null;
  /**
   * Baskın uyarısının son seviyesi (0–3). Motorda, state'te değil —
   * `lastRank` ile aynı gerekçe: eşik geçişi ANLIK bir olay, saklanacak
   * bir bilgi değil. Kayıt yüklendiğinde sıfırlanır ve bir sonraki eşik
   * geçişinde yeniden uyarır.
   */
  private lastRaidStage = 0;
  /** Bölge liderliği hafızası (`leadership.ts`); kayıt yüklenince sessizce yeniden kurulur. */
  private leadership: LeadershipMemory | null = null;

  constructor(state: GameState) {
    this.state = state;
    // Lig koşusu kayıttan açılınca net değer olduğu gibi kalır (replaceState'teki not).
    if (!state.league) recomputeNetWorth(this.state);
  }

  getState(): GameState {
    return this.state;
  }

  /** useSyncExternalStore için değişim damgası. */
  getVersion(): number {
    return this.version;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Motoru yeni bir state ile değiştirir (save yükleme). */
  replaceState(state: GameState): void {
    this.state = state;
    this.reachedMilestones.clear();
    this.leadership = null;
    // Lig koşusunda net değer kayıttaki gibi kalıyor: yeniden hesap, o
    // günün rakip kararlarının okuduğu değeri değiştirir ve kayıttan
    // devam eden koşu tekrarla ayrışırdı. Değer zaten her gün sonunda
    // hesaplanıyor.
    if (!state.league) recomputeNetWorth(this.state);
    this.notify();
  }

  /**
   * Holding: oynanan şehir değişiyor (Tur 22). Kayıt yüklemeye benziyor ama
   * anlık olaylar sessizce yeniden kuruluyor: geçilen eşikler, sıralama,
   * baskın seviyesi. Yoksa her şehir değişiminde "Şirket değeri 5M ₺" ve
   * "geçildin" haberleri yeniden düşerdi.
   */
  private swapCity(next: GameState): void {
    this.state = next;
    this.leadership = null;
    this.lastRank = null;
    // Bilinen baskın şehir değişince yeniden haber olmasın (Tur 30).
    this.lastRaidStage = raidStatus(next).stage;
    this.reachedMilestones.clear();
    const player = next.companies[next.playerCompanyId];
    for (const milestone of MILESTONES) {
      if (player && player.netWorth >= milestone) this.reachedMilestones.add(milestone);
    }
  }

  private notify(): void {
    this.version++;
    for (const listener of this.listeners) listener();
  }

  dispatch(command: GameCommand): CommandResult {
    const league = leagueActive(this.state);
    // Lig koşusunda kurallar sabit: herkes aynı şehirde aynı kurallarla.
    if (league && command.type === 'SET_FLAG') {
      return { ok: false, reason: tc('core.engine.leagueRulesLocked') };
    }
    // Senaryoda da (Tur 39): yıldızlar aynı kurallarla karşılaştırılabilsin.
    if (command.type === 'SET_FLAG' && scenarioActive(this.state)) {
      return { ok: false, reason: tc('core.engine.scenarioRulesLocked') };
    }
    // Senaryonun açılış ya da sonuç ekranı kapanmadan takvim yürümüyor
    // (Codex #66): boşluk tuşu ve hız düğmeleri şehri ekranın arkasında
    // yürütmesin — açılışta senaryonun günlerini, sonuçta serbest oyunu.
    const running = command.type === 'TOGGLE_PAUSE' || (command.type === 'SET_SPEED' && command.speed > 0);
    if (running && scenarioScreenPending(this.state)) {
      return { ok: false, reason: tc('core.engine.scenarioScreenPending') };
    }
    const day = this.state.time.day;
    const result = this.apply(command);
    if (result.ok) {
      // Görev eylemin hemen ardından (panonun son gününde de) tamamlanıyor;
      // aktarım uzak şehre gittiyse o şehrin panosu da.
      evaluateCommandQuests(this.state);
      if (command.type === 'HOLDING_TRANSFER' && command.index !== undefined) {
        const city = this.state.holding?.dormant[command.index]?.state;
        if (city) evaluateCommandQuests(city);
      }
      // Kariyer (Tur 41): duraklatılmış oyunda karşı devralma baskını hemen bitirebiliyor (Codex #70).
      if (this.state.companies[this.state.playerCompanyId] && !this.state.gameOver) {
        noteRaidStage(this.state, raidStatus(this.state).stage);
      }
      // Tekrar doğrulaması bu günlükten oynatıyor (league.ts).
      if (league && isLoggable(command)) {
        (this.state.commandLog ??= []).push([day, JSON.parse(JSON.stringify(command)) as GameCommand]);
      }
      this.notify();
    }
    return result;
  }

  private apply(command: GameCommand): CommandResult {
    const state = this.state;
    const playerId = state.playerCompanyId;

    switch (command.type) {
      case 'SET_SPEED':
        state.time.speed = command.speed;
        return { ok: true };

      case 'TOGGLE_PAUSE':
        state.time.speed = state.time.speed === 0 ? 1 : 0;
        return { ok: true };

      case 'BUY_TILE':
        return buyTile(state, playerId, command.tileId);

      case 'BUYOUT_TILE':
        return buyoutTile(state, playerId, command.tileId);

      case 'SELL_TILE':
        return sellTile(state, playerId, command.tileId);

      case 'BUILD':
        return build(state, playerId, command.tileId, command.defId);

      case 'DEMOLISH':
        return demolish(state, playerId, command.tileId);

      case 'SET_PRICE_MULTIPLIER': {
        const building = state.buildings[command.buildingId];
        if (!building) return { ok: false, reason: tc('core.engine.buildingNotFound') };
        if (building.companyId !== playerId) return { ok: false, reason: tc('core.engine.buildingNotYours') };
        building.priceMultiplier = Math.max(0.6, Math.min(1.8, command.multiplier));
        building.autoPrice = false;
        return { ok: true };
      }

      case 'SET_AUTO_PRICE': {
        const building = state.buildings[command.buildingId];
        if (!building) return { ok: false, reason: tc('core.engine.buildingNotFound') };
        if (building.companyId !== playerId) return { ok: false, reason: tc('core.engine.buildingNotYours') };
        building.autoPrice = command.auto;
        return { ok: true };
      }

      case 'SET_STOCK': {
        const building = state.buildings[command.buildingId];
        if (!building) return { ok: false, reason: tc('core.engine.buildingNotFound') };
        if (building.companyId !== playerId) return { ok: false, reason: tc('core.engine.buildingNotYours') };

        const def = BUILDING_BY_ID[building.defId];
        if (def?.role !== 'outlet') return { ok: false, reason: tc('core.engine.noShelf') };

        // Yalnızca kendi kategorisinin ürünleri, yuva sayısı kadar.
        const allowed = new Set((GOODS_BY_CATEGORY[def.category] ?? []).map((good) => good.id));
        const picked = [...new Set(command.goodIds)].filter((id) => allowed.has(id));
        if (picked.length === 0) return { ok: false, reason: tc('core.engine.pickOneGood') };

        const slots = def.slots ?? 1;
        if (picked.length > slots) {
          return { ok: false, reason: tc('core.engine.tooManyGoods', { name: def.name, slots }) };
        }

        building.stocked = picked;
        return { ok: true };
      }

      case 'SET_FOCUS': {
        const building = state.buildings[command.buildingId];
        if (!building) return { ok: false, reason: tc('core.engine.buildingNotFound') };
        if (building.companyId !== playerId) return { ok: false, reason: tc('core.engine.buildingNotYours') };

        const def = BUILDING_BY_ID[building.defId];
        if (def?.role !== 'research' && def?.role !== 'marketing') {
          return { ok: false, reason: tc('core.engine.notFocusable') };
        }
        if (!CONSUMER_CATEGORIES.includes(command.category)) {
          return { ok: false, reason: tc('core.engine.badCategory') };
        }

        // Atama serbestçe değişebilir ama BEDAVA DEĞİL: Ar-Ge primi
        // eski kategoride tavansız kalıp erimeye başlar. Ceza ayrıca
        // yazılmadı, `runResearchTick` iki yönlü çalıştığı için
        // kendiliğinden oluyor.
        building.focus = command.category;
        return { ok: true };
      }

      case 'PLACE_BID':
        return placeBid(state, playerId, command.amount);

      case 'ACCEPT_CONTRACT':
        return acceptContract(state);

      case 'DECLINE_CONTRACT':
        return declineContract(state);

      case 'SET_RENT':
        return setRent(state, playerId, command.buildingId, command.rent);

      case 'REQUEST_RENEWAL':
        return requestRenewal(state, command.tileId);

      case 'MAKE_AMENDS':
        return makeAmends(state, command.companyId);

      case 'LOCK_FUEL':
        return lockFuel(state);

      case 'ACCEPT_FREIGHT':
        return acceptFreight(state, command.offerId);

      case 'DECLINE_FREIGHT':
        return declineFreight(state, command.offerId);

      case 'CANCEL_FREIGHT':
        return cancelFreight(state, command.contractId);

      case 'BUY_SHARES':
        return playerBuy(state, playerId, command.companyId, command.count);

      case 'PLACE_TAKEOVER_ORDER':
        return placeTakeoverOrder(state, playerId, command.companyId);

      case 'CANCEL_TAKEOVER_ORDER':
        return cancelTakeoverOrder(state, playerId, command.companyId);

      case 'SELL_SHARES':
        return sellShares(state, playerId, command.companyId, command.count);

      case 'RENAME_COMPANY': {
        const name = command.name.trim();
        if (!name) return { ok: false, reason: tc('core.engine.emptyCompanyName') };
        state.companies[playerId]!.name = name.slice(0, 32);
        return { ok: true };
      }

      case 'SET_FLAG':
        state.flags[command.flag] = command.value;
        return { ok: true };

      case 'DISMISS_SCENARIO': {
        const run = state.scenario;
        if (!run) return { ok: false, reason: tc('core.engine.noScenario') };
        if (command.screen === 'brief') {
          if (run.briefSeen) return { ok: false, reason: tc('core.engine.scenarioBriefSeen') };
          run.briefSeen = true;
          // Açılış ekranı kapanınca takvim yürüyor.
          if (run.finishedDay === undefined) state.time.speed = 1;
          return { ok: true };
        }
        if (run.finishedDay === undefined) return { ok: false, reason: tc('core.engine.scenarioRunning') };
        run.resultSeen = true;
        return { ok: true };
      }

      case 'DISMISS_LEAGUE':
        if (!state.league || state.league.finishedDay === undefined) return { ok: false, reason: tc('core.engine.leagueRunning') };
        state.league.resultSeen = true;
        return { ok: true };

      case 'LOBBY':
        return lobby(state, playerId, command.motionId, command.side, command.amount);

      case 'SET_WAGE_POLICY':
        return setWagePolicy(state, playerId, command.policy);

      case 'RESPOND_UNION':
        return respondUnion(state, playerId, command.response);

      case 'CHOOSE_CARD':
        return chooseCard(state, command.choiceId);

      case 'CLAIM_BUBBLE':
        return claimBubble(state);

      case 'CLAIM_QUEST':
        return claimQuest(state, command.index);

      case 'CONTRIBUTE_PROJECT':
        return contributeToProject(state, command.amount);

      case 'TAKE_LOAN':
        return takeLoan(state, playerId, command.kind, command.amount, command.termDays);

      case 'REPAY_LOAN':
        return repayLoan(state, playerId, command.loanId);

      case 'ISSUE_SHARES':
        return issueShares(state, playerId, command.count);

      case 'DISMISS_VICTORY':
        if (!state.victory) return { ok: false, reason: tc('core.engine.noVictory') };
        state.victory.dismissed = true;
        return { ok: true };

      case 'OPEN_CITY':
      case 'SWITCH_CITY': {
        const result =
          command.type === 'OPEN_CITY'
            ? openCity(state, command.citySize, command.capital)
            : switchCity(state, command.index);
        if (!result.ok || !result.next) return { ok: false, reason: result.reason ?? tc('core.engine.cityUnchanged') };
        this.swapCity(result.next);
        return { ok: true };
      }

      case 'HOLDING_TRANSFER':
        return holdingTransfer(state, command.amount, command.index);

      case 'SET_CITY_DIRECTIVE': {
        const change: { payout?: typeof command.payout; defend?: boolean } = {};
        if (command.payout !== undefined) change.payout = command.payout;
        if (command.defend !== undefined) change.defend = command.defend;
        return setCityDirective(state, command.index, change);
      }

      case 'CLOSE_CITY':
        return closeCity(state, command.index);

      default:
        return { ok: false, reason: tc('core.engine.unknownCommand') };
    }
  }

  /**
   * Gerçek zamanı simülasyon günlerine çevirir.
   * Kare hızından bağımsızdır: 30 FPS'te de 144 FPS'te de gün süresi aynıdır.
   */
  advance(deltaMs: number): void {
    const state = this.state;
    if (state.time.speed === 0) return;

    state.meta.playTimeMs += deltaMs;
    state.time.accumulatorMs += deltaMs;

    const dayMs = SPEED_MS[state.time.speed];
    let ticks = 0;

    while (state.time.accumulatorMs >= dayMs && ticks < MAX_TICKS_PER_FRAME) {
      state.time.accumulatorMs -= dayMs;
      this.runDay();
      ticks++;
      // Gün oyunu duraklattıysa (senaryo ya da lig bitişi, zafer) karenin
      // kalan günleri koşmuyor (Codex #66): geciken kare ya da arka plandan
      // dönüş sonuç ekranının arkasında şehri birkaç gün ilerletiyordu.
      // (`this.state` üzerinden okunuyor: yerel `state`in hızı yukarıda sıfır
      // değil diye daraltıldı, ama gün onu değiştirebiliyor.)
      if (this.state.time.speed === 0) {
        state.time.accumulatorMs = 0;
        break;
      }
    }

    // Birikmiş fazlayı at, yoksa sekmeye dönünce oyun ileri sarar.
    if (state.time.accumulatorMs > dayMs) state.time.accumulatorMs = 0;
    if (ticks > 0) this.notify();
  }

  /**
   * Tek bir oyun gününü işler. Testler bunu doğrudan çağırabilir.
   *
   * Sıra tesadüf değil: üretim bugünkü satıştan önce çözülür (birim
   * maliyet pazarın girdisidir), spot fiyat ise günün sonunda — yani
   * yarının fiyatı bugünkü arz fazlasından doğar.
   */
  runDay(): void {
    const state = this.state;
    // Oyun bittiyse takvim durur. Şirket silinmediği için paneller hâlâ
    // okunabilir — oyuncu son durumuna bakabilmeli.
    if (state.gameOver) return;
    // Şehrin kendi günü: takvim, olaylar, pazar, rakipler, banka (Tur 30'dan
    // beri `day.ts`'te — bekleyen şehirler de aynı adımlarla yaşıyor).
    simulateCityDay(state);
    // Holding: bekleyen şehirler de bir gün yaşıyor, kârlarının payı kasaya (Tur 30).
    runHoldingTick(state);
    recomputeNetWorth(state);
    // Görev panosu günün net değeriyle (Tur 37c, Codex #63).
    runQuestTick(state);
    // Rakip konsorsiyumu yalnız oynanan şehirde, günün net değeriyle (Tur 37d-3).
    runConsortiumTick(state);
    this.checkMilestones();
    runGoalTick(state);
    // Holding hedeflerinin son basamağı: üç şehirde zafer (Tur 32).
    checkHoldingComplete(state);
    this.checkOvertaking();
    this.checkLeadership();
    this.checkRaid();
    // Kariyer (Tur 41): püskürtülen baskın ve günün değeri.
    if (state.companies[state.playerCompanyId]) {
      noteRaidStage(state, raidStatus(state).stage);
      notePeakWorth(state, holdingNetWorth(state));
      noteCompanyPeak(state);
      for (const city of state.holding?.dormant ?? []) noteCompanyPeak(city.state);
    }
    // Senaryo günün son net değeri ve devralmasıyla (Tur 39).
    runScenarioTick(state);
    runLeagueTick(state);
  }

  /**
   * Oyuncunun hissesine yönelen baskını eşiklerde haber yapıyor.
   *
   * Kaybedilebilir bir oyunun ilk şartı, kaybın GELDİĞİNİ GÖRMEK.
   * Devralma eşiği %50 ve baskıncı günde en fazla %4,5 (Dengeli) toplayabiliyor;
   * %10/%25/%40 uyarıları oyuncuya tepki verecek günler bırakıyor —
   * geri alım yap, nakit biriktir, ya da bile bile riske gir.
   */
  private checkRaid(): void {
    const state = this.state;
    if (!state.companies[state.playerCompanyId]) return;
    // Eşikler holding'deki uzak şehir uyarılarıyla ortak (Tur 30).
    const { stage, fraction, holderId: topHolder } = raidStatus(state);
    if (stage <= this.lastRaidStage) {
      // Eşik aşağı inince seviye sessizce düşer: baskıncı satıp geri
      // dönerse aynı uyarı yeniden atılabilmeli.
      this.lastRaidStage = stage;
      return;
    }
    this.lastRaidStage = stage;

    const raider = topHolder ? state.companies[topHolder] : null;
    if (!raider) return;

    const percent = Math.round(fraction * 100);
    const messages: Record<number, [string, string]> = {
      1: [
        tc('core.engine.raid1Title', { name: raider.name }),
        tc('core.engine.raid1Body', { percent }),
      ],
      2: [
        tc('core.engine.raid2Title', { name: raider.name, percent }),
        tc('core.engine.raid2Body'),
      ],
      3: [
        tc('core.engine.raid3Title', { name: raider.name, percent }),
        tc('core.engine.raid3Body'),
      ],
    };
    const [title, body] = messages[stage]!;
    pushNews(state, 'bad', title, body, raider.id);
  }

  /**
   * Sıralama değişimini bir OLAYA çeviriyor.
   *
   * Bugüne kadar sıralama üst barda "4." diye duran bir sayıydı. Rakip
   * seni geçtiğinde hiçbir şey olmuyordu: haber akışında "Nova Holding
   * genişliyor" geçiyor, senin ne kaybettiğin yazmıyordu. Oysa oyunu
   * sürükleyen duygu tam orada — geçildiğini görmek.
   *
   * İki yön de bildiriliyor. Yalnızca kötü haberi vermek oyuncuyu
   * cezalandırırdı; geri almanın da bir karşılığı olmalı.
   */
  private checkOvertaking(): void {
    const state = this.state;
    const ranking = companyRanking(state);
    const mine = ranking.find((row) => row.company.isPlayer);
    if (!mine) return;

    const previous = this.lastRank;
    this.lastRank = mine.rank;
    // İlk gün kıyaslanacak bir dün yok.
    if (previous === null || previous === mine.rank) return;

    if (mine.rank > previous) {
      // Geçen kim: şimdi senin ESKİ sıranda duran şirket.
      const passer = ranking.find((row) => row.rank === previous);
      if (!passer || passer.company.isPlayer) return;
      const gap = passer.company.netWorth - mine.company.netWorth;
      /*
       * İkinci cümle KOŞULLU.
       *
       * İlk hâli her zaman bina sayısını yazıyordu ve sondajda "Nova
       * Holding 0 binayla çalışıyor" gibi saçma bir cümle çıktı. Bir
       * karşılaştırma ancak karşılaştırılacak bir şey varsa bilgi taşır;
       * yoksa oyuncuya yalnızca gürültü verir.
       *
       * Kıyas bina sayısı üzerinden, çünkü oyuncunun yapabileceği şey o:
       * para bir sonuç, bina bir hamle.
       */
      const lead = passer.buildings - mine.buildings;
      const params = { rank: mine.rank, gap: formatMoney(gap), lead };
      const body =
        lead > 0
          ? tc('core.engine.overtakenBodyLead', params)
          : mine.buildings > passer.buildings
            ? tc('core.engine.overtakenBodyMoreBuildings', params)
            : tc('core.engine.overtakenBody', params);
      pushNews(
        state,
        'bad',
        tc('core.engine.overtakenTitle', { name: passer.company.name }),
        withQuote(body, rivalQuote(state, passer.company, 'overtook', {}, QUOTE_COOLDOWN_DAYS)),
        passer.company.id,
      );
      return;
    }

    // Sıra iyileşti: geçtiğin şirket şimdi senin bir altında.
    const passed = ranking.find((row) => row.rank === mine.rank + 1);
    const ahead = ranking.find((row) => row.rank === mine.rank - 1);
    // Bir üstteki de yazılıyor: "geçtim" duygusunun devamı "sıradaki kim".
    const body = ahead
      ? tc('core.engine.climbedBodyAhead', {
          rank: mine.rank,
          name: ahead.company.name,
          gap: formatMoney(ahead.company.netWorth - mine.company.netWorth),
        })
      : tc('core.engine.climbedBodyTop', { rank: mine.rank });
    pushNews(
      state,
      'good',
      passed
        ? tc('core.engine.passedTitle', { name: passed.company.name })
        : tc('core.engine.climbedTitle', { rank: mine.rank }),
      withQuote(body, rivalQuote(state, passed?.company, 'passed', {}, QUOTE_COOLDOWN_DAYS)),
      passed?.company.id,
    );
  }

  /**
   * Bölge liderliğinin el değiştirmesi — yalnızca oyuncuyu ilgilendiren
   * devirler haber. Rakipler arası devir haber akışını doldururdu ve
   * oyuncunun yapabileceği bir şey değil.
   */
  private checkLeadership(): void {
    const state = this.state;
    const { memory, changes } = stepLeadership(state, this.leadership);
    this.leadership = memory;
    const playerId = state.playerCompanyId;
    for (const change of changes) {
      const district = state.districts[change.districtId];
      if (!district) continue;
      const pct = (value: number) => formatPercent(Math.round(value * 100));
      if (change.from === playerId) {
        const rival = state.companies[change.to];
        if (!rival) continue;
        pushNews(
          state,
          'bad',
          tc('core.engine.leadLostTitle', { rival: rival.name, district: district.name }),
          withQuote(
            tc('core.engine.leadLostBody', { toShare: pct(change.toShare), fromShare: pct(change.fromShare) }),
            rivalQuote(state, rival, 'leadLost', { district: district.name }, QUOTE_COOLDOWN_DAYS),
          ),
          { companyId: rival.id, districtId: district.id },
        );
      } else if (change.to === playerId) {
        const previous = state.companies[change.from];
        pushNews(
          state,
          'good',
          tc('core.engine.leadWonTitle', { district: district.name }),
          previous
            ? tc('core.engine.leadWonBodyPrevious', {
                toShare: pct(change.toShare),
                name: previous.name,
                fromShare: pct(change.fromShare),
              })
            : tc('core.engine.leadWonBody', { toShare: pct(change.toShare) }),
          { districtId: district.id },
        );
      }
    }
  }

  private checkMilestones(): void {
    const player = this.state.companies[this.state.playerCompanyId];
    if (!player) return;

    for (const milestone of MILESTONES) {
      if (player.netWorth < milestone || this.reachedMilestones.has(milestone)) continue;
      this.reachedMilestones.add(milestone);

      const unlocked = Object.values(BUILDING_BY_ID)
        .filter((def) => def.unlockNetWorth > 0 && def.unlockNetWorth <= milestone)
        .map((def) => def.name);

      pushNews(
        this.state,
        'good',
        tc('core.engine.milestoneTitle', { value: formatDecimal(milestone / 1_000_000, milestone >= 1_000_000 ? 1 : 2) }),
        unlocked.length > 0
          ? tc('core.engine.milestoneUnlocked', { names: unlocked.join(', ') })
          : tc('core.engine.milestoneScale'),
      );
    }
  }
}
