'use client'

import type {
  CrearInspeccionInput,
  EmpleadoOpcion,
  InspeccionRow,
  NormaResumen,
  PistaMantenimiento,
} from '@/lib/supabase/queries/mantenimiento'

// Stitch: Inspecciones por norma (736d01e04de3445d943c32af7b6e8b3e)
export interface InspeccionesProps {
  loading: boolean
  /** Las normas con su última inspección y vencimiento (tarjetas) */
  normas: NormaResumen[]
  /** Historial de inspecciones con su cumplimiento, más recientes primero */
  inspecciones: InspeccionRow[]
  pistas: PistaMantenimiento[]
  empleados: EmpleadoOpcion[]
  /**
   * Crea una inspección en borrador y abre la pantalla "Inspección en curso".
   * Si la norma ya tiene un borrador (`norma.borrador_id`) usar onAbrirInspeccion en su lugar.
   */
  onIniciarInspeccion: (input: CrearInspeccionInput) => Promise<boolean>
  /** Abre una inspección existente (borrador: se continúa; finalizada: solo lectura) */
  onAbrirInspeccion: (inspeccionId: string) => void
}

export function Inspecciones(props: InspeccionesProps) {
  return (
    <div>
      <div>Pendiente: Inspecciones por norma {props.loading ? '(cargando)' : ''}</div>
      <ul>
        {props.normas.map((n) => (
          <li key={n.norma_id}>
            {n.codigo} · {n.nombre} · {n.puntos} puntos · {n.estado} · última {n.ultima_fecha ?? '—'} (
            {n.ultimo_cumplimiento_pct ?? '—'} %) · próxima {n.proxima_fecha ?? '—'}
          </li>
        ))}
      </ul>
      <div>Historial</div>
      <ul>
        {props.inspecciones.map((i) => (
          <li key={i.id}>
            {i.fecha} · {i.norma_codigo} · {i.estado} · cumple {i.cumple}/{i.cumple + i.no_cumple} · {i.cumplimiento_pct ?? '—'} %
          </li>
        ))}
      </ul>
    </div>
  )
}
