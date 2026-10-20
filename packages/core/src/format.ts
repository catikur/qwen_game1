import { formatDecimal, formatNumber, moneyUnits, withCurrency } from '@capital/content';

/*
 * Para biçimi ayrı modülde (Tur 46): kurulum ekranı da kullanıyor, seçiciler
 * (`selectors.ts`) ise yatırım tahmini üzerinden simülasyonun çoğunu içe
 * aktarıyor. Burada olunca kurulumun parçası simülasyonu taşımıyor.
 */

/** Para: Türkçede "1.20 M ₺", "45 B ₺", "1.234 ₺"; İngilizcede "₺1.20M", "₺45K", "₺1,234". */
export function formatMoney(value: number): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const units = moneyUnits();
  let amount: string;
  // Türkçede ondalık virgül: "1,23 M ₺"; yanındaki "1.234 ₺" bin (Tur 44).
  if (abs >= 1_000_000_000) amount = `${formatDecimal(abs / 1_000_000_000, 2)}${units.billion}`;
  else if (abs >= 1_000_000) amount = `${formatDecimal(abs / 1_000_000, 2)}${units.million}`;
  else if (abs >= 10_000) amount = `${Math.round(abs / 1_000)}${units.thousand}`;
  else amount = formatNumber(Math.round(abs));
  return `${sign}${withCurrency(amount)}`;
}
