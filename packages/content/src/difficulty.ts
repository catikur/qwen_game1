import { localizeList } from './localize';
/**
 * Zorluk kademeleri.
 *
 * Kural (npc.ts başlığıyla aynı): zorluk GÖRÜNMEZ BONUSLA değil, açıkça
 * yazılı birkaç ayarla değişir — oyuncuya kurulum ekranında hepsi
 * söyleniyor. Rakip hile yapmıyor; daha cesur ya da daha temkinli
 * oynuyor, baskına daha erken ya da daha geç başlıyor.
 *
 * Ölçüm (Tur 17 değerlendirmesi): 15 günde bir hamle yapan "yavaş"
 * oyuncu Dengeli'de 540-785. günlerde devralınıyordu; 5 günde bir oynayan
 * bilgili oyuncu 31. günde birinci olup hiç tehdit görmüyordu. Rahat
 * kademe birincinin kurtuluşu, Acımasız ikincinin sınavı.
 */
export type DifficultyId = 'easy' | 'normal' | 'hard';

export interface DifficultyDef {
  id: DifficultyId;
  name: string;
  blurb: string;
  /** Başlangıç sermayesine çarpan. */
  startingCashMultiplier: number;
  /** Rakibin her hafta yatırıma ayırdığı nakde çarpan. */
  rivalBudgetMultiplier: number;
  /** Hisse baskınlarının başlamadığı ısınma süresi (gün). */
  raidWarmupDays: number;
  /** Bir baskıncının tek günde alabileceği en fazla hisse. */
  raidDailyCap: number;
  /** Zafer için gereken net değer (ve şehrin bir numarası olmak). */
  victoryNetWorth: number;
  /** Kurulum ekranında gösterilen, oyuncunun bileceği farklar. */
  facts: string[];
}

/*
 * Rakip bütçesi ve günlük baskın tavanı Tur 38'de ayarlandı. Geç oyun
 * giderleri (Tur 37a) büyüyen herkesi yavaşlatıyor ve rakipler oyuncudan
 * çok bina kurduğu için en çok onları: Dengeli'de savunmasız yavaş oyuncu
 * rakipleri geride bırakıyor, baskıncının hedefi olmaktan çıkıyordu (8
 * tohumda 2 düşüş, Tur 17'nin hedefi 5'te 4). Bütçe üç kademede aynı katla
 * (0,8/1/1,2 → 1,2/1,5/1,8: kademeler arası oran aynı), tavan Dengeli ve
 * Acımasız'da +%1. Ölçüm DURUM Tur 38'de.
 */
export const DIFFICULTIES: DifficultyDef[] = [
  {
    id: 'easy',
    name: 'Rahat',
    blurb: 'Şehri öğrenmek için. Rakipler temkinli, baskınlar geç ve yavaş başlar.',
    startingCashMultiplier: 1.4,
    rivalBudgetMultiplier: 1.2,
    raidWarmupDays: 320,
    raidDailyCap: 200,
    victoryNetWorth: 60_000_000,
    facts: ['%40 fazla başlangıç sermayesi', 'Baskınlar 320. günden sonra, günde en çok %2', 'Zafer: 60M ₺ ve bir numara'],
  },
  {
    id: 'normal',
    name: 'Dengeli',
    blurb: 'Oyunun tasarlandığı hâli. Geride kalan şirket avlanır.',
    startingCashMultiplier: 1,
    rivalBudgetMultiplier: 1.5,
    raidWarmupDays: 160,
    raidDailyCap: 450,
    victoryNetWorth: 100_000_000,
    facts: ['Standart sermaye', 'Baskınlar 160. günden sonra, günde en çok %4,5', 'Zafer: 100M ₺ ve bir numara'],
  },
  {
    id: 'hard',
    name: 'Acımasız',
    blurb: 'Rakipler daha cesur yatırır ve erken avlanır. Hata affedilmez.',
    startingCashMultiplier: 0.8,
    rivalBudgetMultiplier: 1.8,
    raidWarmupDays: 110,
    raidDailyCap: 550,
    victoryNetWorth: 150_000_000,
    facts: ['%20 az başlangıç sermayesi', 'Rakipler %20 daha cesur yatırır', 'Baskınlar 110. günden sonra, günde en çok %5,5', 'Zafer: 150M ₺ ve bir numara'],
  },
];

export const DEFAULT_DIFFICULTY: DifficultyId = 'normal';

export function getDifficulty(id: DifficultyId | undefined): DifficultyDef {
  return DIFFICULTIES.find((d) => d.id === (id ?? DEFAULT_DIFFICULTY)) ?? DIFFICULTIES[1]!;
}

// Metin alanları etkin dile bağlı (Tur 23); Türkçe yedek nesnenin kendi metni.
localizeList(DIFFICULTIES, 'difficulty', ['name', 'blurb', 'facts']);
