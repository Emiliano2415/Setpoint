'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { insertMovimientoCaja } from '@/lib/supabase/queries/caja'
import type { MovimientoTipo, MovimientoCategoria } from '@/lib/supabase/queries/caja'
import { toast } from 'sonner'

interface Props {
  cajaId: string
  onClose: () => void
  onSuccess: () => void
}

const CATEGORIA_OPTS: {
  value: MovimientoCategoria
  label: string
  desc: string
  tipo: MovimientoTipo
}[] = [
  { value: 'venta', label: 'Venta', desc: 'Ingreso por venta', tipo: 'ingreso' },
  { value: 'cancha', label: 'Cancha', desc: 'Ingreso por renta de pista', tipo: 'ingreso' },
  { value: 'propina', label: 'Propina', desc: 'Propina recibida', tipo: 'ingreso' },
  { value: 'fondo_inicial', label: 'Fondo', desc: 'Depósito de fondo', tipo: 'fondo' },
  { value: 'reembolso', label: 'Reembolso', desc: 'Devolución por cancelación', tipo: 'egreso' },
  { value: 'retiro', label: 'Retiro', desc: 'Retiro de efectivo autorizado', tipo: 'retiro' },
  { value: 'petty_cash', label: 'Gasto menor', desc: 'Petty cash / gasto operativo', tipo: 'egreso' },
  { value: 'ajuste', label: 'Ajuste', desc: 'Corrección manual (requiere notas)', tipo: 'egreso' },
  { value: 'otro', label: 'Otro', desc: 'Otro (requiere descripción)', tipo: 'ingreso' },
]

export function CashMovementModal({ cajaId, onClose, onSuccess }: Props) {
  const [categoria, setCategoria] = useState<MovimientoCategoria>('venta')
  const [notas, setNotas] = useState('')
  const [monto, setMonto] = useState('')
  const [saving, setSaving] = useState(false)

  const selected = CATEGORIA_OPTS.find((o) => o.value === categoria)!
  const montoNum = parseFloat(monto) || 0
  const notasRequeridas = categoria === 'ajuste' || categoria === 'otro'
  const canSubmit = montoNum > 0 && (!notasRequeridas || notas.trim().length > 0)

  async function handleSubmit() {
    if (!canSubmit) return
    setSaving(true)
    try {
      await insertMovimientoCaja(createClient(), {
        caja_id: cajaId,
        tipo: selected.tipo,
        concepto: notas.trim() || selected.label,
        monto: montoNum,
        categoria,
      })
      toast.success('Movimiento registrado')
      onSuccess()
    } catch {
      toast.error('Error al registrar movimiento')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'var(--color-bg2)', border: '1px solid var(--color-border)', borderRadius: '16px', width: '440px', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '16px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Movimiento de Caja</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', padding: '4px' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Categoría */}
          <div>
            <label style={labelStyle}>Categoría</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
              {CATEGORIA_OPTS.map((opt) => (
                <div
                  key={opt.value}
                  onClick={() => setCategoria(opt.value)}
                  style={{
                    padding: '8px 10px', cursor: 'pointer', borderRadius: '8px', transition: 'all 0.15s',
                    background: categoria === opt.value ? 'rgba(163,212,131,0.06)' : 'var(--color-bg)',
                    border: `1px solid ${categoria === opt.value ? 'rgba(163,212,131,0.25)' : 'var(--color-border)'}`,
                  }}
                >
                  <div style={{ fontSize: '11px', fontWeight: 700, color: categoria === opt.value ? 'var(--color-lime)' : 'var(--color-text)' }}>{opt.label}</div>
                  <div style={{ fontSize: '9px', color: 'var(--color-muted-dim)', marginTop: '2px' }}>{opt.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Tipo derivado */}
          <div style={{ padding: '8px 12px', background: 'var(--color-bg)', borderRadius: '8px', fontSize: '11px', color: 'var(--color-muted)' }}>
            Tipo: <strong style={{ color: 'var(--color-text)', textTransform: 'capitalize' }}>{selected.tipo}</strong>
          </div>

          {/* Notas */}
          <div>
            <label style={labelStyle}>
              {notasRequeridas ? 'Descripción *' : 'Notas (opcional)'}
            </label>
            <input
              type="text"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder={notasRequeridas ? 'Descripción requerida...' : 'Ej: Gasto limpieza, propina turno...'}
              style={inputStyle}
            />
          </div>

          {/* Monto */}
          <div>
            <label style={labelStyle}>Monto (MXN)</label>
            <input
              type="number"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0.00"
              style={{ ...inputStyle, fontSize: '20px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', paddingTop: '4px' }}>
            <button onClick={onClose} style={cancelBtnStyle}>Cancelar</button>
            <button
              onClick={handleSubmit}
              disabled={saving || !canSubmit}
              style={{
                padding: '13px', border: 'none', borderRadius: '10px',
                background: saving || !canSubmit ? 'rgba(163,212,131,0.3)' : 'var(--color-lime)',
                color: 'var(--color-bg)', fontSize: '13px', fontWeight: 800,
                cursor: saving || !canSubmit ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.3px',
              }}
            >
              {saving ? 'Guardando...' : 'Registrar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '10px', fontWeight: 700,
  color: 'var(--color-muted)', textTransform: 'uppercase',
  letterSpacing: '0.5px', marginBottom: '6px',
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', background: 'var(--color-bg)',
  border: '1px solid var(--color-border)', borderRadius: '8px',
  color: 'var(--color-text)', fontSize: '13px', fontFamily: 'inherit',
  outline: 'none', boxSizing: 'border-box',
}
const cancelBtnStyle: React.CSSProperties = {
  padding: '13px', background: 'var(--color-bg)',
  border: '1px solid var(--color-border)', borderRadius: '10px',
  color: 'var(--color-muted)', fontSize: '13px', fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit',
}
