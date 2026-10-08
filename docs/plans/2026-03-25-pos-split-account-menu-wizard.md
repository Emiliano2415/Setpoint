# POS — Dividir Cuenta + Wizard de Menú Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add per-person bill splitting with individual payment methods, and replace the flat add-product form with a guided 3-step wizard.

**Architecture:** Two new standalone components (`SplitAccountModal`, `AddProductWizard`) wired into existing `TicketPanel` and `MenuManagementModal`. All inline-styled with existing CSS variables. No DB schema changes — each person's split calls `createCuenta()` independently.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Supabase, inline CSS with CSS variables (`--color-bg2`, `--color-border`, `--color-lime`, `--color-text`, `--color-muted`, `--font-mono`).

---

## Context & Key Files

| File | Role |
|---|---|
| `apps/dashboard/src/components/modules/pos/TicketPanel.tsx` | Payment panel — gets new DIVIDIR CUENTA button + SplitAccountModal wired in |
| `apps/dashboard/src/components/modules/pos/MenuManagementModal.tsx` | Menu modal — add-form replaced by AddProductWizard |
| `apps/dashboard/src/components/modules/pos/SplitAccountModal.tsx` | **NEW** — per-person split modal |
| `apps/dashboard/src/components/modules/pos/AddProductWizard.tsx` | **NEW** — 3-step product creation wizard |
| `apps/dashboard/src/lib/supabase/queries/pos.ts` | `createCuenta()` already accepts `cajaId?` — no changes needed |
| `apps/dashboard/src/components/modules/pos/POSPage.tsx` | Exports `TicketItem = Product & { qty: number }` — import from here |

**Design variables used across files:**
```
--color-bg        lighter background
--color-bg2       darker background (modals, panels)
--color-border    standard borders
--color-border-subtle  dividers
--color-text      primary text
--color-muted     secondary text
--color-muted-dim tertiary text
--color-lime      accent #6cf20d (buttons, selections, highlights)
--font-mono       prices and numbers
```

**CLUB_ID constant:** `'a1000000-0000-0000-0000-000000000001'` (hardcoded in every module file)

---

## Task 1: Create `SplitAccountModal.tsx` — Tab "Por persona"

**Files:**
- Create: `apps/dashboard/src/components/modules/pos/SplitAccountModal.tsx`

### Step 1: Create the file with types, state, and skeleton structure

```typescript
'use client'

import { useState, useRef } from 'react'
import type { TicketItem } from './POSPage'
import type { MetodoPago } from '@/lib/supabase/queries/pos'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Person {
  id: string
  nombre: string
  color: string  // for visual dot assignment
}

// itemId → { personId, qty }[]  (allows splitting a qty-3 item 2+1)
type AssignmentMap = Map<string, { personId: string; qty: number }[]>

export interface PersonSplit {
  nombre: string
  items: { producto_id: string; nombre: string; precio_unitario: number; cantidad: number }[]
  metodo: MetodoPago
  subtotal: number
  iva: number
  total: number
}

interface SplitAccountModalProps {
  open: boolean
  items: TicketItem[]
  cajaId: string | null | undefined
  onConfirm: (splits: PersonSplit[]) => Promise<void>
  onCancel: () => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TAX_RATE = 0.16
const PERSON_COLORS = ['#6cf20d', '#60a5fa', '#f472b6', '#fb923c', '#a78bfa', '#34d399']

const METODOS: { key: MetodoPago; label: string; icon: string }[] = [
  { key: 'efectivo', label: 'Efectivo', icon: '💵' },
  { key: 'credito', label: 'Crédito', icon: '💳' },
  { key: 'debito', label: 'Débito', icon: '🏦' },
  { key: 'cortesia', label: 'Cortesía', icon: '🎁' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcPersonTotal(personId: string, items: TicketItem[], assignments: AssignmentMap) {
  let subtotal = 0
  for (const item of items) {
    const itemAssignments = assignments.get(item.id) ?? []
    const personQty = itemAssignments.find(a => a.personId === personId)?.qty ?? 0
    subtotal += item.price * personQty
  }
  const iva = subtotal * TAX_RATE
  return { subtotal, iva, total: subtotal + iva }
}

function totalUnassignedQty(items: TicketItem[], assignments: AssignmentMap): number {
  let unassigned = 0
  for (const item of items) {
    const assigned = (assignments.get(item.id) ?? []).reduce((s, a) => s + a.qty, 0)
    unassigned += item.qty - assigned
  }
  return unassigned
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n)
}
```

### Step 2: Add the "Por persona" tab UI — persons list + item assignment

Add the main component function after the helpers:

```typescript
// ─── Component ────────────────────────────────────────────────────────────────

export function SplitAccountModal({ open, items, cajaId, onConfirm, onCancel }: SplitAccountModalProps) {
  const [tab, setTab] = useState<'persona' | 'iguales'>('persona')

  // ── Tab 1: Por persona ──
  const [persons, setPersons] = useState<Person[]>([])
  const [assignments, setAssignments] = useState<AssignmentMap>(new Map())
  const [newPersonName, setNewPersonName] = useState('')
  const [metodoMap, setMetodoMap] = useState<Map<string, MetodoPago>>(new Map())
  const [activeItemId, setActiveItemId] = useState<string | null>(null) // item whose popover is open
  const [confirming, setConfirming] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // ── Tab 2: Partes iguales ──
  const [numPersons, setNumPersons] = useState(2)
  const [metodoIguales, setMetodoIguales] = useState<Map<number, MetodoPago>>(new Map())

  if (!open) return null

  // ── Derived values ──
  const grandTotal = items.reduce((s, i) => s + i.price * i.qty, 0)
  const grandIva = grandTotal * TAX_RATE
  const grandTotalWithTax = grandTotal + grandIva
  const unassignedQty = totalUnassignedQty(items, assignments)
  const allMethodsSelected = persons.length > 0 && persons.every(p => metodoMap.has(p.id))
  const canConfirmPersona = persons.length >= 1 && unassignedQty === 0 && allMethodsSelected

  // ── Person management ──
  function addPerson() {
    const name = newPersonName.trim()
    if (!name) return
    const newPerson: Person = {
      id: crypto.randomUUID(),
      nombre: name,
      color: PERSON_COLORS[persons.length % PERSON_COLORS.length],
    }
    setPersons(prev => [...prev, newPerson])
    setNewPersonName('')
    nameInputRef.current?.focus()
  }

  function removePerson(personId: string) {
    setPersons(prev => prev.filter(p => p.id !== personId))
    // Remove assignments for this person
    setAssignments(prev => {
      const next = new Map(prev)
      for (const [itemId, assigns] of next) {
        next.set(itemId, assigns.filter(a => a.personId !== personId))
      }
      return next
    })
    setMetodoMap(prev => {
      const next = new Map(prev)
      next.delete(personId)
      return next
    })
  }

  // Assign all qty of an item to a single person (simplest case)
  function assignItem(itemId: string, personId: string) {
    const item = items.find(i => i.id === itemId)
    if (!item) return
    setAssignments(prev => {
      const next = new Map(prev)
      next.set(itemId, [{ personId, qty: item.qty }])
      return next
    })
    setActiveItemId(null)
  }

  function unassignItem(itemId: string) {
    setAssignments(prev => {
      const next = new Map(prev)
      next.set(itemId, [])
      return next
    })
  }

  function setMetodo(personId: string, metodo: MetodoPago) {
    setMetodoMap(prev => new Map(prev).set(personId, metodo))
  }

  // ── Confirm "Por persona" ──
  async function handleConfirmPersona() {
    if (!canConfirmPersona) return
    setConfirming(true)
    const splits: PersonSplit[] = persons.map(person => {
      const personItems: PersonSplit['items'] = []
      for (const item of items) {
        const qty = (assignments.get(item.id) ?? []).find(a => a.personId === person.id)?.qty ?? 0
        if (qty > 0) {
          personItems.push({
            producto_id: item.id,
            nombre: item.name,
            precio_unitario: item.price,
            cantidad: qty,
          })
        }
      }
      const { subtotal, iva, total } = calcPersonTotal(person.id, items, assignments)
      return {
        nombre: person.nombre,
        items: personItems,
        metodo: metodoMap.get(person.id)!,
        subtotal,
        iva,
        total,
      }
    })
    await onConfirm(splits)
    setConfirming(false)
  }

  // ── Confirm "Partes iguales" ──
  async function handleConfirmIguales() {
    const allSelected = Array.from({ length: numPersons }, (_, i) => i).every(i => metodoIguales.has(i))
    if (!allSelected) return
    setConfirming(true)
    const baseAmount = Math.floor((grandTotalWithTax / numPersons) * 100) / 100
    const remainder = Math.round((grandTotalWithTax - baseAmount * numPersons) * 100) / 100
    const splits: PersonSplit[] = Array.from({ length: numPersons }, (_, i) => {
      const isLast = i === numPersons - 1
      const personTotal = isLast ? baseAmount + remainder : baseAmount
      const personSubtotal = personTotal / (1 + TAX_RATE)
      const personIva = personTotal - personSubtotal
      return {
        nombre: `Persona ${i + 1}`,
        items: items.map(item => ({
          producto_id: item.id,
          nombre: item.name,
          precio_unitario: item.price,
          cantidad: item.qty,
        })),
        metodo: metodoIguales.get(i)!,
        subtotal: personSubtotal,
        iva: personIva,
        total: personTotal,
      }
    })
    await onConfirm(splits)
    setConfirming(false)
  }
```

### Step 3: Add the JSX render — overlay, tabs, tab content, footer

```typescript
  // ── Styles ──
  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 1050,
    background: 'rgba(0,0,0,0.75)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '16px',
  }
  const modal: React.CSSProperties = {
    background: 'var(--color-bg2)',
    border: '1px solid var(--color-border)',
    borderRadius: '16px',
    width: '100%', maxWidth: '600px',
    maxHeight: '85vh',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
  }

  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div style={modal}>
        {/* Header */}
        <div style={{ padding: '20px 24px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--color-text)' }}>
              Dividir Cuenta
            </h2>
            <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', fontSize: '20px', padding: '4px' }}>×</button>
          </div>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '4px', paddingBottom: '1px' }}>
            {([['persona', 'Por persona'], ['iguales', 'Partes iguales']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                style={{
                  padding: '8px 16px', borderRadius: '8px 8px 0 0',
                  border: '1px solid',
                  borderColor: tab === key ? 'var(--color-lime)' : 'transparent',
                  background: tab === key ? 'rgba(108,242,13,0.08)' : 'transparent',
                  color: tab === key ? 'var(--color-lime)' : 'var(--color-muted)',
                  cursor: 'pointer', fontSize: '14px', fontWeight: tab === key ? 600 : 400,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {tab === 'persona' ? (
            <TabPorPersona
              items={items}
              persons={persons}
              assignments={assignments}
              metodoMap={metodoMap}
              newPersonName={newPersonName}
              activeItemId={activeItemId}
              nameInputRef={nameInputRef}
              onAddPerson={addPerson}
              onRemovePerson={removePerson}
              onNewPersonNameChange={setNewPersonName}
              onAssignItem={assignItem}
              onUnassignItem={unassignItem}
              onSetActiveItem={setActiveItemId}
              onSetMetodo={setMetodo}
            />
          ) : (
            <TabIguales
              grandTotal={grandTotalWithTax}
              numPersons={numPersons}
              metodoIguales={metodoIguales}
              onNumPersonsChange={setNumPersons}
              onSetMetodo={(i, m) => setMetodoIguales(prev => new Map(prev).set(i, m))}
            />
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--color-border-subtle)', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text)', cursor: 'pointer', fontSize: '14px' }}>
            Cancelar
          </button>
          <button
            onClick={tab === 'persona' ? handleConfirmPersona : handleConfirmIguales}
            disabled={confirming || (tab === 'persona' ? !canConfirmPersona : !Array.from({ length: numPersons }, (_, i) => i).every(i => metodoIguales.has(i)))}
            style={{
              padding: '10px 24px', borderRadius: '8px', border: 'none',
              background: 'var(--color-lime)', color: '#000',
              cursor: 'pointer', fontSize: '14px', fontWeight: 700,
              opacity: (confirming || (tab === 'persona' ? !canConfirmPersona : false)) ? 0.4 : 1,
            }}
          >
            {confirming ? 'Procesando…' : 'Cobrar todo'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

### Step 4: Add `TabPorPersona` sub-component (inside the same file, after the main export)

```typescript
interface TabPorPersonaProps {
  items: TicketItem[]
  persons: Person[]
  assignments: AssignmentMap
  metodoMap: Map<string, MetodoPago>
  newPersonName: string
  activeItemId: string | null
  nameInputRef: React.RefObject<HTMLInputElement>
  onAddPerson: () => void
  onRemovePerson: (id: string) => void
  onNewPersonNameChange: (v: string) => void
  onAssignItem: (itemId: string, personId: string) => void
  onUnassignItem: (itemId: string) => void
  onSetActiveItem: (id: string | null) => void
  onSetMetodo: (personId: string, metodo: MetodoPago) => void
}

function TabPorPersona({ items, persons, assignments, metodoMap, newPersonName, activeItemId, nameInputRef, onAddPerson, onRemovePerson, onNewPersonNameChange, onAssignItem, onUnassignItem, onSetActiveItem, onSetMetodo }: TabPorPersonaProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Add person input */}
      <div>
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Personas</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            ref={nameInputRef}
            value={newPersonName}
            onChange={e => onNewPersonNameChange(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onAddPerson()}
            placeholder="Nombre de la persona"
            style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: '14px', outline: 'none' }}
          />
          <button onClick={onAddPerson} disabled={!newPersonName.trim()} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'var(--color-lime)', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: '14px', opacity: newPersonName.trim() ? 1 : 0.4 }}>
            + Agregar
          </button>
        </div>
        {/* Person list */}
        {persons.length > 0 && (
          <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {persons.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '999px', border: `1px solid ${p.color}`, background: `${p.color}15` }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                <span style={{ color: 'var(--color-text)', fontSize: '13px' }}>{p.nombre}</span>
                <button onClick={() => onRemovePerson(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', padding: '0', lineHeight: 1, marginLeft: '2px' }}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Items assignment */}
      {persons.length > 0 && (
        <div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Ítems — toca para asignar</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {items.map(item => {
              const itemAssignments = assignments.get(item.id) ?? []
              const assignedQty = itemAssignments.reduce((s, a) => s + a.qty, 0)
              const unassigned = item.qty - assignedQty
              const assignedPerson = itemAssignments.length === 1 ? persons.find(p => p.id === itemAssignments[0].personId) : null
              const isOpen = activeItemId === item.id
              return (
                <div key={item.id} style={{ position: 'relative' }}>
                  <div
                    onClick={() => onSetActiveItem(isOpen ? null : item.id)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 14px', borderRadius: '8px', cursor: 'pointer',
                      border: '1px solid',
                      borderColor: unassigned > 0 ? 'rgba(234,179,8,0.4)' : (assignedPerson ? assignedPerson.color + '60' : 'var(--color-border)'),
                      background: unassigned > 0 ? 'rgba(234,179,8,0.06)' : (assignedPerson ? assignedPerson.color + '10' : 'rgba(255,255,255,0.02)'),
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {assignedPerson && <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: assignedPerson.color, flexShrink: 0 }} />}
                      {unassigned > 0 && !assignedPerson && <span style={{ fontSize: '14px' }}>⚠</span>}
                      <span style={{ color: 'var(--color-text)', fontSize: '14px' }}>{item.qty}× {item.name}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {assignedPerson && <span style={{ fontSize: '12px', color: assignedPerson.color }}>{assignedPerson.nombre}</span>}
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--color-muted)' }}>{fmtMoney(item.price * item.qty)}</span>
                      <span style={{ color: 'var(--color-muted)', fontSize: '16px' }}>{isOpen ? '▲' : '▼'}</span>
                    </div>
                  </div>
                  {/* Person picker popover */}
                  {isOpen && (
                    <div style={{ marginTop: '4px', padding: '8px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'var(--color-bg2)', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {persons.map(p => (
                        <button key={p.id} onClick={() => onAssignItem(item.id, p.id)} style={{ padding: '6px 12px', borderRadius: '999px', border: `1px solid ${p.color}`, background: `${p.color}20`, color: 'var(--color-text)', cursor: 'pointer', fontSize: '13px' }}>
                          {p.nombre}
                        </button>
                      ))}
                      {assignedQty > 0 && (
                        <button onClick={() => { onUnassignItem(item.id); onSetActiveItem(null) }} style={{ padding: '6px 12px', borderRadius: '999px', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-muted)', cursor: 'pointer', fontSize: '13px' }}>
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

      {/* Cobro por persona */}
      {persons.length > 0 && (
        <div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Cobro</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {persons.map(p => {
              const { total } = calcPersonTotal(p.id, items, assignments)
              const selectedMetodo = metodoMap.get(p.id)
              return (
                <div key={p.id} style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--color-border-subtle)', background: 'rgba(255,255,255,0.02)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: p.color }} />
                      <span style={{ color: 'var(--color-text)', fontWeight: 600, fontSize: '14px' }}>{p.nombre}</span>
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 700, color: 'var(--color-lime)' }}>{fmtMoney(total)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {METODOS.map(m => (
                      <button key={m.key} onClick={() => onSetMetodo(p.id, m.key)} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid', borderColor: selectedMetodo === m.key ? 'var(--color-lime)' : 'var(--color-border)', background: selectedMetodo === m.key ? 'rgba(108,242,13,0.12)' : 'transparent', color: selectedMetodo === m.key ? 'var(--color-lime)' : 'var(--color-muted)', cursor: 'pointer', fontSize: '12px' }}>
                        {m.icon} {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
```

### Step 5: Add `TabIguales` sub-component

```typescript
interface TabIgualesProps {
  grandTotal: number
  numPersons: number
  metodoIguales: Map<number, MetodoPago>
  onNumPersonsChange: (n: number) => void
  onSetMetodo: (index: number, metodo: MetodoPago) => void
}

function TabIguales({ grandTotal, numPersons, metodoIguales, onNumPersonsChange, onSetMetodo }: TabIgualesProps) {
  const baseAmount = Math.floor((grandTotal / numPersons) * 100) / 100
  const remainder = Math.round((grandTotal - baseAmount * numPersons) * 100) / 100
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Total display */}
      <div style={{ textAlign: 'center', padding: '16px', borderRadius: '12px', border: '1px solid var(--color-border-subtle)', background: 'rgba(255,255,255,0.02)' }}>
        <div style={{ fontSize: '13px', color: 'var(--color-muted)', marginBottom: '4px' }}>Total a dividir</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '28px', fontWeight: 700, color: 'var(--color-lime)' }}>{fmtMoney(grandTotal)}</div>
      </div>

      {/* Person count stepper */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
        <span style={{ fontSize: '14px', color: 'var(--color-muted)' }}>¿Cuántas personas?</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={() => onNumPersonsChange(Math.max(2, numPersons - 1))} style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text)', cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '20px', fontWeight: 700, color: 'var(--color-text)', minWidth: '24px', textAlign: 'center' }}>{numPersons}</span>
          <button onClick={() => onNumPersonsChange(Math.min(10, numPersons + 1))} style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text)', cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
        </div>
      </div>

      {/* Per-person rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {Array.from({ length: numPersons }, (_, i) => {
          const isLast = i === numPersons - 1
          const personAmount = isLast ? baseAmount + remainder : baseAmount
          const selected = metodoIguales.get(i)
          return (
            <div key={i} style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--color-border-subtle)', background: 'rgba(255,255,255,0.02)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ color: 'var(--color-text)', fontWeight: 600, fontSize: '14px' }}>Persona {i + 1}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 700, color: 'var(--color-lime)' }}>{fmtMoney(personAmount)}</span>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {METODOS.map(m => (
                  <button key={m.key} onClick={() => onSetMetodo(i, m.key)} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid', borderColor: selected === m.key ? 'var(--color-lime)' : 'var(--color-border)', background: selected === m.key ? 'rgba(108,242,13,0.12)' : 'transparent', color: selected === m.key ? 'var(--color-lime)' : 'var(--color-muted)', cursor: 'pointer', fontSize: '12px' }}>
                    {m.icon} {m.label}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      {remainder !== 0 && (
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-muted-dim)', textAlign: 'center' }}>
          * El monto no es divisible exactamente. La diferencia ({fmtMoney(Math.abs(remainder))}) se ajusta en la última persona.
        </p>
      )}
    </div>
  )
}
```

### Step 6: Verify the file compiles logically

Check that:
- All imports are at the top
- All interfaces are before the component
- `TabPorPersona` and `TabIguales` are defined AFTER `SplitAccountModal` (or extract to separate files if needed)
- `fmtMoney`, `calcPersonTotal`, `totalUnassignedQty`, `PERSON_COLORS`, `METODOS` are defined before they're used

---

## Task 2: Wire `SplitAccountModal` into `TicketPanel.tsx`

**Files:**
- Modify: `apps/dashboard/src/components/modules/pos/TicketPanel.tsx`

### Step 1: Add import for SplitAccountModal

At the top of the file, after existing imports:
```typescript
import { SplitAccountModal, type PersonSplit } from './SplitAccountModal'
```

### Step 2: Add state for the modal

After the existing `splitOpen` state:
```typescript
const [splitAccountOpen, setSplitAccountOpen] = useState(false)
```

### Step 3: Add `handleConfirmSplitAccount` function

After `handleConfirmSplit`:
```typescript
async function handleConfirmSplitAccount(splits: PersonSplit[]) {
  const supabase = createClient()
  let allOk = true
  for (const split of splits) {
    const { error } = await createCuenta(
      supabase,
      CLUB_ID,
      split.items,
      split.metodo,
      undefined,
      0,
      cajaId ?? undefined,
    )
    if (error) {
      toast.error(`Error al cobrar a ${split.nombre}`)
      allOk = false
      break
    }
  }
  if (allOk) {
    setSplitAccountOpen(false)
    toast.success(`Cuenta dividida entre ${splits.length} personas`)
    resetTicket()
  }
}
```

### Step 4: Change payment buttons from 3-column row to 2×2 grid

Find the section that renders the three `PayButton` components. It currently looks like:
```tsx
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', ... }}>
  <PayButton ... />  {/* EFECTIVO */}
  <PayButton ... />  {/* TARJETA */}
  <PayButton ... />  {/* DIVIDIR */}
</div>
```

Replace with:
```tsx
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '10px' }}>
  {/* Row 1 */}
  <PayButton
    label="EFECTIVO"
    icon={/* existing icon */}
    onClick={() => openPayModal('efectivo')}
    disabled={items.length === 0}
  />
  <PayButton
    label="TARJETA"
    icon={/* existing icon */}
    onClick={() => openPayModal('credito')}
    disabled={items.length === 0}
  />
  {/* Row 2 */}
  <PayButton
    label="DIVIDIR PAGO"
    icon={/* existing split icon */}
    onClick={openSplitModal}
    disabled={items.length === 0}
  />
  <PayButton
    label="DIVIDIR CUENTA"
    icon={/* same split icon or different */}
    onClick={() => setSplitAccountOpen(true)}
    disabled={items.length === 0}
  />
</div>
```

**Important:** Read the actual PayButton component definition in the file (lines ~653-700) to understand its exact props before writing this. Use the same props pattern.

### Step 5: Render `SplitAccountModal` in JSX

Add just before the closing tag of the component return (alongside other modals):
```tsx
{splitAccountOpen && (
  <SplitAccountModal
    open={splitAccountOpen}
    items={items}
    cajaId={cajaId}
    onConfirm={handleConfirmSplitAccount}
    onCancel={() => setSplitAccountOpen(false)}
  />
)}
```

### Step 6: Verify TypeScript types are consistent

- `items` prop to `SplitAccountModal` is `TicketItem[]` — confirm it matches
- `PersonSplit.items` uses `{ producto_id, nombre, precio_unitario, cantidad }` — matches `CuentaItem` type in `pos.ts`
- `cajaId` is `string | null | undefined` in TicketPanel — `SplitAccountModal` accepts same

---

## Task 3: Create `AddProductWizard.tsx`

**Files:**
- Create: `apps/dashboard/src/components/modules/pos/AddProductWizard.tsx`

### Step 1: Create file with types and constants

```typescript
'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createProducto, type Categoria, type Produto as Producto } from '@/lib/supabase/queries/pos'

// Note: 'Producto' is exported as 'Produto' in pos.ts (typo in original) — import accordingly

// imgClass map — must match POSPage.tsx exactly
const IMG_CLASS_BY_CATEGORY: Record<string, string> = {
  Bebidas: 'img-drink',
  Café: 'img-coffee',
  Snacks: 'img-food',
  Comida: 'img-food',
  Palas: 'img-paddle',
  Pelotas: 'img-balls',
  Accesorios: 'img-grip',
  Ropa: 'img-grip',
  Alimentos: 'img-food',
  Cafetería: 'img-coffee',
  'Renta de Equipo': 'img-rental',
}

// Gradient map — colors to use as card backgrounds per category class
const CATEGORY_GRADIENT: Record<string, string> = {
  'img-drink': 'linear-gradient(135deg, #1a3a5c, #2563eb)',
  'img-coffee': 'linear-gradient(135deg, #3b1e08, #92400e)',
  'img-food': 'linear-gradient(135deg, #1a3a1a, #16a34a)',
  'img-paddle': 'linear-gradient(135deg, #1a1a3b, #7c3aed)',
  'img-balls': 'linear-gradient(135deg, #3b2a1a, #d97706)',
  'img-grip': 'linear-gradient(135deg, #1a1a1a, #4b5563)',
  'img-rental': 'linear-gradient(135deg, #1a2a3b, #0369a1)',
}

// Example placeholder names per category
const PLACEHOLDER_BY_CLASS: Record<string, string> = {
  'img-drink': 'Ej: Agua Mineral 600ml',
  'img-coffee': 'Ej: Cappuccino',
  'img-food': 'Ej: Bowl Proteico',
  'img-paddle': 'Ej: Pala Head Flash',
  'img-balls': 'Ej: Pelotas Head 3-pack',
  'img-grip': 'Ej: Overgrip x3',
  'img-rental': 'Ej: Raqueta de alquiler',
}

const CLUB_ID = 'a1000000-0000-0000-0000-000000000001'

export interface AddProductWizardProps {
  open: boolean
  categories: Categoria[]
  onSuccess: (newProduct: Producto) => void
  onCancel: () => void
}
```

### Step 2: Add main component with state and step logic

```typescript
export function AddProductWizard({ open, categories, onSuccess, onCancel }: AddProductWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [direction, setDirection] = useState<'forward' | 'back'>('forward')
  const [selectedCategory, setSelectedCategory] = useState<Categoria | null>(null)
  const [nombre, setNombre] = useState('')
  const [precio, setPrecio] = useState('')
  const [saving, setSaving] = useState(false)
  const nombreInputRef = useRef<HTMLInputElement>(null)

  // Reset state when wizard opens
  useEffect(() => {
    if (open) {
      setStep(1)
      setSelectedCategory(null)
      setNombre('')
      setPrecio('')
      setSaving(false)
    }
  }, [open])

  // Autofocus name input on step 2
  useEffect(() => {
    if (step === 2) {
      setTimeout(() => nombreInputRef.current?.focus(), 50)
    }
  }, [step])

  if (!open) return null

  const imgClass = selectedCategory ? (IMG_CLASS_BY_CATEGORY[selectedCategory.nombre] ?? 'img-coffee') : 'img-coffee'
  const gradient = CATEGORY_GRADIENT[imgClass] ?? CATEGORY_GRADIENT['img-coffee']
  const placeholder = PLACEHOLDER_BY_CLASS[imgClass] ?? 'Nombre del producto'
  const precioNum = parseFloat(precio)
  const step2Valid = nombre.trim().length >= 2 && !isNaN(precioNum) && precioNum > 0

  function goForward(nextStep: 2 | 3) {
    setDirection('forward')
    setStep(nextStep)
  }

  function goBack(prevStep: 1 | 2) {
    setDirection('back')
    setStep(prevStep)
  }

  async function handleSave() {
    if (!selectedCategory || !step2Valid) return
    setSaving(true)
    try {
      const supabase = createClient()
      await createProducto(supabase, CLUB_ID, {
        nombre: nombre.trim(),
        precio: precioNum,
        categoria_id: selectedCategory.id,
      })
      // Fetch the newly created product to pass back
      const newProduct: Producto = {
        id: crypto.randomUUID(), // placeholder — parent should reload
        nombre: nombre.trim(),
        precio: precioNum,
        categoria_id: selectedCategory.id,
        activo: true,
      }
      onSuccess(newProduct)
    } catch (err) {
      console.error('[AddProductWizard] save failed:', err)
    } finally {
      setSaving(false)
    }
  }
```

**Note:** `createProducto` in `pos.ts` does not return the created row. The parent `MenuManagementModal` should call `load()` after `onSuccess` to refresh the list. Pass a placeholder product object — the parent ignores it and reloads anyway.

### Step 3: Add JSX render with step indicator and animated content

```typescript
  // Shared styles
  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 1200,
    background: 'rgba(0,0,0,0.8)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '16px',
  }
  const modal: React.CSSProperties = {
    background: 'var(--color-bg2)',
    border: '1px solid var(--color-border)',
    borderRadius: '16px',
    width: '100%', maxWidth: '440px',
    overflow: 'hidden',
  }

  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div style={modal}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 700, color: 'var(--color-text)' }}>Nuevo producto</h3>
            {/* Step dots */}
            <div style={{ display: 'flex', gap: '6px' }}>
              {[1, 2, 3].map(s => (
                <span key={s} style={{ width: '8px', height: '8px', borderRadius: '50%', background: s <= step ? 'var(--color-lime)' : 'transparent', border: `2px solid ${s <= step ? 'var(--color-lime)' : 'var(--color-border)'}`, transition: 'all 0.2s' }} />
              ))}
            </div>
          </div>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', fontSize: '20px', padding: '4px' }}>×</button>
        </div>

        {/* Body — step content */}
        <div style={{ padding: '24px', minHeight: '280px' }}>
          {step === 1 && <Step1Categoria categories={categories} selected={selectedCategory} onSelect={setSelectedCategory} />}
          {step === 2 && (
            <Step2NombrePrecio
              nombreRef={nombreInputRef}
              nombre={nombre}
              precio={precio}
              placeholder={placeholder}
              categoryNombre={selectedCategory?.nombre ?? ''}
              onNombreChange={setNombre}
              onPrecioChange={setPrecio}
              onChangeCategory={() => goBack(1)}
            />
          )}
          {step === 3 && (
            <Step3Confirm
              nombre={nombre}
              precio={precioNum}
              categoryNombre={selectedCategory?.nombre ?? ''}
              gradient={gradient}
            />
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--color-border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={() => step > 1 ? goBack((step - 1) as 1 | 2) : onCancel()}
            style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text)', cursor: 'pointer', fontSize: '14px' }}
          >
            {step === 1 ? 'Cancelar' : '← Atrás'}
          </button>
          {step < 3 ? (
            <button
              onClick={() => goForward((step + 1) as 2 | 3)}
              disabled={step === 1 ? !selectedCategory : !step2Valid}
              style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: 'var(--color-lime)', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: '14px', opacity: (step === 1 ? !selectedCategory : !step2Valid) ? 0.4 : 1 }}
            >
              Continuar →
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: 'var(--color-lime)', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: '14px', opacity: saving ? 0.6 : 1 }}
            >
              {saving ? 'Guardando…' : '✓ Agregar al menú'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
```

### Step 4: Add the 3 step sub-components

```typescript
// Step 1: Category grid
function Step1Categoria({ categories, selected, onSelect }: {
  categories: Categoria[]
  selected: Categoria | null
  onSelect: (c: Categoria) => void
}) {
  return (
    <div>
      <p style={{ margin: '0 0 16px', fontSize: '14px', color: 'var(--color-muted)' }}>Selecciona una categoría</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
        {categories.map(cat => {
          const imgClass = IMG_CLASS_BY_CATEGORY[cat.nombre] ?? 'img-coffee'
          const gradient = CATEGORY_GRADIENT[imgClass] ?? CATEGORY_GRADIENT['img-coffee']
          const isSelected = selected?.id === cat.id
          return (
            <button
              key={cat.id}
              onClick={() => onSelect(cat)}
              style={{
                padding: '14px 8px', borderRadius: '12px', cursor: 'pointer',
                border: `2px solid ${isSelected ? 'var(--color-lime)' : 'transparent'}`,
                background: isSelected ? `${gradient}, rgba(108,242,13,0.08)` : gradient,
                backgroundBlendMode: isSelected ? 'overlay' : 'normal',
                color: '#fff', textAlign: 'center',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                outline: 'none', transition: 'border-color 0.15s',
                boxShadow: isSelected ? '0 0 0 2px var(--color-lime)' : 'none',
              }}
            >
              {isSelected && <span style={{ fontSize: '16px' }}>✓</span>}
              <span style={{ fontSize: '13px', fontWeight: 600, lineHeight: 1.2 }}>{cat.nombre}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Step 2: Name + Price
function Step2NombrePrecio({ nombreRef, nombre, precio, placeholder, categoryNombre, onNombreChange, onPrecioChange, onChangeCategory }: {
  nombreRef: React.RefObject<HTMLInputElement>
  nombre: string
  precio: string
  placeholder: string
  categoryNombre: string
  onNombreChange: (v: string) => void
  onPrecioChange: (v: string) => void
  onChangeCategory: () => void
}) {
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px', borderRadius: '10px',
    border: '1px solid var(--color-border)', background: 'var(--color-bg)',
    color: 'var(--color-text)', fontSize: '15px', outline: 'none',
    boxSizing: 'border-box',
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ fontSize: '12px', color: 'var(--color-muted)' }}>Categoría:</span>
        <span style={{ fontSize: '12px', color: 'var(--color-lime)', fontWeight: 600 }}>{categoryNombre}</span>
        <button onClick={onChangeCategory} style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline', padding: 0 }}>← Cambiar</button>
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-muted)', marginBottom: '8px' }}>Nombre del producto</label>
        <input ref={nombreRef} value={nombre} onChange={e => onNombreChange(e.target.value)} placeholder={placeholder} style={inputStyle} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-muted)', marginBottom: '8px' }}>Precio (MXN)</label>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)', fontFamily: 'var(--font-mono)', fontSize: '15px' }}>$</span>
          <input type="number" min="0" step="0.50" value={precio} onChange={e => onPrecioChange(e.target.value)} placeholder="0.00" style={{ ...inputStyle, paddingLeft: '28px', fontFamily: 'var(--font-mono)' }} />
        </div>
      </div>
    </div>
  )
}

// Step 3: Preview + Confirm
function Step3Confirm({ nombre, precio, categoryNombre, gradient }: {
  nombre: string
  precio: number
  categoryNombre: string
  gradient: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
      <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-muted)' }}>Vista previa</p>
      <div style={{ width: '100%', maxWidth: '280px', borderRadius: '12px', overflow: 'hidden', background: gradient }}>
        <div style={{ padding: '20px 16px 16px' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>{nombre}</div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginBottom: '12px' }}>{categoryNombre}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '20px', fontWeight: 700, color: 'var(--color-lime)' }}>
            {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(precio)}
          </div>
        </div>
      </div>
      <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-muted-dim)' }}>¿Todo correcto?</p>
    </div>
  )
}
```

---

## Task 4: Wire `AddProductWizard` into `MenuManagementModal.tsx`

**Files:**
- Modify: `apps/dashboard/src/components/modules/pos/MenuManagementModal.tsx`

### Step 1: Add import

```typescript
import { AddProductWizard } from './AddProductWizard'
```

### Step 2: Replace `showAddForm` state with `showWizard`

Find: `const [showAddForm, setShowAddForm] = useState(false)`
Replace with: `const [showWizard, setShowWizard] = useState(false)`

Also remove these states that were only used by the old add form:
- `newName`
- `newPrice`
- `newCatId`
- `saving`

And remove the `handleAddProduct` function entirely.

### Step 3: Remove the old collapsible add form from JSX

Find and remove the block that renders the add form (the `{showAddForm && (...)}` block with the grid of inputs). This is in the JSX after the header button.

### Step 4: Change the "+ Agregar" button to open the wizard

Find the button that sets `setShowAddForm(true)` and change it to `setShowWizard(true)`.

### Step 5: Add the wizard render at the bottom of the JSX return

Just before the closing `</div>` of the component return:
```tsx
<AddProductWizard
  open={showWizard}
  categories={categories}
  onSuccess={() => {
    setShowWizard(false)
    load()  // reload product list
  }}
  onCancel={() => setShowWizard(false)}
/>
```

### Step 6: Verify `load` function is accessible

`load` is defined inside the component. The `onSuccess` callback closes the wizard and calls `load()` to refresh the list. This already exists in the component.

---

## Task 5: TypeScript verification

**Files:**
- Run typecheck in `apps/dashboard`

### Step 1: Run TypeScript check

```bash
cd apps/dashboard && npx tsc --noEmit
```

Expected: zero errors

### Step 2: Fix any type errors found

Common issues to watch for:
- `Produto` vs `Producto` — `pos.ts` has a typo: the interface is named `Produto` (line 14). Import it as `Produto` or use `Produto as Producto`
- `TicketItem` imported from `./POSPage` — ensure the relative path is correct from `SplitAccountModal.tsx`
- `MetodoPago` imported from `@/lib/supabase/queries/pos` which re-exports from `./caja`
- `PersonSplit.items` must match `CuentaItem` shape expected by `createCuenta`

---

## Verification Checklist

1. **SplitAccountModal — Por persona tab:**
   - [ ] Can add multiple persons by name
   - [ ] Items show amber highlight when unassigned
   - [ ] Tapping item opens person picker
   - [ ] After assignment, item shows colored dot with person name
   - [ ] Cobro section shows per-person total + method selector
   - [ ] "Cobrar todo" disabled until all items assigned AND all methods selected
   - [ ] On confirm: N separate `cuentas` created, ticket resets

2. **SplitAccountModal — Partes iguales tab:**
   - [ ] Stepper changes number of persons (min 2, max 10)
   - [ ] Per-person amount updates in real time
   - [ ] Remainder note shown when total not divisible
   - [ ] "Cobrar todo" disabled until all methods selected
   - [ ] On confirm: N tickets created with equal amounts

3. **TicketPanel buttons:**
   - [ ] Buttons in 2×2 grid
   - [ ] "DIVIDIR PAGO" opens existing split payment (efectivo+tarjeta) — unchanged
   - [ ] "DIVIDIR CUENTA" opens new SplitAccountModal
   - [ ] Both disabled when ticket is empty

4. **AddProductWizard:**
   - [ ] Step 1: Categories shown as colored cards, click selects (green highlight)
   - [ ] Step 1: "Continuar" disabled until category selected
   - [ ] Step 2: Name input autofocuses, "← Cambiar" goes back
   - [ ] Step 2: "Continuar" disabled until name ≥ 2 chars AND price > 0
   - [ ] Step 3: Preview shows product card with correct gradient and name/price
   - [ ] Step 3: "Agregar al menú" saves and closes wizard
   - [ ] Back navigation preserves entered data

5. **Regression:**
   - [ ] Single payment (efectivo, tarjeta) unchanged
   - [ ] Existing DIVIDIR PAGO (split by payment method) unchanged
   - [ ] Menu toggle active/inactive still works
   - [ ] Inline price editing still works
   - [ ] TypeScript check passes with zero errors
