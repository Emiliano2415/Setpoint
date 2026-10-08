interface StatCardProps {
  value: string
  label: string
  valueColor?: string
}

export function StatCard({ value, label, valueColor }: StatCardProps) {
  return (
    <div
      style={{
        background: 'var(--color-bg)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: '12px',
        padding: '16px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '22px',
          fontWeight: 700,
          color: valueColor ?? 'var(--color-lime)',
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: '10px',
          color: 'var(--color-muted)',
          marginTop: '4px',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          fontWeight: 500,
        }}
      >
        {label}
      </div>
    </div>
  )
}
