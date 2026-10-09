'use client'

import { useState } from 'react'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button, Field, Input } from '@/components/ds'

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
    <div className="flex h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-[400px]">
        <div className="rounded-xl border border-outline-variant bg-surface-container p-8">
          <p className="text-xl font-semibold text-on-surface">
            Setpoint<span className="text-primary"> •</span>
          </p>
          <h1 className="mt-6 text-xl font-semibold text-on-surface">Recuperar contraseña</h1>

          {sent ? (
            <div className="mt-6">
              <div
                role="status"
                className="flex items-start gap-2 rounded-lg border border-success/40 bg-success/10 px-3 py-2.5 text-sm text-success"
              >
                <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                <span>Si el correo existe, recibirás el enlace en unos minutos.</span>
              </div>
            </div>
          ) : (
            <>
              <p className="mt-2 text-sm text-on-surface-variant">
                Escribe el correo de tu cuenta y te enviaremos un enlace para crear una contraseña nueva.
              </p>
              <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
                <Field label="Correo electrónico" htmlFor="forgot-email">
                  <Input
                    id="forgot-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@tuclub.com"
                  />
                </Field>
                <Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>
                  Enviar enlace
                </Button>
              </form>
            </>
          )}

          <a
            href="/login"
            className="mt-6 flex items-center justify-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface"
          >
            <ArrowLeft size={14} /> Volver a iniciar sesión
          </a>
        </div>
      </div>
    </div>
  )
}
