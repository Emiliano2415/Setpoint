'use client'

import { motion } from 'framer-motion'
import { FEATURES } from '@/lib/constants'
import FeatureCard from './FeatureCard'

export default function Features() {
  return (
    <section id="gestion" className="py-32 px-6">
      <div className="max-w-5xl mx-auto text-center">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          className="text-4xl font-black text-text"
        >
          Gestión Todo en{' '}
          <span className="font-display italic text-lime">Uno</span>
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          className="text-muted mt-4 max-w-2xl mx-auto"
        >
          Desde reservas hasta inventario. Un software integral diseñado para potenciar tu negocio.
        </motion.p>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.15 } },
          }}
          className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-16"
        >
          {FEATURES.map((feature) => (
            <motion.div
              key={feature.title}
              variants={{
                hidden: { opacity: 0, y: 30 },
                visible: { opacity: 1, y: 0 },
              }}
              whileHover={{ y: -4 }}
              transition={{ duration: 0.2 }}
            >
              <FeatureCard
                icon={feature.icon}
                title={feature.title}
                description={feature.description}
              />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
