-- ============================================================
-- Compatibilidad con Supabase para PostgreSQL "puro" (local, Aiven, etc.)
--
-- NO se aplica en Supabase: allí estos objetos ya existen.
--
-- Las migraciones de supabase/migrations dan por hecho los roles
-- anon/authenticated/service_role, el esquema auth (auth.users, auth.uid(),
-- auth.jwt()) y los privilegios por defecto de Supabase. Este archivo los
-- provee con la misma semántica: auth.jwt() y auth.uid() leen el ajuste de
-- sesión request.jwt.claims, así que las políticas RLS y las RPC funcionan
-- sin modificar una sola migración.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Roles de API (a nivel de clúster, por eso el IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
  -- Rol con el que se conecta PostgREST; cambia a anon/authenticated según el JWT
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD 'setpoint_local';
  END IF;
END $$;

GRANT anon, authenticated, service_role TO authenticator;

CREATE SCHEMA IF NOT EXISTS auth;

-- Subconjunto mínimo de auth.users de Supabase
CREATE TABLE IF NOT EXISTS auth.users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email              text UNIQUE,
  encrypted_password text,
  raw_app_meta_data  jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  last_sign_in_at    timestamptz
);

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )
$$;

-- Carga en la sesión los claims de un usuario, como haría Supabase tras validar
-- su JWT. Es lo que la capa de servidor debe ejecutar al inicio de cada
-- transacción (con p_local = true) una vez verificada la sesión.
CREATE OR REPLACE FUNCTION auth.login_as(p_email text, p_local boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_claims jsonb;
BEGIN
  SELECT jsonb_build_object(
           'sub', u.id,
           'email', u.email,
           'role', 'authenticated',
           'app_metadata', u.raw_app_meta_data
         )
  INTO v_claims
  FROM auth.users u
  WHERE u.email = p_email;

  IF v_claims IS NULL THEN
    RAISE EXCEPTION 'Usuario no encontrado: %', p_email;
  END IF;

  PERFORM set_config('request.jwt.claims', v_claims::text, p_local);
  RETURN v_claims;
END;
$$;

-- ============================================================
-- Login local: lo usa scripts/local-api.mjs (sustituto de Supabase Auth en
-- desarrollo). Solo service_role puede ejecutar estas funciones.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS local_auth;

CREATE OR REPLACE FUNCTION local_auth.get_user(p_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'id', u.id,
    'email', u.email,
    'app_metadata', u.raw_app_meta_data,
    'user_metadata', u.raw_user_meta_data,
    'created_at', u.created_at
  )
  FROM auth.users u
  WHERE u.id = p_id
$$;

CREATE OR REPLACE FUNCTION local_auth.verify_password(p_email text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
BEGIN
  UPDATE auth.users
  SET last_sign_in_at = now()
  WHERE email = lower(p_email)
    AND encrypted_password = public.crypt(p_password, encrypted_password)
  RETURNING id INTO v_id;

  RETURN local_auth.get_user(v_id);
END;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA local_auth FROM PUBLIC;
GRANT USAGE ON SCHEMA local_auth TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA local_auth TO service_role;

GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT SELECT ON auth.users TO service_role;

-- Como en Supabase: los roles de API tienen privilegios sobre public y es RLS
-- quien decide qué filas ve cada uno.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
