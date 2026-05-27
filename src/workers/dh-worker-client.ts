/**
 * dh-worker-client.ts — Cliente para el DH Web Worker
 *
 * Expone generateDHKeyPairAsync() que ejecuta la generación de claves
 * en un Web Worker separado. Incluye fallback síncrono si Worker
 * no está disponible (SSR, entornos limitados).
 */

import type { DHKeyPair } from '@/lib/crypto/dh';

/**
 * Genera un par de claves DH de forma asíncrona usando un Web Worker.
 * El worker se crea y destruye por cada invocación para no mantener
 * un hilo ocioso entre usos.
 *
 * Fallback: si Web Workers no están disponibles, ejecuta síncrono.
 */
export function generateDHKeyPairAsync(): Promise<DHKeyPair> {
  // Fallback para SSR o entornos sin Worker
  if (typeof Worker === 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { generateDHKeyPair } = require('@/lib/crypto/dh');
    return Promise.resolve(generateDHKeyPair());
  }

  return new Promise<DHKeyPair>((resolve, reject) => {
    const worker = new Worker(
      new URL('./dh-worker.ts', import.meta.url)
    );

    const timeout = setTimeout(() => {
      worker.terminate();
      // Fallback: ejecutar síncrono si el worker tarda demasiado (5s)
      import('@/lib/crypto/dh').then(({ generateDHKeyPair }) => {
        resolve(generateDHKeyPair());
      }).catch(reject);
    }, 5000);

    worker.onmessage = (event: MessageEvent) => {
      clearTimeout(timeout);
      worker.terminate();

      if (event.data.success) {
        resolve({
          privateKey: new Uint8Array(event.data.privateKey),
          publicKey: new Uint8Array(event.data.publicKey),
        });
      } else {
        reject(new Error(event.data.error || 'DH worker failed'));
      }
    };

    worker.onerror = () => {
      clearTimeout(timeout);
      worker.terminate();
      // Fallback síncrono
      import('@/lib/crypto/dh').then(({ generateDHKeyPair }) => {
        resolve(generateDHKeyPair());
      }).catch(reject);
    };

    worker.postMessage({ action: 'generate' });
  });
}
