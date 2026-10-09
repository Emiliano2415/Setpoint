const FORMATO = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })

interface MoneyProps {
  value: number
  className?: string
}

export function Money({ value, className = '' }: MoneyProps) {
  return <span className={`tabular-nums ${className}`}>{FORMATO.format(value)}</span>
}
