import type { NextConfig } from "next";

// CSP endurecido en PRODUCCIÓN; flexible en DEV (HMR/túneles necesitan eval y
// orígenes amplios). En prod se eliminan los comodines y 'unsafe-eval'.
const isProd = process.env.NODE_ENV === 'production';

// Orígenes de Supabase (REST https + Realtime wss) — se leen del entorno para no
// hardcodear el proyecto. Si no está disponible al compilar, cae a comodín seguro.
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const supabaseWss = supabaseUrl.replace(/^https:/, 'wss:');

// script-src: sin 'unsafe-eval' en producción (no lo necesita el build de Next).
const scriptSrc = isProd
  ? `'self' 'unsafe-inline'`
  : `'self' 'unsafe-inline' 'unsafe-eval'`;

// img-src: sin comodín https: en producción (imágenes propias = blob/data).
const imgSrc = isProd ? `'self' data: blob:` : `'self' data: blob: https:`;

// connect-src: en prod solo Supabase (REST+Realtime) y el propio origen.
// El TURN de WebRTC NO usa fetch/WebSocket, así que no va aquí.
const connectSrc = isProd && supabaseUrl
  ? `'self' ${supabaseUrl} ${supabaseWss}`
  : `'self' https: wss: ws:`;

const ContentSecurityPolicy = `
  default-src 'self';
  script-src ${scriptSrc};
  style-src 'self' 'unsafe-inline';
  img-src ${imgSrc};
  font-src 'self' data:;
  connect-src ${connectSrc};
  media-src 'self' blob:;
  worker-src 'self' blob:;
  frame-ancestors 'none';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
`;

const securityHeaders = [
  { key: 'Content-Security-Policy', value: ContentSecurityPolicy.replace(/\n/g, ' ').trim() },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
];

const nextConfig: NextConfig = {
  compress: true,
  // Permite que el dev server acepte peticiones desde túneles HTTPS
  // (cloudflared / ngrok) al probar desde el celular. Solo afecta a `next dev`.
  allowedDevOrigins: [
    '*.trycloudflare.com',
    '*.ngrok-free.app',
    '*.ngrok.io',
  ],
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript' },
        ],
      },
    ];
  },
};

export default nextConfig;