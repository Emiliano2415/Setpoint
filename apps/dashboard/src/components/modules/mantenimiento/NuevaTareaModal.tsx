'use client'

import type {
  EmpleadoOpcion,
  NuevaTareaInput,
  PistaMantenimiento,
  Refaccion,
  TareaPreventiva,
} from '@/lib/supabase/queries/mantenimiento'

// Stitch: Nueva tarea preventiva (b8d3062fed4745ccb30e99a07b72161d)
export interface NuevaTareaModalProps {
  open: boolean
  onClose: () => void
  pistas: PistaMantenimiento[]
  empleados: EmpleadoOpcion[]
  /** Catálogo para elegir las refacciones que usa la tarea */
  refacciones: Refaccion[]
  /** Si viene, el modal edita esta tarea; si no, crea una nueva */
  tarea: TareaPreventiva | null
  /** Guarda (crea o edita). true = guardado: cerrar entonces el modal con onClose() */
  onGuardar: (input: NuevaTareaInput) => Promise<boolean>
}

export function NuevaTareaModal(props: NuevaTareaModalProps) {
  if (!props.open) return null
  return (
    <div>
      <div>Pendiente: {props.tarea ? 'Editar' : 'Nueva'} tarea preventiva</div>
      <div>{props.tarea?.nombre}</div>
      <div>
        Pistas: {props.pistas.length} · responsables: {props.empleados.length} · refacciones: {props.refacciones.length}
      </div>
    </div>
  )
}
