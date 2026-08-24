// Per-worker end users ("اعضا"): each deployed worker can be shared with
// several people, each with a private sub link and unique settings —
// country IP pool, transport, fragment, quota, expiry.

import type { Env } from './env'
import { apiError, genId, json, nowIso, safeJsonParse } from './util'
import { b64encodeUtf8 } from './net'
import { applyInjection, buildClashYaml, type PreferredIP } from './inject'
import { resolvePool } from './countries'
import { findPreset } from './presets'
import { filterAlive, rotate } from './rotation'
import { fetchSourceNodes, resolveSource } from './sourcebridge'
import { notifyQuotaLevel } from './telegram'

/** Fire a Telegram quota alert only when the member crosses a new level.
 * Levels: 0 none, 1 = 80%, 2 = 90%, 3 = exhausted. Stored in notified_level
 * so each threshold is announced exactly once (reset clears it).
 */
async function maybeNotifyQuota(env: Env, member: Record<string, unknown>, level: 1 | 2 | 3, isRequests = false): Promise<void> {
  try {
    const current = (member.notified_level as number) ?? 0
    if (level <= current) return
    await env.DB.prepare('UPDATE worker_members SET notified_level = ? WHERE id = ?')
      .bind(level, member.id as string).run()
    const dep = await env.DB.prepare('SELECT name FROM deployments WHERE id = ?')
      .bind(member.deployment_id as string).first<{ name: string }>()
    const fmt = (n: number) => n >= 1073741824 ? `${(n / 1073741824).toFixed(1)} GB` : `${Math.round(n / 1048576)} MB`
    const detail = isRequests && level === 3 ? 'سقف درخواست‌ها به پایان رسید'
      : `مصرف: ${fmt((member.used_bytes as number) ?? 0)}${member.quota_bytes ? ` از ${fmt(member.quota_bytes as number)}` : ''}`
    void notifyQuotaLevel(env, member.owner_user_id as string, member.name as string, dep?.name ?? 'ورکر', level, detail)
  } catch {
    // alerts must never break sub serving
  }
}

export interface MemberSettings {
  countries: string[]
  custom_ips: string[]
  transport: '' | 'ws' | 'grpc' | 'httpupgrade'
  fragment: boolean
  fragment_preset: string
  fragment_config: {
    packets?: string; length?: string; interval?: string
    /** Advanced JSON fragment — passed through verbatim (fm= param). */
    fm?: string
    /** Custom cipher suites — passed through verbatim (cs= param). */
    cs?: string
  }
  /** ClientHello fingerprint (fp= param). */
  fingerprint: string
  /** Custom SNI/Host masking overrides. */
  custom_sni: string
  custom_host: string
  bypass_sanctions: boolean
  /** Rotate the preferred-IP entry order every N minutes (0 = off). */
  ip_rotation_minutes: number
}

export interface MemberRow {
  id: string
  owner_user_id: string
  deployment_id: string
  name: string
  token: string
  enabled: number
  expires_at: string | null
  quota_bytes: number | null
  used_bytes: number
  usage_updated_at: string | null
  settings: string
  created_at: string
}

export const FINGERPRINTS = ['chrome', 'firefox', 'safari', 'ios', 'android', 'edge', 'randomized', 'unsafe'] as const

const DEFAULT_SETTINGS: MemberSettings = {
  countries: [], custom_ips: [], transport: '',
  fragment: false, fragment_preset: '', fragment_config: {},
  fingerprint: '', custom_sni: '', custom_host: '', bypass_sanctions: false,
  ip_rotation_minutes: 0,
}

function cleanParam(v: unknown, max = 400): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

function sanitizeSettings(s?: Partial<MemberSettings>): MemberSettings {
  const countries = (s?.countries ?? []).filter((c) => /^[a-z]{2}$|^(multi)$/.test(c)).slice(0, 8)
  const customIps = (s?.custom_ips ?? []).filter((ip) => /^(\d{1,3}(\.\d{1,3}){3}|[a-z0-9.-]+\.[a-z]{2,})$/i.test(ip)).slice(0, 20)
  const transport = (['', 'ws', 'grpc', 'httpupgrade'] as const).includes(s?.transport as never) ? (s?.transport ?? '') : ''
  return {
    countries,
    custom_ips: customIps,
    transport: transport as MemberSettings['transport'],
    fragment: !!s?.fragment,
    fragment_preset: typeof s?.fragment_preset === 'string' ? s.fragment_preset.slice(0, 20) : '',
    fragment_config: s?.fragment_config && typeof s.fragment_config === 'object'
      ? {
          // Basic values are length-capped; advanced fm/cs pass through
          // verbatim so exact working configs from Iran survive untouched.
          ...(s.fragment_config.packets ? { packets: String(s.fragment_config.packets).slice(0, 20) } : {}),
          ...(s.fragment_config.length ? { length: String(s.fragment_config.length).slice(0, 20) } : {}),
          ...(s.fragment_config.interval ? { interval: String(s.fragment_config.interval).slice(0, 20) } : {}),
          ...(cleanParam(s.fragment_config.fm) ? { fm: cleanParam(s.fragment_config.fm) } : {}),
          ...(cleanParam(s.fragment_config.cs) ? { cs: cleanParam(s.fragment_config.cs) } : {}),
        }
      : {},
    fingerprint: (FINGERPRINTS as readonly string[]).includes(String(s?.fingerprint)) ? String(s?.fingerprint) : '',
    custom_sni: cleanParam(s?.custom_sni, 200),
    custom_host: cleanParam(s?.custom_host, 200),
    bypass_sanctions: !!s?.bypass_sanctions,
    ip_rotation_minutes: Math.min(1440, Math.max(0, Math.round(Number(s?.ip_rotation_minutes) || 0))),
  }
}

// ── CRUD ────────────────────────────────────────────────────────────────────

interface MemberBody extends Partial<MemberSettings> {
  name?: string
  deployment_id?: string
  enabled?: boolean
  expires_at?: string | null
  quota_gb?: number | null
  request_quota?: number | null
  ip_limit?: number | null
  start_on_connect?: boolean
  reset_period_days?: number | null
}

export async function handleMemberCreate(env: Env, userId: string, request: Request): Promise<Response> {
  const body = safeJsonParse<MemberBody>(await request.text().catch(() => ''), {})
  if (!body.deployment_id) return apiError('deployment_id الزامی است')
  const dep = await env.DB.prepare(
    `SELECT id, name FROM deployments WHERE id = ? AND user_id = ?`,
  ).bind(body.deployment_id, userId).first<{ id: string; name: string }>()
  if (!dep) return apiError('ورکر پیدا نشد', 404)

  const settings = sanitizeSettings(body)
  const id = genId()
  const token = genId().replace(/-/g, '')
  const quotaBytes = body.quota_gb == null || body.quota_gb <= 0 ? null : Math.round(body.quota_gb * 1024 ** 3)
  const reqQuota = body.request_quota == null || body.request_quota <= 0 ? null : Math.round(body.request_quota)
  const ipLimit = body.ip_limit == null || body.ip_limit <= 0 ? null : Math.round(body.ip_limit)
  const resetDays = body.reset_period_days == null || body.reset_period_days <= 0 ? null : Math.round(body.reset_period_days)
  await env.DB.prepare(
    `INSERT INTO worker_members (id, owner_user_id, deployment_id, name, token, enabled, expires_at, quota_bytes, request_quota, ip_limit, used_bytes, used_requests, recent_ips, start_on_connect, reset_period_days, settings, created_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 0, 0, '[]', ?, ?, ?, ?)`,
  ).bind(
    id, userId, dep.id, body.name?.trim() || `کاربر ${dep.name}`,
    token, body.expires_at ?? null, quotaBytes, reqQuota, ipLimit,
    body.start_on_connect ? 1 : 0, resetDays, JSON.stringify(settings), nowIso(),
  ).run()
  return json({ data: { id, token } }, 201)
}

export async function handleMemberList(env: Env, userId: string, deploymentId: string | null): Promise<Response> {
  const rows = deploymentId
    ? await env.DB.prepare('SELECT * FROM worker_members WHERE owner_user_id = ? AND deployment_id = ? ORDER BY created_at DESC').bind(userId, deploymentId).all()
    : await env.DB.prepare('SELECT * FROM worker_members WHERE owner_user_id = ? ORDER BY created_at DESC').bind(userId).all()
  return json({ data: rows.results.map(serializeMember) })
}

function serializeMember(row: Record<string, unknown>) {
  const settings = safeJsonParse<MemberSettings>(row.settings as string, DEFAULT_SETTINGS)
  return {
    ...row,
    settings,
    enabled: !!row.enabled,
    used_gb: Number((((row.used_bytes as number) ?? 0) / 1024 ** 3).toFixed(3)),
    quota_gb: row.quota_bytes ? Number((row.quota_bytes as number / 1024 ** 3).toFixed(2)) : null,
    used_requests: (row.used_requests as number) ?? 0,
    request_quota: row.request_quota ?? null,
    ip_limit: row.ip_limit ?? null,
    active_devices: safeJsonParse<{ ip: string }[]>(row.recent_ips as string ?? '[]', []).length,
    start_on_connect: !!row.start_on_connect,
    activated_at: row.activated_at ?? null,
    reset_period_days: row.reset_period_days ?? null,
    last_reset_at: row.last_reset_at ?? null,
  }
}

export async function handleMemberPatch(env: Env, userId: string, id: string, request: Request): Promise<Response> {
  const body = safeJsonParse<MemberBody>(await request.text().catch(() => ''), {})
  const existing = await env.DB.prepare('SELECT * FROM worker_members WHERE id = ? AND owner_user_id = ?')
    .bind(id, userId).first<Record<string, unknown>>()
  if (!existing) return apiError('عضو پیدا نشد', 404)

  const prevSettings = safeJsonParse<MemberSettings>(existing.settings as string, DEFAULT_SETTINGS)
  const settings = sanitizeSettings({
    countries: body.countries ?? prevSettings.countries,
    custom_ips: body.custom_ips ?? prevSettings.custom_ips,
    transport: body.transport ?? prevSettings.transport,
    fragment: body.fragment ?? prevSettings.fragment,
    fragment_preset: body.fragment_preset !== undefined ? body.fragment_preset : prevSettings.fragment_preset,
    fragment_config: body.fragment_config ?? prevSettings.fragment_config,
    fingerprint: body.fingerprint !== undefined ? body.fingerprint : prevSettings.fingerprint,
    custom_sni: body.custom_sni !== undefined ? body.custom_sni : prevSettings.custom_sni,
    custom_host: body.custom_host !== undefined ? body.custom_host : prevSettings.custom_host,
    bypass_sanctions: body.bypass_sanctions ?? prevSettings.bypass_sanctions,
    ip_rotation_minutes: body.ip_rotation_minutes !== undefined ? body.ip_rotation_minutes : prevSettings.ip_rotation_minutes,
  })
  const enabled = body.enabled !== undefined ? (body.enabled ? 1 : 0) : (existing.enabled as number)
  const expiresAt = body.expires_at !== undefined ? body.expires_at : (existing.expires_at as string | null)
  const quotaBytes = body.quota_gb !== undefined
    ? (body.quota_gb == null || body.quota_gb <= 0 ? null : Math.round(body.quota_gb * 1024 ** 3))
    : (existing.quota_bytes as number | null)
  const reqQuota = body.request_quota !== undefined
    ? (body.request_quota == null || body.request_quota <= 0 ? null : Math.round(body.request_quota))
    : (existing.request_quota as number | null)
  const ipLimit = body.ip_limit !== undefined
    ? (body.ip_limit == null || body.ip_limit <= 0 ? null : Math.round(body.ip_limit))
    : (existing.ip_limit as number | null)
  const resetDays = body.reset_period_days !== undefined
    ? (body.reset_period_days == null || body.reset_period_days <= 0 ? null : Math.round(body.reset_period_days))
    : (existing.reset_period_days as number | null)
  const startOnConnect = body.start_on_connect !== undefined ? (body.start_on_connect ? 1 : 0) : (existing.start_on_connect as number)

  await env.DB.prepare(
    'UPDATE worker_members SET settings = ?, enabled = ?, expires_at = ?, quota_bytes = ?, request_quota = ?, ip_limit = ?, reset_period_days = ?, start_on_connect = ? WHERE id = ?',
  ).bind(JSON.stringify(settings), enabled, expiresAt, quotaBytes, reqQuota, ipLimit, resetDays, startOnConnect, id).run()
  return json({ data: { id } })
}

/** POST /api/members/bulk — batch actions on the owner's members. */
export async function handleMemberBulk(env: Env, userId: string, request: Request): Promise<Response> {
  const body = safeJsonParse<{ ids?: string[]; action?: string }>(await request.text().catch(() => ''), {})
  const ids = (body.ids ?? []).filter((i) => typeof i === 'string').slice(0, 200)
  if (!ids.length) return apiError('حداقل یک عضو انتخاب کنید')
  const ph = ids.map(() => '?').join(',')

  switch (body.action) {
    case 'enable':
      await env.DB.prepare(`UPDATE worker_members SET enabled = 1 WHERE owner_user_id = ? AND id IN (${ph})`).bind(userId, ...ids).run()
      break
    case 'disable':
      await env.DB.prepare(`UPDATE worker_members SET enabled = 0 WHERE owner_user_id = ? AND id IN (${ph})`).bind(userId, ...ids).run()
      break
    case 'delete':
      await env.DB.prepare(`DELETE FROM worker_members WHERE owner_user_id = ? AND id IN (${ph})`).bind(userId, ...ids).run()
      break
    case 'reset_quota':
      await env.DB.prepare(
        `UPDATE worker_members SET used_bytes = 0, used_requests = 0, recent_ips = '[]', notified_level = 0, last_reset_at = ? WHERE owner_user_id = ? AND id IN (${ph})`,
      ).bind(nowIso(), userId, ...ids).run()
      break
    case 'reset_time':
      await env.DB.prepare(
        `UPDATE worker_members SET activated_at = NULL WHERE owner_user_id = ? AND id IN (${ph})`,
      ).bind(userId, ...ids).run()
      break
    default:
      return apiError('action نامعتبر است')
  }
  return json({ success: true, affected: ids.length, action: body.action })
}

export async function handleMemberDelete(env: Env, userId: string, id: string): Promise<Response> {
  const row = await env.DB.prepare('DELETE FROM worker_members WHERE id = ? AND owner_user_id = ? RETURNING name')
    .bind(id, userId).first<{ name: string }>()
  if (!row) return apiError('عضو پیدا نشد', 404)
  return json({ success: true })
}

// ── Usage via Cloudflare GraphQL analytics ─────────────────────────────────

const USAGE_QUERY = `query ($account: String!, $from: Time!, $worker: String!) {
  viewer { accounts(filter: { accountTag: $account }) {
    httpRequests1dGroups(limit: 32, filter: { date_geq: $from, scriptName: $worker }) {
      sum { bytes requests }
    }
  } }
}`

async function getDeployCf(env: Env, deploymentId: string, userId: string) {
  const dep = await env.DB.prepare(
    'SELECT id, name, cf_account_id, cf_token_row_id FROM deployments WHERE id = ? AND user_id = ?',
  ).bind(deploymentId, userId).first<{ id: string; name: string; cf_account_id: string | null; cf_token_row_id: string | null }>()
  if (!dep) return null
  const tokenRow = dep.cf_token_row_id
    ? await env.DB.prepare('SELECT token FROM cf_tokens WHERE id = ? AND user_id = ?').bind(dep.cf_token_row_id, userId).first<{ token: string }>()
    : await env.DB.prepare('SELECT token FROM cf_tokens WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').bind(userId).first<{ token: string }>()
  if (!dep.cf_account_id || !tokenRow) return null
  return { accountId: dep.cf_account_id, workerName: dep.name, token: tokenRow.token }
}

/** Sum this month's edge bytes for the member's worker and store it. */
export async function refreshMemberUsage(env: Env, userId: string, id: string): Promise<Response> {
  const member = await env.DB.prepare('SELECT deployment_id FROM worker_members WHERE id = ? AND owner_user_id = ?')
    .bind(id, userId).first<{ deployment_id: string }>()
  if (!member) return apiError('عضو پیدا نشد', 404)
  const cf = await getDeployCf(env, member.deployment_id, userId)
  if (!cf) return apiError('توکن یا account_id ورکر در دسترس نیست', 400)

  const from = new Date(Date.now() - 31 * 86400_000).toISOString().replace(/\.\d+Z$/, 'Z')
  const resp = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cf.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: USAGE_QUERY, variables: { account: cf.accountId, from, worker: cf.workerName } }),
  })
  const body = safeJsonParse<{ data?: { viewer?: { accounts?: { httpRequests1dGroups?: { sum?: { bytes?: number; requests?: number } }[] }[] } }; errors?: { message: string }[] }>(await resp.text().catch(() => ''), {})
  if (!resp.ok || body.errors?.length) {
    return apiError(`خواندن آمار کلودفلر ناموفق بود: ${body.errors?.[0]?.message ?? resp.status}`)
  }
  const groups = body.data?.viewer?.accounts?.[0]?.httpRequests1dGroups ?? []
  const bytes = groups.reduce((sum, g) => sum + (g.sum?.bytes ?? 0), 0)
  const requests = groups.reduce((sum, g) => sum + (g.sum?.requests ?? 0), 0)
  await env.DB.prepare('UPDATE worker_members SET used_bytes = ?, used_requests = ?, usage_updated_at = ? WHERE id = ?')
    .bind(bytes, requests, nowIso(), id).run()
  return json({ data: { used_bytes: bytes, used_requests: requests, used_gb: Number((bytes / 1024 ** 3).toFixed(3)) } })
}

// ── Cloudflare 100k daily-request monitor ──────────────────────────────────

const TODAY_QUERY = `query ($account: String!, $day: Date!) {
  viewer { accounts(filter: { accountTag: $account }) {
    httpRequests1dGroups(limit: 1, filter: { date_geq: $day, date_leq: $day }) {
      sum { requests }
    }
  } }
}`

/** GET /api/cf-quota — total requests across all workers today vs the 100k free limit. */
export async function handleCfQuota(env: Env, userId: string): Promise<Response> {
  const tok = await env.DB.prepare(
    `SELECT token FROM cf_tokens WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
  ).bind(userId).first<{ token: string }>()
  const dep = await env.DB.prepare(
    'SELECT cf_account_id FROM deployments WHERE user_id = ? AND cf_account_id IS NOT NULL ORDER BY updated_at DESC LIMIT 1',
  ).bind(userId).first<{ cf_account_id: string | null }>()
  if (!tok?.token || !dep?.cf_account_id) return apiError('توکن فعال یا اکانت متصل یافت نشد', 400)

  const day = new Date().toISOString().slice(0, 10)
  const resp = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: TODAY_QUERY, variables: { account: dep.cf_account_id, day } }),
  })
  const body = safeJsonParse<{ data?: { viewer?: { accounts?: { httpRequests1dGroups?: { sum?: { requests?: number } }[] }[] } }; errors?: { message: string }[] }>(await resp.text().catch(() => ''), {})
  if (!resp.ok || body.errors?.length) {
    return apiError(`خواندن آمار کلودفلر ناموفق بود: ${body.errors?.[0]?.message ?? resp.status}`)
  }
  const usedToday = body.data?.viewer?.accounts?.[0]?.httpRequests1dGroups?.[0]?.sum?.requests ?? 0
  return json({ data: { used_today: usedToday, limit: 100_000, day } })
}


// ── Personalized sub serving ────────────────────────────────────────────────

/** Rewrite or insert a single URI query param in a node link (before the #-name). */
function setQueryParam(line: string, key: string, value: string): string {
  const hashIdx = line.indexOf('#')
  const main = hashIdx === -1 ? line : line.slice(0, hashIdx)
  const suffix = hashIdx === -1 ? '' : line.slice(hashIdx)
  const qIdx = main.indexOf('?')
  if (qIdx === -1) return `${main}?${key}=${encodeURIComponent(value)}${suffix}`
  const base = main.slice(0, qIdx)
  const parts = main.slice(qIdx + 1).split('&').filter((p) => p && !p.startsWith(`${key}=`))
  parts.push(`${key}=${encodeURIComponent(value)}`)
  return `${base}?${parts.join('&')}${suffix}`
}

/** Rewrite transport type param in a vless/vmess/trojan URI. */
function rewriteTransport(line: string, transport: MemberSettings['transport']): string {
  if (!transport) return line
  return line.replace(/([?&])type=[^&]*/, `$1type=${transport}`)
}

/** Append fragment params (xray-style) for clients that support them. */
function addFragmentParams(line: string, fc: MemberSettings['fragment_config']): string {
  const parts: string[] = []
  if (fc.packets) parts.push(`packets=${fc.packets}`)
  if (fc.length) parts.push(`length=${fc.length}`)
  if (fc.interval) parts.push(`interval=${fc.interval}`)
  if (!parts.length) return line
  return setQueryParam(line, 'fragment', parts.join(','))
}

/** Public endpoint — GET /api/sub/member/:token[?target=clash] */
export async function serveMemberSub(env: Env, token: string, target: string | null, request?: Request): Promise<Response> {
  const member = await env.DB.prepare('SELECT * FROM worker_members WHERE token = ?').bind(token)
    .first<Record<string, unknown>>()
  if (!member) return new Response('یافت نشد', { status: 404 })
  if (!member.enabled) return new Response('این اشتراک غیرفعال شده است. با مدیر خود تماس بگیرید.', { status: 403 })

  // ── Start-on-first-connect: activate on first successful fetch ────────
  let activatedAt = member.activated_at as string | null
  const startOnConnect = !!member.start_on_connect
  if (startOnConnect && !activatedAt) {
    activatedAt = nowIso()
    await env.DB.prepare('UPDATE worker_members SET activated_at = ? WHERE id = ?').bind(activatedAt, member.id as string).run()
  }

  // ── Expiry — counted from first connection when start-on-connect is on
  let effectiveExpiry = member.expires_at as string | null
  if (effectiveExpiry && startOnConnect && activatedAt) {
    const span = new Date(effectiveExpiry).getTime() - new Date(member.created_at as string).getTime()
    if (span > 0) {
      effectiveExpiry = new Date(new Date(activatedAt).getTime() + span).toISOString()
    }
  }
  if (effectiveExpiry && effectiveExpiry < nowIso()) {
    return new Response('این اشتراک منقضی شده است. با مدیر خود تماس بگیرید.', { status: 403 })
  }

  // ── Scheduled automatic quota/volume reset ───────────────────────────
  const resetDays = member.reset_period_days as number | null
  if (resetDays && resetDays > 0) {
    const anchor = new Date((member.last_reset_at as string | null) ?? (member.created_at as string)).getTime()
    if (Date.now() - anchor >= resetDays * 86_400_000) {
      await env.DB.prepare(
        'UPDATE worker_members SET used_bytes = 0, used_requests = 0, recent_ips = \'[]\', notified_level = 0, last_reset_at = ? WHERE id = ?',
      ).bind(nowIso(), member.id as string).run()
      member.used_bytes = 0
      member.used_requests = 0
      member.recent_ips = '[]'
    }
  }
  const quota = member.quota_bytes as number | null
  if (quota && (member.used_bytes as number) >= quota) {
    await maybeNotifyQuota(env, member, 3)
    return new Response('حجم اشتراک شما به پایان رسیده است. با مدیر خود تماس بگیرید.', { status: 402 })
  }
  const reqQuota = member.request_quota as number | null
  if (reqQuota && ((member.used_requests as number) ?? 0) >= reqQuota) {
    await maybeNotifyQuota(env, member, 3, true)
    return new Response('سقف تعداد درخواست‌های شما به پایان رسیده است. با مدیر خود تماس بگیرید.', { status: 402 })
  }

  // ── Quota-usage alerts (80% / 90%) — fire once per threshold ─────────
  const byteRatio = quota ? (member.used_bytes as number) / quota : 0
  const reqRatio = reqQuota ? ((member.used_requests as number) ?? 0) / reqQuota : 0
  const ratio = Math.max(byteRatio, reqRatio)
  if (ratio >= 0.9) await maybeNotifyQuota(env, member, 2)
  else if (ratio >= 0.8) await maybeNotifyQuota(env, member, 1)

  const ctx = await resolveSource(env, member.owner_user_id as string, member.deployment_id as string)
  if (!ctx) return new Response('ورکر در دسترس نیست (اتصال واقعی به سورس برقرار نشد)', { status: 502 })

  const { lines } = await fetchSourceNodes(ctx)
  if (!lines.length) return new Response('کانفیگی از ورکر دریافت نشد', { status: 502 })

  const parsed: Partial<MemberSettings> = safeJsonParse<Partial<MemberSettings>>(member.settings as string, {})
  const settings: MemberSettings = { ...DEFAULT_SETTINGS, ...parsed }
  if (settings.fragment && Object.keys(settings.fragment_config).length === 0) {
    settings.fragment_config = { packets: 'tlshello', length: '100-200', interval: '10-20' }
  }
  // ISP preset wins over manual fragment values when chosen.
  if (settings.fragment && settings.fragment_preset) {
    const preset = findPreset(settings.fragment_preset)
    if (preset) settings.fragment_config = { ...preset.config, ...(settings.fragment_config.fm ? { fm: settings.fragment_config.fm } : {}), ...(settings.fragment_config.cs ? { cs: settings.fragment_config.cs } : {}) }
  }

  // ── Concurrent-device (IP) limit, enforced on sub fetch ──────────────
  const ipLimit = member.ip_limit as number | null
  if (ipLimit && ipLimit > 0 && request) {
    const clientIp = request.headers.get('cf-connecting-ip') ?? 'unknown'
    const now = Date.now()
    const DAY = 86_400_000
    const recent = safeJsonParse<{ ip: string; ts: number }[]>(member.recent_ips as string ?? '[]', [])
      .filter((r) => now - r.ts < DAY)
    if (!recent.some((r) => r.ip === clientIp)) {
      if (recent.length >= ipLimit) {
        return new Response(`تعداد دستگاه‌های مجاز شما (${ipLimit}) تکمیل است. با مدیر خود تماس بگیرید.`, { status: 403 })
      }
      recent.push({ ip: clientIp, ts: now })
    } else {
      for (const r of recent) if (r.ip === clientIp) r.ts = now
    }
    await env.DB.prepare('UPDATE worker_members SET recent_ips = ? WHERE id = ?')
      .bind(JSON.stringify(recent), member.id as string).run()
  }

  // Base node per line (dedupe by identity, keep first).
  const seen = new Set<string>()
  const base: string[] = []
  for (const line of lines) {
    const identity = line.replace(/#.*$/, '')
    if (!seen.has(identity)) { seen.add(identity); base.push(line) }
  }

  const namePrefix = String(member.name ?? '')
  let out = base
  if (settings.transport) out = out.map((l) => rewriteTransport(l, settings.transport))
  if (settings.custom_sni) out = out.map((l) => setQueryParam(l, 'sni', settings.custom_sni))
  if (settings.custom_host) out = out.map((l) => setQueryParam(l, 'host', settings.custom_host))
  if (settings.fingerprint) out = out.map((l) => setQueryParam(l, 'fp', settings.fingerprint))
  if (settings.bypass_sanctions && !settings.custom_sni) {
    // TLS SNI trick: point sni at a permissive domain so sanctioned-host
    // SNI blocking is bypassed on the CDN path.
    out = out.map((l) => setQueryParam(l, 'sni', 'www.speedtest.net'))
  }
  if (settings.fragment) {
    out = out.map((l) => addFragmentParams(l, settings.fragment_config))
    // Advanced pass-through params — appended verbatim, never rewritten.
    const fc = settings.fragment_config
    if (fc.fm) out = out.map((l) => setQueryParam(l, 'fm', fc.fm!))
    if (fc.cs) out = out.map((l) => setQueryParam(l, 'cs', fc.cs!))
  }

  // Preferred-IP pool with optional rotation + live health-checked fallback:
  // dead IPs are dropped (TCP probe, cached 5 min) and the rest are ordered
  // fastest-first. With rotation on, the entry address changes every cycle.
  let poolRaw = resolvePool(settings.countries, settings.custom_ips).map((p) => ({ ip: p.ip }))
  if (settings.ip_rotation_minutes > 0) {
    poolRaw = rotate(poolRaw, settings.ip_rotation_minutes)
    const alive = await filterAlive(poolRaw, 12)
    if (alive.length) poolRaw = alive.map((a) => ({ ip: a.ip, port: a.port }))
  }
  const pool: PreferredIP[] = poolRaw

  let subLines = out
  let clashExtra: { fragment?: MemberSettings['fragment_config'] } = {}
  if (settings.fragment) clashExtra.fragment = settings.fragment_config

  if (pool.length) {
    const result = applyInjection(out, pool, [])
    subLines = result.subLines
  }

  // Prefix names with the member name for easy client identification.
  const named = subLines.map((l) => {
    const m = l.match(/^([^#]+)#(.*)$/)
    if (!m) return l
    const decoded = decodeURIComponent(m[2])
    return `${m[1]}#${encodeURIComponent(`${namePrefix} | ${decoded}`)}`
  })

  if (target === 'clash') {
    const result = applyInjection(named, pool, [])
    const proxies = result.clashProxies.map((p) => {
      let q = p
      if (settings.fragment && (q.type === 'vless' || q.type === 'vmess')) q = { ...q, fragment: settings.fragment_config }
      if (settings.fingerprint && 'client-fingerprint' in q) q = { ...q, 'client-fingerprint': settings.fingerprint }
      return q
    })
    const yaml = buildClashYaml({ ...result, clashProxies: proxies })
    return new Response(yaml, { headers: { 'Content-Type': 'text/yaml; charset=utf-8', 'profile-update-interval': '1' } })
  }

  return new Response(b64encodeUtf8(named.join('\n')), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'profile-update-interval': '1' },
  })
}
