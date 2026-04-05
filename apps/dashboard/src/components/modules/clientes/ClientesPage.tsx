'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Plus } from 'lucide-react'
import { StatCard } from '@/components/ui/StatCard'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { createClient } from '@/lib/supabase/client'
import {
  getClientes,
  getClienteStats,
  type Cliente,
  type ClienteCategoria,
  type ClienteResumen,
} from '@/lib/supabase/queries/clientes'
import { NewClientModal } from './NewClientModal'
import { ClientDetailModal } from './ClientDetailModal'

import { useAppStore } from '@/store/useAppStore'

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIA_BADGE: Record<
  ClienteCategoria,
  { variant: 'lime' | 'yellow' | 'blue' | 'muted'; label: string }
> = {
  gold: { variant: 'lime', label: 'Gold' },
  silver: { variant: 'blue', label: 'Silver' },
  regular: { variant: 'yellow', label: 'Regular' },
  nuevo: { variant: 'muted', label: 'Nuevo' },
}

const CATEGORIAS_FILTER: { value: ClienteCategoria | 'todos'; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'gold', label: 'Gold' },
  { value: 'silver', label: 'Silver' },
  { value: 'regular', label: 'Regular' },
  { value: 'nuevo', label: 'Nuevo' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFecha(fecha: string | null | undefined): string {
  if (!fecha) return '—'
  try {
    return format(new Date(fecha), 'd MMM yyyy', { locale: es })
  } catch {
    return '—'
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ClientesPage() {
  const clubId = useAppStore((s) => s.clubId)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [stats, setStats] = useState<ClienteResumen | null>(null)
  const [filtro, setFiltro] = useState<ClienteCategoria | 'todos'>('todos')
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [showNew, setShowNew] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  function refresh() { setRefreshKey((k) => k + 1) }

  useEffect(() => {
    const supabase = createClient()

    async function load() {
      const [clientesRes, statsRes] = await Promise.all([
        getClientes(supabase, clubId ?? ''),
        getClienteStats(supabase, clubId ?? ''),
      ])

      if (clientesRes.data) {
        // Sort by visitas desc
        const sorted = [...(clientesRes.data as Cliente[])].sort(
          (a, b) => (b.stats?.visitas ?? 0) - (a.stats?.visitas ?? 0),
        )
        setClientes(sorted)
      }

      if (statsRes.data) setStats(statsRes.data)
      setLoading(false)
    }

    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  const clientesFiltrados =
    filtro === 'todos' ? clientes : clientes.filter((c) => c.categoria === filtro)

  return (
    <div style={{ padding: '24px', overflowY: 'auto', height: 'calc(100vh - 56px)' }}>
      {/* Modals */}
      {showNew && (
        <NewClientModal
          onClose={() => setShowNew(false)}
          onSuccess={() => { setShowNew(false); refresh() }}
        />
      )}
      {selectedId && (
        <ClientDetailModal
          clienteId={selectedId}
          onClose={() => setSelectedId(null)}
          onRefresh={refresh}
        />
      )}

      {/* Header */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.3px' }}>
            Clientes (CRM)
          </div>
          <div style={{ fontSize: '13px', color: 'var(--color-muted)', marginTop: '4px' }}>
            Fichas de cliente, socios y categorización automática
          </div>
        </div>
        <button
          onClick={() => setShowNew(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '9px 16px', background: 'var(--color-lime)', border: 'none',
            borderRadius: '10px', color: 'var(--color-bg)', fontSize: '13px', fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <Plus size={15} /> Nuevo Cliente
        </button>
      </div>

      {/* Stats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <StatCard value={loading ? '—' : String(stats?.total ?? 0)} label="Total clientes" />
        <StatCard value={loading ? '—' : String(stats?.socios ?? 0)} label="Socios activos" />
        <StatCard
          value={loading ? '—' : `$${stats?.ticket_promedio ?? 0}`}
          label="Ticket medio"
        />
        <StatCard value={loading ? '—' : String(stats?.nuevos_mes ?? 0)} label="Nuevos (mes)" />
      </div>

      {/* Filtro por categoría */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {CATEGORIAS_FILTER.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setFiltro(cat.value)}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              border: '1px solid',
              borderColor:
                filtro === cat.value ? 'var(--color-lime)' : 'var(--color-border-subtle)',
              background:
                filtro === cat.value ? 'rgba(163,230,53,0.08)' : 'transparent',
              color:
                filtro === cat.value ? 'var(--color-lime)' : 'var(--color-muted)',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <Card>
        {loading ? (
          <div
            style={{
              padding: '48px',
              textAlign: 'center',
              color: 'var(--color-muted)',
              fontSize: '13px',
            }}
          >
            Cargando clientes…
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Cliente', 'Teléfono', 'Email', 'Categoría', 'Visitas', 'Ticket Medio', 'Última Visita'].map(
                    (h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: 'left',
                          fontSize: '10px',
                          fontWeight: 600,
                          color: 'var(--color-muted-dim)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.8px',
                          padding: '10px 14px',
                          borderBottom: '1px solid var(--color-border)',
                        }}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {clientesFiltrados.map((c) => {
                  const badge = CATEGORIA_BADGE[c.categoria]
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedId(c.id)}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = 'transparent')
                      }
                    >
                      <td
                        style={{
                          padding: '12px 14px',
                          fontWeight: 600,
                          fontSize: '13px',
                          borderBottom: '1px solid var(--color-border-subtle)',
                        }}
                      >
                        {c.nombre}
                      </td>
                      <td
                        style={{
                          padding: '12px 14px',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '11px',
                          color: 'var(--color-muted)',
                          borderBottom: '1px solid var(--color-border-subtle)',
                        }}
                      >
                        {c.telefono ?? '—'}
                      </td>
                      <td
                        style={{
                          padding: '12px 14px',
                          fontSize: '12px',
                          color: 'var(--color-text)',
                          borderBottom: '1px solid var(--color-border-subtle)',
                        }}
                      >
                        {c.email ?? '—'}
                      </td>
                      <td
                        style={{
                          padding: '12px 14px',
                          borderBottom: '1px solid var(--color-border-subtle)',
                        }}
                      >
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </td>
                      <td
                        style={{
                          padding: '12px 14px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 600,
                          borderBottom: '1px solid var(--color-border-subtle)',
                        }}
                      >
                        {c.stats?.visitas ?? 0}
                      </td>
                      <td
                        style={{
                          padding: '12px 14px',
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--color-lime)',
                          fontWeight: 600,
                          borderBottom: '1px solid var(--color-border-subtle)',
                        }}
                      >
                        ${c.stats?.ticket_promedio ?? 0}
                      </td>
                      <td
                        style={{
                          padding: '12px 14px',
                          color: 'var(--color-muted)',
                          fontSize: '12px',
                          borderBottom: '1px solid var(--color-border-subtle)',
                        }}
                      >
                        {formatFecha(c.stats?.ultima_visita)}
                      </td>
                    </tr>
                  )
                })}
                {clientesFiltrados.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      style={{
                        padding: '32px',
                        textAlign: 'center',
                        color: 'var(--color-muted)',
                        fontSize: '13px',
                      }}
                    >
                      Sin clientes en esta categoría
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
