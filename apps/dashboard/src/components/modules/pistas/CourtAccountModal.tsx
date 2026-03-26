'use client'

import { useState } from 'react'
import { X, Plus, Minus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { updateReservaEstado } from '@/lib/supabase/queries/pistas'
import { createCuenta, type MetodoPago, type CuentaItem } from '@/lib/supabase/queries/pos'
import type { Producto } from '@/lib/supabase/queries/pos'
import { toast } from 'sonner'
import type { Court } from './PistasPage'
import type { ReservaRow } from '@/lib/supabase/queries/pistas'
import { CourtProductPickerModal } from './CourtProductPickerModal'

// Issue 5 — moved TAX_RATE and CLUB_ID to module scope
const TAX_RATE = 0.16
const CLUB_ID = 'a1000000-0000-0000-0000-000000000001'

// Issue 6 — moved statusColors and statusLabels to module scope
const statusColors: Record<string, string> = {
  ocupada: '#EF4444',
  disponible: '#6CF20D',
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

export function CourtAccountModal({ court, reserva, onClose, onRefresh, onReservar, onCheckIn, cajaId }: Props) {
  const [updating, setUpdating] = useState(false)
  const [ticketItems, setTicketItems] = useState<(Producto & { qty: number })[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [consumosPayOpen, setConsumosPayOpen] = useState(false)
  const [consumosMetodo, setConsumosMetodo] = useState<MetodoPago>('efectivo')
  const [consumosPaying, setConsumosPaying] = useState(false)
  const [canchaPayOpen, setCanchaPayOpen] = useState(false)
  const [canchaMetodo, setCanchaMetodo] = useState<MetodoPago>('efectivo')
  const [canchaPaying, setCanchaPaying] = useState(false)
  const [incluyeConsumos, setIncluyeConsumos] = useState(false)

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

  const subtotalConsumos = ticketItems.reduce((s, i) => s + i.precio * i.qty, 0)
  const ivaConsumos = subtotalConsumos * TAX_RATE
  const totalConsumos = subtotalConsumos + ivaConsumos

  const totalCanchaBase = costoTiempo
  const totalCanchaConConsumos = costoTiempo + (incluyeConsumos ? totalConsumos : 0)

  function addToTicket(product: Producto) {
    setTicketItems(prev => {
      const existing = prev.find(i => i.id === product.id)
      if (existing) return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i)
      return [...prev, { ...product, qty: 1 }]
    })
  }

  function updateQty(id: string, delta: number) {
    setTicketItems(prev =>
      prev.map(i => i.id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i)
    )
  }

  function removeItem(id: string) {
    setTicketItems(prev => prev.filter(i => i.id !== id))
  }

  function buildCuentaItems(items: (Producto & { qty: number })[]): CuentaItem[] {
    return items.map(i => ({
      producto_id: i.id,
      nombre: i.nombre,
      precio_unitario: i.precio,
      cantidad: i.qty,
    }))
  }

  function buildCanchaItem(): CuentaItem | null {
    if (!reserva || court.timer === undefined) return null
    // Issue 1 — use court.timer / 3600 directly; avoids the toFixed(4) string round-trip
    const horas = court.timer / 3600
    return {
      producto_id: reserva.pista_id,
      nombre: `Tiempo de cancha`,
      precio_unitario: reserva.precio,
      cantidad: horas,
    }
  }

  async function handlePagarConsumos() {
    if (ticketItems.length === 0) return
    setConsumosPaying(true)
    try {
      const supabase = createClient()
      const { error } = await createCuenta(
        supabase,
        CLUB_ID,
        buildCuentaItems(ticketItems),
        consumosMetodo,
        undefined,
        0,
        cajaId,
      )
      if (error) throw error
      setTicketItems([])
      setConsumosPayOpen(false)
      toast.success('Consumos cobrados ✓')
    } catch {
      toast.error('Error al cobrar consumos')
    } finally {
      setConsumosPaying(false)
    }
  }

  // Issue 2 — separate error handling for createCuenta and updateReservaEstado
  async function handlePagarCancha() {
    if (!reserva) return
    setCanchaPaying(true)

    const supabase = createClient()
    const canchaItem = buildCanchaItem()
    const items: CuentaItem[] = [
      ...(canchaItem ? [canchaItem] : []),
      ...(incluyeConsumos ? buildCuentaItems(ticketItems) : []),
    ]

    // 1. charge
    if (items.length > 0) {
      try {
        const { error } = await createCuenta(
          supabase,
          CLUB_ID,
          items,
          canchaMetodo,
          undefined,
          0,
          cajaId,
        )
        if (error) throw error
      } catch {
        toast.error('Error al registrar el cobro')
        setCanchaPaying(false)
        return
      }
    }

    // 2. finalize session (payment already recorded — just try to update state)
    try {
      await updateReservaEstado(supabase, reserva.id, 'finalizada')
      if (incluyeConsumos) setTicketItems([])
      setCanchaPayOpen(false)
      toast.success('Cancha cobrada ✓')
      onRefresh()
      onClose()
    } catch {
      toast.error('Cobro registrado pero no se pudo finalizar la sesión — ciérrala manualmente')
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

                {/* Consumos ticket */}
                <div style={{
                  background: 'var(--color-bg)', borderRadius: '10px',
                  border: '1px solid var(--color-border-subtle)', overflow: 'hidden',
                }}>
                  <div style={{
                    padding: '10px 14px',
                    borderBottom: ticketItems.length > 0 ? '1px solid var(--color-border-subtle)' : undefined,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Consumos
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: ticketItems.length > 0 ? 'var(--color-text)' : 'var(--color-muted-dim)' }}>
                        ${fmt(subtotalConsumos)} MXN
                      </span>
                      {/* Issue 7 — added type="button" */}
                      <button
                        type="button"
                        onClick={() => setPickerOpen(true)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '3px',
                          padding: '3px 8px', background: 'rgba(108,242,13,0.12)',
                          border: '1px solid rgba(108,242,13,0.25)', borderRadius: '6px',
                          color: 'var(--color-lime)', fontSize: '11px', fontWeight: 700,
                          cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        <Plus size={10} /> Agregar
                      </button>
                    </div>
                  </div>

                  {ticketItems.length === 0 ? (
                    <div style={{ padding: '10px 14px', fontSize: '12px', color: 'var(--color-muted-dim)', fontFamily: 'var(--font-mono)' }}>
                      Sin consumos registrados
                    </div>
                  ) : (
                    <>
                      {ticketItems.map(item => (
                        <div key={item.id} style={{
                          display: 'flex', alignItems: 'center', gap: '8px',
                          padding: '8px 14px',
                          borderBottom: '1px solid var(--color-border-subtle)',
                          fontSize: '12px',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                            {/* Issue 7 — added type="button" */}
                            <button
                              type="button"
                              onClick={() => updateQty(item.id, -1)}
                              style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', padding: '2px', lineHeight: 0 }}
                            >
                              <Minus size={12} />
                            </button>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 700, minWidth: '16px', textAlign: 'center' }}>
                              {item.qty}
                            </span>
                            {/* Issue 7 — added type="button" */}
                            <button
                              type="button"
                              onClick={() => updateQty(item.id, +1)}
                              style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', padding: '2px', lineHeight: 0 }}
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                          <span style={{ flex: 1, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.nombre}
                          </span>
                          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-muted)', flexShrink: 0 }}>
                            ${fmt(item.precio * item.qty)}
                          </span>
                          {/* Issue 7 — added type="button" */}
                          <button
                            type="button"
                            onClick={() => removeItem(item.id)}
                            style={{ background: 'none', border: 'none', color: 'var(--color-muted-dim)', cursor: 'pointer', padding: '2px', lineHeight: 0, flexShrink: 0 }}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                      <div style={{ padding: '10px 14px' }}>
                        {/* Issue 7 — added type="button" */}
                        <button
                          type="button"
                          onClick={() => setConsumosPayOpen(true)}
                          style={{
                            width: '100%', padding: '8px',
                            background: 'transparent',
                            border: '1px solid rgba(108,242,13,0.30)',
                            borderRadius: '8px',
                            color: 'var(--color-lime)', fontSize: '12px', fontWeight: 700,
                            cursor: 'pointer', fontFamily: 'inherit',
                          }}
                        >
                          Cobrar consumos ${fmt(totalConsumos)} (c/IVA)
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Total breakdown */}
                <div style={{
                  background: 'rgba(108,242,13,0.06)',
                  border: '1px solid rgba(108,242,13,0.15)',
                  borderRadius: '10px', overflow: 'hidden',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid rgba(108,242,13,0.10)', fontSize: '12px' }}>
                    <span style={{ color: 'var(--color-muted)' }}>Tiempo</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}>${fmt(costoTiempo)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid rgba(108,242,13,0.10)', fontSize: '12px' }}>
                    <span style={{ color: 'var(--color-muted)' }}>Consumos</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}>${fmt(subtotalConsumos)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', fontSize: '14px', fontWeight: 800 }}>
                    <span style={{ color: 'var(--color-text)', textTransform: 'uppercase', letterSpacing: '0.3px', fontSize: '11px' }}>Total a Pagar</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-lime)', fontSize: '18px' }}>${fmt(costoTiempo + subtotalConsumos)} MXN</span>
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
                    onClick={() => { setIncluyeConsumos(false); setCanchaPayOpen(true) }}
                    disabled={updating}
                    style={{ ...primaryBtnStyle, gridColumn: '2' }}
                  >
                    Cobrar ${fmt(costoTiempo)}
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

      {/* Pay consumos modal */}
      {consumosPayOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1100,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setConsumosPayOpen(false) }}
        >
          {/* Issue 4 — added role="dialog", aria-modal, aria-label */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Cobrar consumos"
            style={{
              background: 'var(--color-bg2)',
              border: '1px solid var(--color-border)',
              borderRadius: '14px', width: '360px', padding: '24px',
              boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ fontSize: '14px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
              Cobrar consumos
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginBottom: '20px' }}>
              {ticketItems.length} producto{ticketItems.length !== 1 ? 's' : ''} · ${fmt(totalConsumos)} MXN (c/IVA)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '20px' }}>
              {/* Issue 8 — using module-scope METODO_LABELS instead of inline object */}
              {(['efectivo', 'credito', 'debito', 'cortesia'] as MetodoPago[]).map(m => (
                <button
                  type="button"
                  key={m}
                  onClick={() => setConsumosMetodo(m)}
                  style={{
                    padding: '10px 8px', borderRadius: '8px', fontFamily: 'inherit',
                    border: consumosMetodo === m ? '1.5px solid var(--color-lime)' : '1px solid var(--color-border)',
                    background: consumosMetodo === m ? 'rgba(108,242,13,0.10)' : 'var(--color-bg)',
                    color: consumosMetodo === m ? 'var(--color-lime)' : 'var(--color-muted)',
                    fontSize: '12px', fontWeight: consumosMetodo === m ? 700 : 500, cursor: 'pointer',
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
                onClick={() => setConsumosPayOpen(false)}
                style={{ padding: '11px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '8px', color: 'var(--color-muted)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handlePagarConsumos}
                disabled={consumosPaying}
                style={{ padding: '11px', background: consumosPaying ? 'rgba(108,242,13,0.3)' : 'var(--color-lime)', border: 'none', borderRadius: '8px', color: 'var(--color-bg)', fontSize: '12px', fontWeight: 800, cursor: consumosPaying ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
              >
                {consumosPaying ? 'Cobrando...' : `Cobrar $${fmt(totalConsumos)}`}
              </button>
            </div>
          </div>
        </div>
      )}

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
            {ticketItems.length > 0 && (
              <div
                onClick={() => setIncluyeConsumos(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 12px', marginBottom: '16px',
                  background: incluyeConsumos ? 'rgba(108,242,13,0.06)' : 'var(--color-bg)',
                  border: `1px solid ${incluyeConsumos ? 'rgba(108,242,13,0.20)' : 'var(--color-border)'}`,
                  borderRadius: '8px', cursor: 'pointer',
                }}
              >
                <div style={{
                  width: '28px', height: '16px', borderRadius: '8px',
                  background: incluyeConsumos ? 'var(--color-lime)' : 'var(--color-border)',
                  position: 'relative', flexShrink: 0, transition: 'background 0.2s',
                }}>
                  <div style={{
                    position: 'absolute', top: '2px',
                    left: incluyeConsumos ? '14px' : '2px',
                    width: '12px', height: '12px', borderRadius: '50%',
                    background: incluyeConsumos ? 'var(--color-bg)' : 'var(--color-muted-dim)',
                    transition: 'left 0.2s',
                  }} />
                </div>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: incluyeConsumos ? 'var(--color-lime)' : 'var(--color-text)' }}>
                    Incluir consumos
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--color-muted-dim)', marginTop: '1px' }}>
                    {ticketItems.map(i => `${i.nombre} ×${i.qty}`).join(', ')}
                  </div>
                </div>
                <div style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, color: incluyeConsumos ? 'var(--color-lime)' : 'var(--color-muted)', flexShrink: 0 }}>
                  +${fmt(totalConsumos)}
                </div>
              </div>
            )}
            <div style={{ marginBottom: '16px', fontSize: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
                <span style={{ color: 'var(--color-muted)' }}>Tiempo de cancha</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>${fmt(costoTiempo)}</span>
              </div>
              {incluyeConsumos && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <span style={{ color: 'var(--color-muted)' }}>Consumos (c/IVA)</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>${fmt(totalConsumos)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontWeight: 800 }}>
                <span>Total</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-lime)' }}>
                  ${fmt(incluyeConsumos ? totalCanchaConConsumos : totalCanchaBase)}
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
                    background: canchaMetodo === m ? 'rgba(108,242,13,0.10)' : 'var(--color-bg)',
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
                disabled={canchaPaying}
                style={{ padding: '11px', background: canchaPaying ? 'rgba(108,242,13,0.3)' : 'var(--color-lime)', border: 'none', borderRadius: '8px', color: 'var(--color-bg)', fontSize: '12px', fontWeight: 800, cursor: canchaPaying ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
              >
                {canchaPaying ? 'Cobrando...' : `Cobrar $${fmt(incluyeConsumos ? totalCanchaConConsumos : totalCanchaBase)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      <CourtProductPickerModal
        open={pickerOpen}
        onAdd={addToTicket}
        onClose={() => setPickerOpen(false)}
      />
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
