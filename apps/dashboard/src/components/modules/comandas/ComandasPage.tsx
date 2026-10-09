'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  getComandas,
  updateComandaEstado,
  subscribeToComandas,
  type ComandaFromDB,
  type ComandaEstado,
} from '@/lib/supabase/queries/comandas'
import { getCajaActiva } from '@/lib/supabase/queries/caja'
import { CobrarComandaModal } from './CobrarComandaModal'
import { useAppStore } from '@/store/useAppStore'
import { toast } from 'sonner'
const HIDE_AFTER_MS = 30 * 60 * 1000 // 30 minutos

function isRecentlyDelivered(comanda: ComandaFromDB): boolean {
  const ts = comanda.updated_at ?? comanda.created_at
  return Date.now() - new Date(ts).getTime() < HIDE_AFTER_MS
}

const COLUMNS: { id: ComandaEstado; title: string; color: string }[] = [
  { id: 'pendiente',  title: 'Pendiente',  color: '#EAB308' },
  { id: 'preparando', title: 'Preparando', color: '#3B82F6' },
  { id: 'listo',      title: 'Listo',      color: '#6CF20D' },
  { id: 'entregado',  title: 'Entregado',  color: 'var(--color-muted-dim)' },
  { id: 'cobrado',    title: 'Cobrado',    color: '#22C55E' },
]

const NEXT_STATUS: Record<ComandaEstado, ComandaEstado | null> = {
  pendiente:  'preparando',
  preparando: 'listo',
  listo:      'entregado',
  entregado:  null,
  cobrado:    null,
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

function getPistaName(comanda: ComandaFromDB): string {
  return comanda.cuenta_id?.reserva_id?.pista_id?.nombre ?? '—'
}

interface ComandasPageProps {
  cajaId?: string
}

export function ComandasPage({ cajaId: cajaIdProp }: ComandasPageProps = {}) {
  const clubId = useAppStore((s) => s.clubId)
  const [comandas, setComandas] = useState<ComandaFromDB[]>([])
  const [loading, setLoading] = useState(true)
  const [showAllDelivered, setShowAllDelivered] = useState(false)
  const [cobrarComanda, setCobrarComanda] = useState<ComandaFromDB | null>(null)
  const [, setTick] = useState(0)
  const [cajaIdInternal, setCajaIdInternal] = useState<string | undefined>()
  const cajaId = cajaIdProp ?? cajaIdInternal
  const supabase = useMemo(() => createClient(), [])

  const fetchComandas = useCallback(async () => {
    if (!clubId) return
    try {
      const data = await getComandas(supabase, clubId)
      setComandas(data)
    } catch (err) {
      console.error('Error cargando comandas:', err)
    } finally {
      setLoading(false)
    }
  }, [supabase, clubId])

  useEffect(() => {
    if (!clubId) return
    getCajaActiva(supabase, clubId).then((c) => setCajaIdInternal(c?.id))
  }, [supabase, clubId])

  useEffect(() => {
    if (!clubId) return
    fetchComandas()

    const channel = subscribeToComandas(supabase, clubId, () => {
      fetchComandas()
    })

    // Re-evaluar filtro de entregadas cada minuto
    const tickInterval = setInterval(() => setTick((t) => t + 1), 60_000)

    return () => {
      channel.unsubscribe()
      clearInterval(tickInterval)
    }
  }, [fetchComandas, supabase, clubId])

  const advance = async (comanda: ComandaFromDB) => {
    let next = NEXT_STATUS[comanda.estado]
    if (!next) return
    // "Entregado" es lo entregado que falta cobrar; lo ya pagado termina en "cobrado"
    if (next === 'entregado' && comanda.cuenta_id !== null) next = 'cobrado'
    const destino = next
    try {
      await updateComandaEstado(supabase, comanda.id, destino)
      // El sondeo lo traerá de nuevo; se actualiza aquí para que responda al instante
      setComandas((prev) =>
        prev.map((c) => (c.id === comanda.id ? { ...c, estado: destino } : c)),
      )
    } catch (err) {
      console.error('Error actualizando estado:', err)
      toast.error('No se pudo actualizar la comanda')
    }
  }

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 'calc(100vh - 56px)',
          color: 'var(--color-muted)',
          fontFamily: 'var(--font-mono)',
          fontSize: '13px',
        }}
      >
        Cargando comandas…
      </div>
    )
  }

  return (
    <>
    {cobrarComanda && (
      <CobrarComandaModal
        comanda={cobrarComanda}
        cajaId={cajaId}
        onClose={() => setCobrarComanda(null)}
        onSuccess={() => { setCobrarComanda(null); fetchComandas() }}
      />
    )}
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: '12px',
        padding: '24px',
        height: 'calc(100vh - 56px)',
        overflow: 'hidden',
      }}
    >
      {COLUMNS.map((col) => {
        const allColItems = comandas.filter((c) => c.estado === col.id)
        const colItems = (col.id === 'entregado' || col.id === 'cobrado') && !showAllDelivered
          ? allColItems.filter(isRecentlyDelivered)
          : allColItems
        const hiddenCount = (col.id === 'entregado' || col.id === 'cobrado') ? allColItems.length - colItems.length : 0
        return (
          <div
            key={col.id}
            style={{
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: '16px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Column Header */}
            <div
              style={{
                padding: '14px 16px',
                borderBottom: '1px solid var(--color-border-subtle)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: col.color,
                  display: 'inline-block',
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: '13px', fontWeight: 700 }}>{col.title}</span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  color: 'var(--color-muted)',
                  marginLeft: 'auto',
                }}
              >
                {colItems.length}
              </span>
              {(col.id === 'entregado' || col.id === 'cobrado') && hiddenCount > 0 && (
                <span
                  onClick={() => setShowAllDelivered((v) => !v)}
                  style={{ fontSize: '10px', color: 'var(--color-muted)', cursor: 'pointer', marginLeft: '6px', textDecoration: 'underline' }}
                >
                  {showAllDelivered ? 'Ocultar' : `+${hiddenCount}`}
                </span>
              )}
            </div>

            {/* Cards */}
            <div style={{ padding: '10px', flex: 1, overflowY: 'auto' }}>
              {colItems.map((item) => {
                const pista = getPistaName(item)
                return (
                  <div
                    key={item.id}
                    onClick={() => advance(item)}
                    style={{
                      background: 'var(--color-bg2)',
                      border: '1px solid var(--color-border-subtle)',
                      borderRadius: '12px',
                      padding: '14px',
                      marginBottom: '8px',
                      cursor: (col.id !== 'entregado' && col.id !== 'cobrado') ? 'pointer' : 'default',
                      transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      if (col.id !== 'entregado' && col.id !== 'cobrado')
                        e.currentTarget.style.borderColor = 'rgba(108,242,13,0.20)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-border-subtle)'
                    }}
                  >
                    {/* Ticket + hora */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '6px',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: 'var(--color-lime)',
                        }}
                      >
                        {item.cuenta_id?.numero_ticket ?? '—'}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--color-muted)' }}>
                        {formatTime(item.created_at)}
                      </span>
                    </div>

                    {/* Sin cobrar badge */}
                    {item.cuenta_id === null && (
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                        marginBottom: '8px',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        background: 'rgba(249,115,22,0.12)',
                        border: '1px solid rgba(249,115,22,0.30)',
                        fontSize: '10px', fontWeight: 700,
                        color: '#F97316',
                      }}>
                        ● Sin cobrar
                      </div>
                    )}

                    {/* Estación + Pista */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        marginBottom: '8px',
                      }}
                    >
                      {item.estacion && (
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '2px 7px',
                            borderRadius: '6px',
                            background: 'var(--color-bg3)',
                            color: 'var(--color-muted)',
                            letterSpacing: '0.3px',
                          }}
                        >
                          {item.estacion}
                        </span>
                      )}
                      {pista !== '—' && (
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            color: 'var(--color-text)',
                          }}
                        >
                          {pista}
                        </span>
                      )}
                    </div>

                    {/* Items */}
                    {item.comanda_items.map((ci) => (
                      <div
                        key={ci.id}
                        style={{
                          fontSize: '12px',
                          color: 'var(--color-muted)',
                          padding: '2px 0',
                        }}
                      >
                        • {ci.cantidad}x {ci.cuenta_item_id?.producto_id?.nombre ?? ci.producto_id?.nombre ?? 'Producto'}
                      </div>
                    ))}

                    {/* Cobrar button */}
                    {item.cuenta_id === null && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setCobrarComanda(item) }}
                        style={{
                          marginTop: '8px', width: '100%',
                          padding: '6px',
                          background: 'transparent',
                          border: '1px solid rgba(249,115,22,0.50)',
                          borderRadius: '7px',
                          color: '#F97316',
                          fontSize: '11px', fontWeight: 700,
                          cursor: 'pointer', fontFamily: 'inherit',
                          textTransform: 'uppercase', letterSpacing: '0.3px',
                        }}
                      >
                        Cobrar
                      </button>
                    )}

                    {/* CTA avanzar estado */}
                    {col.id !== 'entregado' && col.id !== 'cobrado' && (
                      <div
                        style={{
                          marginTop: '10px',
                          fontSize: '10px',
                          fontWeight: 700,
                          color: col.color,
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          textAlign: 'right',
                        }}
                      >
                        {col.id === 'pendiente'
                          ? '→ Preparar'
                          : col.id === 'preparando'
                            ? '→ Marcar Listo'
                            : '→ Entregar'}
                      </div>
                    )}
                  </div>
                )
              })}

              {colItems.length === 0 && (
                <div
                  style={{
                    textAlign: 'center',
                    color: 'var(--color-muted-dim)',
                    fontSize: '12px',
                    paddingTop: '24px',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  Sin comandas
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
    </>
  )
}
