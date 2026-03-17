'use client'

import { useEffect, useRef, useState } from 'react'

export default function CustomScrollbar() {
  const [thumbHeight, setThumbHeight] = useState(0)
  const [thumbTop, setThumbTop] = useState(0)
  const [visible, setVisible] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isDraggingRef = useRef(false)
  const [isDragging, setIsDragging] = useState(false)
  const dragStartY = useRef(0)
  const dragStartScroll = useRef(0)

  useEffect(() => {
    let rafId: number | null = null

    function update() {
      const doc = document.documentElement
      const scrollHeight = doc.scrollHeight
      const clientHeight = doc.clientHeight
      const scrollTop = doc.scrollTop || document.body.scrollTop

      const ratio = clientHeight / scrollHeight
      const height = Math.max(ratio * clientHeight, 40)
      const maxThumbTop = clientHeight - height
      const top = (scrollTop / (scrollHeight - clientHeight)) * maxThumbTop

      setThumbHeight(height)
      setThumbTop(top)
    }

    function onScroll() {
      // Throttle via rAF — at most 1 update per frame (~16ms)
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        update()
        setVisible(true)
        if (hideTimer.current) clearTimeout(hideTimer.current)
        hideTimer.current = setTimeout(() => setVisible(false), 1200)
        rafId = null
      })
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', update, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', update)
      if (hideTimer.current) clearTimeout(hideTimer.current)
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [])

  function onMouseDown(e: React.MouseEvent) {
    isDraggingRef.current = true
    setIsDragging(true)
    dragStartY.current = e.clientY
    dragStartScroll.current = document.documentElement.scrollTop || document.body.scrollTop

    function onMouseMove(ev: MouseEvent) {
      if (!isDraggingRef.current) return
      const doc = document.documentElement
      const scrollHeight = doc.scrollHeight
      const clientHeight = doc.clientHeight
      const maxThumbTop = clientHeight - thumbHeight
      const delta = ev.clientY - dragStartY.current
      const scrollDelta = (delta / maxThumbTop) * (scrollHeight - clientHeight)
      window.scrollTo({ top: dragStartScroll.current + scrollDelta })
    }

    function onMouseUp() {
      isDraggingRef.current = false
      setIsDragging(false)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    e.preventDefault()
  }

  // Don't render if page is not scrollable
  if (thumbHeight >= (typeof window !== 'undefined' ? window.innerHeight : 800)) return null

  return (
    <div
      className="fixed right-1.5 top-0 bottom-0 z-[9999] w-1.5 pointer-events-none"
      style={{ transition: 'opacity 0.3s ease', opacity: visible ? 1 : 0 }}
    >
      {/* Track */}
      <div className="absolute inset-0 rounded-full" style={{ background: 'rgba(40,53,28,0.3)' }} />
      {/* Thumb */}
      <div
        className="absolute left-0 right-0 rounded-full cursor-pointer pointer-events-auto"
        style={{
          top: thumbTop,
          height: thumbHeight,
          background: 'rgba(108,242,13,0.4)',
          transition: isDragging ? 'none' : 'top 0.05s linear',
        }}
        onMouseDown={onMouseDown}
        onMouseEnter={(e) => {
          ;(e.currentTarget as HTMLDivElement).style.background = 'rgba(108,242,13,0.75)'
        }}
        onMouseLeave={(e) => {
          ;(e.currentTarget as HTMLDivElement).style.background = 'rgba(108,242,13,0.4)'
        }}
      />
    </div>
  )
}
