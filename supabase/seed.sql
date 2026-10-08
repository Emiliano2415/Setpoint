-- ============================================================
-- Datos de ejemplo de Setpoint PMS — TODO ES INVENTADO
--
-- Genera 7 días de historia más el día de hoy para un club completo, y un
-- segundo club mínimo para comprobar el aislamiento entre clubes (RLS).
-- Las fechas son relativas al momento de ejecutarlo (zona America/Mexico_City);
-- para refrescarlas: npm run db:reset (local) o node scripts/seed-neon.mjs (Neon)
--
-- Donde la app usa una RPC, aquí también se llama a la RPC (abrir y cerrar
-- turno, check-in con pago, ajustes de stock, cancelaciones, permisos), así
-- que sembrar la base ejercita esas funciones.
--
-- Usuarios (contraseña: demo1234)
--   propietario@setpoint.test   admin@setpoint.test
--   cajero1@setpoint.test       cajero2@setpoint.test
--   mesero@setpoint.test        cocina@setpoint.test     barra@setpoint.test
--   emiliano@setpoint.test      (propietario)
--   propietario@clubnorte.test  (segundo club)
-- ============================================================

-- Semilla fija: los mismos datos en cada ejecución (salvo las fechas)
DO $$ BEGIN PERFORM setseed(0.2026); END $$;

-- ============================================================
-- Clubes
-- ============================================================

INSERT INTO clubes (id, nombre, direccion, telefono, config, created_at) VALUES
(
  'a0000000-0000-4000-8000-000000000001',
  'Setpoint Padel Club',
  'Av. de las Palmas 1450, Col. Jardines, Ciudad Victoria, Tamps.',
  '834 555 0142',
  '{
    "moneda": "MXN",
    "zona_horaria": "America/Mexico_City",
    "iva_default": 0.16,
    "metodos_pago": ["efectivo", "credito", "debito", "cuenta_cliente", "bono", "cortesia"],
    "tarifas": [
      {"nombre": "Mañana", "inicio": "07:00", "fin": "12:00", "precio": 350},
      {"nombre": "Tarde",  "inicio": "12:00", "fin": "18:00", "precio": 400},
      {"nombre": "Noche",  "inicio": "18:00", "fin": "23:00", "precio": 500}
    ],
    "tolerancia_caja": 50,
    "timer_alerta_min": 15,
    "noshow_tolerancia_min": 15
  }'::jsonb,
  now() - interval '8 months'
),
(
  'b0000000-0000-4000-8000-000000000001',
  'Club Pádel Norte',
  'Blvd. Tamaulipas 220, Zona Norte, Ciudad Victoria, Tamps.',
  '834 555 0177',
  '{"moneda": "MXN", "zona_horaria": "America/Mexico_City", "iva_default": 0.16,
    "metodos_pago": ["efectivo", "credito"],
    "tarifas": [{"nombre": "General", "inicio": "08:00", "fin": "22:00", "precio": 300}],
    "tolerancia_caja": 50, "timer_alerta_min": 15, "noshow_tolerancia_min": 15}'::jsonb,
  now() - interval '2 months'
);

-- ============================================================
-- Usuarios y empleados
--
-- El usuario vive en el proveedor de autenticación y `empleados` lo enlaza por
-- auth_user_id; el club y el rol salen de esa fila, no del token.
--   · Supabase / PostgreSQL local: el usuario se crea aquí mismo, por SQL.
--   · Neon: se da de alta antes por la API de Neon Auth (scripts/seed-neon.mjs)
--     y aquí solo se busca su identificador por correo.
-- ============================================================

CREATE TEMP TABLE seed_usuarios (
  email        text PRIMARY KEY,
  id_local     uuid NOT NULL,
  empleado_id  uuid NOT NULL,
  club_id      uuid NOT NULL,
  nombre       text NOT NULL,
  rol          text NOT NULL,
  turno        text,
  user_id      uuid
);

INSERT INTO seed_usuarios (email, id_local, empleado_id, club_id, nombre, rol, turno) VALUES
  ('propietario@setpoint.test',  'a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Laura Méndez Ortiz', 'propietario', 'completo'),
  ('admin@setpoint.test',        'a1000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Carlos Rodríguez',   'admin',       'completo'),
  ('cajero1@setpoint.test',      'a1000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'Mariana Torres',     'cajero',      'mañana'),
  ('cajero2@setpoint.test',      'a1000000-0000-4000-8000-000000000004', 'a2000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'Diego Hernández',    'cajero',      'tarde'),
  ('mesero@setpoint.test',       'a1000000-0000-4000-8000-000000000005', 'a2000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'Sofía Castillo',     'mesero',      'tarde'),
  ('cocina@setpoint.test',       'a1000000-0000-4000-8000-000000000006', 'a2000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', 'Jorge Ramírez',      'cocina',      'completo'),
  ('barra@setpoint.test',        'a1000000-0000-4000-8000-000000000007', 'a2000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000001', 'Valeria Núñez',      'barra',       'noche'),
  ('emiliano@setpoint.test',     'a1000000-0000-4000-8000-000000000008', 'a2000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000001', 'Emiliano',           'propietario', 'completo'),
  ('propietario@clubnorte.test', 'b1000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'Andrea Lozano',      'propietario', 'completo');

DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    INSERT INTO auth.users (id, email, encrypted_password, raw_app_meta_data, created_at)
    SELECT id_local, email, crypt('demo1234', gen_salt('bf')),
           jsonb_build_object('provider', 'email'), now() - interval '8 months'
    FROM seed_usuarios;
    UPDATE seed_usuarios SET user_id = id_local;
  ELSIF to_regclass('neon_auth."user"') IS NOT NULL THEN
    EXECUTE 'UPDATE seed_usuarios s SET user_id = u.id FROM neon_auth."user" u WHERE u.email = s.email';
  END IF;
END $$;

INSERT INTO empleados (id, club_id, auth_user_id, nombre, rol, activo, turno)
SELECT empleado_id, club_id, user_id, nombre, rol::user_rol, true, turno FROM seed_usuarios;

-- Empleado dado de baja y sin usuario
INSERT INTO empleados (id, club_id, auth_user_id, nombre, rol, activo, turno)
VALUES ('a2000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000001', NULL, 'Pablo Ibarra', 'mesero', false, NULL);

-- Fija quién "hace" las operaciones siguientes, para que la auditoría registre
-- al usuario. Usa el mismo ajuste de sesión que lee auth.uid() en una petición real.
CREATE FUNCTION pg_temp.actuar_como(p_email text)
RETURNS void
LANGUAGE sql
AS $$
  SELECT set_config(
    'request.jwt.claims',
    json_build_object('sub', (SELECT user_id FROM seed_usuarios WHERE email = p_email), 'role', 'authenticated')::text,
    true)
$$;

-- ============================================================
-- Pistas
-- ============================================================

INSERT INTO pistas (id, club_id, nombre, tipo, activa, orden, en_mantenimiento, nota_mantenimiento) VALUES
  ('a3000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Pista 1 — Central', 'Indoor',        true,  1, false, NULL),
  ('a3000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Pista 2',           'Indoor',        true,  2, false, NULL),
  ('a3000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'Pista 3',           'Outdoor',       true,  3, false, NULL),
  ('a3000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'Pista 4',           'Outdoor',       true,  4, true,  'Cambio de red y revisión del césped'),
  ('a3000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'Pista 5',           'Cubierta',      true,  5, false, NULL),
  ('a3000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', 'Pista 6',           'Semi-cubierta', true,  6, false, NULL),
  ('a3000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000001', 'Pista 7 (en obra)', 'Outdoor',       false, 7, false, NULL),
  ('b3000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'Cancha A',          'Outdoor',       true,  1, false, NULL),
  ('b3000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'Cancha B',          'Outdoor',       true,  2, false, NULL);

-- ============================================================
-- Catálogo
-- ============================================================

INSERT INTO categorias (id, club_id, nombre, tipo, estacion_destino, orden) VALUES
  ('a4000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Cafetería',         'alimentos', 'cocina', 1),
  ('a4000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Bebidas',           'bebidas',   'barra',  2),
  ('a4000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'Alquiler Material', 'alquiler',  NULL,     3),
  ('a4000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'Bolas / Grips',     'tienda',    NULL,     4),
  ('b4000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'Bebidas',           'bebidas',   'barra',  1);

-- Las existencias de Agua, Isotónica, Grip y Pala Nivel 1 quedan en su valor
-- final tras los ajustes de stock de hoy (más abajo, vía rpc_adjust_stock).
INSERT INTO productos (id, club_id, categoria_id, nombre, descripcion, precio, stock_actual, stock_minimo, requiere_stock, requiere_cocina, activo) VALUES
  ('a5000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'Bocadillo Jamón',       'Pan artesanal con jamón serrano',      90.00,  0,  0, false, true,  true),
  ('a5000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'Tostada Aguacate',      'Pan de masa madre, aguacate y limón',  75.00,  0,  0, false, true,  true),
  ('a5000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'Fruta de Temporada',    'Vaso de fruta picada',                 55.00,  0,  0, false, true,  true),
  ('a5000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'Yogur con Granola',     NULL,                                   65.00,  0,  0, false, true,  true),
  ('a5000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000002', 'Café Solo',             'Espresso doble',                       28.00,  0,  0, false, true,  true),
  ('a5000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000002', 'Agua Mineral 500ml',    NULL,                                   30.00, 24, 12, true,  false, true),
  ('a5000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000002', 'Bebida Isotónica',      NULL,                                   50.00,  6, 10, true,  false, true),
  ('a5000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000002', 'Cerveza Caña',          NULL,                                   45.00, 60, 24, true,  false, true),
  ('a5000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000003', 'Pala Nivel 1',          'Renta por partido',                    70.00,  3,  5, true,  false, true),
  ('a5000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000003', 'Pala Pro',              'Renta por partido',                   100.00,  6,  3, true,  false, true),
  ('a5000000-0000-4000-8000-00000000000b', 'a0000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000003', 'Muñequera x2',          NULL,                                   20.00, 14, 10, true,  false, true),
  ('a5000000-0000-4000-8000-00000000000c', 'a0000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000003', 'Bolsa de Deporte',      NULL,                                   15.00,  9,  4, true,  false, true),
  ('a5000000-0000-4000-8000-00000000000d', 'a0000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000004', 'Bote Bolas Head Pro',   'Bote de 3 bolas',                     130.00,  8,  6, true,  false, true),
  ('a5000000-0000-4000-8000-00000000000e', 'a0000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000004', 'Grip Overgrip x3',      NULL,                                   45.00,  5,  8, true,  false, true),
  ('a5000000-0000-4000-8000-00000000000f', 'a0000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000004', 'Antivibrador',          NULL,                                   25.00, 20,  5, true,  false, true),
  ('a5000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000004', 'Protector Lateral',     NULL,                                   60.00, 11,  4, true,  false, true),
  ('a5000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'Sándwich Club',         'Descontinuado',                        85.00,  0,  0, false, true,  false),
  ('b5000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001', 'Agua Natural',          NULL,                                   20.00, 30, 10, true,  false, true),
  ('b5000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001', 'Refresco',              NULL,                                   25.00, 40, 10, true,  false, true);

-- ============================================================
-- Clientes y bonos (stats se recalcula al final a partir de las ventas)
-- ============================================================

INSERT INTO clientes (id, club_id, nombre, telefono, email, categoria, es_socio, saldo_cuenta, notas, created_at) VALUES
  ('a6000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Fernando García',  '834 555 0101', 'fernando.garcia@example.com', 'gold',    true,  350.00, 'Juega martes y jueves por la noche', now() - interval '7 months'),
  ('a6000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Lucía Ruiz',       '834 555 0102', 'lucia.ruiz@example.com',      'gold',    true,    0.00, NULL,                                 now() - interval '6 months'),
  ('a6000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'Andrés López',     '834 555 0103', 'andres.lopez@example.com',    'silver',  true,  120.00, 'Prefiere Pista 1',                   now() - interval '5 months'),
  ('a6000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'Paola Mora',       '834 555 0104', NULL,                          'silver',  false,   0.00, NULL,                                 now() - interval '4 months'),
  ('a6000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'Héctor Martínez',  '834 555 0105', 'hector.martinez@example.com', 'regular', true,    0.00, 'Clases los sábados',                 now() - interval '4 months'),
  ('a6000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', 'Daniela Díaz',     '834 555 0106', 'daniela.diaz@example.com',    'regular', false,   0.00, NULL,                                 now() - interval '3 months'),
  ('a6000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000001', 'Roberto Sánchez',  '834 555 0107', NULL,                          'regular', false,  -90.00, 'Debe una renta de pala',             now() - interval '3 months'),
  ('a6000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000001', 'Emilio Vargas',    '834 555 0108', 'emilio.vargas@example.com',   'regular', true,    0.00, NULL,                                 now() - interval '2 months'),
  ('a6000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000001', 'Natalia Ríos',     '834 555 0109', 'natalia.rios@example.com',    'silver',  false,   0.00, NULL,                                 now() - interval '6 weeks'),
  ('a6000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000001', 'Camila Costa',     '834 555 0110', NULL,                          'nuevo',   false,   0.00, NULL,                                 now() - interval '6 days'),
  ('a6000000-0000-4000-8000-00000000000b', 'a0000000-0000-4000-8000-000000000001', 'Iván Peña',        '834 555 0111', 'ivan.pena@example.com',       'nuevo',   false,   0.00, 'Llegó por recomendación',            now() - interval '4 days'),
  ('a6000000-0000-4000-8000-00000000000c', 'a0000000-0000-4000-8000-000000000001', 'Regina Flores',    '834 555 0112', NULL,                          'nuevo',   false,   0.00, NULL,                                 now() - interval '2 days'),
  ('b6000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'Óscar Benítez',    '834 555 0201', NULL,                          'regular', false,   0.00, NULL,                                 now() - interval '1 month'),
  ('b6000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'Ximena Guerra',    '834 555 0202', NULL,                          'nuevo',   false,   0.00, NULL,                                 now() - interval '1 week');

INSERT INTO bonos (cliente_id, tipo, valor_total, valor_restante, fecha_expiracion, activo) VALUES
  ('a6000000-0000-4000-8000-000000000001', 'Bono 10 canchas',       5000.00, 3000.00, current_date + 60,  true),
  ('a6000000-0000-4000-8000-000000000003', 'Bono mensual de clases', 2400.00, 2400.00, current_date + 25,  true),
  ('a6000000-0000-4000-8000-000000000005', 'Bono 5 clases',          1500.00,    0.00, current_date - 10,  false);

INSERT INTO descuentos_reglas (club_id, nombre, tipo, valor, aplica_a, categoria_cliente, categoria_producto_id, activo, created_at) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'Descuento Socio',      'porcentaje', 10, 'todo',               'Socio',  NULL,                                   true,  now() - interval '5 months'),
  ('a0000000-0000-4000-8000-000000000001', 'Cliente Gold',         'porcentaje', 15, 'todo',               'Gold',   NULL,                                   true,  now() - interval '5 months'),
  ('a0000000-0000-4000-8000-000000000001', 'Cliente Silver',       'porcentaje',  5, 'todo',               'Silver', NULL,                                   true,  now() - interval '5 months'),
  ('a0000000-0000-4000-8000-000000000001', 'Happy hour bebidas',   'porcentaje', 20, 'categoria_producto', NULL,     'a4000000-0000-4000-8000-000000000002', true,  now() - interval '2 months'),
  ('a0000000-0000-4000-8000-000000000001', 'Promo de inauguración', 'monto_fijo', 50, 'todo',               NULL,     NULL,                                   false, now() - interval '8 months');

-- Segundo club: lo justo para que el aislamiento tenga algo que ocultar
INSERT INTO reservas (club_id, pista_id, cliente_id, nombre_cliente, fecha, hora_inicio, hora_fin, estado, precio)
VALUES ('b0000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001',
        'Óscar Benítez', (now() AT TIME ZONE 'America/Mexico_City')::date, '19:00', '20:30', 'confirmada', 450.00);

-- ============================================================
-- Venta de mostrador: replica lo que hace createCuenta() en queries/pos.ts
-- (cuenta pagada + items + pagos + un movimiento de caja por pago) y, si algún
-- producto requiere cocina, la comanda que envía TicketPanel.
-- ============================================================

CREATE FUNCTION pg_temp.venta(
  p_club        uuid,
  p_caja        uuid,
  p_ts          timestamptz,
  p_cliente     uuid,
  p_n_items     int,
  p_modo        text,              -- efectivo | credito | debito | mixto
  p_con_propina boolean
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_cuenta    uuid;
  v_comanda   uuid;
  v_item      uuid;
  v_ticket    text := 'SP-' || lpad((floor(random() * 900000) + 100000)::int::text, 6, '0');
  v_prod      record;
  v_cant      int;
  v_base      numeric := 0;
  v_desc      numeric := 0;
  v_iva       numeric;
  v_total     numeric;
  v_mitad     numeric;
  v_propina   numeric;
  v_es_socio  boolean := false;
BEGIN
  IF p_cliente IS NOT NULL THEN
    SELECT es_socio INTO v_es_socio FROM clientes WHERE id = p_cliente;
  END IF;

  INSERT INTO cuentas (club_id, numero_ticket, cliente_id, caja_id, estado, created_at)
  VALUES (p_club, v_ticket, p_cliente, p_caja, 'pagada', p_ts)
  RETURNING id INTO v_cuenta;

  FOR v_prod IN
    SELECT p.id, p.nombre, p.precio, p.requiere_cocina, c.estacion_destino
    FROM productos p JOIN categorias c ON c.id = p.categoria_id
    WHERE p.club_id = p_club AND p.activo
    ORDER BY random() LIMIT p_n_items
  LOOP
    v_cant := 1 + floor(random() * 2.4)::int;

    INSERT INTO cuenta_items (cuenta_id, producto_id, cantidad, precio_unitario, subtotal, iva, total, estado, created_at)
    VALUES (v_cuenta, v_prod.id, v_cant, v_prod.precio, v_prod.precio * v_cant,
            round(v_prod.precio * v_cant * 0.16, 2), round(v_prod.precio * v_cant * 1.16, 2), 'entregado', p_ts)
    RETURNING id INTO v_item;

    v_base := v_base + v_prod.precio * v_cant;

    IF v_prod.requiere_cocina THEN
      IF v_comanda IS NULL THEN
        INSERT INTO comandas (club_id, cuenta_id, estacion, estado, created_at, updated_at)
        VALUES (p_club, v_cuenta, v_prod.estacion_destino, 'cobrado', p_ts, p_ts + interval '9 minutes')
        RETURNING id INTO v_comanda;
      END IF;
      INSERT INTO comanda_items (comanda_id, cuenta_item_id, producto_id, cantidad, estado, nombre, precio_unitario, created_at)
      VALUES (v_comanda, v_item, v_prod.id, v_cant, 'entregado', v_prod.nombre, v_prod.precio, p_ts);
    END IF;
  END LOOP;

  -- Regla "Descuento Socio": 10 %
  IF v_es_socio THEN
    v_desc := round(v_base * 0.10, 2);
  END IF;
  v_base  := v_base - v_desc;
  v_iva   := round(v_base * 0.16, 2);
  v_total := v_base + v_iva;

  UPDATE cuentas
  SET subtotal = v_base, iva = v_iva, total = v_total, descuento_total = v_desc
  WHERE id = v_cuenta;

  v_propina := CASE WHEN p_con_propina AND p_modo IN ('credito', 'debito') THEN round(v_total * 0.10) ELSE 0 END;

  IF p_modo = 'mixto' THEN
    v_mitad := round(v_total / 2, 2);
    INSERT INTO pagos (cuenta_id, metodo, monto, created_at) VALUES
      (v_cuenta, 'efectivo', v_mitad, p_ts),
      (v_cuenta, 'credito', v_total - v_mitad, p_ts);
    INSERT INTO movimientos_caja (caja_id, tipo, concepto, monto, metodo, categoria, created_at) VALUES
      (p_caja, 'ingreso', 'Venta POS #' || v_ticket, v_mitad, 'efectivo', 'venta', p_ts),
      (p_caja, 'ingreso', 'Venta POS #' || v_ticket, v_total - v_mitad, 'credito', 'venta', p_ts);
  ELSE
    INSERT INTO pagos (cuenta_id, metodo, monto, propina, referencia, created_at)
    VALUES (v_cuenta, p_modo::metodo_pago, v_total, v_propina,
            CASE WHEN p_modo <> 'efectivo' THEN 'AUT-' || lpad((floor(random() * 1000000))::int::text, 6, '0') END, p_ts);
    INSERT INTO movimientos_caja (caja_id, tipo, concepto, monto, metodo, categoria, created_at)
    VALUES (p_caja, 'ingreso', 'Venta POS #' || v_ticket, v_total, p_modo, 'venta', p_ts);
    IF v_propina > 0 THEN
      INSERT INTO movimientos_caja (caja_id, tipo, concepto, monto, metodo, categoria, created_at)
      VALUES (p_caja, 'ingreso', 'Propina ticket #' || v_ticket, v_propina, p_modo, 'propina', p_ts);
    END IF;
  END IF;

  RETURN v_cuenta;
END;
$$;

-- ============================================================
-- Historia (7 días) y día de hoy del club principal
-- ============================================================

DO $seed$
DECLARE
  c_club     constant uuid := 'a0000000-0000-4000-8000-000000000001';
  c_admin    constant uuid := 'a2000000-0000-4000-8000-000000000002';
  c_cajero1  constant uuid := 'a2000000-0000-4000-8000-000000000003';
  c_cajero2  constant uuid := 'a2000000-0000-4000-8000-000000000004';
  c_tz       constant text := 'America/Mexico_City';
  c_slots    constant time[] := ARRAY['07:00','08:30','10:00','11:30','13:00','14:30','16:00','17:30','19:00','20:30']::time[];
  c_walkins  constant text[] := ARRAY['Luis Ortega', 'Marco Treviño', 'Ana Paula Garza', 'Equipo Los Cracks',
                                      'Torneo interno', 'Clase Prof. Sánchez', 'Gustavo Leal', 'Familia Cantú'];
  c_motivos  constant text[] := ARRAY['Cliente avisó que no podrá asistir', 'Lluvia', 'Cambio de horario', 'Lesión de un jugador'];
  c_gastos   constant text[] := ARRAY['Compra de hielo', 'Garrafones de agua', 'Artículos de limpieza', 'Cambio de focos'];
  c_modos    constant text[] := ARRAY['efectivo', 'efectivo', 'efectivo', 'efectivo', 'credito', 'credito', 'debito', 'mixto'];

  v_ahora    timestamptz := now();
  v_hoy      date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_hora     int  := extract(hour FROM now() AT TIME ZONE 'America/Mexico_City')::int;
  v_dia      date;
  v_ini      timestamptz[];
  v_fin      timestamptz[];
  v_cajas    uuid[];
  v_turnos   uuid[];
  v_res      jsonb;
  v_pista    record;
  v_slot     time;
  v_prob     numeric;
  v_r        numeric;
  v_estado   text;
  v_precio   numeric;
  v_cli      uuid;
  v_cli_nom  text;
  v_ts       timestamptz;
  v_reserva  uuid;
  v_n        int;
  v_efectivo numeric;
  v_esperado numeric;
  v_contado  numeric;
  v_retiro   numeric;

  -- hoy
  v_caja     uuid;
  v_turno    uuid;
  v_ini_hoy  timestamptz;
  v_t0       time;
  v_t0_fin   time;
  v_t1       time;
  v_t1_fin   time;
  v_res_live uuid;
  v_res_mesa uuid;
  v_res_canc uuid;
  v_cuenta   uuid;
  v_comanda  uuid;
  v_item     uuid;
  v_can      uuid;
  v_stock    numeric;
BEGIN
  -- ----------------------------------------------------------
  -- 7 días de historia: dos turnos diarios (mañana y tarde)
  -- ----------------------------------------------------------
  FOR i IN REVERSE 7..1 LOOP
    v_dia := v_hoy - i;
    v_ini := ARRAY[(v_dia + time '07:00') AT TIME ZONE c_tz, (v_dia + time '15:00') AT TIME ZONE c_tz];
    v_fin := ARRAY[v_ini[1] + interval '8 hours', v_ini[2] + interval '8 hours'];
    v_cajas := ARRAY[NULL, NULL]::uuid[];
    v_turnos := ARRAY[NULL, NULL]::uuid[];

    -- Apertura de turno con la RPC; después se retrocede la fecha
    FOR s IN 1..2 LOOP
      PERFORM pg_temp.actuar_como(CASE s WHEN 1 THEN 'cajero1@setpoint.test' ELSE 'cajero2@setpoint.test' END);
      v_res := rpc_open_caja(c_club, CASE s WHEN 1 THEN c_cajero1 ELSE c_cajero2 END,
                             CASE s WHEN 1 THEN 'manana' ELSE 'tarde' END, 1500);
      v_cajas[s]  := (v_res ->> 'cajaId')::uuid;
      v_turnos[s] := (v_res ->> 'turnoId')::uuid;
      UPDATE turnos SET inicio = v_ini[s] WHERE id = v_turnos[s];
      UPDATE cajas SET created_at = v_ini[s] WHERE id = v_cajas[s];
      UPDATE movimientos_caja SET created_at = v_ini[s], categoria = 'fondo_inicial' WHERE caja_id = v_cajas[s];
    END LOOP;

    -- Reservas del día
    FOR v_pista IN SELECT id, nombre FROM pistas WHERE club_id = c_club AND activa ORDER BY orden LOOP
      FOREACH v_slot IN ARRAY c_slots LOOP
        v_prob := CASE WHEN v_slot >= time '17:30' THEN 0.70 WHEN v_slot < time '10:00' THEN 0.45 ELSE 0.32 END
                  + CASE WHEN extract(isodow FROM v_dia) IN (6, 7) THEN 0.15 ELSE 0 END;
        CONTINUE WHEN random() > v_prob;

        v_precio := CASE WHEN v_slot < time '12:00' THEN 525 WHEN v_slot < time '18:00' THEN 600 ELSE 750 END;
        v_r := random();
        v_estado := CASE WHEN v_r < 0.86 THEN 'finalizada' WHEN v_r < 0.94 THEN 'cancelada' ELSE 'noshow' END;
        v_ts := (v_dia + v_slot) AT TIME ZONE c_tz;

        IF random() < 0.7 THEN
          SELECT id, nombre INTO v_cli, v_cli_nom FROM clientes WHERE club_id = c_club ORDER BY random() LIMIT 1;
        ELSE
          v_cli := NULL;
          v_cli_nom := c_walkins[1 + floor(random() * array_length(c_walkins, 1))::int];
        END IF;

        INSERT INTO reservas (club_id, pista_id, cliente_id, nombre_cliente, fecha, hora_inicio, hora_fin, estado, precio, created_at)
        VALUES (c_club, v_pista.id, v_cli, v_cli_nom, v_dia, v_slot, v_slot + interval '90 minutes',
                v_estado::reserva_estado, v_precio, v_ts - random() * interval '72 hours')
        RETURNING id INTO v_reserva;

        IF v_estado = 'finalizada' THEN
          INSERT INTO movimientos_caja (caja_id, tipo, concepto, monto, metodo, categoria, created_at)
          VALUES (v_cajas[CASE WHEN v_slot < time '15:00' THEN 1 ELSE 2 END], 'ingreso',
                  'Renta de cancha — ' || v_pista.nombre || ' ' || to_char(v_slot, 'HH24:MI'), v_precio,
                  (ARRAY['efectivo', 'efectivo', 'credito', 'debito'])[1 + floor(random() * 4)::int], 'cancha', v_ts);
        ELSIF v_estado = 'cancelada' THEN
          INSERT INTO cancelaciones (club_id, reserva_id, cantidad, monto, motivo, tipo, estado, cancelado_por, created_at)
          VALUES (c_club, v_reserva, 1, 0, c_motivos[1 + floor(random() * array_length(c_motivos, 1))::int],
                  'pre_cobro', 'ejecutada', CASE WHEN v_slot < time '15:00' THEN c_cajero1 ELSE c_cajero2 END,
                  v_ts - interval '3 hours');
        END IF;
      END LOOP;
    END LOOP;

    -- Ventas, gastos y cierre de cada turno
    FOR s IN 1..2 LOOP
      PERFORM pg_temp.actuar_como(CASE s WHEN 1 THEN 'cajero1@setpoint.test' ELSE 'cajero2@setpoint.test' END);

      v_n := 6 + floor(random() * 6)::int;
      FOR k IN 1..v_n LOOP
        SELECT id INTO v_cli FROM clientes WHERE club_id = c_club ORDER BY random() LIMIT 1;
        PERFORM pg_temp.venta(
          c_club, v_cajas[s],
          v_ini[s] + interval '10 minutes' + random() * interval '7 hours 30 minutes',
          CASE WHEN random() < 0.6 THEN v_cli END,
          1 + floor(random() * 3)::int,
          c_modos[1 + floor(random() * array_length(c_modos, 1))::int],
          random() < 0.4);
      END LOOP;

      IF random() < 0.5 THEN
        INSERT INTO movimientos_caja (caja_id, tipo, concepto, monto, metodo, categoria, created_at)
        VALUES (v_cajas[s], 'egreso', c_gastos[1 + floor(random() * array_length(c_gastos, 1))::int],
                80 + 20 * floor(random() * 12), 'efectivo', 'petty_cash', v_ini[s] + interval '3 hours');
      END IF;

      SELECT 1500
             + coalesce(sum(monto) FILTER (WHERE tipo = 'ingreso' AND metodo = 'efectivo'), 0)
             - coalesce(sum(monto) FILTER (WHERE tipo IN ('egreso', 'retiro')), 0)
      INTO v_efectivo FROM movimientos_caja WHERE caja_id = v_cajas[s];

      -- Corte parcial en el turno de tarde, si hay efectivo de sobra
      v_retiro := floor((v_efectivo - 2000) / 500) * 500;
      IF s = 2 AND v_retiro >= 500 THEN
        INSERT INTO movimientos_caja (caja_id, tipo, concepto, monto, metodo, categoria, created_at)
        VALUES (v_cajas[s], 'retiro', 'Corte parcial — retiro a caja fuerte', v_retiro, 'efectivo', 'retiro',
                v_ini[s] + interval '5 hours');
        v_efectivo := v_efectivo - v_retiro;
      END IF;

      v_esperado := v_efectivo;
      v_contado  := v_esperado + (ARRAY[0, 0, 0, 0, -20, 10, -50, 5])[1 + floor(random() * 8)::int];

      -- Cierre con la RPC; después se retrocede la fecha
      PERFORM rpc_close_caja(v_cajas[s], v_turnos[s], v_contado, v_esperado);

      UPDATE turnos
      SET fin = v_fin[s],
          shift_review_at = CASE WHEN i >= 2 THEN v_fin[s] + interval '12 minutes' END
      WHERE id = v_turnos[s];

      UPDATE cajas c
      SET cerrada_at      = v_fin[s],
          estado          = CASE WHEN i >= 3 THEN 'revisada' ELSE 'cerrada' END::caja_estado,
          total_tarjeta   = (SELECT coalesce(sum(monto), 0) FROM movimientos_caja m
                             WHERE m.caja_id = c.id AND m.tipo = 'ingreso' AND m.metodo IN ('credito', 'debito')
                               AND m.categoria <> 'propina'),
          total_propinas  = (SELECT coalesce(sum(monto), 0) FROM movimientos_caja m
                             WHERE m.caja_id = c.id AND m.categoria = 'propina'),
          arqueo_snapshot = rpc_get_arqueo_turno(c.id)
      WHERE c.id = v_cajas[s];
    END LOOP;

    -- Métricas del día (lo que lee /reportes para días ya cerrados)
    INSERT INTO metricas_diarias (club_id, fecha, ventas_total, ticket_promedio, num_transacciones, ocupacion_pistas_pct, top_productos)
    SELECT c_club, v_dia,
           coalesce(sum(cu.total), 0),
           coalesce(round(avg(cu.total), 2), 0),
           count(*),
           (SELECT round(100.0 * count(*) * 1.5 / (16 * (SELECT count(*) FROM pistas WHERE club_id = c_club AND activa)), 2)
            FROM reservas r WHERE r.club_id = c_club AND r.fecha = v_dia AND r.estado IN ('confirmada', 'checkin', 'finalizada')),
           (SELECT coalesce(jsonb_agg(t), '[]'::jsonb) FROM (
              SELECT p.nombre, sum(ci.cantidad)::int AS cantidad, sum(ci.subtotal) AS monto
              FROM cuenta_items ci
              JOIN cuentas c2 ON c2.id = ci.cuenta_id
              JOIN productos p ON p.id = ci.producto_id
              WHERE c2.club_id = c_club AND c2.caja_id = ANY (v_cajas)
              GROUP BY p.nombre ORDER BY sum(ci.subtotal) DESC LIMIT 5) t)
    FROM cuentas cu
    WHERE cu.club_id = c_club AND cu.caja_id = ANY (v_cajas) AND cu.estado = 'pagada';
  END LOOP;

  -- Entradas de mercancía de la semana
  INSERT INTO movimientos_stock (club_id, producto_id, tipo, cantidad, stock_anterior, stock_posterior, motivo, empleado_id, created_at) VALUES
    (c_club, 'a5000000-0000-4000-8000-000000000008', 'entrada', 48, 12, 60, 'Compra a proveedor — nota 4390', c_admin, v_ahora - interval '5 days'),
    (c_club, 'a5000000-0000-4000-8000-00000000000d', 'entrada', 12,  2, 14, 'Compra a proveedor — nota 4402', c_admin, v_ahora - interval '4 days'),
    (c_club, 'a5000000-0000-4000-8000-00000000000d', 'salida',   6, 14,  8, 'Torneo interno: bolas de juego', c_admin, v_ahora - interval '2 days'),
    (c_club, 'a5000000-0000-4000-8000-00000000000f', 'ajuste',   2, 22, 20, 'Conteo físico semanal',          c_admin, v_ahora - interval '2 days');

  -- ----------------------------------------------------------
  -- HOY: turno abierto, con actividad repartida desde su apertura
  -- ----------------------------------------------------------
  PERFORM pg_temp.actuar_como('cajero1@setpoint.test');

  v_res   := rpc_open_caja(c_club, c_cajero1,
                           CASE WHEN v_hora < 12 THEN 'manana' WHEN v_hora < 18 THEN 'tarde' ELSE 'noche' END, 1500);
  v_caja  := (v_res ->> 'cajaId')::uuid;
  v_turno := (v_res ->> 'turnoId')::uuid;

  -- El turno "abrió" hace unas horas (sin salirse del día de hoy)
  v_ini_hoy := greatest(v_hoy::timestamp AT TIME ZONE c_tz, v_ahora - interval '4 hours');
  UPDATE turnos SET inicio = v_ini_hoy WHERE id = v_turno;
  UPDATE cajas SET created_at = v_ini_hoy WHERE id = v_caja;
  UPDATE movimientos_caja SET created_at = v_ini_hoy WHERE caja_id = v_caja;

  -- Ventas de mostrador
  FOR k IN 1..9 LOOP
    SELECT id INTO v_cli FROM clientes WHERE club_id = c_club ORDER BY random() LIMIT 1;
    PERFORM pg_temp.venta(
      c_club, v_caja, v_ini_hoy + (v_ahora - v_ini_hoy) * (k / 10.0),
      CASE WHEN random() < 0.6 THEN v_cli END, 1 + floor(random() * 3)::int,
      c_modos[1 + floor(random() * array_length(c_modos, 1))::int], random() < 0.4);
  END LOOP;

  -- Gasto menor y corte parcial (lo que registra CashMovementModal / PartialCutModal)
  INSERT INTO movimientos_caja (caja_id, tipo, concepto, monto, metodo, categoria, created_at) VALUES
    (v_caja, 'egreso', 'Compra de hielo', 120, 'efectivo', 'petty_cash', v_ini_hoy + (v_ahora - v_ini_hoy) * 0.35),
    (v_caja, 'retiro', 'Corte parcial — retiro a caja fuerte', 500, 'efectivo', 'retiro', v_ini_hoy + (v_ahora - v_ini_hoy) * 0.8);

  -- Reservas de hoy. Los horarios dependen de la hora actual para que siempre
  -- haya canchas terminadas, en juego y por venir.
  v_t0     := make_time(v_hora, 0, 0);
  v_t0_fin := CASE WHEN v_hora >= 22 THEN time '23:59' ELSE v_t0 + interval '90 minutes' END;
  v_t1     := CASE WHEN v_hora >= 22 THEN time '23:00' ELSE v_t0 + interval '2 hours' END;
  v_t1_fin := CASE WHEN v_hora >= 22 THEN time '23:59' ELSE v_t1 + interval '90 minutes' END;

  FOR v_pista IN SELECT id, nombre FROM pistas WHERE club_id = c_club AND activa AND NOT en_mantenimiento ORDER BY orden LOOP
    FOREACH v_slot IN ARRAY c_slots LOOP
      v_precio := CASE WHEN v_slot < time '12:00' THEN 525 WHEN v_slot < time '18:00' THEN 600 ELSE 750 END;
      SELECT id, nombre INTO v_cli, v_cli_nom FROM clientes WHERE club_id = c_club ORDER BY random() LIMIT 1;

      IF v_slot + interval '90 minutes' <= v_t0 AND random() < 0.55 THEN
        -- Ya terminó: finalizada y cobrada
        INSERT INTO reservas (club_id, pista_id, cliente_id, nombre_cliente, fecha, hora_inicio, hora_fin, estado, precio, created_at)
        VALUES (c_club, v_pista.id, v_cli, v_cli_nom, v_hoy, v_slot, v_slot + interval '90 minutes', 'finalizada', v_precio,
                v_ini_hoy - random() * interval '48 hours');
        INSERT INTO movimientos_caja (caja_id, tipo, concepto, monto, metodo, categoria, created_at)
        VALUES (v_caja, 'ingreso', 'Renta de cancha — ' || v_pista.nombre || ' ' || to_char(v_slot, 'HH24:MI'), v_precio,
                (ARRAY['efectivo', 'credito', 'debito'])[1 + floor(random() * 3)::int], 'cancha',
                greatest(v_ini_hoy, least(v_ahora, (v_hoy + v_slot) AT TIME ZONE c_tz)));
      ELSIF v_slot >= v_t1_fin AND random() < 0.45 THEN
        -- Más tarde: confirmada
        INSERT INTO reservas (club_id, pista_id, cliente_id, nombre_cliente, fecha, hora_inicio, hora_fin, estado, precio, notas, created_at)
        VALUES (c_club, v_pista.id, v_cli, v_cli_nom, v_hoy, v_slot, v_slot + interval '90 minutes', 'confirmada', v_precio,
                CASE WHEN random() < 0.25 THEN 'Pidieron renta de palas' END, v_ini_hoy - random() * interval '48 hours');
      END IF;
    END LOOP;
  END LOOP;

  -- En juego ahora: se crean confirmadas y se les hace check-in con la RPC
  INSERT INTO reservas (club_id, pista_id, cliente_id, nombre_cliente, fecha, hora_inicio, hora_fin, estado, precio, notas)
  VALUES (c_club, 'a3000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000001', 'Fernando García',
          v_hoy, v_t0, v_t0_fin, 'confirmada', 750, 'Torneo local — semifinal')
  RETURNING id INTO v_res_live;
  PERFORM rpc_check_in_with_payment(v_res_live, 750, 'credito', v_caja, 'Check-in Pista 1 — Central · Fernando García');

  INSERT INTO reservas (club_id, pista_id, cliente_id, nombre_cliente, fecha, hora_inicio, hora_fin, estado, precio)
  VALUES (c_club, 'a3000000-0000-4000-8000-000000000002', 'a6000000-0000-4000-8000-000000000005', 'Héctor Martínez',
          v_hoy, v_t0, v_t0_fin, 'confirmada', 600)
  RETURNING id INTO v_res_mesa;
  PERFORM rpc_check_in_with_payment(v_res_mesa, 600, 'efectivo', v_caja, 'Check-in Pista 2 · Héctor Martínez');

  -- Próximas: una se queda confirmada y otra se cancela con la RPC
  INSERT INTO reservas (club_id, pista_id, cliente_id, nombre_cliente, fecha, hora_inicio, hora_fin, estado, precio)
  VALUES (c_club, 'a3000000-0000-4000-8000-000000000003', NULL, 'Clase Prof. Sánchez', v_hoy, v_t1, v_t1_fin, 'confirmada', 600);

  INSERT INTO reservas (club_id, pista_id, cliente_id, nombre_cliente, fecha, hora_inicio, hora_fin, estado, precio)
  VALUES (c_club, 'a3000000-0000-4000-8000-000000000005', 'a6000000-0000-4000-8000-000000000006', 'Daniela Díaz',
          v_hoy, v_t1, v_t1_fin, 'confirmada', 600)
  RETURNING id INTO v_res_canc;
  PERFORM rpc_cancelar_reserva(c_club, v_res_canc, 'Cliente avisó que no podrá asistir', c_cajero1);

  -- Cuenta abierta de la Pista 2: consumos cargados a la cancha, aún sin cobrar
  INSERT INTO cuentas (club_id, numero_ticket, cliente_id, reserva_id, caja_id, estado, subtotal, iva, total, created_at)
  VALUES (c_club, 'SP-PISTA2', 'a6000000-0000-4000-8000-000000000005', v_res_mesa, v_caja, 'abierta',
          2 * 50 + 90 + 2 * 45, round((2 * 50 + 90 + 2 * 45) * 0.16, 2), round((2 * 50 + 90 + 2 * 45) * 1.16, 2),
          v_ahora - interval '25 minutes')
  RETURNING id INTO v_cuenta;

  INSERT INTO comandas (club_id, cuenta_id, estacion, estado, notas, created_at, updated_at)
  VALUES (c_club, v_cuenta, 'barra', 'entregado', 'Pista 2', v_ahora - interval '25 minutes', v_ahora - interval '20 minutes')
  RETURNING id INTO v_comanda;

  INSERT INTO cuenta_items (cuenta_id, producto_id, cantidad, precio_unitario, subtotal, iva, total, estado, created_at)
  VALUES (v_cuenta, 'a5000000-0000-4000-8000-000000000007', 2, 50, 100, 16, 116, 'entregado', v_ahora - interval '25 minutes')
  RETURNING id INTO v_item;
  INSERT INTO comanda_items (comanda_id, cuenta_item_id, producto_id, cantidad, estado, nombre, precio_unitario)
  VALUES (v_comanda, v_item, 'a5000000-0000-4000-8000-000000000007', 2, 'entregado', 'Bebida Isotónica', 50);

  INSERT INTO cuenta_items (cuenta_id, producto_id, cantidad, precio_unitario, subtotal, iva, total, estado, notas, created_at)
  VALUES (v_cuenta, 'a5000000-0000-4000-8000-000000000008', 2, 45, 90, 14.40, 104.40, 'pendiente', 'Para el final del partido',
          v_ahora - interval '6 minutes');

  INSERT INTO comandas (club_id, cuenta_id, estacion, estado, notas, created_at, updated_at)
  VALUES (c_club, v_cuenta, 'cocina', 'preparando', 'Pista 2 — sin cebolla', v_ahora - interval '8 minutes', v_ahora - interval '5 minutes')
  RETURNING id INTO v_comanda;

  INSERT INTO cuenta_items (cuenta_id, producto_id, cantidad, precio_unitario, subtotal, iva, total, estado, notas, created_at)
  VALUES (v_cuenta, 'a5000000-0000-4000-8000-000000000001', 1, 90, 90, 14.40, 104.40, 'en_proceso', 'Sin cebolla', v_ahora - interval '8 minutes')
  RETURNING id INTO v_item;
  INSERT INTO comanda_items (comanda_id, cuenta_item_id, producto_id, cantidad, estado, nombre, precio_unitario)
  VALUES (v_comanda, v_item, 'a5000000-0000-4000-8000-000000000001', 1, 'en_proceso', 'Bocadillo Jamón', 90);

  -- Cancelación antes de cobrar (ya preparado → genera merma), con la RPC
  PERFORM rpc_cancelar_item_pre_cobro(c_club, v_item, 'El cliente cambió de opinión', c_cajero1, true, true);

  -- Comandas de mostrador en cada etapa del tablero (como las crea createComanda)
  INSERT INTO comandas (club_id, estacion, estado, notas, created_at, updated_at)
  VALUES (c_club, 'cocina', 'pendiente', 'Mesa Barra 2', v_ahora - interval '2 minutes', NULL)
  RETURNING id INTO v_comanda;
  INSERT INTO comanda_items (comanda_id, producto_id, cantidad, estado, nombre, precio_unitario) VALUES
    (v_comanda, 'a5000000-0000-4000-8000-000000000002', 2, 'pendiente', 'Tostada Aguacate', 75),
    (v_comanda, 'a5000000-0000-4000-8000-000000000005', 2, 'pendiente', 'Café Solo', 28);

  INSERT INTO comandas (club_id, estacion, estado, notas, created_at, updated_at)
  VALUES (c_club, 'cocina', 'listo', 'Terraza', v_ahora - interval '16 minutes', v_ahora - interval '3 minutes')
  RETURNING id INTO v_comanda;
  INSERT INTO comanda_items (comanda_id, producto_id, cantidad, estado, nombre, precio_unitario) VALUES
    (v_comanda, 'a5000000-0000-4000-8000-000000000004', 1, 'listo', 'Yogur con Granola', 65),
    (v_comanda, 'a5000000-0000-4000-8000-000000000003', 1, 'listo', 'Fruta de Temporada', 55);

  -- Cancelaciones después del cobro: una pendiente, una aprobada (reembolso en
  -- efectivo) y una rechazada. Se toman tres artículos ya cobrados hoy.
  SELECT ci.id INTO v_item FROM cuenta_items ci JOIN cuentas c ON c.id = ci.cuenta_id
  WHERE c.caja_id = v_caja AND c.estado = 'pagada' ORDER BY ci.created_at, ci.id LIMIT 1;
  PERFORM rpc_solicitar_cancelacion_post_cobro(c_club, v_item, 'Producto equivocado', c_cajero1, 'efectivo');

  SELECT ci.id INTO v_item FROM cuenta_items ci JOIN cuentas c ON c.id = ci.cuenta_id
  WHERE c.caja_id = v_caja AND c.estado = 'pagada' ORDER BY ci.created_at, ci.id LIMIT 1 OFFSET 1;
  v_can := rpc_solicitar_cancelacion_post_cobro(c_club, v_item, 'Bebida en mal estado', c_cajero1, 'efectivo');
  PERFORM pg_temp.actuar_como('admin@setpoint.test');
  PERFORM rpc_aprobar_cancelacion(v_can, c_admin, v_caja, false);

  PERFORM pg_temp.actuar_como('cajero1@setpoint.test');
  SELECT ci.id INTO v_item FROM cuenta_items ci JOIN cuentas c ON c.id = ci.cuenta_id
  WHERE c.caja_id = v_caja AND c.estado = 'pagada' ORDER BY ci.created_at, ci.id LIMIT 1 OFFSET 2;
  v_can := rpc_solicitar_cancelacion_post_cobro(c_club, v_item, 'El cliente se arrepintió', c_cajero1, 'credito');
  PERFORM pg_temp.actuar_como('admin@setpoint.test');
  PERFORM rpc_aprobar_cancelacion(v_can, c_admin, v_caja, true, 'El producto ya fue consumido');

  -- Ajustes de inventario de hoy, con la RPC (la app le pasa el stock que conoce)
  SELECT stock_actual INTO v_stock FROM productos WHERE id = 'a5000000-0000-4000-8000-000000000006';
  PERFORM rpc_adjust_stock(c_club, 'a5000000-0000-4000-8000-000000000006', 'entrada', 24, v_stock, 'Compra a proveedor — nota 4471');
  SELECT stock_actual INTO v_stock FROM productos WHERE id = 'a5000000-0000-4000-8000-000000000007';
  PERFORM rpc_adjust_stock(c_club, 'a5000000-0000-4000-8000-000000000007', 'merma', 2, v_stock, 'Botellas dañadas en almacén');
  SELECT stock_actual INTO v_stock FROM productos WHERE id = 'a5000000-0000-4000-8000-00000000000e';
  PERFORM rpc_adjust_stock(c_club, 'a5000000-0000-4000-8000-00000000000e', 'ajuste', 3, v_stock, 'Conteo físico semanal');
  SELECT stock_actual INTO v_stock FROM productos WHERE id = 'a5000000-0000-4000-8000-000000000009';
  PERFORM rpc_adjust_stock(c_club, 'a5000000-0000-4000-8000-000000000009', 'salida', 1, v_stock, 'Pala rota, baja de inventario');

  -- Permisos por rol: la RPC crea los valores por defecto de cada club
  PERFORM rpc_get_permisos_rol(c_club);
  PERFORM rpc_get_permisos_rol('b0000000-0000-4000-8000-000000000001');
  -- ...y el propietario le quitó a los cajeros las cancelaciones post-cobro
  UPDATE permisos_rol SET permitido = false
  WHERE club_id = c_club AND rol = 'cajero' AND accion = 'cancelacion_post_cobro';
END;
$seed$;

-- Estadísticas de cliente a partir de sus compras
UPDATE clientes c
SET stats = jsonb_build_object(
      'visitas', s.visitas,
      'ticket_promedio', round(s.ticket_promedio),
      'ultima_visita', to_char(s.ultima AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
FROM (
  SELECT cliente_id, count(*) AS visitas, avg(total) AS ticket_promedio, max(created_at) AS ultima
  FROM cuentas
  WHERE estado = 'pagada' AND cliente_id IS NOT NULL
  GROUP BY cliente_id
) s
WHERE s.cliente_id = c.id;
