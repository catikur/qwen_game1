/** CI kareleri: lig örnek veriyle (ağ yok; iOS `LeagueService.mock` ile aynı adlar ve puanlar). */
import { weekId, weekStart, type LiteState } from '@capital/lite-model';
import type { PrivateLeague, Standings, StarsBoard } from './league';

const NAMES = [
  'Kuzey Gıda', 'Ege Tekstil', 'Atlas Lojistik', 'Atilla Holding', 'Mavi Kahve', 'Demir Deri', 'Lale Moda',
  'Boğaz Yatırım', 'Sarı Fırın', 'Pusula Enerji', 'Toros Otomotiv', 'Rüzgâr AŞ', 'Kardelen', 'Anka Teknoloji',
  'Martı Havayolu', 'Yıldız Çarşı', 'Çınar', 'Karadeniz Çay', 'Ufuk', 'Gümüş Ticaret', 'Akdeniz', 'Nehir',
  'Kule Yapı', 'Defne', 'Ada Liman', 'Su Holding', 'Bulut', 'Zeytin', 'Dağ Madencilik', 'Kum Saati',
];
const PLATFORMS = ['ios', 'web', 'android'];

export function mockLeague(state: LiteState): { standings: Standings; privateLeagues: PrivateLeague[]; stars: StarsBoard; base: number } {
  const week = weekId(Date.now());
  const standings: Standings = {
    week,
    endsAt: weekStart(week) + 7 * 86_400_000,
    division: 2,
    divisionKey: 'gold',
    promote: 5,
    demote: 5,
    group: NAMES.map((name, index) => ({
      rank: index + 1,
      name,
      score: 9.6e12 / Math.pow(1.22, index),
      me: name === 'Atilla Holding',
      move: index < 5 ? 1 : index >= NAMES.length - 5 ? -1 : 0,
      platform: name === 'Atilla Holding' ? 'web' : PLATFORMS[index % 3],
    })),
  };
  const office = ['Deniz', 'Atilla Holding', 'Selin', 'Mert', 'Ece', 'Kaan'].map((name, index) => ({
    rank: index + 1,
    name,
    score: 4.1e12 / Math.pow(1.6, index),
    me: name === 'Atilla Holding',
    platform: PLATFORMS[(index + 1) % 3],
  }));
  const top = NAMES.slice(0, 12).map((name, index) => ({ rank: index + 1, name, stars: Math.round(420 / Math.pow(1.18, index)), platform: PLATFORMS[index % 3]!, me: false }));
  return {
    standings,
    privateLeagues: [{ code: 'K7P2QX', name: 'Ofis Ligi', members: office }],
    stars: {
      top,
      me: { rank: 87, stars: state.stars, platform: 'web' },
      friends: office.map((row, index) => ({ rank: index + 1, name: row.name, stars: Math.round(160 / Math.pow(1.4, index)), platform: row.platform!, me: row.me })),
    },
    base: 0,
  };
}
