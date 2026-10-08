'use client'

import { motion } from 'framer-motion'
import { Gauge, UtensilsCrossed, SquareStack, WifiOff, TrendingUp, ArrowRight } from 'lucide-react'
import { BENTO_CARDS } from '@/lib/constants'

const icons = {
  Gauge,
  UtensilsCrossed,
  SquareStack,
  WifiOff,
  TrendingUp,
} as const

const ease = [0.16, 1, 0.3, 1] as const

export default function BentoGrid() {
  return (
    <section id="servicio" className="py-32 px-6">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, ease }}
          className="text-center"
        >
          <h2 className="text-4xl font-black text-text">
            Operativa conectada,
            <br />
            <span className="font-display italic text-lime">rendimiento absoluto</span>
          </h2>
          <p className="text-muted mt-4 max-w-2xl mx-auto">
            Desde el bar hasta la pista central. Un ecosistema Setpoint diseñado para que la velocidad de cobro y la gestión del club nunca sean un obstáculo.
          </p>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.12 } },
          }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-16"
        >
          {/* Large card — spans 2 rows */}
          <BentoCard card={BENTO_CARDS[0]} className="md:row-span-2" />

          {/* Top right cards */}
          <BentoCard card={BENTO_CARDS[1]} />
          <BentoCard card={BENTO_CARDS[2]} />

          {/* Bottom row */}
          <BentoCard card={BENTO_CARDS[3]} />
          <BentoCard card={BENTO_CARDS[4]} />
        </motion.div>
      </div>
    </section>
  )
}

function BentoCard({
  card,
  className = '',
}: {
  card: (typeof BENTO_CARDS)[number]
  className?: string
}) {
  const IconComponent = icons[card.icon as keyof typeof icons]
  const isLarge = card.size === 'large'
  const isFeatured = card.size === 'featured'

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 30 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease } },
      }}
      whileHover={!isLarge ? { y: -3, transition: { type: 'tween', duration: 0.15 } } : undefined}
      className={`glass-card relative overflow-hidden ${isLarge ? 'p-8 flex flex-col' : 'p-6'} ${
        isFeatured ? '!border-lime-30' : ''
      } ${className}`}
    >
      {isLarge && (
        <div className="absolute top-0 right-0 w-48 h-48 bg-lime rounded-full blur-[80px] opacity-10 pointer-events-none" />
      )}

      <div className="bg-lime-20 rounded-xl p-3 w-fit relative z-10">
        {IconComponent && <IconComponent size={24} className="text-lime" />}
      </div>

      <div className={isLarge ? 'mt-auto relative z-10' : 'mt-4'}>
        <h3 className={`${isLarge ? 'text-xl' : 'text-lg'} font-bold text-text`}>
          {card.title}
        </h3>
        <p className="text-sm text-muted mt-2 leading-relaxed">{card.description}</p>
      </div>

      {isFeatured && (
        <a href="#servicio" className="text-lime text-sm font-medium flex items-center gap-1 mt-4 hover:gap-2 transition-all">
          Ver Dashboard
          <ArrowRight size={14} />
        </a>
      )}
    </motion.div>
  )
}
