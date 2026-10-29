'use client'

import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react'
import { ArrowDownToLine, Info, Package, Plus } from 'lucide-react'
import {
  Badge,
  Button,
  Drawer,
  EmptyState,
  Field,
  Input,
  Modal,
  Money,
  Select,
  Skeleton,
  StatCard,
  Table,
  type Column,
} from '@/components/ds'
import type {
  EntradaRefaccionInput,
  EstadoReorden,
  MovimientoRefaccion,
  NuevaRefaccionInput,
  Refaccion,
} from '@/lib/supabase/queries/mantenimiento'

// Stitch: Refacciones (89727cb9486643f087120d01864207ae)
export interface RefaccionesProps {
  loading: boolean
  /** Con punto de reorden y estado 'Pedir' / 'OK' ya calculados por la base */
  refacciones: Refaccion[]
  /** Crea la refacción (con existencia inicial opcional). true = creada */
  onCrearRefaccion: (input: NuevaRefaccionInput) => Promise<boolean>
  /** Registra una compra. true = registrada */
  onRegistrarEntrada: (input: EntradaRefaccionInput) => Promise<boolean>
  /** Historial de movimientos de una refacción, para un panel de detalle */
  onCargarMovimientos: (refaccionId: string) => Promise<MovimientoRefaccion[]>
}

/** El consumo mensual es el consumo diario (salidas de 90 días / 90) por 30 */
const DIAS_POR_MES = 30

const TIPO_MOVIMIENTO: Record<MovimientoRefaccion['tipo'], string> = {
  entrada: 'Entrada',
  salida: 'Salida',
}

const FORM_NUEVA_VACIO = {
  nombre: '',
  unidad: '',
  proveedor: '',
  existencia: '',
  stock: '',
  entrega: '',
  costo: '',
}

const FORM_ENTRADA_VACIO = { refaccionId: '', cantidad: '', costo: '', motivo: '' }

function fmtCantidad(n: number): string {
  return n.toLocaleString('es-MX', { maximumFractionDigits: 2 })
}

function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-MX', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Mexico_City',
  })
}

/** Campo vacío = 0 */
function aNumero(texto: string): number {
  const n = Number(texto)
  return Number.isFinite(n) ? n : 0
}

function EstadoBadge({ estado }: { estado: EstadoReorden }) {
  return estado === 'Pedir' ? <Badge tone="warning">Pedir</Badge> : <Badge tone="success">OK</Badge>
}

function Dato({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-outline">{label}</dt>
      <dd className="mt-0.5 text-sm tabular-nums text-on-surface">{children}</dd>
    </div>
  )
}

const COLUMNAS: Column<Refaccion>[] = [
  {
    key: 'nombre',
    header: 'Refacción',
    render: (r) => <span className="font-medium text-on-surface">{r.nombre}</span>,
  },
  {
    key: 'unidad',
    header: 'Unidad',
    render: (r) => <span className="text-on-surface-variant">{r.unidad}</span>,
  },
  {
    key: 'existencia',
    header: 'Existencia',
    align: 'right',
    render: (r) => (
      <span className={r.estado === 'Pedir' ? 'font-semibold text-warning' : 'text-on-surface'}>
        {fmtCantidad(r.existencia)}
      </span>
    ),
  },
  {
    key: 'consumo',
    header: 'Consumo promedio / mes',
    align: 'right',
    render: (r) => <span className="text-on-surface-variant">{fmtCantidad(r.consumo_diario * DIAS_POR_MES)}</span>,
  },
  {
    key: 'seguridad',
    header: 'Stock de seguridad',
    align: 'right',
    render: (r) => <span className="text-on-surface-variant">{fmtCantidad(r.stock_seguridad)}</span>,
  },
  {
    key: 'reorden',
    header: 'Punto de reorden',
    align: 'right',
    render: (r) => <span className="text-on-surface-variant">{fmtCantidad(r.punto_reorden)}</span>,
  },
  {
    key: 'estado',
    header: 'Estado',
    render: (r) => <EstadoBadge estado={r.estado} />,
  },
]

export function Refacciones(props: RefaccionesProps) {
  const { loading, refacciones, onCrearRefaccion, onRegistrarEntrada, onCargarMovimientos } = props

  const [nuevaAbierta, setNuevaAbierta] = useState(false)
  const [formNueva, setFormNueva] = useState(FORM_NUEVA_VACIO)
  const [guardandoNueva, setGuardandoNueva] = useState(false)

  const [entradaAbierta, setEntradaAbierta] = useState(false)
  const [formEntrada, setFormEntrada] = useState(FORM_ENTRADA_VACIO)
  const [guardandoEntrada, setGuardandoEntrada] = useState(false)

  const [detalleId, setDetalleId] = useState<string | null>(null)
  const [historial, setHistorial] = useState<{ refaccionId: string; items: MovimientoRefaccion[] } | null>(null)

  // Carga el historial de la refacción abierta en el panel; se vuelve a pedir si cambia el listado
  useEffect(() => {
    if (detalleId === null) return
    let vigente = true
    onCargarMovimientos(detalleId).then((items) => {
      if (vigente) setHistorial({ refaccionId: detalleId, items })
    })
    return () => {
      vigente = false
    }
  }, [detalleId, onCargarMovimientos])

  const cargando = loading && refacciones.length === 0
  const pedir = refacciones.filter((r) => r.estado === 'Pedir').length
  const valorAlmacen =
    Math.round(refacciones.reduce((suma, r) => suma + r.existencia * r.costo_unitario, 0) * 100) / 100
  const detalle = refacciones.find((r) => r.id === detalleId) ?? null
  const movimientos = historial !== null && historial.refaccionId === detalleId ? historial.items : null

  const nuevaValida = formNueva.nombre.trim() !== ''
  const entradaValida = formEntrada.refaccionId !== '' && aNumero(formEntrada.cantidad) > 0
  const unidadEntrada = refacciones.find((r) => r.id === formEntrada.refaccionId)?.unidad

  function campoNueva(campo: keyof typeof FORM_NUEVA_VACIO) {
    return (e: ChangeEvent<HTMLInputElement>) => setFormNueva((f) => ({ ...f, [campo]: e.target.value }))
  }

  function campoEntrada(campo: keyof typeof FORM_ENTRADA_VACIO) {
    return (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setFormEntrada((f) => ({ ...f, [campo]: e.target.value }))
  }

  function abrirNueva() {
    setFormNueva(FORM_NUEVA_VACIO)
    setNuevaAbierta(true)
  }

  function abrirEntrada(refaccionId?: string) {
    setFormEntrada({ ...FORM_ENTRADA_VACIO, refaccionId: refaccionId ?? refacciones[0]?.id ?? '' })
    setEntradaAbierta(true)
  }

  async function guardarNueva() {
    setGuardandoNueva(true)
    const ok = await onCrearRefaccion({
      nombre: formNueva.nombre,
      unidad: formNueva.unidad,
      stock_seguridad: aNumero(formNueva.stock),
      tiempo_entrega_dias: aNumero(formNueva.entrega),
      costo_unitario: aNumero(formNueva.costo),
      proveedor: formNueva.proveedor.trim() || null,
      existencia_inicial: aNumero(formNueva.existencia),
    })
    setGuardandoNueva(false)
    if (ok) setNuevaAbierta(false)
  }

  async function guardarEntrada() {
    setGuardandoEntrada(true)
    const ok = await onRegistrarEntrada({
      refaccionId: formEntrada.refaccionId,
      cantidad: aNumero(formEntrada.cantidad),
      costoUnitario: formEntrada.costo.trim() === '' ? null : aNumero(formEntrada.costo),
      motivo: formEntrada.motivo.trim() || null,
    })
    setGuardandoEntrada(false)
    if (ok) setEntradaAbierta(false)
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard
          label="Refacciones"
          value={cargando ? '—' : refacciones.length}
          hint="En catálogo"
        />
        <StatCard
          label="Bajo punto de reorden"
          value={cargando ? '—' : pedir}
          tone={pedir > 0 ? 'warning' : 'success'}
          hint="Requieren compra"
        />
        <StatCard
          label="Valor en almacén"
          value={cargando ? '—' : <Money value={valorAlmacen} />}
          hint="Existencia × costo unitario"
        />
      </div>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-on-surface">Catálogo de refacciones</h2>
            <p className="text-xs text-outline">Mostrando {refacciones.length} refacciones registradas</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => abrirEntrada()} disabled={refacciones.length === 0}>
              <ArrowDownToLine size={16} />
              Registrar entrada
            </Button>
            <Button size="sm" variant="primary" onClick={abrirNueva}>
              <Plus size={16} />
              Nueva refacción
            </Button>
          </div>
        </div>

        {cargando ? (
          <div className="space-y-2 rounded-lg border border-outline-variant bg-surface-container p-4">
            {[0, 1, 2, 3].map((n) => (
              <Skeleton key={n} className="h-8 w-full" />
            ))}
          </div>
        ) : (
          <Table
            columns={COLUMNAS}
            rows={refacciones}
            rowKey={(r) => r.id}
            onRowClick={(r) => setDetalleId(r.id)}
            selectedKey={detalleId ?? undefined}
            empty={
              <EmptyState
                icon={<Package />}
                title="Sin refacciones registradas"
                action={
                  <Button size="sm" variant="primary" onClick={abrirNueva}>
                    Nueva refacción
                  </Button>
                }
              />
            }
          />
        )}

        <div className="mt-3 flex items-start gap-1.5 text-xs text-on-surface-variant">
          <Info size={14} className="mt-0.5 shrink-0 text-outline" />
          <div className="space-y-1">
            <p>Punto de reorden = consumo promedio diario × tiempo de entrega + stock de seguridad</p>
            <p>
              Pedir cuando la existencia es menor o igual al punto de reorden. El consumo diario es el promedio de
              los últimos 90 días.
            </p>
          </div>
        </div>
      </section>

      <Modal
        open={nuevaAbierta}
        onClose={() => setNuevaAbierta(false)}
        title="Nueva refacción"
        description="La existencia inicial se registra como una entrada."
        size="md"
        dismissable={!guardandoNueva}
        footer={
          <>
            <Button onClick={() => setNuevaAbierta(false)} disabled={guardandoNueva}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={guardarNueva} disabled={!nuevaValida} loading={guardandoNueva}>
              Guardar
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Field label="Nombre" htmlFor="nueva-nombre">
              <Input
                id="nueva-nombre"
                value={formNueva.nombre}
                onChange={campoNueva('nombre')}
                placeholder="Ej. Driver"
              />
            </Field>
          </div>
          <Field label="Unidad" htmlFor="nueva-unidad" hint="Si se deja vacía, se usa «pza»">
            <Input id="nueva-unidad" value={formNueva.unidad} onChange={campoNueva('unidad')} placeholder="pza" />
          </Field>
          <Field label="Proveedor" htmlFor="nueva-proveedor">
            <Input id="nueva-proveedor" value={formNueva.proveedor} onChange={campoNueva('proveedor')} />
          </Field>
          <Field label="Existencia inicial" htmlFor="nueva-existencia">
            <Input
              id="nueva-existencia"
              type="number"
              min={0}
              step="any"
              value={formNueva.existencia}
              onChange={campoNueva('existencia')}
              placeholder="0"
            />
          </Field>
          <Field label="Stock de seguridad" htmlFor="nueva-stock">
            <Input
              id="nueva-stock"
              type="number"
              min={0}
              step="any"
              value={formNueva.stock}
              onChange={campoNueva('stock')}
              placeholder="0"
            />
          </Field>
          <Field label="Tiempo de entrega (días)" htmlFor="nueva-entrega">
            <Input
              id="nueva-entrega"
              type="number"
              min={0}
              step={1}
              value={formNueva.entrega}
              onChange={campoNueva('entrega')}
              placeholder="0"
            />
          </Field>
          <Field label="Costo unitario" htmlFor="nueva-costo">
            <Input
              id="nueva-costo"
              prefix="$"
              type="number"
              min={0}
              step="0.01"
              value={formNueva.costo}
              onChange={campoNueva('costo')}
              placeholder="0.00"
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={entradaAbierta}
        onClose={() => setEntradaAbierta(false)}
        title="Registrar entrada"
        description="Compra o devolución al almacén. La existencia se actualiza sola."
        size="sm"
        dismissable={!guardandoEntrada}
        footer={
          <>
            <Button onClick={() => setEntradaAbierta(false)} disabled={guardandoEntrada}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={guardarEntrada} disabled={!entradaValida} loading={guardandoEntrada}>
              Registrar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Refacción" htmlFor="entrada-refaccion">
            <Select id="entrada-refaccion" value={formEntrada.refaccionId} onChange={campoEntrada('refaccionId')}>
              {refacciones.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre} · existencia {fmtCantidad(r.existencia)} {r.unidad}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Cantidad"
            htmlFor="entrada-cantidad"
            hint={unidadEntrada ? `Unidad: ${unidadEntrada}` : undefined}
          >
            <Input
              id="entrada-cantidad"
              type="number"
              min={0}
              step="any"
              value={formEntrada.cantidad}
              onChange={campoEntrada('cantidad')}
              placeholder="0"
            />
          </Field>
          <Field
            label="Costo de la compra"
            htmlFor="entrada-costo"
            hint="Opcional. Actualiza el costo unitario de la refacción."
          >
            <Input
              id="entrada-costo"
              prefix="$"
              type="number"
              min={0}
              step="0.01"
              value={formEntrada.costo}
              onChange={campoEntrada('costo')}
              placeholder="0.00"
            />
          </Field>
          <Field label="Motivo" htmlFor="entrada-motivo" hint="Opcional. Si se deja vacío queda como «Compra».">
            <Input
              id="entrada-motivo"
              value={formEntrada.motivo}
              onChange={campoEntrada('motivo')}
              placeholder="Compra"
            />
          </Field>
        </div>
      </Modal>

      <Drawer
        open={detalle !== null}
        onClose={() => setDetalleId(null)}
        title={detalle?.nombre ?? 'Refacción'}
        footer={
          detalle ? (
            <Button
              variant="primary"
              onClick={() => {
                setDetalleId(null)
                abrirEntrada(detalle.id)
              }}
            >
              Registrar entrada
            </Button>
          ) : undefined
        }
      >
        {detalle && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <span className="text-xs text-outline">Estado</span>
              <EstadoBadge estado={detalle.estado} />
            </div>

            <dl className="grid grid-cols-2 gap-4">
              <Dato label="Unidad">{detalle.unidad}</Dato>
              <Dato label="Existencia">{fmtCantidad(detalle.existencia)}</Dato>
              <Dato label="Stock de seguridad">{fmtCantidad(detalle.stock_seguridad)}</Dato>
              <Dato label="Punto de reorden">{fmtCantidad(detalle.punto_reorden)}</Dato>
              <Dato label="Tiempo de entrega">{fmtCantidad(detalle.tiempo_entrega_dias)} días</Dato>
              <Dato label="Costo unitario">
                <Money value={detalle.costo_unitario} />
              </Dato>
              <Dato label="Cobertura">
                {detalle.cobertura_dias === null ? '—' : `${fmtCantidad(detalle.cobertura_dias)} días`}
              </Dato>
              <Dato label="Proveedor">{detalle.proveedor || '—'}</Dato>
            </dl>

            <section>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-outline">Movimientos</h3>
              {movimientos === null ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : movimientos.length === 0 ? (
                <p className="text-sm text-on-surface-variant">Sin movimientos.</p>
              ) : (
                <ul className="divide-y divide-outline-variant">
                  {movimientos.map((m) => (
                    <li key={m.id} className="flex items-start justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm text-on-surface">
                          {TIPO_MOVIMIENTO[m.tipo]}
                          {m.motivo ? ` · ${m.motivo}` : ''}
                          {m.orden_id ? ' · Orden de trabajo' : ''}
                        </p>
                        <p className="text-xs text-outline">{fechaHora(m.created_at)}</p>
                      </div>
                      <div className="shrink-0 text-right tabular-nums">
                        <p
                          className={
                            m.tipo === 'entrada' ? 'text-sm font-semibold text-success' : 'text-sm font-semibold text-warning'
                          }
                        >
                          {m.tipo === 'entrada' ? '+' : '−'}
                          {fmtCantidad(m.cantidad)}
                        </p>
                        <p className="text-xs text-on-surface-variant">
                          Existencia {m.existencia_posterior === null ? '—' : fmtCantidad(m.existencia_posterior)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </Drawer>
    </div>
  )
}
