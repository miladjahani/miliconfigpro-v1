/*
# Add deployment config columns

## Overview
Adds columns to the deployments table to store the full configuration
needed by the real worker deployment flow (UUID, custom path, custom domain,
KV namespace ID, panel URL, deployment method, and CF account ID).

## Modified Tables
- **deployments** — new columns:
  - `uuid` (text, nullable) — access secret / panel key (variable u)
  - `custom_path` (text, nullable) — optional custom path (variable d)
  - `custom_domain` (text, nullable) — optional custom domain
  - `kv_namespace_id` (text, nullable) — Cloudflare KV namespace ID
  - `panel_url` (text, nullable) — full private panel URL
  - `method` (text, default 'workers') — deployment method: workers or pages
  - `cf_account_id` (text, nullable) — Cloudflare account ID used

## Security
- No RLS policy changes needed — existing owner-scoped policies cover new columns.
*/

ALTER TABLE deployments
  ADD COLUMN IF NOT EXISTS uuid text,
  ADD COLUMN IF NOT EXISTS custom_path text,
  ADD COLUMN IF NOT EXISTS custom_domain text,
  ADD COLUMN IF NOT EXISTS kv_namespace_id text,
  ADD COLUMN IF NOT EXISTS panel_url text,
  ADD COLUMN IF NOT EXISTS method text NOT NULL DEFAULT 'workers',
  ADD COLUMN IF NOT EXISTS cf_account_id text;
