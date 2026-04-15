# Onboarding & Multi-Club User Management — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show an onboarding modal to new users with no club, letting them create a club or wait to be invited; allow propietarios to create credential-only employees from the Empleados module.

**Architecture:** `AuthProvider` detects missing `club_id` in JWT → sets `needsOnboarding: true` in Zustand → dashboard layout renders `OnboardingModal`. A SECURITY DEFINER RPC handles club creation server-side. A Next.js Server Action using the Supabase admin key creates employees without email. Login page resolves `SET-XXXXX` codes to internal emails.

**Tech Stack:** Next.js 16 App Router, Supabase (PostgreSQL + Auth admin API), Zustand 5, TypeScript, Sonner toasts

---

## Task 1: DB Migration — `rpc_crear_club`

**Files:**
- Migration via Supabase MCP `apply_migration`

**Step 1: Apply migration**

Name: `add_rpc_crear_club`

```sql
-- Función para crear club y asignar propietario en una sola transacción
CREATE OR REPLACE FUNCTION rpc_crear_club(
  p_nombre text,
  p_ciudad text,
  p_telefono text DEFAULT NULL,
  p_num_pistas integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_club_id uuid;
  v_user_id uuid;
  v_user_email text;
BEGIN
  -- Obtener el usuario autenticado actual
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verificar que el usuario no tenga ya un club asignado
  IF (auth.jwt() -> 'app_metadata' ->> 'club_id') IS NOT NULL THEN
    RAISE EXCEPTION 'User already belongs to a club';
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

  -- Crear el club
  INSERT INTO clubes (nombre, ciudad, telefono, num_pistas)
  VALUES (p_nombre, p_ciudad, p_telefono, p_num_pistas)
  RETURNING id INTO v_club_id;

  -- Crear el registro de empleado para el propietario
  INSERT INTO empleados (auth_user_id, club_id, nombre, rol, email)
  VALUES (v_user_id, v_club_id, COALESCE(v_user_email, 'Propietario'), 'propietario', v_user_email)
  ON CONFLICT (auth_user_id) DO NOTHING;

  -- Actualizar app_metadata del usuario en auth.users
  UPDATE auth.users
  SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object(
    'club_id', v_club_id::text,
    'rol', 'propietario'
  )
  WHERE id = v_user_id;

  RETURN v_club_id;
END;
$$;
```

**Step 2: Verify**

```sql
SELECT proname FROM pg_proc WHERE proname = 'rpc_crear_club';
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'clubes' AND column_name IN ('nombre', 'ciudad', 'telefono', 'num_pistas');
```

Expected: `rpc_crear_club` exists; clubes has those columns (if any are missing, add them with ALTER TABLE).

**Step 3: Check clubes table structure**

```sql
SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name = 'clubes' ORDER BY ordinal_position;
```

If `telefono` or `num_pistas` columns don't exist, run:

```sql
ALTER TABLE clubes ADD COLUMN IF NOT EXISTS telefono text;
ALTER TABLE clubes ADD COLUMN IF NOT EXISTS num_pistas integer;
```

**Step 4: Commit**

```bash
git add -A && git commit -m "feat(db): add rpc_crear_club SECURITY DEFINER function"
```

---

## Task 2: Zustand — add `needsOnboarding` + update `AuthProvider`

**Files:**
- Modify: `apps/dashboard/src/store/useAppStore.ts`
- Modify: `apps/dashboard/src/components/providers/AuthProvider.tsx`

**Step 1: Update useAppStore.ts**

Read the file first. Add `needsOnboarding` to `AppState` interface and initial state. Add `setNeedsOnboarding` action. Do NOT add to `partialize` (must be re-derived from JWT each session).

Final store shape:

```typescript
'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  empleadoId: string
  email: string
  nombre: string
  rol: string
}

interface AppState {
  user: User | null
  clubId: string | null
  sidebarOpen: boolean
  permisos: string[]
  needsOnboarding: boolean
  setUser: (user: User | null) => void
  setClubId: (id: string) => void
  setPermisos: (permisos: string[]) => void
  setNeedsOnboarding: (v: boolean) => void
  toggleSidebar: () => void
  logout: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      clubId: null,
      sidebarOpen: true,
      permisos: [],
      needsOnboarding: false,
      setUser: (user) => set({ user }),
      setClubId: (id) => set({ clubId: id }),
      setPermisos: (permisos) => set({ permisos }),
      setNeedsOnboarding: (v) => set({ needsOnboarding: v }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      logout: () => set({ user: null, clubId: null, permisos: [], needsOnboarding: false }),
    }),
    {
      name: 'setpoint-app-store',
      partialize: (state) => ({ user: state.user, clubId: state.clubId, permisos: state.permisos }),
    },
  ),
)
```

**Step 2: Update AuthProvider.tsx**

Read the current file. In `syncUser`, after setting `clubId`:

- If `clubId` is null → call `setNeedsOnboarding(true)`
- If `clubId` is set → call `setNeedsOnboarding(false)`

Add this immediately after `if (clubId) useAppStore.getState().setClubId(clubId)`:

```typescript
useAppStore.getState().setNeedsOnboarding(!clubId)
```

**Step 3: Typecheck**

```bash
cd apps/dashboard && npx tsc --noEmit 2>&1 | grep -E "useAppStore|AuthProvider" | head -10
```

Expected: no new errors.

**Step 4: Commit**

```bash
git add apps/dashboard/src/store/useAppStore.ts apps/dashboard/src/components/providers/AuthProvider.tsx
git commit -m "feat: add needsOnboarding state to Zustand and detect in AuthProvider"
```

---

## Task 3: `OnboardingModal` + `WaitingModal` components

**Files:**
- Create: `apps/dashboard/src/components/modules/onboarding/OnboardingModal.tsx`
- Create: `apps/dashboard/src/components/modules/onboarding/WaitingModal.tsx`

**Step 1: Create OnboardingModal.tsx**

```typescript
'use client'

import { useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { createClient } from '@/lib/supabase/client'
import { CreateClubModal } from './CreateClubModal'

export function OnboardingModal() {
  const [choice, setChoice] = useState<'none' | 'crear' | 'esperar'>('none')

  if (choice === 'crear') return <CreateClubModal onBack={() => setChoice('none')} />
  if (choice === 'esperar') return <WaitingForClubModal />

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-sans)' }}>
      <div style={{ width: '100%', maxWidth: '480px', padding: '0 24px' }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--color-text)', letterSpacing: '-0.5px' }}>
            SETPOINT<span style={{ color: 'var(--color-lime)' }}>.</span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--color-muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginTop: '4px' }}>
            Bienvenido
          </p>
        </div>

        <div style={{ background: 'var(--color-bg2)', border: '1px solid var(--color-border)', borderRadius: '20px', padding: '32px' }}>
          <h1 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-text)', marginBottom: '6px' }}>
            ¿Cómo quieres continuar?
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--color-muted)', marginBottom: '28px' }}>
            Tu cuenta está lista. Ahora elige cómo vas a usar Setpoint.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Crear club */}
            <button
              onClick={() => setChoice('crear')}
              style={{ padding: '20px', background: 'rgba(108,242,13,0.05)', border: '1px solid rgba(108,242,13,0.2)', borderRadius: '12px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', transition: 'all 0.15s' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(108,242,13,0.1)'; e.currentTarget.style.borderColor = 'rgba(108,242,13,0.35)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(108,242,13,0.05)'; e.currentTarget.style.borderColor = 'rgba(108,242,13,0.2)' }}
            >
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-lime)', marginBottom: '4px' }}>Crear mi club</div>
              <div style={{ fontSize: '12px', color: 'var(--color-muted)' }}>Soy propietario y quiero registrar mi establecimiento</div>
            </button>

            {/* Unirse */}
            <button
              onClick={() => setChoice('esperar')}
              style={{ padding: '20px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '12px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', transition: 'all 0.15s' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-subtle)' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)' }}
            >
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text)', marginBottom: '4px' }}>Unirme a una organización</div>
              <div style={{ fontSize: '12px', color: 'var(--color-muted)' }}>Mi empleador me dará acceso al sistema</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function WaitingForClubModal() {
  const logout = useAppStore((s) => s.logout)
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    logout()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-sans)' }}>
      <div style={{ width: '100%', maxWidth: '420px', padding: '0 24px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '24px' }}>⏳</div>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-text)', marginBottom: '12px' }}>
          Cuenta pendiente
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--color-muted)', lineHeight: 1.6, marginBottom: '32px' }}>
          Tu cuenta está lista pero aún no ha sido añadida a ningún club. Contacta a tu administrador para que te asigne acceso.
        </p>
        <p style={{ fontSize: '12px', color: 'var(--color-muted-dim)', marginBottom: '24px' }}>
          Esta pantalla se actualizará automáticamente cuando tu acceso sea activado.
        </p>
        <button
          onClick={handleLogout}
          style={{ padding: '10px 24px', background: 'var(--color-bg2)', border: '1px solid var(--color-border)', borderRadius: '8px', color: 'var(--color-muted)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
```

Note: `WaitingForClubModal` is defined in the same file as a private component for now (it has no Realtime subscription yet — added in Task 4).

**Step 2: Typecheck**

```bash
cd apps/dashboard && npx tsc --noEmit 2>&1 | grep "OnboardingModal" | head -10
```

Expected: file not found errors for `CreateClubModal` import (will be created in Task 4). That's OK for now.

**Step 3: Commit**

```bash
git add apps/dashboard/src/components/modules/onboarding/OnboardingModal.tsx
git commit -m "feat(onboarding): add OnboardingModal with intent selection"
```

---

## Task 4: `CreateClubModal` component

**Files:**
- Create: `apps/dashboard/src/components/modules/onboarding/CreateClubModal.tsx`

**Step 1: Create CreateClubModal.tsx**

```typescript
'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAppStore } from '@/store/useAppStore'
import { toast } from 'sonner'

interface Props {
  onBack: () => void
}

export function CreateClubModal({ onBack }: Props) {
  const [nombre, setNombre] = useState('')
  const [ciudad, setCiudad] = useState('')
  const [telefono, setTelefono] = useState('')
  const [numPistas, setNumPistas] = useState('')
  const [saving, setSaving] = useState(false)

  const canSubmit = nombre.trim().length > 0 && ciudad.trim().length > 0

  async function handleSubmit() {
    if (!canSubmit) return
    setSaving(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_crear_club', {
        p_nombre: nombre.trim(),
        p_ciudad: ciudad.trim(),
        p_telefono: telefono.trim() || null,
        p_num_pistas: numPistas ? parseInt(numPistas) : null,
      })
      if (error) throw error

      // Refresh session so JWT picks up new club_id
      const { data: { session } } = await supabase.auth.refreshSession()
      if (session) {
        const clubId = session.user.app_metadata?.club_id
        if (clubId) {
          useAppStore.getState().setClubId(clubId)
          useAppStore.getState().setNeedsOnboarding(false)
        }
      }
      toast.success('¡Club creado! Bienvenido a Setpoint.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al crear el club')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-sans)' }}>
      <div style={{ width: '100%', maxWidth: '480px', padding: '0 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--color-text)', letterSpacing: '-0.5px' }}>
            SETPOINT<span style={{ color: 'var(--color-lime)' }}>.</span>
          </div>
        </div>

        <div style={{ background: 'var(--color-bg2)', border: '1px solid var(--color-border)', borderRadius: '20px', padding: '32px' }}>
          <h1 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-text)', marginBottom: '4px' }}>Registra tu club</h1>
          <p style={{ fontSize: '13px', color: 'var(--color-muted)', marginBottom: '28px' }}>
            Puedes añadir más detalles después desde Configuración.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Field label="Nombre del club *" value={nombre} onChange={setNombre} placeholder="Club Padel Norte" />
            <Field label="Ciudad *" value={ciudad} onChange={setCiudad} placeholder="Monterrey" />
            <Field label="Teléfono (opcional)" value={telefono} onChange={setTelefono} placeholder="+52 81 0000 0000" />
            <Field label="Número de pistas (opcional)" value={numPistas} onChange={setNumPistas} placeholder="4" type="number" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '24px' }}>
            <button
              onClick={onBack}
              style={{ padding: '13px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '10px', color: 'var(--color-muted)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              ← Volver
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || !canSubmit}
              style={{ padding: '13px', background: saving || !canSubmit ? 'rgba(108,242,13,0.3)' : 'var(--color-lime)', border: 'none', borderRadius: '10px', color: 'var(--color-bg)', fontSize: '13px', fontWeight: 800, cursor: saving || !canSubmit ? 'not-allowed' : 'pointer', fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.3px' }}
            >
              {saving ? 'Creando...' : 'Crear club'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string; type?: string
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width: '100%', padding: '10px 12px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '8px', color: 'var(--color-text)', fontSize: '13px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
        onFocus={(e) => (e.target.style.borderColor = 'rgba(108,242,13,0.3)')}
        onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')}
      />
    </div>
  )
}
```

**Step 2: Typecheck**

```bash
cd apps/dashboard && npx tsc --noEmit 2>&1 | grep -E "CreateClub|OnboardingModal" | head -10
```

Expected: no errors.

**Step 3: Commit**

```bash
git add apps/dashboard/src/components/modules/onboarding/CreateClubModal.tsx
git commit -m "feat(onboarding): add CreateClubModal with rpc_crear_club integration"
```

---

## Task 5: Add Realtime to WaitingModal + wire OnboardingModal into layout

**Files:**
- Modify: `apps/dashboard/src/components/modules/onboarding/OnboardingModal.tsx` — add Realtime to `WaitingForClubModal`
- Modify: `apps/dashboard/src/app/(dashboard)/layout.tsx` — render `OnboardingModal` when `needsOnboarding`

**Step 1: Add Realtime to WaitingForClubModal in OnboardingModal.tsx**

Read the file. Replace the `WaitingForClubModal` function with:

```typescript
function WaitingForClubModal() {
  const logout = useAppStore((s) => s.logout)
  const user = useAppStore((s) => s.user)
  const supabase = createClient()

  useEffect(() => {
    if (!user?.id) return
    const channel = supabase
      .channel('waiting-for-club')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'empleados', filter: `auth_user_id=eq.${user.id}` },
        () => {
          // User was added to a club — refresh session
          supabase.auth.refreshSession().then(({ data: { session } }) => {
            if (session?.user.app_metadata?.club_id) {
              const clubId = session.user.app_metadata.club_id
              useAppStore.getState().setClubId(clubId)
              useAppStore.getState().setNeedsOnboarding(false)
            }
          })
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user?.id])

  async function handleLogout() {
    await supabase.auth.signOut()
    logout()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-sans)' }}>
      <div style={{ width: '100%', maxWidth: '420px', padding: '0 24px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '24px' }}>⏳</div>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-text)', marginBottom: '12px' }}>
          Cuenta pendiente
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--color-muted)', lineHeight: 1.6, marginBottom: '32px' }}>
          Tu cuenta está lista pero aún no ha sido añadida a ningún club. Contacta a tu administrador para que te asigne acceso.
        </p>
        <p style={{ fontSize: '12px', color: 'var(--color-muted-dim)', marginBottom: '24px' }}>
          Esta pantalla se actualizará automáticamente cuando tu acceso sea activado.
        </p>
        <button
          onClick={handleLogout}
          style={{ padding: '10px 24px', background: 'var(--color-bg2)', border: '1px solid var(--color-border)', borderRadius: '8px', color: 'var(--color-muted)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
```

Add `useEffect` to the imports at the top: `import { useState, useEffect } from 'react'`

**Step 2: Update dashboard layout.tsx**

Read the current layout. Convert it to a client component and add the onboarding gate:

```typescript
'use client'

import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { OnboardingModal } from '@/components/modules/onboarding/OnboardingModal'
import { useAppStore } from '@/store/useAppStore'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const needsOnboarding = useAppStore((s) => s.needsOnboarding)

  return (
    <div className="dashboard-layout">
      {needsOnboarding && <OnboardingModal />}
      <Sidebar />
      <div className="dashboard-main">
        <TopBar />
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  )
}
```

**Step 3: Typecheck**

```bash
cd apps/dashboard && npx tsc --noEmit 2>&1 | grep -E "OnboardingModal|layout|WaitingFor" | head -10
```

Expected: no errors.

**Step 4: Commit**

```bash
git add apps/dashboard/src/components/modules/onboarding/OnboardingModal.tsx apps/dashboard/src/app/(dashboard)/layout.tsx
git commit -m "feat(onboarding): wire OnboardingModal into layout, add Realtime to WaitingModal"
```

---

## Task 6: Login page — resolve SET-XXXXX username codes

**Files:**
- Modify: `apps/dashboard/src/app/(auth)/login/page.tsx`

**Step 1: Read the current login page**

Check the `handleSubmit` function. Find the `signInWithPassword` call.

**Step 2: Add username resolution**

Before calling `signInWithPassword`, add:

```typescript
// Resolve SET-XXXXX username codes to internal email
const resolvedEmail = email.includes('@') ? email : `${email}@setpoint.internal`

const { error } = await supabase.auth.signInWithPassword({ email: resolvedEmail, password })
```

Also update the email input placeholder to indicate both are accepted:

```typescript
placeholder="admin@tuclub.com o SET-X7K2M"
```

**Step 3: Typecheck**

```bash
cd apps/dashboard && npx tsc --noEmit 2>&1 | grep "login" | head -10
```

**Step 4: Commit**

```bash
git add apps/dashboard/src/app/(auth)/login/page.tsx
git commit -m "feat(auth): resolve SET-XXXXX username codes on login"
```

---

## Task 7: Server Action — `crearEmpleadoSinCorreo`

**Files:**
- Create: `apps/dashboard/src/app/actions/empleados.ts`

**Step 1: Check for service role env var**

The server action needs `SUPABASE_SERVICE_ROLE_KEY`. Verify it's in `.env.local`:

```bash
grep -i "service_role" apps/dashboard/.env.local 2>/dev/null || echo "NOT FOUND"
```

If not found, it needs to be added manually (get from Supabase dashboard → Project Settings → API).

**Step 2: Create the server action**

Create `apps/dashboard/src/app/actions/empleados.ts`:

```typescript
'use server'

import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/supabase/auth'

function generateUsername(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = 'SET-'
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

function generatePin(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

export interface CrearEmpleadoSinCorreoInput {
  nombre: string
  rol: string
  clubId: string
}

export interface CrearEmpleadoSinCorreoResult {
  username: string
  pin: string
}

export async function crearEmpleadoSinCorreo(
  input: CrearEmpleadoSinCorreoInput,
): Promise<CrearEmpleadoSinCorreoResult> {
  // Validate caller is propietario or admin
  const supabaseServer = await createServerClient()
  await requireRole(supabaseServer, ['propietario', 'admin'])

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const username = generateUsername()
  const pin = generatePin()
  const email = `${username}@setpoint.internal`

  // Create auth user
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password: pin,
    email_confirm: true,
    app_metadata: {
      club_id: input.clubId,
      rol: input.rol,
    },
  })

  if (authError) throw new Error(`Error al crear usuario: ${authError.message}`)

  // Create empleado record
  const { error: empError } = await adminClient
    .from('empleados')
    .insert({
      auth_user_id: authData.user.id,
      club_id: input.clubId,
      nombre: input.nombre,
      rol: input.rol,
      email,
    })

  if (empError) {
    // Rollback: delete the auth user
    await adminClient.auth.admin.deleteUser(authData.user.id)
    throw new Error(`Error al crear empleado: ${empError.message}`)
  }

  // Return credentials — shown once, not stored
  return { username, pin }
}
```

**Step 3: Check requireRole import path**

Read `apps/dashboard/src/lib/supabase/auth.ts` to verify `requireRole` exists and its signature. Adjust import if needed.

**Step 4: Typecheck**

```bash
cd apps/dashboard && npx tsc --noEmit 2>&1 | grep "actions/empleados" | head -10
```

**Step 5: Commit**

```bash
git add apps/dashboard/src/app/actions/empleados.ts
git commit -m "feat(empleados): add crearEmpleadoSinCorreo server action"
```

---

## Task 8: EmpleadosPage — "Crear usuario de equipo" UI

**Files:**
- Modify: `apps/dashboard/src/components/modules/empleados/EmpleadosPage.tsx`

**Step 1: Read EmpleadosPage.tsx fully**

Understand the current layout — where to add the "Crear usuario de equipo" button.

**Step 2: Add state and modal**

Add to the component:

```typescript
import { crearEmpleadoSinCorreo } from '@/app/actions/empleados'
import { usePermiso } from '@/hooks/usePermiso'

// Inside component:
const puedeCrearEmpleado = usePermiso('abrir_cerrar_turno') // reutilizar permiso admin
const [showCrearModal, setShowCrearModal] = useState(false)
const [nuevoNombre, setNuevoNombre] = useState('')
const [nuevoRol, setNuevoRol] = useState<UserRole>('cajero')
const [creandoEmpleado, setCreandoEmpleado] = useState(false)
const [credenciales, setCredenciales] = useState<{ username: string; pin: string } | null>(null)
```

**Step 3: Add handler**

```typescript
async function handleCrearEmpleado() {
  if (!nuevoNombre.trim() || !clubId) return
  setCreandoEmpleado(true)
  try {
    const result = await crearEmpleadoSinCorreo({
      nombre: nuevoNombre.trim(),
      rol: nuevoRol,
      clubId,
    })
    setCredenciales(result)
    setNuevoNombre('')
    // Refresh empleados list
    const supabase = createClient()
    const empData = await getEmpleados(supabase, clubId)
    setEmpleados(empData)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Error al crear usuario')
  } finally {
    setCreandoEmpleado(false)
  }
}
```

**Step 4: Add modal JSX**

Add a "Crear usuario de equipo" button near the top of the page (visible only to propietario/admin via `puedeCrearEmpleado`), and a modal that shows the form. After creation, show a one-time credentials display.

Form modal:

```tsx
{showCrearModal && !credenciales && (
  <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    onClick={(e) => { if (e.target === e.currentTarget) setShowCrearModal(false) }}>
    <div style={{ background: 'var(--color-bg2)', border: '1px solid var(--color-border)', borderRadius: '16px', width: '400px', padding: '28px', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
      <div style={{ fontSize: '16px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '20px' }}>
        Crear usuario de equipo
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Nombre</label>
          <input type="text" value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} placeholder="Nombre completo" style={{ width: '100%', padding: '10px 12px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '8px', color: 'var(--color-text)', fontSize: '13px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Rol</label>
          <select value={nuevoRol} onChange={(e) => setNuevoRol(e.target.value as UserRole)} style={{ width: '100%', padding: '10px 12px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '8px', color: 'var(--color-text)', fontSize: '13px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}>
            <option value="cajero">Cajero</option>
            <option value="mesero">Mesero</option>
            <option value="cocina">Cocina</option>
            <option value="barra">Barra</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>

      <div style={{ padding: '10px 12px', background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)', borderRadius: '8px', fontSize: '11px', color: '#EAB308', marginBottom: '20px' }}>
        ⚠ Las credenciales se mostrarán una sola vez. El empleado no podrá recuperarlas.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <button onClick={() => setShowCrearModal(false)} style={{ padding: '12px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '10px', color: 'var(--color-muted)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
        <button onClick={handleCrearEmpleado} disabled={creandoEmpleado || !nuevoNombre.trim()} style={{ padding: '12px', background: creandoEmpleado || !nuevoNombre.trim() ? 'rgba(108,242,13,0.3)' : 'var(--color-lime)', border: 'none', borderRadius: '10px', color: 'var(--color-bg)', fontSize: '13px', fontWeight: 800, cursor: creandoEmpleado || !nuevoNombre.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit', textTransform: 'uppercase' }}>
          {creandoEmpleado ? 'Creando...' : 'Crear'}
        </button>
      </div>
    </div>
  </div>
)}
```

Credentials one-time display:

```tsx
{credenciales && (
  <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ background: 'var(--color-bg2)', border: '1px solid var(--color-border)', borderRadius: '16px', width: '420px', padding: '28px', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
      <div style={{ fontSize: '16px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Credenciales generadas</div>
      <p style={{ fontSize: '12px', color: '#EF4444', marginBottom: '20px', fontWeight: 600 }}>Copia estas credenciales ahora. No se podrán recuperar después.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
        <div style={{ padding: '14px 16px', background: 'var(--color-bg)', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Usuario</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '15px', fontWeight: 700, color: 'var(--color-lime)' }}>{credenciales.username}</span>
        </div>
        <div style={{ padding: '14px 16px', background: 'var(--color-bg)', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>PIN</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '15px', fontWeight: 700, color: 'var(--color-lime)' }}>{credenciales.pin}</span>
        </div>
      </div>

      <button onClick={() => { setCredenciales(null); setShowCrearModal(false) }} style={{ width: '100%', padding: '13px', background: 'var(--color-lime)', border: 'none', borderRadius: '10px', color: 'var(--color-bg)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'uppercase' }}>
        Listo, guardé las credenciales
      </button>
    </div>
  </div>
)}
```

**Step 5: Add "Crear usuario" button to page header**

Find where the page header/title is rendered and add (visible only to propietario/admin):

```tsx
{puedeCrearEmpleado && (
  <button onClick={() => setShowCrearModal(true)} style={{ padding: '8px 16px', background: 'var(--color-lime)', border: 'none', borderRadius: '8px', color: 'var(--color-bg)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
    + Crear usuario
  </button>
)}
```

**Step 6: Typecheck**

```bash
cd apps/dashboard && npx tsc --noEmit 2>&1 | grep -E "EmpleadosPage|empleados" | head -15
```

**Step 7: Commit**

```bash
git add apps/dashboard/src/components/modules/empleados/EmpleadosPage.tsx
git commit -m "feat(empleados): add crear usuario de equipo with one-time credential display"
```

---

## Summary

| Task | Feature | Type |
|------|---------|------|
| 1 | DB: `rpc_crear_club` SECURITY DEFINER | Migration SQL |
| 2 | Zustand `needsOnboarding` + AuthProvider detection | Frontend |
| 3 | `OnboardingModal` + `WaitingForClubModal` | Frontend |
| 4 | `CreateClubModal` with `rpc_crear_club` | Frontend |
| 5 | Realtime in WaitingModal + layout gate | Frontend |
| 6 | Login: resolve `SET-XXXXX` codes | Frontend |
| 7 | `crearEmpleadoSinCorreo` server action | Server Action |
| 8 | EmpleadosPage: "Crear usuario de equipo" UI | Frontend |

**3 new components. 1 server action. 4 modified files. 1 DB migration.**
