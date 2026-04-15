'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAppStore } from '@/store'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const supabase = createClient()

    async function syncUser(userId: string, email: string, appMeta: Record<string, unknown>) {
      const { data } = await supabase
        .from('empleados')
        .select('id, nombre, rol')
        .eq('auth_user_id', userId)
        .limit(1)
        .single()

      const clubId = (appMeta?.club_id as string) ?? null

      const empleado = {
        id: data?.id ?? userId,
        nombre: data?.nombre ?? email,
        rol: data?.rol ?? 'empleado',
      }

      useAppStore.getState().setUser({
        id: userId,
        empleadoId: empleado.id,
        email,
        nombre: empleado.nombre,
        rol: empleado.rol,
      })

      if (clubId) useAppStore.getState().setClubId(clubId)

      // Cargar permisos del rol del empleado
      if (clubId) {
        const { data: permisosData } = await supabase.rpc('rpc_get_permisos_rol', {
          p_club_id: clubId,
        })
        const rolActual = empleado.rol
        const accionesPermitidas = (permisosData ?? [])
          .filter((p: { rol: string; accion: string; permitido: boolean }) =>
            p.rol === rolActual && p.permitido
          )
          .map((p: { accion: string }) => p.accion)
        useAppStore.getState().setPermisos(accionesPermitidas)
      }
    }

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) syncUser(user.id, user.email ?? '', user.app_metadata ?? {})
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        syncUser(session.user.id, session.user.email ?? '', session.user.app_metadata ?? {})
      } else {
        useAppStore.getState().logout()
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  return <>{children}</>
}
