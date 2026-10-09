'use client'

import { useState } from 'react'
import { Package, Pencil, Search, Trash2 } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Drawer,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  Money,
  SegmentedControl,
  Select,
  Skeleton,
  StatCard,
  Stepper,
  Switch,
  Table,
  Tabs,
  Textarea,
  type Column,
} from '@/components/ds'

type Fila = {
  nombre: string
  categoria: string
  stock: number
  precio: number
  estado: 'activo' | 'stock bajo'
}

type Pestana = 'items' | 'reservas'
type Periodo = 'dia' | 'semana' | 'mes'

const FILAS: Fila[] = [
  { nombre: 'Agua Mineral 500ml', categoria: 'Bebidas', stock: 48, precio: 30, estado: 'activo' },
  { nombre: 'Café Solo', categoria: 'Cafetería', stock: 120, precio: 28, estado: 'activo' },
  { nombre: 'Grip Overgrip x3', categoria: 'Bolas / Grips', stock: 2, precio: 120, estado: 'stock bajo' },
  { nombre: 'Pala Nivel 1', categoria: 'Alquiler material', stock: 8, precio: 80, estado: 'activo' },
]

const COLUMNAS: Column<Fila>[] = [
  { key: 'producto', header: 'Producto', align: 'left', render: (f) => f.nombre },
  { key: 'categoria', header: 'Categoría', align: 'left', render: (f) => f.categoria },
  { key: 'stock', header: 'Stock', align: 'right', width: '120px', render: (f) => f.stock },
  {
    key: 'precio',
    header: 'Precio',
    align: 'right',
    width: '140px',
    render: (f) => <Money value={f.precio} />,
  },
  {
    key: 'estado',
    header: 'Estado',
    align: 'left',
    render: (f) =>
      f.estado === 'activo' ? (
        <Badge tone="success">Activo</Badge>
      ) : (
        <Badge tone="warning">Stock bajo</Badge>
      ),
  },
]

export default function DesignSystemPage() {
  const [seleccionado, setSeleccionado] = useState('')
  const [pestana, setPestana] = useState<Pestana>('items')
  const [periodo, setPeriodo] = useState<Periodo>('dia')
  const [requiereCocina, setRequiereCocina] = useState(false)
  const [recibido, setRecibido] = useState('')
  const [modalAbierto, setModalAbierto] = useState(false)
  const [drawerAbierto, setDrawerAbierto] = useState(false)
  const [confirmAbierto, setConfirmAbierto] = useState(false)

  const cerrarModal = () => setModalAbierto(false)

  return (
    <div className="h-[calc(100vh-56px)] overflow-y-auto bg-background p-6 text-on-surface">
      <div className="mx-auto flex max-w-5xl flex-col gap-10">
        <div>
          <h1 className="text-xl font-semibold">Sistema de diseño 2.0</h1>
          <p className="text-sm text-on-surface-variant">Página de muestra solo para desarrollo.</p>
        </div>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-on-surface">Botones</h2>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Principal</Button>
            <Button variant="secondary">Secundario</Button>
            <Button variant="ghost">Fantasma</Button>
            <Button variant="danger">Peligro</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" size="sm">Pequeño</Button>
            <Button variant="primary" size="md">Mediano</Button>
            <Button variant="primary" size="lg">Grande</Button>
            <Button variant="primary" loading>Guardar</Button>
            <Button variant="primary" disabled>Deshabilitado</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <IconButton variant="ghost" icon={<Pencil size={16} />} label="Editar" />
            <IconButton variant="secondary" icon={<Search size={16} />} label="Buscar" />
            <IconButton variant="danger" icon={<Trash2 size={16} />} label="Eliminar" />
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-on-surface">Etiquetas</h2>
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="neutral">Borrador</Badge>
            <Badge tone="success">Activa</Badge>
            <Badge tone="warning">Stock bajo</Badge>
            <Badge tone="error">Rechazada</Badge>
            <Badge tone="info">Cocina</Badge>
            <Badge tone="primary">Nuevo</Badge>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-on-surface">Tarjetas</h2>
          <div className="grid grid-cols-4 gap-4">
            <StatCard label="Ventas de hoy" value={<Money value={12480.5} />} hint="32 tickets" />
            <StatCard label="Efectivo en caja" value={<Money value={3250} />} tone="primary" />
            <StatCard label="Pendientes de aprobación" value="1" tone="warning" />
            <StatCard label="Stock bajo" value="3" tone="error" hint="Revisar inventario" />
          </div>
          <Card>
            <p className="text-sm text-on-surface-variant">
              Tarjeta simple con borde y fondo de superficie.
            </p>
          </Card>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-on-surface">Formulario</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nombre" htmlFor="ds-nombre">
              <Input id="ds-nombre" placeholder="Nombre del producto" />
            </Field>
            <Field label="Precio" htmlFor="ds-precio" hint="Sin IVA">
              <Input id="ds-precio" type="number" prefix="$" />
            </Field>
            <Field label="Categoría" htmlFor="ds-categoria">
              <Select id="ds-categoria">
                <option>Cafetería</option>
                <option>Bebidas</option>
                <option>Alquiler material</option>
              </Select>
            </Field>
            <Field label="Correo" htmlFor="ds-correo" error="Escribe un correo válido">
              <Input id="ds-correo" invalid defaultValue="correo-incorrecto" />
            </Field>
            <Field label="Notas" htmlFor="ds-notas">
              <Textarea id="ds-notas" placeholder="Opcional" />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-3">
              <Switch label="Requiere cocina" checked={requiereCocina} onChange={setRequiereCocina} />
              <span className="text-sm text-on-surface">Requiere cocina</span>
            </div>
            <SegmentedControl
              label="Periodo"
              value={periodo}
              onChange={setPeriodo}
              options={[
                { value: 'dia', label: 'Día' },
                { value: 'semana', label: 'Semana' },
                { value: 'mes', label: 'Mes' },
              ]}
            />
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-on-surface">Pestañas</h2>
          <Tabs
            value={pestana}
            onChange={setPestana}
            tabs={[
              { value: 'items', label: 'Ítems POS', count: 4 },
              { value: 'reservas', label: 'Reservas', count: 24 },
            ]}
          />
          <p className="text-sm text-on-surface-variant">Pestaña activa: {pestana}</p>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-on-surface">Tabla</h2>
          <Table
            columns={COLUMNAS}
            rows={FILAS}
            rowKey={(f) => f.nombre}
            onRowClick={(f) => setSeleccionado(f.nombre)}
            selectedKey={seleccionado}
          />
          <Table
            columns={COLUMNAS}
            rows={[]}
            rowKey={(f) => f.nombre}
            empty={
              <EmptyState
                icon={<Package />}
                title="Aún no hay productos"
                action={<Button variant="secondary">Nuevo producto</Button>}
              />
            }
          />
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-on-surface">Carga</h2>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-10 w-1/2" />
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-on-surface">Pasos</h2>
          <Stepper steps={['Resumen', 'Arqueo', 'Confirmar']} current={1} />
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-on-surface">Superposiciones</h2>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={() => setModalAbierto(true)}>
              Abrir modal
            </Button>
            <Button variant="secondary" onClick={() => setDrawerAbierto(true)}>
              Abrir panel lateral
            </Button>
            <Button variant="secondary" onClick={() => setConfirmAbierto(true)}>
              Abrir confirmación
            </Button>
          </div>
        </section>
      </div>

      <Modal
        open={modalAbierto}
        onClose={cerrarModal}
        title="Cobro en efectivo"
        description="Ticket #SP-3160 · 3 productos"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={cerrarModal}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={cerrarModal}>
              Confirmar pago
            </Button>
          </>
        }
      >
        <Field label="Recibido" htmlFor="ds-recibido" hint="Mínimo $171.68">
          <Input
            id="ds-recibido"
            prefix="$"
            value={recibido}
            onChange={(e) => setRecibido(e.target.value)}
          />
        </Field>
      </Modal>

      <Drawer
        open={drawerAbierto}
        onClose={() => setDrawerAbierto(false)}
        title="Detalle del cliente"
        footer={
          <Button variant="secondary" onClick={() => setDrawerAbierto(false)}>
            Cerrar
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-on-surface-variant">
            Cliente frecuente con reservas de martes y jueves en la tarde.
          </p>
          <p className="text-sm text-on-surface-variant">
            Último consumo registrado en la barra del club, con pago en efectivo.
          </p>
        </div>
      </Drawer>

      <ConfirmDialog
        open={confirmAbierto}
        onCancel={() => setConfirmAbierto(false)}
        onConfirm={() => setConfirmAbierto(false)}
        title="Eliminar regla de descuento"
        consequence="La regla «Happy hour bebidas 20%» dejará de aplicarse en el Punto de Venta. Esta acción no se puede deshacer."
        confirmLabel="Eliminar regla"
      />
    </div>
  )
}
