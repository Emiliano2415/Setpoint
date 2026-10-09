import type { ReactNode } from 'react'

const PADDING = {
  none: '',
  md: 'p-4',
  lg: 'p-6',
} as const

interface CardProps {
  padding?: keyof typeof PADDING
  className?: string
  children: ReactNode
}

export function Card({ padding = 'md', className = '', children }: CardProps) {
  return (
    <div
      className={`rounded-lg border border-outline-variant bg-surface-container ${PADDING[padding]} ${className}`}
    >
      {children}
    </div>
  )
}
