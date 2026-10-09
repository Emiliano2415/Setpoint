'use client'

import { useState } from 'react'
import { X, Printer } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import { insertCorteParcial, type MovimientoCaja } from '@/lib/supabase/queries/caja'
import { toast } from 'sonner'

interface Props {
  cajaId: string
  efectivoEnCaja: number
  cajeroNombre: string
  turnoLabel: string
  onClose: () => void
  onSuccess: () => void
}

function fmtMoney(n: number) {
  return `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function PartialCutModal({ cajaId, efectivoEnCaja, cajeroNombre, turnoLabel, onClose, onSuccess }: Props) {
  const [monto, setMonto] = useState('')
  const [concepto, setConcepto] = useState('Retiro a caja fuerte')
  const [saving, setSaving] = useState(false)
  const [comprobante, setComprobante] = useState<MovimientoCaja | null>(null)

  const montoNum = parseFloat(monto) || 0
  const nuevoFondo = efectivoEnCaja - montoNum
  const isValid = montoNum > 0 && montoNum <= efectivoEnCaja && concepto.trim().length > 0

  async function handleRegistrar() {
    if (!isValid) return
    setSaving(true)
    try {
      const mov = await insertCorteParcial(createClient(), cajaId, montoNum, concepto.trim())
      setComprobante(mov)
      toast.success('Corte parcial registrado')
    } catch {
      toast.error('Error al registrar el corte')
      setSaving(false)
    }
  }

  function handleImprimir() {
    window.print()
  }

  // Vista de comprobante post-registro
  if (comprobante) {
    const fechaStr = format(new Date(comprobante.created_at), "d 'de' MMMM yyyy · HH:mm", { locale: es })
    return (
      <>
        {/* Estilos de impresión */}
        <style>{`
          @media print {
            body > * { display: none !important; }
            #comprobante-corte { display: block !important; }
          }
        `}</style>

        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {/* Comprobante imprimible */}
          <div
            id="comprobante-corte"
            style={{
              background: 'var(--color-bg2)',
              border: '1px solid var(--color-border)',
              borderRadius: '16px',
              width: '380px',
              boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border-subtle)', textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: 900, letterSpacing: '-0.5px' }}>
                SETPOINT<span style={{ color: 'var(--color-lime)' }}>.</span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '2px' }}>CORTE PARCIAL DE CAJA</div>
            </div>

            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <Row label="Fecha y Hora" value={fechaStr} />
              <Row label="Cajero" value={cajeroNombre} />
              <Row label="Turno" value={turnoLabel} />
              <Row label="Concepto" value={concepto} />

              <div style={{ height: '1px', background: 'var(--color-border-subtle)', margin: '4px 0' }} />

              <Row label="Efectivo en caja (antes)" value={fmtMoney(efectivoEnCaja)} />
              <Row label="Monto retirado" value={fmtMoney(montoNum)} accent="red" />
              <Row label="Nuevo fondo en caja" value={fmtMoney(nuevoFondo)} accent="lime" />

              <div style={{ height: '1px', background: 'var(--color-border-subtle)', margin: '4px 0' }} />

              <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '8px' }}>
                <div style={{ marginBottom: '24px' }}>Firma cajero:</div>
                <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '4px' }}>________________________</div>
              </div>
            </div>

            {/* Botones (no se imprimen) */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--color-border-subtle)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }} className="no-print">
              <button onClick={onSuccess} style={cancelBtnStyle}>Cerrar</button>
              <button
                onClick={handleImprimir}
                style={{
                  padding: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  background: 'var(--color-lime)', border: 'none', borderRadius: '10px',
                  color: 'var(--color-bg)', fontSize: '13px', fontWeight: 800,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                <Printer size={15} /> Imprimir
              </button>
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--color-bg2)',
        border: '1px solid var(--color-border)',
        borderRadius: '16px', width: '400px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}>
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid var(--color-border-subtle)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Corte Parcial</div>
            <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '2px' }}>Retiro de efectivo del turno activo</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', padding: '4px' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Efectivo en caja */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '14px 16px', background: 'var(--color-bg)', borderRadius: '10px',
          }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Efectivo en Caja</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '20px', fontWeight: 700, color: 'var(--color-lime)' }}>
              {fmtMoney(efectivoEnCaja)}
            </span>
          </div>

          {/* Monto a retirar */}
          <div>
            <label style={labelStyle}>Monto a Retirar (MXN)</label>
            <input
              type="number"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              min="0"
              max={efectivoEnCaja}
              placeholder="0.00"
              autoFocus
              style={{
                width: '100%', padding: '12px 14px',
                background: 'var(--color-bg)', border: `1px solid ${montoNum > efectivoEnCaja ? 'rgba(239,68,68,0.5)' : 'var(--color-border)'}`,
                borderRadius: '8px', color: 'var(--color-text)',
                fontSize: '22px', fontFamily: 'var(--font-mono)', fontWeight: 700,
                outline: 'none', boxSizing: 'border-box',
              }}
            />
            {montoNum > efectivoEnCaja && (
              <div style={{ fontSize: '11px', color: '#EF4444', marginTop: '4px' }}>
                El monto supera el efectivo disponible
              </div>
            )}
          </div>

          {/* Concepto */}
          <div>
            <label style={labelStyle}>Concepto</label>
            <input
              type="text"
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px',
                background: 'var(--color-bg)', border: '1px solid var(--color-border)',
                borderRadius: '8px', color: 'var(--color-text)',
                fontSize: '13px', fontFamily: 'inherit',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Nuevo fondo resultante */}
          {montoNum > 0 && montoNum <= efectivoEnCaja && (
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 16px',
              background: 'rgba(163,212,131,0.04)',
              border: '1px solid rgba(163,212,131,0.15)',
              borderRadius: '10px',
            }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                Nuevo Fondo en Caja
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 700, color: 'var(--color-lime)' }}>
                {fmtMoney(nuevoFondo)}
              </span>
            </div>
          )}

          {/* Botones */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <button onClick={onClose} style={cancelBtnStyle}>Cancelar</button>
            <button
              onClick={handleRegistrar}
              disabled={saving || !isValid}
              style={{
                padding: '13px',
                background: saving || !isValid ? 'rgba(163,212,131,0.3)' : 'var(--color-lime)',
                border: 'none', borderRadius: '10px',
                color: 'var(--color-bg)', fontSize: '13px', fontWeight: 800,
                cursor: saving || !isValid ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.3px',
              }}
            >
              {saving ? 'Registrando...' : 'Registrar y Ver Comprobante'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, accent }: { label: string; value: string; accent?: 'lime' | 'red' }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</span>
      <span style={{
        fontSize: '13px', fontWeight: 700,
        fontFamily: 'var(--font-mono)',
        color: accent === 'lime' ? 'var(--color-lime)' : accent === 'red' ? '#EF4444' : 'var(--color-text)',
      }}>{value}</span>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '10px', fontWeight: 700,
  color: 'var(--color-muted)', textTransform: 'uppercase',
  letterSpacing: '0.5px', marginBottom: '8px',
}

const cancelBtnStyle: React.CSSProperties = {
  padding: '13px', background: 'var(--color-bg)',
  border: '1px solid var(--color-border)', borderRadius: '10px',
  color: 'var(--color-muted)', fontSize: '13px', fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit',
}
