'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getEmpleados, getEmpleadoStats } from '@/lib/supabase/queries/empleados'
import type { EmpleadoRow, EmpleadoStats, UserRole } from '@/lib/supabase/queries/empleados'
import { StatCard } from '@/components/ui/StatCard'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { useAppStore } from '@/store/useAppStore'

type BadgeVariant = 'lime' | 'blue' | 'yellow' | 'orange' | 'muted' | 'red'

const ROL_BADGE: Record<UserRole, BadgeVariant> = {
  propietario: 'lime',
  admin: 'lime',
  cajero: 'blue',
  mesero: 'yellow',
  cocina: 'orange',
  barra: 'muted',
}

const ROL_LABEL: Record<UserRole, string> = {
  propietario: 'Propietario',
  admin: 'Admin',
  cajero: 'Cajero',
  mesero: 'Mesero',
  cocina: 'Cocina',
  barra: 'Barra',
}

export function EmpleadosPage() {
  const clubId = useAppStore((s) => s.clubId)
  const [empleados, setEmpleados] = useState<EmpleadoRow[]>([])
  const [stats, setStats] = useState<EmpleadoStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()

    async function load() {
      try {
        const [empData, statsData] = await Promise.all([
          getEmpleados(supabase, clubId ?? ''),
          getEmpleadoStats(supabase, clubId ?? ''),
        ])
        setEmpleados(empData)
        setStats(statsData)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar empleados')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  if (loading) {
    return (
      <div style={{ padding: '24px', color: 'var(--color-muted)', fontSize: '14px' }}>
        Cargando empleados...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '24px', color: '#EF4444', fontSize: '14px' }}>
        Error: {error}
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', overflowY: 'auto', height: 'calc(100vh - 56px)' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.3px' }}>
          Personal y Turnos
        </div>
        <div style={{ fontSize: '13px', color: 'var(--color-muted)', marginTop: '4px' }}>
          Alta de empleados, roles, permisos y control de turnos
        </div>
      </div>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
        <StatCard value={String(stats?.total ?? 0)} label="Total empleados" />
        <StatCard value={String(stats?.activos_hoy ?? 0)} label="Activos hoy" valueColor="#22C55E" />
        <StatCard value={String(stats?.en_turno ?? 0)} label="En turno ahora" />
      </div>

      {/* Tabla */}
      <Card>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Nombre', 'Rol', 'Turno', 'Estado'].map((h) => (
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
              ))}
            </tr>
          </thead>
          <tbody>
            {empleados.map((e) => (
              <tr
                key={e.id}
                onMouseEnter={(ev) => (ev.currentTarget.style.background = 'rgba(255,255,255,0.015)')}
                onMouseLeave={(ev) => (ev.currentTarget.style.background = 'transparent')}
              >
                <td style={{ padding: '12px 14px', fontWeight: 600, fontSize: '13px', borderBottom: '1px solid var(--color-border-subtle)' }}>
                  {e.nombre}
                </td>
                <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <Badge variant={ROL_BADGE[e.rol]}>{ROL_LABEL[e.rol]}</Badge>
                </td>
                <td style={{ padding: '12px 14px', fontSize: '13px', color: 'var(--color-muted)', borderBottom: '1px solid var(--color-border-subtle)' }}>
                  {e.turno_activo ? ROL_LABEL_TIPO(e.turno_activo.tipo) : '—'}
                </td>
                <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <Badge variant={e.activo ? 'lime' : 'red'}>{e.activo ? 'Activo' : 'Inactivo'}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {empleados.length === 0 && (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-muted)', fontSize: '13px' }}>
            No hay empleados registrados.
          </div>
        )}
      </Card>
    </div>
  )
}

function ROL_LABEL_TIPO(tipo: string): string {
  const map: Record<string, string> = {
    completo: 'Completo',
    manana: 'Mañana',
    tarde: 'Tarde',
    noche: 'Noche',
  }
  return map[tipo] ?? tipo
}
