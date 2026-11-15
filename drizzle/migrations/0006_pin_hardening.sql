REVOKE SELECT, UPDATE ON public.system_settings FROM authenticated;
GRANT SELECT (id, maintenance_mode, billing_enabled, uptime_enabled, updated_at) ON public.system_settings TO authenticated;
GRANT UPDATE (maintenance_mode, billing_enabled, uptime_enabled, updated_at) ON public.system_settings TO authenticated;
REVOKE ALL ON public.system_settings FROM anon;

CREATE TABLE public.pin_attempts (
  user_id uuid PRIMARY KEY,
  failed_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.pin_attempts TO service_role;
ALTER TABLE public.pin_attempts ENABLE ROW LEVEL SECURITY;