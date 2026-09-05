/**
 * Railway Public API (GraphQL) helpers.
 *
 * Railway exposes its dashboard API at https://backboard.railway.com/graphql/v2.
 * Account/workspace tokens authenticate via `Authorization: Bearer <token>`.
 * We use it to auto-deploy any panel repo from the catalog (worker/panels.ts,
 * e.g. youdidking/stanngv2, x4gpanell/3x-ui, x4gpanell/Marzban, ...) into a
 * brand-new Railway project, exactly like the Cloudflare flow creates workers:
 *
 *   projectCreate → default environment → serviceCreate (source = GitHub repo)
 *   → PORT variable + template env vars → serviceInstanceDeployV2 →
 *   poll deployment(id) until SUCCESS
 */

import type { HostedPanelTemplate } from './panels'

export class RailwayApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RailwayApiError'
  }
}

const RAILWAY_ENDPOINT = 'https://backboard.railway.com/graphql/v2'

interface GqlResponse {
  data?: Record<string, unknown> | null
  errors?: Array<{ message?: string; extensions?: { code?: string } }>
}

/** Raw GraphQL call; throws RailwayApiError with a user-friendly message. */
async function gql(token: string, query: string, variables: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  let resp: Response
  try {
    resp = await fetch(RAILWAY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ query, variables }),
    })
  } catch {
    throw new RailwayApiError('اتصال به Railway برقرار نشد — وضعیت اینترنت/فیلترینگ را بررسی و دوباره تلاش کنید')
  }

  let data: GqlResponse | null = null
  try {
    data = (await resp.json()) as GqlResponse
  } catch {
    /* fall through */
  }

  // Railway returns HTTP 200 with an errors array for most failures.
  const errors = data?.errors ?? []
  if (!data || (!data.data && errors.length === 0)) {
    if (resp.status === 429) throw new RailwayApiError('محدودیت نرخ درخواست Railway — کمی بعد دوباره تلاش کنید')
    throw new RailwayApiError(`Railway API پاسخ نامعتبر داد (HTTP ${resp.status})`)
  }
  if (errors.length) {
    const msgs = errors.map((e) => e.message ?? 'خطای نامشخص').filter(Boolean)
    if (msgs.some((m) => /not authorized|unauthorized|forbidden|invalid/i.test(m))) {
      throw new RailwayApiError('توکن Railway نامعتبر است یا دسترسی کافی ندارد (از railway.com/account/tokens توکن Account بسازید)')
    }
    throw new RailwayApiError(msgs.join(' — ') || 'خطای Railway API')
  }
  return data.data ?? {}
}

/** Confirm a token belongs to a real Railway account and read its owner. */
export async function verifyRailwayToken(token: string): Promise<{ name: string; email: string }> {
  const data = await gql(token, 'query { me { name email } }')
  const me = data.me as { name?: string; email?: string } | undefined
  if (!me) throw new RailwayApiError('توکن Railway قابل تأیید نیست')
  return { name: me.name ?? '', email: me.email ?? '' }
}

export interface RailwayDeployResult {
  projectId: string
  serviceId: string
  environmentId: string
  deploymentId: string
  projectUrl: string
  domain?: string | null
}

interface EnvEdge { node?: { id?: string; name?: string } }

/**
 * Create a Railway project from a catalog panel repo and trigger a deploy.
 * Returns the resource ids + a dashboard link to the new project.
 *
 * `extraEnv` carries deploy-time variables whose values are only known now
 * (e.g. generated admin credentials), merged after the template's static env.
 */
export async function deployToRailway(
  token: string,
  projectName: string,
  template: HostedPanelTemplate,
  region = 'us-west2',
  extraEnv: Array<{ key: string; value: string }> = [],
): Promise<RailwayDeployResult> {
  // 0. The live API requires a workspaceId on projectCreate — resolve the
  //    token's first workspace via `me { workspaces }`. Tolerate both the
  //    direct-list and Relay (edges/node) response shapes.
  const wsData = await gql(token, 'query { me { workspaces { id name } } }')
  const wsRaw = (wsData.me as { workspaces?: unknown } | undefined)?.workspaces
  const wsList: Array<{ id?: string; name?: string }> = Array.isArray(wsRaw)
    ? (wsRaw as Array<{ id?: string; name?: string }>)
    : Array.isArray((wsRaw as { edges?: Array<{ node?: unknown }> } | null | undefined)?.edges)
      ? ((wsRaw as { edges: Array<{ node?: { id?: string; name?: string } }> }).edges.map((e) => e.node ?? {}))
      : []
  const workspaceId = wsList[0]?.id
  if (!workspaceId) throw new RailwayApiError('حساب Railway شما هیچ workspace فعالی ندارد — از railway.com/account/tokens یک توکن Account بسازید')

  // 1. Create the project inside that workspace.
  const created = await gql(
    token,
    'mutation ($input: ProjectCreateInput!) { projectCreate(input: $input) { id } }',
    { input: { name: projectName, workspaceId } },
  )
  const projectId = (created.projectCreate as { id?: string } | undefined)?.id
  if (!projectId) throw new RailwayApiError('پروژه Railway ساخته نشد')

  // 2. Resolve the default ("production") environment — create it if missing.
  const envData = await gql(
    token,
    'query ($id: String!) { project(id: $id) { environments { edges { node { id name } } } } }',
    { id: projectId },
  )
  const edges = (((envData.project as { environments?: { edges?: EnvEdge[] } } | undefined)?.environments)?.edges ?? []) as EnvEdge[]
  let environmentId = edges.find((e) => (e.node?.name ?? '').toLowerCase() === 'production')?.node?.id
  if (!environmentId) environmentId = edges[0]?.node?.id
  if (!environmentId) {
    const envCreated = await gql(
      token,
      'mutation ($input: EnvironmentCreateInput!) { environmentCreate(input: $input) { id } }',
      { input: { projectId, name: 'production' } },
    )
    environmentId = (envCreated.environmentCreate as { id?: string } | undefined)?.id
  }
  if (!environmentId) throw new RailwayApiError('محیط پروژه Railway ساخته نشد')

  // 3. Create the service from the public GitHub repo.
  const svc = await gql(
    token,
    'mutation ($input: ServiceCreateInput!) { serviceCreate(input: $input) { id } }',
    {
      input: {
        projectId,
        environmentId,
        name: projectName,
        branch: template.branch,
        source: { repo: template.repo },
      },
    },
  )
  const serviceId = (svc.serviceCreate as { id?: string } | undefined)?.id
  if (!serviceId) {
    throw new RailwayApiError(
      `اتصال مخزن ${template.repo} به Railway ناموفق بود. مطمئن شوید حساب GitHub شما در Railway متصل است (Railway → Account Settings → GitHub)، سپس دوباره تلاش کنید.`,
    )
  }

  // 3b. Pin the deployment region — applied before the first deploy so the
  //     instance runs in the requested country (default: US West).
  await gql(
    token,
    'mutation ($serviceId: String!, $environmentId: String!, $input: ServiceInstanceUpdateInput!) { serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input) }',
    { serviceId, environmentId, input: { region } },
  ).catch(() => null)

  // 3c. Generate a *.up.railway.app domain so the panel is reachable as soon
  //     as the first deploy goes live.
  let domain: string | null = null
  try {
    const dom = await gql(
      token,
      'mutation ($input: ServiceDomainCreateInput!) { serviceDomainCreate(input: $input) { domain } }',
      { input: { serviceId, environmentId } },
    )
    domain = (dom.serviceDomainCreate as { domain?: string } | undefined)?.domain ?? null
  } catch {
    /* the domain can still be generated later from the dashboard */
  }

  // 4. Pin PORT so the container listens where Railway expects it, then apply
  //    the template's static env vars plus any deploy-time values.
  const envs = [...(template.envVars ?? []), { key: 'PORT', value: template.port }, ...extraEnv]
  for (const e of envs) {
    await gql(
      token,
      'mutation ($input: VariableUpsertInput!) { variableUpsert(input: $input) }',
      { input: { projectId, environmentId, serviceId, name: e.key, value: e.value } },
    ).catch(() => null)
  }

  // 5. Trigger the deploy. Returns the deployment id (string).
  const dep = await gql(
    token,
    'mutation ($serviceId: String!, $environmentId: String!) { serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId) }',
    { serviceId, environmentId },
  )
  const deploymentId = dep.serviceInstanceDeployV2 as string | undefined
  if (!deploymentId) throw new RailwayApiError('دستور استقرار روی Railway اجرا نشد')

  return { projectId, serviceId, environmentId, deploymentId, projectUrl: `https://railway.com/project/${projectId}`, domain }
}

/** Poll the status of a deployment started with deployToRailway. */
export async function railwayDeployStatus(token: string, deploymentId: string): Promise<{ status: string; url: string | null }> {
  const data = await gql(
    token,
    'query ($id: String!) { deployment(id: $id) { id status url staticUrl } }',
    { id: deploymentId },
  )
  const dep = data.deployment as { status?: string; url?: string | null; staticUrl?: string | null } | undefined
  if (!dep) throw new RailwayApiError('استقرار موردنظر پیدا نشد')
  return { status: dep.status ?? 'UNKNOWN', url: dep.url ?? dep.staticUrl ?? null }
}
