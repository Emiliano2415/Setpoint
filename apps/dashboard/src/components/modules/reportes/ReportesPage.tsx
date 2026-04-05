'use client'

import { useEffect, useState } from 'react'
import { StatCard } from '@/components/ui/StatCard'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Download } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fmtMXN } from '@/lib/format'
import {
  getMetricasHoy,
  getTopProductos,
  getOcupacionPistas,
  type MetricasHoy,
  type TopProducto,
  type OcupacionPista,
} from '@/lib/supabase/queries/reportes'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useAppStore } from '@/store/useAppStore'

function downloadCSV(filename: string, rows: string[][]): void {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function getOccupancyColor(pct: number): string {
  if (pct === 0) return 'var(--color-muted-dim)'
  if (pct > 80) return 'var(--color-lime)'
  if (pct > 50) return '#EAB308' // yellow
  return '#EF4444' // red
}


export function ReportesPage() {
  const clubId = useAppStore((s) => s.clubId)
  const [metricas, setMetricas] = useState<MetricasHoy | null>(null)
  const [topProductos, setTopProductos] = useState<TopProducto[]>([])
  const [ocupacion, setOcupacion] = useState<OcupacionPista[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    async function load() {
      try {
        const [m, top, ocu] = await Promise.all([
          getMetricasHoy(supabase, clubId ?? ''),
          getTopProductos(supabase, clubId ?? '', 5),
          getOcupacionPistas(supabase, clubId ?? ''),
        ])
        setMetricas(m)
        // Si top productos está vacío, usar los de métricas_diarias
        setTopProductos(top.length > 0 ? top : (m?.top_productos ?? []))
        setOcupacion(ocu)
      } catch (err) {
        console.error('Error cargando reportes:', err)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const fechaLabel = format(new Date(), "EEEE d MMMM yyyy", { locale: es })
  const fechaCap = fechaLabel.charAt(0).toUpperCase() + fechaLabel.slice(1)
  const fechaFile = format(new Date(), 'yyyy-MM-dd')

  function handleExportCSV() {
    const rows: string[][] = [
      ['REPORTE DIARIO — SETPOINT PMS'],
      ['Fecha:', fechaCap],
      [],
      ['KPIs DEL DÍA'],
      ['Métrica', 'Valor'],
      ['Ventas totales', String(metricas?.ventas_total ?? 0)],
      ['Ticket promedio', String(metricas?.ticket_promedio ?? 0)],
      ['Ocupación pistas %', String(metricas?.ocupacion_pistas_pct?.toFixed(1) ?? 0)],
      ['Transacciones', String(metricas?.num_transacciones ?? 0)],
      [],
      ['TOP PRODUCTOS'],
      ['#', 'Producto', 'Cantidad', 'Monto MXN'],
      ...topProductos.map((p, i) => [String(i + 1), p.nombre, String(p.cantidad), String(p.monto)]),
      [],
      ['OCUPACIÓN POR PISTA'],
      ['Pista', '% Ocupación'],
      ...ocupacion.map(({ nombre, pct }) => [nombre, String(pct)]),
    ]
    downloadCSV(`reporte-setpoint-${fechaFile}.csv`, rows)
  }

  function handleExportPDF() {
    window.print()
  }

  if (loading) {
    return (
      <div style={{ padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 56px)', color: 'var(--color-muted)' }}>
        Cargando reportes...
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', overflowY: 'auto', height: 'calc(100vh - 56px)' }}>
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.3px' }}>Reportes y Analytics</div>
        <div style={{ fontSize: '13px', color: 'var(--color-muted)', marginTop: '4px' }}>
          KPIs del día — {fechaCap}
        </div>
      </div>

      {/* KPI Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
        <StatCard value={fmtMXN(metricas?.ventas_total ?? 0)} label="Ventas del día" />
        <StatCard value={fmtMXN(metricas?.ticket_promedio ?? 0)} label="Ticket medio" />
        <StatCard
          value={`${metricas?.ocupacion_pistas_pct?.toFixed(1) ?? '0'}%`}
          label="Ocupación pistas"
          valueColor="var(--color-lime)"
        />
        <StatCard value={String(metricas?.num_transacciones ?? 0)} label="Transacciones" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        {/* Top Productos */}
        <Card>
          <CardHeader>
            <CardTitle>Top Productos</CardTitle>
          </CardHeader>
          {topProductos.length === 0 ? (
            <div style={{ fontSize: '13px', color: 'var(--color-muted)', padding: '12px 0' }}>Sin datos este mes</div>
          ) : (
            topProductos.map((p, i) => (
              <div
                key={i}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '10px 0', borderBottom: '1px solid var(--color-border-subtle)',
                }}
              >
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--color-muted-dim)', width: '24px' }}>
                  {i + 1}.
                </span>
                <span style={{ fontSize: '13px', fontWeight: 500, flex: 1 }}>{p.nombre}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--color-muted)' }}>
                  {p.cantidad} uds
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--color-lime)', fontWeight: 600, width: '70px', textAlign: 'right' }}>
                  {fmtMXN(p.monto)}
                </span>
              </div>
            ))
          )}
        </Card>

        {/* Ocupación por Pista */}
        <Card>
          <CardHeader><CardTitle>Ocupación por Pista</CardTitle></CardHeader>
          {ocupacion.length === 0 ? (
            <div style={{ fontSize: '13px', color: 'var(--color-muted)', padding: '12px 0' }}>Sin pistas activas</div>
          ) : (
            ocupacion.map(({ nombre, pct }) => {
              const color = getOccupancyColor(pct)
              return (
                <div
                  key={nombre}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--color-border-subtle)' }}
                >
                  <span style={{ fontSize: '12px', fontWeight: 500, width: '60px' }}>{nombre}</span>
                  <div style={{ flex: 1, height: '5px', background: 'var(--color-border-subtle)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '3px' }} />
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color, fontWeight: 600, width: '40px', textAlign: 'right' }}>
                    {`${pct}%`}
                  </span>
                </div>
              )
            })
          )}
        </Card>
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <Button variant="secondary" onClick={handleExportPDF}>
          <Download size={14} /> Exportar PDF
        </Button>
        <Button variant="secondary" onClick={handleExportCSV}>
          <Download size={14} /> Exportar CSV
        </Button>
      </div>
    </div>
  )
}
