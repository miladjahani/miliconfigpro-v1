# miliconfig Pro

پنل مدیریت استقرار ورکرهای کلودفلر — بک‌اند روی **Cloudflare Workers + D1**، بدون Supabase.

## معماری

- **فرانت‌اند:** React + Vite + Tailwind (SPA با HashRouter) در `src/`
- **بک‌اند:** Cloudflare Worker در `worker/` — همه‌ی APIها زیر `/api/*`
- **دیتابیس:** Cloudflare D1 (`DB` binding) — اسکیمای کامل در `d1/schema.sql`
- **استقرار ورکرها:** موتور استقرار (`worker/deploy.ts`) با API کلودفلر: ساخت KV، آپلود اسکریپت و فعال‌سازی workers.dev
- **ربات تلگرام:** وب‌هوک روی `/api/webhooks/telegram`

## راه‌اندازی / استقرار خودکار (Cloudflare Builds)

مخزن به Cloudflare Workers Builds متصل است — با هر push به `main` به‌صورت خودکار بیلد و مستقر می‌شود.
فقط یک بار لازم است:

```bash
npx wrangler d1 create miliconfig-pro
# → مقدار database_id خروجی را در wrangler.toml جایگزین REPLACE_WITH_YOUR_D1_DATABASE_ID کنید
```

از این به بعد `npm run deploy` (یا هر push) همه‌کار را انجام می‌دهد: بیلد فرانت، اعمال اسکیمای D1 (idempotent)، و استقرار ورکر.

اجرای محلی:

```bash
npm run dev:full   # بیلد + D1 محلی + wrangler dev روی 0.0.0.0:5173
```

## احراز هویت

ایمیل/رمز عبور با هش PBKDF2 در D1 و نشست‌های Bearer Token — بدون سرویس خارجی.
