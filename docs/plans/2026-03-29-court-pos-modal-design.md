# CourtPOSModal Design

**Goal:** Replace the basic `CourtProductPickerModal` with a fullscreen POS modal that reuses existing POS components, allowing staff to add consumables and time extensions to an active court session without touching the court's billing status.

**Approved:** 2026-03-29

---

## Context

- Check-in already paid the court rental via `CheckInPaymentModal`
- `CourtAccountModal` currently uses `CourtProductPickerModal` — a minimal 3-column picker that closes after each add, with no accumulation UX
- The full POS (`POSPage`) already has categories, product grid, ticket panel, split account, and kitchen routing — all reusable
- Court sessions can receive consumables mid-session; players may also request time extensions at the court's hourly rate

---

## Architecture

**New file:** `apps/dashboard/src/components/modules/pistas/CourtPOSModal.tsx`

Fullscreen modal (`position: fixed, inset: 0, zIndex: 1100`) that mounts:
- `CategoryTabs` — DB categories + 1 virtual "Extensión" tab injected at the start
- `ProductGrid` — DB products OR 3 synthetic extension items when "Extensión" is active
- `TicketPanel` — existing ticket panel, handles all payment logic including `createCuenta` + `cajaId`

**Entry point:** `CourtAccountModal.tsx` — the existing "+ Agregar" button (`setPickerOpen(true)`) is replaced by `setCourtPOSOpen(true)`. `CourtProductPickerModal` is no longer used from this context.

**No changes to `TicketPanel`, `CategoryTabs`, or `ProductGrid`** — they are mounted as-is.

---

## Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ HEADER                                                           │
│ ● Cancha 3  ·  Jeesus  ·  00:47:23 (live timer)   [■ Finalizar] [✕] │
├────────────────────────────────────┬─────────────────────────────┤
│  CategoryTabs                      │                             │
│  ──────────────────────────────    │   TicketPanel               │
│  ProductGrid                       │   (normal cobro flow)       │
│                                    │                             │
└────────────────────────────────────┴─────────────────────────────┘
```

Same 2-column grid as `POSPage`: `gridTemplateColumns: '1fr 320px'`, `height: 100vh`.

---

## Extensión de Tiempo

When the "Extensión" virtual category is active, `ProductGrid` receives 3 synthetic `Product` objects (not from DB):

| id | name | price |
|----|------|-------|
| `ext-15` | `+15 min — Extensión` | `reserva.precio * 0.25` |
| `ext-30` | `+30 min — Extensión` | `reserva.precio * 0.5` |
| `ext-60` | `+60 min — Extensión` | `reserva.precio * 1.0` |

These are constructed in-memory inside `CourtPOSModal` and passed to `ProductGrid` exactly like normal products. `requiere_cocina: false`, `imgClass: 'img-cancha'`, `category: 'Extensión'`.

---

## Session Actions

### Cobrar (via TicketPanel)
- Normal POS flow: `createCuenta` → caja registration → ticket cleared
- Court session **remains active** — no state change on `reservas`
- Modal stays open after sale so staff can continue adding items
- `onSale` callback triggers `onRefresh()` on `CourtAccountModal` (sidebar update)

### Finalizar sesión (header button, outline red)
- If ticket has items → show inline confirmation:
  > "Hay X productos sin cobrar. ¿Qué deseas hacer?"
  > [Cobrar y finalizar] [Solo finalizar] [Cancelar]
- If ticket is empty → calls `updateReservaEstado(supabase, reserva.id, 'finalizada')` directly
- On success: `onFinalize()` → `CourtAccountModal` closes → `PistasPage` refreshes courts

### ✕ Cerrar sin cobrar
- Closes modal, ticket discarded, session continues active
- No confirmation needed (session not affected)

---

## Props Interface

```typescript
interface CourtPOSModalProps {
  open: boolean
  court: Court                  // for name, timer, status
  reserva: ReservaRow           // for precio (extension calc), id (finalize)
  cajaId: string | undefined
  supabase: SupabaseClient
  onClose: () => void           // X button — session untouched
  onFinalize: () => void        // after finalizar — triggers full refresh
}
```

---

## Data Flow

```
CourtAccountModal
  └── [Agregar Productos] → CourtPOSModal(court, reserva, cajaId, supabase)
        ├── "Extensión" tab active
        │     └── ProductGrid ← synthetic ext-15/30/60 items
        ├── DB category active
        │     └── ProductGrid ← normal products from DB
        ├── TicketPanel
        │     └── createCuenta → movimiento_caja → onSale()
        └── [Finalizar sesión]
              └── updateReservaEstado('finalizada') → onFinalize()
```

---

## What Does NOT Change

- `TicketPanel` — no modifications, used as-is
- `CategoryTabs` — no modifications, receives extra virtual tab via props
- `ProductGrid` — no modifications, receives synthetic products transparently
- `CourtProductPickerModal` — kept in codebase, just no longer called from `CourtAccountModal`
- `CheckInPaymentModal` — unrelated, no changes
- Court billing on check-in — unrelated, no changes

---

## Files Touched

| File | Change |
|------|--------|
| `apps/dashboard/src/components/modules/pistas/CourtPOSModal.tsx` | **Create** |
| `apps/dashboard/src/components/modules/pistas/CourtAccountModal.tsx` | Replace picker open → CourtPOS open; add `CourtPOSModal` import |
| `apps/dashboard/src/components/modules/pos/TicketPanel.tsx` | Verify `cajaId` prop exists and works (read-only check, no changes expected) |
