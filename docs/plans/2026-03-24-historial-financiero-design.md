# Historial Financiero — Design Doc

**Fecha:** 2026-03-24
**Módulo:** `/historial`
**Estado:** Aprobado

---

## Objetivo

Módulo de auditoría financiera completa. Muestra todo el dinero que ha fluido por el sistema: tickets de venta POS, rentas de canchas y movimientos de caja, con filtros por período y detalle expandible por transacción.

---

## Diseño de Pantalla

```
┌─────────────────────────────────────────────────────────┐
│ HISTORIAL FINANCIERO          [Día] [Semana] [Mes] [Todo]│
│ Martes 24 de marzo 2026   ‹ ›                           │
├──────────┬──────────┬──────────┬──────────┐             │
│ Ventas   │ Canchas  │ Mov. Caja│ Ingresos │  ← KPIs     │
│ $3,420   │ $1,800   │ -$200    │ $5,020   │             │
│ 12 txns  │ 4 rentas │ 3 movs   │          │             │
├──────────┴──────────┴──────────┴──────────┘             │
│ [Ventas POS] [Canchas] [Caja] [Todo]  ← tabs            │
├─────────────────────────────────────────────────────────┤
│ 20:14  SP-170441  Efectivo+Tarjeta  Carlos R.  $156.60  │
│   ↳ Fruta Fresca x1 · Grip Overgrip x3                  │
│ 18:32  SP-093821  Efectivo          —          $290.00  │
└─────────────────────────────────────────────────────────┘
```

---

## Componentes

### Header + Período
- Pills: `Día` | `Semana` | `Mes` | `Total`
- Navegación con flechas `‹ ›` (día anterior/siguiente en modo Día, semana en modo Semana, mes en modo Mes)
- En modo Total: sin flechas

### KPIs (4 tarjetas)
| KPI | Fuente | Cálculo |
|-----|--------|---------|
| Ventas POS | `cuentas` WHERE estado='pagada' | SUM(total) |
| Canchas | `reservas` WHERE estado='finalizada' | SUM(precio) |
| Mov. Caja | `movimientos_caja` | SUM(ingresos+fondos) - SUM(egresos+retiros) |
| Total Ingresos | calculado | Ventas + Canchas |

### Tabs
- `Ventas POS` — lista de cuentas pagadas
- `Canchas` — lista de reservas finalizadas
- `Movimientos Caja` — lista de movimientos
- `Todo` — los 3 tipos mezclados, orden cronológico

### Detalle expandible por tipo

**Ventas POS:**
- Hora · Número ticket · Método(s) de pago con badge color · Cajero (turno activo al momento) · Monto total
- Expandido: lista de productos (nombre, cantidad, precio unitario, subtotal), cliente si aplica, subtotal / descuento / IVA / total

**Canchas:**
- Hora inicio · Pista · Rango hora (09:00–10:00) · Duración · Cliente si aplica · Precio
- Expandido: estado de reserva, tarifa/hora, notas si las hay

**Movimientos Caja:**
- Hora · Tipo (ingreso/egreso/fondo/retiro) badge colored · Concepto · Cajero · Monto
- Verde para ingresos/fondos, rojo para egresos/retiros
- No hay expandible (toda la info está en la fila)

---

## Arquitectura Técnica

### Nueva query: `queries/historial.ts`

```typescript
export interface VentaPOS { id, numero_ticket, created_at, total, subtotal, iva, descuento_total, metodos_pago, cliente_nombre, items[] }
export interface RentaCancha { id, pista_nombre, hora_inicio, hora_fin, precio, cliente_nombre, estado, created_at }
export interface MovimientoCajaHistorial { id, tipo, concepto, monto, cajero_nombre, created_at }

getHistorialVentas(supabase, clubId, desde, hasta): Promise<VentaPOS[]>
getHistorialCanchas(supabase, clubId, desde, hasta): Promise<RentaCancha[]>
getHistorialMovimientos(supabase, clubId, desde, hasta): Promise<MovimientoCajaHistorial[]>
getKPIsHistorial(supabase, clubId, desde, hasta): Promise<KPIs>
```

### Nueva ruta: `app/(dashboard)/historial/page.tsx`
- Server component mínimo que renderiza `HistorialPage`

### Nuevo componente: `components/modules/historial/HistorialPage.tsx`
- Toda la lógica de estado (período, tab activo, datos)
- Subcomponentes: `PeriodSelector`, `KPICards`, `TabBar`, `VentasPOSList`, `CanchasList`, `MovimientosList`

### Sidebar
- Agregar `{ href: '/historial', label: 'Historial', icon: History }` en `ADMIN_ITEMS` de `Sidebar.tsx`

### TopBar
- Agregar `'/historial': { title: 'Historial Financiero', search: '', variant: 'terminal' }` en `MODULE_CONFIG`

---

## Sin cambios en DB
Todo usa tablas existentes: `cuentas`, `cuenta_items`, `pagos`, `productos`, `reservas`, `pistas`, `clientes`, `movimientos_caja`, `cajas`, `turnos`, `empleados`.

La única join no trivial es obtener el cajero de una venta: `cuentas.created_at` → buscar el `turno` activo en ese momento → `empleado.nombre`. Se hace en query SQL con subselect o join por rango de tiempo.

---

## Fases de Implementación

### Fase 1 — Query + datos
- `queries/historial.ts` con las 4 funciones
- Verificación con datos reales de Supabase

### Fase 2 — Estructura de página
- Route `app/(dashboard)/historial/page.tsx`
- `HistorialPage.tsx` con PeriodSelector + KPIs (datos reales)
- Sidebar + TopBar actualizados

### Fase 3 — Listas por tab
- Tab `Ventas POS` con expandible completo
- Tab `Canchas` con expandible
- Tab `Movimientos Caja`
- Tab `Todo` unificado

---
*Design doc — Historial Financiero v1.0 | 2026-03-24*
