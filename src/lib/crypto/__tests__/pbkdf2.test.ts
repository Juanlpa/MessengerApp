/**
 * Tests PBKDF2 — Vectores RFC 7914 Sec. 11 / RFC 6070
 */

import { pbkdf2 } from '../pbkdf2';
import { toHex } from '../utils';

describe('PBKDF2-HMAC-SHA256 (RFC 8018)', () => {
  // RFC 6070 vector: "password" / "salt" / c=1 / dkLen=32
  test('RFC 6070 vector: "password" / "salt" / c=1 / dkLen=32', () => {
    const dk = pbkdf2('password', 'salt', 1, 32);
    expect(toHex(dk)).toBe(
      '120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b'
    );
  });

  // RFC 6070 vector: "password" / "salt" / c=2 / dkLen=32
  test('RFC 6070 vector: c=2', () => {
    const dk = pbkdf2('password', 'salt', 2, 32);
    expect(toHex(dk)).toBe(
      'ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43'
    );
  });

  // c=4096 (más lento, pero importante)
  test('RFC 6070 vector: c=4096', () => {
    const dk = pbkdf2('password', 'salt', 4096, 32);
    expect(toHex(dk)).toBe(
      'c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a'
    );
  }, 30000); // timeout 30s

  test('throws on invalid iterations', () => {
    expect(() => pbkdf2('p', 's', 0, 32)).toThrow();
  });

  test('output length matches dkLen', () => {
    const dk = pbkdf2('pass', 'salt', 1, 16);
    expect(dk.length).toBe(16);
  });
});
