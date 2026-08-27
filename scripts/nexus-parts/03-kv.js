/* ══════════════════════════════════════════════════════════════════════════════
   ▓ KV Configuration Management
   ══════════════════════════════════════════════════════════════════════════════ */
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

const CONFIG_KEY = 'c';

const 預設 = {
  name: 'NEXUS', lang: 'fa', theme: 'dark', uuid: '', d: '',
  p: '', yx: '', yxURL: '', s: '', scu: 'https://url.v1.mk/sub',
  transports: ['ws', 'grpc', 'xhttp'], protocols: [],
  ports: [443, 2053, 2083, 2087, 2096, 8443],
  tls: 'yes', sni: '', fp: 'chrome', path: '/?ed=2560', tp: '', flow: '',
  fragment: 'no', ech: 'no', alpn: '', customDNS: 'https://223.5.5.5/dns-query',
  customECHDomain: 'cloudflare-ech.com',
  dkby: 'no', rm: 'yes', qj: 'yes', ae: '',
  epd: 'yes', epi: 'yes', egi: 'no', ena: 'yes', ipv4: 'yes', ipv6: 'yes',
  ispMobile: 'yes', ispUnicom: 'yes', ispTelecom: 'yes',
  ispMokhaberat: 'yes', ispShatel: 'yes', ispAsiatek: 'yes',
  ispParsonline: 'yes', ispHiweb: 'yes',
  subname: 'NEXUS', ev: 'yes', et: 'yes', ex: 'yes',
  homepage: '', map: 'yes', rtt: 300, keep: 24, disabled: false,
};

async function 讀配置(env) {
  const raw = await 取(env, CONFIG_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function 寫配置(env, cfg) {
  return await 放(env, CONFIG_KEY, JSON.stringify(cfg));
}

function _b(v) {
  /* normalize yes/no config booleans */
  return v === 'yes' || v === true || v === 1;
}

async function 配置(env) {
  const kv = await 讀配置(env);
  const c = { ...預設, ...(kv || {}) };
  /* env overrides — highest priority */
  if (env.u) c.uuid = env.u;
  if (env.d) c.d = env.d;
  if (env.p || env.P || env.PROXYIP) c.p = env.p || env.P || env.PROXYIP;
  if (env.ADMIN || env.admin) c.admin = env.ADMIN || env.admin;
  c.disabled = !!c.disabled;
  return c;
}
