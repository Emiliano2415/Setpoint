'use client'

import type { Court, CourtStatus } from './PistasPage'

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function getTimerState(timer: number, maxTime: number): 'active' | 'warning' | 'critical' {
  const ratio = timer / maxTime
  if (ratio >= 1) return 'critical'
  if (ratio >= 0.8) return 'warning'
  return 'active'
}

const STATUS_BADGE: Record<CourtStatus, { label: string; bg: string; color: string }> = {
  ocupada: { label: '👤 Ocupada', bg: 'rgba(239,68,68,0.10)', color: '#EF4444' },
  disponible: { label: '✓ Disponible', bg: 'rgba(108,242,13,0.10)', color: '#6CF20D' },
  mantenimiento: { label: '🔧 Mantenimiento', bg: 'rgba(234,179,8,0.10)', color: '#EAB308' },
  reservada: { label: '📅 Reservada', bg: 'rgba(99,102,241,0.10)', color: '#6366F1' },
}

const TIMER_COLORS = { active: '#6CF20D', warning: '#EAB308', critical: '#EF4444' }

export function CourtCard({ court, onClick, onCancelar }: { court: Court; onClick?: () => void; onCancelar?: () => void }) {
  const badge = STATUS_BADGE[court.status]
  const timerState =
    court.status === 'ocupada' && court.timer !== undefined && court.maxTime
      ? getTimerState(court.timer, court.maxTime)
      : null
  const timerColor = timerState ? TIMER_COLORS[timerState] : 'var(--color-muted-dim)'
  const progress =
    court.status === 'ocupada' && court.timer !== undefined && court.maxTime
      ? Math.min((court.timer / court.maxTime) * 100, 100)
      : 0

  return (
    <div
      style={{
        background: 'var(--color-bg)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: '16px',
        padding: '18px',
        cursor: 'pointer',
        transition: 'border-color 0.2s',
      }}
      onClick={onClick}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(108,242,13,0.20)')}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--color-border-subtle)')}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <span
          style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--color-muted)' }}
        >
          {court.name}
        </span>
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            padding: '3px 10px', borderRadius: '6px',
            fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase',
            background: badge.bg, color: badge.color,
          }}
        >
          {badge.label}
        </span>
      </div>

      {/* Timer */}
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '28px',
          fontWeight: 700,
          color: timerColor,
          letterSpacing: '2px',
          marginBottom: '12px',
          animation: timerState === 'critical' ? 'pulse-dot 1s ease infinite' : undefined,
        }}
      >
        {court.status === 'ocupada' && court.timer !== undefined
          ? formatTimer(court.timer)
          : '00:00'}
      </div>

      {/* Progress bar */}
      {progress > 0 && (
        <div
          style={{ height: '3px', background: 'var(--color-border-subtle)', borderRadius: '2px', overflow: 'hidden', marginBottom: '12px' }}
        >
          <div
            style={{ width: `${progress}%`, height: '100%', background: timerColor, borderRadius: '2px', transition: 'width 0.3s' }}
          />
        </div>
      )}

      {/* Info block */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '10px 12px', background: 'var(--color-bg2)', borderRadius: '8px', marginBottom: '12px',
        }}
      >
        <div
          style={{
            width: '36px', height: '36px', borderRadius: '8px', flexShrink: 0,
            background: court.status === 'mantenimiento' ? 'rgba(234,179,8,0.10)' : 'rgba(108,242,13,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: court.status === 'mantenimiento' ? '#EAB308' : 'var(--color-muted)',
          }}
        >
          {court.status === 'mantenimiento' ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          )}
        </div>
        <div>
          <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-muted-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {court.status === 'mantenimiento' ? 'Tarea' : court.titular ? 'Titular' : court.status === 'ocupada' ? 'Titular' : 'Disponibilidad'}
          </div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>
            {court.status === 'mantenimiento' ? court.task : court.titular ?? (court.status === 'ocupada' ? 'Sin nombre' : 'Sin asignar')}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', borderTop: '1px solid var(--color-border-subtle)' }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-muted-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Tarifa
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: court.tarifa > 0 ? 'var(--color-text)' : '#EAB308' }}>
            {court.tarifa > 0 ? `$ ${court.tarifa} MXN / HR` : 'Bloqueado'}
          </div>
        </div>
        {court.status === 'disponible' ? (
          <button
            onClick={(e) => { e.stopPropagation(); onClick?.() }}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '6px 12px', background: 'var(--color-lime)', color: 'var(--color-bg)',
              border: 'none', borderRadius: '8px', fontSize: '11px', fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.3px',
              transition: 'filter 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.1)')}
            onMouseLeave={(e) => (e.currentTarget.style.filter = '')}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
            Reservar
          </button>
        ) : court.status === 'reservada' ? (
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={(e) => { e.stopPropagation(); onClick?.() }}
              style={{
                padding: '6px 10px', background: 'transparent', color: 'var(--color-muted)',
                border: 'none', borderRadius: '8px', fontSize: '11px', fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit', transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-muted)')}
            >
              Ver →
            </button>
            {onCancelar && (
              <button
                onClick={(e) => { e.stopPropagation(); onCancelar() }}
                style={{
                  padding: '6px 10px', background: 'transparent', color: '#EF4444',
                  border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', fontSize: '11px', fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                Cancelar
              </button>
            )}
          </div>
        ) : court.status === 'ocupada' ? (
          <button
            onClick={(e) => { e.stopPropagation(); onClick?.() }}
            style={{
              padding: '6px 12px', background: 'transparent', color: 'var(--color-muted)',
              border: 'none', borderRadius: '8px', fontSize: '11px', fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit', transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-muted)')}
          >
            Detalle →
          </button>
        ) : (
          <span style={{ fontSize: '18px', opacity: 0.4 }}>🔒</span>
        )}
      </div>
    </div>
  )
}
