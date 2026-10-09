const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/**
 * true si alguno de los textos contiene la búsqueda, sin distinguir mayúsculas
 * ni acentos ("cafe" encuentra "Café Solo"). Una búsqueda vacía coincide con todo.
 */
export function coincideBusqueda(busqueda: string, ...textos: (string | null | undefined)[]): boolean {
  const q = normalizar(busqueda.trim())
  if (q === '') return true
  return textos.some((t) => t != null && normalizar(t).includes(q))
}
