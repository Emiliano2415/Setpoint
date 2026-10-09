# Rediseño Frontend 2.0 — Design Doc

**Fecha:** 2026-10-09
**Rama:** `beta-2.0`
**Objetivo:** Rediseñar por completo la interfaz de `apps/dashboard` con un lenguaje visual más suave, profesional, organizado y minimalista, sin cambiar lo que el sistema hace.

---

## Contexto

La interfaz actual usa fondo casi negro y verde neón (`#6CF20D`), con brillos, tarjetas con imagen y mucho texto en mayúsculas. Está escrita con estilos en línea: hay 1,299 bloques `style={{…}}` repartidos en 14 pantallas y una veintena de modales y paneles, y solo 4 componentes compartidos (`Badge`, `Button`, `Card`, `StatCard`). Cada pantalla resuelve a su manera botones, campos y modales.

El rediseño tiene dos mitades que no se deben mezclar:

- **Qué se ve** — se diseña en Google Stitch.
- **Qué hace** — consultas, cobros, comandas, caja. No cambia con el rediseño.

## Decisiones

### 1. Dirección visual: "Setpoint Suave"

Se conserva la identidad (tema oscuro verdoso con acento lima), bajando saturación y contraste.

Valores de la paleta que Stitch pinta y que el usuario aprobó el 2026-10-09. El código usa los mismos nombres que Stitch.

| Uso | Antes | Ahora | Nombre |
|---|---|---|---|
| Fondo | `#0D1109` | `#0a0f0c` | `background` |
| Superficie | `#161C10` | `#141b17` | `surface-container` |
| Superficie elevada | `#1a2213` | `#19211d` / `#1e2822` | `surface-container-high` / `-highest` |
| Borde | `#28351C` | `#404a44` | `outline-variant` |
| Texto | `#F1F5F9` | `#dde8df` | `on-surface` |
| Texto secundario | `#CBD5C4` | `#a2aea6` | `on-surface-variant` |
| Texto atenuado | `#8B9C7A` | `#6d7871` | `outline` |
| Acento | `#6CF20D` | `#a3d483` | `primary` (texto encima: `#214906`) |
| Peligro | `#EF4444` | `#f97758` | `error` |
| Éxito / aviso / info | saturados | `#86C99A` / `#D9B455` / `#7FA8D9` | `success` / `warning` / `info` |

El fondo apenas cambia; lo que suaviza la interfaz es el acento (de neón a salvia), el texto menos blanco y la ausencia de brillos.

Reglas:

- El acento se usa poco: una acción principal por vista, el elemento activo del menú y los totales.
- Los colores de estado van como texto, punto o borde fino sobre un fondo apenas teñido; nunca como relleno grande.
- Sin brillos, sin degradados, sin imágenes decorativas. La jerarquía sale del espaciado, el peso y la alineación.
- Inter en todo. Título de página 20/600, sección 14/600, cuerpo 14/400. Mayúsculas solo en cabeceras de tabla y etiquetas mínimas. Cifras tabulares, dinero alineado a la derecha.
- Radio 8 px (12 px en modales), rejilla de 4 px, bordes de 1 px en lugar de sombras.
- Iconos de `lucide-react`; se retiran los emojis usados como icono.

Alternativa descartada por ahora: tema claro. Se aleja de "colorimetría similar". Si se quiere comparar, Stitch permite aplicar otro sistema de diseño a las mismas pantallas sin rehacerlas.

### 2. Patrones de superposición

Hoy cada modal es distinto. Quedan cinco patrones:

| Patrón | Cuándo | Forma |
|---|---|---|
| **Modal** | Una acción con formulario corto | Centrado, 480 / 640 / 880 px, cabecera, cuerpo con scroll, pie fijo (secundaria a la izquierda, principal a la derecha) |
| **Asistente** | Acción en varios pasos (cerrar turno, alta de producto, dividir cuenta) | Modal de 640–880 px con pasos numerados en la cabecera y Atrás / Continuar |
| **Panel lateral** | Ver el detalle de un registro sin salir de la lista | 420 px a la derecha |
| **Confirmación** | Acción que no se puede deshacer | Modal de 480 px, botón de peligro, una frase con la consecuencia |
| **Popover** | Aviso o filtro rápido | Anclado al elemento que lo abre |

### 3. Arquitectura de la interfaz

Tres capas, de abajo arriba:

1. **Tokens** en `src/app/globals.css` (bloque `@theme` de Tailwind v4). Los tokens nuevos conviven con los antiguos durante la migración; los antiguos se reasignan a los valores suaves desde el primer día, así las pantallas sin migrar ya cambian de paleta.
2. **Primitivas** en `src/components/ds/` (carpeta nueva): `Button`, `IconButton`, `Field`, `Input`, `Select`, `Textarea`, `Switch`, `SegmentedControl`, `Tabs`, `Badge`, `Card`, `StatCard`, `Table`, `Modal`, `Drawer`, `Stepper`, `EmptyState`, `Skeleton`, `Money`. Con clases de Tailwind, que es lo que exporta Stitch.
3. **Pantallas** en `src/components/modules/**`: se reescribe el JSX sobre las primitivas. Estado, efectos, manejadores y llamadas a `src/lib/**` se conservan tal cual.

`src/components/ui/` (primitivas antiguas) se borra al final, cuando nada la use.

Alternativas descartadas:

- **Solo cambiar variables de color.** Rápido, pero la disposición y los modales quedan igual: no es un rediseño.
- **Pegar el HTML de Stitch pantalla por pantalla.** Rápido de ver, pero repite cada botón y cada modal 40 veces y vuelve a dejar el sistema sin componentes.

### 4. Reparto del trabajo

| Quién | Qué |
|---|---|
| **Claude (sesión principal)** | Diseña en Stitch, escribe la especificación de cada módulo, decide y programa cualquier cambio de lógica, revisa cada entrega y la prueba en el navegador |
| **Haiku 5.5 (subagentes)** | Implementa: convierte la especificación y el HTML de Stitch en componentes, sin tocar lógica |

Haiku recibe por cada encargo: el HTML de Stitch, la especificación del módulo y el "contrato de lógica" (qué no puede cambiar). Nunca decide diseño ni comportamiento.

### 5. Contrato de lógica

Lo que un encargo de implementación **no puede** tocar:

- Nada dentro de `src/lib/**`, `src/store/**`, `supabase/**`, `scripts/**`.
- Nombres y firmas de props, de manejadores y de funciones exportadas.
- El orden y los argumentos de las llamadas a consultas y RPC.
- Las condiciones de negocio (cuándo se puede cobrar, qué permisos se piden, qué se valida).

Lo que **sí** cambia: el JSX, las clases, la composición en primitivas, los textos de interfaz acordados en la especificación.

Comprobación mecánica en cada revisión: `git diff --stat -- apps/dashboard/src/lib apps/dashboard/src/store` debe salir vacío.

### 6. Gráficas y filtros

El usuario quiere las gráficas con **Mono Charts de Amicro** (https://amicro.vercel.app/mono-charts): gráficas de una sola tinta, geometría redondeada y tipografía mínima, que encajan con esta dirección. Sustituyen a Recharts en Reportes.

Antes de diseñar cualquier apartado con filtros o gráficas se le avisa y se espera su respuesta. La lista de apartados afectados está en el plan.

## Alcance

### Pantallas (14)

Acceso · Recuperar contraseña · Punto de Venta · Pistas · Comandas · Inventario · Clientes · Caja · Personal · Reportes · Descuentos · Historial · Cancelaciones · Configuración. Más el armazón común: menú lateral y barra superior.

### Modales, asistentes y paneles (30)

| Módulo | Superposiciones |
|---|---|
| Punto de Venta | Cobro (efectivo / tarjeta) · Pago dividido · Dividir cuenta · Gestionar menú · Alta de producto (asistente) · Historial de tickets (panel) · Aviso de stock bajo (popover) |
| Pistas | Nueva reserva · Check-in con pago · Cuenta de pista · Venta a pista · Selector de productos · Gestión de pistas |
| Comandas | Cobrar comanda |
| Caja | Abrir turno · Movimiento de caja · Corte parcial · Cerrar turno (asistente de 3 pasos) · Historial de turnos (panel) |
| Inventario | Producto · Ajuste de stock |
| Clientes | Nuevo cliente · Detalle de cliente |
| Descuentos | Regla de descuento |
| Cancelaciones | Detalle (panel) · Cancelar ítem · Cancelar reserva · Aprobar o rechazar |
| Personal | Alta y edición de empleado |
| Transversal | Confirmación destructiva |

### Fuera de alcance

- La landing (`apps/landing`).
- Cambios de comportamiento. Los fallos de lógica ya conocidos van aparte y los programa Claude: el inventario no baja al vender, la venta se guarda en cuatro pasos, "Dividir cuenta" ignora el descuento, las funciones `rpc_*` no comprueban el club.

## Google Stitch

- Proyecto: **Setpoint PMS — Rediseño 2.0** (`projects/10125292601193926464`).
- Sistema de diseño: **Setpoint Suave (oscuro)** (`assets/14241705234032577666`).
- Cada pantalla se genera en escritorio (1440 px) con el sistema de diseño fijado. Cada modal se genera como la pantalla que lo abre, atenuada, con el modal encima.
- Nombres: `Módulo` para la pantalla y `Módulo — Acción` para cada superposición.
- El HTML de cada diseño aprobado se guarda en `docs/design/stitch/<módulo>/`; es la referencia exacta de estructura y clases para quien implementa.

## Verificación

No hay marco de pruebas. Cada módulo se da por bueno cuando:

1. `npx tsc --noEmit` y `npx eslint` pasan.
2. El diff no toca `src/lib` ni `src/store`.
3. Claude recorre el flujo del módulo en el navegador contra la base de ejemplo (servidor local con vigilancia de memoria) y compara con el diseño de Stitch.
4. `npx next build` pasa al cerrar cada fase.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Haiku cambia lógica al reescribir un archivo de 600–1,000 líneas | Contrato de lógica, diff mecánico, encargos de un archivo o de un modal por vez |
| Pantallas a medio migrar se ven mezcladas | Los tokens antiguos se reasignan a la paleta nueva en la primera tarea |
| Stitch genera maquetaciones con defectos (ya ocurrió: contenido bajo el menú) | Claude revisa cada captura y corrige en Stitch antes de aprobar |
| El servidor de desarrollo dispara la memoria | Solo Claude lo arranca, siempre con el vigilante; los subagentes verifican con `tsc` y `eslint` |
| El rediseño llega a producción a medias | Todo el trabajo vive en `beta-2.0`; `master` no se toca hasta el cierre |
