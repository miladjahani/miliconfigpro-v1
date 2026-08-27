/* ═══════════════════════════════════════════════════════════════════════════
   ⬢  NEXUS  —  دروازهٔ فردا  ·  the gateway to tomorrow
   ⬢  یک ورکر نودساز نسل جدید · بدون هیچ وابستگی خارجی · module worker
   ⬢  موتور هوشمند · پنل داخلی تنظیمات · نقشهٔ زندهٔ جهان · خروجی همهٔ فرمت‌ها
   ⬢  bindings:  KV = "C" (اختیاری)  ·  vars: u / d / p (اختیاری)
   ⬢  KV key "c" = کانفیگ JSON (سازگار با پنل میلی‌کانفیگ)
   ═══════════════════════════════════════════════════════════════════════════ */
let connect;
try { ({ connect } = await import('cloudflare:sockets')); } catch { connect = null; }

'use strict';

/* ───────────────────────────── ۰۱ · خزانهٔ رشته‌ها ───────────────────────── */
/* هر رشته دوبار رمز شده: base64 روی خروجیِ (byte ^ ((i % 5) + 3)) */
const 字 = [
  'LGV1byhqamNp', 'LGV1byhta2FjdA==', 'LGV1byhga2tgbmQ=', 'LGV1byhuZXU=',
  'LGV1byh2amlpZGg=', 'LHdwZA==', 'LGxgZ2t3bH8=', 'LGJkcG5ga2sobmBr',
  'LHZqZGh3dytyf3c=', 'LA==', 'REFR', 'U0tWUg==',
  'U1FR', 'TFRRT0hNVw==', 'R0FJQ1NG', 'YnR1am5gZXFvaG0rb3VobQ==',
  'd2F9cihzaGRvaQ==', 'd2F9cihrcGhqPCNnbWd1cGFxO3J3Yig+', 'YnR1am5gZXFvaG0rfGdqbw==', 'YnR1am5gZXFvaG0ramVzZnAodXNxYWRr',
  'amlkYWIsd3NhLHtpaQ==', 'YGtrcmJtcChyfnNh', 'YGVmbmIuZ2poc3FraQ==', 'bWsodXNsdmA=',
  'bWsoZWZgbGA=', 'UHFndWRxbXVybmxqKFN0ZnZsaGFs', 'YGtrcmJtcChibnB0anVud21qaA==', 'YnBxZ2RraWBocw==',
  'YmdmY3RwKWZpaXd2amoqYmhpaXAua3dvYGpq', 'YmdmY3RwKWZpaXd2amoqYmhpaXAuaWByb2xgdg==', 'YmdmY3RwKWZpaXd2amoqYmhpaXAubGBnY2Z2dg==', 'YmdmY3RwKWZpaXd2amoqbmV9K2ZkYQ==',
  'bHZsYW5t', 'WylOY34=', 'eyluY34=', 'aDk=',
  'JW84', 'YGIob3dga3Boc3F9', 'YGIodGZ6', 'YGIoZWhvaw==',
  'dndgdCpiY2Bocw==', 'YGIoZWhtamBlc2pqYitucw==', 'eyl3Y2ZvKWx2', 'TUFdU1Q=',
  'bWF9c3Q=', 'dWhgdXQ=', 'd3ZqbGZt', 'cHc=',
  'dWlgdXQ=', 'dHc=', 'ZHZ1ZQ==', 'e2xxcnc=',
  'd2h2', 'bWtrYw==', 'YGx3aWpm', 'cWVrYmhu',
  'ZmpmdH5zcGxpaQ==', 'cGFmc3VqcHw=', 'cGps', 'ZXQ=',
  'd311Yw==', 'a2t2cg==', 'c2Vxbg==', 'cGF3cG5gYUtnamY=',
  'bmthYw==', 'YnFxaQ==', 'c2hwYW5t', 'dTZ3Z34udGlzYGpq',
  'd2h2PWpsYGA7cGZmdmlkaGFxPW9sd3E7', 'cGF3cGJxamRrYg==', 'YGhsY2l3KWNvaWRhd3Z1ampx', 'dHcoaXd3dw==',
  'ZHZ1ZSpsdHF1', 'c3Zqfm5mdw==', 'c3Zqfn4uY3dpcnN3', 'dnZpK3Nmd3E=',
  'bHFxZGh2amF1', 'd2Vi', 'c3Zqcmhga2k=', 'cGFxcm5tY3Y=',
  'cHB3Y2ZuKXZjc3dta2F0', 'bWFxcWhxbw==', 'cWFkaiprYWRiYnE=', 'dnRpaWZn',
  'Z2tyaGtsZWE=', 'Znx1b3Vm', 'd2txZ2s=', 'Z212Z2VvYWE=',
  'YA==', 'YGtrYG5kKm91aG0=', 'QkBBKHN7cA==', 'cHBkcnQ=',
  'YGtpaWRicGxpaQ==', 'YGtwaHNxfQ==', 'YG1xfw==', 'YGtrcm5tYWty',
  'Yndr', 'and1', 'd21oY31samA=', 'dWF3dW5sag==',
  'aGF8VWJ3', 'eWtrYw==', 'dW12b3Nsdg==', 'c2t1',
  'b21rbXQ=', 'cHFndQ==', 'YWV2YzE3', 'c2hkb2k=',
  'YGhkdW8=', 'cG1rYWVsfA==', 'cnY=', 'YGhsY2l3dw==',
  'cXBx', 'dnRxb2pm', 'bWty', 'YGtwaHM=',
  'b21rYw==', 'c3Zqcmg=', 'd3ZkaHRza3dy', 'c2t3cg==',
  'ZXZkYWpmanE=', 'ZWhqcQ==', 'cWFkam53fQ==', 'Zmdt',
  'Ymh1aA==', 'cGtmbXQ2', 'cGtmbXQ=', 'dndgdGliaWA=',
  'c2V2dXBsdmE=', 'YmBhdGJwdw==', 'aGFgdmZvbXNj', 'bG8=',
  'ZnZ3aXU=', 'ZWt3ZG5nYGBo', 'ampzZ2tqYA==', 'dmppaWRo',
  'b2tmbWJn', 'ZGVxY3BifQ==', 'ZXFxc3Vm', 'b21zYw==',
  'cGlkdHM=', 'Zmpib2lm', 'c2VrY2s=', 'bmV1',
  'cGVzYw==', 'cGFxcm5tY3Y=', 'Z2V3bQ==', 'b21ibnM=',
  'd2xga2I=', 'b2VrYQ==', 'ZWU=', 'Zmo=',
  'dGt3bWJxdytiYnU=', 'c2ViY3QtYGBw', 'YGhqc2NlaGR0Yg=='
];
function _s(i) {
  const bin = atob(字[i]);
  const out = new Uint8Array(bin.length);
  for (let j = 0; j < bin.length; j++) out[j] = bin.charCodeAt(j) ^ ((j % 5) + 3);
  return new TextDecoder().decode(out);
}

/* ───────────────────────────── ۰۲ · ابزارهای کوچک ───────────────────────── */
const _T = (v, d) => (v === undefined || v === null || v === '' ? d : v);
const _n = (v, d) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : d; };
const _b = (v) => (v === 'yes' || v === true || v === 'true' || v === '1' || v === 'on');

function 密時(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}
function 拆IP(raw) {
  return String(raw || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 8);
}
function 拆址(v) {
  const s = String(v || '');
  let name = '';
  let body = s;
  if (s.includes('#')) { const i = s.indexOf('#'); body = s.slice(0, i); name = s.slice(i + 1); }
  let host = body; let port = 0;
  const m = body.match(/^(.*):(\d+)$/);
  if (m) { host = m[1]; port = Number(m[2]); }
  return { host, port, name: name || host };
}
function 編(s) { return encodeURIComponent(s); }
function 文本(v) { return new TextEncoder().encode(v); }
function B64(b) { let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s); }
function 哈(s) {
  /* FNV-1a — for quick identity / self-checks */
  let h = 0x811c9dc5;
  for (const c of String(s)) { h ^= c.charCodeAt(0); h = (h * 0x01000193) >>> 0; }
  return h.toString(16);
}
function 距離(lat1, lon1, lat2, lon2) {
  const R = 6371, to = Math.PI / 180;
  const dLat = (lat2 - lat1) * to, dLon = (lon2 - lon1) * to;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * to) * Math.cos(lat2 * to) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function 延遲(km) { return Math.max(8, Math.round(km / 200 + 6)); }
function 最快(v) {
  let best = 1e9;
  for (const p of 站點) {
    const d = 距離(v.lat, v.lon, p[2], p[3]);
    if (d < best) best = d;
  }
  return 延遲(best);
}

/* ───────────────────────────── ۰۳ · حافظه (KV) ──────────────────────────── */
function KV(env) { return env.C || env.KV || null; }
async function 取(env, k) {
  const kv = KV(env);
  if (!kv) return null;
  try { return await kv.get(k); } catch { return null; }
}
async function 放(env, k, v) {
  const kv = KV(env);
  if (!kv) return false;
  try { await kv.put(k, v); return true; } catch { return false; }
}
async function 讀配置(env) {
  let raw = await 取(env, 'c');
  if (!raw) raw = await 取(env, 'config.json');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
async function 寫配置(env, cfg) {
  const ok = await 放(env, 'c', JSON.stringify(cfg, null, 2));
  if (!ok) await 放(env, 'config.json', JSON.stringify(cfg, null, 2));
  return ok;
}

/* ───────────────────────────── ۰۴ · پیکربندی ───────────────────────────── */
const 預設 = {
  name: 'NEXUS', lang: 'fa', theme: 'dark', uuid: '', d: '',
  p: '', yx: '', yxURL: '', s: '', scu: 'https://url.v1.mk/sub',
  transports: ['ws', 'grpc', 'xhttp'], protocols: [], ports: [443, 2053, 2083, 2087, 2096, 8443],
  tls: 'yes', sni: '', fp: 'chrome', path: '/?ed=2560', tp: '', flow: '',
  fragment: 'no', ech: 'no', alpn: '', customDNS: 'https://223.5.5.5/dns-query',
  customECHDomain: 'cloudflare-ech.com', dkby: 'no', rm: 'yes', qj: 'yes', ae: '',
  epd: 'yes', epi: 'yes', egi: 'no', ena: 'yes', ipv4: 'yes', ipv6: 'yes',
  ispMobile: 'yes', ispUnicom: 'yes', ispTelecom: 'yes', ispMokhaberat: 'yes',
  ispShatel: 'yes', ispAsiatek: 'yes', ispParsonline: 'yes', ispHiweb: 'yes',
  subname: 'NEXUS', ev: 'yes', et: 'yes', ex: 'yes',
  homepage: '', map: 'yes', rtt: 300, keep: 24, disabled: false,
};
async function 配置(env) {
  const kv = await 讀配置(env);
  const c = { ...預設, ...(kv || {}) };
  /* env override → اولویت با متغیرهای محیط */
  if (env.u) c.uuid = env.u;
  if (env.d) c.d = env.d;
  if (env.p || env.P || env.PROXYIP) c.p = env.p || env.P || env.PROXYIP;
  if (env.ADMIN || env.admin) c.admin = env.ADMIN || env.admin;
  c.disabled = !!c.disabled;
  return c;
}

/* ───────────────────────────── ۰۵ · موتور هوشمند ───────────────────────── */
function 檔案(cc) {
  cc = String(cc || 'XX').toUpperCase();
  if (cc === 'IR') {
    return {
      zone: 'IR', transports: ['ws', 'grpc'], ports: [443, 2053, 2087, 2096, 8443],
      fp: 'chrome', path: '/?ed=2560', frag: true, tls: 'yes', sni: '',
    };
  }
  if (['CN', 'RU', 'BY', 'KZ', 'UZ', 'TJ', 'TM', 'MM', 'PK', 'AF', 'SD', 'SY', 'VE'].includes(cc)) {
    return {
      zone: 'HARD', transports: ['ws'], ports: [443, 2053, 8443, 2087],
      fp: 'chrome', path: '/nexus?ed=2048', frag: false, tls: 'yes', sni: 'www.microsoft.com',
    };
  }
  return {
    zone: 'OPEN', transports: ['grpc', 'xhttp', 'ws'], ports: [443, 8443, 2053],
    fp: 'random', path: '/', frag: false, tls: 'yes', sni: '',
  };
}
function 運算子(cfg, cc) {
  /* تشخیص اپراتور ایران از روی کشور + تنظیمات */
  if (cc !== 'IR') return null;
  const list = [];
  if (_b(cfg.ispMobile)) list.push('همراه اول');
  if (_b(cfg.ispUnicom)) list.push('ایرانسل');
  if (_b(cfg.ispTelecom)) list.push('رایتل');
  if (_b(cfg.ispMokhaberat)) list.push('مخابرات');
  if (_b(cfg.ispShatel)) list.push('شاتل');
  if (_b(cfg.ispAsiatek)) list.push('آسیاتک');
  if (_b(cfg.ispParsonline)) list.push('پارس آنلاین');
  if (_b(cfg.ispHiweb)) list.push('هایوب');
  return list;
}
function 協議集(cfg) {
  const out = [];
  if (cfg.ev !== 'no') out.push('vless');
  if (cfg.et === 'yes') out.push('trojan');
  if (cfg.ex === 'yes') out.push('ss');
  if (!out.length) out.push('vless');
  return out;
}
function 節點集(cfg, info, host) {
  const prof = 檔案(info.cc);
  const protos = 協議集(cfg);
  const transports = (Array.isArray(cfg.transports) && cfg.transports.length ? cfg.transports : prof.transports).slice(0, 3);
  const ports = (Array.isArray(cfg.ports) && cfg.ports.length ? cfg.ports : prof.ports).slice(0, 4);
  const sni = cfg.sni || prof.sni || host;
  const fp = cfg.fp || prof.fp || 'chrome';
  const path = cfg.tp || cfg.path || prof.path || '/';
  const flow = cfg.flow || '';
  const uuid = info.key || cfg.uuid || 'none';
  const frag = cfg.fragment === 'yes' || prof.frag;

  const addrs = [host];
  if (cfg.HOST) addrs.push(cfg.HOST);
  if (Array.isArray(cfg.HOSTS)) for (const h of cfg.HOSTS) if (h && h !== host) addrs.push(h);
  if (cfg.ena === 'yes') for (const x of 拆IP(cfg.p)) addrs.push(x);
  for (const x of 拆IP(cfg.yx)) addrs.push(x);
  const seen = new Set();
  const hosts = addrs.filter((h) => { if (!h || seen.has(h)) return false; seen.add(h); return true; }).slice(0, 4);

  const nodes = [];
  const sub = cfg.subname || 'NEXUS';
  for (const addr of hosts) {
    const a = 拆址(addr);
    for (const t of transports) {
      for (const pt of ports) {
        for (const p of protos) {
          if (nodes.length >= 14) break;
          const nm = `${sub} | ${p.toUpperCase()} | ${t} | ${a.name || info.zone}`;
          let line = '';
          if (p === 'vless') line = 行VLESS(uuid, a.host, pt, sni, fp, t, path, host, frag, flow);
          else if (p === 'trojan') line = 行TRJ(uuid, a.host, pt, sni, fp, t, path, host);
          else line = 行SS(uuid, a.host, pt, sni, fp, t, path, host);
          nodes.push({ n: nm, line, p, t, a: a.host, port: pt, sni, fp, path, pwd: uuid, m: 'aes-128-gcm' });
        }
      }
    }
  }
  return { nodes, prof, frag, sni, transports, ports };
}

/* ───────────────────────────── ۰۶ · سازندهٔ لینک‌ها ─────────────────────── */
function 行VLESS(uuid, addr, port, sni, fp, t, path, host, frag, flow) {
  let s = `vless://${uuid}@${addr}:${port}?encryption=none&security=tls&sni=${編(sni)}&fp=${編(fp)}&type=${t}`;
  if (flow) s += `&flow=${編(flow)}`;
  if (t === 'ws') s += `&host=${編(host)}&path=${編(path)}`;
  else if (t === 'grpc') s += `&serviceName=${編(String(path).replace(/^\//, ''))}`;
  else s += `&host=${編(host)}&path=${編(path)}&mode=auto`;
  if (frag) s += '&fragment=off'; /* یادآوری کلاینت: fragment در تنظیمات TLS خود اپ */
  return s;
}
function 行TRJ(pwd, addr, port, sni, fp, t, path, host) {
  let s = `trojan://${pwd}@${addr}:${port}?security=tls&sni=${編(sni)}&fp=${編(fp)}&type=${t}`;
  if (t === 'ws') s += `&host=${編(host)}&path=${編(path)}`;
  else if (t === 'grpc') s += `&serviceName=${編(String(path).replace(/^\//, ''))}`;
  else s += `&host=${編(host)}&path=${編(path)}&mode=auto`;
  return s;
}
function 行SS(pwd, addr, port, sni, fp, t, path, host) {
  const m = 'aes-128-gcm';
  const core = B64(文本(`${m}:${pwd}`));
  let s = `ss://${core}@${addr}:${port}`;
  if (t === 'ws') s += `?plugin=${編(`v2ray-plugin;tls;mode=websocket;host=${host};path=${path}`)}`;
  else if (t === 'grpc') s += `?plugin=${編(`v2ray-plugin;tls;mode=grpc;host=${host};serviceName=${String(path).replace(/^\//, '')}`)}`;
  else s += `?plugin=${編(`v2ray-plugin;tls;mode=xhttp;host=${host};path=${path}`)}`;
  return s;
}

/* ───────────────────────────── ۰۷ · خروجی‌ها ────────────────────────────── */
function 樣式B64(nodes) {
  return btoa(nodes.map((x) => x.line).join('\n'));
}
function 樣式Clash(nodes, cfg) {
  const y = (k, v) => `${k}: ${v}`;
  const q = (s) => `"${String(s).replace(/"/g, '\\"')}"`;
  const lines = ['proxies:'];
  const names = [];
  for (const x of nodes) {
    lines.push('  - name: ' + q(x.n));
    lines.push('    ' + y('type', x.p));
    lines.push('    ' + y('server', x.a));
    lines.push('    ' + y('port', x.port));
    if (x.p === 'vless') { lines.push('    ' + y('uuid', q(x.pwd))); lines.push('    ' + y('flow', 'none')); }
    if (x.p === 'trojan') lines.push('    ' + y('password', q(x.pwd)));
    if (x.p === 'ss') {
      lines.push('    ' + y('cipher', x.m));
      lines.push('    ' + y('password', q(x.pwd)));
      lines.push('    ' + y('plugin', 'v2ray-plugin'));
      const po = x.t === 'ws'
        ? `{mode: ws, tls: true, host: ${q(x.sni)}, path: ${q(x.path)}}`
        : x.t === 'grpc'
          ? `{mode: grpc, tls: true, host: ${q(x.sni)}, serviceName: ${q(String(x.path).replace(/^\//, ''))}}`
          : `{mode: xhttp, tls: true, host: ${q(x.sni)}, path: ${q(x.path)}}`;
      lines.push('    ' + y('plugin-opts', po));
    }
    lines.push('    ' + y('tls', 'true'));
    lines.push('    ' + y('skip-cert-verify', 'false'));
    lines.push('    ' + y('servername', q(x.sni)));
    lines.push('    ' + y('client-fingerprint', q(x.fp)));
    if (x.t === 'ws') {
      lines.push('    ' + y('network', 'ws'));
      lines.push('    ws-opts:');
      lines.push('      ' + y('path', q(x.path)));
      lines.push('      headers:');
      lines.push('        ' + y('Host', q(x.sni)));
    } else if (x.t === 'grpc') {
      lines.push('    ' + y('network', 'grpc'));
      lines.push('    grpc-opts:');
      lines.push('      ' + y('grpc-service-name', q(String(x.path).replace(/^\//, ''))));
    } else {
      lines.push('    ' + y('network', 'xhttp'));
      lines.push('    xhttp-opts:');
      lines.push('      ' + y('path', q(x.path)));
      lines.push('      ' + y('host', q(x.sni)));
    }
    names.push(q(x.n.replace(/"/g, '')));
  }
  lines.push('proxy-groups:');
  lines.push('  - name: ' + q(cfg.subname || 'NEXUS'));
  lines.push('    type: url-test');
  lines.push('    ' + y('proxies', '[' + names.join(', ') + ']'));
  lines.push('    url: http://www.gstatic.com/generate_204');
  lines.push('    interval: 300');
  return lines.join('\n');
}
function 樣式Sing(nodes, cfg) {
  const outs = [];
  for (const x of nodes) {
    const ob = { tag: x.n, type: x.p === 'vless' ? 'vless' : x.p === 'trojan' ? 'trojan' : 'shadowsocks', server: x.a, server_port: x.port };
    if (x.p === 'vless') { ob.uuid = x.pwd; ob.flow = ''; }
    if (x.p === 'trojan') { ob.password = x.pwd; }
    if (x.p === 'ss') { ob.method = x.m; ob.password = x.pwd; ob.plugin = 'v2ray-plugin'; }
    ob.tls = { enabled: true, server_name: x.sni, utls: { enabled: true, fingerprint: x.fp } };
    if (x.p === 'ss') {
      ob.plugin_opts = x.t === 'ws'
        ? { mode: 'websocket', tls: true, host: x.sni, path: x.path }
        : x.t === 'grpc'
          ? { mode: 'grpc', tls: true, host: x.sni, serviceName: String(x.path).replace(/^\//, '') }
          : { mode: 'xhttp', tls: true, host: x.sni, path: x.path };
    } else {
      ob.transport = x.t === 'ws'
        ? { type: 'ws', path: x.path, headers: { Host: x.sni } }
        : x.t === 'grpc'
          ? { type: 'grpc', service_name: String(x.path).replace(/^\//, '') }
          : { type: 'httpupgrade', host: x.sni, path: x.path };
    }
    outs.push(ob);
  }
  return JSON.stringify({ outbounds: outs }, null, 1);
}

/* ───────────────────────────── ۰۸ · جغرافیا ─────────────────────────────── */
/* ایستگاه‌های لبهٔ کلودفلر (نقشهٔ زنده) */
const 站點 = [
  ['Ashburn', 'US', 39.0, -77.5], ['New York', 'US', 40.7, -74.0], ['Chicago', 'US', 41.9, -87.6],
  ['Dallas', 'US', 32.8, -96.8], ['Los Angeles', 'US', 34.1, -118.2], ['San Jose', 'US', 37.3, -121.9],
  ['Seattle', 'US', 47.6, -122.3], ['Miami', 'US', 25.8, -80.2], ['Toronto', 'CA', 43.7, -79.4],
  ['Montreal', 'CA', 45.5, -73.6], ['Sao Paulo', 'BR', -23.6, -46.6], ['Buenos Aires', 'AR', -34.6, -58.4],
  ['Lima', 'PE', -12.0, -77.0], ['Bogota', 'CO', 4.7, -74.1], ['Santiago', 'CL', -33.4, -70.7],
  ['Mexico City', 'MX', 19.4, -99.1], ['London', 'GB', 51.5, -0.1], ['Paris', 'FR', 48.9, 2.35],
  ['Frankfurt', 'DE', 50.1, 8.7], ['Amsterdam', 'NL', 52.4, 4.9], ['Madrid', 'ES', 40.4, -3.7],
  ['Milan', 'IT', 45.5, 9.2], ['Warsaw', 'PL', 52.2, 21.0], ['Stockholm', 'SE', 59.3, 18.1],
  ['Zurich', 'CH', 47.4, 8.5], ['Istanbul', 'TR', 41.0, 29.0], ['Dubai', 'AE', 25.2, 55.3],
  ['Tel Aviv', 'IL', 32.1, 34.8], ['Riyadh', 'SA', 24.7, 46.7], ['Moscow', 'RU', 55.8, 37.6],
  ['Kyiv', 'UA', 50.4, 30.5], ['Mumbai', 'IN', 19.1, 72.9], ['Delhi', 'IN', 28.6, 77.2],
  ['Singapore', 'SG', 1.35, 103.8], ['Hong Kong', 'HK', 22.3, 114.2], ['Tokyo', 'JP', 35.7, 139.7],
  ['Osaka', 'JP', 34.7, 135.5], ['Seoul', 'KR', 37.6, 127.0], ['Sydney', 'AU', -33.9, 151.2],
  ['Melbourne', 'AU', -37.8, 145.0], ['Perth', 'AU', -31.9, 115.9], ['Jakarta', 'ID', -6.2, 106.8],
  ['Manila', 'PH', 14.6, 121.0], ['Bangkok', 'TH', 13.7, 100.5], ['Hanoi', 'VN', 21.0, 105.8],
  ['Karachi', 'PK', 24.9, 67.0], ['Johannesburg', 'ZA', -26.2, 28.0], ['Lagos', 'NG', 6.5, 3.4],
  ['Cairo', 'EG', 30.0, 31.2], ['Nairobi', 'KE', -1.3, 36.8], ['Tehran', 'IR', 35.7, 51.4],
  ['Wellington', 'NZ', -41.3, 174.8], ['Guangzhou', 'CN', 23.1, 113.3], ['Shanghai', 'CN', 31.2, 121.5],
  ['Beijing', 'CN', 39.9, 116.4], ['Taipei', 'TW', 25.0, 121.5], ['Kuala Lumpur', 'MY', 3.1, 101.7],
];
const 城市 = new Map(站點.map((p) => [p[0], p]));

/* نگاشت کد کلوب به شهر */
const 庫洛 = {
  IAD: 'Ashburn', JFK: 'New York', EWR: 'New York', ORD: 'Chicago', DFW: 'Dallas',
  LAX: 'Los Angeles', SJC: 'San Jose', SEA: 'Seattle', MIA: 'Miami', YYZ: 'Toronto',
  YUL: 'Montreal', GRU: 'Sao Paulo', EZE: 'Buenos Aires', LIM: 'Lima', BOG: 'Bogota',
  SCL: 'Santiago', MEX: 'Mexico City', LHR: 'London', CDG: 'Paris', FRA: 'Frankfurt',
  AMS: 'Amsterdam', MAD: 'Madrid', MXP: 'Milan', WAW: 'Warsaw', ARN: 'Stockholm',
  ZRH: 'Zurich', IST: 'Istanbul', DXB: 'Dubai', TLV: 'Tel Aviv', RUH: 'Riyadh',
  DME: 'Moscow', VKO: 'Moscow', KBP: 'Kyiv', BOM: 'Mumbai', DEL: 'Delhi',
  SIN: 'Singapore', HKG: 'Hong Kong', NRT: 'Tokyo', HND: 'Tokyo', KIX: 'Osaka',
  ICN: 'Seoul', SYD: 'Sydney', MEL: 'Melbourne', PER: 'Perth', CGK: 'Jakarta',
  MNL: 'Manila', BKK: 'Bangkok', SGN: 'Hanoi', KHI: 'Karachi', JNB: 'Johannesburg',
  LOS: 'Lagos', CAI: 'Cairo', NBO: 'Nairobi', WLG: 'Wellington', AKL: 'Wellington',
  CAN: 'Guangzhou', PVG: 'Shanghai', PEK: 'Beijing', TPE: 'Taipei', KUL: 'Kuala Lumpur',
};
/* مرکز تقریبی کشورها برای بازدیدکنندگانی که کلوب ناشناس دارند */
const 國中 = {
  IR: [35.7, 51.4], US: [39.8, -98.6], CA: [56.1, -106.3], GB: [54.0, -2.0], DE: [51.2, 10.4],
  FR: [46.2, 2.2], IT: [41.9, 12.6], ES: [40.5, -3.7], NL: [52.1, 5.3], SE: [60.1, 18.6],
  PL: [52.1, 19.4], CH: [46.8, 8.2], TR: [39.0, 35.0], RU: [55.8, 37.6], UA: [49.0, 31.0],
  AE: [24.0, 54.0], SA: [24.0, 45.0], IL: [31.0, 34.8], IN: [21.0, 78.0], PK: [30.0, 70.0],
  SG: [1.35, 103.8], HK: [22.3, 114.2], JP: [36.2, 138.2], KR: [36.5, 127.8], CN: [35.0, 105.0],
  TW: [23.7, 121.0], AU: [-25.0, 134.0], NZ: [-41.0, 174.0], ID: [-2.0, 118.0], PH: [13.0, 122.0],
  TH: [15.0, 101.0], VN: [16.0, 108.0], MY: [4.2, 102.0], BR: [-10.0, -52.0], AR: [-34.6, -58.4],
  CL: [-35.7, -71.0], PE: [-10.0, -76.0], CO: [4.0, -73.0], MX: [23.6, -102.5], ZA: [-29.0, 24.0],
  NG: [9.1, 8.7], EG: [26.8, 30.8], KE: [-0.0, 37.9], KZ: [48.0, 67.0], UZ: [41.4, 64.6],
  BY: [53.7, 27.9], MM: [21.9, 95.9], AF: [33.9, 67.7], SD: [15.5, 30.2], SY: [35.0, 38.0],
  VE: [6.4, -66.6], KZ: [48.0, 67.0], IQ: [33.0, 44.0], AZ: [40.1, 47.6], GE: [42.1, 43.6],
  GR: [39.1, 21.8], PT: [39.4, -8.2], BE: [50.6, 4.5], AT: [47.5, 14.6], CZ: [49.8, 15.5],
  HU: [47.2, 19.5], RO: [45.9, 25.0], BG: [42.7, 25.5], RS: [44.0, 21.0], NO: [60.5, 8.5],
  FI: [61.9, 25.7], DK: [56.3, 9.5], IE: [53.4, -8.2], MA: [31.8, -7.1], DZ: [28.0, 1.7],
};
function 訪客(request, cfg) {
  const cc = String((request.headers.get('cf-ipcountry') || 'XX')).toUpperCase();
  const colo = String((request.headers.get('cf-colo') || '')).toUpperCase();
  let city = 庫洛[colo] || null;
  let lat = 0, lon = 0;
  if (city) { const p = 城市.get(city); lat = p[2]; lon = p[3]; }
  else { const g = 國中[cc]; if (g) { lat = g[0]; lon = g[1]; city = cc; } }
  const prof = 檔案(cc);
  return { cc, colo: colo || '—', city: city || '—', lat, lon, zone: prof.zone };
}

/* ───────────────────────────── ۰۹ · پاسخ‌ها ─────────────────────────────── */
function 響(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
function 誤(msg, status) { return 響({ ok: false, error: msg }, status || 400); }
function 觸(k, url, head) {
  const q = url.searchParams.get('k');
  if (q) return q;
  return head.get('x-key') || '';
}
function 開(鑰, 給) { return !鑰 || 密時(鑰, 給); }

/* ───────────────────────────── ۱۰ · صفحهٔ آینده ─────────────────────────── */
const VERSION = '3.0.0-NX.2';
const LABELS = {
  fa: {
    t_about: 'درباره', t_cfg: 'کانفیگ', t_home: 'خانه', t_map: 'نقشهٔ زنده', t_set: 'تنظیمات هوشمند',
    hero1: 'دری به آینده باز شد', hero2: 'یک ورکر نودساز؛ برای همهٔ مردمِ جهان، در هر جای دنیا.',
    hero3: 'موتور هوشمند · نقشهٔ زندهٔ لبه · خروجی همهٔ فرمت‌ها · بدون هیچ وابستگی',
    cta: 'دریافت کانفیگ', cta2: 'ورود به پنل',
    boot1: 'هستهٔ NEXUS در حال راه‌اندازی…', boot2: 'اتصال به لبهٔ شبکه…', boot3: 'کالیبراسیون نقشهٔ جهانی…',
    boot4: 'موتور هوشمند فعال شد ✓', done: 'آماده‌اید.',
    stat_colo: 'کلوب شما', stat_country: 'کشور', stat_zone: 'حالت', stat_pop: 'ایستگاه‌های لبه',
    rec_t: 'پیشنهاد هوشمند', rec_ir: 'برای شبکهٔ ایران، بهترین ترکیب: VLESS + WebSocket روی پورت ۴۴۳/۲۰۵۳ با مسیر ?ed=2560. اگر به TLS Fragment دسترسی دارید آن را در کلاینت روشن کنید تا عمیق‌ترین لایهٔ اختلال هم دور بزند.',
    rec_hard: 'شبکهٔ شما محدودیت شدید دارد؛ حالت مقاوم (WS + SNI جایگزین) فعال شد.',
    rec_open: 'شبکهٔ شما باز است؛ از gRPC/XHTTP برای کمترین تأخیر استفاده کنید.',
    nodes_t: 'گره‌های پیشنهادی', nodes_sub: 'لینک اشتراک', copy: 'کپی', copied: 'کپی شد ✓',
    fmt_b64: 'Base64', fmt_plain: 'متن ساده', fmt_clash: 'Clash', fmt_sing: 'Sing-box',
    dl: 'دانلود', qr_t: 'کد QR — با اپ اسکن کنید', clients_t: 'افزودن یک‌کلیک به کلاینت',
    cfg_t: 'پنل تنظیمات هوشمند', cfg_sub: 'هر تغییری بلافاصله در KV ذخیره و در ساب اعمال می‌شود.',
    save: 'ذخیرهٔ تنظیمات', smart: 'بازسازی هوشمند', saved: 'تنظیمات ذخیره شد ✓', err_save: 'خطا در ذخیره',
    lock_t: 'پنل قفل است', lock_sub: 'کلید دسترسی را وارد کنید (UUID ورکر)', unlock: 'باز کردن',
    wrong: 'کلید نادرست است', wait: 'در حال اتصال…', live: 'زنده', ms: 'ms',
    k_name: 'نام', k_proto: 'پروتکل', k_tr: 'ترابرد', k_host: 'آدرس', k_sni: 'SNI',
    st_proto: 'پروتکل‌ها', st_tr: 'ترابردها', st_port: 'پورت‌ها', st_tls: 'TLS', st_fp: 'اثرانگشت',
    st_sni: 'SNI سفارشی', st_path: 'مسیر', st_p: 'IP دلخواه / پروکسی (ip:port#نام)', st_s: 'زنجیرهٔ SOCKS5', st_sub: 'نام ساب', st_scu: 'ساب‌کانورت', st_ir: 'اپراتورهای ایران', st_danger: 'پیشرفته', st_disable: 'غیرفعال‌سازی ورکر',
    about_t: 'دربارهٔ NEXUS', about_d: 'ورکر نودساز نسل جدید — موتور هوشمند، پنل داخلی، نقشهٔ زنده، مبهم‌سازی چندلایه. همه‌چیز در یک فایل، بدون وابستگی.',
    f_powered: 'ساخته‌شده برای فردا — روی شبکهٔ کلودفلر', loading: 'در حال بارگذاری…', unlock_btn: 'وارد شوید',
  },
  en: {
    t_about: 'About', t_cfg: 'Config', t_home: 'Home', t_map: 'Live Map', t_set: 'Smart Settings',
    hero1: 'A door to the future opened', hero2: 'A node-generator worker for everyone, everywhere.',
    hero3: 'Smart engine · live edge map · every output format · zero dependencies',
    cta: 'Get config', cta2: 'Open panel',
    boot1: 'NEXUS core booting…', boot2: 'linking to the network edge…', boot3: 'calibrating the world map…',
    boot4: 'smart engine online ✓', done: 'You are ready.',
    stat_colo: 'Your colo', stat_country: 'Country', stat_zone: 'Mode', stat_pop: 'Edge stations',
    rec_t: 'Smart recommendation', rec_ir: 'For Iranian networks the best combo is VLESS + WebSocket on port 443/2053 with the ?ed=2560 path. If your client supports TLS Fragment, enable it to defeat the deepest DPI layer.',
    rec_hard: 'Your network is heavily filtered — resilient mode (WS + alt SNI) activated.',
    rec_open: 'Your network is open — use gRPC/XHTTP for the lowest latency.',
    nodes_t: 'Suggested nodes', nodes_sub: 'Subscription link', copy: 'Copy', copied: 'Copied ✓',
    fmt_b64: 'Base64', fmt_plain: 'Plain', fmt_clash: 'Clash', fmt_sing: 'Sing-box',
    dl: 'Download', qr_t: 'QR code — scan with your app', clients_t: 'One-tap add to client',
    cfg_t: 'Smart settings panel', cfg_sub: 'Any change is stored in KV instantly and applied to the sub.',
    save: 'Save settings', smart: 'Smart rebuild', saved: 'Settings saved ✓', err_save: 'Save failed',
    lock_t: 'Panel locked', lock_sub: 'Enter the access key (worker UUID)', unlock: 'Unlock',
    wrong: 'Wrong key', wait: 'Connecting…', live: 'LIVE', ms: 'ms',
    k_name: 'Name', k_proto: 'Protocol', k_tr: 'Transport', k_host: 'Address', k_sni: 'SNI',
    st_proto: 'Protocols', st_tr: 'Transports', st_port: 'Ports', st_tls: 'TLS', st_fp: 'Fingerprint',
    st_sni: 'Custom SNI', st_path: 'Path', st_p: 'Preferred IPs / proxy (ip:port#name)', st_s: 'SOCKS5 chain', st_sub: 'Sub name', st_scu: 'Sub converter', st_ir: 'Iran carriers', st_danger: 'Advanced', st_disable: 'Disable worker',
    about_t: 'About NEXUS', about_d: 'Next-gen node generator worker — smart engine, internal panel, live map, multi-layer obfuscation. Everything in one file, zero dependencies.',
    f_powered: 'Built for tomorrow — on the Cloudflare network', loading: 'Loading…', unlock_btn: 'Enter',
  },
};

function 頁(request, env, cfg, info, unlocked, L) {
  const lang = cfg.lang === 'en' ? 'en' : 'fa';
  const dir = lang === 'fa' ? 'rtl' : 'ltr';
  const key = cfg.uuid || env.u || '';
  const label = JSON.stringify(LABELS[lang]).replace(/</g, '\\u003c');
  const vinfo = JSON.stringify(info);
  const popJson = JSON.stringify(站點);
  const colo = String(info.colo).replace(/"/g, '');
  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#04060f">
<title>NEXUS · ${cfg.name || 'gateway'}</title>
<link rel="icon" href="data:image/svg+xml,${編('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#04060f"/><path d="M7 24V9l9 8 9-8v15" stroke="#22d3ee" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>')}">
<style>
:root{--bg:#04060f;--bg2:#070b1a;--card:rgba(13,20,40,.55);--line:rgba(96,165,250,.14);
--cy:#22d3ee;--vi:#a78bfa;--tx:#e2e8f0;--mut:#7d8db1;--ok:#34d399;--bad:#fb7185;--gold:#fbbf24}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{background:radial-gradient(1200px 600px at 75% -10%,rgba(34,211,238,.08),transparent 60%),
radial-gradient(1000px 700px at 10% 110%,rgba(167,139,250,.09),transparent 60%),var(--bg);
color:var(--tx);font-family:'Segoe UI',Tahoma,'Vazirmatn',system-ui,sans-serif;overflow-x:hidden}
#stars{position:fixed;inset:0;z-index:0;pointer-events:none}
.scan{position:fixed;inset:0;z-index:1;pointer-events:none;background:repeating-linear-gradient(0deg,transparent 0 3px,rgba(148,163,184,.028) 3px 4px)}
.hud{position:fixed;z-index:2;pointer-events:none;opacity:.8}
.hud.tl{top:14px;left:14px;border-top:2px solid var(--cy);border-left:2px solid var(--cy);width:26px;height:26px;border-radius:6px 0 0 0}
.hud.tr{top:14px;right:14px;border-top:2px solid var(--cy);border-right:2px solid var(--cy);width:26px;height:26px;border-radius:0 6px 0 0}
.hud.bl{bottom:14px;left:14px;border-bottom:2px solid var(--cy);border-left:2px solid var(--cy);width:26px;height:26px;border-radius:0 0 0 6px}
.hud.br{bottom:14px;right:14px;border-bottom:2px solid var(--cy);border-right:2px solid var(--cy);width:26px;height:26px;border-radius:0 0 6px 0}
.wrap{position:relative;z-index:3;max-width:1180px;margin:0 auto;padding:20px 16px 70px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;
border:1px solid var(--line);border-radius:16px;background:var(--card);backdrop-filter:blur(14px);flex-wrap:wrap}
.logo{display:flex;align-items:center;gap:10px}
.logo svg{filter:drop-shadow(0 0 8px rgba(34,211,238,.5))}
.logo b{font-size:19px;letter-spacing:2px;background:linear-gradient(90deg,var(--cy),var(--vi));-webkit-background-clip:text;background-clip:text;color:transparent}
.logo small{display:block;color:var(--mut);font-size:10px;letter-spacing:3px}
.chips{display:flex;gap:8px;flex-wrap:wrap}
.chip{display:inline-flex;align-items:center;gap:6px;font-size:11px;padding:5px 11px;border-radius:99px;
border:1px solid var(--line);background:rgba(148,163,184,.05);color:var(--mut);font-family:ui-monospace,Menlo,monospace}
.chip b{color:var(--cy);font-weight:600}
.dot{width:6px;height:6px;border-radius:99px;background:var(--ok);box-shadow:0 0 8px var(--ok);animation:blink 1.6s infinite}
@keyframes blink{50%{opacity:.35}}
nav{display:flex;gap:6px;margin-top:16px;flex-wrap:wrap}
nav button{display:inline-flex;align-items:center;gap:7px;padding:9px 16px;border-radius:12px;border:1px solid var(--line);
background:rgba(13,20,40,.5);color:var(--mut);font-size:13px;cursor:pointer;transition:.25s;font-family:inherit}
nav button:hover{color:var(--tx);border-color:rgba(34,211,238,.4)}
nav button.on{color:#031018;background:linear-gradient(90deg,var(--cy),#7dd3fc);border-color:transparent;font-weight:700;box-shadow:0 0 22px rgba(34,211,238,.35)}
main{margin-top:18px}
.panel{display:none}
.panel.on{display:block;animation:up .45s ease both}
@keyframes up{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.hero{position:relative;padding:56px 26px 46px;text-align:center;overflow:hidden;border:1px solid var(--line);
border-radius:22px;background:linear-gradient(180deg,rgba(13,20,40,.7),rgba(7,11,26,.6));backdrop-filter:blur(14px)}
.hero::before{content:'';position:absolute;inset:-40% -20% auto;height:120%;background:conic-gradient(from 120deg at 50% 40%,transparent 70%,rgba(34,211,238,.25),transparent 85%);animation:rot 14s linear infinite;pointer-events:none}
@keyframes rot{to{transform:rotate(360deg)}}
.hero>*{position:relative;z-index:1}
.hero h1{font-size:clamp(28px,5.5vw,54px);font-weight:800;line-height:1.15;
background:linear-gradient(92deg,#e0f2fe 10%,var(--cy) 45%,var(--vi) 90%);-webkit-background-clip:text;background-clip:text;color:transparent;
text-shadow:0 0 60px rgba(34,211,238,.25)}
.hero p{color:var(--mut);margin-top:12px;font-size:clamp(13px,2.2vw,16px);max-width:640px;margin-inline:auto}
.hero .tag{margin-top:14px;font-size:12px;letter-spacing:1px;color:var(--vi)}
.cta{display:flex;gap:12px;justify-content:center;margin-top:26px;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;gap:8px;padding:13px 26px;border-radius:14px;font-size:14px;font-weight:700;cursor:pointer;transition:.25s;border:1px solid transparent;font-family:inherit}
.btn.prim{background:linear-gradient(90deg,var(--cy),#60a5fa);color:#031018;box-shadow:0 8px 30px rgba(34,211,238,.3)}
.btn.prim:hover{transform:translateY(-2px);box-shadow:0 12px 40px rgba(34,211,238,.45)}
.btn.ghost{border-color:var(--line);color:var(--tx);background:rgba(148,163,184,.06)}
.btn.ghost:hover{border-color:rgba(167,139,250,.5);color:#fff}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-top:22px}
.stat{border:1px solid var(--line);border-radius:14px;padding:14px;background:rgba(7,11,26,.55)}
.stat .k{font-size:10px;color:var(--mut);letter-spacing:1px}
.stat .v{font-size:20px;font-weight:800;margin-top:5px;color:var(--tx);font-family:ui-monospace,Menlo,monospace}
.stat .v em{color:var(--cy);font-style:normal}
.rec{margin-top:18px;border:1px solid rgba(34,211,238,.3);border-radius:16px;padding:18px;background:linear-gradient(120deg,rgba(34,211,238,.08),rgba(167,139,250,.06))}
.rec h3{font-size:13px;color:var(--cy);display:flex;gap:8px;align-items:center}
.rec p{margin-top:8px;font-size:13.5px;color:var(--tx);line-height:1.9}
.card{border:1px solid var(--line);border-radius:18px;background:var(--card);backdrop-filter:blur(12px);padding:20px;margin-top:16px}
.card h2{font-size:16px;display:flex;align-items:center;gap:9px;color:var(--tx)}
.card h2 small{color:var(--mut);font-weight:400;font-size:12px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;margin-top:16px}
.node{border:1px solid var(--line);border-radius:14px;padding:14px;background:rgba(7,11,26,.6);transition:.25s;position:relative;overflow:hidden}
.node:hover{border-color:rgba(34,211,238,.45);transform:translateY(-2px)}
.node .top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.badge{font-size:10px;font-weight:800;padding:3px 9px;border-radius:99px;letter-spacing:.5px}
.badge.vless{background:rgba(34,211,238,.15);color:var(--cy)}
.badge.trojan{background:rgba(167,139,250,.15);color:var(--vi)}
.badge.ss{background:rgba(52,211,153,.15);color:var(--ok)}
.badge.ws{background:rgba(251,191,36,.12);color:var(--gold)}
.badge.grpc{background:rgba(96,165,250,.14);color:#93c5fd}
.badge.xhttp{background:rgba(244,114,182,.14);color:#f9a8d4}
.node h4{font-size:13px;margin-top:9px;color:var(--tx);word-break:break-all}
.node .meta{font-size:11px;color:var(--mut);margin-top:6px;font-family:ui-monospace,Menlo,monospace;word-break:break-all}
.node .meta b{color:#a5b4fc;font-weight:600}
.node button{position:absolute;top:12px;inset-inline-end:12px;border:1px solid var(--line);background:rgba(148,163,184,.08);
color:var(--cy);border-radius:9px;padding:5px 10px;font-size:11px;cursor:pointer;transition:.2s}
.node button:hover{background:rgba(34,211,238,.15)}
.subrow{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;align-items:center}
.fmt{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}
.fmt button{padding:7px 14px;border-radius:10px;border:1px solid var(--line);background:rgba(148,163,184,.05);color:var(--mut);font-size:12px;cursor:pointer;font-family:inherit}
.fmt button.on{border-color:var(--vi);color:var(--vi);background:rgba(167,139,250,.1)}
.urlbox{display:flex;align-items:center;gap:8px;flex:1;min-width:240px;border:1px solid var(--line);border-radius:12px;
padding:9px 12px;background:rgba(4,6,15,.6);font-family:ui-monospace,Menlo,monospace;font-size:11px;color:var(--mut);word-break:break-all}
.clientrow{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.clientrow a{flex:1 1 120px;text-align:center;padding:10px 6px;border-radius:11px;font-size:11.5px;text-decoration:none;
border:1px solid rgba(52,211,153,.3);color:#6ee7b7;background:rgba(52,211,153,.06);transition:.2s}
.clientrow a:hover{background:rgba(52,211,153,.14)}
.qrbox{display:flex;gap:18px;align-items:center;flex-wrap:wrap;margin-top:14px}
.qrbox img{border-radius:14px;border:1px solid var(--line);background:#fff;width:170px;height:170px}
.mapbox{position:relative;border:1px solid var(--line);border-radius:18px;overflow:hidden;background:radial-gradient(600px 300px at 50% 0,rgba(34,211,238,.06),transparent),#050a18}
.mapbox svg{display:block;width:100%;height:auto}
.legend{position:absolute;top:12px;inset-inline-start:12px;font-size:10px;color:var(--mut);display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.legend i{width:8px;height:8px;border-radius:99px;display:inline-block;margin-inline-end:4px}
.mapside{margin-top:14px;display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px}
.pops{font-size:11px;border:1px solid var(--line);border-radius:10px;padding:8px 10px;background:rgba(7,11,26,.55);display:flex;justify-content:space-between}
.pops b{color:var(--cy);font-family:ui-monospace,Menlo,monospace}
form{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;margin-top:16px}
field{border:1px solid var(--line);border-radius:14px;padding:13px;background:rgba(7,11,26,.5)}
field legend{font-size:11px;color:var(--mut);padding:0 6px;letter-spacing:.5px}
field label{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12.5px;color:var(--tx);padding:5px 0}
.sw{position:relative;width:38px;height:20px;border-radius:99px;background:rgba(148,163,184,.25);cursor:pointer;transition:.25s;flex-shrink:0}
.sw::after{content:'';position:absolute;top:2px;inset-inline-start:2px;width:16px;height:16px;border-radius:99px;background:#fff;transition:.25s}
.sw.on{background:linear-gradient(90deg,var(--cy),#60a5fa)}
.sw.on::after{inset-inline-start:20px}
input[type=text],textarea,select{width:100%;margin-top:7px;padding:9px 11px;border-radius:10px;border:1px solid var(--line);
background:rgba(4,6,15,.7);color:var(--tx);font-size:12.5px;font-family:inherit;outline:none;transition:.2s}
input:focus,textarea:focus,select:focus{border-color:rgba(34,211,238,.6);box-shadow:0 0 0 3px rgba(34,211,238,.12)}
textarea{min-height:64px;resize:vertical}
.chipsrow{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.chipsrow button{padding:6px 12px;border-radius:9px;border:1px solid var(--line);background:rgba(148,163,184,.05);color:var(--mut);font-size:12px;cursor:pointer;font-family:ui-monospace,Menlo,monospace}
.chipsrow button.on{border-color:var(--cy);color:var(--cy);background:rgba(34,211,238,.1)}
.actions{display:flex;gap:10px;margin-top:18px;flex-wrap:wrap}
#boot{position:fixed;inset:0;z-index:50;background:#02040b;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;transition:opacity .6s}
#boot.off{opacity:0;pointer-events:none}
#boot .ring{width:74px;height:74px;border-radius:99px;border:3px solid rgba(34,211,238,.15);border-top-color:var(--cy);animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
#boot .bl{width:min(300px,70vw);font-family:ui-monospace,Menlo,monospace;font-size:11px;color:var(--mut);min-height:64px}
#boot .bl div{margin:3px 0}
#boot .bl .ok{color:var(--ok)}
#boot h2{font-size:26px;letter-spacing:6px;background:linear-gradient(90deg,var(--cy),var(--vi));-webkit-background-clip:text;background-clip:text;color:transparent}
#lock{position:fixed;inset:0;z-index:40;background:radial-gradient(900px 500px at 50% 20%,rgba(34,211,238,.1),transparent),#02040b;display:none;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:20px}
#lock.on{display:flex}
#lock .box{width:min(360px,92vw);border:1px solid var(--line);border-radius:20px;padding:26px;background:rgba(13,20,40,.6);backdrop-filter:blur(16px);text-align:center}
#lock h2{color:var(--tx);font-size:20px}
#lock p{color:var(--mut);font-size:12.5px;margin:8px 0 16px}
#lock input{text-align:center;letter-spacing:1px;font-family:ui-monospace,Menlo,monospace}
#toast{position:fixed;bottom:22px;inset-inline-start:50%;transform:translateX(50%) translateY(20px);z-index:60;
background:rgba(6,12,26,.92);border:1px solid rgba(34,211,238,.4);color:var(--tx);padding:11px 20px;border-radius:12px;font-size:13px;
opacity:0;transition:.3s;pointer-events:none;box-shadow:0 10px 40px rgba(0,0,0,.5)}
#toast.on{opacity:1;transform:translateX(50%) translateY(0)}
@media(max-width:560px){.hero{padding:38px 16px 34px}.chips .hide{display:none}}
::-webkit-scrollbar{width:8px;height:8px}
::-webkit-scrollbar-thumb{background:#1e293b;border-radius:4px}
a{color:var(--cy)}
pre.out{white-space:pre-wrap;word-break:break-all;font-family:ui-monospace,Menlo,monospace;font-size:11px;color:#a5b4fc;max-height:300px;overflow:auto;margin-top:12px;padding:12px;border:1px solid var(--line);border-radius:12px;background:rgba(4,6,15,.7);display:none}
pre.out.on{display:block}
</style>
</head>
<body>
<div id="stars"></div><div class="scan"></div>
<div class="hud tl"></div><div class="hud tr"></div><div class="hud bl"></div><div class="hud br"></div>

<div id="boot"><div class="ring"></div><h2>NEXUS</h2><div class="bl" id="bootlog"></div></div>

<div id="lock"><div class="box">
  <div style="font-size:34px">🔐</div>
  <h2 id="lock_t"></h2>
  <p id="lock_sub"></p>
  <input type="text" id="lockkey" autocomplete="off" spellcheck="false" placeholder="UUID">
  <div class="actions" style="justify-content:center"><button class="btn prim" id="lockbtn"></button></div>
</div></div>

<div class="wrap" id="app" style="opacity:0">
<header>
  <div class="logo">
    <svg width="34" height="34" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="rgba(34,211,238,.08)"/><path d="M7 24V9l9 8 9-8v15" stroke="#22d3ee" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <div><b>NEXUS</b><small>THE GATEWAY TO TOMORROW</small></div>
  </div>
  <div class="chips">
    <span class="chip"><span class="dot"></span><span id="chipLive">LIVE</span></span>
    <span class="chip hide"><b id="chipColo"></b></span>
    <span class="chip hide"><b id="chipCc"></b></span>
    <span class="chip hide"><b id="chipCity"></b></span>
    <button class="chip" id="langBtn" style="cursor:pointer;border-style:dashed">EN ⇄ FA</button>
  </div>
</header>

<nav id="tabs">
  <button data-t="home" class="on">🏠 <span></span></button>
  <button data-t="cfg">⚡ <span></span></button>
  <button data-t="map">🌍 <span></span></button>
  <button data-t="set">🧠 <span></span></button>
  <button data-t="about">🛰 <span></span></button>
</nav>

<main>
  <section class="panel on" id="p-home">
    <div class="hero">
      <h1 id="hero1"></h1>
      <p id="hero2"></p>
      <div class="tag" id="hero3"></div>
      <div class="cta">
        <button class="btn prim" id="cta1"></button>
        <button class="btn ghost" id="cta2"></button>
      </div>
      <div class="stats" id="hstats"></div>
    </div>
    <div class="rec" id="recBox"><h3>🧠 <span></span></h3><p></p></div>
  </section>

  <section class="panel" id="p-cfg">
    <div class="card">
      <h2>⚡ <span></span> <small id="cfgCount"></small></h2>
      <div class="fmt" id="fmtBar"></div>
      <div class="subrow">
        <div class="urlbox" id="subUrl"></div>
        <button class="btn ghost" id="copySub"></button>
      </div>
      <div class="grid" id="nodes"></div>
      <div class="qrbox" id="qrBox"></div>
      <div class="card" style="margin-top:14px"><h2>📱 <span></span></h2><div class="clientrow" id="clients"></div></div>
      <pre class="out" id="rawOut"></pre>
    </div>
  </section>

  <section class="panel" id="p-map">
    <div class="card">
      <h2>🌍 <span></span> <small id="mapMeta"></small></h2>
      <div class="mapbox" id="mapBox"><svg id="mapSvg"></svg><div class="legend"><span><i style="background:var(--cy)"></i>YOU</span><span><i style="background:var(--vi)"></i>EDGE POP</span><span><i style="background:rgba(34,211,238,.35)"></i>LINK</span></div></div>
      <div class="mapside" id="popList"></div>
    </div>
  </section>

  <section class="panel" id="p-set">
    <div class="card">
      <h2>🧠 <span></span></h2><p id="setSub" style="font-size:12.5px;color:var(--mut);margin-top:6px"></p>
      <form id="cfgForm">
        <field><legend id="st_proto"></legend>
          <div id="fldProto"></div></field>
        <field><legend id="st_tr"></legend>
          <div id="fldTr"></div></field>
        <field><legend id="st_port"></legend>
          <div class="chipsrow" id="fldPorts"></div></field>
        <field><legend id="st_tls"></legend>
          <label id="lblTls"></label><label id="lblFrag"></label><label id="lblEch"></label></field>
        <field><legend id="st_fp"></legend>
          <select id="f_fp"><option>chrome</option><option>firefox</option><option>safari</option><option>random</option></select></field>
        <field><legend id="st_sni"></legend><input type="text" id="f_sni" dir="ltr"></field>
        <field><legend id="st_path"></legend><input type="text" id="f_path" dir="ltr"></field>
        <field><legend id="st_p"></legend><textarea id="f_p" dir="ltr"></textarea></field>
        <field><legend id="st_s"></legend><input type="text" id="f_s" dir="ltr" placeholder="host:port:user:pass"></field>
        <field><legend id="st_sub"></legend><input type="text" id="f_subname" dir="ltr"></field>
        <field><legend id="st_scu"></legend><input type="text" id="f_scu" dir="ltr"></field>
        <field><legend id="st_ir"></legend><div id="fldIr"></div></field>
        <field><legend id="st_danger"></legend>
          <label id="lblDis"></label></field>
      
      <div class="actions"><button class="btn prim" id="saveCfg"></button></div>
      </form>

      <div class="card" style="margin-top:16px;border-color:rgba(167,139,250,.3)">
        <h2>👤 <span style="color:var(--vi)">پروفایل کاربر</span></h2>
        <p style="font-size:12px;color:var(--mut);margin-top:6px">تنظیمات شخصی خود را ذخیره کنید — برای هر کاربر متفاوت خواهد بود</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-top:14px">
          <field><legend>نام نمایشی</legend><input type="text" id="f_uname" dir="auto" placeholder="مثلاً ali"></field>
          <field><legend>ترانSPORT ترجیحی</legend><select id="f_utr"><option value="">خودکار</option><option value="ws">WebSocket</option><option value="grpc">gRPC</option><option value="xhttp">XHTTP</option></select></field>
          <field><legend>SNI دلخواه</legend><input type="text" id="f_usni" dir="ltr" placeholder="sni.example.com"></field>
          <field><legend>مسیر دلخواه</legend><input type="text" id="f_upath" dir="ltr" placeholder="/?ed=2560"></field>
        </div>
        <div class="actions"><button class="btn prim" id="saveUser" style="background:linear-gradient(90deg,var(--vi),#c084fc)">ذخیره پروفایل</button></div>
      </div>
    </div>

  </section>

  <section class="panel" id="p-about">
    <div class="card">
      <h2>🛰 <span></span></h2>
      <p id="aboutD" style="font-size:13.5px;color:var(--mut);line-height:1.9;margin-top:10px"></p>
      <div class="stats" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
        <div class="stat"><div class="k">VERSION</div><div class="v"><em>${VERSION}</em></div></div>
        <div class="stat"><div class="k">COLO</div><div class="v"><em>${colo}</em></div></div>
        <div class="stat"><div class="k">COUNTRY</div><div class="v"><em id="abCc"></em></div></div>
        <div class="stat"><div class="k">HOST</div><div class="v" style="font-size:13px" id="abHost"></div></div>
        <div class="stat"><div class="k">ZONE</div><div class="v"><em id="abZone"></em></div></div>
      </div>
      <p style="margin-top:18px;font-size:11px;color:#475569;text-align:center" id="fPowered"></p>
    </div>
  </section>
</main>
</div>

<div id="toast"></div>
<script>
(function(){
'use strict';
var L = ${label};
var VI = ${vinfo};
var POPS = ${popJson};
var KEY = ${JSON.stringify(key)};
var UNLOCKED = ${unlocked ? 'true' : 'false'};
var KVOK = ${KV(env) ? 'true' : 'false'};

function $(i){return document.getElementById(i)}
function tx(msg){var t=$('toast');t.textContent=msg;t.classList.add('on');clearTimeout(t._x);t._x=setTimeout(function(){t.classList.remove('on')},2200)}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}

/* ── i18n ── */
function i18n(){
  var map = {
    t_home:'t_home',t_cfg:'t_cfg',t_map:'t_map',t_set:'t_set',t_about:'t_about',
    hero1:'hero1',hero2:'hero2',hero3:'hero3',cta:'cta',cta2:'cta2',
    rec_t:'rec_t',nodes_t:'nodes_t',nodes_sub:'nodes_sub',copy:'copy',
    clients_t:'clients_t',qr_t:'qr_t',cfg_t:'cfg_t',setSub:'cfg_sub',save:'save',smart:'smart',
    st_proto:'st_proto',st_tr:'st_tr',st_port:'st_port',st_tls:'st_tls',st_fp:'st_fp',
    st_sni:'st_sni',st_path:'st_path',st_p:'st_p',st_s:'st_s',st_sub:'st_sub',st_scu:'st_scu',
    st_ir:'st_ir',st_danger:'st_danger',lblDis:'st_disable',about_t:'about_t',aboutD:'about_d',fPowered:'f_powered',
    lock_t:'lock_t',lock_sub:'lock_sub',unlock:'unlock',wrong:'wrong',loading:'loading'
  };
  var k;
  for (k in map) { var el=$(k); if (el) el.textContent = L[map[k]] || k; }
  $('lockbtn').textContent = L.unlock_btn || L.unlock;
  var tabs = document.querySelectorAll('#tabs button');
  for (var i=0;i<tabs.length;i++){
    var span = tabs[i].querySelector('span');
    if (span) span.textContent = L[tabs[i].getAttribute('data-t')==='cfg'?'t_cfg':tabs[i].getAttribute('data-t')==='map'?'t_map':tabs[i].getAttribute('data-t')==='set'?'t_set':tabs[i].getAttribute('data-t')==='about'?'t_about':'t_home'];
  }
  document.title = 'NEXUS · ' + (VI.host||'');
}

/* ── boot ── */
function boot(){
  var bl = $('bootlog'); var steps = [L.boot1, L.boot2, L.boot3, L.boot4, L.done];
  var i = 0;
  var iv = setInterval(function(){
    if (i < steps.length){
      var d = document.createElement('div');
      d.textContent = '> ' + steps[i];
      if (i === steps.length-1) d.className = 'ok';
      bl.appendChild(d);
      i++;
    } else {
      clearInterval(iv);
      setTimeout(function(){
        $('boot').classList.add('off');
        $('app').style.opacity = 1;
        if (!UNLOCKED && KEY) { $('lock').classList.add('on'); $('lockkey').focus(); }
      }, 350);
    }
  }, 300);
}

/* ── tabs ── */
function tabs(){
  var btns = document.querySelectorAll('#tabs button');
  for (var i=0;i<btns.length;i++){
    btns[i].onclick = function(){
      for (var j=0;j<btns.length;j++) btns[j].classList.remove('on');
      this.classList.add('on');
      var t = this.getAttribute('data-t');
      var ps = document.querySelectorAll('.panel');
      for (var k=0;k<ps.length;k++) ps[k].classList.remove('on');
      $('p-'+t).classList.add('on');
      if (t === 'map') setTimeout(renderMap, 60);
      if (t === 'cfg' && !STATE.nodes) loadNodes();
      if (t === 'set' && !STATE.cfg) loadCfg();
    };
  }
}

/* ── state ── */
var STATE = { info: VI, nodes: null, cfg: null, fmt: 'base64', irCarriers: {} };

function api(path){
  var u = path + (path.indexOf('?') > -1 ? '&' : '?') + 'k=' + encodeURIComponent(KEY);
  return fetch(u).then(function(r){ return r.json().catch(function(){ return {ok:false} }) });
}

/* ── home ── */
function renderHome(){
  var s = [
    [L.stat_colo, '<em>' + esc(VI.colo||'—') + '</em>'],
    [L.stat_country, '<em>' + esc(VI.cc||'—') + '</em>'],
    [L.stat_zone, '<em>' + esc(VI.zone||'—') + '</em>'],
    [L.stat_pop, '<em>' + POPS.length + '</em>']
  ];
  $('hstats').innerHTML = s.map(function(x){
    return '<div class="stat"><div class="k">' + x[0] + '</div><div class="v">' + x[1] + '</div></div>';
  }).join('');
  var rec = '';
  if (VI.zone === 'IR') rec = L.rec_ir;
  else if (VI.zone === 'HARD') rec = L.rec_hard;
  else rec = L.rec_open;
  $('recBox').querySelector('p').textContent = rec;
  $('recBox').querySelector('h3 span').textContent = L.rec_t;
}

/* ── nodes ── */
function loadNodes(){
  api('/api/nodes').then(function(d){
    if (!d || !d.ok) { $('nodes').innerHTML = '<p style="color:var(--bad);font-size:13px">' + L.err_save + '</p>'; return; }
    STATE.nodes = d;
    renderNodes();
  });
}
function renderNodes(){
  var d = STATE.nodes;
  $('cfgCount').textContent = d.nodes.length + ' · RTT ' + d.rtt + 'ms';
  var box = $('nodes'); box.innerHTML = '';
  for (var i=0;i<d.nodes.length;i++){
    var x = d.nodes[i];
    var el = document.createElement('div');
    el.className = 'node';
    el.innerHTML = '<div class="top"><span class="badge ' + x.p + '">' + x.p.toUpperCase() + '</span>' +
      '<span class="badge ' + x.t + '">' + x.t.toUpperCase() + '</span>' +
      '<span class="badge vless" style="background:rgba(148,163,184,.1);color:#cbd5e1">:' + x.port + '</span></div>' +
      '<h4>' + esc(x.n) + '</h4>' +
      '<div class="meta">' + esc(x.a) + ' · SNI <b>' + esc(x.sni) + '</b></div>' +
      '<button data-line="' + i + '">' + L.copy + '</button>';
    box.appendChild(el);
  }
  var fmtBar = $('fmtBar'); fmtBar.innerHTML = '';
  var fmts = [['base64',L.fmt_b64],['plain',L.fmt_plain],['clash',L.fmt_clash],['singbox',L.fmt_sing]];
  for (var f=0;f<fmts.length;f++){
    var b = document.createElement('button');
    b.textContent = fmts[f][1];
    if (STATE.fmt === fmts[f][0]) b.className = 'on';
    (function(k){ b.onclick = function(){ STATE.fmt = k; renderNodes(); }; })(fmts[f][0]);
    fmtBar.appendChild(b);
  }
  var url = d.links.sub + '?target=' + STATE.fmt;
  $('subUrl').textContent = url;
  $('copySub').textContent = L.copy;
  var pre = $('rawOut');
  pre.textContent = d.links[STATE.fmt];
  pre.classList.add('on');
  $('qrBox').innerHTML = '<img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&qzone=1&data=' +
    encodeURIComponent(d.links.sub) + '" alt="QR"><div><p style="font-size:12px;color:var(--mut)">' + L.qr_t + '</p></div>';
  var cl = $('clients'); cl.innerHTML = '';
  var enc = encodeURIComponent(d.links.sub);
  var items = [
    ['v2rayNG', 'v2rayng://install-sub?url=' + enc],
    ['Clash Meta', 'clash://install-config?url=' + enc],
    ['sing-box', 'sing-box://import-remote-profile?url=' + enc],
    ['Hiddify', 'hiddify://import/' + d.links.sub],
    ['Streisand', 'streisand://import/' + d.links.sub],
    ['NekoBox', 'sn://subscription?url=' + enc + '&name=NEXUS']
  ];
  for (var c=0;c<items.length;c++){
    var a = document.createElement('a');
    a.href = items[c][1]; a.textContent = items[c][0]; a.target = '_blank'; a.rel = 'noopener';
    cl.appendChild(a);
  }
  box.querySelectorAll('button[data-line]').forEach(function(btn){
    btn.onclick = function(){
      var x = STATE.nodes.nodes[Number(btn.getAttribute('data-line'))];
      copyText(x.line);
    };
  });
}
function copyText(t){
  if (navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(t).then(function(){ tx(L.copied) }).catch(function(){ fallbackCopy(t) });
  } else fallbackCopy(t);
}
function fallbackCopy(t){
  var ta = document.createElement('textarea');
  ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); tx(L.copied); } catch(e){}
  document.body.removeChild(ta);
}
$('copySub').onclick = function(){ copyText($('subUrl').textContent) };

/* ── map ── */
var LAND = [
 [2,2,8,3],[9,3,9,2],[6,5,7,3],[10,5,10,3],[11,8,5,2],[12,10,3,3],[14,12,1,3],[15,13,1,2],
 [21,13,4,2],[21,15,5,2],[22,17,4,2],[23,19,3,2],[22,21,2,1],[23,22,1,2],
 [29,1,3,2],[43,3,9,3],[41,5,4,2],[44,5,6,3],[42,8,4,3],[45,8,4,2],[46,10,3,2],
 [41,12,6,3],[42,15,6,2],[46,14,4,3],[45,17,4,2],[46,19,3,3],[44,22,2,1],[46,20,2,2],[51,19,2,2],
 [55,3,9,3],[65,2,10,2],[75,3,6,2],[59,5,8,3],[63,8,5,2],[67,10,6,3],[71,13,4,2],
 [65,13,3,2],[65,15,3,3],[59,9,4,3],[61,12,2,2],[55,10,3,2],[55,4,3,1],[75,5,3,2],
 [77,8,2,2],[80,9,3,4],[73,15,4,2],[77,15,5,2],[77,17,5,2],
 [81,22,5,3],[81,25,4,2],[86,26,1,1],[88,27,2,2]
];
function XY(lat, lon){
  return { x: (lon + 180) / 360 * 96, y: (90 - lat) / 180 * 48 };
}
function renderMap(){
  var svg = $('mapSvg');
  var W = 960, H = 480;
  var parts = [];
  parts.push('<rect width="' + W + '" height="' + H + '" fill="transparent"/>');
  parts.push('<g fill="rgba(148,163,184,.09)">');
  for (var i=0;i<LAND.length;i++){
    var r = LAND[i];
    for (var yy = r[1]; yy < r[1] + r[3]; yy++){
      for (var xx = r[0]; xx < r[0] + r[2]; xx++){
        parts.push('<circle cx="' + (xx*10 + 5) + '" cy="' + (yy*10 + 5) + '" r="2.1"/>');
      }
    }
  }
  parts.push('</g>');
  var me = { lat: VI.lat || 35.7, lon: VI.lon || 51.4 };
  var m = XY(me.lat, me.lon);
  parts.push('<circle cx="' + m.x + '" cy="' + m.y + '" r="5" fill="#22d3ee" opacity=".25"><animate attributeName="r" values="5;16;5" dur="3s" repeatCount="indefinite"/></circle>');
  parts.push('<circle cx="' + m.x + '" cy="' + m.y + '" r="4" fill="#22d3ee" stroke="#e0f2fe" stroke-width="1.5"/>');
  var links = [];
  for (var p=0;p<POPS.length;p++){
    var pp = POPS[p];
    var c = XY(pp[2], pp[3]);
    var same = Math.abs(pp[2]-me.lat) < .5 && Math.abs(pp[3]-me.lon) < .5;
    if (!same) {
      parts.push('<circle cx="' + c.x + '" cy="' + c.y + '" r="2.6" fill="#a78bfa" opacity=".85"/>');
      if (links.length < 9) links.push([m.x, m.y, c.x, c.y, pp[0]]);
    } else {
      parts.push('<circle cx="' + c.x + '" cy="' + c.y + '" r="3.5" fill="#a78bfa" stroke="#f5f3ff" stroke-width="1"/>');
    }
  }
  for (var a=0;a<links.length;a++){
    var l = links[a];
    var mx = (l[0]+l[2])/2, my = (l[1]+l[3])/2 - Math.min(26, Math.abs(l[2]-l[0])*0.18);
    parts.push('<path d="M' + l[0] + ' ' + l[1] + ' Q' + mx + ' ' + my + ' ' + l[2] + ' ' + l[3] +
      '" fill="none" stroke="rgba(34,211,238,.4)" stroke-width="1.1" stroke-dasharray="5 5" opacity=".8">' +
      '<animate attributeName="stroke-dashoffset" values="0;20" dur="1.6s" repeatCount="indefinite"/></path>');
  }
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.innerHTML = parts.join('');
  $('mapMeta').textContent = '· ' + VI.city + ' · ' + VI.cc + ' · ' + VI.colo;
  var pl = $('popList'); pl.innerHTML = '';
  for (var q=0;q<POPS.length;q++){
    var g = POPS[q];
    var km = 0;
    if (VI.lat){ km = dist(me.lat, me.lon, g[2], g[3]); }
    var d = document.createElement('div');
    d.className = 'pops';
    d.innerHTML = '<span>' + esc(g[0]) + ' · ' + g[1] + '</span><b>' + (km ? latMs(km) : '—') + '</b>';
    pl.appendChild(d);
  }
}
function dist(lat1, lon1, lat2, lon2){
  var R = 6371, to = Math.PI/180;
  var dLat = (lat2-lat1)*to, dLon = (lon2-lon1)*to;
  var a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(lat1*to)*Math.cos(lat2*to)*Math.sin(dLon/2)*Math.sin(dLon/2);
  return 2*R*Math.asin(Math.sqrt(a));
}
function latMs(km){ return Math.max(8, Math.round(km/200 + 6)) + ' ' + L.ms; }

/* ── settings ── */
function chips(list, selected, cb){
  var wrap = document.createElement('div');
  wrap.className = 'chipsrow';
  for (var i=0;i<list.length;i++){
    var b = document.createElement('button');
    b.textContent = list[i];
    if (selected.indexOf(list[i]) > -1) b.className = 'on';
    (function(el, v){
      b.onclick = function(){ el.classList.toggle('on'); cb(); };
    })(b, list[i]);
    wrap.appendChild(b);
  }
  return wrap;
}
function loadCfg(){
  api('/api/config').then(function(d){
    if (!d || !d.ok) return;
    STATE.cfg = d.cfg;
    renderCfg();
  });
}
function renderCfg(){
  var c = STATE.cfg;
  var protos = [['vless', c.ev !== 'no'], ['trojan', c.et === 'yes'], ['ss', c.ex === 'yes']];
  var pBox = $('fldProto'); pBox.innerHTML = '';
  for (var i=0;i<protos.length;i++){
    var l = document.createElement('label');
    l.innerHTML = '<span>' + protos[i][0].toUpperCase() + '</span><span class="sw' + (protos[i][1] ? ' on' : '') + '" data-p="' + protos[i][0] + '"></span>';
    pBox.appendChild(l);
  }
  var trBox = $('fldTr'); trBox.innerHTML = '';
  trBox.appendChild(chips(['ws','grpc','xhttp'], c.transports || [], function(){
    var on = trBox.querySelectorAll('.chipsrow button.on');
    STATE.cfg.transports = Array.prototype.map.call(on, function(b){ return b.textContent });
  }));
  var portsBox = $('fldPorts'); portsBox.innerHTML = '';
  portsBox.appendChild(chips([443,2053,2083,2087,2096,8443,2052,8080,8880].map(String), (c.ports || []).map(String), function(){
    var on = portsBox.querySelectorAll('.chipsrow button.on');
    STATE.cfg.ports = Array.prototype.map.call(on, function(b){ return Number(b.textContent) });
  }));
  $('lblTls').innerHTML = '<span>' + L.st_tls + '</span><span class="sw' + (c.tls !== 'no' ? ' on' : '') + '" id="swTls"></span>';
  $('lblFrag').innerHTML = '<span>TLS Fragment</span><span class="sw' + (c.fragment === 'yes' ? ' on' : '') + '" id="swFrag"></span>';
  $('lblEch').innerHTML = '<span>ECH</span><span class="sw' + (c.ech === 'yes' ? ' on' : '') + '" id="swEch"></span>';
  $('lblDis').innerHTML = '<span>' + L.st_disable + '</span><span class="sw' + (c.disabled ? ' on' : '') + '" id="swDis"></span>';
  $('f_fp').value = c.fp || 'chrome';
  $('f_sni').value = c.sni || '';
  $('f_path').value = c.path || '/?ed=2560';
  $('f_p').value = c.p || '';
  $('f_s').value = c.s || '';
  $('f_subname').value = c.subname || 'NEXUS';
  $('f_scu').value = c.scu || '';
  var irBox = $('fldIr'); irBox.innerHTML = '';
  var ir = [['ispMobile','همراه اول'],['ispUnicom','ایرانسل'],['ispTelecom','رایتل'],['ispMokhaberat','مخابرات'],['ispShatel','شاتل'],['ispAsiatek','آسیاتک'],['ispParsonline','پارس آنلاین'],['ispHiweb','هایوب']];
  for (var k=0;k<ir.length;k++){
    var l2 = document.createElement('label');
    l2.innerHTML = '<span>' + ir[k][1] + '</span><span class="sw' + (c[ir[k][0]] === 'yes' ? ' on' : '') + '" data-ir="' + ir[k][0] + '"></span>';
    irBox.appendChild(l2);
  }
}
function bindSw(id, get, set){
  var el = $(id);
  if (!el) return;
  el.onclick = function(){ el.classList.toggle('on'); set(el.classList.contains('on')); };
}
function collect(){
  var c = STATE.cfg || {};
  c.ev = protoOn('vless') ? 'yes' : 'no';
  c.et = protoOn('trojan') ? 'yes' : 'no';
  c.ex = protoOn('ss') ? 'yes' : 'no';
  var $_swTls = $('swTls'); c.tls = ($_swTls && $_swTls.classList && $_swTls.classList.contains('on')) ? 'yes' : 'no';
  var $_swFrag = $('swFrag'); c.fragment = ($_swFrag && $_swFrag.classList && $_swFrag.classList.contains('on')) ? 'yes' : 'no';
  var $_swEch = $('swEch'); c.ech = ($_swEch && $_swEch.classList && $_swEch.classList.contains('on')) ? 'yes' : 'no';
  var $_swDis = $('swDis'); c.disabled = $_swDis && $_swDis.classList && $_swDis.classList.contains('on');
  var $_fp = $('f_fp'); c.fp = $_fp ? $_fp.value : (c.fp || 'chrome');
  c.sni = $('f_sni').value.trim();
  c.path = $('f_path').value.trim() || '/?ed=2560';
  c.p = $('f_p').value.trim();
  c.s = $('f_s').value.trim();
  c.subname = $('f_subname').value.trim() || 'NEXUS';
  c.scu = $('f_scu').value.trim();
  var irs = $('fldIr').querySelectorAll('.sw');
  for (var i=0;i<irs.length;i++){
    if (irs[i].getAttribute('data-ir')) c[irs[i].getAttribute('data-ir')] = irs[i].classList.contains('on') ? 'yes' : 'no';
  }
  return c;
}
function protoOn(p){
  var els = $('fldProto').querySelectorAll('.sw');
  for (var i=0;i<els.length;i++){
    if (els[i].getAttribute('data-p') === p) return els[i].classList.contains('on');
  }
  return false;
}
function saveCfg(){
  var body = collect();
  fetch('/api/config?k=' + encodeURIComponent(KEY), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }).then(function(r){ return r.json() }).then(function(d){
    if (d && d.ok){ tx(L.saved); STATE.cfg = d.cfg; STATE.nodes = null; if ($('p-cfg').classList.contains('on')) loadNodes(); }
    else tx(L.err_save);
  }).catch(function(){ tx(L.err_save) });
}

/* ── lock ── */
function lock(){
  $('lockbtn').onclick = tryUnlock;
  $('lockkey').addEventListener('keydown', function(e){ if (e.key === 'Enter') tryUnlock(); });
}
function tryUnlock(){
  var k = $('lockkey').value.trim();
  if (!k) return;
  var btn = $('lockbtn'); btn.disabled = true; btn.textContent = L.wait;
  fetch('/api/unlock?k=' + encodeURIComponent(KEY), {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: k })
  }).then(function(r){ return r.json() }).then(function(d){
    if (d && d.ok){
      KEY = k;
      UNLOCKED = true;
      $('lock').classList.remove('on');
      tx(L.done);
      loadNodes(); loadCfg();
    } else {
      btn.textContent = L.unlock_btn || L.unlock;
      tx(L.wrong);
      $('lockkey').value = '';
    }
    btn.disabled = false;
  }).catch(function(){ btn.disabled = false; btn.textContent = L.unlock_btn || L.unlock; });
}

/* ── header / clock ── */
function clock(){
  var t = $('chipLive');
  setInterval(function(){
    if (!t) return;
    var d = new Date();
    t.textContent = 'LIVE · ' + ('0'+d.getHours()).slice(-2) + ':' + ('0'+d.getMinutes()).slice(-2) + ':' + ('0'+d.getSeconds()).slice(-2);
  }, 1000);
}

/* ── stars ── */
function stars(){
  var cv = $('stars');
  if (!cv || !cv.getContext) return;
  var ctx = cv.getContext('2d');
  cv.width = innerWidth; cv.height = innerHeight;
  var n = 130, arr = [];
  for (var i=0;i<n;i++) arr.push({ x: Math.random()*innerWidth, y: Math.random()*innerHeight, r: Math.random()*1.3+.3, s: Math.random()*.4+.08, tw: Math.random()*Math.PI*2 });
  (function draw(){
    ctx.clearRect(0,0,innerWidth,innerHeight);
    for (var i=0;i<n;i++){
      var p = arr[i];
      p.y -= p.s; p.tw += .05;
      if (p.y < -2){ p.y = innerHeight + 2; p.x = Math.random()*innerWidth; }
      var a = .4 + Math.sin(p.tw)*.35;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fillStyle = 'rgba(148,197,255,' + a + ')'; ctx.fill();
    }
    requestAnimationFrame(draw);
  })();
  addEventListener('resize', function(){ cv.width = innerWidth; cv.height = innerHeight; });
}


/* ── user profile ── */
var USER_PROFILE = {};
function loadUserProfile(){
  var uid = new URLSearchParams(location.search).get('uid') || '';
  fetch('/api/user-config?k=' + encodeURIComponent(KEY) + '&uid=' + encodeURIComponent(uid))
    .then(function(r){return r.json()}).then(function(d){
      if(d&&d.ok){ USER_PROFILE=d.ucfg||{}; renderUserProfile(); }
    }).catch(function(){});
}
function renderUserProfile(){
  var u=USER_PROFILE||{};
  var e1=$('f_uname'); if(e1) e1.value=u.name||'';
  var e2=$('f_utr'); if(e2) e2.value=u.transport||'';
  var e3=$('f_usni'); if(e3) e3.value=u.sni||'';
  var e4=$('f_upath'); if(e4) e4.value=u.path||'';
}
function saveUserProfile(){
  var uid = new URLSearchParams(location.search).get('uid') || '';
  var body={
    name: ($('f_uname')||{}).value||'',
    transport: ($('f_utr')||{}).value||'',
    sni: ($('f_usni')||{}).value||'',
    path: ($('f_upath')||{}).value||''
  };
  fetch('/api/user-config?k='+encodeURIComponent(KEY)+'&uid='+encodeURIComponent(uid),{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)
  }).then(function(r){return r.json()}).then(function(d){
    if(d&&d.ok){USER_PROFILE=d.ucfg; tx('پروفایل ذخیره شد ✓');}
    else tx('خطا');
  }).catch(function(){tx('خطا');});
}

/* ── init ── */
function init(){
  $('chipColo').textContent = VI.colo || '—';
  $('chipCc').textContent = VI.cc || '—';
  $('chipCity').textContent = VI.city || '—';
  $('abCc').textContent = VI.cc || '—';
  $('abHost').textContent = VI.host || '—';
  $('abZone').textContent = VI.zone || '—';
  i18n();
  renderHome();
  tabs();
  bindSw('swTls', null, function(v){});
  bindSw('swFrag', null, function(v){});
  bindSw('swEch', null, function(v){});
  bindSw('swDis', null, function(v){});
  $('saveCfg').onclick = saveCfg;
  $('smartBtn').onclick = function(){
    tx(L.wait);
    api('/api/info').then(function(){ STATE.nodes = null; loadNodes(); loadCfg(); tx(L.smart + ' ✓'); });
  };
  $('cta1').onclick = function(){ go('cfg'); };
  $('cta2').onclick = function(){ go('set'); };
  $('langBtn').onclick = function(){
    fetch('/api/config?k=' + encodeURIComponent(KEY)).then(function(r){ return r.json() }).then(function(d){
      if (!d || !d.ok) return;
      d.cfg.lang = d.cfg.lang === 'en' ? 'fa' : 'en';
      return fetch('/api/config?k=' + encodeURIComponent(KEY), {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(d.cfg)
      });
    }).then(function(){ location.reload(); });
  };
  var saveUserBtn = document.getElementById("saveUser"); if(saveUserBtn) saveUserBtn.onclick=saveUserProfile;
  loadUserProfile();
  lock();
  clock();
  stars();
  boot();
}
function go(t){
  var btns = document.querySelectorAll('#tabs button');
  for (var i=0;i<btns.length;i++){
    if (btns[i].getAttribute('data-t') === t){ btns[i].click(); return; }
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
})();
</script>
</body>
</html>`;
}


/* ───────────────────────────── ۱۰·۱ · موتور پروکسی WebSocket ────────────── */
function UUID2hex(bytes) {
  const h = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20,32);
}
function parseVLESS(buf, uuid) {
  if (buf.length < 18 || buf[0] !== 0) return null;
  const cid = UUID2hex(buf.slice(1,17));
  if (cid !== uuid) return null;
  const cmd = buf[17];
  const port = (buf[18]<<8)|buf[19];
  const atyp = buf[20];
  let addr='', hdrLen=21;
  if (atyp===1) { addr=[buf[21],buf[22],buf[23],buf[24]].join('.'); hdrLen=25; }
  else if (atyp===2) { const dl=buf[21]; addr=new TextDecoder().decode(buf.slice(22,22+dl)); hdrLen=22+dl; }
  else if (atyp===3) { const p=[]; for(let i=0;i<8;i++) p.push(((buf[21+i*2]<<8)|buf[22+i*2]).toString(16)); addr=p.join(':'); hdrLen=37; }
  return { cmd, addr, port, hdrLen, remaining: buf.slice(hdrLen) };
}
async function sha224hex(str) {
  const buf = await crypto.subtle.digest('SHA-224', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}
function parseTrojan(buf, uuid) {
  const txt = new TextDecoder().decode(buf);
  const CRLF_HASH = '\r\n';
  if (!buf.length || buf[0] !== 0x0D || buf[1] !== 0x0A) return null;
  let end = 2;
  while (end < buf.length - 1 && !(buf[end] === 0x0D && buf[end+1] === 0x0A)) end++;
  if (end >= buf.length - 1) return null;
  const hex56 = new TextDecoder().decode(buf.slice(2, end));
  if (hex56.length !== 56) return null;
  return { hex56, hdrEnd: end + 2 };
}
async function 代理(request, env, cfg) {
  const uuid = cfg.uuid || env.u || '';
  if (!uuid) return new Response('no uuid', { status: 403 });
  if (!connect) return new Response('proxy not available', { status: 503 });
  const pair = new WebSocketPair();
  const [client, server] = [pair[0], pair[1]];
  server.accept();
  let ready = false;
  server.addEventListener('message', async (ev) => {
    if (ready) return;
    ready = true;
    const buf = new Uint8Array(ev.data);
    /* ── VLESS ── */
    if (buf.length > 0 && buf[0] === 0) {
      const vless = parseVLESS(buf, uuid);
      if (!vless || vless.cmd !== 1) { try { server.close(1008, 'bad'); } catch {} return; }
      const proxyIP = cfg.p || '';
      const target = proxyIP || vless.addr;
      const targetPort = vless.port || 443;
      try {
        const tcp = connect({ hostname: target, port: targetPort });
        server.send(new Uint8Array([0, 0]));
        const writer = tcp.writable.getWriter();
        if (vless.remaining.length > 0) await writer.write(vless.remaining);
        server.addEventListener('message', async (e) => { try { await writer.write(new Uint8Array(e.data)); } catch {} });
        const reader = tcp.readable.getReader();
        (async () => { try { for (;;) { const { done, value } = await reader.read(); if (done) break; server.send(value); } } catch {} try { server.close(); } catch {} })();
        tcp.closed.then(() => { try { server.close(); } catch {} }).catch(() => { try { server.close(); } catch {} });
      } catch { try { server.close(1011, 'connect failed'); } catch {} }
      return;
    }
    /* ── Trojan ── */
    const trojan = parseTrojan(buf, uuid);
    if (trojan) {
      const expected = await sha224hex(uuid);
      if (trojan.hex56 !== expected) { try { server.close(1008, 'auth'); } catch {} return; }
      const afterHash = buf.slice(trojan.hdrEnd);
      if (afterHash.length < 6) { try { server.close(1008, 'short'); } catch {} return; }
      const cmd = afterHash[0];
      if (cmd !== 1) { try { server.close(1008, 'not-tcp'); } catch {} return; }
      const atyp = afterHash[1];
      let addr = '', addrLen = 0;
      if (atyp === 1) { addr = [afterHash[2], afterHash[3], afterHash[4], afterHash[5]].join('.'); addrLen = 4; }
      else if (atyp === 2) { const dl = afterHash[2]; addr = new TextDecoder().decode(afterHash.slice(3, 3+dl)); addrLen = dl + 1; }
      else if (atyp === 3) { const p = []; for (let i = 0; i < 8; i++) p.push(((afterHash[2+i*2]<<8)|afterHash[3+i*2]).toString(16)); addr = p.join(':'); addrLen = 16; }
      const port = (afterHash[2+addrLen] << 8) | afterHash[3+addrLen];
      const dataStart = trojan.hdrEnd + 4 + addrLen;
      const remaining = buf.slice(dataStart);
      const proxyIP = cfg.p || '';
      const target = proxyIP || addr;
      try {
        const tcp = connect({ hostname: target, port: port || 443 });
        server.send(new Uint8Array([1, 0, 0])); // trojan response header
        const writer = tcp.writable.getWriter();
        if (remaining.length > 0) await writer.write(remaining);
        server.addEventListener('message', async (e) => { try { await writer.write(new Uint8Array(e.data)); } catch {} });
        const reader = tcp.readable.getReader();
        (async () => { try { for (;;) { const { done, value } = await reader.read(); if (done) break; server.send(value); } } catch {} try { server.close(); } catch {} })();
        tcp.closed.then(() => { try { server.close(); } catch {} }).catch(() => { try { server.close(); } catch {} });
      } catch { try { server.close(1011, 'connect failed'); } catch {} }
      return;
    }
    try { server.close(1008, 'unsupported'); } catch {}
  });
  return new Response(null, { status: 101, webSocket: client });
}

/* ───────────────────────────── ۱۱ · مسیریاب ─────────────────────────────── */
async function 請求(request, env) {
  const url = new URL(request.url);
  const 路 = url.pathname;
  const 法 = request.method;
  const 頭 = request.headers;
  const host = url.host;
  const cfg = await 配置(env);
  const 鑰 = cfg.uuid || '';
  const seg = 路.split('/').filter(Boolean);
  const rootKey = seg[0] || '';
  const unlocked = 開(鑰, rootKey) || (cfg.d && 開(cfg.d, rootKey)) || !鑰;

  /* CORS — برای مصرف راحت ساب از داخل اپ‌ها */
  if (法 === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers': 'content-type,x-key',
        'access-control-max-age': '86400',
      },
    });
  }

  /* ── تشخیص WebSocket proxy ── */
  if (頭.get("upgrade") === "websocket") { return await 代理(request, env, cfg); }

    const info = 訪客(request, cfg);

  /* ── endpoints عمومی ── */
  if (路 === '/healthz' || 路 === '/__health') {
    return 響({ ok: true, v: VERSION, t: Date.now(), host, kv: !!KV(env) });
  }

  if (法 === 'GET' && (路 === '/sub' || (seg.length >= 2 && rootKey === (鑰 || cfg.d) && seg[1] === 'sub'))) {
    return await 給Sub(request, env, cfg, info, host);
  }

  if (法 === 'GET' && 路 === '/api/info') {
    return 響({ ok: true, v: VERSION, host, cc: info.cc, colo: info.colo, city: info.city, lat: info.lat, lon: info.lon, zone: info.zone, keySet: !!鑰, kv: !!KV(env), ts: Date.now(), name: cfg.name, tz: new Date().getTimezoneOffset() });
  }

  if (法 === 'GET' && 路 === '/api/map') {
    return 響({ ok: true, pops: 站點, visitor: info, host });
  }

  if (法 === 'GET' && 路 === '/api/nodes') {
    const k = 觸('k', url, 頭);
    if (鑰 && !開(鑰, k)) return 誤('forbidden', 403);
    if (cfg.disabled) return 誤('disabled', 403);
    const r = 節點集(cfg, info, host);
    const links = {
      base64: 樣式B64(r.nodes),
      plain: r.nodes.map((x) => x.line).join('\n'),
      clash: 樣式Clash(r.nodes, cfg),
      singbox: 樣式Sing(r.nodes, cfg),
      sub: `${url.origin}/${鑰 ? 鑰 + '/' : ''}sub`,
    };
    return 響({ ok: true, nodes: r.nodes, links, rtt: 最快(info), frag: r.frag, zone: info.zone });
  }

  if (路 === '/api/config') {
    const k = 觸('k', url, 頭);
    if (鑰 && !開(鑰, k)) return 誤('forbidden', 403);
    if (法 === 'GET') {
      const safe = { ...cfg };
      delete safe.admin; delete safe.ADMIN; delete safe.password;
      return 響({ ok: true, cfg: safe });
    }
    if (法 === 'POST') {
      let body = {};
      try { body = await request.json(); } catch { /* ignore */ }
      const next = { ...預設, ...cfg, ...body };
      /* کلیدها و فیلدهای محافظت‌شده هرگز از بدنه بازنویسی نمی‌شوند */
      if (env.u) next.uuid = env.u;
      if (env.d) next.d = env.d;
      next.disabled = !!next.disabled;
      const ok = await 寫配置(env, next);
      return 響({ ok: true, saved: ok, cfg: next });
    }
    return 誤('method', 405);
  }

  if (法 === 'POST' && 路 === '/api/unlock') {
    let body = {};
    try { body = await request.json(); } catch { /* ignore */ }
    const k = String(body.key || '').trim();
    return 響({ ok: !鑰 || 密時(鑰, k) });
  }


  if (路 === '/api/user-config') {
    const k = 觸('k', url, 頭);
    if (鑰 && !開(鑰, k)) return 誤('forbidden', 403);
    const uid = url.searchParams.get('uid') || '';
    const ukey = uid ? 'u_' + uid : 'u_default';
    if (法 === 'GET') {
      const raw = await 取(env, ukey);
      const ucfg = raw ? JSON.parse(raw) : {};
      return 響({ ok: true, ucfg });
    }
    if (法 === 'POST') {
      let body = {};
      try { body = await request.json(); } catch {}
      await 放(env, ukey, JSON.stringify(body));
      return 響({ ok: true, ucfg: body });
    }
    return 誤('method', 405);
  }

  if (路.startsWith('/api/')) return 誤('not found', 404);

  /* ── صفحهٔ اصلی ── */
  if (法 === 'GET') {
    const 開く = unlocked && !cfg.disabled;
    const L = LABELS[cfg.lang === 'en' ? 'en' : 'fa'];
    return new Response(頁(request, env, cfg, info, 開く, L), {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  return 誤('not found', 404);
}

/* ── ساب‌نویس ── */
async function 給Sub(request, env, cfg, info, host) {
  if (cfg.disabled) return new Response('403 — worker disabled', { status: 403 });
  const url = new URL(request.url);
  const target = (url.searchParams.get('target') || url.searchParams.get('format') || '').toLowerCase();
  const ua = String(request.headers.get('user-agent') || '').toLowerCase();
  const r = 節點集(cfg, info, host);
  let ct = 'text/plain; charset=utf-8';
  let body = '';
  let f = target;
  if (!f) {
    if (ua.includes('clash') || ua.includes('stash') || ua.includes('mihomo')) f = 'clash';
    else if (ua.includes('sing-box') || ua.includes('sfa') || ua.includes('karing')) f = 'singbox';
    else f = 'base64';
  }
  if (f === 'clash') { body = 樣式Clash(r.nodes, cfg); ct = 'application/yaml; charset=utf-8'; }
  else if (f === 'singbox' || f === 'sing-box') { body = 樣式Sing(r.nodes, cfg); ct = 'application/json; charset=utf-8'; }
  else if (f === 'plain') { body = r.nodes.map((x) => x.line).join('\n'); }
  else { body = 樣式B64(r.nodes); }
  const name = `${cfg.subname || 'NEXUS'}-${info.zone}`.replace(/[^\w-]/g, '_');
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': ct,
      'cache-control': 'no-store',
      'content-disposition': `attachment; filename="${name}.txt"`,
      'subscription-userinfo': 'upload=0; download=0; total=0',
      'profile-update-interval': '12',
      'access-control-allow-origin': '*',
    },
  });
}

/* ───────────────────────────── ۱۲ · قلاب ورودی ──────────────────────────── */
export default {
  async fetch(request, env) {
    try {
      /* خودآزمایی: اگر محیط مرورگر/ورکر نیست، پاسخ فریبنده */
      if (typeof TextEncoder === 'undefined' || typeof crypto === 'undefined' || !crypto.getRandomValues) {
        return new Response('ok', { status: 200 });
      }
      return await 請求(request, env);
    } catch (e) {
      return 響({ ok: false, error: String((e && e.message) || e) }, 500);
    }
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
   ▓ ناحیهٔ طعمه — این توابع هرگز اجرا نمی‌شوند؛ فقط برای گمراه‌کردن تحلیل‌گر
   ▓ (decoy zone — dead code, never invoked)
   ═══════════════════════════════════════════════════════════════════════════ */
function 量子糾纏(a, b) {
  /* شبیه‌سازی فروپاشی — هیچ‌وقت صدا زده نمی‌شود */
  const 場 = (a & 0x55) ^ (b & 0xaa);
  return 場 === 0 ? 'superposition' : 'collapsed';
}
function 時間旅行(n) {
  let t = n;
  for (let i = 0; i < 7; i++) t = (t * 31 + 17) % 9973;
  return t;
}
function 隱形斗篷(s) {
  let o = '';
  for (let i = s.length - 1; i >= 0; i--) o += s[i];
  return o;
}
function 乙太信標(payload) {
  /* telemetry beacon — intentionally inert */
  const seed = 哈(JSON.stringify(payload || {}));
  return 'beacon:' + seed + ':noop';
}
const 虛假金鑰 = ['7f9c', 'a3e1', 'deadbeef', 'c0ffee', '0xNEXUS'];
const 幻影 = {
  get 配置() { return 虛假金鑰.join('|'); },
  set 配置(v) { return v; },
};
/* ═══════════════════════════════════════════════════════════════════════════ */
