/**
 * Test de integración E2E del módulo criptográfico
 * Simula el flujo completo: DH → HKDF → Encrypt → Decrypt
 */

import { generateDHKeyPair, computeSharedSecret } from '../dh';
import { hkdf } from '../hkdf';
import { encryptAesCbcHmac, decryptAesCbcHmac } from '../encrypt';
import { pbkdf2 } from '../pbkdf2';
import { sha256 } from '../sha256';
import { hmacSHA256 } from '../hmac';
import { toHex, bytesToString } from '../utils';

describe('Integration: Full E2E Crypto Flow', () => {
  test('DH → HKDF → AES-CBC-HMAC → decrypt successfully', () => {
    // 1. Alice y Bob generan sus pares DH
    const alice = generateDHKeyPair();
    const bob = generateDHKeyPair();

    // 2. Ambos calculan el shared secret
    const sharedAlice = computeSharedSecret(alice.privateKey, bob.publicKey);
    const sharedBob = computeSharedSecret(bob.privateKey, alice.publicKey);
    expect(toHex(sharedAlice)).toBe(toHex(sharedBob));

    // 3. Derivar clave AES con HKDF
    const aesKeyAlice = hkdf(sharedAlice, new Uint8Array(0), 'messenger-e2e-key', 32);
    const aesKeyBob = hkdf(sharedBob, new Uint8Array(0), 'messenger-e2e-key', 32);
    expect(toHex(aesKeyAlice)).toBe(toHex(aesKeyBob));

    // 4. Alice cifra un mensaje
    const message = 'Hola Bob! Este mensaje está cifrado E2E 🔐';
    const encrypted = encryptAesCbcHmac(message, aesKeyAlice);

    // Verificar que el ciphertext no contiene el plaintext
    expect(encrypted.ciphertext).not.toContain('Hola');

    // 5. Bob descifra el mensaje
    const decrypted = decryptAesCbcHmac(encrypted, aesKeyBob);
    expect(bytesToString(decrypted)).toBe(message);
  });

  test('Full auth flow: password → PBKDF2 → hash comparison', () => {
    const password = 'MySecurePassword123!';
    
    // Simular registro
    const salt = toHex(new Uint8Array(16).fill(42)); // salt fijo para test
    const registrationHash = pbkdf2(password, salt, 1000, 32);
    
    // Simular login (mismo proceso en cliente)
    const loginHash = pbkdf2(password, salt, 1000, 32);
    
    // Los hashes deben coincidir
    expect(toHex(registrationHash)).toBe(toHex(loginHash));
    
    // Password diferente → hash diferente
    const wrongHash = pbkdf2('WrongPassword', salt, 1000, 32);
    expect(toHex(wrongHash)).not.toBe(toHex(registrationHash));
  });

  test('JWT-like signing with HMAC-SHA256', () => {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = btoa(JSON.stringify({ sub: 'user123', exp: 9999999999 }));
    const signingInput = `${header}.${payload}`;
    
    const secret = sha256('jwt-secret-key');
    const signature = hmacSHA256(secret, signingInput);
    
    // Verificar (mismo proceso)
    const verifySignature = hmacSHA256(secret, signingInput);
    expect(toHex(signature)).toBe(toHex(verifySignature));
    
    // Tampered payload → different signature
    const tamperedInput = `${header}.${btoa(JSON.stringify({ sub: 'admin', exp: 9999999999 }))}`;
    const tamperedSig = hmacSHA256(secret, tamperedInput);
    expect(toHex(tamperedSig)).not.toBe(toHex(signature));
  });
});
