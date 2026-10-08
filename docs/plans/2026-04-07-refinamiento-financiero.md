# Refinamiento Financiero — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refinar el flujo de dinero completo de Setpoint adaptando las mejores prácticas de Toast POS, Lightspeed y Square: categorización de movimientos, permisos granulares, arqueo detallado, shift review obligatorio, y alertas de stock en tiempo real.

**Architecture:** 5 features en orden de dependencia. Cada una es una migración DB + edits frontend mínimos. Sin archivos nuevos excepto el hook `usePermiso`. Todo el estado nuevo usa Zustand + Supabase Realtime existente.

**Tech Stack:** Next.js 16 App Router, Supabase (PostgreSQL + Realtime), Zustand 5, TypeScript, Sonner toasts

---

## Task 1: DB Migration — movimiento_categoria enum + columna

**Files:**
- Migration via Supabase MCP `apply_migration`

**Step 1: Apply migration**

Nombre: `add_movimiento_categoria_to_movimientos_caja`

```sql
-- Crear enum de categorías
CREATE TYPE movimiento_categoria AS ENUM (
  'fondo_inicial',
  'venta',
  'cancha',
  'reembolso',
  'retiro',
  'petty_cash',
  'propina',
  'ajuste',
  'otro'
);

-- Agregar columna a movimientos_caja (nullable para no romper registros existentes)
ALTER TABLE movimientos_caja
  ADD COLUMN IF NOT EXISTS categoria movimiento_categoria;

-- Backfill: inferir categoria desde tipo y concepto existentes
UPDATE movimientos_caja SET categoria = 'fondo_inicial'
  WHERE tipo = 'fondo';

UPDATE movimientos_caja SET categoria = 'reembolso'
  WHERE tipo = 'egreso' AND concepto ILIKE '%reembolso%';

UPDATE movimientos_caja SET categoria = 'retiro'
  WHERE tipo = 'retiro';

UPDATE movimientos_caja SET categoria = 'propina'
  WHERE concepto ILIKE '%propina%';

UPDATE movimientos_caja SET categoria = 'petty_cash'
  WHERE tipo = 'egreso' AND categoria IS NULL;

UPDATE movimientos_caja SET categoria = 'venta'
  WHERE tipo = 'ingreso' AND categoria IS NULL;
```

**Step 2: Verify**

```sql
SELECT categoria, COUNT(*) FROM movimientos_caja GROUP BY categoria;
```

Expected: rows grouped by categoria, no NULLs (or minimal NULLs from old records).

**Step 3: Commit (migration only)**

```bash
git add -A && git commit -m "feat(db): add movimiento_categoria enum and column to movimientos_caja"
```

---

## Task 2: CashMovementModal — Agregar selector de categoría

**Files:**
- Modify: `apps/dashboard/src/components/modules/caja/CashMovementModal.tsx`
- Modify: `apps/dashboard/src/lib/supabase/queries/caja.ts`

**Step 1: Actualizar tipo MovimientoCategoria en caja.ts**

En `apps/dashboard/src/lib/supabase/queries/caja.ts`, después de la línea de `MovimientoTipo` (línea ~7), agregar:

```typescript
export type MovimientoCategoria =
  | 'fondo_inicial'
  | 'venta'
  | 'cancha'
  | 'reembolso'
  | 'retiro'
  | 'petty_cash'
  | 'propina'
  | 'ajuste'
  | 'otro'
```

**Step 2: Actualizar InsertMovimientoData en caja.ts**

Modificar la interfaz `InsertMovimientoData` (línea ~45) para incluir `categoria`:

```typescript
export interface InsertMovimientoData {
  caja_id: string
  tipo: MovimientoTipo
  concepto: string
  monto: number
  metodo?: MetodoPago | null
  categoria?: MovimientoCategoria | null
}
```

**Step 3: Actualizar MovimientoCaja interface en caja.ts**

Agregar `categoria` a la interfaz `MovimientoCaja` (línea ~36):

```typescript
export interface MovimientoCaja {
  id: string
  caja_id: string
  tipo: MovimientoTipo
  concepto: string
  monto: number
  metodo: MetodoPago | null
  categoria: MovimientoCategoria | null
  created_at: string
}
```

**Step 4: Reemplazar CashMovementModal completo**

Reemplazar el contenido de `apps/dashboard/src/components/modules/caja/CashMovementModal.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { insertMovimientoCaja } from '@/lib/supabase/queries/caja'
import type { MovimientoTipo, MovimientoCategoria } from '@/lib/supabase/queries/caja'
import { toast } from 'sonner'

interface Props {
  cajaId: string
  onClose: () => void
  onSuccess: () => void
}

const CATEGORIA_OPTS: {
  value: MovimientoCategoria
  label: string
  desc: string
  tipo: MovimientoTipo
}[] = [
  { value: 'venta', label: 'Venta', desc: 'Ingreso por venta', tipo: 'ingreso' },
  { value: 'cancha', label: 'Cancha', desc: 'Ingreso por renta de pista', tipo: 'ingreso' },
  { value: 'propina', label: 'Propina', desc: 'Propina recibida', tipo: 'ingreso' },
  { value: 'fondo_inicial', label: 'Fondo', desc: 'Depósito de fondo', tipo: 'fondo' },
  { value: 'reembolso', label: 'Reembolso', desc: 'Devolución por cancelación', tipo: 'egreso' },
  { value: 'retiro', label: 'Retiro', desc: 'Retiro de efectivo autorizado', tipo: 'retiro' },
  { value: 'petty_cash', label: 'Gasto menor', desc: 'Petty cash / gasto operativo', tipo: 'egreso' },
  { value: 'ajuste', label: 'Ajuste', desc: 'Corrección manual (requiere notas)', tipo: 'egreso' },
  { value: 'otro', label: 'Otro', desc: 'Otro (requiere descripción)', tipo: 'ingreso' },
]

export function CashMovementModal({ cajaId, onClose, onSuccess }: Props) {
  const [categoria, setCategoria] = useState<MovimientoCategoria>('venta')
  const [notas, setNotas] = useState('')
  const [monto, setMonto] = useState('')
  const [saving, setSaving] = useState(false)

  const selected = CATEGORIA_OPTS.find((o) => o.value === categoria)!
  const montoNum = parseFloat(monto) || 0
  const notasRequeridas = categoria === 'ajuste' || categoria === 'otro'
  const canSubmit = montoNum > 0 && (!notasRequeridas || notas.trim().length > 0)

  async function handleSubmit() {
    if (!canSubmit) return
    setSaving(true)
    try {
      await insertMovimientoCaja(createClient(), {
        caja_id: cajaId,
        tipo: selected.tipo,
        concepto: notas.trim() || selected.label,
        monto: montoNum,
        categoria,
      })
      toast.success('Movimiento registrado')
      onSuccess()
    } catch {
      toast.error('Error al registrar movimiento')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'var(--color-bg2)', border: '1px solid var(--color-border)', borderRadius: '16px', width: '440px', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '16px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Movimiento de Caja</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', padding: '4px' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Categoría */}
          <div>
            <label style={labelStyle}>Categoría</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
              {CATEGORIA_OPTS.map((opt) => (
                <div
                  key={opt.value}
                  onClick={() => setCategoria(opt.value)}
                  style={{
                    padding: '8px 10px', cursor: 'pointer', borderRadius: '8px', transition: 'all 0.15s',
                    background: categoria === opt.value ? 'rgba(108,242,13,0.06)' : 'var(--color-bg)',
                    border: `1px solid ${categoria === opt.value ? 'rgba(108,242,13,0.25)' : 'var(--color-border)'}`,
                  }}
                >
                  <div style={{ fontSize: '11px', fontWeight: 700, color: categoria === opt.value ? 'var(--color-lime)' : 'var(--color-text)' }}>{opt.label}</div>
                  <div style={{ fontSize: '9px', color: 'var(--color-muted-dim)', marginTop: '2px' }}>{opt.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Tipo derivado */}
          <div style={{ padding: '8px 12px', background: 'var(--color-bg)', borderRadius: '8px', fontSize: '11px', color: 'var(--color-muted)' }}>
            Tipo: <strong style={{ color: 'var(--color-text)', textTransform: 'capitalize' }}>{selected.tipo}</strong>
          </div>

          {/* Notas */}
          <div>
            <label style={labelStyle}>
              {notasRequeridas ? 'Descripción *' : 'Notas (opcional)'}
            </label>
            <input
              type="text"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder={notasRequeridas ? 'Descripción requerida...' : 'Ej: Gasto limpieza, propina turno...'}
              style={inputStyle}
            />
          </div>

          {/* Monto */}
          <div>
            <label style={labelStyle}>Monto (MXN)</label>
            <input
              type="number"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0.00"
              style={{ ...inputStyle, fontSize: '20px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', paddingTop: '4px' }}>
            <button onClick={onClose} style={cancelBtnStyle}>Cancelar</button>
            <button
              onClick={handleSubmit}
              disabled={saving || !canSubmit}
              style={{
                padding: '13px', border: 'none', borderRadius: '10px',
                background: saving || !canSubmit ? 'rgba(108,242,13,0.3)' : 'var(--color-lime)',
                color: 'var(--color-bg)', fontSize: '13px', fontWeight: 800,
                cursor: saving || !canSubmit ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.3px',
              }}
            >
              {saving ? 'Guardando...' : 'Registrar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '10px', fontWeight: 700,
  color: 'var(--color-muted)', textTransform: 'uppercase',
  letterSpacing: '0.5px', marginBottom: '6px',
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', background: 'var(--color-bg)',
  border: '1px solid var(--color-border)', borderRadius: '8px',
  color: 'var(--color-text)', fontSize: '13px', fontFamily: 'inherit',
  outline: 'none', boxSizing: 'border-box',
}
const cancelBtnStyle: React.CSSProperties = {
  padding: '13px', background: 'var(--color-bg)',
  border: '1px solid var(--color-border)', borderRadius: '10px',
  color: 'var(--color-muted)', fontSize: '13px', fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit',
}
```

**Step 5: Verificar tipos**

```bash
cd apps/dashboard && npx tsc --noEmit 2>&1 | grep -E "CashMovement|caja\.ts" | head -10
```

Expected: sin errores nuevos en esos archivos.

**Step 6: Commit**

```bash
git add apps/dashboard/src/components/modules/caja/CashMovementModal.tsx apps/dashboard/src/lib/supabase/queries/caja.ts
git commit -m "feat(caja): add movimiento_categoria selector to CashMovementModal"
```

---

## Task 3: DB Migration — tabla permisos_rol

**Files:**
- Migration via Supabase MCP `apply_migration`

**Step 1: Apply migration**

Nombre: `add_permisos_rol_table`

```sql
-- Tabla de permisos configurables por rol y club
CREATE TABLE IF NOT EXISTS permisos_rol (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  club_id uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  rol text NOT NULL,
  accion text NOT NULL,
  permitido boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, rol, accion)
);

ALTER TABLE permisos_rol ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club members can read their permisos"
  ON permisos_rol FOR SELECT
  USING (club_id = (auth.jwt() -> 'app_metadata' ->> 'club_id')::uuid);

CREATE POLICY "Propietario can manage permisos"
  ON permisos_rol FOR ALL
  USING (
    club_id = (auth.jwt() -> 'app_metadata' ->> 'club_id')::uuid
    AND (auth.jwt() -> 'app_metadata' ->> 'rol') = 'propietario'
  );

-- Función para obtener permisos de un club (crea defaults si no existen)
CREATE OR REPLACE FUNCTION rpc_get_permisos_rol(p_club_id uuid)
RETURNS TABLE (accion text, rol text, permitido boolean)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  defaults jsonb := '[
    {"accion":"descuento_manual","roles":["admin","propietario"]},
    {"accion":"cancelacion_sin_aprobacion","roles":["cajero","admin","propietario"]},
    {"accion":"cancelacion_post_cobro","roles":["cajero","admin","propietario"]},
    {"accion":"aprobar_cancelacion","roles":["admin","propietario"]},
    {"accion":"movimiento_caja","roles":["cajero","admin","propietario"]},
    {"accion":"ajuste_stock","roles":["admin","propietario"]},
    {"accion":"ver_reportes","roles":["admin","propietario"]},
    {"accion":"abrir_cerrar_turno","roles":["cajero","admin","propietario"]}
  ]';
  d jsonb;
  r text;
BEGIN
  FOR d IN SELECT jsonb_array_elements(defaults) LOOP
    FOR r IN SELECT jsonb_array_elements_text(d->'roles') LOOP
      INSERT INTO permisos_rol (club_id, rol, accion, permitido)
      VALUES (p_club_id, r, d->>'accion', true)
      ON CONFLICT (club_id, rol, accion) DO NOTHING;
    END LOOP;
  END LOOP;

  RETURN QUERY
    SELECT pr.accion, pr.rol, pr.permitido
    FROM permisos_rol pr
    WHERE pr.club_id = p_club_id;
END;
$$;
```

**Step 2: Verify**

```sql
SELECT table_name FROM information_schema.tables WHERE table_name = 'permisos_rol';
SELECT proname FROM pg_proc WHERE proname = 'rpc_get_permisos_rol';
```

Expected: ambas queries retornan 1 fila.

**Step 3: Commit**

```bash
git add -A && git commit -m "feat(db): add permisos_rol table with defaults RPC"
```

---

## Task 4: Hook usePermiso + integración en Zustand

**Files:**
- Create: `apps/dashboard/src/hooks/usePermiso.ts`
- Modify: `apps/dashboard/src/store/useAppStore.ts`
- Modify: `apps/dashboard/src/components/providers/AuthProvider.tsx`

**Step 1: Actualizar useAppStore**

En `apps/dashboard/src/store/useAppStore.ts`, agregar `permisos` al estado:

```typescript
'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  email: string
  nombre: string
  rol: string
  empleadoId: string
}

interface AppState {
  user: User | null
  clubId: string | null
  sidebarOpen: boolean
  permisos: string[]  // lista de acciones permitidas para el usuario actual
  setUser: (user: User | null) => void
  setClubId: (id: string) => void
  setPermisos: (permisos: string[]) => void
  toggleSidebar: () => void
  logout: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      clubId: null,
      sidebarOpen: true,
      permisos: [],
      setUser: (user) => set({ user }),
      setClubId: (id) => set({ clubId: id }),
      setPermisos: (permisos) => set({ permisos }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      logout: () => set({ user: null, clubId: null, permisos: [] }),
    }),
    {
      name: 'setpoint-app-store',
      partialize: (state) => ({ user: state.user, clubId: state.clubId, permisos: state.permisos }),
    },
  ),
)
```

**Step 2: Cargar permisos en AuthProvider**

En `apps/dashboard/src/components/providers/AuthProvider.tsx`, leer el estado actual para ver la estructura exacta, luego agregar la llamada a `rpc_get_permisos_rol` después de setear el usuario. Buscar donde se llama `setUser` y agregar debajo:

```typescript
// Cargar permisos del rol del empleado
const { data: permisosData } = await supabase.rpc('rpc_get_permisos_rol', {
  p_club_id: clubId,
})
const rolActual = empleado.rol
const accionesPermitidas = (permisosData ?? [])
  .filter((p: { rol: string; accion: string; permitido: boolean }) =>
    p.rol === rolActual && p.permitido
  )
  .map((p: { accion: string }) => p.accion)
useAppStore.getState().setPermisos(accionesPermitidas)
```

**Step 3: Crear hook usePermiso**

Crear `apps/dashboard/src/hooks/usePermiso.ts`:

```typescript
import { useAppStore } from '@/store/useAppStore'

/**
 * Retorna true si el usuario actual tiene el permiso para la acción dada.
 * Los propietarios siempre tienen todos los permisos.
 */
export function usePermiso(accion: string): boolean {
  const user = useAppStore((s) => s.user)
  const permisos = useAppStore((s) => s.permisos)

  if (!user) return false
  if (user.rol === 'propietario') return true
  return permisos.includes(accion)
}
```

**Step 4: Reemplazar checks de rol en CancelacionDetalle**

En `apps/dashboard/src/components/modules/cancelaciones/CancelacionDetalle.tsx`, reemplazar:

```typescript
const isAdmin = user?.rol === 'admin' || user?.rol === 'propietario'
```

Por:

```typescript
import { usePermiso } from '@/hooks/usePermiso'
// ...
const puedeAprobar = usePermiso('aprobar_cancelacion')
```

Y reemplazar `isAdmin` por `puedeAprobar` en las condiciones de renderizado.

**Step 5: Verificar tipos**

```bash
cd apps/dashboard && npx tsc --noEmit 2>&1 | grep -E "usePermiso|useAppStore|AuthProvider" | head -10
```

Expected: sin errores nuevos.

**Step 6: Commit**

```bash
git add apps/dashboard/src/hooks/usePermiso.ts apps/dashboard/src/store/useAppStore.ts apps/dashboard/src/components/providers/AuthProvider.tsx apps/dashboard/src/components/modules/cancelaciones/CancelacionDetalle.tsx
git commit -m "feat: add usePermiso hook with granular role permissions from DB"
```

---

## Task 5: DB Migration — campos para arqueo y shift review

**Files:**
- Migration via Supabase MCP `apply_migration`

**Step 1: Apply migration**

Nombre: `add_arqueo_and_shift_review_fields`

```sql
-- Campo de shift review timestamp en turnos
ALTER TABLE turnos
  ADD COLUMN IF NOT EXISTS shift_review_at timestamptz;

-- Snapshot del arqueo en cajas (jsonb para flexibilidad)
ALTER TABLE cajas
  ADD COLUMN IF NOT EXISTS arqueo_snapshot jsonb;

-- RPC para obtener datos del shift review de un turno
CREATE OR REPLACE FUNCTION rpc_get_shift_review(
  p_caja_id uuid,
  p_empleado_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result jsonb;
  v_caja record;
BEGIN
  SELECT c.*, t.inicio, t.empleado_id
  INTO v_caja
  FROM cajas c
  JOIN turnos t ON t.id = c.turno_id
  WHERE c.id = p_caja_id;

  SELECT jsonb_build_object(
    'transacciones', (
      SELECT COUNT(*) FROM cuentas
      WHERE created_at >= v_caja.inicio
        AND club_id = v_caja.club_id
        AND estado = 'pagada'
    ),
    'ventas_total', (
      SELECT COALESCE(SUM(total), 0) FROM cuentas
      WHERE created_at >= v_caja.inicio
        AND club_id = v_caja.club_id
        AND estado = 'pagada'
    ),
    'cancelaciones_solicitadas', (
      SELECT COUNT(*) FROM cancelaciones
      WHERE created_at >= v_caja.inicio
        AND club_id = v_caja.club_id
        AND cancelado_por = p_empleado_id
    ),
    'cancelaciones_pendientes', (
      SELECT COUNT(*) FROM cancelaciones
      WHERE created_at >= v_caja.inicio
        AND club_id = v_caja.club_id
        AND estado = 'pendiente'
    ),
    'movimientos_caja', (
      SELECT jsonb_agg(jsonb_build_object(
        'categoria', mc.categoria,
        'concepto', mc.concepto,
        'monto', mc.monto,
        'tipo', mc.tipo
      ))
      FROM movimientos_caja mc
      WHERE mc.caja_id = p_caja_id
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- RPC para obtener arqueo agrupado por categoría
CREATE OR REPLACE FUNCTION rpc_get_arqueo_turno(p_caja_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'por_categoria', (
      SELECT jsonb_agg(jsonb_build_object(
        'categoria', categoria,
        'tipo', tipo,
        'total', SUM(monto)
      ))
      FROM movimientos_caja
      WHERE caja_id = p_caja_id
      GROUP BY categoria, tipo
    ),
    'total_ingresos_efectivo', (
      SELECT COALESCE(SUM(monto), 0)
      FROM movimientos_caja
      WHERE caja_id = p_caja_id
        AND tipo IN ('ingreso', 'fondo')
        AND categoria NOT IN ('propina')
    ),
    'total_egresos_efectivo', (
      SELECT COALESCE(SUM(monto), 0)
      FROM movimientos_caja
      WHERE caja_id = p_caja_id
        AND tipo IN ('egreso', 'retiro')
    ),
    'total_propinas', (
      SELECT COALESCE(SUM(monto), 0)
      FROM movimientos_caja
      WHERE caja_id = p_caja_id
        AND categoria = 'propina'
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;
```

**Step 2: Verify**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'turnos' AND column_name = 'shift_review_at';
SELECT proname FROM pg_proc WHERE proname IN ('rpc_get_shift_review', 'rpc_get_arqueo_turno');
```

Expected: 1 fila en columnas, 2 filas en funciones.

**Step 3: Commit**

```bash
git add -A && git commit -m "feat(db): add shift_review_at, arqueo_snapshot and review RPCs"
```

---

## Task 6: CloseShiftModal — Wizard de 3 pasos (Shift Review + Arqueo + Confirmar)

**Files:**
- Modify: `apps/dashboard/src/components/modules/caja/CloseShiftModal.tsx`
- Modify: `apps/dashboard/src/lib/supabase/queries/caja.ts`

**Step 1: Agregar funciones a caja.ts**

Al final de `apps/dashboard/src/lib/supabase/queries/caja.ts`, agregar:

```typescript
export interface ShiftReviewData {
  transacciones: number
  ventas_total: number
  cancelaciones_solicitadas: number
  cancelaciones_pendientes: number
  movimientos_caja: { categoria: string | null; concepto: string; monto: number; tipo: string }[] | null
}

export interface ArqueoData {
  por_categoria: { categoria: string | null; tipo: string; total: number }[] | null
  total_ingresos_efectivo: number
  total_egresos_efectivo: number
  total_propinas: number
}

export async function getShiftReview(
  supabase: SupabaseClient,
  cajaId: string,
  empleadoId: string,
): Promise<ShiftReviewData> {
  const { data, error } = await supabase.rpc('rpc_get_shift_review', {
    p_caja_id: cajaId,
    p_empleado_id: empleadoId,
  })
  if (error) throw error
  return data as ShiftReviewData
}

export async function getArqueoTurno(
  supabase: SupabaseClient,
  cajaId: string,
): Promise<ArqueoData> {
  const { data, error } = await supabase.rpc('rpc_get_arqueo_turno', {
    p_caja_id: cajaId,
  })
  if (error) throw error
  return data as ArqueoData
}
```

**Step 2: Reemplazar CloseShiftModal completo**

Reemplazar `apps/dashboard/src/components/modules/caja/CloseShiftModal.tsx`:

```typescript
'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { closeCaja, getShiftReview, getArqueoTurno } from '@/lib/supabase/queries/caja'
import type { ShiftReviewData, ArqueoData } from '@/lib/supabase/queries/caja'
import { useAppStore } from '@/store/useAppStore'
import { toast } from 'sonner'

interface Props {
  cajaId: string
  turnoId: string
  efectivoEsperado: number
  onClose: () => void
  onSuccess: () => void
}

function fmtMoney(n: number) {
  return `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function CloseShiftModal({ cajaId, turnoId, efectivoEsperado, onClose, onSuccess }: Props) {
  const user = useAppStore((s) => s.user)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [contado, setContado] = useState('')
  const [saving, setSaving] = useState(false)
  const [reviewData, setReviewData] = useState<ShiftReviewData | null>(null)
  const [arqueoData, setArqueoData] = useState<ArqueoData | null>(null)
  const [loadingReview, setLoadingReview] = useState(true)

  const contadoNum = parseFloat(contado) || 0
  const diferencia = contadoNum - efectivoEsperado
  const difOk = Math.abs(diferencia) <= 50

  useEffect(() => {
    if (!user?.empleadoId) return
    const supabase = createClient()
    Promise.all([
      getShiftReview(supabase, cajaId, user.empleadoId),
      getArqueoTurno(supabase, cajaId),
    ]).then(([r, a]) => {
      setReviewData(r)
      setArqueoData(a)
    }).catch(console.error).finally(() => setLoadingReview(false))
  }, [cajaId, user?.empleadoId])

  async function handleConfirmar() {
    setSaving(true)
    try {
      await closeCaja(createClient(), cajaId, turnoId, contadoNum, efectivoEsperado)
      toast.success('Turno cerrado correctamente')
      onSuccess()
    } catch {
      toast.error('Error al cerrar el turno')
    } finally {
      setSaving(false)
    }
  }

  const CATEGORIA_LABEL: Record<string, string> = {
    fondo_inicial: 'Fondo inicial',
    venta: 'Ventas POS',
    cancha: 'Canchas',
    reembolso: 'Reembolsos',
    retiro: 'Retiros',
    petty_cash: 'Gastos menores',
    propina: 'Propinas',
    ajuste: 'Ajustes',
    otro: 'Otros',
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'var(--color-bg2)', border: '1px solid var(--color-border)', borderRadius: '16px', width: '460px', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'var(--color-bg2)', zIndex: 1 }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Cerrar Turno</div>
            <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '2px' }}>
              Paso {step} de 3 — {step === 1 ? 'Tu resumen' : step === 2 ? 'Arqueo' : 'Confirmar'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', padding: '4px' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '24px' }}>
          {/* PASO 1: SHIFT REVIEW */}
          {step === 1 && (
            <>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '16px' }}>
                Tu actividad del turno
              </div>

              {loadingReview ? (
                <div style={{ textAlign: 'center', padding: '32px', color: 'var(--color-muted)', fontSize: '13px' }}>Cargando resumen...</div>
              ) : reviewData ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                  <ReviewRow label="Transacciones realizadas" value={String(reviewData.transacciones)} />
                  <ReviewRow label="Ventas totales" value={fmtMoney(reviewData.ventas_total)} mono />
                  <ReviewRow label="Cancelaciones solicitadas" value={String(reviewData.cancelaciones_solicitadas)} />
                  {reviewData.cancelaciones_pendientes > 0 && (
                    <div style={{ padding: '10px 12px', background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)', borderRadius: '8px', fontSize: '12px', color: '#F97316' }}>
                      ⚠ {reviewData.cancelaciones_pendientes} cancelación{reviewData.cancelaciones_pendientes > 1 ? 'es' : ''} pendiente{reviewData.cancelaciones_pendientes > 1 ? 's' : ''} de aprobación
                    </div>
                  )}
                  {reviewData.movimientos_caja && reviewData.movimientos_caja.length > 0 && (
                    <div style={{ marginTop: '8px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                        Movimientos de caja
                      </div>
                      {reviewData.movimientos_caja.map((m, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--color-muted)', padding: '3px 0' }}>
                          <span>{m.categoria ? (CATEGORIA_LABEL[m.categoria] ?? m.categoria) : m.concepto}</span>
                          <span style={{ fontFamily: 'var(--font-mono)', color: m.tipo === 'egreso' || m.tipo === 'retiro' ? '#EF4444' : 'var(--color-lime)' }}>
                            {m.tipo === 'egreso' || m.tipo === 'retiro' ? '-' : '+'}{fmtMoney(m.monto)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              <button
                onClick={() => setStep(2)}
                style={{ width: '100%', padding: '13px', background: 'var(--color-lime)', border: 'none', borderRadius: '10px', color: 'var(--color-bg)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.3px' }}
              >
                Confirmar y continuar →
              </button>
            </>
          )}

          {/* PASO 2: ARQUEO */}
          {step === 2 && (
            <>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '16px' }}>
                Arqueo del turno
              </div>

              {arqueoData && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '16px' }}>
                  {/* Por categoría */}
                  {(arqueoData.por_categoria ?? []).map((cat, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--color-muted)', padding: '4px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
                      <span>{cat.categoria ? (CATEGORIA_LABEL[cat.categoria] ?? cat.categoria) : 'Sin categoría'}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: cat.tipo === 'egreso' || cat.tipo === 'retiro' ? '#EF4444' : 'var(--color-lime)' }}>
                        {cat.tipo === 'egreso' || cat.tipo === 'retiro' ? '-' : '+'}{fmtMoney(Number(cat.total))}
                      </span>
                    </div>
                  ))}

                  {/* Totales */}
                  <div style={{ marginTop: '12px', padding: '12px', background: 'var(--color-bg)', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--color-muted)' }}>
                      <span>Ingresos efectivo</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-lime)' }}>+{fmtMoney(arqueoData.total_ingresos_efectivo)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--color-muted)' }}>
                      <span>Egresos efectivo</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: '#EF4444' }}>-{fmtMoney(arqueoData.total_egresos_efectivo)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 700, color: 'var(--color-text)', paddingTop: '6px', borderTop: '1px solid var(--color-border-subtle)' }}>
                      <span>Efectivo esperado en caja</span>
                      <span style={{ fontFamily: 'var(--font-mono)' }}>{fmtMoney(efectivoEsperado)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Conteo manual */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                  Efectivo contado en caja
                </label>
                <input
                  type="number"
                  value={contado}
                  onChange={(e) => setContado(e.target.value)}
                  placeholder={`Ej: ${fmtMoney(efectivoEsperado)}`}
                  autoFocus
                  style={{ width: '100%', padding: '14px 16px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '10px', color: 'var(--color-text)', fontSize: '20px', fontFamily: 'var(--font-mono)', fontWeight: 700, outline: 'none', boxSizing: 'border-box' }}
                />
                {contado && (
                  <div style={{ marginTop: '8px', padding: '10px 14px', background: difOk ? 'rgba(108,242,13,0.06)' : 'rgba(239,68,68,0.08)', border: `1px solid ${difOk ? 'rgba(108,242,13,0.2)' : 'rgba(239,68,68,0.25)'}`, borderRadius: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 700 }}>
                    <span style={{ color: 'var(--color-muted)' }}>Diferencia</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: difOk ? 'var(--color-lime)' : '#EF4444' }}>
                      {diferencia >= 0 ? '+' : ''}{fmtMoney(diferencia)}
                    </span>
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button onClick={() => setStep(1)} style={cancelBtnStyle}>← Volver</button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!contado || contadoNum < 0}
                  style={{ padding: '13px', background: !contado ? 'rgba(108,242,13,0.3)' : 'var(--color-lime)', border: 'none', borderRadius: '10px', color: 'var(--color-bg)', fontSize: '13px', fontWeight: 800, cursor: !contado ? 'not-allowed' : 'pointer', fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.3px' }}
                >
                  Continuar →
                </button>
              </div>
            </>
          )}

          {/* PASO 3: CONFIRMAR */}
          {step === 3 && (
            <>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '16px' }}>
                Resumen final
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                <SummaryRow label="Efectivo esperado" value={fmtMoney(efectivoEsperado)} />
                <SummaryRow label="Efectivo contado" value={fmtMoney(contadoNum)} highlight />
                <div style={{ padding: '14px 16px', background: difOk ? 'rgba(108,242,13,0.06)' : diferencia > 0 ? 'rgba(234,179,8,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${difOk ? 'rgba(108,242,13,0.2)' : diferencia > 0 ? 'rgba(234,179,8,0.25)' : 'rgba(239,68,68,0.25)'}`, borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Diferencia</span>
                    {!difOk && <div style={{ fontSize: '10px', color: diferencia > 0 ? '#EAB308' : '#EF4444', marginTop: '2px' }}>{diferencia > 0 ? '⚠ Sobrante — verificar' : '⚠ Faltante — verificar'}</div>}
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 700, color: difOk ? 'var(--color-lime)' : diferencia > 0 ? '#EAB308' : '#EF4444' }}>
                    {diferencia >= 0 ? '+' : ''}{fmtMoney(diferencia)}
                  </span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button onClick={() => setStep(2)} style={cancelBtnStyle}>← Volver</button>
                <button
                  onClick={handleConfirmar}
                  disabled={saving}
                  style={{ padding: '13px', background: saving ? 'rgba(239,68,68,0.3)' : '#EF4444', border: 'none', borderRadius: '10px', color: '#fff', fontSize: '13px', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.3px' }}
                >
                  {saving ? 'Cerrando...' : 'Confirmar Cierre'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ReviewRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--color-bg)', borderRadius: '8px' }}>
      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-muted)' }}>{label}</span>
      <span style={{ fontSize: '13px', fontWeight: 700, fontFamily: mono ? 'var(--font-mono)' : 'inherit', color: 'var(--color-text)' }}>{value}</span>
    </div>
  )
}

function SummaryRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--color-bg)', borderRadius: '8px' }}>
      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '15px', fontWeight: 700, color: highlight ? 'var(--color-text)' : 'var(--color-muted)' }}>{value}</span>
    </div>
  )
}

const cancelBtnStyle: React.CSSProperties = {
  padding: '13px', background: 'var(--color-bg)',
  border: '1px solid var(--color-border)', borderRadius: '10px',
  color: 'var(--color-muted)', fontSize: '13px', fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit',
}
```

**Step 3: Verificar tipos**

```bash
cd apps/dashboard && npx tsc --noEmit 2>&1 | grep -E "CloseShift|caja\.ts" | head -10
```

Expected: sin errores nuevos.

**Step 4: Commit**

```bash
git add apps/dashboard/src/components/modules/caja/CloseShiftModal.tsx apps/dashboard/src/lib/supabase/queries/caja.ts
git commit -m "feat(caja): add 3-step shift review + reconciliation dashboard to CloseShiftModal"
```

---

## Task 7: Alertas de stock bajo en ProductGrid y TopBar

**Files:**
- Modify: `apps/dashboard/src/components/modules/pos/ProductGrid.tsx`
- Modify: `apps/dashboard/src/components/layout/TopBar.tsx`
- Modify: `apps/dashboard/src/components/modules/inventario/InventarioPage.tsx`
- Modify: `apps/dashboard/src/lib/supabase/queries/inventario.ts`

**Step 1: Agregar getProductosBajoStock a inventario.ts**

Verificar primero que `stock_minimo` ya existe en el query (línea ~42, confirmado en exploración). Agregar al final de `apps/dashboard/src/lib/supabase/queries/inventario.ts`:

```typescript
export interface ProductoBajoStock {
  id: string
  nombre: string
  stock_actual: number
  stock_minimo: number
}

export async function getProductosBajoStock(
  supabase: SupabaseClient,
  clubId: string,
): Promise<ProductoBajoStock[]> {
  const { data, error } = await supabase
    .from('productos')
    .select('id, nombre, stock_actual, stock_minimo')
    .eq('club_id', clubId)
    .eq('activo', true)
    .eq('requiere_stock', true)
    .lte('stock_actual', supabase.rpc ? undefined : 0) // fallback
    .order('stock_actual', { ascending: true })
    .limit(20)

  // Filtrar en memoria: stock_actual <= stock_minimo
  const rows = (data ?? []) as ProductoBajoStock[]
  return rows.filter((p) => p.stock_actual <= p.stock_minimo)
}
```

Nota: Supabase no soporta filtros column-vs-column directamente. Usar filtro en memoria es correcto aquí.

Versión correcta sin `.rpc` condicional:

```typescript
export async function getProductosBajoStock(
  supabase: SupabaseClient,
  clubId: string,
): Promise<ProductoBajoStock[]> {
  const { data, error } = await supabase
    .from('productos')
    .select('id, nombre, stock_actual, stock_minimo')
    .eq('club_id', clubId)
    .eq('activo', true)
    .eq('requiere_stock', true)
    .order('stock_actual', { ascending: true })

  if (error) throw error
  const rows = (data ?? []) as ProductoBajoStock[]
  return rows.filter((p) => p.stock_actual <= p.stock_minimo)
}
```

**Step 2: Actualizar ProductGrid para mostrar badge de stock**

En `apps/dashboard/src/components/modules/pos/ProductGrid.tsx`, actualizar la interfaz `ProductGridProps` para incluir stock en el tipo `Product` de POSPage (verificar tipo en POSPage.tsx primero) y agregar badge. Modificar `ProductCard`:

```typescript
function ProductCard({ product, onAdd }: { product: Product; onAdd: (p: Product) => void }) {
  const gradient = IMG_GRADIENTS[product.imgClass] ?? IMG_GRADIENTS['img-coffee']
  const sinStock = product.stock !== undefined && product.stock !== null && product.stock <= 0
  const stockBajo = product.stock !== undefined && product.stock !== null && product.stockMinimo !== undefined && product.stock > 0 && product.stock <= product.stockMinimo

  return (
    <div
      onClick={() => { if (!sinStock) onAdd(product) }}
      style={{
        background: 'var(--color-bg)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: '12px',
        cursor: sinStock ? 'not-allowed' : 'pointer',
        overflow: 'hidden',
        transition: 'all 0.15s',
        opacity: sinStock ? 0.6 : 1,
        position: 'relative',
      }}
      onMouseEnter={(e) => { if (!sinStock) { e.currentTarget.style.borderColor = 'rgba(108,242,13,0.20)'; e.currentTarget.style.transform = 'translateY(-2px)' } }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-subtle)'; e.currentTarget.style.transform = 'translateY(0)' }}
      onMouseDown={(e) => { if (!sinStock) e.currentTarget.style.transform = 'scale(0.98)' }}
      onMouseUp={(e) => { if (!sinStock) e.currentTarget.style.transform = 'translateY(-2px)' }}
    >
      {/* Badge de stock */}
      {sinStock && (
        <div style={{ position: 'absolute', top: '8px', right: '8px', padding: '2px 7px', background: 'rgba(239,68,68,0.9)', borderRadius: '5px', fontSize: '9px', fontWeight: 700, color: '#fff', letterSpacing: '0.3px', zIndex: 1 }}>
          AGOTADO
        </div>
      )}
      {stockBajo && !sinStock && (
        <div style={{ position: 'absolute', top: '8px', right: '8px', padding: '2px 7px', background: 'rgba(234,179,8,0.9)', borderRadius: '5px', fontSize: '9px', fontWeight: 700, color: '#000', letterSpacing: '0.3px', zIndex: 1 }}>
          STOCK BAJO
        </div>
      )}
      <div style={{ width: '100%', height: '140px', background: gradient }} />
      <div style={{ padding: '14px' }}>
        <div style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--color-muted-dim)', marginBottom: '4px' }}>
          {product.category}{product.sub ? ` / ${product.sub}` : ''}
        </div>
        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text)', marginBottom: '8px', lineHeight: 1.3 }}>
          {product.name}
        </div>
        <div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '15px', fontWeight: 700, color: 'var(--color-lime)' }}>
            $ {product.price.toFixed(2)}
          </span>
          <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--color-muted)', marginLeft: '4px' }}>MXN</span>
        </div>
      </div>
    </div>
  )
}
```

Nota: Antes de aplicar, leer el tipo `Product` en `POSPage.tsx` para confirmar qué campos tiene (`stock`, `stockMinimo`). Si no existen, agregarlos al tipo y al query de productos.

**Step 3: Agregar indicador de stock bajo en TopBar**

En `apps/dashboard/src/components/layout/TopBar.tsx`, agregar estado de alertas con Realtime. El TopBar necesita acceso a clubId de Zustand y una suscripción a `productos`:

```typescript
// Al inicio del componente TopBar, agregar:
import { useAppStore } from '@/store/useAppStore'
import { createClient } from '@/lib/supabase/client'
import { getProductosBajoStock } from '@/lib/supabase/queries/inventario'
import { useMemo, useCallback } from 'react'

// Dentro de TopBar():
const clubId = useAppStore((s) => s.clubId)
const user = useAppStore((s) => s.user)
const [stockAlertas, setStockAlertas] = useState(0)
const [showStockPanel, setShowStockPanel] = useState(false)
const [productosBajo, setProductosBajo] = useState<{ nombre: string; stock_actual: number; stock_minimo: number }[]>([])

const supabase = useMemo(() => createClient(), [])

const loadStock = useCallback(async () => {
  if (!clubId) return
  try {
    const bajos = await getProductosBajoStock(supabase, clubId)
    setStockAlertas(bajos.length)
    setProductosBajo(bajos)
  } catch { /* silenciar */ }
}, [supabase, clubId])

useEffect(() => {
  loadStock()
  if (!clubId) return
  const channel = supabase
    .channel('topbar-stock-rt')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'productos' }, loadStock)
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}, [supabase, clubId, loadStock])
```

Agregar el indicador visual en el JSX del TopBar, justo antes del spacer `<div style={{ flex: 1 }} />`:

```tsx
{stockAlertas > 0 && (user?.rol === 'admin' || user?.rol === 'propietario' || user?.rol === 'cajero') && (
  <button
    onClick={() => setShowStockPanel(!showStockPanel)}
    style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.25)', borderRadius: '8px', color: '#EAB308', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
  >
    ⚠ {stockAlertas} bajo stock
  </button>
)}

{showStockPanel && (
  <div style={{ position: 'fixed', top: '56px', right: '16px', zIndex: 500, background: 'var(--color-bg2)', border: '1px solid var(--color-border)', borderRadius: '12px', width: '260px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', padding: '16px' }}>
    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Productos bajo stock</div>
    {productosBajo.map((p, i) => (
      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
        <span style={{ color: 'var(--color-text)' }}>{p.nombre}</span>
        <span style={{ fontFamily: 'var(--font-mono)', color: p.stock_actual === 0 ? '#EF4444' : '#EAB308', fontWeight: 700 }}>
          {p.stock_actual}/{p.stock_minimo}
        </span>
      </div>
    ))}
    <button onClick={() => setShowStockPanel(false)} style={{ marginTop: '10px', width: '100%', padding: '7px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '8px', color: 'var(--color-muted)', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>
      Cerrar
    </button>
  </div>
)}
```

**Step 4: Verificar tipos**

```bash
cd apps/dashboard && npx tsc --noEmit 2>&1 | grep -E "TopBar|ProductGrid|inventario" | head -10
```

Expected: sin errores nuevos.

**Step 5: Commit**

```bash
git add apps/dashboard/src/components/layout/TopBar.tsx apps/dashboard/src/components/modules/pos/ProductGrid.tsx apps/dashboard/src/lib/supabase/queries/inventario.ts
git commit -m "feat(stock): add low stock alerts in TopBar and ProductGrid with Realtime"
```

---

## Summary

| Task | Feature | Tipo |
|------|---------|------|
| 1 | DB: movimiento_categoria enum | Migración SQL |
| 2 | CashMovementModal con categorías | Frontend |
| 3 | DB: permisos_rol table + RPC | Migración SQL |
| 4 | usePermiso hook + Zustand + AuthProvider | Frontend |
| 5 | DB: shift_review_at + arqueo RPCs | Migración SQL |
| 6 | CloseShiftModal: wizard 3 pasos | Frontend |
| 7 | Alertas stock bajo: TopBar + ProductGrid | Frontend |

**3 migraciones SQL. 1 archivo nuevo. ~8 archivos editados.**
