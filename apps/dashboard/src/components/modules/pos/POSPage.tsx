'use client'

import { useState, useEffect, useMemo } from 'react'
import { CategoryTabs } from './CategoryTabs'
import { ProductGrid } from './ProductGrid'
import { TicketPanel } from './TicketPanel'
import { TicketHistory } from './TicketHistory'
import { MenuManagementModal } from './MenuManagementModal'
import { createClient } from '@/lib/supabase/client'
import {
  getCategories,
  getProductsByCategory,
  getAllActiveProducts,
} from '@/lib/supabase/queries/pos'

const CLUB_ID = 'a1000000-0000-0000-0000-000000000001'

// imgClass mapping — coincide con nombres de categorías en DB
const IMG_CLASS_BY_CATEGORY: Record<string, string> = {
  Bebidas: 'img-drink',
  Café: 'img-coffee',
  Snacks: 'img-food',
  Comida: 'img-food',
  Palas: 'img-paddle',
  Pelotas: 'img-balls',
  Accesorios: 'img-grip',
  Ropa: 'img-grip',
  Alimentos: 'img-food',
  Cafetería: 'img-coffee',
  'Renta de Equipo': 'img-rental',
}

const ALL_CATEGORY_ID = '__all__'

export interface Product {
  id: string
  name: string
  category: string
  sub?: string
  price: number
  imgClass: string
  requiere_cocina: boolean
}

export type TicketItem = Product & { qty: number }

interface CategoryTab {
  id: string
  label: string
}

function resolveImgClass(categoryName: string): string {
  return IMG_CLASS_BY_CATEGORY[categoryName] ?? 'img-coffee'
}

export function POSPage() {
  const [categories, setCategories] = useState<CategoryTab[]>([])
  const [activeCategory, setActiveCategory] = useState<string>(ALL_CATEGORY_ID)
  const [products, setProducts] = useState<Product[]>([])
  const [loadingCategories, setLoadingCategories] = useState(true)
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [ticketItems, setTicketItems] = useState<TicketItem[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [showMenu, setShowMenu] = useState(false)

  const supabase = useMemo(() => createClient(), [])

  // Load categories once on mount
  useEffect(() => {
    async function fetchCategories() {
      setLoadingCategories(true)
      const { data, error } = await getCategories(supabase, CLUB_ID)
      if (!error && data) {
        const tabs: CategoryTab[] = [
          { id: ALL_CATEGORY_ID, label: 'Todos' },
          ...data.map((c) => ({ id: c.id, label: c.nombre })),
        ]
        setCategories(tabs)
      }
      setLoadingCategories(false)
    }
    fetchCategories()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load products when activeCategory changes (wait for categories to be ready)
  useEffect(() => {
    if (categories.length === 0) return

    async function fetchProducts() {
      setLoadingProducts(true)

      if (activeCategory === ALL_CATEGORY_ID) {
        const { data, error } = await getAllActiveProducts(supabase, CLUB_ID)
        if (!error && data) {
          type RawProduct = { id: string; nombre: string; precio: number; categoria_id: string; descripcion?: string; requiere_cocina: boolean }
          const mapped: Product[] = (data as RawProduct[]).map((p) => {
            const catNombre = categories.find((c) => c.id === p.categoria_id)?.label ?? ''
            return {
              id: p.id,
              name: p.nombre,
              price: p.precio,
              category: catNombre,
              sub: p.descripcion ?? undefined,
              imgClass: resolveImgClass(catNombre),
              requiere_cocina: p.requiere_cocina,
            }
          })
          setProducts(mapped)
        }
      } else {
        const { data, error } = await getProductsByCategory(supabase, CLUB_ID, activeCategory)
        if (!error && data) {
          const catLabel =
            categories.find((c) => c.id === activeCategory)?.label ?? ''
          const mapped: Product[] = data.map((p) => ({
            id: p.id,
            name: p.nombre,
            price: p.precio,
            category: catLabel,
            sub: p.descripcion ?? undefined,
            imgClass: resolveImgClass(catLabel),
            requiere_cocina: p.requiere_cocina,
          }))
          setProducts(mapped)
        }
      }

      setLoadingProducts(false)
    }

    fetchProducts()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory, categories])

  const addProduct = (product: Product) => {
    setTicketItems((prev) => {
      const existing = prev.find((i) => i.id === product.id)
      if (existing) {
        return prev.map((i) =>
          i.id === product.id ? { ...i, qty: i.qty + 1 } : i,
        )
      }
      return [...prev, { ...product, qty: 1 }]
    })
  }

  const updateQty = (id: string, delta: number) => {
    setTicketItems((prev) =>
      prev
        .map((i) => (i.id === id ? { ...i, qty: i.qty + delta } : i))
        .filter((i) => i.qty > 0),
    )
  }

  const removeItem = (id: string) => {
    setTicketItems((prev) => prev.filter((i) => i.id !== id))
  }

  const clearTicket = () => setTicketItems([])

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 360px',
        height: 'calc(100vh - 56px)',
        overflow: 'hidden',
      }}
    >
      {/* Historial de tickets */}
      {showHistory && <TicketHistory onClose={() => setShowHistory(false)} />}
      {/* Gestión del menú */}
      {showMenu && <MenuManagementModal onClose={() => setShowMenu(false)} />}

      {/* Left: Products */}
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 24px 0', flexShrink: 0 }}>
          <span
            onClick={() => setShowMenu(true)}
            style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-muted)', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.5px', transition: 'color 0.15s' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-lime)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-muted)')}
          >
            ⚙ Gestionar Menú
          </span>
        </div>
        {loadingCategories ? (
          <div
            style={{
              padding: '16px 24px',
              fontSize: '13px',
              color: 'var(--color-muted)',
            }}
          >
            Cargando...
          </div>
        ) : (
          <CategoryTabs
            categories={categories}
            active={activeCategory}
            onChange={setActiveCategory}
          />
        )}

        {loadingProducts ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '13px',
              color: 'var(--color-muted)',
            }}
          >
            Cargando...
          </div>
        ) : (
          <ProductGrid products={products} onAdd={addProduct} />
        )}
      </div>

      {/* Right: Ticket */}
      <TicketPanel
        items={ticketItems}
        onUpdateQty={updateQty}
        onRemove={removeItem}
        onClear={clearTicket}
        onHistoryOpen={() => setShowHistory(true)}
      />
    </div>
  )
}
