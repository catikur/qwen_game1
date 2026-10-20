import { BUILDING_BY_ID } from '@capital/content';
import { isDistrictOpen } from '@capital/core';
import type { GameState } from '@capital/core';
import type { ViewState } from './useGame';
import type { MessageKey } from './i18n';
import { tutorialKey, tutorialProgress } from './tutorialStore';

/**
 * Yeni oyuncu rehberi (Tur 26).
 *
 * Oyun 25 turda derinleşti ama ilk kez açan oyuncuyu yalnızca hedef
 * merdiveni karşılıyordu: "Boş bir parsel seç, satın al ve bir mağaza
 * kur" — nerede, hangi düğmeyle, tahmin ne diyor, sorularının cevabı yok.
 *
 * Üç ilke:
 *
 *   1. OYUN DURUMUNA BAKAR, DÜĞMEYE DEĞİL. Adımların çoğu "İleri" ile
 *      değil, oyuncu o şeyi YAPINCA ilerliyor (parsel aldı mı, mağaza
 *      kurdu mu). Önden giden oyuncu için adımlar kendiliğinden geçiyor;
 *      rehber kimseyi beklettirmiyor.
 *   2. HER AN KAPATILABİLİR. Rehber oyunun üstünde bir kart, önünde bir
 *      duvar değil. Kapatan oyuncu Yardım'dan yeniden açabiliyor.
 *   3. KAYIT ŞEMASINA DOKUNMAZ. İlerleme arayüzün işi, simülasyonun değil:
 *      oyun durumuna yazılsaydı determinizm ölçümleri, kayıt göçü ve lig
 *      doğrulaması bir arayüz kaygısını taşımak zorunda kalırdı. İlerleme
 *      yerel depoda, oyunun kimliğiyle (tohum + kuruluş anı) tutuluyor;
 *      depo kapalıysa oturum boyunca bellekte.
 */

export type TutorialStepId =
  | 'welcome'
  | 'lens'
  | 'pick'
  | 'buy'
  | 'choose'
  | 'build'
  | 'play'
  | 'goals'
  | 'chain'
  | 'rivals'
  | 'done';

export interface TutorialProgress {
  /** `TUTORIAL_STEPS` içindeki sıra. */
  step: number;
  /** Adıma girildiği oyun günü ("üç gün oynat" adımı bunu okur). */
  stepDay: number;
  /** Adımın paneli açılıp okundu mu (panel adımları kapanınca ilerler). */
  seen: boolean;
}

export interface StepContext {
  state: GameState;
  view: ViewState;
  progress: TutorialProgress;
}

export interface TutorialStep {
  id: TutorialStepId;
  /**
   * Halkayla çevrelenecek öğe. İlk GÖRÜNÜR eşleşme kullanılıyor: dar
   * ekranda paneller katlı olduğu için liste sonunda katlama başlıkları
   * var — kart görünmüyorsa oyuncuya önce paneli açmasını gösteriyor.
   */
  targets: string[];
  /** Bu panel açılınca kart panelin anlatımına geçer, kapanınca adım biter. */
  panel?: ViewState['openPanel'];
  /** Oyun durumundan tamamlanma. Yoksa adım yalnızca düğmeyle geçer. */
  done?: (ctx: StepContext) => boolean;
  /** Düğme metni; yoksa düğme "İleri" (panel adımları) ya da hiç yok. */
  action?: MessageKey;
}

function ownedTiles(state: GameState): number {
  const id = state.playerCompanyId;
  let count = 0;
  for (const tile of state.map.tiles) if (tile.ownerId === id) count++;
  return count;
}

function ownedShops(state: GameState): number {
  const id = state.playerCompanyId;
  let count = 0;
  for (const building of Object.values(state.buildings)) {
    if (building.companyId !== id) continue;
    const role = BUILDING_BY_ID[building.defId]?.role;
    if (role === 'outlet' || role === 'rental') count++;
  }
  return count;
}

/** Seçili kare doğrudan satın alınabilir boş bir parsel mi? */
function buyableSelected({ state, view }: StepContext): boolean {
  if (view.selectedTileId === null) return false;
  const tile = state.map.tiles[view.selectedTileId];
  if (!tile || tile.kind !== 'plot' || tile.ownerId || tile.structureId || tile.buildingId) return false;
  return isDistrictOpen(state, tile.districtId);
}

/** Panel adımı: panel açılıp okunduktan sonra kapandı. */
const panelRead = (ctx: StepContext): boolean => ctx.progress.seen && ctx.view.openPanel === 'none';

/*
 * SIRA OYUNUN KENDİ DÖNGÜSÜ: fırsatı gör → arsayı al → doğru binayı kur →
 * zamanı akıt → sıradaki hedef → büyüyünce zincir ve borsa. Son üç adım
 * bir şey yaptırmıyor, nerede olduğunu gösteriyor: zincir ve borsa ilk
 * dakikalarda kullanılacak araçlar değil ama varlıklarını bilmeyen oyuncu
 * ilk baskında hazırlıksız yakalanıyor.
 *
 * Önden giden oyuncu: "arsa aldı" olan biri için mercek ve seçim adımları
 * da tamam sayılıyor (`ownedTiles`). Böylece rehber, oyuncunun zaten
 * geçtiği bir adımda takılı kalmıyor.
 */
export const TUTORIAL_STEPS: TutorialStep[] = [
  { id: 'welcome', targets: [], action: 'app.coach.start' },
  {
    id: 'lens',
    targets: ['[data-lens="opportunity"]', '[data-collapse="lens"]'],
    done: (ctx) => ctx.view.lens === 'opportunity' || ownedTiles(ctx.state) > 0,
  },
  {
    id: 'pick',
    targets: [],
    done: (ctx) => buyableSelected(ctx) || ownedTiles(ctx.state) > 0,
  },
  {
    id: 'buy',
    targets: ['[data-action="buy-tile"]'],
    done: (ctx) => ownedTiles(ctx.state) > 0,
  },
  {
    id: 'choose',
    targets: ['.buildcard:has(.buildcard-best)', '[data-action="show-build"]', '.buildlist', '[data-collapse="build"]'],
    done: (ctx) => {
      if (ownedShops(ctx.state) > 0) return true;
      const role = ctx.view.ghostDefId ? BUILDING_BY_ID[ctx.view.ghostDefId]?.role : undefined;
      return role === 'outlet' || role === 'rental';
    },
  },
  {
    id: 'build',
    targets: ['[data-action="build-here"]', '[data-action="build-selected"]'],
    done: (ctx) => ownedShops(ctx.state) > 0,
  },
  {
    id: 'play',
    targets: ['.speeds'],
    // Üç gün: ilk satışlar defterde görünsün, oyuncu üst barda kârı görsün.
    done: (ctx) => ctx.state.time.speed > 0 && ctx.state.time.day >= ctx.progress.stepDay + 3,
  },
  { id: 'goals', targets: ['[data-agenda="goal"] button', '[data-agenda="goal"]'], panel: 'goals', done: panelRead },
  { id: 'chain', targets: ['[data-panel="chain"]'], panel: 'chain', done: panelRead },
  { id: 'rivals', targets: ['[data-panel="bourse"]'], panel: 'bourse', done: panelRead },
  { id: 'done', targets: [], action: 'app.coach.finish' },
];

/**
 * Bir sonraki adım. Tamamlanmış adımlar atlanıyor (önden giden oyuncu),
 * ama yalnızca durumdan okunabilenler: düğmeyle geçen ve panel adımları
 * oyuncunun bir şey okumasını istiyor, kendiliğinden geçmiyor.
 */
export function advance(progress: TutorialProgress, state: GameState, view: ViewState): TutorialProgress {
  let step = progress.step + 1;
  while (step < TUTORIAL_STEPS.length - 1) {
    const def = TUTORIAL_STEPS[step]!;
    if (def.panel || !def.done) break;
    const next: TutorialProgress = { step, stepDay: state.time.day, seen: false };
    if (!def.done({ state, view, progress: next })) break;
    step++;
  }
  return { step, stepDay: state.time.day, seen: false };
}

// ------------------------------------------------------------------ depo

// Depo ayrı modülde (Tur 46): kurulum ekranı "rehberi gördü mü"yü okuyor,
// adımların denetimi ise oyunun sistemlerini içe aktarıyor.
export { setTutorial, startTutorial, tutorialKey, tutorialSeen, useTutorial } from './tutorialStore';

/** Test kancası: oyuncu hangi adımda (yoksa null). */
export function tutorialStepOf(state: GameState): TutorialStepId | null {
  const progress = tutorialProgress(tutorialKey(state));
  return progress ? (TUTORIAL_STEPS[progress.step]?.id ?? null) : null;
}

