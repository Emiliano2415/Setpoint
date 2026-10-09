'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { closeCaja, getShiftReview, getArqueoTurno } from '@/lib/supabase/queries/caja'
import type { ShiftReviewData, ArqueoData } from '@/lib/supabase/queries/caja'
import { useAppStore } from '@/store/useAppStore'
import { toast } from 'sonner'

interface Props {
  cajaId: string
  turnoId: string
  efectivoEsperado: number
  onClose: () => void
  onSuccess: () => void
}

function fmtMoney(n: number) {
  return `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function CloseShiftModal({ cajaId, turnoId, efectivoEsperado, onClose, onSuccess }: Props) {
  const user = useAppStore((s) => s.user)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [contado, setContado] = useState('')
  const [saving, setSaving] = useState(false)
  const [reviewData, setReviewData] = useState<ShiftReviewData | null>(null)
  const [arqueoData, setArqueoData] = useState<ArqueoData | null>(null)
  const [loadingReview, setLoadingReview] = useState(true)

  const contadoNum = parseFloat(contado) || 0
  const diferencia = contadoNum - efectivoEsperado
  const difOk = Math.abs(diferencia) <= 50

  useEffect(() => {
    if (!user?.empleadoId) return
    const supabase = createClient()
    Promise.all([
      getShiftReview(supabase, cajaId, user.empleadoId),
      getArqueoTurno(supabase, cajaId),
    ]).then(([r, a]) => {
      setReviewData(r)
      setArqueoData(a)
    }).catch(console.error).finally(() => setLoadingReview(false))
  }, [cajaId, user?.empleadoId])

  async function handleConfirmar() {
    setSaving(true)
    try {
      await closeCaja(createClient(), cajaId, turnoId, contadoNum, efectivoEsperado)
      toast.success('Turno cerrado correctamente')
      onSuccess()
    } catch {
      toast.error('Error al cerrar el turno')
    } finally {
      setSaving(false)
    }
  }

  const CATEGORIA_LABEL: Record<string, string> = {
    fondo_inicial: 'Fondo inicial',
    venta: 'Ventas POS',
    cancha: 'Canchas',
    reembolso: 'Reembolsos',
    retiro: 'Retiros',
    petty_cash: 'Gastos menores',
    propina: 'Propinas',
    ajuste: 'Ajustes',
    otro: 'Otros',
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'var(--color-bg2)', border: '1px solid var(--color-border)', borderRadius: '16px', width: '460px', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'var(--color-bg2)', zIndex: 1 }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Cerrar Turno</div>
            <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '2px' }}>
              Paso {step} de 3 — {step === 1 ? 'Tu resumen' : step === 2 ? 'Arqueo' : 'Confirmar'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', padding: '4px' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '24px' }}>
          {/* PASO 1: SHIFT REVIEW */}
          {step === 1 && (
            <>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '16px' }}>
                Tu actividad del turno
              </div>

              {loadingReview ? (
                <div style={{ textAlign: 'center', padding: '32px', color: 'var(--color-muted)', fontSize: '13px' }}>Cargando resumen...</div>
              ) : reviewData ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                  <ReviewRow label="Transacciones realizadas" value={String(reviewData.transacciones)} />
                  <ReviewRow label="Ventas totales" value={fmtMoney(reviewData.ventas_total)} mono />
                  <ReviewRow label="Cancelaciones solicitadas" value={String(reviewData.cancelaciones_solicitadas)} />
                  {reviewData.cancelaciones_pendientes > 0 && (
                    <div style={{ padding: '10px 12px', background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)', borderRadius: '8px', fontSize: '12px', color: '#F97316' }}>
                      ⚠ {reviewData.cancelaciones_pendientes} cancelación{reviewData.cancelaciones_pendientes > 1 ? 'es' : ''} pendiente{reviewData.cancelaciones_pendientes > 1 ? 's' : ''} de aprobación
                    </div>
                  )}
                  {reviewData.movimientos_caja && reviewData.movimientos_caja.length > 0 && (
                    <div style={{ marginTop: '8px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                        Movimientos de caja
                      </div>
                      {reviewData.movimientos_caja.map((m, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--color-muted)', padding: '3px 0' }}>
                          <span>{m.categoria ? (CATEGORIA_LABEL[m.categoria] ?? m.categoria) : m.concepto}</span>
                          <span style={{ fontFamily: 'var(--font-mono)', color: m.tipo === 'egreso' || m.tipo === 'retiro' ? '#EF4444' : 'var(--color-lime)' }}>
                            {m.tipo === 'egreso' || m.tipo === 'retiro' ? '-' : '+'}{fmtMoney(m.monto)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              <button
                onClick={() => setStep(2)}
                style={{ width: '100%', padding: '13px', background: 'var(--color-lime)', border: 'none', borderRadius: '10px', color: 'var(--color-bg)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.3px' }}
              >
                Confirmar y continuar →
              </button>
            </>
          )}

          {/* PASO 2: ARQUEO */}
          {step === 2 && (
            <>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '16px' }}>
                Arqueo del turno
              </div>

              {arqueoData && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '16px' }}>
                  {(arqueoData.por_categoria ?? []).map((cat, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--color-muted)', padding: '4px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
                      <span>{cat.categoria ? (CATEGORIA_LABEL[cat.categoria] ?? cat.categoria) : 'Sin categoría'}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: cat.tipo === 'egreso' || cat.tipo === 'retiro' ? '#EF4444' : 'var(--color-lime)' }}>
                        {cat.tipo === 'egreso' || cat.tipo === 'retiro' ? '-' : '+'}{fmtMoney(Number(cat.total))}
                      </span>
                    </div>
                  ))}

                  <div style={{ marginTop: '12px', padding: '12px', background: 'var(--color-bg)', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--color-muted)' }}>
                      <span>Ingresos efectivo</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-lime)' }}>+{fmtMoney(arqueoData.total_ingresos_efectivo)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--color-muted)' }}>
                      <span>Egresos efectivo</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: '#EF4444' }}>-{fmtMoney(arqueoData.total_egresos_efectivo)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 700, color: 'var(--color-text)', paddingTop: '6px', borderTop: '1px solid var(--color-border-subtle)' }}>
                      <span>Efectivo esperado en caja</span>
                      <span style={{ fontFamily: 'var(--font-mono)' }}>{fmtMoney(efectivoEsperado)}</span>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                  Efectivo contado en caja
                </label>
                <input
                  type="number"
                  value={contado}
                  onChange={(e) => setContado(e.target.value)}
                  placeholder={`Ej: ${fmtMoney(efectivoEsperado)}`}
                  autoFocus
                  style={{ width: '100%', padding: '14px 16px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '10px', color: 'var(--color-text)', fontSize: '20px', fontFamily: 'var(--font-mono)', fontWeight: 700, outline: 'none', boxSizing: 'border-box' }}
                />
                {contado && (
                  <div style={{ marginTop: '8px', padding: '10px 14px', background: difOk ? 'rgba(163,212,131,0.06)' : 'rgba(239,68,68,0.08)', border: `1px solid ${difOk ? 'rgba(163,212,131,0.2)' : 'rgba(239,68,68,0.25)'}`, borderRadius: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 700 }}>
                    <span style={{ color: 'var(--color-muted)' }}>Diferencia</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: difOk ? 'var(--color-lime)' : '#EF4444' }}>
                      {diferencia >= 0 ? '+' : ''}{fmtMoney(diferencia)}
                    </span>
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button onClick={() => setStep(1)} style={cancelBtnStyle}>← Volver</button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!contado || contadoNum < 0}
                  style={{ padding: '13px', background: !contado ? 'rgba(163,212,131,0.3)' : 'var(--color-lime)', border: 'none', borderRadius: '10px', color: 'var(--color-bg)', fontSize: '13px', fontWeight: 800, cursor: !contado ? 'not-allowed' : 'pointer', fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.3px' }}
                >
                  Continuar →
                </button>
              </div>
            </>
          )}

          {/* PASO 3: CONFIRMAR */}
          {step === 3 && (
            <>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '16px' }}>
                Resumen final
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                <SummaryRow label="Efectivo esperado" value={fmtMoney(efectivoEsperado)} />
                <SummaryRow label="Efectivo contado" value={fmtMoney(contadoNum)} highlight />
                <div style={{ padding: '14px 16px', background: difOk ? 'rgba(163,212,131,0.06)' : diferencia > 0 ? 'rgba(234,179,8,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${difOk ? 'rgba(163,212,131,0.2)' : diferencia > 0 ? 'rgba(234,179,8,0.25)' : 'rgba(239,68,68,0.25)'}`, borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Diferencia</span>
                    {!difOk && <div style={{ fontSize: '10px', color: diferencia > 0 ? '#EAB308' : '#EF4444', marginTop: '2px' }}>{diferencia > 0 ? '⚠ Sobrante — verificar' : '⚠ Faltante — verificar'}</div>}
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 700, color: difOk ? 'var(--color-lime)' : diferencia > 0 ? '#EAB308' : '#EF4444' }}>
                    {diferencia >= 0 ? '+' : ''}{fmtMoney(diferencia)}
                  </span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button onClick={() => setStep(2)} style={cancelBtnStyle}>← Volver</button>
                <button
                  onClick={handleConfirmar}
                  disabled={saving}
                  style={{ padding: '13px', background: saving ? 'rgba(239,68,68,0.3)' : '#EF4444', border: 'none', borderRadius: '10px', color: '#fff', fontSize: '13px', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.3px' }}
                >
                  {saving ? 'Cerrando...' : 'Confirmar Cierre'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ReviewRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--color-bg)', borderRadius: '8px' }}>
      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-muted)' }}>{label}</span>
      <span style={{ fontSize: '13px', fontWeight: 700, fontFamily: mono ? 'var(--font-mono)' : 'inherit', color: 'var(--color-text)' }}>{value}</span>
    </div>
  )
}

function SummaryRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--color-bg)', borderRadius: '8px' }}>
      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '15px', fontWeight: 700, color: highlight ? 'var(--color-text)' : 'var(--color-muted)' }}>{value}</span>
    </div>
  )
}

const cancelBtnStyle: React.CSSProperties = {
  padding: '13px', background: 'var(--color-bg)',
  border: '1px solid var(--color-border)', borderRadius: '10px',
  color: 'var(--color-muted)', fontSize: '13px', fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit',
}
