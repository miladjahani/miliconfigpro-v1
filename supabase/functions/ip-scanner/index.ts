/**
 * IP Scanner edge function — fetches best Cloudflare IPs from multiple reliable sources
 * and probes them for latency. Also integrates EDT-Pages/Proxy-List for proxy IPs.
 *
 * Sources:
 *  - https://ipdb.api.030101.xyz/?type=bestcf      (best CF CDN IPs)
 *  - https://ipdb.api.030101.xyz/?type=bestProxy    (best clean/proxy IPs)
 *  - https://raw.githubusercontent.com/ymyuuu/IPDB/main/bestcf.txt
 *  - https://raw.githubusercontent.com/ymyuuu/IPDB/main/bestproxy.txt
 *  - https://raw.githubusercontent.com/EDT-Pages/Proxy-List/main/data/https.json
 *  - https://raw.githubusercontent.com/EDT-Pages/Proxy-List/main/data/socks5.json
 *  - https://raw.githubusercontent.com/EDT-Pages/Proxy-List/main/data/http.json
 *  - Hardcoded fallback list of known-good Cloudflare IPs
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ScanResult {
  ip: string;
  latencyMs: number | null;
  status: "ok" | "timeout" | "error";
  region?: string;
  type: "cloudflare" | "clean" | "proxy";
  source: string;
  port?: number;
  protocol?: string;
  proxy?: string;
}

const FALLBACK_CF_IPS = [
  "104.16.0.1", "104.16.0.2", "104.16.0.3", "104.16.0.4", "104.16.0.5",
  "104.17.0.1", "104.17.0.2", "104.17.0.3", "104.17.0.4", "104.17.0.5",
  "104.18.0.1", "104.18.0.2", "104.18.0.3", "104.18.0.4", "104.18.0.5",
  "172.64.0.1", "172.64.0.2", "172.64.0.3", "172.64.0.4", "172.64.0.5",
  "162.159.0.1", "162.159.0.2", "162.159.0.3", "162.159.0.4", "162.159.0.5",
  "1.1.1.1", "1.0.0.1", "1.1.1.2", "1.0.0.2",
  "104.19.0.1", "104.19.0.2", "104.19.0.3", "104.19.0.4", "104.19.0.5",
  "104.20.0.1", "104.20.0.2", "104.20.0.3", "104.20.0.4", "104.20.0.5",
];

async function probeIP(ip: string, type: "cloudflare" | "clean" | "proxy", source: string, timeoutMs = 5000): Promise<ScanResult> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const r = await fetch(`https://${ip}/cdn-cgi/trace`, {
      signal: controller.signal,
      headers: { Host: "speed.cloudflare.com" },
      redirect: "manual",
    });
    clearTimeout(tid);
    const latencyMs = Date.now() - t0;
    const text = await r.text().catch(() => "");
    const coloMatch = text.match(/colo=([A-Z]{3})/);
    return {
      ip,
      latencyMs,
      status: "ok",
      region: coloMatch ? coloMatch[1] : undefined,
      type,
      source,
    };
  } catch {
    clearTimeout(tid);
    return {
      ip,
      latencyMs: null,
      status: controller.signal.aborted ? "timeout" : "error",
      type,
      source,
    };
  }
}

async function fetchIPDB(type: "bestcf" | "bestProxy"): Promise<{ ip: string; region?: string }[]> {
  try {
    const url = `https://ipdb.api.030101.xyz/?type=${type}`;
    const r = await fetch(url);
    if (!r.ok) return [];
    const data = await r.json();
    const list = Array.isArray(data) ? data : (data?.result ?? data?.data ?? []);
    return (list as Array<Record<string, unknown>>)
      .filter((item) => item?.ip || item?.address)
      .slice(0, 50)
      .map((item) => ({
        ip: String(item.ip ?? item.address),
        region: item.colo ? String(item.colo) : item.region ? String(item.region) : undefined,
      }));
  } catch {
    return [];
  }
}

async function fetchGithubList(url: string): Promise<{ ip: string; region?: string }[]> {
  try {
    const r = await fetch(url);
    if (!r.ok) return [];
    const text = await r.text();
    return text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && /^\d+\.\d+\.\d+\.\d+/.test(l))
      .slice(0, 50)
      .map((l) => {
        const [ip, region] = l.split("#");
        return { ip: ip.trim(), region: region?.trim() || undefined };
      });
  } catch {
    return [];
  }
}

// Fetch EDT-Pages/Proxy-List proxy entries
async function fetchProxyList(protocol: "https" | "socks5" | "http"): Promise<ScanResult[]> {
  try {
    const url = `https://raw.githubusercontent.com/EDT-Pages/Proxy-List/main/data/${protocol}.json`;
    const r = await fetch(url);
    if (!r.ok) return [];
    const data = await r.json();
    if (!Array.isArray(data)) return [];
    return (data as Array<Record<string, unknown>>)
      .filter((item) => item?.ip && item?.port)
      .slice(0, 30)
      .map((item) => ({
        ip: String(item.ip),
        latencyMs: null,
        status: "ok" as const,
        region: item.country ? String(item.country) : undefined,
        type: "proxy" as const,
        source: "EDT-Pages/Proxy-List",
        port: Number(item.port),
        protocol: String(item.protocol ?? protocol),
        proxy: String(item.proxy ?? `${protocol}://${item.ip}:${item.port}`),
      }));
  } catch {
    return [];
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS")
    return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { type = "cloudflare", count = 30, includeProxies = false } = body as { type?: string; count?: number; includeProxies?: boolean };
    const safeCount = Math.min(Math.max(5, count), 50);

    const candidates: Array<{ ip: string; type: "cloudflare" | "clean" | "proxy"; source: string; region?: string }> = [];

    if (type === "cloudflare") {
      const ipdb = await fetchIPDB("bestcf");
      for (const c of ipdb) candidates.push({ ...c, type: "cloudflare", source: "ipdb.api.030101.xyz" });

      const gh = await fetchGithubList("https://raw.githubusercontent.com/ymyuuu/IPDB/main/bestcf.txt");
      for (const c of gh) candidates.push({ ...c, type: "cloudflare", source: "ymyuuu/IPDB" });

      if (candidates.length === 0) {
        for (const ip of FALLBACK_CF_IPS) {
          candidates.push({ ip, type: "cloudflare", source: "fallback" });
        }
      }
    } else if (type === "clean") {
      const ipdb = await fetchIPDB("bestProxy");
      for (const c of ipdb) candidates.push({ ...c, type: "clean", source: "ipdb.api.030101.xyz" });

      const gh = await fetchGithubList("https://raw.githubusercontent.com/ymyuuu/IPDB/main/bestproxy.txt");
      for (const c of gh) candidates.push({ ...c, type: "clean", source: "ymyuuu/IPDB" });

      if (candidates.length === 0) {
        for (const ip of FALLBACK_CF_IPS) {
          candidates.push({ ip, type: "clean", source: "fallback" });
        }
      }
    }

    // Deduplicate by IP
    const seen = new Set<string>();
    const unique = candidates.filter((c) => {
      if (seen.has(c.ip)) return false;
      seen.add(c.ip);
      return true;
    });

    if (unique.length === 0) {
      return Response.json(
        { success: false, error: "هیچ IP از منابع دریافت نشد." },
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Probe in batches of 8
    const allResults: ScanResult[] = [];
    const batchSize = 8;
    for (let i = 0; i < unique.length && allResults.filter((r) => r.status === "ok").length < safeCount; i += batchSize) {
      const batch = unique.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((c) => probeIP(c.ip, c.type, c.source, 5000)),
      );
      allResults.push(...batchResults);
    }

    // Sort by latency, take top N
    const sorted = allResults
      .filter((r) => r.status === "ok" && r.latencyMs !== null)
      .sort((a, b) => (a.latencyMs ?? 9999) - (b.latencyMs ?? 9999))
      .slice(0, safeCount);

    // Also fetch proxy list from EDT-Pages/Proxy-List if requested
    let proxies: ScanResult[] = [];
    if (includeProxies) {
      const [httpsProxies, socks5Proxies, httpProxies] = await Promise.all([
        fetchProxyList("https"),
        fetchProxyList("socks5"),
        fetchProxyList("http"),
      ]);
      proxies = [...httpsProxies, ...socks5Proxies, ...httpProxies];
    }

    return Response.json(
      {
        success: true,
        count: sorted.length,
        results: sorted,
        proxies: proxies.length > 0 ? proxies.slice(0, 50) : undefined,
        sources: {
          ipdb: "https://ipdb.api.030101.xyz",
          github: "https://github.com/ymyuuu/IPDB",
          proxyList: "https://github.com/EDT-Pages/Proxy-List",
        },
      },
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "unknown error" },
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
