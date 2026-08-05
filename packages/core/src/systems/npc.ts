import { BUILDINGS, CATEGORIES, CONSUMER_CATEGORIES, NPC_PROFILES } from '@capital/content';
import type { BuildingDef, CategoryId, NpcProfileDef } from '@capital/content';
import { build, buyTile, buyoutTile } from '../actions';
import { pushNews } from '../news';
import { nextFloat } from '../rng';
import { estimateInvestment } from './market';
import { tilePrice } from './city';
import type { GameState } from '../types';

/**
 * Rakip yapay zekâsı.
 *
 * NPC'ler haftada bir karar verir ve kararlarını oyuncuyla aynı
 * `actions.ts` fonksiyonlarıyla uygular — aynı fiyat, aynı nakit kısıtı,
 * aynı kilit kuralları. Zorluk, görünmez bonuslarla değil kişilik
 * ağırlıklarıyla ayarlanır.
 *
 * Kişilik, üç yerde kendini gösterir:
 *   - hangi fırsatı seçtiği (talep mi, marj mı),
 *   - nereye girdiği (gelir seviyesi tercihi),
 *   - fiyatı nasıl kurduğu.
 */

const DECISION_PERIOD_DAYS = 7;
/** Oyuncu bir kategoride bu payı geçerse rakipler oraya yönelir. */
const PLAYER_THREAT_SHARE = 0.4;
/**
 * Rakipler de kârlılığa bakar. Bu eşik olmadan NPC'ler her hafta bina dikip
 * pazarı doyuruyor ve ekonomi çöküyordu — oyuncu gibi onlar da geri ödemesi
 * makul olmayan yatırımdan kaçınır.
 */
const MAX_PAYBACK_DAYS = 170;

interface Opportunity {
  districtId: number;
  category: CategoryId;
  score: number;
}

function traitDistrictFit(profile: NpcProfileDef, incomeLevel: number): number {
  switch (profile.trait) {
    case 'premium':
      return 0.35 + incomeLevel * 1.3;
    case 'price_cutter':
      return 1.35 - incomeLevel * 0.7;
    case 'tech':
      return 0.6 + incomeLevel * 0.9;
    default:
      return 1;
  }
}

function findOpportunities(state: GameState, profile: NpcProfileDef): Opportunity[] {
  const player = state.companies[state.playerCompanyId];
  const opportunities: Opportunity[] = [];

  for (const district of state.districts) {
    for (const category of CONSUMER_CATEGORIES) {
      const demand = district.demand[category] ?? 0;
      if (demand <= 0) continue;

      const unmetUnits = demand * (district.unmet[category] ?? 0);
      const def = CATEGORIES[category];
      const marginPerUnit = def.basePrice * (1 - def.costRatio) * profile.priceMultiplier;

      // Karşılanmamış talep ve birim marj; üstüne kalabalık cezası.
      let score =
        Math.pow(unmetUnits, 0.75) * profile.demandWeight +
        marginPerUnit * profile.marginWeight * 0.6;
      score *= traitDistrictFit(profile, district.incomeLevel);
      score /= 1 + (district.outletCount[category] ?? 0) * 0.35;

      // Oyuncu bir kategoriyi domine ediyorsa rakip oraya baskı yapar.
      if (player && (player.marketShare[category] ?? 0) > PLAYER_THREAT_SHARE) {
        score *= 1.4;
      }

      opportunities.push({ districtId: district.id, category, score });
    }
  }

  opportunities.sort((a, b) => b.score - a.score);
  return opportunities;
}

/** Bütçeye ve kilide uyan, kapasitesi en yüksek binayı seçer. */
function chooseBuilding(
  state: GameState,
  companyId: string,
  category: CategoryId,
  budget: number,
  wantRental: boolean,
): BuildingDef | null {
  const company = state.companies[companyId];
  if (!company) return null;

  const candidates = BUILDINGS.filter((def) => {
    if (wantRental ? def.role !== 'rental' : def.role !== 'outlet') return false;
    if (!wantRental && def.category !== category) return false;
    if (def.cost > budget) return false;
    if (company.netWorth < def.unlockNetWorth) return false;
    return true;
  });

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.capacity - a.capacity);
  return candidates[0]!;
}

/**
 * Hedef district'te alınabilecek en uygun parseli bulur.
 *
 * Rakipler de oyuncuyla aynı kısıtla yaşar: sokağa ve kamu alanına
 * giremezler. Boş parsel kalmadıysa mevcut yapıyı primli devralmayı
 * değerlendirirler — tıpkı oyuncunun yapabildiği gibi.
 */
function findTile(
  state: GameState,
  districtId: number,
  cash: number,
  preferExpensive: boolean,
): { tileId: number; needsBuyout: boolean } | null {
  const candidates: Array<{ tileId: number; needsBuyout: boolean; price: number }> = [];

  for (const tile of state.map.tiles) {
    if (tile.districtId !== districtId) continue;
    if (tile.kind !== 'plot' || tile.ownerId || tile.buildingId) continue;

    const price = tilePrice(state, tile.id);
    if (price <= 0 || price > cash) continue;
    candidates.push({ tileId: tile.id, needsBuyout: tile.structureId !== null, price });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    // Boş parsel her zaman önce; devralma pahalı bir son çaredir.
    if (a.needsBuyout !== b.needsBuyout) return a.needsBuyout ? 1 : -1;
    return preferExpensive ? b.price - a.price : a.price - b.price;
  });

  return candidates[0]!;
}

function actFor(state: GameState, profile: NpcProfileDef): void {
  const company = state.companies[profile.id];
  if (!company) return;

  const budget = company.cash * profile.aggression;
  const isLandlord = profile.trait === 'landlord';

  // Arsa spekülatörü: bazen sadece arsa toplar, bina kurmaz.
  if (isLandlord && nextFloat(state.rng) < 0.45) {
    const target = [...state.districts].sort(
      (a, b) => b.incomeLevel - a.incomeLevel,
    )[0];
    if (target) {
      const spot = findTile(state, target.id, budget, true);
      if (spot) {
        if (spot.needsBuyout) buyoutTile(state, profile.id, spot.tileId);
        else buyTile(state, profile.id, spot.tileId);
      }
    }
    return;
  }

  const opportunities = findOpportunities(state, profile);

  for (const opportunity of opportunities.slice(0, 6)) {
    const def = chooseBuilding(state, profile.id, opportunity.category, budget, isLandlord);
    if (!def) continue;

    // Kârlılık kapısı: oyuncuya gösterilen tahminin aynısı.
    const estimate = estimateInvestment(state, opportunity.districtId, def.id, profile.id);
    if (!estimate || estimate.paybackDays > MAX_PAYBACK_DAYS) continue;

    const spot = findTile(state, opportunity.districtId, budget - def.cost, isLandlord);
    if (!spot) continue;

    const acquired = spot.needsBuyout
      ? buyoutTile(state, profile.id, spot.tileId)
      : buyTile(state, profile.id, spot.tileId);
    if (!acquired.ok) continue;
    if (!build(state, profile.id, spot.tileId, def.id).ok) continue;

    // Fiyat politikası kişilikten gelir.
    const tile = state.map.tiles[spot.tileId];
    const buildingId = tile?.buildingId;
    const building = buildingId ? state.buildings[buildingId] : undefined;
    if (building && profile.priceMultiplier !== 1) {
      building.autoPrice = false;
      building.priceMultiplier = profile.priceMultiplier;
    }

    const district = state.districts[opportunity.districtId];
    pushNews(
      state,
      'rival',
      `${profile.name} genişliyor`,
      spot.needsBuyout
        ? `${district?.name ?? 'Şehirde'} bölgesinde bir parseli devralıp ${def.name} açtı.`
        : `${district?.name ?? 'Şehirde'} bölgesinde ${def.name} açtı.`,
    );
    return;
  }
}

export function runNpcTick(state: GameState): void {
  if (!state.flags.npcCompetition) return;

  NPC_PROFILES.forEach((profile, index) => {
    if (!state.companies[profile.id]) return;
    // Kararları güne yay: hepsi aynı gün hamle yapmasın.
    if ((state.time.day + index * 2) % DECISION_PERIOD_DAYS !== 0) return;
    actFor(state, profile);
  });
}
