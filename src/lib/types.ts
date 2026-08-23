export interface CFToken {
  id: string
  name: string
  token: string
  status: 'active' | 'inactive'
  last_used_at: string | null
  created_at: string
}

export interface Deployment {
  id: string
  name: string
  worker_code: string
  config: Record<string, unknown>
  status: 'pending' | 'deploying' | 'deployed' | 'failed'
  worker_url: string | null
  route: string | null
  error_message: string | null
  uuid: string | null
  custom_path: string | null
  custom_domain: string | null
  kv_namespace_id: string | null
  panel_url: string | null
  method: 'workers' | 'pages'
  cf_account_id: string | null
  created_at: string
  updated_at: string
}

export interface BotUser {
  id: string
  telegram_id: string
  username: string | null
  first_name: string | null
  last_name: string | null
  is_active: boolean
  is_admin: boolean
  created_at: string
  last_activity: string | null
}

export interface ActivityLog {
  id: string
  action: string
  entity_type: string
  entity_name: string | null
  details: Record<string, unknown> | null
  created_at: string
}

export interface BotConfig {
  id: string
  bot_token: string
  bot_username: string | null
  webhook_url: string | null
  is_active: boolean
  welcome_message: string
  created_at: string
  updated_at: string
}
