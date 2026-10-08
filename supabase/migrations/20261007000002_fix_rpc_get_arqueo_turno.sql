-- ============================================================
-- Corrige rpc_get_arqueo_turno
--
-- 1. La versión de 20260415000003 calcula 'por_categoria' con
--    jsonb_agg(... SUM(monto) ...) y GROUP BY en el mismo nivel. PostgreSQL lo
--    rechaza al ejecutar («no se pueden anidar llamadas a funciones de
--    agregación»), así que la función fallaba siempre. Se agrupa en una
--    subconsulta y se agrega el resultado.
--
-- 2. 'total_ingresos_efectivo' filtraba con categoria NOT IN ('propina'), que
--    descarta las filas con categoria NULL. Esas son la mayoría: rpc_open_caja,
--    rpc_check_in_with_payment, rpc_aprobar_cancelacion y createCuenta() no
--    informan categoría. Se usa IS DISTINCT FROM para que cuenten.
-- ============================================================

CREATE OR REPLACE FUNCTION rpc_get_arqueo_turno(p_caja_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'por_categoria', (
      SELECT jsonb_agg(jsonb_build_object(
        'categoria', t.categoria,
        'tipo', t.tipo,
        'total', t.total
      ))
      FROM (
        SELECT categoria, tipo, SUM(monto) AS total
        FROM movimientos_caja
        WHERE caja_id = p_caja_id
        GROUP BY categoria, tipo
      ) t
    ),
    'total_ingresos_efectivo', (
      SELECT COALESCE(SUM(monto), 0)
      FROM movimientos_caja
      WHERE caja_id = p_caja_id
        AND tipo IN ('ingreso', 'fondo')
        AND categoria IS DISTINCT FROM 'propina'
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
