# CheckInPaymentModal Three-Mode Payment Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Adapt `CheckInPaymentModal` to support three payment modes — single method, split payment (cash+card), and split by person — mirroring the `CobrarComandaModal` pattern.

**Architecture:** The modal becomes self-contained: it receives `cajaId`, `supabase`, and reservation data, handles all payment logic internally, and calls `onSuccess()` when done. `PistasPage` is updated to match the new props signature. Check-in always occurs immediately on confirm regardless of payment mode.

**Tech Stack:** React 19, TypeScript 5.7, Supabase client, inline styles, CSS vars

---

## Key Context

### Current flow (before this plan)
`PistasPage` passes `onConfirm: (metodo: MetodoPago) => void` to `CheckInPaymentModal`, then does the actual `checkInWithPayment()` call itself in `handleCheckInConfirm`.

### New flow (after this plan)
`CheckInPaymentModal` receives `cajaId`, `supabase`, `reserva`, `pistaNombre`, `clienteNombre?` and does ALL payment + check-in logic internally. It calls `onSuccess()` when complete and `onCancel()` when dismissed.

### Functions available
- `checkInWithPayment(supabase, reservaId, precio, metodo, cajaId, concepto)` — in `@/lib/supabase/queries/pistas` — does check-in + single movimiento_caja
- `createCuenta(supabase, clubId, items, pagosInput, clienteId?, descuentoTotal?, cajaId?)` — in `@/lib/supabase/queries/pos` — creates cuenta with multiple pagos
- `updateReservaEstado(supabase, reservaId, 'checkin')` — in `@/lib/supabase/queries/pistas`
- `SplitAccountModal` — from `@/components/modules/pos/SplitAccountModal` — props: `{ open, items: TicketItem[], cajaId, onConfirm: (splits: PersonSplit[]) => Promise<void>, onCancel }`
- `insertMovimientoCaja` is NOT directly importable from CheckInPaymentModal — use `checkInWithPayment` or `createCuenta` instead

### Split payment for a cancha
For split-payment (cash+card) mode, the court fee has no individual line items — it's a single fee. We use `createCuenta` with two `PagoInput[]` entries (efectivo + tarjeta), and ALSO call `updateReservaEstado(..., 'checkin')` separately (since `checkInWithPayment` only handles single-metodo). The `createCuenta` inserts `movimientos_caja` via the existing cajaId logic.

### Split account for a cancha
The court fee is treated as one line item: `{ id: reserva.id, name: pistaNombre, price: reserva.precio, qty: 1, category: '', imgClass: '', requiere_cocina: false }`. `SplitAccountModal` handles item-by-person assignment. On confirm, for each split: call `createCuenta(supabase, CLUB_ID, splitItems, split.metodo, undefined, 0, cajaId)`. After all splits succeed, call `updateReservaEstado(supabase, reservaId, 'checkin')`.

### CLUB_ID
`'a1000000-0000-0000-0000-000000000001'`

### CSS variables
`--color-bg`, `--color-bg2`, `--color-border`, `--color-border-subtle`, `--color-text`, `--color-muted`, `--color-muted-dim`, `--color-lime`, `--font-mono`

---

## Task 1: Rewrite `CheckInPaymentModal.tsx`

**File:** `apps/dashboard/src/components/modules/pistas/CheckInPaymentModal.tsx`

Replace the entire file with the three-mode version.

### Step 1: Read the current file

```
Read: apps/dashboard/src/components/modules/pistas/CheckInPaymentModal.tsx
```

### Step 2: Replace with the full three-mode implementation

The new file must implement exactly this:

```typescript
'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { MetodoPago } from '@/lib/supabase/queries/caja'
import type { ReservaRow } from '@/lib/supabase/queries/pistas'
import { checkInWithPayment, updateReservaEstado } from '@/lib/supabase/queries/pistas'
import { createCuenta } from '@/lib/supabase/queries/pos'
import type { PagoInput } from '@/lib/supabase/queries/pos'
import { SplitAccountModal } from '@/components/modules/pos/SplitAccountModal'
import type { PersonSplit } from '@/components/modules/pos/SplitAccountModal'
import type { TicketItem } from '@/components/modules/pos/POSPage'

const CLUB_ID = 'a1000000-0000-0000-0000-000000000001'

type PayMode = 'single' | 'split-payment' | 'split-account'

interface CheckInPaymentModalProps {
  open: boolean
  reserva: ReservaRow
  pistaNombre: string
  clienteNombre?: string
  cajaId: string | undefined
  supabase: SupabaseClient
  onSuccess: () => void
  onCancel: () => void
}
```

**State:**
```typescript
const [mode, setMode] = useState<PayMode | null>(null)
const [selectedMetodo, setSelectedMetodo] = useState<MetodoPago | null>(null)
const [splitEfectivo, setSplitEfectivo] = useState('')
const [splitAccountOpen, setSplitAccountOpen] = useState(false)
const [paying, setPaying] = useState(false)
```

**Reset on open:**
```typescript
useEffect(() => {
  if (open) {
    setMode(null)
    setSelectedMetodo(null)
    setSplitEfectivo('')
    setSplitAccountOpen(false)
  }
}, [open])
```

**`selectMode` helper** — clicking active mode collapses it:
```typescript
function selectMode(m: PayMode) {
  if (m === 'split-account') {
    setSplitAccountOpen(true)
    return
  }
  setMode((prev) => (prev === m ? null : m))
  setSelectedMetodo(null)
  setSplitEfectivo('')
}
```

**`handleSinglePay`:**
```typescript
async function handleSinglePay() {
  if (!selectedMetodo || paying) return
  setPaying(true)
  try {
    const concepto = buildConcepto()
    await checkInWithPayment(supabase, reserva.id, reserva.precio ?? 0, selectedMetodo, cajaId!, concepto)
    toast.success('¡Check-in realizado!')
    onSuccess()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Error al hacer check-in')
  } finally {
    setPaying(false)
  }
}
```

Note: if `cajaId` is undefined, fall back to `updateReservaEstado` only (no caja registration).

**`handleSplitPay`:**
```typescript
async function handleSplitPay() {
  const total = reserva.precio ?? 0
  const efectivoNum = parseFloat(splitEfectivo) || 0
  const tarjeta = Math.max(0, total - efectivoNum)
  if (paying) return
  setPaying(true)
  try {
    const pagos: PagoInput[] = []
    if (efectivoNum > 0) pagos.push({ metodo: 'efectivo', monto: Math.min(efectivoNum, total) })
    if (tarjeta > 0) pagos.push({ metodo: 'credito', monto: tarjeta })
    if (pagos.length === 0) return

    // Build a single "cancha" line item for createCuenta
    const items = [{ producto_id: reserva.id, nombre: pistaNombre, precio_unitario: total, cantidad: 1 }]
    const { error } = await createCuenta(supabase, CLUB_ID, items, pagos, undefined, 0, cajaId)
    if (error) throw error

    // Check-in the reservation
    await updateReservaEstado(supabase, reserva.id, 'checkin')
    toast.success('¡Check-in realizado! Pago dividido registrado.')
    onSuccess()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Error al procesar pago')
  } finally {
    setPaying(false)
  }
}
```

**`handleConfirmSplitAccount`:**
```typescript
async function handleConfirmSplitAccount(splits: PersonSplit[]) {
  if (splits.length === 0) return
  setPaying(true)
  try {
    for (const split of splits) {
      const splitItems = split.items.map((i) => ({
        producto_id: i.producto_id,
        nombre: i.nombre,
        precio_unitario: i.precio_unitario,
        cantidad: i.cantidad,
      }))
      const { error } = await createCuenta(supabase, CLUB_ID, splitItems, split.metodo, undefined, 0, cajaId)
      if (error) throw error
    }
    await updateReservaEstado(supabase, reserva.id, 'checkin')
    toast.success('¡Check-in realizado! Cuenta dividida.')
    setSplitAccountOpen(false)
    onSuccess()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Error al dividir cuenta')
    setPaying(false)
    throw err
  }
}
```

**`buildConcepto`:**
```typescript
function buildConcepto(): string {
  return `${pistaNombre}${clienteNombre ? ` - ${clienteNombre}` : ''} - ${(reserva.hora_inicio ?? '').slice(0, 5)}`
}
```

**`ticketItems` for SplitAccountModal** (single cancha item):
```typescript
const ticketItems: TicketItem[] = [{
  id: reserva.id,
  name: `${pistaNombre} (${fmtTime(reserva.hora_inicio)})`,
  price: reserva.precio ?? 0,
  qty: 1,
  category: 'cancha',
  imgClass: 'img-cancha',
  requiere_cocina: false,
}]
```

**Derived values for split-payment:**
```typescript
const total = reserva.precio ?? 0
const efectivoNum = parseFloat(splitEfectivo) || 0
const tarjeta = Math.max(0, total - efectivoNum)
const cambio = Math.max(0, efectivoNum - total)
const splitPayValid = efectivoNum > 0 && efectivoNum <= total + 0.01
```

**UI structure** (full modal JSX):

The modal has:
1. **Header**: "Cobrar Cancha" title + subtitle + X close button
2. **Info section**: Cancha, Hora inicio, Cliente (if present), Total row (lime colored)
3. **Three action buttons** (full width, stacked):
   - `Cobrar $X.XX` — lime bg when `mode === 'single'`, outline otherwise
   - `Dividir Pago` — lime outline when `mode === 'split-payment'`, subtle otherwise
   - `Dividir Cuenta` — always outline
4. **Expandable sub-panel** below buttons based on `mode`:
   - `mode === 'single'`: 2×2 grid of payment method buttons + "Cobrar y hacer check-in" confirm button
   - `mode === 'split-payment'`: cash input + quick-select chips ($50, $100, $200, $500) + tarjeta display + cambio display (if efectivo > total) + "Confirmar Pago Dividido" button

**Button styles (action buttons):**
```typescript
// Single button style
{
  width: '100%',
  padding: '13px',
  background: mode === 'single' ? 'var(--color-lime)' : 'var(--color-bg)',
  border: `1px solid ${mode === 'single' ? 'var(--color-lime)' : 'var(--color-border)'}`,
  borderRadius: '10px',
  color: mode === 'single' ? 'var(--color-bg)' : 'var(--color-text)',
  fontSize: '13px', fontWeight: 800,
  cursor: 'pointer', fontFamily: 'inherit',
  textTransform: 'uppercase', letterSpacing: '0.3px',
}

// Split-payment button style
{
  width: '100%',
  padding: '13px',
  background: mode === 'split-payment' ? 'rgba(108,242,13,0.08)' : 'var(--color-bg)',
  border: `1px solid ${mode === 'split-payment' ? 'rgba(108,242,13,0.40)' : 'var(--color-border)'}`,
  borderRadius: '10px',
  color: mode === 'split-payment' ? 'var(--color-lime)' : 'var(--color-muted)',
  fontSize: '13px', fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit',
}

// Dividir Cuenta button style (always outline)
{
  width: '100%',
  padding: '13px',
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: '10px',
  color: 'var(--color-muted)',
  fontSize: '13px', fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit',
}
```

**Payment method buttons** (mode === 'single', 2×2 grid):
Same pattern as existing: `PAYMENT_OPTIONS` array, lime highlight on selected, clicking sets `selectedMetodo`.

**Split-payment sub-panel:**
```typescript
// Cash input
<input
  type="number"
  value={splitEfectivo}
  onChange={e => setSplitEfectivo(e.target.value)}
  placeholder="0.00"
  // styles: same as CobrarComandaModal split input
/>

// Quick-select chips: [50, 100, 200, 500]
// On click: setSplitEfectivo(String(v))

// Tarjeta display (read-only):
// label "Tarjeta" + value fmtCurrency(tarjeta)

// Cambio display (if cambio > 0):
// label "Cambio" + value fmtCurrency(cambio)

// Confirm button
<button
  onClick={handleSplitPay}
  disabled={!splitPayValid || paying}
>
  {paying ? 'Procesando...' : 'Confirmar Pago Dividido'}
</button>
```

**SplitAccountModal** at bottom of return (overlays on top):
```tsx
<SplitAccountModal
  open={splitAccountOpen}
  items={ticketItems}
  cajaId={cajaId}
  onConfirm={handleConfirmSplitAccount}
  onCancel={() => setSplitAccountOpen(false)}
/>
```

**`fmtTime` and `fmtCurrency`** helpers: keep same as current file.

### Step 3: Verify TypeScript types

Ensure imports resolve:
- `PagoInput` — check if exported from `pos.ts`. If not, inline the type `{ metodo: MetodoPago; monto: number }`.
- `TicketItem` — exported from `POSPage.tsx` as `export type TicketItem`. Use `import type { TicketItem } from '@/components/modules/pos/POSPage'`.
- `PersonSplit` — exported from `SplitAccountModal.tsx` as `export interface PersonSplit`.

### Step 4: Commit

```bash
git add apps/dashboard/src/components/modules/pistas/CheckInPaymentModal.tsx
git commit -m "feat: CheckInPaymentModal three-mode payment (single, split-pay, split-account)"
```

---

## Task 2: Update `PistasPage.tsx` to match new props

**File:** `apps/dashboard/src/components/modules/pistas/PistasPage.tsx`

The `CheckInPaymentModal` props have changed. `PistasPage` must:
1. Pass `cajaId`, `supabase` to the modal
2. Replace `onConfirm` with `onSuccess`
3. Remove `handleCheckInConfirm` (logic now inside the modal)
4. Keep `handleCheckInRequest` as-is (it sets `checkInPendiente`)

### Step 1: Read the current file

```
Read: apps/dashboard/src/components/modules/pistas/PistasPage.tsx
```

### Step 2: Remove `handleCheckInConfirm` function

Delete lines 195–208:
```typescript
// DELETE this entire function:
async function handleCheckInConfirm(metodo: MetodoPago) {
  if (!checkInPendiente || !cajaActiva) return
  const { reserva, pistaNombre, clienteNombre } = checkInPendiente
  const concepto = `${pistaNombre}${clienteNombre ? ` - ${clienteNombre}` : ''} - ${reserva.hora_inicio.slice(0, 5)}`
  try {
    const supabase = createClient()
    await checkInWithPayment(supabase, reserva.id, reserva.precio ?? 0, metodo, cajaActiva.id, concepto)
    toast.success('¡Check-in realizado! Timer activo.')
    setCheckInPendiente(null)
    refreshCourts()
  } catch {
    toast.error('Error al hacer check-in')
  }
}
```

### Step 3: Update `CheckInPaymentModal` usage in JSX

Replace the current `CheckInPaymentModal` block:

**Before:**
```tsx
{checkInPendiente && (
  <CheckInPaymentModal
    open={true}
    reserva={checkInPendiente.reserva}
    pistaNombre={checkInPendiente.pistaNombre}
    clienteNombre={checkInPendiente.clienteNombre}
    onConfirm={handleCheckInConfirm}
    onCancel={() => setCheckInPendiente(null)}
  />
)}
```

**After:**
```tsx
{checkInPendiente && (
  <CheckInPaymentModal
    open={true}
    reserva={checkInPendiente.reserva}
    pistaNombre={checkInPendiente.pistaNombre}
    clienteNombre={checkInPendiente.clienteNombre}
    cajaId={cajaActiva?.id}
    supabase={supabase}
    onSuccess={() => {
      setCheckInPendiente(null)
      refreshCourts()
    }}
    onCancel={() => setCheckInPendiente(null)}
  />
)}
```

Where `supabase` is `createClient()` called at the module level or in a `useMemo`. Check if `createClient()` is already stored in a variable at the top of the component. If not, add:
```typescript
const supabase = createClient()
```
near the top of `PistasPage` (after state declarations, before effects).

### Step 4: Remove unused `MetodoPago` import if no longer needed

Check if `MetodoPago` is still used anywhere in `PistasPage.tsx` after removing `handleCheckInConfirm`. If the only usage was in that function, remove it from the import:
```typescript
// Before:
import type { MetodoPago } from '@/lib/supabase/queries/caja'

// After (if unused):
// remove this line entirely
```

Also check if `checkInWithPayment` is still imported — it was used in `handleCheckInConfirm` which is now removed. Remove it from the pistas import if unused:
```typescript
// Before:
import { getPistas, getTodayReservas, checkInWithPayment, updateReservaEstado } from '@/lib/supabase/queries/pistas'

// After (if checkInWithPayment unused):
import { getPistas, getTodayReservas, updateReservaEstado } from '@/lib/supabase/queries/pistas'
```

### Step 5: Commit

```bash
git add apps/dashboard/src/components/modules/pistas/PistasPage.tsx
git commit -m "feat: update PistasPage to use new CheckInPaymentModal self-contained API"
```

---

## Task 3: Verify `PagoInput` export in `pos.ts`

**File:** `apps/dashboard/src/lib/supabase/queries/pos.ts`

### Step 1: Check if `PagoInput` is exported

```
Grep: "export.*PagoInput" in apps/dashboard/src/lib/supabase/queries/pos.ts
```

### Step 2: If NOT exported, add the export

Find the `PagoInput` type definition and add `export`:
```typescript
// Before:
type PagoInput = { metodo: MetodoPago; monto: number }

// After:
export type PagoInput = { metodo: MetodoPago; monto: number }
```

If it is already exported, no change needed.

### Step 3: Commit only if changed

```bash
git add apps/dashboard/src/lib/supabase/queries/pos.ts
git commit -m "fix: export PagoInput type from pos.ts"
```

---

## Verification

After all tasks, manually verify in the browser:

1. **Single payment:** Click a "reservada" court → trigger check-in from CourtAccountModal → `CheckInPaymentModal` opens → select Efectivo → confirm → court becomes "ocupada", toast success, caja shows movimiento.

2. **Dividir Pago:** Same flow → click "Dividir Pago" → enter cash amount → see tarjeta auto-calculated → confirm → check-in succeeds, both movimientos in caja.

3. **Dividir Cuenta:** Same flow → click "Dividir Cuenta" → `SplitAccountModal` opens as overlay → assign cancha item to persons → confirm → check-in succeeds.

4. **No turno activo:** With no caja open, the `handleCheckInRequest` in PistasPage still shows the toast warning and skips the modal entirely (this path is unchanged — modal only opens when `cajaActiva` is set).
