import type { SupabaseClient } from '@/lib/supabase/client'
import { localDayStart, localDayEnd } from '@/lib/format'
import { insertMovimientoCaja } from './caja'
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
): Promise<{ data: { id: string } | null; error: Error | null }> {
  const subtotalBase = items.reduce((sum, item) => sum + item.precio_unitario * item.cantidad, 0)
  const base = subtotalBase - descuentoTotal
  const iva = base * TAX_RATE
  const total = base + iva

  // Normalizar: acepta MetodoPago legacy o PagoInput[]
  const pagos: PagoInput[] = typeof pagosInput === 'string'
    ? [{ metodo: pagosInput, monto: total }]
    : pagosInput

  // Número de ticket legible
  const numero_ticket = `SP-${Date.now().toString().slice(-6)}`

  // 1. Insert cuenta con todos los campos requeridos
  const { data: cuenta, error: cuentaError } = await supabase
    .from('cuentas')
    .insert({
      club_id: clubId,
      numero_ticket,
      cliente_id: clienteId ?? null,
      subtotal: base,
      iva,
      total,
      descuento_total: descuentoTotal,
      estado: 'pagada',
      caja_id: cajaId ?? null,
    })
    .select('id')
    .single()

  if (cuentaError || !cuenta) {
    return { data: null, error: cuentaError }
  }

  // 2. Insert cuenta_items — sin campo 'nombre' (no existe en DB), incluye iva y total por item
  const itemsPayload = items.map((item) => {
    const itemSubtotal = item.precio_unitario * item.cantidad
    const itemIva = itemSubtotal * TAX_RATE
    const itemTotal = itemSubtotal + itemIva
    return {
      cuenta_id: cuenta.id,
      producto_id: item.producto_id,
      precio_unitario: item.precio_unitario,
      cantidad: item.cantidad,
      subtotal: itemSubtotal,
      iva: itemIva,
      total: itemTotal,
    }
  })

  const { error: itemsError } = await supabase
    .from('cuenta_items')
    .insert(itemsPayload)

  if (itemsError) {
    return { data: null, error: itemsError }
  }

  // 3. Insert uno o múltiples pagos
  const pagosPayload = pagos.map((p) => ({
    cuenta_id: cuenta.id,
    metodo: p.metodo,
    monto: p.monto,
  }))

  const { error: pagoError } = await supabase.from('pagos').insert(pagosPayload)

  if (pagoError) {
    return { data: null, error: pagoError }
  }

  // 4. Register each payment in caja if cajaId is provided
  if (cajaId) {
    try {
      for (const pago of pagos) {
        await insertMovimientoCaja(supabase, {
          caja_id: cajaId,
          tipo: 'ingreso',
          concepto: `Venta POS #${numero_ticket}`,
          monto: pago.monto,
          metodo: pago.metodo,
        })
      }
    } catch (err) {
      console.error('[createCuenta] Failed to register movement in caja:', err)
      // sale is complete — caja write failure is non-fatal
    }
  }

  return { data: { id: cuenta.id }, error: null }
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
