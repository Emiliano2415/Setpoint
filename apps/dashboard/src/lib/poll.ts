/**
 * Llama a `fn` cada `ms` milisegundos mientras la pestaña esté visible y
 * devuelve la función que lo detiene.
 *
 * Sustituye a las suscripciones en tiempo real: Neon no ofrece ese servicio.
 * Con la pestaña oculta no consulta, para no mantener despierta la base.
 */
export function poll(fn: () => void, ms: number): () => void {
  const id = setInterval(() => {
    if (document.visibilityState === 'visible') fn()
  }, ms)
  return () => clearInterval(id)
}
