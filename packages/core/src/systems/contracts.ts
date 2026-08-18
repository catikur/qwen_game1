import { BUILDING_BY_ID, CATEGORIES, CONSUMER_CATEGORIES } from '@capital/content';
import type { CategoryId } from '@capital/content';
import { nextFloat, nextInt, pick } from '../rng';
import { pushNews } from '../news';
import { isDistrictOpen } from './city';
import type { ContractState, GameState } from '../types';

/**
 * Sözleşmeler — optimizasyondan başka bir sebep.
 *
 * Oyunun tek itici gücü bugüne kadar "en kârlı hamleyi bul"du ve tekrara
 * düşme şikâyetinin bir ayağı buydu: kendi kendine koyduğun hedef, hedef
 * gibi hissettirmiyor. Sözleşme dışarıdan gelen, süreli ve bedelli bir
 * istek: belediye "Liman'a üç market" istiyor, süre 150 gün, ödül peşin
 * değil teslimatta — ve kabul edip teslim edemezsen cayma bedeli var.
 *
 * Üç bilinçli sınır:
 *
 * - AYNI ANDA TEK SÖZLEŞME. Görev listesi oyunu değil bu; tek sözleşme
 *   bir karar, beş sözleşme bir yapılacaklar listesi olurdu.
 *
 * - TEKLİF REDDEDİLEBİLİR VE REDDİN BEDELİ YOK. Sözleşme bir fırsat,
 *   bir zorunluluk değil — casual kuralı: hiçbir şey oyunu durdurmaz,
 *   hiçbir teklif oyuncuyu suçlu hissettirmez. Süresi dolan teklif
 *   sessizce düşer.
 *
 * - ÖDÜL BELEDİYEDEN GELİR (para yaratılır). Spot pazarla aynı statü:
 *   şehrin dışında bir ekonomi var ve oyun onunla ticaret ediyor. Ceza
 *   da aynı kapıdan çıkar gider.
 */

/** İlk teklif bu günden önce gelmez — erken oyun kendi hedefini kurar. */
const FIRST_OFFER_DAY = 80;

/** Teklifin masada kaldığı süre. */
const OFFER_LIFETIME_DAYS = 20;

/** İki teklif arasındaki en az gün (kabul edilsin edilmesin). */
const OFFER_COOLDOWN_DAYS = 30;

/** Günlük teklif üretme olasılığı (soğuma bittikten sonra). */
const OFFER_DAILY_CHANCE = 0.06;

/**
 * İnşaat sözleşmesi hedefi 2–3 bina.
 *
 * 1 bina sözleşmesiz de olacak şeydir, 4+ ise erken oyunda nakit
 * duvarına çarpar. Süre bina başına 60 gün: outlet geri ödemesi 18–42
 * gün olduğuna göre "sırayla kur, kazandıkça büyü" temposuna yetiyor.
 */
const BUILD_DAYS_PER_UNIT = 60;

/** Pazar payı sözleşmesinin süresi. */
const SHARE_DEADLINE_DAYS = 160;

export function activeContract(state: GameState): ContractState | null {
  return state.contract ?? null;
}

/**
 * Sözleşme ilerlemesi 0..1 — arayüz çipi ve tamamlama kontrolü aynı
 * sayıyı okur; iki ayrı hesap olsaydı çip %100 derken motor "bitmedi"
 * diyebilirdi.
 */
export function contractProgress(state: GameState, contract: ContractState): number {
  if (contract.kind === 'build') {
    const built = countQualifyingBuildings(state, contract);
    return Math.min(1, built / contract.targetCount);
  }
  const share = state.companies[state.playerCompanyId]?.marketShare[contract.category] ?? 0;
  return Math.min(1, share / contract.targetShare);
}

/** Kabulden SONRA, istenen bölgede, istenen kategoride açılan outlet sayısı. */
function countQualifyingBuildings(state: GameState, contract: ContractState): number {
  if (contract.kind !== 'build') return 0;
  let count = 0;
  for (const building of Object.values(state.buildings)) {
    if (building.companyId !== state.playerCompanyId) continue;
    if (building.districtId !== contract.districtId) continue;
    if (building.builtDay < contract.acceptedDay) continue;
    const def = BUILDING_BY_ID[building.defId];
    if (!def || def.role !== 'outlet' || def.category !== contract.category) continue;
    count++;
  }
  return count;
}

export function acceptContract(state: GameState): { ok: boolean; reason?: string } {
  const offer = state.contractOffer;
  if (!offer) return { ok: false, reason: 'Masada teklif yok.' };
  if (state.contract) return { ok: false, reason: 'Zaten aktif bir sözleşmen var.' };

  // Süre kabulle başlar: teklif masada beklerken zaman kaybettirmez.
  state.contract = {
    ...offer,
    acceptedDay: state.time.day,
    deadlineDay: state.time.day + offer.durationDays,
  };
  delete state.contractOffer;
  return { ok: true };
}

export function declineContract(state: GameState): { ok: boolean; reason?: string } {
  if (!state.contractOffer) return { ok: false, reason: 'Masada teklif yok.' };
  delete state.contractOffer;
  state.lastContractDay = state.time.day;
  return { ok: true };
}

export function runContractTick(state: GameState): void {
  const player = state.companies[state.playerCompanyId];
  if (!player) return;

  // ---- Aktif sözleşme: teslim mi, süre mi doldu? ----
  const contract = state.contract;
  if (contract) {
    if (contractProgress(state, contract) >= 1) {
      player.cash += contract.reward;
      pushNews(
        state,
        'good',
        'Sözleşme teslim edildi',
        `${contract.title} — belediye ${formatShort(contract.reward)} ödedi.`,
      );
      delete state.contract;
      state.lastContractDay = state.time.day;
      return;
    }

    if (state.time.day >= contract.deadlineDay) {
      player.cash -= contract.penalty;
      pushNews(
        state,
        'bad',
        'Sözleşme süresi doldu',
        `${contract.title} teslim edilemedi. Cayma bedeli: ${formatShort(contract.penalty)}.`,
      );
      delete state.contract;
      state.lastContractDay = state.time.day;
      return;
    }
    return;
  }

  // ---- Masadaki teklif: süresi dolduysa sessizce düşer. ----
  const offer = state.contractOffer;
  if (offer) {
    if (state.time.day >= offer.offeredDay + OFFER_LIFETIME_DAYS) {
      delete state.contractOffer;
      state.lastContractDay = state.time.day;
    }
    return;
  }

  // ---- Yeni teklif üret ----
  if (state.time.day < FIRST_OFFER_DAY) return;
  if (state.time.day - (state.lastContractDay ?? 0) < OFFER_COOLDOWN_DAYS) return;
  if (nextFloat(state.rng) > OFFER_DAILY_CHANCE) return;

  state.contractOffer = generateOffer(state);
  const generated = state.contractOffer;
  pushNews(
    state,
    'neutral',
    'Belediyeden sözleşme teklifi',
    `${generated.title} — ödül ${formatShort(generated.reward)}, süre ${generated.durationDays} gün. Teklif ~${OFFER_LIFETIME_DAYS} gün masada.`,
  );
}

function generateOffer(state: GameState): ContractState {
  const day = state.time.day;

  /*
   * İki tür dönüşümlü değil TARTILI: inşaat sözleşmesi oyunun ana
   * fiiline (yer seç, kur) bağlanıyor, pay sözleşmesi ise rekabet
   * kollarına (fiyat, kalite, marka). İkisi 60/40 — ana fiil önde.
   */
  if (nextFloat(state.rng) < 0.6) {
    // Boş talebi en yüksek AÇIK bölgeye inşaat isteği: sözleşme, oyuncuyu
    // zaten gitmesi gereken yere davet ediyor — tuzağa değil. Kilitli
    // bölge filtrelenir: belediyenin kendi imara kapattığı yere bina
    // istemesi hem saçma hem yerine getirilemez bir sözleşme olurdu.
    const district = state.districts
      .filter((candidate) => isDistrictOpen(state, candidate.id))
      .sort((a, b) => {
        const unmetA = Object.values(a.unmet).reduce((s, u) => s + u, 0);
        const unmetB = Object.values(b.unmet).reduce((s, u) => s + u, 0);
        return unmetB - unmetA;
      })[0]!;

    const category = pick(state.rng, CONSUMER_CATEGORIES);
    // nextInt YARI-AÇIK [min, max): 2-3 hedefi için üst sınır 4 olmalı.
    // İlk hâli (2, 3) yazıyordu ve hedef HEP 2 çıkıyordu — süre, ödül ve
    // ceza da ondan türediği için 3 binalık sözleşme hiç doğmamıştı.
    const targetCount = nextInt(state.rng, 2, 4);
    const durationDays = targetCount * BUILD_DAYS_PER_UNIT;
    // Ödül kabaca hedef binaların maliyetinin %60'ı: bedava büyüme değil,
    // yönlendirilmiş büyümeye prim.
    const reward = targetCount * 22_000;

    return {
      kind: 'build',
      title: `${district.name} bölgesine ${targetCount} ${CATEGORIES[category].name} işletmesi`,
      districtId: district.id,
      category,
      targetCount,
      targetShare: 0,
      durationDays,
      reward,
      penalty: Math.round(reward * 0.4),
      offeredDay: day,
      acceptedDay: day,
      deadlineDay: day + durationDays,
    };
  }

  // Pazar payı: bugünkü payın 8-12 puan üstü. Oyuncunun hiç olmadığı
  // kategori seçilmez — sıfırdan %15'e bir sözleşme değil bir ceza olur.
  const player = state.companies[state.playerCompanyId]!;
  const present = CONSUMER_CATEGORIES.filter((c) => (player.marketShare[c] ?? 0) >= 0.02);
  const category = present.length > 0 ? pick(state.rng, present) : pick(state.rng, CONSUMER_CATEGORIES);
  const current = player.marketShare[category] ?? 0;
  const targetShare = Math.min(0.6, current + 0.08 + nextFloat(state.rng) * 0.04);
  const reward = Math.round(45_000 + targetShare * 120_000);

  return {
    kind: 'share',
    title: `${CATEGORIES[category].name} pazarında %${Math.round(targetShare * 100)} pay`,
    districtId: -1,
    category,
    targetCount: 0,
    targetShare,
    durationDays: SHARE_DEADLINE_DAYS,
    reward,
    penalty: Math.round(reward * 0.4),
    offeredDay: day,
    acceptedDay: day,
    deadlineDay: day + SHARE_DEADLINE_DAYS,
  };
}

/** Haber gövdesi için kısa para biçimi — selectors'a bağımlılık kurmadan. */
function formatShort(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)} M ₺`;
  return `${Math.round(value / 1_000)} B ₺`;
}
