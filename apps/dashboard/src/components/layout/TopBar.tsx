'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { Search, Bell, Settings } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { poll } from '@/lib/poll'
import { getProductosBajoStock } from '@/lib/supabase/queries/inventario'
import { useAppStore } from '@/store/useAppStore'

const MODULE_CONFIG: Record<
  string,
  { title: string; search: string; variant: 'clock' | 'terminal' }
> = {
  '/pos': { title: 'Punto de Venta', search: 'Buscar producto o cliente...', variant: 'terminal' },
  '/pistas': { title: 'Pistas', search: 'Buscar reserva o socio...', variant: 'clock' },
  '/comandas': { title: 'Comandas', search: 'Buscar comanda...', variant: 'terminal' },
  '/inventario': { title: 'Inventario', search: 'Buscar producto...', variant: 'terminal' },
  '/clientes': { title: 'Clientes', search: 'Buscar cliente por nombre o teléfono...', variant: 'terminal' },
  '/caja': { title: 'Caja', search: '', variant: 'terminal' },
  '/empleados': { title: 'Personal', search: 'Buscar empleado...', variant: 'terminal' },
  '/reportes': { title: 'Reportes', search: '', variant: 'terminal' },
  '/historial': { title: 'Historial Financiero', search: '', variant: 'terminal' },
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

  const supabase = useMemo(() => createClient(), [])

  const loadStock = useCallback(async () => {
    if (!clubId) return
    try {
      const bajos = await getProductosBajoStock(supabase, clubId)
      setStockAlertas(bajos.length)
      setProductosBajo(bajos)
    } catch { /* silenciar */ }
  }, [supabase, clubId])

  useEffect(() => {
    loadStock()
    if (!clubId) return
    return poll(loadStock, 30_000)
  }, [clubId, loadStock])

  function handleNuevoTurno() {
    if (pathname.startsWith('/caja')) {
      window.dispatchEvent(new CustomEvent('caja:open-shift'))
    } else {
      router.push('/caja')
    }
  }

  return (
    <header
      style={{
        height: '56px',
        background: 'var(--color-bg2)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        gap: '16px',
        flexShrink: 0,
      }}
    >
      {/* Título */}
      <span
        style={{
          fontSize: '18px',
          fontWeight: 800,
          letterSpacing: '-0.3px',
          textTransform: 'uppercase',
          color: 'var(--color-text)',
          whiteSpace: 'nowrap',
        }}
      >
        {config.title}
      </span>

      {/* Búsqueda contextual */}
      {config.search && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '0 14px',
            height: '36px',
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: '20px',
            flex: 1,
            maxWidth: '500px',
            marginLeft: '16px',
          }}
        >
          <Search size={15} style={{ color: 'var(--color-muted-dim)', flexShrink: 0 }} />
          <input
            type="text"
            placeholder={config.search}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: '13px',
              color: 'var(--color-text)',
              fontFamily: 'inherit',
            }}
          />
        </div>
      )}

      <div style={{ flex: 1 }} />

      {/* Stock alert pill */}
      {stockAlertas > 0 && (user?.rol === 'admin' || user?.rol === 'propietario' || user?.rol === 'cajero') && (
        <button
          onClick={() => setShowStockPanel(!showStockPanel)}
          style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.25)', borderRadius: '8px', color: '#EAB308', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          ⚠ {stockAlertas} bajo stock
        </button>
      )}

      {/* Stock panel */}
      {showStockPanel && (
        <div style={{ position: 'fixed', top: '56px', right: '16px', zIndex: 500, background: 'var(--color-bg2)', border: '1px solid var(--color-border)', borderRadius: '12px', width: '260px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', padding: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Productos bajo stock</div>
          {productosBajo.map((p, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
              <span style={{ color: 'var(--color-text)' }}>{p.nombre}</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: p.stock_actual === 0 ? '#EF4444' : '#EAB308', fontWeight: 700 }}>
                {p.stock_actual}/{p.stock_minimo}
              </span>
            </div>
          ))}
          <button onClick={() => setShowStockPanel(false)} style={{ marginTop: '10px', width: '100%', padding: '7px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '8px', color: 'var(--color-muted)', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>
            Cerrar
          </button>
        </div>
      )}

      {/* Right: Clock o Terminal */}
      {config.variant === 'clock' ? (
        <>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '22px',
              fontWeight: 700,
              color: 'var(--color-lime)',
              letterSpacing: '1px',
            }}
          >
            {time}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-muted)', textAlign: 'right', lineHeight: 1.2 }}>
            {date}
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            {[Bell, Settings].map((Icon, i) => (
              <button
                key={i}
                style={{
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--color-muted)',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                  e.currentTarget.style.color = 'var(--color-text)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'var(--color-muted)'
                }}
              >
                <Icon size={18} />
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--color-muted)',
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: 'var(--color-lime)',
                animation: 'pulse-dot 2s ease infinite',
                display: 'inline-block',
              }}
            />
            Terminal 01 Online
          </div>
          <button
            style={{
              padding: '7px 16px',
              background: 'var(--color-lime)',
              color: 'var(--color-bg)',
              fontSize: '12px',
              fontWeight: 700,
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              fontFamily: 'inherit',
              transition: 'filter 0.15s',
            }}
            onClick={handleNuevoTurno}
            onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.1)')}
            onMouseLeave={(e) => (e.currentTarget.style.filter = 'none')}
          >
            Nuevo Turno
          </button>
        </>
      )}
    </header>
  )
}
