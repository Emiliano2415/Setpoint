'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

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
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Background subtle grid */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundImage:
            'radial-gradient(circle at 20% 50%, rgba(108,242,13,0.04) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(108,242,13,0.02) 0%, transparent 40%)',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '400px',
          padding: '0 24px',
        }}
      >
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '8px',
            }}
          >
            <span
              style={{
                fontSize: '24px',
                fontWeight: 800,
                color: 'var(--color-text)',
                letterSpacing: '-0.5px',
              }}
            >
              SETPOINT
              <span style={{ color: 'var(--color-lime)' }}>.</span>
            </span>
          </div>
          <p
            style={{
              fontSize: '13px',
              color: 'var(--color-muted)',
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
            }}
          >
            Padel Management System
          </p>
        </div>

        {/* Card */}
        <div
          style={{
            background: 'var(--color-bg2)',
            border: '1px solid var(--color-border)',
            borderRadius: '20px',
            padding: '32px',
          }}
        >
          <h1
            style={{
              fontSize: '18px',
              fontWeight: 700,
              color: 'var(--color-text)',
              marginBottom: '4px',
            }}
          >
            Iniciar Sesión
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--color-muted)', marginBottom: '28px' }}>
            Accede al panel de gestión del club
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  color: 'var(--color-muted)',
                  marginBottom: '6px',
                }}
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@tuclub.com"
                required
                style={{
                  width: '100%',
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '8px',
                  padding: '9px 12px',
                  fontSize: '13px',
                  color: 'var(--color-text)',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 150ms ease',
                }}
                onFocus={(e) => (e.target.style.borderColor = 'rgba(108,242,13,0.3)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')}
              />
            </div>

            {/* Password */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label
                  htmlFor="password"
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: 'var(--color-muted)',
                  }}
                >
                  Contraseña
                </label>
                <a
                  href="/forgot-password"
                  style={{
                    fontSize: '11px',
                    color: 'var(--color-lime)',
                    textDecoration: 'none',
                  }}
                >
                  ¿Olvidaste tu contraseña?
                </a>
              </div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{
                  width: '100%',
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '8px',
                  padding: '9px 12px',
                  fontSize: '13px',
                  color: 'var(--color-text)',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 150ms ease',
                }}
                onFocus={(e) => (e.target.style.borderColor = 'rgba(108,242,13,0.3)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')}
              />
            </div>

            {/* Error */}
            {error && (
              <div
                style={{
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  fontSize: '13px',
                  color: '#EF4444',
                }}
              >
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                background: loading ? 'rgba(108,242,13,0.5)' : 'var(--color-lime)',
                color: 'var(--color-bg)',
                border: 'none',
                borderRadius: '8px',
                padding: '11px 16px',
                fontSize: '13px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 150ms ease',
                marginTop: '4px',
              }}
            >
              {loading ? 'Iniciando sesión...' : 'Ingresar al Sistema'}
            </button>
          </form>
        </div>

        <p
          style={{
            textAlign: 'center',
            marginTop: '24px',
            fontSize: '12px',
            color: 'var(--color-muted-dim)',
          }}
        >
          Setpoint PMS · v0.1.0
        </p>
      </div>
    </div>
  )
}
