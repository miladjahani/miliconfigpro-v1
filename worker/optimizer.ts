import type { Env } from './env'
import { apiError, genId, json, nowIso, safeJsonParse } from './util'
import { b64encodeUtf8, probeBatch } from './net'
import { fetchMultiSubLines, renderSubscription } from './formats'
import { extractNodes } from './parser'

// ── Config parsing ──────────────────────────────────────────────────────

export interface ParsedNode {
  line: string
  proto: string
  host: string
  port: number
  name: string
}

function hostPortFromUri(uri: string): { host: string; port: number } | null {
  try {
    const withoutName = uri.split('#')[0]
    const afterScheme = withoutName.split('://')[1] ?? ''
    const authority = afterScheme.split('/')[0].split('?')[0]
    // Strip userinfo (uuid@ or method:pass@)
    const hostPart = authority.includes('@') ? authority.split('@').pop()! : authority
    const lastColon = hostPart.lastIndexOf(':')
    if (lastColon === -1) return null
    const host = hostPart.slice(0, lastColon).replace(/^\[|\]$/g, '')
    const port = Number(hostPart.slice(lastColon + 1))
    if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) return null
    return { host, port }
  } catch {
    return null
  }
}

export function parseNodeLine(line: string): ParsedNode | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  const proto = trimmed.split('://')[0]
  if (!['vless', 'vmess', 'trojan', 'ss'].includes(proto)) return null
  let hostPort: { host: string; port: number } | null = null
  let name = ''
  if (proto === 'vmess') {
    try {
      const b64 = trimmed.slice('vmess://'.length)
      const bin = atob(b64)
      const json = JSON.parse(bin) as { add?: string; port?: number | string; ps?: string }
      hostPort = json.add ? { host: String(json.add), port: Number(json.port ?? 443) } : null
      name = json.ps ?? ''
    } catch {
      return null
    }
  } else {
    hostPort = hostPortFromUri(trimmed)
    const hashIndex = trimmed.indexOf('#')
    name = hashIndex > -1 ? decodeURIComponent(trimmed.slice(hashIndex + 1)) : ''
  }
  if (!hostPort) return null
  return { line: trimmed, proto, host: hostPort.host, port: hostPort.port, name: name || `${proto}-${hostPort.host}` }
}

async function collectInputLines(input: string): Promise<string[]> {
  const trimmed = input.trim()
  // One or MANY subscription URLs — all fetched in parallel and merged.
  if (/https?:\/\//i.test(trimmed)) {
    const lines = await fetchMultiSubLines(trimmed)
    if (!lines.length) throw new Error('دریافت لینک ساب ناموفق بود — هیچ نود معتبری در هیچ آدرسی پیدا نشد (همهٔ فرمت‌ها و آدرس‌های جایگزین امتحان شد)')
    return lines
  }
  // Raw pasted content — sing-box JSON, Clash YAML, base64 blob, plain links,
  // HTML pages containing links… the universal parser handles them all.
  const lines = extractNodes(trimmed)
  if (!lines.length) throw new Error('هیچ نود معتبری در محتوای ورودی پیدا نشد (فرمت‌های پشتیبانی‌شده: vless/vmess/trojan/ss/hysteria2/tuic، base64، sing-box JSON، Clash YAML)')
  return lines
}

// ── Job runner ──────────────────────────────────────────────────────────

export interface OptimizedNode {
  name: string
  proto: string
  host: string
  port: number
  latencyMs: number
}

export async function runOptimizerJob(env: Env, jobId: string, input: string): Promise<void> {
  const update = (fields: Record<string, unknown>) => {
    const sets = Object.keys(fields).map((k) => `${k} = ?`)
    const binds = Object.values(fields)
    return env.DB.prepare(`UPDATE optimizer_jobs SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`)
      .bind(...binds, nowIso(), jobId)
      .run()
  }
  try {
    await update({ status: 'running' })
    const lines = await collectInputLines(input)
    const nodes = lines.map(parseNodeLine).filter((n): n is ParsedNode => n !== null)
    if (nodes.length === 0) throw new Error('هیچ کانفیگ معتبری (vless/vmess/trojan/ss) پیدا نشد')
    await update({ nodes_total: nodes.length })

    const probed = await probeBatch(
      nodes.map((n) => ({ host: n.host, port: n.port, node: n })),
      12,
      3000,
    )
    const alive = probed
      .filter((p) => p.latencyMs !== null)
      .sort((a, b) => (a.latencyMs ?? 99999) - (b.latencyMs ?? 99999))

    const resultNodes: OptimizedNode[] = alive.map((p) => ({
      name: p.node.name,
      proto: p.node.proto,
      host: p.node.host,
      port: p.node.port,
      latencyMs: p.latencyMs ?? 0,
    }))

    // Rebuild lines with latency tag, sorted best-first.
    const optimizedLines = alive.map((p) => {
      const tag = `⚡ ${p.latencyMs}ms`
      const baseName = p.node.name.replace(/\s*⚡.*$/, '')
      const newName = `${baseName} ${tag}`
      if (p.node.proto === 'vmess') {
        try {
          const json = JSON.parse(atob(p.node.line.slice('vmess://'.length))) as Record<string, unknown>
          json.ps = newName
          return 'vmess://' + btoa(JSON.stringify(json))
        } catch {
          return p.node.line
        }
      }
      const hashIndex = p.node.line.indexOf('#')
      const withoutName = hashIndex > -1 ? p.node.line.slice(0, hashIndex) : p.node.line
      return `${withoutName}#${encodeURIComponent(newName)}`
    })

    if (optimizedLines.length === 0) {
      await update({ status: 'done', nodes_alive: 0, result_nodes: '[]', result_sub: '' })
      return
    }

    await update({
      status: 'done',
      nodes_alive: optimizedLines.length,
      result_nodes: JSON.stringify(resultNodes),
      result_sub: b64encodeUtf8(optimizedLines.join('\n')),
    })
  } catch (err) {
    await update({ status: 'failed', error_message: err instanceof Error ? err.message : 'خطای نامشخص' }).catch(() => null)
  }
}

// ── HTTP handlers ───────────────────────────────────────────────────────

export async function handleOptimizerCreate(env: Env, userId: string, request: Request, ctx: ExecutionContext): Promise<Response> {
  const body = safeJsonParse<{ name?: string; input?: string }>(await request.text().catch(() => ''), {})
  const name = body.name?.trim() || `بهینه‌سازی ${new Date().toLocaleDateString('fa-IR')}`
  const input = body.input?.trim() ?? ''
  if (!input) return apiError('ورودی خالی است — لینک ساب یا کانفیگ‌ها را وارد کنید')

  const id = genId()
  const subToken = genId().replace(/-/g, '')
  await env.DB.prepare(
    `INSERT INTO optimizer_jobs (id, user_id, name, input, status, sub_token, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)`,
  ).bind(id, userId, name, input.slice(0, 100_000), subToken, nowIso(), nowIso()).run()

  ctx.waitUntil(runOptimizerJob(env, id, input))
  return json({ data: { id, status: 'pending' } }, 201)
}

export async function handleOptimizerList(env: Env, userId: string): Promise<Response> {
  const r = await env.DB.prepare(
    `SELECT id, name, status, nodes_total, nodes_alive, sub_token, error_message, created_at, updated_at
     FROM optimizer_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
  ).bind(userId).all()
  return json({ data: r.results })
}

export async function handleOptimizerGet(env: Env, userId: string, id: string): Promise<Response> {
  const row = await env.DB.prepare('SELECT * FROM optimizer_jobs WHERE id = ? AND user_id = ?').bind(id, userId).first()
  if (!row) return apiError('کار پیدا نشد', 404)
  return json({ data: { ...row, result_nodes: safeJsonParse(row.result_nodes as string, []) } })
}

export async function handleOptimizerDelete(env: Env, userId: string, id: string): Promise<Response> {
  const row = await env.DB.prepare('DELETE FROM optimizer_jobs WHERE id = ? AND user_id = ? RETURNING name').bind(id, userId).first<{ name: string }>()
  if (!row) return apiError('کار پیدا نشد', 404)
  return json({ success: true })
}

/** Public endpoint — GET /api/sub/opt/:token */
export async function serveOptimizerSub(env: Env, token: string, target: string | null): Promise<Response> {
  const row = await env.DB.prepare('SELECT result_sub, status FROM optimizer_jobs WHERE sub_token = ?').bind(token).first<{ result_sub: string; status: string }>()
  if (!row || !row.result_sub) return new Response('یافت نشد یا هنوز آماده نیست', { status: 404 })
  const lines = row.result_sub.split('\n').map((l) => l.trim()).filter(Boolean)
  return renderSubscription(lines, target)
}
