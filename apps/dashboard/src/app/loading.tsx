export default function Loading() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          border: '2px solid var(--color-border)',
          borderTopColor: 'var(--color-lime)',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <div
        style={{
          fontSize: '14px',
          fontWeight: 700,
          letterSpacing: '2px',
          color: 'var(--color-muted)',
        }}
      >
        SETPOINT<span style={{ color: 'var(--color-lime)' }}>.</span>
      </div>
    </div>
  )
}
