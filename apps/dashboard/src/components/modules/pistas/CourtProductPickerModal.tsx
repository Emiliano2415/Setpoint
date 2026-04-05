'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getAllActiveProducts, getCategories } from '@/lib/supabase/queries/pos'
import type { Categoria, Producto } from '@/lib/supabase/queries/pos'
import { toast } from 'sonner'
import { useAppStore } from '@/store/useAppStore'

export interface CourtProductPickerModalProps {
  open: boolean
  onAdd: (product: Producto) => void
  onClose: () => void
}

export function CourtProductPickerModal({ open, onAdd, onClose }: CourtProductPickerModalProps) {
  const clubId = useAppStore((s) => s.clubId)
  const [categories, setCategories] = useState<Categoria[]>([])
  const [products, setProducts] = useState<Producto[]>([])
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!open) return
    let ignore = false
    const supabase = createClient()
    setLoading(true)
    setSelectedCatId(null)
    setCategories([])
    setProducts([])
    Promise.all([
      getAllActiveProducts(supabase, clubId ?? ''),
      getCategories(supabase, clubId ?? ''),
    ]).then(([prodsRes, catsRes]) => {
      if (ignore) return
      if (catsRes.error || prodsRes.error) throw catsRes.error ?? prodsRes.error
      const cats = (catsRes.data ?? []) as Categoria[]
      const prods = (prodsRes.data ?? []) as Producto[]
      setCategories(cats)
      setProducts(prods)
      if (cats.length > 0) setSelectedCatId(cats[0].id)
    }).catch(() => {
      if (ignore) return
      toast.error('Error cargando productos')
    }).finally(() => {
      if (!ignore) setLoading(false)
    })
    return () => { ignore = true }
  }, [open])

  if (!open) return null

  const filtered = selectedCatId ? products.filter(p => p.categoria_id === selectedCatId) : products

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1200,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Agregar producto"
        style={{
          background: 'var(--color-bg2)',
          border: '1px solid var(--color-border)',
          borderRadius: '16px',
          width: '420px',
          maxHeight: '80vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px 0',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ fontSize: '14px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Agregar producto
            </div>
            <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', padding: '4px', lineHeight: 0 }}>
              <X size={16} />
            </button>
          </div>

          {/* Category tabs */}
          <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '12px', scrollbarWidth: 'none' }}>
            {categories.map(cat => {
              const isActive = selectedCatId === cat.id
              return (
                <button
                  type="button"
                  key={cat.id}
                  onClick={() => setSelectedCatId(cat.id)}
                  style={{
                    flexShrink: 0,
                    padding: '5px 11px', borderRadius: '20px',
                    border: isActive ? '1px solid var(--color-lime)' : '1px solid var(--color-border-subtle)',
                    background: isActive ? 'rgba(108,242,13,0.12)' : 'transparent',
                    color: isActive ? 'var(--color-lime)' : 'var(--color-muted)',
                    fontSize: '11px', fontWeight: isActive ? 700 : 500,
                    cursor: 'pointer', fontFamily: 'inherit',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {cat.nombre}
                </button>
              )
            })}
          </div>
          <div style={{ height: '1px', background: 'var(--color-border-subtle)', marginLeft: '-20px', marginRight: '-20px' }} />
        </div>

        {/* Product grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px 16px' }}>
          {loading ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--color-muted)', fontSize: '13px' }}>Cargando...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--color-muted)', fontSize: '12px' }}>Sin productos</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', paddingTop: '8px' }}>
              {filtered.map(p => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => { onAdd(p); onClose() }}
                  style={{
                    padding: '12px 8px',
                    background: 'var(--color-bg)',
                    border: '1px solid var(--color-border-subtle)',
                    borderRadius: '10px',
                    cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                    textAlign: 'center',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-lime)'
                    e.currentTarget.style.background = 'rgba(108,242,13,0.06)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-border-subtle)'
                    e.currentTarget.style.background = 'var(--color-bg)'
                  }}
                >
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text)', lineHeight: 1.3 }}>
                    {p.nombre}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, color: 'var(--color-lime)' }}>
                    ${p.precio.toFixed(2)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
