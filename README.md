<div align="center">

# ⚡ میلی‌کانفیگ پرو

### پنل حرفه‌ای مدیریت، استقرار و توزیع کانفیگ — Cloudflare Workers + Railway + Render

**بدون Supabase • بک‌اند کامل روی Workers + D1 • استقرار پنل‌های آماده (Marzban، 3x-ui، X4G و…) با تنظیم خودکار • همه‌چیز در یک مخزن**

[![GitHub Stars](https://img.shields.io/github/stars/miladjahani/miliconfigpro-v1?style=for-the-badge&logo=github&color=f1c40f&labelColor=1a1a2e)](https://github.com/miladjahani/miliconfigpro-v1/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/miladjahani/miliconfigpro-v1?style=for-the-badge&logo=github&color=3498db&labelColor=1a1a2e)](https://github.com/miladjahani/miliconfigpro-v1/network/members)
[![GitHub Last Commit](https://img.shields.io/github/last-commit/miladjahani/miliconfigpro-v1?style=for-the-badge&logo=git&color=e67e22&labelColor=1a1a2e)](https://github.com/miladjahani/miliconfigpro-v1/commits/main)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-f38020?style=for-the-badge&logo=cloudflare&labelColor=1a1a2e)](https://workers.cloudflare.com)
[![D1 Database](https://img.shields.io/badge/Cloudflare-D1-8b5cf6?style=for-the-badge&logo=cloudflare&labelColor=1a1a2e)](https://developers.cloudflare.com/d1/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178c6?style=for-the-badge&logo=typescript&labelColor=1a1a2e)](https://www.typescriptlang.org)
[![React](https://img.shields.io/badge/React-18-61dafb?style=for-the-badge&logo=react&labelColor=1a1a2e)](https://react.dev)

[⭐ ستاره بدهید](https://github.com/miladjahani/miliconfigpro-v1/stargazers) · [🍴 فورک کنید](https://github.com/miladjahani/miliconfigpro-v1/fork) · [🐞 گزارش باگ](https://github.com/miladjahani/miliconfigpro-v1/issues/new) · [🚀 استقرار سریع](#-شروع-سریع)

[![Deploy Pages](https://github.com/miladjahani/miliconfigpro-v1/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/miladjahani/miliconfigpro-v1/actions/workflows/deploy-pages.yml)
[![R2 Ready](https://img.shields.io/badge/R2-Ready%20(free%20tier)-f38020?style=flat-square&labelColor=1a1a2e&logo=cloudflare)](https://developers.cloudflare.com/r2/)
[![Smart Placement](https://img.shields.io/badge/Smart%20Placement-ON-8b5cf6?style=flat-square&labelColor=1a1a2e)](https://developers.cloudflare.com/workers/configuration/smart-placement/)

</div>

---

<div align="center">

<a href="https://github.com/miladjahani/miliconfigpro-v1">
  <img src="https://img.shields.io/badge/%F0%9F%8C%9F-%20اگر%20این%20پروژه%20به%20دردتان%20خورد%20ستاره%20بدهید-f1c40f?style=flat-square&labelColor=2d2d44" alt="Star us"/>
</a>
&nbsp;
<a href="https://github.com/miladjahani/miliconfigpro-v1/fork">
  <img src="https://img.shields.io/badge/🍴-فورک%20و%20استقرار%20خودتان-3498db?style=flat-square&labelColor=2d2d44" alt="Fork"/>
</a>
&nbsp;
<a href="https://deploy.workers.cloudflare.com/?url=https://github.com/miladjahani/miliconfigpro-v1">
  <img src="https://img.shields.io/badge/☁️-Deploy%20to%20Cloudflare-f38020?style=flat-square&labelColor=2d2d44" alt="Deploy to Cloudflare"/>
</a>

</div>

---

## 🎯 این چیست؟

میلی‌کانفیگ پرو یک **پنل تحت وب** برای مدیریت کامل زیرساخت کانفیگ شما روی کلودفلر است:

- 🚀 **استقرار ورکر با یک کلیک** — edgetunnel، NEXUS و سورس اختصاصی، با ساخت خودکار KV و UUID
- 🚂🧊 **پنل‌های آماده با تنظیم خودکار** — StanNG، 3x-ui، Heimdall، Marzban، PasarGuard و X4G روی **Railway/Render** مستقر می‌شوند و بعد از LIVE شدن، ادمین/اینباند/کاربر و ساب شان بدون دخالت شما ساخته و «نود آماده» تحویل داده می‌شود (هر پنل منحصربه‌فرد خودش)
- 🗂 **ورکرها و پنل‌ها در یک فهرست** — ورکرهای کلودفلر و پنل‌های میزبانی‌شده کنار هم با نشان هویت هر پنل، وضعیت زنده و لینک نود/ساب
- 👥 **کاربران اختصاصی برای هر ورکر** — هر کاربر ساب، کشور IP، فرگمنت، سقف حجم و تنظیمات منحصربه‌فرد خودش را دارد
- 🧠 **موتور پارسر جهانی** — هر فرمت سابی (base64، sing-box JSON، Clash YAML، حتی HTML) را می‌خواند؛ چند لینک همزمان merge و dedupe می‌شوند
- 🌍 **IP واقعی هر کشور، زنده** — متصل به اکوسیستم EDT (`ipdb.api.030101.xyz`) + بانک‌های Cloudflare رسمی و TheSpeedX
- 📶 **اسکنر و بهینه‌ساز** — پینگ TCP واقعی، تست سرعت، حذف نودهای مرده و ساب بهینه‌شده
- 💉 **تزریق IP و پروکسی** — IP ثابت ورود، زنجیره HTTP/SOCKS5، فرگمنت دقیق برای اپراتورهای ایران، WARP و دور زدن تحریم (جمنی/OpenAI)
- 📱 **افزودن یک‌کلیکی به کلاینت** — v2rayNG، Clash Meta، sing-box، Hiddify، Streisand با QR کد و صفحهٔ وضعیت عمومی
- 🤖 **ربات تلگرام** — هشدار مصرف و مدیریت از داخل تلگرام
- 📊 **سهمیه‌بندی** — سقف گیگ ماهانه، سقف درخواست، حد دستگاه همزمان، انقضا و ریست دوره‌ای برای هر کاربر
- 💡 **راهنمای زنده + راهنمای کامل** — اولین کلیک روی هر دکمه خودش را توضیح می‌دهد؛ تب «راهنما» هم نقشهٔ تصویری مسیر کار، هم شرح بخش‌به‌بخش هر تب را دارد
- 📦 **R2 رایگان خودکار** — با هر استقرار، باکت R2 ساخته و متصل می‌شود (۱۰ گیگ رایگان + egress صفر)
- ⚙️ **gRPC/XHTTP بدون دردسر** — موقع استقرار، gRPC و WebSockets روی همهٔ زون‌ها خودکار روشن می‌شوند
- ⚡ **سرعت** — فایل‌های استاتیک مستقیم از CDN لبه (بدون اجرای ورکر)، Smart Placement کنار D1، کش immutable یک‌ساله

---

## 🗺️ معماری

```mermaid
flowchart LR
    A[React + Vite SPA] -->|/api/*| B[Cloudflare Worker]
    B --> C[(D1 Database)]
    B --> D[KV ورکرهای مستقر]
    B -->|Cloudflare API| E[استقرار ورکر + KV]
    B -->|Railway GraphQL / Render REST| F[پنل‌های آماده: StanNG، 3x-ui، Marzban و…]
    B -->|زنده| G[EDT / IPDB / GitHub IP Banks]
    E --> H[ورکرهای edgetunnel / NEXUS]
    F --> I[تنظیم خودکار پس از LIVE → نود + ساب]
    H --> J[ساب‌لینک کاربران]
```

| لایه | تکنولوژی | محل |
|---|---|---|
| فرانت‌اند | React 18 + Vite + Tailwind + shadcn | `src/` |
| بک‌اند | Cloudflare Worker (TypeScript) | `worker/` |
| دیتابیس | Cloudflare D1 (SQLite) | `d1/schema.sql` |
| استقرار ورکر | Cloudflare REST API | `worker/deploy.ts` |
| استقرار پنل روی Railway | GraphQL backboard | `worker/railway.ts` |
| استقرار پنل روی Render | REST + Blueprint | `worker/render.ts` |
| کاتالوگ و تنظیم خودکار پنل‌ها | هر پنل یک روتین مجزا | `worker/panels.ts` + `worker/panelsetup.ts` |

---

## 🚀 شروع سریع

### راه اول — استقرار با Cloudflare Builds (پیشنهادی)

1. مخزن را **فورک** کنید
2. در Cloudflare یک Worker جدید بسازید و به فورک خود وصل کنید
3. یک بار دیتابیس را بسازید:

```bash
npx wrangler d1 create miliconfig-pro
# → database_id را در wrangler.toml جایگزین REPLACE_WITH_YOUR_D1_DATABASE_ID کنید
```

از این به بعد هر `push` به `main` = بیلد + اعمال اسکیمای D1 + استقرار خودکار ✅

### راه دوم — اجرای محلی

```bash
bun install
npm run dev:full   # بیلد + D1 محلی + wrangler dev روی 0.0.0.0:5173
```

### راه سوم — فقط استقرار دستی

```bash
npm run deploy     # بیلد فرانت + اسکیمای D1 (idempotent) + wrangler deploy
```

---

## ✨ قابلیت‌ها در یک نگاه

<table>
<tr><th>بخش</th><th>چه می‌کند؟</th></tr>
<tr><td><b>🚀 استقرار</b></td><td>ورکر edgetunnel/NEXUS/سورس اختصاصی با UUID و KV خودکار؛ محیط‌ها: CF Workers، CF Pages، Railway (خودکار/ZIP)، Render.com و VPS/Docker؛ تنظیمات زندهٔ KV مستقیم از پنل (ProxyIP، ECH، فرگمنت، SOCKS5، مسیر تصادفی و...)</td></tr>
<tr><td><b>🚂🧊 پنل‌های آماده</b></td><td>استقرار یک‌کلیکی StanNG، 3x-ui (تک‌پورت)، Heimdall، Marzban، PasarGuard و X4G روی Railway/Render — بعد از LIVE شدن «تنظیم خودکار» هر پنل (ادمین، اینباند VLESS، کاربر و ساب) اجرا و لینک نود + ساب تحویل می‌شود</td></tr>
<tr><td><b>👥 کاربران</b></td><td>برای هر ورکر: ساب خصوصی، انتخاب کشور با IP واقعی زنده، فرگمنت JSON دقیق، پریست اپراتورهای ایران، Cipher Suite، WARP، دور زدن تحریم، سقف حجم/درخواست/دستگاه، انقضا و ریست دوره‌ای</td></tr>
<tr><td><b>💉 تزریق</b></td><td>IP ثابت ورود، چرخش خودکار IP، زنجیره HTTP/SOCKS5/TURN/SSTP، پارامترهای واقعی edgetunnel (proxyip، globalproxy، ech، ed=2560)</td></tr>
<tr><td><b>📡 اسکنر</b></td><td>بانک‌های زندهٔ IP (EDT، IPDB، Cloudflare رسمی، cf-speedtest، TheSpeedX) + اسکن واقعی TCP روی بازه‌های CIDR + لیست پروکسی EDT-Pages</td></tr>
<tr><td><b>⚡ بهینه‌ساز</b></td><td>پارسر جهانی همهٔ فرمت‌ها، چند لینک همزمان، پینگ واقعی، حذف نود مرده، خروجی Base64 / Clash / Sing-box / Plain</td></tr>
<tr><td><b>📱 تحویل</b></td><td>صفحهٔ وضعیت عمومی هر کاربر با QR کد، دکمه‌های افزودن مستقیم به ۶ کلاینت، تشخیص خودکار فرمت از User-Agent، هدر Subscription-Userinfo</td></tr>
<tr><td><b>🤖 ربات</b></td><td>وب‌هوک تلگرام، هشدار مصرف، مدیریت کاربران از تلگرام</td></tr>
<tr><td><b>💡 راهنما</b></td><td>Coach-mark زندهٔ اولین کلیک روی همهٔ دکمه‌های پنل + تب «راهنما»: نقشهٔ تصویری مسیر، شرح بخش‌به‌بخش هر تب و سناریوهای پرتکرار</td></tr>
<tr><td><b>📦 R2</b></td><td>باکت R2 رایگان با هر استقرار خودکار ساخته و به ورکر متصل می‌شود — داده‌های سنگین از D1 خارج می‌شوند</td></tr>
<tr><td><b>⚙️ gRPC/XHTTP</b></td><td>روشن‌کردن خودکار gRPC + WebSockets روی زون‌ها موقع استقرار — نودها بدون تداخل با کلودفلر کار می‌کنند</td></tr>
<tr><td><b>⚡ سرعت</b></td><td>استاتیک‌ها از CDN لبه بدون اجرای ورکر + Smart Placement کنار D1 + کش immutable یک‌ساله</td></tr>
</table>

---

## 🚂🧊 پنل‌های آماده روی Railway / Render — با تنظیم خودکار

شش پنل **مستقل** (نه قالب) را می‌توانید با یک کلیک روی Railway یا Render مستقر کنید؛ مثل انتخاب ورکر کلودفلر، هر پنل یک گزینهٔ جدا با هویت، مخزن و پورت خودش است. بعد از LIVE شدن، پنل به‌صورت خودکار و **منحصربه‌فرد برای همان پنل** تنظیم می‌شود تا کاربر بدون هیچ قدم اضافه‌ای، نود و ساب آماده تحویل بگیرد:

| پنل | کاتالوگ | ورود پنل | تنظیم خودکار پس از LIVE |
|---|---|---|---|
| 🛡️ **StanNG v2** | `youdidking/stanngv2` | `/login` | ساخت ادمین یک‌بارمصرف از `/api/setup` |
| 📡 **3x-ui (تک‌پورت)** | `x4gpanell/3x-ui` | `/managepanel/` | ورود → اینباند VLESS/ws روی ۸۰۸۰ + کلاینت + ساب |
| 🧭 **Heimdall X-UI** | `x4gpanell/Heimdall` | `/managepanel/` | همان روتین X-UI (ورود X4GKIN/X4GKIN) |
| 🟣 **Marzban** | `x4gpanell/Marzban` | `/dashboard` | ادمین → اینباند VLESS → کاربر → ساب |
| ⚡ **X4G Gateway** | `x4gpanell/X4G` | `/login` | کانفیگ پیش‌فرض + گروه ساب «پیش‌فرض» |
| 🛡️ **PasarGuard** | `x4gpanell/PasarGuard` | `/` | ساخت ادمین با CLI از کنسول (دستور دقیق در نتیجه نشان داده می‌شود) |

### کلیدهای لازم

| محیط | کلید | کجا ساخته می‌شود | ثبت در پنل |
|---|---|---|---|
| ورکرهای Cloudflare | API Token با `Workers Scripts:Edit` و `KV` | dash.cloudflare.com/profile/api-tokens | تب «توکن‌ها» |
| Railway | Account Token | railway.com/account/tokens | تب «توکن‌ها» |
| Render.com | API Key | dashboard.render.com/account/api-keys | تب «توکن‌ها» |

> 💡 نتیجهٔ نهایی استقرار (لینک پنل، رمز ادمین، **لینک نود آماده** و **لینک ساب**) هم در ویزارد، هم در تب «ورکرها» و هم در ربات تلگرام نمایش داده می‌شود.

---

## 🌌 NEXUS — نسل جدید ورکر (پیش‌فرض جدید)

یک ورکر کاملاً جدید و مستقل که از صفر برای نیاز امروز طراحی شده — ترکیبی از پنل داخلی هوشمند، نقشهٔ زندهٔ جهانی و مبهم‌سازی پیشرفته:

- 🧠 **موتور هوشمند** — تنظیمات به‌صورت خودکار با توجه به کشور/دیتاسنتر بازدیدکننده بهینه می‌شود (انتخاب بهترین PoP، پورت، transport و فرگمنت)
- 🗺️ **نقشهٔ زندهٔ سراسری** — ۵۷+ دیتاسنتر Cloudflare با مختصات واقعی، محاسبهٔ RTT بر اساس فاصله و نمایش بهترین مسیر برای هر کاربر در هر جای دنیا
- 🛡️ **مبهم‌سازی دو لایه** — قفل و کلیدهای پیکربندی رمزگذاری‌شده + نام توابع غیرقابل‌ردیابی + ناحیهٔ کد طعمه (decoy) برای گمراه‌کردن تحلیل‌گر
- ⚡ **ساب‌نویس خودکار** — خروجی Base64 / Clash / sing-box / Plain با تشخیص خودکار از User-Agent و `?target=`
- 🔐 **پنل داخلی همه‌چیزتمام** — تنظیمات زندهٔ KV (transport، TLS/ECH، فرگمنت، ProxyIP، Cipher)، دو زبانهٔ فارسی/انگلیسی، طراحی آینده‌نگرانه با پس‌زمینهٔ ستاره‌ای متحرک
- 📂 **یک فایل، بدون وابستگی** — کل ورکر (پنل + API + نقشه) در `public/repo/nexus.js` است؛ بدون asset، بدون D1

### نصب NEXUS

**راه اول — از پنل میلی‌کانفیگ:** در صفحهٔ «استقرار ورکر»، منبع را روی **NEXUS** بگذارید و مثل بقیهٔ سورس‌ها مستقر کنید. UUID هم‌ان کلید پنل است: `https://<worker>.workers.dev/<uuid>`

**راه دوم — مستقل:**

```bash
npx wrangler kv namespace create nexus-config
# → id را در public/repo/nexus-wrangler.toml جایگزین REPLACE_WITH_YOUR_KV_NAMESPACE_ID کنید
npx wrangler deploy -c public/repo/nexus-wrangler.toml
```

| متغیر | معنی |
|---|---|
| `u` | UUID ورکر — هم‌کلید بازکردن پنل و هم مسیر ساب (`/<uuid>/sub`) |
| `d` | کلید دوم اختیاری / نام کوتاه |
| KV `C` | تنظیمات زنده زیر کلید `c` (سازگار با پنل میلی‌کانفیگ) |

---

## 📁 ساختار پروژه

```
├── src/                    # فرانت‌اند (React + Vite)
│   ├── pages/              # داشبورد، ورکرها، کاربران، بهینه‌ساز، اسکنر...
│   ├── components/         # LiveGuide، Layout و...
│   └── lib/                # تایپ‌ها، متن راهنماها، API client
├── worker/                 # بک‌اند Cloudflare Worker
│   ├── index.ts            # روتر /api/*
│   ├── parser.ts           # موتور پارسر جهانی
│   ├── members.ts          # ساب اختصاصی هر کاربر
│   ├── deploy.ts           # استقرار ورکر با API کلودفلر
│   ├── panels.ts           # کاتالوگ ۶ پنل آماده (Railway/Render)
│   ├── panelsetup.ts       # تنظیم خودکار هر پنل پس از LIVE (نود + ساب)
│   ├── railway.ts          # API استقرار خودکار روی Railway
│   ├── render.ts           # API استقرار خودکار روی Render.com
│   └── ...
├── d1/schema.sql           # اسکیمای کامل دیتابیس
└── wrangler.toml           # کانفیگ Cloudflare
```

---

## 🛠️ توسعه

```bash
bun install        # نصب وابستگی‌ها
npm run dev:full   # اجرای کامل محلی
npx tsc --noEmit   # تایپ‌چک
npm run deploy     # استقرار دستی
```

---

<div align="center">

## ⭐ به ما ستاره بدهید!

اگر میلی‌کانفیگ پرو کارتان را راه انداخت، یک ستاره بزرگ‌ترین حمایت است ⭐

<a href="https://github.com/miladjahani/miliconfigpro-v1/stargazers">
  <img src="https://reporoster.com/stars/dark/miladjahani/miliconfigpro-v1" alt="Stars over time"/>
</a>

<br/>

<a href="https://github.com/miladjahani/miliconfigpro-v1/stargazers">
  <img src="https://img.shields.io/badge/⭐%20ستاره%20بدهید-در%20یک%20کلیک-f1c40f?style=for-the-badge&labelColor=1a1a2e" alt="Give a Star"/>
</a>
&nbsp;
<a href="https://github.com/miladjahani/miliconfigpro-v1/fork">
  <img src="https://img.shields.io/badge/🍴%20فورک-و%20خودتان%20میزبان%20شوید-3498db?style=for-the-badge&labelColor=1a1a2e" alt="Fork"/>
</a>

<sub>ساخته‌شده با ⚡ برای جامعهٔ فارسی‌زبان — بدون هیچ وابستگی به سرویس خارجی، همه‌چیز روی کلودفلر شما</sub>

</div>
