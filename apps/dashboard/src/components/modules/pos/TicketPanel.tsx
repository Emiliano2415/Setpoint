'use client'

import { useState, useEffect, useRef, useMemo, type ReactNode } from 'react'
import type { TicketItem } from './POSPage'
import { Banknote, Check, ChefHat, CreditCard, Minus, Plus, ShoppingBag, SplitSquareHorizontal, Users } from 'lucide-react'
import { Button, Field, Input, Modal, Money, Select } from '@/components/ds'
import { createClient } from '@/lib/supabase/client'
import { createCuenta, type MetodoPago, type PagoInput } from '@/lib/supabase/queries/pos'
import { createComanda, updateComanda } from '@/lib/supabase/queries/comandas'
import { SplitAccountModal, type PersonSplit, type SplitMode } from './SplitAccountModal'
import { getDescuentosActivos, type DescuentoRegla } from '@/lib/supabase/queries/descuentos'
import { getCajaActiva } from '@/lib/supabase/queries/caja'
import { poll } from '@/lib/poll'
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

  // El turno se puede abrir o cerrar mientras el POS sigue en pantalla
  useEffect(() => {
    if (!clubId) return
    const cargarCaja = () =>
      getCajaActiva(supabase, clubId)
        .then(c => setCajaId(c?.id ?? null))
        .catch(() => console.warn('[TicketPanel] No se pudo verificar caja activa'))
    cargarCaja()
    return poll(cargarCaja, 30_000)
  }, [supabase, clubId])
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

  function openSplitAccountModal() {
    if (items.length === 0) return
    if (!cajaId) {
      toast.error('No hay turno activo. Abre el turno en Caja antes de cobrar.')
      return
    }
    setSplitAccountOpen(true)
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
    setEnviado({})
    setComandaIds([])
    setActiveRuleId(null)
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

  async function handleConfirmSplitAccount(splits: PersonSplit[], modo: SplitMode) {
    let allOk = true
    // La comanda es una sola: queda ligada a la primera de las cuentas
    let primeraCuentaId: string | null = null
    setPaying(true)
    // A partes iguales es UNA venta pagada entre varios: una sola cuenta con todos
    // los productos y un pago por persona. Antes se creaba una cuenta por persona
    // con todos los productos, y el total completo quedaba registrado N veces.
    // Por persona, cada quien tiene sus productos y su propia cuenta.
    // El descuento va completo en la cuenta única, o repartido (s.descuento) por persona.
    const cuentas: { quien: string; items: PersonSplit['items']; pagos: PagoInput[] | MetodoPago; descuento: number }[] =
      modo === 'iguales'
        ? [{ quien: 'la cuenta dividida', items: buildCuentaItems(), pagos: splits.map((s) => ({ metodo: s.metodo, monto: s.total })), descuento: discount }]
        : splits.map((s) => ({ quien: `a ${s.nombre}`, items: s.items, pagos: s.metodo, descuento: s.descuento }))
    for (const cuenta of cuentas) {
      const { data, error } = await createCuenta(
        supabase,
        clubId ?? '',
        cuenta.items,
        cuenta.pagos,
        undefined,
        cuenta.descuento,
        cajaId ?? undefined,
      )
      if (error || !data) {
        toast.error(`Error al cobrar ${cuenta.quien}`)
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
    <div className="flex h-full flex-col overflow-hidden border-l border-outline-variant bg-surface-container">
      {/* Modal de pago dividido */}
      <Modal
        open={splitOpen}
        onClose={() => setSplitOpen(false)}
        dismissable={!paying}
        title="Pago Dividido"
        description={`${items.length} productos — Efectivo + Tarjeta`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSplitOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmSplit}
              disabled={paying || !splitEfectivo || !splitValid}
            >
              {paying ? 'Procesando...' : 'Confirmar pago'}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <TotalACobrar total={total} />

          <Field label="Monto en Efectivo" htmlFor="split-efectivo">
            <div className="[&_input]:text-lg [&_input]:font-semibold [&_input]:tabular-nums">
              <Input
                id="split-efectivo"
                ref={splitEfectivoRef}
                type="number"
                min="0"
                placeholder="0.00"
                prefix="$"
                value={splitEfectivo}
                onChange={(e) => setSplitEfectivo(e.target.value)}
                invalid={splitEfectivoNum > total + 0.01}
              />
            </div>
            {/* Atajos rápidos */}
            <div className="grid grid-cols-4 gap-2">
              {[50, 100, 200, 500].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setSplitEfectivo(String(v))}
                  className={`rounded-lg border py-1.5 text-xs font-medium tabular-nums transition-colors ${
                    splitEfectivoNum === v
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                  }`}
                >
                  ${v}
                </button>
              ))}
            </div>
          </Field>

          {/* Tarjeta (automático) */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-on-surface-variant">Monto en Tarjeta</p>
            <div className="flex items-center justify-between rounded-lg border border-outline-variant bg-background px-3.5 py-2.5">
              <span className="text-xs text-outline">Auto-calculado</span>
              <Money
                value={splitTarjeta}
                className={splitTarjeta > 0 ? 'text-base font-semibold text-on-surface' : 'text-base font-semibold text-outline'}
              />
            </div>
          </div>

          {/* Cambio o cubierto por tarjeta */}
          {splitEfectivo && (
            <div
              className={`flex items-center justify-between rounded-lg border px-3.5 py-2.5 ${
                splitCambio > 0 ? 'border-primary/20 bg-primary/10' : 'border-outline-variant'
              }`}
            >
              <span className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                {splitCambio > 0 ? 'Cambio en Efectivo' : 'Cubierto por Tarjeta'}
              </span>
              <Money
                value={splitCambio > 0 ? splitCambio : splitTarjeta}
                className={splitCambio > 0 ? 'text-base font-semibold text-primary' : 'text-base font-semibold text-on-surface-variant'}
              />
            </div>
          )}
        </div>
      </Modal>

      {/* Modal de dividir cuenta */}
      {splitAccountOpen && (
        <SplitAccountModal
          open={splitAccountOpen}
          items={items}
          cajaId={cajaId}
          descuento={discount}
          onConfirm={handleConfirmSplitAccount}
          onCancel={() => setSplitAccountOpen(false)}
        />
      )}

      {/* Modal de pago */}
      <Modal
        open={payModal.open}
        onClose={() => setPayModal({ ...payModal, open: false })}
        dismissable={!paying}
        title={
          payModal.metodo === 'efectivo'
            ? 'Pago en Efectivo'
            : payModal.metodo === 'credito'
              ? 'Pago con Tarjeta de Crédito'
              : 'Pago con Tarjeta de Débito'
        }
        description={`${items.length} productos`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayModal({ ...payModal, open: false })}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmPay}
              disabled={paying || (payModal.metodo === 'efectivo' && (!recibido || recibidoNum < total))}
            >
              {paying ? 'Procesando...' : 'Confirmar pago'}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <TotalACobrar total={total} />

          {payModal.metodo === 'efectivo' ? (
            <>
              <Field label="Monto Recibido" htmlFor="pay-recibido">
                <div className="[&_input]:text-lg [&_input]:font-semibold [&_input]:tabular-nums">
                  <Input
                    id="pay-recibido"
                    ref={recibidoRef}
                    type="number"
                    prefix="$"
                    value={recibido}
                    onChange={(e) => setRecibido(e.target.value)}
                    placeholder={`Mínimo $${total.toFixed(2)}`}
                    onKeyDown={(e) => { if (e.key === 'Enter' && recibidoNum >= total) handleConfirmPay() }}
                  />
                </div>
              </Field>

              {/* Cambio */}
              <div
                className={`flex items-center justify-between rounded-lg border px-3.5 py-3 ${
                  cambio >= 0 && recibido ? 'border-primary/20 bg-primary/10' : 'border-outline-variant'
                }`}
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Cambio</span>
                <span className={`text-xl font-semibold tabular-nums ${cambio >= 0 && recibido ? 'text-primary' : 'text-outline'}`}>
                  {recibido ? <Money value={Math.max(0, cambio)} /> : '—'}
                </span>
              </div>

              {/* Atajos rápidos */}
              <div className="flex gap-2">
                {[Math.ceil(total / 100) * 100, Math.ceil(total / 500) * 500, Math.ceil(total / 1000) * 1000].filter((v, i, a) => a.indexOf(v) === i).slice(0, 3).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setRecibido(String(v))}
                    className={`flex-1 rounded-lg border py-1.5 text-xs font-medium tabular-nums transition-colors ${
                      recibidoNum === v
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                    }`}
                  >
                    ${v}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-outline-variant bg-background px-4 py-6 text-center">
              <CreditCard size={28} className="text-primary" />
              <p className="text-sm text-on-surface">Presenta la terminal al cliente para que realice el pago con tarjeta.</p>
            </div>
          )}
        </div>
      </Modal>

      {/* Encabezado */}
      <div className="flex shrink-0 items-center justify-between border-b border-outline-variant px-5 py-4">
        <h2 className="text-sm font-semibold text-on-surface">Ticket actual</h2>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onHistoryOpen}
            className="text-xs font-medium text-on-surface-variant transition-colors hover:text-primary"
          >
            Historial
          </button>
          <span className="text-xs text-primary">Nuevo ticket</span>
        </div>
      </div>

      {/* Lista de ítems */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-outline">
            <ShoppingBag size={28} strokeWidth={1.5} className="opacity-40" />
            <span className="text-sm">Agrega productos al ticket</span>
          </div>
        ) : (
          <div className="space-y-2.5">
            {items.map((item) => (
              <TicketItemRow key={item.id} item={item} onUpdateQty={onUpdateQty} onRemove={onRemove} />
            ))}
          </div>
        )}
      </div>

      {/* Descuento, cocina y avisos de cocina */}
      <div className="shrink-0 space-y-3 px-5 pt-3">
        {discountRules.length > 0 && (
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="ticket-descuento" className="text-xs text-on-surface-variant">
              Descuento
            </label>
            <div className="w-44">
              <Select
                id="ticket-descuento"
                value={activeRuleId ?? ''}
                onChange={(e) => setActiveRuleId(e.target.value || null)}
              >
                <option value="">Ninguno</option>
                {discountRules.map((r) => (
                  <option key={r.id} value={r.id}>
                    {`${r.nombre} (${r.tipo === 'porcentaje' ? `−${r.valor}%` : `−$${r.valor}`})`}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        )}

        {itemsParaCocina.length > 0 && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-outline-variant bg-surface-container-highest p-3">
            <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-on-surface">
              <ChefHat size={16} className="shrink-0 text-secondary-dim" />
              <span className="truncate">
                {pendientesCocina.length > 0
                  ? `${pendientesCocina.length} item${pendientesCocina.length !== 1 ? 's' : ''} para cocina · sale al cobrar`
                  : 'Todo enviado a cocina'}
              </span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="shrink-0"
              onClick={handleEnviarACocina}
              disabled={pendientesCocina.length === 0 || enviandoComanda}
            >
              {enviandoComanda ? (
                'Enviando...'
              ) : pendientesCocina.length === 0 ? (
                <>
                  <Check size={14} />
                  Enviado
                </>
              ) : (
                'Enviar ahora'
              )}
            </Button>
          </div>
        )}
        {/* Sin productos de cocina no hay nada que enviar: se dice, para que no parezca un fallo */}
        {items.length > 0 && itemsParaCocina.length === 0 && (
          <p className="text-[11px] leading-snug text-outline">
            Este ticket no genera comanda: ningún producto está marcado para cocina (se marca en Gestionar menú).
          </p>
        )}
      </div>

      {/* Totales */}
      <div className="shrink-0 space-y-1.5 border-t border-outline-variant px-5 pt-4 text-xs">
        <TotalRow label="Subtotal" value={<Money value={subtotal} />} />
        {activeRule && discount > 0 && (
          <TotalRow
            label={`${activeRule.nombre} (${activeRule.tipo === 'porcentaje' ? `${activeRule.valor}%` : `$${activeRule.valor}`})`}
            value={<>−<Money value={discount} /></>}
            accent="lime"
          />
        )}
        <TotalRow label="IVA (16%)" value={<Money value={tax} />} />
        <div className="flex items-baseline justify-between border-t border-outline-variant pt-2.5">
          <span className="text-sm font-semibold text-on-surface">Total</span>
          <span className="text-xl font-bold tabular-nums text-primary">
            <Money value={total} />{' '}
            <span className="text-xs font-normal text-on-surface-variant">MXN</span>
          </span>
        </div>
      </div>

      {/* Botones de pago */}
      <div className="grid shrink-0 grid-cols-2 gap-2 px-5 pt-4">
        <PayButton icon="cash" label="Efectivo" onClick={() => openPayModal('efectivo')} disabled={items.length === 0} />
        <PayButton icon="card" label="Tarjeta" onClick={() => openPayModal('credito')} disabled={items.length === 0} />
        <PayButton icon="split" label="Dividir pago" onClick={openSplitModal} disabled={items.length === 0} />
        <PayButton icon="users" label="Dividir cuenta" onClick={openSplitAccountModal} disabled={items.length === 0} />
      </div>

      {/* Botón principal de cobro */}
      <div className="shrink-0 px-5 pb-5 pt-3">
        <Button variant="primary" size="lg" fullWidth disabled={items.length === 0} onClick={() => openPayModal('efectivo')}>
          <span>Cobrar <Money value={total} /> MXN</span>
        </Button>
      </div>
    </div>
  )
}

function TicketItemRow({ item, onUpdateQty, onRemove }: { item: TicketItem; onUpdateQty: (id: string, d: number) => void; onRemove: (id: string) => void }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-outline-variant bg-surface-container-high p-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-on-surface">{item.name}</p>
        <div className="mt-1.5 flex items-center gap-3">
          <div className="flex items-center rounded border border-outline-variant bg-surface-container-highest">
            <button
              type="button"
              aria-label="Quitar uno"
              onClick={() => onUpdateQty(item.id, -1)}
              className="flex h-6 w-6 items-center justify-center rounded-l text-on-surface-variant transition-colors hover:text-on-surface"
            >
              <Minus size={12} />
            </button>
            <span className="flex h-6 w-7 items-center justify-center border-x border-outline-variant text-xs font-medium tabular-nums text-on-surface">
              {item.qty}
            </span>
            <button
              type="button"
              aria-label="Agregar uno"
              onClick={() => onUpdateQty(item.id, 1)}
              className="flex h-6 w-6 items-center justify-center rounded-r text-on-surface-variant transition-colors hover:text-on-surface"
            >
              <Plus size={12} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            className="text-[10px] font-bold uppercase tracking-wide text-outline transition-colors hover:text-error"
          >
            Eliminar
          </button>
        </div>
      </div>
      <Money value={item.price * item.qty} className="shrink-0 text-sm font-medium text-on-surface" />
    </div>
  )
}

function TotalACobrar({ total }: { total: number }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-outline-variant bg-background p-4">
      <span className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Total a Cobrar</span>
      <Money value={total} className="text-2xl font-bold text-primary" />
    </div>
  )
}

function TotalRow({ label, value, accent }: { label: string; value: ReactNode; accent?: 'lime' | 'red' }) {
  const lime = accent === 'lime'
  return (
    <div className="flex items-center justify-between text-on-surface-variant">
      <span className={lime ? 'text-primary' : ''}>{label}</span>
      <span className={`tabular-nums ${lime ? 'text-primary' : 'text-on-surface'}`}>{value}</span>
    </div>
  )
}

function PayButton({ icon, label, onClick, disabled }: { icon: 'cash' | 'card' | 'split' | 'users'; label: string; onClick: () => void; disabled?: boolean }) {
  const Icon = icon === 'cash' ? Banknote : icon === 'card' ? CreditCard : icon === 'split' ? SplitSquareHorizontal : Users
  return (
    <Button variant="secondary" size="sm" fullWidth onClick={onClick} disabled={disabled}>
      <Icon size={14} />
      {label}
    </Button>
  )
}
