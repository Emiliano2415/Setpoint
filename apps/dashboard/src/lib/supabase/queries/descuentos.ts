import type { SupabaseClient } from '@/lib/supabase/client'

export type TipoDescuento = 'porcentaje' | 'monto_fijo'
export type AplicaA = 'todo' | 'categoria_producto'

export interface DescuentoRegla {
  id: string
  club_id: string
  nombre: string
  tipo: TipoDescuento
  valor: number
  aplica_a: AplicaA
  categoria_cliente: string | null
  categoria_producto_id: string | null
  activo: boolean
  created_at: string
}

export async function getDescuentosReglas(
  supabase: SupabaseClient,
  clubId: string,
): Promise<DescuentoRegla[]> {
  const { data, error } = await supabase
    .from('descuentos_reglas')
    .select('*')
    .eq('club_id', clubId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as DescuentoRegla[]
}

export async function createDescuentoRegla(
  supabase: SupabaseClient,
  clubId: string,
  fields: Pick<DescuentoRegla, 'nombre' | 'tipo' | 'valor' | 'aplica_a' | 'categoria_cliente'>,
): Promise<DescuentoRegla> {
  const { data, error } = await supabase
    .from('descuentos_reglas')
    .insert({ ...fields, club_id: clubId })
    .select()
    .single()

  if (error) throw error
  return data as DescuentoRegla
}

export async function updateDescuentoRegla(
  supabase: SupabaseClient,
  id: string,
  fields: Partial<Pick<DescuentoRegla, 'nombre' | 'tipo' | 'valor' | 'aplica_a' | 'categoria_cliente' | 'activo'>>,
): Promise<void> {
  const { error } = await supabase
    .from('descuentos_reglas')
    .update(fields)
    .eq('id', id)

  if (error) throw error
}

export async function deleteDescuentoRegla(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from('descuentos_reglas')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function getDescuentosActivos(
  supabase: SupabaseClient,
  clubId: string,
): Promise<DescuentoRegla[]> {
  const { data, error } = await supabase
    .from('descuentos_reglas')
    .select('*')
    .eq('club_id', clubId)
    .eq('activo', true)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as DescuentoRegla[]
}
