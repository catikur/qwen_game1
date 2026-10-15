/**
 * Testler için sahte App Attest: kendi kökümüz ve ara sertifikamız, Apple'ın
 * biçiminde kanıt ve onay üreten "cihazlar". Sunucu bunları gerçek Apple
 * çıktılarıyla aynı yoldan doğruluyor (kök yapılandırmadan geliyor).
 */
import { createHash, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import type { AttestConfig, Bytes } from '../src/attest';

const NONCE_OID = '1.2.840.113635.100.8.2';

// ------------------------------------------------------------ DER

function length(n: number): Buffer {
  if (n < 128) return Buffer.from([n]);
  const bytes: number[] = [];
  for (let x = n; x > 0; x = Math.floor(x / 256)) bytes.unshift(x % 256);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function der(tag: number, ...parts: Uint8Array[]): Buffer {
  const body = Buffer.concat(parts);
  return Buffer.concat([Buffer.from([tag]), length(body.length), body]);
}

const seq = (...parts: Uint8Array[]) => der(0x30, ...parts);

function oid(text: string): Buffer {
  const [a, b, ...rest] = text.split('.').map(Number) as [number, number, ...number[]];
  const out = [40 * a + b];
  for (const value of rest) {
    const chunk = [value & 0x7f];
    for (let x = Math.floor(value / 128); x > 0; x = Math.floor(x / 128)) chunk.unshift((x & 0x7f) | 0x80);
    out.push(...chunk);
  }
  return der(0x06, Buffer.from(out));
}

const name = (cn: string) => seq(der(0x31, seq(oid('2.5.4.3'), der(0x0c, Buffer.from(cn)))));
const utcTime = (ms: number) => der(0x17, Buffer.from(`${new Date(ms).toISOString().replace(/[-:T]/g, '').slice(2, 14)}Z`));

let serial = 1;

function certificate(options: {
  subject: string;
  issuer: string;
  spki: Buffer;
  signer: KeyObject;
  hash: 'sha256' | 'sha384';
  notBefore: number;
  notAfter: number;
  extensions?: Buffer[];
}): Buffer {
  const algorithm = seq(oid(options.hash === 'sha384' ? '1.2.840.10045.4.3.3' : '1.2.840.10045.4.3.2'));
  const tbs = seq(
    der(0xa0, der(0x02, Buffer.from([2]))),
    der(0x02, Buffer.from([serial++ % 120])),
    algorithm,
    name(options.issuer),
    seq(utcTime(options.notBefore), utcTime(options.notAfter)),
    name(options.subject),
    options.spki,
    ...(options.extensions ? [der(0xa3, seq(...options.extensions))] : []),
  );
  return seq(tbs, algorithm, der(0x03, Buffer.from([0]), sign(options.hash, tbs, options.signer)));
}

// ------------------------------------------------------------ CBOR

type Value = number | string | Uint8Array | Value[] | Map<string | number, Value>;

function head(major: number, n: number): Buffer {
  if (n < 24) return Buffer.from([(major << 5) | n]);
  if (n < 256) return Buffer.from([(major << 5) | 24, n]);
  if (n < 65_536) return Buffer.from([(major << 5) | 25, n >> 8, n & 255]);
  const b = Buffer.alloc(5);
  b[0] = (major << 5) | 26;
  b.writeUInt32BE(n, 1);
  return b;
}

export function cbor(value: Value): Buffer {
  if (typeof value === 'number') return value >= 0 ? head(0, value) : head(1, -1 - value);
  if (typeof value === 'string') return Buffer.concat([head(3, Buffer.byteLength(value)), Buffer.from(value)]);
  if (value instanceof Uint8Array) return Buffer.concat([head(2, value.length), value]);
  if (Array.isArray(value)) return Buffer.concat([head(4, value.length), ...value.map(cbor)]);
  return Buffer.concat([head(5, value.size), ...[...value].flatMap(([k, v]) => [cbor(k), cbor(v)])]);
}

// ------------------------------------------------------------ cihaz

const sha256 = (...parts: Uint8Array[]) => createHash('sha256').update(Buffer.concat(parts)).digest();
const u32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};

export interface FakeDevice {
  keyId: string;
  /** Kanıt (base64): sunucunun verdiği base64 challenge'ın baytlarıyla. */
  attest(challenge: string): string;
  /** İsteğin tam gövdesi için onay (base64); her seferinde sayaç bir artıyor. */
  assert(body: string | Uint8Array): string;
}

export interface FakePki {
  config: AttestConfig;
  device(options?: { aaguid?: string; appId?: string; category?: number }): FakeDevice;
}

export function fakePki(appId: string, now: number): FakePki {
  const year = 365 * 86_400_000;
  const root = generateKeyPairSync('ec', { namedCurve: 'P-384' });
  const intermediate = generateKeyPairSync('ec', { namedCurve: 'P-384' });
  const rootSpki = root.publicKey.export({ type: 'spki', format: 'der' });
  const rootCert = certificate({
    subject: 'Test App Attestation Root CA',
    issuer: 'Test App Attestation Root CA',
    spki: rootSpki,
    signer: root.privateKey,
    hash: 'sha384',
    notBefore: now - year,
    notAfter: now + 20 * year,
  });
  const intermediateCert = certificate({
    subject: 'Test App Attestation CA 1',
    issuer: 'Test App Attestation Root CA',
    spki: intermediate.publicKey.export({ type: 'spki', format: 'der' }),
    signer: root.privateKey,
    hash: 'sha384',
    notBefore: now - year,
    notAfter: now + 5 * year,
  });

  return {
    config: { appId, root: new Uint8Array(rootCert) as Bytes },
    device(options = {}) {
      const leaf = generateKeyPairSync('ec', { namedCurve: 'P-256' });
      const spki = leaf.publicKey.export({ type: 'spki', format: 'der' });
      const point = spki.subarray(spki.length - 65);
      const keyId = sha256(point);
      const rpId = sha256(Buffer.from(options.appId ?? appId));
      const extensions = options.category === undefined ? null : cbor(new Map([['apple_validation_category_01', options.category]]));
      let counter = 0;
      return {
        keyId: keyId.toString('base64'),
        attest(challenge) {
          const cose = cbor(new Map<number, Value>([[1, 2], [3, -7], [-1, 1], [-2, point.subarray(1, 33)], [-3, point.subarray(33)]]));
          const aaguid = Buffer.alloc(16);
          aaguid.write(options.aaguid ?? 'appattest');
          const authData = Buffer.concat([
            rpId,
            Buffer.from([extensions ? 0xc0 : 0x40]),
            u32(0),
            aaguid,
            Buffer.from([0, 32]),
            keyId,
            cose,
            ...(extensions ? [extensions] : []),
          ]);
          const nonce = sha256(authData, sha256(Buffer.from(challenge, 'base64')));
          const leafCert = certificate({
            subject: keyId.toString('hex'),
            issuer: 'Test App Attestation CA 1',
            spki,
            signer: intermediate.privateKey,
            hash: 'sha256',
            notBefore: now - 86_400_000,
            notAfter: now + 300 * 86_400_000,
            extensions: [seq(oid(NONCE_OID), der(0x04, seq(der(0xa1, der(0x04, nonce)))))],
          });
          const statement = new Map<string, Value>([
            ['x5c', [leafCert, intermediateCert]],
            ['receipt', Buffer.from('receipt')],
          ]);
          return cbor(new Map<string, Value>([['fmt', 'apple-appattest'], ['attStmt', statement], ['authData', authData]])).toString('base64');
        },
        assert(body) {
          counter += 1;
          const authenticatorData = Buffer.concat([rpId, Buffer.from([extensions ? 0x80 : 0x00]), u32(counter), ...(extensions ? [extensions] : [])]);
          const nonce = sha256(authenticatorData, sha256(Buffer.from(body)));
          const signature = sign('sha256', nonce, leaf.privateKey);
          return cbor(new Map<string, Value>([['signature', signature], ['authenticatorData', authenticatorData]])).toString('base64');
        },
      };
    },
  };
}
