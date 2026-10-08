'use client'

interface CategoryTabsProps {
  categories: { id: string; label: string }[]
  active: string
  onChange: (id: string) => void
}

export function CategoryTabs({ categories, active, onChange }: CategoryTabsProps) {
  return (
    <div
      style={{
        display: 'flex',
        gap: '8px',
        padding: '20px 24px 0',
        flexShrink: 0,
      }}
    >
      {categories.map((cat) => {
        const isActive = cat.id === active
        return (
          <button
            key={cat.id}
            onClick={() => onChange(cat.id)}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              fontFamily: 'inherit',
              border: `1px solid ${isActive ? 'var(--color-lime)' : 'var(--color-border)'}`,
              background: isActive ? 'var(--color-lime)' : 'transparent',
              color: isActive ? 'var(--color-bg)' : 'var(--color-muted)',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.borderColor = 'rgba(108,242,13,0.20)'
                e.currentTarget.style.color = 'var(--color-text)'
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.borderColor = 'var(--color-border)'
                e.currentTarget.style.color = 'var(--color-muted)'
              }
            }}
          >
            {cat.label}
          </button>
        )
      })}
    </div>
  )
}
