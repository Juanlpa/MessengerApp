/**
 * Tests AES-256 Block Cipher — Vector NIST FIPS 197
 */

import { aesEncryptBlock, aesDecryptBlock } from '../aes';
import { fromHex, toHex } from '../utils';

describe('AES-256 Block Cipher (FIPS 197)', () => {
  // NIST FIPS 197 Appendix C.3 — AES-256
  const key = fromHex('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');
  const plaintext = fromHex('00112233445566778899aabbccddeeff');
  const expectedCiphertext = '8ea2b7ca516745bfeafc49904b496089';

  test('NIST FIPS 197 C.3: encrypt', () => {
    const ct = aesEncryptBlock(plaintext, key);
    expect(toHex(ct)).toBe(expectedCiphertext);
  });

  test('NIST FIPS 197 C.3: decrypt', () => {
    const ct = fromHex(expectedCiphertext);
    const pt = aesDecryptBlock(ct, key);
    expect(toHex(pt)).toBe('00112233445566778899aabbccddeeff');
  });

  test('encrypt then decrypt = original', () => {
    const original = fromHex('deadbeefcafebabe1234567890abcdef');
    const k = fromHex('603deb1015ca71be2b73aef0857d77811f352c073b6108d72d9810a30914dff4');
    const encrypted = aesEncryptBlock(original, k);
    const decrypted = aesDecryptBlock(encrypted, k);
    expect(toHex(decrypted)).toBe(toHex(original));
  });

  test('throws on wrong block size', () => {
    const k = fromHex('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');
    expect(() => aesEncryptBlock(new Uint8Array(15), k)).toThrow();
    expect(() => aesEncryptBlock(new Uint8Array(17), k)).toThrow();
  });

  test('throws on wrong key size', () => {
    expect(() => aesEncryptBlock(new Uint8Array(16), new Uint8Array(16))).toThrow();
  });
});
