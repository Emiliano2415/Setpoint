'use client'

import { useState, useEffect } from 'react'
import { X, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { conceptoAlquiler, reservaYaCobrada, updateReservaEstado } from '@/lib/supabase/queries/pistas'
import { createCuenta, lineaAlquilerCancha, type MetodoPago, type CuentaItem } from '@/lib/supabase/queries/pos'
import { toast } from 'sonner'
import type { Court } from './PistasPage'
import type { ReservaRow } from '@/lib/supabase/queries/pistas'
import type { TicketItem } from '../pos/POSPage'
import { CourtPOSModal } from './CourtPOSModal'

import { useAppStore } from '@/store/useAppStore'

// Issue 6 — moved statusColors and statusLabels to module scope
const statusColors: Record<string, string> = {
  ocupada: '#EF4444',
  disponible: '#a3d483',
  reservada: '#6366F1',
  mantenimiento: '#EAB308',
}
const statusLabels: Record<string, string> = {
  ocupada: 'En Sesión',
  disponible: 'Disponible',
  reservada: 'Reservada',
  mantenimiento: 'Mantenimiento',
}

// Issue 8 — extracted METODO_LABELS to module scope (was duplicated inside two map callbacks)
const METODO_LABELS: Record<MetodoPago, string> = {
  efectivo: '💵 Efectivo',
  credito: '💳 Crédito',
  debito: '🏦 Débito',
  cortesia: '🎁 Cortesía',
  cuenta_cliente: '👤 Cuenta',
  bono: '🎟 Bono',
}

interface Props {
  court: Court
  reserva: ReservaRow | null
  onClose: () => void
  onRefresh: () => void
  onReservar?: () => void
  onCheckIn?: (reserva: ReservaRow) => void
  cajaId?: string
}

function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function fmtTime(hhmmss: string): string {
  const [h, m] = hhmmss.split(':')
  return `${h}:${m}`
}

function fmt(n: number): string {
  return n.toFixed(2)
}

const TAX_RATE = 0.16

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Las extensiones de tiempo de CourtPOSModal no son productos del catálogo */
function esExtension(item: TicketItem): boolean {
  return item.id.startsWith('ext-')
}

export function CourtAccountModal({ court, reserva, onClose, onRefresh, onReservar, onCheckIn, cajaId }: Props) {
  const clubId = useAppStore((s) => s.clubId)
  const [updating, setUpdating] = useState(false)
  const [courtPOSOpen, setCourtPOSOpen] = useState(false)
  const [canchaPayOpen, setCanchaPayOpen] = useState(false)
  const [canchaMetodo, setCanchaMetodo] = useState<MetodoPago>('efectivo')
  const [canchaPaying, setCanchaPaying] = useState(false)
  // Consumos de la sesión (bar, tienda, extensiones): se cobran con la cancha
  const [consumos, setConsumos] = useState<TicketItem[]>([])
  // ¿La cancha ya se cobró en el check-in? Entonces al terminar no se vuelve a
  // cobrar el tiempo. Se guarda junto con la reserva consultada para no
  // arrastrar la respuesta de otra reserva.
  const [cobroReserva, setCobroReserva] = useState<{ reservaId: string; pagada: boolean } | null>(null)

  // Fix 2: Reset courtPOSOpen when reserva becomes null
  useEffect(() => {
    if (!reserva) setCourtPOSOpen(false)
  }, [reserva])

  const reservaId = reserva?.id
  const reservaEnJuego = reserva?.estado === 'checkin'
  useEffect(() => {
    if (!reservaId || !reservaEnJuego) return
    let ignore = false
    reservaYaCobrada(createClient(), reservaId)
      .then((pagada) => { if (!ignore) setCobroReserva({ reservaId, pagada }) })
      .catch(() => { if (!ignore) toast.error('No se pudo comprobar si la cancha ya está pagada') })
    return () => { ignore = true }
  }, [reservaId, reservaEnJuego])
  const tiempoPagado = cobroReserva !== null && cobroReserva.reservaId === reservaId && cobroReserva.pagada
  // Mientras no se sepa, no se cobra (podría cobrarse dos veces la cancha)
  const comprobandoCobro = reservaEnJuego && cobroReserva?.reservaId !== reservaId

  async function handleCheckin() {
    if (!reserva) return
    if (onCheckIn) {
      onCheckIn(reserva)
      onClose()
      return
    }
    setUpdating(true)
    try {
      await updateReservaEstado(createClient(), reserva.id, 'checkin')
      toast.success('¡Check-in realizado! Timer activo.')
      onRefresh()
      onClose()
    } catch {
      toast.error('Error al hacer check-in')
    } finally {
      setUpdating(false)
    }
  }

  async function handleFinalizar() {
    if (!reserva) return
    setUpdating(true)
    try {
      await updateReservaEstado(createClient(), reserva.id, 'finalizada')
      toast.success('Sesión finalizada')
      onRefresh()
      onClose()
    } catch {
      toast.error('Error al finalizar la sesión')
    } finally {
      setUpdating(false)
    }
  }

  async function handleCancelar() {
    if (!reserva) return
    setUpdating(true)
    try {
      await updateReservaEstado(createClient(), reserva.id, 'cancelada')
      toast.success('Reservación cancelada')
      onRefresh()
      onClose()
    } catch {
      toast.error('Error al cancelar')
    } finally {
      setUpdating(false)
    }
  }

  const costoTiempo = court.timer !== undefined && reserva
    ? (court.timer / 3600) * reserva.precio
    : 0

  // Lo que se cobra por tiempo: nada si ya se pagó en el check-in
  const tiempoACobrar = tiempoPagado ? 0 : round2(costoTiempo)
  // Consumos con IVA: los productos llevan precio sin IVA (como en el POS); las
  // extensiones son tiempo de cancha y su precio ya es el importe final.
  const totalConsumos = round2(consumos.reduce(
    (s, i) => s + i.price * i.qty * (esExtension(i) ? 1 : 1 + TAX_RATE),
    0,
  ))
  const totalACobrar = round2(tiempoACobrar + totalConsumos)

  function buildCanchaItem(): CuentaItem | null {
    if (!reserva || court.timer === undefined || tiempoPagado) return null
    // Issue 1 — use court.timer / 3600 directly; avoids the toFixed(4) string round-trip
    const horas = court.timer / 3600
    // Una línea sin producto: 'Pista 2 · 1.5 h' por el importe del tiempo jugado
    return lineaAlquilerCancha(conceptoAlquiler(court.name, horas), round2(costoTiempo))
  }

  function buildConsumoItems(): CuentaItem[] {
    return consumos.map((i) =>
      esExtension(i)
        ? lineaAlquilerCancha(`${court.name} · ${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`, i.price * i.qty)
        : { producto_id: i.id, nombre: i.name, precio_unitario: i.price, cantidad: i.qty },
    )
  }

  // Issue 2 — separate error handling for createCuenta and updateReservaEstado
  async function handlePagarCancha() {
    if (!reserva) return
    setCanchaPaying(true)

    const supabase = createClient()
    const canchaItem = buildCanchaItem()
    const items: CuentaItem[] = [
      ...(canchaItem ? [canchaItem] : []),
      ...buildConsumoItems(),
    ]

    // Cobro y fin de la sesión en una sola transacción (rpc_registrar_venta):
    // la cuenta queda ligada a la reserva y la reserva pasa a 'finalizada'.
    // Sin nada que cobrar solo se finaliza.
    try {
      if (items.length > 0) {
        const { error } = await createCuenta(
          supabase,
          clubId ?? '',
          items,
          canchaMetodo,
          reserva.cliente_id ?? undefined,
          0,
          cajaId,
          { reservaId: reserva.id, reservaEstado: 'finalizada' },
        )
        if (error) throw error
      } else {
        await updateReservaEstado(supabase, reserva.id, 'finalizada')
      }
      setConsumos([])
      setCanchaPayOpen(false)
      toast.success('Cancha cobrada ✓')
      onRefresh()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? `Error al registrar el cobro: ${err.message}` : 'Error al registrar el cobro')
      setCanchaPaying(false)
    }
  }

  return (
    <>
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      >
        {/* Issue 4 — added role="dialog", aria-modal, aria-label */}
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Cuenta de cancha"
          style={{
            background: 'var(--color-bg2)',
            border: '1px solid var(--color-border)',
            borderRadius: '16px',
            width: '420px',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--color-border-subtle)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            position: 'sticky', top: 0, background: 'var(--color-bg2)', zIndex: 1,
          }}>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {court.name}
              </div>
              <div style={{ fontSize: '11px', fontWeight: 700, marginTop: '4px', color: statusColors[court.status] }}>
                ● {statusLabels[court.status]}
              </div>
            </div>
            {/* Issue 7 — added type="button" */}
            <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', padding: '4px' }}>
              <X size={18} />
            </button>
          </div>

          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

            {/* DISPONIBLE */}
            {court.status === 'disponible' && (
              <>
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--color-muted)', fontSize: '13px' }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>✓</div>
                  Esta cancha está disponible para reservar o iniciar sesión.
                </div>
                {/* Issue 7 — added type="button" */}
                <button
                  type="button"
                  onClick={() => { onClose(); onReservar?.() }}
                  style={primaryBtnStyle}
                >
                  + Crear Reservación
                </button>
              </>
            )}

            {/* RESERVADA */}
            {court.status === 'reservada' && reserva && (
              <>
                <InfoRow label="Titular" value={reserva.clientes?.nombre ?? reserva.nombre_cliente ?? 'Sin asignar'} />
                <InfoRow label="Horario" value={`${fmtTime(reserva.hora_inicio)} — ${fmtTime(reserva.hora_fin)}`} />
                <InfoRow label="Tarifa" value={`$${reserva.precio} MXN / hr`} />
                {reserva.notas && <InfoRow label="Notas" value={reserva.notas} />}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
                  {/* Issue 7 — added type="button" */}
                  <button type="button" onClick={handleCancelar} disabled={updating} style={dangerBtnStyle}>
                    Cancelar Reserva
                  </button>
                  <button type="button" onClick={handleCheckin} disabled={updating} style={primaryBtnStyle}>
                    {updating ? 'Procesando...' : '▶ Check-in Ahora'}
                  </button>
                </div>
              </>
            )}

            {/* OCUPADA */}
            {court.status === 'ocupada' && (
              <>
                <InfoRow label="Titular" value={court.titular ?? 'Sin nombre'} />

                {/* Timer */}
                {court.timer !== undefined && (
                  <div style={{
                    textAlign: 'center', padding: '20px',
                    background: 'var(--color-bg)', borderRadius: '12px',
                  }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                      Tiempo Transcurrido
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-mono)', fontSize: '36px', fontWeight: 700, letterSpacing: '2px',
                      color: (court.timer / (court.maxTime ?? 3600)) >= 1 ? '#EF4444' : (court.timer / (court.maxTime ?? 3600)) >= 0.8 ? '#EAB308' : 'var(--color-lime)',
                    }}>
                      {formatTimer(court.timer)}
                    </div>
                    {reserva && (
                      <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '4px' }}>
                        {fmtTime(reserva.hora_inicio)} — {fmtTime(reserva.hora_fin)} · ${reserva.precio}/hr
                      </div>
                    )}
                  </div>
                )}

                {/* Consumos — opens fullscreen POS */}
                <div style={{
                  background: 'var(--color-bg)', borderRadius: '10px',
                  border: '1px solid var(--color-border-subtle)', overflow: 'hidden',
                }}>
                  <div style={{
                    padding: '10px 14px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Consumos
                    </span>
                    {/* Issue 7 — added type="button" */}
                    <button
                      type="button"
                      onClick={() => setCourtPOSOpen(true)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '3px',
                        padding: '3px 8px', background: 'rgba(163,212,131,0.12)',
                        border: '1px solid rgba(163,212,131,0.25)', borderRadius: '6px',
                        color: 'var(--color-lime)', fontSize: '11px', fontWeight: 700,
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      <Plus size={10} /> Agregar
                    </button>
                  </div>
                </div>

                {/* Total breakdown */}
                <div style={{
                  background: 'rgba(163,212,131,0.06)',
                  border: '1px solid rgba(163,212,131,0.15)',
                  borderRadius: '10px', overflow: 'hidden',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid rgba(163,212,131,0.10)', fontSize: '12px' }}>
                    <span style={{ color: 'var(--color-muted)' }}>Tiempo</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}>{tiempoPagado ? 'Pagado en check-in' : `$${fmt(costoTiempo)}`}</span>
                  </div>
                  {consumos.length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid rgba(163,212,131,0.10)', fontSize: '12px' }}>
                      <span style={{ color: 'var(--color-muted)' }}>Consumos ({consumos.reduce((n, i) => n + i.qty, 0)})</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}>${fmt(totalConsumos)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', fontSize: '14px', fontWeight: 800 }}>
                    <span style={{ color: 'var(--color-text)', textTransform: 'uppercase', letterSpacing: '0.3px', fontSize: '11px' }}>Total a Pagar</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-lime)', fontSize: '18px' }}>${fmt(totalACobrar)} MXN</span>
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px' }}>
                  {/* Issue 7 — added type="button" */}
                  <button type="button" onClick={handleFinalizar} disabled={updating} style={{ ...dangerBtnStyle, gridColumn: '1' }}>
                    {updating ? 'Procesando...' : '■ Finalizar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCanchaPayOpen(true)}
                    disabled={updating || comprobandoCobro}
                    style={{ ...primaryBtnStyle, gridColumn: '2' }}
                  >
                    Cobrar ${fmt(totalACobrar)}
                  </button>
                </div>
              </>
            )}

            {/* MANTENIMIENTO */}
            {court.status === 'mantenimiento' && (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--color-muted)', fontSize: '13px' }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔧</div>
                <div style={{ fontWeight: 700, color: '#EAB308', marginBottom: '6px' }}>Cancha en Mantenimiento</div>
                {court.task && court.task !== 'En mantenimiento' && (
                  <div style={{ fontSize: '12px', maxWidth: '280px', margin: '0 auto', lineHeight: 1.5 }}>{court.task}</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pay cancha modal */}
      {canchaPayOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1100,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setCanchaPayOpen(false) }}
        >
          {/* Issue 4 — added role="dialog", aria-modal, aria-label */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Cobrar cancha"
            style={{
              background: 'var(--color-bg2)',
              border: '1px solid var(--color-border)',
              borderRadius: '14px', width: '360px', padding: '24px',
              boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ fontSize: '14px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '16px' }}>
              Cobrar cancha
            </div>
            <div style={{ marginBottom: '16px', fontSize: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
                <span style={{ color: 'var(--color-muted)' }}>Tiempo de cancha</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{tiempoPagado ? 'Pagado' : `$${fmt(costoTiempo)}`}</span>
              </div>
              {consumos.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <span style={{ color: 'var(--color-muted)' }}>Consumos</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>${fmt(totalConsumos)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontWeight: 800 }}>
                <span>Total</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-lime)' }}>
                  ${fmt(totalACobrar)}
                </span>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '20px' }}>
              {/* Issue 8 — using module-scope METODO_LABELS instead of inline object */}
              {(['efectivo', 'credito', 'debito', 'cortesia'] as MetodoPago[]).map(m => (
                <button
                  type="button"
                  key={m}
                  onClick={() => setCanchaMetodo(m)}
                  style={{
                    padding: '10px 8px', borderRadius: '8px', fontFamily: 'inherit',
                    border: canchaMetodo === m ? '1.5px solid var(--color-lime)' : '1px solid var(--color-border)',
                    background: canchaMetodo === m ? 'rgba(163,212,131,0.10)' : 'var(--color-bg)',
                    color: canchaMetodo === m ? 'var(--color-lime)' : 'var(--color-muted)',
                    fontSize: '12px', fontWeight: canchaMetodo === m ? 700 : 500, cursor: 'pointer',
                  }}
                >
                  {METODO_LABELS[m]}
                </button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {/* Issue 7 — added type="button" */}
              <button
                type="button"
                onClick={() => setCanchaPayOpen(false)}
                style={{ padding: '11px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '8px', color: 'var(--color-muted)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handlePagarCancha}
                disabled={canchaPaying || comprobandoCobro}
                style={{ padding: '11px', background: canchaPaying ? 'rgba(163,212,131,0.3)' : 'var(--color-lime)', border: 'none', borderRadius: '8px', color: 'var(--color-bg)', fontSize: '12px', fontWeight: 800, cursor: canchaPaying ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
              >
                {canchaPaying ? 'Cobrando...' : `Cobrar $${fmt(totalACobrar)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {reserva && (
        <CourtPOSModal
          open={courtPOSOpen}
          court={court}
          reserva={reserva}
          items={consumos}
          onItemsChange={setConsumos}
          onClose={() => setCourtPOSOpen(false)}
          onFinalize={() => {
            setCourtPOSOpen(false)
            onRefresh()
            onClose()
          }}
        />
      )}
    </>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 14px', background: 'var(--color-bg)', borderRadius: '8px',
    }}>
      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
        {label}
      </span>
      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>
        {value}
      </span>
    </div>
  )
}

const primaryBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '13px',
  background: 'var(--color-lime)',
  border: 'none', borderRadius: '10px',
  color: 'var(--color-bg)', fontSize: '13px', fontWeight: 800,
  cursor: 'pointer', fontFamily: 'inherit',
  textTransform: 'uppercase', letterSpacing: '0.3px',
}

const dangerBtnStyle: React.CSSProperties = {
  padding: '13px',
  background: 'var(--color-bg)',
  border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px',
  color: '#EF4444', fontSize: '13px', fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit',
  textTransform: 'uppercase', letterSpacing: '0.3px',
}
