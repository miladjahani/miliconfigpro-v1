/* ══════════════════════════════════════════════════════════════════════════════
   ▓ Output Formatters — base64 / Clash / sing-box
   ▓ KEY FIX: Host header = worker domain (x.host), not CF IP (x.a)
   ══════════════════════════════════════════════════════════════════════════════ */
function 樣式B64(nodes) {
  return btoa(nodes.map((x) => x.line).join('\n'));
}

function 樣式Clash(nodes, cfg) {
  const q = (s) => `"${String(s).replace(/"/g, '\\"')}"`;
  const lines = ['proxies:'];
  const names = [];
  for (const x of nodes) {
    lines.push('  - name: ' + q(x.n));
    lines.push('    type: ' + x.p);
    lines.push('    server: ' + q(x.a));        /* CF IP */
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
    if (x.sni) lines.push('    servername: ' + q(x.sni));  /* worker domain as SNI */
    if (x.fp) lines.push('    client-fingerprint: ' + q(x.fp));
    if (x.t === 'ws') {
      lines.push('    network: ws');
      lines.push('    ws-opts:');
      lines.push('      path: ' + q(x.path));
      lines.push('      headers:');
      lines.push('        Host: ' + q(x.host || x.a));  /* worker domain as Host */
    } else if (x.t === 'grpc') {
      lines.push('    network: grpc');
      lines.push('    grpc-opts:');
      lines.push('      grpc-service-name: ' + q(String(x.path).replace(/^\//, '')));
    } else if (x.t === 'xhttp') {
      lines.push('    network: xhttp');
      lines.push('    xhttp-opts:');
      lines.push('      path: ' + q(x.path));
      lines.push('      mode: auto');
      lines.push('      headers:');
      lines.push('        Host: ' + q(x.host || x.a));
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
      server: x.a,            /* CF IP */
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

    /* TLS settings — matching working config format */
    ob.tls = {
      enabled: true,
      server_name: x.sni,    /* worker domain as SNI */
      fingerprint: x.fp,
      allow_insecure: true,   /* allow self-signed */
    };

    /* ECH support */
    if (x.ech) {
      ob.tls.ech = { enabled: true };
    }

    /* Transport settings */
    if (x.t === 'ws') {
      ob.transport = {
        type: 'ws',
        path: x.path,
        headers: { Host: x.host || x.a },  /* worker domain as Host */
      };
    } else if (x.t === 'grpc') {
      ob.transport = {
        type: 'grpc',
        service_name: String(x.path).replace(/^\//, ''),
      };
    } else if (x.t === 'xhttp') {
      ob.transport = {
        type: 'http',
        path: x.path,
        mode: 'auto',
        headers: { Host: x.host || x.a },
      };
    }

    /* Fragmentation support */
    if (x.frag) {
      ob.stream_settings = ob.stream_settings || {};
      ob.stream_settings.sockopt = {
        tcp_segmentation: true,
        tls_record_fragmentation: true,
      };
    }

    out.outbounds.push(ob);
    names.push(x.n);
  }
  out.outbounds.push({ type: 'direct', tag: 'direct' });
  out.outbounds.push({ type: 'block', tag: 'block' });
  out.outbounds.push({
    type: 'selector',
    tag: cfg.subname || 'NEXUS',
    outbounds: [...names, 'direct'],
  });
  return JSON.stringify(out, null, 2);
}
