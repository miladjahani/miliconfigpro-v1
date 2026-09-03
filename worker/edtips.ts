// Live per-country preferred IPs from the EDT ecosystem.
// `ipdb.api.030101.xyz` is the same source the edgetunnel / EDT-Pages
// community uses for "country selection with REAL tested IPs":
//   • type=bestcf    → best Cloudflare edge IPs for the country (entry/fixed IP)
//   • type=bestproxy → best proxy-exit IPs for the country (fixed egress)
// Responses are plain-text lines of `ip` or `ip:port`, sometimes `ip#label`.

export type IpSource = 'bestcf' | 'bestproxy'

interface CacheEntry { ips: string[]; ts: number }

const cache = new Map<string, CacheEntry>()
const TTL_MS = 5 * 60_000

const IP_RE = /^(\d{1,3}(?:\.\d{1,3}){3})(?::(\d{2,5}))?(?:#.*)?$/

function parseList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .map((l) => {
      const m = l.match(IP_RE)
      if (!m) return ''
      const octets = m[1].split('.').map(Number)
      if (octets.some((o) => o > 255)) return ''
      return m[2] ? `${m[1]}:${m[2]}` : m[1]
    })
    .filter(Boolean)
}

/** Fetch live preferred IPs for one country code ('us', 'de', ...). */
async function fetchOne(country: string, type: IpSource, timeoutMs = 5000): Promise<string[]> {
  const key = `${type}:${country.toUpperCase()}`
  const cached = cache.get(key)
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.ips

  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const resp = await fetch(`https://ipdb.api.030101.xyz/?type=${type}&country=${country.toUpperCase()}`, {
      signal: ctrl.signal,
    })
    if (!resp.ok) return []
    const ips = parseList(await resp.text()).slice(0, 240)
    if (ips.length) cache.set(key, { ips, ts: Date.now() })
    return ips
  } catch {
    return []
  } finally {
    clearTimeout(t)
  }
}

/** Fetch real preferred IPs grouped by country — best-CF first, proxy fallback.
 *  The grouping is important: flattening this result would allow a US IP to be
 *  labelled as Germany or attached to the wrong location. */
export async function fetchCountryIpsByCountry(codes: string[], per = 20): Promise<Record<string, string[]>> {
  const active = [...new Set(codes.filter((c) => /^[a-z]{2}$/i.test(c)).map((c) => c.toLowerCase()))].slice(0, 8)
  const entries = await Promise.all(active.map(async (code) => {
    const best = await fetchOne(code, 'bestcf')
    const ips = best.length ? best : await fetchOne(code, 'bestproxy')
    return [code, [...new Set(ips.map((ip) => ip.split('#')[0]))].slice(0, Math.max(1, Math.min(240, per)))] as const
  }))
  return Object.fromEntries(entries)
}

/** Fetch real IPs for several country codes — best-CF first, proxy fallback.
 *  Returns up to `per` entries per country, deduplicated. */
export async function fetchCountryIps(codes: string[], per = 4): Promise<string[]> {
  const byCountry = await fetchCountryIpsByCountry(codes, per)
  return Object.values(byCountry).flat().slice(0, 20)
}
