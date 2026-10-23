import type { GameCommand, LoggedCommand } from './types';

/**
 * Hayaletin hamleleri (Tur 54): "lider 300. günde ne yapmıştı".
 *
 * Koşu kodunun günlüğü (`LeagueRun.log`) motorun KABUL ettiği komutlar,
 * oynandıkları günle (engine.ts): koşunun kendisi. Burada yeniden oynatma
 * yok; günlük yalnızca okunup oyuncunun tanıdığı hamlelere çevriliyor.
 * Ödül toplama, şirket adı, holding içi aktarım gibi stratejiyi
 * anlatmayan komutlar sayılmıyor.
 */

export type GhostMoveKind =
  | 'build'
  | 'demolish'
  | 'land'
  | 'sellLand'
  | 'loan'
  | 'repay'
  | 'issue'
  | 'trade'
  | 'takeover'
  | 'city'
  | 'project'
  | 'bid'
  | 'lobby'
  | 'contract'
  | 'freight'
  | 'price'
  | 'shelf'
  | 'staff'
  | 'card';

const KIND: Partial<Record<GameCommand['type'], GhostMoveKind>> = {
  BUILD: 'build',
  DEMOLISH: 'demolish',
  BUY_TILE: 'land',
  BUYOUT_TILE: 'land',
  SELL_TILE: 'sellLand',
  TAKE_LOAN: 'loan',
  REPAY_LOAN: 'repay',
  ISSUE_SHARES: 'issue',
  BUY_SHARES: 'trade',
  SELL_SHARES: 'trade',
  PLACE_TAKEOVER_ORDER: 'takeover',
  OPEN_CITY: 'city',
  CONTRIBUTE_PROJECT: 'project',
  PLACE_BID: 'bid',
  LOBBY: 'lobby',
  ACCEPT_CONTRACT: 'contract',
  ACCEPT_FREIGHT: 'freight',
  SET_PRICE_MULTIPLIER: 'price',
  SET_AUTO_PRICE: 'price',
  SET_STOCK: 'shelf',
  SET_FOCUS: 'shelf',
  SET_WAGE_POLICY: 'staff',
  RESPOND_UNION: 'staff',
  CHOOSE_CARD: 'card',
};

/** Bir pencerede aynı türden hamlelerin toplamı (inşaatta bina türü başına). */
export interface GhostMove {
  kind: GhostMoveKind;
  /** Penceredeki ilk ve son günü. */
  day: number;
  lastDay: number;
  count: number;
  /** Bina türü (yalnız `build`). */
  defId?: string;
  /** Para toplamı: kredi, proje katkısı, ihale teklifi, lobi. */
  amount?: number;
}

function amountOf(command: GameCommand): number | undefined {
  switch (command.type) {
    case 'TAKE_LOAN':
    case 'CONTRIBUTE_PROJECT':
    case 'PLACE_BID':
    case 'LOBBY':
      return command.amount;
    default:
      return undefined;
  }
}

/**
 * `from` (dahil) ile `to` (hariç) arasındaki günlerin hamleleri, türe göre
 * toplanmış; ilk görüldükleri sırayla. Bozuk satır (bilinmeyen tür, sayı
 * olmayan gün) atlanıyor: kod doğrulanmamış olabilir.
 */
export function ghostMoves(log: readonly LoggedCommand[], from: number, to: number): GhostMove[] {
  const groups = new Map<string, GhostMove>();
  for (const row of log) {
    const [day, command] = row;
    if (typeof day !== 'number' || day < from || day >= to || !command) continue;
    const kind = KIND[command.type];
    if (!kind) continue;
    const defId = command.type === 'BUILD' && typeof command.defId === 'string' ? command.defId : undefined;
    const key = defId ? `${kind}:${defId}` : kind;
    const amount = amountOf(command);
    const group = groups.get(key);
    if (group) {
      group.count++;
      group.lastDay = day;
      if (amount !== undefined && Number.isFinite(amount)) group.amount = (group.amount ?? 0) + amount;
    } else {
      groups.set(key, {
        kind,
        day,
        lastDay: day,
        count: 1,
        ...(defId ? { defId } : {}),
        ...(amount !== undefined && Number.isFinite(amount) ? { amount } : {}),
      });
    }
  }
  return [...groups.values()];
}

/** Bir güne kadar (o gün dahil) yapılanların sayısı: lider ile oyuncu aynı ölçüyle. */
export interface GhostTally {
  /** Kurulan bina (yıkılanlar düşülmeden). */
  built: number;
  /** Alınan arsa (devralarak alınanlar dahil). */
  land: number;
  /** Çekilen kredi ve toplamı. */
  loans: number;
  borrowed: number;
  /** Bütün hamleler (yukarıdaki türlerin hepsi). */
  moves: number;
}

export function ghostTally(log: readonly LoggedCommand[], throughDay: number): GhostTally {
  const tally: GhostTally = { built: 0, land: 0, loans: 0, borrowed: 0, moves: 0 };
  for (const move of ghostMoves(log, Number.NEGATIVE_INFINITY, throughDay + 1)) {
    tally.moves += move.count;
    if (move.kind === 'build') tally.built += move.count;
    else if (move.kind === 'land') tally.land += move.count;
    else if (move.kind === 'loan') {
      tally.loans += move.count;
      tally.borrowed += move.amount ?? 0;
    }
  }
  return tally;
}
