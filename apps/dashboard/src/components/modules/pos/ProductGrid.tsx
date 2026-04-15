'use client'

import type { Product } from './POSPage'

// CSS gradient placeholders por tipo
const IMG_GRADIENTS: Record<string, string> = {
  'img-coffee': 'linear-gradient(135deg, #8B7355 0%, #D4C5B2 50%, #A89279 100%)',
  'img-water': 'linear-gradient(135deg, #7BA7BC 0%, #B8D8E8 50%, #9CC4D4 100%)',
  'img-paddle': 'linear-gradient(135deg, #6B8F7B 0%, #A8C5B5 50%, #8BB5A0 100%)',
  'img-balls': 'linear-gradient(135deg, #B5A67D 0%, #D4C9A8 50%, #C2B48E 100%)',
  'img-food': 'linear-gradient(135deg, #C4956A 0%, #E8C9A8 50%, #D4AD85 100%)',
  'img-drink': 'linear-gradient(135deg, #7B9CAF 0%, #B8D0E0 50%, #98B8CC 100%)',
  'img-grip': 'linear-gradient(135deg, #8B8B8B 0%, #C4C4C4 50%, #A8A8A8 100%)',
  'img-rental': 'linear-gradient(135deg, #7D9B6B 0%, #A8C596 50%, #8FB57D 100%)',
}

interface ProductGridProps {
  products: Product[]
  onAdd: (product: Product) => void
}

export function ProductGrid({ products, onAdd }: ProductGridProps) {
  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px 24px 24px',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '16px',
        }}
      >
        {products.map((product) => (
          <ProductCard key={product.id} product={product} onAdd={onAdd} />
        ))}
      </div>
    </div>
  )
}

function ProductCard({ product, onAdd }: { product: Product; onAdd: (p: Product) => void }) {
  const gradient = IMG_GRADIENTS[product.imgClass] ?? IMG_GRADIENTS['img-coffee']

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
    <div
      onClick={() => { if (!sinStock) onAdd(product) }}
      style={{
        position: 'relative',
        background: 'var(--color-bg)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: '12px',
        cursor: sinStock ? 'not-allowed' : 'pointer',
        overflow: 'hidden',
        transition: 'all 0.15s',
        opacity: sinStock ? 0.6 : 1,
      }}
      onMouseEnter={(e) => {
        if (!sinStock) {
          e.currentTarget.style.borderColor = 'rgba(108,242,13,0.20)'
          e.currentTarget.style.transform = 'translateY(-2px)'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-border-subtle)'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
      onMouseDown={(e) => { if (!sinStock) e.currentTarget.style.transform = 'scale(0.98)' }}
      onMouseUp={(e) => { if (!sinStock) e.currentTarget.style.transform = 'translateY(-2px)' }}
    >
      {/* Stock badges */}
      {sinStock && (
        <div style={{ position: 'absolute', top: '8px', right: '8px', padding: '2px 7px', background: 'rgba(239,68,68,0.9)', borderRadius: '5px', fontSize: '9px', fontWeight: 700, color: '#fff', letterSpacing: '0.3px', zIndex: 1 }}>
          AGOTADO
        </div>
      )}
      {stockBajo && (
        <div style={{ position: 'absolute', top: '8px', right: '8px', padding: '2px 7px', background: 'rgba(234,179,8,0.9)', borderRadius: '5px', fontSize: '9px', fontWeight: 700, color: '#000', letterSpacing: '0.3px', zIndex: 1 }}>
          STOCK BAJO
        </div>
      )}

      {/* Imagen */}
      <div
        style={{
          width: '100%',
          height: '140px',
          background: gradient,
        }}
      />
      {/* Info */}
      <div style={{ padding: '14px' }}>
        <div
          style={{
            fontSize: '9px',
            fontWeight: 600,
            letterSpacing: '1px',
            textTransform: 'uppercase',
            color: 'var(--color-muted-dim)',
            marginBottom: '4px',
          }}
        >
          {product.category}{product.sub ? ` / ${product.sub}` : ''}
        </div>
        <div
          style={{
            fontSize: '14px',
            fontWeight: 700,
            color: 'var(--color-text)',
            marginBottom: '8px',
            lineHeight: 1.3,
          }}
        >
          {product.name}
        </div>
        <div>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '15px',
              fontWeight: 700,
              color: 'var(--color-lime)',
            }}
          >
            $ {product.price.toFixed(2)}
          </span>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 500,
              color: 'var(--color-muted)',
              marginLeft: '4px',
            }}
          >
            MXN
          </span>
        </div>
      </div>
    </div>
  )
}
