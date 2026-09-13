import type { Env } from './env'
import { MENU, replyKeyboard, routeCallback, routeText } from './telegram-ui'
import {
  answerCb,
  checkIsAdmin,
  loadSession,
  notifyDeployment,
  notifyOptimizer,
  notifyQuotaLevel,
  renderScreen,
  resolveConfig,
  sendMsg,
  tg,
  trackUser,
  type Screen,
  type TgUpdate,
} from './telegram-core'

// ══════════════════════════════════════════════════════════════════════════════
//  Telegram webhook — the HTTP edge of the bot.
//
//  Everything the bot *knows* lives in worker/telegram-core.ts and every screen
//  in worker/telegram-ui.ts. This file only authenticates the update, works out
//  the caller's access level, hands it to the router and answers Telegram fast.
//
//  Telegram retries any webhook it considers slow, so the heavy work always runs
//  inside ctx.waitUntil() and the response goes back immediately.
// ══════════════════════════════════════════════════════════════════════════════

// Re-exported so worker/index.ts, worker/deploy.ts and worker/members.ts keep a
// single import path for both the webhook and the owner notifications.
export { notifyDeployment, notifyOptimizer, notifyQuotaLevel }

/** Deep-link payloads: /start workers, /start deploy, … */
const DEEP_LINKS: Record<string, string> = {
  dashboard: 'n:status',
  status: 'n:status',
  workers: 'l:workers:0',
  panels: 'l:panels:0',
  servers: 'l:servers:0',
  tokens: 'n:tokens',
  deploy: 'dpl:start',
  help: 'n:help',
  settings: 'n:settings',
}

/** Screens that come back with the persistent tab keyboard attached. */
const MAIN_SCREENS = new Set([
  'n:status', 'n:tokens', 'n:help', 'n:settings',
  'l:workers:0', 'l:panels:0', 'l:servers:0',
])

const isTab = (text: string): boolean => (Object.values(MENU) as string[]).includes(text)

function jsonOk(): Response {
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

/** A lightweight "the bot is working" signal — the app-like touch. */
function typing(token: string, chatId: number | string): Promise<unknown> {
  return tg(token, 'sendChatAction', { chat_id: chatId, action: 'typing' })
}

function errorScreen(): Screen {
  return {
    text: '⚠️ خطای غیرمنتظره رخ داد. لطفاً دوباره تلاش کنید.',
    keyboard: { inline_keyboard: [[{ text: '🔄 تلاش دوباره', callback_data: 'n:menu' }]] },
  }
}

export async function handleTelegramWebhook(
  env: Env,
  ctx: ExecutionContext,
  request: Request,
): Promise<Response> {
  const origin = new URL(request.url).origin

  let update: TgUpdate
  try {
    update = (await request.json()) as TgUpdate
  } catch {
    return jsonOk()
  }

  const cfg = await resolveConfig(env, request)
  if (!cfg) return jsonOk()
  const bt = cfg.bot_token

  // ── Inline button presses ────────────────────────────────────────────────
  if (update.callback_query) {
    const cq = update.callback_query
    const chatId = cq.message?.chat?.id
    const messageId = cq.message?.message_id ?? null
    if (!chatId) return jsonOk()

    const telegramId = String(cq.from?.id ?? '')
    const data = cq.data ?? ''

    ctx.waitUntil(answerCb(bt, cq.id).catch(() => null))
    ctx.waitUntil(
      (async () => {
        try {
          if (!telegramId) return
          const isAdmin =
            String(cfg.chat_id ?? '') === telegramId ||
            (await checkIsAdmin(env, cfg.user_id, telegramId))
          const session = await loadSession(env, cfg.user_id, telegramId)
          const screen = await routeCallback({
            env,
            exec: ctx,
            cfg,
            chatId,
            telegramId,
            origin,
            isAdmin,
            session,
            data,
          })
          if (screen) await renderScreen(bt, chatId, messageId, screen)
        } catch {
          await renderScreen(bt, chatId, messageId, errorScreen())
        }
      })(),
    )
    return jsonOk()
  }

  // ── Text messages ────────────────────────────────────────────────────────
  const message = update.message
  if (!message) return jsonOk()

  const chatId = message.chat.id
  const from = message.from
  const telegramId = String(from?.id ?? '')

  // Anything that is not text gets a short nudge instead of silence.
  if (!message.text) {
    if (telegramId) {
      ctx.waitUntil(
        sendMsg(bt, chatId, 'فقط پیام متنی پشتیبانی می‌شود. از منوی پایین استفاده کنید.', replyKeyboard()).catch(() => null),
      )
    }
    return jsonOk()
  }

  const text = message.text.trim()

  ctx.waitUntil(
    (async () => {
      try {
        if (telegramId) {
          await trackUser(env, cfg, telegramId, from?.username ?? null, from?.first_name ?? null, from?.last_name ?? null)
        }

        const isAdmin =
          !!telegramId &&
          (String(cfg.chat_id ?? '') === telegramId || (await checkIsAdmin(env, cfg.user_id, telegramId)))
        const session = telegramId ? await loadSession(env, cfg.user_id, telegramId) : null

        const args = { env, exec: ctx, cfg, chatId, telegramId, origin, isAdmin, session, data: '' }

        await typing(bt, chatId).catch(() => null)

        // `/start <payload>` deep links land directly on the requested section.
        const [cmd, ...rest] = text.split(/\s+/)
        const deep = cmd === '/start' && rest[0] ? DEEP_LINKS[rest[0].toLowerCase()] : undefined
        if (deep) {
          const screen = await routeCallback({ ...args, data: deep })
          if (screen) {
            await sendMsg(bt, chatId, screen.text, MAIN_SCREENS.has(deep) ? replyKeyboard() : screen.keyboard)
            return
          }
        }

        const screen = await routeText(args, text)
        if (!screen) return

        // Routing may have just claimed the bot (via `/start <code>`), so the
        // keyboard decision uses the post-routing ownership state.
        const owns = isAdmin || String(cfg.chat_id ?? '') === telegramId
        if (owns && (text === '/start' || text === '/menu' || text === '/quickstart' || isTab(text))) {
          await sendMsg(bt, chatId, screen.text, replyKeyboard())
          return
        }
        await renderScreen(bt, chatId, null, screen)
      } catch {
        await sendMsg(bt, chatId, errorScreen().text).catch(() => null)
      }
    })(),
  )

  return jsonOk()
}
