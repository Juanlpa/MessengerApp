/**
 * frame-crypto.ts — Cifrado AES-GCM de frames WebRTC
 *
 * Cada frame se cifra con la shared key de la conversación.
 * Layout del buffer cifrado: [IV (12 bytes) | ciphertext]
 * En audio se preservan los primeros 1 byte sin cifrar (RTP header byte)
 * para que el decodificador pueda sincronizar sin romper el stream.
 */

const IV_LENGTH = 12;
const AUDIO_UNENCRYPTED_BYTES = 1;

/** Deriva una clave AES-GCM específica para la hora actual usando HKDF.
 *  Ambos lados calculan independientemente la misma clave porque usan
 *  el mismo índice de hora (floor(now / 3600000)). */
export async function deriveHourlyKey(rawKey: Uint8Array): Promise<CryptoKey> {
  const hourIndex = Math.floor(Date.now() / 3_600_000);
  const salt = new Uint8Array(4);
  new DataView(salt.buffer).setUint32(0, hourIndex, false);

  const baseKey = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(rawKey).buffer as ArrayBuffer,
    { name: 'HKDF' },
    false,
    ['deriveKey']
  );

  const info = new TextEncoder().encode('messenger-call-frame-v1');

  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function importSharedKey(rawKey: Uint8Array): Promise<CryptoKey> {
  // Copiar a ArrayBuffer limpio para evitar problema de tipo SharedArrayBuffer
  const keyBuffer = new Uint8Array(rawKey).buffer as ArrayBuffer;
  return crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptFrame(
  frame: RTCEncodedVideoFrame | RTCEncodedAudioFrame,
  key: CryptoKey
): Promise<void> {
  const data = new Uint8Array(frame.data);
  const isAudio = frame instanceof RTCEncodedAudioFrame;
  const unencryptedBytes = isAudio ? AUDIO_UNENCRYPTED_BYTES : 0;

  if (data.byteLength <= unencryptedBytes) return;

  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const plaintext = data.slice(unencryptedBytes);

  try {
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
    );

    const newData = new Uint8Array(unencryptedBytes + IV_LENGTH + ciphertext.byteLength);
    newData.set(data.slice(0, unencryptedBytes), 0);
    newData.set(iv, unencryptedBytes);
    newData.set(ciphertext, unencryptedBytes + IV_LENGTH);

    frame.data = newData.buffer;
  } catch {
    // Si falla el cifrado, el frame se pasa sin modificar
  }
}

export async function decryptFrame(
  frame: RTCEncodedVideoFrame | RTCEncodedAudioFrame,
  key: CryptoKey
): Promise<void> {
  const data = new Uint8Array(frame.data);
  const isAudio = frame instanceof RTCEncodedAudioFrame;
  const unencryptedBytes = isAudio ? AUDIO_UNENCRYPTED_BYTES : 0;

  if (data.byteLength <= unencryptedBytes + IV_LENGTH) return;

  const iv = data.slice(unencryptedBytes, unencryptedBytes + IV_LENGTH);
  const ciphertext = data.slice(unencryptedBytes + IV_LENGTH);

  try {
    const plaintext = new Uint8Array(
      await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
    );

    const newData = new Uint8Array(unencryptedBytes + plaintext.byteLength);
    newData.set(data.slice(0, unencryptedBytes), 0);
    newData.set(plaintext, unencryptedBytes);

    frame.data = newData.buffer;
  } catch {
    // Si falla el descifrado, pasar frame vacío para no romper el stream
    frame.data = new ArrayBuffer(0);
  }
}
