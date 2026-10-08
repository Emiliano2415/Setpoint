'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const supabase = createClient()
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    })
    setSent(true)
    setLoading(false)
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
      <div style={{ width: '100%', maxWidth: '400px', padding: '0 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <span style={{ fontSize: '24px', fontWeight: 800, color: 'var(--color-text)' }}>
            SETPOINT<span style={{ color: 'var(--color-lime)' }}>.</span>
          </span>
        </div>
        <div
          style={{
            background: 'var(--color-bg2)',
            border: '1px solid var(--color-border)',
            borderRadius: '20px',
            padding: '32px',
          }}
        >
          {sent ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>✉️</div>
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-text)', marginBottom: '8px' }}>
                Revisa tu email
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--color-muted)' }}>
                Si existe una cuenta con ese email, recibirás un enlace para restablecer tu contraseña.
              </p>
              <a
                href="/login"
                style={{
                  display: 'inline-block',
                  marginTop: '20px',
                  fontSize: '12px',
                  color: 'var(--color-lime)',
                  textDecoration: 'none',
                }}
              >
                ← Volver al login
              </a>
            </div>
          ) : (
            <>
              <h1 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-text)', marginBottom: '4px' }}>
                Recuperar contraseña
              </h1>
              <p style={{ fontSize: '13px', color: 'var(--color-muted)', marginBottom: '24px' }}>
                Ingresa tu email y te enviaremos un enlace de recuperación.
              </p>
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <input
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
                  }}
                />
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    background: 'var(--color-lime)',
                    color: 'var(--color-bg)',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '11px 16px',
                    fontSize: '13px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    cursor: 'pointer',
                  }}
                >
                  {loading ? 'Enviando...' : 'Enviar enlace'}
                </button>
                <a
                  href="/login"
                  style={{ textAlign: 'center', fontSize: '12px', color: 'var(--color-muted)', textDecoration: 'none' }}
                >
                  ← Volver al login
                </a>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
