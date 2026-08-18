import type { NpcProfileDef } from './types';

/**
 * Rakip şirketler.
 *
 * Hepsi oyuncuyla aynı kurallara tabidir: aynı bina maliyetleri, aynı pazar
 * formülü, aynı nakit kısıtı. Fark sadece karar verirken neye ağırlık
 * verdikleri — yani kişilikleri. Görünmez avantaj yok.
 *
 * SAYI DÖRTTEN SEKİZE ÇIKTI ve sebebi ölçüm. Tur 8'de 5×5 yerleşim
 * denenmiş ve ertelenmişti: 2,7 kat büyük şehirde 360. günde boş talep
 * %13'ten %53'e fırlıyordu. Tek değişkenli deney sorunun harita değil
 * İNŞAATÇI SAYISI olduğunu göstermişti — bot temposu artırılınca açık
 * %13'e geri iniyordu.
 *
 * `npcCount` artık haritanın parsel sayısıyla ölçekleniyor
 * (`worldgen.ts`), ama tavanı bu listenin uzunluğu. Dördü sekize
 * çıkarmak o tavanı kaldırıyor.
 *
 * Yeni dördü mevcutların kopyası değil: biri hiç kullanılmayan `tech`
 * doktrinini devreye sokuyor, diğerleri mevcut doktrinleri farklı
 * ağırlıklarla oynuyor — aynı kişilikten iki tane olması, aynı hamleyi
 * iki kez görmek demek olurdu.
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
    ceoName: 'Deniz Arkın',
    portrait: {
      skin: '#c9865c',
      hair: '#1d1614',
      hairStyle: 'crop',
      clothes: '#8c3a33',
      accent: '#e2574c',
      glasses: false,
      facialHair: true,
      background: '#3a1f1c',
    },
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
    ceoName: 'Sema Bozkurt',
    portrait: {
      skin: '#e0b088',
      hair: '#5a3a1e',
      hairStyle: 'wave',
      clothes: '#8a5a22',
      accent: '#e8913c',
      glasses: true,
      facialHair: false,
      background: '#3d2a12',
    },
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
    ceoName: 'Ferit Alagöz',
    portrait: {
      skin: '#b57a52',
      hair: '#2b2028',
      hairStyle: 'short',
      clothes: '#6a3a78',
      accent: '#c05fd8',
      glasses: false,
      facialHair: false,
      background: '#2f1a36',
    },
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
    ceoName: 'Nurgül Tekin',
    portrait: {
      skin: '#8f5f42',
      hair: '#20211f',
      hairStyle: 'bun',
      clothes: '#2c6b62',
      accent: '#4bb3a5',
      glasses: false,
      facialHair: false,
      background: '#16332f',
    },
  },
  {
    id: 'veri_sanayi',
    name: 'Veri Sanayi',
    trait: 'tech',
    startingCash: 280_000,
    marginWeight: 0.75,
    demandWeight: 0.7,
    priceMultiplier: 1.08,
    aggression: 0.5,
    color: '#3b6fd4',
    description: 'Ar-Ge\'ye yüklenir. Kalitesi zamanla açılır; erken oyunda sessiz, geç oyunda tehlikeli.',
    ceoName: 'Tolga Ersan',
    portrait: {
      skin: '#c08a62',
      hair: '#26303f',
      hairStyle: 'short',
      clothes: '#28457e',
      accent: '#3b6fd4',
      glasses: true,
      facialHair: false,
      background: '#16233d',
    },
  },
  {
    id: 'anadolu_gida',
    name: 'Anadolu Gıda',
    trait: 'price_cutter',
    startingCash: 190_000,
    marginWeight: 0.55,
    demandWeight: 1.0,
    priceMultiplier: 0.92,
    aggression: 0.4,
    color: '#c9971f',
    description: 'Kilit Market kadar sert kırmaz ama hiç durmaz. Yavaş, istikrarlı, her yerde.',
    ceoName: 'Hatice Yalın',
    portrait: {
      skin: '#d9a273',
      hair: '#3a2a1c',
      hairStyle: 'bun',
      clothes: '#7d5f14',
      accent: '#c9971f',
      glasses: false,
      facialHair: false,
      background: '#3a2c0d',
    },
  },
  {
    id: 'kule_gayrimenkul',
    name: 'Kule Gayrimenkul',
    trait: 'landlord',
    startingCash: 380_000,
    marginWeight: 0.35,
    demandWeight: 0.3,
    priceMultiplier: 1.0,
    aggression: 0.8,
    color: '#cc5b86',
    description: 'Atlas\'tan daha agresif arsa toplar. İhalede karşına en çok o çıkar.',
    ceoName: 'Bora Kayacan',
    portrait: {
      skin: '#a8724c',
      hair: '#1f1a1d',
      hairStyle: 'crop',
      clothes: '#8a3459',
      accent: '#cc5b86',
      glasses: false,
      facialHair: true,
      background: '#3a1a28',
    },
  },
  {
    id: 'firuze_grup',
    name: 'Firuze Grup',
    trait: 'premium',
    startingCash: 320_000,
    marginWeight: 0.95,
    demandWeight: 0.45,
    priceMultiplier: 1.35,
    aggression: 0.35,
    color: '#6f5b9e',
    description: 'Meridyen\'den de pahalı. Az sayıda ama çok kârlı mağaza açar; marjı asla bozmaz.',
    ceoName: 'Leyla Sarp',
    portrait: {
      skin: '#e2b892',
      hair: '#4a3550',
      hairStyle: 'wave',
      clothes: '#4b3d70',
      accent: '#6f5b9e',
      glasses: false,
      facialHair: false,
      background: '#241d3c',
    },
  },
];
