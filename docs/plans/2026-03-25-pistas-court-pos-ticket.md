# Court POS Ticket Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow operators to add consumables (drinks, snacks, equipment) to a live ticket for any occupied court, then pay them independently or bundled with the court time charge — all from within `CourtAccountModal`.

**Architecture:** Three changes — (1) a new `CourtProductPickerModal` submodal for browsing/selecting products, (2) a major rewrite of the OCUPADA section in `CourtAccountModal` to hold a live `ticketItems` state with +/- controls and a pay-consumos flow, (3) a small prop addition in `PistasPage` to pass `cajaId` down to `CourtAccountModal`. No new database tables. Consumables that are paid become normal `cuentas` records via the existing `createCuenta` function.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.7, Supabase (PostgREST), inline styles with CSS variables, `sonner` toasts, `lucide-react` icons.

---

## Key Conventions (read before coding)

- **100% inline styles** — no Tailwind, no CSS modules. Use CSS variables: `--color-bg`, `--color-bg2`, `--color-border`, `--color-border-subtle`, `--color-text`, `--color-muted`, `--color-muted-dim`, `--color-lime`, `--font-mono`.
- **CLUB_ID constant** = `'a1000000-0000-0000-0000-000000000001'` (hardcoded throughout project)
- **TAX_RATE = 0.16** (16% IVA applied on post-discount base; consumables in this feature have no discounts)
- **`createCuenta`** signature: `(supabase, clubId, items: CuentaItem[], pagosInput: MetodoPago | PagoInput[], clienteId?, descuentoTotal?, cajaId?)`
- **`CuentaItem`** = `{ producto_id: string; nombre: string; precio_unitario: number; cantidad: number }`
- **`TicketItem`** = `Product & { qty: number }` where `Product` = `{ id, name, category, sub?, price, imgClass }`
- **`Producto`** (from DB) = `{ id, nombre, precio, categoria_id, activo }` — different from `Product` (display type used in POSPage/TicketPanel). You'll need to map Producto → a local item type.
- **`MetodoPago`** = `'efectivo' | 'credito' | 'debito' | 'cortesia'` — imported from `@/lib/supabase/queries/pos`
- **z-index layers**: CourtAccountModal = 1000, CourtProductPickerModal = 1200
- **Overlay click-to-close pattern**: `onClick={(e) => { if (e.target === e.currentTarget) onClose() }}`
- **No test framework** in this project — verification is manual via browser

---

## Task 1: Create `CourtProductPickerModal.tsx`

**Files:**
- Create: `apps/dashboard/src/components/modules/pistas/CourtProductPickerModal.tsx`

### What to build

A modal (z-index 1200) that shows the active product catalog with category tabs. Tapping a product calls `onAdd` and closes.

### Step 1: Create the file with types and skeleton

```tsx
'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getAllActiveProducts, getCategories } from '@/lib/supabase/queries/pos'
import type { Categoria, Producto } from '@/lib/supabase/queries/pos'
import { toast } from 'sonner'

const CLUB_ID = 'a1000000-0000-0000-0000-000000000001'

export interface CourtProductPickerModalProps {
  open: boolean
  onAdd: (product: Producto) => void
  onClose: () => void
}

export function CourtProductPickerModal({ open, onAdd, onClose }: CourtProductPickerModalProps) {
  const [categories, setCategories] = useState<Categoria[]>([])
  const [products, setProducts] = useState<Producto[]>([])
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!open) return
    const supabase = createClient()
    setLoading(true)
    Promise.all([
      getAllActiveProducts(supabase, CLUB_ID),
      getCategories(supabase, CLUB_ID),
    ]).then(([prodsRes, catsRes]) => {
      const cats = (catsRes.data ?? []) as Categoria[]
      const prods = (prodsRes.data ?? []) as Producto[]
      setCategories(cats)
      setProducts(prods)
      if (cats.length > 0) setSelectedCatId(cats[0].id)
    }).catch(() => toast.error('Error cargando productos'))
      .finally(() => setLoading(false))
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
      <div style={{
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
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', padding: '4px', lineHeight: 0 }}>
              <X size={16} />
            </button>
          </div>

          {/* Category tabs */}
          <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '12px', scrollbarWidth: 'none' }}>
            {categories.map(cat => {
              const isActive = selectedCatId === cat.id
              return (
                <button
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
```

### Step 2: Verify TypeScript compiles

```bash
cd apps/dashboard && npx tsc --noEmit 2>&1
```

Expected: 0 errors.

### Step 3: Commit

```bash
git add apps/dashboard/src/components/modules/pistas/CourtProductPickerModal.tsx
git commit -m "feat: add CourtProductPickerModal for court consumables"
```

---

## Task 2: Update `PistasPage.tsx` to pass `cajaId` to `CourtAccountModal`

**Files:**
- Modify: `apps/dashboard/src/components/modules/pistas/PistasPage.tsx`

`PistasPage` already fetches `cajaActiva` state (with `id: string`). You just need to pass it as a prop to `CourtAccountModal`.

### Step 1: Find where `CourtAccountModal` is rendered

Search for `<CourtAccountModal` in `PistasPage.tsx`. It renders when `selectedCourt !== null`.

### Step 2: Add the `cajaId` prop

Find the `<CourtAccountModal` JSX block and add `cajaId={cajaActiva?.id}`:

```tsx
<CourtAccountModal
  court={selectedCourt}
  reserva={reservas.find(r => r.pista_id === selectedCourt.id && (r.estado === 'checkin' || r.estado === 'confirmada')) ?? null}
  onClose={() => setSelectedCourt(null)}
  onRefresh={() => setRefreshKey(k => k + 1)}
  onReservar={() => { setSelectedCourt(null); setShowReservation(true) }}
  onCheckIn={handleCheckInRequest}
  cajaId={cajaActiva?.id}   // ← ADD THIS LINE
/>
```

### Step 3: Verify TypeScript — will fail until Task 3 adds the prop

Skip for now. Run after Task 3.

### Step 4: Commit

```bash
git add apps/dashboard/src/components/modules/pistas/PistasPage.tsx
git commit -m "feat: pass cajaId to CourtAccountModal from PistasPage"
```

---

## Task 3: Rewrite `CourtAccountModal.tsx` OCUPADA section with live ticket

**Files:**
- Modify: `apps/dashboard/src/components/modules/pistas/CourtAccountModal.tsx`

This is the main task. Read the existing file first — focus on the OCUPADA section (lines ~196–303). You will replace the `consumos` state + `getConsumosPorReserva` fetch with a local `ticketItems` state and a full ticket management UI.

### Step 1: Update imports and props

**Replace the existing imports block** with:

```tsx
'use client'

import { useState } from 'react'
import { X, Plus, Minus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { updateReservaEstado } from '@/lib/supabase/queries/pistas'
import { createCuenta, type MetodoPago, type CuentaItem } from '@/lib/supabase/queries/pos'
import type { Producto } from '@/lib/supabase/queries/pos'
import { toast } from 'sonner'
import type { Court } from './PistasPage'
import type { ReservaRow } from '@/lib/supabase/queries/pistas'
import { CourtProductPickerModal } from './CourtProductPickerModal'
```

Note: remove `getConsumosPorReserva` and `ConsumoItem` imports. Remove the `useEffect` import (no longer needed).

**Update Props interface:**

```tsx
interface Props {
  court: Court
  reserva: ReservaRow | null
  onClose: () => void
  onRefresh: () => void
  onReservar?: () => void
  onCheckIn?: (reserva: ReservaRow) => void
  cajaId?: string   // ← NEW
}
```

**Update function signature:**

```tsx
export function CourtAccountModal({ court, reserva, onClose, onRefresh, onReservar, onCheckIn, cajaId }: Props) {
```

### Step 2: Replace state declarations

**Remove:**
```tsx
const [consumos, setConsumos] = useState<ConsumoItem[]>([])
```
and its `useEffect`.

**Add:**
```tsx
const [ticketItems, setTicketItems] = useState<(Producto & { qty: number })[]>([])
const [pickerOpen, setPickerOpen] = useState(false)
// Pay consumos modal
const [consumosPayOpen, setConsumosPayOpen] = useState(false)
const [consumosMetodo, setConsumosMetodo] = useState<MetodoPago>('efectivo')
const [consumosPaying, setConsumosPaying] = useState(false)
// Pay cancha modal
const [canchaPayOpen, setCanchaPayOpen] = useState(false)
const [canchaMetodo, setCanchaMetodo] = useState<MetodoPago>('efectivo')
const [canchaPaying, setCanchaPaying] = useState(false)
const [incluyeConsumos, setIncluyeConsumos] = useState(false)
```

### Step 3: Add ticket management helpers

Add these functions inside the component (before the return statement):

```tsx
const TAX_RATE = 0.16
const CLUB_ID = 'a1000000-0000-0000-0000-000000000001'

function addToTicket(product: Producto) {
  setTicketItems(prev => {
    const existing = prev.find(i => i.id === product.id)
    if (existing) return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i)
    return [...prev, { ...product, qty: 1 }]
  })
}

function updateQty(id: string, delta: number) {
  setTicketItems(prev =>
    prev.map(i => i.id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i)
  )
}

function removeItem(id: string) {
  setTicketItems(prev => prev.filter(i => i.id !== id))
}

function buildCuentaItems(items: (Producto & { qty: number })[]): CuentaItem[] {
  return items.map(i => ({
    producto_id: i.id,
    nombre: i.nombre,
    precio_unitario: i.precio,
    cantidad: i.qty,
  }))
}

function buildCanchaItem(): CuentaItem | null {
  if (!reserva || court.timer === undefined) return null
  const horas = parseFloat((court.timer / 3600).toFixed(4))
  return {
    producto_id: reserva.pista_id,
    nombre: `Tiempo de cancha`,
    precio_unitario: reserva.precio,
    cantidad: horas,
  }
}
```

### Step 4: Add derived value calculations

**Replace** the existing:
```tsx
const costoConsumos = consumos.reduce(...)
const totalGeneral = costoTiempo + costoConsumos
```

**With:**
```tsx
const subtotalConsumos = ticketItems.reduce((s, i) => s + i.precio * i.qty, 0)
const ivaConsumos = subtotalConsumos * TAX_RATE
const totalConsumos = subtotalConsumos + ivaConsumos

const costoTiempo = court.timer !== undefined && reserva
  ? (court.timer / 3600) * reserva.precio
  : 0

const totalCanchaBase = costoTiempo
const totalCanchaConConsumos = costoTiempo + (incluyeConsumos ? totalConsumos : 0)
```

### Step 5: Add pay handlers

```tsx
async function handlePagarConsumos() {
  if (ticketItems.length === 0) return
  setConsumosPaying(true)
  try {
    const supabase = createClient()
    const { error } = await createCuenta(
      supabase,
      CLUB_ID,
      buildCuentaItems(ticketItems),
      consumosMetodo,
      undefined,
      0,
      cajaId,
    )
    if (error) throw error
    setTicketItems([])
    setConsumosPayOpen(false)
    toast.success('Consumos cobrados ✓')
  } catch {
    toast.error('Error al cobrar consumos')
  } finally {
    setConsumosPaying(false)
  }
}

async function handlePagarCancha() {
  if (!reserva) return
  setCanchaPaying(true)
  try {
    const supabase = createClient()
    const canchaItem = buildCanchaItem()
    const items: CuentaItem[] = [
      ...(canchaItem ? [canchaItem] : []),
      ...(incluyeConsumos ? buildCuentaItems(ticketItems) : []),
    ]
    if (items.length > 0) {
      const { error } = await createCuenta(
        supabase,
        CLUB_ID,
        items,
        canchaMetodo,
        undefined,
        0,
        cajaId,
      )
      if (error) throw error
    }
    await updateReservaEstado(supabase, reserva.id, 'finalizada')
    if (incluyeConsumos) setTicketItems([])
    setCanchaPayOpen(false)
    toast.success('Cancha cobrada ✓')
    onRefresh()
    onClose()
  } catch {
    toast.error('Error al cobrar la cancha')
  } finally {
    setCanchaPaying(false)
  }
}
```

### Step 6: Replace the OCUPADA section JSX

Find the `{/* OCUPADA */}` section (starts around line 195) and replace it entirely with:

```tsx
{/* OCUPADA */}
{court.status === 'ocupada' && (
  <>
    <InfoRow label="Titular" value={court.titular ?? 'Sin nombre'} />

    {/* Timer */}
    {court.timer !== undefined && (
      <div style={{
        textAlign: 'center', padding: '20px',
        background: 'var(--color-bg)', borderRadius: '12px',
      }}>
        <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
          Tiempo Transcurrido
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: '36px', fontWeight: 700, letterSpacing: '2px',
          color: (court.timer / (court.maxTime ?? 3600)) >= 1 ? '#EF4444' : (court.timer / (court.maxTime ?? 3600)) >= 0.8 ? '#EAB308' : 'var(--color-lime)',
        }}>
          {formatTimer(court.timer)}
        </div>
        {reserva && (
          <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '4px' }}>
            {fmtTime(reserva.hora_inicio)} — {fmtTime(reserva.hora_fin)} · ${reserva.precio}/hr
          </div>
        )}
      </div>
    )}

    {/* Consumos ticket */}
    <div style={{
      background: 'var(--color-bg)', borderRadius: '10px',
      border: '1px solid var(--color-border-subtle)', overflow: 'hidden',
    }}>
      {/* Consumos header */}
      <div style={{
        padding: '10px 14px',
        borderBottom: ticketItems.length > 0 ? '1px solid var(--color-border-subtle)' : undefined,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Consumos
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: ticketItems.length > 0 ? 'var(--color-text)' : 'var(--color-muted-dim)' }}>
            ${fmt(subtotalConsumos)} MXN
          </span>
          <button
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
        </div>
      </div>

      {/* Items list */}
      {ticketItems.length === 0 ? (
        <div style={{ padding: '10px 14px', fontSize: '12px', color: 'var(--color-muted-dim)', fontFamily: 'var(--font-mono)' }}>
          Sin consumos registrados
        </div>
      ) : (
        <>
          {ticketItems.map(item => (
            <div key={item.id} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '8px 14px',
              borderBottom: '1px solid var(--color-border-subtle)',
              fontSize: '12px',
            }}>
              {/* Qty controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                <button
                  onClick={() => updateQty(item.id, -1)}
                  style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', padding: '2px', lineHeight: 0 }}
                >
                  <Minus size={12} />
                </button>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 700, minWidth: '16px', textAlign: 'center' }}>
                  {item.qty}
                </span>
                <button
                  onClick={() => updateQty(item.id, +1)}
                  style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', padding: '2px', lineHeight: 0 }}
                >
                  <Plus size={12} />
                </button>
              </div>

              {/* Name */}
              <span style={{ flex: 1, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.nombre}
              </span>

              {/* Price */}
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-muted)', flexShrink: 0 }}>
                ${fmt(item.precio * item.qty)}
              </span>

              {/* Remove */}
              <button
                onClick={() => removeItem(item.id)}
                style={{ background: 'none', border: 'none', color: 'var(--color-muted-dim)', cursor: 'pointer', padding: '2px', lineHeight: 0, flexShrink: 0 }}
              >
                <X size={12} />
              </button>
            </div>
          ))}

          {/* Cobrar consumos button */}
          <div style={{ padding: '10px 14px' }}>
            <button
              onClick={() => setConsumosPayOpen(true)}
              style={{
                width: '100%', padding: '8px',
                background: 'transparent',
                border: '1px solid rgba(108,242,13,0.30)',
                borderRadius: '8px',
                color: 'var(--color-lime)', fontSize: '12px', fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Cobrar consumos ${fmt(totalConsumos)} (c/IVA)
            </button>
          </div>
        </>
      )}
    </div>

    {/* Total breakdown */}
    <div style={{
      background: 'rgba(108,242,13,0.06)',
      border: '1px solid rgba(108,242,13,0.15)',
      borderRadius: '10px', overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid rgba(108,242,13,0.10)', fontSize: '12px' }}>
        <span style={{ color: 'var(--color-muted)' }}>Tiempo</span>
        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}>${fmt(costoTiempo)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid rgba(108,242,13,0.10)', fontSize: '12px' }}>
        <span style={{ color: 'var(--color-muted)' }}>Consumos</span>
        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}>${fmt(subtotalConsumos)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', fontSize: '14px', fontWeight: 800 }}>
        <span style={{ color: 'var(--color-text)', textTransform: 'uppercase', letterSpacing: '0.3px', fontSize: '11px' }}>Total a Pagar</span>
        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-lime)', fontSize: '18px' }}>${fmt(costoTiempo + subtotalConsumos)} MXN</span>
      </div>
    </div>

    {/* Action buttons */}
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px' }}>
      <button onClick={handleFinalizar} disabled={updating} style={{ ...dangerBtnStyle, gridColumn: '1' }}>
        {updating ? 'Procesando...' : '■ Finalizar'}
      </button>
      <button
        onClick={() => { setIncluyeConsumos(false); setCanchaPayOpen(true) }}
        disabled={updating}
        style={{ ...primaryBtnStyle, gridColumn: '2' }}
      >
        Cobrar ${fmt(costoTiempo)}
      </button>
    </div>
  </>
)}
```

### Step 7: Add the pay-consumos inline modal

Add this **before** the `<CourtProductPickerModal>` at the end of the main return, inside the outer overlay div:

```tsx
{/* Pay consumos modal */}
{consumosPayOpen && (
  <div
    style={{
      position: 'fixed', inset: 0, zIndex: 1100,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}
    onClick={(e) => { if (e.target === e.currentTarget) setConsumosPayOpen(false) }}
  >
    <div style={{
      background: 'var(--color-bg2)',
      border: '1px solid var(--color-border)',
      borderRadius: '14px', width: '360px', padding: '24px',
      boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
    }}>
      <div style={{ fontSize: '14px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
        Cobrar consumos
      </div>
      <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginBottom: '20px' }}>
        {ticketItems.length} producto{ticketItems.length !== 1 ? 's' : ''} · ${fmt(totalConsumos)} MXN (c/IVA)
      </div>

      {/* Method selector */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '20px' }}>
        {(['efectivo', 'credito', 'debito', 'cortesia'] as MetodoPago[]).map(m => {
          const labels: Record<MetodoPago, string> = { efectivo: '💵 Efectivo', credito: '💳 Crédito', debito: '🏦 Débito', cortesia: '🎁 Cortesía' }
          return (
            <button
              key={m}
              onClick={() => setConsumosMetodo(m)}
              style={{
                padding: '10px 8px', borderRadius: '8px', fontFamily: 'inherit',
                border: consumosMetodo === m ? '1.5px solid var(--color-lime)' : '1px solid var(--color-border)',
                background: consumosMetodo === m ? 'rgba(108,242,13,0.10)' : 'var(--color-bg)',
                color: consumosMetodo === m ? 'var(--color-lime)' : 'var(--color-muted)',
                fontSize: '12px', fontWeight: consumosMetodo === m ? 700 : 500, cursor: 'pointer',
              }}
            >
              {labels[m]}
            </button>
          )
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <button
          onClick={() => setConsumosPayOpen(false)}
          style={{ padding: '11px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '8px', color: 'var(--color-muted)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Cancelar
        </button>
        <button
          onClick={handlePagarConsumos}
          disabled={consumosPaying}
          style={{ padding: '11px', background: consumosPaying ? 'rgba(108,242,13,0.3)' : 'var(--color-lime)', border: 'none', borderRadius: '8px', color: 'var(--color-bg)', fontSize: '12px', fontWeight: 800, cursor: consumosPaying ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
        >
          {consumosPaying ? 'Cobrando...' : `Cobrar $${fmt(totalConsumos)}`}
        </button>
      </div>
    </div>
  </div>
)}
```

### Step 8: Add the pay-cancha modal (with optional consumos toggle)

Add after the pay-consumos modal:

```tsx
{/* Pay cancha modal */}
{canchaPayOpen && (
  <div
    style={{
      position: 'fixed', inset: 0, zIndex: 1100,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}
    onClick={(e) => { if (e.target === e.currentTarget) setCanchaPayOpen(false) }}
  >
    <div style={{
      background: 'var(--color-bg2)',
      border: '1px solid var(--color-border)',
      borderRadius: '14px', width: '360px', padding: '24px',
      boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
    }}>
      <div style={{ fontSize: '14px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '16px' }}>
        Cobrar cancha
      </div>

      {/* Include consumos toggle — only if there are items */}
      {ticketItems.length > 0 && (
        <div
          onClick={() => setIncluyeConsumos(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '10px 12px', marginBottom: '16px',
            background: incluyeConsumos ? 'rgba(108,242,13,0.06)' : 'var(--color-bg)',
            border: `1px solid ${incluyeConsumos ? 'rgba(108,242,13,0.20)' : 'var(--color-border)'}`,
            borderRadius: '8px', cursor: 'pointer',
          }}
        >
          <div style={{
            width: '28px', height: '16px', borderRadius: '8px',
            background: incluyeConsumos ? 'var(--color-lime)' : 'var(--color-border)',
            position: 'relative', flexShrink: 0, transition: 'background 0.2s',
          }}>
            <div style={{
              position: 'absolute', top: '2px',
              left: incluyeConsumos ? '14px' : '2px',
              width: '12px', height: '12px', borderRadius: '50%',
              background: incluyeConsumos ? 'var(--color-bg)' : 'var(--color-muted-dim)',
              transition: 'left 0.2s',
            }} />
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: incluyeConsumos ? 'var(--color-lime)' : 'var(--color-text)' }}>
              Incluir consumos
            </div>
            <div style={{ fontSize: '10px', color: 'var(--color-muted-dim)', marginTop: '1px' }}>
              {ticketItems.map(i => `${i.nombre} ×${i.qty}`).join(', ')}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, color: incluyeConsumos ? 'var(--color-lime)' : 'var(--color-muted)', flexShrink: 0 }}>
            +${fmt(totalConsumos)}
          </div>
        </div>
      )}

      {/* Breakdown */}
      <div style={{ marginBottom: '16px', fontSize: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <span style={{ color: 'var(--color-muted)' }}>Tiempo de cancha</span>
          <span style={{ fontFamily: 'var(--font-mono)' }}>${fmt(costoTiempo)}</span>
        </div>
        {incluyeConsumos && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
            <span style={{ color: 'var(--color-muted)' }}>Consumos (c/IVA)</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>${fmt(totalConsumos)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontWeight: 800 }}>
          <span>Total</span>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-lime)' }}>
            ${fmt(incluyeConsumos ? totalCanchaConConsumos : totalCanchaBase)}
          </span>
        </div>
      </div>

      {/* Method selector */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '20px' }}>
        {(['efectivo', 'credito', 'debito', 'cortesia'] as MetodoPago[]).map(m => {
          const labels: Record<MetodoPago, string> = { efectivo: '💵 Efectivo', credito: '💳 Crédito', debito: '🏦 Débito', cortesia: '🎁 Cortesía' }
          return (
            <button
              key={m}
              onClick={() => setCanchaMetodo(m)}
              style={{
                padding: '10px 8px', borderRadius: '8px', fontFamily: 'inherit',
                border: canchaMetodo === m ? '1.5px solid var(--color-lime)' : '1px solid var(--color-border)',
                background: canchaMetodo === m ? 'rgba(108,242,13,0.10)' : 'var(--color-bg)',
                color: canchaMetodo === m ? 'var(--color-lime)' : 'var(--color-muted)',
                fontSize: '12px', fontWeight: canchaMetodo === m ? 700 : 500, cursor: 'pointer',
              }}
            >
              {labels[m]}
            </button>
          )
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <button
          onClick={() => setCanchaPayOpen(false)}
          style={{ padding: '11px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '8px', color: 'var(--color-muted)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Cancelar
        </button>
        <button
          onClick={handlePagarCancha}
          disabled={canchaPaying}
          style={{ padding: '11px', background: canchaPaying ? 'rgba(108,242,13,0.3)' : 'var(--color-lime)', border: 'none', borderRadius: '8px', color: 'var(--color-bg)', fontSize: '12px', fontWeight: 800, cursor: canchaPaying ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
        >
          {canchaPaying ? 'Cobrando...' : `Cobrar $${fmt(incluyeConsumos ? totalCanchaConConsumos : totalCanchaBase)}`}
        </button>
      </div>
    </div>
  </div>
)}
```

### Step 9: Add CourtProductPickerModal at the end of the return

After the outer overlay closing `</div>` but still inside the fragment/return:

```tsx
<CourtProductPickerModal
  open={pickerOpen}
  onAdd={addToTicket}
  onClose={() => setPickerOpen(false)}
/>
```

Note: The `CourtProductPickerModal` must be rendered **outside** the main modal div but still in the return. The cleanest way is to wrap the entire return in a fragment `<>...</>`.

### Step 10: Verify TypeScript

```bash
cd apps/dashboard && npx tsc --noEmit 2>&1
```

Expected: 0 errors. Fix any type errors before committing.

### Step 11: Commit

```bash
git add apps/dashboard/src/components/modules/pistas/CourtAccountModal.tsx
git commit -m "feat: live consumables ticket in CourtAccountModal with pay flows"
```

---

## Task 4: TypeScript final verification + manual test

### Step 1: Full TypeScript check

```bash
cd apps/dashboard && npx tsc --noEmit 2>&1
```

Expected: 0 errors.

### Step 2: Manual verification checklist

Test in browser with a court in checkin state:

1. **Add consumable:**
   - Open court modal (ocupada) → see "+ Agregar" button in consumos section
   - Click → CourtProductPickerModal opens (above main modal, darkened backdrop)
   - Select category tab → products appear in 3-column grid
   - Tap a product → picker closes, item appears in ticket with qty 1

2. **Adjust qty:**
   - Tap same product again (re-open picker) → qty becomes 2
   - Use − button → qty goes to 1 (min)
   - Use + button → qty increments
   - Use × → item removed from ticket

3. **Pay consumos only:**
   - With items in ticket → "Cobrar consumos $X.XX (c/IVA)" button visible
   - Click → pay consumos modal opens at z-1100
   - Select Efectivo → Cobrar button shows correct total
   - Confirm → ticket clears, toast "Consumos cobrados ✓"
   - Court still active (timer still running)

4. **Pay cancha without consumos:**
   - Add items again → press "Cobrar $X.XX" (cancha button)
   - Pay cancha modal opens
   - Toggle "Incluir consumos" is visible but OFF by default
   - Confirm → court finalizes, items preserved in state (not cleared since toggle was off)

5. **Pay cancha + consumos together:**
   - With items → Cobrar cancha → toggle ON
   - Total updates to include consumos + IVA
   - Select Crédito → Cobrar
   - Court finalizes, ticket items cleared

6. **No items case:**
   - With empty ticket, Cobrar cancha modal has no toggle shown

### Step 3: Final commit

```bash
git add -A
git commit -m "chore: court POS ticket feature complete"
```
