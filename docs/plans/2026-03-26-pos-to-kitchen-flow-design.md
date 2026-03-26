# Design: POS → Kitchen (Comandas) Flow

**Date:** 2026-03-26
**Status:** Approved

## Context

The padel club dashboard has a working POS (ticket builder + payment) and a working kitchen kanban board (comandas). The missing link is the bridge: food/drink items added to a POS ticket need to reach the kitchen, and uncobered comandas need to be payable from the kanban.

## Decisions Made

| Question | Answer |
|---|---|
| Which products go to kitchen? | Only products with `requiere_cocina = true` (flag per product) |
| When is the comanda sent? | Manually — cashier presses "Enviar a cocina" before or after payment |
| One comanda or many? | One comanda per ticket send action (all preparable items together) |
| Comanda before or after payment? | Before — `cuenta_id` is nullable; kitchen starts without needing payment |
| How to identify unpaid comandas? | Badge on kanban card + inline "Cobrar" button |

---

## Part 1 — DB Migration

```sql
-- Add kitchen flag to productos
ALTER TABLE productos ADD COLUMN IF NOT EXISTS requiere_cocina BOOLEAN NOT NULL DEFAULT false;

-- Add 'cobrado' status to comandas (extend existing enum or use check constraint)
-- If ComandaEstado is a Postgres enum:
ALTER TYPE comanda_estado ADD VALUE IF NOT EXISTS 'cobrado';
-- If it's a check constraint on a text column, add 'cobrado' to the allowed values.
```

**No other schema changes needed.** The `comandas.cuenta_id` FK is already nullable.

---

## Part 2 — Type & Query Changes (`pos.ts` and `comandas.ts`)

### `pos.ts` — extend `Producto`

```typescript
export interface Producto {
  id: string
  nombre: string
  precio: number
  categoria_id: string
  descripcion?: string | null
  activo: boolean
  requiere_cocina: boolean   // NEW
}
```

All queries that select productos must add `requiere_cocina` to the select string.

### `comandas.ts` — new functions

**`createComanda`**
```typescript
export interface ComandaItemInput {
  producto_id: string
  nombre: string        // for display only
  cantidad: number
  precio_unitario: number
}

export async function createComanda(
  supabase: SupabaseClient,
  clubId: string,
  items: ComandaItemInput[],
  notas?: string,
): Promise<{ data: { id: string } | null; error: Error | null }>
```

Inserts:
1. `comandas` row: `{ club_id, cuenta_id: null, estado: 'pendiente', notas }`
2. `comanda_items` rows: `{ comanda_id, cantidad, producto_id }` — `cuenta_item_id` is null at this stage

**`updateComanda`**
```typescript
export async function updateComanda(
  supabase: SupabaseClient,
  comandaId: string,
  fields: Partial<{ cuenta_id: string; estado: ComandaEstado }>,
): Promise<void>
```

Used to link a `cuenta_id` after payment and/or set `estado = 'cobrado'`.

### `ComandaEstado` type update

```typescript
export type ComandaEstado = 'pendiente' | 'preparando' | 'listo' | 'entregado' | 'cobrado'
```

### `ComandaFromDB` query update

The `getComandas` query must also select `cuenta_id` as a nullable field (it currently expects an object with `numero_ticket`). Update the select to handle `cuenta_id` being null:

```typescript
cuenta_id: {
  numero_ticket: string
  reserva_id: { pista_id: { nombre: string } | null } | null
} | null   // was non-nullable before
```

---

## Part 3 — TicketPanel UI changes

**State additions:**
```typescript
const [comandaEnviada, setComandaEnviada] = useState(false)
const [comandaId, setComandaId] = useState<string | null>(null)
```

Reset both when ticket is cleared.

**Derived value:**
```typescript
const itemsParaCocina = ticketItems.filter(i => i.requiere_cocina)
```

**UI additions (below ticket items list, above payment buttons):**

When `itemsParaCocina.length > 0`:
- Badge: `🍳 {N} item(s) para cocina` (small, muted)
- Button `[Enviar a cocina]`:
  - Active (lime outline) when `!comandaEnviada`
  - Disabled with label `✓ Enviado a cocina` when `comandaEnviada`
  - On click: calls `createComanda`, sets `comandaEnviada = true`, `comandaId = result.id`, toast "Comanda enviada a cocina ✓"

The payment flow is unchanged — cobrar works independently of whether comanda was sent.

---

## Part 4 — MenuManagementModal changes

Each product row gets a second toggle: **"Cocina"** next to the existing **"Activo"** toggle.

- Toggle calls `updateProducto(supabase, id, { requiere_cocina: !p.requiere_cocina })`
- Visually: small pill toggle labeled "🍳 Cocina", same style as Activo toggle
- Only show for products that logically need it — but no category filtering in UI, admin decides per product

---

## Part 5 — ComandasPage changes

### Kanban card — "Sin cobrar" badge

For every comanda where `cuenta_id === null`:
- Show badge `● Sin cobrar` (orange, `#F97316`) between the ticket number row and the station/court row
- Show button `[Cobrar]` at the bottom of the card (orange outline, replaces the advance-status CTA area... or sits below it)
- Clicking `[Cobrar]` opens `CobrarComandaModal` for that comanda

### `CobrarComandaModal` (new component)

**Props:** `comanda: ComandaFromDB`, `cajaId?: string`, `onClose()`, `onSuccess()`

**Contents:**
- Header: "Cobrar comanda" + creation time
- Read-only item list: `{cantidad}x {nombre}` with `${precio_unitario}` per item
- Totals: Subtotal, IVA (16%), **Total**
- Payment method selector: Efectivo / Crédito / Débito / Cortesía (2×2 grid, same style as CourtAccountModal)
- Buttons: `[Cancelar]` + `[Cobrar $X.XX]`

**On confirm:**
1. Build `CuentaItem[]` from `comanda.comanda_items` (using `precio_unitario` from `cuenta_item_id`)
2. `createCuenta(supabase, CLUB_ID, items, metodo, undefined, 0, cajaId)` → `cuentaId`
3. `updateComanda(supabase, comanda.id, { cuenta_id: cuentaId, estado: 'cobrado' })`
4. Toast "Cobrado ✓", close modal, `onSuccess()` triggers kanban refresh

### `getComandas` query — include `cobrado` estado

The current query fetches today's comandas ordered by `created_at`. `cobrado` comandas should be treated like `entregado` — visible for 30 min, then hidden. No new column needed; the existing `HIDE_AFTER_MS` logic applies to both.

### `cajaId` prop

`ComandasPage` needs `cajaId?: string` prop passed from its parent layout, same pattern as `POSPage`. This is needed to register the payment in `movimientos_caja`.

---

## Part 6 — `comanda_items` schema note

Currently `comanda_items.cuenta_item_id` is used to resolve the product name and price in the kanban display. When a comanda is created *before* payment, `cuenta_item_id` will be null.

To display product names on the kanban card for pre-payment comandas, `createComanda` must also store `producto_id` directly on `comanda_items`. Check whether the `comanda_items` table already has a `producto_id` column — if not, this migration is also needed:

```sql
ALTER TABLE comanda_items ADD COLUMN IF NOT EXISTS producto_id UUID REFERENCES productos(id);
```

The `getComandas` query must then select `producto_id(nombre)` as a fallback when `cuenta_item_id` is null:

```typescript
comanda_items (
  id,
  cantidad,
  estado,
  producto_id ( nombre ),          // fallback for pre-payment comandas
  cuenta_item_id (
    precio_unitario,
    producto_id ( nombre )
  )
)
```

Display logic: `ci.cuenta_item_id?.producto_id?.nombre ?? ci.producto_id?.nombre ?? 'Producto'`

---

## Data Flow Summary

```
Cashier adds items to POS ticket
         ↓
[Enviar a cocina] pressed
         ↓
createComanda() → comandas row (cuenta_id=null) + comanda_items (producto_id set, cuenta_item_id=null)
         ↓
Kitchen kanban shows card with "● Sin cobrar" badge
         ↓
Kitchen advances: pendiente → preparando → listo → entregado
         ↓
Cashier sees "Sin cobrar" badge, presses [Cobrar]
         ↓
CobrarComandaModal opens with items pre-loaded
         ↓
createCuenta() → cuentas + cuenta_items + pagos + movimientos_caja
updateComanda() → cuenta_id linked, estado = 'cobrado'
         ↓
Card disappears from kanban after 30 min (same as entregado)
```

---

## Files Changed Summary

| File | Change |
|---|---|
| `lib/supabase/queries/pos.ts` | Add `requiere_cocina` to `Producto` type + all select strings |
| `lib/supabase/queries/comandas.ts` | `createComanda()`, `updateComanda()`, `ComandaEstado` + `'cobrado'`, nullable `cuenta_id` in `ComandaFromDB`, `comanda_items` fallback select |
| `components/modules/pos/TicketPanel.tsx` | `itemsParaCocina` derived, `[Enviar a cocina]` button, `comandaEnviada` state |
| `components/modules/pos/MenuManagementModal.tsx` | "🍳 Cocina" toggle per product row |
| `components/modules/comandas/ComandasPage.tsx` | "Sin cobrar" badge on cards, `[Cobrar]` button, `cajaId` prop, `cobrado` in COLUMNS |
| `components/modules/comandas/CobrarComandaModal.tsx` | New component |
| DB migrations | `productos.requiere_cocina`, `comanda_estado + 'cobrado'`, `comanda_items.producto_id` |
