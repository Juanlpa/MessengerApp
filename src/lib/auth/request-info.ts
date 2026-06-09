/**
 * Helpers para extraer info del request (IP, user-agent) de forma consistente.
 */

export function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    // x-forwarded-for puede tener múltiples IPs: "client, proxy1, proxy2"
    // La primera es la del cliente real.
    return xff.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip') || 'unknown';
}

export function getUserAgent(request: Request): string {
  return request.headers.get('user-agent') || 'unknown';
}
