import type { NextConfig } from "next";

const ContentSecurityPolicy = `
  default-src 'self';
  script-src 'self' 'unsafe-inline' 'unsafe-eval';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:;
  font-src 'self';
  connect-src 'self' https:;
  frame-ancestors 'none';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
`;

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: ContentSecurityPolicy.replace(/\n/g,' ')
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY'
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin'
  },
  {
    key:'Strict-Transport-Security',
    value:'max-age=31536000; includeSubDomains'
  },
  {
    key:'X-XSS-Protection',
    value:'1; mode=block'
  }
];

const nextConfig: NextConfig = {

async headers(){

return [

{
source:'/:path*',
headers:securityHeaders
}

];

}

};

export default nextConfig;