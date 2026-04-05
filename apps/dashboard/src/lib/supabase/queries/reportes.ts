import type { SupabaseClient } from '@supabase/supabase-js'
import { format } from 'date-fns'
import { localDayStart, localDayEnd } from '@/lib/format'

// Usa fecha LOCAL para fechas de negocio (el club opera en su zona horaria)
function todayLocal(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export interface MetricasHoy {
  ventas_total: number
  ticket_promedio: number
  num_transacciones: number
  ocupacion_pistas_pct: number
  top_productos: TopProducto[]
}

export interface TopProducto {
  nombre: string
  cantidad: number
  monto: number
}

export interface OcupacionPista {
  nombre: string
  pct: number
}

export interface VentaHora {
  hora: number
  total: number
}

// Horas disponibles por día (7am–11pm = 16h)
const HORAS_DISPONIBLES = 16

export async function getMetricasHoy(supabase: SupabaseClient, clubId: string): Promise<MetricasHoy> {
  const today = todayLocal()

  // Intenta obtener de metricas_diarias primero
  const { data: metrica } = await supabase
    .from('metricas_diarias')
    .select('*')
    .eq('club_id', clubId)
    .eq('fecha', today)
    .maybeSingle()

  if (metrica) {
    return {
      ventas_total: metrica.ventas_total ?? 0,
      ticket_promedio: metrica.ticket_promedio ?? 0,
      num_transacciones: metrica.num_transacciones ?? 0,
      ocupacion_pistas_pct: metrica.ocupacion_pistas_pct ?? 0,
      top_productos: (metrica.top_productos as TopProducto[]) ?? [],
    }
  }

  // Fallback: calcular desde pagos vía cuentas del día
  const { data: cuentas } = await supabase
    .from('cuentas')
    .select('id, total')
    .eq('club_id', clubId)
    .gte('created_at', localDayStart())
    .lte('created_at', localDayEnd())
    .eq('estado', 'pagada')

  const cuentaIds = (cuentas ?? []).map((c) => c.id)
  let ventasTotal = 0
  let numTransacciones = 0

  if (cuentaIds.length > 0) {
    const { data: pagos } = await supabase
      .from('pagos')
      .select('monto')
      .in('cuenta_id', cuentaIds)

    ventasTotal = (pagos ?? []).reduce((sum, p) => sum + (p.monto ?? 0), 0)
    numTransacciones = cuentaIds.length
  }

  const ticketPromedio = numTransacciones > 0 ? ventasTotal / numTransacciones : 0

  return {
    ventas_total: ventasTotal,
    ticket_promedio: ticketPromedio,
    num_transacciones: numTransacciones,
    ocupacion_pistas_pct: 0,
    top_productos: [],
  }
}

export async function getTopProductos(
  supabase: SupabaseClient,
  clubId: string,
  limit = 5,
): Promise<TopProducto[]> {
  const startOfMonth = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd') + 'T00:00:00'

  // Obtener cuentas del mes para el club
  const { data: cuentas } = await supabase
    .from('cuentas')
    .select('id')
    .eq('club_id', clubId)
    .gte('created_at', startOfMonth)

  const cuentaIds = (cuentas ?? []).map((c) => c.id)
  if (cuentaIds.length === 0) return []

  // Obtener cuenta_items agrupados por producto_id con join a productos
  const { data: items, error } = await supabase
    .from('cuenta_items')
    .select('producto_id, cantidad, subtotal, productos(nombre)')
    .in('cuenta_id', cuentaIds)
    .not('producto_id', 'is', null)

  if (error || !items) return []

  // Agrupar manualmente por producto_id
  const map = new Map<string, { nombre: string; cantidad: number; monto: number }>()
  for (const item of items) {
    const pid = item.producto_id as string
    const prod = item.productos as unknown as { nombre: string } | null
    const nombre = prod?.nombre ?? 'Sin nombre'
    const existing = map.get(pid)
    if (existing) {
      existing.cantidad += item.cantidad ?? 0
      existing.monto += item.subtotal ?? 0
    } else {
      map.set(pid, { nombre, cantidad: item.cantidad ?? 0, monto: item.subtotal ?? 0 })
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.monto - a.monto)
    .slice(0, limit)
}

export async function getOcupacionPistas(
  supabase: SupabaseClient,
  clubId: string,
): Promise<OcupacionPista[]> {
  const today = todayLocal()

  const { data: pistas } = await supabase
    .from('pistas')
    .select('id, nombre')
    .eq('club_id', clubId)
    .eq('activa', true)
    .order('orden', { ascending: true })

  if (!pistas || pistas.length === 0) return []

  const pistaIds = pistas.map((p) => p.id)

  const { data: reservas } = await supabase
    .from('reservas')
    .select('pista_id, hora_inicio, hora_fin')
    .eq('fecha', today)
    .in('pista_id', pistaIds)
    .in('estado', ['confirmada', 'checkin', 'finalizada'])

  // Calcular horas reservadas por pista
  const horasPorPista = new Map<string, number>()
  for (const r of reservas ?? []) {
    const [h1, m1] = (r.hora_inicio as string).split(':').map(Number)
    const [h2, m2] = (r.hora_fin as string).split(':').map(Number)
    const horas = (h2 * 60 + m2 - (h1 * 60 + m1)) / 60
    horasPorPista.set(r.pista_id, (horasPorPista.get(r.pista_id) ?? 0) + horas)
  }

  return pistas.map((p) => ({
    nombre: p.nombre,
    pct: Math.min(100, Math.round(((horasPorPista.get(p.id) ?? 0) / HORAS_DISPONIBLES) * 100)),
  }))
}

export async function getVentasHoy(
  supabase: SupabaseClient,
  clubId: string,
): Promise<VentaHora[]> {
  const { data: cuentas } = await supabase
    .from('cuentas')
    .select('id')
    .eq('club_id', clubId)
    .gte('created_at', localDayStart())
    .lte('created_at', localDayEnd())

  const cuentaIds = (cuentas ?? []).map((c) => c.id)
  if (cuentaIds.length === 0) return []

  const { data: pagos } = await supabase
    .from('pagos')
    .select('monto, created_at')
    .in('cuenta_id', cuentaIds)

  // Agrupar por hora
  const map = new Map<number, number>()
  for (const p of pagos ?? []) {
    const hora = new Date(p.created_at as string).getHours()
    map.set(hora, (map.get(hora) ?? 0) + (p.monto ?? 0))
  }

  return Array.from(map.entries())
    .map(([hora, total]) => ({ hora, total }))
    .sort((a, b) => a.hora - b.hora)
}
