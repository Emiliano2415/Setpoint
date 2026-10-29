'use client'

import { useState } from 'react'
import { AlertTriangle, Check } from 'lucide-react'
import { Button, Field, Modal, SegmentedControl, Select, Switch, Textarea } from '@/components/ds'
import {
  COMPONENTES,
  ESTADO_PISTA_LABEL,
  PRIORIDADES,
  type Componente,
  type PistaMantenimiento,
  type Prioridad,
  type ReportarFallaInput,
  type ReportarFallaResultado,
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

function formatearFechaReserva(fecha: string) {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  return new Date(anio, mes - 1, dia).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

function hora(valor: string) {
  return valor.slice(0, 5)
}

export function ReportarFallaModal(props: ReportarFallaModalProps) {
  if (!props.open) return null
  return <FormularioFalla {...props} />
}

// Se monta solo mientras el modal está abierto: cada apertura empieza con el formulario limpio.
function FormularioFalla({ onClose, pistas, pistaIdInicial, onReportarFalla }: ReportarFallaModalProps) {
  const [pistaId, setPistaId] = useState(pistaIdInicial ?? '')
  const [componente, setComponente] = useState<Componente>('iluminacion')
  const [descripcion, setDescripcion] = useState('')
  const [prioridad, setPrioridad] = useState<Prioridad>('alta')
  const [fueraDeServicio, setFueraDeServicio] = useState(false)
  const [intentoEnviar, setIntentoEnviar] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<ReportarFallaResultado | null>(null)

  const errorPista = intentoEnviar && pistaId === '' ? 'Elige la pista' : undefined
  const errorDescripcion = intentoEnviar && descripcion.trim() === '' ? 'Describe la falla' : undefined

  async function handleCrear() {
    setIntentoEnviar(true)
    if (pistaId === '' || descripcion.trim() === '') return
    setEnviando(true)
    const r = await onReportarFalla({
      pistaId,
      componente,
      descripcion: descripcion.trim(),
      prioridad,
      fueraDeServicio,
    })
    setEnviando(false)
    if (!r) return // el manejador ya mostró el error
    if (r.reservas_afectadas.length > 0) {
      setResultado(r)
      return
    }
    onClose()
  }

  if (resultado) {
    return (
      <Modal
        open
        onClose={onClose}
        title={`Orden ${resultado.folio} creada`}
        description="Las reservas dentro del bloqueo no se cancelaron: atiéndelas a mano."
        size="md"
        footer={
          <Button variant="primary" className="ml-auto" onClick={onClose}>
            Entendido
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-warning">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <p className="text-xs leading-relaxed text-on-surface">
              Hay {resultado.reservas_afectadas.length} reserva(s) confirmadas o en juego dentro del bloqueo.
            </p>
          </div>
          <ul className="divide-y divide-outline-variant overflow-hidden rounded-lg border border-outline-variant">
            {resultado.reservas_afectadas.map((r) => (
              <li
                key={r.reserva_id}
                className="flex items-center justify-between gap-4 bg-surface-container-high px-3 py-2.5 text-xs"
              >
                <span className="font-medium text-on-surface">{r.cliente ?? 'Sin nombre'}</span>
                <span className="tabular-nums text-on-surface-variant">
                  {formatearFechaReserva(r.fecha)} · {hora(r.hora_inicio)}–{hora(r.hora_fin)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Reportar falla"
      description="Se crea una orden de trabajo correctiva"
      size="md"
      dismissable={!enviando}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={enviando}>
            Cancelar
          </Button>
          <Button variant="primary" loading={enviando} onClick={handleCrear}>
            <Check size={16} />
            Crear orden
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Pista" htmlFor="falla-pista" error={errorPista}>
          <Select
            id="falla-pista"
            value={pistaId}
            onChange={(e) => setPistaId(e.target.value)}
            invalid={errorPista !== undefined}
          >
            <option value="" disabled>
              Elige una pista
            </option>
            {pistas.map((p) => (
              <option key={p.pista_id} value={p.pista_id}>
                {p.nombre} · {ESTADO_PISTA_LABEL[p.estado_operativo]}
              </option>
            ))}
          </Select>
        </Field>

        <div className="flex flex-col gap-2">
          <span id="falla-componente" className="text-xs font-medium text-on-surface-variant">
            Componente afectado
          </span>
          <div role="group" aria-labelledby="falla-componente" className="flex flex-wrap gap-2">
            {COMPONENTES.map((c) => {
              const activo = c.value === componente
              return (
                <button
                  key={c.value}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => setComponente(c.value)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors ${activo ? 'border-primary bg-primary font-medium text-on-primary' : 'border-outline-variant bg-surface-container-high text-on-surface hover:border-outline'}`}
                >
                  {activo && <Check size={14} />}
                  {c.label}
                </button>
              )
            })}
          </div>
        </div>

        <Field
          label="Descripción detallada"
          htmlFor="falla-descripcion"
          hint="Sé específico sobre la ubicación exacta y el comportamiento visible de la falla."
          error={errorDescripcion}
        >
          <Textarea
            id="falla-descripcion"
            rows={3}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            invalid={errorDescripcion !== undefined}
            className="resize-none"
          />
        </Field>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-on-surface-variant">Prioridad</span>
          <SegmentedControl label="Prioridad" value={prioridad} onChange={setPrioridad} options={PRIORIDADES} />
        </div>

        <div className="flex items-start justify-between gap-4 rounded-lg border border-outline-variant bg-surface-container-high p-3.5">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-on-surface">Dejar la pista fuera de servicio</span>
            <span className="text-[11px] leading-relaxed text-on-surface-variant">
              Se bloquearán las reservas futuras de esta pista hasta cerrar la orden.
            </span>
          </div>
          <Switch
            checked={fueraDeServicio}
            onChange={setFueraDeServicio}
            label="Dejar la pista fuera de servicio"
          />
        </div>
      </div>
    </Modal>
  )
}
