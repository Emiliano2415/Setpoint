import { useAppStore } from '@/store/useAppStore'

/**
 * Retorna true si el usuario actual tiene el permiso para la acción dada.
 * Los propietarios siempre tienen todos los permisos.
 */
export function usePermiso(accion: string): boolean {
  const user = useAppStore((s) => s.user)
  const permisos = useAppStore((s) => s.permisos)

  if (!user) return false
  if (user.rol === 'propietario') return true
  return permisos.includes(accion)
}
