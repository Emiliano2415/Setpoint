#!/usr/bin/env node
// Aplica las migraciones pendientes de supabase/migrations a una base remota
// (Neon). Lleva el registro en supabase_migrations.schema_migrations, la misma
// tabla que usa la CLI de Supabase, así que cada archivo se aplica una sola vez.
//
//   node scripts/migrate.mjs status   qué está aplicado y qué falta
//   node scripts/migrate.mjs up       aplica lo pendiente, en orden
//
// La conexión sale de DATABASE_URL_UNPOOLED (conexión directa: las migraciones
// no deben ir por el pooler) o DATABASE_URL, leídas de .env.local.
// La base local de desarrollo no usa este script: ver scripts/db.mjs.
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENV_FILE = join(ROOT, '.env.local')
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE)

const URL = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL
const BIN = process.env.SETPOINT_PG_BIN ?? 'C:\\Program Files\\PostgreSQL\\18\\bin'
const PSQL = join(BIN, process.platform === 'win32' ? 'psql.exe' : 'psql')
const DIR = join(ROOT, 'supabase', 'migrations')
const env = { ...process.env, PGCLIENTENCODING: 'UTF8' }

function fail(msg) {
  console.error(`\n✗ ${msg}`)
  process.exit(1)
}

if (!URL) fail('Falta DATABASE_URL_UNPOOLED (o DATABASE_URL). Ejecuta `npx neon env pull` o revisa .env.local')

function psql(args, { capture = false } = {}) {
  const r = spawnSync(PSQL, [URL, '-X', '-q', '-v', 'ON_ERROR_STOP=1', ...args], {
    env,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  })
  if (r.error) throw r.error
  return { status: r.status ?? 1, stdout: r.stdout ?? '' }
}

const files = readdirSync(DIR)
  .filter((n) => /^\d+_.+\.sql$/.test(n))
  .sort()
  .map((n) => ({ file: n, version: n.split('_')[0], name: n.replace(/^\d+_/, '').replace(/\.sql$/, '') }))

function applied() {
  const init = psql(['-c', `
    CREATE SCHEMA IF NOT EXISTS supabase_migrations;
    CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
      version text PRIMARY KEY,
      name text,
      applied_at timestamptz NOT NULL DEFAULT now()
    );`])
  if (init.status !== 0) fail('No se pudo preparar el registro de migraciones')
  const r = psql(['-At', '-c', 'SELECT version FROM supabase_migrations.schema_migrations ORDER BY 1'], { capture: true })
  if (r.status !== 0) fail('No se pudo leer el registro de migraciones')
  return new Set(r.stdout.split(/\r?\n/).filter(Boolean))
}

const commands = {
  status() {
    const done = applied()
    for (const m of files) console.log(`${done.has(m.version) ? '✓ aplicada ' : '· pendiente'}  ${m.file}`)
    console.log(`\n${files.filter((m) => done.has(m.version)).length} aplicadas, ${files.filter((m) => !done.has(m.version)).length} pendientes`)
  },
  up() {
    const done = applied()
    const pending = files.filter((m) => !done.has(m.version))
    if (pending.length === 0) return console.log('Nada pendiente: la base está al día')
    for (const m of pending) {
      console.log(`  → ${m.file}`)
      // Archivo y registro en la misma transacción: o entran los dos o ninguno
      const r = psql(['-1', '-f', join(DIR, m.file), '-c',
        `INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('${m.version}', '${m.name}')`])
      if (r.status !== 0) fail(`Error aplicando ${m.file}. Las anteriores quedaron aplicadas; esta no.`)
    }
    console.log(`✓ ${pending.length} migraciones aplicadas`)
  },
}

const cmd = process.argv[2] ?? 'status'
if (!commands[cmd]) fail(`Comando desconocido: ${cmd}. Usa: ${Object.keys(commands).join(' | ')}`)
commands[cmd]()
