import type { SupabaseClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClienteCategoria = 'nuevo' | 'regular' | 'silver' | 'gold'

export interface ClienteStats {
  visitas: number
  ticket_promedio: number
  ultima_visita: string | null
}

export interface Cliente {
  id: string
  club_id: string
  nombre: string
  telefono: string | null
  email: string | null
  categoria: ClienteCategoria
  es_socio: boolean
  saldo_cuenta: number
  stats: ClienteStats
  notas: string | null
  created_at: string
}

export interface ClienteResumen {
  total: number
  socios: number
  ticket_promedio: number
  nuevos_mes: number
}

export interface Bono {
  id: string
  tipo: string
  valor_total: number
  valor_restante: number
  fecha_expiracion: string | null
  activo: boolean
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getClientes(supabase: SupabaseClient, clubId: string) {
  return supabase
    .from('clientes')
    .select(
      'id, nombre, telefono, email, categoria, es_socio, saldo_cuenta, stats, notas, created_at',
    )
    .eq('club_id', clubId)
    .order('created_at', { ascending: false })
}

export async function getClienteStats(
  supabase: SupabaseClient,
  clubId: string,
): Promise<{ data: ClienteResumen | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('clientes')
    .select('es_socio, stats, created_at')
    .eq('club_id', clubId)

  if (error || !data) return { data: null, error }

  const ahora = new Date()
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString()

  const socios = data.filter((c) => c.es_socio).length
  const nuevos_mes = data.filter((c) => c.created_at >= inicioMes).length

  const tickets = data
    .map((c) => (c.stats as ClienteStats)?.ticket_promedio ?? 0)
    .filter((t) => t > 0)

  const ticket_promedio =
    tickets.length > 0
      ? Math.round(tickets.reduce((a, b) => a + b, 0) / tickets.length)
      : 0

  return {
    data: {
      total: data.length,
      socios,
      ticket_promedio,
      nuevos_mes,
    },
    error: null,
  }
}

export async function createCliente(
  supabase: SupabaseClient,
  clubId: string,
  data: Pick<Cliente, 'nombre' | 'telefono' | 'email' | 'categoria' | 'es_socio' | 'notas'>,
): Promise<Cliente> {
  const { data: created, error } = await supabase
    .from('clientes')
    .insert({
      club_id: clubId,
      ...data,
      saldo_cuenta: 0,
      stats: { visitas: 0, ticket_promedio: 0, ultima_visita: null },
    })
    .select('id, club_id, nombre, telefono, email, categoria, es_socio, saldo_cuenta, stats, notas, created_at')
    .single()
  if (error) throw error
  return created as Cliente
}

export async function updateCliente(
  supabase: SupabaseClient,
  clienteId: string,
  fields: Partial<Pick<Cliente, 'nombre' | 'telefono' | 'email' | 'categoria' | 'es_socio' | 'notas'>>,
): Promise<void> {
  const { error } = await supabase.from('clientes').update(fields).eq('id', clienteId)
  if (error) throw error
}

export async function getCliente(supabase: SupabaseClient, clienteId: string) {
  const [clienteRes, bonosRes] = await Promise.all([
    supabase
      .from('clientes')
      .select(
        'id, club_id, nombre, telefono, email, categoria, es_socio, saldo_cuenta, stats, notas, created_at',
      )
      .eq('id', clienteId)
      .single(),
    supabase
      .from('bonos')
      .select('id, tipo, valor_total, valor_restante, fecha_expiracion, activo')
      .eq('cliente_id', clienteId)
      .eq('activo', true),
  ])

  return {
    cliente: clienteRes,
    bonos: bonosRes,
  }
}
