import { apiError, json } from './util'
import { expandRanges, probeBatch, tcpProbe } from './net'
import { coloProbe, measureSpeed, runWithConcurrency } from './probe'
import { connect } from 'cloudflare:sockets'

interface ScanResult {
  ip: string
  latencyMs: number | null
  tcpLatencyMs?: number | null
  httpLatencyMs?: number | null
  speedMbps?: number
  status: 'ok' | 'timeout' | 'error'
  region?: string
  type: 'cloudflare' | 'clean' | 'proxy'
  source: string
  port?: number
  protocol?: string
  proxy?: string
  username?: string
  password?: string
  verified?: boolean
  verification?: string
}

const FALLBACK_CF_IPS = [
  '104.16.0.1', '104.16.0.2', '104.16.0.3', '104.17.0.1', '104.17.0.2',
  '104.18.0.1', '104.18.0.2', '172.64.0.1', '172.64.0.2', '162.159.0.1',
  '162.159.0.2', '1.1.1.1', '1.0.0.1',
]

async function probeIP(ip: string, type: 'cloudflare' | 'clean' | 'proxy', source: string, timeoutMs = 3500): Promise<ScanResult> {
  const controller = new AbortController()
  const tid = setTimeout(() => controller.abort(), timeoutMs)
  try {
    // This is a server-side TCP handshake, so it works identically for mobile,
    // desktop and Windows browsers; the browser never attempts ICMP/CORS.
    const tcp = await tcpProbe(ip, 443, timeoutMs)
    if (tcp === null) {
      return { ip, latencyMs: null, tcpLatencyMs: null, status: controller.signal.aborted ? 'timeout' : 'error', type, source, verified: false, verification: 'TCP unreachable' }
    }

    if (type === 'cloudflare') {
      // Resolve the TLS request to the candidate IP while keeping valid SNI.
      // A successful trace is stronger than an open port: it confirms a real
      // Cloudflare edge response and gives us the actual colo.
      const colo = await coloProbe(ip, timeoutMs)
      return {
        ip,
        latencyMs: tcp,
        tcpLatencyMs: tcp,
        httpLatencyMs: colo.latency,
        status: 'ok',
        region: colo.colo ?? undefined,
        type,
        source,
        verified: colo.status === 'ok',
        verification: colo.status === 'ok' ? 'TCP + Cloudflare HTTPS verified' : 'TCP reachable; HTTPS not verified',
      }
    }

    return {
      ip,
      latencyMs: tcp,
      tcpLatencyMs: tcp,
      status: 'ok',
      type,
      source,
      verified: true,
      verification: 'TCP reachable',
    }
  } finally {
    clearTimeout(tid)
  }
}

async function fetchIPDB(type: 'bestcf' | 'bestProxy'): Promise<Array<{ ip: string; region?: string }>> {
  try {
    const ctrl = new AbortController()
    const tid = setTimeout(() => ctrl.abort(), 10000)
    const r = await fetch(`https://ipdb.api.030101.xyz/?type=${type}`, { signal: ctrl.signal })
    clearTimeout(tid)
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
    const ctrl = new AbortController()
    const tid = setTimeout(() => ctrl.abort(), 10000)
    const r = await fetch(url, { signal: ctrl.signal })
    clearTimeout(tid)
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
    const ctrl = new AbortController()
    const tid = setTimeout(() => ctrl.abort(), 12000)
    const r = await fetch(`https://raw.githubusercontent.com/EDT-Pages/Proxy-List/main/data/${protocol}.json`, { signal: ctrl.signal })
    clearTimeout(tid)
    if (!r.ok) return []
    const data: unknown = await r.json().catch(() => null)
    if (!Array.isArray(data)) return []
    return (data as Array<Record<string, unknown>>)
      .filter((item) => item?.ip && item?.port)
      .slice(0, 20)
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

interface ProxyProbe {
  latencyMs: number | null
  status: 'ok' | 'error'
  verification: string
}

async function probeProxy(proxy: ScanResult, timeoutMs = 3000): Promise<ProxyProbe> {
  if (!proxy.port || !proxy.protocol) return { latencyMs: null, status: 'error', verification: 'پروتکل یا پورت نامعتبر' }
  const started = Date.now()
  let socket: ReturnType<typeof connect> | null = null
  try {
    const protocol = proxy.protocol.toLowerCase()
    socket = connect(`${proxy.ip}:${proxy.port}`, {
      secureTransport: protocol === 'https' ? 'on' : 'off',
      allowUntrustedTls: true,
    })
    const opened = await Promise.race([
      socket.opened.then(() => true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
    ])
    if (!opened) return { latencyMs: null, status: 'error', verification: 'اتصال TCP timeout' }

    const reader = socket.readable.getReader()
    const writer = socket.writable.getWriter()
    try {
      if (protocol === 'socks5') {
        await writer.write(new Uint8Array([5, 1, 0]))
        const first = await Promise.race([
          reader.read().then((r) => r.value ?? null),
          new Promise<Uint8Array | null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
        ])
        if (!first || first[0] !== 5 || (first[1] !== 0 && first[1] !== 2)) {
          return { latencyMs: null, status: 'error', verification: 'پاسخ SOCKS5 نامعتبر' }
        }
        return { latencyMs: Date.now() - started, status: 'ok', verification: first[1] === 0 ? 'SOCKS5 handshake verified' : 'SOCKS5 reachable; auth required' }
      }

      const auth = proxy.username
        ? `Proxy-Authorization: Basic ${btoa(`${proxy.username}:${proxy.password ?? ''}`)}\r\n`
        : ''
      await writer.write(new TextEncoder().encode(`CONNECT cloudflare.com:443 HTTP/1.1\r\nHost: cloudflare.com:443\r\n${auth}Connection: close\r\n\r\n`))
      const first = await Promise.race([
        reader.read().then((r) => r.value ?? null),
        new Promise<Uint8Array | null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
      ])
      const text = first ? new TextDecoder().decode(first) : ''
      if (!/^HTTP\/\d(?:\.\d)?\s+\d{3}/i.test(text)) {
        return { latencyMs: null, status: 'error', verification: 'پاسخ HTTP proxy نامعتبر' }
      }
      const statusCode = Number(text.match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/i)?.[1] ?? 0)
      if (statusCode < 200 || statusCode >= 300) {
        return { latencyMs: null, status: 'error', verification: `HTTP proxy پاسخ ${statusCode}` }
      }
      return { latencyMs: Date.now() - started, status: 'ok', verification: 'HTTP CONNECT handshake verified' }
    } finally {
      reader.releaseLock()
      writer.releaseLock()
    }
  } catch {
    return { latencyMs: null, status: 'error', verification: 'proxy handshake failed' }
  } finally {
    try { socket?.close() } catch { /* already closed */ }
  }
}

async function verifyProxyList(items: ScanResult[]): Promise<ScanResult[]> {
  const checked = await runWithConcurrency(items, 10, async (proxy) => {
    const result = await probeProxy(proxy)
    return { ...proxy, latencyMs: result.latencyMs, status: result.status === 'ok' ? 'ok' as const : 'error' as const, verified: result.status === 'ok', verification: result.verification }
  })
  return checked.filter((proxy) => proxy.status === 'ok').sort((a, b) => (a.latencyMs ?? 99999) - (b.latencyMs ?? 99999)).slice(0, 50)
}

/** Official Cloudflare ranges (always available) — expands CIDRs into a
 * spread sample so we probe different /16s instead of neighbours. */
async function fetchOfficialRanges(sample = 16): Promise<Array<{ ip: string; region?: string }>> {
  try {
    const r = await fetch('https://www.cloudflare.com/ips-v4')
    if (!r.ok) return []
    const ranges = (await r.text()).split('\n').map((l) => l.trim()).filter(Boolean)
    const ips = expandRanges(ranges, 4000)
    if (!ips.length) return []
    const step = Math.max(1, Math.floor(ips.length / sample))
    return Array.from({ length: sample }, (_, i) => ({ ip: ips[Math.min(i * step, ips.length - 1)] }))
  } catch {
    return []
  }
}

/** Plain `ip` or `ip:port` proxy lists (e.g. TheSpeedX/PROXY-List). */
async function fetchHostPortList(url: string, defaultPort: number, cap = 40): Promise<Array<{ ip: string; port?: number; region?: string }>> {
  try {
    const r = await fetch(url)
    if (!r.ok) return []
    return (await r.text())
      .split(/\s+/)
      .map((l) => l.trim())
      .filter((l) => /^\d+\.\d+\.\d+\.\d+:\d+$/.test(l))
      .filter((l, i, arr) => arr.indexOf(l) === i)
      .slice(0, cap)
      .map((l) => {
        const [ip, port] = l.split(':')
        return { ip, port: Number(port) || defaultPort }
      })
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
  speedtest?: boolean
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

  const ok: ScanResult[] = probed
    .filter((p) => p.latencyMs !== null)
    .sort((a, b) => (a.latencyMs ?? 99999) - (b.latencyMs ?? 99999))
    .slice(0, Math.min(Math.max(body.count ?? 50, 1), 200))
    .map((p) => ({
      ip: p.ip,
      port: p.port,
      latencyMs: p.latencyMs,
      tcpLatencyMs: p.latencyMs,
      status: 'ok' as const,
      type: 'cloudflare' as const,
      source: 'tcp-scan',
      verified: true,
      verification: 'TCP reachable',
    }))

  if (body.speedtest && ok.length > 0) {
    const speedTargets = ok.slice(0, 10)
    const speeds = await runWithConcurrency(speedTargets, 3, (item) => measureSpeed(item.ip, 1_000_000, 8000))
    speeds.forEach((speed, index) => {
      speedTargets[index]!.speedMbps = speed.mbps
    })
  }

  return json({
    success: ok.length > 0,
    scanned: targets.length,
    count: ok.length,
    results: ok,
  })
}

export async function handleIpScanner(body: { type?: string; count?: number; includeProxies?: boolean; speedtest?: boolean }): Promise<Response> {
  const type = body.type === 'clean' ? 'clean' : 'cloudflare'
  const safeCount = Math.min(Math.max(5, body.count ?? 30), 50)

  const candidates: Array<{ ip: string; type: 'cloudflare' | 'clean'; source: string; region?: string }> = []

  // Fetch all IP sources in parallel (much faster on mobile)
  const srcPromises = type === 'cloudflare' ? [
    fetchIPDB('bestcf').then((r) => r.map((c) => ({ ...c, type: 'cloudflare' as const, source: 'ipdb.api.030101.xyz' }))),
    fetchGithubList('https://raw.githubusercontent.com/ymyuuu/IPDB/main/bestcf.txt').then((r) => r.map((c) => ({ ...c, type: 'cloudflare' as const, source: 'ymyuuu/IPDB' }))),
    fetchGithubList('https://raw.githubusercontent.com/ZhiXuanWang/cf-speedtest/main/ip.txt').then((r) => r.map((c) => ({ ...c, type: 'cloudflare' as const, source: 'ZhiXuanWang/cf-speedtest' }))),
    fetchOfficialRanges().then((r) => r.map((c) => ({ ...c, type: 'cloudflare' as const, source: 'cloudflare.com/ips-v4' }))),
  ] : [
    fetchIPDB('bestProxy').then((r) => r.map((c) => ({ ...c, type: 'clean' as const, source: 'ipdb.api.030101.xyz' }))),
    fetchGithubList('https://raw.githubusercontent.com/ymyuuu/IPDB/main/bestproxy.txt').then((r) => r.map((c) => ({ ...c, type: 'clean' as const, source: 'ymyuuu/IPDB' }))),
  ]
  const srcResults = await Promise.allSettled(srcPromises)
  for (const r of srcResults) {
    if (r.status === 'fulfilled') candidates.push(...r.value)
  }
  if (candidates.length === 0 && body.type !== 'clean') {
    for (const c of await fetchGithubList('https://raw.githubusercontent.com/ZhiXuanWang/cf-speedtest/main/ip.txt')) candidates.push({ ...c, type: 'cloudflare', source: 'cf-speedtest/fallback' })
    for (const c of await fetchOfficialRanges(10)) candidates.push({ ...c, type: 'cloudflare', source: 'cloudflare.com/ips-v4' })
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

  const sorted: ScanResult[] = allResults
    .filter((r) => r.status === 'ok' && r.latencyMs !== null && (type !== 'cloudflare' || r.verified === true))
    .sort((a, b) => (a.latencyMs ?? 9999) - (b.latencyMs ?? 9999))
    .slice(0, safeCount)

  if (body.speedtest && sorted.length > 0) {
    const speedTargets = sorted.slice(0, 10)
    const speeds = await runWithConcurrency(speedTargets, 3, (item) => measureSpeed(item.ip, 1_000_000, 8000))
    speeds.forEach((speed, index) => {
      speedTargets[index]!.speedMbps = speed.mbps
    })
  }

  let proxies: ScanResult[] = []
  if (body.includeProxies) {
    const [httpsProxies, socks5Proxies, httpProxies, speedxHttp, speedxSocks] = await Promise.all([
      fetchProxyList('https'),
      fetchProxyList('socks5'),
      fetchProxyList('http'),
      fetchHostPortList('https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt', 8080),
      fetchHostPortList('https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt', 1080),
    ])
    const mapToResult = (list: Array<{ ip: string; port?: number }>, protocol: string, source: string): ScanResult[] =>
      list.map((p) => ({
        ip: p.ip,
        latencyMs: null,
        status: 'error' as const,
        type: 'proxy' as const,
        source,
        port: p.port,
        protocol,
        proxy: `${protocol}://${p.ip}:${p.port}`,
        verified: false,
        verification: 'در انتظار بررسی پروتکل',
      }))
    proxies = await verifyProxyList([
      ...httpsProxies,
      ...socks5Proxies,
      ...httpProxies,
      ...mapToResult(speedxHttp, 'http', 'TheSpeedX/PROXY-List'),
      ...mapToResult(speedxSocks, 'socks5', 'TheSpeedX/PROXY-List'),
    ])
  }

  if (sorted.length === 0) {
    return json({ success: false, error: 'هیچ IP پاسخ‌دهی پیدا نشد. بعداً دوباره تلاش کنید.' }, 200)
  }

  return json({ success: true, count: sorted.length, results: sorted, proxies: proxies.length > 0 ? proxies.slice(0, 50) : undefined })
}
