import type { SupabaseClient } from '@supabase/supabase-js'
import { insertMovimientoCaja } from './caja'
import type { MetodoPago } from './caja'

// Estados reales del enum reserva_estado en la DB
export type CourtEstado = 'confirmada' | 'checkin' | 'finalizada' | 'cancelada' | 'noshow'

export interface PistaRow {
  id: string
  club_id: string
  nombre: string
  tipo: string
  activa: boolean
  orden: number
  en_mantenimiento: boolean
  nota_mantenimiento: string | null
}

export interface ReservaRow {
  id: string
  club_id: string
  pista_id: string
  cliente_id: string | null
  nombre_cliente: string | null
  fecha: string
  hora_inicio: string
  hora_fin: string
  estado: CourtEstado
  precio: number
  notas: string | null
  clientes?: { nombre: string } | null
  pistas?: { nombre: string } | null
}

export async function getPistas(supabase: SupabaseClient, clubId: string): Promise<PistaRow[]> {
  const { data, error } = await supabase
    .from('pistas')
    .select('*')
    .eq('club_id', clubId)
    .eq('activa', true)
    .order('orden', { ascending: true })

  if (error) throw error
  return data ?? []
}

function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function getTodayReservas(supabase: SupabaseClient, clubId: string): Promise<ReservaRow[]> {
  const today = todayLocal()

  const { data, error } = await supabase
    .from('reservas')
    .select('*, clientes(nombre), pistas(nombre)')
    .eq('club_id', clubId)
    .eq('fecha', today)
    .order('hora_inicio', { ascending: true })

  if (error) throw error
  return (data ?? []) as ReservaRow[]
}

export async function getActiveReserva(supabase: SupabaseClient, pistaId: string): Promise<ReservaRow | null> {
  const today = todayLocal()

  const { data, error } = await supabase
    .from('reservas')
    .select('*, clientes(nombre)')
    .eq('pista_id', pistaId)
    .eq('fecha', today)
    .in('estado', ['checkin', 'confirmada'])
    .order('hora_inicio', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data as ReservaRow | null
}

export async function createReserva(
  supabase: SupabaseClient,
  data: Omit<ReservaRow, 'id' | 'clientes'>,
): Promise<ReservaRow> {
  const { data: created, error } = await supabase
    .from('reservas')
    .insert(data)
    .select()
    .single()

  if (error) throw error
  return created as ReservaRow
}

export async function updateReservaEstado(
  supabase: SupabaseClient,
  reservaId: string,
  estado: CourtEstado,
): Promise<void> {
  const { error } = await supabase
    .from('reservas')
    .update({ estado })
    .eq('id', reservaId)

  if (error) throw error
}

export async function getAllPistas(supabase: SupabaseClient, clubId: string): Promise<PistaRow[]> {
  const { data, error } = await supabase
    .from('pistas')
    .select('*')
    .eq('club_id', clubId)
    .order('orden', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function updatePista(
  supabase: SupabaseClient,
  pistaId: string,
  fields: Partial<Pick<PistaRow, 'nombre' | 'tipo' | 'activa' | 'orden' | 'en_mantenimiento' | 'nota_mantenimiento'>>,
): Promise<void> {
  const { error } = await supabase.from('pistas').update(fields).eq('id', pistaId)
  if (error) throw error
}

export async function createPista(
  supabase: SupabaseClient,
  clubId: string,
  data: Pick<PistaRow, 'nombre' | 'tipo' | 'orden'>,
): Promise<void> {
  const { error } = await supabase.from('pistas').insert({ ...data, club_id: clubId, activa: true })
  if (error) throw error
}

export async function checkInWithPayment(
  supabase: SupabaseClient,
  reservaId: string,
  precio: number,
  metodo: MetodoPago,
  cajaId: string,
  concepto: string,
): Promise<void> {
  const { error } = await supabase.rpc('rpc_check_in_with_payment', {
    p_reserva_id: reservaId,
    p_precio: precio,
    p_metodo: metodo,
    p_caja_id: cajaId,
    p_concepto: concepto,
  })
  if (error) throw error
}
