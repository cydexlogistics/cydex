-- Rewards: achievements and challenges set by admins
--
--   * Milestones for customers, vendors and riders ("Complete 10 orders").
--     Progress counts from the reward's start date.
--   * Daily and weekly challenges for riders: progress resets each day/week
--     (Nigerian time, weeks start on Monday) and can be earned once per period.
--   * Fastest delivery (riders): earned each time a rider beats their own best
--     pickup-to-drop-off time on a trip of at least the set distance.
--   * The reward is a wallet bonus (added to the wallet, with a transaction in
--     the user's history) or a personal promotion only that user can use.
--
-- Also: riders' time online is now recorded (rider_online_sessions), and
-- riders set their own daily delivery goal.

-- ===================================================================
-- 1. Time online
-- ===================================================================
CREATE TABLE IF NOT EXISTS public.rider_online_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS rider_online_sessions_rider_idx ON public.rider_online_sessions (rider_id, started_at);
CREATE INDEX IF NOT EXISTS rider_online_sessions_open_idx ON public.rider_online_sessions (rider_id) WHERE ended_at IS NULL;
ALTER TABLE public.rider_online_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Riders read their own sessions" ON public.rider_online_sessions;
CREATE POLICY "Riders read their own sessions" ON public.rider_online_sessions FOR SELECT USING (rider_id = auth.uid() OR public.is_admin());
REVOKE INSERT, UPDATE, DELETE ON public.rider_online_sessions FROM anon, authenticated;

-- Riders online right now start a session from when they came online
INSERT INTO public.rider_online_sessions (rider_id, started_at)
SELECT rp.id, COALESCE(rp.online_since, now()) FROM public.rider_profiles rp
WHERE rp.rider_status = 'available'
  AND NOT EXISTS (SELECT 1 FROM public.rider_online_sessions s WHERE s.rider_id = rp.id AND s.ended_at IS NULL);

-- ===================================================================
-- 2. Daily delivery goal (set by the rider)
-- ===================================================================
ALTER TABLE public.rider_profiles
  ADD COLUMN IF NOT EXISTS daily_delivery_goal INTEGER NOT NULL DEFAULT 10;
ALTER TABLE public.rider_profiles DROP CONSTRAINT IF EXISTS rider_profiles_daily_delivery_goal_check;
ALTER TABLE public.rider_profiles ADD CONSTRAINT rider_profiles_daily_delivery_goal_check
  CHECK (daily_delivery_goal BETWEEN 1 AND 100);

-- ===================================================================
-- 3. Personal promotions (a reward only one person can use) and reward
--    transactions for vendors
-- ===================================================================
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS promotions_user_idx ON public.promotions (user_id) WHERE user_id IS NOT NULL;

ALTER TABLE public.vendor_transactions DROP CONSTRAINT IF EXISTS vendor_transactions_type_check;
ALTER TABLE public.vendor_transactions ADD CONSTRAINT vendor_transactions_type_check
  CHECK (type IN ('sale', 'payout', 'refund', 'adjustment', 'reward'));

-- ===================================================================
-- 4. Rewards and what's been earned
-- ===================================================================
CREATE TABLE IF NOT EXISTS public.rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  audience TEXT NOT NULL CHECK (audience IN ('customer', 'vendor', 'rider')),
  kind TEXT NOT NULL DEFAULT 'milestone' CHECK (kind IN ('milestone', 'daily', 'weekly')),
  metric TEXT NOT NULL CHECK (metric IN ('orders_completed', 'amount_spent', 'amount_sold', 'deliveries_completed',
                                         'distance_km', 'online_minutes', 'fastest_delivery')),
  -- How much of the metric: orders, naira, km or minutes. Fastest delivery: the shortest trip (km) that counts.
  target NUMERIC(14,2) NOT NULL CHECK (target > 0),
  reward_type TEXT NOT NULL CHECK (reward_type IN ('wallet_bonus', 'promotion')),
  reward_amount NUMERIC(12,2) CHECK (reward_amount IS NULL OR reward_amount > 0),
  promo_discount_type TEXT CHECK (promo_discount_type IS NULL OR promo_discount_type IN ('percent', 'flat')),
  promo_discount_value NUMERIC(12,2) CHECK (promo_discount_value IS NULL OR promo_discount_value > 0),
  promo_applies_to TEXT CHECK (promo_applies_to IS NULL OR promo_applies_to IN ('service_charge', 'delivery_fee', 'commission')),
  promo_valid_days INTEGER NOT NULL DEFAULT 30 CHECK (promo_valid_days BETWEEN 1 AND 365),
  promo_uses INTEGER NOT NULL DEFAULT 1 CHECK (promo_uses BETWEEN 1 AND 100),
  icon TEXT NOT NULL DEFAULT 'trophy',
  color TEXT NOT NULL DEFAULT 'amber',
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at > starts_at),
  CHECK (
       (audience = 'customer' AND metric IN ('orders_completed', 'amount_spent'))
    OR (audience = 'vendor' AND metric IN ('orders_completed', 'amount_sold'))
    OR (audience = 'rider' AND metric IN ('deliveries_completed', 'distance_km', 'online_minutes', 'fastest_delivery'))
  ),
  -- Challenges are for riders; fastest delivery is a standing record
  CHECK (kind = 'milestone' OR (audience = 'rider' AND metric <> 'fastest_delivery')),
  CHECK (
       (reward_type = 'wallet_bonus' AND reward_amount IS NOT NULL)
    OR (reward_type = 'promotion' AND promo_discount_type IS NOT NULL AND promo_discount_value IS NOT NULL AND promo_applies_to IS NOT NULL
        AND (promo_discount_type <> 'percent' OR promo_discount_value <= 100)
        AND ((audience = 'customer' AND promo_applies_to IN ('service_charge', 'delivery_fee'))
          OR (audience = 'vendor' AND promo_applies_to IN ('service_charge', 'delivery_fee', 'commission'))
          OR (audience = 'rider' AND promo_applies_to = 'commission')))
  )
);
ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read rewards" ON public.rewards;
CREATE POLICY "Admins read rewards" ON public.rewards FOR SELECT USING (public.is_admin());
REVOKE INSERT, UPDATE, DELETE ON public.rewards FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.reward_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_id UUID NOT NULL REFERENCES public.rewards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- 'all' for a milestone, the day or week for a challenge, the order for a fastest delivery
  period_key TEXT NOT NULL,
  progress NUMERIC(14,2),
  wallet_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  promotion_id UUID REFERENCES public.promotions(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reward_id, user_id, period_key)
);
CREATE INDEX IF NOT EXISTS reward_grants_user_idx ON public.reward_grants (user_id, earned_at DESC);
CREATE INDEX IF NOT EXISTS reward_grants_earned_idx ON public.reward_grants (earned_at DESC);
ALTER TABLE public.reward_grants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read their own rewards" ON public.reward_grants;
CREATE POLICY "Users read their own rewards" ON public.reward_grants FOR SELECT USING (user_id = auth.uid() OR public.is_admin());
REVOKE INSERT, UPDATE, DELETE ON public.reward_grants FROM anon, authenticated;

-- ===================================================================
-- 5. Measuring progress
-- ===================================================================

-- The time window a reward's progress is measured in, right now
CREATE OR REPLACE FUNCTION public.reward_window(r public.rewards, p_at TIMESTAMPTZ DEFAULT now(),
  OUT window_from TIMESTAMPTZ, OUT window_to TIMESTAMPTZ, OUT period_key TEXT)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_local TIMESTAMP := p_at AT TIME ZONE 'Africa/Lagos';
BEGIN
  IF r.kind = 'daily' THEN
    window_from := date_trunc('day', v_local) AT TIME ZONE 'Africa/Lagos';
    window_to := (date_trunc('day', v_local) + interval '1 day') AT TIME ZONE 'Africa/Lagos';
    period_key := to_char(v_local, 'YYYY-MM-DD');
  ELSIF r.kind = 'weekly' THEN
    window_from := date_trunc('week', v_local) AT TIME ZONE 'Africa/Lagos';
    window_to := (date_trunc('week', v_local) + interval '7 days') AT TIME ZONE 'Africa/Lagos';
    period_key := to_char(v_local, 'IYYY-"W"IW');
  ELSE
    window_from := r.starts_at;
    window_to := r.ends_at;
    period_key := 'all';
  END IF;
  -- Never before the reward started or after it ends
  window_from := GREATEST(window_from, r.starts_at);
  IF r.ends_at IS NOT NULL THEN
    window_to := LEAST(COALESCE(window_to, r.ends_at), r.ends_at);
  END IF;
END;
$$;

-- How much of a metric a user has done in a window (from inclusive, to exclusive; NULL = open)
CREATE OR REPLACE FUNCTION public.reward_metric(p_audience TEXT, p_user UUID, p_metric TEXT, p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v NUMERIC;
BEGIN
  IF p_metric IN ('orders_completed', 'amount_spent', 'amount_sold') THEN
    SELECT CASE p_metric
             WHEN 'amount_spent' THEN COALESCE(sum(o.total_amount), 0)   -- what they paid (card and wallet), after discounts
             WHEN 'amount_sold' THEN COALESCE(sum(o.subtotal), 0)        -- items sold
             ELSE count(*) END
    INTO v
    FROM public.orders o
    WHERE o.status = 'delivered'
      AND (p_from IS NULL OR o.delivered_at >= p_from) AND (p_to IS NULL OR o.delivered_at < p_to)
      AND CASE WHEN p_audience = 'customer' THEN o.customer_id = p_user AND o.order_type IN ('customer', 'express')
               ELSE o.vendor_id = p_user AND o.order_type = 'customer' END;
  ELSIF p_metric IN ('deliveries_completed', 'distance_km') THEN
    SELECT CASE p_metric WHEN 'distance_km' THEN COALESCE(sum(o.distance_km), 0) ELSE count(*) END
    INTO v
    FROM public.orders o
    WHERE o.rider_id = p_user AND o.status = 'delivered'
      AND (p_from IS NULL OR o.delivered_at >= p_from) AND (p_to IS NULL OR o.delivered_at < p_to);
  ELSIF p_metric = 'online_minutes' THEN
    SELECT COALESCE(sum(GREATEST(0, extract(epoch FROM
             LEAST(COALESCE(s.ended_at, now()), COALESCE(p_to, 'infinity'::timestamptz))
           - GREATEST(s.started_at, COALESCE(p_from, '-infinity'::timestamptz))) / 60)), 0)
    INTO v
    FROM public.rider_online_sessions s
    WHERE s.rider_id = p_user
      AND (p_to IS NULL OR s.started_at < p_to)
      AND (p_from IS NULL OR COALESCE(s.ended_at, now()) > p_from);
  ELSE
    v := 0;
  END IF;
  RETURN round(COALESCE(v, 0), 2);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.reward_metric(TEXT, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;

-- A rider's fastest pickup-to-drop-off time (minutes) on trips of at least p_min_km
CREATE OR REPLACE FUNCTION public.rider_best_ride_minutes(p_rider UUID, p_min_km NUMERIC, p_from TIMESTAMPTZ, p_except UUID DEFAULT NULL)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT round(min(extract(epoch FROM (o.delivered_at - o.picked_up_at)) / 60)::numeric, 1)
  FROM public.orders o
  WHERE o.rider_id = p_rider AND o.status = 'delivered'
    AND o.picked_up_at IS NOT NULL AND o.delivered_at > o.picked_up_at
    AND COALESCE(o.distance_km, 0) >= p_min_km
    AND (p_from IS NULL OR o.delivered_at >= p_from)
    AND (p_except IS NULL OR o.id <> p_except);
$$;
REVOKE EXECUTE ON FUNCTION public.rider_best_ride_minutes(UUID, NUMERIC, TIMESTAMPTZ, UUID) FROM PUBLIC, anon, authenticated;

-- What a reward gives, in words, as the person it's for reads it
-- ("₦500 wallet bonus", "Free delivery fee for 1 order", "No commission on your sales for 5 orders")
CREATE OR REPLACE FUNCTION public.reward_prize_text(r public.rewards)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_what TEXT;
BEGIN
  IF r.reward_type = 'wallet_bonus' THEN
    RETURN '₦' || to_char(r.reward_amount, 'FM999,999,990') || ' wallet bonus';
  END IF;
  v_what := CASE
    WHEN r.promo_applies_to = 'delivery_fee' AND r.audience = 'vendor' THEN 'Request Rider delivery fee'
    WHEN r.promo_applies_to = 'delivery_fee' THEN 'delivery fee'
    WHEN r.promo_applies_to = 'service_charge' AND r.audience = 'vendor' THEN 'Request Rider commission'
    WHEN r.promo_applies_to = 'service_charge' THEN 'Service Charge'
    WHEN r.audience = 'rider' THEN 'commission on your deliveries'
    ELSE 'commission on your sales' END;
  RETURN CASE
      WHEN r.promo_discount_type = 'percent' AND r.promo_discount_value >= 100 THEN
        CASE WHEN r.promo_applies_to IN ('commission', 'service_charge') AND r.audience <> 'customer' THEN 'No ' ELSE 'Free ' END || v_what
      WHEN r.promo_discount_type = 'percent' THEN trim_scale(r.promo_discount_value)::text || '% off the ' || v_what
      ELSE '₦' || to_char(r.promo_discount_value, 'FM999,999,990') || ' off the ' || v_what END
    || ' for ' || r.promo_uses || CASE WHEN r.promo_uses = 1 THEN ' order' ELSE ' orders' END;
END;
$$;

-- ===================================================================
-- 6. Earning a reward
-- ===================================================================

-- Gives a reward once per (reward, user, period). Returns true if it was new.
CREATE OR REPLACE FUNCTION public.grant_reward(r public.rewards, p_user UUID, p_period_key TEXT, p_progress NUMERIC, p_order UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grant UUID;
  v_promo UUID;
  v_text TEXT := public.reward_prize_text(r);
BEGIN
  INSERT INTO public.reward_grants (reward_id, user_id, period_key, progress, order_id,
                                    wallet_amount)
  VALUES (r.id, p_user, p_period_key, p_progress, p_order,
          CASE WHEN r.reward_type = 'wallet_bonus' THEN r.reward_amount ELSE 0 END)
  ON CONFLICT (reward_id, user_id, period_key) DO NOTHING
  RETURNING id INTO v_grant;
  IF v_grant IS NULL THEN
    RETURN false;
  END IF;

  IF r.reward_type = 'wallet_bonus' THEN
    IF r.audience = 'customer' THEN
      INSERT INTO public.customer_wallet (customer_id, available_balance) VALUES (p_user, r.reward_amount)
      ON CONFLICT (customer_id) DO UPDATE SET available_balance = customer_wallet.available_balance + r.reward_amount, updated_at = now();
      INSERT INTO public.customer_transactions (customer_id, transaction_id, type, amount, status, description,
                                                reference_id, reference_type, processed_at, metadata)
      VALUES (p_user, 'RWD-' || upper(substr(replace(v_grant::text, '-', ''), 1, 12)), 'reward', r.reward_amount, 'completed',
              'Reward: ' || r.title, p_order, 'reward', now(), jsonb_build_object('reward_id', r.id, 'grant_id', v_grant));
    ELSIF r.audience = 'vendor' THEN
      INSERT INTO public.vendor_wallet (vendor_id, available_balance, total_earned) VALUES (p_user, r.reward_amount, r.reward_amount)
      ON CONFLICT (vendor_id) DO UPDATE SET available_balance = vendor_wallet.available_balance + r.reward_amount,
        total_earned = vendor_wallet.total_earned + r.reward_amount, updated_at = now();
      INSERT INTO public.vendor_transactions (vendor_id, transaction_id, type, amount, fee, net_amount, status, description,
                                              reference_id, reference_type, processed_at, metadata)
      VALUES (p_user, 'RWD-' || upper(substr(replace(v_grant::text, '-', ''), 1, 12)), 'reward', r.reward_amount, 0, r.reward_amount,
              'completed', 'Reward: ' || r.title, p_order, 'reward', now(), jsonb_build_object('reward_id', r.id, 'grant_id', v_grant));
    ELSE
      INSERT INTO public.rider_wallet (rider_id, available_balance, total_earned) VALUES (p_user, r.reward_amount, r.reward_amount)
      ON CONFLICT (rider_id) DO UPDATE SET available_balance = rider_wallet.available_balance + r.reward_amount,
        total_earned = rider_wallet.total_earned + r.reward_amount, updated_at = now();
      INSERT INTO public.rider_transactions (rider_id, transaction_id, type, amount, fee, net_amount, status, description,
                                             reference_id, reference_type, processed_at, metadata)
      VALUES (p_user, 'RWD-' || upper(substr(replace(v_grant::text, '-', ''), 1, 12)), 'bonus', r.reward_amount, 0, r.reward_amount,
              'completed', 'Reward: ' || r.title, p_order, 'reward', now(), jsonb_build_object('reward_id', r.id, 'grant_id', v_grant));
    END IF;
  ELSE
    INSERT INTO public.promotions (name, code, discount_type, discount_value, applies_to, cost_bearer, starts_at, ends_at,
                                   is_active, audience, max_uses_per_user, show_in_offers, user_id)
    VALUES ('Reward: ' || r.title, NULL, r.promo_discount_type, r.promo_discount_value, r.promo_applies_to, 'cydex',
            now(), now() + make_interval(days => r.promo_valid_days), true, r.audience, r.promo_uses, true, p_user)
    RETURNING id INTO v_promo;
    UPDATE public.reward_grants SET promotion_id = v_promo WHERE id = v_grant;
  END IF;

  PERFORM public.notify_user(p_user, 'reward', 'Reward unlocked: ' || r.title,
    'You''ve earned ' || v_text || CASE WHEN r.reward_type = 'wallet_bonus' THEN ', added to your wallet.' ELSE '. It''s applied automatically.' END);
  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.grant_reward(public.rewards, UUID, TEXT, NUMERIC, UUID) FROM PUBLIC, anon, authenticated;

-- Checks every running reward for one user and gives the ones they've reached
CREATE OR REPLACE FUNCTION public.evaluate_rewards(p_user UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  r public.rewards%ROWTYPE;
  w RECORD;
  v_progress NUMERIC;
  v_count INTEGER := 0;
BEGIN
  SELECT lower(role) INTO v_role FROM public.profiles WHERE id = p_user;
  IF v_role NOT IN ('customer', 'vendor', 'rider') THEN
    RETURN 0;
  END IF;
  FOR r IN
    SELECT * FROM public.rewards
    WHERE is_active AND audience = v_role AND metric <> 'fastest_delivery'
      AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())
  LOOP
    SELECT * INTO w FROM public.reward_window(r);
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.reward_grants g
                          WHERE g.reward_id = r.id AND g.user_id = p_user AND g.period_key = w.period_key);
    v_progress := public.reward_metric(r.audience, p_user, r.metric, w.window_from, w.window_to);
    IF v_progress >= r.target AND public.grant_reward(r, p_user, w.period_key, v_progress) THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.evaluate_rewards(UUID) FROM PUBLIC, anon, authenticated;

-- A delivery just finished: check the customer's, vendor's and rider's rewards,
-- and whether the rider beat their fastest time
CREATE OR REPLACE FUNCTION public.rewards_on_delivery()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.rewards%ROWTYPE;
  v_ride NUMERIC;
  v_best NUMERIC;
BEGIN
  -- A problem with rewards must never stop an order being delivered
  BEGIN
  IF NEW.customer_id IS NOT NULL THEN PERFORM public.evaluate_rewards(NEW.customer_id); END IF;
  IF NEW.vendor_id IS NOT NULL AND NEW.order_type = 'customer' THEN PERFORM public.evaluate_rewards(NEW.vendor_id); END IF;
  IF NEW.rider_id IS NULL THEN
    RETURN NULL;
  END IF;
  PERFORM public.evaluate_rewards(NEW.rider_id);

  IF NEW.picked_up_at IS NULL OR NEW.delivered_at IS NULL OR NEW.delivered_at <= NEW.picked_up_at THEN
    RETURN NULL;
  END IF;
  v_ride := round((extract(epoch FROM (NEW.delivered_at - NEW.picked_up_at)) / 60)::numeric, 1);
  FOR r IN
    SELECT * FROM public.rewards
    WHERE is_active AND audience = 'rider' AND metric = 'fastest_delivery'
      AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())
      AND COALESCE(NEW.distance_km, 0) >= target
  LOOP
    -- Their best before this delivery (since the reward started); the first one sets it
    v_best := public.rider_best_ride_minutes(NEW.rider_id, r.target, r.starts_at, NEW.id);
    IF v_best IS NOT NULL AND v_ride < v_best THEN
      PERFORM public.grant_reward(r, NEW.rider_id, NEW.id::text, v_ride, NEW.id);
    END IF;
  END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'rewards_on_delivery for order %: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS rewards_on_delivery ON public.orders;
CREATE TRIGGER rewards_on_delivery
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW WHEN (NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered')
  EXECUTE FUNCTION public.rewards_on_delivery();

-- Riders' online sessions: open when they come online, close when they go
-- offline (and check their time-online rewards then)
CREATE OR REPLACE FUNCTION public.log_rider_online_session()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.rider_status = 'available' THEN
      INSERT INTO public.rider_online_sessions (rider_id) VALUES (NEW.id);
    END IF;
    RETURN NULL;
  END IF;
  IF NEW.rider_status = 'available' AND OLD.rider_status IS DISTINCT FROM 'available' THEN
    UPDATE public.rider_online_sessions SET ended_at = now() WHERE rider_id = NEW.id AND ended_at IS NULL;
    INSERT INTO public.rider_online_sessions (rider_id) VALUES (NEW.id);
  ELSIF OLD.rider_status = 'available' AND NEW.rider_status IS DISTINCT FROM 'available' THEN
    UPDATE public.rider_online_sessions SET ended_at = now() WHERE rider_id = NEW.id AND ended_at IS NULL;
    -- A problem with rewards must never stop a rider going offline
    BEGIN
      PERFORM public.evaluate_rewards(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'time-online rewards for rider %: %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS log_rider_online_session ON public.rider_profiles;
CREATE TRIGGER log_rider_online_session
  AFTER INSERT OR UPDATE OF rider_status ON public.rider_profiles
  FOR EACH ROW EXECUTE FUNCTION public.log_rider_online_session();

-- Runs every 10 minutes (pg_cron): time-online rewards for riders who are online now
CREATE OR REPLACE FUNCTION public.evaluate_online_rewards()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rider UUID;
  v_count INTEGER := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.rewards WHERE is_active AND metric = 'online_minutes'
                 AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())) THEN
    RETURN 0;
  END IF;
  FOR v_rider IN SELECT DISTINCT rider_id FROM public.rider_online_sessions WHERE ended_at IS NULL LOOP
    v_count := v_count + public.evaluate_rewards(v_rider);
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.evaluate_online_rewards() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
    PERFORM cron.schedule('evaluate-online-rewards', '*/10 * * * *', 'SELECT public.evaluate_online_rewards()');
  END IF;
END;
$$;

-- ===================================================================
-- 7. What users see: their rewards and progress
-- ===================================================================
CREATE OR REPLACE FUNCTION public.my_rewards()
RETURNS TABLE (
  id UUID, title TEXT, description TEXT, kind TEXT, metric TEXT, target NUMERIC, icon TEXT, color TEXT,
  prize TEXT, reward_type TEXT, reward_amount NUMERIC, starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ,
  period_ends_at TIMESTAMPTZ, progress NUMERIC, earned BOOLEAN, earned_at TIMESTAMPTZ, times_earned BIGINT,
  best_minutes NUMERIC, running BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_role TEXT;
  r public.rewards%ROWTYPE;
  w RECORD;
  v_running BOOLEAN;
BEGIN
  SELECT lower(p.role) INTO v_role FROM public.profiles p WHERE p.id = v_user;
  FOR r IN
    SELECT * FROM public.rewards x
    WHERE x.audience = v_role
      AND (
        -- Running now
        (x.is_active AND x.starts_at <= now() AND (x.ends_at IS NULL OR x.ends_at > now()))
        -- Or a milestone they earned (kept as a badge)
        OR (x.kind = 'milestone' AND EXISTS (SELECT 1 FROM public.reward_grants g WHERE g.reward_id = x.id AND g.user_id = v_user))
      )
    ORDER BY x.kind, x.created_at
  LOOP
    SELECT * INTO w FROM public.reward_window(r);
    v_running := r.is_active AND r.starts_at <= now() AND (r.ends_at IS NULL OR r.ends_at > now());
    id := r.id; title := r.title; description := r.description; kind := r.kind; metric := r.metric; target := r.target;
    icon := r.icon; color := r.color; prize := public.reward_prize_text(r); reward_type := r.reward_type;
    reward_amount := r.reward_amount; starts_at := r.starts_at; ends_at := r.ends_at; running := v_running;
    period_ends_at := CASE WHEN r.kind = 'milestone' THEN r.ends_at ELSE w.window_to END;
    SELECT count(*), max(g.earned_at) INTO times_earned, earned_at
    FROM public.reward_grants g
    WHERE g.reward_id = r.id AND g.user_id = v_user AND (r.metric = 'fastest_delivery' OR g.period_key = w.period_key);
    earned := times_earned > 0 AND r.metric <> 'fastest_delivery';
    IF r.metric = 'fastest_delivery' THEN
      best_minutes := public.rider_best_ride_minutes(v_user, r.target, r.starts_at);
      progress := NULL;
    ELSE
      best_minutes := NULL;
      progress := public.reward_metric(r.audience, v_user, r.metric, w.window_from, w.window_to);
    END IF;
    RETURN NEXT;
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.my_rewards() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_rewards() TO authenticated;

-- Everything the signed-in user has earned, newest first, with the date: each
-- achievement, each daily or weekly challenge completed, each new fastest delivery
CREATE OR REPLACE FUNCTION public.my_reward_history(p_limit INTEGER DEFAULT 10, p_offset INTEGER DEFAULT 0)
RETURNS TABLE (
  id UUID, reward_id UUID, title TEXT, description TEXT, kind TEXT, metric TEXT, target NUMERIC, icon TEXT, color TEXT,
  prize TEXT, progress NUMERIC, earned_at TIMESTAMPTZ, total_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.id, x.id, x.title, x.description, x.kind, x.metric, x.target, x.icon, x.color,
         public.reward_prize_text(x), g.progress, g.earned_at, count(*) OVER ()
  FROM public.reward_grants g
  JOIN public.rewards x ON x.id = g.reward_id
  WHERE g.user_id = auth.uid()
  ORDER BY g.earned_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 100) OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;
REVOKE EXECUTE ON FUNCTION public.my_reward_history(INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_reward_history(INTEGER, INTEGER) TO authenticated;

-- ===================================================================
-- 8. Admin
-- ===================================================================
CREATE OR REPLACE FUNCTION public.admin_save_reward(
  p_title TEXT,
  p_audience TEXT,
  p_metric TEXT,
  p_target NUMERIC,
  p_reward_type TEXT,
  p_id UUID DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_kind TEXT DEFAULT 'milestone',
  p_reward_amount NUMERIC DEFAULT NULL,
  p_promo_discount_type TEXT DEFAULT NULL,
  p_promo_discount_value NUMERIC DEFAULT NULL,
  p_promo_applies_to TEXT DEFAULT NULL,
  p_promo_valid_days INTEGER DEFAULT 30,
  p_promo_uses INTEGER DEFAULT 1,
  p_icon TEXT DEFAULT 'trophy',
  p_color TEXT DEFAULT 'amber',
  p_starts_at TIMESTAMPTZ DEFAULT NULL,
  p_ends_at TIMESTAMPTZ DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT true
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID := p_id;
  v_old JSONB;
  v_title TEXT := NULLIF(trim(p_title), '');
BEGIN
  PERFORM public.require_admin();
  IF v_title IS NULL OR length(v_title) > 80 THEN
    RAISE EXCEPTION 'Give the reward a title of up to 80 characters';
  END IF;
  IF COALESCE(p_icon, '') !~ '^[a-z-]{2,30}$' OR COALESCE(p_color, '') !~ '^[a-z]{2,20}$' THEN
    RAISE EXCEPTION 'Choose an icon and a colour';
  END IF;
  IF p_reward_type = 'wallet_bonus' AND (p_reward_amount IS NULL OR p_reward_amount <= 0 OR p_reward_amount > 1000000) THEN
    RAISE EXCEPTION 'Enter the wallet bonus (up to ₦1,000,000)';
  END IF;

  BEGIN
    IF p_id IS NULL THEN
      INSERT INTO public.rewards (title, description, audience, kind, metric, target, reward_type, reward_amount,
        promo_discount_type, promo_discount_value, promo_applies_to, promo_valid_days, promo_uses, icon, color,
        starts_at, ends_at, is_active, created_by)
      VALUES (v_title, NULLIF(trim(p_description), ''), p_audience, COALESCE(p_kind, 'milestone'), p_metric, p_target, p_reward_type,
        CASE WHEN p_reward_type = 'wallet_bonus' THEN p_reward_amount END,
        CASE WHEN p_reward_type = 'promotion' THEN p_promo_discount_type END,
        CASE WHEN p_reward_type = 'promotion' THEN p_promo_discount_value END,
        CASE WHEN p_reward_type = 'promotion' THEN p_promo_applies_to END,
        COALESCE(p_promo_valid_days, 30), COALESCE(p_promo_uses, 1), p_icon, p_color,
        COALESCE(p_starts_at, now()), p_ends_at, COALESCE(p_is_active, true), auth.uid())
      RETURNING id INTO v_id;
    ELSE
      SELECT to_jsonb(x) INTO v_old FROM public.rewards x WHERE x.id = p_id;
      IF v_old IS NULL THEN
        RAISE EXCEPTION 'Reward not found';
      END IF;
      UPDATE public.rewards SET
        title = v_title, description = NULLIF(trim(p_description), ''), audience = p_audience, kind = COALESCE(p_kind, 'milestone'),
        metric = p_metric, target = p_target, reward_type = p_reward_type,
        reward_amount = CASE WHEN p_reward_type = 'wallet_bonus' THEN p_reward_amount END,
        promo_discount_type = CASE WHEN p_reward_type = 'promotion' THEN p_promo_discount_type END,
        promo_discount_value = CASE WHEN p_reward_type = 'promotion' THEN p_promo_discount_value END,
        promo_applies_to = CASE WHEN p_reward_type = 'promotion' THEN p_promo_applies_to END,
        promo_valid_days = COALESCE(p_promo_valid_days, 30), promo_uses = COALESCE(p_promo_uses, 1),
        icon = p_icon, color = p_color, starts_at = COALESCE(p_starts_at, starts_at), ends_at = p_ends_at,
        is_active = COALESCE(p_is_active, true), updated_at = now()
      WHERE id = p_id;
    END IF;
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION 'Those choices don''t fit together. Check who it''s for, what it counts, the reward and the dates.';
  END;

  PERFORM public.log_admin_action(CASE WHEN p_id IS NULL THEN 'create_reward' ELSE 'update_reward' END,
    'reward', v_id::text, v_old, (SELECT to_jsonb(x) FROM public.rewards x WHERE x.id = v_id));
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_save_reward(TEXT, TEXT, TEXT, NUMERIC, TEXT, UUID, TEXT, TEXT, NUMERIC, TEXT, NUMERIC, TEXT, INTEGER, INTEGER, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_reward(TEXT, TEXT, TEXT, NUMERIC, TEXT, UUID, TEXT, TEXT, NUMERIC, TEXT, NUMERIC, TEXT, INTEGER, INTEGER, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN) TO authenticated;

-- Rewards with how many times and by how many people each was earned
CREATE OR REPLACE FUNCTION public.admin_rewards()
RETURNS TABLE (
  id UUID, title TEXT, description TEXT, audience TEXT, kind TEXT, metric TEXT, target NUMERIC, reward_type TEXT,
  reward_amount NUMERIC, promo_discount_type TEXT, promo_discount_value NUMERIC, promo_applies_to TEXT,
  promo_valid_days INTEGER, promo_uses INTEGER, icon TEXT, color TEXT, starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ,
  is_active BOOLEAN, created_at TIMESTAMPTZ, prize TEXT, state TEXT, times_earned BIGINT, people BIGINT, paid_out NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin();
  RETURN QUERY
  SELECT x.id, x.title, x.description, x.audience, x.kind, x.metric, x.target, x.reward_type, x.reward_amount,
         x.promo_discount_type, x.promo_discount_value, x.promo_applies_to, x.promo_valid_days, x.promo_uses,
         x.icon, x.color, x.starts_at, x.ends_at, x.is_active, x.created_at, public.reward_prize_text(x),
         CASE WHEN NOT x.is_active THEN 'off' WHEN now() < x.starts_at THEN 'scheduled'
              WHEN x.ends_at IS NOT NULL AND now() >= x.ends_at THEN 'ended' ELSE 'running' END,
         (SELECT count(*) FROM public.reward_grants g WHERE g.reward_id = x.id),
         (SELECT count(DISTINCT g.user_id) FROM public.reward_grants g WHERE g.reward_id = x.id),
         (SELECT COALESCE(sum(g.wallet_amount), 0) FROM public.reward_grants g WHERE g.reward_id = x.id)
  FROM public.rewards x
  ORDER BY x.created_at DESC;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_rewards() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_rewards() TO authenticated;

-- Admin -> Money -> Rewards: every reward given in a period, newest first
CREATE OR REPLACE FUNCTION public.admin_reward_grants(
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL,
  p_limit INTEGER DEFAULT 10,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID, earned_at TIMESTAMPTZ, user_id UUID, user_name TEXT, user_role TEXT, reward_id UUID, reward_title TEXT,
  prize TEXT, wallet_amount NUMERIC, promotion_id UUID, total_count BIGINT, total_paid NUMERIC, total_promotions BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin();
  RETURN QUERY
  WITH g AS (
    SELECT g.* FROM public.reward_grants g
    WHERE (p_from IS NULL OR g.earned_at >= p_from) AND (p_to IS NULL OR g.earned_at < p_to)
  ), totals AS (
    SELECT count(*) AS c, COALESCE(sum(g.wallet_amount), 0) AS paid, count(g.promotion_id) AS promos FROM g
  )
  SELECT g.id, g.earned_at, g.user_id, p.name, lower(p.role), x.id, x.title, public.reward_prize_text(x),
         g.wallet_amount, g.promotion_id, t.c, t.paid, t.promos
  FROM g
  JOIN public.rewards x ON x.id = g.reward_id
  LEFT JOIN public.profiles p ON p.id = g.user_id
  CROSS JOIN totals t
  ORDER BY g.earned_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_reward_grants(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reward_grants(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER) TO authenticated;

-- ===================================================================
-- 9. Personal promotions only for their owner
-- ===================================================================
CREATE OR REPLACE FUNCTION public.apply_promotion(p_order_type text, p_user_id uuid, p_vendor_id uuid, p_subtotal numeric, p_delivery_fee numeric, p_service_charge numeric, p_distance_km numeric, p_vehicle_type text, p_coupon_code text, OUT promotion_id uuid, OUT promotion_name text, OUT discount_amount numeric, OUT discount_target text, OUT discount_bearer text, OUT coupon_status text, OUT coupon_message text, OUT uses_left integer)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_code TEXT := NULLIF(upper(regexp_replace(COALESCE(p_coupon_code, ''), '\s', '', 'g')), '');
  v_audience TEXT := CASE WHEN p_order_type = 'rider_request' THEN 'vendor' ELSE 'customer' END;
  r RECORD;
  room RECORD;
  c public.promotions%ROWTYPE;
BEGIN
  discount_amount := 0;
  coupon_status := CASE WHEN v_code IS NULL THEN 'none' ELSE 'invalid' END;
  IF p_order_type NOT IN ('customer', 'express', 'rider_request') THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT s.* FROM (
      SELECT p.id, p.name, p.code, p.applies_to, p.cost_bearer, p.created_at,
             round(CASE WHEN p.discount_type = 'percent' THEN x.base * p.discount_value / 100
                        ELSE LEAST(p.discount_value, x.base) END, 2) AS amount
      FROM public.promotions p
      CROSS JOIN LATERAL (
        SELECT COALESCE(CASE p.applies_to WHEN 'service_charge' THEN p_service_charge
                                          WHEN 'delivery_fee' THEN p_delivery_fee
                                          WHEN 'items' THEN p_subtotal END, 0) AS base
      ) x
      WHERE p.is_active
        AND now() >= p.starts_at AND now() < p.ends_at
        AND p.applies_to <> 'commission'
        AND p.audience IN (v_audience, 'all')
        AND (p.user_id IS NULL OR p.user_id = p_user_id)
        AND (p.code IS NULL OR p.code = v_code)
        AND (p.applies_to <> 'items' OR (p_order_type = 'customer' AND p.vendor_id = p_vendor_id))
        AND (p.max_distance_km IS NULL OR COALESCE(p_distance_km, 0) <= p.max_distance_km)
        AND (p.vehicle_types IS NULL OR p_vehicle_type = ANY (p.vehicle_types))
        AND x.base > 0
    ) s
    -- The coupon they entered first, then whichever saves the most
    ORDER BY (s.code IS NOT NULL) DESC, s.amount DESC, s.created_at
  LOOP
    SELECT * INTO room FROM public.promotion_room(r.id, p_user_id);
    CONTINUE WHEN NOT room.eligible;
    promotion_id := r.id;
    promotion_name := r.name;
    discount_amount := r.amount;
    discount_target := r.applies_to;
    discount_bearer := r.cost_bearer;
    uses_left := room.uses_left;
    IF r.code IS NOT NULL THEN
      coupon_status := 'applied';
    END IF;
    EXIT;
  END LOOP;

  -- Why the code they typed wasn't used
  IF coupon_status = 'invalid' THEN
    SELECT * INTO c FROM public.promotions WHERE code = v_code AND (user_id IS NULL OR user_id = p_user_id);
    IF c.id IS NULL OR NOT c.is_active OR now() < c.starts_at THEN
      coupon_message := 'That coupon code isn''t valid.';
    ELSIF now() >= c.ends_at THEN
      coupon_message := 'That coupon has ended.';
    ELSIF c.audience NOT IN (v_audience, 'all') THEN
      coupon_message := 'That coupon isn''t for this kind of order.';
    ELSE
      SELECT * INTO room FROM public.promotion_room(c.id, p_user_id);
      coupon_message := CASE room.reason
        WHEN 'used_up' THEN 'You''ve already used this coupon as many times as it allows.'
        WHEN 'fully_claimed' THEN 'This coupon has been fully claimed.'
        ELSE 'That coupon doesn''t apply to this order.' END;
    END IF;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_commission_promotion(p_role text, p_user_id uuid, p_commission numeric, p_distance_km numeric, p_vehicle_type text, OUT promotion_id uuid, OUT discount_amount numeric)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  room RECORD;
BEGIN
  discount_amount := 0;
  IF p_user_id IS NULL OR COALESCE(p_commission, 0) <= 0 OR p_role NOT IN ('vendor', 'rider') THEN
    RETURN;
  END IF;
  FOR r IN
    SELECT p.id, p.created_at,
           round(CASE WHEN p.discount_type = 'percent' THEN p_commission * p.discount_value / 100
                      ELSE LEAST(p.discount_value, p_commission) END, 2) AS amount
    FROM public.promotions p
    WHERE p.is_active
      AND now() >= p.starts_at AND now() < p.ends_at
      AND p.applies_to = 'commission'
      AND p.audience IN (p_role, 'all')
      AND (p.user_id IS NULL OR p.user_id = p_user_id)
      AND (p.max_distance_km IS NULL OR COALESCE(p_distance_km, 0) <= p.max_distance_km)
      AND (p.vehicle_types IS NULL OR p_vehicle_type = ANY (p.vehicle_types))
    ORDER BY 3 DESC, p.created_at
  LOOP
    CONTINUE WHEN r.amount <= 0;
    SELECT * INTO room FROM public.promotion_room(r.id, p_user_id);
    CONTINUE WHEN NOT room.eligible;
    promotion_id := r.id;
    discount_amount := r.amount;
    EXIT;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.my_promotions()
 RETURNS TABLE(id uuid, name text, code text, discount_type text, discount_value numeric, applies_to text, vendor_id uuid, vendor_name text, max_distance_km numeric, vehicle_types text[], ends_at timestamp with time zone, uses_left integer, places_left integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id, p.name, p.code, p.discount_type, p.discount_value, p.applies_to, p.vendor_id, v.name,
         p.max_distance_km, p.vehicle_types, p.ends_at, room.uses_left,
         CASE WHEN p.max_users IS NULL THEN NULL
              ELSE GREATEST(p.max_users - (SELECT count(*) FROM public.promotion_uses(p.id)), 0)::int END
  FROM public.promotions p
  JOIN public.profiles me ON me.id = auth.uid()
  LEFT JOIN public.profiles v ON v.id = p.vendor_id
  CROSS JOIN LATERAL public.promotion_room(p.id, me.id) room
  WHERE p.is_active
    AND p.show_in_offers
    AND now() >= p.starts_at AND now() < p.ends_at
    AND lower(me.role) IN ('customer', 'vendor', 'rider')
    AND p.audience IN (lower(me.role), 'all')
    AND (p.user_id IS NULL OR p.user_id = me.id)
    AND CASE lower(me.role)
          WHEN 'customer' THEN p.applies_to IN ('service_charge', 'delivery_fee', 'items')
          WHEN 'vendor' THEN p.applies_to IN ('service_charge', 'delivery_fee', 'commission')
          ELSE p.applies_to = 'commission' END
    AND room.eligible
  -- The ones that need nothing from them first, then the soonest to end
  ORDER BY (p.code IS NOT NULL), p.ends_at;
$function$;

CREATE OR REPLACE FUNCTION public.admin_promotions()
 RETURNS TABLE(id uuid, name text, code text, discount_type text, discount_value numeric, applies_to text, vendor_id uuid, vendor_name text, cost_bearer text, max_distance_km numeric, vehicle_types text[], starts_at timestamp with time zone, ends_at timestamp with time zone, is_active boolean, created_at timestamp with time zone, state text, uses bigint, total_discount numeric, audience text, max_users integer, max_uses_per_user integer, users bigint, show_in_offers boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.require_admin();
  RETURN QUERY
  SELECT p.id, p.name, p.code, p.discount_type, p.discount_value, p.applies_to, p.vendor_id, v.name, p.cost_bearer,
         p.max_distance_km, p.vehicle_types, p.starts_at, p.ends_at, p.is_active, p.created_at,
         CASE WHEN NOT p.is_active THEN 'off' WHEN now() < p.starts_at THEN 'scheduled'
              WHEN now() >= p.ends_at THEN 'ended'
              WHEN p.max_users IS NOT NULL AND u.users >= p.max_users AND p.max_uses_per_user IS NOT NULL
                   AND u.uses >= p.max_users::bigint * p.max_uses_per_user THEN 'claimed'
              ELSE 'running' END,
         u.uses,
         (SELECT COALESCE(sum(CASE WHEN o.promotion_id = p.id THEN o.discount_amount ELSE 0 END
                              + CASE WHEN o.vendor_promotion_id = p.id THEN o.vendor_commission_discount ELSE 0 END
                              + CASE WHEN o.rider_promotion_id = p.id THEN o.rider_commission_discount ELSE 0 END), 0)
          FROM public.orders o
          WHERE p.id IN (o.promotion_id, o.vendor_promotion_id, o.rider_promotion_id) AND o.payment_status = 'paid'
            AND o.status NOT IN ('cancelled', 'rejected')),
         p.audience, p.max_users, p.max_uses_per_user, u.users, p.show_in_offers
  FROM public.promotions p
  LEFT JOIN public.profiles v ON v.id = p.vendor_id
  -- Personal promotions given as rewards are listed under Rewards
  CROSS JOIN LATERAL (
    SELECT COALESCE(sum(x.uses), 0)::bigint AS uses, count(*)::bigint AS users FROM public.promotion_uses(p.id) x
  ) u
  WHERE p.user_id IS NULL
  ORDER BY p.created_at DESC;
END;
$function$;
