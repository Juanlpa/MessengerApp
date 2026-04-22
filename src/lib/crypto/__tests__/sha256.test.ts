/**
 * Tests SHA-256 — Vectores oficiales NIST
 * Referencia: NIST FIPS 180-4 / NIST CSRC examples
 */

import { sha256 } from '../sha256';
import { toHex } from '../utils';

describe('SHA-256 (FIPS 180-4)', () => {
  test('vector: empty string', () => {
    const hash = sha256('');
    expect(toHex(hash)).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });

  test('vector: "abc"', () => {
    const hash = sha256('abc');
    expect(toHex(hash)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  test('vector: "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq" (multi-block)', () => {
    const hash = sha256('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq');
    expect(toHex(hash)).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'
    );
  });

  test('vector: Uint8Array input', () => {
    const input = new Uint8Array([0x61, 0x62, 0x63]); // "abc"
    const hash = sha256(input);
    expect(toHex(hash)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  test('produces 32-byte output', () => {
    const hash = sha256('test');
    expect(hash.length).toBe(32);
  });

  test('different inputs produce different hashes', () => {
    const h1 = toHex(sha256('hello'));
    const h2 = toHex(sha256('world'));
    expect(h1).not.toBe(h2);
  });
});
