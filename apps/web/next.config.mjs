/**
 * Two build targets:
 *  - default: full SaaS frontend (Vercel) with Auth.js, middleware and security headers
 *  - BUILD_TARGET=pages: static export for GitHub Pages; the API runs in the browser (demo mode)
 */
const isPages = process.env.BUILD_TARGET === 'pages';
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@copilot/shared'],
  poweredByHeader: false,
  ...(isPages
    ? {
        output: 'export',
        basePath,
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {
        images: {
          remotePatterns: [
            { protocol: 'https', hostname: '**.googleusercontent.com' },
            { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
          ],
        },
        async headers() {
          return [{ source: '/(.*)', headers: securityHeaders }];
        },
      }),
};

export default nextConfig;
