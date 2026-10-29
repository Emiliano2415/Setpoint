'use client'

// Módulo de Mantenimiento: orquesta los datos y TODOS los manejadores.
//
// Contrato con las pantallas (un archivo cada una, solo JSX):
//   - Esta página carga los datos con '@/lib/supabase/queries/mantenimiento' y los pasa por props.
//   - Los manejadores que escriben en la base viven AQUÍ, con nombre `handleXxx`, y se pasan
//     a las pantallas como props `onXxx`. Ya muestran el toast de éxito o de error y recargan
//     los datos: la pantalla solo los llama.
//   - Convención del valor devuelto: `Promise<boolean>` (true = hecho) cuando no hay datos que
//     mostrar; `Promise<Resultado | null>` (null = falló) cuando la pantalla necesita la
//     respuesta (folio creado, reservas afectadas, cumplimiento...).
//   - Los modales y el drawer se abren desde aquí (estado local); cada uno cierra con su `onClose`.
//   - La pista elegida vive en `?pista=<id>` (ficha técnica) y la inspección abierta en
//     estado local (pantalla "Inspección en curso").

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Tabs } from '@/components/ds'
import { createClient } from '@/lib/supabase/client'
import { poll } from '@/lib/poll'
import { useAppStore } from '@/store/useAppStore'
import {
  cerrarOrden,
  createRefaccion,
  createTarea,
  crearInspeccion,
  desactivarTarea,
  finalizarInspeccion,
  getBloqueosVigentes,
  getEmpleadosOpciones,
  getIndicadores,
  getInspeccion,
  getInspecciones,
  getMovimientosRefaccion,
  getNormasResumen,
  getOrdenes,
  getPistasConEstado,
  getRefacciones,
  getSerieDiaria,
  getTareas,
  guardarResultados,
  iniciarOrden,
  liberarPista,
  mensajeError,
  periodoUltimosDias,
  programarPreventivo,
  registrarEntradaRefaccion,
  reportarFalla,
  updateFichaPista,
  updateTarea,
} from '@/lib/supabase/queries/mantenimiento'
import type {
  BloqueoPista,
  CerrarOrdenInput,
  CerrarOrdenResultado,
  CrearInspeccionInput,
  EmpleadoOpcion,
  EntradaRefaccionInput,
  FichaPistaPatch,
  FinalizarInspeccionResultado,
  IndicadoresPista,
  IndicadoresResultado,
  InspeccionDetalle,
  InspeccionRow,
  MovimientoRefaccion,
  NormaResumen,
  NuevaRefaccionInput,
  NuevaTareaInput,
  OrdenTrabajo,
  PistaMantenimiento,
  ProgramarPreventivoInput,
  ProgramarPreventivoResultado,
  PuntoSerieDiaria,
  Refaccion,
  ReportarFallaInput,
  ReportarFallaResultado,
  ResultadoPuntoInput,
  TareaPreventiva,
} from '@/lib/supabase/queries/mantenimiento'
import { MANTENIMIENTO_TABS, type MantenimientoTab, type PeriodoDias } from './types'
import { TableroMantenimiento } from './TableroMantenimiento'
import { FichaPista } from './FichaPista'
import { PlanPreventivo } from './PlanPreventivo'
import { NuevaTareaModal } from './NuevaTareaModal'
import { OrdenesTrabajo } from './OrdenesTrabajo'
import { ReportarFallaModal } from './ReportarFallaModal'
import { CerrarOrdenDrawer } from './CerrarOrdenDrawer'
import { Inspecciones } from './Inspecciones'
import { InspeccionEnCurso } from './InspeccionEnCurso'
import { Refacciones } from './Refacciones'

const REFRESCO_MS = 60_000

/** Ejecuta una operación; si falla muestra el error y devuelve null. */
async function intentar<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn()
  } catch (e) {
    toast.error(mensajeError(e))
    return null
  }
}

export function MantenimientoPage() {
  const clubId = useAppStore((s) => s.clubId)
  const supabase = useMemo(() => createClient(), [])

  // ── Navegación ──────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<MantenimientoTab>('tablero')
  const [pistaId, setPistaIdState] = useState<string | null>(null)
  const [inspeccionId, setInspeccionId] = useState<string | null>(null)
  const [periodoDias, setPeriodoDias] = useState<PeriodoDias>(30)

  // ── Datos ───────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true)
  const [pistas, setPistas] = useState<PistaMantenimiento[]>([])
  const [indicadores, setIndicadores] = useState<IndicadoresResultado | null>(null)
  const [serie, setSerie] = useState<PuntoSerieDiaria[]>([])
  const [tareas, setTareas] = useState<TareaPreventiva[]>([])
  const [ordenes, setOrdenes] = useState<OrdenTrabajo[]>([])
  const [normas, setNormas] = useState<NormaResumen[]>([])
  const [inspecciones, setInspecciones] = useState<InspeccionRow[]>([])
  const [refacciones, setRefacciones] = useState<Refaccion[]>([])
  const [empleados, setEmpleados] = useState<EmpleadoOpcion[]>([])
  // Datos de la ficha de la pista elegida
  const [indicadoresPista, setIndicadoresPista] = useState<IndicadoresPista | null>(null)
  const [bloqueosPista, setBloqueosPista] = useState<BloqueoPista[]>([])
  // Inspección abierta
  const [detalleInspeccion, setDetalleInspeccion] = useState<InspeccionDetalle | null>(null)
  const [cargandoInspeccion, setCargandoInspeccion] = useState(false)

  // ── Modales ─────────────────────────────────────────────────────────────────
  const [fallaAbierta, setFallaAbierta] = useState(false)
  const [fallaPistaId, setFallaPistaId] = useState<string | null>(null)
  const [tareaModal, setTareaModal] = useState<{ tarea: TareaPreventiva | null } | null>(null)
  const [ordenACerrar, setOrdenACerrar] = useState<OrdenTrabajo | null>(null)

  // Pista en la URL (?pista=): se lee una vez al montar y se mantiene al navegar
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('pista')
    if (q) setPistaIdState(q)
  }, [])

  const setPistaId = useCallback((id: string | null) => {
    setPistaIdState(id)
    const url = new URL(window.location.href)
    if (id) url.searchParams.set('pista', id)
    else url.searchParams.delete('pista')
    window.history.replaceState(null, '', url)
  }, [])

  // ── Carga ───────────────────────────────────────────────────────────────────
  const reload = useCallback(async () => {
    if (!clubId) return
    try {
      const periodo = periodoUltimosDias(periodoDias)
      const [ps, ind, ser, ts, os, ns, is, rs, es, ficha] = await Promise.all([
        getPistasConEstado(supabase, clubId),
        getIndicadores(supabase, periodo),
        getSerieDiaria(supabase, periodo),
        getTareas(supabase, clubId),
        getOrdenes(supabase, clubId),
        getNormasResumen(supabase),
        getInspecciones(supabase, clubId),
        getRefacciones(supabase, clubId),
        getEmpleadosOpciones(supabase, clubId),
        pistaId
          ? Promise.all([getIndicadores(supabase, periodo, pistaId), getBloqueosVigentes(supabase, pistaId)])
          : Promise.resolve(null),
      ])
      setPistas(ps)
      setIndicadores(ind)
      setSerie(ser)
      setTareas(ts)
      setOrdenes(os)
      setNormas(ns)
      setInspecciones(is)
      setRefacciones(rs)
      setEmpleados(es)
      setIndicadoresPista(ficha ? (ficha[0].porPista[0] ?? null) : null)
      setBloqueosPista(ficha ? ficha[1] : [])
    } catch (e) {
      toast.error(mensajeError(e, 'Error cargando mantenimiento'))
    } finally {
      setLoading(false)
    }
  }, [supabase, clubId, periodoDias, pistaId])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    if (!clubId) return
    return poll(reload, REFRESCO_MS)
  }, [clubId, reload])

  const recargarInspeccion = useCallback(async () => {
    if (!inspeccionId) {
      setDetalleInspeccion(null)
      return
    }
    try {
      setDetalleInspeccion(await getInspeccion(supabase, inspeccionId))
    } catch (e) {
      toast.error(mensajeError(e, 'Error cargando la inspección'))
    } finally {
      setCargandoInspeccion(false)
    }
  }, [supabase, inspeccionId])

  useEffect(() => {
    if (!inspeccionId) return
    setCargandoInspeccion(true)
    recargarInspeccion()
  }, [inspeccionId, recargarInspeccion])

  // ── Manejadores: órdenes y fallas ───────────────────────────────────────────
  async function handleReportarFalla(input: ReportarFallaInput): Promise<ReportarFallaResultado | null> {
    const r = await intentar(() => reportarFalla(supabase, input))
    if (!r) return null
    toast.success(`Orden ${r.folio} creada`)
    if (r.reservas_afectadas.length > 0) {
      toast.warning(`Hay ${r.reservas_afectadas.length} reserva(s) en la pista bloqueada: atiéndelas desde Pistas`)
    }
    await reload()
    return r
  }

  async function handleIniciarOrden(ordenId: string, responsableId?: string | null): Promise<boolean> {
    const r = await intentar(() => iniciarOrden(supabase, ordenId, responsableId))
    if (!r) return false
    toast.success(`Orden ${r.folio} en proceso`)
    await reload()
    return true
  }

  async function handleCerrarOrden(input: CerrarOrdenInput): Promise<CerrarOrdenResultado | null> {
    const r = await intentar(() => cerrarOrden(supabase, input))
    if (!r) return null
    toast.success(`Orden ${r.folio} cerrada${r.pista_liberada ? ' · pista liberada' : ''}`)
    await reload()
    return r
  }

  async function handleLiberarPista(id: string): Promise<boolean> {
    const r = await intentar(() => liberarPista(supabase, id))
    if (!r) return false
    toast.success('Pista liberada')
    await reload()
    return true
  }

  // ── Manejadores: ficha técnica ──────────────────────────────────────────────
  async function handleGuardarFicha(id: string, patch: FichaPistaPatch): Promise<boolean> {
    const ok = await intentar(async () => {
      await updateFichaPista(supabase, id, patch)
      return true
    })
    if (!ok) return false
    toast.success('Ficha guardada')
    await reload()
    return true
  }

  // ── Manejadores: plan preventivo ────────────────────────────────────────────
  async function handleGuardarTarea(input: NuevaTareaInput, tareaId?: string): Promise<boolean> {
    if (!clubId) return false
    const ok = await intentar(async () => {
      if (tareaId) await updateTarea(supabase, tareaId, input)
      else await createTarea(supabase, clubId, input)
      return true
    })
    if (!ok) return false
    toast.success(tareaId ? 'Tarea actualizada' : 'Tarea creada')
    await reload()
    return true
  }

  async function handleDesactivarTarea(tareaId: string): Promise<boolean> {
    const ok = await intentar(async () => {
      await desactivarTarea(supabase, tareaId)
      return true
    })
    if (!ok) return false
    toast.success('Tarea quitada del plan')
    await reload()
    return true
  }

  async function handleProgramarPreventivo(input: ProgramarPreventivoInput): Promise<ProgramarPreventivoResultado | null> {
    const r = await intentar(() => programarPreventivo(supabase, input))
    if (!r) return null
    toast.success(`Orden ${r.folio} programada`)
    await reload()
    return r
  }

  // ── Manejadores: inspecciones ───────────────────────────────────────────────
  async function handleIniciarInspeccion(input: CrearInspeccionInput): Promise<boolean> {
    const id = await intentar(() => crearInspeccion(supabase, input))
    if (!id) return false
    setInspeccionId(id)
    await reload()
    return true
  }

  function handleAbrirInspeccion(id: string) {
    setInspeccionId(id)
  }

  function handleCerrarInspeccion() {
    setInspeccionId(null)
    setDetalleInspeccion(null)
  }

  async function handleGuardarResultados(resultados: ResultadoPuntoInput[]): Promise<boolean> {
    if (!inspeccionId) return false
    const ok = await intentar(async () => {
      await guardarResultados(supabase, inspeccionId, resultados)
      return true
    })
    if (!ok) return false
    await recargarInspeccion()
    return true
  }

  async function handleFinalizarInspeccion(): Promise<FinalizarInspeccionResultado | null> {
    if (!inspeccionId) return null
    const r = await intentar(() => finalizarInspeccion(supabase, inspeccionId))
    if (!r) return null
    toast.success(
      r.ordenes.length > 0
        ? `Inspección finalizada · ${r.ordenes.length} orden(es) correctiva(s) creada(s)`
        : 'Inspección finalizada sin hallazgos',
    )
    await Promise.all([recargarInspeccion(), reload()])
    return r
  }

  // ── Manejadores: refacciones ────────────────────────────────────────────────
  async function handleCrearRefaccion(input: NuevaRefaccionInput): Promise<boolean> {
    if (!clubId) return false
    const id = await intentar(() => createRefaccion(supabase, clubId, input))
    if (!id) return false
    toast.success('Refacción creada')
    await reload()
    return true
  }

  async function handleRegistrarEntrada(input: EntradaRefaccionInput): Promise<boolean> {
    if (!clubId) return false
    const ok = await intentar(async () => {
      await registrarEntradaRefaccion(supabase, clubId, input)
      return true
    })
    if (!ok) return false
    toast.success('Entrada registrada')
    await reload()
    return true
  }

  async function handleCargarMovimientos(refaccionId: string): Promise<MovimientoRefaccion[]> {
    return (await intentar(() => getMovimientosRefaccion(supabase, refaccionId))) ?? []
  }

  // ── Navegación y modales ────────────────────────────────────────────────────
  function handleAbrirModalFalla(id?: string | null) {
    setFallaPistaId(id ?? null)
    setFallaAbierta(true)
  }

  function handleIrA(destino: MantenimientoTab) {
    setPistaId(null)
    handleCerrarInspeccion()
    setTab(destino)
  }

  // ── Derivados ───────────────────────────────────────────────────────────────
  const ordenesAbiertas = useMemo(() => ordenes.filter((o) => o.estado !== 'cerrada'), [ordenes])
  const tareasPorVencer = useMemo(() => tareas.filter((t) => t.estado !== 'al_dia'), [tareas])
  const pistaElegida = pistaId ? (pistas.find((p) => p.pista_id === pistaId) ?? null) : null

  const tabsConConteo = MANTENIMIENTO_TABS.map((t) =>
    t.value === 'ordenes' ? { ...t, count: ordenesAbiertas.length } : t,
  )

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      {inspeccionId ? (
        <InspeccionEnCurso
          loading={cargandoInspeccion}
          detalle={detalleInspeccion}
          onVolver={handleCerrarInspeccion}
          onGuardarResultados={handleGuardarResultados}
          onFinalizar={handleFinalizarInspeccion}
        />
      ) : pistaId ? (
        pistaElegida ? (
          <FichaPista
            pista={pistaElegida}
            indicadores={indicadoresPista}
            periodoDias={periodoDias}
            ordenes={ordenes.filter((o) => o.pista_id === pistaId)}
            bloqueos={bloqueosPista}
            tareas={tareas.filter((t) => t.aplica_todas || t.pista_ids.includes(pistaId))}
            onVolver={() => setPistaId(null)}
            onGuardarFicha={(patch) => handleGuardarFicha(pistaId, patch)}
            onReportarFalla={() => handleAbrirModalFalla(pistaId)}
            onIniciarOrden={(ordenId) => handleIniciarOrden(ordenId)}
            onCerrarOrden={setOrdenACerrar}
            onLiberarPista={() => handleLiberarPista(pistaId)}
          />
        ) : (
          <div>{loading ? 'Cargando pista…' : 'La pista no existe o no está activa.'}</div>
        )
      ) : (
        <>
          <Tabs value={tab} onChange={setTab} tabs={tabsConConteo} />
          <div className="pt-4">
            {tab === 'tablero' && (
              <TableroMantenimiento
                loading={loading}
                pistas={pistas}
                indicadores={indicadores}
                serie={serie}
                ordenesAbiertas={ordenesAbiertas}
                tareasPorVencer={tareasPorVencer}
                periodoDias={periodoDias}
                onCambiarPeriodo={setPeriodoDias}
                onAbrirPista={setPistaId}
                onReportarFalla={handleAbrirModalFalla}
                onIrA={handleIrA}
              />
            )}
            {tab === 'preventivo' && (
              <PlanPreventivo
                loading={loading}
                tareas={tareas}
                pistas={pistas}
                empleados={empleados}
                onNuevaTarea={() => setTareaModal({ tarea: null })}
                onEditarTarea={(tarea) => setTareaModal({ tarea })}
                onDesactivarTarea={handleDesactivarTarea}
                onProgramarPreventivo={handleProgramarPreventivo}
              />
            )}
            {tab === 'ordenes' && (
              <OrdenesTrabajo
                loading={loading}
                ordenes={ordenes}
                pistas={pistas}
                empleados={empleados}
                onReportarFalla={() => handleAbrirModalFalla()}
                onIniciarOrden={handleIniciarOrden}
                onCerrarOrden={setOrdenACerrar}
                onAbrirPista={setPistaId}
              />
            )}
            {tab === 'inspecciones' && (
              <Inspecciones
                loading={loading}
                normas={normas}
                inspecciones={inspecciones}
                pistas={pistas}
                empleados={empleados}
                onIniciarInspeccion={handleIniciarInspeccion}
                onAbrirInspeccion={handleAbrirInspeccion}
              />
            )}
            {tab === 'refacciones' && (
              <Refacciones
                loading={loading}
                refacciones={refacciones}
                onCrearRefaccion={handleCrearRefaccion}
                onRegistrarEntrada={handleRegistrarEntrada}
                onCargarMovimientos={handleCargarMovimientos}
              />
            )}
          </div>
        </>
      )}

      <ReportarFallaModal
        open={fallaAbierta}
        onClose={() => setFallaAbierta(false)}
        pistas={pistas}
        pistaIdInicial={fallaPistaId}
        onReportarFalla={handleReportarFalla}
      />
      <NuevaTareaModal
        open={tareaModal !== null}
        onClose={() => setTareaModal(null)}
        pistas={pistas}
        empleados={empleados}
        refacciones={refacciones}
        tarea={tareaModal?.tarea ?? null}
        onGuardar={(input) => handleGuardarTarea(input, tareaModal?.tarea?.id)}
      />
      <CerrarOrdenDrawer
        orden={ordenACerrar}
        refacciones={refacciones}
        onClose={() => setOrdenACerrar(null)}
        onCerrarOrden={handleCerrarOrden}
      />
    </div>
  )
}
