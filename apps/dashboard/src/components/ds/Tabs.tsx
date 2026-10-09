'use client'

interface TabsProps<T extends string> {
  value: T
  onChange: (value: T) => void
  tabs: { value: T; label: string; count?: number }[]
}

export function Tabs<T extends string>({ value, onChange, tabs }: TabsProps<T>) {
  return (
    <div role="tablist" className="flex gap-6 border-b border-outline-variant">
      {tabs.map((t) => {
        const activa = t.value === value
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={activa}
            onClick={() => onChange(t.value)}
            className={`-mb-px border-b-2 pb-2.5 text-sm transition-colors ${activa ? 'border-primary font-medium text-on-surface' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
          >
            {t.label}
            {t.count !== undefined ? (
              <span className="ml-1.5 text-xs tabular-nums text-outline">{t.count}</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
