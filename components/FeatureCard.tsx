import { CalendarCheck, Users, Store } from 'lucide-react'

const icons = {
  CalendarCheck,
  Users,
  Store,
} as const

interface FeatureCardProps {
  icon: string
  title: string
  description: string
}

export default function FeatureCard({ icon, title, description }: FeatureCardProps) {
  const IconComponent = icons[icon as keyof typeof icons]

  return (
    <div className="flex flex-col items-center text-center gap-4">
      <div className="w-12 h-12 bg-bg2 border border-border rounded-xl flex items-center justify-center">
        {IconComponent && <IconComponent size={24} className="text-lime" />}
      </div>
      <h3 className="text-lg font-bold text-text">{title}</h3>
      <p className="text-sm text-muted leading-relaxed">{description}</p>
    </div>
  )
}
