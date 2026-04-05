'use client'

import { useState, useEffect } from 'react'
import { X, Clock, User, TrendingUp } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import { getCierresCaja, type CajaCierre } from '@/lib/supabase/queries/caja'
import { useAppStore } from '@/store/useAppStore'

interface Props {
  onClose: () => void
}

function formatDt(dt: string | null | undefined): string {
  if (!dt) return '—'
  try { return format(new Date(dt), 'd MMM yyyy · HH:mm', { locale: es }) } catch { return '—' }
}

function formatHora(dt: string | null | undefined): string {
  if (!dt) return '—'
  try { return format(new Date(dt), 'HH:mm', { locale: es }) } catch { return '—' }
}

export function ShiftHistoryPanel({ onClose }: Props) {
  const clubId = useAppStore((s) => s.clubId)
  const [cierres, setCierres] = useState<CajaCierre[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const data = await getCierresCaja(supabase, clubId ?? '')
        setCierres(data)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--color-bg2)', border: '1px solid var(--color-border)', borderRadius: '16px',
        width: '620px', maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Clock size={18} color="var(--color-lime)" />
            <div>
              <div style={{ fontSize: '16px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Historial de Cierres</div>
              <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '1px' }}>
                {cierres.length} cierres registrados
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', padding: '4px' }}>
            <X size={18} />
          </button>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--color-muted)', fontSize: '13px' }}>Cargando...</div>
          ) : cierres.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--color-muted)', fontSize: '13px' }}>Sin cierres registrados aún</div>
          ) : (
            cierres.map((c) => {
              const isExpanded = expandedId === c.id
              const difColor = c.diferencia === null ? 'var(--color-muted)' : c.diferencia > 50 ? '#f59e0b' : c.diferencia < -50 ? '#ef4444' : 'var(--color-lime)'
              const totalVentas = (c.total_efectivo ?? 0) + (c.total_tarjeta ?? 0)

              return (
                <div
                  key={c.id}
                  style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
                >
                  {/* Row */}
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : c.id)}
                    style={{ padding: '14px 24px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', transition: 'background 0.15s' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    {/* Fecha */}
                    <div style={{ minWidth: '160px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 600 }}>{formatDt(c.created_at)}</div>
                      <div style={{ fontSize: '10px', color: 'var(--color-muted)', marginTop: '1px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <User size={10} />
                        {c.turno?.empleado?.nombre ?? 'Sin empleado'}
                      </div>
                    </div>

                    {/* Total ventas */}
                    <div style={{ flex: 1, textAlign: 'right' }}>
                      <div style={{ fontSize: '10px', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Ventas</div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-lime)', fontFamily: 'var(--font-mono)' }}>
                        ${totalVentas.toFixed(2)}
                      </div>
                    </div>

                    {/* Diferencia */}
                    <div style={{ textAlign: 'right', minWidth: '80px' }}>
                      <div style={{ fontSize: '10px', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Diferencia</div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: difColor, fontFamily: 'var(--font-mono)' }}>
                        {c.diferencia === null ? '—' : `${c.diferencia >= 0 ? '+' : ''}$${c.diferencia.toFixed(2)}`}
                      </div>
                    </div>

                    {/* Estado badge */}
                    <span style={{
                      fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px',
                      padding: '3px 8px', borderRadius: '5px',
                      background: c.estado === 'revisada' ? 'rgba(108,242,13,0.1)' : 'rgba(255,255,255,0.05)',
                      color: c.estado === 'revisada' ? 'var(--color-lime)' : 'var(--color-muted)',
                    }}>
                      {c.estado === 'revisada' ? 'Revisada' : 'Cerrada'}
                    </span>

                    <span style={{ color: 'var(--color-muted)', fontSize: '11px', transition: 'transform 0.15s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>›</span>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div style={{ padding: '12px 24px 16px', background: 'rgba(0,0,0,0.1)', borderTop: '1px solid var(--color-border-subtle)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                        {[
                          { label: 'Fondo Inicial', value: `$${c.fondo_inicial.toFixed(2)}`, color: 'var(--color-text)' },
                          { label: 'Efectivo Contado', value: c.total_efectivo !== null ? `$${c.total_efectivo.toFixed(2)}` : '—', color: 'var(--color-lime)' },
                          { label: 'Tarjeta', value: c.total_tarjeta !== null ? `$${c.total_tarjeta.toFixed(2)}` : '—', color: '#60a5fa' },
                          { label: 'Diferencia', value: c.diferencia !== null ? `${c.diferencia >= 0 ? '+' : ''}$${c.diferencia.toFixed(2)}` : '—', color: difColor },
                        ].map((item) => (
                          <div key={item.label} style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border-subtle)', borderRadius: '8px', padding: '10px 12px' }}>
                            <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '3px' }}>{item.label}</div>
                            <div style={{ fontSize: '15px', fontWeight: 700, color: item.color, fontFamily: 'var(--font-mono)' }}>{item.value}</div>
                          </div>
                        ))}
                      </div>
                      {c.turno && (
                        <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--color-muted)', display: 'flex', gap: '16px' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <TrendingUp size={10} /> Turno: {formatHora(c.turno.inicio)} — {formatHora(c.turno.fin ?? undefined)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
