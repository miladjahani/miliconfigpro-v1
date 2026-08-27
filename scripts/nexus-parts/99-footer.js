/* ══════════════════════════════════════════════════════════════════════════════
   ▓ Client-Side JavaScript — embedded in HTML template
   ▓ CRITICAL: boot() is called FIRST. All other init is wrapped in try/catch.
   ══════════════════════════════════════════════════════════════════════════════ */
<script>
(function(){
'use strict';

/* ─── Template-injected data ─── */
var L = ${label};
var VI = ${vinfo};
var POPS = ${popJson};
var KEY = ${JSON.stringify(key)};
var UNLOCKED = ${unlocked ? 'true' : 'false'};
var KVOK = ${KV(env) ? 'true' : 'false'};

/* ══════════════════════════════════════════════════════════════════════════════
   ▓ DOM Helpers — null-safe
   ══════════════════════════════════════════════════════════════════════════════ */
function $(id) { return document.getElementById(id); }
function $q(sel) { return document.querySelector(sel); }
function $qa(sel) { return document.querySelectorAll(sel); }
function safe(fn) { try { return fn(); } catch(e) { return null; } }

function tx(msg) {
  var t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(t._x);
  t._x = setTimeout(function(){ t.classList.remove('on'); }, 2200);
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, function(c) {
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c];
  });
}

function safeText(id, text) {
  var el = $(id);
  if (el) el.textContent = text;
  return el;
}

function safeHTML(id, html) {
  var el = $(id);
  if (el) el.innerHTML = html;
  return el;
}

/* ══════════════════════════════════════════════════════════════════════════════
   ▓ i18n — apply language labels to all elements
   ══════════════════════════════════════════════════════════════════════════════ */
function i18n() {
  var map = {
    t_home:'t_home', t_cfg:'t_cfg', t_map:'t_map', t_set:'t_set', t_about:'t_about',
    hero1:'hero1', hero2:'hero2', hero3:'hero3', cta:'cta', cta2:'cta2',
    rec_t:'rec_t', rec_d:'rec_d',
    nodes_t:'nodes_t', nodes_sub:'nodes_sub', copy:'copy',
    clients_t:'clients_t', qr_t:'qr_t', cfg_t:'cfg_t',
    setSub:'setSub', save:'save', smart:'smart',
    st_proto:'st_proto', st_tr:'st_tr', st_port:'st_port',
    st_tls:'st_tls', st_fp:'st_fp', st_sni:'st_sni',
    st_path:'st_path', st_p:'st_p', st_s:'st_s',
    st_sub:'st_sub', st_scu:'st_scu', st_ir:'st_ir',
    st_danger:'st_danger', lblDis:'st_disable',
    about_t:'about_t', about_d:'about_d', fPowered:'f_powered',
    lock_t:'lock_t', lock_sub:'lock_sub',
    map_title:'map_title', map_link:'link', map_pop:'pop', map_you:'you',
    user_profile:'user_profile', user_profile_d:'user_profile_d',
    user_name:'user_name', user_transport:'user_transport',
    user_sni:'user_sni', user_path:'user_path', user_save:'user_save',
  };
  for (var k in map) { var el = $(k); if (el && L[map[k]]) el.textContent = L[map[k]]; }
  var lockBtn = $('lockbtn');
  if (lockBtn) lockBtn.textContent = L.unlock_btn || L.unlock;
  var tabBtns = $qa('#tabs button');
  for (var i = 0; i < tabBtns.length; i++) {
    var span = tabBtns[i].querySelector('span');
    var t = tabBtns[i].getAttribute('data-t');
    if (span && L['t_' + t]) span.textContent = L['t_' + t];
  }
  document.title = 'NEXUS · ' + (VI.host || '');
}

/* ══════════════════════════════════════════════════════════════════════════════
   ▓ Boot Sequence — runs FIRST, never blocks
   ══════════════════════════════════════════════════════════════════════════════ */
function boot() {
  var bl = $('bootlog');
  var steps = [L.boot1, L.boot2, L.boot3, L.boot4, L.boot5];
  var i = 0;
  var iv = setInterval(function() {
    if (i < steps.length) {
      if (bl) {
        var d = document.createElement('div');
        d.textContent = '> ' + steps[i];
        if (i === steps.length - 1) d.className = 'ok';
        bl.appendChild(d);
      }
      i++;
    } else {
      clearInterval(iv);
      setTimeout(function() {
        var b = $('boot'); if (b) b.classList.add('off');
        var a = $('app'); if (a) a.style.opacity = '1';
        if (!UNLOCKED && KEY) {
          var lk = $('lock'); if (lk) lk.classList.add('on');
          var lkInput = $('lockkey'); if (lkInput) lkInput.focus();
        }
      }, 350);
    }
  }, 300);
}

/* ══════════════════════════════════════════════════════════════════════════════
   ▓ Tab Navigation
   ══════════════════════════════════════════════════════════════════════════════ */
function tabs() {
  var btns = $qa('#tabs button');
  if (!btns || !btns.length) return;
  for (var i = 0; i < btns.length; i++) {
    btns[i].onclick = function() {
      for (var j = 0; j < btns.length; j++) btns[j].classList.remove('on');
      this.classList.add('on');
      var t = this.getAttribute('data-t');
      var panels = $qa('.panel');
      for (var k = 0; k < panels.length; k++) panels[k].classList.remove('on');
      var target = $('p-' + t);
      if (target) target.classList.add('on');
      if (t === 'map') setTimeout(renderMap, 60);
      if (t === 'cfg' && !STATE.nodes) loadNodes();
      if (t === 'set' && !STATE.cfg) loadCfg();
    };
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
   ▓ State
   ══════════════════════════════════════════════════════════════════════════════ */
var STATE = { info: VI, nodes: null, cfg: null, fmt: 'base64', irCarriers: {} };

function api(path) {
  return fetch(path).then(function(r) { return r.json(); }).catch(function() { return null; });
}

/* ══════════════════════════════════════════════════════════════════════════════
   ▓ Home Panel
   ══════════════════════════════════════════════════════════════════════════════ */
function renderHome() {
  var h = $('heroStats');
  if (!h) return;
  var items = [
    { k: 'VERSION', v: '<em>' + VERSION + '</em>' },
    { k: 'ZONE', v: '<em>' + (VI.zone || '—') + '</em>' },
    { k: 'CC', v: '<em>' + (VI.cc || '—') + '</em>' },
    { k: 'COLO', v: '<em>' + (VI.colo || '—') + '</em>' },
    { k: 'KV', v: '<em>' + (KVOK ? 'ON' : 'OFF') + '</em>' },
    { k: 'KEY', v: '<em>' + (VI.keySet ? 'SET' : 'NONE') + '</em>' },
  ];
  var html = '';
  for (var i = 0; i < items.length; i++) {
    html += '<div class="stat"><div class="k">' + items[i].k + '</div><div class="v">' + items[i].v + '</div></div>';
  }
  h.innerHTML = html;
}

/* ══════════════════════════════════════════════════════════════════════════════
   ▓ Nodes Panel
   ══════════════════════════════════════════════════════════════════════════════ */
function loadNodes() {
  api('/api/nodes?k=' + encodeURIComponent(KEY)).then(function(d) {
    if (d && d.ok) { STATE.nodes = d; renderNodes(); }
  });
}

function renderNodes() {
  var d = STATE.nodes;
  if (!d || !d.nodes) return;

  /* subscription URL */
  var subUrl = $('subUrl');
  if (subUrl) subUrl.textContent = d.links.sub || '—';

  /* format buttons */
  var fmtBtns = $('fmtBtns');
  if (fmtBtns) {
    var fmts = ['base64', 'clash', 'singbox', 'plain'];
    var html = '';
    for (var i = 0; i < fmts.length; i++) {
      html += '<button class="' + (STATE.fmt === fmts[i] ? 'on' : '') + '" data-fmt="' + fmts[i] + '">' + fmts[i] + '</button>';
    }
    fmtBtns.innerHTML = html;
    var btns = fmtBtns.querySelectorAll('button');
    for (var j = 0; j < btns.length; j++) {
      btns[j].onclick = function() {
        STATE.fmt = this.getAttribute('data-fmt');
        renderNodes();
      };
    }
  }

  /* client links */
  var cl = $('clientLinks');
  if (cl) {
    cl.innerHTML =
      '<a href="https://github.com/MatsuriDayo/NekoBoxForAndroid/releases" target="_blank">📱 NekoBox</a>' +
      '<a href="https://github.com/v2ray/v2rayNG/releases" target="_blank">📱 v2rayNG</a>' +
      '<a href="https://github.com/izhangzhihao/invisibility/releases" target="_blank">📱 Invisible</a>' +
      '<a href="https://github.com/nickkuk/stash/releases" target="_blank">🍎 Stash (iOS)</a>';
  }

  /* QR code */
  var qr = $('qrBox');
  if (qr) {
    var subLink = d.links.sub || '';
    var qrApi = 'https://api.qrserver.com/v1/create-qr-code/?size=170x170&data=' + encodeURIComponent(subLink);
    qr.innerHTML = '<img src="' + qrApi + '" alt="QR" loading="lazy"><div style="font-size:11px;color:var(--mut);line-height:1.8">' +
      '<div>RTT: <b style="color:var(--cy)">' + d.rtt + ' ms</b></div>' +
      '<div>Zone: <b style="color:var(--vi)">' + (d.zone || '—') + '</b></div>' +
      '<div>Nodes: <b style="color:var(--ok)">' + d.nodes.length + '</b></div></div>';
  }

  /* node grid */
  var grid = $('nodeGrid');
  if (!grid) return;
  var nodes = d.nodes;
  var html = '';
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    var pc = n.p === 'vless' ? 'vless' : n.p === 'trojan' ? 'trojan' : 'ss';
    var tc = n.t === 'ws' ? 'ws' : n.t === 'grpc' ? 'grpc' : 'xhttp';
    html += '<div class="node">' +
      '<div class="top"><span class="badge ' + pc + '">' + n.p.toUpperCase() + '</span>' +
      '<span class="badge ' + tc + '">' + n.t.toUpperCase() + '</span>' +
      '<span class="badge" style="background:rgba(52,211,153,.1);color:var(--ok)">' + n.port + '</span></div>' +
      '<h4>' + esc(n.n) + '</h4>' +
      '<div class="meta"><b>' + esc(n.a) + '</b> · ' + n.sni + ' · ' + n.fp + '</div>' +
      '<button data-line="' + esc(n.line) + '">' + L.copy + '</button>' +
      '</div>';
  }
  grid.innerHTML = html;

  /* copy buttons */
  var copyBtns = grid.querySelectorAll('button[data-line]');
  for (var j = 0; j < copyBtns.length; j++) {
    copyBtns[j].onclick = function() {
      var line = this.getAttribute('data-line');
      copyText(line);
      tx(L.copy_ok);
    };
  }

  /* sub URL copy */
  var copySubBtn = $('copySubBtn');
  if (copySubBtn) {
    copySubBtn.onclick = function() {
      copyText(d.links.sub || '');
      tx(L.copy_ok);
    };
  }
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(function() { fallbackCopy(text); });
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch {}
  document.body.removeChild(ta);
}

/* ══════════════════════════════════════════════════════════════════════════════
   ▓ Live Map Panel
   ══════════════════════════════════════════════════════════════════════════════ */
function XY(lat, lon) {
  var x = (lon + 180) * (800 / 360);
  var y = (90 - lat) * (400 / 180);
  return { x: x, y: y };
}

function renderMap() {
  var box = $('mapBox');
  var side = $('mapSide');
  if (!box) return;

  var svg = '<svg viewBox="0 0 800 400" xmlns="http://www.w3.org/2000/svg">' +
    '<rect width="800" height="400" fill="transparent"/>';

  var continents = [
    'M80,80 Q120,60 160,80 Q180,100 200,90 Q220,80 240,90 L240,140 Q200,150 180,140 Q140,130 100,120 Z',
    'M180,160 Q200,150 220,160 Q230,180 240,220 Q230,260 220,300 Q200,310 180,280 Q170,240 170,200 Z',
    'M350,70 Q380,60 420,70 Q440,80 430,100 Q410,110 380,100 Q360,90 350,80 Z',
    'M360,130 Q400,120 440,140 Q450,180 440,240 Q420,280 380,270 Q350,240 340,190 Q340,160 360,130 Z',
    'M440,50 Q520,30 600,50 Q650,80 680,100 Q660,130 620,140 Q560,150 500,130 Q460,110 440,90 Z',
    'M600,230 Q640,220 680,240 Q690,260 670,280 Q640,290 610,270 Q590,250 600,230 Z',
  ];
  for (var c = 0; c < continents.length; c++) {
    svg += '<path d="' + continents[c] + '" fill="none" stroke="rgba(96,165,250,.12)" stroke-width="0.5" stroke-dasharray="2,3"/>';
  }

  var vPos = XY(VI.lat || 35, VI.lon || 51);
  svg += '<circle cx="' + vPos.x + '" cy="' + vPos.y + '" r="6" fill="var(--ok)" opacity=".9"><animate attributeName="r" values="4;8;4" dur="2s" repeatCount="indefinite"/></circle>';
  svg += '<text x="' + (vPos.x + 10) + '" y="' + (vPos.y - 8) + '" fill="var(--ok)" font-size="9" font-family="monospace">' + (VI.cc || '??') + '</text>';

  for (var i = 0; i < POPS.length; i++) {
    var p = POPS[i];
    var pos = XY(p.lat, p.lon);
    var dist = Math.sqrt(Math.pow(pos.x - vPos.x, 2) + Math.pow(pos.y - vPos.y, 2));
    var isLink = dist < 120;
    var r = isLink ? 3.5 : 2;
    var color = isLink ? 'var(--cy)' : 'var(--vi)';
    var opacity = isLink ? 0.9 : 0.5;
    svg += '<circle cx="' + pos.x + '" cy="' + pos.y + '" r="' + r + '" fill="' + color + '" opacity="' + opacity + '">';
    if (isLink) svg += '<animate attributeName="opacity" values="0.5;1;0.5" dur="2s" repeatCount="indefinite"/>';
    svg += '</circle>';
    if (isLink) {
      svg += '<line x1="' + vPos.x + '" y1="' + vPos.y + '" x2="' + pos.x + '" y2="' + pos.y + '" stroke="var(--cy)" stroke-width="0.5" opacity=".3" stroke-dasharray="4,4"><animate attributeName="stroke-dashoffset" values="0;8" dur="1s" repeatCount="indefinite"/></line>';
    }
  }
  svg += '</svg>';
  box.innerHTML = svg;

  if (!side) return;
  var pops = [];
  for (var j = 0; j < POPS.length; j++) {
    var pp = POPS[j];
    var d = distKm(VI.lat || 35, VI.lon || 51, pp.lat, pp.lon);
    pops.push({ pop: pp, dist: d, rtt: Math.max(8, Math.round(d / 200 + 6)) });
  }
  pops.sort(function(a, b) { return a.dist - b.dist; });
  var html = '';
  for (var k = 0; k < Math.min(12, pops.length); k++) {
    var pp2 = pops[k];
    html += '<div class="pops"><span>' + pp2.pop.name + ' · ' + pp2.pop.cc + '</span><b>' + pp2.rtt + ' ms</b></div>';
  }
  side.innerHTML = html;
}

function distKm(lat1, lon1, lat2, lon2) {
  var R = 6371;
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLon = (lon2 - lon1) * Math.PI / 180;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ══════════════════════════════════════════════════════════════════════════════
   ▓ Settings Panel
   ══════════════════════════════════════════════════════════════════════════════ */
function loadCfg() {
  api('/api/config?k=' + encodeURIComponent(KEY)).then(function(d) {
    if (d && d.ok) { STATE.cfg = d.cfg; renderCfg(); }
  });
}

function renderCfg() {
  var c = STATE.cfg;
  if (!c) return;

  var fp = $('fldProto');
  if (fp) {
    var protos = [
      { id: 'vless', label: 'VLESS', key: 'ev' },
      { id: 'trojan', label: 'Trojan', key: 'et' },
      { id: 'ss', label: 'Shadowsocks', key: 'ex' },
    ];
    var html = '';
    for (var i = 0; i < protos.length; i++) {
      var on = c[protos[i].key] !== 'no' ? ' on' : '';
      html += '<span class="sw' + on + '" data-p="' + protos[i].id + '">' + protos[i].label + '</span> ';
    }
    fp.innerHTML = html;
    bindSwGroup(fp);
  }

  var ft = $('fldTr');
  if (ft) {
    var transports = ['ws', 'grpc', 'xhttp'];
    var cfgTrans = c.transports || ['ws', 'grpc', 'xhttp'];
    var html2 = '';
    for (var j = 0; j < transports.length; j++) {
      var on2 = cfgTrans.indexOf(transports[j]) >= 0 ? ' on' : '';
      html2 += '<span class="sw' + on2 + '" data-tr="' + transports[j] + '">' + transports[j].toUpperCase() + '</span> ';
    }
    ft.innerHTML = html2;
    bindSwGroup(ft);
  }

  var fpt = $('fldPorts');
  if (fpt) {
    var allPorts = [443, 2053, 2083, 2087, 2096, 8443];
    var cfgPorts = c.ports || [443];
    var html3 = '';
    for (var k = 0; k < allPorts.length; k++) {
      var on3 = cfgPorts.indexOf(allPorts[k]) >= 0 ? ' on' : '';
      html3 += '<span class="sw' + on3 + '" data-port="' + allPorts[k] + '">' + allPorts[k] + '</span> ';
    }
    fpt.innerHTML = html3;
    bindSwGroup(fpt);
  }

  makeSwitch('lblTls', 'TLS', c.tls === 'yes');
  makeSwitch('lblFrag', 'Fragment', c.fragment === 'yes');
  makeSwitch('lblEch', 'ECH', c.ech === 'yes');
  makeSwitch('lblDis', 'Disable', c.disabled);

  setVal('f_fp', c.fp || 'chrome');
  setVal('f_sni', c.sni || '');
  setVal('f_path', c.path || '/?ed=2560');
  setVal('f_p', c.p || '');
  setVal('f_s', c.s || '');
  setVal('f_subname', c.subname || 'NEXUS');
  setVal('f_scu', c.scu || 'https://url.v1.mk/sub');

  var fir = $('fldIr');
  if (fir) {
    var carriers = [
      { key: 'ispMobile', label: 'HamrahAval' },
      { key: 'ispUnicom', label: 'Irancell' },
      { key: 'ispTelecom', label: 'Rightel' },
      { key: 'ispMokhaberat', label: 'Mokhaberat' },
      { key: 'ispShatel', label: 'Shatel' },
      { key: 'ispAsiatek', label: 'Asiatek' },
      { key: 'ispParsonline', label: 'ParsOnline' },
      { key: 'ispHiweb', label: 'Hiweb' },
    ];
    var html4 = '';
    for (var m = 0; m < carriers.length; m++) {
      var on4 = c[carriers[m].key] === 'yes' ? ' on' : '';
      html4 += '<span class="sw' + on4 + '" data-ir="' + carriers[m].key + '">' + carriers[m].label + '</span> ';
    }
    fir.innerHTML = html4;
    bindSwGroup(fir);
  }
}

function makeSwitch(id, label, on) {
  var el = $(id);
  if (!el) return;
  var cls = on ? ' sw on' : ' sw';
  el.innerHTML = '<span class="' + cls + '">' + label + '</span>';
  var sw = el.querySelector('.sw');
  if (sw) sw.onclick = function() { this.classList.toggle('on'); };
}

function setVal(id, val) { var el = $(id); if (el) el.value = val; }
function getVal(id) { var el = $(id); return el ? el.value : ''; }

function bindSwGroup(container) {
  var els = container.querySelectorAll('.sw');
  for (var i = 0; i < els.length; i++) {
    els[i].onclick = function() { this.classList.toggle('on'); };
  }
}

function collect() {
  var c = STATE.cfg ? Object.assign({}, STATE.cfg) : {};
  var protoEls = $('fldProto') ? $('fldProto').querySelectorAll('.sw') : [];
  c.ev = swOn(protoEls, 'vless') ? 'yes' : 'no';
  c.et = swOn(protoEls, 'trojan') ? 'yes' : 'no';
  c.ex = swOn(protoEls, 'ss') ? 'yes' : 'no';
  var trEls = $('fldTr') ? $('fldTr').querySelectorAll('.sw') : [];
  var trans = [];
  for (var i = 0; i < trEls.length; i++) {
    if (trEls[i].classList.contains('on')) trans.push(trEls[i].getAttribute('data-tr'));
  }
  c.transports = trans.length ? trans : ['ws'];
  var portEls = $('fldPorts') ? $('fldPorts').querySelectorAll('.sw') : [];
  var ports = [];
  for (var j = 0; j < portEls.length; j++) {
    if (portEls[j].classList.contains('on')) ports.push(parseInt(portEls[j].getAttribute('data-port')));
  }
  c.ports = ports.length ? ports : [443];
  c.tls = swId('lblTls') ? 'yes' : 'no';
  c.fragment = swId('lblFrag') ? 'yes' : 'no';
  c.ech = swId('lblEch') ? 'yes' : 'no';
  c.disabled = swId('lblDis');
  c.fp = getVal('f_fp') || 'chrome';
  c.sni = getVal('f_sni');
  c.path = getVal('f_path') || '/?ed=2560';
  c.p = getVal('f_p');
  c.s = getVal('f_s');
  c.subname = getVal('f_subname') || 'NEXUS';
  c.scu = getVal('f_scu');
  var irEls = $('fldIr') ? $('fldIr').querySelectorAll('.sw') : [];
  for (var k = 0; k < irEls.length; k++) {
    var irKey = irEls[k].getAttribute('data-ir');
    if (irKey) c[irKey] = irEls[k].classList.contains('on') ? 'yes' : 'no';
  }
  return c;
}

function swOn(els, val) {
  for (var i = 0; i < els.length; i++) {
    if (els[i].getAttribute('data-p') === val || els[i].getAttribute('data-tr') === val) {
      return els[i].classList.contains('on');
    }
  }
  return false;
}

function swId(id) {
  var el = $(id);
  if (!el) return false;
  var sw = el.querySelector('.sw');
  return sw ? sw.classList.contains('on') : false;
}

function saveCfg() {
  var body = collect();
  fetch('/api/config?k=' + encodeURIComponent(KEY), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }).then(function(r) { return r.json(); }).then(function(d) {
    if (d && d.ok) {
      tx(L.saved);
      STATE.cfg = d.cfg;
      STATE.nodes = null;
    } else { tx(L.err_save); }
  }).catch(function() { tx(L.err_save); });
}

function smartOptimize() {
  tx(L.wait || L.loading);
  api('/api/info').then(function() {
    STATE.nodes = null;
    loadNodes();
    loadCfg();
    tx(L.smart_done || L.done);
  }).catch(function() { tx(L.err_save); });
}

/* ══════════════════════════════════════════════════════════════════════════════
   ▓ Lock / Unlock
   ══════════════════════════════════════════════════════════════════════════════ */
function lock() {
  var lockBtn = $('lockbtn');
  var lockKey = $('lockkey');
  if (lockBtn) lockBtn.onclick = tryUnlock;
  if (lockKey) lockKey.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') tryUnlock();
  });
}

function tryUnlock() {
  var k = getVal('lockkey');
  if (!k) return;
  var btn = $('lockbtn');
  if (btn) { btn.disabled = true; btn.textContent = L.wait; }
  fetch('/api/unlock?k=' + encodeURIComponent(KEY), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key: k })
  }).then(function(r) { return r.json(); }).then(function(d) {
    if (d && d.ok) {
      KEY = k; UNLOCKED = true;
      var lk = $('lock'); if (lk) lk.classList.remove('on');
      tx(L.done); loadNodes(); loadCfg();
    } else {
      if (btn) btn.textContent = L.unlock_btn || L.unlock;
      tx(L.wrong);
      var lkInput = $('lockkey'); if (lkInput) lkInput.value = '';
    }
    if (btn) btn.disabled = false;
  }).catch(function() {
    if (btn) { btn.disabled = false; btn.textContent = L.unlock_btn || L.unlock; }
  });
}

/* ══════════════════════════════════════════════════════════════════════════════
   ▓ Clock
   ══════════════════════════════════════════════════════════════════════════════ */
function clock() {
  var t = $('chipLive');
  if (!t) return;
  function update() {
    var d = new Date();
    t.textContent = 'LIVE · ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2);
  }
  update();
  setInterval(update, 1000);
}

/* ══════════════════════════════════════════════════════════════════════════════
   ▓ Stars Animation
   ══════════════════════════════════════════════════════════════════════════════ */
function stars() {
  var cv = $('stars');
  if (!cv || !cv.getContext) return;
  var ctx = cv.getContext('2d');
  cv.width = innerWidth; cv.height = innerHeight;
  var n = 130, arr = [];
  for (var i = 0; i < n; i++) {
    arr.push({ x: Math.random()*innerWidth, y: Math.random()*innerHeight, r: Math.random()*1.3+0.3, s: Math.random()*0.4+0.08, tw: Math.random()*Math.PI*2 });
  }
  (function draw() {
    ctx.clearRect(0,0,innerWidth,innerHeight);
    for (var i = 0; i < n; i++) {
      var p = arr[i]; p.y -= p.s; p.tw += 0.05;
      if (p.y < -2) { p.y = innerHeight+2; p.x = Math.random()*innerWidth; }
      var a = 0.4+Math.sin(p.tw)*0.35;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,7);
      ctx.fillStyle = 'rgba(148,197,255,'+a+')'; ctx.fill();
    }
    requestAnimationFrame(draw);
  })();
  addEventListener('resize', function(){ cv.width=innerWidth; cv.height=innerHeight; });
}

/* ══════════════════════════════════════════════════════════════════════════════
   ▓ User Profile
   ══════════════════════════════════════════════════════════════════════════════ */
var USER_PROFILE = {};
function loadUserProfile() {
  var uid = new URLSearchParams(location.search).get('uid') || '';
  fetch('/api/user-config?k='+encodeURIComponent(KEY)+'&uid='+encodeURIComponent(uid))
    .then(function(r){return r.json()}).then(function(d){
      if(d&&d.ok){USER_PROFILE=d.ucfg||{};renderUserProfile();}
    }).catch(function(){});
}
function renderUserProfile() {
  var u = USER_PROFILE||{};
  var e1=$('f_uname');if(e1)e1.value=u.name||'';
  var e2=$('f_utr');if(e2)e2.value=u.transport||'';
  var e3=$('f_usni');if(e3)e3.value=u.sni||'';
  var e4=$('f_upath');if(e4)e4.value=u.path||'';
}
function saveUserProfile() {
  var uid = new URLSearchParams(location.search).get('uid')||'';
  var body = {name:getVal('f_uname'),transport:getVal('f_utr'),sni:getVal('f_usni'),path:getVal('f_upath')};
  fetch('/api/user-config?k='+encodeURIComponent(KEY)+'&uid='+encodeURIComponent(uid),{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)
  }).then(function(r){return r.json()}).then(function(d){
    if(d&&d.ok){USER_PROFILE=d.ucfg;tx(L.user_saved||L.saved);}else tx(L.err_save);
  }).catch(function(){tx(L.err_save);});
}

/* ══════════════════════════════════════════════════════════════════════════════
   ▓ Language Toggle
   ══════════════════════════════════════════════════════════════════════════════ */
function toggleLang() {
  fetch('/api/config?k='+encodeURIComponent(KEY)).then(function(r){return r.json()}).then(function(d){
    if(!d||!d.ok)return;
    d.cfg.lang=d.cfg.lang==='en'?'fa':'en';
    return fetch('/api/config?k='+encodeURIComponent(KEY),{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(d.cfg)
    });
  }).then(function(){location.reload();}).catch(function(){});
}

/* ══════════════════════════════════════════════════════════════════════════════
   ▓ INIT — boot() runs FIRST, everything else in try/catch
   ══════════════════════════════════════════════════════════════════════════════ */
function init() {
  boot();
  try {
    safeText('chipColo', VI.colo||'—');
    safeText('chipCc', VI.cc||'—');
    safeText('chipCity', VI.city||'—');
    safeText('abCc', VI.cc||'—');
    safeText('abHost', VI.host||'—');
    safeText('abZone', VI.zone||'—');
    i18n();
    renderHome();
    tabs();
    var saveCfgBtn=$('saveCfg');if(saveCfgBtn)saveCfgBtn.onclick=saveCfg;
    var smartBtn=$('smartBtn');if(smartBtn)smartBtn.onclick=smartOptimize;
    var cta1=$('cta1');if(cta1)cta1.onclick=function(){go('cfg');};
    var cta2=$('cta2');if(cta2)cta2.onclick=function(){go('set');};
    var langBtn=$('langBtn');if(langBtn)langBtn.onclick=toggleLang;
    var saveUserBtn=$('saveUserBtn');if(saveUserBtn)saveUserBtn.onclick=saveUserProfile;
    loadUserProfile();
    lock(); clock(); stars();
  } catch(e) {
    console.error('NEXUS init error:', e);
  }
}

function go(t) {
  var btns=$qa('#tabs button');
  for(var i=0;i<btns.length;i++){if(btns[i].getAttribute('data-t')===t){btns[i].click();return;}}
}

if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init);}else{init();}

})();
</script>
</body>
</html>`;
}
