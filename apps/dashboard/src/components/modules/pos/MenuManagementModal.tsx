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
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null)

  const supabase = createClient()

  async function load() {
    setLoading(true)
    const [prodsRes, catsRes] = await Promise.all([
      getAllProducts(supabase, CLUB_ID),
      getCategories(supabase, CLUB_ID),
    ])
    if (!prodsRes.error && prodsRes.data) setProducts(prodsRes.data as Producto[])
    if (!catsRes.error && catsRes.data) {
      const cats = catsRes.data as Categoria[]
      setCategories(cats)
      if (cats.length > 0 && selectedCatId === null) {
        setSelectedCatId(cats[0].id)
      }
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

  async function toggleCocina(p: Producto) {
    try {
      await updateProducto(supabase, p.id, { requiere_cocina: !p.requiere_cocina })
      setProducts((prev) => prev.map((x) => x.id === p.id ? { ...x, requiere_cocina: !x.requiere_cocina } : x))
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
  const filtered = selectedCatId ? products.filter((p) => p.categoria_id === selectedCatId) : products

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
        width: '480px',
        maxHeight: '80vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px 0',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Menú
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '1px' }}>
                {activeCount} activos · {products.length} total
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                onClick={() => setShowWizard(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  padding: '5px 10px', background: 'var(--color-lime)', color: 'var(--color-bg)',
                  border: 'none', borderRadius: '7px', fontSize: '11px', fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                <Plus size={11} /> Agregar
              </button>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', padding: '4px', lineHeight: 0 }}>
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Category filter tabs */}
          <div style={{
            display: 'flex', gap: '4px', overflowX: 'auto',
            paddingBottom: '12px',
            scrollbarWidth: 'none',
          }}>
            {categories.map((cat) => {
              const count = products.filter((p) => p.categoria_id === cat.id)
              const activeInCat = count.filter((p) => p.activo).length
              const isActive = selectedCatId === cat.id
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCatId(cat.id)}
                  style={{
                    flexShrink: 0,
                    padding: '5px 11px',
                    borderRadius: '20px',
                    border: isActive ? '1px solid var(--color-lime)' : '1px solid var(--color-border-subtle)',
                    background: isActive ? 'rgba(108,242,13,0.12)' : 'transparent',
                    color: isActive ? 'var(--color-lime)' : 'var(--color-muted)',
                    fontSize: '11px', fontWeight: isActive ? 700 : 500,
                    cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'all 0.15s',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {cat.nombre}
                  <span style={{
                    marginLeft: '5px',
                    fontSize: '10px',
                    opacity: 0.7,
                    fontFamily: 'var(--font-mono)',
                  }}>
                    {activeInCat}/{count.length}
                  </span>
                </button>
              )
            })}
          </div>

          <div style={{ height: '1px', background: 'var(--color-border-subtle)', marginLeft: '-20px', marginRight: '-20px' }} />
        </div>

        {/* Product list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0 8px' }}>
          {loading ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--color-muted)', fontSize: '13px' }}>
              Cargando...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--color-muted)', fontSize: '12px' }}>
              Sin productos en esta categoría
            </div>
          ) : (
            filtered.map((p) => (
              <div
                key={p.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '7px 20px',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {/* Toggle */}
                <div
                  onClick={() => toggleActivo(p)}
                  style={{
                    width: '28px', height: '16px', borderRadius: '8px',
                    background: p.activo ? 'var(--color-lime)' : 'var(--color-border)',
                    position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s',
                  }}
                >
                  <div style={{
                    position: 'absolute', top: '2px',
                    left: p.activo ? '14px' : '2px',
                    width: '12px', height: '12px', borderRadius: '50%',
                    background: p.activo ? 'var(--color-bg)' : 'var(--color-muted-dim)',
                    transition: 'left 0.2s',
                  }} />
                </div>

                {/* Cocina toggle */}
                <div
                  onClick={() => toggleCocina(p)}
                  title="Requiere preparación en cocina"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      width: '28px', height: '16px', borderRadius: '8px',
                      background: p.requiere_cocina ? '#F97316' : 'var(--color-border)',
                      position: 'relative', transition: 'background 0.2s',
                    }}
                  >
                    <div style={{
                      position: 'absolute', top: '2px',
                      left: p.requiere_cocina ? '14px' : '2px',
                      width: '12px', height: '12px', borderRadius: '50%',
                      background: p.requiere_cocina ? 'var(--color-bg)' : 'var(--color-muted-dim)',
                      transition: 'left 0.2s',
                    }} />
                  </div>
                  <span style={{ fontSize: '10px', color: p.requiere_cocina ? '#F97316' : 'var(--color-muted-dim)', fontWeight: 600 }}>
                    🍳
                  </span>
                </div>

                {/* Name */}
                <div style={{
                  flex: 1, minWidth: 0,
                  fontSize: '13px', fontWeight: 500,
                  color: p.activo ? 'var(--color-text)' : 'var(--color-muted)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  transition: 'color 0.15s',
                }}>
                  {p.nombre}
                </div>

                {/* Price (editable) */}
                {editingId === p.id ? (
                  <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                    <input
                      type="number"
                      value={editPrice}
                      onChange={(e) => setEditPrice(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') savePrice(p); if (e.key === 'Escape') setEditingId(null) }}
                      autoFocus
                      style={{
                        width: '72px', padding: '3px 7px',
                        background: 'var(--color-bg)',
                        border: '1px solid var(--color-lime)',
                        borderRadius: '5px', color: 'var(--color-text)',
                        fontSize: '12px', fontFamily: 'var(--font-mono)',
                        fontWeight: 700, outline: 'none',
                      }}
                    />
                    <button onClick={() => savePrice(p)} style={{ ...smallConfirmBtn }}>✓</button>
                    <button onClick={() => setEditingId(null)} style={{ ...smallCancelBtn }}>✕</button>
                  </div>
                ) : (
                  <div
                    onClick={() => { setEditingId(p.id); setEditPrice(String(p.precio)) }}
                    title="Clic para editar"
                    style={{
                      fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 600,
                      color: p.activo ? 'var(--color-text)' : 'var(--color-muted)',
                      cursor: 'pointer', padding: '2px 6px', borderRadius: '4px',
                      border: '1px solid transparent', transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'transparent')}
                  >
                    ${p.precio.toFixed(2)}
                  </div>
                )}
              </div>
            ))
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
  padding: '3px 8px',
  background: 'var(--color-lime)', border: 'none', borderRadius: '5px',
  color: 'var(--color-bg)', fontSize: '11px', fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit',
}

const smallCancelBtn: React.CSSProperties = {
  padding: '3px 8px',
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)', borderRadius: '5px',
  color: 'var(--color-muted)', fontSize: '11px', fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit',
}
