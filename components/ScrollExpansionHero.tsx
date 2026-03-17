'use client'

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { Volleyball } from 'lucide-react'

interface ScrollExpansionHeroProps {
  children: ReactNode
  videoSrc: string
  bgImageSrc: string
  title?: string
  scrollHint?: string
}

export default function ScrollExpansionHero({
  children,
  videoSrc,
  bgImageSrc,
  title = 'Setpoint',
  scrollHint = 'Scroll para explorar',
}: ScrollExpansionHeroProps) {
  const [scrollProgress, setScrollProgress] = useState(0)
  const [isExpanded, setIsExpanded] = useState(false)
  const [touchStartY, setTouchStartY] = useState(0)
  const [isMobile, setIsMobile] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Check device
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Scroll hijacking
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (isExpanded) {
        if (e.deltaY < 0 && window.scrollY <= 5) {
          setIsExpanded(false)
          e.preventDefault()
        }
        return
      }

      e.preventDefault()
      const delta = e.deltaY * 0.0012
      const next = Math.min(Math.max(scrollProgress + delta, 0), 1)
      setScrollProgress(next)

      if (next >= 1) {
        setIsExpanded(true)
      }
    }

    const handleTouchStart = (e: TouchEvent) => {
      setTouchStartY(e.touches[0].clientY)
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchStartY) return
      const deltaY = touchStartY - e.touches[0].clientY

      if (isExpanded) {
        if (deltaY < -20 && window.scrollY <= 5) {
          setIsExpanded(false)
          e.preventDefault()
        }
        return
      }

      e.preventDefault()
      const factor = deltaY < 0 ? 0.008 : 0.005
      const next = Math.min(Math.max(scrollProgress + deltaY * factor, 0), 1)
      setScrollProgress(next)

      if (next >= 1) {
        setIsExpanded(true)
      }

      setTouchStartY(e.touches[0].clientY)
    }

    const handleTouchEnd = () => setTouchStartY(0)

    const handleScroll = () => {
      if (!isExpanded) window.scrollTo(0, 0)
    }

    window.addEventListener('wheel', handleWheel, { passive: false })
    window.addEventListener('scroll', handleScroll)
    window.addEventListener('touchstart', handleTouchStart, { passive: false })
    window.addEventListener('touchmove', handleTouchMove, { passive: false })
    window.addEventListener('touchend', handleTouchEnd)

    return () => {
      window.removeEventListener('wheel', handleWheel)
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
    }
  }, [scrollProgress, isExpanded, touchStartY])

  // --- Derived animation values ---
  const expandW = isMobile
    ? 280 + scrollProgress * 600
    : 380 + scrollProgress * 1200
  const expandH = isMobile
    ? 200 + scrollProgress * 400
    : 260 + scrollProgress * 560

  // Text splitting — title words split left/right
  const textShift = scrollProgress * (isMobile ? 120 : 100)

  // Background image fades out as video expands
  const bgOpacity = Math.max(1 - scrollProgress * 1.2, 0)

  // Video overlay dims less as it expands
  const overlayOpacity = 0.4 - scrollProgress * 0.3

  // Hint text fades quickly
  const hintFade = scrollProgress < 0.1
    ? 1
    : Math.max(1 - (scrollProgress - 0.1) * 5, 0)

  // Title text fade
  const titleFade = Math.max(1 - scrollProgress * 2.5, 0)

  // Split title into two lines at the period-space boundary
  const dotIdx = title.indexOf('. ')
  const firstLine = dotIdx >= 0 ? title.slice(0, dotIdx + 1) : title
  const secondLine = dotIdx >= 0 ? title.slice(dotIdx + 2) : ''

  return (
    <div className="overflow-x-hidden relative">
      {/* ═══ IMMERSIVE HERO SECTION ═══ */}
      <section className="relative flex flex-col items-center justify-start min-h-[100dvh]">
        <div className="relative w-full flex flex-col items-center min-h-[100dvh]">

          {/* ── Background Image ── */}
          <motion.div
            className="absolute inset-0 z-0 h-full bg-[#0a0f0d]"
            style={{ opacity: bgOpacity }}
          >
            <Image
              src={bgImageSrc}
              alt="Padel Club"
              fill
              className="object-cover blur-[1px] opacity-90 scale-105"
              priority
            />
            {/* Dark overlays to create night atmospheric effect (reduced) */}
            <div className="absolute inset-0 bg-black/20" />
            <div className="absolute inset-0 bg-gradient-to-b from-[#0a0f0d]/40 via-transparent to-[#0a0f0d]/80" />
          </motion.div>

          {/* ── Center content ── */}
          <div className="container mx-auto flex flex-col items-center justify-start relative z-10 w-full">
            <div className="flex flex-col items-center justify-center w-full min-h-[100dvh] relative">

              {/* ── Top Title: Control Total. ── */}
              <motion.div
                className="absolute z-10 w-full flex justify-center pointer-events-none"
                style={{
                  top: `calc(50% - ${expandH / 2 + 40 + textShift}px)`,
                  opacity: titleFade,
                  y: '-100%',
                }}
              >
                <h2 className="text-4xl md:text-6xl lg:text-7xl font-black text-white text-center drop-shadow-2xl">
                  {firstLine}
                </h2>
              </motion.div>

              {/* ── Expanding Video Container ── */}
              <div
                className="absolute z-0 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 will-change-[width,height]"
                style={{
                  width: `${expandW}px`,
                  height: `${expandH}px`,
                  maxWidth: '100vw',
                  maxHeight: '100vh',
                  boxShadow: '0px 0px 80px rgba(0, 0, 0, 0.6)',
                  borderRadius: isExpanded ? '0' : '24px',
                  transition: 'border-radius 0.3s ease-out',
                }}
              >
                <div 
                  className="relative w-full h-full overflow-hidden"
                  style={{ borderRadius: isExpanded ? '0' : '24px', transition: 'border-radius 0.3s ease-out' }}
                >
                  {/* Video */}
                  <video
                    ref={videoRef}
                    src={videoSrc}
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="auto"
                    className="w-full h-full object-cover"
                    disablePictureInPicture
                  />

                  {/* Dark overlay on video — fades as it expands */}
                  <motion.div
                    className="absolute inset-0 bg-black/40 pointer-events-none"
                    style={{ opacity: overlayOpacity }}
                  />
                </div>
              </div>

              {/* ── Bottom Title: Cero Fricción. ── */}
              {secondLine && (
                <motion.div
                  className="absolute z-10 w-full flex justify-center pointer-events-none"
                  style={{
                    top: `calc(50% + ${expandH / 2 + 30 + textShift}px)`,
                    opacity: titleFade,
                  }}
                >
                  <h2 className="text-4xl md:text-6xl lg:text-7xl font-display italic text-lime text-center drop-shadow-2xl">
                    {secondLine}
                  </h2>
                </motion.div>
              )}

              {/* ── Scroll indicator (Logo + Text hint) ── */}
              <motion.div
                className="absolute bottom-8 flex flex-col items-center gap-3 z-20 pointer-events-none"
                style={{ opacity: hintFade }}
              >
                {/* Custom glowing pill with Logo + Text matching Navbar */}
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-black/40 backdrop-blur-md border border-white/10 shadow-lg">
                  <div className="bg-lime/10 p-1.5 rounded-lg">
                    <Volleyball className="w-4 h-4 text-lime" />
                  </div>
                  <span className="font-semibold text-sm tracking-tight text-white/95">
                    {scrollHint}
                  </span>
                </div>
                
                <motion.div
                  className="w-5 h-8 rounded-full border border-white/30 flex items-start justify-center p-1"
                >
                  <motion.div
                    className="w-1 h-2 bg-lime/60 rounded-full"
                    animate={{ y: [0, 10, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                  />
                </motion.div>
              </motion.div>

            </div>
          </div>
        </div>
      </section>

      {/* ═══ FULL LANDING PAGE — revealed after expansion ═══ */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: isExpanded ? 1 : 0 }}
        transition={{ duration: 0.7 }}
        style={{ pointerEvents: isExpanded ? 'auto' : 'none' }}
      >
        {children}
      </motion.div>
    </div>
  )
}
