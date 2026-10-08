'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAppStore } from '@/store'

const PUBLIC_ROUTES = ['/login', '/forgot-password']

async function syncUser(userId: string, email: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('empleados')
    .select('id, nombre, rol, club_id')
    .eq('auth_user_id', userId)
    .limit(1)
    .single()

  // El club sale de la fila del empleado, no del token: RLS solo deja ver la propia
  const clubId = (data?.club_id as string) ?? null

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  // Resultado de la última comprobación de sesión y la ruta para la que se hizo
  const [auth, setAuth] = useState<{ status: 'in' | 'out'; path: string } | null>(null)

  // La sesión se comprueba al cargar y en cada cambio de ruta. El login y el
  // cierre de sesión terminan navegando, así que quedan cubiertos sin depender
  // de eventos del proveedor de autenticación.
  useEffect(() => {
    let cancelled = false
    const supabase = createClient()

    supabase.auth
      .getUser()
      .then(({ data: { user } }) => {
        if (cancelled) return
        if (user) {
          const store = useAppStore.getState()
          if (store.user?.id !== user.id || !store.clubId) syncUser(user.id, user.email ?? '')
          setAuth({ status: 'in', path: pathname })
        } else {
          useAppStore.getState().logout()
          setAuth({ status: 'out', path: pathname })
        }
      })
      // Sin red no se puede confirmar la sesión: solo se manda al login a quien
      // tampoco tenía un usuario guardado de una visita anterior
      .catch(() => {
        if (!cancelled && !useAppStore.getState().user) setAuth({ status: 'out', path: pathname })
      })

    return () => {
      cancelled = true
    }
  }, [pathname])

  // Protección de rutas en el navegador. La sesión vive en Neon Auth (otro
  // dominio), así que el servidor de Next no puede comprobarla; los datos los
  // protege RLS en cualquier caso.
  useEffect(() => {
    if (!auth || auth.path !== pathname) return
    const isPublic = PUBLIC_ROUTES.some((route) => pathname.startsWith(route))
    if (auth.status === 'out' && !isPublic) router.replace('/login')
    if (auth.status === 'in' && isPublic) router.replace('/pos')
  }, [auth, pathname, router])

  return <>{children}</>
}
