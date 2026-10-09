import type { ReactNode } from 'react'

const TONE = {
  neutral: { chip: 'bg-surface-container-highest text-on-surface-variant', dot: 'bg-outline' },
  success: { chip: 'bg-success/10 text-success', dot: 'bg-success' },
  warning: { chip: 'bg-warning/10 text-warning', dot: 'bg-warning' },
  error: { chip: 'bg-error/10 text-error', dot: 'bg-error' },
  info: { chip: 'bg-info/10 text-info', dot: 'bg-info' },
  primary: { chip: 'bg-primary/10 text-primary', dot: 'bg-primary' },
} as const

interface BadgeProps {
  tone?: keyof typeof TONE
  children: ReactNode
}

export function Badge({ tone = 'neutral', children }: BadgeProps) {
  const t = TONE[tone]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap ${t.chip}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
      {children}
    </span>
  )
}
