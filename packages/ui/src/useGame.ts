import { createContext, useContext, useSyncExternalStore } from 'react';
import type { GameCommand, GameEngine, GameState, LensId } from '@capital/core';

/**
 * UI ↔ motor köprüsü.
 *
 * UI, state'i asla doğrudan değiştirmez; sadece komut gönderir. Motor
 * değişince bir sürüm sayacı artar, React o sayacı dinler. Bu tek yönlü
 * akış sayesinde arayüz simülasyonun kurallarını tekrar etmek zorunda
 * kalmaz — tek doğru kaynak çekirdektir.
 */

export interface ViewState {
  lens: LensId;
  selectedTileId: number | null;
  /**
   * Yerleştirme modundaki bina; null ise mod kapalı.
   * Fare altındaki kare bilinçli olarak burada tutulmaz: her fare
   * hareketinde React ağacını yeniden çizmemek için hover'ı render
   * katmanı kendi içinde yönetir.
   */
  ghostDefId: string | null;
  openPanel:
    | 'none'
    | 'chain'
    | 'rivalry'
    | 'auction'
    | 'bourse'
    | 'company'
    | 'rivals'
    | 'saves'
    | 'help'
    | 'goals';
}

export interface ToastMessage {
  id: number;
  text: string;
  tone: 'info' | 'good' | 'bad';
}

/**
 * Dışa aktarmanın gerçekte ne olduğu. Arayüz oyuncuya bunun dışında bir
 * şey söylemez: "indirildi" yalnızca `saved` iken doğru bir cümle.
 */
export type ExportOutcome = 'saved' | 'started' | 'copied' | 'declined' | 'blocked';

export interface GameContextValue {
  engine: GameEngine;
  view: ViewState;
  setView: (partial: Partial<ViewState>) => void;
  /** Komutu gönderir; reddedilirse gerekçesini toast olarak gösterir. */
  run: (command: GameCommand) => boolean;
  toast: (text: string, tone?: ToastMessage['tone']) => void;
  toasts: ToastMessage[];
  newGame: () => void;
  saveTo: (slot: number, name?: string) => Promise<void>;
  loadFrom: (slot: number) => Promise<void>;
  /** Kaydı dosya olarak verir; sonucu dürüstçe bildirir. */
  exportSave: () => Promise<ExportOutcome>;
  /** Kaydın JSON metni — her yerde çalışan elle aktarım yolu. */
  exportSaveText: () => string;
  importSave: (file: File) => Promise<void>;
  importSaveText: (text: string) => void;
  /**
   * Kamerayı bir yere götürür; kare verilirse onu seçer de. Gündem
   * çipleri ve haberler "olay yerine git" için bunu çağırıyor.
   */
  focusOn: (target: FocusTarget) => void;
}

export interface FocusTarget {
  tileId?: number;
  districtId?: number;
}

export const GameContext = createContext<GameContextValue | null>(null);

export function useGame(): GameContextValue {
  const value = useContext(GameContext);
  if (!value) throw new Error('useGame, GameContext sağlayıcısı içinde çağrılmalı.');
  return value;
}

/** Motorun sürüm sayacına abone olur; her değişimde yeniden çizdirir. */
export function useGameVersion(engine: GameEngine): number {
  return useSyncExternalStore(
    (onChange) => engine.subscribe(onChange),
    () => engine.getVersion(),
    () => engine.getVersion(),
  );
}

/** Güncel state'i okur ve motor değiştikçe bileşeni tazeler. */
export function useGameState(): GameState {
  const { engine } = useGame();
  useGameVersion(engine);
  return engine.getState();
}
