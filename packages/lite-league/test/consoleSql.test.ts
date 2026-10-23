/**
 * D1 konsolunun dosyası (`d1-console.sql`): `schema.sql` ile eşit, konsolun
 * bozulmadığı biçimde. `schema.sql`'in açıklamalarındaki `;` ve kesme işareti
 * konsolda hata veriyordu (canlıya geçiş, Tur 55).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { consoleSql } from '../scripts/consoleSql';

function repoRoot(): string {
  let dir = process.cwd();
  while (!existsSync(join(dir, 'pnpm-workspace.yaml'))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error('Depo kökü bulunamadı (pnpm-workspace.yaml).');
    dir = parent;
  }
  return dir;
}

const dir = join(repoRoot(), 'packages/lite-league');
const schema = readFileSync(join(dir, 'schema.sql'), 'utf8');
const consoleFile = readFileSync(join(dir, 'd1-console.sql'), 'utf8');

/** Veritabanının yapısı: tablolar, sütunlar (tür, boş olamaz, anahtar, varsayılan), dizinler ve sütunları. */
function structure(db: DatabaseSync): string {
  const rows = db.prepare("SELECT type, name, tbl_name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all() as Array<{
    type: string;
    name: string;
    tbl_name: string;
  }>;
  return rows
    .map((row) => {
      if (row.type === 'table') {
        const columns = db.prepare(`PRAGMA table_info(${row.name})`).all() as Array<Record<string, unknown>>;
        return `table ${row.name}: ${columns.map((c) => `${c.name} ${c.type} nn${c.notnull} pk${c.pk} d${c.dflt_value}`).join(', ')}`;
      }
      const columns = db.prepare(`PRAGMA index_xinfo(${row.name})`).all() as Array<Record<string, unknown>>;
      const unique = (db.prepare(`PRAGMA index_list(${row.tbl_name})`).all() as Array<Record<string, unknown>>).find((i) => i.name === row.name)?.unique;
      return `index ${row.name} on ${row.tbl_name} u${unique}: ${columns
        .filter((c) => c.key === 1)
        .map((c) => `${c.name}${c.desc ? ' desc' : ''}`)
        .join(', ')}`;
    })
    .join('\n');
}

test('D1 konsolu: dosya schema.sql ile eşit (şema değişince `pnpm lite:d1-sql`)', () => {
  assert.equal(consoleFile, consoleSql(schema));
});

test('D1 konsolu: açıklama yok, ASCII, her satır tek ifade', () => {
  const lines = consoleFile.trimEnd().split('\n');
  assert.ok(lines.length > 20, `${lines.length} ifade`);
  for (const line of lines) {
    assert.ok(!line.includes('--'), line);
    assert.match(line, /^[\x20-\x7e]+$/, `ASCII dışı: ${line}`);
    assert.ok(line.endsWith(';') && line.indexOf(';') === line.length - 1, `tek ifade değil: ${line}`);
    assert.match(line, /^CREATE (TABLE|INDEX) IF NOT EXISTS /, `tekrar çalıştırılamaz: ${line}`);
  }
});

test("D1 konsolu: satır satır (iki kez de) şemanın aynısını kuruyor; Lite'ın eski veritabanına da", () => {
  const full = new DatabaseSync(':memory:');
  full.exec(schema);

  const fresh = new DatabaseSync(':memory:');
  for (const round of [1, 2]) for (const line of consoleFile.trimEnd().split('\n')) fresh.exec(line);
  assert.equal(structure(fresh), structure(full), 'boş veritabanı');

  // Ana oyunun tabloları gelmeden önceki (Lite'ın) veritabanı: üstüne konsol dosyası.
  const lite = new DatabaseSync(':memory:');
  for (const line of consoleFile.trimEnd().split('\n')) if (!line.includes('seed_')) lite.exec(line);
  lite.exec("INSERT INTO players (id, name, token_hash, division, created_at) VALUES ('p1', 'Atilla', 'h', 0, 1)");
  for (const line of consoleFile.trimEnd().split('\n')) lite.exec(line);
  assert.equal(structure(lite), structure(full), 'Lite veritabanı');
  assert.deepEqual({ ...(lite.prepare('SELECT id, name FROM players').get() as object) }, { id: 'p1', name: 'Atilla' }, 'Lite verisi yerinde');
});
