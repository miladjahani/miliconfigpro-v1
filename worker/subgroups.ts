import type { Env } from './env'
import { apiError, genId, json, nowIso, safeJsonParse } from './util'
import { b64encodeUtf8, tryDecodeSub } from './net'

// ── Group subscriptions: merge several deployed workers into one sub link ──

export async function handleGroupCreate(env: Env, userId: string, request: Request): Promise<Response> {
  const body = safeJsonParse<{ name?: string; deployment_ids?: string[] }>(await request.text().catch(() => ''), {})
  const name = body.name?.trim() || 'ساب گروهی'
  const ids = (body.deployment_ids ?? []).filter(Boolean).slice(0, 50)
  if (ids.length === 0) return apiError('حداقل یک ورکر را انتخاب کنید')

  // Only allow workers owned by the user.
  const owned = await env.DB.prepare(
    `SELECT id FROM deployments WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`,
  ).bind(userId, ...ids).all<{ id: string }>()
  if (!owned.results.length) return apiError('ورکری انتخاب نشده است', 404)

  const id = genId()
  const subToken = genId().replace(/-/g, '')
  await env.DB.prepare(
    'INSERT INTO sub_groups (id, user_id, name, deployment_ids, sub_token, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(id, userId, name, JSON.stringify(owned.results.map((r) => r.id)), subToken, nowIso()).run()
  return json({ data: { id, name, sub_token: subToken } }, 201)
}

export async function handleGroupList(env: Env, userId: string): Promise<Response> {
  const r = await env.DB.prepare('SELECT * FROM sub_groups WHERE user_id = ? ORDER BY created_at DESC').bind(userId).all()
  return json({ data: r.results.map((row) => ({ ...row, deployment_ids: safeJsonParse(row.deployment_ids as string, []) })) })
}

export async function handleGroupDelete(env: Env, userId: string, id: string): Promise<Response> {
  const row = await env.DB.prepare('DELETE FROM sub_groups WHERE id = ? AND user_id = ? RETURNING name').bind(id, userId).first<{ name: string }>()
  if (!row) return apiError('گروه پیدا نشد', 404)
  return json({ success: true })
}

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

/** Public endpoint — GET /api/sub/group/:token */
export async function serveGroupSub(env: Env, token: string): Promise<Response> {
  const group = await env.DB.prepare('SELECT deployment_ids FROM sub_groups WHERE sub_token = ?').bind(token).first<{ deployment_ids: string }>()
  if (!group) return new Response('گروه یافت نشد', { status: 404 })
  const ids = safeJsonParse<string[]>(group.deployment_ids, [])
  if (!ids.length) return new Response('گروه خالی است', { status: 404 })

  const deps = await env.DB.prepare(
    `SELECT worker_url, panel_url, uuid, custom_path FROM deployments
     WHERE id IN (${ids.map(() => '?').join(',')}) AND status = 'deployed'`,
  ).bind(...ids).all<{ worker_url: string | null; panel_url: string | null; uuid: string | null; custom_path: string | null }>()

  const seen = new Set<string>()
  const merged: string[] = []
  const chunks = deps.results.map((d) => fetchWorkerSub(d))
  const all = (await Promise.allSettled(chunks)).flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  for (const line of all) {
    if (!seen.has(line)) {
      seen.add(line)
      merged.push(line)
    }
  }
  if (!merged.length) return new Response('هیچ کانفیگی از ورکرهای گروه دریافت نشد', { status: 502 })
  return new Response(b64encodeUtf8(merged.join('\n')), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
