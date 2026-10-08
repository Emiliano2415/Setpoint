-- ============================================================
-- RPC atómicas de caja, check-in e inventario (RECUPERADO)
--
-- Se aplicaron el 2026-04-05 directamente sobre Supabase y no se guardaron
-- como archivo. SQL tomado sin cambios de
-- docs/plans/2026-04-05-bug-fixes-critical.md (migraciones add_rpc_open_caja,
-- add_rpc_close_caja, add_rpc_check_in_with_payment, add_rpc_adjust_stock)
-- y de "Setpoint/14 - Bug Fixes 2026-04-05.md" (add_nombre_precio_to_comanda_items).
-- ============================================================

ALTER TABLE comanda_items
  ADD COLUMN IF NOT EXISTS nombre text,
  ADD COLUMN IF NOT EXISTS precio_unitario numeric(10,2);

-- Migration: add_rpc_open_caja
CREATE OR REPLACE FUNCTION rpc_open_caja(
  p_club_id   uuid,
  p_empleado_id uuid,
  p_tipo      text,
  p_fondo     numeric,
  p_notas     text DEFAULT 'Fondo inicial de turno'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_turno_id uuid;
  v_caja_id  uuid;
BEGIN
  -- Insert turno
  INSERT INTO turnos (club_id, empleado_id, tipo, activo)
  VALUES (p_club_id, p_empleado_id, p_tipo, true)
  RETURNING id INTO v_turno_id;

  -- Insert caja
  INSERT INTO cajas (club_id, turno_id, fondo_inicial, estado,
                     total_efectivo, total_tarjeta, total_propinas, diferencia)
  VALUES (p_club_id, v_turno_id, p_fondo, 'abierta', 0, 0, 0, 0)
  RETURNING id INTO v_caja_id;

  -- Insert fondo movement if > 0
  IF p_fondo > 0 THEN
    INSERT INTO movimientos_caja (caja_id, tipo, concepto, monto)
    VALUES (v_caja_id, 'fondo', p_notas, p_fondo);
  END IF;

  RETURN jsonb_build_object('cajaId', v_caja_id, 'turnoId', v_turno_id);
END;
$$;

-- Migration: add_rpc_close_caja
CREATE OR REPLACE FUNCTION rpc_close_caja(
  p_caja_id   uuid,
  p_turno_id  uuid,
  p_contado   numeric,
  p_esperado  numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_diferencia numeric;
BEGIN
  v_diferencia := p_contado - p_esperado;

  UPDATE cajas
  SET estado      = 'cerrada',
      total_efectivo = p_contado,
      diferencia  = v_diferencia,
      cerrada_at  = now()
  WHERE id = p_caja_id;

  UPDATE turnos
  SET fin    = now(),
      activo = false
  WHERE id = p_turno_id;
END;
$$;

-- Migration: add_rpc_check_in_with_payment
CREATE OR REPLACE FUNCTION rpc_check_in_with_payment(
  p_reserva_id uuid,
  p_precio     numeric,
  p_metodo     text,
  p_caja_id    uuid,
  p_concepto   text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert movimiento FIRST (if this fails, reserva stays unchanged)
  INSERT INTO movimientos_caja (caja_id, tipo, monto, metodo, concepto)
  VALUES (p_caja_id, 'ingreso', p_precio, p_metodo::text, p_concepto);

  -- Only update reserva estado if payment registered successfully
  UPDATE reservas
  SET estado = 'checkin'
  WHERE id = p_reserva_id;
END;
$$;

-- Migration: add_rpc_adjust_stock
CREATE OR REPLACE FUNCTION rpc_adjust_stock(
  p_club_id     uuid,
  p_producto_id uuid,
  p_tipo        text,
  p_cantidad    numeric,
  p_stock_actual numeric,
  p_motivo      text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stock_posterior numeric;
  v_cantidad_mov    numeric;
BEGIN
  -- Calculate new stock
  IF p_tipo IN ('salida', 'merma') THEN
    v_stock_posterior := GREATEST(0, p_stock_actual - p_cantidad);
  ELSIF p_tipo = 'ajuste' THEN
    v_stock_posterior := p_cantidad;
  ELSE -- entrada
    v_stock_posterior := p_stock_actual + p_cantidad;
  END IF;

  v_cantidad_mov := ABS(CASE WHEN p_tipo = 'ajuste' THEN p_cantidad - p_stock_actual ELSE p_cantidad END);

  -- Insert movement log
  INSERT INTO movimientos_stock (club_id, producto_id, tipo, cantidad,
                                  stock_anterior, stock_posterior, motivo)
  VALUES (p_club_id, p_producto_id, p_tipo, v_cantidad_mov,
          p_stock_actual, v_stock_posterior, p_motivo);

  -- Update product stock
  UPDATE productos SET stock_actual = v_stock_posterior WHERE id = p_producto_id;
END;
$$;
