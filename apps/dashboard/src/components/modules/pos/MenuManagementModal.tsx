'use client'

import { useState, useEffect } from 'react'
import { X, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  getAllProducts,
  getCategories,
  updateProducto,
} from '@/lib/supabase/queries/pos'
import type { Producto, Categoria } from '@/lib/supabase/queries/pos'
import { toast } from 'sonner'
import { AddProductWizard } from './AddProductWizard'

const CLUB_ID = 'a1000000-0000-0000-0000-000000000001'

interface Props {
  onClose: () => void
}

export function MenuManagementModal({ onClose }: Props) {
  const [products, setProducts] = useState<Producto[]>([])
  const [categories, setCategories] = useState<Categoria[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editPrice, setEditPrice] = useState('')
  const [showWizard, setShowWizard] = useState(false)

  const supabase = createClient()

  async function load() {
    setLoading(true)
    const [prodsRes, catsRes] = await Promise.all([
      getAllProducts(supabase, CLUB_ID),
      getCategories(supabase, CLUB_ID),
    ])
    if (!prodsRes.error && prodsRes.data) setProducts(prodsRes.data as Producto[])
    if (!catsRes.error && catsRes.data) {
      setCategories(catsRes.data as Categoria[])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleActivo(p: Producto) {
    try {
      await updateProducto(supabase, p.id, { activo: !p.activo })
      setProducts((prev) => prev.map((x) => x.id === p.id ? { ...x, activo: !x.activo } : x))
    } catch {
      toast.error('Error al actualizar')
    }
  }

  async function savePrice(p: Producto) {
    const price = parseFloat(editPrice)
    if (isNaN(price) || price <= 0) { toast.error('Precio inválido'); return }
    try {
      await updateProducto(supabase, p.id, { precio: price })
      setProducts((prev) => prev.map((x) => x.id === p.id ? { ...x, precio: price } : x))
      setEditingId(null)
      toast.success('Precio actualizado')
    } catch {
      toast.error('Error al actualizar precio')
    }
  }

  const activeCount = products.filter((p) => p.activo).length

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--color-bg2)',
        border: '1px solid var(--color-border)',
        borderRadius: '16px',
        width: '560px',
        maxHeight: '85vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Gestión del Menú
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '2px' }}>
              {activeCount} activos · {products.length} total
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={() => setShowWizard(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                padding: '6px 12px', background: 'var(--color-lime)', color: 'var(--color-bg)',
                border: 'none', borderRadius: '8px', fontSize: '11px', fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <Plus size={12} /> Agregar
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', padding: '4px' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Product list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {loading ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-muted)', fontSize: '13px' }}>
              Cargando...
            </div>
          ) : (
            products.map((p) => {
              const catName = categories.find((c) => c.id === p.categoria_id)?.nombre ?? ''
              return (
                <div
                  key={p.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '10px 24px',
                    borderBottom: '1px solid var(--color-border-subtle)',
                    opacity: p.activo ? 1 : 0.5,
                    transition: 'opacity 0.15s',
                  }}
                >
                  {/* Toggle activo */}
                  <div
                    onClick={() => toggleActivo(p)}
                    style={{
                      width: '32px', height: '18px', borderRadius: '9px',
                      background: p.activo ? 'var(--color-lime)' : 'var(--color-border)',
                      position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s',
                    }}
                  >
                    <div style={{
                      position: 'absolute', top: '2px',
                      left: p.activo ? '16px' : '2px',
                      width: '14px', height: '14px', borderRadius: '50%',
                      background: p.activo ? 'var(--color-bg)' : 'var(--color-muted)',
                      transition: 'left 0.2s',
                    }} />
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>{p.nombre}</div>
                    <div style={{ fontSize: '10px', color: 'var(--color-muted-dim)' }}>{catName}</div>
                  </div>

                  {/* Precio editable */}
                  {editingId === p.id ? (
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <input
                        type="number"
                        value={editPrice}
                        onChange={(e) => setEditPrice(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') savePrice(p); if (e.key === 'Escape') setEditingId(null) }}
                        autoFocus
                        style={{
                          width: '80px', padding: '4px 8px',
                          background: 'var(--color-bg)',
                          border: '1px solid var(--color-lime)',
                          borderRadius: '6px', color: 'var(--color-text)',
                          fontSize: '13px', fontFamily: 'var(--font-mono)',
                          fontWeight: 700, outline: 'none',
                        }}
                      />
                      <button onClick={() => savePrice(p)} style={{ ...smallConfirmBtn, padding: '4px 10px', fontSize: '11px' }}>✓</button>
                      <button onClick={() => setEditingId(null)} style={{ ...smallCancelBtn, padding: '4px 10px', fontSize: '11px' }}>✕</button>
                    </div>
                  ) : (
                    <div
                      onClick={() => { setEditingId(p.id); setEditPrice(String(p.precio)) }}
                      style={{
                        fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700,
                        color: 'var(--color-text)', cursor: 'pointer',
                        padding: '4px 8px', borderRadius: '6px',
                        border: '1px solid transparent',
                        transition: 'border-color 0.15s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'transparent')}
                      title="Clic para editar precio"
                    >
                      ${p.precio.toFixed(2)}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      <AddProductWizard
        open={showWizard}
        categories={categories}
        clubId={CLUB_ID}
        onSuccess={() => { setShowWizard(false); load() }}
        onCancel={() => setShowWizard(false)}
      />
    </div>
  )
}

const smallConfirmBtn: React.CSSProperties = {
  padding: '6px 14px',
  background: 'var(--color-lime)', border: 'none', borderRadius: '6px',
  color: 'var(--color-bg)', fontSize: '12px', fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit',
}

const smallCancelBtn: React.CSSProperties = {
  padding: '6px 14px',
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)', borderRadius: '6px',
  color: 'var(--color-muted)', fontSize: '12px', fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit',
}
