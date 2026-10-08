# Historial Financiero — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Crear el módulo `/historial` que muestra todo el flujo de dinero del sistema: tickets POS, rentas de canchas y movimientos de caja, con filtros por período (día/semana/mes/todo) y detalle expandible por transacción.

**Architecture:** Página client-side con 3 queries paralelas a Supabase (ventas, canchas, movimientos). Estado local para período activo y tab activo. Sin nuevas tablas en DB — todo sobre tablas existentes (`cuentas`, `reservas`, `movimientos_caja`).

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Supabase JS client, date-fns, lucide-react, sonner (toasts). Todos ya instalados en `apps/dashboard`.

**Monorepo root:** `c:\Users\ear21\OneDrive\Documents\Padel`
**Dashboard root:** `apps/dashboard`
**Club ID constante:** `a1000000-0000-0000-0000-000000000001`

---

## Task 1: Query layer — `queries/historial.ts`

**Files:**
- Create: `apps/dashboard/src/lib/supabase/queries/historial.ts`

**Context:** El patrón de queries existente está en `queries/pos.ts` y `queries/pistas.ts`. Todas usan `SupabaseClient` como primer arg. Los movimientos de caja NO tienen `club_id` directo — se llega vía `caja_id → cajas.club_id`. Para el cajero de una venta POS: las `cuentas` no tienen `empleado_id` directo; se obtiene del turno activo al momento de la venta via join `cajas ← turnos ← empleados` por rango de tiempo. Simplificamos: en la primera versión el cajero de movimientos viene del join `movimientos_caja → cajas → turnos → empleados`.

**Step 1: Crear el archivo con todos los tipos e interfaces**

```typescript
// apps/dashboard/src/lib/supabase/queries/historial.ts
import type { SupabaseClient } from '@supabase/supabase-js'

export interface VentaPOS {
  id: string
  numero_ticket: string
  created_at: string
  total: number
  subtotal: number
  iva: number
  descuento_total: number
  cliente_nombre: string | null
  metodos_pago: { metodo: string; monto: number }[]
  items: { nombre: string; cantidad: number; precio_unitario: number; subtotal: number }[]
}

export interface RentaCancha {
  id: string
  pista_nombre: string
  hora_inicio: string
  hora_fin: string
  fecha: string
  precio: number
  cliente_nombre: string | null
  estado: string
  notas: string | null
  created_at: string
}

export interface MovimientoCajaHistorial {
  id: string
  tipo: 'ingreso' | 'egreso' | 'fondo' | 'retiro'
  concepto: string
  monto: number
  cajero_nombre: string | null
  created_at: string
}

export interface KPIsHistorial {
  totalVentas: number
  countVentas: number
  totalCanchas: number
  countCanchas: number
  netoCaja: number   // ingresos+fondos - egresos - retiros
  countMovimientos: number
  totalIngresos: number  // totalVentas + totalCanchas
}
```

**Step 2: Implementar `getHistorialVentas`**

```typescript
export async function getHistorialVentas(
  supabase: SupabaseClient,
  clubId: string,
  desde: string,
  hasta: string,
): Promise<VentaPOS[]> {
  const { data, error } = await supabase
    .from('cuentas')
    .select(`
      id,
      numero_ticket,
      created_at,
      total,
      subtotal,
      iva,
      descuento_total,
      clientes ( nombre ),
      pagos ( metodo, monto ),
      cuenta_items (
        cantidad,
        precio_unitario,
        subtotal,
        productos ( nombre )
      )
    `)
    .eq('club_id', clubId)
    .eq('estado', 'pagada')
    .gte('created_at', desde)
    .lte('created_at', hasta)
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((c) => ({
    id: c.id,
    numero_ticket: (c.numero_ticket as string) ?? c.id.slice(-6).toUpperCase(),
    created_at: c.created_at as string,
    total: c.total as number,
    subtotal: c.subtotal as number,
    iva: c.iva as number,
    descuento_total: c.descuento_total as number,
    cliente_nombre: (c.clientes as { nombre: string } | null)?.nombre ?? null,
    metodos_pago: ((c.pagos as { metodo: string; monto: number }[]) ?? []),
    items: ((c.cuenta_items as unknown as {
      cantidad: number
      precio_unitario: number
      subtotal: number
      productos: { nombre: string } | null
    }[]) ?? []).map((i) => ({
      nombre: i.productos?.nombre ?? 'Producto',
      cantidad: i.cantidad,
      precio_unitario: i.precio_unitario,
      subtotal: i.subtotal,
    })),
  }))
}
```

**Step 3: Implementar `getHistorialCanchas`**

```typescript
export async function getHistorialCanchas(
  supabase: SupabaseClient,
  clubId: string,
  desde: string,
  hasta: string,
): Promise<RentaCancha[]> {
  const { data, error } = await supabase
    .from('reservas')
    .select(`
      id,
      hora_inicio,
      hora_fin,
      fecha,
      precio,
      estado,
      notas,
      created_at,
      pistas ( nombre ),
      clientes ( nombre )
    `)
    .eq('club_id', clubId)
    .eq('estado', 'finalizada')
    .gte('created_at', desde)
    .lte('created_at', hasta)
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((r) => ({
    id: r.id,
    pista_nombre: (r.pistas as { nombre: string } | null)?.nombre ?? 'Pista',
    hora_inicio: r.hora_inicio as string,
    hora_fin: r.hora_fin as string,
    fecha: r.fecha as string,
    precio: r.precio as number,
    cliente_nombre: (r.clientes as { nombre: string } | null)?.nombre ?? null,
    estado: r.estado as string,
    notas: r.notas as string | null,
    created_at: r.created_at as string,
  }))
}
```

**Step 4: Implementar `getHistorialMovimientos`**

```typescript
export async function getHistorialMovimientos(
  supabase: SupabaseClient,
  clubId: string,
  desde: string,
  hasta: string,
): Promise<MovimientoCajaHistorial[]> {
  // movimientos_caja → cajas (club_id) → turno → empleado
  const { data, error } = await supabase
    .from('movimientos_caja')
    .select(`
      id,
      tipo,
      concepto,
      monto,
      created_at,
      cajas!inner (
        club_id,
        turno:turno_id (
          empleado:empleado_id ( nombre )
        )
      )
    `)
    .eq('cajas.club_id', clubId)
    .gte('created_at', desde)
    .lte('created_at', hasta)
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((m) => {
    const caja = m.cajas as { turno: { empleado: { nombre: string } | null } | null } | null
    return {
      id: m.id,
      tipo: m.tipo as MovimientoCajaHistorial['tipo'],
      concepto: m.concepto as string,
      monto: m.monto as number,
      cajero_nombre: caja?.turno?.empleado?.nombre ?? null,
      created_at: m.created_at as string,
    }
  })
}
```

**Step 5: Implementar `getKPIsHistorial`**

```typescript
export async function getKPIsHistorial(
  supabase: SupabaseClient,
  clubId: string,
  desde: string,
  hasta: string,
): Promise<KPIsHistorial> {
  const [ventas, canchas, movimientos] = await Promise.all([
    getHistorialVentas(supabase, clubId, desde, hasta),
    getHistorialCanchas(supabase, clubId, desde, hasta),
    getHistorialMovimientos(supabase, clubId, desde, hasta),
  ])

  const totalVentas = ventas.reduce((s, v) => s + v.total, 0)
  const totalCanchas = canchas.reduce((s, c) => s + c.precio, 0)

  const netoCaja = movimientos.reduce((s, m) => {
    if (m.tipo === 'ingreso' || m.tipo === 'fondo') return s + m.monto
    return s - m.monto
  }, 0)

  return {
    totalVentas,
    countVentas: ventas.length,
    totalCanchas,
    countCanchas: canchas.length,
    netoCaja,
    countMovimientos: movimientos.length,
    totalIngresos: totalVentas + totalCanchas,
  }
}
```

**Step 6: Verificar TypeScript**
```bash
cd apps/dashboard && npx tsc --noEmit
```
Expected: EXIT:0 sin errores.

---

## Task 2: Route + TopBar + Sidebar

**Files:**
- Create: `apps/dashboard/src/app/(dashboard)/historial/page.tsx`
- Modify: `apps/dashboard/src/components/layout/Sidebar.tsx`
- Modify: `apps/dashboard/src/components/layout/TopBar.tsx`

**Context:**
- El patrón de route es exactamente igual a `app/(dashboard)/reportes/page.tsx` — un server component mínimo que hace `return <HistorialPage />`.
- En `Sidebar.tsx`, `ADMIN_ITEMS` es un array `as const` en línea 30-34. Agregar `{ href: '/historial', label: 'Historial', icon: History }` al array. El ícono `History` viene de `lucide-react`.
- En `TopBar.tsx`, `MODULE_CONFIG` es un objeto en línea 7-20. Agregar entrada para `/historial`.

**Step 1: Crear la route**

```typescript
// apps/dashboard/src/app/(dashboard)/historial/page.tsx
import { HistorialPage } from '@/components/modules/historial/HistorialPage'

export default function Page() {
  return <HistorialPage />
}
```

**Step 2: Agregar `History` al import de `Sidebar.tsx` y añadir el item**

En `apps/dashboard/src/components/layout/Sidebar.tsx`:

- Agregar `History` al import de lucide-react (línea 5-17):
```typescript
import {
  Monitor, Grid2x2, Clock, Package, Users, Wallet,
  UserCog, BarChart3, Settings, LogOut, Tag, History,
} from 'lucide-react'
```

- Agregar a `ADMIN_ITEMS` (después de `{ href: '/descuentos', ... }`):
```typescript
{ href: '/historial', label: 'Historial', icon: History },
```

**Step 3: Agregar entrada en `TopBar.tsx`**

En `apps/dashboard/src/components/layout/TopBar.tsx`, dentro de `MODULE_CONFIG`:
```typescript
'/historial': { title: 'Historial Financiero', search: '', variant: 'terminal' },
```

**Step 4: Crear placeholder del componente para que compile**

```typescript
// apps/dashboard/src/components/modules/historial/HistorialPage.tsx
'use client'
export function HistorialPage() {
  return <div style={{ padding: '24px', color: 'var(--color-muted)' }}>Cargando historial...</div>
}
```

**Step 5: Verificar TypeScript y que la ruta carga**
```bash
cd apps/dashboard && npx tsc --noEmit
```
Expected: EXIT:0. La página `/historial` debe mostrarse en el sidebar y cargar sin errores.

---

## Task 3: PeriodSelector + KPI Cards

**Files:**
- Modify: `apps/dashboard/src/components/modules/historial/HistorialPage.tsx`

**Context:** El componente usará `useState` para `periodo: 'dia' | 'semana' | 'mes' | 'todo'` y `cursor: Date` (la fecha de referencia para navegar). Los KPIs se calculan con `getKPIsHistorial`. Reutiliza el patrón de diseño visual de `CajaPage.tsx` y `ReportesPage.tsx` (inline styles, variables CSS del theme).

**Step 1: Implementar el helper de rangos de fecha**

Dentro de `HistorialPage.tsx`:

```typescript
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, format, subDays, addDays, subWeeks, addWeeks, subMonths, addMonths } from 'date-fns'
import { es } from 'date-fns/locale'

type Periodo = 'dia' | 'semana' | 'mes' | 'todo'

function getRango(periodo: Periodo, cursor: Date): { desde: string; hasta: string; label: string } {
  const fmt = (d: Date) => d.toISOString()

  switch (periodo) {
    case 'dia':
      return {
        desde: fmt(startOfDay(cursor)),
        hasta: fmt(endOfDay(cursor)),
        label: format(cursor, "EEEE d 'de' MMMM yyyy", { locale: es }),
      }
    case 'semana': {
      const ini = startOfWeek(cursor, { weekStartsOn: 1 })
      const fin = endOfWeek(cursor, { weekStartsOn: 1 })
      return {
        desde: fmt(ini),
        hasta: fmt(fin),
        label: `${format(ini, 'd MMM', { locale: es })} — ${format(fin, 'd MMM yyyy', { locale: es })}`,
      }
    }
    case 'mes':
      return {
        desde: fmt(startOfMonth(cursor)),
        hasta: fmt(endOfMonth(cursor)),
        label: format(cursor, 'MMMM yyyy', { locale: es }),
      }
    case 'todo':
      return {
        desde: '2020-01-01T00:00:00.000Z',
        hasta: new Date(Date.now() + 86400000).toISOString(),
        label: 'Todo el tiempo',
      }
  }
}

function navCursor(cursor: Date, periodo: Periodo, dir: 'prev' | 'next'): Date {
  const delta = dir === 'prev' ? -1 : 1
  switch (periodo) {
    case 'dia': return dir === 'prev' ? subDays(cursor, 1) : addDays(cursor, 1)
    case 'semana': return dir === 'prev' ? subWeeks(cursor, 1) : addWeeks(cursor, 1)
    case 'mes': return dir === 'prev' ? subMonths(cursor, 1) : addMonths(cursor, 1)
    default: return cursor
  }
}
```

**Step 2: Implementar el componente completo con PeriodSelector + KPIs**

```typescript
'use client'

import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  getHistorialVentas, getHistorialCanchas, getHistorialMovimientos, getKPIsHistorial,
  type VentaPOS, type RentaCancha, type MovimientoCajaHistorial, type KPIsHistorial,
} from '@/lib/supabase/queries/historial'
// ... (helpers getRango y navCursor definidos arriba)

const CLUB_ID = 'a1000000-0000-0000-0000-000000000001'

function fmt(n: number) {
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

type Tab = 'ventas' | 'canchas' | 'caja' | 'todo'

export function HistorialPage() {
  const [periodo, setPeriodo] = useState<Periodo>('dia')
  const [cursor, setCursor] = useState(new Date())
  const [tab, setTab] = useState<Tab>('ventas')
  const [kpis, setKpis] = useState<KPIsHistorial | null>(null)
  const [ventas, setVentas] = useState<VentaPOS[]>([])
  const [canchas, setCanchas] = useState<RentaCancha[]>([])
  const [movimientos, setMovimientos] = useState<MovimientoCajaHistorial[]>([])
  const [loading, setLoading] = useState(true)

  const { desde, hasta, label } = getRango(periodo, cursor)
  const labelCap = label.charAt(0).toUpperCase() + label.slice(1)

  useEffect(() => {
    setLoading(true)
    const supabase = createClient()
    Promise.all([
      getHistorialVentas(supabase, CLUB_ID, desde, hasta),
      getHistorialCanchas(supabase, CLUB_ID, desde, hasta),
      getHistorialMovimientos(supabase, CLUB_ID, desde, hasta),
      getKPIsHistorial(supabase, CLUB_ID, desde, hasta),
    ]).then(([v, c, m, k]) => {
      setVentas(v)
      setCanchas(c)
      setMovimientos(m)
      setKpis(k)
    }).catch(console.error).finally(() => setLoading(false))
  }, [desde, hasta])

  return (
    <div style={{ padding: '24px', overflowY: 'auto', height: 'calc(100vh - 56px)' }}>
      {/* Header + Period selector */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <div style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.3px' }}>Historial Financiero</div>
          <div style={{ fontSize: '13px', color: 'var(--color-muted)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {periodo !== 'todo' && (
              <button onClick={() => setCursor(navCursor(cursor, periodo, 'prev'))}
                style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', padding: '2px 4px' }}>
                <ChevronLeft size={14} />
              </button>
            )}
            {labelCap}
            {periodo !== 'todo' && (
              <button onClick={() => setCursor(navCursor(cursor, periodo, 'next'))}
                style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', padding: '2px 4px' }}>
                <ChevronRight size={14} />
              </button>
            )}
          </div>
        </div>
        {/* Period pills */}
        <div style={{ display: 'flex', gap: '4px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '10px', padding: '4px' }}>
          {(['dia', 'semana', 'mes', 'todo'] as Periodo[]).map((p) => (
            <button key={p} onClick={() => { setPeriodo(p); setCursor(new Date()) }}
              style={{
                padding: '6px 14px', borderRadius: '7px', border: 'none', cursor: 'pointer',
                background: periodo === p ? 'var(--color-lime)' : 'transparent',
                color: periodo === p ? 'var(--color-bg)' : 'var(--color-muted)',
                fontSize: '12px', fontWeight: 700, fontFamily: 'inherit', textTransform: 'capitalize',
                transition: 'all 0.15s',
              }}>
              {p === 'dia' ? 'Día' : p === 'semana' ? 'Semana' : p === 'mes' ? 'Mes' : 'Total'}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Ventas POS', value: fmt(kpis?.totalVentas ?? 0), sub: `${kpis?.countVentas ?? 0} tickets`, color: 'var(--color-lime)' },
          { label: 'Canchas', value: fmt(kpis?.totalCanchas ?? 0), sub: `${kpis?.countCanchas ?? 0} rentas`, color: '#60a5fa' },
          { label: 'Mov. Caja', value: fmt(kpis?.netoCaja ?? 0), sub: `${kpis?.countMovimientos ?? 0} movimientos`, color: (kpis?.netoCaja ?? 0) >= 0 ? 'var(--color-lime)' : '#ef4444' },
          { label: 'Total Ingresos', value: fmt(kpis?.totalIngresos ?? 0), sub: `Ventas + Canchas`, color: '#EAB308' },
        ].map((kpi) => (
          <div key={kpi.label} style={{ background: 'var(--color-bg2)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>{kpi.label}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '22px', fontWeight: 700, color: kpi.color }}>{loading ? '—' : kpi.value}</div>
            <div style={{ fontSize: '11px', color: 'var(--color-muted-dim)', marginTop: '3px' }}>{loading ? '...' : kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '2px', borderBottom: '1px solid var(--color-border)', marginBottom: '16px' }}>
        {([['ventas', 'Ventas POS'], ['canchas', 'Canchas'], ['caja', 'Movimientos Caja'], ['todo', 'Todo']] as [Tab, string][]).map(([t, lbl]) => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '13px', fontWeight: tab === t ? 700 : 500, fontFamily: 'inherit',
              color: tab === t ? 'var(--color-lime)' : 'var(--color-muted)',
              borderBottom: tab === t ? '2px solid var(--color-lime)' : '2px solid transparent',
              transition: 'all 0.15s', marginBottom: '-1px',
            }}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Lista — placeholder hasta Task 4 */}
      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--color-muted)', padding: '48px 0', fontSize: '13px' }}>Cargando...</div>
      ) : (
        <div style={{ color: 'var(--color-muted)', fontSize: '13px' }}>
          {tab === 'ventas' && `${ventas.length} ventas — lista en siguiente tarea`}
          {tab === 'canchas' && `${canchas.length} canchas — lista en siguiente tarea`}
          {tab === 'caja' && `${movimientos.length} movimientos — lista en siguiente tarea`}
          {tab === 'todo' && `${ventas.length + canchas.length + movimientos.length} total — lista en siguiente tarea`}
        </div>
      )}
    </div>
  )
}
```

**Step 3: Verificar TypeScript y visual**
```bash
cd apps/dashboard && npx tsc --noEmit
```
Expected: EXIT:0. Al abrir `/historial` deben verse los 4 KPI cards con datos reales y los pills de período funcionando.

---

## Task 4: Lista Ventas POS con detalle expandible

**Files:**
- Modify: `apps/dashboard/src/components/modules/historial/HistorialPage.tsx`

**Context:** Reemplazar el placeholder del tab `ventas` con la lista real. Patrón visual idéntico al `TicketHistory.tsx` existente pero con más campos (cajero, cliente, desglose IVA/descuento).

**Step 1: Agregar helper de formato de hora**

```typescript
function fmtHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}
function fmtFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
}
function fmtMonto(n: number): string {
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
```

**Step 2: Agregar state `expandedId` y componente `VentaRow`**

```typescript
// Dentro de HistorialPage, añadir al estado:
const [expandedId, setExpandedId] = useState<string | null>(null)

// Componente VentaRow (definir fuera de HistorialPage para no re-crear en cada render):
function MetodoBadge({ metodo }: { metodo: string }) {
  const isCard = metodo === 'credito' || metodo === 'debito'
  const isDividido = metodo === 'dividido'
  return (
    <span style={{
      fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px',
      padding: '3px 7px', borderRadius: '5px',
      background: isDividido ? 'rgba(234,179,8,0.12)' : isCard ? 'rgba(96,165,250,0.12)' : 'rgba(108,242,13,0.10)',
      color: isDividido ? '#EAB308' : isCard ? '#60a5fa' : 'var(--color-lime)',
    }}>
      {isDividido ? 'Dividido' : isCard ? 'Tarjeta' : metodo === 'cortesia' ? 'Cortesía' : 'Efectivo'}
    </span>
  )
}
```

**Step 3: Implementar la lista de ventas (reemplazar el placeholder del tab 'ventas')**

```typescript
// En la sección donde estaba el placeholder del tab 'ventas':
{tab === 'ventas' && (
  <div>
    {ventas.length === 0 ? (
      <div style={{ textAlign: 'center', color: 'var(--color-muted-dim)', padding: '48px 0', fontSize: '13px' }}>
        Sin ventas en este período
      </div>
    ) : ventas.map((v) => {
      const isExp = expandedId === v.id
      const metodoLabel = v.metodos_pago.length > 1 ? 'dividido' : v.metodos_pago[0]?.metodo ?? 'efectivo'
      return (
        <div key={v.id} onClick={() => setExpandedId(isExp ? null : v.id)}
          style={{ marginBottom: '6px', background: 'var(--color-bg2)', border: '1px solid var(--color-border-subtle)', borderRadius: '10px', overflow: 'hidden', cursor: 'pointer' }}>
          <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ minWidth: '44px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, color: 'var(--color-lime)' }}>{fmtHora(v.created_at)}</div>
              <div style={{ fontSize: '10px', color: 'var(--color-muted-dim)' }}>{fmtFecha(v.created_at)}</div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '12px', fontWeight: 700 }}>{v.numero_ticket}</div>
              <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '1px' }}>
                {v.items.length} producto{v.items.length !== 1 ? 's' : ''}
                {v.cliente_nombre ? ` · ${v.cliente_nombre}` : ''}
              </div>
            </div>
            <MetodoBadge metodo={metodoLabel} />
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color: 'var(--color-lime)', minWidth: '80px', textAlign: 'right' }}>
              {fmtMonto(v.total)}
            </div>
            <span style={{ color: 'var(--color-muted)', fontSize: '12px', transition: 'transform 0.15s', transform: isExp ? 'rotate(90deg)' : 'none' }}>›</span>
          </div>
          {isExp && (
            <div style={{ borderTop: '1px solid var(--color-border-subtle)', padding: '12px 16px', background: 'rgba(0,0,0,0.1)' }}>
              {/* Productos */}
              <div style={{ marginBottom: '10px' }}>
                {v.items.map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--color-muted)', padding: '3px 0' }}>
                    <span>{item.cantidad}x {item.nombre}</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{fmtMonto(item.subtotal)}</span>
                  </div>
                ))}
              </div>
              {/* Totales */}
              <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: '8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: '11px', color: 'var(--color-muted)' }}>
                <span>Subtotal</span><span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmtMonto(v.subtotal)}</span>
                {v.descuento_total > 0 && (<><span style={{ color: '#EAB308' }}>Descuento</span><span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: '#EAB308' }}>-{fmtMonto(v.descuento_total)}</span></>)}
                <span>IVA 16%</span><span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmtMonto(v.iva)}</span>
                <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>Total</span><span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-lime)' }}>{fmtMonto(v.total)}</span>
              </div>
              {/* Métodos de pago */}
              {v.metodos_pago.length > 1 && (
                <div style={{ marginTop: '8px', borderTop: '1px solid var(--color-border-subtle)', paddingTop: '8px' }}>
                  {v.metodos_pago.map((p, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--color-muted)', padding: '2px 0' }}>
                      <span style={{ textTransform: 'capitalize' }}>{p.metodo}</span>
                      <span style={{ fontFamily: 'var(--font-mono)' }}>{fmtMonto(p.monto)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )
    })}
  </div>
)}
```

**Step 4: Verificar TypeScript**
```bash
cd apps/dashboard && npx tsc --noEmit
```
Expected: EXIT:0. Tab Ventas POS muestra lista con expandible funcional.

---

## Task 5: Lista Canchas + Lista Movimientos Caja + Tab Todo

**Files:**
- Modify: `apps/dashboard/src/components/modules/historial/HistorialPage.tsx`

**Context:** Mismo patrón visual que Task 4 pero adaptado para canchas y movimientos. El tab "Todo" mezcla los 3 tipos, ordenados por `created_at` desc, con un ícono diferenciador.

**Step 1: Reemplazar placeholder del tab 'canchas'**

```typescript
{tab === 'canchas' && (
  <div>
    {canchas.length === 0 ? (
      <div style={{ textAlign: 'center', color: 'var(--color-muted-dim)', padding: '48px 0', fontSize: '13px' }}>Sin rentas en este período</div>
    ) : canchas.map((c) => {
      const isExp = expandedId === c.id
      // Calcular duración en minutos
      const [sh, sm] = c.hora_inicio.split(':').map(Number)
      const [eh, em] = c.hora_fin.split(':').map(Number)
      const durMin = (eh * 60 + em) - (sh * 60 + sm)
      return (
        <div key={c.id} onClick={() => setExpandedId(isExp ? null : c.id)}
          style={{ marginBottom: '6px', background: 'var(--color-bg2)', border: '1px solid var(--color-border-subtle)', borderRadius: '10px', overflow: 'hidden', cursor: 'pointer' }}>
          <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ minWidth: '44px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, color: '#60a5fa' }}>{c.hora_inicio.slice(0, 5)}</div>
              <div style={{ fontSize: '10px', color: 'var(--color-muted-dim)' }}>{c.fecha ? c.fecha.slice(5).replace('-', '/') : fmtFecha(c.created_at)}</div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '12px', fontWeight: 700 }}>{c.pista_nombre}</div>
              <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '1px' }}>
                {c.hora_inicio.slice(0, 5)}–{c.hora_fin.slice(0, 5)} · {durMin} min
                {c.cliente_nombre ? ` · ${c.cliente_nombre}` : ''}
              </div>
            </div>
            <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', padding: '3px 7px', borderRadius: '5px', background: 'rgba(96,165,250,0.12)', color: '#60a5fa', letterSpacing: '0.3px' }}>
              Cancha
            </span>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color: '#60a5fa', minWidth: '80px', textAlign: 'right' }}>
              {fmtMonto(c.precio)}
            </div>
            <span style={{ color: 'var(--color-muted)', fontSize: '12px', transition: 'transform 0.15s', transform: isExp ? 'rotate(90deg)' : 'none' }}>›</span>
          </div>
          {isExp && (
            <div style={{ borderTop: '1px solid var(--color-border-subtle)', padding: '12px 16px', background: 'rgba(0,0,0,0.1)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: '11px', color: 'var(--color-muted)' }}>
              <span>Pista</span><span style={{ fontWeight: 600, color: 'var(--color-text)' }}>{c.pista_nombre}</span>
              <span>Duración</span><span style={{ fontFamily: 'var(--font-mono)' }}>{durMin} min</span>
              <span>Horario</span><span style={{ fontFamily: 'var(--font-mono)' }}>{c.hora_inicio.slice(0, 5)} – {c.hora_fin.slice(0, 5)}</span>
              <span>Cliente</span><span>{c.cliente_nombre ?? '—'}</span>
              <span>Estado</span><span style={{ textTransform: 'capitalize' }}>{c.estado}</span>
              {c.notas && (<><span>Notas</span><span>{c.notas}</span></>)}
              <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>Total</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#60a5fa' }}>{fmtMonto(c.precio)}</span>
            </div>
          )}
        </div>
      )
    })}
  </div>
)}
```

**Step 2: Reemplazar placeholder del tab 'caja'**

```typescript
{tab === 'caja' && (
  <div>
    {movimientos.length === 0 ? (
      <div style={{ textAlign: 'center', color: 'var(--color-muted-dim)', padding: '48px 0', fontSize: '13px' }}>Sin movimientos en este período</div>
    ) : movimientos.map((m) => {
      const esIngreso = m.tipo === 'ingreso' || m.tipo === 'fondo'
      const color = esIngreso ? 'var(--color-lime)' : '#ef4444'
      const bgColor = esIngreso ? 'rgba(108,242,13,0.10)' : 'rgba(239,68,68,0.10)'
      const tipoLabel = { ingreso: 'Ingreso', egreso: 'Egreso', fondo: 'Fondo', retiro: 'Retiro' }[m.tipo]
      return (
        <div key={m.id}
          style={{ marginBottom: '6px', background: 'var(--color-bg2)', border: '1px solid var(--color-border-subtle)', borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ minWidth: '44px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, color: 'var(--color-muted)' }}>{fmtHora(m.created_at)}</div>
            <div style={{ fontSize: '10px', color: 'var(--color-muted-dim)' }}>{fmtFecha(m.created_at)}</div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '12px', fontWeight: 700 }}>{m.concepto}</div>
            <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '1px' }}>
              {m.cajero_nombre ?? 'Sin cajero'}
            </div>
          </div>
          <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', padding: '3px 7px', borderRadius: '5px', background: bgColor, color, letterSpacing: '0.3px' }}>
            {tipoLabel}
          </span>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color, minWidth: '80px', textAlign: 'right' }}>
            {esIngreso ? '+' : '-'}{fmtMonto(m.monto)}
          </div>
        </div>
      )
    })}
  </div>
)}
```

**Step 3: Implementar tab 'Todo' (lista unificada ordenada por fecha)**

```typescript
{tab === 'todo' && (() => {
  type UnifiedItem =
    | { kind: 'venta'; data: VentaPOS }
    | { kind: 'cancha'; data: RentaCancha }
    | { kind: 'movimiento'; data: MovimientoCajaHistorial }

  const unified: UnifiedItem[] = [
    ...ventas.map((d): UnifiedItem => ({ kind: 'venta', data: d })),
    ...canchas.map((d): UnifiedItem => ({ kind: 'cancha', data: d })),
    ...movimientos.map((d): UnifiedItem => ({ kind: 'movimiento', data: d })),
  ].sort((a, b) => new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime())

  if (unified.length === 0) {
    return <div style={{ textAlign: 'center', color: 'var(--color-muted-dim)', padding: '48px 0', fontSize: '13px' }}>Sin transacciones en este período</div>
  }

  return (
    <div>
      {unified.map((item) => {
        if (item.kind === 'venta') {
          const v = item.data
          const metodoLabel = v.metodos_pago.length > 1 ? 'dividido' : v.metodos_pago[0]?.metodo ?? 'efectivo'
          return (
            <div key={`v-${v.id}`} onClick={() => setExpandedId(expandedId === v.id ? null : v.id)}
              style={{ marginBottom: '6px', background: 'var(--color-bg2)', border: '1px solid var(--color-border-subtle)', borderRadius: '10px', overflow: 'hidden', cursor: 'pointer' }}>
              <div style={{ padding: '11px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', padding: '2px 6px', borderRadius: '4px', background: 'rgba(108,242,13,0.10)', color: 'var(--color-lime)', whiteSpace: 'nowrap' }}>POS</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-muted-dim)', whiteSpace: 'nowrap' }}>{fmtHora(v.created_at)}</span>
                <span style={{ flex: 1, fontSize: '12px', fontWeight: 600 }}>{v.numero_ticket} · {v.items.length} productos</span>
                <MetodoBadge metodo={metodoLabel} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: 'var(--color-lime)' }}>{fmtMonto(v.total)}</span>
              </div>
              {expandedId === v.id && (
                <div style={{ borderTop: '1px solid var(--color-border-subtle)', padding: '10px 16px', background: 'rgba(0,0,0,0.1)', fontSize: '11px', color: 'var(--color-muted)' }}>
                  {v.items.map((i, idx) => <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}><span>{i.cantidad}x {i.nombre}</span><span style={{ fontFamily: 'var(--font-mono)' }}>{fmtMonto(i.subtotal)}</span></div>)}
                  <div style={{ borderTop: '1px solid var(--color-border-subtle)', marginTop: '6px', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: 'var(--color-lime)' }}><span>Total</span><span style={{ fontFamily: 'var(--font-mono)' }}>{fmtMonto(v.total)}</span></div>
                </div>
              )}
            </div>
          )
        }
        if (item.kind === 'cancha') {
          const c = item.data
          return (
            <div key={`c-${c.id}`}
              style={{ marginBottom: '6px', background: 'var(--color-bg2)', border: '1px solid var(--color-border-subtle)', borderRadius: '10px', padding: '11px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', padding: '2px 6px', borderRadius: '4px', background: 'rgba(96,165,250,0.12)', color: '#60a5fa', whiteSpace: 'nowrap' }}>Cancha</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-muted-dim)', whiteSpace: 'nowrap' }}>{c.hora_inicio.slice(0, 5)}</span>
              <span style={{ flex: 1, fontSize: '12px', fontWeight: 600 }}>{c.pista_nombre}{c.cliente_nombre ? ` · ${c.cliente_nombre}` : ''}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: '#60a5fa' }}>{fmtMonto(c.precio)}</span>
            </div>
          )
        }
        // movimiento
        const m = item.data
        const esIngreso = m.tipo === 'ingreso' || m.tipo === 'fondo'
        return (
          <div key={`m-${m.id}`}
            style={{ marginBottom: '6px', background: 'var(--color-bg2)', border: '1px solid var(--color-border-subtle)', borderRadius: '10px', padding: '11px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', padding: '2px 6px', borderRadius: '4px', background: esIngreso ? 'rgba(108,242,13,0.10)' : 'rgba(239,68,68,0.10)', color: esIngreso ? 'var(--color-lime)' : '#ef4444', whiteSpace: 'nowrap' }}>Caja</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-muted-dim)', whiteSpace: 'nowrap' }}>{fmtHora(m.created_at)}</span>
            <span style={{ flex: 1, fontSize: '12px', fontWeight: 600 }}>{m.concepto}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: esIngreso ? 'var(--color-lime)' : '#ef4444' }}>{esIngreso ? '+' : '-'}{fmtMonto(m.monto)}</span>
          </div>
        )
      })}
    </div>
  )
})()}
```

**Step 4: Verificar TypeScript final**
```bash
cd apps/dashboard && npx tsc --noEmit
```
Expected: EXIT:0.

**Step 5: Verificar en browser**
- Abrir `/historial`
- Probar todos los tabs con datos reales
- Navegar día anterior/siguiente
- Cambiar a semana, mes, total
- Expandir tickets en Ventas POS

---

## Task 6: Actualizar Obsidian

**Files:**
- Modify: `C:\Users\ear21\OneDrive\Documents\Padel\Setpoint\12 - Estado de Implementación Dashboard.md`

**Step 1: Agregar la nueva entrada en la tabla de módulos del doc 12**

Agregar fila en la tabla de "Estado General por Módulo":
```
| Historial | `/historial` | ✅ Completo | Ventas POS, canchas, movimientos de caja, filtros día/semana/mes/total |
```

**Step 2: Agregar en la tabla de componentes una nueva sección**

```markdown
### Historial — `apps/dashboard/src/components/modules/historial/`

| Componente | Archivo | Descripción |
|------------|---------|-------------|
| Página principal | `HistorialPage.tsx` | PeriodSelector, KPIs, 4 tabs con listas expandibles |

Y en queries:
| `queries/historial.ts` | `getHistorialVentas`, `getHistorialCanchas`, `getHistorialMovimientos`, `getKPIsHistorial` |
```

---

## Verificación Final

1. `/historial` carga en sidebar bajo Administración
2. KPIs muestran datos reales según el período
3. Flechas de navegación cambian el período correctamente
4. Tab Ventas POS: lista con expandible (productos, IVA, descuento, métodos de pago)
5. Tab Canchas: lista con expandible (pista, duración, cliente, precio)
6. Tab Movimientos Caja: lista con color verde/rojo por tipo
7. Tab Todo: mezcla ordenada cronológicamente con badge de tipo
8. `tsc --noEmit` → EXIT:0
