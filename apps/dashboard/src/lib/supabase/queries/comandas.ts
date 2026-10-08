import type { SupabaseClient } from '@/lib/supabase/client'
import { localDayStart, localDayEnd } from '@/lib/format'
import { poll } from '@/lib/poll'

export type ComandaEstado = 'pendiente' | 'preparando' | 'listo' | 'entregado' | 'cobrado'

export interface ComandaFromDB {
  id: string
  club_id: string
  cuenta_id: {
    numero_ticket: string
    reserva_id: {
      pista_id: {
        nombre: string
      } | null
    } | null
  } | null
  estacion: string | null
  estado: ComandaEstado
  notas: string | null
  created_at: string
  updated_at: string | null
  comanda_items: {
    id: string
    cantidad: number
    estado: string
    producto_id: {
      id: string
      nombre: string
      precio: number
    } | null
    cuenta_item_id: {
      precio_unitario: number
      producto_id: {
        id: string
        nombre: string
      } | null
    } | null
  }[]
}

export interface ComandaItemInput {
  producto_id: string
  nombre: string
  cantidad: number
  precio_unitario: number
}

export async function createComanda(
  supabase: SupabaseClient,
  clubId: string,
  items: ComandaItemInput[],
  notas?: string,
): Promise<{ data: { id: string } | null; error: Error | null }> {
  const { data: comanda, error: comandaError } = await supabase
    .from('comandas')
    .insert({
      club_id: clubId,
      cuenta_id: null,
      estado: 'pendiente',
      notas: notas ?? null,
    })
    .select('id')
    .single()

  if (comandaError || !comanda) {
    return { data: null, error: comandaError }
  }

  const itemsPayload = items.map((item) => ({
    comanda_id: comanda.id,
    producto_id: item.producto_id,
    cantidad: item.cantidad,
    estado: 'pendiente',
    nombre: item.nombre,
    precio_unitario: item.precio_unitario,
  }))

  const { error: itemsError } = await supabase
    .from('comanda_items')
    .insert(itemsPayload)

  if (itemsError) {
    return { data: null, error: itemsError }
  }

  return { data: { id: comanda.id }, error: null }
}

export async function updateComanda(
  supabase: SupabaseClient,
  comandaId: string,
  fields: Partial<{ cuenta_id: string; estado: ComandaEstado }>,
): Promise<void> {
  const { error } = await supabase
    .from('comandas')
    .update(fields)
    .eq('id', comandaId)

  if (error) throw error
}

export async function getComandas(
  supabase: SupabaseClient,
  clubId: string,
): Promise<ComandaFromDB[]> {
  const { data, error } = await supabase
    .from('comandas')
    .select(`
      id,
      club_id,
      estacion,
      estado,
      notas,
      created_at,
      updated_at,
      cuenta_id (
        numero_ticket,
        reserva_id (
          pista_id (
            nombre
          )
        )
      ),
      comanda_items (
        id,
        cantidad,
        estado,
        nombre,
        precio_unitario,
        producto_id (
          id,
          nombre,
          precio
        ),
        cuenta_item_id (
          precio_unitario,
          producto_id (
            id,
            nombre
          )
        )
      )
    `)
    .eq('club_id', clubId)
    .gte('created_at', localDayStart())
    .lte('created_at', localDayEnd())
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as unknown as ComandaFromDB[]
}

export async function updateComandaEstado(
  supabase: SupabaseClient,
  comandaId: string,
  estado: ComandaEstado,
): Promise<void> {
  const { error } = await supabase
    .from('comandas')
    .update({ estado })
    .eq('id', comandaId)

  if (error) throw error
}

export interface ConsumoItem {
  id: string
  nombre: string
  cantidad: number
  precio_unitario: number
}

export async function getConsumosPorReserva(
  supabase: SupabaseClient,
  reservaId: string,
): Promise<ConsumoItem[]> {
  // Get cuenta for this reserva
  const { data: cuenta } = await supabase
    .from('cuentas')
    .select('id')
    .eq('reserva_id', reservaId)
    .maybeSingle()

  if (!cuenta) return []

  const { data, error } = await supabase
    .from('comandas')
    .select(`
      comanda_items (
        id,
        cantidad,
        nombre,
        precio_unitario,
        cuenta_item_id (
          precio_unitario,
          producto_id (
            nombre
          )
        )
      )
    `)
    .eq('cuenta_id', cuenta.id)
    .neq('estado', 'cancelado')

  if (error) throw error

  type RawComanda = {
    comanda_items: {
      id: string
      cantidad: number
      nombre: string | null
      precio_unitario: number | null
      cuenta_item_id: { precio_unitario: number; producto_id: { nombre: string } | null } | null
    }[]
  }

  const items: ConsumoItem[] = []
  for (const comanda of (data ?? []) as unknown as RawComanda[]) {
    for (const ci of comanda.comanda_items ?? []) {
      items.push({
        id: ci.id,
        nombre: ci.cuenta_item_id?.producto_id?.nombre ?? ci.nombre ?? 'Producto',
        cantidad: ci.cantidad,
        precio_unitario: ci.cuenta_item_id?.precio_unitario ?? ci.precio_unitario ?? 0,
      })
    }
  }
  return items
}

/**
 * Avisa periódicamente para que el tablero de comandas se vuelva a cargar.
 * Antes era una suscripción en tiempo real; Neon no ofrece ese servicio.
 */
export function subscribeToComandas(
  _supabase: SupabaseClient,
  _clubId: string,
  callback: () => void,
) {
  return { unsubscribe: poll(callback, 5_000) }
}
