"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import {
  Volleyball,
  HelpCircle,
  Building2,
  MonitorSmartphone,
  MessageSquare,
  LogIn,
  Sparkles,
} from "lucide-react"

const NAV_ITEMS = [
  { label: 'Gestión de Club', href: '#gestion', icon: Building2 },
  { label: 'Servicio', href: '#servicio', icon: MonitorSmartphone },
  { label: 'FAQ', href: '#faq', icon: HelpCircle },
  { label: 'Contacto', href: '#contacto', icon: MessageSquare },
]

export default function Navbar() {
  const [activeHash, setActiveHash] = useState('')

  useEffect(() => {
    // Collect all elements we want to observe
    const elements = NAV_ITEMS.map((item) => {
      const id = item.href.replace('#', '')
      return document.getElementById(id)
    }).filter(Boolean) as HTMLElement[]

    if (elements.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the visible entry with the highest intersection ratio
        const visibleEntries = entries.filter(entry => entry.isIntersecting)
        if (visibleEntries.length > 0) {
          // Sort by intersection ratio (how much of it is on screen)
          visibleEntries.sort((a, b) => b.intersectionRatio - a.intersectionRatio)
          const visibleId = visibleEntries[0].target.id
          setActiveHash(`#${visibleId}`)
        }
      },
      {
        root: null,
        rootMargin: '-20% 0px -40% 0px', // Trigger when section is cleanly in the middle of the screen
        threshold: [0, 0.1, 0.2, 0.5],
      }
    )

    elements.forEach(el => observer.observe(el))

    return () => observer.disconnect()
  }, [])

  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="fixed top-0 left-0 right-0 z-50 flex justify-center px-4 pt-3"
    >
      <nav
        className="
          max-w-5xl w-full h-14 flex items-center justify-between
          px-5 rounded-2xl
          bg-[rgba(13,17,9,0.55)]
          border border-[rgba(108,242,13,0.1)]
          shadow-[inset_0_0_0_0.5px_rgba(108,242,13,0.06),inset_0_1px_0_0_rgba(255,255,255,0.04),0_8px_32px_-8px_rgba(0,0,0,0.6),0_0_20px_-4px_rgba(108,242,13,0.04)]
        "
        style={{
          backdropFilter: 'blur(24px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
        }}
      >
        {/* Left — Brand */}
        <a href="#" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-lime/10 border border-lime/20 flex items-center justify-center group-hover:bg-lime/20 transition-colors">
            <Volleyball size={16} className="text-lime" />
          </div>
          <span className="font-bold text-text text-sm tracking-tight">
            Setpoint
          </span>
        </a>

        {/* Center — Links with icons */}
        <div className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
            const isActive = activeHash === href
            return (
              <a
                key={href}
                href={href}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5
                  text-sm rounded-lg transition-colors duration-200
                  ${isActive 
                    ? 'text-lime font-medium bg-[rgba(108,242,13,0.12)]' 
                    : 'text-muted/80 hover:text-text hover:bg-white/[0.04]'}
                `}
              >
                <Icon size={14} className={isActive ? 'opacity-100' : 'opacity-50 group-hover:opacity-80'} />
                {label}
              </a>
            )
          })}
        </div>

        {/* Right — Actions */}
        <div className="flex items-center gap-2">
          <a
            href="#"
            className="
              flex items-center gap-1.5
              border border-[rgba(108,242,13,0.12)] rounded-xl
              px-4 py-2 text-sm text-text/80 hover:text-text
              hover:bg-white/[0.04] hover:border-[rgba(108,242,13,0.2)]
              transition-all duration-200
            "
          >
            <LogIn size={14} className="opacity-60" />
            Iniciar Sesión
          </a>
          <motion.a
            href="#"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: 'tween', duration: 0.12 }}
            className="
              flex items-center gap-1.5
              bg-lime text-bg font-bold rounded-xl
              px-4 py-2 text-sm
              shadow-[0_0_16px_-4px_rgba(108,242,13,0.4)]
            "
          >
            <Sparkles size={14} />
            Solicitar Demo
          </motion.a>
        </div>
      </nav>
    </motion.header>
  )
}
