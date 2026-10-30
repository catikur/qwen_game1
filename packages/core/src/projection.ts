import { BUILDING_BY_ID } from '@capital/content';
import { GameEngine } from './engine';
import { build } from './actions';
import { defaultFocus } from './systems/focus';
import type { GameState } from './types';

/**
 * Bina projeksiyonu — "120 gün sonra bu bina ne katıyor olur?" (Tur 21).
 *
 * Hızlı tahmin (`indirectEstimate`) bugünkü şehri ölçüyor. Doğrulama iki
 * kanalı kaçırdığını gösterdi:
 *   - Mağazalar kapasitede çalışırken Ar-Ge ve pazarlama fiyattan öder; o
 *     prim karşılanmayan talep büyüdükçe büyür.
 *   - Mağaza dışındaki her bina temel istihdam yaratır, bölgenin nüfusunu
 *     büyütür (`runPopulationTick`).
 * İkisi de zamanla birikiyor. Ölçüm: 150 gün sonra gerçek katkı hızlı
 * tahminin 1,9–4,2 katıydı. Bu yüzden ayrıca, isteğe bağlı bir projeksiyon
 * var: durumun iki kopyası, birinde bina kurulu, ikisi de gün gün oynuyor.
 *
 * Varsayım: rakipler bu sürede hamle yapmıyor ve oyuncu başka bir şey
 * kurmuyor. Dönemler ve olaylar ikisinde de aynı (zarlar günden tohumlanıyor).
 * Pahalı (iki kopya × 120 gün): yalnızca oyuncu isteyince koşuyor.
 */

export interface Projection {
  /** Her 10 günün ortalama brüt katkı farkı (ciro − mal maliyeti). */
  series: number[];
  /** Son 10 günün ortalama katkısı. */
  finalGain: number;
  /** Son 10 günün ortalama KÂR farkı: katkı eksi binanın gideri ve ücreti. */
  finalProfit: number;
  days: number;
}

export const PROJECTION_DAYS = 120;

function freeze(state: GameState): GameState {
  const copy = structuredClone(state);
  copy.flags.npcCompetition = false;
  // Holding'in öbür şehirlerinin rakipleri de (Tur 78): şehirler arası hatla
  // oynanan şehrin pazarına dokunuyorlar; yol kopyalaması ve kamyon gözden
  // geçirmesi iki kolda ayrışmasın (Codex #108).
  for (const city of copy.holding?.dormant ?? []) city.state.flags.npcCompetition = false;
  copy.flags.landAuctions = false;
  /*
   * Karar kartları (Tur 37b) iki kolda farklı gelebilir: yeni bina mağaza
   * ya da bina sayısı eşiğini geçirince uygun kart değişiyor ve süre dolunca
   * uygulanan varsayılanın etkisi farka binerdi. Kart ÜRETİMİ duruyor
   * (masadaki kart kalkıyor, yenisi gelmiyor) ama bayrak açık kalıyor:
   * süren kart etkileri (bakım, ücret, çekicilik) bugün işi gerçekten
   * etkiliyor ve tahmine girmeli (Codex #62). Rakip kampanyası da aynı
   * kural: yeni kampanya açılmıyor (`npcCompetition` kapalı), süren kampanya
   * ise indirimiyle süresini dolduruyor — saldırı altındaki kategoride
   * bugünkü fiyat savaşı tahmine girmeli (Codex #62).
   */
  delete copy.card;
  copy.nextCardDay = Number.MAX_SAFE_INTEGER;
  /*
   * Fırsat balonu ve görev (Tur 37c) de kollarda ayrışabilir: yeni bina
   * "mağaza aç" görevini bitirip markayı artırır, balon başka mağazaya
   * bağlanır. Balon üretimi duruyor (süren "kuyruk" etkisi kalıyor),
   * görev panosu kapanıyor — kalıcı etkisi yok, verdiği marka zaten
   * şirkette.
   */
  delete copy.bubble;
  copy.nextBubbleDay = Number.MAX_SAFE_INTEGER;
  delete copy.quests;
  copy.flags.quests = false;
  // Oyun bitmiş ya da zafer ekranı açıkken de takvim aksın.
  delete copy.gameOver;
  delete copy.league;
  return copy;
}

export function projectBuilding(
  state: GameState,
  companyId: string,
  defId: string,
  tileId: number,
  days = PROJECTION_DAYS,
): Projection | null {
  const def = BUILDING_BY_ID[defId];
  const tile = state.map.tiles[tileId];
  if (!def || !tile || tile.buildingId) return null;

  const base = freeze(state);
  const treated = freeze(state);
  // Parsel bizim değilse iki kopyada da bizimmiş gibi: arsa bedeli soruyu değiştirmez.
  for (const copy of [base, treated]) {
    copy.map.tiles[tileId]!.ownerId = companyId;
    copy.companies[companyId]!.cash += def.cost * 2;
  }
  if (!build(treated, companyId, tileId, defId).ok) return null;
  const building = Object.values(treated.buildings).find((b) => b.tileId === tileId);
  if (building && (def.role === 'research' || def.role === 'marketing') && !building.focus) {
    building.focus = defaultFocus(treated, companyId, defId);
  }

  const a = new GameEngine(base);
  const b = new GameEngine(treated);
  const series: number[] = [];
  let bucket = 0;
  let lastProfit = 0;
  for (let day = 1; day <= days; day++) {
    a.runDay();
    b.runDay();
    const x = base.companies[companyId]!.today;
    const y = treated.companies[companyId]!.today;
    bucket += y.revenue - y.cogs - (x.revenue - x.cogs);
    if (day > days - 10) lastProfit += y.revenue - y.cogs - y.upkeep - y.wages - (x.revenue - x.cogs - x.upkeep - x.wages);
    if (day % 10 === 0) {
      series.push(bucket / 10);
      bucket = 0;
    }
  }
  return { series, finalGain: series[series.length - 1] ?? 0, finalProfit: lastProfit / 10, days };
}
