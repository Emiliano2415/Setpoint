'use client'

import { useState } from 'react'
import { ClipboardCheck, Info } from 'lucide-react'
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Modal,
  Select,
  Skeleton,
  StatCard,
  Table,
  type Column,
} from '@/components/ds'
import {
  describirFrecuencia,
  ESTADO_NORMA_LABEL,
  type CrearInspeccionInput,
  type EmpleadoOpcion,
  type EstadoNorma,
  type InspeccionEstado,
  type InspeccionRow,
  type NormaResumen,
  type PistaMantenimiento,
} from '@/lib/supabase/queries/mantenimiento'

// Stitch: Inspecciones por norma (736d01e04de3445d943c32af7b6e8b3e)
export interface InspeccionesProps {
  loading: boolean
  /** Las normas con su última inspección y vencimiento (tarjetas) */
  normas: NormaResumen[]
  /** Historial de inspecciones con su cumplimiento, más recientes primero */
  inspecciones: InspeccionRow[]
  pistas: PistaMantenimiento[]
  empleados: EmpleadoOpcion[]
  /**
   * Crea una inspección en borrador y abre la pantalla "Inspección en curso".
   * Si la norma ya tiene un borrador (`norma.borrador_id`) usar onAbrirInspeccion en su lugar.
   */
  onIniciarInspeccion: (input: CrearInspeccionInput) => Promise<boolean>
  /** Abre una inspección existente (borrador: se continúa; finalizada: solo lectura) */
  onAbrirInspeccion: (inspeccionId: string) => void
}

const ESTADO_INSPECCION_LABEL: Record<InspeccionEstado, string> = {
  borrador: 'En curso',
  finalizada: 'Finalizada',
}

const TONO_ESTADO_NORMA: Record<EstadoNorma, 'neutral' | 'error' | 'warning' | 'success'> = {
  sin_inspeccion: 'neutral',
  vencida: 'error',
  proxima: 'warning',
  al_dia: 'success',
}

const COLOR_PROXIMA: Record<EstadoNorma, string> = {
  sin_inspeccion: 'text-on-surface-variant',
  vencida: 'text-error',
  proxima: 'text-warning',
  al_dia: 'text-on-surface-variant',
}

/** 'YYYY-MM-DD' a fecha legible, sin desfase de zona horaria. */
function formatearFecha(ymd: string | null): string {
  if (!ymd) return '—'
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatearPct(valor: number | null): string {
  return valor === null ? '—' : `${valor}%`
}

export function Inspecciones(props: InspeccionesProps) {
  // Estado visual: modal "Iniciar inspección" para la norma elegida
  const [normaAIniciar, setNormaAIniciar] = useState<NormaResumen | null>(null)
  const [pistaElegida, setPistaElegida] = useState('')
  const [responsableElegido, setResponsableElegido] = useState('')
  const [guardando, setGuardando] = useState(false)

  // Cifras derivadas de las listas recibidas
  const pctsUltimas = props.normas
    .map((n) => n.ultimo_cumplimiento_pct)
    .filter((v): v is number => v !== null)
  const cumplimientoGeneral =
    pctsUltimas.length > 0
      ? Math.round((pctsUltimas.reduce((a, b) => a + b, 0) / pctsUltimas.length) * 10) / 10
      : null
  const vencidas = props.normas.filter((n) => n.estado === 'vencida')
  const noConformidades = props.inspecciones
    .filter((i) => i.estado === 'finalizada')
    .reduce((total, i) => total + i.no_cumple, 0)

  function iniciarOContinuar(norma: NormaResumen) {
    if (norma.borrador_id) {
      props.onAbrirInspeccion(norma.borrador_id)
      return
    }
    setPistaElegida('')
    setResponsableElegido('')
    setNormaAIniciar(norma)
  }

  async function confirmarInicio() {
    if (!normaAIniciar) return
    setGuardando(true)
    const ok = await props.onIniciarInspeccion({
      normaId: normaAIniciar.norma_id,
      pistaId: pistaElegida || null,
      responsableId: responsableElegido || null,
    })
    setGuardando(false)
    if (ok) setNormaAIniciar(null)
  }

  function vacio(titulo: string) {
    return props.loading ? (
      <Skeleton className="m-4 h-16" />
    ) : (
      <EmptyState icon={<ClipboardCheck />} title={titulo} />
    )
  }

  const columnasNormas: Column<NormaResumen>[] = [
    {
      key: 'norma',
      header: 'Norma',
      render: (n) => (
        <div className="flex max-w-xs flex-col gap-0.5">
          <span className="whitespace-nowrap text-xs font-medium text-on-surface">{n.codigo}</span>
          <span className="text-xs text-on-surface-variant">{n.nombre}</span>
        </div>
      ),
    },
    {
      key: 'alcance',
      header: 'Alcance',
      render: (n) => (
        <span className="block max-w-[280px] truncate text-xs text-on-surface-variant" title={n.alcance ?? undefined}>
          {n.alcance ?? '—'}
        </span>
      ),
    },
    {
      key: 'frecuencia',
      header: 'Frecuencia',
      render: (n) => (
        <span className="whitespace-nowrap text-xs text-on-surface-variant">
          {describirFrecuencia('meses', n.frecuencia_meses)}
        </span>
      ),
    },
    {
      key: 'ultima',
      header: 'Última',
      render: (n) => (
        <span className="whitespace-nowrap text-xs tabular-nums text-on-surface-variant">
          {formatearFecha(n.ultima_fecha)}
        </span>
      ),
    },
    {
      key: 'proxima',
      header: 'Próxima',
      render: (n) => (
        <span className={`whitespace-nowrap text-xs font-medium tabular-nums ${COLOR_PROXIMA[n.estado]}`}>
          {formatearFecha(n.proxima_fecha)}
        </span>
      ),
    },
    {
      key: 'cumplimiento',
      header: 'Cumplimiento',
      align: 'right',
      render: (n) => <span className="text-xs font-medium text-on-surface">{formatearPct(n.ultimo_cumplimiento_pct)}</span>,
    },
    {
      key: 'estado',
      header: 'Estado',
      render: (n) => <Badge tone={TONO_ESTADO_NORMA[n.estado]}>{ESTADO_NORMA_LABEL[n.estado]}</Badge>,
    },
    {
      key: 'accion',
      header: 'Acción',
      align: 'right',
      render: (n) => (
        <Button size="sm" variant="secondary" onClick={() => iniciarOContinuar(n)}>
          {n.borrador_id ? 'Continuar' : 'Iniciar'}
        </Button>
      ),
    },
  ]

  const columnasHistorial: Column<InspeccionRow>[] = [
    {
      key: 'fecha',
      header: 'Fecha',
      render: (i) => (
        <span className="whitespace-nowrap text-xs tabular-nums text-on-surface-variant">{formatearFecha(i.fecha)}</span>
      ),
    },
    {
      key: 'norma',
      header: 'Norma',
      render: (i) => <span className="whitespace-nowrap text-xs font-medium text-on-surface">{i.norma_codigo}</span>,
    },
    {
      key: 'pista',
      header: 'Pista',
      render: (i) => (
        <span className="whitespace-nowrap text-xs text-on-surface-variant">
          {i.pista_nombre ?? 'Instalaciones generales'}
        </span>
      ),
    },
    {
      key: 'responsable',
      header: 'Responsable',
      render: (i) => <span className="whitespace-nowrap text-xs text-on-surface-variant">{i.responsable_nombre ?? '—'}</span>,
    },
    {
      key: 'estado',
      header: 'Estado',
      render: (i) => (
        <Badge tone={i.estado === 'finalizada' ? 'success' : 'warning'}>{ESTADO_INSPECCION_LABEL[i.estado]}</Badge>
      ),
    },
    {
      key: 'cumplimiento',
      header: 'Cumplimiento',
      align: 'right',
      render: (i) => <span className="text-xs font-medium text-on-surface">{formatearPct(i.cumplimiento_pct)}</span>,
    },
    {
      key: 'no_cumple',
      header: 'No cumple',
      align: 'right',
      render: (i) => <span className="text-xs text-on-surface">{i.no_cumple}</span>,
    },
    {
      key: 'ordenes',
      header: 'Órdenes',
      align: 'right',
      render: (i) => <span className="text-xs text-on-surface">{i.ordenes_generadas}</span>,
    },
    {
      key: 'accion',
      header: 'Acción',
      align: 'right',
      render: (i) => (
        <Button
          size="sm"
          variant={i.estado === 'borrador' ? 'secondary' : 'ghost'}
          onClick={() => props.onAbrirInspeccion(i.id)}
        >
          {i.estado === 'borrador' ? 'Continuar' : 'Ver'}
        </Button>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Cumplimiento general"
          value={props.loading ? '—' : formatearPct(cumplimientoGeneral)}
          hint="Promedio de la última inspección de cada norma"
        />
        <StatCard
          label="Inspecciones vencidas"
          value={props.loading ? '—' : vencidas.length}
          hint={vencidas.length > 0 ? vencidas.map((n) => n.codigo).join(', ') : 'Ninguna'}
          tone={vencidas.length > 0 ? 'error' : 'neutral'}
        />
        <StatCard
          label="No conformidades"
          value={props.loading ? '—' : noConformidades}
          hint="De inspecciones finalizadas"
          tone={noConformidades > 0 ? 'warning' : 'neutral'}
        />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold tracking-tight text-on-surface">Inspecciones normativas federales</h2>
          <span className="text-xs tabular-nums text-on-surface-variant">({props.normas.length} protocolos)</span>
        </div>
        <Table
          columns={columnasNormas}
          rows={props.normas}
          rowKey={(n) => n.norma_id}
          empty={vacio('No hay normas en el catálogo')}
        />
        <p className="flex items-center gap-2 text-xs text-on-surface-variant">
          <Info size={14} className="shrink-0" aria-hidden="true" />
          Cada «No cumple» genera una orden correctiva automáticamente.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold tracking-tight text-on-surface">Historial de inspecciones</h2>
          <span className="text-xs tabular-nums text-on-surface-variant">({props.inspecciones.length})</span>
        </div>
        <Table
          columns={columnasHistorial}
          rows={props.inspecciones}
          rowKey={(i) => i.id}
          empty={vacio('Todavía no hay inspecciones registradas')}
        />
      </section>

      <Modal
        open={normaAIniciar !== null}
        onClose={() => setNormaAIniciar(null)}
        title="Iniciar inspección"
        description={normaAIniciar ? `${normaAIniciar.codigo} · ${normaAIniciar.nombre}` : undefined}
        dismissable={!guardando}
        footer={
          <>
            <Button variant="ghost" onClick={() => setNormaAIniciar(null)} disabled={guardando}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={confirmarInicio} loading={guardando}>
              Iniciar inspección
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Pista" htmlFor="inspeccion-pista">
            <Select
              id="inspeccion-pista"
              value={pistaElegida}
              onChange={(e) => setPistaElegida(e.target.value)}
            >
              <option value="">Instalaciones generales</option>
              {props.pistas.map((p) => (
                <option key={p.pista_id} value={p.pista_id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Responsable" htmlFor="inspeccion-responsable">
            <Select
              id="inspeccion-responsable"
              value={responsableElegido}
              onChange={(e) => setResponsableElegido(e.target.value)}
            >
              <option value="">Sin asignar</option>
              {props.empleados.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>
    </div>
  )
}
