import path from 'node:path'
import type { NextConfig } from 'next'

// Orígenes del backend (Neon Auth y Neon Data API), para que la CSP no
// bloquee las peticiones que el navegador les hace directamente.
function origin(url: string | undefined): string {
  try {
    return new URL(url ?? '').origin
  } catch {
    return ''
  }
}
const backendOrigins = [
  origin(process.env.NEXT_PUBLIC_NEON_AUTH_URL),
  origin(process.env.NEXT_PUBLIC_NEON_DATA_API_URL),
]
  .filter(Boolean)
  .join(' ')

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
  {
    key: 'Content-Security-Policy',
    // NOTE: unsafe-inline and unsafe-eval are required for Next.js/Turbopack in dev.
    // For production, tighten to use nonce-based CSP.
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      "worker-src 'self' blob:",
      `connect-src 'self' ${backendOrigins} https://fonts.googleapis.com https://fonts.gstatic.com`,
      "frame-src 'none'",
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  // El sistema se publica bajo el dominio de la landing (apps/landing reenvía
  // aquí sus rutas). Con este prefijo los JS/CSS de ambas apps no chocan.
  // Si cambia, hay que cambiarlo también en apps/landing/next.config.ts.
  assetPrefix: '/sistema-static',
  turbopack: {
    // Raíz del monorepo, relativa a este archivo: una ruta fija de Windows
    // rompería la compilación en Vercel.
    root: path.join(__dirname, '..', '..'),
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
