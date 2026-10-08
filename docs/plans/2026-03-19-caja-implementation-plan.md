# Caja — Control Total de Turnos: Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rediseñar el módulo de Caja para soportar apertura de turno, cortes parciales con comprobante, cierre correcto de turno, y una pantalla de estado vacío con historial cuando no hay caja activa.

**Architecture:** CajaPage tiene dos modos (cerrada/abierta) controlados por la existencia de una caja con `estado='abierta'`. El TopBar "Nuevo Turno" dispara el modal de apertura navegando a /caja. Sin cambios en el esquema de DB — todo cabe en `cajas`, `turnos`, `movimientos_caja`.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, Supabase PostgREST, Zustand, Sonner (toasts), date-fns, lucide-react

---

## Contexto Crítico

- **Club ID:** `a1000000-0000-0000-0000-000000000001`
- **Empleado existente:** Carlos Rodríguez — `f2000000-0000-0000-0000-000000000001`
- **Caja existente:** `c1000000-0000-0000-0000-000000000001` (estado actual: cerrada)
- **DB `turnos`:** `id, club_id, empleado_id, tipo (enum), inicio, fin (nullable), activo (bool)`
- **DB `cajas`:** `id, club_id, turno_id, fondo_inicial, estado ('abierta'|'cerrada'|'revisada'), total_efectivo, total_tarjeta, total_propinas, diferencia, cerrada_at (nullable), created_at`
- **DB `movimientos_caja`:** `id, caja_id, tipo ('ingreso'|'egreso'|'fondo'|'retiro'), concepto, monto, metodo (nullable), created_at`
- **Validación:** `npx tsc --noEmit` desde `apps/dashboard/` — debe terminar con EXIT:0

---

## Task 1: Ampliar queries/caja.ts

**Files:**
- Modify: `apps/dashboard/src/lib/supabase/queries/caja.ts`

**Step 1: Agregar función `getEmpleadosActivos`**

Al final del archivo agregar:

```typescript
export interface EmpleadoBasic {
  id: string
  nombre: string
}

export async function getEmpleadosActivos(
  supabase: SupabaseClient,
  clubId: string,
): Promise<EmpleadoBasic[]> {
  const { data, error } = await supabase
    .from('empleados')
    .select('id, nombre')
    .eq('club_id', clubId)
    .eq('activo', true)
    .order('nombre')
  if (error) throw error
  return (data ?? []) as EmpleadoBasic[]
}
```

**Step 2: Agregar función `openCaja`**

```typescript
export interface OpenCajaResult {
  cajaId: string
  turnoId: string
}

export async function openCaja(
  supabase: SupabaseClient,
  clubId: string,
  empleadoId: string,
  tipo: string,
  fondoInicial: number,
  notas?: string,
): Promise<OpenCajaResult> {
  // 1. Crear turno
  const { data: turno, error: turnoError } = await supabase
    .from('turnos')
    .insert({
      club_id: clubId,
      empleado_id: empleadoId,
      tipo,
      activo: true,
    })
    .select('id')
    .single()
  if (turnoError) throw turnoError

  // 2. Crear caja ligada al turno
  const { data: caja, error: cajaError } = await supabase
    .from('cajas')
    .insert({
      club_id: clubId,
      turno_id: turno.id,
      fondo_inicial: fondoInicial,
      estado: 'abierta',
      total_efectivo: 0,
      total_tarjeta: 0,
      total_propinas: 0,
      diferencia: 0,
    })
    .select('id')
    .single()
  if (cajaError) throw cajaError

  // 3. Registrar fondo inicial como movimiento
  if (fondoInicial > 0) {
    await supabase.from('movimientos_caja').insert({
      caja_id: caja.id,
      tipo: 'fondo',
      concepto: notas ?? 'Fondo inicial de turno',
      monto: fondoInicial,
    })
  }

  return { cajaId: caja.id, turnoId: turno.id }
}
```

**Step 3: Arreglar `closeCaja` para también cerrar el turno**

Reemplazar la función `closeCaja` existente por:

```typescript
export async function closeCaja(
  supabase: SupabaseClient,
  cajaId: string,
  turnoId: string,
  contado: number,
  esperado: number,
): Promise<void> {
  const diferencia = contado - esperado

  const { error: cajaError } = await supabase
    .from('cajas')
    .update({
      estado: 'cerrada',
      total_efectivo: contado,
      diferencia,
      cerrada_at: new Date().toISOString(),
    })
    .eq('id', cajaId)
  if (cajaError) throw cajaError

  const { error: turnoError } = await supabase
    .from('turnos')
    .update({
      fin: new Date().toISOString(),
      activo: false,
    })
    .eq('id', turnoId)
  if (turnoError) throw turnoError
}
```

**Step 4: Agregar función `insertCorteParcial`**

```typescript
export async function insertCorteParcial(
  supabase: SupabaseClient,
  cajaId: string,
  montoRetiro: number,
  concepto: string,
): Promise<MovimientoCaja> {
  const { data, error } = await supabase
    .from('movimientos_caja')
    .insert({
      caja_id: cajaId,
      tipo: 'retiro' as MovimientoTipo,
      concepto,
      monto: montoRetiro,
    })
    .select()
    .single()
  if (error) throw error
  return data as MovimientoCaja
}
```

**Step 5: Verificar TypeScript**

```bash
cd apps/dashboard && npx tsc --noEmit 2>&1; echo "EXIT:$?"
```
Esperado: `EXIT:0`

---

## Task 2: Crear OpenShiftModal

**Files:**
- Create: `apps/dashboard/src/components/modules/caja/OpenShiftModal.tsx`

**Step 1: Crear el componente completo**

```typescript
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

const CLUB_ID = 'a1000000-0000-0000-0000-000000000001'

type TipoTurno = 'mañana' | 'tarde' | 'noche'

interface Props {
  onClose: () => void
  onSuccess: (cajaId: string) => void
}

function detectarTipo(): TipoTurno {
  const h = new Date().getHours()
  if (h < 12) return 'mañana'
  if (h < 18) return 'tarde'
  return 'noche'
}

export function OpenShiftModal({ onClose, onSuccess }: Props) {
  const [tipo, setTipo] = useState<TipoTurno>(detectarTipo())
  const [fondoInicial, setFondoInicial] = useState('2000')
  const [notas, setNotas] = useState('')
  const [empleados, setEmpleados] = useState<EmpleadoBasic[]>([])
  const [empleadoId, setEmpleadoId] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getEmpleadosActivos(createClient(), CLUB_ID)
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
        CLUB_ID,
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
    { value: 'mañana', label: 'Mañana', emoji: '🌅' },
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
```

**Step 2: Verificar TypeScript**

```bash
cd apps/dashboard && npx tsc --noEmit 2>&1; echo "EXIT:$?"
```
Esperado: `EXIT:0`

---

## Task 3: Crear PartialCutModal

**Files:**
- Create: `apps/dashboard/src/components/modules/caja/PartialCutModal.tsx`

**Step 1: Crear el componente completo**

```typescript
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
              background: 'rgba(108,242,13,0.04)',
              border: '1px solid rgba(108,242,13,0.15)',
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
                background: saving || !isValid ? 'rgba(108,242,13,0.3)' : 'var(--color-lime)',
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
```

**Step 2: Verificar TypeScript**

```bash
cd apps/dashboard && npx tsc --noEmit 2>&1; echo "EXIT:$?"
```
Esperado: `EXIT:0`

---

## Task 4: Arreglar CloseShiftModal para cerrar el turno

**Files:**
- Modify: `apps/dashboard/src/components/modules/caja/CloseShiftModal.tsx`

**Step 1: Agregar `turnoId` a Props e interface**

Cambiar la interfaz Props:
```typescript
interface Props {
  cajaId: string
  turnoId: string          // AGREGAR
  efectivoEsperado: number
  onClose: () => void
  onSuccess: () => void
}
```

Actualizar la desestructuración del componente:
```typescript
export function CloseShiftModal({ cajaId, turnoId, efectivoEsperado, onClose, onSuccess }: Props) {
```

**Step 2: Actualizar la llamada a `closeCaja`**

Dentro de `handleConfirmar`, cambiar:
```typescript
// ANTES
await closeCaja(createClient(), cajaId, contadoNum, efectivoEsperado)
// DESPUÉS
await closeCaja(createClient(), cajaId, turnoId, contadoNum, efectivoEsperado)
```

**Step 3: Verificar TypeScript**

```bash
cd apps/dashboard && npx tsc --noEmit 2>&1; echo "EXIT:$?"
```
Esperado: `EXIT:0`

---

## Task 5: Refactorizar CajaPage con dos modos

**Files:**
- Modify: `apps/dashboard/src/components/modules/caja/CajaPage.tsx`

**Step 1: Reemplazar CajaPage completo**

Reemplazar todo el contenido de `CajaPage.tsx` con:

```typescript
'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Plus, History, TrendingUp, Scissors } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getCajaActiva, getCajaStats, getCierresCaja } from '@/lib/supabase/queries/caja'
import type { CajaActiva, CajaStats, CajaCierre } from '@/lib/supabase/queries/caja'
import { StatCard } from '@/components/ui/StatCard'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { CloseShiftModal } from './CloseShiftModal'
import { CashMovementModal } from './CashMovementModal'
import { ShiftHistoryPanel } from './ShiftHistoryPanel'
import { OpenShiftModal } from './OpenShiftModal'
import { PartialCutModal } from './PartialCutModal'

const CLUB_ID = 'a1000000-0000-0000-0000-000000000001'

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
  onReload,
}: {
  caja: CajaActiva
  stats: CajaStats
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
    </div>
  )
}

// ─── CajaPage principal ───────────────────────────────────────────────────────

export function CajaPage() {
  const [caja, setCaja] = useState<CajaActiva | null | undefined>(undefined) // undefined = loading
  const [stats, setStats] = useState<CajaStats | null>(null)
  const [cierres, setCierres] = useState<CajaCierre[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showOpenModal, setShowOpenModal] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      try {
        const [cajaData, cierresData] = await Promise.all([
          getCajaActiva(supabase, CLUB_ID),
          getCierresCaja(supabase, CLUB_ID),
        ])
        setCaja(cajaData)
        setCierres(cierresData)
        if (cajaData) {
          const statsData = await getCajaStats(supabase, cajaData.id)
          setStats(statsData)
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
          onReload={reload}
        />
      )}
    </>
  )
}
```

**Step 2: Verificar TypeScript**

```bash
cd apps/dashboard && npx tsc --noEmit 2>&1; echo "EXIT:$?"
```
Esperado: `EXIT:0`

---

## Task 6: Conectar TopBar "Nuevo Turno"

**Files:**
- Modify: `apps/dashboard/src/components/layout/TopBar.tsx`

**Step 1: Agregar onClick al botón "Nuevo Turno"**

El botón actualmente no hace nada. La solución más simple: redirigir a `/caja` (donde el usuario puede abrir el turno). Cuando ya estamos en `/caja`, el botón dispara el modal de apertura directamente usando `useRouter`.

Importar `useRouter` al inicio del archivo:
```typescript
import { usePathname, useRouter } from 'next/navigation'
```

Dentro del componente `TopBar`, agregar:
```typescript
const router = useRouter()

function handleNuevoTurno() {
  if (pathname.startsWith('/caja')) {
    // Emitir un evento custom para que CajaPage abra el modal
    window.dispatchEvent(new CustomEvent('caja:open-shift'))
  } else {
    router.push('/caja')
  }
}
```

Agregar `onClick={handleNuevoTurno}` al botón "Nuevo Turno":
```typescript
<button
  onClick={handleNuevoTurno}
  style={{ ... }}
  ...
>
  Nuevo Turno
</button>
```

**Step 2: En CajaPage, escuchar el evento**

En `CajaPage`, dentro del `useEffect` inicial, agregar un listener:
```typescript
useEffect(() => {
  function handleOpenShift() {
    setShowOpenModal(true)
  }
  window.addEventListener('caja:open-shift', handleOpenShift)
  return () => window.removeEventListener('caja:open-shift', handleOpenShift)
}, [])
```

**Step 3: Verificar TypeScript**

```bash
cd apps/dashboard && npx tsc --noEmit 2>&1; echo "EXIT:$?"
```
Esperado: `EXIT:0`

---

## Verificación Final End-to-End

1. Ir a `/caja` → debe mostrar "Sin Turno Activo" con historial
2. Click "Abrir Turno" → modal con tipo/cajero/fondo → confirmar → caja activa con stats
3. Ir a otra página → click "Nuevo Turno" en TopBar → redirige a `/caja`
4. Estando en `/caja` con turno activo → click "Nuevo Turno" en TopBar → abre modal directamente
5. Click "Corte Parcial" → ingresar monto → registrar → muestra comprobante → imprimir
6. Click "Cerrar Turno y Arqueo" → wizard 2 pasos → confirmar → vuelve a vista cerrada
7. La vista cerrada muestra el cierre recién hecho como "Último Cierre"

```bash
cd apps/dashboard && npx tsc --noEmit 2>&1; echo "EXIT:$?"
```
Esperado: `EXIT:0`
