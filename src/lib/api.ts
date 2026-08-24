const TOKEN_KEY = 'miliconfig_token'

/**
 * API base URL.
 * - Same-origin by default (SPA served by the worker itself).
 * - Override at build time with VITE_API_BASE (e.g. https://my-panel.workers.dev/api)
 *   when the frontend is hosted statically and the worker runs elsewhere.
 */
export const API_BASE = String(import.meta.env.VITE_API_BASE ?? '/api').replace(/\/$/, '')

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

interface ApiOptions {
  method?: string
  body?: unknown
}

/** Authenticated JSON request to the panel's worker API. */
export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'

  let resp: Response
  try {
    resp = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })
  } catch {
    throw new ApiError('خطا در اتصال به سرور', 0)
  }

  // Session expired → clear local state so auth flow restarts.
  if ((resp.status === 401 || resp.status === 403) && !path.startsWith('/auth')) {
    clearToken()
  }

  const contentType = resp.headers.get('Content-Type') ?? ''
  const text = await resp.text().catch(() => '')
  let data: unknown = null
  try { data = text && contentType.includes('json') ? JSON.parse(text) : null } catch { /* non-JSON */ }

  if (!resp.ok) {
    const message =
      (data as { error?: string } | null)?.error ??
      (resp.status === 401 || resp.status === 403 ? 'نشست شما منقضی شده است. دوباره وارد شوید.' :
       resp.status === 404 || resp.status === 405 ? 'بک‌اند اینجا اجرا نمی‌شود — برنامه را با `npm run deploy` روی کلودفلر مستقر کنید و VITE_API_BASE را تنظیم کنید.' :
       `خطای سرور (${resp.status})`)
    throw new ApiError(message, resp.status)
  }
  return data as T
}
