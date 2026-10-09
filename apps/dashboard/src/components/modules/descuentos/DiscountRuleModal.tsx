'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  createDescuentoRegla,
  updateDescuentoRegla,
  type DescuentoRegla,
  type TipoDescuento,
  type AplicaA,
} from '@/lib/supabase/queries/descuentos'
import { toast } from 'sonner'
import { useAppStore } from '@/store/useAppStore'

const CATEGORIAS_CLIENTE = ['Todos', 'Socio', 'Gold', 'Silver', 'Regular'] as const
type CatLabel = (typeof CATEGORIAS_CLIENTE)[number]

interface Props {
  regla?: DescuentoRegla
  onClose: () => void
  onSuccess: () => void
}

export function DiscountRuleModal({ regla, onClose, onSuccess }: Props) {
  const clubId = useAppStore((s) => s.clubId)
  const isEdit = !!regla
  const [nombre, setNombre] = useState(regla?.nombre ?? '')
  const [tipo, setTipo] = useState<TipoDescuento>(regla?.tipo ?? 'porcentaje')
  const [valor, setValor] = useState(regla?.valor != null ? String(regla.valor) : '')
  const [categoriaCliente, setCategoriaCliente] = useState<CatLabel>(
    regla?.categoria_cliente ? (regla.categoria_cliente as CatLabel) : 'Todos',
  )
  const [aplica, setAplica] = useState<AplicaA>(regla?.aplica_a ?? 'todo')
  const [saving, setSaving] = useState(false)

  const valorNum = parseFloat(valor)
  const isValid = nombre.trim().length > 0 && !isNaN(valorNum) && valorNum >= 0

  async function handleSave() {
    if (!isValid) return
    setSaving(true)
    const supabase = createClient()
    const fields = {
      nombre: nombre.trim(),
      tipo,
      valor: valorNum,
      aplica_a: aplica,
      categoria_cliente: categoriaCliente === 'Todos' ? null : categoriaCliente,
    }
    try {
      if (isEdit) {
        await updateDescuentoRegla(supabase, regla.id, fields)
        toast.success('Regla actualizada')
      } else {
        await createDescuentoRegla(supabase, clubId ?? '', fields)
        toast.success('Regla creada')
      }
      onSuccess()
    } catch {
      toast.error('Error al guardar la regla')
      setSaving(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'var(--color-bg2)', border: '1px solid var(--color-border)', borderRadius: '16px', width: '460px', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '15px', fontWeight: 800 }}>
            {isEdit ? 'Editar Regla' : 'Nueva Regla de Descuento'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', padding: '4px' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Nombre */}
          <div>
            <label style={labelStyle}>Nombre de la Regla</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Descuento Socio, VIP Weekend..."
              autoFocus
              style={inputStyle}
            />
          </div>

          {/* Categoria cliente */}
          <div>
            <label style={labelStyle}>Aplica a Categoría de Cliente</label>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {CATEGORIAS_CLIENTE.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoriaCliente(cat)}
                  style={{
                    padding: '6px 14px', borderRadius: '8px', border: '1px solid',
                    borderColor: categoriaCliente === cat ? 'var(--color-lime)' : 'var(--color-border)',
                    background: categoriaCliente === cat ? 'rgba(163,212,131,0.10)' : 'var(--color-bg)',
                    color: categoriaCliente === cat ? 'var(--color-lime)' : 'var(--color-muted)',
                    fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'all 0.15s',
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Tipo */}
          <div>
            <label style={labelStyle}>Tipo de Descuento</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {([
                { value: 'porcentaje', label: 'Porcentaje (%)', desc: 'Del subtotal' },
                { value: 'monto_fijo', label: 'Monto Fijo ($)', desc: 'Cantidad fija' },
              ] as const).map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTipo(t.value)}
                  style={{
                    padding: '10px 12px', borderRadius: '8px', border: '1px solid',
                    borderColor: tipo === t.value ? 'var(--color-lime)' : 'var(--color-border)',
                    background: tipo === t.value ? 'rgba(163,212,131,0.08)' : 'var(--color-bg)',
                    color: tipo === t.value ? 'var(--color-lime)' : 'var(--color-muted)',
                    fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    textAlign: 'left', transition: 'all 0.15s',
                  }}
                >
                  <div>{t.label}</div>
                  <div style={{ fontSize: '10px', fontWeight: 400, marginTop: '2px', opacity: 0.7 }}>{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Valor */}
          <div>
            <label style={labelStyle}>
              {tipo === 'porcentaje' ? 'Porcentaje (%)' : 'Monto Fijo ($)'}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="number"
                min="0"
                max={tipo === 'porcentaje' ? 100 : undefined}
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder={tipo === 'porcentaje' ? '10' : '50'}
                style={{ ...inputStyle, paddingRight: '40px' }}
              />
              <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>
                {tipo === 'porcentaje' ? '%' : '$'}
              </span>
            </div>
            {!isNaN(valorNum) && valorNum > 0 && (
              <div style={{ fontSize: '11px', color: 'var(--color-lime)', marginTop: '4px' }}>
                {tipo === 'porcentaje' ? `Se descuentará el ${valorNum}% del subtotal` : `Se descuentarán $${valorNum} MXN fijos`}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--color-border-subtle)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button onClick={onClose} style={cancelBtnStyle}>Cancelar</button>
          <button
            onClick={handleSave}
            disabled={saving || !isValid}
            style={{
              padding: '9px 20px', background: saving || !isValid ? 'rgba(163,212,131,0.3)' : 'var(--color-lime)',
              border: 'none', borderRadius: '8px', color: 'var(--color-bg)',
              fontSize: '13px', fontWeight: 700, cursor: saving || !isValid ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {saving ? 'Guardando...' : isEdit ? 'Guardar Cambios' : 'Crear Regla'}
          </button>
        </div>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--color-muted)',
  textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px',
  background: 'var(--color-bg)', border: '1px solid var(--color-border)',
  borderRadius: '8px', color: 'var(--color-text)', fontSize: '14px',
  fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
}

const cancelBtnStyle: React.CSSProperties = {
  padding: '9px 18px', background: 'var(--color-bg)', border: '1px solid var(--color-border)',
  borderRadius: '8px', color: 'var(--color-muted)', fontSize: '13px', fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
}
