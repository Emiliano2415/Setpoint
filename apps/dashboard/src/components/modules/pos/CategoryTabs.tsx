'use client'

import { Tabs } from '@/components/ds'

interface CategoryTabsProps {
  categories: { id: string; label: string }[]
  active: string
  onChange: (id: string) => void
}

// Con muchas categorías la fila se desplaza en horizontal en lugar de encoger las pestañas
export function CategoryTabs({ categories, active, onChange }: CategoryTabsProps) {
  return (
    <div className="overflow-x-auto [&_[role=tablist]]:min-w-full [&_[role=tablist]]:w-max [&_button]:whitespace-nowrap">
      <Tabs
        value={active}
        onChange={onChange}
        tabs={categories.map((cat) => ({ value: cat.id, label: cat.label }))}
      />
    </div>
  )
}
