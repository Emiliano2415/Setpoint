'use client'

import type {
  EmpleadoOpcion,
  PistaMantenimiento,
  ProgramarPreventivoInput,
  ProgramarPreventivoResultado,
  TareaPreventiva,
} from '@/lib/supabase/queries/mantenimiento'

// Stitch: Plan preventivo (50f803d1ffb74f7bb8c9e115ead42d4c)
export interface PlanPreventivoProps {
  loading: boolean
  tareas: TareaPreventiva[]
  pistas: PistaMantenimiento[]
  empleados: EmpleadoOpcion[]
  /** Abre el modal "Nueva tarea" vacío */
  onNuevaTarea: () => void
  /** Abre el modal "Nueva tarea" para editar esta */
  onEditarTarea: (tarea: TareaPreventiva) => void
  /** Quita la tarea del plan. true = hecho */
  onDesactivarTarea: (tareaId: string) => Promise<boolean>
  /**
   * Genera la orden preventiva (y el bloqueo de agenda si la tarea lo pide).
   * Devuelve null si falló (p. ej. hay reservas en la ventana; el error ya se mostró).
   * Reintentar con `forzar: true` si el usuario confirma.
   */
  onProgramarPreventivo: (input: ProgramarPreventivoInput) => Promise<ProgramarPreventivoResultado | null>
}

export function PlanPreventivo(props: PlanPreventivoProps) {
  return (
    <div>
      <div>Pendiente: Plan preventivo {props.loading ? '(cargando)' : ''}</div>
      <ul>
        {props.tareas.map((t) => (
          <li key={t.id}>
            {t.nombre} · {t.frecuencia_valor} {t.frecuencia_tipo} · {t.estado} · avance {t.avance_pct ?? '—'} % · próxima{' '}
            {t.proxima_fecha ?? `${t.uso_acumulado_h} h de uso`} · bloquea agenda: {t.bloquea_agenda ? 'sí' : 'no'} · responsable{' '}
            {t.responsable_nombre ?? '—'}
          </li>
        ))}
      </ul>
    </div>
  )
}
