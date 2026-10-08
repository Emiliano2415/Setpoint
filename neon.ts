import { defineConfig } from "@neon/config/v1";

// Seeded by `neon config init --from-branch` from production.
// The AI Gateway is not readable from a branch (always available, credential-gated), so add
// `aiGateway: true` if the policy should declare it.
export default defineConfig({
  auth: true,
  // API compatible con PostgREST: la usa el dashboard, que consulta la base con
  // el cliente de Supabase (.from / .rpc). Verifica los tokens de Neon Auth.
  dataApi: true,
  buckets: {
    uploads: { access: "private" },
  },
});
