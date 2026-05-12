/**
 * insertable-streams.ts — Integración de WebRTC Encoded Transform (Insertable Streams)
 *
 * Permite cifrar/descifrar frames de audio y video E2E antes de que salgan
 * por la red. Solo soportado en Chromium (Chrome, Edge, Opera).
 * En Firefox/Safari la llamada funciona sin cifrado de frames (SRTP estándar).
 *
 * Spec: https://www.w3.org/TR/webrtc-encoded-transform/
 */

import { encryptFrame, decryptFrame, importSharedKey } from './frame-crypto';

export function isInsertableStreamsSupported(): boolean {
  return (
    typeof RTCRtpSender !== 'undefined' &&
    'createEncodedStreams' in RTCRtpSender.prototype
  );
}

export async function setupSenderTransform(
  sender: RTCRtpSender,
  rawKey: Uint8Array
): Promise<void> {
  if (!isInsertableStreamsSupported()) return;

  const key = await importSharedKey(rawKey);

  // La API usa createEncodedStreams() — cast necesario porque los tipos de TS
  // aún no incluyen esta API experimental en todas las versiones
  const { readable, writable } = (sender as unknown as {
    createEncodedStreams(): { readable: ReadableStream; writable: WritableStream };
  }).createEncodedStreams();

  const transformStream = new TransformStream({
    async transform(frame, controller) {
      await encryptFrame(frame as RTCEncodedVideoFrame, key);
      controller.enqueue(frame);
    },
  });

  readable.pipeThrough(transformStream).pipeTo(writable);
}

export async function setupReceiverTransform(
  receiver: RTCRtpReceiver,
  rawKey: Uint8Array
): Promise<void> {
  if (!isInsertableStreamsSupported()) return;

  const key = await importSharedKey(rawKey);

  const { readable, writable } = (receiver as unknown as {
    createEncodedStreams(): { readable: ReadableStream; writable: WritableStream };
  }).createEncodedStreams();

  const transformStream = new TransformStream({
    async transform(frame, controller) {
      await decryptFrame(frame as RTCEncodedVideoFrame, key);
      controller.enqueue(frame);
    },
  });

  readable.pipeThrough(transformStream).pipeTo(writable);
}
