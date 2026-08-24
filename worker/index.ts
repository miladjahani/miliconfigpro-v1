import type { Env } from './env'
import { apiError, json, getUserFromRequest, logActivity, genId, nowIso, safeJsonParse } from './util'
import { handleSignup, handleLogin, handleLogout, handleMe } from './auth'
import { runDeployment } from './deploy'
import { handleWorkerConfig } from './kvconfig'
import { handleIpScanner } from './scanner'
import { handleTelegramWebhook } from './telegram'
import { ensureSchema } from './schema'

interface DeploymentBody {
  name?: string
  uuid?: string
  custom_path?: string
  method?: 'workers' | 'pages'
  worker_source?: string
  proxyip?: string
  admin_password?: string
  cf_token_id?: string
}

async function requireUser(env: Env, request: Request) {
  return getUserFromRequest(env, request)
}

// ── Tokens ─────────────────────────────────────────────────────────────────

async function listTokens(env: Env, userId: string): Promise<Response> {
  const r = await env.DB.prepare('SELECT * FROM cf_tokens WHERE user_id = ? ORDER BY created_at DESC').bind(userId).all()
  return json({ data: r.results })
}

async function createToken(env: Env, userId: string, request: Request): Promise<Response> {
  const body = safeJsonParse<{ name?: string; token?: string }>(await request.text().catch(() => ''), {})
  if (!body.name?.trim() || !body.token?.trim()) return apiError('نام و توکن الزامی است')
  const id = genId()
  await env.DB.prepare("INSERT INTO cf_tokens (id, user_id, name, token, status, created_at) VALUES (?, ?, ?, ?, 'active', ?)")
    .bind(id, userId, body.name.trim(), body.token.trim(), nowIso())
    .run()
  await logActivity(env, userId, 'token_created', 'token', body.name.trim())
  return json({ data: { id, user_id: userId, name: body.name.trim(), token: body.token.trim(), status: 'active', created_at: nowIso() } }, 201)
}

async function deleteToken(env: Env, userId: string, id: string): Promise<Response> {
  const row = await env.DB.prepare('DELETE FROM cf_tokens WHERE id = ? AND user_id = ? RETURNING name').bind(id, userId).first<{ name: string }>()
  if (!row) return apiError('توکن پیدا نشد', 404)
  await logActivity(env, userId, 'token_deleted', 'token', row.name)
  return json({ success: true })
}

// ── Deployments ────────────────────────────────────────────────────────────

function parseDeploymentRow(row: Record<string, unknown>): Record<string, unknown> {
  return { ...row, config: safeJsonParse(row.config as string, {}) }
}

async function listDeployments(env: Env, userId: string, url: URL): Promise<Response> {
  const idsParam = url.searchParams.get('ids')
  let rows: Record<string, unknown>[]
  if (idsParam) {
    const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 50)
    rows = []
    for (const id of ids) {
      const row = await env.DB.prepare('SELECT * FROM deployments WHERE id = ? AND user_id = ?').bind(id, userId).first<Record<string, unknown>>()
      if (row) rows.push(row)
    }
  } else {
    const r = await env.DB.prepare('SELECT * FROM deployments WHERE user_id = ? ORDER BY created_at DESC').bind(userId).all<Record<string, unknown>>()
    rows = r.results
  }
  return json({ data: rows.map(parseDeploymentRow) })
}

async function getDeployment(env: Env, userId: string, id: string): Promise<Response> {
  const row = await env.DB.prepare('SELECT * FROM deployments WHERE id = ? AND user_id = ?').bind(id, userId).first<Record<string, unknown>>()
  if (!row) return apiError('ورکر پیدا نشد', 404)
  return json({ data: parseDeploymentRow(row) })
}

async function createDeployment(env: Env, userId: string, request: Request, ctx: ExecutionContext, origin: string): Promise<Response> {
  const body = safeJsonParse<DeploymentBody>(await request.text().catch(() => ''), {})
  const name = (body.name ?? '').trim().toLowerCase()
  const uuid = (body.uuid ?? '').trim()
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(name)) return apiError('نام ورکر نامعتبر است')
  if (!uuid) return apiError('UUID الزامی است')

  const tokenRow = await env.DB.prepare("SELECT id, token FROM cf_tokens WHERE id = ? AND user_id = ? AND status = 'active'")
    .bind(body.cf_token_id ?? '', userId)
    .first<{ id: string; token: string }>()
  if (!tokenRow) return apiError('توکن فعال انتخاب‌شده پیدا نشد', 400)

  // Enforce a sane per-user limit to avoid runaway deployments.
  const count = await env.DB.prepare('SELECT COUNT(*) AS c FROM deployments WHERE user_id = ?').bind(userId).first<{ c: number }>()
  if ((count?.c ?? 0) >= 100) return apiError('به سقف تعداد ورکرها رسیده‌اید', 400)

  const id = genId()
  await env.DB.prepare(
    `INSERT INTO deployments (id, user_id, name, worker_code, config, status, uuid, custom_path, method, worker_source, created_at, updated_at)
     VALUES (?, ?, ?, '[auto-loaded]', '{}', 'deploying', ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, userId, name, uuid, body.custom_path || null, body.method === 'pages' ? 'pages' : 'workers',
      body.worker_source ?? 'edgetunnel', nowIso(), nowIso())
    .run()

  await logActivity(env, userId, 'deployment_created', 'deployment', name)

  ctx.waitUntil(runDeployment(env, {
    deployment_id: id,
    worker_name: name,
    cf_token: tokenRow.token,
    cf_token_row_id: tokenRow.id,
    uuid,
    method: body.method === 'pages' ? 'pages' : 'workers',
    worker_source: body.worker_source ?? 'edgetunnel',
    proxyip: body.proxyip || undefined,
    admin_password: body.admin_password || undefined,
    custom_path: body.custom_path || undefined,
    origin,
  }))

  return getDeployment(env, userId, id)
}

async function deleteDeployment(env: Env, userId: string, id: string): Promise<Response> {
  const row = await env.DB.prepare('DELETE FROM deployments WHERE id = ? AND user_id = ? RETURNING name').bind(id, userId).first<{ name: string }>()
  if (!row) return apiError('ورکر پیدا نشد', 404)
  await logActivity(env, userId, 'worker_deleted', 'deployment', row.name)
  return json({ success: true })
}

// ── Bot config & users ─────────────────────────────────────────────────────

async function botConfigRowToObj(row: Record<string, unknown>): Promise<Record<string, unknown>> {
  return { ...row, is_active: !!row.is_active }
}

async function getBotConfig(env: Env, userId: string): Promise<Response> {
  const row = await env.DB.prepare('SELECT * FROM bot_config WHERE user_id = ? LIMIT 1').bind(userId).first<Record<string, unknown>>()
  return json({ data: row ? await botConfigRowToObj(row) : null })
}

async function saveBotConfig(env: Env, userId: string, request: Request, origin: string): Promise<Response> {
  const body = safeJsonParse<{ bot_token?: string; welcome_message?: string; is_active?: boolean }>(await request.text().catch(() => ''), {})

  const existing = await env.DB.prepare('SELECT * FROM bot_config WHERE user_id = ? LIMIT 1').bind(userId).first<Record<string, unknown>>()

  // Update without a token: toggle is_active and/or edit the welcome message.
  if (!body.bot_token?.trim() && existing) {
    await env.DB.prepare(
      `UPDATE bot_config SET
         welcome_message = COALESCE(?, welcome_message),
         is_active = COALESCE(?, is_active),
         updated_at = ?
       WHERE id = ?`,
    )
      .bind(
        body.welcome_message?.trim() ?? null,
        typeof body.is_active === 'boolean' ? (body.is_active ? 1 : 0) : null,
        nowIso(),
        existing.id as string,
      )
      .run()
    return getBotConfig(env, userId)
  }

  if (!body.bot_token?.trim() && !existing) return apiError('توکن ربات الزامی است')
  const botToken = body.bot_token!.trim()
  const welcome = body.welcome_message?.trim()
    || ((existing?.welcome_message as string) ?? '')
    || 'سلام! به ربات miliconfig خوش آمدید. برای شروع /start را بفرستید.'

  // Validate the token with Telegram and connect the webhook.
  const meResp = await fetch(`https://api.telegram.org/bot${botToken}/getMe`).then((r) => r.json()).catch(() => null)
  const meData = meResp as { ok?: boolean; result?: { username?: string }; description?: string } | null
  if (!meData?.ok) {
    return apiError(meData?.description ?? 'توکن ربات نامعتبر است')
  }
  const webhookUrl = `${origin}/api/webhooks/telegram`
  const hookResp = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookUrl }),
  }).then((r) => r.json()).catch(() => null)
  const hookData = hookResp as { ok?: boolean; description?: string } | null
  if (!hookData?.ok) {
    return apiError(hookData?.description ?? 'اتصال وب‌هوک ناموفق بود')
  }

  const botUsername = meData.result?.username ?? null
  if (existing) {
    await env.DB.prepare(
      `UPDATE bot_config SET bot_token = ?, bot_username = ?, webhook_url = ?, is_active = ?, welcome_message = ?, updated_at = ? WHERE id = ?`,
    )
      .bind(botToken, botUsername, webhookUrl, body.is_active === false ? 0 : 1, welcome, nowIso(), existing.id as string)
      .run()
  } else {
    await env.DB.prepare(
      `INSERT INTO bot_config (id, user_id, bot_token, bot_username, webhook_url, is_active, welcome_message, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    )
      .bind(genId(), userId, botToken, botUsername, webhookUrl, welcome, nowIso(), nowIso())
      .run()
  }

  await logActivity(env, userId, 'bot_configured', 'bot', botUsername)
  return getBotConfig(env, userId)
}

async function listBotUsers(env: Env, userId: string): Promise<Response> {
  const r = await env.DB.prepare('SELECT * FROM bot_users WHERE user_id = ? ORDER BY created_at DESC').bind(userId).all()
  return json({ data: r.results.map((u) => ({ ...u, is_active: !!u.is_active, is_admin: !!u.is_admin })) })
}

async function updateBotUser(env: Env, userId: string, id: string, request: Request): Promise<Response> {
  const body = safeJsonParse<{ is_active?: boolean; is_admin?: boolean }>(await request.text().catch(() => ''), {})
  const sets: string[] = []
  const binds: (number | string)[] = []
  if (typeof body.is_active === 'boolean') { sets.push('is_active = ?'); binds.push(body.is_active ? 1 : 0) }
  if (typeof body.is_admin === 'boolean') { sets.push('is_admin = ?'); binds.push(body.is_admin ? 1 : 0) }
  if (!sets.length) return apiError('فیلدی برای به‌روزرسانی نیست')
  binds.push(id, userId)
  const r = await env.DB.prepare(`UPDATE bot_users SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).bind(...binds).run()
  if (!r.meta.changes) return apiError('کاربر پیدا نشد', 404)
  return json({ success: true })
}

async function deleteBotUser(env: Env, userId: string, id: string): Promise<Response> {
  const r = await env.DB.prepare('DELETE FROM bot_users WHERE id = ? AND user_id = ?').bind(id, userId).run()
  if (!r.meta.changes) return apiError('کاربر پیدا نشد', 404)
  return json({ success: true })
}

// ── Stats & logs ───────────────────────────────────────────────────────────

async function getStats(env: Env, userId: string): Promise<Response> {
  const [tokens, deps, botUsersAll, recentLogs] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS c FROM cf_tokens WHERE user_id = ?').bind(userId).first<{ c: number }>(),
    env.DB.prepare("SELECT status, COUNT(*) AS c FROM deployments WHERE user_id = ? GROUP BY status").bind(userId).all<{ status: string; c: number }>(),
    env.DB.prepare('SELECT is_active, is_admin, COUNT(*) AS c FROM bot_users WHERE user_id = ? GROUP BY is_active, is_admin').bind(userId).all<{ is_active: number; is_admin: number; c: number }>(),
    env.DB.prepare('SELECT id, action, entity_name, created_at FROM activity_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 8').bind(userId).all(),
  ])

  const statusCounts = Object.fromEntries(deps.results.map((r) => [r.status, r.c]))
  const botUsers = botUsersAll.results.reduce((acc, g) => acc + g.c, 0)
  const activeBotUsers = botUsersAll.results.filter((g) => g.is_active).reduce((acc, g) => acc + g.c, 0)

  return json({
    tokens: tokens?.c ?? 0,
    deployments: deps.results.reduce((acc, g) => acc + g.c, 0),
    deployed: statusCounts.deployed ?? 0,
    failed: statusCounts.failed ?? 0,
    botUsers,
    activeBotUsers,
    recentLogs: recentLogs.results,
  })
}

async function listLogs(env: Env, userId: string): Promise<Response> {
  const r = await env.DB.prepare('SELECT * FROM activity_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 100').bind(userId).all()
  return json({ data: r.results })
}

// ── Router ────────────────────────────────────────────────────────────────

/** Echo the caller's origin so the SPA can also be hosted on a separate domain. */
function corsHeaders(request: Request): Record<string, string> {
  const requestOrigin = request.headers.get('Origin')
  if (!requestOrigin) return {}
  return {
    'Access-Control-Allow-Origin': requestOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

function withCors(response: Response, headers: Record<string, string>): Response {
  if (!Object.keys(headers).length) return response
  const resp = new Response(response.body, response)
  for (const [k, v] of Object.entries(headers)) resp.headers.set(k, v)
  return resp
}

async function handleRouted(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  path: string,
  origin: string,
  method: string,
): Promise<Response> {
  const url = new URL(request.url)

  // Telegram webhook — public, authenticated by bot token inside the handler.
  if (path === '/api/webhooks/telegram' && method === 'POST') {
    return await handleTelegramWebhook(env, ctx, request)
  }

  // Public auth endpoints
  if (path === '/api/auth/signup' && method === 'POST') return await handleSignup(env, request)
  if (path === '/api/auth/login' && method === 'POST') return await handleLogin(env, request)

  // Everything below requires a session
  if (path.startsWith('/api/auth/') || path.startsWith('/api/')) {
    const user = await requireUser(env, request)

    if (path === '/api/auth/logout' && method === 'POST') {
      if (!user) return json({ success: true })
      return await handleLogout(env, request)
    }
    if (path === '/api/auth/me' && method === 'GET') return await handleMe(env, request)

    if (!user) return apiError('ابتدا وارد شوید', 401)

    if (path === '/api/tokens' && method === 'GET') return await listTokens(env, user.id)
    if (path === '/api/tokens' && method === 'POST') return await createToken(env, user.id, request)
    if (path.match(/^\/api\/tokens\/[^/]+$/) && method === 'DELETE') return await deleteToken(env, user.id, path.split('/')[3])

    if (path === '/api/deployments' && method === 'GET') return await listDeployments(env, user.id, url)
    if (path === '/api/deployments' && method === 'POST') return await createDeployment(env, user.id, request, ctx, origin)
    if (path.match(/^\/api\/deployments\/[^/]+$/) && method === 'GET') return await getDeployment(env, user.id, path.split('/')[3])
    if (path.match(/^\/api\/deployments\/[^/]+$/) && method === 'DELETE') return await deleteDeployment(env, user.id, path.split('/')[3])

    if (path === '/api/bot-config' && method === 'GET') return await getBotConfig(env, user.id)
    if (path === '/api/bot-config' && (method === 'PUT' || method === 'PATCH')) return await saveBotConfig(env, user.id, request, origin)

    if (path === '/api/bot-users' && method === 'GET') return await listBotUsers(env, user.id)
    if (path.match(/^\/api\/bot-users\/[^/]+$/) && method === 'PATCH') return await updateBotUser(env, user.id, path.split('/')[3], request)
    if (path.match(/^\/api\/bot-users\/[^/]+$/) && method === 'DELETE') return await deleteBotUser(env, user.id, path.split('/')[3])

    if (path === '/api/stats' && method === 'GET') return await getStats(env, user.id)
    if (path === '/api/logs' && method === 'GET') return await listLogs(env, user.id)

    if (path === '/api/worker-config' && method === 'POST') {
      const body = safeJsonParse(await request.text().catch(() => ''), {})
      return await handleWorkerConfig(env, user.id, body)
    }
    if (path === '/api/ip-scanner' && method === 'POST') {
      const body = safeJsonParse(await request.text().catch(() => ''), {})
      return await handleIpScanner(body)
    }

    return apiError('مسیر API پیدا نشد', 404)
  }

  // Static assets (SPA)
  return env.ASSETS.fetch(request)
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname
    const origin = url.origin
    const method = request.method
    const cors = corsHeaders(request)

    // CORS preflight
    if (method === 'OPTIONS' && path.startsWith('/api')) {
      return new Response(null, { status: 204, headers: cors })
    }

    try {
      // Self-initialize an empty D1 database on first use.
      if (path.startsWith('/api')) {
        await ensureSchema(env)
      }
      const response = await handleRouted(request, env, ctx, path, origin, method)
      return withCors(response, cors)
    } catch (err) {
      console.error('API error:', err)
      return apiError(err instanceof Error ? err.message : 'خطای داخلی سرور', 500)
    }
  },
}
