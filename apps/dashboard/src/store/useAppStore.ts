import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  empleadoId: string
  email: string
  nombre: string
  rol: string
}

interface AppState {
  user: User | null
  clubId: string | null
  sidebarOpen: boolean
  permisos: string[]  // lista de acciones permitidas para el usuario actual
  setUser: (user: User | null) => void
  setClubId: (id: string) => void
  setPermisos: (permisos: string[]) => void
  toggleSidebar: () => void
  logout: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      clubId: null,
      sidebarOpen: true,
      permisos: [],
      setUser: (user) => set({ user }),
      setClubId: (id) => set({ clubId: id }),
      setPermisos: (permisos) => set({ permisos }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      logout: () => set({ user: null, clubId: null, permisos: [] }),
    }),
    {
      name: 'setpoint-app-store',
      partialize: (state) => ({ user: state.user, clubId: state.clubId, permisos: state.permisos }),
    },
  ),
)
