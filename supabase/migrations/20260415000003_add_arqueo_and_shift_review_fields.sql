-- Campo de shift review timestamp en turnos
ALTER TABLE turnos
  ADD COLUMN IF NOT EXISTS shift_review_at timestamptz;

-- Snapshot del arqueo en cajas (jsonb para flexibilidad)
ALTER TABLE cajas
  ADD COLUMN IF NOT EXISTS arqueo_snapshot jsonb;

-- RPC para obtener datos del shift review de un turno
CREATE OR REPLACE FUNCTION rpc_get_shift_review(
  p_caja_id uuid,
  p_empleado_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result jsonb;
  v_caja record;
BEGIN
  SELECT c.*, t.inicio, t.empleado_id
  INTO v_caja
  FROM cajas c
  JOIN turnos t ON t.id = c.turno_id
  WHERE c.id = p_caja_id;

  SELECT jsonb_build_object(
    'transacciones', (
      SELECT COUNT(*) FROM cuentas
      WHERE created_at >= v_caja.inicio
        AND club_id = v_caja.club_id
        AND estado = 'pagada'
    ),
    'ventas_total', (
      SELECT COALESCE(SUM(total), 0) FROM cuentas
      WHERE created_at >= v_caja.inicio
        AND club_id = v_caja.club_id
        AND estado = 'pagada'
    ),
    'cancelaciones_solicitadas', (
      SELECT COUNT(*) FROM cancelaciones
      WHERE created_at >= v_caja.inicio
        AND club_id = v_caja.club_id
        AND cancelado_por = p_empleado_id
    ),
    'cancelaciones_pendientes', (
      SELECT COUNT(*) FROM cancelaciones
      WHERE created_at >= v_caja.inicio
        AND club_id = v_caja.club_id
        AND estado = 'pendiente'
    ),
    'movimientos_caja', (
      SELECT jsonb_agg(jsonb_build_object(
        'categoria', mc.categoria,
        'concepto', mc.concepto,
        'monto', mc.monto,
        'tipo', mc.tipo
      ))
      FROM movimientos_caja mc
      WHERE mc.caja_id = p_caja_id
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- RPC para obtener arqueo agrupado por categoría
CREATE OR REPLACE FUNCTION rpc_get_arqueo_turno(p_caja_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'por_categoria', (
      SELECT jsonb_agg(jsonb_build_object(
        'categoria', categoria,
        'tipo', tipo,
        'total', SUM(monto)
      ))
      FROM movimientos_caja
      WHERE caja_id = p_caja_id
      GROUP BY categoria, tipo
    ),
    'total_ingresos_efectivo', (
      SELECT COALESCE(SUM(monto), 0)
      FROM movimientos_caja
      WHERE caja_id = p_caja_id
        AND tipo IN ('ingreso', 'fondo')
        AND categoria NOT IN ('propina')
    ),
    'total_egresos_efectivo', (
      SELECT COALESCE(SUM(monto), 0)
      FROM movimientos_caja
      WHERE caja_id = p_caja_id
        AND tipo IN ('egreso', 'retiro')
    ),
    'total_propinas', (
      SELECT COALESCE(SUM(monto), 0)
      FROM movimientos_caja
      WHERE caja_id = p_caja_id
        AND categoria = 'propina'
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;
