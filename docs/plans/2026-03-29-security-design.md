# Security Hardening Design — Setpoint SaaS

**Approved:** 2026-03-29

---

## Context

Setpoint is a multi-tenant SaaS for padel clubs. Each club is an isolated tenant sharing the same Supabase database. Users authenticate with Supabase Auth (email/password). The system is in early development — no production data yet, but must be architected correctly before launch.

**Identified vulnerabilities:**
- S-001: No Next.js middleware — dashboard routes accessible without auth
- S-002: No RLS policies — any authenticated user can read/write any club's data
- S-003: CLUB_ID hardcoded in 26 files — prevents proper multi-tenancy
- S-004: Long-lived anon key with no expiration guard
- S-005: No server-side role validation in API routes
- S-006: IndexedDB data unencrypted (offline cache)
- S-007: PII in client components without server validation

**Approach chosen:** Remediación completa en una sola pasada — resolving all issues in criticality order.

---

## Architecture

### Layer 1 — Server Route Protection (S-001)

**File:** `apps/dashboard/middleware.ts`

Intercepts all requests. Uses `@supabase/ssr` `createServerClient` to validate the session from cookies on every request. No valid session → redirect to `/login`.

Matcher excludes: `/login`, `/auth/callback`, `/_next/*`, `/favicon.ico`.

The server.ts client already has the cookie-set comment "The middleware refreshes the session instead" — confirming the middleware was always intended to exist. We're implementing what was designed.

### Layer 2 — Data Isolation (S-002 + S-003)

**RLS Policies:** Enable RLS on all 11 tables and create `FOR ALL` policies reading `club_id` from `auth.jwt()->'app_metadata'->>'club_id'`. This uses `app_metadata` (not `user_metadata`) because `app_metadata` is server-only and cannot be modified by the user client-side.

Note: `AuthProvider.tsx` already reads `club_id` from `app_metadata` — confirming the JWT structure is correct.

**Migration file:** `supabase/migrations/20260329000001_rls_policies.sql`

Tables to protect: `pistas`, `reservas`, `productos`, `categorias`, `clientes`, `empleados`, `cajas`, `movimientos_caja`, `cuentas`, `cuenta_items`, `pagos`.

**CLUB_ID helper:** New file `apps/dashboard/src/lib/supabase/club.ts` exports `getClubId(supabase)` reading from the Zustand store (already populated by AuthProvider). The 26 hardcoded constants remain for now as a defense-in-depth redundancy — RLS makes them irrelevant to security, but removing them across 26 files is a separate refactor with risk and no security benefit given RLS is in place.

### Layer 3 — Role Validation (S-005)

**File:** `apps/dashboard/src/lib/supabase/auth.ts`

`requireRole(supabase, allowedRoles)` — validates session and checks `empleados.rol` for the current user. Returns `{ user, clubId, rol }` or throws a `403`. Called at the top of server actions and API routes.

### Layer 4 — Security Headers (S-004 / existing)

`next.config.ts` already has most security headers (X-Frame-Options, CSP, HSTS, Permissions-Policy). The existing CSP uses `unsafe-inline` and `unsafe-eval` for scripts — this is acceptable for a Next.js app with Turbopack in development, but should be tightened for production with nonces. For now, document the known relaxation and add `X-Permitted-Cross-Domain-Policies`.

### Layer 5 — Audit Log (Advanced)

**Migration:** `supabase/migrations/20260329000002_audit_log.sql`

New table `audit_logs` with Postgres trigger on sensitive tables (`cajas`, `movimientos_caja`, `cuentas`). Trigger fires `AFTER INSERT OR UPDATE OR DELETE`, writing `old_data`/`new_data` as JSONB. This runs at DB level — cannot be bypassed by application code.

### Layer 6 — IndexedDB / PII (S-006, S-007)

IndexedDB encryption is complex and has limited value for a POS system where the device is trusted (staff terminal). For now: document the risk, add a comment in the IDB code, and defer encryption to a future phase when a key management strategy is decided.

Server-side PII validation: ensure all server actions that write `clientes` or `empleados` validate that the `club_id` in the payload matches the JWT. This is covered by RLS automatically once S-002 is implemented.

---

## Migration Strategy

```
20260329000001_rls_policies.sql     — RLS on all tables
20260329000002_audit_log.sql        — audit_logs table + triggers
```

Migrations applied via `supabase db push` or MCP `apply_migration`.

---

## Files Touched

| File | Change |
|------|--------|
| `apps/dashboard/middleware.ts` | **Create** — route protection |
| `apps/dashboard/src/lib/supabase/auth.ts` | **Create** — requireRole helper |
| `apps/dashboard/src/lib/supabase/club.ts` | **Create** — getClubId helper |
| `apps/dashboard/next.config.ts` | Add `X-Permitted-Cross-Domain-Policies` header |
| `supabase/migrations/20260329000001_rls_policies.sql` | **Create** — RLS for all tables |
| `supabase/migrations/20260329000002_audit_log.sql` | **Create** — audit log table + triggers |

---

## What Does NOT Change

- `AuthProvider.tsx` — works correctly, no changes needed
- `server.ts` — already set up for middleware session refresh
- Query files (`pos.ts`, `pistas.ts`, etc.) — CLUB_ID constants kept as redundancy
- Login page — no changes
- `useAppStore.ts` — no changes
