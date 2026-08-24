import { useCallback, useEffect, useState } from 'react'
import { Users, Plus, Copy, Check, Trash2, Loader2, RefreshCw, Power, Activity, Zap, Pencil, X } from 'lucide-react'
import { api } from '../lib/api'
import { FRAGMENT_PRESETS, FM_PRESETS, CS_PRESETS, KNOWN_SNIS, CLIENT_FRAGMENT_PRESETS, CHAIN_PROTOCOLS } from '../../worker/presets'
import type { Deployment, WorkerMember } from '../lib/types'

const COUNTRIES = [
  { code: 'us', label: '🇺🇸 آمریکا' },
  { code: 'de', label: '🇩🇪 آلمان' },
  { code: 'nl', label: '🇳🇱 هلند' },
  { code: 'tr', label: '🇹🇷 ترکیه' },
  { code: 'ae', label: '🇦🇪 امارات' },
  { code: 'fi', label: '🇫🇮 مولتی' },
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
  customIps: string
  fragment: boolean
  preset: string
  fm: string
  cs: string
  fingerprint: string
  sniChoice: string // '' = custom, otherwise a KNOWN_SNIS entry or 'none'
  sniCustom: string
  hostMask: string
  sanctionsMode: string
  // EDT advanced
  proxyip: string
  chainProto: string
  chainCred: string
  ech: boolean
  ed0rtt: boolean
  randomPath: boolean
  fragmentClient: string
}

const EMPTY_FORM: FormState = {
  name: '', quotaGb: '', reqQuota: '', ipLimit: '', startOnConnect: false,
  resetDays: '', rotateMin: '', expires: '', transport: '', countries: [],
  customIps: '', fragment: false, preset: '', fm: '', cs: '',
  fingerprint: '', sniChoice: '', sniCustom: '', hostMask: '', sanctionsMode: '',
  proxyip: '', chainProto: '', chainCred: '', ech: false, ed0rtt: false, randomPath: false, fragmentClient: '',
}

function formToBody(f: FormState) {
  const sni = f.sniChoice === '' ? f.sniCustom.trim() : f.sniChoice === 'none' ? '' : f.sniChoice
  const chainProxy = f.chainProto && f.chainCred.trim() ? `${f.chainProto}://${f.chainCred.trim()}` : ''
  return {
    countries: f.countries,
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
  }
}

function memberToForm(m: WorkerMember): FormState {
  const s = m.settings
  const sni = s.custom_sni ?? ''
  return {
    name: m.name, quotaGb: m.quota_gb != null ? String(m.quota_gb) : '',
    reqQuota: m.request_quota != null ? String(m.request_quota) : '',
    ipLimit: m.ip_limit != null ? String(m.ip_limit) : '',
    startOnConnect: !!m.start_on_connect,
    resetDays: m.reset_period_days != null ? String(m.reset_period_days) : '',
    rotateMin: s.ip_rotation_minutes ? String(s.ip_rotation_minutes) : '',
    expires: m.expires_at ? m.expires_at.slice(0, 10) : '',
    transport: s.transport ?? '', countries: s.countries ?? [],
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
  }
}

function Field({ label, value, onChange, placeholder, type = 'text', textarea, rows = 2, guide }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; textarea?: boolean; rows?: number; guide?: string
}) {
  return (
    <label className="block" data-guide={guide}>
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

function Select({ label, value, onChange, options, guide }: {
  label: string; value: string; onChange: (v: string) => void; guide?: string
  options: { v: string; label: string }[]
}) {
  return (
    <label className="block" data-guide={guide}>
      <span className="text-xs text-slate-400 mb-1 block">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="input-field text-sm py-2 w-full" dir="ltr">
        {options.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
      </select>
    </label>
  )
}

function Toggle({ checked, onChange, label, guide }: { checked: boolean; onChange: () => void; label: string; guide?: string }) {
  return (
    <button onClick={onChange} data-guide={guide} className="flex items-center gap-2 text-sm text-slate-300">
      <span className={`w-9 h-5 rounded-full transition-colors relative ${checked ? 'bg-brand-500' : 'bg-slate-700'}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${checked ? 'right-0.5' : 'right-4.5'}`}
          style={{ right: checked ? '2px' : '18px' }} />
      </span>
      {label}
    </button>
  )
}

export default function Members() {
  const [deployments, setDeployments] = useState<Deployment[]>([])
  const [depId, setDepId] = useState('')
  const [members, setMembers] = useState<WorkerMember[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  // Form: shown for create (editingId = null) or edit (editingId = member id)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((p) => ({ ...p, [k]: v }))

  const [selected, setSelected] = useState<Set<string>>(new Set())

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
    setEditingId(m.id)
    setForm(memberToForm(m))
    setFormOpen(true)
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
    catch (e) { setError(e instanceof Error ? e.message : 'آمار در دسترس نیست (توکن باید دسترسی Analytics داشته باشد)') }
    setBusy(false)
  }

  const subUrl = (m: WorkerMember, clash = false) =>
    `${window.location.origin}/api/sub/member/${m.token}${clash ? '?target=clash' : ''}`

  const copy = async (m: WorkerMember, clash = false) => {
    await navigator.clipboard.writeText(subUrl(m, clash)).catch(() => null)
    setCopied(m.id + (clash ? '-c' : '')); setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="space-y-6">
      <div className="glass-card p-6">
        <div className="flex items-center gap-2 mb-2">
          <Users className="w-5 h-5 text-brand-400" />
          <h2 className="text-lg font-bold text-white">کاربران ورکر</h2>
        </div>
        <p className="text-sm text-slate-400">
          برای هر ورکر چند کاربر بسازید — هر کدام لینک ساب خصوصی و تنظیمات منحصربه‌فرد:
          کشور IP (آی‌پی واقعی و زنده از مخزن EDT)، ترنسپورت، فرگمنت و Cipher Suite،
          دور زدن تحریم با SNI یا WARP (باز کردن جمنی)، سقف حجم و انقضا.
        </p>
      </div>

      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <select value={depId} onChange={(e) => setDepId(e.target.value)} data-guide="m-worker-select" className="input-field text-sm py-2 min-w-[220px]">
            <option value="">انتخاب ورکر...</option>
            {deployments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          {depId && (
            <button onClick={quickCreate} disabled={busy} data-guide="m-quick-create" title="ساخت کاربر با تنظیمات پیش‌فرض، بدون فرم"
              className="btn-secondary text-sm px-3 py-2 flex items-center gap-1.5">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 text-amber-400" />}
              ساخت سریع کاربر
            </button>
          )}
          {depId && !formOpen && (
            <button onClick={() => { setEditingId(null); setForm(EMPTY_FORM); setFormOpen(true) }} data-guide="m-advanced-create"
              className="btn-primary text-sm px-3 py-2 flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> کاربر پیشرفته
            </button>
          )}
        </div>

        {depId && formOpen && (
          <div className="space-y-3 border border-slate-800 rounded-xl p-4 bg-slate-900/40">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-white">
                {editingId ? '✏️ ویرایش کاربر — تغییرات بعد از ذخیره فوراً روی ساب اعمال می‌شود' : 'کاربر جدید (پیشرفته)'}
              </p>
              <button onClick={() => { setFormOpen(false); setEditingId(null); setForm(EMPTY_FORM) }}
                className="p-1.5 rounded-lg text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="نام (مثلاً علی یا US-User)" value={form.name} onChange={(v) => set('name', v)} placeholder="علی" guide="m-name" />
              <Field label="سقف حجم ماهانه (گیگ — خالی = بی‌نهایت)" value={form.quotaGb} onChange={(v) => set('quotaGb', v)} placeholder="50" guide="m-quota" />
              <Field label="سقف درخواست ماهانه (خالی = بی‌نهایت)" value={form.reqQuota} onChange={(v) => set('reqQuota', v)} placeholder="100000" guide="m-req-quota" />
              <Field label="حداکثر دستگاه همزمان (خالی = بی‌نهایت)" value={form.ipLimit} onChange={(v) => set('ipLimit', v)} placeholder="2" guide="m-ip-limit" />
              <div className="flex items-end">
                <Toggle checked={form.startOnConnect} onChange={() => set('startOnConnect', !form.startOnConnect)} label="شمارش از اولین اتصال" guide="m-start-on-connect" />
              </div>
              <Field label="ریست خودکار هر N روز (خالی = خاموش)" value={form.resetDays} onChange={(v) => set('resetDays', v)} placeholder="30" guide="m-reset-days" />
              <Field label="چرخش خودکار IP هر N دقیقه (خالی = خاموش)" value={form.rotateMin} onChange={(v) => set('rotateMin', v)} placeholder="30" guide="m-rotate-min" />
              <Field label="تاریخ انقضا (خالی = بی‌نهایت)" value={form.expires} onChange={(v) => set('expires', v)} type="date" guide="m-expires" />
              <Select label="ترنسپورت" value={form.transport} onChange={(v) => set('transport', v)} options={TRANSPORTS} guide="m-transport" />
              <Select label="دور زدن تحریم (جمنی/OpenAI)" value={form.sanctionsMode} onChange={(v) => set('sanctionsMode', v)} options={SANCTIONS_MODES} guide="m-sanctions" />
            </div>
            <div data-guide="m-countries">
              <span className="text-xs text-slate-400 mb-1 block">کشور IP — IP واقعی و تست‌شده، زنده از مخزن EDT بارگیری می‌شود</span>
              <div className="flex items-center gap-2 flex-wrap">
                {COUNTRIES.map((c) => (
                  <button key={c.code}
                    onClick={() => set('countries', form.countries.includes(c.code) ? form.countries.filter((x) => x !== c.code) : [...form.countries, c.code])}
                    className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${form.countries.includes(c.code) ? 'bg-brand-500/20 text-brand-300 border-brand-500/40' : 'bg-slate-800/50 text-slate-400 border-slate-700/50 hover:text-white'}`}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <Field label="IPهای سفارشی ثابت (هر خط یک IP — اولویت با این‌هاست)" value={form.customIps} onChange={(v) => set('customIps', v)} placeholder="104.16.1.1" guide="m-custom-ips" />
            <div className="flex items-center gap-5 flex-wrap">
              <Toggle checked={form.fragment} onChange={() => set('fragment', !form.fragment)} label="فرگمنت (TLS split — ضد DPI)" guide="m-fragment" />
            </div>
            {form.fragment && (
              <div className="space-y-3">
                <label className="block max-w-xs" data-guide="m-isp-preset">
                  <span className="text-xs text-slate-400 mb-1 block">پریست اپراتور (روی تنظیم دستی اولویت دارد)</span>
                  <select value={form.preset} onChange={(e) => set('preset', e.target.value)} className="input-field text-sm py-2 w-full">
                    <option value="">دستی / پیش‌فرض</option>
                    {FRAGMENT_PRESETS.map((p) => <option key={p.code} value={p.code}>{p.flag} {p.label}</option>)}
                  </select>
                </label>
                <div className="flex gap-1.5 flex-wrap">
                  {FM_PRESETS.map((p) => (
                    <button key={p.code} onClick={() => set('fm', p.json)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800/60 text-[11px] text-slate-300 hover:text-brand-300 hover:bg-brand-600/20 border border-slate-700 transition-colors">
                      ⚡ {p.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="فرگمنت JSON — fm= (عیناً تزریق می‌شود)" value={form.fm} onChange={(v) => set('fm', v)}
                    placeholder='{"tcp":[{"type":"fragment",...}]}' textarea rows={3} guide="m-fm" />
                  <Field label="Cipher Suiteها — cs= (عیناً تزریق می‌شود)" value={form.cs} onChange={(v) => set('cs', v)}
                    placeholder="TLS_AES_256_GCM_SHA384:..." textarea rows={3} guide="m-cs" />
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {CS_PRESETS.map((p) => (
                    <button key={p.code} onClick={() => set('cs', p.value)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800/60 text-[11px] text-slate-300 hover:text-emerald-300 hover:bg-emerald-600/20 border border-slate-700 transition-colors">
                      🔐 {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Select label="اثرانگشت ClientHello (fp)" value={form.fingerprint} onChange={(v) => set('fingerprint', v)} guide="m-fingerprint"
                options={[
                  { v: '', label: 'پیش‌فرض ورکر' },
                  ...['chrome', 'firefox', 'safari', 'ios', 'android', 'edge', 'randomized', 'unsafe'].map((f) => ({ v: f, label: f })),
                ]} />
              <Select label="SNI واقعی (تست‌شده — ماسک TLS)" value={form.sniChoice} onChange={(v) => set('sniChoice', v)} guide="m-sni"
                options={[
                  { v: 'none', label: 'پیش‌فرض ورکر' },
                  ...KNOWN_SNIS.map((s) => ({ v: s, label: s })),
                  { v: '', label: 'سفارشی...' },
                ]} />
              {form.sniChoice === '' && (
                <Field label="SNI سفارشی" value={form.sniCustom} onChange={(v) => set('sniCustom', v)} placeholder="example.com" />
              )}
              {form.sniChoice !== '' && <div />}
            </div>
            <Field label="Host سفارشی (ماسک)" value={form.hostMask} onChange={(v) => set('hostMask', v)} placeholder="example.com" guide="m-host" />
            {form.fragment && (
              <div className="sm:col-span-3" data-guide="m-client-fragment">
                <span className="text-xs text-slate-400 mb-1 block">فرگمنت مخصوص کلاینت (فرمت edgetunnel — جایگزین fm می‌شود)</span>
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
            )}
            {/* ── edgetunnel advanced per-member params ── */}
            <div className="sm:col-span-3 border-t border-slate-800 pt-3 mt-1">
              <p className="text-xs font-medium text-slate-300 mb-2">⚙️ تنظیمات پیشرفته edgetunnel — مستقیم روی ورکر اعمال می‌شود (پارامترهای URL)</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="ProxyIP اختصاصی (خروجی ورکر از IP دیگر)" value={form.proxyip} onChange={(v) => set('proxyip', v)} placeholder="1.2.3.4 یا domain:port" guide="m-proxyip" />
                <label className="block" data-guide="m-chain-proto">
                  <span className="text-xs text-slate-400 mb-1 block">پروتکل زنجیره (Chain Proxy)</span>
                  <select value={form.chainProto} onChange={(e) => set('chainProto', e.target.value)} className="input-field text-sm py-2 w-full" dir="ltr">
                    <option value="">خاموش</option>
                    {CHAIN_PROTOCOLS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </label>
                {form.chainProto && (
                  <Field label={`اعتبار ${form.chainProto} (user:pass@host:port)`} value={form.chainCred} onChange={(v) => set('chainCred', v)} placeholder="user:pass@1.2.3.4:1080" guide="m-chain-cred" />
                )}
              </div>
              <div className="flex items-center gap-5 flex-wrap mt-3">
                <Toggle checked={form.ech} onChange={() => set('ech', !form.ech)} label="ECH (TLS رمزنگاری SNI)" guide="m-ech" />
                <Toggle checked={form.ed0rtt} onChange={() => set('ed0rtt', !form.ed0rtt)} label="0-RTT (ed=2560)" guide="m-ed0rtt" />
                <Toggle checked={form.randomPath} onChange={() => set('randomPath', !form.randomPath)} label="مسیر تصادفی (ضد DPI)" guide="m-random-path" />
              </div>
            </div>
            {error && <p className="text-sm text-error-400">{error}</p>}
            <div className="flex gap-2">
              <button onClick={saveForm} disabled={busy} data-guide="m-save" className="btn-primary flex items-center gap-2 text-sm">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : editingId ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                {editingId ? 'ذخیره تغییرات' : 'ساخت کاربر'}
              </button>
              <button onClick={() => { setFormOpen(false); setEditingId(null); setForm(EMPTY_FORM) }}
                className="btn-secondary text-sm">انصراف</button>
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
              <button onClick={() => bulk('enable')} disabled={busy} className="btn-secondary text-xs px-3 py-1.5">فعال‌سازی</button>
              <button onClick={() => bulk('disable')} disabled={busy} className="btn-secondary text-xs px-3 py-1.5">غیرفعال</button>
              <button onClick={() => bulk('reset_quota')} disabled={busy} className="btn-secondary text-xs px-3 py-1.5">ریست سهمیه</button>
              <button onClick={() => bulk('reset_time')} disabled={busy} className="btn-secondary text-xs px-3 py-1.5">ریست زمان</button>
              <button onClick={() => bulk('delete')} disabled={busy}
                className="text-xs px-3 py-1.5 rounded-lg bg-error-500/15 border border-error-500/30 text-error-400 hover:bg-error-500/25">حذف</button>
            </>}
          </div>
          {members.map((m) => {
            const pct = m.quota_gb ? Math.min(100, (m.used_gb / m.quota_gb) * 100) : 0
            const expired = m.expires_at && m.expires_at < new Date().toISOString()
            return (
              <div key={m.id} className={`glass-card p-5 ${!m.enabled || expired ? 'opacity-60' : ''}`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggleSel(m.id)}
                      className="w-4 h-4 accent-brand-500" />
                    <div>
                      <p className="text-white font-medium">{m.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {m.settings.countries.map((c) => COUNTRIES.find((x) => x.code === c)?.label ?? c).join('، ') || 'IP پیش‌فرض'}
                        {m.settings.transport ? ` · ${m.settings.transport}` : ''}
                        {m.settings.fragment ? ' · فرگمنت' : ''}
                        {m.settings.sanctions_mode === 'warp' ? ' · WARP' : m.settings.sanctions_mode === 'sni' || m.settings.bypass_sanctions ? ' · ضدتحریم' : ''}
                        {expired ? ' · منقضی' : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(m)} data-guide="m-row-edit" title="ویرایش تنظیمات"
                      className="p-2 rounded-lg bg-slate-800/60 text-slate-400 hover:text-brand-300 flex items-center">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => copy(m)} data-guide="m-row-sub" className="px-3 py-1.5 rounded-lg bg-slate-800/60 text-xs text-slate-300 hover:text-brand-300 flex items-center gap-1">
                      {copied === m.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />} ساب
                    </button>
                    <button onClick={() => copy(m, true)} data-guide="m-row-clash" className="px-3 py-1.5 rounded-lg bg-slate-800/60 text-xs text-slate-300 hover:text-brand-300 flex items-center gap-1">
                      {copied === m.id + '-c' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />} Clash
                    </button>
                    <a href={`/status/${m.token}`} target="_blank" rel="noopener" data-guide="m-row-status" title="صفحه وضعیت + QR + افزودن به کلاینت"
                      className="p-2 rounded-lg bg-slate-800/60 text-slate-400 hover:text-brand-300 flex items-center">
                      <Activity className="w-4 h-4" />
                    </a>
                    <button onClick={() => refreshUsage(m.id)} disabled={busy} data-guide="m-row-usage" title="به‌روزرسانی مصرف"
                      className="p-2 rounded-lg bg-slate-800/60 text-slate-400 hover:text-brand-300">
                      <RefreshCw className="w-4 h-4" />
                    </button>
                    <button onClick={() => patch(m.id, { enabled: !m.enabled })} data-guide="m-row-power" title={m.enabled ? 'غیرفعال کردن' : 'فعال کردن'}
                      className={`p-2 rounded-lg bg-slate-800/60 ${m.enabled ? 'text-emerald-400' : 'text-slate-500'} hover:text-white`}>
                      <Power className="w-4 h-4" />
                    </button>
                    <button onClick={async () => { await api(`/members/${m.id}`, { method: 'DELETE' }).catch(() => null); load() }} data-guide="m-row-delete"
                      className="p-2 rounded-lg bg-slate-800/60 text-slate-400 hover:text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                    <span>مصرف: {m.used_gb} GB {m.quota_gb ? `از ${m.quota_gb} GB` : '(بی‌نهایت)'}</span>
                    {pct > 0 && <span className={pct > 90 ? 'text-red-400' : ''}>{Math.round(pct)}%</span>}
                  </div>
                  {m.quota_gb && (
                    <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${pct > 90 ? 'bg-red-500' : 'bg-brand-500'}`} style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-500 font-mono truncate mt-2" dir="ltr">{subUrl(m)}</p>
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
