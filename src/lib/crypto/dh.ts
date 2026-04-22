/**
 * Diffie-Hellman Key Exchange — RFC 3526 Grupo 14 (2048-bit MODP)
 * 
 * Protocolo:
 * 1. Alice genera privKey_A (aleatorio), pubKey_A = g^privKey_A mod p
 * 2. Bob genera privKey_B (aleatorio), pubKey_B = g^privKey_B mod p
 * 3. Alice computa shared = pubKey_B^privKey_A mod p
 * 4. Bob computa shared = pubKey_A^privKey_B mod p
 * 5. Ambos obtienen el mismo shared secret
 * 
 * El shared secret se pasa por HKDF para derivar claves AES.
 */

import { modPow, bytesToBigInt, bigIntToBytes, randomBytes } from './utils';

// ─── RFC 3526 Grupo 14 (2048-bit MODP Group) ────────────────────────
// Primo p y generador g=2

const DH_PRIME_HEX =
  'FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD1' +
  '29024E088A67CC74020BBEA63B139B22514A08798E3404DD' +
  'EF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245' +
  'E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7ED' +
  'EE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3D' +
  'C2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F' +
  '83655D23DCA3AD961C62F356208552BB9ED529077096966D' +
  '670C354E4ABC9804F1746C08CA18217C32905E462E36CE3B' +
  'E39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9' +
  'DE2BCBF6955817183995497CEA956AE515D2261898FA0510' +
  '15728E5A8AACAA68FFFFFFFFFFFFFFFF';

export const DH_PRIME = BigInt('0x' + DH_PRIME_HEX);
export const DH_GENERATOR = BigInt(2);
const DH_KEY_SIZE = 256; // 2048 bits = 256 bytes

export interface DHKeyPair {
  privateKey: Uint8Array; // 256 bytes
  publicKey: Uint8Array;  // 256 bytes
}

/**
 * Genera un par de claves Diffie-Hellman.
 * @returns Par de claves { privateKey, publicKey }
 */
export function generateDHKeyPair(): DHKeyPair {
  // Generar clave privada aleatoria (256 bytes = 2048 bits)
  const privateKeyBytes = randomBytes(DH_KEY_SIZE);
  const privateKey = bytesToBigInt(privateKeyBytes);

  // Asegurar que la clave privada esté en rango válido (1 < privKey < p-1)
  const privKeyMod = (privateKey % (DH_PRIME - BigInt(2))) + BigInt(2);

  // Calcular clave pública: g^privKey mod p
  const publicKey = modPow(DH_GENERATOR, privKeyMod, DH_PRIME);

  return {
    privateKey: bigIntToBytes(privKeyMod, DH_KEY_SIZE),
    publicKey: bigIntToBytes(publicKey, DH_KEY_SIZE),
  };
}

/**
 * Calcula el shared secret dado una clave privada propia y la clave pública del otro.
 * shared = otherPublicKey^myPrivateKey mod p
 * @param myPrivateKey - Mi clave privada (256 bytes)
 * @param otherPublicKey - Clave pública del otro participante (256 bytes)
 * @returns Shared secret (256 bytes)
 */
export function computeSharedSecret(
  myPrivateKey: Uint8Array,
  otherPublicKey: Uint8Array
): Uint8Array {
  const privKey = bytesToBigInt(myPrivateKey);
  const pubKey = bytesToBigInt(otherPublicKey);

  // Validar que la clave pública está en rango válido
  if (pubKey <= BigInt(1) || pubKey >= DH_PRIME - BigInt(1)) {
    throw new Error('Invalid DH public key: out of range');
  }

  // Calcular shared secret
  const shared = modPow(pubKey, privKey, DH_PRIME);

  return bigIntToBytes(shared, DH_KEY_SIZE);
}
