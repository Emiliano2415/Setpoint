# Reglas comunes para los encargos de implementación

Las lee cada agente que implementa una pantalla del rediseño. El encargo concreto dice qué archivo tocar y qué diseño seguir.

## Proyecto
- Raíz: `C:\Users\ear21\OneDrive\Documents\PADEL` (Git Bash: `/c/Users/ear21/OneDrive/Documents/PADEL`). App: `apps/dashboard` (Next.js 16, React 19, TypeScript estricto, Tailwind CSS v4, lucide-react). Rama `beta-2.0`.
- Interfaz en español de México. Dinero con `Money` o formato `$1,234.50`, alineado a la derecha y con `tabular-nums`.

## Cómo obtener el diseño de Stitch
1. Carga las herramientas: ToolSearch `select:mcp__stitch__get_screen,mcp__stitch__download_file`.
2. `get_screen` con `name: projects/10125292601193926464/screens/<id de pantalla>` → toma `htmlCode.name`.
3. `download_file` con ese nombre → el campo `html` es el diseño. Úsalo como referencia de estructura, espaciado y clases. No lo guardes en disco.
- Los colores del HTML (`bg-surface-container`, `text-on-surface-variant`, `border-outline-variant`, `bg-primary`, `text-on-primary`, `text-error`…) existen con el mismo nombre en el proyecto: úsalos tal cual. También `success`, `warning`, `info` (p. ej. `bg-warning/10 text-warning`).
- Los iconos de Stitch son Material Symbols: sustitúyelos por iconos de `lucide-react`. Ningún emoji como icono.
- Stitch inventa datos de ejemplo y a veces controles que el sistema no tiene. **Manda la lógica actual del archivo**: si el diseño muestra algo que el código no tiene, no lo inventes; si el código tiene algo que el diseño no muestra, consérvalo con el mismo estilo.

## Primitivas
Lee `apps/dashboard/src/components/ds/` antes de empezar y úsalas (`import { Button, Modal, … } from '@/components/ds'`): Button, IconButton, Badge, Card, StatCard, Money, Skeleton, EmptyState, Field, Input (prop `size` 'sm'|'md'), Select, Textarea, Switch, SegmentedControl, Tabs, Modal (size 'sm' 480 | 'md' 640 | 'lg' 880, `footer`, `dismissable`), Drawer, Stepper, ConfirmDialog, Table.

## Contrato de lógica (obligatorio)
1. Prohibido editar `apps/dashboard/src/lib/**`, `apps/dashboard/src/store/**`, `supabase/**`, `scripts/**`, `apps/landing/**`, y cualquier archivo que no sea el de tu encargo.
2. Prohibido cambiar nombres o firmas de props, manejadores y funciones exportadas.
3. Prohibido cambiar el orden o los argumentos de llamadas a consultas y RPC.
4. Prohibido cambiar condiciones de negocio: validaciones, cuándo se habilita una acción, cálculos de importes.
5. Todo `useState`, `useEffect`, `useMemo`, `useCallback` y función `handle…` existente se conserva con el mismo cuerpo. Puedes añadir estado puramente visual (abrir/cerrar algo).
6. Prohibido `style={{…}}` salvo valores calculados en tiempo de ejecución (un ancho en %, un color que viene de datos).
7. Solo primitivas de `@/components/ds`; nada de `@/components/ui`. Sin `onMouseEnter`/`onMouseLeave` para estilos: usa `hover:`.
8. Clases condicionales como literales completos (`activo ? 'bg-primary' : 'bg-surface-container'`), nunca concatenando trozos de nombres.
9. Prohibido arrancar `next dev`, `next build` o un navegador.
10. Prohibido hacer commit o `git add`.

## Verificación (desde `apps/dashboard`)
- `npx tsc --noEmit` → código 0. Varios agentes trabajan a la vez en otros archivos: si el error está en un archivo que no es tuyo, espera 2 minutos y repite; si persiste, dilo en la entrega.
- `npx eslint <tu archivo>` → no más errores que antes. Compara con `git show HEAD:apps/dashboard/<ruta> | npx eslint --stdin --stdin-filename <ruta>`.
- `grep -c "style={{" <tu archivo>` → 0 o cada uso justificado.
- Comprueba que la lógica no cambió: compara tus funciones `handle…` y hooks con `git show HEAD:apps/dashboard/<ruta>`.

## Entrega (breve, en español)
1. Archivo(s) tocados y número de líneas antes/después.
2. Resultado de tsc, eslint (antes/después) y del grep.
3. Lo que del diseño no hiciste porque exigía cambiar lógica o no existe en el código.
