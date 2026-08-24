# miliconfig Pro

پنل مدیریت استقرار ورکرهای کلودفلر — بک‌اند روی **Cloudflare Workers + D1**، بدون Supabase.

## معماری

- **فرانت‌اند:** React + Vite + Tailwind (SPA با HashRouter) در `src/`
- **بک‌اند:** Cloudflare Worker در `worker/` — همه‌ی APIها زیر `/api/*`
- **دیتابیس:** Cloudflare D1 (`DB` binding) — اسکیمای کامل در `d1/schema.sql`
- **استقرار ورکرها:** موتور استقرار (`worker/deploy.ts`) با API کلودفلر: ساخت KV، آپلود اسکریپت و فعال‌سازی workers.dev
- **ربات تلگرام:** وب‌هوک روی `/api/webhooks/telegram`

## راه‌اندازی

```bash
bun install
# ساخت دیتابیس D1 و اعمال اسکیما:
npx wrangler d1 create miliconfig-pro
# سپس database_id را در wrangler.toml جای‌گزین کنید و:
npx wrangler d1 execute miliconfig-pro --remote --file=d1/schema.sql

# اجرای محلی:
npm run dev        # فقط فرانت (API نیاز به wrangler dev دارد)
npm run build && npm run deploy   # استقرار روی کلودفلر
```

## احراز هویت

ایمیل/رمز عبور با هش PBKDF2 در D1 و نشست‌های Bearer Token — بدون سرویس خارجی.
