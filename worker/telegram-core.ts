import type { Env } from './env'
import { genId, nowIso, safeJsonParse } from './util'

// ══════════════════════════════════════════════════════════════════════════════
//  Telegram core — Bot API client, config resolution, access control,
//  conversation sessions and owner notifications.
//
//  The screen/UI layer lives in worker/telegram-ui.ts and the HTTP entry point
//  in worker/telegram.ts. Keeping them apart keeps every file small enough to
//  edit surgically.
// ══════════════════════════════════════════════════════════════════════════════

export interface TgUser { id: number; username?: string; first_name?: string; last_name?: string }
export interface TgMessage { message_id: number; chat: { id: number }; from?: TgUser; text?: string }
export interface TgCallbackQuery {
  id: string
  data?: string
  from?: TgUser
  message?: { message_id?: number; chat?: { id?: number } }
}
export interface TgUpdate { message?: TgMessage; callback_query?: TgCallbackQuery }

export interface BotConfigRow {
  id: string
  user_id: string
  bot_token: string
  is_active: number
  welcome_message: string
  chat_id?: string | null
  /** One-time code the owner sends as `/start <code>` to claim this bot. */
  claim_code?: string | null
}

export interface BotSession { state: string; data: Record<string, unknown> }

export interface TgButton { text: string; callback_data?: string; url?: string }
export interface TgKeyboard { inline_keyboard: TgButton[][] }
export interface Screen { text: string; keyboard?: TgKeyboard }

export interface ScreenCtx {
  env: Env
  cfg: BotConfigRow
  chatId: number | string
  telegramId: string
  /** Panel origin — used for links back into the web app. */
  origin: string
  isAdmin: boolean
}

export interface TgEnvelope<T> { ok: boolean; result?: T; description?: string }

// ── Bot API client ───────────────────────────────────────────────────────────

export async function tg<T = unknown>(token: string, method: string, body: Record<string, unknown>): Promise<TgEnvelope<T>> {
  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return (await resp.json()) as TgEnvelope<T>
  } catch {
    return { ok: false }
  }
}

export async function sendMsg(token: string, chatId: string | number, text: string, keyboard?: object): Promise<void> {
  const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }
  if (keyboard) body.reply_markup = keyboard
  await tg(token, 'sendMessage', body)
}

/** Render a screen into an existing message when possible, else send a new one. */
export async function renderScreen(
  token: string,
  chatId: string | number,
  messageId: number | null,
  screen: Screen,
): Promise<void> {
  if (messageId) {
    const res = await tg(token, 'editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: screen.text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...(screen.keyboard ? { reply_markup: screen.keyboard } : {}),
    })
    if (res.ok) return
    // 400 "message is not modified" just means the screen already shows this
    // content — nothing to do. Anything else falls back to a fresh message.
    if ((res.description ?? '').toLowerCase().includes('not modified')) return
  }
  await sendMsg(token, chatId, screen.text, screen.keyboard)
}

export function answerCb(token: string, id: string, text?: string): Promise<TgEnvelope<unknown>> {
  return tg(token, 'answerCallbackQuery', { callback_query_id: id, ...(text ? { text } : {}) })
}

/** Register the bot's command list, profile texts and menu button. */
export async function syncBotProfile(token: string, webAppUrl: string): Promise<void> {
  await tg(token, 'setMyCommands', {
    commands: [
      { command: 'start', description: 'شروع و منوی اصلی' },
      { command: 'status', description: 'داشبورد و وضعیت' },
      { command: 'workers', description: 'ورکرهای مستقرشده' },
      { command: 'deploy', description: 'استقرار ورکر جدید' },
      { command: 'panels', description: 'پنل‌های آمادهٔ استقرار' },
      { command: 'servers', description: 'پنل‌های Railway و Render' },
      { command: 'tokens', description: 'توکن‌های کلودفلر' },
      { command: 'quickstart', description: 'شروع سریع' },
      { command: 'menu', description: 'نمایش منو' },
      { command: 'help', description: 'راهنما' },
    ],
  })
  await tg(token, 'setMyDescription', {
    description: 'پنل مدیریت میلی‌کانفیگ در تلگرام — استقرار ورکر کلودفلر، مدیریت پنل‌ها و وضعیت لحظه‌ای.',
  })
  await tg(token, 'setMyShortDescription', { short_description: 'مدیریت ورکرها و پنل‌ها، مستقیم از تلگرام.' })
  await tg(token, 'setChatMenuButton', {
    menu_button: { type: 'web_app', text: 'باز کردن پنل', web_app: { url: webAppUrl } },
  })
}

// ── Config + sessions ────────────────────────────────────────────────────────

const CONFIG_COLUMNS = 'id, user_id, bot_token, is_active, welcome_message, chat_id, claim_code'

export async function getActiveConfig(env: Env): Promise<BotConfigRow | null> {
  return env.DB.prepare(`SELECT ${CONFIG_COLUMNS} FROM bot_config WHERE is_active = 1 ORDER BY created_at LIMIT 1`)
    .first<BotConfigRow>()
}

/**
 * Resolve which bot_config an incoming update belongs to. Telegram echoes back
 * the secret_token registered via setWebhook in the X-Telegram-Bot-Api-Secret-Token
 * header — use it to route precisely, so a stale or other user's active row can
 * never swallow this bot's updates. Falls back to the first active row for hooks
 * registered before secrets existed (they self-heal on the next save).
 */
export async function resolveConfig(env: Env, request: Request): Promise<BotConfigRow | null> {
  const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token')
  if (secret) {
    const bySecret = await env.DB.prepare(
      `SELECT ${CONFIG_COLUMNS} FROM bot_config WHERE webhook_secret = ? AND is_active = 1 LIMIT 1`,
    ).bind(secret).first<BotConfigRow>()
    if (bySecret) return bySecret
  }
  return getActiveConfig(env)
}

export async function saveOwnerChat(env: Env, cfg: BotConfigRow, chatId: number | string): Promise<void> {
  if (String(cfg.chat_id ?? '') === String(chatId)) return
  await env.DB.prepare('UPDATE bot_config SET chat_id = ?, updated_at = ? WHERE id = ?')
    .bind(String(chatId), nowIso(), cfg.id)
    .run()
  cfg.chat_id = String(chatId)
}

/**
 * Attach a chat to the bot as its owner.
 *
 * The owner claims the bot by sending `/start <claim_code>`, where the code is
 * shown in the web panel. Rows created before claim codes existed have none, so
 * they fall back to the legacy rule (the first chat to press /start owns it) —
 * that keeps already-running bots working and self-heals on the next save.
 *
 * Returns true when this call performed the claim.
 */
export async function maybeClaim(
  env: Env,
  cfg: BotConfigRow,
  chatId: number | string,
  telegramId: string,
  code: string,
): Promise<boolean> {
  if (!telegramId) return false
  if (String(cfg.chat_id ?? '')) return false // already owned — never re-claim
  if (cfg.claim_code && code.trim() !== cfg.claim_code) return false

  await saveOwnerChat(env, cfg, chatId)
  await env.DB.prepare('UPDATE bot_config SET claim_code = NULL, updated_at = ? WHERE id = ?')
    .bind(nowIso(), cfg.id)
    .run()
  cfg.claim_code = null
  await env.DB.prepare('INSERT INTO activity_logs (id, user_id, action, entity_type, entity_name, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(genId(), cfg.user_id, 'bot_owner_claimed', 'bot', `tg:${telegramId}`, nowIso())
    .run()
  return true
}

const sessionKey = (userId: string, telegramId: string) => `${userId}:${telegramId}`

export async function loadSession(env: Env, userId: string, telegramId: string): Promise<BotSession | null> {
  const row = await env.DB.prepare('SELECT state, data FROM bot_sessions WHERE id = ?')
    .bind(sessionKey(userId, telegramId))
    .first<{ state: string; data: string }>()
  if (!row) return null
  return { state: row.state, data: safeJsonParse<Record<string, unknown>>(row.data, {}) }
}

export async function saveSession(env: Env, userId: string, telegramId: string, session: BotSession): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO bot_sessions (id, user_id, telegram_id, state, data, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET state = excluded.state, data = excluded.data, updated_at = excluded.updated_at`,
  )
    .bind(sessionKey(userId, telegramId), userId, telegramId, session.state, JSON.stringify(session.data), nowIso())
    .run()
}

export async function clearSession(env: Env, userId: string, telegramId: string): Promise<void> {
  await env.DB.prepare('DELETE FROM bot_sessions WHERE id = ?').bind(sessionKey(userId, telegramId)).run()
}

export async function trackUser(env: Env, cfg: BotConfigRow, tgId: string, username: string | null, firstName: string | null, lastName: string | null): Promise<void> {
  const existing = await env.DB.prepare('SELECT id FROM bot_users WHERE user_id = ? AND telegram_id = ?')
    .bind(cfg.user_id, tgId)
    .first<{ id: string }>()
  if (existing) {
    await env.DB.prepare('UPDATE bot_users SET last_activity = ?, username = ?, first_name = ?, last_name = ? WHERE id = ?')
      .bind(nowIso(), username, firstName, lastName, existing.id)
      .run()
    return
  }
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

export async function checkIsAdmin(env: Env, cfgUserId: string, telegramId: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT is_admin FROM bot_users WHERE user_id = ? AND telegram_id = ?')
    .bind(cfgUserId, telegramId)
    .first<{ is_admin: number }>()
  return !!row?.is_admin
}

/** Owner chat for a user, or null when the bot has never been started. */
export async function ownerChat(env: Env, userId: string): Promise<{ bot_token: string; chat_id: string } | null> {
  const cfg = await env.DB.prepare('SELECT bot_token, chat_id FROM bot_config WHERE user_id = ? AND is_active = 1 LIMIT 1')
    .bind(userId)
    .first<{ bot_token: string; chat_id: string | null }>()
  if (!cfg?.chat_id) return null
  return { bot_token: cfg.bot_token, chat_id: cfg.chat_id }
}

export const faDate = (iso: string | null | undefined): string => {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('fa-IR')
  } catch {
    return iso.slice(0, 10)
  }
}

export const STATUS_ICON: Record<string, string> = { deployed: '✅', failed: '❌', deploying: '⏳', pending: '⏳' }
export const statusIcon = (s: string) => STATUS_ICON[s] ?? '•'

export const subUrlOf = (d: { worker_url: string | null; custom_path: string | null; uuid: string | null }) =>
  d.worker_url ? `${d.worker_url}/${d.custom_path || d.uuid || ''}` : null

// ── Owner notifications (never allowed to break a deployment) ────────────────

export async function notifyDeployment(env: Env, userId: string, workerName: string, status: 'deployed' | 'failed', workerUrl: string | null, panelUrl: string | null, error?: string | null): Promise<void> {
  try {
    const target = await ownerChat(env, userId)
    if (!target) return
    const ok = status === 'deployed'
    let msg = ok
      ? `✅ <b>استقرار با موفقیت تمام شد</b>\n\n📦 <code>${workerName}</code>`
      : `❌ <b>استقرار ناموفق بود</b>\n\n📦 <code>${workerName}</code>${error ? `\n⚠️ ${error}` : ''}`
    const rows: TgButton[][] = []
    if (ok && workerUrl) {
      msg += `\n🔗 <code>${workerUrl}</code>`
      rows.push([
        { text: '🔗 باز کردن ورکر', url: workerUrl },
        ...(panelUrl ? [{ text: '🔐 پنل', url: panelUrl }] : []),
      ])
    }
    rows.push([{ text: '📋 ورکرها', callback_data: 'l:workers:0' }, { text: '📊 داشبورد', callback_data: 'n:status' }])
    await sendMsg(target.bot_token, target.chat_id, msg, { inline_keyboard: rows })
  } catch {
    // notifications must never break deployments
  }
}

export async function notifyQuotaLevel(env: Env, userId: string, memberName: string, workerName: string, level: 1 | 2 | 3, detail: string): Promise<void> {
  try {
    const target = await ownerChat(env, userId)
    if (!target) return
    const head = level === 3 ? '⛔ سهمی تمام شد'
      : level === 2 ? '🟠 سهمی رو به اتمام (۹۰٪)'
      : '🟡 مصرف بالا (۸۰٪)'
    await sendMsg(target.bot_token, target.chat_id, `${head}\n\n👤 ${memberName} · 📦 ${workerName}\n${detail}`, {
      inline_keyboard: [[{ text: '👥 کاربران ساب', callback_data: 'l:members:0' }, { text: '🏠 منو', callback_data: 'n:menu' }]],
    })
  } catch {
    // ignore
  }
}

export async function notifyOptimizer(env: Env, userId: string, jobName: string, alive: number, total: number, subUrl: string | null): Promise<void> {
  try {
    const target = await ownerChat(env, userId)
    if (!target) return
    const msg = `⚡ <b>بهینه‌سازی کامل شد</b>\n\n📋 ${jobName}\n🟢 سالم: ${alive} از ${total}${subUrl ? `\n\n🔗 <code>${subUrl}</code>` : ''}`
    await sendMsg(target.bot_token, target.chat_id, msg, {
      inline_keyboard: [[{ text: '⚡ ساب‌های بهینه', callback_data: 'l:optimizer:0' }, { text: '🏠 منو', callback_data: 'n:menu' }]],
    })
  } catch {
    // ignore
  }
}
