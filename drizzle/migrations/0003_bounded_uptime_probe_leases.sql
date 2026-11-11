CREATE TABLE public.uptime_probe_leases (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  lease_token uuid,
  lease_until timestamptz,
  next_allowed_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.uptime_probe_leases FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.uptime_probe_leases TO service_role;
ALTER TABLE public.uptime_probe_leases ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.acquire_uptime_probe(_project uuid, _token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE current_lease public.uptime_probe_leases; t timestamptz := clock_timestamp(); n integer;
BEGIN
  PERFORM pg_advisory_xact_lock(841729043);
  INSERT INTO public.uptime_probe_leases(project_id) VALUES (_project) ON CONFLICT DO NOTHING;
  SELECT * INTO current_lease FROM public.uptime_probe_leases WHERE project_id = _project FOR UPDATE;
  IF current_lease.lease_until > t OR current_lease.next_allowed_at > t THEN RETURN false; END IF;
  SELECT count(*) INTO n FROM public.uptime_probe_leases WHERE lease_until > t;
  IF n >= 4 THEN RETURN false; END IF;
  UPDATE public.uptime_probe_leases SET lease_token = _token, lease_until = t + interval '20 seconds', next_allowed_at = t + interval '1 minute' WHERE project_id = _project;
  RETURN true;
END $$;
CREATE FUNCTION public.finish_uptime_probe(_project uuid, _token uuid, _status text, _latency integer)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE p public.uptime_probe_leases;
BEGIN
  IF _status NOT IN ('online','warning','down') OR _latency < 0 THEN RAISE EXCEPTION 'Invalid probe result'; END IF;
  SELECT * INTO p FROM public.uptime_probe_leases WHERE project_id = _project FOR UPDATE;
  IF NOT FOUND OR p.lease_token IS DISTINCT FROM _token OR p.lease_until < clock_timestamp() THEN RETURN false; END IF;
  UPDATE public.projects SET uptime_status = _status, uptime_checked_at = clock_timestamp(), uptime_latency_ms = _latency WHERE id = _project;
  UPDATE public.uptime_probe_leases SET lease_token = NULL, lease_until = NULL WHERE project_id = _project;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.acquire_uptime_probe(uuid,uuid), public.finish_uptime_probe(uuid,uuid,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_uptime_probe(uuid,uuid), public.finish_uptime_probe(uuid,uuid,text,integer) TO service_role;