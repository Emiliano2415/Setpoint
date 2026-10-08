'use client'

import type { ReservaRow } from '@/lib/supabase/queries/pistas'

interface PistasSidebarProps {
  occupiedCount: number
  totalCourts: number
  reservas: ReservaRow[]
}

function formatHora(hora: string): string {
  // hora is "HH:MM:SS", return "HH:MM"
  return hora.slice(0, 5)
}

export function PistasSidebar({ occupiedCount, totalCourts, reservas }: PistasSidebarProps) {
  const occupancyPct = totalCourts > 0 ? Math.round((occupiedCount / totalCourts) * 100) : 0

  // Next upcoming reservas: hora_inicio > now, next 3
  const nowTime = new Date()
  const nowStr = `${String(nowTime.getHours()).padStart(2, '0')}:${String(nowTime.getMinutes()).padStart(2, '0')}:${String(nowTime.getSeconds()).padStart(2, '0')}`

  const proximos = reservas
    .filter((r) => r.hora_inicio > nowStr)
    .slice(0, 3)

  // Resumen diario: total ingresos from completed/occupied reservas
  const ingresos = reservas
    .filter((r) => r.estado === 'checkin' || r.estado === 'finalizada')
    .reduce((sum, r) => sum + (r.precio ?? 0), 0)

  const ingresosFormatted = ingresos >= 1000
    ? `$${(ingresos / 1000).toFixed(1)}k`
    : `$${ingresos}`

  return (
    <div
      style={{
        background: 'var(--color-bg2)',
        borderLeft: '1px solid var(--color-border)',
        padding: '20px',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      {/* Próximos Turnos */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--color-muted)' }}>
            Próximos Turnos
          </span>
          <span style={{ fontSize: '10px', color: 'var(--color-muted-dim)', cursor: 'pointer' }}>Ver Todos</span>
        </div>

        {proximos.length === 0 && (
          <div style={{ fontSize: '12px', color: 'var(--color-muted)', textAlign: 'center', padding: '16px 0' }}>
            Sin próximas reservas
          </div>
        )}

        {proximos.map((r, i) => {
          const isFirst = i === 0
          const clientName = r.clientes?.nombre ?? r.nombre_cliente ?? 'Sin asignar'
          const timeLabel = `${formatHora(r.hora_inicio)} - ${formatHora(r.hora_fin)}`

          return (
            <div
              key={r.id}
              style={{
                padding: '14px',
                background: 'var(--color-bg)',
                border: `${isFirst ? '1.5px' : '1px'} solid ${isFirst ? 'rgba(108,242,13,0.30)' : 'var(--color-border-subtle)'}`,
                borderRadius: '12px',
                marginBottom: '10px',
                cursor: 'pointer',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={(e) => !isFirst && (e.currentTarget.style.borderColor = 'rgba(108,242,13,0.15)')}
              onMouseLeave={(e) => !isFirst && (e.currentTarget.style.borderColor = 'var(--color-border-subtle)')}
            >
              <div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color: 'var(--color-lime)' }}>
                  {timeLabel}
                </span>
                <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginLeft: '8px' }}>
                  {r.pistas?.nombre ?? r.pista_id.slice(0, 8)}
                </span>
              </div>
              <div style={{ fontSize: '13px', fontWeight: 700, marginTop: '6px' }}>
                {r.notas ?? 'Reserva'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
                {clientName}
              </div>
            </div>
          )
        })}
      </div>

      {/* Resumen Diario */}
      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--color-muted)', marginBottom: '12px' }}>
          Resumen Diario
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div style={{ textAlign: 'center', padding: '16px', background: 'var(--color-bg)', border: '1px solid var(--color-border-subtle)', borderRadius: '12px' }}>
            <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-lime)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
              Ocupación
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '28px', fontWeight: 700 }}>{occupancyPct}%</div>
          </div>
          <div style={{ textAlign: 'center', padding: '16px', background: 'var(--color-bg)', border: '1px solid var(--color-border-subtle)', borderRadius: '12px' }}>
            <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-lime)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
              Ingresos
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '22px', fontWeight: 700 }}>{ingresosFormatted}</div>
            <div style={{ fontSize: '10px', color: 'var(--color-muted)', marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>MXN Hoy</div>
          </div>
        </div>
      </div>

      {/* System Status */}
      <div
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 16px', background: 'var(--color-bg)',
          border: '1px solid var(--color-border-subtle)', borderRadius: '12px',
        }}
      >
        <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--color-muted)' }}>
          Estado del Sistema
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: 'var(--color-lime)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-lime)', display: 'inline-block' }} />
          En Línea
        </span>
      </div>
    </div>
  )
}
