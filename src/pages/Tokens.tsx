import { useEffect, useState, useCallback } from 'react'
import { api } from '../lib/api'
import type { CFToken } from '../lib/types'
import {
  KeyRound,
  Plus,
  Trash2,
  Loader2,
  Copy,
  Check,
  Eye,
  EyeOff,
  ShieldCheck,
  X,
  ExternalLink,
  Mail,
  Cloud,
  Sparkles,
  Wand2,
} from 'lucide-react'

const CF_TOKENS_PAGE = 'https://dash.cloudflare.com/profile/api-tokens'

// Permission keys for the prefill URL — Cloudflare accepts simple key/type pairs,
// no need to fetch permission group IDs from the API.
// 12+ permissions — all with read+edit where applicable, zone-scoped where relevant.
// This ensures the token never hits a permission error when deploying or managing workers.
const CF_PERM_KEYS = [
  { key: 'workers_scripts', type: 'edit' },
  { key: 'workers_kv_storage', type: 'edit' },
  { key: 'workers_routes', type: 'edit' },
  { key: 'page', type: 'edit' },
  { key: 'dns', type: 'edit' },
  { key: 'zone', type: 'read' },
  { key: 'dns_records', type: 'edit' },
  { key: 'ssl_and_certificate', type: 'edit' },
  { key: 'cache_purge', type: 'edit' },
  { key: 'user_details', type: 'read' },
  { key: 'account', type: 'read' },
  { key: 'workers_tail', type: 'read' },
  { key: 'd1', type: 'edit' }, // needed by D1-backed worker sources (e.g. misub_d1)
]

function buildPrefillUrl(): string {
  const keysParam = encodeURIComponent(JSON.stringify(CF_PERM_KEYS))
  return `${CF_TOKENS_PAGE}?permissionGroupKeys=${keysParam}&accountId=*&zoneId=all&name=Miliconfig-Pro`
}

export default function Tokens() {
  const [tokens, setTokens] = useState<CFToken[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newToken, setNewToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    try {
      const { data } = await api<{ data: CFToken[] }>('/tokens')
      setTokens(data ?? [])
    } catch {
      setTokens([])
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api('/tokens', { method: 'POST', body: { name: newName, token: newToken } })
      setNewName('')
      setNewToken('')
      setShowAdd(false)
    } finally {
      setSaving(false)
      load()
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`توکن «${name}» حذف شود؟`)) return
    try { await api(`/tokens/${id}`, { method: 'DELETE' }) } catch { /* ignore */ }
    load()
  }

  const toggleVisible = (id: string) => {
    const next = new Set(visibleIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setVisibleIds(next)
  }

  const copyToken = (id: string, token: string) => {
    navigator.clipboard.writeText(token)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const maskToken = (t: string) => t.slice(0, 6) + '••••••••••••••••' + t.slice(-4)

  const [autoBuildLoading, setAutoBuildLoading] = useState(false)

  const handleAutoBuildToken = async () => {
    setAutoBuildLoading(true)
    window.open(buildPrefillUrl(), '_blank', 'noopener')
    setAutoBuildLoading(false)
  }

  if (loading) {
    return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">توکن‌های کلودفلر</h1>
          <p className="text-slate-400 text-sm mt-1">مدیریت توکن‌های API کلودفلر برای استقرار ورکرها</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> افزودن توکن
        </button>
      </div>

      {/* Quick start guide */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-brand-400" />
          <h2 className="text-sm font-bold text-white">مسیر سریع راه‌اندازی</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <a
            href="https://tempmail.ing/"
            target="_blank"
            rel="noopener noreferrer"
            className="group p-4 rounded-xl bg-slate-900/40 border border-slate-800/50 hover:border-brand-500/40 hover:bg-brand-500/5 transition-all"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Mail className="w-4 h-4 text-amber-400" />
              </div>
              <span className="text-xs font-mono text-slate-500">۱</span>
            </div>
            <h3 className="text-sm font-bold text-white mb-1">ایمیل موقت</h3>
            <p className="text-xs text-slate-400 leading-relaxed">یک ایمیل یکبارمصرف برای ثبت‌نام در کلودفلر — نیازی به ایمیل شخصی نیست.</p>
            <span className="inline-flex items-center gap-1 text-xs text-brand-300 mt-3 group-hover:gap-2 transition-all">
              دریافت ایمیل <ExternalLink className="w-3 h-3" />
            </span>
          </a>

          <a
            href="https://dash.cloudflare.com/sign-up"
            target="_blank"
            rel="noopener noreferrer"
            className="group p-4 rounded-xl bg-slate-900/40 border border-slate-800/50 hover:border-brand-500/40 hover:bg-brand-500/5 transition-all"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Cloud className="w-4 h-4 text-blue-400" />
              </div>
              <span className="text-xs font-mono text-slate-500">۲</span>
            </div>
            <h3 className="text-sm font-bold text-white mb-1">ساخت حساب کلودفلر</h3>
            <p className="text-xs text-slate-400 leading-relaxed">با ایمیل موقت در کلودفلر ثبت‌نام کنید و آن را تأیید کنید.</p>
            <span className="inline-flex items-center gap-1 text-xs text-brand-300 mt-3 group-hover:gap-2 transition-all">
              ثبت‌نام <ExternalLink className="w-3 h-3" />
            </span>
          </a>

          <a
            href="https://dash.cloudflare.com/profile/api-tokens"
            target="_blank"
            rel="noopener noreferrer"
            className="group p-4 rounded-xl bg-slate-900/40 border border-brand-500/30 bg-brand-500/5 transition-all"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 rounded-lg bg-brand-500/10">
                <KeyRound className="w-4 h-4 text-brand-400" />
              </div>
              <span className="text-xs font-mono text-slate-500">۳</span>
            </div>
            <h3 className="text-sm font-bold text-white mb-1">ساخت توکن API</h3>
            <p className="text-xs text-slate-400 leading-relaxed">توکن با ۱۲ دسترسی کامل (Workers، KV، DNS، Zone، SSL، Cache و...) ساخته می‌شود — همه با دسترسی خواندن و نوشتن. دیگر هیچ ارور توکن نخواهید داشت.</p>
            <span className="inline-flex items-center gap-1 text-xs text-brand-300 mt-3 group-hover:gap-2 transition-all">
              ساخت توکن <ExternalLink className="w-3 h-3" />
            </span>
          </a>
        </div>

        {/* Auto-build token button */}
        <div className="mt-4 pt-4 border-t border-slate-800/50">
          <button
            onClick={handleAutoBuildToken}
            disabled={autoBuildLoading}
            className="w-full p-4 rounded-xl bg-gradient-to-r from-brand-500/10 to-brand-600/10 border border-brand-500/30 hover:border-brand-500/50 hover:from-brand-500/20 hover:to-brand-600/20 transition-all flex items-center gap-3 group disabled:opacity-60"
          >
            <div className="p-2.5 rounded-xl bg-brand-500/15 group-hover:bg-brand-500/25 transition-colors">
              {autoBuildLoading ? <Loader2 className="w-5 h-5 text-brand-400 animate-spin" /> : <Wand2 className="w-5 h-5 text-brand-400" />}
            </div>
            <div className="text-right flex-1">
              <p className="text-sm font-bold text-white">ساخت خودکار توکن با دسترسی‌های آماده</p>
              <p className="text-xs text-slate-400 mt-0.5">با کلیک روی این دکمه، صفحه ساخت توکن کلودفلر با تمام دسترسی‌های لازم از قبل پر می‌شود — فقط روی «Continue to summary» و «Create Token» کلیک کنید.</p>
            </div>
            <ExternalLink className="w-4 h-4 text-brand-400 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>

      {tokens.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-slate-800/50 items-center justify-center mb-4">
            <KeyRound className="w-8 h-8 text-slate-500" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">هنوز توکنی اضافه نشده</h3>
          <p className="text-slate-400 text-sm mb-6">برای شروع استقرار ورکرها، ابتدا یک توکن API کلودفلر اضافه کنید</p>
          <button onClick={() => setShowAdd(true)} className="btn-primary inline-flex items-center gap-2">
            <Plus className="w-4 h-4" /> افزودن اولین توکن
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tokens.map((token, i) => (
            <div key={token.id} className="glass-card glass-card-hover p-5 animate-slide-up" style={{ animationDelay: `${i * 50}ms` }}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-brand-500/10">
                    <ShieldCheck className="w-5 h-5 text-brand-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white">{token.name}</h3>
                    <span className={`badge ${token.status === 'active' ? 'bg-green-500/10 text-green-400' : 'bg-slate-700/50 text-slate-400'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${token.status === 'active' ? 'bg-green-400' : 'bg-slate-500'}`} />
                      {token.status === 'active' ? 'فعال' : 'غیرفعال'}
                    </span>
                  </div>
                </div>
                <button onClick={() => handleDelete(token.id, token.name)} className="p-2 rounded-lg text-slate-500 hover:bg-error-500/10 hover:text-error-400 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-2 bg-slate-900/50 rounded-xl p-3 border border-slate-800/50">
                <code className="flex-1 text-sm text-slate-300 font-mono truncate" dir="ltr">
                  {visibleIds.has(token.id) ? token.token : maskToken(token.token)}
                </code>
                <button onClick={() => toggleVisible(token.id)} className="p-1.5 rounded-lg text-slate-500 hover:text-white transition-colors">
                  {visibleIds.has(token.id) ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button onClick={() => copyToken(token.id, token.token)} className="p-1.5 rounded-lg text-slate-500 hover:text-white transition-colors">
                  {copiedId === token.id ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>

              <p className="text-xs text-slate-500 mt-3">
                {token.last_used_at ? `آخرین استفاده: ${new Date(token.last_used_at).toLocaleDateString('fa-IR')}` : 'هنوز استفاده نشده'}
                {' • '}
                ساخته شده در {new Date(token.created_at).toLocaleDateString('fa-IR')}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setShowAdd(false)}>
          <div className="glass-card p-6 w-full max-w-md animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-brand-400" /> توکن جدید
              </h2>
              <button onClick={() => setShowAdd(false)} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/50">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-300 mb-2 font-medium">نام توکن</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="مثلاً: توکن اصلی"
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-2 font-medium">توکن API کلودفلر</label>
                <textarea
                  required
                  value={newToken}
                  onChange={(e) => setNewToken(e.target.value)}
                  placeholder="توکن را اینجا paste کنید..."
                  rows={3}
                  className="input-field font-mono text-sm"
                  dir="ltr"
                />
              </div>
              <div className="flex gap-3">
                <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  ذخیره توکن
                </button>
                <button type="button" onClick={() => setShowAdd(false)} className="btn-ghost">انصراف</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
