import type { Env } from './env'
import { createSession, genId, nowIso } from './util'
import { verifyRailwayToken } from './railway'
import { verifyRenderToken } from './render'
import { handleIpScanner, handleRangeScan } from './scanner'

// ─────────────────────────────────────────────────────────────────────────────
// miliconfig Telegram bot — fully button-driven menu navigation.
//
// Every panel action lives behind inline-keyboard menus with explicit
// "back / cancel" buttons. Anything that needs free text (names, tokens,
// UUIDs, paths, worker settings) runs as a short per-chat state machine
// stored on the bot_users row, so "add a token" and "deploy a worker" work
// exactly like the web wizard without typing slash commands.
// ─────────────────────────────────────────────────────────────────────────────

interface TgUser { id: number; username?: string; first_name?: string; last_name?: string }
interface TgMessage { chat: { id: number }; from?: TgUser; text?: string; message_id?: number }
interface TgCbQuery {
  id: string
  from?: TgUser
  data?: string
  message?: { chat?: { id?: number } }
}
interface TgUpdate {
  message?: TgMessage
  callback_query?: TgCbQuery
}

interface BotConfigRow {
  id: string
  user_id: string
  bot_token: string
  is_active: number
  welcome_message: string
  chat_id?: string | null
}

interface BotUserRow {
  id: string
  is_admin: number
  pending_action: string | null
  pending_data: string | null
}

type Provider = 'cf' | 'rw' | 'rd'

const PROVIDERS: Record<Provider, { table: string; label: string; emoji: string; accountHint: string; tokenHint: string }> = {
  cf: { table: 'cf_tokens', label: 'Cloudflare', emoji: '☁️', accountHint: 'حساب Cloudflare', tokenHint: 'توکن API کلودفلر' },
  rw: { table: 'railway_tokens', label: 'Railway', emoji: '🚂', accountHint: 'حساب Railway', tokenHint: 'توکن Railway' },
  rd: { table: 'render_tokens', label: 'Render', emoji: '🧊', accountHint: 'حساب Render', tokenHint: 'کلید API رندر' },
}

const KB = (rows: Array<Array<{ text: string; c?: string; u?: string }>>): object => ({
  inline_keyboard: rows.map((r) =>
    r.map((b) => (b.u ? { text: b.text, url: b.u } : { text: b.text, callback_data: b.c ?? 'm' })),
  ),
})
const btn = (text: string, c: string) => ({ text, c })
const ubtn = (text: string, u: string) => ({ text, u })

function escHtml(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] ?? ch))
}
function sanitizeRaw(s: string): string {
  return s.replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\s]/g, '').trim()
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

async function delMsg(token: string, chatId: string | number, messageId: number): Promise<void> {
  await tgPost(token, 'deleteMessage', { chat_id: chatId, message_id: messageId }).catch(() => null)
}

async function getActiveConfig(env: Env): Promise<BotConfigRow | null> {
  return env.DB.prepare('SELECT id, user_id, bot_token, is_active, welcome_message, chat_id FROM bot_config WHERE is_active = 1 ORDER BY created_at LIMIT 1')
    .first<BotConfigRow>()
}

/** Resolve which bot_config an incoming update belongs to. */
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
      ? `✅ <b>استقرار موفق</b>\n\n📦 <code>${escHtml(workerName)}</code>`
      : `❌ <b>استقرار ناموفق</b>\n\n📦 <code>${escHtml(workerName)}</code>${error ? `\n⚠️ ${escHtml(error)}` : ''}`
    const rows: Array<Array<{ text: string; u?: string; c?: string }>> = []
    if (ok && workerUrl) {
      msg += `\n🔗 <code>${escHtml(workerUrl)}</code>`
      rows.push([{ text: '🔗 باز کردن ورکر', u: workerUrl }, ...(panelUrl ? [{ text: '🔐 پنل', u: panelUrl }] : [])])
    }
    rows.push([{ text: '🏠 منو', c: 'm' }])
    await sendMsg(cfg.bot_token, cfg.chat_id, msg, KB(rows))
  } catch {
    // notifications must never break deployments
  }
}

/** Push a quota-usage alert to the bot owner. level 1 = ≥80%, 2 = ≥90%, 3 = exhausted. */
export async function notifyQuotaLevel(env: Env, userId: string, memberName: string, workerName: string, level: 1 | 2 | 3, detail: string): Promise<void> {
  try {
    const cfg = await env.DB.prepare('SELECT bot_token, chat_id FROM bot_config WHERE user_id = ? AND is_active = 1 LIMIT 1')
      .bind(userId)
      .first<{ bot_token: string; chat_id: string | null }>()
    if (!cfg?.chat_id) return
    const head = level === 3 ? '⛔ سهمی تمام شد'
      : level === 2 ? '🟠 سهمی رو به اتمام (۹۰٪)'
      : '🟡 مصرف بالا (۸۰٪)'
    const msg = `${head}\n\n👤 ${escHtml(memberName)} · 📦 ${escHtml(workerName)}\n${detail}`
    await sendMsg(cfg.bot_token, cfg.chat_id, msg)
  } catch {
    // notifications must never break sub serving
  }
}

/** Push optimizer completion to the bot owner. */
export async function notifyOptimizer(env: Env, userId: string, jobName: string, alive: number, total: number, subUrl: string | null, error?: string | null): Promise<void> {
  try {
    const cfg = await env.DB.prepare('SELECT bot_token, chat_id FROM bot_config WHERE user_id = ? AND is_active = 1 LIMIT 1')
      .bind(userId)
      .first<{ bot_token: string; chat_id: string | null }>()
    if (!cfg?.chat_id) return
    const failed = !!error
    let msg = failed
      ? `❌ <b>بهینه‌سازی ناموفق بود</b>\n\n📋 ${escHtml(jobName)}\n⚠️ ${escHtml(error)}`
      : `⚡ <b>بهینه‌سازی کامل شد</b>\n\n📋 ${escHtml(jobName)}\n🟢 سالم: ${alive} از ${total}`
    if (!failed) msg += `\n\nدر ربات از «⚡ بهینه‌ساز» یا <code>/opt</code> لینک ساب را بگیرید.`
    await sendMsg(cfg.bot_token, cfg.chat_id, msg, KB([[btn('⚡ بهینه‌ساز', 'op'), btn('🏠 منو', 'm')]]))
  } catch {
    // ignore
  }
}

const botSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const DEPLOY_NAME_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/
const BOT_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SET_KEYS = ['path', 'proxyip', 'region', 'homepage'] as const

// ── Bot user rows + per-chat pending state ────────────────────────────────

async function getBotUser(env: Env, cfgUserId: string, telegramId: string): Promise<BotUserRow | null> {
  const row = await env.DB.prepare('SELECT id, is_admin, pending_action, pending_data FROM bot_users WHERE user_id = ? AND telegram_id = ?')
    .bind(cfgUserId, telegramId)
    .first<BotUserRow>()
  if (row) return row
  const prevCount = await env.DB.prepare('SELECT COUNT(*) AS c FROM bot_users WHERE user_id = ?').bind(cfgUserId).first<{ c: number }>()
  const id = genId()
  await env.DB.prepare(
    `INSERT INTO bot_users (id, user_id, telegram_id, is_active, is_admin, created_at, last_activity) VALUES (?, ?, ?, 1, ?, ?, ?)`,
  ).bind(id, cfgUserId, telegramId, (prevCount?.c ?? 0) === 0 ? 1 : 0, nowIso(), nowIso()).run()
  return env.DB.prepare('SELECT id, is_admin, pending_action, pending_data FROM bot_users WHERE user_id = ? AND telegram_id = ?')
    .bind(cfgUserId, telegramId)
    .first<BotUserRow>()
}

/** If the owner chat (bound at first /start) is somehow not admin yet, promote it. */
async function promoteOwnerIfNeeded(env: Env, cfg: BotConfigRow, telegramId: string): Promise<void> {
  if (!cfg.chat_id || String(cfg.chat_id) !== String(telegramId)) return
  await env.DB.prepare('UPDATE bot_users SET is_admin = 1 WHERE user_id = ? AND telegram_id = ?')
    .bind(cfg.user_id, telegramId)
    .run()
}

function parsePending(row: BotUserRow): { step: string; data: Record<string, string> } | null {
  if (!row.pending_action) return null
  let data: Record<string, string> = {}
  try { data = JSON.parse(row.pending_data ?? '{}') as Record<string, string> } catch { /* empty */ }
  return { step: row.pending_action, data }
}

async function setPending(env: Env, cfgUserId: string, telegramId: string, step: string, data: Record<string, string> = {}): Promise<void> {
  await env.DB.prepare('UPDATE bot_users SET pending_action = ?, pending_data = ? WHERE user_id = ? AND telegram_id = ?')
    .bind(step, JSON.stringify(data), cfgUserId, telegramId)
    .run()
}

async function clearPending(env: Env, cfgUserId: string, telegramId: string): Promise<void> {
  await env.DB.prepare('UPDATE bot_users SET pending_action = NULL, pending_data = NULL WHERE user_id = ? AND telegram_id = ?')
    .bind(cfgUserId, telegramId)
    .run()
}

async function touchUser(env: Env, cfgUserId: string, telegramId: string): Promise<void> {
  await env.DB.prepare('UPDATE bot_users SET last_activity = ? WHERE user_id = ? AND telegram_id = ?')
    .bind(nowIso(), cfgUserId, telegramId)
    .run()
}

// ── Screens (each renders a message + its inline keyboard) ───────────────

function mainKeyboard(): object {
  return KB([
    [btn('🚀 استقرار ورکر', 'dp'), btn('📋 ورکرها', 'wk')],
    [btn('🔑 توکن‌ها', 'tkl:cf'), btn('👥 کاربران', 'mb')],
    [btn('📡 اسکنر آیپی', 'sc'), btn('⚡ بهینه‌ساز', 'op')],
    [btn('📊 وضعیت', 'st'), btn('🔗 کانفیگ‌ها', 'cfgs')],
    [btn('📚 ساب‌های گروهی', 'gr')],
  ])
}

async function showMain(env: Env, bt: string, chatId: string | number, welcome: boolean, welcomeText?: string): Promise<void> {
  const text = welcome
    ? `${welcomeText ?? 'سلام! به ربات miliconfig خوش آمدید.'}\n\nهمه‌چیز با دکمه انجام می‌شود — از منوی زیر انتخاب کنید:`
    : '🏠 <b>منوی اصلی</b>\n\nاز دکمه‌ها انتخاب کنید:'
  await sendMsg(bt, chatId, text, mainKeyboard())
}

async function showHelp(env: Env, bt: string, chatId: string | number): Promise<void> {
  await sendMsg(bt, chatId,
    '📖 <b>راهنما</b>\n\nهمه امکانات از دکمه‌ها در دسترس است:\n' +
    '🚀 <b>استقرار ورکر</b> — کلودفلر / Railway / Render مثل پنل وب (نام، UUID دلخواه یا خودکار، مسیر ساب)\n' +
    '📋 <b>ورکرها</b> — لیست، ساب/پنل، کاربران، تنظیمات و حذف\n' +
    '🔑 <b>توکن‌ها</b> — افزودن (با تأیید زنده)، فعال/غیرفعال، حذف\n' +
    '👥 <b>کاربران</b> — سهمیه و لینک وضعیت هر عضو\n\n' +
    'برای لغو هر مرحله دکمه ✖️ یا /cancel را بزنید.',
    mainKeyboard())
}

async function showStatus(env: Env, bt: string, chatId: string | number, userId: string): Promise<void> {
  const cf = await env.DB.prepare('SELECT COUNT(*) AS c FROM cf_tokens WHERE user_id = ?').bind(userId).first<{ c: number }>()
  const rw = await env.DB.prepare('SELECT COUNT(*) AS c FROM railway_tokens WHERE user_id = ?').bind(userId).first<{ c: number }>()
  const rd = await env.DB.prepare('SELECT COUNT(*) AS c FROM render_tokens WHERE user_id = ?').bind(userId).first<{ c: number }>()
  const deps = await env.DB.prepare("SELECT COUNT(*) AS c FROM deployments WHERE user_id = ? AND status = 'deployed'").bind(userId).first<{ c: number }>()
  const hosted = await env.DB.prepare("SELECT COUNT(*) AS c FROM hosted_deployments WHERE user_id = ? AND status = 'success'").bind(userId).first<{ c: number }>()
  const members = await env.DB.prepare('SELECT COUNT(*) AS c FROM worker_members WHERE owner_user_id = ?').bind(userId).first<{ c: number }>()
  const users = await env.DB.prepare('SELECT COUNT(*) AS c FROM bot_users WHERE user_id = ?').bind(userId).first<{ c: number }>()
  await sendMsg(bt, chatId,
    `📊 <b>وضعیت</b>\n\n` +
    `☁️ توکن کلودفلر: ${cf?.c ?? 0}\n🚂 توکن Railway: ${rw?.c ?? 0}\n🧊 کلید Render: ${rd?.c ?? 0}\n` +
    `🚀 ورکرهای مستقر: ${deps?.c ?? 0}\n🌐 پنل‌های میزبانی‌شده: ${hosted?.c ?? 0}\n👥 کاربران سهمی: ${members?.c ?? 0}\n🤖 کاربران ربات: ${users?.c ?? 0}`,
    KB([[btn('🔄 بروزرسانی', 'st'), btn('🏠 منو', 'm')]]))
}

async function showConfigs(env: Env, bt: string, chatId: string | number, userId: string): Promise<void> {
  const ws = await env.DB.prepare("SELECT name, worker_url, uuid, custom_path, id FROM deployments WHERE user_id = ? AND status = 'deployed' ORDER BY created_at DESC LIMIT 10").bind(userId).all<{ name: string; worker_url: string; uuid: string | null; custom_path: string | null; id: string }>()
  if (!ws.results.length) {
    await sendMsg(bt, chatId, '🔗 هنوز ورکری مستقر نشده است.', KB([[btn('🚀 استقرار ورکر', 'dp'), btn('🏠 منو', 'm')]]))
    return
  }
  const rows: Array<Array<{ text: string; u?: string; c?: string }>> = []
  for (const w of ws.results.slice(0, 6)) {
    const p = w.custom_path || w.uuid || ''
    const url = w.worker_url ? `${w.worker_url}/${p}` : ''
    rows.push([url ? ubtn(`🔗 ${w.name}`, url) : btn(`🔗 ${w.name}`, 'm')])
  }
  rows.push([btn('🏠 منو', 'm')])
  let m = '🔗 <b>ساب بدون لاگین</b> — روی هر کدام بزنید تا کپی شود:\n\n'
  for (const w of ws.results.slice(0, 6)) {
    const p = w.custom_path || w.uuid || ''
    m += `📦 <code>${escHtml(w.name)}</code>\n<code>${escHtml(w.worker_url ?? '')}/${escHtml(p)}</code>\n\n`
  }
  await sendMsg(bt, chatId, m, KB(rows))
}

async function showGroups(env: Env, bt: string, chatId: string | number, userId: string, origin: string): Promise<void> {
  const gs = await env.DB.prepare('SELECT name, sub_token, format FROM sub_groups WHERE user_id = ? ORDER BY created_at DESC LIMIT 10').bind(userId).all<{ name: string; sub_token: string; format: string }>()
  if (!gs.results.length) {
    await sendMsg(bt, chatId, '📚 هنوز ساب گروهی ساخته نشده — از پنل وب (بخش «ساب گروهی») بسازید.', KB([[btn('🏠 منو', 'm')]]))
    return
  }
  const labels: Record<string, string> = { base64: 'Base64', plain: 'متن ساده', clash: 'Clash Meta', singbox: 'Sing-Box' }
  const rows: Array<Array<{ text: string; u?: string; c?: string }>> = []
  let m = '📚 <b>ساب‌های گروهی:</b>\n\n'
  for (const g of gs.results) {
    const url = `${origin}/api/sub/group/${g.sub_token}`
    m += `📦 <b>${escHtml(g.name || 'بدون نام')}</b> · ${labels[g.format] ?? 'Base64'}\n<code>${url}</code>\n\n`
    rows.push([{ text: `📦 ${g.name || 'بدون نام'}`, u: url }])
  }
  rows.push([btn('🏠 منو', 'm')])
  await sendMsg(bt, chatId, m, KB(rows))
}

async function showOptimizer(env: Env, bt: string, chatId: string | number, userId: string): Promise<void> {
  const jobs = await env.DB.prepare(
    'SELECT name, status, nodes_alive, nodes_total, sub_token, id, created_at FROM optimizer_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 10',
  ).bind(userId).all<{ name: string; status: string; nodes_alive: number; nodes_total: number; sub_token: string; id: string; created_at: string }>()
  if (!jobs.results.length) {
    await sendMsg(bt, chatId,
      '⚡ <b>بهینه‌ساز</b>\n\nلینک ساب یا کانفیگ را به ربات بدهید تا با پینگ واقعی (TCP) نودهای سالم را نگه دارد، کلو (colo) را تأیید کند و ساب بهینه بسازد — نتیجه همین‌جا اعلام می‌شود.',
      KB([[btn('➕ بهینه‌سازی جدید', 'op:new')], [btn('🏠 منو', 'm')]]))
    return
  }
  let m = '⚡ <b>بهینه‌ساز</b>\n\n'
  const rows: Array<Array<{ text: string; u?: string; c?: string }>> = []
  for (const j of jobs.results.slice(0, 8)) {
    const icon = j.status === 'done' ? '🟢' : j.status === 'failed' ? '🔴' : j.status === 'running' ? '🔄' : '⏳'
    const date = new Date(j.created_at ?? '').toLocaleDateString('fa-IR')
    m += `${icon} <b>${escHtml(j.name)}</b> — ${j.status === 'done' ? `${j.nodes_alive}/${j.nodes_total} سالم` : j.status === 'failed' ? 'ناموفق' : j.status === 'running' ? 'در حال اجرا…' : 'در صف'} · ${date}\n`
    rows.push([{ text: `${icon} ${j.name}`, c: `oj:${j.id}` }])
  }
  rows.push([btn('➕ بهینه‌سازی جدید', 'op:new')])
  rows.push([btn('🏠 منو', 'm')])
  await sendMsg(bt, chatId, m, KB(rows))
}

async function showOptimizerDetail(env: Env, bt: string, chatId: string | number, userId: string, jobId: string, origin: string): Promise<void> {
  const j = await env.DB.prepare('SELECT id, name, status, nodes_alive, nodes_total, sub_token, error_message, created_at FROM optimizer_jobs WHERE id = ? AND user_id = ?')
    .bind(jobId, userId)
    .first<{ id: string; name: string; status: string; nodes_alive: number; nodes_total: number; sub_token: string; error_message: string | null; created_at: string }>()
  if (!j) { await sendMsg(bt, chatId, '❌ پیدا نشد.', KB([[btn('🔙 بهینه‌ساز', 'op'), btn('🏠 منو', 'm')]])); return }
  const date = new Date(j.created_at ?? '').toLocaleDateString('fa-IR')
  const icon = j.status === 'done' ? '🟢' : j.status === 'failed' ? '🔴' : j.status === 'running' ? '🔄' : '⏳'
  const subUrl = `${origin}/api/sub/opt/${j.sub_token}`
  const state = j.status === 'done' ? 'کامل شد' : j.status === 'failed' ? 'ناموفق' : j.status === 'running' ? 'در حال اجرا…' : 'در صف'
  let m = `${icon} <b>${escHtml(j.name)}</b>\n📌 ${state} · ${date}\n`
  if (j.status === 'done') m += `🟢 سالم: ${j.nodes_alive} از ${j.nodes_total}\n\n🔗 ساب بهینه:\n<code>${subUrl}</code>`
  if (j.status === 'failed' && j.error_message) m += `\n⚠️ ${escHtml(j.error_message)}`
  const rows: Array<Array<{ text: string; u?: string; c?: string }>> = []
  if (j.status === 'done') rows.push([{ text: '🔗 دریافت ساب', u: subUrl }])
  rows.push([btn('🗑 حذف', `ojd:${j.id}`)])
  rows.push([btn('🔙 بهینه‌ساز', 'op'), btn('🏠 منو', 'm')])
  await sendMsg(bt, chatId, m, KB(rows))
}

async function askOptimizerInput(env: Env, bt: string, chatId: string | number, userId: string, telegramId: string): Promise<void> {
  await setPending(env, userId, telegramId, 'op_new', {})
  await sendMsg(bt, chatId,
    '⚡ <b>بهینه‌سازی جدید</b>\n\nیک یا چند <b>لینک ساب</b> یا <b>کانفیگ</b> بفرستید (هر کدام در یک خط):\n\n<code>https://example.com/sub</code>\n<code>vless://uuid@host:443?...</code>\n<code>vmess://base64...</code>\n<code>trojan://...</code>\n<code>ss://...</code>\n\nنودها با پینگ واقعی بررسی و نودهای سالم مرتب می‌شوند.',
    KB([[btn('✖️ انصراف', 'cnf:c')]]))
}

// ── IP Scanner (real server-side probes) ─────────────────────────────────

interface BotScanOut {
  ip: string
  latencyMs: number | null
  httpLatencyMs?: number | null
  speedMbps?: number
  region?: string
  status: string
  verification?: string
  verified?: boolean
  port?: number
  protocol?: string
  proxy?: string
  source?: string
}

function scanLine(item: BotScanOut): string {
  const lat = item.latencyMs != null ? `${item.latencyMs}ms` : '—'
  const http = item.httpLatencyMs != null ? ` · HTTPS ${item.httpLatencyMs}ms` : ''
  const region = item.region ? ` [${item.region}]` : ''
  const speed = item.speedMbps != null && item.speedMbps > 0 ? ` · ⚡ ${item.speedMbps >= 1000 ? `${(item.speedMbps / 1000).toFixed(1)} Gbps` : `${item.speedMbps.toFixed(1)} Mbps`}` : ''
  const dest = item.proxy ?? item.ip
  const mark = item.verified === false ? '⚠️' : '✅'
  return `${mark} <code>${escHtml(dest)}</code> — ${lat}${http}${region}${speed}`
}

async function showScanMenu(env: Env, bt: string, chatId: string | number): Promise<void> {
  await sendMsg(bt, chatId,
    '📡 <b>اسکنر آیپی</b>\n\nپینگ‌ها از سمت سرور با دست‌shake واقعی TCP اندازه‌گیری می‌شوند (روی موبایل و ویندوز یکسان). IPهای کلودفلر با TLS واقعی هم تأیید می‌شوند.',
    KB([
      [btn('☁️ کلودفلر', 'sc:cf'), btn('🧹 IP پاک', 'sc:cl')],
      [btn('☁️ ⚡ کلودفلر + سرعت', 'sc:cfs'), btn('🧹 ⚡ IP پاک + سرعت', 'sc:cls')],
      [btn('🔀 بررسی پروکسی‌ها', 'sc:px'), btn('📡 اسکن بازه IP', 'sc:rng')],
      [btn('🏠 منو', 'm')],
    ]))
}

async function reportListScan(env: Env, bt: string, chatId: string | number, userId: string, kind: 'cf' | 'cl' | 'px', speed: boolean): Promise<void> {
  const type = kind === 'cl' ? 'clean' : 'cloudflare'
  const includeProxies = kind === 'px'
  const resp = await handleIpScanner({ type, count: includeProxies ? 5 : speed ? 8 : 12, includeProxies, speedtest: speed })
  const data = (await resp.json().catch(() => null)) as {
    success?: boolean
    error?: string
    count?: number
    results?: BotScanOut[]
    proxies?: BotScanOut[]
  } | null
  if (!data) { await sendMsg(bt, chatId, '❌ اسکن انجام نشد — دوباره تلاش کنید.', KB([[btn('📡 اسکنر آیپی', 'sc'), btn('🏠 منو', 'm')]])); return }
  const label = kind === 'cf' ? 'کلودفلر' : kind === 'cl' ? 'IP پاک' : 'پروکسی'
  const lines = (data.results ?? []).slice(0, 10)
  const proxies = (data.proxies ?? []).filter((p) => p.latencyMs != null).slice(0, 12)
  let m = `📡 اسکن <b>${label}</b>${speed ? ' + تست سرعت' : ''} — ${data.count ?? 0} IP تأییدشده\n`
  if (data.results?.length === 0 && !includeProxies) {
    m = `📡 اسکن <b>${label}</b> — هیچ IP پاسخ‌دهی پیدا نشد. ${data.error ? `(${escHtml(data.error)})` : ''} چند لحظه بعد دوباره امتحان کنید.`
    await sendMsg(bt, chatId, m, KB([[btn('📡 اسکنر آیپی', 'sc'), btn('🏠 منو', 'm')]]))
    return
  }
  if (lines.length) m += '\n' + lines.map(scanLine).join('\n')
  if (includeProxies) {
    m += `\n\n🔀 <b>پروکسی‌های تأییدشده</b> (${proxies.length}):\n`
    m += proxies.length ? proxies.map(scanLine).join('\n') : '—'
  }
  m += '\n\nمنبع: ipdb / IPDB / cf-speedtest / محدوده رسمی Cloudflare'
  await sendMsg(bt, chatId, m, KB([[btn('📡 اسکنر آیپی', 'sc'), btn('🏠 منو', 'm')]]))
}

async function reportRangeScan(env: Env, bt: string, chatId: string | number, rawRanges: string): Promise<void> {
  const resp = await handleRangeScan({ ranges: rawRanges, ports: '443', count: 20, timeout: 2500, speedtest: false })
  const data = (await resp.json().catch(() => null)) as {
    success?: boolean
    count?: number
    scanned?: number
    error?: string
    results?: BotScanOut[]
  } | null
  if (!data) { await sendMsg(bt, chatId, '❌ اسکن بازه انجام نشد.', KB([[btn('📡 اسکنر آیپی', 'sc')]])); return }
  const lines = (data.results ?? []).slice(0, 15)
  if (!lines.length) {
    await sendMsg(bt, chatId,
      `📡 اسکن بازه IP — هیچ IP پاسخ‌دهی پیدا نشد${data.error ? ` (${escHtml(data.error)})` : ''}. بازه و پورت را درست وارد کرده‌اید؟`,
      KB([[btn('📡 اسکنر آیپی', 'sc'), btn('🏠 منو', 'm')]]))
    return
  }
  const m = `📡 <b>اسکن بازه IP</b> — ${lines.length} IP زنده از ${data.scanned ?? '—'} بررسی\n\n${lines.map(scanLine).join('\n')}\n\nپورت: 443`
  await sendMsg(bt, chatId, m, KB([[btn('📡 اسکنر آیپی', 'sc'), btn('🏠 منو', 'm')]]))
}

async function showWorkerPickForMembers(env: Env, bt: string, chatId: string | number, userId: string): Promise<void> {
  const ws = await env.DB.prepare("SELECT id, name FROM deployments WHERE user_id = ? AND status = 'deployed' ORDER BY created_at DESC LIMIT 12").bind(userId).all<{ id: string; name: string }>()
  if (!ws.results.length) {
    await sendMsg(bt, chatId, '👥 ورکر مستقر شده‌ای نیست — اول یک ورکر مستقر کنید.', KB([[btn('🚀 استقرار ورکر', 'dp'), btn('🏠 منو', 'm')]]))
    return
  }
  const rows: Array<Array<{ text: string; u?: string; c?: string }>> = ws.results.map((w) => [{ text: `👥 ${w.name}`, c: `wd:${w.id}:mb` }])
  rows.push([btn('🏠 منو', 'm')])
  await sendMsg(bt, chatId, '👥 <b>کاربران</b> — ورکر را انتخاب کنید تا کاربران و سهمیه‌هایش را ببینید:', KB(rows))
}

async function showMembersOf(env: Env, bt: string, chatId: string | number, userId: string, depId: string, origin: string): Promise<void> {
  const w = await env.DB.prepare('SELECT id, name FROM deployments WHERE id = ? AND user_id = ?').bind(depId, userId).first<{ id: string; name: string }>()
  if (!w) { await sendMsg(bt, chatId, '❌ ورکر پیدا نشد.', KB([[btn('🔙 کاربران', 'mb'), btn('🏠 منو', 'm')]])); return }
  const rows = await env.DB.prepare(
    `SELECT m.name, m.enabled, m.used_bytes, m.quota_bytes, m.expires_at, m.token
     FROM worker_members m JOIN deployments d ON d.id = m.deployment_id
     WHERE d.user_id = ? AND d.id = ? ORDER BY m.created_at DESC LIMIT 15`,
  ).bind(userId, w.id).all<{ name: string; enabled: number; used_bytes: number; quota_bytes: number | null; expires_at: string | null; token: string }>()
  const gb = (n: number) => `${Math.round((n / 1073741824) * 100) / 100} GB`
  const rowsKb: Array<Array<{ text: string; u?: string; c?: string }>> = []
  if (!rows.results.length) {
    await sendMsg(bt, chatId, `👥 <code>${escHtml(w.name)}</code> هنوز کاربری ندارد — از پنل وب (تب کاربران) بسازید.`,
      KB([[btn('🔙 کاربران', 'mb'), btn('🏠 منو', 'm')]]))
    return
  }
  let m = `👥 <b>${escHtml(w.name)}</b> — ${rows.results.length} کاربر\n\n`
  for (const r of rows.results) {
    const quota = r.quota_bytes != null ? gb(r.quota_bytes) : 'نامحدود'
    const used = gb(r.used_bytes ?? 0)
    const exp = r.expires_at ? new Date(r.expires_at).toLocaleDateString('fa-IR') : 'بدون انقضا'
    m += `${r.enabled ? '🟢' : '🔴'} <b>${escHtml(r.name)}</b> — ${used} از ${quota} · انقضا: ${exp}\n`
    rowsKb.push([{ text: `🔗 وضعیت ${r.name}`, u: `${origin}/status/${r.token}` }])
  }
  rowsKb.push([btn('🔙 کاربران', 'mb'), btn('🏠 منو', 'm')])
  await sendMsg(bt, chatId, m, KB(rowsKb))
}

// ── Workers ────────────────────────────────────────────────────────────────

async function showWorkers(env: Env, bt: string, chatId: string | number, userId: string): Promise<void> {
  const cf = await env.DB.prepare('SELECT id, name, status, worker_url FROM deployments WHERE user_id = ? ORDER BY created_at DESC LIMIT 10').bind(userId).all<{ id: string; name: string; status: string; worker_url: string | null }>()
  const hosted = await env.DB.prepare('SELECT id, provider, name, status FROM hosted_deployments WHERE user_id = ? ORDER BY created_at DESC LIMIT 6').bind(userId).all<{ id: string; provider: string; name: string; status: string }>()
  const total = cf.results.length + hosted.results.length
  if (!total) {
    await sendMsg(bt, chatId, '🚀 هنوز ورکری مستقر نشده — همین حالا یکی بسازید:', KB([[btn('🚀 استقرار ورکر', 'dp'), btn('🏠 منو', 'm')]]))
    return
  }
  const rows: Array<Array<{ text: string; u?: string; c?: string }>> = []
  let m = '🚀 <b>ورکرها</b> — روی هر کدام بزنید:\n\n'
  for (const w of cf.results) {
    const e = w.status === 'deployed' ? '✅' : w.status === 'failed' ? '❌' : '⏳'
    m += `${e} <code>${escHtml(w.name)}</code> — ${w.status === 'deployed' ? 'مستقر' : w.status === 'failed' ? 'ناموفق' : 'در حال استقرار'}\n`
    rows.push([{ text: `${e} ${w.name}`, c: `wd:${w.id}` }])
  }
  for (const h of hosted.results) {
    const icon = h.provider === 'railway' ? '🚂' : '🧊'
    const e = h.status === 'success' ? '✅' : h.status === 'failed' ? '❌' : '⏳'
    m += `${e} ${icon} <code>${escHtml(h.name)}</code> — ${h.provider === 'railway' ? 'Railway' : 'Render'}\n`
    rows.push([{ text: `${e} ${icon} ${h.name}`, c: `wh:${h.id}` }])
  }
  rows.push([btn('➕ استقرار جدید', 'dp'), btn('🔄 بروزرسانی', 'wk')])
  rows.push([btn('🏠 منو', 'm')])
  await sendMsg(bt, chatId, m, KB(rows))
}

async function showWorkerDetail(env: Env, bt: string, chatId: string | number, userId: string, depId: string, origin: string): Promise<void> {
  const w = await env.DB.prepare('SELECT id, name, status, worker_url, panel_url, uuid, custom_path FROM deployments WHERE id = ? AND user_id = ?')
    .bind(depId, userId)
    .first<{ id: string; name: string; status: string; worker_url: string | null; panel_url: string | null; uuid: string | null; custom_path: string | null }>()
  if (!w) { await sendMsg(bt, chatId, '❌ ورکر پیدا نشد.', KB([[btn('🔙 ورکرها', 'wk'), btn('🏠 منو', 'm')]])); return }
  const subPath = w.custom_path || w.uuid || ''
  const subUrl = w.worker_url ? `${w.worker_url}/${subPath}` : null
  const state = w.status === 'deployed' ? '✅ مستقر'
    : w.status === 'failed' ? '❌ ناموفق'
    : w.status === 'deploying' ? '⏳ در حال استقرار'
    : `⏳ ${escHtml(w.status)}`
  let m = `📦 <b>${escHtml(w.name)}</b>\n📌 وضعیت: ${state}\n`
  if (w.worker_url) m += `🔗 آدرس:\n<code>${escHtml(w.worker_url)}</code>\n`
  if (subUrl) m += `\n🔑 ساب بدون لاگین:\n<code>${escHtml(subUrl)}</code>\n`
  if (w.panel_url) m += `\n🔐 پنل:\n<code>${escHtml(w.panel_url)}</code>`
  const rows: Array<Array<{ text: string; u?: string; c?: string }>> = []
  if (subUrl) rows.push([{ text: '🔗 دریافت ساب', u: subUrl }])
  if (w.panel_url) rows.push([{ text: '🔐 باز کردن پنل', u: w.panel_url }])
  if (w.status === 'deployed') {
    rows.push([btn('👥 کاربران', `wd:${w.id}:mb`), btn('⚙️ تنظیمات', `wd:${w.id}:cfg`)])
  }
  rows.push([btn('🗑 حذف', `wd:${w.id}:del`)])
  rows.push([btn('🔙 ورکرها', 'wk'), btn('🏠 منو', 'm')])
  await sendMsg(bt, chatId, m, KB(rows))
}

async function showHostedDetail(env: Env, bt: string, chatId: string | number, userId: string, id: string): Promise<void> {
  const h = await env.DB.prepare('SELECT id, provider, name, status, url, panel_url, dashboard_url FROM hosted_deployments WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first<{ id: string; provider: string; name: string; status: string; url: string | null; panel_url: string | null; dashboard_url: string | null }>()
  if (!h) { await sendMsg(bt, chatId, '❌ پنل پیدا نشد.', KB([[btn('🔙 ورکرها', 'wk'), btn('🏠 منو', 'm')]])); return }
  const icon = h.provider === 'railway' ? '🚂' : '🧊'
  const state = h.status === 'success' ? '✅ فعال' : h.status === 'failed' ? '❌ ناموفق' : '⏳ در حال ساخت'
  let m = `${icon} <b>${escHtml(h.name)}</b>\n📌 ${state}\n`
  if (h.panel_url || h.url) m += `\n🔐 پنل (لاگین):\n<code>${escHtml(h.panel_url ?? h.url ?? '')}</code>\n`
  const rows: Array<Array<{ text: string; u?: string; c?: string }>> = []
  if (h.panel_url || h.url) rows.push([{ text: '🔐 باز کردن پنل', u: h.panel_url ?? h.url ?? '' }])
  if (h.dashboard_url) rows.push([{ text: '📊 داشبورد سرویس‌دهنده', u: h.dashboard_url }])
  rows.push([btn('🔙 ورکرها', 'wk'), btn('🏠 منو', 'm')])
  await sendMsg(bt, chatId, m, KB(rows))
}

async function showWorkerSettings(env: Env, bt: string, chatId: string | number, userId: string, depId: string): Promise<void> {
  const w = await env.DB.prepare('SELECT name, config FROM deployments WHERE id = ? AND user_id = ?').bind(depId, userId).first<{ name: string; config: string }>()
  if (!w) { await sendMsg(bt, chatId, '❌ ورکر پیدا نشد.', KB([[btn('🔙 ورکرها', 'wk'), btn('🏠 منو', 'm')]])); return }
  let stored: Record<string, unknown> = {}
  try { stored = JSON.parse(w.config || '{}') as Record<string, unknown> } catch { /* empty */ }
  const labels: Record<string, string> = { path: '📍 مسیر (path)', proxyip: '🌐 Proxy-IP', region: '🗺 منطقه (region)', homepage: '🏠 صفحه اصلی' }
  const rows: Array<Array<{ text: string; u?: string; c?: string }>> = []
  let m = `⚙️ <b>تنظیمات ${escHtml(w.name)}</b>\n\n`
  for (const key of SET_KEYS) {
    const val = stored[key] != null ? String(stored[key]) : '—'
    m += `${labels[key]}: <code>${escHtml(val)}</code>\n`
    rows.push([btn(`✏️ ${labels[key]}`, `wd:${depId}:cfg:${key}`)])
  }
  m += '\nمقادیر در تنظیمات ورکر ذخیره می‌شوند.'
  rows.push([btn('🔙 جزئیات ورکر', `wd:${depId}`), btn('🏠 منو', 'm')])
  await sendMsg(bt, chatId, m, KB(rows))
}

async function showDeleteWorkerConfirm(env: Env, bt: string, chatId: string | number, userId: string, depId: string, telegramId: string): Promise<void> {
  const w = await env.DB.prepare('SELECT name FROM deployments WHERE id = ? AND user_id = ?').bind(depId, userId).first<{ name: string }>()
  if (!w) { await sendMsg(bt, chatId, '❌ ورکر پیدا نشد.', KB([[btn('🔙 ورکرها', 'wk')]])); return }
  await setPending(env, userId, telegramId, 'delw', { id: depId })
  await sendMsg(bt, chatId,
    `⚠️ مطمئن هستید <b>${escHtml(w.name)}</b> حذف شود؟\nاین ورکر از فهرست شما حذف و ساب‌هایش قطع می‌شود.`,
    KB([[btn('✅ بله، حذف شود', `cnf:dw:${depId}`), btn('✖️ انصراف', 'cnf:c')]]))
}

// ── Tokens ─────────────────────────────────────────────────────────────────

interface TokenRow { id: string; name: string; status: string; account_name: string | null; token_tail: string | null; created_at?: string | null }

async function listTokensOf(env: Env, userId: string, p: Provider): Promise<TokenRow[]> {
  const t = PROVIDERS[p]
  const r = await env.DB.prepare(
    `SELECT id, name, status, account_name, substr(token, -4) AS token_tail FROM ${t.table} WHERE user_id = ? ORDER BY created_at DESC LIMIT 12`,
  ).bind(userId).all<TokenRow>()
  return r.results
}

async function showTokenList(env: Env, bt: string, chatId: string | number, userId: string, p: Provider): Promise<void> {
  const t = PROVIDERS[p]
  const list = await listTokensOf(env, userId, p)
  const rows: Array<Array<{ text: string; u?: string; c?: string }>> = []
  if (!list.length) {
    await sendMsg(bt, chatId,
      `${t.emoji} <b>${t.label}</b>\n\nهنوز توکنی ندارید.`,
      KB([[btn(`➕ افزودن ${t.label}`, `tka:${p}`), btn('🏠 منو', 'm')]]))
    return
  }
  let m = `${t.emoji} <b>توکن‌های ${t.label}:</b>\n\n`
  for (const tk of list) {
    const s = tk.status === 'active' ? '✅' : '⛔'
    const acc = tk.account_name ? ` (${escHtml(tk.account_name)})` : ''
    m += `${s} <b>${escHtml(tk.name)}</b>${acc}${tk.token_tail ? ` · …${escHtml(tk.token_tail)}` : ''}\n`
    rows.push([{ text: `${s} ${tk.name}`, c: `tk:${p}:${tk.id}` }])
  }
  rows.push([btn(`➕ افزودن ${t.label}`, `tka:${p}`)])
  rows.push([btn('🏠 منو', 'm')])
  await sendMsg(bt, chatId, m, KB(rows))
}

async function showTokenDetail(env: Env, bt: string, chatId: string | number, userId: string, p: Provider, id: string): Promise<void> {
  const t = PROVIDERS[p]
  const tk = await env.DB.prepare(
    `SELECT id, name, status, account_name, created_at, substr(token, -4) AS token_tail FROM ${t.table} WHERE id = ? AND user_id = ?`,
  ).bind(id, userId).first<TokenRow>()
  if (!tk) { await sendMsg(bt, chatId, '❌ توکن پیدا نشد.', KB([[btn('🔙 توکن‌ها', `tkl:${p}`)]])); return }
  const date = new Date(tk.created_at ?? '').toLocaleDateString('fa-IR')
  await sendMsg(bt, chatId,
    `${t.emoji} <b>${escHtml(tk.name)}</b>\n` +
    `وضعیت: ${tk.status === 'active' ? '✅ فعال' : '⛔ غیرفعال'}\n` +
    `${tk.account_name ? `${t.accountHint}: <code>${escHtml(tk.account_name)}</code>\n` : ''}` +
    `${tk.token_tail ? `پایان توکن: <code>…${escHtml(tk.token_tail)}</code>\n` : ''}` +
    `ساخته‌شده: ${date}`,
    KB([
      [btn(tk.status === 'active' ? '⛔ غیرفعال کردن' : '✅ فعال کردن', `tk:${p}:${tk.id}:tog`)],
      [btn('🗑 حذف', `tk:${p}:${tk.id}:del`)],
      [btn('🔙 لیست', `tkl:${p}`), btn('🏠 منو', 'm')],
    ]))
}

async function askTokenName(env: Env, bt: string, chatId: string | number, userId: string, telegramId: string, p: Provider): Promise<void> {
  const t = PROVIDERS[p]
  await setPending(env, userId, telegramId, 'tka_n', { p })
  await sendMsg(bt, chatId,
    `➕ افزودن توکن ${t.label}\n\nیک <b>نام</b> برای این توکن بنویسید (مثلاً «اکانت اصلی»):`,
    KB([[btn('✖️ انصراف', 'cnf:c')]]))
}

async function askTokenValue(env: Env, bt: string, chatId: string | number, userId: string, telegramId: string, p: Provider, name: string): Promise<void> {
  const t = PROVIDERS[p]
  await setPending(env, userId, telegramId, 'tka_v', { p, name })
  const hint = p === 'cf' ? 'توکن API کلودفلر (صفحه profile/api-tokens)'
    : p === 'rw' ? 'توکن Railway (railway.com/account/tokens)'
    : 'کلید API رندر (dashboard.render.com/account/api-keys)'
  await sendMsg(bt, chatId,
    `${t.emoji} <b>${escHtml(name)}</b>\n\n${hint} را بفرستید.\n\n` +
    `🔒 توکن شما همین‌جا بررسی و ذخیره می‌شود و پیام حاوی توکن بلافاصله پاک می‌شود.`,
    KB([[btn('✖️ انصراف', 'cnf:c')]]))
}

async function addTokenByProvider(env: Env, userId: string, p: Provider, name: string, raw: string): Promise<{ ok: boolean; message: string; accountName?: string }> {
  const token = sanitizeRaw(raw)
  if (token.length < 10) return { ok: false, message: 'توکن خیلی کوتاه است — مقدار کامل را بفرستید.' }
  const t = PROVIDERS[p]
  try {
    let accountName: string | null = null
    if (p === 'cf') {
      const v = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const body = (await v.json().catch(() => null)) as { success?: boolean; result?: { status?: string }; errors?: Array<{ message?: string }> } | null
      if (!v.ok || body?.success !== true) {
        const why = body?.errors?.[0]?.message ?? ''
        if (v.status === 400 || v.status === 403) return { ok: false, message: `توکن کلودفلر نامعتبر است${why ? `: ${why}` : ''} — از داشبورد کلودفلر یک توکن بسازید.` }
        return { ok: false, message: `تأیید توکن کلودفلر ناموفق بود (HTTP ${v.status})${why ? `: ${why}` : ''}` }
      }
      const status = body.result?.status
      if (status && status !== 'active') return { ok: false, message: `توکن کلودفلر ${status} است — یک توکن فعال بسازید.` }
      const acc = await fetch('https://api.cloudflare.com/client/v4/accounts?per_page=1', {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.json().catch(() => null)).catch(() => null) as { result?: Array<{ name?: string }> } | null
      accountName = acc?.result?.[0]?.name ?? null
    } else if (p === 'rw') {
      const me = await verifyRailwayToken(token)
      accountName = me.email || me.name || null
    } else {
      const me = await verifyRenderToken(token)
      accountName = me.email || me.name || null
    }
    const id = genId()
    await env.DB.prepare(
      `INSERT INTO ${t.table} (id, user_id, name, token, status, account_name, created_at) VALUES (?, ?, ?, ?, 'active', ?, ?)`,
    ).bind(id, userId, name.trim(), token, accountName, nowIso()).run()
    await env.DB.prepare('INSERT INTO activity_logs (id, user_id, action, entity_type, entity_name, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(genId(), userId, `${p}_token_created`, 'token', name.trim(), nowIso())
      .run()
    return { ok: true, message: `${t.emoji} توکن <b>${escHtml(name.trim())}</b> ذخیره و تأیید شد${accountName ? ` (${escHtml(accountName)})` : ''}.`, accountName: accountName ?? undefined }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, message: `خطا: ${msg}` }
  }
}

async function toggleToken(env: Env, userId: string, p: Provider, id: string): Promise<{ ok: boolean; message: string; nowActive?: boolean }> {
  const t = PROVIDERS[p]
  const row = await env.DB.prepare(`SELECT id, status FROM ${t.table} WHERE id = ? AND user_id = ?`).bind(id, userId).first<{ id: string; status: string }>()
  if (!row) return { ok: false, message: 'توکن پیدا نشد' }
  const next = row.status === 'active' ? 'inactive' : 'active'
  await env.DB.prepare(`UPDATE ${t.table} SET status = ? WHERE id = ? AND user_id = ?`).bind(next, id, userId).run()
  return { ok: true, message: '', nowActive: next === 'active' }
}

async function removeToken(env: Env, userId: string, p: Provider, id: string): Promise<{ ok: boolean; message: string }> {
  const t = PROVIDERS[p]
  const row = await env.DB.prepare(`DELETE FROM ${t.table} WHERE id = ? AND user_id = ? RETURNING name`).bind(id, userId).first<{ name: string }>()
  if (!row) return { ok: false, message: 'توکن پیدا نشد' }
  await env.DB.prepare('INSERT INTO activity_logs (id, user_id, action, entity_type, entity_name, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(genId(), userId, `${p}_token_deleted`, 'token', row.name, nowIso())
    .run()
  return { ok: true, message: `🗑 توکن <b>${escHtml(row.name)}</b> حذف شد.` }
}

async function showDeleteTokenConfirm(env: Env, bt: string, chatId: string | number, userId: string, p: Provider, id: string, telegramId: string): Promise<void> {
  const t = PROVIDERS[p]
  const tk = await env.DB.prepare(`SELECT name FROM ${t.table} WHERE id = ? AND user_id = ?`).bind(id, userId).first<{ name: string }>()
  if (!tk) { await sendMsg(bt, chatId, '❌ توکن پیدا نشد.'); return }
  await setPending(env, userId, telegramId, 'delt', { p, id })
  await sendMsg(bt, chatId,
    `⚠️ توکن <b>${escHtml(tk.name)}</b> حذف شود؟ ورکرهایی که با این توکن ساخته شده‌اند روی حساب خودتان باقی می‌مانند، ولی استقرارهای بعدی از آن استفاده نمی‌شود.`,
    KB([[btn('✅ بله، حذف شود', `cnf:dt:${p}:${id}`), btn('✖️ انصراف', 'cnf:c')]]))
}

// ── Deploy (wizard-parity) ─────────────────────────────────────────────────

/** Call one of the panel's own authenticated routes with a short-lived session. */
async function panelApi(env: Env, userId: string, origin: string, path: string, method: 'GET' | 'POST' | 'DELETE', body?: Record<string, unknown>) {
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

interface TokenChoice { id: string; name: string }

async function activeTokens(env: Env, userId: string, p: Provider): Promise<TokenChoice[]> {
  const t = PROVIDERS[p]
  const r = await env.DB.prepare(`SELECT id, name FROM ${t.table} WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 10`).bind(userId).all<TokenChoice>()
  return r.results
}

async function showDeployProviders(env: Env, bt: string, chatId: string | number, userId: string): Promise<void> {
  const cf = await activeTokens(env, userId, 'cf')
  const rw = await activeTokens(env, userId, 'rw')
  const rd = await activeTokens(env, userId, 'rd')
  await sendMsg(bt, chatId,
    '🚀 <b>استقرار ورکر</b> — همان مراحل پنل وب (UUID دلخواه/خودکار، مسیر ساب بدون لاگین، KV و gRPC/WS خودکار)\n\n' +
    `☁️ کلودفلر: ${cf.length ? `${cf.length} توکن فعال` : 'بدون توکن فعال'}\n` +
    `🚂 Railway: ${rw.length ? `${rw.length} توکن فعال` : 'بدون توکن فعال'}\n` +
    `🧊 Render: ${rd.length ? `${rd.length} کلید فعال` : 'بدون کلید فعال'}`,
    KB([
      [btn('☁️ Cloudflare Workers', 'dpcf')],
      [btn('🚂 Railway', 'dprw')],
      [btn('🧊 Render', 'dprd')],
      [btn('🏠 منو', 'm')],
    ]))
}

async function showProviderTokenPick(env: Env, bt: string, chatId: string | number, userId: string, p: Provider, prefix: string): Promise<void> {
  const t = PROVIDERS[p]
  const list = await activeTokens(env, userId, p)
  if (!list.length) {
    await sendMsg(bt, chatId,
      `${t.emoji} برای استقرار روی ${t.label} ابتدا یک توکن فعال اضافه کنید:`,
      KB([[btn(`➕ افزودن توکن ${t.label}`, `tka:${p}`), btn('✖️ انصراف', 'm')]]))
    return
  }
  const rows: Array<Array<{ text: string; u?: string; c?: string }>> = list.map((tk) => [{ text: `${t.emoji} ${tk.name}`, c: `${prefix}:t:${tk.id}` }])
  rows.push([btn(`➕ افزودن توکن ${t.label}`, `tka:${p}`)])
  rows.push([btn('🔙 انتخاب سرویس', 'dp'), btn('🏠 منو', 'm')])
  await sendMsg(bt, chatId, `${t.emoji} <b>استقرار روی ${t.label}</b>\n\nتوکنی که با آن استقرار انجام شود را انتخاب کنید:`, KB(rows))
}

async function askDeployName(env: Env, bt: string, chatId: string | number, userId: string, telegramId: string, p: Provider, tok: TokenChoice): Promise<void> {
  const t = PROVIDERS[p]
  const step = p === 'cf' ? 'dpl_cf_name' : p === 'rw' ? 'dpl_rw_name' : 'dpl_rd_name'
  await setPending(env, userId, telegramId, step, { tok: tok.id, tokName: tok.name })
  const providerLabel = p === 'cf' ? 'کلودفلر' : p === 'rw' ? 'Railway' : 'Render'
  await sendMsg(bt, chatId,
    `${t.emoji} <b>استقرار ${providerLabel}</b> با توکن <code>${escHtml(tok.name)}</code>\n\n` +
    `نام ورکر/پروژه را بنویسید (حروف کوچک انگلیسی، عدد و خط تیره، مثل <code>my-worker</code>):`,
    KB([[btn('🔙 انتخاب توکن', prefixFor(p)), btn('✖️ انصراف', 'cnf:c')]]))
}

const prefixFor = (p: Provider) => (p === 'cf' ? 'dpcf' : p === 'rw' ? 'dprw' : 'dprd')

async function askCfUuid(env: Env, bt: string, chatId: string | number, userId: string, telegramId: string, data: Record<string, string>): Promise<void> {
  await setPending(env, userId, telegramId, 'cf_uuid', data)
  await sendMsg(bt, chatId,
    `🔑 <b>UUID</b>\n\nUUID همان کلید دسترسی پنل است. خودکار تولید شود یا خودتان وارد کنید؟`,
    KB([[btn('🎲 UUID خودکار', 'du:auto')], [btn('✍️ UUID دلخواه', 'du:custom')], [btn('✖️ انصراف', 'cnf:c')]]))
}

async function askCfPath(env: Env, bt: string, chatId: string | number, userId: string, telegramId: string, data: Record<string, string>, uuidNote: string): Promise<void> {
  await setPending(env, userId, telegramId, 'cf_path', { ...data, uuid: data.uuid ?? '' })
  await sendMsg(bt, chatId,
    `📍 <b>مسیر ساب</b>\n\nUUID: <code>${escHtml(uuidNote)}</code>\n\n` +
    `مسیر دلخواه ساب می‌خواهید؟ (مثل <code>my</code> یا <code>sub/my</code>) — اگر نخواهید، ساب از روی UUID ساخته می‌شود و همیشه بدون لاگین است.`,
    KB([[btn('⏭️ بدون مسیر', 'dpth:np')], [btn('✍️ مسیر دلخواه', 'dpth:cp')], [btn('✖️ انصراف', 'cnf:c')]]))
}

async function showCfConfirm(env: Env, bt: string, chatId: string | number, userId: string, telegramId: string, data: Record<string, string>): Promise<void> {
  const tokName = data.tokName ?? ''
  const name = data.name ?? ''
  const uuid = data.uuid || 'خودکار'
  const path = data.path || '—'
  await setPending(env, userId, telegramId, 'cf_confirm', data)
  await sendMsg(bt, chatId,
    `🚀 <b>تأیید استقرار کلودفلر</b>\n\n` +
    `📦 نام: <code>${escHtml(name)}</code>\n` +
    `🔑 توکن: <code>${escHtml(tokName)}</code>\n` +
    `🆔 UUID: <code>${escHtml(uuid)}</code>\n` +
    `📍 مسیر: <code>${escHtml(path)}</code>\n\n` +
    `ساخت KV، اتصال D1 و gRPC/WebSocket خودکار انجام می‌شود و نتیجه همین‌جا اعلام می‌شود.`,
    KB([[btn('✅ تأیید و استقرار', 'dpl:cf:go')], [btn('✖️ انصراف', 'cnf:c')]]))
}

async function runCfDeploy(env: Env, bt: string, chatId: string | number, userId: string, data: Record<string, string>, origin: string): Promise<void> {
  const name = (data.name ?? '').trim().toLowerCase()
  const tokenId = data.tok ?? ''
  const tokName = data.tokName ?? ''
  const uuidArg = data.uuid ?? ''
  const pathArg = data.path ?? ''
  if (!DEPLOY_NAME_RE.test(name)) { await sendMsg(bt, chatId, '❌ نام ورکر نامعتبر است.'); return }
  const uuid = uuidArg && BOT_UUID_RE.test(uuidArg) ? uuidArg : crypto.randomUUID()
  const customPath = pathArg ? pathArg.replace(/^\/+/, '').replace(/\/+$/, '') : ''
  const res = await panelApi(env, userId, origin, '/api/deployments', 'POST', {
    name,
    uuid,
    method: 'workers',
    worker_source: 'edgetunnel',
    cf_token_id: tokenId,
    ...(customPath ? { custom_path: customPath } : {}),
  })
  if (!res.ok) {
    await sendMsg(bt, chatId, `❌ استقرار <b>${escHtml(name)}</b> شروع نشد: ${escHtml(res.error)}`, KB([[btn('🏠 منو', 'm')]]))
    return
  }
  await sendMsg(bt, chatId,
    `🚀 استقرار کلودفلر <b>${escHtml(name)}</b> شروع شد — دقیقاً مثل پنل وب:\n\n` +
    `🔑 توکن: <code>${escHtml(tokName)}</code>\n` +
    `🆔 UUID: <code>${escHtml(uuid)}</code>\n` +
    (customPath ? `📍 مسیر ساب: <code>/${escHtml(customPath)}</code>\n` : '') +
    `\nوقتی تمام شد نتیجه را همین‌جا می‌فرستم.`,
    KB([[btn('📋 ورکرها', 'wk'), btn('🏠 منو', 'm')]]))
}

async function runRailwayDeploy(env: Env, bt: string, chatId: string | number, userId: string, data: Record<string, string>, origin: string, ctx: ExecutionContext): Promise<void> {
  const name = (data.name ?? '').trim().toLowerCase()
  const tokenId = data.tok ?? ''
  const tokName = data.tokName ?? ''
  if (!DEPLOY_NAME_RE.test(name)) { await sendMsg(bt, chatId, '❌ نام پروژه نامعتبر است.'); return }
  const res = await panelApi(env, userId, origin, '/api/railway/deploy', 'POST', { token_id: tokenId, name, region: 'us-west2' })
  if (!res.ok) { await sendMsg(bt, chatId, `❌ استقرار Railway <b>${escHtml(name)}</b> شروع نشد: ${escHtml(res.error)}`, KB([[btn('🏠 منو', 'm')]])); return }
  const d = res.data as { deploymentId?: string }
  await sendMsg(bt, chatId,
    `🚂 استقرار Railway <b>${escHtml(name)}</b> شروع شد (منطقه us-west2) با توکن <code>${escHtml(tokName)}</code>.\n` +
    `وضعیت را دنبال می‌کنم و همین‌جا خبر می‌دهم.`,
    KB([[btn('📋 ورکرها', 'wk'), btn('🏠 منو', 'm')]]))
  if (d.deploymentId) ctx.waitUntil(pollRailwayDeploy(env, bt, chatId, userId, origin, tokenId, d.deploymentId))
}

async function runRenderDeploy(env: Env, bt: string, chatId: string | number, userId: string, data: Record<string, string>, origin: string, ctx: ExecutionContext): Promise<void> {
  const name = (data.name ?? '').trim().toLowerCase()
  const tokenId = data.tok ?? ''
  const tokName = data.tokName ?? ''
  if (!DEPLOY_NAME_RE.test(name)) { await sendMsg(bt, chatId, '❌ نام سرویس نامعتبر است.'); return }
  const res = await panelApi(env, userId, origin, '/api/render/deploy', 'POST', { token_id: tokenId, name })
  if (!res.ok) { await sendMsg(bt, chatId, `❌ استقرار Render <b>${escHtml(name)}</b> شروع نشد: ${escHtml(res.error)}`, KB([[btn('🏠 منو', 'm')]])); return }
  const d = res.data as { deployId?: string; serviceId?: string }
  await sendMsg(bt, chatId,
    `🧊 استقرار Render <b>${escHtml(name)}</b> شروع شد با کلید <code>${escHtml(tokName)}</code>.\n` +
    `وضعیت را دنبال می‌کنم و همین‌جا خبر می‌دهم.`,
    KB([[btn('📋 ورکرها', 'wk'), btn('🏠 منو', 'm')]]))
  if (d.deployId && d.serviceId) ctx.waitUntil(pollRenderDeploy(env, bt, chatId, userId, origin, tokenId, d.deployId, d.serviceId))
}

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
      let m = `✅ <b>استقرار Railway تمام شد</b>\n\n🔗 آدرس: <code>${escHtml(pub ?? '—')}</code>\n🔐 پنل (لاگین): <code>${escHtml(panel ?? '—')}</code>`
      if (creds?.admin_username && creds.admin_password) m += `\n\n👤 کاربر: <code>${escHtml(creds.admin_username)}</code>\n🔑 گذرواژه: <code>${escHtml(creds.admin_password)}</code>`
      const kbRows: Array<Array<{ text: string; u?: string; c?: string }>> = []
      if (panel) kbRows.push([{ text: '🔐 باز کردن پنل', u: panel }])
      kbRows.push([btn('🏠 منو', 'm')])
      await sendMsg(bt, chatId, m, KB(kbRows))
      return
    }
    if (row.status === 'failed') {
      await sendMsg(bt, chatId, '❌ استقرار Railway ناموفق بود — جزئیات را در پنل وب ببینید.', KB([[btn('🏠 منو', 'm')]]))
      return
    }
  }
  await sendMsg(bt, chatId, '⏳ استقرار Railway هنوز در جریان است — چند دقیقه بعد از 📋 ورکرها وضعیت را ببینید.', KB([[btn('📋 ورکرها', 'wk'), btn('🏠 منو', 'm')]]))
}

async function pollRenderDeploy(env: Env, bt: string, chatId: string | number, userId: string, origin: string, tokenId: string, deployId: string, serviceId: string): Promise<void> {
  for (let i = 0; i < 14; i++) {
    await botSleep(15000)
    await panelApi(env, userId, origin, `/api/render/status?token_id=${encodeURIComponent(tokenId)}&deploy_id=${encodeURIComponent(deployId)}&service_id=${encodeURIComponent(serviceId)}`, 'GET')
    const row = await env.DB.prepare('SELECT status, url, panel_url, dashboard_url FROM hosted_deployments WHERE id = ? AND user_id = ?').bind(deployId, userId).first<{ status: string; url: string | null; panel_url: string | null; dashboard_url: string | null }>()
    if (!row) return
    if (row.status === 'success') {
      let m = `✅ <b>استقرار Render تمام شد</b>\n\n🔐 پنل: <code>${escHtml(row.panel_url ?? row.url ?? '—')}</code>`
      const rows: Array<Array<{ text: string; u?: string; c?: string }>> = []
      if (row.panel_url || row.url) rows.push([{ text: '🔐 باز کردن پنل', u: row.panel_url ?? row.url ?? '' }])
      if (row.dashboard_url) rows.push([{ text: '📊 داشبورد Render', u: row.dashboard_url }])
      rows.push([btn('🏠 منو', 'm')])
      if (row.dashboard_url) m += `\n📊 داشبورد Render: <code>${escHtml(row.dashboard_url)}</code>`
      await sendMsg(bt, chatId, m, KB(rows))
      return
    }
    if (row.status === 'failed') {
      await sendMsg(bt, chatId, '❌ استقرار Render ناموفق بود — جزئیات را در پنل وب ببینید.', KB([[btn('🏠 منو', 'm')]]))
      return
    }
  }
  await sendMsg(bt, chatId, '⏳ استقرار Render هنوز در جریان است — چند دقیقه بعد از 📋 ورکرها وضعیت را ببینید.', KB([[btn('📋 ورکرها', 'wk'), btn('🏠 منو', 'm')]]))
}

// ── Pending text input handling ────────────────────────────────────────────

async function handlePendingText(env: Env, cfg: BotConfigRow, chatId: string | number, telegramId: string, text: string, messageId: number | undefined, origin: string, ctx: ExecutionContext): Promise<void> {
  const bt = cfg.bot_token
  const row = await getBotUser(env, cfg.user_id, telegramId)
  if (!row) return
  const pend = parsePending(row)
  if (!pend) return

  // Generic: capture a value for a worker setting.
  if (pend.step === 'wset') {
    const id = pend.data.id ?? ''
    const key = pend.data.key ?? ''
    if (!SET_KEYS.includes(key as (typeof SET_KEYS)[number])) { await clearPending(env, cfg.user_id, telegramId); return }
    const val = text.trim().slice(0, 200)
    if (!val) {
      await sendMsg(bt, chatId, '❌ مقدار خالی است — دوباره مقدار را بنویسید یا ✖️ بزنید.', KB([[btn('✖️ انصراف', 'cnf:c')]]))
      return
    }
    const w = await env.DB.prepare('SELECT id FROM deployments WHERE id = ? AND user_id = ?').bind(id, cfg.user_id).first<{ id: string }>()
    if (!w) { await clearPending(env, cfg.user_id, telegramId); await sendMsg(bt, chatId, '❌ ورکر پیدا نشد.', KB([[btn('🏠 منو', 'm')]])); return }
    const rec = await env.DB.prepare('SELECT config FROM deployments WHERE id = ?').bind(id).first<{ config: string }>()
    let stored: Record<string, unknown> = {}
    try { stored = JSON.parse(rec?.config ?? '{}') as Record<string, unknown> } catch { /* fresh */ }
    stored[key] = val
    await env.DB.prepare('UPDATE deployments SET config = ?, updated_at = ? WHERE id = ? AND user_id = ?')
      .bind(JSON.stringify(stored), nowIso(), id, cfg.user_id)
      .run()
    await clearPending(env, cfg.user_id, telegramId)
    await sendMsg(bt, chatId, `✅ تنظیم <code>${escHtml(key)}</code> برای ورکر ذخیره شد: <code>${escHtml(val)}</code>`)
    await showWorkerSettings(env, bt, chatId, cfg.user_id, id)
    return
  }

  // Confirmation for worker deletion — handled by callbacks only.

  // ── Optimizer: create job from pasted sub links / config lines
  if (pend.step === 'op_new') {
    const input = text.trim()
    if (!input) {
      await sendMsg(bt, chatId, '❌ ورودی خالی است — لینک ساب یا کانفیگ بفرستید یا ✖️ بزنید.', KB([[btn('✖️ انصراف', 'cnf:c')]]))
      return
    }
    const name = `بهینه‌سازی ${new Date().toLocaleDateString('fa-IR')}`
    await clearPending(env, cfg.user_id, telegramId)
    await sendMsg(bt, chatId, '⏳ در حال ایجاد کار بهینه‌سازی… نتیجه به‌محض تمام‌شدن همین‌جا اعلام می‌شود.')
    const res = await panelApi(env, cfg.user_id, origin, '/api/optimizer', 'POST', { name, input: input.slice(0, 100_000), options: {} })
    if (!res.ok) {
      await sendMsg(bt, chatId, `❌ ایجاد بهینه‌سازی نشد: ${escHtml(res.error)}`, KB([[btn('⚡ بهینه‌ساز', 'op'), btn('🏠 منو', 'm')]]))
    } else {
      await sendMsg(bt, chatId,
        `⚡ کار بهینه‌سازی <b>${escHtml(name)}</b> ساخته شد — نودها با پینگ واقعی بررسی و کلو تأیید می‌شود.`,
        KB([[btn('📋 مشاهده کارها', 'op'), btn('🏠 منو', 'm')]]))
    }
    return
  }

  // ── Scanner: real TCP scan over pasted CIDR ranges
  if (pend.step === 'scan_rng') {
    const ranges = text.trim()
    if (!ranges || !/[0-9]{1,3}(\.[0-9]{1,3}){3}/.test(ranges)) {
      await sendMsg(bt, chatId, '❌ بازه معتبری وارد نشد — مثل <code>104.16.0.0/24</code> بنویسید.', KB([[btn('✖️ انصراف', 'cnf:c')]]))
      return
    }
    await clearPending(env, cfg.user_id, telegramId)
    await sendMsg(bt, chatId, '⏳ در حال اسکن بازه IP روی پورت 443… چند لحظه صبر کنید.')
    await reportRangeScan(env, bt, chatId, ranges)
    return
  }

  // ── Token add: first the name, then the value.
  if (pend.step === 'tka_n') {
    const p = (pend.data.p ?? '') as Provider
    if (!PROVIDERS[p]) { await clearPending(env, cfg.user_id, telegramId); return }
    const name = text.trim().replace(/[<>]/g, '').slice(0, 40)
    if (!name) {
      await sendMsg(bt, chatId, '❌ نام خالی است — دوباره بنویسید یا ✖️ بزنید.', KB([[btn('✖️ انصراف', 'cnf:c')]]))
      return
    }
    await askTokenValue(env, bt, chatId, cfg.user_id, telegramId, p, name)
    return
  }
  if (pend.step === 'tka_v') {
    const p = (pend.data.p ?? '') as Provider
    const name = pend.data.name ?? ''
    if (!PROVIDERS[p]) { await clearPending(env, cfg.user_id, telegramId); return }
    const res = await addTokenByProvider(env, cfg.user_id, p, name, text)
    if (!res.ok) {
      await sendMsg(bt, chatId, `❌ ${res.message}\n\nدوباره تلاش کنید یا ✖️ بزنید.`, KB([[btn('✖️ انصراف', 'cnf:c')]]))
      return
    }
    // Wipe the message that contained the secret.
    if (messageId) await delMsg(bt, chatId, messageId)
    await clearPending(env, cfg.user_id, telegramId)
    await sendMsg(bt, chatId, res.message)
    await showTokenList(env, bt, chatId, cfg.user_id, p)
    return
  }

  // ── Cloudflare deploy: name → UUID → path
  if (pend.step === 'dpl_cf_name') {
    const name = text.trim().toLowerCase()
    if (!DEPLOY_NAME_RE.test(name)) {
      await sendMsg(bt, chatId, '❌ نام نامعتبر است — فقط حروف کوچک انگلیسی، عدد و خط تیره (مثل <code>my-worker</code>).', KB([[btn('✖️ انصراف', 'cnf:c')]]))
      return
    }
    await askCfUuid(env, bt, chatId, cfg.user_id, telegramId, { ...pend.data, name })
    return
  }
  if (pend.step === 'cf_uuidv') {
    const uuid = text.trim()
    if (!BOT_UUID_RE.test(uuid)) {
      await sendMsg(bt, chatId, '❌ UUID نامعتبر است — یک UUID استاندارد بفرستید یا از 🎲 خودکار استفاده کنید.', KB([[btn('✖️ انصراف', 'cnf:c')]]))
      return
    }
    await askCfPath(env, bt, chatId, cfg.user_id, telegramId, { ...pend.data, uuid }, uuid)
    return
  }
  if (pend.step === 'cf_pathv') {
    const raw = text.trim()
    const customPath = raw.replace(/^\/+/, '').replace(/\/+$/, '')
    if (!customPath || !/^[A-Za-z0-9_/-]{1,80}$/.test(customPath)) {
      await sendMsg(bt, chatId, '❌ مسیر نامعتبر است — فقط حروف، عدد، خط تیره و / (مثل <code>my</code> یا <code>sub/my</code>).', KB([[btn('✖️ انصراف', 'cnf:c')]]))
      return
    }
    await showCfConfirm(env, bt, chatId, cfg.user_id, telegramId, { ...pend.data, path: customPath })
    return
  }

  // ── Railway / Render deploy: name
  if (pend.step === 'dpl_rw_name' || pend.step === 'dpl_rd_name') {
    const name = text.trim().toLowerCase()
    if (!DEPLOY_NAME_RE.test(name)) {
      await sendMsg(bt, chatId, '❌ نام نامعتبر است — فقط حروف کوچک انگلیسی، عدد و خط تیره.', KB([[btn('✖️ انصراف', 'cnf:c')]]))
      return
    }
    const data = { ...pend.data, name }
    await clearPending(env, cfg.user_id, telegramId)
    if (pend.step === 'dpl_rw_name') await runRailwayDeploy(env, bt, chatId, cfg.user_id, data, origin, ctx)
    else await runRenderDeploy(env, bt, chatId, cfg.user_id, data, origin, ctx)
    return
  }

  await clearPending(env, cfg.user_id, telegramId)
}

// ── Callback routing ───────────────────────────────────────────────────────

async function handleCallback(env: Env, cfg: BotConfigRow, cq: TgCbQuery, origin: string): Promise<void> {
  const bt = cfg.bot_token
  const chatId = cq.message?.chat?.id
  const tgId = String(cq.from?.id ?? '')
  if (!chatId || !tgId) return
  const data = cq.data ?? ''
  const row = await getBotUser(env, cfg.user_id, tgId)
  const isAdmin = !!row?.is_admin
  await touchUser(env, cfg.user_id, tgId)

  if (data === 'cnf:c' || data === 'cancel') {
    await clearPending(env, cfg.user_id, tgId)
    await showMain(env, bt, chatId, false)
    return
  }
  if (!isAdmin) {
    await sendMsg(bt, chatId, '⛔ فقط ادمین به این بخش دسترسی دارد.')
    return
  }

  // Main + informational screens
  if (data === 'm' || data === 'start') { await showMain(env, bt, chatId, false); return }
  if (data === 'help') { await showHelp(env, bt, chatId); return }
  if (data === 'st') { await showStatus(env, bt, chatId, cfg.user_id); return }
  if (data === 'cfgs') { await showConfigs(env, bt, chatId, cfg.user_id); return }
  if (data === 'gr') { await showGroups(env, bt, chatId, cfg.user_id, origin); return }
  if (data === 'op') { await showOptimizer(env, bt, chatId, cfg.user_id); return }
  if (data === 'mb') { await showWorkerPickForMembers(env, bt, chatId, cfg.user_id); return }
  if (data === 'wk') { await showWorkers(env, bt, chatId, cfg.user_id); return }

  // ── IP Scanner (real server-side probes, mobile/desktop identical)
  if (data === 'sc') { await showScanMenu(env, bt, chatId); return }
  if (data === 'sc:cf' || data === 'sc:cl' || data === 'sc:cfs' || data === 'sc:cls' || data === 'sc:px') {
    const kind: 'cf' | 'cl' | 'px' = data === 'sc:cfs' || data === 'sc:cf' ? 'cf' : data === 'sc:cls' || data === 'sc:cl' ? 'cl' : 'px'
    const speed = data === 'sc:cfs' || data === 'sc:cls'
    const label = kind === 'cf' ? 'کلودفلر' : kind === 'cl' ? 'IP پاک' : 'پروکسی‌ها'
    await sendMsg(bt, chatId, `⏳ در حال اسکن <b>${label}</b>… (${speed ? 'با تست سرعت — ' : ''}چند لحظه صبر کنید)`)
    await reportListScan(env, bt, chatId, cfg.user_id, kind, speed)
    return
  }
  if (data === 'sc:rng') {
    await setPending(env, cfg.user_id, tgId, 'scan_rng', {})
    await sendMsg(bt, chatId,
      '📡 <b>اسکن بازه IP</b>\n\nیک یا چند بازه بنویسید (هر کدام در یک خط یا با کاما) تا روی پورت 443 اسکن شوند:\n\n<code>104.16.0.0/24</code>\n<code>162.159.0.0/24</code>\n\nحداکثر ۸ بازه و ۵۱۲ IP بررسی می‌شود.',
      KB([[btn('✖️ انصراف', 'cnf:c')]]))
    return
  }

  // ── Optimizer (create + list + detail)
  if (data === 'op:new') { await askOptimizerInput(env, bt, chatId, cfg.user_id, tgId); return }
  if (data.startsWith('ojd:')) {
    const id = data.slice(4)
    const j = await env.DB.prepare('SELECT name FROM optimizer_jobs WHERE id = ? AND user_id = ?').bind(id, cfg.user_id).first<{ name: string }>()
    if (!j) { await sendMsg(bt, chatId, '❌ پیدا نشد.'); return }
    await sendMsg(bt, chatId,
      `⚠️ بهینه‌سازی <b>${escHtml(j.name)}</b> حذف شود؟`,
      KB([[btn('✅ بله، حذف شود', `cnf:oj:${id}`), btn('✖️ انصراف', 'op')]]))
    return
  }
  if (data.startsWith('oj:')) {
    await showOptimizerDetail(env, bt, chatId, cfg.user_id, data.slice(3), origin)
    return
  }
  if (data.startsWith('cnf:oj:')) {
    const id = data.slice('cnf:oj:'.length)
    const j = await env.DB.prepare('DELETE FROM optimizer_jobs WHERE id = ? AND user_id = ? RETURNING name').bind(id, cfg.user_id).first<{ name: string }>()
    if (!j) { await sendMsg(bt, chatId, '❌ پیدا نشد.'); return }
    await env.DB.prepare('INSERT INTO activity_logs (id, user_id, action, entity_type, entity_name, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(genId(), cfg.user_id, 'optimizer_deleted', 'optimizer', j.name, nowIso())
      .run()
    await sendMsg(bt, chatId, `🗑 بهینه‌سازی <b>${escHtml(j.name)}</b> حذف شد.`)
    await showOptimizer(env, bt, chatId, cfg.user_id)
    return
  }


  // ── Deploy provider menus
  if (data === 'dp') { await showDeployProviders(env, bt, chatId, cfg.user_id); return }
  if (data === 'dpcf' || data === 'dprw' || data === 'dprd') {
    const p = data === 'dpcf' ? 'cf' as Provider : data === 'dprw' ? 'rw' as Provider : 'rd' as Provider
    await showProviderTokenPick(env, bt, chatId, cfg.user_id, p, data)
    return
  }
  if (data.startsWith('dpcf:t:') || data.startsWith('dprw:t:') || data.startsWith('dprd:t:')) {
    const p = data.startsWith('dpcf') ? 'cf' as Provider : data.startsWith('dprw') ? 'rw' as Provider : 'rd' as Provider
    const id = data.slice(data.indexOf(':t:') + 3)
    const t = PROVIDERS[p]
    const tok = await env.DB.prepare(`SELECT id, name FROM ${t.table} WHERE id = ? AND user_id = ? AND status = 'active'`).bind(id, cfg.user_id).first<TokenChoice>()
    if (!tok) { await sendMsg(bt, chatId, '❌ توکن فعال پیدا نشد.'); return }
    await askDeployName(env, bt, chatId, cfg.user_id, tgId, p, tok)
    return
  }

  // ── CF deploy wizard buttons
  if (data === 'du:auto' || data === 'du:custom') {
    const row2 = await getBotUser(env, cfg.user_id, tgId)
    const pend = row2 ? parsePending(row2) : null
    if (!pend) return
    if (data === 'du:auto') {
      await askCfPath(env, bt, chatId, cfg.user_id, tgId, { ...pend.data, uuid: '' }, 'خودکار')
    } else {
      await setPending(env, cfg.user_id, tgId, 'cf_uuidv', pend.data)
      await sendMsg(bt, chatId, '✍️ UUID دلخواه را بنویسید:', KB([[btn('✖️ انصراف', 'cnf:c')]]))
    }
    return
  }
  if (data === 'dpth:np' || data === 'dpth:cp') {
    const row2 = await getBotUser(env, cfg.user_id, tgId)
    const pend = row2 ? parsePending(row2) : null
    if (!pend) return
    if (data === 'dpth:np') {
      await showCfConfirm(env, bt, chatId, cfg.user_id, tgId, { ...pend.data, path: '' })
    } else {
      await setPending(env, cfg.user_id, tgId, 'cf_pathv', pend.data)
      await sendMsg(bt, chatId, '✍️ مسیر دلخواه ساب را بنویسید (مثل <code>my</code> یا <code>sub/my</code> — بدون اسلش ابتدا):', KB([[btn('⏭️ بدون مسیر', 'dpth:np')], [btn('✖️ انصراف', 'cnf:c')]]))
    }
    return
  }
  if (data === 'dpl:cf:go') {
    const row2 = await getBotUser(env, cfg.user_id, tgId)
    const pend = row2 ? parsePending(row2) : null
    if (!pend || pend.step !== 'cf_confirm') return
    await clearPending(env, cfg.user_id, tgId)
    await runCfDeploy(env, bt, chatId, cfg.user_id, pend.data, origin)
    return
  }

  // ── Token screens
  if (data === 'tkl:cf' || data === 'tkl:rw' || data === 'tkl:rd') {
    const p = data === 'tkl:cf' ? 'cf' as Provider : data === 'tkl:rw' ? 'rw' as Provider : 'rd' as Provider
    await showTokenList(env, bt, chatId, cfg.user_id, p)
    return
  }
  if (data === 'tka:cf' || data === 'tka:rw' || data === 'tka:rd') {
    const p = data === 'tka:cf' ? 'cf' as Provider : data === 'tka:rw' ? 'rw' as Provider : 'rd' as Provider
    await askTokenName(env, bt, chatId, cfg.user_id, tgId, p)
    return
  }
  const tkMatch = data.match(/^tk:(cf|rw|rd):([^:]+)(?::(tog|del))?$/)
  if (tkMatch) {
    const p = tkMatch[1] as Provider
    const id = tkMatch[2]
    const action = tkMatch[3]
    if (action === 'tog') {
      const res = await toggleToken(env, cfg.user_id, p, id)
      if (!res.ok) await sendMsg(bt, chatId, `❌ ${res.message}`)
      await showTokenDetail(env, bt, chatId, cfg.user_id, p, id)
      return
    }
    if (action === 'del') {
      await showDeleteTokenConfirm(env, bt, chatId, cfg.user_id, p, id, tgId)
      return
    }
    await showTokenDetail(env, bt, chatId, cfg.user_id, p, id)
    return
  }

  // ── Worker detail & actions
  const wdMatch = data.match(/^wd:([^:]+)(?::(mb|cfg|del))?(?::(cfg):(.+))?$/)
  if (wdMatch && data.startsWith('wd:')) {
    const id = wdMatch[1]
    const action = wdMatch[2]
    const cfgKey = wdMatch[4]
    if (cfgKey) {
      if (!SET_KEYS.includes(cfgKey as (typeof SET_KEYS)[number])) return
      await setPending(env, cfg.user_id, tgId, 'wset', { id, key: cfgKey })
      const labels: Record<string, string> = { path: '📍 مسیر (path)', proxyip: '🌐 Proxy-IP', region: '🗺 منطقه', homepage: '🏠 صفحه اصلی' }
      await sendMsg(bt, chatId, `مقدار جدید برای <b>${labels[cfgKey] ?? cfgKey}</b> را بنویسید:`, KB([[btn('✖️ انصراف', 'cnf:c')]]))
      return
    }
    if (action === 'mb') { await showMembersOf(env, bt, chatId, cfg.user_id, id, origin); return }
    if (action === 'cfg') { await showWorkerSettings(env, bt, chatId, cfg.user_id, id); return }
    if (action === 'del') { await showDeleteWorkerConfirm(env, bt, chatId, cfg.user_id, id, tgId); return }
    await showWorkerDetail(env, bt, chatId, cfg.user_id, id, origin)
    return
  }
  if (data.startsWith('wh:')) {
    await showHostedDetail(env, bt, chatId, cfg.user_id, data.slice(3))
    return
  }

  // ── Confirmations
  if (data.startsWith('cnf:dw:')) {
    const id = data.slice('cnf:dw:'.length)
    await clearPending(env, cfg.user_id, tgId)
    const res = await panelApi(env, cfg.user_id, origin, `/api/deployments/${encodeURIComponent(id)}`, 'DELETE')
    if (!res.ok) {
      await sendMsg(bt, chatId, `❌ حذف نشد: ${escHtml(res.error)}`)
    } else {
      await sendMsg(bt, chatId, '🗑 ورکر حذف شد.')
    }
    await showWorkers(env, bt, chatId, cfg.user_id)
    return
  }
  if (data.startsWith('cnf:dt:')) {
    const rest = data.slice('cnf:dt:'.length)
    const p = rest.slice(0, 2) as Provider
    const id = rest.slice(3)
    if (!PROVIDERS[p]) return
    await clearPending(env, cfg.user_id, tgId)
    const res = await removeToken(env, cfg.user_id, p, id)
    await sendMsg(bt, chatId, res.ok ? res.message : `❌ ${res.message}`)
    await showTokenList(env, bt, chatId, cfg.user_id, p)
    return
  }

  await sendMsg(bt, chatId, 'این دکمه در دسترس نیست — <code>/start</code> بزنید.')
}

// ── Webhook entry ──────────────────────────────────────────────────────────

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
    const cfg = await resolveConfig(env, request)
    if (!cfg) return ok()
    ctx.waitUntil(
      (async () => {
        await tgPost(cfg.bot_token, 'answerCallbackQuery', { callback_query_id: cq.id }).catch(() => null)
        await handleCallback(env, cfg, cq, origin)
      })(),
    )
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
  const text = message.text.trim()
  if (!telegramId) return ok()

  ctx.waitUntil(
    (async () => {
      const row = await getBotUser(env, cfg.user_id, telegramId)
      if (!row) return
      await env.DB.prepare('UPDATE bot_users SET username = ?, first_name = ?, last_name = ?, last_activity = ? WHERE id = ?')
        .bind(username, firstName, from?.last_name ?? null, nowIso(), row.id)
        .run()

      if (text === '/start') {
        const firstOwner = !cfg.chat_id
        await saveOwnerChat(env, cfg, chatId)
        await promoteOwnerIfNeeded(env, cfg, telegramId)
        if (firstOwner && row.is_admin !== 1) {
          await env.DB.prepare('UPDATE bot_users SET is_admin = 1 WHERE user_id = ? AND telegram_id = ?').bind(cfg.user_id, telegramId).run()
        }
        const adminRow = await getBotUser(env, cfg.user_id, telegramId)
        const admin = !!adminRow?.is_admin
        if (admin) {
          await showMain(env, bt, chatId, true, cfg.welcome_message)
        } else {
          await sendMsg(bt, chatId, cfg.welcome_message + '\n\n⛔ این ربات فقط برای ادمین پنل است. اگر ادمین هستید از همان چتی که اولین بار /start زدید ادامه دهید.')
        }
        return
      }
      if (text === '/cancel' || text === 'لغو') {
        await clearPending(env, cfg.user_id, telegramId)
        await showMain(env, bt, chatId, false)
        return
      }
      if (text === '/help') { await showHelp(env, bt, chatId); return }

      const admin = row.is_admin === 1
      if (!admin) {
        await sendMsg(bt, chatId, '⛔ فقط ادمین می‌تواند از ربات استفاده کند.')
        return
      }

      // Pending text-capture flows (names, tokens, UUIDs, paths, settings)
      const pend = parsePending(row)
      if (pend) {
        await handlePendingText(env, cfg, chatId, telegramId, text, message.message_id, origin, ctx)
        return
      }

      // Convenience slash aliases
      if (text === '/workers') { await showWorkers(env, bt, chatId, cfg.user_id); return }
      if (text === '/tokens') { await showTokenList(env, bt, chatId, cfg.user_id, 'cf'); return }
      if (text === '/status') { await showStatus(env, bt, chatId, cfg.user_id); return }
      if (text === '/groups') { await showGroups(env, bt, chatId, cfg.user_id, origin); return }
      if (text === '/members' || text === '/users') { await showWorkerPickForMembers(env, bt, chatId, cfg.user_id); return }
      if (text === '/configs' || text === '/config') { await showConfigs(env, bt, chatId, cfg.user_id); return }
      if (text.startsWith('/deploy')) { await showDeployProviders(env, bt, chatId, cfg.user_id); return }
      if (text === '/scan' || text === '/scanner') { await showScanMenu(env, bt, chatId); return }
      if (text === '/opt' || text === '/optimizer') { await showOptimizer(env, bt, chatId, cfg.user_id); return }

      await sendMsg(bt, chatId, 'از دکمه‌های منو استفاده کنید — <code>/start</code> یا <code>/help</code>.', mainKeyboard())
    })(),
  )
  return ok()
}
