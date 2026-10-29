'use client'

import type { EmpleadoOpcion, OrdenTrabajo, PistaMantenimiento } from '@/lib/supabase/queries/mantenimiento'

// Stitch: Órdenes de trabajo (b6ef6f21c22c45d9bb395cd19bb37a65)
export interface OrdenesTrabajoProps {
  loading: boolean
  /** Todas las órdenes cargadas (hasta 200). Filtrar por estado / tipo / pista aquí, en memoria */
  ordenes: OrdenTrabajo[]
  pistas: PistaMantenimiento[]
  empleados: EmpleadoOpcion[]
  /** Abre el modal "Reportar falla" */
  onReportarFalla: () => void
  /** Pasa la orden a "en proceso". true = hecho */
  onIniciarOrden: (ordenId: string, responsableId?: string | null) => Promise<boolean>
  /** Abre el panel lateral "Cerrar orden" */
  onCerrarOrden: (orden: OrdenTrabajo) => void
  /** Abre la ficha técnica de la pista de la orden */
  onAbrirPista: (pistaId: string) => void
}

export function OrdenesTrabajo(props: OrdenesTrabajoProps) {
  return (
    <div>
      <div>Pendiente: Órdenes de trabajo {props.loading ? '(cargando)' : ''}</div>
      <ul>
        {props.ordenes.map((o) => (
          <li key={o.id}>
            {o.folio} · {o.tipo} · {o.pista_nombre ?? 'General'} · {o.componente} · {o.prioridad} · {o.estado} ·{' '}
            {o.fuera_de_servicio ? 'fuera de servicio · ' : ''}
            {o.descripcion}
          </li>
        ))}
      </ul>
    </div>
  )
}
