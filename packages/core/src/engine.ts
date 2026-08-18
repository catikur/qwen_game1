import { BUILDING_BY_ID, CONSUMER_CATEGORIES, GOODS_BY_CATEGORY } from '@capital/content';
import { build, buyTile, buyoutTile, demolish, sellTile } from './actions';
import { pushNews } from './news';
import { companyRanking, formatMoney } from './selectors';
import { TOTAL_SHARES, sharesHeld } from './systems/equity';
import { runMarketTick } from './systems/market';
import { resetDailyLedgers, runProductionTick, runSpotPriceTick } from './systems/supply';
import {
  recomputeNetWorth,
  runDistrictUnlockTick,
  runLandValueTick,
  runPopulationTick,
} from './systems/city';
import { collectEventModifiers, runEraTick, runEventTick } from './systems/events';
import { acceptContract, declineContract, runContractTick } from './systems/contracts';
import { placeBid, runAuctionTick } from './systems/auction';
import { buyShares, runDividendTick, runTakeoverTick, sellShares } from './systems/equity';
import { runResearchTick } from './systems/focus';
import { runNpcTick } from './systems/npc';
import { SPEED_MS } from './types';
import type { CommandResult, GameCommand, GameState } from './types';

type Listener = () => void;

/** Bir karede en fazla kaç gün işlenir — sekme arka plandan dönünce donmasın. */
const MAX_TICKS_PER_FRAME = 4;
/** Nakit eksiye düşerse otomatik kredi limitine bu orandan faiz işler. */
const CREDIT_LINE_LIMIT_RATIO = 0.6;

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

  constructor(state: GameState) {
    this.state = state;
    recomputeNetWorth(this.state);
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
    recomputeNetWorth(this.state);
    this.notify();
  }

  private notify(): void {
    this.version++;
    for (const listener of this.listeners) listener();
  }

  dispatch(command: GameCommand): CommandResult {
    const result = this.apply(command);
    if (result.ok) this.notify();
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
        if (!building) return { ok: false, reason: 'Bina bulunamadı.' };
        if (building.companyId !== playerId) return { ok: false, reason: 'Bu bina sizin değil.' };
        building.priceMultiplier = Math.max(0.6, Math.min(1.8, command.multiplier));
        building.autoPrice = false;
        return { ok: true };
      }

      case 'SET_AUTO_PRICE': {
        const building = state.buildings[command.buildingId];
        if (!building) return { ok: false, reason: 'Bina bulunamadı.' };
        if (building.companyId !== playerId) return { ok: false, reason: 'Bu bina sizin değil.' };
        building.autoPrice = command.auto;
        return { ok: true };
      }

      case 'SET_STOCK': {
        const building = state.buildings[command.buildingId];
        if (!building) return { ok: false, reason: 'Bina bulunamadı.' };
        if (building.companyId !== playerId) return { ok: false, reason: 'Bu bina sizin değil.' };

        const def = BUILDING_BY_ID[building.defId];
        if (def?.role !== 'outlet') return { ok: false, reason: 'Bu binanın rafı yok.' };

        // Yalnızca kendi kategorisinin ürünleri, yuva sayısı kadar.
        const allowed = new Set((GOODS_BY_CATEGORY[def.category] ?? []).map((good) => good.id));
        const picked = [...new Set(command.goodIds)].filter((id) => allowed.has(id));
        if (picked.length === 0) return { ok: false, reason: 'En az bir ürün seçilmeli.' };

        const slots = def.slots ?? 1;
        if (picked.length > slots) {
          return { ok: false, reason: `${def.name} en fazla ${slots} ürün taşıyabilir.` };
        }

        building.stocked = picked;
        return { ok: true };
      }

      case 'SET_FOCUS': {
        const building = state.buildings[command.buildingId];
        if (!building) return { ok: false, reason: 'Bina bulunamadı.' };
        if (building.companyId !== playerId) return { ok: false, reason: 'Bu bina sizin değil.' };

        const def = BUILDING_BY_ID[building.defId];
        if (def?.role !== 'research' && def?.role !== 'marketing') {
          return { ok: false, reason: 'Bu bina bir kategoriye atanmaz.' };
        }
        if (!CONSUMER_CATEGORIES.includes(command.category)) {
          return { ok: false, reason: 'Bu kategoriye atanamaz.' };
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

      case 'BUY_SHARES':
        return buyShares(state, playerId, command.companyId, command.count);

      case 'SELL_SHARES':
        return sellShares(state, playerId, command.companyId, command.count);

      case 'RENAME_COMPANY': {
        const name = command.name.trim();
        if (!name) return { ok: false, reason: 'Şirket adı boş olamaz.' };
        state.companies[playerId]!.name = name.slice(0, 32);
        return { ok: true };
      }

      case 'SET_FLAG':
        state.flags[command.flag] = command.value;
        return { ok: true };

      default:
        return { ok: false, reason: 'Bilinmeyen komut.' };
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
    state.time.day += 1;

    runEventTick(state);
    runEraTick(state);
    // İmar takvimi sözleşmeden ÖNCE: açılış günü gelen bir inşaat
    // teklifi yeni bölgeyi hedefleyebilmeli.
    runDistrictUnlockTick(state);
    runContractTick(state);
    resetDailyLedgers(state);
    // Ar-Ge primi pazardan ÖNCE ilerler: bugünkü kalite bugünkü satışa
    // girsin. Spot fiyatın tersi (o günün sonunda çözülüyor) çünkü orada
    // yarının fiyatı bugünkü arz fazlasından doğuyor.
    runResearchTick(state);
    runProductionTick(state);
    runMarketTick(state);
    runSpotPriceTick(state);

    const mods = collectEventModifiers(state);
    runLandValueTick(state, mods.landValueDrift);
    runPopulationTick(state);
    runNpcTick(state);
    // İhale NPC turundan sonra: rakip aynı gün hem mağaza açıp hem teklif
    // vermesin, nakit iki kez harcanmış gibi görünmesin.
    runAuctionTick(state);

    // Temettü kredi kapatmadan ÖNCE: hissedarın parası, borcunu
    // kapatmak için o gün elinde olsun.
    runDividendTick(state);
    // Devralma temettüden SONRA: devralınan şirket son gününün payını
    // dağıtmış olsun, hissedar ortada kalmasın.
    runTakeoverTick(state, (title, body) => pushNews(state, 'rival', title, body));
    this.settleCredit();
    recomputeNetWorth(state);
    this.checkMilestones();
    this.checkOvertaking();
    this.checkRaid();
  }

  /**
   * Oyuncunun hissesine yönelen baskını eşiklerde haber yapıyor.
   *
   * Kaybedilebilir bir oyunun ilk şartı, kaybın GELDİĞİNİ GÖRMEK.
   * Devralma eşiği %50 ve baskıncı günde en fazla %3,5 toplayabiliyor;
   * %10/%25/%40 uyarıları oyuncuya tepki verecek günler bırakıyor —
   * geri alım yap, nakit biriktir, ya da bile bile riske gir.
   */
  private checkRaid(): void {
    const state = this.state;
    const player = state.companies[state.playerCompanyId];
    if (!player) return;

    let topHolder: string | null = null;
    let topCount = 0;
    for (const company of Object.values(state.companies)) {
      if (company.isPlayer) continue;
      const count = sharesHeld(state, company.id, player.id);
      if (count > topCount) {
        topCount = count;
        topHolder = company.id;
      }
    }

    const fraction = topCount / TOTAL_SHARES;
    const stage = fraction >= 0.4 ? 3 : fraction >= 0.25 ? 2 : fraction >= 0.1 ? 1 : 0;
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
        `${raider.name} hissene göz dikti`,
        `Payının %${percent}'i onda. Henüz tehdit değil — ama alımlar sürerse büyür.`,
      ],
      2: [
        `${raider.name} payını %${percent}'e çıkardı`,
        'Devralma eşiği %50. Geri alım yapmayı düşün: hazineye çektiğin her hisse onun alamayacağı bir hisse.',
      ],
      3: [
        `${raider.name} kontrolüne yaklaşıyor: %${percent}`,
        'Eşiğe çok az kaldı. Nakdin varsa geri alım son şansın; yoksa imparatorluk el değiştirecek.',
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
      const detail =
        lead > 0
          ? ` Elinde senden ${lead} fazla bina var.`
          : mine.buildings > passer.buildings
            ? ' Senin binan daha çok — fark arsada ve markada.'
            : '';
      pushNews(
        state,
        'bad',
        `${passer.company.name} seni geçti`,
        `Artık ${mine.rank}. sıradasın. Aradaki fark ${formatMoney(gap)}.${detail}`,
        passer.company.id,
      );
      return;
    }

    // Sıra iyileşti: geçtiğin şirket şimdi senin bir altında.
    const passed = ranking.find((row) => row.rank === mine.rank + 1);
    const ahead = ranking.find((row) => row.rank === mine.rank - 1);
    // Bir üstteki de yazılıyor: "geçtim" duygusunun devamı "sıradaki kim".
    const next = ahead
      ? ` Önünde ${ahead.company.name} var — fark ${formatMoney(ahead.company.netWorth - mine.company.netWorth)}.`
      : ' Şehrin en değerli şirketi sensin.';
    pushNews(
      state,
      'good',
      passed ? `${passed.company.name}'i geçtin` : `${mine.rank}. sıraya yükseldin`,
      `${mine.rank}. sıradasın.${next}`,
      passed?.company.id,
    );
  }

  /** Nakit eksiye düşerse otomatik kredi devreye girer; oyun sert bitmez. */
  private settleCredit(): void {
    for (const company of Object.values(this.state.companies)) {
      if (company.cash >= 0) continue;

      const shortfall = -company.cash;
      company.debt += shortfall;
      company.cash = 0;

      if (company.isPlayer) {
        const assets = company.netWorth + company.debt;
        const limit = Math.max(200_000, assets * CREDIT_LINE_LIMIT_RATIO);
        if (company.debt > limit) {
          pushNews(
            this.state,
            'bad',
            'Kredi limiti aşıldı',
            'Borcun varlıklarını taşıyamıyor. Zarar eden binaları kapatmayı veya arsa satmayı düşün.',
          );
        }
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
        `Şirket değeri ${(milestone / 1_000_000).toFixed(milestone >= 1_000_000 ? 1 : 2)}M ₺`,
        unlocked.length > 0
          ? `Yeni yatırım seçenekleri açık: ${unlocked.join(', ')}.`
          : 'Ölçek büyüyor.',
      );
    }
  }
}
