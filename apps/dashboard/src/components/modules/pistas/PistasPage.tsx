'use client'

import { useState, useEffect, useMemo } from 'react'
import { CourtCard } from './CourtCard'
import { PistasSidebar } from './PistasSidebar'
import { ReservationModal } from './ReservationModal'
import { CourtAccountModal } from './CourtAccountModal'
import { Plus, Settings2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getPistas, getTodayReservas } from '@/lib/supabase/queries/pistas'
import type { ReservaRow } from '@/lib/supabase/queries/pistas'
import { getCajaActiva } from '@/lib/supabase/queries/caja'
import { CourtManagementModal } from './CourtManagementModal'
import { CheckInPaymentModal } from './CheckInPaymentModal'

const CLUB_ID = 'a1000000-0000-0000-0000-000000000001'

// UI display states (mapped from DB enum)
export type CourtStatus = 'ocupada' | 'disponible' | 'mantenimiento' | 'reservada'

export interface Court {
  id: string
  name: string
  status: CourtStatus
  timer?: number // seconds elapsed
  maxTime?: number // seconds total
  titular?: string
  task?: string
  tarifa: number
}

function dbStatusToCourtStatus(estado: string): CourtStatus {
  switch (estado) {
    case 'checkin': return 'ocupada'      // en sesión activa
    case 'confirmada': return 'reservada' // reservada pero aún no inicia
    case 'finalizada':
    case 'cancelada':
    case 'noshow':
    default: return 'disponible'
  }
}

function calcElapsedSeconds(horaInicio: string): number {
  const now = new Date()
  const [h, m, s] = horaInicio.split(':').map(Number)
  const start = new Date(now)
  start.setHours(h, m, s ?? 0, 0)
  return Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000))
}

export function PistasPage() {
  const supabase = useMemo(() => createClient(), [])
  const [courts, setCourts] = useState<Court[]>([])
  const [reservas, setReservas] = useState<ReservaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [showReservation, setShowReservation] = useState(false)
  const [showCourtAccount, setShowCourtAccount] = useState(false)
  const [showManagement, setShowManagement] = useState(false)
  const [selectedCourt, setSelectedCourt] = useState<Court | null>(null)
  const [cajaActiva, setCajaActiva] = useState<{ id: string } | null>(null)
  const [checkInPendiente, setCheckInPendiente] = useState<{
    reserva: ReservaRow
    pistaNombre: string
    clienteNombre?: string
  } | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const [pistas, todayReservas, caja] = await Promise.all([
          getPistas(supabase, CLUB_ID),
          getTodayReservas(supabase, CLUB_ID),
          getCajaActiva(supabase, CLUB_ID).catch(() => null),
        ])

        setCajaActiva(caja ? { id: caja.id } : null)

        setReservas(todayReservas)

        // Build a map of pista_id → active reserva
        const now = new Date()
        const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`

        const activeReservaMap = new Map<string, ReservaRow>()
        for (const r of todayReservas) {
          if ((r.estado === 'checkin' || r.estado === 'confirmada') && r.hora_inicio <= nowTime && r.hora_fin >= nowTime) {
            if (!activeReservaMap.has(r.pista_id)) {
              activeReservaMap.set(r.pista_id, r)
            }
          }
        }

        const mapped: Court[] = pistas.map((p) => {
          const reserva = activeReservaMap.get(p.id)

          if (reserva) {
            const status = dbStatusToCourtStatus(reserva.estado)
            const elapsed = (reserva.estado === 'checkin') ? calcElapsedSeconds(reserva.hora_inicio) : undefined
            const [sh, sm] = reserva.hora_inicio.split(':').map(Number)
            const [eh, em] = reserva.hora_fin.split(':').map(Number)
            const maxTime = (eh * 60 + em - sh * 60 - sm) * 60

            return {
              id: p.id,
              name: p.nombre,
              status,
              timer: elapsed,
              maxTime: maxTime > 0 ? maxTime : 3600,
              titular: reserva.clientes?.nombre ?? reserva.nombre_cliente ?? undefined,
              tarifa: reserva.precio,
            }
          }

          return {
            id: p.id,
            name: p.nombre,
            status: p.en_mantenimiento ? 'mantenimiento' : 'disponible',
            task: p.nota_mantenimiento ?? 'En mantenimiento',
            tarifa: p.en_mantenimiento ? 0 : 450,
          }
        })

        setCourts(mapped)
      } catch (err) {
        console.error('Error loading pistas:', err)
      } finally {
        setLoading(false)
      }
    }

    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  // Tick timer every second for occupied courts
  useEffect(() => {
    const interval = setInterval(() => {
      setCourts((prev) =>
        prev.map((c) => {
          if (c.status === 'ocupada' && c.timer !== undefined) {
            return { ...c, timer: c.timer + 1 }
          }
          return c
        })
      )
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const occupiedCount = courts.filter((c) => c.status === 'ocupada').length

  function refreshCourts() {
    setRefreshKey((k) => k + 1)
  }

  function handleCourtClick(court: Court) {
    setSelectedCourt(court)
    if (court.status === 'disponible') {
      setShowReservation(true)
    } else {
      setShowCourtAccount(true)
    }
  }

  function getActiveReservaForCourt(courtId: string): ReservaRow | null {
    return reservas.find((r) =>
      r.pista_id === courtId &&
      (r.estado === 'checkin' || r.estado === 'confirmada')
    ) ?? null
  }

  function handleCheckInRequest(reserva: ReservaRow) {
    const court = courts.find((c) => c.id === reserva.pista_id)
    const pistaNombre = court?.name ?? reserva.pistas?.nombre ?? 'Cancha'
    const clienteNombre = reserva.clientes?.nombre ?? reserva.nombre_cliente ?? undefined
    setCheckInPendiente({ reserva, pistaNombre, clienteNombre })
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 56px)', color: 'var(--color-muted)', fontSize: '14px' }}>
        Cargando pistas...
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      {/* Modals */}
      {showManagement && (
        <CourtManagementModal
          onClose={() => setShowManagement(false)}
          onRefresh={refreshCourts}
        />
      )}
      {showReservation && (
        <ReservationModal
          court={selectedCourt ?? undefined}
          courts={courts}
          onClose={() => { setShowReservation(false); setSelectedCourt(null) }}
          onSuccess={() => { setShowReservation(false); setSelectedCourt(null); refreshCourts() }}
        />
      )}
      {showCourtAccount && selectedCourt && (
        <CourtAccountModal
          court={selectedCourt}
          reserva={getActiveReservaForCourt(selectedCourt.id)}
          onClose={() => { setShowCourtAccount(false); setSelectedCourt(null) }}
          onRefresh={refreshCourts}
          onReservar={() => { setShowCourtAccount(false); setShowReservation(true) }}
          onCheckIn={handleCheckInRequest}
          cajaId={cajaActiva?.id}
        />
      )}
      {checkInPendiente && (
        <CheckInPaymentModal
          open={true}
          reserva={checkInPendiente.reserva}
          pistaNombre={checkInPendiente.pistaNombre}
          clienteNombre={checkInPendiente.clienteNombre}
          cajaId={cajaActiva?.id}
          supabase={supabase}
          onSuccess={() => { setCheckInPendiente(null); refreshCourts() }}
          onCancel={() => setCheckInPendiente(null)}
        />
      )}

      {/* Main grid */}
      <div style={{ padding: '24px', overflowY: 'auto', paddingBottom: '100px', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
          <span
            onClick={() => setShowManagement(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 700, color: 'var(--color-muted)', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.5px', transition: 'color 0.15s' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-lime)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-muted)')}
          >
            <Settings2 size={11} /> Gestionar Canchas
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
          {courts.map((court) => (
            <CourtCard key={court.id} court={court} onClick={() => handleCourtClick(court)} />
          ))}
        </div>

        {/* Nueva Reservación fijo */}
        <button
          style={{
            position: 'fixed',
            bottom: '24px',
            left: '244px',
            width: '420px',
            padding: '16px',
            background: 'var(--color-lime)',
            color: 'var(--color-bg)',
            fontSize: '14px',
            fontWeight: 800,
            textAlign: 'center',
            borderRadius: '12px',
            cursor: 'pointer',
            border: 'none',
            fontFamily: 'inherit',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            boxShadow: '0 8px 32px rgba(108,242,13,0.20)',
            zIndex: 10,
            transition: 'filter 0.15s',
          }}
          onClick={() => { setSelectedCourt(null); setShowReservation(true) }}
          onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.08)')}
          onMouseLeave={(e) => (e.currentTarget.style.filter = '')}
        >
          <Plus size={18} />
          Nueva Reservación
        </button>
      </div>

      {/* Sidebar */}
      <PistasSidebar occupiedCount={occupiedCount} totalCourts={courts.length} reservas={reservas} />
    </div>
  )
}
