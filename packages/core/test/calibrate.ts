/**
 * Bina maliyetlerini hedef geri ödeme süresine göre türetir.
 * Amaç: her binanın "makul doluluk"ta benzer bir yatırım cazibesi taşıması.
 */
import { BUILDINGS, CATEGORIES } from '@capital/content';

const WAGE_PER_JOB = 42;
const AVG_INCOME = 0.62;
const UTILISATION = 0.75;
/** Kademe bazlı hedef geri ödeme (gün). Büyük yatırım daha yavaş döner. */
const TARGET_PAYBACK: Record<number, number> = { 1: 80, 2: 120 };

console.log('bina'.padEnd(22), 'net/gün'.padStart(10), 'mevcut'.padStart(11), 'önerilen'.padStart(11), 'geri öd.'.padStart(9));

for (const def of BUILDINGS) {
  const category = CATEGORIES[def.category];
  const wages = def.jobs * WAGE_PER_JOB * (0.6 + AVG_INCOME);
  const fixed = def.upkeepPerDay + wages;

  let gross: number;
  if (def.role === 'outlet') {
    gross = def.capacity * UTILISATION * category.basePrice * (1 - category.costRatio);
  } else if (def.role === 'rental') {
    // market.ts ile aynı formül: kapasite × doluluk × basePrice × 0.06
    const occupancy = 0.7;
    const revenue = def.capacity * occupancy * category.basePrice * 0.06;
    gross = revenue * (1 - category.costRatio);
  } else {
    // Depo/fabrika doğrudan gelir üretmez; değeri dolaylıdır.
    gross = fixed * 1.6;
  }

  const net = gross - fixed;
  const payback = TARGET_PAYBACK[def.tier] ?? 100;
  const suggested = Math.max(8_000, Math.round((net * payback) / 1_000) * 1_000);
  const currentPayback = net > 0 ? def.cost / net : Infinity;

  console.log(
    def.id.padEnd(22),
    net.toFixed(0).padStart(10),
    def.cost.toLocaleString('tr-TR').padStart(11),
    suggested.toLocaleString('tr-TR').padStart(11),
    (Number.isFinite(currentPayback) ? currentPayback.toFixed(0) + 'g' : '—').padStart(9),
  );
}

// Şehrin toplam talebi ne kadar outlet taşır?
console.log('\n--- Şehir kapasitesi ---');
const { DISTRICT_ARCHETYPES, DISTRICT_LAYOUT, CONSUMER_CATEGORIES } = await import('@capital/content');
for (const categoryId of CONSUMER_CATEGORIES) {
  const category = CATEGORIES[categoryId];
  let demand = 0;
  for (const row of DISTRICT_LAYOUT) {
    for (const id of row) {
      const arch = DISTRICT_ARCHETYPES[id];
      const weight = arch.demandWeights[categoryId] ?? 1;
      const incomeFactor = 1 + (arch.incomeLevel - 0.5) * 2 * category.incomeSensitivity * 0.5;
      demand += arch.population * category.demandPerCapita * weight * Math.max(0.2, incomeFactor);
    }
  }
  const smallest = BUILDINGS.filter((b) => b.role === 'outlet' && b.category === categoryId)
    .sort((a, b) => a.capacity - b.capacity)[0];
  console.log(
    `${category.name.padEnd(12)} talep ${demand.toFixed(0).padStart(7)} birim/gün` +
      (smallest ? ` → ${Math.round(demand / smallest.capacity)} adet ${smallest.name}` : ''),
  );
}
