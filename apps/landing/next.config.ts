import path from "node:path";
import type { NextConfig } from "next";

// ── El sistema (apps/dashboard) vive bajo este mismo dominio ────────────────
// La landing es la puerta de entrada: las rutas del sistema se reenvían a su
// despliegue, así el botón "Iniciar Sesión" lleva a /login sin cambiar de sitio.
// En desarrollo apunta al dashboard local (npm run dev levanta ambos).
const SISTEMA_URL = (
  process.env.SISTEMA_URL ??
  (process.env.NODE_ENV === "development"
    ? "http://localhost:3001"
    : "https://setpoint-pms.vercel.app")
).replace(/\/$/, "");

// Páginas del sistema. Al añadir una ruta nueva en apps/dashboard/src/app hay
// que añadirla aquí también.
const RUTAS_SISTEMA = [
  "login",
  "forgot-password",
  "pos",
  "pistas",
  "comandas",
  "inventario",
  "clientes",
  "caja",
  "empleados",
  "reportes",
  "descuentos",
  "historial",
  "cancelaciones",
  "configuracion",
];
// Archivos sueltos del sistema (apps/dashboard/public)
const ARCHIVOS_SISTEMA = ["sw.js", "manifest.json"];
// Prefijo de sus JS/CSS: el mismo valor que assetPrefix en apps/dashboard/next.config.ts
const ESTATICOS_SISTEMA = "sistema-static";

// Todo lo anterior queda fuera de las cabeceras de la landing: el sistema trae
// las suyas y la CSP de aquí (connect-src 'self') le bloquearía el backend.
const FUERA_DE_LA_LANDING = [...RUTAS_SISTEMA, ...ARCHIVOS_SISTEMA, ESTATICOS_SISTEMA]
  .map((p) => p.replace(/\./g, "\\."))
  .join("|");

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
  turbopack: {
    // Raíz del monorepo: las dependencias se instalan allí
    root: path.join(__dirname, "..", ".."),
  },
  async headers() {
    return [
      {
        // Aplica headers a todas las rutas de la landing (no a las del sistema)
        source: `/((?!(?:${FUERA_DE_LA_LANDING})(?:/|$)).*)`,
        headers: securityHeaders,
      },
    ];
  },
  async rewrites() {
    return [
      ...RUTAS_SISTEMA.flatMap((ruta) => [
        { source: `/${ruta}`, destination: `${SISTEMA_URL}/${ruta}` },
        { source: `/${ruta}/:path+`, destination: `${SISTEMA_URL}/${ruta}/:path+` },
      ]),
      ...ARCHIVOS_SISTEMA.map((archivo) => ({
        source: `/${archivo}`,
        destination: `${SISTEMA_URL}/${archivo}`,
      })),
      {
        source: `/${ESTATICOS_SISTEMA}/:path+`,
        destination: `${SISTEMA_URL}/${ESTATICOS_SISTEMA}/:path+`,
      },
    ];
  },
};

export default nextConfig;
