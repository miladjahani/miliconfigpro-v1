import { useCallback, useEffect, useState, useRef } from 'react'
import { Users, Plus, Copy, Check, Trash2, Loader2, RefreshCw, Power, Activity, Zap, Pencil, X, FlaskConical, Download } from 'lucide-react'
import { api } from '../lib/api'
import { FRAGMENT_PRESETS, FM_PRESETS, CS_PRESETS, KNOWN_SNIS, CLIENT_FRAGMENT_PRESETS, CHAIN_PROTOCOLS } from '../../worker/presets'
import type { Deployment, WorkerMember } from '../lib/types'

const COUNTRIES = [
  { code: 'us', label: '🇺🇸 آمریکا', flag: '🇺🇸', labelEn: 'United States' },
  { code: 'de', label: '🇩🇪 آلمان', flag: '🇩🇪', labelEn: 'Germany' },
  { code: 'nl', label: '🇳🇱 هلند', flag: '🇳🇱', labelEn: 'Netherlands' },
  { code: 'tr', label: '🇹🇷 ترکیه', flag: '🇹🇷', labelEn: 'Turkey' },
  { code: 'ae', label: '🇦🇪 امارات', flag: '🇦🇪', labelEn: 'United Arab Emirates' },
  { code: 'fi', label: '🇫🇮 مولتی', flag: '🇫🇮', labelEn: 'Multi' },
  { code: 'gb', label: '🇬🇧 بریتانیا', flag: '🇬🇧', labelEn: 'United Kingdom' },
  { code: 'fr', label: '🇫🇷 فرانسه', flag: '🇫🇷', labelEn: 'France' },
  { code: 'jp', label: '🇯🇵 ژاپن', flag: '🇯🇵', labelEn: 'Japan' },
  { code: 'sg', label: '🇸🇬 سنگاپور', flag: '🇸🇬', labelEn: 'Singapore' },
  { code: 'kr', label: '🇰🇷 کره جنوبی', flag: '🇰🇷', labelEn: 'South Korea' },
  { code: 'in', label: '🇮🇳 هند', flag: '🇮🇳', labelEn: 'India' },
  { code: 'br', label: '🇧🇷 برزیل', flag: '🇧🇷', labelEn: 'Brazil' },
  { code: 'ca', label: '🇨🇦 کانادا', flag: '🇨🇦', labelEn: 'Canada' },
  { code: 'au', label: '🇦🇺 استرالیا', flag: '🇦🇺', labelEn: 'Australia' },
]

const TRANSPORTS = [
  { v: '', label: 'پیش‌فرض ورکر' },
  { v: 'ws', label: 'WebSocket (ws)' },
  { v: 'grpc', label: 'gRPC' },
  { v: 'httpupgrade', label: 'HTTPUpgrade' },
]

const SANCTIONS_MODES = [
  { v: '', label: 'خاموش' },
  { v: 'sni', label: 'SNI جایگزین (سبک — دور زدن فیلتر)' },
  { v: 'warp', label: 'WARP (جمنی/OpenAI + UDP واقعی)' },
]

const MAX_NODES_PER_LOCATION = 3

// ── EDT-Pages Proxy List ──────────────────────────────────────────────
const EDT_PROXY_REPO = 'https://raw.githubusercontent.com/EDT-Pages/Proxy-List/main/data'

interface EtdProxy {
  proxy: string
  protocol: string
  ip: string
  port: number
  country: string
  city: string
  asn: string
  asOrganization: string
}

const proxyCache = new Map<string, EtdProxy[]>()

async function fetchEtdProxies(protocol: 'socks5' | 'https'): Promise<Record<string, EtdProxy[]>> {
  const cacheKey = `edt:${protocol}`
  if (proxyCache.has(cacheKey)) {
    const cached = proxyCache.get(cacheKey)!
    const grouped: Record<string, EtdProxy[]> = {}
    for (const p of cached) {
      const key = p.country.toLowerCase()
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(p)
    }
    return grouped
  }

  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 15000)
    const resp = await fetch(`${EDT_PROXY_REPO}/${protocol}.json`, { signal: ctrl.signal })
    clearTimeout(t)
    if (!resp.ok) return {}
    const data = await resp.json() as EtdProxy[]
    proxyCache.set(cacheKey, data)

    const grouped: Record<string, EtdProxy[]> = {}
    for (const p of data) {
      if (p.country) {
        const key = p.country.toLowerCase()
        if (!grouped[key]) grouped[key] = []
        grouped[key].push(p)
      }
    }
    return grouped
  } catch {
    return {}
  }
}

// ── Types ─────────────────────────────────────────────────────────────

interface CountryLocation {
  name: string
  proxy: string
}

interface FormState {
  name: string
  quotaGb: string
  reqQuota: string
  ipLimit: string
  startOnConnect: boolean
  resetDays: string
  rotateMin: string
  expires: string
  transport: string
  countries: string[]
  countryLocations: Record<string, CountryLocation[]>
  customIps: string
  fragment: boolean
  preset: string
  fm: string
  cs: string
  fingerprint: string
  sniChoice: string
  sniCustom: string
  hostMask: string
  sanctionsMode: string
  proxyip: string
  chainProto: string
  chainCred: string
  ech: boolean
  ed0rtt: boolean
  randomPath: boolean
  fragmentClient: string
  maxNodesPerLocation: string
}

const EMPTY_FORM: FormState = {
  name: '', quotaGb: '', reqQuota: '', ipLimit: '', startOnConnect: false,
  resetDays: '', rotateMin: '', expires: '', transport: '', countries: [],
  countryLocations: {},
  customIps: '', fragment: false, preset: '', fm: '', cs: '',
  fingerprint: '', sniChoice: '', sniCustom: '', hostMask: '', sanctionsMode: '',
  proxyip: '', chainProto: '', chainCred: '', ech: false, ed0rtt: false, randomPath: false, fragmentClient: '',
  maxNodesPerLocation: '3',
}

function formToBody(f: FormState) {
  const sni = f.sniChoice === '' ? f.sniCustom.trim() : f.sniChoice === 'none' ? '' : f.sniChoice
  const chainProxy = f.chainProto && f.chainCred.trim() ? `${f.chainProto}://${f.chainCred.trim()}` : ''

  const countryLocationConfigs: Record<string, Array<{ location: string; proxy: string }>> = {}
  for (const [cc, locs] of Object.entries(f.countryLocations)) {
    countryLocationConfigs[cc] = locs.map(l => ({ location: l.name, proxy: l.proxy }))
  }

  return {
    countries: f.countries,
    country_locations: countryLocationConfigs,
    custom_ips: f.customIps.split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
    transport: f.transport,
    fragment: f.fragment,
    fragment_preset: f.preset,
    fragment_config: {
      ...(f.fm.trim() ? { fm: f.fm.trim() } : {}),
      ...(f.cs.trim() ? { cs: f.cs.trim() } : {}),
    },
    fingerprint: f.fingerprint,
    custom_sni: sni,
    custom_host: f.hostMask.trim(),
    sanctions_mode: f.sanctionsMode,
    proxyip: f.proxyip.trim(),
    chain_proxy: chainProxy,
    ech: f.ech,
    ed_0rtt: f.ed0rtt,
    random_path: f.randomPath,
    fragment_client: f.fragmentClient,
    ip_rotation_minutes: f.rotateMin ? Number(f.rotateMin) : 0,
    quota_gb: f.quotaGb ? Number(f.quotaGb) : null,
    request_quota: f.reqQuota ? Number(f.reqQuota) : null,
    ip_limit: f.ipLimit ? Number(f.ipLimit) : null,
    start_on_connect: f.startOnConnect,
    reset_period_days: f.resetDays ? Number(f.resetDays) : null,
    expires_at: f.expires ? new Date(f.expires).toISOString() : null,
    max_nodes_per_location: f.maxNodesPerLocation ? Number(f.maxNodesPerLocation) : MAX_NODES_PER_LOCATION,
  }
}

function memberToForm(m: WorkerMember): FormState {
  const s = m.settings
  const sni = s.custom_sni ?? ''
  const cl = (s as unknown as { country_locations?: Record<string, Array<{ location: string; proxy: string }>> }).country_locations ?? {}
  return {
    name: m.name, quotaGb: m.quota_gb != null ? String(m.quota_gb) : '',
    reqQuota: m.request_quota != null ? String(m.request_quota) : '',
    ipLimit: m.ip_limit != null ? String(m.ip_limit) : '',
    startOnConnect: !!m.start_on_connect,
    resetDays: m.reset_period_days != null ? String(m.reset_period_days) : '',
    rotateMin: s.ip_rotation_minutes ? String(s.ip_rotation_minutes) : '',
    expires: m.expires_at ? m.expires_at.slice(0, 10) : '',
    transport: s.transport ?? '', countries: s.countries ?? [],
    countryLocations: Object.fromEntries(
      Object.entries(cl).map(([k, v]) => [k, v.map(l => ({ name: l.location || '', proxy: l.proxy || '' }))])
    ),
    customIps: (s.custom_ips ?? []).join('\n'),
    fragment: !!s.fragment, preset: s.fragment_preset ?? '',
    fm: s.fragment_config?.fm ?? '', cs: s.fragment_config?.cs ?? '',
    fingerprint: s.fingerprint ?? '',
    sniChoice: KNOWN_SNIS.includes(sni) ? sni : sni ? '' : 'none',
    sniCustom: KNOWN_SNIS.includes(sni) ? '' : sni,
    hostMask: s.custom_host ?? '',
    sanctionsMode: s.sanctions_mode ?? (s.bypass_sanctions ? 'sni' : ''),
    proxyip: s.proxyip ?? '',
    chainProto: (s.chain_proxy ?? '').match(/^(socks5|http|https|turn|sstp):\/\//i)?.[1]?.toLowerCase() ?? '',
    chainCred: (s.chain_proxy ?? '').replace(/^[a-z0-9]+:\/\//i, ''),
    ech: !!s.ech, ed0rtt: !!s.ed_0rtt, randomPath: !!s.random_path,
    fragmentClient: s.fragment_client ?? '',
    maxNodesPerLocation: '3',
  }
}

function Field({ label, value, onChange, placeholder, type = 'text', textarea, rows = 2 }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; textarea?: boolean; rows?: number
}) {
  return (
    <label className="block">
      <span className="text-xs text-slate-400 mb-1 block">{label}</span>
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows}
          className="input-field text-sm w-full font-mono" dir="ltr" />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          className="input-field text-sm w-full" dir="ltr" />
      )}
    </label>
  )
}

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void
  options: { v: string; label: string }[]
}) {
  return (
    <label className="block">
      <span className="text-xs text-slate-400 mb-1 block">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="input-field text-sm py-2 w-full" dir="ltr">
        {options.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
      </select>
    </label>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button onClick={onChange} className="flex items-center gap-2 text-sm text-slate-300">
      <span className={`w-9 h-5 rounded-full transition-colors relative ${checked ? 'bg-brand-500' : 'bg-slate-700'}`}>
        <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
          style={{ right: checked ? '2px' : '18px' }} />
      </span>
      {label}
    </button>
  )
}

interface MemberTestResult {
  source_live: boolean
  source_count: number
  output_count: number
  tls_nodes: number
  ws_nodes: number
  warnings: string[]
  sample: string[]
}

export default function Members() {
  const [deployments, setDeployments] = useState<Deployment[]>([])
  const [depId, setDepId] = useState('')
  const [members, setMembers] = useState<WorkerMember[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((p) => ({ ...p, [k]: v }))

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [testResult, setTestResult] = useState<{ id: string; data: MemberTestResult } | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)

  const [proxyProtocol, setProxyProtocol] = useState<'socks5' | 'https'>('socks5')
  const [proxyLists, setProxyLists] = useState<Record<string, EtdProxy[]>>({})
  const [proxyLoading, setProxyLoading] = useState(false)
  const proxyLoadStarted = useRef(false)

  const load = useCallback(async () => {
    if (!depId) { setMembers([]); return }
    try {
      const { data } = await api<{ data: WorkerMember[] }>(`/members?deployment_id=${depId}`)
      setMembers(data ?? [])
    } catch { setMembers([]) }
  }, [depId])

  useEffect(() => {
    api<{ data: Deployment[] }>('/deployments')
      .then(({ data }) => setDeployments((data ?? []).filter((d) => d.status === 'deployed')))
      .catch(() => setDeployments([]))
  }, [])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (proxyLoadStarted.current) return
    proxyLoadStarted.current = true
    setProxyLoading(true)
    fetchEtdProxies(proxyProtocol).then((data) => { setProxyLists(data); setProxyLoading(false) })
  }, [proxyProtocol])

  const refreshProxies = async () => {
    setProxyLoading(true)
    proxyCache.delete(`edt:${proxyProtocol}`)
    const data = await fetchEtdProxies(proxyProtocol)
    setProxyLists(data)
    setProxyLoading(false)
  }

  const saveForm = async () => {
    if (!depId) { setError('اول یک ورکر انتخاب کنید'); return }
    setBusy(true); setError(null)
    try {
      if (editingId) {
        await api(`/members/${editingId}`, { method: 'PATCH', body: formToBody(form) })
      } else {
        await api('/members', { method: 'POST', body: { deployment_id: depId, name: form.name.trim(), ...formToBody(form) } })
      }
      setFormOpen(false); setEditingId(null); setForm(EMPTY_FORM)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'خطا') }
    setBusy(false)
  }

  const quickCreate = async () => {
    if (!depId) { setError('اول یک ورکر انتخاب کنید'); return }
    setBusy(true); setError(null)
    try {
      await api('/members', { method: 'POST', body: { deployment_id: depId, name: `کاربر-${Math.random().toString(36).slice(2, 6)}` } })
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'خطا') }
    setBusy(false)
  }

  const openEdit = (m: WorkerMember) => {
    setEditingId(m.id); setForm(memberToForm(m)); setFormOpen(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const bulk = async (action: string) => {
    if (!selected.size) return
    setBusy(true); setError(null)
    try {
      await api('/members/bulk', { method: 'POST', body: { ids: [...selected], action } })
      await load()
      if (action === 'delete') setSelected(new Set())
    } catch (e) { setError(e instanceof Error ? e.message : 'خطا') }
    setBusy(false)
  }

  const toggleSel = (id: string) => setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  const refreshUsage = async (id: string) => {
    setBusy(true); setError(null)
    try { await api(`/members/${id}/usage`, { method: 'POST' }); await load() }
    catch (e) { setError(e instanceof Error ? e.message : 'آمار در دسترس نیست') }
    setBusy(false)
  }

  const subUrl = (m: WorkerMember, format = '') =>
    `${window.location.origin}/api/sub/member/${m.token}${format ? `?target=${format}` : ''}`

  const runTest = async (m: WorkerMember) => {
    if (!depId) return
    setTestingId(m.id); setError(null)
    try {
      const { data } = await api<{ data: MemberTestResult }>(`/members/${m.id}/test`)
      setTestResult({ id: m.id, data })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تست ناموفق بود'); setTestResult(null)
    }
    setTestingId(null)
  }

  const copy = async (m: WorkerMember, format = '') => {
    await navigator.clipboard.writeText(subUrl(m, format)).catch(() => null)
    const key = m.id + (format || 'sub')
    setCopied(key); setTimeout(() => setCopied(null), 2000)
  }

  const toggleCountry = (code: string) => {
    const newCountries = form.countries.includes(code) ? form.countries.filter(x => x !== code) : [...form.countries, code]
    set('countries', newCountries)
    if (!form.countries.includes(code) && !form.countryLocations[code]) {
      set('countryLocations', { ...form.countryLocations, [code]: [{ name: '', proxy: '' }] })
    }
  }

  const addLocationForCountry = (code: string) => {
    const current = form.countryLocations[code] || []
    set('countryLocations', { ...form.countryLocations, [code]: [...current, { name: '', proxy: '' }] })
  }

  const removeLocationForCountry = (code: string, idx: number) => {
    const current = (form.countryLocations[code] || []).filter((_, i) => i !== idx)
    const next = { ...form.countryLocations }
    if (current.length === 0) delete next[code]; else next[code] = current
    set('countryLocations', next)
  }

  const updateLocation = (code: string, idx: number, field: keyof CountryLocation, value: string) => {
    const current = [...(form.countryLocations[code] || [])]
    current[idx] = { ...current[idx], [field]: value }
    set('countryLocations', { ...form.countryLocations, [code]: current })
  }

  const applyProxyToCountry = (code: string, proxy: string) => {
    const current = form.countryLocations[code] || []
    if (current.length === 0) {
      set('countryLocations', { ...form.countryLocations, [code]: [{ name: '', proxy }] })
    } else {
      set('countryLocations', { ...form.countryLocations, [code]: current.map(l => ({ ...l, proxy })) })
    }
  }

  return (
    <div className="space-y-6">
      <div className="glass-card p-6">
        <div className="flex items-center gap-2 mb-2">
          <Users className="w-5 h-5 text-brand-400" />
          <h2 className="text-lg font-bold text-white">کاربران ورکر</h2>
        </div>
        <p className="text-sm text-slate-400">
          حداکثر {MAX_NODES_PER_LOCATION} نود بهینه در هر لوکیشن · پروکسی از EDT-Pages · فرگمنت در sing-box JSON
        </p>
      </div>

      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <select value={depId} onChange={(e) => setDepId(e.target.value)} className="input-field text-sm py-2 min-w-[220px]">
            <option value="">انتخاب ورکر...</option>
            {deployments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          {depId && (
            <button onClick={quickCreate} disabled={busy} className="btn-secondary text-sm px-3 py-2 flex items-center gap-1.5">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 text-amber-400" />}
              ساخت سریع
            </button>
          )}
          {depId && !formOpen && (
            <button onClick={() => { setEditingId(null); setForm(EMPTY_FORM); setFormOpen(true) }}
              className="btn-primary text-sm px-3 py-2 flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> کاربر پیشرفته
            </button>
          )}
        </div>

        {depId && formOpen && (
          <div className="space-y-3 border border-slate-800 rounded-xl p-4 bg-slate-900/40">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-white">{editingId ? '✏️ ویرایش کاربر' : 'کاربر جدید'}</p>
              <button onClick={() => { setFormOpen(false); setEditingId(null); setForm(EMPTY_FORM) }}
                className="p-1.5 rounded-lg text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="نام" value={form.name} onChange={(v) => set('name', v)} placeholder="علی" />
              <Field label="سقف حجم (گیگ)" value={form.quotaGb} onChange={(v) => set('quotaGb', v)} placeholder="50" />
              <Field label="سقف درخواست" value={form.reqQuota} onChange={(v) => set('reqQuota', v)} placeholder="100000" />
              <Field label="حداکثر دستگاه" value={form.ipLimit} onChange={(v) => set('ipLimit', v)} placeholder="2" />
              <div className="flex items-end">
                <Toggle checked={form.startOnConnect} onChange={() => set('startOnConnect', !form.startOnConnect)} label="شمارش از اولین اتصال" />
              </div>
              <Field label="ریست هر N روز" value={form.resetDays} onChange={(v) => set('resetDays', v)} placeholder="30" />
              <Field label="چرخش IP (دقیقه)" value={form.rotateMin} onChange={(v) => set('rotateMin', v)} placeholder="30" />
              <Field label="تاریخ انقضا" value={form.expires} onChange={(v) => set('expires', v)} type="date" />
              <Select label="ترنسپورت" value={form.transport} onChange={(v) => set('transport', v)} options={TRANSPORTS} />
              <Select label="دور زدن تحریم" value={form.sanctionsMode} onChange={(v) => set('sanctionsMode', v)} options={SANCTIONS_MODES} />
              <Select label="حداکثر نود/لوکیشن" value={form.maxNodesPerLocation} onChange={(v) => set('maxNodesPerLocation', v)}
                options={[{ v: '1', label: '۱ نود' }, { v: '2', label: '۲ نود' }, { v: '3', label: '۳ نود (پیش‌فرض)' }, { v: '5', label: '۵ نود' }]} />
            </div>

            {/* ── Countries + Locations ──────────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-400">کشور + لوکیشن — حداکثر {form.maxNodesPerLocation || '3'} نود بهینه</span>
                <div className="flex items-center gap-2">
                  <select value={proxyProtocol} onChange={(e) => setProxyProtocol(e.target.value as 'socks5' | 'https')}
                    className="text-[11px] bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-300">
                    <option value="socks5">SOCKS5</option>
                    <option value="https">HTTPS</option>
                  </select>
                  <button onClick={refreshProxies} disabled={proxyLoading}
                    className="text-[11px] text-brand-400 hover:text-brand-300 flex items-center gap-1">
                    <Download className={`w-3 h-3 ${proxyLoading ? 'animate-spin' : ''}`} />
                    {proxyLoading ? '...' : 'EDT'}
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {COUNTRIES.map((c) => {
                  const isActive = form.countries.includes(c.code)
                  const proxyCount = (proxyLists[c.code] || []).length
                  return (
                    <div key={c.code} className="relative group">
                      <button onClick={() => toggleCountry(c.code)}
                        className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${isActive ? 'bg-brand-500/20 text-brand-300 border-brand-500/40' : 'bg-slate-800/50 text-slate-400 border-slate-700/50 hover:text-white'}`}>
                        {c.label}{proxyCount > 0 && <span className="ml-1 text-[10px] text-emerald-400">({proxyCount})</span>}
                      </button>
                      {isActive && proxyLists[c.code]?.length > 0 && (
                        <div className="absolute top-full left-0 mt-1 z-50 hidden group-hover:block">
                          <div className="bg-slate-800 border border-slate-600 rounded-lg p-2 shadow-xl min-w-[260px] max-h-[180px] overflow-y-auto">
                            <p className="text-[10px] text-slate-500 mb-1">پروکسی خروجی {c.labelEn}</p>
                            <button onClick={() => applyProxyToCountry(c.code, '')}
                              className="w-full text-left text-[11px] text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-slate-700 mb-1">
                              ❌ بدون پروکسی
                            </button>
                            {(proxyLists[c.code] || []).slice(0, 8).map((p, i) => (
                              <button key={i} onClick={() => applyProxyToCountry(c.code, p.proxy)}
                                className="w-full text-left text-[11px] text-slate-300 hover:text-emerald-300 px-2 py-1 rounded hover:bg-slate-700">
                                {p.city || p.ip}:{p.port} <span className="text-slate-500">{p.protocol}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {form.countries.length > 0 && (
                <div className="mt-3 space-y-3">
                  {form.countries.map(cc => {
                    const country = COUNTRIES.find(c => c.code === cc)
                    const locs = form.countryLocations[cc] || []
                    return (
                      <div key={cc} className="bg-slate-900/50 rounded-xl border border-slate-800 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-white">{country?.flag} {country?.labelEn || cc}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-500">{locs.length} لوکیشن · حداکثر {form.maxNodesPerLocation || '3'} نود</span>
                            {locs.length < 5 && (
                              <button onClick={() => addLocationForCountry(cc)}
                                className="text-[10px] text-brand-400 hover:text-brand-300 px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
                                + لوکیشن
                              </button>
                            )}
                          </div>
                        </div>
                        {locs.map((loc, idx) => (
                          <div key={idx} className="flex items-center gap-2 mb-1.5">
                            <input value={loc.name} onChange={(e) => updateLocation(cc, idx, 'name', e.target.value)}
                              placeholder={`لوکیشن ${idx + 1} (مثلاً Frankfurt)`}
                              className="input-field text-xs flex-1 py-1.5" />
                            <select value={loc.proxy} onChange={(e) => updateLocation(cc, idx, 'proxy', e.target.value)}
                              className="input-field text-xs py-1.5 min-w-[160px]">
                              <option value="">بدون پروکسی</option>
                              {(proxyLists[cc] || []).slice(0, 12).map((p, pi) => (
                                <option key={pi} value={p.proxy}>{p.city || p.ip}:{p.port}</option>
                              ))}
                            </select>
                            {locs.length > 1 && (
                              <button onClick={() => removeLocationForCountry(cc, idx)} className="text-red-400 hover:text-red-300 p-1">
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <Field label="IPهای سفارشی ثابت" value={form.customIps} onChange={(v) => set('customIps', v)} placeholder="104.16.1.1" />

            {/* Fragment */}
            <div className="flex items-center gap-5 flex-wrap">
              <Toggle checked={form.fragment} onChange={() => set('fragment', !form.fragment)} label="فرگمنت (TLS split)" />
              {form.fragment && <span className="text-[11px] text-emerald-400">✅ تزریق در JSON sing-box</span>}
            </div>
            {form.fragment && (
              <div className="space-y-3">
                <label className="block max-w-xs">
                  <span className="text-xs text-slate-400 mb-1 block">پریست اپراتور</span>
                  <select value={form.preset} onChange={(e) => set('preset', e.target.value)} className="input-field text-sm py-2 w-full">
                    <option value="">دستی</option>
                    {FRAGMENT_PRESETS.map((p) => <option key={p.code} value={p.code}>{p.flag} {p.label}</option>)}
                  </select>
                </label>
                <div className="flex gap-1.5 flex-wrap">
                  {FM_PRESETS.map((p) => (
                    <button key={p.code} onClick={() => set('fm', p.json)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800/60 text-[11px] text-slate-300 hover:text-brand-300 border border-slate-700 transition-colors">
                      ⚡ {p.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="fm= JSON" value={form.fm} onChange={(v) => set('fm', v)} textarea rows={3} />
                  <Field label="cs= Cipher Suite" value={form.cs} onChange={(v) => set('cs', v)} textarea rows={3} />
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {CS_PRESETS.map((p) => (
                    <button key={p.code} onClick={() => set('cs', p.value)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800/60 text-[11px] text-slate-300 hover:text-emerald-300 border border-slate-700 transition-colors">
                      🔐 {p.label}
                    </button>
                  ))}
                </div>
                <div>
                  <span className="text-xs text-slate-400 mb-1 block">فرگمنت کلاینت</span>
                  <div className="flex gap-1.5 flex-wrap">
                    <button onClick={() => set('fragmentClient', '')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] border transition-colors ${!form.fragmentClient ? 'bg-brand-500/20 text-brand-300 border-brand-500/40' : 'bg-slate-800/60 text-slate-400 border-slate-700'}`}>
                      خاموش
                    </button>
                    {CLIENT_FRAGMENT_PRESETS.map((p) => (
                      <button key={p.code} onClick={() => set('fragmentClient', form.fragmentClient === p.code ? '' : p.code)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] border transition-colors ${form.fragmentClient === p.code ? 'bg-brand-500/20 text-brand-300 border-brand-500/40' : 'bg-slate-800/60 text-slate-400 border-slate-700 hover:text-white'}`}>
                        🧩 {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TLS/SNI/FP */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Select label="Fingerprint (fp)" value={form.fingerprint} onChange={(v) => set('fingerprint', v)}
                options={[{ v: '', label: 'پیش‌فرض' }, ...['chrome', 'firefox', 'safari', 'ios', 'android', 'edge', 'randomized'].map((f) => ({ v: f, label: f }))]} />
              <Select label="SNI" value={form.sniChoice} onChange={(v) => set('sniChoice', v)}
                options={[{ v: 'none', label: 'پیش‌فرض' }, ...KNOWN_SNIS.map((s) => ({ v: s, label: s })), { v: '', label: 'سفارشی...' }]} />
              {form.sniChoice === '' && <Field label="SNI سفارشی" value={form.sniCustom} onChange={(v) => set('sniCustom', v)} placeholder="example.com" />}
            </div>
            <Field label="Host سفارشی" value={form.hostMask} onChange={(v) => set('hostMask', v)} placeholder="example.com" />

            {/* Advanced */}
            <div className="border-t border-slate-800 pt-3 mt-1">
              <p className="text-xs font-medium text-slate-300 mb-2">⚙️ پیشرفته</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="ProxyIP" value={form.proxyip} onChange={(v) => set('proxyip', v)} placeholder="1.2.3.4" />
                <label className="block">
                  <span className="text-xs text-slate-400 mb-1 block">Chain Proxy</span>
                  <select value={form.chainProto} onChange={(e) => set('chainProto', e.target.value)} className="input-field text-sm py-2 w-full" dir="ltr">
                    <option value="">خاموش</option>
                    {CHAIN_PROTOCOLS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </label>
                {form.chainProto && <Field label={`Credential`} value={form.chainCred} onChange={(v) => set('chainCred', v)} placeholder="user:pass@1.2.3.4:1080" />}
              </div>
              <div className="flex items-center gap-5 flex-wrap mt-3">
                <Toggle checked={form.ech} onChange={() => set('ech', !form.ech)} label="ECH" />
                <Toggle checked={form.ed0rtt} onChange={() => set('ed0rtt', !form.ed0rtt)} label="0-RTT" />
                <Toggle checked={form.randomPath} onChange={() => set('randomPath', !form.randomPath)} label="مسیر تصادفی" />
              </div>
            </div>

            {error && <p className="text-sm text-error-400">{error}</p>}

            {/* Sing-box JSON preview */}
            {form.countries.length > 0 && (
              <div className="bg-slate-950/50 rounded-xl border border-slate-800 p-3">
                <p className="text-[11px] text-slate-500 mb-2">📦 sing-box JSON preview</p>
                <pre className="text-[10px] text-emerald-400/70 font-mono overflow-x-auto max-h-[120px] overflow-y-auto">
{JSON.stringify({
  outbounds: form.countries.slice(0, 3).map(cc => ({
    tag: `${cc}-proxy`, type: 'vless',
    ...(form.fragment ? { fragment: { enabled: true } } : {}),
    ...(form.ech ? { ech: { enabled: true } } : {}),
    ...(form.fingerprint ? { utls: { enabled: true, fingerprint: form.fingerprint } } : {}),
    ...(form.sniChoice !== 'none' ? { tls: { server_name: form.sniChoice || form.sniCustom } } : {}),
    ...(form.transport ? { transport: { type: form.transport } } : {}),
  })),
}, null, 2)}
                </pre>
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={saveForm} disabled={busy} className="btn-primary flex items-center gap-2 text-sm">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : editingId ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                {editingId ? 'ذخیره' : 'ساخت'}
              </button>
              <button onClick={() => { setFormOpen(false); setEditingId(null); setForm(EMPTY_FORM) }} className="btn-secondary text-sm">انصراف</button>
            </div>
          </div>
        )}
      </div>

      {members.length > 0 && (
        <div className="space-y-3">
          <div className="glass-card p-4 flex items-center gap-2 flex-wrap">
            <button onClick={() => setSelected(selected.size === members.length ? new Set() : new Set(members.map((m) => m.id)))}
              className="btn-secondary text-xs px-3 py-1.5">
              {selected.size === members.length ? 'لغو انتخاب' : 'انتخاب همه'}
            </button>
            {selected.size > 0 && <>
              <span className="text-xs text-slate-400">{selected.size} انتخاب‌شده</span>
              <button onClick={() => bulk('enable')} disabled={busy} className="btn-secondary text-xs px-3 py-1.5">فعال</button>
              <button onClick={() => bulk('disable')} disabled={busy} className="btn-secondary text-xs px-3 py-1.5">غیرفعال</button>
              <button onClick={() => bulk('reset_quota')} disabled={busy} className="btn-secondary text-xs px-3 py-1.5">ریست حجم</button>
              <button onClick={() => bulk('reset_time')} disabled={busy} className="btn-secondary text-xs px-3 py-1.5">ریست زمان</button>
              <button onClick={() => bulk('delete')} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg bg-error-500/15 border border-error-500/30 text-error-400">حذف</button>
            </>}
          </div>
          {members.map((m) => {
            const pct = m.quota_gb ? Math.min(100, (m.used_gb / m.quota_gb) * 100) : 0
            const expired = m.expires_at && m.expires_at < new Date().toISOString()
            const cc = (m.settings as unknown as { country_locations?: Record<string, unknown[]> }).country_locations ?? {}
            const locCount = Object.values(cc).reduce((sum, arr) => sum + (arr as unknown[]).length, 0) as number
            return (
              <div key={m.id} className={`glass-card p-5 ${!m.enabled || expired ? 'opacity-60' : ''}`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggleSel(m.id)} className="w-4 h-4 accent-brand-500" />
                    <div>
                      <p className="text-white font-medium">{m.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {m.settings.countries.map((c) => COUNTRIES.find((x) => x.code === c)?.flag ?? c).join(' ') || 'پیش‌فرض'}
                        {m.settings.countries.length > 0 && <span className="text-brand-400"> · {m.settings.countries.length} کشور</span>}
                        {locCount > 0 && <span className="text-emerald-400"> · {locCount} لوکیشن</span>}
                        <span> · ≤{MAX_NODES_PER_LOCATION} نود</span>
                        {m.settings.fragment ? ' · 🧩' : ''}
                        {m.settings.sanctions_mode === 'warp' ? ' · WARP' : ''}
                        {expired ? ' · ⏰ منقضی' : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(m)} className="p-2 rounded-lg bg-slate-800/60 text-slate-400 hover:text-brand-300"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => copy(m, '')} className="px-3 py-1.5 rounded-lg bg-slate-800/60 text-xs text-slate-300 hover:text-brand-300 flex items-center gap-1">
                      {copied === m.id + 'sub' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />} ساب
                    </button>
                    <button onClick={() => copy(m, 'clash')} className="px-3 py-1.5 rounded-lg bg-slate-800/60 text-xs text-slate-300 hover:text-brand-300 flex items-center gap-1">
                      {copied === m.id + 'clash' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />} Clash
                    </button>
                    <button onClick={() => copy(m, 'singbox')} className="px-3 py-1.5 rounded-lg bg-slate-800/60 text-xs text-slate-300 hover:text-brand-300 flex items-center gap-1">
                      {copied === m.id + 'singbox' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />} sing-box
                    </button>
                    <button onClick={() => runTest(m)} disabled={testingId === m.id}
                      className={`p-2 rounded-lg bg-slate-800/60 ${testingId === m.id ? 'text-brand-300' : 'text-slate-400 hover:text-emerald-300'}`}>
                      {testingId === m.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
                    </button>
                    <a href={`/status/${m.token}`} target="_blank" rel="noopener" className="p-2 rounded-lg bg-slate-800/60 text-slate-400 hover:text-brand-300">
                      <Activity className="w-4 h-4" />
                    </a>
                    <button onClick={() => refreshUsage(m.id)} disabled={busy} className="p-2 rounded-lg bg-slate-800/60 text-slate-400 hover:text-brand-300">
                      <RefreshCw className="w-4 h-4" />
                    </button>
                    <button onClick={() => patch(m.id, { enabled: !m.enabled })}
                      className={`p-2 rounded-lg bg-slate-800/60 ${m.enabled ? 'text-emerald-400' : 'text-slate-500'} hover:text-white`}>
                      <Power className="w-4 h-4" />
                    </button>
                    <button onClick={async () => { await api(`/members/${m.id}`, { method: 'DELETE' }).catch(() => null); load() }}
                      className="p-2 rounded-lg bg-slate-800/60 text-slate-400 hover:text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                    <span>مصرف: {m.used_gb} GB {m.quota_gb ? `از ${m.quota_gb}` : '(نامحدود)'}</span>
                    {pct > 0 && <span className={pct > 90 ? 'text-red-400' : ''}>{Math.round(pct)}%</span>}
                  </div>
                  {m.quota_gb && (
                    <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${pct > 90 ? 'bg-red-500' : 'bg-brand-500'}`} style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-500 font-mono truncate mt-2" dir="ltr">{subUrl(m)}</p>
                {testResult?.id === m.id && (
                  <div className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 space-y-1.5">
                    {testResult.data.output_count > 0 ? (
                      <>
                        <p className="text-xs font-medium text-emerald-300">
                          ✅ {testResult.data.output_count} نود — {testResult.data.source_live ? 'زنده' : 'محلی'}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          منبع: {testResult.data.source_count} · TLS: {testResult.data.tls_nodes} · WS: {testResult.data.ws_nodes}
                        </p>
                      </>
                    ) : <p className="text-xs text-error-400">❌ نودی دریافت نشد</p>}
                    {testResult.data.warnings.map((w, i) => <p key={i} className="text-[11px] text-amber-300">⚠️ {w}</p>)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  async function patch(id: string, body: Record<string, unknown>) {
    await api(`/members/${id}`, { method: 'PATCH', body }).catch(() => null)
    await load()
  }
}
