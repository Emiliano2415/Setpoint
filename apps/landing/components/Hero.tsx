"use client"

import { motion } from "framer-motion"
import { Eye } from "lucide-react"
import HeroDashboard from "./HeroDashboard"

const ease = [0.16, 1, 0.3, 1] as const
const fade = (delay: number) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease, delay },
})

export default function Hero() {
  return (
    <section className="min-h-screen flex flex-col items-center justify-center text-center pt-24 pb-32 px-6">
      {/* Badge */}
      <motion.div {...fade(0.2)} className="rounded-full bg-lime-10 border border-lime-30 px-4 py-1.5 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-lime animate-pulse-dot" />
        <span className="text-sm text-lime font-medium">El sistema definitivo para tu club</span>
      </motion.div>

      {/* Headline */}
      <div className="mt-8 flex flex-col gap-1">
        <motion.h1 {...fade(0.4)} className="text-7xl font-black text-text tracking-tight">
          Control Total.
        </motion.h1>
        <motion.h1 {...fade(0.6)} className="text-7xl font-display italic text-lime-90 tracking-tight">
          Cero Fricción.
        </motion.h1>
      </div>

      {/* Subtitle */}
      <motion.p {...fade(0.9)} className="max-w-2xl text-lg text-muted font-light leading-relaxed mt-6">
        Sincroniza tus pistas, bar y tienda en una única pantalla de alto rendimiento. Diseñado para la velocidad, construido para el volumen.
      </motion.p>

      {/* CTAs */}
      <motion.div {...fade(1.1)} className="flex gap-4 mt-10">
        <a href="#gestion" className="bg-lime text-bg font-bold rounded-full px-8 py-4 text-base glow-lime hover:scale-105 transition-transform">
          Descubre el Sistema
        </a>
        <button className="flex items-center gap-2 text-text font-medium rounded-full px-8 py-4">
          <Eye size={20} />
          Explorar en 3D
        </button>
      </motion.div>

      {/* Dashboard preview */}
      <motion.div {...fade(1.4)}>
        <HeroDashboard />
      </motion.div>
    </section>
  )
}
