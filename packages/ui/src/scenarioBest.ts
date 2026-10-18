import { SCENARIO_BY_ID } from '@capital/content';

/**
 * Senaryoların bu cihazdaki en iyi sonuçları (Tur 39).
 *
 * Kullanıcı "yıldız + yerel en iyi"yi seçti: doğrulanan ortak tablo yok,
 * sonuç yalnızca bu tarayıcıda. Yıldızı çok olan iyi; eşitlikte senaryonun
 * ölçüsü (gün: az iyi, öndelik: çok iyi). Kaybedilen koşu en iyiyi
 * değiştirmiyor, deneme sayısına giriyor.
 */
const STORAGE_KEY = 'capitalforge.scenarios.v1';

export interface ScenarioRecord {
  /** En iyi sonuç; hiç kazanılmadıysa yok. */
  best?: { stars: number; score: number; run: string };
  /** Biten koşu sayısı (kazanılan ve kaybedilen). */
  attempts: number;
  /** Sayılmış son koşunun kimliği (`scenarioRunKey`) — sonuç ekranı yeniden açılınca iki kez sayılmasın. */
  last?: string;
}

let memory: Record<string, ScenarioRecord> = {};
let loaded = false;

function read(): Record<string, ScenarioRecord> {
  if (loaded) return memory;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (parsed && typeof parsed === 'object') memory = parsed as Record<string, ScenarioRecord>;
  } catch {
    // Depo kapalı ya da bozuk: oturum boyunca bellekte.
  }
  return memory;
}

function write(next: Record<string, ScenarioRecord>): void {
  memory = next;
  loaded = true;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Kaydedilemedi: bellekteki kopya oturum boyunca geçerli.
  }
}

export function scenarioRecord(id: string): ScenarioRecord {
  return read()[id] ?? { attempts: 0 };
}

/** `a` sonucu `b`den iyi mi? */
function better(id: string, a: { stars: number; score: number }, b: { stars: number; score: number }): boolean {
  if (a.stars !== b.stars) return a.stars > b.stars;
  const metric = SCENARIO_BY_ID[id]?.stars.metric ?? 'days';
  return metric === 'days' ? a.score < b.score : a.score > b.score;
}

/**
 * Biten koşuyu kaydeder. `runKey` koşuyu tanımlıyor (`scenarioRunKey`):
 * sonuç ekranı yeniden açılınca aynı koşu ikinci kez sayılmıyor. Dönen
 * değer: bu koşu cihazdaki en iyi sonuç mu.
 */
export function recordScenarioResult(id: string, runKey: string, stars: number, score: number): boolean {
  const all = read();
  const record = all[id] ?? { attempts: 0 };
  if (record.last !== runKey) {
    const improved = stars > 0 && (!record.best || better(id, { stars, score }, record.best));
    const best = improved ? { stars, score, run: runKey } : record.best;
    write({ ...all, [id]: { attempts: record.attempts + 1, last: runKey, ...(best ? { best } : {}) } });
  }
  return scenarioRecord(id).best?.run === runKey;
}

/**
 * Koşunun kimliği: kuruluş anı, bitiş günü ve sonuç (Codex #66). Kuruluş
 * anı ve gün tek başına yetmiyordu: kayıttan dönüp aynı gün başka bir
 * sonuçla biten koşu (Krizin ortasında hep son gün bitiyor) aynı kimliği
 * alıyor, daha iyi sonucu da sayılmıyordu. Aynı sonuç — sonuç ekranı
 * yeniden açıldı — aynı kimlik.
 */
export function scenarioRunKey(run: { createdAtIso: string; finishedDay: number | undefined; outcome?: string; score?: number }): string {
  return `${run.createdAtIso}:${run.finishedDay ?? ''}:${run.outcome ?? ''}:${run.score ?? ''}`;
}
