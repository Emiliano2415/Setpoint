'use client'

import { useState } from 'react'
import { X, Package } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { adjustStock } from '@/lib/supabase/queries/inventario'
import { toast } from 'sonner'
import { useAppStore } from '@/store/useAppStore'

type TipoAjuste = 'entrada' | 'salida' | 'ajuste' | 'merma'

interface Props {
  producto: { id: string; nombre: string; stock_actual: number; categoria_nombre: string }
  onClose: () => void
  onSuccess: () => void
}

const TIPOS: { value: TipoAjuste; label: string; desc: string; color: string }[] = [
  { value: 'entrada', label: 'Entrada', desc: 'Recepción de mercancía', color: 'var(--color-lime)' },
  { value: 'salida', label: 'Salida', desc: 'Despacho o uso', color: '#60a5fa' },
  { value: 'ajuste', label: 'Ajuste', desc: 'Establecer stock exacto', color: '#f59e0b' },
  { value: 'merma', label: 'Merma', desc: 'Pérdida o daño', color: '#ef4444' },
]

export function StockAdjustModal({ producto, onClose, onSuccess }: Props) {
  const clubId = useAppStore((s) => s.clubId)
  const [tipo, setTipo] = useState<TipoAjuste>('entrada')
  const [cantidad, setCantidad] = useState('')
  const [motivo, setMotivo] = useState('')
  const [saving, setSaving] = useState(false)

  const supabase = createClient()

  const cantidadNum = parseInt(cantidad, 10)
  const isValid = !isNaN(cantidadNum) && cantidadNum >= 0

  function getStockPreview(): number {
    if (!isValid) return producto.stock_actual
    if (tipo === 'entrada') return producto.stock_actual + cantidadNum
    if (tipo === 'salida' || tipo === 'merma') return Math.max(0, producto.stock_actual - cantidadNum)
    return cantidadNum // ajuste
  }

  const stockPreview = getStockPreview()
  const delta = stockPreview - producto.stock_actual

  async function handleSave() {
    if (!isValid || cantidadNum < 0) { toast.error('Ingresa una cantidad válida'); return }
    setSaving(true)
    try {
      await adjustStock(supabase, clubId ?? '', producto.id, tipo, cantidadNum, producto.stock_actual, motivo.trim() || null)
      toast.success(`Stock de "${producto.nombre}" actualizado a ${stockPreview}`)
      onSuccess()
    } catch {
      toast.error('Error al ajustar stock')
      setSaving(false)
    }
  }

  const tipoInfo = TIPOS.find((t) => t.value === tipo)!

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--color-bg2)', border: '1px solid var(--color-border)', borderRadius: '16px',
        width: '460px', boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Package size={18} color="var(--color-lime)" />
            <div>
              <div style={{ fontSize: '15px', fontWeight: 800 }}>{producto.nombre}</div>
              <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '1px' }}>{producto.categoria_nombre}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', padding: '4px' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Stock actual */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ flex: 1, padding: '12px 16px', background: 'var(--color-bg)', border: '1px solid var(--color-border-subtle)', borderRadius: '10px', textAlign: 'center' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Stock Actual</div>
              <div style={{ fontSize: '24px', fontWeight: 800 }}>{producto.stock_actual}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', fontSize: '20px', color: 'var(--color-muted)' }}>→</div>
            <div style={{ flex: 1, padding: '12px 16px', background: 'var(--color-bg)', border: `1px solid ${delta > 0 ? 'rgba(163,212,131,0.3)' : delta < 0 ? 'rgba(239,68,68,0.3)' : 'var(--color-border-subtle)'}`, borderRadius: '10px', textAlign: 'center' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Stock Final</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: delta > 0 ? 'var(--color-lime)' : delta < 0 ? '#ef4444' : 'var(--color-text)' }}>
                {stockPreview}
                {delta !== 0 && <span style={{ fontSize: '13px', marginLeft: '4px' }}>{delta > 0 ? `(+${delta})` : `(${delta})`}</span>}
              </div>
            </div>
          </div>

          {/* Tipo */}
          <div>
            <label style={labelStyle}>Tipo de Movimiento</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              {TIPOS.map((t) => (
                <button
                  key={t.value} onClick={() => setTipo(t.value)}
                  style={{
                    padding: '8px 4px', borderRadius: '8px', border: '1px solid',
                    borderColor: tipo === t.value ? t.color : 'var(--color-border)',
                    background: tipo === t.value ? `${t.color}18` : 'var(--color-bg)',
                    color: tipo === t.value ? t.color : 'var(--color-muted)',
                    fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'all 0.15s', textAlign: 'center',
                  }}
                >
                  <div>{t.label}</div>
                  <div style={{ fontSize: '9px', fontWeight: 400, marginTop: '2px', opacity: 0.8 }}>{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Cantidad */}
          <div>
            <label style={labelStyle}>
              {tipo === 'ajuste' ? 'Nuevo Stock Total' : 'Cantidad'}
            </label>
            <input
              type="number" min="0" value={cantidad} onChange={(e) => setCantidad(e.target.value)}
              placeholder={tipo === 'ajuste' ? 'Stock final deseado' : 'Unidades'}
              autoFocus
              style={{ width: '100%', padding: '9px 12px', background: 'var(--color-bg)', border: `1px solid ${isValid && cantidad ? tipoInfo.color : 'var(--color-border)'}`, borderRadius: '8px', color: 'var(--color-text)', fontSize: '16px', fontFamily: 'var(--font-mono)', outline: 'none', boxSizing: 'border-box', fontWeight: 700 }}
            />
          </div>

          {/* Motivo */}
          <div>
            <label style={labelStyle}>Motivo <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opcional)</span></label>
            <input
              type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: Compra proveedor, Inventario físico..."
              style={{ width: '100%', padding: '9px 12px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '8px', color: 'var(--color-text)', fontSize: '13px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        {/* Actions */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--color-border-subtle)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button onClick={onClose} style={cancelBtn}>Cancelar</button>
          <button
            onClick={handleSave}
            disabled={saving || !isValid || !cantidad}
            style={{ ...confirmBtn, opacity: saving || !isValid || !cantidad ? 0.5 : 1, cursor: saving || !isValid || !cantidad ? 'default' : 'pointer', background: tipoInfo.color }}
          >
            {saving ? 'Guardando...' : 'Aplicar Ajuste'}
          </button>
        </div>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--color-muted)',
  textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px',
}

const cancelBtn: React.CSSProperties = {
  padding: '9px 18px', background: 'var(--color-bg)', border: '1px solid var(--color-border)',
  borderRadius: '8px', color: 'var(--color-muted)', fontSize: '13px', fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
}

const confirmBtn: React.CSSProperties = {
  padding: '9px 18px', background: 'var(--color-lime)', border: 'none',
  borderRadius: '8px', color: 'var(--color-bg)', fontSize: '13px', fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit',
}
