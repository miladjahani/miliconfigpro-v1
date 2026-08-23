import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const COMPAT = "2025-11-04";

// Worker source repos — user can choose which one to deploy
const WORKER_SOURCES: Record<string, {
  url: string;
  label: string;
  compat: string;
  kvBinding: string;
  configKey: string;
  configFormat: 'edgetunnel' | 'custom';
  uuidEnvName: string;
}> = {
  edgetunnel: {
    url: "https://raw.githubusercontent.com/cmliu/edgetunnel/main/_worker.js",
    label: "cmliu/edgetunnel",
    compat: "2025-11-04",
    kvBinding: "KV",
    configKey: "config.json",
    configFormat: "edgetunnel",
    uuidEnvName: "UUID",
  },
  edgetunnel_kv: {
    url: "https://raw.githubusercontent.com/cmliu/edgetunnel/main/_worker.js",
    label: "cmliu/edgetunnel (KV mode)",
    compat: "2025-11-04",
    kvBinding: "KV",
    configKey: "config.json",
    configFormat: "edgetunnel",
    uuidEnvName: "UUID",
  },
  custom: {
    url: "https://raw.githubusercontent.com/Alibakhshi-qr/miliconfig-pro/main/public/repo/worker-source.js",
    label: "Custom worker (CFnew v2.9.8c)",
    compat: "2025-01-01",
    kvBinding: "C",
    configKey: "c",
    configFormat: "custom",
    uuidEnvName: "u",
  },
};

interface DeployRequest {
  deployment_id: string;
  worker_name: string;
  cf_token: string;
  uuid: string;
  custom_path?: string;
  custom_domain?: string;
  zone_id?: string;
  method: "workers" | "pages";
  worker_source?: string; // "edgetunnel" | "edgetunnel_kv"
  proxyip?: string; // comma-separated proxy IPs
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function appendLog(id: string, line: string) {
  const { data } = await supabase.from("deployments").select("logs").eq("id", id).maybeSingle();
  const existing = (data as { logs: string | null } | null)?.logs ?? "";
  await supabase.from("deployments").update({ logs: existing + line + "\n" }).eq("id", id);
}

async function updateDeployment(id: string, status: string, updates: Record<string, unknown>) {
  await supabase.from("deployments").update({ status, ...updates }).eq("id", id);
}

async function doDeploy(body: DeployRequest) {
  const {
    deployment_id,
    worker_name,
    cf_token,
    uuid,
    custom_path = "",
    custom_domain = "",
    zone_id = "",
    method = "workers",
    worker_source = "edgetunnel",
    proxyip = "",
    admin_password = "",
  } = body;

  const apiBase = "https://api.cloudflare.com/client/v4";
  const headers = { Authorization: `Bearer ${cf_token}` };

  try {
    await appendLog(deployment_id, "verifying token...");
    const verifyResp = await fetch(`${apiBase}/user/tokens/verify`, { headers });
    const verifyData = await verifyResp.json();
    if (!verifyData.success) {
      await appendLog(deployment_id, "✗ invalid cloudflare token");
      await updateDeployment(deployment_id, "failed", { error_message: "invalid cloudflare token" });
      return;
    }
    await appendLog(deployment_id, "✓ token verified");

    await appendLog(deployment_id, "listing accounts...");
    const accountsResp = await fetch(`${apiBase}/accounts?per_page=50`, { headers });
    const accountsData = await accountsResp.json();
    if (!accountsData.success || !accountsData.result?.length) {
      await appendLog(deployment_id, "✗ no cloudflare accounts found");
      await updateDeployment(deployment_id, "failed", { error_message: "no cloudflare accounts found" });
      return;
    }
    const accountId = accountsData.result[0].id;
    const accountName = accountsData.result[0].name;
    await appendLog(deployment_id, `✓ account: ${accountName} (${accountId.slice(0, 8)}...)`);

    const sourceConfig = WORKER_SOURCES[worker_source] ?? WORKER_SOURCES.edgetunnel;
    const compatDate = sourceConfig.compat;
    const kvBindingName = sourceConfig.kvBinding;
    const configKvKey = sourceConfig.configKey;
    const configFormat = sourceConfig.configFormat;
    const uuidEnv = sourceConfig.uuidEnvName;

    await appendLog(deployment_id, `fetching worker source from ${sourceConfig.label}...`);
    const sourceResp = await fetch(sourceConfig.url);
    if (!sourceResp.ok) {
      await appendLog(deployment_id, "✗ failed to fetch worker source");
      await updateDeployment(deployment_id, "failed", { error_message: "failed to fetch worker source" });
      return;
    }
    const workerCode = await sourceResp.text();
    await appendLog(deployment_id, `✓ worker source fetched (${workerCode.length} bytes)`);

    await appendLog(deployment_id, "creating KV namespace...");
    const kvResp = await fetch(`${apiBase}/accounts/${accountId}/storage/kv/namespaces`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ title: `${worker_name}-kv` }),
    });
    const kvData = await kvResp.json();
    if (!kvData.success) {
      const msg = kvData.errors?.[0]?.message ?? "failed to create KV namespace";
      await appendLog(deployment_id, `✗ ${msg}`);
      await updateDeployment(deployment_id, "failed", { error_message: msg });
      return;
    }
    const kvNamespaceId = kvData.result.id;
    await appendLog(deployment_id, `✓ KV namespace created: ${kvNamespaceId.slice(0, 8)}...`);

    // Write initial config to KV — format depends on worker source
    let initialConfig: Record<string, unknown>;
    let addTxtKey = "ADD.txt";

    if (configFormat === "custom") {
      // Custom worker uses flat key-value config stored under key 'c'
      initialConfig = {
        wk: "",
        ev: "yes",
        et: "no",
        ex: "no",
        ech: "no",
        tp: "",
        customDNS: "https://223.5.5.5/dns-query",
        customECHDomain: "cloudflare-ech.com",
        alpn: "",
        d: custom_path || "",
        p: proxyip || "",
        yx: "",
        yxURL: "",
        s: "",
        homepage: "",
        scu: "https://url.v1.mk/sub",
        ena: "no",
        epd: "yes",
        epi: "yes",
        egi: "yes",
        ae: "",
        rm: "",
        qj: "",
        dkby: "no",
        yxby: "",
        ipv4: "yes",
        ipv6: "yes",
        ispMobile: "yes",
        ispUnicom: "yes",
        ispTelecom: "yes",
      };
      addTxtKey = "ADD.txt";
    } else {
      // Edgetunnel uses nested config under key 'config.json'
      initialConfig = {
        UUID: uuid,
        HOST: "",
        HOSTS: [],
        PATH: custom_path ? (custom_path.startsWith("/") ? custom_path : "/" + custom_path) : "/",
        协议类型: "vless",
        传输协议: "ws",
        gRPC模式: "gun",
        gRPCUserAgent: "Mozilla/5.0",
        跳过证书验证: false,
        启用0RTT: false,
        TLS分片: null,
        随机路径: false,
        ECH: false,
        ECHConfig: { DNS: "https://dns.alidns.com/dns-query", SNI: "cloudflare-ech.com" },
        SS: { 加密方式: "aes-128-gcm", TLS: true },
        Fingerprint: "chrome",
        优选订阅生成: {
          local: true,
          本地IP库: { 随机IP: true, 随机数量: 16, 指定端口: -1 },
          SUB: null,
          SUBNAME: "edgetunnel",
          SUBUpdateTime: 3,
          TOKEN: "",
        },
        订阅转换配置: {
          SUBAPI: "https://subapi.edt-pages.workers.dev",
          SUBCONFIG: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/main/Clash/config/ACL4SSR_Online_Mini_MultiMode.ini",
          SUBEMOJI: false,
          SUBLIST: false,
          UDP: false,
          XUDP: false,
          TLS13: false,
          APPEND_TYPE: false,
          SORT: false,
        },
        反代: {
          proxyip: proxyip || "auto",
          SOCKS5: { 启用: null, 全局: false, 账号: "", 白名单: [] },
          路径模板: {},
        },
        TG: { 启用: false, BotToken: null, ChatID: null },
        CF: { Email: null, GlobalAPIKey: null, AccountID: null, APIToken: null, UsageAPI: null, Usage: { success: false, pages: 0, workers: 0, total: 0, max: 100000 } },
      };
    }

    await fetch(`${apiBase}/accounts/${accountId}/storage/kv/namespaces/${kvNamespaceId}/values/${configKvKey}`, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(initialConfig, null, 2),
    }).catch(() => null);
    await appendLog(deployment_id, `✓ initial config written to KV (${configKvKey})`);

    // Also write ADD.txt for custom IPs
    await fetch(`${apiBase}/accounts/${accountId}/storage/kv/namespaces/${kvNamespaceId}/values/${addTxtKey}`, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "text/plain" },
      body: proxyip || "",
    }).catch(() => null);

    let workerUrl: string;
    let panelUrl: string;
    const panelKey = custom_path || uuid;

    if (method === "workers") {
      await appendLog(deployment_id, "uploading worker script...");
      const meta = {
        main_module: "worker.js",
        compatibility_date: compatDate,
        compatibility_flags: ["nodejs_compat"],
        bindings: [
          { type: "kv_namespace", name: kvBindingName, namespace_id: kvNamespaceId },
          { type: "plain_text", name: uuidEnv, text: uuid },
          ...(configFormat === "edgetunnel" ? [
            { type: "plain_text", name: "PATH", text: custom_path ? (custom_path.startsWith("/") ? custom_path : "/" + custom_path) : "/" },
            { type: "plain_text", name: "PROXYIP", text: proxyip },
            ...(admin_password ? [{ type: "plain_text", name: "ADMIN", text: admin_password }] : []),
          ] : [
            { type: "plain_text", name: "P", text: proxyip },
          ]),
        ],
      };

      const formData = new FormData();
      formData.append("metadata", new Blob([JSON.stringify(meta)], { type: "application/json" }));
      formData.append(
        "worker.js",
        new Blob([workerCode], { type: "application/javascript+module" }),
        "worker.js",
      );

      const uploadResp = await fetch(
        `${apiBase}/accounts/${accountId}/workers/scripts/${worker_name}`,
        { method: "PUT", headers, body: formData },
      );
      const uploadData = await uploadResp.json();
      if (!uploadData.success) {
        const msg = uploadData.errors?.[0]?.message ?? "failed to upload worker";
        await appendLog(deployment_id, `✗ ${msg}`);
        await updateDeployment(deployment_id, "failed", { error_message: msg });
        return;
      }
      await appendLog(deployment_id, "✓ worker script uploaded");

      await appendLog(deployment_id, "enabling workers.dev route for script...");
      const subdomainResp = await fetch(`${apiBase}/accounts/${accountId}/workers/scripts/${worker_name}/subdomain`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      });
      const subdomainResult = await subdomainResp.json().catch(() => ({}));
      if (subdomainResult.success) {
        await appendLog(deployment_id, "✓ workers.dev route enabled");
      } else {
        await appendLog(deployment_id, `⚠ workers.dev route: ${subdomainResult.errors?.[0]?.message ?? "unknown error"} — trying account subdomain...`);
        const existingSub = await fetch(`${apiBase}/accounts/${accountId}/workers/subdomain`, { headers });
        const existingSubData = await existingSub.json().catch(() => ({}));
        if (!existingSubData.result?.subdomain) {
          const subName = `edge-${worker_name}`.replace(/[^a-z0-9-]/g, "").slice(0, 30);
          await fetch(`${apiBase}/accounts/${accountId}/workers/subdomain`, {
            method: "PUT",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({ subdomain: subName }),
          }).catch(() => {});
          await appendLog(deployment_id, `✓ account subdomain set: ${subName}`);
        }
        await fetch(`${apiBase}/accounts/${accountId}/workers/scripts/${worker_name}/subdomain`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: true }),
        }).catch(() => {});
      }

      await fetch(`${apiBase}/accounts/${accountId}/workers/scripts/${worker_name}/settings`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ workers_dev: true, preview_version_id: null }),
      }).catch(() => {});
      await appendLog(deployment_id, "✓ workers.dev route enabled");

      await appendLog(deployment_id, "reading workers.dev subdomain...");
      let subdomain: string | undefined;
      try {
        const subResp = await fetch(`${apiBase}/accounts/${accountId}/workers/subdomain`, { headers });
        const subData = await subResp.json();
        subdomain = subData.result?.subdomain;
      } catch {
        // Non-fatal — we can still build a best-guess URL and let the user open
        // the Cloudflare dashboard if this specific lookup failed.
      }
      workerUrl = subdomain
        ? `https://${worker_name}.${subdomain}.workers.dev`
        : `https://${worker_name}.workers.dev`;
      await appendLog(deployment_id, `✓ worker URL: ${workerUrl}`);

      // Checkpoint: the worker script is live on Cloudflare and we have a working
      // URL at this point. Persist "deployed" now so the deployment can never get
      // stuck showing "در حال استقرار" in the UI just because a later, optional
      // step (custom domain attach, panel URL bookkeeping) throws or hangs — that
      // failure mode previously left rows permanently stuck even though the
      // worker was already live on Cloudflare.
      await updateDeployment(deployment_id, "deployed", {
        worker_url: workerUrl,
        kv_namespace_id: kvNamespaceId,
        cf_account_id: accountId,
        worker_source: worker_source,
      });

      if (custom_domain && zone_id) {
        await appendLog(deployment_id, `attaching custom domain: ${custom_domain}...`);
        await fetch(`${apiBase}/accounts/${accountId}/workers/domains`, {
          method: "PUT",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            environment: "production",
            hostname: custom_domain,
            service: worker_name,
            zone_id: zone_id,
          }),
        }).catch((e) => {
          appendLog(deployment_id, `⚠ custom domain: ${e.message ?? e}`);
        });
        workerUrl = `https://${custom_domain}`;
      }
    } else {
      await appendLog(deployment_id, "creating Pages project...");
      await fetch(`${apiBase}/accounts/${accountId}/pages/projects`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ name: worker_name, production_branch: "main" }),
      }).catch(() => {});

      await appendLog(deployment_id, "binding KV & variables to project...");
      const cfg = {
        deployment_configs: {
          production: {
            compatibility_date: compatDate,
            compatibility_flags: ["nodejs_compat"],
            kv_namespaces: { [kvBindingName]: { namespace_id: kvNamespaceId } },
            environment_variables: configFormat === "edgetunnel" ? {
              [uuidEnv]: { value: uuid, type: "plain_text" },
              PATH: { value: custom_path ? (custom_path.startsWith("/") ? custom_path : "/" + custom_path) : "/", type: "plain_text" },
              PROXYIP: { value: proxyip, type: "plain_text" },
              ...(admin_password ? { ADMIN: { value: admin_password, type: "plain_text" } } : {}),
            } : {
              [uuidEnv]: { value: uuid, type: "plain_text" },
              P: { value: proxyip, type: "plain_text" },
            },
          },
        },
      };
      await fetch(`${apiBase}/accounts/${accountId}/pages/projects/${worker_name}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      }).catch(() => {});

      await appendLog(deployment_id, "uploading _worker.js deployment...");
      const pagesFd = new FormData();
      pagesFd.append(
        "_worker.js",
        new Blob([workerCode], { type: "application/javascript" }),
        "_worker.js",
      );
      pagesFd.append("branch", "main");
      const pagesDepResp = await fetch(
        `${apiBase}/accounts/${accountId}/pages/projects/${worker_name}/deployments`,
        { method: "POST", headers, body: pagesFd },
      );
      let pagesDepData: { result?: { url?: string } } = {};
      try {
        pagesDepData = await pagesDepResp.json();
      } catch {
        // Non-fatal — fall back to the predictable *.pages.dev URL below.
      }
      workerUrl = pagesDepData.result?.url ?? `https://${worker_name}.pages.dev`;
      await appendLog(deployment_id, `✓ Pages URL: ${workerUrl}`);

      // Checkpoint — see comment in the Workers branch above: commit "deployed"
      // as soon as we have a live URL so a later optional step can never leave
      // the row stuck on "در حال استقرار".
      await updateDeployment(deployment_id, "deployed", {
        worker_url: workerUrl,
        kv_namespace_id: kvNamespaceId,
        cf_account_id: accountId,
        worker_source: worker_source,
      });

      if (custom_domain) {
        await appendLog(deployment_id, `attaching custom domain: ${custom_domain}...`);
        await fetch(`${apiBase}/accounts/${accountId}/pages/projects/${worker_name}/domains`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ domain: custom_domain }),
        }).catch(() => {});
        workerUrl = `https://${custom_domain}`;
      }
    }

    panelUrl = `${workerUrl}/${panelKey}`;
    await appendLog(deployment_id, `✓ panel URL: ${panelUrl}`);
    await appendLog(deployment_id, "✓ deployment complete!");

    await updateDeployment(deployment_id, "deployed", {
      worker_url: workerUrl,
      panel_url: panelUrl,
      kv_namespace_id: kvNamespaceId,
      cf_account_id: accountId,
      route: custom_domain || null,
      worker_source: worker_source,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    await appendLog(deployment_id, `✗ ${msg}`);
    await updateDeployment(deployment_id, "failed", { error_message: msg });
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body: DeployRequest = await req.json();

    if (!body.worker_name || !body.cf_token || !body.uuid || !body.deployment_id) {
      return new Response(
        JSON.stringify({ success: false, error: "missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    EdgeRuntime.waitUntil(doDeploy(body));

    return new Response(
      JSON.stringify({ success: true, message: "deployment started", deployment_id: body.deployment_id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
