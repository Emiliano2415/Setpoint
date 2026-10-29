'use client'

import { Activity, CalendarCheck, CalendarClock, CircleDashed, ClipboardList, Plus, Wrench } from 'lucide-react'
import { Badge, Button, Card, EmptyState, Money, SegmentedControl, Skeleton, StatCard } from '@/components/ds'
import { fmtMXN } from '@/lib/format'
import {
  ESTADO_ORDEN_LABEL,
  ESTADO_PISTA_LABEL,
  ESTADO_TAREA_LABEL,
  PRIORIDADES,
  type EstadoPista,
  type EstadoTarea,
  type IndicadoresResultado,
  type OrdenTrabajo,
  type PistaMantenimiento,
  type PuntoSerieDiaria,
  type TareaPreventiva,
} from '@/lib/supabase/queries/mantenimiento'
import { PERIODOS_DIAS, type MantenimientoTab, type PeriodoDias } from './types'

// Stitch: Tablero de indicadores (320be25ae6354cd58ea9bd710d1b2947)
export interface TableroMantenimientoProps {
  loading: boolean
  /** Pistas activas con su estado (tarjetas / mapa de pistas) */
  pistas: PistaMantenimiento[]
  /** Indicadores del periodo: por pista y global. null mientras carga */
  indicadores: IndicadoresResultado | null
  /** Ocupación y disponibilidad por día, para la gráfica */
  serie: PuntoSerieDiaria[]
  /** Órdenes abiertas y en proceso, más recientes primero */
  ordenesAbiertas: OrdenTrabajo[]
  /** Tareas preventivas vencidas o próximas a vencer */
  tareasPorVencer: TareaPreventiva[]
  periodoDias: PeriodoDias
  onCambiarPeriodo: (dias: PeriodoDias) => void
  /** Abre la ficha técnica de la pista */
  onAbrirPista: (pistaId: string) => void
  /** Abre el modal "Reportar falla" (con la pista preseleccionada si se manda) */
  onReportarFalla: (pistaId?: string) => void
  /** Cambia de pestaña (p. ej. "Ver todas las órdenes") */
  onIrA: (tab: MantenimientoTab) => void
}

const TONO_PISTA: Record<EstadoPista, 'success' | 'warning' | 'error'> = {
  operativa: 'success',
  mantenimiento: 'warning',
  fuera_de_servicio: 'error',
}

const TONO_TAREA: Record<EstadoTarea, 'success' | 'warning' | 'error'> = {
  vencida: 'error',
  proxima: 'warning',
  al_dia: 'success',
}

const TONO_PRIORIDAD: Record<OrdenTrabajo['prioridad'], 'neutral' | 'warning' | 'error'> = {
  baja: 'neutral',
  media: 'warning',
  alta: 'error',
}

const numero = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 })

function fmtNum(n: number | null | undefined): string {
  return n == null ? '—' : numero.format(n)
}

function fmtPct(n: number | null | undefined): string {
  return n == null ? '—' : `${numero.format(n)}%`
}

function fmtHoras(n: number | null | undefined): string {
  return n == null ? '—' : `${numero.format(n)} h`
}

/** 'YYYY-MM-DD' como fecha local (sin desfase de zona horaria); un timestamp completo, tal cual. */
function fechaLocal(fecha: string): Date {
  if (fecha.length > 10) return new Date(fecha)
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function fechaCorta(ymd: string): string {
  return fechaLocal(ymd).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

function etiquetaPrioridad(valor: OrdenTrabajo['prioridad']): string {
  return PRIORIDADES.find((p) => p.value === valor)?.label ?? valor
}

/** Ancho de la barra en %, acotado; sin dato = barra vacía. */
function anchoBarra(pct: number | null): number {
  return pct == null ? 0 : Math.min(100, Math.max(0, pct))
}

/** Pistas a las que aplica una tarea, para la lista de preventivos. */
function alcance(t: TareaPreventiva, pistas: PistaMantenimiento[]): string {
  if (t.aplica_todas) return 'Todas las pistas'
  const nombres = pistas.filter((p) => t.pista_ids.includes(p.pista_id)).map((p) => p.nombre)
  return nombres.length > 0 ? nombres.join(', ') : `${t.pista_ids.length} pistas`
}

/** Cuándo vence: fecha en frecuencias de calendario; horas acumuladas en horas de uso. */
function cuandoTarea(t: TareaPreventiva): string {
  if (t.frecuencia_tipo === 'horas_uso') {
    return `${fmtNum(t.uso_acumulado_h)} de ${fmtNum(t.frecuencia_valor)} h de uso`
  }
  return t.proxima_fecha ? fechaCorta(t.proxima_fecha) : 'Sin fecha'
}

// Geometría de la gráfica (unidades del viewBox)
const W = 600
const H = 150
const PAD_L = 30
const PAD_R = 10
const PAD_T = 10
const PAD_B = 22

type Punto = { x: number; y: number }

function yDe(pct: number): number {
  const acotado = Math.min(100, Math.max(0, pct))
  return PAD_T + (1 - acotado / 100) * (H - PAD_T - PAD_B)
}

function xDe(i: number, n: number): number {
  return n <= 1 ? W / 2 : PAD_L + (i * (W - PAD_L - PAD_R)) / (n - 1)
}

/** Curva suave (Bézier cúbica con tangentes horizontales). Un punto nulo corta la línea. */
function trazar(puntos: (Punto | null)[]): string {
  let d = ''
  for (let i = 0; i < puntos.length; i++) {
    const p = puntos[i]
    if (!p) continue
    const previo = i > 0 ? puntos[i - 1] : null
    if (previo) {
      const cx = (previo.x + p.x) / 2
      d += ` C${cx} ${previo.y} ${cx} ${p.y} ${p.x} ${p.y}`
    } else {
      d += ` M${p.x} ${p.y}`
    }
  }
  return d.trim()
}

/** Filas de carga mientras llegan los datos. */
function Cargando() {
  return (
    <div className="space-y-2.5">
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
    </div>
  )
}

/** Curva de ocupación (sólida, con puntos) y disponibilidad (punteada) por día. */
function CurvaDiaria({ serie }: { serie: PuntoSerieDiaria[] }) {
  const n = serie.length
  const ocupacion = serie.map((s, i) => (s.ocupacion_pct == null ? null : { x: xDe(i, n), y: yDe(s.ocupacion_pct) }))
  const disponibilidad = serie.map((s, i) =>
    s.disponibilidad_pct == null ? null : { x: xDe(i, n), y: yDe(s.disponibilidad_pct) },
  )
  const paso = Math.max(1, Math.ceil(n / 6))
  const indicesEtiqueta = serie
    .map((_, i) => i)
    .filter((i) => i === n - 1 || (i % paso === 0 && n - 1 - i >= paso / 2))
  const radio = n > 31 ? 2 : 3.5

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Ocupación y disponibilidad por día">
      {[0, 50, 100].map((v) => (
        <g key={v}>
          <line
            x1={PAD_L}
            x2={W - PAD_R}
            y1={yDe(v)}
            y2={yDe(v)}
            strokeDasharray="3 3"
            strokeWidth={1}
            className="stroke-outline-variant"
          />
          <text x={0} y={yDe(v) + 3} fontSize={10} className="fill-on-surface-variant">
            {v}%
          </text>
        </g>
      ))}

      <path
        d={trazar(disponibilidad)}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeDasharray="4 4"
        strokeLinecap="round"
        className="text-on-surface-variant"
      />

      <g className="text-primary">
        <path d={trazar(ocupacion)} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
        {serie.map((s, i) => {
          const p = ocupacion[i]
          return p ? (
            <circle key={s.dia} cx={p.x} cy={p.y} r={radio} stroke="currentColor" strokeWidth={1.5} className="fill-surface">
              <title>{`${fechaCorta(s.dia)}: ${fmtPct(s.ocupacion_pct)}`}</title>
            </circle>
          ) : null
        })}
      </g>

      {indicesEtiqueta.map((i) => (
        <text
          key={serie[i].dia}
          x={xDe(i, n)}
          y={H - 6}
          fontSize={10}
          textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
          className="fill-on-surface-variant"
        >
          {fechaCorta(serie[i].dia)}
        </text>
      ))}
    </svg>
  )
}

export function TableroMantenimiento(props: TableroMantenimientoProps) {
  const g = props.indicadores?.global
  const ocupacionPorPista = new Map<string | null, number | null>(
    (props.indicadores?.porPista ?? []).map((i) => [i.pista_id, i.ocupacion_pct]),
  )

  return (
    <div className="space-y-5">
      {/* Periodo y acción principal */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          label="Periodo del tablero"
          value={String(props.periodoDias)}
          onChange={(v) => props.onCambiarPeriodo(Number(v) as PeriodoDias)}
          options={PERIODOS_DIAS.map((d) => ({ value: String(d), label: `${d} días` }))}
        />
        <Button variant="primary" size="sm" onClick={() => props.onReportarFalla()}>
          <Plus className="size-3.5" aria-hidden="true" />
          Reportar falla
        </Button>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-5">
        {g ? (
          <>
            <StatCard label="Ocupación" value={fmtPct(g.ocupacion_pct)} hint="Horas reservadas / horas disponibles" />
            <StatCard
              label="Disponibilidad"
              value={fmtPct(g.disponibilidad_pct)}
              hint="Horas operables / horas disponibles"
            />
            <StatCard
              label="MTBF"
              value={fmtHoras(g.mtbf_h)}
              hint={`Tiempo medio entre fallas (${g.fallas} fallas)`}
            />
            <StatCard label="MTTR" value={fmtHoras(g.mttr_h)} hint="Tiempo medio de reparación" />
            <StatCard
              label="Costo por hora de juego"
              value={g.costo_por_hora_juego == null ? '—' : <Money value={g.costo_por_hora_juego} />}
              hint={`${fmtMXN(g.costo_mantenimiento)} de mantenimiento en ${fmtNum(g.horas_juego)} h de juego`}
            />
          </>
        ) : props.loading ? (
          [0, 1, 2, 3, 4].map((k) => <Skeleton key={k} className="h-28" />)
        ) : (
          <div className="col-span-full">
            <EmptyState icon={<Activity />} title="No hay indicadores para este periodo" />
          </div>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-12 lg:items-start">
        {/* Columna principal */}
        <div className="space-y-5 lg:col-span-7">
          <Card padding="lg">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold tracking-tight text-on-surface">Ocupación por pista</h2>
                <p className="text-xs text-on-surface-variant">Horas reservadas sobre horas disponibles del periodo</p>
              </div>
              <span className="shrink-0 text-xs font-medium tabular-nums text-on-surface-variant">
                Promedio: {fmtPct(g?.ocupacion_pct)}
              </span>
            </div>

            {!props.indicadores ? (
              props.loading ? (
                <Cargando />
              ) : (
                <EmptyState icon={<Activity />} title="No hay datos del periodo" />
              )
            ) : props.pistas.length === 0 ? (
              <EmptyState icon={<CircleDashed />} title="No hay pistas activas" />
            ) : (
              <ul className="space-y-3">
                {props.pistas.map((p) => {
                  const pct = ocupacionPorPista.get(p.pista_id) ?? null
                  return (
                    <li key={p.pista_id}>
                      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                        <div className="flex min-w-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={() => props.onAbrirPista(p.pista_id)}
                            className="truncate font-medium text-on-surface hover:text-primary hover:underline"
                          >
                            {p.nombre}
                          </button>
                          <Badge tone={TONO_PISTA[p.estado_operativo]}>{ESTADO_PISTA_LABEL[p.estado_operativo]}</Badge>
                        </div>
                        <span className="shrink-0 font-semibold tabular-nums text-primary">{fmtPct(pct)}</span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full border border-outline-variant/60 bg-surface-container">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${anchoBarra(pct)}%` }} />
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}

            {g ? (
              <p className="mt-4 border-t border-outline-variant pt-3 text-xs tabular-nums text-on-surface-variant">
                {fmtNum(g.horas_reservadas)} h reservadas de {fmtNum(g.horas_disponibles)} h disponibles
              </p>
            ) : null}
          </Card>

          <Card padding="lg">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold tracking-tight text-on-surface">Ocupación y disponibilidad por día</h2>
                <p className="text-xs text-on-surface-variant">Últimos {props.periodoDias} días</p>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-xs text-on-surface-variant">
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-0.5 w-3 rounded-full bg-primary" />
                  Ocupación
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className="w-3 border-t border-dashed border-on-surface-variant" />
                  Disponibilidad
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-outline-variant/60 bg-surface-container/50 p-3">
              {props.serie.length > 0 ? (
                <CurvaDiaria serie={props.serie} />
              ) : props.loading ? (
                <Skeleton className="h-36 w-full" />
              ) : (
                <EmptyState icon={<Activity />} title="Sin días con datos en el periodo" />
              )}
            </div>

            {g ? (
              <p className="mt-3 text-xs tabular-nums text-on-surface-variant">
                {fmtNum(g.horas_fuera_servicio)} h fuera de servicio en el periodo
              </p>
            ) : null}
          </Card>
        </div>

        {/* Columna lateral */}
        <div className="space-y-4 lg:col-span-5">
          <Card>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-on-surface">
                <CalendarClock className="size-4 text-primary" aria-hidden="true" />
                Preventivos por vencer
              </h2>
              <button
                type="button"
                onClick={() => props.onIrA('preventivo')}
                className="text-xs font-medium text-primary hover:underline"
              >
                Ver plan
              </button>
            </div>

            {props.tareasPorVencer.length > 0 ? (
              <ul className="divide-y divide-outline-variant">
                {props.tareasPorVencer.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-on-surface">{t.nombre}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-on-surface-variant">
                        <span className="truncate">{alcance(t, props.pistas)}</span>
                        <span aria-hidden="true">·</span>
                        <span className="shrink-0 tabular-nums">{cuandoTarea(t)}</span>
                      </p>
                    </div>
                    <Badge tone={TONO_TAREA[t.estado]}>{ESTADO_TAREA_LABEL[t.estado]}</Badge>
                  </li>
                ))}
              </ul>
            ) : props.loading ? (
              <Cargando />
            ) : (
              <EmptyState icon={<CalendarCheck />} title="Sin preventivos por vencer" />
            )}
          </Card>

          <Card>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-on-surface">
                <Wrench className="size-4 text-on-surface" aria-hidden="true" />
                Órdenes abiertas
              </h2>
              <div className="flex items-center gap-3">
                <span className="text-xs tabular-nums text-on-surface-variant">
                  {props.ordenesAbiertas.length} pendientes
                </span>
                <button
                  type="button"
                  onClick={() => props.onIrA('ordenes')}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Ver todas
                </button>
              </div>
            </div>

            {props.ordenesAbiertas.length > 0 ? (
              <ul className="space-y-2">
                {props.ordenesAbiertas.slice(0, 5).map((o) => (
                  <li
                    key={o.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-outline-variant/80 bg-surface-container p-2.5"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="shrink-0 font-mono font-semibold text-on-surface">{o.folio}</span>
                        <span className="truncate text-on-surface-variant">
                          {o.pista_nombre ?? 'General'} · {ESTADO_ORDEN_LABEL[o.estado]}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs font-medium text-on-surface">{o.descripcion}</p>
                    </div>
                    <Badge tone={TONO_PRIORIDAD[o.prioridad]}>{etiquetaPrioridad(o.prioridad)}</Badge>
                  </li>
                ))}
              </ul>
            ) : props.loading ? (
              <Cargando />
            ) : (
              <EmptyState icon={<ClipboardList />} title="Sin órdenes abiertas" />
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
