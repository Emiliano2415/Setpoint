'use client'

import { motion } from 'framer-motion'

const ease = [0.16, 1, 0.3, 1] as const

export function FinalCTA() {
  return (
    <section id="contacto" className="py-32 px-6 relative overflow-hidden">
      {/* Glow background */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[600px] h-[400px] bg-lime rounded-full blur-[120px] opacity-[0.07] animate-glow-pulse" />
      </div>

      <div className="max-w-3xl mx-auto text-center relative z-10">
        <motion.h2
          className="text-4xl md:text-5xl font-black text-text"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, ease }}
        >
          Moderniza la{' '}
          <span className="font-display italic text-lime">
            Caja de tu Club
          </span>
        </motion.h2>

        <motion.p
          className="text-muted mt-6 max-w-xl mx-auto leading-relaxed"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, delay: 0.15, ease }}
        >
          Hardware premium y software de última generación trabajando en sintonía. Solicita presupuesto a medida hoy mismo.
        </motion.p>

        <motion.div
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, delay: 0.3, ease }}
        >
          <motion.a
            href="#"
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="bg-lime text-bg font-bold rounded-full px-8 py-4 text-sm glow-lime"
          >
            Solicitar Demo de Setpoint
          </motion.a>
          <motion.a
            href="#"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="border border-border text-text font-medium rounded-full px-8 py-4 text-sm hover:bg-bg2 transition-colors"
          >
            Ver Especificaciones
          </motion.a>
        </motion.div>
      </div>
    </section>
  )
}
