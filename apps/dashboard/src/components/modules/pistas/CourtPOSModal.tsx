'use client'

import { useState, useEffect, useMemo } from 'react'
import { CategoryTabs } from '../pos/CategoryTabs'
import { ProductGrid } from '../pos/ProductGrid'
import { TicketPanel } from '../pos/TicketPanel'
import { createClient } from '@/lib/supabase/client'
import {
  getCategories,
  getProductsByCategory,
} from '@/lib/supabase/queries/pos'
import type { Product, TicketItem } from '../pos/POSPage'
import { updateReservaEstado } from '@/lib/supabase/queries/pistas'
import type { Court } from './PistasPage'
import type { ReservaRow } from '@/lib/supabase/queries/pistas'
import { toast } from 'sonner'

// ─── Constants ────────────────────────────────────────────────────────────────

const CLUB_ID = 'a1000000-0000-0000-0000-000000000001'
const EXT_CATEGORY_ID = '__ext__'

const IMG_CLASS_BY_CATEGORY: Record<string, string> = {
  Bebidas: 'img-drink',
  Café: 'img-coffee',
  Snacks: 'img-food',
  Comida: 'img-food',
  Alimentos: 'img-food',
  Cafetería: 'img-coffee',
  'Renta de Equipo': 'img-rental',
  Palas: 'img-paddle',
  Pelotas: 'img-balls',
  Accesorios: 'img-grip',
  Ropa: 'img-grip',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface CourtPOSModalProps {
  open: boolean
  court: Court
  reserva: ReservaRow
  onClose: () => void
  onFinalize: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CourtPOSModal({ open, court, reserva, onClose, onFinalize }: CourtPOSModalProps) {
  const supabase = useMemo(() => createClient(), [])

  const [dbCategories, setDbCategories] = useState<{ id: string; label: string }[]>([])
  const [activeCategory, setActiveCategory] = useState<string>(EXT_CATEGORY_ID)
  const [products, setProducts] = useState<Product[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [ticketItems, setTicketItems] = useState<TicketItem[]>([])
  const [finalizeConfirm, setFinalizeConfirm] = useState(false)
  const [finalizing, setFinalizing] = useState(false)

  // ── On open: reset state + load categories ─────────────────────────────────
  useEffect(() => {
    if (!open) return

    setActiveCategory(EXT_CATEGORY_ID)
    setTicketItems([])
    setFinalizeConfirm(false)

    getCategories(supabase, CLUB_ID).then(({ data }) => {
      if (data) {
        setDbCategories(data.map((c) => ({ id: c.id, label: c.nombre })))
      }
    })
  }, [open, supabase])

  // ── On category change: fetch products ────────────────────────────────────
  useEffect(() => {
    if (!open) return
    if (activeCategory === EXT_CATEGORY_ID) {
      setProducts([])
      return
    }

    setLoadingProducts(true)
    getProductsByCategory(supabase, CLUB_ID, activeCategory)
      .then(({ data }) => {
        if (data) {
          const categoryName = dbCategories.find((c) => c.id === activeCategory)?.label ?? ''
          const imgClass = IMG_CLASS_BY_CATEGORY[categoryName] ?? 'img-coffee'
          setProducts(
            data.map((p) => ({
              id: p.id,
              name: p.nombre,
              category: categoryName,
              price: p.precio,
              imgClass,
              requiere_cocina: p.requiere_cocina,
            })),
          )
        }
      })
      .finally(() => setLoadingProducts(false))
  }, [open, activeCategory, supabase, dbCategories])

  // ── Derived values ────────────────────────────────────────────────────────
  const precioHora = reserva.precio ?? 0
  const extensionProducts: Product[] = [
    {
      id: 'ext-15',
      name: '+15 min — Extensión',
      category: 'Extensión',
      price: Math.round(precioHora * 0.25),
      imgClass: 'img-rental',
      requiere_cocina: false,
    },
    {
      id: 'ext-30',
      name: '+30 min — Extensión',
      category: 'Extensión',
      price: Math.round(precioHora * 0.5),
      imgClass: 'img-rental',
      requiere_cocina: false,
    },
    {
      id: 'ext-60',
      name: '+60 min — Extensión',
      category: 'Extensión',
      price: Math.round(precioHora),
      imgClass: 'img-rental',
      requiere_cocina: false,
    },
  ]

  const displayedProducts = activeCategory === EXT_CATEGORY_ID ? extensionProducts : products
  const allCategories = [{ id: EXT_CATEGORY_ID, label: 'Extensión' }, ...dbCategories]

  const timerColor =
    court.timer !== undefined && court.maxTime
      ? court.timer / court.maxTime >= 1
        ? '#EF4444'
        : court.timer / court.maxTime >= 0.8
          ? '#EAB308'
          : 'var(--color-lime)'
      : 'var(--color-lime)'

  // ── Ticket handlers ───────────────────────────────────────────────────────
  function handleAddProduct(product: Product) {
    setTicketItems((prev) => {
      const existing = prev.find((i) => i.id === product.id)
      if (existing) return prev.map((i) => (i.id === product.id ? { ...i, qty: i.qty + 1 } : i))
      return [...prev, { ...product, qty: 1 }]
    })
  }

  function handleUpdateQty(id: string, delta: number) {
    setTicketItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i)),
    )
  }

  function handleRemove(id: string) {
    setTicketItems((prev) => prev.filter((i) => i.id !== id))
  }

  function handleClear() {
    setTicketItems([])
  }

  // ── Finalize handler ──────────────────────────────────────────────────────
  async function handleFinalizar() {
    if (ticketItems.length > 0 && !finalizeConfirm) {
      setFinalizeConfirm(true)
      return
    }
    setFinalizing(true)
    try {
      await updateReservaEstado(supabase, reserva.id, 'finalizada')
      toast.success('Sesión finalizada')
      onFinalize()
    } catch {
      toast.error('Error al finalizar la sesión')
    } finally {
      setFinalizing(false)
      setFinalizeConfirm(false)
    }
  }

  // ── Render guard ──────────────────────────────────────────────────────────
  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        background: 'var(--color-bg)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          height: 56,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          borderBottom: '1px solid var(--color-border)',
          gap: 12,
        }}
      >
        {/* Left: court info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: timerColor,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              fontSize: 14,
              color: 'var(--color-text)',
              whiteSpace: 'nowrap',
            }}
          >
            {court.name}
          </span>
          {court.titular && (
            <>
              <span style={{ color: 'var(--color-muted)', fontSize: 14 }}>·</span>
              <span
                style={{
                  fontSize: 13,
                  color: 'var(--color-muted)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: 160,
                }}
              >
                {court.titular}
              </span>
            </>
          )}
          {court.timer !== undefined && (
            <>
              <span style={{ color: 'var(--color-muted)', fontSize: 14 }}>·</span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  color: timerColor,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                {formatTimer(court.timer)}
              </span>
            </>
          )}
        </div>

        {/* Right: finalize / confirm / close */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {finalizeConfirm ? (
            <>
              <span style={{ fontSize: 13, color: 'var(--color-muted)', marginRight: 4 }}>
                {ticketItems.length} producto{ticketItems.length !== 1 ? 's' : ''} sin cobrar.
                ¿Finalizar de todas formas?
              </span>
              <button
                onClick={handleFinalizar}
                disabled={finalizing}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: finalizing ? 'not-allowed' : 'pointer',
                  border: 'none',
                  background: '#EF4444',
                  color: '#fff',
                  fontFamily: 'inherit',
                  opacity: finalizing ? 0.6 : 1,
                }}
              >
                {finalizing ? 'Finalizando…' : 'Finalizar'}
              </button>
              <button
                onClick={() => setFinalizeConfirm(false)}
                disabled={finalizing}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: finalizing ? 'not-allowed' : 'pointer',
                  border: '1px solid var(--color-border)',
                  background: 'transparent',
                  color: 'var(--color-text)',
                  fontFamily: 'inherit',
                }}
              >
                Cancelar
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleFinalizar}
                disabled={finalizing}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: finalizing ? 'not-allowed' : 'pointer',
                  border: '1px solid #EF4444',
                  background: 'transparent',
                  color: '#EF4444',
                  fontFamily: 'inherit',
                  opacity: finalizing ? 0.6 : 1,
                }}
              >
                ■ Finalizar sesión
              </button>
              <button
                onClick={onClose}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  fontSize: 18,
                  fontWeight: 400,
                  cursor: 'pointer',
                  border: '1px solid var(--color-border)',
                  background: 'transparent',
                  color: 'var(--color-muted)',
                  fontFamily: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </>
          )}
        </div>
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '1fr 320px',
          overflow: 'hidden',
        }}
      >
        {/* Left column: categories + products */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <CategoryTabs
            categories={allCategories}
            active={activeCategory}
            onChange={setActiveCategory}
          />
          {loadingProducts ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-muted)',
                fontSize: 14,
              }}
            >
              Cargando productos…
            </div>
          ) : (
            <ProductGrid products={displayedProducts} onAdd={handleAddProduct} />
          )}
        </div>

        {/* Right column: ticket */}
        <div
          style={{
            borderLeft: '1px solid var(--color-border)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <TicketPanel
            items={ticketItems}
            onUpdateQty={handleUpdateQty}
            onRemove={handleRemove}
            onClear={handleClear}
          />
        </div>
      </div>
    </div>
  )
}
