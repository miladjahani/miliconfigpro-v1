/**
 * Per-panel post-deploy setup ("finalize").
 *
 * Once a Railway/Render deploy goes LIVE the status poller calls
 * `finalizeHostedPanel(base, tpl, creds)` and this module performs every
 * remaining configuration step over the panel's own HTTP API — the same way
 * StanNG's /api/setup has always worked, but unique for every panel:
 *
 *   - stanng   : POST /api/setup with the generated one-time admin creds.
 *   - x4gui    : X-UI login → create VLESS/ws inbound on 8080 + client → link.
 *   - heimdall : same X-UI flow (fixed X4GKIN creds, admin/admin fallback).
 *   - marzban  : admin token → VLESS inbound → user bound to it → sub link.
 *   - x4g      : login → default link → sub group → assign → sub URL.
 *   - pasarguard: owner creation requires a one-time CLI temp key — cannot be
 *                 automated over HTTP; returns the exact manual steps instead.
 *
 * Every step is defensive: a failed step returns `done:false` so the poller
 * retries on the next poll (the panel may still be warming up), and partial
 * successes still return whatever was already created with a clear Persian
 * note.
 */
import type { HostedPanelTemplate } from './panels'

export interface PanelSetupOutcome {
  /** false → the caller should retry on the next poll. */
  done: boolean
  /** Persian summary shown to the owner (what was configured / what remains). */
  note: string
  /** Ready-to-use VLESS link when a node was created. */
  nodeLink?: string
  /** Subscription URL when the panel exposes one. */
  subUrl?: string
}

const TIMEOUT_MS = 15_000
const XUI_WEB_BASE = '/managepanel'
const INBOUND_PORT = 8080
const WS_PATH = '/miliconfig'

function genUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

/** One fetch with a hard timeout + browser-ish UA. Returns raw parts.
 * `redirect: 'manual'` is used for login POSTs: X-UI answers with a 302 +
 * Set-Cookie, and following the redirect would discard the session cookie
 * (Workers fetch has no cookie jar). */
async function rawFetch(url: string, init: RequestInit = {}, redirect: RequestRedirect = 'follow'): Promise<{ status: number; text: string; headers: Headers }> {
  let resp: Response
  try {
    resp = await fetch(url, {
      redirect,
      ...init,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) miliconfig-setup/1.0',
        ...(init.headers ?? {}),
      },
      signal: init.signal ?? AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    throw new Error(`اتصال به پنل برقرار نشد: ${err instanceof Error ? err.message : 'network'}`)
  }
  const text = await resp.text().catch(() => '')
  return { status: resp.status, text, headers: resp.headers }
}

async function postJson(url: string, body: unknown, extraHeaders: Record<string, string> = {}, redirect: RequestRedirect = 'follow'): Promise<{ status: number; text: string; headers: Headers }> {
  return rawFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body),
  }, redirect)
}

async function postForm(url: string, params: Record<string, string>, extraHeaders: Record<string, string> = {}, redirect: RequestRedirect = 'follow'): Promise<{ status: number; text: string; headers: Headers }> {
  const form = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) form.set(k, v)
  return rawFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...extraHeaders },
    body: form.toString(),
  }, redirect)
}

function tryJson<T>(text: string): T | null {
  try {
    const v = JSON.parse(text) as T
    return v && typeof v === 'object' ? v : null
  } catch {
    return null
  }
}

function extractCookie(headers: Headers): string | null {
  const setCookies = (typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : []) as string[]
  const legacy = headers.get('set-cookie')
  if (legacy && setCookies.length === 0) setCookies.push(legacy)
  for (const sc of setCookies) {
    const name = sc.split(';')[0]?.trim()
    if (name) return name
  }
  return null
}

function hostOf(base: string): string {
  try {
    return new URL(base).host
  } catch {
    return base.replace(/^https?:\/\//, '').split('/')[0] ?? base
  }
}

function buildVlessLink(host: string, uuid: string, path: string, remark: string): string {
  // TLS on 443 with ws — matches the single-port nginx layout of the
  // 3x-ui/Heimdall repos (panel and inbound share the public domain).
  return `vless://${uuid}@${host}:443?encryption=none&security=tls&sni=${host}&fp=chrome&type=ws&host=${host}&path=${encodeURIComponent(path)}#${encodeURIComponent(remark)}`
}

// ── X-UI (3x-ui, Heimdall) ───────────────────────────────────────────────────

async function setupXui(base: string, tpl: HostedPanelTemplate, password: string | null): Promise<PanelSetupOutcome> {
  const host = hostOf(base)
  const candidates: Array<{ username: string; password: string }> = []
  if (tpl.fixedCreds?.username && (tpl.fixedCreds.password ?? '') !== '') {
    candidates.push({ username: tpl.fixedCreds.username, password: tpl.fixedCreds.password ?? '' })
  }
  candidates.push({ username: 'admin', password: password || 'admin' })
  candidates.push({ username: 'admin', password: 'admin' })

  let cookie: string | null = null
  let usedCreds: { username: string; password: string } | null = null
  for (const c of candidates) {
    try {
      // Manual redirect so the session cookie from the 302 login response is kept.
      const r = await postForm(`${base}${XUI_WEB_BASE}/login`, { username: c.username, password: c.password }, {}, 'manual')
      const ck = extractCookie(r.headers)
      if (ck && r.status >= 200 && r.status < 400) {
        cookie = ck
        usedCreds = c
        break
      }
    } catch { /* try next candidate */ }
  }
  if (!cookie) {
    return { done: false, note: 'ورود به پنل X-UI ممکن نشد — احتمالاً پنل هنوز بالا نیامده؛ خودکار دوباره تلاش می‌شود.' }
  }

  const uuid = genUuid()
  const subId = genUuid().replaceAll('-', '')
  const remark = `miliconfig-${tpl.short}`
  const settings = {
    clients: [{
      id: uuid, flow: '', email: 'miliconfig', limitIp: 0, totalGB: 0,
      expiryTime: 0, enable: true, tgId: '', subId, reset: 0,
    }],
    decryption: 'none',
    fallbacks: [],
  }
  const stream = { network: 'ws', security: 'none', wsSettings: { path: WS_PATH, headers: {} } }
  const sniffing = { enabled: true, destOverride: ['http', 'tls'] }

  // 3x-ui's API expects `settings`/`streamSettings` as JSON *strings*; some
  // forks accept nested objects — try strings first, then objects.
  const bodyVariants: unknown[] = [
    {
      up: 0, down: 0, total: 0, remark, enable: true, expiryTime: 0, listen: '',
      port: INBOUND_PORT, protocol: 'vless',
      settings: JSON.stringify(settings),
      streamSettings: JSON.stringify(stream),
      sniffing: JSON.stringify(sniffing),
    },
    { up: 0, down: 0, total: 0, remark, enable: true, expiryTime: 0, listen: '', port: INBOUND_PORT, protocol: 'vless', settings, streamSettings: stream, sniffing },
  ]

  let added = false
  for (const body of bodyVariants) {
    try {
      const r = await postJson(`${base}${XUI_WEB_BASE}/panel/inbound/add`, body, {
        Cookie: cookie,
        'X-Requested-With': 'XMLHttpRequest',
      })
      const j = tryJson<{ success?: boolean; msg?: string }>(r.text)
      if (j?.success !== false && (r.status === 200 || r.status === 201)) {
        added = true
        break
      }
    } catch { /* try next variant */ }
  }
  if (!added) {
    return { done: false, note: 'اینباند VLESS ساخته نشد (API پنل پاسخ نداد) — خودکار دوباره تلاش می‌شود.' }
  }

  const nodeLink = buildVlessLink(host, uuid, WS_PATH, remark)
  return {
    done: true,
    note: `${tpl.emoji} ${tpl.label}: ورود با ${usedCreds?.username ?? 'admin'} / ${usedCreds?.password ?? 'admin'} — اینباند VLESS/ws روی پورت 8080 و یک کلاینت آماده ساخته شد.`,
    nodeLink,
    subUrl: `${base}/sub/${subId}`,
  }
}

// ── Marzban ──────────────────────────────────────────────────────────────────

async function setupMarzban(base: string, tpl: HostedPanelTemplate, creds: { username: string | null; password: string | null }): Promise<PanelSetupOutcome> {
  const host = hostOf(base)
  const username = creds.username || 'admin'
  const password = creds.password || ''
  if (!password) return { done: true, note: 'Marzban بدون رمز ادمین مستقر شد — از کنسول Railway/Render ادمین بسازید.' }

  const tokenRes = await postForm(`${base}/api/admin/token`, { username, password, grant_type: 'password' })
  const tokenJson = tryJson<{ access_token?: string }>(tokenRes.text)
  const accessToken = tokenJson?.access_token
  if (!accessToken) {
    return { done: false, note: 'ورود به API مَربان ممکن نشد — پنل هنوز در حال بالا آمدن است؛ خودکار دوباره تلاش می‌شود.' }
  }
  const auth = { Authorization: `Bearer ${accessToken}` }

  const uuid = genUuid()
  const tag = `miliconfig-${genUuid().slice(0, 6)}`
  const inboundBody = {
    protocol: 'vless',
    tag,
    port: INBOUND_PORT,
    enable: true,
    settings: {
      clients: [{ id: uuid, flow: '', email: 'miliconfig', limitIp: 0, totalGB: 0, expiryTime: 0, enable: true, subId: '', reset: 0 }],
      decryption: 'none',
      fallbacks: [],
    },
    streamSettings: { network: 'ws', security: 'none', wsSettings: { path: WS_PATH, headers: {} } },
    sniffing: { enabled: true, destOverride: ['http', 'tls'] },
  }
  const inboundRes = await postJson(`${base}/api/inbound`, inboundBody, auth)
  const inboundJson = tryJson<{ tag?: string; id?: number | string }>(inboundRes.text)
  const inboundTag = inboundJson?.tag ?? tag

  const userRes = await postJson(`${base}/api/user`, {
    username: `miliconfig_${genUuid().slice(0, 6)}`,
    proxies: { vless: { id: uuid } },
    inbounds: { vless: [inboundTag] },
    expire: 0,
    data_limit: 0,
    data_limit_reset_strategy: 'no_reset',
    status: 'active',
  }, auth)
  const userJson = tryJson<{ username?: string }>(userRes.text)
  const user = userJson?.username

  // Marzban 0.8.x exposes the user's subscription token here.
  let subUrl: string | undefined
  if (user) {
    try {
      const subRes = await rawFetch(`${base}/api/user/${encodeURIComponent(user)}/subscription`, { headers: auth })
      const subJson = tryJson<{ subscription_url?: string; subscription_token?: string }>(subRes.text)
      if (subJson?.subscription_url) subUrl = `${base}${subJson.subscription_url.startsWith('/') ? '' : '/'}${subJson.subscription_url}`
      else if (subJson?.subscription_token) subUrl = `${base}/sub/${user}/${subJson.subscription_token}`
    } catch { /* optional — fall through */ }
  }

  const nodeLink = buildVlessLink(host, uuid, WS_PATH, `miliconfig-${tpl.short}`)
  return {
    done: true,
    note: `${tpl.emoji} ${tpl.label}: ادمین، اینباند VLESS/ws و کاربر ساخته شد — نود و ساب آماده است. (برای اتصال از بیرون، دامنه/پورت را مطابق سرور خود تنظیم کنید.)`,
    nodeLink,
    ...(subUrl ? { subUrl } : {}),
  }
}

// ── X4G Gateway ──────────────────────────────────────────────────────────────

async function setupX4g(base: string, password: string | null): Promise<PanelSetupOutcome> {
  const loginRes = await postJson(`${base}/api/login`, { password: password || 'X4GKING' })
  const cookie = extractCookie(loginRes.headers)
  if (!cookie) {
    return { done: false, note: 'ورود به X4G ممکن نشد — پنل هنوز در حال بالا آمدن است؛ خودکار دوباره تلاش می‌شود.' }
  }
  const ck = { Cookie: cookie }

  // The panel auto-creates a default link on startup — reuse it. The API
  // returns the ready vless link + /sub/{uuid} link sub for every config.
  let linkId: string | null = null
  let nodeLink: string | undefined
  const listRes = await rawFetch(`${base}/api/links`, { headers: ck })
  const listJson = tryJson<{ links?: Array<{ uuid?: string; is_default?: boolean; vless_link?: string }> }>(listRes.text)
  const links = listJson?.links ?? []
  const def = links.find((l) => l.is_default) ?? links[0]
  linkId = def?.uuid ?? null
  nodeLink = def?.vless_link
  if (!linkId) {
    const createRes = await postJson(`${base}/api/links`, { label: 'miliconfig' }, ck)
    const createJson = tryJson<{ uuid?: string; vless_link?: string }>(createRes.text)
    linkId = createJson?.uuid ?? null
    nodeLink = createJson?.vless_link
  }
  if (!linkId) {
    return { done: false, note: 'کانفیگ پیش‌فرض X4G ساخته نشد — خودکار دوباره تلاش می‌شود.' }
  }

  // Build a sub group so the owner gets the public sub page, and attach the
  // default config to it.
  const subRes = await postJson(`${base}/api/subs`, { name: 'پیش‌فرض' }, ck)
  const subJson = tryJson<{ sub_id?: string; sub_url?: string }>(subRes.text)
  const subUrl = subJson?.sub_url
  if (subJson?.sub_id) {
    await postJson(`${base}/api/subs/${subJson.sub_id}/links`, { link_id: linkId, action: 'add' }, ck).catch(() => null)
  }

  return {
    done: true,
    note: `${tplEmoji('x4g')} X4G: ورود با رمز ادمین — کانفیگ پیش‌فرض و گروه ساب «پیش‌فرض» آماده شد.`,
    ...(nodeLink ? { nodeLink } : {}),
    ...(subUrl ? { subUrl } : {}),
  }
}

// ── StanNG ───────────────────────────────────────────────────────────────────

async function setupStanng(base: string, creds: { username: string | null; password: string | null }): Promise<PanelSetupOutcome> {
  if (!creds.username || !creds.password) {
    return { done: true, note: 'StanNG بدون ادمین یکبارمصرف مستقر شد — از /login اولین ادمین را بسازید.' }
  }
  const r = await postJson(`${base}/api/setup`, { username: creds.username, password: creds.password })
  // 200 = configured; 400 = already configured (also fine).
  const ok = r.status === 200 || r.status === 201 || r.status === 400
  if (!ok) return { done: false, note: 'تنظیم خودکار StanNG پاسخ نداد — خودکار دوباره تلاش می‌شود.' }
  return { done: true, note: `${tplEmoji('stanng')} StanNG: ادمین ساخته شد و پنل آماده است — ورود با ${creds.username} / ${creds.password}.` }
}

// ── PasarGuard ───────────────────────────────────────────────────────────────

function setupPasarguard(tpl: HostedPanelTemplate): PanelSetupOutcome {
  return {
    done: true,
    note: `${tpl.emoji} ${tpl.label}: ادمین باید یک‌بار از کنسول ساخته شود — در کنسول Railway/Render اجرا کنید: <code>pasarguard cli admins --create admin</code>`,
  }
}

function tplEmoji(slug: string): string {
  const map: Record<string, string> = { stanng: '🛡️', x4gui: '📡', heimdall: '🧭', marzban: '🟣', pasarguard: '🛡️', x4g: '⚡' }
  return map[slug] ?? '📦'
}

/** Run the per-panel post-deploy setup. Never throws — returns an outcome. */
export async function finalizeHostedPanel(
  base: string,
  tpl: HostedPanelTemplate,
  creds: { username: string | null; password: string | null },
): Promise<PanelSetupOutcome> {
  const cleanBase = base.replace(/\/+$/, '')
  try {
    switch (tpl.slug) {
      case 'stanng':
        return await setupStanng(cleanBase, creds)
      case 'x4gui':
      case 'heimdall':
        return await setupXui(cleanBase, tpl, creds.password)
      case 'marzban':
        return await setupMarzban(cleanBase, tpl, creds)
      case 'x4g':
        return await setupX4g(cleanBase, creds.password)
      case 'pasarguard':
        return setupPasarguard(tpl)
      default:
        return { done: true, note: `${tpl.emoji} ${tpl.label} مستقر شد — پنل از لینک پایین در دسترس است.` }
    }
  } catch (err) {
    return { done: false, note: `تنظیم خودکار موقتاً ناموفق بود (${err instanceof Error ? err.message : 'خطا'}) — خودکار دوباره تلاش می‌شود.` }
  }
}