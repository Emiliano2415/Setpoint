import { createClient as createNeonClient, SupabaseAuthAdapter } from '@neondatabase/neon-js'

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
    },
  })
}

export type SupabaseClient = ReturnType<typeof build>

let client: SupabaseClient | undefined

/** Devuelve siempre el mismo cliente, para que todos los componentes compartan la sesión. */
export function createClient(): SupabaseClient {
  return (client ??= build())
}
