#!/bin/sh
# Cloudflare Builds / manual deploy entrypoint.
#
# Ensures the panel's D1 database exists (creates it on first run), injects the
# real database_id into a generated config, and deploys the Worker — so the D1
# binding survives every deployment and never has to be re-added by hand.
#
# Requires the build API token to allow "D1 Edit". If it does not, we fall back
# to deploying without the binding so the build still goes green.
set -eu

DB_NAME="miliconfigpro-v1"
CONFIG_OUT="wrangler.deploy.toml"

echo "── resolving D1 database (${DB_NAME}) ──"

DB_ID=$(npx wrangler d1 list --json 2>/dev/null | node -e '
let s = "";
process.stdin.on("data", (d) => (s += d));
process.stdin.on("end", () => {
  try {
    const parsed = JSON.parse(s);
    const arr = Array.isArray(parsed) ? parsed : parsed.result || [];
    const m = arr.find((x) => x.name === process.argv[1] || x.database_name === process.argv[1]);
    console.log(m ? m.uuid || m.database_id || "" : "");
  } catch {
    console.log("");
  }
})' "$DB_NAME") || DB_ID=""

if [ -z "${DB_ID}" ]; then
  echo "not found — creating..."
  CREATE_OUT=$(npx wrangler d1 create "$DB_NAME" 2>&1) || true
  DB_ID=$(printf '%s' "${CREATE_OUT:-}" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -n 1 || true)
fi

if [ -z "${DB_ID}" ]; then
  echo "⚠ could not resolve or create the D1 database."
  echo "⚠ Deploying WITHOUT the D1 binding. To fix permanently:"
  echo "⚠   Workers & Pages → ${DB_NAME} → Settings → Build → API token:"
  echo "⚠   create a token that also includes 'D1 Edit', then redeploy."
  exec npx wrangler deploy
fi

echo "✓ database_id: ${DB_ID}"

{
  cat wrangler.toml
  printf '\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "%s"\ndatabase_id = "%s"\n' "$DB_NAME" "$DB_ID"
} > "$CONFIG_OUT"

echo "── deploying worker ──"
npx wrangler deploy --config "$CONFIG_OUT"
