/**
 * Tests HMAC-SHA256 — Vectores RFC 4231
 */

import { hmacSHA256 } from '../hmac';
import { toHex, fromHex } from '../utils';

describe('HMAC-SHA256 (RFC 2104 / RFC 4231)', () => {
  // RFC 4231 Test Case 1
  test('RFC 4231 Test Case 1', () => {
    const key = fromHex('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b');
    const data = new TextEncoder().encode('Hi There');
    const mac = hmacSHA256(key, data);
    expect(toHex(mac)).toBe(
      'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7'
    );
  });

  // RFC 4231 Test Case 2
  test('RFC 4231 Test Case 2 (key = "Jefe")', () => {
    const key = new TextEncoder().encode('Jefe');
    const data = new TextEncoder().encode('what do ya want for nothing?');
    const mac = hmacSHA256(key, data);
    expect(toHex(mac)).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843'
    );
  });

  // RFC 4231 Test Case 3
  test('RFC 4231 Test Case 3 (20-byte key, 50 bytes 0xdd)', () => {
    const key = fromHex('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    // 50 bytes of 0xdd = 100 hex chars
    const data = fromHex(
      'dddddddddddddddddddddddddddddddddddddddddddddddddd' +
      'dddddddddddddddddddddddddddddddddddddddddddddddddd'
    );
    const mac = hmacSHA256(key, data);
    expect(toHex(mac)).toBe(
      '773ea91e36800e46854db8ebd09181a72959098b3ef8c122d9635514ced565fe'
    );
  });

  test('string inputs work', () => {
    const mac = hmacSHA256('secret-key', 'hello world');
    expect(mac.length).toBe(32);
  });

  test('different keys produce different MACs', () => {
    const mac1 = toHex(hmacSHA256('key1', 'data'));
    const mac2 = toHex(hmacSHA256('key2', 'data'));
    expect(mac1).not.toBe(mac2);
  });
});
