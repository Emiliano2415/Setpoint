# Setpoint PMS — Auditoría QA Completa + Plan de Flujos Funcionales

## Context

Se realizó una revisión completa de los 9 módulos del dashboard (`/apps/dashboard`). Todos los módulos cargan y muestran datos reales de Supabase. Se corrigieron bugs críticos de producción (enums de DB incorrectos, timezone, hydration mismatch, CSP). El plan ahora cubre la implementación completa de flujos funcionales por prioridad SaaS global, con control total de cada módulo.

---

## QA Status — Evidencia por Módulo

| Módulo | Estado | Datos Reales | Bugs Corregidos |
|--------|--------|--------------|-----------------|
| ✅ Login | Funciona | Redirige a /pos | — |
| ✅ POS | Funciona | 28 productos, 3 cats, IVA 16% | subcategoria→descripcion, hydration |
| ✅ Pistas | Funciona | 3 ocupadas, 5 disponibles, timer live | enum reservas, timezone |
| ✅ Comandas | Funciona | 5 comandas, kanban avance | timezone UTC→local |
| ✅ Inventario | Funciona | 28 prods, badges OK/Crítico | — |
| ✅ Clientes | Funciona | 5 clientes, filtros, stats | — |
| ✅ Caja | Funciona | $3,750 ventas, desglose real | turno label dinámico |
| ✅ Personal | Funciona | Carlos Rodríguez / Admin | — |
| ✅ Reportes | Funciona | $16,580, 43 trans, ocupación x pista | enum+timezone+label Mant. |
| ✅ Configuración | Funciona | Form completo + save a DB | — |

---

## Auditoría de Botones — Estado Actual

### 🔴 Botones sin handler (críticos)
| Módulo | Botón | Archivo | Prioridad |
|--------|-------|---------|-----------|
| Pistas | "Nueva Reservación" | `PistasPage.tsx:149` | P0 |
| Pistas | "Reservar" (pista disponible) | `CourtCard.tsx` | P0 |
| Pistas | "Detalle →" (pista ocupada) | `CourtCard.tsx` | P0 |
| Caja | "Cerrar Turno y Arqueo" | `CajaPage.tsx` | P0 |
| POS | Cobrar / Efectivo / Tarjeta | `TicketPanel.tsx` | P0 |
| Caja | "Movimiento de Caja" | `CajaPage.tsx` | P1 |
| Caja | "Ver Historial de Cierres" | `CajaPage.tsx` | P2 |
| Caja | "Exportar Reporte" | `CajaPage.tsx` | P2 |
| Reportes | "Exportar PDF" | `ReportesPage.tsx` | P2 |
| Reportes | "Exportar Excel" | `ReportesPage.tsx` | P2 |

### 🟡 Módulos read-only (sin CRUD)
| Módulo | Falta | SaaS Estándar |
|--------|-------|---------------|
| Inventario | CRUD completo: agregar/editar/ajustar/eliminar productos | Square, Lightspeed ✓ |
| Clientes | Nuevo cliente / ficha detalle | Mindbody, Pike13 ✓ |
| Empleados | CRUD empleados, turnos | Deputy, 7shifts ✓ |
| POS | CRUD menú: agregar/editar/activar/desactivar productos | Square POS ✓ |

---

## Flujos Ideales por Módulo (Estándar SaaS Global)

### 1. POS — Referencia: Square POS, Toast POS

**Flujo de venta (ya parcialmente implementado):**
```
[Categoría] → [Click producto → ticket]
→ [+/-] → [Descuento socio -10%]
→ [Cobrar $XXX] → Modal selección método:
  · Efectivo → input "Recibido $___" → muestra cambio → Confirmar
  · Tarjeta → directo → Confirmar
→ createCuenta() + createPago() → estado='pagada' → ticket limpio
```

**Registro de tickets cobrados (historial):**
```
Header: botón "Historial" → panel lateral o modal
→ Lista de cuentas estado='pagada' del turno actual
→ ID ticket, hora, monto, método de pago
→ Click ticket → detalle de items
```

**Gestión del menú (nueva funcionalidad):**
```
Header: botón "Gestionar Menú" (solo admin/propietario)
→ Modal/página con lista completa de productos
→ Por cada producto:
  · Toggle activo/inactivo (aparece o desaparece del POS)
  · Editar precio (inline input)
  · Editar nombre / descripción
  · Asignar categoría
→ Botón "Agregar Producto" → form: nombre, precio, categoría, IVA, stock mín
→ Botón "Eliminar" (soft delete: activo=false)
→ Guardar → UPDATE productos en Supabase
```

### 2. Pistas — Referencia: CourtReserve, Playtomic, Matchi

**Click en cancha disponible → Panel/Modal de cuenta completa:**
```
Click CourtCard DISPONIBLE:
→ Modal "Pista X — Disponible"
  · [Iniciar Sesión] → crea reserva estado='checkin' con hora ahora
    - Buscar cliente (opcional)
    - Precio según franja horaria
    - Timer inicia inmediatamente
  · [Reservar Futuro] → form: cliente, fecha, hora, duración
    - INSERT reservas estado='confirmada'
  · [Marcar Mantenimiento] → UPDATE pistas activa=false / agregar nota
```

**Click en cancha OCUPADA → Cuenta completa de la cancha:**
```
Click CourtCard OCUPADA:
→ Modal "Pista X — Cuenta Activa"
  Sección INFO:
  · Titular: nombre cliente (o "Sin asignar")
  · Inicio: 20:00 | Tiempo transcurrido: 2h 41m | Tarifa: $450/hr
  · Costo acumulado: $1,200
  Sección CONSUMOS (de comandas):
  · Lista de ítems pedidos en esta cancha: "2x Isotónico $90", "1x Cerveza $80"
  · Subtotal consumos: $170
  Sección TOTAL:
  · Tiempo: $1,200 | Consumos: $170 | Total: $1,370
  Botones:
  · [Agregar Consumo] → abre mini-POS para agregar items a esta cuenta
  · [Extender Tiempo] → +30min / +1h
  · [Finalizar Sesión] → UPDATE estado='finalizada', genera cuenta para cobro
  · [Cobrar Ahora] → flujo de pago directo
```

**Click en cancha RESERVADA (confirmada, aún no inicia):**
```
→ Modal "Pista X — Reservada para las HH:MM"
  · Titular, hora, duración, precio acordado
  · [Check-in Anticipado] → UPDATE estado='checkin', timer inicia
  · [Cancelar Reserva] → UPDATE estado='cancelada', pista vuelve libre
  · [Editar] → modificar hora/cliente/precio
```

**Gestión de canchas (panel admin):**
```
Header: botón "Gestionar Canchas" (solo admin)
→ Modal/panel con lista de las 8 canchas
→ Por cada cancha:
  · Toggle "Activa / Inactiva" (desaparece del grid)
  · Toggle "En Mantenimiento" (aparece con badge amarillo 🔧)
  · Editar nombre y tipo (Indoor/Outdoor/Cubierta)
  · Reordenar (drag o flechas arriba/abajo)
→ Botón "Agregar Cancha" → nombre, tipo, orden → INSERT pistas
→ Botón "Eliminar" (solo si sin reservas activas)
```

### 3. Comandas — Referencia: Toast KDS, Square KDS ✅ FLUJO BÁSICO COMPLETO

**Mejora: filtro por fecha para no saturar el kanban:**
```
Header: toggle "Solo hoy" (default ON) | "Todo el día" | buscar por ticket
→ Estado 'entregado': auto-ocultar después de 30 min de entregado
→ Badge en columna "Entregado" solo muestra count, cards colapsadas
→ Click card "Entregado" → readonly, no avanza más
```

### 4. Inventario — Control Total

**Flujo completo:**
```
[Ver lista] → filtrar por categoría, buscar por nombre
Header: botón "Agregar Producto" → Modal:
  · Nombre, Precio, Categoría, IVA %, Stock inicial, Stock mínimo
  · INSERT productos
→ Cada row: botones inline (hover):
  · ✏ Editar → modal con campos editables → UPDATE productos
  · 📦 Ajustar Stock → modal: tipo (entrada/ajuste/merma), cantidad, motivo
    · INSERT movimientos_stock + UPDATE stock_actual
  · 👁 Activar/Desactivar → toggle activo → UPDATE activo
  · 🗑 Eliminar → solo si sin ventas → soft delete (activo=false)
→ Tab "Movimientos" → historial de entradas/salidas/ajustes
```

### 5. Clientes — CRM Básico

**Flujo:**
```
Header: botón "Nuevo Cliente"
→ Modal: nombre*, teléfono, email, categoría (Regular/Silver/Gold)
→ INSERT clientes
→ Click fila cliente → Modal "Ficha Cliente":
  · Stats: visitas, ticket medio, última visita
  · Historial de cuentas pagadas (fecha, monto, método)
  · Editar datos (nombre, tel, email, categoría)
  · Botón "Ver en POS" → abre POS con este cliente asignado
```

### 6. Caja — Control Financiero Completo

**Flujo cierre de turno:**
```
[Ver turno + stats]
→ "Movimiento de Caja" → Modal:
  · Tipo: Entrada (fondo) / Salida (gasto/retiro)
  · Concepto (text)
  · Monto
  · INSERT movimientos_caja → stats se actualizan
→ "Cerrar Turno y Arqueo" → Modal wizard 2 pasos:
  Paso 1 — Conteo de efectivo:
  · Input: "Efectivo contado en caja: $___"
  · Sistema muestra: Efectivo esperado (ventas + entradas - salidas)
  Paso 2 — Resumen:
  · Esperado: $1,500 | Contado: $1,480 | Diferencia: -$20
  · Si diferencia > tolerancia → badge amarillo "Diferencia de $20"
  · [Confirmar Cierre] → UPDATE cajas + UPDATE turnos.fin = now()
  · Toast "Turno cerrado — Diferencia $20"
→ "Ver Historial" → lista de cierres: fecha, turno, cajero, total, diferencia
→ Registro de tickets (nuevo):
  · Panel / tab "Tickets del Turno"
  · Lista de cuentas pagadas con ID, hora, monto, método
  · Badge por método: verde efectivo, azul tarjeta
  · Click ticket → detalle de items
```

### 7. Empleados (P3 — Baja prioridad)
```
[Ver lista] + CRUD básico
→ Futuro: asignación turnos, permisos granulares
```

### 8. Reportes

**Export funcional:**
```
"Exportar PDF" → window.print() con @media print stylesheet
"Exportar Excel" → CSV generado en browser:
  · Genera texto CSV con KPIs + top productos + ocupación
  · Blob download como "setpoint-reporte-YYYY-MM-DD.csv"
```

### 9. Configuración ✅ COMPLETO
```
Datos del Club / Métodos de Pago / Precios / Parámetros → todos guardan a DB ✓
```

---

## Plan de Implementación — 5 Fases

### 🔴 FASE 1 — Core Operativo (P0)
*Sin estas funciones el negocio no puede operar*

**1A. Cobrar tickets en POS (verificar flujo completo)**
- Verificar que `createCuenta()` + `createPago()` funcionan end-to-end
- Modal de pago en efectivo con cálculo de cambio
- Estado cuenta → `'pagada'`, ticket se limpia
- Archivos: `TicketPanel.tsx`, `queries/pos.ts`

**1B. Historial de tickets cobrados**
- Panel deslizable o modal desde POS: "Tickets del Turno"
- Query: `cuentas` estado='pagada' + turno_id actual
- Lista: ID, hora, monto, método
- Archivos: nuevo `TicketHistory.tsx`, `queries/pos.ts`

**1C. Modal de reserva (Pistas)**
- `ReservationModal.tsx` — form completo
- `CourtCard.tsx` — onClick "Reservar" + onClick "Nueva Reservación"
- `PistasPage.tsx` — state del modal
- Función existente: `createReserva()` en `queries/pistas.ts`

**1D. Panel de cuenta activa por cancha (Pistas)**
- `CourtAccountModal.tsx` — modal completo al click de cancha ocupada
- Muestra: titular, timer, consumos de comandas, total acumulado
- Botones: Finalizar Sesión, Extender, Cobrar
- Query: join reservas + cuentas + comanda_items por pista

**1E. Cierre de turno (Caja)**
- `CloseShiftModal.tsx` — wizard 2 pasos
- Efectivo esperado vs. contado, diferencia
- `queries/caja.ts` — agregar `closeCaja()`

---

### 🟡 FASE 2 — Gestión de Canchas + Movimientos

**2A. Gestión completa de canchas**
- Modal "Gestionar Canchas" accesible desde header de Pistas
- Activar/desactivar, mantenimiento, renombrar, reordenar
- Botón agregar cancha → INSERT pistas
- Soft-delete (solo sin reservas activas)
- Archivos: nuevo `CourtManagementModal.tsx`, `queries/pistas.ts`

**2B. Movimiento de Caja**
- Modal rápido: tipo, concepto, monto
- INSERT movimientos_caja
- Stats de caja actualizan post-movimiento
- Archivos: nuevo `CashMovementModal.tsx`, `queries/caja.ts`

**2C. Gestión del menú POS**
- Modal desde header POS: lista con toggle activo, editar precio inline
- Agregar producto nuevo (form completo)
- Archivos: nuevo `MenuManagementModal.tsx`, `queries/pos.ts`

---

### 🟢 FASE 3 — CRM + Inventario Completo

**3A. Nuevo cliente + ficha**
- Botón "+" en header Clientes → `NewClientModal.tsx`
- Click fila → `ClientDetailModal.tsx` con historial de cuentas
- Archivos: `ClientesPage.tsx`, nuevos modales, `queries/clientes.ts`

**3B. Inventario CRUD completo**
- Botón "Agregar Producto", editar inline, ajuste de stock
- Modal ajuste: tipo (entrada/merma/ajuste), cantidad, motivo
- INSERT `movimientos_stock` + UPDATE `stock_actual`
- Archivos: `InventarioPage.tsx`, nuevos modales, `queries/inventario.ts`

---

### 🔵 FASE 4 — Exportación + Historiales

**4A. Historial de turnos/cierres (Caja)**
- Panel "Historial de Cierres" con lista paginada
- Archivos: nuevo `ShiftHistoryPanel.tsx`, `queries/caja.ts`

**4B. Exportar Reportes**
- PDF: `window.print()` + CSS `@media print`
- CSV: Blob download en browser sin dependencias externas
- Archivos: `ReportesPage.tsx`

**4C. Comandas — Ocultar entregados automáticamente**
- Filtrar comandas 'entregado' con `created_at > hace 30 min`
- Toggle manual "Mostrar todos"
- Archivos: `ComandasPage.tsx`, `queries/comandas.ts`

---

### 🟣 FASE 5 — Cancha como Centro de Operaciones (UX Premium)

**5A. Click en cancha → cuenta completa integrada**
Cuando se hace click en una cancha ocupada, el modal muestra:

```
┌─────────────────────────────────────────────┐
│ PISTA 1 — En Sesión                        │
├─────────────────────────────────────────────┤
│ Titular: Carlos Rodríguez                  │
│ Inicio: 20:00 | Tiempo: 2h 41m ⏱           │
│ Tarifa: $450/hr | Acumulado tiempo: $1,200  │
├─────────────────────────────────────────────┤
│ CONSUMOS                                    │
│ • 2x Isotónico 600ml .............. $90    │
│ • 1x Cerveza Artesanal ............ $80    │
│ Total consumos: $170                        │
├─────────────────────────────────────────────┤
│ TOTAL A PAGAR: $1,370                       │
├─────────────────────────────────────────────┤
│ [Agregar Consumo] [Extender +1h]           │
│ [Finalizar Sesión] [Cobrar $1,370]         │
└─────────────────────────────────────────────┘
```

**5B. Check-in desde cancha reservada**
- Click cancha 'confirmada' → ver detalles → [Check-in] → estado='checkin', timer inicia

**5C. Estado de mantenimiento con nota**
- Cancha puede marcarse como mantenimiento con texto descriptivo
- Aparece con badge 🔧 amarillo y nota visible en el card

---

## Archivos Críticos a Crear/Modificar

```
apps/dashboard/src/
├── components/modules/
│   ├── pistas/
│   │   ├── PistasPage.tsx              ← MODIFICAR: modal state + handlers
│   │   ├── CourtCard.tsx               ← MODIFICAR: onClick con pista + tipo
│   │   ├── ReservationModal.tsx        ← CREAR (Fase 1C)
│   │   ├── CourtAccountModal.tsx       ← CREAR (Fase 1D + Fase 5A)
│   │   └── CourtManagementModal.tsx    ← CREAR (Fase 2A)
│   ├── caja/
│   │   ├── CajaPage.tsx               ← MODIFICAR: onClick handlers
│   │   ├── CloseShiftModal.tsx         ← CREAR (Fase 1E)
│   │   ├── CashMovementModal.tsx       ← CREAR (Fase 2B)
│   │   └── ShiftHistoryPanel.tsx       ← CREAR (Fase 4A)
│   ├── pos/
│   │   ├── TicketPanel.tsx            ← MODIFICAR: modal cambio efectivo
│   │   ├── TicketHistory.tsx          ← CREAR (Fase 1B)
│   │   └── MenuManagementModal.tsx    ← CREAR (Fase 2C)
│   ├── clientes/
│   │   ├── ClientesPage.tsx           ← MODIFICAR: botón nuevo + click row
│   │   ├── NewClientModal.tsx          ← CREAR (Fase 3A)
│   │   └── ClientDetailModal.tsx       ← CREAR (Fase 3A)
│   ├── inventario/
│   │   ├── InventarioPage.tsx         ← MODIFICAR: botones inline + header
│   │   ├── ProductFormModal.tsx        ← CREAR (Fase 3B)
│   │   └── StockAdjustModal.tsx        ← CREAR (Fase 3B)
│   └── reportes/
│       └── ReportesPage.tsx           ← MODIFICAR: export handlers
└── lib/supabase/queries/
    ├── pistas.ts                      ← YA EXISTE createReserva() ✓
    ├── caja.ts                        ← MODIFICAR: closeCaja(), cashMovement()
    ├── pos.ts                         ← MODIFICAR: getTicketsDelTurno()
    ├── clientes.ts                    ← MODIFICAR: createCliente(), updateCliente()
    └── inventario.ts                  ← MODIFICAR: CRUD completo, movimientos
```

---

## DB — Funciones Reutilizables Existentes

| Función | Archivo | Descripción |
|---------|---------|-------------|
| `createReserva()` | `queries/pistas.ts:72` | INSERT reserva ✓ |
| `updateReservaEstado()` | `queries/pistas.ts:86` | UPDATE estado reserva ✓ |
| `getActiveReserva()` | `queries/pistas.ts:60` | GET reserva activa por pista ✓ |
| `getCajaActiva()` | `queries/caja.ts` | GET caja del turno ✓ |
| `getCajaStats()` | `queries/caja.ts` | Stats del turno ✓ |
| `getClientes()` | `queries/clientes.ts` | Lista clientes (para búsqueda modal) ✓ |
| `getAllActiveProducts()` | `queries/pos.ts` | Lista productos activos ✓ |
| `getProductsByCategory()` | `queries/pos.ts` | Productos por categoría ✓ |

---

## Verificación por Fase

### Fase 1 — Core Operativo
1. POS: seleccionar productos → cobrar en efectivo → modal muestra cambio → ticket se limpia → aparece en historial
2. POS: botón "Historial" → lista de tickets cobrados del turno
3. Pistas: click "Reservar" → modal → confirmar → pista cambia a reservada en grid
4. Pistas: click pista ocupada → modal cuenta completa con consumos y total
5. Caja: "Cerrar Turno" → modal → contar efectivo → confirmar → toast "✓"

### Fase 2 — Gestión Canchas + Movimientos
1. Pistas: "Gestionar Canchas" → toggle mantenimiento → cancha muestra badge 🔧
2. Pistas: agregar cancha nueva → aparece en grid
3. Caja: "Movimiento de Caja" → registrar entrada $500 → stats actualizan
4. POS: "Gestionar Menú" → desactivar producto → desaparece del grid

### Fase 3 — CRM + Inventario
1. Clientes: "+" → crear cliente → aparece en tabla
2. Clientes: click fila → ficha con historial de visitas
3. Inventario: ajustar stock → movimiento registrado → stock actualizado

### Fase 4 — Exportación
1. Reportes: "Exportar PDF" → dialog de impresión
2. Reportes: "Exportar Excel/CSV" → archivo descargado

### Fase 5 — UX Premium Pistas
1. Click cancha ocupada → modal con titular, timer, consumos, total
2. Click cancha reservada → [Check-in] → timer inicia
3. Cancha marcada mantenimiento → visible con nota

---

---

### 🟠 FASE 6 — Módulo de Descuentos y Membresías (nuevo módulo)

**Referente SaaS**: Mindbody Memberships, Square Loyalty, Lightspeed Retail discounts

**Objetivo**: Crear, administrar y aplicar reglas de descuento por categoría de socio u otras condiciones. Reemplaza el descuento hardcoded del -10% en el POS por un sistema configurable y auditable.

#### 6A. Nuevo módulo `/descuentos` en Configuración

Ubicación sugerida: dentro de `/configuracion` como sección adicional, o en sidebar bajo Administración como link `/descuentos`.

**Vista principal:**
```
┌──────────────────────────────────────────────────────────┐
│ Descuentos y Membresías                                   │
│ Reglas aplicadas automáticamente según categoría de socio │
├──────────────────────────────────────────────────────────┤
│ Stats: 3 reglas activas | $1,240 en descuentos aplicados  │
├──────────────────────────────────────────────────────────┤
│ [+ Nueva Regla]                                          │
├──────────────────────────────────────────────────────────┤
│ Nombre          Categoría   Tipo      Valor  Aplica a    │
│ Descuento Socio Socio       %         10%    Todo        │
│ VIP Weekend     Gold        %         15%    Bebidas     │
│ Descuento Noche Silver      Monto fijo $50   Pistas      │
└──────────────────────────────────────────────────────────┘
```

**Modal crear/editar regla:**
```
Nombre de la regla: [_______________]
Categoría de cliente: [Todos / Socio / Gold / Silver / Regular]
Tipo de descuento:
  ○ Porcentaje (%) → input valor: [10]%
  ○ Monto fijo ($) → input valor: [$50]
Aplica a:
  ○ Todo el ticket
  ○ Categoría de producto → [Bebidas / Alimentos / Renta de Equipo]
  ○ Producto específico → buscador
Activo: [toggle]
[Guardar regla]
```

#### 6B. DB — Tabla `descuentos_reglas`

```sql
CREATE TABLE descuentos_reglas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid REFERENCES clubes(id),
  nombre text NOT NULL,
  tipo text CHECK (tipo IN ('porcentaje', 'monto_fijo')) NOT NULL,
  valor numeric NOT NULL,           -- 10 para 10%, 50 para $50
  aplica_a text CHECK (aplica_a IN ('todo', 'categoria_cliente', 'categoria_producto', 'producto')) DEFAULT 'todo',
  categoria_cliente text,           -- 'Gold', 'Silver', 'Socio', null=todos
  categoria_producto_id uuid REFERENCES categorias(id),  -- null si no aplica
  producto_id uuid REFERENCES productos(id),              -- null si no aplica
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
```

**Migration**: `011_descuentos_reglas.sql`

#### 6C. Integración con POS

**Flujo mejorado en TicketPanel:**
```
[Asignar cliente al ticket] → buscar cliente por nombre
→ Al seleccionar cliente con categoría 'Gold' o 'Socio':
  · Sistema consulta descuentos_reglas WHERE categoria_cliente = 'Gold' AND activo = true
  · Si hay reglas → badge verde "Descuentos disponibles (x2)"
  · Toggle "Aplicar Descuento Socio" → muestra lista de reglas aplicables
    - ✓ "Descuento Socio 10% — Todo el ticket"
    - ✓ "VIP Weekend 15% — Bebidas"
  · Usuario activa/desactiva cada regla
  · Ticket recalcula subtotal con descuentos aplicados
  · En resumen: "Descuento Socio (-10%) — $29.00"
→ Sin cliente o cliente sin categoría → descuento manual -10% disponible (botón actual)
```

**Archivos a crear/modificar:**
- `apps/dashboard/src/app/(dashboard)/descuentos/page.tsx` ← CREAR route
- `apps/dashboard/src/components/modules/descuentos/DescuentosPage.tsx` ← CREAR
- `apps/dashboard/src/components/modules/descuentos/DiscountRuleModal.tsx` ← CREAR
- `apps/dashboard/src/lib/supabase/queries/descuentos.ts` ← CREAR
- `apps/dashboard/src/components/modules/pos/TicketPanel.tsx` ← MODIFICAR (reglas dinámicas)
- `apps/dashboard/src/components/modules/pos/POSPage.tsx` ← MODIFICAR (asignar cliente al ticket)
- `apps/dashboard/src/components/Sidebar/navigation.ts` ← AGREGAR link /descuentos
- Supabase migration: `011_descuentos_reglas.sql` ← CREAR

#### 6D. Queries necesarias

```typescript
// queries/descuentos.ts
getDescuentosReglas(supabase, clubId): Promise<DescuentoRegla[]>
createDescuentoRegla(supabase, data): Promise<DescuentoRegla>
updateDescuentoRegla(supabase, id, data): Promise<void>
deleteDescuentoRegla(supabase, id): Promise<void>
getDescuentosParaCliente(supabase, clubId, categoriaCliente): Promise<DescuentoRegla[]>
// Retorna reglas activas que aplican a esta categoría
```

#### 6E. Verificación Fase 6

1. Sidebar: nuevo link "Descuentos" aparece bajo Administración
2. `/descuentos`: lista de reglas con toggle activo/inactivo funcional
3. "Nueva Regla" → modal → llenar campos → Guardar → aparece en lista
4. Editar regla existente → modal pre-llenado → guardar → actualiza
5. Eliminar regla → desaparece de la lista
6. POS: asignar cliente categoría 'Gold' → badge "Descuentos disponibles"
7. POS: activar descuento → ticket recalcula → línea de descuento visible
8. POS: cobrar → cuenta guardada con descuento aplicado registrado
9. Reportes: stat "Descuentos aplicados hoy: $X" (mejora futura)

---

## Estándares SaaS Aplicados

| Módulo | Referente Global | Gap Actual | Fase |
|--------|-----------------|-----------|------|
| Pistas | CourtReserve, Playtomic | Sin creación de reservas ni control de canchas | 1+2+5 |
| Caja | Square Register, Toast | Sin cierre de turno ni movimientos | 1+2 |
| POS | Square POS, Toast POS | Sin historial tickets ni gestión de menú | 1+2 |
| Clientes | Mindbody, Acuity | Sin alta ni ficha de cliente | 3 |
| Inventario | Lightspeed, Square | Sin CRUD ni ajuste de stock | 3 |
| Reportes | Square Analytics | Sin exportación | 4 |
| Comandas | Toast KDS | Kanban saturado sin filtro | 4 |
| Descuentos | Mindbody, Square Loyalty | Descuento hardcoded, sin reglas configurables | 6 |
