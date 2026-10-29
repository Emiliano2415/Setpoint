# Diseños de Stitch

Proyecto **Setpoint PMS — Rediseño 2.0** (`projects/10125292601193926464`), sistema de diseño **Setpoint Suave (oscuro)** (`assets/14241705234032577666`).

Cada archivo `.html` es la exportación del diseño aprobado: la referencia exacta de estructura y clases para quien implementa. Los colores (`bg-surface-container`, `text-on-surface`…) existen con el mismo nombre en `apps/dashboard/src/app/globals.css`. Los iconos de Stitch son Material Symbols; en el código se usan los de `lucide-react`.

Stitch dibuja sobre un lienzo de **1280 px** de ancho.

## Punto de Venta — `pos/`

| Diseño | Archivo | Pantalla en Stitch |
|---|---|---|
| Punto de Venta | `punto-de-venta.html` | `b3b9f95a0a044ff29f1dbc26254915b5` |
| Punto de Venta — Cobro en efectivo | `punto-de-venta--cobro-efectivo.html` | `580655626e2849b380a8590db902fb9f` |
| Cobro con tarjeta | `punto-de-venta--cobro-tarjeta.html` | `3c470b046e1b4aac9e132a33ab83d909` |
| Pago dividido | sin HTML | `56cd0cc0293c4be0a35ba3d45319f825` |
| Dividir cuenta — por persona | sin HTML | `50995a21b44848a8b4077c60ed4a441d` |
| Dividir cuenta — partes iguales | sin HTML | `f0ca5f5719a243acbc700966bfb96540` |
| Gestionar menú | sin HTML | `58222c156bbe48858b333951308f6050` |
| Alta de producto — paso 1 | sin HTML | `c3ce6e2c45ca48258f66665c84388a20` |
| Alta de producto — paso 2 | sin HTML | `52c7b359c6d446cca60cde29e3d77c9c` |
| Alta de producto — paso 3 | sin HTML | `b87f157f28e34a208e8e278fa377ef4b` |
| Historial de tickets (panel) | sin HTML | `87f43f6d036c40088bc41984e4f2d728` |

La pantalla `be32ac930434454b9e902c9e5333154e` (también titulada "Punto de Venta") es la primera versión, con la maquetación rota. No se usa; Stitch no permite borrarla desde la API.

## Acceso y estados comunes — `comun/`

| Diseño | Archivo | Pantalla en Stitch |
|---|---|---|
| Acceso | `acceso.html` | `e3476c4a402948a48c242f6cba82ad3f` |
| Recuperar contraseña | `recuperar-contrasena.html` | `e9fae9eb84a74fe4ae0cd9637bfd1170` |
| Estado vacío (ejemplo: Descuentos) | `estado-vacio.html` | `2621a61058a14262a11b41b72b5098e0` |
| Estado cargando (ejemplo: Descuentos) | `estado-cargando.html` | `dc8a327d895340d38341357dce8c20a3` |
| Estado de error (ejemplo: Descuentos) | sin HTML | `d61b0127ccc24d1ba85a329a69fe82bb` |
| Confirmación destructiva (ejemplo: Descuentos) | sin HTML | `e440238140e04a55a7442593b9ad7958` |

## Mantenimiento — `mantenimiento/`

Módulo nuevo para la materia de Ingeniería de Planta (alcance "recomendado": ficha técnica, preventivo con bloqueo de agenda, órdenes correctivas, ocupación, disponibilidad, MTBF/MTTR, inspecciones por NOM y refacciones con punto de reorden).

| Diseño | Archivo | Pantalla en Stitch |
|---|---|---|
| Tablero de indicadores | sin HTML | `320be25ae6354cd58ea9bd710d1b2947` |
| Ficha técnica de pista | sin HTML | `920ef650b56c4c8993488484abc301f5` |
| Plan preventivo | sin HTML | `50f803d1ffb74f7bb8c9e115ead42d4c` |
| Nueva tarea preventiva | sin HTML | `b8d3062fed4745ccb30e99a07b72161d` |
| Órdenes de trabajo | sin HTML | `b6ef6f21c22c45d9bb395cd19bb37a65` |
| Reportar falla | sin HTML | `072e4cebeabc41cf8c8ffb2a6f78ec37` |
| Cerrar orden | sin HTML | `a3e5fe9b322c4dd29b0beba339b61d79` |
| Inspecciones por norma | sin HTML | `736d01e04de3445d943c32af7b6e8b3e` |
| Inspección en curso | sin HTML | `ef6bce8cc41a46fdad65177ded10acbc` |
| Refacciones | sin HTML | `89727cb9486643f087120d01864207ae` |

"sin HTML": Stitch ya no deja bajar el HTML con curl. Quien implemente lo pide con la herramienta MCP `download_file` a partir del id de la pantalla (`get_screen` da el nombre del archivo).

## Lo que Stitch inventa y no se implementa

Stitch añade detalles que el sistema no tiene. No se copian sin decisión previa:

- En el Punto de Venta: "Mesa / Barra" junto al ticket y las notas bajo cada producto ("Grifo", "Elaboración", "Pista 1-4").
- En las listas: el pie "Sincronizado con caja".
- En la barra superior: el estado del turno con nombre y hora (hoy es un texto fijo; pendiente de decisión del usuario).
- En Mantenimiento: el botón "Sincronizar", la meta de MTBF, la "tasa de resolución a primer intento" y los deltas de las tarjetas.
