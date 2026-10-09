import { create } from 'zustand'

interface SearchState {
  query: string
  setQuery: (query: string) => void
}

/**
 * Texto del buscador de la barra superior. La barra lo escribe y cada pantalla
 * lo lee para filtrar su lista. No se guarda entre visitas y la barra lo vacía
 * al cambiar de pantalla.
 */
export const useSearchStore = create<SearchState>((set) => ({
  query: '',
  setQuery: (query) => set({ query }),
}))
