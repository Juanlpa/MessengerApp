/**
 * Tests HKDF-SHA256 — Vectores RFC 5869
 */

import { hkdf, hkdfExtract, hkdfExpand } from '../hkdf';
import { fromHex, toHex } from '../utils';

describe('HKDF-SHA256 (RFC 5869)', () => {
  // RFC 5869 Test Case 1
  test('RFC 5869 Test Case 1', () => {
    const ikm = fromHex('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b');
    const salt = fromHex('000102030405060708090a0b0c');
    const info = fromHex('f0f1f2f3f4f5f6f7f8f9');
    const expectedPRK = '077709362c2e32df0ddc3f0dc47bba6390b6c73bb50f9c3122ec844ad7c2b3e5';
    const expectedOKM = '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865';

    const prk = hkdfExtract(salt, ikm);
    expect(toHex(prk)).toBe(expectedPRK);

    const okm = hkdfExpand(prk, info, 42);
    expect(toHex(okm)).toBe(expectedOKM);

    // Full HKDF
    const result = hkdf(ikm, salt, info, 42);
    expect(toHex(result)).toBe(expectedOKM);
  });

  // RFC 5869 Test Case 2
  test('RFC 5869 Test Case 2 (longer inputs)', () => {
    const ikm = fromHex('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f404142434445464748494a4b4c4d4e4f');
    const salt = fromHex('606162636465666768696a6b6c6d6e6f707172737475767778797a7b7c7d7e7f808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9fa0a1a2a3a4a5a6a7a8a9aaabacadaeaf');
    const info = fromHex('b0b1b2b3b4b5b6b7b8b9babbbcbdbebfc0c1c2c3c4c5c6c7c8c9cacbcccdcecfd0d1d2d3d4d5d6d7d8d9dadbdcdddedfe0e1e2e3e4e5e6e7e8e9eaebecedeeeff0f1f2f3f4f5f6f7f8f9fafbfcfdfeff');

    const result = hkdf(ikm, salt, info, 82);
    expect(toHex(result)).toBe(
      'b11e398dc80327a1c8e7f78c596a49344f012eda2d4efad8a050cc4c19afa97c' +
      '59045a99cac7827271cb41c65e590e09da3275600c2f09b8367793a9aca3db71' +
      'cc30c58179ec3e87c14c01d5c1f3434f1d87'
    );
  });

  // RFC 5869 Test Case 3 (empty salt and info)
  test('RFC 5869 Test Case 3 (zero-length salt/info)', () => {
    const ikm = fromHex('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b');
    const salt = new Uint8Array(0);
    const info = new Uint8Array(0);

    const result = hkdf(ikm, salt, info, 42);
    expect(toHex(result)).toBe(
      '8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d' +
      '9d201395faa4b61a96c8'
    );
  });

  test('output length matches requested', () => {
    const ikm = fromHex('0b0b0b0b0b0b0b0b0b0b0b0b');
    const result = hkdf(ikm, new Uint8Array(0), 'test', 64);
    expect(result.length).toBe(64);
  });
});
