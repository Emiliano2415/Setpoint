import type { SupabaseClient } from '@/lib/supabase/client'
import { localDayStart, localDayEnd } from '@/lib/format'
import type { MetodoPago } from './caja'
export type { MetodoPago } from './caja'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Categoria {
  id: string
  nombre: string
  orden: number
}

export interface Producto {
  id: string
  nombre: string
  precio: number
  categoria_id: string
  descripcion?: string | null
  activo: boolean
  requiere_cocina: boolean
}

export interface ProductoConCategoria extends Producto {
  categoria_nombre: string
}

export interface CuentaItem {
  producto_id: string
  nombre: string  // solo para display, no se inserta en DB
  precio_unitario: number
  cantidad: number
}

export interface PagoInput {
  metodo: MetodoPago
  monto: number
}

const TAX_RATE = 0.16

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getCategories(supabase: SupabaseClient, clubId: string) {
  return supabase
    .from('categorias')
    .select('id, nombre, orden')
    .eq('club_id', clubId)
    .order('orden', { ascending: true })
}

export async function getProductsByCategory(
  supabase: SupabaseClient,
  clubId: string,
  categoriaId: string,
) {
  return supabase
    .from('productos')
    .select('id, nombre, precio, categoria_id, descripcion, activo, requiere_cocina, stock_actual, stock_minimo, requiere_stock')
    .eq('club_id', clubId)
    .eq('categoria_id', categoriaId)
    .eq('activo', true)
    .order('nombre', { ascending: true })
}

export async function getAllActiveProducts(
  supabase: SupabaseClient,
  clubId: string,
) {
  return supabase
    .from('productos')
    .select('id, nombre, precio, categoria_id, descripcion, activo, requiere_cocina, stock_actual, stock_minimo, requiere_stock')
    .eq('club_id', clubId)
    .eq('activo', true)
    .order('nombre', { ascending: true })
}

export async function getAllProducts(
  supabase: SupabaseClient,
  clubId: string,
) {
  return supabase
    .from('productos')
    .select('id, nombre, precio, categoria_id, descripcion, activo, requiere_cocina')
    .eq('club_id', clubId)
    .order('nombre', { ascending: true })
}

export async function updateProducto(
  supabase: SupabaseClient,
  id: string,
  fields: Partial<{ nombre: string; precio: number; activo: boolean; descripcion: string | null; requiere_cocina: boolean }>,
): Promise<void> {
  const { error } = await supabase.from('productos').update(fields).eq('id', id)
  if (error) throw error
}

export async function createProducto(
  supabase: SupabaseClient,
  clubId: string,
  data: { nombre: string; precio: number; categoria_id: string; descripcion?: string | null },
): Promise<void> {
  const { error } = await supabase.from('productos').insert({ ...data, club_id: clubId, activo: true })
  if (error) throw error
}

export async function createCuenta(
  supabase: SupabaseClient,
  clubId: string,
  items: CuentaItem[],
  pagosInput: PagoInput[] | MetodoPago,
  clienteId?: string,
  descuentoTotal: number = 0,
  cajaId?: string,
): Promise<{ data: { id: string; numero_ticket: string } | null; error: Error | null }> {
  // El club lo resuelve la base con current_club_id(); clubId se conserva en
  // la firma por compatibilidad con los llamadores.

  // Normalizar: acepta MetodoPago legacy o PagoInput[]. El total se calcula
  // igual que en rpc_registrar_venta, que vuelve a calcularlo y lo valida.
  const subtotalBase = items.reduce((sum, item) => sum + item.precio_unitario * item.cantidad, 0)
  const base = subtotalBase - descuentoTotal
  const total = base + base * TAX_RATE
  const pagos: PagoInput[] = typeof pagosInput === 'string'
    ? [{ metodo: pagosInput, monto: total }]
    : pagosInput

  // Cuenta, ítems, pagos, movimientos de caja, stock y número de ticket en una
  // sola transacción (supabase/migrations/20261029000001_rpc_registrar_venta.sql):
  // si algo falla no se guarda nada.
  const { data, error } = await supabase.rpc('rpc_registrar_venta', {
    p_items: items.map((item) => ({
      producto_id: item.producto_id,
      precio_unitario: item.precio_unitario,
      cantidad: item.cantidad,
    })),
    p_pagos: pagos.map((p) => ({ metodo: p.metodo, monto: p.monto })),
    p_descuento: descuentoTotal,
    p_cliente_id: clienteId ?? null,
    p_caja_id: cajaId ?? null,
  })

  if (error) return { data: null, error: new Error(error.message, { cause: error }) }
  const venta = data as { id: string; numero_ticket: string } | null
  if (!venta?.id) return { data: null, error: new Error('La venta no devolvió su identificador') }
  return { data: { id: venta.id, numero_ticket: venta.numero_ticket }, error: null }
}

export interface TicketHistorialItem {
  id: string
  numero_ticket: string
  created_at: string
  total: number
  metodo: string
  caja_id: string | null
  items: { nombre: string; cantidad: number; precio_unitario: number; subtotal: number }[]
}

export async function getTicketsDelDia(
  supabase: SupabaseClient,
  clubId: string,
): Promise<TicketHistorialItem[]> {
  const { data, error } = await supabase
    .from('cuentas')
    .select(`
      id,
      numero_ticket,
      created_at,
      total,
      caja_id,
      pagos ( metodo ),
      cuenta_items ( cantidad, precio_unitario, subtotal, producto_id ( nombre ) )
    `)
    .eq('club_id', clubId)
    .eq('estado', 'pagada')
    .gte('created_at', localDayStart())
    .lte('created_at', localDayEnd())
    .order('created_at', { ascending: false })

  if (error) return []

  type RawItem = { cantidad: number; precio_unitario: number; subtotal: number; producto_id: { nombre: string } | { nombre: string }[] | null }
  return (data ?? []).map((c) => ({
    id: c.id,
    numero_ticket: (c.numero_ticket as string) ?? c.id.slice(-6).toUpperCase(),
    created_at: c.created_at as string,
    total: c.total as number,
    caja_id: (c.caja_id as string | null) ?? null,
    metodo: (c.pagos as { metodo: string }[])?.length > 1
      ? 'dividido'
      : (c.pagos as { metodo: string }[])?.[0]?.metodo ?? 'efectivo',
    items: ((c.cuenta_items as unknown as RawItem[]) ?? []).map((i) => {
      const pid = i.producto_id
      const nombre = Array.isArray(pid) ? pid[0]?.nombre : pid?.nombre
      return {
        nombre: nombre ?? 'Producto',
        cantidad: i.cantidad,
        precio_unitario: i.precio_unitario,
        subtotal: i.subtotal,
      }
    }),
  }))
}
