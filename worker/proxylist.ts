import { json } from './util'

// Server-side mirror of the EDT-Pages per-country proxy lists. The lists are
// fetched from the Worker's own network (real, unfiltered) instead of from the
// user's browser — in filtered regions (e.g. Iran) raw.githubusercontent.com
// and jsDelivr can be unreachable, which previously made the country pickers
// silently empty. Results are cached in-process for 10 minutes.

const PROTOCOLS = ['socks5', 'https', 'http'] as const
type ProxyProtocol = (typeof PROTOCOLS)[number]

const SOURCES: Record<ProxyProtocol, string[]> = {
  socks5: [
    'https://cdn.jsdelivr.net/gh/EDT-Pages/Proxy-List@main/data/socks5.json',
    'https://raw.githubusercontent.com/EDT-Pages/Proxy-List/main/data/socks5.json',
  ],
  https: [
    'https://cdn.jsdelivr.net/gh/EDT-Pages/Proxy-List@main/data/https.json',
    'https://raw.githubusercontent.com/EDT-Pages/Proxy-List/main/data/https.json',
  ],
  http: [
    'https://cdn.jsdelivr.net/gh/EDT-Pages/Proxy-List@main/data/http.json',
    'https://raw.githubusercontent.com/EDT-Pages/Proxy-List/main/data/http.json',
  ],
}

interface EtdRow {
  proxy?: string
  country?: string
}

const CACHE_MS = 10 * 60 * 1000
let cache: { key: ProxyProtocol; at: number; data: EtdRow[] } | null = null

function isEtdRow(v: unknown): v is EtdRow {
  return !!v && typeof v === 'object' && typeof (v as EtdRow).proxy === 'string'
}

export async function handleProxyList(protocolRaw: string | null): Promise<Response> {
  const protocol: ProxyProtocol = (PROTOCOLS as readonly string[]).includes(String(protocolRaw ?? ''))
    ? (protocolRaw as ProxyProtocol)
    : 'socks5'

  if (cache && cache.key === protocol && Date.now() - cache.at < CACHE_MS) {
    return json({ success: true, data: cache.data })
  }

  for (const url of SOURCES[protocol]) {
    try {
      const ctrl = new AbortController()
      const tid = setTimeout(() => ctrl.abort(), 20_000)
      const resp = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0' } })
      clearTimeout(tid)
      if (!resp.ok) continue
      const body = (await resp.json().catch(() => null)) as unknown
      if (!Array.isArray(body) || !body.some(isEtdRow)) continue
      const data = body.filter(isEtdRow)
      cache = { key: protocol, at: Date.now(), data }
      return json({ success: true, data })
    } catch {
      /* try the next mirror */
    }
  }

  // Failed on every mirror — keep the last good copy if we have one.
  if (cache && cache.key === protocol) {
    return json({ success: true, data: cache.data })
  }
  return json({ success: false, data: [], error: 'دریافت لیست پروکسی از منابع ناموفق بود' })
}
