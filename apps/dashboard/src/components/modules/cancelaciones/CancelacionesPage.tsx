'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAppStore } from '@/store/useAppStore'
import { getCancelaciones, getCancelacionStats } from '@/lib/supabase/queries/cancelaciones'
import type { CancelacionRow, CancelacionStats } from '@/lib/supabase/queries/cancelaciones'
import { CancelacionesList } from './CancelacionesList'
import { CancelacionDetalle } from './CancelacionDetalle'
import { toast } from 'sonner'

type Tab = 'items' | 'reservas'

function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function CancelacionesPage() {
  const clubId = useAppStore((s) => s.clubId)
  const supabase = useMemo(() => createClient(), [])

  const [tab, setTab] = useState<Tab>('items')
  const [cancelaciones, setCancelaciones] = useState<CancelacionRow[]>([])
  const [stats, setStats] = useState<CancelacionStats>({ total_hoy: 0, pendientes_aprobacion: 0 })
  const [selected, setSelected] = useState<CancelacionRow | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!clubId) return
    try {
      const [rows, s] = await Promise.all([
        getCancelaciones(supabase, clubId, tab, todayLocal()),
        getCancelacionStats(supabase, clubId),
      ])
      setCancelaciones(rows)
      setStats(s)
    } catch {
      toast.error('Error cargando cancelaciones')
    } finally {
      setLoading(false)
    }
  }, [supabase, clubId, tab])

  useEffect(() => {
    if (!clubId) return
    setLoading(true)
    reload()
  }, [clubId, tab, reload])

  // Realtime
  useEffect(() => {
    if (!clubId) return
    const channel = supabase
      .channel('cancelaciones-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cancelaciones' }, reload)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'reservas' }, reload)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, clubId, reload])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.3px' }}>Cancelaciones</div>
            <div style={{ fontSize: '13px', color: 'var(--color-muted)', marginTop: '2px' }}>
              <span style={{ marginRight: '16px' }}>Hoy: <strong style={{ color: 'var(--color-text)' }}>{stats.total_hoy}</strong></span>
              {stats.pendientes_aprobacion > 0 && (
                <span style={{ color: '#F97316', fontWeight: 600 }}>
                  ● {stats.pendientes_aprobacion} pendiente{stats.pendientes_aprobacion !== 1 ? 's' : ''} de aprobación
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--color-border)' }}>
          {(['items', 'reservas'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setSelected(null) }}
              style={{
                padding: '8px 18px',
                background: 'none', border: 'none',
                borderBottom: tab === t ? '2px solid var(--color-lime)' : '2px solid transparent',
                color: tab === t ? 'var(--color-lime)' : 'var(--color-muted)',
                fontSize: '13px', fontWeight: tab === t ? 700 : 500,
                cursor: 'pointer', fontFamily: 'inherit',
                marginBottom: '-1px', transition: 'all 0.15s',
              }}
            >
              {t === 'items' ? 'Ítems POS' : 'Reservas'}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 360px', overflow: 'hidden' }}>
        <CancelacionesList
          rows={cancelaciones}
          loading={loading}
          selected={selected}
          onSelect={setSelected}
        />
        <div style={{ borderLeft: '1px solid var(--color-border)', overflow: 'hidden' }}>
          <CancelacionDetalle
            cancelacion={selected}
            onAction={reload}
          />
        </div>
      </div>
    </div>
  )
}
