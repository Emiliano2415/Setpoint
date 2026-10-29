-- ============================================================
-- Módulo de Mantenimiento (Ingeniería de Planta)
--
-- Las pistas son los ACTIVOS de la planta. Este módulo da:
--   - ficha técnica de cada pista (pista_ficha) y su estado operativo
--   - mantenimiento preventivo (tareas_preventivas) por calendario o por horas de uso
--   - mantenimiento correctivo (ordenes_trabajo, folio OT-0001 por club)
--   - bloqueo de agenda (bloqueos_pista) y un trigger que impide reservar encima
--   - inspecciones por norma NOM (normas, norma_puntos, inspecciones, inspeccion_resultados)
--   - refacciones con punto de reorden (refacciones, movimientos_refaccion)
--   - indicadores: ocupación, disponibilidad, MTBF, MTTR, costo por hora de juego
--
-- Decisiones de diseño
--   * Convenciones: club_id en todas las tablas + RLS `club_isolation` por
--     (SELECT current_club_id()) + GRANT a `authenticated` (migraciones
--     20261007000004/05). Las RPC usan current_club_id()/current_uid(), nunca
--     auth.uid() (ver 20261007000006: SP001).
--   * Los valores acotados (estado, prioridad, tipo...) son text + CHECK, no
--     enums: añadir un valor es un ALTER de CHECK, no de tipo.
--   * Claves foráneas compuestas (id, club_id): una fila no puede apuntar a
--     una pista/empleado/orden de otro club aunque se escriba directo por la API.
--   * Horario de operación del club: 07:00 a 22:00 (las reservas del sistema
--     van de 07:00 a 22:00). Es un parámetro de los indicadores
--     (p_apertura / p_cierre). Zona horaria: America/Mexico_City (UTC-6).
--   * Las normas pueden ser GLOBALES (club_id NULL: catálogo común, solo
--     lectura para los clubes) o propias de un club. Este archivo siembra el
--     catálogo global de 6 NOM. Los datos de demostración (fichas, tareas,
--     órdenes, inspecciones, refacciones) NO están aquí: viven en
--     supabase/seed-mantenimiento.sql, para que esta migración sea idéntica en
--     cualquier base y no dependa de que exista el club de demostración.
--   * La existencia de refacciones solo cambia por movimientos
--     (movimientos_refaccion): un trigger la actualiza y rechaza salidas que
--     la dejarían negativa. Los movimientos no se editan ni se borran.
--   * pistas.en_mantenimiento (módulo Pistas) y pista_ficha.estado_operativo
--     se mantienen sincronizados con dos triggers: una sola verdad.
--   * Errores propios: SP002 = la pista está bloqueada para esa fecha.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Unicidad (id, club_id) para las claves foráneas compuestas
-- ------------------------------------------------------------
ALTER TABLE public.pistas    ADD CONSTRAINT pistas_id_club_key    UNIQUE (id, club_id);
ALTER TABLE public.empleados ADD CONSTRAINT empleados_id_club_key UNIQUE (id, club_id);

-- ------------------------------------------------------------
-- 1. Ficha técnica de la pista
-- ------------------------------------------------------------
CREATE TABLE public.pista_ficha (
  pista_id                 uuid PRIMARY KEY,
  club_id                  uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  largo_m                  numeric(5,2),
  ancho_m                  numeric(5,2),
  altura_libre_m           numeric(5,2),
  superficie               text,
  superficie_instalada_en  date,
  cerramiento              text,
  luminarias_num           integer CHECK (luminarias_num IS NULL OR luminarias_num >= 0),
  luminaria_potencia_w     integer CHECK (luminaria_potencia_w IS NULL OR luminaria_potencia_w >= 0),
  lux_medido               numeric(7,1),
  uniformidad              numeric(4,2),
  medicion_en              date,
  estado_operativo         text NOT NULL DEFAULT 'operativa'
                             CHECK (estado_operativo IN ('operativa', 'fuera_de_servicio', 'mantenimiento')),
  observaciones            text,
  updated_at               timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (pista_id, club_id) REFERENCES pistas (id, club_id) ON DELETE CASCADE
);
CREATE INDEX pista_ficha_club_idx ON public.pista_ficha (club_id);

COMMENT ON TABLE public.pista_ficha IS 'Ficha técnica del activo (una por pista).';
COMMENT ON COLUMN public.pista_ficha.estado_operativo IS
  'operativa | fuera_de_servicio | mantenimiento. Lo recalcula _mtto_recalcular_pista() desde los bloqueos; se refleja en pistas.en_mantenimiento.';
COMMENT ON COLUMN public.pista_ficha.uniformidad IS 'Uniformidad de iluminancia (Emin/Emed), 0 a 1.';

-- Toda pista nueva trae su ficha vacía; las existentes se rellenan aquí.
CREATE OR REPLACE FUNCTION public._mtto_crear_ficha()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO pista_ficha (pista_id, club_id, estado_operativo)
  VALUES (NEW.id, NEW.club_id, CASE WHEN NEW.en_mantenimiento THEN 'mantenimiento' ELSE 'operativa' END)
  ON CONFLICT (pista_id) DO NOTHING;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_pistas_crear_ficha
  AFTER INSERT ON public.pistas
  FOR EACH ROW EXECUTE FUNCTION public._mtto_crear_ficha();

-- Backfill: si la pista ya estaba marcada en mantenimiento, la ficha lo respeta
-- (el trigger de sincronización se crea después, no toca esos valores).
INSERT INTO public.pista_ficha (pista_id, club_id, estado_operativo)
SELECT p.id, p.club_id, CASE WHEN p.en_mantenimiento THEN 'mantenimiento' ELSE 'operativa' END
FROM public.pistas p
ON CONFLICT (pista_id) DO NOTHING;

-- ------------------------------------------------------------
-- 2. Refacciones y sus movimientos
-- ------------------------------------------------------------
CREATE TABLE public.refacciones (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id               uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  nombre                text NOT NULL,
  unidad                text NOT NULL DEFAULT 'pza',
  existencia            numeric(12,2) NOT NULL DEFAULT 0 CHECK (existencia >= 0),
  stock_seguridad       numeric(12,2) NOT NULL DEFAULT 0 CHECK (stock_seguridad >= 0),
  tiempo_entrega_dias   integer NOT NULL DEFAULT 7 CHECK (tiempo_entrega_dias >= 0),
  costo_unitario        numeric(12,2) NOT NULL DEFAULT 0 CHECK (costo_unitario >= 0),
  proveedor             text,
  activa                boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, club_id)
);
CREATE INDEX refacciones_club_idx ON public.refacciones (club_id);

COMMENT ON COLUMN public.refacciones.existencia IS 'Solo cambia por movimientos_refaccion (trigger). No se edita a mano.';
COMMENT ON COLUMN public.refacciones.costo_unitario IS 'Costo de la última compra: una entrada con costo lo actualiza.';

CREATE TABLE public.movimientos_refaccion (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id              uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  refaccion_id         uuid NOT NULL,
  tipo                 text NOT NULL CHECK (tipo IN ('entrada', 'salida')),
  cantidad             numeric(12,2) NOT NULL CHECK (cantidad > 0),
  costo_unitario       numeric(12,2),            -- costo vigente al mover (si no se manda, el de la refacción)
  existencia_posterior numeric(12,2),            -- lo llena el trigger
  orden_id             uuid,                     -- salidas por orden de trabajo
  motivo               text,
  empleado_id          uuid,
  created_at           timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (refaccion_id, club_id) REFERENCES refacciones (id, club_id) ON DELETE CASCADE
);
CREATE INDEX movimientos_refaccion_ref_idx   ON public.movimientos_refaccion (refaccion_id, created_at DESC);
CREATE INDEX movimientos_refaccion_orden_idx ON public.movimientos_refaccion (orden_id) WHERE orden_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public._mtto_aplicar_movimiento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ref refacciones%ROWTYPE;
  v_nueva numeric;
BEGIN
  SELECT * INTO v_ref FROM refacciones WHERE id = NEW.refaccion_id AND club_id = NEW.club_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La refacción no existe en este club';
  END IF;

  IF NEW.tipo = 'salida' THEN
    IF v_ref.existencia < NEW.cantidad THEN
      RAISE EXCEPTION 'Existencia insuficiente de "%": hay % % y se piden %',
        v_ref.nombre, v_ref.existencia, v_ref.unidad, NEW.cantidad;
    END IF;
    v_nueva := v_ref.existencia - NEW.cantidad;
  ELSE
    v_nueva := v_ref.existencia + NEW.cantidad;
  END IF;

  NEW.costo_unitario := COALESCE(NEW.costo_unitario, v_ref.costo_unitario);
  NEW.existencia_posterior := v_nueva;

  UPDATE refacciones
     SET existencia = v_nueva,
         costo_unitario = CASE WHEN NEW.tipo = 'entrada' THEN NEW.costo_unitario ELSE costo_unitario END
   WHERE id = v_ref.id;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_movimientos_refaccion_aplicar
  BEFORE INSERT ON public.movimientos_refaccion
  FOR EACH ROW EXECUTE FUNCTION public._mtto_aplicar_movimiento();

-- ------------------------------------------------------------
-- 3. Tareas preventivas
-- ------------------------------------------------------------
CREATE TABLE public.tareas_preventivas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id           uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  nombre            text NOT NULL,
  descripcion       text,
  componente        text NOT NULL DEFAULT 'otro'
                      CHECK (componente IN ('iluminacion', 'cristal', 'superficie', 'red', 'puerta', 'estructura', 'otro')),
  aplica_todas      boolean NOT NULL DEFAULT true,
  pista_ids         uuid[] NOT NULL DEFAULT '{}',
  frecuencia_tipo   text NOT NULL CHECK (frecuencia_tipo IN ('dias', 'semanas', 'meses', 'horas_uso')),
  frecuencia_valor  integer NOT NULL CHECK (frecuencia_valor > 0),
  duracion_min      integer NOT NULL DEFAULT 60 CHECK (duracion_min > 0),
  bloquea_agenda    boolean NOT NULL DEFAULT false,
  responsable_id    uuid,
  pasos             jsonb NOT NULL DEFAULT '[]'::jsonb,        -- ["Paso 1", "Paso 2"]
  refacciones       jsonb NOT NULL DEFAULT '[]'::jsonb,        -- [{"refaccion_id": "...", "cantidad": 1}]
  ultima_ejecucion  timestamptz,
  activa            boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, club_id),
  CHECK (aplica_todas OR cardinality(pista_ids) > 0),
  FOREIGN KEY (responsable_id, club_id) REFERENCES empleados (id, club_id)
);
CREATE INDEX tareas_preventivas_club_idx ON public.tareas_preventivas (club_id);

COMMENT ON COLUMN public.tareas_preventivas.frecuencia_tipo IS
  'dias | semanas | meses (calendario) o horas_uso (cada N horas de juego de la pista).';
COMMENT ON COLUMN public.tareas_preventivas.ultima_ejecucion IS
  'Se actualiza al cerrar la orden preventiva de la tarea (rpc_cerrar_orden).';

-- ------------------------------------------------------------
-- 4. Normas, puntos, inspecciones
-- ------------------------------------------------------------
CREATE TABLE public.normas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id          uuid REFERENCES clubes(id) ON DELETE CASCADE,   -- NULL = catálogo global
  codigo           text NOT NULL,
  nombre           text NOT NULL,
  alcance          text,
  frecuencia_meses integer NOT NULL DEFAULT 12 CHECK (frecuencia_meses > 0),
  componente       text NOT NULL DEFAULT 'otro'
                     CHECK (componente IN ('iluminacion', 'cristal', 'superficie', 'red', 'puerta', 'estructura', 'otro')),
  activa           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX normas_codigo_global_key ON public.normas (codigo) WHERE club_id IS NULL;
CREATE UNIQUE INDEX normas_codigo_club_key   ON public.normas (club_id, codigo) WHERE club_id IS NOT NULL;

COMMENT ON COLUMN public.normas.componente IS 'Componente que se asigna a las órdenes correctivas que genera un "no cumple" de esta norma.';
COMMENT ON COLUMN public.normas.frecuencia_meses IS 'Cada cuántos meses debe repetirse la inspección.';

CREATE TABLE public.norma_puntos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  norma_id     uuid NOT NULL REFERENCES normas(id) ON DELETE CASCADE,
  club_id      uuid REFERENCES clubes(id) ON DELETE CASCADE,       -- el de la norma (NULL si es global)
  orden        integer NOT NULL DEFAULT 0,
  descripcion  text NOT NULL,
  activo       boolean NOT NULL DEFAULT true
);
CREATE INDEX norma_puntos_norma_idx ON public.norma_puntos (norma_id, orden);

CREATE TABLE public.inspecciones (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id        uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  norma_id       uuid NOT NULL REFERENCES normas(id),
  pista_id       uuid,                                  -- NULL = inspección general de instalaciones
  fecha          date NOT NULL DEFAULT current_date,
  responsable_id uuid,
  estado         text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'finalizada')),
  observaciones  text,
  finalizada_en  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, club_id),
  FOREIGN KEY (pista_id, club_id)       REFERENCES pistas (id, club_id),
  FOREIGN KEY (responsable_id, club_id) REFERENCES empleados (id, club_id)
);
CREATE INDEX inspecciones_club_fecha_idx ON public.inspecciones (club_id, fecha DESC);

CREATE TABLE public.inspeccion_resultados (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id        uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  inspeccion_id  uuid NOT NULL,
  punto_id       uuid NOT NULL REFERENCES norma_puntos(id),
  resultado      text CHECK (resultado IN ('cumple', 'no_cumple', 'na')),   -- NULL = sin evaluar
  observacion    text,
  evidencia_url  text,
  UNIQUE (inspeccion_id, punto_id),
  UNIQUE (id, club_id),
  FOREIGN KEY (inspeccion_id, club_id) REFERENCES inspecciones (id, club_id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 5. Órdenes de trabajo
-- ------------------------------------------------------------
CREATE TABLE public.contadores_folio (
  club_id  uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  serie    text NOT NULL,
  ultimo   integer NOT NULL DEFAULT 0,
  PRIMARY KEY (club_id, serie)
);

CREATE TABLE public.ordenes_trabajo (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id                  uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  folio                    text NOT NULL,
  tipo                     text NOT NULL CHECK (tipo IN ('preventiva', 'correctiva')),
  pista_id                 uuid,                         -- NULL = instalaciones generales (no entra en los indicadores por pista)
  componente               text NOT NULL DEFAULT 'otro'
                             CHECK (componente IN ('iluminacion', 'cristal', 'superficie', 'red', 'puerta', 'estructura', 'otro')),
  descripcion              text NOT NULL,
  prioridad                text NOT NULL DEFAULT 'media' CHECK (prioridad IN ('baja', 'media', 'alta')),
  estado                   text NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'en_proceso', 'cerrada')),
  fuera_de_servicio        boolean NOT NULL DEFAULT false,
  reportada_por            uuid,
  responsable_id           uuid,
  reportada_en             timestamptz NOT NULL DEFAULT now(),
  programada_para          timestamptz,                  -- preventivas: inicio de la ventana
  iniciada_en              timestamptz,
  cerrada_en               timestamptz,
  causa                    text,
  accion_realizada         text,
  costo_mano_obra          numeric(12,2) NOT NULL DEFAULT 0 CHECK (costo_mano_obra >= 0),
  costo_refacciones        numeric(12,2) NOT NULL DEFAULT 0 CHECK (costo_refacciones >= 0),
  tarea_preventiva_id      uuid,
  inspeccion_id            uuid,
  inspeccion_resultado_id  uuid,
  created_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, club_id),
  UNIQUE (club_id, folio),
  FOREIGN KEY (pista_id, club_id)             REFERENCES pistas (id, club_id),
  FOREIGN KEY (reportada_por, club_id)        REFERENCES empleados (id, club_id),
  FOREIGN KEY (responsable_id, club_id)       REFERENCES empleados (id, club_id),
  FOREIGN KEY (tarea_preventiva_id, club_id)  REFERENCES tareas_preventivas (id, club_id),
  FOREIGN KEY (inspeccion_id, club_id)        REFERENCES inspecciones (id, club_id),
  FOREIGN KEY (inspeccion_resultado_id, club_id) REFERENCES inspeccion_resultados (id, club_id),
  CHECK (estado <> 'cerrada' OR cerrada_en IS NOT NULL),
  CHECK (cerrada_en IS NULL OR cerrada_en >= reportada_en)
);
CREATE INDEX ordenes_trabajo_club_estado_idx ON public.ordenes_trabajo (club_id, estado, reportada_en DESC);
CREATE INDEX ordenes_trabajo_pista_idx       ON public.ordenes_trabajo (pista_id, reportada_en DESC);
CREATE UNIQUE INDEX ordenes_trabajo_resultado_key ON public.ordenes_trabajo (inspeccion_resultado_id)
  WHERE inspeccion_resultado_id IS NOT NULL;   -- un "no cumple" genera una sola orden

COMMENT ON COLUMN public.ordenes_trabajo.fuera_de_servicio IS
  'Correctiva: la falla dejó la pista inoperable (crea un bloqueo abierto). Preventiva: la tarea bloquea la agenda.';
COMMENT ON COLUMN public.ordenes_trabajo.costo_refacciones IS
  'Suma de cantidad x costo unitario de las salidas de refacciones de la orden; la fija rpc_cerrar_orden.';

-- Folio OT-0001, OT-0002... por club. Contador con upsert atómico (sin huecos
-- por concurrencia: la fila del contador se bloquea hasta el commit).
CREATE OR REPLACE FUNCTION public._mtto_asignar_folio()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  IF NEW.folio IS NULL OR NEW.folio = '' THEN
    INSERT INTO contadores_folio (club_id, serie, ultimo) VALUES (NEW.club_id, 'OT', 1)
    ON CONFLICT (club_id, serie) DO UPDATE SET ultimo = contadores_folio.ultimo + 1
    RETURNING ultimo INTO v_n;
    NEW.folio := 'OT-' || lpad(v_n::text, 4, '0');
  END IF;
  RETURN NEW;
END $$;

-- folio es NOT NULL: el trigger BEFORE INSERT lo llena antes de la restricción,
-- pero el valor por defecto debe permitir omitirlo en el INSERT.
ALTER TABLE public.ordenes_trabajo ALTER COLUMN folio SET DEFAULT '';
CREATE TRIGGER trg_ordenes_folio
  BEFORE INSERT ON public.ordenes_trabajo
  FOR EACH ROW EXECUTE FUNCTION public._mtto_asignar_folio();

-- Las salidas de refacciones apuntan a la orden (ya existe la tabla)
ALTER TABLE public.movimientos_refaccion
  ADD CONSTRAINT movimientos_refaccion_orden_fk
  FOREIGN KEY (orden_id, club_id) REFERENCES ordenes_trabajo (id, club_id);

-- ------------------------------------------------------------
-- 6. Bloqueos de agenda
-- ------------------------------------------------------------
CREATE TABLE public.bloqueos_pista (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  pista_id    uuid NOT NULL,
  tipo        text NOT NULL DEFAULT 'fuera_de_servicio' CHECK (tipo IN ('fuera_de_servicio', 'preventivo', 'otro')),
  inicio      timestamptz NOT NULL,
  fin         timestamptz,                        -- NULL = abierto, sin fecha de término
  motivo      text NOT NULL,
  orden_id    uuid,
  creado_por  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (fin IS NULL OR fin > inicio),
  FOREIGN KEY (pista_id, club_id)   REFERENCES pistas (id, club_id) ON DELETE CASCADE,
  FOREIGN KEY (orden_id, club_id)   REFERENCES ordenes_trabajo (id, club_id) ON DELETE SET NULL (orden_id),
  FOREIGN KEY (creado_por, club_id) REFERENCES empleados (id, club_id)
);
CREATE INDEX bloqueos_pista_pista_idx ON public.bloqueos_pista (pista_id, inicio);
CREATE INDEX bloqueos_pista_orden_idx ON public.bloqueos_pista (orden_id) WHERE orden_id IS NOT NULL;

COMMENT ON TABLE public.bloqueos_pista IS
  'Ventanas en que la pista no se puede reservar. fin NULL = bloqueo abierto (falla sin fecha de reparación): rpc_cerrar_orden le pone fin.';

-- Una reserva nueva, o movida, no puede solaparse con un bloqueo.
-- Las reservas ya existentes que quedan dentro de un bloqueo nuevo no se tocan
-- (rpc_reportar_falla devuelve la lista para que el club las atienda); por eso
-- el trigger solo mira INSERT y cambios de pista/fecha/hora, no de estado.
CREATE OR REPLACE FUNCTION public._mtto_validar_reserva_sin_bloqueo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ini timestamptz;
  v_fin timestamptz;
  v_b   bloqueos_pista%ROWTYPE;
BEGIN
  IF NEW.estado IN ('cancelada', 'noshow') THEN
    RETURN NEW;
  END IF;
  v_ini := (NEW.fecha + NEW.hora_inicio) AT TIME ZONE 'America/Mexico_City';
  v_fin := (NEW.fecha + NEW.hora_fin)    AT TIME ZONE 'America/Mexico_City';

  SELECT b.* INTO v_b
  FROM bloqueos_pista b
  WHERE b.pista_id = NEW.pista_id
    AND b.inicio < v_fin
    AND COALESCE(b.fin, 'infinity'::timestamptz) > v_ini
  ORDER BY b.inicio
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'La pista está bloqueada por mantenimiento (%) %: no se puede reservar en ese horario',
      v_b.motivo,
      CASE WHEN v_b.fin IS NULL THEN 'hasta nuevo aviso'
           ELSE 'hasta el ' || to_char(v_b.fin AT TIME ZONE 'America/Mexico_City', 'DD/MM/YYYY HH24:MI') END
      USING ERRCODE = 'SP002';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_reservas_sin_bloqueo
  BEFORE INSERT OR UPDATE OF pista_id, fecha, hora_inicio, hora_fin ON public.reservas
  FOR EACH ROW EXECUTE FUNCTION public._mtto_validar_reserva_sin_bloqueo();

-- ------------------------------------------------------------
-- 7. Sincronía pistas.en_mantenimiento <-> pista_ficha.estado_operativo
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._mtto_ficha_a_pista()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE pistas
     SET en_mantenimiento = (NEW.estado_operativo <> 'operativa')
   WHERE id = NEW.pista_id
     AND en_mantenimiento IS DISTINCT FROM (NEW.estado_operativo <> 'operativa');
  RETURN NULL;
END $$;

CREATE TRIGGER trg_ficha_a_pista
  AFTER INSERT OR UPDATE OF estado_operativo ON public.pista_ficha
  FOR EACH ROW EXECUTE FUNCTION public._mtto_ficha_a_pista();

CREATE OR REPLACE FUNCTION public._mtto_pista_a_ficha()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.en_mantenimiento THEN
    UPDATE pista_ficha SET estado_operativo = 'mantenimiento', updated_at = now()
     WHERE pista_id = NEW.id AND estado_operativo = 'operativa';
  ELSE
    UPDATE pista_ficha SET estado_operativo = 'operativa', updated_at = now()
     WHERE pista_id = NEW.id AND estado_operativo = 'mantenimiento';
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER trg_pista_a_ficha
  AFTER UPDATE OF en_mantenimiento ON public.pistas
  FOR EACH ROW EXECUTE FUNCTION public._mtto_pista_a_ficha();

-- Recalcula el estado operativo de una pista a partir de sus bloqueos activos
-- y de las preventivas que bloquean agenda y están en proceso:
--   bloqueo activo 'fuera_de_servicio'                          -> fuera_de_servicio
--   otro bloqueo activo, o preventiva bloqueante en proceso     -> mantenimiento
--   nada de lo anterior                                         -> operativa
-- "Activo" = inicio <= now() y (fin es NULL o fin > now()).
CREATE OR REPLACE FUNCTION public._mtto_recalcular_pista(p_pista_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_estado text;
BEGIN
  v_estado := CASE
    WHEN EXISTS (SELECT 1 FROM bloqueos_pista b
                  WHERE b.pista_id = p_pista_id AND b.tipo = 'fuera_de_servicio'
                    AND b.inicio <= now() AND (b.fin IS NULL OR b.fin > now()))
      THEN 'fuera_de_servicio'
    WHEN EXISTS (SELECT 1 FROM bloqueos_pista b
                  WHERE b.pista_id = p_pista_id
                    AND b.inicio <= now() AND (b.fin IS NULL OR b.fin > now()))
      OR EXISTS (SELECT 1 FROM ordenes_trabajo o
                  WHERE o.pista_id = p_pista_id AND o.tipo = 'preventiva'
                    AND o.estado = 'en_proceso' AND o.fuera_de_servicio)
      THEN 'mantenimiento'
    ELSE 'operativa'
  END;

  UPDATE pista_ficha SET estado_operativo = v_estado, updated_at = now() WHERE pista_id = p_pista_id;
  IF v_estado = 'operativa' THEN
    UPDATE pistas SET nota_mantenimiento = NULL WHERE id = p_pista_id AND nota_mantenimiento IS NOT NULL;
  END IF;
  RETURN v_estado;
END $$;

-- ------------------------------------------------------------
-- 8. RLS y permisos
-- ------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pista_ficha', 'refacciones', 'movimientos_refaccion', 'tareas_preventivas',
                           'inspecciones', 'inspeccion_resultados', 'contadores_folio', 'ordenes_trabajo',
                           'bloqueos_pista']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "club_isolation" ON public.%I USING (club_id = (SELECT current_club_id()))', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END $$;

-- Catálogo de normas: lectura de lo global y de lo propio; escritura solo de lo propio
ALTER TABLE public.normas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.norma_puntos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "normas_lectura" ON public.normas FOR SELECT
  USING (club_id IS NULL OR club_id = (SELECT current_club_id()));
CREATE POLICY "normas_escritura" ON public.normas FOR ALL
  USING (club_id = (SELECT current_club_id()))
  WITH CHECK (club_id = (SELECT current_club_id()));

CREATE POLICY "norma_puntos_lectura" ON public.norma_puntos FOR SELECT
  USING (club_id IS NULL OR club_id = (SELECT current_club_id()));
CREATE POLICY "norma_puntos_escritura" ON public.norma_puntos FOR ALL
  USING (club_id = (SELECT current_club_id()))
  WITH CHECK (club_id = (SELECT current_club_id()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.normas, public.norma_puntos TO authenticated;

-- El contador de folios solo se toca desde el trigger
REVOKE INSERT, UPDATE, DELETE ON public.contadores_folio FROM authenticated;
-- Los movimientos de refacciones no se editan ni se borran: se corrigen con otro movimiento
REVOKE UPDATE, DELETE ON public.movimientos_refaccion FROM authenticated;

-- Funciones internas: no se exponen en la API
REVOKE EXECUTE ON FUNCTION public._mtto_crear_ficha()                 FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public._mtto_aplicar_movimiento()          FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public._mtto_asignar_folio()               FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public._mtto_validar_reserva_sin_bloqueo() FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public._mtto_ficha_a_pista()               FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public._mtto_pista_a_ficha()               FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public._mtto_recalcular_pista(uuid)        FROM PUBLIC, authenticated;

-- ------------------------------------------------------------
-- 9. RPC de operación
-- ------------------------------------------------------------

-- Reportar una falla --------------------------------------------------------
-- Crea la orden correctiva (estado 'abierta'). Si p_fuera_de_servicio:
--   1. crea un bloqueo ABIERTO (fin NULL = "hasta nuevo aviso") desde
--      p_reportada_en (por omisión, ahora), tipo 'fuera_de_servicio';
--   2. pone la pista en fuera_de_servicio (y pistas.en_mantenimiento = true,
--      con la nota "OT-000N · descripción");
--   3. devuelve las reservas confirmadas/en juego que caen desde ese momento:
--      no se cancelan solas, las atiende el club.
-- rpc_cerrar_orden pone el fin del bloqueo.
CREATE OR REPLACE FUNCTION public.rpc_reportar_falla(
  p_pista_id          uuid,
  p_componente        text,
  p_descripcion       text,
  p_prioridad         text        DEFAULT 'media',
  p_fuera_de_servicio boolean     DEFAULT false,
  p_reportada_en      timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_club     uuid;
  v_emp      uuid;
  v_orden    ordenes_trabajo%ROWTYPE;
  v_ini      timestamptz := COALESCE(p_reportada_en, now());
  v_bloqueo  uuid;
  v_estado   text;
  v_afectadas jsonb;
BEGIN
  v_club := current_club_id();
  IF v_club IS NULL THEN
    RAISE EXCEPTION 'El usuario no pertenece a ningún club activo';
  END IF;
  SELECT id INTO v_emp FROM empleados WHERE auth_user_id = current_uid() AND activo;

  PERFORM 1 FROM pistas WHERE id = p_pista_id AND club_id = v_club;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La pista no existe en este club';
  END IF;
  IF p_componente NOT IN ('iluminacion', 'cristal', 'superficie', 'red', 'puerta', 'estructura', 'otro') THEN
    RAISE EXCEPTION 'Componente no válido: %', p_componente;
  END IF;
  IF p_prioridad NOT IN ('baja', 'media', 'alta') THEN
    RAISE EXCEPTION 'Prioridad no válida: %', p_prioridad;
  END IF;
  IF nullif(btrim(p_descripcion), '') IS NULL THEN
    RAISE EXCEPTION 'Describe la falla';
  END IF;
  IF v_ini > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'La fecha de la falla no puede estar en el futuro';
  END IF;

  INSERT INTO ordenes_trabajo (club_id, tipo, pista_id, componente, descripcion, prioridad,
                               estado, fuera_de_servicio, reportada_por, reportada_en)
  VALUES (v_club, 'correctiva', p_pista_id, p_componente, btrim(p_descripcion), p_prioridad,
          'abierta', COALESCE(p_fuera_de_servicio, false), v_emp, v_ini)
  RETURNING * INTO v_orden;

  IF v_orden.fuera_de_servicio THEN
    INSERT INTO bloqueos_pista (club_id, pista_id, tipo, inicio, fin, motivo, orden_id, creado_por)
    VALUES (v_club, p_pista_id, 'fuera_de_servicio', v_ini, NULL,
            v_orden.folio || ' · ' || left(v_orden.descripcion, 100), v_orden.id, v_emp)
    RETURNING id INTO v_bloqueo;

    UPDATE pistas SET nota_mantenimiento = v_orden.folio || ' · ' || left(v_orden.descripcion, 120)
     WHERE id = p_pista_id;
  END IF;
  v_estado := _mtto_recalcular_pista(p_pista_id);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'reserva_id', r.id, 'fecha', r.fecha, 'hora_inicio', r.hora_inicio, 'hora_fin', r.hora_fin,
           'cliente', COALESCE(r.nombre_cliente, c.nombre), 'estado', r.estado) ORDER BY r.fecha, r.hora_inicio), '[]'::jsonb)
    INTO v_afectadas
  FROM reservas r LEFT JOIN clientes c ON c.id = r.cliente_id
  WHERE v_orden.fuera_de_servicio
    AND r.pista_id = p_pista_id AND r.club_id = v_club
    AND r.estado IN ('confirmada', 'checkin')
    AND (r.fecha + r.hora_fin) AT TIME ZONE 'America/Mexico_City' > v_ini;

  RETURN jsonb_build_object(
    'orden_id', v_orden.id, 'folio', v_orden.folio, 'bloqueo_id', v_bloqueo,
    'estado_pista', v_estado, 'reservas_afectadas', v_afectadas);
END $$;

-- Iniciar una orden ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_iniciar_orden(p_orden_id uuid, p_responsable_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_club   uuid;
  v_orden  ordenes_trabajo%ROWTYPE;
  v_estado text;
BEGIN
  v_club := current_club_id();
  IF v_club IS NULL THEN
    RAISE EXCEPTION 'El usuario no pertenece a ningún club activo';
  END IF;

  SELECT * INTO v_orden FROM ordenes_trabajo WHERE id = p_orden_id AND club_id = v_club FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La orden no existe en este club'; END IF;
  IF v_orden.estado <> 'abierta' THEN
    RAISE EXCEPTION 'La orden % ya está %', v_orden.folio, replace(v_orden.estado, '_', ' ');
  END IF;
  IF p_responsable_id IS NOT NULL THEN
    PERFORM 1 FROM empleados WHERE id = p_responsable_id AND club_id = v_club AND activo;
    IF NOT FOUND THEN RAISE EXCEPTION 'El responsable no existe en este club'; END IF;
  END IF;

  UPDATE ordenes_trabajo
     SET estado = 'en_proceso', iniciada_en = now(),
         responsable_id = COALESCE(p_responsable_id, responsable_id)
   WHERE id = v_orden.id;

  IF v_orden.pista_id IS NOT NULL THEN
    v_estado := _mtto_recalcular_pista(v_orden.pista_id);
  END IF;
  RETURN jsonb_build_object('orden_id', v_orden.id, 'folio', v_orden.folio, 'estado_pista', v_estado);
END $$;

-- Cerrar una orden -----------------------------------------------------------
-- p_refacciones: [{"refaccion_id": "...", "cantidad": 2}]. Cada una genera una
-- SALIDA en movimientos_refaccion ligada a la orden (el trigger descuenta la
-- existencia y rechaza si no alcanza). costo_refacciones = suma de
-- cantidad x costo unitario vigente.
-- p_liberar_pista = true: cierra el fin de los bloqueos de la orden y recalcula
-- la pista (vuelve a 'operativa' salvo que otro bloqueo siga activo). Con false
-- los bloqueos quedan abiertos (p. ej. falta otra reparación); se liberan
-- después con rpc_liberar_pista. Una bloqueo programado que aún no empezó se borra.
-- Si la orden es de una tarea preventiva, la tarea registra la ejecución.
CREATE OR REPLACE FUNCTION public.rpc_cerrar_orden(
  p_orden_id        uuid,
  p_causa           text,
  p_accion          text,
  p_costo_mano_obra numeric     DEFAULT 0,
  p_refacciones     jsonb       DEFAULT '[]'::jsonb,
  p_liberar_pista   boolean     DEFAULT true,
  p_cerrada_en      timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_club     uuid;
  v_emp      uuid;
  v_orden    ordenes_trabajo%ROWTYPE;
  v_cierre   timestamptz := COALESCE(p_cerrada_en, now());
  v_item     jsonb;
  v_cant     numeric;
  v_costo_ref numeric := 0;
  v_mov      movimientos_refaccion%ROWTYPE;
  v_estado   text;
  v_mo       numeric := COALESCE(p_costo_mano_obra, 0);
BEGIN
  v_club := current_club_id();
  IF v_club IS NULL THEN
    RAISE EXCEPTION 'El usuario no pertenece a ningún club activo';
  END IF;
  SELECT id INTO v_emp FROM empleados WHERE auth_user_id = current_uid() AND activo;

  SELECT * INTO v_orden FROM ordenes_trabajo WHERE id = p_orden_id AND club_id = v_club FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La orden no existe en este club'; END IF;
  IF v_orden.estado = 'cerrada' THEN
    RAISE EXCEPTION 'La orden % ya está cerrada', v_orden.folio;
  END IF;
  IF v_mo < 0 THEN RAISE EXCEPTION 'La mano de obra no puede ser negativa'; END IF;
  IF nullif(btrim(p_accion), '') IS NULL THEN RAISE EXCEPTION 'Indica la acción realizada'; END IF;
  IF v_orden.tipo = 'correctiva' AND nullif(btrim(p_causa), '') IS NULL THEN
    RAISE EXCEPTION 'Indica la causa de la falla';
  END IF;
  IF v_cierre < v_orden.reportada_en THEN
    RAISE EXCEPTION 'El cierre no puede ser anterior a la fecha en que se reportó la orden';
  END IF;
  IF v_cierre > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'La fecha de cierre no puede estar en el futuro';
  END IF;
  IF jsonb_typeof(COALESCE(p_refacciones, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'p_refacciones debe ser una lista';
  END IF;

  -- Refacciones usadas: una salida por renglón
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_refacciones, '[]'::jsonb)) LOOP
    v_cant := (v_item->>'cantidad')::numeric;
    IF v_cant IS NULL OR v_cant <= 0 THEN
      RAISE EXCEPTION 'La cantidad de una refacción debe ser mayor que cero';
    END IF;
    PERFORM 1 FROM refacciones WHERE id = (v_item->>'refaccion_id')::uuid AND club_id = v_club;
    IF NOT FOUND THEN RAISE EXCEPTION 'Una de las refacciones no existe en este club'; END IF;

    INSERT INTO movimientos_refaccion (club_id, refaccion_id, tipo, cantidad, orden_id, motivo, empleado_id, created_at)
    VALUES (v_club, (v_item->>'refaccion_id')::uuid, 'salida', v_cant, v_orden.id,
            'Orden ' || v_orden.folio, v_emp, v_cierre)
    RETURNING * INTO v_mov;
    v_costo_ref := v_costo_ref + v_mov.cantidad * v_mov.costo_unitario;
  END LOOP;

  -- Bloqueos de la orden
  IF COALESCE(p_liberar_pista, true) THEN
    DELETE FROM bloqueos_pista WHERE orden_id = v_orden.id AND inicio >= v_cierre;
    UPDATE bloqueos_pista SET fin = v_cierre
     WHERE orden_id = v_orden.id AND (fin IS NULL OR fin > v_cierre);
  END IF;

  UPDATE ordenes_trabajo
     SET estado = 'cerrada',
         iniciada_en = COALESCE(iniciada_en, v_cierre),
         cerrada_en = v_cierre,
         causa = nullif(btrim(p_causa), ''),
         accion_realizada = btrim(p_accion),
         costo_mano_obra = v_mo,
         costo_refacciones = round(v_costo_ref, 2)
   WHERE id = v_orden.id;

  IF v_orden.tarea_preventiva_id IS NOT NULL THEN
    UPDATE tareas_preventivas SET ultima_ejecucion = v_cierre WHERE id = v_orden.tarea_preventiva_id;
  END IF;

  IF v_orden.pista_id IS NOT NULL THEN
    v_estado := _mtto_recalcular_pista(v_orden.pista_id);
  END IF;

  RETURN jsonb_build_object(
    'orden_id', v_orden.id, 'folio', v_orden.folio,
    'costo_mano_obra', v_mo, 'costo_refacciones', round(v_costo_ref, 2),
    'costo_total', round(v_mo + v_costo_ref, 2),
    'estado_pista', v_estado,
    'pista_liberada', COALESCE(v_estado = 'operativa', false));
END $$;

-- Liberar una pista ------------------------------------------------------------
-- Cierra (fin = ahora) todos los bloqueos activos de la pista y la deja operativa.
CREATE OR REPLACE FUNCTION public.rpc_liberar_pista(p_pista_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_club uuid;
  v_n    integer;
BEGIN
  v_club := current_club_id();
  IF v_club IS NULL THEN
    RAISE EXCEPTION 'El usuario no pertenece a ningún club activo';
  END IF;
  PERFORM 1 FROM pistas WHERE id = p_pista_id AND club_id = v_club;
  IF NOT FOUND THEN RAISE EXCEPTION 'La pista no existe en este club'; END IF;

  DELETE FROM bloqueos_pista WHERE pista_id = p_pista_id AND club_id = v_club AND inicio >= now();
  UPDATE bloqueos_pista SET fin = now()
   WHERE pista_id = p_pista_id AND club_id = v_club AND (fin IS NULL OR fin > now());
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN jsonb_build_object('bloqueos_cerrados', v_n, 'estado_pista', _mtto_recalcular_pista(p_pista_id));
END $$;

-- Programar un preventivo ---------------------------------------------------------
-- Genera la orden PREVENTIVA de una tarea para una pista. Si la tarea bloquea
-- agenda crea el bloqueo (tipo 'preventivo') en [p_inicio, p_fin); p_fin por
-- omisión = p_inicio + duracion_min de la tarea. Si en esa ventana hay reservas
-- confirmadas o en juego lo rechaza, salvo p_forzar = true.
CREATE OR REPLACE FUNCTION public.rpc_programar_preventivo(
  p_tarea_id       uuid,
  p_pista_id       uuid,
  p_inicio         timestamptz,
  p_fin            timestamptz DEFAULT NULL,
  p_responsable_id uuid        DEFAULT NULL,
  p_forzar         boolean     DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_club    uuid;
  v_emp     uuid;
  v_t       tareas_preventivas%ROWTYPE;
  v_fin     timestamptz;
  v_orden   ordenes_trabajo%ROWTYPE;
  v_bloqueo uuid;
  v_choques integer := 0;
BEGIN
  v_club := current_club_id();
  IF v_club IS NULL THEN
    RAISE EXCEPTION 'El usuario no pertenece a ningún club activo';
  END IF;
  SELECT id INTO v_emp FROM empleados WHERE auth_user_id = current_uid() AND activo;

  SELECT * INTO v_t FROM tareas_preventivas WHERE id = p_tarea_id AND club_id = v_club AND activa;
  IF NOT FOUND THEN RAISE EXCEPTION 'La tarea no existe en este club o está inactiva'; END IF;
  PERFORM 1 FROM pistas WHERE id = p_pista_id AND club_id = v_club;
  IF NOT FOUND THEN RAISE EXCEPTION 'La pista no existe en este club'; END IF;
  IF NOT (v_t.aplica_todas OR p_pista_id = ANY (v_t.pista_ids)) THEN
    RAISE EXCEPTION 'La tarea "%" no aplica a esa pista', v_t.nombre;
  END IF;
  IF p_responsable_id IS NOT NULL THEN
    PERFORM 1 FROM empleados WHERE id = p_responsable_id AND club_id = v_club AND activo;
    IF NOT FOUND THEN RAISE EXCEPTION 'El responsable no existe en este club'; END IF;
  END IF;
  IF p_inicio IS NULL THEN RAISE EXCEPTION 'Indica cuándo se hará el mantenimiento'; END IF;

  v_fin := COALESCE(p_fin, p_inicio + make_interval(mins => v_t.duracion_min));
  IF v_fin <= p_inicio THEN RAISE EXCEPTION 'El fin debe ser posterior al inicio'; END IF;

  IF v_t.bloquea_agenda THEN
    SELECT count(*) INTO v_choques
    FROM reservas r
    WHERE r.pista_id = p_pista_id AND r.club_id = v_club
      AND r.estado IN ('confirmada', 'checkin')
      AND (r.fecha + r.hora_inicio) AT TIME ZONE 'America/Mexico_City' < v_fin
      AND (r.fecha + r.hora_fin)    AT TIME ZONE 'America/Mexico_City' > p_inicio;
    IF v_choques > 0 AND NOT COALESCE(p_forzar, false) THEN
      RAISE EXCEPTION 'Hay % reserva(s) en esa ventana de la pista: muévelas o cancélalas, o elige otro horario', v_choques;
    END IF;
  END IF;

  INSERT INTO ordenes_trabajo (club_id, tipo, pista_id, componente, descripcion, prioridad, estado,
                               fuera_de_servicio, reportada_por, responsable_id, programada_para, tarea_preventiva_id)
  VALUES (v_club, 'preventiva', p_pista_id, v_t.componente, v_t.nombre, 'media', 'abierta',
          v_t.bloquea_agenda, v_emp, COALESCE(p_responsable_id, v_t.responsable_id), p_inicio, v_t.id)
  RETURNING * INTO v_orden;

  IF v_t.bloquea_agenda THEN
    INSERT INTO bloqueos_pista (club_id, pista_id, tipo, inicio, fin, motivo, orden_id, creado_por)
    VALUES (v_club, p_pista_id, 'preventivo', p_inicio, v_fin,
            v_orden.folio || ' · ' || v_t.nombre, v_orden.id, v_emp)
    RETURNING id INTO v_bloqueo;
    PERFORM _mtto_recalcular_pista(p_pista_id);
  END IF;

  RETURN jsonb_build_object('orden_id', v_orden.id, 'folio', v_orden.folio, 'bloqueo_id', v_bloqueo,
                            'inicio', p_inicio, 'fin', CASE WHEN v_t.bloquea_agenda THEN v_fin END,
                            'reservas_en_ventana', v_choques);
END $$;

-- Inspecciones -----------------------------------------------------------------------
-- Crea la inspección en borrador con un renglón (resultado NULL) por cada punto activo de la norma.
CREATE OR REPLACE FUNCTION public.rpc_crear_inspeccion(
  p_norma_id       uuid,
  p_fecha          date DEFAULT NULL,
  p_responsable_id uuid DEFAULT NULL,
  p_pista_id       uuid DEFAULT NULL,
  p_observaciones  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_club uuid;
  v_emp  uuid;
  v_id   uuid;
  v_n    integer;
BEGIN
  v_club := current_club_id();
  IF v_club IS NULL THEN
    RAISE EXCEPTION 'El usuario no pertenece a ningún club activo';
  END IF;
  SELECT id INTO v_emp FROM empleados WHERE auth_user_id = current_uid() AND activo;

  PERFORM 1 FROM normas WHERE id = p_norma_id AND activa AND (club_id IS NULL OR club_id = v_club);
  IF NOT FOUND THEN RAISE EXCEPTION 'La norma no existe'; END IF;
  IF p_pista_id IS NOT NULL THEN
    PERFORM 1 FROM pistas WHERE id = p_pista_id AND club_id = v_club;
    IF NOT FOUND THEN RAISE EXCEPTION 'La pista no existe en este club'; END IF;
  END IF;
  IF p_responsable_id IS NOT NULL THEN
    PERFORM 1 FROM empleados WHERE id = p_responsable_id AND club_id = v_club AND activo;
    IF NOT FOUND THEN RAISE EXCEPTION 'El responsable no existe en este club'; END IF;
  END IF;

  INSERT INTO inspecciones (club_id, norma_id, pista_id, fecha, responsable_id, observaciones)
  VALUES (v_club, p_norma_id, p_pista_id,
          COALESCE(p_fecha, (now() AT TIME ZONE 'America/Mexico_City')::date),
          COALESCE(p_responsable_id, v_emp), p_observaciones)
  RETURNING id INTO v_id;

  INSERT INTO inspeccion_resultados (club_id, inspeccion_id, punto_id)
  SELECT v_club, v_id, pt.id FROM norma_puntos pt
   WHERE pt.norma_id = p_norma_id AND pt.activo
   ORDER BY pt.orden;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RAISE EXCEPTION 'La norma no tiene puntos de verificación'; END IF;

  RETURN jsonb_build_object('inspeccion_id', v_id, 'puntos', v_n);
END $$;

-- p_resultados: [{"punto_id": "...", "resultado": "cumple|no_cumple|na|null", "observacion": "...", "evidencia_url": "..."}]
-- Solo cambia los campos que vienen en cada elemento. Solo en borrador.
CREATE OR REPLACE FUNCTION public.rpc_guardar_resultados_inspeccion(p_inspeccion_id uuid, p_resultados jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_club uuid;
  v_i    inspecciones%ROWTYPE;
  v_item jsonb;
  v_res  text;
  v_n    integer := 0;
BEGIN
  v_club := current_club_id();
  IF v_club IS NULL THEN
    RAISE EXCEPTION 'El usuario no pertenece a ningún club activo';
  END IF;
  SELECT * INTO v_i FROM inspecciones WHERE id = p_inspeccion_id AND club_id = v_club FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La inspección no existe en este club'; END IF;
  IF v_i.estado <> 'borrador' THEN RAISE EXCEPTION 'La inspección ya está finalizada y no se puede editar'; END IF;
  IF jsonb_typeof(COALESCE(p_resultados, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'p_resultados debe ser una lista';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_resultados, '[]'::jsonb)) LOOP
    v_res := v_item->>'resultado';
    IF v_item ? 'resultado' AND v_res IS NOT NULL AND v_res NOT IN ('cumple', 'no_cumple', 'na') THEN
      RAISE EXCEPTION 'Resultado no válido: %', v_res;
    END IF;
    UPDATE inspeccion_resultados r
       SET resultado     = CASE WHEN v_item ? 'resultado'     THEN v_res                         ELSE r.resultado END,
           observacion   = CASE WHEN v_item ? 'observacion'   THEN nullif(v_item->>'observacion', '')   ELSE r.observacion END,
           evidencia_url = CASE WHEN v_item ? 'evidencia_url' THEN nullif(v_item->>'evidencia_url', '') ELSE r.evidencia_url END
     WHERE r.inspeccion_id = v_i.id AND r.club_id = v_club AND r.punto_id = (v_item->>'punto_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Un punto no pertenece a esta inspección'; END IF;
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('actualizados', v_n);
END $$;

-- Finalizar: exige que todos los puntos estén evaluados; marca la inspección y
-- crea una orden CORRECTIVA (prioridad alta, componente de la norma, sin fuera de
-- servicio) por cada "no_cumple", ligada a la inspección y al punto.
CREATE OR REPLACE FUNCTION public.rpc_finalizar_inspeccion(p_inspeccion_id uuid, p_crear_ordenes boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_club  uuid;
  v_emp   uuid;
  v_i     inspecciones%ROWTYPE;
  v_norma normas%ROWTYPE;
  v_pend  integer;
  v_r     record;
  v_orden ordenes_trabajo%ROWTYPE;
  v_ordenes jsonb := '[]'::jsonb;
  v_cumple integer;
  v_nocumple integer;
BEGIN
  v_club := current_club_id();
  IF v_club IS NULL THEN
    RAISE EXCEPTION 'El usuario no pertenece a ningún club activo';
  END IF;
  SELECT id INTO v_emp FROM empleados WHERE auth_user_id = current_uid() AND activo;

  SELECT * INTO v_i FROM inspecciones WHERE id = p_inspeccion_id AND club_id = v_club FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La inspección no existe en este club'; END IF;
  IF v_i.estado = 'finalizada' THEN RAISE EXCEPTION 'La inspección ya está finalizada'; END IF;
  SELECT * INTO v_norma FROM normas WHERE id = v_i.norma_id;

  SELECT count(*) INTO v_pend FROM inspeccion_resultados WHERE inspeccion_id = v_i.id AND resultado IS NULL;
  IF v_pend > 0 THEN
    RAISE EXCEPTION 'Faltan % punto(s) por evaluar', v_pend;
  END IF;

  IF COALESCE(p_crear_ordenes, true) THEN
    FOR v_r IN
      SELECT res.id, res.observacion, pt.descripcion
      FROM inspeccion_resultados res JOIN norma_puntos pt ON pt.id = res.punto_id
      WHERE res.inspeccion_id = v_i.id AND res.resultado = 'no_cumple'
      ORDER BY pt.orden
    LOOP
      INSERT INTO ordenes_trabajo (club_id, tipo, pista_id, componente, descripcion, prioridad, estado,
                                   fuera_de_servicio, reportada_por, inspeccion_id, inspeccion_resultado_id)
      VALUES (v_club, 'correctiva', v_i.pista_id, v_norma.componente,
              v_norma.codigo || ' · ' || v_r.descripcion || COALESCE(' — ' || v_r.observacion, ''),
              'alta', 'abierta', false, v_emp, v_i.id, v_r.id)
      RETURNING * INTO v_orden;
      v_ordenes := v_ordenes || jsonb_build_object('orden_id', v_orden.id, 'folio', v_orden.folio);
    END LOOP;
  END IF;

  UPDATE inspecciones SET estado = 'finalizada', finalizada_en = now() WHERE id = v_i.id;

  SELECT count(*) FILTER (WHERE resultado = 'cumple'), count(*) FILTER (WHERE resultado = 'no_cumple')
    INTO v_cumple, v_nocumple
  FROM inspeccion_resultados WHERE inspeccion_id = v_i.id;

  RETURN jsonb_build_object(
    'inspeccion_id', v_i.id, 'cumple', v_cumple, 'no_cumple', v_nocumple,
    'cumplimiento_pct', CASE WHEN v_cumple + v_nocumple = 0 THEN NULL
                             ELSE round(100.0 * v_cumple / (v_cumple + v_nocumple), 1) END,
    'ordenes', v_ordenes);
END $$;

-- ------------------------------------------------------------
-- 10. Indicadores
-- ------------------------------------------------------------
-- Material académico: fórmulas
--
-- Ventana de cálculo: del p_desde al MENOR entre p_hasta y ahora (no se cuentan
-- horas futuras), recortada cada día al horario de operación
-- [p_apertura, p_cierre) en hora de México (UTC-6).
--
--  H_disp  Horas disponibles (capacidad) = Σ días Σ pistas activas (cierre - apertura)
--  H_res   Horas reservadas = Σ duración de reservas con estado <> 'cancelada'
--                             (incluye no-show: la pista estuvo comprometida)
--  H_juego Horas de juego   = Σ duración de reservas en 'checkin' o 'finalizada'
--  H_fuera Horas fuera de servicio = Σ duración de los bloqueos de agenda de la
--          pista (correctivos y preventivos), sin contar dos veces el tiempo en
--          que se traslapan dos bloqueos
--
--  Ocupación %       = H_res / H_disp x 100
--  Disponibilidad %  = (H_disp - H_fuera) / H_disp x 100
--  H_op    Horas en operación = H_disp - H_fuera
--  Fallas (n)        = órdenes CORRECTIVAS con reportada_en dentro del periodo
--                      (con pista; las generales no entran)
--  MTBF (h)          = H_op / n            (tiempo medio entre fallas; NULL si n = 0)
--  MTTR (h)          = promedio de (cerrada_en - reportada_en) de esas fallas ya
--                      cerradas, en horas de reloj (tiempo medio de reparación; NULL si ninguna cerrada)
--  Costo mantenimiento = Σ (costo_mano_obra + costo_refacciones) de las órdenes
--                      (preventivas y correctivas) CERRADAS dentro del periodo
--  Costo por hora de juego = Costo mantenimiento / H_juego   (NULL si H_juego = 0)
--
-- La fila global (pista_id NULL) suma las pistas: ocupación y disponibilidad con
-- las sumas de horas, MTBF = ΣH_op / Σn, MTTR ponderado por número de fallas cerradas.

-- Horas por día y pista (base de los indicadores y de la serie diaria)
CREATE OR REPLACE FUNCTION public._mtto_horas_dia(
  p_club     uuid,
  p_desde    timestamptz,
  p_hasta    timestamptz,
  p_pista_id uuid,
  p_apertura time,
  p_cierre   time
)
RETURNS TABLE (dia date, pista_id uuid, horas_disponibles numeric, horas_reservadas numeric,
               horas_juego numeric, horas_fuera numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH rango AS (
    SELECT p_desde AS d, LEAST(p_hasta, now()) AS h
  ),
  ventana AS (
    SELECT w.dia, w.ini, w.fin
    FROM rango,
         LATERAL (
           SELECT gs::date AS dia,
                  GREATEST((gs::date + p_apertura) AT TIME ZONE 'America/Mexico_City', rango.d) AS ini,
                  LEAST((gs::date + p_cierre) AT TIME ZONE 'America/Mexico_City', rango.h)       AS fin
           FROM generate_series((rango.d AT TIME ZONE 'America/Mexico_City')::date,
                                (rango.h AT TIME ZONE 'America/Mexico_City')::date, interval '1 day') gs
         ) w
    WHERE w.fin > w.ini      -- descarta los días cuyo horario cae fuera del periodo (p. ej. hoy antes de abrir)
  )
  SELECT v.dia, p.id,
         round(EXTRACT(epoch FROM v.fin - v.ini) / 3600.0, 4)                        AS horas_disponibles,
         COALESCE(r.reservadas, 0)                                                   AS horas_reservadas,
         COALESCE(r.juego, 0)                                                        AS horas_juego,
         COALESCE(f.fuera, 0)                                                        AS horas_fuera
  FROM ventana v
  JOIN pistas p ON p.club_id = p_club AND p.activa AND (p_pista_id IS NULL OR p.id = p_pista_id)
  LEFT JOIN LATERAL (
    SELECT sum(x.h) AS reservadas, sum(x.h) FILTER (WHERE x.estado IN ('checkin', 'finalizada')) AS juego
    FROM (
      SELECT rs.estado,
             GREATEST(0, EXTRACT(epoch FROM
               LEAST((rs.fecha + rs.hora_fin) AT TIME ZONE 'America/Mexico_City', v.fin)
             - GREATEST((rs.fecha + rs.hora_inicio) AT TIME ZONE 'America/Mexico_City', v.ini)) / 3600.0) AS h
      FROM reservas rs
      WHERE rs.club_id = p_club AND rs.pista_id = p.id AND rs.fecha = v.dia AND rs.estado <> 'cancelada'
    ) x
  ) r ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(sum(EXTRACT(epoch FROM upper(m) - lower(m))) / 3600.0, 0) AS fuera
    FROM (
      SELECT unnest(range_agg(tstzrange(GREATEST(b.inicio, v.ini),
                                        LEAST(COALESCE(b.fin, 'infinity'::timestamptz), v.fin)))) AS m
      FROM bloqueos_pista b
      WHERE b.club_id = p_club AND b.pista_id = p.id
        AND b.inicio < v.fin AND COALESCE(b.fin, 'infinity'::timestamptz) > v.ini
    ) u
  ) f ON true
$$;
REVOKE EXECUTE ON FUNCTION public._mtto_horas_dia(uuid, timestamptz, timestamptz, uuid, time, time) FROM PUBLIC, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_indicadores_mantenimiento(
  p_desde    timestamptz,
  p_hasta    timestamptz,
  p_pista_id uuid DEFAULT NULL,
  p_apertura time DEFAULT '07:00',
  p_cierre   time DEFAULT '22:00'
)
RETURNS TABLE (
  pista_id              uuid,
  pista_nombre          text,
  horas_disponibles     numeric,
  horas_reservadas      numeric,
  ocupacion_pct         numeric,
  horas_fuera_servicio  numeric,
  disponibilidad_pct    numeric,
  fallas                integer,
  mtbf_h                numeric,
  mttr_h                numeric,
  costo_mantenimiento   numeric,
  costo_mano_obra       numeric,
  costo_refacciones     numeric,
  horas_juego           numeric,
  costo_por_hora_juego  numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_club uuid;
BEGIN
  v_club := current_club_id();
  IF v_club IS NULL THEN
    RAISE EXCEPTION 'El usuario no pertenece a ningún club activo';
  END IF;
  IF p_desde IS NULL OR p_hasta IS NULL OR p_hasta <= p_desde THEN
    RAISE EXCEPTION 'El periodo no es válido';
  END IF;
  IF p_cierre <= p_apertura THEN
    RAISE EXCEPTION 'El horario de operación no es válido';
  END IF;
  IF p_pista_id IS NOT NULL THEN
    PERFORM 1 FROM pistas WHERE id = p_pista_id AND club_id = v_club;
    IF NOT FOUND THEN RAISE EXCEPTION 'La pista no existe en este club'; END IF;
  END IF;

  RETURN QUERY
  WITH horas AS (
    SELECT h.pista_id, sum(h.horas_disponibles) AS disp, sum(h.horas_reservadas) AS res,
           sum(h.horas_juego) AS juego, sum(h.horas_fuera) AS fuera
    FROM _mtto_horas_dia(v_club, p_desde, p_hasta, p_pista_id, p_apertura, p_cierre) h
    GROUP BY h.pista_id
  ),
  fallas_p AS (
    SELECT o.pista_id, count(*) AS n,
           count(*) FILTER (WHERE o.estado = 'cerrada') AS n_cerradas,
           COALESCE(sum(EXTRACT(epoch FROM o.cerrada_en - o.reportada_en) / 3600.0)
                    FILTER (WHERE o.estado = 'cerrada'), 0) AS horas_reparacion
    FROM ordenes_trabajo o
    WHERE o.club_id = v_club AND o.tipo = 'correctiva' AND o.pista_id IS NOT NULL
      AND o.reportada_en >= p_desde AND o.reportada_en < p_hasta
      AND (p_pista_id IS NULL OR o.pista_id = p_pista_id)
    GROUP BY o.pista_id
  ),
  costos AS (
    SELECT o.pista_id, sum(o.costo_mano_obra) AS mo, sum(o.costo_refacciones) AS ref
    FROM ordenes_trabajo o
    WHERE o.club_id = v_club AND o.estado = 'cerrada' AND o.pista_id IS NOT NULL
      AND o.cerrada_en >= p_desde AND o.cerrada_en < p_hasta
      AND (p_pista_id IS NULL OR o.pista_id = p_pista_id)
    GROUP BY o.pista_id
  ),
  por_pista AS (
    SELECT p.id AS pid, p.nombre::text AS nombre, p.orden,
           COALESCE(h.disp, 0) AS disp, COALESCE(h.res, 0) AS res, COALESCE(h.juego, 0) AS juego,
           COALESCE(h.fuera, 0) AS fuera,
           COALESCE(f.n, 0) AS n, COALESCE(f.n_cerradas, 0) AS n_cerradas,
           COALESCE(f.horas_reparacion, 0) AS horas_rep,
           COALESCE(c.mo, 0) AS mo, COALESCE(c.ref, 0) AS ref
    FROM pistas p
    LEFT JOIN horas h ON h.pista_id = p.id
    LEFT JOIN fallas_p f ON f.pista_id = p.id
    LEFT JOIN costos c ON c.pista_id = p.id
    WHERE p.club_id = v_club AND p.activa AND (p_pista_id IS NULL OR p.id = p_pista_id)
  ),
  uni AS (
    SELECT pp.pid, pp.nombre, pp.orden, pp.disp, pp.res, pp.juego, pp.fuera, pp.n, pp.n_cerradas, pp.horas_rep, pp.mo, pp.ref
    FROM por_pista pp
    UNION ALL
    SELECT NULL::uuid, 'Todas las pistas', 999, COALESCE(sum(disp), 0), COALESCE(sum(res), 0), COALESCE(sum(juego), 0),
           COALESCE(sum(fuera), 0), COALESCE(sum(n), 0)::bigint, COALESCE(sum(n_cerradas), 0)::bigint,
           COALESCE(sum(horas_rep), 0), COALESCE(sum(mo), 0), COALESCE(sum(ref), 0)
    FROM por_pista
  )
  SELECT u.pid, u.nombre,
         round(u.disp, 2),
         round(u.res, 2),
         CASE WHEN u.disp > 0 THEN round(100 * u.res / u.disp, 1) END,
         round(u.fuera, 2),
         CASE WHEN u.disp > 0 THEN round(100 * (u.disp - u.fuera) / u.disp, 1) END,
         u.n::integer,
         CASE WHEN u.n > 0 THEN round((u.disp - u.fuera) / u.n, 1) END,
         CASE WHEN u.n_cerradas > 0 THEN round(u.horas_rep / u.n_cerradas, 1) END,
         round(u.mo + u.ref, 2),
         round(u.mo, 2),
         round(u.ref, 2),
         round(u.juego, 2),
         CASE WHEN u.juego > 0 THEN round((u.mo + u.ref) / u.juego, 2) END
  FROM uni u
  ORDER BY u.orden, u.nombre;
END $$;

COMMENT ON FUNCTION public.rpc_indicadores_mantenimiento(timestamptz, timestamptz, uuid, time, time) IS
  'Indicadores por pista y global (pista_id NULL, última fila). Fórmulas en el encabezado de la sección 10 de la migración 20261029000003.';

-- Serie diaria para la gráfica de ocupación y disponibilidad (todas las pistas o una)
CREATE OR REPLACE FUNCTION public.rpc_serie_diaria_mantenimiento(
  p_desde    timestamptz,
  p_hasta    timestamptz,
  p_pista_id uuid DEFAULT NULL,
  p_apertura time DEFAULT '07:00',
  p_cierre   time DEFAULT '22:00'
)
RETURNS TABLE (dia date, horas_disponibles numeric, horas_reservadas numeric, horas_fuera_servicio numeric,
               ocupacion_pct numeric, disponibilidad_pct numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_club uuid;
BEGIN
  v_club := current_club_id();
  IF v_club IS NULL THEN
    RAISE EXCEPTION 'El usuario no pertenece a ningún club activo';
  END IF;
  IF p_desde IS NULL OR p_hasta IS NULL OR p_hasta <= p_desde THEN
    RAISE EXCEPTION 'El periodo no es válido';
  END IF;
  IF p_pista_id IS NOT NULL THEN
    PERFORM 1 FROM pistas WHERE id = p_pista_id AND club_id = v_club;
    IF NOT FOUND THEN RAISE EXCEPTION 'La pista no existe en este club'; END IF;
  END IF;

  RETURN QUERY
  SELECT h.dia,
         round(sum(h.horas_disponibles), 2),
         round(sum(h.horas_reservadas), 2),
         round(sum(h.horas_fuera), 2),
         CASE WHEN sum(h.horas_disponibles) > 0 THEN round(100 * sum(h.horas_reservadas) / sum(h.horas_disponibles), 1) END,
         CASE WHEN sum(h.horas_disponibles) > 0
              THEN round(100 * (sum(h.horas_disponibles) - sum(h.horas_fuera)) / sum(h.horas_disponibles), 1) END
  FROM _mtto_horas_dia(v_club, p_desde, p_hasta, p_pista_id, p_apertura, p_cierre) h
  GROUP BY h.dia
  ORDER BY h.dia;
END $$;

-- ------------------------------------------------------------
-- 11. Vistas (security_invoker: respetan la RLS de quien consulta)
-- ------------------------------------------------------------

-- Pistas con su ficha y estado efectivo
CREATE VIEW public.v_pistas_mantenimiento WITH (security_invoker = true) AS
SELECT p.id AS pista_id, p.club_id, p.nombre, p.tipo, p.activa, p.orden, p.nota_mantenimiento,
       f.largo_m, f.ancho_m, f.altura_libre_m, f.superficie, f.superficie_instalada_en, f.cerramiento,
       f.luminarias_num, f.luminaria_potencia_w, f.lux_medido, f.uniformidad, f.medicion_en, f.observaciones,
       -- estado efectivo: un bloqueo activo manda sobre el estado guardado
       CASE
         WHEN EXISTS (SELECT 1 FROM bloqueos_pista b WHERE b.pista_id = p.id AND b.tipo = 'fuera_de_servicio'
                        AND b.inicio <= now() AND (b.fin IS NULL OR b.fin > now())) THEN 'fuera_de_servicio'
         WHEN EXISTS (SELECT 1 FROM bloqueos_pista b WHERE b.pista_id = p.id
                        AND b.inicio <= now() AND (b.fin IS NULL OR b.fin > now())) THEN 'mantenimiento'
         ELSE COALESCE(f.estado_operativo, 'operativa')
       END AS estado_operativo,
       (SELECT count(*) FROM ordenes_trabajo o WHERE o.pista_id = p.id AND o.estado <> 'cerrada')::integer AS ordenes_abiertas,
       (SELECT max(o.cerrada_en) FROM ordenes_trabajo o WHERE o.pista_id = p.id AND o.tipo = 'preventiva' AND o.estado = 'cerrada') AS ultimo_preventivo,
       (SELECT min(b.inicio) FROM bloqueos_pista b WHERE b.pista_id = p.id AND b.inicio > now()) AS proximo_bloqueo
FROM pistas p
LEFT JOIN pista_ficha f ON f.pista_id = p.id;

-- Órdenes con nombres ya resueltos
CREATE VIEW public.v_ordenes_trabajo WITH (security_invoker = true) AS
SELECT o.id, o.club_id, o.folio, o.tipo, o.pista_id, p.nombre AS pista_nombre, o.componente, o.descripcion,
       o.prioridad, o.estado, o.fuera_de_servicio,
       o.reportada_por, rp.nombre AS reportada_por_nombre,
       o.responsable_id, rs.nombre AS responsable_nombre,
       o.reportada_en, o.programada_para, o.iniciada_en, o.cerrada_en,
       o.causa, o.accion_realizada, o.costo_mano_obra, o.costo_refacciones,
       (o.costo_mano_obra + o.costo_refacciones) AS costo_total,
       o.tarea_preventiva_id, t.nombre AS tarea_nombre,
       o.inspeccion_id, o.inspeccion_resultado_id,
       n.codigo AS norma_codigo,
       CASE WHEN o.cerrada_en IS NOT NULL
            THEN round(EXTRACT(epoch FROM o.cerrada_en - o.reportada_en) / 3600.0, 1) END AS horas_reparacion,
       (SELECT b.id FROM bloqueos_pista b WHERE b.orden_id = o.id ORDER BY b.inicio DESC LIMIT 1) AS bloqueo_id,
       o.created_at
FROM ordenes_trabajo o
LEFT JOIN pistas p ON p.id = o.pista_id
LEFT JOIN empleados rp ON rp.id = o.reportada_por
LEFT JOIN empleados rs ON rs.id = o.responsable_id
LEFT JOIN tareas_preventivas t ON t.id = o.tarea_preventiva_id
LEFT JOIN inspecciones i ON i.id = o.inspeccion_id
LEFT JOIN normas n ON n.id = i.norma_id;

-- Tareas preventivas con su próximo vencimiento
--   Base = última ejecución (o la creación de la tarea si nunca se ha hecho).
--   Calendario: proxima_fecha = base + N días/semanas/meses; avance = transcurrido / intervalo.
--   Horas de uso: uso_acumulado_h = horas de juego (reservas checkin/finalizada)
--     de la pista MÁS usada de las que aplican, desde la base; avance = uso / N.
--   estado: vencida (avance >= 100 %), proxima (>= 80 %), al_dia.
CREATE VIEW public.v_tareas_preventivas WITH (security_invoker = true) AS
WITH base AS (
  SELECT t.*, COALESCE(t.ultima_ejecucion, t.created_at) AS desde,
         CASE t.frecuencia_tipo
           WHEN 'dias'    THEN COALESCE(t.ultima_ejecucion, t.created_at) + make_interval(days   => t.frecuencia_valor)
           WHEN 'semanas' THEN COALESCE(t.ultima_ejecucion, t.created_at) + make_interval(weeks  => t.frecuencia_valor)
           WHEN 'meses'   THEN COALESCE(t.ultima_ejecucion, t.created_at) + make_interval(months => t.frecuencia_valor)
         END AS proxima
  FROM tareas_preventivas t
),
uso AS (
  SELECT b.id,
         COALESCE((SELECT max(h) FROM (
            SELECT sum(EXTRACT(epoch FROM r.hora_fin - r.hora_inicio) / 3600.0) AS h
            FROM reservas r
            WHERE r.club_id = b.club_id AND r.estado IN ('checkin', 'finalizada')
              AND (r.fecha + r.hora_inicio) AT TIME ZONE 'America/Mexico_City' >= b.desde
              AND (b.aplica_todas OR r.pista_id = ANY (b.pista_ids))
            GROUP BY r.pista_id) u), 0) AS horas
  FROM base b WHERE b.frecuencia_tipo = 'horas_uso'
)
SELECT b.id, b.club_id, b.nombre, b.descripcion, b.componente, b.aplica_todas, b.pista_ids,
       b.frecuencia_tipo, b.frecuencia_valor, b.duracion_min, b.bloquea_agenda,
       b.responsable_id, e.nombre AS responsable_nombre, b.pasos, b.refacciones,
       b.ultima_ejecucion, b.activa,
       CASE WHEN b.frecuencia_tipo = 'horas_uso' THEN NULL ELSE b.proxima END AS proxima_fecha,
       round(COALESCE(u.horas, 0)::numeric, 1) AS uso_acumulado_h,
       round(CASE WHEN b.frecuencia_tipo = 'horas_uso'
                  THEN 100.0 * COALESCE(u.horas, 0) / b.frecuencia_valor
                  ELSE 100.0 * EXTRACT(epoch FROM now() - b.desde) / NULLIF(EXTRACT(epoch FROM b.proxima - b.desde), 0)
             END::numeric, 1) AS avance_pct,
       CASE
         WHEN CASE WHEN b.frecuencia_tipo = 'horas_uso'
                   THEN 100.0 * COALESCE(u.horas, 0) / b.frecuencia_valor
                   ELSE 100.0 * EXTRACT(epoch FROM now() - b.desde) / NULLIF(EXTRACT(epoch FROM b.proxima - b.desde), 0)
              END >= 100 THEN 'vencida'
         WHEN CASE WHEN b.frecuencia_tipo = 'horas_uso'
                   THEN 100.0 * COALESCE(u.horas, 0) / b.frecuencia_valor
                   ELSE 100.0 * EXTRACT(epoch FROM now() - b.desde) / NULLIF(EXTRACT(epoch FROM b.proxima - b.desde), 0)
              END >= 80 THEN 'proxima'
         ELSE 'al_dia'
       END AS estado,
       b.created_at
FROM base b
LEFT JOIN uso u ON u.id = b.id
LEFT JOIN empleados e ON e.id = b.responsable_id;

-- Inspecciones con su cumplimiento
--   cumplimiento_pct = cumple / (cumple + no_cumple) x 100 (los "n/a" no cuentan)
CREATE VIEW public.v_inspecciones WITH (security_invoker = true) AS
SELECT i.id, i.club_id, i.norma_id, n.codigo AS norma_codigo, n.nombre AS norma_nombre,
       i.pista_id, p.nombre AS pista_nombre, i.fecha, i.responsable_id, e.nombre AS responsable_nombre,
       i.estado, i.observaciones, i.finalizada_en, i.created_at,
       c.total, c.cumple, c.no_cumple, c.na, c.pendientes,
       CASE WHEN c.cumple + c.no_cumple = 0 THEN NULL
            ELSE round(100.0 * c.cumple / (c.cumple + c.no_cumple), 1) END AS cumplimiento_pct,
       (SELECT count(*) FROM ordenes_trabajo o WHERE o.inspeccion_id = i.id)::integer AS ordenes_generadas
FROM inspecciones i
JOIN normas n ON n.id = i.norma_id
LEFT JOIN pistas p ON p.id = i.pista_id
LEFT JOIN empleados e ON e.id = i.responsable_id
CROSS JOIN LATERAL (
  SELECT count(*)::integer AS total,
         (count(*) FILTER (WHERE r.resultado = 'cumple'))::integer AS cumple,
         (count(*) FILTER (WHERE r.resultado = 'no_cumple'))::integer AS no_cumple,
         (count(*) FILTER (WHERE r.resultado = 'na'))::integer AS na,
         (count(*) FILTER (WHERE r.resultado IS NULL))::integer AS pendientes
  FROM inspeccion_resultados r WHERE r.inspeccion_id = i.id
) c;

-- Normas con su última inspección finalizada y próximo vencimiento
--   proxima_fecha = fecha de la última finalizada + frecuencia_meses
--   estado: sin_inspeccion | vencida (proxima_fecha < hoy) | proxima (en <= 30 días) | al_dia
CREATE VIEW public.v_normas_resumen WITH (security_invoker = true) AS
SELECT n.id AS norma_id, n.club_id, n.codigo, n.nombre, n.alcance, n.frecuencia_meses, n.componente,
       (SELECT count(*) FROM norma_puntos pt WHERE pt.norma_id = n.id AND pt.activo)::integer AS puntos,
       u.id AS ultima_inspeccion_id, u.fecha AS ultima_fecha, u.cumplimiento_pct AS ultimo_cumplimiento_pct,
       (u.fecha + make_interval(months => n.frecuencia_meses))::date AS proxima_fecha,
       d.id AS borrador_id,
       CASE
         WHEN u.id IS NULL THEN 'sin_inspeccion'
         WHEN (u.fecha + make_interval(months => n.frecuencia_meses))::date < (now() AT TIME ZONE 'America/Mexico_City')::date THEN 'vencida'
         WHEN (u.fecha + make_interval(months => n.frecuencia_meses))::date <= (now() AT TIME ZONE 'America/Mexico_City')::date + 30 THEN 'proxima'
         ELSE 'al_dia'
       END AS estado
FROM normas n
LEFT JOIN LATERAL (
  SELECT vi.id, vi.fecha, vi.cumplimiento_pct FROM v_inspecciones vi
  WHERE vi.norma_id = n.id AND vi.estado = 'finalizada' ORDER BY vi.fecha DESC, vi.created_at DESC LIMIT 1
) u ON true
LEFT JOIN LATERAL (
  SELECT i.id FROM inspecciones i WHERE i.norma_id = n.id AND i.estado = 'borrador' ORDER BY i.created_at DESC LIMIT 1
) d ON true
WHERE n.activa;

-- Refacciones con punto de reorden
--   consumo_diario  = Σ salidas de los últimos 90 días / 90
--   punto_reorden   = consumo_diario x tiempo_entrega_dias + stock_seguridad
--   estado          = 'Pedir' si existencia <= punto_reorden, si no 'OK'
--   cobertura_dias  = existencia / consumo_diario (NULL si no hay consumo)
CREATE VIEW public.v_refacciones WITH (security_invoker = true) AS
SELECT r.id, r.club_id, r.nombre, r.unidad, r.existencia, r.stock_seguridad, r.tiempo_entrega_dias,
       r.costo_unitario, r.proveedor, r.activa, r.created_at,
       round(c.salidas_90d / 90.0, 4) AS consumo_diario,
       round(c.salidas_90d / 90.0 * r.tiempo_entrega_dias + r.stock_seguridad, 2) AS punto_reorden,
       CASE WHEN r.existencia <= c.salidas_90d / 90.0 * r.tiempo_entrega_dias + r.stock_seguridad
            THEN 'Pedir' ELSE 'OK' END AS estado,
       CASE WHEN c.salidas_90d > 0 THEN round(r.existencia / (c.salidas_90d / 90.0), 0) END AS cobertura_dias,
       round(r.existencia * r.costo_unitario, 2) AS valor_inventario
FROM refacciones r
CROSS JOIN LATERAL (
  SELECT COALESCE(sum(m.cantidad), 0) AS salidas_90d
  FROM movimientos_refaccion m
  WHERE m.refaccion_id = r.id AND m.tipo = 'salida' AND m.created_at >= now() - interval '90 days'
) c;

GRANT SELECT ON public.v_pistas_mantenimiento, public.v_ordenes_trabajo, public.v_tareas_preventivas,
                public.v_inspecciones, public.v_normas_resumen, public.v_refacciones TO authenticated;

-- ------------------------------------------------------------
-- 12. Catálogo global de normas (club_id NULL)
--     Los puntos son una guía de verificación de ejemplo para el curso: no
--     reproducen el texto de la norma ni sustituyen su lectura.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_id uuid;
BEGIN
  -- NOM-002-STPS-2010
  INSERT INTO normas (club_id, codigo, nombre, alcance, frecuencia_meses, componente)
  VALUES (NULL, 'NOM-002-STPS-2010', 'Condiciones de seguridad: prevención y protección contra incendios',
          'Extintores, rutas de evacuación, alarmas y almacenes de materiales inflamables del club', 12, 'otro')
  RETURNING id INTO v_id;
  INSERT INTO norma_puntos (norma_id, club_id, orden, descripcion)
  SELECT v_id, NULL, o, d FROM unnest(ARRAY[
    'Extintores con carga vigente y sello de la última revisión',
    'Extintores visibles, señalizados y a una altura accesible',
    'Rutas de evacuación libres de obstáculos',
    'Salidas de emergencia sin llave ni candado que impidan abrirlas',
    'Alarma o aviso de emergencia audible en todas las áreas',
    'Almacén de líquidos inflamables aislado y ventilado',
    'Instalación eléctrica sin cables expuestos ni sobrecargas en zonas de riesgo',
    'Plan de atención a emergencias y simulacro registrado en el último año'
  ]) WITH ORDINALITY AS t(d, o);

  -- NOM-025-STPS-2008
  INSERT INTO normas (club_id, codigo, nombre, alcance, frecuencia_meses, componente)
  VALUES (NULL, 'NOM-025-STPS-2008', 'Condiciones de iluminación en los centros de trabajo',
          'Nivel de iluminancia y uniformidad en pistas, recepción, bar y áreas de trabajo', 12, 'iluminacion')
  RETURNING id INTO v_id;
  INSERT INTO norma_puntos (norma_id, club_id, orden, descripcion)
  SELECT v_id, NULL, o, d FROM unnest(ARRAY[
    'Nivel de iluminancia medido en cada pista dentro del valor de diseño',
    'Uniformidad de iluminancia aceptable en la superficie de juego',
    'Medición con luxómetro calibrado y registro de la fecha',
    'Luminarias limpias y sin lámparas fundidas',
    'Sin deslumbramiento directo para los jugadores',
    'Iluminación de emergencia funcionando en pasillos y salidas',
    'Iluminación suficiente en recepción, bar y vestidores',
    'Registro de mantenimiento de luminarias actualizado'
  ]) WITH ORDINALITY AS t(d, o);

  -- NOM-001-STPS-2008
  INSERT INTO normas (club_id, codigo, nombre, alcance, frecuencia_meses, componente)
  VALUES (NULL, 'NOM-001-STPS-2008', 'Edificios, locales, instalaciones y áreas: condiciones de seguridad',
          'Estructura del edificio, pisos, techos, escaleras, cerramientos y cristales de las pistas', 12, 'estructura')
  RETURNING id INTO v_id;
  INSERT INTO norma_puntos (norma_id, club_id, orden, descripcion)
  SELECT v_id, NULL, o, d FROM unnest(ARRAY[
    'Pisos y accesos sin grietas, desniveles ni superficies resbalosas',
    'Escaleras con barandales firmes y antiderrapante',
    'Techumbre y estructura sin corrosión ni deformaciones visibles',
    'Cristales de las pistas sin fisuras, astillas ni holguras en sus herrajes',
    'Postes y mallas del cerramiento firmes y bien anclados',
    'Puertas de pista que cierran y traban correctamente',
    'Drenaje y pendientes de las pistas sin encharcamientos',
    'Pasillos y áreas comunes libres de obstáculos',
    'Instalaciones sanitarias en buen estado y limpias'
  ]) WITH ORDINALITY AS t(d, o);

  -- NOM-029-STPS-2011
  INSERT INTO normas (club_id, codigo, nombre, alcance, frecuencia_meses, componente)
  VALUES (NULL, 'NOM-029-STPS-2011', 'Mantenimiento de las instalaciones eléctricas: condiciones de seguridad',
          'Tableros, circuitos de alumbrado de pistas, contactos y tierras físicas', 12, 'iluminacion')
  RETURNING id INTO v_id;
  INSERT INTO norma_puntos (norma_id, club_id, orden, descripcion)
  SELECT v_id, NULL, o, d FROM unnest(ARRAY[
    'Tableros eléctricos cerrados, identificados y sin humedad',
    'Interruptores termomagnéticos rotulados por circuito',
    'Sistema de tierras físicas medido y registrado',
    'Cables y canalizaciones sin daños ni empalmes expuestos',
    'Contactos y luminarias de pista con protección contra agua',
    'Procedimiento de bloqueo y etiquetado para trabajos eléctricos',
    'Personal que interviene capacitado y autorizado',
    'Bitácora de mantenimiento eléctrico actualizada'
  ]) WITH ORDINALITY AS t(d, o);

  -- NOM-026-STPS-2008
  INSERT INTO normas (club_id, codigo, nombre, alcance, frecuencia_meses, componente)
  VALUES (NULL, 'NOM-026-STPS-2008', 'Colores y señales de seguridad e higiene, e identificación de riesgos por fluidos conducidos en tuberías',
          'Señalización de seguridad del club y tuberías de gas, agua y aire acondicionado', 12, 'otro')
  RETURNING id INTO v_id;
  INSERT INTO norma_puntos (norma_id, club_id, orden, descripcion)
  SELECT v_id, NULL, o, d FROM unnest(ARRAY[
    'Señales de prohibición, obligación, precaución e información visibles y legibles',
    'Señalización de rutas de evacuación y salidas de emergencia',
    'Señalización de extintores y equipo contra incendio',
    'Señales de riesgo eléctrico en tableros',
    'Tuberías de gas, agua y aire identificadas por color',
    'Piso húmedo y zonas de riesgo señalizadas durante la limpieza',
    'Señales en buen estado, sin decoloración ni daños'
  ]) WITH ORDINALITY AS t(d, o);

  -- NOM-251-SSA1-2009
  INSERT INTO normas (club_id, codigo, nombre, alcance, frecuencia_meses, componente)
  VALUES (NULL, 'NOM-251-SSA1-2009', 'Prácticas de higiene para el proceso de alimentos, bebidas o suplementos alimenticios',
          'Cocina, barra y almacén de alimentos y bebidas del club', 6, 'otro')
  RETURNING id INTO v_id;
  INSERT INTO norma_puntos (norma_id, club_id, orden, descripcion)
  SELECT v_id, NULL, o, d FROM unnest(ARRAY[
    'Personal con uniforme limpio, cabello cubierto y manos lavadas',
    'Lavamanos con agua, jabón y toallas desechables en cocina y barra',
    'Refrigeradores y congeladores a la temperatura correcta, con bitácora',
    'Alimentos almacenados separados del piso y de productos de limpieza',
    'Superficies y utensilios limpios y desinfectados',
    'Control de plagas vigente y registrado',
    'Agua potable verificada con cloro residual',
    'Manejo de basura en contenedores tapados y fuera del área de preparación',
    'Alimentos y bebidas dentro de su fecha de caducidad'
  ]) WITH ORDINALITY AS t(d, o);
END $$;
