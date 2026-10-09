# Diseños de Stitch

Proyecto **Setpoint PMS — Rediseño 2.0** (`projects/10125292601193926464`), sistema de diseño **Setpoint Suave (oscuro)** (`assets/14241705234032577666`).

Cada archivo `.html` es la exportación del diseño aprobado: la referencia exacta de estructura y clases para quien implementa. Los colores (`bg-surface-container`, `text-on-surface`…) existen con el mismo nombre en `apps/dashboard/src/app/globals.css`. Los iconos de Stitch son Material Symbols; en el código se usan los de `lucide-react`.

Stitch dibuja sobre un lienzo de **1280 px** de ancho.

## Punto de Venta — `pos/`

| Diseño | Archivo | Pantalla en Stitch |
|---|---|---|
| Punto de Venta | `punto-de-venta.html` | `b3b9f95a0a044ff29f1dbc26254915b5` |
| Punto de Venta — Cobro en efectivo | `punto-de-venta--cobro-efectivo.html` | `580655626e2849b380a8590db902fb9f` |

La pantalla `be32ac930434454b9e902c9e5333154e` (también titulada "Punto de Venta") es la primera versión, con la maquetación rota. No se usa; Stitch no permite borrarla desde la API.

## Acceso y estados comunes — `comun/`

| Diseño | Archivo | Pantalla en Stitch |
|---|---|---|
| Acceso | `acceso.html` | `e3476c4a402948a48c242f6cba82ad3f` |
| Recuperar contraseña | `recuperar-contrasena.html` | `e9fae9eb84a74fe4ae0cd9637bfd1170` |
| Estado vacío (ejemplo: Descuentos) | `estado-vacio.html` | `2621a61058a14262a11b41b72b5098e0` |
| Estado cargando (ejemplo: Descuentos) | `estado-cargando.html` | `dc8a327d895340d38341357dce8c20a3` |
| Estado de error | pendiente de generar | — |
| Confirmación destructiva | pendiente de generar | — |

## Lo que Stitch inventa y no se implementa

Stitch añade detalles que el sistema no tiene. No se copian sin decisión previa:

- En el Punto de Venta: "Mesa / Barra" junto al ticket y las notas bajo cada producto ("Grifo", "Elaboración", "Pista 1-4").
- En las listas: el pie "Sincronizado con caja".
- En la barra superior: el estado del turno con nombre y hora (hoy es un texto fijo; pendiente de decisión del usuario).
