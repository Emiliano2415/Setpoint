import type { SupabaseClient } from '@/lib/supabase/client'

export interface Tarifa {
  nombre: string
  inicio: string
  fin: string
  precio: number
}

export interface ClubConfig {
  moneda?: string
  zona_horaria?: string
  iva_default?: number
  metodos_pago?: string[]
  tarifas?: Tarifa[]
  tolerancia_caja?: number
  timer_alerta_min?: number
  noshow_tolerancia_min?: number
}

export interface ClubRow {
  id: string
  nombre: string
  direccion: string | null
  telefono: string | null
  config: ClubConfig
  created_at?: string
}

export async function getClub(supabase: SupabaseClient, clubId: string): Promise<ClubRow | null> {
  const { data, error } = await supabase
    .from('clubes')
    .select('id, nombre, direccion, telefono, config, created_at')
    .eq('id', clubId)
    .maybeSingle()

  if (error) throw error
  return data as ClubRow | null
}

export async function updateClub(
  supabase: SupabaseClient,
  clubId: string,
  data: Partial<Pick<ClubRow, 'nombre' | 'direccion' | 'telefono' | 'config'>>,
): Promise<void> {
  const { error } = await supabase
    .from('clubes')
    .update(data)
    .eq('id', clubId)

  if (error) throw error
}

export async function updateConfig(
  supabase: SupabaseClient,
  clubId: string,
  config: ClubConfig,
): Promise<void> {
  const { error } = await supabase
    .from('clubes')
    .update({ config })
    .eq('id', clubId)

  if (error) throw error
}
