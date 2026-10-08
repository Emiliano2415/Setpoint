# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Setpoint PMS** — a Padel Club Management System built as a Turbo monorepo. `apps/dashboard` is the system itself (POS, court reservations, cash register, inventory, client management); `apps/landing` is the public marketing page and the entry point to the system. Both are Next.js 16 apps. All UI is in Spanish (es-MX).

The backend is **Neon**: PostgreSQL, Neon Auth and the Neon Data API. There is no application server: the browser talks to Neon directly and RLS enforces access.

## Commands

All commands run from the repo root unless noted.

```bash
# Development
npm run dev             # Start all apps in parallel (dashboard on :3001, landing on :3000)

# From one app only
cd apps/dashboard && npm run dev    # http://localhost:3001
cd apps/landing && npm run dev      # http://localhost:3000 (its /login forwards to :3001)

# Build & validation
npm run build           # Build all apps via Turbo
npm run lint            # ESLint across all apps
npm run typecheck       # tsc --noEmit across all apps

# Database (Neon) — connection read from the root .env.local
node scripts/migrate.mjs status     # Which migrations are applied / pending
node scripts/migrate.mjs up         # Apply pending migrations, in order
node scripts/seed-neon.mjs          # Demo users in Neon Auth + supabase/seed.sql (fails if already seeded)
npx neon env pull                   # Regenerate the root .env.local
```

Demo logins (password `demo1234`): `propietario@`, `admin@`, `cajero1@`, `cajero2@`, `mesero@`, `cocina@`, `barra@`, `emiliano@` `setpoint.test`, and `propietario@clubnorte.test` (second club, to check tenant isolation). They live in the Neon `production` branch together with invented demo data — replace them before loading real data.

No test framework is configured.

## Architecture

### Monorepo Layout

```
apps/dashboard/     # The system — Next.js 16 App Router
apps/landing/       # Marketing landing page and public entry point
packages/types/     # Shared TypeScript types
packages/ui/        # Shared UI primitives
supabase/           # DB migrations and seed (folder name kept from the Supabase days)
scripts/            # migrate.mjs, seed-neon.mjs; db.mjs and local-api.mjs for the optional local database
db/local/           # Supabase/Neon compatibility shim for plain PostgreSQL (local only)
neon.ts             # Neon project config (Auth + Data API)
```

### Dashboard App Structure (`apps/dashboard/src/`)

- **`app/`** — Next.js App Router with two layout groups:
  - `(auth)/` — unauthenticated routes: `/login`, `/forgot-password`
  - `(dashboard)/` — protected routes: `/pos`, `/pistas`, `/comandas`, `/clientes`, `/caja`, `/empleados`, `/inventario`, `/descuentos`, `/reportes`, `/historial`, `/cancelaciones`, `/configuracion`
  - Root `/` redirects to `/pos`
- **`components/modules/{feature}/`** — all feature UI lives here, organized by module
- **`components/layout/`** — Sidebar and TopBar
- **`components/ui/`** — reusable UI primitives
- **`components/providers/AuthProvider.tsx`** — session check and route guard (see Security)
- **`store/useAppStore.ts`** — Zustand store (persisted to localStorage as `setpoint-app-store`): user, clubId, sidebarOpen
- **`lib/supabase/`** — `client.ts` builds the single Neon client (`@neondatabase/neon-js` with the Supabase-compatible adapter, hence the folder name and the `supabase` variable everywhere); `requireRole()` and `getClubId()` helpers; per-module query files in `queries/`
- **`lib/poll.ts`** — `poll(fn, ms)`: periodic refresh while the tab is visible. Replaces Realtime subscriptions
- **`lib/idb/posStore.ts`** — IndexedDB for offline POS (pending tickets, product cache)
- **`lib/format.ts`** — `fmtMXN()` currency formatter; `localDayStart()` / `localDayEnd()` day boundaries in club time (UTC-6)

### Data Flow

1. **Auth**: Neon Auth (managed Better Auth) → `AuthProvider` reads the user's `empleados` row (`club_id`, `rol`) and syncs it to Zustand
2. **Multi-tenancy**: All DB queries are scoped to the club via RLS policies that call `current_club_id()`, which resolves the club from the caller's `empleados` row (`auth.uid()`). The JWT carries no club data — Neon Auth tokens cannot carry custom claims
3. **Client queries**: Modules call the Neon Data API (PostgREST-compatible) directly from the browser with `.from()` / `.rpc()`; RLS enforces all access control
4. **Refresh**: Neon has no Realtime. Screens that must stay current use `poll()`
5. **Offline POS**: Tickets are persisted to IndexedDB via `posStore.ts` when offline

### Database (Neon)

- Neon project `setpoint`, branch `production`, PostgreSQL 18. Neon Auth users live in `neon_auth.user`; `empleados.auth_user_id` links to them (no foreign key)
- **RLS on all tables** using `current_club_id()` / `current_rol()` (membership in `empleados`, inactive employees lose access) — never bypass RLS
- The Data API runs queries as the `authenticated` role; new tables need grants for it (see `20261007000005_grant_api_role.sql`) and a policy
- The Data API sometimes runs the first query of a new connection without the caller's identity. `current_uid()` raises `SP001` in that state and the client's fetch retries it (`lib/supabase/client.ts`). In policies, functions and triggers use `current_uid()` / `current_club_id()` / `current_rol()`, never `auth.uid()` directly, or the query will silently return nothing
- **Audit logs**: `audit_logs` table with DB triggers on sensitive tables
- **Key enums**: `user_rol`, `cliente_categoria`, `reserva_estado`, `cuenta_estado`, `item_estado`, `comanda_estado`, `metodo_pago`, `caja_estado`, `movimiento_tipo`, `cancelacion_tipo`
- **User roles**: `propietario`, `admin`, `cajero`, `mesero`, `cocina`, `barra`
- Migrations in `supabase/migrations/` — apply with `node scripts/migrate.mjs up`. After a schema change run `npx neon data-api refresh-schema` so the Data API sees it
- The original Supabase project no longer exists. `20260318000000_baseline_schema.sql` is a reconstruction of its schema from the query code; `20260405…` and `20260406…` were recovered from `docs/plans/`. Save every schema change as a migration file — SQL applied directly to the database is how the original schema was lost
- `supabase/seed.sql` holds invented demo data (dates relative to the day it runs). Users cannot be created by SQL on Neon, so run it through `scripts/seed-neon.mjs`
- Timestamps are stored in UTC and the club works in UTC-6. Never build a day filter with `T00:00:00.000Z`: use `localDayStart()` / `localDayEnd()`
- Neon's agent skills are in `.agents/skills/`. Prefer the Neon CLI (`npx neon`) over the MCP server
- Optional local PostgreSQL (`npm run db:start`, `db:reset`, `db:psql`, `npm run api`): its own cluster on :5433 plus a PostgREST gateway on :54321. The dashboard no longer points at it; it is only useful to try migrations offline

### Deployment

- GitHub: `Emiliano2415/Setpoint` (private), default branch `master`
- Vercel project **`landing`** (root directory `apps/landing`) — the public site, https://landing-one-swart.vercel.app
- Vercel project **`setpoint-pms`** (root directory `apps/dashboard`) — the system, https://setpoint-pms.vercel.app. Env vars: `NEXT_PUBLIC_NEON_AUTH_URL`, `NEXT_PUBLIC_NEON_DATA_API_URL` (public URLs, not secrets)
- **One domain**: `apps/landing/next.config.ts` rewrites the system's routes to the `setpoint-pms` deployment, so the landing's "Iniciar Sesión" button opens `/login` on the same site. The dashboard serves its JS/CSS under `assetPrefix: '/sistema-static'` so both apps' assets do not collide
- When adding a dashboard route, add it to `RUTAS_SISTEMA` in `apps/landing/next.config.ts` or it will 404 on the public domain
- Every browser origin that signs in must be a Neon Auth trusted domain: `npx neon neon-auth domain add https://…`

### Security

- No Next.js middleware: the session lives on the Neon Auth domain, so the Next server cannot read it. `AuthProvider` checks the session on every route change and redirects unauthenticated users to `/login`. This guards navigation only — the data is protected by RLS
- CSP headers configured in each app's `next.config.ts`. The dashboard derives `connect-src` from the `NEXT_PUBLIC_NEON_*` URLs; the landing's stricter CSP is not applied to the system's routes
- Never grant the `authenticated` role access to a table without an RLS policy
- **Known gap**: the `rpc_*` functions are `SECURITY DEFINER` and trust the `p_club_id` (or record id) they receive without checking it against `current_club_id()`, so they bypass tenant isolation. Neon Auth also has public sign-up enabled. Close both before loading real data
- `getClubId()` reads the club from the user's `empleados` row — don't trust client-provided club IDs
- Secrets (database URLs, storage keys) stay in the git-ignored root `.env.local`. Nothing in `apps/dashboard` needs a secret

### Key Dependencies

- **@neondatabase/neon-js** (beta) — Neon Auth + Data API client
- **Zustand 5** — client state
- **Recharts 2** — analytics charts in `/reportes`
- **Sonner** — toast notifications
- **idb** — IndexedDB wrapper for offline POS
- **decimal.js** — monetary calculations
- **date-fns 4** — date formatting/manipulation
