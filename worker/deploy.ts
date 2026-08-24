import type { Env } from './env'
import { nowIso, genId } from './util'
import { cfApi, getAccountId, createKvNamespace, uploadWorker } from './cfapi'

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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
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
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const resp = await fetch(url)
      if (!resp.ok && attempt === 2) return { error: `دانلود سورس ورکر ناموفق بود (HTTP ${resp.status})` }
      if (!resp.ok) { await sleep(1000); continue }
      const code = await resp.text()
      if (code && code.length > 200) return { code }
      if (attempt === 2) return { error: 'سورس دانلودشده نامعتبر است' }
      await sleep(1000)
    } catch {
      if (attempt === 2) return { error: 'خطای شبکه در دانلود سورس ورکر' }
      await sleep(1000)
    }
  }
  return { error: 'دانلود سورس ورکر ناموفق بود' }
}

/**
 * Resolve the account's workers.dev subdomain and make sure this worker is
 * enabled on it. Returns the final public host or null when unavailable.
 */
async function resolveWorkersDevHost(
  token: string,
  accountId: string,
  workerName: string,
  logs: string[],
): Promise<string | null> {
  // 1. Account-level subdomain (e.g. "my-account.workers.dev")
  const sd = await cfApi(token, `/accounts/${accountId}/workers/subdomain`)
  const accountSubdomain =
    ((sd.data?.result as { subdomain?: string } | undefined)?.subdomain ?? '').replace(/\.workers\.dev$/, '')
  if (!sd.ok || !accountSubdomain) {
    logs.push('⚠ زیردامنه workers.dev اکانت خوانده نشد — ممکن است workers.dev برای اکانت غیرفعال باشد')
    return null
  }

  // 2. Enable this specific worker on workers.dev
  const enable = await cfApi(token, `/accounts/${accountId}/workers/scripts/${workerName}/subdomain`, {
    method: 'POST',
    body: { enabled: true },
  })
  if (!enable.ok) {
    logs.push(`⚠ فعال‌سازی workers.dev برای این ورکر ناموفق بود (HTTP ${enable.status})`)
    return null
  }
  logs.push(`✓ ورکر روی workers.dev فعال شد`)
  return `${workerName}.${accountSubdomain}.workers.dev`
}

/** Wait until the deployed worker actually answers on its public URL. */
async function waitUntilReachable(url: string, tries = 12): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'miliconfig-deploy-check' } })
      // Any HTTP response (even 4xx/5xx from the app itself) means DNS+edge is live.
      if (r.status > 0) return true
    } catch { /* not live yet */ }
    await sleep(1000)
  }
  return false
}

export async function runDeployment(env: Env, job: DeployJob): Promise<void> {
  const logs: string[] = []
  try {
    // ── 1. Verify token & resolve account ────────────────────────────────
    const verify = await cfApi(job.cf_token, '/user/tokens/verify')
    const verifyResult = verify.data?.result as { status?: string } | undefined
    if (!verify.ok || verifyResult?.status !== 'active') {
      await failDeployment(env, job, 'توکن Cloudflare نامعتبر یا غیرفعال است — توکن را در صفحه توکن‌ها بررسی کنید')
      return
    }
    logs.push('✓ توکن Cloudflare تأیید شد')

    const acc = await getAccountId(job.cf_token)
    if (!acc.accountId) {
      await failDeployment(env, job, acc.error ?? 'اکانت کلودفلر پیدا نشد')
      return
    }
    const accountId = acc.accountId
    logs.push(`✓ اکانت متصل شد (${accountId.slice(0, 8)}…)`)

    // ── 2. Resolve workers.dev host EARLY so we can report an accurate URL
    const host = await resolveWorkersDevHost(job.cf_token, accountId, job.worker_name, logs)
    await appendLogs(env, job.deployment_id, logs)
    logs.length = 0

    // ── 3. Download worker source ────────────────────────────────────────
    const src = await fetchWorkerCode(job)
    if (!src.code) {
      await failDeployment(env, job, src.error ?? 'سورس ورکر دریافت نشد')
      return
    }
    logs.push('✓ سورس ورکر دانلود شد')

    // ── 4. Provision KV namespace ────────────────────────────────────────
    const ns = await createKvNamespace(job.cf_token, accountId, `${job.worker_name}-kv`)
    logs.push(...ns.logs)
    if (!ns.id) {
      await failDeployment(env, job, ns.error ?? 'ساخت KV ناموفق بود')
      return
    }

    // ── 5. Upload script with bindings ───────────────────────────────────
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

    // ── 6. Make sure the public URL is live before declaring success ─────
    let workerUrl: string
    if (host) {
      const reachable = await waitUntilReachable(`https://${host}`)
      if (reachable) {
        workerUrl = `https://${host}`
        logs.push(`✓ آدرس عمومی تأیید شد: ${workerUrl}`)
      } else {
        // Propagation can lag a few seconds behind enablement.
        workerUrl = `https://${host}`
        logs.push('⚠ آدرس هنوز پاسخ نمی‌دهد — معمولاً ظرف چند دقیقه فعال می‌شود')
      }
    } else {
      workerUrl = `https://${job.worker_name}.${accountId.slice(0, 8)}.workers.dev`
      logs.push(`⚠ workers.dev در دسترس نبود؛ آدرس تخمینی ثبت شد: ${workerUrl}`)
    }
    const panelUrl = `${workerUrl}/${job.custom_path || job.uuid}`

    await appendLogs(env, job.deployment_id, logs)
    logs.length = 0

    // ── 7. Persist final state + activity log ────────────────────────────
    await env.DB.prepare(
      `UPDATE deployments SET status = 'deployed', worker_url = ?, panel_url = ?, kv_namespace_id = ?,
       cf_account_id = ?, config = ?, updated_at = ? WHERE id = ?`,
    )
      .bind(
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
