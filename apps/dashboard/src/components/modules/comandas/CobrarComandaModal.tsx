'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import type { MetodoPago } from '@/lib/supabase/queries/caja'
import type { CuentaItem } from '@/lib/supabase/queries/pos'
import { createCuenta } from '@/lib/supabase/queries/pos'
import type { ComandaFromDB } from '@/lib/supabase/queries/comandas'
import { updateComanda } from '@/lib/supabase/queries/comandas'

const CLUB_ID = 'a1000000-0000-0000-0000-000000000001'
const TAX_RATE = 0.16

interface Props {
  comanda: ComandaFromDB
  cajaId?: string
  onClose: () => void
  onSuccess: () => void
}

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
  const [selectedMetodo, setSelectedMetodo] = useState<MetodoPago | null>(null)
  const [paying, setPaying] = useState(false)

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

  async function handleCobrar() {
    if (!selectedMetodo || paying) return
    setPaying(true)
    try {
      const cuentaItems: CuentaItem[] = lineItems.map((li) => ({
        producto_id: li.producto_id,
        nombre: li.nombre,
        precio_unitario: li.precio,
        cantidad: li.cantidad,
      }))

      const { data, error } = await createCuenta(
        supabase,
        CLUB_ID,
        cuentaItems,
        selectedMetodo,
        undefined,
        0,
        cajaId,
      )

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

  return (
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
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
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
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <div>
            <div
              style={{
                fontSize: '16px',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: 'var(--color-text)',
              }}
            >
              Cobrar comanda
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '2px' }}>
              {formatTime(comanda.created_at)}
            </div>
          </div>
          <button
            onClick={onClose}
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

        {/* Item list */}
        <div
          style={{
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: '10px',
            overflow: 'hidden',
          }}
        >
          {lineItems.map((li, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 14px',
                borderBottom: i < lineItems.length - 1 ? '1px solid var(--color-border-subtle)' : 'none',
              }}
            >
              <span style={{ fontSize: '13px', color: 'var(--color-text)', fontWeight: 500 }}>
                {li.cantidad}x {li.nombre}
              </span>
              <span
                style={{
                  fontSize: '13px',
                  color: 'var(--color-muted)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {fmtCurrency(li.precio * li.cantidad)}
              </span>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div
          style={{
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: '10px',
            overflow: 'hidden',
          }}
        >
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
              Subtotal
            </span>
            <span
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--color-text)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {fmtCurrency(subtotal)}
            </span>
          </div>
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
              IVA (16%)
            </span>
            <span
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--color-text)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {fmtCurrency(iva)}
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 14px',
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

        {/* Payment method selector */}
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
                    background: isSelected ? 'rgba(108,242,13,0.08)' : 'var(--color-bg)',
                    border: `1px solid ${isSelected ? 'rgba(108,242,13,0.40)' : 'var(--color-border)'}`,
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
        </div>

        {/* Action buttons */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '10px',
            paddingTop: '4px',
          }}
        >
          <button
            onClick={onClose}
            style={{
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
          >
            Cancelar
          </button>
          <button
            onClick={handleCobrar}
            disabled={!selectedMetodo || paying}
            style={{
              padding: '13px',
              background: !selectedMetodo || paying ? 'rgba(108,242,13,0.3)' : 'var(--color-lime)',
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
            Cobrar {fmtCurrency(total)}
          </button>
        </div>
      </div>
    </div>
  )
}
