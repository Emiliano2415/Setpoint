# Cancelaciones Module Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a dedicated `/cancelaciones` page that manages both POS item cancellations (pre/post-cobro with admin approval flow) and court reservation cancellations, with Supabase Realtime updates.

**Architecture:** Panel-with-tabs layout (`Ítems POS` | `Reservas`), left list + right detail panel. Four atomic PostgreSQL RPCs handle all DB mutations. A single Realtime channel keeps the page live. Admin approval for post-cobro reimbursements is enforced at the RPC level.

**Tech Stack:** Next.js 15 App Router, Supabase (RPC + Realtime), Zustand (`useAppStore`), Lucide React, Sonner toasts, inline styles matching existing design system.

---

## Task 1: DB Migration — extend `cancelaciones` table

**Files:**
- Apply via: Supabase MCP `apply_migration`

**Step 1: Apply migration**

Run via `mcp__plugin_supabase_supabase__apply_migration` with `project_id = dusbljghqhdpgxvhgxuz`:

```sql
-- New estado enum
CREATE TYPE cancelacion_estado AS ENUM (
  'ejecutada',
  'pendiente',
  'aprobada',
  'reembolsada',
  'rechazada'
);

-- Extend cancelaciones table
ALTER TABLE cancelaciones
  ADD COLUMN IF NOT EXISTS estado           cancelacion_estado NOT NULL DEFAULT 'ejecutada',
  ADD COLUMN IF NOT EXISTS reserva_id       uuid REFERENCES reservas(id),
  ADD COLUMN IF NOT EXISTS metodo_pago      text,
  ADD COLUMN IF NOT EXISTS rechazado_motivo text;

-- RLS policy for cancelaciones (club isolation)
ALTER TABLE cancelaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY cancelaciones_club_isolation ON cancelaciones
  FOR ALL
  USING (club_id = (((auth.jwt() -> 'app_metadata') ->> 'club_id'))::uuid);
```

**Step 2: Verify**

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'cancelaciones' ORDER BY ordinal_position;
```

Expected: columns `estado`, `reserva_id`, `metodo_pago`, `rechazado_motivo` present.

**Step 3: Commit**

```bash
git add -A
git commit -m "feat(db): extend cancelaciones table with estado enum and new columns"
```

---

## Task 2: RPC — `rpc_cancelar_item_pre_cobro`

**Files:**
- Apply via: Supabase MCP `apply_migration`

**Step 1: Apply migration**

```sql
CREATE OR REPLACE FUNCTION rpc_cancelar_item_pre_cobro(
  p_club_id        uuid,
  p_cuenta_item_id uuid,
  p_motivo         text,
  p_cancelado_por  uuid,
  p_fue_preparado  boolean DEFAULT false,
  p_genera_merma   boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cancelacion_id uuid;
  v_item           record;
BEGIN
  -- Fetch item
  SELECT ci.*, c.club_id AS c_club_id
  INTO v_item
  FROM cuenta_items ci
  JOIN cuentas c ON c.id = ci.cuenta_id
  WHERE ci.id = p_cuenta_item_id
    AND c.club_id = p_club_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item no encontrado';
  END IF;

  -- Mark item as cancelled
  UPDATE cuenta_items SET estado = 'cancelado' WHERE id = p_cuenta_item_id;

  -- Register cancellation
  INSERT INTO cancelaciones (
    club_id, cuenta_id, cuenta_item_id, cantidad, monto,
    motivo, tipo, estado, fue_preparado, genera_merma, cancelado_por
  )
  VALUES (
    p_club_id, v_item.cuenta_id, p_cuenta_item_id, v_item.cantidad, v_item.subtotal,
    p_motivo, 'pre_cobro', 'ejecutada', p_fue_preparado, p_genera_merma, p_cancelado_por
  )
  RETURNING id INTO v_cancelacion_id;

  -- Register stock waste if prepared
  IF p_fue_preparado AND p_genera_merma THEN
    INSERT INTO movimientos_stock (club_id, producto_id, tipo, cantidad, motivo, empleado_id)
    VALUES (p_club_id, v_item.producto_id, 'merma', v_item.cantidad, p_motivo, p_cancelado_por);
  END IF;

  RETURN v_cancelacion_id;
END;
$$;
```

**Step 2: Verify**

```sql
SELECT proname FROM pg_proc WHERE proname = 'rpc_cancelar_item_pre_cobro';
```

Expected: 1 row.

---

## Task 3: RPC — `rpc_solicitar_cancelacion_post_cobro`

**Files:**
- Apply via: Supabase MCP `apply_migration`

**Step 1: Apply migration**

```sql
CREATE OR REPLACE FUNCTION rpc_solicitar_cancelacion_post_cobro(
  p_club_id        uuid,
  p_cuenta_item_id uuid,
  p_motivo         text,
  p_cancelado_por  uuid,
  p_metodo_pago    text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cancelacion_id uuid;
  v_item           record;
BEGIN
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
    p_motivo, 'post_cobro', 'pendiente', p_metodo_pago, p_cancelado_por
  )
  RETURNING id INTO v_cancelacion_id;

  RETURN v_cancelacion_id;
END;
$$;
```

---

## Task 4: RPC — `rpc_aprobar_cancelacion`

**Files:**
- Apply via: Supabase MCP `apply_migration`

**Step 1: Apply migration**

```sql
CREATE OR REPLACE FUNCTION rpc_aprobar_cancelacion(
  p_cancelacion_id uuid,
  p_autorizado_por uuid,
  p_caja_id        uuid,
  p_rechazar       boolean DEFAULT false,
  p_motivo_rechazo text    DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_can record;
BEGIN
  SELECT * INTO v_can FROM cancelaciones WHERE id = p_cancelacion_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cancelación no encontrada';
  END IF;

  IF v_can.estado != 'pendiente' THEN
    RAISE EXCEPTION 'Solo se pueden aprobar cancelaciones en estado pendiente';
  END IF;

  IF p_rechazar THEN
    UPDATE cancelaciones
    SET estado = 'rechazada', autorizado_por = p_autorizado_por, rechazado_motivo = p_motivo_rechazo
    WHERE id = p_cancelacion_id;
    RETURN;
  END IF;

  -- Approve
  UPDATE cancelaciones
  SET estado = 'aprobada', autorizado_por = p_autorizado_por
  WHERE id = p_cancelacion_id;

  -- If efectivo, register cash egress
  IF v_can.metodo_pago = 'efectivo' AND p_caja_id IS NOT NULL THEN
    INSERT INTO movimientos_caja (caja_id, tipo, concepto, monto)
    VALUES (p_caja_id, 'egreso'::movimiento_tipo, 'Reembolso: ' || v_can.motivo, v_can.monto);
  END IF;

  -- Mark as reimbursed
  UPDATE cancelaciones SET estado = 'reembolsada' WHERE id = p_cancelacion_id;
END;
$$;
```

---

## Task 5: RPC — `rpc_cancelar_reserva`

**Files:**
- Apply via: Supabase MCP `apply_migration`

**Step 1: Apply migration**

```sql
CREATE OR REPLACE FUNCTION rpc_cancelar_reserva(
  p_club_id       uuid,
  p_reserva_id    uuid,
  p_motivo        text,
  p_cancelado_por uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cancelacion_id uuid;
  v_reserva        record;
BEGIN
  SELECT * INTO v_reserva
  FROM reservas
  WHERE id = p_reserva_id AND club_id = p_club_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reserva no encontrada';
  END IF;

  IF v_reserva.estado NOT IN ('confirmada') THEN
    RAISE EXCEPTION 'Solo se pueden cancelar reservas en estado confirmada';
  END IF;

  -- Cancel reservation
  UPDATE reservas SET estado = 'cancelada' WHERE id = p_reserva_id;

  -- Register cancellation record
  INSERT INTO cancelaciones (
    club_id, reserva_id, cantidad, monto,
    motivo, tipo, estado, cancelado_por
  )
  VALUES (
    p_club_id, p_reserva_id, 1, 0,
    p_motivo, 'pre_cobro', 'ejecutada', p_cancelado_por
  )
  RETURNING id INTO v_cancelacion_id;

  RETURN v_cancelacion_id;
END;
$$;
```

**Step 2: Commit all RPCs**

```bash
git commit -m "feat(db): add four atomic RPCs for cancelaciones module"
```

---

## Task 6: Query layer — `queries/cancelaciones.ts`

**Files:**
- Create: `apps/dashboard/src/lib/supabase/queries/cancelaciones.ts`

**Step 1: Create the file**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'

export type CancelacionEstado = 'ejecutada' | 'pendiente' | 'aprobada' | 'reembolsada' | 'rechazada'
export type CancelacionTipo = 'pre_cobro' | 'post_cobro'

export interface CancelacionRow {
  id: string
  club_id: string
  cuenta_id: string | null
  cuenta_item_id: string | null
  reserva_id: string | null
  cantidad: number
  monto: number
  motivo: string
  tipo: CancelacionTipo
  estado: CancelacionEstado
  fue_preparado: boolean
  genera_merma: boolean
  metodo_pago: string | null
  rechazado_motivo: string | null
  autorizado_por: string | null
  cancelado_por: string | null
  created_at: string
  // Joins
  cancelado_por_empleado?: { nombre: string } | null
  autorizado_por_empleado?: { nombre: string } | null
  cuentas?: { numero_ticket: string } | null
  reservas?: {
    fecha: string
    hora_inicio: string
    hora_fin: string
    nombre_cliente: string | null
    pistas: { nombre: string } | null
    clientes: { nombre: string } | null
  } | null
  cuenta_items?: { notas: string | null } | null
}

export interface CancelacionStats {
  total_hoy: number
  pendientes_aprobacion: number
}

export async function getCancelaciones(
  supabase: SupabaseClient,
  clubId: string,
  tab: 'items' | 'reservas',
  fecha: string,
): Promise<CancelacionRow[]> {
  let query = supabase
    .from('cancelaciones')
    .select(`
      *,
      cuentas(numero_ticket),
      reservas(fecha, hora_inicio, hora_fin, nombre_cliente, pistas(nombre), clientes(nombre)),
      cuenta_items(notas),
      cancelado_por_empleado:empleados!cancelaciones_cancelado_por_fkey(nombre),
      autorizado_por_empleado:empleados!cancelaciones_autorizado_por_fkey(nombre)
    `)
    .eq('club_id', clubId)
    .order('created_at', { ascending: false })

  if (tab === 'items') {
    query = query.not('cuenta_item_id', 'is', null)
    query = query.gte('created_at', `${fecha}T00:00:00.000Z`)
    query = query.lte('created_at', `${fecha}T23:59:59.999Z`)
  } else {
    query = query.not('reserva_id', 'is', null)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as CancelacionRow[]
}

export async function getCancelacionStats(
  supabase: SupabaseClient,
  clubId: string,
): Promise<CancelacionStats> {
  const today = new Date().toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('cancelaciones')
    .select('estado, created_at')
    .eq('club_id', clubId)

  if (error) throw error

  const rows = data ?? []
  const total_hoy = rows.filter(r => r.created_at.startsWith(today)).length
  const pendientes_aprobacion = rows.filter(r => r.estado === 'pendiente').length

  return { total_hoy, pendientes_aprobacion }
}

export async function cancelarItemPreCobro(
  supabase: SupabaseClient,
  clubId: string,
  cuentaItemId: string,
  motivo: string,
  canceladoPor: string,
  fuePrepado: boolean,
  generaMerma: boolean,
): Promise<string> {
  const { data, error } = await supabase.rpc('rpc_cancelar_item_pre_cobro', {
    p_club_id: clubId,
    p_cuenta_item_id: cuentaItemId,
    p_motivo: motivo,
    p_cancelado_por: canceladoPor,
    p_fue_preparado: fuePrepado,
    p_genera_merma: generaMerma,
  })
  if (error) throw error
  return data as string
}

export async function solicitarCancelacionPostCobro(
  supabase: SupabaseClient,
  clubId: string,
  cuentaItemId: string,
  motivo: string,
  canceladoPor: string,
  metodoPago: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('rpc_solicitar_cancelacion_post_cobro', {
    p_club_id: clubId,
    p_cuenta_item_id: cuentaItemId,
    p_motivo: motivo,
    p_cancelado_por: canceladoPor,
    p_metodo_pago: metodoPago,
  })
  if (error) throw error
  return data as string
}

export async function aprobarCancelacion(
  supabase: SupabaseClient,
  cancelacionId: string,
  autorizadoPor: string,
  cajaId: string | null,
  rechazar: boolean,
  motivoRechazo?: string,
): Promise<void> {
  const { error } = await supabase.rpc('rpc_aprobar_cancelacion', {
    p_cancelacion_id: cancelacionId,
    p_autorizado_por: autorizadoPor,
    p_caja_id: cajaId,
    p_rechazar: rechazar,
    p_motivo_rechazo: motivoRechazo ?? null,
  })
  if (error) throw error
}

export async function cancelarReserva(
  supabase: SupabaseClient,
  clubId: string,
  reservaId: string,
  motivo: string,
  canceladoPor: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('rpc_cancelar_reserva', {
    p_club_id: clubId,
    p_reserva_id: reservaId,
    p_motivo: motivo,
    p_cancelado_por: canceladoPor,
  })
  if (error) throw error
  return data as string
}
```

**Step 2: Commit**

```bash
git add apps/dashboard/src/lib/supabase/queries/cancelaciones.ts
git commit -m "feat(cancelaciones): add query layer and type definitions"
```

---

## Task 7: Next.js route — `/cancelaciones/page.tsx`

**Files:**
- Create: `apps/dashboard/src/app/(dashboard)/cancelaciones/page.tsx`

**Step 1: Create the file**

```typescript
import { CancelacionesPage } from '@/components/modules/cancelaciones/CancelacionesPage'

export default function Page() {
  return <CancelacionesPage />
}
```

---

## Task 8: Sidebar entry

**Files:**
- Modify: `apps/dashboard/src/components/layout/Sidebar.tsx`

**Step 1: Add import**

Add `XCircle` to the lucide-react import at the top of `Sidebar.tsx`:

```typescript
import {
  Monitor, Grid2x2, Clock, Package, Users, Wallet,
  UserCog, BarChart3, Settings, LogOut, Tag, History,
  XCircle,  // ← add this
} from 'lucide-react'
```

**Step 2: Add to ADMIN_ITEMS array**

Insert after `{ href: '/historial', ... }` and before the closing `] as const`:

```typescript
{ href: '/cancelaciones', label: 'Cancelaciones', icon: XCircle },
```

**Step 3: Commit**

```bash
git add apps/dashboard/src/app/(dashboard)/cancelaciones/page.tsx \
        apps/dashboard/src/components/layout/Sidebar.tsx
git commit -m "feat(cancelaciones): add route and sidebar entry"
```

---

## Task 9: `CancelacionesPage` — main component

**Files:**
- Create: `apps/dashboard/src/components/modules/cancelaciones/CancelacionesPage.tsx`

**Step 1: Create the file**

```typescript
'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAppStore } from '@/store/useAppStore'
import { getCancelaciones, getCancelacionStats } from '@/lib/supabase/queries/cancelaciones'
import type { CancelacionRow, CancelacionStats } from '@/lib/supabase/queries/cancelaciones'
import { CancelacionesList } from './CancelacionesList'
import { CancelacionDetalle } from './CancelacionDetalle'
import { toast } from 'sonner'

type Tab = 'items' | 'reservas'

function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function CancelacionesPage() {
  const clubId = useAppStore((s) => s.clubId)
  const supabase = useMemo(() => createClient(), [])

  const [tab, setTab] = useState<Tab>('items')
  const [cancelaciones, setCancelaciones] = useState<CancelacionRow[]>([])
  const [stats, setStats] = useState<CancelacionStats>({ total_hoy: 0, pendientes_aprobacion: 0 })
  const [selected, setSelected] = useState<CancelacionRow | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!clubId) return
    try {
      const [rows, s] = await Promise.all([
        getCancelaciones(supabase, clubId, tab, todayLocal()),
        getCancelacionStats(supabase, clubId),
      ])
      setCancelaciones(rows)
      setStats(s)
    } catch {
      toast.error('Error cargando cancelaciones')
    } finally {
      setLoading(false)
    }
  }, [supabase, clubId, tab])

  useEffect(() => {
    if (!clubId) return
    setLoading(true)
    reload()
  }, [clubId, tab, reload])

  // Realtime
  useEffect(() => {
    if (!clubId) return
    const channel = supabase
      .channel('cancelaciones-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cancelaciones' }, reload)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'reservas' }, reload)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, clubId, reload])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.3px' }}>Cancelaciones</div>
            <div style={{ fontSize: '13px', color: 'var(--color-muted)', marginTop: '2px' }}>
              <span style={{ marginRight: '16px' }}>Hoy: <strong style={{ color: 'var(--color-text)' }}>{stats.total_hoy}</strong></span>
              {stats.pendientes_aprobacion > 0 && (
                <span style={{ color: '#F97316', fontWeight: 600 }}>
                  ● {stats.pendientes_aprobacion} pendiente{stats.pendientes_aprobacion !== 1 ? 's' : ''} de aprobación
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--color-border)' }}>
          {(['items', 'reservas'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setSelected(null) }}
              style={{
                padding: '8px 18px',
                background: 'none', border: 'none',
                borderBottom: tab === t ? '2px solid var(--color-lime)' : '2px solid transparent',
                color: tab === t ? 'var(--color-lime)' : 'var(--color-muted)',
                fontSize: '13px', fontWeight: tab === t ? 700 : 500,
                cursor: 'pointer', fontFamily: 'inherit',
                marginBottom: '-1px', transition: 'all 0.15s',
              }}
            >
              {t === 'items' ? 'Ítems POS' : 'Reservas'}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 360px', overflow: 'hidden' }}>
        <CancelacionesList
          rows={cancelaciones}
          loading={loading}
          selected={selected}
          onSelect={setSelected}
        />
        <div style={{ borderLeft: '1px solid var(--color-border)', overflow: 'hidden' }}>
          <CancelacionDetalle
            cancelacion={selected}
            onAction={reload}
          />
        </div>
      </div>
    </div>
  )
}
```

---

## Task 10: `CancelacionesList` component

**Files:**
- Create: `apps/dashboard/src/components/modules/cancelaciones/CancelacionesList.tsx`

**Step 1: Create the file**

```typescript
'use client'

import type { CancelacionRow } from '@/lib/supabase/queries/cancelaciones'

const ESTADO_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  ejecutada:   { label: 'Ejecutada',   color: 'var(--color-muted)', bg: 'var(--color-bg)' },
  pendiente:   { label: 'Pendiente',   color: '#F97316', bg: 'rgba(249,115,22,0.12)' },
  aprobada:    { label: 'Aprobada',    color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
  reembolsada: { label: 'Reembolsada', color: 'var(--color-lime)', bg: 'rgba(108,242,13,0.10)' },
  rechazada:   { label: 'Rechazada',   color: '#EF4444', bg: 'rgba(239,68,68,0.10)' },
}

interface Props {
  rows: CancelacionRow[]
  loading: boolean
  selected: CancelacionRow | null
  onSelect: (c: CancelacionRow) => void
}

export function CancelacionesList({ rows, loading, selected, onSelect }: Props) {
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-muted)', fontSize: '13px' }}>
        Cargando...
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-muted)', fontSize: '13px' }}>
        Sin cancelaciones
      </div>
    )
  }

  return (
    <div style={{ overflowY: 'auto', padding: '12px' }}>
      {rows.map((row) => {
        const badge = ESTADO_BADGE[row.estado] ?? ESTADO_BADGE.ejecutada
        const isSelected = selected?.id === row.id
        const time = new Date(row.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
        const title = row.reservas
          ? `Reserva — ${row.reservas.pistas?.nombre ?? '—'}`
          : row.cuentas?.numero_ticket
            ? `Ticket ${row.cuentas.numero_ticket}`
            : '—'
        const subtitle = row.reservas
          ? (row.reservas.nombre_cliente ?? row.reservas.clientes?.nombre ?? 'Sin cliente')
          : row.motivo

        return (
          <div
            key={row.id}
            onClick={() => onSelect(row)}
            style={{
              padding: '12px 14px',
              borderRadius: '10px',
              border: `1px solid ${isSelected ? 'var(--color-lime)' : 'var(--color-border-subtle)'}`,
              background: isSelected ? 'rgba(108,242,13,0.05)' : 'var(--color-bg2)',
              marginBottom: '6px',
              cursor: 'pointer',
              transition: 'border-color 0.15s',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text)', marginBottom: '2px' }}>
                  {title}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {subtitle}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                <span style={{
                  fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px',
                  color: badge.color, background: badge.bg,
                }}>
                  {badge.label}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: row.monto > 0 ? 'var(--color-lime)' : 'var(--color-muted)' }}>
                  {row.monto > 0 ? `$${row.monto.toFixed(2)}` : '—'}
                </span>
              </div>
            </div>
            <div style={{ fontSize: '10px', color: 'var(--color-muted-dim)', marginTop: '6px' }}>
              {time} · {row.cancelado_por_empleado?.nombre ?? '—'}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

---

## Task 11: `CancelacionDetalle` component

**Files:**
- Create: `apps/dashboard/src/components/modules/cancelaciones/CancelacionDetalle.tsx`

**Step 1: Create the file**

```typescript
'use client'

import { useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { aprobarCancelacion } from '@/lib/supabase/queries/cancelaciones'
import type { CancelacionRow } from '@/lib/supabase/queries/cancelaciones'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface Props {
  cancelacion: CancelacionRow | null
  onAction: () => void
}

export function CancelacionDetalle({ cancelacion, onAction }: Props) {
  const user = useAppStore((s) => s.user)
  const cajaId = useAppStore((s) => s.cajaId)
  const [rechazarMotivo, setRechazarMotivo] = useState('')
  const [showRechazo, setShowRechazo] = useState(false)
  const [saving, setSaving] = useState(false)

  const isAdmin = user?.rol === 'admin' || user?.rol === 'propietario'

  if (!cancelacion) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-muted)', fontSize: '13px', padding: '24px', textAlign: 'center' }}>
        Selecciona una cancelación para ver el detalle
      </div>
    )
  }

  async function handleAprobar() {
    if (!user?.id) return
    setSaving(true)
    try {
      await aprobarCancelacion(createClient(), cancelacion!.id, user.id, cajaId ?? null, false)
      toast.success('Cancelación aprobada y reembolso registrado')
      onAction()
    } catch {
      toast.error('Error al aprobar la cancelación')
    } finally {
      setSaving(false)
    }
  }

  async function handleRechazar() {
    if (!user?.id || !rechazarMotivo.trim()) return
    setSaving(true)
    try {
      await aprobarCancelacion(createClient(), cancelacion!.id, user.id, null, true, rechazarMotivo)
      toast.success('Cancelación rechazada')
      setShowRechazo(false)
      setRechazarMotivo('')
      onAction()
    } catch {
      toast.error('Error al rechazar la cancelación')
    } finally {
      setSaving(false)
    }
  }

  const r = cancelacion.reservas
  const isReserva = !!cancelacion.reserva_id

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', padding: '20px' }}>
      {/* Title */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '14px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
          {isReserva ? 'Cancelación de Reserva' : 'Cancelación de Ítem'}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--color-muted)' }}>
          {new Date(cancelacion.created_at).toLocaleString('es-MX')}
        </div>
      </div>

      {/* Fields */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
        <Field label="Estado" value={cancelacion.estado.toUpperCase()} highlight={cancelacion.estado === 'pendiente'} />
        <Field label="Tipo" value={cancelacion.tipo === 'pre_cobro' ? 'Pre-cobro' : 'Post-cobro'} />
        <Field label="Motivo" value={cancelacion.motivo} />
        {cancelacion.monto > 0 && (
          <Field label="Monto" value={`$${cancelacion.monto.toFixed(2)}`} mono />
        )}
        {cancelacion.metodo_pago && (
          <Field label="Método de pago" value={cancelacion.metodo_pago} />
        )}

        {isReserva && r && (
          <>
            <div style={{ height: '1px', background: 'var(--color-border-subtle)' }} />
            <Field label="Pista" value={r.pistas?.nombre ?? '—'} />
            <Field label="Fecha" value={`${r.fecha} · ${r.hora_inicio} – ${r.hora_fin}`} />
            <Field label="Cliente" value={r.nombre_cliente ?? r.clientes?.nombre ?? 'Sin cliente'} />
          </>
        )}

        {cancelacion.cuentas && (
          <>
            <div style={{ height: '1px', background: 'var(--color-border-subtle)' }} />
            <Field label="Ticket" value={cancelacion.cuentas.numero_ticket} />
          </>
        )}

        <div style={{ height: '1px', background: 'var(--color-border-subtle)' }} />
        <Field label="Cancelado por" value={cancelacion.cancelado_por_empleado?.nombre ?? '—'} />
        {cancelacion.autorizado_por_empleado && (
          <Field label="Autorizado por" value={cancelacion.autorizado_por_empleado.nombre} />
        )}
        {cancelacion.rechazado_motivo && (
          <Field label="Motivo rechazo" value={cancelacion.rechazado_motivo} />
        )}

        {/* Admin actions for pending post-cobro */}
        {isAdmin && cancelacion.estado === 'pendiente' && !showRechazo && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
            <button
              onClick={handleAprobar}
              disabled={saving}
              style={{
                padding: '10px', borderRadius: '8px', border: 'none',
                background: saving ? 'rgba(108,242,13,0.3)' : 'var(--color-lime)',
                color: 'var(--color-bg)', fontSize: '12px', fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              }}
            >
              {saving ? 'Procesando...' : 'Aprobar reembolso'}
            </button>
            <button
              onClick={() => setShowRechazo(true)}
              disabled={saving}
              style={{
                padding: '10px', borderRadius: '8px',
                border: '1px solid #EF4444', background: 'transparent',
                color: '#EF4444', fontSize: '12px', fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              }}
            >
              Rechazar
            </button>
          </div>
        )}

        {isAdmin && cancelacion.estado === 'pendiente' && showRechazo && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
            <input
              value={rechazarMotivo}
              onChange={(e) => setRechazarMotivo(e.target.value)}
              placeholder="Motivo del rechazo..."
              style={{
                padding: '9px 12px', borderRadius: '8px',
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg)', color: 'var(--color-text)',
                fontSize: '13px', fontFamily: 'inherit', outline: 'none',
              }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                onClick={handleRechazar}
                disabled={saving || !rechazarMotivo.trim()}
                style={{
                  padding: '10px', borderRadius: '8px', border: 'none',
                  background: '#EF4444', color: '#fff',
                  fontSize: '12px', fontWeight: 700,
                  cursor: saving || !rechazarMotivo.trim() ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit', opacity: saving || !rechazarMotivo.trim() ? 0.6 : 1,
                }}
              >
                Confirmar rechazo
              </button>
              <button
                onClick={() => { setShowRechazo(false); setRechazarMotivo('') }}
                style={{
                  padding: '10px', borderRadius: '8px',
                  border: '1px solid var(--color-border)', background: 'transparent',
                  color: 'var(--color-muted)', fontSize: '12px', fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Tarjeta note */}
        {cancelacion.estado === 'aprobada' && cancelacion.metodo_pago !== 'efectivo' && (
          <div style={{
            padding: '10px 12px', borderRadius: '8px',
            border: '1px solid rgba(59,130,246,0.3)',
            background: 'rgba(59,130,246,0.06)',
            fontSize: '12px', color: '#93C5FD',
          }}>
            Gestionar reembolso en terminal BBVA
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, value, highlight, mono }: { label: string; value: string; highlight?: boolean; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>{label}</div>
      <div style={{
        fontSize: '13px', fontWeight: 500,
        color: highlight ? '#F97316' : 'var(--color-text)',
        fontFamily: mono ? 'var(--font-mono)' : 'inherit',
      }}>{value}</div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add apps/dashboard/src/components/modules/cancelaciones/
git commit -m "feat(cancelaciones): add CancelacionesPage, List, and Detalle components"
```

---

## Task 12: `CancelacionReservaModal` component

**Files:**
- Create: `apps/dashboard/src/components/modules/cancelaciones/CancelacionReservaModal.tsx`

**Step 1: Create the file**

```typescript
'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cancelarReserva } from '@/lib/supabase/queries/cancelaciones'
import { useAppStore } from '@/store/useAppStore'
import { toast } from 'sonner'

interface Props {
  open: boolean
  reservaId: string
  clienteNombre: string
  pistaName: string
  onClose: () => void
  onSuccess: () => void
}

export function CancelacionReservaModal({ open, reservaId, clienteNombre, pistaName, onClose, onSuccess }: Props) {
  const clubId = useAppStore((s) => s.clubId)
  const user = useAppStore((s) => s.user)
  const [motivo, setMotivo] = useState('')
  const [saving, setSaving] = useState(false)

  if (!open) return null

  async function handleCancelar() {
    if (!motivo.trim() || !clubId || !user?.id) return
    setSaving(true)
    try {
      await cancelarReserva(createClient(), clubId, reservaId, motivo, user.id)
      toast.success('Reserva cancelada')
      setMotivo('')
      onSuccess()
    } catch {
      toast.error('Error al cancelar la reserva')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'var(--color-bg2)', border: '1px solid var(--color-border)', borderRadius: '16px', width: '400px', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Cancelar Reserva</div>
            <div style={{ fontSize: '12px', color: 'var(--color-muted)', marginTop: '2px' }}>{pistaName} · {clienteNombre}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', padding: '4px' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
              Motivo de cancelación *
            </label>
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: Cliente llamó para cancelar..."
              style={{
                width: '100%', padding: '10px 12px',
                background: 'var(--color-bg)', border: '1px solid var(--color-border)',
                borderRadius: '8px', color: 'var(--color-text)',
                fontSize: '13px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <button onClick={onClose} style={{ padding: '11px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '10px', color: 'var(--color-muted)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Cancelar
            </button>
            <button
              onClick={handleCancelar}
              disabled={saving || !motivo.trim()}
              style={{
                padding: '11px', borderRadius: '10px', border: 'none',
                background: saving || !motivo.trim() ? 'rgba(239,68,68,0.3)' : '#EF4444',
                color: '#fff', fontSize: '13px', fontWeight: 700,
                cursor: saving || !motivo.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              }}
            >
              {saving ? 'Cancelando...' : 'Confirmar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add apps/dashboard/src/components/modules/cancelaciones/CancelacionReservaModal.tsx
git commit -m "feat(cancelaciones): add CancelacionReservaModal component"
```

---

## Task 13: Verify `movimientos_stock` schema for merma

**Step 1: Check columns**

Run SQL:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'movimientos_stock' ORDER BY ordinal_position;
```

If the `tipo` column is an enum, check its values and adjust `rpc_cancelar_item_pre_cobro` to use the correct cast (e.g., `'merma'::movimiento_stock_tipo`).

**Step 2: Fix RPC if needed**

Re-apply `rpc_cancelar_item_pre_cobro` with the correct enum cast if the `tipo` column is not plain text.

---

## Task 14: Manual smoke test

**Step 1:** Start dev server
```bash
cd apps/dashboard && npm run dev
```

**Step 2:** Navigate to `/cancelaciones` — verify page loads with both tabs.

**Step 3:** From `/pistas`, open a reservation in `confirmada` state → cancel it → verify it appears in the Reservas tab in real time.

**Step 4:** From `/pos`, cancel a `cuenta_item` in an open account → verify it appears in Ítems POS tab.

**Step 5:** As admin, find a `pendiente` post-cobro cancelation → approve it → verify estado changes to `reembolsada`.

**Step 6:** Final commit
```bash
git add -A
git commit -m "feat(cancelaciones): complete cancelaciones module"
```
