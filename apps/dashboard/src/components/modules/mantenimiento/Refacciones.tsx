'use client'

import type {
  EntradaRefaccionInput,
  MovimientoRefaccion,
  NuevaRefaccionInput,
  Refaccion,
} from '@/lib/supabase/queries/mantenimiento'

// Stitch: Refacciones (89727cb9486643f087120d01864207ae)
export interface RefaccionesProps {
  loading: boolean
  /** Con punto de reorden y estado 'Pedir' / 'OK' ya calculados por la base */
  refacciones: Refaccion[]
  /** Crea la refacción (con existencia inicial opcional). true = creada */
  onCrearRefaccion: (input: NuevaRefaccionInput) => Promise<boolean>
  /** Registra una compra. true = registrada */
  onRegistrarEntrada: (input: EntradaRefaccionInput) => Promise<boolean>
  /** Historial de movimientos de una refacción, para un panel de detalle */
  onCargarMovimientos: (refaccionId: string) => Promise<MovimientoRefaccion[]>
}

export function Refacciones(props: RefaccionesProps) {
  return (
    <div>
      <div>Pendiente: Refacciones {props.loading ? '(cargando)' : ''}</div>
      <ul>
        {props.refacciones.map((r) => (
          <li key={r.id}>
            {r.nombre} · existencia {r.existencia} {r.unidad} · punto de reorden {r.punto_reorden} · {r.estado} · entrega{' '}
            {r.tiempo_entrega_dias} d · ${r.costo_unitario}
          </li>
        ))}
      </ul>
    </div>
  )
}
