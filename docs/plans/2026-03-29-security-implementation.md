# Security Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Harden Setpoint's multi-tenant SaaS security by implementing Next.js route middleware, Supabase RLS policies for all tables, a role-validation helper, security header improvements, and a DB-level audit log.

**Architecture:** Six layers in order of criticality — (1) middleware protects all routes, (2) RLS isolates club data at DB level using JWT app_metadata, (3) role helper validates permissions on server actions, (4) security headers updated, (5) audit log via Postgres triggers, (6) IndexedDB risk documented.

**Tech Stack:** Next.js 16, @supabase/ssr, Supabase PostgREST, PostgreSQL RLS, Zustand

---

## Task 1: Next.js Middleware (S-001)

**Files:**
- Create: `apps/dashboard/middleware.ts`

**Step 1: Create middleware**

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // IMPORTANT: Do not run code between createServerClient and supabase.auth.getUser()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user && !request.nextUrl.pathname.startsWith('/login') && !request.nextUrl.pathname.startsWith('/auth')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

**Step 2: Verify dev server starts without errors**

Run: `cd apps/dashboard && npm run dev`
Expected: Server starts, no TypeScript errors in middleware.ts

**Step 3: Verify protection manually**

Open `http://localhost:3000/pos` in a fresh browser with no session.
Expected: Redirects to `/login`.
Then log in → expected: redirects to `/pos`.

**Step 4: Commit**

```bash
git add apps/dashboard/middleware.ts
git commit -m "feat(security): add Next.js middleware for route protection"
```

---

## Task 2: RLS Migration — All Tables (S-002)

**Files:**
- Create: `supabase/migrations/20260329000001_rls_policies.sql`

**Step 1: Create migration**

```sql
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

-- ============================================================
-- Helper function: extract club_id from JWT app_metadata
-- ============================================================

CREATE OR REPLACE FUNCTION auth.club_id()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'club_id')::uuid;
$$;

-- ============================================================
-- Policies for tables WITH club_id column
-- ============================================================

-- clubes: users can only see their own club
CREATE POLICY "club_isolation" ON clubes
  FOR ALL USING (id = auth.club_id());

-- empleados
CREATE POLICY "club_isolation" ON empleados
  FOR ALL USING (club_id = auth.club_id());

-- turnos
CREATE POLICY "club_isolation" ON turnos
  FOR ALL USING (club_id = auth.club_id());

-- cajas
CREATE POLICY "club_isolation" ON cajas
  FOR ALL USING (club_id = auth.club_id());

-- clientes
CREATE POLICY "club_isolation" ON clientes
  FOR ALL USING (club_id = auth.club_id());

-- pistas
CREATE POLICY "club_isolation" ON pistas
  FOR ALL USING (club_id = auth.club_id());

-- reservas
CREATE POLICY "club_isolation" ON reservas
  FOR ALL USING (club_id = auth.club_id());

-- productos
CREATE POLICY "club_isolation" ON productos
  FOR ALL USING (club_id = auth.club_id());

-- categorias
CREATE POLICY "club_isolation" ON categorias
  FOR ALL USING (club_id = auth.club_id());

-- cuentas
CREATE POLICY "club_isolation" ON cuentas
  FOR ALL USING (club_id = auth.club_id());

-- comandas
CREATE POLICY "club_isolation" ON comandas
  FOR ALL USING (club_id = auth.club_id());

-- movimientos_stock
CREATE POLICY "club_isolation" ON movimientos_stock
  FOR ALL USING (club_id = auth.club_id());

-- descuentos_reglas
CREATE POLICY "club_isolation" ON descuentos_reglas
  FOR ALL USING (club_id = auth.club_id());

-- metricas_diarias
CREATE POLICY "club_isolation" ON metricas_diarias
  FOR ALL USING (club_id = auth.club_id());

-- ============================================================
-- Policies for child tables WITHOUT club_id (join via parent)
-- ============================================================

-- movimientos_caja → cajas.club_id
CREATE POLICY "club_isolation" ON movimientos_caja
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM cajas
      WHERE cajas.id = movimientos_caja.caja_id
        AND cajas.club_id = auth.club_id()
    )
  );

-- bonos → clientes.club_id
CREATE POLICY "club_isolation" ON bonos
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM clientes
      WHERE clientes.id = bonos.cliente_id
        AND clientes.club_id = auth.club_id()
    )
  );

-- cuenta_items → cuentas.club_id
CREATE POLICY "club_isolation" ON cuenta_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM cuentas
      WHERE cuentas.id = cuenta_items.cuenta_id
        AND cuentas.club_id = auth.club_id()
    )
  );

-- pagos → cuentas.club_id
CREATE POLICY "club_isolation" ON pagos
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM cuentas
      WHERE cuentas.id = pagos.cuenta_id
        AND cuentas.club_id = auth.club_id()
    )
  );

-- comanda_items → comandas.club_id
CREATE POLICY "club_isolation" ON comanda_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM comandas
      WHERE comandas.id = comanda_items.comanda_id
        AND comandas.club_id = auth.club_id()
    )
  );
```

**Step 2: Apply migration via Supabase MCP**

Use MCP tool `apply_migration` with the SQL above.

**Step 3: Verify RLS is active**

Run in Supabase SQL editor (or MCP query):
```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```
Expected: `rowsecurity = true` for all tables above.

**Step 4: Verify existing app still works**

Log in and navigate to POS, Pistas, Caja. All data loads normally for the logged-in club.

**Step 5: Commit**

```bash
git add supabase/migrations/20260329000001_rls_policies.sql
git commit -m "feat(security): enable RLS on all tables with club isolation policies"
```

---

## Task 3: Role Validation Helper (S-005)

**Files:**
- Create: `apps/dashboard/src/lib/supabase/auth.ts`

**Step 1: Create helper**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'

export type UserRole = 'propietario' | 'admin' | 'cajero' | 'mesero' | 'cocina' | 'barra'

export class UnauthorizedError extends Error {
  status = 403
  constructor(message = 'No autorizado') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

/**
 * Validates that the current session exists and the user's rol
 * is in the allowedRoles list. Returns { userId, clubId, rol }
 * or throws UnauthorizedError.
 */
export async function requireRole(
  supabase: SupabaseClient,
  allowedRoles: UserRole[],
): Promise<{ userId: string; clubId: string; rol: UserRole }> {
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    throw new UnauthorizedError('Sesión no válida')
  }

  const clubId = user.app_metadata?.club_id as string | undefined
  if (!clubId) {
    throw new UnauthorizedError('Usuario sin club asignado')
  }

  const { data: empleado } = await supabase
    .from('empleados')
    .select('rol')
    .eq('auth_user_id', user.id)
    .single()

  const rol = empleado?.rol as UserRole | undefined
  if (!rol || !allowedRoles.includes(rol)) {
    throw new UnauthorizedError(`Rol '${rol}' no tiene permiso para esta operación`)
  }

  return { userId: user.id, clubId, rol }
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd apps/dashboard && npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add apps/dashboard/src/lib/supabase/auth.ts
git commit -m "feat(security): add requireRole server-side validation helper"
```

---

## Task 4: getClubId Helper (S-003)

**Files:**
- Create: `apps/dashboard/src/lib/supabase/club.ts`

**Step 1: Create helper**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Returns the club_id for the currently authenticated user,
 * reading from their JWT app_metadata.
 * With RLS active, this is for explicit filtering only — RLS
 * already guarantees data isolation at the DB level.
 */
export async function getClubId(supabase: SupabaseClient): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  return (user?.app_metadata?.club_id as string) ?? null
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd apps/dashboard && npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add apps/dashboard/src/lib/supabase/club.ts
git commit -m "feat(security): add getClubId helper reading from JWT app_metadata"
```

---

## Task 5: Security Headers Update (S-004)

**Files:**
- Modify: `apps/dashboard/next.config.ts`

**Step 1: Add missing header**

In `next.config.ts`, add `X-Permitted-Cross-Domain-Policies` to the `securityHeaders` array:

```typescript
{ key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
```

Add it after the existing `Permissions-Policy` entry.

Also add a comment documenting the known CSP relaxation:

```typescript
{
  key: 'Content-Security-Policy',
  // NOTE: unsafe-inline and unsafe-eval are required for Next.js/Turbopack in dev.
  // For production, tighten to use nonce-based CSP.
  value: [
    ...
  ].join('; '),
},
```

**Step 2: Verify dev server starts**

Run: `cd apps/dashboard && npm run dev`
Expected: Server starts without errors.

**Step 3: Commit**

```bash
git add apps/dashboard/next.config.ts
git commit -m "feat(security): add X-Permitted-Cross-Domain-Policies header, document CSP relaxation"
```

---

## Task 6: Audit Log (Advanced)

**Files:**
- Create: `supabase/migrations/20260329000002_audit_log.sql`

**Step 1: Create migration**

```sql
-- ============================================================
-- Audit log table
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     uuid NOT NULL,
  user_id     uuid,
  action      text NOT NULL,   -- INSERT | UPDATE | DELETE
  table_name  text NOT NULL,
  record_id   uuid,
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Index for fast club-scoped queries
CREATE INDEX audit_logs_club_id_idx ON audit_logs (club_id, created_at DESC);

-- RLS on audit_logs: club members can only read their own logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "club_isolation" ON audit_logs
  FOR SELECT USING (club_id = auth.club_id());

-- Service role can always insert (triggers run as service role)
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
  -- Extract club_id from the affected row
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

  RETURN NULL; -- AFTER trigger, return value is ignored
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
```

**Step 2: Apply migration via Supabase MCP**

Use MCP tool `apply_migration` with the SQL above.

**Step 3: Verify triggers exist**

Run in Supabase SQL editor:
```sql
SELECT trigger_name, event_object_table, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table;
```
Expected: 5 triggers listed (audit_cajas, audit_movimientos_caja, audit_cuentas, audit_empleados, audit_productos).

**Step 4: Verify audit log writes**

Perform any operation in the app (e.g., open a caja). Then query:
```sql
SELECT table_name, action, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 5;
```
Expected: Rows appear for the operation performed.

**Step 5: Commit**

```bash
git add supabase/migrations/20260329000002_audit_log.sql
git commit -m "feat(security): add audit_logs table with DB-level triggers on sensitive tables"
```

---

## Task 7: Document IndexedDB Risk (S-006)

**Files:**
- Modify: `apps/dashboard/src/lib/idb/` — find the main idb file and add a comment

**Step 1: Find the main IDB file**

Check `apps/dashboard/src/lib/idb/` for the primary IndexedDB helper.

**Step 2: Add security comment**

At the top of the file (after any `'use client'` directive), add:

```typescript
// SECURITY NOTE: IndexedDB data is stored unencrypted on the user's device.
// This is acceptable for POS terminals operated by trusted staff.
// If this app is ever deployed on shared/public devices, implement
// encryption using the Web Crypto API with a per-session derived key.
// See: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto
```

**Step 3: Commit**

```bash
git add apps/dashboard/src/lib/idb/
git commit -m "docs(security): document IndexedDB unencrypted storage risk and mitigation path"
```

---

## Task 8: Final Verification

**Step 1: Full TypeScript check**

```bash
cd apps/dashboard && npx tsc --noEmit
```
Expected: 0 errors.

**Step 2: Dev server smoke test**

```bash
cd apps/dashboard && npm run dev
```
- Navigate to `http://localhost:3000/pos` without login → should redirect to `/login`
- Log in → should load POS normally
- All modules (Pistas, Caja, POS, Clientes) should load data correctly

**Step 3: RLS verification query**

In Supabase dashboard SQL editor, as a test: temporarily disable the JWT context and query a table directly — it should return 0 rows (RLS blocking anonymous access).

**Step 4: Audit log verification**

After Step 2, query `audit_logs` in Supabase → should have entries from the session.

**Step 5: Final commit**

```bash
git add -A
git commit -m "chore: security hardening complete — middleware, RLS, audit log, helpers"
```
