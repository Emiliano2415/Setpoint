import type { Metadata } from 'next'
import './globals.css'
import CustomScrollbar from '../components/CustomScrollbar'
import SceneBackground from '../components/SceneBackground'

import SmoothScroll from '../components/SmoothScroll'

export const metadata: Metadata = {
  title: 'Setpoint — Gestión Inteligente. Rendimiento Total.',
  description: 'El sistema operativo para tu club de padel. Sincroniza pistas, bar y tienda en una única pantalla de alto rendimiento.',
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
