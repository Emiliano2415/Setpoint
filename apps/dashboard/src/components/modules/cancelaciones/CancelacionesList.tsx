'use client'

import type { CancelacionRow } from '@/lib/supabase/queries/cancelaciones'

const ESTADO_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  ejecutada:   { label: 'Ejecutada',   color: 'var(--color-muted)', bg: 'var(--color-bg)' },
  pendiente:   { label: 'Pendiente',   color: '#F97316', bg: 'rgba(249,115,22,0.12)' },
  aprobada:    { label: 'Aprobada',    color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
  reembolsada: { label: 'Reembolsada', color: 'var(--color-lime)', bg: 'rgba(163,212,131,0.10)' },
  rechazada:   { label: 'Rechazada',   color: '#EF4444', bg: 'rgba(239,68,68,0.10)' },
}

interface Props {
  rows: CancelacionRow[]
  loading: boolean
  selected: CancelacionRow | null
  onSelect: (c: CancelacionRow) => void
}

export function CancelacionesList({ rows, loading, selected, onSelect }: Props) {
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-muted)', fontSize: '13px' }}>
        Cargando...
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-muted)', fontSize: '13px' }}>
        Sin cancelaciones
      </div>
    )
  }

  return (
    <div style={{ overflowY: 'auto', padding: '12px' }}>
      {rows.map((row) => {
        const badge = ESTADO_BADGE[row.estado] ?? ESTADO_BADGE.ejecutada
        const isSelected = selected?.id === row.id
        const creada = new Date(row.created_at)
        // Con fecha: la pestaña de reservas mezcla días y la de ítems permite consultar días anteriores
        const time = `${creada.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} · ${creada.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`
        const title = row.reservas
          ? `Reserva — ${row.reservas.pistas?.nombre ?? '—'}`
          : row.cuentas?.numero_ticket
            ? `Ticket ${row.cuentas.numero_ticket}`
            : '—'
        const subtitle = row.reservas
          ? (row.reservas.nombre_cliente ?? row.reservas.clientes?.nombre ?? 'Sin cliente')
          : row.motivo

        return (
          <div
            key={row.id}
            onClick={() => onSelect(row)}
            style={{
              padding: '12px 14px',
              borderRadius: '10px',
              border: `1px solid ${isSelected ? 'var(--color-lime)' : 'var(--color-border-subtle)'}`,
              background: isSelected ? 'rgba(163,212,131,0.05)' : 'var(--color-bg2)',
              marginBottom: '6px',
              cursor: 'pointer',
              transition: 'border-color 0.15s',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text)', marginBottom: '2px' }}>
                  {title}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {subtitle}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                <span style={{
                  fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px',
                  color: badge.color, background: badge.bg,
                }}>
                  {badge.label}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: row.monto > 0 ? 'var(--color-lime)' : 'var(--color-muted)' }}>
                  {row.monto > 0 ? `$${row.monto.toFixed(2)}` : '—'}
                </span>
              </div>
            </div>
            <div style={{ fontSize: '10px', color: 'var(--color-muted-dim)', marginTop: '6px' }}>
              {time} · {row.cancelado_por_empleado?.nombre ?? '—'}
            </div>
          </div>
        )
      })}
    </div>
  )
}
