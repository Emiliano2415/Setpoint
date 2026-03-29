# CourtPOSModal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a fullscreen POS modal linked to an active court session that reuses existing `CategoryTabs`, `ProductGrid`, and `TicketPanel` components, supporting consumable sales and time extensions without affecting court billing status.

**Architecture:** `CourtPOSModal` is a new fullscreen modal that mounts the three existing POS sub-components with court context injected. A virtual "Extensión" category tab is prepended to DB categories, showing 3 synthetic time-extension products calculated from `reserva.precio`. The modal replaces `CourtProductPickerModal` as the entry point from `CourtAccountModal`. `TicketPanel` is used as-is — it self-fetches `cajaId` internally, so no prop changes needed.

**Tech Stack:** React 19, TypeScript 5.7, Supabase client, inline styles, CSS variables (`--color-bg`, `--color-bg2`, `--color-border`, `--color-border-subtle`, `--color-text`, `--color-muted`, `--color-lime`, `--font-mono`). No Tailwind.

---

## Key Context

### Component signatures (do NOT modify these)

**`CategoryTabs`** — `apps/dashboard/src/components/modules/pos/CategoryTabs.tsx`
```typescript
interface CategoryTabsProps {
  categories: { id: string; label: string }[]
  active: string
  onChange: (id: string) => void
}
```

**`ProductGrid`** — `apps/dashboard/src/components/modules/pos/ProductGrid.tsx`
```typescript
interface ProductGridProps {
  products: Product[]  // Product from POSPage.tsx
  onAdd: (product: Product) => void
}
```

**`TicketPanel`** — `apps/dashboard/src/components/modules/pos/TicketPanel.tsx`
```typescript
interface TicketPanelProps {
  items: TicketItem[]
  onUpdateQty: (id: string, delta: number) => void
  onRemove: (id: string) => void
  onClear?: () => void
  onHistoryOpen?: () => void
}
// NOTE: TicketPanel self-fetches cajaId internally via getCajaActiva — no cajaId prop needed
```

**`Product` and `TicketItem`** — exported from `apps/dashboard/src/components/modules/pos/POSPage.tsx`
```typescript
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
```

### Queries used
- `getCategories(supabase, CLUB_ID)` → `{ data: Categoria[] | null, error }` from `@/lib/supabase/queries/pos`
- `getProductsByCategory(supabase, clubId, categoryId)` → `{ data: Producto[] | null, error }` from `@/lib/supabase/queries/pos`
- `getAllActiveProducts(supabase, CLUB_ID)` → all products (used when no category filter)
- `updateReservaEstado(supabase, reservaId, 'finalizada')` → from `@/lib/supabase/queries/pistas`

### `Producto` DB type vs `Product` UI type
The DB returns `Producto` (with `nombre`, `precio`, `categoria_id`). `POSPage` maps these to `Product` (with `name`, `price`, `category`, `imgClass`). `CourtPOSModal` must do the same mapping.

```typescript
// imgClass mapping (same as POSPage)
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
```

### Constants
```typescript
const CLUB_ID = 'a1000000-0000-0000-0000-000000000001'
const EXT_CATEGORY_ID = '__ext__'
```

### CourtPOSModal props interface
```typescript
interface CourtPOSModalProps {
  open: boolean
  court: Court                   // from PistasPage — has .name, .timer, .maxTime, .titular
  reserva: ReservaRow            // for reserva.precio (extension calc) and reserva.id (finalize)
  onClose: () => void            // X button — session untouched
  onFinalize: () => void         // after finalizar session — parent does full refresh + close
}
```

### CourtAccountModal current "Agregar" button (line ~384-396)
```typescript
<button
  type="button"
  onClick={() => setPickerOpen(true)}
  style={{ ... }}
>
  <Plus size={10} /> Agregar
</button>
```
This must be changed to `setCourtPOSOpen(true)`.

### `CourtAccountModal` current state
```typescript
const [pickerOpen, setPickerOpen] = useState(false)
```
Add: `const [courtPOSOpen, setCourtPOSOpen] = useState(false)`

---

## Task 1: Create `CourtPOSModal.tsx`

**Files:**
- Create: `apps/dashboard/src/components/modules/pistas/CourtPOSModal.tsx`

### Step 1: Read reference files

Read these files for exact import paths and types before writing:
- `apps/dashboard/src/components/modules/pos/POSPage.tsx` lines 1-55 (Product, TicketItem types + IMG_CLASS_BY_CATEGORY)
- `apps/dashboard/src/lib/supabase/queries/pos.ts` lines 1-50 (getCategories, getAllActiveProducts, getProductsByCategory signatures)

### Step 2: Write the full component

```typescript
'use client'

import { useState, useEffect, useMemo } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getCategories, getAllActiveProducts, getProductsByCategory } from '@/lib/supabase/queries/pos'
import { updateReservaEstado } from '@/lib/supabase/queries/pistas'
import type { ReservaRow } from '@/lib/supabase/queries/pistas'
import { CategoryTabs } from '@/components/modules/pos/CategoryTabs'
import { ProductGrid } from '@/components/modules/pos/ProductGrid'
import { TicketPanel } from '@/components/modules/pos/TicketPanel'
import type { Product, TicketItem } from '@/components/modules/pos/POSPage'
import { toast } from 'sonner'
import type { Court } from './PistasPage'

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

interface CourtPOSModalProps {
  open: boolean
  court: Court
  reserva: ReservaRow
  onClose: () => void
  onFinalize: () => void
}

function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function CourtPOSModal({ open, court, reserva, onClose, onFinalize }: CourtPOSModalProps) {
  const supabase = useMemo(() => createClient(), [])

  // Category state
  const [dbCategories, setDbCategories] = useState<{ id: string; label: string }[]>([])
  const [activeCategory, setActiveCategory] = useState<string>(EXT_CATEGORY_ID)

  // Product state
  const [products, setProducts] = useState<Product[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)

  // Ticket state
  const [ticketItems, setTicketItems] = useState<TicketItem[]>([])

  // Finalize state
  const [finalizeConfirm, setFinalizeConfirm] = useState(false)
  const [finalizing, setFinalizing] = useState(false)

  // Load categories once on open
  useEffect(() => {
    if (!open) return
    setActiveCategory(EXT_CATEGORY_ID)
    setTicketItems([])
    setFinalizeConfirm(false)
    getCategories(supabase, CLUB_ID).then(({ data }) => {
      if (data) {
        setDbCategories(data.map(c => ({ id: c.id, label: c.nombre })))
      }
    }).catch(() => {})
  }, [open, supabase])

  // Load products when category changes
  useEffect(() => {
    if (!open || activeCategory === EXT_CATEGORY_ID) {
      setProducts([])
      return
    }
    setLoadingProducts(true)
    const fetchFn = activeCategory === '__all__'
      ? getAllActiveProducts(supabase, CLUB_ID)
      : getProductsByCategory(supabase, CLUB_ID, activeCategory)

    fetchFn.then(({ data }) => {
      if (data) {
        setProducts(data.map(p => ({
          id: p.id,
          name: p.nombre,
          category: p.categorias?.nombre ?? '',
          price: p.precio,
          imgClass: IMG_CLASS_BY_CATEGORY[p.categorias?.nombre ?? ''] ?? 'img-drink',
          requiere_cocina: p.requiere_cocina ?? false,
        })))
      }
    }).catch(() => {
      toast.error('Error cargando productos')
    }).finally(() => setLoadingProducts(false))
  }, [open, activeCategory, supabase])

  if (!open) return null

  // Extension products — calculated from reserva.precio
  const precioHora = reserva.precio ?? 0
  const extensionProducts: Product[] = [
    { id: 'ext-15', name: '+15 min — Extensión', category: 'Extensión', price: Math.round(precioHora * 0.25 * 100) / 100, imgClass: 'img-rental', requiere_cocina: false },
    { id: 'ext-30', name: '+30 min — Extensión', category: 'Extensión', price: Math.round(precioHora * 0.5 * 100) / 100, imgClass: 'img-rental', requiere_cocina: false },
    { id: 'ext-60', name: '+60 min — Extensión', category: 'Extensión', price: precioHora, imgClass: 'img-rental', requiere_cocina: false },
  ]

  const displayedProducts = activeCategory === EXT_CATEGORY_ID ? extensionProducts : products

  // All categories: Extensión first, then DB categories
  const allCategories = [
    { id: EXT_CATEGORY_ID, label: 'Extensión' },
    ...dbCategories,
  ]

  function handleAddProduct(product: Product) {
    setTicketItems(prev => {
      const existing = prev.find(i => i.id === product.id)
      if (existing) return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i)
      return [...prev, { ...product, qty: 1 }]
    })
  }

  function handleUpdateQty(id: string, delta: number) {
    setTicketItems(prev =>
      prev.map(i => i.id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i)
    )
  }

  function handleRemove(id: string) {
    setTicketItems(prev => prev.filter(i => i.id !== id))
  }

  function handleClear() {
    setTicketItems([])
  }

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

  // Timer color
  const timerColor = court.timer !== undefined && court.maxTime
    ? (court.timer / court.maxTime) >= 1 ? '#EF4444'
    : (court.timer / court.maxTime) >= 0.8 ? '#EAB308'
    : 'var(--color-lime)'
    : 'var(--color-lime)'

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        background: 'var(--color-bg)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div style={{
        height: '56px',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center',
        padding: '0 24px', gap: '16px', flexShrink: 0,
        background: 'var(--color-bg2)',
      }}>
        {/* Court info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#EF4444', flexShrink: 0 }} />
          <span style={{ fontSize: '14px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {court.name}
          </span>
          {court.titular && (
            <>
              <span style={{ color: 'var(--color-border)', fontSize: '12px' }}>·</span>
              <span style={{ fontSize: '13px', color: 'var(--color-muted)' }}>{court.titular}</span>
            </>
          )}
          {court.timer !== undefined && (
            <>
              <span style={{ color: 'var(--color-border)', fontSize: '12px' }}>·</span>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700,
                color: timerColor,
              }}>
                {formatTimer(court.timer)}
              </span>
            </>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Finalize confirm inline */}
          {finalizeConfirm ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
                {ticketItems.length} producto(s) sin cobrar. ¿Finalizar de todas formas?
              </span>
              <button
                type="button"
                onClick={handleFinalizar}
                disabled={finalizing}
                style={{
                  padding: '6px 12px', borderRadius: '6px',
                  border: 'none', background: '#EF4444',
                  color: '#fff', fontSize: '12px', fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {finalizing ? 'Finalizando...' : 'Finalizar'}
              </button>
              <button
                type="button"
                onClick={() => setFinalizeConfirm(false)}
                style={{
                  padding: '6px 12px', borderRadius: '6px',
                  border: '1px solid var(--color-border)', background: 'transparent',
                  color: 'var(--color-muted)', fontSize: '12px', fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleFinalizar}
              disabled={finalizing}
              style={{
                padding: '7px 14px', borderRadius: '7px',
                border: '1px solid rgba(239,68,68,0.4)',
                background: 'transparent',
                color: '#EF4444', fontSize: '12px', fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              ■ Finalizar sesión
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '32px', height: '32px',
              background: 'none', border: 'none',
              color: 'var(--color-muted)', cursor: 'pointer', borderRadius: '6px',
            }}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Body: same 2-col layout as POSPage */}
      <div style={{
        flex: 1, overflow: 'hidden',
        display: 'grid', gridTemplateColumns: '1fr 320px',
      }}>
        {/* Left: category tabs + product grid */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <CategoryTabs
            categories={allCategories}
            active={activeCategory}
            onChange={setActiveCategory}
          />
          {loadingProducts ? (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--color-muted)', fontSize: '13px',
            }}>
              Cargando productos...
            </div>
          ) : (
            <ProductGrid
              products={displayedProducts}
              onAdd={handleAddProduct}
            />
          )}
        </div>

        {/* Right: ticket panel */}
        <div style={{ borderLeft: '1px solid var(--color-border)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
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
```

### Step 3: Verify the file compiles

Run TypeScript check:
```bash
cd c:\Users\ear21\OneDrive\Documents\Padel && npx tsc --noEmit --project apps/dashboard/tsconfig.json 2>&1 | head -40
```
Expected: zero errors related to `CourtPOSModal.tsx`. Fix any type errors found.

**Common issues to watch for:**
- `Producto` type from DB may not have `categorias` nested — check what `getProductsByCategory` returns. If it doesn't include category name, use `category: ''` and `imgClass: 'img-drink'` as fallback.
- `getProductsByCategory` signature: check if it exists in pos.ts or if you need `getAllActiveProducts` filtered client-side.

### Step 4: Commit

```bash
git add apps/dashboard/src/components/modules/pistas/CourtPOSModal.tsx
git commit -m "feat: create CourtPOSModal — fullscreen POS for active court sessions"
```

---

## Task 2: Wire `CourtPOSModal` into `CourtAccountModal`

**Files:**
- Modify: `apps/dashboard/src/components/modules/pistas/CourtAccountModal.tsx`

### Step 1: Read the current file

Read `apps/dashboard/src/components/modules/pistas/CourtAccountModal.tsx` lines 1-15 (imports) and lines 70-80 (state declarations) and lines 380-400 (Agregar button area).

### Step 2: Add import and state

At the top of the file, add:
```typescript
import { CourtPOSModal } from './CourtPOSModal'
```

In the component body, after existing state declarations, add:
```typescript
const [courtPOSOpen, setCourtPOSOpen] = useState(false)
```

Also add a stable supabase client (needed for passing to CourtPOSModal):
```typescript
const supabase = useMemo(() => createClient(), [])
```
Add `useMemo` to the React import if not already present.

### Step 3: Replace the "+ Agregar" button

Find the button that opens `pickerOpen`:
```typescript
<button
  type="button"
  onClick={() => setPickerOpen(true)}
  style={{
    display: 'flex', alignItems: 'center', gap: '3px',
    padding: '3px 8px', background: 'rgba(108,242,13,0.12)',
    border: '1px solid rgba(108,242,13,0.25)', borderRadius: '6px',
    color: 'var(--color-lime)', fontSize: '11px', fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit',
  }}
>
  <Plus size={10} /> Agregar
</button>
```

Replace `onClick={() => setPickerOpen(true)}` with `onClick={() => setCourtPOSOpen(true)}`.

### Step 4: Add `CourtPOSModal` to the JSX return

At the bottom of the component return (inside the fragment `<>...</>`), before `<CourtProductPickerModal .../>`, add:

```tsx
<CourtPOSModal
  open={courtPOSOpen}
  court={court}
  reserva={reserva!}
  onClose={() => setCourtPOSOpen(false)}
  onFinalize={() => {
    setCourtPOSOpen(false)
    onRefresh()
    onClose()
  }}
/>
```

Note: `reserva!` — `CourtPOSModal` should only be openable when the court is `ocupada`, at which point `reserva` is always non-null. The button is only rendered in the `court.status === 'ocupada'` branch, so this is safe.

### Step 5: Verify TypeScript

```bash
cd c:\Users\ear21\OneDrive\Documents\Padel && npx tsc --noEmit --project apps/dashboard/tsconfig.json 2>&1 | head -40
```
Expected: zero errors.

### Step 6: Commit

```bash
git add apps/dashboard/src/components/modules/pistas/CourtAccountModal.tsx
git commit -m "feat: wire CourtPOSModal into CourtAccountModal — replaces basic picker"
```

---

## Task 3: Verify `getProductsByCategory` signature and fix product mapping

**Files:**
- Read: `apps/dashboard/src/lib/supabase/queries/pos.ts`
- Possibly modify: `apps/dashboard/src/components/modules/pistas/CourtPOSModal.tsx`

This task exists because `getProductsByCategory` may return a different shape than expected. Verify and fix.

### Step 1: Read pos.ts to find `getProductsByCategory`

```
Grep: "getProductsByCategory|getAllActiveProducts" in apps/dashboard/src/lib/supabase/queries/pos.ts
```

Read the function body to see what columns are selected (does it include `categorias(nombre)`?).

### Step 2: Fix product mapping if needed

**If `getProductsByCategory` does NOT join categorias:**
The product mapping in `CourtPOSModal` must use a different approach. Since we already have `dbCategories` loaded, we can do the mapping client-side:

```typescript
// Build a categoryId → name lookup from loaded dbCategories
// Then use it when mapping products:
setProducts(data.map(p => {
  const catLabel = dbCategories.find(c => c.id === p.categoria_id)?.label ?? ''
  return {
    id: p.id,
    name: p.nombre,
    category: catLabel,
    price: p.precio,
    imgClass: IMG_CLASS_BY_CATEGORY[catLabel] ?? 'img-drink',
    requiere_cocina: p.requiere_cocina ?? false,
  }
}))
```

**If `getProductsByCategory` DOES join categorias:**
The original mapping (`p.categorias?.nombre`) is correct — no change needed.

### Step 3: Verify TypeScript again after any fix

```bash
cd c:\Users\ear21\OneDrive\Documents\Padel && npx tsc --noEmit --project apps/dashboard/tsconfig.json 2>&1 | head -40
```

### Step 4: Commit only if changes were made

```bash
git add apps/dashboard/src/components/modules/pistas/CourtPOSModal.tsx
git commit -m "fix: correct product mapping in CourtPOSModal based on actual query shape"
```

---

## Verification

After all tasks, manually verify in the browser:

1. Open an occupied court (`status === 'ocupada'`) → `CourtAccountModal` opens → click "+ Agregar" → `CourtPOSModal` opens fullscreen
2. "Extensión" tab is active by default → shows 3 extension products with prices calculated from court hourly rate
3. Click another category (e.g. Bebidas) → products load from DB
4. Add products → ticket accumulates in right panel
5. Cobrar from TicketPanel → success toast, court stays active, modal stays open for more sales
6. Click "■ Finalizar sesión" with empty ticket → `reserva` state changes to `finalizada`, modal closes, court grid refreshes to `disponible`
7. Click "■ Finalizar sesión" with items in ticket → inline confirmation appears in header → click "Finalizar" → session ends
8. Click ✕ with items in ticket → modal closes, session stays active, no data lost on court grid
