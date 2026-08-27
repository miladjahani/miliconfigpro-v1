/*
 *  NEXUS — The Gateway to Tomorrow
 *  ────────────────────────────────
 *  Next-gen Cloudflare Worker with smart engine, live map,
 *  advanced obfuscation, per-user profiles, and auto sub-generation.
 *
 *  Version: 3.0.0
 *  License: MIT
 */
const VERSION = '3.0.0';

/* ══════════════════════════════════════════════════════════════════════════════
   ▓ Obfuscation Vault — encrypted constants
   ▓ Two-layer: base64 → xor-shift → UTF-8
   ══════════════════════════════════════════════════════════════════════════════ */
const _vault = [
  '.TRUE', '\u004e\x45\x58\x55\x53', '\u0047\x41\x54\x45\x57\x41\x59',
  '\u0054\x4f\x20\x54\x4f\x4d\x4f\x52\x52\x4f\x57',
];
const _decoyA = () => { const _a = [1,2,3]; return _a.reduce((s,v) => s+v, 0); };
const _decoyB = (x) => { const _m = new Map(); _m.set('k', x); return _m.get('k'); };

/* ══════════════════════════════════════════════════════════════════════════════
   ▓ LABELS — bilingual UI strings (FA / EN)
   ══════════════════════════════════════════════════════════════════════════════ */
const LABELS = {
  fa: {
    t_home: 'خانه', t_cfg: 'کانفیگ', t_map: 'نقشه زنده', t_set: 'تنظیمات هوشمند', t_about: 'درباره',
    hero1: 'NEXUS', hero2: 'دروازهٔ فردا', hero3: 'موتور هوشمند · نقشهٔ زندهٔ لبه · همهٔ فرمت‌ها · بدون وابستگی',
    cta: 'شروع هوشمند', cta2: 'تنظیمات پیشرفته',
    rec_t: '🎯 پیشنهاد خودکار', rec_d: 'بر اساس موقعیت شما، بهترین تنظیمات انتخاب شد',
    nodes_t: '⚡ لیست نودها', nodes_sub: 'با کلیک روی دکمهٔ کپی، لینک را دریافت کنید',
    copy: '📋 کپی', clients_t: '📱 اپلیکیشن‌ها', qr_t: '📱 QR Code',
    cfg_t: '⚙️ تنظیمات پیشرفته',
    setSub: 'تنظیمات زنده از طریق KV ذخیره می‌شوند',
    save: '💾 ذخیره', smart: '🧠 بهینه‌سازی خودکار',
    smart_done: '✅ تنظیمات بهینه شد',
    st_proto: 'پروتکل‌ها', st_tr: 'ترانsport‌ها', st_port: 'پورت‌ها',
    st_tls: 'TLS', st_fp: 'TLS Fingerprint', st_sni: 'SNI',
    st_path: 'مسیر (Path)', st_p: 'ProxyIP', st_s: 'Shadowsocks',
    st_sub: 'نام ساب', st_scu: 'آدرس ساب',
    st_ir: 'تنظیمات ایران', st_danger: 'خطر',
    st_disable: 'غیرفعال کردن ورکر',
    about_t: '🛰 دربارهٔ NEXUS', about_d: 'NEXUS نسل جدید ورکرهای Cloudflare است — با موتور هوشمند، نقشهٔ زنده، مبهم‌سازی پیشرفته و پنل داخلی کامل. طراحی شده برای هر کاربری در هر جای جهان.',
    f_powered: 'powered by Cloudflare Workers · NEXUS v' + VERSION,
    lock_t: '🔐 قفل شده', lock_sub: 'برای ورود، کلید خود را وارد کنید',
    unlock: 'ورود', unlock_btn: 'ورود', wait: '⏳ صبر کنید...',
    done: '✅ موفق', wrong: '❌ کلید نادرست', loading: '⏳ در حال بارگذاری...',
    saved: '✅ ذخیره شد', err_save: '❌ خطا در ذخیره',
    ms: 'ms', from: 'از', copy_ok: '✅ کپی شد',
    map_title: '🌍 نقشهٔ زندهٔ دیتاسنترها',
    pop: 'дیتاسنتر', you: 'شما', link: 'لینک',
    boot1: 'Initializing quantum core...', boot2: 'Connecting to edge network...',
    boot3: 'Loading smart engine...', boot4: 'Rendering live map...', boot5: 'System ready.',
    user_profile: '👤 پروفایل کاربر', user_profile_d: 'تنظیمات شخصی خود را ذخیره کنید — برای هر کاربر متفاوت خواهد بود',
    user_name: 'نام نمایشی', user_transport: 'ترانSPORT ترجیحی', user_sni: 'SNI دلخواه', user_path: 'مسیر دلخواه',
    user_save: 'ذخیره پروفایل', user_saved: '✅ پروفایل ذخیره شد',
  },
  en: {
    t_home: 'Home', t_cfg: 'Config', t_map: 'Live Map', t_set: 'Smart Settings', t_about: 'About',
    hero1: 'NEXUS', hero2: 'The Gateway to Tomorrow', hero3: 'Smart engine · live edge map · every format · zero dependencies',
    cta: 'Smart Start', cta2: 'Advanced Settings',
    rec_t: '🎯 Auto Recommendation', rec_d: 'Based on your location, optimal settings have been selected',
    nodes_t: '⚡ Node List', nodes_sub: 'Click copy to get the link',
    copy: '📋 Copy', clients_t: '📱 Applications', qr_t: '📱 QR Code',
    cfg_t: '⚙️ Advanced Configuration',
    setSub: 'Live settings saved via KV',
    save: '💾 Save', smart: '🧠 Auto Optimize',
    smart_done: '✅ Settings optimized',
    st_proto: 'Protocols', st_tr: 'Transports', st_port: 'Ports',
    st_tls: 'TLS', st_fp: 'TLS Fingerprint', st_sni: 'SNI',
    st_path: 'Path', st_p: 'ProxyIP', st_s: 'Shadowsocks',
    st_sub: 'Sub Name', st_scu: 'Sub URL',
    st_ir: 'Iran Settings', st_danger: 'Danger Zone',
    st_disable: 'Disable Worker',
    about_t: '🛰 About NEXUS', about_d: 'NEXUS is a next-gen Cloudflare Worker with smart engine, live map, advanced obfuscation, and built-in panel. Designed for every user, everywhere.',
    f_powered: 'powered by Cloudflare Workers · NEXUS v' + VERSION,
    lock_t: '🔐 Locked', lock_sub: 'Enter your key to access',
    unlock: 'Unlock', unlock_btn: 'Unlock', wait: '⏳ Wait...',
    done: '✅ Done', wrong: '❌ Wrong key', loading: '⏳ Loading...',
    saved: '✅ Saved', err_save: '❌ Save error',
    ms: 'ms', from: 'from', copy_ok: '✅ Copied',
    map_title: '🌍 Live Datacenter Map',
    pop: 'Datacenter', you: 'You', link: 'Link',
    boot1: 'Initializing quantum core...', boot2: 'Connecting to edge network...',
    boot3: 'Loading smart engine...', boot4: 'Rendering live map...', boot5: 'System ready.',
    user_profile: '👤 User Profile', user_profile_d: 'Save your personal settings — unique for each user',
    user_name: 'Display Name', user_transport: 'Preferred Transport', user_sni: 'Custom SNI', user_path: 'Custom Path',
    user_save: 'Save Profile', user_saved: '✅ Profile saved',
  },
};
