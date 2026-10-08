# Cancelaciones Audit Fixes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 6 gaps in the cancelaciones module so that approved refunds register in caja, subtract from historial KPIs, prevent duplicates, and update in realtime.

**Architecture:** One SQL migration (duplicate validation + reembolsos helper RPC). Six frontend file edits: pass real cajaId to CancelacionDetalle, add egresos to CajaStats, add realtime to CajaPage, subtract reembolsos from Historial KPIs, mark cancelled items visually, add estado to historial items query.

**Tech Stack:** PostgreSQL (Supabase RPCs), Next.js 16, React, Zustand, Supabase Realtime, TypeScript

---

### Task 1: SQL Migration — Duplicate validation + reembolsos helper

**Files:**
- Create: migration via Supabase MCP `apply_migration`

**Step 1: Apply the migration**

Apply a single migration named `fix_cancelaciones_duplicates_and_reembolsos_helper` with this SQL:

```sql
-- 1) Prevent duplicate cancellation requests for same item
CREATE OR REPLACE FUNCTION public.rpc_solicitar_cancelacion_post_cobro(
  p_club_id uuid,
  p_cuenta_item_id uuid,
  p_motivo text,
  p_cancelado_por uuid,
  p_metodo_pago text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_cancelacion_id uuid;
  v_item           record;
BEGIN
  -- Duplicate check
  IF EXISTS (
    SELECT 1 FROM cancelaciones
    WHERE cuenta_item_id = p_cuenta_item_id
      AND estado IN ('pendiente'::cancelacion_estado, 'aprobada'::cancelacion_estado, 'reembolsada'::cancelacion_estado)
  ) THEN
    RAISE EXCEPTION 'Ya existe una cancelación activa para este ítem';
  END IF;

  SELECT ci.*, c.club_id AS c_club_id
  INTO v_item
  FROM cuenta_items ci
  JOIN cuentas c ON c.id = ci.cuenta_id
  WHERE ci.id = p_cuenta_item_id
    AND c.club_id = p_club_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item no encontrado';
  END IF;

  INSERT INTO cancelaciones (
    club_id, cuenta_id, cuenta_item_id, cantidad, monto,
    motivo, tipo, estado, metodo_pago, cancelado_por
  )
  VALUES (
    p_club_id, v_item.cuenta_id, p_cuenta_item_id, v_item.cantidad, v_item.subtotal,
    p_motivo, 'post_cobro'::cancelacion_tipo, 'pendiente'::cancelacion_estado,
    p_metodo_pago, p_cancelado_por
  )
  RETURNING id INTO v_cancelacion_id;

  RETURN v_cancelacion_id;
END;
$function$;

-- 2) Helper to get total reembolsos in a date range
CREATE OR REPLACE FUNCTION public.rpc_get_reembolsos_periodo(
  p_club_id uuid,
  p_desde timestamptz,
  p_hasta timestamptz
)
RETURNS numeric
LANGUAGE sql
SECURITY DEFINER
AS $function$
  SELECT COALESCE(SUM(monto), 0)
  FROM cancelaciones
  WHERE club_id = p_club_id
    AND estado = 'reembolsada'::cancelacion_estado
    AND created_at >= p_desde
    AND created_at <= p_hasta;
$function$;
```

**Step 2: Verify the migration**

Run via `execute_sql`:
```sql
SELECT proname, pg_get_function_arguments(oid)
FROM pg_proc
WHERE proname IN ('rpc_solicitar_cancelacion_post_cobro', 'rpc_get_reembolsos_periodo');
```

Expected: both functions listed with correct arguments.

**Step 3: Commit**

```bash
git add -A && git commit -m "fix(db): add duplicate validation to cancelacion RPC + reembolsos helper"
```

---

### Task 2: CancelacionesPage — Fetch and pass cajaId to CancelacionDetalle

**Files:**
- Modify: `apps/dashboard/src/components/modules/cancelaciones/CancelacionesPage.tsx`
- Modify: `apps/dashboard/src/components/modules/cancelaciones/CancelacionDetalle.tsx`

**Step 1: Update CancelacionesPage to fetch caja activa**

In `CancelacionesPage.tsx`:

1. Add import at top:
```typescript
import { getCajaActiva } from '@/lib/supabase/queries/caja'
```

2. Add state after the existing state declarations (after line 27 `const [loading, setLoading] = useState(true)`):
```typescript
const [cajaId, setCajaId] = useState<string | null>(null)
```

3. In the `reload` callback, add `getCajaActiva` to the Promise.all (modify the existing one around line 32):
```typescript
const reload = useCallback(async () => {
  if (!clubId) return
  try {
    const [rows, s, caja] = await Promise.all([
      getCancelaciones(supabase, clubId, tab, todayLocal()),
      getCancelacionStats(supabase, clubId),
      getCajaActiva(supabase, clubId).catch(() => null),
    ])
    setCancelaciones(rows)
    setStats(s)
    setCajaId(caja?.id ?? null)
  } catch {
    toast.error('Error cargando cancelaciones')
  } finally {
    setLoading(false)
  }
}, [supabase, clubId, tab])
```

4. Pass `cajaId` to `CancelacionDetalle` (around line 111):
```tsx
<CancelacionDetalle
  cancelacion={selected}
  cajaId={cajaId}
  onAction={reload}
/>
```

**Step 2: Update CancelacionDetalle to accept and use cajaId**

In `CancelacionDetalle.tsx`:

1. Update Props interface (line 10-13):
```typescript
interface Props {
  cancelacion: CancelacionRow | null
  cajaId: string | null
  onAction: () => void
}
```

2. Update component signature (line 15):
```typescript
export function CancelacionDetalle({ cancelacion, cajaId, onAction }: Props) {
```

3. Update `handleAprobar` (line 35) — replace `null` with `cajaId`:
```typescript
await aprobarCancelacion(createClient(), cancelacion!.id, user.empleadoId, cajaId, false)
```

4. Update `handleRechazar` (line 49) — replace `null` with `cajaId`:
```typescript
await aprobarCancelacion(createClient(), cancelacion!.id, user.empleadoId, cajaId, true, rechazarMotivo)
```

5. Add warning banner before the approve/reject buttons (before line 111, inside the `isAdmin && estado === 'pendiente'` block). Add this right before the approve/reject grid div:
```tsx
{isAdmin && cancelacion.estado === 'pendiente' && cancelacion.metodo_pago === 'efectivo' && !cajaId && (
  <div style={{
    padding: '10px 12px', borderRadius: '8px',
    border: '1px solid rgba(234,179,8,0.3)',
    background: 'rgba(234,179,8,0.06)',
    fontSize: '12px', color: '#EAB308',
  }}>
    No hay caja abierta — el egreso no se registrará automáticamente
  </div>
)}
```

**Step 3: Verify**

Run: `npm run typecheck` from repo root.
Expected: no new type errors in `CancelacionesPage.tsx` or `CancelacionDetalle.tsx`.

**Step 4: Commit**

```bash
git add apps/dashboard/src/components/modules/cancelaciones/CancelacionesPage.tsx apps/dashboard/src/components/modules/cancelaciones/CancelacionDetalle.tsx
git commit -m "fix(cancelaciones): pass real cajaId to CancelacionDetalle for efectivo refunds"
```

---

### Task 3: getCajaStats — Include egresos in stats

**Files:**
- Modify: `apps/dashboard/src/lib/supabase/queries/caja.ts:26-33,86-117`
- Modify: `apps/dashboard/src/components/modules/caja/CajaPage.tsx:207-211,257-262,495`

**Step 1: Update CajaStats type**

In `caja.ts`, update the `CajaStats` interface (around line 26):

```typescript
export interface CajaStats {
  totalVentas: number
  totalEfectivo: number
  totalTarjeta: number
  totalPropinas: number
  totalEgresos: number
  countEfectivo: number
  countTarjeta: number
}
```

**Step 2: Accumulate egresos in getCajaStats**

In `caja.ts`, update the `getCajaStats` function loop (around line 86-117). Replace the entire function body after `const movs = ...`:

```typescript
  let totalEfectivo = 0
  let totalTarjeta = 0
  let totalPropinas = 0
  let totalEgresos = 0
  let countEfectivo = 0
  let countTarjeta = 0

  for (const m of movs) {
    if (m.tipo === 'egreso') {
      totalEgresos += m.monto
      continue
    }
    if (m.tipo !== 'ingreso') continue

    const esPropina = m.concepto.toLowerCase().includes('propina')
    if (esPropina) {
      totalPropinas += m.monto
      continue
    }

    if (m.metodo === 'efectivo') {
      totalEfectivo += m.monto
      countEfectivo++
    } else if (m.metodo === 'credito' || m.metodo === 'debito') {
      totalTarjeta += m.monto
      countTarjeta++
    }
  }

  return {
    totalVentas: totalEfectivo + totalTarjeta,
    totalEfectivo,
    totalTarjeta,
    totalPropinas,
    totalEgresos,
    countEfectivo,
    countTarjeta,
  }
```

**Step 3: Update CajaPage stat cards**

In `CajaPage.tsx`, update the breakdown array (around line 207-211) to add an egresos row:

```typescript
const breakdown = [
  { label: 'Efectivo', desc: `${stats.countEfectivo} transacciones`, value: fmtMoney(stats.totalEfectivo), color: undefined },
  { label: 'Tarjeta', desc: `${stats.countTarjeta} transacciones`, value: fmtMoney(stats.totalTarjeta), color: '#3B82F6' },
  { label: 'Propinas', desc: 'Separadas del ingreso', value: fmtMoney(stats.totalPropinas), color: '#EAB308' },
  ...(stats.totalEgresos > 0 ? [{ label: 'Reembolsos', desc: 'Egresos por cancelaciones', value: `-${fmtMoney(stats.totalEgresos)}`, color: '#EF4444' }] : []),
]
```

Also update the stat cards grid (around line 257-262). After the Propinas StatCard, add:

```tsx
{stats.totalEgresos > 0 && (
  <StatCard value={`-${fmtMoney(stats.totalEgresos)}`} label="Reembolsos" valueColor="#EF4444" />
)}
```

Update the default stats fallback (around line 495) to include `totalEgresos: 0`:

```typescript
stats={stats ?? { totalVentas: 0, totalEfectivo: 0, totalTarjeta: 0, totalPropinas: 0, totalEgresos: 0, countEfectivo: 0, countTarjeta: 0 }}
```

**Step 4: Verify**

Run: `npm run typecheck` from repo root.
Expected: no new type errors.

**Step 5: Commit**

```bash
git add apps/dashboard/src/lib/supabase/queries/caja.ts apps/dashboard/src/components/modules/caja/CajaPage.tsx
git commit -m "fix(caja): include egresos/reembolsos in CajaStats and display in UI"
```

---

### Task 4: CajaPage — Add realtime subscription to movimientos_caja

**Files:**
- Modify: `apps/dashboard/src/components/modules/caja/CajaPage.tsx:430-455`

**Step 1: Add realtime subscription**

In `CajaPage.tsx`, add a new `useEffect` after the load effect (after line 455). This subscribes to `movimientos_caja` inserts and triggers a reload:

```typescript
// Realtime: reload when new movimiento is inserted
useEffect(() => {
  if (!clubId || !caja) return
  const supabase = createClient()
  const channel = supabase
    .channel('caja-movimientos-rt')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'movimientos_caja',
    }, () => {
      // Reload stats and movimientos
      if (caja) {
        Promise.all([
          getCajaStats(supabase, caja.id),
          getMovimientosCaja(supabase, caja.id),
        ]).then(([s, m]) => {
          setStats(s)
          setMovimientos(m)
        }).catch(console.error)
      }
    })
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}, [clubId, caja])
```

**Step 2: Verify**

Run: `npm run typecheck` from repo root.
Expected: no type errors.

**Step 3: Commit**

```bash
git add apps/dashboard/src/components/modules/caja/CajaPage.tsx
git commit -m "feat(caja): add realtime subscription for movimientos_caja"
```

---

### Task 5: Historial query — Add estado to cuenta_items + reembolsos helper

**Files:**
- Modify: `apps/dashboard/src/lib/supabase/queries/historial.ts`

**Step 1: Add estado to VentaPOS items type**

In `historial.ts`, update the `items` type in the `VentaPOS` interface (line 13):

```typescript
items: { id: string; nombre: string; cantidad: number; precio_unitario: number; subtotal: number; estado: string }[]
```

**Step 2: Add estado to the cuenta_items select**

In `getHistorialVentas` (around line 67-72), add `estado` to the `cuenta_items` select:

```
cuenta_items (
  id,
  estado,
  cantidad,
  precio_unitario,
  subtotal,
  productos ( nombre )
)
```

**Step 3: Add estado to the mapping**

In the `.map()` call (around line 91-102), update the cast type and mapping:

```typescript
items: ((c.cuenta_items as unknown as {
  id: string
  estado: string
  cantidad: number
  precio_unitario: number
  subtotal: number
  productos: { nombre: string } | null
}[]) ?? []).map((i) => ({
  id: i.id,
  nombre: i.productos?.nombre ?? 'Producto',
  cantidad: i.cantidad,
  precio_unitario: i.precio_unitario,
  subtotal: i.subtotal,
  estado: i.estado ?? 'pendiente',
})),
```

**Step 4: Add getReembolsosPeriodo function**

Add this new export at the end of `historial.ts`:

```typescript
export async function getReembolsosPeriodo(
  supabase: SupabaseClient,
  clubId: string,
  desde: string,
  hasta: string,
): Promise<number> {
  const { data, error } = await supabase.rpc('rpc_get_reembolsos_periodo', {
    p_club_id: clubId,
    p_desde: desde,
    p_hasta: hasta,
  })
  if (error) throw error
  return (data as number) ?? 0
}
```

**Step 5: Verify**

Run: `npm run typecheck` from repo root.
Expected: no new type errors.

**Step 6: Commit**

```bash
git add apps/dashboard/src/lib/supabase/queries/historial.ts
git commit -m "fix(historial): add estado to cuenta_items query + reembolsos helper"
```

---

### Task 6: HistorialPage — Subtract reembolsos from KPIs + visual cancelled items

**Files:**
- Modify: `apps/dashboard/src/components/modules/historial/HistorialPage.tsx`

**Step 1: Import getReembolsosPeriodo**

Add to the existing import block from `historial` (around line 9-16):

```typescript
import {
  getHistorialVentas,
  getHistorialCanchas,
  getHistorialMovimientos,
  getReembolsosPeriodo,
  type VentaPOS,
  type RentaCancha,
  type MovimientoCajaHistorial,
} from '@/lib/supabase/queries/historial'
```

**Step 2: Add reembolsos state**

After the existing state declarations (around line 118, after `const [expandedId, setExpandedId] = ...`), add:

```typescript
const [totalReembolsos, setTotalReembolsos] = useState(0)
```

**Step 3: Fetch reembolsos in the load effect**

Update the existing `useEffect` (around line 134-147) to include `getReembolsosPeriodo`:

```typescript
useEffect(() => {
  if (!clubId) return
  setLoading(true)
  const supabase = createClient()
  Promise.all([
    getHistorialVentas(supabase, clubId, desde, hasta),
    getHistorialCanchas(supabase, clubId, desde, hasta),
    getHistorialMovimientos(supabase, clubId, desde, hasta),
    getReembolsosPeriodo(supabase, clubId, desde, hasta),
  ]).then(([v, c, m, r]) => {
    setVentas(v)
    setCanchas(c)
    setMovimientos(m)
    setTotalReembolsos(r)
  }).catch(console.error).finally(() => setLoading(false))
}, [clubId, desde, hasta])
```

**Step 4: Update KPI calculation**

Update `totalIngresos` calculation (around line 132) to subtract reembolsos:

```typescript
const totalIngresos = totalVentas + totalCanchas - totalReembolsos
```

**Step 5: Add Reembolsos KPI card**

Update `kpiCards` array (around line 149-154). Insert the reembolsos card before Total Ingresos (only when > 0):

```typescript
const kpiCards = [
  { label: 'Ventas POS', value: fmtMXN(totalVentas), sub: `${ventas.length} ticket${ventas.length !== 1 ? 's' : ''}`, color: 'var(--color-lime)' },
  { label: 'Canchas', value: fmtMXN(totalCanchas), sub: `${canchas.length} renta${canchas.length !== 1 ? 's' : ''}`, color: '#60a5fa' },
  { label: 'Mov. Caja', value: (netoCaja < 0 ? '-' : '') + fmtMXN(Math.abs(netoCaja)), sub: `${movimientos.length} movimiento${movimientos.length !== 1 ? 's' : ''}`, color: netoCaja >= 0 ? 'var(--color-lime)' : '#ef4444' },
  ...(totalReembolsos > 0 ? [{ label: 'Reembolsos', value: `-${fmtMXN(totalReembolsos)}`, sub: 'Cancelaciones aprobadas', color: '#EF4444' }] : []),
  { label: 'Total Ingresos', value: fmtMXN(totalIngresos), sub: 'Ventas + Canchas - Reembolsos', color: '#EAB308' },
]
```

**Step 6: Mark cancelled items visually**

In the expanded ticket items render (the `v.items.map` block), update the item row to show cancelled state. Replace the current item mapping with:

```tsx
{v.items.map((item, i) => {
  const isCancelled = item.estado === 'cancelado'
  return (
    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: 'var(--color-muted)', padding: '3px 0', opacity: isCancelled ? 0.5 : 1, textDecoration: isCancelled ? 'line-through' : 'none' }}>
      <span>
        {item.cantidad}x {item.nombre}
        {isCancelled && (
          <span style={{ marginLeft: '6px', fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', background: 'rgba(239,68,68,0.12)', color: '#EF4444', textDecoration: 'none', display: 'inline-block' }}>
            CANCELADO
          </span>
        )}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontFamily: 'var(--font-mono)' }}>{fmtMonto(item.subtotal)}</span>
        {!isCancelled && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setCancelItem({ cuentaItemId: item.id, nombre: item.nombre, metodo: v.metodos_pago[0]?.metodo ?? 'efectivo' })
              setCancelMotivo('')
            }}
            style={{ padding: '2px 7px', background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '5px', color: '#EF4444', fontSize: '10px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.3px' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            Cancelar
          </button>
        )}
      </div>
    </div>
  )
})}
```

**Step 7: Verify**

Run: `npm run typecheck` from repo root.
Expected: no type errors.

**Step 8: Commit**

```bash
git add apps/dashboard/src/components/modules/historial/HistorialPage.tsx
git commit -m "fix(historial): subtract reembolsos from KPIs + mark cancelled items visually"
```

---

### Summary

| Task | Gap Fixed | Files |
|------|-----------|-------|
| 1 | Gap 6 (duplicates) | SQL migration |
| 2 | Gap 1 (cajaId null) | CancelacionesPage, CancelacionDetalle |
| 3 | Gap 3 (egresos in stats) | queries/caja.ts, CajaPage |
| 4 | Gap 5 (realtime) | CajaPage |
| 5 | Gap 2+4 (query) | queries/historial.ts |
| 6 | Gap 2+4 (UI) | HistorialPage |

**Total:** 1 migration, 6 files modified, 0 new files.
