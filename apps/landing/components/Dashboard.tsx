'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  CircleDot,
  UtensilsCrossed,
  ShoppingBag,
  Settings,
  Search,
  Coffee,
  ArrowRight,
  Bell,
  Monitor,
  Droplets,
  Zap,
  GlassWater,
  Sandwich,
  Apple,
  Salad,
  Dumbbell,
  Watch,
  Layers,
  Minus,
  Shield,
  Package,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Wrench,
} from 'lucide-react'
import {
  PRODUCT_CATEGORIES,
  TICKET_ITEMS,
  TICKET_SUMMARY,
} from '@/lib/constants'

const ease = [0.16, 1, 0.3, 1] as const

const productIcons = {
  Coffee,
  Droplets,
  Zap,
  GlassWater,
  Sandwich,
  Apple,
  Salad,
  Dumbbell,
  Watch,
  ShoppingBag,
  CircleDot,
  Layers,
  Minus,
  Shield,
  Package,
  UtensilsCrossed,
} as const

// ── Sección: Estado de Pistas ──────────────────────────────────────────────
const COURTS_DATA = [
  { id: 1, name: 'Pista 1 — Central', event: 'Torneo Local', time: '14:00 – 15:30', status: 'active' as const, players: 'García / Ruiz vs. López / Mora' },
  { id: 2, name: 'Pista 2', event: 'Clase Nivel Medio', time: '14:00 – 15:00', status: 'active' as const, players: 'Prof. Sánchez · 4 alumnos' },
  { id: 3, name: 'Pista 3', event: 'Libre', time: '—', status: 'free' as const, players: '' },
  { id: 4, name: 'Pista 4', event: 'Mantenimiento', time: 'Hasta 16:00', status: 'maintenance' as const, players: 'Red y suelo' },
  { id: 5, name: 'Pista 5', event: 'Reserva 15:00', time: '15:00 – 16:30', status: 'free' as const, players: 'Martínez / Díaz' },
  { id: 6, name: 'Pista 6', event: 'Clase Avanzado', time: '14:30 – 16:00', status: 'active' as const, players: 'Prof. Costa · 2 alumnos' },
]

function CourtRow({ court, index }: { court: (typeof COURTS_DATA)[number]; index: number }) {
  const statusConfig = {
    active: { label: 'Ocupada', color: 'text-lime', bg: 'bg-lime-10 border-lime-30', dot: 'bg-lime', Icon: CheckCircle2 },
    free: { label: 'Libre', color: 'text-muted', bg: 'bg-bg border-border', dot: 'bg-muted', Icon: Clock },
    maintenance: { label: 'Mant.', color: 'text-yellow', bg: 'bg-yellow-10 border-yellow-30', dot: 'bg-yellow', Icon: Wrench },
  }
  const s = statusConfig[court.status]
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, delay: index * 0.04, ease }}
      className={`flex items-center gap-3 p-2.5 rounded-lg border ${s.bg}`}
    >
      <span className="text-xs font-bold text-muted w-5 text-center">{court.id}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-text truncate">{court.name}</p>
        <p className="text-[11px] text-muted truncate">{court.event}{court.players ? ` · ${court.players}` : ''}</p>
      </div>
      <div className="text-right shrink-0">
        <p className={`text-[11px] font-medium ${s.color}`}>{court.time}</p>
        <span className={`text-[10px] ${s.color} flex items-center gap-1 justify-end`}>
          <span className={`w-1.5 h-1.5 rounded-full inline-block ${s.dot}`} />
          {s.label}
        </span>
      </div>
    </motion.div>
  )
}

// ── Sección: Comandas Abiertas ─────────────────────────────────────────────
const COMANDAS_DATA = [
  { id: '4029', location: 'Mesa Barra 2', items: 3, total: '$170.00', time: '14:28', status: 'open' as const },
  { id: '4028', location: 'Pista 2 — Clase', items: 5, total: '$285.00', time: '14:12', status: 'open' as const },
  { id: '4027', location: 'Terraza', items: 2, total: '$95.00', time: '13:58', status: 'pending' as const },
  { id: '4026', location: 'Mesa Barra 1', items: 4, total: '$210.00', time: '13:40', status: 'ready' as const },
  { id: '4025', location: 'Pista 1 — Torneo', items: 8, total: '$520.00', time: '13:15', status: 'open' as const },
]

function ComandaRow({ comanda, index }: { comanda: (typeof COMANDAS_DATA)[number]; index: number }) {
  const statusConfig = {
    open: { label: 'Abierta', color: 'text-lime', bg: 'bg-lime-10 border-lime-30' },
    pending: { label: 'Pendiente', color: 'text-yellow', bg: 'bg-yellow-10 border-yellow-30' },
    ready: { label: 'Lista', color: 'text-text', bg: 'bg-bg2 border-border' },
  }
  const s = statusConfig[comanda.status]
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, delay: index * 0.05, ease }}
      className="flex items-center gap-3 p-2.5 rounded-lg bg-bg border border-border hover:border-lime-30 transition-colors cursor-pointer"
    >
      <div className="bg-lime-10 border border-lime-30 rounded-md px-2 py-1 shrink-0">
        <p className="text-xs font-bold text-lime">#{comanda.id}</p>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-text truncate">{comanda.location}</p>
        <p className="text-[11px] text-muted">{comanda.items} productos · {comanda.time}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-bold text-text">{comanda.total}</p>
        <span className={`text-[10px] font-medium ${s.color}`}>{s.label}</span>
      </div>
    </motion.div>
  )
}

// ── Sección: Inventario / Tienda ───────────────────────────────────────────
const STOCK_DATA = [
  { name: 'Bebida Isotónica', category: 'Bebidas', stock: 4, min: 10, icon: 'Zap' as const },
  { name: 'Pala Nivel 1', category: 'Alquiler', stock: 2, min: 5, icon: 'Dumbbell' as const },
  { name: 'Bote Bolas Head Pro', category: 'Insumos', stock: 8, min: 6, icon: 'CircleDot' as const },
  { name: 'Café Solo', category: 'Bebidas', stock: 20, min: 10, icon: 'Coffee' as const },
  { name: 'Grip Overgrip x3', category: 'Insumos', stock: 3, min: 8, icon: 'Layers' as const },
  { name: 'Agua Mineral 500ml', category: 'Bebidas', stock: 15, min: 12, icon: 'Droplets' as const },
]

function StockRow({ item, index }: { item: (typeof STOCK_DATA)[number]; index: number }) {
  const low = item.stock < item.min
  const critical = item.stock < item.min * 0.5
  const pct = Math.min(100, Math.round((item.stock / (item.min * 2)) * 100))
  const StockIcon = productIcons[item.icon as keyof typeof productIcons]
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, delay: index * 0.04, ease }}
      className="flex items-center gap-3 p-2.5 rounded-lg bg-bg border border-border"
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${critical ? 'bg-red/10 border border-red/30' : low ? 'bg-yellow-10 border border-yellow-30' : 'bg-lime-10 border border-lime-30'}`}>
        <StockIcon size={14} className={critical ? 'text-red-400' : low ? 'text-yellow' : 'text-lime'} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-semibold text-text truncate">{item.name}</p>
          {(low || critical) && <AlertTriangle size={10} className={critical ? 'text-red-400 shrink-0' : 'text-yellow shrink-0'} />}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${critical ? 'bg-red-400' : low ? 'bg-yellow' : 'bg-lime'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className={`text-[10px] font-bold shrink-0 ${critical ? 'text-red-400' : low ? 'text-yellow' : 'text-lime'}`}>
            {item.stock} uds
          </span>
        </div>
      </div>
    </motion.div>
  )
}

// ── Sidebar definition ─────────────────────────────────────────────────────
const SIDEBAR_SECTIONS = [
  { id: 'pos', icon: LayoutDashboard, label: 'POS' },
  { id: 'pistas', icon: CircleDot, label: 'Pistas' },
  { id: 'comandas', icon: UtensilsCrossed, label: 'Bar' },
  { id: 'tienda', icon: ShoppingBag, label: 'Stock' },
] as const

type SectionId = (typeof SIDEBAR_SECTIONS)[number]['id']

// ── Main component ─────────────────────────────────────────────────────────
export default function Dashboard() {
  const [activeSection, setActiveSection] = useState<SectionId>('pos')
  const [activeTab, setActiveTab] = useState('cafeteria')

  const activeCategory = PRODUCT_CATEGORIES.find((c) => c.id === activeTab)
  const CategoryTabIcon = productIcons[activeCategory?.icon as keyof typeof productIcons]

  return (
    <section id="servicio" className="py-32 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, ease }}
          className="text-center"
        >
          <h2 className="text-4xl font-black text-text">
            Setpoint en{' '}
            <span className="font-display italic text-lime">Acción</span>
          </h2>
          <p className="text-muted mt-4 max-w-2xl mx-auto">
            Una interfaz diseñada para la velocidad. Cobra, gestiona y controla tu club desde un solo panel.
          </p>
        </motion.div>

        {/* Dashboard Mockup */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8, ease }}
          className="glass-panel overflow-hidden mt-12"
        >
          {/* Top Navbar */}
          <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-4 shrink-0">
            <div className="flex items-center gap-3">
              <Monitor size={16} className="text-lime" />
              <span className="font-bold text-lime text-sm">Setpoint</span>
              <span className="bg-lime-10 border border-lime-30 rounded-full px-2 py-0.5 text-xs text-lime flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-lime rounded-full inline-block" />
                Sistema Online
              </span>
              <span className="text-xs text-muted">Pistas: 8/10 Ocupadas</span>
            </div>
            <div className="flex items-center gap-3">
              <Bell size={16} className="text-muted" />
              <Settings size={16} className="text-muted" />
              <span className="text-sm text-text">Carlos T.</span>
              <span className="text-xs text-muted">Turno Tarde</span>
              <div className="bg-lime text-bg w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0">
                CT
              </div>
              <span className="text-sm text-text">14:32</span>
            </div>
          </div>

          {/* Body */}
          <div className="flex" style={{ minHeight: 400 }}>
            {/* Left Sidebar */}
            <div className="w-14 border-r border-border flex flex-col items-center py-4 gap-1 shrink-0">
              {SIDEBAR_SECTIONS.map(({ id, icon: Icon, label }) => {
                const isActive = activeSection === id
                return (
                  <motion.button
                    key={id}
                    onClick={() => setActiveSection(id)}
                    title={label}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.92 }}
                    transition={{ type: 'tween', duration: 0.12 }}
                    className={`relative rounded-xl p-2.5 transition-colors ${
                      isActive ? 'bg-lime-20' : 'hover:bg-bg'
                    }`}
                  >
                    <Icon size={20} className={isActive ? 'text-lime' : 'text-muted'} />
                    {isActive && (
                      <motion.span
                        layoutId="sidebar-indicator"
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-lime rounded-r-full"
                      />
                    )}
                  </motion.button>
                )
              })}
              <Settings size={20} className="mt-auto text-muted" />
            </div>

            {/* Center + Right — cambia según sección activa */}
            <AnimatePresence mode="wait">
              {activeSection === 'pos' && (
                <motion.div
                  key="pos"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.25, ease }}
                  className="flex flex-1 min-w-0"
                >
                  {/* Center Area */}
                  <div className="flex-1 p-4 flex flex-col gap-4 min-w-0">
                    {/* Category Tabs */}
                    <div className="flex flex-wrap gap-2">
                      {PRODUCT_CATEGORIES.map((cat) => {
                        const TabIcon = productIcons[cat.icon as keyof typeof productIcons]
                        const isActive = activeTab === cat.id
                        return (
                          <button
                            key={cat.id}
                            onClick={() => setActiveTab(cat.id)}
                            className={`flex items-center gap-1.5 text-xs rounded-lg px-3 py-1.5 font-medium transition-colors ${
                              isActive
                                ? 'bg-lime text-bg'
                                : 'bg-bg border border-border text-muted hover:text-text hover:border-lime-30'
                            }`}
                          >
                            <TabIcon size={12} />
                            {cat.label}
                          </button>
                        )
                      })}
                    </div>

                    {/* Search Bar */}
                    <div className="flex items-center gap-2 bg-bg border border-border rounded-lg px-3 py-2">
                      <Search size={14} className="text-muted shrink-0" />
                      <span className="text-xs text-muted">Buscar producto (F3)</span>
                    </div>

                    {/* Category Header */}
                    <div className="flex items-center gap-2">
                      {CategoryTabIcon && <CategoryTabIcon size={16} className="text-lime" />}
                      <span className="text-sm font-semibold text-text">{activeCategory?.label}</span>
                    </div>

                    {/* Products Grid */}
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.2, ease }}
                        className="grid grid-cols-4 gap-3"
                      >
                        {activeCategory?.products.map((product) => {
                          const ProdIcon = productIcons[product.icon as keyof typeof productIcons]
                          return (
                            <motion.div
                              key={product.name}
                              whileHover={{ y: -2, transition: { type: 'tween', duration: 0.12 } }}
                              whileTap={{ scale: 0.97 }}
                              className="glass-card p-3 text-center relative cursor-pointer"
                            >
                              <div className="w-10 h-10 bg-lime-10 border border-lime-30 rounded-lg mx-auto mb-2 flex items-center justify-center">
                                {ProdIcon && <ProdIcon size={18} className="text-lime" />}
                              </div>
                              <p className="text-xs font-semibold text-text truncate">{product.name}</p>
                              <p className="text-xs text-lime mt-1 font-bold">{product.price}</p>
                              {product.badge && (
                                <span className="absolute top-1 right-1 bg-lime-10 text-lime text-[10px] px-1.5 rounded font-medium">
                                  {product.badge}
                                </span>
                              )}
                            </motion.div>
                          )
                        })}
                      </motion.div>
                    </AnimatePresence>
                  </div>

                  {/* Right Panel — Ticket */}
                  <div className="w-72 border-l border-border flex flex-col shrink-0">
                    <div className="p-4 border-b border-border">
                      <p className="text-sm font-semibold text-text">Ticket #4029</p>
                      <p className="text-xs text-muted mt-1">14:28 · Mesa Barra 2</p>
                    </div>
                    <div className="flex-1 p-4 flex flex-col gap-3">
                      {TICKET_ITEMS.map((item) => (
                        <div key={item.name} className="flex items-center gap-2">
                          <div className="bg-lime-10 text-lime text-xs font-bold w-6 h-6 rounded flex items-center justify-center shrink-0">
                            {item.qty}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-text font-bold truncate">{item.name}</p>
                            <p className="text-xs text-muted">{item.unit}</p>
                            {'note' in item && item.note && (
                              <p className="text-xs text-blue-400 mt-0.5">{item.note}</p>
                            )}
                          </div>
                          <span className="text-sm text-text font-bold shrink-0">{item.total}</span>
                        </div>
                      ))}
                    </div>
                    <div className="p-4 border-t border-border flex flex-col gap-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted">Subtotal</span>
                        <span className="text-text">{TICKET_SUMMARY.subtotal}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted">IVA (21%)</span>
                        <span className="text-text">{TICKET_SUMMARY.iva}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-text font-semibold">Total</span>
                        <span className="text-3xl font-bold text-lime">{TICKET_SUMMARY.total}</span>
                      </div>
                    </div>
                    <div className="p-4 pt-0">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        transition={{ type: 'tween', duration: 0.1 }}
                        className="w-full bg-lime text-bg font-bold rounded-lg py-3 text-sm flex items-center justify-center gap-2"
                      >
                        Cobrar Exacto
                        <ArrowRight size={16} />
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeSection === 'pistas' && (
                <motion.div
                  key="pistas"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.25, ease }}
                  className="flex-1 p-4 flex flex-col gap-3 min-w-0"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CircleDot size={16} className="text-lime" />
                      <span className="text-sm font-semibold text-text">Estado de Pistas</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-lime inline-block" />Ocupada (5)</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-muted inline-block" />Libre (2)</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow inline-block" />Mant. (1)</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    {COURTS_DATA.map((court, i) => (
                      <CourtRow key={court.id} court={court} index={i} />
                    ))}
                  </div>
                  <div className="mt-auto pt-2 border-t border-border flex justify-between text-xs text-muted">
                    <span>Próxima disponibilidad: Pista 3 — Libre ahora</span>
                    <span>Actualizado: 14:32</span>
                  </div>
                </motion.div>
              )}

              {activeSection === 'comandas' && (
                <motion.div
                  key="comandas"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.25, ease }}
                  className="flex-1 p-4 flex flex-col gap-3 min-w-0"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <UtensilsCrossed size={16} className="text-lime" />
                      <span className="text-sm font-semibold text-text">Comandas Abiertas</span>
                    </div>
                    <span className="bg-lime-10 border border-lime-30 rounded-full px-2 py-0.5 text-xs text-lime">
                      {COMANDAS_DATA.length} activas
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {COMANDAS_DATA.map((comanda, i) => (
                      <ComandaRow key={comanda.id} comanda={comanda} index={i} />
                    ))}
                  </div>
                  <div className="mt-auto pt-2 border-t border-border flex justify-between text-xs text-muted">
                    <span>Total en comandas abiertas</span>
                    <span className="text-lime font-bold">$1,280.00</span>
                  </div>
                </motion.div>
              )}

              {activeSection === 'tienda' && (
                <motion.div
                  key="tienda"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.25, ease }}
                  className="flex-1 p-4 flex flex-col gap-3 min-w-0"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShoppingBag size={16} className="text-lime" />
                      <span className="text-sm font-semibold text-text">Inventario</span>
                    </div>
                    <span className="bg-yellow-10 border border-yellow-30 rounded-full px-2 py-0.5 text-xs text-yellow flex items-center gap-1">
                      <AlertTriangle size={10} />
                      3 alertas de stock
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {STOCK_DATA.map((item, i) => (
                      <StockRow key={item.name} item={item} index={i} />
                    ))}
                  </div>
                  <div className="mt-auto pt-2 border-t border-border flex justify-between text-xs text-muted">
                    <span>Último cierre de stock: hoy 08:00</span>
                    <span className="text-yellow font-medium">Reponer: 3 artículos</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
