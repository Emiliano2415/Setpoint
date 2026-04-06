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
    <div
      style={{
        padding: '16px',
        borderTop: '1px solid var(--color-border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
      }}
    >
      <div
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          background: 'rgba(108,242,13,0.10)',
          border: '2px solid rgba(108,242,13,0.20)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '16px',
          fontWeight: 700,
          color: 'var(--color-lime)',
        }}
      >
        {initials}
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>
          {user?.nombre ?? '—'}
        </div>
        <div
          style={{
            fontSize: '10px',
            fontWeight: 500,
            letterSpacing: '1px',
            textTransform: 'uppercase',
            color: 'var(--color-muted)',
          }}
        >
          {user?.rol ?? '—'}
        </div>
      </div>
      <button
        onClick={handleLogout}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 14px',
          borderRadius: '8px',
          border: '1px solid rgba(239,68,68,0.15)',
          background: 'transparent',
          color: '#EF4444',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: 'inherit',
          transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <LogOut size={14} />
        Cerrar Sesión
      </button>
    </div>
  )
}

export function Sidebar() {
  const pathname = usePathname()

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')

  return (
    <nav
      style={{
        width: '220px',
        flexShrink: 0,
        background: 'var(--color-bg2)',
        borderRight: '1px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
      }}
    >
      {/* Brand */}
      <div
        style={{
          padding: '20px 20px 16px',
          borderBottom: '1px solid var(--color-border-subtle)',
        }}
      >
        <div
          style={{
            fontSize: '20px',
            fontWeight: 900,
            letterSpacing: '-0.5px',
            color: 'var(--color-text)',
          }}
        >
          SETPOINT
          <span style={{ color: 'var(--color-lime)' }}>.</span>
        </div>
        <div
          style={{
            fontSize: '10px',
            fontWeight: 500,
            letterSpacing: '2px',
            textTransform: 'uppercase',
            color: 'var(--color-muted-dim)',
            marginTop: '2px',
          }}
        >
          Padel Management System
        </div>
      </div>

      {/* Nav principal */}
      <div style={{ padding: '16px 12px 8px' }}>
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

      {/* Sección Administración */}
      <div style={{ padding: '8px 12px' }}>
        <div
          style={{
            fontSize: '10px',
            fontWeight: 600,
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
            color: 'var(--color-muted-dim)',
            padding: '0 8px',
            marginBottom: '6px',
          }}
        >
          Administración
        </div>
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

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* User */}
      <SidebarUser />

      {/* Config */}
      <div style={{ padding: '8px 12px 12px', borderTop: '1px solid var(--color-border-subtle)' }}>
        <NavItem
          href="/configuracion"
          label="Configuración"
          icon={<Settings size={18} />}
          active={isActive('/configuracion')}
        />
      </div>
    </nav>
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
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        height: '40px',
        padding: '0 12px',
        borderRadius: '8px',
        textDecoration: 'none',
        fontSize: '13.5px',
        fontWeight: active ? 600 : 500,
        color: active ? 'var(--color-lime)' : 'var(--color-muted)',
        background: active ? 'rgba(108,242,13,0.10)' : 'transparent',
        transition: 'all 0.15s',
        position: 'relative',
        marginBottom: '2px',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
          e.currentTarget.style.color = 'var(--color-text-secondary)'
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'var(--color-muted)'
        }
      }}
    >
      {active && (
        <span
          style={{
            position: 'absolute',
            left: 0,
            top: '6px',
            bottom: '6px',
            width: '3px',
            background: 'var(--color-lime)',
            borderRadius: '0 3px 3px 0',
          }}
        />
      )}
      <span style={{ opacity: active ? 1 : 0.7, flexShrink: 0 }}>{icon}</span>
      {label}
    </Link>
  )
}
