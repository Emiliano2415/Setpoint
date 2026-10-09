import type { SupabaseClient } from '@/lib/supabase/client'
import { localDayStart, localDayEnd } from '@/lib/format'

// ─── Types ───────────────────────────────────────────────────────────────────

export type UserRole = 'propietario' | 'admin' | 'cajero' | 'mesero' | 'cocina' | 'barra'

export interface TurnoActivo {
  id: string
  tipo: string
  inicio: string
  fin: string | null
}

export interface EmpleadoRow {
  id: string
  club_id: string
  nombre: string
  rol: UserRole
  activo: boolean
  turno_activo: TurnoActivo | null
}

export interface EmpleadoStats {
  total: number
  activos_hoy: number
  en_turno: number
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function getEmpleados(
  supabase: SupabaseClient,
  clubId: string,
): Promise<EmpleadoRow[]> {
  const { data: empleados, error } = await supabase
    .from('empleados')
    .select('id, club_id, nombre, rol, activo')
    .eq('club_id', clubId)
    .order('nombre', { ascending: true })

  if (error) throw error

  // Para cada empleado, buscar su turno activo de hoy
  const ids = (empleados ?? []).map((e) => e.id)
  if (ids.length === 0) return []

  const { data: turnos, error: turnosError } = await supabase
    .from('turnos')
    .select('id, empleado_id, tipo, inicio, fin')
    .eq('club_id', clubId)
    .in('empleado_id', ids)
    .gte('inicio', localDayStart())
    .lte('inicio', localDayEnd())
    .is('fin', null)

  if (turnosError) throw turnosError

  const turnoByEmpleado = new Map<string, TurnoActivo>()
  for (const t of turnos ?? []) {
    turnoByEmpleado.set(t.empleado_id, {
      id: t.id,
      tipo: t.tipo,
      inicio: t.inicio,
      fin: t.fin,
    })
  }

  return (empleados ?? []).map((e) => ({
    ...e,
    turno_activo: turnoByEmpleado.get(e.id) ?? null,
  })) as EmpleadoRow[]
}

export async function getEmpleadoStats(
  supabase: SupabaseClient,
  clubId: string,
): Promise<EmpleadoStats> {
  const { data: empleados, error } = await supabase
    .from('empleados')
    .select('id, activo')
    .eq('club_id', clubId)

  if (error) throw error

  const total = (empleados ?? []).length
  const activos_hoy = (empleados ?? []).filter((e) => e.activo).length

  const ids = (empleados ?? []).map((e) => e.id)
  if (ids.length === 0) return { total, activos_hoy, en_turno: 0 }

  const { data: turnos, error: turnosError } = await supabase
    .from('turnos')
    .select('empleado_id')
    .eq('club_id', clubId)
    .in('empleado_id', ids)
    .gte('inicio', localDayStart())
    .lte('inicio', localDayEnd())
    .is('fin', null)

  if (turnosError) throw turnosError

  const en_turno = new Set((turnos ?? []).map((t) => t.empleado_id)).size

  return { total, activos_hoy, en_turno }
}
