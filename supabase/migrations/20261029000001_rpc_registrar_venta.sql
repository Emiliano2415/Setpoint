-- ============================================================
-- Registrar una venta del POS en una sola transacción
--
-- createCuenta (apps/dashboard/src/lib/supabase/queries/pos.ts) guardaba la
-- venta desde el navegador en cuatro pasos sueltos: cuentas, cuenta_items,
-- pagos y movimientos_caja. Si uno fallaba a la mitad quedaba una venta
-- incompleta (una cuenta 'pagada' sin ítems o sin pagos), y el fallo de caja
-- solo se escribía en la consola. Además:
--   - el inventario nunca bajaba al vender;
--   - el número de ticket salía de Date.now() en el navegador y podía repetirse.
--
-- rpc_registrar_venta hace todo en el servidor y en una transacción: o entra
-- la venta completa (cuenta, ítems, pagos, caja y stock) o no entra nada.
--
-- Importes: se calculan igual que hacía createCuenta, para que coincidan con
-- lo que muestra la pantalla:
--   bruto = Σ precio_unitario × cantidad
--   base  = bruto − descuento     (cuentas.subtotal)
--   iva   = base × 0.16
--   total = base + iva
-- y por ítem: subtotal = precio × cantidad, iva = subtotal × 0.16,
-- total = subtotal + iva (sin repartir el descuento, como antes).
-- Los precios unitarios llegan del cliente (pueden venir de reglas de
-- descuento o de la pantalla); lo que se valida es que cada producto sea del
-- club y que los pagos cubran el total.
--
-- Stock: los productos con requiere_stock restan la cantidad vendida y dejan
-- un movimiento en movimientos_stock con tipo 'salida' (el mismo que usa
-- rpc_adjust_stock para las salidas; la tabla no tiene un tipo propio para
-- ventas) y motivo 'Venta POS #<ticket>'. La venta no se bloquea por falta de
-- stock: el stock puede quedar negativo, y así el faltante se ve en inventario
-- en vez de impedir cobrar algo que sí se entregó.
--
-- Caja: un movimiento 'ingreso' por pago, con concepto 'Venta POS #<ticket>',
-- el método del pago y categoría 'venta' (antes quedaba en NULL; el arqueo
-- trata NULL y 'venta' igual en los totales de efectivo).
-- ============================================================

-- Números de ticket. Empieza en 1000000 (7 cifras) para no coincidir nunca con
-- los tickets anteriores, que tenían 6 cifras (Date.now() en el navegador y el
-- seed). Es global, no por club: cada club ve números crecientes pero no
-- consecutivos. Una venta que falla consume su número (huecos normales de una
-- secuencia).
CREATE SEQUENCE IF NOT EXISTS public.cuentas_numero_ticket_seq
  AS bigint
  START WITH 1000000
  MINVALUE 1000000;

-- Solo se usa a través de rpc_registrar_venta (SECURITY DEFINER); los
-- privilegios por defecto de 20261007000005 se la darían a `authenticated`.
REVOKE ALL ON SEQUENCE public.cuentas_numero_ticket_seq FROM authenticated;

CREATE OR REPLACE FUNCTION public.rpc_registrar_venta(
  p_items      jsonb,               -- [{producto_id, precio_unitario, cantidad}]
  p_pagos      jsonb,               -- [{metodo, monto}]
  p_descuento  numeric DEFAULT 0,
  p_cliente_id uuid    DEFAULT NULL,
  p_caja_id    uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_iva_rate    constant numeric := 0.16;
  c_tolerancia  constant numeric := 0.05;
  v_club_id     uuid;
  v_empleado_id uuid;
  v_descuento   numeric := COALESCE(p_descuento, 0);
  v_bruto       numeric := 0;
  v_base        numeric;
  v_iva         numeric;
  v_total       numeric;
  v_pagado      numeric := 0;
  v_cuenta_id   uuid;
  v_ticket      text;
  v_concepto    text;
  v_row         record;
  v_stock_post  numeric;
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

  -- 3. Ítems: validación e importes
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La venta no tiene productos';
  END IF;

  FOR v_row IN
    SELECT t.ord,
           (t.e ->> 'producto_id')::uuid        AS producto_id,
           (t.e ->> 'precio_unitario')::numeric AS precio_unitario,
           (t.e ->> 'cantidad')::numeric        AS cantidad
    FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(e, ord)
  LOOP
    IF v_row.producto_id IS NULL THEN
      RAISE EXCEPTION 'El producto % de la venta no tiene producto_id', v_row.ord;
    END IF;
    IF v_row.cantidad IS NULL OR v_row.cantidad <= 0 OR v_row.cantidad <> trunc(v_row.cantidad) THEN
      RAISE EXCEPTION 'Cantidad no válida en el producto % de la venta: debe ser un entero mayor que 0', v_row.ord;
    END IF;
    IF v_row.precio_unitario IS NULL OR v_row.precio_unitario < 0 THEN
      RAISE EXCEPTION 'Precio no válido en el producto % de la venta', v_row.ord;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM productos WHERE id = v_row.producto_id AND club_id = v_club_id) THEN
      RAISE EXCEPTION 'El producto % de la venta no existe en este club', v_row.ord;
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
  v_ticket   := 'SP-' || nextval('public.cuentas_numero_ticket_seq');
  v_concepto := 'Venta POS #' || v_ticket;

  INSERT INTO cuentas (club_id, numero_ticket, cliente_id, subtotal, iva, total,
                       descuento_total, estado, caja_id)
  VALUES (v_club_id, v_ticket, p_cliente_id, v_base, v_iva, v_total,
          v_descuento, 'pagada', p_caja_id)
  RETURNING id INTO v_cuenta_id;

  INSERT INTO cuenta_items (cuenta_id, producto_id, precio_unitario, cantidad,
                            subtotal, iva, total)
  SELECT v_cuenta_id, i.producto_id, i.precio_unitario, i.cantidad::integer,
         i.precio_unitario * i.cantidad,
         i.precio_unitario * i.cantidad * c_iva_rate,
         i.precio_unitario * i.cantidad + i.precio_unitario * i.cantidad * c_iva_rate
  FROM (
    SELECT t.ord,
           (t.e ->> 'producto_id')::uuid        AS producto_id,
           (t.e ->> 'precio_unitario')::numeric AS precio_unitario,
           (t.e ->> 'cantidad')::numeric        AS cantidad
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
           t.e ->> 'metodo', 'venta'
    FROM jsonb_array_elements(p_pagos) WITH ORDINALITY AS t(e, ord)
    ORDER BY t.ord;
  END IF;

  -- 6. Stock: una salida por producto (sumando si aparece en varios ítems).
  --    Orden fijo por id para que dos ventas simultáneas bloqueen las filas de
  --    productos en el mismo orden y no se interbloqueen.
  FOR v_row IN
    SELECT s.producto_id, s.cantidad
    FROM (
      SELECT (e ->> 'producto_id')::uuid          AS producto_id,
             SUM((e ->> 'cantidad')::numeric)     AS cantidad
      FROM jsonb_array_elements(p_items) AS e
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

  -- 7. Resultado
  RETURN jsonb_build_object('id', v_cuenta_id, 'numero_ticket', v_ticket);
END;
$$;

-- Por defecto una función la puede ejecutar PUBLIC (incluido el rol anónimo
-- de la API); esta solo la necesita un usuario con sesión.
REVOKE ALL ON FUNCTION public.rpc_registrar_venta(jsonb, jsonb, numeric, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_registrar_venta(jsonb, jsonb, numeric, uuid, uuid) TO authenticated;
