# Diseño: Sync Caja-POS + Dividir Cuenta + Propinas

**Fecha:** 2026-03-19
**Módulos afectados:** POS (`TicketPanel`), Caja (`CajaPage`, `getCajaStats`), DB (`cuentas`)

---

## Problema 1 — Caja stats no se actualizan (bug crítico)

### Causa raíz
`getCajaStats()` lee exclusivamente de `movimientos_caja`. El POS escribe en `cuentas` + `pagos`. No hay vinculación. Las stats de ventas siempre muestran $0.

### Solución aprobada
Reescribir `getCajaStats()` para agregar desde `pagos JOIN cuentas` filtrado por el timestamp de inicio del turno (caja.created_at). Sin cambios en el POS, sin datos duplicados.

```
getCajaStats(supabase, caja) →
  1. Filtrar pagos WHERE cuentas.club_id = caja.club_id
     AND cuentas.created_at >= caja.created_at
     AND cuentas.estado = 'pagada'
  2. Sumar por metodo: efectivo, credito/debito → totalEfectivo, totalTarjeta
  3. Sumar cuentas.propina → totalPropinas (nuevo campo)
  4. Movimientos manuales (retiros, fondos) siguen leyendo de movimientos_caja
```

---

## Problema 2 — Dividir cuenta entre varios clientes (por ítem)

### Flujo aprobado

**Entrada:** El cajero tiene items en el ticket y hace click en un nuevo botón "Dividir Cuenta" (distinto al "Dividir" actual de efectivo/tarjeta).

**UI — SplitBillModal:**

```
┌─────────────────────────────────────────────┐
│ DIVIDIR CUENTA              [+ Persona]     │
│                                             │
│ [Persona 1 ●]  [Persona 2 ○]               │
│                                             │
│ ITEMS (click para asignar)                  │
│ ○●  2x Isotónico 600ml        $92.80       │
│ ○●  1x Cerveza Artesanal      $92.80       │
│ ○●  1x Grip Overgrip          $98.60       │
│                                             │
│ Persona 1: $191.40    Persona 2: $92.80    │
│ ⚠ 0 ítems sin asignar                      │
│                                             │
│              [Cobrar Persona 1 →]           │
└─────────────────────────────────────────────┘
```

**Reglas de asignación:**
- Hasta 6 personas
- Items con `cantidad > 1` se expanden: cada unidad es una línea independiente asignable
- Ítem por default en Persona 1. Click cambia entre personas (toggle circular)
- Ítems sin asignar: aviso visible, no bloquea (van a Persona 1 si se confirma)

**Flujo de cobro por persona:**
1. Click "Cobrar Persona 1 →" → mini-modal de pago (Efectivo / Tarjeta) + propina opcional
2. `createCuenta()` con los items de Persona 1 → genera ticket independiente
3. Avanza a "Cobrar Persona 2 →" y así hasta completar
4. Al finalizar: ticket original se limpia

**DB:** Cada persona genera una `cuenta` separada con sus `cuenta_items` y su `pago`. El historial muestra N tickets del mismo momento.

---

## Problema 3 — Propinas integradas en cobro

### Flujo aprobado

Propina opcional en los modales de pago de Efectivo, Tarjeta y en el cobro por persona del split.

**UI:**
```
TOTAL: $156.60

Propina (opcional)
[10%]  [15%]  [20%]  [$ manual]

Efectivo recibido: [_______]
→ Propina:          $15.66
→ Total a cobrar:  $172.26
→ Cambio:           $27.74

[Confirmar Pago]
```

### DB — Migración requerida
```sql
ALTER TABLE cuentas ADD COLUMN IF NOT EXISTS propina numeric DEFAULT 0;
```

### Persistencia
- `createCuenta()` recibe parámetro `propina?: number` (default 0)
- Se guarda en `cuentas.propina`
- `getCajaStats()` suma `cuentas.propina` para `totalPropinas` (más robusto que leer concepto de movimientos_caja)

### Comportamiento por método
- **Efectivo:** cambio = recibido − (total + propina)
- **Tarjeta:** cobro = total + propina (sin cambio)
- **Dividido (split efectivo/tarjeta):** propina se suma al total antes del split

---

## Archivos a crear / modificar

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `queries/caja.ts` | MODIFICAR | Reescribir `getCajaStats` para leer de `pagos+cuentas` |
| `queries/pos.ts` | MODIFICAR | Agregar `propina?: number` a `createCuenta()` |
| `pos/TicketPanel.tsx` | MODIFICAR | Agregar UI de propina en modales de efectivo/tarjeta/dividir; agregar botón "Dividir Cuenta" |
| `pos/SplitBillModal.tsx` | CREAR | Modal de asignación de ítems por persona + cobro secuencial |
| Supabase migration | CREAR | `ALTER TABLE cuentas ADD COLUMN propina numeric DEFAULT 0` |

---

## Criterios de aceptación

1. **Caja sync:** Al cobrar en POS, las stats de Caja se actualizan al refrescar (Ventas del turno, Efectivo, Tarjeta)
2. **Split:** Ticket con 3 items → Dividir Cuenta → asignar 2 a P1 y 1 a P2 → cobrar P1 (efectivo) → cobrar P2 (tarjeta) → 2 tickets independientes en historial
3. **Propinas:** Cobrar $100 con 10% propina → total $110, si paga $120 efectivo → cambio $10
4. **Propinas en stats Caja:** `totalPropinas` refleja la suma de `cuentas.propina` del turno
5. **TypeScript:** `npx tsc --noEmit` EXIT:0 en todos los cambios
