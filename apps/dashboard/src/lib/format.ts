/** Formats a number as a MXN currency string without decimals, e.g. $1,500 */
export function fmtMXN(n: number): string {
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

/**
 * Returns ISO timestamp for the start of the local day in Mexico City time (CST = UTC-6).
 * Mexico abolished DST in 2022; all major cities now use UTC-6 year-round.
 * Use this instead of T00:00:00.000Z which incorrectly anchors to UTC midnight.
 */
export function localDayStart(date?: Date): string {
  const d = date ?? new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  // Midnight CST (UTC-6) = 06:00:00 UTC
  return `${y}-${m}-${day}T06:00:00.000Z`
}

/**
 * Returns ISO timestamp for the end of the local day in Mexico City time (CST = UTC-6).
 * 23:59:59 CST = next calendar day 05:59:59 UTC.
 */
export function localDayEnd(date?: Date): string {
  const d = date ?? new Date()
  const next = new Date(d)
  next.setDate(next.getDate() + 1)
  const y = next.getFullYear()
  const m = String(next.getMonth() + 1).padStart(2, '0')
  const day = String(next.getDate()).padStart(2, '0')
  // End of day CST = next day at 05:59:59 UTC
  return `${y}-${m}-${day}T05:59:59.999Z`
}
