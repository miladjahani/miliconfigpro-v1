import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface AnalyticsRequest {
  cf_token: string;
  account_id: string;
  since?: string; // ISO date, default 24h ago
  until?: string; // ISO date, default now
}

interface WorkerStat {
  scriptName: string;
  requests: number;
  cpuTimeMs: number;
  dataSizeBytes: number;
  errors: number;
  status: "active" | "idle" | "error";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body: AnalyticsRequest = await req.json();
    const { cf_token, account_id, since, until } = body;

    if (!cf_token || !account_id) {
      return Response.json(
        { success: false, error: "missing cf_token or account_id" },
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const now = new Date();
    const sinceDate = since ?? new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const untilDate = until ?? now.toISOString();

    // 1. Fetch list of worker scripts on the account
    const scriptsResp = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account_id}/workers/scripts`,
      { headers: { Authorization: `Bearer ${cf_token}` } },
    );
    const scriptsData = await scriptsResp.json();

    if (!scriptsData.success) {
      return Response.json(
        { success: false, error: scriptsData.errors?.[0]?.message ?? "failed to list scripts" },
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const scriptNames: string[] = (scriptsData.result ?? []).map(
      (s: { id: string }) => s.id,
    );

    // 2. Fetch analytics via GraphQL for all scripts in one query
    const gqlQuery = {
      query: `query WorkerAnalytics($accountTag: String!, $since: Time!, $until: Time!) {
        viewer {
          accounts(filter: { accountTag: $accountTag }) {
            workersInvocationsAdaptive(
              filter: { datetime_gt: $since, datetime_lt: $until }
              limit: 10000
            ) {
              sum {
                requests
                errors
                subrequests
              }
              sum {
                cpuTime
              }
              dimensions {
                scriptName
                status
              }
            }
          }
        }
      }`,
      variables: {
        accountTag: account_id,
        since: sinceDate,
        until: untilDate,
      },
    };

    const gqlResp = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cf_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(gqlQuery),
    });
    const gqlData = await gqlResp.json();

    const invocations: Array<{
      sum: { requests: number; errors: number; cpuTime: number };
      dimensions: { scriptName: string; status: string };
    }> = gqlData?.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive ?? [];

    // 3. Aggregate per script
    const statsMap = new Map<string, WorkerStat>();
    for (const name of scriptNames) {
      statsMap.set(name, {
        scriptName: name,
        requests: 0,
        cpuTimeMs: 0,
        dataSizeBytes: 0,
        errors: 0,
        status: "idle",
      });
    }

    for (const inv of invocations) {
      const name = inv.dimensions.scriptName;
      if (!name) continue;
      let s = statsMap.get(name);
      if (!s) {
        s = { scriptName: name, requests: 0, cpuTimeMs: 0, dataSizeBytes: 0, errors: 0, status: "active" };
        statsMap.set(name, s);
      }
      s.requests += inv.sum.requests ?? 0;
      s.errors += inv.sum.errors ?? 0;
      s.cpuTimeMs += inv.sum.cpuTime ?? 0;
      if (inv.sum.requests > 0) s.status = "active";
    }

    // 4. Fetch data size (egress) via separate query
    const dataQuery = {
      query: `query WorkerDataSize($accountTag: String!, $since: Time!, $until: Time!) {
        viewer {
          accounts(filter: { accountTag: $accountTag }) {
            workersStorageAdaptive(
              filter: { datetime_gt: $since, datetime_lt: $until }
              limit: 10000
            ) {
              sum {
                responseBodySize
              }
              dimensions {
                scriptName
              }
            }
          }
        }
      }`,
      variables: { accountTag: account_id, since: sinceDate, until: untilDate },
    };

    try {
      const dataResp = await fetch("https://api.cloudflare.com/client/v4/graphql", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cf_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(dataQuery),
      });
      const dataJson = await dataResp.json();
      const storage: Array<{ sum: { responseBodySize: number }; dimensions: { scriptName: string } }> =
        dataJson?.data?.viewer?.accounts?.[0]?.workersStorageAdaptive ?? [];
      for (const entry of storage) {
        const name = entry.dimensions.scriptName;
        if (!name) continue;
        const s = statsMap.get(name);
        if (s) s.dataSizeBytes += entry.sum.responseBodySize ?? 0;
      }
    } catch {
      // data size is optional
    }

    const stats = Array.from(statsMap.values()).sort((a, b) => b.requests - a.requests);

    return Response.json(
      { success: true, stats, since: sinceDate, until: untilDate },
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return Response.json(
      { success: false, error: msg },
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
