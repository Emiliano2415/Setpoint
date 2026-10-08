#!/usr/bin/env node
// Carga los datos de ejemplo (INVENTADOS) en la base de Neon.
//
// En Neon los usuarios no se pueden crear por SQL: viven en Neon Auth. Por eso
// este script va en dos pasos:
//   1. Da de alta en Neon Auth los usuarios que lista supabase/seed.sql
//      (contraseña demo1234). Los que ya existen se dejan como están.
//   2. Ejecuta supabase/seed.sql, que enlaza cada empleado con su usuario.
//
// El paso 2 es una sola transacción: si la base ya tiene los datos de ejemplo,
// falla sin cambiar nada.
//
//   node scripts/seed-neon.mjs
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENV_FILE = join(ROOT, '.env.local')
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE)

const AUTH_URL = process.env.NEON_AUTH_BASE_URL
const DB_URL = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL
const BIN = process.env.SETPOINT_PG_BIN ?? 'C:\\Program Files\\PostgreSQL\\18\\bin'
const PSQL = join(BIN, process.platform === 'win32' ? 'psql.exe' : 'psql')
const SEED = join(ROOT, 'supabase', 'seed.sql')
const PASSWORD = 'demo1234'

function fail(msg) {
  console.error(`\n✗ ${msg}`)
  process.exit(1)
}
if (!AUTH_URL || !DB_URL) fail('Faltan NEON_AUTH_BASE_URL o DATABASE_URL_UNPOOLED. Ejecuta `npx neon env pull`.')

// Los usuarios salen de la tabla seed_usuarios de seed.sql: una sola lista para ambos pasos
const usuarios = [...readFileSync(SEED, 'utf8').matchAll(
  /^\s*\('([^']+@[^']+)',\s*'[0-9a-f-]{36}',\s*'[0-9a-f-]{36}',\s*'[0-9a-f-]{36}',\s*'([^']+)'/gm,
)].map(([, email, name]) => ({ email, name }))
if (usuarios.length === 0) fail('No se encontraron usuarios en supabase/seed.sql')

console.log(`Usuarios en Neon Auth (${usuarios.length}):`)
for (const u of usuarios) {
  const res = await fetch(`${AUTH_URL}/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3001' },
    body: JSON.stringify({ name: u.name, email: u.email, password: PASSWORD }),
  })
  const body = await res.json().catch(() => ({}))
  if (res.ok) console.log(`  + ${u.email}`)
  else if (/exist/i.test(`${body.code ?? ''} ${body.message ?? ''}`)) console.log(`  = ${u.email} (ya existía)`)
  else fail(`No se pudo crear ${u.email}: ${res.status} ${JSON.stringify(body)}`)
}

console.log('\nDatos de ejemplo:')
const r = spawnSync(PSQL, [DB_URL, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-1', '-f', SEED], {
  env: { ...process.env, PGCLIENTENCODING: 'UTF8' },
  stdio: 'inherit',
})
if (r.status !== 0) fail('No se cargaron los datos (¿ya estaban cargados?). La base quedó como estaba.')
console.log('✓ Datos de ejemplo cargados')
