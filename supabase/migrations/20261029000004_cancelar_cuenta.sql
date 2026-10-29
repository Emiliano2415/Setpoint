-- ============================================================
-- Cancelar una venta completa desde el Historial
--
-- Hasta ahora solo se podía pedir la cancelación de un ítem pagado
-- (rpc_solicitar_cancelacion_post_cobro), uno por uno. Para devolver una
-- venta entera había que pedir cada ítem por separado, y cada uno se
-- reembolsaba por su subtotal sin IVA.
--
-- rpc_solicitar_cancelacion_cuenta pide, en una transacción, el reembolso de
-- lo que se cobró en la cuenta: una solicitud 'pendiente' por cada método de
-- pago (efectivo, crédito, débito…) con lo pagado por ese método. Así, al
-- aprobarlas con rpc_aprobar_cancelacion, la caja solo registra como egreso
-- la parte en efectivo. Las solicitudes de cuenta completa se distinguen por
-- tener cuenta_id y no tener cuenta_item_id ni reserva_id.
--
-- Reglas:
--   - la cuenta debe ser del club de quien llama y estar 'pagada';
--   - no se acepta si la cuenta ya tiene cancelaciones activas (pendientes,
--     aprobadas o reembolsadas), de cuenta completa o de alguno de sus ítems:
--     se devolvería dos veces lo mismo;
--   - las cortesías no generan reembolso;
--   - el club y el empleado salen de la sesión (current_club_id, current_uid),
--     no de parámetros, para no repetir el hueco de los rpc_* anteriores.
--
-- Igual que en la cancelación de un ítem pagado, aprobar no toca el
-- inventario ni la venta: el reembolso se resta en el Historial
-- (rpc_get_reembolsos_periodo) y, si fue en efectivo, sale de la caja.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_solicitar_cancelacion_cuenta(
  p_cuenta_id uuid,
  p_motivo    text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club     uuid := current_club_id();
  v_empleado uuid;
  v_cuenta   record;
  v_creadas  integer;
BEGIN
  IF v_club IS NULL THEN
    RAISE EXCEPTION 'Sin acceso a ningún club';
  END IF;

  IF coalesce(trim(p_motivo), '') = '' THEN
    RAISE EXCEPTION 'El motivo es obligatorio';
  END IF;

  SELECT e.id INTO v_empleado
  FROM empleados e
  WHERE e.auth_user_id = current_uid() AND e.activo AND e.club_id = v_club;

  -- FOR UPDATE: dos solicitudes simultáneas de la misma cuenta se ordenan y
  -- la segunda ya ve las cancelaciones de la primera
  SELECT c.id, c.estado INTO v_cuenta
  FROM cuentas c
  WHERE c.id = p_cuenta_id AND c.club_id = v_club
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venta no encontrada';
  END IF;

  IF v_cuenta.estado <> 'pagada' THEN
    RAISE EXCEPTION 'Solo se pueden cancelar ventas pagadas';
  END IF;

  IF EXISTS (
    SELECT 1 FROM cancelaciones x
    WHERE x.reserva_id IS NULL
      AND x.estado IN ('pendiente', 'aprobada', 'reembolsada')
      AND (
        x.cuenta_id = p_cuenta_id
        OR x.cuenta_item_id IN (SELECT ci.id FROM cuenta_items ci WHERE ci.cuenta_id = p_cuenta_id)
      )
  ) THEN
    RAISE EXCEPTION 'Esta venta ya tiene cancelaciones en curso o reembolsadas';
  END IF;

  INSERT INTO cancelaciones (
    club_id, cuenta_id, cuenta_item_id, cantidad, monto,
    motivo, tipo, estado, metodo_pago, cancelado_por
  )
  SELECT v_club, p_cuenta_id, NULL, 1, sum(p.monto),
         trim(p_motivo), 'post_cobro', 'pendiente', p.metodo::text, v_empleado
  FROM pagos p
  WHERE p.cuenta_id = p_cuenta_id
    AND p.metodo::text <> 'cortesia'
  GROUP BY p.metodo
  HAVING sum(p.monto) > 0;

  GET DIAGNOSTICS v_creadas = ROW_COUNT;

  IF v_creadas = 0 THEN
    RAISE EXCEPTION 'La venta no tiene pagos que reembolsar';
  END IF;

  RETURN v_creadas;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_solicitar_cancelacion_cuenta(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_solicitar_cancelacion_cuenta(uuid, text) TO authenticated;
