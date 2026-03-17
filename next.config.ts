import type { NextConfig } from "next";

const securityHeaders = [
  // Evita clickjacking — la página no puede ser embebida en iframes externos
  { key: "X-Frame-Options", value: "DENY" },
  // Bloquea MIME-type sniffing
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Controla el referer enviado en requests externos
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Habilita HSTS (HTTPS obligatorio, 1 año)
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  // Desactiva FLoC / Topics API de Google
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  // Content Security Policy — permite shaders WebGL y Google Fonts
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Scripts: propio + Vercel analytics (si se añade)
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      // Estilos: propio + Google Fonts
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      // Fuentes: propio + Google Fonts CDN
      "font-src 'self' https://fonts.gstatic.com",
      // Imágenes: propio + data URIs
      "img-src 'self' data: blob:",
      // WebGL / Canvas shaders necesitan worker-src blob:
      "worker-src 'self' blob:",
      // Canvas/WebGL context
      "connect-src 'self'",
      // Media
      "media-src 'self'",
      // No iframes externos
      "frame-src 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Aplica headers a todas las rutas
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
