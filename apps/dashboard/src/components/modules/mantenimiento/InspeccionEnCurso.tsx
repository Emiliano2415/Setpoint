'use client'

import type {
  FinalizarInspeccionResultado,
  InspeccionDetalle,
  ResultadoPuntoInput,
} from '@/lib/supabase/queries/mantenimiento'

// Stitch: Inspección en curso (ef6bce8cc41a46fdad65177ded10acbc)
export interface InspeccionEnCursoProps {
  loading: boolean
  /** La inspección con sus puntos; null mientras carga */
  detalle: InspeccionDetalle | null
  /** Vuelve a la pestaña Inspecciones */
  onVolver: () => void
  /**
   * Guarda (sin finalizar) los puntos indicados; solo cambia los campos que se mandan.
   * Llamar al marcar cada punto o con "Guardar borrador". true = guardado.
   */
  onGuardarResultados: (resultados: ResultadoPuntoInput[]) => Promise<boolean>
  /**
   * Finaliza: exige todos los puntos evaluados y crea una orden correctiva por cada "no cumple".
   * Devuelve null si falló (p. ej. faltan puntos; el error ya se mostró).
   */
  onFinalizar: () => Promise<FinalizarInspeccionResultado | null>
}

export function InspeccionEnCurso(props: InspeccionEnCursoProps) {
  const d = props.detalle
  return (
    <div>
      <div>Pendiente: Inspección en curso {props.loading ? '(cargando)' : ''}</div>
      {d ? (
        <>
          <div>
            {d.inspeccion.norma_codigo} · {d.inspeccion.fecha} · {d.inspeccion.estado} ·{' '}
            {d.inspeccion.responsable_nombre ?? '—'}
          </div>
          <ul>
            {d.puntos.map((p) => (
              <li key={p.punto_id}>
                {p.orden}. {p.descripcion} · {p.resultado ?? 'sin evaluar'} · {p.observacion ?? ''}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  )
}
