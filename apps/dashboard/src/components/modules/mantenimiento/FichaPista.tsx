'use client'

import { useState } from 'react'
import { ArrowLeft, FileText, Pencil, Play, Plus, Unlock } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Field,
  IconButton,
  Input,
  Modal,
  Money,
  Table,
  Textarea,
  type Column,
} from '@/components/ds'
import type {
  BloqueoPista,
  EstadoPista,
  EstadoTarea,
  FichaPistaPatch,
  IndicadoresPista,
  OrdenEstado,
  OrdenTipo,
  OrdenTrabajo,
  PistaMantenimiento,
  TareaPreventiva,
} from '@/lib/supabase/queries/mantenimiento'
import {
  ESTADO_ORDEN_LABEL,
  ESTADO_PISTA_LABEL,
  ESTADO_TAREA_LABEL,
  describirFrecuencia,
} from '@/lib/supabase/queries/mantenimiento'

// Stitch: Ficha técnica de pista (920ef650b56c4c8993488484abc301f5)
export interface FichaPistaProps {
  pista: PistaMantenimiento
  /** Indicadores de ESTA pista en el periodo (null mientras carga o sin datos) */
  indicadores: IndicadoresPista | null
  periodoDias: number
  /** Órdenes de la pista, más recientes primero (abiertas y cerradas) */
  ordenes: OrdenTrabajo[]
  /** Bloqueos vigentes o programados de la pista */
  bloqueos: BloqueoPista[]
  /** Tareas preventivas que aplican a la pista */
  tareas: TareaPreventiva[]
  onVolver: () => void
  /** Guarda los datos de la ficha. true = guardado */
  onGuardarFicha: (patch: FichaPistaPatch) => Promise<boolean>
  /** Abre "Reportar falla" con esta pista preseleccionada */
  onReportarFalla: () => void
  onIniciarOrden: (ordenId: string) => Promise<boolean>
  /** Abre el panel "Cerrar orden" de la orden */
  onCerrarOrden: (orden: OrdenTrabajo) => void
  /** Cierra los bloqueos vigentes y deja la pista operativa. true = hecho */
  onLiberarPista: () => Promise<boolean>
}

const TONO_PISTA: Record<EstadoPista, 'success' | 'warning' | 'error'> = {
  operativa: 'success',
  mantenimiento: 'warning',
  fuera_de_servicio: 'error',
}
const TONO_TAREA: Record<EstadoTarea, 'success' | 'warning' | 'error'> = {
  al_dia: 'success',
  proxima: 'warning',
  vencida: 'error',
}
const TONO_ORDEN: Record<OrdenEstado, 'warning' | 'info' | 'neutral'> = {
  abierta: 'warning',
  en_proceso: 'info',
  cerrada: 'neutral',
}
const TIPO_ORDEN: Record<OrdenTipo, { etiqueta: string; tono: 'success' | 'error' }> = {
  preventiva: { etiqueta: 'Preventivo', tono: 'success' },
  correctiva: { etiqueta: 'Correctivo', tono: 'error' },
}
const BLOQUEO_TIPO: Record<BloqueoPista['tipo'], { etiqueta: string; tono: 'error' | 'success' | 'neutral' }> = {
  fuera_de_servicio: { etiqueta: 'Fuera de servicio', tono: 'error' },
  preventivo: { etiqueta: 'Preventivo', tono: 'success' },
  otro: { etiqueta: 'Otro', tono: 'neutral' },
}

const FECHA_CORTA: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
const FECHA_LARGA: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }
const MES_ANIO: Intl.DateTimeFormatOptions = { month: 'short', year: 'numeric' }
const FECHA_HORA: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }

/** Marca de tiempo ISO (timestamptz) en hora local. */
function fechaIso(iso: string, opciones: Intl.DateTimeFormatOptions): string {
  return new Date(iso).toLocaleString('es-MX', opciones)
}

/** Fecha 'YYYY-MM-DD' (tipo date): se arma en hora local para no correr el día. */
function fechaDia(ymd: string, opciones: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', opciones)
}

function formatoNumero(v: number | null, decimales = 1): string {
  return v === null ? '—' : v.toLocaleString('es-MX', { maximumFractionDigits: decimales })
}
function porcentaje(v: number | null): string {
  return v === null ? '—' : `${formatoNumero(v)}%`
}
function horas(v: number | null): string {
  return v === null ? '—' : `${formatoNumero(v)} h`
}

// ─── Ficha: edición ──────────────────────────────────────────────────────────

interface CamposFicha {
  largo_m: string
  ancho_m: string
  altura_libre_m: string
  superficie: string
  superficie_instalada_en: string
  cerramiento: string
  luminarias_num: string
  luminaria_potencia_w: string
  lux_medido: string
  uniformidad: string
  medicion_en: string
  observaciones: string
}

function aCampos(p: PistaMantenimiento): CamposFicha {
  const txt = (v: string | number | null) => (v === null ? '' : String(v))
  return {
    largo_m: txt(p.largo_m),
    ancho_m: txt(p.ancho_m),
    altura_libre_m: txt(p.altura_libre_m),
    superficie: txt(p.superficie),
    superficie_instalada_en: txt(p.superficie_instalada_en),
    cerramiento: txt(p.cerramiento),
    luminarias_num: txt(p.luminarias_num),
    luminaria_potencia_w: txt(p.luminaria_potencia_w),
    lux_medido: txt(p.lux_medido),
    uniformidad: txt(p.uniformidad),
    medicion_en: txt(p.medicion_en),
    observaciones: txt(p.observaciones),
  }
}

/** Campo vacío = null. Los numéricos se mandan como número. */
function aPatch(c: CamposFicha): FichaPistaPatch {
  const texto = (s: string) => (s.trim() === '' ? null : s.trim())
  const numero = (s: string) => (s.trim() === '' || !Number.isFinite(Number(s)) ? null : Number(s))
  return {
    largo_m: numero(c.largo_m),
    ancho_m: numero(c.ancho_m),
    altura_libre_m: numero(c.altura_libre_m),
    superficie: texto(c.superficie),
    superficie_instalada_en: texto(c.superficie_instalada_en),
    cerramiento: texto(c.cerramiento),
    luminarias_num: numero(c.luminarias_num),
    luminaria_potencia_w: numero(c.luminaria_potencia_w),
    lux_medido: numero(c.lux_medido),
    uniformidad: numero(c.uniformidad),
    medicion_en: texto(c.medicion_en),
    observaciones: texto(c.observaciones),
  }
}

interface CampoFichaProps {
  id: string
  label: string
  valor: string
  onCambio: (valor: string) => void
  tipo?: 'text' | 'number' | 'date'
  step?: string
  area?: boolean
  completo?: boolean
}

function CampoFicha({ id, label, valor, onCambio, tipo = 'text', step, area = false, completo = false }: CampoFichaProps) {
  return (
    <div className={completo ? 'sm:col-span-2' : undefined}>
      <Field label={label} htmlFor={id}>
        {area ? (
          <Textarea id={id} value={valor} onChange={(e) => onCambio(e.target.value)} />
        ) : (
          <Input id={id} type={tipo} step={step} value={valor} onChange={(e) => onCambio(e.target.value)} />
        )}
      </Field>
    </div>
  )
}

// ─── Piezas de lectura ───────────────────────────────────────────────────────

function Dato({ etiqueta, valor, completo = false }: { etiqueta: string; valor: string; completo?: boolean }) {
  return (
    <div
      className={
        completo
          ? 'flex flex-col gap-1 border-t border-outline-variant/30 pt-2 sm:col-span-2'
          : 'flex flex-col gap-1'
      }
    >
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">{etiqueta}</dt>
      <dd className="text-sm font-medium tabular-nums text-on-surface">{valor}</dd>
    </div>
  )
}

function KpiTile({ etiqueta, valor, titulo }: { etiqueta: string; valor: string; titulo?: string }) {
  return (
    <div className="rounded-lg border border-outline-variant/60 bg-surface-container-high/70 p-3">
      <span title={titulo} className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
        {etiqueta}
      </span>
      <div className="text-xl font-semibold tabular-nums text-on-surface">{valor}</div>
    </div>
  )
}

const COLUMNAS_TAREAS: Column<TareaPreventiva>[] = [
  {
    key: 'tarea',
    header: 'Tarea',
    render: (t) => <span className="font-medium text-on-surface">{t.nombre}</span>,
  },
  {
    key: 'frecuencia',
    header: 'Frecuencia',
    render: (t) => (
      <span className="text-xs text-on-surface-variant">{describirFrecuencia(t.frecuencia_tipo, t.frecuencia_valor)}</span>
    ),
  },
  {
    key: 'proxima',
    header: 'Próxima',
    render: (t) => (
      <span className="text-xs font-medium tabular-nums text-on-surface">
        {t.proxima_fecha
          ? fechaIso(t.proxima_fecha, FECHA_CORTA)
          : `${formatoNumero(t.uso_acumulado_h)} de ${t.frecuencia_valor} h`}
      </span>
    ),
  },
  {
    key: 'estado',
    header: 'Estado',
    align: 'right',
    render: (t) => <Badge tone={TONO_TAREA[t.estado]}>{ESTADO_TAREA_LABEL[t.estado]}</Badge>,
  },
]

// ─── Pantalla ────────────────────────────────────────────────────────────────

export function FichaPista(props: FichaPistaProps) {
  const p = props.pista
  const ind = props.indicadores

  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState<CamposFicha>(() => aCampos(p))
  const [guardando, setGuardando] = useState(false)
  const [confirmarLiberar, setConfirmarLiberar] = useState(false)
  const [liberando, setLiberando] = useState(false)
  const [iniciando, setIniciando] = useState<string | null>(null)

  const abiertas = props.ordenes.filter((o) => o.estado !== 'cerrada')
  const cerradas = props.ordenes.filter((o) => o.estado === 'cerrada').slice(0, 5)

  const dimensiones =
    p.largo_m === null || p.ancho_m === null ? '—' : `${formatoNumero(p.largo_m)} × ${formatoNumero(p.ancho_m)} m`
  const iluminacion =
    p.luminarias_num === null || p.luminaria_potencia_w === null
      ? '—'
      : `${formatoNumero(p.luminarias_num)} luminarias de ${formatoNumero(p.luminaria_potencia_w)} W`
  const medicion =
    [
      p.lux_medido === null ? null : `${formatoNumero(p.lux_medido)} lx`,
      p.uniformidad === null ? null : `uniformidad ${formatoNumero(p.uniformidad, 2)}`,
      p.medicion_en === null ? null : `medido el ${fechaDia(p.medicion_en, FECHA_LARGA)}`,
    ]
      .filter(Boolean)
      .join(' · ') || '—'

  function abrirEdicion() {
    setForm(aCampos(p))
    setEditando(true)
  }

  function setCampo(clave: keyof CamposFicha, valor: string) {
    setForm((f) => ({ ...f, [clave]: valor }))
  }

  async function handleGuardarFicha() {
    setGuardando(true)
    const ok = await props.onGuardarFicha(aPatch(form))
    setGuardando(false)
    if (ok) setEditando(false)
  }

  async function handleIniciar(ordenId: string) {
    setIniciando(ordenId)
    await props.onIniciarOrden(ordenId)
    setIniciando(null)
  }

  async function handleLiberar() {
    setLiberando(true)
    const ok = await props.onLiberarPista()
    setLiberando(false)
    if (ok) setConfirmarLiberar(false)
  }

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-6">
      {/* Cabecera */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <IconButton icon={<ArrowLeft className="size-4" />} label="Volver" onClick={() => props.onVolver()} />
          <div className="h-4 w-px bg-outline-variant" />
          <h1 className="truncate text-lg font-semibold tracking-tight text-on-surface">{p.nombre}</h1>
          <Badge tone={TONO_PISTA[p.estado_operativo]}>{ESTADO_PISTA_LABEL[p.estado_operativo]}</Badge>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {p.estado_operativo !== 'operativa' ? (
            <Button variant="secondary" size="sm" onClick={() => setConfirmarLiberar(true)}>
              <Unlock className="size-3.5" />
              Liberar pista
            </Button>
          ) : null}
          <Button variant="primary" size="sm" onClick={() => props.onReportarFalla()}>
            <Plus className="size-3.5" />
            Reportar falla
          </Button>
        </div>
      </header>

      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        {/* Columna principal */}
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <Card padding="lg">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/60 pb-4">
              <div className="flex flex-wrap items-center gap-2">
                <FileText className="size-4 text-primary" />
                <h2 className="text-sm font-semibold text-on-surface">Ficha técnica</h2>
                <Badge tone="neutral">{p.tipo}</Badge>
              </div>
              <Button variant="secondary" size="sm" onClick={abrirEdicion}>
                <Pencil className="size-3.5" />
                Editar
              </Button>
            </div>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
              <Dato etiqueta="Dimensiones" valor={dimensiones} />
              <Dato etiqueta="Altura libre" valor={p.altura_libre_m === null ? '—' : `${formatoNumero(p.altura_libre_m)} m`} />
              <Dato etiqueta="Superficie de juego" valor={p.superficie ?? '—'} completo />
              <Dato
                etiqueta="Instalación de superficie"
                valor={p.superficie_instalada_en ? fechaDia(p.superficie_instalada_en, MES_ANIO) : '—'}
              />
              <Dato etiqueta="Iluminación" valor={iluminacion} />
              <Dato etiqueta="Cerramiento" valor={p.cerramiento ?? '—'} completo />
              <Dato etiqueta="Nivel de iluminación medido" valor={medicion} completo />
              <Dato etiqueta="Nota de mantenimiento" valor={p.nota_mantenimiento ?? '—'} completo />
              <Dato etiqueta="Observaciones" valor={p.observaciones ?? '—'} completo />
            </dl>
          </Card>

          <Card padding="lg">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-on-surface">Plan preventivo de esta pista</h2>
              <p className="mt-0.5 text-xs text-on-surface-variant">
                {props.tareas.length} {props.tareas.length === 1 ? 'tarea' : 'tareas'} que aplican a esta pista
              </p>
            </div>
            <Table
              columns={COLUMNAS_TAREAS}
              rows={props.tareas}
              rowKey={(t) => t.id}
              empty={<p className="py-6 text-center text-sm text-on-surface-variant">Ninguna tarea aplica a esta pista.</p>}
            />
          </Card>

          {abiertas.length > 0 ? (
            <Card padding="lg">
              <h2 className="mb-4 text-sm font-semibold text-on-surface">Órdenes abiertas</h2>
              <ul className="flex flex-col gap-3">
                {abiertas.map((o) => (
                  <li
                    key={o.id}
                    className="flex flex-col gap-3 rounded-lg border border-outline-variant/60 bg-surface-container-high/60 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-medium tabular-nums text-on-surface">{o.folio}</span>
                        <Badge tone={TIPO_ORDEN[o.tipo].tono}>{TIPO_ORDEN[o.tipo].etiqueta}</Badge>
                        <Badge tone={TONO_ORDEN[o.estado]}>{ESTADO_ORDEN_LABEL[o.estado]}</Badge>
                      </div>
                      <p className="text-sm font-medium text-on-surface">{o.descripcion}</p>
                      <p className="text-xs text-on-surface-variant">
                        Reportó {o.reportada_por_nombre ?? '—'} · {fechaIso(o.reportada_en, FECHA_HORA)}
                        {o.responsable_nombre ? ` · Responsable ${o.responsable_nombre}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {o.estado === 'abierta' ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={iniciando === o.id}
                          disabled={iniciando !== null}
                          onClick={() => handleIniciar(o.id)}
                        >
                          <Play className="size-3.5" />
                          Iniciar
                        </Button>
                      ) : null}
                      <Button variant="primary" size="sm" onClick={() => props.onCerrarOrden(o)}>
                        Cerrar orden
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        {/* Columna lateral */}
        <div className="flex w-full flex-col gap-6 xl:w-[360px] xl:shrink-0">
          <Card padding="lg" className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-on-surface">Indicadores ({props.periodoDias} días)</h2>
            {ind ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <KpiTile etiqueta="Ocupación" valor={porcentaje(ind.ocupacion_pct)} />
                  <KpiTile etiqueta="Disponibilidad" valor={porcentaje(ind.disponibilidad_pct)} />
                  <KpiTile etiqueta="MTBF" titulo="Tiempo medio entre fallas" valor={horas(ind.mtbf_h)} />
                  <KpiTile etiqueta="MTTR" titulo="Tiempo medio de reparación" valor={horas(ind.mttr_h)} />
                </div>
                <dl className="flex flex-col gap-2 border-t border-outline-variant/40 pt-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-on-surface-variant">Fallas</dt>
                    <dd className="font-medium tabular-nums text-on-surface">{ind.fallas}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-on-surface-variant">Horas fuera de servicio</dt>
                    <dd className="font-medium tabular-nums text-on-surface">{horas(ind.horas_fuera_servicio)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-on-surface-variant">Costo de mantenimiento</dt>
                    <dd className="font-medium text-on-surface">
                      <Money value={ind.costo_mantenimiento} />
                    </dd>
                  </div>
                </dl>
              </>
            ) : (
              <p className="text-sm text-on-surface-variant">Sin indicadores en el periodo.</p>
            )}
          </Card>

          <Card padding="lg" className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-on-surface">Bloqueos de agenda</h2>
            {props.bloqueos.length === 0 ? (
              <p className="text-sm text-on-surface-variant">Sin bloqueos vigentes ni programados.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {props.bloqueos.map((b) => (
                  <li
                    key={b.id}
                    className="flex flex-col gap-1.5 rounded-lg border border-outline-variant/60 bg-surface-container-high/60 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Badge tone={BLOQUEO_TIPO[b.tipo].tono}>{BLOQUEO_TIPO[b.tipo].etiqueta}</Badge>
                      <span className="text-[11px] tabular-nums text-on-surface-variant">
                        {fechaIso(b.inicio, FECHA_HORA)} – {b.fin ? fechaIso(b.fin, FECHA_HORA) : 'Hasta nuevo aviso'}
                      </span>
                    </div>
                    <p className="text-sm text-on-surface">{b.motivo}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card padding="lg" className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-on-surface">Historial reciente</h2>
            {cerradas.length === 0 ? (
              <p className="text-sm text-on-surface-variant">Sin órdenes cerradas.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {cerradas.map((o) => (
                  <li
                    key={o.id}
                    className="flex flex-col gap-2 rounded-lg border border-outline-variant/60 bg-surface-container-high/60 p-3"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium tabular-nums text-on-surface-variant">
                        {fechaIso(o.cerrada_en ?? o.reportada_en, FECHA_LARGA)}
                      </span>
                      <Badge tone={TIPO_ORDEN[o.tipo].tono}>{TIPO_ORDEN[o.tipo].etiqueta}</Badge>
                    </div>
                    <p className="text-sm font-medium leading-snug text-on-surface">{o.descripcion}</p>
                    <div className="flex items-center justify-between border-t border-outline-variant/30 pt-2 text-[11px] text-on-surface-variant">
                      <span className="tabular-nums">{o.folio}</span>
                      <span>
                        Duración{' '}
                        <span className="font-medium tabular-nums text-on-surface">{horas(o.horas_reparacion)}</span>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Modal
        open={editando}
        onClose={() => setEditando(false)}
        title="Editar ficha técnica"
        description="El estado operativo no se edita aquí: lo cambian las órdenes y los bloqueos."
        size="lg"
        dismissable={!guardando}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditando(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={handleGuardarFicha} loading={guardando}>
              Guardar ficha
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CampoFicha id="ficha-largo" label="Largo (m)" tipo="number" step="0.01" valor={form.largo_m} onCambio={(v) => setCampo('largo_m', v)} />
          <CampoFicha id="ficha-ancho" label="Ancho (m)" tipo="number" step="0.01" valor={form.ancho_m} onCambio={(v) => setCampo('ancho_m', v)} />
          <CampoFicha id="ficha-altura" label="Altura libre (m)" tipo="number" step="0.01" valor={form.altura_libre_m} onCambio={(v) => setCampo('altura_libre_m', v)} />
          <CampoFicha id="ficha-cerramiento" label="Cerramiento" valor={form.cerramiento} onCambio={(v) => setCampo('cerramiento', v)} completo />
          <CampoFicha id="ficha-superficie" label="Superficie de juego" valor={form.superficie} onCambio={(v) => setCampo('superficie', v)} completo />
          <CampoFicha id="ficha-superficie-fecha" label="Instalación de superficie" tipo="date" valor={form.superficie_instalada_en} onCambio={(v) => setCampo('superficie_instalada_en', v)} />
          <CampoFicha id="ficha-luminarias" label="Luminarias" tipo="number" step="1" valor={form.luminarias_num} onCambio={(v) => setCampo('luminarias_num', v)} />
          <CampoFicha id="ficha-potencia" label="Potencia por luminaria (W)" tipo="number" step="1" valor={form.luminaria_potencia_w} onCambio={(v) => setCampo('luminaria_potencia_w', v)} />
          <CampoFicha id="ficha-lux" label="Lux medido (lx)" tipo="number" step="1" valor={form.lux_medido} onCambio={(v) => setCampo('lux_medido', v)} />
          <CampoFicha id="ficha-uniformidad" label="Uniformidad" tipo="number" step="0.01" valor={form.uniformidad} onCambio={(v) => setCampo('uniformidad', v)} />
          <CampoFicha id="ficha-medicion" label="Fecha de medición" tipo="date" valor={form.medicion_en} onCambio={(v) => setCampo('medicion_en', v)} />
          <CampoFicha id="ficha-observaciones" label="Observaciones" area valor={form.observaciones} onCambio={(v) => setCampo('observaciones', v)} completo />
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmarLiberar}
        onCancel={() => setConfirmarLiberar(false)}
        onConfirm={handleLiberar}
        title="Liberar pista"
        consequence={`Se cierran los bloqueos vigentes de ${p.nombre} y se cancelan los programados. La pista vuelve a estar operativa.`}
        confirmLabel="Liberar pista"
        loading={liberando}
      />
    </div>
  )
}
