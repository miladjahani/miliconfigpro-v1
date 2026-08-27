/* ══════════════════════════════════════════════════════════════════════════════
   ▓ Node Generation & Link Builders
   ▓ KEY FIX: Server address = CF IP, SNI = worker domain
   ══════════════════════════════════════════════════════════════════════════════ */

/* Known Cloudflare edge IPs that work for Worker proxying */
const CF_IPS = [
  '188.164.248.146', '188.164.249.146', '188.164.248.150',
  '188.164.249.150', '188.164.248.154', '188.164.249.154',
  '188.164.248.158', '188.164.249.158', '188.164.250.146',
  '188.164.250.150', '188.164.250.154', '188.164.250.158',
  '104.16.0.0', '104.16.1.0', '104.16.2.0', '104.16.3.0',
  '172.67.0.0', '172.67.1.0', '172.67.2.0', '172.67.3.0',
];

function 節點集(cfg, info, host) {
  const prof = 檔案(info.cc);
  const protos = 協議集(cfg);
  const transports = (Array.isArray(cfg.transports) && cfg.transports.length ? cfg.transports : prof.transports).slice(0, 3);
  const ports = (Array.isArray(cfg.ports) && cfg.ports.length ? cfg.ports : prof.ports).slice(0, 4);
  const sni = cfg.sni || prof.sni || host;
  const fp = cfg.fp || prof.fp || 'chrome';
  const path = 路徑(cfg);
  const flow = cfg.flow || '';
  const uuid = info.key || cfg.uuid || 'none';
  const frag = cfg.fragment === 'yes' || prof.frag;
  const ech = cfg.ech === 'yes';

  /* ── Build address list: CF IPs first, then proxyIP, then worker domain ── */
  const addrs = [];
  /* Use CF IPs as primary server addresses */
  const ipCount = Math.min(CF_IPS.length, 3);
  for (let i = 0; i < ipCount; i++) addrs.push(CF_IPS[i]);
  /* Add proxyIP if set */
  if (cfg.ena === 'yes') for (const x of 拆IP(cfg.p)) addrs.push(x);
  /* Add custom IPs */
  for (const x of 拆IP(cfg.yx)) addrs.push(x);
  /* Worker domain as fallback (last resort) */
  addrs.push(host);

  const seen = new Set();
  const addrsUnique = addrs.filter((h) => { if (!h || seen.has(h)) return false; seen.add(h); return true; }).slice(0, 5);

  const nodes = [];
  const sub = cfg.subname || 'NEXUS';
  for (const addr of addrsUnique) {
    const a = 拆址(addr);
    for (const t of transports) {
      for (const pt of ports) {
        for (const p of protos) {
          if (nodes.length >= 14) break;
          /* Node name shows zone, not IP */
          const nm = `${sub} | ${p.toUpperCase()} | ${t} | ${a.name || info.zone}`;
          let line = '';
          if (p === 'vless') line = 行VLESS(uuid, a.host, pt, sni, fp, t, path, host, frag, flow, cfg);
          else if (p === 'trojan') line = 行TRJ(uuid, a.host, pt, sni, fp, t, path, host, cfg);
          else line = 行SS(uuid, a.host, pt, sni, fp, t, path, host, cfg);
          nodes.push({
            n: nm, line, p, t,
            a: a.host,        /* CF IP — actual server address */
            host: host,        /* Worker domain — for SNI/Host header */
            port: pt, sni, fp, path,
            pwd: uuid, m: 'aes-128-gcm',
            ech: cfg.ech === 'yes',
            frag: cfg.fragment === 'yes',
          });
        }
      }
    }
  }
  return { nodes, prof, frag, sni, transports, ports };
}

/* ─── Link Builders ─── */
/* addr = CF IP (server), host = worker domain (SNI/Host) */
function 行VLESS(uuid, addr, port, sni, fp, t, path, host, frag, flow, cfg) {
  let s = `vless://${uuid}@${addr}:${port}?encryption=none&security=tls&sni=${編(sni)}&fp=${編(fp)}&type=${t}`;
  if (flow) s += `&flow=${編(flow)}`;
  if (t === 'ws') s += `&host=${編(host)}&path=${編(path)}`;
  else if (t === 'grpc') s += `&serviceName=${編(String(path).replace(/^\//, ''))}`;
  else s += `&host=${編(host)}&path=${編(path)}&mode=auto`;
  if (frag) s += '&fragment=off';
  if (cfg && cfg.ech === 'yes') s += '&ech=1';
  return s;
}

function 行TRJ(pwd, addr, port, sni, fp, t, path, host, cfg) {
  let s = `trojan://${pwd}@${addr}:${port}?security=tls&sni=${編(sni)}&fp=${編(fp)}&type=${t}`;
  if (t === 'ws') s += `&host=${編(host)}&path=${編(path)}`;
  else if (t === 'grpc') s += `&serviceName=${編(String(path).replace(/^\//, ''))}`;
  else s += `&host=${編(host)}&path=${編(path)}&mode=auto`;
  if (cfg && cfg.ech === 'yes') s += '&ech=1';
  return s;
}

function 行SS(pwd, addr, port, sni, fp, t, path, host, cfg) {
  const m = 'aes-128-gcm';
  const core = B64(文本(`${m}:${pwd}`));
  let s = `ss://${core}@${addr}:${port}`;
  if (t === 'ws') s += `?plugin=${編(`v2ray-plugin;tls;mode=websocket;host=${host};path=${path}`)}`;
  else if (t === 'grpc') s += `?plugin=${編(`v2ray-plugin;tls;mode=grpc;host=${host};serviceName=${String(path).replace(/^\//, '')}`)}`;
  else s += `?plugin=${編(`v2ray-plugin;tls;mode=xhttp;host=${host};path=${path}`)}`;
  return s;
}
