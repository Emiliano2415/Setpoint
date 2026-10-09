'use client'

import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  getDescuentosReglas,
  updateDescuentoRegla,
  deleteDescuentoRegla,
  type DescuentoRegla,
} from '@/lib/supabase/queries/descuentos'
import { DiscountRuleModal } from './DiscountRuleModal'
import { toast } from 'sonner'
import { useAppStore } from '@/store/useAppStore'

export function DescuentosPage() {
  const clubId = useAppStore((s) => s.clubId)
  const [reglas, setReglas] = useState<DescuentoRegla[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [showModal, setShowModal] = useState(false)
  const [editingRegla, setEditingRegla] = useState<DescuentoRegla | undefined>(undefined)

  useEffect(() => {
    if (!clubId) return
    setLoading(true)
    const supabase = createClient()
    getDescuentosReglas(supabase, clubId)
      .then(setReglas)
      .catch(() => toast.error('Error cargando reglas'))
      .finally(() => setLoading(false))
  }, [clubId, refreshKey])

  async function handleToggle(regla: DescuentoRegla) {
    try {
      await updateDescuentoRegla(createClient(), regla.id, { activo: !regla.activo })
      setReglas((prev) => prev.map((r) => r.id === regla.id ? { ...r, activo: !r.activo } : r))
      toast.success(regla.activo ? 'Regla desactivada' : 'Regla activada')
    } catch {
      toast.error('Error al actualizar')
    }
  }

  async function handleDelete(regla: DescuentoRegla) {
    if (!confirm(`¿Eliminar la regla "${regla.nombre}"?`)) return
    try {
      await deleteDescuentoRegla(createClient(), regla.id)
      setReglas((prev) => prev.filter((r) => r.id !== regla.id))
      toast.success('Regla eliminada')
    } catch {
      toast.error('Error al eliminar')
    }
  }

  function handleEdit(regla: DescuentoRegla) {
    setEditingRegla(regla)
    setShowModal(true)
  }

  function handleNew() {
    setEditingRegla(undefined)
    setShowModal(true)
  }

  function handleModalSuccess() {
    setShowModal(false)
    setEditingRegla(undefined)
    setRefreshKey((k) => k + 1)
  }

  const activas = reglas.filter((r) => r.activo).length

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 56px)', color: 'var(--color-muted)', fontSize: '14px' }}>
        Cargando...
      </div>
    )
  }

  return (
    <div style={{ padding: '28px', maxWidth: '840px' }}>
      {showModal && (
        <DiscountRuleModal
          regla={editingRegla}
          onClose={() => { setShowModal(false); setEditingRegla(undefined) }}
          onSuccess={handleModalSuccess}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 900, margin: 0, marginBottom: '6px', color: 'var(--color-text)' }}>
            Descuentos y Membresías
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--color-muted)', margin: 0 }}>
            {activas} de {reglas.length} reglas activas — disponibles en el POS al cobrar
          </p>
        </div>
        <button
          onClick={handleNew}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '9px 18px', background: 'var(--color-lime)',
            border: 'none', borderRadius: '10px', color: 'var(--color-bg)',
            fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <Plus size={16} /> Nueva Regla
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '28px' }}>
        {[
          { label: 'Total Reglas', value: reglas.length, color: 'var(--color-text)' },
          { label: 'Activas', value: activas, color: 'var(--color-lime)' },
          { label: 'Inactivas', value: reglas.length - activas, color: 'var(--color-muted)' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: 'var(--color-bg2)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '16px 20px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
              {label}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '26px', fontWeight: 700, color }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Rules list */}
      {reglas.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '48px',
          border: '1px dashed var(--color-border)',
          borderRadius: '14px', color: 'var(--color-muted)', fontSize: '13px',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '10px' }}>🏷️</div>
          No hay reglas configuradas. Crea la primera con <strong>Nueva Regla</strong>.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {reglas.map((r) => (
            <RuleRow
              key={r.id}
              regla={r}
              onToggle={handleToggle}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Info note */}
      <div style={{
        marginTop: '24px', padding: '14px 18px',
        background: 'rgba(163,212,131,0.04)', border: '1px solid rgba(163,212,131,0.12)',
        borderRadius: '10px', fontSize: '12px', color: 'var(--color-muted)', lineHeight: 1.6,
      }}>
        <strong style={{ color: 'var(--color-lime)' }}>ℹ️ Cómo funcionan:</strong> Las reglas activas
        aparecen como opciones en el POS al cobrar. El cajero selecciona cuál aplicar antes de procesar el pago.
        Las reglas por categoría de cliente se sugieren automáticamente cuando hay cliente asignado.
      </div>
    </div>
  )
}

const CAT_COLORS: Record<string, string> = { Gold: '#EAB308', Silver: '#94A3B8', Socio: '#6366F1', Regular: '#6B7280' }

function RuleRow({
  regla,
  onToggle,
  onEdit,
  onDelete,
}: {
  regla: DescuentoRegla
  onToggle: (r: DescuentoRegla) => void
  onEdit: (r: DescuentoRegla) => void
  onDelete: (r: DescuentoRegla) => void
}) {
  const catColor = regla.categoria_cliente ? (CAT_COLORS[regla.categoria_cliente] ?? 'var(--color-muted)') : null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '14px',
      padding: '14px 18px',
      background: 'var(--color-bg2)',
      border: `1px solid ${regla.activo ? 'var(--color-border)' : 'var(--color-border-subtle)'}`,
      borderRadius: '12px',
      opacity: regla.activo ? 1 : 0.5,
      transition: 'opacity 0.2s',
    }}>
      {/* Toggle switch */}
      <div
        onClick={() => onToggle(regla)}
        title="Activar / Desactivar"
        style={{
          width: '36px', height: '20px', borderRadius: '10px',
          background: regla.activo ? 'var(--color-lime)' : 'var(--color-border)',
          position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s',
        }}
      >
        <div style={{
          position: 'absolute', top: '2px',
          left: regla.activo ? '18px' : '2px',
          width: '16px', height: '16px', borderRadius: '50%',
          background: regla.activo ? 'var(--color-bg)' : 'var(--color-muted)',
          transition: 'left 0.2s',
        }} />
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text)' }}>
            {regla.nombre}
          </span>
          <span style={{
            fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px',
            background: catColor ? `${catColor}18` : 'rgba(255,255,255,0.05)',
            color: catColor ?? 'var(--color-muted)',
            border: `1px solid ${catColor ? `${catColor}30` : 'var(--color-border)'}`,
          }}>
            {regla.categoria_cliente ?? 'Todos los clientes'}
          </span>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '3px' }}>
          {regla.tipo === 'porcentaje'
            ? `${regla.valor}% del subtotal`
            : `$${regla.valor} MXN descuento fijo`}
          {'  ·  '}
          {regla.aplica_a === 'todo' ? 'Aplica a todos los productos' : 'Aplica a categoría específica'}
        </div>
      </div>

      {/* Valor */}
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: '20px', fontWeight: 700,
        color: regla.activo ? 'var(--color-lime)' : 'var(--color-muted)',
        flexShrink: 0, minWidth: '52px', textAlign: 'right',
      }}>
        {regla.tipo === 'porcentaje' ? `${regla.valor}%` : `$${regla.valor}`}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
        <IconBtn onClick={() => onEdit(regla)} title="Editar">
          <Pencil size={13} />
        </IconBtn>
        <IconBtn onClick={() => onDelete(regla)} title="Eliminar" danger>
          <Trash2 size={13} />
        </IconBtn>
      </div>
    </div>
  )
}

function IconBtn({
  children,
  onClick,
  title,
  danger,
}: {
  children: React.ReactNode
  onClick: () => void
  title?: string
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: '30px', height: '30px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--color-bg)', border: '1px solid var(--color-border)',
        borderRadius: '7px', cursor: 'pointer',
        color: danger ? '#EF4444' : 'var(--color-muted)',
        transition: 'all 0.15s', fontFamily: 'inherit',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = danger ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.05)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-bg)')}
    >
      {children}
    </button>
  )
}
