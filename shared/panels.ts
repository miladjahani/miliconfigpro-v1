/**
 * Deployable panel catalog — the single source of truth for every panel the
 * app can install on Railway, Render.com and a Docker VPS.
 *
 * Both the Worker (worker/railway.ts, worker/render.ts, worker/index.ts) and the
 * frontend (DeployWizard, vps-deploy.ts) import this module, so adding a panel
 * here makes it available in every part of the app at once — exactly like the
 * Cloudflare worker sources work.
 *
 * Only public, non-secret metadata lives here. Credentials (admin password,
 * secret key) are always generated at deploy time and never stored in this file.
 *
 * LIVENESS RULE: every entry carries `lastCommit` + `verifiedAt` — the date of
 * the newest upstream commit and the date we checked it against the live repo.
 * A panel is only listed when its repository was alive and current at
 * verification time (see the `excluded` list at the bottom for what we dropped).
 */

export type PanelRuntime = 'docker' | 'python'
export type DeployTarget = 'railway' | 'render' | 'vps'
/** Community a project comes from — shown as a flag in the pickers. */
export type PanelOrigin = 'ir' | 'cn' | 'ru' | 'intl'

/** Environment-variable names a panel understands on the host. */
export interface PanelEnvNames {
  /** Dashboard admin password. */
  adminPassword?: string
  /** Session/signing secret. */
  secretKey?: string
  /** HTTP port to bind. */
  port?: string
  /** Persistent data directory. */
  dataDir?: string
  /** Public domain variable (set by the platform when available). */
  publicDomain?: string
  /** PostgreSQL connection string (panels that need a database). */
  dbUrl?: string
  /** Redis connection string. */
  redisUrl?: string
  /** Redis host name. */
  redisHost?: string
}

export interface PanelSpec {
  /** Stable id passed through the API (`worker_source` / `panel`). */
  id: string
  /** Display name. */
  name: string
  /** One-line description shown in the pickers. */
  tagline: string
  /** GitHub repository in `owner/name` form. */
  repo: string
  /** Full repository URL. */
  url: string
  /** docker = container image; python = plain Python app. */
  runtime: PanelRuntime
  /** Port the panel listens on. */
  port: number
  /** Extra container ports (e.g. a separate subscription port). */
  extraPorts?: number[]
  /** UDP container ports (e.g. WireGuard 51820/udp). */
  udpPorts?: number[]
  /** Whether the project ships a Dockerfile we can build from source. */
  hasDockerfile?: boolean
  /** Published container image — preferred over building from source. */
  dockerImage?: string
  /** Panel needs a PostgreSQL sidecar (the generated compose adds one). */
  requiresDb?: 'postgres'
  /** Panel needs a Redis sidecar. */
  requiresRedis?: boolean
  /** Container path that must persist between restarts. */
  dataVolume?: string
  /** Linux capabilities the container needs (e.g. NET_ADMIN for Fail2ban). */
  capAdd?: string[]
  /** Extra read-only host mounts (e.g. /lib/modules for WireGuard). */
  extraVolumes?: string[]
  /** Kernel settings the container requires. */
  sysctls?: string[]
  /** Some panels (s-ui) refuse to run without a TTY. */
  tty?: boolean
  /** Path to the Dockerfile inside the repo (docker runtime only). */
  dockerfilePath?: string
  /** Build command for non-Docker runtimes. */
  buildCommand?: string
  /** Start command for non-Docker runtimes. */
  startCommand?: string
  /** Dashboard/login path used for links and health checks. */
  panelPath: string
  /** Health-check path (defaults to panelPath). */
  healthPath?: string
  /** Env-var names to set on the host. */
  env: PanelEnvNames
  /** Optional post-deploy admin bootstrap endpoint on the panel itself. */
  setupPath?: string
  /** Targets this panel supports. */
  targets: DeployTarget[]
  /** Installs xray-core inside generated VPS images (proxy panels only). */
  needsXray?: boolean
  /** Documented default admin password, shown as a hint to the user. */
  defaultAdminPassword?: string
  /** Community this project comes from. */
  origin?: PanelOrigin
  /** Requirements / caveats shown in the picker and generated README. */
  notes?: string
  /** ISO date of the newest upstream commit we verified. */
  lastCommit?: string
  /** ISO date this entry was verified against the live repository. */
  verifiedAt?: string
}

/** Flag + label for each community. */
export const PANEL_ORIGIN: Record<PanelOrigin, { flag: string; label: string }> = {
  ir: { flag: '🇮🇷', label: 'ایران' },
  cn: { flag: '🇨🇳', label: 'چین' },
  ru: { flag: '🇷🇺', label: 'روسیه' },
  intl: { flag: '🌍', label: 'بین‌المللی' },
}

export const PANELS: PanelSpec[] = [
  {
    id: 'stanngv2',
    name: 'StanNG v2',
    tagline: 'پنل VLESS با xray-core — مستقر با Dockerfile رسمی مخزن',
    repo: 'youdidking/stanngv2',
    url: 'https://github.com/youdidking/stanngv2',
    runtime: 'docker',
    port: 8000,
    hasDockerfile: true,
    dockerfilePath: 'Dockerfile',
    panelPath: '/login',
    healthPath: '/login',
    env: { adminPassword: 'ADMIN_PASSWORD', secretKey: 'SECRET_KEY', port: 'PORT' },
    setupPath: '/api/setup',
    targets: ['railway', 'render', 'vps'],
    needsXray: true,
    origin: 'intl',
    notes: 'پایتون + Dockerfile مخزن؛ سبک‌ترین گزینه برای Railway و Render.',
  },
  {
    id: 'pxpanel',
    name: 'PXPANEL',
    tagline: 'دروازه VLESS / XHTTP / Hysteria2 / TUIC + داشبورد و ربات تلگرام',
    repo: 'iran-px-panel/pxpanel',
    url: 'https://github.com/iran-px-panel/pxpanel',
    runtime: 'python',
    port: 8000,
    buildCommand: 'pip install -r requirements.txt',
    startCommand: 'python main.py',
    panelPath: '/dashboard',
    healthPath: '/dashboard',
    env: {
      adminPassword: 'ADMIN_PASSWORD',
      secretKey: 'SECRET_KEY',
      port: 'PORT',
      dataDir: 'DATA_DIR',
      publicDomain: 'RAILWAY_PUBLIC_DOMAIN',
    },
    targets: ['railway', 'render', 'vps'],
    needsXray: false,
    defaultAdminPassword: 'pxpanel2026',
    origin: 'ir',
    notes: 'پایتون محض — بدون نیاز به دسترسی root؛ مناسب ریلوی/رندر.',
  },

  // ── Verified community panels (VPS / Docker) ──────────────────────────────
  // Listed only after checking the live repo: these three were active on the
  // day of verification (last commit within 24h) and ship a Docker image.
  {
    id: '3xui',
    name: '3X-UI',
    tagline: 'پنل چند‌پروتکلی Xray (VLESS/Vmess/Trojan/Hysteria2/AmneziaWG) — فورک پیشرفتهٔ x-ui',
    repo: 'MHSanaei/3x-ui',
    url: 'https://github.com/MHSanaei/3x-ui',
    runtime: 'docker',
    port: 2053,
    extraPorts: [443, 8443],
    hasDockerfile: true,
    dockerImage: 'ghcr.io/mhsanaei/3x-ui:latest',
    dockerfilePath: 'Dockerfile',
    panelPath: '/',
    healthPath: '/',
    // Image reads XUI_* envs; panel port/paths are configured inside the UI, so
    // we deliberately do not invent env names beyond the published ones.
    env: {},
    targets: ['vps'],
    needsXray: false,
    defaultAdminPassword: 'admin',
    origin: 'ir',
    dataVolume: '/etc/x-ui',
    capAdd: ['NET_ADMIN', 'NET_RAW'],
    notes:
      'ورود پیش‌فرض admin/admin است — بعد از اولین ورود، رمز و پورت پنل را در تنظیمات عوض کنید. نیازمند NET_ADMIN برای Fail2ban است (در compose تنظیم شده).',
    lastCommit: '2026-09-12',
    verifiedAt: '2026-09-12',
  },
  {
    id: 'sui',
    name: 'S-UI',
    tagline: 'پنل تک‌فایلی بر پایهٔ Sing-Box — چند‌پروتکلی + ساب‌سکریپشن سه‌فرمتی',
    repo: 'alireza0/s-ui',
    url: 'https://github.com/alireza0/s-ui',
    runtime: 'docker',
    port: 2095,
    extraPorts: [2096],
    dockerImage: 'alireza7/s-ui:latest',
    panelPath: '/app/',
    healthPath: '/app/',
    env: {},
    targets: ['vps'],
    needsXray: false,
    defaultAdminPassword: 'admin',
    origin: 'ir',
    dataVolume: '/app/db',
    tty: true,
    notes:
      'پنل روی پورت 2095 و مسیر /app/ بالا می‌آید و سرویس ساب‌سکریپشن روی 2096. ورود پیش‌فرض admin/admin.',
    lastCommit: '2026-09-12',
    verifiedAt: '2026-09-12',
  },
  {
    id: 'pasarguard',
    name: 'PasarGuard',
    tagline: 'جانشین Marzban — مدیریت انبوه کاربر پروکسی (Xray + WireGuard)',
    repo: 'PasarGuard/panel',
    url: 'https://github.com/PasarGuard/panel',
    runtime: 'docker',
    port: 8000,
    dockerImage: 'pasarguard/panel:latest',
    panelPath: '/',
    healthPath: '/',
    env: { dbUrl: 'SQLALCHEMY_DATABASE_URL' },
    requiresDb: 'postgres',
    targets: ['vps'],
    needsXray: false,
    origin: 'ir',
    dataVolume: '/var/lib/pasarguard',
    notes:
      'به PostgreSQL نیاز دارد (compose خودش می‌سازد). پورت پیش‌فرض ۸۰۰۰ است؛ اگر پنل روی پورت دیگری گوش می‌دهد، مقدار را در .env و ports اصلاح کنید.',
    lastCommit: '2026-09-12',
    verifiedAt: '2026-09-12',
  },
  // Lesser-known but actively maintained (checked live): a FastAPI proxy panel
  // that is designed to run free on Render/Railway, and a WireGuard panel.
  {
    id: 'luffy',
    name: 'Luffy Panel',
    tagline: 'پنل سبک VLESS + Trojan با FastAPI — ساخته‌شده برای Render و Railway',
    repo: 'luffy-sh-op/LUFFY_PANEL',
    url: 'https://github.com/luffy-sh-op/LUFFY_PANEL',
    runtime: 'python',
    port: 8000,
    buildCommand: 'pip install -r requirements.txt',
    startCommand: 'uvicorn main:app --host 0.0.0.0 --port $PORT',
    panelPath: '/',
    healthPath: '/',
    env: { port: 'PORT' },
    targets: ['railway', 'render', 'vps'],
    needsXray: false,
    origin: 'intl',
    notes:
      'مخزن رسمی خودش Procfile برای Render/Railway دارد؛ دیتابیس SQLite داخلی و ربات تلگرام اختیاری. روی پلن رایگان Render/Railway قابل اجراست.',
    lastCommit: '2026-07-18',
    verifiedAt: '2026-09-12',
  },
  {
    id: 'wgeasy',
    name: 'WG-Easy',
    tagline: 'پنل WireGuard (و AmneziaWG) با رابط وب، QR و مدیریت کلاینت‌ها',
    repo: 'wg-easy/wg-easy',
    url: 'https://github.com/wg-easy/wg-easy',
    runtime: 'docker',
    port: 51821,
    udpPorts: [51820],
    dockerImage: 'ghcr.io/wg-easy/wg-easy:15',
    panelPath: '/',
    healthPath: '/',
    env: { port: 'PORT', adminPassword: 'PASSWORD', publicDomain: 'WG_HOST' },
    targets: ['vps'],
    needsXray: false,
    origin: 'intl',
    dataVolume: '/etc/wireguard',
    capAdd: ['NET_ADMIN', 'SYS_MODULE'],
    extraVolumes: ['/lib/modules:/lib/modules:ro'],
    sysctls: ['net.ipv4.ip_forward=1', 'net.ipv4.conf.all.src_valid_mark=1'],
    notes:
      'به NET_ADMIN و mount ماژول‌های کرنل نیاز دارد (هر دو در compose تنظیم شده‌اند). رمز ورود پنل را در .env (PASSWORD) عوض کنید و WG_HOST را روی IP سرور بگذارید.',
    lastCommit: '2026-09-09',
    verifiedAt: '2026-09-12',
  },
  {
    id: 'remnawave',
    name: 'Remnawave',
    tagline: 'پنل نسل‌جدید روسی (Node.js) — چند‌نودی، اشتراک و مدیریت کاربران',
    repo: 'remnawave/backend',
    url: 'https://github.com/remnawave/backend',
    runtime: 'docker',
    port: 3000,
    dockerImage: 'remnawave/backend:latest',
    panelPath: '/',
    healthPath: '/',
    env: {
      port: 'APP_PORT',
      dbUrl: 'DATABASE_URL',
      redisHost: 'REDIS_HOST',
      redisUrl: 'REDIS_URL',
    },
    requiresDb: 'postgres',
    requiresRedis: true,
    targets: ['vps'],
    needsXray: false,
    origin: 'ru',
    dataVolume: '/var/lib/remnawave',
    notes:
      'به PostgreSQL و Redis نیاز دارد (هر دو در compose ساخته می‌شوند). نسخهٔ backend؛ رابط کاربری در نسخه‌های جدید روی همین سرویس سرو می‌شود.',
    lastCommit: '2026-09-12',
    verifiedAt: '2026-09-12',
  },
]

export const DEFAULT_PANEL_ID = PANELS[0].id

/**
 * Repositories we checked and deliberately did NOT add — kept here so the
 * decision is auditable instead of silently forgotten.
 *
 * - Gozargah/Marzban      → آخرین کامیت ۲۰۲۵-۰۱-۰۹ (غیرفعال) — جانشینش PasarGuard است
 * - 3Kmfi6HP/EDtunnel     → مخزن اصلی دیگر در دسترس نیست (۴۰۴)
 * - zizifn/edgetunnel     → آخرین کامیت ۲۰۲۴-۱۱-۲۷ (راکد)
 * - Misaka-blog/cf-wkrs-pages-vless → آخرین کامیت ۲۰۲۴-۰۴-۲۳ (راکد)
 * - yonggekkk/argosbx     → فایل ورکر در مخزن فقط یک استاب است (از طریق اسکریپت خودش منتشر می‌شود)
 */
export const EXCLUDED_REPOS: Array<{ repo: string; reason: string }> = [
  // Brand names users asked about that have no verifiable public repository —
  // they are sold/distributed through Telegram channels and resellers, so we
  // cannot check liveness or wire them into the automated deployer.
  { repo: 'SLV panel', reason: 'مخزن عمومی قابل‌تأییدی ندارد (از طریق تلگرام/نمایندگی توزیع می‌شود)' },
  { repo: 'RVG panel', reason: 'مخزن عمومی ندارد؛ فقط به‌عنوان سبک کانفیگ (RVG style) در چند پروژه ارجاع داده شده' },
  { repo: 'loofi panel', reason: 'در گیت‌هاب فقط پروژه‌های همنام و بی‌ربط پیدا شد (no verifiable repo)' },
  { repo: 'sanayii panel', reason: 'مخزن عمومی ندارد؛ در گفتگوی 3x-ui به‌عنوان پنل تجاری فارسی نام برده شده' },
  { repo: 'solgx', reason: 'هیچ مخزن مرتبطی در گیت‌هاب پیدا نشد (0 نتیجه)' },
  { repo: 'freedomnet25500/new-worker-panel', reason: 'آخرین کامیت ۲۰۲۴-۰۶-۰۱ — راکد' },
  { repo: 'x4gKing/Vless-Panel', reason: 'مخزن در دسترس نیست (404)' },
  { repo: 'Gozargah/Marzban', reason: 'آخرین کامیت ۲۰۲۵-۰۱-۰۹ — غیرفعال (جانشین: PasarGuard)' },
  { repo: '3Kmfi6HP/EDtunnel', reason: 'مخزن در دسترس نیست (404)' },
  { repo: 'zizifn/edgetunnel', reason: 'آخرین کامیت ۲۰۲۴-۱۱-۲۷ — راکد' },
  { repo: 'Misaka-blog/cf-wkrs-pages-vless', reason: 'آخرین کامیت ۲۰۲۴-۰۴-۲۳ — راکد' },
  { repo: 'yonggekkk/argosbx', reason: 'فایل ورکر در مخزن استاب است' },
]

/** Resolve a panel id (unknown/empty → the default panel). */
export function resolvePanel(id?: string | null): PanelSpec {
  return PANELS.find((p) => p.id === id) ?? PANELS[0]
}

/** Panels that can be deployed to a given target. */
export function panelsForTarget(target: DeployTarget): PanelSpec[] {
  return PANELS.filter((p) => p.targets.includes(target))
}

/** Flag + community label for a panel. */
export function panelOriginLabel(panel: PanelSpec): string {
  const origin = panel.origin ? PANEL_ORIGIN[panel.origin] : undefined
  return origin ? `${origin.flag} ${origin.label}` : ''
}

/** Full clone URL used inside generated Dockerfiles / deploy scripts. */
export function panelRepoUrl(panel: PanelSpec): string {
  return `https://github.com/${panel.repo}.git`
}

/** Verified-liveness badge text, e.g. "بررسی‌شده ۲۰۲۶-۰۹-۱۲". */
export function panelVerifiedLabel(panel: PanelSpec): string {
  return panel.verifiedAt ? `بررسی‌شده ${panel.verifiedAt}` : ''
}
