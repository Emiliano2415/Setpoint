"use client"

import { motion } from "framer-motion"
import {
  LayoutDashboard, CircleDot, UtensilsCrossed, ShoppingBag,
  Settings, Wifi, BatteryFull,
} from "lucide-react"
import { HERO_STATS, COURTS } from "@/lib/constants"

const ease = [0.16, 1, 0.3, 1] as const

function StatCard({ stat, index }: { stat: (typeof HERO_STATS)[number]; index: number }) {
  return (
    <div className={`glass-card p-3${index === 0 ? " border-l-2 border-lime" : ""}`}>
      <p className="text-[10px] uppercase tracking-wider text-muted">{stat.label}</p>
      <p className="text-xl font-bold text-text">{stat.value}</p>
      {stat.sub && (
        <p className={`text-xs ${stat.color === "lime" ? "text-lime" : stat.color === "yellow" ? "text-yellow" : "text-muted"}`}>
          {stat.sub}
        </p>
      )}
    </div>
  )
}

function CourtCard({ court }: { court: (typeof COURTS)[number] }) {
  const styles: Record<string, string> = {
    active: "bg-lime-10 border border-lime-30 rounded-md p-3 relative overflow-hidden",
    free: "bg-bg2 border border-border rounded-md p-3 opacity-70",
    maintenance: "bg-yellow-10 border border-yellow-30 rounded-md p-3 relative overflow-hidden",
  }
  const timeColor: Record<string, string> = {
    active: "text-lime",
    free: "text-muted",
    maintenance: "text-yellow",
  }

  return (
    <div className={styles[court.status]}>
      {court.status === "active" && <div className="absolute right-0 top-0 bottom-0 w-1 bg-lime" />}
      {court.status === "maintenance" && <div className="absolute right-0 top-0 bottom-0 w-1 bg-yellow" />}
      <p className="text-xs text-muted">{court.name}</p>
      <p className={`text-sm font-bold ${court.status === "free" ? "text-muted italic" : "text-text"}`}>
        {court.event}
      </p>
      <p className={`text-xs ${timeColor[court.status]}`}>{court.time}</p>
    </div>
  )
}

export default function HeroDashboard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.8, delay: 1.4, ease }}
      whileHover="hovered"
      className="relative mt-20 max-w-4xl mx-auto cursor-pointer"
    >
      {/* Glow — intensifica en hover */}
      <motion.div
        className="absolute inset-[-40px] bg-lime rounded-full blur-[60px] pointer-events-none"
        variants={{
          hovered: { opacity: 0.25, scale: 1.1, x: -10 },
        }}
        initial={{ opacity: 0.1, scale: 1, x: 0 }}
        transition={{ duration: 0.5, ease }}
      />

      {/* Card — lift 3D sutil en hover */}
      <motion.div
        className="relative glass-panel overflow-hidden shadow-[-20px_40px_60px_rgba(108,242,13,0.1),0_0_40px_rgba(0,0,0,0.8)]"
        style={{ transformStyle: "preserve-3d", perspective: 900, willChange: 'transform' }}
        variants={{
          hovered: {
            y: -8,
            scale: 1.01,
            rotateX: 2,
            rotateY: -1.5,
          },
        }}
        transition={{ type: 'tween', duration: 0.35, ease }}
      >
        {/* Title bar */}
        <div className="h-10 bg-surface-dark border-b border-border flex items-center px-4 relative">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red" />
            <span className="w-2.5 h-2.5 rounded-full bg-yellow" />
            <span className="w-2.5 h-2.5 rounded-full bg-green" />
          </div>
          <span className="text-xs text-muted absolute left-1/2 -translate-x-1/2">
            Setpoint POS Terminal - Club Central
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Wifi size={12} className="text-muted" />
            <BatteryFull size={12} className="text-muted" />
            <span className="text-xs text-text">14:32</span>
          </div>
        </div>

        {/* Content */}
        <div className="bg-surface p-4 flex gap-3">
          {/* Sidebar */}
          <div className="w-16 glass-card flex flex-col items-center gap-4 py-3">
            <div className="bg-lime-20 rounded-full p-2">
              <LayoutDashboard size={16} className="text-lime" />
            </div>
            <CircleDot size={16} className="text-muted" />
            <UtensilsCrossed size={16} className="text-muted" />
            <ShoppingBag size={16} className="text-muted" />
            <Settings size={16} className="text-muted mt-auto" />
          </div>

          {/* Main */}
          <div className="flex-1 flex flex-col gap-3">
            <div className="grid grid-cols-4 gap-3">
              {HERO_STATS.map((stat, i) => (
                <StatCard key={stat.label} stat={stat} index={i} />
              ))}
            </div>

            <div className="glass-card p-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-text">Estado de Pistas</span>
                <span className="bg-bg2 border border-border rounded-lg px-2 py-0.5 text-xs text-muted">
                  Vista: Hoy
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                {COURTS.map((court) => (
                  <CourtCard key={court.name} court={court} />
                ))}
              </div>
            </div>
          </div>

          {/* Right panel */}
          <div className="w-56 glass-card flex flex-col">
            <div className="p-3">
              <span className="text-sm font-semibold text-text">Ticket Rápido</span>
            </div>
            <div className="bg-bg2 border border-border rounded-lg mx-3 p-3 flex-1">
              <div className="flex justify-between text-xs text-text border-b border-border pb-2">
                <span>Bebida Isotónica x2</span>
                <span>$100.00</span>
              </div>
              <div className="flex justify-between text-xs text-text pt-2">
                <span>Alquiler Pala</span>
                <span>$70.00</span>
              </div>
            </div>
            <div className="border-t border-border mx-3 p-3 flex justify-between items-center">
              <span className="text-xs text-muted">Total</span>
              <span className="text-lg font-bold text-lime">$170.00</span>
            </div>
            <div className="mx-3 mb-3 bg-lime text-bg font-bold text-sm rounded-lg py-2 text-center cursor-pointer">
              Cobrar
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
