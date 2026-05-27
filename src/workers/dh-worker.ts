/**
 * dh-worker.ts — Web Worker para generar par de claves DH fuera del main thread.
 *
 * generateDHKeyPair() ejecuta modPow con BigInt de 2048 bits, lo cual
 * puede bloquear el main thread ~200ms en desktop. Este worker mueve
 * ese cómputo a un hilo separado.
 */

import { generateDHKeyPair } from '@/lib/crypto/dh';

self.addEventListener('message', (event: MessageEvent) => {
  if (event.data?.action === 'generate') {
    try {
      const keyPair = generateDHKeyPair();
      // Transferir los ArrayBuffers para evitar copia (zero-copy)
      self.postMessage(
        {
          success: true,
          privateKey: keyPair.privateKey,
          publicKey: keyPair.publicKey,
        },
        // @ts-expect-error — transferable list para Uint8Array.buffer
        [keyPair.privateKey.buffer, keyPair.publicKey.buffer]
      );
    } catch (err) {
      self.postMessage({
        success: false,
        error: err instanceof Error ? err.message : 'DH key generation failed',
      });
    }
  }
});
