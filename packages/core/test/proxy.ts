/**
 * Oyuncu vekili — oyunun oyuncuya ÖNERDİĞİ oynanış, tek kopya.
 *
 * Önce zincir kartının hamlesi (kart "henüz erken" ya da "ertelendi"
 * demiyorsa), sonra fırsat lensinin gösterdiği yere mağaza. Vekilin
 * akıllanması bilinçli: harness "bilgili bir oyuncu ne yaşar" sorusunu
 * ölçmeli, oyunun tavsiyesini görmezden gelen birini değil.
 *
 * Bu dosyadan önce aynı vekil dört yerde ayrı ayrı yazılıydı (denge,
 * benchmark, zincir ölçeği deneyi) ve her turda biri geride kalıyordu:
 * Tur 14'te devralma repertuvarı balance'a girdi, benchmark'a girmedi ve
 * iki ölçüm aynı soruya farklı cevap verdi. Artık vekil bir tane; deney
 * yalnızca seçeneklerle (tavan, günlük) ayrışıyor.
 */
import { BUILDING_BY_ID, NPC_PROFILES } from '@capital/content';
import {
  GameEngine,
  buildOptions,
  capRemaining,
  chainCards,
  districtOpportunity,
  estimateInvestment,
  freeFloat,
  getPlayer,
  isDistrictOpen,
  sharePrice,
  sharesHeld,
  tilePrice,
  sharesOutstanding,
} from '../src/index';
import type { ChainMove } from '../src/index';
import type { GameState } from '../src/types';

/*
 * OYUNDA OLAN RAKİPLER, KATALOGDAKİLER DEĞİL.
 *
 * Katalogda sekiz profil var, varsayılan haritada dört şirket kuruluyor;
 * kalan dördü için `state.companies[id]` undefined. Doğru kaynak state:
 * kimin sahaya çıktığını dünya kurulumu belirliyor.
 */
export function activeProfiles(state: GameState) {
  return NPC_PROFILES.filter((profile) => state.companies[profile.id]);
}

export interface ChainFollowOptions {
  /** Oyuncunun en fazla kaç üretim ünitesi olsun (deney tavanı). */
  maxUnits?: number;
  /** Kurulan her hamle için çağrılır (satın alma günlüğü). */
  onBuilt?: (move: ChainMove, tilePrice: number) => void;
}

/** Şirketin üretim ünitesi sayısı (ham madde + işleme). */
export function ownUnits(state: GameState, companyId: string): number {
  let count = 0;
  for (const building of Object.values(state.buildings)) {
    if (building.companyId !== companyId) continue;
    const role = BUILDING_BY_ID[building.defId]?.role;
    if (role === 'extract' || role === 'process') count++;
  }
  return count;
}

/** Zincir kartının önerdiği hamleyi uygular; "erken" ve "ertelendi" olanı atlar. */
export function followChainAdvice(engine: GameEngine, options: ChainFollowOptions = {}): boolean {
  const state = engine.getState();
  const player = getPlayer(state);
  if (options.maxUnits !== undefined && ownUnits(state, player.id) >= options.maxUnits) return false;

  for (const card of chainCards(state, player.id)) {
    const move = card.move;
    if (!move || move.premature || move.deferred) continue;
    const price = tilePrice(state, move.tileId, player.id);
    if (move.cost + price > player.cash * 0.6) continue;

    const acquired = move.needsBuyout
      ? engine.dispatch({ type: 'BUYOUT_TILE', tileId: move.tileId })
      : engine.dispatch({ type: 'BUY_TILE', tileId: move.tileId });
    if (!acquired.ok) continue;
    if (engine.dispatch({ type: 'BUILD', tileId: move.tileId, defId: move.defId }).ok) {
      options.onBuilt?.(move, price);
      return true;
    }
  }
  return false;
}

/**
 * Fırsat lensinin gösterdiği bölgeye en kârlı mağaza.
 *
 * BOŞ PARSEL ÖNCE, YOKSA DEVRALMA — oyunun kendi öğretisi (Tur 8: "bölge
 * dolduğunda çıkış devralma") ve NPC'lerin oynadığı sıra. Vekil yalnızca
 * boş parsel ararken kademeli imar gerçek bir kör nokta açmıştı: dar
 * şehirde boş parsel ~60. günde bitiyor, NPC'ler devralmayla büyürken
 * vekil duruyordu — oyuncu/rakip oranı 1,58'den 0,20'ye düşen şey oyun
 * dengesi değil vekilin eksik repertuvarıydı.
 */
export function expandOutlets(engine: GameEngine): void {
  const state = engine.getState();
  const player = getPlayer(state);

  // Nakdin yarısını riske at, gerisini yedekte tut.
  const budget = player.cash * 0.5;
  if (budget < 30_000) return;

  const districts = [...state.districts]
    // Kilitli bölge hedef değil: orada seçim yapıp satın alma kapısından
    // dönmek vekilin 5 günlük hamlesini boşa yakıyordu.
    .filter((district) => isDistrictOpen(state, district.id))
    .sort((a, b) => districtOpportunity(b) - districtOpportunity(a));

  let best: { tileId: number; defId: string; profit: number } | null = null;

  for (const district of districts.slice(0, 4)) {
    const tile = state.map.tiles
      .filter((t) => t.districtId === district.id && t.kind === 'plot' && !t.ownerId && !t.buildingId)
      .map((t) => ({ tile: t, price: tilePrice(state, t.id, player.id) }))
      .filter((entry) => entry.price > 0)
      .sort(
        (a, b) =>
          (a.tile.structureId !== null ? 1 : 0) - (b.tile.structureId !== null ? 1 : 0) ||
          a.price - b.price,
      )[0]?.tile;
    if (!tile) continue;

    for (const option of buildOptions(state)) {
      if (!option.unlocked) continue;
      if (option.def.role !== 'outlet' && option.def.role !== 'rental') continue;
      if (tilePrice(state, tile.id) + option.def.cost > budget) continue;

      const estimate = estimateInvestment(state, district.id, option.def.id, player.id);
      // SIRALAMA GERİ ÖDEMEYE GÖRE DEĞİL, GÜNLÜK KÂRA GÖRE.
      //
      // Bir bina bir parsel kaplıyor ve ölçüm oyunun kıt kaynağının
      // toprak olduğunu gösterdi (sınırsız nakitle bile karşılanmayan
      // talep %52). O yüzden doğru ölçüt paranın getirisi değil
      // PARSELİN getirisi — o da tam olarak `dailyProfit`. Geri ödeme
      // sınırı elenmiş adayları ayıklamak için duruyor.
      if (!estimate || estimate.paybackDays > 150) continue;
      if (!best || estimate.dailyProfit > best.profit) {
        best = { tileId: tile.id, defId: option.def.id, profit: estimate.dailyProfit };
      }
    }
  }

  if (!best) return;
  const needsBuyout = state.map.tiles[best.tileId]!.structureId !== null;
  const bought = needsBuyout
    ? engine.dispatch({ type: 'BUYOUT_TILE', tileId: best.tileId })
    : engine.dispatch({ type: 'BUY_TILE', tileId: best.tileId });
  if (!bought.ok) return;
  engine.dispatch({ type: 'BUILD', tileId: best.tileId, defId: best.defId });
}

/**
 * Zincir A/B'sinin TARİHSEL genişleme kolu — bilerek dondurulmuş kopya.
 *
 * `expandOutlets` devralmayı öğrendi; bu kopya öğrenmedi ve öğrenmeyecek.
 * Regresyon deneyi +%12/+%19/+%30 serisiyle bu düzenekte kalibre edildi;
 * düzeneği vekille birlikte evriltmek her turda "yeni bir deney" yaratır
 * ve seri kıyaslanamaz hale gelirdi.
 *
 * KİLİT FİLTRESİ İSTİSNA (Tur 21). Kopya karşılanmayan talebi en yüksek
 * dört bölgeye bakıyordu ve imara kapalı bölgeleri elemiyordu. Kilitli
 * bölgede kimse kuramadığı için boş talep ~%100: dört slotu onlar
 * doldurunca alım reddediliyor ve kol o hafta HİÇBİR ŞEY kurmuyordu. Hata
 * Tur 14'ten (kademeli imar) beri vardı; bölgeler arası erişim Tur 21'de
 * düzelince sıralama değişti ve vekil 560 günde 2–4 M ₺'de kaldı, yedi
 * tohumun altısında zincir 1 üniteye indi. Filtre kuralı değiştirmiyor
 * (yine yalnızca boş parsel, devralma yok), yalnızca yasak hamleyi eliyor.
 */
export function expandOutletsVacantOnly(engine: GameEngine): void {
  const state = engine.getState();
  const player = getPlayer(state);

  const budget = player.cash * 0.5;
  if (budget < 30_000) return;

  const districts = [...state.districts]
    .filter((district) => isDistrictOpen(state, district.id))
    .sort((a, b) => districtOpportunity(b) - districtOpportunity(a));

  let best: { tileId: number; defId: string; profit: number } | null = null;

  for (const district of districts.slice(0, 4)) {
    const tile = state.map.tiles
      .filter((t) => t.districtId === district.id && t.kind === 'plot' && !t.ownerId && !t.structureId)
      .sort((a, b) => a.landValue - b.landValue)[0];
    if (!tile) continue;

    for (const option of buildOptions(state)) {
      if (!option.unlocked) continue;
      if (option.def.role !== 'outlet' && option.def.role !== 'rental') continue;
      if (tilePrice(state, tile.id) + option.def.cost > budget) continue;

      const estimate = estimateInvestment(state, district.id, option.def.id, player.id);
      if (!estimate || estimate.paybackDays > 150) continue;
      if (!best || estimate.dailyProfit > best.profit) {
        best = { tileId: tile.id, defId: option.def.id, profit: estimate.dailyProfit };
      }
    }
  }

  if (!best) return;
  if (!engine.dispatch({ type: 'BUY_TILE', tileId: best.tileId }).ok) return;
  engine.dispatch({ type: 'BUILD', tileId: best.tileId, defId: best.defId });
}

/*
 * ZİNCİR VE MAĞAZA AYNI TİKTE — ya biri ya öteki değil.
 *
 * Eski hâli `if (followChainAdvice()) return;` idi: zincir hamlesi olan
 * hafta mağaza açılmıyordu. Devralma repertuvara girince bu, zincir
 * A/B'sini iki değişkenli bir deneye çevirdi — zincirli kol hem üretim
 * ekliyor HEM mağaza eksiltiyordu (42 ünite = 42 eksik mağaza) ve fark
 * −%1'e düştü. Gerçek oyuncu nakdi yetiyorsa ikisini de yapar; vekil de
 * öyle yapınca kollar arasında tek fark zincirin KENDİSİ kalıyor.
 */
export function playerStrategy(engine: GameEngine): void {
  followChainAdvice(engine);
  expandOutlets(engine);
}

/**
 * Baskın savunması — oyunun uyarısına uyan oyuncu.
 *
 * Motor %10/%25/%40 eşiklerinde "kendi hisseni geri al" diye haber
 * düşüyor. `playerStrategy` bunu BİLEREK yapmıyor (dengenin tarihsel
 * ölçümleri savunmasız vekille kalibre edildi); zorluk kalibrasyonu ise
 * uyarıyı okuyan bir oyuncuyla ölçülmeli — yoksa ölçülen şey zorluk
 * değil vekilin sağırlığı olur.
 */
export function defendAgainstRaids(engine: GameEngine): void {
  const state = engine.getState();
  const player = getPlayer(state);
  let threat = 0;
  for (const other of Object.values(state.companies)) {
    if (other.id === player.id) continue;
    threat = Math.max(threat, sharesHeld(state, other.id, player.id));
  }
  if (threat / sharesOutstanding(state, player.id) < 0.2) return;
  const price = sharePrice(state, player.id);
  if (price <= 0) return;
  // Günlük tavan (Tur 20): rakibin geri alımıyla aynı kural.
  const count = Math.min(capRemaining(state, player.id, player.id), freeFloat(state, player.id), Math.floor((player.cash * 0.4) / price));
  if (count > 0) engine.dispatch({ type: 'BUY_SHARES', companyId: player.id, count });
}
