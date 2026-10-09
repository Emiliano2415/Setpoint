'use client'

import { useState, useEffect } from 'react'
import { X, User, Phone, Mail, Star, Edit3, Check, X as XIcon } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import {
  getCliente,
  updateCliente,
  type Cliente,
  type ClienteCategoria,
  type Bono,
} from '@/lib/supabase/queries/clientes'
import { toast } from 'sonner'

const CATEGORIAS: { value: ClienteCategoria; label: string; color: string }[] = [
  { value: 'nuevo', label: 'Nuevo', color: 'var(--color-muted)' },
  { value: 'regular', label: 'Regular', color: '#f59e0b' },
  { value: 'silver', label: 'Silver', color: '#60a5fa' },
  { value: 'gold', label: 'Gold', color: 'var(--color-lime)' },
]

interface Props {
  clienteId: string
  onClose: () => void
  onRefresh: () => void
}

function formatFecha(fecha: string | null | undefined): string {
  if (!fecha) return '—'
  try { return format(new Date(fecha), 'd MMM yyyy', { locale: es }) } catch { return '—' }
}

export function ClientDetailModal({ clienteId, onClose, onRefresh }: Props) {
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [bonos, setBonos] = useState<Bono[]>([])
  const [loading, setLoading] = useState(true)

  // Edit states
  const [editField, setEditField] = useState<'nombre' | 'telefono' | 'email' | 'notas' | null>(null)
  const [editValue, setEditValue] = useState('')

  const supabase = createClient()

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { cliente: cRes, bonos: bRes } = await getCliente(supabase, clienteId)
      if (cRes.data) setCliente(cRes.data as Cliente)
      if (bRes.data) setBonos(bRes.data as Bono[])
      setLoading(false)
    }
    load()
  }, [clienteId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveField(field: 'nombre' | 'telefono' | 'email' | 'notas') {
    if (field === 'nombre' && !editValue.trim()) { toast.error('El nombre no puede estar vacío'); return }
    try {
      await updateCliente(supabase, clienteId, { [field]: editValue.trim() || null })
      setCliente((prev) => prev ? { ...prev, [field]: editValue.trim() || null } : prev)
      setEditField(null)
      toast.success('Actualizado')
      onRefresh()
    } catch {
      toast.error('Error al actualizar')
    }
  }

  async function changeCategoria(cat: ClienteCategoria) {
    if (!cliente) return
    try {
      await updateCliente(supabase, clienteId, { categoria: cat })
      setCliente((prev) => prev ? { ...prev, categoria: cat } : prev)
      onRefresh()
    } catch {
      toast.error('Error al actualizar')
    }
  }

  async function toggleSocio() {
    if (!cliente) return
    try {
      await updateCliente(supabase, clienteId, { es_socio: !cliente.es_socio })
      setCliente((prev) => prev ? { ...prev, es_socio: !prev.es_socio } : prev)
      onRefresh()
    } catch {
      toast.error('Error al actualizar')
    }
  }

  if (loading || !cliente) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: 'var(--color-bg2)', border: '1px solid var(--color-border)', borderRadius: '16px', padding: '48px', color: 'var(--color-muted)', fontSize: '13px' }}>
          Cargando...
        </div>
      </div>
    )
  }

  const catInfo = CATEGORIAS.find((c) => c.value === cliente.categoria) ?? CATEGORIAS[0]

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--color-bg2)', border: '1px solid var(--color-border)', borderRadius: '16px',
        width: '580px', maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(163,212,131,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <User size={20} color="var(--color-lime)" />
            </div>
            <div>
              <EditableField
                value={cliente.nombre} field="nombre"
                editField={editField} editValue={editValue}
                onEdit={() => { setEditField('nombre'); setEditValue(cliente.nombre) }}
                onChange={setEditValue}
                onSave={() => saveField('nombre')}
                onCancel={() => setEditField(null)}
                style={{ fontSize: '17px', fontWeight: 800 }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: catInfo.color, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  {catInfo.label}
                </span>
                {cliente.es_socio && (
                  <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-lime)', background: 'rgba(163,212,131,0.1)', padding: '1px 6px', borderRadius: '4px' }}>
                    SOCIO
                  </span>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', padding: '4px' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            {[
              { label: 'Visitas', value: String(cliente.stats?.visitas ?? 0) },
              { label: 'Ticket Medio', value: `$${cliente.stats?.ticket_promedio ?? 0}` },
              { label: 'Última Visita', value: formatFecha(cliente.stats?.ultima_visita) },
            ].map((s) => (
              <div key={s.label} style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border-subtle)', borderRadius: '10px', padding: '12px 14px' }}>
                <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>{s.label}</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-lime)' }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Contacto */}
          <div>
            <div style={sectionTitle}>Datos de Contacto</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <ContactField
                icon={<Phone size={13} />} label="Teléfono" field="telefono"
                value={cliente.telefono} editField={editField} editValue={editValue}
                onEdit={() => { setEditField('telefono'); setEditValue(cliente.telefono ?? '') }}
                onChange={setEditValue} onSave={() => saveField('telefono')} onCancel={() => setEditField(null)}
              />
              <ContactField
                icon={<Mail size={13} />} label="Email" field="email"
                value={cliente.email} editField={editField} editValue={editValue}
                onEdit={() => { setEditField('email'); setEditValue(cliente.email ?? '') }}
                onChange={setEditValue} onSave={() => saveField('email')} onCancel={() => setEditField(null)}
              />
            </div>
          </div>

          {/* Categoría */}
          <div>
            <div style={sectionTitle}>Categoría</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {CATEGORIAS.map((cat) => (
                <button
                  key={cat.value} onClick={() => changeCategoria(cat.value)}
                  style={{
                    flex: 1, padding: '7px 0', borderRadius: '8px', border: '1px solid',
                    borderColor: cliente.categoria === cat.value ? cat.color : 'var(--color-border)',
                    background: cliente.categoria === cat.value ? `${cat.color}18` : 'var(--color-bg)',
                    color: cliente.categoria === cat.value ? cat.color : 'var(--color-muted)',
                    fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                  }}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Socio */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              onClick={toggleSocio}
              style={{
                width: '36px', height: '20px', borderRadius: '10px',
                background: cliente.es_socio ? 'var(--color-lime)' : 'var(--color-border)',
                position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
              }}
            >
              <div style={{
                position: 'absolute', top: '3px', left: cliente.es_socio ? '18px' : '3px',
                width: '14px', height: '14px', borderRadius: '50%',
                background: cliente.es_socio ? 'var(--color-bg)' : 'var(--color-muted)',
                transition: 'left 0.2s',
              }} />
            </div>
            <div>
              <span style={{ fontSize: '13px', fontWeight: 600 }}>Socio del club</span>
              <span style={{ fontSize: '11px', color: 'var(--color-muted)', marginLeft: '6px' }}>
                {cliente.es_socio ? 'Descuento −10% activo en POS' : 'Sin descuento de socio'}
              </span>
            </div>
          </div>

          {/* Bonos */}
          {bonos.length > 0 && (
            <div>
              <div style={sectionTitle}>Bonos Activos</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {bonos.map((b) => (
                  <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--color-bg)', border: '1px solid var(--color-border-subtle)', borderRadius: '8px' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>{b.tipo}</div>
                      {b.fecha_expiracion && (
                        <div style={{ fontSize: '11px', color: 'var(--color-muted)' }}>
                          Expira: {formatFecha(b.fecha_expiracion)}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-lime)' }}>
                        ${b.valor_restante.toFixed(2)}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--color-muted)' }}>
                        de ${b.valor_total.toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Saldo cuenta */}
          {cliente.saldo_cuenta !== 0 && (
            <div style={{ padding: '12px 16px', background: cliente.saldo_cuenta > 0 ? 'rgba(163,212,131,0.05)' : 'rgba(239,68,68,0.05)', border: `1px solid ${cliente.saldo_cuenta > 0 ? 'rgba(163,212,131,0.2)' : 'rgba(239,68,68,0.2)'}`, borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 600 }}>Saldo en cuenta</span>
              <span style={{ fontSize: '16px', fontWeight: 800, color: cliente.saldo_cuenta > 0 ? 'var(--color-lime)' : '#ef4444' }}>
                {cliente.saldo_cuenta > 0 ? '+' : ''}${cliente.saldo_cuenta.toFixed(2)} MXN
              </span>
            </div>
          )}

          {/* Notas */}
          <div>
            <div style={sectionTitle}>Notas Internas</div>
            {editField === 'notas' ? (
              <div>
                <textarea
                  value={editValue} onChange={(e) => setEditValue(e.target.value)}
                  rows={3} autoFocus
                  style={{ width: '100%', padding: '9px 12px', background: 'var(--color-bg)', border: '1px solid var(--color-lime)', borderRadius: '8px', color: 'var(--color-text)', fontSize: '13px', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px', justifyContent: 'flex-end' }}>
                  <button onClick={() => setEditField(null)} style={smallCancelBtn}>Cancelar</button>
                  <button onClick={() => saveField('notas')} style={smallConfirmBtn}>Guardar</button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => { setEditField('notas'); setEditValue(cliente.notas ?? '') }}
                style={{ padding: '10px 12px', background: 'var(--color-bg)', border: '1px solid var(--color-border-subtle)', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: cliente.notas ? 'var(--color-text)' : 'var(--color-muted)', minHeight: '40px', transition: 'border-color 0.15s' }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--color-border-subtle)')}
              >
                {cliente.notas || 'Clic para agregar notas...'}
              </div>
            )}
          </div>

          {/* Miembro desde */}
          <div style={{ fontSize: '11px', color: 'var(--color-muted)', textAlign: 'center', paddingBottom: '4px' }}>
            Miembro desde {formatFecha(cliente.created_at)}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

interface EditableFieldProps {
  value: string; field: string; editField: string | null; editValue: string
  onEdit: () => void; onChange: (v: string) => void; onSave: () => void; onCancel: () => void
  style?: React.CSSProperties
}

function EditableField({ value, field, editField, editValue, onEdit, onChange, onSave, onCancel, style }: EditableFieldProps) {
  if (editField === field) {
    return (
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        <input
          type="text" value={editValue} onChange={(e) => onChange(e.target.value)} autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel() }}
          style={{ padding: '4px 8px', background: 'var(--color-bg)', border: '1px solid var(--color-lime)', borderRadius: '6px', color: 'var(--color-text)', fontSize: (style?.fontSize as string) ?? '13px', fontFamily: 'inherit', outline: 'none', fontWeight: style?.fontWeight ?? 'inherit' }}
        />
        <button onClick={onSave} style={{ background: 'none', border: 'none', color: 'var(--color-lime)', cursor: 'pointer', padding: '2px' }}><Check size={14} /></button>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', padding: '2px' }}><XIcon size={14} /></button>
      </div>
    )
  }
  return (
    <div onClick={onEdit} style={{ ...style, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
      {value}
      <Edit3 size={12} color="var(--color-muted)" style={{ opacity: 0 }} className="edit-icon" />
    </div>
  )
}

interface ContactFieldProps {
  icon: React.ReactNode; label: string; field: 'telefono' | 'email'
  value: string | null; editField: string | null; editValue: string
  onEdit: () => void; onChange: (v: string) => void; onSave: () => void; onCancel: () => void
}

function ContactField({ icon, label, field, value, editField, editValue, onEdit, onChange, onSave, onCancel }: ContactFieldProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: 'var(--color-bg)', border: '1px solid var(--color-border-subtle)', borderRadius: '8px' }}>
      <span style={{ color: 'var(--color-muted)', flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: '11px', color: 'var(--color-muted)', width: '52px', flexShrink: 0 }}>{label}</span>
      {editField === field ? (
        <div style={{ flex: 1, display: 'flex', gap: '4px', alignItems: 'center' }}>
          <input
            type="text" value={editValue} onChange={(e) => onChange(e.target.value)} autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel() }}
            style={{ flex: 1, padding: '3px 8px', background: 'transparent', border: '1px solid var(--color-lime)', borderRadius: '5px', color: 'var(--color-text)', fontSize: '13px', fontFamily: 'inherit', outline: 'none' }}
          />
          <button onClick={onSave} style={{ background: 'none', border: 'none', color: 'var(--color-lime)', cursor: 'pointer', padding: '2px' }}><Check size={13} /></button>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', padding: '2px' }}><XIcon size={13} /></button>
        </div>
      ) : (
        <div onClick={onEdit} style={{ flex: 1, fontSize: '13px', fontWeight: 500, cursor: 'pointer', color: value ? 'var(--color-text)' : 'var(--color-muted)' }}>
          {value ?? '— Sin registrar'}
        </div>
      )}
    </div>
  )
}

const sectionTitle: React.CSSProperties = {
  fontSize: '11px', fontWeight: 700, color: 'var(--color-muted)',
  textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px',
}

const smallConfirmBtn: React.CSSProperties = {
  padding: '5px 12px', background: 'var(--color-lime)', border: 'none',
  borderRadius: '6px', color: 'var(--color-bg)', fontSize: '12px', fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit',
}

const smallCancelBtn: React.CSSProperties = {
  padding: '5px 12px', background: 'var(--color-bg)', border: '1px solid var(--color-border)',
  borderRadius: '6px', color: 'var(--color-muted)', fontSize: '12px', fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit',
}
