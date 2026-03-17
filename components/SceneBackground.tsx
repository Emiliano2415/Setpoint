'use client'

import { MeshGradient } from '@paper-design/shaders-react'

export default function SceneBackground() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
        overflow: 'hidden',
      }}
    >
      {/* Primary MeshGradient — darker lime palette, black-dominant */}
      <MeshGradient
        style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
        colors={[
          '#080B06',   // near-black base
          '#0D1109',   // dark base (matches --color-bg)
          '#131a0c',   // very dark green
          '#2a4010',   // muted dark lime (much softer than raw #6CF20D)
        ]}
        speed={1.2}
        distortion={0.45}
        swirl={0.2}
        grainMixer={0.04}
        grainOverlay={0.06}
      />

      {/* Soft glow overlays for subtle depth — very low opacity */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-1/4 left-1/3 w-48 h-48 rounded-full blur-3xl animate-pulse"
          style={{
            backgroundColor: 'rgba(108, 242, 13, 0.025)',
            animationDuration: '5s',
          }}
        />
        <div
          className="absolute bottom-1/3 right-1/4 w-32 h-32 rounded-full blur-2xl animate-pulse"
          style={{
            backgroundColor: 'rgba(108, 242, 13, 0.018)',
            animationDuration: '3.3s',
            animationDelay: '1s',
          }}
        />
        <div
          className="absolute top-1/2 right-1/3 w-24 h-24 rounded-full blur-xl animate-pulse"
          style={{
            backgroundColor: 'rgba(108, 242, 13, 0.012)',
            animationDuration: '6.7s',
            animationDelay: '0.5s',
          }}
        />
      </div>

      {/* Dot grid overlay — preserved from original */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'radial-gradient(circle, rgba(108,242,13,0.09) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          maskImage:
            'radial-gradient(ellipse 90% 90% at 50% 50%, black 20%, transparent 100%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 90% 90% at 50% 50%, black 20%, transparent 100%)',
          opacity: 0.28,
        }}
      />
    </div>
  )
}
