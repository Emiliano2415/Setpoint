'use client'

import { useState, type ReactNode } from 'react'
import { ArrowLeft, CheckCircle2, ClipboardList, Info, Paperclip, TriangleAlert } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Input,
  Modal,
  SegmentedControl,
  Skeleton,
} from '@/components/ds'
import type {
  FinalizarInspeccionResultado,
  InspeccionDetalle,
  PuntoInspeccion,
  ResultadoPunto,
  ResultadoPuntoInput,
} from '@/lib/supabase/queries/mantenimiento'

// Stitch: Inspección en curso (ef6bce8cc41a46fdad65177ded10acbc)
export interface InspeccionEnCursoProps {
  loading: boolean
  /** La inspección con sus puntos; null mientras carga */
  detalle: InspeccionDetalle | null
  /** Vuelve a la pestaña Inspecciones */
  onVolver: () => void
  /**
   * Guarda (sin finalizar) los puntos indicados; solo cambia los campos que se mandan.
   * Llamar al marcar cada punto o con "Guardar borrador". true = guardado.
   */
  onGuardarResultados: (resultados: ResultadoPuntoInput[]) => Promise<boolean>
  /**
   * Finaliza: exige todos los puntos evaluados y crea una orden correctiva por cada "no cumple".
   * Devuelve null si falló (p. ej. faltan puntos; el error ya se mostró).
   */
  onFinalizar: () => Promise<FinalizarInspeccionResultado | null>
}

/** Valor del segmentado. 'sin_evaluar' no es una opción: es el valor de un punto sin resultado. */
type OpcionResultado = ResultadoPunto | 'sin_evaluar'

const OPCIONES_RESULTADO: { value: OpcionResultado; label: string }[] = [
  { value: 'cumple', label: 'Cumple' },
  { value: 'no_cumple', label: 'No cumple' },
  { value: 'na', label: 'N/A' },
]

/** Resultado en solo lectura (inspección finalizada) */
const RESULTADO_VISTA: Record<OpcionResultado, { label: string; tono: 'success' | 'error' | 'neutral' }> = {
  cumple: { label: 'Cumple', tono: 'success' },
  no_cumple: { label: 'No cumple', tono: 'error' },
  na: { label: 'N/A', tono: 'neutral' },
  sin_evaluar: { label: 'Sin evaluar', tono: 'neutral' },
}

/** 'YYYY-MM-DD' → '29 oct 2026', sin pasar por UTC */
function fechaCorta(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Porcentaje entero para mostrar; null = no calculable */
function porcentajeTexto(valor: number | null): string {
  return valor === null ? '—' : `${Math.round(valor)} %`
}

export function InspeccionEnCurso(props: InspeccionEnCursoProps) {
  const d = props.detalle

  // Observaciones editadas y todavía no guardadas, por punto_id
  const [borradores, setBorradores] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)
  const [finalizando, setFinalizando] = useState(false)
  const [confirmarFinal, setConfirmarFinal] = useState(false)
  const [resultadoFinal, setResultadoFinal] = useState<FinalizarInspeccionResultado | null>(null)

  const puntos = d?.puntos ?? []
  const editable = d?.inspeccion.estado === 'borrador'
  const total = puntos.length
  const cumple = puntos.filter((p) => p.resultado === 'cumple').length
  const noCumple = puntos.filter((p) => p.resultado === 'no_cumple').length
  const na = puntos.filter((p) => p.resultado === 'na').length
  const revisados = cumple + noCumple + na
  const sinEvaluar = total - revisados
  const porcentaje = (n: number) => (total > 0 ? (n / total) * 100 : 0)
  const cambiosPendientes = puntos.filter((p) => {
    const borrador = borradores[p.punto_id]
    return borrador !== undefined && borrador !== (p.observacion ?? '')
  })
  const hayCambios = cambiosPendientes.length > 0
  const consecuenciaFinal =
    noCumple > 0
      ? `Se creará una orden correctiva por cada "no cumple" (${noCumple}). Después no se podrá editar.`
      : 'No hay "no cumple": no se creará ninguna orden. Después no se podrá editar.'

  function obsDe(p: PuntoInspeccion): string {
    return borradores[p.punto_id] ?? p.observacion ?? ''
  }

  async function marcarPunto(puntoId: string, valor: OpcionResultado) {
    if (valor === 'sin_evaluar') return
    await props.onGuardarResultados([{ punto_id: puntoId, resultado: valor }])
  }

  function cambiarObservacion(puntoId: string, texto: string) {
    setBorradores((prev) => ({ ...prev, [puntoId]: texto }))
  }

  async function guardarBorrador(): Promise<boolean> {
    if (!hayCambios) return true
    setGuardando(true)
    try {
      return await props.onGuardarResultados(
        cambiosPendientes.map((p) => ({ punto_id: p.punto_id, observacion: borradores[p.punto_id] })),
      )
    } finally {
      setGuardando(false)
    }
  }

  async function finalizar() {
    setFinalizando(true)
    try {
      // Las observaciones pendientes se guardan antes; al finalizar ya no se editan
      if (!(await guardarBorrador())) return
      const r = await props.onFinalizar()
      if (r) setResultadoFinal(r)
    } finally {
      setFinalizando(false)
      setConfirmarFinal(false)
    }
  }

  if (!d) {
    if (props.loading) {
      return (
        <div className="mx-auto max-w-4xl space-y-5">
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
      )
    }
    return (
      <EmptyState
        icon={<ClipboardList />}
        title="No se encontró la inspección"
        action={
          <Button variant="secondary" onClick={() => props.onVolver()}>
            Volver a inspecciones
          </Button>
        }
      />
    )
  }

  const alcance = d.inspeccion.pista_nombre ?? 'Instalaciones generales'
  const responsable = d.inspeccion.responsable_nombre ?? 'Sin responsable'

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-12">
      {/* Cabecera: volver, norma, alcance, fecha, responsable y acciones */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <IconButton
            variant="secondary"
            icon={<ArrowLeft size={18} />}
            label="Volver a inspecciones"
            onClick={() => props.onVolver()}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h1 className="truncate text-base font-semibold tracking-tight text-on-surface">
                Inspección {d.inspeccion.norma_codigo}
              </h1>
              {editable ? <Badge tone="warning">Borrador</Badge> : <Badge tone="success">Finalizada</Badge>}
            </div>
            <p className="truncate text-xs text-on-surface-variant">
              {alcance} · {fechaCorta(d.inspeccion.fecha)} · {responsable}
            </p>
          </div>
        </div>

        {editable ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2.5">
            {hayCambios ? <span className="text-xs text-warning">Cambios sin guardar</span> : null}
            <Button
              variant="secondary"
              size="sm"
              disabled={!hayCambios || finalizando}
              loading={guardando}
              onClick={() => {
                void guardarBorrador()
              }}
            >
              Guardar borrador
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={sinEvaluar > 0 || finalizando || guardando}
              title={sinEvaluar > 0 ? `Faltan ${sinEvaluar} puntos por evaluar` : undefined}
              onClick={() => setConfirmarFinal(true)}
            >
              <CheckCircle2 size={16} />
              Finalizar inspección
            </Button>
          </div>
        ) : null}
      </header>

      {/* Progreso */}
      <Card>
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-on-surface">
              {revisados} de {total} puntos revisados
            </span>
            <span className="rounded border border-outline-variant bg-surface-container-highest px-2 py-0.5 text-xs font-medium tabular-nums text-secondary">
              {Math.round(porcentaje(revisados))}%
            </span>
          </div>
          {editable ? (
            <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-on-surface-variant">
              <span className="inline-flex items-center gap-1.5 text-on-surface">
                <span className="inline-block h-2 w-2 rounded-full bg-primary" />
                {cumple} Cumple
              </span>
              <span className="text-outline-variant">·</span>
              <span className="inline-flex items-center gap-1.5 text-error">
                <span className="inline-block h-2 w-2 rounded-full bg-error" />
                {noCumple} No cumple
              </span>
              <span className="text-outline-variant">·</span>
              <span className="inline-flex items-center gap-1.5 text-on-surface-variant">
                <span className="inline-block h-2 w-2 rounded-full bg-outline-variant" />
                {na} N/A
              </span>
              <span className="text-outline-variant">·</span>
              <span className="inline-flex items-center gap-1.5 text-outline">
                <span className="inline-block h-2 w-2 rounded-full bg-outline" />
                {sinEvaluar} Pendientes
              </span>
            </div>
          ) : (
            <span className="text-xs font-medium text-on-surface-variant">
              Cumplimiento {porcentajeTexto(d.inspeccion.cumplimiento_pct)} · {d.inspeccion.ordenes_generadas}{' '}
              orden(es) correctiva(s)
            </span>
          )}
        </div>
        <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-surface-container-highest">
          <div className="h-full bg-primary transition-all duration-300" style={{ width: `${porcentaje(cumple)}%` }} />
          <div className="h-full bg-error transition-all duration-300" style={{ width: `${porcentaje(noCumple)}%` }} />
          <div className="h-full bg-outline transition-all duration-300" style={{ width: `${porcentaje(na)}%` }} />
        </div>
      </Card>

      {/* Lista de puntos */}
      <Card padding="none" className="divide-y divide-outline-variant overflow-hidden">
        <div className="flex items-center justify-between bg-surface-container-high/60 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-outline">
          <div className="flex items-center gap-3">
            <span className="w-6 text-center tabular-nums">#</span>
            <span>Requisito de verificación</span>
          </div>
          <span>Evaluación de conformidad</span>
        </div>

        {puntos.map((p) => {
          const esNoCumple = p.resultado === 'no_cumple'
          const obs = obsDe(p)

          let campoObservacion: ReactNode = null
          if (editable) {
            campoObservacion = (
              <Input
                size="sm"
                aria-label={`Observación del punto ${p.orden}`}
                placeholder={esNoCumple ? 'Describe el hallazgo' : 'Observación (opcional)'}
                value={obs}
                onChange={(e) => cambiarObservacion(p.punto_id, e.target.value)}
              />
            )
          } else if (obs) {
            campoObservacion = <p className="text-xs text-on-surface-variant">{obs}</p>
          }

          return (
            <div
              key={p.punto_id}
              className={esNoCumple ? 'border-l-2 border-l-error bg-error-container/10' : 'transition-colors hover:bg-surface-container-high/30'}
            >
              <div className="space-y-2.5 px-4 py-3.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={
                        esNoCumple
                          ? 'w-6 shrink-0 pt-0.5 text-center font-mono text-xs tabular-nums text-error'
                          : 'w-6 shrink-0 pt-0.5 text-center font-mono text-xs tabular-nums text-on-surface-variant'
                      }
                    >
                      {String(p.orden).padStart(2, '0')}
                    </span>
                    <span
                      className={
                        esNoCumple
                          ? 'text-sm font-medium leading-relaxed text-on-surface'
                          : 'text-sm leading-relaxed text-on-surface'
                      }
                    >
                      {p.descripcion}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    {editable ? (
                      <SegmentedControl
                        label={`Resultado del punto ${p.orden}`}
                        value={p.resultado ?? 'sin_evaluar'}
                        options={OPCIONES_RESULTADO}
                        onChange={(valor) => marcarPunto(p.punto_id, valor)}
                      />
                    ) : (
                      <Badge tone={RESULTADO_VISTA[p.resultado ?? 'sin_evaluar'].tono}>
                        {RESULTADO_VISTA[p.resultado ?? 'sin_evaluar'].label}
                      </Badge>
                    )}
                    {p.evidencia_url?.startsWith('https://') ? (
                      <a
                        href={p.evidencia_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Ver evidencia adjunta"
                        aria-label="Ver evidencia adjunta"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container-highest hover:text-on-surface"
                      >
                        <Paperclip size={17} />
                      </a>
                    ) : null}
                  </div>
                </div>

                {esNoCumple ? (
                  <div className="ml-9 flex flex-col gap-2 rounded-lg border border-error/30 bg-surface-container-high/90 p-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <TriangleAlert size={16} className="shrink-0 text-error" />
                      {campoObservacion}
                    </div>
                    {editable ? (
                      <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded border border-error/40 bg-error/10 px-2 py-0.5 text-[11px] font-medium text-error sm:self-auto">
                        <span className="h-1.5 w-1.5 rounded-full bg-error" />
                        Se creará una orden correctiva al finalizar
                      </span>
                    ) : null}
                  </div>
                ) : campoObservacion ? (
                  <div className="ml-9 max-w-md">{campoObservacion}</div>
                ) : null}
              </div>
            </div>
          )
        })}
      </Card>

      {editable ? (
        <div className="flex items-center gap-2 px-1 text-xs text-on-surface-variant">
          <Info size={16} className="shrink-0 text-outline" />
          <span>Cada punto marcado con «No cumple» genera automáticamente una orden correctiva al finalizar.</span>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmarFinal}
        onCancel={() => setConfirmarFinal(false)}
        onConfirm={finalizar}
        title="¿Finalizar la inspección?"
        consequence={consecuenciaFinal}
        confirmLabel="Finalizar inspección"
        loading={finalizando}
      />

      <Modal
        open={resultadoFinal !== null}
        onClose={() => setResultadoFinal(null)}
        title="Inspección finalizada"
        description="La inspección quedó en solo lectura."
        footer={
          <>
            <Button variant="secondary" onClick={() => setResultadoFinal(null)}>
              Ver inspección
            </Button>
            <Button variant="primary" onClick={() => props.onVolver()}>
              Volver a inspecciones
            </Button>
          </>
        }
      >
        {resultadoFinal ? (
          <div className="space-y-4 text-sm text-on-surface">
            <p>
              Cumplimiento{' '}
              <span className="font-semibold tabular-nums">{porcentajeTexto(resultadoFinal.cumplimiento_pct)}</span>
              {' · '}Cumple: {resultadoFinal.cumple} · No cumple: {resultadoFinal.no_cumple}
            </p>
            {resultadoFinal.ordenes.length > 0 ? (
              <div className="space-y-2">
                <p className="text-on-surface-variant">Órdenes correctivas creadas:</p>
                <ul className="flex flex-wrap gap-2">
                  {resultadoFinal.ordenes.map((o) => (
                    <li key={o.orden_id}>
                      <Badge tone="error">{o.folio}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-on-surface-variant">No hubo «no cumple»: no se creó ninguna orden.</p>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
