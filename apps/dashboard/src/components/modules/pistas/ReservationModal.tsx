'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { createReserva } from '@/lib/supabase/queries/pistas'
import { toast } from 'sonner'
import type { Court } from './PistasPage'
import { useAppStore } from '@/store/useAppStore'

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function nowHHMM(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function addHour(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  return `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

interface Props {
  court?: Court
  courts: Court[]
  onClose: () => void
  onSuccess: () => void
}

export function ReservationModal({ court, courts, onClose, onSuccess }: Props) {
  const clubId = useAppStore((s) => s.clubId)
  const now = nowHHMM()
  const [pistaId, setPistaId] = useState(court?.id ?? (courts[0]?.id ?? ''))
  const [fecha, setFecha] = useState(todayStr())
  const [horaInicio, setHoraInicio] = useState(now)
  const [horaFin, setHoraFin] = useState(addHour(now))
  const [precio, setPrecio] = useState<number>(
    court?.tarifa && court.tarifa > 0 ? court.tarifa : 0,
  )
  const [nombreCliente, setNombreCliente] = useState('')
  const [notas, setNotas] = useState('')
  const [saving, setSaving] = useState(false)
  const [checkinNow, setCheckinNow] = useState(false)

  async function handleSubmit() {
    if (!pistaId || !horaInicio || !horaFin) {
      toast.error('Selecciona cancha, hora inicio y hora fin')
      return
    }
    if (horaInicio >= horaFin) {
      toast.error('La hora de fin debe ser después de la hora de inicio')
      return
    }
    setSaving(true)
    try {
      const supabase = createClient()
      await createReserva(supabase, {
        club_id: clubId ?? '',
        pista_id: pistaId,
        cliente_id: null,
        nombre_cliente: nombreCliente.trim() || null,
        fecha,
        hora_inicio: `${horaInicio}:00`,
        hora_fin: `${horaFin}:00`,
        estado: checkinNow ? 'checkin' : 'confirmada',
        precio,
        notas: notas.trim() || null,
      })
      toast.success(checkinNow ? 'Sesión iniciada' : 'Reservación creada')
      onSuccess()
    } catch {
      toast.error('Error al crear la reservación')
    } finally {
      setSaving(false)
    }
  }

  const selectedCourt = courts.find((c) => c.id === pistaId)

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
        width: '440px',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Nueva Reservación
            </div>
            {selectedCourt && (
              <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '2px' }}>
                {selectedCourt.name}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', padding: '4px' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Cancha */}
          {!court && (
            <div>
              <label style={labelStyle}>Cancha</label>
              <select
                value={pistaId}
                onChange={(e) => setPistaId(e.target.value)}
                style={inputStyle}
              >
                {courts.filter((c) => c.status === 'disponible').map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Fecha */}
          <div>
            <label style={labelStyle}>Fecha</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Horario */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Hora inicio</label>
              <input
                type="time"
                value={horaInicio}
                onChange={(e) => setHoraInicio(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Hora fin</label>
              <input
                type="time"
                value={horaFin}
                onChange={(e) => setHoraFin(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Precio */}
          <div>
            <label style={labelStyle}>Precio (MXN)</label>
            <input
              type="number"
              value={precio}
              onChange={(e) => setPrecio(Number(e.target.value))}
              style={inputStyle}
            />
          </div>

          {/* Nombre del cliente */}
          <div>
            <label style={labelStyle}>Reservado por</label>
            <input
              type="text"
              value={nombreCliente}
              onChange={(e) => setNombreCliente(e.target.value)}
              placeholder="Nombre del jugador o cliente..."
              style={inputStyle}
            />
          </div>

          {/* Notas */}
          <div>
            <label style={labelStyle}>Notas (opcional)</label>
            <input
              type="text"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Instrucciones especiales..."
              style={inputStyle}
            />
          </div>

          {/* Toggle: reservar vs iniciar ahora */}
          <div
            onClick={() => setCheckinNow((v) => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '12px 14px',
              background: checkinNow ? 'rgba(163,212,131,0.06)' : 'var(--color-bg)',
              border: `1px solid ${checkinNow ? 'rgba(163,212,131,0.20)' : 'var(--color-border)'}`,
              borderRadius: '10px',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <div style={{
              width: '36px', height: '20px', borderRadius: '10px',
              background: checkinNow ? 'var(--color-lime)' : 'var(--color-border)',
              position: 'relative', transition: 'background 0.2s', flexShrink: 0,
            }}>
              <div style={{
                position: 'absolute', top: '2px',
                left: checkinNow ? '18px' : '2px',
                width: '16px', height: '16px', borderRadius: '50%',
                background: checkinNow ? 'var(--color-bg)' : 'var(--color-muted)',
                transition: 'left 0.2s',
              }} />
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700 }}>
                {checkinNow ? 'Iniciar Sesión Ahora' : 'Solo Reservar'}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--color-muted-dim)' }}>
                {checkinNow ? 'Estado: checkin (timer activo)' : 'Estado: confirmada (pendiente check-in)'}
              </div>
            </div>
          </div>

          {/* Botones */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', paddingTop: '4px' }}>
            <button
              onClick={onClose}
              style={cancelBtnStyle}
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || !pistaId}
              style={{
                padding: '13px',
                background: saving || !pistaId ? 'rgba(163,212,131,0.3)' : 'var(--color-lime)',
                border: 'none', borderRadius: '10px',
                color: 'var(--color-bg)', fontSize: '13px', fontWeight: 800,
                cursor: saving || !pistaId ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.3px',
              }}
            >
              {saving ? 'Guardando...' : checkinNow ? 'Iniciar Sesión' : 'Confirmar Reserva'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '10px',
  fontWeight: 700,
  color: 'var(--color-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  marginBottom: '6px',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: '8px',
  color: 'var(--color-text)',
  fontSize: '13px',
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
}

const cancelBtnStyle: React.CSSProperties = {
  padding: '13px',
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: '10px',
  color: 'var(--color-muted)',
  fontSize: '13px',
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
