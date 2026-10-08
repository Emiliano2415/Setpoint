-- Tabla de permisos configurables por rol y club
CREATE TABLE IF NOT EXISTS permisos_rol (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  club_id uuid NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  rol text NOT NULL,
  accion text NOT NULL,
  permitido boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, rol, accion)
);

ALTER TABLE permisos_rol ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club members can read their permisos"
  ON permisos_rol FOR SELECT
  USING (club_id = (auth.jwt() -> 'app_metadata' ->> 'club_id')::uuid);

CREATE POLICY "Propietario can manage permisos"
  ON permisos_rol FOR ALL
  USING (
    club_id = (auth.jwt() -> 'app_metadata' ->> 'club_id')::uuid
    AND (auth.jwt() -> 'app_metadata' ->> 'rol') = 'propietario'
  );

-- Función para obtener permisos de un club (crea defaults si no existen)
CREATE OR REPLACE FUNCTION rpc_get_permisos_rol(p_club_id uuid)
RETURNS TABLE (accion text, rol text, permitido boolean)
LANGUAGE plpgsql SECURITY DEFINER AS $$
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
