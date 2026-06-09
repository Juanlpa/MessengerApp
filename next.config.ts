import type { NextConfig } from "next";

// CSP endurecido en PRODUCCIÓN; flexible en DEV (HMR necesita 'unsafe-eval').
// NOTA: script-src/style-src mantienen 'unsafe-inline' porque Next.js/React lo
// requieren (scripts de hidratación + estilos inline dinámicos). El enfoque con
// nonce no es viable aquí: las páginas son estáticas y Next no inyecta el nonce,
// lo que bloquearía los scripts. Documentado como riesgo aceptado en securityinfo.md.
const isProd = process.env.NODE_ENV === 'production';
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const supabaseWss = supabaseUrl.replace(/^https:/, 'wss:');

const scriptSrc = isProd
  ? `'self' 'unsafe-inline'`
  : `'self' 'unsafe-inline' 'unsafe-eval'`;
const imgSrc = isProd ? `'self' data: blob:` : `'self' data: blob: https:`;
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
  // No revelar el framework en la cabecera (evita "Server Leaks Information
  // via X-Powered-By" — fingerprinting). Quita el header `X-Powered-By: Next.js`.
  poweredByHeader: false,
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
    // Restringir el CORS a nuestro propio origen en TODAS las respuestas (favicon,
    // chunks /_next/static, sitemap, etc.) para neutralizar el
    // `Access-Control-Allow-Origin: *` que añade la CDN de Vercel a los assets
    // públicos. Es inofensivo: la app carga todo en el mismo origen (no usa CORS),
    // así que fijar el ACAO al propio dominio no rompe nada y quita el aviso de ZAP.
    const appOrigin = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/+$/, '');
    const headersForAll = appOrigin
      ? [...securityHeaders, { key: 'Access-Control-Allow-Origin', value: appOrigin }]
      : securityHeaders;

    return [
      {
        source: '/:path*',
        headers: headersForAll,
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