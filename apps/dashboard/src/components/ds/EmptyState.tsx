import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  action?: ReactNode
}

export function EmptyState({ icon, title, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <div className="text-outline [&_svg]:size-8">{icon}</div>
      <p className="text-sm text-on-surface-variant">{title}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
