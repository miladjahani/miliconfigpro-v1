/*
# miliconfig Pro — Full Database Schema

## Overview
Creates the complete schema for the miliconfig Pro panel: Cloudflare API tokens,
worker deployments, Telegram bot configuration, bot users, and activity logs.
All tables are owner-scoped to the authenticated Supabase user.

## New Tables

1. **cf_tokens** — Stores Cloudflare API tokens (per user)
   - `id` (uuid PK)
   - `user_id` (uuid, FK auth.users, owner)
   - `name` (text, friendly label)
   - `token` (text, the CF API token)
   - `status` (text: active/inactive)
   - `last_used_at` (timestamptz, nullable)
   - `created_at` (timestamptz)

2. **deployments** — Worker deployment records (per user)
   - `id` (uuid PK)
   - `user_id` (uuid, FK auth.users, owner)
   - `name` (text, worker name)
   - `worker_code` (text, the JS source)
   - `config` (jsonb, wrangler-style config)
   - `status` (text: pending/deploying/deployed/failed)
   - `worker_url` (text, nullable)
   - `route` (text, nullable)
   - `error_message` (text, nullable)
   - `created_at`, `updated_at` (timestamptz)

3. **bot_config** — Telegram bot settings (per user, one row)
   - `id` (uuid PK)
   - `user_id` (uuid, FK auth.users, owner)
   - `bot_token` (text, Telegram bot token)
   - `bot_username` (text, nullable)
   - `webhook_url` (text, nullable)
   - `is_active` (boolean)
   - `welcome_message` (text)
   - `created_at`, `updated_at` (timestamptz)

4. **bot_users** — Telegram bot end-users (per panel owner)
   - `id` (uuid PK)
   - `user_id` (uuid, FK auth.users, panel owner)
   - `telegram_id` (text, Telegram user ID)
   - `username` (text, nullable)
   - `first_name` (text, nullable)
   - `last_name` (text, nullable)
   - `is_active` (boolean)
   - `is_admin` (boolean)
   - `created_at` (timestamptz)
   - `last_activity` (timestamptz, nullable)

5. **activity_logs** — Audit trail of actions (per user)
   - `id` (uuid PK)
   - `user_id` (uuid, FK auth.users, owner)
   - `action` (text, e.g. "token_created")
   - `entity_type` (text, e.g. "token")
   - `entity_name` (text, nullable)
   - `details` (jsonb, nullable)
   - `created_at` (timestamptz)

## Security
- RLS enabled on ALL tables.
- Each table has 4 owner-scoped policies (SELECT/INSERT/UPDATE/DELETE) using auth.uid().
- All owner columns default to auth.uid() so inserts that omit user_id still succeed.
*/

-- cf_tokens
CREATE TABLE IF NOT EXISTS cf_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  token text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  last_used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cf_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_tokens" ON cf_tokens;
CREATE POLICY "select_own_tokens" ON cf_tokens FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_tokens" ON cf_tokens;
CREATE POLICY "insert_own_tokens" ON cf_tokens FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_tokens" ON cf_tokens;
CREATE POLICY "update_own_tokens" ON cf_tokens FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_tokens" ON cf_tokens;
CREATE POLICY "delete_own_tokens" ON cf_tokens FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- deployments
CREATE TABLE IF NOT EXISTS deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  worker_code text NOT NULL DEFAULT '',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'deploying', 'deployed', 'failed')),
  worker_url text,
  route text,
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE deployments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_deployments" ON deployments;
CREATE POLICY "select_own_deployments" ON deployments FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_deployments" ON deployments;
CREATE POLICY "insert_own_deployments" ON deployments FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_deployments" ON deployments;
CREATE POLICY "update_own_deployments" ON deployments FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_deployments" ON deployments;
CREATE POLICY "delete_own_deployments" ON deployments FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- bot_config
CREATE TABLE IF NOT EXISTS bot_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  bot_token text NOT NULL,
  bot_username text,
  webhook_url text,
  is_active boolean NOT NULL DEFAULT true,
  welcome_message text NOT NULL DEFAULT 'سلام! به ربات miliconfig خوش آمدید. برای شروع /start را بفرستید.',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE bot_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_botconfig" ON bot_config;
CREATE POLICY "select_own_botconfig" ON bot_config FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_botconfig" ON bot_config;
CREATE POLICY "insert_own_botconfig" ON bot_config FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_botconfig" ON bot_config;
CREATE POLICY "update_own_botconfig" ON bot_config FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_botconfig" ON bot_config;
CREATE POLICY "delete_own_botconfig" ON bot_config FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- bot_users
CREATE TABLE IF NOT EXISTS bot_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_id text NOT NULL,
  username text,
  first_name text,
  last_name text,
  is_active boolean NOT NULL DEFAULT true,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  last_activity timestamptz,
  UNIQUE (user_id, telegram_id)
);

ALTER TABLE bot_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_botusers" ON bot_users;
CREATE POLICY "select_own_botusers" ON bot_users FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_botusers" ON bot_users;
CREATE POLICY "insert_own_botusers" ON bot_users FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_botusers" ON bot_users;
CREATE POLICY "update_own_botusers" ON bot_users FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_botusers" ON bot_users;
CREATE POLICY "delete_own_botusers" ON bot_users FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- activity_logs
CREATE TABLE IF NOT EXISTS activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  entity_type text NOT NULL DEFAULT 'general',
  entity_name text,
  details jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_logs" ON activity_logs;
CREATE POLICY "select_own_logs" ON activity_logs FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_logs" ON activity_logs;
CREATE POLICY "insert_own_logs" ON activity_logs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_logs" ON activity_logs;
CREATE POLICY "delete_own_logs" ON activity_logs FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_cf_tokens_user ON cf_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_deployments_user ON deployments(user_id);
CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status);
CREATE INDEX IF NOT EXISTS idx_bot_config_user ON bot_config(user_id);
CREATE INDEX IF NOT EXISTS idx_bot_users_user ON bot_users(user_id);
CREATE INDEX IF NOT EXISTS idx_bot_users_telegram ON bot_users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at DESC);

-- updated_at trigger for deployments
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_deployments_updated_at ON deployments;
CREATE TRIGGER trigger_deployments_updated_at
  BEFORE UPDATE ON deployments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_bot_config_updated_at ON bot_config;
CREATE TRIGGER trigger_bot_config_updated_at
  BEFORE UPDATE ON bot_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
