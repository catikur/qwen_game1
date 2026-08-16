import { ERAS, ERA_BY_ID, EVENTS } from '@capital/content';
import type { CategoryId } from '@capital/content';
import { createRng, nextFloat, pickWeighted } from '../rng';
import { pushNews } from '../news';
import type { GameState } from '../types';

export interface EventModifiers {
  demand: Record<CategoryId, number>;
  /** Sadece belirli arketipe uygulanan çarpanlar. */
  archetypeDemand: Array<{ archetype: string; multipliers: Partial<Record<CategoryId, number>> }>;
  /** Ürün → spot fiyat çarpanı. Zinciri olan oyuncu bundan etkilenmez. */
  goodPrice: Record<string, number>;
  costMultiplier: number;
  landValueDrift: number;
}

/**
 * Aktif olayların birleşik etkisi.
 *
 * Hem pazar hem tedarik adımı bunu okur; olayların nereye dokunduğu tek
 * yerde toplansın diye olay sisteminde durur.
 */
export function collectEventModifiers(state: GameState): EventModifiers {
  const demand = {} as Record<CategoryId, number>;

  const mods: EventModifiers = {
    demand,
    archetypeDemand: [],
    goodPrice: {},
    costMultiplier: 1,
    landValueDrift: 0,
  };

  /*
   * Dönem, olaylarla AYNI boru hattından geçer: ikisi de birer çarpan
   * kaynağı ve pazarın tek bir "birleşik etki" görmesi gerekiyor. Ayrı
   * bir uygulama noktası, "dönem × olay hangi sırayla çarpılır" gibi
   * cevabı olmayan bir soru doğururdu.
   */
  const sources: Array<{ defId: string }> = [...state.activeEvents];
  if (state.era) sources.push({ defId: state.era.defId });

  for (const active of sources) {
    const def = EVENTS.find((e) => e.id === active.defId) ?? ERA_BY_ID[active.defId];
    if (!def) continue;

    if (def.effects.costMultiplier) mods.costMultiplier *= def.effects.costMultiplier;
    if (def.effects.landValueDrift) mods.landValueDrift += def.effects.landValueDrift;

    if (def.effects.goodPriceMultiplier) {
      for (const [goodId, mult] of Object.entries(def.effects.goodPriceMultiplier)) {
        mods.goodPrice[goodId] = (mods.goodPrice[goodId] ?? 1) * mult;
      }
    }

    if (def.effects.demandMultiplier) {
      if (def.effects.districtArchetype) {
        mods.archetypeDemand.push({
          archetype: def.effects.districtArchetype,
          multipliers: def.effects.demandMultiplier,
        });
      } else {
        for (const [cat, mult] of Object.entries(def.effects.demandMultiplier)) {
          const key = cat as CategoryId;
          mods.demand[key] = (mods.demand[key] ?? 1) * (mult as number);
        }
      }
    }
  }

  return mods;
}

const MAX_CONCURRENT = 2;
/** Günlük olay tetikleme olasılığı. */
const DAILY_CHANCE = 0.035;
/** İlk olay bu günden önce çıkmaz — oyuncu önce oturmalı. */
const GRACE_DAYS = 12;

export function runEventTick(state: GameState): void {
  // Süresi dolanları kapat.
  for (let i = state.activeEvents.length - 1; i >= 0; i--) {
    const active = state.activeEvents[i]!;
    active.remainingDays -= 1;
    if (active.remainingDays > 0) continue;

    const def = EVENTS.find((e) => e.id === active.defId);
    state.activeEvents.splice(i, 1);
    if (def) pushNews(state, 'neutral', `${def.title} sona erdi`, 'Piyasa normale dönüyor.');
  }

  if (!state.flags.randomEvents) return;
  if (state.time.day < GRACE_DAYS) return;
  if (state.activeEvents.length >= MAX_CONCURRENT) return;
  if (nextFloat(state.rng) > DAILY_CHANCE) return;

  const available = EVENTS.filter((e) => !state.activeEvents.some((a) => a.defId === e.id));
  if (available.length === 0) return;

  const def = pickWeighted(state.rng, available, (e) => e.weight);
  state.activeEvents.push({
    defId: def.id,
    startedDay: state.time.day,
    remainingDays: def.durationDays,
  });
  pushNews(state, def.tone, def.title, def.body);
}

/** İlk dönem bu günden önce başlamaz — erken oyun nötr zeminde otursun. */
const ERA_START_DAY = 60;

/** Kapanış uyarısının verildiği kalan gün sayısı. */
const ERA_CLOSING_NOTICE_DAYS = 20;

/**
 * Dönem zamanlayıcısı.
 *
 * Olay zamanlayıcısından iki farkı var ve ikisi de bilinçli:
 *
 * - RASTGELE DEĞİL SIRALI ÇALIŞIR: her zaman tam bir dönem aktiftir,
 *   biten dönemin yerine hemen yenisi gelir. Şehrin iklimsiz bir günü
 *   olmaz — "dönemsiz aralık" diye bir üçüncü durum, hem dengeyi hem
 *   anlatımı bulanıklaştırırdı.
 *
 * - AYNI DÖNEM ÜST ÜSTE GELMEZ: mevsimlerin işi değişim; iki kez üst
 *   üste gelen İstikrar, hiç gelmemiş gibi hissettirir.
 *
 * Kapanmadan 20 gün önce haber düşer: dönem sonu bir plan penceresi —
 * "enflasyon bitiyor, zincire yatırmayı bekle" gibi kararların yeri.
 */
/**
 * Dönem seçimi PAYLAŞILAN rng'den DEĞİL, tohum+güne bağlı yerel bir
 * zardan yapılır — iklim dışsaldır.
 *
 * İlk sürüm `state.rng` kullanıyordu ve zincir A/B deneyini bozdu: aynı
 * tohumla açılan iki kol, farklı kararlar verdikçe rng akışları ayrışıyor
 * ve İKLİMLERİ de ayrışıyordu — biri kuyruk penceresini Genişleme'de,
 * öteki Sıkılaşma'da ölçüyordu. 60 günlük kâr kıyası ±%10'luk mevsim
 * farkının altında kayboldu (3/3 tohum → 1/3'e düştü).
 *
 * Hava durumu şirket kararlarına bağlı olmamalı; aynı tohum aynı iklim
 * takvimini vermeli — kim ne kurarsa kursun.
 */
function pickEra(state: GameState, excludeId: string | null): (typeof ERAS)[number] {
  const dice = createRng((state.meta.seed ^ (state.time.day * 2654435761)) >>> 0);
  const candidates = excludeId ? ERAS.filter((e) => e.id !== excludeId) : ERAS;
  return pickWeighted(dice, candidates, (e) => e.weight);
}

export function runEraTick(state: GameState): void {
  // `=== false` bilinçli: alan yoksa (eski kayıt) dönemler AÇIK.
  if (state.flags.eras === false) return;

  if (!state.era) {
    if (state.time.day < ERA_START_DAY) return;
    const def = pickEra(state, null);
    state.era = { defId: def.id, startedDay: state.time.day, remainingDays: def.durationDays };
    pushNews(state, def.tone, def.title, def.body);
    return;
  }

  state.era.remainingDays -= 1;

  if (state.era.remainingDays === ERA_CLOSING_NOTICE_DAYS) {
    const def = ERA_BY_ID[state.era.defId];
    if (def) {
      pushNews(
        state,
        'neutral',
        `${def.title} kapanıyor`,
        `Yaklaşık ${ERA_CLOSING_NOTICE_DAYS} gün içinde yeni bir dönem başlayacak. Planını ona göre kur.`,
      );
    }
    return;
  }

  if (state.era.remainingDays > 0) return;

  const def = pickEra(state, state.era.defId);
  state.era = { defId: def.id, startedDay: state.time.day, remainingDays: def.durationDays };
  pushNews(state, def.tone, def.title, def.body);
}

