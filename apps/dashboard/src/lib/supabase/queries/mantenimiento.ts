import type { SupabaseClient } from '@/lib/supabase/client'
import { localDayStart, localDayEnd } from '@/lib/format'

// Módulo de Mantenimiento (Ingeniería de Planta). Esquema y fórmulas de los
// indicadores: supabase/migrations/20261029000003_mantenimiento.sql.
// Las lecturas van contra vistas (v_*) que ya traen los nombres resueltos y
// los cálculos; las escrituras que tocan varias tablas van por RPC.
// Todas las funciones lanzan el error de la Data API si algo falla: usa
// `mensajeError(e)` para mostrarlo.

// ─── Tipos base ──────────────────────────────────────────────────────────────

export type EstadoPista = 'operativa' | 'fuera_de_servicio' | 'mantenimiento'
export type Componente = 'iluminacion' | 'cristal' | 'superficie' | 'red' | 'puerta' | 'estructura' | 'otro'
export type Prioridad = 'baja' | 'media' | 'alta'
export type OrdenTipo = 'preventiva' | 'correctiva'
export type OrdenEstado = 'abierta' | 'en_proceso' | 'cerrada'
export type FrecuenciaTipo = 'dias' | 'semanas' | 'meses' | 'horas_uso'
/** vencida: avance >= 100 %; proxima: >= 80 %; al_dia: el resto */
export type EstadoTarea = 'vencida' | 'proxima' | 'al_dia'
export type ResultadoPunto = 'cumple' | 'no_cumple' | 'na'
export type InspeccionEstado = 'borrador' | 'finalizada'
export type EstadoNorma = 'sin_inspeccion' | 'vencida' | 'proxima' | 'al_dia'
export type EstadoReorden = 'Pedir' | 'OK'

export const COMPONENTES: { value: Componente; label: string }[] = [
  { value: 'iluminacion', label: 'Iluminación' },
  { value: 'cristal', label: 'Cristal' },
  { value: 'superficie', label: 'Superficie' },
  { value: 'red', label: 'Red' },
  { value: 'puerta', label: 'Puerta' },
  { value: 'estructura', label: 'Estructura' },
  { value: 'otro', label: 'Otro' },
]
export const PRIORIDADES: { value: Prioridad; label: string }[] = [
  { value: 'baja', label: 'Baja' },
  { value: 'media', label: 'Media' },
  { value: 'alta', label: 'Alta' },
]
export const ESTADO_PISTA_LABEL: Record<EstadoPista, string> = {
  operativa: 'Operativa',
  fuera_de_servicio: 'Fuera de servicio',
  mantenimiento: 'En mantenimiento',
}
export const ESTADO_ORDEN_LABEL: Record<OrdenEstado, string> = {
  abierta: 'Abierta',
  en_proceso: 'En proceso',
  cerrada: 'Cerrada',
}
export const ESTADO_TAREA_LABEL: Record<EstadoTarea, string> = {
  vencida: 'Vencida',
  proxima: 'Próxima',
  al_dia: 'Al día',
}
export const ESTADO_NORMA_LABEL: Record<EstadoNorma, string> = {
  sin_inspeccion: 'Sin inspección',
  vencida: 'Vencida',
  proxima: 'Próxima',
  al_dia: 'Al día',
}
export const FRECUENCIA_LABEL: Record<FrecuenciaTipo, string> = {
  dias: 'días',
  semanas: 'semanas',
  meses: 'meses',
  horas_uso: 'horas de uso',
}

/** Texto de la frecuencia: "Cada 2 semanas", "Cada 500 horas de uso". */
export function describirFrecuencia(tipo: FrecuenciaTipo, valor: number): string {
  if (valor === 1 && tipo !== 'horas_uso') {
    return { dias: 'Cada día', semanas: 'Cada semana', meses: 'Cada mes' }[tipo as 'dias' | 'semanas' | 'meses']
  }
  return `Cada ${valor} ${FRECUENCIA_LABEL[tipo]}`
}

/** Mensaje legible de cualquier error (PostgrestError no es un Error). */
export function mensajeError(e: unknown, porDefecto = 'No se pudo completar la operación'): string {
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return (e as { message: string }).message || porDefecto
  }
  return porDefecto
}

// ─── Periodos ────────────────────────────────────────────────────────────────

export interface Periodo {
  /** ISO, inicio del primer día local */
  desde: string
  /** ISO, fin del último día local (los indicadores lo recortan a "ahora") */
  hasta: string
}

/** Los últimos `dias` días locales, contando hoy. `periodoUltimosDias(30)` = últimos 30 días. */
export function periodoUltimosDias(dias: number): Periodo {
  const hoy = new Date()
  const ini = new Date(hoy)
  ini.setDate(ini.getDate() - (dias - 1))
  return { desde: localDayStart(ini), hasta: localDayEnd(hoy) }
}

/** Entre dos fechas locales 'YYYY-MM-DD' (ambas incluidas). */
export function periodoEntre(desdeYmd: string, hastaYmd: string): Periodo {
  const [y1, m1, d1] = desdeYmd.split('-').map(Number)
  const [y2, m2, d2] = hastaYmd.split('-').map(Number)
  return { desde: localDayStart(new Date(y1, m1 - 1, d1)), hasta: localDayEnd(new Date(y2, m2 - 1, d2)) }
}

// ─── Indicadores ─────────────────────────────────────────────────────────────

/**
 * Una fila por pista y una global (pista_id = null, pista_nombre 'Todas las pistas', siempre la última).
 * Fórmulas en la migración (sección 10). `null` = no calculable (p. ej. MTBF sin fallas).
 */
export interface IndicadoresPista {
  pista_id: string | null
  pista_nombre: string
  horas_disponibles: number
  horas_reservadas: number
  ocupacion_pct: number | null
  horas_fuera_servicio: number
  disponibilidad_pct: number | null
  fallas: number
  mtbf_h: number | null
  mttr_h: number | null
  costo_mantenimiento: number
  costo_mano_obra: number
  costo_refacciones: number
  horas_juego: number
  costo_por_hora_juego: number | null
}

export interface IndicadoresResultado {
  porPista: IndicadoresPista[]
  global: IndicadoresPista
}

export interface PuntoSerieDiaria {
  dia: string
  horas_disponibles: number
  horas_reservadas: number
  horas_fuera_servicio: number
  ocupacion_pct: number | null
  disponibilidad_pct: number | null
}

export async function getIndicadores(
  supabase: SupabaseClient,
  periodo: Periodo,
  pistaId?: string | null,
): Promise<IndicadoresResultado> {
  const { data, error } = await supabase.rpc('rpc_indicadores_mantenimiento', {
    p_desde: periodo.desde,
    p_hasta: periodo.hasta,
    ...(pistaId ? { p_pista_id: pistaId } : {}),
  })
  if (error) throw error
  const filas = (data ?? []) as IndicadoresPista[]
  const global = filas.find((f) => f.pista_id === null)
  return {
    porPista: filas.filter((f) => f.pista_id !== null),
    global: global ?? filas[filas.length - 1],
  }
}

/** Ocupación y disponibilidad día por día (todas las pistas o una). */
export async function getSerieDiaria(
  supabase: SupabaseClient,
  periodo: Periodo,
  pistaId?: string | null,
): Promise<PuntoSerieDiaria[]> {
  const { data, error } = await supabase.rpc('rpc_serie_diaria_mantenimiento', {
    p_desde: periodo.desde,
    p_hasta: periodo.hasta,
    ...(pistaId ? { p_pista_id: pistaId } : {}),
  })
  if (error) throw error
  return (data ?? []) as PuntoSerieDiaria[]
}

// ─── Pistas y ficha técnica ──────────────────────────────────────────────────

/** Pista con su ficha y estado efectivo (vista v_pistas_mantenimiento). */
export interface PistaMantenimiento {
  pista_id: string
  club_id: string
  nombre: string
  tipo: string
  activa: boolean
  orden: number
  nota_mantenimiento: string | null
  largo_m: number | null
  ancho_m: number | null
  altura_libre_m: number | null
  superficie: string | null
  superficie_instalada_en: string | null
  cerramiento: string | null
  luminarias_num: number | null
  luminaria_potencia_w: number | null
  lux_medido: number | null
  uniformidad: number | null
  medicion_en: string | null
  observaciones: string | null
  estado_operativo: EstadoPista
  ordenes_abiertas: number
  /** Último cierre de una orden preventiva (ISO) */
  ultimo_preventivo: string | null
  /** Inicio del próximo bloqueo programado (ISO) */
  proximo_bloqueo: string | null
}

/** Campos editables de la ficha. El estado operativo no: lo mueven las órdenes y los bloqueos. */
export type FichaPistaPatch = Partial<
  Pick<
    PistaMantenimiento,
    | 'largo_m' | 'ancho_m' | 'altura_libre_m' | 'superficie' | 'superficie_instalada_en' | 'cerramiento'
    | 'luminarias_num' | 'luminaria_potencia_w' | 'lux_medido' | 'uniformidad' | 'medicion_en' | 'observaciones'
  >
>

/** Pistas activas del club con su estado (para el tablero y los selectores de pista). */
export async function getPistasConEstado(supabase: SupabaseClient, clubId: string): Promise<PistaMantenimiento[]> {
  const { data, error } = await supabase
    .from('v_pistas_mantenimiento')
    .select('*')
    .eq('club_id', clubId)
    .eq('activa', true)
    .order('orden', { ascending: true })
  if (error) throw error
  return (data ?? []) as PistaMantenimiento[]
}

export async function getFichaPista(supabase: SupabaseClient, pistaId: string): Promise<PistaMantenimiento | null> {
  const { data, error } = await supabase
    .from('v_pistas_mantenimiento')
    .select('*')
    .eq('pista_id', pistaId)
    .maybeSingle()
  if (error) throw error
  return (data as PistaMantenimiento | null) ?? null
}

export async function updateFichaPista(
  supabase: SupabaseClient,
  pistaId: string,
  patch: FichaPistaPatch,
): Promise<void> {
  const { error } = await supabase
    .from('pista_ficha')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('pista_id', pistaId)
  if (error) throw error
}

export interface BloqueoPista {
  id: string
  pista_id: string
  tipo: 'fuera_de_servicio' | 'preventivo' | 'otro'
  inicio: string
  /** null = abierto, hasta nuevo aviso */
  fin: string | null
  motivo: string
  orden_id: string | null
}

/** Bloqueos que siguen vigentes o están por empezar (fin nulo o futuro), del más próximo al más lejano. */
export async function getBloqueosVigentes(supabase: SupabaseClient, pistaId?: string | null): Promise<BloqueoPista[]> {
  let q = supabase
    .from('bloqueos_pista')
    .select('id, pista_id, tipo, inicio, fin, motivo, orden_id')
    .or(`fin.is.null,fin.gt.${new Date().toISOString()}`)
    .order('inicio', { ascending: true })
  if (pistaId) q = q.eq('pista_id', pistaId)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as BloqueoPista[]
}

// ─── Empleados (responsables) ────────────────────────────────────────────────

export interface EmpleadoOpcion {
  id: string
  nombre: string
  rol: string
}

export async function getEmpleadosOpciones(supabase: SupabaseClient, clubId: string): Promise<EmpleadoOpcion[]> {
  const { data, error } = await supabase
    .from('empleados')
    .select('id, nombre, rol')
    .eq('club_id', clubId)
    .eq('activo', true)
    .order('nombre', { ascending: true })
  if (error) throw error
  return (data ?? []) as EmpleadoOpcion[]
}

// ─── Tareas preventivas ──────────────────────────────────────────────────────

/** Tarea con su próximo vencimiento (vista v_tareas_preventivas). */
export interface TareaPreventiva {
  id: string
  club_id: string
  nombre: string
  descripcion: string | null
  componente: Componente
  aplica_todas: boolean
  pista_ids: string[]
  frecuencia_tipo: FrecuenciaTipo
  frecuencia_valor: number
  duracion_min: number
  bloquea_agenda: boolean
  responsable_id: string | null
  responsable_nombre: string | null
  pasos: string[]
  refacciones: { refaccion_id: string; cantidad: number }[]
  ultima_ejecucion: string | null
  activa: boolean
  /** Solo en frecuencias de calendario (null en horas_uso) */
  proxima_fecha: string | null
  /** Horas de juego de la pista más usada desde la última ejecución (horas_uso) */
  uso_acumulado_h: number
  avance_pct: number | null
  estado: EstadoTarea
  created_at: string
}

export interface NuevaTareaInput {
  nombre: string
  descripcion?: string | null
  componente: Componente
  aplica_todas: boolean
  /** Obligatorio si aplica_todas es false */
  pista_ids?: string[]
  frecuencia_tipo: FrecuenciaTipo
  frecuencia_valor: number
  duracion_min: number
  bloquea_agenda: boolean
  responsable_id?: string | null
  pasos?: string[]
  refacciones?: { refaccion_id: string; cantidad: number }[]
}

export async function getTareas(supabase: SupabaseClient, clubId: string): Promise<TareaPreventiva[]> {
  const { data, error } = await supabase
    .from('v_tareas_preventivas')
    .select('*')
    .eq('club_id', clubId)
    .eq('activa', true)
    .order('avance_pct', { ascending: false, nullsFirst: false })
  if (error) throw error
  return (data ?? []) as TareaPreventiva[]
}

export async function createTarea(
  supabase: SupabaseClient,
  clubId: string,
  input: NuevaTareaInput,
): Promise<string> {
  if (!input.nombre.trim()) throw new Error('Escribe el nombre de la tarea')
  if (!input.aplica_todas && !(input.pista_ids?.length)) throw new Error('Elige al menos una pista')
  if (!(input.frecuencia_valor > 0)) throw new Error('La frecuencia debe ser mayor que cero')
  const { data, error } = await supabase
    .from('tareas_preventivas')
    .insert({
      club_id: clubId,
      nombre: input.nombre.trim(),
      descripcion: input.descripcion ?? null,
      componente: input.componente,
      aplica_todas: input.aplica_todas,
      pista_ids: input.aplica_todas ? [] : (input.pista_ids ?? []),
      frecuencia_tipo: input.frecuencia_tipo,
      frecuencia_valor: input.frecuencia_valor,
      duracion_min: input.duracion_min,
      bloquea_agenda: input.bloquea_agenda,
      responsable_id: input.responsable_id ?? null,
      pasos: input.pasos ?? [],
      refacciones: input.refacciones ?? [],
    })
    .select('id')
    .single()
  if (error) throw error
  return (data as { id: string }).id
}

export async function updateTarea(
  supabase: SupabaseClient,
  tareaId: string,
  patch: Partial<NuevaTareaInput> & { activa?: boolean },
): Promise<void> {
  const cambios: Record<string, unknown> = { ...patch }
  if (patch.aplica_todas) cambios.pista_ids = []
  const { error } = await supabase.from('tareas_preventivas').update(cambios).eq('id', tareaId)
  if (error) throw error
}

/** Quita la tarea del plan (queda inactiva; sus órdenes pasadas se conservan). */
export async function desactivarTarea(supabase: SupabaseClient, tareaId: string): Promise<void> {
  return updateTarea(supabase, tareaId, { activa: false })
}

export interface ProgramarPreventivoInput {
  tareaId: string
  pistaId: string
  /** ISO */
  inicio: string
  /** ISO; por omisión inicio + duración de la tarea */
  fin?: string | null
  responsableId?: string | null
  /** Programar aunque haya reservas en la ventana */
  forzar?: boolean
}

export interface ProgramarPreventivoResultado {
  orden_id: string
  folio: string
  bloqueo_id: string | null
  inicio: string
  fin: string | null
  reservas_en_ventana: number
}

/** Genera la orden preventiva de una tarea y, si bloquea agenda, su bloqueo. */
export async function programarPreventivo(
  supabase: SupabaseClient,
  input: ProgramarPreventivoInput,
): Promise<ProgramarPreventivoResultado> {
  const { data, error } = await supabase.rpc('rpc_programar_preventivo', {
    p_tarea_id: input.tareaId,
    p_pista_id: input.pistaId,
    p_inicio: input.inicio,
    ...(input.fin ? { p_fin: input.fin } : {}),
    ...(input.responsableId ? { p_responsable_id: input.responsableId } : {}),
    p_forzar: input.forzar ?? false,
  })
  if (error) throw error
  return data as ProgramarPreventivoResultado
}

// ─── Órdenes de trabajo ──────────────────────────────────────────────────────

/** Orden con nombres resueltos (vista v_ordenes_trabajo). */
export interface OrdenTrabajo {
  id: string
  club_id: string
  folio: string
  tipo: OrdenTipo
  pista_id: string | null
  pista_nombre: string | null
  componente: Componente
  descripcion: string
  prioridad: Prioridad
  estado: OrdenEstado
  fuera_de_servicio: boolean
  reportada_por: string | null
  reportada_por_nombre: string | null
  responsable_id: string | null
  responsable_nombre: string | null
  reportada_en: string
  programada_para: string | null
  iniciada_en: string | null
  cerrada_en: string | null
  causa: string | null
  accion_realizada: string | null
  costo_mano_obra: number
  costo_refacciones: number
  costo_total: number
  tarea_preventiva_id: string | null
  tarea_nombre: string | null
  inspeccion_id: string | null
  inspeccion_resultado_id: string | null
  norma_codigo: string | null
  /** Horas de reloj entre el reporte y el cierre (solo cerradas) */
  horas_reparacion: number | null
  bloqueo_id: string | null
  created_at: string
}

export interface FiltrosOrdenes {
  estado?: OrdenEstado | OrdenEstado[]
  tipo?: OrdenTipo
  pistaId?: string
  /** Máximo de filas (por omisión 200) */
  limite?: number
}

/** Más recientes primero. Las abiertas y en proceso van antes que las cerradas. */
export async function getOrdenes(
  supabase: SupabaseClient,
  clubId: string,
  filtros: FiltrosOrdenes = {},
): Promise<OrdenTrabajo[]> {
  let q = supabase
    .from('v_ordenes_trabajo')
    .select('*')
    .eq('club_id', clubId)
    .order('reportada_en', { ascending: false })
    .limit(filtros.limite ?? 200)
  if (filtros.estado) {
    q = Array.isArray(filtros.estado) ? q.in('estado', filtros.estado) : q.eq('estado', filtros.estado)
  }
  if (filtros.tipo) q = q.eq('tipo', filtros.tipo)
  if (filtros.pistaId) q = q.eq('pista_id', filtros.pistaId)
  const { data, error } = await q
  if (error) throw error
  const filas = (data ?? []) as OrdenTrabajo[]
  const peso = (o: OrdenTrabajo) => (o.estado === 'cerrada' ? 1 : 0)
  return filas.sort((a, b) => peso(a) - peso(b))
}

export interface SalidaRefaccionOrden {
  id: string
  refaccion_id: string
  nombre: string
  unidad: string
  cantidad: number
  costo_unitario: number
}

/** Refacciones que consumió una orden (para mostrarlas en su detalle). */
export async function getRefaccionesDeOrden(supabase: SupabaseClient, ordenId: string): Promise<SalidaRefaccionOrden[]> {
  const { data: movs, error } = await supabase
    .from('movimientos_refaccion')
    .select('id, refaccion_id, cantidad, costo_unitario')
    .eq('orden_id', ordenId)
    .eq('tipo', 'salida')
  if (error) throw error
  const filas = (movs ?? []) as { id: string; refaccion_id: string; cantidad: number; costo_unitario: number }[]
  if (filas.length === 0) return []
  const { data: refs, error: e2 } = await supabase
    .from('refacciones')
    .select('id, nombre, unidad')
    .in('id', filas.map((f) => f.refaccion_id))
  if (e2) throw e2
  const porId = new Map((refs ?? []).map((r: { id: string; nombre: string; unidad: string }) => [r.id, r]))
  return filas.map((f) => ({
    ...f,
    nombre: porId.get(f.refaccion_id)?.nombre ?? '—',
    unidad: porId.get(f.refaccion_id)?.unidad ?? '',
  }))
}

export interface ReportarFallaInput {
  pistaId: string
  componente: Componente
  descripcion: string
  prioridad: Prioridad
  /** Crea un bloqueo abierto y pone la pista fuera de servicio */
  fueraDeServicio: boolean
}

export interface ReservaAfectada {
  reserva_id: string
  fecha: string
  hora_inicio: string
  hora_fin: string
  cliente: string | null
  estado: string
}

export interface ReportarFallaResultado {
  orden_id: string
  folio: string
  bloqueo_id: string | null
  estado_pista: EstadoPista
  /** Reservas confirmadas o en juego que quedan dentro del bloqueo: hay que atenderlas a mano */
  reservas_afectadas: ReservaAfectada[]
}

export async function reportarFalla(supabase: SupabaseClient, input: ReportarFallaInput): Promise<ReportarFallaResultado> {
  const { data, error } = await supabase.rpc('rpc_reportar_falla', {
    p_pista_id: input.pistaId,
    p_componente: input.componente,
    p_descripcion: input.descripcion,
    p_prioridad: input.prioridad,
    p_fuera_de_servicio: input.fueraDeServicio,
  })
  if (error) throw error
  return data as ReportarFallaResultado
}

export async function iniciarOrden(
  supabase: SupabaseClient,
  ordenId: string,
  responsableId?: string | null,
): Promise<{ orden_id: string; folio: string; estado_pista: EstadoPista | null }> {
  const { data, error } = await supabase.rpc('rpc_iniciar_orden', {
    p_orden_id: ordenId,
    ...(responsableId ? { p_responsable_id: responsableId } : {}),
  })
  if (error) throw error
  return data as { orden_id: string; folio: string; estado_pista: EstadoPista | null }
}

export interface CerrarOrdenInput {
  ordenId: string
  /** Obligatoria en correctivas */
  causa: string
  accion: string
  costoManoObra: number
  refacciones: { refaccion_id: string; cantidad: number }[]
  /** Cierra el bloqueo y devuelve la pista a operativa (salvo otro bloqueo vigente) */
  liberarPista: boolean
}

export interface CerrarOrdenResultado {
  orden_id: string
  folio: string
  costo_mano_obra: number
  costo_refacciones: number
  costo_total: number
  estado_pista: EstadoPista | null
  pista_liberada: boolean
}

export async function cerrarOrden(supabase: SupabaseClient, input: CerrarOrdenInput): Promise<CerrarOrdenResultado> {
  const { data, error } = await supabase.rpc('rpc_cerrar_orden', {
    p_orden_id: input.ordenId,
    p_causa: input.causa,
    p_accion: input.accion,
    p_costo_mano_obra: input.costoManoObra,
    p_refacciones: input.refacciones,
    p_liberar_pista: input.liberarPista,
  })
  if (error) throw error
  return data as CerrarOrdenResultado
}

/** Cierra los bloqueos vigentes de la pista y la deja operativa (cuando se cerró la orden sin liberarla). */
export async function liberarPista(
  supabase: SupabaseClient,
  pistaId: string,
): Promise<{ bloqueos_cerrados: number; estado_pista: EstadoPista }> {
  const { data, error } = await supabase.rpc('rpc_liberar_pista', { p_pista_id: pistaId })
  if (error) throw error
  return data as { bloqueos_cerrados: number; estado_pista: EstadoPista }
}

// ─── Inspecciones ────────────────────────────────────────────────────────────

/** Norma con su última inspección y vencimiento (vista v_normas_resumen). */
export interface NormaResumen {
  norma_id: string
  club_id: string | null
  codigo: string
  nombre: string
  alcance: string | null
  frecuencia_meses: number
  componente: Componente
  puntos: number
  ultima_inspeccion_id: string | null
  ultima_fecha: string | null
  ultimo_cumplimiento_pct: number | null
  proxima_fecha: string | null
  /** Inspección en borrador de esta norma, si hay una en curso */
  borrador_id: string | null
  estado: EstadoNorma
}

/** Inspección con su cumplimiento (vista v_inspecciones). */
export interface InspeccionRow {
  id: string
  club_id: string
  norma_id: string
  norma_codigo: string
  norma_nombre: string
  pista_id: string | null
  pista_nombre: string | null
  fecha: string
  responsable_id: string | null
  responsable_nombre: string | null
  estado: InspeccionEstado
  observaciones: string | null
  finalizada_en: string | null
  created_at: string
  total: number
  cumple: number
  no_cumple: number
  na: number
  pendientes: number
  /** cumple / (cumple + no_cumple); null si aún no hay evaluados */
  cumplimiento_pct: number | null
  ordenes_generadas: number
}

export interface PuntoInspeccion {
  /** id del renglón de resultado */
  resultado_id: string
  punto_id: string
  orden: number
  descripcion: string
  resultado: ResultadoPunto | null
  observacion: string | null
  evidencia_url: string | null
}

export interface InspeccionDetalle {
  inspeccion: InspeccionRow
  puntos: PuntoInspeccion[]
}

export async function getNormasResumen(supabase: SupabaseClient): Promise<NormaResumen[]> {
  const { data, error } = await supabase.from('v_normas_resumen').select('*').order('codigo', { ascending: true })
  if (error) throw error
  return (data ?? []) as NormaResumen[]
}

export async function getInspecciones(
  supabase: SupabaseClient,
  clubId: string,
  filtros: { normaId?: string; estado?: InspeccionEstado; limite?: number } = {},
): Promise<InspeccionRow[]> {
  let q = supabase
    .from('v_inspecciones')
    .select('*')
    .eq('club_id', clubId)
    .order('fecha', { ascending: false })
    .limit(filtros.limite ?? 100)
  if (filtros.normaId) q = q.eq('norma_id', filtros.normaId)
  if (filtros.estado) q = q.eq('estado', filtros.estado)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as InspeccionRow[]
}

export async function getInspeccion(supabase: SupabaseClient, inspeccionId: string): Promise<InspeccionDetalle | null> {
  const { data: insp, error } = await supabase.from('v_inspecciones').select('*').eq('id', inspeccionId).maybeSingle()
  if (error) throw error
  if (!insp) return null
  const { data: res, error: e2 } = await supabase
    .from('inspeccion_resultados')
    .select('id, punto_id, resultado, observacion, evidencia_url')
    .eq('inspeccion_id', inspeccionId)
  if (e2) throw e2
  const filas = (res ?? []) as {
    id: string; punto_id: string; resultado: ResultadoPunto | null; observacion: string | null; evidencia_url: string | null
  }[]
  const { data: pts, error: e3 } = await supabase
    .from('norma_puntos')
    .select('id, orden, descripcion')
    .in('id', filas.map((f) => f.punto_id))
  if (e3) throw e3
  const porId = new Map((pts ?? []).map((p: { id: string; orden: number; descripcion: string }) => [p.id, p]))
  const puntos: PuntoInspeccion[] = filas
    .map((f) => ({
      resultado_id: f.id,
      punto_id: f.punto_id,
      orden: porId.get(f.punto_id)?.orden ?? 0,
      descripcion: porId.get(f.punto_id)?.descripcion ?? '',
      resultado: f.resultado,
      observacion: f.observacion,
      evidencia_url: f.evidencia_url,
    }))
    .sort((a, b) => a.orden - b.orden)
  return { inspeccion: insp as InspeccionRow, puntos }
}

export interface CrearInspeccionInput {
  normaId: string
  /** 'YYYY-MM-DD'; por omisión hoy */
  fecha?: string
  responsableId?: string | null
  /** null = inspección general de instalaciones */
  pistaId?: string | null
  observaciones?: string | null
}

/** Crea la inspección en borrador con un renglón vacío por cada punto de la norma. Devuelve su id. */
export async function crearInspeccion(supabase: SupabaseClient, input: CrearInspeccionInput): Promise<string> {
  const { data, error } = await supabase.rpc('rpc_crear_inspeccion', {
    p_norma_id: input.normaId,
    ...(input.fecha ? { p_fecha: input.fecha } : {}),
    ...(input.responsableId ? { p_responsable_id: input.responsableId } : {}),
    ...(input.pistaId ? { p_pista_id: input.pistaId } : {}),
    ...(input.observaciones ? { p_observaciones: input.observaciones } : {}),
  })
  if (error) throw error
  return (data as { inspeccion_id: string }).inspeccion_id
}

export interface ResultadoPuntoInput {
  punto_id: string
  /** null borra la evaluación */
  resultado?: ResultadoPunto | null
  observacion?: string | null
  evidencia_url?: string | null
}

/** Guarda (sin finalizar) los puntos indicados; solo cambia los campos que vienen. Solo en borrador. */
export async function guardarResultados(
  supabase: SupabaseClient,
  inspeccionId: string,
  resultados: ResultadoPuntoInput[],
): Promise<void> {
  const { error } = await supabase.rpc('rpc_guardar_resultados_inspeccion', {
    p_inspeccion_id: inspeccionId,
    p_resultados: resultados,
  })
  if (error) throw error
}

export interface FinalizarInspeccionResultado {
  inspeccion_id: string
  cumple: number
  no_cumple: number
  cumplimiento_pct: number | null
  /** Una orden correctiva por cada "no cumple" */
  ordenes: { orden_id: string; folio: string }[]
}

/** Exige todos los puntos evaluados; crea una orden correctiva por cada "no cumple". */
export async function finalizarInspeccion(
  supabase: SupabaseClient,
  inspeccionId: string,
): Promise<FinalizarInspeccionResultado> {
  const { data, error } = await supabase.rpc('rpc_finalizar_inspeccion', { p_inspeccion_id: inspeccionId })
  if (error) throw error
  return data as FinalizarInspeccionResultado
}

// ─── Refacciones ─────────────────────────────────────────────────────────────

/**
 * Refacción con punto de reorden (vista v_refacciones):
 *   consumo_diario = salidas de los últimos 90 días / 90
 *   punto_reorden  = consumo_diario x tiempo_entrega_dias + stock_seguridad
 *   estado         = 'Pedir' si existencia <= punto_reorden, si no 'OK'
 */
export interface Refaccion {
  id: string
  club_id: string
  nombre: string
  unidad: string
  existencia: number
  stock_seguridad: number
  tiempo_entrega_dias: number
  costo_unitario: number
  proveedor: string | null
  activa: boolean
  created_at: string
  consumo_diario: number
  punto_reorden: number
  estado: EstadoReorden
  /** Días que alcanza la existencia al ritmo de consumo; null sin consumo */
  cobertura_dias: number | null
  valor_inventario: number
}

export interface NuevaRefaccionInput {
  nombre: string
  unidad: string
  stock_seguridad: number
  tiempo_entrega_dias: number
  costo_unitario: number
  proveedor?: string | null
  /** Si es mayor que cero se registra como una entrada inicial */
  existencia_inicial?: number
}

export async function getRefacciones(supabase: SupabaseClient, clubId: string): Promise<Refaccion[]> {
  const { data, error } = await supabase
    .from('v_refacciones')
    .select('*')
    .eq('club_id', clubId)
    .eq('activa', true)
    .order('nombre', { ascending: true })
  if (error) throw error
  return (data ?? []) as Refaccion[]
}

export async function createRefaccion(
  supabase: SupabaseClient,
  clubId: string,
  input: NuevaRefaccionInput,
): Promise<string> {
  if (!input.nombre.trim()) throw new Error('Escribe el nombre de la refacción')
  const { data, error } = await supabase
    .from('refacciones')
    .insert({
      club_id: clubId,
      nombre: input.nombre.trim(),
      unidad: input.unidad.trim() || 'pza',
      stock_seguridad: input.stock_seguridad,
      tiempo_entrega_dias: input.tiempo_entrega_dias,
      costo_unitario: input.costo_unitario,
      proveedor: input.proveedor ?? null,
    })
    .select('id')
    .single()
  if (error) throw error
  const id = (data as { id: string }).id
  if ((input.existencia_inicial ?? 0) > 0) {
    await registrarEntradaRefaccion(supabase, clubId, { refaccionId: id, cantidad: input.existencia_inicial!, motivo: 'Existencia inicial' })
  }
  return id
}

export interface EntradaRefaccionInput {
  refaccionId: string
  cantidad: number
  /** Costo de esta compra; actualiza el costo unitario de la refacción */
  costoUnitario?: number | null
  motivo?: string | null
}

/** Registra una compra o devolución al almacén. La existencia la actualiza la base. */
export async function registrarEntradaRefaccion(
  supabase: SupabaseClient,
  clubId: string,
  input: EntradaRefaccionInput,
): Promise<void> {
  if (!(input.cantidad > 0)) throw new Error('La cantidad debe ser mayor que cero')
  const { error } = await supabase.from('movimientos_refaccion').insert({
    club_id: clubId,
    refaccion_id: input.refaccionId,
    tipo: 'entrada',
    cantidad: input.cantidad,
    costo_unitario: input.costoUnitario ?? null,
    motivo: input.motivo ?? 'Compra',
  })
  if (error) throw error
}

export interface MovimientoRefaccion {
  id: string
  refaccion_id: string
  tipo: 'entrada' | 'salida'
  cantidad: number
  costo_unitario: number | null
  existencia_posterior: number | null
  orden_id: string | null
  motivo: string | null
  created_at: string
}

export async function getMovimientosRefaccion(
  supabase: SupabaseClient,
  refaccionId: string,
  limite = 50,
): Promise<MovimientoRefaccion[]> {
  const { data, error } = await supabase
    .from('movimientos_refaccion')
    .select('id, refaccion_id, tipo, cantidad, costo_unitario, existencia_posterior, orden_id, motivo, created_at')
    .eq('refaccion_id', refaccionId)
    .order('created_at', { ascending: false })
    .limit(limite)
  if (error) throw error
  return (data ?? []) as MovimientoRefaccion[]
}
