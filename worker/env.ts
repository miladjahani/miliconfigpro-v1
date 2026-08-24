/// <reference types="@cloudflare/workers-types" />

export interface Env {
  DB: D1Database
  ASSETS: Fetcher
}
