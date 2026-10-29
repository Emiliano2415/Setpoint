'use client'

import { useState, useRef, type ReactNode } from 'react'
import { Minus, Plus, TriangleAlert, X } from 'lucide-react'
import { Button, IconButton, Input, Modal, Money, SegmentedControl, Tabs } from '@/components/ds'
import type { TicketItem } from './POSPage'
import type { MetodoPago } from '@/lib/supabase/queries/pos'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Person {
  id: string
  nombre: string
  /** Clase fija de punto de color (bg-…), tomada de PERSON_COLORS */
  color: string
}

// itemId → [{ personId, qty }] — allows splitting a qty-3 item 2+1 across persons
type AssignmentMap = Map<string, { personId: string; qty: number }[]>

export interface PersonSplit {
  nombre: string
  items: { producto_id: string; nombre: string; precio_unitario: number; cantidad: number }[]
  metodo: MetodoPago
  /** Suma de precio × cantidad, antes del descuento */
  subtotal: number
  /** Parte del descuento del ticket que corresponde a esta persona */
  descuento: number
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
  /** Descuento total del ticket (en pesos, antes de IVA). 0 si no hay. */
  descuento?: number
  onConfirm: (splits: PersonSplit[], modo: SplitMode) => Promise<void>
  onCancel: () => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TAX_RATE = 0.16
// Puntos de color de las personas, en el mismo orden que antes: lima, azul, rosa, naranja, morado, verde
const PERSON_COLORS = ['bg-primary', 'bg-info', 'bg-error', 'bg-warning', 'bg-secondary', 'bg-success']
const METODOS: { value: MetodoPago; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'credito', label: 'Crédito' },
  { value: 'debito', label: 'Débito' },
  { value: 'cortesia', label: 'Cortesía' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

interface PersonTotals {
  subtotal: number
  descuento: number
  iva: number
  total: number
}

function calcPersonSubtotal(
  personId: string,
  items: TicketItem[],
  assignments: AssignmentMap
): number {
  let subtotal = 0
  for (const item of items) {
    const assigned = assignments.get(item.id) ?? []
    for (const a of assigned) {
      if (a.personId === personId) {
        subtotal += item.price * a.qty
      }
    }
  }
  return subtotal
}

/**
 * Totales por persona con el descuento del ticket repartido en proporción al
 * subtotal de cada una (redondeado a centavos). Con todo asignado, la diferencia
 * de redondeo va a la última persona con productos para que la suma cuadre.
 * Misma fórmula que createCuenta: base = subtotal − descuento; iva = base × 16 %.
 */
function calcPersonTotals(
  persons: Person[],
  items: TicketItem[],
  assignments: AssignmentMap,
  descuento: number
): Map<string, PersonTotals> {
  const grandSubtotal = items.reduce((s, it) => s + it.price * it.qty, 0)
  const subtotales = persons.map((p) => calcPersonSubtotal(p.id, items, assignments))
  const descuentos = subtotales.map((s) =>
    descuento > 0 && grandSubtotal > 0 ? round2((descuento * s) / grandSubtotal) : 0
  )
  if (descuento > 0 && totalUnassignedQty(items, assignments) === 0) {
    let last = -1
    subtotales.forEach((s, i) => { if (s > 0) last = i })
    if (last >= 0) {
      const otros = descuentos.reduce((sum, d, i) => (i === last ? sum : sum + d), 0)
      descuentos[last] = round2(descuento - otros)
    }
  }
  const result = new Map<string, PersonTotals>()
  persons.forEach((p, i) => {
    const subtotal = subtotales[i]
    const base = subtotal - descuentos[i]
    const iva = base * TAX_RATE
    result.set(p.id, {
      subtotal,
      descuento: descuentos[i],
      iva: round2(iva),
      total: round2(base + iva),
    })
  })
  return result
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

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
      {children}
    </span>
  )
}

// ─── Method Selector ──────────────────────────────────────────────────────────

interface MethodSelectorProps {
  selected: MetodoPago | undefined
  onSelect: (m: MetodoPago) => void
}

function MethodSelector({ selected, onSelect }: MethodSelectorProps) {
  return (
    <div className="flex [&>*]:flex-1 [&_button]:flex-1 [&_button]:px-2">
      <SegmentedControl
        label="Método de cobro"
        value={selected ?? ''}
        onChange={(m) => {
          if (m) onSelect(m)
        }}
        options={METODOS}
      />
    </div>
  )
}

// ─── TabPorPersona ────────────────────────────────────────────────────────────

interface TabPorPersonaProps {
  items: TicketItem[]
  persons: Person[]
  assignments: AssignmentMap
  personTotals: Map<string, PersonTotals>
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
  personTotals,
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
    <div className="flex flex-col gap-6 md:grid md:grid-cols-[minmax(0,1fr)_340px] md:gap-6">
      {/* Columna izquierda: personas e ítems */}
      <div className="flex min-w-0 flex-col gap-6">
        {/* Personas */}
        <div className="flex flex-col gap-2.5">
          <SectionLabel>Personas</SectionLabel>
          <div className="flex gap-2">
            <Input
              ref={nameInputRef}
              size="md"
              value={newPersonName}
              onChange={(e) => onNewPersonNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onAddPerson()
              }}
              placeholder="Nombre de persona..."
            />
            <Button variant="secondary" onClick={onAddPerson} disabled={!newPersonName.trim()} className="shrink-0 whitespace-nowrap">
              + Agregar
            </Button>
          </div>

          {persons.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {persons.map((p) => (
                <span
                  key={p.id}
                  className="inline-flex items-center gap-2 rounded-full border border-outline-variant bg-surface-container-high px-2.5 py-1 text-xs text-on-surface"
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${p.color}`} />
                  <span className="font-medium">{p.nombre}</span>
                  <button
                    type="button"
                    onClick={() => onRemovePerson(p.id)}
                    aria-label={`Remover ${p.nombre}`}
                    className="flex items-center text-on-surface-variant transition-colors hover:text-error"
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Ítems (solo si hay personas) */}
        {persons.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <SectionLabel>Ítems — toca para asignar</SectionLabel>
            <div className="flex flex-col gap-2">
              {items.map((item) => {
                const assigned = assignments.get(item.id) ?? []
                const assignedQty = assigned.reduce((s, a) => s + a.qty, 0)
                const isFullyAssigned = assignedQty >= item.qty
                const assignedPersonId = assigned[0]?.personId
                const assignedPerson = persons.find((p) => p.id === assignedPersonId)
                const isOpen = activeItemId === item.id

                return (
                  <div
                    key={item.id}
                    className={
                      isFullyAssigned
                        ? 'rounded-lg border border-outline-variant bg-surface-container-low'
                        : 'rounded-lg border border-warning/40 bg-warning/10'
                    }
                  >
                    <button
                      type="button"
                      onClick={() => onSetActiveItem(isOpen ? null : item.id)}
                      className="flex w-full items-center justify-between gap-3 rounded-lg p-3 text-left transition-colors hover:bg-surface-container-high/60"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        {!isFullyAssigned && (
                          <TriangleAlert size={16} className="shrink-0 text-warning" />
                        )}
                        {isFullyAssigned && assignedPerson && (
                          <span className={`h-2 w-2 shrink-0 rounded-full ${assignedPerson.color}`} />
                        )}
                        <span className="flex min-w-0 flex-col">
                          <span className="text-xs font-medium leading-tight text-on-surface">
                            {item.qty}× {item.name}
                          </span>
                          {isFullyAssigned && assignedPerson && (
                            <span className="text-[11px] text-on-surface-variant">
                              → {assignedPerson.nombre}
                            </span>
                          )}
                        </span>
                      </span>
                      <Money
                        value={item.price * item.qty}
                        className="shrink-0 text-xs font-medium text-on-surface"
                      />
                    </button>

                    {/* Selector de asignación, desplegado al tocar el ítem */}
                    {isOpen && (
                      <div className="flex flex-wrap items-center gap-2 border-t border-outline-variant/60 px-3 pb-3 pt-2.5">
                        <span className="shrink-0 text-[11px] text-on-surface-variant">Asignar a:</span>
                        {persons.map((p) => {
                          const isAssignedToThis = assignedPersonId === p.id && isFullyAssigned
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => onAssignItem(item.id, p.id)}
                              className={
                                isAssignedToThis
                                  ? 'inline-flex items-center gap-1.5 rounded-full border border-outline bg-surface-container-highest px-2.5 py-1 text-[11px] font-medium text-on-surface'
                                  : 'inline-flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-high px-2.5 py-1 text-[11px] text-on-surface transition-colors hover:border-outline'
                              }
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${p.color}`} />
                              {p.nombre}
                            </button>
                          )
                        })}
                        {isFullyAssigned && (
                          <button
                            type="button"
                            onClick={() => onUnassignItem(item.id)}
                            className="inline-flex items-center rounded-full border border-outline-variant px-2.5 py-1 text-[11px] text-on-surface-variant transition-colors hover:bg-surface-container-high"
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
      </div>

      {/* Columna derecha: cobro por persona (solo si hay personas) */}
      {persons.length > 0 && (
        <div className="flex flex-col gap-3 md:border-l md:border-outline-variant/60 md:pl-6">
          <SectionLabel>Cobro</SectionLabel>
          {persons.map((p) => {
            const total = personTotals.get(p.id)?.total ?? 0
            const selectedMetodo = metodoMap.get(p.id)
            return (
              <div
                key={p.id}
                className="flex flex-col gap-2.5 rounded-lg border border-outline-variant bg-surface-container-low p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${p.color}`} />
                    <span className="truncate text-xs font-semibold text-on-surface">{p.nombre}</span>
                  </span>
                  <Money value={total} className="shrink-0 text-xs font-semibold text-on-surface" />
                </div>
                <MethodSelector
                  selected={selectedMetodo}
                  onSelect={(m) => onSetMetodo(p.id, m)}
                />
              </div>
            )
          })}
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
    <div className="flex flex-col gap-5">
      {/* Total a dividir */}
      <div className="flex flex-col items-center gap-1 rounded-lg border border-outline-variant bg-surface-container-low p-4 text-center">
        <SectionLabel>Total a dividir</SectionLabel>
        <Money value={grandTotalWithTax} className="text-3xl font-bold tracking-tight text-on-surface" />
      </div>

      {/* Número de personas */}
      <div className="flex items-center justify-between gap-4 rounded-lg border border-outline-variant bg-surface-container-low p-3.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-medium text-on-surface">¿Cuántas personas?</span>
          <span className="text-xs text-on-surface-variant">
            <Money value={baseAmount} className="font-medium text-on-surface" /> / persona
            {!isEven && (
              <span className="ml-1.5 text-warning">
                (último: <Money value={baseAmount + remainder} />)
              </span>
            )}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <IconButton
            variant="secondary"
            icon={<Minus size={16} />}
            label="Restar persona"
            disabled={numPersons <= 2}
            onClick={() => onSetNumPersons(Math.max(2, numPersons - 1))}
          />
          <span className="w-8 text-center text-base font-semibold tabular-nums text-on-surface">
            {numPersons}
          </span>
          <IconButton
            variant="secondary"
            icon={<Plus size={16} />}
            label="Sumar persona"
            disabled={numPersons >= 10}
            onClick={() => onSetNumPersons(Math.min(10, numPersons + 1))}
          />
        </div>
      </div>

      {!isEven && (
        <div className="flex items-center gap-2.5 rounded-lg border border-warning/40 bg-surface-container-low p-3 text-xs text-warning">
          <TriangleAlert size={16} className="shrink-0" />
          <span>
            El monto no es divisible de manera exacta. La diferencia de{' '}
            <Money value={Math.abs(remainder)} /> se agrega a la última persona.
          </span>
        </div>
      )}

      {/* Método de cobro por persona */}
      <div className="flex flex-col gap-2.5">
        <SectionLabel>Cobro por persona</SectionLabel>
        {Array.from({ length: numPersons }, (_, i) => {
          const isLast = i === numPersons - 1
          const amount = isLast ? baseAmount + remainder : baseAmount
          const color = PERSON_COLORS[i % PERSON_COLORS.length]
          return (
            <div
              key={i}
              className="flex flex-col gap-3 rounded-lg border border-outline-variant bg-surface-container-low p-3 md:flex-row md:items-center md:justify-between md:gap-4"
            >
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${color}`} />
                <span className="text-sm font-medium text-on-surface">Persona {i + 1}</span>
                <Money value={amount} className="text-xs text-on-surface-variant" />
              </div>
              <div className="w-full shrink-0 md:w-72">
                <MethodSelector
                  selected={metodoIguales.get(i)}
                  onSelect={(m) => onSetMetodoIguales(i, m)}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SplitAccountModal({
  open,
  items,
  cajaId: _cajaId,
  descuento = 0,
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
  // Misma fórmula que createCuenta: base = subtotal − descuento; total = base + IVA
  const grandTotal = items.reduce((s, it) => s + it.price * it.qty, 0)
  const grandBase = grandTotal - descuento
  const grandIva = grandBase * TAX_RATE
  const grandTotalWithTax = round2(grandBase + grandIva)
  const personTotals = calcPersonTotals(persons, items, assignments, descuento)
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
      const t = personTotals.get(p.id) ?? { subtotal: 0, descuento: 0, iva: 0, total: 0 }
      return {
        nombre: p.nombre,
        items: personItems,
        metodo: metodoMap.get(p.id)!,
        subtotal: t.subtotal,
        descuento: t.descuento,
        iva: t.iva,
        total: t.total,
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

    // Parte informativa del descuento por persona; la cuenta única lleva el descuento total
    const descuentoBase = round2(descuento / numPersons)
    const splits: PersonSplit[] = Array.from({ length: numPersons }, (_, i) => {
      const isLast = i === numPersons - 1
      const total = round2(isLast ? baseAmount + remainder : baseAmount)
      const base = round2(total / (1 + TAX_RATE))
      const iva = round2(total - base)
      const personDescuento = isLast
        ? round2(descuento - descuentoBase * (numPersons - 1))
        : descuentoBase
      return {
        nombre: `Persona ${i + 1}`,
        items: allItems,
        metodo: metodoIguales.get(i)!,
        subtotal: round2(base + personDescuento),
        descuento: personDescuento,
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
    <Modal
      open={open}
      onClose={onCancel}
      dismissable={!confirming}
      title="Dividir Cuenta"
      description={`Total ${fmtMoney(grandTotalWithTax)}`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={!canConfirm}
            loading={confirming}
          >
            Cobrar todo
          </Button>
        </>
      }
    >
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'persona', label: 'Por persona' },
          { value: 'iguales', label: 'Partes iguales' },
        ]}
      />

      <div className="mt-5">
        {tab === 'persona' ? (
          <TabPorPersona
            items={items}
            persons={persons}
            assignments={assignments}
            personTotals={personTotals}
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
    </Modal>
  )
}
