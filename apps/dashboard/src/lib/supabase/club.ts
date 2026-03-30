import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Returns the club_id for the currently authenticated user,
 * reading from their JWT app_metadata.
 * With RLS active, this is for explicit filtering only — RLS
 * already guarantees data isolation at the DB level.
 */
export async function getClubId(supabase: SupabaseClient): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return (user?.app_metadata?.club_id as string) ?? null
}
