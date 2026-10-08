# Módulo de Cancelaciones — Diseño

**Fecha:** 2026-04-06
**Estado:** Aprobado

---

## Contexto

Setpoint PMS necesita un módulo dedicado para gestionar dos tipos de cancelaciones:

1. **Cancelaciones de ítems POS** — productos en cuentas abiertas (pre-cobro) o ya cobrados (post-cobro con reembolso)
2. **Cancelaciones de reservas de pista** — reservas en estado `confirmada` canceladas sin penalización (política de costo pendiente de definir)

La tabla `cancelaciones` ya existe en la DB con tipos `pre_cobro` y `post_cobro`. Se necesitan columnas adicionales y cuatro stored procedures atómicos.

---

## Arquitectura

### Ruta y posición en sidebar
- Ruta: `/cancelaciones`
- Posición: entre Historial y Configuración en el sidebar

### Layout
```
┌─────────────────────────────────────────────────┐
│ CANCELACIONES       [Ítems POS] [Reservas]       │
│ Stats: total hoy · pendientes aprobación         │
├──────────────────────────┬──────────────────────┤
│  Lista (scroll)          │  Panel detalle       │
│  · Fila por cancelación  │  (seleccionar fila)  │
│  · Badge tipo/estado     │  Contexto completo   │
│  · Monto · Hora          │  Acción aprobación   │
└──────────────────────────┴──────────────────────┘
```

### Componentes nuevos
| Componente | Descripción |
|---|---|
| `CancelacionesPage` | Página principal, pestañas, stats, Realtime |
| `CancelacionesList` | Lista con filas clicables y badges |
| `CancelacionDetalle` | Panel derecho — contexto + acciones admin |
| `CancelacionItemModal` | Solicitar cancelación post-cobro desde POS |
| `CancelacionReservaModal` | Cancelar reserva — motivo + toggle notificación |
| `AprobacionModal` | Admin aprueba o rechaza con motivo |

---

## Flujo: Cancelación de Ítems POS

### Pre-cobro (`tipo = 'pre_cobro'`)
Ítem en cuenta abierta, sin cobrar aún.

1. Cualquier empleado cancela desde el POS (botón en ítem de cuenta abierta)
2. Se llama `rpc_cancelar_item_pre_cobro`
3. El `cuenta_item` pasa a estado `cancelado`
4. Si `fue_preparado = true` → se registra merma en `movimientos_stock`
5. Se inserta en `cancelaciones` con estado `ejecutada`
6. Sin impacto en caja

### Post-cobro (`tipo = 'post_cobro'`)
Cuenta ya cerrada y pagada.

1. Empleado **solicita** la cancelación → `cancelaciones.estado = pendiente`
2. Admin/propietario ve solicitud con badge naranja en `/cancelaciones`
3. Admin **aprueba**:
   - **Efectivo:** INSERT `movimientos_caja` tipo `egreso` en caja activa del turno → estado `reembolsada`
   - **Tarjeta:** registro sin movimiento de caja, nota "Gestionar en terminal BBVA" → estado `reembolsada`
4. Admin **rechaza** → estado `rechazada` + `rechazado_motivo`

### Estados de una cancelación
```
pre_cobro:   ejecutada  (inmediata)
post_cobro:  pendiente → aprobada → reembolsada
                       → rechazada
```

---

## Flujo: Cancelación de Reservas

### Restricciones
- Solo se pueden cancelar reservas en estado `confirmada`
- Reservas en `checkin` o `finalizada` no son cancelables
- Sin penalización por ahora (política de cancelación tardía se definirá en el futuro)

### Pasos
1. Empleado abre `CancelacionReservaModal` desde `/cancelaciones` o desde tarjeta en `/pistas`
2. Ingresa motivo (obligatorio) y toggle de notificación al cliente (UI only por ahora)
3. Se llama `rpc_cancelar_reserva` atómicamente:
   - `reservas.estado` → `cancelada`
   - INSERT en `cancelaciones` con `tipo = 'pre_cobro'`, `monto = 0`, `reserva_id`
   - Si la reserva tenía pago previo → se crea automáticamente registro `post_cobro` pendiente de reembolso
4. La pista queda disponible inmediatamente en el board de Pistas

### Panel detalle muestra
- Cliente · Pista · Fecha/hora original
- Empleado que canceló · Timestamp
- Motivo
- Si hubo pago previo: monto y estado del reembolso

---

## Base de Datos

### Migración requerida en `cancelaciones`

```sql
-- Nuevo enum de estados
CREATE TYPE cancelacion_estado AS ENUM ('ejecutada', 'pendiente', 'aprobada', 'reembolsada', 'rechazada');

-- Columnas nuevas
ALTER TABLE cancelaciones
  ADD COLUMN estado           cancelacion_estado NOT NULL DEFAULT 'ejecutada',
  ADD COLUMN reserva_id       uuid REFERENCES reservas(id),
  ADD COLUMN metodo_pago      text,
  ADD COLUMN rechazado_motivo text;
```

### Stored procedures atómicos

| RPC | Descripción |
|---|---|
| `rpc_cancelar_item_pre_cobro` | Cancela ítem + merma si fue preparado |
| `rpc_solicitar_cancelacion_post_cobro` | Crea registro pendiente de aprobación |
| `rpc_aprobar_cancelacion` | Reembolso + egreso en caja si efectivo |
| `rpc_cancelar_reserva` | Cancela reserva + registro cancelación |

---

## Realtime

Un canal único en `CancelacionesPage`:

```ts
supabase.channel('cancelaciones-rt')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'cancelaciones' }, refresh)
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'reservas' }, refresh)
  .subscribe()
```

---

## Queries (`queries/cancelaciones.ts`)

- `getCancelaciones(supabase, clubId, tipo, fecha)` — lista paginada con joins a `cuentas`, `cuenta_items`, `reservas`, `empleados`
- `getCancelacionStats(supabase, clubId)` — total hoy + pendientes aprobación

---

## Permisos

| Acción | Rol mínimo |
|---|---|
| Cancelar ítem pre-cobro | Cualquier empleado |
| Solicitar cancelación post-cobro | Cualquier empleado |
| Aprobar / rechazar cancelación | Admin o propietario |
| Cancelar reserva | Cualquier empleado |

---

## Fuera de alcance (por ahora)

- Política de penalización por cancelación tardía de reserva
- Notificaciones reales al cliente (toggle presente en UI pero sin implementar)
- Cancelación parcial de cuenta (solo ítem por ítem)
