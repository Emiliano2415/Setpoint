# Onboarding & Multi-Club User Management — Design

**Date:** 2026-04-15

## Goal

Allow new users who register themselves to set up their club or wait to be added to an existing one. Allow propietarios to create credential-only employees (no email). Guarantee complete data isolation between clubs.

---

## User Types & Flows

| Type | JWT `club_id` | Flow |
|------|--------------|------|
| Propietario nuevo | null | OnboardingModal → CreateClubModal → dashboard |
| Empleado en espera | null | OnboardingModal → WaitingModal (Realtime) |
| Empleado sin correo (creado por propietario) | set | Login con código+PIN → dashboard directo |
| Usuario existente con club | set | Dashboard directo, sin modal |

Detection: `AuthProvider.syncUser` checks `appMeta.club_id`. If null → set `needsOnboarding: true` in Zustand. The dashboard layout renders `OnboardingModal` when this flag is true.

---

## Architecture

### DB: `rpc_crear_club` (SECURITY DEFINER)

Server-side RPC called by the frontend after the user fills the form. Steps:
1. INSERT into `clubes` (nombre, ciudad, telefono?, num_pistas?)
2. INSERT into `empleados` (auth_user_id, club_id, nombre, rol='propietario')
3. UPDATE `auth.users.raw_app_meta_data` to set `club_id` and `rol='propietario'`
4. Return the new `club_id`

The JWT update triggers `onAuthStateChange` in the client → `AuthProvider` re-syncs → `needsOnboarding` becomes false → modal closes.

### Empleados sin correo: `crearEmpleadoSinCorreo` (Server Action)

Called from the Empleados module. Steps:
1. Generate username: `SET-` + 5 random alphanumeric chars (e.g. `SET-X7K2M`)
2. Generate PIN: 12 random alphanumeric chars
3. Call Supabase Admin API (`supabase.auth.admin.createUser`) with:
   - email: `{username}@setpoint.internal`
   - password: PIN
   - app_metadata: `{ club_id, rol }`
4. INSERT into `empleados` (auth_user_id, club_id, nombre, rol)
5. Return `{ username, pin }` — shown once to the propietario, never stored in plaintext

Login page accepts either email or `SET-XXXXX` code (mapped to `SET-XXXXX@setpoint.internal`).

### Data isolation

RLS policies on all tables already filter by `(auth.jwt() -> 'app_metadata' ->> 'club_id')::uuid`. No cross-club data leakage is possible at the DB level regardless of frontend behavior.

---

## Components

### `OnboardingModal`
- Location: `apps/dashboard/src/components/modules/onboarding/OnboardingModal.tsx`
- Rendered by: `apps/dashboard/src/app/(dashboard)/layout.tsx` when `needsOnboarding === true`
- No close button — forces choice
- Two cards: "Crear mi club" / "Unirme a una organización"
- Zustand: `needsOnboarding: boolean`, `setNeedsOnboarding(bool)`

### `CreateClubModal`
- Location: `apps/dashboard/src/components/modules/onboarding/CreateClubModal.tsx`
- Fields: nombre*, ciudad*, telefono (optional), num_pistas (optional)
- On submit: calls `rpc_crear_club` → Supabase refreshes session → JWT updated → `needsOnboarding = false`
- Back button → returns to `OnboardingModal`

### `WaitingModal`
- Location: `apps/dashboard/src/components/modules/onboarding/WaitingModal.tsx`
- Message: "Tu cuenta está pendiente de ser añadida a un club. Contacta a tu administrador."
- Sign out button
- Realtime subscription on `empleados` for INSERT where `auth_user_id = user.id` — auto-closes when propietario adds them

### Empleados module extension
- New "Crear usuario de equipo" section in `EmpleadosPage`
- Fields: Nombre, Rol (select)
- Calls server action `crearEmpleadoSinCorreo`
- Shows generated `{ username, pin }` in a one-time display modal
- PIN not stored — propietario must note it down

---

## Zustand changes

Add to `AppState`:
```typescript
needsOnboarding: boolean
setNeedsOnboarding: (v: boolean) => void
```

In `AuthProvider.syncUser`:
- If `clubId === null` → `setNeedsOnboarding(true)`
- If `clubId` is set → `setNeedsOnboarding(false)`

Do NOT persist `needsOnboarding` — always re-derived from JWT on load.

---

## Login page change

Add username resolution before `signInWithPassword`:
- If input doesn't contain `@`, treat as username → map to `{input}@setpoint.internal`
- Otherwise use as-is

---

## Security notes

- `rpc_crear_club` uses SECURITY DEFINER — client cannot manipulate club assignment
- `crearEmpleadoSinCorreo` is a Next.js Server Action — uses Supabase service role key, never exposed to browser
- `@setpoint.internal` emails are internal — no real email sent
- PIN shown once, not stored in plaintext — only the hashed Supabase Auth password remains
- RLS on all tables guarantees club isolation at DB level
