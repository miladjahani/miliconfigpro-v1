/**
 * Catalog of hosted panels that the Railway / Render auto-deploy flows can
 * provision. Each entry describes one public GitHub repo and everything the
 * deploy step needs to know about it: which container port the service
 * listens on, static env vars (railway.toml equivalents), where the login /
 * dashboard lives, and how the admin credentials are obtained.
 *
 * The credential modes are:
 *  - 'setup':    StanNG-style — the repo exposes /api/setup, so we generate
 *                one-time admin creds and finalize the panel once it is live.
 *  - 'env-pass'  generated admin password passed as an env var (X4G).
 *  - 'env-user-pass': generated admin username+password as env vars (Marzban).
 *  - 'fixed':    creds are hardcoded by the repo's start script (Heimdall).
 *  - 'default':  panel ships with well-known default creds (3x-ui admin/admin).
 *  - 'cli':      no HTTP bootstrap; an admin must be created from the provider
 *                console with the repo's CLI (PasarGuard).
 */

export type HostedPanelSlug = 'stanng' | 'x4gui' | 'heimdall' | 'marzban' | 'pasarguard' | 'x4g'

export type HostedCredsMode = 'setup' | 'env-pass' | 'env-user-pass' | 'fixed' | 'default' | 'cli'

export interface HostedPanelTemplate {
  slug: HostedPanelSlug
  /** Persian label shown in the wizard / bot pickers. */
  label: string
  /** Short badge text, e.g. "3x-ui". */
  short: string
  emoji: string
  desc: string
  /** GitHub "owner/repo" to deploy from. */
  repo: string
  branch: string
  /** Container port the service listens on — Railway/Render PORT value. */
  port: string
  /** Path below the public domain where the panel/login lives. */
  loginPath: string
  /** Static env vars always applied on deploy. */
  envVars?: Array<{ key: string; value: string }>
  /** How admin credentials are handled (see header comment). */
  credsMode: HostedCredsMode
  /** Static username (used by generated-cred modes and displayed otherwise). */
  credsUsername?: string
  /** Env var names that receive the generated credentials. */
  credsEnv?: { user?: string; pass: string }
  /** Fixed/default credentials shown to the owner after deploy. */
  fixedCreds?: { username: string; password: string }
  /** Extra note shown after deploy (CLI setup, change-password warning...). */
  note?: string
}

export const HOSTED_PANELS: HostedPanelTemplate[] = [
  {
    slug: 'stanng',
    label: 'StanNG v2 (استاندارد)',
    short: 'StanNG',
    emoji: '🛡️',
    desc: 'پنل پیش‌فرض سبک با xray + nginx — ساب، پنل و تنظیم خودکار ادمین',
    repo: 'youdidking/stanngv2',
    branch: 'main',
    port: '8000',
    loginPath: '/login',
    credsMode: 'setup',
    credsUsername: 'admin',
  },
  {
    slug: 'x4gui',
    label: '3x-ui (تک‌پورت)',
    short: '3x-ui',
    emoji: '📡',
    desc: 'پنل X-UI با nginx تک‌پورت (پنل /managepanel و اینباند VLESS روی یک پورت)',
    repo: 'x4gpanell/3x-ui',
    branch: 'main',
    port: '3000',
    loginPath: '/managepanel/',
    credsMode: 'default',
    fixedCreds: { username: 'admin', password: 'admin' },
    note: 'در اولین ورود حتماً گذرواژه را از تنظیمات 3x-ui عوض کنید. اینباند VLESS باید روی پورت 8080 ساخته شود.',
  },
  {
    slug: 'heimdall',
    label: 'Heimdall X-UI',
    short: 'Heimdall',
    emoji: '🧭',
    desc: 'پنل X-UI با صفحه ساب اختصاصی /view — کاربر/گذرواژه ثابت X4GKIN',
    repo: 'x4gpanell/Heimdall',
    branch: 'main',
    port: '3000',
    loginPath: '/managepanel/',
    credsMode: 'fixed',
    fixedCreds: { username: 'X4GKIN', password: 'X4GKIN' },
    note: 'پس از ورود گذرواژه را عوض کنید. صفحه ساب عمومی: <دامنه>/view/',
  },
  {
    slug: 'marzban',
    label: 'Marzban',
    short: 'Marzban',
    emoji: '🟣',
    desc: 'پنل کامل Marzban (Gozargah) — ساخت ادمین خودکار با SUDO_USERNAME/SUDO_PASSWORD',
    repo: 'x4gpanell/Marzban',
    branch: 'main',
    port: '8000',
    loginPath: '/dashboard',
    envVars: [
      { key: 'XRAY_EXECUTABLE_PATH', value: '/usr/local/bin/xray' },
      { key: 'XRAY_ASSETS_PATH', value: '/usr/local/share/xray' },
      { key: 'SQLALCHEMY_DATABASE_URL', value: 'sqlite:////code/db.sqlite3' },
    ],
    credsMode: 'env-user-pass',
    credsUsername: 'admin',
    credsEnv: { user: 'SUDO_USERNAME', pass: 'SUDO_PASSWORD' },
    note: 'برای ماندگاری داده‌ها یک Volume روی /code وصل کنید.',
  },
  {
    slug: 'pasarguard',
    label: 'PasarGuard',
    short: 'PasarGuard',
    emoji: '🛡️',
    desc: 'پنل چندکاربره PasarGuard (Python/uv) — ادمین با CLI ساخته می‌شود',
    repo: 'x4gpanell/PasarGuard',
    branch: 'main',
    port: '8000',
    loginPath: '/',
    envVars: [{ key: 'SQLALCHEMY_DATABASE_URL', value: 'sqlite+aiosqlite:///db.sqlite3' }],
    credsMode: 'cli',
    credsUsername: 'admin',
    note: 'بعد از LIVE شدن، از کنسول Railway/Render اجرا کنید: pasarguard cli admins --create admin',
  },
  {
    slug: 'x4g',
    label: 'X4G Gateway',
    short: 'X4G',
    emoji: '⚡',
    desc: 'دروازه VLESS/XHTTP با داشبورد و ربات تلگرام — گذرواژه ادمین خودکار ساخته می‌شود',
    repo: 'x4gpanell/X4G',
    branch: 'main',
    port: '8000',
    loginPath: '/login',
    envVars: [{ key: 'DATA_DIR', value: '/data' }],
    credsMode: 'env-pass',
    credsEnv: { pass: 'ADMIN_PASSWORD' },
    note: 'برای ماندگاری داده‌ها یک Volume روی /data وصل کنید.',
  },
]

export const HOSTED_SLUGS: HostedPanelSlug[] = HOSTED_PANELS.map((p) => p.slug)

export function getHostedPanel(slug: string | null | undefined): HostedPanelTemplate {
  return HOSTED_PANELS.find((p) => p.slug === slug) ?? HOSTED_PANELS[0]
}
