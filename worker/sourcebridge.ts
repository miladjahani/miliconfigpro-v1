// Real bridge between this panel and the deployed worker sources.
//
// Node generation always happens inside the deployed worker (edgetunnel or
// the custom miliconfig source). This module is the panel's live connection
// to those sources:
//   • resolveSource()      — deployment row + CF token + KV namespace + source type
//   • fetchSourceNodes()   — pulls the REAL node list from the deployed worker's
//                            own subscription endpoint (per-source paths, timeouts)
//                            with a local fallback built from its KV config so
//                            member links never die
//   • get/applySettings()  — unified settings view (proxyip / path / ADD.txt /
//                            transport) mapped onto whichever source schema is
//                            behind the worker, written straight into its KV

import type { Env } from './env'
import { apiError, json, safeJsonParse } from './util'
import { kvGet, kvPut } from './cfapi'
import { extractNodes } from './parser'

export type SourceType = 'edgetunnel' | 'edgetunnel_kv' | 'custom' | 'nexus'

/** Normalize the source value stored on a deployment without silently mapping
 * a different worker family to edgetunnel. */
export function normalizeSourceType(raw: unknown): SourceType | null {
  const value = String(raw ?? '').trim().toLowerCase()
  if (value === 'edgetunnel' || value === 'edgetunnel_kv') return value
  if (value === 'custom') return 'custom'
  if (value === 'nexus') return 'nexus'
  return null
}

export function isZeusSource(raw: unknown): boolean {
  return String(raw ?? '').trim().toLowerCase() === 'miliconfigzeus'
}

export interface SourceCtx {
  deploymentId: string
  userId: string
  name: string
  workerUrl: string | null
  panelUrl: string | null
  uuid: string | null
  customPath: string | null
  method: string
  source: SourceType
  accountId: string
  kvNs: string
  token: string
}

const CONFIG_KEY: Record<SourceType, string> = {
  edgetunnel: 'config.json',
  edgetunnel_kv: 'config.json',
  custom: 'c',
  nexus: 'c',
}
const ADDTXT_KEY = 'ADD.txt'

/** Load a deployment + its CF credentials as a bridge context.
 *  Pass userId = null to resolve any deployment regardless of owner
 *  (used by public group-sub serving, which only stores trusted ids). */
export async function resolveSource(env: Env, userId: string | null, deploymentId: string): Promise<SourceCtx | null> {
  const dep = userId === null
    ? await env.DB.prepare(
        `SELECT id, user_id, name, worker_url, panel_url, uuid, custom_path, method,
                worker_source, config, cf_account_id, cf_token_row_id, kv_namespace_id
           FROM deployments WHERE id = ?`,
      ).bind(deploymentId).first<Record<string, unknown>>()
    : await env.DB.prepare(
        `SELECT id, user_id, name, worker_url, panel_url, uuid, custom_path, method,
                worker_source, config, cf_account_id, cf_token_row_id, kv_namespace_id
           FROM deployments WHERE id = ? AND user_id = ?`,
      ).bind(deploymentId, userId).first<Record<string, unknown>>()
  if (!dep) return null
  const ownerId = dep.user_id as string

  const tokenRow = dep.cf_token_row_id
    ? await env.DB.prepare('SELECT token FROM cf_tokens WHERE id = ? AND user_id = ?').bind(dep.cf_token_row_id, ownerId).first<{ token: string }>()
    : await env.DB.prepare(`SELECT token FROM cf_tokens WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`).bind(ownerId).first<{ token: string }>()
  if (!dep.cf_account_id || !dep.kv_namespace_id || !tokenRow?.token) return null

  const cfg = safeJsonParse<{ worker_source?: string }>(dep.config as string ?? '', {})
  const raw = dep.worker_source ?? cfg.worker_source ?? 'edgetunnel'
  const source = normalizeSourceType(raw)
  if (!source) return null

  return {
    deploymentId: dep.id as string,
    userId: ownerId,
    name: dep.name as string,
    workerUrl: (dep.worker_url as string | null)?.replace(/\/$/, '') ?? null,
    panelUrl: (dep.panel_url as string | null)?.replace(/\/$/, '') ?? null,
    uuid: dep.uuid as string | null,
    customPath: dep.custom_path as string | null,
    method: String(dep.method ?? 'workers'),
    source,
    accountId: dep.cf_account_id as string,
    kvNs: dep.kv_namespace_id as string,
    token: tokenRow.token,
  }
}

async function fetchWithTimeout(url: string, ms = 8000): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { redirect: 'follow', signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

/** Subscription endpoint candidates per source type. */
function subCandidates(ctx: SourceCtx): string[] {
  const out: string[] = []
  if (ctx.workerUrl && ctx.uuid) {
    out.push(`${ctx.workerUrl}/${ctx.uuid}`)
    out.push(`${ctx.workerUrl}/${ctx.uuid}/sub`)
  }
  if (ctx.workerUrl && ctx.customPath && (ctx.source === 'edgetunnel' || ctx.source === 'edgetunnel_kv')) {
    out.push(`${ctx.workerUrl}/${ctx.customPath.replace(/^\//, '')}`)
  }
  return [...new Set(out)]
}

const NODE_RE = /^(vless|vmess|trojan|hysteria2?|ss|socks):\/\//

/**
 * Fetch REAL nodes from the deployed worker's own sub endpoint.
 * Falls back to building equivalent vless nodes locally from the worker's KV
 * config (UUID + preferred IPs + proxy IP) when the live fetch fails, so
 * downstream subscriptions keep working.
 */
export async function fetchSourceNodes(ctx: SourceCtx): Promise<{ lines: string[]; live: boolean }> {
  for (const url of subCandidates(ctx)) {
    try {
      const resp = await fetchWithTimeout(url, 30_000)
      if (!resp.ok) continue
      // Universal parser: base64 / plain / sing-box JSON / Clash YAML / HTML
      const lines = extractNodes(await resp.text())
      if (lines.length) return { lines: dedupe(lines), live: true }
    } catch {
      // next candidate
    }
  }

  // ── Local fallback: build nodes from the source's KV config ────────────
  const cfgResp = await kvGet(ctx.accountId, ctx.kvNs, CONFIG_KEY[ctx.source], ctx.token).catch(() => null)
  const addResp = await kvGet(ctx.accountId, ctx.kvNs, ADDTXT_KEY, ctx.token).catch(() => null)
  const host = ctx.workerUrl ? new URL(ctx.workerUrl).host : ''
  const uuid = ctx.uuid ?? ''
  if (!host || !uuid) return { lines: [], live: false }

  const ips = (addResp?.ok ? addResp.text : '').split(/[\n,]/).map((s) => s.trim().split('#')[0]).filter(Boolean).slice(0, 32)
  let proxyip = ''
  if (cfgResp?.ok) {
    const cfg = safeJsonParse<Record<string, unknown>>(cfgResp.text, {})
    proxyip = String((cfg.反代 as Record<string, unknown> | undefined)?.proxyip ?? cfg.p ?? '').trim()
  }
  const addresses = [...new Set([...ips, ...(proxyip ? [proxyip] : []), ...(ips.length || proxyip ? [] : [host])])]

  // Read the source-specific path from config (PATH for edgetunnel, d for
  // custom/NEXUS). Keeping this source-aware prevents a custom worker from
  // receiving an edgetunnel path by accident.
  const wsPath = cfgResp?.ok
    ? (() => {
        const cfg = safeJsonParse<Record<string, unknown>>(cfgResp.text, {})
        return String(ctx.source === 'edgetunnel' || ctx.source === 'edgetunnel_kv' ? cfg.PATH ?? '/' : cfg.d ?? '/')
      })()
    : '/'

  const lines = addresses.map((ip) => {
    const name = encodeURIComponent(`${ctx.name} | ${ip === host ? 'direct' : ip}`)
    const params = new URLSearchParams({
      encryption: 'none',
      security: 'tls',
      sni: host,
      fp: 'chrome',
      type: 'ws',
      host: host,
      path: wsPath || '/',
    })
    if (proxyip) params.set('proxyip', proxyip)
    return `vless://${uuid}@${ip}:443?${params.toString()}#${name}`
  })
  return { lines: dedupe(lines), live: false }
}

function dedupe(lines: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const l of lines) {
    const identity = l.split('#')[0]
    if (!seen.has(identity)) { seen.add(identity); out.push(l) }
  }
  return out
}

// ── Unified settings across both source schemas ─────────────────────────────

export interface UnifiedSettings {
  proxyip: string
  path: string
  transport: '' | 'ws' | 'grpc'
  addtxt: string
}

async function readConfig(ctx: SourceCtx): Promise<Record<string, unknown>> {
  const r = await kvGet(ctx.accountId, ctx.kvNs, CONFIG_KEY[ctx.source], ctx.token)
  return r.ok ? safeJsonParse<Record<string, unknown>>(r.text, {}) : {}
}

async function writeConfig(ctx: SourceCtx, cfg: Record<string, unknown>): Promise<boolean> {
  const wr = await kvPut(ctx.accountId, ctx.kvNs, CONFIG_KEY[ctx.source], JSON.stringify(cfg, null, 2), ctx.token)
  return wr.ok
}

export async function getSourceSettings(ctx: SourceCtx): Promise<UnifiedSettings> {
  const cfg = await readConfig(ctx)
  const add = await kvGet(ctx.accountId, ctx.kvNs, ADDTXT_KEY, ctx.token)
  let s: UnifiedSettings = { proxyip: '', path: '', transport: '', addtxt: add.ok ? add.text : '' }
  if (ctx.source === 'custom') {
    s.proxyip = String(cfg.p ?? '')
    s.path = String(cfg.d ?? '')
    s.transport = String(cfg.tp ?? '').includes('grpc') ? 'grpc' : ''
  } else {
    const proxy = (cfg['反代'] ?? {}) as Record<string, unknown>
    s.proxyip = String(proxy.proxyip ?? '')
    s.path = String(cfg.PATH ?? '')
    s.transport = String(cfg['传输协议'] ?? '') === 'grpc' ? 'grpc' : 'ws'
  }
  return s
}

export async function applySourceSettings(
  ctx: SourceCtx,
  patch: Partial<Pick<UnifiedSettings, 'proxyip' | 'path' | 'transport'>>,
  addTxt?: string,
): Promise<{ ok: boolean; error?: string }> {
  const cfg = await readConfig(ctx)

  if (ctx.source === 'custom') {
    if (patch.proxyip !== undefined) cfg.p = patch.proxyip
    if (patch.path !== undefined) cfg.d = patch.path
    if (patch.transport !== undefined) cfg.tp = patch.transport === 'grpc' ? '/grpc' : ''
  } else {
    if (patch.proxyip !== undefined) {
      cfg['反代'] = { ...((cfg['反代'] ?? {}) as Record<string, unknown>), proxyip: patch.proxyip }
    }
    if (patch.path !== undefined) cfg.PATH = patch.path.startsWith('/') ? patch.path : `/${patch.path}`
    if (patch.transport !== undefined) cfg['传输协议'] = patch.transport === 'grpc' ? 'grpc' : 'ws'
  }

  if (!(await writeConfig(ctx, cfg))) {
    return { ok: false, error: 'نوشتن کانفیگ در KV ورکر ناموفق بود (دسترسی Workers KV Storage:Edit لازم است)' }
  }
  if (addTxt !== undefined) {
    const wr = await kvPut(ctx.accountId, ctx.kvNs, ADDTXT_KEY, addTxt, ctx.token, 'text/plain')
    if (!wr.ok) return { ok: false, error: 'کانفیگ ذخیره شد اما نوشتن ADD.txt ناموفق بود' }
  }
  return { ok: true }
}

// ── HTTP handlers ───────────────────────────────────────────────────────────

interface SourceBody {
  deployment_id?: string
  action?: 'get' | 'set'
  settings?: Partial<UnifiedSettings>
}

/** POST /api/source-settings */
export async function handleSourceSettings(env: Env, userId: string, body: SourceBody): Promise<Response> {
  if (!body.deployment_id) return apiError('deployment_id الزامی است', 400)
  const ctx = await resolveSource(env, userId, body.deployment_id)
  if (!ctx) return apiError('این ورکر توکن/account_id/KV معتبری ندارد — ابتدا استقرار را با توکن فعال انجام دهید', 400)

  if (body.action === 'set') {
    const res = await applySourceSettings(ctx, body.settings ?? {}, body.settings?.addtxt)
    if (!res.ok) return apiError(res.error ?? 'خطا در نوشتن تنظیمات', 502)
    return json({ success: true, message: 'تنظیمات روی سورس واقعی ورکر اعمال شد' })
  }
  return json({ success: true, source: ctx.source, data: await getSourceSettings(ctx) })
}

/** GET /api/source-nodes/:deploymentId — live node check against the real worker */
export async function handleSourceNodes(env: Env, userId: string, deploymentId: string): Promise<Response> {
  const ctx = await resolveSource(env, userId, deploymentId)
  if (!ctx) return apiError('این ورکر اتصال واقعی (توکن/KV) ندارد', 400)
  const { lines, live } = await fetchSourceNodes(ctx)
  return json({
    data: {
      live,
      count: lines.length,
      sample: lines.slice(0, 5).map((l) => l.split('#')[0]),
      sub_url: ctx.uuid && ctx.workerUrl ? `${ctx.workerUrl}/${ctx.uuid}` : null,
    },
  })
}
