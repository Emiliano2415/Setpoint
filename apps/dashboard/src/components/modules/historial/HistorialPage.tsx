'use client'

import { useState, useEffect, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, addDays, subWeeks, addWeeks, subMonths, addMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import { fmtMXN, localDayStart, localDayEnd } from '@/lib/format'
import {
  getHistorialVentas,
  getHistorialCanchas,
  getHistorialMovimientos,
  type VentaPOS,
  type RentaCancha,
  type MovimientoCajaHistorial,
} from '@/lib/supabase/queries/historial'
import { useAppStore } from '@/store/useAppStore'

function fmtHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}
function fmtFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
}
// 2-decimal precision for individual transaction amounts (vs fmtMXN which rounds for KPI summaries)
function fmtMonto(n: number): string {
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function MetodoBadge({ metodo }: { metodo: string }) {
  const isCard = metodo === 'credito' || metodo === 'debito'
  const isDividido = metodo === 'dividido'
  return (
    <span style={{
      fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px',
      padding: '3px 7px', borderRadius: '5px',
      background: isDividido ? 'rgba(234,179,8,0.12)' : isCard ? 'rgba(96,165,250,0.12)' : 'rgba(108,242,13,0.10)',
      color: isDividido ? '#EAB308' : isCard ? '#60a5fa' : 'var(--color-lime)',
    }}>
      {isDividido ? 'Dividido' : isCard ? 'Tarjeta' : metodo === 'cortesia' ? 'Cortesía' : 'Efectivo'}
    </span>
  )
}

type Periodo = 'dia' | 'semana' | 'mes' | 'todo'
type Tab = 'ventas' | 'canchas' | 'caja' | 'todo'

function getRango(periodo: Periodo, cursor: Date): { desde: string; hasta: string; label: string } {
  const iso = (d: Date) => d.toISOString()
  switch (periodo) {
    case 'dia':
      return {
        desde: localDayStart(cursor),
        hasta: localDayEnd(cursor),
        label: format(cursor, "EEEE d 'de' MMMM yyyy", { locale: es }),
      }
    case 'semana': {
      const ini = startOfWeek(cursor, { weekStartsOn: 1 })
      const fin = endOfWeek(cursor, { weekStartsOn: 1 })
      return {
        desde: iso(ini),
        hasta: iso(fin),
        label: `${format(ini, 'd MMM', { locale: es })} — ${format(fin, 'd MMM yyyy', { locale: es })}`,
      }
    }
    case 'mes':
      return {
        desde: iso(startOfMonth(cursor)),
        hasta: iso(endOfMonth(cursor)),
        label: format(cursor, 'MMMM yyyy', { locale: es }),
      }
    case 'todo':
      return {
        desde: '1970-01-01T00:00:00.000Z',
        hasta: addDays(new Date(), 1).toISOString(),
        label: 'Todo el tiempo',
      }
  }
}

function navCursor(cursor: Date, periodo: Periodo, dir: 'prev' | 'next'): Date {
  switch (periodo) {
    case 'dia': return dir === 'prev' ? subDays(cursor, 1) : addDays(cursor, 1)
    case 'semana': return dir === 'prev' ? subWeeks(cursor, 1) : addWeeks(cursor, 1)
    case 'mes': return dir === 'prev' ? subMonths(cursor, 1) : addMonths(cursor, 1)
    default: return cursor
  }
}


export function HistorialPage() {
  const clubId = useAppStore((s) => s.clubId)
  const [periodo, setPeriodo] = useState<Periodo>('dia')
  const [cursor, setCursor] = useState(new Date())
  const [tab, setTab] = useState<Tab>('ventas')
  const [ventas, setVentas] = useState<VentaPOS[]>([])
  const [canchas, setCanchas] = useState<RentaCancha[]>([])
  const [movimientos, setMovimientos] = useState<MovimientoCajaHistorial[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { desde, hasta, label } = useMemo(() => getRango(periodo, cursor), [periodo, cursor])
  const labelCap = label.charAt(0).toUpperCase() + label.slice(1)

  // KPIs derived from state — no extra DB calls
  const totalVentas = ventas.reduce((s, v) => s + v.total, 0)
  const totalCanchas = canchas.reduce((s, c) => s + c.precio, 0)
  const netoCaja = movimientos.reduce((s, m) => {
    return (m.tipo === 'ingreso' || m.tipo === 'fondo') ? s + m.monto : s - m.monto
  }, 0)
  const totalIngresos = totalVentas + totalCanchas

  useEffect(() => {
    if (!clubId) return
    setLoading(true)
    const supabase = createClient()
    Promise.all([
      getHistorialVentas(supabase, clubId, desde, hasta),
      getHistorialCanchas(supabase, clubId, desde, hasta),
      getHistorialMovimientos(supabase, clubId, desde, hasta),
    ]).then(([v, c, m]) => {
      setVentas(v)
      setCanchas(c)
      setMovimientos(m)
    }).catch(console.error).finally(() => setLoading(false))
  }, [clubId, desde, hasta])

  const kpiCards = [
    { label: 'Ventas POS', value: fmtMXN(totalVentas), sub: `${ventas.length} ticket${ventas.length !== 1 ? 's' : ''}`, color: 'var(--color-lime)' },
    { label: 'Canchas', value: fmtMXN(totalCanchas), sub: `${canchas.length} renta${canchas.length !== 1 ? 's' : ''}`, color: '#60a5fa' },
    { label: 'Mov. Caja', value: (netoCaja < 0 ? '-' : '') + fmtMXN(Math.abs(netoCaja)), sub: `${movimientos.length} movimiento${movimientos.length !== 1 ? 's' : ''}`, color: netoCaja >= 0 ? 'var(--color-lime)' : '#ef4444' },
    { label: 'Total Ingresos', value: fmtMXN(totalIngresos), sub: 'Ventas + Canchas', color: '#EAB308' },
  ]

  return (
    <div style={{ padding: '24px', overflowY: 'auto', height: 'calc(100vh - 56px)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <div style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.3px' }}>Historial Financiero</div>
          <div style={{ fontSize: '13px', color: 'var(--color-muted)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            {periodo !== 'todo' && (
              <button
                onClick={() => setCursor(navCursor(cursor, periodo, 'prev'))}
                style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center' }}
              >
                <ChevronLeft size={14} />
              </button>
            )}
            <span style={{ minWidth: '200px', textAlign: 'center' }}>{labelCap}</span>
            {periodo !== 'todo' && (
              <button
                onClick={() => setCursor(navCursor(cursor, periodo, 'next'))}
                style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center' }}
              >
                <ChevronRight size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Period pills */}
        <div style={{ display: 'flex', gap: '4px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '10px', padding: '4px' }}>
          {(['dia', 'semana', 'mes', 'todo'] as Periodo[]).map((p) => (
            <button
              key={p}
              onClick={() => { setPeriodo(p); setCursor(new Date()) }}
              style={{
                padding: '6px 14px', borderRadius: '7px', border: 'none', cursor: 'pointer',
                background: periodo === p ? 'var(--color-lime)' : 'transparent',
                color: periodo === p ? 'var(--color-bg)' : 'var(--color-muted)',
                fontSize: '12px', fontWeight: 700, fontFamily: 'inherit',
                transition: 'all 0.15s',
              }}
            >
              {p === 'dia' ? 'Día' : p === 'semana' ? 'Semana' : p === 'mes' ? 'Mes' : 'Histórico'}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {kpiCards.map((kpi) => (
          <div
            key={kpi.label}
            style={{ background: 'var(--color-bg2)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '16px' }}
          >
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
              {kpi.label}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '22px', fontWeight: 700, color: loading ? 'var(--color-muted)' : kpi.color }}>
              {loading ? '—' : kpi.value}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-muted-dim)', marginTop: '3px' }}>
              {loading ? '...' : kpi.sub}
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '2px', borderBottom: '1px solid var(--color-border)', marginBottom: '16px' }}>
        {([
          ['ventas', 'Ventas POS'],
          ['canchas', 'Canchas'],
          ['caja', 'Movimientos Caja'],
          ['todo', 'Todo'],
        ] as [Tab, string][]).map(([t, lbl]) => (
          <button
            key={t}
            onClick={() => { setTab(t); setExpandedId(null) }}
            style={{
              padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '13px', fontWeight: tab === t ? 700 : 500, fontFamily: 'inherit',
              color: tab === t ? 'var(--color-lime)' : 'var(--color-muted)',
              borderBottom: tab === t ? '2px solid var(--color-lime)' : '2px solid transparent',
              transition: 'all 0.15s', marginBottom: '-1px',
            }}
          >
            {lbl}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--color-muted)', padding: '48px 0', fontSize: '13px' }}>
          Cargando...
        </div>
      ) : (
        <div>
          {/* TAB: VENTAS */}
          {tab === 'ventas' && (
            ventas.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--color-muted-dim)', padding: '48px 0', fontSize: '13px' }}>
                Sin ventas en este período
              </div>
            ) : ventas.map((v) => {
              const isExp = expandedId === v.id
              const metodoLabel = v.metodos_pago.length > 1 ? 'dividido' : v.metodos_pago[0]?.metodo ?? 'efectivo'
              return (
                <div key={v.id} onClick={() => setExpandedId(isExp ? null : v.id)}
                  style={{ marginBottom: '6px', background: 'var(--color-bg2)', border: '1px solid var(--color-border-subtle)', borderRadius: '10px', overflow: 'hidden', cursor: 'pointer' }}>
                  <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ minWidth: '44px', textAlign: 'center' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, color: 'var(--color-lime)' }}>{fmtHora(v.created_at)}</div>
                      <div style={{ fontSize: '10px', color: 'var(--color-muted-dim)' }}>{fmtFecha(v.created_at)}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: 700 }}>{v.numero_ticket}</div>
                      <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '1px' }}>
                        {v.items.length} producto{v.items.length !== 1 ? 's' : ''}
                        {v.cliente_nombre ? ` · ${v.cliente_nombre}` : ''}
                      </div>
                    </div>
                    <MetodoBadge metodo={metodoLabel} />
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color: 'var(--color-lime)', minWidth: '80px', textAlign: 'right' }}>
                      {fmtMonto(v.total)}
                    </div>
                    <span style={{ color: 'var(--color-muted)', fontSize: '12px', transition: 'transform 0.15s', transform: isExp ? 'rotate(90deg)' : 'none' }}>›</span>
                  </div>
                  {isExp && (
                    <div style={{ borderTop: '1px solid var(--color-border-subtle)', padding: '12px 16px', background: 'rgba(0,0,0,0.1)' }}>
                      <div style={{ marginBottom: '10px' }}>
                        {v.items.map((item, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--color-muted)', padding: '3px 0' }}>
                            <span>{item.cantidad}x {item.nombre}</span>
                            <span style={{ fontFamily: 'var(--font-mono)' }}>{fmtMonto(item.subtotal)}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: '8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: '11px', color: 'var(--color-muted)' }}>
                        <span>Subtotal</span><span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmtMonto(v.subtotal)}</span>
                        {v.descuento_total > 0 && (<><span style={{ color: '#EAB308' }}>Descuento</span><span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: '#EAB308' }}>-{fmtMonto(v.descuento_total)}</span></>)}
                        <span>IVA 16%</span><span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmtMonto(v.iva)}</span>
                        <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>Total</span><span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-lime)' }}>{fmtMonto(v.total)}</span>
                      </div>
                      {v.metodos_pago.length > 1 && (
                        <div style={{ marginTop: '8px', borderTop: '1px solid var(--color-border-subtle)', paddingTop: '8px' }}>
                          {v.metodos_pago.map((p, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--color-muted)', padding: '2px 0' }}>
                              <span style={{ textTransform: 'capitalize' }}>{p.metodo}</span>
                              <span style={{ fontFamily: 'var(--font-mono)' }}>{fmtMonto(p.monto)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}

          {/* TAB: CANCHAS */}
          {tab === 'canchas' && (
            canchas.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--color-muted-dim)', padding: '48px 0', fontSize: '13px' }}>Sin rentas en este período</div>
            ) : canchas.map((c) => {
              const isExp = expandedId === c.id
              const [sh, sm] = c.hora_inicio.split(':').map(Number)
              const [eh, em] = c.hora_fin.split(':').map(Number)
              const durMin = ((eh * 60 + em) - (sh * 60 + sm) + 1440) % 1440
              return (
                <div key={c.id} onClick={() => setExpandedId(isExp ? null : c.id)}
                  style={{ marginBottom: '6px', background: 'var(--color-bg2)', border: '1px solid var(--color-border-subtle)', borderRadius: '10px', overflow: 'hidden', cursor: 'pointer' }}>
                  <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ minWidth: '44px', textAlign: 'center' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, color: '#60a5fa' }}>{c.hora_inicio.slice(0, 5)}</div>
                      <div style={{ fontSize: '10px', color: 'var(--color-muted-dim)' }}>{c.fecha ? c.fecha.slice(5).replace('-', '/') : fmtFecha(c.created_at)}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: 700 }}>{c.pista_nombre}</div>
                      <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '1px' }}>
                        {c.hora_inicio.slice(0, 5)}–{c.hora_fin.slice(0, 5)} · {durMin} min
                        {c.cliente_nombre ? ` · ${c.cliente_nombre}` : ''}
                      </div>
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', padding: '3px 7px', borderRadius: '5px', background: 'rgba(96,165,250,0.12)', color: '#60a5fa', letterSpacing: '0.3px' }}>
                      Cancha
                    </span>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color: '#60a5fa', minWidth: '80px', textAlign: 'right' }}>
                      {fmtMonto(c.precio)}
                    </div>
                    <span style={{ color: 'var(--color-muted)', fontSize: '12px', transition: 'transform 0.15s', transform: isExp ? 'rotate(90deg)' : 'none' }}>›</span>
                  </div>
                  {isExp && (
                    <div style={{ borderTop: '1px solid var(--color-border-subtle)', padding: '12px 16px', background: 'rgba(0,0,0,0.1)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: '11px', color: 'var(--color-muted)' }}>
                      <span>Pista</span><span style={{ fontWeight: 600, color: 'var(--color-text)' }}>{c.pista_nombre}</span>
                      <span>Duración</span><span style={{ fontFamily: 'var(--font-mono)' }}>{durMin} min</span>
                      <span>Horario</span><span style={{ fontFamily: 'var(--font-mono)' }}>{c.hora_inicio.slice(0, 5)} – {c.hora_fin.slice(0, 5)}</span>
                      <span>Cliente</span><span>{c.cliente_nombre ?? '—'}</span>
                      <span>Estado</span><span style={{ textTransform: 'capitalize' }}>{c.estado}</span>
                      {c.notas && (<><span>Notas</span><span>{c.notas}</span></>)}
                      <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>Total</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#60a5fa' }}>{fmtMonto(c.precio)}</span>
                    </div>
                  )}
                </div>
              )
            })
          )}

          {/* TAB: CAJA */}
          {tab === 'caja' && (
            movimientos.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--color-muted-dim)', padding: '48px 0', fontSize: '13px' }}>Sin movimientos en este período</div>
            ) : movimientos.map((m) => {
              const esIngreso = m.tipo === 'ingreso' || m.tipo === 'fondo'
              const color = esIngreso ? 'var(--color-lime)' : '#ef4444'
              const bgColor = esIngreso ? 'rgba(108,242,13,0.10)' : 'rgba(239,68,68,0.10)'
              const tipoLabel = ({ ingreso: 'Ingreso', egreso: 'Egreso', fondo: 'Fondo', retiro: 'Retiro' } as Record<string, string>)[m.tipo] ?? m.tipo
              return (
                <div key={m.id}
                  style={{ marginBottom: '6px', background: 'var(--color-bg2)', border: '1px solid var(--color-border-subtle)', borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ minWidth: '44px', textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, color: 'var(--color-muted)' }}>{fmtHora(m.created_at)}</div>
                    <div style={{ fontSize: '10px', color: 'var(--color-muted-dim)' }}>{fmtFecha(m.created_at)}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 700 }}>{m.concepto}</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '1px' }}>
                      {m.cajero_nombre ?? 'Sin cajero'}
                    </div>
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', padding: '3px 7px', borderRadius: '5px', background: bgColor, color, letterSpacing: '0.3px' }}>
                    {tipoLabel}
                  </span>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color, minWidth: '80px', textAlign: 'right' }}>
                    {esIngreso ? '+' : '-'}{fmtMonto(m.monto)}
                  </div>
                </div>
              )
            })
          )}

          {/* TAB: TODO */}
          {tab === 'todo' && (() => {
            type UnifiedItem =
              | { kind: 'venta'; data: VentaPOS }
              | { kind: 'cancha'; data: RentaCancha }
              | { kind: 'movimiento'; data: MovimientoCajaHistorial }

            const unified: UnifiedItem[] = [
              ...ventas.map((d): UnifiedItem => ({ kind: 'venta', data: d })),
              ...canchas.map((d): UnifiedItem => ({ kind: 'cancha', data: d })),
              ...movimientos.map((d): UnifiedItem => ({ kind: 'movimiento', data: d })),
            ].sort((a, b) => new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime())

            if (unified.length === 0) {
              return <div style={{ textAlign: 'center', color: 'var(--color-muted-dim)', padding: '48px 0', fontSize: '13px' }}>Sin transacciones en este período</div>
            }

            return (
              <div>
                {unified.map((item) => {
                  if (item.kind === 'venta') {
                    const v = item.data
                    const metodoLabel = v.metodos_pago.length > 1 ? 'dividido' : v.metodos_pago[0]?.metodo ?? 'efectivo'
                    return (
                      <div key={`v-${v.id}`} onClick={() => setExpandedId(expandedId === v.id ? null : v.id)}
                        style={{ marginBottom: '6px', background: 'var(--color-bg2)', border: '1px solid var(--color-border-subtle)', borderRadius: '10px', overflow: 'hidden', cursor: 'pointer' }}>
                        <div style={{ padding: '11px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', padding: '2px 6px', borderRadius: '4px', background: 'rgba(108,242,13,0.10)', color: 'var(--color-lime)', whiteSpace: 'nowrap' }}>POS</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-muted-dim)', whiteSpace: 'nowrap' }}>{fmtHora(v.created_at)}</span>
                          <span style={{ flex: 1, fontSize: '12px', fontWeight: 600 }}>{v.numero_ticket} · {v.items.length} productos</span>
                          <MetodoBadge metodo={metodoLabel} />
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: 'var(--color-lime)' }}>{fmtMonto(v.total)}</span>
                        </div>
                        {expandedId === v.id && (
                          <div style={{ borderTop: '1px solid var(--color-border-subtle)', padding: '10px 16px', background: 'rgba(0,0,0,0.1)', fontSize: '11px', color: 'var(--color-muted)' }}>
                            {v.items.map((itm, idx) => <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}><span>{itm.cantidad}x {itm.nombre}</span><span style={{ fontFamily: 'var(--font-mono)' }}>{fmtMonto(itm.subtotal)}</span></div>)}
                            <div style={{ borderTop: '1px solid var(--color-border-subtle)', marginTop: '6px', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: 'var(--color-lime)' }}><span>Total</span><span style={{ fontFamily: 'var(--font-mono)' }}>{fmtMonto(v.total)}</span></div>
                          </div>
                        )}
                      </div>
                    )
                  }
                  if (item.kind === 'cancha') {
                    const c = item.data
                    return (
                      <div key={`c-${c.id}`}
                        style={{ marginBottom: '6px', background: 'var(--color-bg2)', border: '1px solid var(--color-border-subtle)', borderRadius: '10px', padding: '11px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', padding: '2px 6px', borderRadius: '4px', background: 'rgba(96,165,250,0.12)', color: '#60a5fa', whiteSpace: 'nowrap' }}>Cancha</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-muted-dim)', whiteSpace: 'nowrap' }}>{c.hora_inicio.slice(0, 5)}</span>
                        <span style={{ flex: 1, fontSize: '12px', fontWeight: 600 }}>{c.pista_nombre}{c.cliente_nombre ? ` · ${c.cliente_nombre}` : ''}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: '#60a5fa' }}>{fmtMonto(c.precio)}</span>
                      </div>
                    )
                  }
                  const mv = item.data
                  const esIngreso = mv.tipo === 'ingreso' || mv.tipo === 'fondo'
                  return (
                    <div key={`m-${mv.id}`}
                      style={{ marginBottom: '6px', background: 'var(--color-bg2)', border: '1px solid var(--color-border-subtle)', borderRadius: '10px', padding: '11px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', padding: '2px 6px', borderRadius: '4px', background: esIngreso ? 'rgba(108,242,13,0.10)' : 'rgba(239,68,68,0.10)', color: esIngreso ? 'var(--color-lime)' : '#ef4444', whiteSpace: 'nowrap' }}>Caja</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-muted-dim)', whiteSpace: 'nowrap' }}>{fmtHora(mv.created_at)}</span>
                      <span style={{ flex: 1, fontSize: '12px', fontWeight: 600 }}>{mv.concepto}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: esIngreso ? 'var(--color-lime)' : '#ef4444' }}>{esIngreso ? '+' : '-'}{fmtMonto(mv.monto)}</span>
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
