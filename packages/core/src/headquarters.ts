import type { BuildingInstance, GameState } from './types';

/**
 * Genel merkez — imparatorluğun adresi.
 *
 * Oyun raporu: *"kurduğum imparatorluk benim gibi olmalı."* Şirketin bir
 * adı vardı ama bir YERİ yoktu: ilk açtığın dükkân sıradan bir kutuydu,
 * haritada hiçbir bina "burası benim merkezim" demiyordu.
 *
 * SAKLANMIYOR, TÜRETİLİYOR. Şema alanı açmak, migration yazmak ve bina
 * yıkıldığında ortada kalan bir kimliği temizlemek gerekirdi. Oysa kural
 * tek cümlede duruyor: **en eski binan merkezindir.** Bu kural kendini
 * onarıyor da — merkezi yıkarsan bir sonraki en eski bina merkez olur,
 * yani şirket taşınır. Gerçek bir şirketin yapacağı şey de bu.
 *
 * Eşitlik durumunda kimlik sırasına bakılıyor: aynı günde kurulan iki
 * bina arasında sabit bir seçim olmazsa merkez her karede yer değiştirir
 * ve haritada titreşen bir işaret olurdu.
 */
export function headquarters(state: GameState, companyId: string): BuildingInstance | null {
  let best: BuildingInstance | null = null;

  for (const building of Object.values(state.buildings)) {
    if (building.companyId !== companyId) continue;
    if (
      !best ||
      building.builtDay < best.builtDay ||
      (building.builtDay === best.builtDay && building.id < best.id)
    ) {
      best = building;
    }
  }

  return best;
}
