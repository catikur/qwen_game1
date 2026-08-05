import type { NpcProfileDef } from './types';

/**
 * Rakip şirketler.
 *
 * Hepsi oyuncuyla aynı kurallara tabidir: aynı bina maliyetleri, aynı pazar
 * formülü, aynı nakit kısıtı. Fark sadece karar verirken neye ağırlık
 * verdikleri — yani kişilikleri. Görünmez avantaj yok.
 */
export const NPC_PROFILES: NpcProfileDef[] = [
  {
    id: 'nova_holding',
    name: 'Nova Holding',
    trait: 'expansionist',
    startingCash: 260_000,
    marginWeight: 0.4,
    demandWeight: 1.0,
    priceMultiplier: 1.0,
    aggression: 0.75,
    color: '#e2574c',
    description: 'Boşluk gördüğü her yere girer. Hızlı büyür, marjı umursamaz.',
  },
  {
    id: 'kilit_market',
    name: 'Kilit Market',
    trait: 'price_cutter',
    startingCash: 220_000,
    marginWeight: 0.7,
    demandWeight: 0.8,
    priceMultiplier: 0.86,
    aggression: 0.55,
    color: '#e8913c',
    description: 'Fiyatı sürekli kırar. Aynı kategoride onunla fiyat savaşına girmek pahalıdır.',
  },
  {
    id: 'meridyen',
    name: 'Meridyen Grup',
    trait: 'premium',
    startingCash: 300_000,
    marginWeight: 0.9,
    demandWeight: 0.6,
    priceMultiplier: 1.22,
    aggression: 0.45,
    color: '#c05fd8',
    description: 'Sadece yüksek gelirli bölgelere, yüksek fiyatla girer. Marka gücü yüksek.',
  },
  {
    id: 'atlas_yapi',
    name: 'Atlas Yapı',
    trait: 'landlord',
    startingCash: 340_000,
    marginWeight: 0.5,
    demandWeight: 0.5,
    priceMultiplier: 1.0,
    aggression: 0.6,
    color: '#4bb3a5',
    description: 'Arsa toplar, kira üretir. Merkezi arsaları senden önce kapmaya çalışır.',
  },
];
