import { BUILDING_BY_ID } from '@capital/content';
import type { GameState } from './types';

/**
 * Müşteri akışı — pazar payının şehir üzerindeki izdüşümü.
 *
 * Şehrin bugüne kadarki tek canlı katmanı KENDİ kamyonlarındı: senden
 * dışarı akan bir şey. Şehirden sana doğru akan hiçbir şey yoktu, çünkü
 * talep bir sayıydı (`district.demand[kategori]`) ve o sayının kime
 * gittiği ancak tablo açılınca görülüyordu.
 *
 * Bu dosya aynı sayıyı sokak seviyesine indiriyor. Her outlet dün kaç
 * birim sattığını zaten tutuyor (`building.last.unitsSold`); burada
 * yapılan tek şey o satışı, mağazaya gelen müşterilere bölmek. Çizim
 * katmanı bu akışları alıp üzerlerinde sahibinin renginde araç yürütüyor.
 *
 * Rekabetin görünür olduğu yer burası: rakip senden pay aldığında onun
 * kapısına akan araç sayısı artıyor, seninki azalıyor. Panel açmadan,
 * haritaya bakarak.
 *
 * `routes.ts` gibi tamamen TÜRETİLMİŞTİR — state'e yazmaz. Aynı gerekçe:
 * "hangi mağazaya kaç müşteri gider" bir kural işi, üçgen işi değil;
 * burada durursa tarayıcı açmadan test edilebiliyor.
 */

export interface CustomerFlow {
  /** Mağazanın parseli. */
  tileId: number;
  buildingId: string;
  companyId: string;
  /** Dün satılan birim. */
  units: number;
  /** Bulunduğu bölge + kategoride alınan pazar payı, 0..1. */
  share: number;
  /** Şehrin toplam perakende satışındaki payı, 0..1. */
  weight: number;
}

/**
 * Satış yapan bütün outlet'lerin müşteri akışı, çoktan aza sıralı.
 *
 * Sıralama bir süs değil: çizim katmanı sabit bir araç bütçesini bu
 * listeye dağıtıyor ve bütçe bitince kuyruğu kesiyor. Sıralı gelmeseydi
 * bütçenin kime gittiği listenin iç sırasına — yani inşa sırasına —
 * bağlı olurdu ve şehrin en işlek mağazası bazen boş kalırdı.
 */
export function customerFlows(state: GameState): CustomerFlow[] {
  const flows: CustomerFlow[] = [];
  let total = 0;

  for (const building of Object.values(state.buildings)) {
    const def = BUILDING_BY_ID[building.defId];
    if (!def || def.role !== 'outlet') continue;

    const units = building.last.unitsSold;
    if (units <= 0) continue;

    total += units;
    flows.push({
      tileId: building.tileId,
      buildingId: building.id,
      companyId: building.companyId,
      units,
      share: building.last.share,
      weight: 0,
    });
  }

  if (total > 0) {
    for (const flow of flows) flow.weight = flow.units / total;
  }

  flows.sort((a, b) => b.units - a.units || a.buildingId.localeCompare(b.buildingId));
  return flows;
}
