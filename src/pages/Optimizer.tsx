import { useCallback, useEffect, useState } from 'react'
import { Zap, Play, Copy, Trash2, RefreshCw, Check, Syringe } from 'lucide-react'
import { api, API_BASE } from '../lib/api'
import type { OptimizerJob, OptimizerNode, InjectedSub } from '../lib/types'

const statusLabel: Record<OptimizerJob['status'], string> = {
  pending: 'در صف',
  running: 'در حال تست',
  done: 'تکمیل شد',
  failed: 'ناموفق',
}

export default function Optimizer() {
  const [name, setName] = useState('')
  const [input, setInput] = useState('')
  const [jobs, setJobs] = useState<OptimizerJob[]>([])
  const [detail, setDetail] = useState<OptimizerJob | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  // ── Injection (miliconfig custom sub) ──
  const [injName, setInjName] = useState('')
  const [injSource, setInjSource] = useState('')
  const [injRotate, setInjRotate] = useState('')
  const [injIps, setInjIps] = useState('')
  const [injProxies, setInjProxies] = useState('')
  const [injections, setInjections] = useState<InjectedSub[]>([])
  const [injBusy, setInjBusy] = useState(false)
  const [injError, setInjError] = useState<string | null>(null)

  const loadInjections = useCallback(async () => {
    try {
      const { data } = await api<{ data: InjectedSub[] }>('/injector')
      setInjections(data ?? [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadInjections() }, [loadInjections])

  const runInjection = async () => {
    if (!injSource.trim()) { setInjError('منبع را وارد کنید'); return }
    setInjBusy(true); setInjError(null)
    try {
      const ips = injIps.split(/[\n,]/).map((l) => l.trim()).filter(Boolean).map((l) => {
        const [ip, port] = l.split(':')
        return port ? { ip, port: Number(port) } : { ip }
      })
      const proxies = injProxies.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
        const m = l.match(/^(https?|socks5):\/\/(?:([^:@]+)(?::([^@]*))?@)?([^:/]+):(\d+)$/i)
        if (!m) return null
        return {
          type: m[1].toLowerCase() === 'socks5' ? 'socks5' : 'http',
          server: m[4], port: Number(m[5]),
          ...(m[2] ? { username: m[2] } : {}), ...(m[3] ? { password: m[3] } : {}),
        }
      }).filter(Boolean)
      await api('/injector', { method: 'POST', body: { name: injName.trim(), source: injSource.trim(), ips, proxies, rotate_minutes: injRotate ? Number(injRotate) : null } })
      setInjSource(''); setInjIps(''); setInjProxies(''); setInjName('')
      await loadInjections()
    } catch (e) {
      setInjError(e instanceof Error ? e.message : 'خطا در ساخت')
    }
    setInjBusy(false)
  }

  const load = useCallback(async () => {
    try {
      const { data } = await api<{ data: OptimizerJob[] }>('/optimizer')
      setJobs(data ?? [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    load()
    // Poll while any job is pending/running.
    const t = setInterval(() => {
      if (jobs.some((j) => j.status === 'pending' || j.status === 'running')) load()
    }, 3000)
    return () => clearInterval(t)
  }, [load, jobs])

  const run = async () => {
    if (!input.trim()) { setError('لینک ساب یا کانفیگ‌ها را وارد کنید'); return }
    setBusy(true); setError(null)
    try {
      await api('/optimizer', { method: 'POST', body: { name: name.trim(), input: input.trim() } })
      setInput(''); setName('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در اجرا')
    } finally {
      setBusy(false)
    }
  }

  const openDetail = async (id: string) => {
    try {
      const { data } = await api<{ data: OptimizerJob }>(`/optimizer/${id}`)
      setDetail(data)
    } catch { /* ignore */ }
  }

  const remove = async (id: string) => {
    await api(`/optimizer/${id}`, { method: 'DELETE' }).catch(() => null)
    if (detail?.id === id) setDetail(null)
    load()
  }

  const copy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text).catch(() => null)
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }

  const subUrl = (token: string) => `${window.location.origin}${API_BASE}/sub/opt/${token}`

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
          <Zap className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">بهینه‌ساز کانفیگ</h1>
          <p className="text-sm text-slate-500">کانفیگ‌ها را واقعاً تست می‌کند، مرده‌ها را حذف و سالم‌ها را بر اساس تأخیر مرتب می‌کند</p>
        </div>
      </div>

      {/* Run form */}
      <div className="card p-5 space-y-4">
        <div>
          <label className="text-sm text-slate-400 mb-1 block">نام (اختیاری)</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً ساب اصلی من" className="input-field" />
        </div>
        <div>
          <label className="text-sm text-slate-400 mb-1 block">لینک ساب یا کانفیگ‌ها (vless / vmess / trojan / ss)</label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={6}
            dir="ltr"
            placeholder={'https://example.com/sub\nvless://...\nvmess://...'}
            className="input-field font-mono text-xs"
          />
        </div>
        {error && <p className="text-sm text-error-400">{error}</p>}
        <button onClick={run} disabled={busy} className="btn-primary w-full flex items-center justify-center gap-2">
          <Play className="w-4 h-4" />
          {busy ? 'در حال ارسال...' : 'شروع بهینه‌سازی'}
        </button>
      </div>

      {/* Jobs list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">تاریخچه</h2>
          <button onClick={load} className="p-2 rounded-lg bg-slate-800/60 text-slate-400 hover:text-white">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {jobs.length === 0 && (
          <p className="text-sm text-slate-500 text-center py-8">هنوز بهینه‌سازی‌ای انجام نشده</p>
        )}

        {jobs.map((job) => (
          <div key={job.id} className="card p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-white font-medium truncate">{job.name}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {job.status === 'done' && `${job.nodes_alive} سالم از ${job.nodes_total} نود`}
                  {job.status === 'running' && 'در حال تست نودها...'}
                  {job.status === 'pending' && 'در صف اجرا...'}
                  {job.status === 'failed' && (job.error_message ?? 'ناموفق')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                  job.status === 'done' ? 'bg-emerald-500/15 text-emerald-400' :
                  job.status === 'failed' ? 'bg-red-500/15 text-red-400' :
                  'bg-amber-500/15 text-amber-400 animate-pulse'
                }`}>
                  {statusLabel[job.status]}
                </span>
                {job.status === 'done' && job.nodes_alive > 0 && (
                  <>
                    <button onClick={() => copy(subUrl(job.sub_token), job.id)} className="p-2 rounded-lg bg-slate-800/60 text-slate-400 hover:text-brand-300" title="کپی لینک ساب بهینه">
                      {copied === job.id ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <button onClick={() => openDetail(job.id)} className="text-xs px-3 py-2 rounded-lg bg-brand-600/20 text-brand-300 hover:bg-brand-600/30">
                      نودها
                    </button>
                  </>
                )}
                <button onClick={() => remove(job.id)} className="p-2 rounded-lg bg-slate-800/60 text-slate-400 hover:text-red-400">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            {job.status === 'done' && job.nodes_alive > 0 && (
              <p className="text-xs text-slate-500 mt-3 font-mono truncate" dir="ltr">{subUrl(job.sub_token)}</p>
            )}
          </div>
        ))}
      </div>

      {/* ── Injection: preferred IPs + HTTP/SOCKS5 chains ── */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Syringe className="w-5 h-5 text-brand-400" />
          <div>
            <h2 className="text-lg font-semibold text-white">تزریق IP و پروکسی — ساب سفارشی miliconfig</h2>
            <p className="text-xs text-slate-500">آی‌پی‌های اسکن‌شده ورودی نودها را ثابت می‌کنند و پروکسی‌های HTTP/SOCKS5 به‌صورت زنجیره خروجی ثابت (dialer-proxy در Clash Meta) اضافه می‌شوند</p>
          </div>
        </div>

        <div>
          <label className="text-sm text-slate-400 mb-1 block">منبع — لینک ساب یا کانفیگ‌ها</label>
          <textarea value={injSource} onChange={(e) => setInjSource(e.target.value)} rows={3} dir="ltr"
            placeholder={'https://example.com/sub\nvless://...'} className="input-field font-mono text-xs" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-slate-400 mb-1 block">IPهای ترجیحی (هر خط یکی — از اسکنر کپی کنید)</label>
            <textarea value={injIps} onChange={(e) => setInjIps(e.target.value)} rows={3} dir="ltr"
              placeholder={'104.16.0.1\n172.64.0.1:2053'} className="input-field font-mono text-xs" />
          </div>
          <div>
            <label className="text-sm text-slate-400 mb-1 block">پروکسی‌های خروجی (هر خط یکی — خروجی ثابت نود)</label>
            <textarea value={injProxies} onChange={(e) => setInjProxies(e.target.value)} rows={3} dir="ltr"
              placeholder={'socks5://user:pass@1.2.3.4:1080\nhttp://5.6.7.8:8080'} className="input-field font-mono text-xs" />
            <p className="text-[11px] text-slate-500 mt-1">خروجی Clash Meta با زنجیره نود ← پروکسی ساخته می‌شود</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input value={injName} onChange={(e) => setInjName(e.target.value)} placeholder="نام (اختیاری)" className="input-field text-sm flex-1 min-w-[160px]" />
          <input value={injRotate} onChange={(e) => setInjRotate(e.target.value)} placeholder="چرخش IP (دقیقه)" className="input-field text-sm w-[140px]" />
          <button onClick={runInjection} disabled={injBusy} className="btn-primary text-sm flex items-center gap-2">
            <Syringe className="w-4 h-4" />{injBusy ? 'در حال ساخت...' : 'ساخت ساب تزریق‌شده'}
          </button>
        </div>
        {injError && <p className="text-sm text-error-400">{injError}</p>}

        {injections.length > 0 && (
          <div className="space-y-2 pt-2">
            {injections.map((inj) => {
              const subUrl = `${window.location.origin}${API_BASE}/sub/inject/${inj.sub_token}`
              const clashUrl = `${subUrl}?target=clash`
              return (
                <div key={inj.id} className="p-3 rounded-xl bg-slate-900/40 border border-slate-800">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm text-white font-medium">{inj.name}</p>
                      <p className="text-xs text-slate-500">{inj.ips.length} IP · {inj.proxies.length} پروکسی</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => copy(subUrl, inj.id)} className="px-3 py-1.5 rounded-lg bg-slate-800/60 text-xs text-slate-300 hover:text-brand-300 flex items-center gap-1">
                        {copied === inj.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />} ساب
                      </button>
                      <button onClick={() => copy(clashUrl, inj.id + '-c')} className="px-3 py-1.5 rounded-lg bg-slate-800/60 text-xs text-slate-300 hover:text-brand-300 flex items-center gap-1">
                        {copied === inj.id + '-c' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />} Clash
                      </button>
                      <button onClick={async () => { await api(`/injector/${inj.id}`, { method: 'DELETE' }).catch(() => null); loadInjections() }} className="p-2 rounded-lg bg-slate-800/60 text-slate-400 hover:text-red-400">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 font-mono truncate mt-2" dir="ltr">{subUrl}</p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Node latency detail */}
      {detail && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white">نودهای سالم — {detail.name}</h3>
            <button onClick={() => setDetail(null)} className="text-xs text-slate-500 hover:text-white">بستن</button>
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {(detail.result_nodes ?? []).map((n: OptimizerNode, i: number) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-900/60 border border-slate-800">
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{n.name}</p>
                  <p className="text-xs text-slate-500 font-mono" dir="ltr">{n.proto} · {n.host}:{n.port}</p>
                </div>
                <span className={`text-xs font-bold px-2 py-1 rounded-md ${
                  n.latencyMs < 300 ? 'bg-emerald-500/15 text-emerald-400' :
                  n.latencyMs < 1000 ? 'bg-amber-500/15 text-amber-400' :
                  'bg-red-500/15 text-red-400'
                }`}>
                  {n.latencyMs}ms
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
