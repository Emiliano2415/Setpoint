# POS → Kitchen Flow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Connect the POS ticket to the kitchen kanban — cashier marks preparable items and sends them to the kitchen manually; kitchen processes them; cashier can pay uncobered comandas directly from the kanban.

**Architecture:** A `requiere_cocina` flag on `productos` identifies preparable items. A new `createComanda()` query creates a `comandas` record (with `cuenta_id = null`) before payment. `ComandasPage` shows a "Sin cobrar" badge on unpaid cards and a `CobrarComandaModal` to collect payment and link the `cuenta_id`. `TicketPanel` gets a "Enviar a cocina" button when preparable items are in the ticket.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.7, Supabase (PostgREST), inline styles with CSS variables, `sonner` for toasts.

---

## Context for implementer

- Working directory: `c:\Users\ear21\OneDrive\Documents\Padel`
- App root: `apps/dashboard/src/`
- `CLUB_ID = 'a1000000-0000-0000-0000-000000000001'` — hardcoded everywhere
- `TAX_RATE = 0.16` — 16% IVA
- All UI uses 100% inline styles + CSS variables: `--color-bg`, `--color-bg2`, `--color-border`, `--color-border-subtle`, `--color-text`, `--color-muted`, `--color-muted-dim`, `--color-lime`, `--font-mono`
- `MetodoPago = 'efectivo' | 'credito' | 'debito' | 'cortesia' | 'cuenta_cliente' | 'bono'`
- `createCuenta(supabase, clubId, items, pagosInput, clienteId?, descuentoTotal?, cajaId?)` — in `lib/supabase/queries/pos.ts`
- No test infrastructure exists in this project — skip test steps, go straight to implement + verify manually + commit
- Design doc: `docs/plans/2026-03-26-pos-to-kitchen-flow-design.md`

---

## Task 1: DB Migrations via Supabase MCP

**Files:**
- No file edits — apply migrations directly via Supabase MCP tools

**Step 1: Apply productos migration**

Use `mcp__plugin_supabase_supabase__apply_migration` with:
```sql
ALTER TABLE productos ADD COLUMN IF NOT EXISTS requiere_cocina BOOLEAN NOT NULL DEFAULT false;
```
Migration name: `add_requiere_cocina_to_productos`

**Step 2: Apply comanda_items migration**

Check if `comanda_items` already has a `producto_id` column. If not:
```sql
ALTER TABLE comanda_items ADD COLUMN IF NOT EXISTS producto_id UUID REFERENCES productos(id);
```
Migration name: `add_producto_id_to_comanda_items`

**Step 3: Add 'cobrado' to ComandaEstado**

Check if `estado` is a Postgres enum (`comanda_estado`) or a text column with a check constraint:
```sql
-- If it's an enum:
ALTER TYPE comanda_estado ADD VALUE IF NOT EXISTS 'cobrado';

-- If it's a check constraint (text column), find and update the constraint:
-- ALTER TABLE comandas DROP CONSTRAINT IF EXISTS comandas_estado_check;
-- ALTER TABLE comandas ADD CONSTRAINT comandas_estado_check
--   CHECK (estado IN ('pendiente', 'preparando', 'listo', 'entregado', 'cobrado'));
```
Migration name: `add_cobrado_to_comanda_estado`

**Step 4: Verify via Supabase**

Run:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'productos' AND column_name = 'requiere_cocina';

SELECT column_name FROM information_schema.columns
WHERE table_name = 'comanda_items' AND column_name = 'producto_id';
```
Expected: both rows return results.

**Step 5: Commit**
```bash
git add -A
git commit -m "feat: DB migrations for requiere_cocina, comanda_items.producto_id, cobrado estado"
```

---

## Task 2: Update `Producto` type and queries in `pos.ts`

**Files:**
- Modify: `apps/dashboard/src/lib/supabase/queries/pos.ts`

**Step 1: Add `requiere_cocina` to the `Producto` interface**

Find this block (around line 14):
```typescript
export interface Producto {
  id: string
  nombre: string
  precio: number
  categoria_id: string
  descripcion?: string | null
  activo: boolean
}
```

Change to:
```typescript
export interface Producto {
  id: string
  nombre: string
  precio: number
  categoria_id: string
  descripcion?: string | null
  activo: boolean
  requiere_cocina: boolean
}
```

**Step 2: Add `requiere_cocina` to all select strings**

Find `getProductsByCategory` — change:
```typescript
.select('id, nombre, precio, categoria_id, descripcion, activo')
```
To:
```typescript
.select('id, nombre, precio, categoria_id, descripcion, activo, requiere_cocina')
```

Do the same for `getAllActiveProducts` and `getAllProducts` — both have the same select string. Update all three.

**Step 3: Add `requiere_cocina` to `updateProducto` fields type**

Find:
```typescript
fields: Partial<{ nombre: string; precio: number; activo: boolean; descripcion: string | null }>,
```
Change to:
```typescript
fields: Partial<{ nombre: string; precio: number; activo: boolean; descripcion: string | null; requiere_cocina: boolean }>,
```

**Step 4: Commit**
```bash
git add apps/dashboard/src/lib/supabase/queries/pos.ts
git commit -m "feat: add requiere_cocina to Producto type and select queries"
```

---

## Task 3: Update `comandas.ts` — new functions and types

**Files:**
- Modify: `apps/dashboard/src/lib/supabase/queries/comandas.ts`

**Step 1: Update `ComandaEstado` type**

Find:
```typescript
export type ComandaEstado = 'pendiente' | 'preparando' | 'listo' | 'entregado'
```
Change to:
```typescript
export type ComandaEstado = 'pendiente' | 'preparando' | 'listo' | 'entregado' | 'cobrado'
```

**Step 2: Make `cuenta_id` nullable in `ComandaFromDB`**

Find the `cuenta_id` field in `ComandaFromDB`:
```typescript
  cuenta_id: {
    numero_ticket: string
    reserva_id: {
      pista_id: {
        nombre: string
      } | null
    } | null
  }
```
Change to:
```typescript
  cuenta_id: {
    numero_ticket: string
    reserva_id: {
      pista_id: {
        nombre: string
      } | null
    } | null
  } | null
```

**Step 3: Update `comanda_items` in `ComandaFromDB` to include `producto_id` fallback**

Find:
```typescript
  comanda_items: {
    id: string
    cantidad: number
    estado: string
    cuenta_item_id: {
      producto_id: {
        nombre: string
      } | null
      precio_unitario: number
    } | null
  }[]
```
Change to:
```typescript
  comanda_items: {
    id: string
    cantidad: number
    estado: string
    producto_id: {
      nombre: string
      precio: number
    } | null
    cuenta_item_id: {
      producto_id: {
        nombre: string
      } | null
      precio_unitario: number
    } | null
  }[]
```

**Step 4: Update `getComandas` select to include the new fields**

Find the select inside `getComandas`. Change:
```typescript
      comanda_items (
        id,
        cantidad,
        estado,
        cuenta_item_id (
          precio_unitario,
          producto_id (
            nombre
          )
        )
      )
```
To:
```typescript
      comanda_items (
        id,
        cantidad,
        estado,
        producto_id (
          nombre,
          precio
        ),
        cuenta_item_id (
          precio_unitario,
          producto_id (
            nombre
          )
        )
      )
```

**Step 5: Add `ComandaItemInput` interface and `createComanda` function**

Add after the existing interfaces, before `getComandas`:
```typescript
export interface ComandaItemInput {
  producto_id: string
  nombre: string
  cantidad: number
  precio_unitario: number
}

export async function createComanda(
  supabase: SupabaseClient,
  clubId: string,
  items: ComandaItemInput[],
  notas?: string,
): Promise<{ data: { id: string } | null; error: Error | null }> {
  const { data: comanda, error: comandaError } = await supabase
    .from('comandas')
    .insert({
      club_id: clubId,
      cuenta_id: null,
      estado: 'pendiente',
      notas: notas ?? null,
    })
    .select('id')
    .single()

  if (comandaError || !comanda) {
    return { data: null, error: comandaError }
  }

  const itemsPayload = items.map((item) => ({
    comanda_id: comanda.id,
    producto_id: item.producto_id,
    cantidad: item.cantidad,
    estado: 'pendiente',
  }))

  const { error: itemsError } = await supabase
    .from('comanda_items')
    .insert(itemsPayload)

  if (itemsError) {
    return { data: null, error: itemsError }
  }

  return { data: { id: comanda.id }, error: null }
}
```

**Step 6: Add `updateComanda` function**

Add after `createComanda`:
```typescript
export async function updateComanda(
  supabase: SupabaseClient,
  comandaId: string,
  fields: Partial<{ cuenta_id: string; estado: ComandaEstado }>,
): Promise<void> {
  const { error } = await supabase
    .from('comandas')
    .update(fields)
    .eq('id', comandaId)

  if (error) throw error
}
```

**Step 7: Commit**
```bash
git add apps/dashboard/src/lib/supabase/queries/comandas.ts
git commit -m "feat: add createComanda, updateComanda, cobrado estado, nullable cuenta_id"
```

---

## Task 4: Update `POSPage` — carry `requiere_cocina` through to `TicketItem`

**Files:**
- Modify: `apps/dashboard/src/components/modules/pos/POSPage.tsx`

The `Product` interface and `TicketItem` type currently don't carry `requiere_cocina`. We need to thread it through from the DB query to the ticket.

**Step 1: Add `requiere_cocina` to `Product` interface**

Find:
```typescript
export interface Product {
  id: string
  name: string
  category: string
  sub?: string
  price: number
  imgClass: string
}
```
Change to:
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
```

**Step 2: Add `requiere_cocina` to the mapped products in both fetch paths**

Inside `fetchProducts`, find the `getAllActiveProducts` mapping block (around line 96):
```typescript
          const mapped: Product[] = (data as RawProduct[]).map((p) => {
            const catNombre = categories.find((c) => c.id === p.categoria_id)?.label ?? ''
            return {
              id: p.id,
              name: p.nombre,
              price: p.precio,
              category: catNombre,
              sub: p.descripcion ?? undefined,
              imgClass: resolveImgClass(catNombre),
            }
          })
```
Change to:
```typescript
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
```

Also update the `getProductsByCategory` mapping block (around line 114):
```typescript
          const mapped: Product[] = data.map((p) => ({
            id: p.id,
            name: p.nombre,
            price: p.precio,
            category: catLabel,
            sub: p.descripcion ?? undefined,
            imgClass: resolveImgClass(catLabel),
          }))
```
Change to:
```typescript
          const mapped: Product[] = data.map((p) => ({
            id: p.id,
            name: p.nombre,
            price: p.precio,
            category: catLabel,
            sub: p.descripcion ?? undefined,
            imgClass: resolveImgClass(catLabel),
            requiere_cocina: p.requiere_cocina,
          }))
```

**Step 3: Commit**
```bash
git add apps/dashboard/src/components/modules/pos/POSPage.tsx
git commit -m "feat: carry requiere_cocina through Product and TicketItem"
```

---

## Task 5: Update `TicketPanel` — "Enviar a cocina" button

**Files:**
- Modify: `apps/dashboard/src/components/modules/pos/TicketPanel.tsx`

**Step 1: Add import for `createComanda`**

At the top, find:
```typescript
import { createCuenta, type MetodoPago, type PagoInput } from '@/lib/supabase/queries/pos'
```
Add after it:
```typescript
import { createComanda } from '@/lib/supabase/queries/comandas'
```

**Step 2: Add kitchen state**

After the existing `useState` declarations (around line 30), add:
```typescript
  const [comandaEnviada, setComandaEnviada] = useState(false)
  const [enviandoComanda, setEnviandoComanda] = useState(false)
```

**Step 3: Reset kitchen state when ticket is cleared**

Find the `resetTicket` function:
```typescript
  function resetTicket() {
    onClear?.()
    setTicketId(`#SP-${Math.floor(Math.random() * 9000 + 1000)}`)
  }
```
Change to:
```typescript
  function resetTicket() {
    onClear?.()
    setTicketId(`#SP-${Math.floor(Math.random() * 9000 + 1000)}`)
    setComandaEnviada(false)
  }
```

**Step 4: Add `handleEnviarACocina` function**

Add after `resetTicket`:
```typescript
  async function handleEnviarACocina() {
    const itemsParaCocina = items.filter(i => i.requiere_cocina)
    if (itemsParaCocina.length === 0) return
    setEnviandoComanda(true)
    const { error } = await createComanda(
      createClient(),
      CLUB_ID,
      itemsParaCocina.map(i => ({
        producto_id: i.id,
        nombre: i.name,
        cantidad: i.qty,
        precio_unitario: i.price,
      })),
    )
    setEnviandoComanda(false)
    if (error) {
      toast.error('Error al enviar a cocina')
    } else {
      setComandaEnviada(true)
      toast.success('Comanda enviada a cocina ✓')
    }
  }
```

**Step 5: Add derived value and UI section**

Find the derived values section (after the state, around line 73 where `subtotal` is calculated). Add after `const total = base + tax`:
```typescript
  const itemsParaCocina = items.filter(i => i.requiere_cocina)
```

**Step 6: Add the kitchen section in JSX**

In the JSX, find the section between the ticket items list and the payment buttons. Look for where the discount/total section ends and the payment buttons begin. Add the following block just before the payment method buttons section:

```tsx
        {/* Kitchen send section */}
        {itemsParaCocina.length > 0 && (
          <div style={{
            margin: '0 0 12px',
            padding: '10px 14px',
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: '10px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
          }}>
            <span style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
              🍳 {itemsParaCocina.length} item{itemsParaCocina.length !== 1 ? 's' : ''} para cocina
            </span>
            <button
              type="button"
              onClick={handleEnviarACocina}
              disabled={comandaEnviada || enviandoComanda}
              style={{
                padding: '5px 12px',
                background: comandaEnviada ? 'transparent' : 'transparent',
                border: comandaEnviada
                  ? '1px solid var(--color-border-subtle)'
                  : '1px solid var(--color-lime)',
                borderRadius: '6px',
                color: comandaEnviada ? 'var(--color-muted)' : 'var(--color-lime)',
                fontSize: '11px', fontWeight: 700,
                cursor: (comandaEnviada || enviandoComanda) ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              {enviandoComanda ? 'Enviando...' : comandaEnviada ? '✓ Enviado a cocina' : 'Enviar a cocina'}
            </button>
          </div>
        )}
```

**Step 7: Commit**
```bash
git add apps/dashboard/src/components/modules/pos/TicketPanel.tsx
git commit -m "feat: add Enviar a cocina button to TicketPanel"
```

---

## Task 6: Update `MenuManagementModal` — "Cocina" toggle per product

**Files:**
- Modify: `apps/dashboard/src/components/modules/pos/MenuManagementModal.tsx`

**Step 1: Add `toggleCocina` function**

After the existing `toggleActivo` function (around line 51), add:
```typescript
  async function toggleCocina(p: Producto) {
    try {
      await updateProducto(supabase, p.id, { requiere_cocina: !p.requiere_cocina })
      setProducts((prev) => prev.map((x) => x.id === p.id ? { ...x, requiere_cocina: !x.requiere_cocina } : x))
    } catch {
      toast.error('Error al actualizar')
    }
  }
```

**Step 2: Add cocina toggle to each product row**

In the product row JSX, find the toggle div for `activo` (around line 193). After the closing `</div>` of that toggle, add the cocina toggle:

```tsx
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
```

**Step 3: Commit**
```bash
git add apps/dashboard/src/components/modules/pos/MenuManagementModal.tsx
git commit -m "feat: add requiere_cocina toggle to MenuManagementModal product rows"
```

---

## Task 7: Create `CobrarComandaModal`

**Files:**
- Create: `apps/dashboard/src/components/modules/comandas/CobrarComandaModal.tsx`

**Step 1: Create the file**

```typescript
'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { createCuenta, type MetodoPago } from '@/lib/supabase/queries/pos'
import { updateComanda } from '@/lib/supabase/queries/comandas'
import type { ComandaFromDB } from '@/lib/supabase/queries/comandas'
import { toast } from 'sonner'

const CLUB_ID = 'a1000000-0000-0000-0000-000000000001'
const TAX_RATE = 0.16

const METODO_LABELS: Record<string, string> = {
  efectivo: '💵 Efectivo',
  credito: '💳 Crédito',
  debito: '🏦 Débito',
  cortesia: '🎁 Cortesía',
}

interface Props {
  comanda: ComandaFromDB
  cajaId?: string
  onClose: () => void
  onSuccess: () => void
}

function fmt(n: number) { return n.toFixed(2) }

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

export function CobrarComandaModal({ comanda, cajaId, onClose, onSuccess }: Props) {
  const [metodo, setMetodo] = useState<MetodoPago>('efectivo')
  const [paying, setPaying] = useState(false)

  // Build items from comanda_items — use cuenta_item_id price if available, else producto.precio
  const items = comanda.comanda_items.map(ci => ({
    producto_id: ci.cuenta_item_id
      ? (ci.cuenta_item_id.producto_id ? '' : '') // will use producto_id fallback
      : (ci.producto_id ? '' : ''),
    // resolve producto_id: prefer cuenta_item_id path, fall back to direct producto_id
    id: ci.id,
    nombre: ci.cuenta_item_id?.producto_id?.nombre ?? ci.producto_id?.nombre ?? 'Producto',
    cantidad: ci.cantidad,
    precio_unitario: ci.cuenta_item_id?.precio_unitario ?? ci.producto_id?.precio ?? 0,
    // we need actual producto_id for createCuenta
    producto_id_real: ci.cuenta_item_id
      ? (ci.cuenta_item_id.producto_id as unknown as { id?: string })?.id ?? ''
      : '',
  }))

  const subtotal = items.reduce((s, i) => s + i.precio_unitario * i.cantidad, 0)
  const iva = subtotal * TAX_RATE
  const total = subtotal + iva

  async function handleCobrar() {
    setPaying(true)

    const cuentaItems = items.map(i => ({
      producto_id: i.producto_id_real,
      nombre: i.nombre,
      precio_unitario: i.precio_unitario,
      cantidad: i.cantidad,
    }))

    const supabase = createClient()

    // 1. Create cuenta
    let cuentaId: string | null = null
    try {
      const { data, error } = await createCuenta(supabase, CLUB_ID, cuentaItems, metodo, undefined, 0, cajaId)
      if (error || !data) throw error
      cuentaId = data.id
    } catch {
      toast.error('Error al registrar el cobro')
      setPaying(false)
      return
    }

    // 2. Link cuenta to comanda and mark cobrado
    try {
      await updateComanda(supabase, comanda.id, { cuenta_id: cuentaId!, estado: 'cobrado' })
    } catch {
      toast.error('Cobro registrado pero no se pudo marcar la comanda como cobrada')
      setPaying(false)
      return
    }

    toast.success('Cobrado ✓')
    onSuccess()
    onClose()
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cobrar comanda"
        style={{
          background: 'var(--color-bg2)',
          border: '1px solid var(--color-border)',
          borderRadius: '14px',
          width: '360px',
          padding: '24px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Cobrar comanda
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '2px' }}>
              {formatTime(comanda.created_at)}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', padding: '4px', lineHeight: 0 }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Items */}
        <div style={{
          background: 'var(--color-bg)',
          borderRadius: '8px',
          overflow: 'hidden',
          marginBottom: '16px',
        }}>
          {items.map((item, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 12px',
                borderBottom: idx < items.length - 1 ? '1px solid var(--color-border-subtle)' : undefined,
                fontSize: '12px',
              }}
            >
              <span style={{ color: 'var(--color-text)' }}>
                {item.cantidad}× {item.nombre}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}>
                ${fmt(item.precio_unitario * item.cantidad)}
              </span>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div style={{ marginBottom: '20px', fontSize: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
            <span style={{ color: 'var(--color-muted)' }}>Subtotal</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>${fmt(subtotal)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: '8px', marginBottom: '8px' }}>
            <span style={{ color: 'var(--color-muted)' }}>IVA (16%)</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>${fmt(iva)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
            <span>Total</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-lime)', fontSize: '16px' }}>${fmt(total)}</span>
          </div>
        </div>

        {/* Payment method */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '20px' }}>
          {(['efectivo', 'credito', 'debito', 'cortesia'] as MetodoPago[]).map(m => (
            <button
              type="button"
              key={m}
              onClick={() => setMetodo(m)}
              style={{
                padding: '10px 8px', borderRadius: '8px', fontFamily: 'inherit',
                border: metodo === m ? '1.5px solid var(--color-lime)' : '1px solid var(--color-border)',
                background: metodo === m ? 'rgba(108,242,13,0.10)' : 'var(--color-bg)',
                color: metodo === m ? 'var(--color-lime)' : 'var(--color-muted)',
                fontSize: '12px', fontWeight: metodo === m ? 700 : 500, cursor: 'pointer',
              }}
            >
              {METODO_LABELS[m]}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '11px', background: 'var(--color-bg)',
              border: '1px solid var(--color-border)', borderRadius: '8px',
              color: 'var(--color-muted)', fontSize: '12px', fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleCobrar}
            disabled={paying}
            style={{
              padding: '11px',
              background: paying ? 'rgba(108,242,13,0.3)' : 'var(--color-lime)',
              border: 'none', borderRadius: '8px',
              color: 'var(--color-bg)', fontSize: '12px', fontWeight: 800,
              cursor: paying ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            }}
          >
            {paying ? 'Cobrando...' : `Cobrar $${fmt(total)}`}
          </button>
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Note on `producto_id` in `createCuenta`**

The `createCuenta` call requires `producto_id` per item. When a comanda has `cuenta_item_id`, the `producto_id` is nested inside it but not selected as a flat string. This means for items created via the normal POS flow (with cuenta_item_id), the `producto_id` needs to be available.

Update the `getComandas` select to also pull `cuenta_item_id.producto_id` as an object with `id`:

In `comandas.ts`, update the select to:
```
cuenta_item_id (
  precio_unitario,
  producto_id (
    id,
    nombre
  )
)
```

And update `ComandaFromDB.comanda_items.cuenta_item_id`:
```typescript
    cuenta_item_id: {
      precio_unitario: number
      producto_id: {
        id: string
        nombre: string
      } | null
    } | null
```

Then in `CobrarComandaModal`, resolve `producto_id_real` as:
```typescript
producto_id_real: ci.cuenta_item_id?.producto_id?.id ?? ci.producto_id ?? ''
```

And for the direct `producto_id` path (pre-payment comanda), update `ComandaFromDB` to store `producto_id` as `string | null` (the UUID) in addition to the joined object:

Actually the simplest fix: in `getComandas` select, for `comanda_items`, select `producto_id` as a flat UUID alongside the join. In PostgREST you can't select both; use the join form and reference `.id`. Make sure `ComandaFromDB.comanda_items.producto_id` has `{ id: string; nombre: string; precio: number } | null`.

**Step 3: Commit**
```bash
git add apps/dashboard/src/components/modules/comandas/CobrarComandaModal.tsx
git commit -m "feat: add CobrarComandaModal for paying comandas from kanban"
```

---

## Task 8: Update `ComandasPage` — badge, Cobrar button, cajaId

**Files:**
- Modify: `apps/dashboard/src/components/modules/comandas/ComandasPage.tsx`

**Step 1: Add import for `CobrarComandaModal`**

At the top add:
```typescript
import { CobrarComandaModal } from './CobrarComandaModal'
```

**Step 2: Add state for cobrar modal**

Inside `ComandasPage`, after the existing state declarations, add:
```typescript
  const [cobrarComanda, setCobrarComanda] = useState<ComandaFromDB | null>(null)
```

**Step 3: Add `cajaId` prop**

Change the component signature from:
```typescript
export function ComandasPage() {
```
To:
```typescript
interface Props {
  cajaId?: string
}

export function ComandasPage({ cajaId }: Props) {
```

**Step 4: Add `cobrado` to `COLUMNS` and `NEXT_STATUS`**

`cobrado` should not appear as a column (it's hidden like entregado). Update `NEXT_STATUS`:
```typescript
const NEXT_STATUS: Record<ComandaEstado, ComandaEstado | null> = {
  pendiente:  'preparando',
  preparando: 'listo',
  listo:      'entregado',
  entregado:  null,
  cobrado:    null,
}
```

**Step 5: Update `isRecentlyDelivered` to include `cobrado`**

The function name is fine — `cobrado` items should also hide after 30 min. The existing filter `col.id === 'entregado'` in the column rendering needs to also filter `cobrado`. But since `cobrado` isn't a column, `cobrado` items simply won't show up in any column. That's correct behavior — they disappear from the kanban once paid.

Actually, verify: `cobrado` items won't be in any column since there's no `cobrado` column. They'll just not render. That's the desired behavior. No change needed here.

**Step 6: Add "Sin cobrar" badge and Cobrar button to kanban card**

In the card JSX (inside `colItems.map`), find the ticket number / time row:
```tsx
                    {/* Ticket + hora */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '6px',
                      }}
                    >
                      <span ...>
                        {item.cuenta_id?.numero_ticket ?? '—'}
                      </span>
```

After the ticket number row closing `</div>`, add the badge:
```tsx
                    {/* Sin cobrar badge */}
                    {!item.cuenta_id && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '4px',
                        marginBottom: '6px',
                      }}>
                        <span style={{
                          fontSize: '10px', fontWeight: 700,
                          color: '#F97316',
                          padding: '2px 7px', borderRadius: '6px',
                          background: 'rgba(249,115,22,0.12)',
                          border: '1px solid rgba(249,115,22,0.25)',
                        }}>
                          ● Sin cobrar
                        </span>
                      </div>
                    )}
```

At the bottom of the card (after the items list, alongside or replacing the advance-status CTA), add the cobrar button when `!item.cuenta_id`:
```tsx
                    {/* Cobrar button for uncobered comandas */}
                    {!item.cuenta_id && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setCobrarComanda(item) }}
                        style={{
                          marginTop: '10px',
                          width: '100%',
                          padding: '6px',
                          background: 'transparent',
                          border: '1px solid rgba(249,115,22,0.35)',
                          borderRadius: '6px',
                          color: '#F97316',
                          fontSize: '11px', fontWeight: 700,
                          cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        Cobrar
                      </button>
                    )}
```

Note: `e.stopPropagation()` prevents the card's `onClick` (advance status) from firing when the button is clicked.

**Step 7: Render `CobrarComandaModal` at end of component**

Before the closing `</div>` of the return, add:
```tsx
      {cobrarComanda && (
        <CobrarComandaModal
          comanda={cobrarComanda}
          cajaId={cajaId}
          onClose={() => setCobrarComanda(null)}
          onSuccess={() => { setCobrarComanda(null); fetchComandas() }}
        />
      )}
```

**Step 8: Update parent layout to pass `cajaId` to `ComandasPage`**

Find where `ComandasPage` is rendered in the app (likely in `apps/dashboard/src/app/` layout or page file). Read that file and add `cajaId` prop — it should be fetched the same way as in `POSPage` via `getCajaActiva`.

**Step 9: Commit**
```bash
git add apps/dashboard/src/components/modules/comandas/ComandasPage.tsx
git commit -m "feat: add Sin cobrar badge, Cobrar button, and CobrarComandaModal to ComandasPage"
```

---

## Task 9: TypeScript verification

**Step 1: Run tsc**
```bash
cd apps/dashboard && npx tsc --noEmit 2>&1 | head -60
```

Expected: no errors. Fix any type errors that arise, particularly around:
- `ComandaFromDB.cuenta_id` being nullable (update any non-null assertions in `ComandasPage`)
- `producto_id` resolution in `CobrarComandaModal`
- `Product.requiere_cocina` not found in places that spread `Product`

**Step 2: Fix any errors found, commit fixes**
```bash
git add -A
git commit -m "fix: TypeScript errors in POS kitchen flow"
```

---

## Task 10: Final end-to-end verification checklist

Manual verification steps (no automated tests):

1. Go to **Gestionar Menú** → toggle the 🍳 icon on a food product → confirm it persists on reload
2. Add that food product to a POS ticket → confirm the "🍳 N items para cocina" badge appears
3. Press **Enviar a cocina** → confirm toast "Comanda enviada a cocina ✓" + button changes to "✓ Enviado a cocina"
4. Open **Comandas** page → confirm new card appears in Pendiente column with "● Sin cobrar" badge
5. Advance the comanda through states (click cards)
6. Click **Cobrar** on the card → confirm `CobrarComandaModal` opens with correct items and total
7. Select a payment method and confirm → toast "Cobrado ✓", card disappears from kanban
8. Go back to POS, complete payment on same ticket → confirm normal POS flow still works unchanged
9. Add a non-food item (e.g. a pala/paddle) → confirm no kitchen badge appears

**Step 1: Commit final verification note**
```bash
git add -A
git commit -m "feat: POS to kitchen flow complete - manual verification passed"
```
