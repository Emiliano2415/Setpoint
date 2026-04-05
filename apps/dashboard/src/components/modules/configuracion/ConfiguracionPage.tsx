'use client'

import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import {
  getClub,
  updateClub,
  type ClubRow,
  type ClubConfig,
  type Tarifa,
} from '@/lib/supabase/queries/configuracion'
import { useAppStore } from '@/store/useAppStore'

const METODOS_DISPONIBLES = [
  { key: 'efectivo', label: 'Efectivo', desc: 'Pagos en efectivo' },
  { key: 'tarjeta_credito', label: 'Tarjeta de Crédito', desc: 'Terminal integrada' },
  { key: 'tarjeta_debito', label: 'Tarjeta de Débito', desc: 'Contactless' },
  { key: 'cuenta_cliente', label: 'Cuenta Cliente', desc: 'Cargo a cuenta abierta' },
  { key: 'bonos', label: 'Bonos Prepagados', desc: 'Horas prepagadas' },
]

interface ToggleRowProps {
  label: string
  desc: string
  on: boolean
  onChange: (val: boolean) => void
}

function ToggleRow({ label, desc, on, onChange }: ToggleRowProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
      <div>
        <div style={{ fontSize: '13px', fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: '11px', color: 'var(--color-muted-dim)' }}>{desc}</div>
      </div>
      <div
        onClick={() => onChange(!on)}
        style={{
          width: '38px', height: '20px',
          background: on ? 'var(--color-lime)' : 'var(--color-border)',
          borderRadius: '10px', position: 'relative', cursor: 'pointer',
          transition: 'background 0.15s', flexShrink: 0,
        }}
      >
        <div
          style={{
            width: '16px', height: '16px', background: 'white', borderRadius: '50%',
            position: 'absolute', top: '2px', left: '2px',
            transform: on ? 'translateX(18px)' : 'translateX(0)',
            transition: 'transform 0.15s',
          }}
        />
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--color-bg)', border: '1px solid var(--color-border)',
  borderRadius: '8px', padding: '9px 12px', color: 'var(--color-text)',
  fontSize: '13px', outline: 'none', boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  fontSize: '10px', fontWeight: 600, color: 'var(--color-muted)',
  textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px', display: 'block',
}

export function ConfiguracionPage() {
  const clubId = useAppStore((s) => s.clubId)
  const [club, setClub] = useState<ClubRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Form state — datos del club
  const [nombre, setNombre] = useState('')
  const [direccion, setDireccion] = useState('')
  const [telefono, setTelefono] = useState('')

  // Config state
  const [metodosPago, setMetodosPago] = useState<string[]>([])
  const [tarifas, setTarifas] = useState<Tarifa[]>([])
  const [iva, setIva] = useState('16')
  const [toleranciaCaja, setToleranciaCaja] = useState('50')
  const [timerAlerta, setTimerAlerta] = useState('15')
  const [noshowTolerancia, setNoshowTolerancia] = useState('15')

  useEffect(() => {
    const supabase = createClient()
    getClub(supabase, clubId ?? '')
      .then((data) => {
        if (!data) return
        setClub(data)
        setNombre(data.nombre ?? '')
        setDireccion(data.direccion ?? '')
        setTelefono(data.telefono ?? '')
        const cfg: ClubConfig = data.config ?? {}
        setMetodosPago(cfg.metodos_pago ?? [])
        setTarifas(cfg.tarifas ?? [])
        setIva(String(Math.round((cfg.iva_default ?? 0.16) * 100)))
        setToleranciaCaja(String(cfg.tolerancia_caja ?? 50))
        setTimerAlerta(String(cfg.timer_alerta_min ?? 15))
        setNoshowTolerancia(String(cfg.noshow_tolerancia_min ?? 15))
      })
      .catch((err) => {
        console.error('Error cargando club:', err)
        toast.error('Error al cargar la configuración')
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleGuardar() {
    if (!club) return
    setSaving(true)
    try {
      const supabase = createClient()
      const config: ClubConfig = {
        ...(club.config ?? {}),
        metodos_pago: metodosPago,
        tarifas,
        iva_default: parseFloat(iva) / 100,
        tolerancia_caja: parseFloat(toleranciaCaja),
        timer_alerta_min: parseInt(timerAlerta),
        noshow_tolerancia_min: parseInt(noshowTolerancia),
      }
      await updateClub(supabase, clubId ?? '', { nombre, direccion, telefono, config })
      setClub({ ...club, nombre, direccion, telefono, config })
      toast.success('Configuración guardada correctamente')
    } catch (err) {
      console.error('Error guardando:', err)
      toast.error('Error al guardar la configuración')
    } finally {
      setSaving(false)
    }
  }

  function toggleMetodo(key: string, on: boolean) {
    setMetodosPago((prev) =>
      on ? [...prev, key] : prev.filter((m) => m !== key),
    )
  }

  function updateTarifaPrecio(idx: number, precio: string) {
    setTarifas((prev) => prev.map((t, i) => i === idx ? { ...t, precio: parseFloat(precio) || 0 } : t))
  }

  if (loading) {
    return (
      <div style={{ padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 56px)', color: 'var(--color-muted)' }}>
        Cargando configuración...
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', overflowY: 'auto', height: 'calc(100vh - 56px)' }}>
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.3px' }}>Configuración del Club</div>
        <div style={{ fontSize: '13px', color: 'var(--color-muted)', marginTop: '4px' }}>Parámetros generales, precios, fiscal y periféricos</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        {/* Datos del Club */}
        <Card>
          <CardHeader><CardTitle>Datos del Club</CardTitle></CardHeader>
          {[
            { label: 'Nombre', value: nombre, setter: setNombre, mono: false },
            { label: 'Dirección', value: direccion, setter: setDireccion, mono: false },
            { label: 'Teléfono', value: telefono, setter: setTelefono, mono: true },
          ].map((field) => (
            <div key={field.label} style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>{field.label}</label>
              <input
                value={field.value}
                onChange={(e) => field.setter(e.target.value)}
                style={{ ...inputStyle, fontFamily: field.mono ? 'var(--font-mono)' : 'inherit' }}
              />
            </div>
          ))}
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <Button variant="primary" onClick={handleGuardar} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                if (!club) return
                setNombre(club.nombre)
                setDireccion(club.direccion ?? '')
                setTelefono(club.telefono ?? '')
              }}
            >
              Cancelar
            </Button>
          </div>
        </Card>

        {/* Métodos de Pago */}
        <Card>
          <CardHeader><CardTitle>Métodos de Pago</CardTitle></CardHeader>
          {METODOS_DISPONIBLES.map((m) => (
            <ToggleRow
              key={m.key}
              label={m.label}
              desc={m.desc}
              on={metodosPago.includes(m.key)}
              onChange={(val) => toggleMetodo(m.key, val)}
            />
          ))}
          <div style={{ marginTop: '12px' }}>
            <Button variant="primary" onClick={handleGuardar} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar métodos'}
            </Button>
          </div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* Tarifas por Franja */}
        <Card>
          <CardHeader><CardTitle>Precios por Franja</CardTitle></CardHeader>
          {tarifas.length === 0 ? (
            <div style={{ fontSize: '13px', color: 'var(--color-muted)', padding: '12px 0' }}>Sin tarifas configuradas</div>
          ) : (
            tarifas.map((slot, idx) => (
              <div
                key={slot.nombre}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 12px', borderRadius: '8px', background: 'var(--color-bg)',
                  marginBottom: '6px', border: '1px solid var(--color-border-subtle)',
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 500, minWidth: '100px' }}>
                  {slot.inicio} – {slot.fin}
                </span>
                <span style={{ fontSize: '10px', color: 'var(--color-muted)', flex: 1, textAlign: 'center' }}>
                  {slot.nombre}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--color-muted)' }}>$</span>
                  <input
                    type="number"
                    value={slot.precio}
                    onChange={(e) => updateTarifaPrecio(idx, e.target.value)}
                    style={{
                      width: '70px', background: 'var(--color-bg2)', border: '1px solid var(--color-border)',
                      borderRadius: '6px', padding: '4px 8px', color: 'var(--color-lime)',
                      fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600,
                      outline: 'none', textAlign: 'right',
                    }}
                  />
                </div>
              </div>
            ))
          )}
          {tarifas.length > 0 && (
            <div style={{ marginTop: '8px' }}>
              <Button variant="primary" onClick={handleGuardar} disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar tarifas'}
              </Button>
            </div>
          )}
        </Card>

        {/* Parámetros del Sistema */}
        <Card>
          <CardHeader><CardTitle>Parámetros del Sistema</CardTitle></CardHeader>
          {[
            { label: 'Tasa de IVA (%)', value: iva, setter: setIva, hint: 'Aplicado automáticamente a todos los productos' },
            { label: 'Tolerancia de caja (MXN)', value: toleranciaCaja, setter: setToleranciaCaja, hint: 'Diferencia aceptable en arqueo' },
            { label: 'Timer: Alerta previa (min)', value: timerAlerta, setter: setTimerAlerta, hint: 'Notificación antes de fin de reserva' },
            { label: 'No-show: Tolerancia (min)', value: noshowTolerancia, setter: setNoshowTolerancia, hint: 'Espera antes de marcar no-show' },
          ].map((param) => (
            <div key={param.label} style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>{param.label}</label>
              <input
                type="number"
                value={param.value}
                onChange={(e) => param.setter(e.target.value)}
                style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
              />
              <div style={{ fontSize: '10px', color: 'var(--color-muted-dim)', marginTop: '3px' }}>{param.hint}</div>
            </div>
          ))}
          <Button variant="primary" onClick={handleGuardar} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar parámetros'}
          </Button>
        </Card>
      </div>
    </div>
  )
}
