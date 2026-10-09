'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Monitor,
  Grid2x2,
  Clock,
  Package,
  Users,
  Wallet,
  UserCog,
  BarChart3,
  Settings,
  LogOut,
  Tag,
  History,
  XCircle,
} from 'lucide-react'
import { useAppStore } from '@/store'
import { createClient } from '@/lib/supabase/client'

const NAV_ITEMS = [
  { href: '/pos', label: 'Punto de Venta', icon: Monitor },
  { href: '/pistas', label: 'Pistas', icon: Grid2x2 },
  { href: '/comandas', label: 'Comandas', icon: Clock },
  { href: '/inventario', label: 'Inventario', icon: Package },
  { href: '/clientes', label: 'Clientes', icon: Users },
  { href: '/caja', label: 'Caja', icon: Wallet },
] as const

const ADMIN_ITEMS = [
  { href: '/empleados', label: 'Personal', icon: UserCog },
  { href: '/reportes', label: 'Reportes', icon: BarChart3 },
  { href: '/descuentos', label: 'Descuentos', icon: Tag },
  { href: '/historial', label: 'Historial', icon: History },
  { href: '/cancelaciones', label: 'Cancelaciones', icon: XCircle },
] as const

function SidebarUser() {
  const user = useAppStore((s) => s.user)
  const router = useRouter()

  const initials = user?.nombre
    ? user.nombre.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
    : '??'

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    useAppStore.getState().logout()
    router.push('/login')
  }

  return (
    <>
      <div className="flex items-center gap-3 rounded-lg border border-outline-variant bg-surface-container-high px-3 py-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
          {initials}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-on-surface">{user?.nombre ?? '—'}</div>
          <div className="truncate text-xs capitalize text-outline">{user?.rol ?? '—'}</div>
        </div>
      </div>
      <button
        type="button"
        onClick={handleLogout}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left text-xs text-on-surface-variant transition-colors hover:text-error"
      >
        <LogOut size={16} />
        Cerrar sesión
      </button>
    </>
  )
}

export function Sidebar() {
  const pathname = usePathname()

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')

  return (
    <aside className="flex w-[232px] shrink-0 flex-col justify-between border-r border-outline-variant bg-surface-container p-3">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 px-2 pt-1">
          <span className="text-base font-semibold text-on-surface">Setpoint</span>
          <span className="rounded border border-outline-variant px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
            PMS
          </span>
        </div>

        <nav className="flex flex-col gap-5 overflow-y-auto">
          <div className="flex flex-col gap-0.5">
            <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-outline">
              Operación
            </p>
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
              <NavItem
                key={href}
                href={href}
                label={label}
                icon={<Icon size={18} />}
                active={isActive(href)}
              />
            ))}
          </div>

          <div className="flex flex-col gap-0.5">
            <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-outline">
              Administración
            </p>
            {ADMIN_ITEMS.map(({ href, label, icon: Icon }) => (
              <NavItem
                key={href}
                href={href}
                label={label}
                icon={<Icon size={18} />}
                active={isActive(href)}
              />
            ))}
          </div>
        </nav>
      </div>

      <div className="flex flex-col gap-2 border-t border-outline-variant pt-3">
        <NavItem
          href="/configuracion"
          label="Configuración"
          icon={<Settings size={18} />}
          active={isActive('/configuracion')}
        />
        <SidebarUser />
      </div>
    </aside>
  )
}

function NavItem({
  href,
  label,
  icon,
  active,
}: {
  href: string
  label: string
  icon: React.ReactNode
  active: boolean
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
        active
          ? 'bg-surface-container-highest font-medium text-primary'
          : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
      }`}
    >
      {icon}
      {label}
    </Link>
  )
}
