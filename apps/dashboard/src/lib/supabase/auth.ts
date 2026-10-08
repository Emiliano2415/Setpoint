import type { SupabaseClient } from '@/lib/supabase/client'

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
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new UnauthorizedError('Sesión no válida')
  }

  const { data: empleado } = await supabase
    .from('empleados')
    .select('rol, club_id')
    .eq('auth_user_id', user.id)
    .single()

  const clubId = empleado?.club_id as string | undefined
  if (!clubId) {
    throw new UnauthorizedError('Usuario sin club asignado')
  }

  const rol = empleado?.rol as UserRole | undefined
  if (!rol || !allowedRoles.includes(rol)) {
    throw new UnauthorizedError(`Rol '${rol}' no tiene permiso para esta operación`)
  }

  return { userId: user.id, clubId, rol }
}
