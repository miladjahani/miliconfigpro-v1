/* ══════════════════════════════════════════════════════════════════════════════
   ▓ Dynamic Cloudflare IP Resolver
   ▓ Resolves worker domain via DNS-over-HTTPS, caches in KV (1h TTL)
   ══════════════════════════════════════════════════════════════════════════════ */

/* Fallback IPs — used only if DNS resolution fails */
const CF_FALLBACK = [
  '188.164.248.146', '188.164.249.146', '188.164.248.150',
  '188.164.249.150', '188.164.248.154', '188.164.249.154',
  '188.164.250.146', '188.164.250.150', '188.164.250.154',
  '104.16.0.1', '104.16.1.1', '104.16.2.1',
];

const CF_IP_CACHE_KEY = 'cf_ips';
const CF_IP_TTL = 3600; /* 1 hour in seconds */

/**
 * Resolve CF edge IPs for the worker's own domain.
 * Uses Cloudflare DNS-over-HTTPS (1.1.1.1).
 * Results cached in KV for 1 hour.
 */
async function resolveCFIPs(host, env) {
  /* 1. Try KV cache first */
  try {
    const kv = KV(env);
    if (kv) {
      const raw = await kv.get(CF_IP_CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached.ts && (Date.now() - cached.ts) < CF_IP_TTL * 1000 && cached.ips && cached.ips.length > 0) {
          return cached.ips;
        }
      }
    }
  } catch {}

  /* 2. Resolve via DNS-over-HTTPS */
  const ips = [];
  try {
    const url = new URL('https://1.1.1.1/dns-query');
    url.searchParams.set('name', host);
    url.searchParams.set('type', 'A');
    const resp = await fetch(url.toString(), {
      headers: {
        'accept': 'application/dns-json',
      },
    });
    if (resp.ok) {
      const dns = await resp.json();
      if (dns.Answer) {
        for (const ans of dns.Answer) {
          if (ans.type === 1 && ans.data) {
            ips.push(ans.data);
          }
        }
      }
    }
  } catch {}

  /* 3. Also try resolving common CF domains to get more IPs */
  const probeDomains = ['www.cloudflare.com', 'www.apple.com', 'www.microsoft.com'];
  for (const domain of probeDomains) {
    if (ips.length >= 6) break;
    try {
      const url2 = new URL('https://1.1.1.1/dns-query');
      url2.searchParams.set('name', domain);
      url2.searchParams.set('type', 'A');
      const resp2 = await fetch(url2.toString(), {
        headers: { 'accept': 'application/dns-json' },
      });
      if (resp2.ok) {
        const dns2 = await resp2.json();
        if (dns2.Answer) {
          for (const ans of dns2.Answer) {
            if (ans.type === 1 && ans.data && !ips.includes(ans.data)) {
              ips.push(ans.data);
            }
          }
        }
      }
    } catch {}
  }

  /* 4. If DNS failed, use fallback */
  const result = ips.length > 0 ? ips : CF_FALLBACK;

  /* 5. Cache in KV */
  try {
    const kv = KV(env);
    if (kv) {
      await kv.put(CF_IP_CACHE_KEY, JSON.stringify({ ips: result, ts: Date.now() }), {
        expirationTtl: CF_IP_TTL + 300, /* KV TTL slightly longer than cache TTL */
      });
    }
  } catch {}

  return result;
}
