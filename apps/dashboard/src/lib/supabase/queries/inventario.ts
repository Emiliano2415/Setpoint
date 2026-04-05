import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProductoInventario {
  id: string
  nombre: string
  precio: number
  iva_rate: number
  stock_actual: number
  stock_minimo: number
  requiere_stock: boolean
  activo: boolean
  categoria_id: string
  categoria_nombre: string
  categoria_tipo: string
}

export interface StockStats {
  total: number
  bajo: number
  critico: number
}

export interface MovimientoStock {
  id: string
  tipo: 'entrada' | 'salida' | 'ajuste' | 'merma'
  cantidad: number
  stock_anterior: number
  stock_posterior: number
  motivo: string | null
  created_at: string
  producto_nombre: string
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getProductos(supabase: SupabaseClient, clubId: string) {
  return supabase
    .from('productos')
    .select(
      `id, nombre, precio, iva_rate, stock_actual, stock_minimo, requiere_stock, activo, categoria_id,
       categorias(nombre, tipo)`,
    )
    .eq('club_id', clubId)
    .eq('activo', true)
    .order('categoria_id', { ascending: true })
    .order('nombre', { ascending: true })
}

export async function getStockStats(
  supabase: SupabaseClient,
  clubId: string,
): Promise<{ data: StockStats | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('productos')
    .select('stock_actual, stock_minimo, requiere_stock')
    .eq('club_id', clubId)
    .eq('activo', true)
    .eq('requiere_stock', true)

  if (error || !data) return { data: null, error }

  const stats: StockStats = {
    total: data.length,
    bajo: data.filter(
      (p) =>
        p.stock_actual <= p.stock_minimo * 1.5 &&
        p.stock_actual > p.stock_minimo,
    ).length,
    critico: data.filter((p) => p.stock_actual <= p.stock_minimo).length,
  }

  return { data: stats, error: null }
}

export async function adjustStock(
  supabase: SupabaseClient,
  clubId: string,
  productoId: string,
  tipo: 'entrada' | 'salida' | 'ajuste' | 'merma',
  cantidad: number,
  stockActual: number,
  motivo: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('rpc_adjust_stock', {
    p_club_id: clubId,
    p_producto_id: productoId,
    p_tipo: tipo,
    p_cantidad: cantidad,
    p_stock_actual: stockActual,
    p_motivo: motivo || null,
  })
  if (error) throw error
}

export async function getMovimientos(
  supabase: SupabaseClient,
  clubId: string,
  limit = 50,
) {
  return supabase
    .from('movimientos_stock')
    .select(
      `id, tipo, cantidad, stock_anterior, stock_posterior, motivo, created_at,
       productos(nombre)`,
    )
    .eq('club_id', clubId)
    .order('created_at', { ascending: false })
    .limit(limit)
}

export async function createProductoInventario(
  supabase: SupabaseClient,
  clubId: string,
  data: {
    nombre: string
    precio: number
    categoria_id: string
    descripcion?: string | null
    stock_actual?: number
    stock_minimo?: number
    requiere_stock?: boolean
    iva_rate?: number
  },
): Promise<void> {
  const { error } = await supabase.from('productos').insert({
    club_id: clubId,
    nombre: data.nombre,
    precio: data.precio,
    categoria_id: data.categoria_id,
    descripcion: data.descripcion ?? null,
    stock_actual: data.stock_actual ?? 0,
    stock_minimo: data.stock_minimo ?? 0,
    requiere_stock: data.requiere_stock ?? false,
    iva_rate: data.iva_rate ?? 0.16,
    activo: true,
  })
  if (error) throw error
}

export async function updateProductoInventario(
  supabase: SupabaseClient,
  id: string,
  fields: Partial<{
    nombre: string
    precio: number
    descripcion: string | null
    categoria_id: string
    stock_minimo: number
    requiere_stock: boolean
    iva_rate: number
    activo: boolean
  }>,
): Promise<void> {
  const { error } = await supabase.from('productos').update(fields).eq('id', id)
  if (error) throw error
}

export async function getCategoriasInventario(supabase: SupabaseClient, clubId: string) {
  return supabase
    .from('categorias')
    .select('id, nombre, orden')
    .eq('club_id', clubId)
    .order('orden', { ascending: true })
}

export async function getProductosConInactivos(supabase: SupabaseClient, clubId: string) {
  return supabase
    .from('productos')
    .select(
      `id, nombre, precio, iva_rate, stock_actual, stock_minimo, requiere_stock, activo, categoria_id,
       categorias(nombre, tipo)`,
    )
    .eq('club_id', clubId)
    .order('categoria_id', { ascending: true })
    .order('nombre', { ascending: true })
}
