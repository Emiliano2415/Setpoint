'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { Search, AlertTriangle } from 'lucide-react'
import { Button, Input } from '@/components/ds'
import { createClient } from '@/lib/supabase/client'
import { poll } from '@/lib/poll'
import { getProductosBajoStock } from '@/lib/supabase/queries/inventario'
import { getCajaActiva, type CajaActiva } from '@/lib/supabase/queries/caja'
import { useAppStore } from '@/store/useAppStore'
import { useSearchStore } from '@/store/useSearchStore'

const MODULE_CONFIG: Record<
  string,
  { title: string; search: string; variant: 'clock' | 'terminal' }
> = {
  '/pos': { title: 'Punto de Venta', search: 'Buscar producto o cliente...', variant: 'terminal' },
  '/pistas': { title: 'Pistas', search: '', variant: 'clock' },
  '/comandas': { title: 'Comandas', search: 'Buscar comanda...', variant: 'terminal' },
  '/inventario': { title: 'Inventario', search: 'Buscar producto...', variant: 'terminal' },
  '/clientes': { title: 'Clientes', search: 'Buscar cliente por nombre o teléfono...', variant: 'terminal' },
  '/caja': { title: 'Caja', search: '', variant: 'terminal' },
  '/empleados': { title: 'Personal', search: 'Buscar empleado...', variant: 'terminal' },
  '/reportes': { title: 'Reportes', search: '', variant: 'terminal' },
  '/descuentos': { title: 'Descuentos', search: '', variant: 'terminal' },
  '/cancelaciones': { title: 'Cancelaciones', search: '', variant: 'terminal' },
  '/historial': { title: 'Historial', search: '', variant: 'terminal' },
  '/configuracion': { title: 'Configuración', search: '', variant: 'terminal' },
}

function getModuleConfig(pathname: string) {
  const key = Object.keys(MODULE_CONFIG).find((k) => pathname.startsWith(k))
  return key ? MODULE_CONFIG[key] : MODULE_CONFIG['/pos']
}

function useClock() {
  const [time, setTime] = useState('')
  const [date, setDate] = useState('')

  useEffect(() => {
    const update = () => {
      const now = new Date()
      setTime(now.toLocaleTimeString('es-MX', { hour12: false }))
      setDate(
        now.toLocaleDateString('es-MX', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      )
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [])

  return { time, date }
}

export function TopBar() {
  const pathname = usePathname()
  const router = useRouter()
  const config = getModuleConfig(pathname)
  const { time, date } = useClock()

  const clubId = useAppStore((s) => s.clubId)
  const user = useAppStore((s) => s.user)
  const [stockAlertas, setStockAlertas] = useState(0)
  const [showStockPanel, setShowStockPanel] = useState(false)
  const [productosBajo, setProductosBajo] = useState<{ nombre: string; stock_actual: number; stock_minimo: number }[]>([])

  // Turno abierto del club: undefined mientras carga, null si no hay ninguno
  const [caja, setCaja] = useState<CajaActiva | null | undefined>(undefined)
  const query = useSearchStore((s) => s.query)
  const setQuery = useSearchStore((s) => s.setQuery)

  const supabase = useMemo(() => createClient(), [])

  // Cada pantalla empieza con el buscador vacío
  useEffect(() => {
    setQuery('')
  }, [pathname, setQuery])

  // Stock bajo y turno abierto. Cada consulta por separado: que falle una no
  // impide la otra, y la que falle se reintenta en el siguiente sondeo.
  const loadStock = useCallback(async () => {
    if (!clubId) return
    const [bajos, cajaActiva] = await Promise.allSettled([
      getProductosBajoStock(supabase, clubId),
      getCajaActiva(supabase, clubId),
    ])
    if (bajos.status === 'fulfilled') {
      setStockAlertas(bajos.value.length)
      setProductosBajo(bajos.value)
    }
    if (cajaActiva.status === 'fulfilled') setCaja(cajaActiva.value)
  }, [supabase, clubId])

  // Se recarga también al cambiar de pantalla: abrir o cerrar turno ocurre en Caja
  useEffect(() => {
    loadStock()
    if (!clubId) return
    return poll(loadStock, 30_000)
  }, [clubId, loadStock, pathname])

  function handleNuevoTurno() {
    if (pathname.startsWith('/caja')) {
      window.dispatchEvent(new CustomEvent('caja:open-shift'))
    } else {
      router.push('/caja')
    }
  }

  return (
    <header className="relative flex h-14 shrink-0 items-center gap-4 border-b border-outline-variant bg-surface-container px-6">
      {/* Título */}
      <h1 className="shrink-0 text-xl font-semibold text-on-surface">{config.title}</h1>

      {/* Búsqueda contextual */}
      {config.search && (
        <div className="w-full max-w-[320px]">
          <Input
            type="text"
            aria-label="Buscar"
            placeholder={config.search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            prefix={<Search size={15} />}
            size="sm"
          />
        </div>
      )}

      {/* Aviso de stock bajo */}
      {stockAlertas > 0 && (user?.rol === 'admin' || user?.rol === 'propietario' || user?.rol === 'cajero') && (
        <button
          type="button"
          onClick={() => setShowStockPanel(!showStockPanel)}
          aria-expanded={showStockPanel}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-warning/40 bg-warning/10 px-3 text-xs font-medium text-warning"
        >
          <AlertTriangle size={14} />
          {stockAlertas} con stock bajo
        </button>
      )}

      {/* Panel de stock bajo */}
      {showStockPanel && (
        <div className="absolute left-6 top-[52px] z-40 w-80 rounded-xl border border-outline-variant bg-surface-container p-4 shadow-2xl">
          <p className="text-sm font-semibold text-on-surface">Productos con stock bajo</p>
          <ul className="mt-3 flex flex-col gap-2">
            {productosBajo.map((p, i) => (
              <li key={i} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-on-surface">{p.nombre}</span>
                <span className={`shrink-0 tabular-nums ${p.stock_actual === 0 ? 'text-error' : 'text-warning'}`}>
                  {p.stock_actual} / {p.stock_minimo}
                </span>
              </li>
            ))}
          </ul>
          <Button variant="secondary" size="sm" fullWidth className="mt-3" onClick={() => setShowStockPanel(false)}>
            Cerrar
          </Button>
        </div>
      )}

      {/* Derecha: reloj o estado del turno */}
      <div className="ml-auto flex shrink-0 items-center gap-3">
        {config.variant === 'clock' ? (
          <div className="text-right leading-tight">
            <p className="text-sm font-medium tabular-nums text-on-surface">{time}</p>
            <p className="text-xs text-outline">{date}</p>
          </div>
        ) : (
          <>
            <div className="inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-lg border border-outline-variant px-3 text-xs text-on-surface-variant">
              <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${caja ? 'bg-success' : 'bg-outline'}`} />
              {caja === undefined
                ? 'Cargando turno…'
                : caja
                  ? `Turno abierto · ${caja.turno?.empleado?.nombre ?? 'Sin responsable'} · ${new Date(caja.turno?.inicio ?? caja.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })}`
                  : 'Sin turno abierto'}
            </div>
            {caja === null && (
              <Button variant="primary" size="sm" onClick={handleNuevoTurno}>
                Abrir turno
              </Button>
            )}
          </>
        )}
      </div>
    </header>
  )
}
