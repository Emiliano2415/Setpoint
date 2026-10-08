'use client'

import { useState } from 'react'
import { X, UserPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { createCliente, type ClienteCategoria } from '@/lib/supabase/queries/clientes'
import { toast } from 'sonner'
import { useAppStore } from '@/store/useAppStore'

interface Props {
  onClose: () => void
  onSuccess: () => void
}

const CATEGORIAS: { value: ClienteCategoria; label: string }[] = [
  { value: 'nuevo', label: 'Nuevo' },
  { value: 'regular', label: 'Regular' },
  { value: 'silver', label: 'Silver' },
  { value: 'gold', label: 'Gold' },
]

export function NewClientModal({ onClose, onSuccess }: Props) {
  const clubId = useAppStore((s) => s.clubId)
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [categoria, setCategoria] = useState<ClienteCategoria>('nuevo')
  const [esSocio, setEsSocio] = useState(false)
  const [notas, setNotas] = useState('')
  const [saving, setSaving] = useState(false)

  const supabase = createClient()

  async function handleSave() {
    if (!nombre.trim()) { toast.error('El nombre es obligatorio'); return }
    setSaving(true)
    try {
      await createCliente(supabase, clubId ?? '', {
        nombre: nombre.trim(),
        telefono: telefono.trim() || null,
        email: email.trim() || null,
        categoria,
        es_socio: esSocio,
        notas: notas.trim() || null,
      })
      toast.success(`Cliente "${nombre.trim()}" creado`)
      onSuccess()
    } catch {
      toast.error('Error al crear cliente')
      setSaving(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--color-bg2)', border: '1px solid var(--color-border)', borderRadius: '16px',
        width: '480px', boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <UserPlus size={18} color="var(--color-lime)" />
            <span style={{ fontSize: '16px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Nuevo Cliente</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', padding: '4px' }}>
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Nombre */}
          <div>
            <label style={labelStyle}>Nombre *</label>
            <input
              type="text" value={nombre} onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre completo del cliente"
              autoFocus style={inputStyle}
            />
          </div>

          {/* Teléfono + Email */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Teléfono</label>
              <input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="+52 55 1234 5678" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@ejemplo.com" style={inputStyle} />
            </div>
          </div>

          {/* Categoría */}
          <div>
            <label style={labelStyle}>Categoría</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {CATEGORIAS.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => setCategoria(cat.value)}
                  style={{
                    flex: 1, padding: '8px 0', borderRadius: '8px',
                    border: '1px solid',
                    borderColor: categoria === cat.value ? 'var(--color-lime)' : 'var(--color-border)',
                    background: categoria === cat.value ? 'rgba(108,242,13,0.1)' : 'var(--color-bg)',
                    color: categoria === cat.value ? 'var(--color-lime)' : 'var(--color-muted)',
                    fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'all 0.15s',
                  }}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Es socio toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              onClick={() => setEsSocio((v) => !v)}
              style={{
                width: '36px', height: '20px', borderRadius: '10px',
                background: esSocio ? 'var(--color-lime)' : 'var(--color-border)',
                position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
              }}
            >
              <div style={{
                position: 'absolute', top: '3px', left: esSocio ? '18px' : '3px',
                width: '14px', height: '14px', borderRadius: '50%',
                background: esSocio ? 'var(--color-bg)' : 'var(--color-muted)',
                transition: 'left 0.2s',
              }} />
            </div>
            <span style={{ fontSize: '13px', fontWeight: 600 }}>
              Socio del club
            </span>
            <span style={{ fontSize: '11px', color: 'var(--color-muted)' }}>
              (descuento automático en POS)
            </span>
          </div>

          {/* Notas */}
          <div>
            <label style={labelStyle}>Notas internas</label>
            <textarea
              value={notas} onChange={(e) => setNotas(e.target.value)}
              placeholder="Preferencias, condiciones especiales, etc."
              rows={2}
              style={{ ...inputStyle, resize: 'vertical', minHeight: '56px', lineHeight: '1.5' }}
            />
          </div>
        </div>

        {/* Actions */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--color-border-subtle)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button onClick={onClose} style={cancelBtn}>Cancelar</button>
          <button onClick={handleSave} disabled={saving || !nombre.trim()} style={{
            ...confirmBtn,
            opacity: saving || !nombre.trim() ? 0.5 : 1,
            cursor: saving || !nombre.trim() ? 'default' : 'pointer',
          }}>
            {saving ? 'Guardando...' : 'Crear Cliente'}
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

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px',
  background: 'var(--color-bg)', border: '1px solid var(--color-border)',
  borderRadius: '8px', color: 'var(--color-text)', fontSize: '13px',
  fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
}

const cancelBtn: React.CSSProperties = {
  padding: '9px 18px', background: 'var(--color-bg)',
  border: '1px solid var(--color-border)', borderRadius: '8px',
  color: 'var(--color-muted)', fontSize: '13px', fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
}

const confirmBtn: React.CSSProperties = {
  padding: '9px 18px', background: 'var(--color-lime)', border: 'none',
  borderRadius: '8px', color: 'var(--color-bg)', fontSize: '13px', fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit',
}
