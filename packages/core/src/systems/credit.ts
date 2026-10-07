import { BUILDING_BY_ID, CREDIT, CREDIT_RATINGS, NPC_CREDIT } from '@capital/content';
import type { CreditRating, LoanKind, NpcProfileDef } from '@capital/content';
import { pushNews } from '../news';
import { formatMoney } from '../selectors';
import { LAND_SELL_RATIO } from './city';
import { companyValue, sellShares, sharePrice } from './equity';
import type { CommandResult, CompanyState, CreditState, GameState, LoanState } from '../types';

/**
 * Banka.
 *
 * `company.debt` toplam borç olarak kalıyor (net değer, devralma ve
 * arayüz onu okuyor). Kredili hesap bakiyesi türetilmiş:
 * `debt − Σ kredi bakiyesi`. Bu sayede eski kayıtların bütün borcu
 * kendiliğinden kredili hesap sayılıyor ve şema sürümü değişmiyor.
 *
 * Gün içinde sıra:
 *   1. Pazar adımı faizi P&L'e yazar (kredili hesap + kredi bakiyeleri).
 *   2. Bu adım taksitlerin anapara kısmını kasadan düşer.
 *   3. Kasa eksideyse fark kredili hesaba; artıdaysa kredili hesap ÖNCE kapanır.
 *   4. Not, ihtar, haciz.
 */

const LEGACY_LIMIT_RATIO = 0.6;

export function creditEnabled(state: GameState): boolean {
  return state.flags.credit !== false;
}

export function loansOf(company: CompanyState): LoanState[] {
  return company.credit?.loans ?? [];
}

/** Kredili hesap bakiyesi (türetilmiş). */
export function overdraftOf(company: CompanyState): number {
  let loans = 0;
  for (const loan of loansOf(company)) loans += loan.balance;
  return Math.max(0, company.debt - loans);
}

/** Brüt varlık: şirketin tamamının değeri + borç (dünün net değeriyle). */
export function grossAssets(company: CompanyState): number {
  return Math.max(0, companyValue(company) + company.debt);
}

export function ratingOf(company: CompanyState): CreditRating {
  return company.credit?.rating ?? 'A';
}

function ensureCredit(company: CompanyState): CreditState {
  return (company.credit ??= { loans: [], rating: 'A', overdraftDays: 0 });
}

/** Kredili hesabın yıllık faizi. */
export function overdraftRate(state: GameState, company: CompanyState): number {
  if (!creditEnabled(state)) return CREDIT.baseRate;
  return CREDIT.baseRate + CREDIT.overdraftPremium + CREDIT_RATINGS[ratingOf(company)].spread;
}

/** Yeni bir kredinin yıllık faizi — not, tür ve vadeden. */
export function loanRate(rating: CreditRating, kind: LoanKind, termDays: number): number {
  const spread = CREDIT_RATINGS[rating].spread;
  if (kind === 'bond') {
    const premium = CREDIT.bond.terms.find((option) => option.days === termDays)?.premium ?? 0;
    return CREDIT.baseRate + spread * CREDIT.bond.spreadShare + premium;
  }
  const term = CREDIT.terms.find((option) => option.days === termDays)?.premium ?? 0;
  const risk = kind === 'secured' ? spread / 2 - CREDIT.securedDiscount : spread;
  return CREDIT.baseRate + risk + term;
}

/** Sabit günlük taksit (anüite). */
export function annuityPayment(principal: number, rate: number, termDays: number): number {
  const i = rate / 365;
  if (i <= 0) return principal / termDays;
  return (principal * i) / (1 - Math.pow(1 + i, -termDays));
}

/** Bugünkü faiz gideri (bekleyen dosya masrafı hariç). */
export function dailyInterest(state: GameState, company: CompanyState): number {
  let interest = (overdraftOf(company) * overdraftRate(state, company)) / 365;
  for (const loan of loansOf(company)) interest += (loan.balance * loan.rate) / 365;
  return interest;
}

/** Pazar adımının kapanışı: faiz + bekleyen dosya masrafı (bir kez). */
export function settleInterest(state: GameState, company: CompanyState): number {
  const fee = company.credit?.feeToday ?? 0;
  if (company.credit && fee > 0) delete company.credit.feeToday;
  return dailyInterest(state, company) + fee;
}

/** Kredili hesap limiti — aşılırsa ihtar. */
export function overdraftLimit(company: CompanyState): number {
  return Math.max(CREDIT.baseOverdraft, CREDIT_RATINGS[ratingOf(company)].overdraftRatio * grossAssets(company));
}

/** Teminat olarak bağlı parseller. */
export function pledgedTiles(state: GameState): Set<number> {
  const pledged = new Set<number>();
  for (const company of Object.values(state.companies)) {
    for (const loan of loansOf(company)) for (const tileId of loan.collateral ?? []) pledged.add(tileId);
  }
  return pledged;
}

export function isPledged(state: GameState, tileId: number): boolean {
  return pledgedTiles(state).has(tileId);
}

function freeCollateral(state: GameState, companyId: string): Array<{ tileId: number; value: number }> {
  const pledged = pledgedTiles(state);
  return state.map.tiles
    .filter((tile) => tile.ownerId === companyId && !pledged.has(tile.id))
    .map((tile) => ({ tileId: tile.id, value: tile.landValue }))
    .sort((a, b) => b.value - a.value || a.tileId - b.tileId);
}

export interface LoanQuote {
  ok: boolean;
  reason?: string;
  rate: number;
  max: number;
  rating: CreditRating;
  /** Teminatlı: rehne açık arsaların toplam değeri. */
  collateralValue?: number;
}

/** Bir kredinin teklif koşulları. Arayüz ve rakipler aynı fonksiyonu okuyor. */
export function loanQuote(state: GameState, companyId: string, kind: LoanKind, termDays: number): LoanQuote {
  const company = state.companies[companyId];
  const rating = company ? ratingOf(company) : 'D';
  const rate = loanRate(rating, kind, termDays);
  const closed = (reason: string): LoanQuote => ({ ok: false, reason, rate, max: 0, rating });
  if (!creditEnabled(state)) return closed('Banka ürünleri kapalı.');
  if (!company) return closed('Şirket bulunamadı.');
  const terms = kind === 'bond' ? CREDIT.bond.terms : CREDIT.terms;
  if (!terms.some((option) => option.days === termDays)) return closed('Geçersiz vade.');
  if (rating === 'D') return closed('Kredi notu D: banka yeni kredi vermiyor.');
  if (kind === 'bond' && rating !== 'A' && rating !== 'B') return closed('Tahvil için not en az B olmalı.');
  if ((company.credit?.arrearsDays ?? 0) > 0) return closed('İhtar sürerken yeni kredi yok.');
  const lastLoanDay = company.credit?.lastLoanDay;
  if (lastLoanDay !== undefined && state.time.day - lastLoanDay < CREDIT.applyCooldownDays) {
    return closed(`Yeni başvuru için ${CREDIT.applyCooldownDays - (state.time.day - lastLoanDay)} gün bekle.`);
  }

  const gross = grossAssets(company);
  // Kredi sonrası kaldıraç sert tavanı aşmasın: (D + x) / (G + x) ≤ h.
  const hard = (CREDIT.hardLeverage * gross - company.debt) / (1 - CREDIT.hardLeverage);
  let max: number;
  let collateralValue: number | undefined;
  if (kind === 'secured') {
    collateralValue = freeCollateral(state, companyId).reduce((sum, tile) => sum + tile.value, 0);
    max = Math.min(collateralValue * CREDIT.loanToValue, hard);
  } else if (kind === 'bond') {
    const bonds = loansOf(company).filter((loan) => loan.kind === 'bond').reduce((sum, loan) => sum + loan.balance, 0);
    max = Math.min((CREDIT.bond.limitRatio[rating] ?? 0) * gross - bonds, hard);
  } else {
    const limit = Math.max(CREDIT.baseLimit, CREDIT_RATINGS[rating].limitRatio * gross);
    max = Math.min(limit - company.debt, hard);
  }
  max = Math.max(0, Math.floor(max / 1000) * 1000);
  const floor = kind === 'bond' ? CREDIT.bond.minAmount : CREDIT.minLoan;
  if (max < floor) {
    const reason =
      kind === 'secured'
        ? 'Teminata açık arsan yetmiyor.'
        : kind === 'bond'
          ? `Tahvil en az ${formatMoney(CREDIT.bond.minAmount)}; şirketin bu ihraca yetecek büyüklükte değil.`
          : 'Kredi limitin dolu.';
    return { ok: false, reason, rate, max, rating, collateralValue };
  }
  return { ok: true, rate, max, rating, collateralValue };
}

export function takeLoan(state: GameState, companyId: string, kind: LoanKind, amount: number, termDays: number): CommandResult {
  const quote = loanQuote(state, companyId, kind, termDays);
  if (!quote.ok) return { ok: false, reason: quote.reason };
  const principal = Math.floor(amount);
  const floor = kind === 'bond' ? CREDIT.bond.minAmount : CREDIT.minLoan;
  if (!(principal >= floor)) return { ok: false, reason: `En az ${formatMoney(floor)}.` };
  if (principal > quote.max) return { ok: false, reason: `Bu krediyle en fazla ${formatMoney(quote.max)} alabilirsin.` };

  const company = state.companies[companyId]!;
  const credit = ensureCredit(company);
  let collateral: number[] | undefined;
  if (kind === 'secured') {
    collateral = [];
    let covered = 0;
    for (const tile of freeCollateral(state, companyId)) {
      if (covered >= principal) break;
      collateral.push(tile.tileId);
      covered += tile.value * CREDIT.loanToValue;
    }
  }
  credit.loanSeq = (credit.loanSeq ?? 0) + 1;
  credit.loans.push({
    id: `${companyId}-L${credit.loanSeq}`,
    kind,
    principal,
    balance: principal,
    rate: quote.rate,
    termDays,
    startDay: state.time.day,
    // Tahvil yalnızca kupon öder; anapara vadede (günlük adım `due` ile kapatır).
    payment: kind === 'bond' ? (principal * quote.rate) / 365 : annuityPayment(principal, quote.rate, termDays),
    ...(collateral ? { collateral } : {}),
  });
  company.cash += principal;
  company.debt += principal;
  credit.lastLoanDay = state.time.day;
  // Dosya masrafı faiz giderine, ertesi günün kapanışında (bugünün defteri
  // kapanmış olabilir: oyuncu gün içinde çekiyor).
  credit.feeToday = (credit.feeToday ?? 0) + principal * CREDIT.originationFee;
  return { ok: true };
}

export function repayLoan(state: GameState, companyId: string, loanId: string): CommandResult {
  const company = state.companies[companyId];
  const loans = company?.credit?.loans;
  const index = loans?.findIndex((loan) => loan.id === loanId) ?? -1;
  if (!company || !loans || index < 0) return { ok: false, reason: 'Kredi bulunamadı.' };
  const loan = loans[index]!;
  if (company.cash < loan.balance) return { ok: false, reason: `Kapatmak için ${formatMoney(loan.balance)} nakit gerekiyor.` };
  company.cash -= loan.balance;
  company.debt = Math.max(0, company.debt - loan.balance);
  loans.splice(index, 1);
  return { ok: true };
}

// ------------------------------------------------------------ not

const RATING_ORDER: CreditRating[] = ['A', 'B', 'C', 'D'];

/** Not yükselirken eşiklerin bu oranı aranır — sınırda gidip gelmesin. */
const UPGRADE_MARGIN = 0.9;

function computeRating(state: GameState, company: CompanyState, credit: CreditState): CreditRating {
  if (credit.lastDefaultDay !== undefined && state.time.day - credit.lastDefaultDay < CREDIT.defaultMemoryDays) return 'D';
  const gross = grossAssets(company);
  const leverage = gross > 0 ? company.debt / gross : company.debt > 0 ? 1 : 0;
  const current = RATING_ORDER.indexOf(credit.rating);
  // Mevcut nottan daha iyisi için eşiğin %90'ı: taksitle kaldıraç eşiğin
  // altına bir gün inip ertesi gün yeni krediyle çıkınca not ve haber
  // gidip gelmesin.
  const meets = (rating: CreditRating, leverageCap: number, overdraftCap: number) => {
    const margin = RATING_ORDER.indexOf(rating) < current ? UPGRADE_MARGIN : 1;
    return leverage < leverageCap * margin && credit.overdraftDays < overdraftCap * margin;
  };
  if (meets('A', CREDIT.ratingA.leverage, CREDIT.ratingA.overdraftDays)) return 'A';
  if (meets('B', CREDIT.ratingB.leverage, CREDIT.ratingB.overdraftDays)) return 'B';
  if (meets('C', CREDIT.ratingC.leverage, Number.POSITIVE_INFINITY)) return 'C';
  return 'D';
}

// ------------------------------------------------------------ haciz

/**
 * Haciz: kredili hesabı limitin `seizeTarget` oranına indirene kadar satar.
 *
 * Sıra, şirketi en az sakatlayan yoldan: önce başka şirketlerdeki
 * hisseler (en likit), sonra boş arsalar, sonra en çok zarar eden
 * binalar (yıkılır, arsası satılır), en son teminattaki arsalar —
 * onların geliri ÖNCE bağlı olduğu krediyi kapatır.
 */
function seize(state: GameState, company: CompanyState, credit: CreditState): { sold: number; proceeds: number; tileId?: number } {
  const target = overdraftLimit(company) * CREDIT.seizeTarget;
  let sold = 0;
  let proceeds = 0;
  let firstTile: number | undefined;
  const settle = () => {
    const pay = Math.min(company.cash, overdraftOf(company));
    company.cash -= pay;
    company.debt -= pay;
  };
  const enough = () => overdraftOf(company) <= target;

  // 1. Hisseler.
  for (const issuerId of Object.keys(company.shares).sort()) {
    if (enough()) break;
    if (issuerId === company.id) continue;
    const held = company.shares[issuerId] ?? 0;
    const price = sharePrice(state, issuerId);
    if (held <= 0 || price <= 0) continue;
    const count = Math.min(held, Math.ceil((overdraftOf(company) - target) / price));
    const before = company.cash;
    if (sellShares(state, company.id, issuerId, count).ok) {
      proceeds += company.cash - before;
      sold++;
      settle();
    }
  }

  const pledged = pledgedTiles(state);
  const sellLand = (tileId: number) => {
    const tile = state.map.tiles[tileId]!;
    const value = Math.round(tile.landValue * LAND_SELL_RATIO * CREDIT.seizeHaircut);
    tile.ownerId = null;
    firstTile ??= tileId;
    sold++;
    proceeds += value;
    // Teminattaki arsa önce kendi kredisini kapatır.
    let rest = value;
    for (const loan of credit.loans) {
      const at = loan.collateral?.indexOf(tileId) ?? -1;
      if (at < 0) continue;
      loan.collateral!.splice(at, 1);
      const pay = Math.min(rest, loan.balance);
      loan.balance -= pay;
      company.debt -= pay;
      rest -= pay;
    }
    credit.loans = credit.loans.filter((loan) => loan.balance > 0.5);
    company.cash += rest;
    settle();
  };
  const razeAndSell = (buildingId: string) => {
    const building = state.buildings[buildingId]!;
    const def = BUILDING_BY_ID[building.defId];
    const tile = state.map.tiles[building.tileId]!;
    const refund = def ? Math.round(def.cost * 0.25 * CREDIT.seizeHaircut) : 0;
    delete state.buildings[buildingId];
    tile.buildingId = null;
    company.cash += refund;
    proceeds += refund;
    settle();
    if (!pledged.has(tile.id)) sellLand(tile.id);
    else firstTile ??= tile.id;
  };

  // 2. Boş, rehinsiz arsalar (değerliden ucuza: en az parselle kapansın).
  const emptyFree = state.map.tiles
    .filter((tile) => tile.ownerId === company.id && !tile.buildingId && !pledged.has(tile.id))
    .sort((a, b) => b.landValue - a.landValue || a.id - b.id);
  for (const tile of emptyFree) {
    if (enough()) break;
    sellLand(tile.id);
  }

  // 3. Binalar: en çok zarar edenden.
  const buildings = Object.values(state.buildings)
    .filter((building) => building.companyId === company.id)
    .sort((a, b) => (a.profitTrend ?? a.last.profit) - (b.profitTrend ?? b.last.profit) || a.id.localeCompare(b.id));
  for (const building of buildings) {
    if (enough()) break;
    razeAndSell(building.id);
  }

  // 4. Teminattaki boş arsalar.
  for (const tileId of [...pledged].sort((a, b) => a - b)) {
    if (enough()) break;
    const tile = state.map.tiles[tileId];
    if (tile?.ownerId !== company.id || tile.buildingId) continue;
    sellLand(tileId);
  }

  return { sold, proceeds, ...(firstTile !== undefined ? { tileId: firstTile } : {}) };
}

// ------------------------------------------------------------ gün

/** Günlük banka adımı. Motorun eski `settleCredit`inin yerinde koşar. */
export function runCreditTick(state: GameState): void {
  const enabled = creditEnabled(state);
  const day = state.time.day;

  for (const company of Object.values(state.companies)) {
    // ---- 1. Taksitlerin anapara kısmı (faiz pazar adımında yazıldı) ----
    const credit = company.credit;
    if (credit && credit.loans.length > 0) {
      for (const loan of credit.loans) {
        const interest = (loan.balance * loan.rate) / 365;
        const maturity = loan.startDay + loan.termDays;
        const due = day >= maturity;
        const principal = due
          ? loan.balance
          : loan.kind === 'bond'
            ? 0
            : Math.min(loan.balance, Math.max(0, loan.payment - interest));
        if (loan.kind === 'bond' && company.isPlayer) {
          if (due) {
            pushNews(
              state,
              company.cash >= principal ? 'neutral' : 'bad',
              'Tahvil vadesi geldi',
              company.cash >= principal
                ? `${formatMoney(principal)} anapara kasadan ödendi.`
                : `${formatMoney(principal)} anaparanın kasada olmayan ${formatMoney(principal - Math.max(0, company.cash))} kısmı kredili hesaba geçti.`,
            );
          } else if (maturity - day === CREDIT.bond.warnDays) {
            pushNews(
              state,
              'bad',
              'Tahvil vadesi yaklaşıyor',
              `${CREDIT.bond.warnDays} gün sonra ${formatMoney(loan.balance)} anapara tek seferde ödenecek. Kasada yoksa fark kredili hesaba geçer.`,
            );
          }
        }
        loan.balance -= principal;
        company.cash -= principal;
        company.debt -= principal;
      }
      credit.loans = credit.loans.filter((loan) => loan.balance > 0.5);
    }

    // ---- 2. Kredili hesap: eksi kasa borca, artı kasa önce borcu kapatır ----
    if (company.cash < 0) {
      company.debt += -company.cash;
      company.cash = 0;
    } else {
      const pay = Math.min(company.cash, overdraftOf(company));
      if (pay > 0) {
        company.cash -= pay;
        company.debt -= pay;
      }
    }
    if (company.debt < 0.01) company.debt = 0;

    const overdraft = overdraftOf(company);
    if (!enabled) {
      if (company.isPlayer && overdraft > 0) {
        const limit = Math.max(200_000, grossAssets(company) * LEGACY_LIMIT_RATIO);
        if (company.debt > limit) {
          pushNews(state, 'bad', 'Kredi limiti aşıldı', 'Borcun varlıklarını taşıyamıyor. Zarar eden binaları kapatmayı veya arsa satmayı düşün.');
        }
      }
      continue;
    }

    // ---- 3. Not ----
    if (!company.credit && company.debt <= 0) continue;
    const bank = ensureCredit(company);
    bank.overdraftDays = bank.overdraftDays * (1 - 1 / CREDIT.overdraftMemoryDays) + (overdraft > 0 ? 1 : 0);
    const before = bank.rating;
    bank.rating = computeRating(state, company, bank);
    if (company.isPlayer && before !== bank.rating) {
      const worse = RATING_ORDER.indexOf(bank.rating) > RATING_ORDER.indexOf(before);
      pushNews(
        state,
        worse ? 'bad' : 'good',
        `Kredi notun ${bank.rating}'ye ${worse ? 'düştü' : 'yükseldi'}`,
        `${CREDIT_RATINGS[bank.rating].blurb} Yeni kredilerde faiz farkı %${Math.round(CREDIT_RATINGS[bank.rating].spread * 100)}.`,
      );
    }

    // ---- 4. Muacceliyet: not D'ye düşen şirketin kredileri kredili hesaba ----
    //
    // Vadeli kredinin krediye ÖZGÜ riski bu. Taksit küçük tutulduğu için
    // (limitler) kötü günde kredisi olan ile olmayan arasında fark
    // çıkmıyordu; gerçek bankanın sözleşmesindeki "kaldıraç şartı
    // bozulursa borç muaccel olur" maddesi farkı yaratıyor: bakiye bir
    // anda en pahalı ve en dar hesaba geçiyor ve ihtar saati başlıyor.
    if (bank.rating === 'D' && bank.loans.length > 0) {
      const called = bank.loans.reduce((sum, loan) => sum + loan.balance, 0);
      bank.loans = [];
      pushNews(
        state,
        company.isPlayer ? 'bad' : 'rival',
        company.isPlayer ? 'Banka kredileri muaccel kıldı' : `${company.name}'in kredileri muaccel`,
        `Kredi notu D: ${formatMoney(called)} kalan anapara kredili hesaba geçti (yıllık %${Math.round(overdraftRate(state, company) * 100)}).`,
        company.id,
      );
    }

    // ---- 5. İhtar ve haciz ----
    const limit = overdraftLimit(company);
    const exposed = overdraftOf(company);
    if (exposed <= limit) {
      delete bank.arrearsDays;
      continue;
    }
    bank.arrearsDays = (bank.arrearsDays ?? 0) + 1;
    if (bank.arrearsDays === 1 && company.isPlayer) {
      pushNews(
        state,
        'bad',
        'Banka ihtar çekti',
        `Kredili hesap ${formatMoney(exposed)}, limit ${formatMoney(limit)}. ${CREDIT.graceDays} gün içinde limitin altına inmezse haciz başlar: önce boş arsalar, sonra zarar eden binalar satılır.`,
      );
    }
    if (bank.arrearsDays <= CREDIT.graceDays) continue;

    const result = seize(state, company, bank);
    delete bank.arrearsDays;
    bank.lastDefaultDay = day;
    bank.rating = 'D';
    // Satılacak bir şey kalmadıysa haciz yeni bir olay değil: haber yok.
    if (result.sold === 0) continue;
    bank.defaults = (bank.defaults ?? 0) + 1;
    const where = result.tileId !== undefined ? { companyId: company.id, tileId: result.tileId } : company.id;
    pushNews(
      state,
      company.isPlayer ? 'bad' : 'rival',
      company.isPlayer ? 'Haciz' : `${company.name}'e haciz`,
      `Banka ${result.sold} varlığı sattı, ${formatMoney(result.proceeds)} borca sayıldı. Not ${CREDIT.defaultMemoryDays} gün D.`,
      where,
    );
  }
}

// ------------------------------------------------------------ rakipler

/**
 * Rakibin borçlanması — karar gününde, yatırımdan önce.
 *
 * Doktrin: genişlemeci ve ev sahibi borçla büyür, fiyat kırıcı hiç
 * borçlanmaz (maliyet disiplini). Yalnızca A/B notunda, nakit
 * sıkışıkken ve kaldıraç doktrin tavanının altındayken; elinde yarısı
 * ödenmemiş aynı türden kredi varken yenisini çekmez.
 */
export function npcBorrow(state: GameState, profile: NpcProfileDef): void {
  if (!creditEnabled(state)) return;
  const doctrine = NPC_CREDIT[profile.trait];
  if (doctrine.maxLeverage <= 0) return;
  const company = state.companies[profile.id];
  if (!company) return;
  const rating = ratingOf(company);
  if (rating !== 'A' && rating !== 'B') return;
  const gross = grossAssets(company);
  if (gross <= 0 || company.cash >= doctrine.cashTight * gross) return;
  if (loansOf(company).some((loan) => loan.kind === doctrine.kind && loan.balance > loan.principal * 0.5)) return;

  const quote = loanQuote(state, company.id, doctrine.kind, doctrine.termDays);
  if (!quote.ok) return;
  const room = (doctrine.maxLeverage * gross - company.debt) / (1 - doctrine.maxLeverage);
  const amount = Math.floor(Math.min(quote.max, room) / 1000) * 1000;
  if (amount < CREDIT.minLoan) return;
  if (!takeLoan(state, company.id, doctrine.kind, amount, doctrine.termDays).ok) return;
  pushNews(
    state,
    'rival',
    `${company.name} bankadan ${formatMoney(amount)} çekti`,
    `${doctrine.termDays} gün vadeli, yıllık %${(quote.rate * 100).toFixed(1).replace('.', ',')}${doctrine.kind === 'secured' ? ', arsaları teminatta' : ''}. Genişleme bütçesi büyüdü.`,
    company.id,
  );
}
