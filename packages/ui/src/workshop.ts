import { useSyncExternalStore } from 'react';

/*
 * Steam Workshop'un sayfadaki ucu (Tur 73). Masaüstü kabuğu Steam açıkken
 * kuruyor (`apps/web/src/desktop/steam.ts`); web sürümünde ve Steam'siz
 * derlemede yok, raf yalnız oyuncunun paketleri. Paket rafı geç iniyor
 * (`packStore.ts`); bu modül küçük: kabuk köprüyü raf inmeden kuruyor.
 *
 * Oyuncunun yüklediği paketin öğesi bu cihazda saklanıyor: aynı paketin
 * sonraki yüklemesi yeni öğe açmıyor, o öğeyi güncelliyor.
 */

/** Kurulu bir Workshop öğesi ve klasöründeki paket dosyalarının içi. */
export interface WorkshopItem {
  /** Öğenin kimliği; 64 bit, sayıda bozulmasın diye metin. */
  id: string;
  packs: string[];
}

/** Abone olunan öğeler: kurulu olanlar ve Steam'in henüz indirdikleri. */
export interface WorkshopListing {
  items: WorkshopItem[];
  downloading: number;
}

/** Steam'de açılacak sayfa: oyunun Workshop'u, Workshop sözleşmesi ya da bir öğe. */
export type WorkshopPage = 'workshop' | 'agreement' | { item: string };

export interface WorkshopPublish {
  /** Paket daha önce yüklendiyse öğesi: güncelleniyor. */
  item?: string;
  title: string;
  description: string;
  /** Paketin JSON'u. */
  pack: string;
  /** Değişiklik notu (öğenin geçmişinde). */
  note?: string;
}

/**
 * Steamworks'ün sınırları UTF-8 bayt, sondaki sıfır hariç: başlık 128,
 * açıklama ve değişiklik notu 7999 (kabuk da sınıyor, `workshop.rs`).
 * Karakter sayılınca Türkçe ya da Çince bir başlık sınırı aşıyordu (Codex #103).
 */
export const WORKSHOP_TITLE_BYTES = 128;
export const WORKSHOP_TEXT_BYTES = 7999;

/**
 * Metnin UTF-8'de en çok `limit` bayta sığan başı; karakter ortadan bölünmüyor.
 * NUL'lar atılıyor: Steamworks'ün alanları C metni, kabuk NUL'lu isteği
 * reddediyor. Paketin adında kaçışlı bir NUL olabiliyor (Codex #103).
 */
export function fitUtf8(text: string, limit: number): string {
  const clean = text.replaceAll('\0', '');
  const encoder = new TextEncoder();
  if (encoder.encode(clean).length <= limit) return clean;
  let used = 0;
  let fitted = '';
  for (const char of clean) {
    used += encoder.encode(char).length;
    if (used > limit) break;
    fitted += char;
  }
  return fitted;
}

export interface WorkshopPublished {
  id: string;
  /** Oyuncu Workshop sözleşmesini kabul etmemiş: Steam öğeyi o zamana kadar gizli tutuyor. */
  agreement: boolean;
  /**
   * Yeni öğe açıldı ama paket gitmedi (kabuğun nedeni). Kimlik yine saklanıyor:
   * sonraki yükleme bu öğeyi güncelliyor, Workshop'ta boş öğe birikmiyor (Codex #103).
   */
  failed?: string;
}

export interface WorkshopBridge {
  /**
   * Oturumdaki Steam hesabı (SteamID64). Öğe kimlikleri hesaba göre
   * saklanıyor: aynı bilgisayarda oynayan başka bir hesap öbürünün öğesini
   * güncellemeye kalkmıyor; Steam onu reddederdi (Codex #103).
   */
  readonly account: string;
  list(): Promise<WorkshopListing>;
  publish(request: WorkshopPublish): Promise<WorkshopPublished>;
  /** Sayfa Steam katmanında ya da Steam'in tarayıcısında; açılamadıysa yanlış. */
  open(page: WorkshopPage): Promise<boolean>;
}

let bridge: WorkshopBridge | null = null;
const listeners = new Set<() => void>();

export function setWorkshopBridge(next: WorkshopBridge | null): void {
  bridge = next;
  for (const listener of listeners) listener();
}

export function workshopBridge(): WorkshopBridge | null {
  return bridge;
}

export function subscribeWorkshop(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useWorkshopBridge(): WorkshopBridge | null {
  return useSyncExternalStore(subscribeWorkshop, workshopBridge, workshopBridge);
}

/** Sayfayı Steam'de açar; köprü hata verirse de açılmadı sayılıyor. Açıldıysa raf listeyi bir süre yokluyor. */
export async function openWorkshopPage(bridge: WorkshopBridge, page: WorkshopPage): Promise<boolean> {
  try {
    const opened = await bridge.open(page);
    if (opened) watchWorkshop();
    return opened;
  } catch {
    return false;
  }
}

/**
 * Steam'de bir Workshop sayfası açıldıktan sonra raf listeyi bir süre yokluyor
 * (Bugbot #103). Steam katmanı pencerenin odağını çoğu zaman almıyor, dönüşte
 * odak olayı gelmiyor: oyuncunun orada abone olduğu ya da bıraktığı öğe
 * yoklamayla rafa geliyor. İnen öğe ayrıca, bitene kadar yoklanıyor.
 */
export const WORKSHOP_WATCH_MS = 3 * 60_000;

let watching = false;
let watchTimer: ReturnType<typeof setTimeout> | undefined;
const watchListeners = new Set<() => void>();

function setWatching(next: boolean): void {
  if (watching === next) return;
  watching = next;
  for (const listener of watchListeners) listener();
}

/** Raf listeyi `WORKSHOP_WATCH_MS` boyunca yoklasın; yeniden çağrılınca süre baştan. */
export function watchWorkshop(): void {
  if (watchTimer !== undefined) clearTimeout(watchTimer);
  watchTimer = setTimeout(() => {
    watchTimer = undefined;
    setWatching(false);
  }, WORKSHOP_WATCH_MS);
  setWatching(true);
}

export function workshopWatching(): boolean {
  return watching;
}

function subscribeWatching(listener: () => void): () => void {
  watchListeners.add(listener);
  return () => watchListeners.delete(listener);
}

export function useWorkshopWatching(): boolean {
  return useSyncExternalStore(subscribeWatching, workshopWatching, () => false);
}

const PUBLISHED_KEY = 'capitalforge.workshop.v1';
/** Öğesinin kimliği sayı; bozuk kayıt yok sayılıyor. */
const ITEM_ID = /^\d{1,20}$/;

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** Steam hesabı → paket → öğe. */
function readPublished(): Record<string, Record<string, string>> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(PUBLISHED_KEY) ?? '{}');
    if (!isRecord(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter((pair): pair is [string, Record<string, unknown>] => isRecord(pair[1]))
        .map(([account, items]) => [
          account,
          Object.fromEntries(Object.entries(items).filter((pair): pair is [string, string] => typeof pair[1] === 'string' && ITEM_ID.test(pair[1]))),
        ]),
    );
  } catch {
    return {};
  }
}

/** Oyuncunun paketi bu Steam hesabında Workshop'ta hangi öğe; yüklenmediyse yok. */
export function publishedItem(account: string, packId: string): string | undefined {
  return readPublished()[account]?.[packId];
}

export function rememberPublished(account: string, packId: string, item: string): void {
  try {
    const all = readPublished();
    window.localStorage.setItem(PUBLISHED_KEY, JSON.stringify({ ...all, [account]: { ...all[account], [packId]: item } }));
  } catch {
    // Depo kapalı: sonraki yükleme yeni öğe açıyor.
  }
}
