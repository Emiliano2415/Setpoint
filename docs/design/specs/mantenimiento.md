# Especificación — Mantenimiento

Módulo nuevo para la materia de Ingeniería de Planta. Las **pistas son los activos**. Alcance: ficha técnica, preventivo con bloqueo de agenda, órdenes correctivas, ocupación, disponibilidad, MTBF/MTTR, inspecciones por NOM y refacciones con punto de reorden.

La base de datos, las consultas y el esqueleto ya están hechos. **Quien implemente una pantalla solo escribe el JSX** del componente que le toca, sin cambiar su interfaz de props ni tocar los demás archivos.

## Qué existe

| Qué | Dónde |
|---|---|
| Migración (tablas, RLS, RPC, vistas, catálogo de 6 NOM) | `supabase/migrations/20261029000003_mantenimiento.sql` |
| Datos de demostración | `supabase/seed-mantenimiento.sql` (ya cargado en `production`) |
| Consultas, tipos y etiquetas | `apps/dashboard/src/lib/supabase/queries/mantenimiento.ts` |
| Ruta | `apps/dashboard/src/app/(dashboard)/mantenimiento/page.tsx` |
| Orquestador (datos + manejadores + modales) | `apps/dashboard/src/components/modules/mantenimiento/MantenimientoPage.tsx` |
| Una pantalla por archivo | `apps/dashboard/src/components/modules/mantenimiento/*.tsx` |
| Pestañas y periodos | `components/modules/mantenimiento/types.ts` |

Menú lateral (`Wrench`, tras Pistas), título de la barra superior (sin buscador) y `RUTAS_SISTEMA` de la landing ya están hechos.

## Reglas para implementar una pantalla

1. Abre la pantalla de Stitch con la herramienta MCP `download_file` a partir de su id (ver `docs/design/stitch/INDEX.md`; `get_screen` da el nombre del archivo). Usa los tokens y primitivas de `@/components/ds` (`Tabs`, `Card`, `StatCard`, `Table`, `Badge`, `Modal`, `Drawer`, `Field`, `Input`, `Select`, `Textarea`, `Switch`, `SegmentedControl`, `Button`, `Money`, `EmptyState`, `Skeleton`...).
2. Los datos llegan por props, ya cargados. **No llames a Supabase desde la pantalla.** Si necesitas un dato que no llega, avísalo en lugar de consultarlo.
3. Las escrituras son props `onXxx`. **`MantenimientoPage` implementa los manejadores `handleXxx`** y los pasa como `onXxx={handleXxx}`; ya muestran el toast de éxito o de error y recargan los datos. La pantalla solo llama, espera y reacciona al valor devuelto:
   - `Promise<boolean>`: `true` = hecho.
   - `Promise<Resultado | null>`: `null` = falló (el error ya se mostró; no mostrar otro).
4. Los modales y el drawer **no se abren solos**: reciben `open`/`orden`, y se cierran con `onClose()` cuando el manejador devuelve éxito.
5. Los estados con color: `operativa` verde (`success`), `mantenimiento` ámbar (`warning`), `fuera_de_servicio` rojo (`error`). Tareas: `vencida` rojo, `proxima` ámbar, `al_dia` verde. Refacciones: `Pedir` ámbar/rojo, `OK` verde. Etiquetas ya hechas en el archivo de consultas (`ESTADO_PISTA_LABEL`, `ESTADO_ORDEN_LABEL`, `ESTADO_TAREA_LABEL`, `ESTADO_NORMA_LABEL`, `COMPONENTES`, `PRIORIDADES`, `describirFrecuencia()`).
6. No se implementa lo que Stitch inventa: botón "Sincronizar", meta de MTBF, "tasa de resolución a primer intento", deltas de las tarjetas (ver `INDEX.md`).
7. Español de México. Fechas con `toLocaleDateString('es-MX')`; las que son `date` (`'YYYY-MM-DD'`) no se pasan por `new Date()` sin cuidar la zona (usa `new Date(y, m-1, d)`). Moneda con `fmtMXN()` o `Money`.
8. El contenedor de la página ya hace scroll (`h-full overflow-y-auto px-6 py-5`); la pantalla no fija altura.

Comprobar al terminar: `cd apps/dashboard && npx tsc --noEmit` y `npx eslint <tu archivo>`.

## Datos de demostración

6 pistas con ficha (la Pista 4 está en mantenimiento, con una preventiva en proceso y bloqueo hasta mañana), 7 tareas, 8 órdenes (OT-0001 a OT-0008: 5 correctivas cerradas, 1 preventiva en proceso, 2 correctivas abiertas), 6 refacciones (Driver y Panel de cristal en `Pedir`), 6 normas globales y 3 inspecciones (NOM-025 finalizada con un "no cumple", NOM-002 finalizada, NOM-029 en borrador). Las reservas de demostración solo cubren del 30/09 al 07/10, así que con el periodo de 30 días la ocupación sale baja (~12 %); es un efecto de los datos, no del cálculo.

## Indicadores (para el texto de ayuda de las tarjetas)

Periodo: los últimos N días locales, recortado a "ahora". Horario de operación: 07:00 a 22:00 (15 h al día por pista).

| Indicador | Fórmula |
|---|---|
| Horas disponibles | Σ días × pistas activas × 15 h |
| Horas reservadas | Σ duración de reservas no canceladas |
| Ocupación % | horas reservadas / horas disponibles × 100 |
| Horas fuera de servicio | Σ bloqueos de agenda (correctivos y preventivos) dentro del horario |
| Disponibilidad % | (horas disponibles − horas fuera) / horas disponibles × 100 |
| Fallas | órdenes correctivas reportadas en el periodo (con pista) |
| MTBF (h) | (horas disponibles − horas fuera) / fallas |
| MTTR (h) | promedio de (cierre − reporte) de las fallas ya cerradas |
| Costo de mantenimiento | Σ (mano de obra + refacciones) de las órdenes cerradas en el periodo |
| Horas de juego | Σ duración de reservas en check-in o finalizadas |
| Costo por hora de juego | costo de mantenimiento / horas de juego |
| Punto de reorden | consumo diario (salidas de 90 días / 90) × tiempo de entrega + stock de seguridad; `Pedir` si existencia ≤ punto |

La fila global (`pista_id = null`) suma las pistas. `null` en un indicador = no calculable (p. ej. MTBF sin fallas): mostrar "—".

---

## 1. Tablero de indicadores — `TableroMantenimiento.tsx`

Stitch: `320be25ae6354cd58ea9bd710d1b2947`

Datos: `getIndicadores` (global + por pista), `getSerieDiaria` (ocupación y disponibilidad por día, para la gráfica), `getPistasConEstado`, órdenes abiertas (`estado != cerrada`) y tareas vencidas o próximas. Todo cargado por la página; se recarga cada 60 s y tras cada escritura.

Props (`TableroMantenimientoProps`): `loading`, `pistas: PistaMantenimiento[]`, `indicadores: IndicadoresResultado | null` (`.global`, `.porPista`), `serie: PuntoSerieDiaria[]`, `ordenesAbiertas: OrdenTrabajo[]`, `tareasPorVencer: TareaPreventiva[]`, `periodoDias: 7 | 30 | 90`.

Manejadores: `onCambiarPeriodo(dias)` (la página recarga con el nuevo periodo; selector con `PERIODOS_DIAS`), `onAbrirPista(pistaId)` (abre la ficha), `onReportarFalla(pistaId?)` (abre el modal), `onIrA(tab)` (p. ej. "Ver todas las órdenes" → `'ordenes'`).

Las gráficas con Recharts (ya es dependencia) o SVG simple.

## 2. Ficha técnica de pista — `FichaPista.tsx`

Stitch: `920ef650b56c4c8993488484abc301f5`

Se muestra en lugar de las pestañas cuando hay pista elegida (`?pista=<id>`).

Datos: `pista: PistaMantenimiento` (ficha + estado efectivo + `ordenes_abiertas`, `ultimo_preventivo`, `proximo_bloqueo`), `indicadores: IndicadoresPista | null` (de esa pista), `ordenes` de la pista, `bloqueos: BloqueoPista[]` (vigentes o programados; `fin = null` = "hasta nuevo aviso"), `tareas` que aplican a la pista, `periodoDias`.

Manejadores: `onVolver()`, `onGuardarFicha(patch: FichaPistaPatch)` (campos: dimensiones, altura libre, superficie y fecha de instalación, cerramiento, luminarias y potencia, lux, uniformidad, fecha de medición, observaciones; **el estado operativo no se edita a mano**), `onReportarFalla()`, `onIniciarOrden(ordenId)`, `onCerrarOrden(orden)` (abre el drawer), `onLiberarPista()` (cierra los bloqueos vigentes; pedir confirmación con `ConfirmDialog`).

## 3. Plan preventivo — `PlanPreventivo.tsx`

Stitch: `50f803d1ffb74f7bb8c9e115ead42d4c`

Datos: `tareas: TareaPreventiva[]` (de la vista: `estado`, `avance_pct`, `proxima_fecha` —null en horas de uso—, `uso_acumulado_h`, `responsable_nombre`, `ultima_ejecucion`), `pistas`, `empleados`.

Manejadores: `onNuevaTarea()`, `onEditarTarea(tarea)`, `onDesactivarTarea(id)` (con confirmación), `onProgramarPreventivo(input)`. **Programar** vive dentro de esta pantalla (selector de pista que aplique, fecha/hora de inicio, fin opcional, responsable; es un mini formulario o popover, no tiene pantalla de Stitch propia). Si la tarea bloquea agenda y hay reservas en la ventana, el manejador devuelve `null` con el aviso; ofrecer "Programar de todos modos" reintentando con `forzar: true`.

## 4. Nueva tarea preventiva — `NuevaTareaModal.tsx`

Stitch: `b8d3062fed4745ccb30e99a07b72161d`

Datos: `pistas`, `empleados`, `refacciones` (catálogo para las refacciones de la tarea), `tarea` (si no es null, el modal edita).

Manejador: `onGuardar(input: NuevaTareaInput)` → `true` = guardado, entonces `onClose()`. Campos: nombre, descripción, componente, aplica a todas las pistas o a una lista (`pista_ids`, obligatoria si no son todas), frecuencia (`frecuencia_tipo`: días / semanas / meses / horas de uso, y `frecuencia_valor`), duración estimada en minutos, `bloquea_agenda`, responsable, pasos (lista de textos), refacciones (`{ refaccion_id, cantidad }`).

## 5. Órdenes de trabajo — `OrdenesTrabajo.tsx`

Stitch: `b6ef6f21c22c45d9bb395cd19bb37a65`

Datos: `ordenes: OrdenTrabajo[]` (hasta 200, abiertas primero; ya traen nombres de pista, reportó y responsable, `horas_reparacion`, `costo_total`, `norma_codigo`), `pistas`, `empleados`. **Filtrar en memoria** por estado, tipo y pista.

Manejadores: `onReportarFalla()`, `onIniciarOrden(ordenId, responsableId?)`, `onCerrarOrden(orden)` (abre el drawer), `onAbrirPista(pistaId)`.

## 6. Reportar falla — `ReportarFallaModal.tsx`

Stitch: `072e4cebeabc41cf8c8ffb2a6f78ec37`

Datos: `pistas` (con estado), `pistaIdInicial`.

Manejador: `onReportarFalla(input: ReportarFallaInput)` → `ReportarFallaResultado | null`. Campos: pista, componente (`COMPONENTES`), descripción (obligatoria), prioridad, "fuera de servicio" (si se marca, la pista queda bloqueada para reservar **hasta que se cierre la orden**; dejarlo claro en el texto). Si `reservas_afectadas` trae elementos, mostrar la lista (cliente, fecha y horario) antes de cerrar: **no se cancelan solas**. Luego `onClose()`.

## 7. Cerrar orden — `CerrarOrdenDrawer.tsx`

Stitch: `a3e5fe9b322c4dd29b0beba339b61d79`

Datos: `orden: OrdenTrabajo | null` (null = cerrado), `refacciones: Refaccion[]` con `existencia` y `unidad`.

Manejador: `onCerrarOrden(input: CerrarOrdenInput)` → `CerrarOrdenResultado | null`. Campos: causa (obligatoria en correctivas), acción realizada (obligatoria), costo de mano de obra, refacciones usadas (`{ refaccion_id, cantidad }`; no ofrecer más que la existencia), `liberarPista` (por omisión `true`; solo tiene sentido si `orden.fuera_de_servicio`). Mostrar el costo total estimado (mano de obra + Σ cantidad × `costo_unitario`). Si la existencia es insuficiente la base rechaza con un mensaje claro. Al éxito, `onClose()`.

## 8. Inspecciones por norma — `Inspecciones.tsx`

Stitch: `736d01e04de3445d943c32af7b6e8b3e`

Datos: `normas: NormaResumen[]` (6 NOM: `puntos`, `estado` sin_inspeccion / vencida / proxima / al_dia, `ultima_fecha`, `ultimo_cumplimiento_pct`, `proxima_fecha`, `borrador_id`), `inspecciones: InspeccionRow[]` (historial con `cumple`, `no_cumple`, `na`, `pendientes`, `cumplimiento_pct`, `ordenes_generadas`), `pistas`, `empleados`.

Manejadores: `onIniciarInspeccion(input: CrearInspeccionInput)` (crea el borrador y la página abre "Inspección en curso" sola), `onAbrirInspeccion(id)` (continuar un borrador con `norma.borrador_id` o ver una finalizada). `pistaId` es opcional: sin pista = inspección general de instalaciones.

## 9. Inspección en curso — `InspeccionEnCurso.tsx`

Stitch: `ef6bce8cc41a46fdad65177ded10acbc`

Se muestra en lugar de las pestañas cuando hay una inspección abierta.

Datos: `detalle: InspeccionDetalle | null` → `inspeccion` (norma, fecha, responsable, estado, contadores) y `puntos` ordenados (`resultado`: `cumple` / `no_cumple` / `na` / `null` = sin evaluar, `observacion`, `evidencia_url`). Si `inspeccion.estado === 'finalizada'` se muestra en solo lectura.

Manejadores: `onVolver()`, `onGuardarResultados(resultados: ResultadoPuntoInput[])` (por punto o varios; solo cambia los campos que se mandan), `onFinalizar()` → `FinalizarInspeccionResultado | null`: exige todos los puntos evaluados y crea **una orden correctiva por cada "no cumple"** (mostrar los folios creados y el cumplimiento). Pedir confirmación antes de finalizar: no se puede editar después.

## 10. Refacciones — `Refacciones.tsx`

Stitch: `89727cb9486643f087120d01864207ae`

Datos: `refacciones: Refaccion[]` (con `consumo_diario`, `punto_reorden`, `estado` `'Pedir'` / `'OK'`, `cobertura_dias`, `valor_inventario`, `tiempo_entrega_dias`, `costo_unitario`, `proveedor`).

Manejadores: `onCrearRefaccion(input: NuevaRefaccionInput)` (nombre, unidad, stock de seguridad, tiempo de entrega, costo unitario, proveedor, existencia inicial), `onRegistrarEntrada(input: EntradaRefaccionInput)` (cantidad, costo de la compra opcional, motivo), `onCargarMovimientos(refaccionId)` (historial de entradas y salidas, las salidas por orden de trabajo traen `orden_id`, para un panel de detalle). La existencia **no se edita**: solo cambia con movimientos. Los formularios de "Nueva refacción" y "Registrar entrada" van dentro de esta pantalla (modales con `Modal` de `ds`).

---

## Notas técnicas para quien depure

- Lecturas sobre vistas `v_pistas_mantenimiento`, `v_ordenes_trabajo`, `v_tareas_preventivas`, `v_inspecciones`, `v_normas_resumen`, `v_refacciones` (con `security_invoker`: respetan la RLS del usuario).
- RPC: `rpc_reportar_falla`, `rpc_iniciar_orden`, `rpc_cerrar_orden`, `rpc_liberar_pista`, `rpc_programar_preventivo`, `rpc_crear_inspeccion`, `rpc_guardar_resultados_inspeccion`, `rpc_finalizar_inspeccion`, `rpc_indicadores_mantenimiento`, `rpc_serie_diaria_mantenimiento`.
- Una reserva que se solape con un bloqueo se rechaza con el error `SP002` y un mensaje en español ("La pista está bloqueada por mantenimiento..."). El módulo Pistas debería mostrarlo tal cual; no está cableado ahí todavía (hoy muestra el mensaje genérico de su `catch`).
- `pistas.en_mantenimiento` (módulo Pistas) y el estado operativo de la ficha se mantienen sincronizados por triggers.
- Las normas son un catálogo global (`club_id` nulo): los clubes lo leen pero no lo modifican. Los puntos de verificación son una guía de ejemplo para el curso, no el texto de la norma.
