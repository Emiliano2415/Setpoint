'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  openCaja,
  getEmpleadosActivos,
  type EmpleadoBasic,
} from '@/lib/supabase/queries/caja'
import { toast } from 'sonner'
import { useAppStore } from '@/store/useAppStore'

type TipoTurno = 'manana' | 'tarde' | 'noche'

interface Props {
  onClose: () => void
  onSuccess: (cajaId: string) => void
}

function detectarTipo(): TipoTurno {
  const h = new Date().getHours()
  if (h < 12) return 'manana'
  if (h < 18) return 'tarde'
  return 'noche'
}

export function OpenShiftModal({ onClose, onSuccess }: Props) {
  const clubId = useAppStore((s) => s.clubId)
  const [tipo, setTipo] = useState<TipoTurno>(detectarTipo())
  const [fondoInicial, setFondoInicial] = useState('2000')
  const [notas, setNotas] = useState('')
  const [empleados, setEmpleados] = useState<EmpleadoBasic[]>([])
  const [empleadoId, setEmpleadoId] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getEmpleadosActivos(createClient(), clubId ?? '')
      .then((data) => {
        setEmpleados(data)
        if (data.length > 0) setEmpleadoId(data[0].id)
      })
      .catch(() => toast.error('Error cargando empleados'))
  }, [])

  const fondoNum = parseFloat(fondoInicial) || 0
  const isValid = empleadoId.length > 0 && fondoNum >= 0

  async function handleAbrir() {
    if (!isValid) return
    setSaving(true)
    try {
      const { cajaId } = await openCaja(
        createClient(),
        clubId ?? '',
        empleadoId,
        tipo,
        fondoNum,
        notas || undefined,
      )
      toast.success('Turno abierto correctamente')
      onSuccess(cajaId)
    } catch {
      toast.error('Error al abrir el turno')
      setSaving(false)
    }
  }

  const tipoOpts: { value: TipoTurno; label: string; emoji: string }[] = [
    { value: 'manana', label: 'Mañana', emoji: '🌅' },
    { value: 'tarde', label: 'Tarde', emoji: '☀️' },
    { value: 'noche', label: 'Noche', emoji: '🌙' },
  ]

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
        borderRadius: '16px',
        width: '420px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--color-border-subtle)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Abrir Turno
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '2px' }}>
              Configura el nuevo turno de caja
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', padding: '4px' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Tipo de turno */}
          <div>
            <label style={labelStyle}>Tipo de Turno</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {tipoOpts.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setTipo(opt.value)}
                  style={{
                    padding: '12px 8px',
                    borderRadius: '10px',
                    border: `1px solid ${tipo === opt.value ? 'rgba(108,242,13,0.4)' : 'var(--color-border)'}`,
                    background: tipo === opt.value ? 'rgba(108,242,13,0.08)' : 'var(--color-bg)',
                    color: tipo === opt.value ? 'var(--color-lime)' : 'var(--color-muted)',
                    fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                    fontFamily: 'inherit', transition: 'all 0.15s',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '18px', marginBottom: '4px' }}>{opt.emoji}</div>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Cajero */}
          <div>
            <label style={labelStyle}>Cajero</label>
            <select
              value={empleadoId}
              onChange={(e) => setEmpleadoId(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px',
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px', color: 'var(--color-text)',
                fontSize: '13px', fontFamily: 'inherit',
                outline: 'none', boxSizing: 'border-box',
              }}
            >
              {empleados.map((e) => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </select>
          </div>

          {/* Fondo inicial */}
          <div>
            <label style={labelStyle}>Fondo Inicial (MXN)</label>
            <div style={{ position: 'relative' }}>
              <input
                type="number"
                value={fondoInicial}
                onChange={(e) => setFondoInicial(e.target.value)}
                min="0"
                style={{
                  width: '100%', padding: '12px 40px 12px 14px',
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '8px', color: 'var(--color-text)',
                  fontSize: '20px', fontFamily: 'var(--font-mono)', fontWeight: 700,
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
              <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)', fontSize: '14px', fontFamily: 'var(--font-mono)' }}>$</span>
            </div>
          </div>

          {/* Notas */}
          <div>
            <label style={labelStyle}>Notas (opcional)</label>
            <input
              type="text"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Ej: Terminal sin papel, fondo verificado..."
              style={{
                width: '100%', padding: '10px 12px',
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px', color: 'var(--color-text)',
                fontSize: '13px', fontFamily: 'inherit',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Botones */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <button onClick={onClose} style={cancelBtnStyle}>Cancelar</button>
            <button
              onClick={handleAbrir}
              disabled={saving || !isValid}
              style={{
                padding: '13px',
                background: saving || !isValid ? 'rgba(108,242,13,0.3)' : 'var(--color-lime)',
                border: 'none', borderRadius: '10px',
                color: 'var(--color-bg)', fontSize: '13px', fontWeight: 800,
                cursor: saving || !isValid ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.3px',
              }}
            >
              {saving ? 'Abriendo...' : 'Abrir Turno'}
            </button>
          </div>
        </div>
      </div>
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
