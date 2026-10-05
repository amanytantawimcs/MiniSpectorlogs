-- Migration: 2026-10-05 — update-notice device tracking, custom scope bundles
-- saved with the simulation, and shared scope bundles.
--
-- NOT APPLIED YET. Run this only when you say so. Nothing in the server runs
-- it automatically (the startup auto-apply for these was removed on purpose,
-- so a local server pointed at the live database cannot change it by accident).
--
-- Safe to run more than once: every statement is IF NOT EXISTS.
-- Needs the app to be stopped or idle during the run (no table rewrites; the
-- ALTERs add columns with defaults and take only a brief lock).
--
-- How to apply (Railway Postgres, from a machine with psql):
--   psql "$DATABASE_URL" -f db/migrations/2026-10-05_sync_history_shared_bundles.sql
-- Rollback (only if the app has not been deployed with the new code):
--   ALTER TABLE projects DROP COLUMN IF EXISTS last_saved_device;
--   ALTER TABLE simulations DROP COLUMN IF EXISTS custom_scope;
--   DROP TABLE IF EXISTS shared_scope_bundles;
--   ALTER TABLE shift_logs DROP COLUMN IF EXISTS start_time, DROP COLUMN IF EXISTS end_time;

BEGIN;

-- Which device last wrote the project row. The stale-data notice ignores
-- changes made by the same device (feedback point 4).
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS last_saved_device TEXT NOT NULL DEFAULT '';

-- The custom scope bundle a simulation uses, saved with the project so the
-- scope still resolves on another device (NULL for base scopes).
ALTER TABLE simulations
  ADD COLUMN IF NOT EXISTS custom_scope JSONB;

-- Shift start and end times (feedback point 12). Shifts are 12 hours, so the
-- date alone cannot say when a shift starts or ends.
ALTER TABLE shift_logs
  ADD COLUMN IF NOT EXISTS start_time TEXT,
  ADD COLUMN IF NOT EXISTS end_time TEXT;

-- Scope bundles published to everyone ("Share" in the bundle form).
CREATE TABLE IF NOT EXISTS shared_scope_bundles (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL,
  bundle     JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
