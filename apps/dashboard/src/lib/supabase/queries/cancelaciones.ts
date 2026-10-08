import type { SupabaseClient } from '@/lib/supabase/client'
import { localDayStart, localDayEnd } from '@/lib/format'

export type CancelacionEstado = 'ejecutada' | 'pendiente' | 'aprobada' | 'reembolsada' | 'rechazada'
export type CancelacionTipo = 'pre_cobro' | 'post_cobro'

export interface CancelacionRow {
  id: string
  club_id: string
  cuenta_id: string | null
  cuenta_item_id: string | null
  reserva_id: string | null
  cantidad: number
  monto: number
  motivo: string
  tipo: CancelacionTipo
  estado: CancelacionEstado
  fue_preparado: boolean
  genera_merma: boolean
  metodo_pago: string | null
  rechazado_motivo: string | null
  autorizado_por: string | null
  cancelado_por: string | null
  created_at: string
  // Joins
  cancelado_por_empleado?: { nombre: string } | null
  autorizado_por_empleado?: { nombre: string } | null
  cuentas?: { numero_ticket: string } | null
  reservas?: {
    fecha: string
    hora_inicio: string
    hora_fin: string
    nombre_cliente: string | null
    pistas: { nombre: string } | null
    clientes: { nombre: string } | null
  } | null
  cuenta_items?: { notas: string | null } | null
}

export interface CancelacionStats {
  total_hoy: number
  pendientes_aprobacion: number
}

export async function getCancelaciones(
  supabase: SupabaseClient,
  clubId: string,
  tab: 'items' | 'reservas',
  fecha: string,
): Promise<CancelacionRow[]> {
  let query = supabase
    .from('cancelaciones')
    .select(`
      *,
      cuentas(numero_ticket),
      reservas(fecha, hora_inicio, hora_fin, nombre_cliente, pistas(nombre), clientes(nombre)),
      cuenta_items(notas),
      cancelado_por_empleado:empleados!cancelaciones_cancelado_por_fkey(nombre),
      autorizado_por_empleado:empleados!cancelaciones_autorizado_por_fkey(nombre)
    `)
    .eq('club_id', clubId)
    .order('created_at', { ascending: false })

  if (tab === 'items') {
    // Día local del club, no el día UTC: con límites UTC lo cancelado después
    // de las 18:00 caía en "mañana" y no aparecía.
    const dia = new Date(`${fecha}T12:00:00`)
    query = query.not('cuenta_item_id', 'is', null)
    query = query.gte('created_at', localDayStart(dia))
    query = query.lte('created_at', localDayEnd(dia))
  } else {
    query = query.not('reserva_id', 'is', null)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as CancelacionRow[]
}

export async function getCancelacionStats(
  supabase: SupabaseClient,
  clubId: string,
): Promise<CancelacionStats> {
  const { data, error } = await supabase
    .from('cancelaciones')
    .select('estado, created_at')
    .eq('club_id', clubId)

  if (error) throw error

  const rows = data ?? []
  // "Hoy" es el día local del club, igual que en la lista
  const inicio = new Date(localDayStart()).getTime()
  const fin = new Date(localDayEnd()).getTime()
  const total_hoy = rows.filter(r => {
    const t = new Date(r.created_at).getTime()
    return t >= inicio && t <= fin
  }).length
  const pendientes_aprobacion = rows.filter(r => r.estado === 'pendiente').length

  return { total_hoy, pendientes_aprobacion }
}

export async function cancelarItemPreCobro(
  supabase: SupabaseClient,
  clubId: string,
  cuentaItemId: string,
  motivo: string,
  canceladoPor: string,
  fuePrepado: boolean,
  generaMerma: boolean,
): Promise<string> {
  const { data, error } = await supabase.rpc('rpc_cancelar_item_pre_cobro', {
    p_club_id: clubId,
    p_cuenta_item_id: cuentaItemId,
    p_motivo: motivo,
    p_cancelado_por: canceladoPor,
    p_fue_preparado: fuePrepado,
    p_genera_merma: generaMerma,
  })
  if (error) throw error
  return data as string
}

export async function solicitarCancelacionPostCobro(
  supabase: SupabaseClient,
  clubId: string,
  cuentaItemId: string,
  motivo: string,
  canceladoPor: string,
  metodoPago: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('rpc_solicitar_cancelacion_post_cobro', {
    p_club_id: clubId,
    p_cuenta_item_id: cuentaItemId,
    p_motivo: motivo,
    p_cancelado_por: canceladoPor,
    p_metodo_pago: metodoPago,
  })
  if (error) throw error
  return data as string
}

export async function aprobarCancelacion(
  supabase: SupabaseClient,
  cancelacionId: string,
  autorizadoPor: string,
  cajaId: string | null,
  rechazar: boolean,
  motivoRechazo?: string,
): Promise<void> {
  const { error } = await supabase.rpc('rpc_aprobar_cancelacion', {
    p_cancelacion_id: cancelacionId,
    p_autorizado_por: autorizadoPor,
    p_caja_id: cajaId,
    p_rechazar: rechazar,
    p_motivo_rechazo: motivoRechazo ?? null,
  })
  if (error) throw error
}

export async function cancelarReserva(
  supabase: SupabaseClient,
  clubId: string,
  reservaId: string,
  motivo: string,
  canceladoPor: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('rpc_cancelar_reserva', {
    p_club_id: clubId,
    p_reserva_id: reservaId,
    p_motivo: motivo,
    p_cancelado_por: canceladoPor,
  })
  if (error) throw error
  return data as string
}
