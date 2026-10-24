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
    | 'project'
    | 'bourse'
    | 'company'
    | 'rivals'
    | 'saves'
    | 'help'
    | 'goals'
    | 'council'
    | 'league'
    | 'cities'
    | 'career'
    | 'settings';
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
export type ExportOutcome = 'saved' | 'downloads' | 'started' | 'copied' | 'declined' | 'blocked';

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
  /**
   * Bir karenin (binası varsa çatısının) ekrandaki yeri, sayfa pikseliyle;
   * sahne yoksa null. Fırsat balonu (Tur 37c) her karede buna bağlanıyor.
   */
  projectTile?: (tileId: number) => { x: number; y: number; visible: boolean } | null;
  /** Şehrin kart için kuşbakışı karesi (Tur 64); sahne hazır değilse null. */
  snapshotCity?: (width: number, height: number) => Promise<HTMLCanvasElement | null>;
  /** Görseli dosya olarak verir (Tur 64); sonucu dürüstçe bildirir. */
  saveImage?: (filename: string, blob: Blob) => Promise<ExportOutcome>;
  /** Tohum Ligi tablosu — barındırıcıda paylaşılan, değilse bu tarayıcıya ait. */
  league: LeagueBoard;
  /** Ses manzarası: ilk dokunuşta başlar; sessize alma hatırlanır. */
  audio: { muted: boolean; toggle: () => void };
}

/** Tablodaki bir koşu. Kimlik ve "kim" barındırıcıdan gelir. */
export interface LeagueEntry {
  id: string;
  weekId: string;
  companyName: string;
  ceoId: string | null;
  score: number;
  curve: number[];
  /**
   * Doğrulama için koşu kodu (encodeRun). Lig sunucusunun tablosunda boş:
   * kod ayrı iniyor (`loadCode`), satırda yalnızca özeti var (`codeKey`).
   */
  code: string;
  /** Kodun değişmez özeti (sunucu verdiyse); doğrulama önbelleğinin anahtarı. */
  codeKey?: string;
  /** Kodu indir (lig sunucusu): doğrulama kuyruğu sırası gelince çağırıyor. */
  loadCode?: () => Promise<string>;
  submittedAt: string;
  /** Bu tarayıcının / bu kişinin koşusu mu. */
  mine?: boolean;
  /** Gönderen kişinin görünen adı (biliniyorsa). */
  who?: string;
  /**
   * Lig sunucusu koşuyu gönderimde yeniden oynattı, skor ve eğri tuttu
   * (Tur 52): tarayıcı satırı yeniden oynatmıyor.
   */
  verified?: boolean;
  /** Günlük boş (hiç oynanmamış koşu; sunucu söylüyor): kopya denetimi ayırmıyor. */
  idle?: boolean;
}

/**
 * Gönderimin sonucu. Lig sunucusunun kendi cevapları: bağlantı yok, gönderim
 * bekliyor (`queued`); şirket adı herkese açık tabloya giremiyor
 * (`name-blocked`); haftanın ligi kapandı (`closed`); sunucu yoğun (`busy`).
 * Tur 52: sunucu oyunun bu sürümünü henüz tanımıyor, koşu bekliyor
 * (`version`); tekrar tutmadı (`rejected`); başka oyuncunun koşusunun aynısı
 * (`copy`).
 */
export type LeagueSubmitOutcome = 'saved' | 'kept-better' | 'error' | 'queued' | 'name-blocked' | 'closed' | 'busy' | 'version' | 'rejected' | 'copy';

/** Davetli lig (Tur 55): ad, altı harflik kod, üye sayısı. */
export interface FriendLeague {
  code: string;
  name: string;
  members: number;
}

/**
 * Davetli lig isteğinin sonucu. `unknown-code`: böyle bir lig yok; `full`:
 * lig dolu; `limit`: oyuncunun lig hakkı doldu; `name` ve `name-blocked`:
 * ligin adı kurallara uymuyor ya da herkese açık olamaz.
 */
export type FriendOutcome = 'ok' | 'offline' | 'busy' | 'name' | 'name-blocked' | 'unknown-code' | 'full' | 'limit' | 'error';

/** Ligin bir tablosu (hafta ya da gün): üyelerin doğrulanmış koşuları. */
export interface FriendTable {
  name: string;
  members: number;
  entries: LeagueEntry[];
}

export interface FriendLeagues {
  /** Sunucu davetli ligleri tanıyor mu (sağlık ucunda `friends`). */
  available(): boolean;
  /** Liglerim; hesap yoksa boş, sunucuya ulaşılamazsa `null`. */
  list(): Promise<FriendLeague[] | null>;
  /** Lig kur ya da koda katıl; hesap yoksa açılıyor. */
  create(name: string): Promise<{ outcome: FriendOutcome; league?: FriendLeague }>;
  join(code: string): Promise<{ outcome: FriendOutcome; league?: FriendLeague }>;
  leave(code: string): Promise<boolean>;
  /** Ligin o hafta ya da o günkü tablosu; lig yoksa ya da üye değilsek `gone`, ulaşılamazsa `null`. */
  table(code: string, boardId: string): Promise<FriendTable | 'gone' | null>;
}

/** Tablonun durumu: sunucuya ulaşılamıyorsa son görülen tablo gösteriliyor. */
export interface LeagueFeedInfo {
  offline?: boolean;
}

/**
 * Lig tablosu sözleşmesi. Arayüz nerede saklandığını bilmiyor: paylaşılan
 * sayfada herkesin gördüğü bir tablo, lig sunucusunda herkese açık tablo
 * (Tur 51), yerelde yalnızca bu tarayıcının koşuları. `kind` bunu oyuncuya
 * dürüstçe söylemek için var.
 */
export interface LeagueBoard {
  kind: 'shared' | 'local' | 'server';
  subscribe(weekId: string, onChange: (entries: LeagueEntry[], info?: LeagueFeedInfo) => void): () => void;
  submit(entry: Omit<LeagueEntry, 'id' | 'mine' | 'who' | 'codeKey' | 'loadCode'>): Promise<LeagueSubmitOutcome>;
  /** Lig sunucusu: bu tarayıcının anonim hesabı (var mı; hesabı ve koşularını sil). */
  account?: { exists(): boolean; forget(): Promise<boolean> };
  /** Lig sunucusu (Tur 55): davetli ligler; sunucu tanımıyorsa `available()` yanlış. */
  friends?: FriendLeagues;
  /** Tablo bırakılınca (oyun ekranı kapandı): kalıcı dinleyiciler kalkıyor. */
  close?(): void;
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
