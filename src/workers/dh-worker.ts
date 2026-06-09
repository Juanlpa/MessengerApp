/**
 * dh-worker.ts — Web Worker para cómputo DH fuera del main thread.
 *
 * Dos operaciones, ambas con modPow de BigInt de 2048 bits (~200-300ms,
 * bloqueante en el main thread):
 *   - 'generate'     → generar par de claves DH (registro / crear conversación)
 *   - 'deriveShared' → derivar la shared key E2E (crear conversación)
 */

import { generateDHKeyPair } from '@/lib/crypto/dh';
import { deriveSharedKey } from '@/lib/crypto/key-exchange';

self.addEventListener('message', (event: MessageEvent) => {
  const action = event.data?.action;

  try {
    if (action === 'generate') {
      const keyPair = generateDHKeyPair();
      self.postMessage(
        { success: true, privateKey: keyPair.privateKey, publicKey: keyPair.publicKey },
        // @ts-expect-error — transferable list para Uint8Array.buffer (zero-copy)
        [keyPair.privateKey.buffer, keyPair.publicKey.buffer]
      );
      return;
    }

    if (action === 'deriveShared') {
      const privateKey = new Uint8Array(event.data.privateKey as ArrayBuffer);
      const otherPublicKeyHex = event.data.otherPublicKeyHex as string;
      const shared = deriveSharedKey(privateKey, otherPublicKeyHex);
      self.postMessage(
        { success: true, sharedKey: shared },
        // @ts-expect-error — transferable list para Uint8Array.buffer (zero-copy)
        [shared.buffer]
      );
      return;
    }

    self.postMessage({ success: false, error: `Unknown action: ${action}` });
  } catch (err) {
    self.postMessage({
      success: false,
      error: err instanceof Error ? err.message : 'DH worker failed',
    });
  }
});
