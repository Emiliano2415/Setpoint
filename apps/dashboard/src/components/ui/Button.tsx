'use client'
import { ButtonHTMLAttributes, forwardRef } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'md' | 'lg'
  children: React.ReactNode
}

const VARIANT_STYLES: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: 'var(--color-lime)',
    color: 'var(--color-bg)',
    border: 'none',
    fontWeight: 700,
  },
  secondary: {
    background: 'transparent',
    color: 'var(--color-text)',
    border: '1px solid var(--color-border)',
    fontWeight: 600,
  },
  ghost: {
    background: 'transparent',
    color: 'var(--color-muted)',
    border: 'none',
    fontWeight: 500,
  },
  danger: {
    background: 'rgba(239,68,68,0.10)',
    color: '#EF4444',
    border: 'none',
    fontWeight: 600,
  },
}

const SIZE_STYLES: Record<string, React.CSSProperties> = {
  sm: { padding: '6px 12px', fontSize: '12px' },
  md: { padding: '9px 16px', fontSize: '13px' },
  lg: { padding: '14px 24px', fontSize: '14px' },
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', children, style, ...props }, ref) => {
    return (
      <button
        ref={ref}
        {...props}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          borderRadius: '8px',
          cursor: 'pointer',
          fontFamily: 'inherit',
          transition: 'all 0.15s',
          ...VARIANT_STYLES[variant],
          ...SIZE_STYLES[size],
          ...style,
        }}
        onMouseEnter={(e) => {
          if (variant === 'primary') e.currentTarget.style.filter = 'brightness(1.1)'
          if (variant === 'secondary') e.currentTarget.style.borderColor = 'rgba(163,212,131,0.30)'
          if (variant === 'ghost') {
            e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
            e.currentTarget.style.color = 'var(--color-text)'
          }
          props.onMouseEnter?.(e)
        }}
        onMouseLeave={(e) => {
          if (variant === 'primary') e.currentTarget.style.filter = ''
          if (variant === 'secondary') e.currentTarget.style.borderColor = 'var(--color-border)'
          if (variant === 'ghost') {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--color-muted)'
          }
          props.onMouseLeave?.(e)
        }}
      >
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
