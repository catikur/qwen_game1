import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { registerMessages, setLocale } from '@capital/content';
import { formatDate, monthName } from '../src/selectors';

/**
 * Takvimin yazısı (Tur 65): biçimleyici dil başına bir kez kuruluyor,
 * çıktı `toLocaleDateString` ile aynı.
 */
const EPOCH = Date.UTC(2026, 0, 1);
// İngilizce sözlük çekirdeğin testinde yüklü değil; sayı ve tarih dili için boş bir sözlük yetiyor.
registerMessages('en', {});
const reference = (day: number, locale: string, options: Intl.DateTimeFormatOptions) =>
  new Date(EPOCH + day * 86_400_000).toLocaleDateString(locale, options);

describe('takvimin yazısı', () => {
  test('tarih ve ay adı eskisiyle aynı, iki dilde, iki yıl boyunca', () => {
    for (const [locale, tag] of [['tr', 'tr-TR'], ['en', 'en-US']] as const) {
      setLocale(locale);
      for (let day = 0; day < 800; day += 7) {
        assert.equal(formatDate(day), reference(day, tag, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }), `${locale} ${day}`);
        assert.equal(monthName(day), reference(day, tag, { month: 'long', timeZone: 'UTC' }), `${locale} ${day}`);
      }
    }
    setLocale('tr');
  });

  test('biçimleyici her çağrıda yeniden kurulmuyor: eskisinden çok daha hızlı', () => {
    // Göreli ölçüm, geniş payla: her çağrıda biçimleyici kurmak V8'de onlarca kat yavaş.
    const options = { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' } as const;
    const batch = (fn: (day: number) => string) => {
      const start = performance.now();
      for (let day = 0; day < 400; day++) fn(day);
      return performance.now() - start;
    };
    const median = (fn: (day: number) => string) => {
      batch(fn);
      const runs = [batch(fn), batch(fn), batch(fn), batch(fn), batch(fn)].sort((a, b) => a - b);
      return runs[2]!;
    };
    const cached = median(formatDate);
    const fresh = median((day) => reference(day, 'tr-TR', options));
    assert.ok(cached * 3 < fresh, `önbellekli ${cached.toFixed(2)} ms, her seferinde ${fresh.toFixed(2)} ms`);
  });
});
