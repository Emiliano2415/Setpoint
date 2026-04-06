'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cancelarReserva } from '@/lib/supabase/queries/cancelaciones'
import { useAppStore } from '@/store/useAppStore'
import { toast } from 'sonner'

interface Props {
  open: boolean
  reservaId: string
  clienteNombre: string
  pistaName: string
  onClose: () => void
  onSuccess: () => void
}

export function CancelacionReservaModal({ open, reservaId, clienteNombre, pistaName, onClose, onSuccess }: Props) {
  const clubId = useAppStore((s) => s.clubId)
  const user = useAppStore((s) => s.user)
  const [motivo, setMotivo] = useState('')
  const [saving, setSaving] = useState(false)

  if (!open) return null

  async function handleCancelar() {
    if (!motivo.trim() || !clubId || !user?.id) return
    setSaving(true)
    try {
      await cancelarReserva(createClient(), clubId, reservaId, motivo, user.id)
      toast.success('Reserva cancelada')
      setMotivo('')
      onSuccess()
    } catch {
      toast.error('Error al cancelar la reserva')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'var(--color-bg2)', border: '1px solid var(--color-border)', borderRadius: '16px', width: '400px', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Cancelar Reserva</div>
            <div style={{ fontSize: '12px', color: 'var(--color-muted)', marginTop: '2px' }}>{pistaName} · {clienteNombre}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', padding: '4px' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
              Motivo de cancelación *
            </label>
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: Cliente llamó para cancelar..."
              style={{
                width: '100%', padding: '10px 12px',
                background: 'var(--color-bg)', border: '1px solid var(--color-border)',
                borderRadius: '8px', color: 'var(--color-text)',
                fontSize: '13px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <button
              onClick={onClose}
              style={{ padding: '11px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '10px', color: 'var(--color-muted)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Cancelar
            </button>
            <button
              onClick={handleCancelar}
              disabled={saving || !motivo.trim()}
              style={{
                padding: '11px', borderRadius: '10px', border: 'none',
                background: saving || !motivo.trim() ? 'rgba(239,68,68,0.3)' : '#EF4444',
                color: '#fff', fontSize: '13px', fontWeight: 700,
                cursor: saving || !motivo.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              }}
            >
              {saving ? 'Cancelando...' : 'Confirmar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
