'use client'

import { useState } from 'react'
import { Check, Plus, Trash2, X } from 'lucide-react'
import {
  Button,
  Field,
  IconButton,
  Input,
  Modal,
  Select,
  SegmentedControl,
  Switch,
  Textarea,
} from '@/components/ds'
import {
  COMPONENTES,
  type Componente,
  type EmpleadoOpcion,
  type NuevaTareaInput,
  type PistaMantenimiento,
  type Refaccion,
  type TareaPreventiva,
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

/** Frecuencia de calendario: en horas de uso no hay unidad que elegir */
type UnidadCalendario = 'dias' | 'semanas' | 'meses'

const UNIDADES: { value: UnidadCalendario; label: string }[] = [
  { value: 'dias', label: 'día(s)' },
  { value: 'semanas', label: 'semana(s)' },
  { value: 'meses', label: 'mes(es)' },
]

export function NuevaTareaModal(props: NuevaTareaModalProps) {
  if (!props.open) return null
  // Se monta en cada apertura: el formulario arranca con los datos de la tarea (o en blanco)
  return <NuevaTareaFormulario key={props.tarea?.id ?? 'nueva'} {...props} />
}

function NuevaTareaFormulario({
  onClose,
  pistas,
  empleados,
  refacciones,
  tarea,
  onGuardar,
}: NuevaTareaModalProps) {
  const frecuenciaInicial = tarea?.frecuencia_tipo ?? 'meses'

  const [nombre, setNombre] = useState(tarea?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(tarea?.descripcion ?? '')
  const [componente, setComponente] = useState<Componente>(tarea?.componente ?? 'otro')
  const [pistaIds, setPistaIds] = useState<string[]>(
    tarea && !tarea.aplica_todas ? tarea.pista_ids : pistas.map((p) => p.pista_id),
  )
  const todasPistas = pistas.length > 0 && pistas.every((p) => pistaIds.includes(p.pista_id))
  const [modoFrecuencia, setModoFrecuencia] = useState<'calendario' | 'horas_uso'>(
    frecuenciaInicial === 'horas_uso' ? 'horas_uso' : 'calendario',
  )
  const [unidad, setUnidad] = useState<UnidadCalendario>(
    frecuenciaInicial === 'horas_uso' ? 'meses' : frecuenciaInicial,
  )
  const [cada, setCada] = useState(String(tarea?.frecuencia_valor ?? 1))
  const [duracion, setDuracion] = useState(String(tarea?.duracion_min ?? 30))
  const [bloqueaAgenda, setBloqueaAgenda] = useState(tarea?.bloquea_agenda ?? true)
  const [responsableId, setResponsableId] = useState(tarea?.responsable_id ?? '')
  const [pasos, setPasos] = useState<string[]>(tarea?.pasos ?? [])
  const [refs, setRefs] = useState<{ refaccion_id: string; cantidad: string }[]>(
    (tarea?.refacciones ?? []).map((r) => ({ refaccion_id: r.refaccion_id, cantidad: String(r.cantidad) })),
  )

  const [guardando, setGuardando] = useState(false)

  function togglePista(pistaId: string) {
    setPistaIds((actual) =>
      actual.includes(pistaId) ? actual.filter((id) => id !== pistaId) : [...actual, pistaId],
    )
  }

  async function handleGuardar() {
    const input: NuevaTareaInput = {
      nombre,
      descripcion: descripcion.trim() || null,
      componente,
      aplica_todas: todasPistas,
      pista_ids: todasPistas ? [] : pistaIds,
      frecuencia_tipo: modoFrecuencia === 'horas_uso' ? 'horas_uso' : unidad,
      frecuencia_valor: Number(cada),
      duracion_min: Number(duracion),
      bloquea_agenda: bloqueaAgenda,
      responsable_id: responsableId || null,
      pasos: pasos.map((paso) => paso.trim()).filter((paso) => paso !== ''),
      refacciones: refs
        .filter((fila) => fila.refaccion_id !== '')
        .map((fila) => ({ refaccion_id: fila.refaccion_id, cantidad: Number(fila.cantidad) })),
    }
    setGuardando(true)
    let ok = false
    try {
      ok = await onGuardar(input)
    } finally {
      setGuardando(false)
    }
    if (ok) onClose()
  }

  const enHoras = modoFrecuencia === 'horas_uso'

  return (
    <Modal
      open
      onClose={onClose}
      title={tarea ? 'Editar tarea preventiva' : 'Nueva tarea preventiva'}
      size="md"
      dismissable={!guardando}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleGuardar} loading={guardando}>
            Guardar tarea
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Nombre de la tarea" htmlFor="tarea-nombre">
          <Input
            id="tarea-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Revisión de tornillería y cristales"
          />
        </Field>

        <Field label="Descripción (opcional)" htmlFor="tarea-descripcion">
          <Textarea
            id="tarea-descripcion"
            rows={2}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </Field>

        <Field label="Componente" htmlFor="tarea-componente">
          <Select
            id="tarea-componente"
            value={componente}
            onChange={(e) => setComponente(e.target.value as Componente)}
          >
            {COMPONENTES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-on-surface-variant">Pistas</span>
            <button
              type="button"
              onClick={() => setPistaIds(pistas.map((p) => p.pista_id))}
              className="text-xs font-medium text-primary hover:underline"
            >
              Todas
            </button>
          </div>
          {pistas.length === 0 ? (
            <p className="text-xs text-outline">No hay pistas activas.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {pistas.map((p) => {
                const activa = pistaIds.includes(p.pista_id)
                return (
                  <button
                    key={p.pista_id}
                    type="button"
                    aria-pressed={activa}
                    onClick={() => togglePista(p.pista_id)}
                    className={`flex h-8 items-center justify-center gap-1 rounded-lg border px-2 text-xs transition-colors ${activa ? 'border-primary/40 bg-surface-container-highest font-medium text-primary' : 'border-outline-variant bg-background text-on-surface-variant hover:text-on-surface'}`}
                  >
                    {activa && <Check size={14} className="shrink-0" />}
                    <span className="truncate">{p.nombre}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <span className="block text-xs font-medium text-on-surface-variant">Frecuencia por</span>
          <SegmentedControl
            label="Frecuencia por"
            value={modoFrecuencia}
            onChange={setModoFrecuencia}
            options={[
              { value: 'calendario', label: 'Calendario' },
              { value: 'horas_uso', label: 'Horas de uso' },
            ]}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Cada" htmlFor="tarea-cada">
            <div className="grid grid-cols-[88px_1fr] gap-2">
              <Input
                id="tarea-cada"
                type="number"
                min={1}
                value={cada}
                onChange={(e) => setCada(e.target.value)}
                className="tabular-nums"
              />
              <Select
                aria-label="Unidad de la frecuencia"
                value={enHoras ? 'horas_uso' : unidad}
                disabled={enHoras}
                onChange={(e) => setUnidad(e.target.value as UnidadCalendario)}
              >
                {enHoras ? (
                  <option value="horas_uso">horas de uso</option>
                ) : (
                  UNIDADES.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))
                )}
              </Select>
            </div>
          </Field>

          <Field label="Duración estimada" htmlFor="tarea-duracion">
            <div className="relative">
              <Input
                id="tarea-duracion"
                type="number"
                min={1}
                value={duracion}
                onChange={(e) => setDuracion(e.target.value)}
                className="pr-12 tabular-nums"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-outline">
                min
              </span>
            </div>
          </Field>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-outline-variant bg-surface-container-highest/60 p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-on-surface">
              Bloquear la pista en la agenda mientras se realiza
            </p>
            <p className="mt-0.5 text-xs text-on-surface-variant">
              Impide nuevas reservas en esa pista durante el lapso programado.
            </p>
          </div>
          <Switch
            checked={bloqueaAgenda}
            onChange={setBloqueaAgenda}
            label="Bloquear la pista en la agenda mientras se realiza"
          />
        </div>

        <Field label="Responsable" htmlFor="tarea-responsable">
          <Select
            id="tarea-responsable"
            value={responsableId}
            onChange={(e) => setResponsableId(e.target.value)}
          >
            <option value="">Sin responsable</option>
            {empleados.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.nombre}
              </option>
            ))}
          </Select>
        </Field>

        <div className="space-y-2">
          <span className="block text-xs font-medium text-on-surface-variant">Pasos de inspección</span>
          {pasos.map((paso, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-right text-xs tabular-nums text-outline">{i + 1}</span>
              <Input
                size="sm"
                aria-label={`Paso ${i + 1}`}
                placeholder="Describe el paso"
                value={paso}
                onChange={(e) => setPasos(pasos.map((p, j) => (j === i ? e.target.value : p)))}
              />
              <IconButton
                label={`Quitar paso ${i + 1}`}
                icon={<Trash2 size={16} />}
                onClick={() => setPasos(pasos.filter((_, j) => j !== i))}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => setPasos([...pasos, ''])}
            className="inline-flex items-center gap-1.5 pt-1 text-xs font-medium text-primary hover:underline"
          >
            <Plus size={14} />
            Agregar paso
          </button>
        </div>

        <div className="space-y-2 border-t border-outline-variant/60 pt-4">
          <span className="block text-xs font-medium text-on-surface-variant">Refacciones necesarias</span>
          {refs.map((fila, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <Select
                  aria-label={`Refacción ${i + 1}`}
                  value={fila.refaccion_id}
                  onChange={(e) =>
                    setRefs(refs.map((f, j) => (j === i ? { ...f, refaccion_id: e.target.value } : f)))
                  }
                >
                  {!refacciones.some((r) => r.id === fila.refaccion_id) && (
                    <option value={fila.refaccion_id}>Refacción inactiva</option>
                  )}
                  {refacciones.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre} ({r.unidad})
                    </option>
                  ))}
                </Select>
              </div>
              <div className="w-24 shrink-0">
                <Input
                  type="number"
                  min={1}
                  aria-label={`Cantidad ${i + 1}`}
                  value={fila.cantidad}
                  onChange={(e) =>
                    setRefs(refs.map((f, j) => (j === i ? { ...f, cantidad: e.target.value } : f)))
                  }
                  className="tabular-nums"
                />
              </div>
              <IconButton
                label={`Quitar refacción ${i + 1}`}
                icon={<X size={16} />}
                onClick={() => setRefs(refs.filter((_, j) => j !== i))}
              />
            </div>
          ))}
          <button
            type="button"
            disabled={refacciones.length === 0}
            onClick={() => setRefs([...refs, { refaccion_id: refacciones[0]?.id ?? '', cantidad: '1' }])}
            className="inline-flex items-center gap-1.5 pt-1 text-xs font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
          >
            <Plus size={14} />
            Agregar refacción
          </button>
          {refacciones.length === 0 && (
            <p className="text-xs text-outline">No hay refacciones activas en el catálogo.</p>
          )}
        </div>
      </div>
    </Modal>
  )
}
