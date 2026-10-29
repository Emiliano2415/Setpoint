'use client'

import { useState, useEffect, useMemo } from 'react'
import { Check, Plus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  getAllProducts,
  getCategories,
  updateProducto,
} from '@/lib/supabase/queries/pos'
import type { Producto, Categoria } from '@/lib/supabase/queries/pos'
import { toast } from 'sonner'
import { AddProductWizard } from './AddProductWizard'
import { useAppStore } from '@/store/useAppStore'
import { Button, IconButton, Input, Modal, Money, Switch } from '@/components/ds'

interface Props {
  onClose: () => void
}

export function MenuManagementModal({ onClose }: Props) {
  const clubId = useAppStore((s) => s.clubId)
  const [products, setProducts] = useState<Producto[]>([])
  const [categories, setCategories] = useState<Categoria[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editPrice, setEditPrice] = useState('')
  const [showWizard, setShowWizard] = useState(false)
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null)

  const supabase = useMemo(() => createClient(), [])

  async function load() {
    if (!clubId) return
    setLoading(true)
    const [prodsRes, catsRes] = await Promise.all([
      getAllProducts(supabase, clubId),
      getCategories(supabase, clubId),
    ])
    if (!prodsRes.error && prodsRes.data) setProducts(prodsRes.data as Producto[])
    if (!catsRes.error && catsRes.data) {
      const cats = catsRes.data as Categoria[]
      setCategories(cats)
      if (cats.length > 0 && selectedCatId === null) {
        setSelectedCatId(cats[0].id)
      }
    }
    setLoading(false)
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleActivo(p: Producto) {
    try {
      await updateProducto(supabase, p.id, { activo: !p.activo })
      setProducts((prev) => prev.map((x) => x.id === p.id ? { ...x, activo: !x.activo } : x))
    } catch {
      toast.error('Error al actualizar')
    }
  }

  async function toggleCocina(p: Producto) {
    try {
      await updateProducto(supabase, p.id, { requiere_cocina: !p.requiere_cocina })
      setProducts((prev) => prev.map((x) => x.id === p.id ? { ...x, requiere_cocina: !x.requiere_cocina } : x))
    } catch {
      toast.error('Error al actualizar')
    }
  }

  async function savePrice(p: Producto) {
    const price = parseFloat(editPrice)
    if (isNaN(price) || price <= 0) { toast.error('Precio inválido'); return }
    try {
      await updateProducto(supabase, p.id, { precio: price })
      setProducts((prev) => prev.map((x) => x.id === p.id ? { ...x, precio: price } : x))
      setEditingId(null)
      toast.success('Precio actualizado')
    } catch {
      toast.error('Error al actualizar precio')
    }
  }

  const activeCount = products.filter((p) => p.activo).length
  const filtered = selectedCatId ? products.filter((p) => p.categoria_id === selectedCatId) : products

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title="Menú"
        description={`${activeCount} activos · ${products.length} total`}
        size="md"
        dismissable={!showWizard}
      >
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button variant="secondary" size="sm" onClick={() => setShowWizard(true)}>
              <Plus size={16} />
              Agregar
            </Button>
          </div>

          {/* Filtro por categoría */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {categories.map((cat) => {
              const count = products.filter((p) => p.categoria_id === cat.id)
              const activeInCat = count.filter((p) => p.activo).length
              const isActive = selectedCatId === cat.id
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCatId(cat.id)}
                  className={`cursor-pointer whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    isActive
                      ? 'border-primary/30 bg-primary/10 font-medium text-primary'
                      : 'border-outline-variant/60 bg-surface-container-high/40 text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {cat.nombre}
                  <span className="ml-1.5 font-mono tabular-nums opacity-70">
                    {activeInCat}/{count.length}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Lista de productos de la categoría */}
          <div className="overflow-hidden rounded-lg border border-outline-variant/50 bg-surface-container-low/40">
            <div className="flex items-center border-b border-outline-variant/50 bg-surface-container-high/30 px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-on-surface-variant">
              <span className="w-14 text-center">Activo</span>
              <span className="w-14 text-center">Cocina</span>
              <span className="flex-1 px-2 text-left">Producto</span>
              <span className="w-44 text-right">Precio</span>
            </div>

            {loading ? (
              <div className="px-3 py-8 text-center text-sm text-on-surface-variant">
                Cargando...
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-8 text-center text-xs text-on-surface-variant">
                Sin productos en esta categoría
              </div>
            ) : (
              <div className="divide-y divide-outline-variant/30">
                {filtered.map((p) => (
                  <div
                    key={p.id}
                    className={`flex h-11 items-center px-3 text-sm transition-colors ${
                      editingId === p.id
                        ? 'bg-surface-container-high/50'
                        : 'hover:bg-surface-container-high/30'
                    }`}
                  >
                    <div className="flex w-14 items-center justify-center">
                      <Switch
                        checked={p.activo}
                        onChange={() => toggleActivo(p)}
                        label={`Activo: ${p.nombre}`}
                      />
                    </div>

                    <div
                      className="flex w-14 items-center justify-center"
                      title="Requiere preparación en cocina"
                    >
                      <Switch
                        checked={p.requiere_cocina}
                        onChange={() => toggleCocina(p)}
                        label={`Cocina: ${p.nombre}`}
                      />
                    </div>

                    <div
                      className={`min-w-0 flex-1 truncate px-2 font-medium ${
                        p.activo ? 'text-on-surface' : 'text-outline'
                      }`}
                    >
                      {p.nombre}
                    </div>

                    {editingId === p.id ? (
                      <div className="flex w-44 items-center justify-end gap-1">
                        <div className="w-24">
                          <Input
                            type="number"
                            size="sm"
                            prefix="$"
                            className="text-right tabular-nums"
                            value={editPrice}
                            onChange={(e) => setEditPrice(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') savePrice(p)
                              if (e.key === 'Escape') {
                                // Escape cancela la edición y no debe cerrar el modal
                                e.stopPropagation()
                                setEditingId(null)
                              }
                            }}
                            autoFocus
                          />
                        </div>
                        <IconButton
                          icon={<Check size={16} />}
                          label="Confirmar precio"
                          onClick={() => savePrice(p)}
                        />
                        <IconButton
                          icon={<X size={16} />}
                          label="Cancelar edición"
                          onClick={() => setEditingId(null)}
                        />
                      </div>
                    ) : (
                      <div className="flex w-44 justify-end">
                        <button
                          type="button"
                          onClick={() => { setEditingId(p.id); setEditPrice(String(p.precio)) }}
                          title="Clic para editar"
                          className={`cursor-pointer rounded border border-transparent px-1.5 py-0.5 hover:border-outline-variant ${
                            p.activo ? 'text-on-surface' : 'text-outline'
                          }`}
                        >
                          <Money value={p.precio} className="font-mono" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>

      <AddProductWizard
        open={showWizard}
        categories={categories}
        clubId={clubId ?? ''}
        onSuccess={() => { setShowWizard(false); load() }}
        onCancel={() => setShowWizard(false)}
      />
    </>
  )
}
