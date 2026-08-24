import type { Env } from './env'
import { apiError, genId, json, nowIso, safeJsonParse } from './util'
import { b64encodeUtf8 } from './net'
import { applyInjection, buildClashYaml, type PreferredIP, type ProxySpec } from './inject'
import { fetchSourceNodes, resolveSource } from './sourcebridge'

// ── Group subscriptions: merge several deployed workers into one sub link ──
// With injection enabled, preferred IPs and HTTP/SOCKS5 chains are applied at
// serve time — so the group sub auto-updates whenever workers or IPs change.

interface GroupBody {
  name?: string
  deployment_ids?: string[]
  ips?: PreferredIP[]
  proxies?: ProxySpec[]
  inject?: boolean
}

function sanitizeIps(ips?: PreferredIP[]): PreferredIP[] {
  return (ips ?? [])
    .filter((p) => p && /^(\d{1,3}(\.\d{1,3}){3}|[a-z0-9.-]+\.[a-z]{2,})$/i.test(String(p.ip)))
    .slice(0, 20)
    .map((p) => ({ ip: String(p.ip), ...(p.port ? { port: Number(p.port) } : {}) }))
}

function sanitizeProxies(proxies?: ProxySpec[]): ProxySpec[] {
  return (proxies ?? [])
    .filter((p) => p && ['http', 'socks5'].includes(String(p.type)) && p.server && Number(p.port) > 0)
    .slice(0, 5)
    .map((p) => ({
      type: p.type === 'http' ? 'http' as const : 'socks5' as const,
      server: String(p.server),
      port: Number(p.port),
      ...(p.username ? { username: String(p.username) } : {}),
      ...(p.password ? { password: String(p.password) } : {}),
    }))
}

export async function handleGroupCreate(env: Env, userId: string, request: Request): Promise<Response> {
  const body = safeJsonParse<GroupBody>(await request.text().catch(() => ''), {})
  const name = body.name?.trim() || 'ساب گروهی'
  const ids = (body.deployment_ids ?? []).filter(Boolean).slice(0, 50)
  if (ids.length === 0) return apiError('حداقل یک ورکر را انتخاب کنید')
  const ips = sanitizeIps(body.ips)
  const proxies = sanitizeProxies(body.proxies)
  const inject = (body.inject && (ips.length > 0 || proxies.length > 0)) ? 1 : 0

  // Only allow workers owned by the user.
  const owned = await env.DB.prepare(
    `SELECT id FROM deployments WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`,
  ).bind(userId, ...ids).all<{ id: string }>()
  if (!owned.results.length) return apiError('ورکری انتخاب نشده است', 404)

  const id = genId()
  const subToken = genId().replace(/-/g, '')
  await env.DB.prepare(
    'INSERT INTO sub_groups (id, user_id, name, deployment_ids, sub_token, ips, proxies, inject, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(id, userId, name, JSON.stringify(owned.results.map((r) => r.id)), subToken, JSON.stringify(ips), JSON.stringify(proxies), inject, nowIso()).run()
  return json({ data: { id, name, sub_token: subToken } }, 201)
}

export async function handleGroupList(env: Env, userId: string): Promise<Response> {
  const r = await env.DB.prepare('SELECT * FROM sub_groups WHERE user_id = ? ORDER BY created_at DESC').bind(userId).all()
  return json({
    data: r.results.map((row) => ({
      ...row,
      deployment_ids: safeJsonParse(row.deployment_ids as string, []),
      ips: safeJsonParse(row.ips as string, []),
      proxies: safeJsonParse(row.proxies as string, []),
      inject: !!row.inject,
    })),
  })
}

export async function handleGroupDelete(env: Env, userId: string, id: string): Promise<Response> {
  const row = await env.DB.prepare('DELETE FROM sub_groups WHERE id = ? AND user_id = ? RETURNING name').bind(id, userId).first<{ name: string }>()
  if (!row) return apiError('گروه پیدا نشد', 404)
  return json({ success: true })
}

/** Update a group's injection settings — the sub link stays the same. */
export async function handleGroupPatch(env: Env, userId: string, id: string, request: Request): Promise<Response> {
  const body = safeJsonParse<GroupBody>(await request.text().catch(() => ''), {})
  const existing = await env.DB.prepare('SELECT id, ips, proxies, inject FROM sub_groups WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first<{ id: string; ips: string; proxies: string; inject: number }>()
  if (!existing) return apiError('گروه پیدا نشد', 404)

  const ips = body.ips !== undefined ? sanitizeIps(body.ips) : safeJsonParse<PreferredIP[]>(existing.ips, [])
  const proxies = body.proxies !== undefined ? sanitizeProxies(body.proxies) : safeJsonParse<ProxySpec[]>(existing.proxies, [])
  const inject = body.inject !== undefined
    ? ((body.inject && (ips.length > 0 || proxies.length > 0)) ? 1 : 0)
    : existing.inject

  await env.DB.prepare('UPDATE sub_groups SET ips = ?, proxies = ?, inject = ? WHERE id = ?')
    .bind(JSON.stringify(ips), JSON.stringify(proxies), inject, id)
    .run()
  return json({ data: { id, ips, proxies, inject: !!inject } })
}

/** Fetch the live subscription content of a single deployed worker (via source bridge). */
async function fetchWorkerSub(env: Env, deploymentId: string): Promise<string[]> {
  const ctx = await resolveSource(env, null, deploymentId).catch(() => null)
  if (!ctx) return []
  const { lines } = await fetchSourceNodes(ctx)
  return lines
}

/** Public endpoint — GET /api/sub/group/:token[?target=clash] */
export async function serveGroupSub(env: Env, token: string, target: string | null): Promise<Response> {
  const group = await env.DB.prepare('SELECT deployment_ids, ips, proxies, inject FROM sub_groups WHERE sub_token = ?')
    .bind(token)
    .first<{ deployment_ids: string; ips: string; proxies: string; inject: number }>()
  if (!group) return new Response('گروه یافت نشد', { status: 404 })
  const ids = safeJsonParse<string[]>(group.deployment_ids, [])
  if (!ids.length) return new Response('گروه خالی است', { status: 404 })

  const deps = await env.DB.prepare(
    `SELECT id, user_id FROM deployments
     WHERE id IN (${ids.map(() => '?').join(',')}) AND status = 'deployed'`,
  ).bind(...ids).all<{ id: string; user_id: string }>()

  const seen = new Set<string>()
  const merged: string[] = []
  const chunks = deps.results.map((d) => fetchWorkerSub(env, d.id))
  const all = (await Promise.allSettled(chunks)).flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  for (const line of all) {
    // Dedupe by node identity (scheme+credentials+host+port+params), ignoring
    // the display name — so re-injected variants don't pile up.
    const identity = line.replace(/#.*$/, '')
    if (!seen.has(identity)) {
      seen.add(identity)
      merged.push(line)
    }
  }

  // Collapse prior injection variants (names like "X | miliconfig-1.2.3.4")
  // back to their base nodes, so a fresh injection doesn't multiply them.
  const baseByName = new Map<string, string>()
  for (const line of merged) {
    const m = line.match(/^([^#]+)#(.*)$/)
    const name = m ? decodeURIComponent(m[2]) : ''
    const baseName = name.split(' | miliconfig-')[0].trim()
    if (!baseByName.has(baseName) || !name.includes(' | miliconfig-')) {
      baseByName.set(baseName, line)
    }
  }
  const baseLines = merged.length && baseByName.size ? [...baseByName.values()] : merged
  if (!merged.length) return new Response('هیچ کانفیگی از ورکرهای گروه دریافت نشد', { status: 502 })

  // Injection is applied at serve time → the link auto-updates with the
  // current workers content and the group's saved IP/proxy settings.
  if (group.inject) {
    const result = applyInjection(baseLines, safeJsonParse<PreferredIP[]>(group.ips, []), safeJsonParse<ProxySpec[]>(group.proxies, []))
    if (target === 'clash') {
      return new Response(buildClashYaml(result), {
        headers: { 'Content-Type': 'text/yaml; charset=utf-8', 'profile-update-interval': '1' },
      })
    }
    return new Response(b64encodeUtf8(result.subLines.join('\n')), {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'profile-update-interval': '1' },
    })
  }

  return new Response(b64encodeUtf8((group.inject ? baseLines : merged).join('\n')), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
