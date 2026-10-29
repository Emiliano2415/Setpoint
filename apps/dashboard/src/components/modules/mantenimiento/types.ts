// Tipos compartidos de las pantallas de Mantenimiento.
// Los datos y las funciones vienen de '@/lib/supabase/queries/mantenimiento'.

export type MantenimientoTab = 'tablero' | 'preventivo' | 'ordenes' | 'inspecciones' | 'refacciones'

export const MANTENIMIENTO_TABS: { value: MantenimientoTab; label: string }[] = [
  { value: 'tablero', label: 'Tablero' },
  { value: 'preventivo', label: 'Plan preventivo' },
  { value: 'ordenes', label: 'Órdenes de trabajo' },
  { value: 'inspecciones', label: 'Inspecciones' },
  { value: 'refacciones', label: 'Refacciones' },
]

/** Periodos que ofrece el selector del tablero (días hacia atrás, contando hoy). */
export const PERIODOS_DIAS = [7, 30, 90] as const
export type PeriodoDias = (typeof PERIODOS_DIAS)[number]
