/**
 * Yerel lig sunucusu: Worker'ın `handle`'ı Node'un SQLite'ı üstünde (bellekte).
 * Web sürümünü geliştirirken ve uçtan uca testte (`tools/lite-web-e2e.mjs`).
 * Çalıştırma: node tools/run-node-script.mjs packages/lite-league/test/local-server.ts [port]
 */
import http from 'node:http';
import { handle } from '../src/app';
import { APPLE_ATTEST } from '../src/attest';
import { memoryDb } from './sqlite';

const port = Number(process.argv[2] ?? process.env.PORT ?? 8788);
const db = memoryDb();

const server = http.createServer(async (incoming, outgoing) => {
  const chunks: Buffer[] = [];
  for await (const chunk of incoming) chunks.push(chunk as Buffer);
  const body = chunks.length > 0 && incoming.method !== 'GET' && incoming.method !== 'HEAD' ? Buffer.concat(chunks) : undefined;
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) if (typeof value === 'string') headers.set(name, value);
  const response = await handle(new Request(`http://127.0.0.1:${port}${incoming.url}`, { method: incoming.method, headers, body }), db, Date.now(), { attest: APPLE_ATTEST });
  outgoing.writeHead(response.status, Object.fromEntries(response.headers));
  outgoing.end(Buffer.from(await response.arrayBuffer()));
});

server.listen(port, '127.0.0.1', () => console.log(`lig sunucusu: http://127.0.0.1:${port}`));
