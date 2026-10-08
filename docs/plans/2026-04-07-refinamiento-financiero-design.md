# Refinamiento Financiero — Design Doc

**Fecha:** 2026-04-07  
**Inspiración:** Toast POS, Lightspeed Restaurant, Square POS  
**Objetivo:** Refinar el flujo de dinero completo de Setpoint adaptando las mejores prácticas de sistemas PMS reconocidos, sin reestructurar lo existente.

---

## Contexto

Setpoint PMS opera con múltiples roles activos simultáneamente (cajero, mesero, cocina, barra, admin). El flujo de dinero tiene una base sólida pero carece de:
- Categorización real de movimientos de caja
- Permisos granulares por acción (hoy son roles rígidos)
- Panel de arqueo detallado al cierre
- Shift review obligatorio por empleado
- Alertas de stock en tiempo real en el POS

---

## Features en orden de implementación

### 1. Money In/Out categorizado (base de todo)

**Problema:** `movimientos_caja.concepto` es texto libre. No se puede filtrar ni agrupar por tipo de movimiento real.

**Solución:** Nuevo enum `movimiento_categoria` con valores:
- `fondo_inicial` — apertura de turno
- `venta` — ingreso por venta POS
- `cancha` — ingreso por renta de pista
- `reembolso` — egreso por cancelación aprobada
- `retiro` — corte parcial o extracción
- `petty_cash` — gastos menores del negocio
- `propina` — propina recibida
- `ajuste` — corrección manual (notas obligatorias)
- `otro` — libre con descripción requerida

**Cambios:**
- Migración: agregar columna `categoria movimiento_categoria` a `movimientos_caja`
- Migración: backfill de registros existentes según `tipo` actual
- `CashMovementModal`: selector de categoría reemplaza concepto libre. Notas son opcionales excepto para `ajuste` y `otro`
- `queries/caja.ts`: incluir `categoria` en todas las queries de movimientos
- `CajaPage` + `HistorialPage`: mostrar categoría en la lista de movimientos

**Archivos editados:** `CashMovementModal.tsx`, `queries/caja.ts`, `CajaPage.tsx`, `HistorialPage.tsx`  
**Migración:** Sí

---

### 2. Permisos granulares por acción

**Problema:** Los permisos están hardcodeados como `user.rol === 'admin'` en el frontend. No son configurables por club.

**Solución:** Tabla `permisos_rol (club_id, rol, accion, permitido)` en Supabase. Hook `usePermiso('accion')` en frontend.

**Acciones controlables:**

| Acción | Default |
|---|---|
| `descuento_manual` | admin+ |
| `cancelacion_sin_aprobacion` | cajero+ |
| `cancelacion_post_cobro` | cajero+ |
| `aprobar_cancelacion` | admin+ |
| `movimiento_caja` | cajero+ |
| `ajuste_stock` | admin+ |
| `ver_reportes` | admin+ |
| `abrir_cerrar_turno` | cajero+ |

**Cambios:**
- Migración: tabla `permisos_rol` con seed de defaults por rol
- `useAppStore`: agregar `permisos: string[]` al estado del usuario
- `AuthProvider`: cargar permisos al login y persistir en Zustand
- Nuevo hook `usePermiso(accion: string): boolean`
- `/configuracion`: nueva sección "Permisos por Rol" con toggles (solo propietario)
- Reemplazar todos los `user.rol === 'admin'` por `usePermiso('accion')`

**Archivos editados:** `useAppStore.ts`, `AuthProvider.tsx`, `configuracion/ConfiguracionPage.tsx`, todos los módulos con checks de rol  
**Archivos nuevos:** `hooks/usePermiso.ts`  
**Migración:** Sí

---

### 3. Reconciliation Dashboard / Arqueo mejorado

**Problema:** El cierre de turno solo pide el conteo de efectivo físico. No hay desglose por categoría ni cálculo automático del efectivo esperado.

**Solución:** Paso 1 en `CloseShiftModal` — panel de arqueo detallado antes del conteo.

**Panel muestra:**
- Ingresos: ventas efectivo, ventas tarjeta, canchas, propinas
- Egresos: reembolsos, retiros, petty cash
- Neto esperado total
- Fondo inicial
- Efectivo esperado en caja (= ingresos efectivo - egresos efectivo + fondo)
- Campo de conteo manual con diferencia en tiempo real

**Cambios:**
- `CloseShiftModal`: convertir en wizard de 2 pasos (arqueo → conteo → confirmar)
- `queries/caja.ts`: nueva función `getArqueoTurno(cajaId)` que agrupa movimientos por categoría
- El cierre guarda `cerrado_confirmado: true` y `arqueo_snapshot: jsonb` en `cajas`

**Archivos editados:** `CloseShiftModal.tsx`, `queries/caja.ts`  
**Migración:** Sí — campos `cerrado_confirmado` y `arqueo_snapshot` en `cajas`

---

### 4. Shift Review obligatorio

**Problema:** No existe un resumen personal por empleado al cerrar turno. Las discrepancias no se detectan hasta el día siguiente.

**Solución:** Paso 0 en el flujo de cierre — el cajero ve su actividad personal antes del arqueo.

**Vista muestra:**
- Transacciones realizadas por ese empleado
- Ventas totales del empleado
- Descuentos aplicados
- Cancelaciones solicitadas / aprobadas / pendientes
- Movimientos de caja registrados por ese empleado
- Advertencia si hay cancelaciones pendientes de aprobación

**Flujo completo de cierre:** Shift Review → Arqueo → Confirmar cierre

**Cambios:**
- `CloseShiftModal`: agregar paso 0 de shift review (wizard 3 pasos total)
- `queries/caja.ts`: nueva función `getShiftReview(cajaId, empleadoId)` 
- Migración: campo `shift_review_at timestamptz` en `turnos`
- `/configuracion`: toggle "Shift review obligatorio" por rol

**Archivos editados:** `CloseShiftModal.tsx`, `queries/caja.ts`, `ConfiguracionPage.tsx`  
**Migración:** Sí — campo `shift_review_at` en `turnos`

---

### 5. Alertas de stock bajo en POS

**Problema:** Nadie se entera cuando un producto se acaba hasta que se intenta vender.

**Solución:** Badges visuales en ProductGrid + banner en TopBar + sección en Inventario. Todo via Supabase Realtime.

**Tres puntos de alerta:**
1. **ProductGrid**: badge amarillo "Stock bajo" cuando `stock_actual <= stock_minimo`, badge rojo + desactivado cuando `stock_actual = 0`
2. **TopBar**: indicador `⚠ N productos con stock bajo` visible para admin/cajero. Click abre panel lateral
3. **InventarioPage**: sección destacada al inicio con productos bajo mínimo ordenados por urgencia

**Cambios:**
- Migración: campo `stock_minimo integer DEFAULT 5` en `productos` (si no existe)
- `queries/inventario.ts`: nueva función `getProductosBajoStock(supabase, clubId)`
- `POSPage`: agregar badge condicional en ProductGrid basado en `stock_actual` y `stock_minimo`
- `TopBar`: recibir `alertasStock` count + panel lateral de alertas con Realtime
- `InventarioPage`: sección de "Bajo stock" al inicio de la página

**Archivos editados:** `ProductGrid.tsx`, `TopBar.tsx`, `InventarioPage.tsx`, `queries/inventario.ts`  
**Migración:** Posible — verificar si `stock_minimo` existe en `productos`

---

## Resumen

| # | Feature | Archivos nuevos | Migraciones |
|---|---|---|---|
| 1 | Money In/Out categorizado | 0 | 1 |
| 2 | Permisos granulares | 1 hook | 1 |
| 3 | Reconciliation dashboard | 0 | 1 |
| 4 | Shift Review | 0 | 1 |
| 5 | Alertas stock bajo | 0 | Posible |

**Total:** 4-5 migraciones, 1 archivo nuevo, ~15 archivos editados.

## Dependencias

```
1. Money In/Out categorizado
        ↓
2. Permisos granulares
        ↓
3. Reconciliation dashboard  ← requiere categorías de (1)
        ↓
4. Shift Review              ← requiere reconciliation de (3)
        ↓
5. Alertas stock bajo        ← independiente, menor riesgo
```
