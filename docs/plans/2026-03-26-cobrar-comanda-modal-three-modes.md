# CobrarComandaModal Three Payment Modes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current single-method `CobrarComandaModal` with a three-mode version supporting single payment, split payment (cash+card), and split by person — matching the POS payment flows exactly.

**Architecture:** One file is modified: `CobrarComandaModal.tsx`. The modal grows a `PayMode` state (`'single' | 'split-payment' | null`) and conditionally renders an expanded sub-panel. Split-by-person reuses `SplitAccountModal` from the POS module directly, with a lightweight transform from comanda items to `TicketItem[]`. All three modes call `createCuenta()` with `cajaId` for automatic caja registration.

**Tech Stack:** React 19, TypeScript 5.7, Supabase, inline styles only, CSS variables (`--color-bg`, `--color-bg2`, `--color-bg3`, `--color-border`, `--color-border-subtle`, `--color-text`, `--color-muted`, `--color-muted-dim`, `--color-lime`, `--font-mono`), sonner toasts.

---

## Context: Current State

- **File to modify:** `apps/dashboard/src/components/modules/comandas/CobrarComandaModal.tsx`
- **Reused component:** `apps/dashboard/src/components/modules/pos/SplitAccountModal.tsx` — already exists, no changes needed
- **Key queries:**
  - `createCuenta(supabase, clubId, items, pagosInput, clienteId?, descuentoTotal?, cajaId?)` from `@/lib/supabase/queries/pos`
  - `updateComanda(supabase, comandaId, fields)` from `@/lib/supabase/queries/comandas`
- **Types needed:**
  - `TicketItem` from `@/components/modules/pos/POSPage` — shape: `{ id, name, price, qty, category, imgClass, requiere_cocina }`
  - `PersonSplit` from `@/components/modules/pos/SplitAccountModal` — shape: `{ nombre, items, metodo, subtotal, iva, total }`
  - `PagoInput` from `@/lib/supabase/queries/pos` — shape: `{ metodo: MetodoPago, monto: number }`
- **CLUB_ID** = `'a1000000-0000-0000-0000-000000000001'`
- **TAX_RATE** = `0.16`

---

## Task 1: Replace CobrarComandaModal with three-mode version

**Files:**
- Modify: `apps/dashboard/src/components/modules/comandas/CobrarComandaModal.tsx`

**What to build:** Full replacement of the file. The modal keeps the same header, item list, and totals. Below the totals, three action buttons replace the old payment method selector. Clicking a button expands the relevant sub-panel inline.

### Step 1: Add new imports at top of file

Add these imports (keep existing ones):
```typescript
import { useRef } from 'react'
import { SplitAccountModal, type PersonSplit } from '@/components/modules/pos/SplitAccountModal'
import type { TicketItem } from '@/components/modules/pos/POSPage'
import type { PagoInput } from '@/lib/supabase/queries/pos'
```

### Step 2: Replace state declarations

Remove `const [selectedMetodo, setSelectedMetodo] = useState<MetodoPago | null>(null)`.

Add:
```typescript
type PayMode = 'single' | 'split-payment'
const [mode, setMode] = useState<PayMode | null>(null)
const [selectedMetodo, setSelectedMetodo] = useState<MetodoPago | null>(null)
const [splitEfectivo, setSplitEfectivo] = useState('')
const [splitAccountOpen, setSplitAccountOpen] = useState(false)
const splitEfectivoRef = useRef<HTMLInputElement>(null)
```

### Step 3: Add derived split-payment values (after existing `total` calculation)

```typescript
const splitEfectivoNum = parseFloat(splitEfectivo) || 0
const splitTarjeta = Math.max(0, total - splitEfectivoNum)
const splitCambio = splitEfectivoNum > total ? splitEfectivoNum - total : 0
const splitValid = splitEfectivoNum > 0 && splitEfectivoNum <= total + 0.01
```

### Step 4: Add `ticketItems` transform (after lineItems)

```typescript
const ticketItems: TicketItem[] = lineItems.map(li => ({
  id: li.producto_id,
  name: li.nombre,
  price: li.precio,
  qty: li.cantidad,
  category: '',
  imgClass: 'img-food',
  requiere_cocina: false,
}))
```

### Step 5: Add mode-switching helper

```typescript
function selectMode(m: PayMode) {
  setMode(prev => prev === m ? null : m)
  setSelectedMetodo(null)
  setSplitEfectivo('')
}
```

### Step 6: Update `handleCobrar` for single mode

Keep existing `handleCobrar` logic. Rename guard: `if (!selectedMetodo || paying || mode !== 'single') return`.

### Step 7: Add `handleConfirmSplit` for split-payment mode

```typescript
async function handleConfirmSplit() {
  if (!splitValid || paying) return
  setPaying(true)
  try {
    const pagos: PagoInput[] = []
    if (splitEfectivoNum > 0) pagos.push({ metodo: 'efectivo', monto: Math.min(splitEfectivoNum, total) })
    if (splitTarjeta > 0) pagos.push({ metodo: 'credito', monto: splitTarjeta })
    const { data, error } = await createCuenta(supabase, CLUB_ID, cuentaItems, pagos, undefined, 0, cajaId)
    if (error || !data) throw error ?? new Error('No cuenta')
    await updateComanda(supabase, comanda.id, { cuenta_id: data.id, estado: 'cobrado' })
    const cambioStr = splitCambio > 0 ? ` — Cambio: ${fmtCurrency(splitCambio)}` : ''
    toast.success(`Pago dividido ✓${cambioStr}`)
    onSuccess()
    onClose()
  } catch {
    toast.error('Error al procesar pago dividido')
  } finally {
    setPaying(false)
  }
}
```

Note: `cuentaItems` is the existing `CuentaItem[]` built from `lineItems` — extract it to a variable before `handleCobrar` and `handleConfirmSplit` so both can use it:
```typescript
const cuentaItems: CuentaItem[] = lineItems.map(li => ({
  producto_id: li.producto_id,
  nombre: li.nombre,
  precio_unitario: li.precio,
  cantidad: li.cantidad,
}))
```

### Step 8: Add `handleConfirmSplitAccount` for split-account mode

```typescript
async function handleConfirmSplitAccount(splits: PersonSplit[]) {
  setPaying(true)
  let firstCuentaId: string | null = null
  try {
    for (const split of splits) {
      const { data, error } = await createCuenta(supabase, CLUB_ID, split.items, split.metodo, undefined, 0, cajaId)
      if (error || !data) throw error ?? new Error('No cuenta')
      if (!firstCuentaId) firstCuentaId = data.id
    }
    await updateComanda(supabase, comanda.id, { cuenta_id: firstCuentaId!, estado: 'cobrado' })
    toast.success(`Cuenta dividida entre ${splits.length} persona${splits.length !== 1 ? 's' : ''} ✓`)
    onSuccess()
    onClose()
  } catch {
    toast.error('Error al dividir la cuenta')
  } finally {
    setPaying(false)
    setSplitAccountOpen(false)
  }
}
```

### Step 9: Replace the JSX action section

Remove the old payment method grid + cobrar button. Replace the entire section below `{/* Totals */}` block with:

```tsx
{/* SplitAccountModal overlay */}
{splitAccountOpen && (
  <SplitAccountModal
    open={splitAccountOpen}
    items={ticketItems}
    cajaId={cajaId}
    onConfirm={handleConfirmSplitAccount}
    onCancel={() => setSplitAccountOpen(false)}
  />
)}

{/* Action buttons */}
<div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
  {/* Single payment button */}
  <button
    onClick={() => selectMode('single')}
    style={{
      width: '100%', padding: '14px',
      background: mode === 'single' ? 'var(--color-lime)' : 'transparent',
      border: `1px solid ${mode === 'single' ? 'var(--color-lime)' : 'var(--color-border)'}`,
      borderRadius: '10px',
      color: mode === 'single' ? 'var(--color-bg)' : 'var(--color-text)',
      fontSize: '13px', fontWeight: 800, cursor: 'pointer',
      fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.3px',
      transition: 'all 0.15s',
    }}
  >
    {mode === 'single' ? `Cobrar ${fmtCurrency(total)}` : `Cobrar ${fmtCurrency(total)}`}
  </button>

  {/* Single mode expanded: payment method selector */}
  {mode === 'single' && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        {PAYMENT_OPTIONS.map((opt) => {
          const isSelected = selectedMetodo === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => setSelectedMetodo(opt.value)}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '12px 14px',
                background: isSelected ? 'rgba(108,242,13,0.08)' : 'var(--color-bg)',
                border: `1px solid ${isSelected ? 'rgba(108,242,13,0.40)' : 'var(--color-border)'}`,
                borderRadius: '10px', cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 0.15s', textAlign: 'left',
              }}
            >
              <span style={{ fontSize: '18px', lineHeight: 1 }}>{opt.icon}</span>
              <span style={{ fontSize: '12px', fontWeight: isSelected ? 800 : 600, color: isSelected ? 'var(--color-lime)' : 'var(--color-text)' }}>
                {opt.label}
              </span>
            </button>
          )
        })}
      </div>
      <button
        onClick={handleCobrar}
        disabled={!selectedMetodo || paying}
        style={{
          width: '100%', padding: '13px',
          background: !selectedMetodo || paying ? 'rgba(108,242,13,0.3)' : 'var(--color-lime)',
          border: 'none', borderRadius: '10px',
          color: 'var(--color-bg)', fontSize: '13px', fontWeight: 800,
          cursor: !selectedMetodo || paying ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.3px',
        }}
      >
        {paying ? 'Procesando...' : `Confirmar — ${fmtCurrency(total)}`}
      </button>
    </div>
  )}

  {/* Dividir Pago button */}
  <button
    onClick={() => selectMode('split-payment')}
    style={{
      width: '100%', padding: '13px',
      background: 'transparent',
      border: `1px solid ${mode === 'split-payment' ? 'var(--color-lime)' : 'var(--color-border)'}`,
      borderRadius: '10px',
      color: mode === 'split-payment' ? 'var(--color-lime)' : 'var(--color-muted)',
      fontSize: '13px', fontWeight: 700, cursor: 'pointer',
      fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.3px',
      transition: 'all 0.15s',
    }}
  >
    Dividir Pago
  </button>

  {/* Split payment expanded */}
  {mode === 'split-payment' && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Efectivo input */}
      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
          Monto en Efectivo
        </div>
        <input
          ref={splitEfectivoRef}
          type="number"
          value={splitEfectivo}
          onChange={(e) => setSplitEfectivo(e.target.value)}
          placeholder="0.00"
          min="0"
          style={{
            width: '100%', padding: '12px 14px',
            background: 'var(--color-bg)',
            border: `1px solid ${splitEfectivoNum > total + 0.01 ? 'rgba(234,179,8,0.5)' : 'var(--color-border)'}`,
            borderRadius: '10px', color: 'var(--color-text)',
            fontSize: '18px', fontFamily: 'var(--font-mono)', fontWeight: 700,
            outline: 'none', boxSizing: 'border-box', marginBottom: '8px',
          }}
        />
        <div style={{ display: 'flex', gap: '6px' }}>
          {[50, 100, 200, 500].map((v) => (
            <button
              key={v}
              onClick={() => setSplitEfectivo(String(v))}
              style={{
                flex: 1, padding: '7px 4px', background: 'var(--color-bg)',
                border: `1px solid ${splitEfectivoNum === v ? 'var(--color-lime)' : 'var(--color-border)'}`,
                borderRadius: '7px', color: splitEfectivoNum === v ? 'var(--color-lime)' : 'var(--color-muted)',
                fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 700, cursor: 'pointer',
              }}
            >
              ${v}
            </button>
          ))}
        </div>
      </div>

      {/* Tarjeta auto */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 16px', background: 'var(--color-bg)',
        border: '1px solid var(--color-border)', borderRadius: '10px',
      }}>
        <span style={{ fontSize: '12px', color: 'var(--color-muted)' }}>Tarjeta (auto)</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 700, color: splitTarjeta > 0 ? 'var(--color-text)' : 'var(--color-muted-dim)' }}>
          {fmtCurrency(splitTarjeta)}
        </span>
      </div>

      {/* Cambio */}
      {splitEfectivo && splitCambio > 0 && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 14px',
          background: 'rgba(108,242,13,0.06)',
          border: '1px solid rgba(108,242,13,0.20)',
          borderRadius: '10px',
        }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
            Cambio
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 700, color: 'var(--color-lime)' }}>
            {fmtCurrency(splitCambio)}
          </span>
        </div>
      )}

      {/* Confirm */}
      <button
        onClick={handleConfirmSplit}
        disabled={!splitEfectivo || !splitValid || paying}
        style={{
          width: '100%', padding: '13px',
          background: (!splitEfectivo || !splitValid || paying) ? 'rgba(108,242,13,0.3)' : 'var(--color-lime)',
          border: 'none', borderRadius: '10px',
          color: 'var(--color-bg)', fontSize: '13px', fontWeight: 800,
          cursor: (!splitEfectivo || !splitValid || paying) ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.3px',
        }}
      >
        {paying ? 'Procesando...' : 'Confirmar Pago Dividido'}
      </button>
    </div>
  )}

  {/* Dividir Cuenta button */}
  <button
    onClick={() => { setMode(null); setSplitAccountOpen(true) }}
    disabled={paying}
    style={{
      width: '100%', padding: '13px',
      background: 'transparent',
      border: '1px solid var(--color-border)',
      borderRadius: '10px',
      color: 'var(--color-muted)',
      fontSize: '13px', fontWeight: 700, cursor: paying ? 'not-allowed' : 'pointer',
      fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.3px',
      transition: 'all 0.15s',
    }}
  >
    Dividir Cuenta
  </button>
</div>

{/* Cancel */}
<button
  onClick={onClose}
  style={{
    width: '100%', padding: '11px',
    background: 'transparent',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: '10px',
    color: 'var(--color-muted-dim)',
    fontSize: '12px', fontWeight: 600, cursor: 'pointer',
    fontFamily: 'inherit',
  }}
>
  Cancelar
</button>
```

### Step 10: Verify TypeScript

```bash
cd apps/dashboard && npx tsc --noEmit
```
Expected: no errors.

### Step 11: Commit

```bash
git add apps/dashboard/src/components/modules/comandas/CobrarComandaModal.tsx
git commit -m "feat: add three payment modes to CobrarComandaModal (single, split-payment, split-account)"
```

---

## Manual Verification Checklist

1. **Single payment:** Open kanban → card with "Sin cobrar" → click Cobrar → click "Cobrar $X" → select Efectivo → click Confirmar → comanda moves to Cobrado column, movimiento appears in Caja
2. **Split payment:** Same flow → click "Dividir Pago" → enter effectivo amount → verify tarjeta auto-calculates → confirm → comanda cobrado
3. **Split account:** Same flow → click "Dividir Cuenta" → SplitAccountModal opens → assign items to persons → confirm → comanda cobrado, each persona has separate cuenta in historial
4. **Cambio display:** Enter efectivo > total in split payment → cambio badge appears in green
5. **Mode toggle:** Click "Cobrar $X" → panel opens → click again → panel closes (toggle behavior)
6. **TypeScript:** `tsc --noEmit` passes clean
