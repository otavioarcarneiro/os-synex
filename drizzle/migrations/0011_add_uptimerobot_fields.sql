ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS external_monitor_id text,
  ADD COLUMN IF NOT EXISTS external_synced_at timestamptz;
