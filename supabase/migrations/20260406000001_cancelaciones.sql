-- ============================================================
-- Módulo de cancelaciones y devoluciones (RECUPERADO)
--
-- Se aplicó el 2026-04-06 directamente sobre Supabase y no se guardó como
-- archivo. SQL tomado sin cambios de:
--   · docs/plans/2026-04-06-cancelaciones-implementation.md
--   · docs/plans/2026-04-06-cancelaciones-audit-fixes.md (versión final de
--     rpc_solicitar_cancelacion_post_cobro y rpc_get_reembolsos_periodo)
--
-- Se omite la política "cancelaciones_club_isolation" de ese plan: es idéntica
-- a "club_isolation", que ya crea 20260329000001_rls_policies.sql.
-- ============================================================

-- New estado enum
CREATE TYPE cancelacion_estado AS ENUM (
  'ejecutada',
  'pendiente',
  'aprobada',
  'reembolsada',
  'rechazada'
);

-- Extend cancelaciones table
ALTER TABLE cancelaciones
  ADD COLUMN IF NOT EXISTS estado           cancelacion_estado NOT NULL DEFAULT 'ejecutada',
  ADD COLUMN IF NOT EXISTS reserva_id       uuid REFERENCES reservas(id),
  ADD COLUMN IF NOT EXISTS metodo_pago      text,
  ADD COLUMN IF NOT EXISTS rechazado_motivo text;

CREATE OR REPLACE FUNCTION rpc_cancelar_item_pre_cobro(
  p_club_id        uuid,
  p_cuenta_item_id uuid,
  p_motivo         text,
  p_cancelado_por  uuid,
  p_fue_preparado  boolean DEFAULT false,
  p_genera_merma   boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cancelacion_id uuid;
  v_item           record;
BEGIN
  -- Fetch item
  SELECT ci.*, c.club_id AS c_club_id
  INTO v_item
  FROM cuenta_items ci
  JOIN cuentas c ON c.id = ci.cuenta_id
  WHERE ci.id = p_cuenta_item_id
    AND c.club_id = p_club_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item no encontrado';
  END IF;

  -- Mark item as cancelled
  UPDATE cuenta_items SET estado = 'cancelado' WHERE id = p_cuenta_item_id;

  -- Register cancellation
  INSERT INTO cancelaciones (
    club_id, cuenta_id, cuenta_item_id, cantidad, monto,
    motivo, tipo, estado, fue_preparado, genera_merma, cancelado_por
  )
  VALUES (
    p_club_id, v_item.cuenta_id, p_cuenta_item_id, v_item.cantidad, v_item.subtotal,
    p_motivo, 'pre_cobro', 'ejecutada', p_fue_preparado, p_genera_merma, p_cancelado_por
  )
  RETURNING id INTO v_cancelacion_id;

  -- Register stock waste if prepared
  IF p_fue_preparado AND p_genera_merma THEN
    INSERT INTO movimientos_stock (club_id, producto_id, tipo, cantidad, motivo, empleado_id)
    VALUES (p_club_id, v_item.producto_id, 'merma', v_item.cantidad, p_motivo, p_cancelado_por);
  END IF;

  RETURN v_cancelacion_id;
END;
$$;

-- Versión con control de duplicados (audit fixes)
CREATE OR REPLACE FUNCTION public.rpc_solicitar_cancelacion_post_cobro(
  p_club_id uuid,
  p_cuenta_item_id uuid,
  p_motivo text,
  p_cancelado_por uuid,
  p_metodo_pago text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_cancelacion_id uuid;
  v_item           record;
BEGIN
  -- Duplicate check
  IF EXISTS (
    SELECT 1 FROM cancelaciones
    WHERE cuenta_item_id = p_cuenta_item_id
      AND estado IN ('pendiente'::cancelacion_estado, 'aprobada'::cancelacion_estado, 'reembolsada'::cancelacion_estado)
  ) THEN
    RAISE EXCEPTION 'Ya existe una cancelación activa para este ítem';
  END IF;

  SELECT ci.*, c.club_id AS c_club_id
  INTO v_item
  FROM cuenta_items ci
  JOIN cuentas c ON c.id = ci.cuenta_id
  WHERE ci.id = p_cuenta_item_id
    AND c.club_id = p_club_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item no encontrado';
  END IF;

  INSERT INTO cancelaciones (
    club_id, cuenta_id, cuenta_item_id, cantidad, monto,
    motivo, tipo, estado, metodo_pago, cancelado_por
  )
  VALUES (
    p_club_id, v_item.cuenta_id, p_cuenta_item_id, v_item.cantidad, v_item.subtotal,
    p_motivo, 'post_cobro'::cancelacion_tipo, 'pendiente'::cancelacion_estado,
    p_metodo_pago, p_cancelado_por
  )
  RETURNING id INTO v_cancelacion_id;

  RETURN v_cancelacion_id;
END;
$function$;

CREATE OR REPLACE FUNCTION rpc_aprobar_cancelacion(
  p_cancelacion_id uuid,
  p_autorizado_por uuid,
  p_caja_id        uuid,
  p_rechazar       boolean DEFAULT false,
  p_motivo_rechazo text    DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_can record;
BEGIN
  SELECT * INTO v_can FROM cancelaciones WHERE id = p_cancelacion_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cancelación no encontrada';
  END IF;

  IF v_can.estado != 'pendiente' THEN
    RAISE EXCEPTION 'Solo se pueden aprobar cancelaciones en estado pendiente';
  END IF;

  IF p_rechazar THEN
    UPDATE cancelaciones
    SET estado = 'rechazada', autorizado_por = p_autorizado_por, rechazado_motivo = p_motivo_rechazo
    WHERE id = p_cancelacion_id;
    RETURN;
  END IF;

  -- Approve
  UPDATE cancelaciones
  SET estado = 'aprobada', autorizado_por = p_autorizado_por
  WHERE id = p_cancelacion_id;

  -- If efectivo, register cash egress
  IF v_can.metodo_pago = 'efectivo' AND p_caja_id IS NOT NULL THEN
    INSERT INTO movimientos_caja (caja_id, tipo, concepto, monto)
    VALUES (p_caja_id, 'egreso'::movimiento_tipo, 'Reembolso: ' || v_can.motivo, v_can.monto);
  END IF;

  -- Mark as reimbursed
  UPDATE cancelaciones SET estado = 'reembolsada' WHERE id = p_cancelacion_id;
END;
$$;

CREATE OR REPLACE FUNCTION rpc_cancelar_reserva(
  p_club_id       uuid,
  p_reserva_id    uuid,
  p_motivo        text,
  p_cancelado_por uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cancelacion_id uuid;
  v_reserva        record;
BEGIN
  SELECT * INTO v_reserva
  FROM reservas
  WHERE id = p_reserva_id AND club_id = p_club_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reserva no encontrada';
  END IF;

  IF v_reserva.estado NOT IN ('confirmada') THEN
    RAISE EXCEPTION 'Solo se pueden cancelar reservas en estado confirmada';
  END IF;

  -- Cancel reservation
  UPDATE reservas SET estado = 'cancelada' WHERE id = p_reserva_id;

  -- Register cancellation record
  INSERT INTO cancelaciones (
    club_id, reserva_id, cantidad, monto,
    motivo, tipo, estado, cancelado_por
  )
  VALUES (
    p_club_id, p_reserva_id, 1, 0,
    p_motivo, 'pre_cobro', 'ejecutada', p_cancelado_por
  )
  RETURNING id INTO v_cancelacion_id;

  RETURN v_cancelacion_id;
END;
$$;

-- Total de reembolsos en un rango de fechas (audit fixes)
CREATE OR REPLACE FUNCTION public.rpc_get_reembolsos_periodo(
  p_club_id uuid,
  p_desde timestamptz,
  p_hasta timestamptz
)
RETURNS numeric
LANGUAGE sql
SECURITY DEFINER
AS $function$
  SELECT COALESCE(SUM(monto), 0)
  FROM cancelaciones
  WHERE club_id = p_club_id
    AND estado = 'reembolsada'::cancelacion_estado
    AND created_at >= p_desde
    AND created_at <= p_hasta;
$function$;
