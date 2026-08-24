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
  return env.DB.prepare('SELECT id, user_id, bot_token, is_active, welcome_message FROM bot_config WHERE is_active = 1 ORDER BY created_at LIMIT 1')
    .first<BotConfigRow>()
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
  let m = '🚀 <b>ورکرها:</b>\n\n'
  for (const w of ws.results) {
    const e = w.status === 'deployed' ? '✅' : w.status === 'failed' ? '❌' : '⏳'
    m += `${e} <code>${w.name}</code>\n`
    if (w.worker_url) m += `   🔗 <code>${w.worker_url}</code>\n`
  }
  await sendMsg(bt, chatId, m)
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
    const cfg = await getActiveConfig(env)
    if (!cfg || !chatId) return ok()

    ctx.waitUntil(tgPost(cfg.bot_token, 'answerCallbackQuery', { callback_query_id: cq.id }).catch(() => null))
    if (cq.data === 'status') ctx.waitUntil(sendStatus(env, cfg.bot_token, chatId, cfg.user_id, true))
    else if (cq.data === 'workers') ctx.waitUntil(sendWorkers(env, cfg.bot_token, chatId, cfg.user_id))
    else if (cq.data === 'configs') ctx.waitUntil(sendConfigs(env, cfg.bot_token, chatId, cfg.user_id))
    return ok()
  }

  // ── Text messages ──────────────────────────────────────────────────────
  const message = update.message
  if (!message?.text) return ok()

  const cfg = await getActiveConfig(env)
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
    ],
  }

  if (text === '/start') {
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
