/* ══════════════════════════════════════════════════════════════════════════════
   ▓ Output Formatters — base64 / Clash / sing-box
   ══════════════════════════════════════════════════════════════════════════════ */
function 樣式B64(nodes) {
  return btoa(nodes.map((x) => x.line).join('\n'));
}

function 樣式Clash(nodes, cfg) {
  const y = (k, v) => `${k}: ${v}`;
  const q = (s) => `"${String(s).replace(/"/g, '\\"')}"`;
  const lines = ['proxies:'];
  const names = [];
  for (const x of nodes) {
    lines.push('  - name: ' + q(x.n));
    lines.push('    type: ' + x.p);
    lines.push('    server: ' + q(x.a));
    lines.push('    port: ' + x.port);
    if (x.p === 'vless' || x.p === 'trojan') {
      lines.push('    password: ' + q(x.pwd));
      lines.push('    uuid: ' + q(x.pwd));
    } else if (x.p === 'ss') {
      lines.push('    cipher: ' + q(x.m));
      lines.push('    password: ' + q(x.pwd));
    }
    lines.push('    tls: true');
    lines.push('    udp: true');
    if (x.sni) lines.push('    servername: ' + q(x.sni));
    if (x.fp) lines.push('    client-fingerprint: ' + q(x.fp));
    if (x.t === 'ws') {
      lines.push('    network: ws');
      lines.push('    ws-opts:');
      lines.push('      path: ' + q(x.path));
      lines.push('      headers:');
      lines.push('        Host: ' + q(x.a));
    } else if (x.t === 'grpc') {
      lines.push('    network: grpc');
      lines.push('    grpc-opts:');
      lines.push('      grpc-service-name: ' + q(String(x.path).replace(/^\//, '')));
    } else if (x.t === 'xhttp') {
      lines.push('    network: xhttp');
      lines.push('    xhttp-opts:');
      lines.push('      path: ' + q(x.path));
      lines.push('      mode: auto');
    }
    names.push(x.n);
  }
  lines.push('');
  lines.push('proxy-groups:');
  lines.push('  - name: ' + q(cfg.subname || 'NEXUS'));
  lines.push('    type: select');
  lines.push('    proxies:');
  for (const n of names) lines.push('      - ' + q(n));
  lines.push('      - DIRECT');
  lines.push('');
  lines.push('  - name: ' + q((cfg.subname || 'NEXUS') + '-auto'));
  lines.push('    type: url-test');
  lines.push('    url: https://www.gstatic.com/generate_204');
  lines.push('    interval: 300');
  lines.push('    proxies:');
  for (const n2 of names) lines.push('      - ' + q(n2));
  lines.push('');
  lines.push('rules:');
  lines.push('  - MATCH,' + q(cfg.subname || 'NEXUS'));
  return lines.join('\n');
}

function 樣式Sing(nodes, cfg) {
  const out = { outbounds: [] };
  const names = [];
  for (const x of nodes) {
    const ob = {
      tag: x.n,
      type: x.p === 'ss' ? 'shadowsocks' : x.p,
      server: x.a,
      server_port: x.port,
    };
    if (x.p === 'vless') {
      ob.uuid = x.pwd;
      ob.flow = '';
    } else if (x.p === 'trojan') {
      ob.password = x.pwd;
    } else if (x.p === 'ss') {
      ob.method = x.m;
      ob.password = x.pwd;
    }
    ob.tls = { enabled: true, server_name: x.sni, fingerprint: x.fp };
    if (x.t === 'ws') {
      ob.transport = { type: 'ws', path: x.path, headers: { Host: x.a } };
    } else if (x.t === 'grpc') {
      ob.transport = { type: 'grpc', service_name: String(x.path).replace(/^\//, '') };
    } else if (x.t === 'xhttp') {
      ob.transport = { type: 'http', path: x.path, mode: 'auto' };
    }
    out.outbounds.push(ob);
    names.push(x.n);
  }
  out.outbounds.push({ type: 'direct', tag: 'direct' });
  out.outbounds.push({ type: 'block', tag: 'block' });
  out.outbounds.push({ type: 'selector', tag: cfg.subname || 'NEXUS', outbounds: [...names, 'direct'] });
  return JSON.stringify(out, null, 2);
}
