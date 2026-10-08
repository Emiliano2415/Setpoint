# Bug Fix Plan — Critical → High → Medium → Low

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 89 bugs found in the 2026-03-30 audit, starting with critical atomicity/money loss issues, ending with systemic cleanup.

**Architecture:** DB atomicity via Supabase RPC stored procedures (true transactions). TypeScript fixes applied inline with CLUB_ID/useMemo cleanup in every touched file. Document each fix in Obsidian `13 - Auditoría de Calidad 2026-03-30.md`.

**Tech Stack:** PostgreSQL (Supabase MCP for migrations), TypeScript/React, Supabase JS SDK, Zustand (`useAppStore`)

**Rule:** When any file is modified, also fix in that same file: (a) `CLUB_ID` hardcode → `useAppStore.getState().clubId`, and (b) bare `createClient()` outside `useMemo` → wrap in `useMemo`.

---

## BLOCK 1 — DB: Stored Procedures (Prerequisite for C-05, C-11, C-12, C-13)

### Task 1.1: Create `rpc_open_caja` stored procedure

**Files:**
- Apply via: Supabase MCP `apply_migration`

**Step 1: Write and apply the migration**

```sql
-- Migration: add_rpc_open_caja
CREATE OR REPLACE FUNCTION rpc_open_caja(
  p_club_id   uuid,
  p_empleado_id uuid,
  p_tipo      text,
  p_fondo     numeric,
  p_notas     text DEFAULT 'Fondo inicial de turno'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_turno_id uuid;
  v_caja_id  uuid;
BEGIN
  -- Insert turno
  INSERT INTO turnos (club_id, empleado_id, tipo, activo)
  VALUES (p_club_id, p_empleado_id, p_tipo, true)
  RETURNING id INTO v_turno_id;

  -- Insert caja
  INSERT INTO cajas (club_id, turno_id, fondo_inicial, estado,
                     total_efectivo, total_tarjeta, total_propinas, diferencia)
  VALUES (p_club_id, v_turno_id, p_fondo, 'abierta', 0, 0, 0, 0)
  RETURNING id INTO v_caja_id;

  -- Insert fondo movement if > 0
  IF p_fondo > 0 THEN
    INSERT INTO movimientos_caja (caja_id, tipo, concepto, monto)
    VALUES (v_caja_id, 'fondo', p_notas, p_fondo);
  END IF;

  RETURN jsonb_build_object('cajaId', v_caja_id, 'turnoId', v_turno_id);
END;
$$;
```

**Step 2: Verify via SQL**
```sql
SELECT proname FROM pg_proc WHERE proname = 'rpc_open_caja';
```
Expected: one row with `rpc_open_caja`.

---

### Task 1.2: Create `rpc_close_caja` stored procedure

**Files:**
- Apply via: Supabase MCP `apply_migration`

**Step 1: Write and apply the migration**

```sql
-- Migration: add_rpc_close_caja
CREATE OR REPLACE FUNCTION rpc_close_caja(
  p_caja_id   uuid,
  p_turno_id  uuid,
  p_contado   numeric,
  p_esperado  numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_diferencia numeric;
BEGIN
  v_diferencia := p_contado - p_esperado;

  UPDATE cajas
  SET estado      = 'cerrada',
      total_efectivo = p_contado,
      diferencia  = v_diferencia,
      cerrada_at  = now()
  WHERE id = p_caja_id;

  UPDATE turnos
  SET fin    = now(),
      activo = false
  WHERE id = p_turno_id;
END;
$$;
```

**Step 2: Verify via SQL**
```sql
SELECT proname FROM pg_proc WHERE proname = 'rpc_close_caja';
```

---

### Task 1.3: Create `rpc_check_in_with_payment` stored procedure

**Files:**
- Apply via: Supabase MCP `apply_migration`

**Step 1: Write and apply the migration**

```sql
-- Migration: add_rpc_check_in_with_payment
CREATE OR REPLACE FUNCTION rpc_check_in_with_payment(
  p_reserva_id uuid,
  p_precio     numeric,
  p_metodo     text,
  p_caja_id    uuid,
  p_concepto   text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert movimiento FIRST (if this fails, reserva stays unchanged)
  INSERT INTO movimientos_caja (caja_id, tipo, monto, metodo, concepto)
  VALUES (p_caja_id, 'ingreso', p_precio, p_metodo::text, p_concepto);

  -- Only update reserva estado if payment registered successfully
  UPDATE reservas
  SET estado = 'checkin'
  WHERE id = p_reserva_id;
END;
$$;
```

**Step 2: Verify via SQL**
```sql
SELECT proname FROM pg_proc WHERE proname = 'rpc_check_in_with_payment';
```

---

### Task 1.4: Create `rpc_adjust_stock` stored procedure

**Files:**
- Apply via: Supabase MCP `apply_migration`

**Step 1: Write and apply the migration**

```sql
-- Migration: add_rpc_adjust_stock
CREATE OR REPLACE FUNCTION rpc_adjust_stock(
  p_club_id     uuid,
  p_producto_id uuid,
  p_tipo        text,
  p_cantidad    numeric,
  p_stock_actual numeric,
  p_motivo      text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stock_posterior numeric;
  v_cantidad_mov    numeric;
BEGIN
  -- Calculate new stock
  IF p_tipo IN ('salida', 'merma') THEN
    v_stock_posterior := GREATEST(0, p_stock_actual - p_cantidad);
  ELSIF p_tipo = 'ajuste' THEN
    v_stock_posterior := p_cantidad;
  ELSE -- entrada
    v_stock_posterior := p_stock_actual + p_cantidad;
  END IF;

  v_cantidad_mov := ABS(CASE WHEN p_tipo = 'ajuste' THEN p_cantidad - p_stock_actual ELSE p_cantidad END);

  -- Insert movement log
  INSERT INTO movimientos_stock (club_id, producto_id, tipo, cantidad,
                                  stock_anterior, stock_posterior, motivo)
  VALUES (p_club_id, p_producto_id, p_tipo, v_cantidad_mov,
          p_stock_actual, v_stock_posterior, p_motivo);

  -- Update product stock
  UPDATE productos SET stock_actual = v_stock_posterior WHERE id = p_producto_id;
END;
$$;
```

**Step 2: Verify via SQL**
```sql
SELECT proname FROM pg_proc WHERE proname = 'rpc_adjust_stock';
```

---

## BLOCK 2 — Money Loss Bugs

### Task 2.1: Fix C-11 + C-12 — Replace `openCaja` and `closeCaja` with RPC calls

**Bug C-11:** `closeCaja` in `caja.ts:133-161` — two sequential UPDATEs without transaction. If turno UPDATE fails, caja is closed but turno stays active.

**Bug C-12:** `openCaja` in `caja.ts:255-262` — `movimientos_caja` insert for fondo has no error handling. Silent failure loses the fondo record.

**Files:**
- Modify: `apps/dashboard/src/lib/supabase/queries/caja.ts`

**Step 1: Replace `openCaja` function (lines 219-265)**

Old code:
```typescript
export async function openCaja(
  supabase: SupabaseClient,
  clubId: string,
  empleadoId: string,
  tipo: string,
  fondoInicial: number,
  notas?: string,
): Promise<OpenCajaResult> {
  const { data: turno, error: turnoError } = await supabase
    .from('turnos')
    .insert({
      club_id: clubId,
      empleado_id: empleadoId,
      tipo,
      activo: true,
    })
    .select('id')
    .single()
  if (turnoError) throw turnoError

  const { data: caja, error: cajaError } = await supabase
    .from('cajas')
    .insert({
      club_id: clubId,
      turno_id: turno.id,
      fondo_inicial: fondoInicial,
      estado: 'abierta',
      total_efectivo: 0,
      total_tarjeta: 0,
      total_propinas: 0,
      diferencia: 0,
    })
    .select('id')
    .single()
  if (cajaError) throw cajaError

  if (fondoInicial > 0) {
    await supabase.from('movimientos_caja').insert({
      caja_id: caja.id,
      tipo: 'fondo',
      concepto: notas ?? 'Fondo inicial de turno',
      monto: fondoInicial,
    })
  }

  return { cajaId: caja.id, turnoId: turno.id }
}
```

New code:
```typescript
export async function openCaja(
  supabase: SupabaseClient,
  clubId: string,
  empleadoId: string,
  tipo: string,
  fondoInicial: number,
  notas?: string,
): Promise<OpenCajaResult> {
  const { data, error } = await supabase.rpc('rpc_open_caja', {
    p_club_id: clubId,
    p_empleado_id: empleadoId,
    p_tipo: tipo,
    p_fondo: fondoInicial,
    p_notas: notas ?? 'Fondo inicial de turno',
  })
  if (error) throw error
  return { cajaId: (data as { cajaId: string; turnoId: string }).cajaId, turnoId: (data as { cajaId: string; turnoId: string }).turnoId }
}
```

**Step 2: Replace `closeCaja` function (lines 133-161)**

Old code:
```typescript
export async function closeCaja(
  supabase: SupabaseClient,
  cajaId: string,
  turnoId: string,
  contado: number,
  esperado: number,
): Promise<void> {
  const diferencia = contado - esperado

  const { error: cajaError } = await supabase
    .from('cajas')
    .update({
      estado: 'cerrada',
      total_efectivo: contado,
      diferencia,
      cerrada_at: new Date().toISOString(),
    })
    .eq('id', cajaId)
  if (cajaError) throw cajaError

  const { error: turnoError } = await supabase
    .from('turnos')
    .update({
      fin: new Date().toISOString(),
      activo: false,
    })
    .eq('id', turnoId)
  if (turnoError) throw turnoError
}
```

New code:
```typescript
export async function closeCaja(
  supabase: SupabaseClient,
  cajaId: string,
  turnoId: string,
  contado: number,
  esperado: number,
): Promise<void> {
  const { error } = await supabase.rpc('rpc_close_caja', {
    p_caja_id: cajaId,
    p_turno_id: turnoId,
    p_contado: contado,
    p_esperado: esperado,
  })
  if (error) throw error
}
```

**Step 3: Verify**

Open a caja, then close it. Check in Supabase:
```sql
SELECT c.estado, c.cerrada_at, t.activo, t.fin
FROM cajas c JOIN turnos t ON c.turno_id = t.id
WHERE c.id = '<caja_id>';
```
Expected: `estado = 'cerrada'`, `cerrada_at NOT NULL`, `t.activo = false`, `t.fin NOT NULL`.

**Step 4: Commit**
```bash
git add apps/dashboard/src/lib/supabase/queries/caja.ts
git commit -m "fix(caja): use atomic RPC for openCaja and closeCaja — fixes C-11, C-12"
```

---

### Task 2.2: Fix C-05 — Replace `checkInWithPayment` with RPC call

**Bug C-05:** `pistas.ts:139-160` — `updateReservaEstado('checkin')` runs FIRST. If `insertMovimientoCaja` fails, reserva is stuck in checkin with no payment registered.

**Files:**
- Modify: `apps/dashboard/src/lib/supabase/queries/pistas.ts`

**Step 1: Replace `checkInWithPayment` function (lines 139-160)**

Old code:
```typescript
export async function checkInWithPayment(
  supabase: SupabaseClient,
  reservaId: string,
  precio: number,
  metodo: MetodoPago,
  cajaId: string,
  concepto: string,
): Promise<void> {
  await updateReservaEstado(supabase, reservaId, 'checkin')
  try {
    await insertMovimientoCaja(supabase, {
      caja_id: cajaId,
      tipo: 'ingreso',
      monto: precio,
      metodo: metodo,
      concepto: concepto,
    })
  } catch (err) {
    console.error('[checkInWithPayment] Failed to register in caja:', err)
    throw new Error('Check-in completado pero no se pudo registrar en caja. Regístralo manualmente.')
  }
}
```

New code:
```typescript
export async function checkInWithPayment(
  supabase: SupabaseClient,
  reservaId: string,
  precio: number,
  metodo: MetodoPago,
  cajaId: string,
  concepto: string,
): Promise<void> {
  const { error } = await supabase.rpc('rpc_check_in_with_payment', {
    p_reserva_id: reservaId,
    p_precio: precio,
    p_metodo: metodo,
    p_caja_id: cajaId,
    p_concepto: concepto,
  })
  if (error) throw error
}
```

**Step 2: Verify**

Simulate a check-in in the UI. Then check:
```sql
SELECT r.estado, m.monto, m.metodo, m.tipo
FROM reservas r
LEFT JOIN movimientos_caja m ON m.concepto LIKE '%check%'
WHERE r.id = '<reserva_id>';
```
Expected: `estado = 'checkin'` AND `m.monto = precio`.

**Step 3: Commit**
```bash
git add apps/dashboard/src/lib/supabase/queries/pistas.ts
git commit -m "fix(pistas): use atomic RPC for checkInWithPayment — fixes C-05"
```

---

### Task 2.3: Fix C-13 — Replace `adjustStock` with RPC call

**Bug C-13:** `inventario.ts:92-102` — two sequential awaits with no error handling. If the `productos` UPDATE fails, `movimientos_stock` has a record but stock wasn't changed.

**Files:**
- Modify: `apps/dashboard/src/lib/supabase/queries/inventario.ts`

**Step 1: Replace `adjustStock` function (lines 77-103)**

Old code:
```typescript
export async function adjustStock(
  supabase: SupabaseClient,
  clubId: string,
  productoId: string,
  tipo: 'entrada' | 'salida' | 'ajuste' | 'merma',
  cantidad: number,
  stockActual: number,
  motivo: string | null,
): Promise<void> {
  const stockPosterior = tipo === 'salida' || tipo === 'merma'
    ? Math.max(0, stockActual - cantidad)
    : tipo === 'ajuste'
    ? cantidad
    : stockActual + cantidad

  await supabase.from('movimientos_stock').insert({
    club_id: clubId,
    producto_id: productoId,
    tipo,
    cantidad: Math.abs(tipo === 'ajuste' ? cantidad - stockActual : cantidad),
    stock_anterior: stockActual,
    stock_posterior: stockPosterior,
    motivo: motivo || null,
  })

  await supabase.from('productos').update({ stock_actual: stockPosterior }).eq('id', productoId)
}
```

New code:
```typescript
export async function adjustStock(
  supabase: SupabaseClient,
  clubId: string,
  productoId: string,
  tipo: 'entrada' | 'salida' | 'ajuste' | 'merma',
  cantidad: number,
  stockActual: number,
  motivo: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('rpc_adjust_stock', {
    p_club_id: clubId,
    p_producto_id: productoId,
    p_tipo: tipo,
    p_cantidad: cantidad,
    p_stock_actual: stockActual,
    p_motivo: motivo || null,
  })
  if (error) throw error
}
```

**Step 2: Verify**

Apply a stock adjustment in the Inventario UI. Then check:
```sql
SELECT m.tipo, m.cantidad, m.stock_anterior, m.stock_posterior,
       p.stock_actual
FROM movimientos_stock m JOIN productos p ON p.id = m.producto_id
WHERE m.producto_id = '<producto_id>'
ORDER BY m.created_at DESC LIMIT 1;
```
Expected: `p.stock_actual = m.stock_posterior`.

**Step 3: Commit**
```bash
git add apps/dashboard/src/lib/supabase/queries/inventario.ts
git commit -m "fix(inventario): use atomic RPC for adjustStock — fixes C-13"
```

---

### Task 2.4: Fix C-06 — `createCuenta` — check pos.ts for missing error on payment insert

**Bug C-06:** In `pos.ts`, if the `pagos` insert fails after `cuentas` was already inserted, the cuenta is left open with no payment record.

**Files:**
- Read first: `apps/dashboard/src/lib/supabase/queries/pos.ts`
- Modify: `apps/dashboard/src/lib/supabase/queries/pos.ts`

**Step 1: Read the file**
Use the Read tool on `apps/dashboard/src/lib/supabase/queries/pos.ts`.

**Step 2: Identify the exact location of the issue**
Look for `createCuenta`. The pattern will be:
1. Insert into `cuentas` → get cuenta_id
2. Insert into `cuenta_items`
3. Insert into `pagos`
4. (maybe) update cuenta estado to 'pagada'

If any step after step 1 fails, add explicit error handling that updates cuenta to 'cancelada' as a compensating action.

**Step 3: Wrap payment insert in try/catch with compensating update**

After reading the file, add compensation logic:
```typescript
try {
  const { error: pagosError } = await supabase.from('pagos').insert(pagosPayload)
  if (pagosError) throw pagosError
} catch (err) {
  // Compensate: mark cuenta as cancelada to avoid orphaned open account
  await supabase.from('cuentas').update({ estado: 'cancelada' }).eq('id', cuentaId)
  throw err
}
```

**Step 4: Also fix CLUB_ID and useMemo in this file if present**

**Step 5: Commit**
```bash
git add apps/dashboard/src/lib/supabase/queries/pos.ts
git commit -m "fix(pos): compensate cuenta on payment insert failure — fixes C-06"
```

---

### Task 2.5: Fix C-14 — `getCajaStats` double-counts mixed payments

**Bug C-14:** `caja.ts:86-107` — `getCajaStats` iterates `movimientos_caja` and accumulates `totalEfectivo` and `totalTarjeta`. But split-payment transactions insert TWO separate movimientos. The logic correctly counts each separate movimiento, so this may actually be fine — need to verify if the split creates one or two movimiento records.

**Files:**
- Read: `apps/dashboard/src/lib/supabase/queries/pos.ts` to see how split payments are recorded
- If split creates one movimiento with metodo=null and monto=total → bug exists
- If split creates two separate movimientos (one efectivo, one credito) → no bug

**Step 1: Read `pos.ts` createCuenta to check how pagos/movimientos are created for splits**

**Step 2: Verify in DB**
```sql
SELECT metodo, monto, concepto FROM movimientos_caja
WHERE caja_id = '<caja_id>' ORDER BY created_at DESC LIMIT 10;
```

If only one record per split payment: fix `getCajaStats` to handle the `monto` by splitting proportionally or store both methods.

---

### Task 2.6: Fix C-02 — `cajaId` in TicketPanel never refreshes

**Bug C-02:** `TicketPanel.tsx:39-43` — `getCajaActiva` effect has `[]` deps. If staff opens the POS before opening the shift, `cajaId` stays `null` forever.

**Files:**
- Modify: `apps/dashboard/src/components/modules/pos/TicketPanel.tsx`

**Step 1: Read TicketPanel.tsx fully first**

**Step 2: Replace the cajaId useEffect and add CLUB_ID fix**

Change line 15 from:
```typescript
const CLUB_ID = 'a1000000-0000-0000-0000-000000000001'
```
To: (import useAppStore and remove the constant)
```typescript
import { useAppStore } from '@/store/useAppStore'
```

Change lines 27-43:
```typescript
export function TicketPanel({ items, onUpdateQty, onRemove, onClear, onHistoryOpen }: TicketPanelProps) {
  const clubId = useAppStore((s) => s.clubId)
  const [discountRules, setDiscountRules] = useState<DescuentoRegla[]>([])
  const [activeRuleId, setActiveRuleId] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)
  const [cajaId, setCajaId] = useState<string | null | undefined>()
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    if (!clubId) return
    getDescuentosActivos(supabase, clubId)
      .then(setDiscountRules)
      .catch(() => {})
  }, [supabase, clubId])

  useEffect(() => {
    if (!clubId) return
    getCajaActiva(supabase, clubId)
      .then(c => setCajaId(c?.id ?? null))
      .catch(() => console.warn('[TicketPanel] No se pudo verificar caja activa'))
  }, [supabase, clubId])
```

Also add `useMemo` import and `useAppStore` import at top of file.

Replace all remaining `CLUB_ID` references in the file with `clubId`.

**Step 3: Verify**
1. Open POS without a caja active → `cajaId` should be `null`
2. Open a new caja shift → navigate away and back to POS
3. `cajaId` should now reflect the new caja (it will re-read on `clubId` change, but also on component mount)

Note: Since `clubId` is stable, the effect only runs on mount. For true reactive refresh when caja opens, we'd need a store event or a polling interval — but fixing the empty deps is the minimum correct fix.

**Step 4: Commit**
```bash
git add apps/dashboard/src/components/modules/pos/TicketPanel.tsx
git commit -m "fix(pos): refresh cajaId on mount with correct deps, fix CLUB_ID hardcode — fixes C-02"
```

---

### Task 2.7: Fix C-16 — Hardcoded $450 tarifa for available courts

**Bug C-16:** `PistasPage.tsx:120` — `tarifa: p.en_mantenimiento ? 0 : 450` hardcodes $450 for courts with no active reserva. Should fetch default tarifa from `pistas` table's `precio_base` or similar column, or show 0 with a placeholder.

**Files:**
- Read: `apps/dashboard/src/components/modules/pistas/PistasPage.tsx` (full)
- Check: Does `pistas` table have a `precio_base` or `tarifa_base` column?

**Step 1: Check DB schema**
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'pistas' ORDER BY ordinal_position;
```

**Step 2a: If `precio_base` column exists**
- Update `PistaRow` interface in `pistas.ts` to include `precio_base: number`
- Change line 120 in PistasPage: `tarifa: p.en_mantenimiento ? 0 : (p.precio_base ?? 0)`
- Also fix CLUB_ID in PistasPage if present

**Step 2b: If no `precio_base` column**
- Change line 120 to `tarifa: 0` (show no tarifa for available courts without reserva, let the ReservationModal set actual price)
- This is better than hardcoding $450

**Step 3: Also add `precio_base` to `PistaRow` interface and getPistas select query if column exists**

**Step 4: Commit**
```bash
git add apps/dashboard/src/lib/supabase/queries/pistas.ts \
        apps/dashboard/src/components/modules/pistas/PistasPage.tsx
git commit -m "fix(pistas): remove hardcoded \$450 tarifa for available courts — fixes C-16"
```

---

## BLOCK 3 — Data Corruption Bugs

### Task 3.1: Fix C-08 — `createComanda` drops `nombre` and `precio_unitario`

**Bug C-08:** `comandas.ts:68-73` — `itemsPayload` only maps `comanda_id, producto_id, cantidad, estado`. Fields `nombre` and `precio_unitario` from `ComandaItemInput` are silently discarded.

**Files:**
- Modify: `apps/dashboard/src/lib/supabase/queries/comandas.ts`

**Step 1: Check if `comanda_items` table has `nombre` and `precio_unitario` columns**
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'comanda_items' ORDER BY ordinal_position;
```

**Step 2: Update `itemsPayload` to include both fields (lines 68-73)**

Old code:
```typescript
const itemsPayload = items.map((item) => ({
  comanda_id: comanda.id,
  producto_id: item.producto_id,
  cantidad: item.cantidad,
  estado: 'pendiente',
}))
```

New code (add the fields if columns exist):
```typescript
const itemsPayload = items.map((item) => ({
  comanda_id: comanda.id,
  producto_id: item.producto_id,
  cantidad: item.cantidad,
  estado: 'pendiente',
  nombre: item.nombre,
  precio_unitario: item.precio_unitario,
}))
```

**Step 3: Verify**
Create a comanda through the POS "Enviar a cocina" flow. Check:
```sql
SELECT nombre, precio_unitario, cantidad FROM comanda_items
ORDER BY created_at DESC LIMIT 5;
```
Expected: `nombre` and `precio_unitario` populated.

**Step 4: Commit**
```bash
git add apps/dashboard/src/lib/supabase/queries/comandas.ts
git commit -m "fix(comandas): include nombre and precio_unitario in comanda_items insert — fixes C-08"
```

---

### Task 3.2: Fix C-04 — UTC timezone offset in date range queries

**Bug C-04:** Multiple query files use `${today}T00:00:00.000Z` with literal Z (UTC). In Mexico (UTC-6), this means the query starts at 6am local time, missing orders from midnight to 6am.

**Affected files:**
- `apps/dashboard/src/lib/supabase/queries/comandas.ts` (line 143-144)
- `apps/dashboard/src/lib/supabase/queries/caja.ts` (if any date range queries exist)
- `apps/dashboard/src/lib/supabase/queries/historial.ts` (check for same pattern)
- `apps/dashboard/src/lib/supabase/queries/reportes.ts` (check for same pattern)

**Step 1: Create a shared timezone helper**

Add to `apps/dashboard/src/lib/format.ts`:
```typescript
/** Returns ISO string for start of day in Mexico City time (UTC-6, no DST adjustment) */
export function localDayStart(date?: Date): string {
  const d = date ?? new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  // Mexico City is UTC-6 (no DST in most of Mexico)
  return `${y}-${m}-${day}T06:00:00.000Z`
}

export function localDayEnd(date?: Date): string {
  const d = date ?? new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  // End of day Mexico City = next day 05:59:59 UTC
  return `${y}-${m}-${day}T05:59:59.999Z`
}
```

Note: A more correct solution uses `Intl.DateTimeFormat` with timezone, but the simple UTC-6 offset covers Mexico City (Guadalajara/Mexico City/Monterrey all use CST UTC-6 without DST since 2022).

**Step 2: Update `comandas.ts` date filter (lines 143-144)**

Old:
```typescript
.gte('created_at', `${today}T00:00:00.000Z`)
.lte('created_at', `${today}T23:59:59.999Z`)
```

New:
```typescript
import { localDayStart, localDayEnd } from '@/lib/format'
// ...
.gte('created_at', localDayStart())
.lte('created_at', localDayEnd())
```

**Step 3: Apply same fix to historial.ts and reportes.ts** (read those files first to find similar patterns)

**Step 4: Verify**

At 1am Mexico time (7am UTC), comandas created at midnight should still appear.

**Step 5: Commit**
```bash
git add apps/dashboard/src/lib/format.ts \
        apps/dashboard/src/lib/supabase/queries/comandas.ts \
        apps/dashboard/src/lib/supabase/queries/historial.ts \
        apps/dashboard/src/lib/supabase/queries/reportes.ts
git commit -m "fix(queries): use local Mexico timezone for day-range filters — fixes C-04"
```

---

### Task 3.3: Fix C-01 — Validate `cajaId` is present before allowing payment

**Bug C-01:** TicketPanel allows proceeding to pay even when `cajaId` is null (no active shift). Payment records to movimientos_caja will fail or be untracked.

**Files:**
- Modify: `apps/dashboard/src/components/modules/pos/TicketPanel.tsx` (same file as Task 2.6)
- Do this in the same edit as Task 2.6

**Step 1: Add guard in `openPayModal` and `openSplitModal`**

Old `openPayModal` (line 96):
```typescript
function openPayModal(metodo: MetodoPago) {
  if (items.length === 0) return
  setRecibido('')
  setPayModal({ open: true, metodo })
}
```

New:
```typescript
function openPayModal(metodo: MetodoPago) {
  if (items.length === 0) return
  if (!cajaId) {
    toast.error('No hay turno activo. Abre el turno en Caja antes de cobrar.')
    return
  }
  setRecibido('')
  setPayModal({ open: true, metodo })
}
```

Old `openSplitModal` (line 102):
```typescript
function openSplitModal() {
  if (items.length === 0) return
  setSplitOpen(true)
}
```

New:
```typescript
function openSplitModal() {
  if (items.length === 0) return
  if (!cajaId) {
    toast.error('No hay turno activo. Abre el turno en Caja antes de cobrar.')
    return
  }
  setSplitOpen(true)
}
```

This fix can be included in the same commit as Task 2.6.

---

### Task 3.4: Fix C-07 — `getComandas` missing `cuenta_id` field in select

**Bug C-07:** `getComandas` select query — `cuenta_id` is listed as a join (`cuenta_id (numero_ticket, ...)`), but the outer `FROM comandas` field `cuenta_id` as a raw UUID is not also selected. This is actually fine for joins in Supabase — the join replaces the raw field. Need to verify the real bug.

**Files:**
- Read `apps/dashboard/src/components/modules/comandas/ComandasPage.tsx` to understand how `cuenta_id` is used
- If the Kanban uses `comanda.cuenta_id.numero_ticket` and also needs the raw `cuenta_id` UUID for linking, check if both are available

**Step 1: Read ComandasPage.tsx**

**Step 2: If `cuenta_id` UUID is needed, add it explicitly to select**

In `comandas.ts` line 107-141, add `cuenta_id,` as a raw UUID alongside the join (Supabase allows selecting both the FK and the joined result with different aliases in PostgREST).

---

### Task 3.5: Fix C-09 — Handle `null` items in `getConsumosPorReserva`

**Bug C-09:** `comandas.ts:213` — `ci.cuenta_item_id?.precio_unitario ?? 0` silently returns 0 when `cuenta_item_id` is null. This shows $0 for items in the check-in payment modal.

**Files:**
- Modify: `apps/dashboard/src/lib/supabase/queries/comandas.ts`
- Also: `apps/dashboard/src/components/modules/pistas/ReservationModal.tsx` or `CheckInPaymentModal` — verify where this data is displayed

**Step 1: Fix the fallback to show actual price**

In `getConsumosPorReserva`, when `cuenta_item_id` is null, fall back to `producto_id.precio` from the comanda_items join. Update the select to include `producto_id(id, nombre, precio)` if not already there.

**Step 2: Update the mapping**
```typescript
items.push({
  id: ci.id,
  nombre: ci.cuenta_item_id?.producto_id?.nombre ?? ci.producto_nombre ?? 'Producto',
  cantidad: ci.cantidad,
  precio_unitario: ci.cuenta_item_id?.precio_unitario ?? ci.producto_precio ?? 0,
})
```

---

### Task 3.6: Fix C-10, C-15, C-17, C-18 — Read affected files and apply fixes

These bugs require reading the files first:

**C-10:** Historial date range filter — same UTC bug as C-04, covered by Task 3.2.

**C-15:** `ReservationModal` doesn't validate `hora_fin > hora_inicio` before save.
- File: `apps/dashboard/src/components/modules/pistas/ReservationModal.tsx`
- Fix: Add validation before calling `createReserva`: `if (horaFin <= horaInicio) { toast.error('La hora de fin debe ser mayor a la hora de inicio'); return }`

**C-17:** `CloseShiftModal` passes wrong `esperado` value to `closeCaja`.
- File: `apps/dashboard/src/components/modules/caja/CloseShiftModal.tsx`
- Fix: Read the file, find where `closeCaja` is called, verify `esperado` is `stats.totalEfectivo` not `cajaActiva.fondo_inicial`

**C-18:** `ComandasPage` refresh — does not refresh after `cobrarComanda`.
- File: `apps/dashboard/src/components/modules/comandas/ComandasPage.tsx`
- Fix: After cobrar action, call `refreshComandas()` or re-fetch

**Step 1: Read each file**
- `apps/dashboard/src/components/modules/pistas/ReservationModal.tsx`
- `apps/dashboard/src/components/modules/caja/CloseShiftModal.tsx`
- `apps/dashboard/src/components/modules/comandas/ComandasPage.tsx`

**Step 2: Apply targeted fixes to each, commit each separately**

---

## BLOCK 4 — UX / Operation Bugs

### Task 4.1: Fix A-02 — Missing loading state on Cobrar button in ComandasPage

**Bug A-02:** Cobrar button in ComandasPage has no loading state — staff can double-click and submit twice.

**Files:**
- Modify: `apps/dashboard/src/components/modules/comandas/ComandasPage.tsx`

**Step 1: Add `cobrando` state and disable button during payment**
```typescript
const [cobrando, setCobrando] = useState(false)
// ...
async function handleCobrar(comanda: ComandaFromDB) {
  if (cobrando) return
  setCobrando(true)
  try {
    // existing cobrar logic
  } finally {
    setCobrando(false)
  }
}
// ...
<button disabled={cobrando} onClick={() => handleCobrar(comanda)}>
  {cobrando ? 'Cobrando...' : 'Cobrar'}
</button>
```

**Step 2: Commit**
```bash
git commit -m "fix(comandas): prevent double-submit on Cobrar button — fixes A-02"
```

---

### Task 4.2: Fix A-06, A-08, A-10, A-15 — Read files and apply UX fixes

**A-06:** `ShiftHistoryPanel` — cortes list doesn't refresh after closing a shift.
- File: `apps/dashboard/src/components/modules/caja/ShiftHistoryPanel.tsx`
- Fix: After close event propagates, trigger a re-fetch in ShiftHistoryPanel

**A-08:** `PistasPage` — after creating a reservation, courts don't refresh immediately.
- File: `apps/dashboard/src/components/modules/pistas/PistasPage.tsx`
- Fix: After `createReserva` succeeds, call `refreshCourts()`

**A-10:** `InventarioPage` — stock stats don't update after `adjustStock`.
- File: `apps/dashboard/src/components/modules/inventario/InventarioPage.tsx`
- Fix: After adjustStock success, re-fetch stats

**A-15:** `ClientesPage` — new client form doesn't clear after save.
- File: `apps/dashboard/src/components/modules/clientes/ClientesPage.tsx`
- Fix: After successful save, reset form fields to empty

**Step 1: Read each file, apply targeted fix, commit per file**

---

## BLOCK 5 — Systemic CLUB_ID Cleanup (Files not touched in Blocks 1-4)

### Task 5.1: Audit remaining CLUB_ID hardcodes

**Step 1: Find all remaining hardcoded CLUB_IDs**
```bash
grep -rn "a1000000-0000-0000-0000-000000000001" apps/dashboard/src \
  --include="*.ts" --include="*.tsx"
```

**Step 2: For each file found that was NOT already fixed in Blocks 1-4:**
- Add `import { useAppStore } from '@/store/useAppStore'` at top (for React components)
- Replace `const CLUB_ID = '...'` with `const clubId = useAppStore((s) => s.clubId)`
- Or for non-component files that receive clubId as parameter, verify the caller passes it correctly

**Step 3: Fix bare `createClient()` calls in components without useMemo**

After fixing CLUB_ID, search for:
```bash
grep -rn "createClient()" apps/dashboard/src/components --include="*.tsx"
```

For each component with a bare `const supabase = createClient()` outside a hook, wrap it:
```typescript
const supabase = useMemo(() => createClient(), [])
```

**Step 4: Commit per module**
```bash
git add apps/dashboard/src/components/modules/<module>/
git commit -m "fix(<module>): replace hardcoded CLUB_ID with useAppStore — systemic cleanup"
```

---

## Obsidian Documentation Template

After each task/commit, add to `obsidian-setpoint/13 - Auditoría de Calidad 2026-03-30.md` under `## Correcciones Aplicadas`:

```markdown
### [BUG-ID] — Nombre del Bug
- **Archivo:** `ruta/al/archivo.ts:línea`
- **Bug:** Descripción de qué estaba mal
- **Solución:** Qué se cambió (ej. "migrado a RPC atómico `rpc_close_caja`")
- **Verificación:**
  - ✅ SQL query ejecutado: `SELECT ...` → resultado esperado
  - ✅ UI probada: flujo → resultado
- **Commit:** `hash — mensaje`
- **Fecha:** 2026-04-05
```

---

## Execution Order Summary

| Block | Tasks | Bugs Fixed | Risk |
|-------|-------|------------|------|
| 1 | 1.1-1.4 | C-05, C-11, C-12, C-13 | DB migration (apply via MCP) |
| 2 | 2.1-2.7 | C-06, C-14, C-02, C-16 | TypeScript, needs Block 1 first |
| 3 | 3.1-3.6 | C-01, C-04, C-07, C-08, C-09, C-10, C-15, C-17, C-18 | TypeScript |
| 4 | 4.1-4.2 | A-02, A-06, A-08, A-10, A-15 | TypeScript |
| 5 | 5.1 | Systemic CLUB_ID in remaining modules | TypeScript |
