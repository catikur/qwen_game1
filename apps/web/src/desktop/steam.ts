import { steamAchievementNames } from '@capital/content';
import { setSteamLeague, setWorkshopBridge } from '@capital/ui';
import type { SteamFriendScore, SteamScore, WorkshopListing, WorkshopPublished } from '@capital/ui';
import { TEXT_INPUT_EVENT } from '../textInput';
import type { TextField } from '../textInput';
import type { Invoke } from './bridge';

/**
 * Steam başarımları (Tur 70). Kariyer rozeti açılınca (`career.ts`) kabuk
 * aynı adlı Steam başarımını açıyor (`apps/desktop/src-tauri/src/steam.rs`).
 *
 * Kaynak kariyer deposu: açılmış rozetlerin listesi her değiştiğinde henüz
 * bildirilmemiş olanlar gidiyor. Açılışta da bir kez: Steam kapalıyken ya
 * da web sürümünde açılıp dosyayla gelen rozetler böyle yetişiyor. Bildirmek
 * idempotent; Steam açık başarımı yeniden açmıyor.
 *
 * Steam yoksa (Steam'siz derleme, istemci kapalı, oyun Steam'den
 * açılmamış) bir kez söylenip bırakılıyor; oyun aynı.
 *
 * Ekran klavyesi (Tur 72): kumanda bir yazı alanını seçince Steam'in
 * klavyesi alanın yanında açılıyor. Steam yeri pencerenin fiziksel
 * pikselinde istiyor; sayfanınki CSS pikseli.
 *
 * Workshop ve skor tabloları (Tur 73): arayüzün köprüleri kabuğun
 * komutlarına bağlanıyor (`packages/ui/src/workshop.ts`, `steamLeague.ts`).
 * Steam yoksa köprü yok; raf ve lig paneli Steam'siz hâliyle.
 */
export interface SteamStatus {
  available: boolean;
  detail: string;
  /** Oturumdaki Steam hesabı (SteamID64, metin); Steam açıkken. */
  account?: string;
}

export interface CareerSource {
  unlockedIds(): string[];
  subscribe(listener: () => void): () => void;
}

/** Yazı alanı haberinin geldiği yer: sayfanın penceresi; testte sahtesi. */
export interface KeyboardHost {
  addEventListener(type: string, listener: (event: Event) => void): void;
  readonly devicePixelRatio?: number;
}

export async function initSteam(
  invoke: Invoke,
  career: CareerSource,
  host: KeyboardHost | undefined = globalThis.window,
): Promise<SteamStatus> {
  let status: SteamStatus;
  try {
    status = await invoke<SteamStatus>('steam_status');
  } catch (error) {
    status = { available: false, detail: String(error) };
  }
  if (!status.available) {
    console.info(`Steam başarımları kapalı: ${status.detail}`);
    return status;
  }
  const sent = new Set<string>();
  const sync = () => {
    const names = steamAchievementNames(career.unlockedIds()).filter((name) => !sent.has(name));
    if (names.length === 0) return;
    for (const name of names) sent.add(name);
    invoke('steam_unlock', { names }).catch((error: unknown) => {
      // Gitmediyse bir sonraki değişiklikte yeniden denensin.
      for (const name of names) sent.delete(name);
      console.warn('Steam başarımı bildirilemedi:', error);
    });
  };
  sync();
  career.subscribe(sync);
  // Workshop'un öğe kimlikleri hesaba göre saklanıyor (Codex #103). Kabuk
  // Steam açıkken hesabı hep veriyor; vermezse Workshop yok.
  if (status.account) {
    setWorkshopBridge({
      account: status.account,
      list: () => invoke<WorkshopListing>('steam_workshop_list'),
      publish: (request) => invoke<WorkshopPublished>('steam_workshop_publish', { request }),
      open: (page) => invoke<boolean>('steam_workshop_open', { target: typeof page === 'string' ? page : page.item }),
    });
  }
  setSteamLeague({
    upload: (boardId, score) => invoke<SteamScore>('steam_leaderboard_upload', { weekId: boardId, score }),
    friends: (boardId) => invoke<SteamFriendScore[]>('steam_leaderboard_friends', { weekId: boardId }),
  });
  host?.addEventListener(TEXT_INPUT_EVENT, (event) => {
    const field = (event as CustomEvent<TextField>).detail;
    const scale = host.devicePixelRatio || 1;
    const [x, y, width, height] = [field.x, field.y, field.width, field.height].map((value) => Math.round(value * scale));
    invoke<boolean>('steam_keyboard', { x, y, width, height, multiline: field.multiline === true }).catch((error: unknown) => {
      console.warn('Ekran klavyesi açılamadı:', error);
    });
  });
  return status;
}
