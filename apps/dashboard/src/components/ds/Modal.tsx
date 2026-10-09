'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

const WIDTH = {
  sm: 'max-w-[480px]',
  md: 'max-w-[640px]',
  lg: 'max-w-[880px]',
} as const

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  /** Texto corto bajo el título */
  description?: string
  size?: keyof typeof WIDTH
  /** Pie: acción secundaria a la izquierda, principal a la derecha */
  footer?: ReactNode
  /** false mientras se guarda: ni Esc ni el fondo cierran */
  dismissable?: boolean
  children: ReactNode
}

export function Modal({
  open,
  onClose,
  title,
  description,
  size = 'sm',
  footer,
  dismissable = true,
  children,
}: ModalProps) {
  const panel = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const dismissableRef = useRef(dismissable)

  useEffect(() => {
    onCloseRef.current = onClose
    dismissableRef.current = dismissable
  })

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    panel.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissableRef.current) onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && dismissable) onClose()
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`flex max-h-[calc(100vh-32px)] w-full ${WIDTH[size]} flex-col rounded-xl border border-outline-variant bg-surface-container shadow-2xl outline-none`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-outline-variant px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-on-surface">{title}</h2>
            {description && <p className="mt-1 text-sm text-on-surface-variant">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={!dismissable}
            aria-label="Cerrar"
            className="rounded-md p-1 text-outline hover:bg-surface-container-highest hover:text-on-surface disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <footer className="flex items-center justify-between gap-3 border-t border-outline-variant px-6 py-4">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}
