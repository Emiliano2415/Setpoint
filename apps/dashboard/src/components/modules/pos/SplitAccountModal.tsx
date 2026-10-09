'use client'

import { useState, useRef } from 'react'
import type { TicketItem } from './POSPage'
import type { MetodoPago } from '@/lib/supabase/queries/pos'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Person {
  id: string
  nombre: string
  color: string
}

// itemId → [{ personId, qty }] — allows splitting a qty-3 item 2+1 across persons
type AssignmentMap = Map<string, { personId: string; qty: number }[]>

export interface PersonSplit {
  nombre: string
  items: { producto_id: string; nombre: string; precio_unitario: number; cantidad: number }[]
  metodo: MetodoPago
  subtotal: number
  iva: number
  total: number
}

/**
 * 'por-persona': cada quien paga sus productos (una cuenta por persona).
 * 'iguales': una sola venta pagada entre varios (una cuenta, un pago por persona).
 */
export type SplitMode = 'por-persona' | 'iguales'

interface SplitAccountModalProps {
  open: boolean
  items: TicketItem[]
  cajaId: string | null | undefined
  onConfirm: (splits: PersonSplit[], modo: SplitMode) => Promise<void>
  onCancel: () => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TAX_RATE = 0.16
const PERSON_COLORS = ['#a3d483', '#60a5fa', '#f472b6', '#fb923c', '#a78bfa', '#34d399']
const METODOS: { key: MetodoPago; label: string; icon: string }[] = [
  { key: 'efectivo', label: 'Efectivo', icon: '💵' },
  { key: 'credito', label: 'Crédito', icon: '💳' },
  { key: 'debito', label: 'Débito', icon: '🏦' },
  { key: 'cortesia', label: 'Cortesía', icon: '🎁' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcPersonTotal(
  personId: string,
  items: TicketItem[],
  assignments: AssignmentMap
): { subtotal: number; iva: number; total: number } {
  let subtotal = 0
  for (const item of items) {
    const assigned = assignments.get(item.id) ?? []
    for (const a of assigned) {
      if (a.personId === personId) {
        subtotal += item.price * a.qty
      }
    }
  }
  const iva = subtotal * TAX_RATE
  const total = subtotal + iva
  return { subtotal, iva, total }
}

function totalUnassignedQty(items: TicketItem[], assignments: AssignmentMap): number {
  let unassigned = 0
  for (const item of items) {
    const assigned = assignments.get(item.id) ?? []
    const assignedQty = assigned.reduce((sum, a) => sum + a.qty, 0)
    unassigned += item.qty - assignedQty
  }
  return unassigned
}

function fmtMoney(n: number): string {
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
}

// ─── Method Selector ──────────────────────────────────────────────────────────

interface MethodSelectorProps {
  selected: MetodoPago | undefined
  onSelect: (m: MetodoPago) => void
}

function MethodSelector({ selected, onSelect }: MethodSelectorProps) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
      {METODOS.map((m) => {
        const isActive = selected === m.key
        return (
          <button
            key={m.key}
            onClick={() => onSelect(m.key)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '5px 10px',
              borderRadius: 6,
              border: isActive ? '1.5px solid var(--color-lime)' : '1.5px solid var(--color-border)',
              background: isActive ? 'rgba(163,212,131,0.08)' : 'transparent',
              color: isActive ? 'var(--color-lime)' : 'var(--color-muted)',
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}
          >
            <span>{m.icon}</span>
            <span>{m.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ─── TabPorPersona ────────────────────────────────────────────────────────────

interface TabPorPersonaProps {
  items: TicketItem[]
  persons: Person[]
  assignments: AssignmentMap
  newPersonName: string
  metodoMap: Map<string, MetodoPago>
  activeItemId: string | null
  nameInputRef: React.RefObject<HTMLInputElement | null>
  onNewPersonNameChange: (v: string) => void
  onAddPerson: () => void
  onRemovePerson: (id: string) => void
  onAssignItem: (itemId: string, personId: string) => void
  onUnassignItem: (itemId: string) => void
  onSetActiveItem: (id: string | null) => void
  onSetMetodo: (personId: string, metodo: MetodoPago) => void
}

function TabPorPersona({
  items,
  persons,
  assignments,
  newPersonName,
  metodoMap,
  activeItemId,
  nameInputRef,
  onNewPersonNameChange,
  onAddPerson,
  onRemovePerson,
  onAssignItem,
  onUnassignItem,
  onSetActiveItem,
  onSetMetodo,
}: TabPorPersonaProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Section 1: Add persons */}
      <div>
        <div
          style={{
            fontSize: 12,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--color-muted)',
            marginBottom: 8,
          }}
        >
          Personas
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            ref={nameInputRef}
            value={newPersonName}
            onChange={(e) => onNewPersonNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onAddPerson()
            }}
            placeholder="Nombre de persona..."
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg)',
              color: 'var(--color-text)',
              fontSize: 14,
              fontFamily: 'inherit',
              outline: 'none',
            }}
          />
          <button
            onClick={onAddPerson}
            disabled={!newPersonName.trim()}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: 'none',
              background: newPersonName.trim() ? 'var(--color-lime)' : 'var(--color-border)',
              color: newPersonName.trim() ? '#000' : 'var(--color-muted)',
              fontSize: 14,
              fontWeight: 600,
              cursor: newPersonName.trim() ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            }}
          >
            + Agregar
          </button>
        </div>

        {persons.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {persons.map((p) => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px 4px 8px',
                  borderRadius: 999,
                  border: `1.5px solid ${p.color}60`,
                  background: `${p.color}15`,
                  fontSize: 13,
                  color: 'var(--color-text)',
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: p.color,
                    flexShrink: 0,
                  }}
                />
                <span>{p.nombre}</span>
                <button
                  onClick={() => onRemovePerson(p.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-muted)',
                    cursor: 'pointer',
                    padding: 0,
                    lineHeight: 1,
                    fontSize: 14,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Items (only if persons > 0) */}
      {persons.length > 0 && (
        <div>
          <div
            style={{
              fontSize: 12,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--color-muted)',
              marginBottom: 8,
            }}
          >
            Ítems — toca para asignar
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {items.map((item) => {
              const assigned = assignments.get(item.id) ?? []
              const assignedQty = assigned.reduce((s, a) => s + a.qty, 0)
              const isFullyAssigned = assignedQty >= item.qty
              const assignedPersonId = assigned[0]?.personId
              const assignedPerson = persons.find((p) => p.id === assignedPersonId)
              const isOpen = activeItemId === item.id

              return (
                <div key={item.id}>
                  <div
                    onClick={() => onSetActiveItem(isOpen ? null : item.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: isFullyAssigned
                        ? `1.5px solid ${assignedPerson?.color ?? 'var(--color-border)'}60`
                        : '1.5px solid rgba(251,191,36,0.5)',
                      background: isFullyAssigned
                        ? `${assignedPerson?.color ?? '#ffffff'}10`
                        : 'rgba(251,191,36,0.06)',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {!isFullyAssigned && (
                        <span style={{ fontSize: 14 }}>⚠</span>
                      )}
                      {isFullyAssigned && assignedPerson && (
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: assignedPerson.color,
                            flexShrink: 0,
                          }}
                        />
                      )}
                      <span style={{ fontSize: 14, color: 'var(--color-text)' }}>
                        {item.qty}× {item.name}
                      </span>
                      {isFullyAssigned && assignedPerson && (
                        <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                          → {assignedPerson.nombre}
                        </span>
                      )}
                    </div>
                    <span
                      style={{
                        fontSize: 13,
                        color: 'var(--color-muted)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {fmtMoney(item.price * item.qty)}
                    </span>
                  </div>

                  {/* Popover when open */}
                  {isOpen && (
                    <div
                      style={{
                        marginTop: 4,
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-bg)',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 6,
                      }}
                    >
                      <div
                        style={{
                          width: '100%',
                          fontSize: 11,
                          color: 'var(--color-muted)',
                          marginBottom: 4,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}
                      >
                        Asignar a:
                      </div>
                      {persons.map((p) => {
                        const isAssignedToThis = assignedPersonId === p.id && isFullyAssigned
                        return (
                          <button
                            key={p.id}
                            onClick={() => onAssignItem(item.id, p.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '5px 12px',
                              borderRadius: 999,
                              border: isAssignedToThis
                                ? `1.5px solid ${p.color}`
                                : `1.5px solid ${p.color}60`,
                              background: isAssignedToThis ? `${p.color}20` : `${p.color}10`,
                              color: 'var(--color-text)',
                              fontSize: 13,
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                            }}
                          >
                            <span
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                background: p.color,
                              }}
                            />
                            {p.nombre}
                          </button>
                        )
                      })}
                      {isFullyAssigned && (
                        <button
                          onClick={() => onUnassignItem(item.id)}
                          style={{
                            padding: '5px 12px',
                            borderRadius: 999,
                            border: '1.5px solid var(--color-border)',
                            background: 'transparent',
                            color: 'var(--color-muted)',
                            fontSize: 13,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          Sin asignar
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Section 3: Cobro (only if persons > 0) */}
      {persons.length > 0 && (
        <div>
          <div
            style={{
              fontSize: 12,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--color-muted)',
              marginBottom: 8,
            }}
          >
            Cobro
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {persons.map((p) => {
              const { total } = calcPersonTotal(p.id, items, assignments)
              const selectedMetodo = metodoMap.get(p.id)
              return (
                <div
                  key={p.id}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: '1px solid var(--color-border)',
                    background: 'rgba(255,255,255,0.02)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: p.color,
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontSize: 14, color: 'var(--color-text)', fontWeight: 500 }}>
                        {p.nombre}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: 16,
                        fontWeight: 700,
                        color: 'var(--color-lime)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {fmtMoney(total)}
                    </span>
                  </div>
                  <MethodSelector
                    selected={selectedMetodo}
                    onSelect={(m) => onSetMetodo(p.id, m)}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── TabIguales ───────────────────────────────────────────────────────────────

interface TabIgualesProps {
  grandTotalWithTax: number
  numPersons: number
  metodoIguales: Map<number, MetodoPago>
  onSetNumPersons: (n: number) => void
  onSetMetodoIguales: (idx: number, m: MetodoPago) => void
}

function TabIguales({
  grandTotalWithTax,
  numPersons,
  metodoIguales,
  onSetNumPersons,
  onSetMetodoIguales,
}: TabIgualesProps) {
  const baseAmount = Math.floor((grandTotalWithTax / numPersons) * 100) / 100
  const remainder =
    Math.round((grandTotalWithTax - baseAmount * numPersons) * 100) / 100
  const isEven = remainder === 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Total display */}
      <div
        style={{
          textAlign: 'center',
          padding: '20px 16px',
          borderRadius: 12,
          border: '1px solid var(--color-border)',
          background: 'rgba(255,255,255,0.02)',
        }}
      >
        <div
          style={{
            fontSize: 12,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--color-muted)',
            marginBottom: 6,
          }}
        >
          Total a dividir
        </div>
        <div
          style={{
            fontSize: 32,
            fontWeight: 700,
            color: 'var(--color-lime)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {fmtMoney(grandTotalWithTax)}
        </div>
      </div>

      {/* Stepper */}
      <div>
        <div
          style={{
            fontSize: 12,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--color-muted)',
            marginBottom: 10,
          }}
        >
          ¿Cuántas personas?
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => onSetNumPersons(Math.max(2, numPersons - 1))}
            disabled={numPersons <= 2}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              border: '1px solid var(--color-border)',
              background: numPersons <= 2 ? 'transparent' : 'var(--color-bg2)',
              color: numPersons <= 2 ? 'var(--color-muted-dim)' : 'var(--color-text)',
              fontSize: 18,
              cursor: numPersons <= 2 ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            −
          </button>
          <span
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: 'var(--color-text)',
              fontFamily: 'var(--font-mono)',
              minWidth: 32,
              textAlign: 'center',
            }}
          >
            {numPersons}
          </span>
          <button
            onClick={() => onSetNumPersons(Math.min(10, numPersons + 1))}
            disabled={numPersons >= 10}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              border: '1px solid var(--color-border)',
              background: numPersons >= 10 ? 'transparent' : 'var(--color-bg2)',
              color: numPersons >= 10 ? 'var(--color-muted-dim)' : 'var(--color-text)',
              fontSize: 18,
              cursor: numPersons >= 10 ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            +
          </button>
          <span style={{ fontSize: 13, color: 'var(--color-muted)', marginLeft: 4 }}>
            {fmtMoney(baseAmount)} / persona
            {!isEven && (
              <span style={{ color: 'rgba(251,191,36,0.9)', marginLeft: 6 }}>
                (último: {fmtMoney(baseAmount + remainder)})
              </span>
            )}
          </span>
        </div>
        {!isEven && (
          <div
            style={{
              marginTop: 8,
              fontSize: 12,
              color: 'rgba(251,191,36,0.9)',
              padding: '6px 10px',
              borderRadius: 6,
              background: 'rgba(251,191,36,0.06)',
              border: '1px solid rgba(251,191,36,0.2)',
            }}
          >
            El monto no es divisible de manera exacta. La diferencia de{' '}
            {fmtMoney(Math.abs(remainder))} se agrega a la última persona.
          </div>
        )}
      </div>

      {/* Per-person method selectors */}
      <div>
        <div
          style={{
            fontSize: 12,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--color-muted)',
            marginBottom: 10,
          }}
        >
          Cobro por persona
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Array.from({ length: numPersons }, (_, i) => {
            const isLast = i === numPersons - 1
            const amount = isLast ? baseAmount + remainder : baseAmount
            const color = PERSON_COLORS[i % PERSON_COLORS.length]
            return (
              <div
                key={i}
                style={{
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: '1px solid var(--color-border)',
                  background: 'rgba(255,255,255,0.02)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: color,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: 14, color: 'var(--color-text)', fontWeight: 500 }}>
                      Persona {i + 1}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: 'var(--color-lime)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {fmtMoney(amount)}
                  </span>
                </div>
                <MethodSelector
                  selected={metodoIguales.get(i)}
                  onSelect={(m) => onSetMetodoIguales(i, m)}
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SplitAccountModal({
  open,
  items,
  cajaId: _cajaId,
  onConfirm,
  onCancel,
}: SplitAccountModalProps) {
  // Tab
  const [tab, setTab] = useState<'persona' | 'iguales'>('persona')

  // Tab 1 state
  const [persons, setPersons] = useState<Person[]>([])
  const [assignments, setAssignments] = useState<AssignmentMap>(new Map())
  const [newPersonName, setNewPersonName] = useState('')
  const [metodoMap, setMetodoMap] = useState<Map<string, MetodoPago>>(new Map())
  const [activeItemId, setActiveItemId] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  // Tab 2 state
  const [numPersons, setNumPersons] = useState(2)
  const [metodoIguales, setMetodoIguales] = useState<Map<number, MetodoPago>>(new Map())

  // Ref
  const nameInputRef = useRef<HTMLInputElement>(null)

  if (!open) return null

  // Derived
  const grandTotal = items.reduce((s, it) => s + it.price * it.qty, 0)
  const grandIva = grandTotal * TAX_RATE
  const grandTotalWithTax = grandTotal + grandIva
  const unassignedQty = totalUnassignedQty(items, assignments)
  const canConfirmPersona =
    persons.length >= 1 &&
    unassignedQty === 0 &&
    persons.every((p) => metodoMap.has(p.id))
  const canConfirmIguales =
    Array.from({ length: numPersons }, (_, i) => i).every((i) => metodoIguales.has(i))

  // Person management
  function addPerson() {
    const trimmed = newPersonName.trim()
    if (!trimmed) return
    const newPerson: Person = {
      id: crypto.randomUUID(),
      nombre: trimmed,
      color: PERSON_COLORS[persons.length % PERSON_COLORS.length],
    }
    setPersons((prev) => [...prev, newPerson])
    setNewPersonName('')
    setTimeout(() => nameInputRef.current?.focus(), 0)
  }

  function removePerson(personId: string) {
    setPersons((prev) => prev.filter((p) => p.id !== personId))
    setAssignments((prev) => {
      const next = new Map(prev)
      for (const [itemId, assigned] of next.entries()) {
        next.set(
          itemId,
          assigned.filter((a) => a.personId !== personId)
        )
      }
      return next
    })
    setMetodoMap((prev) => {
      const next = new Map(prev)
      next.delete(personId)
      return next
    })
  }

  function assignItem(itemId: string, personId: string) {
    const item = items.find((it) => it.id === itemId)
    if (!item) return
    setAssignments((prev) => {
      const next = new Map(prev)
      next.set(itemId, [{ personId, qty: item.qty }])
      return next
    })
    setActiveItemId(null)
  }

  function unassignItem(itemId: string) {
    setAssignments((prev) => {
      const next = new Map(prev)
      next.set(itemId, [])
      return next
    })
    setActiveItemId(null)
  }

  function setMetodo(personId: string, metodo: MetodoPago) {
    setMetodoMap((prev) => {
      const next = new Map(prev)
      next.set(personId, metodo)
      return next
    })
  }

  // Confirm handlers
  async function handleConfirmPersona() {
    if (!canConfirmPersona) return
    setConfirming(true)
    const splits: PersonSplit[] = persons.map((p) => {
      const personItems: PersonSplit['items'] = []
      for (const item of items) {
        const assigned = assignments.get(item.id) ?? []
        const entry = assigned.find((a) => a.personId === p.id)
        if (entry && entry.qty > 0) {
          personItems.push({
            producto_id: item.id,
            nombre: item.name,
            precio_unitario: item.price,
            cantidad: entry.qty,
          })
        }
      }
      const { subtotal, iva, total } = calcPersonTotal(p.id, items, assignments)
      return {
        nombre: p.nombre,
        items: personItems,
        metodo: metodoMap.get(p.id)!,
        subtotal,
        iva,
        total,
      }
    })
    try {
      await onConfirm(splits, 'por-persona')
    } finally {
      setConfirming(false)
    }
  }

  async function handleConfirmIguales() {
    if (!canConfirmIguales) return
    setConfirming(true)
    const baseAmount = Math.floor((grandTotalWithTax / numPersons) * 100) / 100
    const remainder =
      Math.round((grandTotalWithTax - baseAmount * numPersons) * 100) / 100

    const allItems: PersonSplit['items'] = items.map((it) => ({
      producto_id: it.id,
      nombre: it.name,
      precio_unitario: it.price,
      cantidad: it.qty,
    }))

    const splits: PersonSplit[] = Array.from({ length: numPersons }, (_, i) => {
      const isLast = i === numPersons - 1
      const total = isLast ? baseAmount + remainder : baseAmount
      const subtotal = Math.round((total / (1 + TAX_RATE)) * 100) / 100
      const iva = Math.round((total - subtotal) * 100) / 100
      return {
        nombre: `Persona ${i + 1}`,
        items: allItems,
        metodo: metodoIguales.get(i)!,
        subtotal,
        iva,
        total,
      }
    })
    try {
      await onConfirm(splits, 'iguales')
    } finally {
      setConfirming(false)
    }
  }

  const canConfirm = tab === 'persona' ? canConfirmPersona : canConfirmIguales
  const handleConfirm = tab === 'persona' ? handleConfirmPersona : handleConfirmIguales

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1050,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      {/* Modal card */}
      <div
        style={{
          background: 'var(--color-bg2)',
          border: '1px solid var(--color-border)',
          borderRadius: 16,
          width: '100%',
          maxWidth: 600,
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 0' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 700,
                color: 'var(--color-text)',
              }}
            >
              Dividir Cuenta
            </h2>
            <button
              onClick={onCancel}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-muted)',
                fontSize: 22,
                cursor: 'pointer',
                lineHeight: 1,
                padding: '0 4px',
              }}
            >
              ×
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--color-border)' }}>
            {(
              [
                { key: 'persona', label: 'Por persona' },
                { key: 'iguales', label: 'Partes iguales' },
              ] as const
            ).map((t) => {
              const isActive = tab === t.key
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  style={{
                    padding: '8px 16px',
                    border: 'none',
                    borderBottom: isActive
                      ? '2px solid var(--color-lime)'
                      : '2px solid transparent',
                    background: isActive ? 'rgba(163,212,131,0.06)' : 'transparent',
                    color: isActive ? 'var(--color-lime)' : 'var(--color-muted)',
                    fontSize: 14,
                    fontWeight: isActive ? 600 : 400,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    borderRadius: '6px 6px 0 0',
                    marginBottom: -1,
                  }}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {tab === 'persona' ? (
            <TabPorPersona
              items={items}
              persons={persons}
              assignments={assignments}
              newPersonName={newPersonName}
              metodoMap={metodoMap}
              activeItemId={activeItemId}
              nameInputRef={nameInputRef}
              onNewPersonNameChange={setNewPersonName}
              onAddPerson={addPerson}
              onRemovePerson={removePerson}
              onAssignItem={assignItem}
              onUnassignItem={unassignItem}
              onSetActiveItem={setActiveItemId}
              onSetMetodo={setMetodo}
            />
          ) : (
            <TabIguales
              grandTotalWithTax={grandTotalWithTax}
              numPersons={numPersons}
              metodoIguales={metodoIguales}
              onSetNumPersons={setNumPersons}
              onSetMetodoIguales={(idx, m) => {
                setMetodoIguales((prev) => {
                  const next = new Map(prev)
                  next.set(idx, m)
                  return next
                })
              }}
            />
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--color-border)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
          }}
        >
          <button
            onClick={onCancel}
            style={{
              padding: '9px 18px',
              borderRadius: 8,
              border: '1px solid var(--color-border)',
              background: 'transparent',
              color: 'var(--color-muted)',
              fontSize: 14,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm || confirming}
            style={{
              padding: '9px 20px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--color-lime)',
              color: '#000',
              fontSize: 14,
              fontWeight: 700,
              cursor: canConfirm && !confirming ? 'pointer' : 'not-allowed',
              opacity: canConfirm && !confirming ? 1 : 0.4,
              fontFamily: 'inherit',
            }}
          >
            {confirming ? 'Procesando...' : 'Cobrar todo'}
          </button>
        </div>
      </div>
    </div>
  )
}
