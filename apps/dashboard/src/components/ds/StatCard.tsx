import type { ReactNode } from 'react'
import { Card } from './Card'

const VALUE_TONE = {
  neutral: 'text-on-surface',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
  info: 'text-info',
  primary: 'text-primary',
} as const

interface StatCardProps {
  label: string
  value: ReactNode
  hint?: string
  tone?: keyof typeof VALUE_TONE
}

export function StatCard({ label, value, hint, tone = 'neutral' }: StatCardProps) {
  return (
    <Card>
      <p className="text-xs text-outline">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${VALUE_TONE[tone]}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-on-surface-variant">{hint}</p> : null}
    </Card>
  )
}
