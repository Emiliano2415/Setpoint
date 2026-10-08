-- ============================================================
-- Aislamiento por club según la pertenencia del empleado, no según el token
--
-- Las políticas leían el club de un dato propio del JWT
-- (app_metadata.club_id), que Supabase permitía grabar en el token. Neon Auth
-- emite tokens sin datos propios, así que con él esas políticas no dejarían
-- ver nada.
--
-- Ahora el club y el rol salen de la fila de `empleados` del usuario que hace
-- la petición (auth.uid()). Funciona igual en Supabase, en PostgreSQL local y
-- en Neon, y un cambio de club, de rol o una baja aplican al instante en vez
-- de esperar a que caduque el token.
--
-- Requiere que auth.uid() exista: en Neon, activar la Data API antes de
-- aplicar las migraciones.
-- ============================================================

-- SECURITY DEFINER: leen `empleados` saltándose RLS, porque la política de
-- esa misma tabla depende de estas funciones.
CREATE OR REPLACE FUNCTION public.current_club_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.club_id FROM empleados e WHERE e.auth_user_id = auth.uid() AND e.activo
$$;

CREATE OR REPLACE FUNCTION public.current_rol()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.rol::text FROM empleados e WHERE e.auth_user_id = auth.uid() AND e.activo
$$;

-- El usuario ya no tiene por qué vivir en auth.users (en Neon está en neon_auth.user)
ALTER TABLE empleados DROP CONSTRAINT IF EXISTS empleados_auth_user_id_fkey;

-- (SELECT ...) hace que el club se resuelva una vez por consulta, no por fila

-- Tablas con club_id
ALTER POLICY "club_isolation" ON clubes            USING (id      = (SELECT current_club_id()));
ALTER POLICY "club_isolation" ON empleados         USING (club_id = (SELECT current_club_id()));
ALTER POLICY "club_isolation" ON turnos            USING (club_id = (SELECT current_club_id()));
ALTER POLICY "club_isolation" ON cajas             USING (club_id = (SELECT current_club_id()));
ALTER POLICY "club_isolation" ON clientes          USING (club_id = (SELECT current_club_id()));
ALTER POLICY "club_isolation" ON pistas            USING (club_id = (SELECT current_club_id()));
ALTER POLICY "club_isolation" ON reservas          USING (club_id = (SELECT current_club_id()));
ALTER POLICY "club_isolation" ON productos         USING (club_id = (SELECT current_club_id()));
ALTER POLICY "club_isolation" ON categorias        USING (club_id = (SELECT current_club_id()));
ALTER POLICY "club_isolation" ON cuentas           USING (club_id = (SELECT current_club_id()));
ALTER POLICY "club_isolation" ON comandas          USING (club_id = (SELECT current_club_id()));
ALTER POLICY "club_isolation" ON movimientos_stock USING (club_id = (SELECT current_club_id()));
ALTER POLICY "club_isolation" ON descuentos_reglas USING (club_id = (SELECT current_club_id()));
ALTER POLICY "club_isolation" ON metricas_diarias  USING (club_id = (SELECT current_club_id()));
ALTER POLICY "club_isolation" ON cancelaciones     USING (club_id = (SELECT current_club_id()));
ALTER POLICY "club_isolation" ON audit_logs        USING (club_id = (SELECT current_club_id()));

-- Tablas hijas sin club_id: se aíslan a través de su tabla padre
ALTER POLICY "club_isolation" ON movimientos_caja USING (
  EXISTS (SELECT 1 FROM cajas WHERE cajas.id = movimientos_caja.caja_id AND cajas.club_id = (SELECT current_club_id()))
);
ALTER POLICY "club_isolation" ON bonos USING (
  EXISTS (SELECT 1 FROM clientes WHERE clientes.id = bonos.cliente_id AND clientes.club_id = (SELECT current_club_id()))
);
ALTER POLICY "club_isolation" ON cuenta_items USING (
  EXISTS (SELECT 1 FROM cuentas WHERE cuentas.id = cuenta_items.cuenta_id AND cuentas.club_id = (SELECT current_club_id()))
);
ALTER POLICY "club_isolation" ON pagos USING (
  EXISTS (SELECT 1 FROM cuentas WHERE cuentas.id = pagos.cuenta_id AND cuentas.club_id = (SELECT current_club_id()))
);
ALTER POLICY "club_isolation" ON comanda_items USING (
  EXISTS (SELECT 1 FROM comandas WHERE comandas.id = comanda_items.comanda_id AND comandas.club_id = (SELECT current_club_id()))
);

-- Permisos por rol
ALTER POLICY "Club members can read their permisos" ON permisos_rol
  USING (club_id = (SELECT current_club_id()));
ALTER POLICY "Propietario can manage permisos" ON permisos_rol
  USING (club_id = (SELECT current_club_id()) AND (SELECT current_rol()) = 'propietario');
