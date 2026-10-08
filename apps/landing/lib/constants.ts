export const NAV_LINKS = [
  { label: 'FAQ', href: '#faq' },
  { label: 'Gestión de Club', href: '#gestion' },
  { label: 'Servicio', href: '#servicio' },
  { label: 'Contacto', href: '#contacto' },
]

export const FEATURES = [
  {
    icon: 'CalendarCheck' as const,
    title: 'Reservas Inteligentes',
    description: 'Gestión visual de pistas con reglas automatizadas de ocupación y tarifas dinámicas.',
  },
  {
    icon: 'Users' as const,
    title: 'Fidelización de Jugadores',
    description: 'Base de datos CRM, niveles de juego, bonos y sistema de membresías integrado.',
  },
  {
    icon: 'Store' as const,
    title: 'Control de Tienda y Bar',
    description: 'Inventario en tiempo real, escaneo de códigos de barra y cierres de caja detallados.',
  },
]

export const HERO_STATS = [
  { label: 'Ocupación', value: '8/10', sub: 'Pistas', color: 'lime' as const },
  { label: 'Caja Actual', value: '$24,910.00', sub: null, color: 'default' as const },
  { label: 'Comandas Abiertas', value: '14', sub: 'En curso', color: 'yellow' as const },
  { label: 'Próximo Turno', value: '15:00', sub: '(6 reservas)', color: 'default' as const },
]

export const COURTS = [
  { name: 'Pista 1 - Central', event: 'Torneo Local', time: '14:00 - 15:30', status: 'active' as const },
  { name: 'Pista 2', event: 'Clase: Nivel Medio', time: '14:00 - 15:00', status: 'active' as const },
  { name: 'Pista 3', event: 'Libre', time: '-', status: 'free' as const },
  { name: 'Pista 4', event: 'Mantenimiento', time: 'Hasta 16:00', status: 'maintenance' as const },
]

export const PRODUCT_CATEGORIES = [
  {
    id: 'cafeteria',
    label: 'Cafetería',
    icon: 'UtensilsCrossed' as const,
    products: [
      { name: 'Bocadillo Jamón', price: '$90.00', badge: null, icon: 'Sandwich' as const },
      { name: 'Tostada Aguacate', price: '$75.00', badge: null, icon: 'Sandwich' as const },
      { name: 'Fruta de Temporada', price: '$55.00', badge: null, icon: 'Apple' as const },
      { name: 'Yogur con Granola', price: '$65.00', badge: null, icon: 'Salad' as const },
    ],
  },
  {
    id: 'bebidas',
    label: 'Bebidas',
    icon: 'Coffee' as const,
    products: [
      { name: 'Café Solo', price: '$28.00', badge: '01', icon: 'Coffee' as const },
      { name: 'Agua Mineral 500ml', price: '$30.00', badge: '02', icon: 'Droplets' as const },
      { name: 'Bebida Isotónica', price: '$50.00', badge: 'x2', icon: 'Zap' as const },
      { name: 'Cerveza Caña', price: '$45.00', badge: null, icon: 'GlassWater' as const },
    ],
  },
  {
    id: 'alquiler',
    label: 'Alquiler Material',
    icon: 'Package' as const,
    products: [
      { name: 'Pala Nivel 1', price: '$70.00', badge: '05', icon: 'Dumbbell' as const },
      { name: 'Pala Pro', price: '$100.00', badge: null, icon: 'Dumbbell' as const },
      { name: 'Muñequera x2', price: '$20.00', badge: null, icon: 'Watch' as const },
      { name: 'Bolsa de Deporte', price: '$15.00', badge: null, icon: 'ShoppingBag' as const },
    ],
  },
  {
    id: 'insumos',
    label: 'Bolas / Grips',
    icon: 'CircleDot' as const,
    products: [
      { name: 'Bote Bolas Head Pro', price: '$130.00', badge: null, icon: 'CircleDot' as const },
      { name: 'Grip Overgrip x3', price: '$45.00', badge: null, icon: 'Layers' as const },
      { name: 'Antivibrador', price: '$25.00', badge: null, icon: 'Minus' as const },
      { name: 'Protector Lateral', price: '$60.00', badge: null, icon: 'Shield' as const },
    ],
  },
]

export const TICKET_ITEMS = [
  { name: 'Bebida Isotónica', qty: '2', unit: '2 x $50.00', total: '$100.00' },
  { name: 'Alquiler Pala Nivel 1', qty: '1', unit: '1 x $70.00', total: '$70.00', note: 'Pista 2' },
]

export const TICKET_SUMMARY = {
  subtotal: '$140.40',
  iva: '$29.60',
  total: '$170.00',
}

export const BENTO_CARDS = [
  {
    icon: 'Gauge' as const,
    title: 'Gestión Alto Rendimiento',
    description: 'Pagos ultrarrápidos, división de cuentas en un toque y cobros mixtos. Interfaz táctil optimizada para horas punta en recepción.',
    size: 'large' as const,
  },
  {
    icon: 'UtensilsCrossed' as const,
    title: 'Gestión de Comandas',
    description: 'Sincroniza el bar/cafetería directamente con la reserva de la pista. Carga consumiciones a la cuenta del jugador para cobrar al final del partido.',
    size: 'medium' as const,
  },
  {
    icon: 'SquareStack' as const,
    title: 'Control de Canchas',
    description: 'Visualización en tiempo real de ocupación y encendido automático de luces vinculado a la reserva.',
    size: 'small' as const,
  },
  {
    icon: 'WifiOff' as const,
    title: 'Inteligencia Offline',
    description: 'Continuidad operativa garantizada. Sigue cobrando y gestionando reservas aunque se caiga internet.',
    size: 'small' as const,
  },
  {
    icon: 'TrendingUp' as const,
    title: 'Reportes Avanzados',
    description: 'Cierres de caja automatizados, exportación fiscal directa y análisis de ingresos cruzados (Pistas vs Bar).',
    size: 'featured' as const,
  },
]

export const FAQ_ITEMS = [
  {
    question: '¿El sistema sigue funcionando si se cae el internet durante un partido?',
    answer: 'Sí. Setpoint opera en modo offline hasta 8 horas continuas. Puedes abrir cuentas, agregar productos, cobrar en efectivo e imprimir tickets térmicos sin internet. Al reconectar, todo se sincroniza automáticamente sin pérdida de datos.',
  },
  {
    question: 'Un jugador quiere pagar solo su parte y cargar unas bebidas a la cuenta de la cancha. ¿Es posible?',
    answer: 'Sí. El modelo de cuenta abierta de Setpoint permite acumular consumos de bar directamente en la cuenta de la cancha y dividir el cobro entre los jugadores al final. Puedes cobrar todo junto o por separado, en efectivo o con tarjeta.',
  },
  {
    question: 'Si cancelo un producto que ya fue preparado en barra, ¿qué pasa?',
    answer: 'Setpoint notifica automáticamente a la estación correspondiente y registra la merma. La cancelación requiere PIN de supervisor y queda auditada con motivo, cajero, hora y monto — todo visible en el reporte del turno.',
  },
  {
    question: '¿Cómo funcionan los descuentos para socios, empleados y convenios?',
    answer: 'El motor de descuentos es configurable desde el panel de administración. Puedes definir porcentajes por tipo de beneficiario (socio, empleado, convenio) y por categoría (canchas, alimentos, bebidas). Los topes diarios se controlan automáticamente y cada descuento queda registrado con trazabilidad completa.',
  },
  {
    question: '¿Puedo operar con varios dispositivos al mismo tiempo en el club?',
    answer: 'Sí. Setpoint admite caja principal, tablet de barra y tablet de cancha en paralelo. Cada dispositivo tiene su propio rango de numeración de tickets sin colisiones, y se sincronizan en tiempo real cuando hay conexión.',
  },
]

export const FOOTER_LINKS = [
  { label: 'FAQ', href: '#faq' },
  { label: 'Integraciones', href: '#' },
  { label: 'Soporte Técnico', href: '#' },
]

// CATEGORY_TABS replaced by PRODUCT_CATEGORIES above

export const SIDEBAR_ITEMS = [
  { icon: 'LayoutDashboard' as const, active: true },
  { icon: 'CircleDot' as const, active: false },
  { icon: 'UtensilsCrossed' as const, active: false },
  { icon: 'ShoppingBag' as const, active: false },
]
