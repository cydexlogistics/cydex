-- Referrals: every customer, vendor and rider has a code to share. When
-- someone of the same kind signs up with it and reaches the goal, the person
-- who referred them gets a wallet reward:
--   customers: ₦500 once the new customer has 2 delivered orders
--   riders:    ₦1,000 once the new rider has made 2 deliveries
--   vendors:   ₦1,000 once the new vendor has 5 sales or 3 rider requests delivered
-- Admins can change the amounts and goals, or switch a programme off.
-- A code only works for the same kind of account (a customer's code can't sign up a vendor).

-- ===================================================================
-- 1. Codes
-- ===================================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_key ON public.profiles (referral_code);

-- "CX7KQ2MP": no 0/O or 1/I, so it's easy to read out
CREATE OR REPLACE FUNCTION public.new_referral_code()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_chars CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code TEXT;
BEGIN
  LOOP
    v_code := 'CX';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = v_code);
  END LOOP;
  RETURN v_code;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.new_referral_code() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_referral_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(NEW.role) NOT IN ('customer', 'vendor', 'rider') THEN
    -- Admins don't refer anyone
    NEW.referral_code := NULL;
  ELSIF NEW.referral_code IS NULL THEN
    NEW.referral_code := public.new_referral_code();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS set_referral_code ON public.profiles;
CREATE TRIGGER set_referral_code
  BEFORE INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_referral_code();

UPDATE public.profiles SET referral_code = public.new_referral_code()
WHERE referral_code IS NULL AND lower(role) IN ('customer', 'vendor', 'rider');

-- ===================================================================
-- 2. Programmes (one per kind of account) and referrals
-- ===================================================================
CREATE TABLE IF NOT EXISTS public.referral_programs (
  role TEXT PRIMARY KEY CHECK (role IN ('customer', 'vendor', 'rider')),
  reward_amount NUMERIC(12,2) NOT NULL CHECK (reward_amount > 0 AND reward_amount <= 1000000),
  -- Customers: delivered orders. Riders: deliveries. Vendors: delivered sales.
  orders_needed INTEGER NOT NULL CHECK (orders_needed BETWEEN 1 AND 1000),
  -- Vendors only: or this many delivered rider requests
  rider_requests_needed INTEGER CHECK (rider_requests_needed IS NULL OR rider_requests_needed BETWEEN 1 AND 1000),
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (role = 'vendor' OR rider_requests_needed IS NULL)
);
INSERT INTO public.referral_programs (role, reward_amount, orders_needed, rider_requests_needed) VALUES
  ('customer', 500, 2, NULL),
  ('rider', 1000, 2, NULL),
  ('vendor', 1000, 5, 3)
ON CONFLICT (role) DO NOTHING;
ALTER TABLE public.referral_programs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone signed in reads referral programmes" ON public.referral_programs;
CREATE POLICY "Anyone signed in reads referral programmes" ON public.referral_programs FOR SELECT USING (auth.uid() IS NOT NULL);
REVOKE INSERT, UPDATE, DELETE ON public.referral_programs FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Each person can be referred once
  referred_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('customer', 'vendor', 'rider')),
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'rewarded')),
  reward_amount NUMERIC(12,2),
  rewarded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (referrer_id <> referred_id)
);
CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON public.referrals (referrer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS referrals_rewarded_idx ON public.referrals (rewarded_at DESC) WHERE status = 'rewarded';
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read referrals" ON public.referrals;
CREATE POLICY "Admins read referrals" ON public.referrals FOR SELECT USING (public.is_admin());
REVOKE INSERT, UPDATE, DELETE ON public.referrals FROM anon, authenticated;

-- ===================================================================
-- 3. Using a code
-- ===================================================================

-- Why a code can't be used by someone signing up as p_role (NULL = it can)
CREATE OR REPLACE FUNCTION public.referral_code_problem(p_code TEXT, p_role TEXT, p_user UUID DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner public.profiles%ROWTYPE;
  v_code TEXT := upper(regexp_replace(COALESCE(p_code, ''), '\s', '', 'g'));
BEGIN
  SELECT * INTO v_owner FROM public.profiles WHERE referral_code = v_code;
  IF v_owner.id IS NULL THEN
    RETURN 'That referral code isn''t valid.';
  END IF;
  IF v_owner.id = p_user THEN
    RETURN 'You can''t use your own referral code.';
  END IF;
  IF lower(v_owner.role) <> lower(COALESCE(p_role, '')) THEN
    RETURN 'That code is for ' || lower(v_owner.role) || 's. Use a code from another ' || lower(COALESCE(p_role, 'user')) || '.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.referral_programs WHERE role = lower(p_role) AND is_active) THEN
    RETURN 'Referrals are paused right now.';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.referral_code_problem(TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;

-- The sign-up form checks a code before creating the account
CREATE OR REPLACE FUNCTION public.check_referral_code(p_code TEXT, p_role TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.referral_code_problem(p_code, p_role);
$$;
GRANT EXECUTE ON FUNCTION public.check_referral_code(TEXT, TEXT) TO anon, authenticated;

-- Records who referred p_user. Returns NULL, or why it couldn't.
CREATE OR REPLACE FUNCTION public.link_referral(p_user UUID, p_code TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me public.profiles%ROWTYPE;
  v_code TEXT := upper(regexp_replace(COALESCE(p_code, ''), '\s', '', 'g'));
  v_problem TEXT;
BEGIN
  SELECT * INTO v_me FROM public.profiles WHERE id = p_user;
  IF v_me.id IS NULL OR v_code = '' THEN
    RETURN 'That referral code isn''t valid.';
  END IF;
  v_problem := public.referral_code_problem(v_code, v_me.role, p_user);
  IF v_problem IS NOT NULL THEN
    RETURN v_problem;
  END IF;
  INSERT INTO public.referrals (referrer_id, referred_id, role, code)
  SELECT id, p_user, lower(v_me.role), v_code FROM public.profiles WHERE referral_code = v_code
  ON CONFLICT (referred_id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN 'You''ve already used a referral code.';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.link_referral(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- How far a referred person is towards the goal
CREATE OR REPLACE FUNCTION public.referral_progress(p_user UUID, p_role TEXT, OUT orders INTEGER, OUT rider_requests INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT count(*)::int FROM public.orders o WHERE o.status = 'delivered' AND CASE p_role
       WHEN 'customer' THEN o.customer_id = p_user AND o.order_type IN ('customer', 'express')
       WHEN 'vendor' THEN o.vendor_id = p_user AND o.order_type = 'customer'
       ELSE o.rider_id = p_user END),
    (SELECT count(*)::int FROM public.orders o
     WHERE p_role = 'vendor' AND o.status = 'delivered' AND o.vendor_id = p_user AND o.order_type = 'rider_request');
$$;
REVOKE EXECUTE ON FUNCTION public.referral_progress(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- A signed-in user who didn't enter a code at sign-up can add one until
-- they've completed their first order (or delivery)
CREATE OR REPLACE FUNCTION public.apply_referral_code(p_code TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  p RECORD;
  v_problem TEXT;
BEGIN
  SELECT lower(role) INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role NOT IN ('customer', 'vendor', 'rider') THEN
    RAISE EXCEPTION 'Referral codes are for customers, vendors and riders';
  END IF;
  IF EXISTS (SELECT 1 FROM public.referrals WHERE referred_id = auth.uid()) THEN
    RAISE EXCEPTION 'You''ve already used a referral code';
  END IF;
  SELECT * INTO p FROM public.referral_progress(auth.uid(), v_role);
  IF p.orders > 0 OR p.rider_requests > 0 THEN
    RAISE EXCEPTION 'Referral codes can only be added before your first %',
      CASE v_role WHEN 'rider' THEN 'delivery' WHEN 'vendor' THEN 'sale' ELSE 'order' END;
  END IF;
  v_problem := public.link_referral(auth.uid(), p_code);
  IF v_problem IS NOT NULL THEN
    RAISE EXCEPTION '%', v_problem;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.apply_referral_code(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_referral_code(TEXT) TO authenticated;

-- ===================================================================
-- 4. Paying the reward
-- ===================================================================

-- Pays the referrer if the person they referred has reached the goal
CREATE OR REPLACE FUNCTION public.check_referral(p_user UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.referrals%ROWTYPE;
  prog public.referral_programs%ROWTYPE;
  p RECORD;
  v_name TEXT;
  v_tx TEXT;
  v_what TEXT;
BEGIN
  SELECT * INTO r FROM public.referrals WHERE referred_id = p_user AND status = 'pending' FOR UPDATE;
  IF r.id IS NULL THEN
    RETURN false;
  END IF;
  SELECT * INTO prog FROM public.referral_programs WHERE role = r.role AND is_active;
  IF prog.role IS NULL THEN
    RETURN false;
  END IF;
  SELECT * INTO p FROM public.referral_progress(p_user, r.role);
  IF NOT (p.orders >= prog.orders_needed
          OR (prog.rider_requests_needed IS NOT NULL AND p.rider_requests >= prog.rider_requests_needed)) THEN
    RETURN false;
  END IF;

  UPDATE public.referrals SET status = 'rewarded', reward_amount = prog.reward_amount, rewarded_at = now() WHERE id = r.id;
  SELECT split_part(COALESCE(NULLIF(trim(name), ''), 'Someone'), ' ', 1) INTO v_name FROM public.profiles WHERE id = p_user;
  v_tx := 'REF-' || upper(substr(replace(r.id::text, '-', ''), 1, 12));
  v_what := 'Referral reward: ' || v_name || ' joined with your code';

  IF r.role = 'customer' THEN
    INSERT INTO public.customer_wallet (customer_id, available_balance) VALUES (r.referrer_id, prog.reward_amount)
    ON CONFLICT (customer_id) DO UPDATE SET available_balance = customer_wallet.available_balance + prog.reward_amount, updated_at = now();
    INSERT INTO public.customer_transactions (customer_id, transaction_id, type, amount, status, description,
                                              reference_type, processed_at, metadata)
    VALUES (r.referrer_id, v_tx, 'reward', prog.reward_amount, 'completed', v_what, 'referral', now(),
            jsonb_build_object('referral_id', r.id));
  ELSIF r.role = 'vendor' THEN
    INSERT INTO public.vendor_wallet (vendor_id, available_balance, total_earned) VALUES (r.referrer_id, prog.reward_amount, prog.reward_amount)
    ON CONFLICT (vendor_id) DO UPDATE SET available_balance = vendor_wallet.available_balance + prog.reward_amount,
      total_earned = vendor_wallet.total_earned + prog.reward_amount, updated_at = now();
    INSERT INTO public.vendor_transactions (vendor_id, transaction_id, type, amount, fee, net_amount, status, description,
                                            reference_type, processed_at, metadata)
    VALUES (r.referrer_id, v_tx, 'reward', prog.reward_amount, 0, prog.reward_amount, 'completed', v_what, 'referral', now(),
            jsonb_build_object('referral_id', r.id));
  ELSE
    INSERT INTO public.rider_wallet (rider_id, available_balance, total_earned) VALUES (r.referrer_id, prog.reward_amount, prog.reward_amount)
    ON CONFLICT (rider_id) DO UPDATE SET available_balance = rider_wallet.available_balance + prog.reward_amount,
      total_earned = rider_wallet.total_earned + prog.reward_amount, updated_at = now();
    INSERT INTO public.rider_transactions (rider_id, transaction_id, type, amount, fee, net_amount, status, description,
                                           reference_type, processed_at, metadata)
    VALUES (r.referrer_id, v_tx, 'bonus', prog.reward_amount, 0, prog.reward_amount, 'completed', v_what, 'referral', now(),
            jsonb_build_object('referral_id', r.id));
  END IF;

  PERFORM public.notify_user(r.referrer_id, 'referral', 'Referral reward',
    v_name || ' reached their goal, so ₦' || to_char(prog.reward_amount, 'FM999,999,990') || ' has been added to your wallet.');
  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.check_referral(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.referrals_on_delivery()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- A problem with referrals must never stop an order being delivered
  BEGIN
    IF NEW.customer_id IS NOT NULL THEN PERFORM public.check_referral(NEW.customer_id); END IF;
    IF NEW.vendor_id IS NOT NULL THEN PERFORM public.check_referral(NEW.vendor_id); END IF;
    IF NEW.rider_id IS NOT NULL THEN PERFORM public.check_referral(NEW.rider_id); END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'referrals_on_delivery for order %: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS referrals_on_delivery ON public.orders;
CREATE TRIGGER referrals_on_delivery
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW WHEN (NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered')
  EXECUTE FUNCTION public.referrals_on_delivery();

-- ===================================================================
-- 5. What users see
-- ===================================================================
CREATE OR REPLACE FUNCTION public.my_referrals()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me public.profiles%ROWTYPE;
  prog public.referral_programs%ROWTYPE;
  p RECORD;
BEGIN
  SELECT * INTO me FROM public.profiles WHERE id = auth.uid();
  IF me.id IS NULL OR lower(me.role) NOT IN ('customer', 'vendor', 'rider') THEN
    RETURN NULL;
  END IF;
  SELECT * INTO prog FROM public.referral_programs WHERE role = lower(me.role);
  SELECT * INTO p FROM public.referral_progress(me.id, lower(me.role));
  RETURN jsonb_build_object(
    'code', me.referral_code,
    'role', lower(me.role),
    'program', to_jsonb(prog),
    -- Can still add a code: not referred yet and nothing completed
    'can_apply', NOT EXISTS (SELECT 1 FROM public.referrals WHERE referred_id = me.id) AND p.orders = 0 AND p.rider_requests = 0,
    'referred_by', (SELECT split_part(COALESCE(NULLIF(trim(x.name), ''), 'Someone'), ' ', 1)
                    FROM public.referrals rf JOIN public.profiles x ON x.id = rf.referrer_id WHERE rf.referred_id = me.id)
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.my_referrals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_referrals() TO authenticated;

-- ===================================================================
-- 6. Admin
-- ===================================================================
CREATE OR REPLACE FUNCTION public.admin_save_referral_program(
  p_role TEXT, p_reward_amount NUMERIC, p_orders_needed INTEGER,
  p_rider_requests_needed INTEGER DEFAULT NULL, p_is_active BOOLEAN DEFAULT true
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old JSONB;
BEGIN
  PERFORM public.require_admin();
  SELECT to_jsonb(x) INTO v_old FROM public.referral_programs x WHERE role = p_role;
  IF v_old IS NULL THEN
    RAISE EXCEPTION 'Choose customers, vendors or riders';
  END IF;
  IF p_reward_amount IS NULL OR p_reward_amount <= 0 OR p_reward_amount > 1000000 THEN
    RAISE EXCEPTION 'Enter a reward up to ₦1,000,000';
  END IF;
  IF p_orders_needed IS NULL OR p_orders_needed < 1 OR p_orders_needed > 1000 THEN
    RAISE EXCEPTION 'Enter a goal from 1 to 1,000';
  END IF;
  IF p_rider_requests_needed IS NOT NULL AND (p_role <> 'vendor' OR p_rider_requests_needed < 1 OR p_rider_requests_needed > 1000) THEN
    RAISE EXCEPTION 'Rider requests are a goal for vendors only, from 1 to 1,000';
  END IF;
  UPDATE public.referral_programs
  SET reward_amount = p_reward_amount, orders_needed = p_orders_needed, rider_requests_needed = p_rider_requests_needed,
      is_active = COALESCE(p_is_active, true), updated_at = now()
  WHERE role = p_role;
  PERFORM public.log_admin_action('update_referral_program', 'referral_program', p_role, v_old,
    (SELECT to_jsonb(x) FROM public.referral_programs x WHERE role = p_role));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_save_referral_program(TEXT, NUMERIC, INTEGER, INTEGER, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_referral_program(TEXT, NUMERIC, INTEGER, INTEGER, BOOLEAN) TO authenticated;

-- Every referral, newest first, with progress
CREATE OR REPLACE FUNCTION public.admin_referrals(
  p_role TEXT DEFAULT NULL, p_status TEXT DEFAULT NULL, p_limit INTEGER DEFAULT 10, p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID, created_at TIMESTAMPTZ, role TEXT, code TEXT, status TEXT, reward_amount NUMERIC, rewarded_at TIMESTAMPTZ,
  referrer_id UUID, referrer_name TEXT, referrer_email TEXT, referred_id UUID, referred_name TEXT, referred_email TEXT,
  orders INTEGER, rider_requests INTEGER, total_count BIGINT, total_rewarded BIGINT, total_paid NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin();
  RETURN QUERY
  WITH f AS (
    SELECT rf.* FROM public.referrals rf
    WHERE (p_role IS NULL OR rf.role = p_role) AND (p_status IS NULL OR rf.status = p_status)
  ), t AS (
    SELECT count(*) AS c, count(*) FILTER (WHERE f.status = 'rewarded') AS rewarded,
           COALESCE(sum(f.reward_amount) FILTER (WHERE f.status = 'rewarded'), 0) AS paid FROM f
  )
  SELECT f.id, f.created_at, f.role, f.code, f.status, f.reward_amount, f.rewarded_at,
         f.referrer_id, a.name, a.email, f.referred_id, b.name, b.email, pr.orders, pr.rider_requests, t.c, t.rewarded, t.paid
  FROM f
  LEFT JOIN public.profiles a ON a.id = f.referrer_id
  LEFT JOIN public.profiles b ON b.id = f.referred_id
  CROSS JOIN LATERAL public.referral_progress(f.referred_id, f.role) pr
  CROSS JOIN t
  ORDER BY f.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_referrals(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_referrals(TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

-- Money -> Rewards also lists referral rewards (reward_id is NULL for those)
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
    SELECT g.id, g.earned_at, g.user_id, g.reward_id, x.title AS title, public.reward_prize_text(x) AS prize,
           g.wallet_amount, g.promotion_id
    FROM public.reward_grants g
    JOIN public.rewards x ON x.id = g.reward_id
    WHERE (p_from IS NULL OR g.earned_at >= p_from) AND (p_to IS NULL OR g.earned_at < p_to)
    UNION ALL
    SELECT rf.id, rf.rewarded_at, rf.referrer_id, NULL::uuid,
           'Referral: ' || split_part(COALESCE(NULLIF(trim(b.name), ''), 'Someone'), ' ', 1) || ' joined',
           '₦' || to_char(rf.reward_amount, 'FM999,999,990') || ' referral reward',
           rf.reward_amount, NULL::uuid
    FROM public.referrals rf
    LEFT JOIN public.profiles b ON b.id = rf.referred_id
    WHERE rf.status = 'rewarded'
      AND (p_from IS NULL OR rf.rewarded_at >= p_from) AND (p_to IS NULL OR rf.rewarded_at < p_to)
  ), totals AS (
    SELECT count(*) AS c, COALESCE(sum(g.wallet_amount), 0) AS paid, count(g.promotion_id) AS promos FROM g
  )
  SELECT g.id, g.earned_at, g.user_id, p.name, lower(p.role), g.reward_id, g.title, g.prize,
         g.wallet_amount, g.promotion_id, t.c, t.paid, t.promos
  FROM g
  LEFT JOIN public.profiles p ON p.id = g.user_id
  CROSS JOIN totals t
  ORDER BY g.earned_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- ===================================================================
-- 7. Codes entered at sign-up, and nobody edits their own code
-- ===================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role TEXT := lower(COALESCE(NEW.raw_user_meta_data ->> 'role', 'customer'));
BEGIN
  IF v_role NOT IN ('customer', 'vendor', 'rider') THEN
    v_role := 'customer';
  END IF;

  INSERT INTO public.profiles (id, email, name, role, email_verified_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'name', ''), split_part(NEW.email, '@', 1)),
    v_role,
    NEW.email_confirmed_at
  )
  ON CONFLICT (id) DO NOTHING;

  -- A referral code entered at sign-up (checked by the form first; a bad one is skipped)
  IF NULLIF(trim(NEW.raw_user_meta_data ->> 'referral_code'), '') IS NOT NULL THEN
    BEGIN
      PERFORM public.link_referral(NEW.id, NEW.raw_user_meta_data ->> 'referral_code');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'referral code at sign-up for %: %', NEW.id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.protect_profile_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin()
     AND COALESCE(current_setting('cydex.profile_sync', true), 'off') <> 'on' THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.verified IS DISTINCT FROM OLD.verified
       OR NEW.referral_code IS DISTINCT FROM OLD.referral_code THEN
      RAISE EXCEPTION 'Only admins can change role, status, verification or referral code';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
