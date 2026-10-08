-- ============================================================
-- Una petición autenticada sin identidad falla en vez de devolver vacío
--
-- La Data API de Neon ejecuta a veces la primera consulta de una conexión
-- recién abierta con el rol ya cambiado a `authenticated` pero sin los datos
-- del token (request.jwt.claims vacío). Medido el 2026-10-07: la primera
-- consulta tras unos minutos sin uso, y hasta la mitad de una ráfaga de
-- peticiones simultáneas.
--
-- Con auth.uid() en NULL las políticas no encontraban club y la consulta
-- devolvía cero filas con un 200: listas vacías en pantalla sin ningún error.
-- Las RPC sí escribían, pero la auditoría quedaba sin usuario.
--
-- `authenticated` solo se usa con un token válido, así que ese estado nunca
-- es legítimo. Ahora se lanza el error SP001 y la transacción entera se
-- deshace; el cliente lo reconoce y repite la petición
-- (apps/dashboard/src/lib/supabase/client.ts).
-- ============================================================

-- auth.uid(), pero fallando cuando la petición debería traer usuario y no lo trae.
-- En conexiones directas (migraciones, psql) el rol es otro y devuelve NULL sin más.
CREATE OR REPLACE FUNCTION public.current_uid()
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL AND current_setting('role', true) = 'authenticated' THEN
    RAISE EXCEPTION 'La petición llegó sin identidad de usuario; hay que repetirla'
      USING ERRCODE = 'SP001';
  END IF;
  RETURN v_uid;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_club_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.club_id FROM empleados e WHERE e.auth_user_id = current_uid() AND e.activo
$$;

CREATE OR REPLACE FUNCTION public.current_rol()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.rol::text FROM empleados e WHERE e.auth_user_id = current_uid() AND e.activo
$$;

-- Misma función que en 20261007000001, con current_uid() en lugar de auth.uid():
-- una escritura sin identidad se repite en vez de auditarse sin usuario.
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
    public.current_uid(),
    TG_OP,
    TG_TABLE_NAME,
    (v_row ->> 'id')::uuid,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END
  );

  RETURN NULL;
END;
$$;
