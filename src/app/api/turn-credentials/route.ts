/**
 * GET /api/turn-credentials
 *
 * Devuelve el array `iceServers` (STUN + TURN) para WebRTC usando Cloudflare TURN.
 * Las credenciales se generan en el servidor con el API Token de Cloudflare, que
 * vive SOLO aquí (CLOUDFLARE_TURN_API_TOKEN) y NUNCA se expone al navegador.
 * El cliente solo recibe credenciales TURN temporales (seguras de usar en el front).
 *
 * Variables de entorno (server-side, sin NEXT_PUBLIC):
 *   CLOUDFLARE_TURN_KEY_ID     — el "Turn Token ID" del dashboard de Cloudflare
 *   CLOUDFLARE_TURN_API_TOKEN  — el API Token (se muestra una sola vez al crear la key)
 *
 * Si no están configuradas, devuelve { iceServers: null } y el cliente usa su
 * fallback (STUN + openrelay).
 */
import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

export async function GET() {
  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID?.trim();
  const apiToken = process.env.CLOUDFLARE_TURN_API_TOKEN?.trim();

  if (!keyId || !apiToken) {
    return NextResponse.json({ iceServers: null });
  }

  try {
    const res = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ttl: 86400 }), // credenciales válidas 24h
        cache: 'no-store',
      }
    );

    if (!res.ok) {
      return NextResponse.json({ iceServers: null });
    }

    const data = (await res.json()) as { iceServers?: unknown };
    // Cloudflare devuelve { iceServers: { urls, username, credential } } (objeto).
    // Normalizamos a array para RTCPeerConnection.
    const raw = data?.iceServers;
    const iceServers = Array.isArray(raw) ? raw : raw ? [raw] : null;

    if (!iceServers || iceServers.length === 0) {
      return NextResponse.json({ iceServers: null });
    }

    return NextResponse.json({ iceServers });
  } catch {
    return NextResponse.json({ iceServers: null });
  }
}
