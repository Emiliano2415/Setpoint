'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <p className="text-5xl font-black text-lime mb-4">!</p>
      <h2 className="text-2xl font-bold text-text mb-2">Algo salió mal</h2>
      <p className="text-muted mb-8 max-w-sm">
        Ocurrió un error inesperado. Puedes intentar recargar la página.
      </p>
      <button
        onClick={reset}
        className="bg-lime text-bg font-bold rounded-full px-6 py-3 text-sm"
      >
        Reintentar
      </button>
    </div>
  )
}
