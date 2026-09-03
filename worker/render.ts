/**
 * Render.com REST API helpers (api.render.com/v1).
 *
 * Mirror of the Railway flow: an account API key (created at
 * https://dashboard.render.com/account/api-keys) authenticates via
 * `Authorization: Bearer <key>`. We create a Blueprint from an embedded
 * render.yaml-style spec (Docker service), which provisions a new web service
 * from the public StanNG repo, then trigger a deploy and poll its status:
 *
 *   POST /v1/blueprints  → resources[] (web service id)
 *   POST /v1/services/{serviceId}/deploys → deploy id
 *   GET  /v1/deploys/{id} → status (created → build_in_progress → live)
 */

export class RenderApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RenderApiError'
  }
}

const RENDER_API = 'https://api.render.com/v1'

interface RenderErrorBody {
  message?: string
  error?: string
}

async function renderFetch<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  let resp: Response
  try {
    resp = await fetch(`${RENDER_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    })
  } catch {
    throw new RenderApiError('اتصال به Render برقرار نشد — وضعیت اینترنت/فیلترینگ را بررسی و دوباره تلاش کنید')
  }

  const text = await resp.text().catch(() => '')
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    /* non-JSON */
  }

  if (!resp.ok) {
    const body = data as RenderErrorBody | null
    const raw = body?.message ?? body?.error ?? (data ? JSON.stringify(data).slice(0, 300) : '') ?? ''
    if (resp.status === 401 || resp.status === 403 || /invalid|unauthorized|forbidden/i.test(raw)) {
      throw new RenderApiError('کلید API رندر نامعتبر است یا دسترسی کافی ندارد (از dashboard.render.com/account/api-keys کلید بسازید)')
    }
    throw new RenderApiError(`Render API خطا داد (HTTP ${resp.status}): ${raw}`.trim())
  }
  return data as T
}

/** Confirm a key belongs to a real Render account and read its owner. */
export async function verifyRenderToken(token: string): Promise<{ name: string; email: string }> {
  const owner = await renderFetch<{ id?: string; name?: string; email?: string }>(token, '/owner')
  if (!owner?.id) throw new RenderApiError('کلید API رندر قابل تأیید نیست')
  return { name: owner.name ?? '', email: owner.email ?? '' }
}

export interface RenderDeployResult {
  serviceId: string
  deployId: string
  dashboardUrl: string
}

const STANNG_REPO = 'youdidking/stanngv2'

interface RenderResource {
  id?: string
  type?: string
}

interface BlueprintCreateBody {
  serviceId: string | null
  branch: string
  rootDir: string
  bluePrintSpec: Record<string, unknown>
}

/** render.yaml as JSON — Docker env so xray + nginx (entrypoint.sh) run exactly like Railway. */
function buildBlueprintSpec(name: string): BlueprintCreateBody {
  return {
    serviceId: null,
    branch: 'main',
    rootDir: '',
    bluePrintSpec: {
      services: [
        {
          type: 'web',
          name,
          env: 'docker',
          plan: 'free',
          repo: `https://github.com/${STANNG_REPO}`,
          dockerfilePath: 'Dockerfile',
          envVars: [
            { key: 'PORT', value: '8000' },
          ],
          autoDeploy: true,
        },
      ],
    },
  }
}

/**
 * Create a Render Blueprint from the public StanNG repo and trigger a deploy.
 * Returns the new web-service id, the deploy id and a dashboard link.
 */
export async function deployToRender(token: string, projectName: string): Promise<RenderDeployResult> {
  // 1. Provision the web service via a Blueprint.
  let resources: RenderResource[] = []
  try {
    const blueprint = await renderFetch<{ resources?: RenderResource[]; blueprint?: { resources?: RenderResource[] } }>(
      token,
      '/blueprints',
      { method: 'POST', body: JSON.stringify(buildBlueprintSpec(projectName)) },
    )
    // Response shape: resources may sit at the top level or under `blueprint`.
    resources = blueprint?.resources ?? blueprint?.blueprint?.resources ?? []
  } catch (err) {
    // Surface Render's own message — usually "repo not found" or GitHub connection hints.
    throw err
  }

  // Prefer the web service; fall back to the first provisioned resource.
  const web = resources.find((r) => r.type === 'WEB_SERVICE')
  const serviceId = web?.id ?? resources[0]?.id
  if (!serviceId) {
    throw new RenderApiError(
      'Blueprint ساخته نشد. مطمئن شوید حساب GitHub شما در Render متصل است (dashboard.render.com → Account Settings → GitHub) و دوباره تلاش کنید.',
    )
  }

  // 2. Trigger the deploy.
  const deploy = await renderFetch<{ id?: string }>(
    token,
    `/services/${encodeURIComponent(serviceId)}/deploys`,
    { method: 'POST', body: JSON.stringify({}) },
  )
  const deployId = deploy?.id
  if (!deployId) throw new RenderApiError('دستور استقرار روی Render اجرا نشد')

  return { serviceId, deployId, dashboardUrl: `https://dashboard.render.com/web/${serviceId}` }
}

/** Poll the status of a deploy started with deployToRender. */
export async function renderDeployStatus(
  token: string,
  deployId: string,
  serviceId: string,
): Promise<{ status: string; url: string | null }> {
  const dep = await renderFetch<{ id?: string; status?: string }>(token, `/deploys/${encodeURIComponent(deployId)}`)
  if (!dep?.id) throw new RenderApiError('استقرار موردنظر پیدا نشد')

  let url: string | null = null
  if ((dep.status ?? '').toUpperCase() === 'LIVE') {
    const svc = await renderFetch<{ serviceDetails?: { url?: string | null } }>(token, `/services/${encodeURIComponent(serviceId)}`)
    url = svc?.serviceDetails?.url ?? null
  }
  return { status: (dep.status ?? 'UNKNOWN').toUpperCase(), url }
}