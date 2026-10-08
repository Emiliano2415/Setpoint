-- ============================================================
-- Audit log table
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     uuid NOT NULL,
  user_id     uuid,
  action      text NOT NULL,
  table_name  text NOT NULL,
  record_id   uuid,
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_club_id_idx ON audit_logs (club_id, created_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "club_isolation" ON audit_logs
  FOR SELECT USING (club_id = ((auth.jwt() -> 'app_metadata' ->> 'club_id')::uuid));

CREATE POLICY "service_insert" ON audit_logs
  FOR INSERT WITH CHECK (true);

-- ============================================================
-- Trigger function
-- ============================================================

CREATE OR REPLACE FUNCTION audit_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_club_id uuid;
  v_record_id uuid;
  v_old_data jsonb;
  v_new_data jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_club_id := OLD.club_id;
    v_record_id := OLD.id;
    v_old_data := to_jsonb(OLD);
    v_new_data := NULL;
  ELSE
    v_club_id := NEW.club_id;
    v_record_id := NEW.id;
    v_old_data := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
    v_new_data := to_jsonb(NEW);
  END IF;

  INSERT INTO audit_logs (club_id, user_id, action, table_name, record_id, old_data, new_data)
  VALUES (
    v_club_id,
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    v_record_id,
    v_old_data,
    v_new_data
  );

  RETURN NULL;
END;
$$;

-- ============================================================
-- Attach triggers to sensitive tables
-- ============================================================

CREATE TRIGGER audit_cajas
  AFTER INSERT OR UPDATE OR DELETE ON cajas
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_movimientos_caja
  AFTER INSERT OR UPDATE OR DELETE ON movimientos_caja
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_cuentas
  AFTER INSERT OR UPDATE OR DELETE ON cuentas
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_empleados
  AFTER INSERT OR UPDATE OR DELETE ON empleados
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_productos
  AFTER INSERT OR UPDATE OR DELETE ON productos
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
