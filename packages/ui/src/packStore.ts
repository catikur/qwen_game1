import { useSyncExternalStore } from 'react';
import { packScenarioId, registerPack, unregisterPack, validatePack } from '@capital/content';
import type { Pack, PackScenario, ScenarioDef } from '@capital/content';
import { forgetScenarioRecord } from './scenarioBest';

/*
 * Yüklü içerik paketleri (Tur 67), bu tarayıcıda. Paket doğrulanmış
 * JSON'uyla saklanıyor; her açılışta yeniden doğrulanıp oyuna tanıtılıyor
 * (`registerPack`): depoyu elle bozan ya da eski bir sürümün bıraktığı
 * paket sessizce düşüyor, oyunu kırmıyor. Senaryonun kendisi oynanınca
 * kayda da giriyor (`state.scenario.pack`): kayıt paket silinse de açılıyor.
 */

const STORAGE_KEY = 'capitalforge.packs.v1';
/** Yüklenebilen paket sayısı; her biri en fazla 12 senaryo. */
export const MAX_PACKS = 20;

export interface InstalledPack {
  pack: Pack;
  scenarios: ScenarioDef[];
}

let memory: InstalledPack[] | null = null;
const listeners = new Set<() => void>();

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

function write(next: InstalledPack[]): void {
  memory = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next.map((entry) => entry.pack)));
  } catch {
    // Kaydedilemedi: bellekteki liste oturum boyunca geçerli.
  }
  for (const listener of listeners) listener();
}

export function installedPacks(): InstalledPack[] {
  return read();
}

export type AddOutcome = { status: 'added' | 'updated'; entry: InstalledPack } | { status: 'full' };

/** Anahtarları sıralı JSON: aynı içerik, alanların sırası farklı da olsa aynı metin. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Senaryonun oynanışı: metinler dışında her şey, kurallar ayarlarıyla. Yeni
 * sürümde bu değiştiyse cihazdaki skor eski oyunun skoru.
 */
function playKey(pack: Pack, scenario: PackScenario): string {
  const { title: _title, tagline: _tagline, brief: _brief, goalText: _goalText, facts: _facts, rules, ...play } = scenario;
  const resolved = (rules ?? []).map((ref) => {
    const rule = (pack.rules ?? []).find((entry) => entry.id === ref);
    return rule ? { base: rule.base, params: rule.params ?? {} } : ref;
  });
  return stable({ ...play, rules: resolved });
}

/**
 * Doğrulanmış paketi yükler; aynı kimlikli paket varsa yerine geçiyor
 * (yeni sürüm). Eski sürümde olup yenisinde olmayan senaryo oyundan çıkıyor.
 */
export function addPack(pack: Pack): AddOutcome {
  const current = read();
  const index = current.findIndex((entry) => entry.pack.id === pack.id);
  if (index < 0 && current.length >= MAX_PACKS) return { status: 'full' };
  if (index >= 0) {
    const old = current[index]!.pack;
    for (const scenario of pack.scenarios) {
      const previous = old.scenarios.find((entry) => entry.id === scenario.id);
      if (previous && playKey(old, previous) !== playKey(pack, scenario)) forgetScenarioRecord(packScenarioId(pack.id, scenario.id));
    }
    unregisterPack(pack.id);
  }
  const entry: InstalledPack = { pack, scenarios: registerPack(pack) };
  const next = index >= 0 ? current.map((item, i) => (i === index ? entry : item)) : [...current, entry];
  write(next);
  return { status: index >= 0 ? 'updated' : 'added', entry };
}

export function removePack(packId: string): void {
  unregisterPack(packId);
  write(read().filter((entry) => entry.pack.id !== packId));
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useInstalledPacks(): InstalledPack[] {
  return useSyncExternalStore(subscribe, read, read);
}
