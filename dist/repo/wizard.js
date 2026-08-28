/* ============================================================
   miliconfig — Deploy Wizard  (static, runs on Cloudflare Pages)
   Deploys the refactored edge-relay worker via api.cloudflare.com
   NOTE: api() goes through /__cf same-origin proxy (_worker.js)
   ============================================================ */
(function () {
'use strict';

/* ---- worker source fallback URL (override in UI if needed) ---- */
var WORKER_SOURCE_URL = './worker-source.js';
var API = 'https://api.cloudflare.com/client/v4';   // legacy, unused now (proxy handles it)
var COMPAT = '2025-01-01';

/* ---- i18n ---- */
var DICT = {
en: {
 brand_sub:'deploy wizard', sig_idle:'idle', sig_verify:'verifying', sig_online:'connected', sig_error:'error',
 rail_title:'deployment pipeline',
 step_token_t:'API token', step_token_d:'verify & scope check',
 step_account_t:'account', step_account_d:'target cloudflare account',
 step_method_t:'method', step_method_d:'workers or pages',
 step_config_t:'configure', step_config_d:'name, uuid, domain',
 step_deploy_t:'deploy', step_deploy_d:'build & ship to edge',
 ey_auth:'authorization', h_token:'Hand over the keys',
 lede_token:'Paste a Cloudflare API token. It never leaves your browser except to call api.cloudflare.com directly. Grant only the scopes below.',
 f_token_label:'Cloudflare API token', f_token_ph:'paste token…',
 f_remember:'Remember token on this device (localStorage)',
 f_remember_help:'Off by default. If enabled, the token is stored in your browser only — clear it anytime with Reset.',
 scopes_title:'required token permissions', copy_scopes:'copy list',
 open_dash:'Create a token in the dashboard →',
 scopes_hint:'use “Custom token”, add the permissions above, scope to “All accounts” / “All zones”.',
 f_verify_btn:'Verify & continue →',
 ey_target:'target', h_account:'Choose the account', lede_account:'The worker and its KV namespace will be created under this account.',
 f_account_label:'Cloudflare account', btn_continue:'Continue →', btn_back:'← Back',
 ey_runtime:'runtime', h_method:'Pick the runtime', lede_method:'Both host the same script. Workers is the recommended, fully-supported path.',
 method_workers:'Cloudflare Workers', method_workers_d:'Native KV + vars binding. One-click, robust.',
 method_pages:'Cloudflare Pages', method_pages_d:'Deployed as a _worker.js function. Bindings set via project config.',
 ey_build:'build config', h_config:'Name & tune it', lede_config:'These become the worker name, its access secret, and optional routing.',
 f_name_label:'Worker / project name', f_name_help:'lowercase, digits, hyphens · 1–63 chars · becomes <name>.workers.dev',
 f_uuid_label:'Access secret / UUID (variable u)', f_uuid_help:'this is your private panel key — keep it secret',
 f_path_label:'Custom path (variable d) — optional', f_path_ph:'e.g. mypath', f_path_help:'if set, the panel is reached via /<path> instead of /<uuid>',
 f_domain_label:'Custom domain — optional', f_domain_ph:'e.g. relay.example.com', f_domain_help:'requires a zone on this account (Zone · Read). Leave empty to use workers.dev / pages.dev',
 f_zone_label:'Zone for the custom domain', adv_src:'advanced · worker source',
 f_source_label:'Source URL override', f_source_help:'the wizard first reads ./worker-source.js next to itself, then this URL',
 btn_deploy:'⚡ Deploy now', btn_retry:'↻ Retry',
 ey_ship:'shipping', h_deploy:'Deploying to the edge',
 res_title:'Live on the edge 🎉', res_lede:'Your relay is deployed. The panel is protected by your UUID / path.',
 res_base:'worker base url', res_panel:'private panel link', copy:'copy', open_panel:'open panel',
 res_note:'Keep the panel link private — anyone with it can manage the worker. Revoke by changing variable u.',
 foot_note:'miliconfig runs entirely in your browser. Token is sent only to api.cloudflare.com. Source on',
 err_token_empty:'paste a token first', err_token_invalid:'token rejected by Cloudflare', err_no_accounts:'no accounts visible — check token account scope',
 err_name_invalid:'name must be 1–63 chars: a–z, 0–9, hyphen (not at edges)', err_path_invalid:'path may contain only a–z A–Z 0–9 _ -', err_domain_needs_zone:'pick a zone for the custom domain',
 misc_copied:'copied to clipboard', misc_stored:'stored token loaded — verify to continue', misc_autocaught:'token auto-filled from clipboard — verifying…',
 l_verify:'Verifying token', l_accounts:'Listing accounts', l_zones:'Listing zones',
 l_source:'Fetching worker source', l_kv:'Creating KV namespace', l_upload:'Uploading & deploying script',
 l_devroute:'Enabling workers.dev route', l_subdomain:'Reading workers.dev subdomain',
 l_proj:'Creating Pages project', l_bind:'Binding KV & variables to project', l_pages_dep:'Uploading _worker.js deployment', l_cdom:'Attaching custom domain',
 l_done:'Deployment complete', req:'required', opt:'optional',
 qs_title:'quick start path',
 qs_step1_t:'Temp email', qs_step1_d:'A disposable inbox for the sign-up — no personal mail needed.', qs_step1_btn:'Get email',
 qs_step2_t:'Create CF account', qs_step2_d:'Sign up on Cloudflare using that temp email and verify it.', qs_step2_btn:'Sign up',
 qs_step3_t:'Create token', qs_step3_d:'Permissions are pre-loaded — open guided builder.', qs_step3_btn:'Build token',
 modal_ey:'guided · cloudflare token', modal_title:'Build your API token',
 modal_lede:'Click the button below to open Cloudflare with pre-loaded permissions. Then follow the steps: click Create Token, then Continue to summary, and finally copy your token.',
 modal_open:'Open Cloudflare Token Builder',
modal_steps:'On that page: <span>Create Token</span> → next to "Custom token" click <span>Get started</span> → permissions are already selected → click <span>Continue to summary</span> → <span>Create Token</span> → copy the token and paste it above.',
 modal_progress:'copied', modal_alldone:'All set! Now hit “Continue to summary” → “Create Token”.',
 modal_note:'After your first successful Verify, the wizard memorizes each permission\'s ID — next time this button pre-fills the form automatically.',
 modal_copyall:'Copy all names', modal_close:'Close', modal_copied:'Name copied — paste it in Cloudflare'
},
fa: {
 brand_sub:'ویزارد استقرار', sig_idle:'آماده', sig_verify:'در حال بررسی', sig_online:'متصل', sig_error:'خطا',
 rail_title:'خط لولهٔ استقرار',
 step_token_t:'توکن API', step_token_d:'بررسی و دسترسی‌ها',
 step_account_t:'حساب', step_account_d:'حساب هدف کلودفلر',
 step_method_t:'روش', step_method_d:'ورکرز یا پیجز',
 step_config_t:'پیکربندی', step_config_d:'نام، uuid، دامنه',
 step_deploy_t:'استقرار', step_deploy_d:'ساخت و ارسال به لبه',
 ey_auth:'احراز هویت', h_token:'کلیدها را تحویل بده',
 lede_token:'یک توکن API کلودفلر بچسبان. توکن هرگز از مرورگر خارج نمی‌شود مگر برای فراخوانی مستقیم api.cloudflare.com. فقط دسترسی‌های زیر را بده.',
 f_token_label:'توکن API کلودفلر', f_token_ph:'توکن را بچسبان…',
 f_remember:'توکن روی این دستگاه بماند (localStorage)',
 f_remember_help:'پیش‌فرض خاموش. اگر روشن شود، توکن فقط در مرورگر تو ذخیره می‌شود — هر وقت خواستی با بازنشانی پاک کن.',
 scopes_title:'دسترسی‌های مورد نیاز توکن', copy_scopes:'کپی لیست',
 open_dash:'ساخت توکن در داشبورد →',
 scopes_hint:'از “Custom token” استفاده کن، دسترسی‌های بالا را اضافه کن و محدوده را “All accounts” / “All zones” بگذار.',
 f_verify_btn:'بررسی و ادامه →',
 ey_target:'هدف', h_account:'حساب را انتخاب کن', lede_account:'ورکر و فضای KV آن زیر این حساب ساخته می‌شوند.',
 f_account_label:'حساب کلودفلر', btn_continue:'ادامه →', btn_back:'→ برگشت',
 ey_runtime:'محیط اجرا', h_method:'محیط اجرا را انتخاب کن', lede_method:'هر دو یک اسکریپت را میزبانی می‌کنند. Workers مسیر پیشنهادی و کاملاً پشتیبانی‌شده است.',
 method_workers:'Cloudflare Workers', method_workers_d:'اتصال بومی KV و متغیرها. یک‌کلیکی و مطمئن.',
 method_pages:'Cloudflare Pages', method_pages_d:'به‌عنوان تابع _worker.js مستقر می‌شود. اتصال‌ها از طریق پیکربندی پروژه.',
 ey_build:'پیکربندی ساخت', h_config:'نام‌گذاری و تنظیم', lede_config:'این‌ها نام ورکر، رمز دسترسی و مسیریابی اختیاری می‌شوند.',
 f_name_label:'نام ورکر / پروژه', f_name_help:'حروف کوچک، عدد، خط‌تیره · ۱–۶۳ کاراکتر · می‌شود <name>.workers.dev',
 f_uuid_label:'رمز دسترسی / UUID (متغیر u)', f_uuid_help:'این کلید خصوصی پنل توست — محرمانه نگه دار',
 f_path_label:'مسیر سفارشی (متغیر d) — اختیاری', f_path_ph:'مثلاً mypath', f_path_help:'اگر تنظیم شود، پنل از /<path> در دسترس است نه /<uuid>',
 f_domain_label:'دامنهٔ سفارشی — اختیاری', f_domain_ph:'مثلاً relay.example.com', f_domain_help:'نیاز به یک zone روی این حساب دارد (Zone · Read). برای استفاده از workers.dev / pages.dev خالی بگذار',
 f_zone_label:'Zone برای دامنهٔ سفارشی', adv_src:'پیشرفته · منبع ورکر',
 f_source_label:'جایگزینی URL منبع', f_source_help:'ویزارد اول ./worker-source.js کنار خودش را می‌خواند، بعد این URL را',
 btn_deploy:'⚡ همین الان مستقر کن', btn_retry:'↻ تلاش دوباره',
 ey_ship:'ارسال', h_deploy:'در حال استقرار روی لبه',
 res_title:'روی لبه زنده شد 🎉', res_lede:'رلهٔ تو مستقر شد. پنل با UUID / مسیر تو محافظت می‌شود.',
 res_base:'آدرس پایهٔ ورکر', res_panel:'لینک خصوصی پنل', copy:'کپی', open_panel:'باز کردن پنل',
 res_note:'لینک پنل را خصوصی نگه دار — هر کس آن را داشته باشد می‌تواند ورکر را مدیریت کند. با تغییر متغیر u ابطال کن.',
 foot_note:'miliconfig کاملاً در مرورگر تو اجرا می‌شود. توکن فقط به api.cloudflare.com فرستاده می‌شود. منبع روی',
 err_token_empty:'اول یک توکن بچسبان', err_token_invalid:'توکن توسط کلودفلر رد شد', err_no_accounts:'هیچ حسابی دیده نمی‌شود — محدودهٔ حساب توکن را بررسی کن',
 err_name_invalid:'نام باید ۱–۶۳ کاراکتر باشد: a–z، 0–9، خط‌تیره (نه در ابتدا/انتها)', err_path_invalid:'مسیر فقط مجاز به a–z A–Z 0–9 _ -', err_domain_needs_zone:'برای دامنهٔ سفارشی یک zone انتخاب کن',
 misc_copied:'در کلیپ‌بورد کپی شد', misc_stored:'توکن ذخیره‌شده بارگذاری شد — برای ادامه بررسی کن', misc_autocaught:'توکن به‌صورت خودکار از کلیپ‌بورد گرفته شد — در حال بررسی…',
 l_verify:'بررسی توکن', l_accounts:'فهرست حساب‌ها', l_zones:'فهرست zoneها',
 l_source:'دریافت منبع ورکر', l_kv:'ساخت فضای KV', l_upload:'آپلود و استقرار اسکریپت',
 l_devroute:'فعال‌سازی مسیر workers.dev', l_subdomain:'خواندن زیردامنهٔ workers.dev',
 l_proj:'ساخت پروژهٔ Pages', l_bind:'اتصال KV و متغیرها به پروژه', l_pages_dep:'آپلود استقرار _worker.js', l_cdom:'اتصال دامنهٔ سفارشی',
 l_done:'استقرار کامل شد', req:'الزامی', opt:'اختیاری',
 qs_title:'مسیر شروع سریع',
 qs_step1_t:'ایمیل موقت', qs_step1_d:'یک صندوق یک‌بارمصرف برای ثبت‌نام — بدون نیاز به ایمیل شخصی.', qs_step1_btn:'دریافت ایمیل',
 qs_step2_t:'ساخت اکانت کلودفلر', qs_step2_d:'با همان ایمیل موقت در کلودفلر ثبت‌نام و تأییدش کن.', qs_step2_btn:'ثبت‌نام',
 qs_step3_t:'ساخت توکن', qs_step3_d:'دسترسی‌ها از قبل آماده‌اند — سازندهٔ راهنما را باز کن.', qs_step3_btn:'ساخت توکن',
 modal_ey:'راهنما · توکن کلودفلر', modal_title:'توکن API خود را بساز',
 modal_lede:'صفحهٔ کلودفلر را باز کن، بعد ردیف‌های زیر را اضافه کن. نام‌ها انگلیسی‌اند چون رابط کلودفر انگلیسی است — هر کدام را در کادر جستجوی dropdown وسط پیست کن.',
 modal_open:'باز کردن صفحهٔ ساخت توکن کلودفر',
 modal_steps:'در آن صفحه: <span>Create Token</span> → جلوی “Custom token” روی <span>Get started</span> بزن → برای هر مورد زیر با <span>Add more</span> یک ردیف بساز → بعد <span>Continue to summary</span> → <span>Create Token</span> → توکن را کپی کن و بالا بچسبان.',
 modal_progress:'کپی‌شده', modal_alldone:'همه آماده‌اند! حالا “Continue to summary” → “Create Token” را بزن.',
 modal_note:'بعد از اولین تأیید (Verify) موفق، ویزارد شناسهٔ هر دسترسی را به‌خاطر می‌سپارد — دفعهٔ بعد این دکمه فرم را خودکار می‌چیند.',
 modal_copyall:'کپی همهٔ نام‌ها', modal_close:'بستن', modal_copied:'نام کپی شد — در کلودفر پیست کن'
}
};
var SCOPES = [
 {key:'account.workers_kv.edit',    scope:'Account', resource:'Workers KV Storage', effect:'Edit', req:true, id:'', en:'Account · Workers KV Storage · Edit', fa:'حساب · Workers KV Storage · Edit'},
 {key:'account.workers_scripts.edit',scope:'Account', resource:'Workers Scripts',    effect:'Edit', req:true, id:'', en:'Account · Workers Scripts · Edit',    fa:'حساب · Workers Scripts · Edit'},
 {key:'account.pages.edit',         scope:'Account', resource:'Cloudflare Pages',    effect:'Edit', req:true, id:'', en:'Account · Cloudflare Pages · Edit',     fa:'حساب · Cloudflare Pages · Edit'},
 {key:'account.settings.read',      scope:'Account', resource:'Account Settings',    effect:'Read', req:true, id:'', en:'Account · Account Settings · Read',     fa:'حساب · Account Settings · Read'},
 {key:'zone.zone.read',             scope:'Zone',    resource:'Zone',                effect:'Read', req:true, id:'', en:'Zone · Zone · Read',                    fa:'زون · Zone · Read'},
 {key:'account.d1.edit',            scope:'Account', resource:'D1',                  effect:'Edit', req:false,id:'', en:'Account · D1 · Edit',                   fa:'حساب · D1 · Edit'},
 {key:'zone.workers_routes.edit',   scope:'Zone',    resource:'Workers Routes',      effect:'Edit', req:false,id:'', en:'Zone · Workers Routes · Edit',          fa:'زون · Workers Routes · Edit'}
];

/* ---- state ---- */
var S = {
 lang: detectLang(), theme: localStorage.getItem('ef_theme') || 'dark',
 token: '', accountId: '', accountName: '', method: 'workers',
 scriptName: '', uuid: '', customPath: '', customDomain: '', zoneId: '',
 sourceUrl: WORKER_SOURCE_URL, accounts: [], zones: []
};

function detectLang(){
  var c = (document.cookie.match(/preferredLanguage=([^;]+)/)||[])[1];
  var ls = localStorage.getItem('preferredLanguage');
  var v = c || ls || (navigator.language||'').slice(0,2);
  return v === 'fa' ? 'fa' : 'en';
}
function T(k){ return (DICT[S.lang] && DICT[S.lang][k]) || DICT.en[k] || k; }
function $(s,r){ return (r||document).querySelector(s); }
function $all(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }

/* ---- i18n apply ---- */
function applyI18n(){
  document.documentElement.lang = S.lang === 'fa' ? 'fa' : 'en';
  document.documentElement.dir = S.lang === 'fa' ? 'rtl' : 'ltr';
  document.documentElement.classList.toggle('lang-fa', S.lang === 'fa');
  $all('[data-i18n]').forEach(function(el){ el.textContent = T(el.getAttribute('data-i18n')); });
  $all('[data-i18n-ph]').forEach(function(el){ el.setAttribute('placeholder', T(el.getAttribute('data-i18n-ph'))); });
  $('#langSel').value = S.lang;
  renderScopes();
}
function renderScopes(){
  var ul = $('#scopeList'); ul.innerHTML = '';
  SCOPES.forEach(function(s){
    var li = document.createElement('li');
    li.innerHTML = '<span class="tag '+(s.req?'req':'opt')+'">'+(s.req?T('req'):T('opt'))+'</span><span class="nm">'+(S.lang==='fa'?s.fa:s.en)+'</span>';
    ul.appendChild(li);
  });
}

/* ---- theme ---- */
function applyTheme(){
  document.documentElement.setAttribute('data-theme', S.theme);
  $('#themeBtn').textContent = S.theme === 'light' ? '☾' : '☀';
}

/* ---- toast ---- */
var toastT;
function toast(msg){ var t=$('#toast'); t.textContent=msg; t.classList.add('on'); clearTimeout(toastT); toastT=setTimeout(function(){t.classList.remove('on');},2200); }

/* ---- api (SAME-ORIGIN via /__cf proxy — no CORS preflight) ---- */
function api(method, path, body, extraHeaders) {
  extraHeaders = extraHeaders || {};
  var h = { 'X-CF-Token': S.token };          // same-origin header → no preflight
  var b;
  if (body !== undefined) {
    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      b = body;                                 // multipart deploy upload: let fetch set boundary
    } else if (typeof body === 'string') {
      b = body;
    } else {
      h['Content-Type'] = 'application/json';
      b = JSON.stringify(body);
    }
  }
  // merge caller headers (e.g. multipart Content-Type) but never Authorization
  Object.keys(extraHeaders).forEach(function (k) {
    if (k.toLowerCase() !== 'authorization') h[k] = extraHeaders[k];
  });

  return fetch('/__cf' + path, { method: method, headers: h, body: b }).then(function (r) {
    var ct = r.headers.get('content-type') || '';
    return (ct.indexOf('json') > -1 ? r.json() : r.text()).then(function (data) {
      if (!r.ok || (data && data.success === false)) {
        var msg = (data && data.errors && data.errors.map(function (e) { return e.message; }).join('; '))
          || (typeof data === 'string' ? data.slice(0, 180) : ('HTTP ' + r.status));
        var err = new Error(msg || ('HTTP ' + r.status)); err.status = r.status; throw err;
      }
      return data;
    });
  });
}

/* ---- utils ---- */
function genUuid(){
  try { return crypto.randomUUID(); }
  catch(e){ return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){var r=Math.random()*16|0;return (c==='x'?r:(r&0x3|0x8)).toString(16);}); }
}
function genName(){ return 'edge-relay-' + genUuid().slice(0,4); }
function validName(n){ return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(n||''); }
function validPath(p){ return !p || /^\/?[A-Za-z0-9_-]+$/.test(p); }
function validHost(h){ return !h || /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(h); }
function copy(text){ if(navigator.clipboard) navigator.clipboard.writeText(text).then(function(){toast(T('misc_copied'));}); }
function now(){ var d=new Date(); return ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2)+':'+('0'+d.getSeconds()).slice(-2); }

/* ---- stepper / nav ---- */
var TOTAL = 5;
function gotoStep(n){
  $all('.sec').forEach(function(s){ s.classList.toggle('on', +s.getAttribute('data-sec') === n); });
  $all('.step').forEach(function(s){ var i=+s.getAttribute('data-step'); s.classList.toggle('active', i===n); s.classList.toggle('done', i<n); });
  $('#progBar').style.width = ((n-1)/(TOTAL-1)*100) + '%';
  var crumbKey = ['','step_token_t','step_account_t','step_method_t','step_config_t','step_deploy_t'][n];
  $('#crumbStep').textContent = T(crumbKey);
}
function setSig(s, txt){ $('#sig').setAttribute('data-s', s); if(txt) $('#sigTxt').textContent = txt; }
function showErr(id, msg){ var e=$('#'+id); if(!e) return; e.textContent=msg; e.classList.add('on'); }
function clearErr(id){ var e=$('#'+id); if(e) e.classList.remove('on'); }

/* ---- log ---- */
function logClear(){ $('#log').innerHTML=''; }
function log(text, level){
  var box=$('#log'); var ln=document.createElement('div'); ln.className='ln';
  ln.innerHTML='<span class="tm">'+now()+'</span><span class="'+(level||'step')+'">'+escapeHtml(text)+'</span>';
  box.appendChild(ln); box.scrollTop = box.scrollHeight; return ln;
}
function logCaret(){ var box=$('#log'); var c=document.createElement('span'); c.className='caret'; c.id='liveCaret'; var last=box.lastElementChild; if(last) last.appendChild(c); box.scrollTop=box.scrollHeight; }
function removeCaret(){ var c=$('#liveCaret'); if(c) c.remove(); }
function escapeHtml(s){ return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
function timed(labelKey){ log('› ' + T(labelKey) + '…', 'step'); var t0=Date.now(); logCaret();
  return function ok(){ removeCaret(); var last=$('#log').lastElementChild; if(last){ var sp=last.querySelector('.step'); if(sp){ sp.className='ok'; sp.textContent='✓ '+T(labelKey)+' ('+(Date.now()-t0)+'ms)'; } } };
}

/* ---- step 1: verify ---- */
function doVerify(){
  clearErr('tokenErr');
  S.token = $('#token').value.trim();
  if (!S.token) { $('#token').classList.add('bad'); showErr('tokenErr', T('err_token_empty')); return; }
  $('#token').classList.remove('bad');
  setSig('verify', T('sig_verify'));
  var btn=$('#act1'); btn.disabled=true;
  var d1 = timed('l_verify');
  api('GET', '/user/tokens/verify').then(function(res){
    if (!res.result || res.result.status !== 'active') throw new Error(T('err_token_invalid'));
    d1();
    var d2 = timed('l_accounts');
    return api('GET', '/accounts?per_page=50').then(function(res){
      d2();
      S.accounts = (res.result || []);
      if (!S.accounts.length) throw new Error(T('err_no_accounts'));
      fillAccounts();
      if (S.accounts.length === 1) { S.accountId = S.accounts[0].id; S.accountName = S.accounts[0].name; }
      setSig('online', T('sig_online'));
      api('GET', '/user/tokens/permission_groups').then(function(r){ hydrateScopeIds(r.result); }).catch(function(){});
      if ($('#remember').checked) localStorage.setItem('ef_token', S.token); else localStorage.removeItem('ef_token');
      saveCfg();
      setTimeout(function(){ gotoStep(2); }, 350);
    });
  }).catch(function(e){
    removeCaret(); log('✗ ' + e.message, 'err');
    setSig('error', T('sig_error')); $('#token').classList.add('bad'); showErr('tokenErr', e.message);
  }).finally(function(){ btn.disabled=false; });
}
function fillAccounts(){
  var sel=$('#account'); sel.innerHTML='';
  S.accounts.forEach(function(a){ var o=document.createElement('option'); o.value=a.id; o.textContent=a.name+' ('+a.id.slice(0,8)+'…)'; sel.appendChild(o); });
  if (S.accountId) sel.value = S.accountId;
}

/* ---- step 4 zones ---- */
function loadZones(){
  var zf=$('#zoneField'), zsel=$('#zone');
  api('GET', '/zones?per_page=50&status=active').then(function(res){
    S.zones = res.result || [];
    zsel.innerHTML = '<option value="">—</option>';
    S.zones.forEach(function(z){ var o=document.createElement('option'); o.value=z.id; o.textContent=z.name; zsel.appendChild(o); });
  }).catch(function(){ S.zones=[]; });
}

/* ---- source fetch ---- */
function fetchSource(){
  var urls = ['./worker-source.js', S.sourceUrl].filter(Boolean);
  var i = 0;
  function tryNext(){
    if (i >= urls.length) throw new Error('worker source not found at ' + urls.join(' / '));
    var u = urls[i++];
    return fetch(u).then(function(r){ if(!r.ok) throw 0; return r.text(); }).then(function(t){
      if (t && t.indexOf('export default') > -1) return t; throw 0;
    }).catch(function(){ return tryNext(); });
  }
  return tryNext();
}

/* ---- deploy ---- */
function buildFormData(code, kvId){
  var meta = {
    main_module: 'worker.js', compatibility_date: COMPAT,
    bindings: [
      { type:'kv_namespace', name:'C', namespace_id: kvId },
      { type:'plain_text', name:'u', text: S.uuid },
      { type:'plain_text', name:'d', text: S.customPath || '' },
      { type:'plain_text', name:'p', text: '' }
    ]
  };
  var fd = new FormData();
  fd.append('metadata', new Blob([JSON.stringify(meta)], { type:'application/json' }));
  fd.append('worker.js', new Blob([code], { type:'application/javascript+module' }), 'worker.js');
  return fd;
}

function deploy(){
  logClear(); $('#resultSlot').innerHTML=''; $('#retryBtn').style.display='none';
  setSig('verify', T('sig_verify'));
  var name = S.scriptName, acc = S.accountId;

  var code, kvId, baseUrl, panelKey = S.customPath || S.uuid;

  Promise.resolve().then(function(){
    var d = timed('l_source'); return fetchSource().then(function(c){ code=c; d(); log('   ' + code.length + ' bytes · module worker', 'ok'); });
  }).then(function(){
    var d = timed('l_kv');
    return api('POST', '/accounts/'+acc+'/storage/kv/namespaces', { title: name + '-kv' }).then(function(r){ kvId=r.result.id; d(); });
  }).then(function(){
    if (S.method === 'workers') return deployWorkers(code, kvId, name, acc).then(function(u){ baseUrl=u; });
    return deployPages(code, kvId, name, acc).then(function(u){ baseUrl=u; });
  }).then(function(){
    if (!S.customDomain) return;
    var d = timed('l_cdom');
    var p = S.method === 'workers'
      ? api('PUT', '/accounts/'+acc+'/workers/domains', { environment:'production', hostname:S.customDomain, service:name, zone_id:S.zoneId })
      : api('POST', '/accounts/'+acc+'/pages/projects/'+name+'/domains', { domain:S.customDomain });
    return p.then(function(){ d(); }).catch(function(e){ removeCaret(); log('⚠ custom domain: ' + e.message, 'warn'); });
  }).then(function(){
    log('✓ ' + T('l_done'), 'ok');
    setSig('online', T('sig_online'));
    var finalBase = S.customDomain ? ('https://' + S.customDomain) : baseUrl;
    showResult(finalBase, finalBase + '/' + panelKey, kvId);
    $all('.step').forEach(function(s){ if(+s.getAttribute('data-step')<=5) s.classList.add('done'); });
    $('#progBar').style.width='100%';
  }).catch(function(e){
    removeCaret(); log('✗ ' + e.message, 'err');
    setSig('error', T('sig_error')); $('#retryBtn').style.display='inline-flex';
  });
}

function deployWorkers(code, kvId, name, acc){
  var d = timed('l_upload');
  return api('PUT', '/accounts/'+acc+'/workers/scripts/'+name, buildFormData(code, kvId)).then(function(){ d(); })
  .then(function(){
    // 1) روشن‌کردن زیردامنهٔ کلی workers.dev برای کل حساب (اگر قبلاً نبوده)
    var d2 = timed('l_devroute');
    return api('PUT', '/accounts/'+acc+'/workers/subdomain', { enabled:true })
      .then(function(){ d2(); })
      .catch(function(e){ d2(); removeCaret(); log('⚠ global workers.dev: '+(e&&e.message||e)+' (ادامه می‌دهیم)', 'warn'); });
  })
  .then(function(){
    // 2) روشن‌کردن route workers.dev برای همین script — هر دو endpoint، مستقل از هم
    log('› enabling workers.dev route for this script…', 'step');
    var perScript = api('PUT', '/accounts/'+acc+'/workers/scripts/'+name+'/subdomain', { enabled:true })
      .catch(function(){ return api('POST', '/accounts/'+acc+'/workers/scripts/'+name+'/subdomain', { enabled:true }).catch(function(){ return null; }); });
    var viaSettings = api('PUT', '/accounts/'+acc+'/workers/scripts/'+name+'/settings', { workers_dev:true, preview_version_id:null }).catch(function(){ return null; });
    return Promise.all([perScript, viaSettings]).then(function(res){
      if (!res[0] && !res[1]) {
        log('⚠ route خودکار فعال نشد — در داشبورد: Workers → '+name+' → Settings → Triggers → workers.dev را دستی روشن کن', 'warn');
      } else {
        log('✓ workers.dev route enabled', 'ok');
      }
    });
  })
  .then(function(){
    var d4 = timed('l_subdomain');
    return api('GET', '/accounts/'+acc+'/workers/subdomain').then(function(r){
      d4();
      var sub = r.result && r.result.subdomain;
      return sub ? ('https://'+name+'.'+sub+'.workers.dev') : ('https://'+name+'.workers.dev');
    });
  });
}

function deployPages(code, kvId, name, acc){
  var d = timed('l_proj');
  return api('POST', '/accounts/'+acc+'/pages/projects', { name:name, production_branch:'main' })
    .then(function(){ d(); })
    .catch(function(e){ removeCaret(); log('· project exists, reusing', 'warn'); })
  .then(function(){
    var d2 = timed('l_bind');
    var cfg = { deployment_configs:{ production:{
      compatibility_date: COMPAT,
      kv_namespaces:{ C:{ namespace_id: kvId } },
      environment_variables:{ u:{ value:S.uuid, type:'plain_text' }, d:{ value:S.customPath||'', type:'plain_text' }, p:{ value:'', type:'plain_text' } }
    }}};
    return api('PATCH', '/accounts/'+acc+'/pages/projects/'+name, cfg).then(function(){ d2(); }).catch(function(e){ removeCaret(); log('⚠ bindings: ' + e.message + ' (set manually in Pages → Settings)', 'warn'); });
  })
  .then(function(){
    var d3 = timed('l_pages_dep');
    var fd = new FormData();
    fd.append('_worker.js', new Blob([code], { type:'application/javascript' }), '_worker.js');
    fd.append('branch', 'main');
    return api('POST', '/accounts/'+acc+'/pages/projects/'+name+'/deployments', fd).then(function(r){ d3(); return (r.result && r.result.url) || ('https://'+name+'.pages.dev'); });
  });
}

function showResult(base, panel, kvId){
  var slot=$('#resultSlot');
  slot.innerHTML =
   '<div class="result"><span class="ring"></span>'+
     '<div class="chk">✓</div>'+
     '<h3>'+T('res_title')+'</h3><p>'+T('res_lede')+'</p>'+
     '<div class="linkbox"><div class="k">'+T('res_panel')+'</div>'+
       '<div class="linkrow"><div class="v" id="panelUrl">'+escapeHtml(panel)+'</div><button class="btn" id="cpPanel">'+T('copy')+'</button><a class="btn btn-primary" id="openPanel" href="'+escapeHtml(panel)+'" target="_blank" rel="noopener">'+T('open_panel')+'</a></div>'+
     '</div>'+
     '<div class="linkbox"><div class="k">'+T('res_base')+'</div>'+
       '<div class="linkrow"><div class="v">'+escapeHtml(base)+'</div><button class="btn" id="cpBase">'+T('copy')+'</button></div>'+
     '</div>'+
     '<div class="meta"><span>'+S.method+'</span><span>'+escapeHtml(S.scriptName)+'</span><span>KV '+escapeHtml(kvId.slice(0,8))+'…</span></div>'+
     '<div class="note"><span>🔒</span><span>'+T('res_note')+'</span></div>'+
   '</div>';
  $('#cpPanel').onclick=function(){ copy(panel); };
  $('#cpBase').onclick=function(){ copy(base); };
}

/* ---- persistence (no token unless remembered) ---- */
function saveCfg(){
  localStorage.setItem('ef_cfg', JSON.stringify({ scriptName:S.scriptName, uuid:S.uuid, customPath:S.customPath, customDomain:S.customDomain, sourceUrl:S.sourceUrl, method:S.method }));
}
function loadCfg(){
  try { var c=JSON.parse(localStorage.getItem('ef_cfg')||'{}'); Object.keys(c).forEach(function(k){ if(c[k]) S[k]=c[k]; }); } catch(e){}
}

/* ---- wire up ---- */
function init(){
  applyTheme(); loadCfg();
  if (!S.scriptName) S.scriptName = genName();
  if (!S.uuid) S.uuid = genUuid();
  $('#scriptName').value = S.scriptName;
  $('#uuid').value = S.uuid;
  $('#customPath').value = S.customPath || '';
  $('#customDomain').value = S.customDomain || '';
  $('#sourceUrl').value = S.sourceUrl || WORKER_SOURCE_URL;

  var stored = localStorage.getItem('ef_token');
  if (stored) { $('#token').value = stored; S.token = stored; $('#remember').checked = true; toast(T('misc_stored')); }

  applyI18n(); gotoStep(1);

  $('#langSel').onchange = function(){ S.lang=this.value; localStorage.setItem('preferredLanguage', S.lang); var d=new Date(); d.setFullYear(d.getFullYear()+1); document.cookie='preferredLanguage='+S.lang+'; path=/; expires='+d.toUTCString()+'; SameSite=Lax'; applyI18n(); };
  $('#themeBtn').onclick = function(){ S.theme = S.theme==='light'?'dark':'light'; localStorage.setItem('ef_theme', S.theme); applyTheme(); };
  $('#eyeBtn').onclick = function(){ var i=$('#token'); i.type = i.type==='password'?'text':'password'; };
  $('#copyScopes').onclick = function(){ copy(SCOPES.map(function(s){return s.en;}).join('\n')); };

  $('#act1').onclick = doVerify;
  $('#token').addEventListener('keydown', function(e){ if(e.key==='Enter') doVerify(); });
  $('#token').addEventListener('input', function(){ this.classList.remove('bad'); clearErr('tokenErr'); });

  $('#act2').onclick = function(){
    S.accountId = $('#account').value; var a=S.accounts.filter(function(x){return x.id===S.accountId;})[0]; S.accountName = a?a.name:'';
    if (!S.accountId) return; gotoStep(3);
  };

  $all('#methodSeg button').forEach(function(b){ b.onclick=function(){ $all('#methodSeg button').forEach(function(x){x.setAttribute('aria-checked','false');}); b.setAttribute('aria-checked','true'); S.method=b.getAttribute('data-method'); }; });
  $('#act3').onclick = function(){ gotoStep(4); loadZones(); };

  $('#rerollName').onclick=function(){ S.scriptName=genName(); $('#scriptName').value=S.scriptName; };
  $('#rerollUuid').onclick=function(){ S.uuid=genUuid(); $('#uuid').value=S.uuid; };
  $('#scriptName').oninput=function(){ S.scriptName=this.value.trim().toLowerCase(); clearErr('nameErr'); };
  $('#uuid').oninput=function(){ S.uuid=this.value.trim(); };
  $('#customPath').oninput=function(){ S.customPath=this.value.trim(); clearErr('pathErr'); };
  $('#customDomain').oninput=function(){ S.customDomain=this.value.trim(); $('#zoneField').style.display=this.value?'block':'none'; clearErr('domainErr'); };
  $('#sourceUrl').oninput=function(){ S.sourceUrl=this.value.trim(); };

  $('#act4').onclick = function(){
    clearErr('nameErr'); clearErr('pathErr'); clearErr('domainErr');
    if (!validName(S.scriptName)) { showErr('nameErr', T('err_name_invalid')); return; }
    if (!validPath(S.customPath)) { showErr('pathErr', T('err_path_invalid')); return; }
    if (S.customDomain) { if(!validHost(S.customDomain)){ showErr('domainErr', T('err_path_invalid')); return; } S.zoneId=$('#zone').value; if(!S.zoneId){ showErr('domainErr', T('err_domain_needs_zone')); return; } }
    saveCfg(); gotoStep(5); deploy();
  };

  $('#retryBtn').onclick = function(){ deploy(); };
  $all('[data-back]').forEach(function(b){ b.onclick=function(){ var on=$('.sec.on'); var n=+on.getAttribute('data-sec'); if(n>1) gotoStep(n-1); }; });

  /* ambient parallax */
  window.addEventListener('pointermove', function(e){
    var x=(e.clientX/window.innerWidth-.5), y=(e.clientY/window.innerHeight-.5);
    $('.glow.a').style.transform='translate('+(x*22)+'px,'+(y*22)+'px)';
    $('.glow.b').style.transform='translate('+(x*-26)+'px,'+(y*-26)+'px)';
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

/* ============================================================
   Quick-start rail + guided token modal + self-learning prefill
   ============================================================ */
var QS_LINKS = { email:'https://tempmail.ing/', signup:'https://dash.cloudflare.com/sign-up' };
var CF_TOKENS_PAGE = 'https://dash.cloudflare.com/profile/api-tokens';

function norm(s){ return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, ''); }
var SCOPE_MATCH = {
 'account.workers_kv.edit':     { sig:'workerskvstorage', eff:'edit', anti:[] },
 'account.workers_scripts.edit':{ sig:'workersscripts',   eff:'edit', anti:[] },
 'account.pages.edit':          { sig:'pages',            eff:'edit', anti:['workers'] },
 'account.settings.read':       { sig:'settings',         eff:'read', anti:[] },
 'zone.zone.read':              { sig:'zone',             eff:'read', anti:['workers','dns','settings'] },
 'account.d1.edit':             { sig:'d1',               eff:'edit', anti:[] },
 'zone.workers_routes.edit':    { sig:'workersroutes',    eff:'edit', anti:[] }
};
function hydrateScopeIds(groups){
  (groups || []).forEach(function(g){
    var n = norm(g.name);
    Object.keys(SCOPE_MATCH).forEach(function(key){
      var m = SCOPE_MATCH[key];
      if (n.indexOf(m.sig) > -1 && n.indexOf(m.eff) > -1 && m.anti.every(function(a){ return n.indexOf(a) === -1; })) {
        var sc = SCOPES.filter(function(s){ return s.key === key; })[0];
        if (sc && !sc.id && g.id) sc.id = g.id;
      }
    });
  });
  var map = {}; SCOPES.forEach(function(s){ if (s.id) map[s.key] = s.id; });
  try { localStorage.setItem('ef_scope_ids', JSON.stringify(map)); } catch (e) {}
}
function restoreScopeIds(){
  try { var map = JSON.parse(localStorage.getItem('ef_scope_ids') || '{}'); SCOPES.forEach(function(s){ if (map[s.key]) s.id = map[s.key]; }); } catch (e) {}
}
function buildPrefillUrl(){
  var ids = SCOPES.map(function(s){ return s.id; }).filter(Boolean);
  if (!ids.length) return CF_TOKENS_PAGE;
  return CF_TOKENS_PAGE + '?' + ids.map(function(id, i){ return 'permissionGroups[' + i + '][id]=' + encodeURIComponent(id); }).join('&');
}

function renderChecklist(){
  var ul = $('#efCkList'); if (!ul) return; ul.innerHTML = '';
  SCOPES.forEach(function(s){
    var li = document.createElement('li'); li.className = 'ef-ck-item';
    var isRead = s.effect.toLowerCase() === 'read';
    li.innerHTML =
      '<span class="badge ' + (s.scope === 'Zone' ? 'zon' : 'acc') + '">' + s.scope + '</span>' +
      '<span class="res">' + escapeHtml(s.resource) + '</span>' +
      '<span class="eff' + (isRead ? ' read' : '') + '">' + s.effect + '</span>' +
      '<span class="tick">✓</span>' +
      '<button class="cp" type="button" data-copy="' + escapeHtml(s.resource) + '" aria-label="copy">⧉</button>';
    ul.appendChild(li);
  });
  var tot = $('#efProgTot'); if (tot) tot.textContent = SCOPES.length;
  updateProgress();
}
function updateProgress(){
  var items = $all('#efCkList .ef-ck-item');
  var done = $all('#efCkList .ef-ck-item.copied').length;
  var num = $('#efProgNum'); if (num) num.textContent = done;
  var bar = $('#efProgBar'); if (bar) bar.style.width = (items.length ? (done / items.length * 100) : 0) + '%';
  var all = $('#efAllDone'); if (all) all.classList.toggle('on', items.length > 0 && done >= items.length);
}
function markCopied(btn){
  var item = btn.closest('.ef-ck-item'); if (!item) return;
  item.classList.add('copied'); updateProgress();
  toast(T('modal_copied'));
}
function copyAllResources(){ copy(SCOPES.map(function(s){ return s.resource; }).join('\n')); }
function openTokenModal(){ 
  var m = $('#efModal'); 
  if (m){ 
    // First show the modal with instructions, user clicks button inside to open Cloudflare
    m.classList.add('on'); 
    document.body.style.overflow = 'hidden'; 
  } 
}
function closeTokenModal(){ var m = $('#efModal'); if (m){ m.classList.remove('on'); document.body.style.overflow = ''; } }

/* ---- auto-catch: watch the clipboard for a token when user comes back to this tab ----
   Cloudflare itself still requires the user to click "Continue to summary" → "Create Token"
   on dash.cloudflare.com — that consent step can't be skipped or automated from here, it's
   enforced on Cloudflare's side for account security. This only removes the copy/switch-tab/
   paste busywork *after* the user has already created the token themselves. */
var TOKEN_BUILDER_OPENED = false;
var TOKEN_LOOK_RE = /^[A-Za-z0-9_-]{30,60}$/; // CF tokens are ~40 char base64url strings

function tryAutoCatchToken(){
  if (!TOKEN_BUILDER_OPENED) return;
  if (!navigator.clipboard || !navigator.clipboard.readText) return;
  navigator.clipboard.readText().then(function(text){
    var val = String(text || '').trim();
    if (!TOKEN_LOOK_RE.test(val)) return; // not something that looks like a fresh token, leave it
    if ($('#token').value.trim() === val) return; // already filled, avoid double-verify loops
    $('#token').value = val;
    TOKEN_BUILDER_OPENED = false;
    closeTokenModal();
    toast(T('misc_autocaught') || 'token auto-filled from clipboard — verifying…');
    doVerify();
  }).catch(function(){ /* permission denied or blocked — user pastes manually, no big deal */ });
}
document.addEventListener('visibilitychange', function(){ if (document.visibilityState === 'visible') tryAutoCatchToken(); });
window.addEventListener('focus', tryAutoCatchToken);

document.addEventListener('DOMContentLoaded', function(){
  restoreScopeIds();
  renderChecklist();
  var qe = $('#qsEmail');  if (qe) qe.onclick = function(){ window.open(QS_LINKS.email, '_blank', 'noopener'); };
  var qs = $('#qsSignup'); if (qs) qs.onclick = function(){ window.open(QS_LINKS.signup, '_blank', 'noopener'); };
  var qt = $('#qsToken');  if (qt) qt.onclick = openTokenModal;
  var mo = $('#efModalOpen'); if (mo) mo.onclick = function(){ TOKEN_BUILDER_OPENED = true; window.open(buildPrefillUrl(), '_blank', 'noopener'); };
  var mc = $('#efModalClose'); if (mc) mc.onclick = closeTokenModal;
  var mc2 = $('#efModalClose2'); if (mc2) mc2.onclick = closeTokenModal;
  var ma = $('#efModalCopyAll'); if (ma) ma.onclick = copyAllResources;
  var list = $('#efCkList'); if (list) list.addEventListener('click', function(e){ var b = e.target.closest('[data-copy]'); if (b){ copy(b.getAttribute('data-copy')); markCopied(b); } });
  var modal = $('#efModal'); if (modal) modal.addEventListener('click', function(e){ if (e.target === modal) closeTokenModal(); });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closeTokenModal(); });
});
})();
