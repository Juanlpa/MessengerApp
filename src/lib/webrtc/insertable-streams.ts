/**
 * insertable-streams.ts — Integración de WebRTC Encoded Transform (Insertable Streams)
 *
 * Permite cifrar/descifrar frames de audio y video E2E antes de que salgan
 * por la red. Solo soportado en Chromium (Chrome, Edge, Opera).
 * En Firefox/Safari la llamada funciona sin cifrado de frames (SRTP estándar).
 *
 * Spec: https://www.w3.org/TR/webrtc-encoded-transform/
 */

import { encryptFrame, decryptFrame } from './frame-crypto';

/** Contenedor mutable que permite rotar la clave en transforms ya activos. */
export interface KeyContainer {
  current: CryptoKey | null;
}

export function isInsertableStreamsSupported(): boolean {
  return (
    typeof RTCRtpSender !== 'undefined' &&
    'createEncodedStreams' in RTCRtpSender.prototype
  );
}

/**
 * Configura el transform de cifrado sobre un sender.
 * @param initialKey CryptoKey AES-GCM ya importada (tipicamente derivada por hora con HKDF)
 * @returns KeyContainer — actualizar `container.current` para rotar la clave sin recrear el transform
 */
export async function setupSenderTransform(
  sender: RTCRtpSender,
  initialKey: CryptoKey
): Promise<KeyContainer> {
  const container: KeyContainer = { current: initialKey };
  if (!isInsertableStreamsSupported()) return container;

  const { readable, writable } = (sender as unknown as {
    createEncodedStreams(): { readable: ReadableStream; writable: WritableStream };
  }).createEncodedStreams();

  const transformStream = new TransformStream({
    async transform(frame, controller) {
      if (container.current) {
        await encryptFrame(frame as RTCEncodedVideoFrame, container.current);
      }
      controller.enqueue(frame);
    },
  });

  readable.pipeThrough(transformStream).pipeTo(writable).catch(() => {});
  return container;
}

/**
 * Configura el transform de descifrado sobre un receiver.
 * @returns KeyContainer — actualizar `container.current` para rotar la clave sin recrear el transform
 */
export async function setupReceiverTransform(
  receiver: RTCRtpReceiver,
  initialKey: CryptoKey
): Promise<KeyContainer> {
  const container: KeyContainer = { current: initialKey };
  if (!isInsertableStreamsSupported()) return container;

  const { readable, writable } = (receiver as unknown as {
    createEncodedStreams(): { readable: ReadableStream; writable: WritableStream };
  }).createEncodedStreams();

  const transformStream = new TransformStream({
    async transform(frame, controller) {
      if (container.current) {
        await decryptFrame(frame as RTCEncodedVideoFrame, container.current);
      }
      controller.enqueue(frame);
    },
  });

  readable.pipeThrough(transformStream).pipeTo(writable).catch(() => {});
  return container;
}
