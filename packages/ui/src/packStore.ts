import { useSyncExternalStore } from 'react';
import { registerPack, unregisterPack, validatePack } from '@capital/content';
import type { Pack, ScenarioDef } from '@capital/content';
import { subscribeWorkshop, workshopBridge } from './workshop';
import type { WorkshopItem, WorkshopListing } from './workshop';

/*
 * Yüklü içerik paketleri (Tur 67), bu tarayıcıda. Paket doğrulanmış
 * JSON'uyla saklanıyor; her açılışta yeniden doğrulanıp oyuna tanıtılıyor
 * (`registerPack`): depoyu elle bozan ya da eski bir sürümün bıraktığı
 * paket sessizce düşüyor, oyunu kırmıyor. Senaryonun kendisi oynanınca
 * kayda da giriyor (`state.scenario.pack`): kayıt paket silinse de açılıyor.
 *
 * Steam Workshop'un paketleri (Tur 73) aynı rafta, salt okunur: abone olunan
 * öğeleri kabuk veriyor (`workshop.ts`), depoya yazılmıyor, abonelik
 * bırakılınca gidiyor. Aynı kimlikte oyuncunun kendi paketi varsa o geçiyor.
 */

const STORAGE_KEY = 'capitalforge.packs.v1';
/** Yüklenebilen paket sayısı; her biri en fazla 12 senaryo. */
export const MAX_PACKS = 20;
/** Workshop'tan rafa en çok bu kadar paket. */
export const MAX_WORKSHOP_PACKS = 40;

export interface InstalledPack {
  pack: Pack;
  scenarios: ScenarioDef[];
  /** Workshop'tan geldiyse öğenin kimliği. */
  workshop?: string;
}

let memory: InstalledPack[] | null = null;
const listeners = new Set<() => void>();

/** Workshop'un doğrulanmış paketleri, öğe sırasıyla; rafta olanlar `workshopShown`. */
let workshopSource: { item: string; text: string; pack: Pack }[] = [];
let workshopKey = '';
let workshopShown: InstalledPack[] = [];
/** Abone olunup henüz inmemiş öğeler (Steam indiriyor). */
let downloadingCount = 0;
const downloadListeners = new Set<() => void>();
/** Rafın bütünü: önce oyuncunun paketleri. Değişene kadar aynı dizi (useSyncExternalStore). */
let combined: InstalledPack[] | null = null;

function read(): InstalledPack[] {
  if (memory) return memory;
  const list: InstalledPack[] = [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      for (const doc of parsed.slice(0, MAX_PACKS)) {
        const result = validatePack(doc);
        if (result.ok && !list.some((entry) => entry.pack.id === result.pack.id)) {
          list.push({ pack: result.pack, scenarios: registerPack(result.pack) });
        }
      }
    }
  } catch {
    // Depo kapalı ya da bozuk: oturum boyunca bellekte.
  }
  memory = list;
  return list;
}

function emit(): void {
  for (const listener of listeners) listener();
}

function write(next: InstalledPack[]): void {
  memory = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next.map((entry) => entry.pack)));
  } catch {
    // Kaydedilemedi: bellekteki liste oturum boyunca geçerli.
  }
  syncWorkshop();
  emit();
}

/**
 * Raftaki Workshop paketlerini kaynağa ve oyuncunun paketlerine göre
 * kurar: kimliği oyuncunun paketinde olan geçmiyor, iki öğede aynı kimlik
 * varsa ilki. Raftan düşenin senaryoları oyundan çıkıyor; kalan aynı
 * nesneyle duruyor (seçili senaryonun tanımı değişmesin).
 */
function syncWorkshop(): void {
  const own = new Set(read().map((entry) => entry.pack.id));
  const taken = new Set(own);
  const winners = workshopSource.filter((source) => {
    if (taken.has(source.pack.id)) return false;
    taken.add(source.pack.id);
    return true;
  });
  const kept = workshopShown.filter((entry) => winners.some((source) => source.pack === entry.pack));
  // Önce çıkanlar: aynı kimliğin yeni sürümü ardından giriyor.
  for (const entry of workshopShown) {
    if (!kept.includes(entry) && !own.has(entry.pack.id)) unregisterPack(entry.pack.id);
  }
  workshopShown = winners.map(
    (source) => kept.find((entry) => entry.pack === source.pack) ?? { pack: source.pack, scenarios: registerPack(source.pack), workshop: source.item },
  );
  combined = null;
}

/**
 * Kabuğun verdiği Workshop öğeleri: her paket dosyası doğrulanıyor;
 * bozuk ya da sınırı aşan atlanıyor (oyunu kırmıyor). Liste aynıysa
 * hiçbir şey değişmiyor.
 */
export function setWorkshopPacks(items: readonly WorkshopItem[]): { shown: number; skipped: number } {
  const key = JSON.stringify(items.map((item) => [item.id, item.packs]));
  if (key === workshopKey) return { shown: workshopShown.length, skipped: 0 };
  const next: typeof workshopSource = [];
  let skipped = 0;
  for (const item of items) {
    for (const text of item.packs) {
      if (next.length >= MAX_WORKSHOP_PACKS) {
        skipped++;
        continue;
      }
      // Değişmeyen dosya: önceki paket nesnesi, rafta da aynı kalıyor.
      const same = workshopSource.find((source) => source.item === item.id && source.text === text);
      if (same) {
        next.push(same);
        continue;
      }
      let doc: unknown;
      try {
        doc = JSON.parse(text);
      } catch {
        doc = null;
      }
      const result = validatePack(doc);
      if (!result.ok) {
        skipped++;
        console.warn(`Workshop öğesi ${item.id}: paket geçersiz (${result.issues.length} sorun).`);
        continue;
      }
      next.push({ item: item.id, text, pack: result.pack });
    }
  }
  workshopKey = key;
  workshopSource = next;
  syncWorkshop();
  emit();
  return { shown: workshopShown.length, skipped };
}

/** Kabuğun listesi: paketler rafa, inmekte olanların sayısı rafın notuna. */
export function applyWorkshopListing(listing: WorkshopListing): void {
  setWorkshopPacks(listing.items);
  const downloading = Math.max(0, Math.floor(listing.downloading) || 0);
  if (downloading === downloadingCount) return;
  downloadingCount = downloading;
  for (const listener of downloadListeners) listener();
}

let listing = 0;

/** Kabuktan Workshop'un güncel listesi (raf açılınca; köprü yoksa bir şey yapmıyor). */
export async function refreshWorkshop(): Promise<void> {
  const bridge = workshopBridge();
  if (!bridge) return;
  const turn = ++listing;
  try {
    const next = await bridge.list();
    // Arada başka bir liste istendiyse eskisi yazılmıyor.
    if (turn === listing) applyWorkshopListing(next);
  } catch (error) {
    console.warn('Workshop listesi alınamadı:', error);
  }
}

subscribeWorkshop(() => void refreshWorkshop());

function all(): InstalledPack[] {
  if (!combined) combined = workshopShown.length > 0 ? [...read(), ...workshopShown] : read();
  return combined;
}

/** Raftaki paketler: oyuncunun kendileri, ardından Workshop'unkiler. */
export function installedPacks(): InstalledPack[] {
  return all();
}

export type AddOutcome = { status: 'added' | 'updated'; entry: InstalledPack } | { status: 'full' };

/**
 * Doğrulanmış paketi yükler; aynı kimlikli paket varsa yerine geçiyor
 * (yeni sürüm). Eski sürümde olup yenisinde olmayan senaryo oyundan çıkıyor.
 */
export function addPack(pack: Pack): AddOutcome {
  const current = read();
  const index = current.findIndex((entry) => entry.pack.id === pack.id);
  if (index < 0 && current.length >= MAX_PACKS) return { status: 'full' };
  // Eski sürüm ya da aynı kimlikli Workshop paketi: senaryoları önce çıkıyor.
  if (index >= 0 || workshopShown.some((entry) => entry.pack.id === pack.id)) unregisterPack(pack.id);
  const entry: InstalledPack = { pack, scenarios: registerPack(pack) };
  const next = index >= 0 ? current.map((item, i) => (i === index ? entry : item)) : [...current, entry];
  write(next);
  return { status: index >= 0 ? 'updated' : 'added', entry };
}

/** Oyuncunun paketini kaldırır; Workshop'unki yalnız Steam'de aboneliği bırakınca gidiyor. */
export function removePack(packId: string): void {
  if (!read().some((entry) => entry.pack.id === packId)) return;
  unregisterPack(packId);
  write(read().filter((entry) => entry.pack.id !== packId));
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useInstalledPacks(): InstalledPack[] {
  return useSyncExternalStore(subscribe, all, all);
}

function subscribeDownloads(listener: () => void): () => void {
  downloadListeners.add(listener);
  return () => downloadListeners.delete(listener);
}

/** Workshop'tan inmekte olan öğe sayısı. */
export function workshopDownloading(): number {
  return downloadingCount;
}

export function useWorkshopDownloading(): number {
  return useSyncExternalStore(subscribeDownloads, workshopDownloading, workshopDownloading);
}
