'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createProducto, type Categoria } from '@/lib/supabase/queries/pos'
import { toast } from 'sonner'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Coffee,
  Dumbbell,
  GlassWater,
  Hand,
  Package,
  Sandwich,
  Volleyball,
  type LucideIcon,
} from 'lucide-react'
import { Button, Field, Input, Modal, Money, Stepper } from '@/components/ds'

// ─── Constants ────────────────────────────────────────────────────────────────

const IMG_CLASS_BY_CATEGORY: Record<string, string> = {
  Bebidas: 'img-drink',
  Café: 'img-coffee',
  Snacks: 'img-food',
  Comida: 'img-food',
  Palas: 'img-paddle',
  Pelotas: 'img-balls',
  Accesorios: 'img-grip',
  Ropa: 'img-grip',
  Alimentos: 'img-food',
  Cafetería: 'img-coffee',
  'Renta de Equipo': 'img-rental',
}

const PLACEHOLDER_BY_CLASS: Record<string, string> = {
  'img-drink': 'Ej: Agua Mineral 600ml',
  'img-coffee': 'Ej: Cappuccino',
  'img-food': 'Ej: Bowl Proteico',
  'img-paddle': 'Ej: Pala Head Flash',
  'img-balls': 'Ej: Pelotas Head 3-pack',
  'img-grip': 'Ej: Overgrip x3',
  'img-rental': 'Ej: Raqueta de alquiler',
}

const ICON_BY_CLASS: Record<string, LucideIcon> = {
  'img-drink': GlassWater,
  'img-coffee': Coffee,
  'img-food': Sandwich,
  'img-paddle': Dumbbell,
  'img-balls': Volleyball,
  'img-grip': Hand,
  'img-rental': Package,
}

const STEP_LABELS = ['Categoría', 'Nombre y precio', 'Confirmar']

// ─── Props ────────────────────────────────────────────────────────────────────

export interface AddProductWizardProps {
  open: boolean
  categories: Categoria[]
  clubId: string
  onSuccess: () => void
  onCancel: () => void
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CategoryIcon({ nombre, size }: { nombre: string; size: number }) {
  const imgClass = IMG_CLASS_BY_CATEGORY[nombre] ?? 'img-coffee'
  const Icon: LucideIcon = ICON_BY_CLASS[imgClass] ?? Coffee
  return <Icon size={size} />
}

interface Step1CategoriaProps {
  categories: Categoria[]
  selected: Categoria | null
  onSelect: (c: Categoria) => void
}

function Step1Categoria({ categories, selected, onSelect }: Step1CategoriaProps) {
  return (
    <div>
      <p className="mb-4 text-sm text-outline">Selecciona una categoría</p>
      <div className="grid grid-cols-2 gap-3">
        {categories.map((cat) => {
          const isSelected = selected?.id === cat.id
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelect(cat)}
              className={`group flex items-center gap-3 rounded-xl border-2 bg-surface-container-high p-4 text-left transition-colors ${isSelected ? 'border-primary shadow-sm' : 'border-outline-variant hover:border-outline'}`}
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${isSelected ? 'border-primary/40 bg-primary-container text-primary' : 'border-outline-variant bg-surface-container-highest text-outline group-hover:text-primary'}`}
              >
                <CategoryIcon nombre={cat.nombre} size={22} />
              </div>
              <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                <p
                  className={`truncate text-sm ${isSelected ? 'font-semibold text-on-surface' : 'font-medium text-on-surface'}`}
                >
                  {cat.nombre}
                </p>
                {isSelected && (
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary">
                    <Check size={14} />
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface Step2NombrePrecioProps {
  nombre: string
  precio: string
  placeholder: string
  categoryNombre: string
  onNombreChange: (v: string) => void
  onPrecioChange: (v: string) => void
  onChangeCategory: () => void
}

function Step2NombrePrecio({
  nombre,
  precio,
  placeholder,
  categoryNombre,
  onNombreChange,
  onPrecioChange,
  onChangeCategory,
}: Step2NombrePrecioProps) {
  return (
    <div className="flex flex-col gap-5">
      {/* Category info */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-on-surface-variant">
          <span>Categoría:</span>
          <span className="flex items-center gap-1.5 rounded border border-outline-variant bg-surface-container-highest px-2 py-0.5 font-medium text-primary">
            <CategoryIcon nombre={categoryNombre} size={14} />
            {categoryNombre}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={onChangeCategory}>
          <ArrowLeft size={14} />
          Cambiar
        </Button>
      </div>

      {/* Nombre */}
      <Field label="Nombre del producto" htmlFor="producto-nombre">
        <Input
          id="producto-nombre"
          autoFocus
          type="text"
          value={nombre}
          onChange={(e) => onNombreChange(e.target.value)}
          placeholder={placeholder}
        />
      </Field>

      {/* Precio */}
      <Field label="Precio (MXN)" htmlFor="producto-precio">
        <Input
          id="producto-precio"
          type="number"
          min={0}
          step={0.5}
          value={precio}
          onChange={(e) => onPrecioChange(e.target.value)}
          placeholder="0.00"
          prefix="$"
          className="tabular-nums"
        />
      </Field>
    </div>
  )
}

interface Step3ConfirmProps {
  nombre: string
  precio: number
  categoryNombre: string
}

function Step3Confirm({ nombre, precio, categoryNombre }: Step3ConfirmProps) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-outline">Vista previa</p>

      {/* Resumen */}
      <div className="divide-y divide-outline-variant overflow-hidden rounded-lg border border-outline-variant bg-surface-container-low">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <span className="text-xs text-on-surface-variant">Categoría</span>
          <span className="flex items-center gap-1.5 rounded border border-outline-variant bg-surface-container-highest px-2 py-0.5 text-xs font-medium text-primary">
            <CategoryIcon nombre={categoryNombre} size={14} />
            {categoryNombre}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <span className="text-xs text-on-surface-variant">Nombre</span>
          <span className="min-w-0 text-right text-sm font-semibold text-on-surface">{nombre}</span>
        </div>
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <span className="text-xs text-on-surface-variant">Precio</span>
          <Money value={precio} className="text-sm font-semibold text-on-surface" />
        </div>
      </div>

      <p className="text-sm text-outline">¿Todo correcto?</p>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AddProductWizard({
  open,
  categories,
  clubId,
  onSuccess,
  onCancel,
}: AddProductWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [direction, setDirection] = useState<'forward' | 'back'>('forward')
  const [selectedCategory, setSelectedCategory] = useState<Categoria | null>(null)
  const [nombre, setNombre] = useState('')
  const [precio, setPrecio] = useState('')
  const [saving, setSaving] = useState(false)

  // Reset state when wizard opens
  useEffect(() => {
    if (open) {
      setStep(1)
      setDirection('forward')
      setSelectedCategory(null)
      setNombre('')
      setPrecio('')
      setSaving(false)
    }
  }, [open])

  if (!open) return null

  // Derived values
  const imgClass = selectedCategory
    ? (IMG_CLASS_BY_CATEGORY[selectedCategory.nombre] ?? 'img-coffee')
    : 'img-coffee'
  const placeholder = PLACEHOLDER_BY_CLASS[imgClass] ?? 'Nombre del producto'
  const precioNum = parseFloat(precio)
  const step2Valid = nombre.trim().length >= 2 && !isNaN(precioNum) && precioNum > 0

  // Navigation
  function goForward() {
    setDirection('forward')
    setStep(s => (s < 3 ? (s + 1) as 1 | 2 | 3 : s))
  }
  function goBack() {
    setDirection('back')
    setStep(s => (s > 1 ? (s - 1) as 1 | 2 | 3 : s))
  }

  // Save
  async function handleSave() {
    if (!selectedCategory || !step2Valid) return
    setSaving(true)
    try {
      const supabase = createClient()
      await createProducto(supabase, clubId, {
        nombre: nombre.trim(),
        precio: precioNum,
        categoria_id: selectedCategory.id,
      })
      onSuccess()
    } catch (err) {
      console.error('[AddProductWizard] save failed:', err)
      toast.error('No se pudo agregar el producto')
    } finally {
      setSaving(false)
    }
  }

  // Footer right button label / disabled state
  const isLastStep = step === 3
  const rightDisabled =
    (step === 1 && !selectedCategory) ||
    (step === 2 && !step2Valid) ||
    (step === 3 && saving)
  const rightLabel = isLastStep ? (saving ? 'Guardando…' : 'Agregar al menú') : 'Continuar'

  function handleRightClick() {
    if (step === 1 && selectedCategory) goForward()
    else if (step === 2 && step2Valid) goForward()
    else if (step === 3) handleSave()
  }

  return (
    <>
      <style>{`
        @keyframes slideInFromRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes slideInFromLeft { from { transform: translateX(-100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .wizard-step-forward { animation: slideInFromRight 200ms ease-out; }
        .wizard-step-back { animation: slideInFromLeft 200ms ease-out; }
      `}</style>
      <Modal
        open={open}
        onClose={onCancel}
        title="Nuevo producto"
        size="md"
        footer={
          <>
            {step === 1 ? (
              <Button variant="ghost" onClick={onCancel}>
                Cancelar
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => goBack()}>
                <ArrowLeft size={16} />
                Atrás
              </Button>
            )}

            <Button variant="primary" onClick={handleRightClick} disabled={rightDisabled}>
              {isLastStep ? (
                <>
                  {!saving && <Check size={16} />}
                  {rightLabel}
                </>
              ) : (
                <>
                  {rightLabel}
                  <ArrowRight size={16} />
                </>
              )}
            </Button>
          </>
        }
      >
        <Stepper steps={STEP_LABELS} current={step - 1} />

        <div className="mt-6 overflow-hidden">
          <div
            key={step}
            className={direction === 'forward' ? 'wizard-step-forward' : 'wizard-step-back'}
          >
            {step === 1 && (
              <Step1Categoria
                categories={categories}
                selected={selectedCategory}
                onSelect={(c) => setSelectedCategory(c)}
              />
            )}
            {step === 2 && (
              <Step2NombrePrecio
                nombre={nombre}
                precio={precio}
                placeholder={placeholder}
                categoryNombre={selectedCategory?.nombre ?? ''}
                onNombreChange={setNombre}
                onPrecioChange={setPrecio}
                onChangeCategory={() => goBack()}
              />
            )}
            {step === 3 && (
              <Step3Confirm
                nombre={nombre.trim()}
                precio={precioNum}
                categoryNombre={selectedCategory?.nombre ?? ''}
              />
            )}
          </div>
        </div>
      </Modal>
    </>
  )
}
