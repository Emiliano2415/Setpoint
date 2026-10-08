-- ============================================================
-- Esquema base de Setpoint PMS (RECONSTRUIDO)
--
-- El esquema original se creó directamente sobre Supabase y nunca se guardó
-- como migración; ese proyecto ya no existe. Este archivo lo reconstruye
-- (2026-10-07) a partir de:
--   · las consultas de apps/dashboard/src/lib/supabase/queries/*.ts
--   · los tipos de packages/types/src/index.ts
--   · el SQL de las RPC y políticas en docs/plans/ y en las migraciones
--
-- Representa el estado ANTERIOR a 20260326000001: las migraciones posteriores
-- se aplican encima sin cambios.
--
-- Tablas, columnas, tipos y claves foráneas salen del código. Los índices,
-- valores por defecto y restricciones CHECK son inferidos.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Enums
-- ============================================================

CREATE TYPE user_rol          AS ENUM ('propietario', 'admin', 'cajero', 'mesero', 'cocina', 'barra');
CREATE TYPE cliente_categoria AS ENUM ('nuevo', 'regular', 'frecuente', 'habitual', 'silver', 'gold');
CREATE TYPE reserva_estado    AS ENUM ('confirmada', 'checkin', 'finalizada', 'cancelada', 'noshow');
CREATE TYPE cuenta_estado     AS ENUM ('abierta', 'pagada', 'cancelada', 'division');
CREATE TYPE item_estado       AS ENUM ('pendiente', 'en_proceso', 'listo', 'entregado', 'cancelado');
-- 'cobrado' se agrega en 20260326000003
CREATE TYPE comanda_estado    AS ENUM ('pendiente', 'preparando', 'listo', 'entregado', 'cancelado');
CREATE TYPE metodo_pago       AS ENUM ('efectivo', 'credito', 'debito', 'cuenta_cliente', 'bono', 'cortesia');
CREATE TYPE caja_estado       AS ENUM ('abierta', 'cerrada', 'revisada');
CREATE TYPE movimiento_tipo   AS ENUM ('ingreso', 'egreso', 'fondo', 'retiro');
CREATE TYPE cancelacion_tipo  AS ENUM ('pre_cobro', 'post_cobro');

-- ============================================================
-- Club y personal
-- ============================================================

CREATE TABLE clubes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text NOT NULL,
  direccion   text,
  telefono    text,
  -- moneda, zona_horaria, iva_default, metodos_pago, tarifas[], tolerancia_caja,
  -- timer_alerta_min, noshow_tolerancia_min (ver queries/configuracion.ts)
  config      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE empleados (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id       uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  -- Usuario del proveedor de autenticación (auth.users en Supabase,
  -- neon_auth.user en Neon). Sin clave foránea para no depender de ninguno.
  auth_user_id  uuid UNIQUE,
  nombre        text NOT NULL,
  rol           user_rol NOT NULL DEFAULT 'cajero',
  activo        boolean NOT NULL DEFAULT true,
  turno         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX empleados_club_id_idx ON empleados (club_id);

CREATE TABLE turnos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id      uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  empleado_id  uuid NOT NULL REFERENCES empleados(id),
  tipo         text NOT NULL,
  inicio       timestamptz NOT NULL DEFAULT now(),
  fin          timestamptz,
  activo       boolean NOT NULL DEFAULT true
);
CREATE INDEX turnos_club_inicio_idx ON turnos (club_id, inicio DESC);

-- ============================================================
-- Caja
-- ============================================================

CREATE TABLE cajas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id         uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  turno_id        uuid NOT NULL REFERENCES turnos(id),
  fondo_inicial   numeric(10,2) NOT NULL DEFAULT 0,
  estado          caja_estado NOT NULL DEFAULT 'abierta',
  total_efectivo  numeric(10,2),
  total_tarjeta   numeric(10,2),
  total_propinas  numeric(10,2),
  diferencia      numeric(10,2),
  cerrada_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cajas_club_estado_idx ON cajas (club_id, estado, created_at DESC);

-- Sin club_id: el aislamiento por club se hace a través de cajas
CREATE TABLE movimientos_caja (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caja_id     uuid NOT NULL REFERENCES cajas(id) ON DELETE CASCADE,
  tipo        movimiento_tipo NOT NULL,
  concepto    text NOT NULL,
  monto       numeric(10,2) NOT NULL,
  metodo      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX movimientos_caja_caja_idx ON movimientos_caja (caja_id, created_at DESC);

-- ============================================================
-- Clientes
-- ============================================================

CREATE TABLE clientes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id       uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  nombre        text NOT NULL,
  telefono      text,
  email         text,
  categoria     cliente_categoria NOT NULL DEFAULT 'nuevo',
  es_socio      boolean NOT NULL DEFAULT false,
  saldo_cuenta  numeric(10,2) NOT NULL DEFAULT 0,
  stats         jsonb NOT NULL DEFAULT '{"visitas": 0, "ticket_promedio": 0, "ultima_visita": null}'::jsonb,
  notas         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX clientes_club_id_idx ON clientes (club_id, created_at DESC);

CREATE TABLE bonos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id        uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tipo              text NOT NULL,
  valor_total       numeric(10,2) NOT NULL,
  valor_restante    numeric(10,2) NOT NULL,
  fecha_expiracion  date,
  activo            boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bonos_cliente_id_idx ON bonos (cliente_id);

-- ============================================================
-- Pistas y reservas
-- ============================================================

CREATE TABLE pistas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id             uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  nombre              text NOT NULL,
  tipo                text NOT NULL DEFAULT 'Indoor',
  activa              boolean NOT NULL DEFAULT true,
  orden               integer NOT NULL DEFAULT 0,
  en_mantenimiento    boolean NOT NULL DEFAULT false,
  nota_mantenimiento  text,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pistas_club_orden_idx ON pistas (club_id, orden);

CREATE TABLE reservas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id         uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  pista_id        uuid NOT NULL REFERENCES pistas(id),
  cliente_id      uuid REFERENCES clientes(id) ON DELETE SET NULL,
  nombre_cliente  text,
  fecha           date NOT NULL,
  hora_inicio     time NOT NULL,
  hora_fin        time NOT NULL,
  estado          reserva_estado NOT NULL DEFAULT 'confirmada',
  precio          numeric(10,2) NOT NULL DEFAULT 0,
  notas           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reservas_club_fecha_idx ON reservas (club_id, fecha, hora_inicio);
CREATE INDEX reservas_pista_fecha_idx ON reservas (pista_id, fecha);

-- ============================================================
-- Catálogo
-- ============================================================

CREATE TABLE categorias (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id           uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  nombre            text NOT NULL,
  tipo              text NOT NULL DEFAULT 'producto',
  estacion_destino  text,
  orden             integer NOT NULL DEFAULT 0,
  activa            boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX categorias_club_orden_idx ON categorias (club_id, orden);

-- requiere_cocina se agrega en 20260326000001
CREATE TABLE productos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id         uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  categoria_id    uuid NOT NULL REFERENCES categorias(id),
  nombre          text NOT NULL,
  descripcion     text,
  precio          numeric(10,2) NOT NULL,
  iva_rate        numeric(5,4) NOT NULL DEFAULT 0.16,
  stock_actual    numeric(10,2) NOT NULL DEFAULT 0,
  stock_minimo    numeric(10,2) NOT NULL DEFAULT 0,
  requiere_stock  boolean NOT NULL DEFAULT false,
  activo          boolean NOT NULL DEFAULT true,
  imagen_url      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX productos_club_categoria_idx ON productos (club_id, categoria_id);

CREATE TABLE movimientos_stock (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id          uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  producto_id      uuid NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  tipo             text NOT NULL CHECK (tipo IN ('entrada', 'salida', 'ajuste', 'merma')),
  cantidad         numeric(10,2) NOT NULL,
  stock_anterior   numeric(10,2),
  stock_posterior  numeric(10,2),
  motivo           text,
  empleado_id      uuid REFERENCES empleados(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX movimientos_stock_club_idx ON movimientos_stock (club_id, created_at DESC);

-- Definición tomada de planes/setpoint-pms-plan.md (Fase 6B)
CREATE TABLE descuentos_reglas (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id                uuid REFERENCES clubes(id),
  nombre                 text NOT NULL,
  tipo                   text CHECK (tipo IN ('porcentaje', 'monto_fijo')) NOT NULL,
  valor                  numeric NOT NULL,
  aplica_a               text CHECK (aplica_a IN ('todo', 'categoria_cliente', 'categoria_producto', 'producto')) DEFAULT 'todo',
  categoria_cliente      text,
  categoria_producto_id  uuid REFERENCES categorias(id),
  producto_id            uuid REFERENCES productos(id),
  activo                 boolean DEFAULT true,
  created_at             timestamptz DEFAULT now()
);
CREATE INDEX descuentos_reglas_club_idx ON descuentos_reglas (club_id);

-- ============================================================
-- Ventas
-- ============================================================

CREATE TABLE cuentas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id          uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  numero_ticket    text NOT NULL,
  cliente_id       uuid REFERENCES clientes(id) ON DELETE SET NULL,
  reserva_id       uuid REFERENCES reservas(id) ON DELETE SET NULL,
  caja_id          uuid REFERENCES cajas(id) ON DELETE SET NULL,
  estado           cuenta_estado NOT NULL DEFAULT 'abierta',
  subtotal         numeric(10,2) NOT NULL DEFAULT 0,
  iva              numeric(10,2) NOT NULL DEFAULT 0,
  total            numeric(10,2) NOT NULL DEFAULT 0,
  descuento_total  numeric(10,2) NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cuentas_club_created_idx ON cuentas (club_id, created_at DESC);
CREATE INDEX cuentas_reserva_id_idx ON cuentas (reserva_id);

CREATE TABLE cuenta_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id        uuid NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  producto_id      uuid REFERENCES productos(id),
  cantidad         integer NOT NULL DEFAULT 1,
  precio_unitario  numeric(10,2) NOT NULL,
  descuento        numeric(10,2) NOT NULL DEFAULT 0,
  subtotal         numeric(10,2) NOT NULL DEFAULT 0,
  iva              numeric(10,2) NOT NULL DEFAULT 0,
  total            numeric(10,2) NOT NULL DEFAULT 0,
  estado           item_estado NOT NULL DEFAULT 'pendiente',
  notas            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cuenta_items_cuenta_idx ON cuenta_items (cuenta_id);

CREATE TABLE pagos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id   uuid NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  metodo      metodo_pago NOT NULL,
  monto       numeric(10,2) NOT NULL,
  referencia  text,
  propina     numeric(10,2) NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pagos_cuenta_idx ON pagos (cuenta_id);

-- ============================================================
-- Comandas
-- ============================================================

CREATE TABLE comandas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  cuenta_id   uuid REFERENCES cuentas(id) ON DELETE SET NULL,
  estacion    text,
  estado      comanda_estado NOT NULL DEFAULT 'pendiente',
  notas       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz
);
CREATE INDEX comandas_club_created_idx ON comandas (club_id, created_at);

-- La pantalla de comandas mide el tiempo en el estado actual con updated_at
CREATE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER comandas_set_updated_at
  BEFORE UPDATE ON comandas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- producto_id se agrega en 20260326000002; nombre y precio_unitario en 20260405000001
CREATE TABLE comanda_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comanda_id      uuid NOT NULL REFERENCES comandas(id) ON DELETE CASCADE,
  cuenta_item_id  uuid REFERENCES cuenta_items(id) ON DELETE SET NULL,
  cantidad        integer NOT NULL DEFAULT 1,
  estado          item_estado NOT NULL DEFAULT 'pendiente',
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX comanda_items_comanda_idx ON comanda_items (comanda_id);

-- ============================================================
-- Cancelaciones (estado, reserva_id, metodo_pago y rechazado_motivo
-- se agregan en 20260406000001)
-- ============================================================

CREATE TABLE cancelaciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id         uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  cuenta_id       uuid REFERENCES cuentas(id) ON DELETE CASCADE,
  cuenta_item_id  uuid REFERENCES cuenta_items(id) ON DELETE CASCADE,
  cantidad        integer NOT NULL DEFAULT 1,
  monto           numeric(10,2) NOT NULL DEFAULT 0,
  motivo          text NOT NULL,
  tipo            cancelacion_tipo NOT NULL,
  fue_preparado   boolean NOT NULL DEFAULT false,
  genera_merma    boolean NOT NULL DEFAULT false,
  autorizado_por  uuid REFERENCES empleados(id),
  cancelado_por   uuid REFERENCES empleados(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cancelaciones_club_created_idx ON cancelaciones (club_id, created_at DESC);

-- ============================================================
-- Reportes
-- ============================================================

CREATE TABLE metricas_diarias (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id               uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  fecha                 date NOT NULL,
  ventas_total          numeric(12,2) NOT NULL DEFAULT 0,
  ticket_promedio       numeric(10,2) NOT NULL DEFAULT 0,
  num_transacciones     integer NOT NULL DEFAULT 0,
  ocupacion_pistas_pct  numeric(5,2) NOT NULL DEFAULT 0,
  top_productos         jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, fecha)
);
