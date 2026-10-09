'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button, Field, Input } from '@/components/ds'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [verClave, setVerClave] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Credenciales incorrectas. Verifica tu email y contraseña.')
      setLoading(false)
      return
    }

    router.push('/pos')
    router.refresh()
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-[400px]">
        <div className="rounded-xl border border-outline-variant bg-surface-container p-8">
          <p className="text-xl font-semibold text-on-surface">
            Setpoint<span className="text-primary"> •</span>
          </p>
          <p className="mt-1 text-sm text-on-surface-variant">Sistema de gestión para clubes de pádel</p>

          <h1 className="mt-6 text-xl font-semibold text-on-surface">Iniciar sesión</h1>

          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
            <Field label="Correo electrónico" htmlFor="login-email">
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@tuclub.com"
              />
            </Field>

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="login-password" className="text-xs font-medium text-on-surface-variant">
                  Contraseña
                </label>
                <a href="/forgot-password" className="text-xs text-on-surface-variant hover:text-primary">
                  ¿Olvidaste tu contraseña?
                </a>
              </div>
              <div className="relative mt-1.5">
                <Input
                  id="login-password"
                  type={verClave ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pr-10"
                />
                <button
                  type="button"
                  aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  onClick={() => setVerClave((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-outline hover:text-on-surface"
                >
                  {verClave ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-error/40 bg-error/10 px-3 py-2.5 text-sm text-error"
              >
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>
              Iniciar sesión
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-outline">
          ¿Problemas para entrar? Pide acceso al propietario del club.
        </p>
      </div>
    </div>
  )
}
