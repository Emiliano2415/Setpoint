-- ============================================================
-- Cobro de canchas (reservas de pistas) con rpc_registrar_venta
--
-- Hasta ahora el cobro de una cancha nunca quedaba bien registrado:
--   - CheckInPaymentModal (pago dividido y cuenta dividida) mandaba la línea
--     de la cancha con producto_id = id de la RESERVA, y CourtAccountModal con
--     producto_id = id de la PISTA y las horas fraccionarias como cantidad.
--     cuenta_items.producto_id referencia a productos y cantidad es entera:
--     antes eso dejaba cuentas 'pagadas' sin ítems; con rpc_registrar_venta
--     (20261029000001) el cobro se rechaza entero.
--   - El pago simple del check-in (rpc_check_in_with_payment) solo escribe un
--     movimiento de caja: no hay cuenta, ni pago, ni ticket.
--   - Ninguna cuenta quedaba ligada a su reserva (cuentas.reserva_id existe
--     desde el esquema base pero nadie la llenaba), y el cambio de estado de
--     la reserva iba en una llamada aparte, fuera de la transacción del cobro.
--
-- Esta migración:
--   1. cuenta_items admite líneas sin producto: columna `concepto` (texto de la
--      línea, p. ej. 'Pista 2 · 1.5 h') y un CHECK que exige producto o concepto.
--      producto_id ya era nullable en la base; se deja explícito por si acaso.
--   2. rpc_registrar_venta acepta esas líneas (no descuentan stock) y dos
--      parámetros nuevos:
--        p_reserva_id      la reserva que se cobra: debe ser del club y no estar
--                          cancelada ni marcada como no-show. Se guarda en
--                          cuentas.reserva_id y, si la venta no trae cliente,
--                          la cuenta toma el cliente de la reserva.
--        p_reserva_estado  'checkin' o 'finalizada': el estado al que pasa la
--                          reserva, en la misma transacción que el cobro (hoy
--                          el check-in la pasa a 'checkin' y el cobro al final
--                          de la sesión a 'finalizada').
--      Con reserva, los movimientos de caja llevan concepto
--      'Cobro de cancha #<ticket>' y categoría 'cancha' (la que ya usa el seed
--      para las rentas); sin reserva todo sigue igual ('Venta POS #', 'venta').
--      Una cuenta de cancha con consumos del bar queda entera como 'cancha' en
--      el arqueo: un movimiento por pago, sin repartir por línea.
--   Todo lo demás de la función se conserva (importes, IVA, validación de
--   pagos, caja, stock, número de ticket).
--
-- IVA: la función suma 16 % de IVA a cada línea. El precio de una cancha es lo
-- que paga el cliente (rpc_check_in_with_payment cobraba reserva.precio tal
-- cual y la pantalla muestra ese importe como total), así que el cliente manda
-- la línea de cancha con precio_unitario = importe / 1.16 y el total de la
-- cuenta sale igual al importe (lineaAlquilerCancha en queries/pos.ts).
-- ============================================================

-- 1. Líneas sin producto
ALTER TABLE public.cuenta_items
  ADD COLUMN IF NOT EXISTS concepto text;

ALTER TABLE public.cuenta_items
  ALTER COLUMN producto_id DROP NOT NULL;

ALTER TABLE public.cuenta_items
  DROP CONSTRAINT IF EXISTS cuenta_items_producto_o_concepto;
ALTER TABLE public.cuenta_items
  ADD CONSTRAINT cuenta_items_producto_o_concepto
  CHECK (producto_id IS NOT NULL OR nullif(btrim(concepto), '') IS NOT NULL);

COMMENT ON COLUMN public.cuenta_items.concepto IS
  'Descripción de la línea. Obligatoria cuando no hay producto (p. ej. alquiler de cancha).';

-- 2. rpc_registrar_venta con reserva y líneas sin producto.
--    Cambia la firma: se borra la anterior para que no queden dos sobrecargas
--    (la Data API no sabría cuál elegir con argumentos por nombre).
DROP FUNCTION IF EXISTS public.rpc_registrar_venta(jsonb, jsonb, numeric, uuid, uuid);

CREATE OR REPLACE FUNCTION public.rpc_registrar_venta(
  p_items          jsonb,               -- [{producto_id?, concepto?, precio_unitario, cantidad}]
  p_pagos          jsonb,               -- [{metodo, monto}]
  p_descuento      numeric        DEFAULT 0,
  p_cliente_id     uuid           DEFAULT NULL,
  p_caja_id        uuid           DEFAULT NULL,
  p_reserva_id     uuid           DEFAULT NULL,
  p_reserva_estado reserva_estado DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_iva_rate     constant numeric := 0.16;
  c_tolerancia   constant numeric := 0.05;
  v_club_id      uuid;
  v_empleado_id  uuid;
  v_cliente_id   uuid := p_cliente_id;
  v_descuento    numeric := COALESCE(p_descuento, 0);
  v_bruto        numeric := 0;
  v_base         numeric;
  v_iva          numeric;
  v_total        numeric;
  v_pagado       numeric := 0;
  v_cuenta_id    uuid;
  v_ticket       text;
  v_concepto     text;
  v_categoria    movimiento_categoria;
  v_reserva      record;
  v_row          record;
  v_stock_post   numeric;
BEGIN
  -- 1. Club del usuario (current_club_id lanza SP001 si la petición llegó sin
  --    identidad: el cliente la repite y aquí aún no se ha escrito nada)
  v_club_id := current_club_id();
  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'El usuario no pertenece a ningún club activo: no se puede registrar la venta';
  END IF;

  SELECT e.id INTO v_empleado_id
  FROM empleados e
  WHERE e.auth_user_id = current_uid() AND e.activo;

  -- 2. Caja: del club y abierta. FOR SHARE impide que se cierre mientras
  --    se registra la venta.
  IF p_caja_id IS NOT NULL THEN
    PERFORM 1 FROM cajas
    WHERE id = p_caja_id AND club_id = v_club_id AND estado = 'abierta'
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La caja indicada no existe en este club o no está abierta';
    END IF;
  END IF;

  IF p_cliente_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM clientes WHERE id = p_cliente_id AND club_id = v_club_id) THEN
    RAISE EXCEPTION 'El cliente indicado no pertenece a este club';
  END IF;

  -- Reserva: del club y cobrable. FOR UPDATE: dos cobros de la misma reserva
  -- no se cruzan, y el cambio de estado va en esta misma transacción.
  IF p_reserva_estado IS NOT NULL THEN
    IF p_reserva_id IS NULL THEN
      RAISE EXCEPTION 'Para cambiar el estado de una reserva hay que indicar la reserva';
    END IF;
    IF p_reserva_estado NOT IN ('checkin', 'finalizada') THEN
      RAISE EXCEPTION 'Al cobrar, la reserva solo puede pasar a checkin o finalizada (se pidió %)', p_reserva_estado;
    END IF;
  END IF;

  IF p_reserva_id IS NOT NULL THEN
    SELECT r.id, r.estado, r.cliente_id INTO v_reserva
    FROM reservas r
    WHERE r.id = p_reserva_id AND r.club_id = v_club_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La reserva indicada no existe en este club';
    END IF;
    IF v_reserva.estado IN ('cancelada', 'noshow') THEN
      RAISE EXCEPTION 'No se puede cobrar una reserva en estado %', v_reserva.estado;
    END IF;
    v_cliente_id := COALESCE(p_cliente_id, v_reserva.cliente_id);
  END IF;

  -- 3. Ítems: validación e importes. Cada línea lleva un producto del club o,
  --    si no, un concepto (alquiler de cancha, extensión de tiempo…).
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La venta no tiene productos';
  END IF;

  FOR v_row IN
    SELECT t.ord,
           (t.e ->> 'producto_id')::uuid             AS producto_id,
           nullif(btrim(t.e ->> 'concepto'), '')     AS concepto,
           (t.e ->> 'precio_unitario')::numeric      AS precio_unitario,
           (t.e ->> 'cantidad')::numeric             AS cantidad
    FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(e, ord)
  LOOP
    IF v_row.producto_id IS NULL AND v_row.concepto IS NULL THEN
      RAISE EXCEPTION 'La línea % de la venta no tiene producto ni concepto', v_row.ord;
    END IF;
    IF v_row.cantidad IS NULL OR v_row.cantidad <= 0 OR v_row.cantidad <> trunc(v_row.cantidad) THEN
      RAISE EXCEPTION 'Cantidad no válida en la línea % de la venta: debe ser un entero mayor que 0', v_row.ord;
    END IF;
    IF v_row.precio_unitario IS NULL OR v_row.precio_unitario < 0 THEN
      RAISE EXCEPTION 'Precio no válido en la línea % de la venta', v_row.ord;
    END IF;
    IF v_row.producto_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM productos WHERE id = v_row.producto_id AND club_id = v_club_id) THEN
      RAISE EXCEPTION 'El producto de la línea % de la venta no existe en este club', v_row.ord;
    END IF;
    v_bruto := v_bruto + v_row.precio_unitario * v_row.cantidad;
  END LOOP;

  IF v_descuento < 0 THEN
    RAISE EXCEPTION 'El descuento no puede ser negativo';
  END IF;
  IF v_descuento > v_bruto THEN
    RAISE EXCEPTION 'El descuento (%) es mayor que el subtotal de la venta (%)',
      round(v_descuento, 2), round(v_bruto, 2);
  END IF;

  v_base  := v_bruto - v_descuento;
  v_iva   := v_base * c_iva_rate;
  v_total := v_base + v_iva;

  -- 4. Pagos: método válido, monto no negativo, y que sumen el total
  IF p_pagos IS NULL OR jsonb_typeof(p_pagos) <> 'array' OR jsonb_array_length(p_pagos) = 0 THEN
    RAISE EXCEPTION 'La venta no tiene pagos';
  END IF;

  FOR v_row IN
    SELECT t.ord,
           t.e ->> 'metodo'            AS metodo,
           (t.e ->> 'monto')::numeric  AS monto
    FROM jsonb_array_elements(p_pagos) WITH ORDINALITY AS t(e, ord)
  LOOP
    IF v_row.metodo IS NULL
       OR NOT v_row.metodo = ANY (enum_range(NULL::metodo_pago)::text[]) THEN
      RAISE EXCEPTION 'Método de pago no válido en el pago %: %', v_row.ord, COALESCE(v_row.metodo, '(vacío)');
    END IF;
    IF v_row.monto IS NULL OR v_row.monto < 0 THEN
      RAISE EXCEPTION 'Monto no válido en el pago %', v_row.ord;
    END IF;
    v_pagado := v_pagado + v_row.monto;
  END LOOP;

  IF abs(v_pagado - v_total) > c_tolerancia THEN
    RAISE EXCEPTION 'Los pagos suman % y el total de la venta es %: deben coincidir',
      round(v_pagado, 2), round(v_total, 2);
  END IF;

  -- 5. Cuenta, ítems, pagos y caja
  v_ticket := 'SP-' || nextval('public.cuentas_numero_ticket_seq');
  IF p_reserva_id IS NOT NULL THEN
    v_concepto  := 'Cobro de cancha #' || v_ticket;
    v_categoria := 'cancha';
  ELSE
    v_concepto  := 'Venta POS #' || v_ticket;
    v_categoria := 'venta';
  END IF;

  INSERT INTO cuentas (club_id, numero_ticket, cliente_id, reserva_id, subtotal, iva, total,
                       descuento_total, estado, caja_id)
  VALUES (v_club_id, v_ticket, v_cliente_id, p_reserva_id, v_base, v_iva, v_total,
          v_descuento, 'pagada', p_caja_id)
  RETURNING id INTO v_cuenta_id;

  INSERT INTO cuenta_items (cuenta_id, producto_id, concepto, precio_unitario, cantidad,
                            subtotal, iva, total)
  SELECT v_cuenta_id, i.producto_id, i.concepto, i.precio_unitario, i.cantidad::integer,
         i.precio_unitario * i.cantidad,
         i.precio_unitario * i.cantidad * c_iva_rate,
         i.precio_unitario * i.cantidad + i.precio_unitario * i.cantidad * c_iva_rate
  FROM (
    SELECT t.ord,
           (t.e ->> 'producto_id')::uuid             AS producto_id,
           nullif(btrim(t.e ->> 'concepto'), '')     AS concepto,
           (t.e ->> 'precio_unitario')::numeric      AS precio_unitario,
           (t.e ->> 'cantidad')::numeric             AS cantidad
    FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(e, ord)
  ) i
  ORDER BY i.ord;

  INSERT INTO pagos (cuenta_id, metodo, monto)
  SELECT v_cuenta_id, (t.e ->> 'metodo')::metodo_pago, (t.e ->> 'monto')::numeric
  FROM jsonb_array_elements(p_pagos) WITH ORDINALITY AS t(e, ord)
  ORDER BY t.ord;

  IF p_caja_id IS NOT NULL THEN
    INSERT INTO movimientos_caja (caja_id, tipo, concepto, monto, metodo, categoria)
    SELECT p_caja_id, 'ingreso', v_concepto, (t.e ->> 'monto')::numeric,
           t.e ->> 'metodo', v_categoria
    FROM jsonb_array_elements(p_pagos) WITH ORDINALITY AS t(e, ord)
    ORDER BY t.ord;
  END IF;

  -- 6. Stock: una salida por producto (sumando si aparece en varios ítems).
  --    Las líneas sin producto no tocan inventario.
  --    Orden fijo por id para que dos ventas simultáneas bloqueen las filas de
  --    productos en el mismo orden y no se interbloqueen.
  FOR v_row IN
    SELECT s.producto_id, s.cantidad
    FROM (
      SELECT (e ->> 'producto_id')::uuid          AS producto_id,
             SUM((e ->> 'cantidad')::numeric)     AS cantidad
      FROM jsonb_array_elements(p_items) AS e
      WHERE (e ->> 'producto_id') IS NOT NULL
      GROUP BY 1
    ) s
    JOIN productos p ON p.id = s.producto_id AND p.club_id = v_club_id AND p.requiere_stock
    ORDER BY s.producto_id
  LOOP
    UPDATE productos
    SET stock_actual = stock_actual - v_row.cantidad
    WHERE id = v_row.producto_id
    RETURNING stock_actual INTO v_stock_post;

    INSERT INTO movimientos_stock (club_id, producto_id, tipo, cantidad,
                                   stock_anterior, stock_posterior, motivo, empleado_id)
    VALUES (v_club_id, v_row.producto_id, 'salida', v_row.cantidad,
            v_stock_post + v_row.cantidad, v_stock_post, v_concepto, v_empleado_id);
  END LOOP;

  -- 7. Reserva: el estado cambia junto con el cobro
  IF p_reserva_estado IS NOT NULL THEN
    UPDATE reservas SET estado = p_reserva_estado WHERE id = p_reserva_id;
  END IF;

  -- 8. Resultado
  RETURN jsonb_build_object('id', v_cuenta_id, 'numero_ticket', v_ticket);
END;
$$;

-- Por defecto una función la puede ejecutar PUBLIC (incluido el rol anónimo
-- de la API); esta solo la necesita un usuario con sesión.
REVOKE ALL ON FUNCTION public.rpc_registrar_venta(jsonb, jsonb, numeric, uuid, uuid, uuid, reserva_estado) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_registrar_venta(jsonb, jsonb, numeric, uuid, uuid, uuid, reserva_estado) TO authenticated;
