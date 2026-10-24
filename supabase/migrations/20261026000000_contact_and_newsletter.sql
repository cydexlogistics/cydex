-- The website's contact form and newsletter sign-up (both work without an account).
--   * Contact messages are saved and emailed to the Cydex inbox (hello@usecydex.com.ng),
--     with Reply-To set to the sender, through the email outbox.
--   * Newsletter sign-ups are saved (one row per email).
--   * Admins see the messages under Admin -> Messages and mark each one
--     unresolved, in progress or resolved, with an internal note.
-- Both forms are rate limited, since anyone can call them.

CREATE TABLE IF NOT EXISTS public.contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  topic TEXT NOT NULL DEFAULT 'general',
  message TEXT NOT NULL,
  -- Who sent it, if they were logged in
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Set by admins
  status TEXT NOT NULL DEFAULT 'unresolved' CHECK (status IN ('unresolved', 'in_progress', 'resolved')),
  admin_note TEXT,
  status_updated_at TIMESTAMPTZ,
  status_updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contact_messages_status_idx ON public.contact_messages (status, created_at DESC);
CREATE INDEX IF NOT EXISTS contact_messages_created_idx ON public.contact_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS contact_messages_email_idx ON public.contact_messages (lower(email), created_at DESC);
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read contact messages" ON public.contact_messages;
CREATE POLICY "Admins read contact messages" ON public.contact_messages FOR SELECT USING (public.is_admin());
REVOKE INSERT, UPDATE, DELETE ON public.contact_messages FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  email TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'website',
  subscribed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read newsletter subscribers" ON public.newsletter_subscribers;
CREATE POLICY "Admins read newsletter subscribers" ON public.newsletter_subscribers FOR SELECT USING (public.is_admin());
REVOKE INSERT, UPDATE, DELETE ON public.newsletter_subscribers FROM anon, authenticated;

-- Where contact messages go
CREATE OR REPLACE FUNCTION public.contact_inbox()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT NULLIF(value, '') FROM public.app_config WHERE key = 'contact_inbox'), 'hello@usecydex.com.ng');
$$;

CREATE OR REPLACE FUNCTION public.submit_contact_message(
  p_name TEXT,
  p_email TEXT,
  p_message TEXT,
  p_topic TEXT DEFAULT 'general',
  p_phone TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT := NULLIF(trim(p_name), '');
  v_email TEXT := lower(trim(COALESCE(p_email, '')));
  v_message TEXT := NULLIF(trim(p_message), '');
  v_phone TEXT := NULLIF(trim(p_phone), '');
  v_topic TEXT := CASE WHEN p_topic IN ('general', 'orders', 'vendors', 'riders', 'partnerships', 'press') THEN p_topic ELSE 'general' END;
  v_id UUID;
BEGIN
  IF v_name IS NULL OR length(v_name) > 100 THEN
    RAISE EXCEPTION 'Enter your name';
  END IF;
  IF NOT public.is_valid_email(v_email) OR length(v_email) > 200 THEN
    RAISE EXCEPTION 'Enter a valid email address';
  END IF;
  IF v_message IS NULL OR length(v_message) < 10 THEN
    RAISE EXCEPTION 'Write a message of at least 10 characters';
  END IF;
  IF length(v_message) > 5000 THEN
    RAISE EXCEPTION 'Keep your message under 5,000 characters';
  END IF;
  IF v_phone IS NOT NULL AND v_phone !~ '^\+?[0-9 ()-]{7,20}$' THEN
    RAISE EXCEPTION 'Enter a valid phone number, or leave it empty';
  END IF;
  -- Rate limits: 3 an hour from one email, 60 an hour in total
  IF (SELECT count(*) FROM public.contact_messages WHERE lower(email) = v_email AND created_at > now() - interval '1 hour') >= 3
     OR (SELECT count(*) FROM public.contact_messages WHERE created_at > now() - interval '1 hour') >= 60 THEN
    RAISE EXCEPTION 'We''ve received a lot of messages. Please try again in a little while, or email us directly.';
  END IF;

  INSERT INTO public.contact_messages (name, email, phone, topic, message, profile_id)
  VALUES (v_name, v_email, v_phone, v_topic, v_message, auth.uid())
  RETURNING id INTO v_id;

  PERFORM public.queue_email_to(public.contact_inbox(), 'contact_message',
    'Website message: ' || initcap(v_topic) || ' from ' || left(v_name, 60),
    jsonb_build_object('name', 'Cydex team', 'sender_name', v_name, 'sender_email', v_email, 'sender_phone', v_phone,
                       'topic', v_topic, 'message', v_message, 'reply_to', v_email, 'message_id', v_id));
  PERFORM public.notify_admins('contact_message', 'New website message',
    left(v_name, 60) || ' wrote about ' || replace(v_topic, '_', ' ') || ': ' || left(v_message, 120));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.submit_contact_message(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_contact_message(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- Returns true for a new subscriber, false if the email was already signed up
CREATE OR REPLACE FUNCTION public.subscribe_newsletter(p_email TEXT, p_source TEXT DEFAULT 'website')
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := lower(trim(COALESCE(p_email, '')));
BEGIN
  IF NOT public.is_valid_email(v_email) OR length(v_email) > 200 THEN
    RAISE EXCEPTION 'Enter a valid email address';
  END IF;
  IF (SELECT count(*) FROM public.newsletter_subscribers WHERE subscribed_at > now() - interval '1 hour') >= 200 THEN
    RAISE EXCEPTION 'Please try again in a little while';
  END IF;
  INSERT INTO public.newsletter_subscribers (email, source)
  VALUES (v_email, left(COALESCE(NULLIF(trim(p_source), ''), 'website'), 30))
  ON CONFLICT (email) DO NOTHING;
  RETURN FOUND;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.subscribe_newsletter(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.subscribe_newsletter(TEXT, TEXT) TO anon, authenticated;

-- ===================================================================
-- Admin -> Messages
-- ===================================================================

-- Website messages, newest first, with how many there are in each status
CREATE OR REPLACE FUNCTION public.admin_contact_messages(
  p_status TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 10,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID, created_at TIMESTAMPTZ, name TEXT, email TEXT, phone TEXT, topic TEXT, message TEXT, status TEXT,
  admin_note TEXT, status_updated_at TIMESTAMPTZ, status_updated_by_name TEXT, sender_role TEXT,
  total_count BIGINT, unresolved_count BIGINT, in_progress_count BIGINT, resolved_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q TEXT := NULLIF(trim(p_search), '');
BEGIN
  PERFORM public.require_admin();
  RETURN QUERY
  WITH searched AS (
    SELECT m.* FROM public.contact_messages m
    WHERE v_q IS NULL OR m.name ILIKE '%' || v_q || '%' OR m.email ILIKE '%' || v_q || '%' OR m.message ILIKE '%' || v_q || '%'
  ), counts AS (
    SELECT count(*) FILTER (WHERE s.status = 'unresolved') AS u, count(*) FILTER (WHERE s.status = 'in_progress') AS ip,
           count(*) FILTER (WHERE s.status = 'resolved') AS r
    FROM searched s
  ), f AS (
    SELECT s.* FROM searched s WHERE p_status IS NULL OR s.status = p_status
  )
  SELECT f.id, f.created_at, f.name, f.email, f.phone, f.topic, f.message, f.status, f.admin_note, f.status_updated_at,
         a.name, lower(sender.role), count(*) OVER (), c.u, c.ip, c.r
  FROM f
  CROSS JOIN counts c
  LEFT JOIN public.profiles a ON a.id = f.status_updated_by
  LEFT JOIN public.profiles sender ON sender.id = f.profile_id
  ORDER BY f.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 100) OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_contact_messages(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_contact_messages(TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

-- Marks a message unresolved, in progress or resolved. A note replaces the
-- current one ('' clears it); no note keeps it.
CREATE OR REPLACE FUNCTION public.admin_set_contact_message_status(p_id UUID, p_status TEXT, p_note TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old JSONB;
BEGIN
  PERFORM public.require_admin();
  IF p_status NOT IN ('unresolved', 'in_progress', 'resolved') THEN
    RAISE EXCEPTION 'Choose unresolved, in progress or resolved';
  END IF;
  IF length(COALESCE(p_note, '')) > 2000 THEN
    RAISE EXCEPTION 'Keep the note under 2,000 characters';
  END IF;
  SELECT jsonb_build_object('status', status, 'admin_note', admin_note) INTO v_old FROM public.contact_messages WHERE id = p_id;
  IF v_old IS NULL THEN
    RAISE EXCEPTION 'Message not found';
  END IF;
  UPDATE public.contact_messages
  SET status = p_status,
      admin_note = CASE WHEN p_note IS NULL THEN admin_note ELSE NULLIF(trim(p_note), '') END,
      status_updated_at = now(), status_updated_by = auth.uid()
  WHERE id = p_id;
  PERFORM public.log_admin_action('update_contact_message', 'contact_message', p_id::text, v_old,
    (SELECT jsonb_build_object('status', status, 'admin_note', admin_note) FROM public.contact_messages WHERE id = p_id));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_contact_message_status(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_contact_message_status(UUID, TEXT, TEXT) TO authenticated;
