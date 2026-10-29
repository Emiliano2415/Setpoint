'use client'

import type {
  IndicadoresResultado,
  OrdenTrabajo,
  PistaMantenimiento,
  PuntoSerieDiaria,
  TareaPreventiva,
} from '@/lib/supabase/queries/mantenimiento'
import type { MantenimientoTab, PeriodoDias } from './types'

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

export function TableroMantenimiento(props: TableroMantenimientoProps) {
  const g = props.indicadores?.global
  return (
    <div>
      <div>Pendiente: Tablero de indicadores {props.loading ? '(cargando)' : ''}</div>
      <div>Periodo: últimos {props.periodoDias} días</div>
      {g ? (
        <ul>
          <li>Ocupación: {g.ocupacion_pct ?? '—'} %</li>
          <li>Disponibilidad: {g.disponibilidad_pct ?? '—'} %</li>
          <li>Fallas: {g.fallas}</li>
          <li>MTBF: {g.mtbf_h ?? '—'} h</li>
          <li>MTTR: {g.mttr_h ?? '—'} h</li>
          <li>Costo de mantenimiento: {g.costo_mantenimiento}</li>
          <li>Horas de juego: {g.horas_juego}</li>
          <li>Costo por hora de juego: {g.costo_por_hora_juego ?? '—'}</li>
        </ul>
      ) : null}
      <div>Pistas</div>
      <ul>
        {props.pistas.map((p) => (
          <li key={p.pista_id}>
            {p.nombre} · {p.estado_operativo} · órdenes abiertas {p.ordenes_abiertas}
          </li>
        ))}
      </ul>
      <div>Serie diaria: {props.serie.length} días</div>
      <div>Órdenes abiertas</div>
      <ul>
        {props.ordenesAbiertas.map((o) => (
          <li key={o.id}>
            {o.folio} · {o.pista_nombre ?? 'General'} · {o.descripcion} · {o.estado}
          </li>
        ))}
      </ul>
      <div>Tareas por vencer</div>
      <ul>
        {props.tareasPorVencer.map((t) => (
          <li key={t.id}>
            {t.nombre} · {t.estado} · {t.proxima_fecha ?? `${t.uso_acumulado_h} h de uso`}
          </li>
        ))}
      </ul>
    </div>
  )
}
