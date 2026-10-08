# Design: Court POS Ticket — Consumos y Cobro desde CourtAccountModal

**Date:** 2026-03-25
**Status:** Approved

---

## Overview

When a court is in `checkin` (occupied) status, the operator needs to be able to add consumables (drinks, snacks, equipment) to a running ticket for that court session — and optionally include those items (plus the court time cost) in a single unified payment at checkout.

This is a POS-within-Pistas feature: full product catalog access, live ticket management, and standard payment flow, all from `CourtAccountModal`.

---

## Decisions Made

1. **Product picker**: Submodal (Option B) — opens above CourtAccountModal at z-index 1200 with category tabs + product grid
2. **Payment flow**: Standard POS-style (Option A) — generates a `cuentas` row + `movimientos_caja` entry via `createCuenta`, same as regular POS tickets
3. **Flexible checkout**: When paying the court, operator can optionally include pending consumables in the same ticket (toggle in pay modal)
4. **No new DB schema** — consumables are stored as local React state during the session; once paid they become normal `cuentas` records. The existing `consumos`/`comandas` table read is removed from `CourtAccountModal` in favor of this live local ticket approach.

---

## Part 1: CourtProductPickerModal

### New file
`apps/dashboard/src/components/modules/pistas/CourtProductPickerModal.tsx`

### Props
```typescript
interface CourtProductPickerModalProps {
  open: boolean
  onAdd: (product: Product) => void
  onClose: () => void
}
// Product imported from '@/lib/supabase/queries/pos'
```

### Behavior
- Fetches `getAllActiveProducts(supabase, CLUB_ID)` + `getCategories(supabase, CLUB_ID)` on open (or once on mount)
- Shows horizontal scrollable category tabs (same pill style as MenuManagementModal)
- Below tabs: 3-column grid of product cards — name + price, lime accent on tap
- Tapping a product calls `onAdd(product)` and closes the modal
- Overlay click-outside → onClose
- z-index: 1200 (above CourtAccountModal at 1000)
- Width: 420px, max-height: 80vh

### Product card style
Compact: `background: var(--color-bg)`, border, rounded 10px, product name (13px bold), price (monospace lime). No images/gradients (space is limited).

---

## Part 2: CourtAccountModal — ticket state

### Replaces
Remove `consumos: ConsumoItem[]` state and `getConsumosPorReserva` fetch. Replace with local ticket state.

### New state
```typescript
const [ticketItems, setTicketItems] = useState<TicketItem[]>([])
const [pickerOpen, setPickerOpen] = useState(false)
const [payConsumos, setPayConsumos] = useState(false)         // pay modal for consumos only
const [payCancha, setPayCancha] = useState(false)             // pay modal for court (existing)
const [incluyeConsumos, setIncluyeConsumos] = useState(false) // toggle in court pay modal

// TicketItem = Product & { qty: number }
// Product from '@/lib/supabase/queries/pos'
```

### addToTicket / updateQty / removeItem
```typescript
function addToTicket(product: Product) {
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
```

### Derived values
```typescript
const subtotalConsumos = ticketItems.reduce((s, i) => s + i.price * i.qty, 0)
const TAX_RATE = 0.16
const baseConsumos = subtotalConsumos          // no discounts for court consumables
const ivaConsumos = baseConsumos * TAX_RATE
const totalConsumos = baseConsumos + ivaConsumos

const costoTiempo = court.timer !== undefined && reserva
  ? (court.timer / 3600) * reserva.precio
  : 0

// When paying court + consumos together:
const totalCancha = costoTiempo + (incluyeConsumos ? totalConsumos : 0)
```

---

## Part 3: UI changes in CourtAccountModal (OCUPADA section)

### Consumos section (replaces old read-only list)

```
┌─────────────────────────────────────────────────────┐
│  CONSUMOS                   $0.00    [+ Agregar]    │
├─────────────────────────────────────────────────────┤
│  Sin consumos registrados                           │
└─────────────────────────────────────────────────────┘
```

When items exist:
```
┌─────────────────────────────────────────────────────┐
│  CONSUMOS                  $85.00    [+ Agregar]    │
├─────────────────────────────────────────────────────┤
│  [−] 2× Agua Mineral 600ml          $60.00   [×]   │
│  [−] 1× Isotónico 600ml             $45.00   [×]   │
└─────────────────────────────────────────────────────┘
```

- `[+ Agregar]` → `setPickerOpen(true)`
- `[−]` → `updateQty(id, -1)` (min 1)
- `[+]` → `updateQty(id, +1)`
- `[×]` → `removeItem(id)`
- Below the list: `[COBRAR CONSUMOS $X.XX]` button — only visible when `ticketItems.length > 0`

### COBRAR CONSUMOS button
Opens a simple pay method selector (same inline style as SplitAccountModal's MethodSelector):
```
¿Cómo paga los consumos?
[ Efectivo ]  [ Crédito ]  [ Débito ]  [ Cortesía ]
[Cancelar]                            [Cobrar $X.XX]
```
On confirm:
- Calls `createCuenta(supabase, CLUB_ID, buildCuentaItems(ticketItems), metodo, undefined, 0, cajaId)`
- `numero_ticket` format: `CT-{timestamp}` (Court Ticket)
- On success: `setTicketItems([])` + toast "Consumos cobrados ✓"
- On error: toast error, items preserved

### Total breakdown (updated)
```
Tiempo          $X.XX
Consumos        $X.XX    ← shows 0.00 if no items, always visible
──────────────────────
Total a Pagar   $X.XX MXN
```

### COBRAR (court) button — flexible toggle
When `ticketItems.length > 0`, the court pay modal shows an extra toggle:

```
COBRAR CANCHA

[ ] Incluir consumos ($85.00 + IVA)      ← toggle off by default
    Agua Mineral ×2, Isotónico ×1

Tiempo de cancha:     $7.50
Consumos (con IVA):   $0.00
─────────────────────────────
Total:               $7.50

[ Efectivo ] [ Crédito ] [ Débito ] [ Cortesía ]

[Cancelar]                    [COBRAR $7.50]
```

When toggle ON → total updates to include consumos + IVA.

On confirm:
- If `incluyeConsumos = false`: only `createCuenta` with time cost item, then `updateReservaEstado('finalizada')`
- If `incluyeConsumos = true`: `createCuenta` with time item + all consumo items, then `updateReservaEstado('finalizada')`, then `setTicketItems([])`

---

## Part 4: CajaId in CourtAccountModal

`CourtAccountModal` needs `cajaId` to pass to `createCuenta`. Two options:
- **A)** Pass it as prop from `PistasPage` (already fetches `cajaActiva`)
- **B)** Fetch it independently inside the modal

**Decision:** Option A — pass as prop from `PistasPage`. `PistasPage` already has `cajaActiva` state. Add `cajaId?: string` prop to `CourtAccountModal`.

---

## Part 5: CuentaItems builder

```typescript
function buildCuentaItems(items: TicketItem[]): CuentaItem[] {
  return items.map(i => ({
    producto_id: i.id,
    nombre: i.name,
    precio_unitario: i.price,
    cantidad: i.qty,
  }))
}

// For court time (when paying cancha):
function buildCanchaItem(reserva: ReservaRow, segundos: number): CuentaItem {
  const horas = segundos / 3600
  return {
    producto_id: reserva.pista_id,    // pista ID as pseudo-product
    nombre: `Tiempo de cancha`,
    precio_unitario: reserva.precio,
    cantidad: parseFloat(horas.toFixed(4)),
  }
}
```

---

## Files to Create/Modify

| File | Change |
|---|---|
| `components/modules/pistas/CourtProductPickerModal.tsx` | New — product picker submodal |
| `components/modules/pistas/CourtAccountModal.tsx` | Major — replace consumos state, add ticket UI, pay modals, cajaId prop |
| `components/modules/pistas/PistasPage.tsx` | Minor — pass `cajaId` prop to CourtAccountModal |

---

## Verification

1. **Add consumos flow:**
   - Click "+ Agregar" on occupied court → CourtProductPickerModal opens at z-1200
   - Select product → appears in ticket with qty 1
   - Tap same product again → qty becomes 2
   - Adjust qty with +/- buttons
   - Remove item with ×

2. **Pay consumos only:**
   - With items in ticket, press "COBRAR CONSUMOS $X.XX"
   - Select payment method, confirm
   - Ticket clears, toast "Consumos cobrados ✓"
   - In Caja → movimiento visible

3. **Pay court only (no consumos):**
   - Press COBRAR → toggle off (default)
   - Pay → finalizes court, consumos remain in ticket (not lost)

4. **Pay court + consumos together:**
   - Press COBRAR → toggle ON → total includes consumos
   - Pay → single cuentas entry with time + consumo items
   - Court finalized, ticket cleared

5. **No regression:**
   - Disponible, Reservada, Mantenimiento states still work unchanged
   - CheckInPaymentModal still works
   - POS module unaffected
