/* ══════════════════════════════════════════════════════════════════════════════
   ▓ API Router — request handling and endpoint definitions
   ══════════════════════════════════════════════════════════════════════════════ */
async function 請求(request, env) {
  const url = new URL(request.url);
  const 路 = url.pathname;
  const 法 = request.method;
  const 頭 = request.headers;
  const host = url.host;
  const cfg = await 配置(env);
  const 鑰 = cfg.uuid || '';
  const seg = 路.split('/').filter(Boolean);
  const rootKey = seg[0] || '';
  const unlocked = 開(鑰, rootKey) || (cfg.d && 開(cfg.d, rootKey)) || !鑰;

  /* CORS preflight */
  if (法 === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers': 'content-type,x-key',
        'access-control-max-age': '86400',
      },
    });
  }

  /* WebSocket proxy */
  if (頭.get('upgrade') === 'websocket') { return await 代理(request, env, cfg); }

  const info = 訪客(request, cfg);

  /* ── Public endpoints ── */

  if (路 === '/healthz' || 路 === '/__health') {
    return 響({ ok: true, v: VERSION, t: Date.now(), host, kv: !!KV(env) });
  }

  if (法 === 'GET' && (路 === '/sub' || (seg.length >= 2 && rootKey === (鑰 || cfg.d) && seg[1] === 'sub'))) {
    return await 給Sub(request, env, cfg, info, host);
  }

  if (法 === 'GET' && 路 === '/api/info') {
    return 響({
      ok: true, v: VERSION, host, cc: info.cc, colo: info.colo,
      city: info.city, lat: info.lat, lon: info.lon, zone: info.zone,
      keySet: !!鑰, kv: !!KV(env), ts: Date.now(), name: cfg.name,
      tz: new Date().getTimezoneOffset(),
    });
  }

  if (法 === 'GET' && 路 === '/api/map') {
    return 響({ ok: true, pops: 站點, visitor: info, host });
  }

  if (法 === 'GET' && 路 === '/api/nodes') {
    const k = 觸('k', url, 頭);
    if (鑰 && !開(鑰, k)) return 誤('forbidden', 403);
    if (cfg.disabled) return 誤('disabled', 403);
    const r = 節點集(cfg, info, host);
    const links = {
      base64: 樣式B64(r.nodes),
      plain: r.nodes.map((x) => x.line).join('\n'),
      clash: 樣式Clash(r.nodes, cfg),
      singbox: 樣式Sing(r.nodes, cfg),
      sub: `${url.origin}/${鑰 ? 鑰 + '/' : ''}sub`,
    };
    return 響({ ok: true, nodes: r.nodes, links, rtt: 最快(info), frag: r.frag, zone: info.zone });
  }

  /* ── Config endpoints ── */
  if (路 === '/api/config') {
    const k = 觸('k', url, 頭);
    if (鑰 && !開(鑰, k)) return 誤('forbidden', 403);
    if (法 === 'GET') {
      const safe = { ...cfg };
      delete safe.admin; delete safe.ADMIN; delete safe.password;
      return 響({ ok: true, cfg: safe });
    }
    if (法 === 'POST') {
      let body = {};
      try { body = await request.json(); } catch {}
      const next = { ...預設, ...cfg, ...body };
      if (env.u) next.uuid = env.u;
      if (env.d) next.d = env.d;
      next.disabled = !!next.disabled;
      const ok = await 寫配置(env, next);
      return 響({ ok: true, saved: ok, cfg: next });
    }
    return 誤('method', 405);
  }

  /* ── Unlock endpoint ── */
  if (法 === 'POST' && 路 === '/api/unlock') {
    let body = {};
    try { body = await request.json(); } catch {}
    const k = String(body.key || '').trim();
    return 響({ ok: !鑰 || 密時(鑰, k) });
  }

  /* ── User profile endpoints ── */
  if (路 === '/api/user-config') {
    const k = 觸('k', url, 頭);
    if (鑰 && !開(鑰, k)) return 誤('forbidden', 403);
    const uid = url.searchParams.get('uid') || '';
    const ukey = uid ? 'u_' + uid : 'u_default';
    if (法 === 'GET') {
      const raw = await 取(env, ukey);
      const ucfg = raw ? JSON.parse(raw) : {};
      return 響({ ok: true, ucfg });
    }
    if (法 === 'POST') {
      let body = {};
      try { body = await request.json(); } catch {}
      await 放(env, ukey, JSON.stringify(body));
      return 響({ ok: true, ucfg: body });
    }
    return 誤('method', 405);
  }

  /* Unknown API paths → 404 */
  if (路.startsWith('/api/')) return 誤('not found', 404);

  /* ── Main page ── */
  if (法 === 'GET') {
    const 開く = unlocked && !cfg.disabled;
    const L = LABELS[cfg.lang === 'en' ? 'en' : 'fa'];
    return new Response(頁(request, env, cfg, info, 開く, L), {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  return 誤('not found', 404);
}

/* ── Subscription endpoint ── */
async function 給Sub(request, env, cfg, info, host) {
  if (cfg.disabled) return new Response('403 — worker disabled', { status: 403 });
  const url = new URL(request.url);
  const target = (url.searchParams.get('target') || url.searchParams.get('format') || '').toLowerCase();
  const ua = String(request.headers.get('user-agent') || '').toLowerCase();
  const r = 節點集(cfg, info, host);
  let ct = 'text/plain; charset=utf-8';
  let body = '';
  let f = target;
  if (!f) {
    if (ua.includes('clash') || ua.includes('stash') || ua.includes('mihomo')) f = 'clash';
    else if (ua.includes('sing-box') || ua.includes('sfa') || ua.includes('karing')) f = 'singbox';
    else f = 'base64';
  }
  if (f === 'clash') { body = 樣式Clash(r.nodes, cfg); ct = 'application/yaml; charset=utf-8'; }
  else if (f === 'singbox' || f === 'sing-box') { body = 樣式Sing(r.nodes, cfg); ct = 'application/json; charset=utf-8'; }
  else if (f === 'plain') { body = r.nodes.map((x) => x.line).join('\n'); }
  else { body = 樣式B64(r.nodes); }
  const name = `${cfg.subname || 'NEXUS'}-${info.zone}`.replace(/[^\w-]/g, '_');
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': ct,
      'cache-control': 'no-store',
      'content-disposition': `attachment; filename="${name}.txt"`,
      'subscription-userinfo': 'upload=0; download=0; total=0',
      'profile-update-interval': '12',
      'access-control-allow-origin': '*',
    },
  });
}

export default {
  async fetch(request, env) {
    try {
      return await 請求(request, env);
    } catch (e) {
      return 響({ ok: false, error: String((e && e.message) || e) }, 500);
    }
  },
};
