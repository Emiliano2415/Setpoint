'use client'
import { useState } from 'react'

interface CardProps {
  children: React.ReactNode
  style?: React.CSSProperties
  className?: string
  padding?: string
}

export function Card({ children, style, className, padding = '20px' }: CardProps) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      className={className}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'rgba(22,28,16,0.6)',
        border: `1px solid ${hovered ? 'var(--color-border)' : 'var(--color-border-subtle)'}`,
        borderRadius: '16px',
        padding,
        transition: 'border-color 0.2s',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
      {children}
    </div>
  )
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
      {children}
    </span>
  )
}
