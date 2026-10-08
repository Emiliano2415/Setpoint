'use client'

import {
  LayoutDashboard, CircleDot, UtensilsCrossed, ShoppingBag,
  Settings, Wifi, BatteryFull,
} from 'lucide-react'
import { HERO_STATS, COURTS } from '@/lib/constants'

function StatCard({ stat, index }: { stat: (typeof HERO_STATS)[number]; index: number }) {
  return (
    <div className={`glass-card p-2 md:p-3${index === 0 ? ' border-l-2 border-lime' : ''}`}>
      <p className="text-[8px] md:text-[10px] uppercase tracking-wider text-muted">{stat.label}</p>
      <p className="text-sm md:text-xl font-bold text-text">{stat.value}</p>
      {stat.sub && (
        <p className={`text-[10px] md:text-xs ${stat.color === 'lime' ? 'text-lime' : stat.color === 'yellow' ? 'text-yellow' : 'text-muted'}`}>
          {stat.sub}
        </p>
      )}
    </div>
  )
}

function CourtCard({ court }: { court: (typeof COURTS)[number] }) {
  const styles: Record<string, string> = {
    active: 'bg-lime-10 border border-lime-30 rounded-md p-2 md:p-3 relative overflow-hidden',
    free: 'bg-bg2 border border-border rounded-md p-2 md:p-3 opacity-70',
    maintenance: 'bg-yellow-10 border border-yellow-30 rounded-md p-2 md:p-3 relative overflow-hidden',
  }
  const timeColor: Record<string, string> = {
    active: 'text-lime',
    free: 'text-muted',
    maintenance: 'text-yellow',
  }

  return (
    <div className={styles[court.status]}>
      {court.status === 'active' && <div className="absolute right-0 top-0 bottom-0 w-1 bg-lime" />}
      {court.status === 'maintenance' && <div className="absolute right-0 top-0 bottom-0 w-1 bg-yellow" />}
      <p className="text-[10px] md:text-xs text-muted">{court.name}</p>
      <p className={`text-xs md:text-sm font-bold ${court.status === 'free' ? 'text-muted italic' : 'text-text'}`}>
        {court.event}
      </p>
      <p className={`text-[10px] md:text-xs ${timeColor[court.status]}`}>{court.time}</p>
    </div>
  )
}

/**
 * Static version of HeroDashboard — fills its parent container.
 * Used inside ScrollExpansionHero as the expanding content.
 */
export default function HeroDashboardStatic() {
  return (
    <div className="w-full h-full bg-bg2 flex flex-col">
      {/* Title bar */}
      <div className="h-8 md:h-10 bg-surface-dark border-b border-border flex items-center px-3 md:px-4 shrink-0">
        <div className="flex gap-1.5">
          <span className="w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-red" />
          <span className="w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-yellow" />
          <span className="w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-green" />
        </div>
        <span className="text-[10px] md:text-xs text-muted absolute left-1/2 -translate-x-1/2">
          Setpoint POS Terminal - Club Central
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Wifi size={10} className="text-muted hidden md:block" />
          <BatteryFull size={10} className="text-muted hidden md:block" />
          <span className="text-[10px] md:text-xs text-text">14:32</span>
        </div>
      </div>

      {/* Content */}
      <div className="bg-surface flex-1 p-2 md:p-4 flex gap-2 md:gap-3 overflow-hidden">
        {/* Sidebar */}
        <div className="w-10 md:w-16 glass-card flex flex-col items-center gap-2 md:gap-4 py-2 md:py-3 shrink-0">
          <div className="bg-lime-20 rounded-full p-1.5 md:p-2">
            <LayoutDashboard size={12} className="text-lime md:w-4 md:h-4" />
          </div>
          <CircleDot size={12} className="text-muted md:w-4 md:h-4" />
          <UtensilsCrossed size={12} className="text-muted md:w-4 md:h-4" />
          <ShoppingBag size={12} className="text-muted md:w-4 md:h-4" />
          <Settings size={12} className="text-muted mt-auto md:w-4 md:h-4" />
        </div>

        {/* Main */}
        <div className="flex-1 flex flex-col gap-2 md:gap-3 min-w-0">
          <div className="grid grid-cols-4 gap-1.5 md:gap-3">
            {HERO_STATS.map((stat, i) => (
              <StatCard key={stat.label} stat={stat} index={i} />
            ))}
          </div>

          <div className="glass-card p-2 md:p-3 flex-1">
            <div className="flex justify-between items-center">
              <span className="text-xs md:text-sm font-semibold text-text">Estado de Pistas</span>
              <span className="bg-bg2 border border-border rounded-lg px-1.5 md:px-2 py-0.5 text-[10px] md:text-xs text-muted">
                Vista: Hoy
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 md:gap-3 mt-2 md:mt-3">
              {COURTS.map((court) => (
                <CourtCard key={court.name} court={court} />
              ))}
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="w-36 md:w-56 glass-card flex flex-col shrink-0 hidden sm:flex">
          <div className="p-2 md:p-3">
            <span className="text-xs md:text-sm font-semibold text-text">Ticket Rápido</span>
          </div>
          <div className="bg-bg2 border border-border rounded-lg mx-2 md:mx-3 p-2 md:p-3 flex-1">
            <div className="flex justify-between text-[10px] md:text-xs text-text border-b border-border pb-1.5 md:pb-2">
              <span>Bebida Isotónica x2</span>
              <span>$100.00</span>
            </div>
            <div className="flex justify-between text-[10px] md:text-xs text-text pt-1.5 md:pt-2">
              <span>Alquiler Pala</span>
              <span>$70.00</span>
            </div>
          </div>
          <div className="border-t border-border mx-2 md:mx-3 p-2 md:p-3 flex justify-between items-center">
            <span className="text-[10px] md:text-xs text-muted">Total</span>
            <span className="text-base md:text-lg font-bold text-lime">$170.00</span>
          </div>
          <div className="mx-2 md:mx-3 mb-2 md:mb-3 bg-lime text-bg font-bold text-xs md:text-sm rounded-lg py-1.5 md:py-2 text-center cursor-pointer">
            Cobrar
          </div>
        </div>
      </div>
    </div>
  )
}
