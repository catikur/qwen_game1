/**
 * Testler için `Db`: Node'un yerleşik SQLite'ı (D1 de SQLite). Şema
 * `schema.sql`'den yükleniyor; sorgular üretimdekiyle aynı.
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Db, Statement, Value } from '../src/db';

/** Testler geçici dizine paketlenip koşuyor: şemayı depo kökünden bul. */
function schemaPath(): string {
  let dir = process.cwd();
  while (!existsSync(join(dir, 'pnpm-workspace.yaml'))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error('Depo kökü bulunamadı (pnpm-workspace.yaml).');
    dir = parent;
  }
  return join(dir, 'packages/lite-league/schema.sql');
}

export function memoryDb(): Db {
  const database = new DatabaseSync(':memory:');
  database.exec(readFileSync(schemaPath(), 'utf8'));
  return {
    async run(sql: string, ...args: Value[]) {
      return Number(database.prepare(sql).run(...args).changes);
    },
    // node:sqlite satırları prototipsiz nesne: D1 gibi düz nesneye çevir.
    async first<T>(sql: string, ...args: Value[]) {
      const row = database.prepare(sql).get(...args);
      return row ? ({ ...row } as T) : null;
    },
    async all<T>(sql: string, ...args: Value[]) {
      return database.prepare(sql).all(...args).map((row) => ({ ...row }) as T);
    },
    // D1'in toplu yazımı gibi: tek işlem, hata olursa geri al.
    async batch(statements: Statement[]) {
      database.exec('BEGIN');
      try {
        for (const [sql, ...args] of statements) database.prepare(sql).run(...args);
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
