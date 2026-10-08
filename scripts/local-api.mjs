#!/usr/bin/env node
// API local compatible con Supabase, SOLO para desarrollo.
//
// El dashboard habla con Supabase a través de supabase-js. Este script pone
// delante del PostgreSQL local los dos servicios que la app necesita, en las
// mismas rutas que Supabase:
//
//   /rest/v1/*   → PostgREST (el mismo motor que usa Supabase), como proceso hijo
//   /auth/v1/*   → login mínimo contra auth.users, emitiendo JWT como Supabase Auth
//
// Realtime (/realtime/v1) no está implementado: las pantallas cargan sus datos
// pero no se refrescan solas.
//
//   node scripts/local-api.mjs        arranca la API en http://127.0.0.1:54321
//   node scripts/local-api.mjs env    imprime las variables para apps/dashboard/.env.local
import { spawn } from 'node:child_process'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { existsSync } from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import { delimiter, join } from 'node:path'

const PG_BIN = process.env.SETPOINT_PG_BIN ?? 'C:\\Program Files\\PostgreSQL\\18\\bin'
const HOME = process.env.SETPOINT_PG_HOME ?? join(process.env.LOCALAPPDATA ?? os.homedir(), 'setpoint-pg')
const PG_PORT = process.env.SETPOINT_PG_PORT ?? '5433'
const PG_PASSWORD = process.env.SETPOINT_PG_PASSWORD ?? 'setpoint_local'
const DB = process.env.SETPOINT_PG_DB ?? 'setpoint'
const API_PORT = Number(process.env.SETPOINT_API_PORT ?? 54321)
const REST_PORT = Number(process.env.SETPOINT_REST_PORT ?? 54320)
const JWT_SECRET = process.env.SETPOINT_JWT_SECRET ?? 'setpoint-local-dev-secret-not-for-production'
const POSTGREST = join(HOME, 'postgrest', process.platform === 'win32' ? 'postgrest.exe' : 'postgrest')
const API_URL = `http://127.0.0.1:${API_PORT}`

// ── JWT (HS256) ──────────────────────────────────────────────────────────────
const b64url = (data) => Buffer.from(data).toString('base64url')
const hmac = (data) => createHmac('sha256', JWT_SECRET).update(data).digest('base64url')

function sign(payload) {
  const body = `${b64url('{"alg":"HS256","typ":"JWT"}')}.${b64url(JSON.stringify(payload))}`
  return `${body}.${hmac(body)}`
}

function verify(token) {
  const [header, payload, signature] = (token ?? '').split('.')
  if (!signature) return null
  const expected = Buffer.from(hmac(`${header}.${payload}`))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString())
  return claims.exp && claims.exp < Date.now() / 1000 ? null : claims
}

// Claves fijas (iat/exp constantes) para que .env.local no cambie entre arranques
const staticKey = (role) => sign({ iss: 'setpoint-local', role, iat: 1767225600, exp: 4102444800 })
const ANON_KEY = staticKey('anon')
const SERVICE_KEY = staticKey('service_role')

if (process.argv[2] === 'env') {
  console.log(`NEXT_PUBLIC_SUPABASE_URL=${API_URL}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY}`)
  process.exit(0)
}

// ── Auth ─────────────────────────────────────────────────────────────────────
async function localAuth(fn, args) {
  const res = await fetch(`http://127.0.0.1:${REST_PORT}/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Profile': 'local_auth',
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify(args),
  })
  if (!res.ok) throw new Error(`local_auth.${fn}: ${res.status} ${await res.text()}`)
  return res.json()
}

const userJson = (u) => ({
  id: u.id,
  aud: 'authenticated',
  role: 'authenticated',
  email: u.email,
  email_confirmed_at: u.created_at,
  phone: '',
  app_metadata: u.app_metadata ?? {},
  user_metadata: u.user_metadata ?? {},
  identities: [],
  created_at: u.created_at,
  updated_at: u.created_at,
  is_anonymous: false,
})

function newSession(u) {
  const now = Math.floor(Date.now() / 1000)
  const expires_at = now + 3600
  return {
    access_token: sign({
      iss: 'setpoint-local', aud: 'authenticated', role: 'authenticated',
      sub: u.id, email: u.email, app_metadata: u.app_metadata ?? {}, user_metadata: u.user_metadata ?? {},
      created_at: u.created_at, session_id: randomUUID(), iat: now, exp: expires_at,
    }),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at,
    refresh_token: sign({ typ: 'refresh', sub: u.id, iat: now, exp: now + 30 * 86400 }),
    user: userJson(u),
  }
}

async function handleAuth(req, url, body) {
  const route = `${req.method} ${url.pathname.replace('/auth/v1', '')}`
  const bearer = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')

  if (route === 'POST /token' && url.searchParams.get('grant_type') === 'password') {
    const user = await localAuth('verify_password', { p_email: body.email ?? '', p_password: body.password ?? '' })
    if (!user) return [400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }]
    return [200, newSession(user)]
  }
  if (route === 'POST /token' && url.searchParams.get('grant_type') === 'refresh_token') {
    const claims = verify(body.refresh_token)
    const user = claims?.typ === 'refresh' ? await localAuth('get_user', { p_id: claims.sub }) : null
    if (!user) return [400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' }]
    return [200, newSession(user)]
  }
  if (route === 'GET /user') {
    const claims = verify(bearer)
    if (!claims?.sub) return [401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' }]
    return [200, userJson({ ...claims, id: claims.sub })]
  }
  if (route === 'POST /logout') return [204, null]
  if (route === 'POST /recover') return [200, {}]
  return [404, { code: 404, msg: `Ruta de auth no implementada en la API local: ${route}` }]
}

// ── Servidor ─────────────────────────────────────────────────────────────────
const cors = (req) => ({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS, HEAD',
  'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] ?? '*',
  'Access-Control-Expose-Headers': 'Content-Range, Content-Location, Location, Preference-Applied, Range-Unit',
  'Access-Control-Max-Age': '86400',
})

function send(req, res, status, data) {
  res.writeHead(status, { ...cors(req), 'Content-Type': 'application/json' })
  res.end(data === null ? undefined : JSON.stringify(data))
}

function proxyToPostgrest(req, res, path) {
  const headers = { ...req.headers, host: `127.0.0.1:${REST_PORT}` }
  const upstream = http.request({ host: '127.0.0.1', port: REST_PORT, method: req.method, path, headers }, (up) => {
    const out = { ...up.headers }
    for (const k of Object.keys(out)) if (k.startsWith('access-control-')) delete out[k]
    res.writeHead(up.statusCode ?? 502, { ...out, ...cors(req) })
    up.pipe(res)
    // Los errores de la base se ven en esta terminal, no solo en el navegador
    if ((up.statusCode ?? 0) >= 400) {
      let detail = ''
      up.on('data', (chunk) => { detail += chunk })
      up.on('end', () => console.error(`[rest] ${up.statusCode} ${req.method} ${path.slice(0, 160)}\n       ${detail.slice(0, 300)}`))
    }
  })
  upstream.on('error', () => send(req, res, 503, { message: 'PostgREST no responde todavía' }))
  req.pipe(upstream)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', API_URL)
  if (req.method === 'OPTIONS') return res.writeHead(204, cors(req)).end()
  if (url.pathname.startsWith('/rest/v1')) {
    return proxyToPostgrest(req, res, (url.pathname.slice('/rest/v1'.length) || '/') + url.search)
  }
  if (url.pathname.startsWith('/auth/v1')) {
    try {
      let raw = ''
      for await (const chunk of req) raw += chunk
      const [status, data] = await handleAuth(req, url, raw ? JSON.parse(raw) : {})
      return send(req, res, status, data)
    } catch (err) {
      console.error('[auth]', err.message)
      return send(req, res, 500, { code: 500, msg: err.message })
    }
  }
  send(req, res, 404, { message: 'Ruta no disponible en la API local' })
})

// Realtime no implementado: se rechaza la conexión WebSocket
server.on('upgrade', (_req, socket) => socket.end('HTTP/1.1 501 Not Implemented\r\n\r\n'))

if (!existsSync(POSTGREST)) {
  console.error(`✗ No se encontró PostgREST en ${POSTGREST}\n  Descárgalo de https://github.com/PostgREST/postgrest/releases y descomprímelo ahí.`)
  process.exit(1)
}

// PostgREST necesita libpq, que viene con PostgreSQL
const postgrest = spawn(POSTGREST, [], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PATH: `${PG_BIN}${delimiter}${process.env.PATH ?? ''}`,
    PGRST_DB_URI: `postgres://authenticator:${PG_PASSWORD}@localhost:${PG_PORT}/${DB}`,
    PGRST_DB_SCHEMAS: 'public,local_auth',
    PGRST_DB_ANON_ROLE: 'anon',
    PGRST_JWT_SECRET: JWT_SECRET,
    PGRST_SERVER_HOST: '127.0.0.1',
    PGRST_SERVER_PORT: String(REST_PORT),
    PGRST_LOG_LEVEL: 'error',
  },
})
postgrest.on('exit', (code) => {
  console.error(`✗ PostgREST terminó (código ${code}). ¿Está corriendo la base? → npm run db:start`)
  process.exit(1)
})

const shutdown = () => { postgrest.kill(); process.exit(0) }
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

server.listen(API_PORT, '127.0.0.1', () => {
  console.log(`✓ API local en ${API_URL}  (REST → PostgREST :${REST_PORT}, base ${DB} en :${PG_PORT})`)
})
