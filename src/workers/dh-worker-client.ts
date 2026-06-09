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

/**
 * Deriva la shared key E2E de forma asíncrona usando un Web Worker.
 * Ejecuta computeSharedSecret (modPow 2048-bit) + HKDF fuera del main thread.
 *
 * Fallback: si Web Workers no están disponibles o fallan, ejecuta síncrono.
 */
export function deriveSharedKeyAsync(
  myPrivateKey: Uint8Array,
  otherPublicKeyHex: string
): Promise<Uint8Array> {
  const fallback = (): Promise<Uint8Array> =>
    import('@/lib/crypto/key-exchange').then(({ deriveSharedKey }) =>
      deriveSharedKey(myPrivateKey, otherPublicKeyHex)
    );

  if (typeof Worker === 'undefined') return fallback();

  return new Promise<Uint8Array>((resolve, reject) => {
    const worker = new Worker(new URL('./dh-worker.ts', import.meta.url));

    const timeout = setTimeout(() => {
      worker.terminate();
      fallback().then(resolve, reject);
    }, 5000);

    worker.onmessage = (event: MessageEvent) => {
      clearTimeout(timeout);
      worker.terminate();
      if (event.data.success && event.data.sharedKey) {
        resolve(new Uint8Array(event.data.sharedKey));
      } else {
        // Fallback síncrono ante error del worker
        fallback().then(resolve, reject);
      }
    };

    worker.onerror = () => {
      clearTimeout(timeout);
      worker.terminate();
      fallback().then(resolve, reject);
    };

    // Copiar a un buffer propio para poder transferirlo sin afectar el original
    const pkCopy = myPrivateKey.slice();
    worker.postMessage(
      { action: 'deriveShared', privateKey: pkCopy.buffer, otherPublicKeyHex },
      [pkCopy.buffer]
    );
  });
}
