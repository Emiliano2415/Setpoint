-- ============================================================
-- Enable RLS on all public tables
-- ============================================================

ALTER TABLE clubes ENABLE ROW LEVEL SECURITY;
ALTER TABLE empleados ENABLE ROW LEVEL SECURITY;
ALTER TABLE turnos ENABLE ROW LEVEL SECURITY;
ALTER TABLE cajas ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_caja ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE bonos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pistas ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservas ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE cuentas ENABLE ROW LEVEL SECURITY;
ALTER TABLE cuenta_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE comandas ENABLE ROW LEVEL SECURITY;
ALTER TABLE comanda_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE descuentos_reglas ENABLE ROW LEVEL SECURITY;
ALTER TABLE metricas_diarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE cancelaciones ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Policies for tables WITH club_id column
-- Uses inline JWT expression (auth schema not writable via migrations)
-- ============================================================

CREATE POLICY "club_isolation" ON clubes
  FOR ALL USING (id = ((auth.jwt() -> 'app_metadata' ->> 'club_id')::uuid));

CREATE POLICY "club_isolation" ON empleados
  FOR ALL USING (club_id = ((auth.jwt() -> 'app_metadata' ->> 'club_id')::uuid));

CREATE POLICY "club_isolation" ON turnos
  FOR ALL USING (club_id = ((auth.jwt() -> 'app_metadata' ->> 'club_id')::uuid));

CREATE POLICY "club_isolation" ON cajas
  FOR ALL USING (club_id = ((auth.jwt() -> 'app_metadata' ->> 'club_id')::uuid));

CREATE POLICY "club_isolation" ON clientes
  FOR ALL USING (club_id = ((auth.jwt() -> 'app_metadata' ->> 'club_id')::uuid));

CREATE POLICY "club_isolation" ON pistas
  FOR ALL USING (club_id = ((auth.jwt() -> 'app_metadata' ->> 'club_id')::uuid));

CREATE POLICY "club_isolation" ON reservas
  FOR ALL USING (club_id = ((auth.jwt() -> 'app_metadata' ->> 'club_id')::uuid));

CREATE POLICY "club_isolation" ON productos
  FOR ALL USING (club_id = ((auth.jwt() -> 'app_metadata' ->> 'club_id')::uuid));

CREATE POLICY "club_isolation" ON categorias
  FOR ALL USING (club_id = ((auth.jwt() -> 'app_metadata' ->> 'club_id')::uuid));

CREATE POLICY "club_isolation" ON cuentas
  FOR ALL USING (club_id = ((auth.jwt() -> 'app_metadata' ->> 'club_id')::uuid));

CREATE POLICY "club_isolation" ON comandas
  FOR ALL USING (club_id = ((auth.jwt() -> 'app_metadata' ->> 'club_id')::uuid));

CREATE POLICY "club_isolation" ON movimientos_stock
  FOR ALL USING (club_id = ((auth.jwt() -> 'app_metadata' ->> 'club_id')::uuid));

CREATE POLICY "club_isolation" ON descuentos_reglas
  FOR ALL USING (club_id = ((auth.jwt() -> 'app_metadata' ->> 'club_id')::uuid));

CREATE POLICY "club_isolation" ON metricas_diarias
  FOR ALL USING (club_id = ((auth.jwt() -> 'app_metadata' ->> 'club_id')::uuid));

CREATE POLICY "club_isolation" ON cancelaciones
  FOR ALL USING (club_id = ((auth.jwt() -> 'app_metadata' ->> 'club_id')::uuid));

-- ============================================================
-- Policies for child tables WITHOUT club_id (join via parent)
-- ============================================================

CREATE POLICY "club_isolation" ON movimientos_caja
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM cajas
      WHERE cajas.id = movimientos_caja.caja_id
        AND cajas.club_id = ((auth.jwt() -> 'app_metadata' ->> 'club_id')::uuid)
    )
  );

CREATE POLICY "club_isolation" ON bonos
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM clientes
      WHERE clientes.id = bonos.cliente_id
        AND clientes.club_id = ((auth.jwt() -> 'app_metadata' ->> 'club_id')::uuid)
    )
  );

CREATE POLICY "club_isolation" ON cuenta_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM cuentas
      WHERE cuentas.id = cuenta_items.cuenta_id
        AND cuentas.club_id = ((auth.jwt() -> 'app_metadata' ->> 'club_id')::uuid)
    )
  );

CREATE POLICY "club_isolation" ON pagos
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM cuentas
      WHERE cuentas.id = pagos.cuenta_id
        AND cuentas.club_id = ((auth.jwt() -> 'app_metadata' ->> 'club_id')::uuid)
    )
  );

CREATE POLICY "club_isolation" ON comanda_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM comandas
      WHERE comandas.id = comanda_items.comanda_id
        AND comandas.club_id = ((auth.jwt() -> 'app_metadata' ->> 'club_id')::uuid)
    )
  );
