/**
 * Apple App Attest doğrulaması: lig gönderimleri gerçek uygulamadan, gerçek
 * bir Apple cihazından geliyor mu?
 *
 * Adımlar Apple'ın "Validating apps that connect to your server" belgesindeki
 * sırayla. Bağımlılık yok: CBOR ve DER'in gereken kadarı burada, imzalar
 * WebCrypto ile (Worker'da ve Node'da aynı API).
 *
 * - Kanıt (attestation, cihaz başına bir kez): sertifika zinciri Apple'ın
 *   App Attest köküne, nonce, anahtar kimliği, uygulama kimliği, ortam.
 * - Onay (assertion, her gönderimde): isteğin tam gövdesi üstüne imza ve
 *   artan sayaç (eski bir isteği yeniden göndermek işe yaramıyor).
 */

export type Bytes = Uint8Array<ArrayBuffer>;

export interface AttestConfig {
  /** App ID: takım kimliği + "." + paket kimliği. */
  appId: string;
  /** Güvenilen kök sertifika (DER). Testler kendi kökünü veriyor. */
  root: Bytes;
}

/**
 * Apple App Attestation Root CA (DER, base64). SHA-256 parmak izi
 * 1CB9823BA28BA6AD2D33A006941DE2AE4F513EF1D4E831B9F7E0FA7B6242C932;
 * gerçek Apple kanıtlarının zinciri bu köke doğrulanıyor (testler).
 */
const APPLE_ROOT = 'MIICITCCAaegAwIBAgIQC/O+DvHN0uD7jG5yH2IXmDAKBggqhkjOPQQDAzBSMSYwJAYDVQQDDB1BcHBsZSBBcHAgQXR0ZXN0YXRpb24gUm9vdCBDQTETMBEGA1UECgwKQXBwbGUgSW5jLjETMBEGA1UECAwKQ2FsaWZvcm5pYTAeFw0yMDAzMTgxODMyNTNaFw00NTAzMTUwMDAwMDBaMFIxJjAkBgNVBAMMHUFwcGxlIEFwcCBBdHRlc3RhdGlvbiBSb290IENBMRMwEQYDVQQKDApBcHBsZSBJbmMuMRMwEQYDVQQIDApDYWxpZm9ybmlhMHYwEAYHKoZIzj0CAQYFK4EEACIDYgAERTHhmLW07ATaFQIEVwTtT4dyctdhNbJhFs/Ii2FdCgAHGbpphY3+d8qjuDngIN3WVhQUBHAoMeQ/cLiP1sOUtgjqK9auYen1mMEvRq9Sk3Jm5X8U62H+xTD3FE9TgS41o0IwQDAPBgNVHRMBAf8EBTADAQH/MB0GA1UdDgQWBBSskRBTM72+aEH/pwyp5frq5eWKoTAOBgNVHQ8BAf8EBAMCAQYwCgYIKoZIzj0EAwMDaAAwZQIwQgFGnByvsiVbpTKwSga0kP0e8EeDS4+sQmTvb7vn53O5+FRXgeLhpJ06ysC5PrOyAjEAp5U4xDgEgllF7En3VcE3iexZZtKeYnpqtijVoyFraWVIyd/dganmrduC1bmTBGwD';

export const APPLE_ATTEST: AttestConfig = {
  appId: '77J92PA5Q9.com.catikur.capitalforgelite',
  root: fromBase64(APPLE_ROOT),
};

export type AttestReason =
  | 'cbor'
  | 'format'
  | 'chain'
  | 'expired'
  | 'nonce'
  | 'key'
  | 'app'
  | 'counter'
  | 'environment'
  | 'category'
  | 'signature';

export class AttestError extends Error {
  constructor(readonly reason: AttestReason) {
    super(reason);
  }
}

export interface Attested {
  /** Sertifikadaki genel anahtar (SPKI, base64): onaylar bununla doğrulanıyor. */
  publicKey: string;
  environment: 'production' | 'development';
}

const NONCE_OID = '1.2.840.113635.100.8.2';
const P256 = '1.2.840.10045.3.1.7';
const P384 = '1.3.132.0.34';
const ECDSA_SHA256 = '1.2.840.10045.4.3.2';
const ECDSA_SHA384 = '1.2.840.10045.4.3.3';
/** Uygulama kategorisi (authData uzantısı): 2 TestFlight, 3 geliştirme imzası, 4 App Store. */
const CATEGORIES = new Set([2, 3, 4]);

// ------------------------------------------------------------ kanıt

/**
 * Cihazın tek seferlik kanıtı. `challenge`: sunucunun verdiği tek seferlik
 * baytlar (uygulamaya base64 gidiyor; uygulama çözüp SHA-256'sını kanıta
 * gömüyor); `keyId`: base64.
 */
export async function verifyAttestation(input: {
  attestation: Bytes;
  keyId: string;
  challenge: Bytes;
  now: number;
  config: AttestConfig;
}): Promise<Attested> {
  const object = asMap(decodeCbor(input.attestation));
  const statement = asMap(object.get('attStmt'));
  const x5c = statement.get('x5c');
  const authData = object.get('authData');
  if (object.get('fmt') !== 'apple-appattest' || !Array.isArray(x5c) || x5c.length < 2 || !isBytes(authData)) {
    throw new AttestError('format');
  }
  if (!x5c.every(isBytes)) throw new AttestError('format');

  // 1. Zincir: kanıt sertifikası ← ara sertifika ← Apple kökü; hepsi şu an geçerli.
  const leaf = parseCertificate(x5c[0] as Bytes);
  const intermediate = parseCertificate(x5c[1] as Bytes);
  const root = parseCertificate(input.config.root);
  if (!equal(leaf.issuer, intermediate.subject) || !equal(intermediate.issuer, root.subject)) throw new AttestError('chain');
  if (!(await signedBy(intermediate, root)) || !(await signedBy(leaf, intermediate))) throw new AttestError('chain');
  for (const cert of [leaf, intermediate, root]) {
    if (input.now < cert.notBefore || input.now > cert.notAfter) throw new AttestError('expired');
  }
  if (leaf.curve !== P256) throw new AttestError('key');

  // 2–4. nonce = SHA256(authData ‖ SHA256(challenge)), sertifika uzantısındakiyle aynı.
  const nonce = await sha256(concat(authData, await sha256(input.challenge)));
  const extension = leaf.extensions.get(NONCE_OID);
  if (!extension || !equal(nonceFromExtension(extension), nonce)) throw new AttestError('nonce');

  // 5. Anahtar kimliği: genel anahtarın (sıkıştırılmamış nokta) SHA-256'sı.
  const keyId = fromBase64(input.keyId);
  if (!equal(await sha256(leaf.point), keyId)) throw new AttestError('key');

  // 6–9. authData: uygulama kimliği, sayaç 0, ortam, kimlik bilgisi.
  const auth = parseAuthData(authData, true);
  if (!equal(auth.rpIdHash, await sha256(utf8(input.config.appId)))) throw new AttestError('app');
  if (auth.counter !== 0) throw new AttestError('counter');
  const environment = environmentOf(auth.aaguid);
  if (!auth.credentialId || !equal(auth.credentialId, keyId)) throw new AttestError('key');
  checkCategory(auth.extensions);

  return { publicKey: toBase64(leaf.spki), environment };
}

// ------------------------------------------------------------ onay

/**
 * Bir isteğin onayı: `clientData` isteğin tam gövdesi. Dönen sayaç saklanıyor;
 * bir sonraki onay daha büyük olmak zorunda.
 */
export async function verifyAssertion(input: {
  assertion: Bytes;
  clientData: Bytes;
  publicKey: string;
  counter: number;
  config: AttestConfig;
}): Promise<{ counter: number }> {
  const object = asMap(decodeCbor(input.assertion));
  const signature = object.get('signature');
  const authenticatorData = object.get('authenticatorData');
  if (!isBytes(signature) || !isBytes(authenticatorData)) throw new AttestError('format');

  const nonce = await sha256(concat(authenticatorData, await sha256(input.clientData)));
  const key = await crypto.subtle.importKey('spki', fromBase64(input.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, rawSignature(signature, 32), nonce);
  if (!valid) throw new AttestError('signature');

  const auth = parseAuthData(authenticatorData, false);
  if (!equal(auth.rpIdHash, await sha256(utf8(input.config.appId)))) throw new AttestError('app');
  if (auth.counter <= input.counter) throw new AttestError('counter');
  checkCategory(auth.extensions);
  return { counter: auth.counter };
}

// ------------------------------------------------------------ authData

interface AuthData {
  rpIdHash: Bytes;
  counter: number;
  aaguid: Bytes | null;
  credentialId: Bytes | null;
  extensions: Map<CborKey, Cbor> | null;
}

/**
 * WebAuthn authenticator data: RP ID, bayraklar, sayaç, [kimlik bilgisi], [uzantılar].
 * Kimlik bilgisi yalnızca kanıtta var; onayda Apple bayrağı yine de açık bırakıyor.
 */
function parseAuthData(data: Bytes, attested: boolean): AuthData {
  if (data.length < 37) throw new AttestError('format');
  const flags = data[32]!;
  const counter = ((data[33]! << 24) >>> 0) + (data[34]! << 16) + (data[35]! << 8) + data[36]!;
  let offset = 37;
  let aaguid: Bytes | null = null;
  let credentialId: Bytes | null = null;
  if (attested) {
    if (!(flags & 0x40) || data.length < offset + 18) throw new AttestError('format');
    aaguid = data.subarray(offset, offset + 16);
    const length = (data[offset + 16]! << 8) + data[offset + 17]!;
    offset += 18;
    if (data.length < offset + length) throw new AttestError('format');
    credentialId = data.subarray(offset, offset + length);
    offset += length;
    // COSE anahtarı: sertifikadaki anahtar esas; yalnızca atlanıyor.
    offset = readCbor(data, offset, 0)[1];
  }
  let extensions: Map<CborKey, Cbor> | null = null;
  if (flags & 0x80) {
    const [value, end] = readCbor(data, offset, 0);
    extensions = asMap(value);
    offset = end;
  }
  if (offset !== data.length) throw new AttestError('format');
  return { rpIdHash: data.subarray(0, 32), counter, aaguid, credentialId, extensions };
}

function environmentOf(aaguid: Bytes | null): Attested['environment'] {
  if (!aaguid) throw new AttestError('environment');
  const text = String.fromCharCode(...aaguid);
  if (text === 'appattestdevelop' || text === 'appattestsandbox') return 'development';
  if (text === 'appattest\0\0\0\0\0\0\0') return 'production';
  throw new AttestError('environment');
}

/** Yeni iOS sürümleri uygulamanın nereden geldiğini yazıyor; yoksa (eski iOS) geçiyor. */
function checkCategory(extensions: Map<CborKey, Cbor> | null): void {
  const category = extensions?.get('apple_validation_category_01');
  if (category !== undefined && !(typeof category === 'number' && CATEGORIES.has(category))) {
    throw new AttestError('category');
  }
}

// ------------------------------------------------------------ X.509

interface Certificate {
  tbs: Bytes;
  signatureAlgorithm: string;
  signature: Bytes;
  issuer: Bytes;
  subject: Bytes;
  notBefore: number;
  notAfter: number;
  /** SubjectPublicKeyInfo (DER). */
  spki: Bytes;
  curve: string;
  /** Genel anahtar: sıkıştırılmamış EC noktası. */
  point: Bytes;
  extensions: Map<string, Bytes>;
}

export function parseCertificate(der: Bytes): Certificate {
  try {
    const top = derNode(der, 0);
    if (top.tag !== 0x30 || top.end !== der.length) throw new AttestError('chain');
    const [tbsNode, algorithmNode, signatureNode] = derChildren(der, top);
    if (!tbsNode || !algorithmNode || !signatureNode) throw new AttestError('chain');
    const fields = derChildren(der, tbsNode);
    let k = fields[0]?.tag === 0xa0 ? 1 : 0;
    const issuer = fields[k + 2]!;
    const validity = derChildren(der, fields[k + 3]!);
    const subject = fields[k + 4]!;
    const spkiNode = fields[k + 5]!;
    k += 6;

    const [spkiAlgorithm, spkiKey] = derChildren(der, spkiNode);
    const [, curveNode] = derChildren(der, spkiAlgorithm!);
    const point = bitString(der, spkiKey!);

    const extensions = new Map<string, Bytes>();
    for (const field of fields.slice(k)) {
      if (field.tag !== 0xa3) continue;
      for (const extension of derChildren(der, derChildren(der, field)[0]!)) {
        const parts = derChildren(der, extension);
        const value = parts[parts.length - 1]!;
        if (value.tag !== 0x04) throw new AttestError('chain');
        extensions.set(objectId(der, parts[0]!), der.subarray(value.body, value.end));
      }
    }
    return {
      tbs: der.subarray(tbsNode.start, tbsNode.end),
      signatureAlgorithm: objectId(der, derChildren(der, algorithmNode)[0]!),
      signature: bitString(der, signatureNode),
      issuer: der.subarray(issuer.start, issuer.end),
      subject: der.subarray(subject.start, subject.end),
      notBefore: derTime(der, validity[0]!),
      notAfter: derTime(der, validity[1]!),
      spki: der.subarray(spkiNode.start, spkiNode.end),
      curve: curveNode ? objectId(der, curveNode) : '',
      point,
      extensions,
    };
  } catch (error) {
    if (error instanceof AttestError) throw error;
    throw new AttestError('chain');
  }
}

/** `cert`, `issuer`ın anahtarıyla imzalı mı? */
async function signedBy(cert: Certificate, issuer: Certificate): Promise<boolean> {
  const hash = cert.signatureAlgorithm === ECDSA_SHA256 ? 'SHA-256' : cert.signatureAlgorithm === ECDSA_SHA384 ? 'SHA-384' : null;
  const curve = issuer.curve === P256 ? 'P-256' : issuer.curve === P384 ? 'P-384' : null;
  if (!hash || !curve) return false;
  const key = await crypto.subtle.importKey('spki', issuer.spki, { name: 'ECDSA', namedCurve: curve }, false, ['verify']);
  return crypto.subtle.verify({ name: 'ECDSA', hash }, key, rawSignature(cert.signature, curve === 'P-256' ? 32 : 48), cert.tbs);
}

/** Nonce uzantısı: SEQUENCE { [1] { OCTET STRING } }. */
function nonceFromExtension(value: Bytes): Bytes {
  try {
    const sequence = derNode(value, 0);
    const tagged = derChildren(value, sequence).find((node) => node.tag === 0xa1);
    const octets = tagged ? derChildren(value, tagged)[0] : undefined;
    if (!octets || octets.tag !== 0x04) return new Uint8Array(0);
    return value.subarray(octets.body, octets.end);
  } catch {
    return new Uint8Array(0);
  }
}

/** DER ECDSA imzası → WebCrypto'nun beklediği r ‖ s. */
function rawSignature(der: Bytes, size: number): Bytes {
  try {
    const sequence = derNode(der, 0);
    const [r, s] = derChildren(der, sequence);
    if (!r || !s || r.tag !== 0x02 || s.tag !== 0x02) throw new AttestError('signature');
    const out = new Uint8Array(size * 2);
    for (const [index, part] of [r, s].entries()) {
      let bytes = der.subarray(part.body, part.end);
      while (bytes.length > size && bytes[0] === 0) bytes = bytes.subarray(1);
      if (bytes.length > size) throw new AttestError('signature');
      out.set(bytes, index * size + size - bytes.length);
    }
    return out;
  } catch {
    throw new AttestError('signature');
  }
}

// ------------------------------------------------------------ DER

interface DerNode {
  tag: number;
  /** Başlığın başı. */
  start: number;
  /** İçeriğin başı. */
  body: number;
  end: number;
}

function derNode(bytes: Bytes, offset: number): DerNode {
  if (offset + 2 > bytes.length) throw new AttestError('chain');
  const tag = bytes[offset]!;
  let length = bytes[offset + 1]!;
  let body = offset + 2;
  if (length & 0x80) {
    const count = length & 0x7f;
    if (count === 0 || count > 3 || body + count > bytes.length) throw new AttestError('chain');
    length = 0;
    for (let i = 0; i < count; i++) length = length * 256 + bytes[body + i]!;
    body += count;
  }
  const end = body + length;
  if (end > bytes.length) throw new AttestError('chain');
  return { tag, start: offset, body, end };
}

function derChildren(bytes: Bytes, parent: DerNode): DerNode[] {
  const children: DerNode[] = [];
  let offset = parent.body;
  while (offset < parent.end) {
    const child = derNode(bytes, offset);
    if (child.end > parent.end) throw new AttestError('chain');
    children.push(child);
    offset = child.end;
  }
  return children;
}

function objectId(bytes: Bytes, node: DerNode): string {
  if (node.tag !== 0x06 || node.end === node.body) throw new AttestError('chain');
  const first = bytes[node.body]!;
  const parts = [Math.min(2, Math.floor(first / 40)), first - Math.min(2, Math.floor(first / 40)) * 40];
  let value = 0;
  for (let i = node.body + 1; i < node.end; i++) {
    value = value * 128 + (bytes[i]! & 0x7f);
    if (!(bytes[i]! & 0x80)) {
      parts.push(value);
      value = 0;
    }
  }
  return parts.join('.');
}

function bitString(bytes: Bytes, node: DerNode): Bytes {
  if (node.tag !== 0x03 || bytes[node.body] !== 0) throw new AttestError('chain');
  return bytes.subarray(node.body + 1, node.end);
}

/** UTCTime (YYMMDDHHMMSSZ) ya da GeneralizedTime (YYYYMMDDHHMMSSZ) → ms. */
function derTime(bytes: Bytes, node: DerNode): number {
  const text = String.fromCharCode(...bytes.subarray(node.body, node.end));
  const match = node.tag === 0x17 ? /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(text) : node.tag === 0x18 ? /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(text) : null;
  if (!match) throw new AttestError('chain');
  let year = Number(match[1]);
  if (node.tag === 0x17) year += year < 50 ? 2000 : 1900;
  return Date.UTC(year, Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6]));
}

// ------------------------------------------------------------ CBOR

export type CborKey = string | number;
export type Cbor = number | string | boolean | null | Bytes | Cbor[] | Map<CborKey, Cbor>;

export function decodeCbor(bytes: Bytes): Cbor {
  const [value, end] = readCbor(bytes, 0, 0);
  if (end !== bytes.length) throw new AttestError('cbor');
  return value;
}

function readCbor(bytes: Bytes, offset: number, depth: number): [Cbor, number] {
  if (depth > 16 || offset >= bytes.length) throw new AttestError('cbor');
  const head = bytes[offset]!;
  const major = head >> 5;
  const info = head & 31;
  let i = offset + 1;
  let n: number;
  if (info < 24) n = info;
  else if (info <= 27) {
    const size = 2 ** (info - 24);
    if (i + size > bytes.length) throw new AttestError('cbor');
    n = 0;
    for (let k = 0; k < size; k++) n = n * 256 + bytes[i + k]!;
    if (!Number.isSafeInteger(n)) throw new AttestError('cbor');
    i += size;
  } else throw new AttestError('cbor');

  switch (major) {
    case 0:
      return [n, i];
    case 1:
      return [-1 - n, i];
    case 2:
    case 3: {
      if (i + n > bytes.length) throw new AttestError('cbor');
      const slice = bytes.subarray(i, i + n);
      return [major === 2 ? slice : new TextDecoder('utf-8', { fatal: true }).decode(slice), i + n];
    }
    case 4: {
      const items: Cbor[] = [];
      for (let k = 0; k < n; k++) {
        const [value, next] = readCbor(bytes, i, depth + 1);
        items.push(value);
        i = next;
      }
      return [items, i];
    }
    case 5: {
      const map = new Map<CborKey, Cbor>();
      for (let k = 0; k < n; k++) {
        const [key, afterKey] = readCbor(bytes, i, depth + 1);
        if (typeof key !== 'string' && typeof key !== 'number') throw new AttestError('cbor');
        const [value, afterValue] = readCbor(bytes, afterKey, depth + 1);
        map.set(key, value);
        i = afterValue;
      }
      return [map, i];
    }
    case 7:
      if (info === 20) return [false, i];
      if (info === 21) return [true, i];
      if (info === 22) return [null, i];
      throw new AttestError('cbor');
    default:
      throw new AttestError('cbor');
  }
}

function asMap(value: Cbor | undefined): Map<CborKey, Cbor> {
  if (!(value instanceof Map)) throw new AttestError('format');
  return value;
}

function isBytes(value: unknown): value is Bytes {
  return value instanceof Uint8Array;
}

// ------------------------------------------------------------ baytlar

export async function sha256(data: Bytes): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data));
}

function utf8(text: string): Bytes {
  return new TextEncoder().encode(text);
}

function concat(a: Bytes, b: Bytes): Bytes {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

function equal(a: Bytes, b: Bytes): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export function fromBase64(text: string): Bytes {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function toBase64(bytes: Bytes): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
