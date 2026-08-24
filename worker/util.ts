import type { Env } from './env'

// ── Small helpers ──────────────────────────────────────────────────────────

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function apiError(error: string, status = 400): Response {
  return json({ error }, status)
}

export function genId(): string {
  return crypto.randomUUID()
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function safeJsonParse<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

// ── Password hashing (PBKDF2 via WebCrypto — no native deps on Workers) ────

const PBKDF2_ITERATIONS = 100_000

function b64encode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

function b64decode(text: string): Uint8Array {
  const bin = atob(text)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as unknown as BufferSource, iterations },
    key,
    256,
  )
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const bits = await pbkdf2(password, salt, PBKDF2_ITERATIONS)
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64encode(salt)}$${b64encode(bits)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterText, saltB64, hashB64] = stored.split('$')
  if (scheme !== 'pbkdf2') return false
  const iterations = Number(iterText) || PBKDF2_ITERATIONS
  const bits = await pbkdf2(password, b64decode(saltB64), iterations)
  return b64encode(bits) === hashB64
}

// ── Sessions ───────────────────────────────────────────────────────────────

const SESSION_DAYS = 30

export interface UserRow {
  id: string
  email: string
}

export async function createSession(env: Env, userId: string): Promise<{ token: string; expiresAt: string }> {
  const token = genId() + genId()
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000).toISOString()
  await env.DB.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(token, userId, expiresAt)
    .run()
  return { token, expiresAt }
}

export async function getUserFromRequest(env: Env, request: Request): Promise<UserRow | null> {
  const header = request.headers.get('Authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) return null
  const row = await env.DB.prepare(
    `SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > ?`,
  )
    .bind(token, nowIso())
    .first<UserRow>()
  return row ?? null
}

export async function logActivity(
  env: Env,
  userId: string,
  action: string,
  entityType = 'general',
  entityName: string | null = null,
  details?: Record<string, unknown>,
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO activity_logs (id, user_id, action, entity_type, entity_name, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(genId(), userId, action, entityType, entityName, details ? JSON.stringify(details) : null, nowIso())
    .run()
}
