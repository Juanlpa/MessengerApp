/**
 * Tests Diffie-Hellman — RFC 3526 Grupo 14
 */

import { generateDHKeyPair, computeSharedSecret, DH_PRIME } from '../dh';
import { toHex, bytesToBigInt } from '../utils';

describe('Diffie-Hellman (RFC 3526 Group 14)', () => {
  test('key pair generation produces valid keys', () => {
    const kp = generateDHKeyPair();
    expect(kp.privateKey.length).toBe(256); // 2048 bits
    expect(kp.publicKey.length).toBe(256);
    // Public key should be > 1 and < p-1
    const pub = bytesToBigInt(kp.publicKey);
    expect(pub > BigInt(1)).toBe(true);
    expect(pub < DH_PRIME - BigInt(1)).toBe(true);
  });

  test('two parties derive same shared secret', () => {
    const alice = generateDHKeyPair();
    const bob = generateDHKeyPair();

    const sharedAlice = computeSharedSecret(alice.privateKey, bob.publicKey);
    const sharedBob = computeSharedSecret(bob.privateKey, alice.publicKey);

    expect(toHex(sharedAlice)).toBe(toHex(sharedBob));
  });

  test('different key pairs produce different shared secrets', () => {
    const alice = generateDHKeyPair();
    const bob = generateDHKeyPair();
    const charlie = generateDHKeyPair();

    const sharedAB = toHex(computeSharedSecret(alice.privateKey, bob.publicKey));
    const sharedAC = toHex(computeSharedSecret(alice.privateKey, charlie.publicKey));

    expect(sharedAB).not.toBe(sharedAC);
  });

  test('rejects invalid public key (0)', () => {
    const alice = generateDHKeyPair();
    const invalidPub = new Uint8Array(256); // all zeros = 0
    expect(() => computeSharedSecret(alice.privateKey, invalidPub)).toThrow();
  });

  test('rejects invalid public key (1)', () => {
    const alice = generateDHKeyPair();
    const invalidPub = new Uint8Array(256);
    invalidPub[255] = 1; // = 1
    expect(() => computeSharedSecret(alice.privateKey, invalidPub)).toThrow();
  });
});
