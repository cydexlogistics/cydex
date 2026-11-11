-- Repeating broadcasts, and editing broadcasts that haven't finished.
--
-- A broadcast either goes out once (at scheduled_at, as before) or repeats. A
-- repeating one has one or more schedules, each a date range and the times of
-- day (Nigerian time) to send it on every day of that range, e.g.
--   [{"start": "2026-12-21", "end": "2026-12-25", "times": ["09:00", "18:00"]},
--    {"start": "2026-12-28", "end": "2026-12-31", "times": ["12:00"]}]
-- For a repeating broadcast scheduled_at is the next send. It stays
-- 'scheduled' until its last send, then becomes 'sent'.
--
-- Broadcasts that are still 'scheduled' (including a repeating one that has
-- already gone out some times) can be edited.

ALTER TABLE public.broadcasts
  ADD COLUMN IF NOT EXISTS repeats BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS schedules JSONB,
  ADD COLUMN IF NOT EXISTS send_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE public.broadcasts SET send_count = 1 WHERE status = 'sent' AND send_count = 0;

ALTER TABLE public.broadcasts DROP CONSTRAINT IF EXISTS broadcasts_repeat_schedules_check;
ALTER TABLE public.broadcasts ADD CONSTRAINT broadcasts_repeat_schedules_check
  CHECK (NOT repeats OR jsonb_typeof(schedules) = 'array');

-- The first send time of a set of schedules after a moment (NULL: none left)
CREATE OR REPLACE FUNCTION public.broadcast_next_send(p_schedules JSONB, p_after TIMESTAMPTZ)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT min(ts)
  FROM (
    SELECT ((d::date + t::time) AT TIME ZONE 'Africa/Lagos') AS ts
    FROM jsonb_array_elements(COALESCE(p_schedules, '[]')) s
    CROSS JOIN LATERAL generate_series(
      GREATEST((s ->> 'start')::date, (p_after AT TIME ZONE 'Africa/Lagos')::date),
      (s ->> 'end')::date,
      interval '1 day') d
    CROSS JOIN LATERAL jsonb_array_elements_text(s -> 'times') t
  ) x
  WHERE ts > p_after;
$$;
REVOKE EXECUTE ON FUNCTION public.broadcast_next_send(JSONB, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;

-- Checks and tidies the schedules an admin entered: dates as YYYY-MM-DD,
-- times as HH:MM, sorted, no duplicates
CREATE OR REPLACE FUNCTION public.broadcast_clean_schedules(p_schedules JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  s JSONB;
  v_start DATE;
  v_end DATE;
  v_times TEXT[];
  v_out JSONB := '[]';
  v_today DATE := (now() AT TIME ZONE 'Africa/Lagos')::date;
BEGIN
  IF jsonb_typeof(p_schedules) <> 'array' OR jsonb_array_length(p_schedules) = 0 THEN
    RAISE EXCEPTION 'Add at least one schedule';
  END IF;
  IF jsonb_array_length(p_schedules) > 20 THEN
    RAISE EXCEPTION 'A broadcast can have up to 20 schedules';
  END IF;

  FOR s IN SELECT * FROM jsonb_array_elements(p_schedules) LOOP
    BEGIN
      v_start := (s ->> 'start')::date;
      v_end := (s ->> 'end')::date;
      v_times := ARRAY(
        SELECT DISTINCT to_char(t::time, 'HH24:MI')
        FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(s -> 'times') = 'array' THEN s -> 'times' ELSE '[]' END) t
        ORDER BY 1);
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Each schedule needs a start date, an end date and times of day';
    END;
    IF v_start IS NULL OR v_end IS NULL THEN
      RAISE EXCEPTION 'Each schedule needs a start date and an end date';
    END IF;
    IF v_end < v_start THEN
      RAISE EXCEPTION 'A schedule''s end date can''t be before its start date';
    END IF;
    IF v_end > v_today + 366 THEN
      RAISE EXCEPTION 'Schedules must end within the next year';
    END IF;
    IF COALESCE(array_length(v_times, 1), 0) = 0 THEN
      RAISE EXCEPTION 'Each schedule needs at least one time of day';
    END IF;
    IF array_length(v_times, 1) > 24 THEN
      RAISE EXCEPTION 'A schedule can have up to 24 times a day';
    END IF;
    v_out := v_out || jsonb_build_array(jsonb_build_object('start', v_start, 'end', v_end, 'times', to_jsonb(v_times)));
  END LOOP;

  RETURN (SELECT jsonb_agg(e ORDER BY e ->> 'start', e ->> 'end') FROM jsonb_array_elements(v_out) e);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.broadcast_clean_schedules(JSONB) FROM PUBLIC, anon, authenticated;

-- Sends a broadcast once. A one-off broadcast is then 'sent'; a repeating one
-- moves on to its next time, or is 'sent' after its last.
CREATE OR REPLACE FUNCTION public.send_broadcast(p_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.broadcasts%ROWTYPE;
  v_user UUID;
  v_count INTEGER := 0;
  v_next TIMESTAMPTZ;
BEGIN
  SELECT * INTO b FROM public.broadcasts WHERE id = p_id AND status = 'scheduled' FOR UPDATE;
  IF b.id IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_user IN SELECT public.broadcast_recipients(b.audience, b.area_latitude, b.area_longitude, b.radius_km) LOOP
    IF b.send_push THEN
      PERFORM public.notify_user(v_user, 'announcement', b.title, b.body);
    END IF;
    IF b.send_email THEN
      PERFORM public.queue_email(v_user, 'announcement', b.title,
        jsonb_build_object('title', b.title, 'body', b.body, 'broadcast_id', b.id));
    END IF;
    v_count := v_count + 1;
  END LOOP;

  -- Times missed while the job wasn't running are skipped, not sent in a burst
  IF b.repeats THEN
    v_next := public.broadcast_next_send(b.schedules, now());
  END IF;

  UPDATE public.broadcasts
  SET status = CASE WHEN v_next IS NULL THEN 'sent' ELSE 'scheduled' END,
      scheduled_at = COALESCE(v_next, b.scheduled_at),
      sent_at = now(),
      recipients = v_count,
      send_count = b.send_count + 1,
      emails_queued = CASE WHEN b.send_email
        THEN (SELECT count(*)::int FROM public.email_outbox e WHERE e.template = 'announcement' AND e.data ->> 'broadcast_id' = b.id::text)
        ELSE 0 END
  WHERE id = b.id;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.send_broadcast(UUID) FROM PUBLIC, anon, authenticated;

-- Admin: create a broadcast, or edit one that is still scheduled (p_id).
-- One-off: with no time (or a time that has passed) it goes now.
-- Repeating (p_repeats): sent at every time in p_schedules.
DROP FUNCTION IF EXISTS public.admin_save_broadcast(TEXT, TEXT, TEXT[], BOOLEAN, BOOLEAN, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, NUMERIC, TIMESTAMPTZ);
CREATE OR REPLACE FUNCTION public.admin_save_broadcast(
  p_title TEXT,
  p_body TEXT,
  p_audience TEXT[],
  p_send_push BOOLEAN DEFAULT true,
  p_send_email BOOLEAN DEFAULT false,
  p_area_address TEXT DEFAULT NULL,
  p_latitude DOUBLE PRECISION DEFAULT NULL,
  p_longitude DOUBLE PRECISION DEFAULT NULL,
  p_radius_km NUMERIC DEFAULT NULL,
  p_scheduled_at TIMESTAMPTZ DEFAULT NULL,
  p_repeats BOOLEAN DEFAULT false,
  p_schedules JSONB DEFAULT NULL,
  p_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title TEXT := NULLIF(trim(p_title), '');
  v_body TEXT := NULLIF(trim(p_body), '');
  v_audience TEXT[] := ARRAY(SELECT DISTINCT lower(a) FROM unnest(COALESCE(p_audience, '{}')) a ORDER BY 1);
  v_repeats BOOLEAN := COALESCE(p_repeats, false);
  v_schedules JSONB;
  v_at TIMESTAMPTZ;
  v_send_now BOOLEAN := false;
  v_old JSONB;
  v_id UUID := p_id;
BEGIN
  PERFORM public.require_admin();
  IF v_title IS NULL OR length(v_title) > 80 THEN
    RAISE EXCEPTION 'Enter a title of up to 80 characters';
  END IF;
  IF v_body IS NULL OR length(v_body) > 2000 THEN
    RAISE EXCEPTION 'Enter the message (up to 2,000 characters)';
  END IF;
  IF NOT COALESCE(p_send_push, false) AND NOT COALESCE(p_send_email, false) THEN
    RAISE EXCEPTION 'Choose push notification, email, or both';
  END IF;
  IF COALESCE(array_length(v_audience, 1), 0) = 0 OR NOT v_audience <@ ARRAY['customer', 'vendor', 'rider'] THEN
    RAISE EXCEPTION 'Choose who to send it to: customers, vendors or riders';
  END IF;
  IF p_radius_km IS NOT NULL THEN
    IF p_latitude IS NULL OR p_longitude IS NULL THEN
      RAISE EXCEPTION 'Choose the place on the map';
    END IF;
    IF p_radius_km <= 0 OR p_radius_km > 500 THEN
      RAISE EXCEPTION 'The radius must be between 0.1 and 500 km';
    END IF;
  END IF;

  IF v_repeats THEN
    v_schedules := public.broadcast_clean_schedules(p_schedules);
    v_at := public.broadcast_next_send(v_schedules, now());
    IF v_at IS NULL THEN
      RAISE EXCEPTION 'All the times in these schedules have passed';
    END IF;
  ELSE
    IF p_scheduled_at IS NOT NULL AND p_scheduled_at > now() + interval '1 year' THEN
      RAISE EXCEPTION 'Choose a time within the next year';
    END IF;
    v_at := GREATEST(COALESCE(p_scheduled_at, now()), now());
    v_send_now := p_scheduled_at IS NULL OR p_scheduled_at <= now();
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.broadcasts (title, body, send_push, send_email, audience, area_address, area_latitude, area_longitude,
                                   radius_km, scheduled_at, repeats, schedules, created_by)
    VALUES (v_title, v_body, COALESCE(p_send_push, false), COALESCE(p_send_email, false), v_audience,
            CASE WHEN p_radius_km IS NOT NULL THEN NULLIF(trim(p_area_address), '') END,
            CASE WHEN p_radius_km IS NOT NULL THEN p_latitude END,
            CASE WHEN p_radius_km IS NOT NULL THEN p_longitude END,
            p_radius_km, v_at, v_repeats, v_schedules, auth.uid())
    RETURNING id INTO v_id;

    PERFORM public.log_admin_action('create_broadcast', 'broadcast', v_id::text, NULL,
      (SELECT to_jsonb(b) FROM public.broadcasts b WHERE id = v_id));
  ELSE
    SELECT to_jsonb(b) INTO v_old FROM public.broadcasts b WHERE id = v_id AND status = 'scheduled' FOR UPDATE;
    IF v_old IS NULL THEN
      RAISE EXCEPTION 'Only a broadcast that is still scheduled or repeating can be edited';
    END IF;

    UPDATE public.broadcasts
    SET title = v_title, body = v_body,
        send_push = COALESCE(p_send_push, false), send_email = COALESCE(p_send_email, false),
        audience = v_audience,
        area_address = CASE WHEN p_radius_km IS NOT NULL THEN NULLIF(trim(p_area_address), '') END,
        area_latitude = CASE WHEN p_radius_km IS NOT NULL THEN p_latitude END,
        area_longitude = CASE WHEN p_radius_km IS NOT NULL THEN p_longitude END,
        radius_km = p_radius_km,
        scheduled_at = v_at, repeats = v_repeats, schedules = v_schedules,
        updated_at = now()
    WHERE id = v_id;

    PERFORM public.log_admin_action('update_broadcast', 'broadcast', v_id::text, v_old,
      (SELECT to_jsonb(b) FROM public.broadcasts b WHERE id = v_id));
  END IF;

  IF v_send_now THEN
    PERFORM public.send_broadcast(v_id);
  END IF;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_save_broadcast(TEXT, TEXT, TEXT[], BOOLEAN, BOOLEAN, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, NUMERIC, TIMESTAMPTZ, BOOLEAN, JSONB, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_broadcast(TEXT, TEXT, TEXT[], BOOLEAN, BOOLEAN, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, NUMERIC, TIMESTAMPTZ, BOOLEAN, JSONB, UUID) TO authenticated;

-- Admin: stop a broadcast that hasn't gone out yet, or a repeating one
-- before its remaining sends
CREATE OR REPLACE FUNCTION public.admin_cancel_broadcast(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin();
  UPDATE public.broadcasts SET status = 'cancelled', updated_at = now() WHERE id = p_id AND status = 'scheduled';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only a broadcast that is still scheduled or repeating can be stopped';
  END IF;
  PERFORM public.log_admin_action('cancel_broadcast', 'broadcast', p_id::text);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_cancel_broadcast(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_broadcast(UUID) TO authenticated;
