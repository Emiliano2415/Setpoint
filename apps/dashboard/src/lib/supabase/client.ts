import { createClient as createNeonClient, SupabaseAuthAdapter } from '@neondatabase/neon-js'

// La Data API de Neon ejecuta a veces una consulta sin la identidad del usuario
// (la primera de una conexión nueva). La base responde entonces con el error
// SP001 sin haber cambiado nada (migración 20261007000006), así que repetir la
// petición es seguro también para las escrituras.
const SIN_IDENTIDAD = 'SP001'
const ESPERAS_MS = [150, 400, 1000]

const fetchConReintento: typeof fetch = async (input, init) => {
  for (let intento = 0; ; intento++) {
    const res = await fetch(input, init)
    if (res.status !== 400 || intento === ESPERAS_MS.length) return res
    const cuerpo = await res.clone().json().catch(() => null)
    if (cuerpo?.code !== SIN_IDENTIDAD) return res
    await new Promise((r) => setTimeout(r, ESPERAS_MS[intento]))
  }
}

// Cliente de Neon con la misma forma que el de Supabase: `auth.*` a través de
// SupabaseAuthAdapter (Neon Auth) y `from()` / `rpc()` contra la Data API,
// que es compatible con PostgREST. Por eso el resto de la app no cambia.
function build() {
  return createNeonClient({
    auth: {
      url: process.env.NEXT_PUBLIC_NEON_AUTH_URL!,
      adapter: SupabaseAuthAdapter(),
    },
    dataApi: {
      url: process.env.NEXT_PUBLIC_NEON_DATA_API_URL!,
      options: { global: { fetch: fetchConReintento } },
    },
  })
}

export type SupabaseClient = ReturnType<typeof build>

let client: SupabaseClient | undefined

/** Devuelve siempre el mismo cliente, para que todos los componentes compartan la sesión. */
export function createClient(): SupabaseClient {
  return (client ??= build())
}
