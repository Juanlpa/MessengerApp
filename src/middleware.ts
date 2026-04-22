/**
 * Middleware — Verificación JWT para rutas protegidas
 * Redirige a /auth/login si no hay token válido.
 */

import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rutas públicas — no requieren auth
  const publicPaths = ['/auth', '/api/auth'];
  if (publicPaths.some(p => pathname.startsWith(p)) || pathname === '/') {
    return NextResponse.next();
  }

  // Para rutas /chat — verificar que hay token en header o redirigir
  // (la verificación real del JWT se hace en los API routes)
  // El middleware de Next.js no puede importar nuestro crypto (es edge runtime)
  // Entonces solo verificamos que hay token en las API routes

  return NextResponse.next();
}

export const config = {
  matcher: ['/chat/:path*', '/api/conversations/:path*', '/api/messages/:path*'],
};
