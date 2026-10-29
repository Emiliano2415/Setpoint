'use client'

import { useState } from 'react'
import { CalendarClock, ClipboardList, Info, Lock, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  SegmentedControl,
  Select,
  Skeleton,
  Table,
  type Column,
} from '@/components/ds'
import {
  COMPONENTES,
  ESTADO_TAREA_LABEL,
  describirFrecuencia,
  type EmpleadoOpcion,
  type EstadoTarea,
  type PistaMantenimiento,
  type ProgramarPreventivoInput,
  type ProgramarPreventivoResultado,
  type TareaPreventiva,
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

type FiltroEstado = 'todas' | 'proxima' | 'vencida'

const TONO_ESTADO: Record<EstadoTarea, 'success' | 'warning' | 'error'> = {
  al_dia: 'success',
  proxima: 'warning',
  vencida: 'error',
}

/** Zona horaria de la club (UTC-6 todo el año, sin horario de verano). */
const ZONA_CLUB = 'America/Mexico_City'

/** Una tarea aplica a la pista si aplica a todas o la lista la incluye. */
function aplicaA(tarea: TareaPreventiva, pistaId: string): boolean {
  return tarea.aplica_todas || tarea.pista_ids.includes(pistaId)
}

/** Día de un timestamp, en hora de la club. */
function fmtFecha(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: ZONA_CLUB,
  })
}

/** Valor de un input datetime-local (hora de la club) a ISO. */
function aIsoClub(valor: string): string {
  return new Date(`${valor}:00-06:00`).toISOString()
}

export function PlanPreventivo(props: PlanPreventivoProps) {
  const [pistaFiltro, setPistaFiltro] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState<FiltroEstado>('todas')

  const [programando, setProgramando] = useState<TareaPreventiva | null>(null)
  const [progPista, setProgPista] = useState('')
  const [progInicio, setProgInicio] = useState('')
  const [progFin, setProgFin] = useState('')
  const [progResponsable, setProgResponsable] = useState('')
  const [progEnviando, setProgEnviando] = useState(false)
  const [progFallo, setProgFallo] = useState(false)

  const [desactivando, setDesactivando] = useState<TareaPreventiva | null>(null)
  const [desactivandoEnviando, setDesactivandoEnviando] = useState(false)

  const filtradas = props.tareas.filter(
    (t) =>
      (pistaFiltro === '' || aplicaA(t, pistaFiltro)) &&
      (estadoFiltro === 'todas' || t.estado === estadoFiltro),
  )

  function abrirProgramar(tarea: TareaPreventiva) {
    const candidatas = props.pistas.filter((p) => aplicaA(tarea, p.pista_id))
    let pistaInicial = ''
    if (pistaFiltro !== '' && aplicaA(tarea, pistaFiltro)) pistaInicial = pistaFiltro
    else if (candidatas.length === 1) pistaInicial = candidatas[0].pista_id
    setProgPista(pistaInicial)
    setProgInicio('')
    setProgFin('')
    setProgResponsable(tarea.responsable_id ?? '')
    setProgFallo(false)
    setProgramando(tarea)
  }

  async function handleProgramar(forzar: boolean) {
    if (!programando || !progPista || !progInicio) return
    setProgEnviando(true)
    const resultado = await props.onProgramarPreventivo({
      tareaId: programando.id,
      pistaId: progPista,
      inicio: aIsoClub(progInicio),
      fin: progFin ? aIsoClub(progFin) : null,
      responsableId: progResponsable || null,
      forzar,
    })
    setProgEnviando(false)
    if (resultado) setProgramando(null)
    else setProgFallo(true)
  }

  async function handleDesactivar() {
    if (!desactivando) return
    setDesactivandoEnviando(true)
    const ok = await props.onDesactivarTarea(desactivando.id)
    setDesactivandoEnviando(false)
    if (ok) setDesactivando(null)
  }

  const columnas: Column<TareaPreventiva>[] = [
    {
      key: 'tarea',
      header: 'Tarea',
      render: (t) => (
        <div className="flex flex-col">
          <span className="font-medium text-on-surface">{t.nombre}</span>
          <span className="text-xs text-on-surface-variant">
            {COMPONENTES.find((c) => c.value === t.componente)?.label}
          </span>
        </div>
      ),
    },
    {
      key: 'pistas',
      header: 'Pistas',
      render: (t) => {
        if (t.aplica_todas) return <span className="text-on-surface-variant">Todas</span>
        const nombres = props.pistas.filter((p) => t.pista_ids.includes(p.pista_id)).map((p) => p.nombre)
        return <span className="text-on-surface-variant">{nombres.length > 0 ? nombres.join(', ') : '—'}</span>
      },
    },
    {
      key: 'frecuencia',
      header: 'Frecuencia',
      render: (t) => (
        <span className="text-on-surface-variant">{describirFrecuencia(t.frecuencia_tipo, t.frecuencia_valor)}</span>
      ),
    },
    {
      key: 'ultima',
      header: 'Última',
      render: (t) => (
        <span className="tabular-nums text-on-surface-variant">
          {t.frecuencia_tipo === 'horas_uso'
            ? `${t.uso_acumulado_h.toLocaleString('es-MX', { maximumFractionDigits: 1 })} h de uso`
            : fmtFecha(t.ultima_ejecucion)}
        </span>
      ),
    },
    {
      key: 'proxima',
      header: 'Próxima',
      render: (t) => (
        <span className="tabular-nums text-on-surface">
          {t.frecuencia_tipo === 'horas_uso'
            ? `en ${Math.max(0, t.frecuencia_valor - t.uso_acumulado_h).toLocaleString('es-MX', { maximumFractionDigits: 0 })} h`
            : fmtFecha(t.proxima_fecha)}
        </span>
      ),
    },
    {
      key: 'bloquea',
      header: 'Bloquea agenda',
      render: (t) =>
        t.bloquea_agenda ? (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-outline-variant bg-surface-container-highest px-2 py-0.5 text-xs text-on-surface">
            <Lock size={12} className="text-on-surface-variant" aria-hidden="true" />
            Sí, {t.duracion_min} min
          </span>
        ) : (
          <span className="text-on-surface-variant">No</span>
        ),
    },
    {
      key: 'responsable',
      header: 'Responsable',
      render: (t) => <span className="text-on-surface">{t.responsable_nombre ?? '—'}</span>,
    },
    {
      key: 'estado',
      header: 'Estado',
      align: 'right',
      render: (t) => <Badge tone={TONO_ESTADO[t.estado]}>{ESTADO_TAREA_LABEL[t.estado]}</Badge>,
    },
    {
      key: 'acciones',
      header: '',
      align: 'right',
      render: (t) => (
        <div className="flex items-center justify-end gap-1">
          <IconButton icon={<CalendarClock size={16} />} label="Programar preventivo" onClick={() => abrirProgramar(t)} />
          <IconButton icon={<Pencil size={16} />} label="Editar tarea" onClick={() => props.onEditarTarea(t)} />
          <IconButton icon={<Trash2 size={16} />} label="Quitar del plan" onClick={() => setDesactivando(t)} />
        </div>
      ),
    },
  ]

  const sinTareas = props.tareas.length === 0

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-56">
            <Select aria-label="Filtrar por pista" value={pistaFiltro} onChange={(e) => setPistaFiltro(e.target.value)}>
              <option value="">Todas las pistas</option>
              {props.pistas.map((p) => (
                <option key={p.pista_id} value={p.pista_id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          </div>
          <SegmentedControl
            label="Estado de las tareas"
            value={estadoFiltro}
            onChange={setEstadoFiltro}
            options={[
              { value: 'todas', label: 'Todas' },
              { value: 'proxima', label: 'Por vencer' },
              { value: 'vencida', label: 'Vencidas' },
            ]}
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-on-surface-variant">{props.tareas.length} tareas registradas</span>
          <Button variant="primary" onClick={() => props.onNuevaTarea()}>
            <Plus size={16} aria-hidden="true" />
            Nueva tarea
          </Button>
        </div>
      </div>

      {props.loading && sinTareas ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <Table
          columns={columnas}
          rows={filtradas}
          rowKey={(t) => t.id}
          empty={
            <EmptyState
              icon={<ClipboardList />}
              title={sinTareas ? 'Aún no hay tareas preventivas' : 'Ninguna tarea coincide con el filtro'}
              action={
                sinTareas ? (
                  <Button variant="secondary" size="sm" onClick={() => props.onNuevaTarea()}>
                    Nueva tarea
                  </Button>
                ) : undefined
              }
            />
          }
        />
      )}

      <div className="flex items-center gap-2 text-xs text-on-surface-variant/80">
        <Info size={14} className="shrink-0 text-on-surface-variant" aria-hidden="true" />
        <span>Las tareas que bloquean agenda reservan la pista en Pistas durante su duración.</span>
      </div>

      <Modal
        open={programando !== null}
        onClose={() => setProgramando(null)}
        title={programando ? `Programar: ${programando.nombre}` : 'Programar preventivo'}
        description={
          programando?.bloquea_agenda
            ? 'Crea la orden preventiva y reserva la pista durante la duración de la tarea.'
            : 'Crea la orden preventiva para la pista elegida.'
        }
        dismissable={!progEnviando}
        footer={
          <>
            <Button variant="secondary" onClick={() => setProgramando(null)} disabled={progEnviando}>
              Cancelar
            </Button>
            <div className="flex items-center gap-2">
              {progFallo && programando?.bloquea_agenda && (
                <Button variant="danger" disabled={progEnviando} onClick={() => handleProgramar(true)}>
                  Programar de todos modos
                </Button>
              )}
              <Button
                variant="primary"
                loading={progEnviando}
                disabled={!progPista || !progInicio}
                onClick={() => handleProgramar(false)}
              >
                Programar
              </Button>
            </div>
          </>
        }
      >
        {programando && (
          <div className="flex flex-col gap-4">
            <Field label="Pista" htmlFor="prog-pista">
              <Select
                id="prog-pista"
                value={progPista}
                onChange={(e) => {
                  setProgPista(e.target.value)
                  setProgFallo(false)
                }}
              >
                <option value="">Elige una pista</option>
                {props.pistas
                  .filter((p) => aplicaA(programando, p.pista_id))
                  .map((p) => (
                    <option key={p.pista_id} value={p.pista_id}>
                      {p.nombre}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Inicio" htmlFor="prog-inicio">
              <Input
                id="prog-inicio"
                type="datetime-local"
                value={progInicio}
                onChange={(e) => {
                  setProgInicio(e.target.value)
                  setProgFallo(false)
                }}
              />
            </Field>
            <Field
              label="Fin"
              htmlFor="prog-fin"
              hint={`Opcional. Por omisión: inicio + ${programando.duracion_min} min`}
            >
              <Input id="prog-fin" type="datetime-local" value={progFin} onChange={(e) => setProgFin(e.target.value)} />
            </Field>
            <Field label="Responsable" htmlFor="prog-responsable">
              <Select id="prog-responsable" value={progResponsable} onChange={(e) => setProgResponsable(e.target.value)}>
                <option value="">Sin responsable</option>
                {props.empleados.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.nombre}
                  </option>
                ))}
              </Select>
            </Field>
            {progFallo && programando.bloquea_agenda && (
              <p className="text-xs text-error">
                No se pudo programar. Si hay reservas en la ventana de bloqueo, cambia el horario o programa de todos
                modos.
              </p>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={desactivando !== null}
        onCancel={() => setDesactivando(null)}
        onConfirm={handleDesactivar}
        title="Quitar tarea del plan"
        consequence={desactivando ? `«${desactivando.nombre}» saldrá del plan preventivo.` : ''}
        confirmLabel="Quitar"
        loading={desactivandoEnviando}
      />
    </div>
  )
}
