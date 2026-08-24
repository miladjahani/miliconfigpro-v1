import { apiError, json } from './util'
import { expandRanges, probeBatch } from './net'

interface ScanResult {
  ip: string
  latencyMs: number | null
  status: 'ok' | 'timeout' | 'error'
  region?: string
  type: 'cloudflare' | 'clean' | 'proxy'
  source: string
  port?: number
  protocol?: string
  proxy?: string
}

const FALLBACK_CF_IPS = [
  '104.16.0.1', '104.16.0.2', '104.16.0.3', '104.17.0.1', '104.17.0.2',
  '104.18.0.1', '104.18.0.2', '172.64.0.1', '172.64.0.2', '162.159.0.1',
  '162.159.0.2', '1.1.1.1', '1.0.0.1',
]

async function probeIP(ip: string, type: 'cloudflare' | 'clean' | 'proxy', source: string, timeoutMs = 5000): Promise<ScanResult> {
  const controller = new AbortController()
  const tid = setTimeout(() => controller.abort(), timeoutMs)
  const t0 = Date.now()
  try {
    const r = await fetch(`https://${ip}/cdn-cgi/trace`, {
      signal: controller.signal,
      headers: { Host: 'speed.cloudflare.com' },
      redirect: 'manual',
    })
    clearTimeout(tid)
    const text = await r.text().catch(() => '')
    const coloMatch = text.match(/colo=([A-Z]{3})/)
    return { ip, latencyMs: Date.now() - t0, status: 'ok', region: coloMatch ? coloMatch[1] : undefined, type, source }
  } catch {
    clearTimeout(tid)
    return { ip, latencyMs: null, status: controller.signal.aborted ? 'timeout' : 'error', type, source }
  }
}

async function fetchIPDB(type: 'bestcf' | 'bestProxy'): Promise<Array<{ ip: string; region?: string }>> {
  try {
    const r = await fetch(`https://ipdb.api.030101.xyz/?type=${type}`)
    if (!r.ok) return []
    const data: unknown = await r.json().catch(() => null)
    const list = (Array.isArray(data) ? data : ((data as Record<string, unknown>)?.result ?? [])) as Array<Record<string, unknown>>
    return list
      .filter((item) => item?.ip || item?.address)
      .slice(0, 50)
      .map((item) => ({ ip: String(item.ip ?? item.address), region: item.colo ? String(item.colo) : undefined }))
  } catch {
    return []
  }
}

async function fetchGithubList(url: string): Promise<Array<{ ip: string; region?: string }>> {
  try {
    const r = await fetch(url)
    if (!r.ok) return []
    const text = await r.text()
    return text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#') && /^\d+\.\d+\.\d+\.\d+/.test(l))
      .slice(0, 50)
      .map((l) => {
        const [ip, region] = l.split('#')
        return { ip: ip.trim(), region: region?.trim() || undefined }
      })
  } catch {
    return []
  }
}

async function fetchProxyList(protocol: 'https' | 'socks5' | 'http'): Promise<ScanResult[]> {
  try {
    const r = await fetch(`https://raw.githubusercontent.com/EDT-Pages/Proxy-List/main/data/${protocol}.json`)
    if (!r.ok) return []
    const data: unknown = await r.json().catch(() => null)
    if (!Array.isArray(data)) return []
    return (data as Array<Record<string, unknown>>)
      .filter((item) => item?.ip && item?.port)
      .slice(0, 30)
      .map((item) => ({
        ip: String(item.ip),
        latencyMs: null,
        status: 'ok' as const,
        region: item.country ? String(item.country) : undefined,
        type: 'proxy' as const,
        source: 'EDT-Pages/Proxy-List',
        port: Number(item.port),
        protocol: String(item.protocol ?? protocol),
        proxy: String(item.proxy ?? `${protocol}://${item.ip}:${item.port}`),
      }))
  } catch {
    return []
  }
}

/**
 * Real TCP scan over user-provided CIDR ranges and ports using the
 * Workers Sockets API — measures actual handshake latency per IP:port.
 */
export async function handleRangeScan(body: {
  ranges?: string
  ports?: string
  count?: number
  timeout?: number
}): Promise<Response> {
  const ranges = (body.ranges ?? '').split(/[\n,]/).map((r) => r.trim()).filter(Boolean).slice(0, 8)
  if (!ranges.length) return apiError('حداقل یک بازه IP وارد کنید (مثلاً 104.16.0.0/24)')
  const ports = (body.ports ?? '443')
    .split(/[\n,]/)
    .map((p) => Number(p.trim()))
    .filter((p) => Number.isInteger(p) && p > 0 && p < 65536)
    .slice(0, 5)
  if (!ports.length) return apiError('پورت معتبری وارد نشد')

  const ips = expandRanges(ranges, 512)
  if (!ips.length) return apiError('بازه IP معتبر نیست')

  const targets = ips.flatMap((ip) => ports.map((port) => ({ host: ip, port, ip })))
  const probed = await probeBatch(targets, 20, Math.min(Math.max(body.timeout ?? 2500, 500), 5000))

  const ok = probed
    .filter((p) => p.latencyMs !== null)
    .sort((a, b) => (a.latencyMs ?? 99999) - (b.latencyMs ?? 99999))
    .slice(0, Math.min(Math.max(body.count ?? 50, 1), 200))
    .map((p) => ({
      ip: p.ip,
      port: p.port,
      latencyMs: p.latencyMs,
      status: 'ok' as const,
      type: 'cloudflare' as const,
      source: 'tcp-scan',
    }))

  return json({
    success: ok.length > 0,
    scanned: targets.length,
    count: ok.length,
    results: ok,
  })
}

export async function handleIpScanner(body: { type?: string; count?: number; includeProxies?: boolean }): Promise<Response> {
  const type = body.type === 'clean' ? 'clean' : 'cloudflare'
  const safeCount = Math.min(Math.max(5, body.count ?? 30), 50)

  const candidates: Array<{ ip: string; type: 'cloudflare' | 'clean'; source: string; region?: string }> = []

  if (type === 'cloudflare') {
    for (const c of await fetchIPDB('bestcf')) candidates.push({ ...c, type: 'cloudflare', source: 'ipdb.api.030101.xyz' })
    for (const c of await fetchGithubList('https://raw.githubusercontent.com/ymyuuu/IPDB/main/bestcf.txt')) candidates.push({ ...c, type: 'cloudflare', source: 'ymyuuu/IPDB' })
  } else {
    for (const c of await fetchIPDB('bestProxy')) candidates.push({ ...c, type: 'clean', source: 'ipdb.api.030101.xyz' })
    for (const c of await fetchGithubList('https://raw.githubusercontent.com/ymyuuu/IPDB/main/bestproxy.txt')) candidates.push({ ...c, type: 'clean', source: 'ymyuuu/IPDB' })
  }
  if (candidates.length === 0) {
    for (const ip of FALLBACK_CF_IPS) candidates.push({ ip, type: type === 'cloudflare' ? 'cloudflare' : 'clean', source: 'fallback' })
  }

  // Deduplicate by IP
  const seen = new Set<string>()
  const unique = candidates.filter((c) => (seen.has(c.ip) ? false : (seen.add(c.ip), true)))

  if (unique.length === 0) return apiError('هیچ IP از منابع دریافت نشد.', 502)

  // Probe in batches of 8 until we have enough good results.
  const allResults: ScanResult[] = []
  for (let i = 0; i < unique.length && allResults.filter((r) => r.status === 'ok').length < safeCount; i += 8) {
    const batch = unique.slice(i, i + 8)
    allResults.push(...(await Promise.all(batch.map((c) => probeIP(c.ip, c.type, c.source)))))
  }

  const sorted = allResults
    .filter((r) => r.status === 'ok' && r.latencyMs !== null)
    .sort((a, b) => (a.latencyMs ?? 9999) - (b.latencyMs ?? 9999))
    .slice(0, safeCount)

  let proxies: ScanResult[] = []
  if (body.includeProxies) {
    const [httpsProxies, socks5Proxies, httpProxies] = await Promise.all([
      fetchProxyList('https'),
      fetchProxyList('socks5'),
      fetchProxyList('http'),
    ])
    proxies = [...httpsProxies, ...socks5Proxies, ...httpProxies]
  }

  if (sorted.length === 0) {
    return json({ success: false, error: 'هیچ IP پاسخ‌دهی پیدا نشد. بعداً دوباره تلاش کنید.' }, 200)
  }

  return json({ success: true, count: sorted.length, results: sorted, proxies: proxies.length > 0 ? proxies.slice(0, 50) : undefined })
}
