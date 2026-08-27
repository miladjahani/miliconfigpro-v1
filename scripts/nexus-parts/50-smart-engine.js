/* ══════════════════════════════════════════════════════════════════════════════
   ▓ Smart Engine — distance, RTT estimation, protocol optimization
   ══════════════════════════════════════════════════════════════════════════════ */
function 距離(lat1, lon1, lat2, lon2) {
  /* Haversine distance in km */
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function 延遲(km) {
  /* estimate RTT from distance (rough fiber model) */
  return Math.max(8, Math.round(km / 200 + 6));
}

function 最快(info) {
  /* find best RTT for visitor's zone */
  if (!info || !info.lat) return 300;
  let best = Infinity;
  for (const s of 站點) {
    const d = 距離(info.lat, info.lon, s.lat, s.lon);
    if (d < best) best = d;
  }
  return 延遲(best);
}

function 路徑(cfg) {
  /* resolve the effective transport path */
  return cfg.tp || cfg.path || '/?ed=2560';
}

function 協議集(cfg) {
  const out = [];
  if (cfg.ev !== 'no') out.push('vless');
  if (cfg.et === 'yes') out.push('trojan');
  if (cfg.ex === 'yes') out.push('ss');
  if (!out.length) out.push('vless');
  return out;
}
