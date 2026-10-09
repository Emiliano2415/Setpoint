'use client'

interface SwitchProps {
  checked: boolean
  onChange: (value: boolean) => void
  /** Texto accesible; se usa como aria-label (no se pinta) */
  label: string
  disabled?: boolean
}

export function Switch({ checked, onChange, label, disabled = false }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'border-primary bg-primary' : 'border-outline-variant bg-surface-container-highest'}`}
    >
      <span
        aria-hidden="true"
        className={`h-3.5 w-3.5 rounded-full transition-transform ${checked ? 'translate-x-[18px] bg-on-primary' : 'translate-x-0.5 bg-outline'}`}
      />
    </button>
  )
}
