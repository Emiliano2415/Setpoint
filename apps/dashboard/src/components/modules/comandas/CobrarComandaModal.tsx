'use client'

import { useState, useRef } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import type { MetodoPago } from '@/lib/supabase/queries/caja'
import type { CuentaItem, PagoInput } from '@/lib/supabase/queries/pos'
import { createCuenta } from '@/lib/supabase/queries/pos'
import type { ComandaFromDB } from '@/lib/supabase/queries/comandas'
import { updateComanda } from '@/lib/supabase/queries/comandas'
import { SplitAccountModal, type PersonSplit } from '@/components/modules/pos/SplitAccountModal'
import type { TicketItem } from '@/components/modules/pos/POSPage'

const CLUB_ID = 'a1000000-0000-0000-0000-000000000001'
const TAX_RATE = 0.16

interface Props {
  comanda: ComandaFromDB
  cajaId?: string
  onClose: () => void
  onSuccess: () => void
}

type PayMode = 'single' | 'split-payment'

type PaymentOption = {
  value: MetodoPago
  label: string
  icon: string
}

const PAYMENT_OPTIONS: PaymentOption[] = [
  { value: 'efectivo', label: 'Efectivo', icon: '💵' },
  { value: 'credito', label: 'Crédito', icon: '💳' },
  { value: 'debito', label: 'Débito', icon: '🏦' },
  { value: 'cortesia', label: 'Cortesía', icon: '🎁' },
]

function formatTime(iso: string): string {
  const d = new Date(iso)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n)
}

export function CobrarComandaModal({ comanda, cajaId, onClose, onSuccess }: Props) {
  const [mode, setMode] = useState<PayMode | null>(null)
  const [selectedMetodo, setSelectedMetodo] = useState<MetodoPago | null>(null)
  const [splitEfectivo, setSplitEfectivo] = useState('')
  const [splitAccountOpen, setSplitAccountOpen] = useState(false)
  const [paying, setPaying] = useState(false)
  const splitEfectivoRef = useRef<HTMLInputElement>(null)

  const supabase = createClient()

  const items = comanda.comanda_items ?? []

  const lineItems = items.map((ci) => ({
    nombre: ci.producto_id?.nombre ?? ci.cuenta_item_id?.producto_id?.nombre ?? 'Producto',
    precio: ci.cuenta_item_id?.precio_unitario ?? ci.producto_id?.precio ?? 0,
    cantidad: ci.cantidad,
    producto_id: ci.producto_id?.id ?? ci.cuenta_item_id?.producto_id?.id ?? '',
  }))

  const subtotal = lineItems.reduce((sum, li) => sum + li.precio * li.cantidad, 0)
  const iva = subtotal * TAX_RATE
  const total = subtotal + iva

  // Split payment derived values
  const splitEfectivoNum = parseFloat(splitEfectivo) || 0
  const splitTarjeta = Math.max(0, total - splitEfectivoNum)
  const splitCambio = splitEfectivoNum > total ? splitEfectivoNum - total : 0
  const splitValid = splitEfectivoNum > 0 && splitEfectivoNum <= total + 0.01

  // Shared cuenta items
  const cuentaItems: CuentaItem[] = lineItems.map(li => ({
    producto_id: li.producto_id,
    nombre: li.nombre,
    precio_unitario: li.precio,
    cantidad: li.cantidad,
  }))

  // TicketItem transform for SplitAccountModal
  const ticketItems: TicketItem[] = lineItems.map(li => ({
    id: li.producto_id,
    name: li.nombre,
    price: li.precio,
    qty: li.cantidad,
    category: '',
    imgClass: 'img-food',
    requiere_cocina: false,
  }))

  function selectMode(m: PayMode) {
    setMode(prev => prev === m ? null : m)
    setSelectedMetodo(null)
    setSplitEfectivo('')
  }

  async function handleCobrar() {
    if (!selectedMetodo || paying || mode !== 'single') return
    setPaying(true)
    try {
      const { data, error } = await createCuenta(supabase, CLUB_ID, cuentaItems, selectedMetodo, undefined, 0, cajaId)
      if (error || !data) throw error ?? new Error('No se pudo crear la cuenta')
      await updateComanda(supabase, comanda.id, { cuenta_id: data.id, estado: 'cobrado' })
      toast.success('Cobrado ✓')
      onSuccess()
      onClose()
    } catch {
      toast.error('Error al cobrar comanda')
    } finally {
      setPaying(false)
    }
  }

  async function handleConfirmSplit() {
    if (!splitValid || paying) return
    setPaying(true)
    try {
      const pagos: PagoInput[] = []
      if (splitEfectivoNum > 0) pagos.push({ metodo: 'efectivo', monto: Math.min(splitEfectivoNum, total) })
      if (splitTarjeta > 0) pagos.push({ metodo: 'credito', monto: splitTarjeta })
      const { data, error } = await createCuenta(supabase, CLUB_ID, cuentaItems, pagos, undefined, 0, cajaId)
      if (error || !data) throw error ?? new Error('No se pudo crear la cuenta')
      await updateComanda(supabase, comanda.id, { cuenta_id: data.id, estado: 'cobrado' })
      const cambioStr = splitCambio > 0 ? ` — Cambio: ${fmtCurrency(splitCambio)}` : ''
      toast.success(`Pago dividido ✓${cambioStr}`)
      onSuccess()
      onClose()
    } catch {
      toast.error('Error al procesar pago dividido')
    } finally {
      setPaying(false)
    }
  }

  async function handleConfirmSplitAccount(splits: PersonSplit[]) {
    setPaying(true)
    let firstCuentaId: string | null = null
    try {
      for (const split of splits) {
        const { data, error } = await createCuenta(supabase, CLUB_ID, split.items, split.metodo, undefined, 0, cajaId)
        if (error || !data) throw error ?? new Error('No se pudo crear la cuenta')
        if (!firstCuentaId) firstCuentaId = data.id
      }
      await updateComanda(supabase, comanda.id, { cuenta_id: firstCuentaId!, estado: 'cobrado' })
      toast.success(`Cuenta dividida entre ${splits.length} persona${splits.length !== 1 ? 's' : ''} ✓`)
      onSuccess()
      onClose()
    } catch {
      toast.error('Error al dividir la cuenta')
    } finally {
      setPaying(false)
      setSplitAccountOpen(false)
    }
  }

  return (
    <>
      {splitAccountOpen && (
        <SplitAccountModal
          open={splitAccountOpen}
          items={ticketItems}
          cajaId={cajaId}
          onConfirm={handleConfirmSplitAccount}
          onCancel={() => setSplitAccountOpen(false)}
        />
      )}

      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1001,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      >
        <div
          style={{
            background: 'var(--color-bg2)',
            border: '1px solid var(--color-border)',
            borderRadius: '16px',
            padding: '28px',
            width: '400px',
            boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
            maxHeight: '90vh',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-text)' }}>
                Cobrar comanda
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '2px' }}>
                {formatTime(comanda.created_at)}
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', padding: '4px' }}>
              <X size={18} />
            </button>
          </div>

          {/* Item list */}
          <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border-subtle)', borderRadius: '10px', overflow: 'hidden' }}>
            {lineItems.map((li, i) => (
              <div
                key={i}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 14px',
                  borderBottom: i < lineItems.length - 1 ? '1px solid var(--color-border-subtle)' : 'none',
                }}
              >
                <span style={{ fontSize: '13px', color: 'var(--color-text)', fontWeight: 500 }}>
                  {li.cantidad}x {li.nombre}
                </span>
                <span style={{ fontSize: '13px', color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>
                  {fmtCurrency(li.precio * li.cantidad)}
                </span>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border-subtle)', borderRadius: '10px', overflow: 'hidden' }}>
            {[
              { label: 'Subtotal', value: fmtCurrency(subtotal) },
              { label: 'IVA (16%)', value: fmtCurrency(iva) },
            ].map((row) => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--color-border-subtle)' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{row.label}</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text)', fontFamily: 'var(--font-mono)' }}>{row.value}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Total</span>
              <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-lime)', fontFamily: 'var(--font-mono)' }}>{fmtCurrency(total)}</span>
            </div>
          </div>

          {/* Action buttons + expanded panels */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>

            {/* Cobrar button */}
            <button
              onClick={() => selectMode('single')}
              style={{
                width: '100%', padding: '14px',
                background: mode === 'single' ? 'var(--color-lime)' : 'transparent',
                border: `1px solid ${mode === 'single' ? 'var(--color-lime)' : 'var(--color-border)'}`,
                borderRadius: '10px',
                color: mode === 'single' ? 'var(--color-bg)' : 'var(--color-text)',
                fontSize: '13px', fontWeight: 800, cursor: 'pointer',
                fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.3px',
                transition: 'all 0.15s',
              }}
            >
              Cobrar {fmtCurrency(total)}
            </button>

            {/* Single mode expanded: payment method grid */}
            {mode === 'single' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {PAYMENT_OPTIONS.map((opt) => {
                    const isSelected = selectedMetodo === opt.value
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setSelectedMetodo(opt.value)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '10px',
                          padding: '12px 14px',
                          background: isSelected ? 'rgba(108,242,13,0.08)' : 'var(--color-bg)',
                          border: `1px solid ${isSelected ? 'rgba(108,242,13,0.40)' : 'var(--color-border)'}`,
                          borderRadius: '10px', cursor: 'pointer', fontFamily: 'inherit',
                          transition: 'all 0.15s', textAlign: 'left',
                        }}
                      >
                        <span style={{ fontSize: '18px', lineHeight: 1 }}>{opt.icon}</span>
                        <span style={{ fontSize: '12px', fontWeight: isSelected ? 800 : 600, color: isSelected ? 'var(--color-lime)' : 'var(--color-text)' }}>
                          {opt.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <button
                  onClick={handleCobrar}
                  disabled={!selectedMetodo || paying}
                  style={{
                    width: '100%', padding: '13px',
                    background: !selectedMetodo || paying ? 'rgba(108,242,13,0.3)' : 'var(--color-lime)',
                    border: 'none', borderRadius: '10px',
                    color: 'var(--color-bg)', fontSize: '13px', fontWeight: 800,
                    cursor: !selectedMetodo || paying ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.3px',
                  }}
                >
                  {paying ? 'Procesando...' : `Confirmar — ${fmtCurrency(total)}`}
                </button>
              </div>
            )}

            {/* Dividir Pago button */}
            <button
              onClick={() => selectMode('split-payment')}
              style={{
                width: '100%', padding: '13px',
                background: 'transparent',
                border: `1px solid ${mode === 'split-payment' ? 'var(--color-lime)' : 'var(--color-border)'}`,
                borderRadius: '10px',
                color: mode === 'split-payment' ? 'var(--color-lime)' : 'var(--color-muted)',
                fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.3px',
                transition: 'all 0.15s',
              }}
            >
              Dividir Pago
            </button>

            {/* Split payment expanded */}
            {mode === 'split-payment' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {/* Efectivo input */}
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
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
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {[50, 100, 200, 500].map((v) => (
                      <button
                        key={v}
                        onClick={() => setSplitEfectivo(String(v))}
                        style={{
                          flex: 1, padding: '7px 4px', background: 'var(--color-bg)',
                          border: `1px solid ${splitEfectivoNum === v ? 'var(--color-lime)' : 'var(--color-border)'}`,
                          borderRadius: '7px', color: splitEfectivoNum === v ? 'var(--color-lime)' : 'var(--color-muted)',
                          fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 700, cursor: 'pointer',
                        }}
                      >
                        ${v}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tarjeta auto */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '12px 16px', background: 'var(--color-bg)',
                  border: '1px solid var(--color-border)', borderRadius: '10px',
                }}>
                  <span style={{ fontSize: '12px', color: 'var(--color-muted)' }}>Tarjeta (auto)</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 700, color: splitTarjeta > 0 ? 'var(--color-text)' : 'var(--color-muted-dim)' }}>
                    {fmtCurrency(splitTarjeta)}
                  </span>
                </div>

                {/* Cambio */}
                {splitEfectivo && splitCambio > 0 && (
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 14px',
                    background: 'rgba(108,242,13,0.06)',
                    border: '1px solid rgba(108,242,13,0.20)',
                    borderRadius: '10px',
                  }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Cambio</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 700, color: 'var(--color-lime)' }}>
                      {fmtCurrency(splitCambio)}
                    </span>
                  </div>
                )}

                {/* Confirm split */}
                <button
                  onClick={handleConfirmSplit}
                  disabled={!splitEfectivo || !splitValid || paying}
                  style={{
                    width: '100%', padding: '13px',
                    background: (!splitEfectivo || !splitValid || paying) ? 'rgba(108,242,13,0.3)' : 'var(--color-lime)',
                    border: 'none', borderRadius: '10px',
                    color: 'var(--color-bg)', fontSize: '13px', fontWeight: 800,
                    cursor: (!splitEfectivo || !splitValid || paying) ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.3px',
                  }}
                >
                  {paying ? 'Procesando...' : 'Confirmar Pago Dividido'}
                </button>
              </div>
            )}

            {/* Dividir Cuenta button */}
            <button
              onClick={() => { setMode(null); setSplitAccountOpen(true) }}
              disabled={paying}
              style={{
                width: '100%', padding: '13px',
                background: 'transparent',
                border: '1px solid var(--color-border)',
                borderRadius: '10px',
                color: 'var(--color-muted)',
                fontSize: '13px', fontWeight: 700,
                cursor: paying ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.3px',
                transition: 'all 0.15s',
              }}
            >
              Dividir Cuenta
            </button>

          </div>

          {/* Cancel */}
          <button
            onClick={onClose}
            style={{
              width: '100%', padding: '11px',
              background: 'transparent',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: '10px',
              color: 'var(--color-muted-dim)',
              fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Cancelar
          </button>

        </div>
      </div>
    </>
  )
}
