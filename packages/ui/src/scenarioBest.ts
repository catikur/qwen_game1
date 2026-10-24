import { RULE_KEY, SCENARIO_BY_ID, rulesWith } from '@capital/content';
import type { ScenarioDef } from '@capital/content';

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
  /**
   * Paketten gelen senaryoda (Tur 67) kaydın ait olduğu sürümün oynanışı
   * (`playKey`). Paketin başka bir sürümü (güncelleme ya da kaldırıp başka
   * sürümü yükleme) oyunu değiştirdiyse eski skor yeni ölçüyle okunmuyor:
   * kayıt o sürüm için boş (Codex #97). Hazır senaryoda yok.
   */
  play?: string;
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

/** Anahtarları sıralı JSON: aynı içerik, alanların sırası farklı da olsa aynı metin. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Devrin varsayılanı 0 olan sayıları: devir onları doğruluk değeriyle okuyor (0, yazılmamış demek). */
const ZERO_DEFAULT = new Set(['builtDaysAgo', 'raiderStake', 'feud']);

/** Devrin etkisiz yazımları düşülüyor: `false`, boş liste ya da nesne, varsayılanı 0 olan alanda 0. */
function compactSetup(setup: ScenarioDef['setup']): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(setup)) {
    if (value === undefined || value === false || (ZERO_DEFAULT.has(key) && value === 0)) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (key === 'freeze' && value && typeof value === 'object') {
      const flags = Object.fromEntries(Object.entries(value).filter(([, flag]) => flag === true));
      if (Object.keys(flags).length > 0) out[key] = flags;
      continue;
    }
    out[key] = value;
  }
  return out;
}

/**
 * Paket senaryosunun oynanışı: metinler dışında tanımın her şeyi, çözülmüş
 * değerleriyle. Kurallar katalog sırasında ve tam değerleriyle (yazılmayan
 * ayar hazır değerinde: `firstDay: 160` yazmak yazmamakla aynı), devir
 * etkisiz yazımları düşülmüş: aynı oyunun farklı yazılışı aynı anahtar
 * (Codex #97). Hazır senaryoda yok.
 */
export function playKey(def: ScenarioDef | undefined): string | undefined {
  if (!def?.source) return undefined;
  const { seed, citySize, difficulty, preludeDays, modifiers, ruleOverrides, days, goal, stars, setup } = def;
  const values = rulesWith(ruleOverrides);
  const rules = Object.fromEntries((modifiers ?? []).map((id) => [id, values[RULE_KEY[id]]]));
  return stable({ seed, citySize, difficulty, preludeDays, rules, days, goal, stars, setup: compactSetup(setup) });
}

/** Senaryonun kaydı; paket senaryosunda yalnız aynı oynanışın kaydı (başka sürümünki boş). */
export function scenarioRecord(id: string, def: ScenarioDef | undefined = SCENARIO_BY_ID[id]): ScenarioRecord {
  const record = read()[id];
  if (!record) return { attempts: 0 };
  const play = playKey(def);
  return play !== undefined && record.play !== play ? { attempts: 0 } : record;
}

/** `a` sonucu `b`den iyi mi? */
function better(def: ScenarioDef | undefined, a: { stars: number; score: number }, b: { stars: number; score: number }): boolean {
  if (a.stars !== b.stars) return a.stars > b.stars;
  const metric = def?.stars.metric ?? 'days';
  return metric === 'days' ? a.score < b.score : a.score > b.score;
}

/**
 * Biten koşuyu kaydeder. `runKey` koşuyu tanımlıyor (`scenarioRunKey`):
 * sonuç ekranı yeniden açılınca aynı koşu ikinci kez sayılmıyor. Dönen
 * değer: bu koşu cihazdaki en iyi sonuç mu.
 */
export function recordScenarioResult(
  id: string,
  runKey: string,
  stars: number,
  score: number,
  /** Koşunun kendi tanımı (kayda gömülü sürüm); yoksa kayıt defterindeki. */
  def: ScenarioDef | undefined = SCENARIO_BY_ID[id],
): boolean {
  const all = read();
  // Başka sürümün kaydı bu koşunun ölçüsüyle karşılaştırılmıyor: yerine geçiyor.
  const record = scenarioRecord(id, def);
  const play = playKey(def);
  if (record.last !== runKey) {
    const improved = stars > 0 && (!record.best || better(def, { stars, score }, record.best));
    const best = improved ? { stars, score, run: runKey } : record.best;
    write({ ...all, [id]: { attempts: record.attempts + 1, last: runKey, ...(best ? { best } : {}), ...(play !== undefined ? { play } : {}) } });
  }
  return scenarioRecord(id, def).best?.run === runKey;
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
