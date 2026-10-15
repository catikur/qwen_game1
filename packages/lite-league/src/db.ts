/**
 * Veritabanı arayüzü: Cloudflare D1'in kullandığımız kadarı. Testlerde aynı
 * arayüzü Node'un yerleşik SQLite'ı karşılıyor (`test/sqlite.ts`), böylece
 * sorgular gerçek SQLite'ta koşuyor.
 */
export type Value = string | number | null;
/** Toplu yazım için tek ifade: SQL ve bağlanan değerler. */
export type Statement = [sql: string, ...args: Value[]];

export interface Db {
  /** Değişen satır sayısı. */
  run(sql: string, ...args: Value[]): Promise<number>;
  first<T>(sql: string, ...args: Value[]): Promise<T | null>;
  all<T>(sql: string, ...args: Value[]): Promise<T[]>;
  /** Tek işlem (transaction): biri hata verirse hepsi geri alınıyor. */
  batch(statements: Statement[]): Promise<void>;
}

/** D1'in bize gereken yüzü (tip paketine bağımlı kalmamak için). */
export interface D1Like {
  prepare(sql: string): {
    bind(...args: Value[]): {
      run(): Promise<{ meta?: { changes?: number } }>;
      first<T>(): Promise<T | null>;
      all<T>(): Promise<{ results: T[] }>;
    };
  };
  batch(statements: unknown[]): Promise<unknown>;
}

export function d1(database: D1Like): Db {
  return {
    async run(sql, ...args) {
      const result = await database.prepare(sql).bind(...args).run();
      return result.meta?.changes ?? 0;
    },
    async first<T>(sql: string, ...args: Value[]) {
      return database.prepare(sql).bind(...args).first<T>();
    },
    async all<T>(sql: string, ...args: Value[]) {
      return (await database.prepare(sql).bind(...args).all<T>()).results;
    },
    // D1'de toplu ifadeler tek SQL işlemi: biri düşerse hepsi geri alınıyor.
    async batch(statements) {
      await database.batch(statements.map(([sql, ...args]) => database.prepare(sql).bind(...args)));
    },
  };
}
