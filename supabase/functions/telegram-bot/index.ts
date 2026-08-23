import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function tgPost(token: string, method: string, body: Record<string, unknown>) {
  return fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());
}

async function sendMsg(token: string, chatId: string | number, text: string, keyboard?: object) {
  const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: "HTML" };
  if (keyboard) body.reply_markup = keyboard;
  return tgPost(token, "sendMessage", body);
}

// Fire-and-forget: track user + log activity without blocking the response
function trackUser(telegramId: string, userId: string, username: string | null, firstName: string | null, lastName: string | null) {
  EdgeRuntime.waitUntil((async () => {
    const { data: existing } = await supabase
      .from("bot_users").select("id, is_admin").eq("telegram_id", telegramId).maybeSingle();

    if (existing) {
      await supabase.from("bot_users")
        .update({ last_activity: new Date().toISOString(), username, first_name: firstName, last_name: lastName })
        .eq("id", existing.id);
    } else {
      await supabase.from("bot_users").insert({
        user_id: userId, telegram_id: telegramId, username,
        first_name: firstName, last_name: lastName, is_active: true, is_admin: false,
      });
      await supabase.from("activity_logs").insert({
        user_id: userId, action: "bot_user_joined", entity_type: "bot",
        entity_name: username ? `@${username}` : firstName,
      });
    }
  })());
}

async function checkIsAdmin(telegramId: string): Promise<boolean> {
  const { data } = await supabase
    .from("bot_users").select("is_admin").eq("telegram_id", telegramId).maybeSingle();
  return data?.is_admin ?? false;
}

async function pollDeploymentStatus(deploymentId: string, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    const { data } = await supabase
      .from("deployments").select("status, worker_url, panel_url, error_message")
      .eq("id", deploymentId).maybeSingle();
    if (data && (data.status === "deployed" || data.status === "failed")) return data;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return { status: "timeout", worker_url: null, panel_url: null, error_message: "timeout" };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const ok = () => new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const update = await req.json();

    // Callback queries (inline button presses)
    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq.message?.chat?.id;
      const cbData = cq.data;
      tgPost("", "answerCallbackQuery", { callback_query_id: cq.id }).catch(() => {});

      const { data: cfgs } = await supabase.from("bot_config").select("*").eq("is_active", true);
      if (!cfgs?.length) return ok();
      const cfg = cfgs[0];
      const bt = cfg.bot_token;

      if (cbData === "status") {
        const [tk, dp, bu] = await Promise.all([
          supabase.from("cf_tokens").select("*", { count: "exact", head: true }).eq("user_id", cfg.user_id),
          supabase.from("deployments").select("status").eq("user_id", cfg.user_id),
          supabase.from("bot_users").select("*", { count: "exact", head: true }).eq("user_id", cfg.user_id),
        ]);
        const deployed = (dp.data ?? []).filter((d: { status: string }) => d.status === "deployed").length;
        await sendMsg(bt, chatId, `📊 <b>وضعیت سرویس‌ها:</b>\n\n🔑 توکن‌ها: ${tk.count ?? 0}\n🚀 ورکرهای مستقر: ${deployed}\n👥 کاربران: ${bu.count ?? 0}\n🤖 ربات: ${cfg.is_active ? "فعال ✅" : "غیرفعال ❌"}`);
      } else if (cbData === "workers") {
        const { data: ws } = await supabase.from("deployments").select("name, status, worker_url").eq("user_id", cfg.user_id).order("created_at", { ascending: false }).limit(10);
        if (!ws?.length) { await sendMsg(bt, chatId, "هنوز ورکری مستقر نشده."); }
        else { let m = "🚀 <b>ورکرهای اخیر:</b>\n\n"; ws.forEach((w: { name: string; status: string; worker_url: string | null }) => { const e = w.status === "deployed" ? "✅" : w.status === "failed" ? "❌" : "⏳"; m += `${e} <code>${w.name}</code>\n`; if (w.worker_url) m += `   🔗 <code>${w.worker_url}</code>\n`; }); await sendMsg(bt, chatId, m); }
      } else if (cbData === "configs") {
        const { data: ws } = await supabase.from("deployments").select("name, status, panel_url, worker_url, uuid, custom_path").eq("user_id", cfg.user_id).eq("status", "deployed").order("created_at", { ascending: false }).limit(5);
        if (!ws?.length) { await sendMsg(bt, chatId, "🔗 هنوز ورکر مستقر شده‌ای وجود ندارد."); }
        else { let m = "🔗 <b>کانفیگ‌های اخیر:</b>\n\n"; ws.forEach((w: { name: string; worker_url: string; uuid: string; custom_path: string | null }) => { const p = w.custom_path || w.uuid; m += `📦 <code>${w.name}</code>\nساب: <code>${w.worker_url}/${p}</code>\n\n`; }); await sendMsg(bt, chatId, m); }
      }
      return ok();
    }

    const message = update.message;
    if (!message || !message.text) return ok();

    const chatId = message.chat.id;
    const telegramId = String(message.from.id);
    const username = message.from.username ?? null;
    const firstName = message.from.first_name ?? null;
    const lastName = message.from.last_name ?? null;
    const text = message.text.trim();

    // Get bot config — the only blocking call before sending reply
    const { data: cfgs } = await supabase.from("bot_config").select("*").eq("is_active", true);
    if (!cfgs?.length) return ok();
    const cfg = cfgs[0];
    const bt = cfg.bot_token;

    // Track user in background (non-blocking)
    trackUser(telegramId, cfg.user_id, username, firstName, lastName);

    if (text === "/start") {
      await sendMsg(bt, chatId, cfg.welcome_message, {
        inline_keyboard: [
          [{ text: "🚀 استقرار ورکر", callback_data: "deploy" }, { text: "📊 وضعیت", callback_data: "status" }],
          [{ text: "📋 ورکرها", callback_data: "workers" }, { text: "🔗 کانفیگ‌ها", callback_data: "configs" }],
        ],
      });

    } else if (text === "/help") {
      await sendMsg(bt, chatId, "📖 <b>دستورات:</b>\n\n/start - شروع\n/deploy &lt;name&gt; - استقرار (ادمین)\n/workers - ورکرها\n/config &lt;name&gt; - کانفیگ\n/sub [name] - ساب\n/panel [name] - پنل\n/status - وضعیت\n/help - راهنما");

    } else if (text === "/status") {
      const [tk, dp, bu] = await Promise.all([
        supabase.from("cf_tokens").select("*", { count: "exact", head: true }).eq("user_id", cfg.user_id),
        supabase.from("deployments").select("status").eq("user_id", cfg.user_id),
        supabase.from("bot_users").select("*", { count: "exact", head: true }).eq("user_id", cfg.user_id),
      ]);
      const deployed = (dp.data ?? []).filter((d: { status: string }) => d.status === "deployed").length;
      await sendMsg(bt, chatId, `📊 <b>وضعیت:</b>\n\n🔑 توکن‌ها: ${tk.count ?? 0}\n🚀 ورکرها: ${deployed}\n👥 کاربران: ${bu.count ?? 0}\n🤖 ربات: ${cfg.is_active ? "فعال ✅" : "غیرفعال ❌"}`);

    } else if (text === "/workers") {
      const { data: ws } = await supabase.from("deployments").select("name, status, worker_url").eq("user_id", cfg.user_id).order("created_at", { ascending: false }).limit(10);
      if (!ws?.length) { await sendMsg(bt, chatId, "هنوز ورکری مستقر نشده."); }
      else { let m = "🚀 <b>ورکرها:</b>\n\n"; ws.forEach((w: { name: string; status: string; worker_url: string | null }) => { const e = w.status === "deployed" ? "✅" : w.status === "failed" ? "❌" : "⏳"; m += `${e} <code>${w.name}</code>\n`; if (w.worker_url) m += `   🔗 <code>${w.worker_url}</code>\n`; }); await sendMsg(bt, chatId, m); }

    } else if (text === "/tokens") {
      const { data: ts } = await supabase.from("cf_tokens").select("name, status").eq("user_id", cfg.user_id).order("created_at", { ascending: false });
      if (!ts?.length) { await sendMsg(bt, chatId, "🔑 هنوز توکنی اضافه نشده."); }
      else { let m = "🔑 <b>توکن‌ها:</b>\n\n"; ts.forEach((t: { name: string; status: string }) => { m += `${t.status === "active" ? "✅" : "❌"} ${t.name}\n`; }); await sendMsg(bt, chatId, m); }

    } else if (text.startsWith("/config")) {
      const parts = text.split(" ");
      if (parts.length < 2) { await sendMsg(bt, chatId, "📋 استفاده: <code>/config my-worker</code>"); }
      else {
        const wn = parts[1].toLowerCase().replace(/[^a-z0-9-]/g, "");
        const { data: w } = await supabase.from("deployments").select("name, status, worker_url, panel_url, uuid, custom_path").eq("user_id", cfg.user_id).eq("name", wn).maybeSingle();
        if (!w) { await sendMsg(bt, chatId, `❌ <code>${wn}</code> پیدا نشد.`); }
        else if (w.status !== "deployed") { await sendMsg(bt, chatId, `⏳ <code>${wn}</code> هنوز مستقر نشده.`); }
        else { const p = w.custom_path || w.uuid; await sendMsg(bt, chatId, `📋 <b>${wn}</b>\n\n🔐 پنل:\n<code>${w.panel_url}</code>\n\n🔗 ساب:\n<code>${w.worker_url}/${p}</code>`); }
      }

    } else if (text.startsWith("/sub")) {
      const parts = text.split(" ");
      if (parts.length < 2) {
        const { data: ws } = await supabase.from("deployments").select("name, worker_url, uuid, custom_path").eq("user_id", cfg.user_id).eq("status", "deployed").order("created_at", { ascending: false });
        if (!ws?.length) { await sendMsg(bt, chatId, "🔗 ورکری نیست."); }
        else { let m = "🔗 <b>ساب‌ها:</b>\n\n"; ws.forEach((w: { name: string; worker_url: string; uuid: string; custom_path: string | null }) => { m += `📦 <code>${w.name}</code>\n<code>${w.worker_url}/${w.custom_path || w.uuid}</code>\n\n`; }); await sendMsg(bt, chatId, m); }
      } else {
        const wn = parts[1].toLowerCase().replace(/[^a-z0-9-]/g, "");
        const { data: w } = await supabase.from("deployments").select("name, status, worker_url, uuid, custom_path").eq("user_id", cfg.user_id).eq("name", wn).maybeSingle();
        if (!w) { await sendMsg(bt, chatId, `❌ <code>${wn}</code> پیدا نشد.`); }
        else if (w.status !== "deployed") { await sendMsg(bt, chatId, `⏳ <code>${wn}</code> مستقر نشده.`); }
        else { await sendMsg(bt, chatId, `🔗 <b>${wn}</b>\n\n<code>${w.worker_url}/${w.custom_path || w.uuid}</code>`); }
      }

    } else if (text.startsWith("/panel")) {
      const parts = text.split(" ");
      if (parts.length < 2) {
        const { data: ws } = await supabase.from("deployments").select("name, panel_url").eq("user_id", cfg.user_id).eq("status", "deployed").order("created_at", { ascending: false });
        if (!ws?.length) { await sendMsg(bt, chatId, "🔐 ورکری نیست."); }
        else { let m = "🔐 <b>پنل‌ها:</b>\n\n"; ws.forEach((w: { name: string; panel_url: string | null }) => { m += `📦 <code>${w.name}</code>\n<code>${w.panel_url}</code>\n\n`; }); await sendMsg(bt, chatId, m); }
      } else {
        const wn = parts[1].toLowerCase().replace(/[^a-z0-9-]/g, "");
        const { data: w } = await supabase.from("deployments").select("name, status, panel_url").eq("user_id", cfg.user_id).eq("name", wn).maybeSingle();
        if (!w) { await sendMsg(bt, chatId, `❌ <code>${wn}</code> پیدا نشد.`); }
        else if (w.status !== "deployed") { await sendMsg(bt, chatId, `⏳ <code>${wn}</code> مستقر نشده.`); }
        else { await sendMsg(bt, chatId, `🔐 <b>${wn}</b>\n\n<code>${w.panel_url}</code>`); }
      }

    } else if (text.startsWith("/set")) {
      const parts = text.split(" ");
      if (parts.length < 4) { await sendMsg(bt, chatId, "⚙️ استفاده: <code>/set worker key value</code>"); }
      else if (!await checkIsAdmin(telegramId)) { await sendMsg(bt, chatId, "⛔ فقط ادمین."); }
      else {
        const wn = parts[1].toLowerCase().replace(/[^a-z0-9-]/g, "");
        const key = parts[2].toLowerCase();
        const val = parts.slice(3).join(" ");
        if (!["path", "proxyip", "region", "homepage"].includes(key)) { await sendMsg(bt, chatId, `❌ کلید نامعتبر.`); }
        else {
          const { data: w } = await supabase.from("deployments").select("name, config").eq("user_id", cfg.user_id).eq("name", wn).maybeSingle();
          if (!w) { await sendMsg(bt, chatId, `❌ <code>${wn}</code> پیدا نشد.`); }
          else { const c = (w.config as Record<string, unknown>) ?? {}; c[key] = val; await supabase.from("deployments").update({ config: c }).eq("name", wn); await sendMsg(bt, chatId, `✅ <code>${wn}</code> به‌روز شد.\n${key}: <code>${val}</code>`); }
        }
      }

    } else if (text.startsWith("/deploy")) {
      const parts = text.split(" ");
      if (parts.length < 2) { await sendMsg(bt, chatId, "🚀 استفاده: <code>/deploy my-worker</code>"); }
      else if (!await checkIsAdmin(telegramId)) { await sendMsg(bt, chatId, "⛔ فقط ادمین."); }
      else {
        const wn = parts[1].toLowerCase().replace(/[^a-z0-9-]/g, "");
        const { data: token } = await supabase.from("cf_tokens").select("*").eq("user_id", cfg.user_id).eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (!token) { await sendMsg(bt, chatId, "🔑 توکن فعالی نیست."); }
        else {
          await sendMsg(bt, chatId, `🚀 در حال استقرار <code>${wn}</code>...`);
          const du = crypto.randomUUID();
          const { data: dep } = await supabase.from("deployments").insert({ user_id: cfg.user_id, name: wn, worker_code: "[telegram]", config: { source: "telegram" }, status: "deploying", uuid: du, method: "workers" }).select().single();
          try {
            const resp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/cf-deploy`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}` },
              body: JSON.stringify({ deployment_id: dep?.id, worker_name: wn, cf_token: token.token, uuid: du, method: "workers" }),
            });
            const result = await resp.json();
            if (result.success) {
              const fs = await pollDeploymentStatus(dep!.id, 80);
              if (fs.status === "deployed") await sendMsg(bt, chatId, `✅ <b>مستقر شد!</b>\n\n🔗 <code>${fs.worker_url}</code>\n🔐 <code>${fs.panel_url}</code>`);
              else if (fs.status === "failed") await sendMsg(bt, chatId, `❌ ناموفق:\n${fs.error_message ?? "خطا"}`);
              else await sendMsg(bt, chatId, `⏳ <code>${wn}</code> در جریان است.`);
            } else { await supabase.from("deployments").update({ status: "failed", error_message: result.error ?? "unknown" }).eq("id", dep?.id); await sendMsg(bt, chatId, `❌ ${result.error ?? "خطا"}`); }
          } catch (e) { const m = e instanceof Error ? e.message : "خطا"; await supabase.from("deployments").update({ status: "failed", error_message: m }).eq("id", dep?.id); await sendMsg(bt, chatId, `❌ ${m}`); }
        }
      }

    } else {
      await sendMsg(bt, chatId, "متوجه نشدم. /help را بفرست.");
    }

    return ok();
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : "error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
