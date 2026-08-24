// Per-worker end users ("اعضا"): each deployed worker can be shared with
// several people, each with a private sub link and unique settings —
// country IP pool, transport, fragment, quota, expiry.

import type { Env } from './env'
import { apiError, genId, json, nowIso, safeJsonParse } from './util'
import { b64encodeUtf8, tryDecodeSub } from './net'
import { applyInjection, buildClashYaml, type PreferredIP, type ProxySpec } from './inject'
import { resolvePool } from './countries'

export interface MemberSettings {
  countries: string[]
  custom_ips: string[]
  transport: '' | 'ws' | 'grpc' | 'httpupgrade'
  fragment: boolean
  fragment_config: { packets?: string; length?: string; interval?: string }
  bypass_sanctions: boolean
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

const DEFAULT_SETTINGS: MemberSettings = {
  countries: [], custom_ips: [], transport: '',
  fragment: false, fragment_config: {}, bypass_sanctions: false,
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
    fragment_config: s?.fragment_config && typeof s.fragment_config === 'object' && Object.keys(s.fragment_config).length
      ? {
          ...(s.fragment_config.packets ? { packets: String(s.fragment_config.packets).slice(0, 20) } : {}),
          ...(s.fragment_config.length ? { length: String(s.fragment_config.length).slice(0, 20) } : {}),
          ...(s.fragment_config.interval ? { interval: String(s.fragment_config.interval).slice(0, 20) } : {}),
        }
      : { packets: 'tlshello', length: '100-200', interval: '10-20' },
    bypass_sanctions: !!s?.bypass_sanctions,
  }
}

// ── CRUD ────────────────────────────────────────────────────────────────────

interface MemberBody extends Partial<MemberSettings> {
  name?: string
  deployment_id?: string
  enabled?: boolean
  expires_at?: string | null
  quota_gb?: number | null
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
  await env.DB.prepare(
    `INSERT INTO worker_members (id, owner_user_id, deployment_id, name, token, enabled, expires_at, quota_bytes, used_bytes, settings, created_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, 0, ?, ?)`,
  ).bind(
    id, userId, dep.id, body.name?.trim() || `کاربر ${dep.name}`,
    token, body.expires_at ?? null, quotaBytes, JSON.stringify(settings), nowIso(),
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
    fragment_config: body.fragment_config ?? prevSettings.fragment_config,
    bypass_sanctions: body.bypass_sanctions ?? prevSettings.bypass_sanctions,
  })
  const enabled = body.enabled !== undefined ? (body.enabled ? 1 : 0) : (existing.enabled as number)
  const expiresAt = body.expires_at !== undefined ? body.expires_at : (existing.expires_at as string | null)
  const quotaBytes = body.quota_gb !== undefined
    ? (body.quota_gb == null || body.quota_gb <= 0 ? null : Math.round(body.quota_gb * 1024 ** 3))
    : (existing.quota_bytes as number | null)

  await env.DB.prepare(
    'UPDATE worker_members SET settings = ?, enabled = ?, expires_at = ?, quota_bytes = ? WHERE id = ?',
  ).bind(JSON.stringify(settings), enabled, expiresAt, quotaBytes, id).run()
  return json({ data: { id } })
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
      sum { bytes }
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
  const body = safeJsonParse<{ data?: { viewer?: { accounts?: { httpRequests1dGroups?: { sum?: { bytes?: number } }[] }[] } }; errors?: { message: string }[] }>(await resp.text().catch(() => ''), {})
  if (!resp.ok || body.errors?.length) {
    return apiError(`خواندن آمار کلودفلر ناموفق بود: ${body.errors?.[0]?.message ?? resp.status}`)
  }
  const bytes = (body.data?.viewer?.accounts?.[0]?.httpRequests1dGroups ?? [])
    .reduce((sum, g) => sum + (g.sum?.bytes ?? 0), 0)
  await env.DB.prepare('UPDATE worker_members SET used_bytes = ?, usage_updated_at = ? WHERE id = ?')
    .bind(bytes, nowIso(), id).run()
  return json({ data: { used_bytes: bytes, used_gb: Number((bytes / 1024 ** 3).toFixed(3)) } })
}

// ── Personalized sub serving ────────────────────────────────────────────────

/** Fetch the subscription content of a single deployed worker. */
async function fetchWorkerSub(dep: { worker_url: string | null; panel_url: string | null; uuid: string | null; custom_path: string | null }): Promise<string[]> {
  const candidates: string[] = []
  if (dep.worker_url && dep.uuid) candidates.push(`${dep.worker_url}/${dep.uuid}`)
  if (dep.worker_url && dep.custom_path) candidates.push(`${dep.worker_url}/${dep.custom_path}`)
  if (dep.panel_url) candidates.push(`${dep.panel_url}/sub`)
  for (const url of candidates) {
    try {
      const resp = await fetch(url, { redirect: 'follow' })
      if (!resp.ok) continue
      const text = tryDecodeSub(await resp.text())
      const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.includes('://'))
      if (lines.length) return lines
    } catch {
      // try next candidate
    }
  }
  return []
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
  const sep = line.includes('?') ? '&' : '?'
  return `${line}${sep}fragment=${encodeURIComponent(parts.join(','))}`
}

/** Public endpoint — GET /api/sub/member/:token[?target=clash] */
export async function serveMemberSub(env: Env, token: string, target: string | null): Promise<Response> {
  const member = await env.DB.prepare('SELECT * FROM worker_members WHERE token = ?').bind(token)
    .first<Record<string, unknown>>()
  if (!member) return new Response('یافت نشد', { status: 404 })
  if (!member.enabled) return new Response('این اشتراک غیرفعال شده است. با مدیر خود تماس بگیرید.', { status: 403 })
  if (member.expires_at && String(member.expires_at) < nowIso()) {
    return new Response('این اشتراک منقضی شده است. با مدیر خود تماس بگیرید.', { status: 403 })
  }
  const quota = member.quota_bytes as number | null
  if (quota && (member.used_bytes as number) >= quota) {
    return new Response('حجم اشتراک شما به پایان رسیده است. با مدیر خود تماس بگیرید.', { status: 402 })
  }

  const dep = await env.DB.prepare(
    'SELECT worker_url, panel_url, uuid, custom_path FROM deployments WHERE id = ? AND status = \'deployed\'',
  ).bind(member.deployment_id as string).first<{ worker_url: string | null; panel_url: string | null; uuid: string | null; custom_path: string | null }>()
  if (!dep) return new Response('ورکر در دسترس نیست', { status: 502 })

  const lines = await fetchWorkerSub(dep)
  if (!lines.length) return new Response('کانفیگی از ورکر دریافت نشد', { status: 502 })

  const parsed: Partial<MemberSettings> = safeJsonParse<Partial<MemberSettings>>(member.settings as string, {})
  const settings: MemberSettings = { ...DEFAULT_SETTINGS, ...parsed }
  if (settings.fragment && Object.keys(settings.fragment_config).length === 0) {
    settings.fragment_config = { packets: 'tlshello', length: '100-200', interval: '10-20' }
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
  if (settings.bypass_sanctions) {
    // Prefer TLS SNI trick: point sni/host at a permissive domain so
    // sanctioned-host SNI blocking is bypassed on the CDN path.
    out = out.map((l) => l.includes('sni=') ? l : l.replace(/([?&])/, `$1sni=${encodeURIComponent('www.speedtest.net')}&`))
  }
  if (settings.fragment) out = out.map((l) => addFragmentParams(l, settings.fragment_config))

  const pool: PreferredIP[] = resolvePool(settings.countries, settings.custom_ips)
    .map((p) => ({ ip: p.ip }))

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
    const proxies = result.clashProxies.map((p) => (
      settings.fragment && (p.type === 'vless' || p.type === 'vmess')
        ? { ...p, fragment: settings.fragment_config } : p
    ))
    const yaml = buildClashYaml({ ...result, clashProxies: proxies })
    return new Response(yaml, { headers: { 'Content-Type': 'text/yaml; charset=utf-8', 'profile-update-interval': '1' } })
  }

  return new Response(b64encodeUtf8(named.join('\n')), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'profile-update-interval': '1' },
  })
}
