'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  createProductoInventario,
  updateProductoInventario,
  getCategoriasInventario,
} from '@/lib/supabase/queries/inventario'
import { toast } from 'sonner'

interface ProductFormData {
  id?: string
  nombre: string
  precio: number
  categoria_id: string
  descripcion?: string | null
  stock_actual: number
  stock_minimo: number
  requiere_stock: boolean
  iva_rate: number
  activo?: boolean
}

interface Props {
  clubId: string
  producto?: ProductFormData | null
  onClose: () => void
  onSuccess: () => void
}

interface Categoria {
  id: string
  nombre: string
  orden: number
}

function fmtLabel(s: string) {
  return s.toUpperCase()
}

export function ProductFormModal({ clubId, producto, onClose, onSuccess }: Props) {
  const isEdit = !!producto?.id
  const [categorias, setCategorias] = useState<Categoria[]>([])

  const [nombre, setNombre] = useState(producto?.nombre ?? '')
  const [precio, setPrecio] = useState(producto?.precio != null ? String(producto.precio) : '')
  const [categoriaId, setCategoriaId] = useState(producto?.categoria_id ?? '')
  const [descripcion, setDescripcion] = useState(producto?.descripcion ?? '')
  const [stockActual, setStockActual] = useState(producto?.stock_actual != null ? String(producto.stock_actual) : '0')
  const [stockMinimo, setStockMinimo] = useState(producto?.stock_minimo != null ? String(producto.stock_minimo) : '0')
  const [requiereStock, setRequiereStock] = useState(producto?.requiere_stock ?? false)
  const [ivaRate, setIvaRate] = useState(producto?.iva_rate != null ? String(Math.round(producto.iva_rate * 100)) : '16')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    getCategoriasInventario(supabase, clubId).then(({ data }) => {
      if (data) setCategorias(data as Categoria[])
    })
  }, [clubId])

  const isValid = nombre.trim().length > 0 && parseFloat(precio) > 0 && categoriaId !== ''

  async function handleSave() {
    if (!isValid) return
    setSaving(true)
    try {
      const supabase = createClient()
      if (isEdit && producto?.id) {
        await updateProductoInventario(supabase, producto.id, {
          nombre: nombre.trim(),
          precio: parseFloat(precio),
          categoria_id: categoriaId,
          descripcion: descripcion.trim() || null,
          stock_minimo: parseInt(stockMinimo) || 0,
          requiere_stock: requiereStock,
          iva_rate: parseFloat(ivaRate) / 100,
        })
        toast.success('Producto actualizado')
      } else {
        await createProductoInventario(supabase, clubId, {
          nombre: nombre.trim(),
          precio: parseFloat(precio),
          categoria_id: categoriaId,
          descripcion: descripcion.trim() || null,
          stock_actual: parseInt(stockActual) || 0,
          stock_minimo: parseInt(stockMinimo) || 0,
          requiere_stock: requiereStock,
          iva_rate: parseFloat(ivaRate) / 100,
        })
        toast.success('Producto creado')
      }
      onSuccess()
    } catch (err) {
      console.error(err)
      toast.error('Error al guardar el producto')
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--color-bg2)',
        border: '1px solid var(--color-border)',
        borderRadius: '16px', width: '440px',
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid var(--color-border-subtle)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          position: 'sticky', top: 0, background: 'var(--color-bg2)', zIndex: 1,
        }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {isEdit ? 'Editar Producto' : 'Nuevo Producto'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '2px' }}>
              {isEdit ? 'Actualiza nombre, precio o categoría' : 'Agrega un producto al catálogo'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', padding: '4px' }}>
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Nombre */}
          <div>
            <label style={labelStyle}>{fmtLabel('Nombre del producto')}</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Isotónico 600ml"
              autoFocus
              style={inputStyle}
            />
          </div>

          {/* Precio + IVA */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>{fmtLabel('Precio (MXN)')}</label>
              <input
                type="number"
                value={precio}
                onChange={(e) => setPrecio(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>{fmtLabel('IVA %')}</label>
              <select
                value={ivaRate}
                onChange={(e) => setIvaRate(e.target.value)}
                style={inputStyle}
              >
                <option value="0">Sin IVA (0%)</option>
                <option value="8">8%</option>
                <option value="16">16%</option>
              </select>
            </div>
          </div>

          {/* Categoría */}
          <div>
            <label style={labelStyle}>{fmtLabel('Categoría')}</label>
            <select
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              style={inputStyle}
            >
              <option value="">Selecciona una categoría…</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>

          {/* Descripción */}
          <div>
            <label style={labelStyle}>{fmtLabel('Descripción (opcional)')}</label>
            <input
              type="text"
              value={descripcion ?? ''}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Breve descripción…"
              style={inputStyle}
            />
          </div>

          {/* Requiere stock toggle */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 14px', background: 'var(--color-bg)',
            borderRadius: '10px', border: '1px solid var(--color-border-subtle)',
          }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700 }}>Control de stock</div>
              <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '2px' }}>
                Requiere seguimiento de inventario
              </div>
            </div>
            <button
              onClick={() => setRequiereStock(!requiereStock)}
              style={{
                width: '42px', height: '24px', borderRadius: '12px',
                background: requiereStock ? 'var(--color-lime)' : 'var(--color-border)',
                border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
              }}
            >
              <span style={{
                position: 'absolute', top: '3px',
                left: requiereStock ? '20px' : '3px',
                width: '18px', height: '18px', borderRadius: '50%',
                background: 'var(--color-bg)', transition: 'left 0.2s',
              }} />
            </button>
          </div>

          {/* Stock fields (solo si requiere stock) */}
          {requiereStock && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {!isEdit && (
                <div>
                  <label style={labelStyle}>{fmtLabel('Stock inicial')}</label>
                  <input
                    type="number"
                    value={stockActual}
                    onChange={(e) => setStockActual(e.target.value)}
                    placeholder="0"
                    min="0"
                    style={inputStyle}
                  />
                </div>
              )}
              <div style={isEdit ? { gridColumn: '1 / -1' } : {}}>
                <label style={labelStyle}>{fmtLabel('Stock mínimo')}</label>
                <input
                  type="number"
                  value={stockMinimo}
                  onChange={(e) => setStockMinimo(e.target.value)}
                  placeholder="0"
                  min="0"
                  style={inputStyle}
                />
              </div>
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '4px' }}>
            <button onClick={onClose} style={cancelBtnStyle}>Cancelar</button>
            <button
              onClick={handleSave}
              disabled={saving || !isValid}
              style={{
                padding: '13px',
                background: saving || !isValid ? 'rgba(108,242,13,0.3)' : 'var(--color-lime)',
                border: 'none', borderRadius: '10px',
                color: 'var(--color-bg)', fontSize: '13px', fontWeight: 800,
                cursor: saving || !isValid ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.3px',
              }}
            >
              {saving ? 'Guardando…' : isEdit ? 'Guardar Cambios' : 'Crear Producto'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '10px', fontWeight: 700,
  color: 'var(--color-muted)', textTransform: 'uppercase',
  letterSpacing: '0.5px', marginBottom: '8px',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  background: 'var(--color-bg)', border: '1px solid var(--color-border)',
  borderRadius: '8px', color: 'var(--color-text)',
  fontSize: '13px', fontFamily: 'inherit',
  outline: 'none', boxSizing: 'border-box',
}

const cancelBtnStyle: React.CSSProperties = {
  padding: '13px', background: 'var(--color-bg)',
  border: '1px solid var(--color-border)', borderRadius: '10px',
  color: 'var(--color-muted)', fontSize: '13px', fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit',
}
