'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getTicketsDelDia, type TicketHistorialItem } from '@/lib/supabase/queries/pos'
import { X } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'

interface TicketHistoryProps {
  onClose: () => void
}

function fmtHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

function fmtMonto(n: number): string {
  return `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function TicketHistory({ onClose }: TicketHistoryProps) {
  const clubId = useAppStore((s) => s.clubId)
  const [tickets, setTickets] = useState<TicketHistorialItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    if (!clubId) return
    const supabase = createClient()
    getTicketsDelDia(supabase, clubId).then((data) => {
      setTickets(data)
      setLoading(false)
    })
  }, [clubId])

  const totalDia = tickets.reduce((sum, t) => sum + t.total, 0)

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 999,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex', justifyContent: 'flex-end',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: '400px',
        height: '100%',
        background: 'var(--color-bg2)',
        borderLeft: '1px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '20px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Historial del Día
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '2px' }}>
              {tickets.length} tickets — Total {fmtMonto(totalDia)} MXN
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', padding: '4px' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Lista */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: 'var(--color-muted)', padding: '32px 0', fontSize: '13px' }}>
              Cargando...
            </div>
          ) : tickets.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--color-muted-dim)', padding: '32px 0', fontSize: '13px' }}>
              Sin tickets cobrados hoy
            </div>
          ) : (
            tickets.map((t) => {
              const isExp = expanded === t.id
              const shortId = t.id.slice(-6).toUpperCase()
              const isSplit = t.metodo === 'dividido'
              const isCard = !isSplit && (t.metodo.includes('tarjeta') || t.metodo === 'credito' || t.metodo === 'debito')

              return (
                <div
                  key={t.id}
                  style={{
                    marginBottom: '8px',
                    background: 'var(--color-bg)',
                    border: '1px solid var(--color-border-subtle)',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    cursor: 'pointer',
                  }}
                  onClick={() => setExpanded(isExp ? null : t.id)}
                >
                  <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {/* Método badge */}
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '8px',
                      background: isSplit ? 'rgba(234,179,8,0.12)' : isCard ? 'rgba(59,130,246,0.12)' : 'rgba(108,242,13,0.10)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      {isSplit ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EAB308" strokeWidth="2">
                          <line x1="12" y1="2" x2="12" y2="22"/><rect x="2" y="5" width="9" height="14" rx="2"/><rect x="13" y="5" width="9" height="14" rx="2"/>
                        </svg>
                      ) : isCard ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2">
                          <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-lime)" strokeWidth="2">
                          <rect x="2" y="4" width="20" height="16" rx="2"/><circle cx="12" cy="12" r="3"/>
                        </svg>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text)' }}>
                        #{shortId}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--color-muted)' }}>
                        {fmtHora(t.created_at)} · {t.items.length} productos
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color: 'var(--color-lime)' }}>
                        {fmtMonto(t.total)}
                      </div>
                      <div style={{ fontSize: '10px', color: isSplit ? '#EAB308' : isCard ? '#60a5fa' : 'var(--color-lime)', fontWeight: 600 }}>
                        {isSplit ? 'Dividido' : isCard ? 'Tarjeta' : 'Efectivo'}
                      </div>
                      <div style={{
                        display: 'inline-block',
                        marginTop: '4px',
                        padding: '2px 7px',
                        borderRadius: '99px',
                        fontSize: '10px',
                        fontWeight: 700,
                        background: t.caja_id ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.06)',
                        color: t.caja_id ? '#4ade80' : 'var(--color-muted)',
                        border: `1px solid ${t.caja_id ? 'rgba(74,222,128,0.25)' : 'var(--color-border-subtle)'}`,
                      }}>
                        {t.caja_id ? 'En caja ✓' : 'Sin turno'}
                      </div>
                    </div>
                  </div>

                  {isExp && t.items.length > 0 && (
                    <div style={{ borderTop: '1px solid var(--color-border-subtle)', padding: '10px 14px' }}>
                      {t.items.map((item, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--color-muted)', padding: '3px 0' }}>
                          <span>{item.cantidad}x {item.nombre}</span>
                          <span style={{ fontFamily: 'var(--font-mono)' }}>
                            {fmtMonto((item as { subtotal?: number; precio_unitario: number; cantidad: number }).subtotal ?? item.precio_unitario * item.cantidad)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Footer stats */}
        {tickets.length > 0 && (
          <div style={{ padding: '16px', borderTop: '1px solid var(--color-border-subtle)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div style={{ textAlign: 'center', padding: '12px', background: 'var(--color-bg)', borderRadius: '10px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Tickets</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '20px', fontWeight: 700 }}>{tickets.length}</div>
            </div>
            <div style={{ textAlign: 'center', padding: '12px', background: 'var(--color-bg)', borderRadius: '10px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-lime)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Total</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 700, color: 'var(--color-lime)' }}>{fmtMonto(totalDia)}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
