'use client'

import { motion } from 'framer-motion'
import { ReactNode } from 'react'

export default function FadeInBlurContainer({ children }: { children: ReactNode }) {
  return (
    <motion.div
      className="min-h-[100dvh] w-full flex flex-col items-center justify-center"
      initial={{ opacity: 0, filter: 'blur(20px)', y: 50 }}
      whileInView={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
      viewport={{ once: false, amount: 0.2 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="w-full">
        {children}
      </div>
    </motion.div>
  )
}
