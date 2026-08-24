// Output-format converters for merged subscription content.
// Currently: sing-box JSON outbounds built from standard share links
// (vless / vmess / trojan / ss). Clash Meta already has buildClashYaml.

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
