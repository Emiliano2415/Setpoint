import { cn } from '@/lib/utils'

type BadgeVariant = 'lime' | 'yellow' | 'red' | 'blue' | 'orange' | 'muted'

const VARIANT_STYLES: Record<BadgeVariant, { background: string; color: string }> = {
  lime: { background: 'rgba(163,212,131,0.10)', color: '#a3d483' },
  yellow: { background: 'rgba(234,179,8,0.10)', color: '#EAB308' },
  red: { background: 'rgba(239,68,68,0.10)', color: '#EF4444' },
  blue: { background: 'rgba(59,130,246,0.10)', color: '#3B82F6' },
  orange: { background: 'rgba(249,115,22,0.10)', color: '#F97316' },
  muted: { background: 'rgba(139,156,122,0.12)', color: '#8B9C7A' },
}

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  className?: string
}

export function Badge({ variant = 'muted', children, className }: BadgeProps) {
  const styles = VARIANT_STYLES[variant]
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '3px 10px',
        borderRadius: '6px',
        fontSize: '10px',
        fontWeight: 700,
        letterSpacing: '0.5px',
        textTransform: 'uppercase',
        ...styles,
      }}
    >
      {children}
    </span>
  )
}
