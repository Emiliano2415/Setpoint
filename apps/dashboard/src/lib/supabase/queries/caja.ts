import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ───────────────────────────────────────────────────────────────────

export type CajaEstado = 'abierta' | 'cerrada' | 'revisada'
export type MovimientoTipo = 'ingreso' | 'egreso' | 'fondo' | 'retiro'
export type MovimientoCategoria =
  | 'fondo_inicial'
  | 'venta'
  | 'cancha'
  | 'reembolso'
  | 'retiro'
  | 'petty_cash'
  | 'propina'
  | 'ajuste'
  | 'otro'
export type MetodoPago = 'efectivo' | 'credito' | 'debito' | 'cuenta_cliente' | 'bono' | 'cortesia'

export interface CajaActiva {
  id: string
  club_id: string
  turno_id: string
  fondo_inicial: number
  estado: CajaEstado
  total_efectivo: number | null
  total_tarjeta: number | null
  total_propinas: number | null
  diferencia: number | null
  created_at: string
  turno: {
    inicio: string
    empleado: { nombre: string } | null
  } | null
}

export interface CajaStats {
  totalVentas: number
  totalEfectivo: number
  totalTarjeta: number
  totalPropinas: number
  totalEgresos: number
  countEfectivo: number
  countTarjeta: number
}

export interface MovimientoCaja {
  id: string
  caja_id: string
  tipo: MovimientoTipo
  concepto: string
  monto: number
  metodo: MetodoPago | null
  categoria: MovimientoCategoria | null
  created_at: string
}

export interface InsertMovimientoData {
  caja_id: string
  tipo: MovimientoTipo
  concepto: string
  monto: number
  metodo?: MetodoPago | null
  categoria?: MovimientoCategoria | null
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function getCajaActiva(
  supabase: SupabaseClient,
  clubId: string,
): Promise<CajaActiva | null> {
  const { data, error } = await supabase
    .from('cajas')
    .select('*, turno:turno_id(inicio, empleado:empleado_id(nombre))')
    .eq('club_id', clubId)
    .eq('estado', 'abierta')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data as CajaActiva | null
}

export async function getCajaStats(
  supabase: SupabaseClient,
  cajaId: string,
): Promise<CajaStats> {
  const { data, error } = await supabase
    .from('movimientos_caja')
    .select('tipo, monto, metodo, concepto')
    .eq('caja_id', cajaId)

  if (error) throw error

  const movs = (data ?? []) as { tipo: MovimientoTipo; monto: number; metodo: MetodoPago | null; concepto: string }[]

  let totalEfectivo = 0
  let totalTarjeta = 0
  let totalPropinas = 0
  let totalEgresos = 0
  let countEfectivo = 0
  let countTarjeta = 0

  for (const m of movs) {
    if (m.tipo === 'egreso') {
      totalEgresos += m.monto
      continue
    }
    if (m.tipo !== 'ingreso') continue

    const esPropina = m.concepto.toLowerCase().includes('propina')
    if (esPropina) {
      totalPropinas += m.monto
      continue
    }

    if (m.metodo === 'efectivo') {
      totalEfectivo += m.monto
      countEfectivo++
    } else if (m.metodo === 'credito' || m.metodo === 'debito') {
      totalTarjeta += m.monto
      countTarjeta++
    }
  }

  return {
    totalVentas: totalEfectivo + totalTarjeta,
    totalEfectivo,
    totalTarjeta,
    totalPropinas,
    totalEgresos,
    countEfectivo,
    countTarjeta,
  }
}

export async function getMovimientosCaja(
  supabase: SupabaseClient,
  cajaId: string,
): Promise<MovimientoCaja[]> {
  const { data, error } = await supabase
    .from('movimientos_caja')
    .select('*')
    .eq('caja_id', cajaId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as MovimientoCaja[]
}

export async function closeCaja(
  supabase: SupabaseClient,
  cajaId: string,
  turnoId: string,
  contado: number,
  esperado: number,
): Promise<void> {
  const { error } = await supabase.rpc('rpc_close_caja', {
    p_caja_id: cajaId,
    p_turno_id: turnoId,
    p_contado: contado,
    p_esperado: esperado,
  })
  if (error) throw error
}

export interface CajaCierre {
  id: string
  fondo_inicial: number
  estado: CajaEstado
  total_efectivo: number | null
  total_tarjeta: number | null
  diferencia: number | null
  created_at: string
  turno: {
    inicio: string
    fin: string | null
    empleado: { nombre: string } | null
  } | null
}

export async function getCierresCaja(
  supabase: SupabaseClient,
  clubId: string,
  limit = 30,
): Promise<CajaCierre[]> {
  const { data, error } = await supabase
    .from('cajas')
    .select('id, fondo_inicial, estado, total_efectivo, total_tarjeta, diferencia, created_at, turno:turno_id(inicio, fin, empleado:empleado_id(nombre))')
    .eq('club_id', clubId)
    .neq('estado', 'abierta')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data ?? []) as unknown as CajaCierre[]
}

export interface EmpleadoBasic {
  id: string
  nombre: string
}

export async function getEmpleadosActivos(
  supabase: SupabaseClient,
  clubId: string,
): Promise<EmpleadoBasic[]> {
  const { data, error } = await supabase
    .from('empleados')
    .select('id, nombre')
    .eq('club_id', clubId)
    .eq('activo', true)
    .order('nombre')
  if (error) throw error
  return (data ?? []) as EmpleadoBasic[]
}

export interface OpenCajaResult {
  cajaId: string
  turnoId: string
}

export async function openCaja(
  supabase: SupabaseClient,
  clubId: string,
  empleadoId: string,
  tipo: string,
  fondoInicial: number,
  notas?: string,
): Promise<OpenCajaResult> {
  const { data, error } = await supabase.rpc('rpc_open_caja', {
    p_club_id: clubId,
    p_empleado_id: empleadoId,
    p_tipo: tipo,
    p_fondo: fondoInicial,
    p_notas: notas ?? 'Fondo inicial de turno',
  })
  if (error) throw error
  const result = data as { cajaId: string; turnoId: string }
  return { cajaId: result.cajaId, turnoId: result.turnoId }
}

export async function insertCorteParcial(
  supabase: SupabaseClient,
  cajaId: string,
  montoRetiro: number,
  concepto: string,
): Promise<MovimientoCaja> {
  const { data, error } = await supabase
    .from('movimientos_caja')
    .insert({
      caja_id: cajaId,
      tipo: 'retiro' as MovimientoTipo,
      concepto,
      monto: montoRetiro,
    })
    .select()
    .single()
  if (error) throw error
  return data as MovimientoCaja
}

export async function insertMovimientoCaja(
  supabase: SupabaseClient,
  data: InsertMovimientoData,
): Promise<MovimientoCaja> {
  const { data: created, error } = await supabase
    .from('movimientos_caja')
    .insert(data)
    .select()
    .single()

  if (error) throw error
  return created as MovimientoCaja
}
