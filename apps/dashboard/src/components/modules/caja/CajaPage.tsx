'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Plus, History, TrendingUp, Scissors } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getCajaActiva, getCajaStats, getCierresCaja, getMovimientosCaja } from '@/lib/supabase/queries/caja'
import type { CajaActiva, CajaStats, CajaCierre, MovimientoCaja } from '@/lib/supabase/queries/caja'
import { StatCard } from '@/components/ui/StatCard'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { CloseShiftModal } from './CloseShiftModal'
import { CashMovementModal } from './CashMovementModal'
import { ShiftHistoryPanel } from './ShiftHistoryPanel'
import { OpenShiftModal } from './OpenShiftModal'
import { PartialCutModal } from './PartialCutModal'
import { useAppStore } from '@/store/useAppStore'

function fmtMoney(n: number) {
  return `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function getTurnoLabel(inicio: string | undefined): string {
  if (!inicio) return 'Actual'
  const h = new Date(inicio).getHours()
  if (h < 12) return 'Mañana'
  if (h < 18) return 'Tarde'
  return 'Noche'
}

function formatDt(dt: string): string {
  try { return format(new Date(dt), "d 'de' MMM · HH:mm", { locale: es }) } catch { return '—' }
}

// ─── Vista sin turno activo ───────────────────────────────────────────────────

function CajaClosedView({
  cierres,
  onOpenShift,
}: {
  cierres: CajaCierre[]
  onOpenShift: () => void
}) {
  const ultimo = cierres[0] ?? null
  const resto = cierres.slice(1)

  return (
    <div style={{ padding: '28px', maxWidth: '700px' }}>
      {/* Estado header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '20px 24px',
        background: 'rgba(239,68,68,0.04)',
        border: '1px solid rgba(239,68,68,0.15)',
        borderRadius: '14px', marginBottom: '20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#EF4444' }} />
          <div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--color-text)' }}>Sin Turno Activo</div>
            <div style={{ fontSize: '12px', color: 'var(--color-muted)', marginTop: '2px' }}>
              La caja está cerrada. Abre un nuevo turno para comenzar.
            </div>
          </div>
        </div>
        <button
          onClick={onOpenShift}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '10px 20px',
            background: 'var(--color-lime)', border: 'none', borderRadius: '10px',
            color: 'var(--color-bg)', fontSize: '13px', fontWeight: 800,
            cursor: 'pointer', fontFamily: 'inherit', textTransform: 'uppercase',
            letterSpacing: '0.3px', whiteSpace: 'nowrap',
          }}
        >
          <Plus size={16} /> Abrir Turno
        </button>
      </div>

      {/* Último cierre */}
      {ultimo && (
        <div style={{
          background: 'var(--color-bg2)',
          border: '1px solid var(--color-border)',
          borderRadius: '14px', marginBottom: '16px', overflow: 'hidden',
        }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp size={14} color="var(--color-lime)" />
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Último Cierre
            </span>
          </div>
          <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text)' }}>
                {ultimo.turno?.empleado?.nombre ?? 'Sin cajero'}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-muted)', marginTop: '2px' }}>
                {getTurnoLabel(ultimo.turno?.inicio)} · {formatDt(ultimo.created_at)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Ventas</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 700, color: 'var(--color-lime)' }}>
                {fmtMoney((ultimo.total_efectivo ?? 0) + (ultimo.total_tarjeta ?? 0))}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Diferencia</div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 700,
                color: ultimo.diferencia === null ? 'var(--color-muted)'
                  : Math.abs(ultimo.diferencia) <= 50 ? 'var(--color-lime)'
                  : ultimo.diferencia > 0 ? '#EAB308' : '#EF4444',
              }}>
                {ultimo.diferencia === null ? '—' : `${ultimo.diferencia >= 0 ? '+' : ''}${fmtMoney(ultimo.diferencia)}`}
              </div>
            </div>
            <span style={{
              fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px',
              padding: '4px 10px', borderRadius: '6px',
              background: 'rgba(255,255,255,0.05)', color: 'var(--color-muted)',
            }}>
              Cerrado
            </span>
          </div>
        </div>
      )}

      {/* Historial */}
      {resto.length > 0 && (
        <div style={{ background: 'var(--color-bg2)', border: '1px solid var(--color-border)', borderRadius: '14px', overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <History size={14} color="var(--color-muted)" />
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Historial de Cierres
            </span>
          </div>
          {resto.map((c) => {
            const totalVentas = (c.total_efectivo ?? 0) + (c.total_tarjeta ?? 0)
            const difColor = c.diferencia === null ? 'var(--color-muted)'
              : Math.abs(c.diferencia) <= 50 ? 'var(--color-lime)'
              : c.diferencia > 0 ? '#EAB308' : '#EF4444'
            return (
              <div
                key={c.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '12px 20px', borderBottom: '1px solid var(--color-border-subtle)',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text)' }}>
                    {c.turno?.empleado?.nombre ?? '—'} · {getTurnoLabel(c.turno?.inicio)}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '1px' }}>{formatDt(c.created_at)}</div>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: 'var(--color-lime)' }}>
                  {fmtMoney(totalVentas)}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 600, color: difColor, minWidth: '60px', textAlign: 'right' }}>
                  {c.diferencia === null ? '—' : `${c.diferencia >= 0 ? '+' : ''}${fmtMoney(c.diferencia)}`}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Empty state total */}
      {cierres.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--color-muted)', fontSize: '13px' }}>
          <div style={{ fontSize: '32px', marginBottom: '10px' }}>🗃️</div>
          Sin historial de cierres todavía.
        </div>
      )}
    </div>
  )
}

// ─── Vista con turno activo ───────────────────────────────────────────────────

function CajaOpenView({
  caja,
  stats,
  movimientos,
  onReload,
}: {
  caja: CajaActiva
  stats: CajaStats
  movimientos: MovimientoCaja[]
  onReload: () => void
}) {
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [showMovModal, setShowMovModal] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showPartialCut, setShowPartialCut] = useState(false)

  const cajero = caja.turno?.empleado?.nombre ?? '—'
  const inicioStr = caja.turno?.inicio
    ? format(new Date(caja.turno.inicio), 'HH:mm', { locale: es })
    : '—'
  const turnoLabel = getTurnoLabel(caja.turno?.inicio)

  const breakdown = [
    { label: 'Efectivo', desc: `${stats.countEfectivo} transacciones`, value: fmtMoney(stats.totalEfectivo), color: undefined },
    { label: 'Tarjeta', desc: `${stats.countTarjeta} transacciones`, value: fmtMoney(stats.totalTarjeta), color: '#3B82F6' },
    { label: 'Propinas', desc: 'Separadas del ingreso', value: fmtMoney(stats.totalPropinas), color: '#EAB308' },
  ]

  return (
    <div style={{ padding: '24px', overflowY: 'auto', height: 'calc(100vh - 56px)' }}>
      {showHistory && <ShiftHistoryPanel onClose={() => setShowHistory(false)} />}
      {showMovModal && (
        <CashMovementModal
          cajaId={caja.id}
          onClose={() => setShowMovModal(false)}
          onSuccess={async () => { setShowMovModal(false); onReload() }}
        />
      )}
      {showCloseModal && (
        <CloseShiftModal
          cajaId={caja.id}
          turnoId={caja.turno_id}
          efectivoEsperado={stats.totalEfectivo}
          onClose={() => setShowCloseModal(false)}
          onSuccess={() => { setShowCloseModal(false); onReload() }}
        />
      )}
      {showPartialCut && (
        <PartialCutModal
          cajaId={caja.id}
          efectivoEnCaja={stats.totalEfectivo + caja.fondo_inicial}
          cajeroNombre={cajero}
          turnoLabel={turnoLabel}
          onClose={() => setShowPartialCut(false)}
          onSuccess={() => { setShowPartialCut(false); onReload() }}
        />
      )}

      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-lime)', animation: 'pulse-dot 2s ease infinite' }} />
          <div style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.3px' }}>
            Turno Activo — {turnoLabel}
          </div>
        </div>
        <div style={{ fontSize: '13px', color: 'var(--color-muted)', marginTop: '4px' }}>
          Inicio: {inicioStr} · Fondo: {fmtMoney(caja.fondo_inicial)} · Cajero: {cajero}
        </div>
      </div>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
        <StatCard value={fmtMoney(stats.totalVentas)} label="Ventas del turno" />
        <StatCard value={fmtMoney(stats.totalEfectivo)} label="Efectivo" />
        <StatCard value={fmtMoney(stats.totalTarjeta)} label="Tarjeta" />
        <StatCard value={fmtMoney(stats.totalPropinas)} label="Propinas" valueColor="#EAB308" />
      </div>

      {/* Grid inferior */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* Desglose */}
        <Card>
          <CardHeader><CardTitle>Desglose por Método</CardTitle></CardHeader>
          {breakdown.map((row) => (
            <div
              key={row.label}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 0', borderBottom: '1px solid var(--color-border-subtle)',
              }}
            >
              <div>
                <div style={{ fontSize: '13px', fontWeight: 500 }}>{row.label}</div>
                <div style={{ fontSize: '11px', color: 'var(--color-muted-dim)' }}>{row.desc}</div>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: row.color ?? 'var(--color-lime)' }}>
                {row.value}
              </span>
            </div>
          ))}
        </Card>

        {/* Acciones */}
        <Card>
          <CardHeader><CardTitle>Acciones del Turno</CardTitle></CardHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <Button variant="primary" size="lg" style={{ justifyContent: 'center', width: '100%' }} onClick={() => setShowCloseModal(true)}>
              Cerrar Turno y Arqueo
            </Button>
            <Button variant="secondary" style={{ justifyContent: 'center', width: '100%' }} onClick={() => setShowPartialCut(true)}>
              <Scissors size={14} style={{ marginRight: '6px' }} /> Corte Parcial
            </Button>
            <Button variant="secondary" style={{ justifyContent: 'center', width: '100%' }} onClick={() => setShowMovModal(true)}>
              Movimiento de Caja
            </Button>
            <Button variant="secondary" style={{ justifyContent: 'center', width: '100%' }} onClick={() => setShowHistory(true)}>
              Ver Historial de Cierres
            </Button>
          </div>
        </Card>
      </div>

      {/* Actividad del turno */}
      <div style={{ marginTop: '24px' }}>
        <div style={{
          fontSize: '11px', fontWeight: 700, color: 'var(--color-muted)',
          textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px',
        }}>
          Actividad del turno
        </div>
        <div style={{
          background: 'var(--color-bg2)',
          border: '1px solid var(--color-border)',
          borderRadius: '14px',
          overflow: 'hidden',
        }}>
          {movimientos.length === 0 ? (
            <div style={{
              padding: '32px 20px', textAlign: 'center',
              fontSize: '13px', color: 'var(--color-muted)',
            }}>
              Sin movimientos aún
            </div>
          ) : (
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              {movimientos.map((m) => {
                const iconMap: Record<string, { icon: string; color: string }> = {
                  ingreso: { icon: '↑', color: '#22C55E' },
                  egreso:  { icon: '↓', color: '#EF4444' },
                  fondo:   { icon: '◉', color: '#3B82F6' },
                  retiro:  { icon: '⤓', color: '#EAB308' },
                }
                const { icon, color } = iconMap[m.tipo] ?? { icon: '·', color: 'var(--color-muted)' }
                const hora = new Date(m.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
                const metodoLabel: Record<string, string> = {
                  efectivo:       'Efectivo',
                  credito:        'Crédito',
                  debito:         'Débito',
                  cuenta_cliente: 'Cuenta',
                  bono:           'Bono',
                  cortesia:       'Cortesía',
                }
                return (
                  <div
                    key={m.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '10px 20px',
                      borderBottom: '1px solid var(--color-border-subtle)',
                    }}
                  >
                    {/* Icon */}
                    <span style={{
                      fontSize: '16px', fontWeight: 700, color,
                      width: '20px', textAlign: 'center', flexShrink: 0,
                    }}>
                      {icon}
                    </span>
                    {/* Hora */}
                    <span style={{
                      fontSize: '12px', color: 'var(--color-muted)',
                      fontFamily: 'var(--font-mono)', flexShrink: 0, width: '38px',
                    }}>
                      {hora}
                    </span>
                    {/* Concepto */}
                    <span style={{
                      flex: 1, fontSize: '13px', color: 'var(--color-text)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {m.concepto}
                    </span>
                    {/* Monto */}
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700,
                      color, flexShrink: 0,
                    }}>
                      {fmtMoney(m.monto)}
                    </span>
                    {/* Método */}
                    {m.metodo && (
                      <span style={{
                        fontSize: '10px', fontWeight: 600,
                        padding: '2px 8px', borderRadius: '6px',
                        background: 'rgba(255,255,255,0.06)',
                        color: 'var(--color-muted)',
                        flexShrink: 0,
                        textTransform: 'capitalize',
                      }}>
                        {metodoLabel[m.metodo] ?? m.metodo}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── CajaPage principal ───────────────────────────────────────────────────────

export function CajaPage() {
  const clubId = useAppStore((s) => s.clubId)
  const [caja, setCaja] = useState<CajaActiva | null | undefined>(undefined) // undefined = loading
  const [stats, setStats] = useState<CajaStats | null>(null)
  const [movimientos, setMovimientos] = useState<MovimientoCaja[]>([])
  const [cierres, setCierres] = useState<CajaCierre[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showOpenModal, setShowOpenModal] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  // Escuchar evento desde TopBar
  useEffect(() => {
    function handleOpenShift() {
      setShowOpenModal(true)
    }
    window.addEventListener('caja:open-shift', handleOpenShift)
    return () => window.removeEventListener('caja:open-shift', handleOpenShift)
  }, [])

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      try {
        const [cajaData, cierresData] = await Promise.all([
          getCajaActiva(supabase, clubId ?? ''),
          getCierresCaja(supabase, clubId ?? ''),
        ])
        setCaja(cajaData)
        setCierres(cierresData)
        if (cajaData) {
          const [statsData, movData] = await Promise.all([
            getCajaStats(supabase, cajaData.id),
            getMovimientosCaja(supabase, cajaData.id),
          ])
          setStats(statsData)
          setMovimientos(movData)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar caja')
        setCaja(null)
      }
    }
    load()
  }, [refreshKey])

  function reload() {
    setCaja(undefined)
    setStats(null)
    setMovimientos([])
    setRefreshKey((k) => k + 1)
  }

  if (caja === undefined) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 56px)', color: 'var(--color-muted)', fontSize: '14px' }}>
        Cargando caja...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '24px', color: '#EF4444', fontSize: '14px' }}>Error: {error}</div>
    )
  }

  return (
    <>
      {showOpenModal && (
        <OpenShiftModal
          onClose={() => setShowOpenModal(false)}
          onSuccess={() => { setShowOpenModal(false); reload() }}
        />
      )}

      {caja === null ? (
        <CajaClosedView
          cierres={cierres}
          onOpenShift={() => setShowOpenModal(true)}
        />
      ) : (
        <CajaOpenView
          caja={caja}
          stats={stats ?? { totalVentas: 0, totalEfectivo: 0, totalTarjeta: 0, totalPropinas: 0, countEfectivo: 0, countTarjeta: 0 }}
          movimientos={movimientos}
          onReload={reload}
        />
      )}
    </>
  )
}
