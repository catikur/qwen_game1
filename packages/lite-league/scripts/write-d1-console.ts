/** `pnpm lite:d1-sql`: `schema.sql`'den D1 konsolunun dosyasını yazar (`consoleSql.ts`). */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { consoleSql } from './consoleSql';

const dir = join(process.cwd(), 'packages/lite-league');
const text = consoleSql(readFileSync(join(dir, 'schema.sql'), 'utf8'));
writeFileSync(join(dir, 'd1-console.sql'), text);
console.log(`d1-console.sql: ${text.trim().split('\n').length} ifade`);
