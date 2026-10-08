'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Eye, EyeOff, Package } from 'lucide-react'
import { StatCard } from '@/components/ui/StatCard'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { createClient } from '@/lib/supabase/client'
import {
  getProductosConInactivos,
  getStockStats,
  updateProductoInventario,
  getMovimientos,
  type StockStats,
} from '@/lib/supabase/queries/inventario'
import { StockAdjustModal } from './StockAdjustModal'
import { ProductFormModal } from './ProductFormModal'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

import { useAppStore } from '@/store/useAppStore'

// ─── Constants ────────────────────────────────────────────────────────────────

type EstadoStock = 'ok' | 'bajo' | 'critico'

const ESTADO_BADGE: Record<EstadoStock, { variant: 'lime' | 'yellow' | 'red'; label: string }> = {
  ok: { variant: 'lime', label: 'OK' },
  bajo: { variant: 'yellow', label: 'Bajo' },
  critico: { variant: 'red', label: 'Crítico' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getEstado(stockActual: number, stockMinimo: number): EstadoStock {
  if (stockActual <= stockMinimo) return 'critico'
  if (stockActual <= stockMinimo * 1.5) return 'bajo'
  return 'ok'
}

function fmtMoney(n: number) {
  return `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtFecha(dt: string) {
  try { return format(new Date(dt), "d MMM · HH:mm", { locale: es }) } catch { return '—' }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProductoRow {
  id: string
  nombre: string
  precio: number
  iva_rate: number
  stock_actual: number
  stock_minimo: number
  requiere_stock: boolean
  activo: boolean
  categoria_id: string
  categoria_nombre: string
  categoria_tipo: string
}

interface MovRow {
  id: string
  tipo: string
  cantidad: number
  stock_anterior: number
  stock_posterior: number
  motivo: string | null
  created_at: string
  producto_nombre: string
}

type TabKey = 'productos' | 'movimientos'

// ─── Component ────────────────────────────────────────────────────────────────

export function InventarioPage() {
  const clubId = useAppStore((s) => s.clubId)
  const [tab, setTab] = useState<TabKey>('productos')
  const [productos, setProductos] = useState<ProductoRow[]>([])
  const [movimientos, setMovimientos] = useState<MovRow[]>([])
  const [stats, setStats] = useState<StockStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [showInactivos, setShowInactivos] = useState(false)

  // Modal states
  const [adjustProduct, setAdjustProduct] = useState<ProductoRow | null>(null)
  const [editProduct, setEditProduct] = useState<ProductoRow | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)

  // Hover state for inline actions
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  function refresh() { setRefreshKey((k) => k + 1) }

  useEffect(() => {
    if (!clubId) return
    const id = clubId
    const supabase = createClient()

    async function load() {
      const [productosRes, statsRes, movsRes] = await Promise.all([
        getProductosConInactivos(supabase, id),
        getStockStats(supabase, id),
        getMovimientos(supabase, id, 100),
      ])

      if (productosRes.data) {
        const rows: ProductoRow[] = productosRes.data.map((p) => {
          const catRaw = p.categorias as unknown
          const cat = (Array.isArray(catRaw) ? catRaw[0] : catRaw) as { nombre: string; tipo: string } | null
          return {
            id: p.id,
            nombre: p.nombre,
            precio: p.precio,
            iva_rate: p.iva_rate,
            stock_actual: p.stock_actual,
            stock_minimo: p.stock_minimo,
            requiere_stock: p.requiere_stock,
            activo: p.activo,
            categoria_id: p.categoria_id,
            categoria_nombre: cat?.nombre ?? '—',
            categoria_tipo: cat?.tipo ?? '',
          }
        })
        setProductos(rows)
      }

      if (statsRes.data) setStats(statsRes.data)

      if (movsRes.data) {
        const rows: MovRow[] = movsRes.data.map((m) => {
          const prodRaw = m.productos as unknown
          const prod = (Array.isArray(prodRaw) ? prodRaw[0] : prodRaw) as { nombre: string } | null
          return {
            id: m.id,
            tipo: m.tipo as string,
            cantidad: m.cantidad as number,
            stock_anterior: m.stock_anterior as number,
            stock_posterior: m.stock_posterior as number,
            motivo: m.motivo as string | null,
            created_at: m.created_at as string,
            producto_nombre: prod?.nombre ?? '—',
          }
        })
        setMovimientos(rows)
      }

      setLoading(false)
    }

    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId, refreshKey])

  async function toggleActivo(producto: ProductoRow) {
    try {
      const supabase = createClient()
      await updateProductoInventario(supabase, producto.id, { activo: !producto.activo })
      refresh()
    } catch (err) {
      console.error(err)
    }
  }

  const productosFiltrados = showInactivos ? productos : productos.filter((p) => p.activo)

  return (
    <div style={{ padding: '24px', overflowY: 'auto', height: 'calc(100vh - 56px)' }}>

      {/* Modals */}
      {adjustProduct && (
        <StockAdjustModal
          producto={adjustProduct}
          onClose={() => setAdjustProduct(null)}
          onSuccess={() => { setAdjustProduct(null); refresh() }}
        />
      )}
      {(showCreateForm || editProduct) && (
        <ProductFormModal
          clubId={clubId ?? ''}
          producto={editProduct ?? null}
          onClose={() => { setShowCreateForm(false); setEditProduct(null) }}
          onSuccess={() => { setShowCreateForm(false); setEditProduct(null); refresh() }}
        />
      )}

      {/* Header */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.3px' }}>
            Tienda / Inventario
          </div>
          <div style={{ fontSize: '13px', color: 'var(--color-muted)', marginTop: '4px' }}>
            Control de stock, alertas y movimientos
          </div>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: '7px',
            padding: '10px 16px',
            background: 'var(--color-lime)', border: 'none', borderRadius: '10px',
            color: 'var(--color-bg)', fontSize: '13px', fontWeight: 800,
            cursor: 'pointer', fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.3px',
          }}
        >
          <Plus size={15} />
          Agregar Producto
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
        <StatCard value={loading ? '—' : String(stats?.total ?? 0)} label="Total productos" />
        <StatCard value={loading ? '—' : String(stats?.bajo ?? 0)} label="Stock bajo" valueColor="#EAB308" />
        <StatCard value={loading ? '—' : String(stats?.critico ?? 0)} label="Crítico" valueColor="#EF4444" />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
        {(['productos', 'movimientos'] as TabKey[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 16px',
              background: tab === t ? 'var(--color-lime)' : 'transparent',
              color: tab === t ? 'var(--color-bg)' : 'var(--color-muted)',
              border: '1px solid',
              borderColor: tab === t ? 'var(--color-lime)' : 'var(--color-border)',
              borderRadius: '8px',
              fontSize: '12px', fontWeight: 700, fontFamily: 'inherit',
              textTransform: 'capitalize', cursor: 'pointer',
            }}
          >
            {t === 'productos' ? 'Productos' : 'Movimientos'}
          </button>
        ))}
        {tab === 'productos' && (
          <button
            onClick={() => setShowInactivos(!showInactivos)}
            style={{
              marginLeft: 'auto', padding: '8px 14px',
              background: 'transparent',
              color: showInactivos ? 'var(--color-lime)' : 'var(--color-muted)',
              border: '1px solid',
              borderColor: showInactivos ? 'rgba(108,242,13,0.4)' : 'var(--color-border)',
              borderRadius: '8px', fontSize: '11px', fontWeight: 700,
              fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            {showInactivos ? <Eye size={13} /> : <EyeOff size={13} />}
            {showInactivos ? 'Ocultar inactivos' : 'Mostrar inactivos'}
          </button>
        )}
      </div>

      {/* Content */}
      <Card>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--color-muted)', fontSize: '13px' }}>
            Cargando…
          </div>
        ) : tab === 'productos' ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Producto', 'Categoría', 'Precio', 'Stock', 'Mínimo', 'Estado', ''].map((h) => (
                    <th key={h} style={{
                      textAlign: 'left', fontSize: '10px', fontWeight: 600,
                      color: 'var(--color-muted-dim)', textTransform: 'uppercase', letterSpacing: '0.8px',
                      padding: '10px 14px', borderBottom: '1px solid var(--color-border)',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {productosFiltrados.map((item) => {
                  const estado = getEstado(item.stock_actual, item.stock_minimo)
                  const badge = ESTADO_BADGE[estado]
                  const isHovered = hoveredId === item.id
                  return (
                    <tr
                      key={item.id}
                      onMouseEnter={() => setHoveredId(item.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      style={{
                        background: isHovered ? 'rgba(255,255,255,0.03)' : 'transparent',
                        opacity: item.activo ? 1 : 0.45,
                      }}
                    >
                      <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 600, borderBottom: '1px solid var(--color-border-subtle)' }}>
                        {item.nombre}
                        {!item.activo && (
                          <span style={{ marginLeft: '8px', fontSize: '10px', color: 'var(--color-muted)', fontWeight: 500 }}>inactivo</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--color-border-subtle)' }}>
                        <Badge variant="muted">{item.categoria_nombre}</Badge>
                      </td>
                      <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: '13px', borderBottom: '1px solid var(--color-border-subtle)' }}>
                        {fmtMoney(item.precio)}
                      </td>
                      <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', fontWeight: 600, borderBottom: '1px solid var(--color-border-subtle)' }}>
                        {item.requiere_stock ? item.stock_actual : '—'}
                      </td>
                      <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', color: 'var(--color-muted)', borderBottom: '1px solid var(--color-border-subtle)' }}>
                        {item.requiere_stock ? item.stock_minimo : '—'}
                      </td>
                      <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--color-border-subtle)' }}>
                        {item.requiere_stock ? (
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                        ) : (
                          <Badge variant="muted">N/A</Badge>
                        )}
                      </td>
                      {/* Inline actions */}
                      <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--color-border-subtle)', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: '6px', opacity: isHovered ? 1 : 0, transition: 'opacity 0.15s' }}>
                          {/* Editar */}
                          <ActionBtn
                            title="Editar producto"
                            onClick={() => setEditProduct(item)}
                            color="var(--color-muted)"
                          >
                            <Pencil size={13} />
                          </ActionBtn>
                          {/* Ajustar stock */}
                          {item.requiere_stock && (
                            <ActionBtn
                              title="Ajustar stock"
                              onClick={() => setAdjustProduct(item)}
                              color="#60a5fa"
                            >
                              <Package size={13} />
                            </ActionBtn>
                          )}
                          {/* Toggle activo */}
                          <ActionBtn
                            title={item.activo ? 'Desactivar producto' : 'Activar producto'}
                            onClick={() => toggleActivo(item)}
                            color={item.activo ? '#EF4444' : 'var(--color-lime)'}
                          >
                            {item.activo ? <EyeOff size={13} /> : <Eye size={13} />}
                          </ActionBtn>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {productosFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: 'var(--color-muted)', fontSize: '13px' }}>
                      Sin productos{showInactivos ? '' : ' activos'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          /* Movimientos tab */
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Fecha', 'Producto', 'Tipo', 'Cantidad', 'Anterior', 'Posterior', 'Motivo'].map((h) => (
                    <th key={h} style={{
                      textAlign: 'left', fontSize: '10px', fontWeight: 600,
                      color: 'var(--color-muted-dim)', textTransform: 'uppercase', letterSpacing: '0.8px',
                      padding: '10px 14px', borderBottom: '1px solid var(--color-border)',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {movimientos.map((m) => (
                  <tr key={m.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                    <td style={{ padding: '10px 14px', fontSize: '12px', color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>
                      {fmtFecha(m.created_at)}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: '13px', fontWeight: 600 }}>
                      {m.producto_nombre}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <MovTipoBadge tipo={m.tipo} />
                    </td>
                    <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                      {m.tipo === 'salida' || m.tipo === 'merma' ? `-${m.cantidad}` : `+${m.cantidad}`}
                    </td>
                    <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}>
                      {m.stock_anterior}
                    </td>
                    <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', color: 'var(--color-lime)' }}>
                      {m.stock_posterior}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: '12px', color: 'var(--color-muted)' }}>
                      {m.motivo ?? '—'}
                    </td>
                  </tr>
                ))}
                {movimientos.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: 'var(--color-muted)', fontSize: '13px' }}>
                      Sin movimientos registrados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function ActionBtn({
  children,
  onClick,
  title,
  color,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  color: string
}) {
  return (
    <button
      title={title}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      style={{
        padding: '6px', borderRadius: '7px',
        background: 'var(--color-bg2)', border: '1px solid var(--color-border-subtle)',
        color, cursor: 'pointer', display: 'flex', alignItems: 'center',
      }}
    >
      {children}
    </button>
  )
}

const TIPO_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  entrada: { bg: 'rgba(108,242,13,0.1)', text: 'var(--color-lime)', label: 'Entrada' },
  salida: { bg: 'rgba(239,68,68,0.1)', text: '#EF4444', label: 'Salida' },
  ajuste: { bg: 'rgba(59,130,246,0.1)', text: '#60a5fa', label: 'Ajuste' },
  merma: { bg: 'rgba(234,179,8,0.1)', text: '#EAB308', label: 'Merma' },
}

function MovTipoBadge({ tipo }: { tipo: string }) {
  const cfg = TIPO_COLORS[tipo] ?? { bg: 'rgba(255,255,255,0.05)', text: 'var(--color-muted)', label: tipo }
  return (
    <span style={{
      display: 'inline-block',
      padding: '3px 10px', borderRadius: '6px',
      background: cfg.bg, color: cfg.text,
      fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px',
    }}>
      {cfg.label}
    </span>
  )
}
