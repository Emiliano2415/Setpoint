'use client'

import { ReactLenis } from 'lenis/react'
import { ReactNode } from 'react'

export default function SmoothScroll({ children }: { children: ReactNode }) {
  return (
    <ReactLenis
      root
      options={{
        lerp: 0.05, // Lower value = smoother, 'heavier' feel
        duration: 1.5, // Increase drag-out time
        smoothWheel: true,
      }}
    >
      {children}
    </ReactLenis>
  )
}
