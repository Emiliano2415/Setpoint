'use client'

import type { Product } from './POSPage'
import { Badge, Money } from '@/components/ds'

interface ProductGridProps {
  products: Product[]
  onAdd: (product: Product) => void
}

export function ProductGrid({ products, onAdd }: ProductGridProps) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} onAdd={onAdd} />
        ))}
      </div>
    </div>
  )
}

function ProductCard({ product, onAdd }: { product: Product; onAdd: (p: Product) => void }) {
  const sinStock =
    product.requiere_stock === true &&
    product.stock !== undefined &&
    product.stock !== null &&
    product.stock <= 0

  const stockBajo =
    !sinStock &&
    product.requiere_stock === true &&
    product.stock !== undefined &&
    product.stock !== null &&
    product.stockMinimo !== undefined &&
    product.stockMinimo !== null &&
    product.stock <= product.stockMinimo

  return (
    <button
      type="button"
      onClick={() => { if (!sinStock) onAdd(product) }}
      className={`group flex min-h-24 w-full flex-col justify-between rounded-lg border border-outline-variant bg-surface-container p-3.5 text-left transition-colors ${sinStock ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-outline'}`}
    >
      <span className="block min-w-0">
        <span
          className={`block text-sm font-semibold leading-snug text-on-surface transition-colors ${sinStock ? '' : 'group-hover:text-primary'}`}
        >
          {product.name}
        </span>
        <span className="mt-0.5 block text-xs text-on-surface-variant">
          {product.category}{product.sub ? ` / ${product.sub}` : ''}
        </span>
      </span>
      <span className="mt-3 flex items-center justify-between gap-2 border-t border-outline-variant/40 pt-2">
        <span className="flex min-w-0 flex-wrap gap-1">
          {product.requiere_cocina ? <Badge tone="info">Cocina</Badge> : null}
          {sinStock ? <Badge tone="error">Agotado</Badge> : null}
          {stockBajo ? <Badge tone="warning">Stock bajo</Badge> : null}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <Money value={product.price} className="text-sm font-medium text-on-surface" />
          <span className="text-[11px] text-outline">MXN</span>
        </span>
      </span>
    </button>
  )
}
