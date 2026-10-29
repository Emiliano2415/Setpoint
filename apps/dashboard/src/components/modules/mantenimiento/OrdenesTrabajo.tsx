'use client'

import { useMemo, useState } from 'react'
import { Grid2x2, Plus, Wrench } from 'lucide-react'
import { Badge, Button, EmptyState, Field, Modal, SegmentedControl, Select, Skeleton } from '@/components/ds'
import {
  COMPONENTES,
  PRIORIDADES,
  type EmpleadoOpcion,
  type OrdenTipo,
  type OrdenTrabajo,
  type PistaMantenimiento,
} from '@/lib/supabase/queries/mantenimiento'

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

type FiltroTipo = 'todas' | OrdenTipo

const FILTRO_TIPO: { value: FiltroTipo; label: string }[] = [
  { value: 'correctiva', label: 'Correctivas' },
  { value: 'preventiva', label: 'Preventivas' },
  { value: 'todas', label: 'Todas' },
]

const TIPO_LABEL: Record<OrdenTipo, string> = {
  correctiva: 'Correctiva',
  preventiva: 'Preventiva',
}

/** Alta = error, media = warning, baja = neutral */
const TONO_PRIORIDAD = { alta: 'error', media: 'warning', baja: 'neutral' } as const

const COLUMNAS = [
  { estado: 'abierta', titulo: 'Abiertas', punto: 'bg-error' },
  { estado: 'en_proceso', titulo: 'En proceso', punto: 'bg-primary' },
  { estado: 'cerrada', titulo: 'Cerradas', punto: 'bg-outline' },
] as const

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function fechaHora(iso: string): string {
  return `${new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} ${hora(iso)}`
}

function horasTexto(h: number | null): string {
  if (h === null) return '—'
  return `${h.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h`
}

interface TarjetaOrdenProps {
  orden: OrdenTrabajo
  /** Iniciar (abiertas) o abrir el cierre (en proceso). null = sin acción */
  onAccion: (() => void) | null
  onAbrirPista: (pistaId: string) => void
}

function TarjetaOrden({ orden, onAccion, onAbrirPista }: TarjetaOrdenProps) {
  const prioridad = PRIORIDADES.find((p) => p.value === orden.prioridad)?.label ?? orden.prioridad
  const componente = COMPONENTES.find((c) => c.value === orden.componente)?.label ?? orden.componente
  const pistaId = orden.pista_id

  const contenido = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-on-surface-variant">
          {orden.folio} · {TIPO_LABEL[orden.tipo]}
        </span>
        <Badge tone={TONO_PRIORIDAD[orden.prioridad]}>{prioridad}</Badge>
      </div>
      <div className="flex flex-col gap-1">
        <p className="line-clamp-2 text-sm font-medium leading-snug tracking-tight text-on-surface">
          {orden.descripcion}
        </p>
        <p className="text-xs text-on-surface-variant">
          {componente}
          {orden.responsable_nombre ? ` · ${orden.responsable_nombre}` : ''}
        </p>
      </div>
      {orden.fuera_de_servicio ? (
        <div>
          <Badge tone="error">Fuera de servicio</Badge>
        </div>
      ) : null}
    </>
  )

  return (
    <article className="flex flex-col overflow-hidden rounded-lg border border-outline-variant/40 bg-surface-container transition-colors hover:border-outline-variant">
      {onAccion ? (
        <button
          type="button"
          onClick={onAccion}
          className="flex cursor-pointer flex-col gap-2.5 p-3.5 text-left transition-colors hover:bg-surface-container-high focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
        >
          {contenido}
        </button>
      ) : (
        <div className="flex flex-col gap-2.5 p-3.5">{contenido}</div>
      )}
      <div className="flex items-center justify-between gap-2 border-t border-outline-variant/20 px-3.5 py-2.5 text-xs text-on-surface-variant">
        {pistaId ? (
          <button
            type="button"
            onClick={() => onAbrirPista(pistaId)}
            className="flex items-center gap-1.5 rounded font-medium text-on-surface transition-colors hover:text-primary"
          >
            <Grid2x2 size={14} className="text-secondary" />
            {orden.pista_nombre ?? 'Pista'}
          </button>
        ) : (
          <span>General</span>
        )}
        {orden.estado === 'cerrada' ? (
          <span className="flex items-center gap-1.5">
            Reparación
            <span className="rounded border border-outline-variant/30 bg-surface-container-high px-2 py-0.5 font-mono text-[11px] text-secondary tabular-nums">
              {horasTexto(orden.horas_reparacion)}
            </span>
          </span>
        ) : (
          <span className="text-[11px] tabular-nums">
            {orden.estado === 'en_proceso' && orden.iniciada_en
              ? `Iniciada ${hora(orden.iniciada_en)}`
              : `Reportada ${fechaHora(orden.reportada_en)}`}
          </span>
        )}
      </div>
    </article>
  )
}

export function OrdenesTrabajo(props: OrdenesTrabajoProps) {
  const [tipo, setTipo] = useState<FiltroTipo>('todas')
  const [pistaFiltro, setPistaFiltro] = useState('')
  const [iniciando, setIniciando] = useState<OrdenTrabajo | null>(null)
  const [responsableIniciar, setResponsableIniciar] = useState('')
  const [guardando, setGuardando] = useState(false)

  const visibles = useMemo(
    () =>
      props.ordenes.filter(
        (o) => (tipo === 'todas' || o.tipo === tipo) && (pistaFiltro === '' || o.pista_id === pistaFiltro),
      ),
    [props.ordenes, tipo, pistaFiltro],
  )

  function abrirInicio(orden: OrdenTrabajo) {
    setResponsableIniciar(orden.responsable_id ?? '')
    setIniciando(orden)
  }

  async function confirmarInicio() {
    if (!iniciando) return
    setGuardando(true)
    try {
      const ok = await props.onIniciarOrden(iniciando.id, responsableIniciar || null)
      if (ok) setIniciando(null)
    } finally {
      setGuardando(false)
    }
  }

  function accionDe(orden: OrdenTrabajo): (() => void) | null {
    if (orden.estado === 'abierta') return () => abrirInicio(orden)
    if (orden.estado === 'en_proceso') return () => props.onCerrarOrden(orden)
    return null
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-56">
            <Select
              aria-label="Filtrar por pista"
              value={pistaFiltro}
              onChange={(e) => setPistaFiltro(e.target.value)}
            >
              <option value="">Todas las pistas</option>
              {props.pistas.map((p) => (
                <option key={p.pista_id} value={p.pista_id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          </div>
          <SegmentedControl label="Tipo de orden" value={tipo} onChange={setTipo} options={FILTRO_TIPO} />
        </div>
        <Button variant="primary" onClick={() => props.onReportarFalla()}>
          <Plus size={16} />
          Reportar falla
        </Button>
      </div>

      {props.loading && props.ordenes.length === 0 ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {COLUMNAS.map((c) => (
            <div
              key={c.estado}
              className="flex flex-col gap-3 rounded-lg border border-outline-variant/30 bg-surface-container-low p-3"
            >
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ))}
        </div>
      ) : props.ordenes.length === 0 ? (
        <EmptyState
          icon={<Wrench />}
          title="No hay órdenes de trabajo"
          action={<Button onClick={() => props.onReportarFalla()}>Reportar falla</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
          {COLUMNAS.map((c) => {
            const filas = visibles.filter((o) => o.estado === c.estado)
            return (
              <section
                key={c.estado}
                aria-label={c.titulo}
                className="flex flex-col rounded-lg border border-outline-variant/30 bg-surface-container-low"
              >
                <header className="flex items-center justify-between gap-2 border-b border-outline-variant/30 bg-surface-container/60 px-3.5 py-3">
                  <div className="flex items-center gap-2">
                    <span aria-hidden="true" className={`h-2 w-2 rounded-full ${c.punto}`} />
                    <h2 className="text-xs font-semibold tracking-wider text-on-surface uppercase">{c.titulo}</h2>
                  </div>
                  <span className="rounded border border-outline-variant/30 bg-surface-container-highest px-1.5 py-0.5 text-[11px] font-medium text-on-surface-variant tabular-nums">
                    {filas.length}
                  </span>
                </header>
                <div className="flex flex-col gap-3 p-3">
                  {filas.length === 0 ? (
                    <p className="py-6 text-center text-xs text-outline">Sin órdenes</p>
                  ) : (
                    filas.map((o) => (
                      <TarjetaOrden
                        key={o.id}
                        orden={o}
                        onAccion={accionDe(o)}
                        onAbrirPista={props.onAbrirPista}
                      />
                    ))
                  )}
                </div>
              </section>
            )
          })}
        </div>
      )}

      <Modal
        open={iniciando !== null}
        onClose={() => setIniciando(null)}
        title={iniciando ? `Iniciar ${iniciando.folio}` : 'Iniciar orden'}
        description="La orden pasa a en proceso."
        dismissable={!guardando}
        footer={
          <>
            <Button onClick={() => setIniciando(null)} disabled={guardando}>
              Cancelar
            </Button>
            <Button variant="primary" loading={guardando} onClick={confirmarInicio}>
              Iniciar orden
            </Button>
          </>
        }
      >
        <Field label="Responsable" htmlFor="iniciar-responsable" hint="Opcional: quien atiende la falla.">
          <Select
            id="iniciar-responsable"
            value={responsableIniciar}
            onChange={(e) => setResponsableIniciar(e.target.value)}
          >
            <option value="">Sin asignar</option>
            {props.empleados.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </Select>
        </Field>
      </Modal>
    </div>
  )
}
