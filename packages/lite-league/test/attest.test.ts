import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APPLE_ATTEST, AttestError, fromBase64, toBase64, verifyAssertion, verifyAttestation, type AttestConfig } from '../src/attest';
import { fakePki } from './fake-attest';
import apple from './fixtures/appattest.json';

/** Gerçek kanıtların sertifikaları 2024'te geçerli. */
const IN_2024 = Date.UTC(2024, 5, 1);
const APPLE_SAMPLE: AttestConfig = { ...APPLE_ATTEST, appId: apple.appId };
const CHALLENGE = toBase64(new TextEncoder().encode('tek-seferlik-meydan-okuma-32bayt'));

async function reason(work: Promise<unknown>): Promise<string> {
  try {
    await work;
    return 'ok';
  } catch (error) {
    if (error instanceof AttestError) return error.reason;
    throw error;
  }
}

test('gerçek Apple kanıtları Apple köküne doğrulanıyor (üretim ve geliştirme)', async () => {
  for (const [kind, environment] of [
    ['production', 'production'],
    ['development', 'development'],
  ] as const) {
    const sample = apple[kind];
    const result = await verifyAttestation({
      attestation: fromBase64(sample.attestation),
      keyId: sample.keyId,
      challenge: fromBase64(sample.challenge),
      now: IN_2024,
      config: APPLE_SAMPLE,
    });
    assert.equal(result.environment, environment, kind);
    assert.ok(result.publicKey.length > 80);
  }
});

test('gerçek kanıt: başka challenge, başka uygulama, başka anahtar, süresi geçmiş, başka kök reddediliyor', async () => {
  const sample = apple.production;
  const base = { attestation: fromBase64(sample.attestation), keyId: sample.keyId, challenge: fromBase64(sample.challenge), now: IN_2024, config: APPLE_SAMPLE };
  assert.equal(await reason(verifyAttestation({ ...base, challenge: new Uint8Array(32) })), 'nonce');
  assert.equal(await reason(verifyAttestation({ ...base, config: APPLE_ATTEST })), 'app');
  assert.equal(await reason(verifyAttestation({ ...base, keyId: toBase64(new Uint8Array(32)) })), 'key');
  assert.equal(await reason(verifyAttestation({ ...base, now: Date.UTC(2026, 0, 1) })), 'expired');
  const otherRoot = fakePki('X', IN_2024).config.root;
  assert.equal(await reason(verifyAttestation({ ...base, config: { ...APPLE_SAMPLE, root: otherRoot } })), 'chain');
  // Bozuk bayt: CBOR ya da biçim.
  const broken = fromBase64(sample.attestation).slice(0, 200);
  assert.notEqual(await reason(verifyAttestation({ ...base, attestation: broken })), 'ok');
});

test('gerçek Apple onayı: imza, sayaç, gövde', async () => {
  const sample = apple.assertion;
  const base = {
    assertion: fromBase64(sample.assertion),
    clientData: new TextEncoder().encode(sample.payload),
    publicKey: sample.publicKey,
    counter: 0,
    config: APPLE_SAMPLE,
  };
  const ok = await verifyAssertion(base);
  assert.ok(ok.counter > 0);
  // Yeniden oynatma: aynı sayaç geçmiyor.
  assert.equal(await reason(verifyAssertion({ ...base, counter: ok.counter })), 'counter');
  // Gövde değişti: imza tutmuyor.
  assert.equal(await reason(verifyAssertion({ ...base, clientData: new TextEncoder().encode('{}') })), 'signature');
  assert.equal(await reason(verifyAssertion({ ...base, config: APPLE_ATTEST })), 'app');
});

test('sahte PKI: kanıt + onay akışı, ortam ve uygulama kategorisi', async () => {
  const now = Date.UTC(2026, 9, 15, 12);
  const pki = fakePki('TEAM123456.com.test.lite', now);
  const device = pki.device({ category: 4 });
  const attested = await verifyAttestation({
    attestation: fromBase64(device.attest(CHALLENGE)),
    keyId: device.keyId,
    challenge: fromBase64(CHALLENGE),
    now,
    config: pki.config,
  });
  assert.equal(attested.environment, 'production');
  const body = '{"week":"2026-W42"}';
  const first = await verifyAssertion({
    assertion: fromBase64(device.assert(body)),
    clientData: new TextEncoder().encode(body),
    publicKey: attested.publicKey,
    counter: 0,
    config: pki.config,
  });
  assert.equal(first.counter, 1);

  const develop = pki.device({ aaguid: 'appattestdevelop' });
  const dev = await verifyAttestation({ attestation: fromBase64(develop.attest(CHALLENGE)), keyId: develop.keyId, challenge: fromBase64(CHALLENGE), now, config: pki.config });
  assert.equal(dev.environment, 'development');

  const odd = pki.device({ aaguid: 'baskabirsey' });
  assert.equal(await reason(verifyAttestation({ attestation: fromBase64(odd.attest(CHALLENGE)), keyId: odd.keyId, challenge: fromBase64(CHALLENGE), now, config: pki.config })), 'environment');
  // Kategori 5 (ad hoc / kurumsal) kabul değil.
  const adHoc = pki.device({ category: 5 });
  assert.equal(await reason(verifyAttestation({ attestation: fromBase64(adHoc.attest(CHALLENGE)), keyId: adHoc.keyId, challenge: fromBase64(CHALLENGE), now, config: pki.config })), 'category');
  // Başka uygulamanın kanıtı.
  const stranger = pki.device({ appId: 'OTHERTEAM1.com.other.app' });
  assert.equal(await reason(verifyAttestation({ attestation: fromBase64(stranger.attest(CHALLENGE)), keyId: stranger.keyId, challenge: fromBase64(CHALLENGE), now, config: pki.config })), 'app');
});
