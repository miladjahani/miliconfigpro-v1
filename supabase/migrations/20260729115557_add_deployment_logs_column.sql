/*
# Add logs column to deployments

## Overview
Adds a `logs` text column to store real-time deployment progress logs,
enabling background processing with frontend polling.

## Modified Tables
- **deployments** — new column:
  - `logs` (text, nullable) — newline-separated deployment progress logs

## Security
- No RLS changes needed — existing policies cover the new column.
*/

ALTER TABLE deployments
  ADD COLUMN IF NOT EXISTS logs text;
