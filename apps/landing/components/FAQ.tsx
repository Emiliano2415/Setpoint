'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { FAQ_ITEMS } from '@/lib/constants'

const ease = [0.16, 1, 0.3, 1] as const

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div
      className="border border-border rounded-xl overflow-hidden"
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-bg2/50 transition-colors"
      >
        <span className="text-sm text-text font-medium pr-4">{question}</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.3 }}
        >
          <ChevronDown size={18} className="text-muted shrink-0" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease }}
          >
            <div className="px-6 pb-5 text-sm text-muted leading-relaxed">
              {answer}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function FAQ() {
  return (
    <section id="faq" className="py-32 px-6">
      <div className="max-w-3xl mx-auto">
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, ease }}
        >
          <h2 className="text-4xl font-black text-text">
            Preguntas Frecuentes
          </h2>
          <p className="text-muted mt-4 max-w-2xl mx-auto">
            Encuentra respuestas rápidas a los problemas y situaciones cotidianas al usar Setpoint en tu club.
          </p>
        </motion.div>

        <motion.div
          className="mt-12 flex flex-col gap-3"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.1 } },
          }}
        >
          {FAQ_ITEMS.map((item) => (
            <motion.div
              key={item.question}
              variants={{
                hidden: { opacity: 0, y: 20 },
                visible: { opacity: 1, y: 0 },
              }}
              transition={{ duration: 0.5, ease }}
            >
              <FAQItem question={item.question} answer={item.answer} />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
