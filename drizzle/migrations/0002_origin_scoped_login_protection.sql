CREATE TABLE public.login_origin_security (
  origin_key text PRIMARY KEY,
  failed_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  admin_locked boolean NOT NULL DEFAULT false,
  attempt_until timestamptz,
  attempt_token uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.login_origin_security FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.login_origin_security TO service_role;
ALTER TABLE public.login_origin_security ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_alerts ADD COLUMN lock_scope text NOT NULL DEFAULT 'account';
ALTER TABLE public.security_alerts ADD COLUMN origin_key text;
CREATE FUNCTION public.begin_origin_login(_key text, _token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE s public.login_origin_security; t timestamptz := clock_timestamp();
BEGIN
  IF length(_key) <> 64 THEN RAISE EXCEPTION 'Invalid origin key'; END IF;
  INSERT INTO public.login_origin_security(origin_key) VALUES (_key) ON CONFLICT DO NOTHING;
  SELECT * INTO s FROM public.login_origin_security WHERE origin_key = _key FOR UPDATE;
  IF s.admin_locked THEN RETURN jsonb_build_object('status','admin_locked'); END IF;
  IF s.locked_until > t THEN RETURN jsonb_build_object('status','cooldown','until',s.locked_until); END IF;
  IF s.attempt_until > t THEN RETURN jsonb_build_object('status','cooldown','until',s.attempt_until); END IF;
  UPDATE public.login_origin_security SET attempt_token = _token, attempt_until = t + interval '30 seconds', updated_at = t WHERE origin_key = _key;
  RETURN jsonb_build_object('status','allowed');
END $$;
CREATE FUNCTION public.finish_origin_login(_key text, _token uuid, _success boolean, _email text, _fingerprint jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE s public.login_origin_security; t timestamptz := clock_timestamp(); f integer; minutes integer; until_time timestamptz;
BEGIN
  SELECT * INTO s FROM public.login_origin_security WHERE origin_key = _key FOR UPDATE;
  IF NOT FOUND OR s.attempt_token IS DISTINCT FROM _token OR s.attempt_until < t THEN
    RETURN jsonb_build_object('status','cooldown','until',t + interval '30 seconds');
  END IF;
  IF _success THEN
    UPDATE public.login_origin_security SET failed_count = 0, locked_until = NULL, admin_locked = false, attempt_token = NULL, attempt_until = NULL, updated_at = t WHERE origin_key = _key;
    RETURN jsonb_build_object('status','ok');
  END IF;
  f := s.failed_count + 1;
  minutes := CASE f WHEN 3 THEN 10 WHEN 4 THEN 15 WHEN 5 THEN 20 ELSE NULL END;
  until_time := CASE WHEN minutes IS NULL THEN NULL ELSE t + make_interval(mins => minutes) END;
  UPDATE public.login_origin_security SET failed_count = f, locked_until = until_time, admin_locked = f >= 6, attempt_token = NULL, attempt_until = NULL, updated_at = t WHERE origin_key = _key;
  IF f >= 6 THEN
    INSERT INTO public.security_alerts(email,ip,geo,device,os,browser,user_agent,attempts,lock_scope,origin_key)
    VALUES (left(_email,255),left(_fingerprint->>'ip',100),left(_fingerprint->>'geo',255),left(_fingerprint->>'device',100),left(_fingerprint->>'os',100),left(_fingerprint->>'browser',100),left(_fingerprint->>'ua',500),f,'origin',_key);
    RETURN jsonb_build_object('status','admin_locked');
  END IF;
  IF until_time IS NOT NULL THEN RETURN jsonb_build_object('status','cooldown','until',until_time); END IF;
  RETURN jsonb_build_object('status','invalid','attemptsLeft',greatest(0,3-f));
END $$;
CREATE FUNCTION public.release_origin_login(_alert_id uuid, _actor_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE a public.security_alerts;
BEGIN
  IF length(trim(_reason)) < 5 OR length(_reason) > 500 THEN RAISE EXCEPTION 'Reason required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _actor_id AND role = 'owner') THEN RAISE EXCEPTION 'Owner required'; END IF;
  SELECT * INTO a FROM public.security_alerts WHERE id = _alert_id AND lock_scope = 'origin' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Alert unavailable'; END IF;
  UPDATE public.login_origin_security SET failed_count = 0, locked_until = NULL, admin_locked = false, attempt_token = NULL, attempt_until = NULL, updated_at = clock_timestamp() WHERE origin_key = a.origin_key;
  UPDATE public.security_alerts SET resolved = true, resolved_at = clock_timestamp() WHERE lock_scope = 'origin' AND origin_key = a.origin_key AND NOT resolved;
  INSERT INTO public.audit_logs(actor_id,action,reason,payload) VALUES (_actor_id,'unlock_origin',_reason,jsonb_build_object('alert_id',a.id,'scope','origin','result','success'));
END $$;
REVOKE ALL ON FUNCTION public.begin_origin_login(text,uuid), public.finish_origin_login(text,uuid,boolean,text,jsonb), public.release_origin_login(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_origin_login(text,uuid), public.finish_origin_login(text,uuid,boolean,text,jsonb), public.release_origin_login(uuid,uuid,text) TO service_role;
COMMENT ON TABLE public.login_origin_security IS 'Server-only origin-scoped failed password attempts; never locks a victim account.';