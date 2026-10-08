'use client'

import { type ReactNode } from 'react'
import ScrollExpansionHero from './ScrollExpansionHero'

export default function ScrollExpansionHeroWrapper({ children }: { children: ReactNode }) {
  return (
    <ScrollExpansionHero
      videoSrc="/videostockpadel.mp4"
      bgImageSrc="/padel-top-down.jpg"
      title="Gestión Inteligente. Rendimiento Total."
      scrollHint="Scroll para descubrir Setpoint"
    >
      {children}
    </ScrollExpansionHero>
  )
}
