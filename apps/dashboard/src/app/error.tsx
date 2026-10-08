'use client'

import Link from 'next/link'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-sans)',
        gap: '16px',
      }}
    >
      <div style={{ fontSize: '32px' }}>⚠</div>
      <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-text)' }}>
        Error inesperado
      </div>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          color: 'var(--color-muted)',
          background: 'var(--color-bg2)',
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
          padding: '10px 16px',
          maxWidth: '400px',
          wordBreak: 'break-all',
        }}
      >
        {error.message || 'Ocurrió un error desconocido'}
      </div>
      <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
        <button
          onClick={reset}
          style={{
            padding: '8px 20px',
            background: 'var(--color-lime)',
            color: 'var(--color-bg)',
            border: 'none',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Reintentar
        </button>
        <Link
          href="/pos"
          style={{
            padding: '8px 20px',
            background: 'transparent',
            color: 'var(--color-muted)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          ← Ir al inicio
        </Link>
      </div>
    </div>
  )
}
