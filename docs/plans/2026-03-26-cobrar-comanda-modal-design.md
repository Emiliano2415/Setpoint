# Design: CobrarComandaModal — Three Payment Modes

**Date:** 2026-03-26
**Status:** Approved

## Context

The current `CobrarComandaModal` only supports a single payment method. Kitchen staff need the same payment flexibility as the POS: single method, split by payment type (cash + card), and split by person (item-by-item assignment). The modal is opened from the kanban board when a comanda has `cuenta_id === null`.

## Decisions Made

| Question | Answer |
|---|---|
| How to expose three payment modes? | Three action buttons at the bottom of the modal (Approach A) |
| Split by payment — same as POS? | Yes — inline sub-panel: cash input + auto-calculated card remainder |
| Split by person — same as POS? | Yes — reuse `SplitAccountModal` directly |
| Caja integration? | All three modes pass `cajaId` to `createCuenta()` — automatic via existing logic |
| Split-account comanda linking? | Link `cuenta_id` to the first split's cuenta; comanda marked `cobrado` |

---

## Modal Structure

```
┌─────────────────────────────┐
│  Cobrar comanda   12:40  ✕  │
├─────────────────────────────┤
│  1x Bowl Proteico  $130     │
│  1x Café con Leche  $50     │
├─────────────────────────────┤
│  Subtotal / IVA / Total     │
├─────────────────────────────┤
│  [Cobrar $X]                │  ← expands payment method selector
│  [Dividir Pago]             │  ← expands inline cash+card sub-panel
│  [Dividir Cuenta]           │  ← opens SplitAccountModal overlay
└─────────────────────────────┘
```

---

## Part 1 — State

```typescript
type PayMode = 'single' | 'split-payment' | 'split-account'

const [mode, setMode] = useState<PayMode | null>(null)
const [selectedMetodo, setSelectedMetodo] = useState<MetodoPago | null>(null)
const [splitEfectivo, setSplitEfectivo] = useState('')
const [splitAccountOpen, setSplitAccountOpen] = useState(false)
const [paying, setPaying] = useState(false)
```

Reset `selectedMetodo` and `splitEfectivo` when switching modes.

---

## Part 2 — Action Buttons

Three stacked buttons (full width):

```
[Cobrar $X.XX]      — lime background when mode === 'single', else outline
[Dividir Pago]      — lime outline when mode === 'split-payment', else subtle
[Dividir Cuenta]    — always outline, opens SplitAccountModal immediately
```

Clicking a button sets `mode` (or opens split-account modal). The selected mode's
sub-panel expands below the buttons.

---

## Part 3 — Mode: Single Payment

When `mode === 'single'`:
- 2×2 grid of payment method buttons: Efectivo / Crédito / Débito / Cortesía
- Confirm button: `Cobrar $X.XX` (lime, disabled if no method selected)

**On confirm:**
1. `createCuenta(supabase, CLUB_ID, cuentaItems, selectedMetodo, undefined, 0, cajaId)` → `cuentaId`
2. `updateComanda(supabase, comanda.id, { cuenta_id: cuentaId, estado: 'cobrado' })`
3. `toast.success('Cobrado ✓')` → `onSuccess()` → `onClose()`

---

## Part 4 — Mode: Split Payment (Efectivo + Tarjeta)

When `mode === 'split-payment'`, inline sub-panel:
- Input: "Monto en Efectivo" with quick-select buttons ($50, $100, $200, $500)
- Display: "Monto en Tarjeta" = max(0, total − efectivo) — auto-calculated, read-only
- Display: "Cambio" if efectivo > total
- Confirm button: `Confirmar Pago Dividido` (disabled if efectivo === 0 or efectivo > total + 0.01)

**On confirm:**
```typescript
const pagos: PagoInput[] = []
if (splitEfectivoNum > 0) pagos.push({ metodo: 'efectivo', monto: Math.min(splitEfectivoNum, total) })
if (splitTarjeta > 0) pagos.push({ metodo: 'credito', monto: splitTarjeta })
```
1. `createCuenta(supabase, CLUB_ID, cuentaItems, pagos, undefined, 0, cajaId)` → `cuentaId`
2. `updateComanda(supabase, comanda.id, { cuenta_id: cuentaId, estado: 'cobrado' })`
3. `toast.success(...)` → `onSuccess()` → `onClose()`

---

## Part 5 — Mode: Split Account (Por Persona)

When `[Dividir Cuenta]` is clicked, open `SplitAccountModal` as overlay.

**Transform comanda items → TicketItem[]:**
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

**SplitAccountModal props:**
```typescript
<SplitAccountModal
  open={splitAccountOpen}
  items={ticketItems}
  cajaId={cajaId}
  onConfirm={handleConfirmSplitAccount}
  onCancel={() => setSplitAccountOpen(false)}
/>
```

**`handleConfirmSplitAccount`:**
1. For each split: `createCuenta(supabase, CLUB_ID, split.items, split.metodo, undefined, 0, cajaId)` → collect first `cuentaId`
2. After all splits: `updateComanda(supabase, comanda.id, { cuenta_id: firstCuentaId, estado: 'cobrado' })`
3. `toast.success('Cuenta dividida ✓')` → `onSuccess()` → `onClose()`

---

## Caja Integration

All three modes call `createCuenta()` with `cajaId`. The existing logic in `createCuenta()` automatically inserts `movimientos_caja` entries for each payment. No additional changes needed.

---

## Files Changed

| File | Change |
|---|---|
| `components/modules/comandas/CobrarComandaModal.tsx` | Replace with three-mode version |

No other files change. `SplitAccountModal` is reused as-is.
