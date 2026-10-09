# POS: inventario de pantallas y modales (estado actual)

Documento descriptivo. Registra lo que el código de `apps/dashboard/src/components/modules/pos/` muestra y permite hacer hoy. No propone cambios.

Convenciones:

- Los textos de la interfaz van entre comillas y tal como están en el código.
- Las rutas son relativas a `apps/dashboard/src/components/modules/pos/`, salvo que se indique otra.
- Los números de línea son los del archivo en el momento de escribir este documento.
- Un `$` dentro de una cadena que usa `${...}` es interpolación de JavaScript; el texto mostrado es, por ejemplo, `Mínimo $116.00`.
- Todos los modales y paneles se cierran al hacer clic en el fondo oscuro, salvo que se indique lo contrario. Ninguno responde a la tecla Escape, salvo la edición de precio en "Gestionar menú".

Piezas, en orden:

1. Pantalla (POSPage + CategoryTabs + ProductGrid)
2. Panel del ticket (TicketPanel, sin sus modales)
3. Modal de cobro simple, efectivo
4. Modal de cobro simple, tarjeta
5. Modal de pago dividido (efectivo + tarjeta)
6. Dividir cuenta, por persona
7. Dividir cuenta, a partes iguales
8. Gestionar menú
9. Alta de producto (asistente)
10. Historial de tickets

Reglas de cálculo comunes (para todas las piezas de cobro):

- `TAX_RATE = 0.16` (TicketPanel.tsx línea 15, SplitAccountModal.tsx línea 37, `queries/pos.ts` línea 41).
- Los precios de producto se tratan como precio sin IVA: el IVA se suma encima del subtotal.
- Orden del cálculo en el ticket: `subtotal` → menos `discount` → `base` → `tax = base * 0.16` → `total = base + tax` (TicketPanel.tsx líneas 82-90).
- `createCuenta` (`lib/supabase/queries/pos.ts` línea 108) recalcula subtotal, IVA y total a partir de los ítems que recibe y del descuento; no usa los totales que calcula la interfaz.

---

## 1. Pantalla (POSPage + CategoryTabs + ProductGrid)

### Archivo y líneas

- `POSPage.tsx` líneas 183-254 (JSX): rejilla de dos columnas, `gridTemplateColumns: '1fr 360px'`, alto `calc(100vh - 56px)`.
  - Enlace "⚙ Gestionar Menú": líneas 198-208.
  - Pestañas o "Cargando...": líneas 209-225.
  - Rejilla de productos o "Cargando...": líneas 227-242.
  - Montaje de `TicketHistory` (línea 193) y de `MenuManagementModal` (línea 195), ambos condicionados por estado.
  - Montaje de `TicketPanel` (columna derecha): líneas 246-252.
- `CategoryTabs.tsx` líneas 10-57.
- `ProductGrid.tsx` líneas 22-44 (rejilla de 4 columnas, `repeat(4, 1fr)`, separación 16 px) y `ProductCard` líneas 46-160 (JSX 64-159).

### Qué muestra

- Enlace alineado a la derecha: "⚙ Gestionar Menú" (el "⚙" es un carácter de texto usado como icono; el control es un `<span>` con `onClick`, no un `<button>`; se pone en mayúsculas por CSS).
- Fila de pestañas de categoría. La primera siempre es "Todos"; después una por cada categoría del club, con el texto de `categorias.nombre`. Se muestran en mayúsculas por CSS. La pestaña activa tiene fondo lima.
- Cuadrícula de tarjetas de producto. Cada tarjeta muestra:
  - Un bloque de 140 px de alto con un degradado de color (no hay imágenes reales). El degradado depende de la categoría (ver Rarezas).
  - Línea pequeña: `{categoría}` y, si el producto tiene descripción, ` / {descripción}`.
  - Nombre del producto.
  - Precio como `$ {precio con 2 decimales}` seguido de "MXN".
  - Distintivo "AGOTADO" (rojo) o "STOCK BAJO" (amarillo) en la esquina superior derecha, según el caso.
- Columna derecha: el panel del ticket (sección 2).

### Campos

No hay campos de entrada en esta pantalla. El texto que filtra los productos (`busqueda`) viene de `useSearchStore` (línea 66) y se escribe en el buscador de la barra superior, que está fuera de esta carpeta y no se leyó.

| Etiqueta | Tipo | Valor inicial | Validación o límite |
|---|---|---|---|
| (buscador de la barra superior, fuera de esta carpeta) | texto | `query` de `useSearchStore` | `coincideBusqueda(busqueda, p.name, p.category, p.sub)`: vacío muestra todo; si no, el texto buscado debe estar contenido (tras normalizar) en nombre, categoría o descripción |

### Acciones

| Texto literal | Qué hace | Función que llama | Deshabilitado u oculto |
|---|---|---|---|
| "⚙ Gestionar Menú" | Abre el modal de gestión del menú | `setShowMenu(true)` (línea 201) | Siempre disponible |
| Cada pestaña (`{cat.label}`, p. ej. "Todos") | Cambia la categoría activa y recarga los productos | `onChange` → `setActiveCategory` (línea 223); en `CategoryTabs` línea 24 | Nunca deshabilitada. Mientras `loadingCategories` es verdadero no se muestran |
| Tarjeta de producto (todo el recuadro) | Agrega una unidad del producto al ticket (si ya está, suma 1) | `onAdd` → `addProduct` (POSPage línea 157); en `ProductGrid` línea 66 | Si `sinStock` es verdadero el clic no hace nada (cursor `not-allowed`, opacidad 0.6, sin efecto al pasar el ratón) |

### Estados

- Carga de categorías: en lugar de las pestañas aparece "Cargando..." (líneas 209-218).
- Carga de productos: en el área de la rejilla aparece "Cargando..." centrado (líneas 227-239).
- Sin datos: si la lista filtrada está vacía, la rejilla queda vacía. No hay ningún texto de "sin productos".
- Error: ni la carga de categorías ni la de productos muestran aviso de error. Si la consulta falla, no se hace nada (`if (!error && data)`). Ver Rarezas.
- Avisos (`toast`): esta pieza no emite ninguno.

### Lógica que no se puede tocar

| Línea | Elemento | Para qué sirve |
|---|---|---|
| 20-32 | `IMG_CLASS_BY_CATEGORY` | Relaciona el nombre de la categoría con una clase de color (`img-drink`, `img-coffee`...) |
| 34 | `ALL_CATEGORY_ID = '__all__'` | Identificador de la pestaña "Todos" |
| 36-49 | `Product`, `TicketItem` | Tipos de producto y de línea del ticket (`Product & { qty }`); los usan ProductGrid y TicketPanel |
| 56-58 | `resolveImgClass` | Devuelve la clase de color de una categoría; `'img-coffee'` si no la conoce |
| 61 | `clubId` (`useAppStore`) | Club del usuario; las cargas esperan a que exista |
| 62 | `useState categories` | Pestañas de categoría (incluye "Todos") |
| 63 | `useState activeCategory` | Categoría seleccionada (inicia en `'__all__'`) |
| 64 | `useState products` | Productos cargados de la categoría activa |
| 66 | `busqueda` (`useSearchStore`) | Texto del buscador de la barra superior |
| 67-70 | `useMemo productosVisibles` | Productos ya filtrados por la búsqueda |
| 71 | `useState loadingCategories` | Muestra "Cargando..." en lugar de las pestañas (inicia `true`) |
| 72 | `useState loadingProducts` | Muestra "Cargando..." en lugar de la rejilla (inicia `true`) |
| 73 | `useState ticketItems` | Líneas del ticket actual; es la fuente de verdad que recibe TicketPanel |
| 74 | `useState showHistory` | Muestra u oculta `TicketHistory` |
| 75 | `useState showMenu` | Muestra u oculta `MenuManagementModal` |
| 77 | `useMemo supabase` | Cliente de base de datos único del componente |
| 80-97 | `useEffect` de categorías (dep. `[clubId]`) | Carga las categorías y arma las pestañas con "Todos" al inicio |
| 100-155 | `useEffect` de productos (deps `[activeCategory, categories]`) | Carga los productos activos (todos o los de una categoría) y los convierte en `Product`; no corre si no hay `clubId` o `categories` está vacío |
| 157-167 | `addProduct` | Agrega una línea o suma 1 a la cantidad si el producto ya está |
| 169-175 | `updateQty` | Suma `delta` a la cantidad de una línea y elimina las que quedan en 0 o menos |
| 177-179 | `removeItem` | Elimina una línea del ticket |
| 181 | `clearTicket` | Vacía el ticket |
| ProductGrid 49-53 | `sinStock` | `requiere_stock === true` y `stock` no nulo y `stock <= 0` |
| ProductGrid 55-62 | `stockBajo` | No `sinStock`, `requiere_stock === true`, `stock` y `stockMinimo` no nulos y `stock <= stockMinimo` |
| ProductGrid 6-15 | `IMG_GRADIENTS` | Degradado de cada clase de color |

### Rarezas

- El encabezado de la columna izquierda no muestra título; lo único fijo es el enlace "⚙ Gestionar Menú" arriba a la derecha.
- Las tarjetas no tienen imagen: es un bloque de degradado determinado por la categoría. Las categorías no reconocidas en `IMG_CLASS_BY_CATEGORY` usan el degradado de `'img-coffee'`. La clase `'img-water'` existe en `IMG_GRADIENTS` pero ninguna categoría la usa.
- El stock numérico nunca se muestra; solo se ven los distintivos "AGOTADO" y "STOCK BAJO". Un producto con `requiere_stock` falso no muestra distintivo aunque su stock sea 0.
- Agregar un producto al ticket no comprueba el stock; solo se bloquea el clic cuando el producto ya está agotado. En el panel del ticket el botón "+" no tiene tope.
- En la vista "Todos" se muestran todos los productos activos, ordenados por nombre. En una categoría concreta, solo los de esa categoría.
- Si la carga de categorías falla o el club no tiene categorías, `categories` queda vacío. El efecto de productos no corre (línea 101), `loadingProducts` sigue en `true` y la rejilla muestra "Cargando..." sin terminar. Si `clubId` es nulo, ambos "Cargando..." tampoco terminan. No queda claro si esto es intencional.
- Después de cerrar "Gestionar menú" los productos de la pantalla no se recargan; los cambios hechos allí (activar, precio, producto nuevo) no se ven hasta cambiar de categoría o recargar la página.
- Las pestañas de categoría no tienen scroll horizontal ni salto de línea definidos (`display: flex`, sin `overflow`): `CategoryTabs` no declara cómo se comporta con muchas categorías.
- El texto de las categorías, el de la línea pequeña de la tarjeta y los de las pestañas se muestran en mayúsculas por CSS (`textTransform: 'uppercase'`), no porque estén guardados así.
- La búsqueda filtra únicamente los productos ya cargados de la categoría activa; no busca en otras categorías.

---

## 2. Panel del ticket (TicketPanel, sin sus modales)

### Archivo y líneas

`TicketPanel.tsx` líneas 268-819 (JSX del componente). Sin contar los modales (279-423 pago dividido, 425-434 montaje de Dividir Cuenta, 436-574 pago simple), el panel ocupa:

- Aviso de turno: líneas 576-581.
- Encabezado, con "Historial", número de ticket y descuentos: líneas 583-689 (descuentos 604-688).
- Lista de ítems: líneas 691-715. Fila de ítem (`TicketItemRow`): líneas 823-870.
- Totales: líneas 717-737. Fila de total (`TotalRow`): líneas 902-911.
- Sección de cocina: líneas 739-782.
- Cuatro botones de pago (`PayButton`): líneas 784-790. Definición de `PayButton`: líneas 913-964.
- Botón principal de cobro: líneas 792-818.

El panel es la columna derecha de 360 px, fondo `--color-bg2`, borde izquierdo.

### Qué muestra

- Aviso condicional (solo si `cajaId === null`): "Sin turno activo — los cobros no se registran en caja".
- Título: "Ticket Actual".
- Enlace: "Historial".
- Número de ticket en lima, p. ej. `#SP-4821` (aleatorio, ver Rarezas). Valor inicial antes de montar: `#SP-0000`.
- Bloque de descuento (solo si hay reglas activas), en una de dos formas:
  - Una sola regla: tarjeta-interruptor con el título `Aplicar {nombre}` (desactivado) o `{nombre} activo` (activado). Subtexto desactivado: `Clic para activar −{valor}%` o `Clic para activar −${valor}`. Subtexto activado: `−{valor}% aplicado` o `−${valor} aplicado`. Tiene un icono de etiqueta y un interruptor visual.
  - Varias reglas: rótulo "Aplicar Descuento" y un botón por regla con `{nombre}` más `{valor}%` o `${valor}`.
- Lista de ítems. Cada fila: cuadrado de degradado de 44 px, nombre, control de cantidad (botón menos, cantidad, botón más), enlace "Eliminar" y a la derecha el importe de la línea `$ {precio × cantidad}`.
- Estado vacío: icono de bolsa y el texto "Agrega productos al ticket".
- Totales (cada fila en mayúsculas por CSS):
  - "Subtotal": `$ {subtotal} MXN`.
  - Fila de descuento (solo si hay regla activa y el descuento es mayor que 0): etiqueta `{nombre} ({valor}%)` o `{nombre} (${valor})`, valor `−$ {descuento} MXN`, en lima.
  - "IVA (16%)": `$ {iva} MXN`.
  - "Total": `$ {total}` en grande, con "MXN" al lado.
- Sección de cocina (ver Estados).
- Botones de pago: "Efectivo", "Tarjeta", "Dividir Pago", "Dividir Cuenta" (rejilla de 2 por 2, cada uno con un icono SVG; "Dividir Pago" y "Dividir Cuenta" usan el mismo icono).
- Botón principal: `Cobrar $ {total} MXN`.

### Campos

No hay campos de texto en el panel. Los controles de estado son:

| Etiqueta | Tipo | Valor inicial | Validación o límite |
|---|---|---|---|
| Interruptor `Aplicar {nombre}` / `{nombre} activo` | interruptor (una regla) | apagado (`activeRuleId === null`) | Ninguna |
| Botones de regla `{nombre} {valor}` | selector de uno (chips) | ninguno | Un clic sobre la regla activa la desactiva (línea 667) |
| Cantidad de la línea | número (con botones − / +) | 1 al agregar | Al llegar a 0 la línea se elimina (`updateQty` filtra `qty > 0`). Sin tope superior |

### Acciones

| Texto literal | Qué hace | Función que llama | Deshabilitado u oculto |
|---|---|---|---|
| "Historial" | Abre el panel de historial del día | `onHistoryOpen` (prop; en POSPage `() => setShowHistory(true)`) | Sin condición. Si la prop no se pasa, no hace nada |
| Tarjeta-interruptor de descuento (una regla) | Activa o desactiva la regla | `setActiveRuleId(activeRuleId ? null : discountRules[0].id)` (línea 610) | Solo se muestra si hay exactamente 1 regla |
| Botón `{nombre} {valor}` (varias reglas) | Activa esa regla o la desactiva si ya era la activa | `setActiveRuleId(isActive ? null : r.id)` (línea 667) | Solo se muestra si hay 2 o más reglas |
| Botón menos (icono `Minus`) | Resta 1 a la cantidad; en 1 elimina la línea | `onUpdateQty(item.id, -1)` (línea 848) | Nunca deshabilitado |
| Botón más (icono `Plus`) | Suma 1 a la cantidad | `onUpdateQty(item.id, 1)` (línea 852) | Nunca deshabilitado |
| "Eliminar" | Quita la línea completa | `onRemove(item.id)` (línea 857) | Nunca deshabilitado. Es un `<div>` con `onClick` |
| "Enviar ahora" / "Enviando..." / "✓ Enviado" | Crea una comanda con lo pendiente de cocina | `handleEnviarACocina` (línea 164) | Deshabilitado si `pendientesCocina.length === 0` o `enviandoComanda`. Toda la sección se oculta si ningún producto del ticket requiere cocina |
| "Efectivo" | Abre el modal de cobro en efectivo | `openPayModal('efectivo')` (línea 786) | Deshabilitado si `items.length === 0` |
| "Tarjeta" | Abre el modal de cobro con tarjeta (método `credito`) | `openPayModal('credito')` (línea 787) | Deshabilitado si `items.length === 0` |
| "Dividir Pago" | Abre el modal de pago dividido | `openSplitModal` (línea 788) | Deshabilitado si `items.length === 0` |
| "Dividir Cuenta" | Abre el modal de dividir cuenta | `setSplitAccountOpen(true)` (línea 789) | Deshabilitado si `items.length === 0` |
| `Cobrar $ {total} MXN` | Abre el modal de cobro en efectivo (igual que "Efectivo") | `openPayModal('efectivo')` (línea 796) | Deshabilitado si `items.length === 0` |

`openPayModal` y `openSplitModal` no abren el modal si el ticket está vacío, y si `cajaId` es nulo o indefinido muestran un aviso de error y no abren (ver Estados).

### Estados

- Carga: no hay indicador de carga propio. `cajaId` empieza indefinido (`useState<string | null | undefined>()`, línea 33) hasta que responde la consulta de turno; mientras tanto no se muestra aviso de turno.
- Sin datos:
  - Ticket vacío: "Agrega productos al ticket".
  - Sin reglas de descuento: el bloque de descuento no aparece.
  - Sin productos de cocina en un ticket con ítems: "Este ticket no genera comanda: ningún producto está marcado para cocina (se marca en Gestionar menú)."
- Sección de cocina (cuando algún ítem requiere cocina):
  - Con pendientes: `🍳 {n} item para cocina · sale al cobrar` o `🍳 {n} items para cocina · sale al cobrar` (singular o plural según `n`; `n` es el número de líneas distintas pendientes, no de unidades). El "🍳" es un emoji usado como icono.
  - Sin pendientes: `🍳 Todo enviado a cocina`.
- Aviso de turno: "Sin turno activo — los cobros no se registran en caja" (solo con `cajaId === null`).
- Avisos (`toast`) emitidos por este panel:
  - `toast.error('No hay turno activo. Abre el turno en Caja antes de cobrar.')` al pulsar "Efectivo", "Tarjeta", "Dividir Pago" o `Cobrar` sin turno (líneas 115, 125).
  - `toast.success('Comanda enviada a cocina ✓')` y `toast.error('Error al enviar a cocina')` en `handleEnviarACocina` (líneas 175 y 170).
  - Los avisos de pago se listan en las secciones 3 a 7.
- Error: `getDescuentosActivos` falla en silencio (`.catch(() => {})`, línea 39). `getCajaActiva` falla con `console.warn('[TicketPanel] No se pudo verificar caja activa')` y sin aviso visible (línea 46).

### Lógica que no se puede tocar

| Línea | Elemento | Para qué sirve |
|---|---|---|
| 15 | `TAX_RATE = 0.16` | Tasa de IVA |
| 25 | `type PayMode` | Declarado (`'single' \| 'split'`); no se usa en el archivo |
| 28 | `clubId` (`useAppStore`) | Club para todas las consultas |
| 29 | `useMemo supabase` | Cliente de base de datos |
| 30 | `useState discountRules` | Reglas de descuento activas |
| 31 | `useState activeRuleId` | Regla de descuento elegida (una sola a la vez) |
| 32 | `useState paying` | Indica que se está procesando un cobro; deshabilita botones de confirmar |
| 33 | `useState cajaId` | Turno abierto: `undefined` cargando, `null` sin turno, texto con el id |
| 35-40 | `useEffect` descuentos | Carga las reglas activas al tener `clubId` |
| 42-47 | `useEffect` caja | Carga el turno abierto una sola vez al tener `clubId` |
| 48 | `useState ticketId` | Número de ticket que se muestra (aleatorio) |
| 50 | `useState payModal` | `{ open, metodo }` del modal de cobro simple |
| 51 | `useState recibido` | Texto del monto recibido en efectivo |
| 52 | `useRef recibidoRef` | Referencia al campo "Monto Recibido" para enfocarlo |
| 54 | `useState enviado` | Cantidad ya enviada a cocina por producto |
| 55 | `useState comandaIds` | Comandas ya creadas para este ticket |
| 56 | `useState enviandoComanda` | Bloquea el botón de envío a cocina mientras envía |
| 58 | `useState splitOpen` | Muestra el modal de pago dividido |
| 59 | `useState splitAccountOpen` | Muestra el modal de dividir cuenta |
| 60 | `useState splitEfectivo` | Texto del monto en efectivo del pago dividido |
| 61 | `useRef splitEfectivoRef` | Referencia al campo "Monto en Efectivo" |
| 63-65 | `useEffect` número de ticket | Genera `#SP-####` al montar (evita diferencia entre servidor y cliente) |
| 67-71 | `useEffect` enfoque de efectivo | Enfoca "Monto Recibido" 50 ms después de abrir el modal en efectivo |
| 73-78 | `useEffect` pago dividido | Al abrir, vacía `splitEfectivo` y enfoca el campo |
| 80 | `activeRule` | Regla activa o `null` |
| 82-90 | `subtotal`, `discount`, `base`, `tax`, `total` | Cálculos del ticket. Descuento por porcentaje: `subtotal * valor / 100`; descuento fijo: `min(valor, subtotal)` |
| 91 | `itemsParaCocina` | Ítems con `requiere_cocina` |
| 93-95 | `pendientesCocina` | Cocina menos lo ya enviado (`qty - enviado[id]`) |
| 98-101 | Bloque que reinicia `enviado` y `comandaIds` | Si el ticket queda vacío, olvida lo enviado. Se ejecuta durante el render, no en un efecto |
| 112-120 | `openPayModal` | Valida ticket y turno, vacía `recibido` y abre el modal |
| 122-129 | `openSplitModal` | Valida ticket y turno y abre el modal de pago dividido |
| 131-138 | `buildCuentaItems` | Convierte `items` al formato de `createCuenta` |
| 140-145 | `resetTicket` | Llama `onClear`, genera nuevo número de ticket y limpia lo enviado |
| 148-162 | `crearComandaPendiente` | Crea la comanda con los pendientes; devuelve el id o `null` |
| 164-176 | `handleEnviarACocina` | Envía los pendientes a cocina y marca lo enviado |
| 182-193 | `cocinaTrasCobrar` | Después de cobrar, liga las comandas ya enviadas a la cuenta y envía lo que faltaba; devuelve el texto que se agrega al aviso |
| 195-215 | `handleConfirmPay` | Cobra con el modal simple |
| 217-235 | `handleConfirmSplit` | Cobra con el modal de pago dividido |
| 237-266 | `handleConfirmSplitAccount` | Cobra cada cuenta de "Dividir Cuenta" |
| 823-870 | `TicketItemRow` | Fila de ítem (contiene su propio mapa de degradados) |
| 872-900 | `qtyBtnStyle`, `qtyValueStyle` | Estilos de los botones de cantidad |
| 902-911 | `TotalRow` | Fila de totales con acento opcional |
| 913-964 | `PayButton` | Botón de pago con icono |

### Rarezas

- Cálculo de IVA: el total siempre es `(subtotal - descuento) × 1.16`; la etiqueta dice "IVA (16%)" sin importar la regla.
- Número de ticket: `#SP-####` es un número aleatorio del cliente (1000 a 9999), distinto del `numero_ticket` que guarda `createCuenta` (`SP-` más seis cifras del instante) y distinto del `#{shortId}` que muestra el historial (últimos seis caracteres del id, en mayúsculas). Los tres números de un mismo ticket no coinciden.
- Regla de turno: no se abre ningún modal de cobro simple ni de pago dividido sin turno abierto. "Dividir Cuenta" no hace esa comprobación al abrirse (línea 789): abre el modal incluso sin turno, y `handleConfirmSplitAccount` cobra con `cajaId ?? undefined`, es decir, sin turno.
- El aviso "Sin turno activo — los cobros no se registran en caja" sugiere que se puede cobrar, pero "Efectivo", "Tarjeta", "Dividir Pago" y `Cobrar` lo impiden con otro mensaje. Solo "Dividir Cuenta" cobra sin turno.
- El turno se consulta una vez (efecto de la línea 42, dependencias `[supabase, clubId]`). Si se abre el turno en Caja después de montar el POS, `cajaId` sigue siendo `null` hasta recargar. Si la consulta falla, `cajaId` queda indefinido: no se muestra aviso, pero los cobros se bloquean con el mismo error de turno.
- `activeRuleId` no se reinicia en `resetTicket`: la regla de descuento seleccionada sigue activa en el siguiente ticket.
- Con varias reglas, solo una puede estar activa. Un descuento por porcentaje no tiene tope; el descuento fijo se limita al subtotal.
- Si hay una sola regla, la tarjeta-interruptor ocupa todo el ancho y usa subtexto en lugar de etiqueta; con 2 o más es un grupo de chips con rótulo propio ("Aplicar Descuento"). Son dos diseños distintos para el mismo dato.
- La sección de cocina no comprueba turno: "Enviar ahora" funciona sin turno abierto.
- "Enviar ahora" no manda a cocina lo que ya se envió: `enviado` guarda la cantidad enviada por producto, y solo se envía la diferencia si el cliente agrega más unidades después.
- Al cobrar, lo que nunca se envió sale hacia cocina automáticamente (el texto lo dice: "sale al cobrar").
- Los emojis usados como icono en esta pieza: "🍳" (sección de cocina) y "✓" en "Comanda enviada a cocina ✓" y "✓ Enviado".
- Texto de aviso de dos formas: "item" singular o "items" plural, en minúsculas, mezclado con el resto de la interfaz en español.
- "Historial", "Eliminar" y los enlaces equivalentes son `<div>` o `<span>` con `onClick`, no botones.
- El botón principal `Cobrar $ {total} MXN` y el botón "Efectivo" hacen exactamente lo mismo; no hay botón principal para tarjeta.
- Los botones de cantidad no tienen tope superior ni comprueban el stock.
- Los botones y enlaces se tiñen al pasar el ratón (`onMouseEnter` / `onMouseLeave` con estilos en línea): "Historial" y "Eliminar" cambian de color (lima y rojo `#EF4444`, respectivamente).

---

## 3. Modal de cobro simple, efectivo

Es el mismo modal de la sección 4; cambia según `payModal.metodo`. Aquí `metodo === 'efectivo'`.

### Archivo y líneas

`TicketPanel.tsx` líneas 436-574 (modal completo). Partes propias de efectivo: líneas 473-536. Tarjeta de 360 px de ancho, sobre un fondo `rgba(0,0,0,0.75)`, `zIndex: 1000`.

### Qué muestra

- Título: "Pago en Efectivo".
- Subtítulo: el número de ticket (`{ticketId}`).
- Recuadro "Total a Cobrar" con `${total}` en grande (lima).
- Rótulo "Monto Recibido" y campo numérico.
- Recuadro "Cambio": etiqueta "Cambio" y valor `${cambio}` o "—" si el campo está vacío.
- Atajos rápidos: hasta tres botones con importes redondeados, p. ej. `$200`, `$500`, `$1000`.
- Botones "Cancelar" y "Confirmar Pago".

### Campos

| Etiqueta | Tipo | Valor inicial | Validación o límite |
|---|---|---|---|
| "Monto Recibido" | número (`type="number"`, placeholder `Mínimo $${total.toFixed(2)}`, p. ej. "Mínimo $116.00") | `''` (se vacía en `openPayModal`, línea 118) | Sin atributo `min`. `recibidoNum = parseFloat(recibido) \|\| 0`. Si `recibidoNum < total` se rechaza el cobro. Sin tolerancia: es comparación directa |

### Acciones

| Texto literal | Qué hace | Función que llama | Deshabilitado u oculto |
|---|---|---|---|
| Atajos `$ {v}` (hasta 3) | Pone ese importe en "Monto Recibido" | `setRecibido(String(v))` (línea 522) | Nunca deshabilitados. Los valores son `ceil(total/100)*100`, `ceil(total/500)*500`, `ceil(total/1000)*1000`, sin repetidos, máximo 3. El que coincide con `recibidoNum` se resalta en lima |
| Tecla Enter dentro del campo | Cobra | `handleConfirmPay` (línea 484) | Solo actúa si `recibidoNum >= total` |
| "Cancelar" | Cierra el modal sin cobrar | `setPayModal({ ...payModal, open: false })` (línea 546) | Nunca deshabilitado |
| "Confirmar Pago" (o "Procesando...") | Registra el cobro en efectivo | `handleConfirmPay` (línea 557) | Deshabilitado si `paying` o `!recibido` o `recibidoNum < total` |
| Clic en el fondo oscuro | Cierra el modal | `setPayModal({ ...payModal, open: false })` (línea 444) | Siempre activo, incluso mientras `paying` es verdadero |

### Estados

- Cargando: mientras `paying` es `true`, el botón dice "Procesando..." y queda deshabilitado.
- Cambio: si hay valor en el campo, "Cambio" muestra `$` y `Math.max(0, cambio)` con dos decimales; si no, "—". El recuadro se tiñe de lima solo si `cambio >= 0` y hay valor.
- Avisos:
  - `toast.error('El monto recibido es menor al total')` si se intenta confirmar con menos del total (línea 197). El botón está deshabilitado y Enter solo actúa con `recibidoNum >= total`, así que desde la interfaz no se alcanza.
  - `toast.error('Error al procesar el pago')` si `createCuenta` falla (línea 205); el modal permanece abierto.
  - `toast.success('Pago en efectivo — Cambio: $' + cambio.toFixed(2) + ' MXN' + cocina)` si cobra. `cocina` es `''` o `' · Comanda enviada a cocina'`.
  - `toast.error('El pago se registró, pero la comanda no llegó a cocina. Avisa a cocina.')` si el cobro tuvo éxito y falló solo el aviso a cocina (línea 190).
- Tras un cobro correcto: se cierra el modal y `resetTicket()` vacía el ticket.

### Lógica que no se puede tocar

Ver la tabla de la sección 2. Elementos de este modal:

| Línea | Elemento | Para qué sirve |
|---|---|---|
| 50 | `payModal` | `{ open, metodo }`; este modal usa `metodo: 'efectivo'` |
| 51 | `recibido` | Texto escrito en "Monto Recibido" |
| 52 | `recibidoRef` | Enfoca el campo al abrir |
| 67-71 | `useEffect` de enfoque | Enfoca el campo 50 ms después de abrir |
| 103 | `recibidoNum` | `parseFloat(recibido) \|\| 0` |
| 104 | `cambio` | `recibidoNum - total` |
| 112-120 | `openPayModal` | Abre el modal |
| 195-215 | `handleConfirmPay` | Valida y cobra; llama `createCuenta(supabase, clubId, buildCuentaItems(), payModal.metodo, undefined, discount, cajaId)` |
| 182-193 | `cocinaTrasCobrar` | Resuelve las comandas tras cobrar |
| 140-145 | `resetTicket` | Limpia el ticket tras el cobro |

### Rarezas

- Cálculo mostrado: "Cambio" = recibido − total, donde total ya incluye el IVA del 16 %.
- La regla "no se cobra sin turno abierto" actúa antes de abrir el modal (`openPayModal`), no dentro de él.
- El aviso `El monto recibido es menor al total` es prácticamente inalcanzable porque el botón se deshabilita antes.
- Los atajos solo cambian el importe recibido; no confirman. Si el total es exactamente un múltiplo de 100, 500 o 1000, el atajo coincide con el total.
- El campo numérico no limita el importe máximo ni acepta formato de miles.
- Con el modal abierto, el clic en el fondo lo cierra incluso durante `paying`: la petición sigue su curso.
- El valor del aviso de éxito usa `cambio` calculado en el render previo, es decir, el que se veía en pantalla.

---

## 4. Modal de cobro simple, tarjeta

Es el mismo modal de la sección 3; aquí `payModal.metodo !== 'efectivo'`.

### Archivo y líneas

`TicketPanel.tsx` líneas 436-574. Partes propias de tarjeta: línea 455 (título) y líneas 538-542 (cuerpo). Misma tarjeta de 360 px y mismo fondo.

### Qué muestra

- Título: "Pago con Tarjeta de Crédito" cuando `metodo === 'credito'`. El código también contiene el título "Pago con Tarjeta de Débito" para cualquier otro método (rama final del ternario de la línea 455), pero ningún botón del panel abre el modal con `'debito'` (solo `'efectivo'`, líneas 786 y 796, y `'credito'`, línea 787).
- Subtítulo: el número de ticket (`{ticketId}`).
- Recuadro "Total a Cobrar" con `${total}`.
- Texto centrado: "Presenta la terminal al cliente para que realice el pago con tarjeta."
- Botones "Cancelar" y "Confirmar Pago".

### Campos

No tiene campos de entrada.

### Acciones

| Texto literal | Qué hace | Función que llama | Deshabilitado u oculto |
|---|---|---|---|
| "Cancelar" | Cierra el modal sin cobrar | `setPayModal({ ...payModal, open: false })` (línea 546) | Nunca deshabilitado |
| "Confirmar Pago" (o "Procesando...") | Registra el cobro con tarjeta (método `credito`) | `handleConfirmPay` (línea 557) | Deshabilitado solo si `paying` |
| Clic en el fondo oscuro | Cierra el modal | `setPayModal({ ...payModal, open: false })` (línea 444) | Siempre activo |

### Estados

- Cargando: el botón dice "Procesando..." y queda deshabilitado mientras `paying` es verdadero.
- Avisos:
  - `toast.success('Pago con tarjeta procesado' + cocina)` si cobra (línea 211).
  - `toast.error('Error al procesar el pago')` si falla (el modal sigue abierto).
  - `toast.error('El pago se registró, pero la comanda no llegó a cocina. Avisa a cocina.')` si falla solo el aviso a cocina.
- Tras un cobro correcto: se cierra el modal y se vacía el ticket.

### Lógica que no se puede tocar

Igual que la sección 3: `payModal` (línea 50), `openPayModal` (112-120), `handleConfirmPay` (195-215), `cocinaTrasCobrar` (182-193), `resetTicket` (140-145). Para tarjeta, `handleConfirmPay` no valida el monto: se ignora `recibido`.

### Rarezas

- Todo cobro con tarjeta se registra con el método `credito`. No existe forma de elegir débito desde este modal.
- El modal no integra ninguna terminal: el texto pide presentar la terminal, pero "Confirmar Pago" registra el cobro sin ninguna comprobación del pago.
- No hay campo de referencia, últimos dígitos ni propina.
- La acción de confirmar es la misma función que en efectivo; no hay distinción de flujo salvo la validación del monto.

---

## 5. Modal de pago dividido (efectivo + tarjeta)

### Archivo y líneas

`TicketPanel.tsx` líneas 279-423 (JSX). Tarjeta de 380 px sobre fondo `rgba(0,0,0,0.75)`, `zIndex: 1000`.

### Qué muestra

- Título: "Pago Dividido".
- Subtítulo: `{ticketId} — Efectivo + Tarjeta`.
- Recuadro "Total a Cobrar" con `${total}`.
- Bloque de efectivo: icono, rótulo "Monto en Efectivo", campo numérico y cuatro atajos `$50`, `$100`, `$200`, `$500`.
- Bloque de tarjeta: icono, rótulo "Monto en Tarjeta" y un recuadro de solo lectura con el texto "Auto-calculado" y el importe `${splitTarjeta}` (atenuado si es 0).
- Bloque de resultado (aparece solo cuando el campo de efectivo no está vacío): si `splitCambio > 0` muestra "Cambio en Efectivo" con `${splitCambio}`; si no, "Cubierto por Tarjeta" con `${splitTarjeta}`.
- Botones "Cancelar" y "Confirmar Pago".

### Campos

| Etiqueta | Tipo | Valor inicial | Validación o límite |
|---|---|---|---|
| "Monto en Efectivo" | número (`type="number"`, `min="0"`, placeholder "0.00") | `''` (se vacía cada vez que `splitOpen` pasa a `true`, línea 75) | `splitEfectivoNum = parseFloat(splitEfectivo) \|\| 0`. Válido si `splitEfectivoNum >= 0` y `splitEfectivoNum <= total + 0.01`. El borde se pone amarillo (`rgba(234,179,8,0.5)`) si supera `total + 0.01`; no hay texto de error |
| "Monto en Tarjeta" | solo lectura (calculado) | `total - splitEfectivoNum` con mínimo 0 | No editable |

### Acciones

| Texto literal | Qué hace | Función que llama | Deshabilitado u oculto |
|---|---|---|---|
| `$50`, `$100`, `$200`, `$500` | Pone ese importe en "Monto en Efectivo" | `setSplitEfectivo(String(v))` (línea 343) | Nunca deshabilitados. El que coincide con el importe escrito se resalta en lima |
| "Cancelar" | Cierra el modal | `setSplitOpen(false)` (línea 396) | Nunca deshabilitado |
| "Confirmar Pago" (o "Procesando...") | Cobra repartiendo entre efectivo y tarjeta | `handleConfirmSplit` (línea 407) | Deshabilitado si `paying` o `!splitEfectivo` o `!splitValid` |
| Clic en el fondo oscuro | Cierra el modal | `setSplitOpen(false)` (línea 287) | Siempre activo |

### Estados

- Cargando: el botón dice "Procesando..." y queda deshabilitado mientras `paying` es verdadero.
- Avisos:
  - `toast.success('Pago dividido — Efectivo: $X · Tarjeta: $Y' + cambioStr + cocina)`. `cambioStr` es `' — Cambio efectivo: $Z'` si hay cambio, vacío si no. `X` es `min(efectivo, total)`. Línea 232.
  - `toast.error('Error al procesar el pago')` si falla; el modal sigue abierto.
  - `toast.error('El pago se registró, pero la comanda no llegó a cocina. Avisa a cocina.')` si falla solo el aviso a cocina.
- Tras un cobro correcto: se cierra el modal y se vacía el ticket.

### Lógica que no se puede tocar

| Línea | Elemento | Para qué sirve |
|---|---|---|
| 58 | `splitOpen` | Muestra el modal |
| 60 | `splitEfectivo` | Texto del monto en efectivo |
| 61 | `splitEfectivoRef` | Referencia para enfocar el campo |
| 73-78 | `useEffect` de apertura | Vacía el campo y lo enfoca |
| 107 | `splitEfectivoNum` | Valor numérico del campo |
| 108 | `splitTarjeta` | `max(0, total - splitEfectivoNum)` |
| 109 | `splitCambio` | `splitEfectivoNum - total` si lo supera; 0 si no |
| 110 | `splitValid` | `splitEfectivoNum >= 0 && splitEfectivoNum <= total + 0.01` |
| 122-129 | `openSplitModal` | Abre el modal (valida ticket y turno) |
| 217-235 | `handleConfirmSplit` | Arma los pagos (`efectivo` por `min(efectivo, total)`, `credito` por `splitTarjeta`) y llama `createCuenta` con la lista de pagos |
| 182-193 | `cocinaTrasCobrar` | Resuelve las comandas tras cobrar |

### Rarezas

- Cálculos mostrados: tarjeta = total − efectivo; "Cambio en Efectivo" = efectivo − total. Como el límite de validez es `total + 0.01`, el efectivo no puede superar el total por más de un centavo; el recuadro "Cambio en Efectivo" solo puede mostrar como máximo ese centavo. Si el efectivo supera el límite, el botón queda deshabilitado y el único indicio es el borde amarillo.
- Si el efectivo cubre exactamente el total, `splitTarjeta` es 0 y solo se registra un pago en efectivo; si el efectivo es "0", solo se registra el pago con tarjeta.
- El importe de tarjeta se registra siempre con el método `credito`.
- Un atajo que supera el total deja el modal en estado inválido (borde amarillo y botón deshabilitado) sin mensaje.
- El bloque de resultado no aparece mientras el campo está vacío; con "0" escrito sí aparece, mostrando "Cubierto por Tarjeta".
- Regla de turno: igual que el cobro simple, se verifica al abrir (`openSplitModal`).
- Los iconos de efectivo y tarjeta son SVG dibujados en línea, no emojis.

---

## 6. Dividir cuenta, por persona

El modal tiene un contenedor común (encabezado, pestañas y pie) y dos cuerpos. Esta sección documenta el contenedor y la pestaña "Por persona"; la sección 7 documenta la pestaña "Partes iguales" y remite al contenedor.

### Archivo y líneas

`SplitAccountModal.tsx`:

- Contenedor del modal: líneas 897-1078. Encabezado 926-959, pestañas 962-994, cuerpo 998-1031, pie 1034-1076. Tarjeta de ancho máximo 600 px y alto máximo 85 vh; fondo `rgba(0,0,0,0.75)`; `zIndex: 1050`.
- Cuerpo de "Por persona" (`TabPorPersona`): líneas 140-497 (JSX 156-496).
  - Sección "Personas": líneas 158-259.
  - Sección de ítems: líneas 261-423.
  - Sección "Cobro": líneas 425-494.
- `MethodSelector`: líneas 88-119.
- Se monta desde `TicketPanel.tsx` líneas 425-434, solo mientras `splitAccountOpen` es verdadero.

### Qué muestra

Contenedor:

- Título "Dividir Cuenta" y botón "×" de cierre.
- Dos pestañas: "Por persona" y "Partes iguales" (la activa va en lima con subrayado).
- Pie: "Cancelar" y "Cobrar todo".

Pestaña "Por persona":

- Rótulo "Personas", campo de nombre con placeholder "Nombre de persona..." y botón "+ Agregar".
- Si ya hay personas: una etiqueta redonda por persona, con punto de color, su nombre y un botón "×".
- Si hay al menos una persona, el rótulo "Ítems — toca para asignar" y una fila por ítem del ticket:
  - Sin asignar: el símbolo "⚠" al principio, borde ámbar, `{qty}× {nombre}` y el importe de la línea con formato de moneda (por ejemplo `$58.00`).
  - Asignado: punto con el color de la persona, `{qty}× {nombre}`, `→ {nombre de la persona}` y el importe.
  - Al tocar una fila se despliega: "Asignar a:" y un botón redondeado por persona; si el ítem está asignado, también "Sin asignar".
- Si hay al menos una persona, el rótulo "Cobro" y una tarjeta por persona con punto de color, nombre, su total con IVA (formato moneda) y el selector de método.
- Selector de método (`MethodSelector`), cuatro botones con emoji + texto: "💵 Efectivo", "💳 Crédito", "🏦 Débito", "🎁 Cortesía".

### Campos

| Etiqueta | Tipo | Valor inicial | Validación o límite |
|---|---|---|---|
| "Nombre de persona..." (placeholder) | texto | `''` | Se recorta con `trim()`; vacío no agrega. Sin límite de longitud ni de nombres repetidos. Enter agrega |
| Método de cobro por persona ("Efectivo", "Crédito", "Débito", "Cortesía") | selector de uno | ninguno (el `Map` `metodoMap` empieza vacío) | Obligatorio para cada persona para habilitar "Cobrar todo" |
| Asignación de ítem ("Asignar a:") | selector de persona | sin asignar | Cada ítem se asigna completo (toda su cantidad) a una persona; no se puede repartir la cantidad |

### Acciones

| Texto literal | Qué hace | Función que llama | Deshabilitado u oculto |
|---|---|---|---|
| "×" (encabezado) | Cierra el modal | `onCancel` (prop; en TicketPanel `() => setSplitAccountOpen(false)`) | Nunca deshabilitado |
| "Por persona" | Muestra la pestaña por persona | `setTab('persona')` (línea 973) | Nunca |
| "Partes iguales" | Muestra la pestaña de partes iguales | `setTab('iguales')` (línea 973) | Nunca |
| "+ Agregar" | Agrega la persona con el nombre escrito | `onAddPerson` → `addPerson` (línea 764) | Deshabilitado si `!newPersonName.trim()` |
| Tecla Enter en el campo de nombre | Igual que "+ Agregar" | `addPerson` (línea 177) | Sin deshabilitar propio: `addPerson` ignora un nombre vacío |
| "×" en la etiqueta de persona | Quita a la persona, sus asignaciones y su método | `onRemovePerson` → `removePerson` (línea 777) | Nunca deshabilitado |
| Fila de ítem | Despliega o contrae el selector de asignación | `onSetActiveItem(isOpen ? null : item.id)` → `setActiveItemId` (línea 287) | Solo aparece con al menos una persona |
| Botón con el nombre de una persona (dentro de "Asignar a:") | Asigna todo el ítem a esa persona y cierra el selector | `onAssignItem` → `assignItem` (línea 796) | Solo visible con el selector desplegado |
| "Sin asignar" | Quita la asignación y cierra el selector | `onUnassignItem` → `unassignItem` (línea 807) | Solo visible si el ítem ya está asignado por completo |
| "💵 Efectivo" / "💳 Crédito" / "🏦 Débito" / "🎁 Cortesía" | Fija el método de esa persona | `onSetMetodo` → `setMetodo` (línea 816) | Solo aparece con la persona agregada |
| "Cancelar" (pie) | Cierra el modal | `onCancel` (línea 1044) | Nunca deshabilitado |
| "Cobrar todo" (o "Procesando...") | Cobra una cuenta por persona | `handleConfirm` → `handleConfirmPersona` (línea 825); luego `onConfirm(splits)` | Deshabilitado si `!canConfirm` o `confirming`. En esta pestaña `canConfirm = canConfirmPersona` |
| Clic en el fondo oscuro | Cierra el modal | `onCancel` (línea 899) | Siempre activo |

### Estados

- Cargando: el botón de confirmar cambia a "Procesando..." mientras `confirming` es `true` (el estado cambia antes y después de `await onConfirm(splits)`; en TicketPanel también se marca `paying`).
- Sin datos: sin personas solo se ve el bloque "Personas"; las secciones de ítems y "Cobro" no aparecen. No hay texto de ayuda.
- Condición para habilitar "Cobrar todo" (`canConfirmPersona`, líneas 756-759): al menos una persona, ninguna unidad sin asignar (`unassignedQty === 0`) y método elegido para cada persona. No hay mensaje que diga qué falta; el indicio visual es el "⚠" y el borde ámbar de los ítems sin asignar.
- Avisos (en `handleConfirmSplitAccount`, TicketPanel líneas 237-266):
  - `toast.success('Cuenta dividida entre {n} persona(s)' + cocina)`; la palabra es "persona" si `n` es 1 y "personas" en otro caso.
  - `toast.error('Error al cobrar a {nombre}')` si falla el cobro de una persona; el bucle se detiene (`break`) y el modal sigue abierto.
  - `toast.error('El pago se registró, pero la comanda no llegó a cocina. Avisa a cocina.')` si falla solo el aviso a cocina.
- Tras éxito de todas: se cierra el modal y se vacía el ticket.
- Error al cobrar: no hay reversión de las cuentas ya creadas antes del fallo (ver Rarezas).

### Lógica que no se puede tocar

| Línea | Elemento | Para qué sirve |
|---|---|---|
| 9-33 | `Person`, `AssignmentMap`, `PersonSplit`, `SplitAccountModalProps` | Tipos. `PersonSplit` (`nombre`, `items`, `metodo`, `subtotal`, `iva`, `total`) es lo que recibe TicketPanel |
| 37-44 | `TAX_RATE`, `PERSON_COLORS`, `METODOS` | IVA, colores de persona (6, rotan) y los 4 métodos con su texto y emoji |
| 48-65 | `calcPersonTotal` | Subtotal, IVA y total de una persona según sus ítems asignados |
| 67-75 | `totalUnassignedQty` | Unidades sin asignar |
| 77-79 | `fmtMoney` | Formato moneda `es-MX` / `MXN` |
| 88-119 | `MethodSelector` | Selector de método de cobro |
| 732 | `useState tab` | Pestaña activa (inicia `'persona'`) |
| 735 | `useState persons` | Personas agregadas |
| 736 | `useState assignments` | Mapa ítem → lista `{ personId, qty }` |
| 737 | `useState newPersonName` | Texto del campo de nombre |
| 738 | `useState metodoMap` | Método elegido por persona |
| 739 | `useState activeItemId` | Ítem con el selector desplegado |
| 740 | `useState confirming` | Cobro en curso |
| 743 | `useState numPersons` | Personas de la pestaña "Partes iguales" |
| 744 | `useState metodoIguales` | Método por posición en "Partes iguales" |
| 747 | `useRef nameInputRef` | Reenfoca el campo de nombre tras agregar |
| 749 | `if (!open) return null` | Oculta el modal si `open` es falso (después de los hooks) |
| 752-761 | `grandTotal`, `grandIva`, `grandTotalWithTax`, `unassignedQty`, `canConfirmPersona`, `canConfirmIguales` | Totales y condiciones de confirmación |
| 764-775 | `addPerson` | Crea la persona con `crypto.randomUUID()` y color `PERSON_COLORS[persons.length % 6]`, vacía el campo y reenfoca |
| 777-794 | `removePerson` | Quita persona, asignaciones y método |
| 796-805 | `assignItem` | Asigna el ítem completo (`qty: item.qty`) a una persona |
| 807-814 | `unassignItem` | Deja el ítem sin asignar |
| 816-822 | `setMetodo` | Fija el método de una persona |
| 825-857 | `handleConfirmPersona` | Arma un `PersonSplit` por persona (ítems asignados, método, subtotal, iva, total) y llama `onConfirm` |
| 894-895 | `canConfirm`, `handleConfirm` | Eligen condición y acción según la pestaña |

### Rarezas

- Cálculo mostrado: el total de cada persona es `subtotal asignado × 1.16`; no incluye ningún descuento del ticket. `handleConfirmSplitAccount` llama `createCuenta` con descuento `0`.
- El código y su comentario (línea 15) mencionan que se podría repartir una cantidad (2 + 1), pero la interfaz asigna siempre la cantidad completa del ítem a una sola persona.
- El valor `p.color` se usa para el punto y el borde; con más de 6 personas los colores se repiten.
- "Cortesía" cuenta como método de cobro y se registra como pago con ese método por el total de la persona.
- Los emojis "💵", "💳", "🏦", "🎁" y el símbolo "⚠" se usan como iconos.
- Los totales por persona incluyen IVA, pero cada cuenta se crea con `createCuenta`, que recalcula el IVA sobre los ítems de esa persona.
- Si falla el cobro de una persona, las personas anteriores ya fueron cobradas y el modal queda abierto con el mismo contenido; no hay reversión ni aviso de qué cuentas sí se crearon.
- La comanda de cocina se liga a la primera cuenta creada (`primeraCuentaId`).
- `cajaId` llega al modal pero se ignora dentro de él (`cajaId: _cajaId`); el cobro usa el de TicketPanel. El botón "Dividir Cuenta" del panel no verifica turno (ver sección 2).
- El estado del modal vive en el propio componente: al cerrarlo (que lo desmonta) se pierde todo lo capturado. Cambiar de pestaña conserva el estado de la otra.
- Las etiquetas "Personas", "Cobro" y las demás se muestran en mayúsculas por CSS.

---

## 7. Dividir cuenta, a partes iguales

Comparte con la sección 6 el contenedor (título "Dividir Cuenta", "×", las dos pestañas, "Cancelar", "Cobrar todo", clic en el fondo, `onCancel`, `handleConfirm`, `confirming`). Aquí solo se documenta el cuerpo de la pestaña "Partes iguales".

### Archivo y líneas

`SplitAccountModal.tsx` componente `TabIguales`: líneas 509-720 (JSX 521-719). Se muestra cuando `tab === 'iguales'` (líneas 1016-1030). Contenedor compartido: líneas 897-1078.

### Qué muestra

- Recuadro central: rótulo "Total a dividir" y el total con IVA en grande (formato moneda, p. ej. `$116.00`).
- Rótulo "¿Cuántas personas?" con un contador: botón "−", el número de personas y botón "+", seguido de `{importe} / persona` (formato moneda). Si el reparto no es exacto, añade `(último: {importe})` en ámbar.
- Si no es exacto, un aviso en ámbar: "El monto no es divisible de manera exacta. La diferencia de {diferencia} se agrega a la última persona."
- Rótulo "Cobro por persona" y una tarjeta por persona con punto de color, "Persona {n}", su importe y el selector de método ("💵 Efectivo", "💳 Crédito", "🏦 Débito", "🎁 Cortesía").
- Pie: "Cancelar" y "Cobrar todo".

### Campos

| Etiqueta | Tipo | Valor inicial | Validación o límite |
|---|---|---|---|
| "¿Cuántas personas?" | número con botones − y + | 2 (`numPersons`) | Mínimo 2, máximo 10 (`Math.max(2, ...)` y `Math.min(10, ...)`) |
| Método de cobro por persona | selector de uno | ninguno (`metodoIguales` vacío) | Obligatorio para cada una de las `numPersons` personas para habilitar "Cobrar todo" |

### Acciones

| Texto literal | Qué hace | Función que llama | Deshabilitado u oculto |
|---|---|---|---|
| "−" | Reduce el número de personas | `onSetNumPersons(Math.max(2, numPersons - 1))` → `setNumPersons` (línea 571) | Deshabilitado si `numPersons <= 2` |
| "+" | Aumenta el número de personas | `onSetNumPersons(Math.min(10, numPersons + 1))` → `setNumPersons` (línea 603) | Deshabilitado si `numPersons >= 10` |
| "💵 Efectivo" / "💳 Crédito" / "🏦 Débito" / "🎁 Cortesía" | Fija el método de esa posición | `onSetMetodoIguales` (línea 1022: copia el `Map` y asigna `idx`) | Siempre visibles para las `numPersons` personas |
| "Cobrar todo" (o "Procesando...") | Cobra una cuenta por persona | `handleConfirm` → `handleConfirmIguales` (línea 859); luego `onConfirm(splits)` | Deshabilitado si `!canConfirmIguales` o `confirming` |
| Pestaña "Por persona", "Cancelar", "×", clic en el fondo | Ver sección 6 | Ver sección 6 | Ver sección 6 |

### Estados

- Cargando: igual que la sección 6 ("Procesando..." mientras `confirming`).
- Sin datos: no aplica; siempre hay al menos 2 personas.
- Reparto no exacto: se muestran el texto `(último: {importe})` y el aviso ámbar.
- Avisos: los mismos de la sección 6 (`toast.success('Cuenta dividida entre {n} personas' + cocina)`, `toast.error('Error al cobrar a Persona {n}')`, etc.). El `nombre` de cada cuenta es `Persona {n}`.
- Error: igual que la sección 6 (el bucle se detiene en la primera falla).

### Lógica que no se puede tocar

| Línea | Elemento | Para qué sirve |
|---|---|---|
| 516 | `baseAmount` (en `TabIguales`) | `floor((total / n) * 100) / 100`: importe por persona, redondeado hacia abajo al centavo |
| 517-519 | `remainder`, `isEven` | Diferencia que queda y si el reparto es exacto |
| 743 | `useState numPersons` | Número de personas (2 a 10) |
| 744 | `useState metodoIguales` | Método por posición |
| 752-754 | `grandTotal`, `grandIva`, `grandTotalWithTax` | Total del ticket con IVA que se divide |
| 760-761 | `canConfirmIguales` | Verdadero si cada una de las `numPersons` posiciones tiene método |
| 859-892 | `handleConfirmIguales` | Arma un `PersonSplit` por persona: `total` = `baseAmount`, y la última suma `remainder`; `subtotal` = `round(total / 1.16, 2 dec)`, `iva` = `total - subtotal`; `items` = todos los ítems del ticket; llama `onConfirm` |

### Rarezas

- Cálculo mostrado: el importe por persona es el total con IVA dividido entre `n`, redondeado hacia abajo al centavo; la diferencia se suma a la última persona. El texto "El monto no es divisible de manera exacta..." sale cuando la diferencia es distinta de 0.
- Cada persona recibe en su `PersonSplit` la lista completa de ítems del ticket (`items: allItems`, línea 866-871), con la cantidad completa. `handleConfirmSplitAccount` (TicketPanel línea 237) llama `createCuenta` con `split.items` y `split.metodo`, y `createCuenta` calcula subtotal, IVA, total y el monto del pago a partir de esos ítems (`queries/pos.ts` líneas 117-125). El código de TicketPanel no usa `split.subtotal`, `split.iva` ni `split.total`. Por eso, en esta pestaña cada cuenta se guarda con el total completo del ticket, no con la parte de cada persona. No queda claro si esto es intencional.
- Al bajar `numPersons`, los métodos elegidos para posiciones superiores quedan en el `Map` pero no se usan.
- "Persona {n}" es fijo: no se pueden capturar nombres en esta pestaña.
- No se aplica el descuento del ticket (descuento `0`).
- Los emojis "💵", "💳", "🏦", "🎁" se usan como iconos.

---

## 8. Gestionar menú

### Archivo y líneas

`MenuManagementModal.tsx` líneas 86-311 (JSX). Tarjeta de 480 px de ancho, alto máximo 80 vh, fondo `rgba(0,0,0,0.75)`, `zIndex: 1000`. Dentro se monta el asistente `AddProductWizard` (líneas 303-309, ver sección 9). Estilos de botones pequeños en líneas 314-327.

### Qué muestra

- Encabezado: título "Menú"; debajo `{activeCount} activos · {products.length} total`.
- Botón con icono "+" y el texto "Agregar".
- Botón de cierre con icono "X".
- Fila de chips con las categorías del club (con desplazamiento horizontal); cada chip muestra `{cat.nombre}` y, en pequeño, `{activos}/{total}` de esa categoría. Solo una categoría está seleccionada.
- Lista de productos de la categoría seleccionada, con, en cada fila:
  - Interruptor de activo (sin etiqueta de texto).
  - Interruptor de cocina (naranja `#F97316` cuando está activo), con el texto "🍳" a su lado y el `title` "Requiere preparación en cocina".
  - Nombre del producto (recortado con puntos suspensivos).
  - Precio `$ {precio con 2 decimales}` (sin espacio: `$12.00`), con el `title` "Clic para editar".
  - Los productos inactivos se muestran con color atenuado.
- Al editar el precio: campo numérico y los botones "✓" y "✕" en lugar del precio.

### Campos

| Etiqueta | Tipo | Valor inicial | Validación o límite |
|---|---|---|---|
| Interruptor de activo (sin rótulo) | interruptor | `p.activo` | Ninguna |
| Interruptor "🍳" (title "Requiere preparación en cocina") | interruptor | `p.requiere_cocina` | Ninguna |
| Precio (sin rótulo; se edita al hacer clic sobre `$...`) | número, ancho 72 px, con foco automático | `String(p.precio)` (línea 283) | `parseFloat(editPrice)`; si es `NaN` o `<= 0` aparece "Precio inválido" y no se guarda |

### Acciones

| Texto literal | Qué hace | Función que llama | Deshabilitado u oculto |
|---|---|---|---|
| "Agregar" (con icono "+") | Abre el asistente de alta | `setShowWizard(true)` (línea 120) | Nunca deshabilitado |
| Icono "X" (cierre) | Cierra el modal | `onClose` (línea 130) | Nunca deshabilitado |
| Chip de categoría | Cambia la categoría seleccionada | `setSelectedCatId(cat.id)` (línea 149) | Nunca deshabilitado |
| Interruptor de activo | Activa o desactiva el producto | `toggleActivo(p)` (línea 204) | Nunca deshabilitado |
| Interruptor "🍳" | Marca o desmarca el producto como de cocina | `toggleCocina(p)` (línea 222) | Nunca deshabilitado |
| Precio `$...` | Entra en modo edición de precio | `setEditingId(p.id)` y `setEditPrice(String(p.precio))` (línea 283) | Solo visible cuando esa fila no está en edición |
| Tecla Enter en el campo de precio | Guarda el precio | `savePrice(p)` (línea 267) | — |
| Tecla Escape en el campo de precio | Cancela la edición | `setEditingId(null)` (línea 267) | — |
| "✓" | Guarda el precio | `savePrice(p)` (línea 278) | Solo visible durante la edición |
| "✕" | Cancela la edición | `setEditingId(null)` (línea 279) | Solo visible durante la edición |
| Clic en el fondo oscuro | Cierra el modal | `onClose` (línea 93) | Siempre activo |

### Estados

- Cargando: "Cargando..." centrado en la zona de la lista (líneas 182-185). Las filas y chips no muestran carga propia; los chips se ven vacíos hasta que llegan las categorías.
- Sin datos: "Sin productos en esta categoría" (línea 187).
- Error de carga: no hay aviso; si `getAllProducts` o `getCategories` devuelven error, simplemente no se actualizan los datos.
- Avisos (`toast`):
  - `toast.error('Error al actualizar')` si falla el cambio de activo o de cocina (líneas 57 y 65).
  - `toast.error('Precio inválido')` si el precio es `NaN` o `<= 0` (línea 72).
  - `toast.success('Precio actualizado')` al guardar el precio (línea 77).
  - `toast.error('Error al actualizar precio')` si falla el guardado (línea 79).
- Cambios de activo y de cocina: sin aviso de éxito; el interruptor cambia al terminar la petición (se actualiza el estado solo si la llamada tuvo éxito).

### Lógica que no se puede tocar

| Línea | Elemento | Para qué sirve |
|---|---|---|
| 21 | `clubId` | Club del usuario |
| 22 | `useState products` | Todos los productos del club (activos e inactivos) |
| 23 | `useState categories` | Categorías del club |
| 24 | `useState loading` | Muestra "Cargando..." (inicia `true`) |
| 25 | `useState editingId` | Producto cuyo precio se está editando |
| 26 | `useState editPrice` | Texto del precio en edición |
| 27 | `useState showWizard` | Muestra el asistente de alta |
| 28 | `useState selectedCatId` | Categoría seleccionada (inicia `null`) |
| 30 | `useMemo supabase` | Cliente de base de datos |
| 32-48 | `load` | Carga productos y categorías a la vez; si hay categorías y no hay una seleccionada, elige la primera |
| 50 | `useEffect` (dep. `[]`) | Llama `load` al montar |
| 52-59 | `toggleActivo` | Cambia `activo` en la base de datos y en el estado local |
| 61-68 | `toggleCocina` | Cambia `requiere_cocina` en la base de datos y en el estado local |
| 70-81 | `savePrice` | Valida y guarda el precio nuevo |
| 83 | `activeCount` | Total de productos activos |
| 84 | `filtered` | Productos de la categoría seleccionada (todos si `selectedCatId` es `null`) |
| 303-309 | Montaje de `AddProductWizard` | Recibe `open={showWizard}`, `categories`, `clubId`, `onSuccess` (cierra y recarga con `load()`) y `onCancel` |

### Rarezas

- No hay chip "Todos": siempre hay una categoría seleccionada (la primera), salvo que no existan categorías.
- Solo se pueden cambiar tres cosas: activo, requiere cocina y precio. El nombre, la categoría y el stock no se editan aquí.
- La lista incluye productos inactivos (atenuados); en el POS no aparecen porque el POS carga solo los activos.
- `getAllProducts` no trae las columnas de stock; el modal no muestra stock.
- El texto "Gestionar menú" no aparece en el encabezado del modal: el título es "Menú".
- Los dos interruptores no tienen rótulo visible; el de cocina se identifica por el "🍳" (emoji como icono) y por el `title`.
- Si se hace clic en el precio de otra fila mientras se edita una, la edición anterior se descarta sin guardar (cambia `editingId`).
- Los cambios no se reflejan en el POS hasta recargar (ver sección 1).
- El asistente se monta dentro del mismo contenedor de fondo. Su capa (`zIndex: 1200`) queda por encima.
- Mostrar el precio usa `$` pegado al importe (`$12.00`), distinto de la pantalla del POS (`$ 12.00`).

---

## 9. Alta de producto (asistente)

Asistente de tres pasos, abierto desde "Agregar" en "Gestionar menú". Solo existe en pantalla mientras `open` es verdadero (`if (!open) return null`, línea 339).

### Archivo y líneas

`AddProductWizard.tsx`, JSX del contenedor en las líneas 397-586:

- Tarjeta de 440 px de ancho máximo sobre fondo `rgba(0,0,0,0.8)`, `zIndex: 1200`.
- Encabezado: líneas 432-483.
- Cuerpo: líneas 486-518 (altura mínima 280 px; animación de entrada lateral).
- Pie: líneas 521-582.
- Paso 1 (`Step1Categoria`): líneas 61-119.
- Paso 2 (`Step2NombrePrecio`): líneas 131-226.
- Paso 3 (`Step3Confirm`): líneas 235-309.

### Qué muestra (común a los tres pasos)

- Título "Nuevo producto".
- Tres puntos de progreso (se rellenan los que son menores o iguales al paso actual).
- Botón de cierre "×".
- Pie con un botón izquierdo y uno derecho (ver Acciones).

### Campos (resumen)

| Etiqueta | Tipo | Valor inicial | Validación o límite |
|---|---|---|---|
| Categoría ("Selecciona una categoría") | selector de uno (cuadrícula de 3 columnas) | ninguna (`selectedCategory = null`) | Obligatoria para pasar del paso 1 |
| "Nombre del producto" | texto, con foco automático | `''` | `nombre.trim().length >= 2` |
| "Precio (MXN)" | número (`min={0}`, `step={0.5}`, placeholder "0.00", prefijo "$") | `''` | `precioNum > 0` y no `NaN` |

### Acciones (comunes)

| Texto literal | Qué hace | Función que llama | Deshabilitado u oculto |
|---|---|---|---|
| "×" (encabezado) | Cancela el asistente | `onCancel` (línea 470) | Nunca |
| "Cancelar" (solo paso 1) | Cancela el asistente | `onCancel` (línea 533) | Solo se muestra en el paso 1 |
| "← Atrás" (pasos 2 y 3) | Vuelve al paso anterior | `goBack` (línea 548) | Solo se muestra en los pasos 2 y 3 |
| "Continuar →" (pasos 1 y 2) | Avanza al paso siguiente | `handleRightClick` → `goForward` (línea 565) | Paso 1: deshabilitado sin categoría. Paso 2: deshabilitado si `!step2Valid` |
| "✓ Agregar al menú" (o "Guardando…") (paso 3) | Crea el producto | `handleRightClick` → `handleSave` (línea 361) | Deshabilitado mientras `saving` |
| Clic en el fondo oscuro | Cancela el asistente | `onCancel` (línea 407) | Siempre activo; en cualquier paso, pierde lo capturado |

### Estados (comunes)

- Cargando: el botón derecho del paso 3 dice "Guardando…" y queda deshabilitado mientras `saving` es `true`.
- Error: `toast.error('No se pudo agregar el producto')` si `createProducto` falla; además `console.error('[AddProductWizard] save failed:', err)`. El asistente permanece abierto en el paso 3.
- Éxito: no hay `toast.success`; se llama `onSuccess()` y el modal "Gestionar menú" cierra el asistente y recarga la lista.
- Reinicio: cada vez que `open` pasa a `true` se reinicia todo (paso 1, sin categoría, sin nombre, sin precio).

### Lógica que no se puede tocar

| Línea | Elemento | Para qué sirve |
|---|---|---|
| 9-21 | `IMG_CLASS_BY_CATEGORY` | Clase de color por nombre de categoría (copia de la de POSPage) |
| 23-31 | `CATEGORY_GRADIENT` | Degradado oscuro por clase para los pasos 1 y 3 |
| 33-41 | `PLACEHOLDER_BY_CLASS` | Texto de ejemplo del campo de nombre por clase |
| 45-51 | `AddProductWizardProps` | Propiedades del asistente (`open`, `categories`, `clubId`, `onSuccess`, `onCancel`) |
| 320 | `useState step` | Paso actual (1, 2 o 3) |
| 321 | `useState direction` | Dirección de la animación (`'forward'` o `'back'`) |
| 322 | `useState selectedCategory` | Categoría elegida |
| 323 | `useState nombre` | Nombre escrito |
| 324 | `useState precio` | Precio escrito (texto) |
| 325 | `useState saving` | Guardado en curso |
| 328-337 | `useEffect` (dep. `[open]`) | Reinicia todo al abrir |
| 342-346 | `imgClass`, `gradient`, `placeholder` | Valores derivados de la categoría elegida |
| 347-348 | `precioNum`, `step2Valid` | Precio numérico y validez del paso 2 |
| 351-358 | `goForward`, `goBack` | Cambian de paso y de dirección |
| 361-378 | `handleSave` | Llama `createProducto(supabase, clubId, { nombre: nombre.trim(), precio: precioNum, categoria_id })` y luego `onSuccess()` |
| 385-389 | `rightDisabled`, `rightLabel` | Habilitación y texto del botón derecho |
| 391-395 | `handleRightClick` | Despacha el botón derecho según el paso |
| 399-404 | Bloque `<style>` | Animaciones `slideInFromRight` y `slideInFromLeft` (200 ms) |

### Rarezas (comunes)

- El producto se crea con `activo: true` (lo agrega `createProducto`); el asistente no pide cocina, descripción, stock ni imagen. `requiere_cocina` queda al valor por omisión de la base de datos: no queda claro cuál es desde este código.
- El paso 3 pide "¿Todo correcto?" pero no ofrece "Editar" distinto de "← Atrás" y "×".
- El asistente usa la variable de color `--color-text-muted`, que no está definida en `app/globals.css` (el resto de la interfaz usa `--color-muted`); esos textos heredan el color del contenedor.
- El mapa `IMG_CLASS_BY_CATEGORY` está duplicado (POSPage y este archivo). Los degradados de este asistente son oscuros; los del POS, claros.
- Los puntos de progreso no son botones: no permiten saltar de paso.
- Los botones "Cancelar" y "← Atrás" del pie no declaran `fontFamily: 'inherit'`.

### Paso 1: Categoría

- Texto "Selecciona una categoría".
- Una baldosa por categoría (grid de 3 columnas) con el nombre de la categoría sobre un degradado oscuro según su clase. La seleccionada pierde el degradado, se tiñe de lima suave, muestra una "✓" arriba a la derecha y un contorno lima.
- Controles: baldosa de categoría (`onSelect` → `setSelectedCategory`, línea 81); "Cancelar" a la izquierda; "Continuar →" a la derecha (deshabilitado sin categoría).
- Sin datos: si `categories` está vacío, el cuerpo queda en blanco; no hay texto de ayuda.
- Campo: categoría (selector de uno), valor inicial ninguno.
- Rareza: la categoría no es una lista desplegable sino baldosas; las categorías sin entrada en `IMG_CLASS_BY_CATEGORY` toman el degradado de `'img-coffee'`.

### Paso 2: Nombre y precio

- Línea "Categoría: **{nombre de la categoría}**" con el enlace "← Cambiar" (vuelve al paso 1 llamando `onChangeCategory` → `goBack`).
- Rótulo "Nombre del producto" y campo de texto con foco automático y texto de ejemplo según la categoría (p. ej. "Ej: Cappuccino", "Ej: Agua Mineral 600ml", "Ej: Pala Head Flash", "Ej: Pelotas Head 3-pack", "Ej: Overgrip x3", "Ej: Raqueta de alquiler", "Ej: Bowl Proteico"). Si no hay texto para la clase, el placeholder es "Nombre del producto".
- Rótulo "Precio (MXN)" y campo numérico con prefijo "$" y placeholder "0.00".
- Controles: "← Cambiar"; "← Atrás" a la izquierda; "Continuar →" a la derecha (deshabilitado si el nombre tiene menos de 2 caracteres tras recortar o si el precio no es mayor que 0).
- Rareza: la validación no muestra mensajes; el único indicio es el botón "Continuar →" atenuado (opacidad 0.4). Dentro del paso 2 hay dos controles que hacen lo mismo ("← Cambiar" y "← Atrás").

### Paso 3: Confirmación

- Texto "Vista previa".
- Tarjeta de vista previa con degradado de la categoría: nombre (recortado), nombre de la categoría y el precio con formato de moneda de `Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })` (por ejemplo "$25.00").
- Texto "¿Todo correcto?".
- Controles: "← Atrás"; "✓ Agregar al menú" (o "Guardando…"; deshabilitado mientras guarda).
- Rareza: el "✓" del botón es un carácter de texto. La vista previa no se parece a la tarjeta real del POS (otro tamaño, otros colores, sin distintivos).

---

## 10. Historial de tickets

### Archivo y líneas

`TicketHistory.tsx` líneas 38-189 (JSX). Panel lateral derecho de 400 px de ancho y alto completo, con fondo `rgba(0,0,0,0.65)` detrás, `zIndex: 999` (por debajo de los modales de cobro, que usan 1000).

- Encabezado: líneas 57-72.
- Lista: líneas 74-172.
- Pie con estadísticas: líneas 174-186.

### Qué muestra

- Encabezado: "Historial del Día" (en mayúsculas por CSS) y debajo `{n} tickets — Total {monto} MXN`, donde el monto tiene el formato `$1,234.50`.
- Botón con icono "X" para cerrar.
- Una tarjeta por ticket pagado del día (de más reciente a más antiguo), con:
  - Un cuadro con icono SVG: dividido (ámbar), tarjeta (azul) o efectivo (lima).
  - `#{últimos 6 caracteres del id en mayúsculas}`.
  - `{hora HH:MM} · {n} productos` (hora en formato `es-MX`, 2 dígitos).
  - A la derecha, el total (`$1,234.50`) y debajo el método: "Dividido", "Tarjeta" o "Efectivo".
  - Insignia: "En caja ✓" (verde) si el ticket tiene `caja_id`, o "Sin turno" si no.
  - Al expandir: una línea por producto con `{cantidad}x {nombre}` y su importe.
- Pie (solo si hay tickets): dos recuadros, "Tickets" con el conteo y "Total" con el monto.

### Campos

No hay campos de entrada.

### Acciones

| Texto literal | Qué hace | Función que llama | Deshabilitado u oculto |
|---|---|---|---|
| Icono "X" | Cierra el panel | `onClose` (línea 67) | Nunca deshabilitado |
| Tarjeta de ticket (toda) | Expande o contrae el detalle de productos | `setExpanded(isExp ? null : t.id)` (línea 102) | Siempre activa. Solo una tarjeta expandida a la vez. El detalle solo se muestra si el ticket tiene ítems |
| Clic en el fondo oscuro | Cierra el panel | `onClose` (línea 45) | Siempre activo |

### Estados

- Cargando: "Cargando..." centrado (línea 78).
- Sin datos: "Sin tickets cobrados hoy" (línea 82). En este caso el encabezado muestra `0 tickets — Total $0.00 MXN` y el pie no aparece.
- Error: `getTicketsDelDia` devuelve una lista vacía si la consulta falla, así que un error se ve igual que "Sin tickets cobrados hoy". No hay aviso. Si `clubId` es nulo, el estado "Cargando..." no termina.
- Avisos (`toast`): esta pieza no emite ninguno.

### Lógica que no se puede tocar

| Línea | Elemento | Para qué sirve |
|---|---|---|
| 13-15 | `fmtHora` | Hora local `es-MX` con 2 dígitos de hora y minuto |
| 17-19 | `fmtMonto` | Formato `$` más importe con dos decimales y miles |
| 22 | `clubId` | Club del usuario |
| 23 | `useState tickets` | Tickets pagados del día |
| 24 | `useState loading` | Muestra "Cargando..." (inicia `true`) |
| 25 | `useState expanded` | Id del ticket expandido |
| 27-34 | `useEffect` (dep. `[clubId]`) | Carga los tickets con `getTicketsDelDia(supabase, clubId)` y quita el estado de carga |
| 36 | `totalDia` | Suma de los totales de la lista |
| 87-89 | `shortId`, `isSplit`, `isCard` | Número corto, si el pago fue dividido y si fue con tarjeta |

### Rarezas

- El número mostrado `#{shortId}` son los últimos 6 caracteres del `id` de la cuenta, no el `numero_ticket` (`SP-######`) que se guarda ni el `#SP-####` del panel del POS (ver sección 2).
- Método mostrado: "Dividido" si el ticket tiene más de un pago; "Tarjeta" si el método es `credito`, `debito` o contiene "tarjeta"; en cualquier otro caso (incluida "cortesia") se muestra "Efectivo". Una venta de cortesía aparece como "Efectivo".
- "Dividir Cuenta" genera un ticket independiente por persona; en el historial aparecen como tickets separados, sin vínculo visible.
- `{n} productos` cuenta líneas de ticket, no unidades, y siempre va en plural, incluso con 1 ("1 productos"). Lo mismo con "tickets".
- El rango del día es el día local del club (`localDayStart()` a `localDayEnd()`, funciones de `lib/format.ts` usadas en `queries/pos.ts`).
- Solo considera cuentas con `estado = 'pagada'`.
- No se actualiza solo: carga una vez al abrir y no vuelve a consultar mientras el panel está abierto.
- Un producto sin nombre recuperable se muestra como "Producto" (valor de reserva en la consulta).
- Para los tickets con cuenta dividida por "Partes iguales", el total mostrado es el de `cuentas.total` (ver Rarezas de la sección 7).
- El "✓" de "En caja ✓" es un carácter de texto usado como icono.
