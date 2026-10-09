'use client'

interface SegmentedControlProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  label?: string
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-lg border border-outline-variant bg-background p-1"
    >
      {options.map((o) => {
        const activa = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={activa}
            onClick={() => onChange(o.value)}
            className={`h-8 rounded-md px-3 text-sm transition-colors ${activa ? 'bg-surface-container-highest font-medium text-on-surface' : 'text-on-surface-variant hover:text-on-surface'}`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
