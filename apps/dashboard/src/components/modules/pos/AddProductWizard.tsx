'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createProducto, type Categoria } from '@/lib/supabase/queries/pos'
import { toast } from 'sonner'

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

const CATEGORY_GRADIENT: Record<string, string> = {
  'img-drink': 'linear-gradient(135deg, #1a3a5c, #2563eb)',
  'img-coffee': 'linear-gradient(135deg, #3b1e08, #92400e)',
  'img-food': 'linear-gradient(135deg, #1a3a1a, #16a34a)',
  'img-paddle': 'linear-gradient(135deg, #1a1a3b, #7c3aed)',
  'img-balls': 'linear-gradient(135deg, #3b2a1a, #d97706)',
  'img-grip': 'linear-gradient(135deg, #1a1a1a, #4b5563)',
  'img-rental': 'linear-gradient(135deg, #1a2a3b, #0369a1)',
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

// ─── Props ────────────────────────────────────────────────────────────────────

export interface AddProductWizardProps {
  open: boolean
  categories: Categoria[]
  clubId: string
  onSuccess: () => void
  onCancel: () => void
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface Step1CategoriaProps {
  categories: Categoria[]
  selected: Categoria | null
  onSelect: (c: Categoria) => void
}

function Step1Categoria({ categories, selected, onSelect }: Step1CategoriaProps) {
  return (
    <div>
      <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginBottom: 16 }}>
        Selecciona una categoría
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10,
        }}
      >
        {categories.map((cat) => {
          const imgClass = IMG_CLASS_BY_CATEGORY[cat.nombre] ?? 'img-coffee'
          const gradient = CATEGORY_GRADIENT[imgClass] ?? CATEGORY_GRADIENT['img-coffee']
          const isSelected = selected?.id === cat.id
          return (
            <button
              key={cat.id}
              onClick={() => onSelect(cat)}
              style={{
                background: isSelected ? 'rgba(108,242,13,0.10)' : gradient,
                borderRadius: 12,
                padding: '14px 10px',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                position: 'relative',
                textAlign: 'center',
                outline: isSelected ? '2px solid var(--color-lime)' : 'none',
                outlineOffset: isSelected ? 2 : 0,
                transition: 'outline 0.15s',
                lineHeight: 1.3,
              }}
            >
              {isSelected && (
                <span
                  style={{
                    position: 'absolute',
                    top: 6,
                    right: 8,
                    fontSize: 12,
                    color: 'var(--color-lime)',
                  }}
                >
                  ✓
                </span>
              )}
              {cat.nombre}
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
  const inputStyle: React.CSSProperties = {
    padding: '12px 14px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg)',
    borderRadius: 10,
    color: 'var(--color-text)',
    fontSize: 15,
    width: '100%',
    boxSizing: 'border-box',
    outline: 'none',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Category info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
          Categoría: <strong style={{ color: 'var(--color-text)' }}>{categoryNombre}</strong>
        </span>
        <button
          onClick={onChangeCategory}
          style={{
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color: 'var(--color-lime)',
            fontSize: 12,
            textDecoration: 'underline',
            padding: 0,
          }}
        >
          ← Cambiar
        </button>
      </div>

      {/* Nombre */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={{ color: 'var(--color-text-muted)', fontSize: 13, fontWeight: 500 }}>
          Nombre del producto
        </label>
        <input
          autoFocus
          type="text"
          value={nombre}
          onChange={(e) => onNombreChange(e.target.value)}
          placeholder={placeholder}
          style={inputStyle}
        />
      </div>

      {/* Precio */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={{ color: 'var(--color-text-muted)', fontSize: 13, fontWeight: 500 }}>
          Precio (MXN)
        </label>
        <div style={{ position: 'relative' }}>
          <span
            style={{
              position: 'absolute',
              left: 14,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--color-text-muted)',
              fontSize: 15,
              pointerEvents: 'none',
            }}
          >
            $
          </span>
          <input
            type="number"
            min={0}
            step={0.5}
            value={precio}
            onChange={(e) => onPrecioChange(e.target.value)}
            placeholder="0.00"
            style={{
              ...inputStyle,
              paddingLeft: 30,
              fontFamily: 'var(--font-mono, monospace)',
            }}
          />
        </div>
      </div>
    </div>
  )
}

interface Step3ConfirmProps {
  nombre: string
  precio: number
  categoryNombre: string
  gradient: string
}

function Step3Confirm({ nombre, precio, categoryNombre, gradient }: Step3ConfirmProps) {
  const formatted = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(precio)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
        paddingTop: 8,
      }}
    >
      <p style={{ color: 'var(--color-text-muted)', fontSize: 13, margin: 0 }}>Vista previa</p>

      {/* Preview card */}
      <div
        style={{
          background: gradient,
          borderRadius: 12,
          padding: '20px 16px 16px',
          width: '100%',
          maxWidth: 280,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <p
          style={{
            color: '#fff',
            fontSize: 16,
            fontWeight: 700,
            margin: 0,
          }}
        >
          {nombre}
        </p>
        <p
          style={{
            color: 'rgba(255,255,255,0.7)',
            fontSize: 12,
            margin: 0,
          }}
        >
          {categoryNombre}
        </p>
        <p
          style={{
            color: 'var(--color-lime)',
            fontSize: 20,
            fontWeight: 700,
            margin: '8px 0 0',
            fontFamily: 'var(--font-mono, monospace)',
          }}
        >
          {formatted}
        </p>
      </div>

      <p
        style={{
          color: 'var(--color-text-muted-dim, var(--color-text-muted))',
          fontSize: 13,
          margin: 0,
        }}
      >
        ¿Todo correcto?
      </p>
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
  const gradient = CATEGORY_GRADIENT[imgClass] ?? CATEGORY_GRADIENT['img-coffee']
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

  // Step dots
  const stepDots = [1, 2, 3] as const

  // Footer right button label / disabled state
  const isLastStep = step === 3
  const rightDisabled =
    (step === 1 && !selectedCategory) ||
    (step === 2 && !step2Valid) ||
    (step === 3 && saving)
  const rightLabel = isLastStep ? (saving ? 'Guardando…' : '✓ Agregar al menú') : 'Continuar →'

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
      <div
        onClick={(e) => {
          if (e.target === e.currentTarget) onCancel()
        }}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1200,
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
        }}
      >
        {/* Modal card */}
        <div
          style={{
            background: 'var(--color-bg2)',
            border: '1px solid var(--color-border)',
            borderRadius: 16,
            maxWidth: 440,
            width: '100%',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '20px 24px 16px',
              borderBottom: '1px solid var(--color-border-subtle, var(--color-border))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--color-text)' }}>
                Nuevo producto
              </span>
              {/* Step dots */}
              <div style={{ display: 'flex', gap: 6 }}>
                {stepDots.map((dot) => {
                  const active = dot <= step
                  return (
                    <div
                      key={dot}
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: active ? 'var(--color-lime)' : 'transparent',
                        border: active
                          ? '1px solid var(--color-lime)'
                          : '1px solid var(--color-text-muted)',
                        transition: 'all 0.2s',
                      }}
                    />
                  )
                })}
              </div>
            </div>

            {/* Close button */}
            <button
              onClick={onCancel}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-text-muted)',
                fontSize: 20,
                lineHeight: 1,
                padding: '2px 6px',
              }}
            >
              ×
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: 24, minHeight: 280, overflow: 'hidden', position: 'relative' }}>
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
                  gradient={gradient}
                />
              )}
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '16px 24px',
              borderTop: '1px solid var(--color-border-subtle, var(--color-border))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            {/* Left button */}
            {step === 1 ? (
              <button
                onClick={onCancel}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  padding: '9px 16px',
                  color: 'var(--color-text)',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
            ) : (
              <button
                onClick={() => goBack()}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  padding: '9px 16px',
                  color: 'var(--color-text)',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                ← Atrás
              </button>
            )}

            {/* Right button */}
            <button
              onClick={handleRightClick}
              disabled={rightDisabled}
              style={{
                background: 'var(--color-lime)',
                border: 'none',
                borderRadius: 8,
                padding: '9px 18px',
                color: '#000',
                fontSize: 14,
                fontWeight: 700,
                cursor: rightDisabled ? 'not-allowed' : 'pointer',
                opacity: rightDisabled ? 0.4 : 1,
                transition: 'opacity 0.15s',
              }}
            >
              {rightLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
