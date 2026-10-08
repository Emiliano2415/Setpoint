#!/usr/bin/env node
// PostgreSQL local para Setpoint.
// Usa los binarios de una instalación existente de PostgreSQL pero con un clúster
// propio (datos fuera de OneDrive, puerto aparte), sin tocar otras bases del equipo.
//
//   node scripts/db.mjs init     crea el clúster (una sola vez)
//   node scripts/db.mjs start    arranca el servidor
//   node scripts/db.mjs stop     lo detiene
//   node scripts/db.mjs status   estado del servidor
//   node scripts/db.mjs reset    recrea la base: compat + migraciones + seed
//   node scripts/db.mjs psql     consola psql (acepta argumentos: -- -c "select 1")
//   node scripts/db.mjs url      imprime la cadena de conexión
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BIN = process.env.SETPOINT_PG_BIN ?? 'C:\\Program Files\\PostgreSQL\\18\\bin'
const HOME = process.env.SETPOINT_PG_HOME ?? join(process.env.LOCALAPPDATA ?? os.homedir(), 'setpoint-pg')
const PORT = process.env.SETPOINT_PG_PORT ?? '5433'
const PASSWORD = process.env.SETPOINT_PG_PASSWORD ?? 'setpoint_local'
const DB = process.env.SETPOINT_PG_DB ?? 'setpoint'
const DATA = join(HOME, 'data')
const LOG = join(HOME, 'postgres.log')

const env = { ...process.env, PGPASSWORD: PASSWORD, PGCLIENTENCODING: 'UTF8' }
const exe = (name) => join(BIN, process.platform === 'win32' ? `${name}.exe` : name)

function run(name, args, { quiet = false } = {}) {
  const r = spawnSync(exe(name), args, { env, stdio: quiet ? 'ignore' : 'inherit' })
  if (r.error) throw r.error
  return r.status ?? 1
}

const conn = (db) => ['-h', 'localhost', '-p', PORT, '-U', 'postgres', '-d', db]
const psql = (db, args) => run('psql', [...conn(db), '-X', '-q', '-v', 'ON_ERROR_STOP=1', ...args])
const isRunning = () => run('pg_ctl', ['-D', DATA, 'status'], { quiet: true }) === 0

function fail(msg) {
  console.error(`\n✗ ${msg}`)
  process.exit(1)
}

function init() {
  if (existsSync(join(DATA, 'PG_VERSION'))) return console.log(`El clúster ya existe en ${DATA}`)
  mkdirSync(HOME, { recursive: true })
  const pwfile = join(HOME, '.pwfile')
  writeFileSync(pwfile, PASSWORD)
  const status = run('initdb', [
    '-D', DATA, '-U', 'postgres', '-E', 'UTF8',
    '--locale-provider=icu', '--icu-locale=es-MX',
    '--auth=scram-sha-256', `--pwfile=${pwfile}`,
  ])
  rmSync(pwfile, { force: true })
  if (status !== 0) fail('initdb falló')
  // UTC como en Supabase/Aiven: la app calcula los límites del día en UTC-6 por su cuenta.
  appendFileSync(join(DATA, 'postgresql.conf'),
    `\n# --- Setpoint local ---\nport = ${PORT}\nlisten_addresses = 'localhost'\ntimezone = 'UTC'\nlog_timezone = 'UTC'\n`)
  console.log(`✓ Clúster creado en ${DATA} (puerto ${PORT})`)
}

function start() {
  if (!existsSync(join(DATA, 'PG_VERSION'))) fail('No hay clúster. Ejecuta primero: npm run db:init')
  if (isRunning()) return console.log(`PostgreSQL ya está corriendo en el puerto ${PORT}`)
  // Sin heredar stdio: en Windows el servidor retendría la tubería y el comando no retornaría.
  if (run('pg_ctl', ['-D', DATA, '-l', LOG, '-w', 'start'], { quiet: true }) !== 0) fail(`No arrancó. Revisa ${LOG}`)
  console.log(`✓ PostgreSQL corriendo en el puerto ${PORT}`)
}

function stop() {
  if (!isRunning()) return console.log('PostgreSQL no está corriendo')
  run('pg_ctl', ['-D', DATA, '-m', 'fast', '-w', 'stop'])
}

function reset() {
  if (!isRunning()) start()
  const noSeed = process.argv.includes('--no-seed')
  const apply = (label, file) => {
    console.log(`  → ${label}`)
    if (psql(DB, ['-1', '-f', file]) !== 0) fail(`Error aplicando ${label}`)
  }
  console.log(`Recreando base "${DB}"...`)
  if (psql('postgres', ['-c', `DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`]) !== 0) fail('No se pudo borrar la base')
  if (psql('postgres', ['-c', `CREATE DATABASE ${DB}`]) !== 0) fail('No se pudo crear la base')

  apply('db/local/00_supabase_compat.sql', join(ROOT, 'db', 'local', '00_supabase_compat.sql'))
  const dir = join(ROOT, 'supabase', 'migrations')
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) {
    apply(`supabase/migrations/${f}`, join(dir, f))
  }
  if (!noSeed) apply('supabase/seed.sql', join(ROOT, 'supabase', 'seed.sql'))
  console.log(`✓ Base "${DB}" lista${noSeed ? ' (sin datos de ejemplo)' : ''}`)
}

const url = () => `postgresql://postgres:${PASSWORD}@localhost:${PORT}/${DB}`

const commands = {
  init,
  start,
  stop,
  reset,
  status: () => { run('pg_ctl', ['-D', DATA, 'status']); run('pg_isready', ['-h', 'localhost', '-p', PORT]) },
  psql: () => process.exit(run('psql', [...conn(DB), ...process.argv.slice(3)])),
  url: () => console.log(url()),
}

const cmd = process.argv[2]
if (!commands[cmd]) fail(`Comando desconocido: ${cmd ?? '(ninguno)'}. Usa: ${Object.keys(commands).join(' | ')}`)
commands[cmd]()
