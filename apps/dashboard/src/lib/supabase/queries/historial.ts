import type { SupabaseClient } from '@/lib/supabase/client'

export interface VentaPOS {
  id: string
  numero_ticket: string
  created_at: string
  total: number
  subtotal: number
  iva: number
  descuento_total: number
  cliente_nombre: string | null
  metodos_pago: { metodo: string; monto: number }[]
  items: { id: string; nombre: string; cantidad: number; precio_unitario: number; subtotal: number; estado: string }[]
}

export interface RentaCancha {
  id: string
  pista_nombre: string
  hora_inicio: string
  hora_fin: string
  fecha: string
  precio: number
  cliente_nombre: string | null
  estado: string
  notas: string | null
  created_at: string
}

export interface MovimientoCajaHistorial {
  id: string
  tipo: 'ingreso' | 'egreso' | 'fondo' | 'retiro'
  concepto: string
  monto: number
  cajero_nombre: string | null
  created_at: string
}

export interface KPIsHistorial {
  totalVentas: number
  countVentas: number
  totalCanchas: number
  countCanchas: number
  netoCaja: number   // ingresos+fondos - egresos - retiros
  countMovimientos: number
  totalIngresos: number  // totalVentas + totalCanchas
}

export async function getHistorialVentas(
  supabase: SupabaseClient,
  clubId: string,
  desde: string,
  hasta: string,
): Promise<VentaPOS[]> {
  const { data, error } = await supabase
    .from('cuentas')
    .select(`
      id,
      numero_ticket,
      created_at,
      total,
      subtotal,
      iva,
      descuento_total,
      clientes ( nombre ),
      pagos ( metodo, monto ),
      cuenta_items (
        id,
        estado,
        cantidad,
        precio_unitario,
        subtotal,
        productos ( nombre )
      )
    `)
    .eq('club_id', clubId)
    .eq('estado', 'pagada')
    .gte('created_at', desde)
    .lte('created_at', hasta)
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((c) => ({
    id: c.id,
    numero_ticket: (c.numero_ticket as string) ?? c.id.slice(-6).toUpperCase(),
    created_at: c.created_at as string,
    total: c.total as number,
    subtotal: c.subtotal as number,
    iva: c.iva as number,
    descuento_total: c.descuento_total as number,
    cliente_nombre: (c.clientes as unknown as { nombre: string } | null)?.nombre ?? null,
    metodos_pago: ((c.pagos as { metodo: string; monto: number }[]) ?? []),
    items: ((c.cuenta_items as unknown as {
      id: string
      estado: string
      cantidad: number
      precio_unitario: number
      subtotal: number
      productos: { nombre: string } | null
    }[]) ?? []).map((i) => ({
      id: i.id,
      nombre: i.productos?.nombre ?? 'Producto',
      cantidad: i.cantidad,
      precio_unitario: i.precio_unitario,
      subtotal: i.subtotal,
      estado: i.estado ?? 'pendiente',
    })),
  }))
}

export async function getHistorialCanchas(
  supabase: SupabaseClient,
  clubId: string,
  desde: string,
  hasta: string,
): Promise<RentaCancha[]> {
  const { data, error } = await supabase
    .from('reservas')
    .select(`
      id,
      hora_inicio,
      hora_fin,
      fecha,
      precio,
      estado,
      notas,
      created_at,
      pistas ( nombre ),
      clientes ( nombre )
    `)
    .eq('club_id', clubId)
    .eq('estado', 'finalizada')
    .gte('created_at', desde)
    .lte('created_at', hasta)
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((r) => ({
    id: r.id,
    pista_nombre: (r.pistas as unknown as { nombre: string } | null)?.nombre ?? 'Pista',
    hora_inicio: r.hora_inicio as string,
    hora_fin: r.hora_fin as string,
    fecha: r.fecha as string,
    precio: r.precio as number,
    cliente_nombre: (r.clientes as unknown as { nombre: string } | null)?.nombre ?? null,
    estado: r.estado as string,
    notas: r.notas as string | null,
    created_at: r.created_at as string,
  }))
}

export async function getHistorialMovimientos(
  supabase: SupabaseClient,
  clubId: string,
  desde: string,
  hasta: string,
): Promise<MovimientoCajaHistorial[]> {
  const { data, error } = await supabase
    .from('movimientos_caja')
    .select(`
      id,
      tipo,
      concepto,
      monto,
      created_at,
      cajas!inner (
        club_id,
        turno:turno_id (
          empleado:empleado_id ( nombre )
        )
      )
    `)
    .eq('cajas.club_id', clubId)
    .gte('created_at', desde)
    .lte('created_at', hasta)
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((m) => {
    const caja = m.cajas as unknown as { turno: { empleado: { nombre: string } | null } | null } | null
    return {
      id: m.id,
      tipo: m.tipo as MovimientoCajaHistorial['tipo'],
      concepto: m.concepto as string,
      monto: m.monto as number,
      cajero_nombre: caja?.turno?.empleado?.nombre ?? null,
      created_at: m.created_at as string,
    }
  })
}

export async function getKPIsHistorial(
  supabase: SupabaseClient,
  clubId: string,
  desde: string,
  hasta: string,
): Promise<KPIsHistorial> {
  const [ventas, canchas, movimientos] = await Promise.all([
    getHistorialVentas(supabase, clubId, desde, hasta),
    getHistorialCanchas(supabase, clubId, desde, hasta),
    getHistorialMovimientos(supabase, clubId, desde, hasta),
  ])

  const totalVentas = ventas.reduce((s, v) => s + v.total, 0)
  const totalCanchas = canchas.reduce((s, c) => s + c.precio, 0)

  const netoCaja = movimientos.reduce((s, m) => {
    if (m.tipo === 'ingreso' || m.tipo === 'fondo') return s + m.monto
    return s - m.monto
  }, 0)

  return {
    totalVentas,
    countVentas: ventas.length,
    totalCanchas,
    countCanchas: canchas.length,
    netoCaja,
    countMovimientos: movimientos.length,
    totalIngresos: totalVentas + totalCanchas,
  }
}

export async function getReembolsosPeriodo(
  supabase: SupabaseClient,
  clubId: string,
  desde: string,
  hasta: string,
): Promise<number> {
  const { data, error } = await supabase.rpc('rpc_get_reembolsos_periodo', {
    p_club_id: clubId,
    p_desde: desde,
    p_hasta: hasta,
  })
  if (error) throw error
  return (data as number) ?? 0
}
