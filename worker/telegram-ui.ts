import type { Env } from './env'
import { genId, nowIso, safeJsonParse } from './util'
import { PANELS, panelsForTarget, panelOriginLabel, panelVerifiedLabel, resolvePanel } from '../shared/panels'
import { autoWorkerSources } from '../shared/worker-sources'
import { startDeployment } from './deploy'
import { startPanelDeploy, watchPanelDeploy, type PanelWatchResult, type StartPanelDeployResult } from './panel-deploy'
import {
  type BotConfigRow, type BotSession, type Screen, type ScreenCtx, type TgButton,
  clearSession, faDate, loadSession, saveSession, sendMsg, statusIcon, subUrlOf,
} from './telegram-core'

// ══════════════════════════════════════════════════════════════════════════════
//  Telegram UI — every screen of the bot plus the router that turns a command
//  or a button press into exactly one screen.
//
//  Design rules:
//   • Every screen is ONE message, edited in place (no chat spam).
//   • Persistent reply keyboard = the app's tabs, inline keyboard = actions.
//   • Callback payloads carry row ids (never names) so `callback_data` stays
//     well inside Telegram's 64-byte limit.
//   • Data screens are owner/admin only; strangers get a polite gate with a
//     "request access" button that pings the owner.
// ══════════════════════════════════════════════════════════════════════════════

const PAGE_SIZE = 6

// ── Persistent reply keyboard = the app tabs ─────────────────────────────────

export const MENU = {
  dashboard: '📊 داشبورد',
  workers: '📋 ورکرها',
  panels: '🧩 پنل‌ها',
  servers: '🖥 سرورها',
  tokens: '🔑 توکن‌ها',
  help: '📖 راهنما',
} as const

export function replyKeyboard(): Record<string, unknown> {
  return {
    keyboard: [
      [MENU.dashboard, MENU.workers],
      [MENU.panels, MENU.servers],
      [MENU.tokens, MENU.help],
    ],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: 'یک گزینه را انتخاب کنید',
  }
}

const homeButton = (): TgButton => ({ text: '🏠 منوی اصلی', callback_data: 'n:menu' })
const backButton = (target: string, label = '🔙 بازگشت'): TgButton => ({ text: label, callback_data: target })

function paginate<T>(rows: T[], page: number): { slice: T[]; pages: number; page: number } {
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const safe = Math.min(Math.max(0, page), pages - 1)
  return { slice: rows.slice(safe * PAGE_SIZE, safe * PAGE_SIZE + PAGE_SIZE), pages, page: safe }
}

function pagerRow(kind: string, page: number, pages: number): TgButton[] | null {
  if (pages <= 1) return null
  return [
    { text: '◀️', callback_data: `l:${kind}:${Math.max(0, page - 1)}` },
    { text: `صفحهٔ ${page + 1} از ${pages}`, callback_data: 'noop' },
    { text: '▶️', callback_data: `l:${kind}:${Math.min(pages - 1, page + 1)}` },
  ]
}

// ── Screens ──────────────────────────────────────────────────────────────────

export function menuScreen(ctx: ScreenCtx): Screen {
  const welcome = ctx.cfg.welcome_message?.trim() || 'به ربات میلی‌کانفیگ خوش آمدید.'
  const rows: TgButton[][] = [
    [{ text: '📊 داشبورد', callback_data: 'n:status' }, { text: '📋 ورکرها', callback_data: 'l:workers:0' }],
    [{ text: '🚀 استقرار ورکر جدید', callback_data: 'dpl:start' }],
    [{ text: '🧩 پنل‌های آماده', callback_data: 'l:panels:0' }, { text: '🖥 سرورها', callback_data: 'l:servers:0' }],
    [{ text: '🔑 توکن‌ها', callback_data: 'n:tokens' }, { text: '⚡ ساب‌های بهینه', callback_data: 'l:optimizer:0' }],
  ]
  if (ctx.isAdmin) {
    rows.push([{ text: '👥 کاربران ربات', callback_data: 'l:users:0' }, { text: '⚙️ تنظیمات', callback_data: 'n:settings' }])
  }
  rows.push([{ text: '📖 راهنما', callback_data: 'n:help' }, { text: '🔍 جست‌وجو', callback_data: 'n:search' }])
  return {
    text:
      `${welcome}\n\n` +
      '<b>منوی اصلی</b>\n' +
      'از دکمه‌های پایین صفحه یا دکمه‌های زیر استفاده کنید. هر صفحه در همین پیام به‌روز می‌شود.',
    keyboard: { inline_keyboard: rows },
  }
}

export async function statusScreen(ctx: ScreenCtx): Promise<Screen> {
  const { env } = ctx
  const [tokens, deployed, failed, rails, renders, users, jobs, members, latest] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS c FROM cf_tokens WHERE user_id = ?').bind(ctx.cfg.user_id).first<{ c: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS c FROM deployments WHERE user_id = ? AND status = 'deployed'").bind(ctx.cfg.user_id).first<{ c: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS c FROM deployments WHERE user_id = ? AND status = 'failed'").bind(ctx.cfg.user_id).first<{ c: number }>(),
    env.DB.prepare('SELECT COUNT(*) AS c FROM railway_deploys WHERE user_id = ?').bind(ctx.cfg.user_id).first<{ c: number }>(),
    env.DB.prepare('SELECT COUNT(*) AS c FROM render_deploys WHERE user_id = ?').bind(ctx.cfg.user_id).first<{ c: number }>(),
    env.DB.prepare('SELECT COUNT(*) AS c FROM bot_users WHERE user_id = ?').bind(ctx.cfg.user_id).first<{ c: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS c FROM optimizer_jobs WHERE user_id = ? AND status = 'done'").bind(ctx.cfg.user_id).first<{ c: number }>(),
    env.DB.prepare('SELECT COUNT(*) AS c FROM worker_members WHERE owner_user_id = ?').bind(ctx.cfg.user_id).first<{ c: number }>(),
    env.DB.prepare('SELECT id, name, status, created_at FROM deployments WHERE user_id = ? ORDER BY created_at DESC LIMIT 3')
      .bind(ctx.cfg.user_id).all<{ id: string; name: string; status: string; created_at: string }>(),
  ])

  let text =
    '📊 <b>داشبورد</b>\n' +
    '<i>نمای کلی حساب شما</i>\n\n' +
    `🔑 توکن کلودفلر: <b>${tokens?.c ?? 0}</b>\n` +
    `🚀 ورکرهای فعال: <b>${deployed?.c ?? 0}</b>${failed?.c ? ` · ناموفق: ${failed.c}` : ''}\n` +
    `🏗 پنل Railway: <b>${rails?.c ?? 0}</b> · ☁️ پنل Render: <b>${renders?.c ?? 0}</b>\n` +
    `👥 کاربران ساب: <b>${members?.c ?? 0}</b> · کاربران ربات: <b>${users?.c ?? 0}</b>\n` +
    `⚡ ساب‌های بهینه: <b>${jobs?.c ?? 0}</b>\n`
  if (latest.results.length) {
    text += '\n<b>آخرین استقرارها</b>\n'
    for (const d of latest.results) text += `${statusIcon(d.status)} <code>${d.name}</code> · ${faDate(d.created_at)}\n`
  }
  text += `\n🕒 امروز: ${faDate(nowIso())}`

  return {
    text,
    keyboard: {
      inline_keyboard: [
        [{ text: '🔄 بروزرسانی', callback_data: 'n:status' }, { text: '📋 ورکرها', callback_data: 'l:workers:0' }],
        [homeButton()],
      ],
    },
  }
}

interface DeploymentRow {
  id: string
  name: string
  status: string
  worker_url: string | null
  panel_url: string | null
  uuid: string | null
  custom_path: string | null
  method: string | null
  worker_source: string | null
  created_at: string
}

const DEPLOYMENT_COLUMNS = 'id, name, status, worker_url, panel_url, uuid, custom_path, method, worker_source, created_at'

export async function workersScreen(ctx: ScreenCtx, page: number): Promise<Screen> {
  const rows = await ctx.env.DB.prepare(
    `SELECT ${DEPLOYMENT_COLUMNS} FROM deployments WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
  ).bind(ctx.cfg.user_id).all<DeploymentRow>()
  if (!rows.results.length) {
    return {
      text: '📋 <b>ورکرها</b>\n\nهنوز ورکری مستقر نکرده‌اید.\nبا دکمهٔ «🚀 استقرار ورکر جدید» اولین ورکر را بسازید.',
      keyboard: { inline_keyboard: [[{ text: '🚀 استقرار ورکر جدید', callback_data: 'dpl:start' }], [homeButton()]] },
    }
  }
  const { slice, pages, page: current } = paginate(rows.results, page)
  const keyboard: TgButton[][] = slice.map((d) => [
    { text: `${statusIcon(d.status)} ${d.name}`, callback_data: `w:${d.id}` },
    { text: d.status === 'deployed' ? '📋 ساب' : '⏳', callback_data: d.status === 'deployed' ? `cp:${d.id}:sub` : 'noop' },
  ])
  const pager = pagerRow('workers', current, pages)
  if (pager) keyboard.push(pager)
  keyboard.push([{ text: '🔄 بروزرسانی', callback_data: `l:workers:${current}` }, { text: '🚀 استقرار جدید', callback_data: 'dpl:start' }])
  keyboard.push([homeButton()])
  return {
    text: `📋 <b>ورکرها</b> — ${rows.results.length} مورد\n\nروی هر ورکر بزنید تا ساب، پنل و جزئیاتش را ببینید.`,
    keyboard: { inline_keyboard: keyboard },
  }
}

export async function workerScreen(ctx: ScreenCtx, id: string): Promise<Screen> {
  const d = await ctx.env.DB.prepare(
    `SELECT ${DEPLOYMENT_COLUMNS} FROM deployments WHERE id = ? AND user_id = ?`,
  ).bind(id, ctx.cfg.user_id).first<DeploymentRow>()
  if (!d) {
    return { text: '❌ این ورکر پیدا نشد یا حذف شده است.', keyboard: { inline_keyboard: [[{ text: '📋 ورکرها', callback_data: 'l:workers:0' }], [homeButton()]] } }
  }
  const sub = subUrlOf(d)
  const source = autoWorkerSources().find((s) => s.id === (d.worker_source ?? ''))?.name ?? d.worker_source ?? '—'

  let text =
    `${statusIcon(d.status)} <b>${d.name}</b>\n` +
    `<i>${d.status === 'deployed' ? 'مستقر' : d.status === 'failed' ? 'ناموفق' : 'در حال استقرار'}</i>\n\n` +
    `🧬 سورس: ${source}\n` +
    `🛠 روش: ${d.method === 'pages' ? 'Cloudflare Pages' : 'Cloudflare Workers'}\n` +
    `📅 ساخته‌شده: ${faDate(d.created_at)}\n`
  if (sub) text += `\n🔗 <b>ساب</b>\n<code>${sub}</code>\n`
  if (d.panel_url) text += `\n🔐 <b>پنل</b>\n<code>${d.panel_url}</code>\n`

  const rows: TgButton[][] = []
  const linkRow: TgButton[] = []
  if (sub) linkRow.push({ text: '🔗 باز کردن ساب', url: sub })
  if (d.panel_url) linkRow.push({ text: '🔐 پنل ورکر', url: d.panel_url })
  if (linkRow.length) rows.push(linkRow)

  const copyRow: TgButton[] = []
  if (sub) copyRow.push({ text: '📋 کپی ساب', callback_data: `cp:${d.id}:sub` })
  if (d.panel_url) copyRow.push({ text: '📋 کپی پنل', callback_data: `cp:${d.id}:panel` })
  if (copyRow.length) rows.push(copyRow)

  rows.push([{ text: '🔗 کانفیگ‌ها', callback_data: 'l:configs:0' }, { text: '👥 کاربران ساب', callback_data: 'l:members:0' }])
  if (ctx.isAdmin) rows.push([{ text: '🗑 حذف ورکر', callback_data: `del:${d.id}` }])
  rows.push([backButton('l:workers:0', '🔙 ورکرها'), homeButton()])

  return { text, keyboard: { inline_keyboard: rows } }
}

export async function configsScreen(ctx: ScreenCtx, page: number): Promise<Screen> {
  const rows = await ctx.env.DB.prepare(
    "SELECT id, name, worker_url, uuid, custom_path FROM deployments WHERE user_id = ? AND status = 'deployed' ORDER BY created_at DESC LIMIT 100",
  ).bind(ctx.cfg.user_id).all<{ id: string; name: string; worker_url: string; uuid: string | null; custom_path: string | null }>()
  if (!rows.results.length) {
    return { text: '🔗 هنوز کانفیگی آماده نیست — اول یک ورکر مستقر کنید.', keyboard: { inline_keyboard: [[{ text: '🚀 استقرار جدید', callback_data: 'dpl:start' }], [homeButton()]] } }
  }
  const { slice, pages, page: current } = paginate(rows.results, page)
  let text = '🔗 <b>کانفیگ‌های آماده</b>\n\n'
  const keyboard: TgButton[][] = []
  for (const d of slice) {
    const sub = `${d.worker_url}/${d.custom_path || d.uuid || ''}`
    text += `📦 <b>${d.name}</b>\n<code>${sub}</code>\n\n`
    keyboard.push([{ text: `📋 کپی ساب ${d.name}`, callback_data: `cp:${d.id}:sub` }])
  }
  const pager = pagerRow('configs', current, pages)
  if (pager) keyboard.push(pager)
  keyboard.push([homeButton()])
  return { text, keyboard: { inline_keyboard: keyboard } }
}

export function panelsScreen(page: number): Screen {
  const { slice, pages, page: current } = paginate(PANELS, page)
  let text = '🧩 <b>کاتالوگ پنل‌ها</b>\n<i>همهٔ مخازن قبل از افزودن بررسی شده و فعال بودنشان تأیید شده است.</i>\n\n'
  const keyboard: TgButton[][] = []
  for (const p of slice) {
    text += `${panelOriginLabel(p)} <b>${p.name}</b>\n${p.tagline}\n\n`
    keyboard.push([{ text: `ℹ️ ${p.name}`, callback_data: `p:${p.id}` }])
  }
  const pager = pagerRow('panels', current, pages)
  if (pager) keyboard.push(pager)
  keyboard.push([{ text: '🖥 سرورهای من', callback_data: 'l:servers:0' }, homeButton()])
  return { text, keyboard: { inline_keyboard: keyboard } }
}

export function panelScreen(id: string, origin: string): Screen {
  const panel = PANELS.find((p) => p.id === id)
  if (!panel) {
    return { text: '❌ پنل پیدا نشد.', keyboard: { inline_keyboard: [[{ text: '🧩 کاتالوگ', callback_data: 'l:panels:0' }], [homeButton()]] } }
  }
  const p = resolvePanel(panel.id)
  const targets = p.targets.map((t) => (t === 'railway' ? 'Railway' : t === 'render' ? 'Render' : 'VPS')).join(' · ')
  let text =
    `${panelOriginLabel(p)} <b>${p.name}</b>\n<i>${p.tagline}</i>\n\n` +
    `🐳 اجرا: ${p.runtime === 'docker' ? 'Docker' : 'Python'}\n` +
    `🔢 پورت: <code>${p.port}</code> · مسیر پنل: <code>${p.panelPath}</code>\n` +
    `🎯 هدف‌ها: ${targets}\n` +
    `📦 مخزن: <code>${p.repo}</code>\n`
  if (p.dockerImage) text += `🏷 ایمیج: <code>${p.dockerImage}</code>\n`
  if (p.lastCommit) text += `✅ آخرین کامیت مخزن: <code>${p.lastCommit}</code> · ${panelVerifiedLabel(p)}\n`
  if (p.notes) text += `\n⚠️ ${p.notes}\n`

  return {
    text,
    keyboard: {
      inline_keyboard: [
        [{ text: '↗ صفحهٔ GitHub', url: p.url }],
        [{ text: '🚀 استقرار از پنل وب', url: `${origin}/#/deploy` }],
        [backButton('l:panels:0', '🔙 کاتالوگ'), homeButton()],
      ],
    },
  }
}

interface ServerItem {
  label: string
  panelName: string
  meta: string
  base: string | null
  path: string
  admin: string | null
}

export async function serversScreen(ctx: ScreenCtx, page: number): Promise<Screen> {
  const [rails, renders] = await Promise.all([
    ctx.env.DB.prepare(
      `SELECT id, name, panel, region, domain, admin_username, created_at FROM railway_deploys
       WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
    ).bind(ctx.cfg.user_id).all<{ id: string; name: string | null; panel: string | null; region: string; domain: string | null; admin_username: string | null; created_at: string }>(),
    ctx.env.DB.prepare(
      `SELECT id, name, panel, url, admin_username, created_at FROM render_deploys
       WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
    ).bind(ctx.cfg.user_id).all<{ id: string; name: string | null; panel: string | null; url: string | null; admin_username: string | null; created_at: string }>(),
  ])

  const items: ServerItem[] = []
  for (const r of rails.results) {
    const panel = resolvePanel(r.panel)
    items.push({
      label: r.name ?? panel.name,
      panelName: panel.name,
      meta: `🏗 Railway · 📍 ${r.region} · ${faDate(r.created_at)}`,
      base: r.domain ? `https://${r.domain}` : null,
      path: panel.panelPath,
      admin: r.admin_username,
    })
  }
  for (const r of renders.results) {
    const panel = resolvePanel(r.panel)
    items.push({
      label: r.name ?? panel.name,
      panelName: panel.name,
      meta: `☁️ Render · 📅 ${faDate(r.created_at)}`,
      base: r.url,
      path: panel.panelPath,
      admin: r.admin_username,
    })
  }

  if (!items.length) {
    return {
      text: '🖥 <b>سرورها</b>\n\nهنوز پنلی روی Railway یا Render مستقر نشده است.\nهمین‌جا با «🚀 استقرار جدید → پنل Railway/Render» مستقر کنید یا از پنل وب استفاده کنید.',
      keyboard: { inline_keyboard: [[{ text: '🚀 استقرار پنل', callback_data: 'dpl:start' }, { text: '🧩 پنل‌های آماده', callback_data: 'l:panels:0' }], [homeButton()]] },
    }
  }

  const { slice, pages, page: current } = paginate(items, page)
  let text = `🖥 <b>سرورهای مستقرشده</b> — ${items.length} مورد\n\n`
  const keyboard: TgButton[][] = []
  for (const s of slice) {
    text += `<b>${s.label}</b> — ${s.panelName}\n${s.meta}\n`
    if (s.admin) text += `👤 ادمین: <code>${s.admin}</code>\n`
    if (s.base) {
      text += `🔐 <code>${s.base}${s.path}</code>\n\n`
      keyboard.push([{ text: `🔐 پنل ${s.panelName}`, url: `${s.base}${s.path}` }])
    } else {
      text += '⏳ دامنهٔ عمومی هنوز فعال نشده\n\n'
    }
  }
  const pager = pagerRow('servers', current, pages)
  if (pager) keyboard.push(pager)
  keyboard.push([homeButton()])
  return { text, keyboard: { inline_keyboard: keyboard } }
}

export async function tokensScreen(ctx: ScreenCtx): Promise<Screen> {
  const ts = await ctx.env.DB.prepare('SELECT name, status, last_used_at FROM cf_tokens WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
    .bind(ctx.cfg.user_id).all<{ name: string; status: string; last_used_at: string | null }>()
  const rt = await ctx.env.DB.prepare('SELECT name FROM railway_tokens WHERE user_id = ?').bind(ctx.cfg.user_id).all<{ name: string }>()
  const rn = await ctx.env.DB.prepare('SELECT name FROM render_tokens WHERE user_id = ?').bind(ctx.cfg.user_id).all<{ name: string }>()

  let text = '🔑 <b>توکن‌ها</b>\n\n<b>Cloudflare</b>\n'
  if (!ts.results.length) text += '— هیچ توکنی ثبت نشده\n'
  for (const t of ts.results) {
    text += `${t.status === 'active' ? '✅' : '⛔'} <code>${t.name}</code>${t.last_used_at ? ` · آخرین استفاده ${faDate(t.last_used_at)}` : ' · استفاده‌نشده'}\n`
  }
  text += `\n<b>Railway</b>: ${rt.results.length} · <b>Render</b>: ${rn.results.length}\n`
  text += '\n<i>برای افزودن یا حذف توکن، از پنل وب → «توکن‌ها» استفاده کنید.</i>'

  return {
    text,
    keyboard: {
      inline_keyboard: [
        [{ text: '➕ مدیریت توکن‌ها در پنل وب', url: `${ctx.origin}/#/tokens` }],
        [{ text: '🚀 استقرار جدید', callback_data: 'dpl:start' }, homeButton()],
      ],
    },
  }
}

export async function optimizerScreen(ctx: ScreenCtx, page: number): Promise<Screen> {
  const jobs = await ctx.env.DB.prepare(
    "SELECT id, name, nodes_alive, nodes_total, sub_token FROM optimizer_jobs WHERE user_id = ? AND status = 'done' ORDER BY created_at DESC LIMIT 50",
  ).bind(ctx.cfg.user_id).all<{ id: string; name: string; nodes_alive: number; nodes_total: number; sub_token: string }>()
  if (!jobs.results.length) {
    return {
      text: '⚡ <b>ساب‌های بهینه</b>\n\nهنوز بهینه‌سازی‌ای انجام نشده است.',
      keyboard: { inline_keyboard: [[{ text: '⚡ بهینه‌سازی در پنل وب', url: `${ctx.origin}/#/optimizer` }], [homeButton()]] },
    }
  }
  const { slice, pages, page: current } = paginate(jobs.results, page)
  let text = '⚡ <b>ساب‌های بهینه</b>\n\n'
  const keyboard: TgButton[][] = []
  for (const j of slice) {
    text += `📋 <b>${j.name}</b> — ${j.nodes_alive}/${j.nodes_total} سالم\n<code>${j.sub_token}</code>\n\n`
    keyboard.push([{ text: `📋 کپی ${j.name}`, callback_data: `cpo:${j.id}` }])
  }
  const pager = pagerRow('optimizer', current, pages)
  if (pager) keyboard.push(pager)
  keyboard.push([homeButton()])
  return { text, keyboard: { inline_keyboard: keyboard } }
}

export async function membersScreen(ctx: ScreenCtx, page: number): Promise<Screen> {
  const rows = await ctx.env.DB.prepare(
    `SELECT id, name, enabled, used_bytes, quota_bytes, expires_at FROM worker_members
     WHERE owner_user_id = ? ORDER BY created_at DESC LIMIT 100`,
  ).bind(ctx.cfg.user_id).all<{ id: string; name: string; enabled: number; used_bytes: number; quota_bytes: number | null; expires_at: string | null }>()
  if (!rows.results.length) {
    return { text: '👥 هنوز کاربر سابی ساخته نشده است.', keyboard: { inline_keyboard: [[{ text: '👥 مدیریت در پنل وب', url: `${ctx.origin}/#/members` }], [homeButton()]] } }
  }
  const gb = (b: number | null) => (b ? `${(b / 1024 ** 3).toFixed(2)} GB` : 'بی‌نهایت')
  const used = (b: number) => `${(b / 1024 ** 3).toFixed(2)} GB`
  const { slice, pages, page: current } = paginate(rows.results, page)
  let text = `👥 <b>کاربران ساب</b> — ${rows.results.length} مورد\n\n`
  for (const m of slice) {
    text += `${m.enabled ? '✅' : '⛔'} <b>${m.name}</b>\nمصرف: ${used(m.used_bytes)} از ${gb(m.quota_bytes)}${m.expires_at ? ` · انقضا ${faDate(m.expires_at)}` : ''}\n\n`
  }
  const keyboard: TgButton[][] = []
  const pager = pagerRow('members', current, pages)
  if (pager) keyboard.push(pager)
  keyboard.push([{ text: '👥 مدیریت در پنل وب', url: `${ctx.origin}/#/members` }, homeButton()])
  return { text, keyboard: { inline_keyboard: keyboard } }
}

export async function usersScreen(ctx: ScreenCtx, page: number): Promise<Screen> {
  const rows = await ctx.env.DB.prepare(
    'SELECT id, telegram_id, username, first_name, is_admin, created_at FROM bot_users WHERE user_id = ? ORDER BY created_at DESC LIMIT 100',
  ).bind(ctx.cfg.user_id).all<{ id: string; telegram_id: string; username: string | null; first_name: string | null; is_admin: number; created_at: string }>()
  if (!rows.results.length) {
    return { text: '👥 هنوز کسی با ربات تعامل نکرده است.', keyboard: { inline_keyboard: [[homeButton()]] } }
  }
  const { slice, pages, page: current } = paginate(rows.results, page)
  let text = `👥 <b>کاربران ربات</b> — ${rows.results.length} مورد\n\n`
  const keyboard: TgButton[][] = []
  for (const u of slice) {
    const owner = String(ctx.cfg.chat_id ?? '') === String(u.telegram_id)
    const who = u.username ? `@${u.username}` : u.first_name ?? 'بدون‌نام'
    text += `${u.is_admin || owner ? '👑' : '👤'} ${who}\n🆔 <code>${u.telegram_id}</code> · پیوستن ${faDate(u.created_at)}\n${owner ? 'مالک ربات' : u.is_admin ? 'ادمین — دسترسی کامل' : 'دسترسی محدود'}\n\n`
    if (!owner) {
      keyboard.push([{ text: u.is_admin ? `🚫 سلب دسترسی از ${who}` : `✅ دادن دسترسی به ${who}`, callback_data: `adm:${u.id}:${u.is_admin ? 0 : 1}` }])
    }
  }
  const pager = pagerRow('users', current, pages)
  if (pager) keyboard.push(pager)
  keyboard.push([homeButton()])
  return { text, keyboard: { inline_keyboard: keyboard } }
}

export async function settingsScreen(ctx: ScreenCtx): Promise<Screen> {
  let text =
    '⚙️ <b>تنظیمات ربات</b>\n\n' +
    `📡 وضعیت: ${ctx.cfg.is_active ? 'فعال ✅' : 'غیرفعال ❌'}\n`
  text += `\n💬 پیام خوش‌آمد:\n<i>${(ctx.cfg.welcome_message ?? '').slice(0, 300)}</i>`

  return {
    text,
    keyboard: {
      inline_keyboard: [
        [{ text: '✏️ ویرایش پیام خوش‌آمد', callback_data: 'set:welcome' }],
        [{ text: '↩️ بازگردانی پیام پیش‌فرض', callback_data: 'set:welcome_reset' }],
        [{ text: '🧭 ثبت دستورات و دکمهٔ منو', callback_data: 'set:commands' }],
        [backButton('n:menu'), homeButton()],
      ],
    },
  }
}

export function helpScreen(): Screen {
  return {
    text:
      '📖 <b>راهنمای ربات</b>\n\n' +
      '<b>منو</b>\n' +
      'از دکمه‌های پایین صفحه استفاده کنید؛ هر بخش یک صفحهٔ مستقل است و در همان پیام به‌روز می‌شود.\n\n' +
      '<b>دستورات</b>\n' +
      '/start — شروع و منوی اصلی\n' +
      '/start &lt;code&gt; — اتصال مالک به ربات (کد در پنل وب)\n' +
      '/quickstart — چند قدم تا اولین استقرار\n' +
      '/status — داشبورد\n' +
      '/workers — لیست ورکرها\n' +
      '/deploy — استقرار ورکر یا پنل Railway/Render (ویزارد)\n' +
      '/panels — کاتالوگ پنل‌ها\n' +
      '/servers — پنل‌های Railway و Render\n' +
      '/tokens — توکن‌ها\n' +
      '/config &lt;name&gt; — لینک پنل و ساب یک ورکر\n' +
      '/sub &lt;name&gt; — لینک ساب\n' +
      '/set &lt;worker&gt; &lt;key&gt; &lt;value&gt; — تغییر تنظیم ورکر (ادمین)\n' +
      '/menu — نمایش منو\n' +
      '/help — همین راهنما\n\n' +
      '<b>نکته‌ها</b>\n' +
      '• همهٔ صفحه‌ها در یک پیام به‌روز می‌شوند تا چت شلوغ نشود.\n' +
      '• دکمهٔ «📋 کپی …» لینک را به‌صورت متن کد‌شده می‌فرستد؛ با یک لمس کپی می‌شود.',
    keyboard: {
      inline_keyboard: [
        [{ text: '🧩 پنل‌های آماده', callback_data: 'l:panels:0' }, { text: '📊 داشبورد', callback_data: 'n:status' }],
        [homeButton()],
      ],
    },
  }
}

export function gateScreen(): Screen {
  return {
    text:
      '🔒 <b>دسترسی محدود</b>\n\n' +
      'این ربات خصوصی است و اطلاعات ورکرها و پنل‌ها فقط برای مالک و ادمین‌ها نمایش داده می‌شود.\n' +
      'اگر باید به آن دسترسی داشته باشید، درخواست بفرستید تا مالک تأیید کند.\n\n' +
      '<b>مالک ربات هستید؟</b>\n' +
      'کد اتصال را از پنل وب (بخش ربات تلگرام) بردارید و همراه دستور شروع بفرستید:\n' +
      '<code>/start code</code>\n' +
      '<i>اگر برای این ربات کدی تنظیم نشده، همان /start کافی است.</i>',
    keyboard: { inline_keyboard: [[{ text: '✉️ درخواست دسترسی', callback_data: 'req' }]] },
  }
}

// ── Deploy wizard ────────────────────────────────────────────────────────────

/** `Record<string, unknown>` so it can also be persisted as a bot session. */
interface WizardData extends Record<string, unknown> {
  /** Cloudflare branch — worker execution method. */
  method?: 'workers' | 'pages'
  source?: string
  /** Row id + name of whichever token the deploy runs with (CF/Railway/Render). */
  tokenId?: string
  tokenName?: string
  name?: string
  uuid?: string
  /** Railway/Render branch — destination platform + catalog panel id. */
  target?: 'railway' | 'render'
  panel?: string
}

function randomName(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  let out = ''
  for (const b of bytes) out += alphabet[b % alphabet.length]
  return `mil-${out}`
}

export function deployStartScreen(): Screen {
  return {
    text:
      '🚀 <b>استقرار جدید</b>\n\n' +
      'چه چیزی مستقر کنیم؟\n\n' +
      '⚡ <b>ورکر کلودفلر</b> — ورکر VLESS با پنل داخلی، ساب و KV خودکار (روش پیشنهادی و کامل).\n' +
      '🏗 <b>پنل روی Railway</b> — پنل‌های کاتالوگ با دامنهٔ رایگان <code>*.up.railway.app</code>.\n' +
      '☁️ <b>پنل روی Render</b> — همان پنل‌ها روی Render.com.',
    keyboard: {
      inline_keyboard: [
        [{ text: '⚡ ورکر کلودفلر', callback_data: 'dpl:m:workers' }],
        [{ text: '🏗 پنل روی Railway', callback_data: 'dpl:T:railway' }, { text: '☁️ Render', callback_data: 'dpl:T:render' }],
        [{ text: '📄 Pages (بتا)', callback_data: 'dpl:m:pages' }],
        [backButton('n:menu')],
      ],
    },
  }
}

/** Railway/Render branch — pick a panel from the shared catalog. */
export function deployPanelScreen(data: WizardData): Screen {
  const target = data.target === 'render' ? 'render' : 'railway'
  const panels = panelsForTarget(target)
  const keyboard: TgButton[][] = panels.map((p) => [{ text: `🧩 ${p.name}`, callback_data: `dpl:p:${p.id}` }])
  keyboard.push([backButton('dpl:start', '🔙 روش استقرار')])
  return {
    text:
      `<b>استقرار پنل روی ${target === 'render' ? 'Render' : 'Railway'} — انتخاب پنل</b>\n\n` +
      panels
        .map((p) => {
          const verified = panelVerifiedLabel(p)
          return `• <b>${p.name}</b> — <i>${p.tagline}</i>${verified ? `\n  ${verified}` : ''}`
        })
        .join('\n'),
    keyboard: { inline_keyboard: keyboard },
  }
}

export function deploySourceScreen(): Screen {
  const sources = autoWorkerSources()
  const keyboard: TgButton[][] = sources.map((s) => [{ text: `🧬 ${s.name}`, callback_data: `dpl:s:${s.id}` }])
  let text = '<b>مرحلهٔ ۲ از ۴ — منبع ورکر</b>\n\n'
  for (const s of sources) text += `• <b>${s.name}</b>\n  <i>${s.description}</i>\n`
  keyboard.push([backButton('dpl:start', '🔙 روش اجرا')])
  return { text, keyboard: { inline_keyboard: keyboard } }
}

export async function deployTokenScreen(ctx: ScreenCtx, data: WizardData): Promise<Screen> {
  // Railway/Render branch — the platform token decides where the panel lands.
  if (data.target === 'railway' || data.target === 'render') {
    const table = data.target === 'railway' ? 'railway_tokens' : 'render_tokens'
    const label = data.target === 'railway' ? 'Railway' : 'Render'
    const ts = await ctx.env.DB.prepare(`SELECT id, name FROM ${table} WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 20`)
      .bind(ctx.cfg.user_id).all<{ id: string; name: string }>()
    if (!ts.results.length) {
      return {
        text: `🔑 <b>توکن ${label} لازم است</b>\n\nهیچ توکن فعالی ثبت نشده. اول در پنل وب یک توکن ${label} اضافه کنید.`,
        keyboard: {
          inline_keyboard: [
            [{ text: `➕ افزودن توکن ${label} در پنل وب`, url: `${ctx.origin}/#/tokens` }],
            [backButton('dpl:p:', '🔙 انتخاب پنل')],
          ],
        },
      }
    }
    const keyboard: TgButton[][] = ts.results.map((t) => [{ text: `🔑 ${t.name}`, callback_data: `dpl:t:${t.id}` }])
    keyboard.push([backButton('dpl:p:', '🔙 انتخاب پنل')])
    return { text: `<b>توکن ${label}</b>\n\nاستقرار پنل با این حساب انجام می‌شود؛ یکی را انتخاب کنید:`, keyboard: { inline_keyboard: keyboard } }
  }

  const ts = await ctx.env.DB.prepare("SELECT id, name FROM cf_tokens WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 20")
    .bind(ctx.cfg.user_id).all<{ id: string; name: string }>()
  if (!ts.results.length) {
    return {
      text: '🔑 <b>توکن کلودفلر لازم است</b>\n\nهیچ توکن فعالی ثبت نشده. اول در پنل وب یک توکن Cloudflare اضافه کنید.',
      keyboard: { inline_keyboard: [[{ text: '➕ افزودن توکن در پنل وب', url: `${ctx.origin}/#/tokens` }], [backButton('dpl:start')]] },
    }
  }
  const keyboard: TgButton[][] = ts.results.map((t) => [{ text: `🔑 ${t.name}`, callback_data: `dpl:t:${t.id}` }])
  keyboard.push([backButton('dpl:start', '🔙 روش اجرا')])
  return { text: '<b>مرحلهٔ ۳ از ۴ — انتخاب توکن</b>\n\nتوکنی که استقرار با آن انجام می‌شود را انتخاب کنید:', keyboard: { inline_keyboard: keyboard } }
}

export function deployConfirmScreen(data: WizardData, uuid: string): Screen {
  // Railway/Render branch — panel + platform + token summary.
  if (data.target === 'railway' || data.target === 'render') {
    const panel = resolvePanel(data.panel)
    const label = data.target === 'railway' ? 'Railway' : 'Render'
    return {
      text:
        `<b>تأیید نهایی — پنل روی ${label}</b>\n\n` +
        `🧩 پنل: <b>${panel.name}</b>\n` +
        `📦 نام پروژه: <code>${data.name ?? ''}</code>\n` +
        `🔑 توکن: <code>${data.tokenName ?? ''}</code>\n\n` +
        'رمز ادمین به‌صورت تصادفی ساخته و به‌عنوان متغیر محیطی سرویس ست می‌شود؛ بعد از آماده‌شدن فقط همین‌جا یک‌بار نمایش داده می‌شود.\n' +
        'با تأیید، استقرار شروع می‌شود و نتیجه همین‌جا اعلام خواهد شد.',
      keyboard: {
        inline_keyboard: [
          [{ text: '✅ شروع استقرار پنل', callback_data: 'dpl:go' }],
          [{ text: '✏️ تغییر نام', callback_data: 'dpl:name' }],
          [backButton('dpl:p:', '❌ لغو / تغییر پنل')],
        ],
      },
    }
  }

  const source = autoWorkerSources().find((s) => s.id === data.source)?.name ?? data.source ?? '—'
  return {
    text:
      '<b>مرحلهٔ ۴ از ۴ — تأیید نهایی</b>\n\n' +
      `📦 نام ورکر: <code>${data.name ?? ''}</code>\n` +
      `🆔 UUID: <code>${uuid}</code>\n` +
      `🧬 منبع: ${source}\n` +
      `🛠 روش: ${data.method === 'pages' ? 'Cloudflare Pages' : 'Cloudflare Workers'}\n` +
      `🔑 توکن: <code>${data.tokenName ?? ''}</code>\n\n` +
      'با تأیید، استقرار شروع می‌شود و نتیجه همین‌جا اعلام خواهد شد.',
    keyboard: {
      inline_keyboard: [
        [{ text: '✅ شروع استقرار', callback_data: 'dpl:go' }],
        [{ text: '✏️ تغییر نام', callback_data: 'dpl:name' }, { text: '🎲 UUID جدید', callback_data: 'dpl:uuid' }],
        [backButton('dpl:start', '❌ لغو')],
      ],
    },
  }
}

// ── Router ───────────────────────────────────────────────────────────────────

export interface RouterArgs {
  env: Env
  /** Worker execution context — the deploy wizard needs it for waitUntil(). */
  exec: ExecutionContext
  cfg: BotConfigRow
  chatId: number | string
  telegramId: string
  origin: string
  isAdmin: boolean
  session: BotSession | null
  data: string
}

const screenCtx = (args: RouterArgs): ScreenCtx => ({
  env: args.env,
  cfg: args.cfg,
  chatId: args.chatId,
  telegramId: args.telegramId,
  origin: args.origin,
  isAdmin: args.isAdmin,
})

export async function routeCallback(args: RouterArgs): Promise<Screen | null> {
  const { env, cfg } = args
  const ctx = screenCtx(args)
  const [kind, a, b] = args.data.split(':')

  if (args.data === 'noop') return null

  // ── Public screens (available before access is granted) ──
  if (kind === 'n') {
    if (a === 'menu') return menuScreen(ctx)
    if (a === 'help') return helpScreen()
    if (a === 'search') {
      await saveSession(env, cfg.user_id, args.telegramId, { state: 'await_search', data: {} })
      return { text: '🔍 <b>جست‌وجو</b>\n\nنام ورکر یا پنل را در پیام بعدی بفرستید.', keyboard: { inline_keyboard: [[{ text: '❌ لغو', callback_data: 'n:menu' }]] } }
    }
    if (!args.isAdmin) return gateScreen()
    if (a === 'status') return statusScreen(ctx)
    if (a === 'tokens') return tokensScreen(ctx)
    if (a === 'settings') return settingsScreen(ctx)
  }
  if (kind === 'l' && a === 'panels') return panelsScreen(Number(b ?? 0))
  if (kind === 'p') return panelScreen(a ?? '', args.origin)

  // Access requests are the only action allowed before access is granted.
  if (kind === 'req') {
    await sendMsg(cfg.bot_token, args.chatId, '✅ درخواست شما ثبت شد. بعد از تأیید مالک، دوباره /start را بزنید.')
    if (cfg.chat_id && String(cfg.chat_id) !== String(args.chatId)) {
      const row = await env.DB.prepare('SELECT id FROM bot_users WHERE user_id = ? AND telegram_id = ?')
        .bind(cfg.user_id, args.telegramId)
        .first<{ id: string }>()
      await sendMsg(cfg.bot_token, cfg.chat_id, `✉️ <b>درخواست دسترسی</b>\n\n🆔 <code>${args.telegramId}</code>`, {
        inline_keyboard: row ? [[{ text: '✅ تأیید دسترسی', callback_data: `adm:${row.id}:1` }]] : [],
      })
    }
    return null
  }

  // ── Everything below is owner/admin only ──
  if (!args.isAdmin) return gateScreen()

  if (kind === 'l') {
    const page = Number(b ?? 0)
    if (a === 'workers') return workersScreen(ctx, page)
    if (a === 'configs') return configsScreen(ctx, page)
    if (a === 'servers') return serversScreen(ctx, page)
    if (a === 'optimizer') return optimizerScreen(ctx, page)
    if (a === 'members') return membersScreen(ctx, page)
    if (a === 'users') return usersScreen(ctx, page)
  }
  if (kind === 'w') return workerScreen(ctx, a ?? '')

  // Live status check for a Railway/Render panel deploy started in the wizard.
  if (kind === 'srv') {
    const platform = a === 'render' ? 'render' : 'railway'
    const id = b ?? ''
    const watched: PanelWatchResult = await watchPanelDeploy(env, cfg.user_id, platform, id)
    if (watched.state === 'live') {
      const kb: TgButton[][] = [[{ text: `🔐 باز کردن پنل ${watched.panelName}`, url: `${watched.url}${watched.panelPath}` }], [{ text: '🖥 سرورها', callback_data: 'l:servers:0' }], [homeButton()]]
      let text =
        `🟢 <b>پنل ${watched.panelName} زنده است</b>\n\n` +
        `🔗 <code>${watched.url}${watched.panelPath}</code>\n`
      if (watched.firstLive && watched.adminUsername) {
        text +=
          `\n👤 ادمین: <code>${watched.adminUsername}</code>\n🔐 رمز: <code>${watched.adminPassword ?? '—'}</code>\n\n` +
          '⚠️ این رمز فقط همین‌جا نمایش داده می‌شود — ذخیره‌اش کنید.'
      } else {
        text += '\n⏳ بوت‌استرپ ادمین قبلاً انجام شده است.'
      }
      return { text, keyboard: { inline_keyboard: kb } }
    }
    if (watched.state === 'failed') {
      return {
        text: `❌ <b>استقرار ناموفق بود</b>\n\nوضعیت Railway/Render: <code>${watched.status}</code>\nاز داشبورد پلتفرم لاگها را ببینید و دوباره تلاش کنید.`,
        keyboard: { inline_keyboard: [[{ text: '🚀 استقرار جدید', callback_data: 'dpl:start' }], [{ text: '🖥 سرورها', callback_data: 'l:servers:0' }], [homeButton()]] },
      }
    }
    return {
      text: `⏳ <b>هنوز در حال استقرار است…</b>\n\nوضعیت: <code>${watched.status}</code>\n\nچند لحظه دیگر دوباره «بررسی وضعیت» را بزنید.`,
      keyboard: { inline_keyboard: [[{ text: '🔄 بررسی دوباره', callback_data: `srv:${platform}:${id}` }], [{ text: '🖥 سرورها', callback_data: 'l:servers:0' }], [homeButton()]] },
    }
  }

  if (kind === 'cp') {
    const d = await env.DB.prepare('SELECT id, name, worker_url, panel_url, uuid, custom_path FROM deployments WHERE id = ? AND user_id = ?')
      .bind(a ?? '', cfg.user_id)
      .first<{ id: string; name: string; worker_url: string | null; panel_url: string | null; uuid: string | null; custom_path: string | null }>()
    if (!d) return { text: '❌ مورد پیدا نشد.', keyboard: { inline_keyboard: [[homeButton()]] } }
    const value = b === 'panel' ? d.panel_url : subUrlOf(d)
    if (!value) return { text: '⏳ این مورد هنوز آماده نیست.', keyboard: { inline_keyboard: [[{ text: '🔙 ورکر', callback_data: `w:${d.id}` }], [homeButton()]] } }
    await sendMsg(cfg.bot_token, args.chatId, `📋 <b>${d.name}</b>\n\n<code>${value}</code>\n\n<i>برای کپی، روی متن بالا بزنید.</i>`)
    return null
  }

  if (kind === 'cpo') {
    const j = await env.DB.prepare('SELECT name, sub_token FROM optimizer_jobs WHERE id = ? AND user_id = ?')
      .bind(a ?? '', cfg.user_id)
      .first<{ name: string; sub_token: string }>()
    if (!j) return { text: '❌ مورد پیدا نشد.', keyboard: { inline_keyboard: [[homeButton()]] } }
    await sendMsg(cfg.bot_token, args.chatId, `⚡ <b>${j.name}</b>\n\n<code>${j.sub_token}</code>`)
    return null
  }

  if (kind === 'del' || kind === 'delok') {
    const d = await env.DB.prepare('SELECT id, name FROM deployments WHERE id = ? AND user_id = ?')
      .bind(a ?? '', cfg.user_id)
      .first<{ id: string; name: string }>()
    if (!d) return { text: '❌ ورکر پیدا نشد.', keyboard: { inline_keyboard: [[{ text: '📋 ورکرها', callback_data: 'l:workers:0' }]] } }
    if (kind === 'del') {
      return {
        text: `🗑 <b>حذف ${d.name}</b>\n\nآیا مطمئن هستید؟ این رکورد از پنل حذف می‌شود (خود ورکر باید از داشبورد کلودفلر حذف شود).`,
        keyboard: { inline_keyboard: [[{ text: '✅ بله، حذف کن', callback_data: `delok:${d.id}` }], [backButton(`w:${d.id}`, '❌ انصراف')]] },
      }
    }
    await env.DB.prepare('DELETE FROM deployments WHERE id = ? AND user_id = ?').bind(d.id, cfg.user_id).run()
    await env.DB.prepare('INSERT INTO activity_logs (id, user_id, action, entity_type, entity_name, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(genId(), cfg.user_id, 'deployment_deleted', 'deployment', d.name, nowIso())
      .run()
    return workersScreen(ctx, 0)
  }

  if (kind === 'adm') {
    await env.DB.prepare('UPDATE bot_users SET is_admin = ? WHERE id = ? AND user_id = ?')
      .bind(b === '1' ? 1 : 0, a ?? '', cfg.user_id)
      .run()
    return usersScreen(ctx, 0)
  }

  if (kind === 'set') {
    if (a === 'welcome') {
      await saveSession(env, cfg.user_id, args.telegramId, { state: 'await_welcome', data: {} })
      return { text: '✏️ <b>پیام خوش‌آمد</b>\n\nمتن جدید را در پیام بعدی بفرستید.', keyboard: { inline_keyboard: [[{ text: '❌ لغو', callback_data: 'n:settings' }]] } }
    }
    if (a === 'welcome_reset') {
      const fallback = '👋 به ربات میلی‌کانفیگ خوش آمدید.\nاز منوی پایین شروع کنید.'
      await env.DB.prepare('UPDATE bot_config SET welcome_message = ?, updated_at = ? WHERE id = ?').bind(fallback, nowIso(), cfg.id).run()
      cfg.welcome_message = fallback
      return settingsScreen(ctx)
    }
    if (a === 'commands') {
      const { syncBotProfile } = await import('./telegram-core')
      await syncBotProfile(cfg.bot_token, args.origin)
      return { text: '✅ دکمهٔ منو، لیست دستورات و معرفی ربات ثبت شد.', keyboard: { inline_keyboard: [[backButton('n:settings', '🔙 تنظیمات'), homeButton()]] } }
    }
  }

  // ── Deploy wizard ──
  if (kind === 'dpl') return deployWizard(args, a ?? '', b ?? '')
  return null
}

async function deployWizard(args: RouterArgs, a: string, b: string): Promise<Screen | null> {
  const { env, cfg } = args
  const ctx = screenCtx(args)
  const data: WizardData = (args.session?.data as WizardData) ?? {}

  if (a === 'start') {
    await clearSession(env, cfg.user_id, args.telegramId)
    return deployStartScreen()
  }

  // ── Railway/Render panel branch ──
  if (a === 'T') {
    data.target = b === 'render' ? 'render' : 'railway'
    data.panel = undefined
    data.tokenId = undefined
    data.name = undefined
    await saveSession(env, cfg.user_id, args.telegramId, { state: 'deploy', data })
    return deployPanelScreen(data)
  }
  if (a === 'p' && data.target) {
    const panel = resolvePanel(b)
    if (!panel.targets.includes(data.target)) return deployPanelScreen(data)
    data.panel = panel.id
    await saveSession(env, cfg.user_id, args.telegramId, { state: 'deploy', data })
    return deployTokenScreen(ctx, data)
  }
  if (a === 't' && data.target && data.panel) {
    const table = data.target === 'railway' ? 'railway_tokens' : 'render_tokens'
    const token = await env.DB.prepare(`SELECT id, name FROM ${table} WHERE id = ? AND user_id = ? AND status = 'active'`)
      .bind(b, cfg.user_id)
      .first<{ id: string; name: string }>()
    if (!token) return deployTokenScreen(ctx, data)
    data.tokenId = token.id
    data.tokenName = token.name
    data.name = data.name ?? randomName()
    await saveSession(env, cfg.user_id, args.telegramId, { state: 'deploy', data })
    return deployConfirmScreen(data, String(data.uuid ?? ''))
  }

  // ── Shared steps ──
  if (a === 'name') {
    await saveSession(env, cfg.user_id, args.telegramId, { state: 'await_name', data })
    return {
      text: '✏️ <b>نام پروژه/ورکر</b>\n\nنام جدید را بفرستید (حروف کوچک انگلیسی، عدد و خط تیره — مثل <code>mil-ab12cd</code>).',
      keyboard: { inline_keyboard: [[backButton('dpl:confirm', '❌ لغو')]] },
    }
  }
  if (a === 'confirm') return deployConfirmScreen(data, String(data.uuid ?? crypto.randomUUID()))

  // ── Cloudflare branch ──
  if (a === 'm') {
    data.method = b === 'pages' ? 'pages' : 'workers'
    await saveSession(env, cfg.user_id, args.telegramId, { state: 'deploy', data })
    return deploySourceScreen()
  }
  if (a === 's') {
    if (!data.method) return deployStartScreen()
    data.source = b || 'edgetunnel'
    await saveSession(env, cfg.user_id, args.telegramId, { state: 'deploy', data })
    return deployTokenScreen(ctx, data)
  }
  if (a === 't') {
    if (!data.source) return deployStartScreen()
    const token = await env.DB.prepare("SELECT id, name FROM cf_tokens WHERE id = ? AND user_id = ? AND status = 'active'")
      .bind(b, cfg.user_id)
      .first<{ id: string; name: string }>()
    if (!token) return deployTokenScreen(ctx, data)
    data.tokenId = token.id
    data.tokenName = token.name
    data.name = data.name ?? randomName()
    data.uuid = data.uuid ?? crypto.randomUUID()
    await saveSession(env, cfg.user_id, args.telegramId, { state: 'deploy', data })
    return deployConfirmScreen(data, data.uuid)
  }
  if (a === 'uuid') {
    data.uuid = crypto.randomUUID()
    await saveSession(env, cfg.user_id, args.telegramId, { state: 'deploy', data })
    return deployConfirmScreen(data, data.uuid)
  }

  if (a === 'go') {
    // Panel branch: Railway or Render via the shared engine.
    if (data.target && data.panel && data.tokenId && data.name) {
      const started: StartPanelDeployResult = await startPanelDeploy(env, {
        userId: cfg.user_id,
        tokenId: data.tokenId,
        name: data.name,
        panel: resolvePanel(data.panel),
      })
      await clearSession(env, cfg.user_id, args.telegramId)
      if (!started.ok) {
        return {
          text: `❌ <b>استقرار پنل شروع نشد</b>\n\n${started.error}`,
          keyboard: { inline_keyboard: [[{ text: '🔁 تلاش دوباره', callback_data: 'dpl:start' }], [homeButton()]] },
        }
      }
      const label = started.platform === 'render' ? 'Render' : 'Railway'
      return {
        text:
          `🚀 <b>استقرار پنل روی ${label} شروع شد</b>\n\n` +
          `🧩 ${resolvePanel(data.panel).name}\n` +
          `📦 <code>${data.name}</code>\n\n` +
          'پروژه ساخته می‌شود، مخزن پنل متصل و متغیرهای محیطی ست می‌شوند. معمولاً ۲ تا ۵ دقیقه طول می‌کشد؛ به محض آماده‌شدن، نتیجه و رمز ادمین همین‌جا اعلام می‌شود.',
        keyboard: {
          inline_keyboard: [
            [{ text: started.platform === 'render' ? '☁️ داشبورد Render' : '🏗 داشبورد Railway', url: started.dashboardUrl }],
            [{ text: '🖥 سرورها', callback_data: 'l:servers:0' }, { text: '📊 داشبورد', callback_data: 'n:status' }],
            [{ text: '🔄 بررسی وضعیت', callback_data: `srv:${started.platform}:${started.id}` }],
            [homeButton()],
          ],
        },
      }
    }

    // Cloudflare worker branch.
    if (!data.method || !data.source || !data.tokenId || !data.name) return deployStartScreen()
    const started = await startDeployment(env, args.exec, {
      userId: cfg.user_id,
      name: data.name,
      uuid: String(data.uuid ?? crypto.randomUUID()),
      cfTokenId: data.tokenId,
      method: data.method,
      workerSource: data.source,
      origin: args.origin,
    })
    await clearSession(env, cfg.user_id, args.telegramId)
    if (!started.ok) {
      return {
        text: `❌ <b>استقرار شروع نشد</b>\n\n${started.error}`,
        keyboard: { inline_keyboard: [[{ text: '🔁 تلاش دوباره', callback_data: 'dpl:start' }], [homeButton()]] },
      }
    }
    return {
      text:
        '🚀 <b>استقرار شروع شد</b>\n\n' +
        `📦 <code>${data.name}</code>\n` +
        'KV ساخته می‌شود، کد ورکر آپلود می‌شود و در پایان نتیجه را همین‌جا اعلام می‌کنیم.\nحدود ۳۰ تا ۹۰ ثانیه طول می‌کشد.',
      keyboard: { inline_keyboard: [[{ text: '📊 داشبورد', callback_data: 'n:status' }, { text: '📋 ورکرها', callback_data: 'l:workers:0' }], [homeButton()]] },
    }
  }
  return null
}

// ── Text routing ─────────────────────────────────────────────────────────────

export async function routeText(args: RouterArgs, text: string): Promise<Screen | null> {
  const { env, cfg, isAdmin } = args
  const ctx = screenCtx(args)

  // Conversation states win over everything else.
  if (args.session) {
    if (args.session.state === 'await_name') {
      const name = text.trim().toLowerCase()
      if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(name)) {
        return { text: '❌ نام نامعتبر است. فقط حروف کوچک انگلیسی، عدد و خط تیره (۲ تا ۶۳ کاراکتر).', keyboard: { inline_keyboard: [[backButton('dpl:confirm', '❌ لغو')]] } }
      }
      const data = { ...(args.session.data as WizardData), name }
      await saveSession(env, cfg.user_id, args.telegramId, { state: 'deploy', data })
      return deployConfirmScreen(data, String(data.uuid ?? crypto.randomUUID()))
    }
    if (args.session.state === 'await_search') {
      await clearSession(env, cfg.user_id, args.telegramId)
      const q = text.trim().toLowerCase()
      const rows = await env.DB.prepare(
        'SELECT id, name, status FROM deployments WHERE user_id = ? AND name LIKE ? ORDER BY created_at DESC LIMIT 10',
      ).bind(cfg.user_id, `%${q}%`).all<{ id: string; name: string; status: string }>()
      const panels = PANELS.filter((p) => p.name.toLowerCase().includes(q) || p.repo.toLowerCase().includes(q) || p.id.includes(q))
      let out = `🔍 <b>نتیجهٔ جست‌وجو</b>\n\n`
      const keyboard: TgButton[][] = []
      if (!rows.results.length && !panels.length) out += 'چیزی پیدا نشد.'
      for (const r of rows.results) {
        out += `📦 ${statusIcon(r.status)} <code>${r.name}</code>\n`
        keyboard.push([{ text: `📦 ${r.name}`, callback_data: `w:${r.id}` }])
      }
      for (const p of panels) {
        out += `🧩 ${panelOriginLabel(p)} <b>${p.name}</b>\n`
        keyboard.push([{ text: `ℹ️ ${p.name}`, callback_data: `p:${p.id}` }])
      }
      keyboard.push([homeButton()])
      return { text: out, keyboard: { inline_keyboard: keyboard } }
    }
    if (args.session.state === 'await_welcome') {
      const value = text.trim().slice(0, 1000)
      await env.DB.prepare('UPDATE bot_config SET welcome_message = ?, updated_at = ? WHERE id = ?').bind(value, nowIso(), cfg.id).run()
      cfg.welcome_message = value
      await clearSession(env, cfg.user_id, args.telegramId)
      return { text: '✅ پیام خوش‌آمد ذخیره شد.', keyboard: { inline_keyboard: [[backButton('n:settings', '🔙 تنظیمات'), homeButton()]] } }
    }
  }

  // Reply-keyboard tabs.
  if (text === MENU.dashboard) return isAdmin ? statusScreen(ctx) : gateScreen()
  if (text === MENU.workers) return isAdmin ? workersScreen(ctx, 0) : gateScreen()
  if (text === MENU.panels) return panelsScreen(0)
  if (text === MENU.servers) return isAdmin ? serversScreen(ctx, 0) : gateScreen()
  if (text === MENU.tokens) return isAdmin ? tokensScreen(ctx) : gateScreen()
  if (text === MENU.help) return helpScreen()

  const [cmd, ...rest] = text.split(/\s+/)
  const arg = rest.join(' ')

  if (cmd === '/start') {
    // `/start <claim_code>` is how the owner adopts the bot (the code lives in
    // the web panel), so the access level must be re-evaluated *after* this.
    const { maybeClaim, checkIsAdmin } = await import('./telegram-core')
    const claimed = await maybeClaim(env, cfg, args.chatId, args.telegramId, rest[0] ?? '')
    const nowAdmin = String(cfg.chat_id ?? '') === args.telegramId || (await checkIsAdmin(env, cfg.user_id, args.telegramId))
    if (nowAdmin) {
      args.isAdmin = true
      if (claimed) {
        await sendMsg(
          cfg.bot_token,
          args.chatId,
          '👑 <b>شما به‌عنوان مالک این ربات ثبت شدید.</b>\n\nکد اتصال باطل شد؛ از این پس فقط شما و ادمین‌هایی که تأیید می‌کنید به داده‌ها دسترسی دارید.',
        )
      }
      return menuScreen({ ...ctx, isAdmin: true })
    }
    return gateScreen()
  }
  if (cmd === '/menu') return isAdmin ? menuScreen(ctx) : gateScreen()
  if (cmd === '/help') return helpScreen()
  if (cmd === '/panels') return panelsScreen(0)
  if (cmd === '/quickstart') {
    return {
      text:
        '⚡ <b>شروع سریع</b>\n\n' +
        '۱) در پنل وب یک توکن Cloudflare اضافه کنید.\n' +
        '۲) در همین ربات /deploy را بزنید.\n' +
        '۳) روش را انتخاب کنید: ورکر کلودفلر، یا پنل روی Railway/Render.\n' +
        '۴) منبع/پنل، توکن و نام را انتخاب و تأیید کنید.\n' +
        '۵) نتیجهٔ استقرار خودکار همین‌جا اعلام می‌شود.\n\n' +
        'استقرار پنل VPS از پنل وب است؛ کاتالوگ کامل در «🧩 پنل‌ها».',
      keyboard: { inline_keyboard: [[{ text: '🚀 استقرار جدید', callback_data: 'dpl:start' }], [homeButton()]] },
    }
  }

  if (!isAdmin) {
    if (cmd === '/id') return { text: `🆔 شناسهٔ شما: <code>${args.telegramId}</code>`, keyboard: { inline_keyboard: [[homeButton()]] } }
    return gateScreen()
  }

  if (cmd === '/status') return statusScreen(ctx)
  if (cmd === '/workers') return workersScreen(ctx, 0)
  if (cmd === '/configs') return configsScreen(ctx, 0)
  if (cmd === '/servers') return serversScreen(ctx, 0)
  if (cmd === '/tokens') return tokensScreen(ctx)
  if (cmd === '/members') return membersScreen(ctx, 0)
  if (cmd === '/users') return usersScreen(ctx, 0)
  if (cmd === '/settings') return settingsScreen(ctx)
  if (cmd === '/deploy') return deployStartScreen()

  if (cmd === '/config' || cmd === '/sub' || cmd === '/panel') {
    if (!arg) return workersScreen(ctx, 0)
    const wn = arg.toLowerCase().replace(/[^a-z0-9-]/g, '')
    const d = await env.DB.prepare('SELECT id, name, status FROM deployments WHERE user_id = ? AND name = ?')
      .bind(cfg.user_id, wn)
      .first<{ id: string; name: string; status: string }>()
    if (!d) return { text: `❌ ورکری با نام <code>${wn}</code> پیدا نشد.`, keyboard: { inline_keyboard: [[{ text: '📋 ورکرها', callback_data: 'l:workers:0' }], [homeButton()]] } }
    return workerScreen(ctx, d.id)
  }

  if (cmd === '/set') {
    const parts = arg.split(/\s+/)
    if (parts.length < 3) {
      return { text: '⚙️ استفاده: <code>/set worker key value</code>\nکلیدهای مجاز: path, proxyip, region, homepage', keyboard: { inline_keyboard: [[homeButton()]] } }
    }
    const [wn, key, ...valueParts] = parts
    const value = valueParts.join(' ')
    if (!['path', 'proxyip', 'region', 'homepage'].includes(key.toLowerCase())) {
      return { text: '❌ کلید نامعتبر. کلیدهای مجاز: path, proxyip, region, homepage', keyboard: { inline_keyboard: [[homeButton()]] } }
    }
    const target = wn.toLowerCase().replace(/[^a-z0-9-]/g, '')
    const d = await env.DB.prepare('SELECT id, name, config FROM deployments WHERE user_id = ? AND name = ?')
      .bind(cfg.user_id, target)
      .first<{ id: string; name: string; config: string | null }>()
    if (!d) return { text: `❌ ورکر <code>${wn}</code> پیدا نشد.`, keyboard: { inline_keyboard: [[homeButton()]] } }
    const stored = safeJsonParse<Record<string, unknown>>(d.config ?? '{}', {})
    stored[key.toLowerCase()] = value
    await env.DB.prepare('UPDATE deployments SET config = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(stored), nowIso(), d.id).run()
    return { text: `✅ <code>${d.name}</code> به‌روز شد.\n${key.toLowerCase()}: <code>${value}</code>`, keyboard: { inline_keyboard: [[{ text: '📦 ورکر', callback_data: `w:${d.id}` }], [homeButton()]] } }
  }

  if (cmd === '/id') return { text: `🆔 شناسهٔ شما: <code>${args.telegramId}</code>`, keyboard: { inline_keyboard: [[homeButton()]] } }

  return {
    text: 'متوجه نشدم 🤔\nاز منوی پایین استفاده کنید یا /help را بزنید.',
    keyboard: { inline_keyboard: [[{ text: '📖 راهنما', callback_data: 'n:help' }], [homeButton()]] },
  }
}
