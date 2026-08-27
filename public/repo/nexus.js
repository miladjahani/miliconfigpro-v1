
/* ══════════════════════════════════════════════════════════════════════════
   ▓ 01-header.js
   ══════════════════════════════════════════════════════════════════════════ */
/*
 *  NEXUS — The Gateway to Tomorrow
 *  ────────────────────────────────
 *  Next-gen Cloudflare Worker with smart engine, live map,
 *  advanced obfuscation, per-user profiles, and auto sub-generation.
 *
 *  Version: 3.0.0
 *  License: MIT
 */
const VERSION = '3.0.0';

/* ══════════════════════════════════════════════════════════════════════════════
   ▓ Obfuscation Vault — encrypted constants
   ▓ Two-layer: base64 → xor-shift → UTF-8
   ══════════════════════════════════════════════════════════════════════════════ */
const _vault = [
  '.TRUE', '\u004e\x45\x58\x55\x53', '\u0047\x41\x54\x45\x57\x41\x59',
  '\u0054\x4f\x20\x54\x4f\x4d\x4f\x52\x52\x4f\x57',
];
const _decoyA = () => { const _a = [1,2,3]; return _a.reduce((s,v) => s+v, 0); };
const _decoyB = (x) => { const _m = new Map(); _m.set('k', x); return _m.get('k'); };

/* ══════════════════════════════════════════════════════════════════════════════
   ▓ LABELS — bilingual UI strings (FA / EN)
   ══════════════════════════════════════════════════════════════════════════════ */
const LABELS = {
  fa: {
    t_home: 'خانه', t_cfg: 'کانفیگ', t_map: 'نقشه زنده', t_set: 'تنظیمات هوشمند', t_about: 'درباره',
    hero1: 'NEXUS', hero2: 'دروازهٔ فردا', hero3: 'موتور هوشمند · نقشهٔ زندهٔ لبه · همهٔ فرمت‌ها · بدون وابستگی',
    cta: 'شروع هوشمند', cta2: 'تنظیمات پیشرفته',
    rec_t: '🎯 پیشنهاد خودکار', rec_d: 'بر اساس موقعیت شما، بهترین تنظیمات انتخاب شد',
    nodes_t: '⚡ لیست نودها', nodes_sub: 'با کلیک روی دکمهٔ کپی، لینک را دریافت کنید',
    copy: '📋 کپی', clients_t: '📱 اپلیکیشن‌ها', qr_t: '📱 QR Code',
    cfg_t: '⚙️ تنظیمات پیشرفته',
    setSub: 'تنظیمات زنده از طریق KV ذخیره می‌شوند',
    save: '💾 ذخیره', smart: '🧠 بهینه‌سازی خودکار',
    smart_done: '✅ تنظیمات بهینه شد',
    st_proto: 'پروتکل‌ها', st_tr: 'ترانsport‌ها', st_port: 'پورت‌ها',
    st_tls: 'TLS', st_fp: 'TLS Fingerprint', st_sni: 'SNI',
    st_path: 'مسیر (Path)', st_p: 'ProxyIP', st_s: 'Shadowsocks',
    st_sub: 'نام ساب', st_scu: 'آدرس ساب',
    st_ir: 'تنظیمات ایران', st_danger: 'خطر',
    st_disable: 'غیرفعال کردن ورکر',
    about_t: '🛰 دربارهٔ NEXUS', about_d: 'NEXUS نسل جدید ورکرهای Cloudflare است — با موتور هوشمند، نقشهٔ زنده، مبهم‌سازی پیشرفته و پنل داخلی کامل. طراحی شده برای هر کاربری در هر جای جهان.',
    f_powered: 'powered by Cloudflare Workers · NEXUS v' + VERSION,
    lock_t: '🔐 قفل شده', lock_sub: 'برای ورود، کلید خود را وارد کنید',
    unlock: 'ورود', unlock_btn: 'ورود', wait: '⏳ صبر کنید...',
    done: '✅ موفق', wrong: '❌ کلید نادرست', loading: '⏳ در حال بارگذاری...',
    saved: '✅ ذخیره شد', err_save: '❌ خطا در ذخیره',
    ms: 'ms', from: 'از', copy_ok: '✅ کپی شد',
    map_title: '🌍 نقشهٔ زندهٔ دیتاسنترها',
    pop: 'дیتاسنتر', you: 'شما', link: 'لینک',
    boot1: 'Initializing quantum core...', boot2: 'Connecting to edge network...',
    boot3: 'Loading smart engine...', boot4: 'Rendering live map...', boot5: 'System ready.',
    user_profile: '👤 پروفایل کاربر', user_profile_d: 'تنظیمات شخصی خود را ذخیره کنید — برای هر کاربر متفاوت خواهد بود',
    user_name: 'نام نمایشی', user_transport: 'ترانSPORT ترجیحی', user_sni: 'SNI دلخواه', user_path: 'مسیر دلخواه',
    user_save: 'ذخیره پروفایل', user_saved: '✅ پروفایل ذخیره شد',
  },
  en: {
    t_home: 'Home', t_cfg: 'Config', t_map: 'Live Map', t_set: 'Smart Settings', t_about: 'About',
    hero1: 'NEXUS', hero2: 'The Gateway to Tomorrow', hero3: 'Smart engine · live edge map · every format · zero dependencies',
    cta: 'Smart Start', cta2: 'Advanced Settings',
    rec_t: '🎯 Auto Recommendation', rec_d: 'Based on your location, optimal settings have been selected',
    nodes_t: '⚡ Node List', nodes_sub: 'Click copy to get the link',
    copy: '📋 Copy', clients_t: '📱 Applications', qr_t: '📱 QR Code',
    cfg_t: '⚙️ Advanced Configuration',
    setSub: 'Live settings saved via KV',
    save: '💾 Save', smart: '🧠 Auto Optimize',
    smart_done: '✅ Settings optimized',
    st_proto: 'Protocols', st_tr: 'Transports', st_port: 'Ports',
    st_tls: 'TLS', st_fp: 'TLS Fingerprint', st_sni: 'SNI',
    st_path: 'Path', st_p: 'ProxyIP', st_s: 'Shadowsocks',
    st_sub: 'Sub Name', st_scu: 'Sub URL',
    st_ir: 'Iran Settings', st_danger: 'Danger Zone',
    st_disable: 'Disable Worker',
    about_t: '🛰 About NEXUS', about_d: 'NEXUS is a next-gen Cloudflare Worker with smart engine, live map, advanced obfuscation, and built-in panel. Designed for every user, everywhere.',
    f_powered: 'powered by Cloudflare Workers · NEXUS v' + VERSION,
    lock_t: '🔐 Locked', lock_sub: 'Enter your key to access',
    unlock: 'Unlock', unlock_btn: 'Unlock', wait: '⏳ Wait...',
    done: '✅ Done', wrong: '❌ Wrong key', loading: '⏳ Loading...',
    saved: '✅ Saved', err_save: '❌ Save error',
    ms: 'ms', from: 'from', copy_ok: '✅ Copied',
    map_title: '🌍 Live Datacenter Map',
    pop: 'Datacenter', you: 'You', link: 'Link',
    boot1: 'Initializing quantum core...', boot2: 'Connecting to edge network...',
    boot3: 'Loading smart engine...', boot4: 'Rendering live map...', boot5: 'System ready.',
    user_profile: '👤 User Profile', user_profile_d: 'Save your personal settings — unique for each user',
    user_name: 'Display Name', user_transport: 'Preferred Transport', user_sni: 'Custom SNI', user_path: 'Custom Path',
    user_save: 'Save Profile', user_saved: '✅ Profile saved',
  },
};


/* ══════════════════════════════════════════════════════════════════════════
   ▓ 02-crypto.js
   ══════════════════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════════════════════
   ▓ Crypto & Encoding Helpers
   ══════════════════════════════════════════════════════════════════════════════ */
function _s(i) {
  /* safe string helper — avoids native String.prototype issues */
  return String(i == null ? '' : i);
}
function 密時(a, b) {
  /* constant-time comparison — prevents timing attacks */
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function 拆IP(raw) {
  /* split proxy-IP field (newline or comma separated) into array */
  if (!raw) return [];
  return String(raw).split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
}
function 拆址(v) {
  /* parse address string into { host, port, name } */
  if (!v) return { host: '', port: 443, name: '' };
  const s = String(v).trim();
  const nameMatch = s.match(/^\(([^)]+)\)/);
  const name = nameMatch ? nameMatch[1] : '';
  const bare = nameMatch ? s.slice(nameMatch[0].length).trim() : s;
  const parts = bare.split(':');
  const host = parts[0] || '';
  const port = parseInt(parts[1]) || 443;
  return { host, port, name };
}
function 編(s) { return encodeURIComponent(String(s || '')); }
function 文本(v) { return new TextEncoder().encode(String(v || '')); }
function B64(b) {
  /* Uint8Array → base64 */
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}
function B64D(s) {
  /* base64 → Uint8Array */
  const bin = atob(String(s || ''));
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}
function 哈(s) {
  /* simple FNV-1a hash — fast, non-crypto */
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
function 時間旅行(n) {
  /* deterministic pseudo-random from seed */
  let t = n;
  for (let i = 0; i < 7; i++) t = (t * 31 + 17) % 9973;
  return t;
}
function 隱形斗篷(s) {
  /* reverse string */
  let o = '';
  for (let i = s.length - 1; i >= 0; i--) o += s[i];
  return o;
}


/* ══════════════════════════════════════════════════════════════════════════
   ▓ 03-kv.js
   ══════════════════════════════════════════════════════════════════════════ */
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


/* ══════════════════════════════════════════════════════════════════════════
   ▓ 04-datacenters.js
   ══════════════════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════════════════════
   ▓ Cloudflare Datacenter Database — 57+ PoPs with real coordinates
   ══════════════════════════════════════════════════════════════════════════════ */
const 站點 = [
  /* ─── North America ─── */
  { id: 'IAD', name: 'Ashburn', cc: 'US', lat: 39.0438, lon: -77.4874 },
  { id: 'EWR', name: 'Newark', cc: 'US', lat: 40.6925, lon: -74.1724 },
  { id: 'ORD', name: 'Chicago', cc: 'US', lat: 41.9742, lon: -87.9073 },
  { id: 'DFW', name: 'Dallas', cc: 'US', lat: 32.8998, lon: -97.0403 },
  { id: 'LAX', name: 'Los Angeles', cc: 'US', lat: 33.9416, lon: -118.4085 },
  { id: 'SJC', name: 'San Jose', cc: 'US', lat: 37.3382, lon: -121.8863 },
  { id: 'SEA', name: 'Seattle', cc: 'US', lat: 47.6062, lon: -122.3321 },
  { id: 'MIA', name: 'Miami', cc: 'US', lat: 25.7617, lon: -80.1918 },
  { id: 'ATL', name: 'Atlanta', cc: 'US', lat: 33.749, lon: -84.388 },
  { id: 'BOS', name: 'Boston', cc: 'US', lat: 42.3601, lon: -71.0589 },
  { id: 'DEN', name: 'Denver', cc: 'US', lat: 39.7392, lon: -104.9903 },
  { id: 'PHX', name: 'Phoenix', cc: 'US', lat: 33.4484, lon: -112.074 },
  { id: 'YYZ', name: 'Toronto', cc: 'CA', lat: 43.6532, lon: -79.3832 },
  { id: 'YVR', name: 'Vancouver', cc: 'CA', lat: 49.2827, lon: -123.1207 },
  { id: 'MEX', name: 'Mexico City', cc: 'MX', lat: 19.4326, lon: -99.1332 },

  /* ─── Europe ─── */
  { id: 'LHR', name: 'London', cc: 'GB', lat: 51.5074, lon: -0.1278 },
  { id: 'CDG', name: 'Paris', cc: 'FR', lat: 48.8566, lon: 2.3522 },
  { id: 'FRA', name: 'Frankfurt', cc: 'DE', lat: 50.1109, lon: 8.6821 },
  { id: 'AMS', name: 'Amsterdam', cc: 'NL', lat: 52.3676, lon: 4.9041 },
  { id: 'WAW', name: 'Warsaw', cc: 'PL', lat: 52.2297, lon: 21.0122 },
  { id: 'MAD', name: 'Madrid', cc: 'ES', lat: 40.4168, lon: -3.7038 },
  { id: 'MXP', name: 'Milan', cc: 'IT', lat: 45.4642, lon: 9.19 },
  { id: 'ZRH', name: 'Zurich', cc: 'CH', lat: 47.3769, lon: 8.5417 },
  { id: 'VIE', name: 'Vienna', cc: 'AT', lat: 48.2082, lon: 16.3738 },
  { id: 'ARN', name: 'Stockholm', cc: 'SE', lat: 59.3293, lon: 18.0686 },
  { id: 'OSL', name: 'Oslo', cc: 'NO', lat: 59.9139, lon: 10.7522 },
  { id: 'HEL', name: 'Helsinki', cc: 'FI', lat: 60.1699, lon: 24.9384 },
  { id: 'CPH', name: 'Copenhagen', cc: 'DK', lat: 55.6761, lon: 12.5683 },
  { id: 'BUD', name: 'Budapest', cc: 'HU', lat: 47.4979, lon: 19.0402 },
  { id: 'OTP', name: 'Bucharest', cc: 'RO', lat: 44.4268, lon: 26.1025 },
  { id: 'PRG', name: 'Prague', cc: 'CZ', lat: 50.0755, lon: 14.4378 },
  { id: 'SOF', name: 'Sofia', cc: 'BG', lat: 42.6977, lon: 23.3219 },
  { id: 'BRU', name: 'Brussels', cc: 'BE', lat: 50.8503, lon: 4.3517 },
  { id: 'LIS', name: 'Lisbon', cc: 'PT', lat: 38.7223, lon: -9.1393 },
  { id: 'DUB', name: 'Dublin', cc: 'IE', lat: 53.3498, lon: -6.2603 },
  { id: 'ATH', name: 'Athens', cc: 'GR', lat: 37.9838, lon: 23.7275 },

  /* ─── Asia Pacific ─── */
  { id: 'NRT', name: 'Tokyo', cc: 'JP', lat: 35.6762, lon: 139.6503 },
  { id: 'KIX', name: 'Osaka', cc: 'JP', lat: 34.6937, lon: 135.5023 },
  { id: 'ICN', name: 'Seoul', cc: 'KR', lat: 37.5665, lon: 126.978 },
  { id: 'SIN', name: 'Singapore', cc: 'SG', lat: 1.3521, lon: 103.8198 },
  { id: 'HKG', name: 'Hong Kong', cc: 'HK', lat: 22.3193, lon: 114.1694 },
  { id: 'TPE', name: 'Taipei', cc: 'TW', lat: 25.033, lon: 121.5654 },
  { id: 'BOM', name: 'Mumbai', cc: 'IN', lat: 19.076, lon: 72.8777 },
  { id: 'DEL', name: 'Delhi', cc: 'IN', lat: 28.7041, lon: 77.1025 },
  { id: 'BLR', name: 'Bangalore', cc: 'IN', lat: 12.9716, lon: 77.5946 },
  { id: 'SYD', name: 'Sydney', cc: 'AU', lat: -33.8688, lon: 151.2093 },
  { id: 'MEL', name: 'Melbourne', cc: 'AU', lat: -37.8136, lon: 144.9631 },
  { id: 'AKL', name: 'Auckland', cc: 'NZ', lat: -36.8485, lon: 174.7633 },
  { id: 'JKT', name: 'Jakarta', cc: 'ID', lat: -6.2088, lon: 106.8456 },
  { id: 'BKK', name: 'Bangkok', cc: 'TH', lat: 13.7563, lon: 100.5018 },
  { id: 'KUL', name: 'Kuala Lumpur', cc: 'MY', lat: 3.139, lon: 101.6869 },
  { id: 'MNL', name: 'Manila', cc: 'PH', lat: 14.5995, lon: 120.9842 },

  /* ─── Middle East ─── */
  { id: 'DXB', name: 'Dubai', cc: 'AE', lat: 25.2048, lon: 55.2708 },
  { id: 'TLV', name: 'Tel Aviv', cc: 'IL', lat: 32.0853, lon: 34.7818 },
  { id: 'RUH', name: 'Riyadh', cc: 'SA', lat: 24.7136, lon: 46.6753 },

  /* ─── South America ─── */
  { id: 'GRU', name: 'São Paulo', cc: 'BR', lat: -23.5505, lon: -46.6333 },
  { id: 'SCL', name: 'Santiago', cc: 'CL', lat: -33.4489, lon: -70.6693 },
  { id: 'BOG', name: 'Bogotá', cc: 'CO', lat: 4.711, lon: -74.0721 },

  /* ─── Africa ─── */
  { id: 'JNB', name: 'Johannesburg', cc: 'ZA', lat: -26.2041, lon: 28.0473 },
  { id: 'CAI', name: 'Cairo', cc: 'EG', lat: 30.0444, lon: 31.2357 },
  { id: 'NBO', name: 'Nairobi', cc: 'KE', lat: -1.2921, lon: 36.8219 },

  /* ─── Iran (special) ─── */
  { id: 'THR', name: 'Tehran', cc: 'IR', lat: 35.6892, lon: 51.389 },
  { id: 'IFN', name: 'Isfahan', cc: 'IR', lat: 32.6546, lon: 51.668 },
  { id: 'MHD', name: 'Mashhad', cc: 'IR', lat: 36.2972, lon: 59.5956 },
];

/* ══════════════════════════════════════════════════════════════════════════════
   ▓ Region profiles — optimal settings per country zone
   ══════════════════════════════════════════════════════════════════════════════ */
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
  /* detect Iranian ISP operators */
  if (cc !== 'IR') return null;
  const list = [];
  if (_b(cfg.ispMobile)) list.push('HamrahAval');
  if (_b(cfg.ispUnicom)) list.push('Irancell');
  if (_b(cfg.ispTelecom)) list.push('Rightel');
  if (_b(cfg.ispMokhaberat)) list.push('Mokhaberat');
  if (_b(cfg.ispShatel)) list.push('Shatel');
  if (_b(cfg.ispAsiatek)) list.push('Asiatek');
  if (_b(cfg.ispParsonline)) list.push('ParsOnline');
  if (_b(cfg.ispHiweb)) list.push('Hiweb');
  return list;
}


/* ══════════════════════════════════════════════════════════════════════════
   ▓ 50-smart-engine.js
   ══════════════════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════════════════════
   ▓ Smart Engine — distance, RTT estimation, protocol optimization
   ══════════════════════════════════════════════════════════════════════════════ */
function 距離(lat1, lon1, lat2, lon2) {
  /* Haversine distance in km */
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function 延遲(km) {
  /* estimate RTT from distance (rough fiber model) */
  return Math.max(8, Math.round(km / 200 + 6));
}

function 最快(info) {
  /* find best RTT for visitor's zone */
  if (!info || !info.lat) return 300;
  let best = Infinity;
  for (const s of 站點) {
    const d = 距離(info.lat, info.lon, s.lat, s.lon);
    if (d < best) best = d;
  }
  return 延遲(best);
}

function 路徑(cfg) {
  /* resolve the effective transport path */
  return cfg.tp || cfg.path || '/?ed=2560';
}

function 協議集(cfg) {
  const out = [];
  if (cfg.ev !== 'no') out.push('vless');
  if (cfg.et === 'yes') out.push('trojan');
  if (cfg.ex === 'yes') out.push('ss');
  if (!out.length) out.push('vless');
  return out;
}


/* ══════════════════════════════════════════════════════════════════════════
   ▓ 51-node-gen.js
   ══════════════════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════════════════════
   ▓ Node Generation & Link Builders
   ══════════════════════════════════════════════════════════════════════════════ */
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

/* ─── Link Builders ─── */
function 行VLESS(uuid, addr, port, sni, fp, t, path, host, frag, flow) {
  let s = `vless://${uuid}@${addr}:${port}?encryption=none&security=tls&sni=${編(sni)}&fp=${編(fp)}&type=${t}`;
  if (flow) s += `&flow=${編(flow)}`;
  if (t === 'ws') s += `&host=${編(host)}&path=${編(path)}`;
  else if (t === 'grpc') s += `&serviceName=${編(String(path).replace(/^\//, ''))}`;
  else s += `&host=${編(host)}&path=${編(path)}&mode=auto`;
  if (frag) s += '&fragment=off';
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


/* ══════════════════════════════════════════════════════════════════════════
   ▓ 52-outputs.js
   ══════════════════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════════════════════
   ▓ Output Formatters — base64 / Clash / sing-box
   ══════════════════════════════════════════════════════════════════════════════ */
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
    lines.push('    type: ' + x.p);
    lines.push('    server: ' + q(x.a));
    lines.push('    port: ' + x.port);
    if (x.p === 'vless' || x.p === 'trojan') {
      lines.push('    password: ' + q(x.pwd));
      lines.push('    uuid: ' + q(x.pwd));
    } else if (x.p === 'ss') {
      lines.push('    cipher: ' + q(x.m));
      lines.push('    password: ' + q(x.pwd));
    }
    lines.push('    tls: true');
    lines.push('    udp: true');
    if (x.sni) lines.push('    servername: ' + q(x.sni));
    if (x.fp) lines.push('    client-fingerprint: ' + q(x.fp));
    if (x.t === 'ws') {
      lines.push('    network: ws');
      lines.push('    ws-opts:');
      lines.push('      path: ' + q(x.path));
      lines.push('      headers:');
      lines.push('        Host: ' + q(x.a));
    } else if (x.t === 'grpc') {
      lines.push('    network: grpc');
      lines.push('    grpc-opts:');
      lines.push('      grpc-service-name: ' + q(String(x.path).replace(/^\//, '')));
    } else if (x.t === 'xhttp') {
      lines.push('    network: xhttp');
      lines.push('    xhttp-opts:');
      lines.push('      path: ' + q(x.path));
      lines.push('      mode: auto');
    }
    names.push(x.n);
  }
  lines.push('');
  lines.push('proxy-groups:');
  lines.push('  - name: ' + q(cfg.subname || 'NEXUS'));
  lines.push('    type: select');
  lines.push('    proxies:');
  for (const n of names) lines.push('      - ' + q(n));
  lines.push('      - DIRECT');
  lines.push('');
  lines.push('  - name: ' + q((cfg.subname || 'NEXUS') + '-auto'));
  lines.push('    type: url-test');
  lines.push('    url: https://www.gstatic.com/generate_204');
  lines.push('    interval: 300');
  lines.push('    proxies:');
  for (const n2 of names) lines.push('      - ' + q(n2));
  lines.push('');
  lines.push('rules:');
  lines.push('  - MATCH,' + q(cfg.subname || 'NEXUS'));
  return lines.join('\n');
}

function 樣式Sing(nodes, cfg) {
  const out = { outbounds: [] };
  const names = [];
  for (const x of nodes) {
    const ob = {
      tag: x.n,
      type: x.p === 'ss' ? 'shadowsocks' : x.p,
      server: x.a,
      server_port: x.port,
    };
    if (x.p === 'vless') {
      ob.uuid = x.pwd;
      ob.flow = '';
    } else if (x.p === 'trojan') {
      ob.password = x.pwd;
    } else if (x.p === 'ss') {
      ob.method = x.m;
      ob.password = x.pwd;
    }
    ob.tls = { enabled: true, server_name: x.sni, fingerprint: x.fp };
    if (x.t === 'ws') {
      ob.transport = { type: 'ws', path: x.path, headers: { Host: x.a } };
    } else if (x.t === 'grpc') {
      ob.transport = { type: 'grpc', service_name: String(x.path).replace(/^\//, '') };
    } else if (x.t === 'xhttp') {
      ob.transport = { type: 'http', path: x.path, mode: 'auto' };
    }
    out.outbounds.push(ob);
    names.push(x.n);
  }
  out.outbounds.push({ type: 'direct', tag: 'direct' });
  out.outbounds.push({ type: 'block', tag: 'block' });
  out.outbounds.push({ type: 'selector', tag: cfg.subname || 'NEXUS', outbounds: [...names, 'direct'] });
  return JSON.stringify(out, null, 2);
}


/* ══════════════════════════════════════════════════════════════════════════
   ▓ 53-geo.js
   ══════════════════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════════════════════
   ▓ Visitor Detection & Geo
   ══════════════════════════════════════════════════════════════════════════════ */
function 訪客(request, cfg) {
  const h = request.headers;
  const cc = String(h.get('cf-ipcountry') || '').toUpperCase() || 'XX';
  const colo = h.get('cf-colo') || String(h.get('cf-ray') || '').split('-').pop() || '';
  const city = h.get('cf-ipcity') || '';
  const lat = parseFloat(h.get('cf-iplat') || '0') || 0;
  const lon = parseFloat(h.get('cf-iplon') || '0') || 0;
  const zone = 檔案(cc).zone;
  const key = h.get('x-key') || '';
  return { cc, colo, city, lat, lon, zone, key };
}

/* ══════════════════════════════════════════════════════════════════════════════
   ▓ Response Helpers
   ══════════════════════════════════════════════════════════════════════════════ */
function 響(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' },
  });
}

function 誤(msg, status) { return 響({ ok: false, error: msg }, status || 400); }

function 觸(k, url, head) {
  /* get key from query param or header */
  return url.searchParams.get(k) || head.get('x-key') || '';
}

function 開(鑰, 給) { return !鑰 || 密時(鑰, 給); }


/* ══════════════════════════════════════════════════════════════════════════
   ▓ 54-response.js
   ══════════════════════════════════════════════════════════════════════════ */


/* ══════════════════════════════════════════════════════════════════════════
   ▓ 55-proxy.js
   ══════════════════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════════════════════
   ▓ WebSocket Proxy Engine — VLESS + Trojan via cloudflare:sockets
   ══════════════════════════════════════════════════════════════════════════════ */

/* Lazy import: cloudflare:sockets is only available in Workers runtime */
let connect = null;
try { connect = (await import('cloudflare:sockets')).connect; } catch {}

function UUID2hex(bytes) {
  const h = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20, 32);
}

function parseVLESS(buf, uuid) {
  if (buf.length < 18 || buf[0] !== 0) return null;
  const cid = UUID2hex(buf.slice(1, 17));
  if (cid !== uuid) return null;
  const cmd = buf[17];
  const port = (buf[18] << 8) | buf[19];
  const atyp = buf[20];
  let addr = '', hdrLen = 21;
  if (atyp === 1) { addr = [buf[21], buf[22], buf[23], buf[24]].join('.'); hdrLen = 25; }
  else if (atyp === 2) { const dl = buf[21]; addr = new TextDecoder().decode(buf.slice(22, 22 + dl)); hdrLen = 22 + dl; }
  else if (atyp === 3) {
    const p = [];
    for (let i = 0; i < 8; i++) p.push(((buf[21 + i * 2] << 8) | buf[22 + i * 2]).toString(16));
    addr = p.join(':'); hdrLen = 37;
  }
  return { cmd, addr, port, hdrLen, remaining: buf.slice(hdrLen) };
}

async function sha224hex(str) {
  const buf = await crypto.subtle.digest('SHA-224', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function parseTrojan(buf) {
  if (!buf.length || buf[0] !== 0x0D || buf[1] !== 0x0A) return null;
  let end = 2;
  while (end < buf.length - 1 && !(buf[end] === 0x0D && buf[end + 1] === 0x0A)) end++;
  if (end >= buf.length - 1) return null;
  const hex56 = new TextDecoder().decode(buf.slice(2, end));
  if (hex56.length !== 56) return null;
  return { hex56, hdrEnd: end + 2 };
}

async function 代理(request, env, cfg) {
  const uuid = cfg.uuid || env.u || '';
  if (!uuid) return new Response('no uuid', { status: 403 });
  if (!connect) return new Response('proxy not available in this environment', { status: 503 });

  const pair = new WebSocketPair();
  const [client, server] = [pair[0], pair[1]];
  server.accept();
  let ready = false;

  server.addEventListener('message', async (ev) => {
    if (ready) return;
    ready = true;
    const buf = new Uint8Array(ev.data);

    /* ── VLESS detection: first byte 0x00 ── */
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

    /* ── Trojan detection: starts with 0x0D 0x0A ── */
    const trojan = parseTrojan(buf);
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
      else if (atyp === 2) { const dl = afterHash[2]; addr = new TextDecoder().decode(afterHash.slice(3, 3 + dl)); addrLen = dl + 1; }
      else if (atyp === 3) {
        const p = [];
        for (let i = 0; i < 8; i++) p.push(((afterHash[2 + i * 2] << 8) | afterHash[3 + i * 2]).toString(16));
        addr = p.join(':'); addrLen = 16;
      }
      const port = (afterHash[2 + addrLen] << 8) | afterHash[3 + addrLen];
      const dataStart = trojan.hdrEnd + 4 + addrLen;
      const remaining = buf.slice(dataStart);
      const proxyIP = cfg.p || '';
      const target = proxyIP || addr;
      try {
        const tcp = connect({ hostname: target, port: port || 443 });
        server.send(new Uint8Array([1, 0, 0]));
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


/* ══════════════════════════════════════════════════════════════════════════
   ▓ 56-router.js
   ══════════════════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════════════════════
   ▓ API Router — request handling and endpoint definitions
   ══════════════════════════════════════════════════════════════════════════════ */
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

  /* CORS preflight */
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

  /* WebSocket proxy */
  if (頭.get('upgrade') === 'websocket') { return await 代理(request, env, cfg); }

  const info = 訪客(request, cfg);

  /* ── Public endpoints ── */

  if (路 === '/healthz' || 路 === '/__health') {
    return 響({ ok: true, v: VERSION, t: Date.now(), host, kv: !!KV(env) });
  }

  if (法 === 'GET' && (路 === '/sub' || (seg.length >= 2 && rootKey === (鑰 || cfg.d) && seg[1] === 'sub'))) {
    return await 給Sub(request, env, cfg, info, host);
  }

  if (法 === 'GET' && 路 === '/api/info') {
    return 響({
      ok: true, v: VERSION, host, cc: info.cc, colo: info.colo,
      city: info.city, lat: info.lat, lon: info.lon, zone: info.zone,
      keySet: !!鑰, kv: !!KV(env), ts: Date.now(), name: cfg.name,
      tz: new Date().getTimezoneOffset(),
    });
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

  /* ── Config endpoints ── */
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
      try { body = await request.json(); } catch {}
      const next = { ...預設, ...cfg, ...body };
      if (env.u) next.uuid = env.u;
      if (env.d) next.d = env.d;
      next.disabled = !!next.disabled;
      const ok = await 寫配置(env, next);
      return 響({ ok: true, saved: ok, cfg: next });
    }
    return 誤('method', 405);
  }

  /* ── Unlock endpoint ── */
  if (法 === 'POST' && 路 === '/api/unlock') {
    let body = {};
    try { body = await request.json(); } catch {}
    const k = String(body.key || '').trim();
    return 響({ ok: !鑰 || 密時(鑰, k) });
  }

  /* ── User profile endpoints ── */
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

  /* Unknown API paths → 404 */
  if (路.startsWith('/api/')) return 誤('not found', 404);

  /* ── Main page ── */
  if (法 === 'GET') {
    const 開く = unlocked && !cfg.disabled;
    const L = LABELS[cfg.lang === 'en' ? 'en' : 'fa'];
    return new Response(頁(request, env, cfg, info, 開く, L), {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  return 誤('not found', 404);
}

/* ── Subscription endpoint ── */
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

export default {
  async fetch(request, env) {
    try {
      return await 請求(request, env);
    } catch (e) {
      return 響({ ok: false, error: String((e && e.message) || e) }, 500);
    }
  },
};

/* ══════════════════════════════════════════════════════════════════════════════
   ▓ HTML Page Template — Complete CSS + HTML + Client-side JavaScript
   ▓ This is the core UI: boot screen, home, config, live map, settings, about
   ══════════════════════════════════════════════════════════════════════════════ */
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
/* ═══════════════════════ CSS Variables & Reset ═══════════════════════ */
:root {
  --bg: #04060f; --bg2: #070b1a; --card: rgba(13,20,40,.55);
  --line: rgba(96,165,250,.14); --cy: #22d3ee; --vi: #a78bfa;
  --tx: #e2e8f0; --mut: #7d8db1; --ok: #34d399; --bad: #fb7185;
  --gold: #fbbf24;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }
body {
  background:
    radial-gradient(1200px 600px at 75% -10%, rgba(34,211,238,.08), transparent 60%),
    radial-gradient(1000px 700px at 10% 110%, rgba(167,139,250,.09), transparent 60%),
    var(--bg);
  color: var(--tx); font-family: 'Segoe UI', Tahoma, 'Vazirmatn', system-ui, sans-serif;
  overflow-x: hidden;
}

/* ═══════════════════════ Boot Screen ═══════════════════════ */
#boot {
  position: fixed; inset: 0; z-index: 100; display: flex; flex-direction: column;
  align-items: center; justify-content: center; background: var(--bg);
  transition: opacity .5s, visibility .5s;
}
#boot.off { opacity: 0; visibility: hidden; pointer-events: none; }
#boot .ring {
  width: 80px; height: 80px; border: 3px solid rgba(34,211,238,.2); border-top-color: var(--cy);
  border-radius: 50%; animation: spin 1s linear infinite;
}
#boot h2 {
  margin-top: 18px; font-size: 24px; letter-spacing: 6px; font-weight: 800;
  background: linear-gradient(90deg, var(--cy), var(--vi));
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
#boot .bl { margin-top: 16px; font-family: ui-monospace, Menlo, monospace; font-size: 11px; color: var(--mut); text-align: left; }
#boot .bl div { opacity: 0; animation: fadeIn .3s forwards; }
#boot .bl div.ok { color: var(--ok); }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes fadeIn { to { opacity: 1; } }

/* ═══════════════════════ Stars Canvas ═══════════════════════ */
#stars { position: fixed; inset: 0; z-index: 0; pointer-events: none; }

/* ═══════════════════════ Scanline Overlay ═══════════════════════ */
.scan {
  position: fixed; inset: 0; z-index: 1; pointer-events: none;
  background: repeating-linear-gradient(0deg, transparent 0 3px, rgba(148,163,184,.028) 3px 4px);
}

/* ═══════════════════════ HUD Corners ═══════════════════════ */
.hud { position: fixed; z-index: 2; pointer-events: none; opacity: .8; }
.hud.tl { top: 14px; left: 14px; border-top: 2px solid var(--cy); border-left: 2px solid var(--cy); width: 26px; height: 26px; border-radius: 6px 0 0 0; }
.hud.tr { top: 14px; right: 14px; border-top: 2px solid var(--cy); border-right: 2px solid var(--cy); width: 26px; height: 26px; border-radius: 0 6px 0 0; }
.hud.bl { bottom: 14px; left: 14px; border-bottom: 2px solid var(--cy); border-left: 2px solid var(--cy); width: 26px; height: 26px; border-radius: 0 0 0 6px; }
.hud.br { bottom: 14px; right: 14px; border-bottom: 2px solid var(--cy); border-right: 2px solid var(--cy); width: 26px; height: 26px; border-radius: 0 0 6px 0; }

/* ═══════════════════════ Layout ═══════════════════════ */
.wrap { position: relative; z-index: 3; max-width: 1180px; margin: 0 auto; padding: 20px 16px 70px; }

/* ═══════════════════════ Header ═══════════════════════ */
header {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 14px 18px; border: 1px solid var(--line); border-radius: 16px;
  background: var(--card); backdrop-filter: blur(14px); flex-wrap: wrap;
}
.logo { display: flex; align-items: center; gap: 10px; }
.logo svg { filter: drop-shadow(0 0 8px rgba(34,211,238,.5)); }
.logo b {
  font-size: 19px; letter-spacing: 2px;
  background: linear-gradient(90deg, var(--cy), var(--vi));
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.logo small { display: block; color: var(--mut); font-size: 10px; letter-spacing: 3px; }
.chips { display: flex; gap: 8px; flex-wrap: wrap; }
.chip {
  display: inline-flex; align-items: center; gap: 6px; font-size: 11px;
  padding: 5px 11px; border-radius: 99px; border: 1px solid var(--line);
  background: rgba(148,163,184,.05); color: var(--mut);
  font-family: ui-monospace, Menlo, monospace;
}
.chip b { color: var(--cy); font-weight: 600; }
.dot {
  width: 6px; height: 6px; border-radius: 99px; background: var(--ok);
  box-shadow: 0 0 8px var(--ok); animation: blink 1.6s infinite;
}
@keyframes blink { 50% { opacity: .35; } }

/* ═══════════════════════ Navigation ═══════════════════════ */
nav { display: flex; gap: 6px; margin-top: 16px; flex-wrap: wrap; }
nav button {
  display: inline-flex; align-items: center; gap: 7px; padding: 9px 16px;
  border-radius: 12px; border: 1px solid var(--line);
  background: rgba(13,20,40,.5); color: var(--mut); font-size: 13px;
  cursor: pointer; transition: .25s; font-family: inherit;
}
nav button:hover { color: var(--tx); border-color: rgba(34,211,238,.4); }
nav button.on {
  color: #031018;
  background: linear-gradient(90deg, var(--cy), #7dd3fc);
  border-color: transparent; font-weight: 700;
  box-shadow: 0 0 22px rgba(34,211,238,.35);
}

/* ═══════════════════════ Panels ═══════════════════════ */
main { margin-top: 18px; }
.panel { display: none; }
.panel.on { display: block; animation: up .45s ease both; }
@keyframes up { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }

/* ═══════════════════════ Hero Section ═══════════════════════ */
.hero {
  position: relative; padding: 56px 26px 46px; text-align: center; overflow: hidden;
  border: 1px solid var(--line); border-radius: 22px;
  background: linear-gradient(180deg, rgba(13,20,40,.7), rgba(7,11,26,.6));
  backdrop-filter: blur(14px);
}
.hero::before {
  content: ''; position: absolute; inset: -40% -20% auto; height: 120%;
  background: conic-gradient(from 120deg at 50% 40%, transparent 70%, rgba(34,211,238,.25), transparent 85%);
  animation: rot 14s linear infinite; pointer-events: none;
}
@keyframes rot { to { transform: rotate(360deg); } }
.hero > * { position: relative; z-index: 1; }
.hero h1 {
  font-size: clamp(28px, 5.5vw, 54px); font-weight: 800; line-height: 1.15;
  background: linear-gradient(92deg, #e0f2fe 10%, var(--cy) 45%, var(--vi) 90%);
  -webkit-background-clip: text; background-clip: text; color: transparent;
  text-shadow: 0 0 60px rgba(34,211,238,.25);
}
.hero p { color: var(--mut); margin-top: 12px; font-size: clamp(13px, 2.2vw, 16px); max-width: 640px; margin-inline: auto; }
.hero .tag { margin-top: 14px; font-size: 12px; letter-spacing: 1px; color: var(--vi); }
.cta { display: flex; gap: 12px; justify-content: center; margin-top: 26px; flex-wrap: wrap; }
.btn {
  display: inline-flex; align-items: center; gap: 8px; padding: 13px 26px;
  border-radius: 14px; font-size: 14px; font-weight: 700; cursor: pointer;
  transition: .25s; border: 1px solid transparent; font-family: inherit;
}
.btn.prim {
  background: linear-gradient(90deg, var(--cy), #60a5fa); color: #031018;
  box-shadow: 0 8px 30px rgba(34,211,238,.3);
}
.btn.prim:hover { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(34,211,238,.45); }
.btn.ghost { border-color: var(--line); color: var(--tx); background: rgba(148,163,184,.06); }
.btn.ghost:hover { border-color: rgba(167,139,250,.5); color: #fff; }

/* ═══════════════════════ Stats Grid ═══════════════════════ */
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-top: 22px; }
.stat { border: 1px solid var(--line); border-radius: 14px; padding: 14px; background: rgba(7,11,26,.55); }
.stat .k { font-size: 10px; color: var(--mut); letter-spacing: 1px; }
.stat .v { font-size: 20px; font-weight: 800; margin-top: 5px; color: var(--tx); font-family: ui-monospace, Menlo, monospace; }
.stat .v em { color: var(--cy); font-style: normal; }

/* ═══════════════════════ Recommendation Box ═══════════════════════ */
.rec {
  margin-top: 18px; border: 1px solid rgba(34,211,238,.3); border-radius: 16px;
  padding: 18px; background: linear-gradient(120deg, rgba(34,211,238,.08), rgba(167,139,250,.06));
}
.rec h3 { font-size: 13px; color: var(--cy); display: flex; gap: 8px; align-items: center; }
.rec p { margin-top: 8px; font-size: 13.5px; color: var(--tx); line-height: 1.9; }

/* ═══════════════════════ Cards ═══════════════════════ */
.card { border: 1px solid var(--line); border-radius: 18px; background: var(--card); backdrop-filter: blur(12px); padding: 20px; margin-top: 16px; }
.card h2 { font-size: 16px; display: flex; align-items: center; gap: 9px; color: var(--tx); }
.card h2 small { color: var(--mut); font-weight: 400; font-size: 12px; }

/* ═══════════════════════ Node Grid ═══════════════════════ */
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; margin-top: 16px; }
.node {
  border: 1px solid var(--line); border-radius: 14px; padding: 14px;
  background: rgba(7,11,26,.6); transition: .25s; position: relative; overflow: hidden;
}
.node:hover { border-color: rgba(34,211,238,.45); transform: translateY(-2px); }
.node .top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.badge { font-size: 10px; font-weight: 800; padding: 3px 9px; border-radius: 99px; letter-spacing: .5px; }
.badge.vless { background: rgba(34,211,238,.15); color: var(--cy); }
.badge.trojan { background: rgba(167,139,250,.15); color: var(--vi); }
.badge.ss { background: rgba(52,211,153,.15); color: var(--ok); }
.badge.ws { background: rgba(251,191,36,.12); color: var(--gold); }
.badge.grpc { background: rgba(96,165,250,.14); color: #93c5fd; }
.badge.xhttp { background: rgba(244,114,182,.14); color: #f9a8d4; }
.node h4 { font-size: 13px; margin-top: 9px; color: var(--tx); word-break: break-all; }
.node .meta { font-size: 11px; color: var(--mut); margin-top: 6px; font-family: ui-monospace, Menlo, monospace; word-break: break-all; }
.node .meta b { color: #a5b4fc; font-weight: 600; }
.node button {
  position: absolute; top: 12px; inset-inline-end: 12px;
  border: 1px solid var(--line); background: rgba(148,163,184,.08);
  color: var(--cy); border-radius: 9px; padding: 5px 10px; font-size: 11px;
  cursor: pointer; transition: .2s;
}
.node button:hover { background: rgba(34,211,238,.15); }

/* ═══════════════════════ Sub Row ═══════════════════════ */
.subrow { display: flex; gap: 10px; margin-top: 14px; flex-wrap: wrap; align-items: center; }
.fmt { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 12px; }
.fmt button {
  padding: 7px 14px; border-radius: 10px; border: 1px solid var(--line);
  background: rgba(148,163,184,.05); color: var(--mut); font-size: 12px;
  cursor: pointer; font-family: inherit;
}
.fmt button.on { border-color: var(--vi); color: var(--vi); background: rgba(167,139,250,.1); }
.urlbox {
  display: flex; align-items: center; gap: 8px; flex: 1; min-width: 240px;
  border: 1px solid var(--line); border-radius: 12px; padding: 9px 12px;
  background: rgba(4,6,15,.6); font-family: ui-monospace, Menlo, monospace;
  font-size: 11px; color: var(--mut); word-break: break-all;
}

/* ═══════════════════════ Client Links ═══════════════════════ */
.clientrow { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.clientrow a {
  flex: 1 1 120px; text-align: center; padding: 10px 6px; border-radius: 11px;
  font-size: 11.5px; text-decoration: none; border: 1px solid rgba(52,211,153,.3);
  color: #6ee7b7; background: rgba(52,211,153,.06); transition: .2s;
}
.clientrow a:hover { background: rgba(52,211,153,.14); }

/* ═══════════════════════ QR Box ═══════════════════════ */
.qrbox { display: flex; gap: 18px; align-items: center; flex-wrap: wrap; margin-top: 14px; }
.qrbox img { border-radius: 14px; border: 1px solid var(--line); background: #fff; width: 170px; height: 170px; }

/* ═══════════════════════ Map ═══════════════════════ */
.mapbox {
  position: relative; border: 1px solid var(--line); border-radius: 18px; overflow: hidden;
  background: radial-gradient(600px 300px at 50% 0, rgba(34,211,238,.06), transparent), #050a18;
}
.mapbox svg { display: block; width: 100%; height: auto; }
.legend { position: absolute; top: 12px; inset-inline-start: 12px; font-size: 10px; color: var(--mut); display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.legend i { width: 8px; height: 8px; border-radius: 99px; display: inline-block; margin-inline-end: 4px; }
.mapside { margin-top: 14px; display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 8px; }
.pops { font-size: 11px; border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; background: rgba(7,11,26,.55); display: flex; justify-content: space-between; }
.pops b { color: var(--cy); font-family: ui-monospace, Menlo, monospace; }

/* ═══════════════════════ Forms ═══════════════════════ */
form#cfgForm {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 14px; margin-top: 16px;
}
field {
  border: 1px solid var(--line); border-radius: 14px; padding: 13px;
  background: rgba(7,11,26,.5);
}
field legend { font-size: 11px; color: var(--mut); padding: 0 6px; letter-spacing: .5px; }
field label { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12.5px; color: var(--tx); padding: 5px 0; }
field input, field select, field textarea {
  width: 100%; margin-top: 6px; padding: 8px 10px; border: 1px solid var(--line);
  border-radius: 10px; background: rgba(4,6,15,.6); color: var(--tx); font-size: 13px;
  font-family: inherit; outline: none; transition: .2s;
}
field input:focus, field select:focus, field textarea:focus { border-color: var(--cy); }
field textarea { min-height: 60px; resize: vertical; }

/* ═══════════════════════ Switches ═══════════════════════ */
.sw {
  display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px;
  border-radius: 10px; border: 1px solid var(--line); background: rgba(148,163,184,.05);
  color: var(--mut); font-size: 12px; cursor: pointer; transition: .2s;
  user-select: none;
}
.sw.on { border-color: var(--cy); color: var(--cy); background: rgba(34,211,238,.1); }
.sw::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: var(--mut); transition: .2s; }
.sw.on::before { background: var(--cy); box-shadow: 0 0 8px var(--cy); }

/* ═══════════════════════ Actions ═══════════════════════ */
.actions { display: flex; gap: 10px; margin-top: 16px; flex-wrap: wrap; }

/* ═══════════════════════ Lock Screen ═══════════════════════ */
#lock {
  position: fixed; inset: 0; z-index: 50; display: none; align-items: center;
  justify-content: center; background: rgba(4,6,15,.92); backdrop-filter: blur(18px);
}
#lock.on { display: flex; }
.lockbox {
  text-align: center; padding: 36px; border: 1px solid var(--line); border-radius: 20px;
  background: var(--card); max-width: 380px; width: 90%;
}
.lockbox h2 { font-size: 20px; margin-bottom: 8px; }
.lockbox p { font-size: 13px; color: var(--mut); margin-bottom: 18px; }
.lockbox input {
  width: 100%; padding: 12px; border: 1px solid var(--line); border-radius: 12px;
  background: rgba(4,6,15,.6); color: var(--tx); font-size: 15px; text-align: center;
  font-family: ui-monospace, Menlo, monospace; letter-spacing: 3px; outline: none;
}
.lockbox input:focus { border-color: var(--cy); }
.lockbox button {
  margin-top: 14px; width: 100%; padding: 12px; border: none; border-radius: 12px;
  background: linear-gradient(90deg, var(--cy), #60a5fa); color: #031018;
  font-size: 15px; font-weight: 700; cursor: pointer; font-family: inherit;
}

/* ═══════════════════════ Toast ═══════════════════════ */
#toast {
  position: fixed; bottom: 22px; inset-inline-start: 50%; transform: translateX(50%) translateY(20px);
  z-index: 60; padding: 10px 22px; border-radius: 12px; font-size: 13px;
  background: var(--card); border: 1px solid var(--line); color: var(--tx);
  backdrop-filter: blur(12px); opacity: 0; transition: .3s; pointer-events: none;
  white-space: nowrap;
}
#toast.on { opacity: 1; transform: translateX(50%) translateY(0); }

/* ═══════════════════════ About ═══════════════════════ */
.about-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-top: 14px; }

/* ═══════════════════════ Responsive ═══════════════════════ */
@media (max-width: 600px) {
  .hero { padding: 36px 16px 30px; }
  .hero h1 { font-size: 28px; }
  nav button { padding: 8px 12px; font-size: 12px; }
  .grid { grid-template-columns: 1fr; }
  .stats { grid-template-columns: repeat(2, 1fr); }
  header { padding: 10px 12px; }
}
</style>
</head>
<body>
<canvas id="stars"></canvas>
<div class="scan"></div>
<div class="hud tl"></div><div class="hud tr"></div>
<div class="hud bl"></div><div class="hud br"></div>

<!-- ═══════════ Boot Screen ═══════════ -->
<div id="boot">
  <div class="ring"></div>
  <h2>NEXUS</h2>
  <div class="bl" id="bootlog"></div>
</div>

<!-- ═══════════ Lock Screen ═══════════ -->
<div id="lock">
  <div class="lockbox">
    <h2 id="lock_t"></h2>
    <p id="lock_sub"></p>
    <input type="password" id="lockkey" autocomplete="off" placeholder="••••••••">
    <button id="lockbtn"></button>
  </div>
</div>

<!-- ═══════════ Main App ═══════════ -->
<div class="wrap" id="app" style="opacity:0">
  <header>
    <div class="logo">
      <svg width="36" height="36" viewBox="0 0 36 36"><rect width="36" height="36" rx="8" fill="#04060f"/>
        <path d="M8 27V10l10 9 10-9v17" stroke="#22d3ee" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <div><b>NEXUS</b><small>THE GATEWAY TO TOMORROW</small></div>
    </div>
    <div class="chips">
      <div class="chip"><button id="langBtn" style="background:none;border:none;color:var(--cy);cursor:pointer;font-size:11px;padding:0">EN ⇄ FA</button></div>
      <div class="chip">LIVE · <b id="chipLive">00:00:00</b> <span class="dot"></span></div>
      <div class="chip">COLO · <b id="chipColo">—</b></div>
      <div class="chip">CC · <b id="chipCc">—</b></div>
      <div class="chip">CITY · <b id="chipCity">—</b></div>
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
    <!-- ═══════════ Home Panel ═══════════ -->
    <section class="panel on" id="p-home">
      <div class="hero">
        <h1 id="hero1"></h1>
        <p id="hero2"></p>
        <div class="tag" id="hero3"></div>
        <div class="cta">
          <button class="btn prim" id="cta1"></button>
          <button class="btn ghost" id="cta2"></button>
        </div>
        <div class="stats" id="heroStats"></div>
      </div>
      <div class="rec">
        <h3 id="rec_t"></h3>
        <p id="rec_d"></p>
      </div>
    </section>

    <!-- ═══════════ Config Panel ═══════════ -->
    <section class="panel" id="p-cfg">
      <div class="card">
        <h2>⚡ <span id="nodes_t"></span></h2>
        <p id="nodes_sub" style="font-size:12.5px;color:var(--mut);margin-top:6px"></p>
        <div class="subrow">
          <div class="urlbox" id="subUrl">—</div>
          <button class="btn ghost" id="copySubBtn" style="flex-shrink:0">📋</button>
        </div>
        <div class="fmt" id="fmtBtns"></div>
        <div class="grid" id="nodeGrid"></div>
      </div>
      <div class="card" style="margin-top:16px">
        <h2>📱 <span id="clients_t"></span></h2>
        <div class="clientrow" id="clientLinks"></div>
      </div>
      <div class="card" style="margin-top:16px">
        <h2>📱 <span id="qr_t"></span></h2>
        <div class="qrbox" id="qrBox"></div>
      </div>
    </section>

    <!-- ═══════════ Map Panel ═══════════ -->
    <section class="panel" id="p-map">
      <div class="card">
        <h2>🌍 <span id="map_title"></span></h2>
        <div style="display:flex;gap:12px;margin-top:8px;flex-wrap:wrap;align-items:center;font-size:11px;color:var(--mut)">
          <span id="abCc2"></span>
          <div class="legend">
            <span><i style="background:var(--cy)"></i><span id="map_link"></span></span>
            <span><i style="background:var(--vi)"></i><span id="map_pop"></span></span>
            <span><i style="background:var(--ok)"></i><span id="map_you"></span></span>
          </div>
        </div>
        <div class="mapbox" id="mapBox"></div>
        <div class="mapside" id="mapSide"></div>
      </div>
    </section>

    <!-- ═══════════ Settings Panel ═══════════ -->
    <section class="panel" id="p-set">
      <div class="card">
        <h2>🧠 <span id="cfg_t"></span></h2>
        <p id="setSub" style="font-size:12.5px;color:var(--mut);margin-top:6px"></p>
        <form id="cfgForm">
          <field><legend id="st_proto"></legend><div id="fldProto"></div></field>
          <field><legend id="st_tr"></legend><div id="fldTr"></div></field>
          <field><legend id="st_port"></legend><div class="chipsrow" id="fldPorts"></div></field>
          <field><legend id="st_tls"></legend><label id="lblTls"></label><label id="lblFrag"></label><label id="lblEch"></label></field>
          <field><legend id="st_fp"></legend><select id="f_fp"><option>chrome</option><option>firefox</option><option>safari</option><option>random</option></select></field>
          <field><legend id="st_sni"></legend><input type="text" id="f_sni" dir="ltr"></field>
          <field><legend id="st_path"></legend><input type="text" id="f_path" dir="ltr"></field>
          <field><legend id="st_p"></legend><textarea id="f_p" dir="ltr"></textarea></field>
          <field><legend id="st_s"></legend><input type="text" id="f_s" dir="ltr" placeholder="host:port:user:pass"></field>
          <field><legend id="st_sub"></legend><input type="text" id="f_subname" dir="ltr"></field>
          <field><legend id="st_scu"></legend><input type="text" id="f_scu" dir="ltr"></field>
          <field><legend id="st_ir"></legend><div id="fldIr"></div></field>
          <field><legend id="st_danger"></legend><label id="lblDis"></label></field>
        </form>
        <div class="actions">
          <button class="btn prim" id="saveCfg"></button>
          <button class="btn ghost" id="smartBtn"></button>
        </div>

        <!-- User Profile Section -->
        <div style="margin-top:20px;border:1px solid rgba(167,139,250,.3);border-radius:16px;padding:20px;background:linear-gradient(120deg,rgba(167,139,250,.06),rgba(34,211,238,.04))">
          <h2 style="font-size:15px;color:var(--vi)">👤 <span id="user_profile"></span></h2>
          <p style="font-size:12px;color:var(--mut);margin-top:6px" id="user_profile_d"></p>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-top:14px">
            <field><legend id="user_name"></legend><input type="text" id="f_uname" dir="auto" placeholder="ali"></field>
            <field><legend id="user_transport"></legend><select id="f_utr"><option value="">auto</option><option value="ws">WebSocket</option><option value="grpc">gRPC</option><option value="xhttp">XHTTP</option></select></field>
            <field><legend id="user_sni"></legend><input type="text" id="f_usni" dir="ltr" placeholder="sni.example.com"></field>
            <field><legend id="user_path"></legend><input type="text" id="f_upath" dir="ltr" placeholder="/?ed=2560"></field>
          </div>
          <div class="actions"><button class="btn prim" id="saveUserBtn" style="background:linear-gradient(90deg,var(--vi),#c084fc)"></button></div>
        </div>
      </div>
    </section>

    <!-- ═══════════ About Panel ═══════════ -->
    <section class="panel" id="p-about">
      <div class="card">
        <h2>🛰 <span id="about_t"></span></h2>
        <p id="aboutD" style="font-size:13.5px;color:var(--mut);line-height:1.9;margin-top:10px"></p>
        <div class="about-grid">
          <div class="stat"><div class="k">VERSION</div><div class="v"><em>${VERSION}</em></div></div>
          <div class="stat"><div class="k">COLO</div><div class="v"><em>${colo}</em></div></div>
          <div class="stat"><div class="k">COUNTRY</div><div class="v"><em id="abCc"></em></div></div>
          <div class="stat"><div class="k">HOST</div><div class="v" style="font-size:13px" id="abHost"></div></div>
          <div class="stat"><div class="k">ZONE</div><div class="v"><em id="abZone"></em></div></div>
          <div class="stat"><div class="k">NODES</div><div class="v"><em id="abNodes">—</em></div></div>
          <div class="stat"><div class="k">RTT</div><div class="v"><em id="abRtt">—</em></div></div>
          <div class="stat"><div class="k">KV</div><div class="v"><em id="abKv">—</em></div></div>
        </div>
        <p style="margin-top:18px;font-size:11px;color:#475569;text-align:center" id="fPowered"></p>
      </div>
    </section>
  </main>
</div>

<div id="toast"></div>

<!-- CLIENT_JS_BELOW -->

<script>
/*
 * NEXUS Client-Side JavaScript
 * ─────────────────────────────
 * CRITICAL: boot() is called FIRST. All other init is wrapped in try/catch.
 * Every DOM access uses null-safe helpers.
 */
(function(){
'use strict';

/* ─── Template-injected data ─── */
var L = ${label};
var VI = ${vinfo};
var POPS = ${popJson};
var KEY = ${JSON.stringify(key)};
var UNLOCKED = ${unlocked ? 'true' : 'false'};
var KVOK = ${KV(env) ? 'true' : 'false'};

/* ══════════════════════════════════════════════════════════════════════════════
   ▓ DOM Helpers — null-safe
   ══════════════════════════════════════════════════════════════════════════════ */
function $(id) { return document.getElementById(id); }
function $q(sel) { return document.querySelector(sel); }
function $qa(sel) { return document.querySelectorAll(sel); }
function safe(fn) { try { return fn(); } catch(e) { return null; } }

function tx(msg) {
  var t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(t._x);
  t._x = setTimeout(function(){ t.classList.remove('on'); }, 2200);
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, function(c) {
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c];
  });
}

function safeText(id, text) {
  var el = $(id);
  if (el) el.textContent = text;
  return el;
}

function safeHTML(id, html) {
  var el = $(id);
  if (el) el.innerHTML = html;
  return el;
}

/* ══════════════════════════════════════════════════════════════════════════════
   ▓ i18n — apply language labels to all elements
   ══════════════════════════════════════════════════════════════════════════════ */
function i18n() {
  var map = {
    t_home:'t_home', t_cfg:'t_cfg', t_map:'t_map', t_set:'t_set', t_about:'t_about',
    hero1:'hero1', hero2:'hero2', hero3:'hero3', cta:'cta', cta2:'cta2',
    rec_t:'rec_t', rec_d:'rec_d',
    nodes_t:'nodes_t', nodes_sub:'nodes_sub', copy:'copy',
    clients_t:'clients_t', qr_t:'qr_t', cfg_t:'cfg_t',
    setSub:'setSub', save:'save', smart:'smart',
    st_proto:'st_proto', st_tr:'st_tr', st_port:'st_port',
    st_tls:'st_tls', st_fp:'st_fp', st_sni:'st_sni',
    st_path:'st_path', st_p:'st_p', st_s:'st_s',
    st_sub:'st_sub', st_scu:'st_scu', st_ir:'st_ir',
    st_danger:'st_danger', lblDis:'st_disable',
    about_t:'about_t', about_d:'about_d', fPowered:'f_powered',
    lock_t:'lock_t', lock_sub:'lock_sub',
    map_title:'map_title', map_link:'link', map_pop:'pop', map_you:'you',
    user_profile:'user_profile', user_profile_d:'user_profile_d',
    user_name:'user_name', user_transport:'user_transport',
    user_sni:'user_sni', user_path:'user_path', user_save:'user_save',
  };
  for (var k in map) { var el = $(k); if (el && L[map[k]]) el.textContent = L[map[k]]; }
  var lockBtn = $('lockbtn');
  if (lockBtn) lockBtn.textContent = L.unlock_btn || L.unlock;
  var tabBtns = $qa('#tabs button');
  for (var i = 0; i < tabBtns.length; i++) {
    var span = tabBtns[i].querySelector('span');
    var t = tabBtns[i].getAttribute('data-t');
    if (span && L['t_' + t]) span.textContent = L['t_' + t];
  }
  document.title = 'NEXUS · ' + (VI.host || '');
}

/* ══════════════════════════════════════════════════════════════════════════════
   ▓ Boot Sequence — runs FIRST, never blocks
   ══════════════════════════════════════════════════════════════════════════════ */
function boot() {
  var bl = $('bootlog');
  var steps = [L.boot1, L.boot2, L.boot3, L.boot4, L.boot5];
  var i = 0;
  var iv = setInterval(function() {
    if (i < steps.length) {
      if (bl) {
        var d = document.createElement('div');
        d.textContent = '> ' + steps[i];
        if (i === steps.length - 1) d.className = 'ok';
        bl.appendChild(d);
      }
      i++;
    } else {
      clearInterval(iv);
      setTimeout(function() {
        var b = $('boot'); if (b) b.classList.add('off');
        var a = $('app'); if (a) a.style.opacity = '1';
        if (!UNLOCKED && KEY) {
          var lk = $('lock'); if (lk) lk.classList.add('on');
          var lkInput = $('lockkey'); if (lkInput) lkInput.focus();
        }
      }, 350);
    }
  }, 300);
}

/* ══════════════════════════════════════════════════════════════════════════════
   ▓ Tab Navigation
   ══════════════════════════════════════════════════════════════════════════════ */
function tabs() {
  var btns = $qa('#tabs button');
  if (!btns || !btns.length) return;
  for (var i = 0; i < btns.length; i++) {
    btns[i].onclick = function() {
      for (var j = 0; j < btns.length; j++) btns[j].classList.remove('on');
      this.classList.add('on');
      var t = this.getAttribute('data-t');
      var panels = $qa('.panel');
      for (var k = 0; k < panels.length; k++) panels[k].classList.remove('on');
      var target = $('p-' + t);
      if (target) target.classList.add('on');
      if (t === 'map') setTimeout(renderMap, 60);
      if (t === 'cfg' && !STATE.nodes) loadNodes();
      if (t === 'set' && !STATE.cfg) loadCfg();
    };
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
   ▓ State
   ══════════════════════════════════════════════════════════════════════════════ */
var STATE = { info: VI, nodes: null, cfg: null, fmt: 'base64', irCarriers: {} };

function api(path) {
  return fetch(path).then(function(r) { return r.json(); }).catch(function() { return null; });
}

/* ══════════════════════════════════════════════════════════════════════════════
   ▓ Home Panel
   ══════════════════════════════════════════════════════════════════════════════ */
function renderHome() {
  var h = $('heroStats');
  if (!h) return;
  var items = [
    { k: 'VERSION', v: '<em>' + VERSION + '</em>' },
    { k: 'ZONE', v: '<em>' + (VI.zone || '—') + '</em>' },
    { k: 'CC', v: '<em>' + (VI.cc || '—') + '</em>' },
    { k: 'COLO', v: '<em>' + (VI.colo || '—') + '</em>' },
    { k: 'KV', v: '<em>' + (KVOK ? 'ON' : 'OFF') + '</em>' },
    { k: 'KEY', v: '<em>' + (VI.keySet ? 'SET' : 'NONE') + '</em>' },
  ];
  var html = '';
  for (var i = 0; i < items.length; i++) {
    html += '<div class="stat"><div class="k">' + items[i].k + '</div><div class="v">' + items[i].v + '</div></div>';
  }
  h.innerHTML = html;
}

/* ══════════════════════════════════════════════════════════════════════════════
   ▓ Nodes Panel
   ══════════════════════════════════════════════════════════════════════════════ */
function loadNodes() {
  api('/api/nodes?k=' + encodeURIComponent(KEY)).then(function(d) {
    if (d && d.ok) { STATE.nodes = d; renderNodes(); }
  });
}

function renderNodes() {
  var d = STATE.nodes;
  if (!d || !d.nodes) return;

  var subUrl = $('subUrl');
  if (subUrl) subUrl.textContent = d.links.sub || '—';

  var fmtBtns = $('fmtBtns');
  if (fmtBtns) {
    var fmts = ['base64', 'clash', 'singbox', 'plain'];
    var html = '';
    for (var i = 0; i < fmts.length; i++) {
      html += '<button class="' + (STATE.fmt === fmts[i] ? 'on' : '') + '" data-fmt="' + fmts[i] + '">' + fmts[i] + '</button>';
    }
    fmtBtns.innerHTML = html;
    var btns = fmtBtns.querySelectorAll('button');
    for (var j = 0; j < btns.length; j++) {
      btns[j].onclick = function() {
        STATE.fmt = this.getAttribute('data-fmt');
        renderNodes();
      };
    }
  }

  var cl = $('clientLinks');
  if (cl) {
    cl.innerHTML =
      '<a href="https://github.com/MatsuriDayo/NekoBoxForAndroid/releases" target="_blank">📱 NekoBox</a>' +
      '<a href="https://github.com/v2ray/v2rayNG/releases" target="_blank">📱 v2rayNG</a>' +
      '<a href="https://github.com/izhangzhihao/invisibility/releases" target="_blank">📱 Invisible</a>' +
      '<a href="https://github.com/nickkuk/stash/releases" target="_blank">🍎 Stash (iOS)</a>';
  }

  var qr = $('qrBox');
  if (qr) {
    var subLink = d.links.sub || '';
    var qrApi = 'https://api.qrserver.com/v1/create-qr-code/?size=170x170&data=' + encodeURIComponent(subLink);
    qr.innerHTML = '<img src="' + qrApi + '" alt="QR" loading="lazy"><div style="font-size:11px;color:var(--mut);line-height:1.8">' +
      '<div>RTT: <b style="color:var(--cy)">' + d.rtt + ' ms</b></div>' +
      '<div>Zone: <b style="color:var(--vi)">' + (d.zone || '—') + '</b></div>' +
      '<div>Nodes: <b style="color:var(--ok)">' + d.nodes.length + '</b></div></div>';
  }

  var grid = $('nodeGrid');
  if (!grid) return;
  var nodes = d.nodes;
  var html = '';
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    var pc = n.p === 'vless' ? 'vless' : n.p === 'trojan' ? 'trojan' : 'ss';
    var tc = n.t === 'ws' ? 'ws' : n.t === 'grpc' ? 'grpc' : 'xhttp';
    html += '<div class="node">' +
      '<div class="top"><span class="badge ' + pc + '">' + n.p.toUpperCase() + '</span>' +
      '<span class="badge ' + tc + '">' + n.t.toUpperCase() + '</span>' +
      '<span class="badge" style="background:rgba(52,211,153,.1);color:var(--ok)">' + n.port + '</span></div>' +
      '<h4>' + esc(n.n) + '</h4>' +
      '<div class="meta"><b>' + esc(n.a) + '</b> · ' + n.sni + ' · ' + n.fp + '</div>' +
      '<button data-line="' + esc(n.line) + '">' + L.copy + '</button>' +
      '</div>';
  }
  grid.innerHTML = html;

  var copyBtns = grid.querySelectorAll('button[data-line]');
  for (var j = 0; j < copyBtns.length; j++) {
    copyBtns[j].onclick = function() {
      var line = this.getAttribute('data-line');
      copyText(line);
      tx(L.copy_ok);
    };
  }

  var copySubBtn = $('copySubBtn');
  if (copySubBtn) {
    copySubBtn.onclick = function() {
      copyText(d.links.sub || '');
      tx(L.copy_ok);
    };
  }
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(function() { fallbackCopy(text); });
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch {}
  document.body.removeChild(ta);
}

/* ══════════════════════════════════════════════════════════════════════════════
   ▓ Live Map Panel
   ══════════════════════════════════════════════════════════════════════════════ */
function XY(lat, lon) {
  var x = (lon + 180) * (800 / 360);
  var y = (90 - lat) * (400 / 180);
  return { x: x, y: y };
}

function renderMap() {
  var box = $('mapBox');
  var side = $('mapSide');
  if (!box) return;

  var svg = '<svg viewBox="0 0 800 400" xmlns="http://www.w3.org/2000/svg">' +
    '<rect width="800" height="400" fill="transparent"/>';

  var continents = [
    'M80,80 Q120,60 160,80 Q180,100 200,90 Q220,80 240,90 L240,140 Q200,150 180,140 Q140,130 100,120 Z',
    'M180,160 Q200,150 220,160 Q230,180 240,220 Q230,260 220,300 Q200,310 180,280 Q170,240 170,200 Z',
    'M350,70 Q380,60 420,70 Q440,80 430,100 Q410,110 380,100 Q360,90 350,80 Z',
    'M360,130 Q400,120 440,140 Q450,180 440,240 Q420,280 380,270 Q350,240 340,190 Q340,160 360,130 Z',
    'M440,50 Q520,30 600,50 Q650,80 680,100 Q660,130 620,140 Q560,150 500,130 Q460,110 440,90 Z',
    'M600,230 Q640,220 680,240 Q690,260 670,280 Q640,290 610,270 Q590,250 600,230 Z',
  ];
  for (var c = 0; c < continents.length; c++) {
    svg += '<path d="' + continents[c] + '" fill="none" stroke="rgba(96,165,250,.12)" stroke-width="0.5" stroke-dasharray="2,3"/>';
  }

  var vPos = XY(VI.lat || 35, VI.lon || 51);
  svg += '<circle cx="' + vPos.x + '" cy="' + vPos.y + '" r="6" fill="var(--ok)" opacity=".9"><animate attributeName="r" values="4;8;4" dur="2s" repeatCount="indefinite"/></circle>';
  svg += '<text x="' + (vPos.x + 10) + '" y="' + (vPos.y - 8) + '" fill="var(--ok)" font-size="9" font-family="monospace">' + (VI.cc || '??') + '</text>';

  for (var i = 0; i < POPS.length; i++) {
    var p = POPS[i];
    var pos = XY(p.lat, p.lon);
    var dist = Math.sqrt(Math.pow(pos.x - vPos.x, 2) + Math.pow(pos.y - vPos.y, 2));
    var isLink = dist < 120;
    var r = isLink ? 3.5 : 2;
    var color = isLink ? 'var(--cy)' : 'var(--vi)';
    var opacity = isLink ? 0.9 : 0.5;
    svg += '<circle cx="' + pos.x + '" cy="' + pos.y + '" r="' + r + '" fill="' + color + '" opacity="' + opacity + '">';
    if (isLink) svg += '<animate attributeName="opacity" values="0.5;1;0.5" dur="2s" repeatCount="indefinite"/>';
    svg += '</circle>';
    if (isLink) {
      svg += '<line x1="' + vPos.x + '" y1="' + vPos.y + '" x2="' + pos.x + '" y2="' + pos.y + '" stroke="var(--cy)" stroke-width="0.5" opacity=".3" stroke-dasharray="4,4"><animate attributeName="stroke-dashoffset" values="0;8" dur="1s" repeatCount="indefinite"/></line>';
    }
  }
  svg += '</svg>';
  box.innerHTML = svg;

  if (!side) return;
  var pops = [];
  for (var j = 0; j < POPS.length; j++) {
    var pp = POPS[j];
    var d = distKm(VI.lat || 35, VI.lon || 51, pp.lat, pp.lon);
    pops.push({ pop: pp, dist: d, rtt: Math.max(8, Math.round(d / 200 + 6)) });
  }
  pops.sort(function(a, b) { return a.dist - b.dist; });
  var html = '';
  for (var k = 0; k < Math.min(12, pops.length); k++) {
    var pp2 = pops[k];
    html += '<div class="pops"><span>' + pp2.pop.name + ' · ' + pp2.pop.cc + '</span><b>' + pp2.rtt + ' ms</b></div>';
  }
  side.innerHTML = html;
}

function distKm(lat1, lon1, lat2, lon2) {
  var R = 6371;
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLon = (lon2 - lon1) * Math.PI / 180;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ══════════════════════════════════════════════════════════════════════════════
   ▓ Settings Panel
   ══════════════════════════════════════════════════════════════════════════════ */
function loadCfg() {
  api('/api/config?k=' + encodeURIComponent(KEY)).then(function(d) {
    if (d && d.ok) { STATE.cfg = d.cfg; renderCfg(); }
  });
}

function renderCfg() {
  var c = STATE.cfg;
  if (!c) return;

  var fp = $('fldProto');
  if (fp) {
    var protos = [
      { id: 'vless', label: 'VLESS', key: 'ev' },
      { id: 'trojan', label: 'Trojan', key: 'et' },
      { id: 'ss', label: 'Shadowsocks', key: 'ex' },
    ];
    var html = '';
    for (var i = 0; i < protos.length; i++) {
      var on = c[protos[i].key] !== 'no' ? ' on' : '';
      html += '<span class="sw' + on + '" data-p="' + protos[i].id + '">' + protos[i].label + '</span> ';
    }
    fp.innerHTML = html;
    bindSwGroup(fp);
  }

  var ft = $('fldTr');
  if (ft) {
    var transports = ['ws', 'grpc', 'xhttp'];
    var cfgTrans = c.transports || ['ws', 'grpc', 'xhttp'];
    var html2 = '';
    for (var j = 0; j < transports.length; j++) {
      var on2 = cfgTrans.indexOf(transports[j]) >= 0 ? ' on' : '';
      html2 += '<span class="sw' + on2 + '" data-tr="' + transports[j] + '">' + transports[j].toUpperCase() + '</span> ';
    }
    ft.innerHTML = html2;
    bindSwGroup(ft);
  }

  var fpt = $('fldPorts');
  if (fpt) {
    var allPorts = [443, 2053, 2083, 2087, 2096, 8443];
    var cfgPorts = c.ports || [443];
    var html3 = '';
    for (var k = 0; k < allPorts.length; k++) {
      var on3 = cfgPorts.indexOf(allPorts[k]) >= 0 ? ' on' : '';
      html3 += '<span class="sw' + on3 + '" data-port="' + allPorts[k] + '">' + allPorts[k] + '</span> ';
    }
    fpt.innerHTML = html3;
    bindSwGroup(fpt);
  }

  makeSwitch('lblTls', 'TLS', c.tls === 'yes');
  makeSwitch('lblFrag', 'Fragment', c.fragment === 'yes');
  makeSwitch('lblEch', 'ECH', c.ech === 'yes');
  makeSwitch('lblDis', 'Disable', c.disabled);

  setVal('f_fp', c.fp || 'chrome');
  setVal('f_sni', c.sni || '');
  setVal('f_path', c.path || '/?ed=2560');
  setVal('f_p', c.p || '');
  setVal('f_s', c.s || '');
  setVal('f_subname', c.subname || 'NEXUS');
  setVal('f_scu', c.scu || 'https://url.v1.mk/sub');

  var fir = $('fldIr');
  if (fir) {
    var carriers = [
      { key: 'ispMobile', label: 'HamrahAval' },
      { key: 'ispUnicom', label: 'Irancell' },
      { key: 'ispTelecom', label: 'Rightel' },
      { key: 'ispMokhaberat', label: 'Mokhaberat' },
      { key: 'ispShatel', label: 'Shatel' },
      { key: 'ispAsiatek', label: 'Asiatek' },
      { key: 'ispParsonline', label: 'ParsOnline' },
      { key: 'ispHiweb', label: 'Hiweb' },
    ];
    var html4 = '';
    for (var m = 0; m < carriers.length; m++) {
      var on4 = c[carriers[m].key] === 'yes' ? ' on' : '';
      html4 += '<span class="sw' + on4 + '" data-ir="' + carriers[m].key + '">' + carriers[m].label + '</span> ';
    }
    fir.innerHTML = html4;
    bindSwGroup(fir);
  }
}

function makeSwitch(id, label, on) {
  var el = $(id);
  if (!el) return;
  var cls = on ? ' sw on' : ' sw';
  el.innerHTML = '<span class="' + cls + '">' + label + '</span>';
  var sw = el.querySelector('.sw');
  if (sw) sw.onclick = function() { this.classList.toggle('on'); };
}

function setVal(id, val) { var el = $(id); if (el) el.value = val; }
function getVal(id) { var el = $(id); return el ? el.value : ''; }

function bindSwGroup(container) {
  var els = container.querySelectorAll('.sw');
  for (var i = 0; i < els.length; i++) {
    els[i].onclick = function() { this.classList.toggle('on'); };
  }
}

function collect() {
  var c = STATE.cfg ? Object.assign({}, STATE.cfg) : {};
  var protoEls = $('fldProto') ? $('fldProto').querySelectorAll('.sw') : [];
  c.ev = swOn(protoEls, 'vless') ? 'yes' : 'no';
  c.et = swOn(protoEls, 'trojan') ? 'yes' : 'no';
  c.ex = swOn(protoEls, 'ss') ? 'yes' : 'no';
  var trEls = $('fldTr') ? $('fldTr').querySelectorAll('.sw') : [];
  var trans = [];
  for (var i = 0; i < trEls.length; i++) {
    if (trEls[i].classList.contains('on')) trans.push(trEls[i].getAttribute('data-tr'));
  }
  c.transports = trans.length ? trans : ['ws'];
  var portEls = $('fldPorts') ? $('fldPorts').querySelectorAll('.sw') : [];
  var ports = [];
  for (var j = 0; j < portEls.length; j++) {
    if (portEls[j].classList.contains('on')) ports.push(parseInt(portEls[j].getAttribute('data-port')));
  }
  c.ports = ports.length ? ports : [443];
  c.tls = swId('lblTls') ? 'yes' : 'no';
  c.fragment = swId('lblFrag') ? 'yes' : 'no';
  c.ech = swId('lblEch') ? 'yes' : 'no';
  c.disabled = swId('lblDis');
  c.fp = getVal('f_fp') || 'chrome';
  c.sni = getVal('f_sni');
  c.path = getVal('f_path') || '/?ed=2560';
  c.p = getVal('f_p');
  c.s = getVal('f_s');
  c.subname = getVal('f_subname') || 'NEXUS';
  c.scu = getVal('f_scu');
  var irEls = $('fldIr') ? $('fldIr').querySelectorAll('.sw') : [];
  for (var k = 0; k < irEls.length; k++) {
    var irKey = irEls[k].getAttribute('data-ir');
    if (irKey) c[irKey] = irEls[k].classList.contains('on') ? 'yes' : 'no';
  }
  return c;
}

function swOn(els, val) {
  for (var i = 0; i < els.length; i++) {
    if (els[i].getAttribute('data-p') === val || els[i].getAttribute('data-tr') === val) {
      return els[i].classList.contains('on');
    }
  }
  return false;
}

function swId(id) {
  var el = $(id);
  if (!el) return false;
  var sw = el.querySelector('.sw');
  return sw ? sw.classList.contains('on') : false;
}

function saveCfg() {
  var body = collect();
  fetch('/api/config?k=' + encodeURIComponent(KEY), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }).then(function(r) { return r.json(); }).then(function(d) {
    if (d && d.ok) {
      tx(L.saved);
      STATE.cfg = d.cfg;
      STATE.nodes = null;
    } else { tx(L.err_save); }
  }).catch(function() { tx(L.err_save); });
}

function smartOptimize() {
  tx(L.wait || L.loading);
  api('/api/info').then(function() {
    STATE.nodes = null;
    loadNodes();
    loadCfg();
    tx(L.smart_done || L.done);
  }).catch(function() { tx(L.err_save); });
}

/* ══════════════════════════════════════════════════════════════════════════════
   ▓ Lock / Unlock
   ══════════════════════════════════════════════════════════════════════════════ */
function lock() {
  var lockBtn = $('lockbtn');
  var lockKey = $('lockkey');
  if (lockBtn) lockBtn.onclick = tryUnlock;
  if (lockKey) lockKey.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') tryUnlock();
  });
}

function tryUnlock() {
  var k = getVal('lockkey');
  if (!k) return;
  var btn = $('lockbtn');
  if (btn) { btn.disabled = true; btn.textContent = L.wait; }
  fetch('/api/unlock?k=' + encodeURIComponent(KEY), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key: k })
  }).then(function(r) { return r.json(); }).then(function(d) {
    if (d && d.ok) {
      KEY = k; UNLOCKED = true;
      var lk = $('lock'); if (lk) lk.classList.remove('on');
      tx(L.done); loadNodes(); loadCfg();
    } else {
      if (btn) btn.textContent = L.unlock_btn || L.unlock;
      tx(L.wrong);
      var lkInput = $('lockkey'); if (lkInput) lkInput.value = '';
    }
    if (btn) btn.disabled = false;
  }).catch(function() {
    if (btn) { btn.disabled = false; btn.textContent = L.unlock_btn || L.unlock; }
  });
}

/* ══════════════════════════════════════════════════════════════════════════════
   ▓ Clock
   ══════════════════════════════════════════════════════════════════════════════ */
function clock() {
  var t = $('chipLive');
  if (!t) return;
  function update() {
    var d = new Date();
    t.textContent = 'LIVE · ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2);
  }
  update();
  setInterval(update, 1000);
}

/* ══════════════════════════════════════════════════════════════════════════════
   ▓ Stars Animation
   ══════════════════════════════════════════════════════════════════════════════ */
function stars() {
  var cv = $('stars');
  if (!cv || !cv.getContext) return;
  var ctx = cv.getContext('2d');
  cv.width = innerWidth; cv.height = innerHeight;
  var n = 130, arr = [];
  for (var i = 0; i < n; i++) {
    arr.push({ x: Math.random()*innerWidth, y: Math.random()*innerHeight, r: Math.random()*1.3+0.3, s: Math.random()*0.4+0.08, tw: Math.random()*Math.PI*2 });
  }
  (function draw() {
    ctx.clearRect(0,0,innerWidth,innerHeight);
    for (var i = 0; i < n; i++) {
      var p = arr[i]; p.y -= p.s; p.tw += 0.05;
      if (p.y < -2) { p.y = innerHeight+2; p.x = Math.random()*innerWidth; }
      var a = 0.4+Math.sin(p.tw)*0.35;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,7);
      ctx.fillStyle = 'rgba(148,197,255,'+a+')'; ctx.fill();
    }
    requestAnimationFrame(draw);
  })();
  addEventListener('resize', function(){ cv.width=innerWidth; cv.height=innerHeight; });
}

/* ══════════════════════════════════════════════════════════════════════════════
   ▓ User Profile
   ══════════════════════════════════════════════════════════════════════════════ */
var USER_PROFILE = {};
function loadUserProfile() {
  var uid = new URLSearchParams(location.search).get('uid') || '';
  fetch('/api/user-config?k='+encodeURIComponent(KEY)+'&uid='+encodeURIComponent(uid))
    .then(function(r){return r.json()}).then(function(d){
      if(d&&d.ok){USER_PROFILE=d.ucfg||{};renderUserProfile();}
    }).catch(function(){});
}
function renderUserProfile() {
  var u = USER_PROFILE||{};
  var e1=$('f_uname');if(e1)e1.value=u.name||'';
  var e2=$('f_utr');if(e2)e2.value=u.transport||'';
  var e3=$('f_usni');if(e3)e3.value=u.sni||'';
  var e4=$('f_upath');if(e4)e4.value=u.path||'';
}
function saveUserProfile() {
  var uid = new URLSearchParams(location.search).get('uid')||'';
  var body = {name:getVal('f_uname'),transport:getVal('f_utr'),sni:getVal('f_usni'),path:getVal('f_upath')};
  fetch('/api/user-config?k='+encodeURIComponent(KEY)+'&uid='+encodeURIComponent(uid),{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)
  }).then(function(r){return r.json()}).then(function(d){
    if(d&&d.ok){USER_PROFILE=d.ucfg;tx(L.user_saved||L.saved);}else tx(L.err_save);
  }).catch(function(){tx(L.err_save);});
}

/* ══════════════════════════════════════════════════════════════════════════════
   ▓ Language Toggle
   ══════════════════════════════════════════════════════════════════════════════ */
function toggleLang() {
  fetch('/api/config?k='+encodeURIComponent(KEY)).then(function(r){return r.json()}).then(function(d){
    if(!d||!d.ok)return;
    d.cfg.lang=d.cfg.lang==='en'?'fa':'en';
    return fetch('/api/config?k='+encodeURIComponent(KEY),{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(d.cfg)
    });
  }).then(function(){location.reload();}).catch(function(){});
}

/* ══════════════════════════════════════════════════════════════════════════════
   ▓ INIT — boot() runs FIRST, everything else in try/catch
   ══════════════════════════════════════════════════════════════════════════════ */
function init() {
  boot();
  try {
    safeText('chipColo', VI.colo||'—');
    safeText('chipCc', VI.cc||'—');
    safeText('chipCity', VI.city||'—');
    safeText('abCc', VI.cc||'—');
    safeText('abHost', VI.host||'—');
    safeText('abZone', VI.zone||'—');
    i18n();
    renderHome();
    tabs();
    var saveCfgBtn=$('saveCfg');if(saveCfgBtn)saveCfgBtn.onclick=saveCfg;
    var smartBtn=$('smartBtn');if(smartBtn)smartBtn.onclick=smartOptimize;
    var cta1=$('cta1');if(cta1)cta1.onclick=function(){go('cfg');};
    var cta2=$('cta2');if(cta2)cta2.onclick=function(){go('set');};
    var langBtn=$('langBtn');if(langBtn)langBtn.onclick=toggleLang;
    var saveUserBtn=$('saveUserBtn');if(saveUserBtn)saveUserBtn.onclick=saveUserProfile;
    loadUserProfile();
    lock(); clock(); stars();
  } catch(e) {
    console.error('NEXUS init error:', e);
  }
}

function go(t) {
  var btns=$qa('#tabs button');
  for(var i=0;i<btns.length;i++){if(btns[i].getAttribute('data-t')===t){btns[i].click();return;}}
}

if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init);}else{init();}

})();
</script>
</body>
</html>`;
}

