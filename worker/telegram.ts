import type { Env } from './env'
import { genId, nowIso } from './util'

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
 *  Falls back to the legacy "first active row" for hooks registered before
 *  secrets existed (they self-heal on the next save/reconnect). */
async function resolveConfig(env: Env, request: Request): Promise<BotConfigRow | null> {
  const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token')
  if (secret) {
    const bySecret = await env.DB.prepare(
      'SELECT id, user_id, bot_token, is_active, welcome_message, chat_id FROM bot_config WHERE webhook_secret = ? AND is_active = 1 LIMIT 1',
    ).bind(secret).first<BotConfigRow>()
    if (bySecret) return bySecret
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
    await env.DB.prepare(
      `INSERT INTO bot_users (id, user_id, telegram_id, username, first_name, last_name, is_active, is_admin, created_at, last_activity)
       VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`,
    )
      .bind(genId(), cfg.user_id, tgId, username, firstName, lastName, nowIso(), nowIso())
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

async function findWorker(env: Env, userId: string, rawName: string) {
  const wn = rawName.toLowerCase().replace(/[^a-z0-9-]/g, '')
  return env.DB.prepare('SELECT id, name, status, worker_url, panel_url, uuid, custom_path FROM deployments WHERE user_id = ? AND name = ?')
    .bind(userId, wn)
    .first<{ id: string; name: string; status: string; worker_url: string | null; panel_url: string | null; uuid: string | null; custom_path: string | null }>()
}

export async function handleTelegramWebhook(env: Env, ctx: ExecutionContext, request: Request): Promise<Response> {
  const ok = () => new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
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
    else if (cq.data?.startsWith('w:')) {
      ctx.waitUntil(sendWorkerDetail(env, cfg.bot_token, chatId, cfg.user_id, cq.data.slice(2)))
    }
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
      [{ text: '⚡ ساب‌های بهینه', callback_data: 'optimizer' }],
    ],
  }

  if (text === '/start') {
    ctx.waitUntil(saveOwnerChat(env, cfg, chatId))
    await sendMsg(bt, chatId, cfg.welcome_message, mainKeyboard)
  } else if (text.startsWith('/status')) {
    await sendStatus(env, bt, chatId, cfg.user_id, true)
  } else if (text.startsWith('/workers')) {
    await sendWorkers(env, bt, chatId, cfg.user_id)
  } else if (text.startsWith('/configs')) {
    await sendConfigs(env, bt, chatId, cfg.user_id)
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
    if (parts.length < 2) { await sendMsg(bt, chatId, '🚀 استفاده: <code>/deploy my-worker</code>') }
    else if (!(await checkIsAdmin(env, cfg.user_id, telegramId))) { await sendMsg(bt, chatId, '⛔ فقط ادمین. از پنل استقرار دهید.') }
    else {
      await sendMsg(bt, chatId, '🚀 استقرار از طریق ربات غیرفعال است — لطفاً از پنل وب استفاده کنید.')
    }
  } else if (text === '/help') {
    await sendMsg(bt, chatId, '📖 <b>دستورات:</b>\n\n/start - شروع\n/workers - ورکرها\n/config &lt;name&gt; - کانفیگ\n/sub [name] - ساب\n/panel [name] - پنل\n/status - وضعیت\n/tokens - توکن‌ها\n/help - راهنما')
  } else {
    await sendMsg(bt, chatId, 'متوجه نشدم. /help را بفرست.')
  }

  return ok()
}
