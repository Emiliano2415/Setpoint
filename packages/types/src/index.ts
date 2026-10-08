// ==================== ENUMS ====================
export type UserRole = 'propietario' | 'admin' | 'cajero' | 'mesero' | 'cocina' | 'barra'
export type CourtStatus = 'ocupada' | 'disponible' | 'mantenimiento'
export type ComandaStatus = 'pendiente' | 'preparando' | 'listo' | 'entregado'
export type CuentaEstado = 'abierta' | 'pagada' | 'cancelada' | 'division'
export type MetodoPago = 'efectivo' | 'credito' | 'debito' | 'cuenta_cliente' | 'bono'
export type ClienteCategoria = 'nuevo' | 'regular' | 'frecuente' | 'habitual' | 'gold' | 'silver'

// ==================== ENTITIES ====================
export interface Club {
  id: string
  nombre: string
  direccion: string
  telefono: string
  config: ClubConfig
}

export interface ClubConfig {
  iva_rate: number
  tolerancia_caja: number
  timer_alerta_min: number
  noshow_tolerancia_min: number
  tarifas: TarifaFranja[]
}

export interface TarifaFranja {
  hora_inicio: string
  hora_fin: string
  nombre: string
  precio_hora: number
}

export interface Empleado {
  id: string
  club_id: string
  nombre: string
  rol: UserRole
  activo: boolean
  turno?: 'completo' | 'mañana' | 'tarde' | 'noche'
}

export interface Pista {
  id: string
  club_id: string
  nombre: string
  tipo: string
  activa: boolean
  orden: number
}

export interface Reserva {
  id: string
  club_id: string
  pista_id: string
  cliente_id?: string
  fecha: string
  hora_inicio: string
  hora_fin: string
  estado: 'confirmada' | 'checkin' | 'finalizada' | 'cancelada' | 'noshow'
  precio: number
  notas?: string
}

export interface Categoria {
  id: string
  club_id: string
  nombre: string
  tipo: string
  estacion_destino?: string
  orden: number
  activa: boolean
}

export interface Producto {
  id: string
  club_id: string
  categoria_id: string
  nombre: string
  precio: number
  iva_rate: number
  stock_actual: number
  stock_minimo: number
  requiere_stock: boolean
  activo: boolean
  imagen_url?: string
}

export interface Cliente {
  id: string
  club_id: string
  nombre: string
  telefono?: string
  email?: string
  categoria: ClienteCategoria
  es_socio: boolean
  saldo_cuenta: number
  notas?: string
}

export interface Cuenta {
  id: string
  club_id: string
  numero_ticket: string
  cliente_id?: string
  reserva_id?: string
  estado: CuentaEstado
  subtotal: number
  iva: number
  total: number
  descuento_total: number
  created_at: string
}

export interface CuentaItem {
  id: string
  cuenta_id: string
  producto_id: string
  cantidad: number
  precio_unitario: number
  descuento: number
  subtotal: number
  iva: number
  total: number
  estado: 'pendiente' | 'en_proceso' | 'listo' | 'entregado' | 'cancelado'
  comanda_id?: string
}

export interface Pago {
  id: string
  cuenta_id: string
  metodo: MetodoPago
  monto: number
  referencia?: string
  propina: number
}

export interface Comanda {
  id: string
  club_id: string
  cuenta_id: string
  estacion: string
  estado: ComandaStatus
  notas?: string
  created_at: string
}

export interface Caja {
  id: string
  club_id: string
  turno_id: string
  fondo_inicial: number
  estado: 'abierta' | 'cerrada'
  total_efectivo: number
  total_tarjeta: number
  total_propinas: number
  diferencia: number
}
