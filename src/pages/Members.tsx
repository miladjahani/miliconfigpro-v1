import { useCallback, useEffect, useState } from 'react'
import { Users, Plus, Copy, Check, Trash2, Loader2, RefreshCw, Power } from 'lucide-react'
import { api } from '../lib/api'
import { FRAGMENT_PRESETS } from '../../worker/presets'
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

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button onClick={onChange} className="flex items-center gap-2 text-sm text-slate-300">
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

  // new-member form
  const [name, setName] = useState('')
  const [countries, setCountries] = useState<string[]>([])
  const [customIps, setCustomIps] = useState('')
  const [transport, setTransport] = useState('')
  const [fragment, setFragment] = useState(false)
  const [preset, setPreset] = useState('')
  const [fm, setFm] = useState('')
  const [cs, setCs] = useState('')
  const [fingerprint, setFingerprint] = useState('')
  const [sniMask, setSniMask] = useState('')
  const [hostMask, setHostMask] = useState('')
  const [ipLimit, setIpLimit] = useState('')
  const [startOnConnect, setStartOnConnect] = useState(false)
  const [resetDays, setResetDays] = useState('')
  const [rotateMin, setRotateMin] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bypass, setBypass] = useState(false)
  const [quotaGb, setQuotaGb] = useState('')
  const [reqQuota, setReqQuota] = useState('')
  const [expires, setExpires] = useState('')

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

  const create = async () => {
    if (!depId) { setError('اول یک ورکر انتخاب کنید'); return }
    setBusy(true); setError(null)
    try {
      await api('/members', {
        method: 'POST',
        body: {
          deployment_id: depId,
          name: name.trim(),
          countries,
          custom_ips: customIps.split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
          transport,
          fragment,
          fragment_preset: preset,
          fragment_config: {
            ...(fm.trim() ? { fm: fm.trim() } : {}),
            ...(cs.trim() ? { cs: cs.trim() } : {}),
          },
          fingerprint,
          custom_sni: sniMask.trim(),
          custom_host: hostMask.trim(),
          bypass_sanctions: bypass,
          ip_rotation_minutes: rotateMin ? Number(rotateMin) : 0,
          quota_gb: quotaGb ? Number(quotaGb) : null,
          request_quota: reqQuota ? Number(reqQuota) : null,
          ip_limit: ipLimit ? Number(ipLimit) : null,
          start_on_connect: startOnConnect,
          reset_period_days: resetDays ? Number(resetDays) : null,
          expires_at: expires ? new Date(expires).toISOString() : null,
        },
      })
      setName(''); setCountries([]); setCustomIps(''); setQuotaGb(''); setReqQuota(''); setIpLimit(''); setExpires(''); setStartOnConnect(false); setResetDays(''); setRotateMin(''); setSelected(new Set()); setFm(''); setCs(''); setFingerprint(''); setSniMask(''); setHostMask('')
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'خطا') }
    setBusy(false)
  }

  const patch = async (id: string, body: Record<string, unknown>) => {
    await api(`/members/${id}`, { method: 'PATCH', body }).catch(() => null)
    await load()
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
          برای هر ورکر، چند کاربر بسازید — هر کدام لینک ساب خصوصی و تنظیمات منحصربه‌فرد:
          کشور IP، ترنسپورت (ws/gRPC/HTTPUpgrade)، فرگمنت، دور زدن تحریم، سقف حجم ماهانه و تاریخ انقضا.
          ساب هر کاربر در لحظهٔ fetch ساخته می‌شود و همیشه به‌روز است.
        </p>
      </div>

      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <select value={depId} onChange={(e) => setDepId(e.target.value)} className="input-field text-sm py-2 min-w-[220px]">
            <option value="">انتخاب ورکر...</option>
            {deployments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>

        {depId && (
          <div className="space-y-3 border border-slate-800 rounded-xl p-4 bg-slate-900/40">
            <p className="text-sm font-medium text-white">کاربر جدید</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="نام (مثلاً علی یا US-User)" value={name} onChange={setName} placeholder="علی" />
              <Field label="سقف حجم ماهانه (گیگ — خالی = بی‌نهایت)" value={quotaGb} onChange={setQuotaGb} placeholder="50" />
              <Field label="سقف درخواست ماهانه (خالی = بی‌نهایت)" value={reqQuota} onChange={setReqQuota} placeholder="100000" />
              <Field label="حداکثر دستگاه همزمان (خالی = بی‌نهایت)" value={ipLimit} onChange={setIpLimit} placeholder="2" />
              <div className="flex items-end">
                <Toggle checked={startOnConnect} onChange={() => setStartOnConnect(!startOnConnect)} label="شمارش از اولین اتصال" />
              </div>
              <Field label="ریست خودکار هر N روز (خالی = خاموش)" value={resetDays} onChange={setResetDays} placeholder="30" />
              <Field label="چرخش خودکار IP هر N دقیقه (خالی = خاموش)" value={rotateMin} onChange={setRotateMin} placeholder="30" />
              <Field label="تاریخ انقضا (خالی = بی‌نهایت)" value={expires} onChange={setExpires} type="date" />
              <label className="block">
                <span className="text-xs text-slate-400 mb-1 block">ترنسپورت</span>
                <select value={transport} onChange={(e) => setTransport(e.target.value)} className="input-field text-sm py-2 w-full" dir="ltr">
                  {TRANSPORTS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
                </select>
              </label>
            </div>
            <div>
              <span className="text-xs text-slate-400 mb-1 block">کشور IP (چندگزینه‌ای)</span>
              <div className="flex items-center gap-2 flex-wrap">
                {COUNTRIES.map((c) => (
                  <button key={c.code} onClick={() => setCountries((p) => p.includes(c.code) ? p.filter((x) => x !== c.code) : [...p, c.code])}
                    className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${countries.includes(c.code) ? 'bg-brand-500/20 text-brand-300 border-brand-500/40' : 'bg-slate-800/50 text-slate-400 border-slate-700/50 hover:text-white'}`}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <Field label="IPهای سفارشی (هر خط یک IP)" value={customIps} onChange={setCustomIps} placeholder="104.16.1.1" />
            <div className="flex items-center gap-5 flex-wrap">
              <Toggle checked={fragment} onChange={() => setFragment(!fragment)} label="فرگمنت (TLS split — ضد DPI)" />
              <Toggle checked={bypass} onChange={() => setBypass(!bypass)} label="دور زدن تحریم (SNI جایگزین)" />
            </div>
            {fragment && (
              <div className="space-y-3">
                <label className="block max-w-xs">
                  <span className="text-xs text-slate-400 mb-1 block">پریست اپراتور (روی تنظیم دستی اولویت دارد)</span>
                  <select value={preset} onChange={(e) => setPreset(e.target.value)} className="input-field text-sm py-2 w-full">
                    <option value="">دستی / پیش‌فرض</option>
                    {FRAGMENT_PRESETS.map((p) => <option key={p.code} value={p.code}>{p.flag} {p.label}</option>)}
                  </select>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="فرگمنت JSON — fm= (عیناً تزریق می‌شود)" value={fm} onChange={setFm}
                    placeholder='{"enabled":true,...}' textarea rows={3} />
                  <Field label="Cipher Suiteها — cs= (عیناً تزریق می‌شود)" value={cs} onChange={setCs}
                    placeholder="TLS_AES_128_GCM_SHA256,TLS_CHACHA20..." textarea rows={3} />
                </div>
                <p className="text-xs text-slate-500">مقادیر fm و cs بدون هیچ تغییری داخل لینک نهایی قرار می‌گیرند — همان کانفیگی که دستی جواب می‌دهد اینجا هم دقیقاً همان خروجی را دارد.</p>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="block">
                <span className="text-xs text-slate-400 mb-1 block">اثرانگشت ClientHello (fp)</span>
                <select value={fingerprint} onChange={(e) => setFingerprint(e.target.value)} className="input-field text-sm py-2 w-full" dir="ltr">
                  <option value="">پیش‌فرض ورکر</option>
                  {['chrome', 'firefox', 'safari', 'ios', 'android', 'edge', 'randomized', 'unsafe'].map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </label>
              <Field label="SNI سفارشی (ماسک)" value={sniMask} onChange={setSniMask} placeholder="www.speedtest.net" />
              <Field label="Host سفارشی (ماسک)" value={hostMask} onChange={setHostMask} placeholder="example.com" />
            </div>
            {error && <p className="text-sm text-error-400">{error}</p>}
            <button onClick={create} disabled={busy} className="btn-primary flex items-center gap-2 text-sm">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              ساخت کاربر
            </button>
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
                    <p className="text-white font-medium">{m.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {m.settings.countries.map((c) => COUNTRIES.find((x) => x.code === c)?.label ?? c).join('، ') || 'IP پیش‌فرض'}
                      {m.settings.transport ? ` · ${m.settings.transport}` : ''}
                      {m.settings.fragment ? ' · فرگمنت' : ''}
                      {m.settings.bypass_sanctions ? ' · ضدتحریم' : ''}
                      {expired ? ' · منقضی' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => copy(m)} className="px-3 py-1.5 rounded-lg bg-slate-800/60 text-xs text-slate-300 hover:text-brand-300 flex items-center gap-1">
                      {copied === m.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />} ساب
                    </button>
                    <button onClick={() => copy(m, true)} className="px-3 py-1.5 rounded-lg bg-slate-800/60 text-xs text-slate-300 hover:text-brand-300 flex items-center gap-1">
                      {copied === m.id + '-c' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />} Clash
                    </button>
                    <button onClick={() => refreshUsage(m.id)} disabled={busy} title="به‌روزرسانی مصرف"
                      className="p-2 rounded-lg bg-slate-800/60 text-slate-400 hover:text-brand-300">
                      <RefreshCw className="w-4 h-4" />
                    </button>
                    <button onClick={() => patch(m.id, { enabled: !m.enabled })} title={m.enabled ? 'غیرفعال کردن' : 'فعال کردن'}
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
}
