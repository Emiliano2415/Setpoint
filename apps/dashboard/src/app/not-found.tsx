import Link from 'next/link'

export default function NotFound() {
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
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '120px',
          fontWeight: 700,
          color: 'var(--color-lime)',
          lineHeight: 1,
          letterSpacing: '-4px',
        }}
      >
        404
      </div>
      <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-text)' }}>
        Página no encontrada
      </div>
      <div style={{ fontSize: '13px', color: 'var(--color-muted)', textAlign: 'center', maxWidth: '320px' }}>
        La ruta que buscas no existe o fue movida.
      </div>
      <Link
        href="/pos"
        style={{
          marginTop: '8px',
          fontSize: '13px',
          color: 'var(--color-lime)',
          textDecoration: 'none',
          fontWeight: 600,
        }}
      >
        ← Volver al Panel
      </Link>
    </div>
  )
}
