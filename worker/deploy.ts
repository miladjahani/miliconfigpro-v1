import type { Env } from './env'
import { nowIso, genId } from './util'
import { getAccountId, createKvNamespace, uploadWorker, enableWorkersDev } from './cfapi'

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

const EDGE_TUNNEL_URLS: Record<string, string> = {
  edgetunnel: 'https://raw.githubusercontent.com/cmliu/edgetunnel/main/_worker.js',
  edgetunnel_kv: 'https://raw.githubusercontent.com/cmliu/edgetunnel/main/_worker.js',
}

async function appendLogs(env: Env, deploymentId: string, lines: string[]): Promise<void> {
  if (!lines.length) return
  const row = await env.DB.prepare('SELECT logs FROM deployments WHERE id = ?').bind(deploymentId).first<{ logs: string | null }>()
  const merged = [...(row?.logs ? row.logs.split('\n').filter(Boolean) : []), ...lines].join('\n')
  await env.DB.prepare('UPDATE deployments SET logs = ?, updated_at = ? WHERE id = ?')
    .bind(merged, nowIso(), deploymentId)
    .run()
}

async function failDeployment(env: Env, job: DeployJob, message: string): Promise<void> {
  await appendLogs(env, job.deployment_id, [`✗ ${message}`])
  await env.DB.prepare("UPDATE deployments SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ?")
    .bind(message, nowIso(), job.deployment_id)
    .run()
}

async function fetchWorkerCode(job: DeployJob): Promise<{ code?: string; error?: string }> {
  const url =
    job.worker_source === 'custom' ? `${job.origin}/repo/worker-source.js` : EDGE_TUNNEL_URLS[job.worker_source]
  if (!url) return { error: `منبع ورکر نامشخص: ${job.worker_source}` }
  try {
    const resp = await fetch(url)
    if (!resp.ok) return { error: `دانلود سورس ورکر ناموفق بود (HTTP ${resp.status})` }
    const code = await resp.text()
    if (!code || code.length < 200) return { error: 'سورس دانلودشده نامعتبر است' }
    return { code }
  } catch {
    return { error: 'خطای شبکه در دانلود سورس ورکر' }
  }
}

export async function runDeployment(env: Env, job: DeployJob): Promise<void> {
  const logs: string[] = []
  try {
    // 1. Resolve Cloudflare account
    const acc = await getAccountId(job.cf_token)
    if (!acc.accountId) {
      await failDeployment(env, job, acc.error ?? 'اکانت کلودفلر پیدا نشد')
      return
    }
    const accountId = acc.accountId
    logs.push(`✓ اکانت تایید شد (${accountId.slice(0, 8)}…)`)
    await appendLogs(env, job.deployment_id, logs)
    logs.length = 0

    // 2. Download worker source
    const src = await fetchWorkerCode(job)
    if (!src.code) {
      await failDeployment(env, job, src.error ?? 'سورس ورکر دریافت نشد')
      return
    }

    // 3. Provision KV namespace
    const nsTitle = `${job.worker_name}-kv`
    const ns = await createKvNamespace(job.cf_token, accountId, nsTitle)
    logs.push(...ns.logs)
    if (!ns.id) {
      await failDeployment(env, job, ns.error ?? 'ساخت KV ناموفق بود')
      return
    }

    // 4. Upload script with bindings
    const isCustom = job.worker_source === 'custom'
    const vars: Record<string, string> = isCustom
      ? {
          u: job.uuid.toLowerCase(),
          ...(job.custom_path ? { d: job.custom_path } : {}),
          ...(job.proxyip ? { p: job.proxyip } : {}),
        }
      : {
          UUID: job.uuid,
          PROXYIP: job.proxyip ?? '',
          ...(job.admin_password ? { ADMINPASS: job.admin_password } : {}),
        }
    const upload = await uploadWorker({
      token: job.cf_token,
      accountId,
      name: job.worker_name,
      code: src.code,
      kvNamespaceId: ns.id,
      vars,
    })
    logs.push(...upload.logs)
    if (!upload.ok) {
      await failDeployment(env, job, upload.message ?? 'آپلود ورکر ناموفق بود')
      return
    }

    // 5. Enable workers.dev subdomain
    const enabled = await enableWorkersDev(job.cf_token, accountId, job.worker_name)
    if (!enabled) logs.push('⚠ فعال‌سازی workers.dev ممکن است نیاز به بررسی دستی داشته باشد')

    // 6. Persist final state
    const subdomainResp = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`,
      { headers: { Authorization: `Bearer ${job.cf_token}` } },
    )
    let host = `${job.worker_name}.workers.dev`
    try {
      const sd = (await subdomainResp.json()) as { result?: { subdomain?: string } }
      if (sd.result?.subdomain) host = `${job.worker_name}.${sd.result.subdomain}`
    } catch {
      /* keep default */
    }

    const workerUrl = `https://${host}`
    const panelPath = job.custom_path || job.uuid
    const panelUrl = `${workerUrl}/${panelPath}`
    const finalStatus = 'deployed'

    logs.push(`✓ ورکر مستقر شد: ${workerUrl}`)
    await env.DB.prepare(
      `UPDATE deployments SET status = ?, worker_url = ?, panel_url = ?, kv_namespace_id = ?, cf_account_id = ?,
       config = ?, updated_at = ? WHERE id = ?`,
    )
      .bind(
        finalStatus,
        workerUrl,
        panelUrl,
        ns.id,
        accountId,
        JSON.stringify({
          method: job.method,
          custom_path: job.custom_path ?? null,
          worker_source: job.worker_source,
          proxyip: job.proxyip ?? null,
        }),
        nowIso(),
        job.deployment_id,
      )
      .run()

    if (job.cf_token_row_id) {
      await env.DB.prepare('UPDATE cf_tokens SET last_used_at = ? WHERE id = ?').bind(nowIso(), job.cf_token_row_id).run()
    }
    const depRow = await env.DB.prepare('SELECT user_id, name FROM deployments WHERE id = ?')
      .bind(job.deployment_id)
      .first<{ user_id: string; name: string }>()
    if (depRow) {
      await env.DB.prepare(
        'INSERT INTO activity_logs (id, user_id, action, entity_type, entity_name, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
        .bind(genId(), depRow.user_id, 'deployment_deployed', 'deployment', depRow.name, nowIso())
        .run()
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'خطای نامشخص در استقرار'
    await failDeployment(env, job, msg)
  }
}
