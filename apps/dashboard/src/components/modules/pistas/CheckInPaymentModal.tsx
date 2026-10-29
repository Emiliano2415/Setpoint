'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import type { SupabaseClient } from '@/lib/supabase/client'
import type { MetodoPago } from '@/lib/supabase/queries/caja'
import type { ReservaRow } from '@/lib/supabase/queries/pistas'
import { conceptoAlquiler, duracionReservaHoras, updateReservaEstado } from '@/lib/supabase/queries/pistas'
import { createCuenta, lineaAlquilerCancha } from '@/lib/supabase/queries/pos'
import type { CobroReserva, CuentaItem, PagoInput } from '@/lib/supabase/queries/pos'
import { SplitAccountModal } from '@/components/modules/pos/SplitAccountModal'
import type { PersonSplit, SplitMode } from '@/components/modules/pos/SplitAccountModal'
import type { TicketItem } from '@/components/modules/pos/POSPage'
import { useAppStore } from '@/store/useAppStore'

type PayMode = 'single' | 'split-payment' | 'split-account'

interface CheckInPaymentModalProps {
  open: boolean
  reserva: ReservaRow
  pistaNombre: string
  clienteNombre?: string
  cajaId: string | undefined
  supabase: SupabaseClient
  onSuccess: () => void
  onCancel: () => void
}

type PaymentOption = { value: MetodoPago; label: string; icon: string }
const TAX_RATE = 0.16

const PAYMENT_OPTIONS: PaymentOption[] = [
  { value: 'efectivo', label: 'Efectivo', icon: '💵' },
  { value: 'credito', label: 'Crédito', icon: '💳' },
  { value: 'debito', label: 'Débito', icon: '🏦' },
  { value: 'cortesia', label: 'Cortesía', icon: '🎁' },
]

function fmtTime(hhmmss: string): string {
  const [h, m] = hhmmss.split(':')
  return `${h}:${m}`
}

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n)
}

export function CheckInPaymentModal({
  open,
  reserva,
  pistaNombre,
  clienteNombre,
  cajaId,
  supabase,
  onSuccess,
  onCancel,
}: CheckInPaymentModalProps) {
  const clubId = useAppStore((s) => s.clubId)
  const [mode, setMode] = useState<PayMode | null>(null)
  const [selectedMetodo, setSelectedMetodo] = useState<MetodoPago | null>(null)
  const [splitEfectivo, setSplitEfectivo] = useState('')
  const [splitAccountOpen, setSplitAccountOpen] = useState(false)
  const [paying, setPaying] = useState(false)

  useEffect(() => {
    if (open) {
      setMode(null)
      setSelectedMetodo(null)
      setSplitEfectivo('')
      setSplitAccountOpen(false)
    }
  }, [open])

  if (!open) return null

  function selectMode(m: PayMode) {
    if (m === 'split-account') {
      setSplitAccountOpen((prev) => !prev)
      return
    }
    setMode((prev) => (prev === m ? null : m))
    setSelectedMetodo(null)
    setSplitEfectivo('')
  }

  // El cobro de la cancha es una línea sin producto con su concepto, ligada a
  // la reserva; la reserva pasa a 'checkin' en la misma transacción del cobro
  // (rpc_registrar_venta, 20261029000002_cobro_canchas.sql).
  const conceptoLinea = conceptoAlquiler(pistaNombre, duracionReservaHoras(reserva))
  const cobroReserva: CobroReserva = { reservaId: reserva.id, reservaEstado: 'checkin' }
  const clienteId = reserva.cliente_id ?? undefined

  async function handleSinglePay() {
    if (!selectedMetodo || paying) return
    setPaying(true)
    try {
      if (cajaId) {
        const items = [lineaAlquilerCancha(conceptoLinea, reserva.precio ?? 0)]
        const { error } = await createCuenta(supabase, clubId ?? '', items, selectedMetodo, clienteId, 0, cajaId, cobroReserva)
        if (error) throw error
      } else {
        // Sin turno de caja abierto: check-in sin cobro (se cobra al terminar)
        await updateReservaEstado(supabase, reserva.id, 'checkin')
      }
      toast.success('¡Check-in realizado!')
      onSuccess()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al hacer check-in')
    } finally {
      setPaying(false)
    }
  }

  async function handleSplitPay() {
    const total = reserva.precio ?? 0
    const efectivoNum = parseFloat(splitEfectivo) || 0
    const tarjeta = Math.max(0, total - efectivoNum)
    if (paying) return

    // Build pagos before acquiring lock
    const pagos: PagoInput[] = []
    if (efectivoNum > 0) pagos.push({ metodo: 'efectivo', monto: Math.min(efectivoNum, total) })
    if (tarjeta > 0) pagos.push({ metodo: 'credito', monto: tarjeta })
    if (pagos.length === 0) return  // ← moved here, before setPaying

    setPaying(true)
    try {
      const items = [lineaAlquilerCancha(conceptoLinea, total)]
      const { error } = await createCuenta(supabase, clubId ?? '', items, pagos, clienteId, 0, cajaId, cobroReserva)
      if (error) throw error

      toast.success('¡Check-in realizado! Pago dividido registrado.')
      onSuccess()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al procesar pago')
    } finally {
      setPaying(false)
    }
  }

  /** La línea de la cancha en el modal de división lleva el id de la reserva: aquí pasa a línea sin producto */
  function toCuentaItem(i: PersonSplit['items'][number]): CuentaItem {
    return i.producto_id === reserva.id
      ? { producto_id: null, nombre: i.nombre, concepto: conceptoLinea, precio_unitario: i.precio_unitario, cantidad: i.cantidad }
      : { producto_id: i.producto_id, nombre: i.nombre, precio_unitario: i.precio_unitario, cantidad: i.cantidad }
  }

  async function handleConfirmSplitAccount(splits: PersonSplit[], modo: SplitMode) {
    if (splits.length === 0) return
    setPaying(true)
    try {
      // A partes iguales es UNA cuenta con un pago por persona (como en el POS);
      // antes se creaba una cuenta por persona con la cancha completa en cada una.
      // Por persona, cada quien con lo suyo (quien no tiene líneas no paga nada).
      const cuentas: { items: CuentaItem[]; pagos: PagoInput[] | MetodoPago }[] =
        modo === 'iguales'
          ? [{ items: splits[0].items.map(toCuentaItem), pagos: splits.map((s) => ({ metodo: s.metodo, monto: s.total })) }]
          : splits
              .filter((s) => s.items.length > 0)
              .map((s) => ({ items: s.items.map(toCuentaItem), pagos: s.metodo }))
      for (const cuenta of cuentas) {
        const { error } = await createCuenta(supabase, clubId ?? '', cuenta.items, cuenta.pagos, clienteId, 0, cajaId, cobroReserva)
        if (error) throw error
      }
      toast.success('¡Check-in realizado! Cuenta dividida.')
      setSplitAccountOpen(false)
      onSuccess()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al dividir cuenta')
      throw err
    } finally {
      setPaying(false)
    }
  }

  const total = reserva.precio ?? 0
  const efectivoNum = parseFloat(splitEfectivo) || 0
  const tarjeta = Math.max(0, total - efectivoNum)
  const cambio = Math.max(0, efectivoNum - total)
  const splitPayValid = efectivoNum > 0 && efectivoNum <= total + 0.01

  // El modal de división suma IVA al precio; el de la cancha ya lo incluye,
  // así que entra sin IVA para que el total mostrado sea el precio de la reserva.
  const ticketItems: TicketItem[] = [{
    id: reserva.id,
    name: `${pistaNombre} (${fmtTime(reserva.hora_inicio)})`,
    price: (reserva.precio ?? 0) / (1 + TAX_RATE),
    qty: 1,
    category: 'cancha',
    imgClass: 'img-cancha',
    requiere_cocina: false,
  }]

  return (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1100,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onClick={(e) => {
          if (!paying && e.target === e.currentTarget) onCancel()
        }}
      >
        <div
          style={{
            background: 'var(--color-bg2)',
            border: '1px solid var(--color-border)',
            borderRadius: '16px',
            width: '400px',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '20px 24px',
              borderBottom: '1px solid var(--color-border-subtle)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div
                style={{
                  fontSize: '16px',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                Cobrar Cancha
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '2px' }}>
                Selecciona el método de pago
              </div>
            </div>
            <button
              onClick={onCancel}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-muted)',
                cursor: 'pointer',
                padding: '4px',
              }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div
            style={{
              padding: '20px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            {/* A) Info section */}
            <div
              style={{
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: '10px',
                overflow: 'hidden',
              }}
            >
              <InfoRow label="Cancha" value={pistaNombre} />
              <InfoRow label="Hora inicio" value={fmtTime(reserva.hora_inicio)} />
              {clienteNombre && <InfoRow label="Cliente" value={clienteNombre} />}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 14px',
                  borderTop: '1px solid var(--color-border-subtle)',
                }}
              >
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: 'var(--color-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.4px',
                  }}
                >
                  Total
                </span>
                <span
                  style={{
                    fontSize: '18px',
                    fontWeight: 800,
                    color: 'var(--color-lime)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {fmtCurrency(total)}
                </span>
              </div>
            </div>

            {/* B) Three action buttons */}
            <div>
              <div
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  color: 'var(--color-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  marginBottom: '8px',
                }}
              >
                Modo de Pago
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {/* Button 1 — Cobrar */}
                <button
                  style={{
                    width: '100%',
                    padding: '13px',
                    background: mode === 'single' ? 'var(--color-lime)' : 'var(--color-bg)',
                    border: `1px solid ${mode === 'single' ? 'var(--color-lime)' : 'var(--color-border)'}`,
                    borderRadius: '10px',
                    color: mode === 'single' ? 'var(--color-bg)' : 'var(--color-text)',
                    fontSize: '13px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    textTransform: 'uppercase',
                    letterSpacing: '0.3px',
                  }}
                  onClick={() => selectMode('single')}
                >
                  Cobrar {fmtCurrency(total)}
                </button>

                {/* Button 2 — Dividir Pago */}
                <button
                  style={{
                    width: '100%',
                    padding: '13px',
                    background: mode === 'split-payment' ? 'rgba(163,212,131,0.08)' : 'var(--color-bg)',
                    border: `1px solid ${mode === 'split-payment' ? 'rgba(163,212,131,0.40)' : 'var(--color-border)'}`,
                    borderRadius: '10px',
                    color: mode === 'split-payment' ? 'var(--color-lime)' : 'var(--color-muted)',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                  onClick={() => selectMode('split-payment')}
                >
                  Dividir Pago (Efectivo + Tarjeta)
                </button>

                {/* Button 3 — Dividir Cuenta */}
                <button
                  style={{
                    width: '100%',
                    padding: '13px',
                    background: 'var(--color-bg)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '10px',
                    color: 'var(--color-muted)',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                  onClick={() => selectMode('split-account')}
                >
                  Dividir Cuenta (Por Persona)
                </button>
              </div>
            </div>

            {/* C) Sub-panel: single mode */}
            {mode === 'single' && (
              <div>
                <div
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    color: 'var(--color-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    marginBottom: '10px',
                  }}
                >
                  Método de Pago
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '8px',
                  }}
                >
                  {PAYMENT_OPTIONS.map((opt) => {
                    const isSelected = selectedMetodo === opt.value
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setSelectedMetodo(opt.value)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '12px 14px',
                          background: isSelected ? 'rgba(163,212,131,0.08)' : 'var(--color-bg)',
                          border: `1px solid ${isSelected ? 'rgba(163,212,131,0.40)' : 'var(--color-border)'}`,
                          borderRadius: '10px',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          transition: 'all 0.15s',
                          textAlign: 'left',
                        }}
                      >
                        <span style={{ fontSize: '18px', lineHeight: 1 }}>{opt.icon}</span>
                        <span
                          style={{
                            fontSize: '12px',
                            fontWeight: isSelected ? 800 : 600,
                            color: isSelected ? 'var(--color-lime)' : 'var(--color-text)',
                            letterSpacing: '0.2px',
                          }}
                        >
                          {opt.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <button
                  onClick={handleSinglePay}
                  disabled={!selectedMetodo || paying}
                  style={{
                    width: '100%',
                    marginTop: '12px',
                    padding: '13px',
                    background: !selectedMetodo || paying ? 'rgba(163,212,131,0.3)' : 'var(--color-lime)',
                    border: 'none',
                    borderRadius: '10px',
                    color: 'var(--color-bg)',
                    fontSize: '13px',
                    fontWeight: 800,
                    cursor: !selectedMetodo || paying ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                    textTransform: 'uppercase',
                    letterSpacing: '0.3px',
                  }}
                >
                  {paying ? 'Procesando...' : 'Cobrar y hacer check-in'}
                </button>
              </div>
            )}

            {/* D) Sub-panel: split-payment mode */}
            {mode === 'split-payment' && (
              <div>
                <div
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    color: 'var(--color-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    marginBottom: '12px',
                  }}
                >
                  Pago Dividido
                </div>

                {/* Cash input row */}
                <div style={{ marginBottom: '10px' }}>
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: 'var(--color-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.4px',
                      marginBottom: '6px',
                    }}
                  >
                    Efectivo
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="number"
                      value={splitEfectivo}
                      onChange={(e) => setSplitEfectivo(e.target.value)}
                      placeholder="0.00"
                      style={{
                        flex: 1,
                        padding: '10px 12px',
                        background: 'var(--color-bg)',
                        border: '1px solid var(--color-border)',
                        borderRadius: '8px',
                        color: 'var(--color-text)',
                        fontSize: '14px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 600,
                        outline: 'none',
                      }}
                    />
                  </div>
                  {/* Quick-select chips */}
                  <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                    {[50, 100, 200, 500].map((v) => (
                      <button
                        key={v}
                        onClick={() => setSplitEfectivo(String(v))}
                        style={{
                          padding: '6px 10px',
                          background: 'var(--color-bg)',
                          border: '1px solid var(--color-border)',
                          borderRadius: '6px',
                          color: 'var(--color-muted)',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tarjeta row */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 0',
                    borderTop: '1px solid var(--color-border-subtle)',
                  }}
                >
                  <span style={{ fontSize: '12px', color: 'var(--color-muted)', fontWeight: 600 }}>
                    Tarjeta
                  </span>
                  <span
                    style={{
                      fontSize: '14px',
                      fontWeight: 700,
                      color: tarjeta > 0 ? 'var(--color-lime)' : 'var(--color-muted)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {fmtCurrency(tarjeta)}
                  </span>
                </div>

                {/* Cambio row (only if cambio > 0) */}
                {cambio > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 0',
                      borderTop: '1px solid var(--color-border-subtle)',
                    }}
                  >
                    <span style={{ fontSize: '12px', color: 'var(--color-muted)', fontWeight: 600 }}>
                      Cambio
                    </span>
                    <span
                      style={{
                        fontSize: '14px',
                        fontWeight: 700,
                        color: '#F59E0B',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {fmtCurrency(cambio)}
                    </span>
                  </div>
                )}

                {/* Confirm button */}
                <button
                  onClick={handleSplitPay}
                  disabled={!splitPayValid || paying}
                  style={{
                    width: '100%',
                    marginTop: '12px',
                    padding: '13px',
                    background: !splitPayValid || paying ? 'rgba(163,212,131,0.3)' : 'var(--color-lime)',
                    border: 'none',
                    borderRadius: '10px',
                    color: 'var(--color-bg)',
                    fontSize: '13px',
                    fontWeight: 800,
                    cursor: !splitPayValid || paying ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                    textTransform: 'uppercase',
                    letterSpacing: '0.3px',
                  }}
                >
                  {paying ? 'Procesando...' : 'Confirmar Pago Dividido'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* E) SplitAccountModal */}
      <SplitAccountModal
        open={splitAccountOpen}
        items={ticketItems}
        cajaId={cajaId}
        onConfirm={handleConfirmSplitAccount}
        onCancel={() => setSplitAccountOpen(false)}
      />
    </>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 14px',
        borderBottom: '1px solid var(--color-border-subtle)',
      }}
    >
      <span
        style={{
          fontSize: '11px',
          fontWeight: 700,
          color: 'var(--color-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.4px',
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>
        {value}
      </span>
    </div>
  )
}
