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
import { useAppStore } from '@/store/useAppStore'
import { useSearchStore } from '@/store/useSearchStore'
import { coincideBusqueda } from '@/lib/busqueda'
import { toast } from 'sonner'
import { Button, EmptyState, Skeleton } from '@/components/ds'
import { Package, Settings } from 'lucide-react'

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
  stock?: number | null
  stockMinimo?: number | null
  requiere_stock?: boolean
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
  const clubId = useAppStore((s) => s.clubId)
  const [categories, setCategories] = useState<CategoryTab[]>([])
  const [activeCategory, setActiveCategory] = useState<string>(ALL_CATEGORY_ID)
  const [products, setProducts] = useState<Product[]>([])
  // El buscador de la barra superior filtra los productos de la categoría activa
  const busqueda = useSearchStore((s) => s.query)
  const productosVisibles = useMemo(
    () => products.filter((p) => coincideBusqueda(busqueda, p.name, p.category, p.sub)),
    [products, busqueda],
  )
  const [loadingCategories, setLoadingCategories] = useState(true)
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [ticketItems, setTicketItems] = useState<TicketItem[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [showMenu, setShowMenu] = useState(false)

  const supabase = useMemo(() => createClient(), [])

  // Load categories when clubId is available
  useEffect(() => {
    if (!clubId) return
    const id = clubId
    async function fetchCategories() {
      setLoadingCategories(true)
      let ok = false
      try {
        const { data, error } = await getCategories(supabase, id)
        if (!error && data) {
          const tabs: CategoryTab[] = [
            { id: ALL_CATEGORY_ID, label: 'Todos' },
            ...data.map((c) => ({ id: c.id, label: c.nombre })),
          ]
          setCategories(tabs)
          ok = true
        }
      } catch {
        // se trata igual que un error de la consulta
      }
      if (!ok) {
        // Sin categorías el efecto de productos no corre: hay que cerrar la carga aquí
        toast.error('No se pudieron cargar las categorías del menú')
        setLoadingProducts(false)
      }
      setLoadingCategories(false)
    }
    fetchCategories()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId])

  // Load products when activeCategory changes (wait for categories to be ready)
  useEffect(() => {
    if (!clubId || categories.length === 0) return
    const id = clubId

    async function fetchProducts() {
      setLoadingProducts(true)

      if (activeCategory === ALL_CATEGORY_ID) {
        const { data, error } = await getAllActiveProducts(supabase, id)
        if (!error && data) {
          type RawProduct = { id: string; nombre: string; precio: number; categoria_id: string; descripcion?: string; requiere_cocina: boolean; stock_actual?: number | null; stock_minimo?: number | null; requiere_stock?: boolean }
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
              stock: p.stock_actual ?? null,
              stockMinimo: p.stock_minimo ?? null,
              requiere_stock: p.requiere_stock ?? false,
            }
          })
          setProducts(mapped)
        }
      } else {
        const { data, error } = await getProductsByCategory(supabase, id, activeCategory)
        if (!error && data) {
          const catLabel =
            categories.find((c) => c.id === activeCategory)?.label ?? ''
          type RawProduct = { id: string; nombre: string; precio: number; categoria_id: string; descripcion?: string | null; requiere_cocina: boolean; stock_actual?: number | null; stock_minimo?: number | null; requiere_stock?: boolean }
          const mapped: Product[] = (data as RawProduct[]).map((p) => ({
            id: p.id,
            name: p.nombre,
            price: p.precio,
            category: catLabel,
            sub: p.descripcion ?? undefined,
            imgClass: resolveImgClass(catLabel),
            requiere_cocina: p.requiere_cocina,
            stock: p.stock_actual ?? null,
            stockMinimo: p.stock_minimo ?? null,
            requiere_stock: p.requiere_stock ?? false,
          }))
          setProducts(mapped)
        }
      }

      setLoadingProducts(false)
    }

    fetchProducts().catch(() => {
      toast.error('No se pudieron cargar los productos')
      setLoadingProducts(false)
    })
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
    <div className="grid h-[calc(100vh-56px)] grid-cols-[minmax(0,1fr)_360px] overflow-hidden">
      {/* Historial de tickets */}
      {showHistory && <TicketHistory onClose={() => setShowHistory(false)} />}
      {/* Gestión del menú */}
      {showMenu && <MenuManagementModal onClose={() => setShowMenu(false)} />}

      {/* Left: Products */}
      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        <div className="flex shrink-0 justify-end px-6 pt-3">
          <Button variant="ghost" size="sm" onClick={() => setShowMenu(true)}>
            <Settings className="size-4" aria-hidden="true" />
            Gestionar Menú
          </Button>
        </div>
        <div className="mb-5 mt-1 shrink-0 px-6">
          {loadingCategories ? (
            <div aria-busy="true" className="flex gap-6 border-b border-outline-variant pb-2.5">
              <span className="sr-only">Cargando...</span>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-5 w-20" />
              ))}
            </div>
          ) : (
            <CategoryTabs
              categories={categories}
              active={activeCategory}
              onChange={setActiveCategory}
            />
          )}
        </div>

        {loadingProducts ? (
          <div aria-busy="true" className="grid min-h-0 flex-1 grid-cols-2 content-start gap-4 overflow-hidden px-6 pb-6 xl:grid-cols-3">
            <span className="sr-only">Cargando...</span>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : productosVisibles.length === 0 ? (
          <div className="flex min-h-0 flex-1 items-center justify-center px-6 pb-6">
            <EmptyState icon={<Package />} title="Sin productos" />
          </div>
        ) : (
          <ProductGrid products={productosVisibles} onAdd={addProduct} />
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
