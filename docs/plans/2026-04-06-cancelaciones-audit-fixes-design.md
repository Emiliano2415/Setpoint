# Cancelaciones Audit Fixes — Design

## Problem

The cancelaciones module has 6 gaps that prevent end-to-end financial integrity:

1. **CancelacionDetalle passes `cajaId: null` always** — efectivo refunds never create a `movimientos_caja` egress
2. **Historial KPIs don't subtract approved refunds** — revenue is inflated
3. **`getCajaStats` ignores egresos** — caja panel shows gross sales only
4. **Cancelled items not marked visually in Historial** — no visual indicator
5. **No realtime in Caja for new movimientos** — stale data after refunds
6. **No duplicate validation in `rpc_solicitar_cancelacion_post_cobro`** — same item can be cancelled multiple times

## Design

### DB Migration (1 migration)

- Add duplicate check to `rpc_solicitar_cancelacion_post_cobro`: reject if `cancelaciones` already has a `pendiente`, `aprobada`, or `reembolsada` row for that `cuenta_item_id`
- Add `rpc_get_reembolsos_periodo(p_club_id, p_desde, p_hasta)` helper that sums `cancelaciones.monto` where `estado = 'reembolsada'` in the date range

### Frontend Changes (6 files edited, 0 new files)

**CancelacionesPage.tsx + CancelacionDetalle.tsx (Gap 1):**
- Fetch `getCajaActiva` in CancelacionesPage, pass `cajaId` prop to CancelacionDetalle
- CancelacionDetalle uses real `cajaId` in `aprobarCancelacion` call
- Show warning when no caja is open and method is efectivo

**queries/caja.ts + CajaPage.tsx (Gap 3 + 5):**
- Add `totalEgresos` to `CajaStats`, accumulate egresos in loop
- Show "Reembolsos" KPI card in red when > 0
- Add realtime subscription to `movimientos_caja` INSERT events

**queries/historial.ts + HistorialPage.tsx (Gap 2 + 4):**
- Add `estado` to `cuenta_items` select and `VentaPOS.items` type
- Call `rpc_get_reembolsos_periodo` in load, subtract from totalIngresos
- Show "Reembolsos" KPI card in red when > 0
- Cancelled items: line-through + opacity + "CANCELADO" badge, hide "Cancelar" button
