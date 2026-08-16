import { BUILDING_BY_ID } from '@capital/content';
import { BUILDING_BOOK_RATIO } from './city';
import type { GameState } from '../types';

/**
 * Borsa — şirketlerin sahipliği.
 *
 * Tur 1 maliyeti, Tur 2 rekabeti, Tur 3 dengeyi verdi. Bu katman
 * Capitalism'i Capitalism yapan şeyi ekliyor: **rakibini pazarda değil,
 * sahiplikte yenmek.**
 *
 * MİMARİ: fiyat türetilmiştir, state'te tutulmaz. `chain.ts`,
 * `competition.ts` ve `routes.ts` gibi bu dosya da yalnızca hesaplar.
 * Kaydedilen tek şey KİMİN KAÇ HİSSESİ olduğu.
 *
 * DENGE KİMLİĞİ: hiç hisse almayan bir oyuncunun net değeri Tur 3 ile
 * birebir aynı kalır. Şirket kendi hisselerinin tamamına sahipse
 * `ownedValue` sıfır döner ve net değer formülü eski haline indirgenir.
 */

/** Her şirket bu kadar hisseye bölünür. */
export const TOTAL_SHARES = 10_000;

/** Güven çarpanının sınırları — büyüyen şirket primli, eriyen iskontolu. */
const CONFIDENCE_FLOOR = 0.6;
const CONFIDENCE_CEILING = 1.8;

/**
 * Referans günlük getiri: kârın defter değerine oranı.
 *
 * İlk denemede 0,004 seçilmişti ve sinyali ÖLDÜRÜYORDU — sağlıklı bir
 * şirketin günlük getirisi zaten %0,5–1,1 olduğu için dört rakipten üçü
 * tavana (×1,80) yapışıyor, hepsi ekranda aynı görünüyordu. Oysa güvenin
 * tek işi şirketleri birbirinden AYIRMAK.
 *
 * 0,012 tipik getirinin üst ucunda: kâr eden şirket primli, duran şirket
 * defter değerinde, eriyen şirket iskontolu işlem görüyor ve üçü de
 * ekranda ayrı okunuyor.
 */
const CONFIDENCE_REFERENCE = 0.012;

/** Getiri farkının güvene yansıma şiddeti. */
const CONFIDENCE_SLOPE = 0.8;

/** Dağıtılan kâr payı. */
const DIVIDEND_RATIO = 0.25;

/** Kontrolün el değiştirdiği pay. */
export const CONTROL_THRESHOLD = 0.5;

/**
 * Şirketin kendi işletmesinden gelen defter değeri.
 *
 * Hisse portföyünü İÇERMEZ; karşılıklı sahiplikte sonsuz döngüye
 * girmemek için değerleme tek kademe çözülüyor (bkz. tasarım §4).
 */
export function bookValue(state: GameState, companyId: string): number {
  const company = state.companies[companyId];
  if (!company) return 0;

  let assets = 0;
  for (const tile of state.map.tiles) {
    if (tile.ownerId === companyId) assets += tile.landValue;
  }
  for (const building of Object.values(state.buildings)) {
    if (building.companyId !== companyId) continue;
    const def = BUILDING_BY_ID[building.defId];
    if (def) assets += def.cost * BUILDING_BOOK_RATIO;
  }

  return company.cash + assets - company.debt;
}

/**
 * Piyasanın şirkete olan güveni.
 *
 * Son günün kârını net değere oranlıyor: büyüyen şirket defter değerinin
 * üstünde, eriyen şirket altında işlem görüyor. Oyuncu için okunabilir
 * bir sinyal — ucuz hisse ya fırsattır ya tuzak.
 */
export function confidence(state: GameState, companyId: string): number {
  const company = state.companies[companyId];
  if (!company) return 1;

  const base = Math.max(1, bookValue(state, companyId));
  const yieldRate = company.today.profit / base;
  const raw = 1 + (yieldRate / CONFIDENCE_REFERENCE) * CONFIDENCE_SLOPE;
  return Math.max(CONFIDENCE_FLOOR, Math.min(CONFIDENCE_CEILING, raw));
}

/** Şirketin piyasa değeri. */
export function marketCap(state: GameState, companyId: string): number {
  return Math.max(0, bookValue(state, companyId)) * confidence(state, companyId);
}

/** Tek hissenin fiyatı. */
export function sharePrice(state: GameState, companyId: string): number {
  return marketCap(state, companyId) / TOTAL_SHARES;
}

/** `holderId` şirketinin `issuerId` şirketinde kaç hissesi var. */
export function sharesHeld(state: GameState, holderId: string, issuerId: string): number {
  return state.companies[holderId]?.shares[issuerId] ?? 0;
}

/**
 * Bir şirketin serbest dolaşımdaki hissesi.
 *
 * Şirketin KENDİ elindeki hisseler de (hazine, geri alım) dolaşımdan
 * düşer. Eskiden issuer atlanıyordu çünkü kendi hissesini almak
 * yasaktı; geri alım savunması gelince hazine gerçek bir kavram oldu —
 * hazinedeki her hisse, bir baskıncının ASLA alamayacağı bir hissedir.
 */
export function freeFloat(state: GameState, issuerId: string): number {
  let held = 0;
  for (const company of Object.values(state.companies)) {
    held += company.shares[issuerId] ?? 0;
  }
  return Math.max(0, TOTAL_SHARES - held);
}

/**
 * Bir şirketin başka şirketlerdeki payının değeri.
 *
 * Net değere buradan giriyor. Sıfır hisseli bir şirkette 0 döner —
 * denge kimliği bu sayede korunuyor.
 */
export function portfolioValue(state: GameState, companyId: string): number {
  const company = state.companies[companyId];
  if (!company) return 0;

  let total = 0;
  for (const [issuerId, count] of Object.entries(company.shares)) {
    if (!count || issuerId === companyId) continue;
    total += count * sharePrice(state, issuerId);
  }
  return total;
}

/**
 * Alım maliyeti; kural ihlali varsa sebebini döner.
 *
 * KENDİ HİSSENİ ALMAK SERBEST — ve bu bir savunma. Rakipler oyuncunun
 * hissesini toplayabildiği andan itibaren "geri alım" tek kalkan:
 * hazineye çekilen her hisse dolaşımdan düşer ve %50 eşiği o kadar
 * uzaklaşır. Eski kural ("kendi hisseni alamazsın") tek yönlü borsanın
 * kalıntısıydı; kimse sana saldıramıyorken savunmaya da gerek yoktu.
 */
export function buyShares(
  state: GameState,
  buyerId: string,
  issuerId: string,
  count: number,
): { ok: boolean; reason?: string } {
  const buyer = state.companies[buyerId];
  const issuer = state.companies[issuerId];
  if (!buyer || !issuer) return { ok: false, reason: 'Bilinmeyen şirket.' };

  const wanted = Math.floor(count);
  if (wanted <= 0) return { ok: false, reason: 'Geçersiz adet.' };

  const available = freeFloat(state, issuerId);
  if (wanted > available) {
    return { ok: false, reason: `Piyasada yalnızca ${available} hisse var.` };
  }

  const cost = wanted * sharePrice(state, issuerId);
  if (cost > buyer.cash) return { ok: false, reason: 'Nakit yetersiz.' };

  buyer.cash -= cost;
  buyer.shares[issuerId] = (buyer.shares[issuerId] ?? 0) + wanted;
  return { ok: true };
}

/** Satış; elindeki kadarını satabilirsin. */
export function sellShares(
  state: GameState,
  sellerId: string,
  issuerId: string,
  count: number,
): { ok: boolean; reason?: string } {
  const seller = state.companies[sellerId];
  if (!seller) return { ok: false, reason: 'Bilinmeyen şirket.' };

  const held = seller.shares[issuerId] ?? 0;
  const wanted = Math.floor(count);
  if (wanted <= 0) return { ok: false, reason: 'Geçersiz adet.' };
  if (wanted > held) return { ok: false, reason: `Elinde ${held} hisse var.` };

  seller.cash += wanted * sharePrice(state, issuerId);
  seller.shares[issuerId] = held - wanted;
  if (seller.shares[issuerId] === 0) delete seller.shares[issuerId];
  return { ok: true };
}

/**
 * Bir şirketin kontrolü kimde? Eşiği geçen yoksa null.
 *
 * Tek eşik, tek sonuç. Kademeli kontrol (%25 blokaj, %50 kontrol, %75
 * tam) daha zengin olurdu ama üç ayrı kuralı da anlatmak gerekirdi;
 * oyuncu "ne kadar daha almam lazım" sorusunu tek sayıya bakarak
 * cevaplayabilmeli.
 */
export function controllerOf(state: GameState, issuerId: string): string | null {
  for (const company of Object.values(state.companies)) {
    if (company.id === issuerId) continue;
    const count = company.shares[issuerId] ?? 0;
    if (count / TOTAL_SHARES > CONTROL_THRESHOLD) return company.id;
  }
  return null;
}

/**
 * Devralmayı sonuçlandırır: varlıklar el değiştirir, şirket oyundan çıkar.
 *
 * Azınlık hissedarlar mağdur edilmez — payları devralma anındaki fiyattan
 * nakde çevrilir. Aksi halde "%49'unu topladım, sonra rakip devraldı ve
 * param buhar oldu" gibi öğrenilmesi imkânsız bir ceza doğardı.
 */
function absorb(state: GameState, acquirerId: string, targetId: string): void {
  const acquirer = state.companies[acquirerId];
  const target = state.companies[targetId];
  if (!acquirer || !target) return;

  // Azınlık payları nakde: devralanın hissesi HARİÇ.
  const price = sharePrice(state, targetId);
  for (const holder of Object.values(state.companies)) {
    if (holder.id === targetId) continue;
    const count = holder.shares[targetId] ?? 0;
    if (count <= 0) continue;
    if (holder.id !== acquirerId) holder.cash += count * price;
    delete holder.shares[targetId];
  }

  // Varlıklar: parseller, binalar, nakit ve borç.
  for (const tile of state.map.tiles) {
    if (tile.ownerId === targetId) tile.ownerId = acquirerId;
  }
  for (const building of Object.values(state.buildings)) {
    if (building.companyId === targetId) building.companyId = acquirerId;
  }
  acquirer.cash += target.cash;
  acquirer.debt += target.debt;

  // Devralınan şirketin kendi portföyü de devralana geçer.
  for (const [issuerId, count] of Object.entries(target.shares)) {
    if (!count) continue;
    if (issuerId === acquirerId) continue; // kendi hissesi yutulur
    acquirer.shares[issuerId] = (acquirer.shares[issuerId] ?? 0) + count;
  }

  // Açık ihalede teklifi varsa düşer.
  if (state.auction?.bidderId === targetId) {
    state.auction.bidderId = null;
    state.auction.bid = 0;
  }

  delete state.companies[targetId];
}

/**
 * Kontrol el değiştirdiyse devralmayı uygular.
 *
 * Ayrı bir tick olarak duruyor çünkü kontrol iki yoldan değişebilir:
 * oyuncu hisse alır ya da hedefin değeri düşünce mevcut pay eşiği geçer.
 * İkisini tek yerde çözmek, "hangi komuttan sonra kontrol edeyim"
 * sorusunu ortadan kaldırıyor.
 */
export function runTakeoverTick(state: GameState, announce: (title: string, body: string) => void): void {
  for (const issuerId of Object.keys(state.companies)) {
    const controllerId = controllerOf(state, issuerId);
    if (!controllerId) continue;

    const target = state.companies[issuerId];
    const acquirer = state.companies[controllerId];
    if (!target || !acquirer) continue;

    /*
     * OYUNCU YUTULMUYOR — OYUN BİTİYOR.
     *
     * `absorb` şirketi state'ten siler ve arayüz her karede oyuncuyu
     * okur; silmek her paneli çökertir. Daha önemlisi bu bir mekanik
     * değil bir SON: kontrolün yarısını kaptırdıysan imparatorluk artık
     * senin değil. Motor `gameOver` doluyken günü ilerletmeyi bırakıyor.
     */
    if (target.isPlayer) {
      if (!state.gameOver) {
        state.gameOver = { day: state.time.day, byCompanyId: controllerId };
        announce(
          `${acquirer.name} şirketini devraldı`,
          'Hisselerinin yarısından fazlası el değiştirdi. İmparatorluk artık onun.',
        );
      }
      continue;
    }

    const buildings = Object.values(state.buildings).filter((b) => b.companyId === issuerId).length;
    absorb(state, controllerId, issuerId);
    announce(
      `${acquirer.name}, ${target.name} şirketini devraldı`,
      `${target.name} hisselerinin yarısından fazlası el değiştirdi. ` +
        `${buildings} bina ve tüm parseller ${acquirer.name} bünyesine geçti; ` +
        'azınlık hissedarlar payları nakde çevrildi.',
    );
  }
}

/**
 * Günlük temettü.
 *
 * Azınlık hissesini KENDİ BAŞINA bir yatırım yapıyor: devralmaya
 * yetmeyecek kadar az hisse de para kazandırır. Yoksa borsa yalnızca bir
 * devralma düğmesi olurdu.
 *
 * Ödeyen şirketin kasasından çıkar, hissedarın kasasına girer — para
 * yaratılmaz. Şirketin kendi elindeki hisselere düşen pay kendi kasasında
 * kalır, yani hiç kimsenin almadığı hisse temettü kaçağı açmaz.
 */
export function runDividendTick(state: GameState): void {
  for (const issuer of Object.values(state.companies)) {
    const profit = issuer.today.profit;
    if (profit <= 0) continue;

    const pool = profit * DIVIDEND_RATIO;
    let paid = 0;

    for (const holder of Object.values(state.companies)) {
      if (holder.id === issuer.id) continue;
      const count = holder.shares[issuer.id] ?? 0;
      if (count <= 0) continue;
      const share = (pool * count) / TOTAL_SHARES;
      holder.cash += share;
      paid += share;
    }

    issuer.cash -= paid;
  }
}
