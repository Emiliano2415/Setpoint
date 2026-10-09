import type { ButtonHTMLAttributes } from 'react'

const VARIANT = {
  primary: 'bg-primary text-on-primary hover:brightness-105',
  secondary: 'border border-outline text-on-surface hover:bg-surface-container-highest',
  ghost: 'text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface',
  danger: 'border border-error/50 text-error hover:bg-error/10',
} as const

const SIZE = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-5 text-sm',
} as const

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANT
  size?: keyof typeof SIZE
  fullWidth?: boolean
  /** Deshabilita el botón y muestra "Procesando…" */
  loading?: boolean
}

export function Button({
  variant = 'secondary',
  size = 'md',
  fullWidth = false,
  loading = false,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT[variant]} ${SIZE[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading ? 'Procesando…' : children}
    </button>
  )
}
