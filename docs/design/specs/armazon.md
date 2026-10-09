# Especificación — Armazón (menú lateral y barra superior)

Task 16 del plan `docs/plans/2026-10-09-rediseno-frontend.md`.

| Archivo | Diseño de Stitch |
|---|---|
| `apps/dashboard/src/components/layout/Sidebar.tsx` | `docs/design/stitch/pos/punto-de-venta.html`, elemento `<aside>` de la izquierda |
| `apps/dashboard/src/components/layout/TopBar.tsx` | mismo archivo, elemento `<header>` |

Del diseño de Stitch NO se copia: "Club Central" bajo la marca, ni los iconos de Material Symbols (se usan los de `lucide-react` que cada archivo ya importa).

## `Sidebar.tsx`

### Se conserva sin cambios

- Los arrays `NAV_ITEMS` y `ADMIN_ITEMS` con sus rutas, etiquetas e iconos.
- En `SidebarUser`: la lectura de `user`, `router` y la función `handleLogout` con el mismo cuerpo.
- En `Sidebar`: `pathname` e `isActive`.
- `NavItem` con las mismas props.
- El enlace a `/configuracion` y su icono.
- Todos los enlaces siguen siendo `Link` de `next/link` donde ya lo son.

### Marcado

Contenedor: `<aside className="flex w-[232px] shrink-0 flex-col justify-between border-r border-outline-variant bg-surface-container p-3">`

Parte superior (`<div className="flex flex-col gap-4">`):

1. Marca: `<div className="flex items-center gap-2 px-2 pt-1">` con `<span className="text-base font-semibold text-on-surface">Setpoint</span>` y `<span className="rounded border border-outline-variant px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">PMS</span>`.
2. `<nav className="flex flex-col gap-5 overflow-y-auto">` con dos grupos. Cada grupo es `<div className="flex flex-col gap-0.5">` con una etiqueta `<p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-outline">`: "Operación" para `NAV_ITEMS` y "Administración" para `ADMIN_ITEMS`.

`NavItem` (un `Link`): `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors`.
- Activo: `bg-surface-container-highest font-medium text-primary`, con `aria-current="page"`.
- Inactivo: `text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface`.
- Icono a `size={18}`.

Parte inferior (`<div className="flex flex-col gap-2 border-t border-outline-variant pt-3">`):

1. Enlace a Configuración, con el mismo aspecto que un `NavItem` (activo si la ruta empieza por `/configuracion`).
2. Tarjeta de usuario (`SidebarUser`): `<div className="flex items-center gap-3 rounded-lg border border-outline-variant bg-surface-container-high px-3 py-2">` con un círculo `flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary` que muestra las iniciales (las mismas que calcula hoy el componente; si hoy muestra una sola letra, se deja una sola), y a su lado `<div className="min-w-0">` con el nombre (`truncate text-sm font-medium text-on-surface`) y el rol (`truncate text-xs capitalize text-outline`).
3. Botón "Cerrar sesión": `<button type="button" onClick={handleLogout} className="flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left text-xs text-on-surface-variant transition-colors hover:text-error">` con el icono `LogOut` a `size={16}`.

## `TopBar.tsx`

### Se conserva sin cambios

- `MODULE_CONFIG`, `getModuleConfig` y `useClock` enteros.
- En `TopBar`: `pathname`, `router`, `config`, `time`, `date`, `clubId`, `user`, todo el estado (`stockAlertas`, `showStockPanel`, `productosBajo`, `caja`), `query` y `setQuery`, `supabase`, los dos `useEffect`, `loadStock` y `handleNuevoTurno`, con el mismo cuerpo.
- Las condiciones de renderizado que ya existen: cuándo se muestra el buscador (`config.search`), cuándo el aviso de stock y su panel, y la rama por `config.variant`.
- El buscador sigue controlado: `value={query}` y `onChange={(e) => setQuery(e.target.value)}`.

### Se quita

- Los dos botones de icono `Bell` y `Settings` de la variante `clock`: no tienen manejador ni hacen nada. Se retiran también sus imports si quedan sin uso.

### Marcado

Contenedor: `<header className="relative flex h-14 shrink-0 items-center gap-4 border-b border-outline-variant bg-surface-container px-6">`

De izquierda a derecha:

1. Título: `<h1 className="shrink-0 text-xl font-semibold text-on-surface">{config.title}</h1>` (sin mayúsculas forzadas).
2. Buscador (solo si `config.search`): `<div className="w-full max-w-[320px]">` con la primitiva `Input` (`type="text"`, `aria-label="Buscar"`, `placeholder={config.search}`, `value={query}`, `onChange`, `prefix={<Search size={15} />}`, `className="h-9"`).
3. Aviso de stock bajo, con la misma condición que hoy. Un botón `type="button"` que alterna `showStockPanel`, con `aria-expanded={showStockPanel}`: `inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-warning/40 bg-warning/10 px-3 text-xs font-medium text-warning`, icono `AlertTriangle` a `size={14}` y el texto `{stockAlertas} con stock bajo`.
   - Panel (si `showStockPanel`): `<div className="absolute left-6 top-[52px] z-40 w-80 rounded-xl border border-outline-variant bg-surface-container p-4 shadow-2xl">` con título `<p className="text-sm font-semibold text-on-surface">Productos con stock bajo</p>`, la lista de `productosBajo` (`<ul className="mt-3 flex flex-col gap-2">`, cada fila `flex items-center justify-between gap-3 text-sm` con el nombre en `truncate text-on-surface` y `<span className="shrink-0 tabular-nums text-warning">{stock_actual} / {stock_minimo}</span>`) y, al final, `<Button variant="secondary" size="sm" fullWidth className="mt-3" onClick={() => setShowStockPanel(false)}>Cerrar</Button>`.
4. Lado derecho: `<div className="ml-auto flex shrink-0 items-center gap-3">`
   - Si `config.variant === 'clock'`: `<div className="text-right leading-tight">` con la hora (`text-sm font-medium tabular-nums text-on-surface`) y la fecha (`text-xs text-outline`).
   - Si no (variante `terminal`), el estado del turno:
     `<div className="inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-lg border border-outline-variant px-3 text-xs text-on-surface-variant">` con un punto `<span aria-hidden="true" className="h-1.5 w-1.5 rounded-full …" />` (`bg-success` si `caja` existe, `bg-outline` si no) y el mismo texto que calcula hoy el componente (las tres ramas: cargando, turno abierto con responsable y hora, sin turno). El texto ya no va en mayúsculas.
     Si `caja === null`: `<Button variant="primary" size="sm" onClick={handleNuevoTurno}>Abrir turno</Button>`.

## Flujo de humo (lo ejecuta Claude)

1. Navegar por los 12 módulos desde el menú: el elemento activo cambia y el título de la barra también.
2. El aviso de stock bajo abre su lista y "Cerrar" la oculta.
3. Escribir en el buscador del POS filtra los productos; al cambiar de pantalla queda vacío.
4. La barra muestra el turno abierto con responsable y hora.
5. "Cerrar sesión" lleva a `/login`.
