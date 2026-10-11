import { ISSUANCE, NPC_ISSUANCE, numberLocale } from '@capital/content';
import type { NpcProfileDef } from '@capital/content';
import { tc } from '../i18n';
import { pushNews } from '../news';
import { formatMoney } from '../selectors';
import { bookValue, confidence, ownerFraction, sharePrice, sharesHeld, sharesOutstanding } from './equity';
import { grossAssets } from './credit';
import type { CommandResult, GameState } from '../types';

/**
 * Sermaye artırımı — ilk ihraç halka arz.
 *
 * Yeni hisseler `shareCount`'a ve `investorShares`'a eklenir; nakit ihraç
 * fiyatından (piyasa × (1 − iskonto)) kasaya girer. Net değer bundan sonra
 * şirket değerinin kurucuya düşen kısmı (`ownerFraction`).
 *
 * İhraç günü net değere etkisi tek formül:
 *   önce  = V × f
 *   sonra = (V + N·p) × (S·f) / (S + N)      (yatırımcı payı N kadar büyür)
 * p defter değerinin üstündeyse (güven primi iskontoyu aşıyorsa) ihraç
 * net değeri artırır; altındaysa azaltır. Bedel her durumda kalıcı: sonraki
 * bütün büyümenin yatırımcı payı.
 */

export function issuanceEnabled(state: GameState): boolean {
  return state.flags.issuance !== false;
}

export interface IssueQuote {
  ok: boolean;
  reason?: string;
  /** İhraç fiyatı (hisse başına). */
  price: number;
  /** Bu ihraçta en fazla. */
  maxShares: number;
  /** İlk ihraç mı (halka arz)? */
  ipo: boolean;
  /** Baskın altında: bekleme süresi aranmıyor (savunma ihracı). */
  defense?: boolean;
}

/** Şirketin hisselerinde en büyük dış payın oranı (0..1). */
export function largestOutsideStake(state: GameState, companyId: string): number {
  const outstanding = sharesOutstanding(state, companyId);
  let top = 0;
  for (const other of Object.values(state.companies)) {
    if (other.id !== companyId) top = Math.max(top, sharesHeld(state, other.id, companyId));
  }
  return outstanding > 0 ? top / outstanding : 0;
}

/** Bir ihracın koşulları. Arayüz ve rakipler aynı fonksiyonu okuyor. */
export function issueQuote(state: GameState, companyId: string): IssueQuote {
  const company = state.companies[companyId];
  const price = company ? sharePrice(state, companyId) * (1 - ISSUANCE.discount) : 0;
  const ipo = (company?.issues ?? 0) === 0;
  const closed = (reason: string): IssueQuote => ({ ok: false, reason, price, maxShares: 0, ipo });
  if (!issuanceEnabled(state)) return closed(tc('core.issuance.disabled'));
  if (!company) return closed(tc('core.issuance.noCompany'));
  if (bookValue(state, companyId) < ISSUANCE.minBook) {
    return closed(tc('core.issuance.minBook', { amount: formatMoney(ISSUANCE.minBook) }));
  }
  /*
   * SAVUNMA İHRACI BEKLEMEZ (Tur 21).
   *
   * Kalkanın gücü yatırımcı payından geliyor: yeni hisse kurumsal
   * yatırımcıda kalıyor, baskıncı onu alamıyor. Ama baskıncının günlük
   * tavanı da bir PAY (%3,5), adet değil; ihraç baskıncının payını
   * yalnızca 1/1,25'e indiriyor (%31,5 → %25,2) ve bu fark iki alımda
   * kapanıyor. Ölçüm: tek ihraç ~40 gün kazandırıyor, iki ihraç arası
   * 180 gün. On tohumda savunmasız düşen dokuz oyuncudan main'de altısı,
   * zincir düzeltmesinden sonra yalnızca üçü ihraçla ayakta kalıyordu —
   * Tur 19'un iki tohumluk "kalkan" kontrolü şanslı tohumlara
   * yaslanıyordu (seed 42'de iki baskıncı serbest hisseyi bölüşüp
   * tıkanmıştı).
   *
   * Gerçek dünyadaki karşılığı "zehir hapı": bir alıcı eşiği geçince
   * şirket bekleme olmadan yeni hisse çıkarabiliyor. Kurucu tabanı
   * (%51) ve ihraç başına tavan aynen geçerli; yani kalkanın bir sonu
   * var ve bedeli kalıcı ortaklık.
   */
  const defense = largestOutsideStake(state, companyId) >= ISSUANCE.defenseAt;
  if (
    !defense &&
    company.lastIssueDay !== undefined &&
    state.time.day - company.lastIssueDay < ISSUANCE.cooldownDays
  ) {
    return closed(tc('core.issuance.cooldown', { days: ISSUANCE.cooldownDays - (state.time.day - company.lastIssueDay) }));
  }
  const outstanding = sharesOutstanding(state, companyId);
  const investors = company.investorShares ?? 0;
  // Kurucu payı tabanı: (yatırımcı + N) / (S + N) ≤ 1 − taban.
  const floor = ISSUANCE.minFounderShare;
  const byFounder = Math.floor(((1 - floor) * outstanding - investors) / floor);
  const maxShares = Math.max(0, Math.min(Math.floor(outstanding * ISSUANCE.maxPerIssue), byFounder));
  if (maxShares < ISSUANCE.minShares) return closed(tc('core.issuance.founderFloor', { percent: Math.round(floor * 100) }));
  if (price <= 0) return closed(tc('core.issuance.noPrice'));
  return { ok: true, price, maxShares, ipo, ...(defense ? { defense: true } : {}) };
}

/** İhraç günü net değere etkisi (oyuncuya gösterilen tahmin). */
export function issueNetWorthEffect(state: GameState, companyId: string, count: number): number {
  const company = state.companies[companyId];
  if (!company) return 0;
  const quote = issueQuote(state, companyId);
  const f = ownerFraction(company);
  const value = company.netWorth / f;
  const outstanding = sharesOutstanding(state, companyId);
  const investors = company.investorShares ?? 0;
  const after = (value + count * quote.price) * (1 - (investors + count) / (outstanding + count));
  return after - company.netWorth;
}

export function issueShares(state: GameState, companyId: string, count: number): CommandResult {
  const quote = issueQuote(state, companyId);
  if (!quote.ok) return { ok: false, reason: quote.reason };
  const shares = Math.floor(count);
  if (!(shares >= ISSUANCE.minShares)) return { ok: false, reason: tc('core.issuance.minShares', { count: ISSUANCE.minShares }) };
  if (shares > quote.maxShares) return { ok: false, reason: tc('core.issuance.maxShares', { count: quote.maxShares }) };

  const company = state.companies[companyId]!;
  const outstanding = sharesOutstanding(state, companyId);
  const raised = shares * quote.price;
  company.shareCount = outstanding + shares;
  company.investorShares = (company.investorShares ?? 0) + shares;
  company.cash += raised;
  company.lastIssueDay = state.time.day;
  company.issues = (company.issues ?? 0) + 1;

  const investorShare = Math.round(((company.investorShares ?? 0) / company.shareCount) * 100);
  if (company.isPlayer) {
    pushNews(
      state,
      'good',
      quote.ipo ? tc('core.issuance.ipoDone') : tc('core.issuance.raiseDone'),
      tc('core.issuance.playerBody', {
        shares: shares.toLocaleString(numberLocale()),
        raised: formatMoney(raised),
        share: investorShare,
      }),
    );
  } else {
    pushNews(
      state,
      'rival',
      quote.ipo ? tc('core.issuance.rivalIpo', { name: company.name }) : tc('core.issuance.rivalRaise', { name: company.name }),
      // Eski metin "hisseleri artık daha kolay toplanır" diyordu; Tur 19'dan
      // beri yeni hisseler kurumsal yatırımcıda kalıyor, dolaşıma girmiyor.
      tc('core.issuance.rivalBody', {
        shares: shares.toLocaleString(numberLocale()),
        raised: formatMoney(raised),
        control: (Math.floor(company.shareCount / 2) + 1).toLocaleString(numberLocale()),
      }),
      company.id,
    );
  }
  return { ok: true };
}

/**
 * Rakibin ihracı — karar gününde, borçlanmadan önce. Yalnızca büyüme
 * doktrini (genişlemeci, teknoloji), yalnızca piyasa primliyken ve nakit
 * sıkışıkken. Kendisine baskın yapılan şirket ihraç etmiyor (savunması
 * geri alım); ihraç bir büyüme kararı.
 */
export function npcIssue(state: GameState, profile: NpcProfileDef): void {
  if (!issuanceEnabled(state)) return;
  const doctrine = NPC_ISSUANCE[profile.trait].growth;
  if (!doctrine) return;
  const company = state.companies[profile.id];
  if (!company) return;
  if (confidence(state, company.id) < doctrine.minConfidence) return;
  if (company.cash >= doctrine.cashTight * grossAssets(company)) return;
  for (const other of Object.values(state.companies)) {
    if (other.id !== company.id && sharesHeld(state, other.id, company.id) > 0) return;
  }
  const quote = issueQuote(state, company.id);
  if (!quote.ok) return;
  const count = Math.min(quote.maxShares, Math.floor(sharesOutstanding(state, company.id) * doctrine.size));
  if (count < ISSUANCE.minShares) return;
  issueShares(state, company.id, count);
}

/**
 * Baskına karşı ihraç — doktrini olan rakip, payı eşiği geçen bir
 * baskıncı gördüğünde mümkün olan en büyük ihracı yapar. Günlük; soğuma
 * ve kurucu payı tabanı aynı kurallar.
 */
export function npcDefensiveIssue(state: GameState, profile: NpcProfileDef): void {
  if (!issuanceEnabled(state)) return;
  const threshold = NPC_ISSUANCE[profile.trait].defenseAt;
  if (threshold === null) return;
  const company = state.companies[profile.id];
  if (!company) return;
  const outstanding = sharesOutstanding(state, company.id);
  let threat = 0;
  for (const other of Object.values(state.companies)) {
    if (other.id !== company.id) threat = Math.max(threat, sharesHeld(state, other.id, company.id));
  }
  if (threat / outstanding < threshold) return;
  const quote = issueQuote(state, company.id);
  if (!quote.ok) return;
  issueShares(state, company.id, quote.maxShares);
}
