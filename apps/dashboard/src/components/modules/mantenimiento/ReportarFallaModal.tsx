'use client'

import type {
  PistaMantenimiento,
  ReportarFallaInput,
  ReportarFallaResultado,
} from '@/lib/supabase/queries/mantenimiento'

// Stitch: Reportar falla (072e4cebeabc41cf8c8ffb2a6f78ec37)
export interface ReportarFallaModalProps {
  open: boolean
  onClose: () => void
  pistas: PistaMantenimiento[]
  /** Pista que debe aparecer elegida al abrir */
  pistaIdInicial?: string | null
  /**
   * Crea la orden correctiva (y bloquea la pista si `fueraDeServicio`).
   * Devuelve null si falló. Si `reservas_afectadas` trae elementos, avisar al usuario
   * (no se cancelan solas). Cerrar el modal con onClose().
   */
  onReportarFalla: (input: ReportarFallaInput) => Promise<ReportarFallaResultado | null>
}

export function ReportarFallaModal(props: ReportarFallaModalProps) {
  if (!props.open) return null
  return (
    <div>
      <div>Pendiente: Reportar falla</div>
      <div>Pista inicial: {props.pistaIdInicial ?? '—'}</div>
      <ul>
        {props.pistas.map((p) => (
          <li key={p.pista_id}>
            {p.nombre} · {p.estado_operativo}
          </li>
        ))}
      </ul>
    </div>
  )
}
