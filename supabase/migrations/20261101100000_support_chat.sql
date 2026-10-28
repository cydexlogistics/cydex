-- ===================================================================
-- Support chat
--
-- Customers, vendors and riders chat with the Cydex team from their Support
-- page. Each person has at most one open chat:
--   * waiting: they've written and no admin has picked it up yet
--   * active:  an admin picked it up (support_chats.admin_id). Only that admin
--              can reply, end it, or transfer it to another admin.
--   * ended:   ended by the admin handling it. It stays as read-only history,
--              and the person's next message starts a new chat.
-- People see the admin's first name only; admins see full names.
-- Messages push and chime like notifications, but never go in the
-- notifications table, so they stay off the Notifications page.
-- See docs/ADMIN.md -> Support.
-- ===================================================================

CREATE TABLE IF NOT EXISTS public.support_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- What they were when the chat started
  user_role TEXT NOT NULL CHECK (user_role IN ('customer', 'vendor', 'rider')),
  -- The admin handling it (NULL while waiting)
  admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  ended_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- How far each side has read (unread badges). admin_read_at is the handling admin's.
  user_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  admin_read_at TIMESTAMPTZ
);
-- One open chat per person
CREATE UNIQUE INDEX IF NOT EXISTS support_chats_one_open ON public.support_chats (user_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS support_chats_user_idx ON public.support_chats (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_chats_last_message_idx ON public.support_chats (last_message_at DESC);
CREATE INDEX IF NOT EXISTS support_chats_admin_idx ON public.support_chats (admin_id) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS public.support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES public.support_chats(id) ON DELETE CASCADE,
  -- The chat's customer, vendor or rider (lets them follow their chats live)
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- message: someone wrote body. joined / transferred / ended: what an admin did.
  kind TEXT NOT NULL DEFAULT 'message' CHECK (kind IN ('message', 'joined', 'transferred', 'ended')),
  sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  from_admin BOOLEAN NOT NULL,
  body TEXT CHECK (kind <> 'message' OR body IS NOT NULL),
  -- The admin handling the chat after this message (NULL while waiting).
  -- For transferred, the admin it went to.
  admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  push_sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS support_messages_chat_idx ON public.support_messages (chat_id, created_at);
CREATE INDEX IF NOT EXISTS support_messages_user_idx ON public.support_messages (user_id, created_at DESC);

-- Read only, through the functions below
ALTER TABLE public.support_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "People read their support chats" ON public.support_chats;
CREATE POLICY "People read their support chats" ON public.support_chats
  FOR SELECT USING (user_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS "People read their support messages" ON public.support_messages;
CREATE POLICY "People read their support messages" ON public.support_messages
  FOR SELECT USING (user_id = auth.uid() OR public.is_admin());
REVOKE INSERT, UPDATE, DELETE ON public.support_chats, public.support_messages FROM anon, authenticated;
GRANT SELECT ON public.support_chats, public.support_messages TO authenticated;

-- New messages reach the app live (each person only gets their own; admins get all)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
                     AND schemaname = 'public' AND tablename = 'support_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
  END IF;
END $$;

-- "Tobiloba Olugbemi" -> "Tobiloba"
CREATE OR REPLACE FUNCTION public.support_first_name(p_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(NULLIF(split_part(trim(COALESCE(p_name, '')), ' ', 1), ''), 'Cydex Support');
$$;

CREATE OR REPLACE FUNCTION public.support_check_body(p_body TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_body TEXT := NULLIF(trim(COALESCE(p_body, '')), '');
BEGIN
  IF v_body IS NULL THEN
    RAISE EXCEPTION 'Write a message';
  END IF;
  IF length(v_body) > 2000 THEN
    RAISE EXCEPTION 'Keep each message under 2,000 characters';
  END IF;
  RETURN v_body;
END;
$$;

-- Adds a message to a chat and moves the chat to the top of the lists
CREATE OR REPLACE FUNCTION public.support_add_message(
  p_chat_id UUID, p_kind TEXT, p_from_admin BOOLEAN, p_body TEXT, p_admin_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.support_messages (chat_id, user_id, kind, sender_id, from_admin, body, admin_id)
  SELECT c.id, c.user_id, p_kind, auth.uid(), p_from_admin, p_body, p_admin_id
  FROM public.support_chats c WHERE c.id = p_chat_id
  RETURNING id INTO v_id;
  UPDATE public.support_chats SET last_message_at = now() WHERE id = p_chat_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.support_add_message(UUID, TEXT, BOOLEAN, TEXT, UUID) FROM PUBLIC, anon, authenticated;

-- ===================================================================
-- Customers, vendors and riders
-- ===================================================================

-- Sends a message in their open chat, starting a new chat if they have none.
-- Returns the chat id.
CREATE OR REPLACE FUNCTION public.support_send_message(p_body TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_role TEXT := public.current_user_role();
  v_body TEXT := public.support_check_body(p_body);
  v_chat public.support_chats%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR v_role NOT IN ('customer', 'vendor', 'rider') THEN
    RAISE EXCEPTION 'Only customers, vendors and riders can message support';
  END IF;
  IF (SELECT count(*) FROM public.support_messages
      WHERE user_id = v_uid AND NOT from_admin AND created_at > now() - interval '1 minute') >= 20 THEN
    RAISE EXCEPTION 'You''re sending messages too quickly. Please wait a moment.';
  END IF;

  INSERT INTO public.support_chats (user_id, user_role)
  VALUES (v_uid, v_role)
  ON CONFLICT (user_id) WHERE ended_at IS NULL DO NOTHING;
  SELECT * INTO v_chat FROM public.support_chats WHERE user_id = v_uid AND ended_at IS NULL FOR UPDATE;

  PERFORM public.support_add_message(v_chat.id, 'message', false, v_body, v_chat.admin_id);
  UPDATE public.support_chats SET user_read_at = now() WHERE id = v_chat.id;
  RETURN v_chat.id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.support_send_message(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_send_message(TEXT) TO authenticated;

-- Their chats: the open one first, then ended ones, newest first.
-- The admin is shown by first name only.
CREATE OR REPLACE FUNCTION public.my_support_chats()
RETURNS TABLE (
  id UUID, created_at TIMESTAMPTZ, last_message_at TIMESTAMPTZ, ended_at TIMESTAMPTZ, status TEXT,
  admin_name TEXT, last_message TEXT, unread_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.created_at, c.last_message_at, c.ended_at,
         CASE WHEN c.ended_at IS NOT NULL THEN 'ended' WHEN c.admin_id IS NULL THEN 'waiting' ELSE 'active' END,
         CASE WHEN a.id IS NOT NULL THEN public.support_first_name(a.name) END,
         (SELECT m.body FROM public.support_messages m WHERE m.chat_id = c.id AND m.kind = 'message'
          ORDER BY m.created_at DESC LIMIT 1),
         (SELECT count(*) FROM public.support_messages m WHERE m.chat_id = c.id AND m.from_admin
            AND m.kind <> 'transferred' AND m.created_at > c.user_read_at)
  FROM public.support_chats c
  LEFT JOIN public.profiles a ON a.id = COALESCE(c.admin_id, c.ended_by)
  WHERE c.user_id = auth.uid()
  ORDER BY (c.ended_at IS NULL) DESC, c.created_at DESC
  LIMIT 100;
$$;
REVOKE EXECUTE ON FUNCTION public.my_support_chats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_support_chats() TO authenticated;

-- ===================================================================
-- Both sides
-- ===================================================================

-- A chat's messages, oldest first, for the person in it or any admin.
-- Admins see full names; the person sees admins' first names only.
--   sender_name: who wrote it / who did it
--   admin_name:  for transferred, who it went to
CREATE OR REPLACE FUNCTION public.support_chat_messages(p_chat_id UUID)
RETURNS TABLE (
  id UUID, kind TEXT, from_admin BOOLEAN, mine BOOLEAN, sender_name TEXT, admin_name TEXT, body TEXT, created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin BOOLEAN := public.is_admin();
BEGIN
  IF NOT v_admin AND NOT EXISTS (SELECT 1 FROM public.support_chats c WHERE c.id = p_chat_id AND c.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Chat not found';
  END IF;
  RETURN QUERY
  SELECT m.id, m.kind, m.from_admin, m.sender_id = auth.uid(),
         CASE WHEN v_admin OR NOT m.from_admin THEN s.name ELSE public.support_first_name(s.name) END,
         CASE WHEN m.kind <> 'transferred' THEN NULL WHEN v_admin THEN a.name ELSE public.support_first_name(a.name) END,
         m.body, m.created_at
  FROM public.support_messages m
  LEFT JOIN public.profiles s ON s.id = m.sender_id
  LEFT JOIN public.profiles a ON a.id = m.admin_id
  WHERE m.chat_id = p_chat_id
  ORDER BY m.created_at, m.id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.support_chat_messages(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_chat_messages(UUID) TO authenticated;

-- Marks a chat read: by the person, or by the admin handling it
CREATE OR REPLACE FUNCTION public.support_mark_read(p_chat_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.support_chats SET user_read_at = now() WHERE id = p_chat_id AND user_id = auth.uid();
  UPDATE public.support_chats SET admin_read_at = now() WHERE id = p_chat_id AND admin_id = auth.uid() AND public.is_admin();
$$;
REVOKE EXECUTE ON FUNCTION public.support_mark_read(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_mark_read(UUID) TO authenticated;

-- The badge on Support: unread replies for a person; for an admin, chats
-- waiting to be picked up plus their own chats with unread messages
CREATE OR REPLACE FUNCTION public.support_unread_count()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN public.is_admin() THEN (
    SELECT count(*)::int FROM public.support_chats c
    WHERE c.ended_at IS NULL
      AND (c.admin_id IS NULL
           OR (c.admin_id = auth.uid() AND EXISTS (
                 SELECT 1 FROM public.support_messages m
                 WHERE m.chat_id = c.id AND NOT m.from_admin AND m.created_at > COALESCE(c.admin_read_at, '-infinity'))))
  ) ELSE (
    SELECT count(*)::int FROM public.support_messages m
    JOIN public.support_chats c ON c.id = m.chat_id
    WHERE m.user_id = auth.uid() AND m.from_admin AND m.kind <> 'transferred' AND m.created_at > c.user_read_at
  ) END;
$$;
REVOKE EXECUTE ON FUNCTION public.support_unread_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_unread_count() TO authenticated;

-- ===================================================================
-- Admin -> Support
-- ===================================================================

-- Chats, most recent message first, with the count for each filter.
--   p_filter: waiting, mine (handled by me, open), open (all not ended), ended, or NULL for all
--   p_role: customer, vendor or rider
--   p_chat_id: just that chat
CREATE OR REPLACE FUNCTION public.admin_support_chats(
  p_filter TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 10,
  p_offset INTEGER DEFAULT 0,
  p_chat_id UUID DEFAULT NULL,
  p_role TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID, user_id UUID, user_name TEXT, user_email TEXT, user_phone TEXT, user_role TEXT,
  admin_id UUID, admin_name TEXT, status TEXT, created_at TIMESTAMPTZ, last_message_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ, ended_by_name TEXT, last_message TEXT, last_message_from_admin BOOLEAN, unread BOOLEAN,
  total_count BIGINT, waiting_count BIGINT, mine_count BIGINT, open_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q TEXT := NULLIF(trim(p_search), '');
  v_me UUID := auth.uid();
BEGIN
  PERFORM public.require_admin();
  RETURN QUERY
  WITH searched AS (
    SELECT c.*, u.name AS u_name, u.email AS u_email, u.phone AS u_phone
    FROM public.support_chats c
    JOIN public.profiles u ON u.id = c.user_id
    WHERE (p_chat_id IS NULL OR c.id = p_chat_id)
      AND (p_role IS NULL OR c.user_role = p_role)
      AND (v_q IS NULL OR u.name ILIKE '%' || v_q || '%' OR u.email ILIKE '%' || v_q || '%' OR u.phone ILIKE '%' || v_q || '%')
  ), counts AS (
    SELECT count(*) FILTER (WHERE s.ended_at IS NULL AND s.admin_id IS NULL) AS w,
           count(*) FILTER (WHERE s.ended_at IS NULL AND s.admin_id = v_me) AS mi,
           count(*) FILTER (WHERE s.ended_at IS NULL) AS o
    FROM searched s
  ), f AS (
    SELECT s.* FROM searched s
    WHERE p_filter IS NULL
       OR (p_filter = 'waiting' AND s.ended_at IS NULL AND s.admin_id IS NULL)
       OR (p_filter = 'mine' AND s.ended_at IS NULL AND s.admin_id = v_me)
       OR (p_filter = 'open' AND s.ended_at IS NULL)
       OR (p_filter = 'ended' AND s.ended_at IS NOT NULL)
  )
  SELECT f.id, f.user_id, f.u_name, f.u_email, f.u_phone, f.user_role, f.admin_id, a.name,
         CASE WHEN f.ended_at IS NOT NULL THEN 'ended' WHEN f.admin_id IS NULL THEN 'waiting' ELSE 'active' END,
         f.created_at, f.last_message_at, f.ended_at, e.name, lm.body, lm.from_admin,
         f.ended_at IS NULL AND (f.admin_id IS NULL OR (f.admin_id = v_me AND EXISTS (
           SELECT 1 FROM public.support_messages m
           WHERE m.chat_id = f.id AND NOT m.from_admin AND m.created_at > COALESCE(f.admin_read_at, '-infinity')))),
         count(*) OVER (), c.w, c.mi, c.o
  FROM f
  CROSS JOIN counts c
  LEFT JOIN public.profiles a ON a.id = f.admin_id
  LEFT JOIN public.profiles e ON e.id = f.ended_by
  LEFT JOIN LATERAL (
    SELECT m.body, m.from_admin FROM public.support_messages m
    WHERE m.chat_id = f.id AND m.kind = 'message' ORDER BY m.created_at DESC LIMIT 1
  ) lm ON true
  ORDER BY f.last_message_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 100) OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_support_chats(TEXT, TEXT, INTEGER, INTEGER, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_support_chats(TEXT, TEXT, INTEGER, INTEGER, UUID, TEXT) TO authenticated;

-- Locks an open chat for an admin action. p_handler: it must be theirs.
CREATE OR REPLACE FUNCTION public.support_lock_open_chat(p_chat_id UUID, p_handler BOOLEAN)
RETURNS public.support_chats
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chat public.support_chats%ROWTYPE;
BEGIN
  PERFORM public.require_admin();
  SELECT * INTO v_chat FROM public.support_chats WHERE id = p_chat_id FOR UPDATE;
  IF v_chat.id IS NULL THEN
    RAISE EXCEPTION 'Chat not found';
  END IF;
  IF v_chat.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'This chat has ended';
  END IF;
  IF p_handler AND v_chat.admin_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the admin handling this chat can do that';
  END IF;
  RETURN v_chat;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.support_lock_open_chat(UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;

-- Picks up a waiting chat
CREATE OR REPLACE FUNCTION public.admin_pick_support_chat(p_chat_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chat public.support_chats%ROWTYPE := public.support_lock_open_chat(p_chat_id, false);
BEGIN
  IF v_chat.admin_id = auth.uid() THEN
    RETURN;
  END IF;
  IF v_chat.admin_id IS NOT NULL THEN
    RAISE EXCEPTION '% is already handling this chat', (SELECT name FROM public.profiles WHERE id = v_chat.admin_id);
  END IF;
  UPDATE public.support_chats SET admin_id = auth.uid(), admin_read_at = now() WHERE id = p_chat_id;
  PERFORM public.support_add_message(p_chat_id, 'joined', true, NULL, auth.uid());
  PERFORM public.log_admin_action('pick_support_chat', 'support_chat', p_chat_id::text, NULL,
    jsonb_build_object('admin_id', auth.uid()));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_pick_support_chat(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_pick_support_chat(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_reply_support_chat(p_chat_id UUID, p_body TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chat public.support_chats%ROWTYPE := public.support_lock_open_chat(p_chat_id, true);
BEGIN
  PERFORM public.support_add_message(v_chat.id, 'message', true, public.support_check_body(p_body), auth.uid());
  UPDATE public.support_chats SET admin_read_at = now() WHERE id = v_chat.id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_reply_support_chat(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reply_support_chat(UUID, TEXT) TO authenticated;

-- Hands the chat to another admin, who carries on from here
CREATE OR REPLACE FUNCTION public.admin_transfer_support_chat(p_chat_id UUID, p_to_admin UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chat public.support_chats%ROWTYPE := public.support_lock_open_chat(p_chat_id, true);
BEGIN
  IF p_to_admin = auth.uid() THEN
    RAISE EXCEPTION 'Choose another admin';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_to_admin AND lower(role) = 'admin') THEN
    RAISE EXCEPTION 'That person isn''t an admin';
  END IF;
  UPDATE public.support_chats SET admin_id = p_to_admin, admin_read_at = NULL WHERE id = v_chat.id;
  PERFORM public.support_add_message(v_chat.id, 'transferred', true, NULL, p_to_admin);
  PERFORM public.log_admin_action('transfer_support_chat', 'support_chat', p_chat_id::text,
    jsonb_build_object('admin_id', v_chat.admin_id), jsonb_build_object('admin_id', p_to_admin));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_transfer_support_chat(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_transfer_support_chat(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_end_support_chat(p_chat_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chat public.support_chats%ROWTYPE := public.support_lock_open_chat(p_chat_id, true);
BEGIN
  UPDATE public.support_chats SET ended_at = now(), ended_by = auth.uid(), admin_read_at = now() WHERE id = v_chat.id;
  PERFORM public.support_add_message(v_chat.id, 'ended', true, NULL, auth.uid());
  PERFORM public.log_admin_action('end_support_chat', 'support_chat', p_chat_id::text, NULL,
    jsonb_build_object('ended_by', auth.uid()));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_end_support_chat(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_end_support_chat(UUID) TO authenticated;

-- The other admins a chat can be transferred to, with how many open chats each has
CREATE OR REPLACE FUNCTION public.admin_support_team()
RETURNS TABLE (id UUID, name TEXT, open_chats BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin();
  RETURN QUERY
  SELECT p.id, p.name, (SELECT count(*) FROM public.support_chats c WHERE c.admin_id = p.id AND c.ended_at IS NULL)
  FROM public.profiles p
  WHERE lower(p.role) = 'admin' AND p.id <> auth.uid()
  ORDER BY p.name;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_support_team() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_support_team() TO authenticated;

-- Someone who stops being an admin hands their open chats back to the waiting list
CREATE OR REPLACE FUNCTION public.release_support_chats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.support_chats SET admin_id = NULL, admin_read_at = NULL WHERE admin_id = NEW.id AND ended_at IS NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS release_support_chats ON public.profiles;
CREATE TRIGGER release_support_chats
  AFTER UPDATE OF role ON public.profiles
  FOR EACH ROW
  WHEN (lower(OLD.role) = 'admin' AND lower(NEW.role) <> 'admin')
  EXECUTE FUNCTION public.release_support_chats();

-- ===================================================================
-- Push: each new message calls the send-push Edge Function (like
-- notifications, see 20261007100000_notification_settings_and_push.sql)
-- ===================================================================

-- Who a message goes to:
--   from the person: the admin handling the chat, or every admin while it's waiting
--   an admin's reply, joined, ended: the person
--   transferred: the admin it went to
CREATE OR REPLACE FUNCTION public.support_message_recipients(p_message_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN NOT m.from_admin THEN m.admin_id WHEN m.kind = 'transferred' THEN m.admin_id ELSE m.user_id END
  FROM public.support_messages m
  WHERE m.id = p_message_id AND (m.from_admin OR m.admin_id IS NOT NULL)
  UNION
  SELECT p.id
  FROM public.support_messages m
  JOIN public.profiles p ON lower(p.role) = 'admin'
  WHERE m.id = p_message_id AND NOT m.from_admin AND m.admin_id IS NULL;
$$;
REVOKE EXECUTE ON FUNCTION public.support_message_recipients(UUID) FROM PUBLIC, anon, authenticated;
-- send-push asks who to send each message to
GRANT EXECUTE ON FUNCTION public.support_message_recipients(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.push_new_support_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url TEXT;
BEGIN
  IF to_regnamespace('net') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.support_message_recipients(NEW.id) r(profile_id)
       JOIN public.notification_settings s ON s.profile_id = r.profile_id AND s.push_enabled
       WHERE EXISTS (SELECT 1 FROM public.push_subscriptions ps WHERE ps.profile_id = r.profile_id)) THEN
    RETURN NEW;
  END IF;

  SELECT value INTO v_url FROM public.app_config WHERE key = 'functions_url';
  IF v_url IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    EXECUTE 'SELECT net.http_post(url := $1, body := $2, headers := $3)'
    USING v_url || '/send-push',
          jsonb_build_object('support_message_id', NEW.id),
          jsonb_build_object('Content-Type', 'application/json');
  EXCEPTION WHEN OTHERS THEN
    -- A push that can't be sent never blocks the message itself
    RAISE WARNING 'push not queued for support message %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS push_new_support_message ON public.support_messages;
CREATE TRIGGER push_new_support_message
  AFTER INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.push_new_support_message();
