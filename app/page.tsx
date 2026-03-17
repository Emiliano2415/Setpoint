import dynamic from 'next/dynamic'
import Navbar from '@/components/Navbar'
import Hero from '@/components/Hero'
import ScrollExpansionHeroWrapper from '../components/ScrollExpansionHeroWrapper'
import FadeInBlurContainer from '../components/FadeInBlurContainer'

// Secciones below-the-fold — lazy loaded para reducir bundle inicial
const Features = dynamic(() => import('@/components/Features'))
const Dashboard = dynamic(() => import('@/components/Dashboard'))
const BentoGrid = dynamic(() => import('@/components/BentoGrid'))
const FAQ = dynamic(() => import('@/components/FAQ').then(m => ({ default: m.FAQ })))
const FinalCTA = dynamic(() => import('@/components/FinalCTA').then(m => ({ default: m.FinalCTA })))
const Footer = dynamic(() => import('@/components/Footer').then(m => ({ default: m.Footer })))

export default function Home() {
  return (
    <main>
      <ScrollExpansionHeroWrapper>
        <Navbar />
        <FadeInBlurContainer><Hero /></FadeInBlurContainer>
        <FadeInBlurContainer><Features /></FadeInBlurContainer>
        <FadeInBlurContainer><Dashboard /></FadeInBlurContainer>
        <FadeInBlurContainer><BentoGrid /></FadeInBlurContainer>
        <FadeInBlurContainer><FAQ /></FadeInBlurContainer>
        <FadeInBlurContainer><FinalCTA /></FadeInBlurContainer>
        <div><Footer /></div>
      </ScrollExpansionHeroWrapper>
    </main>
  )
}
