import type { Env } from './env'
import { createSession, genId, nowIso } from './util'

interface TgUser { id: number; username?: string; first_name?: string; last_name?: string }
interface TgMessage { chat: { id: number }; from?: TgUser; text?: string }
interface TgUpdate {
  message?: TgMessage
  callback_query?: { id: string; data?: string; message?: { chat?: { id?: number } } }
}

interface BotConfigRow {
  id: string
  user_id: string
  bot_token: string
  is_active: number
  welcome_message: string
  chat_id?: string | null
}

function tgPost(token: string, method: string, body: Record<string, unknown>): Promise<unknown> {
  return fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => r.json())
}

async function sendMsg(token: string, chatId: string | number, text: string, keyboard?: object): Promise<void> {
  const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: 'HTML' }
  if (keyboard) body.reply_markup = keyboard
  await tgPost(token, 'sendMessage', body).catch(() => null)
}

async function getActiveConfig(env: Env): Promise<BotConfigRow | null> {
  return env.DB.prepare('SELECT id, user_id, bot_token, is_active, welcome_message, chat_id FROM bot_config WHERE is_active = 1 ORDER BY created_at LIMIT 1')
    .first<BotConfigRow>()
}

/** Resolve which bot_config an incoming update belongs to.
 *  Telegram echoes back the secret_token we registered via setWebhook in the
 *  X-Telegram-Bot-Api-Secret-Token header — use it to route precisely, so a
 *  stale or other user's active row can never swallow this bot's updates.
 *
 *  Self-heal rule: when the secret matches nothing but exactly ONE active bot
 *  exists in the whole DB, the update is still for that bot — a common case
 *  when a hook was re-registered (redeploy, second panel, manual setWebhook)
 *  and the stored secret went stale. Routing to the only bot is unambiguous.
 *  With several active bots and no secret match the identity claim cannot be
 *  verified, so the update is dropped instead of mis-routed. */
async function resolveConfig(env: Env, request: Request): Promise<BotConfigRow | null> {
  const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token')
  if (secret) {
    const bySecret = await env.DB.prepare(
      'SELECT id, user_id, bot_token, is_active, welcome_message, chat_id FROM bot_config WHERE webhook_secret = ? AND is_active = 1 LIMIT 1',
    ).bind(secret).first<BotConfigRow>()
    if (bySecret) return bySecret
    const actives = await env.DB.prepare('SELECT COUNT(*) AS c FROM bot_config WHERE is_active = 1').first<{ c: number }>()
    if ((actives?.c ?? 0) === 1) return getActiveConfig(env)
    return null
  }
  return getActiveConfig(env)
}

async function saveOwnerChat(env: Env, cfg: BotConfigRow, chatId: number | string): Promise<void> {
  if (String(cfg.chat_id ?? '') === String(chatId)) return
  await env.DB.prepare('UPDATE bot_config SET chat_id = ?, updated_at = ? WHERE id = ?')
    .bind(String(chatId), nowIso(), cfg.id)
    .run()
  cfg.chat_id = String(chatId)
}

/** Push a deployment result to the bot owner (if the bot is set up). */
export async function notifyDeployment(env: Env, userId: string, workerName: string, status: 'deployed' | 'failed', workerUrl: string | null, panelUrl: string | null, error?: string | null): Promise<void> {
  try {
    const cfg = await env.DB.prepare('SELECT id, bot_token, chat_id FROM bot_config WHERE user_id = ? AND is_active = 1 LIMIT 1')
      .bind(userId)
      .first<{ id: string; bot_token: string; chat_id: string | null }>()
    if (!cfg?.chat_id) return
    const ok = status === 'deployed'
    let msg = ok
      ? `✅ <b>استقرار موفق</b>\n\n📦 <code>${workerName}</code>`
      : `❌ <b>استقرار ناموفق</b>\n\n📦 <code>${workerName}</code>${error ? `\n⚠️ ${error}` : ''}`
    const keyboard: Record<string, unknown> = { inline_keyboard: [] as unknown[] }
    if (ok && workerUrl) {
      msg += `\n🔗 <code>${workerUrl}</code>`
      ;(keyboard.inline_keyboard as Array<Array<{ text: string; url: string }>>).push([
        { text: '🔗 باز کردن ورکر', url: workerUrl },
        ...(panelUrl ? [{ text: '🔐 پنل', url: panelUrl }] : []),
      ])
    }
    await sendMsg(cfg.bot_token, cfg.chat_id, msg, keyboard)
  } catch {
    // notifications must never break deployments
  }
}

/** Push a quota-usage alert to the bot owner.
 * level 1 = ≥80% used, 2 = ≥90%, 3 = exhausted. Dedup is handled by the
 * caller via the member's notified_level column — this just sends.
 */
export async function notifyQuotaLevel(env: Env, userId: string, memberName: string, workerName: string, level: 1 | 2 | 3, detail: string): Promise<void> {
  try {
    const cfg = await env.DB.prepare('SELECT bot_token, chat_id FROM bot_config WHERE user_id = ? AND is_active = 1 LIMIT 1')
      .bind(userId)
      .first<{ bot_token: string; chat_id: string | null }>()
    if (!cfg?.chat_id) return
    const head = level === 3 ? '⛔ سهمی تمام شد'
      : level === 2 ? '🟠 سهمی رو به اتمام (۹۰٪)'
      : '🟡 مصرف بالا (۸۰٪)'
    const msg = `${head}\n\n👤 ${memberName} · 📦 ${workerName}\n${detail}`
    await sendMsg(cfg.bot_token, cfg.chat_id, msg)
  } catch {
    // notifications must never break sub serving
  }
}

/** Push optimizer completion to the bot owner. */
export async function notifyOptimizer(env: Env, userId: string, jobName: string, alive: number, total: number, subUrl: string | null): Promise<void> {
  try {
    const cfg = await env.DB.prepare('SELECT bot_token, chat_id FROM bot_config WHERE user_id = ? AND is_active = 1 LIMIT 1')
      .bind(userId)
      .first<{ bot_token: string; chat_id: string | null }>()
    if (!cfg?.chat_id) return
    const msg = `⚡ <b>بهینه‌سازی کامل شد</b>\n\n📋 ${jobName}\n🟢 سالم: ${alive} از ${total}${subUrl ? `\n\n🔗 ساب بهینه:\n<code>${subUrl}</code>` : ''}`
    await sendMsg(cfg.bot_token, cfg.chat_id, msg)
  } catch {
    // ignore
  }
}

async function trackUser(env: Env, cfg: BotConfigRow, tgId: string, username: string | null, firstName: string | null, lastName: string | null): Promise<void> {
  const existing = await env.DB.prepare('SELECT id FROM bot_users WHERE user_id = ? AND telegram_id = ?')
    .bind(cfg.user_id, tgId)
    .first<{ id: string }>()
  if (existing) {
    await env.DB.prepare('UPDATE bot_users SET last_activity = ?, username = ?, first_name = ?, last_name = ? WHERE id = ?')
      .bind(nowIso(), username, firstName, lastName, existing.id)
      .run()
  } else {
    const prevCount = await env.DB.prepare('SELECT COUNT(*) AS c FROM bot_users WHERE user_id = ?').bind(cfg.user_id).first<{ c: number }>()
    const isFirstOwner = (prevCount?.c ?? 0) === 0
    await env.DB.prepare(
      `INSERT INTO bot_users (id, user_id, telegram_id, username, first_name, last_name, is_active, is_admin, created_at, last_activity)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    )
      .bind(genId(), cfg.user_id, tgId, username, firstName, lastName, isFirstOwner ? 1 : 0, nowIso(), nowIso())
      .run()
    await env.DB.prepare('INSERT INTO activity_logs (id, user_id, action, entity_type, entity_name, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(genId(), cfg.user_id, 'bot_user_joined', 'bot', username ? `@${username}` : firstName, nowIso())
      .run()
  }
}

async function checkIsAdmin(env: Env, cfgUserId: string, telegramId: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT is_admin FROM bot_users WHERE user_id = ? AND telegram_id = ?')
    .bind(cfgUserId, telegramId)
    .first<{ is_admin: number }>()
  return !!row?.is_admin
}

async function sendStatus(env: Env, bt: string, chatId: number | string, userId: string, active: boolean): Promise<void> {
  const tokens = await env.DB.prepare('SELECT COUNT(*) AS c FROM cf_tokens WHERE user_id = ?').bind(userId).first<{ c: number }>()
  const deps = await env.DB.prepare("SELECT COUNT(*) AS c FROM deployments WHERE user_id = ? AND status = 'deployed'").bind(userId).first<{ c: number }>()
  const users = await env.DB.prepare('SELECT COUNT(*) AS c FROM bot_users WHERE user_id = ?').bind(userId).first<{ c: number }>()
  await sendMsg(bt, chatId, `📊 <b>وضعیت:</b>\n\n🔑 توکن‌ها: ${tokens?.c ?? 0}\n🚀 ورکرهای مستقر: ${deps?.c ?? 0}\n👥 کاربران: ${users?.c ?? 0}\n🤖 ربات: ${active ? 'فعال ✅' : 'غیرفعال ❌'}`)
}

async function sendWorkers(env: Env, bt: string, chatId: number | string, userId: string): Promise<void> {
  const ws = await env.DB.prepare('SELECT name, status, worker_url FROM deployments WHERE user_id = ? ORDER BY created_at DESC LIMIT 10').bind(userId).all<{ name: string; status: string; worker_url: string | null }>()
  if (!ws.results.length) { await sendMsg(bt, chatId, 'هنوز ورکری مستقر نشده.'); return }
  const rows = ws.results.map((w) => {
    const e = w.status === 'deployed' ? '✅' : w.status === 'failed' ? '❌' : '⏳'
    return [{ text: `${e} ${w.name}`, callback_data: `w:${w.name}` }]
  })
  rows.push([{ text: '🔄 بروزرسانی', callback_data: 'workers' }])
  await sendMsg(bt, chatId, '🚀 <b>ورکرها</b> — روی یکی بزنید تا ساب و پنلش را ببینید:', { inline_keyboard: rows })
}

async function sendConfigs(env: Env, bt: string, chatId: number | string, userId: string): Promise<void> {
  const ws = await env.DB.prepare("SELECT name, worker_url, uuid, custom_path FROM deployments WHERE user_id = ? AND status = 'deployed' ORDER BY created_at DESC LIMIT 5").bind(userId).all<{ name: string; worker_url: string; uuid: string | null; custom_path: string | null }>()
  if (!ws.results.length) { await sendMsg(bt, chatId, '🔗 هنوز ورکر مستقر شده‌ای وجود ندارد.'); return }
  let m = '🔗 <b>کانفیگ‌های اخیر:</b>\n\n'
  for (const w of ws.results) {
    const p = w.custom_path || w.uuid || ''
    m += `📦 <code>${w.name}</code>\nساب: <code>${w.worker_url}/${p}</code>\n\n`
  }
  await sendMsg(bt, chatId, m)
}

/** One message per worker with tappable sub/panel URL buttons. */
async function sendWorkerDetail(env: Env, bt: string, chatId: number | string, userId: string, rawName: string): Promise<void> {
  const w = await findWorker(env, userId, rawName)
  if (!w) { await sendMsg(bt, chatId, `❌ <code>${rawName}</code> پیدا نشد.`); return }
  if (w.status !== 'deployed') { await sendMsg(bt, chatId, `⏳ <code>${w.name}</code> هنوز مستقر نشده.`); return }
  const subUrl = w.worker_url ? `${w.worker_url}/${w.custom_path || w.uuid || ''}` : null
  const buttons: Array<Array<{ text: string; url: string }>> = []
  if (subUrl) buttons.push([{ text: '🔗 دریافت ساب', url: subUrl }])
  if (w.panel_url) buttons.push([{ text: '🔐 باز کردن پنل', url: w.panel_url }])
  await sendMsg(bt, chatId, `📦 <b>${w.name}</b>\n${subUrl ? `🔗 ساب:\n<code>${subUrl}</code>\n\n` : ''}${w.panel_url ? `🔐 پنل:\n<code>${w.panel_url}</code>` : ''}`, buttons.length ? { inline_keyboard: buttons } : undefined)
}

async function sendOptimizerList(env: Env, bt: string, chatId: number | string, userId: string): Promise<void> {
  const jobs = await env.DB.prepare(
    "SELECT name, status, nodes_alive, nodes_total, sub_token FROM optimizer_jobs WHERE user_id = ? AND status = 'done' ORDER BY created_at DESC LIMIT 10",
  ).bind(userId).all<{ name: string; status: string; nodes_alive: number; nodes_total: number; sub_token: string }>()
  if (!jobs.results.length) { await sendMsg(bt, chatId, '⚡ هنوز بهینه‌سازی‌ای انجام نشده. از پنل وب شروع کنید.'); return }
  let m = '⚡ <b>ساب‌های بهینه:</b>\n\n'
  for (const j of jobs.results) m += `📋 <b>${j.name}</b> — ${j.nodes_alive}/${j.nodes_total} سالم\n🔗 <code>${j.sub_token}</code>\n\n`
  await sendMsg(bt, chatId, m)
}

const botSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const DEPLOY_NAME_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/
const BOT_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Call one of the panel's own authenticated routes with a short-lived session,
 *  so every step (validation, quota, KV/D1, provider API) is byte-for-byte the
 *  same as the web wizard. */
async function panelApi(env: Env, userId: string, origin: string, path: string, method: 'GET' | 'POST', body?: Record<string, unknown>) {
  const session = await createSession(env, userId)
  try {
    const resp = await fetch(`${origin}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const data = await resp.json().catch(() => null) as { error?: string } | null
    return resp.ok
      ? { ok: true as const, status: resp.status, data: (data ?? {}) as Record<string, unknown> }
      : { ok: false as const, status: resp.status, data: null as null, error: data?.error ?? `خطای سرور (HTTP ${resp.status})` }
  } catch {
    return { ok: false as const, status: 0, data: null as null, error: 'ارتباط با سرور پنل برقرار نشد' }
  } finally {
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(session.token).run().catch(() => null)
  }
}

async function latestActiveToken(env: Env, userId: string, table: string): Promise<{ id: string; name: string } | null> {
  return env.DB.prepare(`SELECT id, name FROM ${table} WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`)
    .bind(userId).first<{ id: string; name: string }>()
}

/** Cloudflare — like the web wizard: edgetunnel source, auto KV + D1 binding +
 *  gRPC/WebSocket. Custom UUID and a public sub path (/my …) are supported, so
 *  the resulting sub link needs no login. Completion is pushed automatically by
 *  the panel's own notifyDeployment when runDeployment finishes. */
async function botDeployCf(env: Env, bt: string, chatId: string | number, userId: string, rawName: string, uuidArg: string, pathArg: string, origin: string): Promise<void> {
  const name = rawName.trim().toLowerCase()
  if (!DEPLOY_NAME_RE.test(name)) { await sendMsg(bt, chatId, '❌ نام ورکر نامعتبر است — فقط حروف کوچک انگلیسی، عدد و خط تیره.'); return }
  if (uuidArg && !BOT_UUID_RE.test(uuidArg)) { await sendMsg(bt, chatId, '❌ UUID نامعتبر است — از <code>auto</code> استفاده کنید یا یک UUID استاندارد بفرستید.'); return }
  const uuid = uuidArg || crypto.randomUUID()
  const customPath = pathArg ? pathArg.replace(/^\/+/, '').replace(/\/+$/, '') : ''
  if (customPath && !/^[A-Za-z0-9_/-]{1,80}$/.test(customPath)) { await sendMsg(bt, chatId, '❌ مسیر نامعتبر است — فقط حروف، عدد، خط تیره و / (مثل <code>my</code> یا <code>sub/my</code>).'); return }
  const tok = await latestActiveToken(env, userId, 'cf_tokens')
  if (!tok) { await sendMsg(bt, chatId, '🔑 توکن Cloudflare فعالی نیست — اول از پنل وب (بخش توکن‌ها) یک توکن با دسترسی Workers Scripts و KV اضافه کنید.'); return }
  const res = await panelApi(env, userId, origin, '/api/deployments', 'POST', {
    name,
    uuid,
    method: 'workers',
    worker_source: 'edgetunnel',
    cf_token_id: tok.id,
    ...(customPath ? { custom_path: customPath } : {}),
  })
  if (!res.ok) { await sendMsg(bt, chatId, `❌ استقرار <b>${name}</b> شروع نشد: ${res.error}`); return }
  await sendMsg(bt, chatId,
    `🚀 استقرار کلودفلر <b>${name}</b> شروع شد — دقیقاً مثل پنل وب:\n\n` +
    `🔑 توکن: <code>${tok.name}</code>\n` +
    `🆔 UUID: <code>${uuid}</code>\n` +
    (customPath ? `📍 مسیر ساب: <code>/${customPath}</code>\n` : '') +
    `\nساخت KV، اتصال D1 و فعال‌سازی gRPC/WebSocket خودکار انجام می‌شود.\nوقتی تمام شد نتیجه را همین‌جا می‌فرستم — ساب‌لینک بدون لاگین بعداً با /config <name> در دسترس است.`)
}

/** Railway — same flow as the wizard (project + service + US deploy + auto setup). */
async function botDeployRailway(env: Env, bt: string, chatId: string | number, userId: string, rawName: string, origin: string, ctx: ExecutionContext): Promise<void> {
  const name = rawName.trim().toLowerCase()
  if (!DEPLOY_NAME_RE.test(name)) { await sendMsg(bt, chatId, '❌ نام پروژه نامعتبر است.'); return }
  const tok = await latestActiveToken(env, userId, 'railway_tokens')
  if (!tok) { await sendMsg(bt, chatId, '🚂 توکن Railway فعالی نیست — اول از پنل وب (بخش توکن‌ها) اضافه کنید.'); return }
  const res = await panelApi(env, userId, origin, '/api/railway/deploy', 'POST', { token_id: tok.id, name, region: 'us-west2' })
  if (!res.ok) { await sendMsg(bt, chatId, `❌ استقرار Railway <b>${name}</b> شروع نشد: ${res.error}`); return }
  const data = res.data as { deploymentId?: string }
  await sendMsg(bt, chatId, `🚂 استقرار Railway <b>${name}</b> شروع شد (منطقه us-west2) با توکن <code>${tok.name}</code>. وضعیت را دنبال می‌کنم و همین‌جا خبر می‌دهم.`)
  if (data.deploymentId) ctx.waitUntil(pollRailwayDeploy(env, bt, chatId, userId, origin, tok.id, data.deploymentId))
}

/** Render — same flow as the wizard (Blueprint service + deploy). */
async function botDeployRender(env: Env, bt: string, chatId: string | number, userId: string, rawName: string, origin: string, ctx: ExecutionContext): Promise<void> {
  const name = rawName.trim().toLowerCase()
  if (!DEPLOY_NAME_RE.test(name)) { await sendMsg(bt, chatId, '❌ نام سرویس نامعتبر است.'); return }
  const tok = await latestActiveToken(env, userId, 'render_tokens')
  if (!tok) { await sendMsg(bt, chatId, '🧊 کلید API رندر فعالی نیست — اول از پنل وب (بخش توکن‌ها) اضافه کنید.'); return }
  const res = await panelApi(env, userId, origin, '/api/render/deploy', 'POST', { token_id: tok.id, name })
  if (!res.ok) { await sendMsg(bt, chatId, `❌ استقرار Render <b>${name}</b> شروع نشد: ${res.error}`); return }
  const data = res.data as { deployId?: string; serviceId?: string }
  await sendMsg(bt, chatId, `🧊 استقرار Render <b>${name}</b> شروع شد با کلید <code>${tok.name}</code>. وضعیت را دنبال می‌کنم و همین‌جا خبر می‌دهم.`)
  if (data.deployId && data.serviceId) ctx.waitUntil(pollRenderDeploy(env, bt, chatId, userId, origin, tok.id, data.deployId, data.serviceId))
}

/** Poll the panel's own Railway status route until the deploy finishes, then
 *  push the public panel URL and the one-time admin credentials to the chat. */
async function pollRailwayDeploy(env: Env, bt: string, chatId: string | number, userId: string, origin: string, tokenId: string, deploymentId: string): Promise<void> {
  for (let i = 0; i < 14; i++) {
    await botSleep(15000)
    await panelApi(env, userId, origin, `/api/railway/status?token_id=${encodeURIComponent(tokenId)}&deployment_id=${encodeURIComponent(deploymentId)}`, 'GET')
    const row = await env.DB.prepare('SELECT status, url, panel_url FROM hosted_deployments WHERE id = ? AND user_id = ?').bind(deploymentId, userId).first<{ status: string; url: string | null; panel_url: string | null }>()
    if (!row) return
    if (row.status === 'success') {
      const creds = await env.DB.prepare('SELECT domain, admin_username, admin_password FROM railway_deploys WHERE id = ? AND user_id = ?').bind(deploymentId, userId).first<{ domain: string | null; admin_username: string | null; admin_password: string | null }>()
      const pub = row.url ?? (creds?.domain ? `https://${creds.domain}` : null)
      const panel = row.panel_url ?? (pub ? `${pub.replace(/\/+$/, '')}/login` : null)
      let m = `✅ <b>استقرار Railway تمام شد</b>\n\n🔗 آدرس: <code>${pub ?? '—'}</code>\n🔐 پنل (لاگین): <code>${panel ?? '—'}</code>`
      if (creds?.admin_username && creds.admin_password) m += `\n\n👤 کاربر: <code>${creds.admin_username}</code>\n🔑 گذرواژه: <code>${creds.admin_password}</code>`
      await sendMsg(bt, chatId, m)
      return
    }
    if (row.status === 'failed') {
      await sendMsg(bt, chatId, `❌ استقرار Railway ناموفق بود — جزئیات را در پنل وب (پنل‌های میزبانی‌شده) ببینید.`)
      return
    }
  }
  await sendMsg(bt, chatId, '⏳ استقرار Railway هنوز در جریان است — چند دقیقه بعد /status بزنید یا در پنل وب دنبال کنید.')
}

async function pollRenderDeploy(env: Env, bt: string, chatId: string | number, userId: string, origin: string, tokenId: string, deployId: string, serviceId: string): Promise<void> {
  for (let i = 0; i < 14; i++) {
    await botSleep(15000)
    await panelApi(env, userId, origin, `/api/render/status?token_id=${encodeURIComponent(tokenId)}&deploy_id=${encodeURIComponent(deployId)}&service_id=${encodeURIComponent(serviceId)}`, 'GET')
    const row = await env.DB.prepare('SELECT status, url, panel_url, dashboard_url FROM hosted_deployments WHERE id = ? AND user_id = ?').bind(deployId, userId).first<{ status: string; url: string | null; panel_url: string | null; dashboard_url: string | null }>()
    if (!row) return
    if (row.status === 'success') {
      let m = `✅ <b>استقرار Render تمام شد</b>\n\n🔐 پنل: <code>${row.panel_url ?? row.url ?? '—'}</code>`
      if (row.dashboard_url) m += `\n📊 داشبورد Render: <code>${row.dashboard_url}</code>`
      await sendMsg(bt, chatId, m)
      return
    }
    if (row.status === 'failed') {
      await sendMsg(bt, chatId, `❌ استقرار Render ناموفق بود — جزئیات را در پنل وب (پنل‌های میزبانی‌شده) ببینید.`)
      return
    }
  }
  await sendMsg(bt, chatId, '⏳ استقرار Render هنوز در جریان است — چند دقیقه بعد /status بزنید یا در پنل وب دنبال کنید.')
}


async function findWorker(env: Env, userId: string, rawName: string) {
  const wn = rawName.toLowerCase().replace(/[^a-z0-9-]/g, '')
  return env.DB.prepare('SELECT id, name, status, worker_url, panel_url, uuid, custom_path FROM deployments WHERE user_id = ? AND name = ?')
    .bind(userId, wn)
    .first<{ id: string; name: string; status: string; worker_url: string | null; panel_url: string | null; uuid: string | null; custom_path: string | null }>()
}

/** List the user's group subscriptions with live links. */
async function sendGroups(env: Env, bt: string, chatId: string | number, userId: string, origin: string): Promise<void> {
  const gs = await env.DB.prepare('SELECT name, sub_token, format FROM sub_groups WHERE user_id = ? ORDER BY created_at DESC LIMIT 10').bind(userId).all<{ name: string; sub_token: string; format: string }>()
  if (!gs.results.length) { await sendMsg(bt, chatId, '📚 هنوز ساب گروهی ساخته نشده — از پنل وب بخش «ساب گروهی» بسازید.'); return }
  const labels: Record<string, string> = { base64: 'Base64', plain: 'متن ساده', clash: 'Clash Meta', singbox: 'Sing-Box' }
  let m = '📚 <b>ساب‌های گروهی:</b>\n\n'
  for (const g of gs.results) m += `📦 <b>${g.name || 'بدون نام'}</b> · ${labels[g.format] ?? 'Base64'}\n🔗 <code>${origin}/api/sub/group/${g.sub_token}</code>\n\n`
  await sendMsg(bt, chatId, m)
}

/** Pick a worker to inspect members for. */
async function sendMemberHelp(env: Env, bt: string, chatId: string | number, userId: string): Promise<void> {
  const ws = await env.DB.prepare("SELECT name FROM deployments WHERE user_id = ? AND status = 'deployed' ORDER BY created_at DESC LIMIT 10").bind(userId).all<{ name: string }>()
  if (!ws.results.length) { await sendMsg(bt, chatId, '👥 ورکر مستقر شده‌ای نیست — اول یک ورکر مستقر کنید.'); return }
  let m = '👥 <b>کاربران</b> — نام ورکر را انتخاب و بنویسید:\n\n'
  for (const w of ws.results) m += `<code>/members ${w.name}</code>\n`
  m += '\nساخت کاربر جدید از پنل وب (تب کاربران) انجام می‌شود؛ اینجا وضعیت و سهمیه کاربران را می‌بینید.'
  await sendMsg(bt, chatId, m)
}

/** Show members of one deployed worker with live status links. */
async function sendMembers(env: Env, bt: string, chatId: string | number, userId: string, workerName: string, origin: string): Promise<void> {
  const w = await findWorker(env, userId, workerName)
  if (!w) { await sendMsg(bt, chatId, `❌ <code>${workerName}</code> پیدا نشد.`); return }
  const rows = await env.DB.prepare(
    `SELECT m.name, m.enabled, m.used_bytes, m.quota_bytes, m.expires_at, m.token
     FROM worker_members m JOIN deployments d ON d.id = m.deployment_id
     WHERE d.user_id = ? AND d.name = ? ORDER BY m.created_at DESC LIMIT 15`,
  ).bind(userId, w.name).all<{ name: string; enabled: number; used_bytes: number; quota_bytes: number | null; expires_at: string | null; token: string }>()
  if (!rows.results.length) { await sendMsg(bt, chatId, `👥 <code>${w.name}</code> هنوز کاربری ندارد — از پنل وب بسازید.`); return }
  let m = `👥 <b>${w.name}</b> — ${rows.results.length} کاربر\n\n`
  for (const r of rows.results) {
    const gb = (n: number) => `${Math.round((n / 1073741824) * 100) / 100} GB`
    const quota = r.quota_bytes != null ? gb(r.quota_bytes) : 'نامحدود'
    const used = gb(r.used_bytes ?? 0)
    const exp = r.expires_at ? new Date(r.expires_at).toLocaleDateString('fa-IR') : 'بدون انقضا'
    m += `${r.enabled ? '🟢' : '🔴'} <b>${r.name}</b> — ${used} از ${quota} · انقضا: ${exp}\n🔗 <code>${origin}/status/${r.token}</code>\n\n`
  }
  await sendMsg(bt, chatId, m)
}

export async function handleTelegramWebhook(env: Env, ctx: ExecutionContext, request: Request): Promise<Response> {
  const ok = () => new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
  const origin = new URL(request.url).origin
  let update: TgUpdate
  try {
    update = (await request.json()) as TgUpdate
  } catch {
    return ok()
  }

  // ── Inline button callbacks ────────────────────────────────────────────
  if (update.callback_query) {
    const cq = update.callback_query
    const chatId = cq.message?.chat?.id
    const cfg = await resolveConfig(env, request)
    if (!cfg || !chatId) return ok()

    ctx.waitUntil(tgPost(cfg.bot_token, 'answerCallbackQuery', { callback_query_id: cq.id }).catch(() => null))
    if (cq.data === 'status') ctx.waitUntil(sendStatus(env, cfg.bot_token, chatId, cfg.user_id, true))
    else if (cq.data === 'workers') ctx.waitUntil(sendWorkers(env, cfg.bot_token, chatId, cfg.user_id))
    else if (cq.data === 'configs') ctx.waitUntil(sendConfigs(env, cfg.bot_token, chatId, cfg.user_id))
    else if (cq.data === 'optimizer') ctx.waitUntil(sendOptimizerList(env, cfg.bot_token, chatId, cfg.user_id))
    else if (cq.data === 'deploy') {
      ctx.waitUntil(sendMsg(cfg.bot_token, chatId, '🚀 <b>استقرار — مثل پنل وب</b>\n\n☁️ کلودفلر:\n<code>/deploy cf my-worker</code>\n<code>/deploy cf my-worker auto /my</code>\n\n🚂 Railway:\n<code>/deploy railway my-panel</code>\n\n🧊 Render:\n<code>/deploy render my-panel</code>\n\nUUID دلخواه یا <code>auto</code> و مسیر ساب دلخواه (مثل <code>/my</code>) را می‌توانید مشخص کنید. ساب‌لینک نهایی بدون لاگین در دسترس است.'))
    }
        else if (cq.data === 'groups') ctx.waitUntil(sendGroups(env, cfg.bot_token, chatId, cfg.user_id, origin))
    else if (cq.data === 'members') ctx.waitUntil(sendMemberHelp(env, cfg.bot_token, chatId, cfg.user_id))
    else ctx.waitUntil(sendMsg(cfg.bot_token, chatId, 'این دکمه فعلاً در دسترس نیست — <code>/help</code> را بفرستید.'))
    return ok()
  }

  // ── Text messages ──────────────────────────────────────────────────────
  const message = update.message
  if (!message?.text) return ok()

  const cfg = await resolveConfig(env, request)
  if (!cfg) return ok()

  const bt = cfg.bot_token
  const chatId = message.chat.id
  const from = message.from
  const telegramId = String(from?.id ?? '')
  const username = from?.username ?? null
  const firstName = from?.first_name ?? null
  const lastName = from?.last_name ?? null
  const text = message.text.trim()

  if (telegramId) ctx.waitUntil(trackUser(env, cfg, telegramId, username, firstName, lastName))

  const mainKeyboard = {
    inline_keyboard: [
      [{ text: '🚀 استقرار ورکر', callback_data: 'deploy' }, { text: '📊 وضعیت', callback_data: 'status' }],
      [{ text: '📋 ورکرها', callback_data: 'workers' }, { text: '🔗 کانفیگ‌ها', callback_data: 'configs' }],
      [{ text: '⚡ ساب‌های بهینه', callback_data: 'optimizer' }, { text: '📚 ساب‌های گروهی', callback_data: 'groups' }],
      [{ text: '👥 کاربران', callback_data: 'members' }],
    ],
  }

  if (text === '/start') {
    const firstOwner = !cfg.chat_id
    await saveOwnerChat(env, cfg, chatId)
    // The first person who starts the bot binds the chat and owns the account —
    // promote them to admin so /deploy and /set work without manual setup.
    if (firstOwner && telegramId) {
      await env.DB.prepare('UPDATE bot_users SET is_admin = 1 WHERE user_id = ? AND telegram_id = ?').bind(cfg.user_id, telegramId).run()
    }
    await sendMsg(bt, chatId, cfg.welcome_message, mainKeyboard)
  } else if (text.startsWith('/status')) {
    await sendStatus(env, bt, chatId, cfg.user_id, true)
  } else if (text.startsWith('/workers')) {
    await sendWorkers(env, bt, chatId, cfg.user_id)
  } else if (text.startsWith('/configs')) {
    await sendConfigs(env, bt, chatId, cfg.user_id)
  } else if (text === '/groups') {
    await sendGroups(env, bt, chatId, cfg.user_id, origin)
  } else if (text.startsWith('/members')) {
    const parts = text.split(/\s+/)
    if (parts.length < 2) await sendMemberHelp(env, bt, chatId, cfg.user_id)
    else await sendMembers(env, bt, chatId, cfg.user_id, parts.slice(1).join('-'), origin)
  } else if (text === '/tokens') {
    const ts = await env.DB.prepare('SELECT name, status FROM cf_tokens WHERE user_id = ? ORDER BY created_at DESC').bind(cfg.user_id).all<{ name: string; status: string }>()
    if (!ts.results.length) { await sendMsg(bt, chatId, '🔑 هنوز توکنی اضافه نشده.') }
    else {
      let m = '🔑 <b>توکن‌ها:</b>\n\n'
      for (const t of ts.results) m += `${t.status === 'active' ? '✅' : '❌'} ${t.name}\n`
      await sendMsg(bt, chatId, m)
    }
  } else if (text.startsWith('/config')) {
    const parts = text.split(/\s+/)
    if (parts.length < 2) { await sendMsg(bt, chatId, '📋 استفاده: <code>/config my-worker</code>') }
    else {
      const w = await findWorker(env, cfg.user_id, parts[1])
      if (!w) { await sendMsg(bt, chatId, `❌ <code>${parts[1]}</code> پیدا نشد.`) }
      else if (w.status !== 'deployed') { await sendMsg(bt, chatId, `⏳ <code>${w.name}</code> هنوز مستقر نشده.`) }
      else {
        const p = w.custom_path || w.uuid || ''
        await sendMsg(bt, chatId, `📋 <b>${w.name}</b>\n\n🔐 پنل:\n<code>${w.panel_url ?? ''}</code>\n\n🔗 ساب:\n<code>${w.worker_url}/${p}</code>`)
      }
    }
  } else if (text.startsWith('/sub')) {
    const parts = text.split(/\s+/)
    if (parts.length < 2) { await sendConfigs(env, bt, chatId, cfg.user_id) }
    else {
      const w = await findWorker(env, cfg.user_id, parts[1])
      if (!w) { await sendMsg(bt, chatId, `❌ <code>${parts[1]}</code> پیدا نشد.`) }
      else if (w.status !== 'deployed') { await sendMsg(bt, chatId, `⏳ <code>${w.name}</code> مستقر نشده.`) }
      else { const p = w.custom_path || w.uuid || ''; await sendMsg(bt, chatId, `🔗 <b>${w.name}</b>\n\n<code>${w.worker_url}/${p}</code>`) }
    }
  } else if (text.startsWith('/panel')) {
    const parts = text.split(/\s+/)
    if (parts.length < 2) {
      const ws = await env.DB.prepare("SELECT name, panel_url FROM deployments WHERE user_id = ? AND status = 'deployed' ORDER BY created_at DESC LIMIT 10").bind(cfg.user_id).all<{ name: string; panel_url: string | null }>()
      if (!ws.results.length) { await sendMsg(bt, chatId, '🔐 ورکری نیست.') }
      else {
        let m = '🔐 <b>پنل‌ها:</b>\n\n'
        for (const w of ws.results) m += `📦 <code>${w.name}</code>\n<code>${w.panel_url ?? ''}</code>\n\n`
        await sendMsg(bt, chatId, m)
      }
    } else {
      const w = await findWorker(env, cfg.user_id, parts[1])
      if (!w) { await sendMsg(bt, chatId, `❌ <code>${parts[1]}</code> پیدا نشد.`) }
      else { await sendMsg(bt, chatId, `🔐 <b>${w.name}</b>\n\n<code>${w.panel_url ?? ''}</code>`) }
    }
  } else if (text.startsWith('/set')) {
    const parts = text.split(/\s+/)
    if (parts.length < 4) { await sendMsg(bt, chatId, '⚙️ استفاده: <code>/set worker key value</code>') }
    else if (!(await checkIsAdmin(env, cfg.user_id, telegramId))) { await sendMsg(bt, chatId, '⛔ فقط ادمین.') }
    else {
      const key = parts[2].toLowerCase()
      const val = parts.slice(3).join(' ')
      if (!['path', 'proxyip', 'region', 'homepage'].includes(key)) { await sendMsg(bt, chatId, '❌ کلید نامعتبر.') }
      else {
        const w = await findWorker(env, cfg.user_id, parts[1])
        if (!w) { await sendMsg(bt, chatId, `❌ <code>${parts[1]}</code> پیدا نشد.`) }
        else {
          const row = await env.DB.prepare('SELECT config FROM deployments WHERE id = ?').bind(w.id).first<{ config: string }>()
          let stored: Record<string, unknown> = {}
          try { stored = JSON.parse(row?.config ?? '{}') as Record<string, unknown> } catch { /* fresh */ }
          stored[key] = val
          await env.DB.prepare('UPDATE deployments SET config = ?, updated_at = ? WHERE id = ?')
            .bind(JSON.stringify(stored), nowIso(), w.id)
            .run()
          await sendMsg(bt, chatId, `✅ <code>${w.name}</code> به‌روز شد.\n${key}: <code>${val}</code>`)
        }
      }
    }
  } else if (text.startsWith('/deploy')) {
    const parts = text.split(/\s+/)
    if (!(await checkIsAdmin(env, cfg.user_id, telegramId))) { await sendMsg(bt, chatId, '⛔ فقط ادمین می‌تواند استقرار کند (پنل وب → ربات → کاربران → ادمین).') }
    else {
      const provider = (parts[1] ?? '').toLowerCase()
      const name = parts[2] ?? ''
      if ((provider === 'cf' || provider === 'cloudflare') && name) {
        let uuid = ''
        let path = ''
        let bad = ''
        for (const a of parts.slice(3)) {
          if (BOT_UUID_RE.test(a)) uuid = a
          else if (a.startsWith('/')) path = a
          else if (a.toLowerCase() === 'auto' || a.toLowerCase() === 'random') continue
          else { bad = a; break }
        }
        if (bad) await sendMsg(bt, chatId, `❌ پارامتر «${bad}» شناخته نشد — UUID یا <code>auto</code> و مسیر دلخواه (مثل <code>/my</code>) مجاز است.`)
        else await botDeployCf(env, bt, chatId, cfg.user_id, name, uuid, path, origin)
      } else if (provider === 'railway' && name) {
        await botDeployRailway(env, bt, chatId, cfg.user_id, name, origin, ctx)
      } else if (provider === 'render' && name) {
        await botDeployRender(env, bt, chatId, cfg.user_id, name, origin, ctx)
      } else {
        await sendMsg(bt, chatId, '🚀 <b>استقرار — مثل پنل وب:</b>\n\n☁️ کلودفلر:\n<code>/deploy cf my-worker</code>\n<code>/deploy cf my-worker auto /my</code>\n\n🚂 Railway:\n<code>/deploy railway my-panel</code>\n\n🧊 Render:\n<code>/deploy render my-panel</code>\n\nکلودفلر: UUID دلخواه یا <code>auto</code> و مسیر ساب دلخواه (مثل <code>/my</code>).')
      }
    }
    } else if (text === '/help') {
    await sendMsg(bt, chatId, '📖 <b>دستورات:</b>\n\n/deploy cf &lt;name&gt; [uuid|auto] [path] - استقرار کلودفلر\n/deploy railway &lt;name&gt; - استقرار روی Railway\n/deploy render &lt;name&gt; - استقرار روی Render\n/workers - ورکرها\n/config &lt;name&gt; - کانفیگ\n/sub [name] - ساب\n/panel [name] - پنل\n/groups - ساب‌های گروهی\n/members [worker] - کاربران هر ورکر\n/set &lt;worker&gt; &lt;key&gt; &lt;value&gt; - path/proxyip/region/homepage\n/status - وضعیت\n/tokens - توکن‌ها\n/help - راهنما')
    } else {
    await sendMsg(bt, chatId, 'متوجه نشدم. /help را بفرست.')
  }

  return ok()
}
