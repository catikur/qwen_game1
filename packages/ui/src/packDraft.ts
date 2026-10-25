import { useSyncExternalStore } from 'react';
import { PACK_FORMAT, PACK_VERSION, packFromScenario } from '@capital/content';
import type { Pack, ScenarioDef } from '@capital/content';

/*
 * Editörün taslağı ve açık/kapalı durumu (Tur 68). Taslak tek: bu cihazda
 * kendiliğinden saklanıyor (`capitalforge.pack-draft.v1`; masaüstünde
 * profil dosyası, Steam Cloud'la). `saved` taslağın son kaydedildiği ya da
 * raftan açıldığı hâlin JSON'u: ondan farklıysa taslakta kaydedilmemiş
 * değişiklik var.
 */

const STORAGE_KEY = 'capitalforge.pack-draft.v1';

export interface Draft {
  doc: Pack;
  /** Son kaydedilen (ya da raftan açılan) hâl; yeni taslakta başlangıç hâli. */
  saved: string;
  /** Açık senaryonun sırası. */
  index: number;
}

export function loadDraft(): Draft | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    if (!parsed || typeof parsed !== 'object' || !parsed.doc || typeof parsed.doc !== 'object') return null;
    return { doc: parsed.doc, saved: typeof parsed.saved === 'string' ? parsed.saved : '', index: typeof parsed.index === 'number' ? parsed.index : 0 };
  } catch {
    return null;
  }
}

export function storeDraft(draft: Draft): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Depo kapalı ya da dolu: taslak oturum boyunca editörde.
  }
}

export function clearDraft(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Depo kapalı.
  }
}

/** Taslakta kaydedilmemiş değişiklik var mı. */
export function draftDirty(draft: Draft | null): boolean {
  return !!draft && JSON.stringify(draft.doc) !== draft.saved;
}

/** Yazmaya başlamak için: seçili hazır senaryonun paketteki hâli, kendi kimliğiyle. */
export function draftFrom(def: ScenarioDef, packId = 'paketim'): Pack {
  return packFromScenario(def, packId);
}

/**
 * Depodan okunan taslağın belgesi: senaryosu olmayan ya da hedefi bozuk
 * (elle oynanmış, eski) taslak yerine yenisi; biçim ve sürüm her zaman yerinde.
 */
export function normalizedDraft(raw: unknown, fallback: () => Pack): Pack {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallback();
  const doc = raw as Pack;
  if (!Array.isArray(doc.scenarios) || doc.scenarios.length === 0 || doc.scenarios.some((s) => !s || typeof s !== 'object' || !s.goal || typeof s.goal !== 'object')) return fallback();
  return { ...doc, format: PACK_FORMAT, version: PACK_VERSION };
}

/** Yeni ya da raftan açılan belgeyle taslak: başlangıç hâli kaydedilmiş sayılıyor. */
export function freshDraft(doc: Pack, index = 0): Draft {
  return { doc, saved: JSON.stringify(doc), index };
}

// ------------------------------------------------------------ Açık mı

/** Açık editörün taslağı; `revision` her açılışta yeni (editör baştan kuruluyor). */
export interface OpenDraft {
  draft: Draft;
  revision: number;
}

let open: OpenDraft | null = null;
let revision = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Editörü bu taslakla açar (ve saklar). */
export function openEditor(draft: Draft): void {
  storeDraft(draft);
  open = { draft, revision: ++revision };
  emit();
}

export function closeEditor(): void {
  open = null;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useOpenDraft(): OpenDraft | null {
  return useSyncExternalStore(subscribe, () => open, () => open);
}

/*
 * "Dene" (Tur 68): taslaktan başlayan koşu bitince ya da oyuncu menüye
 * dönünce editör kaldığı yerden açılıyor. Bellekte: sayfa yenilenirse
 * taslak yine depoda, raftan açılıyor.
 */
let trial = false;

export function markTrial(): void {
  trial = true;
}

/** Deneme sürüyordu: işareti alıp siliyor. */
export function takeTrial(): boolean {
  const was = trial;
  trial = false;
  return was;
}
