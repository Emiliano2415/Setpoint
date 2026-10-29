'use client'

import type {
  CerrarOrdenInput,
  CerrarOrdenResultado,
  OrdenTrabajo,
  Refaccion,
} from '@/lib/supabase/queries/mantenimiento'

// Stitch: Cerrar orden (a3e5fe9b322c4dd29b0beba339b61d79)
export interface CerrarOrdenDrawerProps {
  /** La orden que se cierra; null = panel cerrado */
  orden: OrdenTrabajo | null
  /** Catálogo con existencias para elegir las refacciones usadas */
  refacciones: Refaccion[]
  onClose: () => void
  /**
   * Cierra la orden: registra causa, acción, mano de obra y descuenta las refacciones.
   * Devuelve null si falló (p. ej. existencia insuficiente; el error ya se mostró).
   * Al terminar bien, cerrar el panel con onClose().
   */
  onCerrarOrden: (input: CerrarOrdenInput) => Promise<CerrarOrdenResultado | null>
}

export function CerrarOrdenDrawer(props: CerrarOrdenDrawerProps) {
  const o = props.orden
  if (!o) return null
  return (
    <div>
      <div>Pendiente: Cerrar orden {o.folio}</div>
      <div>
        {o.tipo} · {o.pista_nombre ?? 'General'} · {o.descripcion} ·{' '}
        {o.fuera_de_servicio ? 'la pista está bloqueada' : 'sin bloqueo'}
      </div>
      <div>Refacciones disponibles: {props.refacciones.length}</div>
    </div>
  )
}
