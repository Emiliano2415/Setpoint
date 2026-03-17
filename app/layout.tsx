import type { Metadata } from 'next'
import './globals.css'
import CustomScrollbar from '../components/CustomScrollbar'
import SceneBackground from '../components/SceneBackground'

import SmoothScroll from '../components/SmoothScroll'

const siteUrl = 'https://landing-one-swart.vercel.app'

export const metadata: Metadata = {
  title: 'Setpoint — Gestión Inteligente. Rendimiento Total.',
  description: 'El sistema operativo para tu club de padel. Sincroniza pistas, bar y tienda en una única pantalla de alto rendimiento.',
  keywords: ['padel', 'club de padel', 'software gestión padel', 'TPV padel', 'reservas pistas padel', 'setpoint'],
  authors: [{ name: 'Setpoint' }],
  robots: { index: true, follow: true },
  alternates: { canonical: siteUrl },
  openGraph: {
    type: 'website',
    url: siteUrl,
    title: 'Setpoint — Gestión Inteligente. Rendimiento Total.',
    description: 'El sistema operativo para tu club de padel. Sincroniza pistas, bar y tienda en una única pantalla de alto rendimiento.',
    siteName: 'Setpoint',
    locale: 'es_ES',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Setpoint — Gestión Inteligente. Rendimiento Total.',
    description: 'El sistema operativo para tu club de padel. Sincroniza pistas, bar y tienda en una única pantalla.',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className="scroll-smooth">
      <body className="antialiased scrollbar-hide">
        <SmoothScroll>
          {/* Full-page relative container — SceneBackground absolute inside, content on top */}
          <div style={{ position: 'relative' }}>
            <SceneBackground />
            <div style={{ position: 'relative', zIndex: 1 }}>
              {children}
            </div>
          </div>
          <CustomScrollbar />
        </SmoothScroll>
      </body>
    </html>
  )
}
