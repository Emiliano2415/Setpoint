import Navbar from '@/components/Navbar'
import Hero from '@/components/Hero'
import Features from '@/components/Features'
import Dashboard from '@/components/Dashboard'
import BentoGrid from '@/components/BentoGrid'
import { FAQ } from '@/components/FAQ'
import { FinalCTA } from '@/components/FinalCTA'
import { Footer } from '@/components/Footer'
import ScrollExpansionHeroWrapper from '../components/ScrollExpansionHeroWrapper'
import FadeInBlurContainer from '../components/FadeInBlurContainer'

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
