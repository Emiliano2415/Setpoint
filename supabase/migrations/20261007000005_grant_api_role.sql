-- ============================================================
-- Privilegios del rol `authenticated`
--
-- Es el rol con el que la API (PostgREST / Neon Data API) ejecuta las
-- peticiones de un usuario con sesión. Sin estos privilegios la API responde
-- "permission denied" antes de que RLS llegue a evaluarse; con ellos, sigue
-- siendo RLS quien decide qué filas ve cada club.
--
-- Supabase los concede por defecto; Neon solo si se marca "Grant public
-- schema access" al activar la Data API desde la consola. Aquí quedan
-- declarados para no depender de ese paso manual.
--
-- `anonymous`/`anon` (peticiones sin sesión) no recibe nada: no ve ninguna tabla.
-- ============================================================

GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Tablas y secuencias que se creen en migraciones futuras
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
