/**
 * Cloudflare D1 konsolunun kabul ettiği şema (`d1-console.sql`).
 *
 * `schema.sql` Türkçe açıklamalarla dolu; açıklamalardaki `;` ve kesme
 * işareti ("Lite'ın") konsolun ifadeleri ayırmasını bozuyor ve şema
 * hata veriyordu. Konsol dosyası aynı ifadeler: açıklamasız, ASCII, her
 * ifade tek satırda. Bir satır hata verirse tek tek çalıştırılabiliyor;
 * hepsi `IF NOT EXISTS`, tekrar çalıştırmak zarar vermiyor.
 *
 * Elle yazılmıyor: `pnpm lite:d1-sql` üretiyor, test eşit olduğunu denetliyor.
 */
export function consoleSql(schema: string): string {
  const code = schema
    .split('\n')
    .map((line) => line.split('--')[0]!)
    .join('\n');
  // Şemada metin sabiti yok; olursa açıklama ayıklaması onu bölebilir, burada dur.
  if (/['"]/.test(code)) throw new Error('schema.sql açıklama dışında tırnak içeriyor: konsol dosyası elle denetlenmeli.');
  const statements = code
    .split(';')
    .map((part) => part.replace(/\s+/g, ' ').replace(/\( /g, '(').replace(/ \)/g, ')').trim())
    .filter((part) => part.length > 0);
  return statements.map((statement) => `${statement};`).join('\n') + '\n';
}
