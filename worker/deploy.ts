import type { Env } from './env'
import { nowIso, genId } from './util'

// ── Ported 1:1 from the original cf-deploy function (Supabase → D1) ────────
// The deploy steps, source URLs, bindings and fallbacks are identical to the
// version the project originally shipped with.

const API_BASE = 'https://api.cloudflare.com/client/v4'

interface WorkerSourceConfig {
  url: string
  label: string
  compat: string
  kvBinding: string
  configKey: string
  configFormat: 'edgetunnel' | 'custom'
  uuidEnvName: string
  fallbackUrls?: string[]
}

const WORKER_SOURCES: Record<string, WorkerSourceConfig> = {
  edgetunnel: {
    url: 'https://raw.githubusercontent.com/cmliu/edgetunnel/main/_worker.js',
    label: 'cmliu/edgetunnel',
    compat: '2025-11-04',
    kvBinding: 'KV',
    configKey: 'config.json',
    configFormat: 'edgetunnel',
    uuidEnvName: 'UUID',
  },
  edgetunnel_kv: {
    url: 'https://raw.githubusercontent.com/cmliu/edgetunnel/main/_worker.js',
    label: 'cmliu/edgetunnel (KV mode)',
    compat: '2025-11-04',
    kvBinding: 'KV',
    configKey: 'config.json',
    configFormat: 'edgetunnel',
    uuidEnvName: 'UUID',
  },
  custom: {
    url: 'https://raw.githubusercontent.com/Alibakhshi-qr/miliconfig-pro/main/public/repo/worker-source.js',
    label: 'Custom worker (CFnew v2.9.8c)',
    compat: '2025-01-01',
    kvBinding: 'C',
    configKey: 'c',
    configFormat: 'custom',
    uuidEnvName: 'u',
    fallbackUrls: [
      'https://raw.githubusercontent.com/miladjahani/miliconfigpro-v1/main/public/repo/worker-source.js',
    ],
  },
}

export interface DeployJob {
  deployment_id: string
  worker_name: string
  cf_token: string
  cf_token_row_id?: string | null
  uuid: string
  method: 'workers' | 'pages'
  worker_source: string
  proxyip?: string
  admin_password?: string
  custom_path?: string
  origin: string
}

async function appendLog(env: Env, id: string, line: string): Promise<void> {
  const row = await env.DB.prepare('SELECT logs FROM deployments WHERE id = ?').bind(id).first<{ logs: string | null }>()
  const existing = row?.logs ?? ''
  await env.DB.prepare('UPDATE deployments SET logs = ? WHERE id = ?').bind(existing + line + '\n', id).run()
}

async function updateDeployment(env: Env, id: string, status: string, updates: Record<string, unknown>): Promise<void> {
  const sets = ['status = ?', 'updated_at = ?']
  const binds: unknown[] = [status, nowIso()]
  for (const [k, v] of Object.entries(updates)) {
    sets.push(`${k} = ?`)
    binds.push(typeof v === 'object' && v !== null ? JSON.stringify(v) : v)
  }
  binds.push(id)
  await env.DB.prepare(`UPDATE deployments SET ${sets.join(', ')} WHERE id = ?`).bind(...(binds as string[])).run()
}

export async function runDeployment(env: Env, job: DeployJob): Promise<void> {
  const { deployment_id } = job
  const worker_name = job.worker_name
  const cf_token = job.cf_token
  const uuid = job.uuid
  const custom_path = job.custom_path ?? ''
  const method = job.method
  const worker_source = job.worker_source || 'edgetunnel'
  const proxyip = job.proxyip ?? ''
  const admin_password = job.admin_password ?? ''
  const headers = { Authorization: `Bearer ${cf_token}` }

  try {
    const sourceConfig = WORKER_SOURCES[worker_source] ?? WORKER_SOURCES.edgetunnel
    const compatDate = sourceConfig.compat
    const kvBindingName = sourceConfig.kvBinding
    const configKvKey = sourceConfig.configKey
    const configFormat = sourceConfig.configFormat
    const uuidEnv = sourceConfig.uuidEnvName

    // ── Verify token ────────────────────────────────────────────────────
    await appendLog(env, deployment_id, 'verifying token...')
    const verifyResp = await fetch(`${API_BASE}/user/tokens/verify`, { headers })
    const verifyData = (await verifyResp.json()) as { success?: boolean }
    if (!verifyData.success) {
      await appendLog(env, deployment_id, '✗ invalid cloudflare token')
      await updateDeployment(env, deployment_id, 'failed', { error_message: 'invalid cloudflare token' })
      return
    }
    await appendLog(env, deployment_id, '✓ token verified')

    // ── Resolve account ─────────────────────────────────────────────────
    await appendLog(env, deployment_id, 'listing accounts...')
    const accountsResp = await fetch(`${API_BASE}/accounts?per_page=50`, { headers })
    const accountsData = (await accountsResp.json()) as { success?: boolean; result?: Array<{ id: string; name: string }> }
    if (!accountsData.success || !accountsData.result?.length) {
      await appendLog(env, deployment_id, '✗ no cloudflare accounts found')
      await updateDeployment(env, deployment_id, 'failed', { error_message: 'no cloudflare accounts found' })
      return
    }
    const accountId = accountsData.result[0].id
    const accountName = accountsData.result[0].name
    await appendLog(env, deployment_id, `✓ account: ${accountName} (${accountId.slice(0, 8)}...)`)

    // ── Fetch worker source ─────────────────────────────────────────────
    await appendLog(env, deployment_id, `fetching worker source from ${sourceConfig.label}...`)
    let workerCode = ''
    // Primary URL first; if unavailable (e.g. repo moved/renamed), fall back to
    // the copy bundled with this panel so the default source can never 404.
    const fallbackUrls = [
      ...(sourceConfig.fallbackUrls ?? []),
      `${job.origin}/repo/worker-source.js`,
    ]
    for (const [i, url] of [sourceConfig.url, ...fallbackUrls].entries()) {
      try {
        const resp = await fetch(url)
        if (resp.ok && Number(resp.headers.get('content-length') ?? '1') !== 0) {
          const text = await resp.text()
          if (text.trim().length > 0) {
            workerCode = text
            if (i > 0) await appendLog(env, deployment_id, `primary source unavailable, used fallback (${new URL(url).host})`)
            break
          }
        }
      } catch {
        // try next candidate
      }
    }
    if (!workerCode) {
      await appendLog(env, deployment_id, '✗ failed to fetch worker source')
      await updateDeployment(env, deployment_id, 'failed', { error_message: 'failed to fetch worker source' })
      return
    }
    await appendLog(env, deployment_id, `✓ worker source fetched (${workerCode.length} bytes)`)

    // ── Create KV namespace ─────────────────────────────────────────────
    await appendLog(env, deployment_id, 'creating KV namespace...')
    const kvResp = await fetch(`${API_BASE}/accounts/${accountId}/storage/kv/namespaces`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: `${worker_name}-kv` }),
    })
    const kvData = (await kvResp.json()) as { success?: boolean; result?: { id: string }; errors?: Array<{ message: string }> }
    if (!kvData.success) {
      const msg = kvData.errors?.[0]?.message ?? 'failed to create KV namespace'
      await appendLog(env, deployment_id, `✗ ${msg}`)
      await updateDeployment(env, deployment_id, 'failed', { error_message: msg })
      return
    }
    const kvNamespaceId = kvData.result!.id
    await appendLog(env, deployment_id, `✓ KV namespace created: ${kvNamespaceId.slice(0, 8)}...`)

    // ── Write initial config to KV (format depends on worker source) ────
    let initialConfig: Record<string, unknown>
    const addTxtKey = 'ADD.txt'

    // Panel path for edgetunnel: the custom path if set, otherwise always
    // /admin so the panel address is predictable and ends with /admin.
    const panelPath = custom_path
      ? (custom_path.startsWith('/') ? custom_path : '/' + custom_path)
      : '/admin'

    if (configFormat === 'custom') {
      initialConfig = {
        wk: '', ev: 'yes', et: 'no', ex: 'no', ech: 'no', tp: '',
        customDNS: 'https://223.5.5.5/dns-query',
        customECHDomain: 'cloudflare-ech.com',
        alpn: '', d: custom_path || '', p: proxyip || '', yx: '', yxURL: '', s: '', homepage: '',
        scu: 'https://url.v1.mk/sub', ena: 'no', epd: 'yes', epi: 'yes', egi: 'yes',
        ae: '', rm: '', qj: '', dkby: 'no', yxby: '',
        ipv4: 'yes', ipv6: 'yes', ispMobile: 'yes', ispUnicom: 'yes', ispTelecom: 'yes',
      }
    } else {
      initialConfig = {
        UUID: uuid,
        HOST: '',
        HOSTS: [],
        PATH: panelPath,
        协议类型: 'vless',
        传输协议: 'ws',
        gRPC模式: 'gun',
        gRPCUserAgent: 'Mozilla/5.0',
        跳过证书验证: false,
        启用0RTT: false,
        TLS分片: null,
        随机路径: false,
        ECH: false,
        ECHConfig: { DNS: 'https://dns.alidns.com/dns-query', SNI: 'cloudflare-ech.com' },
        SS: { 加密方式: 'aes-128-gcm', TLS: true },
        Fingerprint: 'chrome',
        优选订阅生成: {
          local: true,
          本地IP库: { 随机IP: true, 随机数量: 16, 指定端口: -1 },
          SUB: null,
          SUBNAME: 'edgetunnel',
          SUBUpdateTime: 3,
          TOKEN: '',
        },
        订阅转换配置: {
          SUBAPI: 'https://subapi.edt-pages.workers.dev',
          SUBCONFIG: 'https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/main/Clash/config/ACL4SSR_Online_Mini_MultiMode.ini',
          SUBEMOJI: false, SUBLIST: false, UDP: false, XUDP: false, TLS13: false, APPEND_TYPE: false, SORT: false,
        },
        反代: {
          proxyip: proxyip || 'auto',
          SOCKS5: { 启用: null, 全局: false, 账号: '', 白名单: [] },
          路径模板: {},
        },
        TG: { 启用: false, BotToken: null, ChatID: null },
        CF: { Email: null, GlobalAPIKey: null, AccountID: null, APIToken: null, UsageAPI: null, Usage: { success: false, pages: 0, workers: 0, total: 0, max: 100000 } },
      }
    }

    await fetch(`${API_BASE}/accounts/${accountId}/storage/kv/namespaces/${kvNamespaceId}/values/${configKvKey}`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(initialConfig, null, 2),
    }).catch(() => null)
    await appendLog(env, deployment_id, `✓ initial config written to KV (${configKvKey})`)

    await fetch(`${API_BASE}/accounts/${accountId}/storage/kv/namespaces/${kvNamespaceId}/values/${addTxtKey}`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'text/plain' },
      body: proxyip || '',
    }).catch(() => null)

    let workerUrl: string
    // edgetunnel: panel lives at the panel path (login page asking for the
    // password) — custom path or /admin by default.
    // Default (custom) worker: UUID is always part of the URL and bypasses
    // the login page entirely.
    const panelKey = configFormat === 'edgetunnel' ? panelPath.slice(1) : uuid

    if (method === 'workers') {
      // ── Upload worker script ──────────────────────────────────────────
      await appendLog(env, deployment_id, 'uploading worker script...')
      const meta = {
        main_module: 'worker.js',
        compatibility_date: compatDate,
        compatibility_flags: ['nodejs_compat'],
        bindings: [
          { type: 'kv_namespace', name: kvBindingName, namespace_id: kvNamespaceId },
          { type: 'plain_text', name: uuidEnv, text: uuid },
          ...(configFormat === 'edgetunnel' ? [
            { type: 'plain_text', name: 'PATH', text: panelPath },
            { type: 'plain_text', name: 'PROXYIP', text: proxyip },
            ...(admin_password ? [{ type: 'plain_text', name: 'ADMIN', text: admin_password }] : []),
          ] : [
            { type: 'plain_text', name: 'P', text: proxyip },
          ]),
        ],
      }

      const formData = new FormData()
      formData.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }))
      formData.append('worker.js', new Blob([workerCode], { type: 'application/javascript+module' }), 'worker.js')

      const uploadResp = await fetch(`${API_BASE}/accounts/${accountId}/workers/scripts/${worker_name}`, {
        method: 'PUT', headers, body: formData,
      })
      const uploadData = (await uploadResp.json()) as { success?: boolean; errors?: Array<{ message: string }> }
      if (!uploadData.success) {
        const msg = uploadData.errors?.[0]?.message ?? 'failed to upload worker'
        await appendLog(env, deployment_id, `✗ ${msg}`)
        await updateDeployment(env, deployment_id, 'failed', { error_message: msg })
        return
      }
      await appendLog(env, deployment_id, '✓ worker script uploaded')

      // ── Enable workers.dev route (with the original fallbacks) ────────
      await appendLog(env, deployment_id, 'enabling workers.dev route for script...')
      const subdomainResp = await fetch(`${API_BASE}/accounts/${accountId}/workers/scripts/${worker_name}/subdomain`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      })
      const subdomainResult = (await subdomainResp.json().catch(() => ({}))) as { success?: boolean; errors?: Array<{ message: string }> }
      if (subdomainResult.success) {
        await appendLog(env, deployment_id, '✓ workers.dev route enabled')
      } else {
        await appendLog(env, deployment_id, `⚠ workers.dev route: ${subdomainResult.errors?.[0]?.message ?? 'unknown error'} — trying account subdomain...`)
        const existingSub = await fetch(`${API_BASE}/accounts/${accountId}/workers/subdomain`, { headers })
        const existingSubData = (await existingSub.json().catch(() => ({}))) as { result?: { subdomain?: string } }
        if (!existingSubData.result?.subdomain) {
          const subName = `edge-${worker_name}`.replace(/[^a-z0-9-]/g, '').slice(0, 30)
          await fetch(`${API_BASE}/accounts/${accountId}/workers/subdomain`, {
            method: 'PUT',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ subdomain: subName }),
          }).catch(() => null)
          await appendLog(env, deployment_id, `✓ account subdomain set: ${subName}`)
        }
        await fetch(`${API_BASE}/accounts/${accountId}/workers/scripts/${worker_name}/subdomain`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: true }),
        }).catch(() => null)
      }

      await fetch(`${API_BASE}/accounts/${accountId}/workers/scripts/${worker_name}/settings`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ workers_dev: true, preview_version_id: null }),
      }).catch(() => null)
      await appendLog(env, deployment_id, '✓ workers.dev route enabled')

      // ── Read workers.dev subdomain & build final URL ──────────────────
      await appendLog(env, deployment_id, 'reading workers.dev subdomain...')
      let subdomain: string | undefined
      try {
        const subResp = await fetch(`${API_BASE}/accounts/${accountId}/workers/subdomain`, { headers })
        const subData = (await subResp.json()) as { result?: { subdomain?: string } }
        subdomain = subData.result?.subdomain
      } catch {
        // Non-fatal — best-guess URL below.
      }
      workerUrl = subdomain
        ? `https://${worker_name}.${subdomain}.workers.dev`
        : `https://${worker_name}.workers.dev`
      await appendLog(env, deployment_id, `✓ worker URL: ${workerUrl}`)

      // Checkpoint: persist deployed NOW so the UI can never get stuck on
      // "در حال استقرار" because of a later optional step.
      await updateDeployment(env, deployment_id, 'deployed', {
        worker_url: workerUrl,
        kv_namespace_id: kvNamespaceId,
        cf_account_id: accountId,
        worker_source: worker_source,
      })
    } else {
      // ── Pages deployment (original flow) ──────────────────────────────
      await appendLog(env, deployment_id, 'creating Pages project...')
      await fetch(`${API_BASE}/accounts/${accountId}/pages/projects`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: worker_name, production_branch: 'main' }),
      }).catch(() => null)

      await appendLog(env, deployment_id, 'binding KV & variables to project...')
      const cfg = {
        deployment_configs: {
          production: {
            compatibility_date: compatDate,
            compatibility_flags: ['nodejs_compat'],
            kv_namespaces: { [kvBindingName]: { namespace_id: kvNamespaceId } },
            environment_variables: configFormat === 'edgetunnel' ? {
              [uuidEnv]: { value: uuid, type: 'plain_text' },
              PATH: { value: panelPath, type: 'plain_text' },
              PROXYIP: { value: proxyip, type: 'plain_text' },
              ...(admin_password ? { ADMIN: { value: admin_password, type: 'plain_text' } } : {}),
            } : {
              [uuidEnv]: { value: uuid, type: 'plain_text' },
              P: { value: proxyip, type: 'plain_text' },
            },
          },
        },
      }
      await fetch(`${API_BASE}/accounts/${accountId}/pages/projects/${worker_name}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      }).catch(() => null)

      await appendLog(env, deployment_id, 'uploading _worker.js deployment...')
      const pagesFd = new FormData()
      pagesFd.append('_worker.js', new Blob([workerCode], { type: 'application/javascript' }), '_worker.js')
      pagesFd.append('branch', 'main')
      const pagesDepResp = await fetch(
        `${API_BASE}/accounts/${accountId}/pages/projects/${worker_name}/deployments`,
        { method: 'POST', headers, body: pagesFd },
      )
      let pagesDepData: { result?: { url?: string } } = {}
      try {
        pagesDepData = (await pagesDepResp.json()) as { result?: { url?: string } }
      } catch {
        // Non-fatal — predictable *.pages.dev URL below.
      }
      workerUrl = pagesDepData.result?.url ?? `https://${worker_name}.pages.dev`
      await appendLog(env, deployment_id, `✓ Pages URL: ${workerUrl}`)

      await updateDeployment(env, deployment_id, 'deployed', {
        worker_url: workerUrl,
        kv_namespace_id: kvNamespaceId,
        cf_account_id: accountId,
        worker_source: worker_source,
      })
    }

    const panelUrl = `${workerUrl}/${panelKey}`
    await appendLog(env, deployment_id, `✓ panel URL: ${panelUrl}`)
    await appendLog(env, deployment_id, '✓ deployment complete!')

    await updateDeployment(env, deployment_id, 'deployed', {
      worker_url: workerUrl,
      panel_url: panelUrl,
      kv_namespace_id: kvNamespaceId,
      cf_account_id: accountId,
      route: null,
      worker_source: worker_source,
    })

    // Bookkeeping: token usage + activity log
    if (job.cf_token_row_id) {
      await env.DB.prepare('UPDATE cf_tokens SET last_used_at = ? WHERE id = ?').bind(nowIso(), job.cf_token_row_id).run()
    }
    const depRow = await env.DB.prepare('SELECT user_id, name FROM deployments WHERE id = ?')
      .bind(deployment_id)
      .first<{ user_id: string; name: string }>()
    if (depRow) {
      await env.DB.prepare(
        'INSERT INTO activity_logs (id, user_id, action, entity_type, entity_name, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
        .bind(genId(), depRow.user_id, 'deployment_deployed', 'deployment', depRow.name, nowIso())
        .run()
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error'
    await appendLog(env, deployment_id, `✗ ${msg}`)
    await updateDeployment(env, deployment_id, 'failed', { error_message: msg })
  }
}
