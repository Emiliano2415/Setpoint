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

const CANCELACION_SELECT = `
  *,
  cuentas(numero_ticket),
  reservas(fecha, hora_inicio, hora_fin, nombre_cliente, pistas(nombre), clientes(nombre)),
  cuenta_items(notas),
  cancelado_por_empleado:empleados!cancelaciones_cancelado_por_fkey(nombre),
  autorizado_por_empleado:empleados!cancelaciones_autorizado_por_fkey(nombre)
`

/**
 * Pestaña "items": las cancelaciones del día elegido más todas las pendientes de
 * aprobación, sean del día que sean (una solicitud que nadie aprobó ese día no
 * debe desaparecer al día siguiente). Las pendientes van primero.
 * Pestaña "reservas": todas las cancelaciones de reservas.
 */
export async function getCancelaciones(
  supabase: SupabaseClient,
  clubId: string,
  tab: 'items' | 'reservas',
  fecha: string,
): Promise<CancelacionRow[]> {
  const base = () =>
    supabase
      .from('cancelaciones')
      .select(CANCELACION_SELECT)
      .eq('club_id', clubId)
      .order('created_at', { ascending: false })

  if (tab === 'reservas') {
    const { data, error } = await base().not('reserva_id', 'is', null)
    if (error) throw error
    return (data ?? []) as CancelacionRow[]
  }

  // Día local del club, no el día UTC: con límites UTC lo cancelado después
  // de las 18:00 caía en "mañana" y no aparecía.
  const dia = new Date(`${fecha}T12:00:00`)
  // De ítems y de ventas completas (estas no tienen cuenta_item_id)
  const [delDia, pendientes] = await Promise.all([
    base()
      .not('cuenta_id', 'is', null)
      .is('reserva_id', null)
      .gte('created_at', localDayStart(dia))
      .lte('created_at', localDayEnd(dia)),
    base()
      .not('cuenta_id', 'is', null)
      .is('reserva_id', null)
      .eq('estado', 'pendiente'),
  ])
  if (delDia.error) throw delDia.error
  if (pendientes.error) throw pendientes.error

  const filas = (pendientes.data ?? []) as CancelacionRow[]
  const vistas = new Set(filas.map((r) => r.id))
  for (const r of (delDia.data ?? []) as CancelacionRow[]) {
    if (!vistas.has(r.id)) filas.push(r)
  }
  return filas
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

/**
 * Pide el reembolso de una venta completa: una solicitud pendiente por método
 * de pago con lo cobrado por ese método. Devuelve cuántas se crearon.
 * El club y el empleado salen de la sesión.
 */
export async function solicitarCancelacionCuenta(
  supabase: SupabaseClient,
  cuentaId: string,
  motivo: string,
): Promise<number> {
  const { data, error } = await supabase.rpc('rpc_solicitar_cancelacion_cuenta', {
    p_cuenta_id: cuentaId,
    p_motivo: motivo,
  })
  if (error) throw error
  return data as number
}

/** Estados de una cancelación que siguen vigentes: impiden pedir otra por lo mismo */
export const CANCELACION_ACTIVA: CancelacionEstado[] = ['pendiente', 'aprobada', 'reembolsada']

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
