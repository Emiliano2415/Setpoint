'use client'

import type {
  BloqueoPista,
  FichaPistaPatch,
  IndicadoresPista,
  OrdenTrabajo,
  PistaMantenimiento,
  TareaPreventiva,
} from '@/lib/supabase/queries/mantenimiento'

// Stitch: Ficha técnica de pista (920ef650b56c4c8993488484abc301f5)
export interface FichaPistaProps {
  pista: PistaMantenimiento
  /** Indicadores de ESTA pista en el periodo (null mientras carga o sin datos) */
  indicadores: IndicadoresPista | null
  periodoDias: number
  /** Órdenes de la pista, más recientes primero (abiertas y cerradas) */
  ordenes: OrdenTrabajo[]
  /** Bloqueos vigentes o programados de la pista */
  bloqueos: BloqueoPista[]
  /** Tareas preventivas que aplican a la pista */
  tareas: TareaPreventiva[]
  onVolver: () => void
  /** Guarda los datos de la ficha. true = guardado */
  onGuardarFicha: (patch: FichaPistaPatch) => Promise<boolean>
  /** Abre "Reportar falla" con esta pista preseleccionada */
  onReportarFalla: () => void
  onIniciarOrden: (ordenId: string) => Promise<boolean>
  /** Abre el panel "Cerrar orden" de la orden */
  onCerrarOrden: (orden: OrdenTrabajo) => void
  /** Cierra los bloqueos vigentes y deja la pista operativa. true = hecho */
  onLiberarPista: () => Promise<boolean>
}

export function FichaPista(props: FichaPistaProps) {
  const p = props.pista
  return (
    <div>
      <div>Pendiente: Ficha técnica de pista</div>
      <ul>
        <li>
          {p.nombre} ({p.tipo}) · {p.estado_operativo}
        </li>
        <li>
          Dimensiones: {p.largo_m} x {p.ancho_m} m, altura libre {p.altura_libre_m} m
        </li>
        <li>
          Superficie: {p.superficie} (instalada {p.superficie_instalada_en})
        </li>
        <li>Cerramiento: {p.cerramiento}</li>
        <li>
          Luminarias: {p.luminarias_num} x {p.luminaria_potencia_w} W
        </li>
        <li>
          Lux medido: {p.lux_medido} · uniformidad {p.uniformidad} · medido {p.medicion_en}
        </li>
        <li>Nota: {p.nota_mantenimiento ?? '—'}</li>
      </ul>
      {props.indicadores ? (
        <div>
          Disponibilidad {props.indicadores.disponibilidad_pct ?? '—'} % · MTBF {props.indicadores.mtbf_h ?? '—'} h · MTTR{' '}
          {props.indicadores.mttr_h ?? '—'} h · costo {props.indicadores.costo_mantenimiento}
        </div>
      ) : null}
      <div>Bloqueos: {props.bloqueos.length}</div>
      <ul>
        {props.ordenes.map((o) => (
          <li key={o.id}>
            {o.folio} · {o.tipo} · {o.estado} · {o.descripcion}
          </li>
        ))}
      </ul>
      <div>Tareas que aplican: {props.tareas.map((t) => t.nombre).join(', ')}</div>
    </div>
  )
}
