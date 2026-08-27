/* ══════════════════════════════════════════════════════════════════════════════
   ▓ HTML Page Template — Complete CSS + HTML + Client-side JavaScript
   ▓ This is the core UI: boot screen, home, config, live map, settings, about
   ══════════════════════════════════════════════════════════════════════════════ */
function 頁(request, env, cfg, info, unlocked, L) {
  const lang = cfg.lang === 'en' ? 'en' : 'fa';
  const dir = lang === 'fa' ? 'rtl' : 'ltr';
  const key = cfg.uuid || env.u || '';
  const label = JSON.stringify(LABELS[lang]).replace(/</g, '\\u003c');
  const vinfo = JSON.stringify(info);
  const popJson = JSON.stringify(站點);
  const colo = String(info.colo).replace(/"/g, '');
  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#04060f">
<title>NEXUS · ${cfg.name || 'gateway'}</title>
<link rel="icon" href="data:image/svg+xml,${編('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#04060f"/><path d="M7 24V9l9 8 9-8v15" stroke="#22d3ee" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>')}">
<style>
/* ═══════════════════════ CSS Variables & Reset ═══════════════════════ */
:root {
  --bg: #04060f; --bg2: #070b1a; --card: rgba(13,20,40,.55);
  --line: rgba(96,165,250,.14); --cy: #22d3ee; --vi: #a78bfa;
  --tx: #e2e8f0; --mut: #7d8db1; --ok: #34d399; --bad: #fb7185;
  --gold: #fbbf24;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }
body {
  background:
    radial-gradient(1200px 600px at 75% -10%, rgba(34,211,238,.08), transparent 60%),
    radial-gradient(1000px 700px at 10% 110%, rgba(167,139,250,.09), transparent 60%),
    var(--bg);
  color: var(--tx); font-family: 'Segoe UI', Tahoma, 'Vazirmatn', system-ui, sans-serif;
  overflow-x: hidden;
}

/* ═══════════════════════ Boot Screen ═══════════════════════ */
#boot {
  position: fixed; inset: 0; z-index: 100; display: flex; flex-direction: column;
  align-items: center; justify-content: center; background: var(--bg);
  transition: opacity .5s, visibility .5s;
}
#boot.off { opacity: 0; visibility: hidden; pointer-events: none; }
#boot .ring {
  width: 80px; height: 80px; border: 3px solid rgba(34,211,238,.2); border-top-color: var(--cy);
  border-radius: 50%; animation: spin 1s linear infinite;
}
#boot h2 {
  margin-top: 18px; font-size: 24px; letter-spacing: 6px; font-weight: 800;
  background: linear-gradient(90deg, var(--cy), var(--vi));
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
#boot .bl { margin-top: 16px; font-family: ui-monospace, Menlo, monospace; font-size: 11px; color: var(--mut); text-align: left; }
#boot .bl div { opacity: 0; animation: fadeIn .3s forwards; }
#boot .bl div.ok { color: var(--ok); }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes fadeIn { to { opacity: 1; } }

/* ═══════════════════════ Stars Canvas ═══════════════════════ */
#stars { position: fixed; inset: 0; z-index: 0; pointer-events: none; }

/* ═══════════════════════ Scanline Overlay ═══════════════════════ */
.scan {
  position: fixed; inset: 0; z-index: 1; pointer-events: none;
  background: repeating-linear-gradient(0deg, transparent 0 3px, rgba(148,163,184,.028) 3px 4px);
}

/* ═══════════════════════ HUD Corners ═══════════════════════ */
.hud { position: fixed; z-index: 2; pointer-events: none; opacity: .8; }
.hud.tl { top: 14px; left: 14px; border-top: 2px solid var(--cy); border-left: 2px solid var(--cy); width: 26px; height: 26px; border-radius: 6px 0 0 0; }
.hud.tr { top: 14px; right: 14px; border-top: 2px solid var(--cy); border-right: 2px solid var(--cy); width: 26px; height: 26px; border-radius: 0 6px 0 0; }
.hud.bl { bottom: 14px; left: 14px; border-bottom: 2px solid var(--cy); border-left: 2px solid var(--cy); width: 26px; height: 26px; border-radius: 0 0 0 6px; }
.hud.br { bottom: 14px; right: 14px; border-bottom: 2px solid var(--cy); border-right: 2px solid var(--cy); width: 26px; height: 26px; border-radius: 0 0 6px 0; }

/* ═══════════════════════ Layout ═══════════════════════ */
.wrap { position: relative; z-index: 3; max-width: 1180px; margin: 0 auto; padding: 20px 16px 70px; }

/* ═══════════════════════ Header ═══════════════════════ */
header {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 14px 18px; border: 1px solid var(--line); border-radius: 16px;
  background: var(--card); backdrop-filter: blur(14px); flex-wrap: wrap;
}
.logo { display: flex; align-items: center; gap: 10px; }
.logo svg { filter: drop-shadow(0 0 8px rgba(34,211,238,.5)); }
.logo b {
  font-size: 19px; letter-spacing: 2px;
  background: linear-gradient(90deg, var(--cy), var(--vi));
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.logo small { display: block; color: var(--mut); font-size: 10px; letter-spacing: 3px; }
.chips { display: flex; gap: 8px; flex-wrap: wrap; }
.chip {
  display: inline-flex; align-items: center; gap: 6px; font-size: 11px;
  padding: 5px 11px; border-radius: 99px; border: 1px solid var(--line);
  background: rgba(148,163,184,.05); color: var(--mut);
  font-family: ui-monospace, Menlo, monospace;
}
.chip b { color: var(--cy); font-weight: 600; }
.dot {
  width: 6px; height: 6px; border-radius: 99px; background: var(--ok);
  box-shadow: 0 0 8px var(--ok); animation: blink 1.6s infinite;
}
@keyframes blink { 50% { opacity: .35; } }

/* ═══════════════════════ Navigation ═══════════════════════ */
nav { display: flex; gap: 6px; margin-top: 16px; flex-wrap: wrap; }
nav button {
  display: inline-flex; align-items: center; gap: 7px; padding: 9px 16px;
  border-radius: 12px; border: 1px solid var(--line);
  background: rgba(13,20,40,.5); color: var(--mut); font-size: 13px;
  cursor: pointer; transition: .25s; font-family: inherit;
}
nav button:hover { color: var(--tx); border-color: rgba(34,211,238,.4); }
nav button.on {
  color: #031018;
  background: linear-gradient(90deg, var(--cy), #7dd3fc);
  border-color: transparent; font-weight: 700;
  box-shadow: 0 0 22px rgba(34,211,238,.35);
}

/* ═══════════════════════ Panels ═══════════════════════ */
main { margin-top: 18px; }
.panel { display: none; }
.panel.on { display: block; animation: up .45s ease both; }
@keyframes up { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }

/* ═══════════════════════ Hero Section ═══════════════════════ */
.hero {
  position: relative; padding: 56px 26px 46px; text-align: center; overflow: hidden;
  border: 1px solid var(--line); border-radius: 22px;
  background: linear-gradient(180deg, rgba(13,20,40,.7), rgba(7,11,26,.6));
  backdrop-filter: blur(14px);
}
.hero::before {
  content: ''; position: absolute; inset: -40% -20% auto; height: 120%;
  background: conic-gradient(from 120deg at 50% 40%, transparent 70%, rgba(34,211,238,.25), transparent 85%);
  animation: rot 14s linear infinite; pointer-events: none;
}
@keyframes rot { to { transform: rotate(360deg); } }
.hero > * { position: relative; z-index: 1; }
.hero h1 {
  font-size: clamp(28px, 5.5vw, 54px); font-weight: 800; line-height: 1.15;
  background: linear-gradient(92deg, #e0f2fe 10%, var(--cy) 45%, var(--vi) 90%);
  -webkit-background-clip: text; background-clip: text; color: transparent;
  text-shadow: 0 0 60px rgba(34,211,238,.25);
}
.hero p { color: var(--mut); margin-top: 12px; font-size: clamp(13px, 2.2vw, 16px); max-width: 640px; margin-inline: auto; }
.hero .tag { margin-top: 14px; font-size: 12px; letter-spacing: 1px; color: var(--vi); }
.cta { display: flex; gap: 12px; justify-content: center; margin-top: 26px; flex-wrap: wrap; }
.btn {
  display: inline-flex; align-items: center; gap: 8px; padding: 13px 26px;
  border-radius: 14px; font-size: 14px; font-weight: 700; cursor: pointer;
  transition: .25s; border: 1px solid transparent; font-family: inherit;
}
.btn.prim {
  background: linear-gradient(90deg, var(--cy), #60a5fa); color: #031018;
  box-shadow: 0 8px 30px rgba(34,211,238,.3);
}
.btn.prim:hover { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(34,211,238,.45); }
.btn.ghost { border-color: var(--line); color: var(--tx); background: rgba(148,163,184,.06); }
.btn.ghost:hover { border-color: rgba(167,139,250,.5); color: #fff; }

/* ═══════════════════════ Stats Grid ═══════════════════════ */
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-top: 22px; }
.stat { border: 1px solid var(--line); border-radius: 14px; padding: 14px; background: rgba(7,11,26,.55); }
.stat .k { font-size: 10px; color: var(--mut); letter-spacing: 1px; }
.stat .v { font-size: 20px; font-weight: 800; margin-top: 5px; color: var(--tx); font-family: ui-monospace, Menlo, monospace; }
.stat .v em { color: var(--cy); font-style: normal; }

/* ═══════════════════════ Recommendation Box ═══════════════════════ */
.rec {
  margin-top: 18px; border: 1px solid rgba(34,211,238,.3); border-radius: 16px;
  padding: 18px; background: linear-gradient(120deg, rgba(34,211,238,.08), rgba(167,139,250,.06));
}
.rec h3 { font-size: 13px; color: var(--cy); display: flex; gap: 8px; align-items: center; }
.rec p { margin-top: 8px; font-size: 13.5px; color: var(--tx); line-height: 1.9; }

/* ═══════════════════════ Cards ═══════════════════════ */
.card { border: 1px solid var(--line); border-radius: 18px; background: var(--card); backdrop-filter: blur(12px); padding: 20px; margin-top: 16px; }
.card h2 { font-size: 16px; display: flex; align-items: center; gap: 9px; color: var(--tx); }
.card h2 small { color: var(--mut); font-weight: 400; font-size: 12px; }

/* ═══════════════════════ Node Grid ═══════════════════════ */
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; margin-top: 16px; }
.node {
  border: 1px solid var(--line); border-radius: 14px; padding: 14px;
  background: rgba(7,11,26,.6); transition: .25s; position: relative; overflow: hidden;
}
.node:hover { border-color: rgba(34,211,238,.45); transform: translateY(-2px); }
.node .top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.badge { font-size: 10px; font-weight: 800; padding: 3px 9px; border-radius: 99px; letter-spacing: .5px; }
.badge.vless { background: rgba(34,211,238,.15); color: var(--cy); }
.badge.trojan { background: rgba(167,139,250,.15); color: var(--vi); }
.badge.ss { background: rgba(52,211,153,.15); color: var(--ok); }
.badge.ws { background: rgba(251,191,36,.12); color: var(--gold); }
.badge.grpc { background: rgba(96,165,250,.14); color: #93c5fd; }
.badge.xhttp { background: rgba(244,114,182,.14); color: #f9a8d4; }
.node h4 { font-size: 13px; margin-top: 9px; color: var(--tx); word-break: break-all; }
.node .meta { font-size: 11px; color: var(--mut); margin-top: 6px; font-family: ui-monospace, Menlo, monospace; word-break: break-all; }
.node .meta b { color: #a5b4fc; font-weight: 600; }
.node button {
  position: absolute; top: 12px; inset-inline-end: 12px;
  border: 1px solid var(--line); background: rgba(148,163,184,.08);
  color: var(--cy); border-radius: 9px; padding: 5px 10px; font-size: 11px;
  cursor: pointer; transition: .2s;
}
.node button:hover { background: rgba(34,211,238,.15); }

/* ═══════════════════════ Sub Row ═══════════════════════ */
.subrow { display: flex; gap: 10px; margin-top: 14px; flex-wrap: wrap; align-items: center; }
.fmt { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 12px; }
.fmt button {
  padding: 7px 14px; border-radius: 10px; border: 1px solid var(--line);
  background: rgba(148,163,184,.05); color: var(--mut); font-size: 12px;
  cursor: pointer; font-family: inherit;
}
.fmt button.on { border-color: var(--vi); color: var(--vi); background: rgba(167,139,250,.1); }
.urlbox {
  display: flex; align-items: center; gap: 8px; flex: 1; min-width: 240px;
  border: 1px solid var(--line); border-radius: 12px; padding: 9px 12px;
  background: rgba(4,6,15,.6); font-family: ui-monospace, Menlo, monospace;
  font-size: 11px; color: var(--mut); word-break: break-all;
}

/* ═══════════════════════ Client Links ═══════════════════════ */
.clientrow { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.clientrow a {
  flex: 1 1 120px; text-align: center; padding: 10px 6px; border-radius: 11px;
  font-size: 11.5px; text-decoration: none; border: 1px solid rgba(52,211,153,.3);
  color: #6ee7b7; background: rgba(52,211,153,.06); transition: .2s;
}
.clientrow a:hover { background: rgba(52,211,153,.14); }

/* ═══════════════════════ QR Box ═══════════════════════ */
.qrbox { display: flex; gap: 18px; align-items: center; flex-wrap: wrap; margin-top: 14px; }
.qrbox img { border-radius: 14px; border: 1px solid var(--line); background: #fff; width: 170px; height: 170px; }

/* ═══════════════════════ Map ═══════════════════════ */
.mapbox {
  position: relative; border: 1px solid var(--line); border-radius: 18px; overflow: hidden;
  background: radial-gradient(600px 300px at 50% 0, rgba(34,211,238,.06), transparent), #050a18;
}
.mapbox svg { display: block; width: 100%; height: auto; }
.legend { position: absolute; top: 12px; inset-inline-start: 12px; font-size: 10px; color: var(--mut); display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.legend i { width: 8px; height: 8px; border-radius: 99px; display: inline-block; margin-inline-end: 4px; }
.mapside { margin-top: 14px; display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 8px; }
.pops { font-size: 11px; border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; background: rgba(7,11,26,.55); display: flex; justify-content: space-between; }
.pops b { color: var(--cy); font-family: ui-monospace, Menlo, monospace; }

/* ═══════════════════════ Forms ═══════════════════════ */
form#cfgForm {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 14px; margin-top: 16px;
}
field {
  border: 1px solid var(--line); border-radius: 14px; padding: 13px;
  background: rgba(7,11,26,.5);
}
field legend { font-size: 11px; color: var(--mut); padding: 0 6px; letter-spacing: .5px; }
field label { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12.5px; color: var(--tx); padding: 5px 0; }
field input, field select, field textarea {
  width: 100%; margin-top: 6px; padding: 8px 10px; border: 1px solid var(--line);
  border-radius: 10px; background: rgba(4,6,15,.6); color: var(--tx); font-size: 13px;
  font-family: inherit; outline: none; transition: .2s;
}
field input:focus, field select:focus, field textarea:focus { border-color: var(--cy); }
field textarea { min-height: 60px; resize: vertical; }

/* ═══════════════════════ Switches ═══════════════════════ */
.sw {
  display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px;
  border-radius: 10px; border: 1px solid var(--line); background: rgba(148,163,184,.05);
  color: var(--mut); font-size: 12px; cursor: pointer; transition: .2s;
  user-select: none;
}
.sw.on { border-color: var(--cy); color: var(--cy); background: rgba(34,211,238,.1); }
.sw::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: var(--mut); transition: .2s; }
.sw.on::before { background: var(--cy); box-shadow: 0 0 8px var(--cy); }

/* ═══════════════════════ Actions ═══════════════════════ */
.actions { display: flex; gap: 10px; margin-top: 16px; flex-wrap: wrap; }

/* ═══════════════════════ Lock Screen ═══════════════════════ */
#lock {
  position: fixed; inset: 0; z-index: 50; display: none; align-items: center;
  justify-content: center; background: rgba(4,6,15,.92); backdrop-filter: blur(18px);
}
#lock.on { display: flex; }
.lockbox {
  text-align: center; padding: 36px; border: 1px solid var(--line); border-radius: 20px;
  background: var(--card); max-width: 380px; width: 90%;
}
.lockbox h2 { font-size: 20px; margin-bottom: 8px; }
.lockbox p { font-size: 13px; color: var(--mut); margin-bottom: 18px; }
.lockbox input {
  width: 100%; padding: 12px; border: 1px solid var(--line); border-radius: 12px;
  background: rgba(4,6,15,.6); color: var(--tx); font-size: 15px; text-align: center;
  font-family: ui-monospace, Menlo, monospace; letter-spacing: 3px; outline: none;
}
.lockbox input:focus { border-color: var(--cy); }
.lockbox button {
  margin-top: 14px; width: 100%; padding: 12px; border: none; border-radius: 12px;
  background: linear-gradient(90deg, var(--cy), #60a5fa); color: #031018;
  font-size: 15px; font-weight: 700; cursor: pointer; font-family: inherit;
}

/* ═══════════════════════ Toast ═══════════════════════ */
#toast {
  position: fixed; bottom: 22px; inset-inline-start: 50%; transform: translateX(50%) translateY(20px);
  z-index: 60; padding: 10px 22px; border-radius: 12px; font-size: 13px;
  background: var(--card); border: 1px solid var(--line); color: var(--tx);
  backdrop-filter: blur(12px); opacity: 0; transition: .3s; pointer-events: none;
  white-space: nowrap;
}
#toast.on { opacity: 1; transform: translateX(50%) translateY(0); }

/* ═══════════════════════ About ═══════════════════════ */
.about-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-top: 14px; }

/* ═══════════════════════ Responsive ═══════════════════════ */
@media (max-width: 600px) {
  .hero { padding: 36px 16px 30px; }
  .hero h1 { font-size: 28px; }
  nav button { padding: 8px 12px; font-size: 12px; }
  .grid { grid-template-columns: 1fr; }
  .stats { grid-template-columns: repeat(2, 1fr); }
  header { padding: 10px 12px; }
}
</style>
</head>
<body>
<canvas id="stars"></canvas>
<div class="scan"></div>
<div class="hud tl"></div><div class="hud tr"></div>
<div class="hud bl"></div><div class="hud br"></div>

<!-- ═══════════ Boot Screen ═══════════ -->
<div id="boot">
  <div class="ring"></div>
  <h2>NEXUS</h2>
  <div class="bl" id="bootlog"></div>
</div>

<!-- ═══════════ Lock Screen ═══════════ -->
<div id="lock">
  <div class="lockbox">
    <h2 id="lock_t"></h2>
    <p id="lock_sub"></p>
    <input type="password" id="lockkey" autocomplete="off" placeholder="••••••••">
    <button id="lockbtn"></button>
  </div>
</div>

<!-- ═══════════ Main App ═══════════ -->
<div class="wrap" id="app" style="opacity:0">
  <header>
    <div class="logo">
      <svg width="36" height="36" viewBox="0 0 36 36"><rect width="36" height="36" rx="8" fill="#04060f"/>
        <path d="M8 27V10l10 9 10-9v17" stroke="#22d3ee" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <div><b>NEXUS</b><small>THE GATEWAY TO TOMORROW</small></div>
    </div>
    <div class="chips">
      <div class="chip"><button id="langBtn" style="background:none;border:none;color:var(--cy);cursor:pointer;font-size:11px;padding:0">EN ⇄ FA</button></div>
      <div class="chip">LIVE · <b id="chipLive">00:00:00</b> <span class="dot"></span></div>
      <div class="chip">COLO · <b id="chipColo">—</b></div>
      <div class="chip">CC · <b id="chipCc">—</b></div>
      <div class="chip">CITY · <b id="chipCity">—</b></div>
    </div>
  </header>

  <nav id="tabs">
    <button data-t="home" class="on">🏠 <span></span></button>
    <button data-t="cfg">⚡ <span></span></button>
    <button data-t="map">🌍 <span></span></button>
    <button data-t="set">🧠 <span></span></button>
    <button data-t="about">🛰 <span></span></button>
  </nav>

  <main>
    <!-- ═══════════ Home Panel ═══════════ -->
    <section class="panel on" id="p-home">
      <div class="hero">
        <h1 id="hero1"></h1>
        <p id="hero2"></p>
        <div class="tag" id="hero3"></div>
        <div class="cta">
          <button class="btn prim" id="cta1"></button>
          <button class="btn ghost" id="cta2"></button>
        </div>
        <div class="stats" id="heroStats"></div>
      </div>
      <div class="rec">
        <h3 id="rec_t"></h3>
        <p id="rec_d"></p>
      </div>
    </section>

    <!-- ═══════════ Config Panel ═══════════ -->
    <section class="panel" id="p-cfg">
      <div class="card">
        <h2>⚡ <span id="nodes_t"></span></h2>
        <p id="nodes_sub" style="font-size:12.5px;color:var(--mut);margin-top:6px"></p>
        <div class="subrow">
          <div class="urlbox" id="subUrl">—</div>
          <button class="btn ghost" id="copySubBtn" style="flex-shrink:0">📋</button>
        </div>
        <div class="fmt" id="fmtBtns"></div>
        <div class="grid" id="nodeGrid"></div>
      </div>
      <div class="card" style="margin-top:16px">
        <h2>📱 <span id="clients_t"></span></h2>
        <div class="clientrow" id="clientLinks"></div>
      </div>
      <div class="card" style="margin-top:16px">
        <h2>📱 <span id="qr_t"></span></h2>
        <div class="qrbox" id="qrBox"></div>
      </div>
    </section>

    <!-- ═══════════ Map Panel ═══════════ -->
    <section class="panel" id="p-map">
      <div class="card">
        <h2>🌍 <span id="map_title"></span></h2>
        <div style="display:flex;gap:12px;margin-top:8px;flex-wrap:wrap;align-items:center;font-size:11px;color:var(--mut)">
          <span id="abCc2"></span>
          <div class="legend">
            <span><i style="background:var(--cy)"></i><span id="map_link"></span></span>
            <span><i style="background:var(--vi)"></i><span id="map_pop"></span></span>
            <span><i style="background:var(--ok)"></i><span id="map_you"></span></span>
          </div>
        </div>
        <div class="mapbox" id="mapBox"></div>
        <div class="mapside" id="mapSide"></div>
      </div>
    </section>

    <!-- ═══════════ Settings Panel ═══════════ -->
    <section class="panel" id="p-set">
      <div class="card">
        <h2>🧠 <span id="cfg_t"></span></h2>
        <p id="setSub" style="font-size:12.5px;color:var(--mut);margin-top:6px"></p>
        <form id="cfgForm">
          <field><legend id="st_proto"></legend><div id="fldProto"></div></field>
          <field><legend id="st_tr"></legend><div id="fldTr"></div></field>
          <field><legend id="st_port"></legend><div class="chipsrow" id="fldPorts"></div></field>
          <field><legend id="st_tls"></legend><label id="lblTls"></label><label id="lblFrag"></label><label id="lblEch"></label></field>
          <field><legend id="st_fp"></legend><select id="f_fp"><option>chrome</option><option>firefox</option><option>safari</option><option>random</option></select></field>
          <field><legend id="st_sni"></legend><input type="text" id="f_sni" dir="ltr"></field>
          <field><legend id="st_path"></legend><input type="text" id="f_path" dir="ltr"></field>
          <field><legend id="st_p"></legend><textarea id="f_p" dir="ltr"></textarea></field>
          <field><legend id="st_s"></legend><input type="text" id="f_s" dir="ltr" placeholder="host:port:user:pass"></field>
          <field><legend id="st_sub"></legend><input type="text" id="f_subname" dir="ltr"></field>
          <field><legend id="st_scu"></legend><input type="text" id="f_scu" dir="ltr"></field>
          <field><legend id="st_ir"></legend><div id="fldIr"></div></field>
          <field><legend id="st_danger"></legend><label id="lblDis"></label></field>
        </form>
        <div class="actions">
          <button class="btn prim" id="saveCfg"></button>
          <button class="btn ghost" id="smartBtn"></button>
        </div>

        <!-- User Profile Section -->
        <div style="margin-top:20px;border:1px solid rgba(167,139,250,.3);border-radius:16px;padding:20px;background:linear-gradient(120deg,rgba(167,139,250,.06),rgba(34,211,238,.04))">
          <h2 style="font-size:15px;color:var(--vi)">👤 <span id="user_profile"></span></h2>
          <p style="font-size:12px;color:var(--mut);margin-top:6px" id="user_profile_d"></p>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-top:14px">
            <field><legend id="user_name"></legend><input type="text" id="f_uname" dir="auto" placeholder="ali"></field>
            <field><legend id="user_transport"></legend><select id="f_utr"><option value="">auto</option><option value="ws">WebSocket</option><option value="grpc">gRPC</option><option value="xhttp">XHTTP</option></select></field>
            <field><legend id="user_sni"></legend><input type="text" id="f_usni" dir="ltr" placeholder="sni.example.com"></field>
            <field><legend id="user_path"></legend><input type="text" id="f_upath" dir="ltr" placeholder="/?ed=2560"></field>
          </div>
          <div class="actions"><button class="btn prim" id="saveUserBtn" style="background:linear-gradient(90deg,var(--vi),#c084fc)"></button></div>
        </div>
      </div>
    </section>

    <!-- ═══════════ About Panel ═══════════ -->
    <section class="panel" id="p-about">
      <div class="card">
        <h2>🛰 <span id="about_t"></span></h2>
        <p id="aboutD" style="font-size:13.5px;color:var(--mut);line-height:1.9;margin-top:10px"></p>
        <div class="about-grid">
          <div class="stat"><div class="k">VERSION</div><div class="v"><em>${VERSION}</em></div></div>
          <div class="stat"><div class="k">COLO</div><div class="v"><em>${colo}</em></div></div>
          <div class="stat"><div class="k">COUNTRY</div><div class="v"><em id="abCc"></em></div></div>
          <div class="stat"><div class="k">HOST</div><div class="v" style="font-size:13px" id="abHost"></div></div>
          <div class="stat"><div class="k">ZONE</div><div class="v"><em id="abZone"></em></div></div>
          <div class="stat"><div class="k">NODES</div><div class="v"><em id="abNodes">—</em></div></div>
          <div class="stat"><div class="k">RTT</div><div class="v"><em id="abRtt">—</em></div></div>
          <div class="stat"><div class="k">KV</div><div class="v"><em id="abKv">—</em></div></div>
        </div>
        <p style="margin-top:18px;font-size:11px;color:#475569;text-align:center" id="fPowered"></p>
      </div>
    </section>
  </main>
</div>

<div id="toast"></div>

<!-- CLIENT_JS_BELOW -->
