/**
 * Müşteri araçlarını mağazalara paylaştırma: önce ŞİRKETLERE, sonra şirket
 * içinde mağazalara.
 *
 * Neden iki kademe: oyuncunun sokakta okuduğu soru "benim kapılarım mı
 * rakibinkiler mi daha kalabalık". İlk sürüm aracı doğrudan mağazalara en
 * büyük kalan yöntemiyle dağıtıyordu. Kapı sırası kusursuzdu, ama şirket
 * toplamı yalan söyleyebiliyordu. 47 mağaza ve 54 araçta payların çoğu 1'in
 * altında kalıyor; tam sayılar 30 civarında toplanıyor, artan ~24 araç en
 * büyük kesirli 24 mağazaya gidiyor. Çok sayıda küçük dükkânı olan şirket
 * (her biri 0,6–0,9) hemen her kapısına bir araç alıyor. Az sayıda büyük
 * mağazası olan şirket (her biri 1,3) ise artandan pay alamıyor.
 *
 * Ölçüm (Tur 34 sonrası, 8 tohum × 210 gün, ortalama 47 mağaza): anların
 * %16,8'inde en çok satan şirket sokakta en kalabalık değildi. En kötü
 * farkta 14 araç geride kalıyordu. Mağaza tavanını 6'dan 10'a çıkarmak
 * bunu düzeltmedi (%16,4); sorun tavan değil, yuvarlamanın kapı düzeyinde
 * yapılmasıydı.
 *
 * Şimdiki sıra:
 * - Şirket payı en büyük kalanla bulunuyor. Şirket toplamı satışa ±1 araç
 *   sadık kalıyor; aynı ölçümde yalan oranı %0.
 * - Şirketin aracı kendi mağazalarına, mağaza tavanıyla su doldurur gibi
 *   paylaşılıyor. Tavana dayanan mağazanın fazlası aynı şirketin öbür
 *   kapılarına akıyor, rakibe değil.
 *
 * Bedeli: iki farklı şirketin mağazaları arasında kapı sırası en fazla
 * 1 araç ters dönebiliyor. Aynı ölçümde 1'i aşan ters sıra hiç görülmedi.
 */

export interface FlowShare {
  buildingId: string;
  companyId: string;
  units: number;
}

export interface ShopperQuota<T extends FlowShare> {
  flow: T;
  count: number;
}

/**
 * `flows` satış sırasında gelmeli (motorun `customerFlows` sırası): eşit
 * kesirlerde liste sırası karar veriyor. Sabit bir ölçüt olmasaydı filo her
 * senkronda başka bir mağazaya kayardı.
 *
 * Dönen dizi `flows` ile aynı sırada; sıfır araç alan mağaza da içinde.
 */
export function allocateShoppers<T extends FlowShare>(flows: T[], budget: number, perStore: number): ShopperQuota<T>[] {
  const counts = new Array<number>(flows.length).fill(0);
  let total = 0;
  for (const flow of flows) total += Math.max(0, flow.units);
  if (total <= 0 || budget <= 0 || perStore <= 0) return flows.map((flow) => ({ flow, count: 0 }));

  // Şirketler ilk göründükleri sırayla: en çok satan mağazası önde olan önde.
  const companies: Array<{ id: string; stores: number[]; units: number; room: number; count: number; remainder: number }> = [];
  const byId = new Map<string, (typeof companies)[number]>();
  flows.forEach((flow, index) => {
    let company = byId.get(flow.companyId);
    if (!company) {
      company = { id: flow.companyId, stores: [], units: 0, room: 0, count: 0, remainder: 0 };
      byId.set(flow.companyId, company);
      companies.push(company);
    }
    company.stores.push(index);
    company.units += Math.max(0, flow.units);
    company.room += perStore;
  });

  // 1. Şirket payı: en büyük kalan. Bütün mağazaları tavanda olan şirketin
  // fazlası dağıtılmıyor; yoksa o fazla rakibin kapısında görünürdü.
  let used = 0;
  for (const company of companies) {
    const exact = Math.min(company.room, (company.units / total) * budget);
    company.count = Math.floor(exact);
    company.remainder = exact - company.count;
    used += company.count;
  }
  const byRemainder = companies
    .map((company, order) => ({ company, order }))
    .sort((a, b) => b.company.remainder - a.company.remainder || a.order - b.order);
  for (const { company } of byRemainder) {
    if (used >= budget) break;
    if (company.count >= company.room || company.remainder <= 0) continue;
    company.count++;
    used++;
  }

  // 2. Şirket içi: tavanlı oransal paylaşım (su doldurma), sonra en büyük kalan.
  for (const company of companies) {
    const exact = new Map<number, number>();
    for (const index of company.stores) exact.set(index, 0);
    let open = company.stores.filter((index) => flows[index]!.units > 0);
    let left = company.count;
    while (open.length > 0 && left > 1e-9) {
      let units = 0;
      for (const index of open) units += flows[index]!.units;
      const full = open.filter((index) => exact.get(index)! + (left * flows[index]!.units) / units >= perStore);
      if (full.length === 0) {
        for (const index of open) exact.set(index, exact.get(index)! + (left * flows[index]!.units) / units);
        left = 0;
        break;
      }
      for (const index of full) {
        left -= perStore - exact.get(index)!;
        exact.set(index, perStore);
      }
      open = open.filter((index) => !full.includes(index));
    }

    let spare = company.count;
    for (const index of company.stores) {
      counts[index] = Math.floor(exact.get(index)! + 1e-9);
      spare -= counts[index]!;
    }
    const ranked = [...company.stores].sort(
      (a, b) => exact.get(b)! - counts[b]! - (exact.get(a)! - counts[a]!) || a - b,
    );
    for (const index of ranked) {
      if (spare <= 0) break;
      if (counts[index]! >= perStore) continue;
      counts[index]!++;
      spare--;
    }
  }

  return flows.map((flow, index) => ({ flow, count: counts[index]! }));
}
