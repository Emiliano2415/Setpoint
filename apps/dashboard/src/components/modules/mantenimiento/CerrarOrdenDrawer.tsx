'use client'

import { useState } from 'react'
import { Circle, CircleCheck, Plus, X } from 'lucide-react'
import {
  Badge,
  Button,
  Drawer,
  Field,
  IconButton,
  Input,
  Money,
  Select,
  Switch,
  Textarea,
} from '@/components/ds'
import {
  PRIORIDADES,
  type CerrarOrdenInput,
  type CerrarOrdenResultado,
  type OrdenTrabajo,
  type Refaccion,
} from '@/lib/supabase/queries/mantenimiento'

// Stitch: Cerrar orden (a3e5fe9b322c4dd29b0beba339b61d79)
export interface CerrarOrdenDrawerProps {
  /** La orden que se cierra; null = panel cerrado */
  orden: OrdenTrabajo | null
  /** Catálogo con existencias para elegir las refacciones usadas */
  refacciones: Refaccion[]
  onClose: () => void
  /**
   * Cierra la orden: registra causa, acción, mano de obra y descuenta las refacciones.
   * Devuelve null si falló (p. ej. existencia insuficiente; el error ya se mostró).
   * Al terminar bien, cerrar el panel con onClose().
   */
  onCerrarOrden: (input: CerrarOrdenInput) => Promise<CerrarOrdenResultado | null>
}

/** Refacción usada en la orden; la cantidad se edita como texto */
interface LineaRefaccion {
  refaccion_id: string
  cantidad: string
}

const PRIORIDAD_TONO = { baja: 'neutral', media: 'warning', alta: 'error' } as const

const fmtFechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-MX', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

export function CerrarOrdenDrawer({ orden, refacciones, onClose, onCerrarOrden }: CerrarOrdenDrawerProps) {
  if (!orden) return null
  // key: el formulario arranca limpio cada vez que se abre otra orden
  return (
    <CerrarOrdenForm
      key={orden.id}
      orden={orden}
      refacciones={refacciones}
      onClose={onClose}
      onCerrarOrden={onCerrarOrden}
    />
  )
}

interface CerrarOrdenFormProps {
  orden: OrdenTrabajo
  refacciones: Refaccion[]
  onClose: () => void
  onCerrarOrden: CerrarOrdenDrawerProps['onCerrarOrden']
}

function CerrarOrdenForm({ orden: o, refacciones, onClose, onCerrarOrden }: CerrarOrdenFormProps) {
  const [causa, setCausa] = useState('')
  const [accion, setAccion] = useState('')
  const [manoObra, setManoObra] = useState('')
  const [lineas, setLineas] = useState<LineaRefaccion[]>([])
  const [liberar, setLiberar] = useState(true)
  const [intentado, setIntentado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  // Momento en que se abre el panel: base del tiempo de reparación mostrado
  const [momentoCierre] = useState(() => Date.now())

  const refPorId = new Map(refacciones.map((r) => [r.id, r]))
  const usadas = new Set(lineas.map((l) => l.refaccion_id))
  // Hay alguna refacción con existencia que todavía no está en la orden
  const hayDisponible = refacciones.some((r) => r.existencia > 0 && !usadas.has(r.id))

  const manoObraNum = manoObra === '' ? 0 : Number(manoObra)
  const errCausa = o.tipo === 'correctiva' && causa.trim() === '' ? 'Obligatoria en correctivas' : undefined
  const errAccion = accion.trim() === '' ? 'Describe la acción realizada' : undefined
  const errManoObra =
    Number.isFinite(manoObraNum) && manoObraNum >= 0 ? undefined : 'Debe ser cero o mayor'
  const errorVisible = (error: string | undefined) => (intentado ? error : undefined)

  function errorLinea(l: LineaRefaccion): string | undefined {
    const ref = refPorId.get(l.refaccion_id)
    const cantidad = Number(l.cantidad)
    if (!ref) return 'Elige una refacción'
    if (!(cantidad > 0)) return 'La cantidad debe ser mayor que cero'
    if (cantidad > ref.existencia) return `Solo hay ${ref.existencia} ${ref.unidad} en existencia`
    return undefined
  }

  const valido =
    !errCausa && !errAccion && !errManoObra && lineas.every((l) => errorLinea(l) === undefined)

  const costoRefacciones = lineas.reduce((suma, l) => {
    const ref = refPorId.get(l.refaccion_id)
    return ref ? suma + Number(l.cantidad) * ref.costo_unitario : suma
  }, 0)
  const costoTotal = (Number.isFinite(manoObraNum) ? manoObraNum : 0) + costoRefacciones
  const horasReparacion = Math.max(0, (momentoCierre - new Date(o.reportada_en).getTime()) / 3_600_000)

  function handleAgregarRefaccion() {
    const disponible = refacciones.find((r) => r.existencia > 0 && !usadas.has(r.id))
    if (!disponible) return
    setLineas([...lineas, { refaccion_id: disponible.id, cantidad: '1' }])
  }

  function cambiarLinea(i: number, cambio: Partial<LineaRefaccion>) {
    setLineas(lineas.map((l, j) => (j === i ? { ...l, ...cambio } : l)))
  }

  function quitarLinea(i: number) {
    setLineas(lineas.filter((_, j) => j !== i))
  }

  async function handleCerrar() {
    setIntentado(true)
    if (!valido) return
    setGuardando(true)
    const resultado = await onCerrarOrden({
      ordenId: o.id,
      causa: causa.trim(),
      accion: accion.trim(),
      costoManoObra: manoObraNum,
      refacciones: lineas.map((l) => ({ refaccion_id: l.refaccion_id, cantidad: Number(l.cantidad) })),
      liberarPista: liberar,
    })
    setGuardando(false)
    if (resultado) onClose()
  }

  const prioridad = PRIORIDADES.find((p) => p.value === o.prioridad)?.label ?? o.prioridad

  return (
    <Drawer
      open
      onClose={onClose}
      title={o.folio}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleCerrar} loading={guardando}>
            Cerrar orden
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold tracking-tight text-on-surface">{o.descripcion}</h3>
          <div className="flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
            <span>{o.pista_nombre ?? 'General'}</span>
            <span aria-hidden="true" className="h-1 w-1 rounded-full bg-outline" />
            <span>{o.tipo === 'correctiva' ? 'Correctiva' : 'Preventiva'}</span>
            <span aria-hidden="true" className="h-1 w-1 rounded-full bg-outline" />
            <Badge tone={PRIORIDAD_TONO[o.prioridad]}>{prioridad}</Badge>
            {o.fuera_de_servicio && <Badge tone="error">Fuera de servicio</Badge>}
          </div>
        </div>

        <ol className="rounded-xl border border-outline-variant bg-surface-container p-4">
          <PasoTiempo
            estado="hecho"
            titulo={`Reportada ${fmtFechaHora(o.reportada_en)}`}
            detalle={o.reportada_por_nombre ?? 'Sin registro'}
          />
          <PasoTiempo
            estado={o.iniciada_en ? 'hecho' : 'pendiente'}
            titulo={o.iniciada_en ? `Iniciada ${fmtFechaHora(o.iniciada_en)}` : 'Sin iniciar'}
            detalle={o.responsable_nombre ?? 'Sin responsable'}
          />
          <PasoTiempo
            estado="actual"
            titulo="Cierre: al confirmar"
            detalle="Se registra con esta acción"
            ultimo
          />
        </ol>

        <Field
          label="Causa"
          htmlFor="cerrar-causa"
          hint={o.tipo === 'correctiva' ? 'Obligatoria en correctivas' : undefined}
          error={errorVisible(errCausa)}
        >
          <Input
            id="cerrar-causa"
            value={causa}
            onChange={(e) => setCausa(e.target.value)}
            invalid={!!errorVisible(errCausa)}
            placeholder="Qué provocó la falla"
          />
        </Field>

        <Field label="Acción realizada" htmlFor="cerrar-accion" error={errorVisible(errAccion)}>
          <Textarea
            id="cerrar-accion"
            rows={3}
            value={accion}
            onChange={(e) => setAccion(e.target.value)}
            invalid={!!errorVisible(errAccion)}
            placeholder="Qué se hizo para dejar la pista operativa"
          />
        </Field>

        <div className="space-y-2">
          <p className="text-xs font-medium text-on-surface-variant">Refacciones usadas</p>
          {lineas.map((l, i) => {
            const ref = refPorId.get(l.refaccion_id)
            const error = errorLinea(l)
            return (
              <div key={i} className="space-y-2 rounded-lg border border-outline-variant bg-surface-container p-3">
                <div className="flex items-center gap-2">
                  <Select
                    aria-label="Refacción"
                    value={l.refaccion_id}
                    invalid={!!error}
                    onChange={(e) => cambiarLinea(i, { refaccion_id: e.target.value })}
                  >
                    {refacciones.map((r) => (
                      <option
                        key={r.id}
                        value={r.id}
                        disabled={r.existencia <= 0 || (usadas.has(r.id) && r.id !== l.refaccion_id)}
                      >
                        {r.nombre} · existencia {r.existencia} {r.unidad}
                      </option>
                    ))}
                  </Select>
                  <IconButton icon={<X size={16} />} label="Quitar refacción" onClick={() => quitarLinea(i)} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      size="sm"
                      aria-label="Cantidad"
                      value={l.cantidad}
                      invalid={!!error}
                      onChange={(e) => cambiarLinea(i, { cantidad: e.target.value })}
                      className="w-24 text-right tabular-nums"
                    />
                    <span className="text-xs text-on-surface-variant">{ref?.unidad}</span>
                  </div>
                  <Money
                    value={ref ? (Number(l.cantidad) || 0) * ref.costo_unitario : 0}
                    className="text-sm font-medium text-on-surface"
                  />
                </div>
                {error && <p className="text-xs text-error">{error}</p>}
              </div>
            )
          })}
          <Button variant="ghost" size="sm" onClick={handleAgregarRefaccion} disabled={!hayDisponible}>
            <Plus size={14} />
            Agregar refacción
          </Button>
        </div>

        <Field
          label="Mano de obra"
          htmlFor="cerrar-mano-obra"
          error={errorVisible(errManoObra)}
        >
          <Input
            id="cerrar-mano-obra"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            prefix="$"
            placeholder="0.00"
            value={manoObra}
            onChange={(e) => setManoObra(e.target.value)}
            invalid={!!errorVisible(errManoObra)}
            className="text-right tabular-nums"
          />
        </Field>

        <div className="space-y-2 rounded-xl border border-outline-variant bg-surface-container/60 p-4">
          <div className="flex items-center justify-between text-xs text-on-surface-variant">
            <span>Tiempo de reparación</span>
            <span className="font-medium tabular-nums text-on-surface">
              {horasReparacion.toLocaleString('es-MX', { maximumFractionDigits: 1 })} h
            </span>
          </div>
          <div className="my-1 h-px bg-outline-variant/60" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-on-surface">Costo total estimado</span>
            <Money value={costoTotal} className="text-base font-semibold text-primary" />
          </div>
        </div>

        {o.fuera_de_servicio && (
          <div className="flex items-center justify-between gap-4 border-t border-outline-variant/60 pt-4">
            <div>
              <p className="text-xs font-semibold text-on-surface">Volver a poner la pista en servicio</p>
              <p className="mt-0.5 text-xs text-on-surface-variant">
                Cierra el bloqueo y la pista vuelve a operativa (salvo otro bloqueo vigente)
              </p>
            </div>
            <Switch
              checked={liberar}
              onChange={setLiberar}
              label="Volver a poner la pista en servicio"
            />
          </div>
        )}
      </div>
    </Drawer>
  )
}

interface PasoTiempoProps {
  estado: 'hecho' | 'pendiente' | 'actual'
  titulo: string
  detalle: string
  ultimo?: boolean
}

function PasoTiempo({ estado, titulo, detalle, ultimo = false }: PasoTiempoProps) {
  return (
    <li className="flex gap-3">
      <div className="flex w-4 flex-col items-center">
        {estado === 'hecho' && <CircleCheck size={16} className="text-primary" />}
        {estado === 'pendiente' && <Circle size={16} className="text-outline" />}
        {estado === 'actual' && (
          <span aria-hidden="true" className="mt-1 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-primary/20" />
        )}
        {!ultimo && <span aria-hidden="true" className="my-1 w-px flex-1 bg-outline-variant" />}
      </div>
      <div className={ultimo ? 'min-w-0' : 'min-w-0 pb-4'}>
        <p className={estado === 'actual' ? 'text-xs font-semibold text-primary' : 'text-xs text-on-surface'}>
          {titulo}
        </p>
        <p className="text-xs text-outline">{detalle}</p>
      </div>
    </li>
  )
}
