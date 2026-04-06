'use client'

import { useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { aprobarCancelacion } from '@/lib/supabase/queries/cancelaciones'
import type { CancelacionRow } from '@/lib/supabase/queries/cancelaciones'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface Props {
  cancelacion: CancelacionRow | null
  onAction: () => void
}

export function CancelacionDetalle({ cancelacion, onAction }: Props) {
  const user = useAppStore((s) => s.user)
  const [rechazarMotivo, setRechazarMotivo] = useState('')
  const [showRechazo, setShowRechazo] = useState(false)
  const [saving, setSaving] = useState(false)

  const isAdmin = user?.rol === 'admin' || user?.rol === 'propietario'

  if (!cancelacion) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-muted)', fontSize: '13px', padding: '24px', textAlign: 'center' }}>
        Selecciona una cancelación para ver el detalle
      </div>
    )
  }

  async function handleAprobar() {
    if (!user?.id) return
    setSaving(true)
    try {
      await aprobarCancelacion(createClient(), cancelacion!.id, user.id, null, false)
      toast.success('Cancelación aprobada y reembolso registrado')
      onAction()
    } catch {
      toast.error('Error al aprobar la cancelación')
    } finally {
      setSaving(false)
    }
  }

  async function handleRechazar() {
    if (!user?.id || !rechazarMotivo.trim()) return
    setSaving(true)
    try {
      await aprobarCancelacion(createClient(), cancelacion!.id, user.id, null, true, rechazarMotivo)
      toast.success('Cancelación rechazada')
      setShowRechazo(false)
      setRechazarMotivo('')
      onAction()
    } catch {
      toast.error('Error al rechazar la cancelación')
    } finally {
      setSaving(false)
    }
  }

  const r = cancelacion.reservas
  const isReserva = !!cancelacion.reserva_id

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', padding: '20px' }}>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '14px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
          {isReserva ? 'Cancelación de Reserva' : 'Cancelación de Ítem'}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--color-muted)' }}>
          {new Date(cancelacion.created_at).toLocaleString('es-MX')}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
        <Field label="Estado" value={cancelacion.estado.toUpperCase()} highlight={cancelacion.estado === 'pendiente'} />
        <Field label="Tipo" value={cancelacion.tipo === 'pre_cobro' ? 'Pre-cobro' : 'Post-cobro'} />
        <Field label="Motivo" value={cancelacion.motivo} />
        {cancelacion.monto > 0 && (
          <Field label="Monto" value={`$${cancelacion.monto.toFixed(2)}`} mono />
        )}
        {cancelacion.metodo_pago && (
          <Field label="Método de pago" value={cancelacion.metodo_pago} />
        )}

        {isReserva && r && (
          <>
            <div style={{ height: '1px', background: 'var(--color-border-subtle)' }} />
            <Field label="Pista" value={r.pistas?.nombre ?? '—'} />
            <Field label="Fecha" value={`${r.fecha} ${r.hora_inicio} - ${r.hora_fin}`} />
            <Field label="Cliente" value={r.nombre_cliente ?? r.clientes?.nombre ?? 'Sin cliente'} />
          </>
        )}

        {cancelacion.cuentas && (
          <>
            <div style={{ height: '1px', background: 'var(--color-border-subtle)' }} />
            <Field label="Ticket" value={cancelacion.cuentas.numero_ticket} />
          </>
        )}

        <div style={{ height: '1px', background: 'var(--color-border-subtle)' }} />
        <Field label="Cancelado por" value={cancelacion.cancelado_por_empleado?.nombre ?? '—'} />
        {cancelacion.autorizado_por_empleado && (
          <Field label="Autorizado por" value={cancelacion.autorizado_por_empleado.nombre} />
        )}
        {cancelacion.rechazado_motivo && (
          <Field label="Motivo rechazo" value={cancelacion.rechazado_motivo} />
        )}

        {isAdmin && cancelacion.estado === 'pendiente' && !showRechazo && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
            <button
              onClick={handleAprobar}
              disabled={saving}
              style={{
                padding: '10px', borderRadius: '8px', border: 'none',
                background: saving ? 'rgba(108,242,13,0.3)' : 'var(--color-lime)',
                color: 'var(--color-bg)', fontSize: '12px', fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              }}
            >
              {saving ? 'Procesando...' : 'Aprobar reembolso'}
            </button>
            <button
              onClick={() => setShowRechazo(true)}
              disabled={saving}
              style={{
                padding: '10px', borderRadius: '8px',
                border: '1px solid #EF4444', background: 'transparent',
                color: '#EF4444', fontSize: '12px', fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              }}
            >
              Rechazar
            </button>
          </div>
        )}

        {isAdmin && cancelacion.estado === 'pendiente' && showRechazo && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
            <input
              value={rechazarMotivo}
              onChange={(e) => setRechazarMotivo(e.target.value)}
              placeholder="Motivo del rechazo..."
              style={{
                padding: '9px 12px', borderRadius: '8px',
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg)', color: 'var(--color-text)',
                fontSize: '13px', fontFamily: 'inherit', outline: 'none',
              }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                onClick={handleRechazar}
                disabled={saving || !rechazarMotivo.trim()}
                style={{
                  padding: '10px', borderRadius: '8px', border: 'none',
                  background: '#EF4444', color: '#fff',
                  fontSize: '12px', fontWeight: 700,
                  cursor: saving || !rechazarMotivo.trim() ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit', opacity: saving || !rechazarMotivo.trim() ? 0.6 : 1,
                }}
              >
                Confirmar rechazo
              </button>
              <button
                onClick={() => { setShowRechazo(false); setRechazarMotivo('') }}
                style={{
                  padding: '10px', borderRadius: '8px',
                  border: '1px solid var(--color-border)', background: 'transparent',
                  color: 'var(--color-muted)', fontSize: '12px', fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {cancelacion.estado === 'aprobada' && cancelacion.metodo_pago !== 'efectivo' && (
          <div style={{
            padding: '10px 12px', borderRadius: '8px',
            border: '1px solid rgba(59,130,246,0.3)',
            background: 'rgba(59,130,246,0.06)',
            fontSize: '12px', color: '#93C5FD',
          }}>
            Gestionar reembolso en terminal BBVA
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, value, highlight, mono }: { label: string; value: string; highlight?: boolean; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>{label}</div>
      <div style={{
        fontSize: '13px', fontWeight: 500,
        color: highlight ? '#F97316' : 'var(--color-text)',
        fontFamily: mono ? 'var(--font-mono)' : 'inherit',
      }}>{value}</div>
    </div>
  )
}
