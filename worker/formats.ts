// Output-format converters for merged subscription content.
// • buildSingboxJson()      — share links → sing-box config
// • renderSubscription()    — one renderer for every sub type (group/inject/member)
// • configJsonToLines()     — sing-box JSON configs parsed as node sources
// Clash Meta already has buildClashYaml.

import { b64encodeUtf8, tryDecodeSub } from './net'
import { buildClashYaml, linesToResult } from './inject'

/** Fetch node lines from ANY subscription URL, tolerating every real-world
 * shape: base64 blobs, plain link lists, sing-box JSON, error pages with
 * partial content, and wrong paths. If the exact URL fails (404 etc.) we
 * retry smart fallback variants — e.g. a pasted `worker/uuid/sub?target=x`
 * still resolves to the working `worker/uuid` direct subscription. */
export async function fetchSubLines(url: string, timeoutMs = 8000): Promise<string[]> {
  const toLines = (text: string): string[] => {
    const fromConfig = configJsonToLines(text.trim())
    if (fromConfig.length) return fromConfig
    return tryDecodeSub(text).split('\n').map((l) => l.trim()).filter(Boolean)
  }

  const u = url.trim()
  const variants: string[] = [u]
  try {
    const parsed = new URL(u)
    // 2) without query string
    if (parsed.search) variants.push(parsed.origin + parsed.pathname)
    // 3) without a trailing `/sub` segment (common wrong mix of direct-sub + panel path)
    if (/\/sub\/?$/i.test(parsed.pathname)) {
      const stripped = parsed.origin + parsed.pathname.replace(/\/sub\/?$/i, '')
      variants.push(stripped)
      if (parsed.search) variants.push(stripped + parsed.search)
    }
    // 4) origin + first path segment only (edgetunnel direct sub = /UUID)
    const seg = '/' + parsed.pathname.split('/').filter(Boolean)[0]
    if (seg !== '/' && seg !== parsed.pathname) variants.push(parsed.origin + seg)
  } catch { /* not a URL — caller handles raw content */ }

  for (const candidate of [...new Set(variants)]) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), timeoutMs)
      let text = ''
      let ok = false
      try {
        const resp = await fetch(candidate, { redirect: 'follow', signal: ctrl.signal })
        ok = resp.ok
        // Even non-200 bodies sometimes contain usable node lines — read them.
        text = await resp.text()
      } finally {
        clearTimeout(t)
      }
      const lines = toLines(text).filter((l) => /^(vless|vmess|trojan|ss|hysteria2?|tuic):\/\//i.test(l))
      if (lines.length) return lines
      if (!ok) continue // 404/5xx with no usable content → next variant
    } catch { /* network error → next variant */ }
  }
  return []
}

/** Serialize node lines in the requested output format.
 * format: base64 (default) | plain | clash | singbox */
export function renderSubscription(lines: string[], format: string | null | undefined): Response {
  const headers = { 'Content-Type': 'text/plain; charset=utf-8', 'profile-update-interval': '1' }
  const fmt = ['plain', 'clash', 'singbox'].includes(String(format)) ? String(format) : 'base64'
  if (fmt === 'clash') {
    return new Response(buildClashYaml(linesToResult(lines)), {
      headers: { 'Content-Type': 'text/yaml; charset=utf-8', 'profile-update-interval': '1' },
    })
  }
  if (fmt === 'singbox') return new Response(buildSingboxJson(lines), { headers })
  if (fmt === 'plain') return new Response(lines.join('\n'), { headers })
  return new Response(b64encodeUtf8(lines.join('\n')), { headers })
}

/** Detect a sing-box style JSON config and convert its outbounds back into
 * standard share links so any JSON source can feed a subscription. */
export function configJsonToLines(text: string): string[] {
  try {
    const cfg = JSON.parse(text) as { outbounds?: Array<Record<string, unknown>> }
    if (!Array.isArray(cfg.outbounds)) return []
    return cfg.outbounds.map(outboundToLine).filter((l): l is string => !!l)
  } catch {
    return []
  }
}

function outboundToLine(o: Record<string, unknown>): string | null {
  try {
    const type = String(o.type ?? '')
    const server = String(o.server ?? '')
    const port = Number(o.server_port ?? 0)
    const tag = String(o.tag ?? `${type}-${server}`)
    if (!server || !port) return null

    const transport = o.transport as Record<string, unknown> | undefined
    const network = transport ? String(transport.type ?? 'tcp') : 'tcp'
    const path = transport ? String(transport.path ?? '') : ''
    const wsHost = transport && typeof transport.headers === 'object' && transport.headers !== null
      ? String((transport.headers as Record<string, unknown>).Host ?? '') : ''
    const tls = o.tls as Record<string, unknown> | undefined
    const security = type === 'trojan' ? 'tls' : tls?.enabled ? (tls.reality && (tls.reality as Record<string, unknown>).enabled ? 'reality' : 'tls') : 'none'
    const sni = tls ? String(tls.server_name ?? '') : ''
    const fp = tls && typeof tls.utls === 'object' ? String((tls.utls as Record<string, unknown>).fingerprint ?? '') : ''

    const q = new URLSearchParams()
    if (security !== 'none') {
      q.set('security', security)
      if (sni) q.set('sni', sni)
      if (fp) q.set('fp', fp)
      if (security === 'reality') {
        const r = (tls!.reality ?? {}) as Record<string, unknown>
        if (r.public_key) q.set('pbk', String(r.public_key))
        if (r.short_id) q.set('sid', String(r.short_id))
      }
    }
    if (network === 'ws' || network === 'grpc') {
      q.set('type', network)
      if (path) q.set('path', path)
      if (wsHost) q.set('host', wsHost)
    }
    const qs = q.toString()

    if (type === 'vless') {
      const flow = o.flow ? `&flow=${encodeURIComponent(String(o.flow))}` : ''
      return `vless://${o.uuid}@${server}:${port}?encryption=none${qs ? '&' + qs : ''}${flow}#${encodeURIComponent(tag)}`
    }
    if (type === 'vmess') {
      const json = { v: '2', ps: tag, add: server, port, id: o.uuid, aid: o.alter_id ?? 0, scy: o.security ?? 'auto', net: network === 'grpc' ? 'grpc' : network === 'ws' ? 'ws' : 'tcp', host: wsHost, path, tls: security === 'tls' || security === 'reality' ? 'tls' : '', sni }
      return `vmess://${btoa(JSON.stringify(json))}`
    }
    if (type === 'trojan') {
      return `trojan://${encodeURIComponent(String(o.password ?? ''))}@${server}:${port}?${qs}#${encodeURIComponent(tag)}`
    }
    if (type === 'shadowsocks') {
      return `ss://${btoa(`${o.method}:${o.password}`)}@${server}:${port}#${encodeURIComponent(tag)}`
    }
    return null
  } catch {
    return null
  }
}

export function buildSingboxJson(lines: string[]): string {
  const outbounds = lines
    .map(parseNodeLine)
    .filter((o): o is Record<string, unknown> => !!o)
  const config = {
    log: { level: 'info', timestamp: true },
    dns: {
      servers: ['https://1.1.1.1/dns-query', '8.8.8.8'],
      rules: [{ outbound: 'any', server: 'https://1.1.1.1/dns-query' }],
    },
    inbounds: [
      { type: 'tun', tag: 'tun-in', address: ['172.19.0.1/30'], auto_route: true, stack: 'mixed' },
    ],
    outbounds,
    route: {
      rules: [{ protocol: 'dns', outbound: 'dns-out' }],
      final: 'proxy',
      auto_detect_interface: true,
    },
  }
  return JSON.stringify(config, null, 2)
}

function b64decode(s: string): string | null {
  try { return atob(s.replace(/-/g, '+').replace(/_/g, '/')) } catch { return null }
}

/** Convert one share link into a sing-box outbound object (or null). */
function parseNodeLine(line: string): Record<string, unknown> | null {
  try {
    const trimmed = line.trim()
    const scheme = trimmed.split('://')[0]
    const hashIdx = trimmed.indexOf('#')
    const name = hashIdx > -1 ? decodeURIComponent(trimmed.slice(hashIdx + 1)) : 'node'
    const body = (hashIdx > -1 ? trimmed.slice(0, hashIdx) : trimmed)

    if (scheme === 'vmess') {
      const json = JSON.parse(b64decode(body.slice('vmess://'.length)) ?? '')
      if (!json.add || !json.id) return null
      const outbound: Record<string, unknown> = {
        type: 'vmess', tag: String(json.ps || name), server: String(json.add),
        server_port: Number(json.port || 443), uuid: String(json.id),
        alter_id: Number(json.aid || 0), security: String(json.scy || 'auto'),
      }
      addTlsTransport(outbound, json.tls === 'tls', String(json.sni || ''), json.net ? String(json.net) : '', json.path ? String(json.path) : '', json.host ? String(json.host) : '')
      return outbound
    }

    if (scheme === 'ss') {
      // Both forms: ss://b64(method:pass)@host:port and fully-encoded
      let method = '', password = '', hostPort = ''
      const at = body.lastIndexOf('@')
      if (at > -1) {
        const cred = body.slice('ss://'.length, at)
        const decoded = b64decode(cred) ?? decodeURIComponent(cred)
        const sep = decoded.indexOf(':')
        method = decoded.slice(0, sep)
        password = decoded.slice(sep + 1)
        hostPort = body.slice(at + 1).split('?')[0]
      } else {
        const decoded = b64decode(body.slice('ss://'.length)) ?? ''
        const m = decoded.match(/^(.+?):(.+)@(.+)$/)
        if (!m) return null
        ;[, method, password, hostPort] = m
      }
      const [host, portStr] = hostPort.split(':')
      if (!host || !Number(portStr)) return null
      return { type: 'shadowsocks', tag: name, server: host, server_port: Number(portStr), method, password }
    }

    // URI-style schemes sharing ?query params
    const qIdx = body.indexOf('?')
    const authority = (qIdx > -1 ? body.slice(0, qIdx) : body).split('://')[1] ?? ''
    const query = new URLSearchParams(qIdx > -1 ? body.slice(qIdx + 1) : '')
    const at = authority.lastIndexOf('@')
    if (at < 0) return null
    const credential = authority.slice(0, at)
    const [host, portStr] = authority.slice(at + 1).split(':')
    const port = Number(portStr)
    if (!host || !port) return null

    if (scheme === 'vless') {
      const outbound: Record<string, unknown> = {
        type: 'vless', tag: name, server: host, server_port: port, uuid: credential,
        flow: query.get('flow') || '',
      }
      const security = query.get('security') ?? ''
      const sni = query.get('sni') ?? ''
      if (security === 'reality') {
        outbound.tls = {
          enabled: true, server_name: sni,
          utls: { enabled: true, fingerprint: query.get('fp') || 'chrome' },
          reality: { enabled: true, public_key: query.get('pbk') ?? '', short_id: query.get('sid') ?? '' },
        }
      } else {
        addTlsTransport(outbound, security === 'tls' || port === 443, sni, query.get('type') ?? '', query.get('path') ?? '', query.get('host') ?? '')
      }
      return outbound
    }

    if (scheme === 'trojan') {
      const outbound: Record<string, unknown> = {
        type: 'trojan', tag: name, server: host, server_port: port, password: decodeURIComponent(credential),
      }
      addTlsTransport(outbound, true, query.get('sni') ?? '', query.get('type') ?? '', query.get('path') ?? '', query.get('host') ?? '')
      return outbound
    }

    return null
  } catch {
    return null
  }
}

function addTlsTransport(outbound: Record<string, unknown>, tls: boolean, sni: string, network: string, path: string, hostHeader: string): void {
  if (tls || sni) {
    outbound.tls = {
      enabled: true,
      ...(sni ? { server_name: sni } : {}),
      ...(outbound.type !== 'trojan' ? { insecure: false } : {}),
    }
  }
  if (network === 'ws') {
    outbound.transport = { type: 'ws', ...(path ? { path } : {}), ...(hostHeader ? { headers: { Host: hostHeader } } : {}) }
  } else if (network === 'grpc') {
    outbound.transport = { type: 'grpc', service_name: path || '' }
  }
}
