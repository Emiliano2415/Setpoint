-- ============================================================
-- Corrige audit_trigger_fn para tablas sin club_id
--
-- La versión de 20260329000002 lee NEW.club_id, pero movimientos_caja no tiene
-- esa columna (su club se deriva de cajas). Con el trigger audit_movimientos_caja
-- activo, cualquier INSERT en movimientos_caja fallaba con
-- «el registro "new" no tiene un campo "club_id"»: abrir turno, cobrar una venta
-- o registrar un check-in.
--
-- Ahora el club se resuelve desde la fila si existe la columna y, si no, desde
-- la caja. Si no se puede atribuir a un club, se omite la auditoría en lugar de
-- bloquear la escritura.
-- ============================================================

CREATE OR REPLACE FUNCTION audit_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_row     jsonb;
  v_club_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := to_jsonb(OLD);
  ELSE
    v_row := to_jsonb(NEW);
  END IF;

  v_club_id := (v_row ->> 'club_id')::uuid;

  IF v_club_id IS NULL AND v_row ? 'caja_id' THEN
    SELECT club_id INTO v_club_id FROM cajas WHERE id = (v_row ->> 'caja_id')::uuid;
  END IF;

  IF v_club_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO audit_logs (club_id, user_id, action, table_name, record_id, old_data, new_data)
  VALUES (
    v_club_id,
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    (v_row ->> 'id')::uuid,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END
  );

  RETURN NULL;
END;
$$;
