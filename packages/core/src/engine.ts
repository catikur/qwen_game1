import { BUILDING_BY_ID, CONSUMER_CATEGORIES, GOODS_BY_CATEGORY } from '@capital/content';
import { build, buyTile, buyoutTile, demolish, sellTile } from './actions';
import { pushNews } from './news';
import { runMarketTick } from './systems/market';
import { resetDailyLedgers, runProductionTick, runSpotPriceTick } from './systems/supply';
import { recomputeNetWorth, runLandValueTick, runPopulationTick } from './systems/city';
import { collectEventModifiers, runEventTick } from './systems/events';
import { placeBid, runAuctionTick } from './systems/auction';
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
    state.time.day += 1;

    runEventTick(state);
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

    this.settleCredit();
    recomputeNetWorth(state);
    this.checkMilestones();
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
