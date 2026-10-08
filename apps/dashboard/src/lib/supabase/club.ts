import type { SupabaseClient } from '@/lib/supabase/client'

/**
 * Returns the club_id for the currently authenticated user,
 * reading it from their `empleados` row.
 * With RLS active, this is for explicit filtering only — RLS
 * already guarantees data isolation at the DB level.
 */
export async function getClubId(supabase: SupabaseClient): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: empleado } = await supabase
    .from('empleados')
    .select('club_id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  return (empleado?.club_id as string) ?? null
}
