-- ============================================================
-- Corrige rpc_get_permisos_rol
--
-- La versión de 20260415000002 declara RETURNS TABLE (accion, rol, permitido),
-- lo que crea variables PL/pgSQL con esos nombres. En
-- ON CONFLICT (club_id, rol, accion) PostgreSQL no sabe si "rol" y "accion"
-- son la columna o la variable y la función fallaba en cada llamada con
-- «la referencia a la columna "rol" es ambigua».
--
-- Único cambio: la directiva #variable_conflict use_column.
-- ============================================================

CREATE OR REPLACE FUNCTION rpc_get_permisos_rol(p_club_id uuid)
RETURNS TABLE (accion text, rol text, permitido boolean)
LANGUAGE plpgsql SECURITY DEFINER AS $$
#variable_conflict use_column
DECLARE
  defaults jsonb := '[
    {"accion":"descuento_manual","roles":["admin","propietario"]},
    {"accion":"cancelacion_sin_aprobacion","roles":["cajero","admin","propietario"]},
    {"accion":"cancelacion_post_cobro","roles":["cajero","admin","propietario"]},
    {"accion":"aprobar_cancelacion","roles":["admin","propietario"]},
    {"accion":"movimiento_caja","roles":["cajero","admin","propietario"]},
    {"accion":"ajuste_stock","roles":["admin","propietario"]},
    {"accion":"ver_reportes","roles":["admin","propietario"]},
    {"accion":"abrir_cerrar_turno","roles":["cajero","admin","propietario"]}
  ]';
  d jsonb;
  r text;
BEGIN
  FOR d IN SELECT jsonb_array_elements(defaults) LOOP
    FOR r IN SELECT jsonb_array_elements_text(d->'roles') LOOP
      INSERT INTO permisos_rol (club_id, rol, accion, permitido)
      VALUES (p_club_id, r, d->>'accion', true)
      ON CONFLICT (club_id, rol, accion) DO NOTHING;
    END LOOP;
  END LOOP;

  RETURN QUERY
    SELECT pr.accion, pr.rol, pr.permitido
    FROM permisos_rol pr
    WHERE pr.club_id = p_club_id;
END;
$$;
