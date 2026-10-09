# Rediseño Frontend 2.0 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> Las tareas marcadas **[Haiku]** se despachan con superpowers:subagent-driven-development: un subagente nuevo por tarea, con `model: "haiku"`, y revisión de Claude entre tareas.

**Goal:** Rediseñar toda la interfaz de `apps/dashboard` (14 pantallas, 30 modales y paneles) con el lenguaje visual "Setpoint Suave" diseñado en Google Stitch, sin cambiar el comportamiento del sistema.

**Architecture:** Tres capas: tokens en `globals.css`, primitivas nuevas en `src/components/ds/` y pantallas reescritas sobre esas primitivas. Claude diseña en Stitch y escribe una especificación por módulo; Haiku 5.5 convierte especificación y HTML de Stitch en componentes; Claude revisa el diff y prueba en el navegador. La lógica (`src/lib`, `src/store`, manejadores) no se toca en ninguna tarea de implementación.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS v4 (`@theme`), lucide-react, Zustand 5, Google Stitch (MCP), Neon.

**Diseño de referencia:** `docs/plans/2026-10-09-rediseno-frontend-design.md`
**Stitch:** proyecto `10125292601193926464`, sistema de diseño `assets/14241705234032577666`
**Rama:** `beta-2.0` (nunca `master`)

---

## Reglas para toda la ejecución

### Quién hace qué

| Etiqueta | Quién | Puede |
|---|---|---|
| **[Claude]** | Sesión principal | Diseñar en Stitch, escribir especificaciones, cambiar lógica, revisar, arrancar el servidor, hacer commits |
| **[Haiku]** | Subagente `general-purpose` con `model: "haiku"` | Editar JSX y clases en `src/components/**` y `src/app/**` |

### Contrato de lógica (obligatorio en cada encargo a Haiku)

1. Prohibido editar `apps/dashboard/src/lib/**`, `apps/dashboard/src/store/**`, `supabase/**`, `scripts/**`, `apps/landing/**`.
2. Prohibido cambiar nombres o firmas de props, manejadores y funciones exportadas.
3. Prohibido cambiar el orden o los argumentos de llamadas a consultas y RPC.
4. Prohibido cambiar condiciones de negocio: validaciones, permisos, cuándo se habilita una acción.
5. Todo `useState`, `useEffect`, `useMemo`, `useCallback` y función `handle…` existente se conserva con el mismo cuerpo.
6. Prohibido `style={{…}}`, salvo valores calculados en tiempo de ejecución (un ancho en porcentaje, un color que viene de datos).
7. Solo primitivas de `@/components/ds`; nada de `@/components/ui`.
8. Textos en español de México. Iconos de `lucide-react`; ningún emoji como icono.
9. Prohibido arrancar `next dev`, `next build` o un navegador. Se verifica con `tsc` y `eslint`.
10. Prohibido hacer commit. Se entrega la lista de archivos tocados.

### Verificación de cada tarea de implementación

```bash
cd apps/dashboard
npx tsc --noEmit                      # Esperado: sin salida, código 0
npx eslint <archivos tocados>         # Esperado: sin errores
cd ../..
git diff --stat -- apps/dashboard/src/lib apps/dashboard/src/store   # Esperado: vacío
grep -c "style={{" <archivo>          # Esperado: 0, o cada uso justificado en la entrega
```

Después, **[Claude]** recorre el flujo de humo del módulo en el navegador con el servidor vigilado (Task 9) y compara con la captura de Stitch.

### CSS propio siempre dentro de una capa

Las utilidades de Tailwind v4 viven en capas, y una regla escrita fuera de toda capa les gana sin importar la especificidad. El reset `* { padding: 0 }` de `globals.css` estaba fuera de capa y anulaba `p-4`, `px-3`… (detectado el 2026-10-09 al probar la página de muestra). Cualquier regla nueva en `globals.css` va dentro de `@layer base` o `@layer components`.

La escala de radios es la de Stitch: `rounded-lg` = 8 px, `rounded-xl` = 12 px.

### Avisar antes de filtros y gráficas

Pedido del usuario (2026-10-09): **antes de diseñar cualquier apartado con filtros o con gráficas, avisarle y esperar su respuesta.** Afecta a:

| Dónde | Qué |
|---|---|
| Pistas | Navegación por fecha |
| Inventario, Clientes, Personal | Buscador y filtros de lista |
| Historial, Cancelaciones | Rango de fechas y filtros |
| Caja | Resumen del turno (posibles gráficas) |
| Reportes | Gráficas y selector de periodo |

Para las gráficas quiere usar **Mono Charts de Amicro** (https://amicro.vercel.app/mono-charts): 30 gráficas de una sola tinta, de Syed Subhan, repositorio `Subhan-code/Amicro--Micro-transitions-`. Se instalan una a una desde su registro de shadcn:

```bash
npx shadcn@latest add https://amicro.vercel.app/r/<nombre>.json
```

Antes de adoptarlas (Task 28): leer su licencia, comprobar qué dependencias trae cada una y que funcionan con Tailwind v4, y crear `apps/dashboard/components.json` (el proyecto no usa shadcn hoy). Sustituyen a Recharts.

### Commits

Uno por tarea, en inglés, estilo del repositorio: `feat(ds): …`, `refactor(pos): …`. Los hace Claude tras la revisión.

### Paralelismo

Sin worktrees (no tienen `node_modules`). Como máximo dos subagentes a la vez y solo sobre archivos distintos. Los módulos de la Fase 3 se pueden emparejar así: POS ∥ Caja, Pistas ∥ Inventario, Clientes ∥ Personal.

---

# Fase 1 — Diseño en Stitch [Claude]

Cada generación de Stitch devuelve unas 5,000 palabras de respuesta. Para no llenar la sesión principal, los lotes se generan con un subagente (modelo por defecto, no Haiku) que recibe los textos ya escritos por Claude y devuelve solo una tabla `nombre → id de pantalla → enlace de captura`.

### Task 1: Aprobar la dirección visual

**Hecho:** `Punto de Venta` (`screens/be32ac930434454b9e902c9e5333154e`) y `Punto de Venta — Cobro en efectivo` (`screens/580655626e2849b380a8590db902fb9f`).

**Aprobado por el usuario el 2026-10-09** ("me gusta bastante"), tal como lo pinta Stitch. Por eso los tokens del código (Task 10) usan los nombres y valores de la paleta de Stitch, no los del texto del sistema de diseño.

### Task 2: Corregir el armazón

El contenido de `Punto de Venta` queda debajo del menú lateral.

**Step 1:** `edit_screens` sobre las dos pantallas ancla: "El contenido principal empieza a la derecha del menú lateral de 232 px; la barra superior muestra el título de la página a la izquierda".
**Step 2:** Descargar captura y comprobar que la primera columna de productos y la primera pestaña se ven completas.
**Step 3:** Fijar en el sistema de diseño (`designMd`) la regla del margen para que no se repita.

### Tasks 3–8: Generar los lotes

Para cada lote: escribir los textos de generación, despachar el subagente, revisar cada captura, corregir en Stitch lo que falle, descargar el HTML a `docs/design/stitch/<módulo>/<nombre>.html`, actualizar `docs/design/stitch/INDEX.md` y hacer commit.

Cada modal se genera como la pantalla que lo abre, atenuada, con el modal encima.

| Task | Lote | Diseños |
|---|---|---|
| 3 | Acceso y estados | Acceso · Recuperar contraseña · Estado vacío · Estado cargando · Estado de error · Confirmación destructiva |
| 4 | Punto de Venta | Cobro con tarjeta · Pago dividido · Dividir cuenta (por persona) · Dividir cuenta (a partes iguales) · Gestionar menú · Alta de producto, pasos 1–3 · Historial de tickets (panel) · Stock bajo (popover) |
| 5 | Pistas y Comandas | Pistas · Nueva reserva · Check-in con pago · Cuenta de pista · Venta a pista · Selector de productos · Gestión de pistas · Comandas · Cobrar comanda |
| 6 | Caja | Caja (turno abierto) · Caja (sin turno) · Abrir turno · Movimiento de caja · Corte parcial · Cerrar turno, pasos 1–3 · Historial de turnos (panel) |
| 7 | Inventario y Clientes | Inventario · Producto · Ajuste de stock · Clientes · Nuevo cliente · Detalle de cliente |
| 8 | Administración | Personal · Empleado · Reportes · Descuentos · Regla de descuento · Historial · Cancelaciones · Detalle de cancelación (panel) · Cancelar ítem · Cancelar reserva · Aprobar o rechazar · Configuración |

Total: 52 diseños además de los 2 ya hechos.

Antes de escribir los textos de un lote, **[Claude]** lee los componentes actuales de ese módulo para que el diseño contenga exactamente los mismos datos, campos y acciones. Un diseño que añade o quita una acción cambia el alcance y se consulta antes.

---

# Fase 2 — Fundaciones

### Task 9: Servidor de desarrollo vigilado [Claude]

**Files:**
- Create: `scripts/dev-vigilado.ps1`

Script que arranca `next dev` de una app, mide la memoria de sus procesos cada 5 s, lo mata al superar el límite o al cumplirse el tiempo y siempre limpia al terminar. Parámetros: `-App dashboard|landing`, `-Port`, `-Seconds`, `-LimitMB` (2500 por defecto).

**Verificar:** `powershell -File scripts/dev-vigilado.ps1 -App dashboard -Port 3001 -Seconds 60` termina con `restantes tras limpiar: 0`.
**Commit:** `chore: add watched dev server script`

### Task 10: Tokens [Haiku]

**Files:**
- Modify: `apps/dashboard/src/app/globals.css` (bloque `@theme inline`, sección de colores)

**Step 1:** Sustituir la sección de colores del bloque `@theme inline` por esto. Los nombres antiguos se conservan apuntando a la paleta nueva para que las pantallas sin migrar cambien de tono desde ya.

```css
  /* ===================== TOKENS 2.0 =====================
     Mismos nombres y valores que el sistema de diseño de Stitch: las clases
     del HTML exportado (bg-surface-container, text-on-surface…) valen tal cual. */
  --color-background: #0a0f0c;
  --color-surface-container-low: #0e1511;
  --color-surface-container: #141b17;
  --color-surface-container-high: #19211d;
  --color-surface-container-highest: #1e2822;
  --color-surface-bright: #242e28;

  --color-outline: #6d7871;
  --color-outline-variant: #404a44;

  --color-on-surface: #dde8df;
  --color-on-surface-variant: #a2aea6;

  --color-primary: #a3d483;
  --color-primary-dim: #96c676;
  --color-on-primary: #214906;
  --color-primary-container: #335c19;
  --color-on-primary-container: #bff29d;

  --color-secondary: #bdcbaf;
  --color-secondary-dim: #afbda2;
  --color-tertiary: #fff9e6;
  --color-tertiary-dim: #eee4a0;

  --color-error: #f97758;
  --color-error-container: #85230a;
  --color-on-error-container: #ff9b82;

  /* Estados que Stitch no nombra */
  --color-success: #86C99A;
  --color-warning: #D9B455;
  --color-info: #7FA8D9;

  /* ============ NOMBRES ANTIGUOS (se borran en el cierre) ============ */
  --color-bg: #0a0f0c;
  --color-bg2: #141b17;
  --color-bg3: #19211d;
  --color-bg4: #1e2822;

  --color-lime: #a3d483;
  --color-lime-5: rgba(163,212,131,0.05);
  --color-lime-8: rgba(163,212,131,0.08);
  --color-lime-10: rgba(163,212,131,0.10);
  --color-lime-15: rgba(163,212,131,0.15);
  --color-lime-20: rgba(163,212,131,0.20);
  --color-lime-30: rgba(163,212,131,0.30);
  --color-lime-60: rgba(163,212,131,0.60);

  --color-text: #dde8df;
  --color-text-secondary: #a2aea6;
  --color-muted: #a2aea6;
  --color-muted-dim: #6d7871;

  --color-border: #404a44;
  --color-border-subtle: rgba(64,74,68,0.5);

  --color-yellow: #D9B455;
  --color-yellow-10: rgba(217,180,85,0.10);
  --color-red: #f97758;
  --color-red-10: rgba(249,119,88,0.10);
  --color-green: #86C99A;
  --color-green-10: rgba(134,201,154,0.10);
  --color-blue: #7FA8D9;
  --color-blue-10: rgba(127,168,217,0.10);
  --color-orange: #D99A5B;
  --color-orange-10: rgba(217,154,91,0.10);

  --color-surface: rgba(20,27,23,0.6);
```

**Step 2:** En el mismo archivo, cambiar el color de la barra de desplazamiento y del foco de `rgba(108,242,13,…)` a `rgba(163,212,131,…)` con la misma opacidad.

**Step 3:** Hay unos 110 colores neón escritos a mano en 38 archivos (`grep -rnE "6CF20D|108, ?242, ?13" apps/dashboard/src`). Sustitución mecánica, conservando la opacidad: `rgba(108,242,13,X)` → `rgba(163,212,131,X)` y `#6CF20D` → `#a3d483`. No tocar nada más de esas líneas.

**Step 4:** Verificar con `npx tsc --noEmit`.
**Commit:** `feat(ds): soft palette tokens and legacy token remap`

### Task 11: Primitivas base [Haiku]

**Files:**
- Create: `apps/dashboard/src/components/ds/Button.tsx`, `IconButton.tsx`, `Badge.tsx`, `Card.tsx`, `StatCard.tsx`, `Money.tsx`, `Skeleton.tsx`, `EmptyState.tsx`, `index.ts`

**Step 1:** `Button.tsx`, completo:

```tsx
import type { ButtonHTMLAttributes } from 'react'

const VARIANT = {
  primary: 'bg-primary text-on-primary hover:brightness-105',
  secondary: 'border border-outline text-on-surface hover:bg-surface-container-highest',
  ghost: 'text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface',
  danger: 'border border-error/50 text-error hover:bg-error/10',
} as const

const SIZE = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-5 text-sm',
} as const

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANT
  size?: keyof typeof SIZE
  fullWidth?: boolean
  /** Deshabilita el botón y muestra "Procesando…" */
  loading?: boolean
}

export function Button({
  variant = 'secondary',
  size = 'md',
  fullWidth = false,
  loading = false,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT[variant]} ${SIZE[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading ? 'Procesando…' : children}
    </button>
  )
}
```

**Step 2:** El resto, con este contrato (mismas convenciones que `Button`: clases de Tailwind con los tokens 2.0, sin `style`):

| Componente | Props | Aspecto |
|---|---|---|
| `IconButton` | `icon: ReactNode`, `label: string` (va a `aria-label`), `variant?: 'ghost' \| 'secondary' \| 'danger'`, resto de atributos de botón | Cuadrado de 32 px, radio 8 |
| `Badge` | `tone?: 'neutral' \| 'success' \| 'warning' \| 'error' \| 'info' \| 'primary'`, `children` | Punto de 6 px + texto 12/500; fondo del tono al 10 % (p. ej. `bg-success/10`), texto del tono |
| `Card` | `padding?: 'none' \| 'md' \| 'lg'`, `className?`, `children` | `bg-surface-container border border-outline-variant rounded-lg` |
| `StatCard` | `label: string`, `value: ReactNode`, `hint?: string`, `tone?` como `Badge` | Etiqueta 12 `text-outline`, valor 24/600 tabular, pista 12 |
| `Money` | `value: number`, `className?` | `<span>` con `tabular-nums`, formato `$1,234.50` (`Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })`) |
| `Skeleton` | `className?` | Bloque `bg-surface-container-highest animate-pulse rounded-md` |
| `EmptyState` | `icon: ReactNode`, `title: string`, `action?: ReactNode` | Centrado, icono 32 `text-outline`, una línea 14 `text-on-surface-variant`, acción debajo |

**Step 3:** `index.ts` reexporta todo.
**Step 4:** Verificar con `tsc` y `eslint src/components/ds`.
**Commit:** `feat(ds): base primitives`

### Task 12: Formularios [Haiku]

**Files:**
- Create: `apps/dashboard/src/components/ds/Field.tsx`, `Input.tsx`, `Select.tsx`, `Textarea.tsx`, `Switch.tsx`, `SegmentedControl.tsx`, `Tabs.tsx`
- Modify: `apps/dashboard/src/components/ds/index.ts`

| Componente | Props | Aspecto |
|---|---|---|
| `Field` | `label: string`, `htmlFor: string`, `hint?: string`, `error?: string`, `children` | Etiqueta 12/500 `text-on-surface-variant` arriba, ayuda 12 `text-outline` abajo; si hay `error` sustituye a la ayuda en `text-error` |
| `Input` | atributos de `<input>` + `prefix?: ReactNode`, `invalid?: boolean` | Alto 40, `bg-background border border-outline-variant rounded-lg px-3 text-sm`; foco `border-primary`; `invalid` → `border-error` |
| `Select` | atributos de `<select>` + `invalid?` | Igual que `Input`, con `ChevronDown` a la derecha |
| `Textarea` | atributos de `<textarea>` + `invalid?` | Igual que `Input`, alto mínimo 80 |
| `Switch` | `checked: boolean`, `onChange: (v: boolean) => void`, `label: string`, `disabled?` | `role="switch"`, pista 36×20, activo `bg-primary` |
| `SegmentedControl` | `value: string`, `onChange: (v: string) => void`, `options: { value: string; label: string }[]` | Contenedor `bg-background border border-outline-variant rounded-lg p-1`; opción activa `bg-surface-container-highest text-on-surface` |
| `Tabs` | `value`, `onChange`, `tabs: { value: string; label: string; count?: number }[]` | Subrayado de 2 px `border-primary` en la activa, resto `text-on-surface-variant` |

**Verificar:** `tsc`, `eslint src/components/ds`.
**Commit:** `feat(ds): form primitives`

### Task 13: Superposiciones [Haiku]

**Files:**
- Create: `apps/dashboard/src/components/ds/Modal.tsx`, `Drawer.tsx`, `Stepper.tsx`, `ConfirmDialog.tsx`
- Modify: `apps/dashboard/src/components/ds/index.ts`

**Step 1:** `Modal.tsx`, completo. El foco se mueve al panel solo al abrir: si el efecto dependiera de `onClose`, cada tecla escrita dentro del modal le quitaría el foco al campo.

```tsx
'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

const WIDTH = {
  sm: 'max-w-[480px]',
  md: 'max-w-[640px]',
  lg: 'max-w-[880px]',
} as const

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  /** Texto corto bajo el título */
  description?: string
  size?: keyof typeof WIDTH
  /** Pie: acción secundaria a la izquierda, principal a la derecha */
  footer?: ReactNode
  /** false mientras se guarda: ni Esc ni el fondo cierran */
  dismissable?: boolean
  children: ReactNode
}

export function Modal({
  open,
  onClose,
  title,
  description,
  size = 'sm',
  footer,
  dismissable = true,
  children,
}: ModalProps) {
  const panel = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const dismissableRef = useRef(dismissable)

  useEffect(() => {
    onCloseRef.current = onClose
    dismissableRef.current = dismissable
  })

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    panel.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissableRef.current) onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && dismissable) onClose()
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`flex max-h-[calc(100vh-32px)] w-full ${WIDTH[size]} flex-col rounded-xl border border-outline-variant bg-surface-container shadow-2xl outline-none`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-outline-variant px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-on-surface">{title}</h2>
            {description && <p className="mt-1 text-sm text-on-surface-variant">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={!dismissable}
            aria-label="Cerrar"
            className="rounded-md p-1 text-outline hover:bg-surface-container-highest hover:text-on-surface disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <footer className="flex items-center justify-between gap-3 border-t border-outline-variant px-6 py-4">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}
```

**Step 2:** El resto:

| Componente | Props | Comportamiento |
|---|---|---|
| `Drawer` | `open`, `onClose`, `title`, `footer?`, `children` | Igual que `Modal` (Esc, fondo, foco) pero anclado a la derecha, ancho 420, alto completo |
| `Stepper` | `steps: string[]`, `current: number` (base 0) | Fila de círculos numerados de 24 px; hecho `bg-primary text-on-primary`, actual `border-primary text-primary`, pendiente `border-outline-variant text-outline`; etiqueta 12 junto a cada uno |
| `ConfirmDialog` | `open`, `onCancel`, `onConfirm`, `title`, `consequence: string`, `confirmLabel: string`, `loading?` | `Modal` `sm` con la frase de consecuencia y pie: `Button` secundario "Cancelar", `Button` `danger` con `confirmLabel` |

**Verificar:** `tsc`, `eslint src/components/ds`.
**Commit:** `feat(ds): overlay primitives`

### Task 14: Tabla [Haiku]

**Files:**
- Create: `apps/dashboard/src/components/ds/Table.tsx`
- Modify: `apps/dashboard/src/components/ds/index.ts`

`Table<T>` con props `columns: { key: string; header: string; align?: 'left' | 'right'; width?: string; render: (row: T) => ReactNode }[]`, `rows: T[]`, `rowKey: (row: T) => string`, `onRowClick?: (row: T) => void`, `selectedKey?: string`, `empty?: ReactNode`.
Cabecera fija 12/500 mayúsculas `text-outline`, filas de 40 px con `border-b border-outline-variant`, fila bajo el cursor `bg-surface-container-highest`, fila seleccionada `bg-primary/10`. Sin cebra.

**Verificar:** `tsc`, `eslint`.
**Commit:** `feat(ds): table primitive`

### Task 15: Página de muestra [Haiku] + revisión [Claude]

**Files:**
- Create: `apps/dashboard/src/app/(dashboard)/ds/page.tsx`

Página solo para desarrollo que muestra cada primitiva en todas sus variantes y un `Modal`, un `Drawer` y un `ConfirmDialog` que se abren con botones. Se borra en el Task 31.

**[Claude]:** abrir `http://localhost:3001/ds` con el servidor vigilado, comparar con las capturas de Stitch, comprobar que al escribir en un campo dentro del modal no se pierde el foco y que Esc cierra.
**Commit:** `chore(ds): primitives showcase page`

### Task 16: Armazón [Haiku]

**Files:**
- Modify: `apps/dashboard/src/components/layout/Sidebar.tsx`
- Modify: `apps/dashboard/src/components/layout/TopBar.tsx`
- Referencia: `docs/design/stitch/pos/punto-de-venta.html`

Reescribir el JSX de ambos sobre las primitivas. Se conservan: la lista de rutas y sus permisos, el cierre de sesión, el sondeo de stock bajo, el estado del turno y el título por ruta.

**Flujo de humo [Claude]:** navegar por los 12 módulos desde el menú; el elemento activo cambia; el aviso de stock bajo abre su lista; "Cerrar sesión" lleva a `/login`.
**Commit:** `refactor(layout): sidebar and top bar on the new design system`

---

# Fase 3 — Módulos

Cada módulo sigue el mismo ciclo. La tabla da archivos, diseños y flujo de humo.

### Ciclo de un módulo

**Step 1 [Claude]: Especificación.** Crear `docs/design/specs/<módulo>.md` con: (a) qué diseño de Stitch corresponde a cada archivo; (b) qué primitiva sustituye a cada bloque; (c) lista de estado, efectos y manejadores que se conservan, con sus números de línea; (d) textos de interfaz definitivos; (e) estados vacío, cargando y error.

**Step 2 [Haiku]: Implementación.** Un encargo por archivo (los modales, uno por encargo). Plantilla al final de este plan.

**Step 3 [Claude]: Revisión.** Los cuatro comandos de verificación, lectura del diff completo buscando cambios de lógica, y devolución al mismo subagente si los hay.

**Step 4 [Claude]: Flujo de humo** en el navegador con el servidor vigilado.

**Step 5 [Claude]: Commit.** `refactor(<módulo>): <pantalla o modal> on the new design system`.

### Tasks 17–29

| Task | Módulo | Archivos (`src/components/modules/…` salvo indicación) | Flujo de humo |
|---|---|---|---|
| 17 | Acceso | `src/app/(auth)/login/page.tsx`, `src/app/(auth)/forgot-password/page.tsx` | Clave incorrecta muestra error; clave correcta entra a `/pos`; enlace de recuperación |
| 18 | Punto de Venta | `pos/POSPage`, `ProductGrid`, `CategoryTabs`, `TicketPanel`, `TicketHistory`, `MenuManagementModal`, `AddProductWizard`, `SplitAccountModal` | Venta en efectivo con cambio; tarjeta; pago dividido; dividir cuenta; descuento guardado; "Enviar ahora" y comanda automática al cobrar; alta de producto; marcar "Cocina" |
| 19 | Comandas | `comandas/ComandasPage`, `CobrarComandaModal` | Avanzar pendiente → preparando → listo → entregado; cobrar una pendiente y que siga en cola; una pagada termina en "Cobrado" |
| 20 | Caja | `caja/CajaPage`, `OpenShiftModal`, `CashMovementModal`, `PartialCutModal`, `CloseShiftModal`, `ShiftHistoryPanel` | Abrir turno; ingreso y retiro; corte parcial; cierre en 3 pasos con arqueo; historial |
| 21 | Pistas | `pistas/PistasPage`, `PistasSidebar`, `CourtCard`, `ReservationModal`, `CheckInPaymentModal`, `CourtAccountModal`, `CourtPOSModal`, `CourtProductPickerModal`, `CourtManagementModal` | Crear reserva; check-in con pago en sus 3 modos; añadir consumo a la pista; cancelar reserva; editar una pista |
| 22 | Inventario | `inventario/InventarioPage`, `ProductFormModal`, `StockAdjustModal` | Crear producto; ajustar stock; el aviso de stock bajo cambia |
| 23 | Clientes | `clientes/ClientesPage`, `NewClientModal`, `ClientDetailModal` | Crear cliente; abrir detalle; buscar |
| 24 | Personal | `empleados/EmpleadosPage` | Lista con "en turno"; alta y edición |
| 25 | Descuentos | `descuentos/DescuentosPage`, `DiscountRuleModal` | Crear regla; activarla; aparece en el POS |
| 26 | Historial | `historial/HistorialPage` | Filtros de fecha; detalle de un ticket |
| 27 | Cancelaciones | `cancelaciones/CancelacionesPage`, `CancelacionesList`, `CancelacionDetalle`, `CancelacionReservaModal` | Selector de fecha; aprobar y rechazar una pendiente; pestaña de reservas |
| 28 | Reportes | `reportes/ReportesPage` | Gráficas con datos; productos del mes |
| 29 | Configuración | `configuracion/ConfiguracionPage`, `src/app/error.tsx`, `not-found.tsx`, `loading.tsx` | Guardar un ajuste; permisos por rol; página 404 |

Los archivos de más de 500 líneas (`TicketPanel`, `SplitAccountModal`, `AddProductWizard`, `CheckInPaymentModal`, `CourtAccountModal`, `CajaPage`, `HistorialPage`) se encargan por secciones: la especificación los divide en bloques de menos de 250 líneas y cada bloque es un encargo.

---

# Fase 4 — Cierre [Claude]

### Task 30: Barrido de restos

```bash
grep -rn "style={{" apps/dashboard/src --include=*.tsx | wc -l      # Esperado: solo usos justificados
grep -rn "@/components/ui" apps/dashboard/src                         # Esperado: vacío
grep -rnE "var\(--color-(bg|lime|text|muted|border|yellow|red|green|blue|orange|surface\))" apps/dashboard/src   # Esperado: vacío
```

Lo que aparezca se corrige con un encargo a Haiku por archivo.

### Task 31: Borrar lo antiguo

- Delete: `apps/dashboard/src/components/ui/`, `apps/dashboard/src/app/(dashboard)/ds/`
- Modify: `apps/dashboard/src/app/globals.css` (quitar el bloque "NOMBRES ANTIGUOS")

**Verificar:** `npx tsc --noEmit` y `npx next build` (17 rutas).
**Commit:** `chore(ds): remove legacy tokens and primitives`

### Task 32: Recorrido completo y entrega

1. Recorrer los 13 flujos de humo seguidos, en 1366×768 y 1920×1080.
2. Autorizar en Neon Auth el dominio de la vista previa de `beta-2.0` y probar allí.
3. Actualizar `CLAUDE.md` (carpeta `ds`, regla de no usar `style`).
4. Abrir el PR `beta-2.0` → `master`. Lo fusiona el usuario.

---

## Plantilla de encargo a Haiku

```
Agent(
  subagent_type: "general-purpose",
  model: "haiku",
  description: "Rediseño: <archivo>",
  prompt: """
Reescribe la interfaz de UN archivo de un sistema Next.js 16 + React 19 + Tailwind v4.
Directorio del proyecto: C:\Users\ear21\OneDrive\Documents\PADEL

ARCHIVO A EDITAR (solo este): apps/dashboard/src/<ruta>
DISEÑO A SEGUIR: docs/design/stitch/<módulo>/<nombre>.html  (estructura y clases)
ESPECIFICACIÓN: docs/design/specs/<módulo>.md, sección "<archivo>"
PRIMITIVAS DISPONIBLES: apps/dashboard/src/components/ds/ (léelas antes de empezar)

QUÉ HACER
Sustituye el JSX y los estilos del archivo para que se vea como el diseño, usando las
primitivas. Los colores del HTML de Stitch (bg-surface-container, text-on-surface-variant,
border-outline-variant, bg-primary…) existen con el mismo nombre en el proyecto: úsalos tal
cual. No copies colores en hexadecimal ni la fuente de iconos de Stitch (Material Symbols):
los iconos son de lucide-react.

QUÉ NO PUEDES TOCAR
<pegar aquí los 10 puntos del contrato de lógica>
En este archivo se conservan sin cambios: <lista de estado, efectos y manejadores de la especificación>

CÓMO VERIFICAR (desde apps/dashboard)
  npx tsc --noEmit
  npx eslint src/<ruta>
Ambos deben terminar sin errores. No arranques servidores ni navegadores.

QUÉ ENTREGAR
1. Lista de archivos tocados (debe ser solo uno).
2. Salida de tsc y eslint.
3. Cada `style={{` que haya quedado y por qué.
4. Cualquier cosa del diseño que no pudiste hacer sin cambiar lógica: descríbela, no la hagas.
"""
)
```

---

## Cambios de lógica pendientes (solo Claude, fuera del rediseño)

Se programan antes de rediseñar el módulo afectado, para no reescribir dos veces la misma pantalla.

| Fallo | Módulo | Antes del Task |
|---|---|---|
| El inventario no baja al vender | POS, Inventario | 18 |
| La venta se guarda en cuatro pasos separados | POS, Comandas, Pistas | 18 |
| "Dividir cuenta" ignora el descuento activo | POS | 18 |
| Un mismo ticket tiene tres números (el del panel, el guardado y el del historial) | POS | 18 |
| La rejilla de productos se queda en "Cargando..." si no hay categorías o falla su carga | POS | 18 |
| Una venta de cortesía aparece como "Efectivo" en el historial de tickets | POS | 18 |
| En "Dividir cuenta", el aviso "Sin turno activo — los cobros no se registran en caja" contradice que ya no se pueda cobrar sin turno | POS | 18 |

Corregidos el 2026-10-09, al levantar el inventario del POS (`docs/design/specs/pos-inventario.md`):

| Fallo | Estado |
|---|---|
| "Dividir cuenta a partes iguales" creaba una cuenta por persona con todos los productos: el total completo quedaba registrado N veces en ventas, pagos y caja | Corregido y comprobado en la base: una cuenta, un pago por persona |
| "Dividir cuenta" se podía abrir sin turno abierto | Corregido |
| El descuento elegido seguía activo en el ticket siguiente | Corregido; sin probar en el navegador |
| El POS consultaba el turno una sola vez: abrirlo después exigía recargar | Corregido (sondeo cada 30 s); sin probar en el navegador |
| Las funciones `rpc_*` no comprueban el club; registro público abierto | Todos | 32 |

### Decisiones tomadas (2026-10-09)

| Tema | Decisión | Por qué |
|---|---|---|
| Buscador de la barra superior | Funciona por pantalla. La barra escribe en `useSearchStore` y cada pantalla filtra su lista con `coincideBusqueda()` (`src/lib/busqueda.ts`). Hecho en el POS; cada módulo lo adopta al rediseñarse | Pedido del usuario |
| Indicador de turno | La barra muestra el turno real (responsable y hora) o "Sin turno abierto" con el botón "Abrir turno" | Pedido del usuario |
| Bebidas y comandas | No se crea estación de barra. Solo genera comanda lo marcado "Cocina" en Gestionar menú | El usuario dejó la decisión a Claude. Una bebida embotellada se entrega en el mostrador al cobrar: mandarla a un tablero añade un paso sin aportar nada. Lo que sí se prepara (café, bocadillos) ya se marca. Si el club abre una barra con pantalla propia, se añade una columna `estacion` al producto y un filtro al tablero |
