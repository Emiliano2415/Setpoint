# Design: POS — Dividir Cuenta por Persona + Wizard de Gestión de Menú

**Date:** 2026-03-25
**Status:** Approved

---

## Overview

Two improvements to the POS module:

1. **"Dividir Cuenta"** — a new split-by-person feature. Different from the existing "Dividir Pago" (which splits a single bill between cash and card), this allows assigning specific items to specific people, each paying separately with their chosen method. Creates separate tickets per person in the database.

2. **Menu Management Wizard** — redesign of the "Agregar producto" flow inside `MenuManagementModal` as a 3-step guided wizard with animated transitions.

---

## Part 1: Dividir Cuenta por Persona

### Button Layout Change — `TicketPanel.tsx`

The current 3-button row (`[EFECTIVO] [TARJETA] [DIVIDIR]`) becomes a 2×2 grid:

```
[EFECTIVO]      [TARJETA]
[DIVIDIR PAGO]  [DIVIDIR CUENTA]
```

- **DIVIDIR PAGO** — renamed from current DIVIDIR. Identical behavior: splits total between efectivo + tarjeta in one ticket.
- **DIVIDIR CUENTA** — new button. Opens `SplitAccountModal`.

### New Component: `SplitAccountModal.tsx`

Located at: `apps/dashboard/src/components/modules/pos/SplitAccountModal.tsx`

**Props:**
```typescript
interface SplitAccountModalProps {
  open: boolean
  items: TicketItem[]           // all items from the current ticket
  total: number                 // already calculated (with discount + IVA)
  discount: number
  onConfirm: (splits: PersonSplit[]) => Promise<void>
  onCancel: () => void
}

interface PersonSplit {
  nombre: string
  items: TicketItem[]           // assigned items (may be partial quantities)
  metodo: MetodoPago
  subtotal: number
  iva: number
  total: number
}
```

### Tab 1: "Por persona" (Item Assignment)

**State:**
```typescript
const [persons, setPersons] = useState<Person[]>([])       // { id, nombre, itemAssignments }
const [assignments, setAssignments] = useState<Map<string, string>>()  // itemId → personId
const [newPersonName, setNewPersonName] = useState('')
const [metodoPorPersona, setMetodoPorPersona] = useState<Map<string, MetodoPago>>()
```

**UI Layout:**
- Left column (persons list):
  - "+ Agregar persona" button → inline input → adds person with name
  - Each person shows name + live subtotal
- Right column (items list):
  - Each item shows name, qty, price
  - Tapping item shows a dropdown/popover with person options
  - Assigned items show colored dot matching person
  - Unassigned items are highlighted with amber warning tint
- Bottom section (cobro):
  - One row per person: name, subtotal, method selector (Efectivo / Crédito / Débito / Cortesía)
  - Warning if unassigned items remain
  - "Cobrar todo" button — disabled until ALL items assigned AND all methods selected

**Assignment logic:**
- Items with `qty > 1` can be split: e.g. 3× Agua can be 2 to Carlos, 1 to Jesús
- If qty split needed: tapping item shows qty selector per person
- Subtotals recalculated in real time

**Confirm flow:**
- Calls `onConfirm(splits)` — one `PersonSplit` per person
- Parent `TicketPanel` calls `createCuenta()` for each split sequentially
- Each generates: 1 `cuentas` row + N `cuenta_items` + 1 `pagos` + 1 `movimientos_caja`
- On all success: `resetTicket()` + success toast "Cuenta dividida entre N personas"
- On any failure: toast error, ticket NOT reset (retry possible)

### Tab 2: "Partes iguales"

**State:**
```typescript
const [numPersons, setNumPersons] = useState(2)
const [metodoPorPersona, setMetodoPorPersona] = useState<Map<number, MetodoPago>>()
```

**UI:**
- Total display
- Stepper `[ - ] [ N ] [ + ]` for number of persons (min 2, max 10)
- One row per person: "Persona N" + amount + method selector
- If total not evenly divisible: remainder added to last person (shown as note)
- "Cobrar todo" button — enabled when all methods selected

**Confirm flow:**
- Each person gets the same `items` array with proportional amounts
- Creates N tickets, each with `total / N` (or adjusted last)
- Same error handling as Tab 1

### Database Impact

No schema changes required. Each person's split creates a normal `cuentas` row:
- `numero_ticket`: `SP-{timestamp}-{personIndex}` (e.g. `SP-123456-1`, `SP-123456-2`)
- `caja_id`: active caja (same for all splits)
- `estado`: `'pagada'`
- Items and pagos linked normally

---

## Part 2: Menu Management Wizard

### Trigger

In `MenuManagementModal.tsx`, the "+ Agregar" button opens a new submodal `AddProductWizard` (z-index: 1200, above the parent modal at z-index ~900).

### New Component: `AddProductWizard.tsx`

Located at: `apps/dashboard/src/components/modules/pos/AddProductWizard.tsx`

**Props:**
```typescript
interface AddProductWizardProps {
  open: boolean
  categories: Categoria[]
  clubId: string
  onSuccess: (newProduct: Producto) => void
  onCancel: () => void
}
```

**State:**
```typescript
const [step, setStep] = useState<1 | 2 | 3>(1)
const [selectedCategory, setSelectedCategory] = useState<Categoria | null>(null)
const [nombre, setNombre] = useState('')
const [precio, setPrecio] = useState('')
const [saving, setSaving] = useState(false)
const [direction, setDirection] = useState<'forward' | 'back'>('forward')
```

### Step 1 — Categoría

- Header: "Nuevo producto" + step indicator `● ○ ○`
- Body: Grid of category cards (2-3 columns)
  - Each card: colored gradient background (using `IMG_CLASS_BY_CATEGORY` color map), category name
  - Selected state: lime border + lime background tint + checkmark
- Footer: `[Cancelar]` `[Continuar →]` (disabled until category selected)

### Step 2 — Nombre y Precio

- Header: "Nuevo producto" + step indicator `● ● ○` + "Categoría: {nombre} [← Cambiar]"
- Body:
  - Large label "Nombre del producto" + text input (autofocused, placeholder example per category)
  - Large label "Precio (MXN)" + number input with `$` prefix, monospace font
- Footer: `[← Atrás]` `[Continuar →]` (disabled until name ≥ 2 chars AND price > 0)

### Step 3 — Confirmar

- Header: "Nuevo producto" + step indicator `● ● ●`
- Body:
  - Product preview card matching the style of `TicketItemRow` in POSPage:
    - Gradient background from category class
    - Product name
    - Category name (muted)
    - Price (monospace, lime)
  - Text: "¿Todo correcto?" in muted style
- Footer: `[← Atrás]` `[✓ Agregar al menú]` (green CTA)
  - On click: `saving = true`, calls `createProducto()`, on success calls `onSuccess(product)` + brief success animation

### Transitions

Between steps: CSS transition on a wrapper div — `transform: translateX` animating from right (+100%) or left (-100%) based on `direction`. Duration 200ms ease-out.

Step indicator: 3 dots, filled lime for completed/current steps, border-only for upcoming.

### Integration in `MenuManagementModal`

1. Add `showWizard` boolean state
2. Replace the existing collapsed add form with `<AddProductWizard open={showWizard} ... />`
3. Remove the old `showAddForm` state and collapsible form
4. On `onSuccess`: add product to local `products` state + show toast + close wizard

---

## Files to Create/Modify

| File | Change |
|---|---|
| `components/modules/pos/SplitAccountModal.tsx` | New component |
| `components/modules/pos/AddProductWizard.tsx` | New component |
| `components/modules/pos/TicketPanel.tsx` | Add DIVIDIR CUENTA button (2×2 grid), wire SplitAccountModal |
| `components/modules/pos/MenuManagementModal.tsx` | Replace add form with AddProductWizard |

---

## Verification

1. **Dividir Cuenta — Por persona:**
   - Add 2+ persons, assign all items, each picks method
   - Confirm → N tickets created in BD, N movimientos in caja
   - Ticket resets after success
   - Unassigned items block confirmation

2. **Dividir Cuenta — Partes iguales:**
   - Select N persons, each picks method
   - Confirm → N equal-amount tickets created
   - Remainder goes to last person when not evenly divisible

3. **Dividir Pago (existing):**
   - Still works exactly as before (renamed, no behavior change)

4. **Add Product Wizard:**
   - Step 1: selecting category enables Continue
   - Step 2: name + price validation
   - Step 3: preview matches entered data
   - On save: product appears in list immediately
   - Back navigation preserves entered data

5. **No regression:**
   - Single payment (efectivo, tarjeta) still works
   - Existing DIVIDIR PAGO still works
   - Menu toggle (active/inactive) still works
   - Price inline editing still works
