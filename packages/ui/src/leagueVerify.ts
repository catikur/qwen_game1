import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { fnv, rankLeague, simFingerprintAsync, verifyRun } from '@capital/core';
import type { LeagueStanding, RunVerdict } from '@capital/core';
import type { LeagueEntry } from './useGame';

/**
 * Tablonun doğrulama kuyruğu (Tur 31).
 *
 * Her satır bu tarayıcıda yeniden oynanıyor; sıralama yalnızca doğrulanmış
 * koşulardan (`rankLeague`). Tekrar pahalı (360 gün, bir koşu ~1–3 sn),
 * bu yüzden:
 *   - tek tek, beyan edilen skora göre: tablonun tepesi önce oturuyor;
 *   - sonuç önbellekte (yerel depo): bir kod bu tarayıcıda bir kez
 *     doğrulanıyor. Anahtar kod + satırın beyanı; her sonuç doğrulandığı
 *     simülasyonun izini taşıyor ve iz uymayan sonuç okunmuyor — oyun
 *     güncellenince eski sonuçlar kendiliğinden geçersiz. İz arka planda,
 *     parça parça hesaplanıyor (ilk çizimi bekletmesin);
 *   - kuyruk yalnızca lig paneli açıkken işliyor: oyun sürerken arka
 *     planda tekrar koşup kare düşürmesin. Gündem çipindeki hayalet
 *     önbellekteki sonuçları okuyor.
 */

const STORE_KEY = 'capitalforge.league.verdicts.v1';
const STORE_MAX = 300;

interface Cached {
  sim: string;
  verdict: RunVerdict;
}

const verdicts = new Map<string, Cached>();
let sim: string | null = null;
let simReady: Promise<string> | null = null;

/** Simülasyon izi: ilk ihtiyaçta arka planda hesaplanıyor, hazır olunca tablo yeniden çiziliyor. */
function ensureSim(): Promise<string> {
  simReady ??= simFingerprintAsync().then((value) => {
    sim = value;
    notify();
    return value;
  });
  return simReady;
}
let loaded = false;
const listeners = new Set<() => void>();
let version = 0;
let running: { key: string; day: number } | null = null;
const queue: Array<{ key: string; entry: LeagueEntry }> = [];
let pumping = false;
let activeViews = 0;

function load(): void {
  if (loaded) return;
  loaded = true;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const rows = raw ? (JSON.parse(raw) as Array<[string, Cached]>) : [];
    for (const [key, cached] of rows) if (cached && typeof cached.sim === 'string' && cached.verdict) verdicts.set(key, cached);
  } catch {
    // Depo kapalı ya da bozuk: bu oturumda bellekte.
  }
}

function save(): void {
  try {
    const rows = [...verdicts.entries()].slice(-STORE_MAX);
    localStorage.setItem(STORE_KEY, JSON.stringify(rows));
  } catch {
    // Kaydedilemedi: sonuç bu oturum boyunca geçerli.
  }
}

function notify(): void {
  version++;
  listeners.forEach((listener) => listener());
}

/**
 * Satırın önbellek anahtarı: kod ve beyan. Lig sunucusu kodun özetini
 * veriyor (`codeKey`, kod ayrı iniyor); öbür tablolarda kodun kendisi var.
 */
export function keyOf(entry: LeagueEntry): string {
  const claim = JSON.stringify([entry.weekId, entry.score, entry.companyName, entry.ceoId]);
  return `${entry.codeKey ?? fnv(entry.code)}:${fnv(claim)}`;
}

/**
 * Satırın kodu: satırda varsa o, yoksa indiriliyor (lig sunucusu). İnmezse
 * (bağlantı yok) `null`: satır sonuçsuz kalıyor, tablo bir sonraki
 * tazelenişte yeniden sıraya koyuyor.
 */
export async function codeOf(entry: LeagueEntry): Promise<string | null> {
  if (entry.code) return entry.code;
  if (!entry.loadCode) return '';
  try {
    return await entry.loadCode();
  } catch {
    return null;
  }
}

/**
 * Bu sürümde geçerli sonuç; iz henüz hesaplanmadıysa ya da sonuç eski
 * sürümdense yok. Lig sunucusunun doğruladığı satır (Tur 52) tekrar
 * beklemeden sonuçlu: skor ve eğri sunucunun tekrarından.
 */
export function verdictFor(entry: LeagueEntry): RunVerdict | undefined {
  if (entry.verified) return { status: 'ok', score: entry.score, curve: entry.curve, companyName: entry.companyName, ceoId: entry.ceoId, idle: entry.idle === true };
  load();
  void ensureSim();
  if (!sim) return undefined;
  const cached = verdicts.get(keyOf(entry));
  return cached && cached.sim === sim ? cached.verdict : undefined;
}

/** Doğrulanıyorsa günü, sıradaysa 0, değilse null. */
export function progressFor(entry: LeagueEntry): number | null {
  const key = keyOf(entry);
  if (running?.key === key) return running.day;
  return queue.some((item) => item.key === key) ? 0 : null;
}

function enqueue(entries: readonly LeagueEntry[]): void {
  load();
  let added = false;
  for (const entry of entries) {
    // Sunucunun doğruladığı satır bu tarayıcıda yeniden oynanmıyor (Tur 52).
    if (entry.verified) continue;
    const key = keyOf(entry);
    const cached = verdicts.get(key);
    if ((cached && sim && cached.sim === sim) || running?.key === key || queue.some((item) => item.key === key)) continue;
    queue.push({ key, entry });
    added = true;
  }
  if (!added) return;
  // Tablonun tepesi önce: beyan edilen skor yüksekten düşüğe.
  queue.sort((a, b) => b.entry.score - a.entry.score);
  notify();
  void pump();
}

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    const current = await ensureSim();
    while (activeViews > 0 && queue.length > 0) {
      const { key, entry } = queue.shift()!;
      // İz hesaplanmadan sıraya girmiş olabilir: önbellekte bu sürümün sonucu varsa tekrar yok.
      if (verdicts.get(key)?.sim === current) {
        notify();
        continue;
      }
      running = { key, day: 0 };
      notify();
      const code = await codeOf(entry);
      if (code === null) {
        running = null;
        notify();
        continue;
      }
      const verdict = await verifyRun(
        code,
        { weekId: entry.weekId, score: entry.score, companyName: entry.companyName, ceoId: entry.ceoId },
        {
          yieldEvery: 10,
          onProgress: (day) => {
            if (running) running.day = day;
            notify();
          },
        },
      );
      verdicts.set(key, { sim: current, verdict });
      save();
      running = null;
      notify();
    }
  } finally {
    pumping = false;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Tablonun doğrulanmış hâli. `verify` açıkken eksik satırlar kuyruğa
 * giriyor ve kuyruk işliyor; kapalıyken yalnızca önbellek okunuyor.
 */
export function useLeagueStanding(entries: readonly LeagueEntry[], verify: boolean): LeagueStanding<LeagueEntry> {
  const tick = useSyncExternalStore(subscribe, () => version, () => 0);
  useEffect(() => {
    if (!verify) return;
    activeViews++;
    enqueue(entries);
    void pump();
    return () => {
      activeViews--;
    };
  }, [verify, entries]);
  // `tick` her doğrulama ilerleyişinde değişiyor: sıralama yeniden kuruluyor.
  return useMemo(() => rankLeague(entries, verdictFor), [entries, tick]);
}

/** Test kancası: önbelleği ve kuyruğu boşaltır. */
export function resetLeagueVerdicts(): void {
  verdicts.clear();
  queue.length = 0;
  running = null;
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    // depo kapalı
  }
  notify();
}
