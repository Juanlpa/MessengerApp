/**
 * Tests Encrypt-then-MAC (AES-256-CBC + HMAC-SHA256)
 */

import { encryptAesCbcHmac, decryptAesCbcHmac } from '../encrypt';
import { fromHex, bytesToString } from '../utils';

describe('Encrypt-then-MAC (AES-256-CBC + HMAC-SHA256)', () => {
  const key = fromHex('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');

  test('encrypt then decrypt = original (string)', () => {
    const plaintext = 'Hello, World! This is a secret message.';
    const encrypted = encryptAesCbcHmac(plaintext, key);
    const decrypted = decryptAesCbcHmac(encrypted, key);
    expect(bytesToString(decrypted)).toBe(plaintext);
  });

  test('encrypt then decrypt = original (Uint8Array)', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const encrypted = encryptAesCbcHmac(data, key);
    const decrypted = decryptAesCbcHmac(encrypted, key);
    expect(Array.from(decrypted)).toEqual(Array.from(data));
  });

  test('encrypt then decrypt = original (empty string)', () => {
    const encrypted = encryptAesCbcHmac('', key);
    const decrypted = decryptAesCbcHmac(encrypted, key);
    expect(bytesToString(decrypted)).toBe('');
  });

  test('encrypt then decrypt = original (exact block size)', () => {
    const plaintext = '1234567890123456'; // exactly 16 bytes
    const encrypted = encryptAesCbcHmac(plaintext, key);
    const decrypted = decryptAesCbcHmac(encrypted, key);
    expect(bytesToString(decrypted)).toBe(plaintext);
  });

  test('tampered ciphertext → MAC verification fails', () => {
    const encrypted = encryptAesCbcHmac('secret', key);
    // Tamper with ciphertext
    const tamperedCt = encrypted.ciphertext.slice(0, -2) + 'ff';
    expect(() => {
      decryptAesCbcHmac({ ...encrypted, ciphertext: tamperedCt }, key);
    }).toThrow('MAC verification failed');
  });

  test('tampered MAC → verification fails', () => {
    const encrypted = encryptAesCbcHmac('secret', key);
    const tamperedMac = encrypted.mac.slice(0, -2) + 'ff';
    expect(() => {
      decryptAesCbcHmac({ ...encrypted, mac: tamperedMac }, key);
    }).toThrow('MAC verification failed');
  });

  test('wrong key → MAC verification fails', () => {
    const encrypted = encryptAesCbcHmac('secret', key);
    const wrongKey = fromHex('ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
    expect(() => {
      decryptAesCbcHmac(encrypted, wrongKey);
    }).toThrow('MAC verification failed');
  });

  test('each encryption produces different ciphertext (random IV)', () => {
    const e1 = encryptAesCbcHmac('same message', key);
    const e2 = encryptAesCbcHmac('same message', key);
    expect(e1.iv).not.toBe(e2.iv);
    expect(e1.ciphertext).not.toBe(e2.ciphertext);
  });
});
