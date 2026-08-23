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

const API = "https://api.cloudflare.com/client/v4";

// KV key mapping per worker source
const KV_KEYS: Record<string, { config: string; addTxt: string }> = {
  edgetunnel: { config: "config.json", addTxt: "ADD.txt" },
  edgetunnel_kv: { config: "config.json", addTxt: "ADD.txt" },
  custom: { config: "c", addTxt: "ADD.txt" },
};

function getKvKeys(workerSource: string | null) {
  return KV_KEYS[workerSource ?? "edgetunnel"] ?? KV_KEYS.edgetunnel;
}

function jsonResp(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function kvGet(accountId: string, nsId: string, key: string, token: string): Promise<{ ok: boolean; text: string; status: number }> {
  const r = await fetch(`${API}/accounts/${accountId}/storage/kv/namespaces/${nsId}/values/${key}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await r.text();
  return { ok: r.ok, text, status: r.status };
}

async function kvPut(accountId: string, nsId: string, key: string, value: string, token: string, contentType = "application/json") {
  const r = await fetch(`${API}/accounts/${accountId}/storage/kv/namespaces/${nsId}/values/${key}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
    body: value,
  });
  return { ok: r.ok, status: r.status, text: await r.text() };
}

// Strip admin secrets from edgetunnel config before returning to frontend
function sanitizeConfig(config: Record<string, unknown>): Record<string, unknown> {
  const safe = { ...config };
  if (safe.CF && typeof safe.CF === "object") {
    safe.CF = { ...(safe.CF as Record<string, unknown>), Email: null, GlobalAPIKey: null, AccountID: null, APIToken: null, UsageAPI: null };
  }
  if (safe.TG && typeof safe.TG === "object") {
    const tg = safe.TG as Record<string, unknown>;
    safe.TG = { 启用: tg.启用 ?? false, BotToken: tg.BotToken ? "****" : null, ChatID: tg.ChatID ?? null };
  }
  delete safe.ADMIN;
  delete safe.admin;
  delete safe.PASSWORD;
  delete safe.password;
  delete safe.pswd;
  delete safe.TOKEN;
  delete safe.KEY;
  return safe;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const body = await req.json();
    const { deployment_id, action, config, addTxt } = body as {
      deployment_id: string;
      action: "get" | "set" | "toggle" | "set_addtxt";
      config?: Record<string, unknown>;
      addTxt?: string;
    };

    if (!deployment_id) return jsonResp({ success: false, error: "missing deployment_id" }, 400);

    const { data: dep } = await supabase.from("deployments").select("*").eq("id", deployment_id).maybeSingle();
    if (!dep) return jsonResp({ success: false, error: "deployment not found" }, 404);

    const accountId: string = dep.cf_account_id ?? "";
    const kvNs: string = dep.kv_namespace_id ?? "";
    const workerSource: string = (dep.config as Record<string, unknown>)?.worker_source as string ?? "edgetunnel";
    const keys = getKvKeys(workerSource);

    if (!accountId || !kvNs) {
      return jsonResp({ success: false, error: "این ورکر account_id یا kv_namespace_id ندارد. ابتدا از طریق پنل استقرار مجدد انجام دهید." }, 400);
    }

    const { data: tokenRow } = await supabase
      .from("cf_tokens")
      .select("token, name")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!tokenRow?.token) {
      return jsonResp({ success: false, error: "هیچ توکن فعال Cloudflare وجود ندارد. ابتدا یک توکن با دسترسی Workers KV Storage:Edit اضافه کنید." }, 400);
    }

    const cfToken: string = tokenRow.token;

    // ── GET ────────────────────────────────────────────────────────────────
    if (action === "get") {
      const r = await kvGet(accountId, kvNs, keys.config, cfToken);
      if (r.status === 404) return jsonResp({ success: true, config: {} });
      if (!r.ok) {
        const hint = r.status === 401
          ? " — توکن شما دسترسی Workers KV Storage:Read ندارد"
          : r.status === 403
          ? " — دسترسی رد شد، namespace ID را بررسی کنید"
          : "";
        return jsonResp({ success: false, error: `KV read failed ${r.status}${hint}: ${r.text}` }, 502);
      }
      let parsed: Record<string, unknown> = {};
      try { parsed = JSON.parse(r.text); } catch {}
      const addResp = await kvGet(accountId, kvNs, keys.addTxt, cfToken);
      const addTxtVal = addResp.ok ? addResp.text : "";
      return jsonResp({ success: true, config: sanitizeConfig(parsed), addTxt: addTxtVal });
    }

    // ── SET ────────────────────────────────────────────────────────────────
    if (action === "set") {
      if (!config) return jsonResp({ success: false, error: "missing config" }, 400);

      const safeConfig = { ...config };
      if (safeConfig.CF) {
        safeConfig.CF = { ...(safeConfig.CF as Record<string, unknown>), Email: null, GlobalAPIKey: null, AccountID: null, APIToken: null, UsageAPI: null };
      }
      if (safeConfig.TG) {
        const tg = safeConfig.TG as Record<string, unknown>;
        if (tg.BotToken === "****" || tg.BotToken === null) {
          const existing = await kvGet(accountId, kvNs, keys.config, cfToken);
          if (existing.ok) {
            try {
              const oldConfig = JSON.parse(existing.text);
              tg.BotToken = oldConfig?.TG?.BotToken ?? null;
            } catch {}
          }
        }
      }
      delete safeConfig.ADMIN;
      delete safeConfig.admin;
      delete safeConfig.PASSWORD;
      delete safeConfig.password;
      delete safeConfig.pswd;
      delete safeConfig.TOKEN;
      delete safeConfig.KEY;

      const wr = await kvPut(accountId, kvNs, keys.config, JSON.stringify(safeConfig, null, 2), cfToken);
      if (!wr.ok) {
        const hint = wr.status === 401
          ? " — توکن شما نیاز به دسترسی Workers KV Storage:Edit دارد"
          : wr.status === 403
          ? " — دسترسی رد شد"
          : "";
        return jsonResp({ success: false, error: `KV write failed ${wr.status}${hint}: ${wr.text}` }, 502);
      }

      await supabase.from("deployments").update({ config: sanitizeConfig(safeConfig) }).eq("id", deployment_id);
      return jsonResp({ success: true, message: "تنظیمات در KV ورکر ذخیره شد" });
    }

    // ── SET ADD.txt ─────────────────────────────────────────────────────────
    if (action === "set_addtxt") {
      const wr = await kvPut(accountId, kvNs, keys.addTxt, addTxt ?? "", cfToken, "text/plain");
      if (!wr.ok) {
        return jsonResp({ success: false, error: `KV write failed ${wr.status}: ${wr.text}` }, 502);
      }
      return jsonResp({ success: true, message: "لیست IPهای سفارشی ذخیره شد" });
    }

    // ── TOGGLE ─────────────────────────────────────────────────────────────
    if (action === "toggle") {
      const r = await kvGet(accountId, kvNs, keys.config, cfToken);
      let current: Record<string, unknown> = {};
      if (r.ok) { try { current = JSON.parse(r.text); } catch {} }

      const wasDisabled = current.disabled === true;
      const newDisabled = !wasDisabled;
      const next = { ...current, disabled: newDisabled };

      const wr = await kvPut(accountId, kvNs, keys.config, JSON.stringify(next, null, 2), cfToken);
      if (!wr.ok) {
        return jsonResp({ success: false, error: `KV write failed ${wr.status}: ${wr.text}` }, 502);
      }

      await fetch(`${API}/accounts/${accountId}/workers/scripts/${dep.name}/subdomain`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !newDisabled }),
      }).catch(() => null);

      await supabase.from("deployments").update({ config: sanitizeConfig(next) }).eq("id", deployment_id);
      return jsonResp({ success: true, disabled: newDisabled });
    }

    return jsonResp({ success: false, error: "unknown action" }, 400);
  } catch (err) {
    return jsonResp({ success: false, error: err instanceof Error ? err.message : "unknown error" }, 500);
  }
});
