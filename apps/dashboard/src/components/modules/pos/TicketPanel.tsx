'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import type { TicketItem } from './POSPage'
import { Minus, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { createCuenta, type MetodoPago, type PagoInput } from '@/lib/supabase/queries/pos'
import { createComanda, updateComanda } from '@/lib/supabase/queries/comandas'
import { SplitAccountModal, type PersonSplit } from './SplitAccountModal'
import { getDescuentosActivos, type DescuentoRegla } from '@/lib/supabase/queries/descuentos'
import { getCajaActiva } from '@/lib/supabase/queries/caja'
import { useAppStore } from '@/store/useAppStore'
import { toast } from 'sonner'

const TAX_RATE = 0.16

interface TicketPanelProps {
  items: TicketItem[]
  onUpdateQty: (id: string, delta: number) => void
  onRemove: (id: string) => void
  onClear?: () => void
  onHistoryOpen?: () => void
}

type PayMode = 'single' | 'split'

export function TicketPanel({ items, onUpdateQty, onRemove, onClear, onHistoryOpen }: TicketPanelProps) {
  const clubId = useAppStore((s) => s.clubId)
  const supabase = useMemo(() => createClient(), [])
  const [discountRules, setDiscountRules] = useState<DescuentoRegla[]>([])
  const [activeRuleId, setActiveRuleId] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)
  const [cajaId, setCajaId] = useState<string | null | undefined>()

  useEffect(() => {
    if (!clubId) return
    getDescuentosActivos(supabase, clubId)
      .then(setDiscountRules)
      .catch(() => {})
  }, [supabase, clubId])

  useEffect(() => {
    if (!clubId) return
    getCajaActiva(supabase, clubId)
      .then(c => setCajaId(c?.id ?? null))
      .catch(() => console.warn('[TicketPanel] No se pudo verificar caja activa'))
  }, [supabase, clubId])
  const [ticketId, setTicketId] = useState('#SP-0000')
  // Modal de pago simple
  const [payModal, setPayModal] = useState<{ open: boolean; metodo: MetodoPago }>({ open: false, metodo: 'efectivo' })
  const [recibido, setRecibido] = useState('')
  const recibidoRef = useRef<HTMLInputElement>(null)
  // Lo que este ticket ya mandó a cocina: cantidad por producto y las comandas creadas
  const [enviado, setEnviado] = useState<Record<string, number>>({})
  const [comandaIds, setComandaIds] = useState<string[]>([])
  const [enviandoComanda, setEnviandoComanda] = useState(false)
  // Modal de pago dividido
  const [splitOpen, setSplitOpen] = useState(false)
  const [splitAccountOpen, setSplitAccountOpen] = useState(false)
  const [splitEfectivo, setSplitEfectivo] = useState('')
  const splitEfectivoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTicketId(`#SP-${Math.floor(Math.random() * 9000 + 1000)}`)
  }, [])

  useEffect(() => {
    if (payModal.open && payModal.metodo === 'efectivo') {
      setTimeout(() => recibidoRef.current?.focus(), 50)
    }
  }, [payModal.open, payModal.metodo])

  useEffect(() => {
    if (splitOpen) {
      setSplitEfectivo('')
      setTimeout(() => splitEfectivoRef.current?.focus(), 50)
    }
  }, [splitOpen])

  const activeRule = discountRules.find((r) => r.id === activeRuleId) ?? null

  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0)
  const discount = activeRule
    ? activeRule.tipo === 'porcentaje'
      ? subtotal * (activeRule.valor / 100)
      : Math.min(activeRule.valor, subtotal)
    : 0
  const base = subtotal - discount
  const tax = base * TAX_RATE
  const total = base + tax
  const itemsParaCocina = items.filter(i => i.requiere_cocina)
  // Lo que falta por enviar: productos nuevos o cantidades añadidas después de un envío
  const pendientesCocina = itemsParaCocina
    .map(i => ({ ...i, qty: i.qty - (enviado[i.id] ?? 0) }))
    .filter(i => i.qty > 0)

  // Un ticket vacío es un ticket nuevo: se olvida lo enviado con el anterior
  if (items.length === 0 && (comandaIds.length > 0 || Object.keys(enviado).length > 0)) {
    setEnviado({})
    setComandaIds([])
  }

  const recibidoNum = parseFloat(recibido) || 0
  const cambio = recibidoNum - total

  // Split payment calculations
  const splitEfectivoNum = parseFloat(splitEfectivo) || 0
  const splitTarjeta = Math.max(0, total - splitEfectivoNum)
  const splitCambio = splitEfectivoNum > total ? splitEfectivoNum - total : 0
  const splitValid = splitEfectivoNum >= 0 && splitEfectivoNum <= total + 0.01

  function openPayModal(metodo: MetodoPago) {
    if (items.length === 0) return
    if (!cajaId) {
      toast.error('No hay turno activo. Abre el turno en Caja antes de cobrar.')
      return
    }
    setRecibido('')
    setPayModal({ open: true, metodo })
  }

  function openSplitModal() {
    if (items.length === 0) return
    if (!cajaId) {
      toast.error('No hay turno activo. Abre el turno en Caja antes de cobrar.')
      return
    }
    setSplitOpen(true)
  }

  function buildCuentaItems() {
    return items.map((i) => ({
      producto_id: i.id,
      nombre: i.name,
      precio_unitario: i.price,
      cantidad: i.qty,
    }))
  }

  function resetTicket() {
    onClear?.()
    setTicketId(`#SP-${Math.floor(Math.random() * 9000 + 1000)}`)
    setEnviado({})
    setComandaIds([])
  }

  /** Crea una comanda con lo pendiente de cocina. Devuelve su id, o null si falló. */
  async function crearComandaPendiente(cuentaId?: string): Promise<string | null> {
    const { data, error } = await createComanda(
      supabase,
      clubId ?? '',
      pendientesCocina.map(i => ({
        producto_id: i.id,
        nombre: i.name,
        cantidad: i.qty,
        precio_unitario: i.price,
      })),
      undefined,
      cuentaId,
    )
    return error || !data ? null : data.id
  }

  async function handleEnviarACocina() {
    if (pendientesCocina.length === 0) return
    setEnviandoComanda(true)
    const id = await crearComandaPendiente()
    setEnviandoComanda(false)
    if (!id) {
      toast.error('Error al enviar a cocina')
      return
    }
    setEnviado(prev => ({ ...prev, ...Object.fromEntries(itemsParaCocina.map(i => [i.id, i.qty])) }))
    setComandaIds(prev => [...prev, id])
    toast.success('Comanda enviada a cocina ✓')
  }

  /**
   * Tras cobrar: lo enviado antes deja de estar "sin cobrar" y lo que nunca se
   * envió sale ahora hacia cocina. Devuelve el texto que se añade al aviso del pago.
   */
  async function cocinaTrasCobrar(cuentaId: string): Promise<string> {
    if (comandaIds.length === 0 && pendientesCocina.length === 0) return ''
    try {
      await Promise.all(comandaIds.map(id => updateComanda(supabase, id, { cuenta_id: cuentaId })))
      if (pendientesCocina.length > 0 && !(await crearComandaPendiente(cuentaId))) throw new Error('comanda')
      return pendientesCocina.length > 0 ? ' · Comanda enviada a cocina' : ''
    } catch {
      // El cobro ya está hecho; lo que falló es solo el aviso a cocina
      toast.error('El pago se registró, pero la comanda no llegó a cocina. Avisa a cocina.')
      return ''
    }
  }

  async function handleConfirmPay() {
    if (payModal.metodo === 'efectivo' && recibidoNum < total) {
      toast.error('El monto recibido es menor al total')
      return
    }
    setPaying(true)
    const { data, error } = await createCuenta(supabase, clubId ?? '', buildCuentaItems(), payModal.metodo, undefined, discount, cajaId ?? undefined)
    const cocina = error || !data ? '' : await cocinaTrasCobrar(data.id)
    setPaying(false)
    if (error || !data) {
      toast.error('Error al procesar el pago')
    } else {
      setPayModal({ open: false, metodo: 'efectivo' })
      toast.success(
        (payModal.metodo === 'efectivo'
          ? `Pago en efectivo — Cambio: $${cambio.toFixed(2)} MXN`
          : 'Pago con tarjeta procesado') + cocina
      )
      resetTicket()
    }
  }

  async function handleConfirmSplit() {
    if (!splitValid || splitEfectivoNum < 0) return
    const pagos: PagoInput[] = []
    if (splitEfectivoNum > 0) pagos.push({ metodo: 'efectivo', monto: Math.min(splitEfectivoNum, total) })
    if (splitTarjeta > 0) pagos.push({ metodo: 'credito', monto: splitTarjeta })
    if (pagos.length === 0) return
    setPaying(true)
    const { data, error } = await createCuenta(supabase, clubId ?? '', buildCuentaItems(), pagos, undefined, discount, cajaId ?? undefined)
    const cocina = error || !data ? '' : await cocinaTrasCobrar(data.id)
    setPaying(false)
    if (error || !data) {
      toast.error('Error al procesar el pago')
    } else {
      setSplitOpen(false)
      const cambioStr = splitCambio > 0 ? ` — Cambio efectivo: $${splitCambio.toFixed(2)}` : ''
      toast.success(`Pago dividido — Efectivo: $${Math.min(splitEfectivoNum, total).toFixed(2)} · Tarjeta: $${splitTarjeta.toFixed(2)}${cambioStr}${cocina}`)
      resetTicket()
    }
  }

  async function handleConfirmSplitAccount(splits: PersonSplit[]) {
    let allOk = true
    // La comanda es una sola: queda ligada a la primera de las cuentas
    let primeraCuentaId: string | null = null
    setPaying(true)
    for (const split of splits) {
      const { data, error } = await createCuenta(
        supabase,
        clubId ?? '',
        split.items,
        split.metodo,
        undefined,
        0,
        cajaId ?? undefined,
      )
      if (error || !data) {
        toast.error(`Error al cobrar a ${split.nombre}`)
        allOk = false
        break
      }
      primeraCuentaId ??= data.id
    }
    const cocina = allOk && primeraCuentaId ? await cocinaTrasCobrar(primeraCuentaId) : ''
    setPaying(false)
    if (allOk) {
      setSplitAccountOpen(false)
      toast.success(`Cuenta dividida entre ${splits.length} persona${splits.length !== 1 ? 's' : ''}${cocina}`)
      resetTicket()
    }
  }

  return (
    <div
      style={{
        background: 'var(--color-bg2)',
        borderLeft: '1px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Modal de pago dividido */}
      {splitOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setSplitOpen(false) }}
        >
          <div style={{
            background: 'var(--color-bg2)',
            border: '1px solid var(--color-border)',
            borderRadius: '16px',
            padding: '28px',
            width: '380px',
            boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
          }}>
            <div style={{ fontSize: '16px', fontWeight: 800, marginBottom: '4px' }}>
              Pago Dividido
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-muted)', marginBottom: '20px' }}>
              {ticketId} — Efectivo + Tarjeta
            </div>

            {/* Total a cobrar */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '14px 16px', background: 'var(--color-bg)',
              borderRadius: '10px', marginBottom: '20px',
            }}>
              <span style={{ fontSize: '13px', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Total a Cobrar</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '22px', fontWeight: 700, color: 'var(--color-lime)' }}>
                ${total.toFixed(2)}
              </span>
            </div>

            {/* Efectivo */}
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><circle cx="12" cy="12" r="3"/></svg>
                Monto en Efectivo
              </div>
              <input
                ref={splitEfectivoRef}
                type="number"
                value={splitEfectivo}
                onChange={(e) => setSplitEfectivo(e.target.value)}
                placeholder="0.00"
                min="0"
                style={{
                  width: '100%', padding: '12px 14px',
                  background: 'var(--color-bg)',
                  border: `1px solid ${splitEfectivoNum > total + 0.01 ? 'rgba(234,179,8,0.5)' : 'var(--color-border)'}`,
                  borderRadius: '10px', color: 'var(--color-text)',
                  fontSize: '18px', fontFamily: 'var(--font-mono)', fontWeight: 700,
                  outline: 'none', boxSizing: 'border-box', marginBottom: '8px',
                }}
              />
              {/* Atajos rápidos */}
              <div style={{ display: 'flex', gap: '6px' }}>
                {[50, 100, 200, 500].map((v) => (
                  <button
                    key={v}
                    onClick={() => setSplitEfectivo(String(v))}
                    style={{
                      flex: 1, padding: '7px 4px', background: 'var(--color-bg)',
                      border: `1px solid ${splitEfectivoNum === v ? 'var(--color-lime)' : 'var(--color-border)'}`,
                      borderRadius: '7px', color: splitEfectivoNum === v ? 'var(--color-lime)' : 'var(--color-muted)',
                      fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    ${v}
                  </button>
                ))}
              </div>
            </div>

            {/* Tarjeta (auto) */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                Monto en Tarjeta
              </div>
              <div style={{
                padding: '12px 16px', background: 'var(--color-bg)',
                border: '1px solid var(--color-border)', borderRadius: '10px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: '12px', color: 'var(--color-muted)' }}>Auto-calculado</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 700, color: splitTarjeta > 0 ? 'var(--color-text)' : 'var(--color-muted-dim)' }}>
                  ${splitTarjeta.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Cambio o pendiente */}
            {splitEfectivo && (
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 14px', marginBottom: '16px',
                background: splitCambio > 0 ? 'rgba(108,242,13,0.06)' : 'transparent',
                border: `1px solid ${splitCambio > 0 ? 'rgba(108,242,13,0.20)' : 'var(--color-border-subtle)'}`,
                borderRadius: '10px',
              }}>
                <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px', color: 'var(--color-muted)' }}>
                  {splitCambio > 0 ? 'Cambio en Efectivo' : 'Cubierto por Tarjeta'}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 700, color: splitCambio > 0 ? 'var(--color-lime)' : 'var(--color-muted)' }}>
                  {splitCambio > 0 ? `$${splitCambio.toFixed(2)}` : `$${splitTarjeta.toFixed(2)}`}
                </span>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button
                onClick={() => setSplitOpen(false)}
                style={{
                  padding: '13px', background: 'var(--color-bg)',
                  border: '1px solid var(--color-border)', borderRadius: '10px',
                  color: 'var(--color-muted)', fontSize: '13px', fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmSplit}
                disabled={paying || !splitEfectivo || !splitValid}
                style={{
                  padding: '13px',
                  background: (paying || !splitEfectivo || !splitValid) ? 'rgba(108,242,13,0.3)' : 'var(--color-lime)',
                  border: 'none', borderRadius: '10px',
                  color: 'var(--color-bg)', fontSize: '13px', fontWeight: 800,
                  cursor: (paying || !splitEfectivo || !splitValid) ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.3px',
                }}
              >
                {paying ? 'Procesando...' : 'Confirmar Pago'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de dividir cuenta */}
      {splitAccountOpen && (
        <SplitAccountModal
          open={splitAccountOpen}
          items={items}
          cajaId={cajaId}
          onConfirm={handleConfirmSplitAccount}
          onCancel={() => setSplitAccountOpen(false)}
        />
      )}

      {/* Modal de pago */}
      {payModal.open && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setPayModal({ ...payModal, open: false }) }}
        >
          <div style={{
            background: 'var(--color-bg2)',
            border: '1px solid var(--color-border)',
            borderRadius: '16px',
            padding: '28px',
            width: '360px',
            boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
          }}>
            <div style={{ fontSize: '16px', fontWeight: 800, marginBottom: '4px' }}>
              {payModal.metodo === 'efectivo' ? 'Pago en Efectivo' : payModal.metodo === 'credito' ? 'Pago con Tarjeta de Crédito' : 'Pago con Tarjeta de Débito'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-muted)', marginBottom: '20px' }}>
              {ticketId}
            </div>

            {/* Total a cobrar */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '14px 16px', background: 'var(--color-bg)',
              borderRadius: '10px', marginBottom: '16px',
            }}>
              <span style={{ fontSize: '13px', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Total a Cobrar</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '22px', fontWeight: 700, color: 'var(--color-lime)' }}>
                ${total.toFixed(2)}
              </span>
            </div>

            {payModal.metodo === 'efectivo' && (
              <>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                  Monto Recibido
                </div>
                <input
                  ref={recibidoRef}
                  type="number"
                  value={recibido}
                  onChange={(e) => setRecibido(e.target.value)}
                  placeholder={`Mínimo $${total.toFixed(2)}`}
                  onKeyDown={(e) => { if (e.key === 'Enter' && recibidoNum >= total) handleConfirmPay() }}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    background: 'var(--color-bg)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '10px',
                    color: 'var(--color-text)',
                    fontSize: '18px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    outline: 'none',
                    boxSizing: 'border-box',
                    marginBottom: '12px',
                  }}
                />
                {/* Cambio */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 14px',
                  background: cambio >= 0 && recibido ? 'rgba(108,242,13,0.06)' : 'transparent',
                  border: `1px solid ${cambio >= 0 && recibido ? 'rgba(108,242,13,0.20)' : 'var(--color-border-subtle)'}`,
                  borderRadius: '10px', marginBottom: '20px',
                  transition: 'all 0.2s',
                }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px', color: 'var(--color-muted)' }}>Cambio</span>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: '20px', fontWeight: 700,
                    color: cambio >= 0 && recibido ? 'var(--color-lime)' : 'var(--color-muted-dim)',
                  }}>
                    {recibido ? `$${Math.max(0, cambio).toFixed(2)}` : '—'}
                  </span>
                </div>
                {/* Atajos rápidos */}
                <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
                  {[Math.ceil(total / 100) * 100, Math.ceil(total / 500) * 500, Math.ceil(total / 1000) * 1000].filter((v, i, a) => a.indexOf(v) === i).slice(0, 3).map((v) => (
                    <button
                      key={v}
                      onClick={() => setRecibido(String(v))}
                      style={{
                        flex: 1, padding: '8px', background: 'var(--color-bg)',
                        border: `1px solid ${recibidoNum === v ? 'var(--color-lime)' : 'var(--color-border)'}`,
                        borderRadius: '8px', color: recibidoNum === v ? 'var(--color-lime)' : 'var(--color-text)',
                        fontSize: '12px', fontFamily: 'var(--font-mono)', fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      ${v}
                    </button>
                  ))}
                </div>
              </>
            )}

            {payModal.metodo !== 'efectivo' && (
              <div style={{ fontSize: '13px', color: 'var(--color-muted)', textAlign: 'center', padding: '16px 0', marginBottom: '16px' }}>
                Presenta la terminal al cliente para que realice el pago con tarjeta.
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button
                onClick={() => setPayModal({ ...payModal, open: false })}
                style={{
                  padding: '13px', background: 'var(--color-bg)',
                  border: '1px solid var(--color-border)', borderRadius: '10px',
                  color: 'var(--color-muted)', fontSize: '13px', fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmPay}
                disabled={paying || (payModal.metodo === 'efectivo' && (!recibido || recibidoNum < total))}
                style={{
                  padding: '13px',
                  background: (paying || (payModal.metodo === 'efectivo' && (!recibido || recibidoNum < total)))
                    ? 'rgba(108,242,13,0.3)' : 'var(--color-lime)',
                  border: 'none', borderRadius: '10px',
                  color: 'var(--color-bg)', fontSize: '13px', fontWeight: 800,
                  cursor: (paying || (payModal.metodo === 'efectivo' && (!recibido || recibidoNum < total))) ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.3px',
                }}
              >
                {paying ? 'Procesando...' : 'Confirmar Pago'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Caja warning */}
      {cajaId === null && (
        <div style={{ background: '#854d0e20', border: '1px solid #854d0e', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#fbbf24', margin: '12px 20px 0' }}>
          Sin turno activo — los cobros no se registran en caja
        </div>
      )}

      {/* Header */}
      <div style={{ padding: '20px', borderBottom: '1px solid var(--color-border-subtle)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '15px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-text)' }}>
            Ticket Actual
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              onClick={onHistoryOpen}
              style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-muted)', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.5px', transition: 'color 0.15s' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-lime)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-muted)')}
            >
              Historial
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--color-lime)' }}>
              {ticketId}
            </span>
          </div>
        </div>

        {/* Descuento rules */}
        {discountRules.length > 0 && (
          <div style={{ marginTop: '12px' }}>
            {discountRules.length === 1 ? (
              /* Single rule — toggle UI */
              <div
                onClick={() => setActiveRuleId(activeRuleId ? null : discountRules[0].id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 12px',
                  background: activeRuleId ? 'rgba(108,242,13,0.06)' : 'var(--color-bg)',
                  border: `1px solid ${activeRuleId ? 'rgba(108,242,13,0.20)' : 'var(--color-border)'}`,
                  borderRadius: '8px', cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                <div style={{
                  width: '32px', height: '32px', borderRadius: '50%',
                  background: activeRuleId ? 'rgba(108,242,13,0.15)' : 'rgba(255,255,255,0.04)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: activeRuleId ? 'var(--color-lime)' : 'var(--color-muted)',
                  flexShrink: 0, transition: 'all 0.15s',
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text)' }}>
                    {activeRuleId ? `${discountRules[0].nombre} activo` : `Aplicar ${discountRules[0].nombre}`}
                  </div>
                  <div style={{ fontSize: '10px', color: activeRuleId ? 'var(--color-lime)' : 'var(--color-muted-dim)' }}>
                    {activeRuleId
                      ? discountRules[0].tipo === 'porcentaje' ? `−${discountRules[0].valor}% aplicado` : `−$${discountRules[0].valor} aplicado`
                      : discountRules[0].tipo === 'porcentaje' ? `Clic para activar −${discountRules[0].valor}%` : `Clic para activar −$${discountRules[0].valor}`
                    }
                  </div>
                </div>
                <div style={{
                  width: '36px', height: '20px', borderRadius: '10px',
                  background: activeRuleId ? 'var(--color-lime)' : 'var(--color-border)',
                  position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                }}>
                  <div style={{
                    position: 'absolute', top: '2px',
                    left: activeRuleId ? '18px' : '2px',
                    width: '16px', height: '16px', borderRadius: '50%',
                    background: activeRuleId ? 'var(--color-bg)' : 'var(--color-muted)',
                    transition: 'left 0.2s',
                  }} />
                </div>
              </div>
            ) : (
              /* Multiple rules — chip selector */
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                  Aplicar Descuento
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {discountRules.map((r) => {
                    const isActive = activeRuleId === r.id
                    return (
                      <button
                        key={r.id}
                        onClick={() => setActiveRuleId(isActive ? null : r.id)}
                        style={{
                          padding: '5px 10px', borderRadius: '7px', border: '1px solid',
                          borderColor: isActive ? 'var(--color-lime)' : 'var(--color-border)',
                          background: isActive ? 'rgba(108,242,13,0.08)' : 'var(--color-bg)',
                          color: isActive ? 'var(--color-lime)' : 'var(--color-muted)',
                          fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                          transition: 'all 0.15s',
                        }}
                      >
                        {r.nombre}{' '}
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                          {r.tipo === 'porcentaje' ? `${r.valor}%` : `$${r.valor}`}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Items */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
        {items.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '120px',
              gap: '8px',
              color: 'var(--color-muted-dim)',
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4">
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>
            </svg>
            <span style={{ fontSize: '13px' }}>Agrega productos al ticket</span>
          </div>
        ) : (
          items.map((item) => (
            <TicketItemRow key={item.id} item={item} onUpdateQty={onUpdateQty} onRemove={onRemove} />
          ))
        )}
      </div>

      {/* Totales */}
      <div style={{ padding: '16px 20px', borderTop: '1px solid var(--color-border)' }}>
        <TotalRow label="Subtotal" value={`$ ${subtotal.toFixed(2)} MXN`} />
        {activeRule && discount > 0 && (
          <TotalRow
            label={`${activeRule.nombre} (${activeRule.tipo === 'porcentaje' ? `${activeRule.valor}%` : `$${activeRule.valor}`})`}
            value={`−$ ${discount.toFixed(2)} MXN`}
            accent="lime"
          />
        )}
        <TotalRow label="IVA (16%)" value={`$ ${tax.toFixed(2)} MXN`} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: '10px', marginTop: '6px', borderTop: '1px solid var(--color-border)' }}>
          <span style={{ fontSize: '14px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-text)' }}>Total</span>
          <span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '26px', fontWeight: 700, color: 'var(--color-lime)' }}>
              $ {total.toFixed(2)}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--color-muted)', marginLeft: '4px' }}>MXN</span>
          </span>
        </div>
      </div>

      {/* Kitchen send section */}
        {itemsParaCocina.length > 0 && (
          <div style={{
            marginBottom: '12px',
            padding: '10px 14px',
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: '10px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
            margin: '0 20px 12px',
          }}>
            <span style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
              {pendientesCocina.length > 0
                ? `🍳 ${pendientesCocina.length} item${pendientesCocina.length !== 1 ? 's' : ''} para cocina · sale al cobrar`
                : '🍳 Todo enviado a cocina'}
            </span>
            <button
              type="button"
              onClick={handleEnviarACocina}
              disabled={pendientesCocina.length === 0 || enviandoComanda}
              style={{
                padding: '5px 12px',
                background: 'transparent',
                border: pendientesCocina.length === 0
                  ? '1px solid var(--color-border-subtle)'
                  : '1px solid var(--color-lime)',
                borderRadius: '6px',
                color: pendientesCocina.length === 0 ? 'var(--color-muted)' : 'var(--color-lime)',
                fontSize: '11px', fontWeight: 700,
                cursor: (pendientesCocina.length === 0 || enviandoComanda) ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              {enviandoComanda ? 'Enviando...' : pendientesCocina.length === 0 ? '✓ Enviado' : 'Enviar ahora'}
            </button>
          </div>
        )}
        {/* Sin productos de cocina no hay nada que enviar: se dice, para que no parezca un fallo */}
        {items.length > 0 && itemsParaCocina.length === 0 && (
          <div style={{ margin: '0 20px 12px', fontSize: '11px', color: 'var(--color-muted-dim)', lineHeight: 1.4 }}>
            Este ticket no genera comanda: ningún producto está marcado para cocina (se marca en Gestionar menú).
          </div>
        )}

      {/* Botones de pago */}
      <div style={{ padding: '0 20px 12px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
        <PayButton icon="cash" label="Efectivo" onClick={() => openPayModal('efectivo')} disabled={items.length === 0} />
        <PayButton icon="card" label="Tarjeta" onClick={() => openPayModal('credito')} disabled={items.length === 0} />
        <PayButton icon="split" label="Dividir Pago" onClick={openSplitModal} disabled={items.length === 0} />
        <PayButton icon="split" label="Dividir Cuenta" onClick={() => setSplitAccountOpen(true)} disabled={items.length === 0} />
      </div>

      {/* Botón PAY principal */}
      <div style={{ padding: '0 20px 20px' }}>
        <button
          disabled={items.length === 0}
          onClick={() => openPayModal('efectivo')}
          style={{
            width: '100%',
            padding: '16px',
            background: items.length === 0 ? 'rgba(108,242,13,0.3)' : 'var(--color-lime)',
            color: 'var(--color-bg)',
            fontSize: '15px',
            fontWeight: 800,
            textAlign: 'center',
            borderRadius: '12px',
            cursor: items.length === 0 ? 'not-allowed' : 'pointer',
            border: 'none',
            fontFamily: 'inherit',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            transition: 'filter 0.15s',
          }}
          onMouseEnter={(e) => { if (items.length > 0) e.currentTarget.style.filter = 'brightness(1.08)' }}
          onMouseLeave={(e) => { e.currentTarget.style.filter = '' }}
        >
          {`Cobrar $ ${total.toFixed(2)} MXN`}
        </button>
      </div>
    </div>
  )
}

function TicketItemRow({ item, onUpdateQty, onRemove }: { item: TicketItem; onUpdateQty: (id: string, d: number) => void; onRemove: (id: string) => void }) {
  const gradients: Record<string, string> = {
    'img-coffee': 'linear-gradient(135deg, #8B7355, #D4C5B2)',
    'img-water': 'linear-gradient(135deg, #7BA7BC, #B8D8E8)',
    'img-paddle': 'linear-gradient(135deg, #6B8F7B, #A8C5B5)',
    'img-balls': 'linear-gradient(135deg, #B5A67D, #D4C9A8)',
    'img-food': 'linear-gradient(135deg, #C4956A, #E8C9A8)',
    'img-drink': 'linear-gradient(135deg, #7B9CAF, #B8D0E0)',
    'img-grip': 'linear-gradient(135deg, #8B8B8B, #C4C4C4)',
    'img-rental': 'linear-gradient(135deg, #7D9B6B, #A8C596)',
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
      <div
        style={{
          width: '44px',
          height: '44px',
          borderRadius: '8px',
          background: gradients[item.imgClass] ?? '#1a2213',
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>{item.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginTop: '4px' }}>
          <button onClick={() => onUpdateQty(item.id, -1)} style={qtyBtnStyle('left')}>
            <Minus size={12} />
          </button>
          <div style={qtyValueStyle}>{item.qty}</div>
          <button onClick={() => onUpdateQty(item.id, 1)} style={qtyBtnStyle('right')}>
            <Plus size={12} />
          </button>
        </div>
        <div
          onClick={() => onRemove(item.id)}
          style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-muted-dim)', cursor: 'pointer', marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.5px', transition: 'color 0.1s' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#EF4444')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-muted-dim)')}
        >
          Eliminar
        </div>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)', flexShrink: 0 }}>
        $ {(item.price * item.qty).toFixed(2)}
      </div>
    </div>
  )
}

const qtyBtnStyle = (side: 'left' | 'right'): React.CSSProperties => ({
  width: '24px',
  height: '24px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-text)',
  cursor: 'pointer',
  borderRadius: side === 'left' ? '4px 0 0 4px' : '0 4px 4px 0',
  transition: 'all 0.1s',
  fontFamily: 'inherit',
})

const qtyValueStyle: React.CSSProperties = {
  width: '28px',
  height: '24px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--color-bg)',
  borderTop: '1px solid var(--color-border)',
  borderBottom: '1px solid var(--color-border)',
  fontFamily: 'var(--font-mono)',
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--color-text)',
}

function TotalRow({ label, value, accent }: { label: string; value: string; accent?: 'lime' | 'red' }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--color-muted)', padding: '3px 0', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
      <span style={{ color: accent === 'lime' ? 'var(--color-lime)' : 'var(--color-muted)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-mono)', color: accent === 'lime' ? 'var(--color-lime)' : 'var(--color-text)' }}>
        {value}
      </span>
    </div>
  )
}

function PayButton({ icon, label, onClick, disabled }: { icon: 'cash' | 'card' | 'split'; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '6px',
        padding: '14px 8px',
        background: 'var(--color-bg)',
        border: '1px solid var(--color-border)',
        borderRadius: '12px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: '11px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.3px',
        color: disabled ? 'var(--color-muted-dim)' : 'var(--color-text)',
        transition: 'all 0.15s',
        fontFamily: 'inherit',
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.borderColor = 'rgba(108,242,13,0.20)'
          e.currentTarget.style.background = 'rgba(108,242,13,0.05)'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-border)'
        e.currentTarget.style.background = 'var(--color-bg)'
      }}
    >
      {icon === 'cash' ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="4" width="20" height="16" rx="2"/><circle cx="12" cy="12" r="3"/>
        </svg>
      ) : icon === 'card' ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="2" x2="12" y2="22"/><rect x="2" y="5" width="9" height="14" rx="2"/><rect x="13" y="5" width="9" height="14" rx="2"/>
        </svg>
      )}
      {label}
    </button>
  )
}
