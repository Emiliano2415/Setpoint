import type { ButtonHTMLAttributes, ReactNode } from 'react'

const VARIANT = {
  ghost: 'text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface',
  secondary: 'border border-outline text-on-surface hover:bg-surface-container-highest',
  danger: 'border border-error/50 text-error hover:bg-error/10',
} as const

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode
  /** Texto accesible; se usa como aria-label */
  label: string
  variant?: keyof typeof VARIANT
}

export function IconButton({
  icon,
  label,
  variant = 'ghost',
  disabled,
  className = '',
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      disabled={disabled}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT[variant]} ${className}`}
      {...rest}
    >
      {icon}
    </button>
  )
}
