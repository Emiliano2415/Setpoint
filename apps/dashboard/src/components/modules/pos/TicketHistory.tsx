'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getTicketsDelDia, type TicketHistorialItem } from '@/lib/supabase/queries/pos'
import { Banknote, CreditCard, Receipt, Split, X } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { Badge, EmptyState } from '@/components/ds'

interface TicketHistoryProps {
  onClose: () => void
}

function fmtHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

const METODO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo',
  credito: 'Crédito',
  debito: 'Débito',
  cortesia: 'Cortesía',
  cuenta_cliente: 'Cuenta cliente',
  bono: 'Bono',
  dividido: 'Dividido',
}

function fmtMonto(n: number): string {
  return `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function TicketHistory({ onClose }: TicketHistoryProps) {
  const clubId = useAppStore((s) => s.clubId)
  const [tickets, setTickets] = useState<TicketHistorialItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    if (!clubId) return
    const supabase = createClient()
    getTicketsDelDia(supabase, clubId).then((data) => {
      setTickets(data)
      setLoading(false)
    })
  }, [clubId])

  const totalDia = tickets.reduce((sum, t) => sum + t.total, 0)

  return (
    <div
      className="fixed inset-0 z-[999] flex justify-end bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="flex h-full w-full max-w-[420px] flex-col overflow-hidden border-l border-outline-variant bg-surface-container shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-outline-variant p-4">
          <div>
            <h2 className="text-lg font-semibold leading-tight text-on-surface">Historial del Día</h2>
            <p className="mt-0.5 text-xs text-on-surface-variant">
              {tickets.length} tickets — Total {fmtMonto(totalDia)} MXN
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-1 text-outline transition-colors hover:bg-surface-container-high hover:text-on-surface"
          >
            <X size={20} />
          </button>
        </div>

        {/* Lista */}
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-on-surface-variant">Cargando...</p>
          ) : tickets.length === 0 ? (
            <EmptyState icon={<Receipt />} title="Sin tickets cobrados hoy" />
          ) : (
            tickets.map((t) => {
              const isExp = expanded === t.id
              const isSplit = t.metodo === 'dividido'
              const isCard = !isSplit && (t.metodo.includes('tarjeta') || t.metodo === 'credito' || t.metodo === 'debito')
              const Icono = isSplit ? Split : isCard ? CreditCard : Banknote

              return (
                <div
                  key={t.id}
                  className={isExp
                    ? 'cursor-pointer rounded-lg border border-outline-variant bg-surface-container-high p-3.5'
                    : 'cursor-pointer rounded-lg border border-outline-variant bg-surface-container p-3 transition-colors hover:border-outline'}
                  onClick={() => setExpanded(isExp ? null : t.id)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      {/* Método: icono */}
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-outline-variant bg-surface-container-highest">
                        <Icono
                          size={16}
                          className={isSplit ? 'text-warning' : isCard ? 'text-info' : 'text-primary'}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-on-surface">#{t.numero_ticket}</p>
                        <p className="text-[11px] text-on-surface-variant">
                          {fmtHora(t.created_at)} · {t.items.length} productos
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums text-on-surface">{fmtMonto(t.total)}</p>
                      <div className="mt-0.5 flex items-center justify-end gap-1.5">
                        <span className={isSplit
                          ? 'text-[11px] font-medium text-warning'
                          : isCard
                            ? 'text-[11px] font-medium text-info'
                            : 'text-[11px] font-medium text-primary'}>
                          {METODO_LABEL[t.metodo] ?? t.metodo}
                        </span>
                        <Badge tone={t.caja_id ? 'success' : 'neutral'}>
                          {t.caja_id ? 'En caja' : 'Sin turno'}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {isExp && t.items.length > 0 && (
                    <div className="mt-2.5 space-y-1.5 border-t border-outline-variant/60 pt-2.5 text-xs">
                      {t.items.map((item, i) => (
                        <div key={i} className="flex justify-between gap-3 text-on-surface-variant">
                          <span className="truncate">{item.cantidad}x {item.nombre}</span>
                          <span className="shrink-0 tabular-nums text-on-surface">
                            {fmtMonto((item as { subtotal?: number; precio_unitario: number; cantidad: number }).subtotal ?? item.precio_unitario * item.cantidad)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Pie: Tickets y Total */}
        {tickets.length > 0 && (
          <div className="flex shrink-0 items-center justify-between gap-4 border-t border-outline-variant bg-surface-container-high/50 p-4">
            <div className="flex flex-col">
              <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Tickets</span>
              <span className="text-lg font-semibold tabular-nums text-on-surface">{tickets.length}</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Total</span>
              <span className="text-lg font-semibold tabular-nums text-primary">{fmtMonto(totalDia)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
