# Caja Sync + Dividir Cuenta + Propinas — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix Caja stats sync with POS payments, add per-person bill splitting with independent payment methods, and add optional tip capture in payment modals.

**Architecture:** Three independent changes: (1) `getCajaStats` is rewritten to aggregate from `pagos+cuentas` instead of `movimientos_caja`; (2) a new `SplitBillModal` lets the cashier assign items to persons and charge each one independently; (3) a tip UI with % presets is added to all payment modals and persisted in `cuentas.propina`.

**Tech Stack:** Next.js 14 App Router, Supabase PostgREST, React state, TypeScript strict, Sonner toasts, Lucide icons

---

## Context

- App root: `apps/dashboard/src/`
- Club ID constant (hardcoded): `'a1000000-0000-0000-0000-000000000001'`
- Tax rate constant: `TAX_RATE = 0.16`
- Key types: `TicketItem` from `pos/POSPage.tsx`, `CajaActiva` from `queries/caja.ts`, `CuentaItem`/`PagoInput`/`MetodoPago` from `queries/pos.ts`
- `createCuenta()` currently accepts `items`, `pagosInput: PagoInput[] | MetodoPago`, optional `clienteId`, optional `descuentoTotal`
- `getCajaStats(supabase, cajaId)` currently reads ONLY from `movimientos_caja` — this is the bug

---

## Task 1: DB Migration — Add `propina` column to `cuentas`

**Files:**
- Run migration via Supabase MCP

**Step 1: Apply the migration**

Use the Supabase MCP tool `apply_migration` with:
```sql
ALTER TABLE cuentas ADD COLUMN IF NOT EXISTS propina numeric NOT NULL DEFAULT 0;
```
Migration name: `add_propina_to_cuentas`

**Step 2: Verify**

Run via Supabase MCP `execute_sql`:
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'cuentas' AND column_name = 'propina';
```
Expected: 1 row, `numeric`, default `0`.

**Step 3: Commit**
```bash
git add -A
git commit -m "feat: add propina column to cuentas table"
```

---

## Task 2: Fix `getCajaStats` — Read from `pagos+cuentas`

**Files:**
- Modify: `apps/dashboard/src/lib/supabase/queries/caja.ts` (lines 72–117)

**Step 1: Understand current signature**

Current: `getCajaStats(supabase, cajaId: string): Promise<CajaStats>`
Called in `CajaPage.tsx:340`: `getCajaStats(supabase, cajaData.id)`

`CajaActiva` already has `club_id` and `created_at`. We'll change the signature to accept the full `CajaActiva` object.

**Step 2: Rewrite `getCajaStats`**

Replace the entire function (lines 72–117) with:

```typescript
export async function getCajaStats(
  supabase: SupabaseClient,
  caja: CajaActiva,
): Promise<CajaStats> {
  // Aggregate POS payments for this shift
  const { data: cuentasData, error } = await supabase
    .from('cuentas')
    .select('propina, pagos(metodo, monto)')
    .eq('club_id', caja.club_id)
    .eq('estado', 'pagada')
    .gte('created_at', caja.created_at)

  if (error) throw error

  type PagoRow = { metodo: string; monto: number }
  type CuentaRow = { propina: number; pagos: PagoRow[] }

  let totalEfectivo = 0
  let totalTarjeta = 0
  let totalPropinas = 0
  let countEfectivo = 0
  let countTarjeta = 0

  for (const cuenta of (cuentasData ?? []) as CuentaRow[]) {
    totalPropinas += cuenta.propina ?? 0
    for (const pago of cuenta.pagos ?? []) {
      if (pago.metodo === 'efectivo') {
        totalEfectivo += pago.monto
        countEfectivo++
      } else if (pago.metodo === 'credito' || pago.metodo === 'debito') {
        totalTarjeta += pago.monto
        countTarjeta++
      }
    }
  }

  return {
    totalVentas: totalEfectivo + totalTarjeta,
    totalEfectivo,
    totalTarjeta,
    totalPropinas,
    countEfectivo,
    countTarjeta,
  }
}
```

**Step 3: Update call site in `CajaPage.tsx`**

File: `apps/dashboard/src/components/modules/caja/CajaPage.tsx` line ~340

Change:
```typescript
const statsData = await getCajaStats(supabase, cajaData.id)
```
To:
```typescript
const statsData = await getCajaStats(supabase, cajaData)
```

**Step 4: TypeScript check**
```bash
cd apps/dashboard && npx tsc --noEmit
```
Expected: EXIT:0 (no errors)

**Step 5: Commit**
```bash
git add apps/dashboard/src/lib/supabase/queries/caja.ts apps/dashboard/src/components/modules/caja/CajaPage.tsx
git commit -m "fix: rewrite getCajaStats to read from pagos+cuentas instead of movimientos_caja"
```

---

## Task 3: Update `createCuenta` — Add `propina` parameter

**Files:**
- Modify: `apps/dashboard/src/lib/supabase/queries/pos.ts` (function `createCuenta`, lines 106–185)

**Step 1: Add `propina` parameter**

Change the function signature from:
```typescript
export async function createCuenta(
  supabase: SupabaseClient,
  clubId: string,
  items: CuentaItem[],
  pagosInput: PagoInput[] | MetodoPago,
  clienteId?: string,
  descuentoTotal: number = 0,
): Promise<{ data: { id: string } | null; error: Error | null }>
```

To:
```typescript
export async function createCuenta(
  supabase: SupabaseClient,
  clubId: string,
  items: CuentaItem[],
  pagosInput: PagoInput[] | MetodoPago,
  clienteId?: string,
  descuentoTotal: number = 0,
  propina: number = 0,
): Promise<{ data: { id: string } | null; error: Error | null }>
```

**Step 2: Add `propina` to the cuentas INSERT**

Find the INSERT block (around line 128–141) and add `propina` to the payload:
```typescript
const { data: cuenta, error: cuentaError } = await supabase
  .from('cuentas')
  .insert({
    club_id: clubId,
    numero_ticket,
    cliente_id: clienteId ?? null,
    subtotal: base,
    iva,
    total,
    descuento_total: descuentoTotal,
    propina,          // ← ADD THIS LINE
    estado: 'pagada',
  })
  .select('id')
  .single()
```

**Step 3: TypeScript check**
```bash
cd apps/dashboard && npx tsc --noEmit
```
Expected: EXIT:0

**Step 4: Commit**
```bash
git add apps/dashboard/src/lib/supabase/queries/pos.ts
git commit -m "feat: add propina param to createCuenta"
```

---

## Task 4: Add Tip UI to TicketPanel Payment Modals

**Files:**
- Modify: `apps/dashboard/src/components/modules/pos/TicketPanel.tsx`

### Overview

Add tip state and UI to both the single-payment modal (efectivo/tarjeta) and the efectivo+tarjeta split modal.

**Step 1: Add tip state variables** (after existing state declarations, around line 37)

```typescript
// Tip state (shared across all payment modals)
const [propinaInput, setPropinaInput] = useState('')   // raw string input
const [propinaMode, setPropinaMode] = useState<'none' | 'pct10' | 'pct15' | 'pct20' | 'custom'>('none')
```

Add a derived propina value (computed from mode and total):
```typescript
const propina = (() => {
  if (propinaMode === 'pct10') return Math.round(total * 0.10 * 100) / 100
  if (propinaMode === 'pct15') return Math.round(total * 0.15 * 100) / 100
  if (propinaMode === 'pct20') return Math.round(total * 0.20 * 100) / 100
  if (propinaMode === 'custom') return parseFloat(propinaInput) || 0
  return 0
})()
const totalConPropina = total + propina
```

**Step 2: Add a `resetTip` helper** (call it when modals close)

```typescript
function resetTip() {
  setPropinaMode('none')
  setPropinaInput('')
}
```

**Step 3: Update `openPayModal` and `openSplitModal` to reset tip**

```typescript
function openPayModal(metodo: MetodoPago) {
  if (items.length === 0) return
  setRecibido('')
  resetTip()   // ← ADD
  setPayModal({ open: true, metodo })
}

function openSplitModal() {
  if (items.length === 0) return
  resetTip()   // ← ADD
  setSplitOpen(true)
}
```

**Step 4: Update cambio calculations to use `totalConPropina`**

```typescript
// Was: const cambio = recibidoNum - total
const cambio = recibidoNum - totalConPropina

// Was: const splitTarjeta = Math.max(0, total - splitEfectivoNum)
const splitTarjeta = Math.max(0, totalConPropina - splitEfectivoNum)
// Was: const splitCambio = splitEfectivoNum > total ? ...
const splitCambio = splitEfectivoNum > totalConPropina ? splitEfectivoNum - totalConPropina : 0
// Was: const splitValid = splitEfectivoNum >= 0 && splitEfectivoNum <= total + 0.01
const splitValid = splitEfectivoNum >= 0 && splitEfectivoNum <= totalConPropina + 0.01
```

**Step 5: Update `handleConfirmPay` guard and createCuenta call**

```typescript
async function handleConfirmPay() {
  if (payModal.metodo === 'efectivo' && recibidoNum < totalConPropina) {  // ← use totalConPropina
    toast.error('El monto recibido es menor al total')
    return
  }
  setPaying(true)
  const { error } = await createCuenta(
    createClient(), CLUB_ID, buildCuentaItems(), payModal.metodo,
    undefined, discount, propina  // ← add propina
  )
  ...
  // On success, also reset tip:
  resetTip()
  ...
}
```

**Step 6: Update `handleConfirmSplit` createCuenta call**

```typescript
const { error } = await createCuenta(
  createClient(), CLUB_ID, buildCuentaItems(), pagos,
  undefined, discount, propina  // ← add propina
)
// On success:
resetTip()
```

**Step 7: Create the `TipSection` UI sub-component** (add near bottom of file, before `TicketItemRow`)

```typescript
function TipSection({
  total,
  mode,
  customInput,
  onModeChange,
  onCustomChange,
  propina,
}: {
  total: number
  mode: 'none' | 'pct10' | 'pct15' | 'pct20' | 'custom'
  customInput: string
  onModeChange: (m: typeof mode) => void
  onCustomChange: (v: string) => void
  propina: number
}) {
  const pctBtns = [
    { key: 'pct10' as const, label: '10%' },
    { key: 'pct15' as const, label: '15%' },
    { key: 'pct20' as const, label: '20%' },
  ]
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
        Propina (opcional)
      </div>
      <div style={{ display: 'flex', gap: '6px', marginBottom: mode === 'custom' ? '8px' : 0 }}>
        {pctBtns.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onModeChange(mode === key ? 'none' : key)}
            style={{
              flex: 1, padding: '8px 4px',
              background: mode === key ? 'rgba(108,242,13,0.1)' : 'var(--color-bg)',
              border: `1px solid ${mode === key ? 'var(--color-lime)' : 'var(--color-border)'}`,
              borderRadius: '8px',
              color: mode === key ? 'var(--color-lime)' : 'var(--color-muted)',
              fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {label}
          </button>
        ))}
        <button
          onClick={() => onModeChange(mode === 'custom' ? 'none' : 'custom')}
          style={{
            flex: 1, padding: '8px 4px',
            background: mode === 'custom' ? 'rgba(108,242,13,0.1)' : 'var(--color-bg)',
            border: `1px solid ${mode === 'custom' ? 'var(--color-lime)' : 'var(--color-border)'}`,
            borderRadius: '8px',
            color: mode === 'custom' ? 'var(--color-lime)' : 'var(--color-muted)',
            fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          $ monto
        </button>
      </div>
      {mode === 'custom' && (
        <input
          type="number"
          value={customInput}
          onChange={(e) => onCustomChange(e.target.value)}
          placeholder="0.00"
          min="0"
          autoFocus
          style={{
            width: '100%', padding: '10px 12px',
            background: 'var(--color-bg)', border: '1px solid var(--color-border)',
            borderRadius: '8px', color: 'var(--color-text)',
            fontSize: '15px', fontFamily: 'var(--font-mono)', fontWeight: 700,
            outline: 'none', boxSizing: 'border-box',
          }}
        />
      )}
      {propina > 0 && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginTop: '8px', padding: '8px 12px',
          background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.20)',
          borderRadius: '8px',
        }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#EAB308', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Propina</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color: '#EAB308' }}>
            +${propina.toFixed(2)}
          </span>
        </div>
      )}
    </div>
  )
}
```

**Step 8: Insert `<TipSection>` into the efectivo modal** (after the "Total a Cobrar" box, before the efectivo input)

```tsx
{/* Tip section */}
<TipSection
  total={total}
  mode={propinaMode}
  customInput={propinaInput}
  onModeChange={setPropinaMode}
  onCustomChange={setPropinaInput}
  propina={propina}
/>
```

Also update the "Total a Cobrar" display in the modal to show `totalConPropina`:
```tsx
<span style={{ fontFamily: 'var(--font-mono)', fontSize: '22px', fontWeight: 700, color: 'var(--color-lime)' }}>
  ${totalConPropina.toFixed(2)}
</span>
```

And the `Mínimo $___` placeholder:
```tsx
placeholder={`Mínimo $${totalConPropina.toFixed(2)}`}
```

And the confirm button guard:
```tsx
disabled={paying || (payModal.metodo === 'efectivo' && (!recibido || recibidoNum < totalConPropina))}
```

**Step 9: Insert `<TipSection>` into the tarjeta modal** (after the "Total a Cobrar" box, before the instruction text)

Same `<TipSection>` component.

**Step 10: Insert `<TipSection>` into the efectivo+tarjeta split modal** (after the "Total a Cobrar" box)

```tsx
<TipSection ... />
```

And update the split modal total display to show `totalConPropina`.

**Step 11: Update payment button label**

The big "Cobrar $ X.XX MXN" button should also show `totalConPropina` when there's a tip:
```tsx
{`Cobrar $ ${totalConPropina.toFixed(2)} MXN`}
```

**Step 12: TypeScript check**
```bash
cd apps/dashboard && npx tsc --noEmit
```
Expected: EXIT:0

**Step 13: Commit**
```bash
git add apps/dashboard/src/components/modules/pos/TicketPanel.tsx
git commit -m "feat: add optional tip (propina) UI to all payment modals"
```

---

## Task 5: Create `SplitBillModal.tsx`

**Files:**
- Create: `apps/dashboard/src/components/modules/pos/SplitBillModal.tsx`

### Overview

Modal with two phases:
1. **Assign phase**: item slots (qty expanded) → each slot gets a person color badge
2. **Checkout phase**: for each person in sequence, show their items + mini payment modal (efectivo/tarjeta + propina)

### Types needed (internal to the file)

```typescript
import type { TicketItem } from './POSPage'
import { createClient } from '@/lib/supabase/client'
import { createCuenta, type MetodoPago, type PagoInput, type CuentaItem } from '@/lib/supabase/queries/pos'

const TAX_RATE = 0.16
const CLUB_ID = 'a1000000-0000-0000-0000-000000000001'

interface SplitBillModalProps {
  items: TicketItem[]
  discount: number          // total discount amount (already calculated)
  onClose: () => void
  onSuccess: () => void
}

interface Person {
  id: number
  label: string             // "Persona 1", "Persona 2", etc.
  color: string
}

interface ItemSlot {
  slotId: string            // `${item.id}-${unitIndex}`
  itemId: string
  name: string
  unitPrice: number         // item.price (sin IVA/descuento — se aplica en createCuenta)
  personId: number
}
```

### Person colors
```typescript
const PERSON_COLORS = ['#6CF20D', '#60a5fa', '#EAB308', '#f97316', '#c084fc', '#fb7185']
```

### State

```typescript
const [persons, setPersons] = useState<Person[]>([
  { id: 0, label: 'Persona 1', color: PERSON_COLORS[0] },
])
const [slots, setSlots] = useState<ItemSlot[]>(() => {
  const result: ItemSlot[] = []
  for (const item of items) {
    for (let u = 0; u < item.qty; u++) {
      result.push({
        slotId: `${item.id}-${u}`,
        itemId: item.id,
        name: item.name,
        unitPrice: item.price,
        personId: 0,          // default: Persona 1
      })
    }
  }
  return result
})
const [activePerson, setActivePerson] = useState(0)   // which person is "selected" for assignment
const [phase, setPhase] = useState<'assign' | 'checkout'>('assign')
const [checkoutIdx, setCheckoutIdx] = useState(0)     // which person we're currently charging
const [paying, setPaying] = useState(false)
// Payment fields for current checkout person
const [payMetodo, setPayMetodo] = useState<MetodoPago>('efectivo')
const [recibido, setRecibido] = useState('')
const [propinaMode, setPropinaMode] = useState<'none' | 'pct10' | 'pct15' | 'pct20' | 'custom'>('none')
const [propinaInput, setPropinaInput] = useState('')
```

### Derived values

```typescript
// Person totals (raw subtotal before IVA/discount, per person)
const personTotals = persons.map((p) => ({
  ...p,
  subtotal: slots.filter((s) => s.personId === p.id).reduce((sum, s) => sum + s.unitPrice, 0),
  slotCount: slots.filter((s) => s.personId === p.id).length,
}))

// Proportional discount per person
const totalSubtotal = slots.reduce((sum, s) => sum + s.unitPrice, 0)

function personDiscount(personSubtotal: number): number {
  if (totalSubtotal === 0) return 0
  return (personSubtotal / totalSubtotal) * discount
}

// Persons who have at least 1 item
const personsWithItems = personTotals.filter((p) => p.slotCount > 0)

// Current checkout person
const checkoutPerson = personsWithItems[checkoutIdx]
const checkoutSlots = checkoutPerson ? slots.filter((s) => s.personId === checkoutPerson.id) : []

// Checkout person's total (with IVA and proportional discount)
const checkoutSubtotal = checkoutSlots.reduce((sum, s) => sum + s.unitPrice, 0)
const checkoutDiscount = personDiscount(checkoutSubtotal)
const checkoutBase = checkoutSubtotal - checkoutDiscount
const checkoutIva = checkoutBase * TAX_RATE
const checkoutTotal = checkoutBase + checkoutIva

// Tip for checkout
const checkoutPropina = (() => {
  if (propinaMode === 'pct10') return Math.round(checkoutTotal * 0.10 * 100) / 100
  if (propinaMode === 'pct15') return Math.round(checkoutTotal * 0.15 * 100) / 100
  if (propinaMode === 'pct20') return Math.round(checkoutTotal * 0.20 * 100) / 100
  if (propinaMode === 'custom') return parseFloat(propinaInput) || 0
  return 0
})()
const checkoutTotalConPropina = checkoutTotal + checkoutPropina
const checkoutRecibidoNum = parseFloat(recibido) || 0
const checkoutCambio = checkoutRecibidoNum - checkoutTotalConPropina
```

### Actions

```typescript
function addPerson() {
  if (persons.length >= 6) return
  const id = persons.length
  setPersons([...persons, { id, label: `Persona ${id + 1}`, color: PERSON_COLORS[id] }])
}

function assignSlot(slotId: string) {
  setSlots(slots.map((s) => s.slotId === slotId ? { ...s, personId: activePerson } : s))
}

function startCheckout() {
  if (personsWithItems.length === 0) return
  setCheckoutIdx(0)
  resetPayment()
  setPhase('checkout')
}

function resetPayment() {
  setPayMetodo('efectivo')
  setRecibido('')
  setPropinaMode('none')
  setPropinaInput('')
}

async function handleCheckoutPay() {
  if (payMetodo === 'efectivo' && checkoutRecibidoNum < checkoutTotalConPropina) {
    toast.error('Monto insuficiente')
    return
  }
  if (!checkoutPerson) return
  setPaying(true)

  const cuentaItems: CuentaItem[] = checkoutSlots.map((s) => ({
    producto_id: s.itemId,
    nombre: s.name,
    precio_unitario: s.unitPrice,
    cantidad: 1,
  }))

  const { error } = await createCuenta(
    createClient(),
    CLUB_ID,
    cuentaItems,
    payMetodo,
    undefined,
    checkoutDiscount,
    checkoutPropina,
  )

  setPaying(false)

  if (error) {
    toast.error(`Error al cobrar a ${checkoutPerson.label}`)
    return
  }

  const cambioStr = payMetodo === 'efectivo' && checkoutCambio > 0
    ? ` — Cambio: $${checkoutCambio.toFixed(2)}`
    : ''
  toast.success(`${checkoutPerson.label} cobrado${'a'} — $${checkoutTotalConPropina.toFixed(2)}${cambioStr}`)

  const nextIdx = checkoutIdx + 1
  if (nextIdx >= personsWithItems.length) {
    onSuccess()
  } else {
    setCheckoutIdx(nextIdx)
    resetPayment()
  }
}
```

### UI — Assign Phase

```tsx
<div style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center' }}
     onClick={(e)=>{ if(e.target===e.currentTarget) onClose() }}>
  <div style={{ background:'var(--color-bg2)', border:'1px solid var(--color-border)', borderRadius:'16px', width:'480px', maxHeight:'90vh', overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'0 24px 64px rgba(0,0,0,0.5)' }}>

    {/* Header */}
    <div style={{ padding:'20px 24px', borderBottom:'1px solid var(--color-border-subtle)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
      <div>
        <div style={{ fontSize:'16px', fontWeight:800 }}>Dividir Cuenta</div>
        <div style={{ fontSize:'11px', color:'var(--color-muted)', marginTop:'2px' }}>
          Asigna cada producto a una persona
        </div>
      </div>
      <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--color-muted)', cursor:'pointer' }}>
        <X size={18} />
      </button>
    </div>

    {/* Person tabs + add */}
    <div style={{ padding:'12px 24px', borderBottom:'1px solid var(--color-border-subtle)', display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap' }}>
      {persons.map((p) => (
        <button key={p.id}
          onClick={()=>setActivePerson(p.id)}
          style={{
            padding:'7px 14px', borderRadius:'8px', border:'2px solid',
            borderColor: activePerson===p.id ? p.color : 'var(--color-border)',
            background: activePerson===p.id ? `${p.color}18` : 'var(--color-bg)',
            color: activePerson===p.id ? p.color : 'var(--color-muted)',
            fontSize:'12px', fontWeight:700, cursor:'pointer', fontFamily:'inherit',
          }}>
          {p.label}
          {personTotals.find(pt=>pt.id===p.id)?.slotCount > 0 && (
            <span style={{ marginLeft:'6px', fontFamily:'var(--font-mono)', fontSize:'11px' }}>
              ${(personTotals.find(pt=>pt.id===p.id)?.subtotal ?? 0).toFixed(0)}
            </span>
          )}
        </button>
      ))}
      {persons.length < 6 && (
        <button onClick={addPerson} style={{ padding:'7px 10px', borderRadius:'8px', border:'1px dashed var(--color-border)', background:'transparent', color:'var(--color-muted)', fontSize:'12px', fontWeight:700, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:'4px' }}>
          <Plus size={13}/> Persona
        </button>
      )}
    </div>

    {/* Item slots */}
    <div style={{ flex:1, overflowY:'auto', padding:'8px 24px' }}>
      {slots.map((slot) => {
        const person = persons.find(p=>p.id===slot.personId)
        return (
          <div key={slot.slotId}
            onClick={()=>assignSlot(slot.slotId)}
            style={{
              display:'flex', alignItems:'center', gap:'12px',
              padding:'10px 0', borderBottom:'1px solid var(--color-border-subtle)',
              cursor:'pointer',
            }}>
            {/* Person badge */}
            <div style={{
              width:'28px', height:'28px', borderRadius:'50%', flexShrink:0,
              background: `${person?.color ?? '#444'}22`,
              border:`2px solid ${person?.color ?? 'var(--color-border)'}`,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:'11px', fontWeight:800, color: person?.color ?? 'var(--color-muted)',
            }}>
              {slot.personId + 1}
            </div>
            <span style={{ flex:1, fontSize:'13px', fontWeight:500 }}>{slot.name}</span>
            <span style={{ fontFamily:'var(--font-mono)', fontSize:'13px', fontWeight:600, color:'var(--color-muted)' }}>
              ${slot.unitPrice.toFixed(2)}
            </span>
          </div>
        )
      })}
    </div>

    {/* Footer */}
    <div style={{ padding:'16px 24px', borderTop:'1px solid var(--color-border-subtle)' }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
        <button onClick={onClose} style={cancelBtnStyle}>Cancelar</button>
        <button
          onClick={startCheckout}
          disabled={personsWithItems.length === 0}
          style={{
            padding:'13px', background: personsWithItems.length===0 ? 'rgba(108,242,13,0.3)' : 'var(--color-lime)',
            border:'none', borderRadius:'10px', color:'var(--color-bg)',
            fontSize:'13px', fontWeight:800, cursor: personsWithItems.length===0 ? 'not-allowed' : 'pointer',
            fontFamily:'inherit', textTransform:'uppercase', letterSpacing:'0.3px',
          }}>
          Cobrar {personsWithItems.length} persona{personsWithItems.length!==1?'s':''}
        </button>
      </div>
    </div>
  </div>
</div>
```

### UI — Checkout Phase

Replace the entire modal content with a checkout view focused on the current person:

```tsx
{/* Checkout header */}
<div style={{ padding:'20px 24px', borderBottom:'1px solid var(--color-border-subtle)' }}>
  <div style={{ fontSize:'12px', color:'var(--color-muted)', marginBottom:'4px' }}>
    {checkoutIdx + 1} de {personsWithItems.length}
  </div>
  <div style={{ fontSize:'18px', fontWeight:800, color: checkoutPerson?.color }}>
    {checkoutPerson?.label}
  </div>
</div>

{/* Items of this person */}
<div style={{ padding:'12px 24px', borderBottom:'1px solid var(--color-border-subtle)', maxHeight:'160px', overflowY:'auto' }}>
  {checkoutSlots.map((s) => (
    <div key={s.slotId} style={{ display:'flex', justifyContent:'space-between', fontSize:'12px', color:'var(--color-muted)', padding:'4px 0' }}>
      <span>{s.name}</span>
      <span style={{ fontFamily:'var(--font-mono)' }}>${s.unitPrice.toFixed(2)}</span>
    </div>
  ))}
  <div style={{ display:'flex', justifyContent:'space-between', fontSize:'14px', fontWeight:700, borderTop:'1px solid var(--color-border-subtle)', paddingTop:'8px', marginTop:'4px' }}>
    <span>Total</span>
    <span style={{ fontFamily:'var(--font-mono)', color:'var(--color-lime)' }}>${checkoutTotalConPropina.toFixed(2)}</span>
  </div>
</div>

{/* Payment method selection */}
<div style={{ padding:'12px 24px', borderBottom:'1px solid var(--color-border-subtle)', display:'flex', gap:'8px' }}>
  {(['efectivo', 'credito'] as MetodoPago[]).map((m) => (
    <button key={m} onClick={()=>setPayMetodo(m)} style={{
      flex:1, padding:'10px',
      background: payMetodo===m ? 'rgba(108,242,13,0.1)' : 'var(--color-bg)',
      border:`1px solid ${payMetodo===m ? 'var(--color-lime)' : 'var(--color-border)'}`,
      borderRadius:'8px', color: payMetodo===m ? 'var(--color-lime)' : 'var(--color-muted)',
      fontSize:'12px', fontWeight:700, cursor:'pointer', fontFamily:'inherit',
      textTransform:'capitalize',
    }}>
      {m === 'efectivo' ? 'Efectivo' : 'Tarjeta'}
    </button>
  ))}
</div>

{/* Payment details */}
<div style={{ padding:'16px 24px', flex:1 }}>
  {/* TipSection component reused here */}
  <TipSection total={checkoutTotal} mode={propinaMode} customInput={propinaInput}
    onModeChange={setPropinaMode} onCustomChange={setPropinaInput} propina={checkoutPropina} />

  {payMetodo === 'efectivo' && (
    <>
      <label style={labelStyle}>Efectivo Recibido</label>
      <input type="number" value={recibido} onChange={(e)=>setRecibido(e.target.value)}
        placeholder={`Mínimo $${checkoutTotalConPropina.toFixed(2)}`}
        autoFocus style={inputStyle} />
      {recibido && (
        <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 12px', marginTop:'8px',
          background: checkoutCambio>=0 ? 'rgba(108,242,13,0.06)' : 'rgba(239,68,68,0.06)',
          borderRadius:'8px', border:`1px solid ${checkoutCambio>=0 ? 'rgba(108,242,13,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
          <span style={{ fontSize:'12px', color:'var(--color-muted)', fontWeight:700, textTransform:'uppercase' }}>Cambio</span>
          <span style={{ fontFamily:'var(--font-mono)', fontWeight:700, color: checkoutCambio>=0 ? 'var(--color-lime)' : '#EF4444' }}>
            ${Math.max(0, checkoutCambio).toFixed(2)}
          </span>
        </div>
      )}
    </>
  )}
</div>

{/* Checkout footer */}
<div style={{ padding:'16px 24px', borderTop:'1px solid var(--color-border-subtle)', display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
  <button onClick={()=>{ setPhase('assign'); resetPayment() }} style={cancelBtnStyle}>← Volver</button>
  <button
    onClick={handleCheckoutPay}
    disabled={paying || (payMetodo==='efectivo' && (!recibido || checkoutRecibidoNum < checkoutTotalConPropina))}
    style={{
      padding:'13px',
      background: (paying || (payMetodo==='efectivo' && (!recibido || checkoutRecibidoNum < checkoutTotalConPropina)))
        ? 'rgba(108,242,13,0.3)' : 'var(--color-lime)',
      border:'none', borderRadius:'10px', color:'var(--color-bg)',
      fontSize:'13px', fontWeight:800,
      cursor:(paying || (payMetodo==='efectivo' && (!recibido || checkoutRecibidoNum < checkoutTotalConPropina))) ? 'not-allowed' : 'pointer',
      fontFamily:'inherit', textTransform:'uppercase', letterSpacing:'0.3px',
    }}>
    {paying ? 'Procesando...' : `Cobrar $${checkoutTotalConPropina.toFixed(2)}`}
  </button>
</div>
```

### Style constants at bottom of file

```typescript
const cancelBtnStyle: React.CSSProperties = {
  padding: '13px', background: 'var(--color-bg)',
  border: '1px solid var(--color-border)', borderRadius: '10px',
  color: 'var(--color-muted)', fontSize: '13px', fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '10px', fontWeight: 700,
  color: 'var(--color-muted)', textTransform: 'uppercase',
  letterSpacing: '0.5px', marginBottom: '8px',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px',
  background: 'var(--color-bg)', border: '1px solid var(--color-border)',
  borderRadius: '10px', color: 'var(--color-text)',
  fontSize: '18px', fontFamily: 'var(--font-mono)', fontWeight: 700,
  outline: 'none', boxSizing: 'border-box',
}
```

**Step after writing the file: TypeScript check**
```bash
cd apps/dashboard && npx tsc --noEmit
```
Expected: EXIT:0

**Commit:**
```bash
git add apps/dashboard/src/components/modules/pos/SplitBillModal.tsx
git commit -m "feat: add SplitBillModal for per-person item-based bill splitting"
```

---

## Task 6: Wire `SplitBillModal` into `TicketPanel`

**Files:**
- Modify: `apps/dashboard/src/components/modules/pos/TicketPanel.tsx`

**Step 1: Import SplitBillModal**

Add at top of file:
```typescript
import { SplitBillModal } from './SplitBillModal'
```

**Step 2: Add state**

```typescript
const [splitBillOpen, setSplitBillOpen] = useState(false)
```

**Step 3: Add handler**

```typescript
function openSplitBillModal() {
  if (items.length === 0) return
  setSplitBillOpen(true)
}
```

**Step 4: Render `SplitBillModal`** (alongside existing modals, before `{splitOpen && ...}`)

```tsx
{splitBillOpen && (
  <SplitBillModal
    items={items}
    discount={discount}
    onClose={() => setSplitBillOpen(false)}
    onSuccess={() => { setSplitBillOpen(false); resetTicket() }}
  />
)}
```

**Step 5: Add 4th payment button**

Change the button grid from `'1fr 1fr 1fr'` to `'1fr 1fr 1fr 1fr'` and add the new button:

```tsx
<div style={{ padding: '0 20px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px' }}>
  <PayButton icon="cash" label="Efectivo" onClick={() => openPayModal('efectivo')} disabled={items.length === 0} />
  <PayButton icon="card" label="Tarjeta" onClick={() => openPayModal('credito')} disabled={items.length === 0} />
  <PayButton icon="split" label="Eft+Tarj" onClick={openSplitModal} disabled={items.length === 0} />
  <PayButton icon="persons" label="Por Persona" onClick={openSplitBillModal} disabled={items.length === 0} />
</div>
```

**Step 6: Add `persons` icon variant to `PayButton`**

In the `PayButton` function, add the `persons` case:
```typescript
function PayButton({ icon, label, onClick, disabled }: { icon: 'cash' | 'card' | 'split' | 'persons'; ... })
```

And in the SVG section:
```tsx
} : icon === 'persons' ? (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
) : (
```

**Step 7: TypeScript check**
```bash
cd apps/dashboard && npx tsc --noEmit
```
Expected: EXIT:0

**Step 8: Commit**
```bash
git add apps/dashboard/src/components/modules/pos/TicketPanel.tsx
git commit -m "feat: wire SplitBillModal into TicketPanel with 4th payment button"
```

---

## Task 7: Final verification

**Step 1: Full TypeScript check**
```bash
cd apps/dashboard && npx tsc --noEmit
```
Expected: EXIT:0

**Step 2: Manual smoke test checklist**

Test Caja Sync:
1. Go to `/pos`, add a product, pay with Efectivo
2. Go to `/caja` → "Ventas del turno" should now show the payment amount
3. The "Efectivo" breakdown should match

Test Propinas:
1. Go to `/pos`, add products
2. Click "Efectivo" → tip buttons appear (10%, 15%, 20%, $ monto)
3. Select 10% → total updates with tip shown in yellow
4. Enter efectivo ≥ (total + tip) → cambio calculated correctly
5. Confirm → toast shows correct amounts
6. Go to `/caja` → Propinas stat updated

Test Dividir Cuenta (Por Persona):
1. Add 3 products to ticket
2. Click "Por Persona" → SplitBillModal opens with all items on Persona 1
3. Click "Persona" to add Persona 2
4. Click item slots to assign some to Persona 2
5. Click "Cobrar 2 personas"
6. Persona 1 checkout: select Efectivo, enter amount ≥ total, confirm
7. Automatically advances to Persona 2
8. Select Tarjeta, confirm
9. Ticket clears, 2 separate tickets appear in Historial

**Step 3: Final commit if all passing**
```bash
git add -A
git commit -m "feat: complete caja sync + split bill + tips implementation"
```
