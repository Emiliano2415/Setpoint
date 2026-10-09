import type { Metadata } from 'next'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/components/providers/AuthProvider'
import { ServiceWorkerProvider } from '@/components/providers/ServiceWorkerProvider'
import './globals.css'

export const metadata: Metadata = {
  title: 'Setpoint PMS',
  description: 'Sistema de gestión para clubes de padel',
  robots: { index: false, follow: false },
  manifest: '/manifest.json',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <meta name="theme-color" content="#a3d483" />
      </head>
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
        <Toaster position="bottom-right" theme="dark" richColors />
        <ServiceWorkerProvider />
      </body>
    </html>
  )
}
