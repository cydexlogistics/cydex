-- ===================================================================
-- Admin -> Metrics
--
-- 1. app_sessions: one row each time a signed-in customer, rider or vendor
--    opens the app. The app calls track_app_open() when it starts, when it
--    comes back to the foreground, and every few minutes while it's open.
--    Within 30 minutes of the last call the same session is kept going
--    (last_seen_at moves); after a 30-minute gap it's a new open.
--    Admins aren't tracked. The role is read from the profile, not sent by
--    the app.
-- 2. Indexes on orders for the timestamps the metrics filter on.
-- 3. admin_metrics(): every figure on the Metrics page, worked out here.
--    Only admins can call it.
--
-- Which order timestamps are used:
--   rider accepted   orders.rider_assigned_at  (set when a rider accepts, or
--                    when an admin assigns one; cleared if an admin unassigns)
--   order ready      orders.ready_for_pickup_at (set when the vendor marks it ready)
--   vendor accepted  orders.vendor_accepted_at
--   delivered        orders.delivered_at
-- ===================================================================

-- ===================================================================
-- 1. App opens
-- ===================================================================

CREATE TABLE IF NOT EXISTS public.app_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('customer', 'rider', 'vendor')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 'installed' (home-screen app) or 'browser'
  platform TEXT CHECK (platform IN ('installed', 'browser'))
);

CREATE INDEX IF NOT EXISTS app_sessions_started_at_idx ON public.app_sessions (started_at, role);
CREATE INDEX IF NOT EXISTS app_sessions_user_started_idx ON public.app_sessions (user_id, started_at DESC);

-- Only reached through the functions below
ALTER TABLE public.app_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_sessions FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.track_app_open(p_platform TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_role TEXT;
  v_platform TEXT := CASE WHEN p_platform IN ('installed', 'browser') THEN p_platform END;
  v_session UUID;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  SELECT lower(role) INTO v_role FROM public.profiles WHERE id = v_uid;
  IF v_role IS NULL OR v_role NOT IN ('customer', 'rider', 'vendor') THEN RETURN; END IF;

  -- Still the same open if we heard from them in the last 30 minutes
  SELECT id INTO v_session FROM public.app_sessions
  WHERE user_id = v_uid AND last_seen_at > now() - interval '30 minutes'
  ORDER BY started_at DESC
  LIMIT 1;

  IF v_session IS NOT NULL THEN
    UPDATE public.app_sessions SET last_seen_at = now() WHERE id = v_session;
  ELSE
    INSERT INTO public.app_sessions (user_id, role, platform) VALUES (v_uid, v_role, v_platform);
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.track_app_open(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.track_app_open(TEXT) TO authenticated;

-- ===================================================================
-- 2. Indexes for the metrics
-- ===================================================================

CREATE INDEX IF NOT EXISTS orders_created_at_idx ON public.orders (created_at);
CREATE INDEX IF NOT EXISTS orders_vendor_accepted_at_idx ON public.orders (vendor_accepted_at) WHERE vendor_accepted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_rider_assigned_at_idx ON public.orders (rider_assigned_at) WHERE rider_assigned_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_delivered_at_idx ON public.orders (delivered_at) WHERE delivered_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_ready_for_pickup_at_idx ON public.orders (ready_for_pickup_at) WHERE ready_for_pickup_at IS NOT NULL;

-- ===================================================================
-- 3. Metrics
--
-- Windows are [start, end); start NULL = from the beginning. "As at the end
-- of the period" means at the earlier of the period's end and now.
-- ===================================================================

-- "Active" for churn and the active-vs-onboarded cards
-- Customers: placed at least 1 paid order (Cydex orders or Express; refunded
-- orders count, they were paid), by when it was placed
CREATE OR REPLACE FUNCTION public.metrics_paying_customers(p_start TIMESTAMPTZ, p_end TIMESTAMPTZ)
RETURNS TABLE (id UUID)
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT DISTINCT o.customer_id FROM public.orders o
  WHERE o.customer_id IS NOT NULL
    AND o.order_type IN ('customer', 'express')
    AND o.payment_status IN ('paid', 'refunded')
    AND (p_start IS NULL OR o.created_at >= p_start) AND o.created_at < p_end;
$$;

-- Vendors: accepted at least 1 customer order. Rider requests are left out:
-- they're marked accepted automatically when the vendor creates them.
CREATE OR REPLACE FUNCTION public.metrics_accepting_vendors(p_start TIMESTAMPTZ, p_end TIMESTAMPTZ)
RETURNS TABLE (id UUID)
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT DISTINCT o.vendor_id FROM public.orders o
  WHERE o.vendor_id IS NOT NULL
    AND o.order_type = 'customer'
    AND o.vendor_accepted_at IS NOT NULL
    AND (p_start IS NULL OR o.vendor_accepted_at >= p_start) AND o.vendor_accepted_at < p_end;
$$;

-- Riders (churn): delivered at least 1 order
CREATE OR REPLACE FUNCTION public.metrics_delivering_riders(p_start TIMESTAMPTZ, p_end TIMESTAMPTZ)
RETURNS TABLE (id UUID)
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT DISTINCT o.rider_id FROM public.orders o
  WHERE o.rider_id IS NOT NULL
    AND o.status = 'delivered'
    AND o.delivered_at IS NOT NULL
    AND (p_start IS NULL OR o.delivered_at >= p_start) AND o.delivered_at < p_end;
$$;

-- Onboarded users as at a moment, with the moment they were onboarded.
--   customers: registered, not suspended (deleted accounts are removed from
--              profiles, so they're never counted)
--   vendors:   can trade: verified, unverified (no licence, allowed to trade),
--              or pending a licence review while already trading
--   riders:    verified
-- verifications only keeps the current status, so this uses today's status
-- with the date it was reached.
CREATE OR REPLACE FUNCTION public.metrics_onboarded(p_asof TIMESTAMPTZ)
RETURNS TABLE (id UUID, role TEXT, onboarded_at TIMESTAMPTZ, created_at TIMESTAMPTZ)
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT p.id, 'customer', p.created_at, p.created_at
  FROM public.profiles p
  WHERE lower(p.role) = 'customer'
    AND coalesce(p.status, 'active') <> 'suspended'
    AND p.created_at < p_asof
  UNION ALL
  SELECT p.id, 'vendor', x.onboarded_at, p.created_at
  FROM public.verifications v
  JOIN public.profiles p ON p.id = v.profile_id
  CROSS JOIN LATERAL (SELECT CASE WHEN v.status = 'verified'
    THEN coalesce(v.reviewed_at, v.submitted_at, v.created_at)
    ELSE coalesce(v.submitted_at, v.created_at) END AS onboarded_at) x
  WHERE v.role = 'vendor'
    AND (v.status IN ('verified', 'unverified') OR (v.status = 'pending' AND v.access_while_pending))
    AND x.onboarded_at < p_asof
  UNION ALL
  SELECT p.id, 'rider', coalesce(v.reviewed_at, v.submitted_at, v.created_at), p.created_at
  FROM public.verifications v
  JOIN public.profiles p ON p.id = v.profile_id
  WHERE v.role = 'rider' AND v.status = 'verified'
    AND coalesce(v.reviewed_at, v.submitted_at, v.created_at) < p_asof;
$$;

-- Every figure for one window. p_prev_* is the window before it (for churn);
-- NULL when there isn't one (all time).
CREATE OR REPLACE FUNCTION public.metrics_window(
  p_start TIMESTAMPTZ,
  p_end TIMESTAMPTZ,
  p_prev_start TIMESTAMPTZ,
  p_prev_end TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_asof TIMESTAMPTZ := least(p_end, now());
  -- Dormant: no app open in the 14 days before the end of the period (fixed, whatever the filter)
  v_dormant_before TIMESTAMPTZ := least(p_end, now()) - interval '14 days';
  v_opens JSONB;
  v_hourly JSONB;
  v_peak JSONB;
  v_total_customers INT;
  v_dormant JSONB;
  v_onboarded JSONB;
  v_churn JSONB;
  v_fulfil JSONB;
  v_delivery JSONB;
  v_prep JSONB;
  v_active JSONB;
BEGIN
  -- Opens by role, and by hour of the day in Nigeria
  WITH roles(role) AS (VALUES ('customer'), ('rider'), ('vendor')),
  counts AS (
    SELECT s.role, extract(hour FROM s.started_at AT TIME ZONE 'Africa/Lagos')::INT AS hour, count(*)::INT AS n
    FROM public.app_sessions s
    WHERE (p_start IS NULL OR s.started_at >= p_start) AND s.started_at < p_end
    GROUP BY 1, 2
  ),
  grid AS (
    SELECT r.role, h.hour, coalesce(c.n, 0) AS n
    FROM roles r CROSS JOIN generate_series(0, 23) AS h(hour)
    LEFT JOIN counts c ON c.role = r.role AND c.hour = h.hour
  ),
  peaks AS (
    -- Busiest hour; on a tie, the earliest. None if there were no opens.
    SELECT DISTINCT ON (role) role, hour, n FROM grid WHERE n > 0 ORDER BY role, n DESC, hour
  )
  SELECT
    (SELECT jsonb_object_agg(r.role, (SELECT coalesce(sum(g.n), 0)::INT FROM grid g WHERE g.role = r.role)) FROM roles r),
    (SELECT jsonb_object_agg(r.role, (SELECT jsonb_agg(g.n ORDER BY g.hour) FROM grid g WHERE g.role = r.role)) FROM roles r),
    (SELECT jsonb_object_agg(r.role, (SELECT jsonb_build_object('hour', p.hour, 'count', p.n) FROM peaks p WHERE p.role = r.role)) FROM roles r)
  INTO v_opens, v_hourly, v_peak;

  -- Onboarded users as at the end, how many are dormant, and registered customers
  WITH u AS (SELECT * FROM public.metrics_onboarded(v_asof)),
  roles(role) AS (VALUES ('customer'), ('rider'), ('vendor')),
  seen AS (
    SELECT u.id, u.role,
      -- Last app open; for someone with no opens (e.g. from before tracking
      -- started), their last order, or else when they signed up
      coalesce(ls.last_open, greatest(lo.last_order, u.created_at)) AS last_seen
    FROM u
    LEFT JOIN LATERAL (
      SELECT max(s.started_at) AS last_open FROM public.app_sessions s
      WHERE s.user_id = u.id AND s.started_at < v_asof
    ) ls ON true
    LEFT JOIN LATERAL (
      SELECT max(t) AS last_order FROM (
        SELECT o.created_at AS t FROM public.orders o
          WHERE u.role = 'customer' AND o.customer_id = u.id AND o.created_at < v_asof
        UNION ALL
        SELECT o.vendor_accepted_at FROM public.orders o
          WHERE u.role = 'vendor' AND o.vendor_id = u.id AND o.vendor_accepted_at < v_asof
        UNION ALL
        SELECT o.rider_assigned_at FROM public.orders o
          WHERE u.role = 'rider' AND o.rider_id = u.id AND o.rider_assigned_at < v_asof
        UNION ALL
        SELECT o.delivered_at FROM public.orders o
          WHERE u.role = 'rider' AND o.rider_id = u.id AND o.delivered_at < v_asof
      ) t
    ) lo ON true
    -- Only people onboarded more than 14 days before the end
    WHERE u.onboarded_at < v_dormant_before
  )
  SELECT
    (SELECT count(*)::INT FROM u WHERE u.role = 'customer'),
    (SELECT jsonb_object_agg(r.role, (SELECT count(*)::INT FROM u WHERE u.role = r.role)) FROM roles r),
    (SELECT jsonb_object_agg(r.role, (SELECT count(*)::INT FROM seen s WHERE s.role = r.role AND s.last_seen < v_dormant_before)) FROM roles r)
  INTO v_total_customers, v_onboarded, v_dormant;

  -- Churn: active in the previous window but not in this one, out of those
  -- active in the previous window. 0 when nobody was active before.
  WITH c AS (
    SELECT 'customer' AS role,
      (SELECT count(*) FROM public.metrics_paying_customers(p_prev_start, p_prev_end) a
        WHERE p_prev_end IS NOT NULL AND a.id NOT IN (SELECT id FROM public.metrics_paying_customers(p_start, p_end))) AS churned,
      (SELECT count(*) FROM public.metrics_paying_customers(p_prev_start, p_prev_end) WHERE p_prev_end IS NOT NULL) AS base
    UNION ALL
    SELECT 'rider',
      (SELECT count(*) FROM public.metrics_delivering_riders(p_prev_start, p_prev_end) a
        WHERE p_prev_end IS NOT NULL AND a.id NOT IN (SELECT id FROM public.metrics_delivering_riders(p_start, p_end))),
      (SELECT count(*) FROM public.metrics_delivering_riders(p_prev_start, p_prev_end) WHERE p_prev_end IS NOT NULL)
    UNION ALL
    SELECT 'vendor',
      (SELECT count(*) FROM public.metrics_accepting_vendors(p_prev_start, p_prev_end) a
        WHERE p_prev_end IS NOT NULL AND a.id NOT IN (SELECT id FROM public.metrics_accepting_vendors(p_start, p_end))),
      (SELECT count(*) FROM public.metrics_accepting_vendors(p_prev_start, p_prev_end) WHERE p_prev_end IS NOT NULL)
  )
  SELECT jsonb_object_agg(role, jsonb_build_object(
    'churned', churned, 'base', base,
    'rate', CASE WHEN base > 0 THEN round(100.0 * churned / base, 2) ELSE 0 END))
  INTO v_churn FROM c;

  -- Fulfilment
  --   customer: orders placed (paid) in the window that were delivered
  --   vendor:   customer orders accepted in the window that were delivered
  --   rider:    orders a rider accepted in the window that were delivered
  WITH f AS (
    SELECT 'customer' AS side, count(*) AS n, count(*) FILTER (WHERE o.status = 'delivered') AS done
    FROM public.orders o
    WHERE o.order_type IN ('customer', 'express') AND o.payment_status IN ('paid', 'refunded')
      AND (p_start IS NULL OR o.created_at >= p_start) AND o.created_at < p_end
    UNION ALL
    SELECT 'vendor', count(*), count(*) FILTER (WHERE o.status = 'delivered')
    FROM public.orders o
    WHERE o.order_type = 'customer' AND o.vendor_id IS NOT NULL AND o.vendor_accepted_at IS NOT NULL
      AND (p_start IS NULL OR o.vendor_accepted_at >= p_start) AND o.vendor_accepted_at < p_end
    UNION ALL
    SELECT 'rider', count(*), count(*) FILTER (WHERE o.status = 'delivered')
    FROM public.orders o
    WHERE o.rider_id IS NOT NULL AND o.rider_assigned_at IS NOT NULL
      AND (p_start IS NULL OR o.rider_assigned_at >= p_start) AND o.rider_assigned_at < p_end
  )
  SELECT jsonb_object_agg(side, jsonb_build_object(
    'orders', n, 'completed', done,
    'rate', CASE WHEN n > 0 THEN round(100.0 * done / n, 2) END))
  INTO v_fulfil FROM f;

  -- Average delivery time: rider accepted -> delivered, for orders delivered in the window
  SELECT jsonb_build_object(
    'seconds', round(avg(extract(epoch FROM o.delivered_at - o.rider_assigned_at))::NUMERIC, 1),
    'orders', count(*))
  INTO v_delivery
  FROM public.orders o
  WHERE o.status = 'delivered' AND o.delivered_at IS NOT NULL AND o.rider_assigned_at IS NOT NULL
    AND o.delivered_at >= o.rider_assigned_at
    AND (p_start IS NULL OR o.delivered_at >= p_start) AND o.delivered_at < p_end;

  -- Average preparation time: vendor accepted -> ready, for customer orders
  -- marked ready in the window (rider requests and Express have no preparation)
  SELECT jsonb_build_object(
    'seconds', round(avg(extract(epoch FROM o.ready_for_pickup_at - o.vendor_accepted_at))::NUMERIC, 1),
    'orders', count(*))
  INTO v_prep
  FROM public.orders o
  WHERE o.order_type = 'customer' AND o.ready_for_pickup_at IS NOT NULL AND o.vendor_accepted_at IS NOT NULL
    AND o.ready_for_pickup_at >= o.vendor_accepted_at
    AND (p_start IS NULL OR o.ready_for_pickup_at >= p_start) AND o.ready_for_pickup_at < p_end;

  -- Active vs onboarded
  --   customers: at least 1 paid order (onboarded = registered customers)
  --   vendors:   at least 1 order accepted
  --   riders:    at least 1 order accepted or delivered
  WITH a AS (
    SELECT 'customer' AS role, (SELECT count(*) FROM public.metrics_paying_customers(p_start, p_end)) AS n
    UNION ALL
    SELECT 'vendor', (SELECT count(*) FROM public.metrics_accepting_vendors(p_start, p_end))
    UNION ALL
    SELECT 'rider', (
      SELECT count(DISTINCT o.rider_id) FROM public.orders o
      WHERE o.rider_id IS NOT NULL AND (
        (o.rider_assigned_at IS NOT NULL AND (p_start IS NULL OR o.rider_assigned_at >= p_start) AND o.rider_assigned_at < p_end)
        OR (o.status = 'delivered' AND o.delivered_at IS NOT NULL
            AND (p_start IS NULL OR o.delivered_at >= p_start) AND o.delivered_at < p_end)))
  )
  SELECT jsonb_object_agg(a.role, jsonb_build_object(
    'active', a.n,
    'onboarded', (v_onboarded ->> a.role)::INT,
    'rate', CASE WHEN (v_onboarded ->> a.role)::INT > 0 THEN round(100.0 * a.n / (v_onboarded ->> a.role)::INT, 2) END))
  INTO v_active FROM a;

  RETURN jsonb_build_object(
    'start', p_start,
    'end', p_end,
    'as_of', v_asof,
    'opens', v_opens,
    'hourly', v_hourly,
    'peak', v_peak,
    'total_customers', v_total_customers,
    'dormant', v_dormant,
    'churn', v_churn,
    'fulfilment', v_fulfil,
    'delivery_time', v_delivery,
    'prep_time', v_prep,
    'active', v_active
  );
END;
$$;

-- Internal: only reached through admin_metrics
REVOKE EXECUTE ON FUNCTION public.metrics_paying_customers(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.metrics_accepting_vendors(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.metrics_delivering_riders(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.metrics_onboarded(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.metrics_window(TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;

-- The Metrics page. Windows come from metricsRanges() in src/lib/metricsPeriod.ts:
--   current  [p_start, p_end)             p_start NULL = all time
--   previous [p_prev_start, p_prev_end)   what it's compared with; NULL = no comparison
--   prior    [p_prior_start, p_prior_end) the window before previous (for the previous window's churn)
-- Returns { current, previous, peak_comparison, vendors, riders, tracking_since }
CREATE OR REPLACE FUNCTION public.admin_metrics(
  p_end TIMESTAMPTZ,
  p_start TIMESTAMPTZ DEFAULT NULL,
  p_prev_start TIMESTAMPTZ DEFAULT NULL,
  p_prev_end TIMESTAMPTZ DEFAULT NULL,
  p_prior_start TIMESTAMPTZ DEFAULT NULL,
  p_prior_end TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current JSONB;
  v_previous JSONB;
  v_peaks JSONB;
  v_vendors JSONB;
  v_riders JSONB;
BEGIN
  PERFORM public.require_admin();

  IF p_end IS NULL THEN RAISE EXCEPTION 'The end of the period is required'; END IF;
  IF p_start IS NOT NULL AND p_start >= p_end THEN RAISE EXCEPTION 'The period must start before it ends'; END IF;
  IF (p_prev_start IS NULL) <> (p_prev_end IS NULL) THEN RAISE EXCEPTION 'The previous period needs a start and an end'; END IF;

  v_current := public.metrics_window(p_start, p_end, p_prev_start, p_prev_end);
  IF p_prev_end IS NOT NULL THEN
    v_previous := public.metrics_window(p_prev_start, p_prev_end, p_prior_start, p_prior_end);
  END IF;

  -- Peak hour badge: opens in this period's busiest hour vs the same hour last period
  SELECT jsonb_object_agg(r.role, CASE WHEN jsonb_typeof(v_current -> 'peak' -> r.role) IS DISTINCT FROM 'object' THEN NULL ELSE jsonb_build_object(
    'hour', (v_current -> 'peak' -> r.role ->> 'hour')::INT,
    'current', (v_current -> 'peak' -> r.role ->> 'count')::INT,
    'previous', CASE WHEN v_previous IS NULL THEN NULL
      ELSE (v_previous -> 'hourly' -> r.role ->> (v_current -> 'peak' -> r.role ->> 'hour')::INT)::INT END
  ) END)
  INTO v_peaks
  FROM (VALUES ('customer'), ('rider'), ('vendor')) AS r(role);

  -- Fulfilment per vendor (customer orders they accepted in the period)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', x.vendor_id, 'name', coalesce(p.name, 'Deleted vendor'),
    'orders', x.n, 'completed', x.done, 'rate', round(100.0 * x.done / x.n, 2)
  ) ORDER BY x.n DESC, p.name), '[]'::JSONB)
  INTO v_vendors
  FROM (
    SELECT o.vendor_id, count(*) AS n, count(*) FILTER (WHERE o.status = 'delivered') AS done
    FROM public.orders o
    WHERE o.order_type = 'customer' AND o.vendor_id IS NOT NULL AND o.vendor_accepted_at IS NOT NULL
      AND (p_start IS NULL OR o.vendor_accepted_at >= p_start) AND o.vendor_accepted_at < p_end
    GROUP BY o.vendor_id
  ) x
  LEFT JOIN public.profiles p ON p.id = x.vendor_id;

  -- Fulfilment per rider (orders they accepted in the period)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', x.rider_id, 'name', coalesce(p.name, 'Deleted rider'),
    'orders', x.n, 'completed', x.done, 'rate', round(100.0 * x.done / x.n, 2)
  ) ORDER BY x.n DESC, p.name), '[]'::JSONB)
  INTO v_riders
  FROM (
    SELECT o.rider_id, count(*) AS n, count(*) FILTER (WHERE o.status = 'delivered') AS done
    FROM public.orders o
    WHERE o.rider_id IS NOT NULL AND o.rider_assigned_at IS NOT NULL
      AND (p_start IS NULL OR o.rider_assigned_at >= p_start) AND o.rider_assigned_at < p_end
    GROUP BY o.rider_id
  ) x
  LEFT JOIN public.profiles p ON p.id = x.rider_id;

  RETURN jsonb_build_object(
    'current', v_current,
    'previous', v_previous,
    'peak_comparison', v_peaks,
    'vendors', v_vendors,
    'riders', v_riders,
    'tracking_since', (SELECT min(started_at) FROM public.app_sessions)
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_metrics(TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_metrics(TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
