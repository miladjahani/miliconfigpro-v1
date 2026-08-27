/* ══════════════════════════════════════════════════════════════════════════════
   ▓ Visitor Detection & Geo
   ══════════════════════════════════════════════════════════════════════════════ */
function 訪客(request, cfg) {
  const h = request.headers;
  const cc = String(h.get('cf-ipcountry') || '').toUpperCase() || 'XX';
  const colo = h.get('cf-colo') || String(h.get('cf-ray') || '').split('-').pop() || '';
  const city = h.get('cf-ipcity') || '';
  const lat = parseFloat(h.get('cf-iplat') || '0') || 0;
  const lon = parseFloat(h.get('cf-iplon') || '0') || 0;
  const zone = 檔案(cc).zone;
  const key = h.get('x-key') || '';
  return { cc, colo, city, lat, lon, zone, key };
}

/* ══════════════════════════════════════════════════════════════════════════════
   ▓ Response Helpers
   ══════════════════════════════════════════════════════════════════════════════ */
function 響(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' },
  });
}

function 誤(msg, status) { return 響({ ok: false, error: msg }, status || 400); }

function 觸(k, url, head) {
  /* get key from query param or header */
  return url.searchParams.get(k) || head.get('x-key') || '';
}

function 開(鑰, 給) { return !鑰 || 密時(鑰, 給); }
