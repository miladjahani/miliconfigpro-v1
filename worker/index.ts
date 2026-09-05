import type { Env } from './env'
import { apiError, json, getUserFromRequest, logActivity, genId, nowIso, safeJsonParse } from './util'
import { handleSignup, handleLogin, handleLogout, handleMe } from './auth'
import { runDeployment } from './deploy'
import { verifyRailwayToken, deployToRailway, railwayDeployStatus, RailwayApiError } from './railway'
import { verifyRenderToken, deployToRender, renderDeployStatus, RenderApiError } from './render'
import { getHostedPanel, type HostedPanelTemplate } from './panels'
import { finalizeHostedPanel } from './panelsetup'
import { handleWorkerConfig } from './kvconfig'
import { handleIpScanner, handleRangeScan } from './scanner'
import { handleProxyList } from './proxylist'
import { handleTelegramWebhook } from './telegram'
import { ensureSchema } from './schema'
import { handleOptimizerCreate, handleOptimizerList, handleOptimizerGet, handleOptimizerDelete, serveOptimizerSub } from './optimizer'
import { handleOptProbe, handleOptPorts, handleOptScanBatch, handleOptSpeedtest } from './probe'
import { handleGroupCreate, handleGroupList, handleGroupDelete, handleGroupPatch, serveGroupSub } from './subgroups'
import { handleInjectorCreate, handleInjectorList, handleInjectorPatch, handleInjectorDelete, serveInjectedSub } from './injector'
import { handleMemberCreate, handleMemberList, handleMemberPatch, handleMemberDelete, handleMemberBulk, handleCfQuota, refreshMemberUsage, serveMemberSub, handleMemberTest } from './members'
import { serveStatusPage } from './status'
import { exportBackup, importBackup } from './backup'
import { handleSourceSettings, handleSourceNodes, isZeusSource, normalizeSourceType } from './sourcebridge'

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

/** Generate deploy-time admin credentials + env vars for a catalog panel. */
function buildHostedCreds(tpl: HostedPanelTemplate): {
  username: string | null
  password: string | null
  env: Array<{ key: string; value: string }>
} {
  const gen = () => `mil${genId().replaceAll('-', '')}`.slice(0, 14)
  const username = tpl.credsUsername ?? 'admin'
  switch (tpl.credsMode) {
    // StanNG: generated creds, finalized through POST /api/setup after LIVE.
    case 'setup':
      return { username, password: gen(), env: [] }
    // Marzban: generated admin baked into SUDO_USERNAME / SUDO_PASSWORD env.
    case 'env-user-pass': {
      const password = gen()
      return {
        username,
        password,
        env: [
          { key: tpl.credsEnv?.user ?? 'SUDO_USERNAME', value: username },
          { key: tpl.credsEnv?.pass ?? 'SUDO_PASSWORD', value: password },
        ],
      }
    }
    // X4G: single password login (ADMIN_PASSWORD env).
    case 'env-pass': {
      const password = gen()
      return { username: null, password, env: [{ key: tpl.credsEnv?.pass ?? 'ADMIN_PASSWORD', value: password }] }
    }
    // Heimdall / 3x-ui: creds are fixed by the repo (shown to the owner).
    case 'fixed':
    case 'default':
      return { username: tpl.fixedCreds?.username ?? null, password: tpl.fixedCreds?.password ?? null, env: [] }
    // PasarGuard: admin is created from the provider console via CLI.
    case 'cli':
      return { username, password: null, env: [] }
  }
}

/** Validate the shared deployment policy before any provider API call. The
 * same name and quota are used by Cloudflare, Railway, and Render so users do
 * not accidentally create duplicate panels or bypass their account limit by
 * switching providers. */
async function validateDeploymentSlot(env: Env, userId: string, name: string, source?: string): Promise<string | null> {
  if (source !== undefined && !normalizeSourceType(source) && !isZeusSource(source)) {
    return 'نوع سورس ناشناخته است؛ یکی از edgetunnel، custom، nexus یا Zeus را انتخاب کنید.'
  }

  const [quotaRow, cloudCount, hostedCount, duplicate] = await Promise.all([
    env.DB.prepare('SELECT max_deployments FROM users WHERE id = ?').bind(userId).first<{ max_deployments: number | null }>(),
    env.DB.prepare('SELECT COUNT(*) AS c FROM deployments WHERE user_id = ?').bind(userId).first<{ c: number }>(),
    env.DB.prepare('SELECT COUNT(*) AS c FROM hosted_deployments WHERE user_id = ?').bind(userId).first<{ c: number }>(),
    env.DB.prepare(
      `SELECT 1 AS found FROM deployments WHERE user_id = ? AND lower(name) = lower(?)
       UNION ALL
       SELECT 1 AS found FROM hosted_deployments WHERE user_id = ? AND lower(name) = lower(?) LIMIT 1`,
    ).bind(userId, name, userId, name).first<{ found: number }>(),
  ])
  const quota = Number(quotaRow?.max_deployments ?? 100)
  const current = Number(cloudCount?.c ?? 0) + Number(hostedCount?.c ?? 0)
  if (current >= quota) return `به سقف تعداد استقرارهای خود (${quota}) رسیده‌اید`
  if (duplicate) return `نام «${name}» قبلاً برای یکی از استقرارهای شما استفاده شده است؛ نام دیگری انتخاب کنید.`
  return null
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

// ── Railway tokens & auto-deploy ────────────────────────────────────────────

// Railway tokens are write-once secrets: after a successful save we never return
// the raw token to the browser again — the UI only sees the last 4 characters.

async function listRailwayTokens(env: Env, userId: string): Promise<Response> {
  const r = await env.DB.prepare(
    `SELECT id, name, status, account_name, last_used_at, created_at, substr(token, -4) AS token_tail
     FROM railway_tokens WHERE user_id = ? ORDER BY created_at DESC`,
  ).bind(userId).all()
  return json({ data: r.results })
}

async function createRailwayToken(env: Env, userId: string, request: Request): Promise<Response> {
  const body = safeJsonParse<{ name?: string; token?: string }>(await request.text().catch(() => ''), {})
  if (!body.name?.trim() || !body.token?.trim()) return apiError('نام و توکن الزامی است')

  // Validate the token against Railway before storing anything.
  let account: { name: string; email: string }
  try {
    account = await verifyRailwayToken(body.token.trim())
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'توکن Railway نامعتبر است', 400)
  }

  const id = genId()
  const accountName = account.email || account.name || null
  await env.DB.prepare(
    `INSERT INTO railway_tokens (id, user_id, name, token, status, account_name, created_at) VALUES (?, ?, ?, ?, 'active', ?, ?)`,
  )
    .bind(id, userId, body.name.trim(), body.token.trim(), accountName, nowIso())
    .run()
  await logActivity(env, userId, 'railway_token_created', 'token', body.name.trim())
  return json(
    {
      data: {
        id,
        name: body.name.trim(),
        status: 'active',
        account_name: accountName,
        token_tail: body.token.trim().slice(-4),
        last_used_at: null,
        created_at: nowIso(),
      },
    },
    201,
  )
}

async function deleteRailwayToken(env: Env, userId: string, id: string): Promise<Response> {
  const row = await env.DB.prepare('DELETE FROM railway_tokens WHERE id = ? AND user_id = ? RETURNING name').bind(id, userId).first<{ name: string }>()
  if (!row) return apiError('توکن پیدا نشد', 404)
  await logActivity(env, userId, 'railway_token_deleted', 'token', row.name)
  return json({ success: true })
}

async function loadRailwayToken(env: Env, userId: string, id: string): Promise<{ id: string; token: string; name: string } | null> {
  return env.DB.prepare("SELECT id, token, name FROM railway_tokens WHERE id = ? AND user_id = ? AND status = 'active'")
    .bind(id, userId)
    .first<{ id: string; token: string; name: string }>()
}

/** Auto-deploy a catalog panel (StanNG, 3x-ui, Heimdall, Marzban, ...) to Railway. */
async function handleRailwayDeploy(env: Env, userId: string, request: Request): Promise<Response> {
  const body = safeJsonParse<{ token_id?: string; name?: string; region?: string; template?: string }>(await request.text().catch(() => ''), {})
  const name = String(body.name ?? '').trim().toLowerCase()
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(name)) return apiError('نام پروژه نامعتبر است')
  const region = /^[a-z0-9-]+$/.test(String(body.region ?? '')) ? String(body.region) : 'us-west2'
  const tpl = getHostedPanel(body.template)
  const slotError = await validateDeploymentSlot(env, userId, name)
  if (slotError) return apiError(slotError, 409)
  const row = await loadRailwayToken(env, userId, body.token_id ?? '')
  if (!row) return apiError('توکن Railway فعال انتخاب‌شده پیدا نشد', 400)

  try {
    const creds = buildHostedCreds(tpl)
    const result = await deployToRailway(row.token, name, tpl, region, creds.env)
    const domainUrl = normalizeHostedUrl(result.domain)
    const panelUrl = domainUrl ? `${domainUrl.replace(/\/+$/, '')}${tpl.loginPath}` : null
    const adminUsername = creds.username
    const adminPassword = creds.password

    // StanNG exposes /api/setup: persist one-time admin creds so the status
    // poller finishes panel setup automatically once the deploy is live.
    if (tpl.credsMode === 'setup' && adminUsername && adminPassword) {
      await env.DB.prepare(
        `INSERT INTO railway_deploys (id, user_id, token_id, project_id, service_id, environment_id, region, domain, admin_username, admin_password, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(result.deploymentId, userId, row.id, result.projectId, result.serviceId, result.environmentId, region, result.domain ?? null, adminUsername, adminPassword, nowIso()).run()
    }

    await env.DB.prepare(
      `INSERT INTO hosted_deployments
       (id, user_id, provider, name, status, region, url, panel_url, dashboard_url, provider_deployment_id, provider_service_id, token_id, template, admin_username, admin_password, created_at, updated_at)
       VALUES (?, ?, 'railway', ?, 'deploying', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      result.deploymentId,
      userId,
      name,
      region,
      domainUrl,
      panelUrl,
      result.projectUrl,
      result.deploymentId,
      result.serviceId,
      row.id,
      tpl.slug,
      adminUsername,
      adminPassword,
      nowIso(),
      nowIso(),
    ).run()
    await env.DB.prepare('UPDATE railway_tokens SET last_used_at = ? WHERE id = ?').bind(nowIso(), row.id).run()
    await logActivity(env, userId, 'railway_deploy_started', 'deployment', name, { provider: 'railway', region, template: tpl.slug })
    return json({ data: { ...result, template: tpl.slug, admin_username: adminUsername, admin_password: adminPassword } })
  } catch (err) {
    const msg = err instanceof RailwayApiError ? err.message : err instanceof Error ? err.message : 'خطا در استقرار روی Railway'
    return apiError(msg, 400)
  }
}

// ── Render.com tokens & auto-deploy ──────────────────────────────────────────

async function listRenderTokens(env: Env, userId: string): Promise<Response> {
  const r = await env.DB.prepare(
    `SELECT id, name, status, account_name, last_used_at, created_at, substr(token, -4) AS token_tail
     FROM render_tokens WHERE user_id = ? ORDER BY created_at DESC`,
  ).bind(userId).all()
  return json({ data: r.results })
}

async function createRenderToken(env: Env, userId: string, request: Request): Promise<Response> {
  const body = safeJsonParse<{ name?: string; token?: string }>(await request.text().catch(() => ''), {})
  if (!body.name?.trim() || !body.token?.trim()) return apiError('نام و کلید الزامی است')

  let account: { name: string; email: string }
  try {
    account = await verifyRenderToken(body.token.trim())
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'کلید API رندر نامعتبر است', 400)
  }

  const id = genId()
  const accountName = account.email || account.name || null
  await env.DB.prepare(
    `INSERT INTO render_tokens (id, user_id, name, token, status, account_name, created_at) VALUES (?, ?, ?, ?, 'active', ?, ?)`,
  )
    .bind(id, userId, body.name.trim(), body.token.trim(), accountName, nowIso())
    .run()
  await logActivity(env, userId, 'render_token_created', 'token', body.name.trim())
  return json(
    {
      data: {
        id,
        name: body.name.trim(),
        status: 'active',
        account_name: accountName,
        token_tail: body.token.trim().slice(-4),
        last_used_at: null,
        created_at: nowIso(),
      },
    },
    201,
  )
}

async function deleteRenderToken(env: Env, userId: string, id: string): Promise<Response> {
  const row = await env.DB.prepare('DELETE FROM render_tokens WHERE id = ? AND user_id = ? RETURNING name').bind(id, userId).first<{ name: string }>()
  if (!row) return apiError('توکن پیدا نشد', 404)
  await logActivity(env, userId, 'render_token_deleted', 'token', row.name)
  return json({ success: true })
}

async function loadRenderToken(env: Env, userId: string, id: string): Promise<{ id: string; token: string; name: string } | null> {
  return env.DB.prepare("SELECT id, token, name FROM render_tokens WHERE id = ? AND user_id = ? AND status = 'active'")
    .bind(id, userId)
    .first<{ id: string; token: string; name: string }>()
}

/** Auto-deploy a catalog panel (StanNG, 3x-ui, Marzban, ...) to Render.com. */
async function handleRenderDeploy(env: Env, userId: string, request: Request): Promise<Response> {
  const body = safeJsonParse<{ token_id?: string; name?: string; template?: string }>(await request.text().catch(() => ''), {})
  const name = String(body.name ?? '').trim().toLowerCase()
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(name)) return apiError('نام سرویس نامعتبر است')
  const tpl = getHostedPanel(body.template)
  const slotError = await validateDeploymentSlot(env, userId, name)
  if (slotError) return apiError(slotError, 409)
  const row = await loadRenderToken(env, userId, body.token_id ?? '')
  if (!row) return apiError('کلید API رندر انتخاب‌شده پیدا نشد', 400)

  try {
    const creds = buildHostedCreds(tpl)
    const result = await deployToRender(row.token, name, tpl, creds.env)
    const adminUsername = creds.username
    const adminPassword = creds.password
    await env.DB.prepare(
      `INSERT INTO hosted_deployments
       (id, user_id, provider, name, status, dashboard_url, provider_deployment_id, provider_service_id, token_id, template, admin_username, admin_password, created_at, updated_at)
       VALUES (?, ?, 'render', ?, 'deploying', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      result.deployId,
      userId,
      name,
      result.dashboardUrl,
      result.deployId,
      result.serviceId,
      row.id,
      tpl.slug,
      adminUsername,
      adminPassword,
      nowIso(),
      nowIso(),
    ).run()
    await env.DB.prepare('UPDATE render_tokens SET last_used_at = ? WHERE id = ?').bind(nowIso(), row.id).run()
    await logActivity(env, userId, 'render_deploy_started', 'deployment', name, { provider: 'render', template: tpl.slug })
    return json({ data: { ...result, template: tpl.slug, admin_username: adminUsername, admin_password: adminPassword } })
  } catch (err) {
    const msg = err instanceof RenderApiError ? err.message : err instanceof Error ? err.message : 'خطا در استقرار روی Render'
    return apiError(msg, 400)
  }
}

/** Maximum setup attempts across status polls before giving up and keeping
 * the manual note (≈ 1.5–2.5 minutes of polling at 5s intervals). */
const MAX_SETUP_ATTEMPTS = 15

/**
 * Drive the per-panel post-deploy setup once the service is live. Runs at most
 * one attempt per status poll; persists progress so repeated polls resume
 * instead of re-running already-finished steps. `done` panels are never
 * touched again.
 */
async function runPanelSetup(
  env: Env,
  userId: string,
  deploymentId: string,
  publicUrl: string | null,
  tpl: HostedPanelTemplate,
  creds: { username: string | null; password: string | null },
): Promise<{ setup_state: string; setup_note: string | null; node_link: string | null; sub_url: string | null }> {
  const row = await env.DB.prepare(
    'SELECT setup_state, setup_note, setup_node_link, setup_sub_url, setup_attempts FROM hosted_deployments WHERE id = ? AND user_id = ?',
  ).bind(deploymentId, userId).first<{ setup_state: string | null; setup_note: string | null; setup_node_link: string | null; setup_sub_url: string | null; setup_attempts: number | null }>()
  const state = row?.setup_state ?? 'none'
  if (state === 'done' || state === 'failed') {
    return {
      setup_state: state,
      setup_note: row?.setup_note ?? null,
      node_link: row?.setup_node_link ?? null,
      sub_url: row?.setup_sub_url ?? null,
    }
  }
  if (!publicUrl) return { setup_state: 'pending', setup_note: null, node_link: null, sub_url: null }

  const outcome = await finalizeHostedPanel(publicUrl, tpl, creds)
  const attempts = Number(row?.setup_attempts ?? 0) + 1
  if (outcome.done) {
    await env.DB.prepare(
      'UPDATE hosted_deployments SET setup_state = ?, setup_note = ?, setup_node_link = ?, setup_sub_url = ?, setup_attempts = ? WHERE id = ? AND user_id = ?',
    ).bind('done', outcome.note, outcome.nodeLink ?? null, outcome.subUrl ?? null, attempts, deploymentId, userId).run()
    return { setup_state: 'done', setup_note: outcome.note, node_link: outcome.nodeLink ?? null, sub_url: outcome.subUrl ?? null }
  }
  if (attempts >= MAX_SETUP_ATTEMPTS) {
    await env.DB.prepare(
      'UPDATE hosted_deployments SET setup_state = ?, setup_note = ?, setup_attempts = ? WHERE id = ? AND user_id = ?',
    ).bind('failed', outcome.note, attempts, deploymentId, userId).run()
    return { setup_state: 'failed', setup_note: outcome.note, node_link: null, sub_url: null }
  }
  await env.DB.prepare(
    'UPDATE hosted_deployments SET setup_state = ?, setup_note = ?, setup_attempts = ? WHERE id = ? AND user_id = ?',
  ).bind('pending', outcome.note, attempts, deploymentId, userId).run()
  return { setup_state: 'pending', setup_note: null, node_link: null, sub_url: null }
}

/** Poll the status of a Render deployment that handleRenderDeploy started. */
async function handleRenderStatus(env: Env, userId: string, url: URL): Promise<Response> {
  const tokenId = url.searchParams.get('token_id') ?? ''
  const deployId = url.searchParams.get('deploy_id') ?? ''
  const serviceId = url.searchParams.get('service_id') ?? ''
  if (!deployId || !serviceId || !tokenId) return apiError('شناسه استقرار یا کلید ناقص است')
  const row = await loadRenderToken(env, userId, tokenId)
  if (!row) return apiError('کلید API رندر پیدا نشد', 400)
  try {
    const status = await renderDeployStatus(row.token, deployId, serviceId)
    const normalized = status.status === 'LIVE' ? 'success' : ['FAILED', 'CANCELED', 'DEACTIVATED'].includes(status.status) ? 'failed' : 'deploying'
    const meta = await env.DB.prepare('SELECT template, admin_username, admin_password FROM hosted_deployments WHERE id = ? AND user_id = ?').bind(deployId, userId).first<{ template: string; admin_username: string | null; admin_password: string | null }>()
    const tpl = getHostedPanel(meta?.template)
    const publicUrl = normalizeHostedUrl(status.url)
    const panelUrl = publicUrl ? `${publicUrl.replace(/\/+$/, '')}${tpl.loginPath}` : null

    // Once LIVE, run the per-panel auto-setup (admin, inbound, node/sub links).
    let setup: { setup_state: string; setup_note: string | null; node_link: string | null; sub_url: string | null } = { setup_state: 'none', setup_note: null, node_link: null, sub_url: null }
    if (normalized === 'success' && publicUrl) {
      setup = await runPanelSetup(env, userId, deployId, publicUrl, tpl, {
        username: meta?.admin_username ?? null,
        password: meta?.admin_password ?? null,
      })
    }
    await env.DB.prepare(
      `UPDATE hosted_deployments SET status = ?, url = COALESCE(?, url), panel_url = COALESCE(?, panel_url), error_message = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    ).bind(normalized, publicUrl, panelUrl, normalized === 'failed' ? `Render: ${status.status}` : null, nowIso(), deployId, userId).run()
    return json({ data: { ...status, setup_state: setup.setup_state, setup_note: setup.setup_note, node_link: setup.node_link, sub_url: setup.sub_url } })
  } catch (err) {
    const msg = err instanceof RenderApiError ? err.message : err instanceof Error ? err.message : 'خطا در بررسی وضعیت'
    return apiError(msg, 400)
  }
}

/** Poll the status of a Railway deployment that handleRailwayDeploy started. */
async function handleRailwayStatus(env: Env, userId: string, url: URL): Promise<Response> {
  const tokenId = url.searchParams.get('token_id') ?? ''
  const deploymentId = url.searchParams.get('deployment_id') ?? ''
  if (!deploymentId || !tokenId) return apiError('شناسه استقرار یا توکن ناقص است')
  const row = await loadRailwayToken(env, userId, tokenId)
  if (!row) return apiError('توکن Railway پیدا نشد', 400)
  try {
    let status = await railwayDeployStatus(row.token, deploymentId)

    // The Railway domain is authoritative for the panel URL.
    if (status.status === 'SUCCESS') {
      const rec = await env.DB.prepare('SELECT domain FROM railway_deploys WHERE id = ? AND user_id = ?')
        .bind(deploymentId, userId).first<{ domain: string | null }>()
      if (rec?.domain) status = { ...status, url: normalizeHostedUrl(rec.domain) }
    }
    const normalized = status.status === 'SUCCESS' ? 'success' : ['FAILED', 'CRASHED', 'SKIPPED', 'REMOVED'].includes(status.status) ? 'failed' : 'deploying'
    const meta = await env.DB.prepare('SELECT template, admin_username, admin_password FROM hosted_deployments WHERE id = ? AND user_id = ?').bind(deploymentId, userId).first<{ template: string; admin_username: string | null; admin_password: string | null }>()
    const tpl = getHostedPanel(meta?.template)
    const publicUrl = normalizeHostedUrl(status.url)
    const panelUrl = publicUrl ? `${publicUrl.replace(/\/+$/, '')}${tpl.loginPath}` : null

    // Once SUCCESS, run the per-panel auto-setup (admin, inbound, node/sub links).
    let setup: { setup_state: string; setup_note: string | null; node_link: string | null; sub_url: string | null } = { setup_state: 'none', setup_note: null, node_link: null, sub_url: null }
    if (normalized === 'success' && publicUrl) {
      setup = await runPanelSetup(env, userId, deploymentId, publicUrl, tpl, {
        username: meta?.admin_username ?? null,
        password: meta?.admin_password ?? null,
      })
    }
    await env.DB.prepare(
      `UPDATE hosted_deployments SET status = ?, url = COALESCE(?, url), panel_url = COALESCE(?, panel_url), error_message = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    ).bind(
      normalized,
      publicUrl,
      panelUrl,
      normalized === 'failed' ? `Railway: ${status.status}` : null,
      nowIso(),
      deploymentId,
      userId,
    ).run()
    return json({ data: { ...status, setup_state: setup.setup_state, setup_note: setup.setup_note, node_link: setup.node_link, sub_url: setup.sub_url } })
  } catch (err) {
    const msg = err instanceof RailwayApiError ? err.message : err instanceof Error ? err.message : 'خطا در بررسی وضعیت'
    return apiError(msg, 400)
  }
}

// ── Deployments ────────────────────────────────────────────────────────────

function normalizeHostedUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return null
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function parseDeploymentRow(row: Record<string, unknown>): Record<string, unknown> {
  return { ...row, config: safeJsonParse(row.config as string, {}) }
}

async function listHostedDeployments(env: Env, userId: string): Promise<Response> {
  // Refresh a small bounded batch so the deployment page stays accurate even
  // after the wizard is closed. The status handlers load provider secrets by
  // token id and never expose them to the client.
  const pending = await env.DB.prepare(
    `SELECT id, provider, provider_deployment_id, provider_service_id, token_id
     FROM hosted_deployments
     WHERE user_id = ? AND status = 'deploying'
     ORDER BY updated_at ASC LIMIT 8`,
  ).bind(userId).all<{
    id: string
    provider: 'railway' | 'render'
    provider_deployment_id: string
    provider_service_id: string | null
    token_id: string
  }>()

  await Promise.allSettled(pending.results.map(async (item) => {
    if (item.provider === 'railway') {
      await handleRailwayStatus(
        env,
        userId,
        new URL(`https://internal/api/railway/status?token_id=${encodeURIComponent(item.token_id)}&deployment_id=${encodeURIComponent(item.provider_deployment_id)}`),
      )
      return
    }
    if (item.provider_service_id) {
      await handleRenderStatus(
        env,
        userId,
        new URL(`https://internal/api/render/status?token_id=${encodeURIComponent(item.token_id)}&deploy_id=${encodeURIComponent(item.provider_deployment_id)}&service_id=${encodeURIComponent(item.provider_service_id)}`),
      )
    }
  }))

  const r = await env.DB.prepare(
    `SELECT id, provider, name, status, region, url, panel_url, dashboard_url, template,
            provider_deployment_id, provider_service_id, error_message, setup_state, setup_note,
            setup_node_link, setup_sub_url, created_at, updated_at
     FROM hosted_deployments WHERE user_id = ? ORDER BY created_at DESC`,
  ).bind(userId).all()
  return json({ data: r.results })
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
  const workerSource = String(body.worker_source ?? 'edgetunnel').trim().toLowerCase()
  const slotError = await validateDeploymentSlot(env, userId, name, workerSource)
  if (slotError) return apiError(slotError, 409)

  const tokenRow = await env.DB.prepare("SELECT id, token FROM cf_tokens WHERE id = ? AND user_id = ? AND status = 'active'")
    .bind(body.cf_token_id ?? '', userId)
    .first<{ id: string; token: string }>()
  if (!tokenRow) return apiError('توکن فعال انتخاب‌شده پیدا نشد', 400)

  const id = genId()
  await env.DB.prepare(
    `INSERT INTO deployments (id, user_id, name, worker_code, config, status, uuid, custom_path, method, worker_source, created_at, updated_at)
     VALUES (?, ?, ?, '[auto-loaded]', '{}', 'deploying', ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, userId, name, uuid, body.custom_path || null, body.method === 'pages' ? 'pages' : 'workers',
      workerSource, nowIso(), nowIso())
    .run()

  await logActivity(env, userId, 'deployment_created', 'deployment', name)

  ctx.waitUntil(runDeployment(env, {
    deployment_id: id,
    worker_name: name,
    cf_token: tokenRow.token,
    cf_token_row_id: tokenRow.id,
    uuid,
    method: body.method === 'pages' ? 'pages' : 'workers',
    worker_source: workerSource,
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

/** Shape a bot_config row for the API (never leak the secret). */
async function botConfigRowToObj(row: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { webhook_secret: _secret, ...rest } = row
  return { ...rest, is_active: !!row.is_active }
}

/** Clean a pasted bot token: strip the optional "bot" prefix, whitespace and
 *  invisible Unicode characters (ZWNJ/RLM/LRM etc.) that Persian keyboards and
 *  copy-paste often inject — any of these makes Telegram reject the token. */
function sanitizeBotToken(raw: string): string {
  return raw
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\s]/g, '')
    .replace(/^bot/i, '')
    .trim()
}

/** Register (or re-register) the Telegram webhook for a bot.
 *  A per-bot random secret_token rides along so the webhook handler can route
 *  every incoming update to exactly this bot_config row. */
async function setBotWebhook(botToken: string, origin: string, secret: string): Promise<{ ok: boolean; description?: string }> {
  const resp = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: `${origin}/api/webhooks/telegram`,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: true,
      secret_token: secret,
    }),
  }).then((r) => r.json()).catch(() => null)
  const data = resp as { ok?: boolean; description?: string } | null
  return { ok: !!data?.ok, description: data?.description }
}

/** Live webhook diagnostics straight from Telegram (getWebhookInfo). */
async function botWebhookInfo(env: Env, userId: string): Promise<Response> {
  const row = await env.DB.prepare('SELECT bot_token FROM bot_config WHERE user_id = ? LIMIT 1').bind(userId).first<{ bot_token: string }>()
  if (!row) return apiError('ربات هنوز پیکربندی نشده است', 404)
  const info = await fetch(`https://api.telegram.org/bot${sanitizeBotToken(row.bot_token)}/getWebhookInfo`)
    .then((r) => r.json())
    .catch(() => null)
  const data = info as { ok?: boolean; result?: Record<string, unknown>; description?: string } | null
  if (!data?.ok) return apiError(`خواندن وضعیت وب‌هوک از تلگرام ناموفق بود: ${data?.description ?? 'ارتباط برقرار نشد'}`)
  return json({ data: data.result })
}

/** Force-reconnect the webhook using the stored token (no retyping needed). */
async function reconnectBotWebhook(env: Env, userId: string, origin: string): Promise<Response> {
  const row = await env.DB.prepare('SELECT id, bot_token, is_active FROM bot_config WHERE user_id = ? LIMIT 1').bind(userId).first<{ id: string; bot_token: string; is_active: number }>()
  if (!row) return apiError('ربات هنوز پیکربندی نشده است', 404)
  if (!row.is_active) await env.DB.prepare('UPDATE bot_config SET is_active = 1 WHERE id = ?').bind(row.id).run()
  const secret = genId().replace(/-/g, '')
  const hook = await setBotWebhook(sanitizeBotToken(row.bot_token), origin, secret)
  if (!hook.ok) return apiError(`اتصال مجدد وب‌هوک ناموفق بود: ${hook.description ?? 'خطای ناشناخته'}`)
  await env.DB.prepare('UPDATE bot_config SET webhook_url = ?, webhook_secret = ?, is_active = 1, updated_at = ? WHERE id = ?')
    .bind(`${origin}/api/webhooks/telegram`, secret, nowIso(), row.id)
    .run()
  await logActivity(env, userId, 'bot_webhook_reconnected', 'bot', null)
  return getBotConfig(env, userId)
}

async function getBotConfig(env: Env, userId: string): Promise<Response> {
  const row = await env.DB.prepare('SELECT * FROM bot_config WHERE user_id = ? LIMIT 1').bind(userId).first<Record<string, unknown>>()
  return json({ data: row ? await botConfigRowToObj(row) : null })
}

async function saveBotConfig(env: Env, userId: string, request: Request, origin: string): Promise<Response> {
  const body = safeJsonParse<{ bot_token?: string; welcome_message?: string; is_active?: boolean }>(await request.text().catch(() => ''), {})

  const existing = await env.DB.prepare('SELECT * FROM bot_config WHERE user_id = ? LIMIT 1').bind(userId).first<Record<string, unknown>>()

  // Update without a token: toggle is_active and/or edit the welcome message.
  // Saving again also re-registers the webhook from the stored token — a safe
  // "reconnect" that fixes silently-dropped hooks without retyping the token.
  if (!body.bot_token?.trim() && existing) {
    const storedToken = sanitizeBotToken(existing.bot_token as string)
    let reconnect: { ok: boolean; description?: string } | null = null
    if ((typeof body.is_active === 'boolean' ? body.is_active : !!existing.is_active) && storedToken) {
      const secret = genId().replace(/-/g, '')
      reconnect = await setBotWebhook(storedToken, origin, secret)
      if (reconnect.ok) {
        await env.DB.prepare('UPDATE bot_config SET webhook_url = ?, webhook_secret = ? WHERE id = ?')
          .bind(`${origin}/api/webhooks/telegram`, secret, existing.id as string)
          .run()
      }
    }
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
    if (reconnect && !reconnect.ok) {
      const updated = await env.DB.prepare('SELECT * FROM bot_config WHERE user_id = ? LIMIT 1').bind(userId).first<Record<string, unknown>>()
      return json({ data: updated ? await botConfigRowToObj(updated) : null, warning: `وب‌هوک دوباره وصل نشد: ${reconnect.description ?? 'خطای ناشناخته'}` })
    }
    return getBotConfig(env, userId)
  }

  if (!body.bot_token?.trim() && !existing) return apiError('توکن ربات الزامی است')
  const botToken = sanitizeBotToken(body.bot_token!)
  if (!/^\d{8,12}:[A-Za-z0-9_-]{30,}$/.test(botToken)) {
    return apiError('قالب توکن درست نیست — توکن باید شبیه 123456789:AAH... باشد و مستقیم از BotFather کپی شود')
  }
  const welcome = body.welcome_message?.trim()
    || ((existing?.welcome_message as string) ?? '')
    || 'سلام! به ربات miliconfig خوش آمدید. برای شروع /start را بفرستید.'

  // Validate the token with Telegram and connect the webhook.
  const meResp = await fetch(`https://api.telegram.org/bot${botToken}/getMe`).then((r) => r.json()).catch(() => null)
  const meData = meResp as { ok?: boolean; result?: { username?: string }; description?: string } | null
  if (!meData?.ok) {
    const d = meData?.description ?? ''
    const hint = d.includes('Unauthorized')
      ? 'توکن از سمت تلگرام رد شد — مطمئن شوید کل رشتهٔ کامل از BotFather کپی شده و ربات با /revoke باطل نشده باشد'
      : d
        ? `تلگرام پاسخ داد: ${d}`
        : 'اتصال به سرور تلگرام ناموفق بود — چند لحظه بعد دوباره تلاش کنید'
    return apiError(`توکن ربات تأیید نشد: ${hint}`)
  }
  const botUsername = meData.result?.username ?? null
  const webhookUrl = `${origin}/api/webhooks/telegram`
  const webhookSecret = genId().replace(/-/g, '')
  const hookData = await setBotWebhook(botToken, origin, webhookSecret)
  if (!hookData.ok) {
    return apiError(`اتصال وب‌هوک ناموفق بود: ${hookData.description ?? 'خطای ناشناخته'}`)
  }
  if (existing) {
    await env.DB.prepare(
      `UPDATE bot_config SET bot_token = ?, bot_username = ?, webhook_url = ?, webhook_secret = ?, is_active = ?, welcome_message = ?, updated_at = ? WHERE id = ?`,
    )
      .bind(botToken, botUsername, webhookUrl, webhookSecret, body.is_active === false ? 0 : 1, welcome, nowIso(), existing.id as string)
      .run()
  } else {
    await env.DB.prepare(
      `INSERT INTO bot_config (id, user_id, bot_token, bot_username, webhook_url, webhook_secret, is_active, welcome_message, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    )
      .bind(genId(), userId, botToken, botUsername, webhookUrl, webhookSecret, welcome, nowIso(), nowIso())
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
  const [tokens, deps, hosted, botUsersAll, recentLogs] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS c FROM cf_tokens WHERE user_id = ?').bind(userId).first<{ c: number }>(),
    env.DB.prepare("SELECT status, COUNT(*) AS c FROM deployments WHERE user_id = ? GROUP BY status").bind(userId).all<{ status: string; c: number }>(),
    env.DB.prepare("SELECT provider, status, COUNT(*) AS c FROM hosted_deployments WHERE user_id = ? GROUP BY provider, status").bind(userId).all<{ provider: string; status: string; c: number }>(),
    env.DB.prepare('SELECT is_active, is_admin, COUNT(*) AS c FROM bot_users WHERE user_id = ? GROUP BY is_active, is_admin').bind(userId).all<{ is_active: number; is_admin: number; c: number }>(),
    env.DB.prepare('SELECT id, action, entity_name, created_at FROM activity_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 8').bind(userId).all(),
  ])

  const statusCounts = Object.fromEntries(deps.results.map((r) => [r.status, r.c]))
  const hostedTotal = hosted.results.reduce((acc, r) => acc + r.c, 0)
  const hostedSuccess = hosted.results.filter((r) => r.status === 'success').reduce((acc, r) => acc + r.c, 0)
  const hostedFailed = hosted.results.filter((r) => r.status === 'failed').reduce((acc, r) => acc + r.c, 0)
  const hostedByProvider = Object.fromEntries(
    ['railway', 'render'].map((provider) => [provider, hosted.results.filter((r) => r.provider === provider).reduce((acc, r) => acc + r.c, 0)]),
  )
  const botUsers = botUsersAll.results.reduce((acc, g) => acc + g.c, 0)
  const activeBotUsers = botUsersAll.results.filter((g) => g.is_active).reduce((acc, g) => acc + g.c, 0)

  return json({
    tokens: tokens?.c ?? 0,
    deployments: deps.results.reduce((acc, g) => acc + g.c, 0) + hostedTotal,
    deployed: (statusCounts.deployed ?? 0) + hostedSuccess,
    failed: (statusCounts.failed ?? 0) + hostedFailed,
    hostedDeployments: hostedTotal,
    railwayDeployments: hostedByProvider.railway ?? 0,
    renderDeployments: hostedByProvider.render ?? 0,
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

  // Public subscription endpoints (token in URL acts as the credential)
  if (path.startsWith('/api/sub/') && method === 'GET') {
    const token = path.split('/')[4] ?? ''
    const target = url.searchParams.get('target')
    if (path.startsWith('/api/sub/opt/')) return await serveOptimizerSub(env, token, target)
    if (path.startsWith('/api/sub/group/')) return await serveGroupSub(env, token, target)
    if (path.startsWith('/api/sub/inject/')) return await serveInjectedSub(env, token, target)
    if (path.startsWith('/api/sub/member/')) return await serveMemberSub(env, token, target, request)
  }

  // Public status page per member (token in URL acts as the credential).
  // `/status/<token>/sub` serves the member's live subscription directly —
  // so the download button on the status card never 404s.
  if (path.startsWith('/status/') && method === 'GET') {
    const rest = path.slice('/status/'.length)
    const subMatch = rest.match(/^([^/]+)\/sub\/?$/)
    if (subMatch) {
      return await serveMemberSub(env, subMatch[1], url.searchParams.get('target'), request)
    }
    return await serveStatusPage(env, rest, url.origin)
  }

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

    // ── Railway (StanNG auto-deploy) ─────────────────────────────────────
    if (path === '/api/railway/tokens' && method === 'GET') return await listRailwayTokens(env, user.id)
    if (path === '/api/railway/tokens' && method === 'POST') return await createRailwayToken(env, user.id, request)
    if (path.match(/^\/api\/railway\/tokens\/[^/]+$/) && method === 'DELETE') return await deleteRailwayToken(env, user.id, path.split('/')[4])
    if (path === '/api/railway/deploy' && method === 'POST') return await handleRailwayDeploy(env, user.id, request)
    if (path === '/api/railway/status' && method === 'GET') return await handleRailwayStatus(env, user.id, url)

    // ── Render.com (StanNG auto-deploy) ──────────────────────────────────
    if (path === '/api/render/tokens' && method === 'GET') return await listRenderTokens(env, user.id)
    if (path === '/api/render/tokens' && method === 'POST') return await createRenderToken(env, user.id, request)
    if (path.match(/^\/api\/render\/tokens\/[^/]+$/) && method === 'DELETE') return await deleteRenderToken(env, user.id, path.split('/')[4])
    if (path === '/api/render/deploy' && method === 'POST') return await handleRenderDeploy(env, user.id, request)
    if (path === '/api/render/status' && method === 'GET') return await handleRenderStatus(env, user.id, url)

    if (path === '/api/deployments' && method === 'GET') return await listDeployments(env, user.id, url)
    if (path === '/api/hosted-deployments' && method === 'GET') return await listHostedDeployments(env, user.id)
    if (path === '/api/deployments' && method === 'POST') return await createDeployment(env, user.id, request, ctx, origin)
    if (path.match(/^\/api\/deployments\/[^/]+$/) && method === 'GET') return await getDeployment(env, user.id, path.split('/')[3])
    if (path.match(/^\/api\/deployments\/[^/]+$/) && method === 'DELETE') return await deleteDeployment(env, user.id, path.split('/')[3])

    if (path === '/api/bot-config/webhook-info' && method === 'GET') return await botWebhookInfo(env, user.id)
    if (path === '/api/bot-config/reconnect' && method === 'POST') return await reconnectBotWebhook(env, user.id, origin)
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

    // ── Real source bridge: unified settings + live node check ────────
    if (path === '/api/source-settings' && method === 'POST') {
      const body = safeJsonParse(await request.text().catch(() => ''), {})
      return await handleSourceSettings(env, user.id, body)
    }
    if (path.match(/^\/api\/source-nodes\/[^/]+$/) && method === 'GET') {
      return await handleSourceNodes(env, user.id, path.split('/')[3])
    }
    if (path === '/api/ip-scanner' && method === 'POST') {
      const body = safeJsonParse<{ mode?: string; ranges?: string; ports?: string; count?: number; timeout?: number; speedtest?: boolean }>(await request.text().catch(() => ''), {})
      if (body.mode === 'ranges') return await handleRangeScan(body)
      return await handleIpScanner(body)
    }

    // Per-country proxy lists are fetched server-side (worker network, cached)
    // so filtered regions never lose the picker because a CDN is unreachable.
    if (path === '/api/proxy-list' && method === 'GET') {
      return await handleProxyList(url.searchParams.get('protocol'))
    }

    // ── Config optimizer ────────────────────────────────────────────────
    if (path === '/api/optimizer' && method === 'GET') return await handleOptimizerList(env, user.id)
    if (path === '/api/optimizer' && method === 'POST') return await handleOptimizerCreate(env, user.id, request, ctx)
    if (path.match(/^\/api\/optimizer\/[^/]+$/) && method === 'GET') return await handleOptimizerGet(env, user.id, path.split('/')[3])
    if (path.match(/^\/api\/optimizer\/[^/]+$/) && method === 'DELETE') return await handleOptimizerDelete(env, user.id, path.split('/')[3])

    // ── Real edge probes (Sop8 engines: colo, ports, speedtest, batch) ──
    if (path === '/api/opt/probe' && method === 'GET') return await handleOptProbe(env, request)
    if (path === '/api/opt/ports' && method === 'GET') return await handleOptPorts(env, request)
    if (path === '/api/opt/scan-batch' && method === 'POST') return await handleOptScanBatch(env, request)
    if (path === '/api/opt/speedtest' && method === 'GET') return await handleOptSpeedtest(env, request)

    // ── Group subscriptions ───────────────────────────────────────────
    if (path === '/api/subgroups' && method === 'GET') return await handleGroupList(env, user.id)
    if (path === '/api/subgroups' && method === 'POST') return await handleGroupCreate(env, user.id, request)
    if (path.match(/^\/api\/subgroups\/[^/]+$/) && method === 'PATCH') return await handleGroupPatch(env, user.id, path.split('/')[3], request)
    if (path.match(/^\/api\/subgroups\/[^/]+$/) && method === 'DELETE') return await handleGroupDelete(env, user.id, path.split('/')[3])

    // ── Custom injected subscriptions (miliconfig) ────────────────────
    if (path === '/api/injector' && method === 'GET') return await handleInjectorList(env, user.id)
    if (path === '/api/injector' && method === 'POST') return await handleInjectorCreate(env, user.id, request)
    if (path.match(/^\/api\/injector\/[^/]+$/) && method === 'PATCH') return await handleInjectorPatch(env, user.id, path.split('/')[3], request)
    if (path.match(/^\/api\/injector\/[^/]+$/) && method === 'DELETE') return await handleInjectorDelete(env, user.id, path.split('/')[3])

    // ── Per-worker members (end users with private settings) ──────────
    if (path === '/api/backup' && method === 'GET') return await exportBackup(env, user.id)
    if (path === '/api/backup' && method === 'POST') return await importBackup(env, user.id, request)
    if (path === '/api/members' && method === 'GET') return await handleMemberList(env, user.id, url.searchParams.get('deployment_id'))
    if (path === '/api/members' && method === 'POST') return await handleMemberCreate(env, user.id, request)
    if (path === '/api/members/bulk' && method === 'POST') return await handleMemberBulk(env, user.id, request)
    if (path === '/api/cf-quota' && method === 'GET') return await handleCfQuota(env, user.id)
    if (path.match(/^\/api\/members\/[^/]+\/usage$/) && method === 'POST') return await refreshMemberUsage(env, user.id, path.split('/')[3])
    if (path.match(/^\/api\/members\/[^/]+\/test$/) && method === 'GET') return await handleMemberTest(env, user.id, path.split('/')[3])
    if (path.match(/^\/api\/members\/[^/]+$/) && method === 'PATCH') return await handleMemberPatch(env, user.id, path.split('/')[3], request)
    if (path.match(/^\/api\/members\/[^/]+$/) && method === 'DELETE') return await handleMemberDelete(env, user.id, path.split('/')[3])

    // ── Admin: user & quota management ─────────────────────────────────
    if (path.startsWith('/api/admin')) {
      if (user.role !== 'admin') return apiError('دسترسی فقط برای ادمین', 403)
      if (path === '/api/admin/users' && method === 'GET') {
        const r = await env.DB.prepare(
          `SELECT u.id, u.email, u.role, u.max_deployments, u.created_at,
            (SELECT COUNT(*) FROM deployments d WHERE d.user_id = u.id)
              + (SELECT COUNT(*) FROM hosted_deployments hd WHERE hd.user_id = u.id) AS deployments
           FROM users u ORDER BY u.created_at`,
        ).all()
        return json({ data: r.results })
      }
      const adminTarget = path.match(/^\/api\/admin\/users\/([^/]+)$/)
      if (adminTarget && method === 'PATCH') {
        const body = safeJsonParse<{ role?: string; max_deployments?: number }>(await request.text().catch(() => ''), {})
        if (body.role !== undefined) {
          if (!['admin', 'user'].includes(body.role)) return apiError('نقش نامعتبر است')
          await env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(body.role, adminTarget[1]).run()
        }
        if (body.max_deployments !== undefined) {
          const quota = Math.min(Math.max(1, Number(body.max_deployments) || 1), 1000)
          await env.DB.prepare('UPDATE users SET max_deployments = ? WHERE id = ?').bind(quota, adminTarget[1]).run()
        }
        const row = await env.DB.prepare('SELECT id, email, role, max_deployments FROM users WHERE id = ?').bind(adminTarget[1]).first()
        if (!row) return apiError('کاربر پیدا نشد', 404)
        return json({ data: row })
      }
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
      // D1 is attached via dashboard bindings; until it is, answer the API
      // with a clear one-time setup hint instead of crashing.
      if (path.startsWith('/api')) {
        if (!env.DB) {
          return withCors(
            json(
              {
                error:
                  'اتصال دیتابیس هنوز برقرار نیست. در داشبورد کلودفلر: Workers & Pages → miliconfigpro-v1 → Settings → Bindings → Add → D1 database، نام متغیر: DB',
                setup_required: 'd1_binding',
              },
              503,
            ),
            cors,
          )
        }
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
