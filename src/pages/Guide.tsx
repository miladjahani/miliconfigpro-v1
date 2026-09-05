import { useState } from 'react'
import {
  BookOpen, LogIn, KeyRound, Rocket, Cloud, Zap, UsersRound,
  Bot, ShieldCheck, AlertTriangle, LayoutDashboard, ScrollText,
  Shield, ChevronDown, ChevronUp, Sparkles, Link2, ArrowLeft,
  CheckCircle2, DatabaseBackup, Globe, Terminal, TrainFront,
} from 'lucide-react'
import type { ReactNode } from 'react'

/* ────────────────────────────────────────────────────────────────────────────
   راهنمای کامل میلی‌کانفیگ
   ساختار:
    ۱) مسیر کلی کار (نقشهٔ تصویری ۶ مرحله)
    ۲) پنل‌های آماده + تنظیم خودکار (نمودار)
    ۳) نقشهٔ تب‌ها — کلیک روی هر تب = توضیح کامل همان تب و بخش‌هایش
    ۴) سه سناریوی پرتکرار
    ۵) نکات امنیتی
   تب‌های ناوبری همان‌هایی هستند که در Layout دیده می‌شوند؛ متن هر تب از روی
   رفتار واقعی همان صفحه نوشته شده تا راهنما با پنل همیشه هم‌قدم بماند.
──────────────────────────────────────────────────────────────────────────── */

const FLOW: Array<{ icon: ReactNode; t: string; d: string; color: string }> = [
  {
    icon: <LogIn className="w-5 h-5" />, t: 'حساب بساز', d: 'با ایمیل و رمز وارد شوید؛ اولین ثبت‌نام خودکار «ادمین» می‌شود.', color: 'from-slate-600 to-slate-700',
  },
  {
    icon: <KeyRound className="w-5 h-5" />, t: 'کلیدها را ثبت کن', d: 'توکن Cloudflare برای ورکرها + توکن Railway/کلید Render برای پنل‌های آماده.', color: 'from-blue-600 to-blue-700',
  },
  {
    icon: <Rocket className="w-5 h-5" />, t: 'مستقر کن', d: 'ورکر روی Cloudflare یا پنل آماده (StanNG، 3x-ui، Marzban و…) روی Railway/Render.', color: 'from-brand-600 to-brand-700',
  },
  {
    icon: <Cloud className="w-5 h-5" />, t: 'مدیریت کن', d: 'تنظیمات زندهٔ KV، اسکنر IP، پنل‌های میزبانی‌شده و ساب‌های گروهی در «ورکرها».', color: 'from-cyan-600 to-cyan-700',
  },
  {
    icon: <UsersRound className="w-5 h-5" />, t: 'ساب بساز و بده', d: 'کاربر با کشور IP، فرگمنت، سقف حجم و انقضای خودش — لینک ساب/Clash/QR.', color: 'from-purple-600 to-purple-700',
  },
  {
    icon: <Bot className="w-5 h-5" />, t: 'ربات را وصل کن', d: 'مدیریت، هشدار مصرف و اطلاع نتیجهٔ هر استقرار، مستقیم در تلگرام.', color: 'from-green-600 to-green-700',
  },
]

const PANELS = [
  { e: '🛡️', n: 'StanNG', d: 'پنل سبک xray + ساب' },
  { e: '📡', n: '3x-ui', d: 'X-UI تک‌پورت' },
  { e: '🧭', n: 'Heimdall', d: 'X-UI + ساب /view' },
  { e: '🟣', n: 'Marzban', d: 'پنل کامل Gozargah' },
  { e: '🛡️', n: 'PasarGuard', d: 'چندکاربره Python' },
  { e: '⚡', n: 'X4G', d: 'Gateway VLESS/XHTTP' },
]

interface TabDoc { id: string; icon: ReactNode; label: string; short: string; sections: Array<{ k: string; v: ReactNode }>; tag?: string }

const TABS: TabDoc[] = [
  {
    id: 'tab-dashboard', icon: <LayoutDashboard className="w-5 h-5" />, label: 'داشبورد', tag: 'نمای کلی',
    short: 'وضعیت همه‌چیز در یک نگاه + بکاپ و میانبرهای سریع.',
    sections: [
      { k: 'کارت‌های آمار', v: <>تعداد توکن‌ها، همهٔ استقرارها (Cloudflare + Railway + Render) و کاربران ربات — هر کارت به تب خودش لینک است.</> },
      { k: 'بکاپ و بازگردانی', v: <><DatabaseBackup className="inline w-4 h-4 -mt-0.5" /> خروجی JSON از عضوها، ساب‌های تزریقی و گروهی؛ بازگردانی با حالت merge — لینک‌ها بعد از برگشت همان قبلی می‌مانند.</> },
      { k: 'سهمیهٔ درخواست کلودفلر', v: 'نوار مصرف امروز از سقف ۱۰۰٬۰۰۰ درخواست رایگان — قبل از بسته‌شدن ساب‌ها هشدار می‌گیرید.' },
      { k: 'وضعیت ورکرها و فعالیت‌های اخیر', v: 'موفق/ناموفق بودن استقرارها + تفکیک پنل‌های Railway و Render + آخرین رویدادهای پنل.' },
    ],
  },
  {
    id: 'tab-tokens', icon: <KeyRound className="w-5 h-5" />, label: 'توکن‌ها', tag: 'کلیدها',
    short: 'سه نوع کلید: هر محیط استقرار کلید خودش را می‌خواهد.',
    sections: [
      { k: 'توکن کلودفلر', v: <>برای ورکرها و خواندن مصرف: <b>Workers Scripts:Edit، Workers KV، D1:Edit، Account Settings:Read و Analytics:Read</b>. پنل «ساخت توکن» را با دسترسی‌های لازم باز می‌کند.</> },
      { k: 'توکن Railway', v: <>برای استقرار پنل‌های آماده روی 🚂 Railway — از <span dir="ltr">railway.com/account/tokens</span> (توکن Account).</> },
      { k: 'کلید API رندر', v: <>برای استقرار پنل‌های آماده روی 🧊 Render — از <span dir="ltr">dashboard.render.com/account/api-keys</span>.</> },
    ],
  },
  {
    id: 'tab-deploy', icon: <Rocket className="w-5 h-5" />, label: 'استقرار جدید', tag: 'قلب پنل',
    short: 'سه گام: نام و کلید ← تنظیمات ← استقرار. اول «محیط اجرا» را انتخاب کنید.',
    sections: [
      { k: 'محیط‌های اجرا', v: <><b>CF Workers / CF Pages</b> ورکر را روی edge کلودفلر می‌نشاند (KV و UUID خودکار). <b>Railway</b> و <b>Render.com</b> پنل آماده را خودکار مستقر می‌کنند. <b>VPS (Docker)</b> و حالت ZIP ریلوی فایل‌های آماده برای استقرار دستی تحویل می‌دهند.</> },
      { k: 'گام ۱ — نام و کلید', v: 'نام یکتا (همان آدرس/پروژه) + انتخاب توکن همان محیط. برای ورکرهای کلودفلر UUID و مسیر پنل هم اینجا ساخته می‌شود.' },
      { k: 'گام ۲ — تنظیمات', v: <>برای Railway/Render از اینجا <b>پنل/ورکر موردنظر</b> را از فهرست ۶ پنل آماده انتخاب می‌کنید (استقرار هر پنل جدا و با هویت خودش است، نه «قالب»). بقیهٔ تنظیمات (Proxy IP، مسیر، رمز و…) هم در همین گام است.</> },
      { k: 'گام ۳ — استقرار زنده', v: 'لاگ لحظه‌ای بیلد + بعد از LIVE شدن کارت نتیجه با لینک پنل، و اگر تنظیم خودکار انجام شد: خلاصهٔ آن + لینک نود و ساب آماده.' },
    ],
  },
  {
    id: 'tab-deployments', icon: <Cloud className="w-5 h-5" />, label: 'ورکرها', tag: 'بعد از استقرار',
    short: 'فهرست یکپارچهٔ همهٔ ورکرها و پنل‌ها + اسکنر IP و ساب‌های گروهی.',
    sections: [
      { k: 'لیست یکپارچه', v: 'ورکرهای کلودفلر و پنل‌های Railway/Render کنار هم، با نشان هویت هر پنل و وضعیت. دکمهٔ «باز کردن پنل» و «داشبورد سرویس‌دهنده» روی هر کارت.' },
      { k: 'تنظیم خودکار پنل‌ها', v: 'بعد از موفق‌شدن استقرار یک پنل، کارت سبز «✅ تنظیم خودکار انجام شد» لینک نود آماده (با دکمهٔ کپی) و لینک ساب را نشان می‌دهد — بدون نیاز به ورود دستی به پنل.' },
      { k: 'تنظیمات زندهٔ ورکر', v: 'برای ورکرهای کلودفلر: Proxy IP، مسیر، ADD.txt، پروتکل/ترنسپورت و… مستقیماً در KV سورس ذخیره می‌شود و در ساب همان لحظه اعمال می‌گردد.' },
      { k: 'اسکنر IP و اعمال سریع', v: 'IP تمیز از بانک‌های زنده یا اسکن واقعی CIDR با handshake TCP؛ نتیجه را روی ورکر (ADD.txt) یا یک ساب تزریقی اعمال کنید.' },
      { k: 'ساب گروهی', v: 'چند ورکر را در یک لینک ساب ادغام کنید — یک لینک ثابت برای همهٔ نودها.' },
    ],
  },
  {
    id: 'tab-optimizer', icon: <Zap className="w-5 h-5" />, label: 'بهینه‌ساز', tag: 'کیفیت نودها',
    short: 'هر سابی را به نودهای سالم و مرتب‌شده تبدیل می‌کند.',
    sections: [
      { k: 'ورودی', v: 'یک یا چند لینک ساب یا نود خام — همهٔ فرمت‌ها: base64، sing-box JSON، Clash YAML، حتی HTML.' },
      { k: 'پردازش', v: 'نودها جدا و dedupe می‌شوند، به هر کدام پینگ TCP واقعی زده می‌شود و مرده‌ها حذف می‌شوند (یا با گزینه «نگه‌داشتن نودهای بدون پاسخ» علامت‌دار می‌مانند).' },
      { k: 'خروجی', v: 'ساب بهینه در فرمت دلخواه: Base64 (v2rayNG)، Clash Meta، sing-box یا Plain — با امکان تزریق IP/پروکسی.' },
    ],
  },
  {
    id: 'tab-members', icon: <UsersRound className="w-5 h-5" />, label: 'کاربران ورکر', tag: 'ساب اختصاصی',
    short: 'هر ورکر را بین چند نفر با تنظیمات کاملاً منحصربه‌فرد تقسیم کنید.',
    sections: [
      { k: 'انتخاب ورکر و ساخت سریع', v: 'اول ورکر مقصد را انتخاب کنید؛ «ساخت سریع» با یک کلیک کاربر آماده با لینک ساب می‌سازد، «کاربر پیشرفته» فرم کامل را باز می‌کند.' },
      { k: 'شخصی‌سازی اتصال', v: 'کشور IP (آمریکا، آلمان و…) با IP زنده و تست‌شده، ترنسپورت ws/gRPC، فرگمنت + پریست اپراتورهای ایران (همراه‌اول، ایرانسل، رایتل، TCI)، Cipher Suite، اثرانگشت، SNI، ECH و 0-RTT.' },
      { k: 'خروجی و تحریم', v: 'ProxyIP اختصاصی، زنجیرهٔ HTTP/SOCKS5 و WARP — برای بازکردن جمنی/OpenAI و دور زدن تحریم یا فیلترینگ.' },
      { k: 'سهمیه‌بندی و فروش', v: 'سقف حجم ماهانه، سقف درخواست، حداکثر دستگاه همزمان، انقضا، شمارش از اولین اتصال و ریست دوره‌ای — مناسب فروش اشتراک.' },
      { k: 'اقدامات هر کاربر', v: 'ویرایش، کپی ساب Base64 یا Clash، صفحهٔ وضعیت عمومی با QR و دکمهٔ افزودن به کلاینت، به‌روزرسانی مصرف از Analytics، قطع/وصل فوری و حذف.' },
    ],
  },
  {
    id: 'tab-bot', icon: <Bot className="w-5 h-5" />, label: 'ربات تلگرام', tag: 'مدیریت از چت',
    short: 'کل پنل را از داخل تلگرام مدیریت کنید.',
    sections: [
      { k: 'اتصال', v: 'توکن را از @BotFather بگیرید و اینجا ثبت کنید؛ وب‌هوک و پیام خوش‌آمد خودکار تنظیم می‌شود.' },
      { k: 'امکانات ربات', v: 'لیست ورکرها و پنل‌ها با دکمه، دریافت ساب، ساب‌های بهینه، ساخت کاربر با ویزارد دکمه‌ای و دریافت نوتیفیکیشن خودکار نتیجهٔ هر استقرار.' },
    ],
  },
  {
    id: 'tab-bot-users', icon: <Bot className="w-5 h-5" />, label: 'کاربران ربات', tag: 'مخاطب‌های ربات',
    short: 'هر کس به ربات /start داده است اینجا دیده می‌شود.',
    sections: [
      { k: 'مدیریت', v: 'فعال/غیرفعال کردن دسترسی هر نفر به ربات و ارتقای او به ادمین ربات — برای تیم‌هایی که چند نفر پنل را از تلگرام مدیریت می‌کنند.' },
    ],
  },
  {
    id: 'tab-logs', icon: <ScrollText className="w-5 h-5" />, label: 'لاگ‌ها', tag: 'ردیابی',
    short: 'تاریخچهٔ کامل رویدادهای پنل با فیلتر.',
    sections: [
      { k: 'فیلتر', v: 'همه / توکن‌ها / استقرارها (کلودفلر، Railway، Render) / ربات — هر رویداد با آیکون، نام و زمان دقیق.' },
    ],
  },
  {
    id: 'tab-guide', icon: <BookOpen className="w-5 h-5" />, label: 'راهنما', tag: 'همین تب',
    short: 'راهنمای زنده + همین صفحهٔ راهنمای کامل.',
    sections: [
      { k: 'راهنمای زنده (اولین کلیک)', v: 'اولین باری که روی هر دکمهٔ دارای دادهٔ راهنما کلیک کنید، یک حباب توضیح می‌دهدش و دیگر تکرار نمی‌شود. دکمهٔ 💡 پایین‌چپ را خاموش/روشن کنید؛ دکمهٔ ↺ همهٔ راهنماها را از اول نشان می‌دهد.' },
      { k: 'این صفحه', v: 'نقشهٔ کلی کار + توضیح هر تب و بخش‌هایش + سناریوهای پرتکرار.' },
    ],
  },
  {
    id: 'tab-admin', icon: <Shield className="w-5 h-5" />, label: 'مدیریت کاربران', tag: 'فقط ادمین',
    short: 'نقش‌ها و سقف استقرار هر کاربر پنل.',
    sections: [
      { k: 'نقش‌ها', v: 'هر کاربر پنل را «کاربر» یا «ادمین» کنید — ادمین تب مدیریت کاربران را می‌بیند.' },
      { k: 'سقف استقرار', v: 'سقف تعداد استقرار (ورکر + پنل‌های Railway/Render با هم) برای هر نفر — برای فروش پنل به چند مشتری عالی است.' },
    ],
  },
]

const SCENARIOS: Array<{ t: string; icon: ReactNode; steps: string[] }> = [
  {
    t: 'سریع یک ساب امن بساز (بدون VPS)', icon: <Zap className="w-4 h-4" />,
    steps: ['توکن کلودفلر را در «توکن‌ها» ثبت کنید.', 'از «استقرار جدید» یک ورکر CF Workers بسازید.', 'در «ورکرها» ساب مستقیم ورکر را کپی یا در «بهینه‌ساز» IP تمیز بزنید.', 'در «کاربران ورکر» برای هر نفر ساب اختصاصی بسازید.'],
  },
  {
    t: 'پنل کامل می‌خواهم (Marzban، 3x-ui و…)', icon: <Rocket className="w-4 h-4" />,
    steps: ['توکن Railway یا کلید Render را ثبت کنید.', 'محیط Railway/Render را انتخاب و پنل موردنظر را از گام تنظیمات برگزینید.', 'صبر کنید تا LIVE شود — تنظیم خودکار ادمین/اینباند/کاربر را می‌سازد.', 'از کارت نتیجه یا «ورکرها» لینک نود و ساب آماده را بردارید.'],
  },
  {
    t: 'فروش اشتراک به کاربران', icon: <UsersRound className="w-4 h-4" />,
    steps: ['ورکر را مستقر و در «کاربران ورکر» کاربر با سقف حجم، انقضا و تعداد دستگاه بسازید.', '«شمارش از اولین اتصال» و «ریست خودکار» را برای تمدید ماهانه فعال کنید.', 'ربات تلگرام را وصل کنید تا هشدار مصرف و اطلاع نتیجهٔ استقرار برسد.', 'برای چند مشتری پنل، در «مدیریت کاربران» سقف استقرار هر حساب را تعیین کنید.'],
  },
]

export default function Guide() {
  const [open, setOpen] = useState<string | null>('tab-dashboard')
  const [activeChip, setActiveChip] = useState<string | null>(null)

  const openTab = (id: string) => {
    setOpen((cur) => (cur === id ? null : id))
    setActiveChip(id)
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="glass-card p-6 lg:p-8 relative overflow-hidden">
        <div className="absolute -top-16 -left-16 w-64 h-64 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-start gap-4 flex-wrap">
          <div className="w-14 h-14 shrink-0 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-lg shadow-brand-500/30">
            <BookOpen className="w-7 h-7 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-white">راهنمای کامل میلی‌کانفیگ</h1>
            <p className="text-slate-400 text-sm mt-1 leading-relaxed">
              از ساخت حساب تا تحویل ساب به کاربر — این صفحه هر <b className="text-slate-200">تب</b> و هر
              <b className="text-slate-200"> بخش</b> داخلش را توضیح می‌دهد. روی هر تب از نقشهٔ پایین بزنید تا شرحش باز شود.
            </p>
          </div>
        </div>
      </div>

      {/* ── Visual flow ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-brand-400" />
          <h2 className="text-sm font-bold text-white">مسیر کلی کار — از صفر تا ساب آماده</h2>
        </div>
        <div className="glass-card p-5 lg:p-6">
          <div className="flex flex-col lg:flex-row items-stretch gap-2 lg:gap-0">
            {FLOW.map((f, i) => (
              <div key={f.t} className="flex-1 flex flex-col lg:flex-row items-center gap-2">
                <div className={`flex-1 w-full rounded-2xl border border-slate-700/60 bg-slate-900/40 p-4 hover:border-brand-500/40 transition-colors`}>
                  <div className={`inline-flex p-2.5 rounded-xl bg-gradient-to-br ${f.color} mb-2.5`}>
                    {f.icon}
                  </div>
                  <p className="text-white font-bold text-sm flex items-center gap-1.5">
                    <span className="text-[10px] w-5 h-5 inline-flex items-center justify-center rounded-full bg-slate-700/60 font-mono">{i + 1}</span>
                    {f.t}
                  </p>
                  <p className="text-[11px] text-slate-400 leading-relaxed mt-1.5">{f.d}</p>
                </div>
                {i < FLOW.length - 1 && (
                  <ArrowLeft className="w-4 h-4 text-slate-600 shrink-0 rotate-90 lg:rotate-0 mx-0 lg:mx-1" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Hosted panels + auto setup diagram ── */}
      <div className="glass-card p-5 lg:p-6 border-brand-500/20">
        <div className="flex items-center gap-2 mb-1">
          <Cloud className="w-4 h-4 text-brand-400" />
          <h2 className="text-sm font-bold text-white">پنل‌های آماده روی Railway / Render — با تنظیم خودکار</h2>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed mb-4">
          شش پنل مستقل، هرکدام با هویت و مخزن خودش — مثل انتخاب ورکر کلودفلر، فقط یک گزینهٔ مستقل است. بعد از LIVE شدن،
          پنل بدون دخالت شما تنظیم می‌شود و «نود آماده» تحویل می‌گیرید:
        </p>

        {/* diagram: pick panel → deploy → auto setup → ready node */}
        <div className="flex flex-col md:flex-row items-stretch gap-3">
          <div className="flex-1 rounded-xl border border-slate-700 bg-slate-900/40 p-3">
            <p className="text-[10px] font-bold text-slate-500 mb-2 tracking-wide">۱ · انتخاب پنل (در گام تنظیمات)</p>
            <div className="flex flex-wrap gap-1.5">
              {PANELS.map((p) => (
                <span key={p.n} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800/80 border border-slate-700 text-[11px] text-slate-200" title={p.d}>
                  <span>{p.e}</span>{p.n}
                </span>
              ))}
            </div>
          </div>
          <ArrowLeft className="w-4 h-4 text-slate-600 shrink-0 mx-auto rotate-90 md:rotate-0 my-1 md:my-auto" />
          <div className="flex-1 rounded-xl border border-slate-700 bg-slate-900/40 p-3">
            <p className="text-[10px] font-bold text-slate-500 mb-2 tracking-wide">۲ · دیپلوی خودکار روی 🚂 Railway / 🧊 Render</p>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              ساخت پروژه/سرویس، تنظیم <span className="font-mono" dir="ltr">PORT</span>، متغیرهای محیطی (رمز ادمین برای هر پنل) و دیپلوی — همه بدون دخالت شما.
            </p>
          </div>
          <ArrowLeft className="w-4 h-4 text-slate-600 shrink-0 mx-auto rotate-90 md:rotate-0 my-1 md:my-auto" />
          <div className="flex-1 rounded-xl border border-green-500/25 bg-green-500/5 p-3">
            <p className="text-[10px] font-bold text-green-400/80 mb-2 tracking-wide">۳ · تنظیم خودکار بعد از LIVE</p>
            <ul className="space-y-1 text-[11px] text-slate-300">
              <li className="flex items-start gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0 mt-0.5" />ساخت/تأیید ادمین (مثل StanNG)</li>
              <li className="flex items-start gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0 mt-0.5" />ایجاد اینباند VLESS/ws، کاربر و ساب — منحصربه‌فرد هر پنل</li>
              <li className="flex items-start gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0 mt-0.5" />تحویل لینک نود + لینک ساب در نتیجهٔ استقرار</li>
            </ul>
            <p className="text-[10px] text-slate-500 mt-2">🛡️ PasarGuard نیازمند ساخت ادمین با CLI از کنسول است — دستور دقیق در کارت نتیجه نشان داده می‌شود.</p>
          </div>
        </div>
      </div>

      {/* ── Tab map ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Link2 className="w-4 h-4 text-brand-400" />
          <h2 className="text-sm font-bold text-white">نقشهٔ تب‌ها — روی هر تب بزنید تا بخش‌هایش شرح داده شود</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => openTab(t.id)}
              className={`p-3 rounded-2xl border text-right transition-all ${
                activeChip === t.id || open === t.id
                  ? 'border-brand-500 bg-brand-500/10'
                  : 'border-slate-700 bg-slate-900/40 hover:border-slate-500 hover:bg-slate-900/70'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`p-2 rounded-xl ${activeChip === t.id || open === t.id ? 'bg-brand-500/20 text-brand-300' : 'bg-slate-800 text-slate-400'}`}>
                  {t.icon}
                </span>
                {t.tag && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-500">{t.tag}</span>}
              </div>
              <p className="text-sm font-bold text-white mt-2">{t.label}</p>
              <p className="text-[11px] text-slate-400 leading-relaxed mt-1">{t.short}</p>
            </button>
          ))}
        </div>
      </div>

      {/* ── Per-tab details (accordion) ── */}
      <div className="space-y-3">
        {TABS.map((t) => {
          const isOpen = open === t.id
          return (
            <div key={t.id} id={t.id} className={`glass-card overflow-hidden scroll-mt-24 transition-colors ${isOpen ? 'border-brand-500/30' : ''}`}>
              <button
                onClick={() => setOpen(isOpen ? null : t.id)}
                className="w-full flex items-center gap-3 p-4 text-right"
              >
                <div className={`p-2.5 rounded-xl shrink-0 transition-colors ${isOpen ? 'bg-brand-500/20 text-brand-300' : 'bg-slate-800/70 text-slate-400'}`}>
                  {t.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-sm">{t.label}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{t.short}</p>
                </div>
                {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
              </button>
              {isOpen && (
                <div className="px-4 pb-5 -mt-1 space-y-2.5 animate-fade-in">
                  {t.sections.map((s) => (
                    <div key={s.k} className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-3.5">
                      <p className="text-xs font-bold text-brand-300 mb-1">{s.k}</p>
                      <p className="text-xs text-slate-300 leading-relaxed">{s.v}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Scenarios ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Globe className="w-4 h-4 text-brand-400" />
          <h2 className="text-sm font-bold text-white">سه سناریوی پرتکرار</h2>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {SCENARIOS.map((s) => (
            <div key={s.t} className="glass-card p-5">
              <p className="text-white font-bold text-sm flex items-center gap-2 mb-3">
                <span className="p-2 rounded-lg bg-brand-500/15 text-brand-300">{s.icon}</span>{s.t}
              </p>
              <ol className="space-y-2">
                {s.steps.map((st, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-300 leading-relaxed">
                    <span className="h-[18px] w-[18px] shrink-0 text-[10px] inline-flex items-center justify-center rounded-full bg-slate-800 text-brand-300 font-mono mt-0.5">{i + 1}</span>
                    {st}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </div>

      {/* ── Security ── */}
      <div className="glass-card p-5 border-warning-500/20">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <h3 className="text-white font-medium text-sm">نکات امنیتی</h3>
        </div>
        <ul className="list-disc pr-5 text-sm text-slate-300 space-y-1">
          <li>رمز پنل ورکرها و پنل‌های آماده را فقط برای خودتان نگه دارید؛ برای پنل‌های X-UI (3x-ui/Heimdall) بعد از اولین ورود، گذرواژهٔ پیش‌فرض را عوض کنید.</li>
          <li>لینک ساب هر کاربر محرمانه است — هر کس لینک را داشته باشد به کانفیگ دسترسی دارد؛ با دکمه غیرفعال، دسترسی را فوری قطع کنید.</li>
          <li>توکن Cloudflare را با حداقل دسترسی‌های لازم بسازید و در صورت لو رفتن از تب «توکن‌ها» حذفش کنید. توکن Railway/کلید Render را فقط به خودتان بدهید.</li>
        </ul>
        <div className="flex items-start gap-2 mt-3 text-xs text-warning-300">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>سقف حجم/درخواست در لحظهٔ fetch ساب اعمال می‌شود و مصرف از آمار روزانهٔ کلودفلر خوانده می‌شود؛ قطع آنی وسط اتصال از عهده هیچ پنلی برنمی‌آید. برای پنل‌های Railway/Render حتماً Volume را برای پایداری داده وصل کنید (داخل توضیحات هر پنل آمده).</span>
        </div>
      </div>

      {/* ── Live guide reminder ── */}
      <div className="glass-card p-5 border-brand-500/20 flex items-start gap-3">
        <div className="p-2.5 rounded-xl bg-brand-500/15 text-brand-300 shrink-0">
          <Terminal className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-white font-medium text-sm">راهنمای زنده را از دست ندهید</p>
          <p className="text-xs text-slate-400 leading-relaxed mt-1">
            دکمهٔ <b className="text-brand-300">💡 راهنمای زنده</b> پایین‌چپ صفحه را روشن نگه دارید: اولین کلیک روی هر دکمهٔ مهم پنل،
            همان‌جا توضیحش را نشان می‌دهد. اگر همهٔ راهنماها را دیده‌اید و می‌خواهید دوباره ببینید، دکمهٔ ↺ کنارش را بزنید.
          </p>
          <div className="flex flex-wrap gap-1.5 mt-3 text-[10px]">
            {['ورود / ثبت‌نام', 'توکن‌ها', 'استقرار جدید', 'ورکرها', 'بهینه‌ساز', 'کاربران ورکر', 'ربات تلگرام', 'کاربران ربات', 'لاگ‌ها', 'مدیریت کاربران'].map((x) => (
              <span key={x} className="px-2 py-1 rounded-lg bg-slate-800/70 border border-slate-700 text-slate-400">{x}</span>
            ))}
          </div>
        </div>
        <TrainFront className="hidden lg:block w-8 h-8 text-slate-700 shrink-0 mr-2" />
      </div>
    </div>
  )
}
